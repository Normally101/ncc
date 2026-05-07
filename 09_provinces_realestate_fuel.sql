-- =============================================================================
-- 09_provinces_realestate_fuel.sql
-- Chauffeur Empire — Province War + Real Estate + Fuel Market
-- IDEMPOTENT: safe to re-run.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================
-- Dipende da: 01_mmo_migration.sql (auth.users, companies, _my_company_id())
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: PROVINCE WAR
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS provinces (
    id              TEXT         PRIMARY KEY,
    name            TEXT         NOT NULL,
    region_id       TEXT         NOT NULL,
    owner_id        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_company   TEXT,
    base_price      BIGINT       NOT NULL DEFAULT 200000,
    current_value   BIGINT       NOT NULL DEFAULT 200000,
    transit_tax_pct NUMERIC(5,4) NOT NULL DEFAULT 0.025,
    acquired_at     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE provinces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provinces_read_all"      ON provinces;
DROP POLICY IF EXISTS "provinces_write_rpc_only" ON provinces;

CREATE POLICY "provinces_read_all" ON provinces
    FOR SELECT USING (true);

-- Write only via SECURITY DEFINER RPCs — direct client writes blocked
CREATE POLICY "provinces_write_rpc_only" ON provinces
    FOR ALL USING (false) WITH CHECK (false);

-- Realtime: tutti i giocatori vedono i cambi di proprietà in tempo reale
ALTER PUBLICATION supabase_realtime ADD TABLE provinces;

-- ─── Seed: 5 province iniziali (libere, nessun proprietario) ─────────────────
INSERT INTO provinces (id, name, region_id, base_price, current_value) VALUES
    ('prov_roma',    'Roma Capitale',    'lazio',     500000, 500000),
    ('prov_milano',  'Grande Milano',    'lombardia', 800000, 800000),
    ('prov_firenze', 'Firenze Storica',  'toscana',   400000, 400000),
    ('prov_napoli',  'Napoli Metropoli', 'campania',  350000, 350000),
    ('prov_venezia', 'Venezia Laguna',   'veneto',    450000, 450000)
ON CONFLICT (id) DO NOTHING;

-- ─── RPC: Conquista una provincia (OPA al 120% del valore attuale) ────────────
CREATE OR REPLACE FUNCTION rpc_acquire_province(
    v_province_id TEXT,
    v_offer       BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prov      provinces%ROWTYPE;
    v_company   companies%ROWTYPE;
    v_min_offer BIGINT;
BEGIN
    -- Carica provincia con lock pessimistico
    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provincia non trovata: %', v_province_id;
    END IF;

    -- Carica azienda del compratore
    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata per questo utente';
    END IF;

    -- Impedisci auto-conquista
    IF v_prov.owner_id = auth.uid() THEN
        RAISE EXCEPTION 'Sei già il proprietario di questa provincia';
    END IF;

    -- Verifica offerta minima (120% del valore attuale)
    v_min_offer := CEIL(v_prov.current_value * 1.20);
    IF v_offer < v_min_offer THEN
        RAISE EXCEPTION 'Offerta insufficiente: minimo €% (120%% del valore attuale €%)',
            v_min_offer, v_prov.current_value;
    END IF;

    -- Verifica liquidità compratore
    IF v_company.cash < v_offer THEN
        RAISE EXCEPTION 'Fondi insufficienti: disponibili €%, necessari €%',
            v_company.cash, v_offer;
    END IF;

    -- Addebita compratore
    UPDATE companies SET cash = cash - v_offer WHERE user_id = auth.uid();

    -- Accredita 80% al vecchio proprietario (se esiste)
    IF v_prov.owner_id IS NOT NULL THEN
        UPDATE companies
           SET cash = cash + FLOOR(v_offer * 0.80)
         WHERE user_id = v_prov.owner_id;
    END IF;

    -- Trasferisci provincia
    UPDATE provinces SET
        owner_id      = auth.uid(),
        owner_company = v_company.company_name,
        current_value = v_offer,
        acquired_at   = NOW(),
        updated_at    = NOW()
    WHERE id = v_province_id;

    -- News pubblica
    INSERT INTO global_news (company_name, message, type)
    VALUES (
        v_company.company_name,
        v_company.company_name || ' ha conquistato la provincia di ' || v_prov.name || '! 🏴',
        'milestone'
    );

    RETURN jsonb_build_object(
        'success',         true,
        'province_name',   v_prov.name,
        'new_value',       v_offer,
        'previous_owner',  v_prov.owner_company
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_acquire_province(TEXT, BIGINT) TO authenticated;

-- ─── Helper interno: applica tassa di transito ────────────────────────────────
-- Chiamata da rpc_claim_trip_reward quando la corsa parte da una provincia.
-- Restituisce l'importo della tassa detratto (0 se nessun proprietario o auto-corsa).
CREATE OR REPLACE FUNCTION _apply_province_transit_tax(
    v_user_id     UUID,
    v_province_id TEXT,
    v_fare        BIGINT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prov  provinces%ROWTYPE;
    v_tax   BIGINT;
BEGIN
    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id;

    -- Nessuna provincia, nessun proprietario, o proprietario = mittente → nessuna tassa
    IF NOT FOUND OR v_prov.owner_id IS NULL OR v_prov.owner_id = v_user_id THEN
        RETURN 0;
    END IF;

    v_tax := GREATEST(1, FLOOR(v_fare * v_prov.transit_tax_pct));

    -- Accredita proprietario
    UPDATE companies SET cash = cash + v_tax WHERE user_id = v_prov.owner_id;

    RETURN v_tax;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: REAL ESTATE (Mercato Immobiliare)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS real_estate_listings (
    id          TEXT   PRIMARY KEY,
    city        TEXT   NOT NULL,
    name        TEXT   NOT NULL,
    description TEXT,
    cost        BIGINT NOT NULL,
    daily_rent  BIGINT NOT NULL,
    bonus_type  TEXT,   -- 'driver_stress_recovery' | NULL
    bonus_city  TEXT    -- città dove si applica il bonus
);

ALTER TABLE real_estate_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "re_listings_read_all" ON real_estate_listings;
CREATE POLICY "re_listings_read_all" ON real_estate_listings
    FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS company_real_estate (
    id           BIGSERIAL   PRIMARY KEY,
    company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    listing_id   TEXT        NOT NULL REFERENCES real_estate_listings(id),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_rent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, listing_id)
);

ALTER TABLE company_real_estate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cre_own" ON company_real_estate;
CREATE POLICY "cre_own" ON company_real_estate
    FOR ALL
    USING   (company_id = _my_company_id())
    WITH CHECK (company_id = _my_company_id());

ALTER PUBLICATION supabase_realtime ADD TABLE company_real_estate;

-- ─── Seed: 3 immobili disponibili ────────────────────────────────────────────
INSERT INTO real_estate_listings
    (id, city, name, description, cost, daily_rent, bonus_type, bonus_city)
VALUES
    ('re_milano_attico',
     'Milano', 'Attico CityLife',
     'Penthouse panoramica vista Tre Torri',
     5000000, 15000, 'driver_stress_recovery', 'milano'),

    ('re_roma_palazzo',
     'Roma', 'Palazzetto Trastevere',
     'Palazzo storico nel cuore di Roma',
     3500000, 10000, NULL, NULL),

    ('re_firenze_loft',
     'Firenze', 'Loft Ponte Vecchio',
     'Loft di design con vista sull''Arno',
     2000000, 6000, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── RPC: Acquista un immobile ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_buy_real_estate(
    v_listing_id TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_listing  real_estate_listings%ROWTYPE;
    v_company  companies%ROWTYPE;
BEGIN
    SELECT * INTO v_listing FROM real_estate_listings WHERE id = v_listing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Immobile non trovato: %', v_listing_id;
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    -- Già di proprietà?
    IF EXISTS (
        SELECT 1 FROM company_real_estate
        WHERE company_id = v_company.id AND listing_id = v_listing_id
    ) THEN
        RAISE EXCEPTION 'Immobile già di tua proprietà';
    END IF;

    -- Fondi sufficienti?
    IF v_company.cash < v_listing.cost THEN
        RAISE EXCEPTION 'Fondi insufficienti: disponibili €%, necessari €%',
            v_company.cash, v_listing.cost;
    END IF;

    -- Transazione
    UPDATE companies SET cash = cash - v_listing.cost WHERE id = v_company.id;

    INSERT INTO company_real_estate (company_id, listing_id)
    VALUES (v_company.id, v_listing_id);

    RETURN jsonb_build_object(
        'success',    true,
        'listing_id', v_listing_id,
        'name',       v_listing.name,
        'daily_rent', v_listing.daily_rent
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_buy_real_estate(TEXT) TO authenticated;

-- ─── RPC: Accredita rendite immobiliari (chiamata da cron / Edge Function) ─────
-- Sicura da richiamare più volte: aggiorna solo le righe con last_rent_at vecchio.
CREATE OR REPLACE FUNCTION rpc_credit_real_estate_rents()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rec    RECORD;
    v_total  BIGINT := 0;
    v_count  INT    := 0;
BEGIN
    FOR v_rec IN
        SELECT cre.id, cre.company_id, rel.daily_rent, rel.name
          FROM company_real_estate  cre
          JOIN real_estate_listings rel ON rel.id = cre.listing_id
         WHERE cre.last_rent_at < NOW() - INTERVAL '24 hours'
    LOOP
        UPDATE companies
           SET cash = cash + v_rec.daily_rent
         WHERE id = v_rec.company_id;

        UPDATE company_real_estate
           SET last_rent_at = NOW()
         WHERE id = v_rec.id;

        v_total := v_total + v_rec.daily_rent;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'credited_count', v_count,
        'total_rent',     v_total
    );
END;
$$;

-- Solo service_role (Edge Function) può chiamare questa RPC — non il browser
GRANT EXECUTE ON FUNCTION rpc_credit_real_estate_rents() TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 3: MERCATO CARBURANTE
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fuel_market (
    id         BIGSERIAL    PRIMARY KEY,
    price_eur  NUMERIC(6,4) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE fuel_market ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fuel_read_all" ON fuel_market;
CREATE POLICY "fuel_read_all" ON fuel_market
    FOR SELECT USING (true);

-- Realtime: il client aggiorna gameState.fuelPrice in automatico
ALTER PUBLICATION supabase_realtime ADD TABLE fuel_market;

-- ─── Seed: prezzo iniziale ────────────────────────────────────────────────────
INSERT INTO fuel_market (price_eur) VALUES (1.85);

-- ─── RPC: Aggiorna prezzo carburante (cron ogni ora, service_role) ────────────
-- Random walk ±5%, clampato tra €1.20 e €3.00
CREATE OR REPLACE FUNCTION rpc_update_fuel_price()
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_last  NUMERIC;
    v_delta NUMERIC;
    v_new   NUMERIC;
BEGIN
    SELECT price_eur INTO v_last
      FROM fuel_market
     ORDER BY updated_at DESC
     LIMIT 1;

    v_last := COALESCE(v_last, 1.85);

    v_delta := (RANDOM() * 0.10) - 0.05;   -- da -5% a +5%
    v_new   := GREATEST(1.20, LEAST(3.00, v_last * (1.0 + v_delta)));
    v_new   := ROUND(v_new, 4);

    INSERT INTO fuel_market (price_eur) VALUES (v_new);

    -- Mantieni solo le ultime 48 righe (48h di storico orario)
    DELETE FROM fuel_market
     WHERE id NOT IN (
         SELECT id FROM fuel_market ORDER BY updated_at DESC LIMIT 48
     );

    RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_update_fuel_price() TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 4: QUOTE CO2 PER MODELLO
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vehicle_co2_rates (
    model_id       TEXT         PRIMARY KEY,
    co2_per_km_kg  NUMERIC(6,4) NOT NULL DEFAULT 0.18
);

ALTER TABLE vehicle_co2_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co2_read_all" ON vehicle_co2_rates;
CREATE POLICY "co2_read_all" ON vehicle_co2_rates
    FOR SELECT USING (true);

INSERT INTO vehicle_co2_rates (model_id, co2_per_km_kg) VALUES
    ('stellar_e_exec',  0.18),   -- berlina business
    ('stellar_v_carr',  0.22),   -- van premium
    ('stellar_s_imp',   0.20),   -- ammiraglia presidenziale
    ('stellar_g_over',  0.28),   -- SUV blindato
    ('volt_s_apex',     0.00)    -- elettrica: ESENTE
ON CONFLICT (model_id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 5: VENDITA VEICOLI (RPC mancante — completamento blindatura)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_sell_vehicle(
    v_vehicle_id UUID,
    v_price      BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_company companies%ROWTYPE;
BEGIN
    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    -- Verifica che il veicolo appartenga all'azienda e sia inattivo
    IF NOT EXISTS (
        SELECT 1 FROM vehicles
         WHERE id = v_vehicle_id
           AND company_id = v_company.id
           AND status = 'IDLE'
    ) THEN
        RAISE EXCEPTION 'Veicolo non trovato, non di tua proprietà, o in servizio attivo';
    END IF;

    DELETE FROM vehicles WHERE id = v_vehicle_id;

    UPDATE companies SET cash = cash + v_price WHERE id = v_company.id;

    RETURN jsonb_build_object(
        'success',    true,
        'sold_price', v_price
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_sell_vehicle(UUID, BIGINT) TO authenticated;


-- =============================================================================
-- FINE 09_provinces_realestate_fuel.sql
-- Tabelle create:   provinces, real_estate_listings, company_real_estate,
--                   fuel_market, vehicle_co2_rates
-- RPCs create:      rpc_acquire_province, rpc_buy_real_estate,
--                   rpc_credit_real_estate_rents, rpc_update_fuel_price,
--                   rpc_sell_vehicle
-- Helper interno:   _apply_province_transit_tax
-- =============================================================================
