# Chauffeur Empire — Checklist di Stabilità

> Creata: 10 agosto 2026. Progetto in **FEATURE FREEZE** — obiettivo: una versione stabile,
> giocabile, affidabile prima di qualsiasi nuova feature. Vedi `HANDOFF.md` per il contesto.
> Aggiornata a fine di ogni BLOCCO (sezione 9 dell'istruzione di Vlad). Non è un documento di
> design — è lo stato di verifica dei sistemi ESISTENTI.

Stati possibili: `PASS` (verificato, funziona) · `FAIL` (verificato, bug reale) ·
`NOT TESTED` (non ancora verificato in questo giro) · `N/A` (non applicabile).

Fonti usate: `docs/SYSTEMS.md`, `docs/QA_PLAN.md`, `docs/ECONOMY_SERVER_AUTH.md`, `HANDOFF.md`.
`docs/SQL_LOCKDOWN_HANDOFF.md` non esiste più — consumato/chiuso dopo la sessione SQL del 9
agosto (vedi `HANDOFF.md`, entry "9 agosto — Tutte le falle SQL critiche chiuse").

---

## BLOCCO 1 — Core + Save/Load + Economy — ✅ COMPLETATO (10 agosto 2026)

Branch `auto/stabilization-blocco1` (basato su `auto/qa-test-suite`, con merge del fix giorno-di-gioco
da `auto/e2e-onboarding-day-bug`/PR #18). Suite: **49/49 pass**. Golden path completo verificato dal
vivo con account di test usa-e-getta (creato ed eliminato in sessione): New Game → First Day → guida
manuale → login streak → assunzione → 2 prestiti → acquisto veicolo → save → attesa 4.5s → reload →
logout → re-login. Tutti gli step coerenti, zero errori console salvo l'anomalia push_subscriptions
già classificata FALSE_POSITIVE (vedi HANDOFF, non riproducibile da giocatori reali).

### CORE

| Voce | Stato | Note |
|---|---|---|
| New Game | PASS | `initGame(true)` + `rpc_init_company`. Bug giorno-non-sincronizzato fixato (PR #18, mergiato in questo branch per il test, PR originale ancora aperta — vedi sezione 11 del report). |
| Login | PASS | Verificato live su 4 account reali (Admin API) in due sessioni, tutte le 6 fasi di boot (`auth.js`) senza errori. |
| First Day | PASS | Era proprio lo scenario del bug PR #18 — ora verificato pulito (debito Vittorio resta esattamente €500, nessun tick spurio). |
| Daily Tick | PASS | `daily-tick.test.js` (no drift su chiamate ripetute) + verificato che non duplica su reload immediato. |
| Save | PASS (con fix) | **FAIL trovato e fixato**: `_cloudSaveSlot` scartava (non accodava) i salvataggi entro 4s l'uno dall'altro — un prestito preso e poi un reload entro 4s perdeva silenziosamente il prestito. Fix: salvataggio "di coda" a fine finestra invece dello scarto. Limite residuo: un reload/chiusura ENTRO la finestra di coda può ancora perdere l'ultima azione (non eliminabile senza toccare `beforeunload`, fuori scope). |
| Load | PASS | Verificato live: reload ripristina cash/giorno/autisti/prestiti/flotta esatti, nessun autista orfano "busy". |
| Logout | PASS | `authLogout()` verificato dal vivo: sessione pulita, nessun residuo in `localStorage`, re-login successivo ripristina lo stato intatto. |
| Reload | PASS | Verificato live in più sessioni, nessuna corruzione. |

### ECONOMY

| Voce | Stato | Note |
|---|---|---|
| Cash | PASS | Server-authoritative sui path testati. Debito noto strutturale (91+ mutazioni dirette client, `docs/ECONOMY_SERVER_AUTH.md`) resta `FIX_LATER` — fuori scope di un fix chirurgico, non nuovo in questa sessione. |
| Income | PASS | Guida manuale, corse, streak — verificato live. |
| Expenses | PASS | Interessi Vittorio, daily tick — verificato non duplica su chiamate ripetute. |
| Loans | PASS (con 2 fix) | **FAIL #1 trovato e fixato**: `takeLoan` validava solo il totale prestiti ESISTENTE contro il fido, non la somma col nuovo prestito — due prestiti singolarmente sotto il fido potevano superarlo insieme. **FAIL #2 trovato e fixato**: `takeLoan`/`repayLoan` non sincronizzavano mai il cash col server — riprodotto dal vivo, `rpc_buy_vehicle` rifiutava un acquisto legittimo subito dopo un prestito ("fondi insufficienti" con cash locale abbondante). 7 test in `test/economy/loans.test.js`. |
| Driver Coins | PASS | Coperto da `daily-orders.test.js` (già esistente) + verificato che il pattern optimistic-poi-server-authoritative è corretto negli altri call site controllati. Nota: ~14 spese Driver Coins in `engine-store.js` (Executive Pass, skip costruzione, ecc.) restano client-only, stessa classe del debito economia generale — non nuove, non fixate qui, `FIX_LATER`. |
| Rewards | PASS (con fix) | **FAIL trovato e fixato**: la ricompensa login streak (`_checkDailyReward`) sommava il cash SOLO in locale, stesso rischio di divergenza dei prestiti. 5 test in `test/economy/daily-reward.test.js`, incluso "un secondo claim entro 20h non duplica". |
| Transactions | PASS | "Doppio click"/retrigger coperto per corse (`complete-ride.test.js`), bandi corporate, prestiti (secondo rimborso non doppio) e reward giornaliero (secondo claim non doppio). |

**`DESIGN_DECISION_REQUIRED` emersa in questo blocco**: `takeLoan`/`repayLoan` ora sincronizzano il
cash (fix sopra) ma continuano a NON chiamare le RPC dedicate `rpc_take_loan`/`rpc_repay_loan`
(già indurite il 9 agosto, mai collegate lato client). La RPC ha un modello di ammortamento
(`daily_payment`, scalato automaticamente da un tick server-side su `company_loans` — vedi
`02_mmo_rpcs_extension.sql` righe 849-895) che il client non implementa affatto (i prestiti si
ripagano manualmente per intero, mai a rate). Collegare per intero la RPC richiede prima decidere
se adottare l'ammortamento server-side o abbandonarlo — non toccato in questa sessione per non
inventare un sistema nuovo sotto feature freeze.

---

## BLOCCO 2 — Garage + Employees + Rides — ✅ COMPLETATO (10 agosto 2026)

Suite: **57/57 pass** (49 di BLOCCO 1 + 7 garage/assign-upgrade + 1 salario in daily-tick).
Verificato dal vivo: doppia-assegnazione auto (fix), acquisto upgrade veicolo, zero errori console.

| Voce | Stato | Note |
|---|---|---|
| Buy Vehicle | PASS | `vehicle-trade.test.js` + confermato live in BLOCCO 1 (prestito→acquisto). |
| Sell Vehicle | PASS | `vehicle-trade.test.js`; libera correttamente l'autista assegnato (`engine.js` riga ~1483). |
| Vehicle upgrades | PASS | Nuovo `test/garage/assign-upgrade.test.js` + verificato live. Nota: `buyCARUpgrade` non chiama `syncCash` (stesso debito noto, rischio basso — è un decremento). |
| Maintenance | PASS | `repair-vehicle.test.js` (4 test, invariato). |
| Damage | PASS | Coperto indirettamente da `vip-clients.test.js` (danno al veicolo giusto dopo riassegnazione). |
| Vehicle assignment | PASS (con fix) | **FAIL trovato e fixato**: assegnare un'auto già in uso a un secondo autista non liberava il primo — due autisti finivano assegnati alla stessa vettura, riproducibile con normale uso della UI (nessun devtools richiesto). `engine.js::assignCarToDriver`. |
| Vehicle state | PASS | `condition`/`fuel`/`mileage` coperti da repair-vehicle + rides. |
| Hire | PASS | `hire-fire.test.js`, confermato live. |
| Fire | PASS | Regressione "busy non licenziabile" confermata live (BLOCCO 1). |
| Assign | PASS (con fix) | Vedi "Vehicle assignment" sopra — stessa funzione. |
| Unassign | N/A | Nessuna funzione dedicata di "unassign" esplicito — un autista viene liberato solo come effetto collaterale di vendita/riassegnazione auto (entrambi testati). |
| Salary | PASS | Nuovo test in `daily-tick.test.js`: lo stipendio (salary/30) riduce correttamente il guadagno netto giornaliero. |
| Skill/progression | NOT TESTED | Sistema ampio (`driver_skills.js`, skill tree con punti/rami) — XP su corsa completata verificato indirettamente, l'albero skill completo non testato in questo giro. Rischio basso (non economico, non corrompe stato critico). |
| Incoming ride | PASS | `generatePOIRide` osservato dal vivo, genera correttamente una corsa pending. |
| Accept | N/A | Non esiste un passo "accept" separato — le corse si auto-dispatchano ai driver idle con auto assegnata. |
| Dispatch | PASS | Osservato dal vivo (BLOCCO 1 e 2): dispatch automatico funziona. |
| Complete | PASS | `complete-ride.test.js` (pagamento una sola volta, anche a doppia chiamata). |
| Cancel | N/A | Nessuna funzione di cancellazione corsa nel design attuale (le corse pending scadono o vengono dispatchate, non cancellate dal giocatore). |
| Payment | PASS | `complete-ride.test.js` + confermato live. |
| Rewards | PASS | XP autista (`driver.xp +=`) verificato presente nel codice; non un rischio economico (non tocca cash/RPC). |
| Driver availability | PASS | `complete-ride.test.js` verifica il driver torna `idle` a fine corsa. |

## BLOCCO 3 — Daily systems + Contracts + B2B/Tourism — ✅ COMPLETATO (10 agosto 2026)

Suite: **64/64 pass**. `daily-orders`/`daily-tick`/`corporate-bid` invariati. Nuovo:
`test/contracts/b2b-tourism-eligibility.test.js` (7 test sulla logica pura di rank/punteggio).
Verificato dal vivo l'intero ciclo B2B (fetch → accetta → tick → dati coerenti) e Tourism
(fetch → bid → cancel), con 2 bug reali trovati e corretti.

| Voce | Stato | Note |
|---|---|---|
| Daily Tick | PASS | Invariato da BLOCCO 1/2 (+ test salario). |
| Daily Orders | PASS | Invariato (`daily-orders.test.js`, 4 test + regressione rollback). |
| Contracts (bandi corporate) | PASS | Invariato (`corporate-bid.test.js`, 4 test). |
| B2B | PASS (con 2 fix) | Vedi sotto. |
| Tourism | PASS (con 1 fix + 1 seed) | Vedi sotto. |

**BUG REALE #1 — tabelle `b2b_contracts`/`b2b_catalog`/`b2b_active_tenders` vuote in produzione,
sistemi B2B e Tourism completamente senza contenuto per chiunque:**
- Stesso identico pattern di VTK Shop (6 agosto) e Provinces (10 agosto): RPC/UI/fetch tutti
  funzionanti e verificati, ma **zero righe** nelle tabelle di contenuto — nessun contratto B2B
  né bando turismo disponibile per nessun giocatore, mai. Nessuna RPC di generazione esiste
  (verificato: nessuna `generate_b2b_contracts`/simile nello schema).
- **Fix applicato**: seed già progettato nei migration file esistenti, mai applicato — 12
  contratti B2B (`19_b2b_contracts.sql`) + 21 aziende turismo con relativi bandi attivi
  (`34_fix_console_errors.sql`, versione più recente/corretta di `33_tourism_tenders.sql`).
  Nessun dato inventato — valori identici ai file committati. `ON CONFLICT DO NOTHING`,
  idempotente, verificato prima/dopo.
- Verificato dal vivo: `b2bRefresh()`/`tourismRefresh()` ora restituiscono 12 contratti e 21
  bandi rispettivamente (prima: 0 e 0).

**BUG REALE #2 — messaggio di errore corrotto su reputazione insufficiente (bug di formattazione
SQL, non di sicurezza):**
- `rpc_accept_b2b_contract` e `rpc_list_company_ipo` usavano `%.1f` in `RAISE EXCEPTION` — sintassi
  printf-style **non supportata da Postgres** (che usa solo `%` come placeholder posizionale).
  Risultato: messaggio mostrato al giocatore "Reputazione insufficiente (serve 1.5.1f★)" invece di
  "...serve 1.5★". Riprodotto dal vivo tentando di accettare un contratto con reputazione
  insufficiente (il path di rifiuto più comune, non un edge case).
- **Fix applicato**: sostituito `%.1f` con `round(valore, 1)` + `%`, verificato dal vivo che il
  messaggio ora sia pulito.

**Verificato dal vivo, ciclo completo:**
- B2B: fetch contratti (12) → accetta "Trasporto Dirigenti Senior" (con flotta/reputazione
  qualificanti) → contratto attivo con importi/scadenze corretti → tick giornaliero (nessun
  errore, nessun payout perché non ancora dovuto — `next_payout_at` a 24h) → zero errori console.
- Tourism: fetch bandi (21) → imposta pledge e presenta offerta su "Zenith Harbor Leisure" (bid
  registrata, `bid_count` 0→1) → annulla offerta (nessun errore, cash coerente) → zero errori
  console.

**NOT TESTED**: la maturazione reale di un bando/contratto fino al termine (richiederebbe
manipolare `next_payout_at`/`bidding_ends_at` nel DB per non aspettare ore reali — non fatto in
questo giro, rischio basso essendo puro tick temporale già testato in astratto da `daily-tick`).

## BLOCCO 4 — VIP + HQ + Auctions + Dynamic Events — 🔄 IN CORSO (18 agosto 2026)

Suite: **78/78 pass** (erano 64 a fine BLOCCO 3). Nuovi: `test/events/global-events-sync.test.js`
(5), `test/events/dynamic-events-lifecycle.test.js` (3), `test/vip/email-actions.test.js` (3).
Due `FAIL` noti chiusi, uno resta bloccato su una decisione di Vlad.

| Voce | Stato | Note |
|---|---|---|
| Dynamic Events | PASS (con 1 fix) | Il `FAIL` noto è chiuso, vedi BUG #1. Ciclo locale e specchio globale coperti da test. |
| VIP | PASS (con 1 fix) | Cassa ora sincronizzata col server, vedi BUG #2. Resta da provare live il giro email→corsa per ognuno dei 10 clienti. |
| Auctions | PASS su audit · NOT TESTED live | Interamente RPC (`rpc_place_auction_bid`, `rpc_get_*`): nessuna mutazione locale di `gameState.cash`, niente da sincronizzare. Serve una sessione vera con aste attive per confermarlo dal vivo. |
| HQ | `FAIL` — bloccato | `hq.js::hqUpgradeRoom` non server-authoritative (`gameState.cash -= nextTier.cost` in locale). `DESIGN_DECISION_REQUIRED`: aspetta una decisione di Vlad, non codice. |

**BUG REALE #1 — `activeDynamicEvent` mai azzerato alla fine di un evento globale
(era il `FAIL` noto del blocco):**
- `global_events.js` specchia l'evento globale in `gameState.activeDynamicEvent` con
  `endsHour: Infinity`, quindi `_tickDynamicEvent()` (engine-events.js) non lo scade mai; e quando
  l'evento finiva, la funzione del banner usciva subito (`if (!ev) { …hidden; return; }`) senza
  toccare lo specchio. Due conseguenze: i moltiplicatori (mance, xp, velocità, `forceAirport`)
  restavano attivi **per sempre**, e nessun evento dinamico locale poteva più partire, perché
  `_maybeGenerateDynamicEvent()` trovava lo slot sempre occupato.
- **Fix applicato**: la sincronizzazione è ora `window.syncGlobalEventToGameState()`, separata dal
  disegno del banner (gira anche se `#hub-event-banner` non è nel DOM) e azzera lo specchio solo
  se di origine globale — gli eventi locali hanno il loro timer e non vanno toccati.
- Coperto da 8 test: popolamento, azzeramento a evento finito, indipendenza dal DOM, immunità
  degli eventi locali, cambio di evento, più il ciclo di vita locale (scadenza all'ora giusta).
- Primo lavoro passato per l'hub Olga Studio (task `t_00d4f8c4db1246e3a94c`), eseguito da Gigi.

**BUG REALE #2 — le azioni email VIP muovevano cassa senza dirlo al server:**
- Sette handler (Grigori rerouting, Platinum paparazzi, Onorevole GdF, Garante paga/intimidisci,
  Wedding gestisci/saldo) facevano `gameState.cash ±= …` e poi `saveGame()`. Ma `saveGame()`
  scrive **solo il blob** in `game_saves`: `companies.cash` — quello che leggono le RPC di P2P,
  alleanze, IPO e province — restava indietro fino alla prima azione che sincronizzava per conto
  suo. È il debito #1 (doppia source of truth) che si manifesta in un punto concreto.
- **Fix applicato**: `_vipSyncCash()` dopo ogni azione che muove cassa, stesso pattern già usato
  in `engine-rides.js` e `engine-daily.js`. Le `_vipComplete*` non ne hanno bisogno: girano dentro
  il completamento corsa, che sincronizza già alla fine.
- Coperto da 3 test (incasso, spesa, fondi insufficienti → nessuna sincronizzazione).

**NOT TESTED in questo giro**: le aste dal vivo (serve un'asta attiva sul server), il giro
completo email→corsa→completamento per ciascuno dei 10 clienti VIP, e HQ (bloccato).

## BLOCCO 5 — Territories + VTK Shop + New Game+
*(non ancora iniziato — solo ricognizione, 18 agosto 2026)*
- Territories: `FAIL` parziale noto — 5/23 province seedate e funzionanti, 18 `FIX_LATER` (dati di bilanciamento mancanti, `DESIGN_DECISION_REQUIRED`).
- VTK Shop: PASS storico (fix 6/9 agosto). Riconfermato **su audit del codice** il 18/08: tutte le
  operazioni passano da RPC (`rpc_place_vtk_sell_order`, `rpc_fill_vtk_order`, `rpc_cancel_vtk_order`,
  `rpc_spend_vtk_shop_item`), nessuna mutazione locale di cassa o di saldo VTK. Da riconfermare live.
- New Game+: `PASS` — `test/progression/new-game-plus.test.js` verde (3 test: reset, eredità della
  reputazione, sync del cash col server sia per `newGamePlus` sia per `sellCompanyNGP`). Da
  riconfermare live.
