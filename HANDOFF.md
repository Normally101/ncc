# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 28 maggio 2026 — dopo sessione completa UI + VTK frontend
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## Stato attuale

### Sessione 28 maggio 2026 — Parte 2 COMPLETATA

#### ✅ eRepublik card renders — 6 file completati
- `nemesis.js` — `_renderNemesisCard()` + info box convertiti
- `black_ops.js` — `renderTabShadow()` completo (defense panel, target cards, log)
- `crypto.js` — `renderTabCrypto()`: market cards + offshore cards inline
- `b2b.js` — `renderTabB2B()`: contratto attivo + lista appalti inline
- `auctions.js` — `_tierBadge()` + wonBanner + auction cards + bid history inline
- `tourism.js` — `_tTierBadge()` + subtab switcher + open/locked/cooldown/my-contracts cards inline

**Nota:** Modal dialog in b2b, crypto, auctions mantengono Tailwind — sono overlay secondari usati raramente.

#### ✅ VTK Frontend — `vtk-market.js` (NUOVO)
- Modal floating accessibile dal chip `◈ VTK` in topbar (prima apriva career tab)
- **Tab Mercato P2P**: place/fill/cancel sell orders VTK → DC via Supabase RPC
- **Tab VTK Shop**: 3 item acquistabili con VTK inline eRepublik:
  - `slot_garage_7d` (200 VTK): +1 slot veicolo per 7 giorni
  - `driver_stress_reset` (100 VTK): azzera stress autista più stressato
  - `rep_boost_01` (300 VTK): +0.2★ reputazione istantanea

### Versione script post-sessione
- File UI rewrite round 2: v=9 (nemesis, black_ops, crypto, b2b, auctions, tourism)
- `vtk-market.js`: v=1 (nuovo)
- Commit: `371257c` + `ea5749a`

---

## Cosa NON è stato fatto

### Modal dialog Tailwind residuo (bassa priorità)
- `b2b.js` — `b2bOpenAcceptModal()` usa Tailwind (modal selezione veicoli)
- `crypto.js` — `cryptoOpenTradeModal()` usa Tailwind (modal buy/sell coin)
- `auctions.js` — `auctionsOpenBidModal()` + `auctionsRevealWon()` usa Tailwind
- **Non urgente** — funzionano, Tailwind è nel bundle compilato

### contracts.js — render card interno ancora parzialmente Tailwind
- `_renderTenderCard()` usa `class="border ${tierBg} rounded-2xl"` etc. per il div wrapper
- Funziona visivamente ma non è 100% inline

### VTK Backend incompleto (VTK-5, VTK-6)
- `rpc_award_mission_vtk` non ancora chiamato server-side (ora client-only in quests.js)
- Cron Supabase `rpc_reset_daily_vtk` non ancora schedulato

### `/impeccable teach`
- PRODUCT.md e DESIGN.md NON ancora creati
- Necessari per i comandi `craft/polish/bolder/audit`

---

## Prossimi step

### 1. ui-store.js — Premium Store (13 Tailwind class= ma DS.* 0)
- Verificare se funziona o ha bug UI
- Se Tailwind → rewrite inline

### 2. contracts.js — card render completamento
- `_renderTenderCard()` e `_renderContractCard()` usano ancora `class=` per wrappers
- Minor cleanup

### 3. VTK-5: server-side award
- In `quests.js` `claimQuestReward()`, dopo aver aggiunto VTK a gameState, chiamare anche `rpc_award_mission_vtk`
- Assicura che il balance lato Supabase sia aggiornato

### 4. `/impeccable teach`
- Creare PRODUCT.md + DESIGN.md nella root del progetto
- Poi `/impeccable craft` sui tab principali per un review strutturato

---

## Architettura critica

```
gameState           → let in engine.js, NON è window.gameState
window.DS           → NON usare — stile eRepublik flat inline ovunque
?v= scripts         → v=9 per tutti i file modificati, v=6 per invariati
career tab          → modal overlay (openCareerModal), NON tab inline
VTK chip topbar     → onclick openVTKModal() → vtk-market.js
vtk-market.js       → v=1, caricato dopo showroom.js in index.html
```

## Versione attuale script
- Tutti modificati (25+ file): v=9
- vtk-market.js: v=1
- ui-store.js: v=6 (non toccato)
- contracts.js: v=9 (parzialmente rewritten)
