-- ============================================================
-- 34_fix_console_errors.sql — Chauffeur Empire
-- Consolida 3 fix per errori console rilevati il 2026-05-19:
--   1. holding_members 500  → RLS ricorsiva (da 13_fix_holding_members_rls.sql)
--   2. rpc_tourism_daily_tick 404 → intera migrazione 33_tourism_tenders.sql
--   3. rpc_get_shadow_targets 400 → rideploy funzione da 23_shadow_ops.sql
-- IDEMPOTENTE: sicuro da rieseguire.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- FIX 1: holding_members 500 — policy RLS ricorsiva
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "hm_select_own_holding" ON public.holding_members;
DROP POLICY IF EXISTS "hm_select_all"         ON public.holding_members;

CREATE POLICY "hm_select_all" ON public.holding_members
    FOR SELECT USING (true);

-- ══════════════════════════════════════════════════════════════
-- FIX 2: rpc_tourism_daily_tick 404 — deploy completo 33_tourism_tenders
-- ══════════════════════════════════════════════════════════════

-- ── TABELLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.b2b_catalog (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name                 TEXT        NOT NULL UNIQUE,
    inspiration          TEXT,
    company_type         TEXT,
    clientele            TEXT,
    tier                 INT         NOT NULL DEFAULT 3 CHECK (tier BETWEEN 1 AND 5),
    lore                 TEXT,
    icon                 TEXT        DEFAULT '✈️',
    base_payout_per_hour INT         NOT NULL,
    event_payout_mult    NUMERIC     DEFAULT 1.5,
    duration_days        INT         NOT NULL DEFAULT 14,
    requirements         JSONB       NOT NULL DEFAULT '{}'::JSONB,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.b2b_active_tenders (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    catalog_id           UUID        NOT NULL REFERENCES public.b2b_catalog(id) ON DELETE CASCADE,
    status               TEXT        NOT NULL DEFAULT 'open_bidding'
                                     CHECK (status IN ('open_bidding','active','cooldown')),
    current_owner_uuid   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_company_name   TEXT,
    bidding_ends_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    awarded_at           TIMESTAMPTZ,
    expires_at           TIMESTAMPTZ,
    cooldown_until       TIMESTAMPTZ,
    next_payout_at       TIMESTAMPTZ,
    daily_payout         BIGINT,
    total_paid           BIGINT      DEFAULT 0,
    sla_score            NUMERIC     DEFAULT 100.0,
    winning_score        NUMERIC,
    round_number         INT         DEFAULT 1,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT b2b_at_catalog_unique UNIQUE (catalog_id)
);

CREATE TABLE IF NOT EXISTS public.b2b_bids (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tender_id            UUID        NOT NULL REFERENCES public.b2b_active_tenders(id) ON DELETE CASCADE,
    user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name         TEXT,
    qualifying_vehicles  INT         DEFAULT 0,
    pledge_cash          BIGINT      DEFAULT 0,
    bid_score            NUMERIC     NOT NULL DEFAULT 0,
    score_breakdown      JSONB       DEFAULT '{}'::JSONB,
    status               TEXT        DEFAULT 'pending'
                                     CHECK (status IN ('pending','won','lost','cancelled')),
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT b2b_bids_unique UNIQUE (tender_id, user_id)
);

-- ── INDEXES ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_b2b_at_status   ON public.b2b_active_tenders(status);
CREATE INDEX IF NOT EXISTS idx_b2b_at_owner    ON public.b2b_active_tenders(current_owner_uuid);
CREATE INDEX IF NOT EXISTS idx_b2b_at_bidding  ON public.b2b_active_tenders(bidding_ends_at) WHERE status = 'open_bidding';
CREATE INDEX IF NOT EXISTS idx_b2b_at_expires  ON public.b2b_active_tenders(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_b2b_bids_tender ON public.b2b_bids(tender_id);
CREATE INDEX IF NOT EXISTS idx_b2b_bids_user   ON public.b2b_bids(user_id);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.b2b_catalog        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_active_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_bids           ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "b2b_catalog_public_read"
      ON public.b2b_catalog FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "b2b_active_tenders_public_read"
      ON public.b2b_active_tenders FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "b2b_bids_own"
      ON public.b2b_bids FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: 21 tourism companies ────────────────────────────────

INSERT INTO public.b2b_catalog
  (name, inspiration, company_type, clientele, tier, icon, lore,
   base_payout_per_hour, event_payout_mult, duration_days, requirements)
VALUES
  ('Aurevia Elite Journeys',
   'Virtuoso + Abercrombie & Kent', 'Network luxury travel globale', 'CEO, old money, diplomatici',
   4, '🌟', 'Trasporto diplomatico d''élite dove ogni millisecondo di ritardo è un''offesa diplomatica.',
   225, 2.0, 30,
   '{"min_reputation":3.5,"req_tier":"ultra","req_vehicle_count":3,"req_driver_count":2,"req_completions":0}'::JSONB),

  ('Crown Meridian Escapes',
   'Classic Vacations', 'Tour operator luxury resort', 'Honeymoon, turismo premium USA-Europa',
   3, '👑', 'Resort esclusivi e transfer aeroportuali premium — il wi-fi a bordo non è un optional.',
   170, 1.6, 7,
   '{"min_reputation":2.5,"req_tier":"business","req_vehicle_count":8,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Obsidian Pearl Retreats',
   'Ultra luxury Maldives agencies', 'Travel concierge elitario', 'Milionari, crypto bros, influencer',
   4, '💎', 'Champagne nel SUV e riservatezza assoluta. I clienti non sanno neanche il tuo nome.',
   350, 2.5, 14,
   '{"min_reputation":4.4,"req_tier":"vip","req_vehicle_count":5,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Atlas Ember Voyages',
   'Corporate travel management globali', 'Travel management multinazionale', 'Corporate e business travel',
   3, '🌍', 'Logistica corporate su larga scala. Quindici transfer al giorno, nessuna scusa.',
   160, 1.4, 30,
   '{"min_reputation":3.0,"req_tier":"business","req_vehicle_count":10,"req_driver_count":5,"req_completions":50}'::JSONB),

  ('Velvet Horizon Concierge',
   'Quintessentially-style concierge', 'Concierge VIP globale', 'Celebrities e HNWI',
   5, '🕴️', 'Auto blindate, autisti silenziosi. Il lusso che non si vede è il lusso più costoso.',
   500, 3.0, 14,
   '{"min_reputation":4.5,"req_tier":"ultra","req_vehicle_count":3,"req_driver_count":3,"req_completions":0}'::JSONB),

  ('Nova Dynasty Holidays',
   'Startup luxury travel VC-backed', 'Travel tech company', 'Giovani milionari tech',
   3, '⚡', 'Full electric o niente. I clienti calcolano il carbonio dell''aria condizionata.',
   210, 1.5, 7,
   '{"min_reputation":2.0,"req_tier":"vip","req_vehicle_count":5,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Ivory Crown Travel Group',
   'Signature Travel Network', 'Network agenzie affiliate', 'Upper class internazionale',
   3, '🏛️', 'Standard corporate elevati. Nessuna berlina con meno di cinque stelle di comfort.',
   170, 1.5, 30,
   '{"min_reputation":4.0,"req_tier":"business","req_vehicle_count":5,"req_driver_count":10,"req_completions":0}'::JSONB),

  ('Zenith Harbor Leisure',
   'Luxury cruise operators', 'Turismo crocieristico premium', 'Crociere luxury',
   2, '⛵', 'Transfer porto-hotel-porto. Van capaci, bagagli enormi, clienti impazienti.',
   130, 1.3, 7,
   '{"min_reputation":2.0,"req_tier":"business","req_vehicle_count":4,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Imperial Silk Routes',
   'Agenzie luxury asiatiche', 'Travel diplomacy & luxury', 'Delegazioni e businessman asiatici',
   4, '🏯', 'Puntualità assoluta, sedili executive, discrezione diplomatica. Zero tolleranza ritardi.',
   260, 2.0, 14,
   '{"min_reputation":3.5,"req_tier":"business","req_vehicle_count":3,"req_driver_count":3,"req_completions":0}'::JSONB),

  ('BlackCard Continental',
   'Amex Centurion Travel vibes', 'Servizi ultra-premium', 'Ultra rich',
   5, '💳', 'Solo S-Class, EQS o Range Rover. Vent''auto minimo. Reputazione quasi impeccabile.',
   700, 4.0, 30,
   '{"min_reputation":4.7,"req_tier":"ultra","req_vehicle_count":20,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Silver Reef Expeditions',
   'Luxury safari agencies', 'Turismo avventura luxury', 'Safari e tour esclusivi',
   4, '🏝️', 'SUV premium per terreni impervi abitati da persone con conti bancari impervi.',
   240, 2.0, 14,
   '{"min_reputation":3.5,"req_tier":"vip","req_vehicle_count":5,"req_driver_count":2,"req_completions":0}'::JSONB),

  ('Crimson Palm Resorts',
   'Resort Dubai/Maldives groups', 'Resort transfers', 'Turismo luxury mediorientale',
   4, '🌴', 'SUV neri, servizio h24, dodici driver in uniforme. Il lusso non dorme mai.',
   320, 2.5, 14,
   '{"min_reputation":4.0,"req_tier":"ultra","req_vehicle_count":6,"req_driver_count":12,"req_completions":0}'::JSONB),

  ('Aureline Prestige Travel',
   'Luxury honeymoon operators', 'Honeymoon e romantic travel', 'Coppie ricche',
   3, '💕', 'Berlina luxury, pacchetto comfort, recensioni stellari. L''amore costa e pretende puntualità.',
   180, 1.8, 7,
   '{"min_reputation":4.8,"req_tier":"vip","req_vehicle_count":3,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Monarch Executive Mobility',
   'Corporate event travel', 'Summit e conferenze', 'Eventi corporate',
   4, '⚜️', 'Venticinque servizi al giorno, coordinatore operativo, van executive multipli. Guerra civile logistica.',
   200, 2.0, 30,
   '{"min_reputation":3.0,"req_tier":"business","req_vehicle_count":8,"req_driver_count":5,"req_completions":100}'::JSONB),

  ('Eclipse Private Retreats',
   'Tourism black concierge', 'Luxury secrecy travel', 'Politici, oligarchi, VIP discreti',
   5, '🌑', 'NDA firmato, SUV blindati, driver con background clearance. Il servizio che non esiste.',
   900, 4.5, 30,
   '{"min_reputation":4.5,"req_tier":"ultra","req_vehicle_count":5,"req_driver_count":4,"req_completions":0}'::JSONB),

  ('Orion Platinum Getaways',
   'Luxury yacht & aviation tourism', 'Mega itinerari luxury', 'Jet set internazionale',
   5, '🚁', 'Itinerari da yacht a jet privato. Solo EV luxury, accesso marina, permessi prioritari.',
   450, 3.0, 14,
   '{"min_reputation":4.0,"req_tier":"vip","req_vehicle_count":6,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('VantaSky Experiences',
   'Influencer luxury tourism', 'Social-media luxury travel', 'Influencer e creator',
   3, '📸', 'L''auto deve essere fotogenica. Il wrapping conta quanto la meccanica.',
   190, 1.6, 7,
   '{"min_reputation":2.5,"req_tier":"vip","req_vehicle_count":4,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Royal Meridian Hospitality',
   'Hotel chain luxury partnerships', 'Hotel transport partner', 'Hotel 5 stelle',
   4, '🏨', 'Presenza fissa in aeroporto, puntualità al 95%, dress code da cerimonia.',
   220, 2.0, 14,
   '{"min_reputation":4.0,"req_tier":"business","req_vehicle_count":5,"req_driver_count":0,"req_completions":0}'::JSONB),

  ('Titan Globe Incentives',
   'MICE luxury travel', 'Incentive aziendali', 'Multinazionali',
   5, '🌐', 'Grandi flotte, dispatch manager, cinquecento servizi completati. L''appalto delle multinazionali.',
   280, 2.5, 30,
   '{"min_reputation":3.5,"req_tier":"business","req_vehicle_count":20,"req_driver_count":8,"req_completions":500}'::JSONB),

  ('Celestial Harbor Elite',
   'Ultra-exclusive island tourism', 'Island luxury management', 'UHNW individuals',
   5, '⭐', 'Reputazione massima, flotta elite, security package. La clientela che non sbaglia mai — tranne te.',
   1100, 5.0, 30,
   '{"min_reputation":4.9,"req_tier":"ultra","req_vehicle_count":10,"req_driver_count":6,"req_completions":200}'::JSONB),

  ('Mirage Crown Voyages',
   'Emirati luxury tourism', 'Luxury desert & yacht experiences', 'Petro-elite e turismo luxury Gulf',
   4, '🌅', 'SUV luxury imponenti, aria condizionata premium, operatività notturna garantita.',
   380, 2.8, 14,
   '{"min_reputation":4.0,"req_tier":"ultra","req_vehicle_count":6,"req_driver_count":0,"req_completions":0}'::JSONB)
ON CONFLICT (name) DO NOTHING;

-- ── INIZIALIZZA b2b_active_tenders (un row per catalog entry) ─

INSERT INTO public.b2b_active_tenders (catalog_id, status, bidding_ends_at)
SELECT id, 'open_bidding', NOW() + INTERVAL '24 hours'
FROM public.b2b_catalog
ON CONFLICT (catalog_id) DO NOTHING;

-- ── FUNZIONI ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._process_tourism_tenders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tender RECORD;
    v_winner public.b2b_bids%ROWTYPE;
    v_daily  BIGINT;
BEGIN
    FOR v_tender IN
        SELECT bat.id, bat.catalog_id,
               bc.duration_days, bc.base_payout_per_hour
        FROM   public.b2b_active_tenders bat
        JOIN   public.b2b_catalog bc ON bc.id = bat.catalog_id
        WHERE  bat.status = 'open_bidding' AND bat.bidding_ends_at <= NOW()
        FOR UPDATE OF bat SKIP LOCKED
    LOOP
        SELECT * INTO v_winner
        FROM   public.b2b_bids
        WHERE  tender_id = v_tender.id AND status = 'pending'
        ORDER  BY bid_score DESC LIMIT 1;

        IF FOUND THEN
            v_daily := v_tender.base_payout_per_hour * 16;
            UPDATE public.b2b_active_tenders SET
                status             = 'active',
                current_owner_uuid = v_winner.user_id,
                owner_company_name = v_winner.company_name,
                awarded_at         = NOW(),
                expires_at         = NOW() + (v_tender.duration_days || ' days')::INTERVAL,
                next_payout_at     = NOW() + INTERVAL '1 day',
                daily_payout       = v_daily,
                winning_score      = v_winner.bid_score,
                total_paid         = 0,
                sla_score          = 100.0
            WHERE id = v_tender.id;

            IF v_winner.pledge_cash > 0 THEN
                UPDATE public.companies
                SET    cash = GREATEST(0, cash - v_winner.pledge_cash)
                WHERE  user_id = v_winner.user_id;
            END IF;

            UPDATE public.companies
            SET reputation = LEAST(5.0, reputation + 0.05)
            WHERE user_id = v_winner.user_id;

            UPDATE public.b2b_bids SET status = 'won'  WHERE id = v_winner.id;
            UPDATE public.b2b_bids SET status = 'lost'
            WHERE  tender_id = v_tender.id AND status = 'pending';
        ELSE
            UPDATE public.b2b_active_tenders
            SET    bidding_ends_at = NOW() + INTERVAL '24 hours'
            WHERE  id = v_tender.id;
        END IF;
    END LOOP;

    FOR v_tender IN
        SELECT id, current_owner_uuid, round_number
        FROM   public.b2b_active_tenders
        WHERE  status = 'active' AND expires_at <= NOW()
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.companies
        SET    reputation = LEAST(5.0, reputation + 0.08)
        WHERE  user_id = v_tender.current_owner_uuid;

        UPDATE public.b2b_active_tenders SET
            status             = 'cooldown',
            current_owner_uuid = NULL,
            owner_company_name = NULL,
            cooldown_until     = NOW() + INTERVAL '2 hours',
            expires_at         = NULL,
            next_payout_at     = NULL,
            daily_payout       = NULL,
            round_number       = v_tender.round_number + 1
        WHERE id = v_tender.id;

        DELETE FROM public.b2b_bids WHERE tender_id = v_tender.id;
    END LOOP;

    UPDATE public.b2b_active_tenders SET
        status          = 'open_bidding',
        bidding_ends_at = NOW() + INTERVAL '24 hours',
        winning_score   = NULL,
        total_paid      = 0,
        sla_score       = 100.0
    WHERE status = 'cooldown' AND cooldown_until <= NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_tourism_tenders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    result  JSONB;
BEGIN
    PERFORM public._process_tourism_tenders();

    SELECT jsonb_agg(
        jsonb_build_object(
            'id',                bat.id,
            'catalog_id',        bat.catalog_id,
            'status',            bat.status,
            'current_owner_uuid',bat.current_owner_uuid,
            'owner_company_name',bat.owner_company_name,
            'bidding_ends_at',   bat.bidding_ends_at,
            'expires_at',        bat.expires_at,
            'daily_payout',      bat.daily_payout,
            'total_paid',        bat.total_paid,
            'sla_score',         bat.sla_score,
            'winning_score',     bat.winning_score,
            'round_number',      bat.round_number,
            'is_mine',           (bat.current_owner_uuid = v_uid),
            'name',              bc.name,
            'company_type',      bc.company_type,
            'clientele',         bc.clientele,
            'tier',              bc.tier,
            'lore',              bc.lore,
            'icon',              bc.icon,
            'base_payout_per_hour', bc.base_payout_per_hour,
            'duration_days',     bc.duration_days,
            'requirements',      bc.requirements,
            'bid_count',         (SELECT COUNT(*) FROM public.b2b_bids WHERE tender_id = bat.id AND status = 'pending'),
            'my_bid_score',      (SELECT bid_score    FROM public.b2b_bids WHERE tender_id = bat.id AND user_id = v_uid),
            'my_bid_pledge',     (SELECT pledge_cash  FROM public.b2b_bids WHERE tender_id = bat.id AND user_id = v_uid),
            'my_bid_status',     (SELECT status       FROM public.b2b_bids WHERE tender_id = bat.id AND user_id = v_uid)
        )
        ORDER BY bc.tier DESC, bc.base_payout_per_hour DESC
    )
    INTO result
    FROM  public.b2b_active_tenders bat
    JOIN  public.b2b_catalog bc ON bc.id = bat.catalog_id;

    RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_submit_tourism_bid(
    v_tender_id          UUID,
    v_qualifying_vehicles INT,
    v_pledge_cash         BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid        UUID    := auth.uid();
    v_tender     public.b2b_active_tenders%ROWTYPE;
    v_catalog    public.b2b_catalog%ROWTYPE;
    v_req        JSONB;
    v_rep        NUMERIC;
    v_co_name    TEXT;
    v_rep_sc     NUMERIC;
    v_fleet_sc   NUMERIC;
    v_pledge_sc  NUMERIC;
    v_total_sc   NUMERIC;
    v_req_count  INT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    v_pledge_cash := GREATEST(0, COALESCE(v_pledge_cash, 0));

    SELECT * INTO v_tender FROM public.b2b_active_tenders WHERE id = v_tender_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bando non trovato'; END IF;
    IF v_tender.status <> 'open_bidding' THEN RAISE EXCEPTION 'Bando non in fase di offerta'; END IF;
    IF v_tender.bidding_ends_at <= NOW() THEN RAISE EXCEPTION 'Finestra di offerta scaduta'; END IF;

    SELECT * INTO v_catalog FROM public.b2b_catalog WHERE id = v_tender.catalog_id;
    v_req := v_catalog.requirements;
    v_req_count := COALESCE((v_req->>'req_vehicle_count')::INT, 1);

    SELECT COALESCE(c.reputation, 0),
           COALESCE(c.company_name, p.raw_user_meta_data->>'company_name', 'Unknown')
    INTO   v_rep, v_co_name
    FROM   public.companies c
    JOIN   auth.users p ON p.id = c.user_id
    WHERE  c.user_id = v_uid;

    v_rep_sc    := LEAST(40, (v_rep / 5.0) * 40);
    v_fleet_sc  := LEAST(40, CASE WHEN v_req_count > 0
                     THEN (v_qualifying_vehicles::NUMERIC / v_req_count) * 40
                     ELSE 40 END);
    v_pledge_sc := LEAST(20, (v_pledge_cash::NUMERIC / 100000.0) * 20);
    v_total_sc  := v_rep_sc + v_fleet_sc + v_pledge_sc;

    INSERT INTO public.b2b_bids
        (tender_id, user_id, company_name, qualifying_vehicles, pledge_cash, bid_score, score_breakdown)
    VALUES
        (v_tender_id, v_uid, v_co_name, v_qualifying_vehicles, v_pledge_cash, v_total_sc,
         jsonb_build_object('rep', ROUND(v_rep_sc,1), 'fleet', ROUND(v_fleet_sc,1), 'pledge', ROUND(v_pledge_sc,1)))
    ON CONFLICT (tender_id, user_id) DO UPDATE
        SET qualifying_vehicles = v_qualifying_vehicles,
            pledge_cash         = v_pledge_cash,
            bid_score           = v_total_sc,
            score_breakdown     = jsonb_build_object('rep', ROUND(v_rep_sc,1), 'fleet', ROUND(v_fleet_sc,1), 'pledge', ROUND(v_pledge_sc,1)),
            status              = 'pending',
            created_at          = NOW();

    RETURN jsonb_build_object(
        'score',  ROUND(v_total_sc, 1),
        'rep',    ROUND(v_rep_sc,   1),
        'fleet',  ROUND(v_fleet_sc, 1),
        'pledge', ROUND(v_pledge_sc,1)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_tourism_bid(v_tender_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    UPDATE public.b2b_bids
    SET    status = 'cancelled'
    WHERE  tender_id = v_tender_id AND user_id = v_uid AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_tourism_daily_tick()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_tender     RECORD;
    v_total_pay  BIGINT  := 0;
    v_completed  INT     := 0;
    v_active_cnt INT     := 0;
    v_payouts    JSONB   := '[]'::JSONB;
BEGIN
    IF v_uid IS NULL THEN RETURN NULL; END IF;

    FOR v_tender IN
        SELECT bat.id, bat.daily_payout, bat.next_payout_at, bat.expires_at,
               bc.name AS catalog_name, bc.icon
        FROM   public.b2b_active_tenders bat
        JOIN   public.b2b_catalog bc ON bc.id = bat.catalog_id
        WHERE  bat.current_owner_uuid = v_uid
          AND  bat.status = 'active'
        FOR UPDATE OF bat SKIP LOCKED
    LOOP
        IF v_tender.next_payout_at > NOW() THEN CONTINUE; END IF;

        v_total_pay  := v_total_pay + v_tender.daily_payout;
        v_active_cnt := v_active_cnt + 1;

        v_payouts := v_payouts || jsonb_build_array(
            jsonb_build_object('name', v_tender.catalog_name, 'icon', v_tender.icon, 'amount', v_tender.daily_payout)
        );

        IF v_tender.expires_at <= NOW() + INTERVAL '1 day' THEN
            v_completed := v_completed + 1;
        END IF;

        UPDATE public.b2b_active_tenders SET
            total_paid     = total_paid + v_tender.daily_payout,
            next_payout_at = NOW() + INTERVAL '1 day'
        WHERE id = v_tender.id;
    END LOOP;

    IF v_total_pay > 0 THEN
        UPDATE public.companies
        SET cash = cash + v_total_pay, liquid_assets = liquid_assets + v_total_pay
        WHERE user_id = v_uid;
    END IF;

    RETURN jsonb_build_object(
        'total_payout',  v_total_pay,
        'active_count',  v_active_cnt,
        'expiring_soon', v_completed,
        'payouts',       v_payouts
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_terminate_tourism_contract(v_tender_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_tender public.b2b_active_tenders%ROWTYPE;
    v_cat    public.b2b_catalog%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_tender
    FROM   public.b2b_active_tenders
    WHERE  id = v_tender_id AND current_owner_uuid = v_uid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Contratto non trovato o non di tua proprietà'; END IF;

    SELECT * INTO v_cat FROM public.b2b_catalog WHERE id = v_tender.catalog_id;

    UPDATE public.companies
    SET reputation = GREATEST(0.0, reputation - (v_cat.tier * 0.15))
    WHERE user_id = v_uid;

    UPDATE public.b2b_active_tenders SET
        status             = 'cooldown',
        current_owner_uuid = NULL,
        owner_company_name = NULL,
        cooldown_until     = NOW() + INTERVAL '4 hours',
        expires_at         = NULL,
        next_payout_at     = NULL,
        daily_payout       = NULL,
        round_number       = round_number + 1
    WHERE id = v_tender_id;

    DELETE FROM public.b2b_bids WHERE tender_id = v_tender_id;

    RETURN jsonb_build_object('rep_penalty', v_cat.tier * 0.15);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_expire_tourism_contracts()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT public._process_tourism_tenders();
$$;

-- ── GRANTS tourism ───────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.rpc_get_tourism_tenders()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_tourism_bid(UUID, INT, BIGINT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_tourism_bid(UUID)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_tourism_daily_tick()                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_terminate_tourism_contract(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_expire_tourism_contracts()                         TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- FIX 3: rpc_get_shadow_targets 400 — rideploy + tabelle shadow
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shadow_ops (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    attacker_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    op_type         TEXT    NOT NULL,
    op_cost         BIGINT  NOT NULL DEFAULT 0,
    success         BOOLEAN DEFAULT NULL,
    result_data     JSONB   DEFAULT '{}',
    detected        BOOLEAN DEFAULT FALSE,
    cooldown_until  TIMESTAMPTZ DEFAULT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS public.shadow_defense (
    user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    defense_level   INT     DEFAULT 0,
    intel_spent     BIGINT  DEFAULT 0,
    ops_received    INT     DEFAULT 0,
    last_attacked   TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_shadow_ops_attacker ON public.shadow_ops(attacker_id);
CREATE INDEX IF NOT EXISTS idx_shadow_ops_target   ON public.shadow_ops(target_id);
CREATE INDEX IF NOT EXISTS idx_shadow_ops_created  ON public.shadow_ops(created_at DESC);

ALTER TABLE public.shadow_ops     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_defense ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shadow_ops_own_read"
      ON public.shadow_ops FOR SELECT
      USING (auth.uid() = attacker_id OR auth.uid() = target_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "shadow_defense_own"
      ON public.shadow_defense FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.rpc_get_shadow_targets()
RETURNS TABLE (
    user_id     UUID,
    company_id  UUID,
    name        TEXT,
    reputation  NUMERIC,
    region      TEXT,
    defense_lvl INT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        c.user_id,
        c.id AS company_id,
        c.name,
        c.reputation,
        c.region,
        COALESCE(sd.defense_level, 0) AS defense_lvl
    FROM public.companies c
    LEFT JOIN public.shadow_defense sd ON sd.user_id = c.user_id
    WHERE c.user_id != v_uid
      AND c.reputation > 0.5
    ORDER BY c.reputation DESC
    LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_shadow_targets() TO authenticated;

-- ── NOTIFICA FINALE ──────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '✅ 34_fix_console_errors.sql completato:';
    RAISE NOTICE '   Fix 1: holding_members RLS → policy ricorsiva rimossa';
    RAISE NOTICE '   Fix 2: tourism tenders → tabelle + 21 seed + 6 RPC deployati';
    RAISE NOTICE '   Fix 3: shadow_ops → tabelle + rpc_get_shadow_targets ridepoyato';
    RAISE NOTICE 'Dopo questo script: ricarica la pagina del gioco e verifica la console.';
END $$;
