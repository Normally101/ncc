-- ============================================================================
-- 74 — Un solo prezzo del gasolio, non uno a testa
--
-- DOMANDE-PER-VLAD.md §6, risposta 31/08/2026: "passa a prezzo unico".
--
-- `rpc_update_fuel_price()` esiste dal file 09, scrive bene in `fuel_market`
-- (random walk ±5%, clamp 1.20–3.00, storico 48 righe) e non è mai stata
-- schedulata (71_permessi_e_affitti.sql §4 lo aveva rimandato "a decisione di
-- gioco"). Il client legge già `fuel_market` da prima del 29/08
-- (serverState.js: fetch a `_loadSnapshot`/init + subscribe Realtime su
-- INSERT) — quel pezzo NON è nuovo. La sola cosa che mancava era la sveglia
-- che scrive la riga, e il fatto che `_tickFuelPrice()` in engine-daily.js
-- sovrascriveva subito il valore del server con un sorteggio locale ad ogni
-- ora di gioco: due prezzi in competizione, vinceva sempre l'ultimo che
-- scriveva. La correzione lato client è in engine-daily.js, non qui.
-- ============================================================================

SELECT cron.schedule(
    'prezzo-carburante',
    '30 * * * *',
    $$SELECT public.rpc_update_fuel_price();$$
);

-- ── Verifica ────────────────────────────────────────────────────────────────
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'prezzo-carburante';
