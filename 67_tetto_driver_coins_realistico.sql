-- =============================================================================
-- 67_tetto_driver_coins_realistico.sql
-- Chauffeur Empire — chiude il conio della valuta premium.
-- IDEMPOTENT: safe to re-run.
-- =============================================================================
-- TROVATO NEL PLAYTEST DI PIETRO (28/08/2026). Lui aveva notato il sintomo:
-- «inizio con 415 DC completamente gratis, se i DC sono in locale possono
-- essere modificati da console». L'intuizione era giusta, il buco e' peggio:
-- non e' in locale, e' sul SERVER.
--
-- `rpc_add_driver_coins` e' concessa a `authenticated` e accetta un importo
-- SCELTO DAL CLIENT, con un tetto di 1.000.000 per chiamata e un rate-limit di
-- 20 chiamate/minuto. Fanno **20 milioni di Driver Coins al minuto** da console,
-- sulla valuta che si compra con soldi veri.
--
-- PERCHE' NON SI PUO' SEMPLICEMENTE REVOCARE: le ricompense legittime passano
-- di qui (premi delle missioni, ordini giornalieri, premio settimanale, podio).
-- Revocarla spegnerebbe tutti i premi del gioco.
--
-- COSA SI PUO' FARE SUBITO, senza rompere niente: **stringere il tetto alla
-- scala vera dei premi**. Misurata sui cataloghi del gioco il 28/08/2026:
--   premio piu' alto di una missione ...... 120 DC   (quests-data.js)
--   premio settimanale ..................... 50 DC   (engine-daily.js:827, gia' capped)
--   podio classifica ....................... 15 DC   (engine-daily.js:858)
--   ordini giornalieri ..................... poche unita'
-- Il massimo legittimo e' 120. Il tetto scende a 500: **quattro volte** il
-- premio piu' generoso che il gioco possa dare, quindi nessun premio vero puo'
-- sbatterci contro, e il conio passa da 20.000.000/minuto a 10.000/minuto.
-- Riduzione di 2000 volte, zero effetti sul gioco.
--
-- ⚠️ RESTA UNO STOPGAP, NON LA CHIUSURA VERA. Finche' e' il client a dire
--    QUANTO accreditare, la porta e' socchiusa e non chiusa. La chiusura vera
--    e' la stessa dell'economia in euro: il server deve decidere l'importo da
--    un catalogo suo, dato solo il MOTIVO (`quest_reward`, `weekly_prize`...).
--    E' la fase 3 di docs/ECONOMY_SERVER_AUTH.md estesa ai Driver Coins.
--    Gli ACQUISTI VERI sono gia' fatti bene: `rpc_purchase_dc_pack` decide da
--    sola quanti coin dare, leggendo il catalogo lato server. E' il modello da
--    seguire per i premi.
-- =============================================================================

-- Le due versioni convivono (una a un argomento, una con p_item_id): entrambe
-- sono chiamabili dal browser, quindi vanno strette entrambe. Stringere una
-- sola lascerebbe l'altra come porta di servizio.

CREATE OR REPLACE FUNCTION public.rpc_add_driver_coins(p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
    -- Quattro volte il premio piu' alto del gioco (120). Vedi l'intestazione.
    v_max CONSTANT integer := 500;
BEGIN
    IF p_amount <= 0 OR p_amount > v_max THEN
        RETURN jsonb_build_object('ok', false,
            'error', format('amount out of range (1..%s)', v_max));
    END IF;
    PERFORM public._ce_rate_limit('add_driver_coins', 20, interval '1 minute');
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;
    UPDATE companies
       SET driver_coins = driver_coins + p_amount
     WHERE id = v_company_id
    RETURNING * INTO v_company;
    RETURN jsonb_build_object('ok', true, 'driver_coins', v_company.driver_coins);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_add_driver_coins(p_amount integer, p_item_id text DEFAULT 'sim_purchase'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_company  companies%ROWTYPE;
    v_new_bal  INTEGER;
    v_max CONSTANT integer := 500;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;
    PERFORM public._ce_rate_limit('add_driver_coins', 20, interval '1 minute');
    IF p_amount <= 0 OR p_amount > v_max THEN
        RAISE EXCEPTION 'rpc_add_driver_coins: importo fuori range (1..%)', v_max;
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    UPDATE companies
       SET driver_coins = driver_coins + p_amount
     WHERE user_id = v_user_id
    RETURNING driver_coins INTO v_new_bal;

    -- Registro dei movimenti di valuta premium: c'era gia' nella versione viva
    -- e va conservato. Riscrivere una funzione senza rileggerla per intero e'
    -- il modo classico di perdere pezzi come questo.
    INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
    VALUES (v_user_id, v_company.company_name, p_amount, 'purchase', p_item_id, v_new_bal);

    RETURN jsonb_build_object('ok', true, 'driver_coins', v_new_bal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_driver_coins(integer)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_driver_coins(integer, text) TO authenticated;

-- =============================================================================
-- FINE 67_tetto_driver_coins_realistico.sql
-- =============================================================================
