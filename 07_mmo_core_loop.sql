-- =============================================================
-- 07_mmo_core_loop.sql  —  Olga Vision Agency · MMO Core Loop
-- Esegui nel SQL Editor di Supabase (Dashboard → SQL Editor)
-- =============================================================

-- ── 1. PROFILI UTENTE (daily streak + last claim) ────────────
CREATE TABLE IF NOT EXISTS profiles (
    user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    login_streak    INT           NOT NULL DEFAULT 0,
    last_daily_claim TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own" ON profiles;
CREATE POLICY "profiles_own" ON profiles
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK  (auth.uid() = user_id);

-- ── 2. GLOBAL NEWS (feed live tra i giocatori) ───────────────
CREATE TABLE IF NOT EXISTS global_news (
    id           BIGSERIAL    PRIMARY KEY,
    company_name TEXT         NOT NULL,
    message      TEXT         NOT NULL,
    type         TEXT         NOT NULL DEFAULT 'info',  -- 'milestone' | 'contract' | 'ranking' | 'info'
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE global_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_read_all"    ON global_news;
DROP POLICY IF EXISTS "news_insert_auth" ON global_news;
CREATE POLICY "news_read_all"    ON global_news FOR SELECT USING (true);
CREATE POLICY "news_insert_auth" ON global_news FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Abilita Supabase Realtime su questa tabella
ALTER PUBLICATION supabase_realtime ADD TABLE global_news;

-- Pulizia automatica: mantieni solo le ultime 200 notizie
CREATE OR REPLACE FUNCTION _trim_global_news() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM global_news
    WHERE id NOT IN (
        SELECT id FROM global_news ORDER BY created_at DESC LIMIT 200
    );
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_trim_news ON global_news;
CREATE TRIGGER trg_trim_news
    AFTER INSERT ON global_news
    FOR EACH ROW EXECUTE FUNCTION _trim_global_news();

-- ── 3. RPC: CLAIM DAILY REWARD ───────────────────────────────
-- Chiamata dal client al caricamento del gioco.
-- Restituisce { success, streak, reward: { cash, titanCoins, day } }
-- oppure       { success: false, reason: 'already_claimed' }
CREATE OR REPLACE FUNCTION rpc_claim_daily_reward(
    p_user_id       UUID,
    p_company_name  TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_profile        profiles%ROWTYPE;
    v_now            TIMESTAMPTZ := NOW();
    v_today_utc      TIMESTAMPTZ := date_trunc('day', v_now AT TIME ZONE 'UTC');
    v_yesterday_utc  TIMESTAMPTZ := v_today_utc - INTERVAL '1 day';
    v_new_streak     INT;
    v_reward         JSONB;
BEGIN
    -- Crea profilo se non esiste
    INSERT INTO profiles (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id;

    -- Già riscattato oggi?
    IF v_profile.last_daily_claim IS NOT NULL
       AND v_profile.last_daily_claim >= v_today_utc THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_claimed');
    END IF;

    -- Calcola streak: +1 se ieri era l'ultimo claim, altrimenti riparte da 1
    IF v_profile.last_daily_claim IS NOT NULL
       AND v_profile.last_daily_claim >= v_yesterday_utc THEN
        v_new_streak := COALESCE(v_profile.login_streak, 0) + 1;
    ELSE
        v_new_streak := 1;
    END IF;

    -- Reset settimanale: dopo il giorno 7 si riparte
    IF v_new_streak > 7 THEN v_new_streak := 1; END IF;

    -- Premio: giorni 1-6 → cash crescente, giorno 7 → Titan Coins
    IF v_new_streak = 7 THEN
        v_reward := jsonb_build_object('cash', 0, 'titanCoins', 10, 'day', v_new_streak);
    ELSE
        v_reward := jsonb_build_object(
            'cash',       500 * v_new_streak,
            'titanCoins', 0,
            'day',        v_new_streak
        );
    END IF;

    -- Aggiorna profilo
    UPDATE profiles
    SET login_streak     = v_new_streak,
        last_daily_claim = v_now
    WHERE user_id = p_user_id;

    -- Milestone: giorno 7 → news pubblica
    IF v_new_streak = 7 THEN
        INSERT INTO global_news (company_name, message, type)
        VALUES (p_company_name,
                p_company_name || ' ha completato una settimana di login consecutivi! 💎',
                'milestone');
    END IF;

    RETURN jsonb_build_object('success', true, 'streak', v_new_streak, 'reward', v_reward);
END;
$$;

-- ── 4. RPC: BROADCAST NEWS ───────────────────────────────────
-- Chiamata silenziosa da eventi importanti nel gioco.
CREATE OR REPLACE FUNCTION rpc_broadcast_news(
    p_company_name  TEXT,
    p_message       TEXT,
    p_type          TEXT DEFAULT 'info'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO global_news (company_name, message, type)
    VALUES (p_company_name, p_message, p_type);
END;
$$;
