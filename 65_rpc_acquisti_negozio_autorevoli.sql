-- ================================================================
-- 65_rpc_acquisti_negozio_autorevoli.sql
-- Chauffeur Empire · La porta UNICA per gli acquisti del gioco.
--
-- Decisione Vlad (22/08/2026): tutto cio' che riguarda l'economia deve
-- essere custodito dal server/database, non dal browser locale.
--
-- Forma (identica per tutti i sistemi futuri):
--   SBAGLIATO: il browser calcola `saldo - prezzo` e comunica il risultato.
--   GIUSTO:    il browser dice «voglio comprare X»; il server legge il
--              prezzo DALLA TABELLA shop_prices, blocca la riga del
--              giocatore (FOR UPDATE), controlla il saldo, scala lui e
--              RESTITUISCE il saldo nuovo. Il browser lo scrive e basta.
--
-- Modello: 05_mmo_driver_coins.sql (FOR UPDATE su companies) e
--          08_mmo_p2p_marketplace.sql ~riga 613 (prezzo letto dal server).
--
-- NOTA MIGRAZIONE: questo file va APPLICATO da Vlad (Supabase SQL Editor),
-- non automaticamente.
--
-- Prezzi seminati = gli attuali costanti client di engine-store.js
-- (negozio Driver Coins, primo sistema convertito). Cambiare un prezzo
-- da ora in poi significa aggiornare QUI, non nel browser.
-- ================================================================

-- ── 1. Catalogo prezzi AUTORITATIVO ───────────────────────────────
-- Il prezzo non arriva mai dal browser: vive qui.
-- currency: 'dc' = Driver Coins (companies.driver_coins),
--           'cash' = cassa azienda (companies.cash).
-- min_price serve ai booster "massivi" col minimo storico
-- (es. sveglia tutti: max(3, n*2)); con qty=1 e unit_price>min_price
-- vale unit_price come sempre.
CREATE TABLE IF NOT EXISTS public.shop_prices (
    item_key    text        PRIMARY KEY,
    label       text        NOT NULL DEFAULT '',
    currency    text        NOT NULL DEFAULT 'dc' CHECK (currency IN ('dc', 'cash')),
    unit_price  bigint      NOT NULL CHECK (unit_price >= 0),
    min_price   bigint      NOT NULL DEFAULT 0 CHECK (min_price >= 0),
    active      boolean     NOT NULL DEFAULT true
);

INSERT INTO public.shop_prices (item_key, label, currency, unit_price, min_price) VALUES
    ('executive_pass',        'Executive Pass (30 giorni)',            'dc',   150, 0),
    ('skip_construction',     'Salta una costruzione (per unita')',    'dc',     8, 0),
    ('fuel_boost',            'Flotta rifornita al 100%',              'dc',     3, 0),
    ('wake_driver',           'Sveglia un autista',                    'dc',     3, 0),
    ('energy_boost',          'Energia CEO al 100%',                   'dc',     4, 0),
    ('insta_heal',            'Insta-heal autista',                    'dc',     2, 0),
    ('wake_all_drivers',      'Sveglia tutti (per autista)',           'dc',     2, 3),
    ('heal_all_drivers',      'Guarisci tutti (per autista)',          'dc',     2, 4),
    ('skip_all_academy',      'Completa tutti i corsi (per corso)',    'dc',     5, 0),
    ('skip_all_constructions','Completa tutte le costruzioni (per op)','dc',     8, 0),
    ('ops_bundle',            'Pacchetto Operativo',                   'dc',     9, 0),
    ('full_bundle',           'Pacchetto Imperiale',                   'dc',    35, 0)
ON CONFLICT (item_key) DO UPDATE
    SET label = EXCLUDED.label,
        currency = EXCLUDED.currency,
        unit_price = EXCLUDED.unit_price,
        min_price = EXCLUDED.min_price;

ALTER TABLE public.shop_prices ENABLE ROW LEVEL SECURITY;

-- Il catalogo e' pubblico in lettura: serve alla vetrina del negozio.
-- La scrittura NON ha policy: solo le migrazioni (ruolo admin) possono
-- toccare i prezzi, nessun client autenticato.
DROP POLICY IF EXISTS "shop_prices_select_all" ON public.shop_prices;
CREATE POLICY "shop_prices_select_all" ON public.shop_prices
    FOR SELECT USING (true);

-- ── 2. La RPC generica di acquisto ────────────────────────────────
-- p_item_key : cosa si compra (chiave del catalogo sopra).
-- p_qty      : quante unita' si comprano (default 1). Il PREZZO resta
--              autorita' del server: unit_price * qty, con minimo.
CREATE OR REPLACE FUNCTION public.rpc_shop_purchase(
    p_item_key text,
    p_qty      integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
    v_item       public.shop_prices%ROWTYPE;
    v_total      bigint;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    -- Validazioni dell'ordine (NON del prezzo: quello lo decide la tabella)
    IF p_item_key IS NULL OR length(trim(p_item_key)) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'articolo mancante');
    END IF;
    IF p_qty IS NULL OR p_qty < 1 OR p_qty > 1000 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quantita'' non valida');
    END IF;

    SELECT * INTO v_item FROM public.shop_prices WHERE item_key = trim(p_item_key);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'articolo sconosciuto');
    END IF;
    IF NOT v_item.active THEN
        RETURN jsonb_build_object('ok', false, 'error', 'articolo non disponibile');
    END IF;

    v_total := GREATEST(v_item.min_price, v_item.unit_price * p_qty);

    -- Lock della riga giocatore PRIMA di leggere i saldi: due acquisti
    -- contemporanei non devono poter spendere due volte gli stessi soldi.
    SELECT * INTO v_company FROM companies WHERE id = v_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'azienda non trovata');
    END IF;

    IF v_item.currency = 'dc' THEN
        IF v_company.driver_coins < v_total THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', 'Driver Coins insufficienti',
                'needed', v_total,
                'driver_coins', v_company.driver_coins
            );
        END IF;

        UPDATE companies
        SET driver_coins = driver_coins - v_total
        WHERE id = v_company_id
        RETURNING * INTO v_company;

    ELSE  -- currency = 'cash'
        IF v_company.cash < v_total THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', 'Fondi insufficienti',
                'needed', v_total,
                'cash', v_company.cash
            );
        END IF;

        UPDATE companies
        SET cash = cash - v_total
        WHERE id = v_company_id
        RETURNING * INTO v_company;
    END IF;

    -- Il browser non decide nulla: qui dentro c'e' il saldo VERO dopo la spesa.
    RETURN jsonb_build_object(
        'ok',           true,
        'item_key',     v_item.item_key,
        'qty',          p_qty,
        'price_paid',   v_total,
        'currency',     v_item.currency,
        'driver_coins', v_company.driver_coins,
        'cash',         v_company.cash
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_shop_purchase(text, integer) TO authenticated;
