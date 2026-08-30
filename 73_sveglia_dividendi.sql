-- ============================================================================
-- 73 — La sveglia dei dividendi, finalmente
--
-- 63_orologio_del_mondo.sql (21/08) aveva lasciato i dividendi fuori dalle
-- sveglie, e con una ragione precisa: «rpc_daily_dividends paga i dividendi a
-- ogni chiamata, senza controllare se oggi li ha già pagati. Metterla su una
-- sveglia significherebbe che una ripetizione qualsiasi paga due volte.»
--
-- 64_dividendi_giornalieri_idempotenti.sql è nato per togliere quell'ostacolo:
-- aggiunge il segnalibro `last_dividend_at` e restituisce «già pagato» invece di
-- pagare di nuovo. Il suo commento finale lascia la sveglia scritta e commentata,
-- pronta per «quando la guardia c'è».
--
-- Il 31/08, interrogando il database vivo, si è visto che la guardia NON c'era:
-- il file 64 non era mai stato applicato. Sul server viveva ancora la versione
-- vecchia, quella che ritorna un numero, mentre engine-holding.js leggeva
-- `data.status === 'already_paid'` da quel numero. Il difetto non si era mai
-- visto perché la funzione era anche revocata ad `authenticated`: la chiamata
-- moriva sul permesso, prima di poter mostrare che le due parti non si capivano.
--
-- Ora il file 64 è applicato (la funzione ritorna jsonb, la guardia c'è,
-- `authenticated` la può chiamare) e la sveglia può essere accesa davvero.
-- Ogni ora: ventitré giri che rispondono «già pagato» e uno che paga.
-- ============================================================================

SELECT cron.schedule(
    'dividendi-giornalieri-holding',
    '15 * * * *',
    $$SELECT public.rpc_daily_dividends();$$
);

SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
