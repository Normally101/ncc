-- =============================================================================
-- 17_executive_club.sql
-- Chauffeur Empire — Executive Club (Premium Store Upgrade)
-- Depends: 06_mmo_bugfix_driver_coins.sql (driver_coins column, rpc_add_driver_coins)
-- IDEMPOTENT: safe to re-run.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: COIN TRANSACTIONS LOG
-- Ogni addebito/accredito di Driver Coins viene loggato qui.
-- Serve per bilanciamento, analytics e audit anti-cheat.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coin_transactions (
    id               BIGSERIAL    PRIMARY KEY,
    user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name     TEXT,
    amount           INTEGER      NOT NULL,     -- positivo = accredito, negativo = addebito
    transaction_type TEXT         NOT NULL      -- 'purchase' | 'spend' | 'reward' | 'refund'
                     CHECK (transaction_type IN ('purchase','spend','reward','refund')),
    item_id          TEXT,                      -- es. 'caffe_sospeso', 'polizza_kasko', 'pkg_500'
    balance_after    INTEGER      NOT NULL,
    note             TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indici per analytics e per query per utente
CREATE INDEX IF NOT EXISTS idx_ct_user_id    ON coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_item_id    ON coin_transactions (item_id);
CREATE INDEX IF NOT EXISTS idx_ct_type       ON coin_transactions (transaction_type, created_at DESC);

ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

-- Ogni giocatore vede solo le proprie transazioni
DROP POLICY IF EXISTS "ct_own_read" ON coin_transactions;
CREATE POLICY "ct_own_read" ON coin_transactions
    FOR SELECT USING (user_id = auth.uid());

-- Solo RPC SECURITY DEFINER possono scrivere
DROP POLICY IF EXISTS "ct_write_rpc_only" ON coin_transactions;
CREATE POLICY "ct_write_rpc_only" ON coin_transactions
    FOR ALL USING (false) WITH CHECK (false);


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: RPC GENERICA DI SPESA — rpc_ec_spend
-- Addebita i coins, logga la transazione, restituisce il saldo aggiornato.
-- Usata da tutti i nuovi item dell'Executive Club.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rpc_ec_spend(
    p_item_id TEXT,
    p_amount  INTEGER     -- sempre positivo (rappresenta il costo)
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_company companies%ROWTYPE;
    v_new_bal INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Importo non valido: %', p_amount;
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    IF v_company.driver_coins < p_amount THEN
        RAISE EXCEPTION 'Driver Coins insufficienti. Saldo: %, richiesti: %',
            v_company.driver_coins, p_amount;
    END IF;

    -- Addebita
    UPDATE companies
    SET driver_coins = driver_coins - p_amount
    WHERE user_id = v_user_id
    RETURNING driver_coins INTO v_new_bal;

    -- Logga transazione
    INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
    VALUES (v_user_id, v_company.company_name, -p_amount, 'spend', p_item_id, v_new_bal);

    RETURN jsonb_build_object(
        'ok',           true,
        'item_id',      p_item_id,
        'spent',        p_amount,
        'driver_coins', v_new_bal
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_ec_spend(TEXT, INTEGER) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 3: AGGIORNA rpc_add_driver_coins CON LOGGING
-- Aggiunge il log anche agli accrediti (acquisti simulati e premi).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_add_driver_coins(
    p_amount  INTEGER,
    p_item_id TEXT DEFAULT 'sim_purchase'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_company  companies%ROWTYPE;
    v_new_bal  INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato';
    END IF;

    SELECT * INTO v_company FROM companies WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    UPDATE companies
    SET driver_coins = driver_coins + p_amount
    WHERE user_id = v_user_id
    RETURNING driver_coins INTO v_new_bal;

    -- Logga accredito
    INSERT INTO coin_transactions (user_id, company_name, amount, transaction_type, item_id, balance_after)
    VALUES (v_user_id, v_company.company_name, p_amount, 'purchase', p_item_id, v_new_bal);

    RETURN jsonb_build_object(
        'ok',           true,
        'driver_coins', v_new_bal
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_add_driver_coins(INTEGER, TEXT) TO authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 4: VIEW ANALYTICS (SERVICE ROLE)
-- Utile per vedere dove i giocatori spendono di più (bilanciamento futuro).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW coin_spending_summary AS
SELECT
    item_id,
    COUNT(*)            AS purchase_count,
    SUM(ABS(amount))    AS total_coins_spent,
    AVG(ABS(amount))    AS avg_per_purchase,
    MIN(created_at)     AS first_purchase,
    MAX(created_at)     AS last_purchase
FROM coin_transactions
WHERE transaction_type = 'spend'
GROUP BY item_id
ORDER BY total_coins_spent DESC;


-- =============================================================================
-- FINE 17_executive_club.sql
-- Tabelle create: coin_transactions
-- RPCs create/aggiornate: rpc_ec_spend, rpc_add_driver_coins (con logging)
-- View: coin_spending_summary
-- =============================================================================
