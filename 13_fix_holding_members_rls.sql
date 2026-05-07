-- =============================================================================
-- 13_fix_holding_members_rls.sql
-- Fix: policy RLS ricorsiva su holding_members → 500 Internal Server Error
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

-- La policy originale causava infinite recursion:
--   SELECT holding_id FROM public.holding_members WHERE user_id = auth.uid()
-- eseguita DENTRO la policy di holding_members stessa → loop → 500

DROP POLICY IF EXISTS "hm_select_own_holding" ON public.holding_members;

-- Tutti possono leggere i membri (i holding sono dati pubblici nel gioco)
CREATE POLICY "hm_select_all" ON public.holding_members
    FOR SELECT USING (true);

-- =============================================================================
-- FINE 13_fix_holding_members_rls.sql
-- =============================================================================
