# Stato routine automatica (memoria tra sveglie)

## 🔴 URGENTE — leggi questo per primo
`auto/critical-cash-exploits-scaffold` (**PR #4**, da aprire in questa sessione) contiene lo
scaffold di fix per **3 falle di sicurezza economiche confermate leggendo il codice sorgente
riga per riga** (non solo un report di subagent — verificate personalmente):
1. **`public._add_player_cash`/`_get_player_cash`** (`14_fix_cash_bigint_cast.sql`) sono
   `GRANT`ate direttamente a `authenticated` senza controllo `v_user_id = auth.uid()`.
   **Confermato attivo in produzione** (le funzioni live `rpc_buy_market_car`/
   `rpc_contribute_consorzio` — Mercato P2P e Consorzi, entrambi live — ne dipendono).
   Qualsiasi giocatore loggato può chiamare `_add_player_cash` direttamente e darsi cassa
   illimitata (o azzerare quella di chiunque altro). **Vlad è già stato avvisato via
   notifica push con la mitigazione immediata (2 righe REVOKE, sicura da incollare subito
   nel SQL Editor senza aspettare la PR).**
2. **`rpc_pay_majority_dividend`** (`27_hostile_takeovers.sql`) — zero controllo `auth.uid()`,
   importo arbitrario dal client. Confermato chiamato dal client (`engine-rides.js`).
   Permette di svuotare istantaneamente la cassa di un bersaglio OPA nel conto del raider
   (limitato dal `CHECK cash>=0`, quindi non genera cassa dal nulla ma consente un furto
   totale on-demand). Fix: richiede che il chiamante sia il vero raider.
3. **`rpc_start_trip`/`rpc_claim_trip_reward`** (`01_mmo_migration.sql`/`16_territory_war.sql`)
   — importo e durata della corsa arrivano dal client senza validazione server-side. **NON
   confermato un call-site nel client JS attuale** (probabile percorso di una migrazione MMO
   abbandonata) quindi incerto se sia raggiungibile dai giocatori oggi — ma se la migrazione
   è applicata al DB, resta chiamabile via API diretta a prescindere dal client ufficiale.
   Fix difensivo: tetto €200k/corsa (~30-40× il prezzo corsa singola più alto osservato nel
   codice) + minimo 5s di durata + rate-limit.
4. **`rpc_claim_daily_reward`** (`07_mmo_core_loop.sql`) — IDOR, `p_user_id` non verificato
   contro `auth.uid()`. Premio piccolo/limitato (non cassa illimitata) ma permette di
   manomettere lo streak di login di un account altrui. Nessun call-site client trovato.

**Nessuna di queste SQL è stata applicata al DB di produzione da questa routine** (guardrail
non negoziabile). Sono scaffold in `45_lockdown_cash_exploits_scaffold.sql`, da rivedere e
applicare da Vlad. La sezione 1 (REVOKE) è a rischio zero e può essere applicata subito anche
senza rivedere il resto del file.

## Branch attivo
Riepilogo di tutte le PR aperte da questa routine (nessuna mergiata da questa sessione):
- **PR #1** `auto/tutorial-action-gate` — Tutorial action-gated. In attesa di revisione.
- **PR #2** `auto/idle-offline-catchup` — Demo idle guadagni offline. In attesa di revisione.
- **PR #3** `auto/routine-mission-update` — docs: missione estesa da Vlad (bug-fix/sicurezza
  per 10k giocatori) + nuovo backlog derivato. In attesa di revisione — **da mergiare per
  prima delle altre**, altrimenti la prossima sveglia non vede la missione estesa (legge
  `docs/AUTOMATION_ROUTINE.md`/`AUTOMATION_STATE.md` da `main` fresco ad ogni sveglia).
- **PR #4** `auto/critical-cash-exploits-scaffold` — vedi sezione URGENTE sopra. **Priorità
  massima di revisione tra le 4.**

## Task corrente
Primo item del nuovo backlog ("Audit rate-limit RPC") completato e sfociato in qualcosa di
più serio di un semplice gap di rate-limit: 3 vulnerabilità di autorizzazione/validazione
confermate (vedi sopra), non solo RPC senza throttling. PR #4 aperta.

Prossimo passo per la prossima sveglia: `git fetch --all`, controllare se PR #1-#4 sono
state revisionate/mergiate da Vlad. Se sì → passare al prossimo item del backlog esteso in
`docs/AUTOMATION_ROUTINE.md` (bug-hunt engine-daily.js, o altro se Vlad ha dato indicazioni
nel frattempo). Se ancora aperte → nessun nuovo lavoro di codice sulle stesse aree, solo
seguire CI/review sulle PR esistenti (sottoscritta a tutte e 4 via subscribe_pr_activity).

## Sveglie consecutive senza progresso
0

## Blocchi aperti
_(nessuno di bloccante per il lavoro fatto — tutto scaffold/PR, nessuna azione richiede
qualcosa che la routine non ha. Le 3 falle in PR #4 restano aperte in prod finché Vlad non
applica il fix — non è un "blocco della routine", è un rischio in produzione segnalato.)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto, PR #1 aperta
  (https://github.com/Normally101/ncc/pull/1), CI verde, nessun commento di review.
- 2026-07-30 (stessa sveglia, su richiesta esplicita di Vlad di sfruttare di più la finestra):
  **Demo idle "hai guadagnato mentre riposavi"** — fatto, PR #2 aperta
  (https://github.com/Normally101/ncc/pull/2).
- 2026-07-30 (stessa sveglia, live, non da prompt schedulato): Vlad ha esteso la missione
  della routine a "fixare ogni bug, 10k giocatori in sicurezza, no jailbreak/problemi di
  sicurezza". Aggiornato `docs/AUTOMATION_ROUTINE.md` con missione estesa + backlog derivato,
  PR #3 aperta (https://github.com/Normally101/ncc/pull/3).
- 2026-07-30 (stessa sveglia): eseguito il primo item del nuovo backlog (audit rate-limit
  RPC) via subagent, poi **verificato personalmente leggendo il codice sorgente** (non
  fidandosi solo del report del subagent) — trovate 3 vulnerabilità reali di
  autorizzazione/validazione, la più grave delle quali (`_add_player_cash` senza controllo
  `auth.uid()`) è cassa illimitata a chiamata singola, confermata attiva in prod. **Vlad
  avvisato subito via notifica push** con mitigazione immediata copia-incolla, PRIMA di
  finire lo scaffold completo. PR #4 aperta con lo scaffold dei 4 fix (nessuna SQL applicata
  al DB da questa routine).
