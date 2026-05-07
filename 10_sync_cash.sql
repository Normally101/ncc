-- =============================================================================
-- 10_sync_cash.sql
-- Chauffeur Empire — RPC per sincronizzare il saldo giornaliero client→server
-- IDEMPOTENT: safe to re-run.
-- =============================================================================
-- Chiamata da processDailyRoutines() in engine.js dopo ogni tick giornaliero.
-- Il client calcola income - expenses localmente e pushes il saldo definitivo.
-- Security: ogni utente può modificare SOLO la propria riga (auth.uid()).
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_sync_cash(v_cash BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Non autenticato';
    END IF;

    UPDATE companies
       SET cash       = v_cash,
           updated_at = NOW()
     WHERE user_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    RETURN jsonb_build_object('success', true, 'cash', v_cash);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_sync_cash(BIGINT) TO authenticated;

-- =============================================================================
-- FINE 10_sync_cash.sql
-- =============================================================================
