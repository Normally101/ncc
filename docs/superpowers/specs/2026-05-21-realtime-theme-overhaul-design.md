# Chauffeur Empire — Real-Time Engine & Light Theme Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the unreadable light-theme UI (make it match eRepublik's dark-sidebar + light-content-with-dark-text aesthetic) and replace the simulated fast clock with Italian real time and realistic trip durations.

**Architecture:** Three independent parts that can be implemented sequentially without blocking each other. Part 1 (CSS/JS readability) has zero dependency on Parts 2–3. Part 2 (clock display) lays the groundwork for Part 3 (engine). Parts 2 and 3 both touch `engine.js` and `index.html`.

**Tech Stack:** Vanilla JS globals, Tailwind CSS (build via `npm run build:css` on macOS), Supabase, `Intl.DateTimeFormat` for timezone, `Date.now()` for real timestamps.

**Constraints (must remain in effect):**
- No ES6 import/export — all functions are globals
- No `window.gameState` — access via bare `gameState` (it's a `let` in engine.js scope)
- No `npm run build:css` on this Windows machine — use inline `style=` for any new CSS not already in `tailwind.min.css`
- CODE FREEZE on Supabase RPC signatures — server-side stored procedures are not changed

---

## Part 1 — Light Theme Fix (eRepublik style)

### Root cause

All `renderTab*` functions use dark-theme Tailwind patterns (`text-white`, `text-gray-300`, `bg-white/5`, `border-white/10`) because the panel was originally dark. The panel background was changed to `#f0f4f8` but inline `color:#fff` and opacity-based utility classes became invisible.

### CSS changes (style.css)

Add to the light-theme overrides block (after existing `border-white/20` rule):

```css
/* Text: make dark-theme grays readable on light panel */
#main-panel .text-gray-300 { color: #2a3e58 !important; }
#main-panel .text-gray-400 { color: #4d6480 !important; }

/* Additional dark-bg class overrides */
#main-panel .bg-gray-700   { background: #d8e2ed !important; }
#main-panel .bg-gray-600   { background: #dce6ef !important; }
#main-panel .bg-gray-700\/50 { background: rgba(30,45,69,0.05) !important; }

/* Default text color for all tab content */
#tab-container { color: var(--text); }
```

The existing overrides for `text-white`, `bg-white/5`, `bg-white/10`, `border-white/10`, `bg-gray-950`, `bg-gray-900`, `bg-gray-800` remain in place.

### Inline style fixes (ui-*.js files)

Each file has patterns written for dark backgrounds that must be flipped for light. The rule: anything that sets `color: #fff / white / rgba(255,255,255,x)` on an element that sits directly on the light panel must become `var(--text)` or `var(--text-muted)`. Dark card backgrounds (`background:rgba(8,8,22,0.8)`, `background:rgba(0,0,0,0.8)`) that are not intentional (career/fleet glass) must become `background:var(--card)` with `border:1px solid var(--card-border)`.

**Files and specific patterns:**

`ui-dispatch.js`:
- Driver card status text: `color:#9ca3af` (already readable), but any `color:#fff` headings → `color:var(--text)`

`ui-fleet.js`:
- Already partially fixed. Remaining: section-title inline colors inside filter bar labels

`ui-staff.js`:
- Configurator modal: this is a modal overlay with `background:#111114` — it is intentionally dark and must STAY dark (don't change the modal's dark bg or its white text)
- Driver assignment list: `color:#e0e0ff` inline text → `color:var(--text-muted)`

`ui-ops.js` (regions/provinces):
- Region card `style="background:${bgColor};border:1px solid ${borderColor}"` where `bgColor` uses `rgba(8,8,22,0.8)` → replace with `rgba(255,255,255,0.9)` for unowned, `rgba(212,175,55,0.08)` for owned
- Province card title `color:#fff` → `color:var(--text)`
- Province hud-card already inherits from `.hud-card` CSS rule

`ui-meta.js`:
- `renderTabRanking`: table rows with `color:rgba(255,255,255,0.8)` → `color:var(--text-muted)`
- `renderTabInvestments`: card `background:rgba(8,8,22,0.8)` → `background:var(--card)`, `color:#e0e0ff` → `color:var(--text)`
- `renderTabLegal`: same dark card pattern
- `renderTabPolitics`: same
- `renderTabMarket`: inline white text on dark card
- `renderTabHelp`: help card backgrounds
- `renderTabRealEstate`: card backgrounds and text
- `renderTabCareer`: hero banners (`tGrad`) intentionally dark — KEEP. Task box `bg-[#111120]` and reward section `bg-[#0e0e1c]` intentionally dark — KEEP. Only fix elements that sit on the light panel outside those dark sections.
- `renderTabPremiumStore`: store cards dark bg → light card

### What stays dark (intentional)

- Fleet card glassmorphism (`fleet-card-glass` CSS class) — white text on dark glass
- Finance / Market tabs (`ui-finance-mkt.js`) — terminal aesthetic, explicitly kept
- Career quest hero banners (inline `tGrad` gradient)
- Task box (`bg-[#111120]`) and reward section (`bg-[#0e0e1c]`) inside career cards
- Staff configurator modal (overlay with `background:#111114`)

---

## Part 2 — Italian Real-Time Clock

### Display changes

Replace the simulated clock display with Italian real time.

**New utility in `engine.js` (or a new `ui-clock.js`):**
```javascript
const GAME_EPOCH_MS = new Date('2025-11-01T00:00:00+01:00').getTime();

function _getItalyTime() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    return {
        hour:   parseInt(parts.hour,   10),
        minute: parseInt(parts.minute, 10),
        day:    parseInt(parts.day,    10),
        month:  parseInt(parts.month,  10),
        year:   parseInt(parts.year,   10),
        gameDay: Math.max(1, Math.floor((Date.now() - GAME_EPOCH_MS) / 86400000) + 1),
    };
}
```

**Topbar update** (runs every 15 seconds via `setInterval`):
```javascript
function _syncClockDisplay() {
    const t = _getItalyTime();
    const el = document.getElementById('tb-time');
    const ed = document.getElementById('tb-date');
    if (el) el.textContent = `${String(t.hour).padStart(2,'0')}:${String(t.minute).padStart(2,'0')}`;
    const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    if (ed) ed.textContent = `Giorno ${t.gameDay} · ${t.day} ${MONTHS[t.month-1]}`;
}
```

Call `_syncClockDisplay()` on game start and every 15 seconds.

### Remove "Avanza Turno" button

In `index.html`, remove the `▶ Avanza Turno` button from the sidebar. In a real-time game, players cannot manually advance time.

---

## Part 3 — Real-Time Engine

### Key insight

The trip system already uses real `Date.now()` timestamps (`startTime`/`endTime` in `activeTrips`). The comment on line 3045 says "accelerated for testing". **No architectural change is needed** — only the duration values change.

### gameLoop changes

Replace `gameState.minute += 5` with real-time sync. The loop still runs every 600ms for UI responsiveness and event generation, but time advances only when real Italian time advances.

```javascript
function gameLoop() {
    if (gameState.paused) return;

    const _ita = _getItalyTime();
    const _prevHour = gameState.hour;
    const _prevDay  = gameState.day;

    // Sync game time to Italian real time
    gameState.hour   = _ita.hour;
    gameState.minute = _ita.minute;
    gameState.month  = _ita.month;
    gameState.day    = _ita.gameDay;   // monotonically increasing day counter

    // Hourly mechanics — fire only when real Italian hour changes
    if (gameState.hour !== _prevHour) {
        gameState.energy = Math.max(0, gameState.energy - 5);   // 5% per real hour (was 0.5/game-hour)
        _tickFatigue();
        _tickWeather();
        _tickEmails();
        _tickFuelPrice();
        _tickDynamicEvent();
        _maybeStrike();
        _checkPrestige();
        autoNegotiateEmails();
        if (typeof window._nemesisTick === 'function') window._nemesisTick();
        if (typeof window.CE_Alert !== 'undefined') window.CE_Alert.tick();
        _tickStockMarket();
        _tickBrokerInvestments();
        _payStockDividends();
        _updateCreditScore();
        if (hasInvestment('inv_app')) { generatePOIRide(); generatePOIRide(); }
        if (hasInvestment('inv_hangar')) generatePOIRide('ultra');
        if (gameState.staff.some(s => s.id === 'talent_scout') && _ita.hour % 3 === 0) {
            _refreshRecruits();
        }
        const season = _getSeasonalMult();
        if (season.rideBonus > 1.0 && Math.random() < (season.rideBonus - 1.0) * 2) generatePOIRide();
        // ... active campaign bonuses (same as before)
    }

    // Daily mechanics — fire only when game day counter increments
    if (gameState.day !== _prevDay) {
        processDailyRoutines();
    }

    // Remove the old day > 30 wrap logic (day is now monotonic)

    // Rival AI tick every 15 real minutes (unchanged, setInterval handles this)
    autoDispatchRides();
    _kickstartIdleDrivers();

    // Active rides loop: remove the old elapsed-game-minute processing
    // Trips complete via checkActiveTrips() which runs every 5s on its own setInterval

    updateUI();
}
```

**Remove from gameLoop:** The `for (let i = gameState.activeRides.length - 1; ...)` ride-processing loop (lines 966–1050 approx). Trip completion is handled entirely by `checkActiveTrips()` via real timestamps. The `activeRides` array can remain for map display purposes but the time-based completion logic moves fully to `checkActiveTrips`.

**Remove the old day-wrap:** Delete `if (gameState.day > 30) { gameState.day = 1; gameState.month = ... }` — game day is now monotonic.

### Trip duration function

New function to estimate real travel duration for each ride:

```javascript
function _getRideDurationMs(ride) {
    const BASE_MS = 60 * 1000; // 1 minute in ms

    // Use route's sellingPrice as a distance proxy (validated: short routes €100-150, long €400-900)
    const price = ride.sellingPrice || ride.basePrice || 150;

    // Base duration: €1 ≈ 0.4 real minutes (€150 = 60min, €400 = 160min, €900 = 360min)
    let minutes = Math.max(10, Math.min(360, price * 0.4));

    // Type adjustments
    const type = (ride.type || '').toLowerCase();
    if (type === 'airport' || type === 'rail' || type === 'port') {
        minutes *= 0.7;  // transfers are shorter
    } else if (type === 'city-to-city') {
        minutes *= 1.0;  // keep as-is
    } else if (type === 'boat') {
        minutes *= 1.3;  // water transport is slower
    }

    // Cross-region multiplier
    const fromRegion = ride.fromPoi?.region || ride.region || '';
    const toRegion   = ride.toPoi?.region   || ride.region || '';
    if (fromRegion && toRegion && fromRegion !== toRegion) {
        minutes *= 1.5;  // cross-region routes take longer
    }

    return Math.round(minutes) * BASE_MS;
}
```

**Replace the hardcoded `_realMs` in `assignRideToDriver`** (engine.js line 3047):
```javascript
// Before:
const _realMs = _isIntercity ? 10 * 60 * 1000 : 2 * 60 * 1000;

// After:
const _realMs = _getRideDurationMs(ride);
```

### Ride generation slowdown

Change `setInterval` values in `startGame()`:

```javascript
// Before:
setInterval(generatePOIRide,      6000),   // every 6s
setInterval(generateContractRide, 9000),   // every 9s

// After (real-time: generate a few rides per hour, not hundreds):
setInterval(generatePOIRide,      5 * 60 * 1000),   // every 5 min
setInterval(generateContractRide, 8 * 60 * 1000),   // every 8 min
```

Also cap the pending ride queue to prevent buildup during offline periods:
```javascript
function generatePOIRide(tier) {
    if ((gameState.pendingRides || []).length >= 15) return;  // cap at 15 pending
    // ... existing logic
}
```

### Offline income catchup

When the player reopens the browser after being offline, process missed hourly income for elapsed real hours.

New function called in `loadGame()` after restoring state:

```javascript
function _processOfflineCatchup() {
    const lastOnline = gameState.lastOnlineTimestamp || Date.now();
    const elapsedMs  = Date.now() - lastOnline;
    const elapsedHours = Math.min(24, Math.floor(elapsedMs / (60 * 60 * 1000)));
    if (elapsedHours < 1) return;

    for (let i = 0; i < elapsedHours; i++) {
        processHourlyIncome();
    }
    if (elapsedHours >= 1) {
        showNotification(`💤 Offline per ${elapsedHours}h — income processato.`, 'info');
    }
}
```

Set `gameState.lastOnlineTimestamp = Date.now()` in `saveGame()` (called every 60s already).

### Backward compatibility for existing saves

- `gameState.day` old range 1-30 → new value will jump to ~202 on first load. All old `endsHour / expiresAt` values (e.g. `15*24+3 = 363`) will be less than new `day*24+hour` (~202*24+9 ≈ 4857) → all old expiry items are immediately expired. Acceptable — they were practically expired anyway.
- Active trips with no `endTime` set: on `checkActiveTrips()`, trips with `now > endTime` complete. Old trips with `endTime ≈ 0` will complete immediately on load. Acceptable.
- `gameState.energy`: was depleting fast (game-hours). May be nearly 0 on old saves. Player just needs to rest — no action needed.

### fuelPriceLock time expression

`gameState.fuelPriceLockUntil` uses `gameState.day * 24 + gameState.hour`. With monotonic day counter, this expression now correctly represents an absolute "game hour" that increases over time. Existing checks like `gameState.fuelPriceLockUntil > gameState.day * 24 + gameState.hour` remain valid.

---

## Data model changes summary

| Field | Before | After |
|-------|--------|-------|
| `gameState.hour` | 0-23 simulated, advances ~8x per real minute | 0-23 Italian real time |
| `gameState.minute` | 0-55 simulated, advances every 600ms | 0-59 Italian real time |
| `gameState.day` | 1-30 simulated month day | Monotonic day counter from GAME_EPOCH (day 1 = Nov 1 2025) |
| `gameState.month` | 1-12 simulated month | 1-12 Italian real calendar month |
| `gameState.lastOnlineTimestamp` | (new field) | Unix ms of last saveGame call |
| Trip `endTime` | `Date.now() + 2/10min` | `Date.now() + _getRideDurationMs(ride)` |
| `GAME_EPOCH_MS` | (new constant) | `new Date('2025-11-01T00:00:00+01:00').getTime()` |

---

## File change summary

| File | Change |
|------|--------|
| `style.css` | Add `text-gray-300/400` overrides, `bg-gray-700/600` overrides, `#tab-container` base color |
| `ui-dispatch.js` | Fix inline white text patterns |
| `ui-fleet.js` | Fix remaining inline white/dark patterns |
| `ui-staff.js` | Fix inline white text outside modal overlay |
| `ui-ops.js` | Fix region/province card backgrounds and text |
| `ui-meta.js` | Fix ranking, investments, legal, politics, market, help, real-estate, premium-store card colors; keep career dark sections dark |
| `index.html` | Remove "Avanza Turno" button; add `_syncClockDisplay` setInterval script |
| `engine.js` | Add `_getItalyTime()`, `_getRideDurationMs()`, `_processOfflineCatchup()`; rewrite `gameLoop` time-sync block; change setInterval durations; add queue cap |
