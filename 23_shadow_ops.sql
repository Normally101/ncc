-- ============================================================
-- 23_shadow_ops.sql — Chauffeur Empire
-- Espansione 3: Agenzia Ombra (Spionaggio/Sabotaggio PvP)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shadow_ops (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    attacker_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    op_type         TEXT    NOT NULL,
    -- op_type: spy_fleet | spy_finances | bribe_driver | sabotage_vehicle |
    --          buy_off_client | fake_review | hijack_client
    op_cost         BIGINT  NOT NULL DEFAULT 0,
    success         BOOLEAN DEFAULT NULL,  -- NULL = pending/in progress
    result_data     JSONB   DEFAULT '{}',
    detected        BOOLEAN DEFAULT FALSE,
    cooldown_until  TIMESTAMPTZ DEFAULT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_shadow_ops_attacker ON public.shadow_ops(attacker_id);
CREATE INDEX IF NOT EXISTS idx_shadow_ops_target   ON public.shadow_ops(target_id);
CREATE INDEX IF NOT EXISTS idx_shadow_ops_created  ON public.shadow_ops(created_at DESC);

-- Contatore difesa: aumenta con ogni op subita, riduce il danno futuro
CREATE TABLE IF NOT EXISTS public.shadow_defense (
    user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    defense_level   INT     DEFAULT 0,    -- 0..5
    intel_spent     BIGINT  DEFAULT 0,
    ops_received    INT     DEFAULT 0,
    last_attacked   TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE public.shadow_ops     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_defense ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shadow_ops_own_read"
      ON public.shadow_ops FOR SELECT
      USING (auth.uid() = attacker_id OR auth.uid() = target_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "shadow_defense_own"
      ON public.shadow_defense FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Esegui operazione ombra
CREATE OR REPLACE FUNCTION public.rpc_execute_shadow_op(
    v_target_id  UUID,
    v_op_type    TEXT,
    v_op_cost    BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_cash          BIGINT;
    v_def_level     INT := 0;
    v_success_prob  NUMERIC;
    v_success       BOOLEAN;
    v_detected      BOOLEAN := FALSE;
    v_result        JSONB   := '{}';
    v_op_id         UUID;
    v_cooldown_h    INT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_uid = v_target_id THEN RAISE EXCEPTION 'Non puoi attaccare te stesso'; END IF;

    -- Verifica cooldown (una sola op ogni 6h per lo stesso target)
    IF EXISTS (
        SELECT 1 FROM public.shadow_ops
        WHERE attacker_id = v_uid AND target_id = v_target_id
          AND cooldown_until > NOW()
    ) THEN
        RAISE EXCEPTION 'Operazione in cooldown per questo target';
    END IF;

    -- Scala il costo
    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_op_cost THEN
        RAISE EXCEPTION 'Fondi insufficienti per l''operazione';
    END IF;
    UPDATE public.companies SET cash = cash - v_op_cost, liquid_assets = GREATEST(0, liquid_assets - v_op_cost) WHERE user_id = v_uid;

    -- Livello difesa del target
    SELECT COALESCE(defense_level, 0) INTO v_def_level FROM public.shadow_defense WHERE user_id = v_target_id;

    -- Probabilità successo per tipo
    v_success_prob := CASE v_op_type
        WHEN 'spy_fleet'        THEN 0.90 - (v_def_level * 0.08)
        WHEN 'spy_finances'     THEN 0.85 - (v_def_level * 0.10)
        WHEN 'bribe_driver'     THEN 0.60 - (v_def_level * 0.08)
        WHEN 'sabotage_vehicle' THEN 0.45 - (v_def_level * 0.07)
        WHEN 'buy_off_client'   THEN 0.70 - (v_def_level * 0.07)
        WHEN 'fake_review'      THEN 0.80 - (v_def_level * 0.06)
        WHEN 'hijack_client'    THEN 0.50 - (v_def_level * 0.09)
        ELSE 0.50
    END;
    v_success_prob := GREATEST(0.05, v_success_prob);

    v_success  := random() < v_success_prob;
    v_detected := (NOT v_success) AND random() < 0.40;

    -- Cooldown: 6h se successo, 12h se fallito (e rilevato)
    v_cooldown_h := CASE WHEN v_success THEN 6 ELSE 12 END;

    -- Effetti per tipo di operazione (solo se successo)
    IF v_success THEN
        CASE v_op_type
            WHEN 'spy_fleet' THEN
                -- Rivelato info fleet del target (conteggio veicoli e tier)
                SELECT jsonb_build_object(
                    'fleet_size', COUNT(*),
                    'top_tier', MAX(tier)
                ) INTO v_result
                FROM public.game_saves gs,
                     LATERAL jsonb_array_elements(gs.save_data->'fleet') AS v(elem)
                WHERE gs.user_id = v_target_id;

            WHEN 'fake_review' THEN
                -- Riduce reputazione del target di 0.1
                UPDATE public.companies
                SET reputation = GREATEST(0.0, reputation - 0.15)
                WHERE user_id = v_target_id;
                v_result := jsonb_build_object('rep_damage', 0.15);

            WHEN 'sabotage_vehicle' THEN
                -- Danno a un veicolo casuale del target (handled client-side notification only)
                -- Segniamo nel result_data, il target vede l'avviso al login
                v_result := jsonb_build_object('sabotaged', true, 'condition_damage', 20);

            ELSE
                v_result := jsonb_build_object('op_type', v_op_type, 'success', true);
        END CASE;
    END IF;

    -- Se rilevato, aumenta difesa del target
    IF v_detected THEN
        INSERT INTO public.shadow_defense (user_id, defense_level, ops_received, last_attacked)
        VALUES (v_target_id, 1, 1, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET ops_received = shadow_defense.ops_received + 1,
            defense_level = LEAST(5, shadow_defense.defense_level + 1),
            last_attacked = NOW();
    ELSE
        INSERT INTO public.shadow_defense (user_id, ops_received, last_attacked)
        VALUES (v_target_id, 1, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET ops_received = shadow_defense.ops_received + 1,
            last_attacked = NOW();
    END IF;

    -- Registra operazione
    INSERT INTO public.shadow_ops (
        attacker_id, target_id, op_type, op_cost, success, result_data, detected,
        cooldown_until, resolved_at
    ) VALUES (
        v_uid, v_target_id, v_op_type, v_op_cost, v_success, v_result, v_detected,
        NOW() + (v_cooldown_h || ' hours')::INTERVAL, NOW()
    ) RETURNING id INTO v_op_id;

    RETURN jsonb_build_object(
        'id',       v_op_id,
        'success',  v_success,
        'detected', v_detected,
        'result',   v_result,
        'op_type',  v_op_type
    );
END;
$$;

-- Storico operazioni ombra dell'utente
CREATE OR REPLACE FUNCTION public.rpc_get_shadow_ops_log()
RETURNS TABLE (
    id          UUID,
    op_type     TEXT,
    success     BOOLEAN,
    detected    BOOLEAN,
    result_data JSONB,
    op_cost     BIGINT,
    created_at  TIMESTAMPTZ,
    is_attacker BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT id, op_type, success, detected, result_data, op_cost, created_at,
           (attacker_id = auth.uid()) AS is_attacker
    FROM public.shadow_ops
    WHERE attacker_id = auth.uid() OR target_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 30;
$$;

-- Lista target disponibili (top player con più reputation)
CREATE OR REPLACE FUNCTION public.rpc_get_shadow_targets()
RETURNS TABLE (
    user_id     UUID,
    company_id  UUID,
    name        TEXT,
    reputation  NUMERIC,
    hq_city     TEXT,
    defense_lvl INT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        c.user_id,
        c.id AS company_id,
        c.company_name AS name,
        c.reputation,
        c.hq_city,
        COALESCE(sd.defense_level, 0) AS defense_lvl
    FROM public.companies c
    LEFT JOIN public.shadow_defense sd ON sd.user_id = c.user_id
    WHERE c.user_id != v_uid
      AND c.reputation > 0.5
    ORDER BY c.reputation DESC
    LIMIT 10;
END;
$$;

-- Investi in difesa
CREATE OR REPLACE FUNCTION public.rpc_upgrade_shadow_defense(v_cost BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_cash  BIGINT;
    v_level INT := 0;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_cost THEN RAISE EXCEPTION 'Fondi insufficienti'; END IF;

    SELECT COALESCE(defense_level, 0) INTO v_level FROM public.shadow_defense WHERE user_id = v_uid;
    IF v_level >= 5 THEN RAISE EXCEPTION 'Difesa già al massimo (5)'; END IF;

    UPDATE public.companies SET cash = cash - v_cost, liquid_assets = GREATEST(0, liquid_assets - v_cost) WHERE user_id = v_uid;

    INSERT INTO public.shadow_defense (user_id, defense_level, intel_spent)
    VALUES (v_uid, 1, v_cost)
    ON CONFLICT (user_id) DO UPDATE
    SET defense_level = LEAST(5, shadow_defense.defense_level + 1),
        intel_spent   = shadow_defense.intel_spent + v_cost;

    RETURN jsonb_build_object('new_level', LEAST(5, v_level + 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_execute_shadow_op(UUID, TEXT, BIGINT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_shadow_ops_log()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_shadow_targets()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_upgrade_shadow_defense(BIGINT)          TO authenticated;
