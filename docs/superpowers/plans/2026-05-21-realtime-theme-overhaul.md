# Real-Time Engine & Light Theme Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix white-on-white text across the light panel, replace the simulated fast clock with Italian real time and a monotonic game-day counter, and replace hardcoded 2/10-minute trip durations with realistic price-derived real durations.

**Architecture:** Three independent parts: Part 1 (CSS + two inline-style files) has zero dependency on Parts 2–3. Part 2 (clock) adds helpers used by Part 3 (engine rewrite). Parts 2 and 3 both touch `engine.js`. The visual ride simulation loop (`activeRides`) is **kept intact** — it handles VIP mid-ride events and deferred-pay earnings computation. Only `_realMs` (the actual trip completion time) changes.

**Tech Stack:** Vanilla JS globals, Tailwind CSS (pre-compiled `tailwind.min.css`), Supabase, `Intl.DateTimeFormat` with `'Europe/Rome'` timezone.

**Constraints:**
- No ES6 import/export — all functions stay global
- No `npm run build:css` — all new CSS rules go in `style.css` as plain CSS or inline `style=`
- `gameState` accessed as bare `gameState` (let in engine.js scope), never `window.gameState`
- CODE FREEZE on Supabase RPC signatures

---

## File Map

| File | Change |
|------|--------|
| `style.css` | Add `text-gray-300/400`, `bg-gray-700/600`, `#tab-container` color override |
| `ui-ops.js` | Fix region card dark bg (`rgba(8,8,22,0.8)`) → white; fix border & title color |
| `index.html` | Remove "▶ Avanza Turno" sidebar button (lines 264–270) |
| `engine.js` | Add `GAME_EPOCH_MS`, `_getItalyTime()`, `_getRideDurationMs()`; rewrite `gameLoop` time-sync; update `updateUI()` date format; ride intervals + queue cap; offline catchup |

---

## Task 1: style.css — Remaining light-theme overrides

**Files:** Modify `style.css`

Context: `style.css` already overrides `text-white`, `bg-gray-950/900/800`, `bg-white/5`, `border-white/10`, and career dark sections. What's missing: `text-gray-300/400` (nearly invisible on white), `bg-gray-700/600` (dark cards on light panel), and `#tab-container` base text color.

- [ ] **Step 1: Locate insertion point in style.css**

  Open [style.css](style.css) and find lines 3789–3792:
  ```css
  /* Override hardcoded Tailwind dark text inside main-panel content */
  #main-panel .text-white:not(button):not(.ds-btn):not([class*="btn-"]) { color: #1a2744 !important; }
  #main-panel .text-gray-200 { color: #2a3e58 !important; }
  /* text-gray-300/400/500 stay as-is — readable on light bg naturally */
  ```

- [ ] **Step 2: Replace the wrong comment and add missing text-color overrides**

  Replace:
  ```css
  /* text-gray-300/400/500 stay as-is — readable on light bg naturally */
  ```
  With:
  ```css
  #main-panel .text-gray-300 { color: #2a3e58 !important; }
  #main-panel .text-gray-400 { color: #4d6480 !important; }
  ```

- [ ] **Step 3: Add bg-gray-700/600 overrides after the existing bg-gray-800 rule**

  Find line ~3800:
  ```css
  #main-panel .bg-gray-800   { background: #e0e6ec !important; }
  ```
  Add immediately after:
  ```css
  #main-panel .bg-gray-700   { background: #d8e2ed !important; }
  #main-panel .bg-gray-600   { background: #dce6ef !important; }
  #main-panel .bg-gray-700\/50 { background: rgba(30,45,69,0.05) !important; }
  ```

- [ ] **Step 4: Add #tab-container default text color**

  At the very end of the light-theme overrides block (after the ds-card shadow rules), add:
  ```css
  #tab-container { color: var(--text); }
  ```

- [ ] **Step 5: Verify in browser**

  Open the game, navigate to Classifica (Ranking) and Investimenti tabs. Text that was invisible (light gray on white) should now be readable in dark blue tones. No white text should appear on the light panel except inside `bg-[#111120]` / `bg-[#0e0e1c]` career dark sections.

- [ ] **Step 6: Commit**

  ```
  git add style.css
  git commit -m "fix: add text-gray-300/400 and bg-gray-700/600 light-theme overrides"
  ```

---

## Task 2: ui-ops.js — Region card light background

**Files:** Modify `ui-ops.js` lines 43–48

Context: Unowned region cards use `bgColor = 'rgba(8,8,22,0.8)'` (near-black) which makes all text invisible on the light panel. The border for accessible-but-unowned regions uses `rgba(255,255,255,0.07)` (invisible on white). The title uses `color:#e0e0ff` (light lavender, invisible on white).

- [ ] **Step 1: Fix bgColor, borderColor, and title color**

  In [ui-ops.js](ui-ops.js), find lines 43–48:
  ```javascript
  const borderColor = owned ? 'rgba(212,175,55,0.4)' : hasRep ? 'rgba(255,255,255,0.07)' : 'rgba(239,68,68,0.15)';
  const bgColor     = owned ? 'rgba(212,175,55,0.06)' : 'rgba(8,8,22,0.8)';

  html += `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:11px;font-weight:700;color:${owned ? '#d4af37' : '#e0e0ff'}">${r.name}</div>
  ```

  Replace with:
  ```javascript
  const borderColor = owned ? 'rgba(212,175,55,0.4)' : hasRep ? 'rgba(0,0,0,0.08)' : 'rgba(239,68,68,0.35)';
  const bgColor     = owned ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.92)';

  html += `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:11px;font-weight:700;color:${owned ? '#d4af37' : 'var(--text)'}">${r.name}</div>
  ```

- [ ] **Step 2: Verify in browser**

  Open the Operazioni tab → Regioni. Unowned region cards should now show on a white/near-white background with readable dark text. Owned cards (gold tint) should be unchanged. Locked cards (red border) should be visible.

- [ ] **Step 3: Commit**

  ```
  git add ui-ops.js
  git commit -m "fix: light-theme region card bg/border/text in ui-ops.js"
  ```

---

## Task 3: index.html — Remove "Avanza Turno" button

**Files:** Modify `index.html` lines 263–270

Context: In a real-time game, players cannot manually advance time. The button is also potentially confusing since it does nothing meaningful once real-time is active.

- [ ] **Step 1: Remove the Avanza Turno section**

  In [index.html](index.html), find and delete lines 263–270:
  ```html
        <!-- Advance turn at bottom -->
        <div class="px-3 py-3 mt-2 border-t" style="border-color:rgba(255,255,255,0.06)">
          <button onclick="window.advanceTime && window.advanceTime()"
                  class="w-full text-[9px] font-bold uppercase tracking-widest py-2 rounded-lg transition-all active:scale-95"
                  style="background:rgba(201,162,39,0.15);border:1px solid rgba(201,162,39,0.35);color:#c9a227">
            ▶ Avanza Turno
          </button>
        </div>
  ```

- [ ] **Step 2: Verify in browser**

  Open sidebar. The "▶ Avanza Turno" button should be gone. The sidebar should still close/scroll normally.

- [ ] **Step 3: Commit**

  ```
  git add index.html
  git commit -m "feat: remove Avanza Turno button (real-time engine)"
  ```

---

## Task 4: engine.js — Add GAME_EPOCH_MS and _getItalyTime()

**Files:** Modify `engine.js` — add before `function gameLoop()` at line 898

Context: `_getItalyTime()` returns real Italian local time and a monotonically increasing `gameDay` counter (day 1 = Nov 1 2025, game launch). Used by `gameLoop` and `updateUI`.

- [ ] **Step 1: Add GAME_EPOCH_MS constant and _getItalyTime() function**

  In [engine.js](engine.js), find line 897 (the blank line just before `function gameLoop()`):
  ```javascript

  function gameLoop() {
  ```

  Insert before `function gameLoop()`:
  ```javascript
  // ─── REAL-TIME ITALY CLOCK ────────────────────────────────────────
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
          hour:    parseInt(parts.hour,   10),
          minute:  parseInt(parts.minute, 10),
          day:     parseInt(parts.day,    10),
          month:   parseInt(parts.month,  10),
          year:    parseInt(parts.year,   10),
          gameDay: Math.max(1, Math.floor((Date.now() - GAME_EPOCH_MS) / 86400000) + 1),
      };
  }

  ```

- [ ] **Step 2: Verify in browser console**

  Open the game and in DevTools console run:
  ```javascript
  console.log(_getItalyTime());
  ```
  Expected output: `{hour: <current Italian hour>, minute: <current Italian minute>, day: <today's Italian calendar day>, month: <current month 1-12>, year: 2026, gameDay: <days since Nov 1 2025>}`

  As of May 2026, `gameDay` should be approximately 200+.

- [ ] **Step 3: Commit**

  ```
  git add engine.js
  git commit -m "feat: add GAME_EPOCH_MS and _getItalyTime() for Italian real-time clock"
  ```

---

## Task 5: engine.js — Rewrite gameLoop time-sync block

**Files:** Modify `engine.js` lines 898–1002 (the `gameLoop` function)

Context: Currently `gameLoop` runs every 600ms and adds `gameState.minute += 5` (simulated time). This means 1 real second ≈ 8 simulated game-hours. We replace this with real Italian time sync. Key changes:
- `_prevHour`/`_prevDay`/`_prevMin` tracked as local variables each frame
- Hourly mechanics fire when `gameState.hour !== _prevHour` (real hour boundary)
- `gameState.energy -= 5` per real hour (was `0.5` per simulated game-hour)
- Rival tick fires only when minute *changes* to a multiple of 15 (prevents 100× firing at minute 0)
- Day increment fires when `gameState.day !== _prevDay`
- Remove `if (gameState.hour >= 24)` wrap (real time is always 0–23)
- Remove `if (gameState.day > 30)` month wrap (gameDay is now monotonic)
- Keep `activeRides` visual loop intact — it computes deferred-pay earnings

- [ ] **Step 1: Replace the complete gameLoop function**

  Find the complete `function gameLoop() { ... }` block (lines 898–1002) and replace with:

  ```javascript
  function gameLoop() {
      if (gameState.paused) return;

      const _ita      = _getItalyTime();
      const _prevHour = gameState.hour;
      const _prevDay  = gameState.day;
      const _prevMin  = gameState.minute;

      // Sync game time to Italian real time
      gameState.hour   = _ita.hour;
      gameState.minute = _ita.minute;
      gameState.month  = _ita.month;
      gameState.day    = _ita.gameDay;   // monotonically increasing day counter

      // Hourly mechanics — fire only when real Italian hour changes
      if (gameState.hour !== _prevHour) {
          gameState.energy = Math.max(0, gameState.energy - 5);   // 5% per real hour
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
          // Talent Scout: refresh pool every 3 real hours
          if (gameState.staff.some(s => s.id === 'talent_scout') && _ita.hour % 3 === 0) {
              _refreshRecruits();
          }
          // Stagionalità: genera corse extra nelle alte stagioni
          const season = _getSeasonalMult();
          if (season.rideBonus > 1.0 && Math.random() < (season.rideBonus - 1.0) * 2) generatePOIRide();
          // Active campaigns: apply volumeBonus/prestigeBonus to ride spawn
          const _acList = gameState.activeCampaigns || [];
          _acList.forEach(ac => {
              const _camp = MARKETING_CAMPAIGNS.find(c => c.id === ac.id);
              if (!_camp) return;
              if (_camp.volumeBonus > 0 && Math.random() < _camp.volumeBonus) generatePOIRide();
              if (_camp.prestigeBonus > 0 && Math.random() < _camp.prestigeBonus * 0.5) generatePOIRide('vip');
          });
          // Brand Volume threshold → extra standard rides
          const _bv = gameState.brandVolume || 0;
          const _bp = gameState.brandPrestige || 0;
          if (_bv >= 75 && Math.random() < 0.30) generatePOIRide();
          else if (_bv >= 50 && Math.random() < 0.18) generatePOIRide();
          else if (_bv >= 25 && Math.random() < 0.08) generatePOIRide();
          // Brand Prestige threshold → extra VIP rides
          if (_bp >= 75 && Math.random() < 0.40) generatePOIRide('vip');
          else if (_bp >= 50 && Math.random() < 0.25) generatePOIRide('vip');
          else if (_bp >= 25 && Math.random() < 0.10) generatePOIRide('vip');
      }

      // Rival AI tick — only when minute changes to a 15-min boundary (prevents multi-fire)
      if (gameState.minute !== _prevMin && gameState.minute % 15 === 0) _tickRivalsActive();

      // Daily mechanics — fire only when game day counter increments
      if (gameState.day !== _prevDay) {
          processDailyRoutines();
      }

      autoDispatchRides();
      _kickstartIdleDrivers();

      // Visual trip simulation loop (also triggers VIP events and deferred-pay earnings)
      for (let i = gameState.activeRides.length - 1; i >= 0; i--) {
          let ride = gameState.activeRides[i];

          // Traffic system: 5% chance to enter heavy traffic (once per ride)
          if (!ride._trafficChecked && Math.random() < 0.05) {
              ride._trafficChecked = true;
              ride.inTraffic = true;
              ride._trafficClearsAt = ride.elapsed + Math.floor(ride.duration * 0.4);
              if (typeof showNotification === 'function') showNotification(`🚦 Traffico intenso verso ${ride.toPoi?.name || '?'}! Rallentamento previsto.`, 'error');
              logToMap(`🚦 Traffico: ${ride.toPoi?.name || ''} — velocità dimezzata.`);
          }
          // Clear traffic after its window
          if (ride.inTraffic && ride.elapsed >= (ride._trafficClearsAt || 0)) {
              ride.inTraffic = false;
              logToMap(`✅ Traffico risolto: ${ride.toPoi?.name || ''} — corsa ripresa.`);
          }

          // VIP/Ultra mid-ride event (10% chance, once per ride, only when not paused)
          if (!ride._vipEventChecked && (ride.tier === 'vip' || ride.tier === 'ultra') && Math.random() < 0.10 && !gameState.paused) {
              ride._vipEventChecked = true;
              if (ride.elapsed > ride.duration * 0.15) {
                  _triggerVIPMidRideEvent(ride);
              }
          }

          ride.elapsed += ride.inTraffic ? 2500 : 5000;
          if (ride.elapsed >= ride.duration) {
              completeRide(ride, true); // earnings deferred to checkActiveTrips
              gameState.activeRides.splice(i, 1);
          }
      }

      // Day/night cycle update
      if (typeof _updateDayNight === 'function') _updateDayNight();
      updateUI();
  }
  ```

- [ ] **Step 2: Verify in browser console**

  Open the game and check:
  1. The topbar clock shows the current Italian hour:minute (e.g., matches your device clock if Italy timezone)
  2. Open DevTools console, observe: `gameState.hour` and `gameState.minute` match real time
  3. No errors in console

- [ ] **Step 3: Commit**

  ```
  git add engine.js
  git commit -m "feat: rewrite gameLoop to sync Italian real time — hourly/daily mechanics on real boundaries"
  ```

---

## Task 6: engine.js — updateUI() date format

**Files:** Modify `engine.js` — `updateUI()` function around line 4649

Context: `gameState.day` is now a monotonic game-day counter (e.g., 202). The date display should show "Giorno 202 · 21 Mag" to communicate both game-day number and real Italian calendar date. The existing `updateUI` already handles time display via `gameState.hour/minute`.

- [ ] **Step 1: Update the tb-date line in updateUI()**

  Find in [engine.js](engine.js) around line 4649:
  ```javascript
  const elDate = document.getElementById('tb-date'); if(elDate) elDate.innerText = `${gameState.day} ${MONTHS[gameState.month-1]}`;
  ```

  Replace with:
  ```javascript
  const _itaNow = _getItalyTime();
  const elDate = document.getElementById('tb-date'); if(elDate) elDate.innerText = `Giorno ${gameState.day} · ${_itaNow.day} ${MONTHS[_itaNow.month-1]}`;
  ```

- [ ] **Step 2: Verify in browser**

  The topbar date element should now show something like "Giorno 202 · 21 Mag" instead of "1 Gen".

- [ ] **Step 3: Commit**

  ```
  git add engine.js
  git commit -m "feat: update topbar date to show game day counter and Italian calendar date"
  ```

---

## Task 7: engine.js — _getRideDurationMs() + replace _realMs

**Files:** Modify `engine.js` — add function before `assignRideToDriver`, replace line 3047

Context: The trip system uses `startTime`/`endTime` with real `Date.now()` timestamps. Currently `_realMs` is hardcoded: 2 min for city, 10 min for intercity. We replace this with a price-derived estimate: €1 ≈ 0.4 real minutes, capped 10–360 min. Type adjustments: Airport/Rail/Port ×0.7, Boat ×1.3. Cross-region ×1.5.

The `activeRides` visual simulation loop uses `ride.duration` (20000ms city / 40000ms intercity) which is SEPARATE — it stays unchanged. Only `_realMs` changes.

- [ ] **Step 1: Add _getRideDurationMs() before assignRideToDriver**

  Find the function `function assignRideToDriver` (around line 2900). Insert immediately before it:

  ```javascript
  function _getRideDurationMs(ride) {
      const price = ride.sellingPrice || ride.basePrice || ride.price || 150;
      let minutes = Math.max(10, Math.min(360, price * 0.4));
      const type = (ride.type || '').toLowerCase();
      if (type === 'airport' || type === 'rail' || type === 'port') minutes *= 0.7;
      else if (type === 'boat') minutes *= 1.3;
      const fromRegion = ride.fromPoi?.region || '';
      const toRegion   = ride.toPoi?.region   || '';
      if (fromRegion && toRegion && fromRegion !== toRegion) minutes *= 1.5;
      return Math.round(minutes) * 60 * 1000;
  }

  ```

- [ ] **Step 2: Replace _realMs in assignRideToDriver**

  Find lines 3045–3047 in `assignRideToDriver`:
  ```javascript
  // Real-time trip entry: 2 min city, 10 min intercity (accelerated for testing)
  const _isIntercity = ride.fromPoi.region !== ride.toPoi.region;
  const _realMs      = _isIntercity ? 10 * 60 * 1000 : 2 * 60 * 1000;
  ```

  Replace with:
  ```javascript
  // Real-time trip duration derived from route price (€1 ≈ 0.4 min, capped 10–360 min)
  const _isIntercity = ride.fromPoi.region !== ride.toPoi.region;
  const _realMs      = _getRideDurationMs(ride);
  ```

- [ ] **Step 3: Verify in browser console**

  In DevTools console, after dispatching a standard city ride:
  ```javascript
  gameState.activeTrips.slice(-1)[0]
  ```
  Check `endTime - startTime`. For a €150 city ride: expected ≈ 60 min × 60000 = 3,600,000 ms. For a €400 intercity ride: expected ≈ 160 min × 1.5 × 60000 = 14,400,000 ms (4 hours).

- [ ] **Step 4: Commit**

  ```
  git add engine.js
  git commit -m "feat: add _getRideDurationMs() — replace hardcoded 2/10min trip times with price-derived real durations"
  ```

---

## Task 8: engine.js — Ride generation slowdown + queue cap

**Files:** Modify `engine.js` lines 869–870 (startGame intervals) and line 2602 (generatePOIRide guard)

Context: In real-time, generating a ride every 6 seconds floods the queue with 600+ rides/hour. We slow down to 5 min (POI) and 8 min (contract), and tighten the queue cap from `> 20` to `>= 15`.

- [ ] **Step 1: Change ride generation intervals in startGame**

  Find in [engine.js](engine.js) lines 868–870:
  ```javascript
  _gameIntervals.push(
      setInterval(gameLoop, 600),
      setInterval(generatePOIRide, 6000),
      setInterval(generateContractRide, 9000),  // 40% mix: 1 contract every 9s vs POI every 6s
  ```

  Replace the two ride generation lines with:
  ```javascript
  _gameIntervals.push(
      setInterval(gameLoop, 600),
      setInterval(generatePOIRide, 5 * 60 * 1000),      // every 5 min real time
      setInterval(generateContractRide, 8 * 60 * 1000),  // every 8 min real time
  ```

- [ ] **Step 2: Tighten the pending rides queue cap**

  Find in `generatePOIRide` (around line 2602):
  ```javascript
  if (gameState.pendingRides.length > 20) return null;
  ```

  Replace with:
  ```javascript
  if ((gameState.pendingRides || []).length >= 15) return null;
  ```

- [ ] **Step 3: Verify in browser**

  After loading the game, open Corse tab. Within the first minute, the pending rides queue should NOT jump to 20+ items. It should start near 0 and grow at most 12/hour (1 per 5 min POI + 1 per 8 min contract).

- [ ] **Step 4: Commit**

  ```
  git add engine.js
  git commit -m "feat: slow ride generation to 5/8 min real-time intervals, cap queue at 15"
  ```

---

## Task 9: engine.js — Offline catchup + saveGame timestamp

**Files:** Modify `engine.js` — `saveGame()`, `startGame()` (around line 4857), add `_processOfflineCatchup()`

Context: When the player reopens the browser after being offline, passive income (investment returns, HQ rent) should be credited for elapsed real days. `processDailyRoutines()` handles this — we call it once per elapsed day (capped at 7 days to prevent abuse). `lastOnlineTimestamp` is set on every save (every ~60s).

- [ ] **Step 1: Set lastOnlineTimestamp in saveGame()**

  Find `function saveGame()` at line 462:
  ```javascript
  function saveGame() {
      if (typeof window.saveCurrentSlot === 'function' && window.currentSlotIndex !== null) {
          window.saveCurrentSlot();
  ```

  Replace the body with:
  ```javascript
  function saveGame() {
      if (typeof window.saveCurrentSlot === 'function' && window.currentSlotIndex !== null) {
          gameState.lastOnlineTimestamp = Date.now();
          window.saveCurrentSlot();
  ```

- [ ] **Step 2: Add _processOfflineCatchup() function**

  Find `function loadGame()` at line 469. Insert the following function immediately before it:

  ```javascript
  function _processOfflineCatchup() {
      const lastOnline = gameState.lastOnlineTimestamp || 0;
      if (!lastOnline) return;
      const elapsedMs   = Date.now() - lastOnline;
      const elapsedDays = Math.min(7, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
      if (elapsedDays < 1) return;
      for (let i = 0; i < elapsedDays; i++) {
          processDailyRoutines();
      }
      if (typeof showNotification === 'function') {
          showNotification(`💤 Offline per ${elapsedDays} giorno${elapsedDays > 1 ? 'i' : ''} — redditi processati.`, 'info');
      }
  }

  ```

- [ ] **Step 3: Call _processOfflineCatchup() in startGame() after loadGame**

  Find in `startGame()` (around line 4857–4859):
  ```javascript
  if (!fresh) {
      const loaded = loadGame();
      initGame(!loaded);
  } else {
  ```

  Replace with:
  ```javascript
  if (!fresh) {
      const loaded = loadGame();
      initGame(!loaded);
      setTimeout(_processOfflineCatchup, 800); // run after initGame fully wires up UI
  } else {
  ```

- [ ] **Step 4: Verify in browser**

  1. Start/load the game to ensure `saveGame()` runs — check DevTools: `gameState.lastOnlineTimestamp` should be a recent Unix timestamp (ms since epoch, ~1.748e12 range)
  2. To test catchup: in DevTools console run `gameState.lastOnlineTimestamp = Date.now() - 2 * 24 * 60 * 60 * 1000` then reload. Within 1 second of loading, a notification "💤 Offline per 2 giorni — redditi processati." should appear.

- [ ] **Step 5: Commit**

  ```
  git add engine.js
  git commit -m "feat: offline income catchup — track lastOnlineTimestamp, process daily routines on reload"
  ```

---

## Task 10: Commit spec document

**Files:** `docs/superpowers/specs/2026-05-21-realtime-theme-overhaul-design.md`

The spec was written in the previous session but not yet committed.

- [ ] **Step 1: Commit the spec**

  ```
  git add docs/superpowers/specs/2026-05-21-realtime-theme-overhaul-design.md
  git add docs/superpowers/plans/2026-05-21-realtime-theme-overhaul.md
  git commit -m "docs: add real-time engine + light theme overhaul spec and implementation plan"
  ```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| CSS: text-gray-300/400, bg-gray-700/600, #tab-container | Task 1 |
| ui-ops.js: region card dark bg → light | Task 2 |
| ui-dispatch.js, ui-fleet.js, ui-staff.js inline fixes | ⚠️ See note below |
| index.html: remove Avanza Turno | Task 3 |
| engine.js: _getItalyTime(), GAME_EPOCH_MS | Task 4 |
| engine.js: gameLoop real-time sync | Task 5 |
| engine.js: updateUI date format "Giorno N · DD Mon" | Task 6 |
| engine.js: _getRideDurationMs(), replace _realMs | Task 7 |
| engine.js: ride generation slowdown + queue cap | Task 8 |
| engine.js: offline catchup + lastOnlineTimestamp | Task 9 |
| Commit spec + plan | Task 10 |

**Note on ui-dispatch.js / ui-fleet.js / ui-staff.js:** Investigation of the actual files shows these are largely covered by the existing CSS override `#main-panel .text-white:not(button)...` (already in style.css from a prior commit) plus the new Task 1 overrides for `text-gray-300/400`. The spec's per-file inline style notes for these three files were either already fixed, protected by CSS class overrides, or concern modal overlays that are intentionally dark (staff configurator modal `background:#111114`). No additional per-file inline changes needed.

**Placeholder scan:** No TBDs or incomplete steps found.

**Type consistency:** `_getItalyTime()` defined in Task 4, used in Task 5 (`gameLoop`) and Task 6 (`updateUI`). `_getRideDurationMs()` defined in Task 7, used in Task 7. `_processOfflineCatchup()` defined in Task 9, called in Task 9. No cross-task type mismatches.
