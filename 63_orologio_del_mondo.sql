-- ============================================================================
-- 63 — L'orologio del mondo: le cose che devono succedere da sole
--
-- Decisione di Vlad, 21/08/2026:
--   «non deve esserci nessuna persona reale. dovrebbe essere tutto automatico
--    con il passare del tempo nella vita reale. 24 ore in real life sono 24 ore
--    nel gioco.»
--
-- Fotografia di partenza (interrogando il database, non leggendo il codice):
-- in `cron.job` c'erano TRE lavori, e l'unico di gioco era `aste-giudiziarie`,
-- messo il 20/08. Nel database esistevano invece DIECI funzioni di tipo tick.
-- Tre non le chiamava nessuno — né il client né una sveglia:
--
--   _process_tourism_tenders  i bandi turistici non si chiudevano MAI
--   rpc_reset_daily_vtk       il contatore giornaliero non si azzerava MAI
--   rpc_daily_dividends       le holding non pagavano MAI dividendi
--
-- È lo stesso difetto delle aste: codice scritto, funzionante, e nessuno che lo
-- invoca. Non si vede leggendo il codice — si vede solo chiedendo al database
-- chi c'è nella lista delle sveglie.
--
-- Tutte e tre appartengono a funzioni SPENTE (turismo, vtk, holding): il metodo
-- degli interruttori ha fatto il suo lavoro. Il cron va messo PRIMA di accendere.
-- ============================================================================

-- ── 1. Bandi turistici: si chiudono da soli ─────────────────────────────────
-- Ogni quarto d'ora, come le aste. La funzione filtra da sola su
-- `status = 'open_bidding' AND bidding_ends_at <= NOW()` e riscrive lo stato
-- dopo aver assegnato: richiamarla su un bando già chiuso non fa niente.
SELECT cron.schedule(
    'bandi-turistici',
    '*/15 * * * *',
    $$SELECT public._process_tourism_tenders();$$
);

-- ── 2. Azzeramento giornaliero del VTK: ogni ora, non a mezzanotte ──────────
-- La funzione agisce solo dove `vtk_today_reset < CURRENT_DATE`, quindi girare
-- ventiquattro volte al giorno costa ventitré no-op e un lavoro vero.
--
-- Perché ogni ora invece che una volta a mezzanotte: una sveglia puntata su un
-- orario preciso è fragile due volte. Se quella singola esecuzione salta — un
-- riavvio, un blocco — il reset non avviene per un giorno intero e nessuno se
-- ne accorge. E l'ora "giusta" dipende dal fuso: il database vive in UTC,
-- l'Italia no, e a ottobre l'ora legale sposterebbe il confine da sola.
-- Frequente e idempotente batte preciso e delicato.
SELECT cron.schedule(
    'azzera-vtk-giornaliero',
    '5 * * * *',
    $$SELECT public.rpc_reset_daily_vtk();$$
);

-- ── 3. Tensione del sindacato: ogni ora ─────────────────────────────────────
-- Questa si ricalcola dal tempo trascorso, quindi chiamarla più o meno spesso
-- non cambia il risultato. La sveglia serve perché il mondo si muova anche
-- quando nessuno sta guardando: finora la tensione avanzava solo nell'istante
-- in cui un giocatore apriva la scheda del mercato.
SELECT cron.schedule(
    'tensione-sindacato',
    '10 * * * *',
    $$SELECT public.rpc_tick_tension();$$
);

-- ── 4. Dividendi delle holding: NON schedulati, e il motivo conta ───────────
-- `rpc_daily_dividends` paga i dividendi a ogni chiamata, senza controllare se
-- oggi li ha già pagati. Metterla su una sveglia significherebbe che una
-- ripetizione qualsiasi — un riavvio del programmatore, un tentativo doppio,
-- una mano che la lancia per prova — paga due volte. Su una funzione che muove
-- denaro non è un rischio accettabile.
--
-- Prima serve un guardiano «una volta al giorno» dentro la funzione stessa, non
-- nella sveglia: la sveglia è il posto sbagliato dove mettere una garanzia,
-- perché chiunque può chiamare la funzione fuori dalla sveglia.
-- Finché non c'è, le holding restano senza dividendi — ed è coerente, perché la
-- funzione holding è spenta.

-- ── Verifica ────────────────────────────────────────────────────────────────
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
