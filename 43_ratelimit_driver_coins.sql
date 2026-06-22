-- ════════════════════════════════════════════════════════════════════════════
-- 43_ratelimit_driver_coins.sql — Hardening: rate-limit anti-loop su rpc_add_driver_coins
-- IDEMPOTENT: safe to re-run. Revert = ri-girare 41_cap_driver_coins.sql.
--
-- CONTESTO: 41_* mise un TETTO per chiamata (1M), ma un loop di chiamate sotto-soglia
-- lo aggira (documentato in 41 + HANDOFF debito #1). rpc_add_driver_coins è chiamata
-- SOLO da ui-store.js su click manuale "compra coin" (acquisto simulato) → MAI in loop
-- legittimo. Quindi un rate-limit sulla FREQUENZA (20/min) chiude l'exploit del loop
-- automatico SENZA toccare i valori legittimi (coerente con la decisione "no ceiling
-- al volo sull'economia": qui limitiamo la frequenza di chiamata, non l'importo).
-- 20/min è ben oltre qualsiasi cadenza umana di acquisto; throttle, non blocco.
-- La difesa COMPLETA resta il progetto economia server-authoritative (42_*).
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

    -- HARDENING: rate-limit anti-loop (20 chiamate/minuto per utente). Vedi header.
    PERFORM public._ce_rate_limit('add_driver_coins', 20, interval '1 minute');

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

    -- HARDENING: rate-limit anti-loop (20 chiamate/minuto per utente). Vedi header.
    PERFORM public._ce_rate_limit('add_driver_coins', 20, interval '1 minute');

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

-- ════════════════════════════════════════════════════════════════════════════
-- FINE 43_ratelimit_driver_coins.sql
-- ════════════════════════════════════════════════════════════════════════════
