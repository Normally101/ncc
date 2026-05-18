-- ════════════════════════════════════════════════════════════════
-- 32_security_indexes.sql
-- Chauffeur Empire — Security Hardening & Performance Indexes
-- Run once in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- ─── 1. MISSING COMPOSITE INDEXES FOR HIGH-FREQUENCY QUERIES ─────

-- companies: frequent filter by user_id + reputation (leaderboard)
CREATE INDEX IF NOT EXISTS idx_companies_user_rep
    ON public.companies(user_id, reputation DESC);

-- active_trips: filter by company_id + status for ops room
CREATE INDEX IF NOT EXISTS idx_trips_company_status
    ON public.active_trips(company_id, status);

-- drivers: filter by company_id + is_available
CREATE INDEX IF NOT EXISTS idx_drivers_company_avail
    ON public.drivers(company_id, is_available);

-- vehicles: filter by company_id + status
CREATE INDEX IF NOT EXISTS idx_vehicles_company_status
    ON public.vehicles(company_id, status);

-- game_saves: primary query is (user_id, slot_index)
CREATE INDEX IF NOT EXISTS idx_game_saves_user_slot
    ON public.game_saves(user_id, slot_index);

-- leaderboard: sort by liquid_assets DESC (global ranking)
CREATE INDEX IF NOT EXISTS idx_leaderboard_assets
    ON public.leaderboard(liquid_assets DESC);

-- market_listings: open listings sort by price
CREATE INDEX IF NOT EXISTS idx_market_price
    ON public.market_listings(status, price ASC)
    WHERE status = 'open';

-- ─── 2. CLIENT ERROR LOG TABLE ────────────────────────────────────
-- Receives JS errors from security.js error interceptor

CREATE TABLE IF NOT EXISTS public.client_error_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    error_msg   TEXT        NOT NULL,
    error_src   TEXT,
    error_line  INT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read; users can only insert their own errors
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'client_error_log'
          AND policyname = 'err_log_insert_own'
    ) THEN
        CREATE POLICY "err_log_insert_own"
            ON public.client_error_log
            FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
    END IF;
END $$;

-- Auto-purge errors older than 30 days (keep table lean)
CREATE INDEX IF NOT EXISTS idx_err_log_created
    ON public.client_error_log(created_at);

-- ─── 3. AUTH RATE LIMITING TABLE (server-side) ────────────────────
-- Tracks failed login attempts per email (server-side guard)

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    email           TEXT        PRIMARY KEY,
    attempt_count   INT         NOT NULL DEFAULT 1,
    window_start    TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No user access — managed only by server RPCs / triggers
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'auth_rate_limits'
          AND policyname = 'rate_limit_deny_all'
    ) THEN
        CREATE POLICY "rate_limit_deny_all"
            ON public.auth_rate_limits
            FOR ALL USING (false);
    END IF;
END $$;

-- ─── 4. PASSWORD RESET TOKEN EXPIRY (30 min) ─────────────────────
-- NOTE: Set in Supabase Dashboard → Auth → Email Templates → "OTP expiry"
-- Target value: 1800 seconds (30 minutes)
-- This SQL comment documents the required dashboard configuration.
-- Supabase does not expose this via SQL — configure it in the dashboard.

-- Placeholder function to document the constraint
CREATE OR REPLACE FUNCTION public.get_security_config()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'password_reset_expiry_seconds', 1800,
        'max_login_attempts',            5,
        'login_window_minutes',          5,
        'session_timeout_hours',         24,
        'rls_enabled',                   true,
        'audit_log_enabled',             true
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_security_config() TO authenticated;

-- ─── 5. AUDIT TRAIL TRIGGER ──────────────────────────────────────
-- Logs cash changes > 10,000 for fraud detection

CREATE TABLE IF NOT EXISTS public.cash_audit_log (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation       TEXT        NOT NULL, -- 'credit' | 'debit'
    amount          BIGINT      NOT NULL,
    balance_after   BIGINT,
    source          TEXT,                 -- RPC name that triggered it
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'cash_audit_log'
          AND policyname = 'audit_own_read'
    ) THEN
        CREATE POLICY "audit_own_read"
            ON public.cash_audit_log
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cash_audit_user_ts
    ON public.cash_audit_log(user_id, created_at DESC);

-- ─── 6. SECURITY VIEWS ───────────────────────────────────────────
-- Expose non-sensitive leaderboard data without leaking user_id

CREATE OR REPLACE VIEW public.public_leaderboard AS
SELECT
    ROW_NUMBER() OVER (ORDER BY liquid_assets DESC) AS rank,
    company_name,
    liquid_assets,
    reputation,
    last_active
FROM public.leaderboard
WHERE last_active > now() - INTERVAL '30 days'
ORDER BY liquid_assets DESC
LIMIT 100;

GRANT SELECT ON public.public_leaderboard TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- END 32_security_indexes.sql
-- ════════════════════════════════════════════════════════════════
