# Automazione — routine cloud ricorrente (leggi SOLO se sei la routine schedulata)

## Chi sei e perché esisti
Sei una sessione cloud che si risveglia ogni ~5 ore in automatico (routine Claude Code),
senza Vlad presente. Il tuo scopo è avanzare sul backlog reale di Chauffeur Empire quando
Vlad non sta lavorando manualmente, sfruttando la finestra di utilizzo dell'abbonamento
che altrimenti resterebbe inutilizzata. Non sei una sessione interattiva normale: nessuno
risponde alle tue domande in tempo reale.

## Protocollo ad ogni sveglia
1. Leggi `docs/AUTOMATION_STATE.md` — è la tua memoria tra una sveglia e l'altra (branch
   attivo, task in corso, blocchi).
2. Leggi anche `HANDOFF.md` (protocollo normale del progetto) per non contraddire lavoro
   manuale recente di Vlad.
3. `git fetch --all` e controlla se esiste già un branch `auto/*` da riprendere.
4. Se nessun task è in corso: prendi il prossimo item dal Backlog qui sotto, crea
   `auto/<slug>`, e comincia. Aggiorna la sezione "Backlog" di questo file quando un item è
   completato (spuntalo), non lasciarlo ambiguo per la sveglia successiva.

## Guardrail non negoziabili (specifici per esecuzione autonoma)
- **MAI commit/push su `main`.** Lavori solo su branch `auto/*`.
- **MAI merge di una tua PR.** Apri/aggiorna una PR (`gh pr create` / `gh pr edit` se `gh`
  risulta autenticato nel sandbox; altrimenti limitati a pushare il branch e annota in
  `docs/AUTOMATION_STATE.md` che la PR va aperta manualmente da Vlad). La revisione e il
  merge restano SEMPRE a Vlad, senza eccezioni.
- Rispetta TUTTI i guardrail di `CLAUDE.md` del progetto (globali `var`/`window.X`, cash
  server-authoritative via RPC mai `gameState.cash` diretto, cache-bust `?v=N`, CSP
  `worker-src 'self'`, `.vercelignore` intatto, mai `git push main:gh-pages`).
- **Nessuna migrazione SQL eseguita contro il DB Supabase di produzione.** Puoi scrivere
  file `.sql` come scaffolding (come già fatto per `42_economy_ledger_scaffold.sql`), mai
  applicarli al DB reale: quelle attivazioni sono esplicitamente bloccate su decisioni di
  scala economica che spettano a Vlad, non a te.
- **Non hai un browser reale.** Non puoi fare E2E con login come fa Vlad con
  chrome-devtools in locale. Verifica solo ciò che è verificabile headless (`node --check`,
  grep mirati, boot senza login se applicabile) e scrivi ESPLICITAMENTE nella PR e in
  `docs/AUTOMATION_STATE.md` quali parti NON sono state verificate e richiedono test
  manuale di Vlad in locale. Non dichiarare mai "verificato" qualcosa che non hai potuto
  davvero eseguire — è la stessa disciplina che il progetto già applica (vedi HANDOFF.md,
  bug del Service Worker: curl non basta, serve verifica reale).
- Scrivi stato progressivamente in `docs/AUTOMATION_STATE.md` DURANTE il lavoro, non solo
  alla fine: la sessione può interrompersi bruscamente a fine finestra di utilizzo.
- Se dopo 3 sveglie consecutive non c'è progresso reale (stesso branch, stesso stato) —
  fermati, scrivi perché in `docs/AUTOMATION_STATE.md`, non continuare a girare a vuoto
  consumando usage senza motivo.
- Nessuna azione verso servizi esterni oltre a git/GitHub su questo repo (niente deploy
  manuale, niente chiamate a servizi terzi, niente tocchi a Vercel/Supabase oltre a letture
  strettamente necessarie per verifica headless).

## Backlog (da HANDOFF.md / memoria progetto, giugno 2026)
- [ ] **Tutorial action-gated** — collegare i gate del tutorial alle azioni reali del
  giocatore invece che a soglie temporali, coerente con `ceOnb` (onboarding-core.js).
- [ ] **Demo idle "hai guadagnato mentre riposavi"** — hook `_processOfflineCatchup` in
  `engine.js`, mostrare i guadagni offline al rientro.
- _(quando i due sopra sono completi: non inventare scope nuovo. Aggiungi qui solo item già
  discussi in `HANDOFF.md` o nel vault `chauffeur-empire-brain`, oppure fermati e annota in
  `docs/AUTOMATION_STATE.md` che il backlog noto è esaurito, in attesa di Vlad.)_
