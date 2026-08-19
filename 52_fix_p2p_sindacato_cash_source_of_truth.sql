-- ============================================================================
-- 52_fix_p2p_sindacato_cash_source_of_truth.sql
-- FIX BUG CRITICAL: doppia source of truth del cash (companies.cash vs
-- game_saves.game_state.cash). Diagnosi completa in HANDOFF.md ("debito #1").
--
-- Root cause: _get_player_cash/_add_player_cash (helper usati da tutte le RPC
-- P2P/Sindacato — mercato auto, holding/IPO, azioni, consorzi, Don Carmine,
-- GdF) leggevano/scrivevano SOLO game_saves.game_state.cash. Il resto del
-- gioco (rpc_sync_cash, rpc_start_trip, rpc_sell_vehicle, rpc_take_loan, ecc.)
-- legge/scrive SOLO companies.cash, che è la source of truth prevista
-- dall'architettura (vedi auth.js Phase 5: "companies table is always
-- authoritative"). Risultato verificato leggendo il codice: ogni transazione
-- P2P veniva silenziosamente cancellata dal primo saveGame() successivo
-- (p2p-market.js/p2p-render.js chiamano saveGame() subito dopo l'RPC, che fa
-- un upsert COMPLETO del blob game_state con gameState.cash ancora stantio —
-- vedi saveSystem.js _cloudSaveSlot) — dupe di cassa per compratori/
-- contributori, perdita silenziosa di incasso per venditori.
--
-- Fix: gli helper ora operano su companies.cash, stesso identico contratto di
-- rpc_sync_cash (FOR UPDATE implicito nell'UPDATE, CHECK companies_cash_check
-- esistente come guardia anti-saldo-negativo). Le firme non cambiano — nessuna
-- delle 9 RPC chiamanti (08_mmo_p2p_marketplace.sql, 15_sindacato_mechanics.sql)
-- richiede modifiche, TRANNE le 3 che toccano DUE utenti nella stessa
-- transazione (buyer+seller / buyer+issuer / holder+issuer): per quelle
-- aggiungiamo un lock ordinato per evitare deadlock quando due transazioni
-- concorrenti lockano la stessa coppia di aziende in ruoli invertiti.
--
-- game_saves.game_state.cash resta come snapshot/cache (letto al boot,
-- sovrascritto ad ogni saveGame()) — non più scritto da transazioni
-- economiche. saveSystem.js NON viene toccato: una volta che gameState.cash
-- converge correttamente via Realtime su companies, il prossimo autosave
-- scrive comunque il valore corretto.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. _get_player_cash — ora legge companies.cash
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._get_player_cash(v_user_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cash bigint;
BEGIN
    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_user_id;
    RETURN COALESCE(v_cash, 0);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. _add_player_cash — ora scrive companies.cash. Niente più GREATEST(0,...)
-- che clampava silenziosamente un prelievo eccessivo: il CHECK
-- companies_cash_check (cash >= 0), già presente sulla tabella, solleva
-- eccezione e fa fare ROLLBACK all'intera RPC chiamante se il delta porta
-- sotto zero — stesso comportamento "fail loudly" già in uso altrove
-- (rpc_start_trip, rpc_sell_vehicle). L'UPDATE singolo è atomico: elimina il
-- TOCTOU tra il check preliminare (_get_player_cash, fatto dalle RPC chiamanti
-- solo per un messaggio d'errore leggibile PRIMA di tentare) e la scrittura.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._add_player_cash(v_user_id uuid, v_delta bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_new_cash bigint;
BEGIN
    UPDATE public.companies
    SET cash       = cash + v_delta,
        updated_at = now()
    WHERE user_id = v_user_id
    RETURNING cash INTO v_new_cash;

    IF NOT FOUND THEN
        RAISE EXCEPTION '_add_player_cash: azienda non trovata per user %', v_user_id;
    END IF;
    RETURN v_new_cash;
END;
$$;

GRANT EXECUTE ON FUNCTION public._get_player_cash(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public._add_player_cash(uuid, bigint) TO authenticated;
-- ── Ri-applica il REVOKE di 45_lockdown_cash_exploits_scaffold.sql ────────
-- Il GRANT sopra è necessario a CREATE OR REPLACE (Postgres non preserva i
-- privilegi tra ridefinizioni con firma diversa da come vennero originariamente
-- concessi in alcuni casi bordo) — lo togliamo subito dopo, stesso stato finale
-- di prima: chiamabili SOLO internamente da altre funzioni SECURITY DEFINER
-- (owner delle funzioni), MAI direttamente da un client autenticato.
REVOKE EXECUTE ON FUNCTION public._get_player_cash(uuid)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._add_player_cash(uuid, bigint) FROM PUBLIC, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. rpc_buy_market_car — aggiunge lock ordinato (buyer, seller) su companies
-- prima di muovere cash, per prevenire deadlock con acquisti incrociati
-- concorrenti (A compra da B mentre B compra da A nello stesso istante).
-- Corpo invariato per il resto (stessa logica fee 5%, stesso payload).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_buy_market_car(v_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

    -- ── FIX: lock ordinato (per user_id) su ENTRAMBE le companies coinvolte,
    -- prima di toccare cash — previene deadlock con la transazione inversa
    -- (seller che compra dal buyer) in corso nello stesso istante.
    PERFORM 1 FROM public.companies
    WHERE user_id IN (v_buyer_id, v_listing.seller_user_id)
    ORDER BY user_id
    FOR UPDATE;

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


-- ════════════════════════════════════════════════════════════════════════════
-- 4. rpc_buy_company_shares — stesso fix: lock ordinato (buyer, issuer).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_buy_company_shares(v_listing_id uuid, v_qty integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

    -- ── FIX: lock ordinato (per user_id) su buyer + issuer prima del cash ──
    PERFORM 1 FROM public.companies
    WHERE user_id IN (v_buyer_id, v_listing.issuer_user_id)
    ORDER BY user_id
    FOR UPDATE;

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

GRANT EXECUTE ON FUNCTION public.rpc_buy_company_shares(uuid, integer) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. rpc_daily_dividends — lock ordinato (holder, issuer) per ogni iterazione.
-- Job batch (cron/edge function), ma può girare mentre un utente compra/vende
-- azioni della stessa coppia — stesso principio anti-deadlock.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_daily_dividends()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        -- (invariato: resta una lettura del blob simulazione, non è cash)
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
                -- ── FIX: lock ordinato su holder + issuer prima del cash ──
                PERFORM 1 FROM public.companies
                WHERE user_id IN (v_holder.owner_user_id, v_rec.issuer_user_id)
                ORDER BY user_id
                FOR UPDATE;

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

-- ════════════════════════════════════════════════════════════════════════════
-- NOTA: rpc_contribute_holding_treasury, rpc_list_company_ipo,
-- rpc_sell_company_shares, rpc_contribute_consorzio, rpc_pay_don_carmine,
-- rpc_gdf_inspection_check NON sono ridefinite qui — toccano un solo utente
-- a testa (nessun rischio deadlock) e chiamano _get_player_cash/
-- _add_player_cash per nome: puntano automaticamente a companies.cash non
-- appena questa migration è applicata, senza bisogno di CREATE OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════════
