-- ============================================================================
-- 62_aste_ciclo_di_vita.sql — Chauffeur Empire
--
-- Le Aste Giudiziarie erano scritte bene ma non vivevano. Misurato sul
-- database vero il 20/08/2026: 5 lotti, tutti ancora 'open', 4 dei quali
-- scaduti da giorni. Il motivo e' che `rpc_resolve_auction` esiste, funziona,
-- e non la chiama nessuno — il commento diceva "chiamata da cron o Edge
-- Function", ma quel cron non e' mai stato creato. Un giocatore poteva
-- offrire e aspettare per sempre.
--
-- Questo file chiude quattro buchi, in ordine di gravita':
--
--   1. Nessuno chiude le aste  → `_process_judicial_auctions()`, schedulata.
--   2. Vincere non dava niente → `rpc_claim_auction`, con `claimed_at` che
--      impedisce di riscuotere due volte lo stesso lotto.
--   3. Il vincitore senza fondi vinceva lo stesso: `LEAST(cash, bid)` gli
--      scalava quel che aveva e gli assegnava il lotto. Ora il lotto passa
--      al primo offerente che puo' davvero pagarlo.
--   4. Un solo saldo poteva vincere dieci aste: l'offerta controllava i
--      fondi ma non li impegnava. Ora conta anche le altre offerte aperte.
--
-- Il veicolo vinto entra nella flotta dal client (`gameState.fleet`), perche'
-- e' li' che la flotta vive in questo gioco. Il denaro no: quello si muove
-- solo qui dentro. E' la stessa divisione del resto del gioco, e ha lo stesso
-- limite noto — la flotta resta manipolabile dal browser. Sistemarla e' il
-- lavoro separato sull'autorita' del server, non questo.
-- ============================================================================

-- ── 1. Un lotto vinto si riscuote una volta sola ─────────────────────────────
ALTER TABLE public.judicial_auctions
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL;

-- Le aste vinte e NON ancora riscosse. Prima diceva "non ancora riscattate"
-- nel commento ma non aveva modo di saperlo: restituiva le stesse per sempre.
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
SET search_path = public
STABLE
AS $$
    SELECT id, lot_type, title, icon, vehicle_data, container_data, winning_bid, created_at
    FROM public.judicial_auctions
    WHERE winner_id = auth.uid() AND status = 'closed' AND claimed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 20;
$$;


-- ── 2. Riscuotere il lotto vinto ─────────────────────────────────────────────
-- Il denaro contenuto nei container lo accredita il server; il veicolo lo
-- riceve il client dal payload di ritorno. `claimed_at` viene scritto nella
-- stessa UPDATE che verifica che fosse NULL: due schede aperte insieme non
-- possono riscuotere due volte, perche' la seconda non trova righe.
CREATE OR REPLACE FUNCTION public.rpc_claim_auction(v_auction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_lotto   public.judicial_auctions%ROWTYPE;
    v_item    JSONB;
    v_contanti BIGINT := 0;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    UPDATE public.judicial_auctions
    SET claimed_at = now()
    WHERE id = v_auction_id
      AND winner_id = v_uid
      AND status = 'closed'
      AND claimed_at IS NULL
    RETURNING * INTO v_lotto;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lotto non riscuotibile: gia'' ritirato, non tuo, o asta non chiusa';
    END IF;

    -- I premi in denaro dei container passano dal server, mai dal browser.
    IF v_lotto.lot_type = 'container' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_lotto.container_data->'items', '[]'::jsonb))
        LOOP
            IF v_item->>'type' = 'cash' THEN
                v_contanti := v_contanti + GREATEST(0, COALESCE((v_item->>'amount')::BIGINT, 0));
            END IF;
        END LOOP;

        IF v_contanti > 0 THEN
            UPDATE public.companies
            SET cash = cash + v_contanti, liquid_assets = liquid_assets + v_contanti
            WHERE user_id = v_uid;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'lot_type',       v_lotto.lot_type,
        'vehicle_data',   v_lotto.vehicle_data,
        'container_data', v_lotto.container_data,
        'cash_accreditato', v_contanti
    );
END;
$$;


-- ── 3. Aggiudicazione: vince chi puo' pagare ─────────────────────────────────
-- La versione precedente, se il primo offerente non aveva piu' i soldi, gli
-- scalava quel che aveva (`LEAST(cash, bid)`) e gli dava il lotto lo stesso.
-- Bastava offrire alto e poi svuotare il conto per comprare a sconto.
-- Ora si scende lungo le offerte finche' qualcuno copre davvero il suo prezzo.
CREATE OR REPLACE FUNCTION public.rpc_resolve_auction(v_auction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auction   public.judicial_auctions%ROWTYPE;
    v_offerta   RECORD;
    v_cash      BIGINT;
BEGIN
    SELECT * INTO v_auction FROM public.judicial_auctions WHERE id = v_auction_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata'; END IF;
    IF v_auction.status <> 'open' THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'already resolved');
    END IF;
    IF v_auction.auction_ends_at > now() THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'not yet ended');
    END IF;

    FOR v_offerta IN
        SELECT user_id, amount
        FROM public.judicial_bids
        WHERE auction_id = v_auction_id
        ORDER BY amount DESC, created_at ASC
    LOOP
        -- Sotto il prezzo di riserva non si aggiudica a nessuno: le offerte
        -- sono ordinate per importo, quindi da qui in giu' sono tutte troppo basse.
        IF v_auction.reserve_price IS NOT NULL AND v_offerta.amount < v_auction.reserve_price THEN
            EXIT;
        END IF;

        SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_offerta.user_id FOR UPDATE;
        IF COALESCE(v_cash, 0) < v_offerta.amount THEN
            CONTINUE;   -- offerta scoperta: passa al prossimo
        END IF;

        UPDATE public.companies
        SET cash = cash - v_offerta.amount,
            liquid_assets = GREATEST(0, liquid_assets - v_offerta.amount)
        WHERE user_id = v_offerta.user_id;

        UPDATE public.judicial_auctions
        SET status = 'closed', winner_id = v_offerta.user_id, winning_bid = v_offerta.amount
        WHERE id = v_auction_id;

        RETURN jsonb_build_object(
            'success',   true,
            'winner_id', v_offerta.user_id,
            'amount',    v_offerta.amount,
            'lot_type',  v_auction.lot_type
        );
    END LOOP;

    UPDATE public.judicial_auctions SET status = 'cancelled' WHERE id = v_auction_id;
    RETURN jsonb_build_object('success', false, 'reason', 'nessuna offerta valida');
END;
$$;


-- ── 4. Offrire impegna i fondi ───────────────────────────────────────────────
-- v3: il controllo fondi ora conta anche le offerte gia' aperte su altre aste.
-- Prima con 10.000 in cassa si poteva essere il migliore offerente su dieci
-- lotti da 10.000: nove sarebbero rimasti scoperti alla chiusura.
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
    v_uid       UUID := auth.uid();
    v_auction   public.judicial_auctions%ROWTYPE;
    v_cash      BIGINT;
    v_impegnato BIGINT;
    v_top_bid   BIGINT;
    v_prev_ts   TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_auction FROM public.judicial_auctions WHERE id = v_auction_id FOR SHARE;
    IF NOT FOUND                          THEN RAISE EXCEPTION 'Asta non trovata'; END IF;
    IF v_auction.status <> 'open'         THEN RAISE EXCEPTION 'Asta non aperta'; END IF;
    IF v_auction.auction_ends_at < now()  THEN RAISE EXCEPTION 'Asta scaduta'; END IF;
    IF v_amount < v_auction.min_bid THEN
        RAISE EXCEPTION 'Offerta minima: €%', v_auction.min_bid;
    END IF;
    IF v_amount > 100000000 THEN
        PERFORM public._flag_cheat(v_uid, 'bid_cap_exceeded',
            jsonb_build_object('amount', v_amount, 'auction_id', v_auction_id));
        RAISE EXCEPTION 'Offerta massima €100.000.000';
    END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid;

    -- Quanto ho gia' promesso altrove, su aste ancora aperte e non scadute.
    SELECT COALESCE(SUM(b.amount), 0) INTO v_impegnato
    FROM public.judicial_bids b
    JOIN public.judicial_auctions a ON a.id = b.auction_id
    WHERE b.user_id = v_uid
      AND b.auction_id <> v_auction_id
      AND a.status = 'open'
      AND a.auction_ends_at > now();

    IF COALESCE(v_cash, 0) < v_impegnato + v_amount THEN
        RAISE EXCEPTION 'Fondi insufficienti: hai gia'' impegnato €% in altre aste', v_impegnato;
    END IF;

    -- rate-limit: max 1 rilancio ogni 10s per (utente, asta)
    SELECT updated_at INTO v_prev_ts
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
        SELECT COUNT(DISTINCT user_id) FROM public.judicial_bids WHERE auction_id = v_auction_id
    )
    WHERE id = v_auction_id;

    RETURN jsonb_build_object('success', true, 'amount', v_amount);
END;
$$;


-- ── 4-bis. I lotti devono somigliare alle auto del gioco ─────────────────────
-- Il generatore originale aveva due difetti che rendevano un lotto inutile
-- anche una volta vinto:
--
--   • scriveva i tier in maiuscolo ('BUSINESS', 'PRESIDENTIAL'), un
--     vocabolario che esiste solo dentro auctions.js. La flotta del gioco usa
--     'standard' | 'business' | 'vip' | 'ultra' (data.js), quindi il veicolo
--     vinto sarebbe entrato in garage con un tier che nessun'altra parte del
--     gioco sa leggere;
--   • per i container riempiva `vehicle_data` invece di `container_data`,
--     cioe' generava scatole vuote: aprirle non avrebbe dato niente.
--
-- Il server decide tier, condizione e chilometri — la parte economica. Quale
-- modello esatto sia il veicolo lo sceglie il client dal catalogo di data.js,
-- che resta l'unico posto dove il catalogo e' scritto.
CREATE OR REPLACE FUNCTION public.rpc_spawn_judicial_auction(
    v_lot_type      TEXT    DEFAULT 'vehicle',
    v_tier          TEXT    DEFAULT 'business',
    v_min_bid       BIGINT  DEFAULT 20000,
    v_duration_days INT     DEFAULT 3
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id     UUID;
    v_tier_n TEXT := lower(coalesce(v_tier, 'business'));
    v_titoli TEXT[] := ARRAY[
        'Veicolo Sequestrato — Tribunale di Roma',
        'Lotto Giudiziario — Corte d''Appello',
        'Confisca DIA — Distretto Sud',
        'Fallimento NCC — Tribunale Civile',
        'Sequestro GdF — Operazione Speciale'
    ];
    v_titolo TEXT := v_titoli[1 + floor(random() * array_length(v_titoli, 1))::INT];
    v_veicolo   JSONB := '{}'::jsonb;
    v_container JSONB := '{}'::jsonb;
BEGIN
    IF v_tier_n NOT IN ('standard','business','vip','ultra') THEN
        v_tier_n := 'business';
    END IF;

    IF v_lot_type = 'container' THEN
        v_titolo := 'Container Sigillato — Dogana';
        -- Il contenuto e' deciso ora e resta nascosto finche' non si vince:
        -- deciderlo all'apertura significherebbe farlo decidere al browser.
        v_container := jsonb_build_object('items', jsonb_build_array(
            jsonb_build_object('type', 'cash',
                'amount', (v_min_bid * (0.6 + random() * 1.1))::BIGINT),
            jsonb_build_object('type', 'vehicle',
                'tier', v_tier_n,
                'condition', 40 + floor(random() * 45)::INT)
        ));
    ELSE
        v_veicolo := jsonb_build_object(
            'tier',      v_tier_n,
            'condition', 45 + floor(random() * 45)::INT,
            'km',        20000 + floor(random() * 100000)::INT,
            'year',      2018 + floor(random() * 7)::INT
        );
    END IF;

    INSERT INTO public.judicial_auctions
        (lot_type, title, icon, vehicle_data, container_data, min_bid, auction_ends_at)
    VALUES (
        v_lot_type, v_titolo,
        CASE WHEN v_lot_type = 'container' THEN '📦'
             WHEN v_tier_n = 'ultra' THEN '👑'
             WHEN v_tier_n = 'vip'   THEN '🏛️'
             WHEN v_tier_n = 'business' THEN '🚗'
             ELSE '🚙' END,
        v_veicolo, v_container, v_min_bid,
        now() + (v_duration_days || ' days')::INTERVAL
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;


-- ── 5. Il battito che tiene vive le aste ─────────────────────────────────────
-- Chiude quelle scadute e ne rimette in circolo abbastanza da non lasciare la
-- sezione vuota. Senza questa funzione schedulata tutto il resto e' inerte.
CREATE OR REPLACE FUNCTION public._process_judicial_auctions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id       UUID;
    v_chiuse   INT := 0;
    v_aperte   INT;
    v_nuove    INT := 0;
    v_tier     TEXT;
    v_min      BIGINT;
    LOTTI_APERTI CONSTANT INT := 6;   -- quanti lotti deve trovare chi apre la sezione
BEGIN
    FOR v_id IN
        SELECT id FROM public.judicial_auctions
        WHERE status = 'open' AND auction_ends_at <= now()
    LOOP
        PERFORM public.rpc_resolve_auction(v_id);
        v_chiuse := v_chiuse + 1;
    END LOOP;

    SELECT COUNT(*) INTO v_aperte
    FROM public.judicial_auctions
    WHERE status = 'open' AND auction_ends_at > now();

    WHILE v_aperte + v_nuove < LOTTI_APERTI LOOP
        -- Distribuzione dei tier: il lusso deve restare raro, altrimenti
        -- l'asta diventa la scorciatoia per saltare tutta la progressione.
        v_tier := (ARRAY['standard','standard','business','business','vip','ultra'])
                  [1 + floor(random() * 6)::int];
        v_min := CASE v_tier
            WHEN 'standard' THEN 8000
            WHEN 'business' THEN 25000
            WHEN 'vip'      THEN 90000
            ELSE 200000
        END;
        PERFORM public.rpc_spawn_judicial_auction(
            CASE WHEN random() < 0.2 THEN 'container' ELSE 'vehicle' END,
            v_tier, v_min, 2);
        v_nuove := v_nuove + 1;
    END LOOP;

    RETURN jsonb_build_object('chiuse', v_chiuse, 'nuove', v_nuove, 'aperte', v_aperte + v_nuove);
END;
$$;


-- ── 6. Permessi ──────────────────────────────────────────────────────────────
-- Aggiudicare e generare lotti non sono gesti di un giocatore: restano al
-- servizio schedulato. `rpc_resolve_auction` era concessa a `authenticated`,
-- il che lasciava a chiunque il momento in cui il denaro cambia mano.
REVOKE EXECUTE ON FUNCTION public.rpc_resolve_auction(UUID)          FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public._process_judicial_auctions()       FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.rpc_spawn_judicial_auction(TEXT, TEXT, BIGINT, INT)
                                                                     FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION public.rpc_claim_auction(UUID)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_place_auction_bid(UUID, BIGINT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_get_won_auctions()             TO authenticated;


-- ── 7. Il cron ───────────────────────────────────────────────────────────────
-- Ogni 15 minuti: abbastanza fitto perche' un'asta non resti scaduta a lungo
-- sotto gli occhi di chi ha offerto, abbastanza rado da non pesare.
SELECT cron.unschedule('aste-giudiziarie') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'aste-giudiziarie'
);
SELECT cron.schedule('aste-giudiziarie', '*/15 * * * *',
    $cron$ SELECT public._process_judicial_auctions(); $cron$);
