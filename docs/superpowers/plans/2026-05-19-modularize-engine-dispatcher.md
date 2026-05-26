# Engine + Dispatcher Modularization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Split engine.js (5,905 lines) and dispatcher.js (6,018 lines) into focused domain modules, reducing both files to under 4,500 lines without changing any game logic.

**Architecture:** Global-function script-tag approach — no ES6 import/export, no bundler. Each new file exposes global functions; HTML loads files in strict dependency order. All `onclick="functionName()"` handlers in HTML continue working unchanged.

**Tech Stack:** Vanilla JS, no build tools. Files added via `<script src="...">` in index.html.

---

## Dependency Order (critical — must follow this loading sequence)

```
data.js                ← already first
engine.js              ← defines gameState, hasInvestment, showNotification, logToMap
engine-finance.js      ← NEW: stocks, broker, credit (calls gameState, showNotification)
engine-rivals.js       ← NEW: rival AI, sabotage (calls gameState, generatePOIRide)
engine-events.js       ← NEW: fines, police, strikes, dynamic events (calls showNotification, logToMap)
vip_clients.js         ← unchanged
war_room.js            ← unchanged
dispatcher.js          ← defines tab routing, map functions, most renderTab* functions
ui-emails.js           ← NEW: renderTabEmails (calls gameState, renderTabEmails from itself)
ui-finance-mkt.js      ← NEW: renderTabFinance + renderTabMarketing + _flashTicker
[all other .js files]  ← unchanged
```

**Rule:** Each new file must load AFTER engine.js (needs gameState) and its own file can call functions from previously-loaded files freely — all are global.

---

## File Structure

| File | Lines extracted | Functions moved |
|---|---|---|
| `engine-finance.js` (create) | ~500 from engine.js | `_hasWealthManager`, `_initStockPrices`, `_tickStockMarket`, `_payStockDividends`, `_tickBrokerInvestments`, `_updateCreditScore`, `_getCreditTier`, `_tickMacroEconomy`, `_tickStockHistory` |
| `engine-rivals.js` (create) | ~170 from engine.js | `_tickPricewars`, `_ensureRivalState`, `_tickRivalsActive`, `_tickRivalsDaily`, `_maybeRivalSabotage` |
| `engine-events.js` (create) | ~600 from engine.js | `_tickPoliceHeat`, `_triggerBankruptcy`, `_maybeStrike`, `_maybeGenerateDynamicEvent`, `_tickDynamicEvent`, `_maybeGenerateFine`, `_maybeGenerateZTLFine`, `_maybeGenerateCantieri`, `_tickCantieri`, `_getCantieriSpeedMult`, `_maybePoliceCheckpoint`, `_maybeParazziEvent` |
| `ui-emails.js` (create) | ~730 from dispatcher.js | `renderTabEmails` (entire function) |
| `ui-finance-mkt.js` (create) | ~820 from dispatcher.js | `_flashTicker`, `renderTabFinance`, `renderTabMarketing` |
| `engine.js` (modify) | remove ~1,270 lines | the 26 functions above |
| `dispatcher.js` (modify) | remove ~1,550 lines | the 4 functions above |
| `index.html` (modify) | +6 `<script>` tags | add new files in correct order |

---

## Task 1: Create engine-finance.js

**Files:**
- Create: `engine-finance.js`
- Modify: `engine.js` (delete the extracted functions)

**Background:** These 9 functions manage the stock market, broker investments, credit score, and macroeconomy. They are called from `processDailyRoutines()` and `_tickBrokerInvestments()` but are otherwise self-contained. They only use globals: `gameState`, `STOCK_TICKERS`, `STOCK_SECTORS`, `LOAN_TIERS`, `showNotification`, `logToMap`, `hasInvestment`.

- [x] **Step 1.1: Verify function locations in engine.js**

Run:
```bash
grep -n "^function _hasWealthManager\|^function _initStockPrices\|^function _tickStockMarket\|^function _payStockDividends\|^function _tickBrokerInvestments\|^function _updateCreditScore\|^function _getCreditTier\|^function _tickMacroEconomy\|^function _tickStockHistory" engine.js
```

Expected: 9 lines with line numbers around 4398–4870. Record the START line of each function and the START line of the next function (that's where the previous one ends).

- [x] **Step 1.2: Create engine-finance.js with a file header**

Create `engine-finance.js` with this exact header:

```js
'use strict';
/* ================================================================
   engine-finance.js — Chauffeur Empire
   Stock market, broker investments, credit score, macroeconomy.
   Loaded AFTER engine.js (needs: gameState, showNotification,
   logToMap, hasInvestment, STOCK_TICKERS, STOCK_SECTORS, LOAN_TIERS)
   ================================================================ */
```

- [x] **Step 1.3: Cut each function from engine.js and paste into engine-finance.js**

For each of the 9 functions (`_hasWealthManager`, `_initStockPrices`, `_tickStockMarket`, `_payStockDividends`, `_tickBrokerInvestments`, `_updateCreditScore`, `_getCreditTier`, `_tickMacroEconomy`, `_tickStockHistory`):

1. In engine.js: find the function's start line (from Step 1.1) to the blank line before the NEXT function
2. **Cut** that block (including any section comment `// ─── ...` immediately above the function)
3. **Paste** at the bottom of engine-finance.js

Do this for all 9 functions. Keep them in the same relative order they appear in engine.js.

- [x] **Step 1.4: Verify engine.js no longer contains the extracted functions**

Run:
```bash
grep -c "function _tickStockMarket\|function _tickBrokerInvestments\|function _initStockPrices" engine.js
```
Expected output: `0`

- [x] **Step 1.5: Verify engine-finance.js contains all 9 functions**

Run:
```bash
grep -c "^function " engine-finance.js
```
Expected: `9`

- [x] **Step 1.6: Check that call sites in engine.js still exist (they should — callers stay)**

Run:
```bash
grep -n "_tickStockMarket\|_tickBrokerInvestments\|_initStockPrices\|_tickMacroEconomy" engine.js | head -20
```
Expected: Lines inside `processDailyRoutines`, `gameLoop`, `initGame` — the CALLS remain in engine.js, only the DEFINITIONS moved.

- [x] **Step 1.7: Commit (do NOT update index.html yet — engine-finance.js not loaded yet)**

```bash
git add engine.js engine-finance.js
git commit -m "refactor: extract finance domain → engine-finance.js"
```

---

## Task 2: Create engine-rivals.js

**Files:**
- Create: `engine-rivals.js`
- Modify: `engine.js` (delete the 5 extracted functions)

**Background:** 5 functions managing rival AI companies: price wars, active ticking, daily ticking, sabotage, and state initialization. All called from `gameLoop` and `processDailyRoutines` in engine.js. They use globals: `gameState`, `RIVALS`, `showNotification`, `logToMap`, `generatePOIRide`.

- [x] **Step 2.1: Verify function locations**

Run:
```bash
grep -n "^function _tickPricewars\|^function _ensureRivalState\|^function _tickRivalsActive\|^function _tickRivalsDaily\|^function _maybeRivalSabotage" engine.js
```
Expected: 5 lines around lines 2296–2462.

- [x] **Step 2.2: Create engine-rivals.js**

```js
'use strict';
/* ================================================================
   engine-rivals.js — Chauffeur Empire
   Rival company AI: price wars, active tick, sabotage.
   Loaded AFTER engine.js (needs: gameState, RIVALS,
   showNotification, logToMap, generatePOIRide)
   ================================================================ */
```

- [x] **Step 2.3: Cut the 5 rival functions from engine.js → engine-rivals.js**

Functions to move (in order): `_tickPricewars`, `_ensureRivalState`, `_tickRivalsActive`, `_tickRivalsDaily`, `_maybeRivalSabotage`.

Include the `// ─── RIVALI ─────` section comment above the block.

- [x] **Step 2.4: Verify extraction**

```bash
grep -c "^function _tickRivalsActive\|^function _maybeRivalSabotage" engine.js
```
Expected: `0`

```bash
grep -c "^function " engine-rivals.js
```
Expected: `5`

- [x] **Step 2.5: Commit**

```bash
git add engine.js engine-rivals.js
git commit -m "refactor: extract rivals domain → engine-rivals.js"
```

---

## Task 3: Create engine-events.js

**Files:**
- Create: `engine-events.js`
- Modify: `engine.js` (delete the 12 extracted functions)

**Background:** 12 functions for the penalty/event system: police heat, bankruptcy, driver strikes, dynamic events, fines (standard + ZTL), construction zones (cantieri), police checkpoints, and paparazzi events. Called from `gameLoop` and `processDailyRoutines`. Dependencies: `gameState`, `showNotification`, `logToMap`, `_applyEmailTemplate`, `drawCheckpointMarker` (dispatcher.js — safe because runtime-only call).

- [x] **Step 3.1: Verify function locations**

Run:
```bash
grep -n "^function _tickPoliceHeat\|^function _triggerBankruptcy\|^function _maybeStrike\|^function _maybeGenerateDynamicEvent\|^function _tickDynamicEvent\|^function _maybeGenerateFine\|^function _maybeGenerateZTLFine\|^function _maybeGenerateCantieri\|^function _tickCantieri\|^function _getCantieriSpeedMult\|^function _maybePoliceCheckpoint\|^function _maybeParazziEvent" engine.js
```
Expected: 12 lines from roughly 1278 to 2086.

- [x] **Step 3.2: Create engine-events.js**

```js
'use strict';
/* ================================================================
   engine-events.js — Chauffeur Empire
   Fines, police, strikes, dynamic events, cantieri, paparazzi.
   Loaded AFTER engine.js (needs: gameState, showNotification,
   logToMap, _applyEmailTemplate; calls drawCheckpointMarker
   from dispatcher.js which is safe because runtime-only)
   ================================================================ */
```

- [x] **Step 3.3: Cut all 12 functions from engine.js → engine-events.js**

In order: `_tickPoliceHeat`, `_triggerBankruptcy`, `_maybeStrike`, `_maybeGenerateDynamicEvent`, `_tickDynamicEvent`, `_maybeGenerateFine`, `_maybeGenerateZTLFine`, `_maybeGenerateCantieri`, `_tickCantieri`, `_getCantieriSpeedMult`, `_maybePoliceCheckpoint`, `_maybeParazziEvent`.

Include section comments (`// ─── POLICE HEAT ─────`, etc.) above each block.

- [x] **Step 3.4: Verify extraction**

```bash
grep -c "^function _maybeGenerateFine\|^function _tickPoliceHeat\|^function _maybePoliceCheckpoint" engine.js
```
Expected: `0`

```bash
grep -c "^function " engine-events.js
```
Expected: `12`

- [x] **Step 3.5: Commit**

```bash
git add engine.js engine-events.js
git commit -m "refactor: extract events/fines domain → engine-events.js"
```

---

## Task 4: Create ui-emails.js

**Files:**
- Create: `ui-emails.js`
- Modify: `dispatcher.js` (delete `renderTabEmails`)

**Background:** `renderTabEmails` (the complete 3-tab inbox rewritten in a previous session) starts at line ~2306 in dispatcher.js. It uses globals: `gameState`, `window._inboxTab`, `EMAIL_TEMPLATES`, and various game action functions. It should load AFTER dispatcher.js so the switchTab routing is already defined.

- [x] **Step 4.1: Find exact boundaries of renderTabEmails in dispatcher.js**

Run:
```bash
grep -n "^function renderTabEmails\|^function renderTab" dispatcher.js | head -5
```
Expected: `renderTabEmails` starts around line 2306, next `renderTab*` function follows it.

- [x] **Step 4.2: Create ui-emails.js**

```js
'use strict';
/* ================================================================
   ui-emails.js — Chauffeur Empire
   3-tab Inbox CEO email client UI.
   Loaded AFTER dispatcher.js (needs: gameState, window._inboxTab,
   EMAIL_TEMPLATES, negotiateEmail, all game action globals)
   ================================================================ */
```

- [x] **Step 4.3: Cut renderTabEmails from dispatcher.js → ui-emails.js**

1. In dispatcher.js, find `function renderTabEmails()` (line ~2306)
2. Find where it ends (the closing `}` matched to `function renderTabEmails()`)
3. Cut the entire function (from `function renderTabEmails()` to its closing `}`)
4. Paste it into ui-emails.js after the header

- [x] **Step 4.4: Verify**

```bash
grep -c "^function renderTabEmails" dispatcher.js
```
Expected: `0`

```bash
grep -c "^function renderTabEmails" ui-emails.js
```
Expected: `1`

- [x] **Step 4.5: Commit**

```bash
git add dispatcher.js ui-emails.js
git commit -m "refactor: extract renderTabEmails → ui-emails.js"
```

---

## Task 5: Create ui-finance-mkt.js

**Files:**
- Create: `ui-finance-mkt.js`
- Modify: `dispatcher.js` (delete `_flashTicker`, `renderTabFinance`, `renderTabMarketing`)

**Background:** These 3 functions (rewritten in a previous session) are contiguous in dispatcher.js around lines 3314–4128. They use globals: `gameState`, `STOCK_TICKERS`, `MARKETING_CAMPAIGNS`, `window._mktTier`, `window._applyMarketingCampaign`, `window._stopMarketingCampaign`.

- [x] **Step 5.1: Find exact boundaries**

Run:
```bash
grep -n "^function _flashTicker\|^function renderTabFinance\|^function renderTabMarketing\|^function renderTabLifestyle\|^function renderTabLegal" dispatcher.js
```
Expected: `_flashTicker` ~3716, `renderTabFinance` ~3724, `renderTabMarketing` ~3314, `renderTabLifestyle` ~4129. Note: `renderTabMarketing` comes BEFORE `_flashTicker` and `renderTabFinance` in the file.

- [x] **Step 5.2: Create ui-finance-mkt.js**

```js
'use strict';
/* ================================================================
   ui-finance-mkt.js — Chauffeur Empire
   Finance tab (Bloomberg aesthetic + portfolio dashboard) and
   Marketing tab (Dual Brand system + tier campaigns + ROI tracker).
   Loaded AFTER dispatcher.js (needs: gameState, STOCK_TICKERS,
   MARKETING_CAMPAIGNS, window._applyMarketingCampaign,
   window._stopMarketingCampaign)
   ================================================================ */
```

- [x] **Step 5.3: Cut the 3 functions from dispatcher.js → ui-finance-mkt.js**

Move in this order into the new file:
1. `renderTabMarketing` (around line 3314 — cut the full function)
2. `_flashTicker` (around line 3716 — cut the full function)
3. `renderTabFinance` (around line 3724 — cut the full function, ends around line 4128)

- [x] **Step 5.4: Verify**

```bash
grep -c "^function renderTabFinance\|^function renderTabMarketing\|^function _flashTicker" dispatcher.js
```
Expected: `0`

```bash
grep -c "^function " ui-finance-mkt.js
```
Expected: `3`

- [x] **Step 5.5: Commit**

```bash
git add dispatcher.js ui-finance-mkt.js
git commit -m "refactor: extract Finance + Marketing tabs → ui-finance-mkt.js"
```

---

## Task 6: Update index.html — wire all new script tags

**Files:**
- Modify: `index.html`

**Background:** The new files must be added to index.html in the exact dependency order. Current order has `engine.js` at line 524 and `dispatcher.js` at line 527. New engine-* files go between them; new ui-* files go after dispatcher.js.

- [x] **Step 6.1: Find the current script block in index.html**

Run:
```bash
grep -n "engine.js\|dispatcher.js\|vip_clients.js\|war_room.js" index.html
```
Expected: engine.js ~524, vip_clients.js ~525, war_room.js ~526, dispatcher.js ~527.

- [x] **Step 6.2: Add engine-* files between engine.js and vip_clients.js**

Find this block in index.html:
```html
  <script src="engine.js"></script>
  <script src="vip_clients.js"></script>
```

Replace with:
```html
  <script src="engine.js"></script>
  <script src="engine-finance.js"></script>
  <script src="engine-rivals.js"></script>
  <script src="engine-events.js"></script>
  <script src="vip_clients.js"></script>
```

- [x] **Step 6.3: Add ui-* files after dispatcher.js**

Find this block in index.html:
```html
  <script src="dispatcher.js"></script>
  <script src="showroom.js"></script>
```

Replace with:
```html
  <script src="dispatcher.js"></script>
  <script src="ui-emails.js"></script>
  <script src="ui-finance-mkt.js"></script>
  <script src="showroom.js"></script>
```

- [x] **Step 6.4: Verify the final script order**

Run:
```bash
grep -n "engine\|dispatcher\|ui-\|vip_clients\|war_room\|showroom" index.html | grep "script src"
```

Expected output (in this exact order):
```
engine.js
engine-finance.js
engine-rivals.js
engine-events.js
vip_clients.js
war_room.js
dispatcher.js
ui-emails.js
ui-finance-mkt.js
showroom.js
```

- [x] **Step 6.5: Verify all new files actually exist**

Run:
```bash
ls engine-finance.js engine-rivals.js engine-events.js ui-emails.js ui-finance-mkt.js
```
Expected: all 5 files listed, no errors.

- [x] **Step 6.6: Smoke test — open game in browser**

Open `index.html` in a browser (or the live URL). Check the browser console for errors. Navigate to:
- Finance tab → portfolio dashboard should show, tickers visible
- Marketing tab → dual brand gauge should render
- Inbox CEO tab → 3-tab header should show
- Dispatch tab → verify rides still work (start a game, confirm first ride)

Expected: zero console errors related to undefined functions.

- [x] **Step 6.7: Final commit**

```bash
git add index.html
git commit -m "refactor: wire 5 domain modules into index.html script loading order"
```

- [x] **Step 6.8: Push**

```bash
git push
```

---

## Expected Results

After all 6 tasks:

| File | Before | After | Delta |
|---|---|---|---|
| `engine.js` | 5,905 lines | ~4,100 lines | -1,805 |
| `dispatcher.js` | 6,018 lines | ~4,470 lines | -1,548 |
| `engine-finance.js` | — | ~500 lines | new |
| `engine-rivals.js` | — | ~170 lines | new |
| `engine-events.js` | — | ~600 lines | new |
| `ui-emails.js` | — | ~730 lines | new |
| `ui-finance-mkt.js` | — | ~820 lines | new |

**No game logic changes. No new features. No function renames. Zero onclick breakage.**
