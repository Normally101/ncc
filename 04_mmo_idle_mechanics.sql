-- ================================================================
-- 04_mmo_idle_mechanics.sql
-- Chauffeur Empire · Idle / Offline Progression + Premium Features
--
-- Adds:
--   1. Idle columns on companies
--   2. rpc_upgrade_offline_limit  (Titan Coins premium)
--   3. rpc_buy_auto_rest          (Titan Coins premium)
--   4. rpc_process_offline_gains  (called on every login)
--   5. rpc_ping                   (60-second heartbeat from client)
-- ================================================================

-- ── 1. Extend companies with idle / premium columns ───────────────
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS offline_limit_hours integer     NOT NULL DEFAULT 2
        CHECK (offline_limit_hours BETWEEN 1 AND 12),
    ADD COLUMN IF NOT EXISTS auto_rest_enabled   boolean     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_active_at      timestamptz NOT NULL DEFAULT now();

-- titan_coins already exists from earlier migration; guard with IF NOT EXISTS
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS titan_coins integer NOT NULL DEFAULT 50
        CHECK (titan_coins >= 0);

-- ── 2. RPC: upgrade offline limit (+2h per purchase, max 12) ─────
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

    IF v_company.titan_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'titan_coins insufficienti');
    END IF;

    IF v_company.offline_limit_hours >= 12 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'limite massimo già raggiunto (12h)');
    END IF;

    UPDATE companies
    SET
        titan_coins          = titan_coins - p_cost_in_coins,
        offline_limit_hours  = LEAST(12, offline_limit_hours + 2)
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',                   true,
        'offline_limit_hours',  v_company.offline_limit_hours,
        'titan_coins',          v_company.titan_coins
    );
END;
$$;

-- ── 3. RPC: buy Auto-Rest feature (one-time Titan Coin purchase) ──
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

    IF v_company.titan_coins < p_cost_in_coins THEN
        RETURN jsonb_build_object('ok', false, 'error', 'titan_coins insufficienti');
    END IF;

    UPDATE companies
    SET
        titan_coins      = titan_coins - p_cost_in_coins,
        auto_rest_enabled = true
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',               true,
        'auto_rest_enabled', v_company.auto_rest_enabled,
        'titan_coins',       v_company.titan_coins
    );
END;
$$;

-- ── 4. RPC: process offline gains (called on every login) ─────────
-- Formula:
--   delta_h     = EXTRACT(EPOCH FROM (now() - last_active_at)) / 3600
--   valid_h     = LEAST(delta_h, offline_limit_hours)
--   driver_cnt  = COUNT(*) FROM drivers WHERE company_id = ...
--   rate        = 900  (€ per driver per hour — rough mid-game estimate)
--   earned      = FLOOR(valid_h * driver_cnt * rate)
-- Auto-rest:
--   hotel_rate  = 400  (€ per hour of rest for energy recovery)
--   energy_gain = LEAST(100 - ceo_energy, FLOOR(valid_h * 12.5)) (12.5% per hour → 8h full)
CREATE OR REPLACE FUNCTION public.rpc_process_offline_gains()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id      uuid;
    v_company         companies%ROWTYPE;
    v_delta_h         numeric;
    v_valid_h         numeric;
    v_driver_count    integer;
    v_rate            integer := 900;
    v_earned          integer;
    v_energy_gained   integer := 0;
    v_hotel_cost      integer := 0;
    v_hotel_rate      integer := 400;
    v_new_energy      integer;
    v_new_cash        bigint;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;

    -- How long the player has been away
    v_delta_h := EXTRACT(EPOCH FROM (now() - v_company.last_active_at)) / 3600.0;

    -- Cap to the player's offline limit
    v_valid_h := LEAST(v_delta_h, v_company.offline_limit_hours);

    -- No meaningful offline time → skip
    IF v_valid_h < 0.05 THEN
        UPDATE companies SET last_active_at = now() WHERE id = v_company_id;
        RETURN jsonb_build_object(
            'ok',             true,
            'hours_processed', 0,
            'earned_cash',    0,
            'energy_restored', 0
        );
    END IF;

    -- Count active MMO drivers for this company
    SELECT COUNT(*) INTO v_driver_count
    FROM public.drivers
    WHERE company_id = v_company_id;

    -- Fallback: if no MMO drivers yet, use a flat base rate of 1 "virtual driver"
    IF v_driver_count < 1 THEN v_driver_count := 1; END IF;

    -- Cash earned while away
    v_earned := FLOOR(v_valid_h * v_driver_count * v_rate);

    -- Auto-rest: restore CEO energy (and optionally deduct hotel cost)
    IF v_company.auto_rest_enabled THEN
        v_energy_gained := LEAST(100 - COALESCE(v_company.ceo_energy, 100),
                                 FLOOR(v_valid_h * 12.5)::integer);
        v_hotel_cost    := FLOOR(v_valid_h * v_hotel_rate);
        v_new_energy    := LEAST(100, COALESCE(v_company.ceo_energy, 100) + v_energy_gained);
        v_earned        := GREATEST(0, v_earned - v_hotel_cost);
    ELSE
        v_new_energy := COALESCE(v_company.ceo_energy, 100);
    END IF;

    v_new_cash := v_company.cash + v_earned;

    -- Apply to DB
    UPDATE companies
    SET
        cash           = v_new_cash,
        ceo_energy     = v_new_energy,
        last_active_at = now()
    WHERE id = v_company_id;

    RETURN jsonb_build_object(
        'ok',              true,
        'hours_processed', ROUND(v_valid_h, 2),
        'earned_cash',     v_earned,
        'energy_restored', v_energy_gained,
        'hotel_cost',      v_hotel_cost
    );
END;
$$;

-- ── 5. RPC: heartbeat ping (updates last_active_at every 60s) ────
CREATE OR REPLACE FUNCTION public.rpc_ping()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NOT NULL THEN
        UPDATE companies SET last_active_at = now() WHERE id = v_company_id;
    END IF;
END;
$$;

-- ── Grant execute ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_upgrade_offline_limit(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_auto_rest(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_offline_gains() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ping() TO authenticated;
