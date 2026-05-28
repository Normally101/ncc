# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 28 maggio 2026
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## Stato attuale (cosa è stato fatto)

### Sessione 27 maggio 2026 (sera)

1. **Career tab → modal overlay** (`ui-career.js` rewrite completo)
   - `window.openCareerModal()` / `window.closeCareerModal()` / `window.renderTabCareer()`
   - Layout 2 colonne: timeline+obiettivi | sidebar archivio
   - CSS iniettato via `<style id="career-modal-css">`
   - Chiusura ripristina il tab precedente via `window._careerPrevTab`

2. **VTK token economy** — sistema completo
   - `gameState.vtkBalance` in engine.js
   - Tutte le 156 quest migrate con campo `vtk` (nessuna dà più DC)
   - `serverState.js` sincronizza `vtk_balance` da Supabase
   - `quests.js` gestisce `r.vtk` in `claimQuestReward()`
   - Topbar chip `#tb-vtk` (blu) in index.html, updateUI() lo aggiorna
   - `21_vtk_token.sql` DEPLOYED su Supabase

3. **Tab redesign eRepublik flat completati in questa sessione:**
   - `ui-dispatch.js` — layout 2 colonne, drag-drop preservato
   - `ui-finance.js` — CSS iniettato, stock table, broker flat
   - `ui-ranking.js` — classifica flat, achievements grid
   - (i tab di ieri: ui-politics, ui-market, ui-investments, ui-realestate, ui-lifestyle, ui-marketing)

4. **Versione script:** tutti i file modificati bumped a `?v=7`

### Sessione 28 maggio 2026 (oggi)

- Committato tutto il lavoro di ieri che era rimasto unstaged
- Inizializzato sistema di memoria in `/Users/vlad/.claude/projects/-Users-vlad-Documents-ncc-game/memory/`
- Aggiunto PROTOCOLLO SESSIONE in CLAUDE.md (skills, stile eRepublik, palette, regole)

---

## Prossimi step (da fare nella prossima sessione)

### PRIORITÀ ALTA — Tab da rifare (stile eRepublik)

1. **`ui-store.js`** — Executive Club / showroom
   - Attualmente usa DS.* e Tailwind
   - Contiene: store veicoli premium, upgrade, DC spend actions

2. **`ui-hub.js`** — HQ buildings
   - Attualmente usa DS.* e Tailwind
   - Contiene: Smart Hub navigation, toggle, openHub

3. **Verificare questi** (aprirli e guardare se usano DS.*):
   - `ui-emails.js`
   - `ui-ops.js` (regions/provinces)
   - `ui-legal.js`
   - `ui-home.js`
   - `ui-help.js`

### PRIORITÀ MEDIA — VTK frontend mancante

4. **VTK Market UI** — tab o sezione in Finance
   - SQL pronto (`vtk_market_orders`, RPC place/fill/cancel order)
   - Funzionalità: lista ordini aperti, piazza ordine sell, compra VTK
   - Modello: simile alla sezione P2P di Finance

5. **VTK Shop UI** — items acquistabili con VTK
   - Item pianificati: `slot_garage_7d` (200 VTK), `driver_stress_reset` (80 VTK), `rep_boost_01` (150 VTK, 1/settimana)

6. **`rpc_award_mission_vtk`** — collegarlo al completamento missione server-side
   - Attualmente il VTK è assegnato solo client-side in `quests.js`
   - Il RPC esiste già su Supabase (con cap 500/day)

### PRIORITÀ BASSA

7. `/impeccable teach` — creare PRODUCT.md + DESIGN.md per abilitare i comandi impeccable strutturati
8. Province War UI (`renderTabProvinces`) — definita in war_room.js ma UI da rivedere
9. Real Estate expansion

---

## Architettura critica da ricordare

```
gameState           → let in engine.js, NON è window.gameState (usare sempre bare gameState)
window.DS           → NON usare in nuovi tab — stile eRepublik flat invece
?v= scripts         → bumpa sempre prima di committare (attualmente v=7)
career tab          → apre modal overlay, NON renderizza in #tab-container
drag-drop dispatch  → class ops-ride-card e ops-driver-row su <tr> — NON rinominare mai
```

## Skills di design

- **taste-skill-leonx** → anti-slop, layout, gerarchia
- **emilkowalski** → micro-interactions, :active scale(0.97), ease-out, polish
- **impeccable** → review strutturata (manca PRODUCT.md — fare /impeccable teach prima)

## Versione attuale script

Tutti i file core: `?v=7` in index.html
