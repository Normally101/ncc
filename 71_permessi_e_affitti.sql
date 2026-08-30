-- ============================================================================
-- 71 — Chi può muovere il mondo, e cosa deve muoversi da solo
--
-- Fase 1 di PIANO-CHIUSURA.md, 31/08/2026. Nasce da `npm run salute`, che ha
-- messo in fila sei funzioni capaci di CAMBIARE il mondo condiviso ed eseguibili
-- **senza account**, e da quattro di quelle che non le chiamava nessuno: né il
-- browser né una sveglia.
--
-- Il permesso aperto non è una svista di chi ha scritto quei file: due di loro
-- portano scritto in chiaro il contrario.
--   09_provinces_realestate_fuel.sql:305  «Solo service_role (Edge Function) può
--                                          chiamare questa RPC — non il browser»
-- e sotto un solo `GRANT ... TO service_role`. In Postgres però una funzione
-- nuova nasce già eseguibile da PUBLIC: aggiungere una GRANT non toglie niente
-- a nessuno. Il commento descriveva un permesso che nessuno aveva mai applicato.
-- Verificato sul database vivo prima di scrivere questo file (`proacl`):
-- tutte e sei avevano `=X/postgres`, cioè PUBLIC, cioè anche `anon`.
--
-- Il pezzo che pesa di più è `rpc_cleanup_expired_listings`: CANCELLA gli
-- annunci scaduti del mercato fra giocatori. Dal 30/08 un annuncio scaduto è
-- l'unico modo che ha il venditore di riavere l'auto (esce dalla flotta quando
-- pubblichi). Cancellarlo non libera una riga vecchia: distrugge un'auto. E fino
-- a oggi bastava una richiesta HTTP anonima per farlo a tutti insieme.
-- ============================================================================

-- ── 1. I permessi: si toglie a PUBLIC, si ridà solo a chi serve ──────────────
-- REVOKE ... FROM anon non basterebbe: il permesso non è di `anon`, è di PUBLIC,
-- e `anon` lo eredita. Si toglie alla radice e si riassegna per nome.

-- 1a. Le quattro che nel browser non chiama nessuno: restano al solo cron
--     (che gira come `postgres`) e a `service_role`.
REVOKE EXECUTE ON FUNCTION public.rpc_credit_real_estate_rents()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_update_fuel_price()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_cleanup_expired_listings()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_reset_daily_vtk()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_credit_real_estate_rents()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_update_fuel_price()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_cleanup_expired_listings()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_reset_daily_vtk()           FROM anon, authenticated;

-- 1b. Le due che il browser chiama davvero — ma solo dopo il login, dentro
--     `_mmoBootSequence` (auth.js:341 per gli eventi globali, p2pFetchTension
--     per la tensione). Un visitatore anonimo non ha motivo di far avanzare
--     l'orologio di un mondo in cui non è entrato.
REVOKE EXECUTE ON FUNCTION public.rpc_sync_global_event_status()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_tick_tension()              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_sync_global_event_status()  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_tick_tension()              TO authenticated;

-- ── 2. Gli affitti degli immobili: promessi ogni giorno, mai pagati ──────────
-- La scheda Immobiliare scrive «+€X/g» su ogni palazzo comprato e il manuale
-- parla di «una rendita che non si ferma mai». La funzione che li accredita
-- esiste dal file 09 ed è sempre stata corretta. Semplicemente non la invocava
-- nessuno: nessun cron, nessuna Edge Function, nessun bottone. Chi comprava un
-- immobile pagava e non incassava più niente.
--
-- Perché ogni ora e non una volta al giorno: la funzione paga solo le righe con
-- `last_rent_at < NOW() - 24h` e riscrive `last_rent_at = NOW()`, quindi
-- ventiquattro chiamate al giorno fanno ventitré giri a vuoto e un pagamento —
-- la garanzia sta dentro la funzione, non nell'orario della sveglia (è la stessa
-- ragione scritta in 63_orologio_del_mondo.sql per il reset VTK).
-- Una sveglia puntata su un solo istante, se salta quell'istante, salta un
-- giorno intero di affitti e nessuno se ne accorge.
--
-- Non c'è doppio pagamento col client: il browser gli affitti li mostra soltanto
-- (`ui-realestate.js` legge `daily_rent` per scriverlo nella scheda), non li
-- accredita. Il denaro arriva come cambiamento esterno via Realtime, la strada
-- che `_onCompanyChange` sa già trattare.
SELECT cron.schedule(
    'affitti-immobili',
    '20 * * * *',
    $$SELECT public.rpc_credit_real_estate_rents();$$
);

-- ── 3. Gli eventi globali si aprono e si chiudono da soli ───────────────────
-- Oggi `rpc_sync_global_event_status` la chiama solo il browser, all'ingresso.
-- Vuol dire che un evento comincia quando qualcuno accende il gioco, non quando
-- è il suo momento. È la decisione del 21/08 («deve essere tutto automatico con
-- il passare del tempo nella vita reale») applicata a un pezzo che era rimasto
-- indietro. La funzione riscrive solo stati che il tempo ha già deciso:
-- richiamarla su un mondo fermo non fa niente.
SELECT cron.schedule(
    'stato-eventi-globali',
    '25 * * * *',
    $$SELECT public.rpc_sync_global_event_status();$$
);

-- ── 4. Le due che NON vengono schedulate, e il motivo conta ─────────────────
--
-- `rpc_cleanup_expired_listings` — NON va messa su una sveglia, oggi.
--   Fa `DELETE FROM market_listings WHERE expires_at < now()`. Dal 30/08
--   l'annuncio scaduto è il solo appiglio che resta al venditore per riprendersi
--   l'auto (test/funzioni/annuncio-scaduto-non-mangia-lauto.test.js). Una pulizia
--   automatica cancellerebbe ogni notte le auto invendute dei giocatori.
--   Prima di poterla schedulare deve RESTITUIRE l'auto invece di cancellarla —
--   e quello è un lavoro della fase 3 (sistema «mercato P2P»), non un permesso.
--
-- `rpc_update_fuel_price` — NON va messa su una sveglia perché nessuno legge
--   quello che scrive. La tabella `fuel_market` è ferma a una riga sola del
--   15 agosto e non compare in nessun file del client: il prezzo del gasolio che
--   il giocatore vede è locale, calcolato per ciascuno in engine-daily.js:201.
--   Accendere il cron creerebbe un secondo prezzo, vero per il database e
--   invisibile nel gioco. Se il carburante debba avere un prezzo unico per tutti
--   è una decisione di gioco: sta in DOMANDE-PER-VLAD.md, non qui.

-- ── Verifica ────────────────────────────────────────────────────────────────
SELECT p.proname, array_to_string(p.proacl, ' | ') AS permessi
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('rpc_credit_real_estate_rents','rpc_update_fuel_price',
                     'rpc_cleanup_expired_listings','rpc_reset_daily_vtk',
                     'rpc_sync_global_event_status','rpc_tick_tension')
 ORDER BY p.proname;

SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
