# Chauffeur Empire — Architettura dettagliata (reference ON-DEMAND)

> Spostato da CLAUDE.md il 16/06/26 per alleggerire il contesto auto-caricato (era ~14.5k token a OGNI messaggio). **Leggi questo file SOLO quando serve il dettaglio profondo** (struttura interna engine.js/map.js, ordine di caricamento dei 60 script, bug-log storico, architettura HQ/Quest). Le regole critiche + i pointer stanno in CLAUDE.md (lean). Il design vive nel vault Obsidian.

---

# Chauffeur Empire — Codebase Guide for Claude / Gemini

Browser MMO gestionale di auto di lusso. Vanilla HTML/CSS/JS puro. Nessun framework, nessun bundler tranne Tailwind CLI. Backend Supabase (PostgreSQL + Realtime). Mappa Mapbox GL JS.

> **Nota per l'AI:** Questo file è la fonte di verità del progetto. Aggiornarlo dopo ogni sessione di lavoro significativa. Leggilo sempre per intero prima di fare modifiche.

> **AGGIORNAMENTO GIUGNO 2026 (dettagli in HANDOFF.md):** Tutte le tab sono ora **light** (kit `.em`, Fase 3 completata). Aggiunto lo strato **MMO/retention/social/anti-cheat**, tutto live: nuovi file `world-feed.js` (feed Mondo NCC reale+NPC + striscia conflitto), `daily-orders.js`, `onboarding.js` (soft-lock progressivo + checklist), `alliances.js` (tab **`consorzi`** su RPC Supabase: roster/tesoro/chat realtime), `vanity.js` (tab **`prestigio`**: cosmetici DC). `ui-ranking.js` rank per **Punteggio Potere** (metriche server = anti-cheat). Sfondo globale = skyline Milano su `#app-body.em-shell` (main-panel trasparente). Deploy: **Vercel auto-deploy da `main`** (NON GitHub Pages; `.vercelignore` esclude i file interni). Nuove route `switchTab`: `consorzi`→renderTabConsorzi, `prestigio`→renderTabPrestigio. SQL ancora da eseguire su Supabase: perk di consorzio (ALTER alliances + rpc_activate_alliance_perk) per dare senso alle donazioni.

---

## PROTOCOLLO SESSIONE — Leggi questo PRIMA di tutto il resto

### All'inizio di ogni sessione (OBBLIGATORIO)

Esegui questi 3 step in ordine prima di rispondere a qualsiasi richiesta:

1. **Leggi `HANDOFF.md`** nella root del progetto — contiene esattamente cosa è stato fatto nell'ultima sessione, cosa manca, decisioni architetturali prese. Se non esiste, vai al passo 2.
2. **`git log --oneline -5`** — vedi gli ultimi commit per capire lo stato del lavoro.
3. **Leggi i memory files** in `/Users/vlad/.claude/projects/-Users-vlad-Documents-ncc-game/memory/` — contengono profilo utente, stile visivo, skills, VTK economy.

Non chiedere mai "dove eravamo?" — derivalo dai file sopra.

Se l'utente scrive "continua" senza altro contesto: leggi HANDOFF.md + git log, poi riprendi esattamente dal punto in cui si era interrotto.

### Durante ogni sessione

- Stile visivo: sempre **eRepublik flat** (vedi sezione dedicata più avanti)
- MAI usare `DS.*` helpers nei tab JS (DS.header, DS.kpiStrip, DS.card, DS.btn, ecc.)
- Bump `?v=` in index.html per ogni file JS modificato prima di committare
- Usare le 3 skills installate per decisioni di design (vedi sezione Skills)

### A fine sessione (OBBLIGATORIO)

Aggiorna `HANDOFF.md` con:
- Cosa è stato fatto in questa sessione (bullet precisi)
- Stato attuale di ogni feature in lavorazione
- Prossimi step concreti (cosa fare nella prossima sessione)
- Eventuali decisioni architetturali prese

Poi aggiorna i memory files rilevanti in `/Users/vlad/.claude/projects/-Users-vlad-Documents-ncc-game/memory/` se qualcosa è cambiato (design, VTK, feedback).

---

## SKILLS INSTALLATE — Quale usare per cosa

Il catalogo completo è in `/Users/vlad/.claude/projects/-Users-vlad-Documents-ncc-game/memory/skills_installate.md`.
Qui il riferimento rapido per le situazioni più comuni di questo progetto:

### Coding & Logic
| Situazione | Skill |
|---|---|
| Bug, crash, errore runtime JS/Supabase | `/debugging` |
| Modellare stati complessi (driver FSM, ride cycle) | `/state-machine` |
| Output troncato su file lunghi | `/output-skill` |

### UI Rewrite & Redesign (tab eRepublik)
| Situazione | Skill |
|---|---|
| Riscrivere tab da DS.* a eRepublik flat | `/redesign-skill` poi `/impeccable craft [tab]` |
| UI sembra generica o "AI-made" | `/taste-skill` |
| Review visivo pre-commit | `/impeccable polish [target]` |
| Design troppo piatto → più carattere | `/impeccable bolder [target]` |
| Da screenshot → codice | `/image-to-code-skill` |

### Micro-interactions & Animazioni
| Situazione | Skill |
|---|---|
| :active, hover, transizioni bottoni | `/emil-design-eng` |
| Animare modal, tab, lista | `/animation-principles` |
| Duration/easing sistematici | `/motion-system` |

### Componenti specifici
| Situazione | Skill |
|---|---|
| Loading skeleton per fetch Supabase | `/loading-states` |
| Errori RPC, validazione form | `/error-handling-ux` |
| Toast, notifiche, feedback azioni | `/feedback-patterns` |
| Form modal (acquisto, hiring) | `/form-design` |
| Grafici stock, sparkline, charts | `/data-visualization` |

### Game Design & UX
| Situazione | Skill |
|---|---|
| Loop engagement, daily rewards, streak | `/hooked-ux` |
| Quante opzioni in un menu | `/hicks-law` |
| Chunking KPI, card layout | `/millers-law` |
| Far risaltare CTA critica | `/von-restorff-effect` |
| Usability review completo tab | `/ux-heuristics` |
| Brainstorming nuova feature | `/brainstorming` |

### Setup impeccable (richiede PRODUCT.md + DESIGN.md)
**Stato: NON ancora creati.** Eseguire `/impeccable teach` prima di usare `craft/polish/bolder/audit/animate`.

---

## STILE VISIVO — eRepublik Flat (REGOLA ASSOLUTA)

Tutto il frontend di gioco usa questo stile. Non deviare mai.

### Palette

```
Background pagina:  #0d1117
Card background:    #161b22
Card border:        1px solid #21262d
Testo primario:     #e6edf3
Testo muted:        #8b949e
Testo dim:          #6b7280
Gold (testo):       #d4af37
Gold (border):      #b8962b
Gold (background):  #1a1608
Green:              #3fb950
Blue:               #58a6ff
Red:                #f85149
Font mono:          font-family: monospace
```

### Regole

- **Zero** neon, glow, box-shadow decorativo, glassmorphism
- **Tutto inline style** nei file JS — no Tailwind classes, no DS.* helpers
- Border-radius: max `6px` su card, `4px` su button/input
- Bottone gold: `background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px`
- Bottone ghost: `background:#161b22;border:1px solid #21262d;color:#8b949e;padding:5px 12px`
- Bottone destructive: `background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149`
- Header sezione: `font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em`
- KPI strip: `display:grid;grid-template-columns:repeat(4,1fr);gap:8px`
- Tabelle: `border-collapse:collapse`, TH `font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;padding:7px 14px;border-bottom:1px solid #21262d`
- TD: `padding:8px 14px;border-bottom:1px solid #161b22;font-size:11px;color:#e6edf3`
- Micro-interaction press-feedback: ora GLOBALE via CSS in `style.css` (`button:active:not(:disabled){transform:scale(0.97)}`). Copre tutti i `<button>` automaticamente — non serve più aggiungerla inline su ogni bottone. Vedi DESIGN.md sezione "Micro-interaction rule".

### Componenti pattern (copy-paste)

**Card:**
```html
<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:16px">
```

**KPI item:**
```html
<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
  <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">LABEL</div>
  <div style="font-size:20px;font-weight:700;color:#e6edf3;font-family:monospace">VALUE</div>
</div>
```

**Sezione header:**
```html
<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #21262d">TITOLO SEZIONE</div>
```

**Tabella TH helper (in JS):**
```js
const _TH  = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
const _THR = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
```

### Tab completati (stile eRepublik)

✅ ui-fleet.js · ui-staff.js · ui-dispatch.js · ui-finance.js · ui-ranking.js
✅ ui-career.js (modal overlay, non tab inline)
✅ ui-politics.js · ui-market.js · ui-investments.js · ui-realestate.js · ui-lifestyle.js · ui-marketing.js

### Tab ancora DA rifare (usano ancora DS.*)

- `ui-store.js` — Executive Club / showroom
- `ui-hub.js` — HQ buildings
- Verificare: `ui-emails.js`, `ui-ops.js`, `ui-legal.js`, `ui-home.js`, `ui-help.js`

---

---

## Stack tecnico

| Layer | Tecnologia |
|---|---|
| Frontend | Vanilla JS (ES2020+, `'use strict'` ovunque) |
| Stile | `style.css` + `premium-ui.css` + `tailwind.min.css` (compilato) |
| Backend | Supabase (Postgres + Auth + Realtime + RPC) |
| Mappa | Mapbox GL JS v3.6 |
| Font | Montserrat (UI), Roboto Mono (numeri), Cinzel (titoli) |
| Deploy | **Vercel** (auto-deploy da `main`) → `https://www.chauffeurempire.com` · `.vercelignore` esclude i file interni (NON è GitHub Pages) |
| Repo | `https://github.com/Normally101/ncc` (branch `main`) |

---

## REGOLE CRITICHE — Leggi prima di scrivere qualsiasi codice

### 1. `var` vs `let`/`const` per le shared globals

In browser script (non-module), `var` al top-level diventa `window.X`. `let`/`const` NO.

```js
// ✅ CORRETTO — accessibile da tutti i file
var map = null;           // → window.map accessibile da ui-meta.js, engine.js, ecc.

// ❌ SBAGLIATO — rimane privato al file dove è dichiarato
let map = null;           // → NON è window.map, altri file non lo vedono
const QUEST_DB = [...];   // → NON è window.QUEST_DB se dichiarato localmente
```

**Regola:** ogni variabile che deve essere condivisa tra file deve essere:
- `var` al top-level, oppure
- `window.X = value` esplicitamente

### 2. Niente `const`/`let` globale duplicati tra file

Se `quests-data.js` dichiara `const QUEST_DB = [...]`, e `quests.js` (caricato dopo) tenta di ridichiarare `const QUEST_DB`, in strict mode si ottiene `SyntaxError` → il secondo file non esegue affatto.

**Regola:** ogni costante/variabile dichiarata in un file è locale a quel file (a meno che non sia `var`). Se un altro file la vuole, deve leggere `window.NOME`.

### 3. Cache-busting — versioni `?v=N` in index.html

Ogni script ha `?v=N` nella tag `<script>`. Quando cambi un file JS:
- Se il file è cambiato significativamente, bumpa il suo `?v=` (es. `?v=4` → `?v=5`)
- Se la CDN/GitHub Pages sembra servire vecchio contenuto, bumpa TUTTI a `?v=N+1`

```bash
# Bumpa tutte le versioni a v=6 (esempio):
python3 -c "
import re
with open('index.html') as f: c = f.read()
with open('index.html', 'w') as f: f.write(re.sub(r'\?v=\d+', '?v=6', c))
"
```

**Versione attuale:** `?v=5` (bumped in sessione Maggio 2026)

### 4. Funzioni tra file — sempre `window.X`

```js
// Esportare da qualsiasi file:
window.myFunction = function(args) { ... };

// Chiamare da qualsiasi altro file:
if (typeof window.myFunction === 'function') window.myFunction(args);
// oppure semplicemente:
window.myFunction(args);
```

**Regola difensiva:** prima di chiamare una funzione di un altro file, wrappa con `typeof ... === 'function'` se c'è rischio che il file non sia caricato.

### 5. Ordine di caricamento script — non spostare tag senza verificare dipendenze

Vedi sezione "Ordine di caricamento script" più avanti.

### 6. Il denaro si muove solo da `CE_money` (money.js)

`money.js` espone `window.CE_money`: l'unica porta legale per cash, Driver Coins e reputazione.
- `spend/earn` muovono il saldo e comunicano il nuovo valore al server (`ServerState.syncCash`); `spendDC/earnDC` passano dalle RPC dedicate e riallineano il locale sul saldo che il server RESTITUISCE; `addReputation` applica da sola il tetto corretto `5.0 + prestige` (non `5`).
- Quando è la RPC del server ad aver GIÀ mosso `companies.cash` (aste giudiziarie, OPA, P2P, crypto, consorzi, infrastrutture...), NON chiamare `spend/earn`: rispedirebbero al server un totale calcolato dal browser. Servono `addebitatoDalServer` / `accreditatoDalServer`, che aggiornano solo la previsione locale SENZA risincronizzare.

Scavalcare la porta significa comprare gratis: la spesa fatta solo in locale torna indietro al primo overwrite del server, mentre l'oggetto comprato resta. La sorveglianza non è la buona volontà: `test/guardrail/una-sola-porta.test.js` fallisce se cash/driverCoins/vtkBalance si muovono fuori da money.js (la sua lista ECCEZIONI può solo accorciarsi); il contratto di `CE_money` è collaudato in `test/guardrail/money.test.js`.

### 7. Gli interruttori delle funzioni (config.js) — acceso = verificato

Dal 20/08/2026 la regola è invertita: una parte del gioco si mostra SOLO se qualcuno l'ha verificata. In `config.js`:
- `window.FEATURES` — mappa nome→bool (`corse`, `flotta`, `aste`, ...). Una voce passa a true solo quando: le sue azioni sono state eseguite tutte nel banco di prova (`test/funzioni/`), quelle che muovono denaro passano da `CE_money`, e un test le sorveglia da lì in avanti. Da quel momento non si torna indietro.
- `window.attiva(nome)` — una funzione è attiva? Sconosciuta = spenta: nel dubbio non si mostra.
- `window.TAB_DI` — a quale funzione appartiene ogni scheda. Una scheda assente dalla mappa è nucleo e resta sempre visibile; due schede possono dipendere dalla stessa funzione (`politics` + `provinces` → `politica`) e sparire insieme.
- `window.tabSpenta(tab)` — la scheda è nascosta perché la sua funzione è spenta.

Spegnere NON significa cancellare codice: il codice resta caricato, si nascondono i punti d'ingresso. L'effetto reale lo produce `feature-gate.js` (caricato subito dopo config.js: regola CSS `display:none` su `[data-tab]` e `data-ce-args`, così valgono anche per i pulsanti ridisegnati dopo) più il blocco dentro `switchTab` (dispatcher.js) che blocca le chiamate dirette. Le funzioni senza scheda propria (`vtk`, `vip`) vivono in schermate accese e vanno spente nel punto in cui compaiono. Sorveglianza: `test/guardrail/interruttori.test.js` (l'elenco delle spente può solo accorciarsi; una funzione ACCESA non ha movimenti di denaro fuori dal server) e `test/guardrail/interruttori-applicati.test.js` (gli interruttori spengono davvero). Caso a parte: `window.HQ_ENABLED = false` stacca l'HQ Base Builder finché non è convertito a `CE_money` (sorvegliato da `test/hq/interruttore.test.js`).

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
    yesterdayEarnings: 0,    // salvato da engine-daily.js prima del reset di todayEarnings
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

L'ordine in `index.html` definisce le dipendenze. Non spostare script senza verificare.

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
14. quests-data.js       — QUEST_DB array statico (1509 righe), VG const, window.QUEST_DB
15. quests.js            — logica quest: checkQuestProgress, claimQuestReward, completeMissionRun
16. engine.js            — CORE: gameLoop, saveGame, loadGame, helpers (~1956 righe)
17. engine-daily.js      — tick giornalieri + processDailyRoutines + _checkDailyReward (~1093 righe)
18. engine-rides.js      — generazione corse, completeRide, checkActiveTrips (~904 righe)
19. engine-finance.js    — tick mercato + AZIONI PLAYER: buyStocks, takeLoan, shortSell, ecc.
20. engine-drivers.js    — azioni autisti: hireDriver, sendDriverToRest, startAcademyCourse, ecc.
21. engine-fleet.js      — azioni flotta: repairVehicle, buyHub, buyStandardFuel, ecc.
22. engine-store.js      — DC boosters: fuelBoostDC, wakeDriverDC, activateExecutivePass, ecc.
23. engine-holding.js    — holding, sussidiarie, $CEMP, IPO NPC fallback
24. engine-rivals.js     — sistema rivali/NPC AI (148 righe)
25. engine-events.js     — eventi casuali, incidenti, strike, fines (386 righe)
26. vip-buffs.js         — buff system (_applyBuff, _getBuffValue) + helper VIP privati
27. vip-clients.js       — 9 handler clienti VIP + _vipOnComplete dispatcher
28. war_room.js          — province War Room, renderTabWarRoom
29. dispatcher.js        — switchTab routing, showNotification, togglePanel (~247 righe)
30. map.js               — Mapbox: var map (GLOBALE), initMap, layer setup (~461 righe)
31. map-router.js        — BFS highway router, calculateInterpolatedPosition (~143 righe)
32. map-garage.js        — openGarage3D, closeGarage3D, _generateVehicleSVG (~227 righe)
33. map-visual.js        — visualLoop, vehicle markers, trail scia (~170 righe)
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
44. ui-home.js           — renderTabHome, home KPI/rides/drivers/notifiche, _homeTimer (auto-refresh 5s)
45. ui-help.js           — renderTabHelp, renderCurrentTab
46. ui-hub.js            — Smart Hub: toggleHub, openHub, hubNavigate
47. ui-realestate.js     — renderTabRealEstate, doBuyRealEstate (Supabase)
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
60. hq-visual.js         — rendering visuale campus isometrico HQ, window.renderHQCampus
61. mobile_dispatcher.js — UI mobile
62. hostile_takeover.js  — acquisizioni ostili, renderTabOPA
63. nemesis.js           — nemici VIP, renderTabNemesis
64. infrastructure.js    — carburante/depositi, renderTabInfrastructure
65. contracts.js         — gare d'appalto, renderTabContracts (496 righe)
66. tourism.js           — bandi turismo, renderTabTourism (485 righe)
67. tutorial.js          — onboarding
68. premium-ui.js        — hash routing (#tab → switchTab on load)
```

### File da NON caricare (obsoleti — presenti nel repo ma non referenziati in index.html)

```
ui-meta.js        — SOSTITUITO da ui-ranking/investments/legal/politics/career/store/market/help/hub/realestate/map-utils.js
ui-finance-mkt.js — SOSTITUITO da ui-marketing.js + ui-finance.js
vip_clients.js    — SOSTITUITO da vip-buffs.js + vip-clients.js (nuovo)
p2p_market.js     — SOSTITUITO da p2p-market.js + p2p-render.js
```

> **FATTO (2026-05-29):** Questi 4 file sono già stati rimossi dal repo. Riga storica mantenuta per contesto.

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
window.ServerState        // oggetto con metodi cloud (saveSystem.js)
window.CE_money           // porta unica del denaro: spend/earn/spendDC/earnDC/addReputation,
                          // accreditatoDalServer/addebitatoDalServer (money.js) — Regola 6
window.FEATURES           // interruttori funzioni: nome → bool (config.js) — Regola 7
window.attiva(nome)       // la funzione è accesa? Sconosciuta = spenta (config.js)
window.TAB_DI             // scheda → funzione che la governa (config.js)
window.tabSpenta(tab)     // scheda nascosta perché la sua funzione è spenta (config.js)
window.QUEST_DB           // array quests statiche (quests-data.js) — NON ridichiarare
var map                   // istanza Mapbox GL JS (map.js) — var per essere window.map
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

## engine.js — Struttura interna (3908 righe)

### Sezioni principali (per navigare il file)

| Righe | Sezione | Contenuto |
|---|---|---|
| 1–80 | POI/Province mapping | `POI_TO_PROVINCE`, `_awardTerritoryInfluence` |
| 81–291 | Helpers/Config | email template, marketing helpers, `STELLAR_VOLT_CATALOG`, `gameState` |
| 292–401 | Helpers UI | `showBigEvent`, `_applyBrandColor`, `_tabIs`, `_getSeasonalMult`, `_checkAchievements` |
| 402–682 | Save/Load | `_serializeRide`, `_deserializeRide`, `saveGame`, `loadGame` |
| 683–917 | Boot/Init | `_getTrafficMult`, recruits, auction, `initGame`, `_getItalyTime` |
| 918–1177 | Game Loop | `gameLoop` (600ms), fatigue tick, weather tick |
| 1178–1703 | Business Logic | email log, driver XP, reputation, VIP events, fuel, grey market, shadow, territory |
| 1704–2355 | Daily Routines | `processDailyRoutines` — redditi, manutenzione, interessi, contratti |
| 2356–2836 | Ride Cycle | `generatePOIRide`, `generateContractRide`, `assignRideToDriver`, `autoDispatchRides`, `startNextRide`, `completeRide` |
| 2837–3148 | Email Events | `generateEmailEvent`, `autoNegotiateEmails`, `negotiateEmail`, car mgmt, leasing |
| 3149–3908 | Misc/Bootstrap | `foundCompany`, NGP, diamond contracts, `checkActiveTrips`, `updateUI`, `_startGameWithSlot` |

### Funzioni window.* esportate da engine.js

```js
// Core
window.saveGame(), window.loadGame(), window.startGame(fresh), window.initGame(isNew)
window.updateUI(), window.generatePOIRide(), window.generateContractRide()
window.autoDispatchRides(), window.completeRide(ride, deferred)
window.processDailyRoutines(), window.showBigEvent(icon, title, body)

// Azioni autisti — ora in engine-drivers.js
window.hireDriver(d), window.fireDriver(id), window.sendDriverToRest(id)
window.putDriverOnBreak(id), window.payDriverBonus(id), window.payStressClear(id)
window.startAcademyCourse(id, courseId), window.skipAcademyTraining(id)

// Azioni flotta — ora in engine-fleet.js
window.repairVehicle(id), window.repairEngine(id), window.refillTires(id)
window.buyHub(id), window.sellHub(id), window.buyStandardFuel(liters)
window.buyBlackMarketFuel(), window.instantRepairDC(id), window.buyCARUpgrade(id)

// Finanza — ora in engine-finance.js
window.takeLoan(tier), window.repayLoan(id), window.buyStocks(ticker, qty)
window.sellStocks(ticker, qty), window.shortSell(ticker, qty), window.coverShort(ticker)
window.buyLifestyleAsset(id), window.acquireVentureStake(id), window.donateToLobby(amt)

// Holding — ora in engine-holding.js
window.incorporateHolding(), window.buyCempShares(qty), window.sellCempShares(qty)

// Misc
window.setPricingStrategy(s), window.foundCompany(lng, lat, name)
window.newGamePlus(), window.toggleBlacklist(poiId), window.resolveStrike()
window.acceptDiamondContract(emailId), window.payFine(id), window.contestFine(id)
window.attackTerritory(regionId), window.respondPoaching(emailId, accept)
window.activateCampaign(id), window.deactivateCampaign()
window._startGameWithSlot(slotIndex, fresh)
```

---

## map.js — Struttura interna (993 righe)

```
Righe 1–30:    Config, MAPBOX_TOKEN, var map (GLOBALE!), _mapReady, _cantiereMarkers
Righe 31–267:  initMap() — setup Mapbox, tutti i addSource/addLayer
Righe 268–460: Update functions — vehicle layer, region labels, contract destinations,
               route lines, highways, POIs, cantiere markers, incident/checkpoint markers
Righe 461–635: visualLoop() — animazione veicoli sulla mappa (setInterval 100ms)
Righe 636–854: openGarage3D / closeGarage3D / _generateVehicleSVG — ispezione veicolo 3D
Righe 855–993: Highway Router — _getHWGraph, _findHWPath (BFS), _buildRideWaypoints,
               calculateInterpolatedPosition
```

**IMPORTANTE:** `var map = null;` è a riga 12 di map.js. Deve essere `var` (non `let`/`const`) perché `ui-meta.js` e altri file accedono a `map` direttamente come global.

---

## Sistema HQ — Architettura completa (Maggio 2026)

### gameState — struttura HQ

```js
gameState.hqs = {
    'roma': {
        rooms: { 'garage_main': 1, 'workshop': 2, ... },  // roomId → livello corrente
        grid:  { 0: 'garage_main', 2: 'workshop', ... }   // slotId → roomId
    },
    'milano': { rooms: {}, grid: {} },
    // ... una entry per ogni città
};
gameState.currentHQCity = 'roma';   // città selezionata nella UI
```

**Regola:** `gameState` è `let` in `engine.js` ma è esposto anche come `window.gameState` via getter (engine.js:295). I file HQ usano il bare `gameState`; `window.gameState` è equivalente e ugualmente valido.

---

### hq-data.js — Struttura dati (114 righe)

**`window.HQ_CITIES`** — 5 città, ognuna con array `slots`:
```js
{ id: 'roma',    slots: [ {id:0,left:'22%',top:'45%'}, {id:1,left:'46%',top:'33%'}, {id:2,left:'62%',top:'48%'}, {id:3,left:'38%',top:'63%'} ] }
{ id: 'milano',  slots: 5 slot }
{ id: 'firenze', slots: 6 slot }
{ id: 'napoli',  slots: 5 slot }
{ id: 'venezia', slots: 5 slot }
```
Le coordinate `left/top` sono percentuali relative al contenitore 16:9 → puntano al "suolo" dove si poggia l'edificio.

**`window.HQ_ROOMS`** — 6 edifici con tiers:

| id | Nome | Prereq | Tiers | Effetti chiave |
|---|---|---|---|---|
| `garage_main` | Garage | nessuno | 3 | `extraVehicleSlots` |
| `workshop` | Officina | garage_main | 3 | `autoRepairThreshold`, `autoRepairDaily` |
| `mission_room` | Sala Missioni | garage_main | 3 | `driverXpMult` |
| `control_tower` | Torre di Controllo | mission_room | 3 | `vipRideBonus` |
| `penthouse` | Penthouse | control_tower | 5 | `allEarningsMult` (fino a ×2.0) |
| `vip_lounge` | VIP Lounge | control_tower | 3 | `reputationBonus`, `vipRideBonus` — solo Firenze |

Struttura di un tier:
```js
{ level: 2, cost: 100000, effect: { extraVehicleSlots: 5 }, score: 10, reqRep: 1 }
```

---

### hq.js — Struttura interna (~400 righe)

| Righe | Funzione | Descrizione |
|---|---|---|
| 14–52 | `window.hqInit()` | Migration da vecchio `gameState.hqRooms` + init città |
| 56–99 | State access | `hqGetCityRooms`, `hqHasRoomInCity`, `hqGetRoomLevel`, `hqAllEffects`, `hqGetEffect` |
| 107–182 | `window.hqUpgradeRoom(cityId, roomId, slotIndex)` | Costruisce o upgrada un edificio — verifica cash, rep, prereq, slot |
| 184–187 | `window.hqSwitchCity(cityId)` | Cambia città attiva e ri-renderizza |
| 191–328 | `window.renderTabHQ()` | Render completo tab HQ: city tabs + visual campus + room list |
| 330–362 | `window.hqOpenBuildModal(roomId)` | Modal selezione slot per nuova costruzione |
| 367–399 | `window._hqDailyTick()` | Effetti giornalieri: auto-repair, morale, EV recharge |

**Chiamata da `processDailyRoutines`** in engine-daily.js:
```js
if (typeof window._hqDailyTick === 'function') window._hqDailyTick();
```

**`hqAllEffects()`** — aggrega tutti gli effetti da tutte le città. I moltiplicatori (`endsWith('Mult')`) si moltiplicano tra loro; i bonus additivi si sommano.

---

### hq-visual.js — Struttura interna (~210 righe)

Esporta solo `window.renderHQCampus()` — chiamata da `renderTabHQ()` dopo il render della lista.

**Flusso di render:**
1. Legge `gameState.currentHQCity` → trova `cityConfig` in `HQ_CITIES`
2. Container `div` con `background-image: url('assets/cities/bg_${cityId}.jpg')`; aspect-ratio 16/9 inline (NON classe Tailwind `aspect-video` — non è nel bundle compilato)
3. Itera `cityConfig.slots` → per ogni slot:
   - Se `grid[slotId]` esiste → disegna `<img src="assets/buildings/${roomId}_lvl${level}.png">` con `transform: translate(-50%, -100%)` (origine = suolo sotto al centro dell'edificio)
   - Se vuoto → mostra pulsante "+" con `onclick="window.hqOpenBuildModal('${currentCityId}', ${slotId})"`
4. `onerror` sull'img: nasconde l'immagine e mostra il placeholder testuale inline

**Hover effects** in `style.css`:
```css
.hq-building-wrapper:hover .hq-building-label { opacity: 1 !important; }
.hq-building-wrapper:hover { transform: translate(-50%, -100%) scale(1.05); }
```

**CRITICO — NON usare classi Tailwind arbitrarie in hq-visual.js.** Solo classi base (`absolute`, `relative`, `flex`, ecc.) o inline styles. Classi come `aspect-video`, `border-gold/40`, `bg-gold/5`, `text-[9px]` NON sono nel bundle compilato → div a height=0 o stili mancanti.

---

### Assets HQ — Convenzione naming

**Sprite edifici:** `assets/buildings/${roomId}_lvl${level}.png`
- Esempi: `garage_main_lvl1.png`, `penthouse_lvl3.png`, `control_tower_lvl2.png`
- PNG trasparente, prospettiva isometrica 30° da destra
- Max height 200px nella UI (controllato da `max-height:200px` inline)
- Background rimosso con remove.bg API (chiave: vedi owner)

**Sfondi città:** `assets/cities/bg_${cityId}.jpg`
- Esempi: `bg_roma.jpg`, `bg_milano.jpg`, `bg_venezia.jpg`
- Formato panoramico (≥16:9), pixel art / illustrato in stile Ikariam
- Caricato come `background-image` CSS — fallback `background-color: #1a1c29`

**Sprite da rigenerare** (prospettiva o rimozione sfondo imperfetti):
- `control_tower_lvl3.png` — prospettiva frontale/cinematica invece di isometrica 30°
- `vip_lounge_lvl1.png` — piccolo residuo pavimento scuro in basso

---

## Architettura Quest System

Il quest system usa due file distinti (CRITICO — non unirli):

```
quests-data.js (1509 righe)          quests.js (79 righe)
─────────────────────────            ────────────────────
'use strict';                        'use strict';
const VG = { ... }                   // Solo logica engine
const QUEST_DB = [                   window.completeMissionRun(id)
  { id:'t01', ... },                 window.checkQuestProgress()
  { id:'m01', ... },                 window.claimQuestReward(id)
  ...156 quests...                   window.getMissionRequires(id)
];
window.QUEST_DB = QUEST_DB;          // usa window.QUEST_DB, mai const locale
```

**Perché due file:** `const QUEST_DB` in quests-data.js è locale a quel file. Se quests.js ridichiarasse `const QUEST_DB`, in strict mode sarebbe `SyntaxError`. Quindi quests.js usa sempre `window.QUEST_DB`.

**156 quest:**
- `t01`–`t06`: Tutorial (onboarding)
- `m01`–`m100`: Story / Raids (completate via `completeMissionRun(missionId)`)
- `q01`–`q50`: Milestone (check su gameState continuo)

**Bivio (decision fork):** alcune story missions hanno `q.bivio = [{ id, label, effect(gs) }]`. Prima che la missione sia marcata completa, si mostra il modal bivio → player sceglie → `effect(gs)` applicato → `completeMissionRun(id)` chiamato.

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
    --bg:          #e8eef5;
    --bg2:         #edf2f7;
    --bg3:         #f5f7fa;
    --panel:       #f0f4f8;
    --card:        #ffffff;
    --card-border: #e2e8f0;
    --sidebar-w:   160px;
    --topbar-h:    42px;
    --text:        #1a2744;
    --text-muted:  #4d6480;
    --text-dim:    #7a92a8;
}
```

**Layout fisso:**
- `#top-bar`: `height:42px`, `position:fixed top-0`, background `#1e3a5f`
- `#sidebar-player`: `width:160px`, `position:fixed left-0 top:42px`, background `#1e2d45`
- `#main-panel`: `position:fixed left:160px top:42px` (da `premium-ui.css`)
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
#main-panel .bg-gray-900    { background: #e8ecf0 !important; }
#main-panel .bg-gray-800    { background: #e0e6ec !important; }
```
Le sezioni "career dark" (`bg-[#111120]`) sono INTENZIONALMENTE scure — non sovrascrivere.

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

**Regola critica:** Il client legge `gameState` localmente. Le mutazioni di cash importanti (acquisto province, real estate) devono passare via RPC Supabase → Realtime callback → aggiorna gameState. **Non mutare `gameState.cash` direttamente per operazioni server-authoritative.**

---

## Real-time engine — Come funziona il tempo

**Epoch:** Day 1 = 1 Novembre 2025 (lancio gioco).

`gameState.day` è un **contatore monotono** (non si resetta). `gameState.month` e `gameState.hour/minute` rispecchiano l'ora reale italiana.

```js
const GAME_EPOCH_MS = new Date('2025-11-01T00:00:00+01:00').getTime();

function _getItalyTime()  // → { hour, minute, day, month, year, gameDay }
function gameLoop()       // setInterval ogni 600ms — sync da _getItalyTime()
```

**`gameLoop()` (ogni 600ms):**
1. `_getItalyTime()` → sync `hour`, `minute`, `month`, `day`
2. Se `hour !== _prevHour` → meccaniche orarie (energia, meteo, stock, campagne)
3. Se `minute % 15 === 0` → tick AI rivali
4. Se `day !== _prevDay` → `processDailyRoutines()` (redditi, manutenzione, interessi)
5. Loop visual `activeRides`: elapsed += 5000ms, completa a `ride.duration`

**Generazione corse:** ogni 5 min reali (POI), ogni 8 min (contratto). Queue cap: 15 pending.

**Offline catchup:** `saveGame()` salva `lastOnlineTimestamp`. Al reload, se offline > 1 giorno, chiama `processDailyRoutines()` per ogni giorno perso (max 7).

---

## switchTab — Routing completo

```js
switchTab('home')         → renderTabHome()            // ui-home.js
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

---

## File da NON leggere a meno che strettamente necessario

| File | Perché | Dimensione |
|---|---|---|
| `routesDB.js` | Array/oggetti statici di rotte pure | ~17750 righe |
| `data.js` | Dati veicoli/staff/config statici | ~2270 righe |
| `quests-data.js` | 156 quest statiche | 1509 righe |
| `tailwind.min.css` | CSS compilato — non editare mai | ~minificato |

Per routesDB.js e data.js usa sempre `grep` per trovare sezioni specifiche.

---

## Bug Fixes Log — Registro permanente

Ogni fix significativo va documentato qui con: **cosa è andato storto → perché → come risolto**.

---

### [2026-05-24] `map is not defined` in ui-meta.js:1818

**Errore:** `ReferenceError: map is not defined` in `_updateDayNight()` di `ui-meta.js`

**Causa:** `map.js` usava `map = new mapboxgl.Map(...)` senza dichiarazione. In strict mode, leggere una variabile non dichiarata è `ReferenceError`. `let`/`const` non creano `window.X`, quindi `map` non era accessibile da `ui-meta.js`.

**Fix:** Aggiunto `var map = null;` all'inizio di `map.js:12`. Con `var` al top-level di un browser script, `map` diventa `window.map` e tutti gli altri file possono accedervi.

**File:** `map.js:12`

---

### [2026-05-24] `_checkDailyReward is not defined` in engine.js:3892 → implementata

**Errore:** `ReferenceError: _checkDailyReward is not defined` all'avvio del gioco.

**Causa:** `_startGameWithSlot` chiamava `setTimeout(_checkDailyReward, 1500)` ma la funzione non era mai stata implementata.

**Fix in due fasi:**
1. Workaround: wrappato con `typeof` check in `engine.js`
2. Implementazione completa in `engine-daily.js` — sistema login streak con ricompense progressive:
   - 20h cooldown (non 24h per tollerare timezone)
   - Streak reset se > 48h dall'ultima claim
   - Reward table: Giorno 1 (€500), 3 (€1500+1DC), 7 (€5000+5DC), 14 (€10k+10DC), 30 (€25k+25DC)
   - Bonus moltiplicatore +10% ogni 7 giorni oltre il 7

**File:** `engine-daily.js` → `window._checkDailyReward`

---

### [2026-05-24] Browser caricava `quests.js?v=3` ignorando `?v=4` in index.html

**Errore:** Console mostrava errori da `quests.js?v=3` anche dopo hard refresh.

**Causa:** GitHub Pages / CDN aveva in cache la versione precedente di `index.html` che aveva ancora `?v=3`. L'hard refresh del browser bypassa il cache del browser, ma non il cache CDN del server.

**Fix:** Bumped tutti i `?v=` in `index.html` da 3/4 → 5 (67 occorrenze), forzando il CDN a servire il nuovo `index.html`.

**File:** `index.html`

---

### [2026-05-22] `QUEST_DB is not defined` — spam in console

**Errore:** `ReferenceError: QUEST_DB is not defined` ripetuto ogni tick.

**Causa:** Il rewrite aveva unificato tutto in `quests.js` che ridichiarava `const QUEST_DB` — già dichiarato in `quests-data.js`. Re-dichiarare `const` in strict mode nel global scope → `SyntaxError` → `quests.js` non eseguiva → `window.QUEST_DB` mai settato → engine chiamava `window.checkQuestProgress` che cercava `QUEST_DB` e falliva.

**Fix:** Riscritto `quests.js` a soli 79 righe (solo engine functions), usando `window.QUEST_DB` invece di `const QUEST_DB` locale.

**File:** `quests.js` (rewrite), `quests-data.js` (unica fonte di QUEST_DB)

---

### [2026-05-24] `window.gameState` vs bare `gameState` — crash in contracts.js

**Errore:** `Cannot read properties of undefined (reading 'corporateTenders')` aprendo il tab Contratti.

**Causa:** `gameState` è dichiarato con `let` dentro `engine.js` — non è `var`, quindi NON è `window.gameState`. `contracts.js` usava `window.gameState` ovunque → `undefined` → crash.

**Fix:** Sostituiti tutti i `window.gameState` con bare `gameState` in `contracts.js` (3 occorrenze: `_cCountQualifying`, `_cPlayerScore`, `renderTabContracts`).

**Regola (SUPERATA il 2026-05-29):** All'epoca `window.gameState` non esisteva. Ora a engine.js:295 c'è un getter `Object.defineProperty(window,'gameState',{get(){return gameState}})`, quindi `window.gameState` e `gameState` bare sono **equivalenti**. Entrambe le forme funzionano; non serve più "correggere" `window.gameState` in bare.

**File:** `contracts.js`

---

### [2026-05-26] hq-visual.js — SyntaxError da backtick escapati

**Errore:** `Uncaught SyntaxError: Invalid or unexpected token (at hq-visual.js?v=3:24:19)`

**Causa:** L'intero file `hq-visual.js` era stato scritto con `\`` (backslash + backtick) invece di `` ` `` reali — 30+ occorrenze. Il file era JS invalido dalla creazione. `window.renderHQCampus` non veniva mai definita, quindi `hq.js` saltava silenziosamente il render visuale.

**Fix:** Script Python `e:\tmp\fix_hqvisual.py` → `.replace('\\`', '`').replace('\\${', '${')`. Poi bumped `hq-visual.js?v=4` in `index.html`.

**Lezione:** Quando una funzione `window.X` esportata da un file non esiste a runtime, il primo sospetto è un errore di sintassi nel file — verificare la console del browser PRIMA di debuggare la logica.

---

### [2026-05-26] hq-visual.js — Campus invisibile (height=0)

**Errore:** La pagina HQ mostrava la lista gestione ma nessun campus visuale.

**Causa 1:** Classe Tailwind `aspect-video` usata nel template HTML — NON presente nel bundle `tailwind.min.css` compilato → div collassa a `height:0` → `overflow:hidden` taglia tutto il contenuto.

**Causa 2:** Classi arbitrarie Tailwind (`border-gold/40`, `bg-gold/5`, `text-[9px]`, ecc.) non compilate → elementi invisibili o stili mancanti.

**Fix:** Sostituite tutte le classi Tailwind arbitrarie con inline styles. Sostituito `aspect-video` con `style="aspect-ratio: 16/9; min-height: 240px;"`.

**Regola:** In template JS (template literals con HTML), usare SOLO classi Tailwind base già presenti nel bundle, oppure inline styles. Verificare `tailwind.input.css` per le classi custom.

---

### [2026-05-26] hq.js — Slot 7 inesistente per nuova partita

**Errore:** Garage principale invisibile nel campus visuale su nuova partita.

**Causa:** `hqInit()` ramo "new game" usava `grid: { 7: 'garage_main' }` ma Roma ha solo 4 slot (id 0–3). Slot 7 non esiste → nessun edificio veniva renderizzato.

**Fix:** Cambiato `{ 7: 'garage_main' }` → `{ 0: 'garage_main' }` in `hq.js:36`.

**File:** `hq.js:36`

---

### [2026-05-24] Home tab, sidebar gradient, auto-refresh — implementati

**Funzionalità aggiunte:**

1. **Home tab (`ui-home.js`, NUOVO):** Dashboard con 4 KPI (Guadagno Oggi, Corse Attive, Rating, Livello), tabella corse live, lista autisti con avatar colorati, feed notifiche. Avvio gioco reindirizza a `home` invece di `corse`.

2. **Gradient sidebar (`ui-sidebar.js` + `style.css`):** Ogni `.sidebar-item` ha un `::before` con `radial-gradient` centrato su `--rx`/`--ry`. DOMContentLoaded mousemove su `#sidebar-nav` aggiorna le var CSS in real-time → effetto glow gold che segue il mouse.

3. **Auto-refresh home (`ui-home.js`):** `window._homeTimer = setInterval(5000)` controlla se il panel title contiene "Command Center" e chiama `renderTabHome()`. Timestamp live nel header.

4. **Yesterday earnings (`engine-daily.js`):** Salva `gameState.yesterdayEarnings = gameState.todayEarnings` prima del reset giornaliero. Home KPI mostra delta `▲/▼ +X% vs ieri (€Yk)`.

**File:** `ui-home.js` (new), `ui-sidebar.js`, `style.css`, `engine-daily.js`, `dispatcher.js`, `engine.js`, `index.html`

---

### [2026-05-29] War Room sparisce dopo ~1 secondo ad ogni apertura

**Errore:** Aprendo il tab War Room (provinces), la mappa si mostrava per circa 1 secondo e poi spariva tornando al Dispatch Center.

**Causa:** In `map.js`, dentro la callback `'load'` di Mapbox (che si attiva quando la mappa finisce di caricare, ~1s), era presente la riga:
```js
if (typeof window.switchTab === 'function') window.switchTab('corse');
```
`initMap()` è chiamata SOLO da `_ensureMap()` → `openMapOverlay()` → `switchTab('provinces')`. Quando Mapbox terminava il caricamento, questa riga chiamava `switchTab('corse')`, che a sua volta triggera `closeMapOverlay()` → `_destroyMap()` → War Room spariva e la mappa veniva distrutta.

**Fix:** Rimossa quella riga da `map.js`. Era dead code residuo da un vecchio boot sequence dove `initMap()` veniva chiamata all'avvio — quel pattern non esiste più, `initMap` è ora chiamata solo dall'utente via War Room.

**Regola:** Qualsiasi `switchTab()` inside una callback async (timers, event listeners, promise then) può causare loop o redirect inattesi. Verificare sempre che una callback async non triggeri navigazione a tab diverso da quello attuale.

**File:** `map.js` (riga ~262, rimossa)

---

## Prossimi step tecnici — Piano split file

### Contesto

I file seguenti sono ancora troppo grandi per lavorarci facilmente in sessioni AI. L'obiettivo è ridurre ogni file a < 600 righe con una responsabilità chiara.

### Dimensioni attuali (Maggio 2026)

| File | Righe | Stato |
|---|---|---|
| `engine.js` | ~1956 | ✅ Splittato (da 3908) |
| `engine-daily.js` | ~1093 | ✅ Nuovo da split |
| `engine-rides.js` | ~904 | ✅ Nuovo da split |
| `map.js` | ~461 | ✅ Splittato (da 993) |
| `map-visual.js` | ~170 | ✅ Nuovo da split |
| `map-router.js` | ~143 | ✅ Nuovo da split |
| `map-garage.js` | ~227 | ✅ Nuovo da split |
| `quests-data.js` | 1509 | OK — dati statici, non splittare |
| `showroom.js` | 729 | Da splittare |
| `ui-staff.js` | 602 | OK |
| `war_room.js` | 494 | OK |
| `contracts.js` | 496 | OK |

### Split engine.js ✅ COMPLETATO (Maggio 2026)

engine.js (3908 → 1956 righe) + 2 nuovi file:

```
engine.js          ~1956 righe — gameState, helpers, save/load, initGame,
                                  gameLoop, updateUI, _startGameWithSlot,
                                  shadow/territory/business logic, VIP events

engine-daily.js    ~1093 righe — _tickFatigue, _tickWeather, _tickEmails,
                                  _tickFuelPrice, refillVehicle, processDailyRoutines,
                                  generateEmailEvent, negotiateEmail,
                                  _tickDriverSatisfaction, _checkDailyReward (NEW)

engine-rides.js    ~904 righe  — _findEmptyLegRide, generatePOIRide,
                                  generateContractRide, _getRideDurationMs,
                                  assignRideToDriver, autoDispatchRides,
                                  startNextRide, completeRide, checkActiveTrips
```

**Pattern di accesso cross-file:** Tutti i file condividono il global scope HTML.
Le funzioni private (es. `_sendDriverToRest` in engine.js) sono accessibili da engine-daily.js
e engine-rides.js come bare variables a runtime (non serve window.*). ✓

### Split map.js ✅ COMPLETATO (Maggio 2026)

map.js (993 → ~461 righe) + 3 nuovi file già in produzione:

```
map.js          ~461 righe — var map (GLOBALE), MAPBOX_TOKEN, initMap(),
                              update functions (vehicle layer, region labels,
                              contract destinations, route lines, highways, POIs, markers)

map-visual.js   ~170 righe — visualLoop(), animazione veicoli + trail scia

map-router.js   ~143 righe — _getHWGraph, _findHWPath (BFS), _buildRideWaypoints,
                              calculateInterpolatedPosition

map-garage.js   ~227 righe — openGarage3D, closeGarage3D, _generateVehicleSVG
```

### Split proposto per showroom.js (729 → 2 file)

```
showroom-data.js (NUOVO, ~150 righe) ← costanti/catalogo auto
showroom.js (~580 righe) ← renderTabShowroom + SRM functions
```

### Cleanup immediato (facile, zero rischi)

```bash
# Elimina file obsoleti — NON sono in index.html
git rm ui-meta.js ui-finance-mkt.js vip_clients.js p2p_market.js
git commit -m "cleanup: rimuovi file obsoleti sostituiti da moduli split"
```

---

## Pattern comuni

### Aggiungere una nuova azione di gioco

1. Aggiungere la funzione nel sotto-engine appropriato (engine-drivers.js, engine-fleet.js, ecc.)
2. Esportare con `window.myAction = function(...) { ... }`
3. Chiamare `saveGame()` alla fine se muta `gameState`
4. Se interagisce con Supabase per operazioni cash, usa `window.supabaseClient.rpc('rpc_name', args)`

### Aggiungere un nuovo tab UI

1. Creare `ui-newtab.js` con `window.renderTabNewTab = function() { ... }`
2. Aggiungere `<script src="ui-newtab.js?v=5">` in `index.html` dopo gli altri `ui-*.js`
3. Aggiungere case in `dispatcher.js` → `switchTab()` switch
4. Aggiungere `<a class="sidebar-item" data-tab="newtab" onclick="switchTab('newtab')">` nel sidebar HTML di `index.html`
5. Aggiungere mapping `newtab: 'grupponome'` in `_SIDEBAR_GROUP` di `ui-sidebar.js`

### Modificare il CSS

- Variabili tema → `:root` in `style.css` (prime ~35 righe)
- Componenti DS → `style.css` dopo riga ~3200
- Layout nav/sidebar/panel → `premium-ui.css`
- **Non toccare** `tailwind.min.css` — ricompilare con: `npx tailwindcss -i tailwind.input.css -o tailwind.min.css --minify`

### Aggiungere CSS per una nuova feature

Se usi classi Tailwind hardcoded in template JS (es. `text-white`, `bg-gray-800`) che appaiono dentro `#main-panel`, aggiungi override in `style.css` nella sezione "Override hardcoded Tailwind dark" (~riga 3789).

---

## Sicurezza (completato Maggio 2026)

- ✅ RLS attivo su tutte le tabelle Supabase
- ✅ Trigger `validate_game_save` su `game_saves`: blocca cash > 500M, fleet > 100
- ✅ Trigger `validate_leaderboard` su `leaderboard`: blocca liquid_assets > 500M, fleet_count > 100
- ✅ Console.log con dati utente rimossi da produzione
- ✅ Nessuna `service_role key` esposta nel frontend

---

## Visione espansione futura

> Confermato dall'utente — Maggio 2026

**Filosofia:** "Chauffeur Empire" è un nome intenzionalmente ampio. Il gioco deve evolversi fino a contenere tutte le forme di guida/trasporto.

**Obiettivo core:** Gioco "povero → ricco". Il giocatore deve poter iniziare con letteralmente niente. Il Premium Shop accelera ma NON è obbligatorio.

### Lane di gioco future

| Lane | Descrizione | Note architetturali |
|---|---|---|
| 🧑‍✈️ **Private Chauffeur** | Job di partenza — solo tu + 1 auto | Entry point nuovi giocatori |
| 🚖 **Taxi** | Trasporto urbano di massa, alto volume basso margine | Pricing model diverso da NCC |
| 🚛 **Truck / Logistics** | Merci, rotte lunghe, gestione depositi | Nuova categoria fleet[] |
| 🚤 **Water Taxi** | Specialità per HQ Venezia | Veicoli marini, canali navigabili |
| ✈️ / 🚢 | Jet privati, yacht — espansione ultra-premium | Lungo termine |

### Sistema HQ Multi-Città e Upgrades
- **Sedi Regionali**: Possibilità di aprire HQ Base Builder in più città (Roma, Milano, Firenze, Napoli, Venezia).
- **Venezia**: Città con viabilità unica, richiede una flotta mista (auto su terraferma + water taxi nei canali).
- **Edifici con Tiers**: Gli edifici (Garage, Infirmary, ecc.) non sono solo costruibili/non costruibili, ma avranno livelli di upgrade (Es: Livello 1, 2, 3) con sprite statici forniti dall'utente per ogni livello, offrendo bonus crescenti.

### Impatto architetturale quando si aggiungono taxi/truck

```js
// Oggi: fleet[] assume sempre auto NCC di lusso
{ id: 'v1', brand: 'Mercedes', tier: 'premium', ... }

// Futuro: aggiungere vehicleClass
{ id: 'v1', vehicleClass: 'ncc' | 'taxi' | 'truck', ... }

// pendingRides[] dovrà avere requiredClass
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
| `engine.js` | `gameLoop()`, `saveGame()`, `loadGame()`, helpers, business logic | ~1956 |
| `engine-daily.js` | `processDailyRoutines()`, tick functions, `_checkDailyReward` | ~1093 |
| `engine-rides.js` | `generatePOIRide()`, `completeRide()`, `checkActiveTrips()` | ~904 |
| `engine-finance.js` | tick mercato + buyStocks, takeLoan, shortSell, acquireVentureStake | ~465 |
| `engine-drivers.js` | hireDriver, sendDriverToRest, startAcademyCourse | ~194 |
| `engine-fleet.js` | repairVehicle, buyHub, buyStandardFuel, buyPrototypeCar | ~507 |
| `engine-store.js` | DC boosters, activateExecutivePass, fullBundleDC | ~214 |
| `engine-holding.js` | incorporateHolding, buyCempShares, _listCompanyIPO_NPC | ~127 |
| `dispatcher.js` | `switchTab()`, `showNotification()`, `togglePanel()` | ~247 |
| `map.js` | Mapbox initMap, layer setup, markers | ~461 |
| `map-router.js` | BFS highway router, calculateInterpolatedPosition | ~143 |
| `map-garage.js` | openGarage3D, closeGarage3D, _generateVehicleSVG | ~227 |
| `map-visual.js` | visualLoop, vehicle markers, trail scia | ~170 |
| `hq-data.js` | HQ_CITIES (5 città + slot coords), HQ_ROOMS (6 edifici + tiers) | ~115 |
| `hq.js` | hqInit, hqUpgradeRoom, renderTabHQ, hqAllEffects, _hqDailyTick | ~400 |
| `hq-visual.js` | renderHQCampus — campus isometrico con sprite PNG + slot vuoti | ~210 |
| `quests-data.js` | 156 quest statiche (data only) | 1509 |
| `quests.js` | Quest engine (logic only) | 79 |
| `serverState.js` | Sync Supabase Realtime, ServerState | 609 |
| `style.css` | Tutto il CSS — tema, layout, componenti, overrides Tailwind | ~3900 |
| `ui-sidebar.js` | Accordion nav, patch switchTab + updateUI | 120 |
