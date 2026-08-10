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

## BLOCCO 1 — Core + Save/Load + Economy

### CORE

| Voce | Stato | Note |
|---|---|---|
| New Game | PASS | `initGame(true)` + `rpc_init_company`. Bug giorno-non-sincronizzato trovato e fixato ieri (PR #18, non mergiata) — vedi HANDOFF. |
| Login | PASS | Verificato live su 3 account reali (Admin API), tutte le 6 fasi di boot (`auth.js`) senza errori. |
| First Day | PASS | Era proprio lo scenario del bug PR #18 — ora verificato pulito (debito Vittorio resta esattamente €500, nessun tick spurio). |
| Daily Tick | PASS | `daily-tick.test.js` (no drift su chiamate ripetute) + verificato che non duplica su reload immediato. |
| Save | PASS | `saveSystem.js` → `game_saves` upsert. Verificato live: payload cloud combacia esattamente con lo stato in memoria. |
| Load | PASS | Verificato live: reload ripristina cash/giorno/autisti esatti, nessun autista orfano "busy". |
| Logout | — | Da verificare in questo blocco. |
| Reload | PASS | Verificato live 2 volte in sessioni diverse, nessuna corruzione. |

### ECONOMY

| Voce | Stato | Note |
|---|---|---|
| Cash | PASS | Server-authoritative sui path testati (RPC + `_bridgeToGameState`). Debito noto: 91+ mutazioni dirette client non passano da RPC — vedi `docs/ECONOMY_SERVER_AUTH.md`, resta `FIX_LATER` architetturale, fuori scope di un fix chirurgico. |
| Income | PASS | Guida manuale, corse, streak — verificato live. |
| Expenses | PASS | Interessi Vittorio, daily tick — verificato non duplica su chiamate ripetute. |
| Loans | — | Nessun test dedicato in `test/`. Da colmare in questo blocco. |
| Driver Coins | — | Coperto solo indirettamente (`daily-orders.test.js`). Da verificare esplicitamente. |
| Rewards | — | Login streak verificato live (una volta); claim ripetuto non ancora verificato. |
| Transactions | — | "Doppio click" già coperto per corse (`complete-ride.test.js` Scenario F) e bandi corporate; da confermare per loans/driver coins. |

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
