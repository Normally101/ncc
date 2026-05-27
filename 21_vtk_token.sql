-- =============================================================================
-- 21_vtk_token.sql
-- Chauffeur Empire — VTK (Vettura Token) Economy
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

-- ─── VTK BALANCE on companies ────────────────────────────────────────────────

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS vtk_balance      BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vtk_earned_today BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vtk_today_reset  DATE   DEFAULT CURRENT_DATE;

-- Daily cap reset (called by engine-daily or cron)
CREATE OR REPLACE FUNCTION rpc_reset_daily_vtk()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE companies
    SET vtk_earned_today = 0,
        vtk_today_reset  = CURRENT_DATE
    WHERE vtk_today_reset < CURRENT_DATE;
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_reset_daily_vtk() TO authenticated;

-- ─── AWARD VTK from mission ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_award_mission_vtk(
    v_mission_id TEXT,
    v_vtk_amount BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cap       BIGINT := 500;   -- daily cap per player
    v_today_earned BIGINT;
    v_can_award BIGINT;
BEGIN
    -- Reset today counter if stale
    UPDATE companies
    SET vtk_earned_today = 0, vtk_today_reset = CURRENT_DATE
    WHERE user_id = auth.uid() AND vtk_today_reset < CURRENT_DATE;

    SELECT vtk_earned_today INTO v_today_earned
    FROM companies WHERE user_id = auth.uid();

    v_can_award := LEAST(v_vtk_amount, GREATEST(0, v_cap - COALESCE(v_today_earned, 0)));

    IF v_can_award <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'daily_cap_reached', 'cap', v_cap);
    END IF;

    UPDATE companies
    SET vtk_balance      = vtk_balance + v_can_award,
        vtk_earned_today = vtk_earned_today + v_can_award
    WHERE user_id = auth.uid();

    RETURN jsonb_build_object('success', true, 'awarded', v_can_award, 'mission_id', v_mission_id);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_award_mission_vtk(TEXT, BIGINT) TO authenticated;

-- ─── VTK MARKET (P2P orders) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vtk_market_orders (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vtk_amount  BIGINT      NOT NULL CHECK (vtk_amount > 0),
    dc_price    NUMERIC(12,4) NOT NULL CHECK (dc_price > 0),  -- DC per 1 VTK
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    filled_at   TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

ALTER TABLE vtk_market_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vtk_orders_select" ON vtk_market_orders
    FOR SELECT USING (filled_at IS NULL AND cancelled_at IS NULL);

CREATE POLICY "vtk_orders_insert" ON vtk_market_orders
    FOR INSERT WITH CHECK (seller_id = auth.uid());

CREATE POLICY "vtk_orders_update_own" ON vtk_market_orders
    FOR UPDATE USING (seller_id = auth.uid());

-- Place a sell order (seller locks VTK)
CREATE OR REPLACE FUNCTION rpc_place_vtk_sell_order(
    v_vtk_amount BIGINT,
    v_dc_price   NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_bal BIGINT;
BEGIN
    SELECT vtk_balance INTO v_bal FROM companies WHERE user_id = auth.uid();
    IF COALESCE(v_bal, 0) < v_vtk_amount THEN
        RAISE EXCEPTION 'VTK insufficienti';
    END IF;

    -- Lock VTK (deduct from balance)
    UPDATE companies SET vtk_balance = vtk_balance - v_vtk_amount WHERE user_id = auth.uid();

    INSERT INTO vtk_market_orders (seller_id, vtk_amount, dc_price)
    VALUES (auth.uid(), v_vtk_amount, v_dc_price);

    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_place_vtk_sell_order(BIGINT, NUMERIC) TO authenticated;

-- Fill a buy order (buyer pays DC, gets VTK; seller gets DC)
CREATE OR REPLACE FUNCTION rpc_fill_vtk_order(v_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order  vtk_market_orders%ROWTYPE;
    v_cost   BIGINT;
    v_buyer  BIGINT;
BEGIN
    SELECT * INTO v_order FROM vtk_market_orders WHERE id = v_order_id AND filled_at IS NULL AND cancelled_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ordine non trovato o già eseguito'; END IF;
    IF v_order.seller_id = auth.uid() THEN RAISE EXCEPTION 'Non puoi comprare il tuo stesso ordine'; END IF;

    v_cost := CEIL(v_order.vtk_amount * v_order.dc_price);

    SELECT driver_coins INTO v_buyer FROM companies WHERE user_id = auth.uid();
    IF COALESCE(v_buyer, 0) < v_cost THEN RAISE EXCEPTION 'DC insufficienti'; END IF;

    -- Buyer: pay DC, receive VTK
    UPDATE companies
    SET driver_coins = driver_coins - v_cost,
        vtk_balance  = vtk_balance  + v_order.vtk_amount
    WHERE user_id = auth.uid();

    -- Seller: receive DC
    UPDATE companies
    SET driver_coins = driver_coins + v_cost
    WHERE user_id = v_order.seller_id;

    -- Close order
    UPDATE vtk_market_orders SET filled_at = now() WHERE id = v_order_id;

    RETURN jsonb_build_object('success', true, 'vtk_received', v_order.vtk_amount, 'dc_paid', v_cost);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_fill_vtk_order(UUID) TO authenticated;

-- Cancel own open order (restore VTK to seller)
CREATE OR REPLACE FUNCTION rpc_cancel_vtk_order(v_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order vtk_market_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM vtk_market_orders WHERE id = v_order_id AND seller_id = auth.uid() AND filled_at IS NULL AND cancelled_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ordine non trovato o non tuo'; END IF;

    UPDATE companies SET vtk_balance = vtk_balance + v_order.vtk_amount WHERE user_id = auth.uid();
    UPDATE vtk_market_orders SET cancelled_at = now() WHERE id = v_order_id;

    RETURN jsonb_build_object('success', true, 'vtk_returned', v_order.vtk_amount);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_cancel_vtk_order(UUID) TO authenticated;

-- ─── VTK SHOP ITEMS (future) ──────────────────────────────────────────────────
-- Items purchasable only with VTK (not DC, not real money).
-- Schema placeholder — items will be defined in app logic.
-- Example items: slot_garage_7d (200 VTK), driver_stress_reset (80 VTK),
--                rep_boost_01 (150 VTK, 1/week cap).
CREATE TABLE IF NOT EXISTS vtk_shop_purchases (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id     TEXT        NOT NULL,
    vtk_cost    BIGINT      NOT NULL,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vtk_shop_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vtk_shop_own" ON vtk_shop_purchases USING (user_id = auth.uid());
