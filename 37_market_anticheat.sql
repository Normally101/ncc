-- ════════════════════════════════════════════════════════════════════════
-- 37_market_anticheat.sql — Chauffeur Empire
-- Anti-cheat hardening: mercato P2P + aste giudiziarie
-- Versione 3 — completamente idempotente, nessun NOW() in indici parziali,
-- compatibile con tabella cheat_flags pre-esistente.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. cheat_flags: crea se non esiste, aggiunge colonne se mancano ───────────
CREATE TABLE IF NOT EXISTS public.cheat_flags (
    id         BIGSERIAL   PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cheat_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cheat_flags ADD COLUMN IF NOT EXISTS user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.cheat_flags ADD COLUMN IF NOT EXISTS flag_type  TEXT;
ALTER TABLE public.cheat_flags ADD COLUMN IF NOT EXISTS details    JSONB       DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_cheat_flags_user ON public.cheat_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_cheat_flags_type ON public.cheat_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_cheat_flags_ts   ON public.cheat_flags(created_at DESC);

-- ── 2. helper _flag_cheat (SECURITY DEFINER — bypassa RLS) ───────────────────
CREATE OR REPLACE FUNCTION public._flag_cheat(p_uid uuid, p_type text, p_details jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.cheat_flags(user_id, flag_type, details)
    VALUES (p_uid, p_type, p_details);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ── 3. judicial_bids: aggiungi updated_at per rate-limit offerte ──────────────
ALTER TABLE public.judicial_bids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── 4. rpc_list_car_for_sale v2 — sanity prezzo + rate-limit listing ──────────
CREATE OR REPLACE FUNCTION public.rpc_list_car_for_sale(
    v_car_snapshot  jsonb,
    v_ask_price     bigint
)
RETURNS public.market_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id    uuid := auth.uid();
    v_co_name    text;
    v_active_cnt int;
    v_listing    public.market_listings;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: non autenticato';
    END IF;
    IF v_ask_price < 1000 THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: prezzo minimo €1.000';
    END IF;
    IF v_ask_price > 50000000 THEN
        PERFORM public._flag_cheat(v_user_id, 'listing_price_cap',
            jsonb_build_object('ask_price', v_ask_price, 'car', v_car_snapshot->>'id'));
        RAISE EXCEPTION 'rpc_list_car_for_sale: prezzo massimo €50.000.000';
    END IF;
    IF v_car_snapshot IS NULL OR v_car_snapshot->>'id' IS NULL THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: snapshot auto non valido';
    END IF;

    -- max 5 listing attive per utente
    SELECT COUNT(*) INTO v_active_cnt
    FROM public.market_listings
    WHERE seller_user_id = v_user_id AND expires_at > now();

    IF v_active_cnt >= 5 THEN
        PERFORM public._flag_cheat(v_user_id, 'listing_rate_limit',
            jsonb_build_object('active_count', v_active_cnt));
        RAISE EXCEPTION 'rpc_list_car_for_sale: limite 5 inserzioni attive raggiunto';
    END IF;

    IF v_ask_price > 10000000 THEN
        PERFORM public._flag_cheat(v_user_id, 'listing_price_high',
            jsonb_build_object('ask_price', v_ask_price, 'car', v_car_snapshot->>'id'));
    END IF;

    SELECT COALESCE(company_name, 'CEO') INTO v_co_name
    FROM public.leaderboard WHERE user_id = v_user_id;

    INSERT INTO public.market_listings (seller_user_id, seller_name, car_snapshot, ask_price)
    VALUES (v_user_id, COALESCE(v_co_name, 'CEO'), v_car_snapshot, v_ask_price)
    RETURNING * INTO v_listing;

    RETURN v_listing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_list_car_for_sale(jsonb, bigint) TO authenticated;

-- ── 5. rpc_place_auction_bid v2 — rate-limit 10s + flag spike ────────────────
CREATE OR REPLACE FUNCTION public.rpc_place_auction_bid(
    v_auction_id  UUID,
    v_amount      BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_auction  public.judicial_auctions%ROWTYPE;
    v_cash     BIGINT;
    v_top_bid  BIGINT;
    v_prev_bid BIGINT;
    v_prev_ts  TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_auction FROM public.judicial_auctions WHERE id = v_auction_id FOR SHARE;
    IF NOT FOUND     THEN RAISE EXCEPTION 'Asta non trovata'; END IF;
    IF v_auction.status != 'open' THEN RAISE EXCEPTION 'Asta non aperta'; END IF;
    IF v_auction.auction_ends_at < now() THEN RAISE EXCEPTION 'Asta scaduta'; END IF;
    IF v_amount < v_auction.min_bid THEN
        RAISE EXCEPTION 'Offerta minima: €%', v_auction.min_bid;
    END IF;
    IF v_amount > 100000000 THEN
        PERFORM public._flag_cheat(v_uid, 'bid_cap_exceeded',
            jsonb_build_object('amount', v_amount, 'auction_id', v_auction_id));
        RAISE EXCEPTION 'Offerta massima €100.000.000';
    END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid;
    IF COALESCE(v_cash, 0) < v_amount THEN
        RAISE EXCEPTION 'Fondi insufficienti';
    END IF;

    -- rate-limit: max 1 rilancio ogni 10s per (utente, asta)
    SELECT amount, updated_at INTO v_prev_bid, v_prev_ts
    FROM public.judicial_bids
    WHERE auction_id = v_auction_id AND user_id = v_uid;

    IF v_prev_ts IS NOT NULL AND now() - v_prev_ts < INTERVAL '10 seconds' THEN
        PERFORM public._flag_cheat(v_uid, 'bid_rate_limit',
            jsonb_build_object('auction_id', v_auction_id,
                'secs', EXTRACT(EPOCH FROM (now() - v_prev_ts))));
        RAISE EXCEPTION 'Troppi rilanci ravvicinati — aspetta qualche secondo';
    END IF;

    SELECT MAX(amount) INTO v_top_bid
    FROM public.judicial_bids WHERE auction_id = v_auction_id;
    IF v_top_bid IS NOT NULL AND v_amount <= v_top_bid THEN
        RAISE EXCEPTION 'Offerta troppo bassa (attuale: €%)', v_top_bid;
    END IF;

    IF v_amount > 20000000 THEN
        PERFORM public._flag_cheat(v_uid, 'bid_spike',
            jsonb_build_object('amount', v_amount, 'auction_id', v_auction_id));
    END IF;

    INSERT INTO public.judicial_bids (auction_id, user_id, amount, updated_at)
    VALUES (v_auction_id, v_uid, v_amount, now())
    ON CONFLICT (auction_id, user_id) DO UPDATE
        SET amount = EXCLUDED.amount, updated_at = now();

    UPDATE public.judicial_auctions
    SET bid_count = (
        SELECT COUNT(DISTINCT user_id) FROM public.judicial_bids
        WHERE auction_id = v_auction_id
    )
    WHERE id = v_auction_id;

    RETURN jsonb_build_object(
        'success',  true,
        'amount',   v_amount,
        'prev_bid', v_prev_bid,
        'top_bid',  v_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_place_auction_bid(UUID, BIGINT) TO authenticated;

-- ── 6. indici aggiuntivi (nessun predicato con funzioni non-IMMUTABLE) ────────
CREATE INDEX IF NOT EXISTS idx_market_seller_active
    ON public.market_listings(seller_user_id, expires_at);

-- ════════════════════════════════════════════════════════════════════════
-- FINE
-- ════════════════════════════════════════════════════════════════════════
