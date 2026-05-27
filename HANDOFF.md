# Chauffeur Empire — Handoff per nuova chat

## Progetto

Browser game vanilla JS + Supabase. Nessun bundler. Tutto window-scoped. `gameState` globale.
Cartella: `/Users/vlad/Documents/ncc_game/`
Repository GitHub privato.

---

## Stile visivo — eRepublik flat (REGOLA ASSOLUTA)

**Palette:**
- Background: `#0d1117` (pagina), `#161b22` (card)
- Border: `1px solid #21262d`
- Testo primario: `#e6edf3`
- Testo muted: `#8b949e`, dim: `#6b7280`, ghost: `#404040`
- Gold: `#d4af37` (testo), `#b8962b` (border)
- Green: `#3fb950` | Blue: `#58a6ff` | Red: `#f85149`
- Font mono: `font-family:monospace`

**Regole:**
- Zero neon, zero glow, zero box-shadow decorativo
- Tutto inline style — no DS.* helper, no Tailwind classes
- Border-radius max 6px sulle card, 4px su button/input
- Bottone gold: `background:#1a1608;border:1px solid #b8962b;color:#d4af37`
- Bottone ghost: `background:#161b22;border:1px solid #21262d;color:#8b949e`
- Header sezione: `font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em`
- KPI strip: `display:grid;grid-template-columns:repeat(4,1fr);gap:8px`

---

## Cosa è stato fatto in questa sessione

### 1. Missions Modal — `ui-career.js` (REWRITE COMPLETO)

Il tab "Missioni & Carriera" ora apre una **modal overlay** invece di renderizzare nel tab-container.

**Funzioni chiave (window-scoped):**
```javascript
window.openCareerModal()    // crea overlay, aggiunge ESC + backdrop click
window.closeCareerModal()   // rimuove overlay, ripristina tab precedente
window.renderTabCareer()    // svuota container, chiama openCareerModal()
```

**Struttura modal:**
- `#career-modal-overlay` — `position:fixed;inset:0;background:rgba(7,9,15,0.82)`
- Layout interno: grid 2 colonne (`1fr 240px`) — timeline+obiettivi | sidebar archivio
- CSS iniettato via `<style id="career-modal-css">` al primo render
- Classi CSS modal: `cm-main`, `cm-head`, `cm-timeline`, `cm-tl-node` (done/active/locked), `cm-obj-table`, `cm-chip` (gold/green/vtk), `cm-btn`, `cm-sidebar`, `cm-node-row`, `cm-arch-row`
- VTK chip: `<span class="cm-chip vtk">+N VTK</span>` — blue `#7b9fe0`, border `#4b5a8b`, bg `#151c2e`
- Mantenute su window: `_showBivioModal`, `_applyBivioChoice`, `startMissionRun`

**Ripristino tab precedente:**
```javascript
// in closeCareerModal():
const prev = window._careerPrevTab;
if (prev && prev !== 'career' && typeof window.switchTab === 'function') window.switchTab(prev);
```

---

### 2. `dispatcher.js` — prevTab tracking

Nel case 'career' aggiunto:
```javascript
case 'career': title.innerText = "Missioni & Carriera"; window._careerPrevTab = _prevTab; _safeRender(renderTabCareer); break;
```

---

### 3. VTK (Vettura Token) — economia secondaria

**Motivazione:** Le missioni non devono ricompensare DC (inflazione). VTK è il token earned-only da missioni, tradeable P2P con DC.

**gameState:** `vtkBalance: 0` (aggiunto in `engine.js`)

**`engine.js` modifiche:**
- `vtkBalance: 0` nel default gameState (dopo `driverCoins: 50`)
- Save loading: `if (save.vtkBalance === undefined) save.vtkBalance = 0;`
- Entrambi i reset objects: `vtkBalance: 0`
- In `updateUI()`: `const elVTK = document.getElementById('tb-vtk'); if (elVTK) elVTK.innerText = (gameState.vtkBalance || 0);`

**`serverState.js`:**
```javascript
gameState.vtkBalance = (_company.vtk_balance != null) ? _company.vtk_balance : (gameState.vtkBalance ?? 0);
```

**`quests.js` — `claimQuestReward()`:**
```javascript
if (r.vtk) gs.vtkBalance = (gs.vtkBalance || 0) + r.vtk;
// refresh modal se aperta:
if (document.getElementById('career-modal-overlay') && typeof window.openCareerModal === 'function') window.openCareerModal();
```

**`index.html` — topbar VTK chip (dopo DC chip):**
```html
<div class="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 flex-shrink-0 cursor-pointer" onclick="switchTab('career')" title="Vettura Token — guadagnati dalle missioni">
  <span class="text-blue-300 text-[10px]">◈</span>
  <span id="tb-vtk" class="text-blue-300 font-mono font-bold text-xs">0</span>
</div>
```

---

### 4. `quests-data.js` — campo `vtk` su tutti i reward

156 quest rewards aggiornati con campo `vtk`. Valori per tier cash:
- 0€ → 200 VTK
- 1–19k€ → 150 VTK
- 20–49k€ → 200 VTK
- 50–99k€ → 250 VTK
- 100–199k€ → 300 VTK
- 200–499k€ → 380 VTK
- 500k+€ → 450 VTK

Tutorial (t01–t06): vtk 50, 60, 80, 70, 100, 120
Story ch.2 (m01–m09): vtk 200, 180, 200, 250, 300, 220, 230, 350, 280

**Importante:** t05 e m04 hanno `tc:0` (rimosso DC) — le missioni non danno più DC.

---

### 5. `21_vtk_token.sql` — DEPLOYED su Supabase

**Colonne su `companies`:**
```sql
vtk_balance      BIGINT NOT NULL DEFAULT 0
vtk_earned_today BIGINT NOT NULL DEFAULT 0
vtk_today_reset  DATE   DEFAULT CURRENT_DATE
```

**RPC disponibili:**
- `rpc_reset_daily_vtk()` — reset giornaliero (chiamato da engine-daily o cron)
- `rpc_award_mission_vtk(mission_id TEXT, vtk_amount BIGINT)` — award con cap 500/day
- `rpc_place_vtk_sell_order(vtk_amount BIGINT, dc_price NUMERIC)` — crea ordine P2P
- `rpc_fill_vtk_order(order_id UUID)` — buyer paga DC, seller riceve DC, buyer riceve VTK
- `rpc_cancel_vtk_order(order_id UUID)` — cancella ordine, restituisce VTK

**Tabelle:**
- `vtk_market_orders` — ordini P2P con RLS
- `vtk_shop_purchases` — placeholder per VTK shop

---

### 6. Tab redesign — eRepublik flat table style

Tutti i tab seguono questo pattern di layout:
- Header: eyebrow `9px uppercase` + title `20px bold` + subtitle `11px muted`
- KPI strip: `grid 4 colonne`, card `background:#161b22;border:1px solid #21262d;border-radius:6px`
- Tabelle: `border-collapse:collapse`, `<tr style="border-bottom:1px solid #21262d">`
- TH: `font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em`

#### `ui-dispatch.js` — REWRITE COMPLETO
- Layout 2 colonne: rides (sinistra) | drivers (destra)
- **CRITICO per drag-drop:** `<tr class="ops-ride-card ce-table-row" draggable="true" data-id="...">` e `<tr class="ops-driver-row ce-table-row" data-id="...">` — questi class name NON vanno cambiati, il drag-drop usa `e.target.closest('.ops-ride-card')`
- Tier color badges: `#6b7280` std, `#4b7ab8` bus, `#b8962b` first, `#b86b3a` ultra, `#8a5fa0` presidential
- Drag hover usa `style.background` (non classList) perché `<tr>` non supporta bene classList per colori

#### `ui-ranking.js` — REWRITE COMPLETO
- Async fetch Supabase leaderboard con render token (anti-stale)
- Tabella classifica flat inline
- Sezioni: KPI strip, leaderboard, Guerra dei Prezzi, Achievements 4-col grid, New Game+

#### `ui-finance.js` — REWRITE COMPLETO
- CSS iniettato una volta: `<style id="finance-css">` con keyframes `price-flash-up`/`price-flash-down`
- `_flashTicker(id, dir)` usa ancora `id="ftick-${t.id}"` sui `<tr>` ticker
- Broker buttons: classi `.fi-risk-btn` e `.fi-dur-btn` (non più `.risk-btn`/`.dur-btn`) con `.active` state via CSS iniettato
- Tabella stock con sparkline SVG preservate
- Sezioni: portfolio dashboard, stock market, broker, credit+loans, $CEMP, IPO, P2P (delegate), exit strategy

#### `ui-fleet.js` e `ui-staff.js` — già riscritti in sessione precedente (stesso stile)

---

## Tab ancora DA fare (stile eRepublik)

I seguenti tab usano ancora DS.* e Tailwind e vanno riscritti:

| File | Sezioni principali |
|------|-------------------|
| `ui-store.js` | Showroom veicoli, upgrade, assicurazioni |
| `ui-market.js` | P2P marketplace, offerte driver |
| `ui-hub.js` | HQ buildings |
| `ui-realestate.js` | Immobili |
| `ui-marketing.js` | Campagne marketing |
| `ui-politics.js` | Politica, sindacato |
| `ui-investments.js` | (verificare se già flat) |
| `ui-lifestyle.js` | Lifestyle/VIP |

---

## Feature non ancora implementate (lato frontend)

### VTK Market UI
SQL pronto (`vtk_market_orders`, RPCs), frontend inesistente.
Da aggiungere nel tab Finance o in un tab dedicato.

### VTK Shop UI
SQL placeholder (`vtk_shop_purchases`), nessun frontend né item definitivi.
Item pianificati: `slot_garage_7d` (200 VTK), `driver_stress_reset` (80 VTK), `rep_boost_01` (150 VTK, 1/week).

---

## Architettura importante da sapere

### Tab system
```javascript
// dispatcher.js
switchTab(tab)          // cambia tab, chiama _safeRender()
_prevTab                // tab precedente (usato da career modal)
_safeRender(fn)         // wrappa render in try/catch
```

### Save/Load
- `engine.js` gestisce save/load da localStorage
- `serverState.js` sincronizza da Supabase (cash, rep, driverCoins, vtkBalance)
- Supabase è source of truth per valori economici

### Supabase
- Client: `window.supabaseClient`
- User: `window.currentUser`
- Company row: colonna `user_id = auth.uid()`

### DS.* (design-system.js) — NON usare nei nuovi file
`DS.header()`, `DS.kpiStrip()`, `DS.card()`, `DS.btn()`, `DS.pill()`, `DS.empty()`, `DS.table()`, etc.
Tutti i tab riscritti usano inline style invece.

### design-system.js — da rimuovere eventualmente
Ancora usato da tab non ancora riscritti. Non toccare finché esistono dipendenze.

---

## Roadmap items aperti (da `docs/superpowers/plans/2026-05-07-chauffeur-empire-upgrade.md`)

- [ ] VTK-3: UI mercato P2P VTK (SQL fatto, frontend manca)
- [ ] VTK-4: VTK shop con items acquistabili
- [ ] VTK-5: `rpc_award_mission_vtk` chiamato server-side al complete missione
- [ ] VTK-6: daily cap reset via cron Supabase
- Province War, Real Estate expansion, etc.

---

## Note critiche

1. **Drag-drop dispatch**: class `ops-ride-card` e `ops-driver-row` su `<tr>` sono usate da `e.target.closest()` nel codice drag-drop — non rinominarle mai.
2. **Modal career**: quando il modal è aperto e si fa claim reward, `openCareerModal()` viene richiamata (si distrugge e ricrea da zero). Normale.
3. **VTK non si guadagna da DC**: le missioni reward solo VTK, non DC. Questa è una scelta di design economica deliberata.
4. **Syntax check**: prima di dichiarare un file fatto, sempre `node --check <file>`.
5. **Topbar index.html**: usa Tailwind (è l'unica parte del progetto che lo usa — la topbar è fissa e non va riscritta).
