-- =============================================================================
-- 08_mmo_p2p_marketplace.sql
-- Chauffeur Empire — P2P Marketplace, Company Shares & Holdings
-- IDEMPOTENT: safe to re-run.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ─── PREREQUISITO ─────────────────────────────────────────────────────────────
-- Assicurati che 01_mmo_migration.sql sia già stato eseguito (dipende da
-- auth.users, public._my_company_id(), e il trigger _set_updated_at).

-- ─── HELPER: leggi cash dalla game_state jsonb ────────────────────────────────
-- Ogni giocatore ha il cash nel blob: game_saves.game_state->>'cash'
-- Usiamo questo helper per leggere/scrivere in modo sicuro.
CREATE OR REPLACE FUNCTION public._get_player_cash(v_user_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    v_cash bigint;
BEGIN
    SELECT COALESCE((game_state->>'cash')::bigint, 0)
    INTO v_cash
    FROM public.game_saves
    WHERE user_id = v_user_id AND slot_index = 0;
    RETURN COALESCE(v_cash, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public._add_player_cash(v_user_id uuid, v_delta bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_cash bigint;
BEGIN
    UPDATE public.game_saves
    SET game_state = jsonb_set(
            game_state,
            '{cash}',
            (GREATEST(0, COALESCE((game_state->>'cash')::bigint, 0) + v_delta))::text::jsonb
        ),
        updated_at = now()
    WHERE user_id = v_user_id AND slot_index = 0
    RETURNING (game_state->>'cash')::bigint INTO v_new_cash;

    IF NOT FOUND THEN
        RAISE EXCEPTION '_add_player_cash: nessun save slot_index=0 per user %', v_user_id;
    END IF;
    RETURN v_new_cash;
END;
$$;

GRANT EXECUTE ON FUNCTION public._get_player_cash(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public._add_player_cash(uuid, bigint) TO authenticated;


-- =============================================================================
-- 1. MERCATO P2P — market_listings
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.market_listings (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_name     text        NOT NULL DEFAULT 'CEO Sconosciuto',   -- company_name snapshot
    car_snapshot    jsonb       NOT NULL,   -- intero oggetto auto dalla flotta locale
    ask_price       bigint      NOT NULL CHECK (ask_price > 0),
    listed_at       timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_market_seller     ON public.market_listings(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_market_expires    ON public.market_listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_market_listed_at  ON public.market_listings(listed_at DESC);

ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;

-- Chiunque può LEGGERE le inserzioni (vetrina pubblica)
DROP POLICY IF EXISTS "market_select_all"   ON public.market_listings;
CREATE POLICY "market_select_all" ON public.market_listings
    FOR SELECT USING (true);

-- Solo il venditore può INSERIRE/ELIMINARE la propria inserzione
-- (le INSERT/DELETE vengono fatte via RPC SECURITY DEFINER, non direttamente)
DROP POLICY IF EXISTS "market_insert_own"   ON public.market_listings;
CREATE POLICY "market_insert_own" ON public.market_listings
    FOR INSERT WITH CHECK (seller_user_id = auth.uid());

DROP POLICY IF EXISTS "market_delete_own"   ON public.market_listings;
CREATE POLICY "market_delete_own" ON public.market_listings
    FOR DELETE USING (seller_user_id = auth.uid());


-- ─── RPC: rpc_list_car_for_sale ───────────────────────────────────────────────
-- Il client ha già rimosso l'auto dalla propria gameState e salvato.
-- Questa RPC inserisce l'auto nel mercato pubblico.
CREATE OR REPLACE FUNCTION public.rpc_list_car_for_sale(
    v_car_snapshot  jsonb,
    v_ask_price     bigint
)
RETURNS public.market_listings
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id    uuid := auth.uid();
    v_co_name    text;
    v_listing    public.market_listings;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: non autenticato';
    END IF;
    IF v_ask_price <= 0 THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: prezzo non valido';
    END IF;
    IF v_car_snapshot IS NULL OR v_car_snapshot->>'id' IS NULL THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: snapshot auto non valido';
    END IF;

    -- Recupera il nome dell'azienda dal leaderboard
    SELECT COALESCE(company_name, 'CEO') INTO v_co_name
    FROM public.leaderboard WHERE user_id = v_user_id;

    INSERT INTO public.market_listings (seller_user_id, seller_name, car_snapshot, ask_price)
    VALUES (v_user_id, COALESCE(v_co_name, 'CEO'), v_car_snapshot, v_ask_price)
    RETURNING * INTO v_listing;

    RETURN v_listing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_list_car_for_sale(jsonb, bigint) TO authenticated;


-- ─── RPC: rpc_cancel_listing ──────────────────────────────────────────────────
-- Il venditore ritira l'inserzione. Restituisce lo snapshot auto al client
-- (che lo reinserisce nella flotta locale e salva).
CREATE OR REPLACE FUNCTION public.rpc_cancel_listing(v_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_listing public.market_listings;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;

    SELECT * INTO v_listing
    FROM public.market_listings
    WHERE id = v_listing_id AND seller_user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_cancel_listing: inserzione non trovata o non tua';
    END IF;

    DELETE FROM public.market_listings WHERE id = v_listing_id;

    RETURN v_listing.car_snapshot;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_listing(uuid) TO authenticated;


-- ─── RPC: rpc_buy_market_car ─────────────────────────────────────────────────
-- Transazione atomica P2P:
-- 1. Verifica che il compratore abbia i soldi nel game_state JSON
-- 2. Scala il cash al compratore
-- 3. Accredita il netto (−5% tassa sistema) al venditore
-- 4. Rimuove l'inserzione
-- 5. Restituisce lo snapshot auto al compratore (lo aggiunge alla flotta locale)
CREATE OR REPLACE FUNCTION public.rpc_buy_market_car(v_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_buyer_id   uuid := auth.uid();
    v_listing    public.market_listings;
    v_buyer_cash bigint;
    v_fee        bigint;
    v_net        bigint;
    v_result     jsonb;
BEGIN
    IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'rpc_buy_market_car: non autenticato'; END IF;

    -- Lock inserzione (FOR UPDATE previene acquisto doppio simultaneo)
    SELECT * INTO v_listing
    FROM public.market_listings
    WHERE id = v_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_buy_market_car: inserzione non trovata (già venduta?)';
    END IF;
    IF v_listing.seller_user_id = v_buyer_id THEN
        RAISE EXCEPTION 'rpc_buy_market_car: non puoi comprare la tua stessa auto';
    END IF;
    IF v_listing.expires_at < now() THEN
        DELETE FROM public.market_listings WHERE id = v_listing_id;
        RAISE EXCEPTION 'rpc_buy_market_car: inserzione scaduta';
    END IF;

    -- Verifica fondi compratore
    v_buyer_cash := public._get_player_cash(v_buyer_id);
    IF v_buyer_cash < v_listing.ask_price THEN
        RAISE EXCEPTION 'rpc_buy_market_car: fondi insufficienti — hai €% ma servono €%',
            v_buyer_cash, v_listing.ask_price;
    END IF;

    -- Tassa sistema 5% — brucia moneta e contrasta l'inflazione
    v_fee := CEIL(v_listing.ask_price * 0.05);
    v_net := v_listing.ask_price - v_fee;

    -- Transazione finanziaria
    PERFORM public._add_player_cash(v_buyer_id,                -v_listing.ask_price);
    PERFORM public._add_player_cash(v_listing.seller_user_id,  v_net);

    -- Rimuovi inserzione
    DELETE FROM public.market_listings WHERE id = v_listing_id;

    -- Costruisci payload di ritorno
    v_result := jsonb_build_object(
        'car',          v_listing.car_snapshot,
        'price_paid',   v_listing.ask_price,
        'fee',          v_fee,
        'net_to_seller',v_net,
        'seller_name',  v_listing.seller_name
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_buy_market_car(uuid) TO authenticated;


-- ─── RPC: rpc_cleanup_expired_listings (schedulabile) ────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cleanup_expired_listings()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count int;
BEGIN
    WITH deleted AS (
        DELETE FROM public.market_listings WHERE expires_at < now() RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM deleted;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cleanup_expired_listings() TO authenticated;


-- =============================================================================
-- 2. HOLDINGS & SINDACATI — holdings + holding_members
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.holdings (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text        NOT NULL,
    leader_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description     text        NOT NULL DEFAULT '',
    max_members     int         NOT NULL DEFAULT 5,
    treasury        bigint      NOT NULL DEFAULT 0 CHECK (treasury >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.holding_members (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    holding_id      uuid        NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name    text        NOT NULL DEFAULT '',
    role            text        NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (holding_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_leader       ON public.holdings(leader_user_id);
CREATE INDEX IF NOT EXISTS idx_holding_members_user  ON public.holding_members(user_id);
CREATE INDEX IF NOT EXISTS idx_holding_members_guild ON public.holding_members(holding_id);

DROP TRIGGER IF EXISTS trg_holdings_updated_at ON public.holdings;
CREATE TRIGGER trg_holdings_updated_at
    BEFORE UPDATE ON public.holdings
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

ALTER TABLE public.holdings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_members ENABLE ROW LEVEL SECURITY;

-- Holdings: tutti possono leggere (lista pubblica per unirsi)
DROP POLICY IF EXISTS "holdings_select_all"     ON public.holdings;
CREATE POLICY "holdings_select_all" ON public.holdings FOR SELECT USING (true);

-- Holding members: tutti i member possono leggere la propria holding
DROP POLICY IF EXISTS "hm_select_own_holding"   ON public.holding_members;
CREATE POLICY "hm_select_own_holding" ON public.holding_members
    FOR SELECT USING (
        holding_id IN (
            SELECT holding_id FROM public.holding_members WHERE user_id = auth.uid()
        )
    );


-- ─── RPC: rpc_create_holding ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_holding(
    v_name        text,
    v_description text DEFAULT ''
)
RETURNS public.holdings
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id    uuid := auth.uid();
    v_co_name    text;
    v_holding    public.holdings;
    v_already_in uuid;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;
    IF LENGTH(TRIM(v_name)) < 3 THEN
        RAISE EXCEPTION 'rpc_create_holding: nome troppo corto (min 3 caratteri)';
    END IF;

    -- Verifica che non sia già in un'altra holding
    SELECT holding_id INTO v_already_in
    FROM public.holding_members WHERE user_id = v_user_id LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'rpc_create_holding: sei già in una holding — esci prima';
    END IF;

    SELECT COALESCE(company_name, 'CEO') INTO v_co_name
    FROM public.leaderboard WHERE user_id = v_user_id;

    INSERT INTO public.holdings (name, leader_user_id, description)
    VALUES (TRIM(v_name), v_user_id, COALESCE(TRIM(v_description), ''))
    RETURNING * INTO v_holding;

    INSERT INTO public.holding_members (holding_id, user_id, company_name, role)
    VALUES (v_holding.id, v_user_id, COALESCE(v_co_name, 'CEO'), 'leader');

    RETURN v_holding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_holding(text, text) TO authenticated;


-- ─── RPC: rpc_join_holding ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_join_holding(v_holding_id uuid)
RETURNS public.holding_members
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id  uuid := auth.uid();
    v_holding  public.holdings;
    v_co_name  text;
    v_count    int;
    v_member   public.holding_members;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;

    SELECT * INTO v_holding FROM public.holdings WHERE id = v_holding_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'rpc_join_holding: holding non trovata'; END IF;

    -- Controlla slot liberi
    SELECT COUNT(*) INTO v_count FROM public.holding_members WHERE holding_id = v_holding_id;
    IF v_count >= v_holding.max_members THEN
        RAISE EXCEPTION 'rpc_join_holding: holding al completo (max % membri)', v_holding.max_members;
    END IF;

    -- Verifica non già in una holding
    IF EXISTS (SELECT 1 FROM public.holding_members WHERE user_id = v_user_id) THEN
        RAISE EXCEPTION 'rpc_join_holding: sei già in una holding';
    END IF;

    SELECT COALESCE(company_name, 'CEO') INTO v_co_name
    FROM public.leaderboard WHERE user_id = v_user_id;

    INSERT INTO public.holding_members (holding_id, user_id, company_name, role)
    VALUES (v_holding_id, v_user_id, COALESCE(v_co_name, 'CEO'), 'member')
    RETURNING * INTO v_member;

    RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_join_holding(uuid) TO authenticated;


-- ─── RPC: rpc_leave_holding ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_leave_holding(v_holding_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_holding public.holdings;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;

    SELECT * INTO v_holding FROM public.holdings WHERE id = v_holding_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'rpc_leave_holding: holding non trovata'; END IF;

    IF v_holding.leader_user_id = v_user_id THEN
        -- Il leader che lascia scioglie la holding
        DELETE FROM public.holdings WHERE id = v_holding_id;
    ELSE
        DELETE FROM public.holding_members
        WHERE holding_id = v_holding_id AND user_id = v_user_id;
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_leave_holding(uuid) TO authenticated;


-- ─── RPC: rpc_contribute_holding_treasury ────────────────────────────────────
-- Membro contribuisce cash alla cassa comune della holding
CREATE OR REPLACE FUNCTION public.rpc_contribute_holding_treasury(
    v_holding_id uuid,
    v_amount     bigint
)
RETURNS bigint   -- nuova treasury
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id    uuid := auth.uid();
    v_cash       bigint;
    v_new_treasury bigint;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'rpc_contribute_holding_treasury: importo non valido'; END IF;

    -- Controlla membership
    IF NOT EXISTS (
        SELECT 1 FROM public.holding_members
        WHERE holding_id = v_holding_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'rpc_contribute_holding_treasury: non sei membro di questa holding';
    END IF;

    v_cash := public._get_player_cash(v_user_id);
    IF v_cash < v_amount THEN
        RAISE EXCEPTION 'rpc_contribute_holding_treasury: fondi insufficienti (hai €%, contribuisci €%)',
            v_cash, v_amount;
    END IF;

    PERFORM public._add_player_cash(v_user_id, -v_amount);

    UPDATE public.holdings
    SET treasury = treasury + v_amount
    WHERE id = v_holding_id
    RETURNING treasury INTO v_new_treasury;

    RETURN v_new_treasury;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_contribute_holding_treasury(uuid, bigint) TO authenticated;


-- =============================================================================
-- 3. BORSA VALORI — company_shares
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_shares (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name    text        NOT NULL DEFAULT '',
    shares_total    int         NOT NULL DEFAULT 1000 CHECK (shares_total > 0),
    shares_available int        NOT NULL DEFAULT 700  CHECK (shares_available >= 0),
    ipo_price       bigint      NOT NULL DEFAULT 10   CHECK (ipo_price > 0),
    current_price   bigint      NOT NULL DEFAULT 10   CHECK (current_price > 0),
    listed_at       timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (issuer_user_id)   -- una sola IPO per azienda
);

CREATE TABLE IF NOT EXISTS public.share_holdings (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      uuid        NOT NULL REFERENCES public.company_shares(id) ON DELETE CASCADE,
    owner_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shares_owned    int         NOT NULL DEFAULT 0 CHECK (shares_owned >= 0),
    avg_buy_price   bigint      NOT NULL DEFAULT 0,
    UNIQUE (listing_id, owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_shares_issuer  ON public.company_shares(issuer_user_id);
CREATE INDEX IF NOT EXISTS idx_share_holdings_owner   ON public.share_holdings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_share_holdings_listing ON public.share_holdings(listing_id);

DROP TRIGGER IF EXISTS trg_company_shares_updated_at ON public.company_shares;
CREATE TRIGGER trg_company_shares_updated_at
    BEFORE UPDATE ON public.company_shares
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

ALTER TABLE public.company_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_holdings  ENABLE ROW LEVEL SECURITY;

-- Tutti possono leggere la borsa (mercato pubblico)
DROP POLICY IF EXISTS "shares_select_all"        ON public.company_shares;
CREATE POLICY "shares_select_all" ON public.company_shares FOR SELECT USING (true);

DROP POLICY IF EXISTS "share_holdings_select_all" ON public.share_holdings;
CREATE POLICY "share_holdings_select_all" ON public.share_holdings FOR SELECT USING (true);


-- ─── RPC: rpc_list_company_ipo ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_company_ipo(
    v_ipo_price     bigint,
    v_shares_total  int DEFAULT 1000
)
RETURNS public.company_shares
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id   uuid := auth.uid();
    v_listing   public.company_shares;
    v_fee       bigint := 50000;
    v_cash      bigint;
    v_co_name   text;
    v_rep       numeric;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;

    -- Verifica reputazione (≥ 3.5)
    SELECT reputation, company_name INTO v_rep, v_co_name
    FROM public.leaderboard WHERE user_id = v_user_id;
    IF COALESCE(v_rep, 0) < 3.5 THEN
        RAISE EXCEPTION 'rpc_list_company_ipo: reputazione insufficiente (hai %.1f, servono 3.5★)', v_rep;
    END IF;

    -- Verifica fondi
    v_cash := public._get_player_cash(v_user_id);
    IF v_cash < v_fee THEN
        RAISE EXCEPTION 'rpc_list_company_ipo: fondi insufficienti (quota €50.000, hai €%)', v_cash;
    END IF;

    -- Controlla IPO già esistente
    IF EXISTS (SELECT 1 FROM public.company_shares WHERE issuer_user_id = v_user_id) THEN
        RAISE EXCEPTION 'rpc_list_company_ipo: azienda già quotata in borsa';
    END IF;

    -- Scala fee IPO
    PERFORM public._add_player_cash(v_user_id, -v_fee);

    -- Crea IPO: il 30% delle azioni va a investitori NPC (available = 70% per altri player)
    INSERT INTO public.company_shares (
        issuer_user_id, company_name,
        shares_total, shares_available,
        ipo_price, current_price
    ) VALUES (
        v_user_id, COALESCE(v_co_name, 'Chauffeur Empire'),
        v_shares_total,
        FLOOR(v_shares_total * 0.70)::int,  -- 70% disponibili per i player
        v_ipo_price, v_ipo_price
    )
    RETURNING * INTO v_listing;

    -- Il fondatore tiene il 30%
    INSERT INTO public.share_holdings (listing_id, owner_user_id, shares_owned, avg_buy_price)
    VALUES (v_listing.id, v_user_id, FLOOR(v_shares_total * 0.30)::int, v_ipo_price);

    RETURN v_listing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_list_company_ipo(bigint, int) TO authenticated;


-- ─── RPC: rpc_buy_company_shares ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buy_company_shares(
    v_listing_id uuid,
    v_qty        int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_buyer_id uuid := auth.uid();
    v_listing  public.company_shares;
    v_total    bigint;
    v_cash     bigint;
    v_holding  public.share_holdings;
BEGIN
    IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'rpc_buy_company_shares: quantità non valida'; END IF;

    SELECT * INTO v_listing FROM public.company_shares WHERE id = v_listing_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'rpc_buy_company_shares: azienda non trovata'; END IF;

    IF v_listing.issuer_user_id = v_buyer_id THEN
        RAISE EXCEPTION 'rpc_buy_company_shares: non puoi comprare azioni della tua stessa azienda';
    END IF;
    IF v_listing.shares_available < v_qty THEN
        RAISE EXCEPTION 'rpc_buy_company_shares: azioni disponibili insufficienti (% disponibili, richieste %)',
            v_listing.shares_available, v_qty;
    END IF;

    v_total := v_listing.current_price * v_qty;
    v_cash  := public._get_player_cash(v_buyer_id);
    IF v_cash < v_total THEN
        RAISE EXCEPTION 'rpc_buy_company_shares: fondi insufficienti (hai €%, servono €%)', v_cash, v_total;
    END IF;

    -- Deduct cash dal compratore, accredita all'emittente (mercato primario)
    PERFORM public._add_player_cash(v_buyer_id,             -v_total);
    PERFORM public._add_player_cash(v_listing.issuer_user_id, v_total);

    -- Aggiorna azioni disponibili
    UPDATE public.company_shares
    SET shares_available = shares_available - v_qty,
        current_price    = current_price + CEIL(current_price * 0.005 * v_qty / 10)  -- prezzo sale leggermente
    WHERE id = v_listing_id;

    -- Aggiorna/inserisci portafoglio compratore
    INSERT INTO public.share_holdings (listing_id, owner_user_id, shares_owned, avg_buy_price)
    VALUES (v_listing_id, v_buyer_id, v_qty, v_listing.current_price)
    ON CONFLICT (listing_id, owner_user_id) DO UPDATE
        SET avg_buy_price = ROUND(
                (share_holdings.avg_buy_price * share_holdings.shares_owned + v_listing.current_price * v_qty)
                / (share_holdings.shares_owned + v_qty)
            ),
            shares_owned = share_holdings.shares_owned + v_qty;

    RETURN jsonb_build_object(
        'qty',       v_qty,
        'price',     v_listing.current_price,
        'total',     v_total,
        'company',   v_listing.company_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_buy_company_shares(uuid, int) TO authenticated;


-- ─── RPC: rpc_sell_company_shares ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_sell_company_shares(
    v_listing_id uuid,
    v_qty        int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_seller_id uuid := auth.uid();
    v_listing   public.company_shares;
    v_holding   public.share_holdings;
    v_total     bigint;
BEGIN
    IF v_seller_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'rpc_sell_company_shares: quantità non valida'; END IF;

    SELECT * INTO v_listing FROM public.company_shares WHERE id = v_listing_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'rpc_sell_company_shares: azienda non trovata'; END IF;

    SELECT * INTO v_holding
    FROM public.share_holdings
    WHERE listing_id = v_listing_id AND owner_user_id = v_seller_id
    FOR UPDATE;

    IF NOT FOUND OR v_holding.shares_owned < v_qty THEN
        RAISE EXCEPTION 'rpc_sell_company_shares: azioni insufficienti (possiedi %, vuoi vendere %)',
            COALESCE(v_holding.shares_owned, 0), v_qty;
    END IF;

    v_total := v_listing.current_price * v_qty;

    -- Accredita venditore, rende le azioni nuovamente disponibili
    PERFORM public._add_player_cash(v_seller_id, v_total);

    UPDATE public.company_shares
    SET shares_available = LEAST(shares_total, shares_available + v_qty),
        current_price    = GREATEST(1, current_price - CEIL(current_price * 0.003 * v_qty / 10))
    WHERE id = v_listing_id;

    UPDATE public.share_holdings
    SET shares_owned = shares_owned - v_qty
    WHERE listing_id = v_listing_id AND owner_user_id = v_seller_id;

    -- Rimuovi riga se azzerata
    DELETE FROM public.share_holdings
    WHERE listing_id = v_listing_id AND owner_user_id = v_seller_id AND shares_owned <= 0;

    RETURN jsonb_build_object(
        'qty_sold',  v_qty,
        'price',     v_listing.current_price,
        'total',     v_total,
        'company',   v_listing.company_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_sell_company_shares(uuid, int) TO authenticated;


-- ─── RPC: rpc_daily_dividends (da chiamare ogni mezzanotte via cron/edge fn) ──
-- Calcola il 10% degli utili giornalieri di ogni azienda quotata
-- e lo distribuisce pro-quota ai holder (escludendo l'emittente stesso).
CREATE OR REPLACE FUNCTION public.rpc_daily_dividends()
RETURNS int   -- numero di distribuzioni effettuate
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_rec       record;
    v_count     int := 0;
    v_daily_rev bigint;
    v_div_pool  bigint;
    v_holder    record;
    v_div_share bigint;
BEGIN
    FOR v_rec IN SELECT * FROM public.company_shares LOOP
        -- Leggi il weeklyEarnings/7 come proxy del profitto giornaliero
        SELECT COALESCE((game_state->>'weeklyEarnings')::bigint / 7, 0)
        INTO v_daily_rev
        FROM public.game_saves
        WHERE user_id = v_rec.issuer_user_id AND slot_index = 0;

        v_daily_rev  := COALESCE(v_daily_rev, 0);
        v_div_pool   := FLOOR(v_daily_rev * 0.10);

        IF v_div_pool <= 0 THEN CONTINUE; END IF;

        -- Distribuisci pro-quota a tutti gli holder ECCETTO l'emittente
        FOR v_holder IN
            SELECT sh.owner_user_id, sh.shares_owned
            FROM public.share_holdings sh
            WHERE sh.listing_id = v_rec.id
              AND sh.owner_user_id <> v_rec.issuer_user_id
              AND sh.shares_owned > 0
        LOOP
            v_div_share := FLOOR(v_div_pool * v_holder.shares_owned::numeric / v_rec.shares_total);
            IF v_div_share > 0 THEN
                PERFORM public._add_player_cash(v_holder.owner_user_id, v_div_share);
                -- Scala il dividendo dal cash dell'emittente
                PERFORM public._add_player_cash(v_rec.issuer_user_id, -v_div_share);
                v_count := v_count + 1;
            END IF;
        END LOOP;

        -- Aggiorna prezzo azione in base alle performance
        UPDATE public.company_shares
        SET current_price = GREATEST(1,
            current_price + CASE
                WHEN v_daily_rev > 50000 THEN CEIL(current_price * 0.03)
                WHEN v_daily_rev > 10000 THEN CEIL(current_price * 0.01)
                WHEN v_daily_rev < 1000  THEN -CEIL(current_price * 0.02)
                ELSE 0
            END
        )
        WHERE id = v_rec.id;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_daily_dividends() TO authenticated;


-- =============================================================================
-- REALTIME: abilita le tabelle per Supabase Realtime
-- NOTA: questo NON si può fare via SQL su Supabase hosted.
-- Vai su: Dashboard → Database → Replication
-- e aggiungi queste tabelle nella sezione "Tables":
--   ✅ market_listings
--   ✅ holdings
--   ✅ holding_members
--   ✅ company_shares
--   ✅ share_holdings
-- =============================================================================


-- =============================================================================
-- POST-SCRIPT CHECKLIST:
--
-- 1. Esegui questo file nel SQL Editor di Supabase
-- 2. Vai in Dashboard → Database → Replication e abilita Realtime per:
--      market_listings, company_shares, share_holdings, holdings, holding_members
-- 3. Testa le RPC nel SQL Editor (come authenticated user):
--      SELECT * FROM rpc_list_car_for_sale('{"id":"test","name":"Test Car"}'::jsonb, 50000);
--      SELECT * FROM rpc_create_holding('Test Holding', 'La nostra gilda');
-- =============================================================================
