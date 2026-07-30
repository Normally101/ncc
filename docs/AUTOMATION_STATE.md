# Stato routine automatica (memoria tra sveglie)

## Branch attivo
`auto/idle-offline-catchup` — **secondo item del backlog COMPLETATO**, PR da aprire.
(In parallelo esiste anche `auto/tutorial-action-gate` → **PR #1**, primo item, aperta e in
attesa di revisione/merge di Vlad — vedi https://github.com/Normally101/ncc/pull/1.)

## Task corrente
_(nessuno — entrambi gli item mappati del backlog sono ora completati/in PR. Alla prossima
sveglia: `git fetch --all`, controllare lo stato di PR #1 e della PR di
`auto/idle-offline-catchup`. Se entrambe mergiate: il backlog noto in
`docs/AUTOMATION_ROUTINE.md` è esaurito — fermarsi e annotarlo qui, NON inventare scope
nuovo, come da guardrail. Se ancora aperte: nessun nuovo lavoro di codice, solo seguire CI/
review sulle PR esistenti.)_

## Sveglie consecutive senza progresso
0

## ⚠️ Nota per Vlad — possibile conflitto di merge
`HANDOFF.md` e questo stesso file (`docs/AUTOMATION_STATE.md`) sono stati modificati in
**entrambi** i branch (`auto/tutorial-action-gate` e `auto/idle-offline-catchup`), partendo
dallo stesso punto su `main`. Chi mergia per secondo troverà un conflitto banale (entrambi
aggiungono un blocco in cima alla stessa sezione) — risolvibile tenendo **entrambe** le
entry, non serve scegliere. Nessun conflitto invece nel codice: i due branch toccano file
diversi (`tutorial.js`/`index.html` uno, `engine.js`/`index.html` l'altro — su `index.html`
righe diverse, entrambe cache-bust innocue).

## Blocchi aperti
_(nessuno)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto, PR #1 aperta
  (https://github.com/Normally101/ncc/pull/1), CI verde, nessun commento di review.
  Vedi entry HANDOFF.md "30 luglio 2026 — Tutorial action-gated" per il dettaglio.
- 2026-07-30 (stessa sveglia, su richiesta esplicita di Vlad di sfruttare di più la finestra
  invece di aspettare la review di PR #1): **Demo idle "hai guadagnato mentre riposavi"** —
  fatto, branch `auto/idle-offline-catchup`.
  - `engine.js` (`initGame`, ramo `!fresh`, offline-catchup ~riga 855): cattura
    `gameState.cash` prima del loop `_offlineDays`/`processDailyRoutines()`, mostra il delta
    reale al rientro invece del messaggio generico "redditi processati". Solo lettura, zero
    nuove scritture su `gameState.cash` (il sync server resta quello già esistente in
    `processDailyRoutines` via `ServerState.syncCash`).
  - Rimossa `_processOfflineCatchup()` — dead code verificato (zero call-site in tutto il
    repo), superata dal fix "doppio offline-catchup" del 17 giugno ma mai ripulita.
  - Bump `engine.js?v=21`.
  - **Verificato:** `node --check` su tutti i .js (0 errori) · boot headless senza login →
    stesso unico errore pre-esistente e scollegato (`supabase-config.js`, CDN irraggiungibile
    nel sandbox).
  - **NON verificato:** comportamento a schermo con un salvataggio reale offline ≥1 giorno
    (guadagno positivo e caso spese-nette-superiori-agli-incassi).
  - **Branch pushato**: sì. **PR aperta**: sì → https://github.com/Normally101/ncc/pull/2.
    Routine iscritta agli eventi di entrambe le PR (#1 e #2), le segue come da protocollo
    PR-watch fino a merge/chiusura. Prossimo passo per Vlad: revisione + merge di entrambe
    (mai autonomo).
