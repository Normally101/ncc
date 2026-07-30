# Stato routine automatica (memoria tra sveglie)

## PR aperte (nessuna mergiata da questa sessione — controlla sempre lo stato reale su GitHub)
- **PR #1** `auto/tutorial-action-gate` — Tutorial action-gated. CI verde.
- **PR #2** `auto/idle-offline-catchup` — Demo idle guadagni offline. CI verde.
- **PR #3** `auto/routine-mission-update` — docs: missione estesa + backlog derivato. **Da
  mergiare per prima** (la prossima sveglia legge questi doc da `main` fresco).
- **PR #4** 🔴 `auto/critical-cash-exploits-scaffold` — **priorità massima**: scaffold fix
  per 3 falle economiche confermate (la più grave, cassa illimitata via `_add_player_cash`,
  confermata attiva in prod — Vlad già avvisato via notifica push separata). Vedi HANDOFF.md
  "30 luglio 2026 — FALLA CRITICA".
- **PR #5** `auto/bughunt-economy-daily` — 3 bug reali fixati in `engine-daily.js`/
  `ui-dispatch.js` (bonus fantasma mai accreditato ma tassato, driver saltato nel tick dopo
  un burnout, tasse sottostimate a schermo). Vedi HANDOFF.md "30 luglio 2026 — Bug-hunt
  engine-daily.js".
- **PR #6** `auto/bughunt-dispatch-rides` (da aprire in questa sessione) — 2 bug reali
  fixati in `engine-rides.js` (doppia penalità sullo stesso incidente su condizione auto +
  guadagno; `gameState.prestige` senza guard `||0`, unico call-site nel codebase). 3 altri
  candidati investigati e correttamente scartati (non-bug o non raggiungibili oggi — vedi
  HANDOFF.md "30 luglio 2026 — Bug-hunt dispatch/corse" per il dettaglio di tutti e 5).

## Branch attivo
`auto/bughunt-dispatch-rides` — **completato**, PR #6 da aprire in questa stessa sveglia.

## Task corrente
Vlad ha detto esplicitamente "procedi da solo" — la routine continua senza aspettare
revisione delle PR aperte. Bug-hunt `engine-rides.js`/`dispatcher.js` completato: 2/5
candidati del subagent erano bug reali e sono stati fixati, gli altri 3 sono stati
verificati personalmente e scartati con motivazione esplicita (non raggiungibili oggi o non
materiali) — disciplina di non fixare scenari ipotetici, coerente con CLAUDE.md. PR #6 in
apertura.

Prossimo passo per la prossima sveglia (o ora se il budget lo consente): `git fetch --all`,
controllare stato PR #1-#6. Se tutte ancora aperte → prossimo item del backlog esteso in
`docs/AUTOMATION_ROUTINE.md` (bug-hunt P2P/alleanze `p2p-market.js`/`alliances.js`, o
l'audit scalabilità 10k lato client).

## Sveglie consecutive senza progresso
0

## Blocchi aperti
_(nessuno)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — PR #1
  (https://github.com/Normally101/ncc/pull/1).
- 2026-07-30 (stessa sveglia): **Demo idle guadagni offline** — PR #2
  (https://github.com/Normally101/ncc/pull/2).
- 2026-07-30 (stessa sveglia, live): Vlad ha esteso la missione della routine. PR #3
  (https://github.com/Normally101/ncc/pull/3) con missione estesa + backlog derivato.
- 2026-07-30 (stessa sveglia): audit rate-limit RPC → 3 vulnerabilità reali trovate e
  verificate personalmente, la più grave (`_add_player_cash`) cassa illimitata confermata
  attiva in prod. Vlad avvisato subito via notifica push. PR #4
  (https://github.com/Normally101/ncc/pull/4).
- 2026-07-30 (stessa sveglia, live): Vlad ha confermato di procedere in autonomia. Bug-hunt
  `engine-daily.js` → 3 bug reali confermati e fixati (bonus fantasma tassato, driver
  saltato dopo burnout, tasse sottostimate). PR #5
  (https://github.com/Normally101/ncc/pull/5).
- 2026-07-30 (stessa sveglia): iniziato bug-hunt `engine-rides.js`+`dispatcher.js`, branch
  `auto/bughunt-dispatch-rides`, subagent lanciato, verifica manuale in corso.
