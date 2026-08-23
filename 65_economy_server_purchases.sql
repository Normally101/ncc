-- =============================================================================
-- 65_economy_server_purchases.sql
-- Chauffeur Empire — RPC generica di acquisto DECISA DAL SERVER
-- Depends: 01_mmo_migration.sql (companies, game_saves),
--          06_mmo_bugfix_driver_coins.sql (companies.driver_coins),
--          17_executive_club.sql (coin_transactions)
-- IDEMPOTENTE: sicuro da rilanciare.
-- NOTA MIGRAZIONE: questo file va AGGIUNTO al repo, non applicato da chi
-- sviluppa — le chiavi del database di produzione ha solo Vlad, che lo
-- applica dall'hub dopo aver letto il riepilogo.
--
-- Perche' esiste: rpc_ec_spend riceveva l'importo DAL BROWSER (p_amount) e lo
-- scriveva senza discutere: chi apriva gli strumenti da sviluppatore dichiarava
-- il prezzo che voleva. La forma giusta (decisione Vlad 22/08/2026) e':
--   SBAGLIATO: il browser calcola saldo - prezzo e comunica il risultato.
--   GIUSTO:    il browser dice «voglio comprare X»; il server LEGGE IL PREZZO
--              DA UNA TABELLA, blocca la riga del giocatore, controlla che il
--              saldo basti, scala lui e RESTITUISCE il saldo nuovo.
-- Modello: rpc_buy_market_car (08_mmo_p2p_marketplace.sql ~riga 613) e
--          rpc_ec_spend (17_executive_club.sql).
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: CATALOGO PREZZI — economy_catalog
-- L'unica fonte legittima del prezzo. Se una voce non e' qui, l'acquisto non
-- esiste. Il browser puo' mostrare i costi che vuole nella UI: quello che
-- vale e' questa tabella.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.economy_catalog (
    purchase_type  TEXT        NOT NULL,   -- famiglia di acquisto ('driver_coins_shop', ...)
    item_id        TEXT        NOT NULL,   -- identificativo della cosa comprata
    currency       TEXT        NOT NULL CHECK (currency IN ('cash', 'driver_coins')),
    unit_price     BIGINT      NOT NULL CHECK (unit_price >= 0),   -- prezzo UNITARIO, deciso solo qui
    active         BOOLEAN     NOT NULL DEFAULT true,
    PRIMARY KEY (purchase_type, item_id)
);

ALTER TABLE public.economy_catalog ENABLE ROW LEVEL SECURITY;

-- Lettura libera per chi e' autenticato (la UI puo' mostrare il listino vero);
-- scrittura SOLO via service_role / SQL editor: nessuna policy di INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "economy_catalog_read" ON public.economy_catalog;
CREATE POLICY "economy_catalog_read" ON public.economy_catalog
    FOR SELECT USING (true);

-- Seed: il NEGOZIO DRIVER COINS (engine-store.js), primo sistema convertito.
-- Le voci a costo variabile (wake_all_drivers, heal_all_drivers, skip_all_*)
-- hanno qui il prezzo UNITARIO: il totale lo calcola il server dalla quantita'
-- richiesta, mai il browser.
INSERT INTO public.economy_catalog (purchase_type, item_id, currency, unit_price) VALUES
    ('driver_coins_shop', 'executive_pass',       'driver_coins', 150),
    ('driver_coins_shop', 'skip_construction',    'driver_coins',   8),
    ('driver_coins_shop', 'fuel_boost',           'driver_coins',   3),
    ('driver_coins_shop', 'wake_driver',          'driver_coins',   3),
    ('driver_coins_shop', 'energy_boost',         'driver_coins',   4),
    ('driver_coins_shop', 'insta_heal',           'driver_coins',   2),
    ('driver_coins_shop', 'wake_all_drivers',     'driver_coins',   2),
    ('driver_coins_shop', 'heal_all_drivers',     'driver_coins',   2),
    ('driver_coins_shop', 'skip_all_academy',     'driver_coins',   5),
    ('driver_coins_shop', 'skip_all_constructions','driver_coins',  8),
    ('driver_coins_shop', 'ops_bundle',           'driver_coins',   9),
    ('driver_coins_shop', 'full_bundle',          'driver_coins',  35)
ON CONFLICT (purchase_type, item_id) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: RPC GENERICA — rpc_economy_purchase
-- Riceve COSA si vuole comprare (tipo + id + quantita'), MAI il prezzo.
-- 1. legge prezzo e valuta dal catalogo (il browser non decide niente);
-- 2. blocca la riga del giocatore (FOR UPDATE) PRIMA di leggere il saldo:
--    due acquisti simultanei devono mettersi in fila, non spendere due volte
--    gli stessi soldi;
-- 3. rifiuta con errore leggibile se il saldo non basta (e non tocca nulla);
-- 4. scala e RESTITUISCE il saldo nuovo: e' quello che il client scrivera'.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_economy_purchase(
    p_purchase_type TEXT,
    p_item_id       TEXT,
    p_quantity      INTEGER DEFAULT 1
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id      UUID := auth.uid();
    v_currency     TEXT;
    v_unit_price   BIGINT;
    v_quantity     INTEGER;
    v_total        BIGINT;
    v_balance      BIGINT;
    v_new_balance  BIGINT;
    v_company_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_economy_purchase: utente non autenticato';
    END IF;

    -- Quantita' difesa dal server: almeno 1, al massimo 100 unita'. Il browser
    -- puo' mandare qualunque numero: qui viene tagliato, non fidato.
    v_quantity := GREATEST(1, LEAST(COALESCE(p_quantity, 1), 100));

    -- 1. Il prezzo arriva DAL SERVER, da tabella. Nessun parametro di prezzo
    --    esiste: anche un client ostile non puo' proporne uno.
    SELECT currency, unit_price
    INTO v_currency, v_unit_price
    FROM public.economy_catalog
    WHERE purchase_type = p_purchase_type
      AND item_id       = p_item_id
      AND active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_economy_purchase: acquisto sconosciuto (% / %)',
            p_purchase_type, p_item_id;
    END IF;

    -- 2. Lock della riga giocatore PRIMA di leggere il saldo.
    SELECT company_name,
           CASE WHEN v_currency = 'driver_coins' THEN driver_coins::bigint ELSE cash::bigint END
    INTO v_company_name, v_balance
    FROM public.companies
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'rpc_economy_purchase: azienda non trovata';
    END IF;

    v_total := v_unit_price * v_quantity;

    -- 3. Rifiuto leggibile, senza toccare niente.
    IF v_balance IS NULL OR v_balance < v_total THEN
        RAISE EXCEPTION 'rpc_economy_purchase: fondi insufficienti (%) — servono % %, disponibili %',
            v_currency, v_total, v_currency, COALESCE(v_balance, 0);
    END IF;

    -- 4. Scala e restituisce il saldo nuovo.
    IF v_currency = 'driver_coins' THEN
        UPDATE public.companies
        SET driver_coins = driver_coins - v_total
        WHERE user_id = v_user_id
        RETURNING driver_coins::bigint INTO v_new_balance;
    ELSE
        UPDATE public.companies
        SET cash = cash - v_total
        WHERE user_id = v_user_id
        RETURNING cash::bigint INTO v_new_balance;
    END IF;

    -- Audit: stesso registro delle spese DC dell'Executive Club.
    IF v_currency = 'driver_coins' THEN
        INSERT INTO public.coin_transactions
            (user_id, company_name, amount, transaction_type, item_id, balance_after)
        VALUES
            (v_user_id, v_company_name, -v_total, 'spend',
             p_purchase_type || ':' || p_item_id, v_new_balance);
    END IF;

    RETURN jsonb_build_object(
        'ok',            true,
        'purchase_type', p_purchase_type,
        'item_id',       p_item_id,
        'quantity',      v_quantity,
        'currency',      v_currency,
        'spent',         v_total,
        'driver_coins',  CASE WHEN v_currency = 'driver_coins' THEN v_new_balance ELSE NULL END,
        'cash',          CASE WHEN v_currency = 'cash'        THEN v_new_balance ELSE NULL END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_economy_purchase(TEXT, TEXT, INTEGER) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- RIEPILOGO
-- Creato: economy_catalog (listino autoritativo, RLS sola lettura),
--         rpc_economy_purchase(purchase_type, item_id, quantity) -> jsonb.
-- Convertito: negozio Driver Coins (engine-store.js) via CE_money.acquistoServer.
-- Prossimi sistemi: aggiungere le voci di catalogo, poi lato client chiamare
--                   CE_money.acquistoServer(tipo, itemId, quantita) invece di
--                   spend/spendDC. La ricetta completa e' nel riepilogo del lavoro.
-- ═════════════════════════════════════════════════════════════════════════════
