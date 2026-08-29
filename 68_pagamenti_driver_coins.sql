-- ============================================================================
-- 68_pagamenti_driver_coins.sql — Chauffeur Empire
-- STATO: applicato al DB di produzione il 29/08/2026.
--
-- I Driver Coins si comprano con soldi veri. Fino a oggi il negozio chiamava
-- `rpc_purchase_dc_pack`, che NON ESISTE sul server: il pulsante falliva sempre
-- e il testo sotto ai pacchetti diceva «acquisti simulati (demo)». Un negozio
-- finto dentro un gioco che ha una valuta vera e' peggio di nessun negozio,
-- perche' insegna che i Driver Coins arrivano gratis.
--
-- LA REGOLA, e non ha eccezioni: NESSUN Driver Coin viene accreditato senza un
-- pagamento confermato da Stripe. Il client non puo' accreditare, non puo'
-- scegliere il prezzo e non puo' scegliere quanti coin riceve. Tutte e tre
-- queste decisioni stanno qui dentro.
--
-- IL PERCORSO COMPLETO:
--   1. il browser chiede /api/dc-checkout quale pacchetto vuole comprare
--   2. la funzione legge il prezzo DA QUESTA TABELLA (mai dal browser) e apre
--      una sessione di pagamento Stripe
--   3. il giocatore paga (carta, PayPal, Apple Pay, Google Pay)
--   4. Stripe chiama /api/dc-webhook, che verifica la firma e SOLO ALLORA
--      chiama `rpc_credit_dc_purchase` con la chiave service_role
--   5. il browser ricarica il saldo dal server
-- Il passo 4 e' l'unico che accredita, ed e' l'unico che il browser non puo'
-- raggiungere: `rpc_credit_dc_purchase` e' revocata ad anon e authenticated.
-- ============================================================================

-- ─── 1. CATALOGO: i prezzi stanno sul server, non nel browser ───────────────
CREATE TABLE IF NOT EXISTS public.dc_packs (
    pack_key      TEXT PRIMARY KEY,
    dc            INTEGER NOT NULL CHECK (dc > 0),
    price_cents   INTEGER NOT NULL CHECK (price_cents > 0),
    currency      TEXT    NOT NULL DEFAULT 'eur',
    label         TEXT    NOT NULL,
    attivo        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.dc_packs (pack_key, dc, price_cents, label) VALUES
    ('starter',       50,   499, 'Starter Pack'),
    ('corporate',    220,  1999, 'Corporate Pack'),
    ('offshore',     600,  4999, 'Offshore Pack'),
    ('fondo_sovrano',1300, 9999, 'Il Fondo Sovrano')
ON CONFLICT (pack_key) DO UPDATE
    SET dc = EXCLUDED.dc, price_cents = EXCLUDED.price_cents, label = EXCLUDED.label;

ALTER TABLE public.dc_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dc_packs_lettura ON public.dc_packs;
CREATE POLICY dc_packs_lettura ON public.dc_packs
    FOR SELECT TO anon, authenticated USING (attivo);
-- Nessuna policy di INSERT/UPDATE/DELETE: il catalogo si cambia solo da qui.

-- ─── 2. REGISTRO ACQUISTI: la memoria di cosa e' stato pagato ───────────────
-- `stripe_event_id` e' UNIQUE ed e' il cuore dell'idempotenza. Stripe consegna
-- lo stesso evento piu' volte quando la nostra risposta tarda o va persa: senza
-- questo vincolo, una rete lenta regalerebbe pacchetti doppi. Il vincolo sta
-- nel database e non nel codice della funzione perche' due consegne possono
-- arrivare in parallelo su due istanze diverse, dove nessun controllo
-- applicativo le vedrebbe entrambe.
CREATE TABLE IF NOT EXISTS public.dc_purchases (
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pack_key          TEXT NOT NULL,
    dc                INTEGER NOT NULL,
    amount_cents      INTEGER NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'eur',
    stripe_session_id TEXT UNIQUE,
    stripe_event_id   TEXT UNIQUE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dc_purchases_user_idx ON public.dc_purchases (user_id, created_at DESC);

ALTER TABLE public.dc_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dc_purchases_propri ON public.dc_purchases;
CREATE POLICY dc_purchases_propri ON public.dc_purchases
    FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Scrittura: nessuna policy. Ci scrive solo `rpc_credit_dc_purchase`, che gira
-- come SECURITY DEFINER e non e' raggiungibile dal browser.

-- ─── 3. L'ACCREDITO. L'unica porta, e non si apre dal browser ───────────────
CREATE OR REPLACE FUNCTION public.rpc_credit_dc_purchase(
    p_user_id    UUID,
    p_pack_key   TEXT,
    p_session_id TEXT,
    p_event_id   TEXT,
    p_amount_cents INTEGER,
    p_currency   TEXT DEFAULT 'eur'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pack    public.dc_packs%ROWTYPE;
    v_saldo   INTEGER;
    v_gia     BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_event_id IS NULL OR p_pack_key IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'parametri_mancanti');
    END IF;

    -- Gia' accreditato? Rispondiamo ok senza riaccreditare: per Stripe la
    -- consegna e' andata a buon fine e non deve riprovare all'infinito.
    SELECT EXISTS (SELECT 1 FROM public.dc_purchases WHERE stripe_event_id = p_event_id)
      INTO v_gia;
    IF v_gia THEN
        SELECT driver_coins INTO v_saldo FROM public.companies WHERE user_id = p_user_id;
        RETURN jsonb_build_object('ok', true, 'gia_accreditato', true,
                                  'driver_coins', COALESCE(v_saldo, 0));
    END IF;

    SELECT * INTO v_pack FROM public.dc_packs WHERE pack_key = p_pack_key AND attivo;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'pacchetto_sconosciuto');
    END IF;

    /* Il prezzo pagato deve coincidere con il listino. Se non coincide non
       accreditiamo e lasciamo traccia: significa che qualcuno ha aperto una
       sessione di pagamento che non viene dalla nostra funzione, oppure che il
       listino e' cambiato mentre un pagamento era in volo. In entrambi i casi
       la risposta giusta e' fermarsi e far guardare a un umano, non indovinare. */
    IF p_amount_cents IS DISTINCT FROM v_pack.price_cents THEN
        RAISE WARNING 'dc_purchase: importo % non corrisponde al listino % per %',
                      p_amount_cents, v_pack.price_cents, p_pack_key;
        RETURN jsonb_build_object('ok', false, 'reason', 'importo_non_corrispondente');
    END IF;

    INSERT INTO public.dc_purchases
        (user_id, pack_key, dc, amount_cents, currency, stripe_session_id, stripe_event_id)
    VALUES
        (p_user_id, p_pack_key, v_pack.dc, p_amount_cents, COALESCE(p_currency,'eur'),
         p_session_id, p_event_id);

    UPDATE public.companies
       SET driver_coins = COALESCE(driver_coins, 0) + v_pack.dc
     WHERE user_id = p_user_id
    RETURNING driver_coins INTO v_saldo;

    IF v_saldo IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'azienda_non_trovata');
    END IF;

    -- Traccia nel registro delle monete, come ogni altro movimento di DC.
    BEGIN
        INSERT INTO public.coin_transactions (user_id, amount, item_id, created_at)
        VALUES (p_user_id, v_pack.dc, 'acquisto_' || p_pack_key, now());
    EXCEPTION WHEN undefined_table OR undefined_column THEN
        NULL;   -- il registro monete e' un di piu': non blocca un pagamento vero
    END;

    RETURN jsonb_build_object('ok', true, 'driver_coins', v_saldo, 'dc_accreditati', v_pack.dc);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_credit_dc_purchase(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_credit_dc_purchase(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_credit_dc_purchase(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;

-- ─── 4. LA VECCHIA PORTA, CHIUSA A CHIAVE ──────────────────────────────────
/* `rpc_purchase_dc_pack` non e' mai esistita in produzione, ma il client la
   chiamava: l'errore che tornava era generico («funzione non trovata») e non
   distingueva «pagamenti rotti» da «pagamento rifiutato». La creiamo apposta
   perche' risponda in modo inequivocabile, e perche' un client vecchio ancora
   in circolazione riceva un no chiaro invece di un errore di trasporto.
   NON accredita nulla e non lo fara' mai: e' qui per dire di no. */
CREATE OR REPLACE FUNCTION public.rpc_purchase_dc_pack(v_pack_id TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'ok', false,
        'reason', 'pagamento_richiesto',
        'messaggio', 'I Driver Coins si acquistano dal negozio con un pagamento reale.'
    );
$$;
GRANT EXECUTE ON FUNCTION public.rpc_purchase_dc_pack(TEXT) TO anon, authenticated;

-- ─── 5. VERIFICA ───────────────────────────────────────────────────────────
-- SELECT pack_key, dc, price_cents FROM public.dc_packs ORDER BY price_cents;
-- SELECT has_function_privilege('authenticated',
--        'public.rpc_credit_dc_purchase(uuid,text,text,text,integer,text)', 'EXECUTE');
--   -> deve dare false
