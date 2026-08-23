-- ================================================================
-- 66_server_priced_shop_scaffold.sql
-- Chauffeur Empire · Fondamenta economia sul server (1 di N)
--
-- Decisione Vlad (22/08/2026): tutto ciò che riguarda l'economia del
-- gioco deve essere custodito dal server/database, non dal browser.
--
-- Questo file stabilisce LA FORMA per tutti i prossimi acquisti:
--   1. una tabella-catalogo con i prezzi, letti SOLO dal server;
--   2. una RPC generica che:
--        - riceve il tipo di acquisto e l'id dell'oggetto;
--        - legge il prezzo dal catalogo (mai da un parametro del client);
--        - blocca la riga del giocatore (FOR UPDATE) PRIMA di leggere
--          il saldo, così due acquisti simultanei non spendono due volte
--          gli stessi soldi;
--        - rifiuta se il saldo non basta, con errore leggibile;
--        - scala lui il prezzo e RESTITUISCE il saldo nuovo.
--      Il client non calcola nulla: scrive il saldo restituito.
--
-- Modello: rpc_buy_market_car in 08_mmo_p2p_marketplace.sql (lock FOR
-- UPDATE + verifica fondi + scrittura server) e le RPC Driver Coins di
-- 05_mmo_driver_coins.sql (saldo in companies.driver_coins).
--
-- IDEMPOTENTE: sicuro da rilanciare.
-- NOTA MIGRAZIONE: da applicare solo da Vlad (SQL editor Supabase).
-- ================================================================

-- ── 1. Catalogo prezzi lato server ───────────────────────────────
-- Il browser NON invia mai il prezzo: lo legge qui il server.
CREATE TABLE IF NOT EXISTS public.server_item_prices (
    kind         text    NOT NULL,              -- tipo di acquisto, es. 'driver_coins_store'
    item_id      text    NOT NULL,              -- identificativo oggetto, es. 'offline_limit'
    currency     text    NOT NULL DEFAULT 'driver_coins'
                         CHECK (currency IN ('driver_coins')),
    price        bigint  NOT NULL CHECK (price >= 0),
    active       boolean NOT NULL DEFAULT true,
    PRIMARY KEY (kind, item_id)
);

ALTER TABLE public.server_item_prices ENABLE ROW LEVEL SECURITY;

-- I prezzi non sono un segreto: chi è autenticato può leggerli.
DROP POLICY IF EXISTS "server_item_prices_select" ON public.server_item_prices;
CREATE POLICY "server_item_prices_select" ON public.server_item_prices
    FOR SELECT TO authenticated USING (true);
-- Nessuna policy di scrittura: i prezzi cambiano solo via migrazione SQL.

-- ── 2. RPC generica di acquisto ──────────────────────────────────
-- Restituisce SEMPRE jsonb { ok, ... } come le RPC esistenti.
-- Il saldo che vale è quello nel campo 'balance' della risposta.
CREATE OR REPLACE FUNCTION public.rpc_purchase_priced_item(
    p_kind     text,
    p_item_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
    v_price      bigint;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    -- Prezzo SOLO dal catalogo server: qualunque cifra mandata dal
    -- browser viene ignorata per costruzione (non è nemmeno un parametro).
    SELECT price INTO v_price
    FROM public.server_item_prices
    WHERE kind = p_kind AND item_id = p_item_id AND active;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', format('acquisto sconosciuto: %s / %s', p_kind, p_item_id)
        );
    END IF;

    -- Lock della riga giocatore PRIMA di leggere il saldo.
    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'company non trovata');
    END IF;

    IF v_company.driver_coins < v_price THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', format('Driver Coins insufficienti — hai %s ma servono %s',
                            v_company.driver_coins, v_price),
            'balance', v_company.driver_coins
        );
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins - v_price
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',      true,
        'item_id', p_item_id,
        'price',   v_price,
        'balance', v_company.driver_coins
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_purchase_priced_item(text, text) TO authenticated;
