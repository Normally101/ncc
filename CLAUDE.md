# Chauffeur Empire — Codebase Guide for Claude

Browser MMO gestionale di auto di lusso. Vanilla HTML/CSS/JS puro. Nessun framework, nessun bundler tranne Tailwind CLI. Backend Supabase (PostgreSQL + Realtime). Mappa Mapbox GL JS.

---

## Stack tecnico

| Layer | Tecnologia |
|---|---|
| Frontend | Vanilla JS (ES2020+, `'use strict'` ovunque) |
| Stile | `style.css` + `premium-ui.css` + `tailwind.min.css` (compilato) |
| Backend | Supabase (Postgres + Auth + Realtime + RPC) |
| Mappa | Mapbox GL JS v3.6 |
| Font | Montserrat (UI), Roboto Mono (numeri), Cinzel (titoli) |
| Deploy | GitHub Pages (`gh-pages` branch) |

---

## Architettura globale

### Stato di gioco — `window.gameState`

Tutto lo stato del gioco vive in **`gameState`** (definito in `engine.js:176`). È un oggetto globale mutato direttamente. Non c'è Redux, niente reactive. Ogni modulo legge/scrive `gameState` direttamente (mai `window.gameState` dall'interno di engine.js — è una `let` in scope locale).

**Oggetto completo `gameState` (engine.js:176–291):**
```js
let gameState = {
    cash: 5000, reputation: 0.0, energy: 100,
    day: 1,           // monotonic game-day counter (Day 1 = Nov 1 2025)
    month: 1,         // Italian real calendar month (1–12)
    hour: 8,          // Italian real clock hour (0–23)
    minute: 0,        // Italian real clock minute (0–59)
    paused: false,
    todayEarnings: 0,
    fleet: [],            // array veicoli
    drivers: [],          // array autisti (incl. CEO con id='ceo')
    staff: [],            // personale assunto
    investments: [],
    pendingRides: [],     // corse in attesa di assegnazione (cap: 15)
    activeRides: [],      // visual simulation loop
    activeTrips: [],      // real-time trips (checkActiveTrips → Supabase)
    emails: [],
    unlockedRegions: ['lazio'],
    nextId: 1,
    weather: 'sole', weatherHoursLeft: 6,
    activeCampaigns: [], brandVolume: 0, brandPrestige: 0,
    portfolioValueYesterday: 0, stockPrevPrices: {},
    activeFines: [], achievements: [], loans: [],
    fuelTank: 1000, fuelTankCapacity: 10000, fuelPrice: 1.85, fuelTankLevel: 1,
    depositoGomme: 0, seizedCars: [], policeHeat: 0,
    consecutiveRedDays: 0, blacklistedClients: [],
    hqLevel: 0, activeDynamicEvent: null, activeStrike: null,
    prestige: 0, pricewars: [], shadowMissionsTotal: 0,
    stockPrices: {}, stockHoldings: {}, stockHistory: {}, shortPositions: {},
    brokerInvestments: [], lifestyleAssets: [],
    creditScore: 300, totalDividendsEarned: 0, totalStockProfit: 0,
    diamondContractsCompleted: 0,
    inflationRate: 0.020, interestRateBase: 0.045,
    lobbyingPoints: 0, activeLobbyLaws: [],
    companyName: 'Chauffeur Empire', companyLogo: '👁️', companyColor: '#d4af37',
    loginStreak: 0, lastDailyClaim: null,
    lastOnlineTimestamp: 0,  // Unix ms — per offline catchup
    ventureCapital: [], annualProfitTracker: 0,
    cvWeeklyTarget: 8, cvWeeklyCompleted: 0, cvWeeklyStreak: 0,
    hq: { lng: null, lat: null, name: 'Garage Periferico', level: 0, region: null },
    pricingStrategy: 'standard',
    maintenanceContract: false, maintenanceContractPaidUntilDay: 0,
    weeklyEarnings: 0, weeklyRides: 0, weekStartDay: 1,
    executivePassActive: false, executivePassExpiresDay: 0,
    ownedHubs: [], hubTaxBalance: 0,
    driverAcademy: [], marketplace: [], npcMarket: [],
    activeAuction: null,
    holding: { incorporated: false, incorporationDay: 0, subsidiaries: [] },
    cempPrice: 10.0, cempShares: 10000, cempOwnedShares: 0, cempHistory: [],
    companyIPO: null,
    driverCoins: 50,
    questStats: {
        totalRides:0, vipRides:0, ultraRides:0, fcoRides:0,
        portRides:0, contractRides:0, portoCervoRides:0
    },
    constructions: [], claimableQuests: [], completedQuests: [],
    hasEVHub: false,
};
```

### Pattern moduli

Ogni file JS esporta funzioni via `window.*`. Non ci sono import/export ES module:
```js
// In qualsiasi file
window.myFunction = function(...) { ... };
// Chiamata da qualsiasi altro file
window.myFunction(args);
```

### Pattern tab / renderTab

Ogni tab di gioco ha una funzione `renderTab*()` nel suo file UI. `window.switchTab(name)` in `dispatcher.js` chiama la funzione corrispondente e inietta l'HTML in `#tab-container`.

```js
window.switchTab('fleet');   // → chiama renderTabFleet() da ui-fleet.js
window.switchTab('corse');   // → chiama renderTabCorse() da ui-dispatch.js
window.switchTab('finance'); // → chiama renderTabFinance() da ui-finance.js
```

La funzione `_safeRender(fn)` in `dispatcher.js` wrappa ogni chiamata con try/catch e anima con `.tab-fade-in` (CSS keyframe `tabFadeIn` in `style.css`).

---

## Ordine di caricamento script (CRITICO)

L'ordine in `index.html` definisce le dipendenze. Non spostare script senza verificare le dipendenze:

```
1.  security.js          — CE_Sec: escapeHTML, sanitize, escHtml()
2.  design-system.js     — window.DS (componenti), window.CE_Alert (alert in-game)
3.  supabase-config.js   — window.supabaseClient
4.  config.js            — window.GAME_CONFIG (SUPPORT_EMAIL, GAME_NAME, GAME_URL)
5.  geoCoords.js         — coordinate POI (587 righe)
6.  routesDB.js          — DB rotte (GROSSO — 17750 righe, NON leggere mai intero)
7.  data.js              — dati statici veicoli/staff (2270 righe, NON leggere mai intero)
8.  lang.js              — traduzioni
9.  syncManager.js       — sync multi-tab browser
10. saveSystem.js        — slot salvataggio, leaderboard, ServerState wrapper
11. serverState.js       — sync Supabase Realtime (companies, drivers, vehicles)
12. ui-landing.js        — landing page HTML + form auth UI (_showAuthOverlay, _authLogin, ecc.)
13. auth.js              — core autenticazione: _mmoBootSequence, _onAuthSuccess, bootstrap
14. quests-data.js       — QUEST_DB array statico (1509 righe, NON leggere mai intero), VG const
15. quests.js            — logica quest: checkQuestProgress, claimQuestReward, completeMissionRun
16. engine.js            — CORE: gameLoop, saveGame, loadGame, generazione corse (~3908 righe)
17. engine-finance.js    — tick mercato + AZIONI PLAYER: buyStocks, takeLoan, shortSell, ecc.
18. engine-drivers.js    — azioni autisti: hireDriver, sendDriverToRest, startAcademyCourse, ecc.
19. engine-fleet.js      — azioni flotta: repairVehicle, buyHub, buyStandardFuel, ecc.
20. engine-store.js      — DC boosters: fuelBoostDC, wakeDriverDC, activateExecutivePass, ecc.
21. engine-holding.js    — holding, sussidiarie, $CEMP, IPO NPC fallback
22. engine-rivals.js     — sistema rivali/NPC AI (148 righe)
23. engine-events.js     — eventi casuali, incidenti, strike, fines (386 righe)
24. vip-buffs.js         — buff system (_applyBuff, _getBuffValue) + helper VIP privati
25. vip-clients.js       — 9 handler clienti VIP + _vipOnComplete dispatcher
26. war_room.js          — province War Room, renderTabWarRoom
27. dispatcher.js        — switchTab routing, showNotification, togglePanel (~247 righe)
28. map.js               — Mapbox initMap, visual loop, garage 3D SVG, highway router (~992 righe)
29. ui-emails.js         — renderTabEmails
30. ui-marketing.js      — renderTabMarketing: Dual Brand, campagne, ROI tracker
31. ui-finance.js        — renderTabFinance: Bloomberg dashboard, stocks, broker, _flashTicker
32. ui-dispatch.js       — renderTabCorse (195 righe)
33. ui-fleet.js          — renderTabFleet, bulkRepairFleet (508 righe)
34. ui-staff.js          — renderTabStaff, openCarModal, openCarConfigurator, buyCar, leaseCar
35. ui-lifestyle.js      — renderTabLifestyle + Server Decrees (decreesRefresh, voteServerDecree)
36. ui-ops.js            — renderTabRegions, renderTabProvinces, buyHRAutomation, doAcquireProvince
37. ui-ranking.js        — renderTabRanking: classifica globale Supabase
38. ui-investments.js    — renderTabInvestments: infrastrutture, holding, finanza
39. ui-legal.js          — renderTabLegal: gestione multe e contenzioso
40. ui-politics.js       — renderTabPolitics: lobbying, decreti, macroeconomia
41. ui-career.js         — renderTabCareer, startMissionRun, _showBivioModal
42. ui-store.js          — renderTabPremiumStore, _dcSpend, EC action handlers
43. ui-market.js         — renderTabMarket: mercato P2P auto + aste live
44. ui-help.js           — renderTabHelp, renderCurrentTab
45. ui-hub.js            — Smart Hub: toggleHub, openHub, hubNavigate
46. ui-realestate.js     — renderTabRealEstate, doBuyRealEstate (Supabase)
47. ui-map-utils.js      — spawnMoneyParticles, day/night, HQ marker, founding overlay,
                            openAcademyModal, _traitBadgeHTML, traffic route colors
48. ui-sidebar.js        — accordion nav, _sidebarToggle, updateSidebarStats, toggleSidebar
49. showroom.js          — showroom auto, renderTabShowroom, SRM functions
50. p2p-market.js        — P2P backend: listCarForSale, buyP2PCar, createHolding, listCompanyIPO
51. p2p-render.js        — P2P UI: renderP2PMarketSection, renderP2PSharesSection, p2pInit
52. b2b.js               — contratti B2B
53. auctions.js          — aste giudiziarie
54. driver_skills.js     — albero skill autisti
55. global_events.js     — eventi globali MMO
56. black_ops.js         — agenzia ombra, SHADOW_OPS, shadowRefresh, shadowExecuteOp
57. crypto.js            — crypto/offshore
58. weather_real.js      — meteo reale (OpenWeather API)
59. hq.js                — costruzioni HQ, HQ_ROOMS, hqBuildRoom, hqHasRoom
60. mobile_dispatcher.js — UI mobile
61. hostile_takeover.js  — acquisizioni ostili, renderTabOPA
62. nemesis.js           — nemici VIP, renderTabNemesis
63. infrastructure.js    — carburante/depositi, renderTabInfrastructure
64. contracts.js         — gare d'appalto, renderTabContracts (496 righe)
65. tourism.js           — bandi turismo, renderTabTourism (485 righe)
66. tutorial.js          — onboarding
67. premium-ui.js        — hash routing (#tab → switchTab on load)
```

### File da NON caricare (obsoleti, tenuti come backup)
```
ui-meta.js        — SOSTITUITO da ui-ranking/investments/legal/politics/career/store/market/help/hub/realestate/map-utils.js
ui-finance-mkt.js — SOSTITUITO da ui-marketing.js + ui-finance.js
vip_clients.js    — SOSTITUITO da vip-buffs.js + vip-clients.js
p2p_market.js     — SOSTITUITO da p2p-market.js + p2p-render.js
```

---

## CSS — Architettura a 3 layer

```
tailwind.min.css   ← compilato da tailwind.input.css
                     rebuild: npx tailwindcss -i tailwind.input.css -o tailwind.min.css --minify
                     NON editare mai direttamente

style.css          ← TUTTO il CSS custom: variabili :root, layout, componenti, overrides Tailwind

premium-ui.css     ← overrides minimi: topbar blur, #main-panel left offset, scrollbar, mobile
                     Caricato DOPO style.css — usa !important con parsimonia
```

**Variabili CSS (`:root` in `style.css`):**
```css
:root {
    --gold:        #c9a227;
    --gold-dim:    rgba(201,162,39,0.12);
    --gold-border: rgba(201,162,39,0.30);
    --topbar:      #1e3a5f;
    --nav:         #1e2d45;
    --nav-dark:    #162030;
    --bg:          #e8eef5;      /* sfondo principale */
    --bg2:         #edf2f7;
    --bg3:         #f5f7fa;
    --panel:       #f0f4f8;      /* sfondo main-panel */
    --card:        #ffffff;
    --card-border: #e2e8f0;
    --sidebar-w:   160px;
    --topbar-h:    42px;
    --border:      rgba(0,0,0,0.10);
    --border-sub:  rgba(0,0,0,0.07);
    --border-gold: rgba(201,162,39,0.30);
    --shadow-sm:   0 1px 4px rgba(0,0,0,0.08);
    --shadow-md:   0 4px 16px rgba(0,0,0,0.12);
    --text:        #1a2744;      /* testo principale */
    --text-muted:  #4d6480;
    --text-dim:    #7a92a8;
}
```

**Layout fisso:**
- `#top-bar`: `height:42px`, `position:fixed top-0`, background `#1e3a5f` (navy steel-blue)
- `#sidebar-player`: `width:160px`, `position:fixed left-0 top:42px`, background `#1e2d45` (dark navy)
- `#main-panel`: `position:fixed left:160px top:42px` (impostato da `premium-ui.css`)
- `#news-ticker-wrap`: fixed bottom, `left:160px`

**Classi CSS importanti:**
- `ds-card`, `ds-kpi-strip`, `ds-table`, `ds-btn--*`, `ds-pill--*` → Design System (`design-system.js`)
- `ops-*` → Tab Dispatch (`style.css` ~riga 3000)
- `lp-*` → Landing page
- `ss-*` → Save slot screen
- `.sidebar-item`, `.sidebar-group-head`, `.sidebar-group-body` → Accordion nav
- `.tab-fade-in` → Animazione tab (`@keyframes tabFadeIn` in `style.css`)

**Overrides Tailwind in `#main-panel` (light theme):**
```css
#main-panel .text-white:not(button):not(.ds-btn) { color: #1a2744 !important; }
#main-panel .text-gray-200  { color: #2a3e58 !important; }
#main-panel .text-gray-300  { color: #2a3e58 !important; }
#main-panel .text-gray-400  { color: #4d6480 !important; }
#main-panel .bg-gray-900    { background: #e8ecf0 !important; }
#main-panel .bg-gray-800    { background: #e0e6ec !important; }
#main-panel .bg-gray-700    { background: #d8e2ed !important; }
#main-panel .bg-gray-600    { background: #dce6ef !important; }
#main-panel .bg-black\/50   { background: rgba(0,0,0,0.05) !important; }
#tab-container { color: var(--text); }
```
Le sezioni "career dark" (`bg-[#111120]`, `bg-[#0e0e1c]`) sono INTENZIONALMENTE scure — non sovrascrivere.

---

## File da NON leggere a meno che strettamente necessario

| File | Perché | Dimensione |
|---|---|---|
| `routesDB.js` | Array/oggetti statici di rotte pure | 17750 righe |
| `data.js` | Dati veicoli/staff/config statici | 2270 righe |
| `tailwind.min.css` | CSS compilato — non editare mai | ~500KB minificato |

---

## Globals chiave tra file

```js
window.gameState          // stato completo gioco (engine.js) — accesso da tutti i file
window.supabaseClient     // client Supabase (supabase-config.js)
window.GAME_CONFIG        // costanti configurazione (config.js)
window.DS                 // Design System components (design-system.js)
window.CE_Sec             // security helpers: escHtml(), sanitize() (security.js)
window.CE_Alert           // sistema alert in-game (design-system.js)
window.switchTab(name)    // navigazione tab (dispatcher.js)
window.showNotification(msg, type)  // toast notifica (dispatcher.js)
window.saveGame()         // salva su localStorage + cloud (engine.js)
window.serverState        // stato sync cloud (serverState.js) — deprecato, usa ServerState.*
window.ServerState        // oggetto con metodi cloud (saveSystem.js)
```

**GAME_CONFIG (config.js):**
```js
window.GAME_CONFIG = {
    SUPPORT_EMAIL:          'support@chauffeurempire.com',
    SUPPORT_SUBJECT_ACCESS: 'Problema%20di%20Accesso',
    SUPPORT_SUBJECT_BUG:    'Segnalazione%20Bug%20-%20ID%20Compagnia%3A%20',
    GAME_NAME:              'Chauffeur Empire',
    GAME_URL:               'https://www.chauffeurempire.com',
};
```

---

## engine.js — Funzioni e window.* exports (5252 righe, 89+ funzioni)

### Core gameplay
```js
window.saveGame()              // salva localStorage + cloud
window.loadGame()              // carica da localStorage
window.startGame(fresh)        // avvia partita (fresh=true = nuova)
window.initGame(isNew)         // inizializza stato dopo load
window.updateUI()              // aggiorna tutti gli elementi UI del topbar/sidebar
window.advanceTime()           // avanza tempo manualmente (deprecato con real-time)
window.generatePOIRide()       // genera corsa casuale
window.generateContractRide()  // genera corsa contrattuale
window.autoDispatchRides()     // assegna auto corse pending → driver disponibili
window.completeRide(ride, deferred) // completa corsa, calcola earnings
window.processDailyRoutines()  // routine giornaliere (investimenti, manutenzione, etc.)
```

### Real-time clock (engine.js:915)
```js
const GAME_EPOCH_MS = new Date('2025-11-01T00:00:00+01:00').getTime();
// Day 1 = 1 Nov 2025 (lancio gioco)

function _getItalyTime()  // → { hour, minute, day, month, year, gameDay }
// gameDay = giorni monotoni da epoch (non si resetta a 1 ogni mese)

function gameLoop()       // setInterval ogni 600ms — sync da _getItalyTime()
// hourly mechanics su real Italian hour boundary
// daily mechanics su game-day increment
// visual ride loop: elapsed += 5000ms, completes at ride.duration
```

### Azioni autisti
```js
window.hireDriver(driverData)
window.fireDriver(driverId)
window.setDriverAvatar(driverId, avatar)
window.assignSpecialty(driverId, specialty)
window.sendDriverToRest(driverId)
window.putDriverOnBreak(driverId)
window.payDriverBonus(driverId)
window.payStressClear(driverId)
window.startAcademyCourse(driverId, courseId)
window.skipAcademyTraining(driverId)
```

### Azioni flotta
```js
window.repairVehicle(vehicleId)
window.repairEngine(vehicleId)
window.refillTires(vehicleId)
window.superchargeVehicle(vehicleId)
window.applyVehicleSkin(vehicleId, skinId)
window.buyPrototypeCar(catalogId)
window.returnToHub(vehicleId)
window.emergencyRefuel(vehicleId)
window.buyBlackMarketFuel()
window.buyStandardFuel(liters)
window.instantRepairDC(vehicleId)        // usa DiamonCoin
window.buyCARUpgrade(vehicleId)
window.acceptGreyMarket(vehicleId)
```

### Finanza / investimenti
```js
window.takeLoan(tierId)
window.repayLoan(loanId)
window.buyStocks(ticker, qty)
window.sellStocks(ticker, qty)
window.placeBrokerInvestment(brokerId, amount)
window.shortSell(ticker, qty)
window.coverShort(ticker)
window.buyLifestyleAsset(assetId)
window.sellInvestment(invId)
window.acquireVentureStake(vcId)
window.divestVentureStake(vcId)
window.donateToLobby(amount)
window.passLobbyLaw(lawId)
```

### Holding / IPO / CEMP
```js
window.incorporateHolding()
window.acquireSubsidiary(subId)
window.divestSubsidiary(subId)
window.buyCempShares(qty)
window.sellCempShares(qty)
window._listCompanyIPO_NPC()
window.HOLDING_SUBSIDIARIES   // array catalogo sussidiarie
```

### Infrastructure / Hub / HQ
```js
window.buyHub(hubId)
window.sellHub(hubId)
window.buyFuelForDepot(liters)
window.upgradeFuelDepot()
window.buyTiresForDepot(qty)
window.getDepotLevelData()
window.speedUpConstruction(constructionId)
window.skipAllConstructionsDC()
```

### Marketing
```js
window.activateCampaign(campaignId)
window.deactivateCampaign(campaignId)
window._applyMarketingCampaign(campaignId)
window._stopMarketingCampaign(campaignId)
```

### Fines / Police
```js
window.payFine(fineId)
window.contestFine(fineId)
window.acceptShadowMission(missionId)
window.attackTerritory(provinceId)
window.respondPoaching(accept)
```

### Store / DiamonCoin
```js
window.fuelBoostDC()
window.wakeDriverDC(driverId)
window.energyBoostDC()
window.instaHealDC(driverId)
window.wakeAllDriversDC()
window.healAllDriversDC()
window.skipAllAcademyDC()
window.skipAllConstructionsDC()
window.opsBundleDC()
window.fullBundleDC()
```

### Misc
```js
window.setPricingStrategy(strategy)       // 'standard' | 'premium' | 'budget'
window.buyMaintenanceContract()
window.foundCompany(name, logo, color)
window.newGamePlus()
window.toggleBlacklist(clientId)
window.resolveStrike()
window.acceptDiamondContract()
window.setDriverAvatar(driverId, avatar)
window._claimDailyUI()
window._startGameWithSlot(slotIndex, fresh)
window.showBigEvent(eventData)
window.STELLAR_VOLT_CATALOG               // array veicoli Stellar/Volt
window.VEHICLE_SKINS                      // array skin disponibili
window.ACADEMY_COURSES                    // array corsi accademia
```

---

## dispatcher.js — Tab routing (~247 righe) + map.js — Mapbox (~992 righe)

`dispatcher.js` ora contiene solo: stato startup, `switchTab`, `showNotification`, `togglePanel`, `openMapOverlay`, `closeMapOverlay`.  
`map.js` contiene tutto il codice Mapbox: `initMap`, `visualLoop`, garage 3D SVG, highway router.

### switchTab routing completo

```js
switchTab('corse')        → renderTabCorse()           // ui-dispatch.js
switchTab('ranking')      → renderTabRanking()         // ui-ranking.js
switchTab('staff')        → renderTabStaff()           // ui-staff.js
switchTab('fleet')        → renderTabFleet()           // ui-fleet.js
switchTab('emails')       → renderTabEmails()          // ui-emails.js
switchTab('regions')      → renderTabRegions()         // ui-ops.js
switchTab('invest')       → renderTabInvestments()     // ui-investments.js
switchTab('marketing')    → renderTabMarketing()       // ui-marketing.js
switchTab('legal')        → renderTabLegal()           // ui-legal.js
switchTab('finance')      → renderTabFinance()         // ui-finance.js
switchTab('lifestyle')    → renderTabLifestyle()       // ui-lifestyle.js
switchTab('politics')     → renderTabPolitics()        // ui-politics.js
switchTab('career')       → renderTabCareer()          // ui-career.js
switchTab('store')        → renderTabPremiumStore()    // ui-store.js
switchTab('market')       → renderTabMarket()          // ui-market.js
switchTab('help')         → renderTabHelp()            // ui-help.js
switchTab('provinces')    → renderTabWarRoom()         // war_room.js
switchTab('showroom')     → renderTabShowroom()        // showroom.js
switchTab('realestate')   → renderTabRealEstate()      // ui-realestate.js
switchTab('b2b')          → renderTabB2B()             // b2b.js
switchTab('auctions')     → renderTabAuctions()        // auctions.js
switchTab('shadow')       → renderTabShadow()          // black_ops.js
switchTab('crypto')       → renderTabCrypto()          // crypto.js
switchTab('hq')           → renderTabHQ()              // hq.js
switchTab('opa')          → renderTabOPA()             // hostile_takeover.js
switchTab('nemesis')      → renderTabNemesis()         // nemesis.js
switchTab('infrastructure') → renderTabInfrastructure() // infrastructure.js
switchTab('contracts')    → renderTabContracts()       // contracts.js
switchTab('tourism')      → renderTabTourism()         // tourism.js
```

### Funzioni mappa
```js
window._fetchRoadGeom(fromLngLat, toLngLat)  // geometry Mapbox API
window.addIncidentMarker(lat, lng, driverName)
window.addCheckpointMarker(lat, lng, rideId)
window.removeCheckpointMarker(rideId)
window.openGarage3D(carId)
window.closeGarage3D()
window.openMapOverlay()
window.closeMapOverlay()
window.togglePanel()
window.showNotification(msg, type)  // type: 'success'|'error'|'info'|'warning'
```

---

## ui-sidebar.js — Accordion nav (120 righe)

```js
window._sidebarToggle(group)       // apre/chiude gruppo accordion
// groups: 'operativo' | 'business' | 'finanza' | 'potere' | 'info'

window._sidebarActivateTab(tab)    // evidenzia item attivo + aggiorna breadcrumb
window.updateSidebarStats()        // aggiorna avatar + company name nel sidebar
window.toggleSidebar(open)         // mobile: mostra/nasconde sidebar

// switchTab è patchato per chiamare _sidebarActivateTab automaticamente
// updateUI è patchato per chiamare updateSidebarStats automaticamente
```

**Tab → gruppo mapping:**
```js
const _SIDEBAR_GROUP = {
    corse:'operativo', fleet:'operativo', staff:'operativo',
    hq:'operativo', showroom:'operativo', emails:'operativo',
    b2b:'business', contracts:'business', tourism:'business',
    infrastructure:'business', store:'business', auctions:'business', market:'business',
    finance:'finanza', realestate:'finanza', crypto:'finanza', invest:'finanza', marketing:'finanza',
    provinces:'potere', regions:'potere', politics:'potere',
    shadow:'potere', nemesis:'potere', opa:'potere',
    ranking:'info', career:'info', legal:'info', help:'info',
};
```

---

## saveSystem.js — Salvataggio e Leaderboard

```js
window.currentSlotIndex       // sempre 0 (single save per account)
window.saveCurrentSlot()      // salva localStorage + sets lastOnlineTimestamp
window.pushLeaderboardNow(saveData)
window.forceLeaderboardUpdate()
window.forceCloudSave()
window.deleteSlot(index)
window.showNewGameSetup()
window.resetGame()
window.ServerState            // oggetto con metodi cloud sync
```

---

## serverState.js — Supabase Realtime (609 righe)

Gestisce la sync bidirezionale con Supabase. Tabelle sottoscritte: `companies`, `drivers`, `vehicles`, `active_trips`, `provinces`.

```js
window.serverState            // stato cloud locale (deprecato — usa window.ServerState)
window.forceSyncFromCloud()   // forza sync manuale da cloud
```

**Regola critica:** Il client legge `gameState` localmente. Le mutazioni di cash importanti (acquisto province, real estate, RPC) devono passare via RPC Supabase → Realtime callback → aggiorna gameState. **Non mutare `gameState.cash` direttamente per operazioni server-authoritative.**

---

## Supabase — Tabelle principali

| Tabella | Contenuto |
|---|---|
| `companies` | Dati azienda per utente (cash, reputation, fleet_count, prestige) |
| `drivers` | Autisti (legati a user_id) |
| `vehicles` | Veicoli |
| `active_trips` | Corse in corso (Realtime) |
| `provinces` | Territori, owner, transit_tax_pct, current_value |
| `market_listings` | Annunci mercato P2P |
| `shadow_ops` | Log operazioni ombra |
| `real_estate_listings` | Immobili disponibili |
| `leaderboard` | Classifica globale |

**RPC functions** prefissate `rpc_*`:
- `rpc_init_company` — crea record company per nuovo utente
- `rpc_get_shadow_ops_log` — log operazioni ombra
- `rpc_acquire_province` — acquisisce provincia (server-authoritative)
- `rpc_buy_real_estate` — acquisto immobile

---

## Real-time engine — Come funziona il tempo

**Epoch:** Day 1 = 1 Novembre 2025 (lancio gioco).

`gameState.day` è un **contatore monotono** (non si resetta a 1 ogni mese). `gameState.month` e `gameState.hour/minute` rispecchiano l'ora reale italiana.

**`gameLoop()` (ogni 600ms):**
1. Chiama `_getItalyTime()` → sync `hour`, `minute`, `month`, `day`
2. Se `hour !== _prevHour` → esegue meccaniche orarie (energia, meteo, stock, campagne)
3. Se `minute !== _prevMin && minute % 15 === 0` → tick AI rivali
4. Se `day !== _prevDay` → `processDailyRoutines()` (redditi, manutenzione, interessi)
5. Loop visual `activeRides`: elapsed += 5000ms (o 2500ms in traffic), completa a `ride.duration`

**Generazione corse:** ogni 5 min reali (POI), ogni 8 min (contratto). Queue cap: 15 pending.

**`_getRideDurationMs(ride)`:** durata reale trip = prezzo × 0.4 min (cap 10–360 min), con moltiplicatori per tipo e cross-region ×1.5.

**Offline catchup:** `saveGame()` salva `lastOnlineTimestamp`. Al reload, se offline > 1 giorno, chiama `processDailyRoutines()` una volta per ogni giorno perso (max 7).

---

## Pattern comuni

### Aggiungere una nuova azione di gioco
1. Aggiungere la funzione in `engine.js` (o nel sotto-engine appropriato)
2. Esportare con `window.myAction = function(...) { ... }`
3. Chiamare `saveGame()` alla fine se muta `gameState`
4. Se interagisce con Supabase per operazioni cash, usa `window.supabaseClient.rpc('rpc_name', args)`

### Aggiungere un nuovo tab UI
1. Creare `ui-newtab.js` con `window.renderTabNewTab = function() { ... }`
2. Aggiungere `<script src="ui-newtab.js?v=X">` in `index.html` dopo gli altri `ui-*.js`
3. Aggiungere case in `dispatcher.js` → `switchTab()` switch
4. Aggiungere `<a class="sidebar-item" data-tab="newtab" onclick="switchTab('newtab')">` nel sidebar HTML di `index.html`
5. Aggiungere mapping `newtab: 'grupponome'` in `_SIDEBAR_GROUP` di `ui-sidebar.js`

### Modificare il CSS
- Variabili tema → `:root` in `style.css` (prime ~35 righe)
- Componenti DS → `style.css` dopo riga ~3200
- Layout nav/sidebar/panel → `premium-ui.css`
- Sidebar accordion → `style.css` ultime righe (sezione `SIDEBAR ACCORDION`)
- **Non toccare** `tailwind.min.css` — ricompilare con: `npx tailwindcss -i tailwind.input.css -o tailwind.min.css --minify`

### Aggiungere CSS per una nuova feature
Se usi classi Tailwind hardcoded in template JS (es. `text-white`, `bg-gray-800`) che appaiono dentro `#main-panel`, devi aggiungere override in `style.css` nella sezione "Override hardcoded Tailwind dark" (~riga 3789).

---

## Note architetturali — Problemi noti

1. **`engine.js` ridotto** da 5252 a ~3908 righe — azioni player estratte in engine-drivers.js, engine-fleet.js, engine-store.js, engine-holding.js, engine-finance.js (actions).

2. **`ui-meta.js` splittato** in 11 file: ui-ranking, ui-investments, ui-legal, ui-politics, ui-career, ui-store, ui-market, ui-help, ui-hub, ui-realestate, ui-map-utils.

3. **Coupling tramite `window.*`** — 43/47 file espongono globals. Cambiare una funzione può rompere silenziosamente altri file. Non c'è type checking, niente linting.

4. **`gameState` mutato direttamente** — nessuna immutabilità, nessun observer. Bug di stato difficili da tracciare.

5. **CSS Tailwind hardcoded nei template JS** — `text-white`, `bg-black/50` etc. dentro template literal. Gli override in `style.css` coprono i casi principali ma non sono esaustivi. Ogni nuova feature che usa Tailwind dentro `#main-panel` richiede override manuale.

6. **`premium-ui.css` è l'ultimo layer** — caricato dopo `style.css`, ha `!important`. Se aggiungi regole qui che contraddicono il light theme, romperanno tutto. Usare con parsimonia.

7. **`dispatcher.js` ora slim** (1237 righe) — contiene solo: `switchTab`, mappa Mapbox, `showNotification`, alcune helper map functions. Tutti i `renderTab*` sono stati estratti in `ui-*.js`.

---

## Roadmap — Stato implementazione

### Piano: UI Overhaul + Modularizzazione dispatcher.js ✅ COMPLETATO
**File:** `docs/superpowers/plans/2026-05-21-ui-overhaul-modular.md`

Tutti i task completati (commits visibili in git log):
- ✅ CSS tokens aggiornati (`:root` variabili, `tabFadeIn` keyframe)
- ✅ Topbar 1-row slim (42px, steel-blue `#1e3a5f`)
- ✅ Sidebar accordion dark nav (160px, `#1e2d45`)
- ✅ `ui-sidebar.js` creato (accordion state machine)
- ✅ `premium-ui.css` ridotto a overrides minimi
- ✅ `premium-ui.js` ridotto a hash routing
- ✅ Tab fade-in animation (`_safeRender` patchato)
- ✅ `ui-dispatch.js`, `ui-fleet.js`, `ui-staff.js`, `ui-ops.js`, `ui-meta.js` creati
- ✅ `dispatcher.js` passato da ~4900 a 1237 righe

### Piano: Real-Time Engine + Light Theme Overhaul ✅ COMPLETATO
**File:** `docs/superpowers/plans/2026-05-21-realtime-theme-overhaul.md`

Tutti i task completati:
- ✅ `style.css` override `text-gray-300/400`, `bg-gray-700/600`, `#tab-container { color: var(--text) }`
- ✅ `ui-ops.js` region card fix (light bg `rgba(255,255,255,0.92)`)
- ✅ `index.html` topbar e sidebar riscritti
- ✅ `engine.js` `GAME_EPOCH_MS` + `_getItalyTime()`
- ✅ `engine.js` `gameLoop` riscritto (real-time Italian clock sync)
- ✅ `engine.js` `updateUI()` topbar date "Giorno N · DD Mmm"
- ✅ `engine.js` `_getRideDurationMs()` + sostituzione `_realMs` hardcoded
- ✅ `engine.js` ride generation 5/8 min reali, queue cap 15
- ✅ `engine.js` offline catchup (`lastOnlineTimestamp`, max 7 giorni)

### Piano: Province War + Real Estate + Features Pro ✅ COMPLETATO
**File:** `docs/superpowers/plans/2026-05-07-chauffeur-empire-upgrade.md`

Completato in precedente sessione.

### Piano: Engine + Dispatcher Modularization ✅ COMPLETATO
**File:** `docs/superpowers/plans/2026-05-19-modularize-engine-dispatcher.md`

Completato: `engine-finance.js`, `engine-rivals.js`, `engine-events.js`, `ui-emails.js`, `ui-finance-mkt.js` creati.

### Sicurezza ✅ COMPLETATO (Maggio 2026)
- ✅ RLS attivo su tutte le tabelle Supabase
- ✅ Trigger `validate_game_save` su `game_saves`: blocca cash > 500M, fleet > 100
- ✅ Trigger `validate_leaderboard` su `leaderboard`: blocca liquid_assets > 500M, fleet_count > 100
- ✅ Console.log con dati utente rimossi da produzione
- ✅ Nessuna `service_role key` esposta nel frontend

### Piano: Full Codebase Split ✅ COMPLETATO (Maggio 2026)

Tutti i file grandi sono stati spaccati in moduli più piccoli:
- ✅ `engine.js` 5253→3908 righe — actions estratte in engine-drivers/fleet/store/holding.js + engine-finance.js (actions)
- ✅ `ui-meta.js` 2057 righe → 11 file: ui-ranking/investments/legal/politics/career/store/market/help/hub/realestate/map-utils.js
- ✅ `dispatcher.js` 1237 righe → dispatcher.js (247) + map.js (992)
- ✅ `quests.js` 1579 righe → quests-data.js (data) + quests.js (logic, 81 righe)
- ✅ `p2p_market.js` 1029 righe → p2p-market.js (backend) + p2p-render.js (UI)
- ✅ `auth.js` 870 righe → ui-landing.js (HTML overlay) + auth.js (core boot)
- ✅ `vip_clients.js` 867 righe → vip-buffs.js (buff system) + vip-clients.js (handlers)
- ✅ `ui-finance-mkt.js` 716 righe → ui-marketing.js + ui-finance.js
- ✅ `ui-staff.js` 758 righe → ui-staff.js + ui-lifestyle.js

### Prossimi step tecnici (non pianificati)
- [ ] Rimuovere bottone "▶ Avanza Turno" dal sidebar HTML (obsoleto con real-time clock)
- [ ] Rate limiting server-side sulle RPC (province attacks, shadow ops) — configurabile da Supabase dashboard
- [ ] Considerare split ulteriore di `map.js` (992 righe) in map-visual.js + map-garage.js + map-router.js

---

## Visione espansione futura (roadmap contenuti)

> Confermato dall'utente — Maggio 2026

**Filosofia:** "Chauffeur Empire" è un nome intenzionalmente ampio. "Chauffeur" copre TUTTE le forme di guida/trasporto. Il gioco deve evolversi fino a contenerle tutte.

**Obiettivo core:** Gioco "povero → ricco" (poor to rich). Il giocatore deve poter iniziare con letteralmente niente e costruire un impero. Il Premium Shop accelera il progresso ma NON deve essere obbligatorio per giocare bene.

### Lane di gioco future (in ordine di priorità indicativa)

| Lane | Descrizione | Note architetturali |
|---|---|---|
| 🧑‍✈️ **Private Chauffeur** | Job di partenza — solo tu + 1 auto, niente shop richiesto | Entry point per nuovi giocatori |
| 🚖 **Taxi** | Trasporto urbano di massa, alto volume basso margine, dominio griglia città | Pricing model diverso da NCC |
| 🚛 **Truck / Logistics** | Merci, rotte lunghe, gestione depositi, contratti B2B logistica | Nuova categoria `fleet[]` |
| ✈️ / 🚢 | Jet privati, barche — espansione ultra-premium | Lungo termine |

### Impatto architetturale quando si aggiungono taxi/truck

```js
// Oggi: fleet[] assume sempre auto NCC di lusso
{ id: 'v1', brand: 'Mercedes', tier: 'premium', ... }

// Futuro: aggiungere vehicleClass a ogni veicolo
{ id: 'v1', vehicleClass: 'ncc' | 'taxi' | 'truck' | 'logistics', ... }

// pendingRides[] dovrà avere requiredClass per matchare il veicolo giusto
{ id: 'r1', requiredClass: 'taxi', price: 12, ... }
```

### Progressione "poor to rich"
- **Inizio:** 1 auto, tu guidi, niente staff, sopravvivenza pura
- **Early mid:** assumi 1 autista, seconda auto, contratti locali
- **Mid:** automazione parziale, sede, marketing
- **Late:** guerra finanziaria, province, politica, sabotaggio competitor
- **Endgame:** dominio assoluto — economia, leggi, infrastrutture, dati, politica del server

---

## File critici da leggere spesso

| File | Cosa contiene | Righe |
|---|---|---|
| `engine.js` | `gameLoop()`, `saveGame()`, `loadGame()`, core ride generation | ~3908 |
| `engine-finance.js` | tick mercato + buyStocks, takeLoan, shortSell, acquireVentureStake, ecc. | ~465 |
| `engine-drivers.js` | hireDriver, sendDriverToRest, startAcademyCourse, ecc. | ~194 |
| `engine-fleet.js` | repairVehicle, buyHub, buyStandardFuel, buyPrototypeCar, ecc. | ~507 |
| `engine-store.js` | DC boosters, activateExecutivePass, fullBundleDC, ecc. | ~214 |
| `engine-holding.js` | incorporateHolding, buyCempShares, _listCompanyIPO_NPC, ecc. | ~127 |
| `dispatcher.js` | `switchTab()`, `showNotification()`, `togglePanel()` | ~247 |
| `map.js` | Mapbox initMap, visualLoop, garage 3D SVG, highway router | ~992 |
| `ui-staff.js` | renderTabStaff, openCarModal, openCarConfigurator, buyCar, leaseCar | ~602 |
| `ui-lifestyle.js` | renderTabLifestyle + decreesRefresh, voteServerDecree | ~175 |
| `serverState.js` | Sync Supabase Realtime, ServerState | 609 |
| `style.css` | Tutto il CSS — tema, layout, componenti, overrides Tailwind | ~3900 |
| `premium-ui.css` | Override critici layout | 60 |
| `ui-sidebar.js` | Accordion nav, patch switchTab + updateUI | 120 |
