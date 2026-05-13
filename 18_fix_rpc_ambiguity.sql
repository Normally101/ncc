-- ════════════════════════════════════════════════════════════════════════════
-- 18_fix_rpc_ambiguity.sql — Chauffeur Empire
-- Rimuove l'overload a 1 parametro di rpc_add_driver_coins rimasto da
-- 06_mmo_bugfix_driver_coins.sql dopo che 17_executive_club.sql ne ha creato
-- una versione a 2 parametri con lo stesso nome.
-- PostgreSQL non riesce a scegliere tra i due quando la chiamata usa solo
-- p_amount — eliminare la versione vecchia risolve l'ambiguità.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop old 1-param overload (replaced by the 2-param version in 17_executive_club.sql)
DROP FUNCTION IF EXISTS public.rpc_add_driver_coins(integer);

-- Confirm the 2-param version (with DEFAULT) is the only one remaining
-- SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'rpc_add_driver_coins';
