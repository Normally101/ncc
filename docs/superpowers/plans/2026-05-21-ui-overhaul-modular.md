# UI Overhaul + dispatcher.js Modularisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed-theme UI with a clean eRepublik-style layout (dark nav sidebar + light content) and split dispatcher.js (~4900 lines) into focused ui-*.js modules.

**Architecture:** Single-row slim topbar (42px, navy) + dark accordion sidebar (160px) + light content area. All renderTab* functions currently in dispatcher.js are extracted into separate ui-*.js module files. No ES6 modules — everything remains a global script to preserve inline onclick= handlers. No gameplay logic changes (CODE FREEZE).

**Tech Stack:** Vanilla JS globals, Tailwind CSS v3 (compiled via `npm run build:css`), CSS custom properties, Supabase (untouched)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `tailwind.config.js` | Modify | Add `nav`, `navDark`, `topbar` color tokens |
| `style.css` | Modify | Update `--panel` token, add `tabFadeIn` keyframe, update sidebar CSS vars |
| `premium-ui.css` | Modify | Remove dark overrides; update sidebar width 220→160px; keep scrollbar + mobile |
| `index.html` | Modify | Rewrite topbar (1-row) + sidebar (dark accordion) + adjust main-panel offsets |
| `premium-ui.js` | Modify | Remove `diagDispatch`; remove `updateSidebarStats` call (stats in topbar now); keep `updateUI` patch |
| `ui-sidebar.js` | **Create** | Accordion state machine, `updateSidebarStats` (now updates topbar breadcrumb + avatar), `toggleSidebar` |
| `dispatcher.js` | Modify | Add `tab-fade-in` to `_safeRender`; remove all `renderTab*` functions extracted to modules |
| `ui-dispatch.js` | **Create** | `renderTabCorse` + drag-drop listeners (from dispatcher.js:1208–1581) |
| `ui-fleet.js` | **Create** | `renderTabFleet` (from dispatcher.js:1588–2043) |
| `ui-staff.js` | **Create** | `renderTabStaff` + `renderTabLifestyle` (from dispatcher.js:2044–3120) |
| `ui-ops.js` | **Create** | `renderTabRegions` + `renderTabProvinces` (from dispatcher.js:2632–2702 + 4337–4515) |
| `ui-meta.js` | **Create** | `renderTabInvestments` + `renderTabLegal` + `renderTabPolitics` + `renderTabCareer` + `renderTabRanking` + `renderTabHelp` + `renderTabRealEstate` + `renderTabMarket` + `renderTabPremiumStore` (remaining functions from dispatcher.js) |

**Already extracted (leave untouched):** `ui-emails.js`, `ui-finance-mkt.js`, `showroom.js`, `b2b.js`, `auctions.js`, `black_ops.js`, `crypto.js`, `hq.js`, `hostile_takeover.js`, `nemesis.js`, `infrastructure.js`, `contracts.js`, `tourism.js`

---

## Task 1: Update Tailwind config and CSS tokens

**Files:**
- Modify: `tailwind.config.js`
- Modify: `style.css` (first ~35 lines, `:root` block)

- [ ] **Step 1: Update tailwind.config.js**

Replace the full content of `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './*.js',
  ],
  theme: {
    extend: {
      colors: {
        gold:       '#c9a227',
        deepBlack:  '#0b1628',
        navy:       '#1a2c45',
        'navy-dark':'#111d2e',
        nav:        '#1e2d45',
        navDark:    '#162030',
        topbar:     '#1e3a5f',
        panel:      '#f0f4f8',
        accent:     '#27ae60',
        cegreen:    '#27ae60',
      },
      fontFamily: {
        sans:    ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['Roboto Mono', 'monospace'],
        display: ['Cinzel', 'serif'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Update `:root` CSS tokens in style.css**

Find the `:root {` block at the very top of `style.css` (lines 1–35 approx). Replace it with:

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
    --border:      rgba(0,0,0,0.10);
    --border-sub:  rgba(0,0,0,0.07);
    --border-gold: rgba(201,162,39,0.30);
    --shadow-sm:   0 1px 4px rgba(0,0,0,0.08);
    --shadow-md:   0 4px 16px rgba(0,0,0,0.12);
    --text:        #1a2744;
    --text-muted:  #4d6480;
    --text-dim:    #7a92a8;
}
```

- [ ] **Step 3: Add tabFadeIn keyframe to style.css**

Add immediately after the `:root` block:

```css
@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tab-fade-in { animation: tabFadeIn 0.18s ease-out forwards; }
```

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js style.css
git commit -m "feat: update CSS tokens and add tabFadeIn keyframe"
```

---

## Task 2: Rewrite index.html topbar

**Files:**
- Modify: `index.html` (lines 104–226, the entire `<header id="top-bar">` block)

**Context:** The current topbar has 2 rows (~88px total). We replace it with 1 slim row (42px). All existing stat element IDs (`tb-cash`, `tb-rep`, `tb-energy-bar`, `tb-energy-text`, `tb-time`, `tb-date`, `tb-tc`, `cloud-sync-dot`, `logout-btn`) must be preserved — `engine.js` and `updateUI()` target them directly. We add `#tb-breadcrumb` and `#tb-avatar` as new IDs.

- [ ] **Step 1: Replace the entire `<header id="top-bar">` block**

Find the block from `<header id="top-bar"` through `</header>` (currently lines 104–226) and replace with:

```html
  <!-- TOP BAR: 1 slim row, 42px -->
  <header id="top-bar" class="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 pointer-events-auto"
          style="height:42px;background:#1e3a5f;border-bottom:1px solid rgba(0,0,0,0.25);box-shadow:0 2px 8px rgba(0,0,0,0.25)">

    <!-- Logo -->
    <img src="assets/ce-favicon.png" alt="CE" class="w-6 h-6 rounded-md object-contain flex-shrink-0" onerror="this.style.display='none'">
    <span class="font-display font-bold text-white tracking-widest text-[11px] uppercase flex-shrink-0" style="text-shadow:0 0 8px rgba(201,162,39,0.5)">Chauffeur Empire</span>

    <div class="w-px h-5 bg-white/15 flex-shrink-0"></div>

    <!-- Stat pills -->
    <div class="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 flex-shrink-0">
      <span class="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
      <span id="tb-cash" class="text-white font-mono font-bold text-xs">€0</span>
    </div>
    <div class="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 flex-shrink-0">
      <span class="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"></span>
      <span id="tb-rep" class="text-white font-mono font-bold text-xs">0.0★</span>
    </div>
    <div class="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 cursor-pointer flex-shrink-0" onclick="openHotelModal && openHotelModal()">
      <span class="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></span>
      <div class="w-16 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div id="tb-energy-bar" class="h-full bg-blue-400 transition-all duration-300" style="width:100%"></div>
      </div>
      <span id="tb-energy-text" class="text-white/70 font-mono text-[10px]">100%</span>
    </div>
    <div class="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 flex-shrink-0 cursor-pointer" onclick="switchTab('store')" title="TruckCoin">
      <span class="text-yellow-400 text-[10px]">🪙</span>
      <span id="tb-tc" class="text-yellow-300 font-mono font-bold text-xs">50</span>
    </div>

    <!-- Weather -->
    <div class="flex items-center gap-1.5 flex-shrink-0">
      <span id="tb-weather-icon" class="text-sm">☀️</span>
      <span id="tb-surge" class="text-[9px] font-bold text-orange-400 hidden">⚡ SURGE</span>
    </div>

    <div class="flex-1"></div>

    <!-- Breadcrumb -->
    <span id="tb-breadcrumb" class="text-white/50 text-[10px] uppercase tracking-widest flex-shrink-0">Dispatch</span>

    <div class="w-px h-5 bg-white/15 flex-shrink-0"></div>

    <!-- Time -->
    <div class="text-right flex-shrink-0">
      <span id="tb-time" class="text-white font-mono font-bold text-sm block leading-none">08:00</span>
      <span id="tb-date" class="text-[8px] text-white/50 uppercase">1 Gen</span>
    </div>

    <!-- Actions -->
    <span id="cloud-sync-dot" class="text-white/60 text-sm cursor-pointer flex-shrink-0" title="Cloud sync"
          onclick="window.forceCloudSave && window.forceCloudSave(); window.forceLeaderboardUpdate && window.forceLeaderboardUpdate()">☁</span>
    <button id="logout-btn" onclick="window.authLogout && window.authLogout()" title="Esci" class="text-white/60 hover:text-white text-sm flex-shrink-0">⏻</button>
    <button id="sidebar-toggle-btn" onclick="window.toggleSidebar && window.toggleSidebar(true)"
            class="text-white/60 hover:text-white text-sm flex-shrink-0 hidden lg:hidden">☰</button>

    <span id="hub-event-badge" class="hidden"></span>
  </header>
```

- [ ] **Step 2: Verify IDs preserved**

Check that these IDs exist in the new topbar HTML: `tb-cash`, `tb-rep`, `tb-energy-bar`, `tb-energy-text`, `tb-tc`, `tb-weather-icon`, `tb-surge`, `tb-time`, `tb-date`, `cloud-sync-dot`, `logout-btn`. They must all be present.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: replace 2-row topbar with 1-row slim topbar"
```

---

## Task 3: Rewrite index.html sidebar (dark accordion nav)

**Files:**
- Modify: `index.html` (the `<aside id="sidebar-player">` block + `#sidebar-toggle-btn`)

**Context:** The current sidebar is a white stats panel (220px wide). We replace it with a dark accordion navigation (160px wide). The player stats (avatar, cash, rep, etc.) are now shown in the topbar — the old sidebar stat IDs (`sidebar-avatar`, `sidebar-cash`, etc.) will no longer exist. The `updateSidebarStats()` call in `premium-ui.js` handles the topbar; we'll add new sidebar-specific IDs for the accordion.

- [ ] **Step 1: Replace the `<aside id="sidebar-player">` block**

Find the entire `<aside id="sidebar-player"` block (currently ends at `</aside>` before the `<!-- Mobile sidebar toggle -->` comment) and replace with:

```html
  <!-- SIDEBAR: dark accordion navigation, 160px -->
  <aside id="sidebar-player" class="fixed z-40 flex flex-col overflow-hidden"
         style="top:42px;left:0;width:160px;bottom:0;background:#1e2d45;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto">

    <!-- Logo strip -->
    <div class="flex items-center gap-2 px-3 py-3 flex-shrink-0" style="background:#162030;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div id="sidebar-avatar" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 select-none"
           style="background:rgba(201,162,39,0.2);border:1px solid rgba(201,162,39,0.4);color:#c9a227;font-family:'Cinzel',serif">CE</div>
      <div class="min-w-0">
        <div id="sidebar-company" class="text-[10px] font-bold text-white truncate leading-tight" style="font-family:'Montserrat',sans-serif">Chauffeur Empire</div>
        <div class="text-[8px] text-white/40 uppercase tracking-wider">CEO</div>
      </div>
    </div>

    <!-- Accordion nav -->
    <nav id="sidebar-nav" class="flex-1 overflow-y-auto py-1">

      <!-- OPERATIVO -->
      <div class="sidebar-group" data-group="operativo">
        <button class="sidebar-group-head w-full flex items-center gap-2 px-3 py-2 text-left" onclick="window._sidebarToggle('operativo')">
          <span class="text-sm">🚕</span>
          <span class="flex-1 text-[10px] font-semibold text-white/70 uppercase tracking-wide">Operativo</span>
          <span class="sidebar-chev text-[8px] text-white/30">▶</span>
        </button>
        <div class="sidebar-group-body" style="max-height:0;overflow:hidden;transition:max-height 0.25s ease">
          <a class="sidebar-item" data-tab="corse"     onclick="switchTab('corse')"     href="#">🚕 Dispatch</a>
          <a class="sidebar-item" data-tab="fleet"     onclick="switchTab('fleet')"     href="#">🚘 Flotta</a>
          <a class="sidebar-item" data-tab="staff"     onclick="switchTab('staff')"     href="#">👔 Staff & HR</a>
          <a class="sidebar-item" data-tab="hq"        onclick="switchTab('hq')"        href="#">🏗️ HQ Builder</a>
          <a class="sidebar-item" data-tab="showroom"  onclick="switchTab('showroom')"  href="#">✨ Showroom</a>
          <a class="sidebar-item" data-tab="emails"    onclick="switchTab('emails')"    href="#">📩 Inbox <span id="mail-dot" class="nav-notif hidden">!</span></a>
        </div>
      </div>

      <!-- BUSINESS -->
      <div class="sidebar-group" data-group="business">
        <button class="sidebar-group-head w-full flex items-center gap-2 px-3 py-2 text-left" onclick="window._sidebarToggle('business')">
          <span class="text-sm">💼</span>
          <span class="flex-1 text-[10px] font-semibold text-white/70 uppercase tracking-wide">Business</span>
          <span class="sidebar-chev text-[8px] text-white/30">▶</span>
        </button>
        <div class="sidebar-group-body" style="max-height:0;overflow:hidden;transition:max-height 0.25s ease">
          <a class="sidebar-item" data-tab="b2b"            onclick="switchTab('b2b')"            href="#">💼 Contratti B2B</a>
          <a class="sidebar-item" data-tab="contracts"      onclick="switchTab('contracts')"      href="#">🤝 Corporate Deals</a>
          <a class="sidebar-item" data-tab="tourism"        onclick="switchTab('tourism')"        href="#">🌍 Bandi Turismo</a>
          <a class="sidebar-item" data-tab="infrastructure" onclick="switchTab('infrastructure')" href="#">⛽ Carburante</a>
          <a class="sidebar-item" data-tab="store"          onclick="switchTab('store')"          href="#">💎 Executive Club</a>
          <a class="sidebar-item" data-tab="auctions"       onclick="switchTab('auctions')"       href="#">⚖️ Aste Giudiziarie</a>
          <a class="sidebar-item" data-tab="market"         onclick="switchTab('market')"         href="#">🚗 Mercato Auto</a>
        </div>
      </div>

      <!-- FINANZA -->
      <div class="sidebar-group" data-group="finanza">
        <button class="sidebar-group-head w-full flex items-center gap-2 px-3 py-2 text-left" onclick="window._sidebarToggle('finanza')">
          <span class="text-sm">💹</span>
          <span class="flex-1 text-[10px] font-semibold text-white/70 uppercase tracking-wide">Finanza</span>
          <span class="sidebar-chev text-[8px] text-white/30">▶</span>
        </button>
        <div class="sidebar-group-body" style="max-height:0;overflow:hidden;transition:max-height 0.25s ease">
          <a class="sidebar-item" data-tab="finance"    onclick="switchTab('finance')"    href="#">💹 Finanza</a>
          <a class="sidebar-item" data-tab="realestate" onclick="switchTab('realestate')" href="#">🏛️ Real Estate</a>
          <a class="sidebar-item" data-tab="crypto"     onclick="switchTab('crypto')"     href="#">₿ Crypto & Offshore</a>
          <a class="sidebar-item" data-tab="invest"     onclick="switchTab('invest')"     href="#">📈 Investimenti</a>
          <a class="sidebar-item" data-tab="marketing"  onclick="switchTab('marketing')"  href="#">📣 Marketing</a>
        </div>
      </div>

      <!-- POTERE -->
      <div class="sidebar-group" data-group="potere">
        <button class="sidebar-group-head w-full flex items-center gap-2 px-3 py-2 text-left" onclick="window._sidebarToggle('potere')">
          <span class="text-sm">🕵️</span>
          <span class="flex-1 text-[10px] font-semibold text-white/70 uppercase tracking-wide">Potere</span>
          <span class="sidebar-chev text-[8px] text-white/30">▶</span>
        </button>
        <div class="sidebar-group-body" style="max-height:0;overflow:hidden;transition:max-height 0.25s ease">
          <a class="sidebar-item" data-tab="provinces" onclick="switchTab('provinces')" href="#">🗺️ War Room</a>
          <a class="sidebar-item" data-tab="regions"   onclick="switchTab('regions')"   href="#">🗺️ Regioni</a>
          <a class="sidebar-item" data-tab="politics"  onclick="switchTab('politics')"  href="#">🏛️ Politica</a>
          <a class="sidebar-item" data-tab="shadow"    onclick="switchTab('shadow')"    href="#">🕵️ Agenzia Ombra</a>
          <a class="sidebar-item" data-tab="nemesis"   onclick="switchTab('nemesis')"   href="#">🦹 Nemici VIP</a>
          <a class="sidebar-item" data-tab="opa"       onclick="switchTab('opa')"       href="#">🦅 OPA Ostili</a>
        </div>
      </div>

      <!-- INFO -->
      <div class="sidebar-group" data-group="info">
        <button class="sidebar-group-head w-full flex items-center gap-2 px-3 py-2 text-left" onclick="window._sidebarToggle('info')">
          <span class="text-sm">🏆</span>
          <span class="flex-1 text-[10px] font-semibold text-white/70 uppercase tracking-wide">Info</span>
          <span class="sidebar-chev text-[8px] text-white/30">▶</span>
        </button>
        <div class="sidebar-group-body" style="max-height:0;overflow:hidden;transition:max-height 0.25s ease">
          <a class="sidebar-item" data-tab="ranking" onclick="switchTab('ranking')" href="#">🏆 Classifica</a>
          <a class="sidebar-item" data-tab="career"  onclick="switchTab('career')"  href="#">🎯 Missioni <span id="career-dot" class="nav-notif hidden">!</span></a>
          <a class="sidebar-item" data-tab="legal"   onclick="switchTab('legal')"   href="#">⚖️ Ufficio Legale <span id="fine-dot" class="nav-notif hidden">!</span></a>
          <a class="sidebar-item" data-tab="help"    onclick="switchTab('help')"    href="#">🆘 Supporto</a>
        </div>
      </div>

      <!-- Advance turn at bottom -->
      <div class="px-3 py-3 mt-2 border-t" style="border-color:rgba(255,255,255,0.06)">
        <button onclick="window.advanceTime && window.advanceTime()"
                class="w-full text-[9px] font-bold uppercase tracking-widest py-2 rounded-lg transition-all active:scale-95"
                style="background:rgba(201,162,39,0.15);border:1px solid rgba(201,162,39,0.35);color:#c9a227">
          ▶ Avanza Turno
        </button>
      </div>
    </nav>

    <button id="sidebar-close-btn" onclick="window.toggleSidebar && window.toggleSidebar(false)"
            class="absolute top-2 right-2 text-xs text-white/40 hidden">✕</button>
  </aside>
```

- [ ] **Step 2: Update main-panel positioning**

Find `<main id="main-panel"` (currently around line 462) and update its inline style from `top:88px` to `top:42px` and confirm left offset will come from CSS (premium-ui.css sets `left:160px`):

Change:
```html
<main id="main-panel" class="fixed left-0 right-0 z-40 flex flex-col overflow-hidden" style="top:88px;bottom:26px;background:var(--panel)">
```
To:
```html
<main id="main-panel" class="fixed right-0 z-40 flex flex-col overflow-hidden" style="top:42px;bottom:0;left:160px;background:var(--panel)">
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: replace white stats sidebar with dark accordion nav sidebar"
```

---

## Task 4: Add sidebar CSS to style.css

**Files:**
- Modify: `style.css` (append new sidebar-specific rules)

- [ ] **Step 1: Append sidebar accordion CSS to style.css**

Add the following at the end of `style.css`:

```css
/* ================================================================
   SIDEBAR ACCORDION — dark nav
   ================================================================ */

#sidebar-player {
  scrollbar-width: thin;
  scrollbar-color: rgba(201,162,39,0.25) transparent;
}
#sidebar-player::-webkit-scrollbar { width: 3px; }
#sidebar-player::-webkit-scrollbar-track { background: transparent; }
#sidebar-player::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.25); border-radius: 2px; }

.sidebar-group-head {
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}
.sidebar-group-head:hover { background: rgba(255,255,255,0.05); }
.sidebar-group-head.open   { background: rgba(255,255,255,0.04); }
.sidebar-group-head.open .sidebar-chev { transform: rotate(90deg); transition: transform 0.2s ease; color: rgba(201,162,39,0.7); }
.sidebar-chev { transition: transform 0.2s ease; }

.sidebar-item {
  display: block;
  padding: 5px 12px 5px 28px;
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-item:hover {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.85);
}
.sidebar-item.active {
  background: rgba(201,162,39,0.12);
  color: #c9a227;
  border-left: 2px solid #c9a227;
  padding-left: 26px;
}

@media (max-width: 767px) {
  #sidebar-player {
    transform: translateX(-160px);
    transition: transform 0.25s ease;
    z-index: 55;
  }
  #main-panel {
    left: 0 !important;
  }
  #news-ticker-wrap  { left: 0 !important; }
  #live-map-overlay  { left: 16px !important; }
  #map-overlay       { left: 0 !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: add sidebar accordion CSS"
```

---

## Task 5: Update premium-ui.css

**Files:**
- Modify: `premium-ui.css`

**Context:** The current premium-ui.css has dark `!important` overrides from the old dark theme. Now that the base theme is light, most of these overrides are either redundant or wrong. We slim it down to just: topbar polish, sidebar offsets for news ticker / live map, and remove anything that fights the new style.

- [ ] **Step 1: Replace entire premium-ui.css**

```css
/* ================================================================
   premium-ui.css — Chauffeur Empire
   Minimal overrides layer. Loaded AFTER style.css.
   ================================================================ */

/* ── 1. TOPBAR ELEVATION ─────────────────────────────────────── */

#top-bar {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

#tb-cash  { text-shadow: 0 0 8px rgba(74,222,128,0.35); }
#tb-rep   { text-shadow: 0 0 8px rgba(201,162,39,0.35); }

/* ── 2. MAIN PANEL SHIFT ─────────────────────────────────────── */

#main-panel {
  left: 160px !important;
}

#main-panel > div:first-child {
  background: #e8eef5 !important;
  border-bottom: 1px solid #cdd6e0 !important;
}

#panel-title {
  font-family: 'Cinzel', serif !important;
  font-size: 11px !important;
  letter-spacing: 0.20em;
  color: #1a2744 !important;
}

/* ── 3. SIDEBAR-AWARE OFFSETS ────────────────────────────────── */

#news-ticker-wrap { left: 160px !important; }
#live-map-overlay { left: 176px !important; }
#map-overlay      { left: 160px !important; }

/* ── 4. SCROLLBAR (tab container) ────────────────────────────── */

#tab-container::-webkit-scrollbar { width: 4px; }
#tab-container::-webkit-scrollbar-track { background: transparent; }
#tab-container::-webkit-scrollbar-thumb {
  background: rgba(201,162,39,0.25);
  border-radius: 2px;
}
#tab-container::-webkit-scrollbar-thumb:hover {
  background: rgba(201,162,39,0.45);
}

/* ── 5. MOBILE ───────────────────────────────────────────────── */

@media (max-width: 767px) {
  #main-panel { left: 0 !important; }
  #news-ticker-wrap  { left: 0 !important; }
  #live-map-overlay  { left: 16px !important; }
  #map-overlay       { left: 0 !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add premium-ui.css
git commit -m "feat: slim down premium-ui.css for new light theme"
```

---

## Task 6: Create ui-sidebar.js

**Files:**
- Create: `ui-sidebar.js`

**Context:** This file owns the accordion state machine and the `updateSidebarStats()` function. The stats function now updates the topbar breadcrumb (`#tb-breadcrumb`) and the sidebar avatar/company (`#sidebar-avatar`, `#sidebar-company`). It also patches `switchTab` to update the active sidebar item highlight.

- [ ] **Step 1: Create ui-sidebar.js**

```js
'use strict';
/* ================================================================
   ui-sidebar.js — Chauffeur Empire
   Accordion nav state machine + topbar stat updates.
   Loaded after dispatcher.js.
   ================================================================ */

// ── Tab → group mapping ──────────────────────────────────────────
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

// ── Accordion open/close ─────────────────────────────────────────
window._sidebarToggle = function(group) {
    const groups = document.querySelectorAll('#sidebar-nav .sidebar-group');
    groups.forEach(g => {
        const isTarget = g.dataset.group === group;
        const body = g.querySelector('.sidebar-group-body');
        const head = g.querySelector('.sidebar-group-head');
        if (!body || !head) return;
        if (isTarget) {
            const isOpen = head.classList.contains('open');
            if (isOpen) {
                head.classList.remove('open');
                body.style.maxHeight = '0';
            } else {
                head.classList.add('open');
                body.style.maxHeight = body.scrollHeight + 'px';
            }
        } else {
            head.classList.remove('open');
            body.style.maxHeight = '0';
        }
    });
};

// Open group that contains a tab, highlight that item ─────────────
window._sidebarActivateTab = function(tab) {
    const group = _SIDEBAR_GROUP[tab];
    if (group) window._sidebarToggle(group);
    // Update active highlight
    document.querySelectorAll('.sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    // Update breadcrumb
    const crumb = document.getElementById('tb-breadcrumb');
    if (crumb) {
        const item = document.querySelector(`.sidebar-item[data-tab="${tab}"]`);
        crumb.textContent = item ? item.textContent.replace(/[!]/g,'').trim() : tab;
    }
};

// ── Patch switchTab to activate sidebar ──────────────────────────
(function() {
    const _orig = window.switchTab;
    if (!_orig) return;
    window.switchTab = function(tab) {
        _orig.apply(this, arguments);
        window._sidebarActivateTab(tab);
    };
})();

// ── updateSidebarStats: avatar + company name ────────────────────
window.updateSidebarStats = function() {
    if (typeof gameState === 'undefined') return;
    const gs = gameState;
    const name     = gs.companyName || 'CE';
    const initials = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g,'').slice(0,2).toUpperCase() || 'CE';
    const av = document.getElementById('sidebar-avatar');
    if (av) av.textContent = initials;
    const sc = document.getElementById('sidebar-company');
    if (sc) sc.textContent = name;
};

// ── Patch updateUI to also call updateSidebarStats ───────────────
(function() {
    const _orig = window.updateUI;
    window.updateUI = function() {
        if (_orig) _orig.apply(this, arguments);
        window.updateSidebarStats();
    };
})();

// ── Mobile toggle ─────────────────────────────────────────────────
window.toggleSidebar = function(open) {
    const sidebar   = document.getElementById('sidebar-player');
    const closeBtn  = document.getElementById('sidebar-close-btn');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (!sidebar) return;
    if (open) {
        sidebar.style.transform = 'translateX(0)';
        sidebar.style.boxShadow = '4px 0 24px rgba(0,0,0,0.5)';
        if (closeBtn)  closeBtn.classList.remove('hidden');
        if (toggleBtn) toggleBtn.classList.add('hidden');
    } else {
        sidebar.style.transform = 'translateX(-160px)';
        sidebar.style.boxShadow = '';
        if (closeBtn)  closeBtn.classList.add('hidden');
        if (toggleBtn) toggleBtn.classList.remove('hidden');
    }
};

// ── Init: open group for current tab + initial stats ─────────────
window.addEventListener('load', function() {
    window.updateSidebarStats();
    // Open the operativo group by default
    const opGrp = document.querySelector('#sidebar-nav .sidebar-group[data-group="operativo"] .sidebar-group-head');
    const opBody = document.querySelector('#sidebar-nav .sidebar-group[data-group="operativo"] .sidebar-group-body');
    if (opGrp && opBody) {
        opGrp.classList.add('open');
        opBody.style.maxHeight = opBody.scrollHeight + 'px';
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add ui-sidebar.js
git commit -m "feat: create ui-sidebar.js accordion nav and stats"
```

---

## Task 7: Update premium-ui.js

**Files:**
- Modify: `premium-ui.js`

**Context:** Remove `diagDispatch` (bug fixed). Remove `updateSidebarStats` (moved to ui-sidebar.js). Remove the `updateUI` patch (moved to ui-sidebar.js). Keep `toggleSidebar` stub only if needed — but since ui-sidebar.js now owns it, we can remove from here too. Keep the hash routing patch for `switchTab` and the `load` handler.

- [ ] **Step 1: Replace entire premium-ui.js**

```js
'use strict';
/* ================================================================
   premium-ui.js — Chauffeur Empire
   Hash-based tab routing. Loaded LAST.
   All sidebar/stats logic is in ui-sidebar.js.
   ================================================================ */

// ── Restore tab from URL hash on load ────────────────────────────
window.addEventListener('load', function() {
    const VALID_TABS = [
        'corse','fleet','staff','emails','finance','marketing','showroom',
        'shadow','provinces','ranking','career','market','hq','regions',
        'politics','invest','realestate','crypto','b2b','contracts',
        'tourism','infrastructure','store','legal','help','auctions',
        'nemesis','opa'
    ];
    const hash = (window.location.hash || '').replace('#','').trim();
    if (hash && VALID_TABS.includes(hash) && typeof window.switchTab === 'function') {
        window.switchTab(hash);
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add premium-ui.js
git commit -m "feat: slim premium-ui.js — remove diagDispatch and sidebar stats"
```

---

## Task 8: Add tab fade-in to dispatcher.js _safeRender

**Files:**
- Modify: `dispatcher.js` (line ~1171, the `_safeRender` definition inside `switchTab`)

**Context:** `_safeRender` is a local const inside `switchTab`. After the render function runs successfully, we add the `.tab-fade-in` class to `#tab-container` to trigger the CSS animation.

- [ ] **Step 1: Update _safeRender in dispatcher.js**

Find this line in `dispatcher.js` (inside `window.switchTab`, around line 1171):
```js
    const _safeRender = (fn) => { try { fn(); } catch(e) { console.error('[switchTab]', e); const _sup = (window.GAME_CONFIG||{}).SUPPORT_EMAIL||'support@chauffeurempire.com'; container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore rendering: ${e.message}<br><span class="text-gray-500">Se il problema persiste, scrivi a <a href="mailto:${_sup}" class="underline">${_sup}</a></span></div>`; } };
```

Replace with:
```js
    const _safeRender = (fn) => {
        try {
            fn();
            container.classList.remove('tab-fade-in');
            void container.offsetWidth; // force reflow to restart animation
            container.classList.add('tab-fade-in');
        } catch(e) {
            console.error('[switchTab]', e);
            const _sup = (window.GAME_CONFIG||{}).SUPPORT_EMAIL||'support@chauffeurempire.com';
            container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore rendering: ${e.message}<br><span class="text-gray-500">Se il problema persiste, scrivi a <a href="mailto:${_sup}" class="underline">${_sup}</a></span></div>`;
        }
    };
```

- [ ] **Step 2: Commit**

```bash
git add dispatcher.js
git commit -m "feat: add tab fade-in animation to _safeRender"
```

---

## Task 9: Create ui-dispatch.js (extract renderTabCorse)

**Files:**
- Create: `ui-dispatch.js`
- Modify: `dispatcher.js` (remove renderTabCorse and its drag-drop event listeners)

**Context:** `renderTabCorse` is at dispatcher.js:1208. The drag-drop `document.addEventListener` calls (for dragover, dragleave, drop) related to rides are at the bottom of the file (around line 2996). Find them with `grep -n "draggedRideId\|dragover\|dragleave.*dCard\|drop.*dCard" dispatcher.js`.

- [ ] **Step 1: Find exact line ranges**

```bash
grep -n "^function renderTabCorse\|draggedRideId\|document\.addEventListener.*drag\|document\.addEventListener.*drop" dispatcher.js | head -20
```

- [ ] **Step 2: Create ui-dispatch.js**

Create the file with header, then copy the exact text of `renderTabCorse` from dispatcher.js (from `function renderTabCorse()` through the closing `}` before `async function renderTabRanking()`), plus the drag-drop event listener block:

```js
'use strict';
/* ui-dispatch.js — renderTabCorse + drag-drop */
```
Then paste `renderTabCorse` function verbatim, followed by `window.renderTabCorse = renderTabCorse;`, then paste the drag-drop listeners verbatim.

- [ ] **Step 3: Remove from dispatcher.js**

Delete `renderTabCorse` function body from dispatcher.js (lines 1208 through the line before `async function renderTabRanking()`).
Delete the drag-drop event listener block from the bottom of dispatcher.js.

- [ ] **Step 4: Commit**

```bash
git add ui-dispatch.js dispatcher.js
git commit -m "refactor: extract renderTabCorse to ui-dispatch.js"
```

---

## Task 10: Create ui-fleet.js (extract renderTabFleet)

**Files:**
- Create: `ui-fleet.js`
- Modify: `dispatcher.js`

- [ ] **Step 1: Find exact line range**

```bash
grep -n "^function renderTabFleet\|^function renderTabStaff" dispatcher.js
```

- [ ] **Step 2: Create ui-fleet.js**

```js
'use strict';
/* ui-fleet.js — renderTabFleet */
```
Copy `renderTabFleet` verbatim from dispatcher.js (from `function renderTabFleet()` up to but not including `function renderTabStaff()`). Add `window.renderTabFleet = renderTabFleet;` at the end.

- [ ] **Step 3: Remove from dispatcher.js**

Delete the `renderTabFleet` function from dispatcher.js.

- [ ] **Step 4: Commit**

```bash
git add ui-fleet.js dispatcher.js
git commit -m "refactor: extract renderTabFleet to ui-fleet.js"
```

---

## Task 11: Create ui-staff.js (extract renderTabStaff + renderTabLifestyle)

**Files:**
- Create: `ui-staff.js`
- Modify: `dispatcher.js`

- [ ] **Step 1: Find exact line ranges**

```bash
grep -n "^function renderTabStaff\|^function renderTabRegions\|^function renderTabLifestyle\|window\.renderTabLifestyle" dispatcher.js
```

- [ ] **Step 2: Create ui-staff.js**

```js
'use strict';
/* ui-staff.js — renderTabStaff, renderTabLifestyle */
```
Copy `renderTabStaff` verbatim (up to but not including `function renderTabRegions()`).
Copy `renderTabLifestyle` verbatim (from wherever it appears).
Add at the end:
```js
window.renderTabStaff     = renderTabStaff;
window.renderTabLifestyle = renderTabLifestyle;
```

- [ ] **Step 3: Remove from dispatcher.js**

Delete `renderTabStaff` and `renderTabLifestyle` from dispatcher.js (including their `window.renderTab* = ...` assignments if any).

- [ ] **Step 4: Commit**

```bash
git add ui-staff.js dispatcher.js
git commit -m "refactor: extract renderTabStaff + renderTabLifestyle to ui-staff.js"
```

---

## Task 12: Create ui-ops.js (extract renderTabRegions + renderTabProvinces)

**Files:**
- Create: `ui-ops.js`
- Modify: `dispatcher.js`

- [ ] **Step 1: Find exact line ranges**

```bash
grep -n "^function renderTabRegions\|^function renderTabInvestments\|^async function renderTabProvinces\|^async function renderTabRealEstate" dispatcher.js
```

- [ ] **Step 2: Create ui-ops.js**

```js
'use strict';
/* ui-ops.js — renderTabRegions, renderTabProvinces */
```
Copy `renderTabRegions` verbatim.
Copy `async function renderTabProvinces` verbatim (including the `async`).
Add at the end:
```js
window.renderTabRegions   = renderTabRegions;
window.renderTabProvinces = renderTabProvinces;
```

- [ ] **Step 3: Remove from dispatcher.js**

Delete `renderTabRegions` and `renderTabProvinces` from dispatcher.js.

- [ ] **Step 4: Commit**

```bash
git add ui-ops.js dispatcher.js
git commit -m "refactor: extract renderTabRegions + renderTabProvinces to ui-ops.js"
```

---

## Task 13: Create ui-meta.js (extract remaining renderTab* from dispatcher.js)

**Files:**
- Create: `ui-meta.js`
- Modify: `dispatcher.js`

**Context:** Extract all remaining `renderTab*` functions from dispatcher.js: `renderTabInvestments`, `renderTabLegal`, `renderTabPolitics`, `renderTabCareer`, `renderTabPremiumStore`, `renderTabMarket`, `renderTabHelp`, `renderTabRanking`, `async function renderTabRealEstate`.

- [ ] **Step 1: Verify what remains**

```bash
grep -n "^function renderTab\|^async function renderTab\|^window\.renderTab" dispatcher.js
```
All remaining `renderTab*` definitions should be in this file. List them to confirm.

- [ ] **Step 2: Create ui-meta.js**

```js
'use strict';
/* ui-meta.js — remaining renderTab* from dispatcher.js */
```
Copy each remaining `renderTab*` function verbatim in the order they appear. Add `window.X = X;` exports at the end for each:

```js
window.renderTabInvestments = renderTabInvestments;
window.renderTabLegal       = renderTabLegal;
window.renderTabPolitics    = renderTabPolitics;
window.renderTabCareer      = renderTabCareer;
window.renderTabPremiumStore = renderTabPremiumStore;
window.renderTabMarket      = renderTabMarket;
window.renderTabHelp        = renderTabHelp;
window.renderTabRanking     = renderTabRanking;
window.renderTabRealEstate  = renderTabRealEstate;
```

- [ ] **Step 3: Remove from dispatcher.js**

Delete all remaining `renderTab*` function definitions from dispatcher.js. After deletion, `dispatcher.js` should contain ZERO `renderTab` function definitions (only `window.renderTabX = ...` references in `switchTab` remain, which is fine).

Verify:
```bash
grep -n "^function renderTab\|^async function renderTab" dispatcher.js
```
Expected output: (empty — no results)

- [ ] **Step 4: Commit**

```bash
git add ui-meta.js dispatcher.js
git commit -m "refactor: extract remaining renderTab* to ui-meta.js"
```

---

## Task 14: Update index.html script tags

**Files:**
- Modify: `index.html` (the script tags block, currently around lines 560–595)

**Context:** Add the new `ui-*.js` files in load order. They must load AFTER `dispatcher.js` (so `switchTab` is defined before they try to export to it) but BEFORE `premium-ui.js`.

- [ ] **Step 1: Update the script tags block**

Find the section that starts with `<script src="geoCoords.js">` and ends with `<script src="premium-ui.js">`. Replace it with:

```html
  <script src="geoCoords.js"></script>
  <script src="routesDB.js"></script>
  <script src="data.js"></script>
  <script src="lang.js"></script>
  <script src="syncManager.js"></script>
  <script src="saveSystem.js"></script>
  <script src="serverState.js"></script>
  <script src="auth.js"></script>
  <script src="quests.js"></script>
  <script src="engine.js"></script>
  <script src="engine-finance.js"></script>
  <script src="engine-rivals.js"></script>
  <script src="engine-events.js"></script>
  <script src="vip_clients.js"></script>
  <script src="war_room.js"></script>
  <script src="dispatcher.js"></script>
  <script src="ui-emails.js"></script>
  <script src="ui-finance-mkt.js"></script>
  <script src="ui-dispatch.js"></script>
  <script src="ui-fleet.js"></script>
  <script src="ui-staff.js"></script>
  <script src="ui-ops.js"></script>
  <script src="ui-meta.js"></script>
  <script src="ui-sidebar.js"></script>
  <script src="showroom.js"></script>
  <script src="p2p_market.js"></script>
  <script src="b2b.js"></script>
  <script src="auctions.js"></script>
  <script src="driver_skills.js"></script>
  <script src="global_events.js"></script>
  <script src="black_ops.js"></script>
  <script src="crypto.js"></script>
  <script src="weather_real.js"></script>
  <script src="hq.js"></script>
  <script src="mobile_dispatcher.js"></script>
  <script src="hostile_takeover.js"></script>
  <script src="nemesis.js"></script>
  <script src="infrastructure.js"></script>
  <script src="contracts.js"></script>
  <script src="tourism.js"></script>
  <script src="tutorial.js"></script>
  <script src="premium-ui.js"></script>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: update script loading order for new ui-*.js modules"
```

---

## Task 15: Build CSS and final push

**Files:**
- Run: `npm run build:css`
- Verify: `tailwind.min.css` updated

- [ ] **Step 1: Build Tailwind CSS**

```bash
npm run build:css
```
Expected: `tailwind.min.css` is regenerated. Should complete without errors.

- [ ] **Step 2: Verify no renderTab functions remain in dispatcher.js**

```bash
grep -c "^function renderTab\|^async function renderTab" dispatcher.js
```
Expected output: `0`

- [ ] **Step 3: Verify all new files exist**

```bash
ls ui-dispatch.js ui-fleet.js ui-staff.js ui-ops.js ui-meta.js ui-sidebar.js
```
Expected: all 6 files listed without error.

- [ ] **Step 4: Check dispatcher.js line count (should be significantly less)**

```bash
wc -l dispatcher.js
```
Before: ~4900 lines. After extraction of 15 renderTab functions: should be under 2000 lines.

- [ ] **Step 5: Commit and push**

```bash
git add tailwind.min.css
git commit -m "build: regenerate tailwind.min.css after token updates"
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ Colour tokens: Task 1
- ✅ 1-row topbar with stat pills: Task 2
- ✅ Dark accordion sidebar 160px: Task 3
- ✅ Sidebar CSS (.sidebar-item, .sidebar-group-head): Task 4
- ✅ premium-ui.css simplified: Task 5
- ✅ ui-sidebar.js accordion + stats: Task 6
- ✅ premium-ui.js cleanup: Task 7
- ✅ Tab fade-in animation: Task 8
- ✅ dispatcher.js split (renderTabCorse, Fleet, Staff, Regions, Provinces, remaining): Tasks 9–13
- ✅ Script tags updated: Task 14
- ✅ CSS build: Task 15
- ✅ mobile responsive: style.css Task 4 + premium-ui.css Task 5
- ✅ active:scale-95 on buttons: included in sidebar Avanza Turno button; renderTab* functions already use transition-all on buttons

**Placeholder check:** No TBD, no "implement later", no vague steps. All code blocks complete.

**Type/ID consistency:**
- `#sidebar-avatar`, `#sidebar-company` defined in Task 3 HTML, read in Task 6 ui-sidebar.js ✅
- `#tb-breadcrumb` defined in Task 2 HTML, written in Task 6 ui-sidebar.js ✅
- `window._sidebarToggle` defined in Task 6, called via onclick in Task 3 HTML ✅
- `window._sidebarActivateTab` defined in Task 6, called by patched switchTab in Task 6 ✅
- `.tab-fade-in` CSS class defined in Task 1, applied in Task 8 ✅
- `window.renderTabCorse` exported in Task 9, called by switchTab in dispatcher.js ✅
