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

Tutto lo stato del gioco vive in **`gameState`** (definito in `engine.js:176`). È un oggetto globale mutato direttamente. Non c'è Redux, niente reactive. Ogni modulo legge/scrive `window.gameState` direttamente.

Campi principali:
```js
gameState.cash          // liquidità €
gameState.drivers[]     // array autisti (incl. CEO con id='ceo')
gameState.fleet[]       // array veicoli
gameState.activeRides[] // corse in corso
gameState.activeFines[] // multe pendenti
gameState.staff[]       // personale assunto
gameState.day / .hour   // tempo di gioco
gameState.energy        // energia CEO (0-100)
gameState.reputation    // reputazione (float)
gameState.hq            // dati headquarter
gameState.investments[]
gameState.marketingCampaigns[]
```

### Pattern moduli

Ogni file JS esporta funzioni via `window.*`. Non ci sono import/export ES module. Il meccanismo è:
```js
// In qualsiasi file
window.myFunction = function(...) { ... };
// Chiamata da qualsiasi altro file
window.myFunction(args);
```

### Pattern tab / renderTab

Ogni tab di gioco ha una funzione `window.renderTab*()` nel suo file UI. `window.switchTab(name)` in `dispatcher.js` chiama la funzione corrispondente e inietta l'HTML in `#tab-container`.

```js
window.switchTab('fleet');   // → chiama window.renderTabFleet()
window.switchTab('staff');   // → chiama window.renderTabStaff()
```

---

## Ordine di caricamento script (CRITICO)

L'ordine in `index.html` definisce le dipendenze. Non spostare script senza verificare le dipendenze:

```
1.  security.js          — CE_Sec (escapeHTML, validazione)
2.  design-system.js     — window.DS, window.CE_Alert
3.  supabase-config.js   — window.supabaseClient
4.  config.js            — window.GAME_CONFIG
5.  geoCoords.js         — coordinate POI
6.  routesDB.js          — DB rotte (GROSSO — 515K, non leggere mai intero)
7.  data.js              — dati statici veicoli/staff (191K, non leggere mai intero)
8.  lang.js              — traduzioni
9.  syncManager.js       — sync multi-tab browser
10. saveSystem.js        — slot salvataggio
11. serverState.js       — sync Supabase Realtime (companies, drivers, vehicles)
12. auth.js              — autenticazione + landing page
13. quests.js            — sistema missioni
14. engine.js            — CORE: gameLoop, saveGame, loadGame, tutte le azioni
15. engine-finance.js    — broker, investimenti, crediti
16. engine-rivals.js     — sistema rivali/NPC
17. engine-events.js     — eventi casuali, incidenti
18. vip_clients.js       — clienti VIP
19. war_room.js          — province, territori
20. dispatcher.js        — mappa Mapbox, switchTab, notifiche
21. ui-emails.js         — inbox CEO
22. ui-finance-mkt.js    — tab Finanza + Marketing
23. ui-dispatch.js       — tab Dispatch (render)
24. ui-fleet.js          — tab Garage/Flotta (render)
25. ui-staff.js          — tab Staff/HR (render)
26. ui-ops.js            — tab Operations (render)
27. ui-meta.js           — tab HQ, Lifestyle, Store, Leaderboard (render)
28. ui-sidebar.js        — sidebar player (render)
29. showroom.js          — showroom auto
30. p2p_market.js        — mercato P2P, holding, consorzi
31. b2b.js               — contratti B2B
32. auctions.js          — aste giudiziarie
33. driver_skills.js     — albero skill autisti
34. global_events.js     — eventi globali MMO
35. black_ops.js         — agenzia ombra
36. crypto.js            — crypto/offshore
37. weather_real.js      — meteo reale (OpenWeather API)
38. hq.js                — costruzioni HQ
39. mobile_dispatcher.js — UI mobile
40. hostile_takeover.js  — acquisizioni ostili
41. nemesis.js           — nemici VIP
42. infrastructure.js    — carburante/depositi
43. contracts.js         — gare d'appalto
44. tourism.js           — bandi turismo
45. tutorial.js          — onboarding
46. premium-ui.js        — animazioni UI premium
```

---

## CSS — Architettura a 3 layer

```
tailwind.min.css   ← compilato da tailwind.input.css (rebuild: npx tailwindcss -i tailwind.input.css -o tailwind.min.css --minify)
style.css          ← tutto il CSS custom: variabili :root, ops-*, ds-*, lp-*, layout
premium-ui.css     ← overrides minimi: topbar blur, #main-panel left offset, scrollbar
```

**Variabili CSS chiave** (in `:root` di `style.css`):
```css
--bg, --bg2, --bg3, --panel  /* superfici (tema light) */
--text, --text-muted, --text-dim  /* testo */
--blue, --green, --gold, --red    /* brand colors */
--border, --border-sub            /* bordi */
```

**Classi CSS importanti**:
- `ds-card`, `ds-kpi-strip`, `ds-table`, `ds-btn--*`, `ds-pill--*` → Design System (design-system.js)
- `ops-*` → Tab Dispatch (style.css ~3050)
- `lp-*` → Landing page (style.css ~1140)
- `ss-*` → Save slot screen

**Layout fisso**:
- `#top-bar`: 42px, `position:fixed top-0`
- `#sidebar-player`: 160px wide, `position:fixed left-0 top:42px`
- `#main-panel`: `position:fixed left:160px top:42px` (impostato da premium-ui.css)
- `#news-ticker-wrap`: fixed bottom, `left:160px`

---

## File da NON leggere a meno che strettamente necessario

| File | Perché |
|---|---|
| `routesDB.js` | 515K di dati rotte pure — array/oggetti statici |
| `data.js` | 191K di dati veicoli/staff/config — array statici |
| `tailwind.min.css` | CSS compilato — non editare mai direttamente |

---

## File critici da leggere spesso

| File | Cosa contiene |
|---|---|
| `engine.js` | `gameLoop()`, `saveGame()`, `loadGame()`, tutte le action functions (buyX, hireX, repairX...) |
| `dispatcher.js` | `switchTab()`, mappa Mapbox, notifiche, `showNotification()` |
| `serverState.js` | Sync Supabase Realtime, `window.serverState`, scrittura cloud |
| `style.css` | Tutto il CSS — tema, layout, componenti |
| `premium-ui.css` | Override critici layout (`#main-panel left`, offset sidebar) |

---

## Supabase — Tabelle principali

| Tabella | Contenuto |
|---|---|
| `companies` | Dati azienda per utente (cash, reputation, fleet_count...) |
| `drivers` | Autisti (legati a user_id) |
| `vehicles` | Veicoli |
| `active_trips` | Corse in corso (Realtime) |
| `provinces` | Territori e influenza |
| `market_listings` | Annunci mercato P2P |
| `shadow_ops` | Log operazioni ombra |

RPC functions prefissate `rpc_*` (es. `rpc_init_company`, `rpc_get_shadow_ops_log`).

---

## Globals più usati tra file

```js
window.gameState          // stato completo gioco (engine.js)
window.supabaseClient     // client Supabase (supabase-config.js)
window.GAME_CONFIG        // costanti configurazione (config.js)
window.DS                 // Design System components (design-system.js)
window.CE_Sec             // security helpers: escHtml(), sanitize() (security.js)
window.CE_Alert           // sistema alert in-game (design-system.js)
window.switchTab(name)    // navigazione tab (dispatcher.js)
window.showNotification(msg, type)  // toast notifica (dispatcher.js)
window.saveGame()         // salva su localStorage + cloud (engine.js)
window.serverState        // stato sync cloud (serverState.js)
```

---

## Pattern comuni

### Aggiungere una nuova azione di gioco
1. Aggiungere la funzione in `engine.js` (o nel sotto-engine appropriato)
2. Esporta con `window.myAction = function(...)`
3. Chiama `saveGame()` alla fine se muta `gameState`
4. Se interagisce con Supabase, usa `window.supabaseClient`

### Aggiungere un nuovo tab UI
1. Creare `ui-newtab.js` con `window.renderTabNewTab = function() { ... }`
2. Aggiungere `<script src="ui-newtab.js?v=3">` in `index.html` dopo gli altri ui-*.js
3. Aggiungere bottone nav in `index.html` con `onclick="switchTab('newtab')"`
4. Aggiungere case in `dispatcher.js` → `switchTab()`

### Modificare il CSS
- Variabili tema → `:root` in `style.css` (prime ~68 righe)
- Componenti DS → `style.css` dopo riga ~3200
- Layout nav/sidebar/panel → `premium-ui.css`
- **Non toccare** `tailwind.min.css` — ricompilare con: `npx tailwindcss -i tailwind.input.css -o tailwind.min.css --minify`

---

## Note architetturali — problemi noti

1. **`engine.js` troppo grande** (283K, 89 funzioni) — da splittare ulteriormente. Già iniziato: `engine-finance.js`, `engine-events.js`, `engine-rivals.js`.
2. **Coupling tramite `window.*`** — 43/47 file espongono globals. Cambiare una funzione può rompere silenziosamente altri file.
3. **`gameState` mutato direttamente** — nessuna immutabilità, nessun observer. Se qualcosa si rompe nello stato, è difficile tracciare chi ha scritto cosa.
4. **CSS con classi Tailwind hardcoded nei template JS** — `text-white`, `bg-black/50` etc. dentro template literal. Il CSS override in `style.css` (`#main-panel .text-white { ... }`) gestisce i casi principali ma non è esaustivo.
