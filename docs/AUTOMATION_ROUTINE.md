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

## Missione estesa (30 luglio 2026 — istruzione diretta di Vlad, sostituisce la regola
## "non inventare scope nuovo" del vecchio backlog qui sotto)
L'obiettivo di fondo, oltre ai singoli item puntuali, è portare Chauffeur Empire a un livello
**production-ready per ~10.000 giocatori simultanei**: bug reali sistemati, nessuna via di
**jailbreak/cheat economico**, nessun problema di **sicurezza** aperto e noto.

Questo NON è un compito da "finire" in una sveglia — è la lente con cui la routine sceglie
cosa fare quando il backlog puntuale sotto è vuoto. Regole per tradurlo in lavoro reale:
- **Un item concreto e verificabile alla volta**, mai un mega-cambiamento monolitico:
  scegli un sistema/file, trova un bug o una lacuna REALE (non un'ipotesi), fixala, PR.
- **"Bug" = comportamento verificabilmente sbagliato** (logica rotta, off-by-one, crash,
  falla di sicurezza/anti-cheat riproducibile nel codice) — non refactor, non stile, non
  "potrebbe essere più pulito". Coerente con CLAUDE.md: niente cambi speculativi.
- **Scalabilità a 10k** = audit STATICO (grep/lettura codice), mai load-test reale contro
  Supabase/Vercel di produzione (vietato dai guardrail sotto). Se un problema di scala serve
  un cambio infrastrutturale (piano Supabase, limiti connessioni, ecc.) → documentalo e
  fermati, è una decisione di Vlad.
- **Sicurezza/anti-cheat** = estendere pattern già validati nel progetto (rate-limit RPC
  stile `43_ratelimit_driver_coins.sql`, RLS, length-cap, cash server-authoritative via RPC a
  delta) ad altri punti dove mancano — MAI applicare SQL a prod, MAI decidere da sola la scala
  economica (debito #1, bloccato su Vlad — vedi `docs/ECONOMY_SERVER_AUTH.md` e HANDOFF.md).
- Quando un item richiede qualcosa che la routine non può fare da sola (chiavi/segreti,
  decisioni di prodotto, piani a pagamento, accesso a prod) → non bloccarti: documentalo in
  `docs/AUTOMATION_STATE.md` come "bloccato su Vlad" con il motivo esatto, e passa all'item
  concreto successivo.

### Backlog derivato dalla missione estesa (popola qui via via che emergono item concreti)
- [ ] **Audit rate-limit RPC** — mappare quali RPC Supabase mutano cassa/valuta/stato
  condiviso e NON hanno rate-limit server-side (oggi solo `rpc_add_driver_coins` e
  `rpc_award_mission_vtk` ce l'hanno, via `_ce_rate_limit`/`rate_limit_buckets` di
  `38_security_hardening.sql`). Output: elenco + scaffold SQL (non applicato) per le RPC
  scoperte, stile `43_ratelimit_driver_coins.sql`.
- [ ] **Bug-hunt sistema economia** (`engine-daily.js`, ~1.9k righe, cuore di
  `processDailyRoutines`) — lettura mirata a caccia di bug reali (doppi conteggi, ordine
  sbagliato tasse/spese, condizioni che non si azzerano mai, ecc.), non riscrittura.
- [ ] **Bug-hunt dispatch/corse** (`engine-rides.js`, `dispatcher.js`) — stesso approccio,
  focus su race condition tipo quella già trovata e già protetta in `assignRideToDriver`
  (verificare che pattern simili non siano rimasti scoperti altrove).
- [ ] **Bug-hunt P2P/alleanze/mercato** (`p2p-market.js`, `alliances.js`, `vtk-market.js`) —
  qui vive già la maggior parte dell'anti-cheat esistente (rate-limit chat, donazioni
  asset-bound, cap driver-coins): cercare varianti non ancora coperte dello stesso exploit
  pattern (loop sotto-soglia, doppia spesa, mancata `FOR UPDATE`).
- [ ] **Audit "chi scrive gameState.cash senza passare da una RPC a delta"** — mappa
  aggiornata di tutti i siti che ancora fanno `gameState.cash =`/`+=`/`-=` senza sync RPC
  (in continuità col debito #1 già noto). Non risolve il debito (bloccato sulla scala
  economica, decisione di Vlad) ma tiene la mappa aggiornata così la migrazione, quando
  Vlad la sblocca, parte da dati freschi.
- [ ] **Audit scalabilità client-side a 10k** — censire `setInterval`/polling per sessione in
  `engine.js` e affini (generatePOIRide ogni 5min, generateContractRide ogni 8min, ecc.):
  capire cosa genera traffico verso Supabase per giocatore attivo e se qualcosa scalerebbe
  male a 10k sessioni concorrenti (es. Realtime channel per giocatore, frequenza RPC). Solo
  lettura/calcolo, nessun load-test reale.
- _(esaurita questa lista: torna alla lente della missione estesa sopra e trovane di nuove,
  sempre concrete e verificabili headless. Se davvero non emerge più nulla di azionabile senza
  Vlad, fermati e annotalo in `docs/AUTOMATION_STATE.md`.)_

## Backlog storico (completato — riferimento)
- [x] **Tutorial action-gated** — collegare i gate del tutorial alle azioni reali del
  giocatore invece che a soglie temporali, coerente con `ceOnb` (onboarding-core.js).
  → PR #1 (`auto/tutorial-action-gate`), aperta 30 luglio 2026.
- [x] **Demo idle "hai guadagnato mentre riposavi"** — hook offline-catchup in `engine.js`,
  mostrare i guadagni offline al rientro.
  → PR #2 (`auto/idle-offline-catchup`), aperta 30 luglio 2026.
