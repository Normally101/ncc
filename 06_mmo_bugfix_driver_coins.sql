-- ================================================================
-- 06_mmo_bugfix_driver_coins.sql
-- Chauffeur Empire · Bugfix: driver_coins authoritative sync
--
-- 1. Initialize existing rows (may have 0 after titan_coins rename)
-- 2. rpc_add_driver_coins — called by simulated/earned purchases
--    so the DB column stays authoritative and RPCs can debit from it
-- ================================================================

-- ── 1. Initialize: give 50 DC to rows that have 0 ────────────────
--    (Rows initialized before 04_mmo_idle_mechanics ran, or where
--     titan_coins was never incremented by the old code, land at 0.)
UPDATE public.companies
    SET driver_coins = 50
    WHERE driver_coins = 0;

-- ── 2. RPC: add driver coins (simulated purchase / quest reward) ──
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
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'amount must be > 0');
    END IF;

    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins + p_amount
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_driver_coins(integer) TO authenticated;
