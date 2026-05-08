-- ═══════════════════════════════════════════════════════════════════════════════
-- 15_sindacato_mechanics.sql
-- Tre meccaniche per i Sindacati:
--   1. Barometro della Collera   — tensione globale + sciopero nazionale 24h
--   2. Consorzi                  — gilde cooperative con bonus flotta
--   3. Ispettorato del Lavoro    — Don Carmine NPC + rischio GdF
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BAROMETRO DELLA COLLERA
-- Tensione globale 0-100. Sale +2/ora (simulata lato server al tick).
-- Ogni €10.000 contribuito a un sindacato = -1 punto tensione.
-- A 100 → Sciopero Nazionale (24h, tutti i redditi ×0.70).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.global_tension (
    id              int          PRIMARY KEY DEFAULT 1,
    tension         numeric(5,2) NOT NULL DEFAULT 0 CHECK (tension >= 0 AND tension <= 100),
    strike_active   boolean      NOT NULL DEFAULT false,
    strike_ends_at  timestamptz,
    last_tick_at    timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO public.global_tension(id) VALUES(1) ON CONFLICT DO NOTHING;

ALTER TABLE public.global_tension ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_tension_read" ON public.global_tension FOR SELECT USING (true);

-- Tick: incrementa tensione in base al tempo trascorso, gestisce ciclo sciopero.
-- Chiamata dal client a ogni login/apertura sessione (max +24 punti per tick).
CREATE OR REPLACE FUNCTION public.rpc_tick_tension()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v              record;
    hours_elapsed  numeric;
    new_tension    numeric;
    strike_started boolean := false;
BEGIN
    SELECT * INTO v FROM public.global_tension WHERE id = 1 FOR UPDATE;

    -- Sciopero terminato → reset parziale
    IF v.strike_active AND v.strike_ends_at IS NOT NULL AND v.strike_ends_at < now() THEN
        UPDATE public.global_tension SET
            tension        = 20,
            strike_active  = false,
            strike_ends_at = null,
            last_tick_at   = now()
        WHERE id = 1;
    ELSE
        -- Tensione sale +2/ora; cappato a +24 per singolo tick
        hours_elapsed := LEAST(12, GREATEST(0, EXTRACT(EPOCH FROM (now() - v.last_tick_at)) / 3600));
        new_tension   := LEAST(100, v.tension + hours_elapsed * 2);

        IF new_tension >= 100 AND NOT v.strike_active THEN
            -- Sciopero Nazionale dichiarato
            UPDATE public.global_tension SET
                tension        = 100,
                strike_active  = true,
                strike_ends_at = now() + INTERVAL '24 hours',
                last_tick_at   = now()
            WHERE id = 1;
            strike_started := true;
        ELSE
            UPDATE public.global_tension SET
                tension      = new_tension,
                last_tick_at = now()
            WHERE id = 1;
        END IF;
    END IF;

    SELECT * INTO v FROM public.global_tension WHERE id = 1;
    RETURN json_build_object(
        'tension',        v.tension,
        'strike_active',  v.strike_active,
        'strike_ends_at', v.strike_ends_at,
        'strike_started', strike_started
    );
END;
$$;

-- Dampen: chiamata dopo contributo a sindacato.  €10.000 = −1 punto tensione.
CREATE OR REPLACE FUNCTION public.rpc_dampen_tension(v_amount bigint)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    reduction   numeric;
    new_tension numeric;
BEGIN
    reduction := FLOOR(v_amount::numeric / 10000);
    IF reduction < 1 THEN
        SELECT tension INTO new_tension FROM public.global_tension WHERE id = 1;
        RETURN COALESCE(new_tension, 0);
    END IF;
    UPDATE public.global_tension
    SET tension = GREATEST(0, tension - reduction)
    WHERE id = 1
    RETURNING tension INTO new_tension;
    RETURN COALESCE(new_tension, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_tick_tension()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dampen_tension(bigint) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONSORZI (gilde cooperative)
-- Max 8 membri.  Benefici: ≥3 → −5% carburante,  ≥5 → +8% redditi per corsa.
-- Treasury condiviso (contributi volontari — uso futuro).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consorzi (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text        NOT NULL,
    leader_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description     text        NOT NULL DEFAULT '',
    max_members     int         NOT NULL DEFAULT 8,
    treasury        bigint      NOT NULL DEFAULT 0 CHECK (treasury >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consorzio_members (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    consorzio_id    uuid        NOT NULL REFERENCES public.consorzi(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name    text        NOT NULL DEFAULT '',
    role            text        NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (consorzio_id, user_id)
);

ALTER TABLE public.consorzi          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consorzio_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consorzi_read_all"          ON public.consorzi          FOR SELECT USING (true);
CREATE POLICY "consorzio_members_read_all" ON public.consorzio_members FOR SELECT USING (true);

-- Crea consorzio
CREATE OR REPLACE FUNCTION public.rpc_create_consorzio(v_name text, v_description text DEFAULT '')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid  uuid := auth.uid();
    new_id uuid;
    v_co   text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF length(trim(v_name)) < 2 THEN RAISE EXCEPTION 'Nome troppo corto (min 2 caratteri)'; END IF;
    IF EXISTS (SELECT 1 FROM public.consorzio_members WHERE user_id = v_uid) THEN
        RAISE EXCEPTION 'Sei già membro di un consorzio';
    END IF;
    SELECT COALESCE(game_state->>'companyName', 'Azienda') INTO v_co
    FROM public.game_saves WHERE user_id = v_uid AND slot_index = 0;

    INSERT INTO public.consorzi(name, leader_user_id, description)
    VALUES (v_name, v_uid, v_description)
    RETURNING id INTO new_id;

    INSERT INTO public.consorzio_members(consorzio_id, user_id, company_name, role)
    VALUES (new_id, v_uid, COALESCE(v_co, 'Azienda'), 'leader');

    RETURN json_build_object('id', new_id, 'name', v_name);
END;
$$;

-- Unisciti a un consorzio
CREATE OR REPLACE FUNCTION public.rpc_join_consorzio(v_consorzio_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_c   record;
    v_co  text;
    cnt   int;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF EXISTS (SELECT 1 FROM public.consorzio_members WHERE user_id = v_uid) THEN
        RAISE EXCEPTION 'Sei già membro di un consorzio';
    END IF;
    SELECT * INTO v_c FROM public.consorzi WHERE id = v_consorzio_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consorzio non trovato'; END IF;
    SELECT COUNT(*) INTO cnt FROM public.consorzio_members WHERE consorzio_id = v_consorzio_id;
    IF cnt >= v_c.max_members THEN
        RAISE EXCEPTION 'Consorzio pieno (%/% posti)', cnt, v_c.max_members;
    END IF;
    SELECT COALESCE(game_state->>'companyName', 'Azienda') INTO v_co
    FROM public.game_saves WHERE user_id = v_uid AND slot_index = 0;

    INSERT INTO public.consorzio_members(consorzio_id, user_id, company_name, role)
    VALUES (v_consorzio_id, v_uid, COALESCE(v_co, 'Azienda'), 'member');

    RETURN json_build_object('consorzio_id', v_consorzio_id, 'name', v_c.name);
END;
$$;

-- Esci / sciogli
CREATE OR REPLACE FUNCTION public.rpc_leave_consorzio(v_consorzio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid  uuid := auth.uid();
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.consorzio_members
    WHERE consorzio_id = v_consorzio_id AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Non sei membro di questo consorzio'; END IF;

    DELETE FROM public.consorzio_members WHERE consorzio_id = v_consorzio_id AND user_id = v_uid;
    IF v_role = 'leader' THEN
        DELETE FROM public.consorzi WHERE id = v_consorzio_id;
    END IF;
END;
$$;

-- Contribuisci alla cassa del consorzio
CREATE OR REPLACE FUNCTION public.rpc_contribute_consorzio(v_consorzio_id uuid, v_amount bigint)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_cash     bigint;
    v_new_cash bigint;
    v_treasury bigint;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.consorzio_members
        WHERE consorzio_id = v_consorzio_id AND user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'Non sei membro di questo consorzio';
    END IF;
    v_cash := public._get_player_cash(v_uid);
    IF v_cash < v_amount THEN
        RAISE EXCEPTION 'Fondi insufficienti (hai €%, servono €%)', v_cash, v_amount;
    END IF;
    v_new_cash := public._add_player_cash(v_uid, -v_amount);
    UPDATE public.consorzi
    SET treasury = treasury + v_amount, updated_at = now()
    WHERE id = v_consorzio_id
    RETURNING treasury INTO v_treasury;

    RETURN json_build_object('new_cash', v_new_cash, 'treasury', v_treasury);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_consorzio(text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_join_consorzio(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_leave_consorzio(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_contribute_consorzio(uuid, bigint)    TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ISPETTORATO DEL LAVORO
-- Don Carmine NPC: €50.000 → rischio GdF azzerato + immunità 24h.
-- Crumiri: assumibili solo durante sciopero → +50% redditi 48h, +25 rischio.
-- GdF: se rischio ≥ 70 e nessuna immunità → 35% probabilità ispezione giornaliera
--      → multa 10% del cash (min €5.000), rischio -30 dopo ispezione.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_gdf_risk (
    user_id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    risk_level             int         NOT NULL DEFAULT 0 CHECK (risk_level >= 0 AND risk_level <= 100),
    crumiri_boost_until    timestamptz,
    carmine_immunity_until timestamptz,
    inspections_count      int         NOT NULL DEFAULT 0,
    total_fines_paid       bigint      NOT NULL DEFAULT 0,
    updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_gdf_risk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gdf_risk_own" ON public.player_gdf_risk FOR ALL USING (user_id = auth.uid());

-- Leggi rischio GdF del player corrente
CREATE OR REPLACE FUNCTION public.rpc_get_gdf_risk()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    v_uid uuid := auth.uid();
    v     record;
BEGIN
    SELECT * INTO v FROM public.player_gdf_risk WHERE user_id = v_uid;
    IF NOT FOUND THEN
        RETURN json_build_object(
            'risk_level', 0, 'crumiri_boost_until', null,
            'carmine_immunity_until', null,
            'inspections_count', 0, 'total_fines_paid', 0
        );
    END IF;
    RETURN json_build_object(
        'risk_level',             v.risk_level,
        'crumiri_boost_until',    v.crumiri_boost_until,
        'carmine_immunity_until', v.carmine_immunity_until,
        'inspections_count',      v.inspections_count,
        'total_fines_paid',       v.total_fines_paid
    );
END;
$$;

-- Assumi crumiri — solo durante Sciopero Nazionale attivo
CREATE OR REPLACE FUNCTION public.rpc_hire_crumiri()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_t     record;
    v_risk  int;
    v_until timestamptz;
BEGIN
    SELECT * INTO v_t FROM public.global_tension WHERE id = 1;
    IF v_t IS NULL OR NOT v_t.strike_active THEN
        RAISE EXCEPTION 'I crumiri si assumono solo durante uno Sciopero Nazionale attivo';
    END IF;

    v_until := now() + INTERVAL '48 hours';

    INSERT INTO public.player_gdf_risk(user_id, risk_level, crumiri_boost_until, updated_at)
    VALUES (v_uid, 25, v_until, now())
    ON CONFLICT (user_id) DO UPDATE SET
        risk_level          = LEAST(100, player_gdf_risk.risk_level + 25),
        crumiri_boost_until = GREATEST(COALESCE(player_gdf_risk.crumiri_boost_until, now()), now()) + INTERVAL '48 hours',
        updated_at          = now()
    RETURNING risk_level, crumiri_boost_until INTO v_risk, v_until;

    RETURN json_build_object('risk_level', v_risk, 'crumiri_boost_until', v_until);
END;
$$;

-- Paga Don Carmine — €50.000, rischio → 0, immunità 24h
CREATE OR REPLACE FUNCTION public.rpc_pay_don_carmine()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_fee      bigint := 50000;
    v_cash     bigint;
    v_new_cash bigint;
    v_immunity timestamptz;
BEGIN
    v_cash := public._get_player_cash(v_uid);
    IF v_cash < v_fee THEN
        RAISE EXCEPTION 'Don Carmine richiede €50.000 — hai solo €%', v_cash;
    END IF;

    v_new_cash := public._add_player_cash(v_uid, -v_fee);
    v_immunity := now() + INTERVAL '24 hours';

    INSERT INTO public.player_gdf_risk(user_id, risk_level, carmine_immunity_until, updated_at)
    VALUES (v_uid, 0, v_immunity, now())
    ON CONFLICT (user_id) DO UPDATE SET
        risk_level             = 0,
        carmine_immunity_until = v_immunity,
        updated_at             = now();

    RETURN json_build_object('new_cash', v_new_cash, 'immunity_until', v_immunity);
END;
$$;

-- Check giornaliero GdF — chiamare una volta per game-day
CREATE OR REPLACE FUNCTION public.rpc_gdf_inspection_check()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v          record;
    v_cash     bigint;
    v_fine     bigint;
    v_new_cash bigint;
BEGIN
    SELECT * INTO v FROM public.player_gdf_risk WHERE user_id = v_uid;
    IF NOT FOUND OR v.risk_level < 70 THEN
        RETURN json_build_object('inspected', false, 'fine', 0);
    END IF;

    -- Immunità attiva → nessuna ispezione, rischio scende piano
    IF v.carmine_immunity_until IS NOT NULL AND v.carmine_immunity_until > now() THEN
        UPDATE public.player_gdf_risk
        SET risk_level = GREATEST(0, risk_level - 5), updated_at = now()
        WHERE user_id = v_uid;
        RETURN json_build_object('inspected', false, 'fine', 0, 'immunity_active', true);
    END IF;

    -- 35% probabilità ispezione
    IF random() < 0.35 THEN
        v_cash     := public._get_player_cash(v_uid);
        v_fine     := GREATEST(5000, FLOOR(v_cash::numeric * 0.10)::bigint);
        v_new_cash := public._add_player_cash(v_uid, -v_fine);

        UPDATE public.player_gdf_risk SET
            risk_level        = GREATEST(0, risk_level - 30),
            inspections_count = inspections_count + 1,
            total_fines_paid  = total_fines_paid + v_fine,
            updated_at        = now()
        WHERE user_id = v_uid;

        RETURN json_build_object('inspected', true, 'fine', v_fine, 'new_cash', v_new_cash);
    END IF;

    RETURN json_build_object('inspected', false, 'fine', 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_gdf_risk()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hire_crumiri()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pay_don_carmine()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_gdf_inspection_check()  TO authenticated;
