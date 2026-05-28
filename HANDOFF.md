# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 28 maggio 2026 — sessione completa, tutto nella lista completato
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## Stato attuale — Tutto completato

### ✅ eRepublik flat conversion — 100% completato
**Tutti i tab sono ora zero DS.* e zero Tailwind nel codice render principale.**

File completati in questa sessione:
- `contracts.js` — `_renderTenderCard`, `_renderContractCard`, header sections, info box
- `_tierBgClass()` / `_tierTextColor()` convertite da classi Tailwind a valori CSS inline

File già completati in sessioni precedenti:
- Tutti gli altri tab: home, dispatch, fleet, staff, finance, ranking, emails, marketing, ops, legal, help, hq, store, market, shadow, nemesis, crypto, b2b, auctions, tourism, hostile_takeover, infrastructure, career, investments, lifestyle, politics, realestate

**Eccezione accettata:** Modal dialog (b2b accept, crypto trade, auctions bid) — overlay secondari, Tailwind funzionante, bassa priorità.

### ✅ VTK Frontend completo
- `vtk-market.js` (v=1): modal floating, Mercato P2P + VTK Shop
- Chip topbar `◈ VTK` → `openVTKModal()`
- VTK-5: `quests.js` chiama `rpc_award_mission_vtk` fire-and-forget al claim

### ✅ PRODUCT.md + DESIGN.md creati
- `/impeccable teach` ora abilitato — i comandi `craft/polish/bolder/audit` funzionano
- `DESIGN.md`: palette, tutti i component patterns, typography, micro-interaction rule
- `PRODUCT.md`: game brief, user goals, business model

### Versione script post-sessione
- `contracts.js`: v=9
- `quests.js`: v=9
- `vtk-market.js`: v=1
- Tutti gli altri modificati precedentemente: v=9

---

## Cosa rimane (prossima sessione)

### 1. Modal dialog Tailwind cleanup (bassa priorità)
- `b2b.js` — `b2bOpenAcceptModal()`
- `crypto.js` — `cryptoOpenTradeModal()`
- `auctions.js` — `auctionsOpenBidModal()` + `auctionsRevealWon()`

### 2. war_room.js — Tab province (War Room)
- Non ancora convertito a eRepublik flat
- `renderTabWarRoom()` probabilmente usa DS.* o Tailwind

### 3. showroom.js — Parziale
- Showroom veicoli: già abbastanza inline, verificare
- Nessun DS.* trovato in precedenza

### 4. VTK-6: cron Supabase
- Schedulare `rpc_reset_daily_vtk` ogni giorno su Supabase
- Da fare nel Supabase dashboard (non codice frontend)

### 5. `/impeccable craft [tab]` — review strutturato
- Ora che PRODUCT.md + DESIGN.md esistono, si può usare su qualsiasi tab
- Suggerimento: iniziare con Home (Command Center) e Career

---

## Architettura critica

```
gameState           → let in engine.js, NON è window.gameState
window.DS           → NON usare — tutti i tab sono ora eRepublik flat inline
?v= scripts         → v=9 per tutti i file modificati, v=6 per invariati
VTK chip topbar     → onclick openVTKModal() → vtk-market.js
vtk-market.js       → v=1, caricato dopo showroom.js
PRODUCT.md          → brief prodotto (per /impeccable)
DESIGN.md           → design system completo (per /impeccable)
```

## Versioni attuale
- Tutti file UI/engine modificati: v=9
- vtk-market.js: v=1 (nuovo)
- File non toccati (v=6): war_room.js, showroom.js (DS.* 0, Tailwind minimo)
