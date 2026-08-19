# Registro delle azioni — un'azione, una funzione

> **Regola 4 del criterio uniforme.** Una stessa azione di gioco deve avere **una sola**
> implementazione. Quando ne esistono due, prima o poi divergono in silenzio: prezzi diversi,
> sconti diversi, e una che sincronizza col server mentre l'altra no. È già successo.
>
> Prima di aggiungere una funzione che compra, vende, ripara, paga o premia: **cerca qui**.
> Se l'azione c'è già, estendi quella. Se la aggiungi, scrivila qui.

Origine: analisi completa dei 93 file del 19/08/2026 — **29 gruppi di duplicazione**, 21 da
collassare, **34 funzioni morte**, 4 nomi globali sovrascritti in silenzio.

---

## Azioni consolidate (fatto)

| Azione | Funzione canonica | Ritirate | Note |
|---|---|---|---|
| Riparare la carrozzeria | `payToRepairCar` (engine.js) | ~~`repairVehicle`~~ (engine-fleet.js) | Prezzo da `repairCostFor()`, **fonte unica**. Le interfacce non devono ricopiare la formula |
| Muovere denaro / DC / reputazione | `CE_money.*` (money.js) | `gameState.cash -=` diretto, `_addCash` | Sorvegliato da `test/guardrail/una-sola-porta.test.js` |
| Effetti HQ | `hqAllEffects` (hq.js) | ~~`hqGetEffect`~~ | HQ dietro interruttore spento |

---

## Azioni da consolidare (aperte)

Ordinate per gravità. Ognuna è un task.

### Denaro non sincronizzato — 19 azioni confermate
`engine-store.js` (12 funzioni DC), `engine-holding.js`, `engine-fleet.js`, `engine-drivers.js`,
`engine-finance.js`, `contracts.js`, `daily-orders.js`. Vedi la lista `ECCEZIONI` in
`test/guardrail/una-sola-porta.test.js`: è la lista di lavoro, e **può solo accorciarsi**.

### Doppioni con prezzi divergenti

| Azione | Implementazioni | Problema |
|---|---|---|
| Rifornire carburante | 6 (`buyStandardFuel`†, `buyBlackMarketFuel`†, `buyFuelForDepot`, `emergencyRefuel`, `fuelBoostDC`, item VTK) | 3 orfane; le vive non sincronizzano |
| Azzerare stress autista | 6 | **5 prezzi diversi**: lo stesso effetto costa 2 DC o 25 DC |
| Ripristinare energia CEO | 5 | La sola cablata (`energyBoostDC`) è l'unica senza RPC → **energia gratis** |
| Comprare un veicolo | 6 | `buyPrototypeCar` e `buyNpcCar` non chiamano il server |
| Premiare `{cash, dc, rep, vtk}` | 5 | Solo `claimQuestReward` è completo; `claimDailyOrder` ha due bug |

† orfana

### Sistemi paralleli interi, entrambi vivi

| Sistema | Locale (senza server) | Server | Dove si scontrano |
|---|---|---|---|
| Holding | `engine-holding.js` | `p2p-market.js` | Stessa tab `ui-investments.js` |
| Consorzio | `alliances.js` | `p2p-render.js` | Tabelle DB diverse, stesso nome |
| Azioni societarie / IPO | `engine-holding.js` | `p2p-market.js` | **Due scrittori per `gameState.companyIPO`** |

---

## Nomi globali sovrascritti in silenzio

L'ultimo file caricato vince, senza errori. Da risolvere:

| Nome | Vince | Perde | Perché è un problema |
|---|---|---|---|
| `hqOpenBuildModal` | `hq-visual.js:88` | `hq.js:321` | **Firme incompatibili**: chi passa un `roomId` costruisce nella città sbagliata |
| `listCarForSale` | `p2p-market.js:60` | `engine-fleet.js:455` | Due magazzini diversi; `cancelListing` opera sull'altro |
| `renderTabProvinces` | `ui-ops.js:268` | `war_room.js:495` | Stessa tab, **due schermate diverse** |
| `_updateActiveRouteLines` | `ui-map-utils.js:164` | `map.js:343` | Minore |

**Da NON toccare** — sembrano collisioni a una scansione per nome, ma sono decoratori
deliberati e corretti: `switchTab`, `updateUI`, `showNotification`, `processDailyRoutines`,
`resetGame`.

---

## Codice morto (34 funzioni)

Definite e mai chiamate — controllato anche in `index.html`, nelle stringhe template e nei nomi
`data-ce-act`. I blocchi più grossi: il configuratore auto di `ui-staff.js` (`buyCar`,
`openCarConfigurator`, `leaseCar` — circa 185 righe), l'intero `mobile_dispatcher.js` (che però
**tiene ancora acceso un `setInterval` ogni 10 secondi**), e in `serverState.js` una quindicina
di RPC esportate che nessuno chiama perché hanno tutte un gemello locale non autoritativo
(`takeLoan`, `repayLoan`, `startTrip`, `collectDailyCosts`, `toggleTelepass`…).

Rimosse finora: `hqGetEffect`, `repairVehicle`.
