-- =============================================================================
-- 02_mmo_rpcs_extension.sql
-- Chauffeur Empire — MMO RPCs Extension
-- Continuation of 01_mmo_migration.sql
-- This script is IDEMPOTENT: safe to re-run.
-- Requires: 01_mmo_migration.sql already applied.
-- =============================================================================


-- =============================================================================
-- SECTION 1: ADD MISSING COLUMNS TO EXISTING TABLES (idempotent)
-- =============================================================================

-- ── vehicles: aggiungi fuel_level, tire_pressure, upgrades ───────────────────
ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS fuel_level     int     NOT NULL DEFAULT 100
        CHECK (fuel_level BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS tire_pressure  int     NOT NULL DEFAULT 100
        CHECK (tire_pressure BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS upgrades       text[]  NOT NULL DEFAULT '{}';

-- ── drivers: aggiungi salary, specialty ──────────────────────────────────────
ALTER TABLE public.drivers
    ADD COLUMN IF NOT EXISTS salary     int     NOT NULL DEFAULT 2000 CHECK (salary >= 0),
    ADD COLUMN IF NOT EXISTS specialty  text    DEFAULT NULL;


-- =============================================================================
-- SECTION 2: NEW TABLES
-- =============================================================================

-- ─── TABLE: company_investments ───────────────────────────────────────────────
-- Traccia gli investimenti (upgrade permanenti) acquistati dall'azienda.
CREATE TABLE IF NOT EXISTS public.company_investments (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    inv_id          text        NOT NULL,
    purchased_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, inv_id)
);

CREATE INDEX IF NOT EXISTS idx_investments_company ON public.company_investments(company_id);

-- ─── TABLE: company_loans ─────────────────────────────────────────────────────
-- Prestiti bancari attivi. Massimo 3 concorrenti per azienda.
CREATE TABLE IF NOT EXISTS public.company_loans (
    id              uuid            PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid            NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    principal       bigint          NOT NULL CHECK (principal > 0),
    remaining       bigint          NOT NULL CHECK (remaining >= 0),
    interest_rate   numeric(5,2)    NOT NULL CHECK (interest_rate >= 0),
    daily_payment   bigint          NOT NULL CHECK (daily_payment > 0),
    taken_at        timestamptz     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_company ON public.company_loans(company_id);

-- ─── TABLE: unlocked_regions ──────────────────────────────────────────────────
-- Regioni geografiche sbloccate da un'azienda per operare in nuove città.
CREATE TABLE IF NOT EXISTS public.unlocked_regions (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    region_id       text        NOT NULL,
    unlocked_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_regions_company ON public.unlocked_regions(company_id);

-- ─── TABLE: active_campaigns ──────────────────────────────────────────────────
-- Campagna marketing attiva. Al massimo 1 per azienda (UNIQUE su company_id).
CREATE TABLE IF NOT EXISTS public.active_campaigns (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id     text        NOT NULL,
    daily_cost      int         NOT NULL CHECK (daily_cost >= 0),
    started_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_company ON public.active_campaigns(company_id);


-- =============================================================================
-- SECTION 3: RLS FOR NEW TABLES
-- =============================================================================

ALTER TABLE public.company_investments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_loans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unlocked_regions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_campaigns     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investments_select_own"  ON public.company_investments;
CREATE POLICY "investments_select_own" ON public.company_investments
    FOR SELECT USING (company_id = public._my_company_id());

DROP POLICY IF EXISTS "loans_select_own" ON public.company_loans;
CREATE POLICY "loans_select_own" ON public.company_loans
    FOR SELECT USING (company_id = public._my_company_id());

DROP POLICY IF EXISTS "regions_select_own" ON public.unlocked_regions;
CREATE POLICY "regions_select_own" ON public.unlocked_regions
    FOR SELECT USING (company_id = public._my_company_id());

DROP POLICY IF EXISTS "campaigns_select_own" ON public.active_campaigns;
CREATE POLICY "campaigns_select_own" ON public.active_campaigns
    FOR SELECT USING (company_id = public._my_company_id());


-- =============================================================================
-- SECTION 4: RPCs
-- =============================================================================

-- ─── RPC: rpc_hire_driver ─────────────────────────────────────────────────────
-- Assume un nuovo autista, deducendo il costo di assunzione (stipendio × 2) dal cassa.
CREATE OR REPLACE FUNCTION public.rpc_hire_driver(
    v_name      text,
    v_salary    int,
    v_tier      text DEFAULT 'STANDARD'
)
RETURNS public.drivers
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id       uuid := auth.uid();
    v_company       public.companies;
    v_hiring_cost   int;
    v_new_driver    public.drivers;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_hire_driver: utente non autenticato';
    END IF;

    IF v_tier NOT IN ('STANDARD', 'BUSINESS', 'VIP', 'ULTRA') THEN
        RAISE EXCEPTION 'rpc_hire_driver: tier non valido — usa STANDARD, BUSINESS, VIP o ULTRA';
    END IF;

    IF v_salary < 0 THEN
        RAISE EXCEPTION 'rpc_hire_driver: stipendio non valido (%)', v_salary;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_hire_driver: azienda non trovata — chiama prima rpc_init_company';
    END IF;

    v_hiring_cost := v_salary * 2;

    IF v_company.cash < v_hiring_cost THEN
        RAISE EXCEPTION 'rpc_hire_driver: fondi insufficienti — costo assunzione €%, disponibili €%',
            v_hiring_cost, v_company.cash;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_hiring_cost
    WHERE id = v_company.id;

    INSERT INTO public.drivers (company_id, name, salary, tier, current_city, status)
    VALUES (v_company.id, v_name, v_salary, v_tier, v_company.hq_city, 'AVAILABLE')
    RETURNING * INTO v_new_driver;

    RETURN v_new_driver;
END;
$$;


-- ─── RPC: rpc_fire_driver ─────────────────────────────────────────────────────
-- Licenzia un autista. L'autista deve essere AVAILABLE (non in viaggio).
CREATE OR REPLACE FUNCTION public.rpc_fire_driver(v_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_driver    public.drivers;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_fire_driver: utente non autenticato';
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_fire_driver: azienda non trovata';
    END IF;

    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = v_driver_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_fire_driver: autista % non trovato o non di tua proprietà', v_driver_id;
    END IF;

    IF v_driver.status <> 'AVAILABLE' THEN
        RAISE EXCEPTION 'rpc_fire_driver: impossibile licenziare [%] — stato corrente: % (aspetta che torni disponibile)',
            v_driver.name, v_driver.status;
    END IF;

    DELETE FROM public.drivers WHERE id = v_driver_id;

    RETURN jsonb_build_object(
        'fired',     true,
        'driver_id', v_driver_id
    );
END;
$$;


-- ─── RPC: rpc_buy_investment ──────────────────────────────────────────────────
-- Acquista un investimento permanente per l'azienda.
-- L'unicità (company_id, inv_id) previene acquisti duplicati.
CREATE OR REPLACE FUNCTION public.rpc_buy_investment(
    v_inv_id    text,
    v_price     bigint
)
RETURNS public.company_investments
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_result    public.company_investments;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_buy_investment: utente non autenticato';
    END IF;

    IF v_price < 0 THEN
        RAISE EXCEPTION 'rpc_buy_investment: prezzo non valido (%)', v_price;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_buy_investment: azienda non trovata';
    END IF;

    -- Controllo duplicato esplicito prima del tentativo di INSERT
    IF EXISTS (
        SELECT 1 FROM public.company_investments
        WHERE company_id = v_company.id AND inv_id = v_inv_id
    ) THEN
        RAISE EXCEPTION 'rpc_buy_investment: investimento "%" già acquistato', v_inv_id;
    END IF;

    IF v_company.cash < v_price THEN
        RAISE EXCEPTION 'rpc_buy_investment: fondi insufficienti — hai €%, investimento costa €%',
            v_company.cash, v_price;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_price
    WHERE id = v_company.id;

    INSERT INTO public.company_investments (company_id, inv_id)
    VALUES (v_company.id, v_inv_id)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_buy_vehicle_upgrade ─────────────────────────────────────────────
-- Acquista un upgrade per un veicolo IDLE. Non applica duplicati.
CREATE OR REPLACE FUNCTION public.rpc_buy_vehicle_upgrade(
    v_vehicle_id    uuid,
    v_upgrade_id    text,
    v_price         bigint
)
RETURNS public.vehicles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_vehicle   public.vehicles;
    v_result    public.vehicles;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: utente non autenticato';
    END IF;

    IF v_price < 0 THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: prezzo non valido (%)', v_price;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: azienda non trovata';
    END IF;

    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE id = v_vehicle_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: veicolo % non trovato o non di tua proprietà', v_vehicle_id;
    END IF;

    IF v_vehicle.status <> 'IDLE' THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: il veicolo [%] deve essere fermo — stato corrente: %',
            v_vehicle.license_plate, v_vehicle.status;
    END IF;

    IF v_upgrade_id = ANY(v_vehicle.upgrades) THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: upgrade "%" già installato sul veicolo [%]',
            v_upgrade_id, v_vehicle.license_plate;
    END IF;

    IF v_company.cash < v_price THEN
        RAISE EXCEPTION 'rpc_buy_vehicle_upgrade: fondi insufficienti — hai €%, upgrade costa €%',
            v_company.cash, v_price;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_price
    WHERE id = v_company.id;

    UPDATE public.vehicles
    SET upgrades = array_append(upgrades, v_upgrade_id)
    WHERE id = v_vehicle_id
      AND NOT (v_upgrade_id = ANY(upgrades))
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_toggle_telepass ─────────────────────────────────────────────────
-- Attiva o disattiva il Telepass su un veicolo.
-- Se si attiva (has_telepass = false → true), deduce il costo.
-- Se si disattiva, nessuna deduzione.
CREATE OR REPLACE FUNCTION public.rpc_toggle_telepass(
    v_vehicle_id    uuid,
    v_cost          bigint
)
RETURNS public.vehicles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_vehicle   public.vehicles;
    v_result    public.vehicles;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_toggle_telepass: utente non autenticato';
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_toggle_telepass: azienda non trovata';
    END IF;

    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE id = v_vehicle_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_toggle_telepass: veicolo % non trovato o non di tua proprietà', v_vehicle_id;
    END IF;

    -- Attivazione: deduce il costo
    IF NOT v_vehicle.has_telepass THEN
        IF v_cost < 0 THEN
            RAISE EXCEPTION 'rpc_toggle_telepass: costo non valido (%)', v_cost;
        END IF;

        IF v_company.cash < v_cost THEN
            RAISE EXCEPTION 'rpc_toggle_telepass: fondi insufficienti — hai €%, attivazione costa €%',
                v_company.cash, v_cost;
        END IF;

        UPDATE public.companies
        SET cash = cash - v_cost
        WHERE id = v_company.id;
    END IF;

    UPDATE public.vehicles
    SET has_telepass = NOT has_telepass
    WHERE id = v_vehicle_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_start_marketing_campaign ───────────────────────────────────────
-- Avvia (o sostituisce) la campagna marketing attiva.
-- Il costo giornaliero viene detratto da rpc_collect_daily_costs, non qui.
-- UPSERT: solo 1 campagna per volta (UNIQUE su company_id).
CREATE OR REPLACE FUNCTION public.rpc_start_marketing_campaign(
    v_campaign_id   text,
    v_daily_cost    int
)
RETURNS public.active_campaigns
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_result    public.active_campaigns;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_start_marketing_campaign: utente non autenticato';
    END IF;

    IF v_daily_cost < 0 THEN
        RAISE EXCEPTION 'rpc_start_marketing_campaign: costo giornaliero non valido (%)', v_daily_cost;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_start_marketing_campaign: azienda non trovata';
    END IF;

    INSERT INTO public.active_campaigns (company_id, campaign_id, daily_cost, started_at)
    VALUES (v_company.id, v_campaign_id, v_daily_cost, now())
    ON CONFLICT (company_id) DO UPDATE
        SET campaign_id = EXCLUDED.campaign_id,
            daily_cost  = EXCLUDED.daily_cost,
            started_at  = EXCLUDED.started_at
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_stop_marketing_campaign ────────────────────────────────────────
-- Ferma la campagna marketing attiva dell'azienda.
CREATE OR REPLACE FUNCTION public.rpc_stop_marketing_campaign()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_stop_marketing_campaign: utente non autenticato';
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_stop_marketing_campaign: azienda non trovata';
    END IF;

    DELETE FROM public.active_campaigns
    WHERE company_id = v_company.id;

    RETURN jsonb_build_object('stopped', true);
END;
$$;


-- ─── RPC: rpc_take_loan ───────────────────────────────────────────────────────
-- Contrae un prestito bancario. Massimo 3 prestiti simultanei.
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

    SELECT COUNT(*) INTO v_loan_count
    FROM public.company_loans
    WHERE company_id = v_company.id;

    IF v_loan_count >= 3 THEN
        RAISE EXCEPTION 'rpc_take_loan: limite massimo di 3 prestiti simultanei raggiunto — rimborsa prima un prestito esistente';
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


-- ─── RPC: rpc_repay_loan ──────────────────────────────────────────────────────
-- Rimborsa parzialmente o totalmente un prestito.
-- Se remaining arriva a 0, il prestito viene eliminato.
CREATE OR REPLACE FUNCTION public.rpc_repay_loan(
    v_loan_id   uuid,
    v_amount    bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id       uuid := auth.uid();
    v_company       public.companies;
    v_loan          public.company_loans;
    v_actual_repaid bigint;
    v_remaining_after bigint;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_repay_loan: utente non autenticato';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'rpc_repay_loan: importo di rimborso non valido (%)', v_amount;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_repay_loan: azienda non trovata';
    END IF;

    SELECT * INTO v_loan
    FROM public.company_loans
    WHERE id = v_loan_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_repay_loan: prestito % non trovato o non appartiene alla tua azienda', v_loan_id;
    END IF;

    -- Rimborsa al massimo quanto rimane da pagare
    v_actual_repaid   := LEAST(v_amount, v_loan.remaining);
    v_remaining_after := GREATEST(0, v_loan.remaining - v_amount);

    IF v_company.cash < v_actual_repaid THEN
        RAISE EXCEPTION 'rpc_repay_loan: fondi insufficienti — hai €%, devi rimborsare €%',
            v_company.cash, v_actual_repaid;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_actual_repaid
    WHERE id = v_company.id;

    IF v_remaining_after = 0 THEN
        DELETE FROM public.company_loans WHERE id = v_loan_id;
    ELSE
        UPDATE public.company_loans
        SET remaining = v_remaining_after
        WHERE id = v_loan_id;
    END IF;

    RETURN jsonb_build_object(
        'repaid',           v_actual_repaid,
        'remaining_after',  v_remaining_after
    );
END;
$$;


-- ─── RPC: rpc_unlock_region ───────────────────────────────────────────────────
-- Sblocca una regione geografica per l'azienda.
CREATE OR REPLACE FUNCTION public.rpc_unlock_region(
    v_region_id text,
    v_price     bigint
)
RETURNS public.unlocked_regions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_result    public.unlocked_regions;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_unlock_region: utente non autenticato';
    END IF;

    IF v_price < 0 THEN
        RAISE EXCEPTION 'rpc_unlock_region: prezzo non valido (%)', v_price;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_unlock_region: azienda non trovata';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.unlocked_regions
        WHERE company_id = v_company.id AND region_id = v_region_id
    ) THEN
        RAISE EXCEPTION 'rpc_unlock_region: regione "%" già sbloccata', v_region_id;
    END IF;

    IF v_company.cash < v_price THEN
        RAISE EXCEPTION 'rpc_unlock_region: fondi insufficienti — hai €%, sblocco regione costa €%',
            v_company.cash, v_price;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_price
    WHERE id = v_company.id;

    INSERT INTO public.unlocked_regions (company_id, region_id)
    VALUES (v_company.id, v_region_id)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_refuel_vehicle ──────────────────────────────────────────────────
-- Rifornisce di carburante un veicolo. fuel_level non supera 100.
CREATE OR REPLACE FUNCTION public.rpc_refuel_vehicle(
    v_vehicle_id    uuid,
    v_fuel_amount   int,
    v_cost          bigint
)
RETURNS public.vehicles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_vehicle   public.vehicles;
    v_result    public.vehicles;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: utente non autenticato';
    END IF;

    IF v_fuel_amount <= 0 THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: quantità carburante non valida (%)', v_fuel_amount;
    END IF;

    IF v_cost < 0 THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: costo non valido (%)', v_cost;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: azienda non trovata';
    END IF;

    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE id = v_vehicle_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: veicolo % non trovato o non di tua proprietà', v_vehicle_id;
    END IF;

    IF v_company.cash < v_cost THEN
        RAISE EXCEPTION 'rpc_refuel_vehicle: fondi insufficienti — hai €%, rifornimento costa €%',
            v_company.cash, v_cost;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_cost
    WHERE id = v_company.id;

    UPDATE public.vehicles
    SET fuel_level = LEAST(100, fuel_level + v_fuel_amount)
    WHERE id = v_vehicle_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_repair_vehicle ──────────────────────────────────────────────────
-- Ripara completamente un veicolo IDLE o MAINTENANCE.
-- Ripristina condition = 100, tire_pressure = 100, status = 'IDLE'.
CREATE OR REPLACE FUNCTION public.rpc_repair_vehicle(
    v_vehicle_id    uuid,
    v_cost          bigint
)
RETURNS public.vehicles
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_vehicle   public.vehicles;
    v_result    public.vehicles;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_repair_vehicle: utente non autenticato';
    END IF;

    IF v_cost < 0 THEN
        RAISE EXCEPTION 'rpc_repair_vehicle: costo non valido (%)', v_cost;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_repair_vehicle: azienda non trovata';
    END IF;

    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE id = v_vehicle_id AND company_id = v_company.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_repair_vehicle: veicolo % non trovato o non di tua proprietà', v_vehicle_id;
    END IF;

    IF v_vehicle.status NOT IN ('IDLE', 'MAINTENANCE') THEN
        RAISE EXCEPTION 'rpc_repair_vehicle: impossibile riparare [%] — stato corrente: % (deve essere IDLE o MAINTENANCE)',
            v_vehicle.license_plate, v_vehicle.status;
    END IF;

    IF v_company.cash < v_cost THEN
        RAISE EXCEPTION 'rpc_repair_vehicle: fondi insufficienti — hai €%, riparazione costa €%',
            v_company.cash, v_cost;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_cost
    WHERE id = v_company.id;

    UPDATE public.vehicles
    SET condition      = 100,
        tire_pressure  = 100,
        status         = 'IDLE'
    WHERE id = v_vehicle_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── RPC: rpc_rest_ceo ────────────────────────────────────────────────────────
-- Il CEO si riposa in hotel. Costo in base alle stelle.
-- Lato client gestisce l'energia; il server deduce solo il costo e conferma.
CREATE OR REPLACE FUNCTION public.rpc_rest_ceo(
    v_hotel_stars   int,
    v_cost          bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_rest_ceo: utente non autenticato';
    END IF;

    IF v_hotel_stars < 1 OR v_hotel_stars > 5 THEN
        RAISE EXCEPTION 'rpc_rest_ceo: stelle hotel non valide (%) — inserisci un valore tra 1 e 5', v_hotel_stars;
    END IF;

    IF v_cost < 0 THEN
        RAISE EXCEPTION 'rpc_rest_ceo: costo non valido (%)', v_cost;
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_rest_ceo: azienda non trovata';
    END IF;

    IF v_company.cash < v_cost THEN
        RAISE EXCEPTION 'rpc_rest_ceo: fondi insufficienti — hai €%, pernottamento costa €%',
            v_company.cash, v_cost;
    END IF;

    UPDATE public.companies
    SET cash = cash - v_cost
    WHERE id = v_company.id;

    RETURN jsonb_build_object(
        'stars',            v_hotel_stars,
        'cost',             v_cost,
        'energy_recovered', v_hotel_stars * 20
    );
END;
$$;


-- ─── RPC: rpc_collect_daily_costs ────────────────────────────────────────────
-- Deduce i costi fissi giornalieri: campagna marketing + rate prestiti.
-- Per ogni prestito: scala daily_payment da remaining (min 0) e da cash (min 0).
-- Restituisce un riepilogo dei costi dedotti.
CREATE OR REPLACE FUNCTION public.rpc_collect_daily_costs()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id           uuid := auth.uid();
    v_company           public.companies;
    v_campaign          public.active_campaigns;
    v_loan              public.company_loans;
    v_campaign_cost     bigint := 0;
    v_loan_cost         bigint := 0;
    v_total_deducted    bigint := 0;
    v_payment_this_turn bigint;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_collect_daily_costs: utente non autenticato';
    END IF;

    SELECT * INTO v_company
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_collect_daily_costs: azienda non trovata';
    END IF;

    -- ── Campagna marketing ────────────────────────────────────────────
    SELECT * INTO v_campaign
    FROM public.active_campaigns
    WHERE company_id = v_company.id;

    IF FOUND THEN
        v_campaign_cost := LEAST(v_campaign.daily_cost, v_company.cash);
        -- Aggiorna cash locale per i calcoli successivi
        v_company.cash  := v_company.cash - v_campaign_cost;
    END IF;

    -- ── Prestiti attivi ───────────────────────────────────────────────
    FOR v_loan IN
        SELECT * FROM public.company_loans
        WHERE company_id = v_company.id AND remaining > 0
        FOR UPDATE
    LOOP
        -- Quanto possiamo pagare questa rata
        v_payment_this_turn := LEAST(v_loan.daily_payment, v_loan.remaining, v_company.cash);

        -- Aggiorna remaining del prestito
        UPDATE public.company_loans
        SET remaining = GREATEST(0, remaining - v_payment_this_turn)
        WHERE id = v_loan.id;

        -- Elimina prestito completamente rimborsato
        DELETE FROM public.company_loans
        WHERE id = v_loan.id AND remaining = 0;

        v_loan_cost    := v_loan_cost + v_payment_this_turn;
        v_company.cash := v_company.cash - v_payment_this_turn;
    END LOOP;

    v_total_deducted := v_campaign_cost + v_loan_cost;

    -- ── Applica tutte le deduzioni in un'unica UPDATE ─────────────────
    IF v_total_deducted > 0 THEN
        UPDATE public.companies
        SET cash = GREATEST(0, cash - v_total_deducted)
        WHERE id = v_company.id;
    END IF;

    RETURN jsonb_build_object(
        'campaign_cost',    v_campaign_cost,
        'loan_cost',        v_loan_cost,
        'total_deducted',   v_total_deducted
    );
END;
$$;


-- =============================================================================
-- SECTION 5: GRANT EXECUTE TO authenticated
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.rpc_hire_driver(text, int, text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fire_driver(uuid)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_investment(text, bigint)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_buy_vehicle_upgrade(uuid, text, bigint)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_telepass(uuid, bigint)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_start_marketing_campaign(text, int)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_stop_marketing_campaign()                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_take_loan(bigint, numeric, bigint)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_repay_loan(uuid, bigint)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_unlock_region(text, bigint)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_refuel_vehicle(uuid, int, bigint)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_repair_vehicle(uuid, bigint)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rest_ceo(int, bigint)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_collect_daily_costs()                                 TO authenticated;


-- =============================================================================
-- POST-MIGRATION CHECKLIST (passi manuali in Supabase Dashboard):
--
-- 1. Database → Replication → Tables → abilita Realtime per le nuove tabelle:
--      company_investments, company_loans, unlocked_regions, active_campaigns
--
-- 2. Verifica RLS attivo su tutte le 4 nuove tabelle:
--      Dashboard → Table Editor → ogni tabella → RLS enabled
--
-- 3. Test di un RPC nella SQL Editor (come utente autenticato):
--      SELECT * FROM public.rpc_hire_driver('Mario Rossi', 2500, 'STANDARD');
--      SELECT * FROM public.rpc_take_loan(50000, 5.50, 1000);
--      SELECT * FROM public.rpc_collect_daily_costs();
-- =============================================================================
