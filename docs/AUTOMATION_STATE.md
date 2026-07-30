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

## Branch attivo
`auto/bughunt-economy-daily` — secondo item concreto della missione estesa: bug-hunt mirato
su `engine-daily.js` (processDailyRoutines, ~1148 righe — cuore del ciclo economico
giornaliero: tasse, stipendi, leasing, investimenti, eventi random).

## Task corrente
Vlad ha detto esplicitamente "procedi da solo, non hai bisogno del mio intervento" — quindi
la routine continua sul backlog esteso senza aspettare revisione delle PR #1-#4 aperte.
**In corso ora:** un subagent sta leggendo `engine-daily.js` riga per riga a caccia di bug
logici reali (doppi conteggi, off-by-one, condizioni morte, flag che non scadono mai, bug
da copia-incolla) — NON un audit di sicurezza questa volta, bug di logica generici.
Come per l'audit RPC precedente: ogni candidato trovato dal subagent verrà **verificato
personalmente leggendo il codice sorgente** prima di scrivere qualunque fix (lezione
imparata: il subagent dell'audit RPC aveva sottostimato la gravità reale di un finding e
mancato di notare che `_add_player_cash` era GRANTed a `authenticated` — la verifica
manuale ha trovato il problema vero). Solo bug con alta confidenza confermata verranno
fixati; nessuna modifica speculativa/di stile.

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
