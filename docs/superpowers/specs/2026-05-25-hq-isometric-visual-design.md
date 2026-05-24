# HQ Base Builder — Visual Isometric Campus (Design Spec)

> **Visione:** Esperienza tipo Ikariam / Tribal Wars. L'utente vede il proprio quartier generale dall'alto in prospettiva isometrica 2.5D. Ogni struttura costruita appare fisicamente sul terreno. L'edificio "cresce" man mano che sblocchi più stanze. Le macchine parcheggiate sono visibili nel piazzale. Niente librerie esterne — puro SVG + vanilla JS.

---

## 1. Concept visivo

### Prospettiva
Isometria simulata con SVG + CSS transform:
- Il campus è un `<svg>` 900×560 px
- Ground tiles: rombi isometrici (`<polygon>`)
- Buildings: forme SVG sovrapposte (base + pareti + tetto + dettagli)
- Proiezione: `rotateX(30deg) rotateZ(45deg)` su un container padre oppure coordinate iso calcolate a mano con `isoX = (col - row) * TILE_W/2`, `isoY = (col + row) * TILE_H/2`

### Stage di evoluzione campus
Il campus ha 4 stadi visivi basati su quante stanze sono state costruite:

| Stage | Stanze | Look |
|---|---|---|
| 0 (Start) | 1 | Garage isolato su terreno vuoto, erba bassa |
| 1 (Growing) | 2-5 | Qualche struttura, strade sterrate |
| 2 (Established) | 6-10 | Campus organizzato, luci, recinzione |
| 3 (Empire) | 11-15 | Penthouse visibile, elipad illuminato, skyline di notte |

Il **background del canvas** stesso cambia tra gli stage (colore cielo, illuminazione, particelle).

---

## 2. Layout fisso del campus (coordinate isometriche)

Il campus è diviso in **zone**. Ogni zona ha una posizione fissa — non c'è una griglia libera dove l'utente sceglie. Il mapping room→posizione è hard-coded in `hq-visual.js`.

```
ZONA A: Cuore operativo (centro)
  - garage_main    [col:4, row:4]   LARGE (2×2)
  - workshop       [col:6, row:4]
  - ev_parking     [col:4, row:6]   PARKING AREA (cars visibili)

ZONA B: Formazione (sinistra)
  - gym            [col:2, row:3]
  - canteen        [col:2, row:5]
  - infirmary      [col:1, row:4]

ZONA C: Intelligence (destra)
  - mission_room   [col:7, row:3]
  - it_center      [col:8, row:4]
  - rd_lab         [col:8, row:2]

ZONA D: Command (centro-alto)
  - control_tower  [col:5, row:2]   TALL (tower)
  - security_bunker[col:3, row:2]
  - vip_lounge     [col:6, row:1]

ZONA E: Prestige (punta superiore)
  - helipad        [col:5, row:0]   LARGE
  - crypto_vault   [col:3, row:0]
  - penthouse      [col:5, row:-1]  MASSIVE (3×3) — visibile dall'alto sopra tutto
```

---

## 3. SVG Building Sprites

Ogni building è un gruppo SVG con 3 layer: **base** (pavimento), **body** (pareti), **top** (tetto/dettagli).

Esempio schematico per il **Garage Principale**:
```svg
<g class="hq-building" id="bld-garage_main">
  <!-- base -->
  <polygon points="..." fill="#2a2a1a" />  <!-- pavimento iso -->
  <!-- left wall -->
  <polygon points="..." fill="#3a3a2a" />
  <!-- right wall -->
  <polygon points="..." fill="#2e2e1e" />
  <!-- roof -->
  <polygon points="..." fill="#4a4a3a" />
  <!-- portone -->
  <rect ... fill="#555" />
  <!-- finestre -->
  <rect ... fill="rgba(100,200,255,0.3)" />
</g>
```

Ogni building ha:
- Una palette colori unica (garage = grigio-marrone, torre di controllo = acciaio blu, penthouse = oro+vetro, helipad = cemento con luci rosse)
- Un'altezza proporzionale all'importanza (garage 1U, torre 3U, penthouse 4U)
- Un'animazione `pop-in` (scale 0→1 + bounce) quando viene costruita
- Un `glow` CSS pulsante sui building "attivi" con effetti bonus

### Building non costruito
Lo slot vuoto mostra:
- Pavimento isometrico in terra/erba
- Badge semitrasparente `+` al centro con il nome della stanza e il costo
- Se sbloccabile: bordo dorato lampeggiante
- Se locked: bordo grigio + lucchetto

---

## 4. Area parcheggio (Parked Cars)

L'area `ev_parking` + i tile attorno al `garage_main` fungono da piazzale.

### Logica macchine parcheggiate
```js
// In hq-visual.js
function _getParkedCars() {
  return gameState.fleet.filter(car => {
    const driver = gameState.drivers.find(d => d.assignedCar === car.id);
    // Parcheggiata se: nessun autista assegnato in corsa, o autista a riposo
    return !driver || driver.status === 'idle' || driver.status === 'resting' || driver.status === 'offline';
  }).slice(0, 6); // max 6 mostrate
}
```

### Rendering macchine
Ogni macchina è un mini SVG isometrico (60×35px):
- Berlina base: corpo rettangolare basso, 4 ruote, colore dal `car.color || '#333'`
- SUV/Van: corpo più alto, stesso pattern
- Posizionate in file di 3 nel piazzale
- Tooltip al hover: `car.brand + ' ' + car.model + ' — ' + driver?.name`
- Se un'auto parte per una corsa, sparisce con una piccola animazione smoke

### Car SVG (template riutilizzabile)
```js
function _carSVG(car, x, y) {
  const col = car.color || '#2a4a6a';
  return `
  <g transform="translate(${x},${y})" class="hq-car" data-car-id="${car.id}" title="${car.brand} ${car.model}">
    <!-- body -->
    <polygon points="0,10 40,10 40,22 0,22" fill="${col}" />
    <polygon points="8,4 32,4 40,10 0,10" fill="${col}" opacity="0.8"/>
    <!-- wheels -->
    <circle cx="10" cy="22" r="5" fill="#1a1a1a"/>
    <circle cx="30" cy="22" r="5" fill="#1a1a1a"/>
    <!-- windshield -->
    <polygon points="10,10 30,10 28,5 12,5" fill="rgba(150,220,255,0.4)"/>
  </g>`;
}
```

---

## 5. Interazione utente

### Click su building costruito
Apre un **info panel** laterale (slide-in da destra, 280px):
- Nome + icona building in grande
- Descrizione effetto attivo con valore numerico attuale
- Eventuali upgrade futuri (se previsti)
- Statistiche live (es. "Veicoli riparati oggi: 3")

### Click su slot vuoto sbloccabile
Apre il **build modal** esistente (già implementato in hq.js, `hqOpenBuildModal`) — non va riscritto, solo collegato.

### Click su slot locked
Mostra tooltip "Richiede: X, Y" — no modal.

### Hover
- Building costruito: glow dorato + label flottante con nome
- Auto parcheggiate: tooltip con brand/driver

---

## 6. Animazioni

| Evento | Animazione |
|---|---|
| Costruzione completata | SVG building scala da 0→1.05→1 in 600ms (spring), polvere particle da 4 angoli |
| Auto che parte | Car si muove verso il bordo del canvas, poi opacity 0→0 in 400ms |
| Auto che arriva | Appare dal bordo, si parcheggia con ease-out |
| Stage upgrade campus | Dissolvenza del background (0.8s), poi riappaiono i nuovi elementi con stagger |
| Building attivo con bonus | Slow pulse glow (3s loop) usando CSS animation |
| Costruzione in corso | Animazione "cantiere": mattoncini che appaiono uno alla volta (se vuoi build time) |

---

## 7. Struttura file

### File da creare: `hq-visual.js` (~500 righe)

```
Responsabilità:
  - _hqCampusHTML()          → genera il div SVG container
  - _hqBuildingGroup(roomId) → SVG <g> per un building specifico
  - _hqGroundTile(col, row)  → SVG rombo di terreno
  - _hqParking()             → sezione parcheggio con auto
  - _hqCarSVG(car, x, y)    → SVG mini auto isometrica
  - _hqBindEvents()          → click/hover handlers
  - _hqStageBackground()     → sfondo campus per stage attuale

Esporta:
  - window.renderHQCampus()  → chiamato da renderTabHQ()
```

### File da modificare: `hq.js`

Sostituire `renderTabHQ()`:
```js
window.renderTabHQ = function() {
  const container = document.getElementById('tab-container');
  if (!container) return;
  // Header + KPI strip rimangono (DS.header + DS.kpiStrip)
  // La griglia testuale viene RIMOSSA
  // Al suo posto: window.renderHQCampus() inietta il canvas isometrico
  // La lista build options (stanze disponibili/bloccate) rimane sotto il canvas
};
```

### Ordine caricamento in index.html
`hq-visual.js` deve essere caricato **subito dopo** `hq.js`:
```html
<script src="hq.js?v=5"></script>
<script src="hq-visual.js?v=1"></script>
```

---

## 8. CSS da aggiungere in `style.css`

```css
/* ── HQ Isometric Campus ── */
#hq-campus {
  width: 100%;
  max-width: 900px;
  height: 520px;
  border-radius: 12px;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 30%, #1a1f2e 0%, #0a0c12 100%);
  position: relative;
  cursor: default;
  margin-bottom: 20px;
}

#hq-campus svg {
  width: 100%;
  height: 100%;
}

.hq-building {
  cursor: pointer;
  transition: filter 0.2s;
}
.hq-building:hover {
  filter: brightness(1.3) drop-shadow(0 0 8px rgba(212,175,55,0.6));
}

.hq-building-locked {
  opacity: 0.35;
  cursor: not-allowed;
}

.hq-building-available {
  animation: hq-slot-pulse 2s ease-in-out infinite;
}
@keyframes hq-slot-pulse {
  0%, 100% { opacity: 0.6; }
  50%       { opacity: 1; }
}

@keyframes hq-build-in {
  0%   { transform: scaleY(0) translateY(20px); opacity: 0; }
  70%  { transform: scaleY(1.05); opacity: 1; }
  100% { transform: scaleY(1); opacity: 1; }
}
.hq-build-anim {
  transform-origin: bottom center;
  animation: hq-build-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.hq-car {
  cursor: pointer;
  transition: filter 0.15s;
}
.hq-car:hover {
  filter: brightness(1.4) drop-shadow(0 0 4px rgba(212,175,55,0.5));
}

/* Info panel laterale */
#hq-info-panel {
  position: absolute;
  right: 0; top: 0;
  width: 260px; height: 100%;
  background: rgba(10,12,18,0.92);
  border-left: 1px solid rgba(212,175,55,0.2);
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.22,1,0.36,1);
  padding: 16px;
  overflow-y: auto;
}
#hq-info-panel.open {
  transform: translateX(0);
}
```

---

## 9. gameState — nessuna modifica

La struttura dati di `gameState` non cambia. Tutto ciò che serve è già lì:
- `gameState.hqRooms[]` — stanze costruite
- `gameState.hqGrid{}` — mapping slot→roomId (può essere ignorato dal visual renderer che usa posizioni fixed)
- `gameState.fleet[]` — veicoli (per parcheggio)
- `gameState.drivers[]` — autisti (per determinare quali auto sono parcheggiate)

**Nota:** `gameState.hqGrid` viene mantenuto per retrocompatibilità ma il renderer visuale usa posizioni fisse definite in `hq-visual.js`.

---

## 10. Costanti di layout isometrico

```js
// In hq-visual.js (top of file)
const ISO_TILE_W  = 64;   // larghezza rombo
const ISO_TILE_H  = 32;   // altezza rombo (= TILE_W / 2 per isometria standard)
const ISO_ORIGIN_X = 440; // x del tile [0,0] nel canvas SVG
const ISO_ORIGIN_Y = 80;  // y del tile [0,0] nel canvas SVG

// Converte coordinate griglia → pixel SVG
function _isoToScreen(col, row) {
  return {
    x: ISO_ORIGIN_X + (col - row) * ISO_TILE_W / 2,
    y: ISO_ORIGIN_Y + (col + row) * ISO_TILE_H / 2,
  };
}
```

---

## 11. Struttura SVG di ogni building

Ogni building viene definito come una funzione `_bld_<id>(cx, cy, built)` che ritorna SVG string.

Le costanti di forma isometrica riutilizzabili:
```js
// Parallelepipedo isometrico: x,y = centro base, w = larghezza, d = profondità, h = altezza
function _isoBox(x, y, w, d, h, colorTop, colorLeft, colorRight) {
  // top face (rombo)
  const topPts = [
    `${x},${y-h}`,
    `${x+w/2},${y-h+d/4}`,
    `${x},${y-h+d/2}`,
    `${x-w/2},${y-h+d/4}`,
  ].join(' ');
  // left face
  const leftPts = [
    `${x-w/2},${y-h+d/4}`,
    `${x},${y-h+d/2}`,
    `${x},${y+d/2}`,
    `${x-w/2},${y+d/4}`,
  ].join(' ');
  // right face
  const rightPts = [
    `${x+w/2},${y-h+d/4}`,
    `${x},${y-h+d/2}`,
    `${x},${y+d/2}`,
    `${x+w/2},${y+d/4}`,
  ].join(' ');

  return `
    <polygon points="${topPts}"   fill="${colorTop}"   />
    <polygon points="${leftPts}"  fill="${colorLeft}"  />
    <polygon points="${rightPts}" fill="${colorRight}" />
  `;
}
```

---

## 12. Building palette di riferimento

| Room ID | Colori (top, left, right) | Altezza | Note |
|---|---|---|---|
| garage_main | #3d3620, #2a2415, #1e1a10 | 1.5U | Portoni grigi sulla facciata |
| workshop | #2a3040, #1e2430, #161c24 | 1U | Finestra luminosa gialla |
| ev_parking | #1a2a1a, #102010, #0c1a0c | 0.5U | Solo tettoia + colonnine ricarica |
| gym | #2d2d3a, #1e1e2a, #17172a | 1.5U | Logo 🏋️ sulla parete |
| canteen | #3a2a1e, #2a1e14, #22180e | 1U | Finestre calde arancio |
| infirmary | #2a3a3a, #1e2a2a, #162020 | 1U | Croce rossa sulla porta |
| mission_room | #1e2a40, #141e30, #0e1624 | 2U | Schermi blu che brillano attraverso le finestre |
| it_center | #1a1a40, #10102a, #0c0c20 | 1.5U | Antenne sul tetto |
| rd_lab | #1a2a2a, #101e1e, #0c1616 | 2U | Finestre verdi (holographic) |
| control_tower | #202840, #141c2e, #0e1420 | 4U | TALL — antenna rossa lampeggiante in cima |
| security_bunker | #2a2a2a, #1c1c1c, #141414 | 1.5U | Slit windows |
| vip_lounge | #40301a, #2a200e, #201808 | 2U | Vetrate gold, luci calde |
| helipad | #303030, #202020, #181818 | 0.3U | WIDE — H marking + luci bordo |
| crypto_vault | #1a1a1a, #101010, #0c0c0c | 1.5U | Vault door sul fronte |
| penthouse | #d4af37 accent, #1a2040, #0e1430 | 5U | MASSIVE — glass, gold trim, luci su ogni piano |

---

## 13. Stage 3 "Empire" — effetti speciali

Quando tutte le 15 stanze sono costruite (o score ≥ 150):
- Background diventa notte con stelle (CSS radial-gradient multipli)
- La Penthouse emette un riflettore verticale (SVG `<line>` + blur filter)
- L'elipad ha luci rosse lampeggianti (CSS animation blink)
- Le finestre di tutti gli edifici si illuminano (opacity oscillate)
- Particelle doree volano lentamente dal basso verso l'alto

---

## 14. Piano di implementazione per Antigravity

### Task 1 — Scaffolding + CSS
- Aggiungere blocco CSS HQ in `style.css` (sezione 8 di questo doc)
- Creare `hq-visual.js` con costanti ISO e funzione `_isoToScreen`
- Aggiungere `<script src="hq-visual.js?v=1">` in `index.html` dopo `hq.js?v=5`
- Esportare `window.renderHQCampus = function() { ... }` che per ora inietta solo il `<div id="hq-campus">` con un SVG vuoto

### Task 2 — Ground tiles + layout
- Implementare `_hqGroundTile(col, row, type)` che ritorna SVG polygon rombo
  - type: 'grass' | 'stone' | 'parking' | 'road'
- Disegnare il terreno base del campus (griglia 10×8 di tile misti)
- Il layout terra è fisso, non dipende dalle stanze costruite

### Task 3 — `_isoBox` + building primitives
- Implementare `_isoBox(x, y, w, d, h, colorTop, colorLeft, colorRight)` (sezione 11)
- Implementare le 15 funzioni `_bld_<id>(cx, cy, built)` usando `_isoBox`
  - Iniziare dai 4 più importanti: `garage_main`, `control_tower`, `penthouse`, `ev_parking`
  - Gli altri 11 possono essere variazioni parametriche di `_isoBox`

### Task 4 — Campus renderer + click handlers
- Implementare `_hqCampusHTML()` che:
  1. Crea `<svg viewBox="0 0 900 560">`
  2. Disegna tutti i ground tiles
  3. Ordina i building per `row + col` (painter's algorithm, dal basso verso l'alto)
  4. Per ogni building slot: chiama `_bld_<id>(cx, cy, built)` dove `built = hqHasRoom(id)`
- Aggiungere click handlers:
  - Built: apre info panel `#hq-info-panel`
  - Available: chiama `hqOpenBuildModal()` esistente
  - Locked: mostra tooltip requisiti
- Aggiornare `renderTabHQ()` in `hq.js` per chiamare `renderHQCampus()` invece della griglia testuale

### Task 5 — Parcheggio + auto
- Implementare `_getParkedCars()` (sezione 4)
- Implementare `_carSVG(car, x, y)` (sezione 4)
- Posizionare le auto nel tile `ev_parking` + adjacenti al `garage_main`
- Aggiungere tooltip hover con brand/driver/status

### Task 6 — Animazioni + stage upgrade
- Aggiungere `.hq-build-anim` CSS class al SVG group quando una stanza viene costruita
- Implementare `_hqStageBackground()` che cambia il background del canvas secondo lo stage
- Aggiungere particelle polvere costruzione (4 cerchi che si espandono e sfumano)
- Stage 3 "Empire": stelle, riflettore penthouse, luci helipad

### Task 7 — Info panel laterale
- Creare `#hq-info-panel` (slide-in da destra nel `#hq-campus`)
- Al click su un building costruito: popola con nome, effetto, valore attuale, stats live
- Click fuori chiude il panel

### Task 8 — Rifinitura + cache bust
- Verificare che `hqBuildRoom()` chiami `renderTabHQ()` → aggiorna il campus
- Verificare che le auto spariscano quando un autista parte per una corsa (ogni volta che `renderTabHQ` viene chiamato, le auto vengono ricalcolate da `gameState.fleet`)
- Bumpa `?v=` di `hq.js` e `hq-visual.js` in `index.html`
- Aggiornare `CLAUDE.md` con il nuovo file

---

## 15. Note critiche per Antigravity

1. **`gameState` è `let` in `engine.js`** — NON usare `window.gameState`, usare bare `gameState`
2. **Tutte le funzioni condivise tra file vanno esportate come `window.X`** — hq-visual.js deve usare `window.hqHasRoom`, `window.HQ_ROOMS`, `window.hqOpenBuildModal`, `window.hqBuildRoom`
3. **Cache busting**: ogni modifica a un file JS richiede di bumpar il suo `?v=N` in `index.html`
4. **Dark theme attivo**: background è `#0a0c12`, gold è `#d4af37`. Non usare colori chiari nel campus
5. **`hq.js` mantiene tutta la logica di gioco invariata** — hq-visual.js è SOLO rendering, zero game logic
6. **Painter's algorithm per SVG isometrico**: i tile più "vicini" all'osservatore (row alto + col alto) devono essere disegnati DOPO quelli più lontani per l'effetto depth corretto. Ordina i gruppi SVG per `row + col` crescente prima di iniettarli.
7. **Il modal build esistente in `hqOpenBuildModal`** non va riscritto — agganciarlo semplicemente al click sugli slot vuoti disponibili
8. **`renderTabHQ()` viene chiamato ogni volta che il tab HQ è aperto** e dopo ogni costruzione — il rendering deve essere idempotente e veloce (<16ms per non droppare frame)
