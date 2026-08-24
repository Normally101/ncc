-- ════════════════════════════════════════════════════════════════════════════
-- 66_server_priced_purchases.sql — Chauffeur Empire
-- Acquisti a prezzo deciso dal SERVER (decisione Vlad, hub 22/08/2026):
--   «il browser dice "voglio comprare X"; il server controlla il prezzo,
--    controlla che il saldo basti, scala lui, e RESTITUISCE il saldo nuovo.
--    Il browser lo scrive e basta.»
--
-- Perche': `rpc_ec_spend` (17_executive_club.sql) si fida di p_amount mandato
-- dal client: chi apre gli strumenti da sviluppatore dichiara il costo che
-- vuole. Qui il prezzo vive in una tabella del server e il parametro client
-- non esiste proprio.
--
-- Modello: rpc_buy_market_car (08_mmo_p2p_marketplace.sql ~riga 613):
-- lock FOR UPDATE della riga giocatore PRIMA di leggere il saldo, rifiuto
-- leggibile se i fondi non bastano, addebito, RESTITUIRE il saldo nuovo.
--
-- IDEMPOTENTE: safe to re-run. DA AGGIUNGERE, NON APPLICARE: lo applica Vlad.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── LISTINO UFFICIALE ────────────────────────────────────────────────────────
-- Una riga per articolo acquistabile. Il client NON puo' scrivere qui (RLS sotto)
-- e NON puo' proporre un prezzo: lo legge solo il server dentro la RPC.
CREATE TABLE IF NOT EXISTS public.purchase_prices (
    item_id     TEXT        PRIMARY KEY,
    currency    TEXT        NOT NULL CHECK (currency IN ('cash', 'driver_coins')),
    unit_price  BIGINT      NOT NULL CHECK (unit_price >= 0),
    min_price   BIGINT      NOT NULL DEFAULT 0 CHECK (min_price >= 0),
    description TEXT
);

ALTER TABLE public.purchase_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase_prices_read_own_rpc_only" ON public.purchase_prices;
CREATE POLICY "purchase_prices_no_direct_access" ON public.purchase_prices
    FOR ALL USING (false) WITH CHECK (false);

-- Prezzi attuali del NEGOZIO DRIVER COINS (engine-store.js), sistema campione.
-- ON CONFLICT DO NOTHING: se Vlad cambia un prezzo a mano, una ri-esecuzione
-- non glielo sovrascrive.
INSERT INTO public.purchase_prices (item_id, currency, unit_price, min_price, description) VALUES
    ('executive_pass',       'driver_coins', 150, 0, 'Executive Pass 30 giorni'),
    ('fuel_boost',           'driver_coins',   3, 0, 'Flotta rifornita al 100%'),
    ('energy_boost',         'driver_coins',   4, 0, 'Energia CEO al 100%'),
    ('ops_bundle',           'driver_coins',   9, 0, 'Pacchetto Operativo'),
    ('full_bundle',          'driver_coins',  35, 0, 'Pacchetto Imperiale'),
    -- Articoli a quantita': il costo e' unit_price * quantita', con eventuale minimo.
    ('skip_construction',    'driver_coins',   8, 0, 'Completa una costruzione subito'),
    ('construction_skip',    'driver_coins',   8, 0, 'Completa tutte le costruzioni'),
    ('wake_driver',          'driver_coins',   3, 0, 'Risveglia un autista'),
    ('insta_heal',           'driver_coins',   2, 0, 'Azzera stress di un autista'),
    ('wake_all_drivers',     'driver_coins',   2, 3, 'Risveglia tutti gli autisti'),
    ('heal_all_drivers',     'driver_coins',   2, 4, 'Guarisce tutto lo staff'),
    ('academy_skip',         'driver_coins',   5, 0, 'Completa un corso accademia')
ON CONFLICT (item_id) DO NOTHING;


-- ─── RPC GENERICA DI ACQUISTO ────────────────────────────────────────────────
-- Riceve SOLO valuta, articolo e quantita'. Il prezzo arriva dalla tabella:
-- qualunque cifra il browser dichiara viene ignorata perche' non viene letta.
CREATE OR REPLACE FUNCTION public.rpc_purchase(
    p_currency TEXT,
    p_item_id  TEXT,
    p_quantity INTEGER DEFAULT 1
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_price    public.purchase_prices%ROWTYPE;
    v_company  companies%ROWTYPE;
    v_qty      INTEGER := COALESCE(p_quantity, 1);
    v_cost     BIGINT;
    v_balance  BIGINT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_purchase: non autenticato';
    END IF;

    -- Throttle anti-loop (stessa difesa di 43_ratelimit_driver_coins.sql).
    PERFORM public._ce_rate_limit('rpc_purchase', 30, interval '1 minute');

    -- 1. Il prezzo si LEGGE dal listino del server. Nessun parametro client.
    SELECT * INTO v_price
    FROM public.purchase_prices
    WHERE item_id = p_item_id AND currency = p_currency;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_purchase: articolo "%" (% ) non presente nel listino', p_item_id, p_currency;
    END IF;

    IF v_qty < 1 OR v_qty > 10000 THEN
        RAISE EXCEPTION 'rpc_purchase: quantita'' non valida (%)', v_qty;
    END IF;

    v_cost := GREATEST(v_price.min_price, v_price.unit_price * v_qty);

    -- 2. Lock della riga azienda PRIMA di leggere il saldo: due acquisti
    --    simultanei non devono spendere due volte gli stessi soldi.
    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_purchase: azienda non trovata';
    END IF;

    -- 3. Il saldo che decide se l'acquisto passa e' quello del server.
    IF p_currency = 'cash' THEN
        IF COALESCE(v_company.cash, 0) < v_cost THEN
            RAISE EXCEPTION 'Fondi insufficienti: servono €%, hai €%',
                v_cost, v_company.cash;
        END IF;
    ELSE
        IF COALESCE(v_company.driver_coins, 0) < v_cost THEN
            RAISE EXCEPTION 'Driver Coins insufficienti: servono %, ne hai %',
                v_cost, v_company.driver_coins;
        END IF;
    END IF;

    -- 4. Scala lui e RESTITUISCE il saldo nuovo: e' QUESTO che il browser scrivera'.
    IF p_currency = 'cash' THEN
        UPDATE companies SET cash = cash - v_cost
        WHERE user_id = v_user_id
        RETURNING cash INTO v_balance;
    ELSE
        UPDATE companies SET driver_coins = driver_coins - v_cost
        WHERE user_id = v_user_id
        RETURNING driver_coins INTO v_balance;

        INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
        VALUES (v_user_id, v_company.company_name, -v_cost, 'spend', p_item_id, v_balance);
    END IF;

    RETURN jsonb_build_object(
        'ok',       true,
        'item_id',  p_item_id,
        'currency', p_currency,
        'spent',    v_cost,
        'balance',  v_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_purchase(TEXT, TEXT, INTEGER) TO authenticated;
