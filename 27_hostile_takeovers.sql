-- ============================================================
-- 27_hostile_takeovers.sql — Chauffeur Empire
-- Espansione 11: OPA Ostili e Dividendo Maggioritario
-- ============================================================

-- Tabella OPA attive
CREATE TABLE IF NOT EXISTS public.hostile_takeovers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id      UUID        NOT NULL REFERENCES public.company_shares(id) ON DELETE CASCADE,
    target_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raider_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raider_pct      NUMERIC     NOT NULL DEFAULT 0,
    buyback_price   BIGINT      NOT NULL DEFAULT 0,
    total_dividends BIGINT      NOT NULL DEFAULT 0,
    status          TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    UNIQUE(listing_id, raider_user_id)
);

ALTER TABLE public.hostile_takeovers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "opa_select_all" ON public.hostile_takeovers FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "opa_own_modify" ON public.hostile_takeovers FOR ALL USING (
      auth.uid() = raider_user_id OR auth.uid() = target_user_id
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_opa_listing ON public.hostile_takeovers(listing_id);
CREATE INDEX IF NOT EXISTS idx_opa_target  ON public.hostile_takeovers(target_user_id);
CREATE INDEX IF NOT EXISTS idx_opa_raider  ON public.hostile_takeovers(raider_user_id);

-- ── Funzione interna: controlla soglia OPA dopo ogni acquisto ──────────────
CREATE OR REPLACE FUNCTION public._check_opa_threshold(
    p_listing_id    UUID,
    p_buyer_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_shares      INT;
    v_buyer_shares      INT;
    v_buyer_pct         NUMERIC;
    v_target_user_id    UUID;
    v_buyback_price     BIGINT;
    v_raider_name       TEXT;
    v_target_name       TEXT;
BEGIN
    SELECT shares_total, issuer_user_id
    INTO v_total_shares, v_target_user_id
    FROM public.company_shares
    WHERE id = p_listing_id;

    IF NOT FOUND THEN RETURN; END IF;
    IF p_buyer_user_id = v_target_user_id THEN RETURN; END IF;

    SELECT COALESCE(shares_owned, 0)
    INTO v_buyer_shares
    FROM public.share_holdings
    WHERE listing_id = p_listing_id AND owner_user_id = p_buyer_user_id;

    v_buyer_pct := (v_buyer_shares::NUMERIC / NULLIF(v_total_shares, 0)) * 100;

    IF v_buyer_pct < 51 THEN RETURN; END IF;

    IF EXISTS (
        SELECT 1 FROM public.hostile_takeovers
        WHERE listing_id = p_listing_id
          AND raider_user_id = p_buyer_user_id
          AND status = 'active'
    ) THEN RETURN; END IF;

    SELECT FLOOR(current_price * FLOOR(shares_total * 0.51) * 1.5)
    INTO v_buyback_price
    FROM public.company_shares
    WHERE id = p_listing_id;

    INSERT INTO public.hostile_takeovers (
        listing_id, target_user_id, raider_user_id,
        raider_pct, buyback_price
    ) VALUES (
        p_listing_id, v_target_user_id, p_buyer_user_id,
        v_buyer_pct, v_buyback_price
    );

    SELECT company_name INTO v_raider_name FROM public.companies WHERE user_id = p_buyer_user_id;
    SELECT company_name INTO v_target_name FROM public.companies WHERE user_id = v_target_user_id;

    INSERT INTO public.global_news (category, title, body, icon)
    VALUES (
        'borsa',
        '🦅 OPA OSTILE: ' || COALESCE(v_raider_name, 'Un Raider') || ' contro ' || COALESCE(v_target_name, 'una Holding'),
        COALESCE(v_raider_name, 'Un raider') || ' ha rastrellato il ' ||
        ROUND(v_buyer_pct, 1) || '% delle azioni di ' ||
        COALESCE(v_target_name, 'una holding rivale') ||
        '. OPA ostile in corso — il 20% degli utili del target fluirà nelle casse del raider.',
        '🦅'
    );
END;
$$;

-- ── Trigger: esegui il check OPA dopo ogni inserimento/aggiornamento ──
CREATE OR REPLACE FUNCTION public._trg_check_opa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public._check_opa_threshold(NEW.listing_id, NEW.owner_user_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opa_check ON public.share_holdings;
CREATE TRIGGER trg_opa_check
    AFTER INSERT OR UPDATE ON public.share_holdings
    FOR EACH ROW EXECUTE FUNCTION public._trg_check_opa();

-- ── RPC: Dividendo automatico (chiamato da rpc_complete_ride) ─────────────
CREATE OR REPLACE FUNCTION public.rpc_pay_majority_dividend(
    v_target_user_id UUID,
    v_ride_earnings  BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opa       public.hostile_takeovers%ROWTYPE;
    v_dividend  BIGINT;
BEGIN
    SELECT * INTO v_opa
    FROM public.hostile_takeovers
    WHERE target_user_id = v_target_user_id AND status = 'active'
    ORDER BY triggered_at DESC
    LIMIT 1;

    IF NOT FOUND THEN RETURN 0; END IF;

    v_dividend := FLOOR(v_ride_earnings * 0.20);
    IF v_dividend <= 0 THEN RETURN 0; END IF;

    UPDATE public.companies SET cash = cash - v_dividend WHERE user_id = v_target_user_id;
    UPDATE public.companies SET cash = cash + v_dividend WHERE user_id = v_opa.raider_user_id;

    UPDATE public.hostile_takeovers
    SET total_dividends = total_dividends + v_dividend
    WHERE id = v_opa.id;

    RETURN v_dividend;
END;
$$;

-- ── RPC: Buyback — il target riacquista la maggioranza ────────────────────
CREATE OR REPLACE FUNCTION public.rpc_opa_buyback(
    v_opa_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_opa   public.hostile_takeovers%ROWTYPE;
    v_cash  BIGINT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;

    SELECT * INTO v_opa FROM public.hostile_takeovers WHERE id = v_opa_id AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OPA non trovata o già risolta'; END IF;
    IF v_opa.target_user_id != v_uid THEN RAISE EXCEPTION 'Accesso negato: non sei il target di questa OPA'; END IF;

    SELECT cash INTO v_cash FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF COALESCE(v_cash, 0) < v_opa.buyback_price THEN
        RAISE EXCEPTION 'Fondi insufficienti per il buyback. Servono €%, hai €%', v_opa.buyback_price, v_cash;
    END IF;

    UPDATE public.companies SET cash = cash - v_opa.buyback_price WHERE user_id = v_uid;
    UPDATE public.companies SET cash = cash + FLOOR(v_opa.buyback_price * 0.5) WHERE user_id = v_opa.raider_user_id;

    UPDATE public.share_holdings
    SET shares_owned = 0
    WHERE listing_id = v_opa.listing_id AND owner_user_id = v_opa.raider_user_id;

    UPDATE public.share_holdings
    SET shares_owned = (
        SELECT FLOOR(shares_total * 0.51)
        FROM public.company_shares WHERE id = v_opa.listing_id
    )
    WHERE listing_id = v_opa.listing_id AND owner_user_id = v_uid;

    UPDATE public.company_shares
    SET shares_available = shares_available + (
        SELECT FLOOR(shares_total * 0.51) FROM public.company_shares WHERE id = v_opa.listing_id
    )
    WHERE id = v_opa.listing_id;

    UPDATE public.hostile_takeovers
    SET status = 'resolved', resolved_at = NOW()
    WHERE id = v_opa_id;

    INSERT INTO public.global_news (category, title, body, icon)
    SELECT 'borsa',
           '🛡️ BUYBACK: ' || c.company_name || ' ha ripreso il controllo',
           c.company_name || ' ha riacquistato la propria maggioranza azionaria, ponendo fine all''OPA ostile.',
           '🛡️'
    FROM public.companies c WHERE c.user_id = v_uid;

    RETURN jsonb_build_object('success', true, 'paid', v_opa.buyback_price);
END;
$$;

-- ── RPC: Lista OPA attive ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_hostile_takeovers()
RETURNS TABLE (
    opa_id          UUID,
    target_company  TEXT,
    raider_company  TEXT,
    raider_pct      NUMERIC,
    buyback_price   BIGINT,
    total_dividends BIGINT,
    triggered_at    TIMESTAMPTZ,
    is_my_target    BOOLEAN,
    is_my_raid      BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT
        o.id,
        ct.company_name,
        cr.company_name,
        o.raider_pct,
        o.buyback_price,
        o.total_dividends,
        o.triggered_at,
        (o.target_user_id = auth.uid()),
        (o.raider_user_id = auth.uid())
    FROM public.hostile_takeovers o
    JOIN public.companies ct ON ct.user_id = o.target_user_id
    JOIN public.companies cr ON cr.user_id = o.raider_user_id
    WHERE o.status = 'active'
    ORDER BY o.triggered_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_pay_majority_dividend(UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_opa_buyback(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_hostile_takeovers()             TO authenticated;
