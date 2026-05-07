-- =============================================================================
-- 12_hr_automation.sql
-- Chauffeur Empire — HR Automation buff (anti-sciopero premium)
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

-- Aggiunge la colonna di scadenza HR alla tabella companies
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS hr_automation_expires_at TIMESTAMPTZ;

-- ─── RPC: Acquista HR Automation (scala DC, imposta scadenza) ─────────────────
CREATE OR REPLACE FUNCTION rpc_buy_hr_automation(
    v_cost_in_coins INT,
    v_days          INT DEFAULT 7
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_company companies%ROWTYPE;
    v_expires TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    IF v_company.driver_coins < v_cost_in_coins THEN
        RAISE EXCEPTION 'Driver Coins insufficienti: hai % DC, servono % DC',
            v_company.driver_coins, v_cost_in_coins;
    END IF;

    -- Se il buff è già attivo, estendi dalla scadenza attuale; altrimenti da ora
    v_expires := GREATEST(NOW(), COALESCE(v_company.hr_automation_expires_at, NOW()))
                 + (v_days || ' days')::INTERVAL;

    UPDATE companies
       SET driver_coins              = driver_coins - v_cost_in_coins,
           hr_automation_expires_at  = v_expires
     WHERE user_id = auth.uid();

    RETURN jsonb_build_object(
        'success',    true,
        'expires_at', v_expires,
        'days',       v_days,
        'cost_dc',    v_cost_in_coins
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_buy_hr_automation(INT, INT) TO authenticated;

-- =============================================================================
-- FINE 12_hr_automation.sql
-- =============================================================================
