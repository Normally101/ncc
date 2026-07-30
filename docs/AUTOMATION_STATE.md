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
- **PR #7** `auto/bughunt-p2p-alliances` (da aprire in questa sessione) — 3 bug reali
  fixati: exploit VTK Shop ripetibile all'infinito (richiede applicare
  `46_vtk_shop_purchase_scaffold.sql` PRIMA del deploy del client, altrimenti il negozio si
  rompe), doppia deduzione cassa su fondazione/donazione consorzio, fuga di sottoscrizione
  chat realtime. Vedi HANDOFF.md "30 luglio 2026 — Bug-hunt P2P/alleanze/VTK".

**7 PR aperte, nessuna ancora mergiata da Vlad.** ⏸️ **STOP a nuove PR da qui**: come
annotato alla sveglia precedente, 6+ PR in coda senza nessuna revisione è già troppo per
una persona sola. Non aprire altri branch/PR di bug-hunt finché almeno un paio di queste
non sono state riviste/mergiate da Vlad — anche se la missione estesa lo permetterebbe,
continuare a produrre PR che si accumulano senza essere guardate non aiuta Vlad, gli crea
solo più lavoro di coda. Da qui in poi: solo watch/CI/review-response sulle PR esistenti
(già tutte sottoscritte via subscribe_pr_activity), fino a quando lo stato cambia.

## Branch attivo
`auto/bughunt-p2p-alliances` — **completato**, PR #7 da aprire in questa stessa sveglia.
Nessun nuovo branch dopo questo (vedi nota "STOP a nuove PR" sopra).

## Task corrente
Bug-hunt P2P/alleanze/VTK completato e verificato. **Da qui: modalità solo-watch** sulle 7
PR aperte, nessun nuovo lavoro di codice finché Vlad non ne rivede/mergia alcune. Se una
sveglia futura trova che Vlad ha mergiato qualcosa, si può riprendere il backlog esteso in
`docs/AUTOMATION_ROUTINE.md` (bug-hunt B2B/tourism/crypto, o l'audit scalabilità 10k).

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
- 2026-07-30 (stessa sveglia): bug-hunt P2P/alleanze/VTK → 3 bug reali fixati (exploit VTK
  Shop infinito, doppia deduzione cassa consorzi, fuga sottoscrizione chat). PR #7. Deciso
  di fermarsi dopo 7 PR aperte senza nessuna revisione — passo a modalità solo-watch.
