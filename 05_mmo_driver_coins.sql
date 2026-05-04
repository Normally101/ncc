-- ================================================================
-- 05_mmo_driver_coins.sql
-- Chauffeur Empire · Driver Coins Rebranding + New Ethical RPCs
--
-- Changes:
--   1. RENAME titan_coins → driver_coins
--   2. Recreate RPCs that referenced titan_coins
--   3. rpc_buy_energy_refill  — restore CEO energy to 100%
--   4. rpc_buy_fleet_repair   — mark fleet repair (client applies locally)
--   5. rpc_buy_vip_contact    — unlock a guaranteed VIP contact
-- ================================================================

-- ── 1. Rename the column ─────────────────────────────────────────
ALTER TABLE public.companies
    RENAME COLUMN titan_coins TO driver_coins;

-- ── 2. Recreate rpc_upgrade_offline_limit (driver_coins refs) ───
CREATE OR REPLACE FUNCTION public.rpc_upgrade_offline_limit(
    p_cost_in_coins integer
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
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    IF v_company.offline_limit_hours >= 12 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'limite massimo già raggiunto (12h)');
    END IF;

    UPDATE companies
    SET
        driver_coins         = driver_coins - p_cost_in_coins,
        offline_limit_hours  = LEAST(12, offline_limit_hours + 2)
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',                   true,
        'offline_limit_hours',  v_company.offline_limit_hours,
        'driver_coins',         v_company.driver_coins
    );
END;
$$;

-- ── 3. Recreate rpc_buy_auto_rest (driver_coins refs) ────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_auto_rest(
    p_cost_in_coins integer
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
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.auto_rest_enabled THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Auto-Rest già attivo');
    END IF;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET
        driver_coins      = driver_coins - p_cost_in_coins,
        auto_rest_enabled = true
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',               true,
        'auto_rest_enabled', v_company.auto_rest_enabled,
        'driver_coins',      v_company.driver_coins
    );
END;
$$;

-- ── 4. RPC: buy energy refill (CEO energia → 100%) ───────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_energy_refill(
    p_cost_in_coins integer
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
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET
        driver_coins = driver_coins - p_cost_in_coins,
        ceo_energy   = 100
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'ceo_energy',   v_company.ceo_energy,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

-- ── 5. RPC: buy fleet repair (deducts DC, client applies locally) ─
CREATE OR REPLACE FUNCTION public.rpc_buy_fleet_repair(
    p_cost_in_coins integer
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
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins - p_cost_in_coins
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

-- ── 6. RPC: buy VIP contact (unlocks a guaranteed ultra ride) ────
CREATE OR REPLACE FUNCTION public.rpc_buy_vip_contact(
    p_cost_in_coins integer
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
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    IF v_company.driver_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Driver Coins insufficienti');
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins - p_cost_in_coins
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',           true,
        'driver_coins', v_company.driver_coins
    );
END;
$$;

-- ── Grant execute ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_upgrade_offline_limit(integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_auto_rest(integer)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_energy_refill(integer)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_fleet_repair(integer)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_vip_contact(integer)         TO authenticated;
