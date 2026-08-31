-- ============================================================================
-- 75 — La Nemesi che finanzia i rivali non esiste più, non solo spenta
--
-- DOMANDE-PER-VLAD.md §7, risposta 31/08/2026: "cancellala proprio, non ha
-- senso". `rpc_nemesis_fund_rival` era già revocata da PUBLIC/anon/authenticated
-- dal 53_revoke_nemesis_fund_rival_no_server_tracking.sql (creava fino a
-- €250.000/ora dal nulla, senza alcuna verifica di chi fosse davvero il
-- rivale). Qui si chiude per sempre: si elimina la funzione dal server, e
-- lato client (nemesis.js) si toglie sia la chiamata sia la promessa
-- narrativa che non manteneva più ("finanzierà i tuoi rivali").
--
-- Resta tutto il resto del sistema Nemesi: escalation della rabbia,
-- corruzione (`rpc_nemesis_bribe_vip`, che addebita solo il chiamante),
-- l'Agenzia Ombra. Solo il finanziamento cross-account sparisce.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_nemesis_fund_rival(uuid, bigint, text);

-- ── Verifica ────────────────────────────────────────────────────────────────
SELECT proname FROM pg_proc WHERE proname = 'rpc_nemesis_fund_rival';  -- deve tornare 0 righe
