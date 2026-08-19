-- ============================================================================
-- 50_fix_sync_cash_asymmetric_delta.sql
-- Corregge 49_lockdown_critical_cash_rpcs_scaffold.sql: il cap sul delta di
-- rpc_sync_cash era simmetrico (ABS(delta) <= 60M), ma un reset legittimo di
-- New Game+ (engine.js::newGamePlus/sellCompanyNGP) può generare un delta
-- NEGATIVO enorme (giocatore con cash molto alto che riparte da zero) — il
-- cap simmetrico lo avrebbe rifiutato, ricreando la stessa divergenza
-- client/server che il fix voleva chiudere (server resta al vecchio cash
-- alto, client mostra il nuovo cash basso).
--
-- Un delta negativo non è mai un vettore di exploit (il giocatore può solo
-- danneggiare se stesso, mai altri — rpc_sync_cash scrive solo la riga di
-- auth.uid()), e companies.cash ha già un CHECK (cash >= 0) a livello di
-- tabella che impedisce comunque valori negativi. Restringere solo gli
-- INCREMENTI (l'unica direzione sfruttabile per darsi cassa dal nulla) è
-- corretto e non richiede indovinare un secondo numero: la tabella già
-- fa da pavimento.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_sync_cash(v_cash BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_cash_prev  BIGINT;
    v_delta      BIGINT;
    -- ── FIX: tetto di sicurezza solo sugli INCREMENTI (vedi commento sopra) ──
    v_max_increase CONSTANT BIGINT := 60000000;
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
    IF v_delta > v_max_increase THEN
        RAISE EXCEPTION 'rpc_sync_cash: incremento cassa fuori range (% → %, delta +%, max +%)',
            v_cash_prev, v_cash, v_delta, v_max_increase;
    END IF;
    -- Nessun tetto sui decrementi: mai un vettore di exploit (solo auto-danno),
    -- e companies_cash_check (CHECK cash >= 0) resta comunque attivo come pavimento.

    UPDATE companies
       SET cash       = v_cash,
           updated_at = NOW()
     WHERE user_id = v_uid;

    RETURN jsonb_build_object('success', true, 'cash', v_cash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_sync_cash(BIGINT) TO authenticated;
