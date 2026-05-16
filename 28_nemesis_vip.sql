-- ============================================================
-- 28_nemesis_vip.sql — Chauffeur Empire
-- Espansione 11: Sistema Nemesi VIP
-- ============================================================

-- RPC: Un VIP nemico finanzia un rivale del giocatore target
-- Chiamato dal client del giocatore che ha deluso il VIP.
-- Trasferisce cash (proveniente dal "pool VIP", non dal giocatore) a un rivale.
CREATE OR REPLACE FUNCTION public.rpc_nemesis_fund_rival(
    v_rival_user_id UUID,   -- l'ID del rivale che riceve i fondi
    v_amount        BIGINT, -- importo trasferito (pagato dal "pool" globale, non dal target)
    v_vip_name      TEXT    -- nome del VIP che finanzia (per il news feed)
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

    -- Carica nome rivale
    SELECT company_name INTO v_rival_name FROM public.companies WHERE user_id = v_rival_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rivale non trovato'; END IF;

    -- Carica nome chiamante (il target che ha deluso il VIP)
    SELECT company_name INTO v_caller_name FROM public.companies WHERE user_id = v_caller_uid;

    -- Accredita il rivale (i fondi vengono dal "pool VIP" = creati dal nulla, simulano investimento esterno)
    UPDATE public.companies SET cash = cash + v_amount WHERE user_id = v_rival_user_id;

    -- Notifica globale news
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

-- RPC: Il giocatore corrompe un VIP nemico per pacificarlo
CREATE OR REPLACE FUNCTION public.rpc_nemesis_bribe_vip(
    v_bribe_amount BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_cash BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
    IF v_bribe_amount < 5000 THEN RAISE EXCEPTION 'Importo minimo corruzione: €5.000'; END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_bribe_amount THEN
        RAISE EXCEPTION 'Fondi insufficienti per la corruzione (hai €%, servono €%)', v_cash, v_bribe_amount;
    END IF;

    UPDATE public.companies SET cash = cash - v_bribe_amount WHERE user_id = v_uid;

    RETURN jsonb_build_object('success', true, 'paid', v_bribe_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_nemesis_fund_rival(UUID, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_nemesis_bribe_vip(BIGINT)              TO authenticated;
