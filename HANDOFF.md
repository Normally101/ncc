# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 29 maggio 2026
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## Stato attuale — Tutto completato e stabile

### ✅ eRepublik flat conversion — 100% completato
**Tutti i tab: zero DS.*, zero Tailwind nel codice render principale.**

- `contracts.js` — inline completo (ultima sessione)
- `b2b.js` — inline completo incluso `classList.toggle` fix
- Tutti gli altri tab: home, dispatch, fleet, staff, finance, ranking, emails, marketing, ops, legal, help, hq, store, market, shadow, nemesis, crypto, b2b, auctions, tourism, hostile_takeover, infrastructure, career, investments, lifestyle, politics, realestate, war_room

**war_room.js usa classi wr-* self-defined (CSS iniettato nel file) — pattern accettato come showroom.js/ui-store.js.**

### ✅ War Room — BUG CRITICO FIXATO
- War Room spariva dopo ~1 secondo ad ogni apertura
- Causa: `switchTab('corse')` nella callback `'load'` di Mapbox in `map.js` → redirect verso Dispatch + distruzione mappa
- Fix: rimossa quella riga. `initMap()` è chiamata SOLO da `openMapOverlay()`, non c'è nessun "boot iniziale" che la chiami
- `map.js` → v=7

### ✅ VTK Frontend completo
- `vtk-market.js` (v=1): modal floating, Mercato P2P + VTK Shop
- Chip topbar `◈ VTK` → `openVTKModal()`
- VTK-5: `quests.js` chiama `rpc_award_mission_vtk` fire-and-forget al claim

### ✅ PRODUCT.md + DESIGN.md creati
- `/impeccable teach` abilitato — `craft/polish/bolder/audit` funzionano
- `DESIGN.md`: palette, tutti i component patterns, typography, micro-interaction rule
- `PRODUCT.md`: game brief, user goals, business model

---

## Versioni script attuali

| Gruppo | Versione |
|---|---|
| Tutti i file UI/engine modificati nelle ultime sessioni | v=9 |
| `map.js` | v=7 |
| `vtk-market.js` | v=1 (nuovo) |
| File non toccati (war_room.js, showroom.js, ecc.) | v=6 |

---

## Cosa rimane

### 1. VTK-6: cron Supabase (non frontend)
- Schedulare `rpc_reset_daily_vtk` ogni giorno nel Supabase dashboard
- Non richiede modifiche al codice frontend

### 2. `/impeccable craft [tab]` — review strutturato
- PRODUCT.md + DESIGN.md esistono → si può lanciare su qualsiasi tab
- Suggerimento: Home (Command Center) e Career per prime

### 3. Console warnings War Room (ignorabili)
- `ERR_BLOCKED_BY_CLIENT` su `events.mapbox.com` — Mapbox analytics bloccati dall'ad blocker. Harmless.
- "map container element should be empty" — warning Mapbox su re-init dopo destroy. Harmless, mappa funziona.

---

## Architettura critica

```
gameState           → let in engine.js, NON è window.gameState
window.DS           → NON usare — tutti i tab sono ora eRepublik flat inline
?v= scripts         → v=9 per file UI/engine, v=7 per map.js, v=6 per invariati
VTK chip topbar     → onclick openVTKModal() → vtk-market.js
PRODUCT.md          → brief prodotto (per /impeccable)
DESIGN.md           → design system completo (per /impeccable)

War Room (provinces):
  - openMapOverlay() → _ensureMap() → initMap() (se map===null)
  - closeMapOverlay() → _destroyMap() (map=null) quando si lascia il tab
  - initMap() NON chiama più switchTab() — era il bug
  - ERR_BLOCKED_BY_CLIENT da Mapbox = ad blocker, non un errore reale
```
