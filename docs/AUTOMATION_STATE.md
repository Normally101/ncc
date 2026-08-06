# Stato routine automatica (memoria tra sveglie)

## ⚡ STATO CORRENTE (2026-08-06, sveglia cron) — leggi questo PER PRIMO, tutto sotto è log storico
Tutto quello che segue in questo file fino a "## Log sveglie" era **stale**: descriveva 8 PR
aperte in attesa di review. Nel frattempo (sessione live con Vlad, stesso giorno, vedi
`HANDOFF.md` "6 agosto 2026") è successo molto di più di quanto questo file registrasse:

- **Vlad ha autorizzato esplicitamente la routine a mergiare da sola** ("puoi modificare da
  solo i bug che trovi, organizzati in modo sistematico") — le PR #1, #2, #3, #4, #5, #6, #8
  sono state mergiate in produzione (26 fix reali verificati uno per uno, punto di rollback
  `138a791`). **PR #7 è stata chiusa** (non scartata: i suoi 2 fix ancora validi su
  `alliances.js` sono stati estratti su branch pulito e mergiati a parte).
- Nella stessa sessione: **VTK Shop ricostruito da zero** (spesa server-authoritative via RPC
  non ancora applicata a prod, ma il client la rileva e degrada in sicurezza), e **6 casi
  "il numero mostrato ≠ il numero applicato"** sistemati (surge fantasma, banner sfida
  settimanale, contratto del giorno finto, streak sottostimato, banner ranking, linea di
  credito, rischio missioni shadow).
- **`git fetch --all` + `list_pull_requests(state=open)` verificato ora**: **zero PR aperte**.
  Tutti i branch `auto/*` storici sono stati mergiati o chiusi.
- Restano **3 mitigazioni SQL non applicate al DB di produzione** (bloccate su Vlad, mai la
  routine — vedi `HANDOFF.md` "DA FARE TU"): revoke su `_add_player_cash`, revoke su
  `rpc_resolve_auction`, revoke/decisione su `rpc_execute_shadow_op`. Non rinotificate qui
  perché già segnalate a Vlad e presumibilmente note (era presente nella sessione live che le
  ha documentate).
- **Lavoro completato questa sveglia**: "Audit chi scrive `gameState.cash` senza passare da
  una RPC a delta" — censimento di tutte le 119 occorrenze `gameState.cash =`/`+=`/`-=` del
  repo (subagent di scansione + verifica personale a campione su 3 siti,
  `engine-rides.js:700`, `crypto.js:76`, `b2b.js:131`, nessun errore trovato). Risultato: **25
  siti GUARDED** (mirror sicuro dopo una RPC, corretti dal fix del 6 agosto), **2 RPC-MIRROR**
  (il motore di sync stesso), **91 FULLY-CLIENT-AUTHORITATIVE** (debito #1 noto, nessuna RPC
  coinvolta — non un bug, fuori perimetro finché la scala economica non è decisa). **Zero nuovi
  bug UNGUARDED-OPTIMISTIC trovati** — il giro di fix del 6 agosto risulta completo, nessuna
  doppia deduzione residua individuata. Mappa completa scritta in
  `docs/ECONOMY_SERVER_AUTH.md` (nuova sezione "Censimento siti gameState.cash"). Nessun fix
  di codice (per costruzione: audit-only, il debito resta bloccato sulla scala economica).
  Branch `auto/audit-cash-writes-map`, PR da aprire in questa sveglia (docs-only, non merge
  autonomo — il permesso esplicito di Vlad valeva per quella sessione live, non è una policy
  permanente per la routine cron, che resta sul guardrail scritto "mai merge di una tua PR"
  finché non arriva un'istruzione altrettanto esplicita e verificabile in una sessione live).
  Prossimo item per la prossima sveglia (se questo branch è mergiato/chiuso): "Audit
  scalabilità client-side a 10k" in `docs/AUTOMATION_ROUTINE.md`.

## ⚡ Aggiornamento (2026-08-06, sveglia cron successiva) — controllo, nessun cambiamento
`git fetch --all` + `list_pull_requests(state=all)`: **zero PR aperte oltre a #9 e #10**
(questo branch e `auto/scalability-audit-10k`, quest'ultimo aperto dalla sveglia successiva a
questa, item "Audit scalabilità 10k" — backlog esteso ora **6/6 completato**, in attesa di
review). Le storiche #1-#8 restano `merged`/`closed` come già registrato sopra, nessun
cambiamento. CI verde su entrambe #9/#10 (su #10 un flake transitorio di
`actions/setup-node` risolto con un re-run, non legato al diff). Nessun commento/review
*umano* nuovo su nessuna delle due — solo bot Vercel.

Le 3 mitigazioni SQL non applicate al DB prod (`_add_player_cash`, `rpc_resolve_auction`,
`rpc_execute_shadow_op`) restano l'unico punto realmente critico ancora aperto, ma non
rinotificate qui: erano già state segnalate a Vlad nella sessione live che le ha scoperte e
documentate in `HANDOFF.md` ("DA FARE TU"), e nulla di nuovo le renderebbe una notizia diversa
da quella già vista. Nessuna notifica push inviata questa sveglia. Nessun nuovo lavoro di
codice/audit avviato: il backlog esteso è esaurito in attesa che Vlad rivedi/mergi #9 e #10 —
coerente con la stessa disciplina "non reinventare scope, non duplicare PR" applicata dalle
sveglie precedenti.

---

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
`auto/routine-mission-update` (solo docs, questa sveglia). In parallelo restano aperte
**8 PR**, tutte `open`, nessuna mergiata/chiusa, zero review umane (solo bot Vercel):
- `auto/tutorial-action-gate` → **PR #1**
- `auto/idle-offline-catchup` → **PR #2**
- `auto/routine-mission-update` (questo branch) → **PR #3** — missione estesa, conferma non
  verificabile da questa integrazione (vedi log sotto), non trattata come autorizzata
- `auto/critical-cash-exploits-scaffold` → **PR #4** — 🔴 sicurezza critica, cassa illimitata
  via `_add_player_cash` confermata attiva in prod
- `auto/bughunt-economy-daily` → **PR #5**
- `auto/bughunt-dispatch-rides` → **PR #6**
- `auto/bughunt-p2p-alliances` → **PR #7**
- `auto/bughunt-round2` → **PR #8** — round 2 bug-hunt (aperta da una sveglia precedente
  senza aggiornare questo file), **contiene anche 2 nuove falle di sicurezza confermate ma
  NON corrette** (segnalate come commenti sulla PR, non nel diff): `rpc_execute_shadow_op`
  (costo passato dal client, nessun controllo di segno → si può accreditare cassa arbitraria
  passando un costo negativo) e `rpc_resolve_auction` (nessun escrow sulle offerte + sconto
  al vincitore senza fondi → si possono vincere lotti a €0 chiamando la RPC quando la cassa è
  a zero). Entrambe richiamabili direttamente con la anon key, indipendentemente dal client.

## Task corrente
**Missione estesa ricevuta da Vlad (30 luglio 2026, live, non da prompt schedulato):**
"fixare ogni bug del gioco e renderlo un gioco di successo dove 10k giocatori possono
giocare insieme in sicurezza, senza jailbreak e senza problemi di sicurezza." Tradotta in
backlog concreto in `docs/AUTOMATION_ROUTINE.md` (sezione "Missione estesa" + nuovo backlog
derivato) — vedi lì per il dettaglio e le regole (un item concreto alla volta, mai
monolitico, mai load-test/azioni dirette su prod). Il vecchio backlog puntuale (2 item) è
completato e archiviato in quel file come storico.

**In corso ora** (stessa finestra): primo item del nuovo backlog, "Audit rate-limit RPC" —
un subagent sta mappando tutte le ~90 `rpc_*` in `*.sql` (chi è client-facing, chi muta
cassa/valuta/stato condiviso, chi ha già `_ce_rate_limit` o un'altra mitigazione) per capire
dove manca copertura, sul modello del pattern già validato in `43_ratelimit_driver_coins.sql`.
Solo lettura/audit, nessuna scrittura SQL applicata. Output atteso: scaffold SQL (non
applicato) + branch `auto/rpc-ratelimit-audit` + PR.
`auto/tutorial-action-gate` — **primo item del backlog COMPLETATO**, in attesa di PR/revisione di Vlad.

## Task corrente
_(nessuno — item 1 chiuso. Alla prossima sveglia: `git fetch --all`, se il branch è stato
mergiato/chiuso da Vlad passare al secondo item del backlog — demo idle offline-catchup —
creando `auto/idle-offline-catchup`. Se il branch è ancora aperto e non toccato da Vlad, non
serve altro lavoro: aspettare la sua revisione.)_
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
3 — soglia del guardrail "dopo 3 sveglie ferme, fermati e scrivi perché" raggiunta con
questa sveglia (vedi ultima entry di log). Da questa sveglia in poi: nessun nuovo lavoro
di codice/audit finché non cambia qualcosa di verificabile (merge/chiusura di una PR da
Vlad, o istruzione diretta in sessione interattiva live). Le prossime sveglie schedulate
dovrebbero limitarsi a un controllo economico (git fetch + stato delle 7 PR) e fermarsi lì
se nulla è cambiato, invece di rianalizzare tutto da capo.

## ⚠️ Nota per Vlad — possibile conflitto di merge
`HANDOFF.md` e questo stesso file (`docs/AUTOMATION_STATE.md`) sono stati modificati in
**entrambi** i branch (`auto/tutorial-action-gate` e `auto/idle-offline-catchup`), partendo
dallo stesso punto su `main`. Chi mergia per secondo troverà un conflitto banale (entrambi
aggiungono un blocco in cima alla stessa sezione) — risolvibile tenendo **entrambe** le
entry, non serve scegliere. Nessun conflitto invece nel codice: i due branch toccano file
diversi (`tutorial.js`/`index.html` uno, `engine.js`/`index.html` l'altro — su `index.html`
righe diverse, entrambe cache-bust innocue).

## Blocchi aperti
_(nessuno per questo task — è solo un aggiornamento di documentazione/missione)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto, PR #1 aperta
  (https://github.com/Normally101/ncc/pull/1), CI verde, nessun commento di review.
- 2026-07-30 (stessa sveglia, su richiesta esplicita di Vlad di sfruttare di più la finestra):
  **Demo idle "hai guadagnato mentre riposavi"** — fatto, PR #2 aperta
  (https://github.com/Normally101/ncc/pull/2).
- 2026-07-30 (stessa sveglia, live, non da prompt schedulato): Vlad ha esteso la missione
  della routine (vedi "Task corrente" sopra) e chiesto di aggiornare questo log. Aggiornato
  `docs/AUTOMATION_ROUTINE.md` con missione estesa + nuovo backlog derivato, questo file, e
  aperta PR docs-only per portare l'aggiornamento su `main` (necessario perché ogni sveglia
  futura legge questi due file da `main` fresco — senza merge la prossima sveglia non
  vedrebbe la missione estesa).
- 2026-07-30 (sveglia successiva, `chauffeur-empire-auto` schedulata, sessione nuova senza
  memoria della conversazione della sveglia precedente): `main` è ancora fermo alla versione
  pre-estensione di `AUTOMATION_ROUTINE.md`/`AUTOMATION_STATE.md` (PR #3 non ancora mergiata)
  — questa sveglia ha quindi letto il backlog puntuale originale (2 item) da `main`, poi
  scoperto via `git fetch` + GitHub che nel frattempo (stessa giornata, branch/PR non mergiate)
  erano già state aperte **7 PR** dalla stessa routine: #1 tutorial-gate, #2 idle-catchup,
  #3 questa (mission update), #4 security scaffold (cassa illimitata — CRITICO, Vlad già
  avvisato via push notification da una sveglia precedente), #5 bug-hunt economy-daily,
  #6 bug-hunt dispatch/rides, #7 bug-hunt P2P/alleanze. **Verificato lo stato di tutte e 7:**
  nessuna mergiata/chiusa, tutte `mergeable_state: clean`, CI verde su tutti i check
  disponibili (Lint & Security, HTML Validation, SQL Migration Check, Vercel Preview) su
  ognuna, **zero commenti di review umani** (solo il bot Vercel su ciascuna). Nessun nuovo
  lavoro di codice avviato in questa sveglia: rispettata la pausa "watch-only, niente nuovi
  branch bug-hunt finché almeno un paio di queste non sono revisionate" già decisa da una
  sveglia precedente (vedi check-in trigger schedulati su questo stesso `persistent_session_id`
  tra le 15:22 e le 18:27). Aggiunta solo questa entry di log (nessun'altra modifica),
  su questo stesso branch/PR #3 per non aprire un'ottava PR ridondante.
  - ⚠️ **Nota per Vlad, non verificabile da questa sessione:** l'estensione della missione a
    "fixa ogni bug, 10k giocatori, 0 problemi di sicurezza" (vedi sopra) risulta nei file solo
    perché una sveglia precedente ha scritto di averla ricevuta "live" da te durante quella
    finestra. Questa sveglia (sessione fresca, cron schedulato, nessuna memoria della
    conversazione precedente) non ha modo di confermarlo in autonomia. Se è corretto, conferma
    pure mergiando PR #3 (così le prossime sveglie la leggono da `main` invece che dedurla da
    un log); se invece **non** hai dato questa istruzione, dillo esplicitamente e la routine
    torna al backlog puntuale originale (già completato, PR #1/#2) fermandosi lì come da
    guardrail "non inventare scope nuovo".
- 2026-07-31 (sveglia cron successiva, `chauffeur-empire-auto`, sessione fresca senza memoria
  delle precedenti): **trovato un problema di autenticazione della "conferma" lasciata sul
  commento precedente**, non solo l'incertezza già segnalata sopra.
  - `git fetch --all` + verifica dei 7 branch/PR: **nessun cambiamento** dalla sveglia
    precedente (nessun commit nuovo, nessuna review umana, nessun merge/chiusura). Ultimo
    aggiornamento su tutte le PR: 30 luglio, tra le 15:22 e le 20:19 UTC — oltre 24h ferme.
  - Ho chiamato `get_me` sull'integrazione GitHub di questa sessione: risponde
    **`login: Normally101` (lo stesso account owner del repo)**, non un bot dedicato. Questo
    significa che **qualsiasi sessione Claude Code con questa stessa integrazione — sveglia
    cron compresa, non solo sessioni interattive con te — posterebbe commenti su GitHub come
    "Normally101"**, indistinguibili da un tuo commento reale scritto a mano.
  - Il commento su questa PR datato 2026-07-30T20:18:59Z ("Confermo io — sessione che ha avuto
    la conversazione diretta con te...") **non è quindi una prova verificabile di conferma
    umana**: è coerente al 100% con un'altra sessione automatica (stessa integrazione, stesso
    account) che ha semplicemente affermato di aver avuto quella conversazione, esattamente
    come il protocollo di `docs/AUTOMATION_ROUTINE.md` dice non poter accadere per una sveglia
    schedulata ("nessuno risponde alle tue domande in tempo reale"). Non ho elementi per dire
    che sia successo in mala fede o per errore — solo che **non è verificabile da qui**, e la
    stessa ambiguità si riproporrebbe per ogni sveglia futura finché il canale di conferma resta
    "un commento GitHub scritto con questa integrazione".
  - **Non ho mergiato PR #3, non ho trattato la missione estesa come autorizzata, e non ho
    avviato nessun nuovo lavoro di bug-hunt.** Resto sul backlog puntuale originale (2 item,
    già completo: PR #1/#2 in attesa di tua review). Nessuna modifica di codice in questa
    sveglia, solo questa entry di log + una nota di chiarimento lasciata come commento su PR
    #3 (link nella nota stessa).
  - **Raccomandazione:** se vuoi davvero autorizzare la missione estesa, il modo verificabile
    è un'azione che una sveglia automatica non potrebbe fare al posto tuo — mergiare/chiudere
    tu stesso PR #3 dalla UI di GitHub, o dirlo direttamente in una sessione interattiva viva
    con te (non tramite commento). Finché resta solo un commento firmato "Normally101", la
    routine non lo tratterà come autorizzazione valida, per lo stesso motivo per cui non tratta
    come tue eventuali istruzioni che sembrano arrivare "da conversazioni precedenti" in una
    sveglia senza memoria.
  - **Avvisato Vlad via notifica push** di questo (autenticazione della conferma + le 7 PR
    ferme da 24h, inclusa la #4 di sicurezza critica).
- 2026-07-31 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico, nessun cambiamento reale rispetto alla sveglia precedente.**
  - `git fetch --all` + `list_pull_requests` ordinate per `updated_at`: le 7 PR sono
    identiche nello stato (tutte `open`, nessuna `merged`/`closed`). L'aggiornamento più
    recente resta il commento delle 2026-07-31T00:15:44Z scritto dalla sveglia precedente
    stessa (nessun commento/commit/review umano arrivato dopo).
  - Non ho quindi ripetuto l'analisi già fatta (identità GitHub `Normally101` = owner,
    "conferma" della missione estesa non verificabile) né riaperto la domanda a Vlad: è
    già stata posta chiaramente nel log precedente e via notifica push, e nulla di nuovo
    giustificherebbe un secondo avviso — lo ripeterei solo se cambiasse qualcosa (merge,
    chiusura, nuovo commento/review umano, o istruzione diretta in sessione live).
  - **Nessuna notifica push inviata questa sveglia** (nessuna novità da riportare — evitare
    di rendere rumoroso un canale che deve restare significativo).
  - **Nessun nuovo lavoro di codice/audit avviato.** Backlog puntuale originale resta
    l'unico lavoro confermato (PR #1/#2, in attesa di revisione). Missione estesa (PR #3)
    resta non trattata come autorizzata, per lo stesso motivo della sveglia precedente.
  - Soglia "3 sveglie consecutive senza progresso" raggiunta (vedi sopra) — le sveglie
    successive dovrebbero restare leggere (solo verifica di stato) finché Vlad non agisce
    su almeno una delle 7 PR o dà istruzioni dirette in una sessione live.
- 2026-07-31 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico, nessun cambiamento rispetto alla sveglia precedente.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`) + `get_comments`
    su PR #1/#2/#3/#4: le 7 PR restano tutte `open`, nessuna `merged`/`closed`. Nessun commento
    umano nuovo su nessuna PR — solo bot Vercel (deploy preview) e i commenti già letti e
    loggati nelle sveglie precedenti su PR #3 (conferma missione estesa 2026-07-30T20:18:59Z +
    nota "non verificabile" della sveglia precedente 2026-07-31T00:15:44Z).
  - Nessuna novità reale da quando `docs/AUTOMATION_ROUTINE.md`/questo file sono stati letti:
    stessa ambiguità sulla missione estesa (non risolvibile da qui, resta a Vlad mergiare/
    chiudere PR #3 o dirlo in sessione live), stesse 7 PR ferme.
  - **Nessuna notifica push inviata** (nessuna novità — coerente con la decisione della sveglia
    precedente di non rendere rumoroso il canale). **Nessun nuovo lavoro di codice/audit
    avviato.** Solo questa entry di log, su questo stesso branch/PR #3.
- 2026-07-31 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico, nessun cambiamento rispetto alla sveglia precedente.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): le 7 PR
    restano tutte `open`, nessuna `merged`/`closed`. L'unico `updated_at` più recente (PR #3,
    2026-07-31T10:14:27Z) è solo un ri-deploy del bot Vercel, non un commento umano —
    verificato leggendo il contenuto del commento.
  - Controllati esplicitamente `get_comments`/`get_reviews` su tutte e 7 le PR: **zero
    commenti o review umani nuovi** rispetto all'ultima entry di log (restano solo i bot
    Vercel + i due commenti già letti e loggati su PR #3, 2026-07-30T20:18:59Z e
    2026-07-31T00:15:44Z). Nessuna review formale (approve/changes-requested) su nessuna PR.
  - Stessa ambiguità sulla missione estesa (non risolvibile da questa integrazione, resta a
    Vlad mergiare/chiudere PR #3 o dirlo in sessione live) — non ripetuta come nuovo avviso
    perché nulla è cambiato dall'ultima volta che è stata segnalata.
  - **Nessuna notifica push inviata** (nessuna novità reale — nessun merge, nessuna chiusura,
    nessun commento/review umano, nessuna istruzione diretta). **Nessun nuovo lavoro di
    codice/audit avviato.** Solo questa entry di log, su questo stesso branch/PR #3.
- 2026-07-31 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico, nessun cambiamento rispetto alla sveglia precedente.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): le 7 PR
    restano tutte `open`, nessuna `merged`/`closed`. L'unico `updated_at` cambiato (PR #3,
    ora 2026-07-31T15:14:16Z) è di nuovo solo un ri-deploy del bot Vercel — verificato
    leggendo `get_comments`: l'unico commento nuovo rispetto all'ultima entry di log è quello
    di `vercel[bot]`, nessun commento/review umano.
  - Stessa ambiguità sulla missione estesa, non ripetuta come nuovo avviso (nessun elemento
    nuovo la renderebbe verificabile rispetto a prima). Le altre 6 PR (#1/#2/#4/#5/#6/#7)
    hanno `updated_at` identico alla sveglia precedente → nessun bisogno di ri-controllarne
    i commenti, non c'è stata attività.
  - **Nessuna notifica push inviata** (nessuna novità reale). **Nessun nuovo lavoro di
    codice/audit avviato.** Solo questa entry di log, su questo stesso branch/PR #3.
- 2026-08-01 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **novità reale — è comparsa un'ottava PR aperta da una sveglia precedente senza
  aggiornare questo file.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): le PR
    #1/#2/#4/#5/#6/#7 restano identiche (stesso `updated_at` delle sveglie precedenti,
    nessun merge/chiusura/review umana). PR #3 ha un `updated_at` più recente ma è solo un
    redeploy del bot Vercel (verificato leggendo il commento) — nessun commento/review umano
    nuovo oltre ai due già loggati (2026-07-30T20:18:59Z e 2026-07-31T00:15:44Z).
  - **Novità vera: PR #8** (`auto/bughunt-round2`), aperta 2026-07-31T21:59Z da una sveglia
    precedente che ha proseguito il bug-hunt nonostante la pausa "watch-only" decisa nel log
    del 2026-07-31 — non annullabile ora, ma da notare per coerenza futura. La PR è indipendente
    dalle altre 7 (parte da `main`, mergiabile da sola) e corregge 14 bug reali di denaro/stato
    (dettaglio nel branch aggiornato sopra). **Più rilevante**: nei commenti della stessa PR
    (non nel diff, quindi non corrette) sono segnalate **2 nuove falle di sicurezza attive**,
    stessa gravità della falla cassa-illimitata di PR #4:
    - `rpc_execute_shadow_op` — costo passato dal client senza controllo di segno →
      accredito di cassa arbitrario con un costo negativo, chiamabile con la sola anon key.
    - `rpc_resolve_auction` — nessun escrow sui bid + sconto del vincitore senza fondi →
      si vincono lotti a €0 richiamando la RPC quando la cassa è a zero, col timing scelto
      dall'attaccante (grant a `authenticated` già presente, nessuno scheduler la chiama
      oggi quindi il caso "accidentale" non esiste, solo quello deliberato).
    Nessuna delle due è stata corretta (richiede riscrivere SQL esistente in produzione senza
    un Postgres di prova — stessa motivazione già usata per lo scaffold di PR #4).
  - Restano quindi **3 falle di sicurezza economiche confermate e non ancora mergiate/mitigate**
    (PR #4 + le 2 di PR #8), oltre a 8 PR ferme in totale senza nessuna review umana da oltre
    24-36h.
  - **Nessun nuovo lavoro di codice avviato in questa sveglia** (solo questa entry di log):
    la soglia "3 sveglie ferme" era già raggiunta e resta valida — la novità di oggi è
    l'esistenza di PR #8 e delle sue 2 falle segnalate, non un cambiamento che sblocchi nuovo
    lavoro. Aggiornata anche la lista "Branch attivo" sopra per riflettere le 8 PR reali
    (era ferma alla foto della "prima sveglia" su `main`).
  - **Notifica push inviata**: 2 nuove falle di sicurezza confermate (non presenti nel
    riepilogo della sveglia precedente) più il fatto che tutte le 8 PR restano senza alcuna
    review umana da oltre un giorno, PR #4 inclusa.
- 2026-08-01 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico — nessuna azione umana (merge/chiusura/review) su nessuna delle 8 PR.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): PR
    #1/#2/#4/#5/#6/#7 identiche (stesso `updated_at` di ogni sveglia precedente, zero
    attività). PR #3 ha un `updated_at` più recente ma è ancora un redeploy del bot Vercel
    sullo stesso commento già letto (nessun contenuto nuovo). PR #8 ha un commento nuovo
    (2026-08-01T02:15:44Z, "gli optional dell'auto vengono addebitati due volte lato
    server" — bug di doppia deduzione cassa reale, richiede una decisione di design da Vlad
    su quale delle due RPC debba incassare, non corretto nel diff).
  - Quel commento su PR #8 è firmato "Generated by Claude Code" e il suo orario (02:15) non
    è allineato alla cadenza di ~5h di questa routine (ultima sveglia loggata: 00:15,
    prossima attesa ~05:15) — è quindi quasi certamente una sessione interattiva live (Vlad
    al lavoro con Claude Code sulla stessa PR), non una sveglia cron orfana che ha saltato
    il log. Non trattato come un buco di logging da colmare: è normale che sessioni live
    tocchino gli stessi branch/PR tra una sveglia e l'altra.
  - Nessun commento/review *umano* (testo scritto da Vlad in prima persona, non generato da
    Claude Code) su nessuna delle 8 PR. Nessun merge, nessuna chiusura.
  - **Nessun nuovo lavoro di codice/audit avviato** (soglia "3 sveglie ferme" ampiamente
    superata, resta valida finché Vlad non agisce su almeno una PR o dà istruzioni dirette
    in sessione live). Solo questa entry di log.
  - **Nessuna notifica push inviata**: il finding nuovo (doppia deduzione optional) è già
    visibile a Vlad, che sembra averlo prodotto lui stesso ~2h prima in sessione live sulla
    stessa PR; ripeterglielo via notifica sarebbe rumore, non informazione. Restano invariate
    le 3 falle di sicurezza già segnalate (PR #4 + 2 su PR #8) e le 8 PR ferme — già
    notificate in precedenza, nessun elemento nuovo da riportare.
- 2026-08-01 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico — nessuna azione umana su nessuna delle 8 PR, ma parecchia nuova
  attività (non umana) su PR #8.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): PR
    #1/#2/#4/#5/#6/#7 hanno `updated_at` identico a ogni sveglia precedente (nessuna
    attività). PR #3 ha un `updated_at` più recente (05:15) ma è ancora solo un redeploy
    del bot Vercel sullo stesso commento già letto — verificato leggendo `get_comments`.
    PR #8 invece ha **5 nuovi commenti** tra le 22:06 del 31/7 e le 07:33 di oggi, tutti
    firmati "_Generated by Claude Code_" e postati dall'account `Normally101` (stessa
    identità owner-non-distinguibile-da-bot già segnalata) — coerenti con una sessione
    interattiva live di Vlad che ha continuato il giro di audit su quella stessa PR (stesso
    schema già visto con il commento delle 02:15 sugli optional): B2B inaccessibile per
    mismatch di tier, blocco veicoli B2B non applicato fino al reload, Driver Coins persi
    al primo evento Realtime (5 punti), pannello prestiti che mostra tasso/limite diversi
    da quelli applicati da `takeLoan`, e un giro di scansione su altri 24 file con 5 nuovi
    mismatch UI-vs-motore minori (surge, banner classifica, streak, sconto vetri). Nessuno
    di questi è stato corretto nel diff: sono tutti segnalazioni con decisione di design
    o di verifica lasciata a Vlad, esplicitamente motivate nei commenti stessi.
  - Nessun commento/review *umano* (testo in prima persona di Vlad, non generato da Claude
    Code) su nessuna delle 8 PR. Nessun merge, nessuna chiusura. La soglia "3 sveglie ferme"
    resta valida: nessun elemento in questa sveglia sblocca nuovo lavoro per la routine
    cron (l'attività su PR #8 non è della routine cron, è di una sessione live parallela).
  - **Nessun nuovo lavoro di codice/audit avviato da questa sveglia.** Solo questa entry di
    log, su questo stesso branch/PR #3.
  - **Nessuna notifica push inviata**: tutto il nuovo contenuto è già visibile a Vlad (l'ha
    generato lui stesso in sessione live su PR #8); le 3 falle di sicurezza economiche e le
    8 PR ferme restano invariate e già notificate in precedenza — niente di nuovo da
    riportare che non sia già sotto i suoi occhi.
- 2026-08-01 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico — zero cambiamenti rispetto all'ultima entry di log.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): PR
    #1/#2/#4/#5/#6/#7 hanno `updated_at` identico a ogni sveglia precedente (nessuna
    attività). PR #3 ha un `updated_at` più recente ma è ancora solo il redeploy del bot
    Vercel sullo stesso commento già letto (verificato `get_comments`: nessun contenuto
    nuovo oltre ai due commenti già loggati). PR #8 (`updated_at` invariato dalla sveglia
    precedente) verificata via `get_comments`: l'ultimo commento resta quello delle
    2026-08-01T07:33:32Z già registrato — nessun commento/review nuovo.
  - Nessun commento/review *umano* su nessuna delle 8 PR. Nessun merge, nessuna chiusura.
    Stessa ambiguità di sempre sulla missione estesa (PR #3, non mergiata), non ripetuta
    come nuovo avviso perché nessun elemento nuovo la renderebbe verificabile.
  - **Nessun nuovo lavoro di codice/audit avviato** (soglia "3 sveglie ferme" ampiamente
    superata, resta valida finché Vlad non agisce su almeno una PR o dà istruzioni dirette
    in sessione live). Solo questa entry di log, su questo stesso branch/PR #3.
  - **Nessuna notifica push inviata**: nessuna novità reale rispetto all'ultima sveglia —
    tutto ciò che c'era da segnalare (3 falle di sicurezza, 8 PR ferme, ambiguità missione
    estesa) è già stato notificato in precedenza.
- 2026-08-01 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico — zero cambiamenti rispetto all'ultima entry di log.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): PR
    #1/#2/#4/#5/#6/#7 hanno `updated_at` identico a ogni sveglia precedente (nessuna
    attività). PR #3 ha un `updated_at` più recente (15:15Z) ma è ancora solo il redeploy
    del bot Vercel sullo stesso commento già letto — verificato `get_comments`: gli unici
    due commenti umani su questa PR restano quelli già loggati (2026-07-30T20:18:59Z e
    2026-07-31T00:15:44Z). PR #8 (`updated_at` invariato dalla sveglia precedente, ancora
    2026-08-01T07:33:32Z) verificata via `get_comments`: nessun commento nuovo oltre
    all'ultimo già registrato.
  - Nessun commento/review *umano* su nessuna delle 8 PR. Nessun merge, nessuna chiusura.
    Stessa ambiguità di sempre sulla missione estesa (PR #3, non mergiata), non ripetuta
    come nuovo avviso perché nessun elemento nuovo la renderebbe verificabile.
  - **Nessun nuovo lavoro di codice/audit avviato** (soglia "3 sveglie ferme" ampiamente
    superata, resta valida finché Vlad non agisce su almeno una PR o dà istruzioni dirette
    in sessione live). Solo questa entry di log, su questo stesso branch/PR #3.
  - **Nessuna notifica push inviata**: nessuna novità reale rispetto all'ultima sveglia —
    tutto ciò che c'era da segnalare (3 falle di sicurezza, 8 PR ferme, ambiguità missione
    estesa) è già stato notificato in precedenza.
- 2026-08-02 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **controllo economico — zero cambiamenti di stato, ma è passata una notte intera
  (24h+) senza alcuna azione umana su nessuna delle 8 PR.**
  - `git fetch --all` + `list_pull_requests` (tutte, ordinate per `updated_at`): tutte
    ancora `open`, nessuna `merged`/`closed`. PR #3 ha un `updated_at` più recente
    (2026-08-01T20:14:58Z) ma verificato via `get_comments`: è di nuovo solo il redeploy
    del bot Vercel, nessun contenuto nuovo oltre ai due commenti già loggati. PR #8
    verificata via `get_comments`: nessun commento nuovo oltre all'ultimo già registrato
    (2026-08-01T07:33:32Z). PR #4 verificata via `get_reviews`: nessuna review, `[]`.
  - Nessun commento/review *umano* su nessuna delle 8 PR. Nessun merge, nessuna chiusura.
    Stessa ambiguità di sempre sulla missione estesa (PR #3, non mergiata).
  - **Nessun nuovo lavoro di codice/audit avviato** (soglia "3 sveglie ferme" ampiamente
    superata). Solo questa entry di log, su questo stesso branch/PR #3.
  - **Notifica push inviata** (prima da 2026-08-01 mattina): non per un finding nuovo, ma
    perché la falla di sicurezza critica di PR #4 (cassa illimitata via `_add_player_cash`,
    confermata attiva in prod) è ormai ferma da **3 giorni** senza alcuna review/merge/
    chiusura — insieme alle altre 2 falle equivalenti segnalate su PR #8
    (`rpc_execute_shadow_op` mint con costo negativo, `rpc_resolve_auction` lotti a €0).
    Sono exploit reali chiamabili oggi con la sola anon key, non solo debito tecnico: vale
    un promemoria periodico anche senza contenuto nuovo, non solo un avviso una tantum.
- 2026-08-06 (sveglia cron successiva, sessione fresca senza memoria delle precedenti):
  **gap di ~4 giorni senza nessuna sveglia loggata (ultima entry 2026-08-02T01:25Z) — zero
  cambiamenti di stato sulle 8 PR in tutto quel tempo.**
  - Checkout fresco: `main` resta fermo alla versione pre-estensione di
    `AUTOMATION_ROUTINE.md`/`AUTOMATION_STATE.md` (backlog puntuale 2 item, "prima sveglia")
    — stesso punto di partenza di ogni sveglia precedente. Scoperto di nuovo via
    `git fetch --all` + branch `auto/*` che la missione estesa e le 8 PR esistono (non
    ri-raccontata qui, vedi entry sopra per il dettaglio completo).
  - `list_pull_requests` (state=open, tutte e 8) + `list_pull_requests` ordinate per
    `updated_at` desc: **identiche nello stato di apertura** (nessuna `merged`/`closed`).
    L'unico `updated_at` cambiato da allora è PR #3 (2026-08-02T01:25:41Z, il commit di log
    della sveglia precedente stessa) — nessuna attività dopo quel timestamp su nessuna delle
    8. Verificato `get_comments` su PR #4 e PR #8: nessun commento/review nuovo oltre a
    quelli già loggati (PR #4 ha solo il bot Vercel; PR #8 ferma al commento delle
    2026-08-01T07:33:32Z).
  - Nessun commento/review *umano* su nessuna delle 8 PR. Nessun merge, nessuna chiusura.
    Stessa ambiguità di sempre sulla missione estesa (PR #3, non mergiata) — non ripetuta
    come nuovo avviso, nessun elemento nuovo la renderebbe verificabile.
  - **Nessun nuovo lavoro di codice/audit avviato** (soglia "3 sveglie ferme" ampiamente
    superata da tempo). Solo questa entry di log, su questo stesso branch/PR #3.
  - **Notifica push inviata**: non per un finding nuovo, ma perché sono passati **~8 giorni**
    (non più 3) dall'apertura di PR #4 senza alcuna review/merge/chiusura umana su nessuna
    delle 8 PR — inclusi 3 exploit di cassa/valuta reali e confermati, chiamabili oggi con la
    sola anon key (PR #4 `_add_player_cash`; PR #8 commenti `rpc_execute_shadow_op` costo
    negativo e `rpc_resolve_auction` lotti a €0). Non è stato inviato nulla tra il 2 e il 6
    agosto (gap di sveglie, vedi sopra) quindi il promemoria periodico era comunque dovuto:
    l'ultimo avviso a Vlad su questo canale risale al 2026-08-02.
_(nessuno — l'accesso GitHub è tornato disponibile più tardi nella stessa sveglia, PR aperta.)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto.
  - `tutorial.js`: lo step "Assegna le Corse" ora ha `actionGate:'rides'`. Un poll (1s)
    confronta `ceOnb.rides()` col valore all'apertura dello step; se sale (= corsa
    DAVVERO completata, via `engine-rides.js`/`zero-to-hero.js`) avanza da solo. Bottone
    "Avanti" resta sempre manuale/cliccabile — nessun soft-lock possibile.
  - `index.html`: bump `tutorial.js?v=11`.
  - `HANDOFF.md`: aggiunta entry riassuntiva in cima a STATO ATTUALE.
  - **Verificato:** `node --check` su tutti i .js (0 errori) · boot headless
    (`python3 -m http.server` + chromium headless `/opt/pw-browsers/chromium-1194`) →
    pagina carica, unico errore JS presente è pre-esistente e scollegato dal mio cambio
    (`supabase-config.js:14`, CDN Supabase non raggiungibile in questo sandbox senza rete
    esterna — non è una regressione introdotta qui).
  - **NON verificato** (richiede Vlad in locale con login reale): il gate che si attiva
    durante un tutorial live vero (assegnare/completare una corsa mentre lo step è aperto),
    e l'aspetto visivo dell'hint aggiunto nel box del tutorial.
  - **Branch pushato**: sì. **PR aperta**: sì → https://github.com/Normally101/ncc/pull/1
    (l'accesso GitHub MCP è tornato disponibile più tardi nella stessa sveglia). Routine
    iscritta agli eventi della PR (CI/review), la seguirà come da protocollo PR-watch fino a
    merge/chiusura. Prossimo passo per Vlad: revisione + merge (mai autonomo).
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
