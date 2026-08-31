-- ============================================================================
-- 76 — Il premio di accesso giornaliero passa dal server, con la tabella server
--
-- DOMANDE-PER-VLAD.md §5, risposta 31/08/2026: "tabella server" — cioè:
--   giorno 1-6: €500 × giorno, giorno 7: 10 Driver Coins (zero contanti),
--   la serie riparte da 1 dopo il giorno 7.
-- Non i numeri che il giocatore vede oggi nel client (_checkDailyReward in
-- engine-daily.js): quella tabella sparisce, il client chiama questa RPC.
--
-- `rpc_claim_daily_reward` esisteva già in 07_mmo_core_loop.sql con ESATTAMENTE
-- questa curva di premi (verificato: 500*streak per 1-6, 10 coin a 0€ per il 7,
-- reset dopo il 7) e in 45_lockdown_cash_exploits_scaffold.sql era già stata
-- corretta per un IDOR (p_user_id passato dal client senza verifica contro
-- auth.uid()). Ma scriveva su `profiles`, una tabella scollegata dal resto del
-- gioco — non `companies`, non `cash`, non `driver_coins` — verosimile residuo
-- di un prototipo precedente ("Titan Coins" nel nome della colonna, mai
-- rinominata Driver Coins). Nessun file .js la chiamava: non è "quasi pronta",
-- è orfana. Qui si riscrive da zero sullo schema vero, passando dalla stessa
-- porta unica del denaro che il resto del gioco sta migrando (rpc_earn,
-- 66_registro_economia_osservazione.sql) invece di un UPDATE companies diretto.
-- ============================================================================

-- ── 1. Lo stato dello streak vive sull'azienda, non su un profilo fantasma ──
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS login_streak     INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ;

-- ── 2. La RPC vera ────────────────────────────────────────────────────────
-- Nessun parametro dal client: l'azienda si ricava da auth.uid(), niente
-- IDOR possibile per costruzione (non l'ultimo fix su un buco, il buco non
-- può esistere).
CREATE OR REPLACE FUNCTION public.rpc_claim_daily_reward()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_company       public.companies%ROWTYPE;
    v_now           TIMESTAMPTZ := NOW();
    v_today_utc     TIMESTAMPTZ := date_trunc('day', v_now AT TIME ZONE 'UTC');
    v_yesterday_utc TIMESTAMPTZ := v_today_utc - INTERVAL '1 day';
    v_new_streak    INT;
    v_cash          BIGINT;
    v_dc            INT;
    v_cash_after    BIGINT;
    v_dc_after      INT;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
    END IF;

    SELECT * INTO v_company FROM public.companies WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'no_company');
    END IF;

    -- Già riscattato oggi (giorno di calendario UTC)?
    IF v_company.last_daily_claim IS NOT NULL
       AND v_company.last_daily_claim >= v_today_utc THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_claimed',
            'day', v_company.login_streak);
    END IF;

    -- Streak: +1 se l'ultimo claim è stato ieri, altrimenti riparte da 1.
    IF v_company.last_daily_claim IS NOT NULL
       AND v_company.last_daily_claim >= v_yesterday_utc THEN
        v_new_streak := COALESCE(v_company.login_streak, 0) + 1;
    ELSE
        v_new_streak := 1;
    END IF;

    -- Reset dopo il giorno 7, come da tabella approvata.
    IF v_new_streak > 7 THEN v_new_streak := 1; END IF;

    IF v_new_streak = 7 THEN
        v_cash := 0; v_dc := 10;
    ELSE
        v_cash := 500 * v_new_streak; v_dc := 0;
    END IF;

    UPDATE public.companies
       SET login_streak = v_new_streak, last_daily_claim = v_now, updated_at = NOW()
     WHERE user_id = v_uid;

    -- Denaro e Driver Coins passano dalla porta unica, come tutto il resto:
    -- rpc_earn scrive cash_ledger, rpc_add_driver_coins rispetta il suo tetto
    -- e il suo rate-limit (10 è ben sotto entrambi).
    IF v_cash > 0 THEN
        PERFORM public.rpc_earn(v_cash, 'daily_login_reward', 'daily_reward');
    END IF;
    IF v_dc > 0 THEN
        PERFORM public.rpc_add_driver_coins(v_dc);
    END IF;

    SELECT cash, driver_coins INTO v_cash_after, v_dc_after
      FROM public.companies WHERE user_id = v_uid;

    IF v_new_streak = 7 THEN
        INSERT INTO public.global_news (company_name, message, type)
        VALUES (v_company.company_name,
                v_company.company_name || ' ha completato una settimana di login consecutivi! 💎',
                'milestone');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'day', v_new_streak,
        'cash', v_cash,
        'driverCoins', v_dc,
        'balanceCash', v_cash_after,
        'balanceDriverCoins', v_dc_after
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_claim_daily_reward() TO authenticated;

-- ── 3. La vecchia rpc_claim_daily_reward(uuid, text) — orfana, su `profiles` —
--       non serve più: nessuno la chiamava prima, nessuno la chiama ora.
DROP FUNCTION IF EXISTS public.rpc_claim_daily_reward(UUID, TEXT);

-- ── Verifica ────────────────────────────────────────────────────────────────
SELECT proname, pg_get_function_identity_arguments(oid) AS args
  FROM pg_proc WHERE proname = 'rpc_claim_daily_reward';  -- deve dare una sola riga, senza argomenti
