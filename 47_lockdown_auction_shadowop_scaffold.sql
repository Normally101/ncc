-- ============================================================================
-- 47_lockdown_auction_shadowop_scaffold.sql
-- SCAFFOLD — NON applicato al DB di produzione da questa routine (nessuna
-- credenziale Supabase disponibile in questo ambiente cloud: niente CLI,
-- niente env, niente ~/.config/ce-supabase.env — verificato prima di scrivere
-- questo file). Vlad deve rivedere e applicare lui stesso, come per
-- `45_lockdown_cash_exploits_scaffold.sql`.
--
-- Chiude le ultime 2 delle 3 falle di sicurezza economiche ancora aperte
-- (segnalate nei commenti di PR #8, mai corrette — vedi HANDOFF.md "DA FARE
-- TU"). La terza (`_add_player_cash`) è già nello scaffold 45_, non ripetuta
-- qui.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 1 — rpc_resolve_auction: nessun controllo su CHI la chiama, e se il
-- vincitore non ha fondi sufficienti il lotto viene assegnato comunque a
-- prezzo scontato (fino a €0).
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 20_judicial_auctions.sql. Due problemi distinti nello stesso
-- corpo funzione:
--   (a) GRANT diretto ad `authenticated`, nessuna verifica che il chiamante
--       sia il vincitore o un processo autorizzato — CHIUNQUE loggato può
--       forzare la risoluzione di un'asta altrui scaduta, scegliendo il
--       timing (es. quando sa che il proprio saldo è a zero).
--   (b) `v_win_bid := LEAST(v_cash, v_win_bid)` (riga ~294): se il vincitore
--       ha meno cash del bid, si scala solo quello che ha — e il lotto viene
--       comunque assegnato. Con `v_cash = 0`, il lotto è gratis.
-- Verificato via grep: **zero call-site .js** che chiamano rpc_resolve_auction
-- (il client non la usa mai) e **nessun pg_cron/scheduler** nel repo che la
-- invochi — è chiamabile solo direttamente con la anon key, exploit puro,
-- nessun uso legittimo da rompere.
--
-- Fix: REVOKE secco, stessa logica già applicata a `_add_player_cash` in
-- 45_. Se in futuro serve una risoluzione automatica delle aste (oggi non
-- esiste nel codice — le aste scadute restano semplicemente `open` finché
-- qualcuno non chiama questa RPC), va reintrodotta come job schedulato
-- lato server (pg_cron o Edge Function), MAI richiamabile dal client.
REVOKE EXECUTE ON FUNCTION public.rpc_resolve_auction(UUID) FROM PUBLIC, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 2 — rpc_execute_shadow_op: v_op_cost arriva dal client senza alcun
-- controllo di segno → un costo negativo diventa un accredito di cassa
-- arbitrario.
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 23_shadow_ops.sql. `UPDATE companies SET cash = cash - v_op_cost`
-- (riga ~89): se v_op_cost è negativo, sottrarlo AGGIUNGE cassa. Il controllo
-- precedente (`IF COALESCE(v_cash,0) < v_op_cost THEN RAISE EXCEPTION`) non
-- blocca nulla in questo caso: con v_op_cost negativo la condizione è quasi
-- sempre falsa, quindi si passa oltre e si accredita.
--
-- A differenza di rpc_resolve_auction, questa RPC è **usata legittimamente
-- dal client** (`black_ops.js:119`, pulsanti Agenzia Ombra) — non si può fare
-- un REVOKE secco senza rompere la feature. Fix: validare v_op_cost contro un
-- range plausibile invece di fidarsi del client. Tetto derivato dai costi
-- REALI del client (`black_ops.js`: da €15.000 a €80.000 per le 7 operazioni
-- attuali) — €300.000 dà un margine ampio (~4×) senza rischiare di bloccare
-- operazioni legittime se in futuro si aggiungono op più costose.
--
-- Corpo della funzione COPIATO VERBATIM da 23_shadow_ops.sql (righe 52-176 al
-- momento dell'audit) — unica modifica: le 3 righe FIX subito dopo i check di
-- auth in testa alla funzione. Nessun'altra riga toccata, per non rischiare
-- di introdurre una regressione su logica (probabilità successo, effetti per
-- tipo, detection, cooldown) che questa routine non ha scritto e non deve
-- reinventare.
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
    -- ── FIX: tetto di sicurezza sul costo (vedi commento sopra) ───────────
    v_max_op_cost   CONSTANT BIGINT := 300000;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_uid = v_target_id THEN RAISE EXCEPTION 'Non puoi attaccare te stesso'; END IF;

    -- ── FIX: rifiuta costi fuori dal range plausibile (blocca il mint) ────
    IF v_op_cost <= 0 OR v_op_cost > v_max_op_cost THEN
        RAISE EXCEPTION 'rpc_execute_shadow_op: costo operazione fuori range (%, max %)', v_op_cost, v_max_op_cost;
    END IF;

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

GRANT EXECUTE ON FUNCTION public.rpc_execute_shadow_op(UUID, TEXT, BIGINT) TO authenticated;
