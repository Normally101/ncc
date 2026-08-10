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

## BLOCCO 3 — Daily systems + Contracts + B2B/Tourism
*(non ancora iniziato — tutti NOT TESTED salvo `daily-orders`/`daily-tick`/`corporate-bid` già in suite)*

## BLOCCO 4 — VIP + HQ + Auctions + Dynamic Events
*(non ancora iniziato)*
- HQ: noto `FAIL` architetturale — `hq.js::hqUpgradeRoom` non server-authoritative, `DESIGN_DECISION_REQUIRED` (vedi HANDOFF).
- Dynamic Events: noto `FAIL` — `global_events.js::activeDynamicEvent` mai resettato dopo un evento globale.

## BLOCCO 5 — Territories + VTK Shop + New Game+
*(non ancora iniziato)*
- Territories: `FAIL` parziale noto — 5/23 province seedate e funzionanti, 18 `FIX_LATER` (dati di bilanciamento mancanti, `DESIGN_DECISION_REQUIRED`).
- VTK Shop: PASS storico (fix 6/9 agosto), da riconfermare.
- New Game+: coperto da `new-game-plus.test.js`, da riconfermare live.
