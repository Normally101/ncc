-- ============================================================================
-- 72 — Gli aiutanti interni non sono un'API pubblica
--
-- Fase 1 di PIANO-CHIUSURA.md, 31/08/2026, secondo giro. Il primo (file 71) ha
-- chiuso le sei funzioni che `npm run salute` aveva messo in fila. `npm run audit`
-- — che invece legge TUTTE le funzioni del database vivo — ne ha trovate altre
-- otto, e per una ragione che il primo controllo non poteva vedere.
--
-- Il controllo di `salute` cerca scritture DENTRO il corpo della funzione. Ma
-- `rpc_expire_tourism_contracts` è tutta qui:
--
--     SELECT public._process_tourism_tenders();
--
-- Nel suo corpo non c'è una riga di scrittura, quindi risultava innocua. Chiude
-- i bandi turistici di tutti, assegna i contratti e sposta denaro — e la poteva
-- chiamare chiunque, senza account, quando gli pareva. Da qui la regola nuova
-- dentro `audit-server.mjs`: **chi chiama una funzione che scrive, scrive**, e
-- la propagazione si ripete finché l'insieme smette di crescere.
--
-- Le altre sette sono aiutanti interni: il trattino basso davanti al nome dice
-- che sono pezzi di altre funzioni, non bottoni. PostgREST però pubblica anche
-- quelli, e nessun file .sql li aveva mai chiusi. Nessuna è chiamata dal browser
-- (controllato su tutti i .js del gioco e sulle Edge Function).
--
-- ⚠️ `_my_company_id()` NON è in questo elenco, e non deve entrarci mai.
-- Dieci policy RLS la chiamano — `vehicles_select_own`, `drivers_select_own`,
-- `active_trips_select_own` e le altre. Una policy viene valutata con i permessi
-- di CHI INTERROGA, non con quelli di chi l'ha scritta: togliere l'esecuzione a
-- `authenticated` renderebbe illeggibili flotta, autisti e corse a tutti quanti.
-- Era nell'elenco dei candidati per un pelo, ed è la ragione per cui prima di
-- revocare si guarda chi usa la funzione, non solo chi la chiama.
-- ============================================================================

-- ── 1. L'involucro che nascondeva una funzione di manutenzione ──────────────
-- Non la chiama nessuno: il cron `bandi-turistici` invoca direttamente
-- `_process_tourism_tenders()`. Resta al server e basta.
REVOKE EXECUTE ON FUNCTION public.rpc_expire_tourism_contracts() FROM PUBLIC, anon, authenticated;

-- ── 2. Gli aiutanti interni ─────────────────────────────────────────────────
-- Restano chiamabili da dentro le RPC che li usano: quelle sono `security
-- definer`, girano coi permessi del proprietario e non con quelli del giocatore.
REVOKE EXECUTE ON FUNCTION public._process_tourism_tenders()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._check_opa_threshold(uuid, uuid)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._flag_cheat(uuid, text, jsonb)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._refresh_region_governor(text)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._econ_cap(text)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._apply_province_transit_tax(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._apply_territory_taxes(uuid, text, bigint)      FROM PUBLIC, anon, authenticated;

-- ── Verifica ────────────────────────────────────────────────────────────────
-- Deve restare una riga sola: `_my_company_id`.
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticato
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prokind = 'f'
   AND p.prorettype <> 'trigger'::regtype
   AND p.proname LIKE '\_%'
   AND (has_function_privilege('anon', p.oid, 'EXECUTE')
     OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
 ORDER BY 1;
