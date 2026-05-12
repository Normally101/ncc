-- =============================================================================
-- 16_territory_war.sql
-- Chauffeur Empire — Guerra Territoriale a Livelli
-- Extends: 09_provinces_realestate_fuel.sql (provinces, _apply_province_transit_tax)
-- Depends:  01_mmo_migration.sql (companies, auth.users, _my_company_id, rpc_claim_trip_reward)
-- IDEMPOTENT: safe to re-run.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: TABELLA REGIONS
-- Ogni regione ha un governor (il giocatore con >50% delle province).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regions (
    id               TEXT         PRIMARY KEY,         -- corrisponde a POIS[x].region
    name             TEXT         NOT NULL,
    governor_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    governor_company TEXT,
    region_tax_pct   NUMERIC(5,4) NOT NULL DEFAULT 0.010, -- 1% tassa regionale
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_read_all" ON regions;
CREATE POLICY "regions_read_all" ON regions FOR SELECT USING (true);

-- Write solo via RPC SECURITY DEFINER
DROP POLICY IF EXISTS "regions_write_rpc_only" ON regions;
CREATE POLICY "regions_write_rpc_only" ON regions
    FOR ALL USING (false) WITH CHECK (false);

ALTER PUBLICATION supabase_realtime ADD TABLE regions;

-- Seed: tutte le regioni del gioco
INSERT INTO regions (id, name) VALUES
    ('lazio',       'Lazio'),
    ('umbria',      'Umbria'),
    ('marche',      'Marche'),
    ('abruzzo',     'Abruzzo'),
    ('molise',      'Molise'),
    ('toscana',     'Toscana'),
    ('campania',    'Campania'),
    ('puglia',      'Puglia'),
    ('basilicata',  'Basilicata'),
    ('calabria',    'Calabria'),
    ('sicilia',     'Sicilia'),
    ('sardegna',    'Sardegna'),
    ('emilia',      'Emilia-Romagna'),
    ('liguria',     'Liguria'),
    ('piemonte',    'Piemonte'),
    ('lombardia',   'Lombardia'),
    ('veneto',      'Veneto'),
    ('friuli',      'Friuli-Venezia Giulia'),
    ('trentino',    'Trentino-Alto Adige'),
    ('valle_aosta', 'Valle d''Aosta')
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: ESTENDI TABELLA PROVINCES
-- Aggiungi: mapped_pois (POI ids che appartengono alla provincia),
--           required_influence (soglia punti influenza per lanciare l'OPA).
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE provinces
    ADD COLUMN IF NOT EXISTS mapped_pois         TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS required_influence  INTEGER NOT NULL DEFAULT 500;

-- Indice GIN per ricerche rapide su poi_id dentro l'array
CREATE INDEX IF NOT EXISTS idx_provinces_mapped_pois
    ON provinces USING GIN (mapped_pois);

-- Aggiorna le province esistenti con POI mapping e soglia influenza
UPDATE provinces SET
    mapped_pois        = ARRAY['roma', 'roma_fco', 'roma_hassler'],
    required_influence = 500
WHERE id = 'prov_roma';

UPDATE provinces SET
    mapped_pois        = ARRAY['milano', 'mil_mxp', 'mil_lin', 'mil_armani'],
    required_influence = 800
WHERE id = 'prov_milano';

UPDATE provinces SET
    mapped_pois        = ARRAY['firenze'],
    required_influence = 400
WHERE id = 'prov_firenze';

UPDATE provinces SET
    mapped_pois        = ARRAY['napoli', 'nap_capo'],
    required_influence = 350
WHERE id = 'prov_napoli';

UPDATE provinces SET
    mapped_pois        = ARRAY['venezia', 'ven_mp'],
    required_influence = 450
WHERE id = 'prov_venezia';

-- Nuove province (coprono il resto dei POI di gioco)
INSERT INTO provinces (id, name, region_id, base_price, current_value, transit_tax_pct, mapped_pois, required_influence) VALUES
    ('prov_civita',   'Civitavecchia e Litorale',  'lazio',       220000, 220000, 0.020, ARRAY['civitavecchia'],            250),
    ('prov_como',     'Laghi Lombardi',             'lombardia',   350000, 350000, 0.022, ARRAY['como'],                     350),
    ('prov_amalfi',   'Costiera Amalfitana',        'campania',    300000, 300000, 0.025, ARRAY['sorrento','amalfi'],         300),
    ('prov_cortina',  'Dolomiti Venete',            'veneto',      280000, 280000, 0.022, ARRAY['cortina'],                  280),
    ('prov_padova',   'Padova e Marco Polo',        'veneto',      240000, 240000, 0.020, ARRAY['ven_mp'],                   240),
    ('prov_bari',     'Puglia Adriatica',           'puglia',      320000, 320000, 0.022, ARRAY['bari','brindisi','lecce'],  320),
    ('prov_egnazia',  'Puglia Luxury',              'puglia',      400000, 400000, 0.030, ARRAY['borgo_egnazia'],            400),
    ('prov_palermo',  'Sicilia Occidentale',        'sicilia',     300000, 300000, 0.022, ARRAY['palermo','catania'],        300),
    ('prov_taormina', 'Sicilia Orientale',          'sicilia',     350000, 350000, 0.025, ARRAY['taormina'],                 350),
    ('prov_cagliari', 'Sardegna Meridionale',       'sardegna',    350000, 350000, 0.022, ARRAY['cagliari','olbia'],        350),
    ('prov_cervo',    'Costa Smeralda',             'sardegna',    600000, 600000, 0.035, ARRAY['porto_cervo'],              600),
    ('prov_genova',   'Liguria',                    'liguria',     380000, 380000, 0.025, ARRAY['genova','portofino','splendido'], 380),
    ('prov_bologna',  'Emilia-Romagna',             'emilia',      300000, 300000, 0.020, ARRAY['bologna'],                  300),
    ('prov_torino',   'Piemonte',                   'piemonte',    280000, 280000, 0.020, ARRAY['torino'],                   280),
    ('prov_trieste',  'Friuli',                     'friuli',      260000, 260000, 0.020, ARRAY['trieste'],                  260),
    ('prov_trento',   'Trentino',                   'trentino',    250000, 250000, 0.020, ARRAY['trento'],                   250),
    ('prov_perugia',  'Umbria e Marche',            'umbria',      240000, 240000, 0.020, ARRAY['perugia','ancona'],        240),
    ('prov_aosta',    'Valle d''Aosta',             'valle_aosta', 220000, 220000, 0.020, ARRAY['aosta'],                    220)
ON CONFLICT (id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 3: TABELLA PLAYER_PROVINCE_INFLUENCE
-- Traccia i Punti Influenza di ogni giocatore in ogni singola provincia.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS player_province_influence (
    user_id     UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    province_id TEXT        NOT NULL REFERENCES provinces(id)     ON DELETE CASCADE,
    influence   INTEGER     NOT NULL DEFAULT 0 CHECK (influence >= 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, province_id)
);

CREATE INDEX IF NOT EXISTS idx_ppi_user   ON player_province_influence (user_id);
CREATE INDEX IF NOT EXISTS idx_ppi_prov   ON player_province_influence (province_id);

ALTER TABLE player_province_influence ENABLE ROW LEVEL SECURITY;

-- Ogni giocatore vede solo la propria influenza
DROP POLICY IF EXISTS "ppi_own" ON player_province_influence;
CREATE POLICY "ppi_own" ON player_province_influence
    FOR SELECT USING (user_id = auth.uid());

-- Write solo via SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "ppi_write_rpc_only" ON player_province_influence;
CREATE POLICY "ppi_write_rpc_only" ON player_province_influence
    FOR ALL USING (false) WITH CHECK (false);


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 4: RPC — Aggiungi Punti Influenza
-- Chiamata dal client dopo ogni corsa completata che parte o arriva in una
-- provincia mappata. Accredita 10 punti di default (configurabile).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_add_province_influence(
    v_province_id TEXT,
    v_amount      INTEGER DEFAULT 10
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_prov     provinces%ROWTYPE;
    v_new_inf  INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provincia non trovata: %', v_province_id;
    END IF;

    INSERT INTO player_province_influence (user_id, province_id, influence, updated_at)
    VALUES (v_user_id, v_province_id, v_amount, NOW())
    ON CONFLICT (user_id, province_id)
    DO UPDATE SET
        influence  = player_province_influence.influence + EXCLUDED.influence,
        updated_at = NOW()
    RETURNING influence INTO v_new_inf;

    RETURN jsonb_build_object(
        'province_id',    v_province_id,
        'province_name',  v_prov.name,
        'influence',      v_new_inf,
        'threshold',      v_prov.required_influence,
        'unlocked',       v_new_inf >= v_prov.required_influence
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_add_province_influence(TEXT, INTEGER) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 5: FUNZIONE INTERNA — Aggiorna Governatore Regione
-- Chiamata automaticamente dopo ogni cambio di proprietà di una provincia.
-- Chi possiede >50% delle province di una regione diventa governatore.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _refresh_region_governor(v_region_id TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_provinces   INTEGER;
    v_winner_id         UUID;
    v_winner_count      INTEGER;
    v_winner_company    TEXT;
BEGIN
    -- Totale province nella regione
    SELECT COUNT(*) INTO v_total_provinces
    FROM provinces
    WHERE region_id = v_region_id;

    IF v_total_provinces = 0 THEN
        RETURN NULL;
    END IF;

    -- Trova il giocatore con più province nella regione (>50%)
    SELECT owner_id, owner_company, COUNT(*) AS cnt
    INTO v_winner_id, v_winner_company, v_winner_count
    FROM provinces
    WHERE region_id = v_region_id
      AND owner_id IS NOT NULL
    GROUP BY owner_id, owner_company
    ORDER BY cnt DESC
    LIMIT 1;

    -- Solo se supera il 50%
    IF v_winner_count IS NULL OR (v_winner_count * 2) <= v_total_provinces THEN
        -- Nessun governatore (nessuno ha la maggioranza assoluta)
        UPDATE regions SET
            governor_id      = NULL,
            governor_company = NULL,
            updated_at       = NOW()
        WHERE id = v_region_id;
        RETURN NULL;
    END IF;

    -- Aggiorna il governatore
    UPDATE regions SET
        governor_id      = v_winner_id,
        governor_company = v_winner_company,
        updated_at       = NOW()
    WHERE id = v_region_id;

    -- Notifica globale solo quando il governatore cambia
    IF (SELECT governor_id FROM regions WHERE id = v_region_id) IS DISTINCT FROM v_winner_id THEN
        INSERT INTO global_news (company_name, message, type)
        VALUES (
            v_winner_company,
            v_winner_company || ' è diventato Governatore della ' ||
                (SELECT name FROM regions WHERE id = v_region_id) || '! 👑',
            'milestone'
        );
    END IF;

    RETURN v_winner_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 6: FUNZIONE TASSAZIONE A PIRAMIDE
-- Sostituisce _apply_province_transit_tax per aggiungere la tassa regionale.
-- Ritorna JSONB con dettaglio delle tasse applicate.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _apply_territory_taxes(
    v_user_id     UUID,
    v_province_id TEXT,
    v_fare        BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_prov          provinces%ROWTYPE;
    v_reg           regions%ROWTYPE;
    v_prov_tax      BIGINT := 0;
    v_reg_tax       BIGINT := 0;
BEGIN
    -- Carica provincia
    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('province_tax', 0, 'region_tax', 0, 'total_tax', 0);
    END IF;

    -- ── Tassa Provinciale (es. 2.5%) ──────────────────────────────────────────
    -- Non applicata se il giocatore è il proprietario della provincia
    IF v_prov.owner_id IS NOT NULL AND v_prov.owner_id <> v_user_id THEN
        v_prov_tax := GREATEST(1, FLOOR(v_fare * v_prov.transit_tax_pct));
        UPDATE companies SET cash = cash + v_prov_tax WHERE user_id = v_prov.owner_id;
    END IF;

    -- ── Tassa Regionale (1%) ────────────────────────────────────────────────
    -- Carica la regione
    SELECT * INTO v_reg FROM regions WHERE id = v_prov.region_id;

    -- Non applicata se il giocatore è il governatore, o se nessun governatore
    IF FOUND AND v_reg.governor_id IS NOT NULL AND v_reg.governor_id <> v_user_id THEN
        v_reg_tax := GREATEST(1, FLOOR(v_fare * v_reg.region_tax_pct));
        UPDATE companies SET cash = cash + v_reg_tax WHERE user_id = v_reg.governor_id;
    END IF;

    RETURN jsonb_build_object(
        'province_tax',    v_prov_tax,
        'region_tax',      v_reg_tax,
        'total_tax',       v_prov_tax + v_reg_tax,
        'province_owner',  v_prov.owner_company,
        'governor',        v_reg.governor_company
    );
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 7: AGGIORNA rpc_claim_trip_reward
-- Integra tassazione a piramide + accredita influenza al giocatore.
-- Variante idempotente: sostituisce la funzione esistente completamente.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_claim_trip_reward(v_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_company   public.companies;
    v_trip      public.active_trips;
    v_km        int;
    v_result    jsonb;
    -- Territory
    v_prov_from provinces%ROWTYPE;
    v_prov_to   provinces%ROWTYPE;
    v_taxes     jsonb;
    v_inf_from  jsonb;
    v_inf_to    jsonb;
    v_net_cash  bigint;
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

    IF now() < v_trip.end_time THEN
        RAISE EXCEPTION 'rpc_claim_trip_reward: viaggio non ancora completato (fine prevista: %, ora server: %)',
            v_trip.end_time, now();
    END IF;

    -- ── Km approssimati (90 km/h) ────────────────────────────────────────────
    v_km := GREATEST(1,
        FLOOR(EXTRACT(EPOCH FROM (v_trip.end_time - v_trip.start_time)) / 3600.0 * 90)::int
    );

    -- ── Lookup provincia di partenza e destinazione ───────────────────────────
    SELECT * INTO v_prov_from FROM provinces
    WHERE v_trip.start_city = ANY(mapped_pois)
    LIMIT 1;

    SELECT * INTO v_prov_to FROM provinces
    WHERE v_trip.end_city = ANY(mapped_pois)
    LIMIT 1;

    -- ── Calcola e applica tasse territoriali (provincia di partenza) ──────────
    v_taxes := jsonb_build_object('province_tax', 0, 'region_tax', 0, 'total_tax', 0);
    IF v_prov_from.id IS NOT NULL THEN
        v_taxes := _apply_territory_taxes(v_user_id, v_prov_from.id, v_trip.reward_cash);
    END IF;

    v_net_cash := v_trip.reward_cash - (v_taxes->>'total_tax')::bigint;

    -- ── Accredita guadagno netto al giocatore ────────────────────────────────
    UPDATE public.companies
    SET cash       = cash + GREATEST(0, v_net_cash),
        reputation = LEAST(5.0, reputation + 0.01)
    WHERE id = v_company.id;

    -- ── Accredita influenza (sia provincia di partenza che di destinazione) ───
    IF v_prov_from.id IS NOT NULL THEN
        INSERT INTO player_province_influence (user_id, province_id, influence, updated_at)
        VALUES (v_user_id, v_prov_from.id, 10, NOW())
        ON CONFLICT (user_id, province_id)
        DO UPDATE SET influence = player_province_influence.influence + 10, updated_at = NOW()
        RETURNING jsonb_build_object('province_id', v_prov_from.id, 'influence',
            (SELECT influence FROM player_province_influence
             WHERE user_id = v_user_id AND province_id = v_prov_from.id))
        INTO v_inf_from;
    END IF;

    IF v_prov_to.id IS NOT NULL AND (v_prov_to.id IS DISTINCT FROM v_prov_from.id) THEN
        INSERT INTO player_province_influence (user_id, province_id, influence, updated_at)
        VALUES (v_user_id, v_prov_to.id, 10, NOW())
        ON CONFLICT (user_id, province_id)
        DO UPDATE SET influence = player_province_influence.influence + 10, updated_at = NOW()
        RETURNING jsonb_build_object('province_id', v_prov_to.id, 'influence',
            (SELECT influence FROM player_province_influence
             WHERE user_id = v_user_id AND province_id = v_prov_to.id))
        INTO v_inf_to;
    END IF;

    -- ── Aggiorna veicolo ────────────────────────────────────────────────────
    UPDATE public.vehicles
    SET status       = 'IDLE',
        current_city = v_trip.end_city,
        mileage      = mileage + v_km,
        condition    = GREATEST(0, condition - 1)
    WHERE id = v_trip.vehicle_id;

    -- ── Aggiorna autista ────────────────────────────────────────────────────
    UPDATE public.drivers
    SET status       = 'AVAILABLE',
        current_city = v_trip.end_city,
        fatigue      = LEAST(100, fatigue + 8)
    WHERE id = v_trip.driver_id;

    -- ── Payload di ritorno ───────────────────────────────────────────────────
    v_result := jsonb_build_object(
        'trip_id',          v_trip.id,
        'reward_cash',      v_trip.reward_cash,
        'net_cash',         GREATEST(0, v_net_cash),
        'territory_taxes',  v_taxes,
        'influence_from',   COALESCE(v_inf_from, 'null'::jsonb),
        'influence_to',     COALESCE(v_inf_to,   'null'::jsonb),
        'start_city',       v_trip.start_city,
        'end_city',         v_trip.end_city,
        'trip_type',        v_trip.trip_type,
        'km',               v_km
    );

    DELETE FROM public.active_trips WHERE id = v_trip.id;

    RETURN v_result;
END;
$$;

-- Re-grant (funzione già grantata in 01, ma re-dichiaro per sicurezza)
GRANT EXECUTE ON FUNCTION public.rpc_claim_trip_reward(uuid) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 8: AGGIORNA rpc_acquire_province
-- Aggiunge: check soglia influenza, call a _refresh_region_governor post-acquisto.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_acquire_province(
    v_province_id TEXT,
    v_offer       BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id       UUID := auth.uid();
    v_prov          provinces%ROWTYPE;
    v_company       companies%ROWTYPE;
    v_min_offer     BIGINT;
    v_influence     INTEGER;
BEGIN
    SELECT * INTO v_prov FROM provinces WHERE id = v_province_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provincia non trovata: %', v_province_id;
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata per questo utente';
    END IF;

    IF v_prov.owner_id = v_user_id THEN
        RAISE EXCEPTION 'Sei già il proprietario di questa provincia';
    END IF;

    -- ── GATE: Punti Influenza sufficienti? ────────────────────────────────────
    SELECT COALESCE(influence, 0) INTO v_influence
    FROM player_province_influence
    WHERE user_id = v_user_id AND province_id = v_province_id;

    v_influence := COALESCE(v_influence, 0);

    IF v_influence < v_prov.required_influence THEN
        RAISE EXCEPTION 'Influenza insufficiente: hai % punti su % richiesti per %. Completa più corse in questa zona.',
            v_influence, v_prov.required_influence, v_prov.name;
    END IF;

    -- ── Offerta minima (120% del valore attuale) ───────────────────────────────
    v_min_offer := CEIL(v_prov.current_value * 1.20);
    IF v_offer < v_min_offer THEN
        RAISE EXCEPTION 'Offerta insufficiente: minimo €% (120%% del valore attuale €%)',
            v_min_offer, v_prov.current_value;
    END IF;

    IF v_company.cash < v_offer THEN
        RAISE EXCEPTION 'Fondi insufficienti: disponibili €%, necessari €%',
            v_company.cash, v_offer;
    END IF;

    -- ── Transazione finanziaria ───────────────────────────────────────────────
    UPDATE companies SET cash = cash - v_offer WHERE user_id = v_user_id;

    IF v_prov.owner_id IS NOT NULL THEN
        UPDATE companies
           SET cash = cash + FLOOR(v_offer * 0.80)
         WHERE user_id = v_prov.owner_id;
    END IF;

    UPDATE provinces SET
        owner_id      = v_user_id,
        owner_company = v_company.company_name,
        current_value = v_offer,
        acquired_at   = NOW(),
        updated_at    = NOW()
    WHERE id = v_province_id;

    -- ── Aggiorna governatore della regione ────────────────────────────────────
    PERFORM _refresh_region_governor(v_prov.region_id);

    -- ── News pubblica ─────────────────────────────────────────────────────────
    INSERT INTO global_news (company_name, message, type)
    VALUES (
        v_company.company_name,
        v_company.company_name || ' ha conquistato ' || v_prov.name || '! 🏴',
        'milestone'
    );

    RETURN jsonb_build_object(
        'success',         true,
        'province_name',   v_prov.name,
        'new_value',       v_offer,
        'previous_owner',  v_prov.owner_company,
        'region_id',       v_prov.region_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_acquire_province(TEXT, BIGINT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 9: RPC PUBBLICA — Influenza del giocatore corrente
-- Il client chiama questa per caricare la propria mappa di influenza.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_get_my_influence()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_result  JSONB;
BEGIN
    SELECT jsonb_object_agg(province_id, influence)
    INTO v_result
    FROM player_province_influence
    WHERE user_id = v_user_id;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_my_influence() TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 10: RPC PUBBLICA — Snapshot completo per il tab Province
-- Ritorna province + regioni + influenza del giocatore in una sola chiamata.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_get_territory_snapshot()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   UUID := auth.uid();
    v_provinces JSONB;
    v_regions   JSONB;
    v_influence JSONB;
BEGIN
    SELECT jsonb_agg(row_to_json(p.*) ORDER BY p.current_value DESC) INTO v_provinces FROM provinces p;
    SELECT jsonb_agg(row_to_json(r.*)) INTO v_regions   FROM regions   r;

    SELECT jsonb_object_agg(province_id, influence)
    INTO v_influence
    FROM player_province_influence
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
        'provinces',  COALESCE(v_provinces, '[]'::jsonb),
        'regions',    COALESCE(v_regions,   '[]'::jsonb),
        'influence',  COALESCE(v_influence, '{}'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_territory_snapshot() TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 11: TRIGGER — Ricalcola governatore automaticamente su cambio provincia
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _trg_province_governor_refresh()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Ri-calcola il governatore della regione interessata
    PERFORM _refresh_region_governor(NEW.region_id);
    -- Se l'owner precedente era in una regione diversa (impossibile ma per sicurezza)
    IF OLD.region_id IS DISTINCT FROM NEW.region_id THEN
        PERFORM _refresh_region_governor(OLD.region_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_province_owner_change ON provinces;
CREATE TRIGGER trg_province_owner_change
    AFTER UPDATE OF owner_id ON provinces
    FOR EACH ROW
    WHEN (OLD.owner_id IS DISTINCT FROM NEW.owner_id)
    EXECUTE FUNCTION _trg_province_governor_refresh();


-- =============================================================================
-- FINE 16_territory_war.sql
-- Tabelle create/aggiornate: regions, provinces (+ mapped_pois, required_influence),
--                            player_province_influence
-- Funzioni create:  _apply_territory_taxes, _refresh_region_governor,
--                   _trg_province_governor_refresh, rpc_add_province_influence,
--                   rpc_get_my_influence, rpc_get_territory_snapshot
-- Funzioni aggiornate: rpc_claim_trip_reward, rpc_acquire_province
-- Trigger creato: trg_province_owner_change
-- Province totali: 23 (5 esistenti + 18 nuove)
-- Regioni totali:  20
-- =============================================================================
