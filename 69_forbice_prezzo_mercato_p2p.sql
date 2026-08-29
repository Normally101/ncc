-- ════════════════════════════════════════════════════════════════════════════
-- 69_forbice_prezzo_mercato_p2p.sql
-- ⚠️ NON ANCORA APPLICATO A PRODUZIONE — serve l'ok di Vlad.
--    Da quando i pagamenti sono in live (30/08) ogni migrazione tocca un DB
--    con soldi veri sopra: si applica quando lo si e' deciso, non di passaggio.
--
-- COSA FA: mette due paletti assoluti al prezzo di un annuncio del mercato fra
-- giocatori. Oggi `rpc_list_car_for_sale` rifiuta solo `v_ask_price <= 0`:
-- qualunque altra cifra passa, compreso 999 miliardi.
--
-- PERCHE' SOLO PALETTI ASSOLUTI E NON UNA FORBICE VERA.
-- La forbice giusta e' relativa al valore dell'auto (50%-200% della stima), ed
-- e' gia' applicata nel client — `_forbicePrezzoP2P` in engine-fleet.js, con la
-- validazione dentro `p2pListCarForSale` cosi' vale anche da console. Il SERVER
-- pero' non conosce il valore di un'auto: il catalogo (NEW_CARS, i tier, la
-- formula condizione×moltiplicatore) vive in data.js e non esiste in Postgres.
-- Per un controllo relativo lato server servirebbe portare il catalogo nel DB —
-- e' un lavoro suo, non un `ALTER FUNCTION`.
--
-- QUANTO E' GRAVE OGGI: poco. Un prezzo assurdo non CREA denaro — chi compra
-- deve avere i contanti, e quelli `rpc_buy_market_car` li verifica gia' lato
-- server con `_get_player_cash`. Il danno di un annuncio da 999 miliardi e'
-- estetico (sporca la lista), quello di un annuncio da 1 euro e' un regalo fra
-- account. Nessuno dei due gonfia l'economia.
-- ════════════════════════════════════════════════════════════════════════════

-- Il tetto sta sopra l'auto piu' cara del catalogo (Embraer Phenom 300,
-- €18.000.000): non deve MAI bloccare un annuncio legittimo, deve solo
-- fermare le cifre che non appartengono a questo gioco.
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
    -- Paletti assoluti. La forbice relativa al valore dell'auto sta nel client
    -- (_forbicePrezzoP2P): qui il server non ha il catalogo per calcolarla.
    c_prezzo_min constant bigint := 100;
    c_prezzo_max constant bigint := 30000000;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: non autenticato';
    END IF;
    IF v_ask_price IS NULL OR v_ask_price < c_prezzo_min OR v_ask_price > c_prezzo_max THEN
        RAISE EXCEPTION 'rpc_list_car_for_sale: prezzo fuori mercato (ammesso da % a %)',
            c_prezzo_min, c_prezzo_max;
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

-- Verifica dopo l'applicazione:
--   SELECT prosrc LIKE '%c_prezzo_max%' AS forbice_attiva
--   FROM pg_proc WHERE proname = 'rpc_list_car_for_sale';
