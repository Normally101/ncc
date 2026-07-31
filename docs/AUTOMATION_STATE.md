# Stato routine automatica (memoria tra sveglie)

## Branch attivo
`auto/routine-mission-update` (solo docs, questa sveglia). In parallelo restano aperte:
- `auto/tutorial-action-gate` → **PR #1**, in attesa di revisione/merge di Vlad.
- `auto/idle-offline-catchup` → **PR #2**, in attesa di revisione/merge di Vlad.

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

## Sveglie consecutive senza progresso
3 — soglia del guardrail "dopo 3 sveglie ferme, fermati e scrivi perché" raggiunta con
questa sveglia (vedi ultima entry di log). Da questa sveglia in poi: nessun nuovo lavoro
di codice/audit finché non cambia qualcosa di verificabile (merge/chiusura di una PR da
Vlad, o istruzione diretta in sessione interattiva live). Le prossime sveglie schedulate
dovrebbero limitarsi a un controllo economico (git fetch + stato delle 7 PR) e fermarsi lì
se nulla è cambiato, invece di rianalizzare tutto da capo.

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
