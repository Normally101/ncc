# Stato routine automatica (memoria tra sveglie)

## PR aperte (nessuna mergiata da questa sessione — controlla sempre lo stato reale su GitHub)
- **PR #1** `auto/tutorial-action-gate` — Tutorial action-gated. CI verde, 0 commenti di review.
- **PR #2** `auto/idle-offline-catchup` — Demo idle guadagni offline. CI verde.
- **PR #3** `auto/routine-mission-update` — docs: missione estesa da Vlad + backlog derivato.
  **Da mergiare per prima delle altre** (la prossima sveglia legge `AUTOMATION_ROUTINE.md`/
  `AUTOMATION_STATE.md` da `main` fresco — senza questa mergiata non vede la missione estesa).
- **PR #4** 🔴 `auto/critical-cash-exploits-scaffold` — **priorità massima**: scaffold fix per
  3 falle economiche confermate leggendo il codice (la più grave, `_add_player_cash` senza
  controllo `auth.uid()`, è cassa illimitata confermata attiva in prod — Vlad già avvisato
  via notifica push con mitigazione immediata a parte dalla PR). Vedi HANDOFF.md entry
  "30 luglio 2026 — FALLA CRITICA" per il dettaglio completo.
- **PR #5** `auto/bughunt-economy-daily` (da aprire in questa sessione) — 3 bug reali fixati
  in `engine-daily.js`/`ui-dispatch.js` (bonus hotel exclusive mai accreditato ma tassato
  per davvero, driver saltato nel tick fatica dopo un burnout per bug forEach+splice, tasse
  mostrate al giocatore sottostimate). Vedi HANDOFF.md entry "30 luglio 2026 — Bug-hunt
  engine-daily.js" per il dettaglio completo di ognuno.

## Branch attivo
`auto/bughunt-economy-daily` — **completato**, PR #5 da aprire in questa stessa sveglia.

## Task corrente
Vlad ha detto esplicitamente "procedi da solo, non hai bisogno del mio intervento" — la
routine continua sul backlog esteso senza aspettare revisione delle PR aperte. Bug-hunt su
`engine-daily.js` completato: subagent di scansione + **verifica personale di ogni finding
leggendo il codice sorgente riga per riga** (stessa disciplina dell'audit RPC — lì la
verifica manuale aveva trovato un problema più grave di quanto riportato dal subagent; qui
ha invece confermato tutti e 3 i finding così come riportati). 3/3 bug confermati e fixati,
nessun finding scartato come falso positivo questa volta. PR #5 in apertura.

Prossimo passo per la prossima sveglia (o per proseguire ora se il budget lo consente):
`git fetch --all`, controllare stato PR #1-#5. Se tutte ancora aperte → prendere il prossimo
item del backlog esteso in `docs/AUTOMATION_ROUTINE.md` (bug-hunt dispatch/corse
`engine-rides.js`+`dispatcher.js`, o P2P/alleanze, o l'audit scalabilità 10k — vedi lista).

## Sveglie consecutive senza progresso
0

## Blocchi aperti
_(nessuno)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto, PR #1 aperta
  (https://github.com/Normally101/ncc/pull/1).
- 2026-07-30 (stessa sveglia, su richiesta di Vlad di sfruttare di più la finestra):
  **Demo idle "hai guadagnato mentre riposavi"** — fatto, PR #2
  (https://github.com/Normally101/ncc/pull/2).
- 2026-07-30 (stessa sveglia, live): Vlad ha esteso la missione della routine
  ("fixa ogni bug, 10k giocatori in sicurezza, no jailbreak"). PR #3
  (https://github.com/Normally101/ncc/pull/3) con missione estesa + backlog derivato.
- 2026-07-30 (stessa sveglia): audit rate-limit RPC → trovate 3 vulnerabilità reali di
  autorizzazione/validazione (verificate personalmente, non solo report subagent), la più
  grave (`_add_player_cash`) è cassa illimitata confermata attiva in prod. Vlad avvisato
  subito via notifica push. PR #4 (https://github.com/Normally101/ncc/pull/4) con lo
  scaffold completo (nessuna SQL applicata al DB).
- 2026-07-30 (stessa sveglia, live): Vlad ha confermato di procedere in autonomia senza
  aspettare il suo intervento. Iniziato bug-hunt su `engine-daily.js` (secondo item concreto
  della missione estesa), branch `auto/bughunt-economy-daily`, subagent di analisi lanciato,
  verifica manuale dei risultati in corso.
