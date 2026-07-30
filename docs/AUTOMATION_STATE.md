# Stato routine automatica (memoria tra sveglie)

## PR aperte (nessuna mergiata da questa sessione — controlla sempre lo stato reale su GitHub)
- **PR #1** `auto/tutorial-action-gate` — Tutorial action-gated.
- **PR #2** `auto/idle-offline-catchup` — Demo idle guadagni offline.
- **PR #3** `auto/routine-mission-update` — docs: missione estesa + backlog derivato. **Da
  mergiare per prima** (la prossima sveglia legge questi doc da `main` fresco).
- **PR #4** 🔴 `auto/critical-cash-exploits-scaffold` — **priorità massima**: scaffold fix
  per 3 falle economiche confermate (cassa illimitata via `_add_player_cash`, confermata
  attiva in prod — Vlad già avvisato via notifica push separata).
- **PR #5** `auto/bughunt-economy-daily` — 3 bug reali fixati (bonus fantasma tassato,
  driver saltato dopo burnout, tasse sottostimate).
- **PR #6** `auto/bughunt-dispatch-rides` — 2 bug reali fixati (doppia penalità incidente,
  prestige senza guard).

**6 PR aperte, nessuna ancora mergiata da Vlad.** Da questo punto in poi: continuare il
bug-hunt sistematico va bene (istruzione esplicita di Vlad "procedi da solo"), ma tenere
d'occhio che non si accumulino troppe PR in coda senza che nessuna venga rivista — se alla
prossima sveglia sono ancora tutte e 6+ aperte, considerare di rallentare l'apertura di PR
nuove e concentrarsi solo su watch/CI delle esistenti finché Vlad non ne mergia qualcuna.

## Branch attivo
`auto/bughunt-p2p-alliances` — quarto item concreto della missione estesa: bug-hunt su
`p2p-market.js` + `alliances.js` + `vtk-market.js`.

## Task corrente
**In corso ora:** subagent di scansione lanciato sui 3 file P2P/alleanze/VTK; verifica
manuale di ogni finding (stessa disciplina delle 3 volte precedenti) prima di scrivere
qualunque fix.

## Sveglie consecutive senza progresso
0

## Blocchi aperti
_(nessuno)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — PR #1.
- 2026-07-30 (stessa sveglia): **Demo idle guadagni offline** — PR #2.
- 2026-07-30 (stessa sveglia, live): Vlad ha esteso la missione della routine. PR #3.
- 2026-07-30 (stessa sveglia): audit rate-limit RPC → 3 vulnerabilità reali, la più grave
  (`_add_player_cash`) cassa illimitata confermata attiva in prod. Vlad avvisato via
  notifica push. PR #4.
- 2026-07-30 (stessa sveglia, live): Vlad ha confermato di procedere in autonomia. Bug-hunt
  `engine-daily.js` → 3 bug reali fixati. PR #5.
- 2026-07-30 (stessa sveglia): bug-hunt `engine-rides.js`/`dispatcher.js` → 2 bug reali
  fixati, 3 candidati investigati e scartati con motivazione esplicita. PR #6.
- 2026-07-30 (stessa sveglia): iniziato bug-hunt P2P/alleanze/VTK, branch
  `auto/bughunt-p2p-alliances`, subagent lanciato, verifica manuale in corso.
