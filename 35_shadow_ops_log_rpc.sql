-- ============================================================
-- 35_shadow_ops_log_rpc.sql — Chauffeur Empire
-- Aggiunge rpc_get_shadow_ops_log mancante, chiamata da black_ops.js.
-- IDEMPOTENTE: sicuro da rieseguire.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_get_shadow_ops_log()
RETURNS TABLE (
    id            UUID,
    op_type       TEXT,
    op_cost       BIGINT,
    success       BOOLEAN,
    detected      BOOLEAN,
    is_attacker   BOOLEAN,
    created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        so.id,
        so.op_type,
        so.op_cost,
        so.success,
        so.detected,
        (so.attacker_id = v_uid) AS is_attacker,
        so.created_at
    FROM public.shadow_ops so
    WHERE so.attacker_id = v_uid
       OR so.target_id   = v_uid
    ORDER BY so.created_at DESC
    LIMIT 15;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_shadow_ops_log() TO authenticated;
