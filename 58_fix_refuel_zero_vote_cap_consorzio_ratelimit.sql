-- ============================================================================
-- 58_fix_refuel_zero_vote_cap_consorzio_ratelimit.sql
-- 3 fix trovati da Gemini 3.7 Flash (modalità adversarial), verificati
-- indipendentemente da Claude sul DB/codice reale prima di applicare.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- FIX 1 — CRITICAL/HIGH: rpc_refuel_vehicle bloccava SEMPRE v_fuel_amount=0,
-- rompendo sistematicamente 2 feature che riusano questa RPC solo per
-- addebitare un costo (senza toccare il carburante):
--   - superchargeVehicle (engine-fleet.js:19): ricarica batteria EV
--   - refillTires        (engine-fleet.js:37, via ServerState.refillCarTires)
-- Verificato: `IF v_fuel_amount <= 0 THEN RAISE EXCEPTION` bloccava
-- letteralmente ENTRAMBE le chiamate (passano v_fuel_amount:0 di proposito —
-- fuel_level non va toccato per questi due servizi). Ogni tentativo del
-- giocatore falliva con errore server, cash mai scalato, stato mai
-- aggiornato — feature completamente rotte, non solo un edge case.
-- Fix: `< 0` invece di `<= 0` — con fuel_amount=0, `fuel_level = LEAST(100,
-- fuel_level + 0)` non cambia nulla (comportamento corretto, il costo viene
-- comunque addebitato e l'ownership validata).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_refuel_vehicle(v_vehicle_id uuid, v_fuel_amount integer, v_cost bigint)
RETURNS vehicles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_vehicle   public.vehicles;
    v_result    public.vehicles;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: utente non autenticato';
    END IF;

    -- ── FIX: 0 è valido (supercharger EV / pressione gomme pagano un costo
    -- senza toccare il carburante) — solo i negativi restano invalidi ──────
    IF v_fuel_amount < 0 THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: quantità carburante non valida (%)', v_fuel_amount;
    END IF;

    IF v_cost < 0 THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: costo non valido (%)', v_cost;
    END IF;

    SELECT * INTO v_company FROM public.companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: azienda non trovata';
    END IF;

    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_vehicle_id AND company_id = v_company.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: veicolo % non trovato o non di tua proprietà', v_vehicle_id;
    END IF;

    IF v_company.cash < v_cost THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: fondi insufficienti — hai €%, rifornimento costa €%',
            v_company.cash, v_cost;
    END IF;

    UPDATE public.companies SET cash = cash - v_cost WHERE id = v_company.id;

    UPDATE public.vehicles
    SET fuel_level = LEAST(100, fuel_level + v_fuel_amount)
    WHERE id = v_vehicle_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_refuel_vehicle(uuid, integer, bigint) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- FIX 2 — HIGH: rpc_vote_server_decree accettava v_points_spent illimitato
-- dal client (solo pavimento >=1, nessun tetto), permettendo di approvare
-- istantaneamente qualsiasi decreto globale con un singolo voto enorme.
-- Verificato: gameState.lobbyingPoints (il "budget" che il client controlla
-- PRIMA di chiamare l'RPC, ui-lifestyle.js:171-173) è puramente client-local
-- — zero colonne DB, mai sincronizzato — quindi il server non può validare
-- il vero possesso. Un vero fix server-authoritative richiederebbe portare
-- l'intero sistema lobbying lato server (fuori scope, decisione di design).
-- Fix minimo (difesa in profondità, stesso principio già usato altrove in
-- questa sessione per rpc_start_trip/rpc_sell_vehicle): tetto per chiamata
-- calibrato sul range legittimo massimo dichiarato nel codice client
-- (engine.js:234, "lobbyingPoints: 0, // 0-200") + rate-limit.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_vote_server_decree(v_decree_id uuid, v_points_spent integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_decree    public.server_decrees%ROWTYPE;
    v_prev      INT := 0;
    -- ── FIX: tetto di sicurezza (vedi commento sopra) ──────────────────────
    v_max_points CONSTANT INT := 200;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_points_spent < 1 THEN RAISE EXCEPTION 'Vota almeno 1 punto'; END IF;
    IF v_points_spent > v_max_points THEN
        RAISE EXCEPTION 'rpc_vote_server_decree: punti fuori range (%, max %)', v_points_spent, v_max_points;
    END IF;

    PERFORM public._ce_rate_limit('vote_server_decree', 10, interval '1 minute');

    SELECT * INTO v_decree FROM public.server_decrees WHERE id = v_decree_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Decreto non trovato'; END IF;
    IF v_decree.status != 'voting' THEN RAISE EXCEPTION 'Decreto non in votazione'; END IF;
    IF v_decree.expires_at < NOW() THEN RAISE EXCEPTION 'Votazione scaduta'; END IF;

    SELECT points_spent INTO v_prev FROM public.decree_votes
    WHERE decree_id = v_decree_id AND user_id = v_uid;

    INSERT INTO public.decree_votes (decree_id, user_id, points_spent)
    VALUES (v_decree_id, v_uid, v_points_spent)
    ON CONFLICT (decree_id, user_id) DO UPDATE SET points_spent = EXCLUDED.points_spent;

    UPDATE public.server_decrees
    SET votes_current = (SELECT SUM(points_spent) FROM public.decree_votes WHERE decree_id = v_decree_id)
    WHERE id = v_decree_id;

    IF v_decree.votes_current + v_points_spent - COALESCE(v_prev, 0) >= v_decree.votes_required THEN
        UPDATE public.server_decrees
        SET status    = 'passed',
            passed_at = NOW(),
            ends_at   = CASE WHEN v_decree.duration_days IS NOT NULL
                              THEN NOW() + (v_decree.duration_days || ' days')::INTERVAL
                              ELSE NULL END
        WHERE id = v_decree_id;

        RETURN jsonb_build_object('passed', true, 'decree_id', v_decree_id, 'title', v_decree.title);
    END IF;

    RETURN jsonb_build_object('passed', false, 'votes_current', v_decree.votes_current + v_points_spent - COALESCE(v_prev, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_vote_server_decree(uuid, integer) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- FIX 3 — segnalato da Gemini come MEDIUM (manca rate-limit) MA verificato
-- da Claude durante la riscrittura: c'era un problema più grave, non
-- segnalato da nessuno dei due finora — CRITICAL.
--
-- La funzione originale non validava il SEGNO di v_amount. Con v_amount
-- negativo (es. -1000000):
--   - `IF v_cash < v_amount` è sempre falso (v_cash è sempre >= un numero
--     molto negativo) → il check "fondi insufficienti" non blocca nulla;
--   - `_add_player_cash(v_uid, -v_amount)` con v_amount negativo diventa un
--     DELTA POSITIVO → accredita cash dal nulla al chiamante;
--   - `treasury = treasury + v_amount` con v_amount negativo SOTTRAE dal
--     tesoro del consorzio.
-- Un "contributo" negativo si trasformava quindi in un furto: il chiamante
-- si accredita cash E drena il tesoro del consorzio nello stesso colpo.
-- Fix: `IF v_amount <= 0 THEN RAISE EXCEPTION` (mancava del tutto), più il
-- rate-limit segnalato da Gemini (stesso pattern/limite già usato in
-- rpc_donate_to_alliance).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_contribute_consorzio(v_consorzio_id uuid, v_amount bigint)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_cash     bigint;
    v_new_cash bigint;
    v_treasury bigint;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.consorzio_members
        WHERE consorzio_id = v_consorzio_id AND user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'Non sei membro di questo consorzio';
    END IF;

    PERFORM public._ce_rate_limit('contribute_consorzio', 20, interval '1 minute');

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

GRANT EXECUTE ON FUNCTION public.rpc_contribute_consorzio(uuid, bigint) TO authenticated;
