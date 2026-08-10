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

## BLOCCO 2 — Garage + Employees + Rides
*(non ancora iniziato)*

| Voce | Stato |
|---|---|
| Buy Vehicle | NOT TESTED (coperto da `vehicle-trade.test.js`, da confermare live) |
| Sell Vehicle | NOT TESTED |
| Vehicle upgrades | NOT TESTED |
| Maintenance | NOT TESTED (coperto da `repair-vehicle.test.js`) |
| Damage | NOT TESTED |
| Vehicle assignment | NOT TESTED |
| Vehicle state | NOT TESTED |
| Hire | NOT TESTED (coperto da `hire-fire.test.js`, confermato live in sessione precedente) |
| Fire | NOT TESTED (regressione confermata live — driver busy non licenziabile) |
| Assign | NOT TESTED |
| Unassign | NOT TESTED |
| Salary | NOT TESTED |
| Skill/progression | NOT TESTED |
| Incoming ride | NOT TESTED |
| Accept | NOT TESTED |
| Dispatch | NOT TESTED (osservato live: dispatch automatico funziona) |
| Complete | NOT TESTED (coperto da `complete-ride.test.js`) |
| Cancel | NOT TESTED |
| Payment | NOT TESTED (pagamento singolo confermato da test + live) |
| Rewards | NOT TESTED |
| Driver availability | NOT TESTED |

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
