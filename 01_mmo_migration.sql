-- =============================================================================
-- 01_mmo_migration.sql
-- Chauffeur Empire — Server-Authoritative MMO Schema
-- Run entirely in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- This script is IDEMPOTENT: safe to re-run.
-- =============================================================================

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS (idempotent via DO blocks) ─────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE public.vehicle_status AS ENUM ('IDLE', 'ON_TRIP', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.driver_status AS ENUM ('AVAILABLE', 'DRIVING', 'RESTING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.trip_type AS ENUM ('CLIENT_RIDE', 'EMPTY_RETURN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── TABLE: companies ─────────────────────────────────────────────────────────
-- The canonical financial record for each player's company.
-- Cash is modified ONLY by server-side RPCs — the client may never UPDATE it directly.
CREATE TABLE IF NOT EXISTS public.companies (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name    text        NOT NULL DEFAULT 'Nuova Azienda',
    cash            bigint      NOT NULL DEFAULT 15000 CHECK (cash >= 0),
    titan_coins     int         NOT NULL DEFAULT 0    CHECK (titan_coins >= 0),
    reputation      numeric(10,2) NOT NULL DEFAULT 0.0,
    hq_city         text        NOT NULL DEFAULT 'roma',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── TABLE: vehicles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicles (
    id              uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid           NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    model_id        text           NOT NULL,
    license_plate   text           NOT NULL,
    current_city    text           NOT NULL DEFAULT 'roma',
    status          public.vehicle_status NOT NULL DEFAULT 'IDLE',
    mileage         int            NOT NULL DEFAULT 0 CHECK (mileage >= 0),
    has_telepass    boolean        NOT NULL DEFAULT false,
    condition       int            NOT NULL DEFAULT 100 CHECK (condition BETWEEN 0 AND 100),
    created_at      timestamptz    NOT NULL DEFAULT now(),
    updated_at      timestamptz    NOT NULL DEFAULT now()
);

-- ─── TABLE: drivers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drivers (
    id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name            text          NOT NULL,
    tier            text          NOT NULL DEFAULT 'STANDARD'
                                  CHECK (tier IN ('STANDARD', 'BUSINESS', 'VIP', 'ULTRA')),
    current_city    text          NOT NULL DEFAULT 'roma',
    status          public.driver_status NOT NULL DEFAULT 'AVAILABLE',
    fatigue         int           NOT NULL DEFAULT 0 CHECK (fatigue BETWEEN 0 AND 100),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);

-- ─── TABLE: active_trips ──────────────────────────────────────────────────────
-- A row exists for each ride in progress. Deleted (or archived) on rpc_claim_trip_reward.
CREATE TABLE IF NOT EXISTS public.active_trips (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicle_id      uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    driver_id       uuid        NOT NULL REFERENCES public.drivers(id)  ON DELETE CASCADE,
    start_city      text        NOT NULL,
    end_city        text        NOT NULL,
    start_time      timestamptz NOT NULL DEFAULT now(),
    end_time        timestamptz NOT NULL,
    reward_cash     bigint      NOT NULL DEFAULT 0 CHECK (reward_cash >= 0),
    trip_type       public.trip_type NOT NULL DEFAULT 'CLIENT_RIDE',
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_company     ON public.vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_drivers_company      ON public.drivers(company_id);
CREATE INDEX IF NOT EXISTS idx_active_trips_company ON public.active_trips(company_id);
CREATE INDEX IF NOT EXISTS idx_active_trips_endtime ON public.active_trips(end_time);
CREATE INDEX IF NOT EXISTS idx_vehicles_status      ON public.vehicles(company_id, status);
CREATE INDEX IF NOT EXISTS idx_drivers_status       ON public.drivers(company_id, status);


-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON public.drivers;
CREATE TRIGGER trg_drivers_updated_at
    BEFORE UPDATE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();


-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE public.companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_trips ENABLE ROW LEVEL SECURITY;

-- Helper: resolve auth.uid() → this user's company.id
-- SECURITY DEFINER so it can read companies regardless of RLS on that table.
CREATE OR REPLACE FUNCTION public._my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT id FROM public.companies WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── Policy: companies — SELECT only own row ───────────────────────────────────
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
CREATE POLICY "companies_select_own" ON public.companies
    FOR SELECT USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE from the client — all mutations go through SECURITY DEFINER RPCs.

-- ── Policy: vehicles — SELECT only own fleet ──────────────────────────────────
DROP POLICY IF EXISTS "vehicles_select_own" ON public.vehicles;
CREATE POLICY "vehicles_select_own" ON public.vehicles
    FOR SELECT USING (company_id = public._my_company_id());

-- ── Policy: drivers — SELECT only own staff ───────────────────────────────────
DROP POLICY IF EXISTS "drivers_select_own" ON public.drivers;
CREATE POLICY "drivers_select_own" ON public.drivers
    FOR SELECT USING (company_id = public._my_company_id());

-- ── Policy: active_trips — SELECT only own trips ─────────────────────────────
DROP POLICY IF EXISTS "active_trips_select_own" ON public.active_trips;
CREATE POLICY "active_trips_select_own" ON public.active_trips
    FOR SELECT USING (company_id = public._my_company_id());


-- =============================================================================
-- RPCs (SECURITY DEFINER — the client cannot bypass these via direct DML)
-- =============================================================================

-- ─── RPC: rpc_init_company ────────────────────────────────────────────────────
-- Called once on first login (or after game reset).
-- Uses ON CONFLICT to make it safe for re-calls.
CREATE OR REPLACE FUNCTION public.rpc_init_company(v_company_name text DEFAULT 'Nuova Azienda')
RETURNS public.companies
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result  public.companies;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_init_company: utente non autenticato';
    END IF;

    INSERT INTO public.companies (user_id, company_name, cash, hq_city)
    VALUES (v_user_id, v_company_name, 15000, 'roma')
    ON CONFLICT (user_id) DO UPDATE
        SET company_name = EXCLUDED.company_name,
            updated_at   = now()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_buy_vehicle ─────────────────────────────────────────────────────
-- Transactionally deducts cash and inserts a new vehicle row.
-- Uses SELECT FOR UPDATE to prevent race-condition double-spend.
CREATE OR REPLACE FUNCTION public.rpc_buy_vehicle(
    v_model_id  text,
    v_price     bigint,
    v_hq_city   text DEFAULT 'roma'
)
RETURNS public.vehicles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id     uuid := auth.uid();
    v_company     public.companies;
    v_new_vehicle public.vehicles;
    v_plate       text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_buy_vehicle: utente non autenticato';
    END IF;

    -- Lock company row: prevents simultaneous purchases from draining cash below 0
    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_buy_vehicle: azienda non trovata — chiama prima rpc_init_company';
    END IF;

    IF v_price < 0 THEN
        RAISE EXCEPTION 'rpc_buy_vehicle: prezzo non valido (%)', v_price;
    END IF;

    IF v_company.cash < v_price THEN
        RAISE EXCEPTION 'rpc_buy_vehicle: fondi insufficienti — hai €% ma il veicolo costa €%',
            v_company.cash, v_price;
    END IF;

    -- Random Italian-style plate: CH-NNN-XX
    v_plate := 'CH-'
        || LPAD((FLOOR(RANDOM() * 900) + 100)::text, 3, '0')
        || '-'
        || CHR(65 + FLOOR(RANDOM() * 26)::int)
        || CHR(65 + FLOOR(RANDOM() * 26)::int);

    UPDATE public.companies
    SET cash = cash - v_price
    WHERE id = v_company.id;

    INSERT INTO public.vehicles (company_id, model_id, license_plate, current_city, status)
    VALUES (v_company.id, v_model_id, v_plate, v_hq_city, 'IDLE')
    RETURNING * INTO v_new_vehicle;

    RETURN v_new_vehicle;
END;
$$;


-- ─── RPC: rpc_start_trip ──────────────────────────────────────────────────────
-- Validates ownership, status, and co-location, then creates the trip.
-- For empty returns (EMPTY_RETURN), deducts fuel+toll cost from cash (no reward).
-- The client pre-calculates v_duration_ms from local game logic (speed, traffic, etc.).
-- The server applies Telepass bonus (-15%) independently.
CREATE OR REPLACE FUNCTION public.rpc_start_trip(
    v_vehicle_id       uuid,
    v_driver_id        uuid,
    v_end_city         text,
    v_reward           bigint,
    v_duration_ms      bigint,
    v_is_empty_return  boolean DEFAULT false
)
RETURNS public.active_trips
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_vehicle   public.vehicles;
    v_driver    public.drivers;
    v_trip      public.active_trips;
    v_actual_ms bigint;
    v_move_cost bigint := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_start_trip: utente non autenticato';
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_start_trip: azienda non trovata';
    END IF;

    -- ── Ownership checks ──────────────────────────────────────────────
    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE id = v_vehicle_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_start_trip: veicolo % non trovato o non di tua proprietà', v_vehicle_id;
    END IF;

    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = v_driver_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_start_trip: autista % non trovato o non di tua proprietà', v_driver_id;
    END IF;

    -- ── Status checks ─────────────────────────────────────────────────
    IF v_vehicle.status <> 'IDLE' THEN
        RAISE EXCEPTION 'rpc_start_trip: veicolo [%] non disponibile — stato corrente: %',
            v_vehicle.license_plate, v_vehicle.status;
    END IF;

    IF v_driver.status <> 'AVAILABLE' THEN
        RAISE EXCEPTION 'rpc_start_trip: autista [%] non disponibile — stato corrente: %',
            v_driver.name, v_driver.status;
    END IF;

    -- ── Co-location check ─────────────────────────────────────────────
    IF v_vehicle.current_city <> v_driver.current_city THEN
        RAISE EXCEPTION 'rpc_start_trip: veicolo (città: %) e autista (città: %) non coincidono',
            v_vehicle.current_city, v_driver.current_city;
    END IF;

    -- ── Apply Telepass bonus (-15% duration) ──────────────────────────
    v_actual_ms := v_duration_ms;
    IF v_vehicle.has_telepass THEN
        v_actual_ms := FLOOR(v_actual_ms * 0.85);
    END IF;

    -- ── Empty return: deduct costs, zero reward ───────────────────────
    IF v_is_empty_return THEN
        -- v_reward is passed by the client as the estimated total cost (fuel + tolls)
        v_move_cost := GREATEST(0, v_reward);
        v_reward    := 0;

        IF v_company.cash < v_move_cost THEN
            RAISE EXCEPTION 'rpc_start_trip: fondi insufficienti per rientro a vuoto — costo €%, disponibili €%',
                v_move_cost, v_company.cash;
        END IF;

        UPDATE public.companies
        SET cash = cash - v_move_cost
        WHERE id = v_company.id;
    END IF;

    -- ── Set vehicle and driver to busy ────────────────────────────────
    UPDATE public.vehicles SET status = 'ON_TRIP'  WHERE id = v_vehicle_id;
    UPDATE public.drivers  SET status = 'DRIVING'  WHERE id = v_driver_id;

    -- ── Insert trip ───────────────────────────────────────────────────
    INSERT INTO public.active_trips (
        company_id, vehicle_id, driver_id,
        start_city, end_city,
        end_time, reward_cash, trip_type
    ) VALUES (
        v_company.id, v_vehicle_id, v_driver_id,
        v_vehicle.current_city, v_end_city,
        now() + (v_actual_ms / 1000.0) * INTERVAL '1 second',
        v_reward,
        CASE WHEN v_is_empty_return THEN 'EMPTY_RETURN'::public.trip_type
             ELSE 'CLIENT_RIDE'::public.trip_type END
    ) RETURNING * INTO v_trip;

    RETURN v_trip;
END;
$$;


-- ─── RPC: rpc_claim_trip_reward ───────────────────────────────────────────────
-- Called by the client when it detects now() >= trip.end_time.
-- Server re-validates the timestamp: cheaters who send early claims are rejected.
-- On success: credits cash, resets vehicle+driver, removes active_trips row.
CREATE OR REPLACE FUNCTION public.rpc_claim_trip_reward(v_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_company public.companies;
    v_trip    public.active_trips;
    v_km      int;
    v_result  jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_claim_trip_reward: utente non autenticato';
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_claim_trip_reward: azienda non trovata';
    END IF;

    SELECT * INTO v_trip
    FROM public.active_trips
    WHERE id = v_trip_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_claim_trip_reward: viaggio non trovato (già riscosso o non appartiene a te)';
    END IF;

    -- ── Server-side time gate: reject early claims ────────────────────
    IF now() < v_trip.end_time THEN
        RAISE EXCEPTION 'rpc_claim_trip_reward: viaggio non ancora completato (fine prevista: %, ora server: %)',
            v_trip.end_time, now();
    END IF;

    -- ── Approximate km from elapsed time (avg 90 km/h) ───────────────
    v_km := GREATEST(1,
        FLOOR(EXTRACT(EPOCH FROM (v_trip.end_time - v_trip.start_time)) / 3600.0 * 90)::int
    );

    -- ── Award cash + reputation ───────────────────────────────────────
    UPDATE public.companies
    SET cash       = cash + v_trip.reward_cash,
        reputation = LEAST(5.0, reputation + 0.01)
    WHERE id = v_company.id;

    -- ── Update vehicle: IDLE, new city, add mileage ───────────────────
    UPDATE public.vehicles
    SET status       = 'IDLE',
        current_city = v_trip.end_city,
        mileage      = mileage + v_km,
        condition    = GREATEST(0, condition - 1)
    WHERE id = v_trip.vehicle_id;

    -- ── Update driver: AVAILABLE, new city, add fatigue ──────────────
    UPDATE public.drivers
    SET status       = 'AVAILABLE',
        current_city = v_trip.end_city,
        fatigue      = LEAST(100, fatigue + 8)
    WHERE id = v_trip.driver_id;

    -- ── Build result payload before deleting ─────────────────────────
    v_result := jsonb_build_object(
        'trip_id',     v_trip.id,
        'reward_cash', v_trip.reward_cash,
        'start_city',  v_trip.start_city,
        'end_city',    v_trip.end_city,
        'trip_type',   v_trip.trip_type,
        'km',          v_km
    );

    -- ── Remove from active trips ──────────────────────────────────────
    DELETE FROM public.active_trips WHERE id = v_trip.id;

    RETURN v_result;
END;
$$;


-- ─── GRANT RPC EXECUTE TO authenticated ───────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_init_company(text)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_vehicle(text, bigint, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_start_trip(uuid, uuid, text, bigint, bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_trip_reward(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public._my_company_id()                                    TO authenticated;


-- ─── LEADERBOARD SYNC TRIGGER ─────────────────────────────────────────────────
-- Keeps the existing public.leaderboard table in sync automatically
-- whenever companies.cash or reputation changes (via any RPC).
CREATE OR REPLACE FUNCTION public._sync_leaderboard_from_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.leaderboard (user_id, company_name, liquid_assets, reputation, last_active)
    VALUES (NEW.user_id, NEW.company_name, NEW.cash, NEW.reputation, now())
    ON CONFLICT (user_id) DO UPDATE SET
        company_name  = EXCLUDED.company_name,
        liquid_assets = EXCLUDED.liquid_assets,
        reputation    = EXCLUDED.reputation,
        last_active   = EXCLUDED.last_active;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_leaderboard ON public.companies;
CREATE TRIGGER trg_sync_leaderboard
    AFTER INSERT OR UPDATE OF cash, reputation, company_name ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public._sync_leaderboard_from_company();


-- =============================================================================
-- POST-MIGRATION CHECKLIST (manual steps in Supabase Dashboard):
--
-- 1. Database → Replication → Tables → enable Realtime for:
--      companies, vehicles, drivers, active_trips
--    (Realtime cannot be enabled via SQL in hosted Supabase)
--
-- 2. Verify RLS is ON for all 4 tables:
--      Dashboard → Table Editor → each table → RLS enabled
--
-- 3. Test an RPC in the SQL Editor:
--      SELECT * FROM public.rpc_init_company('Test Azienda');
--    (must be called as an authenticated user, or use service role to test)
-- =============================================================================
