# Chauffeur Empire — UI Overhaul + dispatcher.js Modularisation

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Full UI/UX overhaul of Chauffeur Empire from "Bloomberg Terminal" dark aesthetic to a clean, eRepublik-inspired browser game look. Executed simultaneously with splitting `dispatcher.js` (~4900 lines) into focused `ui-*.js` modules. No new gameplay logic.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Layout structure | Wide sidebar (≈160px) |
| Sidebar navigation | Accordion — 5 collapsible groups |
| Colour palette | Dark nav + light content area |
| Topbar | Single slim row (42px) with stat pills |
| Animations | hover lift, active:scale-95, progress-bar ease-linear, tab fade-in |
| CSS build | Tailwind CLI (npm run build:css) — already configured |

---

## 1. Colour Tokens

```
--nav-bg:       #1e2d45   /* sidebar background */
--nav-dark:     #162030   /* sidebar logo strip / topbar */
--topbar-bg:    #1e3a5f   /* top bar */
--content-bg:   #f0f4f8   /* main panel background */
--card-bg:      #ffffff   /* card background */
--card-border:  #e2e8f0   /* card border */
--gold:         #c9a227
--text-primary: #1a2744
--text-muted:   #64748b
```

Tailwind config extended with: `nav`, `navDark`, `topbar`, `contentBg`.

---

## 2. Shell Layout (index.html)

```
┌─────────────────────────────────────────────────────┐
│  TOPBAR  42px  (logo | stat pills | breadcrumb | 👤)│
├───────────┬─────────────────────────────────────────┤
│  SIDEBAR  │  MAIN PANEL  (#tab-container)           │
│  160px    │  background: #f0f4f8                    │
│  dark nav │  cards: bg-white rounded-xl shadow-sm   │
│  accordion│                                         │
└───────────┴─────────────────────────────────────────┘
```

- `#top-bar` → single `<header>` 42px, `background: #1e3a5f`
- `#sidebar-player` → `<aside>` 160px, `background: #1e2d45`, top: 42px
- `#main-panel` → `left: 160px`, `top: 42px`, `background: #f0f4f8`
- Old nav row 2 (`.top-nav-btn` buttons) removed entirely

### Topbar content (left → right)
1. Logo icon (24×24) + company name (Cinzel, white)
2. Divider
3. Pill: 🟢 Cash (green)
4. Pill: 🟡 Reputation (gold)
5. Pill: 🟣 ShadowCoin (purple) — hidden if 0
6. Flex spacer
7. Breadcrumb — current section name
8. Avatar circle (initials)

### Stat pills HTML pattern
```html
<div class="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
  <span class="w-2 h-2 rounded-full bg-green-400"></span>
  <span id="tb-cash" class="text-white font-mono font-bold text-xs">€0</span>
</div>
```

---

## 3. Sidebar Accordion

Five groups. One group open at a time by default (the active one).

```
▼ OPERATIVO          (open by default)
    🚕 Dispatch
    🚘 Flotta
    👔 Staff & HR
    🏗️ HQ Builder
    ✨ Showroom
    📩 Inbox CEO
▶ BUSINESS
    💼 Contratti B2B
    🤝 Corporate Deals
    🌍 Bandi Turismo
    ⛽ Carburante
    💎 Executive Club
    ⚖️ Aste Giudiziarie
    🚗 Mercato Auto
▶ FINANZA
    💹 Finanza
    🏛️ Real Estate
    ₿ Crypto & Offshore
    📈 Investimenti
    📣 Marketing
▶ POTERE
    🗺️ War Room
    🗺️ Regioni
    🏛️ Politica
    🕵️ Agenzia Ombra
    🦹 Nemici VIP
    🦅 OPA Ostili
▶ INFO
    🏆 Classifica
    🎯 Missioni
    ⚖️ Ufficio Legale
    🆘 Supporto
```

### Accordion behaviour (`ui-sidebar.js`)
- State: `window._sidebarOpenGroup` (string, e.g. `'operativo'`)
- Click on group header → toggle. Smooth `max-height` transition via CSS.
- `switchTab(tab)` call → auto-opens the group containing that tab, highlights the item.
- Persists open state across tab switches within the same group.

### Active item highlight
```css
.sidebar-item.active {
  background: rgba(201,162,39,0.15);
  color: #c9a227;
  border-left: 2px solid #c9a227;
}
```

---

## 4. Card Component Standard

All `renderTab*` functions must produce cards matching:

```html
<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4
            transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
  <h3 class="text-sm font-semibold text-gray-800">Title</h3>
  <p class="text-xs text-gray-500 mt-1">Subtitle</p>
</div>
```

Button standard:
```html
<!-- Primary -->
<button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold
               px-3 py-1.5 rounded-lg transition-all active:scale-95">
  Action
</button>
<!-- Gold accent -->
<button class="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold
               px-3 py-1.5 rounded-lg transition-all active:scale-95">
  Premium
</button>
```

Progress bar (rides, stress):
```html
<div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
  <div class="h-full bg-green-500 rounded-full transition-[width] duration-1000 ease-linear"
       style="width: 65%"></div>
</div>
```

---

## 5. Tab Fade-in Animation

CSS keyframe added to `style.css`:
```css
@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tab-fade-in { animation: tabFadeIn 0.18s ease-out forwards; }
```

`_safeRender` in `dispatcher.js` adds `.tab-fade-in` to `#tab-container` after rendering.

---

## 6. File Structure After Split

### New files (extracted from dispatcher.js)

| File | Functions |
|---|---|
| `ui-sidebar.js` | accordion state machine, `updateSidebarStats`, `toggleSidebar` |
| `ui-dispatch.js` | `renderTabCorse`, drag-and-drop listeners |
| `ui-fleet.js` | `renderTabFleet` |
| `ui-staff.js` | `renderTabStaff`, `renderTabLifestyle` |
| `ui-finance.js` | `renderTabFinance` (from engine-finance), `renderTabInvestments`, `renderTabRealEstate`, `renderTabCrypto`, `renderTabMarketing` |
| `ui-ops.js` | `renderTabProvinces`, `renderTabRegions`, `renderTabPolitics` |
| `ui-shadow.js` | `renderTabShadow`, `renderTabNemesis`, `renderTabOpa` (from black_ops/nemesis/hostile_takeover) |
| `ui-meta.js` | `renderTabCareer`, `renderTabRanking`, `renderTabHelp`, `renderTabLegal` |
| `ui-contracts.js` | `renderTabContracts`, `renderTabB2B`, `renderTabTourism`, `renderTabAuctions`, `renderTabInfrastructure`, `renderTabPremiumStore`, `renderTabMarket` |

### Modified files
- `dispatcher.js` — remove extracted `renderTab*`; keep `switchTab`, `updateUI`, `_safeRender`, `_tabIs`, all dispatch/assign logic
- `premium-ui.js` — remove `diagDispatch` (bug fixed), remove `updateSidebarStats` (moved to ui-sidebar.js), keep `updateUI` patch, keep `toggleSidebar`
- `index.html` — shell rewrite + script tag list updated
- `style.css` — token updates + `tabFadeIn` keyframe
- `tailwind.config.js` — new colour tokens
- `premium-ui.css` — stripped to minimal overrides (sidebar scrollbar, news ticker offset, mobile)

### Load order in index.html (scripts)
```
config.js, data.js, geoCoords.js, lang.js
engine.js, engine-finance.js, engine-events.js, engine-rivals.js
contracts.js, b2b.js, crypto.js, hq.js, auctions.js, tourism.js
infrastructure.js, showroom.js, driver_skills.js, global_events.js
black_ops.js, nemesis.js, hostile_takeover.js, p2p_market.js
dispatcher.js
ui-sidebar.js, ui-dispatch.js, ui-fleet.js, ui-staff.js
ui-finance.js, ui-ops.js, ui-shadow.js, ui-meta.js, ui-contracts.js
design-system.js, auth.js, saveSystem.js, serverState.js
mobile_dispatcher.js, premium-ui.js
```

---

## 7. Constraints

- **CODE FREEZE** on game logic — no changes to functions that affect gameplay calculations, save/load, or Supabase interactions
- No ES6 `import`/`export` — all functions remain globals to preserve `onclick=` handlers in rendered HTML
- `engine.js` is NOT split in this plan (separate project)
- Tailwind CDN removed (already done) — use `npm run build:css` after every class change
- Must not break existing `onclick="switchTab('...')"` references in index.html nav

---

## 8. Mobile

Below 768px:
- Sidebar hidden by default (`translateX(-160px)`)
- Hamburger button (`#sidebar-toggle-btn`) shows it as overlay
- `#main-panel` left: 0
- News ticker / live map offsets reset to 0
