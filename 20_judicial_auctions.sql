-- ============================================================
-- 20_judicial_auctions.sql — Chauffeur Empire
-- Espansione 7: Aste Giudiziarie (P2P Avanzato + container aste al buio)
-- ============================================================

-- ── TABELLE ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.judicial_auctions (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    lot_type        TEXT    NOT NULL DEFAULT 'vehicle',  -- vehicle | container | fleet_pack
    title           TEXT    NOT NULL,
    description     TEXT,
    icon            TEXT    DEFAULT '🔨',
    vehicle_data    JSONB   DEFAULT '{}',  -- { tier, vehicleClass, condition, km, year }
    container_data  JSONB   DEFAULT '{}',  -- hidden until won: { items: [...] }
    min_bid         BIGINT  NOT NULL DEFAULT 10000,
    reserve_price   BIGINT  DEFAULT NULL,  -- NULL = no reserve
    province_id     TEXT    DEFAULT NULL,
    status          TEXT    NOT NULL DEFAULT 'open',  -- open | closed | cancelled
    winner_id       UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
    winning_bid     BIGINT  DEFAULT NULL,
    bid_count       INT     DEFAULT 0,
    auction_ends_at TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.judicial_bids (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    auction_id  UUID    NOT NULL REFERENCES public.judicial_auctions(id) ON DELETE CASCADE,
    user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount      BIGINT  NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(auction_id, user_id)  -- one active bid per user per auction (replace on conflict)
);

CREATE INDEX IF NOT EXISTS idx_judicial_auctions_status  ON public.judicial_auctions(status);
CREATE INDEX IF NOT EXISTS idx_judicial_auctions_ends    ON public.judicial_auctions(auction_ends_at);
CREATE INDEX IF NOT EXISTS idx_judicial_bids_auction     ON public.judicial_bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_judicial_bids_user        ON public.judicial_bids(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.judicial_auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judicial_bids     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "auctions_public_read"
      ON public.judicial_auctions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bids_own_read"
      ON public.judicial_bids FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bids_own_insert"
      ON public.judicial_bids FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bids_own_update"
      ON public.judicial_bids FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: lotti iniziali ──────────────────────────────────────────────────────

INSERT INTO public.judicial_auctions
    (lot_type, title, description, icon, vehicle_data, container_data, min_bid, auction_ends_at)
VALUES
    ('vehicle',
     'Mercedes Classe S sequestrata — Napoli',
     'Veicolo confiscato dalla DIA. Chilometraggio 87.000 km. Condizioni discrete.',
     '🚗',
     '{"tier":"PREMIUM","vehicleClass":"stellar_s_imp","condition":62,"km":87000,"year":2019}',
     '{}',
     45000,
     NOW() + INTERVAL '2 days'),

    ('vehicle',
     'BMW Serie 7 — Lotto Corte d''Appello Roma',
     'Lotto giudiziario n. 447/2024. Veicolo funzionante, revisione scaduta.',
     '🚙',
     '{"tier":"BUSINESS","vehicleClass":"stellar_e_exec","condition":55,"km":112000,"year":2018}',
     '{}',
     28000,
     NOW() + INTERVAL '3 days'),

    ('container',
     'Container Sigillato — Sequestro Porto Gioia Tauro',
     'Contenuto ignoto fino all''aggiudicazione. Potrebbe contenere veicoli, ricambi, o altro.',
     '📦',
     '{}',
     '{"items":[{"type":"vehicle","tier":"PRESIDENTIAL","vehicleClass":"stellar_q_exec","condition":78,"km":45000},{"type":"cash","amount":120000}]}',
     80000,
     NOW() + INTERVAL '1 day'),

    ('fleet_pack',
     'Lotto 3 Veicoli — Fallimento NCC Palermo',
     'Tre veicoli BUSINESS sequestrati da azienda NCC fallita. Venduti come lotto unico.',
     '🚐',
     '{"vehicles":[{"tier":"BUSINESS","vehicleClass":"stellar_e_exec","condition":70},{"tier":"BUSINESS","vehicleClass":"volt_3_urban","condition":65},{"tier":"BUSINESS","vehicleClass":"stellar_v_carr","condition":58}]}',
     '{}',
     75000,
     NOW() + INTERVAL '4 days'),

    ('vehicle',
     'Rolls-Royce Ghost — Asta Fallimentare Milano',
     'Ex parco auto di holding immobiliare. Condizioni eccellenti, manutenzione certificata.',
     '👑',
     '{"tier":"ULTRA","vehicleClass":"majestic_spirit","condition":88,"km":32000,"year":2021}',
     '{}',
     380000,
     NOW() + INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ── FUNZIONE HELPER: inserisce un lotto veicolo casuale (chiamata da cron/admin) ──

CREATE OR REPLACE FUNCTION public.rpc_spawn_judicial_auction(
    v_lot_type      TEXT    DEFAULT 'vehicle',
    v_tier          TEXT    DEFAULT 'BUSINESS',
    v_min_bid       BIGINT  DEFAULT 20000,
    v_duration_days INT     DEFAULT 3
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
    v_titles TEXT[] := ARRAY[
        'Veicolo Sequestrato — Tribunale di Roma',
        'Lotto Giudiziario — Corte d''Appello',
        'Confisca DIA — Distretto Sud',
        'Fallimento NCC — Tribunale Civile',
        'Sequestro GdF — Operazione Speciale'
    ];
    v_title TEXT := v_titles[1 + floor(random() * array_length(v_titles, 1))::INT];
BEGIN
    INSERT INTO public.judicial_auctions (lot_type, title, icon, vehicle_data, min_bid, auction_ends_at)
    VALUES (
        v_lot_type,
        v_title,
        CASE v_tier WHEN 'ULTRA' THEN '👑' WHEN 'PRESIDENTIAL' THEN '🏛️' WHEN 'PREMIUM' THEN '🚗' ELSE '🚙' END,
        jsonb_build_object('tier', v_tier, 'condition', 50 + floor(random() * 40)::INT, 'km', 20000 + floor(random() * 100000)::INT),
        v_min_bid,
        NOW() + (v_duration_days || ' days')::INTERVAL
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Lista aste aperte con offerta corrente dell'utente
CREATE OR REPLACE FUNCTION public.rpc_get_judicial_auctions()
RETURNS TABLE (
    id              UUID,
    lot_type        TEXT,
    title           TEXT,
    description     TEXT,
    icon            TEXT,
    vehicle_data    JSONB,
    min_bid         BIGINT,
    province_id     TEXT,
    status          TEXT,
    bid_count       INT,
    auction_ends_at TIMESTAMPTZ,
    my_bid          BIGINT,
    top_bid         BIGINT
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
        a.id, a.lot_type, a.title, a.description, a.icon,
        a.vehicle_data, a.min_bid, a.province_id, a.status,
        a.bid_count, a.auction_ends_at,
        (SELECT b.amount FROM public.judicial_bids b WHERE b.auction_id = a.id AND b.user_id = v_uid) AS my_bid,
        (SELECT MAX(b.amount) FROM public.judicial_bids b WHERE b.auction_id = a.id) AS top_bid
    FROM public.judicial_auctions a
    WHERE a.status = 'open' AND a.auction_ends_at > NOW()
    ORDER BY a.auction_ends_at ASC;
END;
$$;

-- Piazza o aggiorna offerta
CREATE OR REPLACE FUNCTION public.rpc_place_auction_bid(
    v_auction_id  UUID,
    v_amount      BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_auction   public.judicial_auctions%ROWTYPE;
    v_cash      BIGINT;
    v_top_bid   BIGINT;
    v_prev_bid  BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_auction FROM public.judicial_auctions WHERE id = v_auction_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata'; END IF;
    IF v_auction.status != 'open' THEN RAISE EXCEPTION 'Asta non aperta'; END IF;
    IF v_auction.auction_ends_at < NOW() THEN RAISE EXCEPTION 'Asta scaduta'; END IF;
    IF v_amount < v_auction.min_bid THEN
        RAISE EXCEPTION 'Offerta minima: €%', v_auction.min_bid;
    END IF;

    -- Controllo liquidità
    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid;
    IF COALESCE(v_cash, 0) < v_amount THEN
        RAISE EXCEPTION 'Fondi insufficienti';
    END IF;

    -- Offerta corrente più alta
    SELECT MAX(amount) INTO v_top_bid FROM public.judicial_bids WHERE auction_id = v_auction_id;
    IF v_top_bid IS NOT NULL AND v_amount <= v_top_bid THEN
        RAISE EXCEPTION 'Offerta troppo bassa (attuale: €%)', v_top_bid;
    END IF;

    -- Offerta precedente di questo utente (per UI feedback)
    SELECT amount INTO v_prev_bid FROM public.judicial_bids
    WHERE auction_id = v_auction_id AND user_id = v_uid;

    -- Upsert offerta
    INSERT INTO public.judicial_bids (auction_id, user_id, amount)
    VALUES (v_auction_id, v_uid, v_amount)
    ON CONFLICT (auction_id, user_id) DO UPDATE SET amount = EXCLUDED.amount, created_at = NOW();

    -- Aggiorna bid_count sull'asta
    UPDATE public.judicial_auctions
    SET bid_count = (SELECT COUNT(DISTINCT user_id) FROM public.judicial_bids WHERE auction_id = v_auction_id)
    WHERE id = v_auction_id;

    RETURN jsonb_build_object(
        'success',   true,
        'amount',    v_amount,
        'prev_bid',  v_prev_bid,
        'top_bid',   v_amount
    );
END;
$$;

-- Risolvi asta (aggiudicazione): chiamata da cron o Edge Function
-- Trasferisce il veicolo/lotto al vincitore e scala il cash
CREATE OR REPLACE FUNCTION public.rpc_resolve_auction(v_auction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auction    public.judicial_auctions%ROWTYPE;
    v_winner_id  UUID;
    v_win_bid    BIGINT;
    v_cash       BIGINT;
    v_items      JSONB;
BEGIN
    SELECT * INTO v_auction FROM public.judicial_auctions WHERE id = v_auction_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata'; END IF;
    IF v_auction.status != 'open' THEN RETURN jsonb_build_object('skipped', true, 'reason', 'already resolved'); END IF;
    IF v_auction.auction_ends_at > NOW() THEN RETURN jsonb_build_object('skipped', true, 'reason', 'not yet ended'); END IF;

    -- Trova vincitore
    SELECT user_id, amount INTO v_winner_id, v_win_bid
    FROM public.judicial_bids
    WHERE auction_id = v_auction_id
    ORDER BY amount DESC, created_at ASC
    LIMIT 1;

    IF v_winner_id IS NULL THEN
        UPDATE public.judicial_auctions SET status = 'cancelled' WHERE id = v_auction_id;
        RETURN jsonb_build_object('success', false, 'reason', 'no bids');
    END IF;

    -- Verifica reserve price
    IF v_auction.reserve_price IS NOT NULL AND v_win_bid < v_auction.reserve_price THEN
        UPDATE public.judicial_auctions SET status = 'cancelled' WHERE id = v_auction_id;
        RETURN jsonb_build_object('success', false, 'reason', 'reserve not met');
    END IF;

    -- Scala cash al vincitore
    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_winner_id FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_win_bid THEN
        -- Vincitore non ha più fondi: scala quello che può, segna deficit
        v_win_bid := LEAST(v_cash, v_win_bid);
    END IF;
    UPDATE public.companies
    SET cash = cash - v_win_bid, liquid_assets = GREATEST(0, liquid_assets - v_win_bid)
    WHERE user_id = v_winner_id;

    -- Segna asta come chiusa
    UPDATE public.judicial_auctions
    SET status = 'closed', winner_id = v_winner_id, winning_bid = v_win_bid
    WHERE id = v_auction_id;

    -- Il veicolo/lotto viene ricevuto dal frontend al prossimo login (via rpc_get_won_auctions)
    RETURN jsonb_build_object(
        'success',    true,
        'winner_id',  v_winner_id,
        'amount',     v_win_bid,
        'lot_type',   v_auction.lot_type,
        'vehicle_data', v_auction.vehicle_data,
        'container_data', v_auction.container_data
    );
END;
$$;

-- Aste vinte non ancora riscattate dall'utente
CREATE OR REPLACE FUNCTION public.rpc_get_won_auctions()
RETURNS TABLE (
    id              UUID,
    lot_type        TEXT,
    title           TEXT,
    icon            TEXT,
    vehicle_data    JSONB,
    container_data  JSONB,
    winning_bid     BIGINT,
    created_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT id, lot_type, title, icon, vehicle_data, container_data, winning_bid, created_at
    FROM public.judicial_auctions
    WHERE winner_id = auth.uid() AND status = 'closed'
    ORDER BY created_at DESC
    LIMIT 20;
$$;

-- Storico offerte dell'utente
CREATE OR REPLACE FUNCTION public.rpc_get_my_bids()
RETURNS TABLE (
    auction_id      UUID,
    auction_title   TEXT,
    auction_icon    TEXT,
    amount          BIGINT,
    auction_ends_at TIMESTAMPTZ,
    auction_status  TEXT,
    is_winner       BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT
        b.auction_id, a.title, a.icon,
        b.amount, a.auction_ends_at, a.status,
        (a.winner_id = auth.uid()) AS is_winner
    FROM public.judicial_bids b
    JOIN public.judicial_auctions a ON a.id = b.auction_id
    WHERE b.user_id = auth.uid()
    ORDER BY b.created_at DESC
    LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_judicial_auctions()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_place_auction_bid(UUID, BIGINT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_auction(UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_won_auctions()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_bids()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_spawn_judicial_auction(TEXT,TEXT,BIGINT,INT) TO authenticated;
