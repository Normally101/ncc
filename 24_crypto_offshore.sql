-- ============================================================
-- 24_crypto_offshore.sql — Chauffeur Empire
-- Espansione 10: Criptovalute e Conti Offshore (AMM + riciclaggio)
-- ============================================================

-- ── TABELLE ──────────────────────────────────────────────────────────────────

-- Prezzi crypto aggiornati (server-authoritative, updated by edge function)
CREATE TABLE IF NOT EXISTS public.crypto_market (
    id          TEXT    PRIMARY KEY,  -- 'EMPIRE', 'BTC', 'ETH', 'USDT'
    name        TEXT    NOT NULL,
    icon        TEXT    DEFAULT '🪙',
    price_eur   NUMERIC NOT NULL DEFAULT 1.0,
    supply      NUMERIC NOT NULL DEFAULT 1000000,  -- AMM constant product liquidity
    reserve_eur NUMERIC NOT NULL DEFAULT 1000000,  -- EUR in AMM pool
    volatility  NUMERIC DEFAULT 0.05,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio cripto per utente
CREATE TABLE IF NOT EXISTS public.crypto_holdings (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    coin_id     TEXT    NOT NULL REFERENCES public.crypto_market(id),
    amount      NUMERIC NOT NULL DEFAULT 0,
    avg_buy_price NUMERIC DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, coin_id)
);

-- Conti offshore (anonimizzazione cash)
CREATE TABLE IF NOT EXISTS public.offshore_accounts (
    id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    jurisdiction    TEXT    NOT NULL DEFAULT 'cayman',
    balance         BIGINT  NOT NULL DEFAULT 0,  -- EUR offshore
    total_deposited BIGINT  DEFAULT 0,
    fee_rate        NUMERIC DEFAULT 0.03,  -- 3% deposit fee
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, jurisdiction)
);

-- Storico transazioni cripto
CREATE TABLE IF NOT EXISTS public.crypto_transactions (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL,  -- buy | sell | deposit_offshore | withdraw_offshore | launder
    coin_id     TEXT    REFERENCES public.crypto_market(id),
    eur_amount  BIGINT  NOT NULL,
    coin_amount NUMERIC DEFAULT 0,
    price_at    NUMERIC DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_holdings_user ON public.crypto_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_offshore_user         ON public.offshore_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_tx_user        ON public.crypto_transactions(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.crypto_market       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_holdings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offshore_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crypto_market_public_read" ON public.crypto_market FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crypto_holdings_own" ON public.crypto_holdings FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "offshore_own" ON public.offshore_accounts FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crypto_tx_own" ON public.crypto_transactions FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: crypto iniziali ──────────────────────────────────────────────────────

INSERT INTO public.crypto_market (id, name, icon, price_eur, supply, reserve_eur, volatility)
VALUES
    ('EMPIRE', 'EmpireCoin', '👑', 10.0,   500000, 5000000,  0.12),
    ('BTC',    'Bitcoin',    '₿',  62000.0, 1000,  62000000, 0.06),
    ('ETH',    'Ethereum',   '⟠',  3200.0,  10000, 32000000, 0.08),
    ('USDT',   'Tether USD', '💵', 0.92,   1000000, 920000, 0.002)
ON CONFLICT DO NOTHING;

-- ── AMM: Compra crypto (x*y=k constant product) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_buy_crypto(
    v_coin_id   TEXT,
    v_eur_in    BIGINT   -- EUR spesi
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_coin      public.crypto_market%ROWTYPE;
    v_cash      BIGINT;
    v_k         NUMERIC;
    v_new_res   NUMERIC;
    v_coins_out NUMERIC;
    v_fee       NUMERIC := 0.995;  -- 0.5% swap fee
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_eur_in < 100 THEN RAISE EXCEPTION 'Importo minimo €100'; END IF;

    SELECT * INTO v_coin FROM public.crypto_market WHERE id = v_coin_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Crypto non trovata'; END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_eur_in THEN RAISE EXCEPTION 'Fondi insufficienti'; END IF;

    -- AMM: x*y=k; eur_reserve * supply = k
    v_k         := v_coin.reserve_eur * v_coin.supply;
    v_new_res   := v_coin.reserve_eur + (v_eur_in * v_fee);
    v_coins_out := v_coin.supply - (v_k / v_new_res);

    IF v_coins_out <= 0 THEN RAISE EXCEPTION 'Slippage troppo elevato'; END IF;

    -- Aggiorna pool AMM
    UPDATE public.crypto_market
    SET reserve_eur   = v_new_res,
        supply        = supply - v_coins_out,
        price_eur     = v_new_res / (supply - v_coins_out),
        last_updated  = NOW()
    WHERE id = v_coin_id;

    -- Scala cash
    UPDATE public.companies SET cash = cash - v_eur_in, liquid_assets = GREATEST(0, liquid_assets - v_eur_in) WHERE user_id = v_uid;

    -- Aggiorna holding
    INSERT INTO public.crypto_holdings (user_id, coin_id, amount, avg_buy_price)
    VALUES (v_uid, v_coin_id, v_coins_out, v_eur_in::NUMERIC / v_coins_out)
    ON CONFLICT (user_id, coin_id) DO UPDATE
    SET amount = crypto_holdings.amount + v_coins_out,
        avg_buy_price = (crypto_holdings.avg_buy_price * crypto_holdings.amount + v_eur_in) / (crypto_holdings.amount + v_coins_out),
        updated_at = NOW();

    INSERT INTO public.crypto_transactions (user_id, type, coin_id, eur_amount, coin_amount, price_at)
    VALUES (v_uid, 'buy', v_coin_id, v_eur_in, v_coins_out, v_eur_in::NUMERIC / v_coins_out);

    RETURN jsonb_build_object(
        'coin_id',   v_coin_id,
        'eur_spent', v_eur_in,
        'coins_got', v_coins_out,
        'new_price', v_new_res / (v_coin.supply - v_coins_out)
    );
END;
$$;

-- ── AMM: Vendi crypto ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_sell_crypto(
    v_coin_id    TEXT,
    v_coins_in   NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_coin      public.crypto_market%ROWTYPE;
    v_holding   public.crypto_holdings%ROWTYPE;
    v_k         NUMERIC;
    v_new_sup   NUMERIC;
    v_eur_out   NUMERIC;
    v_fee       NUMERIC := 0.995;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_coin FROM public.crypto_market WHERE id = v_coin_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Crypto non trovata'; END IF;

    SELECT * INTO v_holding FROM public.crypto_holdings WHERE user_id = v_uid AND coin_id = v_coin_id;
    IF NOT FOUND OR v_holding.amount < v_coins_in THEN RAISE EXCEPTION 'Saldo insufficiente'; END IF;

    v_k       := v_coin.reserve_eur * v_coin.supply;
    v_new_sup := v_coin.supply + v_coins_in;
    v_eur_out := (v_coin.reserve_eur - (v_k / v_new_sup)) * v_fee;

    UPDATE public.crypto_market
    SET supply = v_new_sup,
        reserve_eur = v_coin.reserve_eur - v_eur_out,
        price_eur   = (v_coin.reserve_eur - v_eur_out) / v_new_sup,
        last_updated = NOW()
    WHERE id = v_coin_id;

    UPDATE public.companies SET cash = cash + v_eur_out::BIGINT, liquid_assets = liquid_assets + v_eur_out::BIGINT WHERE user_id = v_uid;

    UPDATE public.crypto_holdings SET amount = amount - v_coins_in, updated_at = NOW() WHERE user_id = v_uid AND coin_id = v_coin_id;
    DELETE FROM public.crypto_holdings WHERE user_id = v_uid AND coin_id = v_coin_id AND amount <= 0;

    INSERT INTO public.crypto_transactions (user_id, type, coin_id, eur_amount, coin_amount, price_at)
    VALUES (v_uid, 'sell', v_coin_id, v_eur_out::BIGINT, v_coins_in, v_eur_out / v_coins_in);

    RETURN jsonb_build_object('eur_received', v_eur_out, 'coins_sold', v_coins_in, 'new_price', (v_coin.reserve_eur - v_eur_out) / v_new_sup);
END;
$$;

-- ── Deposita in conto offshore ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_deposit_offshore(
    v_eur_amount   BIGINT,
    v_jurisdiction TEXT    DEFAULT 'cayman'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_cash   BIGINT;
    v_fee    BIGINT;
    v_net    BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_eur_amount < 10000 THEN RAISE EXCEPTION 'Minimo offshore: €10.000'; END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_eur_amount THEN RAISE EXCEPTION 'Fondi insufficienti'; END IF;

    v_fee := FLOOR(v_eur_amount * 0.03);  -- 3% commissione
    v_net := v_eur_amount - v_fee;

    UPDATE public.companies SET cash = cash - v_eur_amount, liquid_assets = GREATEST(0, liquid_assets - v_eur_amount) WHERE user_id = v_uid;

    INSERT INTO public.offshore_accounts (user_id, jurisdiction, balance, total_deposited)
    VALUES (v_uid, v_jurisdiction, v_net, v_eur_amount)
    ON CONFLICT (user_id, jurisdiction) DO UPDATE
    SET balance = offshore_accounts.balance + v_net,
        total_deposited = offshore_accounts.total_deposited + v_eur_amount;

    INSERT INTO public.crypto_transactions (user_id, type, eur_amount)
    VALUES (v_uid, 'deposit_offshore', v_eur_amount);

    RETURN jsonb_build_object('net_deposited', v_net, 'fee', v_fee, 'jurisdiction', v_jurisdiction);
END;
$$;

-- ── Preleva da conto offshore (riciclo, soggetto a rischio GdF) ─────────────

CREATE OR REPLACE FUNCTION public.rpc_withdraw_offshore(
    v_eur_amount   BIGINT,
    v_jurisdiction TEXT   DEFAULT 'cayman'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_offshore public.offshore_accounts%ROWTYPE;
    v_gdf_risk NUMERIC;
    v_seized   BOOLEAN := FALSE;
    v_penalty  BIGINT  := 0;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_offshore FROM public.offshore_accounts
    WHERE user_id = v_uid AND jurisdiction = v_jurisdiction FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conto offshore non trovato'; END IF;
    IF v_offshore.balance < v_eur_amount THEN RAISE EXCEPTION 'Saldo offshore insufficiente'; END IF;

    -- Rischio GdF: 8% base, aumenta con importi grandi
    v_gdf_risk := 0.08 + LEAST(0.20, v_eur_amount::NUMERIC / 10000000);

    IF random() < v_gdf_risk THEN
        -- Sequestro parziale: GdF sequestra il 40% del prelievo
        v_seized  := TRUE;
        v_penalty := FLOOR(v_eur_amount * 0.40);
        v_eur_amount := v_eur_amount - v_penalty;
    END IF;

    UPDATE public.offshore_accounts SET balance = balance - v_eur_amount - v_penalty WHERE user_id = v_uid AND jurisdiction = v_jurisdiction;
    UPDATE public.companies SET cash = cash + v_eur_amount, liquid_assets = liquid_assets + v_eur_amount WHERE user_id = v_uid;

    INSERT INTO public.crypto_transactions (user_id, type, eur_amount)
    VALUES (v_uid, 'withdraw_offshore', v_eur_amount);

    RETURN jsonb_build_object(
        'received', v_eur_amount,
        'seized',   v_seized,
        'penalty',  v_penalty
    );
END;
$$;

-- ── Portfolio e mercato ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_get_crypto_portfolio()
RETURNS TABLE (
    coin_id     TEXT,
    name        TEXT,
    icon        TEXT,
    amount      NUMERIC,
    avg_buy     NUMERIC,
    current_price NUMERIC,
    value_eur   NUMERIC,
    pnl_pct     NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT
        h.coin_id, m.name, m.icon,
        h.amount, h.avg_buy_price,
        m.price_eur,
        h.amount * m.price_eur AS value_eur,
        ROUND(((m.price_eur - h.avg_buy_price) / NULLIF(h.avg_buy_price, 0)) * 100, 2) AS pnl_pct
    FROM public.crypto_holdings h
    JOIN public.crypto_market m ON m.id = h.coin_id
    WHERE h.user_id = auth.uid() AND h.amount > 0
    ORDER BY value_eur DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_buy_crypto(TEXT, BIGINT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sell_crypto(TEXT, NUMERIC)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_deposit_offshore(BIGINT, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_withdraw_offshore(BIGINT, TEXT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_crypto_portfolio()             TO authenticated;
