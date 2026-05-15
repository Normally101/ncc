-- ============================================================
-- 19_b2b_contracts.sql — Chauffeur Empire
-- Espansione 9: Contratti Corporate B2B (Farming Passivo)
-- ============================================================

-- ── TABELLE ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.b2b_contracts (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    title           TEXT    NOT NULL,
    client_name     TEXT    NOT NULL,
    client_icon     TEXT    DEFAULT '🏢',
    province_id     TEXT,
    required_tier   TEXT    DEFAULT 'BUSINESS',  -- BUSINESS | PREMIUM | PRESIDENTIAL | ARMORED | ULTRA
    required_count  INT     DEFAULT 3,
    daily_payout    BIGINT  NOT NULL,
    duration_days   INT     NOT NULL DEFAULT 7,
    penalty_amount  BIGINT  NOT NULL,
    rep_bonus       NUMERIC DEFAULT 0.5,
    rep_penalty     NUMERIC DEFAULT 1.0,
    min_reputation  NUMERIC DEFAULT 1.0,
    available_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.b2b_active_contracts (
    id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id      UUID    REFERENCES public.b2b_contracts(id) ON DELETE SET NULL,
    user_id          UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
    locked_vehicles  JSONB   DEFAULT '[]',   -- array di vehicleId dal gameState.fleet
    locked_drivers   JSONB   DEFAULT '[]',   -- array di driverId
    daily_payout     BIGINT  NOT NULL,
    days_total       INT     NOT NULL,
    days_remaining   INT     NOT NULL,
    sla_score        NUMERIC DEFAULT 100.0,
    next_payout_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
    status           TEXT    DEFAULT 'active',  -- active | completed | breached
    contract_title   TEXT,
    contract_client  TEXT,
    contract_icon    TEXT    DEFAULT '🏢',
    penalty_amount   BIGINT  NOT NULL DEFAULT 0,
    rep_bonus        NUMERIC DEFAULT 0.5,
    rep_penalty      NUMERIC DEFAULT 1.0,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_active_user   ON public.b2b_active_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_b2b_active_status ON public.b2b_active_contracts(status);
CREATE INDEX IF NOT EXISTS idx_b2b_active_payout ON public.b2b_active_contracts(next_payout_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.b2b_contracts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_active_contracts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "b2b_contracts_public_read"
      ON public.b2b_contracts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "b2b_active_own"
      ON public.b2b_active_contracts FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: contratti disponibili ───────────────────────────────────────────────

INSERT INTO public.b2b_contracts
    (title, client_name, client_icon, province_id, required_tier, required_count,
     daily_payout, duration_days, penalty_amount, rep_bonus, rep_penalty, min_reputation)
VALUES
    ('Trasporto Dirigenti Senior',   'Banca Nazionale d''Italia',  '🏛️', NULL,         'BUSINESS',     3,  45000,  7,  200000, 0.5, 1.0, 1.5),
    ('Servizio Diplomatico USA',     'Ambasciata Americana',       '🇺🇸', 'prov_roma',  'PRESIDENTIAL', 4,  110000, 7,  500000, 0.8, 1.5, 3.0),
    ('Crew Transfer Aereo',          'Alitalia Prime',             '✈️', NULL,         'BUSINESS',     2,  22000,  5,  80000,  0.3, 0.8, 1.0),
    ('Servizio VIP Ferrari',         'Ferrari S.p.A.',             '🐴', 'prov_milano','PREMIUM',      5,  140000, 10, 700000, 1.0, 2.0, 3.5),
    ('Delegazione Governo',          'Presidenza del Consiglio',   '🇮🇹', 'prov_roma',  'PRESIDENTIAL', 6,  180000, 14, 900000, 1.2, 2.0, 4.0),
    ('Tour Luxury Costiera',         'Grand Hotel Excelsior',      '🏖️', 'prov_amalfi','PREMIUM',      3,  65000,  5,  250000, 0.6, 1.0, 2.0),
    ('Fleet Fashion Week',           'Versace International',      '👗', 'prov_milano','PREMIUM',      8,  220000, 4,  800000, 1.5, 2.5, 4.0),
    ('Appalto Cantiere Navale',      'Fincantieri S.p.A.',         '⚓', NULL,         'BUSINESS',     2,  18000,  7,  70000,  0.2, 0.5, 0.5),
    ('Sicurezza Summit G7',          'Ministero degli Interni',    '🛡️', NULL,         'ARMORED',      4,  300000, 3,  1200000,1.8, 3.0, 4.5),
    ('Servizio Notte F1 Monza',      'Formula One Management',     '🏎️', 'prov_milano','PREMIUM',      6,  190000, 4,  600000, 1.0, 2.0, 3.0),
    ('Transfer Atleti Olimpici',     'CONI',                       '🏅', NULL,         'BUSINESS',     4,  38000,  14, 150000, 0.4, 0.8, 1.5),
    ('Servizio Casino di Venezia',   'Casinò di Venezia',          '🎰', 'prov_venezia','PREMIUM',     3,  75000,  7,  300000, 0.6, 1.2, 2.5)
ON CONFLICT DO NOTHING;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Ottieni contratti disponibili per l'utente (rispetta min_rep)
CREATE OR REPLACE FUNCTION public.rpc_get_b2b_contracts()
RETURNS SETOF public.b2b_contracts
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT * FROM public.b2b_contracts
    WHERE available_until > NOW()
    ORDER BY daily_payout DESC;
$$;

-- Accetta un contratto B2B
CREATE OR REPLACE FUNCTION public.rpc_accept_b2b_contract(
    v_contract_id   UUID,
    v_vehicle_ids   JSONB,  -- es. ["c_123", "c_456"]
    v_driver_ids    JSONB   -- es. ["d_1", "d_2"]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_contract  public.b2b_contracts%ROWTYPE;
    v_rep       NUMERIC;
    v_active_id UUID;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    -- Carica contratto
    SELECT * INTO v_contract FROM public.b2b_contracts WHERE id = v_contract_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contratto non trovato'; END IF;
    IF v_contract.available_until < NOW() THEN RAISE EXCEPTION 'Contratto scaduto'; END IF;

    -- Controlla contratto attivo esistente
    IF EXISTS (
        SELECT 1 FROM public.b2b_active_contracts
        WHERE user_id = v_uid AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Hai già un contratto B2B attivo. Terminalo prima.';
    END IF;

    -- Controlla reputazione
    SELECT reputation INTO v_rep FROM public.companies WHERE user_id = v_uid;
    IF COALESCE(v_rep, 0) < v_contract.min_reputation THEN
        RAISE EXCEPTION 'Reputazione insufficiente (serve %.1f★)', v_contract.min_reputation;
    END IF;

    -- Controlla numero veicoli
    IF jsonb_array_length(v_vehicle_ids) < v_contract.required_count THEN
        RAISE EXCEPTION 'Veicoli insufficienti (servono %)', v_contract.required_count;
    END IF;

    -- Crea contratto attivo
    INSERT INTO public.b2b_active_contracts (
        contract_id, user_id, locked_vehicles, locked_drivers,
        daily_payout, days_total, days_remaining, next_payout_at,
        contract_title, contract_client, contract_icon,
        penalty_amount, rep_bonus, rep_penalty
    ) VALUES (
        v_contract_id, v_uid, v_vehicle_ids, v_driver_ids,
        v_contract.daily_payout, v_contract.duration_days, v_contract.duration_days,
        NOW() + INTERVAL '1 day',
        v_contract.title, v_contract.client_name, v_contract.client_icon,
        v_contract.penalty_amount, v_contract.rep_bonus, v_contract.rep_penalty
    ) RETURNING id INTO v_active_id;

    RETURN jsonb_build_object(
        'id',             v_active_id,
        'daily_payout',   v_contract.daily_payout,
        'days_remaining', v_contract.duration_days,
        'title',          v_contract.title,
        'client',         v_contract.client_name,
        'penalty',        v_contract.penalty_amount
    );
END;
$$;

-- Tick giornaliero B2B — chiamata da processDailyRoutines in engine.js
CREATE OR REPLACE FUNCTION public.rpc_b2b_daily_tick()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_active public.b2b_active_contracts%ROWTYPE;
    v_payout BIGINT := 0;
    v_result JSONB;
BEGIN
    IF v_uid IS NULL THEN RETURN NULL; END IF;

    SELECT * INTO v_active
    FROM public.b2b_active_contracts
    WHERE user_id = v_uid AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_active.next_payout_at > NOW() THEN RETURN NULL; END IF;

    v_payout := v_active.daily_payout;

    -- Paga il giocatore
    UPDATE public.companies
    SET cash = cash + v_payout, liquid_assets = liquid_assets + v_payout
    WHERE user_id = v_uid;

    -- Aggiorna giorni rimanenti
    UPDATE public.b2b_active_contracts
    SET days_remaining = days_remaining - 1,
        next_payout_at = NOW() + INTERVAL '1 day'
    WHERE id = v_active.id;

    -- Contratto completato?
    IF v_active.days_remaining <= 1 THEN
        UPDATE public.b2b_active_contracts SET status = 'completed' WHERE id = v_active.id;
        UPDATE public.companies
        SET reputation = LEAST(5.0, reputation + v_active.rep_bonus)
        WHERE user_id = v_uid;

        RETURN jsonb_build_object(
            'payout', v_payout, 'completed', true, 'breached', false,
            'rep_bonus', v_active.rep_bonus, 'title', v_active.contract_title
        );
    END IF;

    RETURN jsonb_build_object(
        'payout', v_payout, 'completed', false, 'breached', false,
        'days_remaining', v_active.days_remaining - 1, 'title', v_active.contract_title
    );
END;
$$;

-- Terminazione anticipata con penale
CREATE OR REPLACE FUNCTION public.rpc_terminate_b2b_contract(v_active_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_active  public.b2b_active_contracts%ROWTYPE;
    v_cash    BIGINT;
    v_penalty BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_active
    FROM public.b2b_active_contracts
    WHERE id = v_active_id AND user_id = v_uid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Contratto non trovato o non attivo'; END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    v_penalty := LEAST(v_cash, v_active.penalty_amount);

    UPDATE public.companies
    SET cash         = cash - v_penalty,
        liquid_assets = GREATEST(0, liquid_assets - v_penalty),
        reputation   = GREATEST(0.0, reputation - v_active.rep_penalty)
    WHERE user_id = v_uid;

    UPDATE public.b2b_active_contracts SET status = 'breached' WHERE id = v_active_id;

    RETURN jsonb_build_object(
        'penalty',     v_penalty,
        'rep_penalty', v_active.rep_penalty
    );
END;
$$;

-- Notifica SLA breach (chiamata da p2p/engine quando un veicolo B2B si rompe)
CREATE OR REPLACE FUNCTION public.rpc_b2b_sla_event(v_vehicle_id TEXT, v_event TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_delta NUMERIC := CASE v_event
        WHEN 'breakdown'  THEN -15.0
        WHEN 'accident'   THEN -25.0
        WHEN 'gdf_seized' THEN -40.0
        ELSE -10.0
    END;
BEGIN
    UPDATE public.b2b_active_contracts
    SET sla_score = GREATEST(0, sla_score + v_delta)
    WHERE user_id = v_uid AND status = 'active'
      AND locked_vehicles @> to_jsonb(v_vehicle_id);

    -- Auto-breach se SLA < 50
    UPDATE public.b2b_active_contracts
    SET status = 'breached'
    WHERE user_id = v_uid AND status = 'active' AND sla_score < 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_b2b_contracts()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_accept_b2b_contract(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_daily_tick()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_terminate_b2b_contract(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_sla_event(TEXT, TEXT)              TO authenticated;
