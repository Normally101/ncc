# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 28 maggio 2026 — dopo sessione debugging completo
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## Stato attuale

### Sessione debugging (28 maggio 2026) — COMPLETATA AL 90%

Eseguiti 3 round di debugging su tutto il codebase. Bug trovati e fixati:

#### ✅ BUG #1 — `buyRegion` non esportata (engine.js)
- `async function buyRegion()` non era `window.buyRegion`
- Chiamata da `onclick` in `ui-ops.js` → cliccando "Sblocca Regione" non succedeva nulla
- **Fix:** `window.buyRegion = async function buyRegion()`

#### ✅ BUG #2 — `rest()` non esportata (engine.js)
- `async function rest()` non era `window.rest`
- Chiamata dai pulsanti Hotel in `index.html` → riposo CEO non funzionava
- **Fix:** `window.rest = async function rest()`

#### ✅ BUG #3 — `payToRepairCar` non esportata (engine.js)
- Chiamata da `onclick` in `ui-staff.js` → bottone Ripara auto nel modal non funzionava
- **Fix:** `window.payToRepairCar = async function payToRepairCar()`

#### ✅ BUG #4 — `sellCar` non esportata (engine.js)
- Chiamata da `onclick` in `ui-staff.js` → bottone Vendi auto non funzionava
- **Fix:** `window.sellCar = async function sellCar()`

#### ✅ BUG #5 — `buyInvestment` non esportata (engine.js)
- Chiamata da `onclick` in `ui-investments.js` → acquisto investimenti non funzionava
- **Fix:** `window.buyInvestment = async function buyInvestment()`

#### ✅ BUG #6 — `hqOpenBuildModal` firma sbagliata (hq.js)
- `hq.js` chiamava `hqOpenBuildModal('${r.id}')` con 1 argomento (roomId)
- `hq-visual.js` (caricato dopo, vince) aspetta `(cityId, slotIndex)`
- Crash silenzioso: modale non si apriva
- **Fix:** aggiunto `window._hqBuildFromList(roomId)` che trova il primo slot libero nella città corrente e chiama `hqUpgradeRoom(cityId, roomId, slotIndex)`

### Versione script post-debugging
- `engine.js?v=8`
- `hq.js?v=8`
- Tutti gli altri: v=7 o v=6 (invariati)

---

## Cosa NON è stato fatto (interrotto)

Il debugging era al ~90% — mancano ancora:

### Round 3 incompleto
- [ ] `ui-home.js` — `_homeTimer` non viene mai cancellato quando si cambia tab (interval leak potenziale se renderTabHome viene chiamato più volte) → da investigare
- [ ] `p2p-render.js` — due `setInterval` in `p2pInit()` senza storage → OK perché `p2pInit` viene chiamato una sola volta da `auth.js`, ma verificare
- [ ] Scan completo di `engine-drivers.js` per logic bugs (skill tree, academy course)
- [ ] Scan `vip-clients.js` e `vip-buffs.js` per handler mancanti
- [ ] Verificare `showroom.js` — tab non ancora redesignato + eventuali bug onclick

### Non verificati (false positivi esclusi ma non confermati)
- `window.gameState` in `contracts.js:240` — guard in `dailyTick()`, sembra OK
- `serverState.js` usa `window.gameState` come guard — intenzionale

---

## Prossimi step nella prossima sessione

### 1. COMPLETA IL DEBUGGING (inizia da qui)
```
Continua Round 3:
- ui-home.js _homeTimer leak
- engine-drivers.js logic scan
- vip-clients.js / vip-buffs.js
- showroom.js onclick scan
- Poi: node --check su tutti i file ancora da verificare
```

### 2. UI REWRITE — Tab ancora con DS.*
- `ui-store.js` — Executive Club / showroom
- `ui-hub.js` — HQ buildings
- Verificare: `ui-emails.js`, `ui-ops.js`, `ui-legal.js`, `ui-home.js`, `ui-help.js`

### 3. VTK frontend
- UI Mercato VTK (SQL pronto, frontend manca)
- VTK Shop (item: slot_garage_7d, driver_stress_reset, rep_boost_01)

### 4. `/impeccable teach`
- Creare PRODUCT.md + DESIGN.md per abilitare i comandi impeccable strutturati

---

## Architettura critica da ricordare

```
gameState           → let in engine.js, NON è window.gameState
window.DS           → NON usare in nuovi tab — stile eRepublik flat inline
?v= scripts         → attualmente v=8 per engine.js e hq.js, v=7 per gli altri
career tab          → modal overlay (openCareerModal), NON tab inline
drag-drop dispatch  → class ops-ride-card e ops-driver-row su <tr> — NON rinominare
activeRides loop    → backward (length-1 → 0) + splice — corretto
```

## Pattern bug più comune trovato

**Funzioni `async function foo()` in engine.js NON esportate come `window.foo`.**
I `function` top-level diventano globali, ma le `async function` + le arrow functions no in strict mode.
Prima di aggiungere qualsiasi funzione chiamata da onclick, verificare che sia `window.foo = async function`.

## Skills di design
- `/taste-skill` → anti-slop, layout, gerarchia
- `/emil-design-eng` → micro-interactions, :active scale(0.97), ease-out
- `/impeccable` → review strutturata (manca PRODUCT.md — fare `/impeccable teach` prima)

## Versione attuale script
- `engine.js`: v=8 | `hq.js`: v=8
- Tutti gli altri modificati di recente: v=7
