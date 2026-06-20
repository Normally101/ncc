-- ════════════════════════════════════════════════════════════════════════════
-- 41_cap_driver_coins.sql — Hardening sicurezza (Ondata 1.5)
-- rpc_add_driver_coins NON validava l'importo → un utente poteva coniare valuta
-- premium illimitata via console (p_amount enorme). Aggiunto un TETTO per chiamata
-- a 1.000.000 (generosissimo: nessun pack legittimo dello store lo avvicina, quindi
-- ZERO falsi positivi sugli acquisti reali) che blocca il minting palese (999999999 / MAX_INT).
--
-- NB: in modello "acquisto simulato" un loop di chiamate sotto-soglia aggira comunque
-- il tetto → la difesa COMPLETA (cap giornaliero come il VTK / IAP reale) fa parte del
-- progetto "economia server-authoritative" (vedi HANDOFF, debito #1). Questo è un argine.
-- Esistono DUE overload (1-arg storica, 2-arg attiva): cappati entrambi.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Overload 2-arg (attivo, chiamato dallo store) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_add_driver_coins(
    p_amount  INTEGER,
    p_item_id TEXT DEFAULT 'sim_purchase'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_company  companies%ROWTYPE;
    v_new_bal  INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    -- HARDENING: importo entro un range plausibile (1..1.000.000)
    IF p_amount <= 0 OR p_amount > 1000000 THEN
        RAISE EXCEPTION 'rpc_add_driver_coins: importo fuori range (1..1000000)';
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins + p_amount
    WHERE user_id = v_user_id
    RETURNING driver_coins INTO v_new_bal;

    INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
    VALUES (v_user_id, v_company.company_name, p_amount, 'purchase', p_item_id, v_new_bal);

    RETURN jsonb_build_object('ok', true, 'driver_coins', v_new_bal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_driver_coins(INTEGER, TEXT) TO authenticated;

-- ── Overload 1-arg (storica) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_add_driver_coins(
    p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    -- HARDENING: range plausibile (era solo p_amount <= 0)
    IF p_amount <= 0 OR p_amount > 1000000 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'amount out of range (1..1000000)');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins + p_amount
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object('ok', true, 'driver_coins', v_company.driver_coins);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_driver_coins(integer) TO authenticated;
