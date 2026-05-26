# Bug Audit — Fix Roadmap

> Audit completato il 2026-05-26. Due passate complete su tutto il codebase.
> **19 bug confermati** (1 falso positivo rimosso, 1 dead code).
> Pronto per essere eseguito con `subagent-driven-development`.

---

## Priorità di fix suggerita

1. **BUG 18** (window.gameState) — rompe CE_Alert, contracts, Supabase sync → fix prima di tutto
2. **BUG 10–14** (ui-home + ui-dispatch) — UI completamente broken per il giocatore
3. **BUG 6** (engine repair) — veicoli rientrano in servizio con motore rotto
4. **BUG 1** (hqGrid slot 7) — garage invisibile su nuova partita
5. **BUG 20** (rep cap prestige) — widespread, 13 location
6. Resto: moderato/minor

---

## BUG 1 — engine.js:578 — hqGrid slot 7 inesistente 🔴

**File:** `engine.js:578`

**Codice attuale:**
```js
if (!save.hqGrid) save.hqGrid = { 7: 'garage_main' };
```

**Problema:** Roma ha solo slot 0–3 (da `hq-data.js`). Il default di migrazione mette `garage_main` allo slot 7. Quando `hq.js:hqInit()` migra `hqGrid` → `hqs['roma'].grid`, il garage finisce a slot 7 che non esiste nella lista slot visuale. L'edificio è costruito ma invisibile nel campus.

**Fix:**
```js
if (!save.hqGrid) save.hqGrid = { 0: 'garage_main' };
```

**Test:** Nuova partita → tab HQ → Roma → il Garage deve essere visibile nel campus.

---

## BUG 2 — engine.js:1028 — Dead code (ℹ️ solo cleanup)

**File:** `engine.js:1028–1044`

**Problema:** `window.activateCampaign` e `window.deactivateCampaign` scrivono su `gameState.activeCampaign` (campo legacy stringa). Queste funzioni non vengono mai chiamate — `ui-marketing.js` usa `_applyMarketingCampaign()` e `gameState.activeCampaigns[]` (array).

**Fix:** Rimuovere le due funzioni `activateCampaign`/`deactivateCampaign` da `engine.js`.

---

## BUG 3 — engine.js:1668, 1736 — NGP reset incompleto 🟡

**File:** `engine.js` — funzioni `newGamePlus()` (riga ~1668) e `sellCompanyNGP()` (riga ~1736)

**Problema:** Il reset non azzera molti campi di `gameState` aggiunti dopo il sistema NGP originale. Campo sbagliato: resetta `activeCampaign: null` (morto) invece di `activeCampaigns: []`.

**Campi mancanti nel reset:**
- `hqs` → `{}` (e re-chiamare `hqInit()`)
- `currentHQCity` → `'roma'`
- `driverCoins` → `50`
- `questStats` → `{ totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 }`
- `loginStreak` → `0`
- `lastDailyClaim` → `null`
- `weeklyEarnings` → `0`
- `weeklyRides` → `0`
- `weekStartDay` → `1`
- `executivePassActive` → `false`
- `executivePassExpiresDay` → `0`
- `ownedHubs` → `[]`
- `hubTaxBalance` → `0`
- `driverAcademy` → `[]`
- `marketplace` → `[]`
- `activeAuction` → `null`
- `holding` → `{ incorporated: false, incorporationDay: 0, subsidiaries: [] }`
- `cempOwnedShares` → `0`
- `cempHistory` → `[]`
- `companyIPO` → `null`
- `activeCampaigns` → `[]` (NON `activeCampaign`)
- `activeTrips` → `[]` (solo in `sellCompanyNGP`)
- `vipNemeses` → `{}`
- `constructions` → `[]`
- `claimableQuests` → `[]`
- `completedQuests` → `[]`

**Fix:** Aggiungere i campi mancanti in entrambe le funzioni di reset.

---

## BUG 5 — engine-daily.js:312 — precedenza `|| 30` sbagliata 🟡

**File:** `engine-daily.js:312`

**Codice attuale:**
```js
const _closingDay = gameState.day - 1 || 30;
```

**Problema:** Al Giorno 1, `gameState.day - 1 = 0`, e `0 || 30 = 30`. Il closing day del giorno 1 diventa 30 invece di 0 (o il giorno precedente).

**Fix:**
```js
const _closingDay = (gameState.day - 1) || 0;
```

(Oppure: `gameState.day > 1 ? gameState.day - 1 : 1` se deve essere almeno 1.)

**Test:** Nuova partita → il report finanziario del giorno 1 deve mostrare giorno 0 o 1, non giorno 30.

---

## BUG 6 — engine-fleet.js:60 — repairVehicle cancella outOfService senza riparare il motore 🔴

**File:** `engine-fleet.js` — funzione `repairVehicle()`, riga ~60

**Codice attuale:**
```js
car.condition = 100;
car.outOfService = null;
// NON tocca car.engineHealth
```

**Problema:** Un veicolo con `engineHealth <= 0` e `outOfService = true` (motore in avaria) viene "riparato" dal tab Fleet con il tasto Ripara. `repairVehicle()` ripristina `condition` e azzera `outOfService`, ma `engineHealth` resta a 0. Il veicolo rientra in servizio con il motore distrutto.

**Fix:** Aggiungere in `repairVehicle()`, prima di azzerare `outOfService`:
```js
// Non rimuovere outOfService se il motore è ancora rotto
if (car.engineHealth !== undefined && car.engineHealth <= 0) {
    showNotification('Il motore è fuori uso — usa "Ripara Motore" prima.', 'error');
    return;
}
car.outOfService = null;
```

Oppure: far riparare anche il motore se `engineHealth <= 0` (applicando il costo aggiuntivo).

---

## BUG 7 — engine-events.js:220 — fine ZTL driverName contiene ID 🟢

**File:** `engine-events.js:220` (circa)

**Codice attuale:**
```js
const fine = {
    driverName: ride.driverId,   // stores "d3", non "Marco Ferretti"
    ...
};
```

**Fix:**
```js
const driver = (gameState.drivers || []).find(d => d.id === ride.driverId);
const fine = {
    driverName: driver ? driver.name : ride.driverId,
    ...
};
```

---

## BUG 8 — engine-rides.js:648 — ritardo traffico += 60ms invece di +1h 🟡

**File:** `engine-rides.js:648`

**Codice attuale:**
```js
if (ride.duration !== undefined) ride.duration += 60;
```

**Problema:** `ride.duration` è in millisecondi (range 20000–40000ms). Il traffico dovrebbe aggiungere 1 ora = 3.600.000ms, non 60ms.

**Fix:**
```js
if (ride.duration !== undefined) ride.duration += 3_600_000;
```

---

## BUG 9 — engine-rides.js:38/94 — surge a coda piena è dead code 🟢

**File:** `engine-rides.js:38` e `94`

**Problema:**
```js
if ((gameState.pendingRides || []).length >= 15) return null; // riga 38: uscita anticipata
const surgeMult = pending >= 15 ? 1.35 : ...; // riga 94: mai raggiunta se coda = 15
```

Il surge da coda piena (×1.35) non viene mai applicato perché la funzione esce prima.

**Fix (opzione A — rimuovere il surplus non necessario):** Eliminare la riga 94 con il caso `>= 15` (dead code).

**Fix (opzione B — applicare il surge prima del return):** Calcolare `surgeMult` prima del guard a riga 38 e usarlo nel messaggio o nella ride successiva.

---

## BUG 10–13 — ui-home.js — wrong field names per autisti 🔴

**File:** `ui-home.js:91, 140, 145, 151`

**Problema:** 4 bug correlati — tutti usano nomi di campo sbagliati:

| Riga | Codice sbagliato | Codice corretto |
|------|------------------|-----------------|
| 91 | `driver.vehicleId` | `driver.assignedCarId` |
| 140 | `d.status === 'driving'` | `d.status === 'busy'` |
| 145 | `d.vehicleId` | `d.assignedCarId` |
| 151 | `d.status === 'driving'` | `d.status === 'busy'` |

**Effetto:** ATTIVI sempre 0, tutti i veicoli mostrano "Nessun veicolo", tutti gli autisti occupati mostrano "Libero".

**Fix per riga 91:**
```js
const car = driver ? (gs.fleet||[]).find(v => v.id === driver.assignedCarId) : null;
```

**Fix per riga 140:**
```js
const driversOnDuty = (gs.drivers||[]).filter(d => d.status === 'busy' || d.status === 'idle');
```

**Fix per riga 145:**
```js
const car = (gs.fleet||[]).find(v => v.id === d.assignedCarId);
```

**Fix per riga 151:**
```js
if (d.status === 'busy') { statusLabel = 'In corsa'; statusColor = '#4ade80'; }
```

---

## BUG 14 — ui-dispatch.js:187 — drag-and-drop broken 🔴

**File:** `ui-dispatch.js:187–192`

**Codice attuale:**
```js
const card  = e.target.closest('.ride-card');    // classe inesistente
const dCard = e.target.closest('.driver-card');  // classe inesistente
```

**Classi reali nel DOM:**
- Le ride card usano: `.ops-ride-card`
- Le driver row usano: `.ops-driver-row`

**Fix:**
```js
const card  = e.target.closest('.ops-ride-card');
const dCard = e.target.closest('.ops-driver-row');
```

**Test:** Tab Corse → trascinare un autista su una corsa → deve assegnare la corsa.

---

## BUG 15 — engine-drivers.js:165 — fireDriver() senza saveGame() 🟢

**File:** `engine-drivers.js:165`

**Codice attuale:**
```js
window.fireDriver = function fireDriver(driverId) {
    gameState.drivers.splice(idx, 1);
    // manca saveGame()
};
```

**Fix:** Aggiungere `saveGame();` prima del return della funzione.

---

## BUG 16 — engine-fleet.js:61 — label sconto riparazione incompleta 🟢

**File:** `engine-fleet.js:61`

**Problema:** Quando si applicano sia il contratto manutenzione (−30%) che il Capo Officina (−50%), la label nel pulsante di riparazione mostra solo uno dei due sconti.

**Fix:** Mostrare entrambi i label se entrambi i modificatori sono attivi:
```js
let discLabel = '';
if (contractDisc < 1 && hasMech) discLabel = ' (−30% contratto + −50% Capo Officina)';
else if (contractDisc < 1) discLabel = ' (−30% contratto)';
else if (hasMech) discLabel = ' (−50% Capo Officina)';
```

---

## BUG 18 — serverState.js, design-system.js, contracts.js — window.gameState always undefined 🔴 CRITICO

**File:** `serverState.js:50,134,190,202,220` · `design-system.js:171,179` · `contracts.js:240`

**Problema:** `gameState` è dichiarato con `let` in `engine.js` — NON è `var`, quindi NON diventa `window.gameState`. Tutti i guard `if (window.gameState)` sono sempre `false`.

**Conseguenze:**
- `serverState.js:50` — prezzo carburante live da Supabase non applicato mai al gameState locale
- `serverState.js:134` — stessa cosa per aggiornamenti Realtime del carburante
- `serverState.js:190` (`_bridgeToGameState`) — cash, driverCoins, reputation, companyName non sincronizzati mai da Supabase
- `serverState.js:202` (`_bridgeFleetToGameState`) — posizioni veicoli non sincronizzate mai
- `serverState.js:220` (`_reconcileLocalRideOnClaim`) — corse completate non rimosse mai da `activeRides` localmente
- `design-system.js:171` — `CE_Alert.fire()` non esegue mai → tutti gli alert (cassa bassa, energia critica, sciopero, ecc.) sono completamente silenziosi
- `design-system.js:179` — `CE_Alert.tick()` non esegue mai
- `contracts.js:240` — `dailyTick()` non esegue mai → incassi contratti B2B, scadenze e generazione bandi non vengono processati

**Fix pattern:** In `serverState.js` e `contracts.js`, sostituire ogni occorrenza:
```js
// SBAGLIATO
if (!window.gameState) return;
const gs = window.gameState;

// CORRETTO — usare la funzione getter oppure importare via riferimento
// Opzione A: accedere tramite una funzione getter in engine.js
window.getGameState = function() { return gameState; };

// Poi in serverState.js / contracts.js:
const gs = (typeof window.getGameState === 'function') ? window.getGameState() : null;
if (!gs) return;
```

**Fix alternativo (più semplice):** In `engine.js`, dopo la dichiarazione `let gameState = { ... }`, aggiungere:
```js
// Rendi gameState accessibile cross-file tramite getter
Object.defineProperty(window, 'gameState', {
    get() { return gameState; },
    configurable: true,
});
```
Questo espone `window.gameState` come getter senza spezzare la `let` locale.

**Nota:** `design-system.js` è caricato PRIMA di `engine.js`, quindi il getter va chiamato lazily (già lo fa con `if (window.gameState)`), quindi una volta che `engine.js` definisce il getter, i check successivi funzioneranno.

---

## BUG 19 — ui-staff.js:281 — costo riparazione mostrato diverso da quello applicato 🟡

**File:** `ui-staff.js:281` (modal Fleet) e `engine-fleet.js` (funzione `repairVehicle`)

**Problema A — costi diversi:**
- `ui-staff.js:281`: mostra `(100 - car.condition) * 25` → per 50 punti mancanti = €1.250
- `engine-fleet.js`: applica `Math.max(500, missingPoints * 85)` → per 50 punti mancanti = €4.250

Il giocatore vede €1.250, paga €4.250.

**Fix:** Allineare il calcolo di preview nel modal a quello effettivo:
```js
const missingPoints = 100 - car.condition;
const repairCost = Math.max(500, missingPoints * 85); // stessa formula di engine-fleet.js
```

**Problema B — silent fail senza `_serverId`:**
`payToRepairCar` chiama `window.ServerState?.repairVehicle(car._serverId, ...)` — se `car._serverId` è undefined (veicoli locali non ancora sincronizzati), la chiamata silenziosamente non fa nulla ma deduce il cash.

**Fix B:** Verificare `car._serverId` prima di chiamare ServerState, oppure fare fallback a `repairVehicle()` locale se `_serverId` manca.

---

## BUG 20 — 13 location — reputation cap ignora prestige 🟡

**Problema:** `Math.min(5.0, gameState.reputation + delta)` dovunque. Il prestige permette reputazione > 5.0 ma questi cap la bloccano a 5.0.

**Correzione universale:** sostituire `Math.min(5.0, ...)` con `Math.min(5.0 + (gameState.prestige || 0), ...)`.

**Location complete (13 righe):**

| File | Riga | Contesto |
|------|------|---------|
| `engine-daily.js` | 588 | Daily routines — general rep tick |
| `engine-daily.js` | 699 | Philanthropy event |
| `engine-daily.js` | 749 | Daily income rep gain |
| `engine-daily.js` | 1000 | Email event response |
| `engine-daily.js` | 1024 | Email bivio choice |
| `engine-daily.js` | 1031 | Email action reward |
| `engine-events.js` | 372 | Random event positive outcome |
| `engine-events.js` | 382 | VIP event completion |
| `engine-rides.js` | 612 | VIP rep gain da skill `dip_3` |
| `engine.js` | 158 | Marketing campaign rep bonus |
| `engine.js` | 1575 | Grey market item rep reward |
| `hq.js` | 172 | VIP Lounge `reputationBonus` on build |
| `b2b.js` | 148 | B2B contract completion |
| `engine-finance.js` | 323 | ⚠️ Peggiore: usa `Math.min(10, ...)` invece di 5.0 |

---

## Checklist fix in ordine di priorità

- [x] **BUG 18** — `Object.defineProperty` getter `window.gameState` in `engine.js:295`
- [x] **BUG 14** — `ui-dispatch.js:188-192` — `.ride-card` → `.ops-ride-card`, `.driver-card` → `.ops-driver-row`
- [x] **BUG 10–13** — `ui-home.js:91,140,145,151` — `vehicleId` → `assignedCarId`, `'driving'` → `'busy'`
- [x] **BUG 6** — `engine-fleet.js:57-60` — blocca `repairVehicle` se `engineHealth <= 0`, label sconto combinato
- [x] **BUG 1** — `engine.js:584` — `{ 7: 'garage_main' }` → `{ 0: 'garage_main' }`
- [x] **BUG 20** — 13 occorrenze `Math.min(5.0, ...)` → `Math.min(5.0 + prestige, ...)` in 7 file
- [x] **BUG 19** — `ui-staff.js:281` — formula preview allineata a `engine-fleet.js` (max(500, missing×85) × sconti)
- [x] **BUG 3** — `engine.js:1682/1735` — reset NGP completo con tutti i campi mancanti + `hqInit()`
- [x] **BUG 5** — `engine-daily.js:312` — `|| 30` → `|| 0`
- [x] **BUG 8** — `engine-rides.js:648` — `+= 60` → `+= 3_600_000`
- [x] **BUG 7** — `engine-events.js:214` — lookup nome autista per multa ZTL
- [x] **BUG 15** — `engine-drivers.js:167` — `saveGame()` aggiunto in `fireDriver()`
- [x] **BUG 16** — `engine-fleet.js:61` — label sconto combinato (già fixato in BUG 6)
- [x] **BUG 9** — `engine-rides.js:94` — rimosso caso `>= 15` dead code dal surge
- [x] **BUG 2** — `engine.js` — rimosso `activateCampaign`/`deactivateCampaign` dead code
