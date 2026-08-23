-- ══════════════════════════════════════════════════════════════════════════════
-- 65_executive_pack_server_purchase.sql
--
-- Bypass totale della cassa nell'Executive Club (report Vlad 23/08): il bottone
-- "Acquista" dei pacchetti DC accreditava i Driver Coins client-side via
-- CE_money.earnDC senza NESSUN pagamento — minting dal nulla ripetibile.
--
-- Questa patch porta l'acquisto lato server:
--   * catalogo pacchetti TABELLA (fonte della verita'): il client passa solo
--     l'ID del pacchetto, mai un importo;
--   * rpc_purchase_dc_pack accredita SOLO dopo la riga di pagamento confermato
--     nel registro (ec_pack_payments): nessun pagamento -> nessun credito;
--   * ogni accredito finisce in coin_transactions come le altre spese DC.
--
-- NB: l'integrazione col vero PSP (Stripe/Play Billing) scrive in
-- ec_pack_payments; finche' non c'e', la RPC resta chiusa (0 righe di pagamento
-- = rifiuto) e lo store mostra "pagamento non confermato" invece di regalare DC.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Catalogo pacchetti: prezzi e contenuti decisi SOLO qui ────────────────────
CREATE TABLE IF NOT EXISTS public.ec_dc_packs (
    pack_id    TEXT PRIMARY KEY,
    dc_amount  INTEGER NOT NULL CHECK (dc_amount > 0),
    price_eur  NUMERIC(10,2) NOT NULL CHECK (price_eur >= 0)
);

INSERT INTO public.ec_dc_packs (pack_id, dc_amount, price_eur) VALUES
    ('starter',         50,   4.99),
    ('corporate',      220,  19.99),
    ('offshore',       600,  49.99),
    ('fondo_sovrano', 1300,  99.99)
ON CONFLICT (pack_id) DO UPDATE
    SET dc_amount = EXCLUDED.dc_amount,
        price_eur = EXCLUDED.price_eur;

ALTER TABLE public.ec_dc_packs ENABLE ROW LEVEL SECURITY;

-- ── Registro dei pagamenti: una riga per acquisto confermato dal PSP ──────────
CREATE TABLE IF NOT EXISTS public.ec_pack_payments (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pack_id      TEXT NOT NULL REFERENCES public.ec_dc_packs(pack_id),
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    redeemed     BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE public.ec_pack_payments ENABLE ROW LEVEL SECURITY;

-- ── RPC dedicata: l'unica porta per i pacchetti Executive Club ────────────────
CREATE OR REPLACE FUNCTION public.rpc_purchase_dc_pack(p_pack_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_pack     public.ec_dc_packs%ROWTYPE;
    v_payment  RECORD;
    v_company  companies%ROWTYPE;
    v_new_bal  INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    SELECT * INTO v_pack FROM public.ec_dc_packs WHERE pack_id = p_pack_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pacchetto sconosciuto');
    END IF;

    -- Il credito richiede un pagamento CONFERMATO non ancora riscosso:
    -- la riga viene consumata (redeemed) nella stessa transazione, quindi
    -- ogni pagamento puo' accreditare il suo pacchetto una volta sola.
    SELECT id INTO v_payment
    FROM public.ec_pack_payments
    WHERE user_id = v_user_id AND pack_id = p_pack_id AND redeemed = FALSE
    ORDER BY confirmed_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pagamento non confermato');
    END IF;

    UPDATE public.ec_pack_payments SET redeemed = TRUE WHERE id = v_payment.id;

    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins + v_pack.dc_amount
    WHERE user_id = v_user_id
    RETURNING driver_coins INTO v_new_bal;

    INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
    VALUES (v_user_id, v_company.company_name, v_pack.dc_amount, 'purchase', p_pack_id, v_new_bal);

    RETURN jsonb_build_object('ok', true, 'driver_coins', v_new_bal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_purchase_dc_pack(TEXT) TO authenticated;
