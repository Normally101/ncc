-- ============================================================================
-- 48_lockdown_nemesis_shadowdef_tension_scaffold.sql
-- SCAFFOLD — NON applicato al DB di produzione da questa routine (nessuna
-- credenziale Supabase in questo ambiente cloud, stessa nota di 45_/47_).
--
-- Trovato in un audit esteso della stessa classe di bug già chiusa in 45_/47_
-- (RPC che si fidano di un parametro numerico dal client senza validarlo, o
-- che mancano un controllo di autorizzazione sul target). 4 fix indipendenti,
-- verificati singolarmente leggendo sorgente + call-site client prima di
-- scriverli — nessuno riportato dal subagent di scansione senza riscontro
-- personale.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 1 — rpc_nemesis_fund_rival: nessun rate-limit server-side. Il
-- "cooldown 48h" che il client mostra è puramente cosmetico (variabile JS
-- `nem.lastFunded`, mai inviata né verificata dal server).
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 28_nemesis_vip.sql. La funzione accredita v_amount (1.000-50.000,
-- range già validato) a QUALSIASI v_rival_user_id scelto dal chiamante,
-- "creato dal nulla" per design (commento originale: "pool VIP"). Nessuna
-- tabella server-side traccia lo stato nemesi (vive solo in
-- gameState.vipNemeses lato client, dentro game_saves) — non c'è quindi modo
-- di verificare qui che il chiamante abbia davvero un nemico VIP attivo senza
-- reinventare quella tabella (fuori scope per un fix difensivo). Fix minimo:
-- rate-limit server-side che rende impraticabile il loop (il gioco legittimo
-- la invoca al più 1 volta ogni 48 ore di gioco per VIP nemico, quindi 5/ora
-- reale copre ogni uso legittimo con ampio margine) mentre limita il danno
-- massimo di un abuso diretto via API a €250.000/ora invece che illimitato.
CREATE OR REPLACE FUNCTION public.rpc_nemesis_fund_rival(
    v_rival_user_id UUID,
    v_amount        BIGINT,
    v_vip_name      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_uid    UUID := auth.uid();
    v_rival_name    TEXT;
    v_caller_name   TEXT;
BEGIN
    IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_rival_user_id = v_caller_uid THEN RAISE EXCEPTION 'Non puoi finanziare te stesso'; END IF;
    IF v_amount < 1000 OR v_amount > 50000 THEN RAISE EXCEPTION 'Importo non valido (1000-50000)'; END IF;

    -- ── FIX: rate-limit server-side (vedi commento sopra) ─────────────────
    PERFORM public._ce_rate_limit('nemesis_fund_rival', 5, interval '1 hour');

    SELECT company_name INTO v_rival_name FROM public.companies WHERE user_id = v_rival_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rivale non trovato'; END IF;

    SELECT company_name INTO v_caller_name FROM public.companies WHERE user_id = v_caller_uid;

    UPDATE public.companies SET cash = cash + v_amount WHERE user_id = v_rival_user_id;

    INSERT INTO public.global_news (category, title, body, icon)
    VALUES (
        'vip',
        '🦹 ' || COALESCE(v_vip_name,'Un VIP') || ' finanzia ' || COALESCE(v_rival_name,'una holding rivale'),
        COALESCE(v_vip_name,'Un VIP arrabbiato') || ' ha versato €' ||
        to_char(v_amount, 'FM999,999,999') ||
        ' nelle casse di ' || COALESCE(v_rival_name,'un concorrente') ||
        ' per vendicarsi di ' || COALESCE(v_caller_name,'un''agenzia') || '.',
        '🦹'
    );

    RETURN jsonb_build_object(
        'funded_company', v_rival_name,
        'amount', v_amount,
        'vip', v_vip_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_nemesis_fund_rival(UUID, BIGINT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 2 — rpc_upgrade_shadow_defense: stesso bug di rpc_execute_shadow_op
-- (già fixato in 47_) nella funzione gemella dello stesso file, non toccata
-- lì per errore.
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 23_shadow_ops.sql. `v_cost` dal client senza controllo di segno:
-- `cash = cash - v_cost` con v_cost negativo accredita. Limitato a 5 chiamate
-- riuscite per account (defense_level tetto 5), ma ogni chiamata può passare
-- un v_cost negativo enorme prima di raggiungere il tetto. Tetto sui costi
-- reali osservati in `black_ops.js` (50.000-800.000): €1.000.000 dà margine
-- (~25%) senza rischiare di bloccare livelli legittimi.
CREATE OR REPLACE FUNCTION public.rpc_upgrade_shadow_defense(v_cost BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_cash  BIGINT;
    v_level INT := 0;
    -- ── FIX: tetto di sicurezza sul costo (vedi commento sopra) ───────────
    v_max_cost CONSTANT BIGINT := 1000000;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    -- ── FIX: rifiuta costi fuori dal range plausibile (blocca il mint) ────
    IF v_cost <= 0 OR v_cost > v_max_cost THEN
        RAISE EXCEPTION 'rpc_upgrade_shadow_defense: costo fuori range (%, max %)', v_cost, v_max_cost;
    END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_cost THEN RAISE EXCEPTION 'Fondi insufficienti'; END IF;

    SELECT COALESCE(defense_level, 0) INTO v_level FROM public.shadow_defense WHERE user_id = v_uid;
    IF v_level >= 5 THEN RAISE EXCEPTION 'Difesa già al massimo (5)'; END IF;

    UPDATE public.companies SET cash = cash - v_cost, liquid_assets = GREATEST(0, liquid_assets - v_cost) WHERE user_id = v_uid;

    INSERT INTO public.shadow_defense (user_id, defense_level, intel_spent)
    VALUES (v_uid, 1, v_cost)
    ON CONFLICT (user_id) DO UPDATE
    SET defense_level = LEAST(5, shadow_defense.defense_level + 1),
        intel_spent   = shadow_defense.intel_spent + v_cost;

    RETURN jsonb_build_object('new_level', LEAST(5, v_level + 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_upgrade_shadow_defense(BIGINT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 3 — rpc_dampen_tension: nessuna deduzione di cassa propria, nessun
-- legame verificato con un contributo reale. Chiamabile a sé stante per
-- azzerare la tensione nazionale (evitare lo Sciopero, -30% redditi a TUTTI
-- i giocatori) senza pagare nulla.
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 15_sindacato_mechanics.sql. Il client la chiama SEPARATAMENTE
-- (p2p-market.js:204) subito dopo rpc_contribute_holding_treasury, con lo
-- stesso importo — ma nulla collega le due chiamate lato server: si può
-- invocare rpc_dampen_tension da sola con qualunque v_amount, senza mai
-- contribuire cash a nessuna holding. rpc_contribute_holding_treasury
-- (08_mmo_p2p_marketplace.sql) invece è già corretta (deduce cash reale via
-- _add_player_cash con verifica fondi/membership).
--
-- Fix: internalizza la riduzione tensione dentro rpc_contribute_holding_
-- treasury stessa (stesso pattern di _add_player_cash: REVOKE dal client,
-- resta chiamabile solo da altre funzioni SECURITY DEFINER nella stessa
-- sessione). rpc_contribute_holding_treasury ora ritorna anche la tensione
-- aggiornata, quindi il client non ha più bisogno di una seconda chiamata.
-- **Richiede anche un piccolo aggiornamento a `p2p-market.js`** (già fatto,
-- vedi diff — gestisce sia la vecchia forma bigint del ritorno, se questa SQL
-- non è ancora applicata, sia la nuova jsonb dopo l'applicazione, così il
-- deploy del JS non rompe nulla finché tu non applichi anche la SQL).
REVOKE EXECUTE ON FUNCTION public.rpc_dampen_tension(BIGINT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_contribute_holding_treasury(
    v_holding_id uuid,
    v_amount     bigint
)
RETURNS jsonb   -- FIX: era bigint (solo treasury), ora include anche la tensione aggiornata
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id      uuid := auth.uid();
    v_cash         bigint;
    v_new_treasury bigint;
    v_new_tension  numeric;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'non autenticato'; END IF;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'rpc_contribute_holding_treasury: importo non valido'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.holding_members
        WHERE holding_id = v_holding_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'rpc_contribute_holding_treasury: non sei membro di questa holding';
    END IF;

    v_cash := public._get_player_cash(v_user_id);
    IF v_cash < v_amount THEN
        RAISE EXCEPTION 'rpc_contribute_holding_treasury: fondi insufficienti (hai €%, contribuisci €%)',
            v_cash, v_amount;
    END IF;

    PERFORM public._add_player_cash(v_user_id, -v_amount);

    UPDATE public.holdings
    SET treasury = treasury + v_amount
    WHERE id = v_holding_id
    RETURNING treasury INTO v_new_treasury;

    -- ── FIX: dampening tensione internalizzato, stesso importo VERO appena
    -- verificato/scalato sopra — non più un valore ripetuto dal client ──────
    IF v_amount >= 10000 THEN
        v_new_tension := public.rpc_dampen_tension(v_amount);
    ELSE
        SELECT tension INTO v_new_tension FROM public.global_tension WHERE id = 1;
    END IF;

    RETURN jsonb_build_object(
        'treasury', v_new_treasury,
        'tension',  COALESCE(v_new_tension, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_contribute_holding_treasury(uuid, bigint) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SEZIONE 4 — rpc_sell_crypto: v_coins_in negativo produce un mint di coin
-- gratuito (non solo un'ipotesi — verificato algebricamente sotto).
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato in 24_crypto_offshore.sql. Il check `v_holding.amount < v_coins_in`
-- non blocca v_coins_in negativo (una qualunque quantità posseduta è sempre
-- >= un numero negativo). Con v_coins_in negativo:
--   v_new_sup := supply + v_coins_in  → SCENDE sotto supply
--   v_eur_out := (reserve_eur - k/v_new_sup) * 0.995  → NEGATIVO (dividere k
--     per un v_new_sup più piccolo dà un quoziente più grande di reserve_eur)
--   cash = cash + v_eur_out::BIGINT   → il cast NUMERIC→BIGINT arrotonda a 0
--     per |v_eur_out| < 0.5 (es. v_coins_in = -0.001 su qualunque coin), quindi
--     costo reale ≈ €0
--   crypto_holdings.amount = amount - v_coins_in  → AUMENTA (sottrarre un
--     negativo somma)
-- Risultato: chiamando la RPC in loop con v_coins_in una piccola frazione
-- negativa si accumulano coin quasi gratis, poi vendibili normalmente per
-- cash reale. Fix: rifiuta v_coins_in non positivo, unica riga necessaria —
-- vendere una quantità positiva di coin posseduti resta l'unico uso
-- legittimo, invariato.
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

    -- ── FIX: rifiuta quantità non positive (blocca il mint via segno) ─────
    IF v_coins_in IS NULL OR v_coins_in <= 0 THEN
        RAISE EXCEPTION 'rpc_sell_crypto: quantità non valida';
    END IF;

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

GRANT EXECUTE ON FUNCTION public.rpc_sell_crypto(TEXT, NUMERIC) TO authenticated;
