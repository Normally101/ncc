-- ============================================================================
-- 49_lockdown_critical_cash_rpcs_scaffold.sql
-- Chiude le 3 falle più gravi mappate in PR #12 (docs/SYSTEMS.md §9,
-- docs/SQL_LOCKDOWN_HANDOFF.md "Gruppo 2") — verificate leggendo il codice
-- live (pg_get_functiondef) prima di scrivere, nessun drift rispetto
-- all'analisi della sessione cloud che le ha trovate.
--
-- Applicato in sessione live da Claude in VS Code (Vlad presente), 9 agosto
-- 2026, con accesso reale a Supabase — non uno scaffold "da applicare poi".
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 1 — rpc_sync_cash: SET assoluto di cash dal client, zero
-- validazione oltre auth.uid(). Il meccanismo di sync cash più usato nel
-- gioco (daily tick, acquisti flotta, quest, survival Zero-to-Hero, Vittorio).
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 10_sync_cash.sql. Non è possibile un cap assoluto basso: il
-- catalogo reale (data.js) ha acquisti legittimi in singola chiamata fino a
-- €45.000.000 (inv_tower) e €18.000.000 (jet privato Embraer Phenom 300),
-- entrambi mutati SOLO lato client e poi specchiati qui — un cap assoluto o
-- un cap-delta stretto romperebbe questi acquisti legittimi.
--
-- Fix a due livelli (difesa in profondità, non la riscrittura server-
-- authoritative vera — quella resta debito #1, bloccata sulla scala
-- economica, vedi docs/ECONOMY_SERVER_AUTH.md):
--   1. Cap sul DELTA per chiamata (±€60.000.000): comodamente sopra il più
--      grande swing legittimo osservato nel catalogo reale (Tower €45M) con
--      margine ~33%, ma blocca comunque il caso `v_cash: 999999999999999`
--      da devtools in una singola chiamata.
--   2. Rate-limit (30/min, stesso ordine di grandezza già usato per
--      start_trip/claim_trip_reward in 45_): syncCash è chiamato di
--      frequente per uso legittimo (quasi ogni azione), 30/min è largo
--      abbastanza da non toccare il gameplay normale ma impedisce di
--      accumulare rapidamente chiamando la RPC in loop per aggirare il cap
--      sul delta.
CREATE OR REPLACE FUNCTION public.rpc_sync_cash(v_cash BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_cash_prev  BIGINT;
    v_delta      BIGINT;
    -- ── FIX: tetto di sicurezza sul delta (vedi commento sopra) ───────────
    v_max_delta  CONSTANT BIGINT := 60000000;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Non autenticato';
    END IF;

    PERFORM public._ce_rate_limit('sync_cash', 30, interval '1 minute');

    SELECT cash INTO v_cash_prev FROM companies WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    v_delta := v_cash - v_cash_prev;
    IF ABS(v_delta) > v_max_delta THEN
        RAISE EXCEPTION 'rpc_sync_cash: variazione cassa fuori range (% → %, delta %, max ±%)',
            v_cash_prev, v_cash, v_delta, v_max_delta;
    END IF;

    UPDATE companies
       SET cash       = v_cash,
           updated_at = NOW()
     WHERE user_id = v_uid;

    RETURN jsonb_build_object('success', true, 'cash', v_cash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_sync_cash(BIGINT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 2 — rpc_sell_vehicle: v_price dal client, nemmeno un controllo
-- >= 0. Vendi l'auto più economica della flotta dichiarando un prezzo
-- arbitrario.
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 09_provinces_realestate_fuel.sql. Controllo ownership/stato
-- IDLE già corretto, invariato. Il DB non ha un catalogo prezzi server-side
-- per i veicoli (il modello vive solo come vehicles.model_id text, i prezzi
-- sono nel catalogo client data.js — verificato: nessuna tabella
-- price/catalog/model in information_schema) — replicare qui l'intero
-- listino con condizione/usura richiederebbe portare tutto il catalogo lato
-- server (fuori scope, stesso principio del debito #1). Fix minimo: tetto
-- derivato dal prezzo più alto REALE tra tutti i 50 veicoli del catalogo
-- (grep vehicleClass: in data.js → max €18.000.000, jet privato Embraer
-- Phenom 300), con margine per upgrade applicati (vehicles.upgrades) →
-- €25.000.000.
CREATE OR REPLACE FUNCTION public.rpc_sell_vehicle(
    v_vehicle_id UUID,
    v_price      BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_company companies%ROWTYPE;
    -- ── FIX: tetto di sicurezza sul prezzo (vedi commento sopra) ──────────
    v_max_price CONSTANT BIGINT := 25000000;
BEGIN
    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    -- ── FIX: rifiuta prezzi fuori dal range plausibile ────────────────────
    IF v_price < 0 OR v_price > v_max_price THEN
        RAISE EXCEPTION 'rpc_sell_vehicle: prezzo fuori range (%, max %)', v_price, v_max_price;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM vehicles
         WHERE id = v_vehicle_id
           AND company_id = v_company.id
           AND status = 'IDLE'
    ) THEN
        RAISE EXCEPTION 'Veicolo non trovato, non di tua proprietà, o in servizio attivo';
    END IF;

    DELETE FROM vehicles WHERE id = v_vehicle_id;

    UPDATE companies SET cash = cash + v_price WHERE id = v_company.id;

    RETURN jsonb_build_object(
        'success',    true,
        'sold_price', v_price
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_sell_vehicle(UUID, BIGINT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 3 — rpc_take_loan: nessun tetto sul capitale, il fido reale esiste
-- solo lato client (_getCreditTier, ui-investments.js). Prestito enorme con
-- rata giornaliera irrisoria, capitale accreditato istantaneamente.
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 02_mmo_rpcs_extension.sql. Porta lato server una versione
-- CONSERVATIVA di _getCreditTier (engine-finance.js:151): stessa mappa
-- score→tier→fido del client, punteggio ricalcolato però SOLO dai segnali
-- verificabili server-side (companies.reputation, companies.cash, conteggio
-- e utilizzo di company_loans) — reputation*60 (max 300) + cash/10000 (max
-- 150) - 30 per prestito attivo - 50 se un prestito è oltre l'80% di
-- utilizzo, base 300, clamp [300,900]. Omessi i bonus lifestyleAssets*20 e
-- achievements*5 del client: nessuna tabella server li traccia e sono solo
-- bonus positivi, quindi ometterli rende lo score server SOLO più
-- conservativo (mai un fido più alto di quanto il client mostrerebbe),
-- coerente con un fix di sicurezza — mai fidarsi di conteggi non verificabili
-- lato server. Fido = tetto sul DEBITO TOTALE (non sul singolo prestito),
-- stessa semantica del pannello Linea di Credito (ui-investments.js:120,
-- `atLimit = totalDebt >= loanLimit`).
CREATE OR REPLACE FUNCTION public.rpc_take_loan(
    v_principal     bigint,
    v_interest_rate numeric,
    v_daily_payment bigint
)
RETURNS public.company_loans
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id       uuid := auth.uid();
    v_company       public.companies;
    v_loan_count    int;
    v_total_debt    bigint;
    v_high_util     boolean;
    v_score         int;
    v_loan_limit    bigint;
    v_result        public.company_loans;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_take_loan: utente non autenticato';
    END IF;

    IF v_principal <= 0 THEN
        RAISE EXCEPTION 'rpc_take_loan: capitale non valido (%)', v_principal;
    END IF;

    IF v_daily_payment <= 0 THEN
        RAISE EXCEPTION 'rpc_take_loan: rata giornaliera non valida (%)', v_daily_payment;
    END IF;

    IF v_interest_rate < 0 THEN
        RAISE EXCEPTION 'rpc_take_loan: tasso di interesse non valido (%)', v_interest_rate;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_take_loan: azienda non trovata';
    END IF;

    SELECT COUNT(*), COALESCE(SUM(remaining), 0),
           COALESCE(BOOL_OR(remaining > principal * 0.8), false)
      INTO v_loan_count, v_total_debt, v_high_util
      FROM public.company_loans
     WHERE company_id = v_company.id;

    IF v_loan_count >= 3 THEN
        RAISE EXCEPTION 'rpc_take_loan: limite massimo di 3 prestiti simultanei raggiunto — rimborsa prima un prestito esistente';
    END IF;

    -- ── FIX: fido massimo derivato da un credit score server-side conservativo ──
    v_score := 300
        + LEAST(300, FLOOR(v_company.reputation * 60))
        + LEAST(150, FLOOR(v_company.cash / 10000))
        - (v_loan_count * 30)
        - (CASE WHEN v_high_util THEN 50 ELSE 0 END);
    v_score := GREATEST(300, LEAST(900, v_score));

    v_loan_limit := CASE
        WHEN v_score >= 800 THEN 5000000
        WHEN v_score >= 700 THEN 2000000
        WHEN v_score >= 600 THEN 1000000
        WHEN v_score >= 500 THEN 500000
        ELSE 100000
    END;

    IF v_total_debt + v_principal > v_loan_limit THEN
        RAISE EXCEPTION 'rpc_take_loan: capitale richiesto (%) supera il fido disponibile (debito attuale % + richiesto % > fido % — score %)',
            v_principal, v_total_debt, v_principal, v_loan_limit, v_score;
    END IF;

    UPDATE public.companies
    SET cash = cash + v_principal
    WHERE id = v_company.id;

    INSERT INTO public.company_loans (company_id, principal, remaining, interest_rate, daily_payment)
    VALUES (v_company.id, v_principal, v_principal, v_interest_rate, v_daily_payment)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_take_loan(bigint, numeric, bigint) TO authenticated;
