# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 30 maggio 2026
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## 🎯 DIREZIONE ATTIVA: Redesign "eRepublik-Modern" (target bloccato dall'utente)

**CAMBIO DI ROTTA IMPORTANTE.** Il gioco abbandona lo stile *eRepublik flat DARK* e passa a uno stile **eRepublik-Modern**: tema **chiaro**, denso, con chrome a barra-risorse + nav orizzontale + **sfondo cielo/skyline ai lati**, esecuzione moderna e pulita (no glossy 2012). NON applicare più il dark-flat ai nuovi lavori.

- **Target visivo bloccato** = mockup **E4** in `_mockups/E4_erepublik_dense.html` (+ tappe E/E2/E3). Aprire quelli per vedere com'è.
- **Kit nuovo** = classi `.em*` in fondo a `style.css`, **isolate sotto `.em`** così non toccano le tab dark finché non convertite. Font: **Inter** (già caricato).

### FASE 1 — FATTA
- Home reale (`ui-home.js` → **v=9**) riscritta col kit `.em` (light, denso). Contenuto: 4 KPI + banner Sfida + "Corse in Corso" + "In coda" (pendingRides reali) + feed destro (Contratto + Notifiche da emails + sezione "Autisti" da gs.drivers). Centrato con `.em-wrap` (max-width ~1120) → margini/sfondo ai lati. Mantiene `data-countup` e `switchTab`.
- **NB contenuto vs chrome:** la Home renderizza SOLO il contenuto della scheda. Rail giocatore, Power Spin, barra risorse e nav orizzontale sono **chrome (Fase 2)**: nel gioco vero saranno il telaio globale attorno alla Home, non dentro `ui-home.js`. È per questo che l'anteprima sembra "più scarna" del mockup E4 a pagina intera.
- **Come vederla:** apri `_mockups/home_real_preview.html` (usa lo `style.css` + `ui-home.js` VERI, niente login) **oppure** ricarica il gioco con **hard-refresh** (style.css NON ha `?v=`, quindi va forzata la cache).

### FASE 2 — FATTA (2026-06-01)
Chrome globale eRepublik-Modern implementata. **Come vederla:** apri `_mockups/chrome_preview.html` (chrome reale + Home reale, no login) oppure hard-refresh del gioco.

**Cosa è stato fatto:**
- **Sfondo cielo/skyline globale**: `class="em-shell"` su `#app-body` → regola `#app-body.em-shell` in style.css (cielo gradiente + skyline SVG, `background-attachment:fixed`, `!important` per battere `.app-bg` dark). Disabilitato il dot-grid `.app-bg::before`.
- **Topbar barra-risorse** (`#top-bar` riscritta): card bianca centrata (max-width 1130) su cielo → brand, meta (breadcrumb·data·ora), chips risorse (Energia con barra, Reputazione, Driver Coins, VTK, Cash), meteo, azioni (🔍 cmd-palette, ⏻ logout). **TUTTI gli ID `tb-*` conservati** (tb-cash/rep/energy-bar/energy-text/time/date/breadcrumb/weather-icon/weather-label/surge/tc/vtk) → `updateUI` in engine.js continua a scrivere senza modifiche.
- **Nav orizzontale** (`#em-nav`, NUOVO): 6 categorie (🏠 Home · 🏢 Le mie sedi · 🛒 Business · 💹 Finanza · 👑 Potere · 🌐 Community) con **dropdown su hover** che contengono le 28 tab. Mappatura = i 5 gruppi sidebar esistenti. Click categoria → tab primaria; click voce dropdown → `switchTab`.
- **Sidebar dark NASCOSTA** (`.em-shell #sidebar-player{display:none}`) ma **DOM conservato** → cmd-palette (legge `.sidebar-item[data-tab]`), active-state e breadcrumb di ui-sidebar.js continuano a funzionare.
- **`em-chrome.js` (NUOVO, v=3)**: (a) patcha `switchTab` (sopra il patch di ui-sidebar.js) per evidenziare la categoria/voce attiva in `#em-nav`; (b) `syncChromeOffset()` misura l'altezza reale di `#em-chrome` e imposta `#main-panel.style.top` con `setProperty(...,'important')` — eseguito subito + rAF + DOMContentLoaded + load + `document.fonts.ready` + timeout + ResizeObserver.
- **Layout**: topbar+nav avvolti in un **unico wrapper fisso `#em-chrome`** (i due elementi sono `position:static` dentro). `#main-panel` ora `left:0; background:transparent`, `top` dinamico via JS (fallback inline 150px). premium-ui.css aggiornato (left:0 per main-panel/ticker/map-overlay). `#tab-container` max-width 1130. `#panel-title` reso visually-hidden **off-screen** (NON `display:none` — `innerText` su display:none ritorna '' in Chrome e romperebbe l'auto-refresh Home + il guard `if(!title)return` di dispatcher).
  - **ROOT CAUSE overlap (2026-06-01, RISOLTO):** `#main-panel` prendeva `position:fixed` SOLO dalla classe Tailwind `.fixed`. Senza Tailwind (es. nel preview) restava `position:static` → `top` ignorato → contenuto da y=0 dietro la chrome. Fix: regola **`.em-shell #main-panel{position:fixed}`** in style.css (indipendente da Tailwind) + Tailwind aggiunto al preview. **Verificato con Chrome headless** (vedi sotto).
- **Verifica visiva headless (METODO RIUTILIZZABILE):**
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --allow-file-access-from-files --window-size=1400,900 --force-device-scale-factor=1 \
    --virtual-time-budget=3000 --screenshot=/tmp/shot.png \
    "file://$(pwd)/_mockups/chrome_preview.html"
  ```
  Poi leggere `/tmp/shot.png`. Per misure DOM precise, iniettare uno script che scrive `getBoundingClientRect`/`getComputedStyle` in un `<div>` a video e screenshottare.

**Classi CSS chrome**: prefisso `.emc-*` (per non collidere col content-kit `.em-*` che è scoped sotto `.em`). In fondo a style.css, sezione "EM CHROME".

**NB transizione**: chrome light + Home light + 28 tab ancora dark (card #161b22 su pannello, ora su cielo). Per le tab dark il `#main-panel` è trasparente → le card dark "galleggiano" sul cielo. È lo stato di transizione atteso finché non parte la Fase 3.

### FASE 3 — IN CORSO (roll-out tab dark → light) — quasi completa (2026-06-01 sera)

**FATTO questa sessione — 25 tab convertite al light (tutte `?v=10`):**
- **Full kit `.em` (riscritte a mano + verificate via screenshot headless):**
  `ui-dispatch.js` · `ui-fleet.js` · `ui-staff.js` · `ui-finance.js` · `ui-emails.js`
  (+ `ui-home.js` già fatta in Fase 1). Usano `.em-card/.em-kpibar/.em-tbl/.em-pill/.em-gbtn/...`.
- **Remap colori + wrapper `.em em-page em-wrap` (verificate a campione):**
  `ui-ranking.js` · `ui-legal.js` · `ui-market.js` · `ui-realestate.js` · `ui-marketing.js` ·
  `ui-ops.js` (regions+provinces) · `ui-investments.js` · `b2b.js` · `tourism.js`
- **Remap colori + centratura globale (no `.em-wrap`, vedi regola CSS sotto):**
  `ui-politics.js` · `ui-help.js` · `crypto.js` · `contracts.js` · `auctions.js` ·
  `black_ops.js` · `infrastructure.js` · `nemesis.js` · `hostile_takeover.js` · `hq.js` ·
  `ui-career.js` (modal-based).

**Infrastruttura aggiunta (riutilizzabile):**
- **Nuove classi `.em-*` condivise** in fondo a `style.css` (sezione "EM kit — shared helpers for FASE 3"):
  `.em-page .em-sec .em-kpibar .em-tbl .em-ghbtn .em-goldbtn .em-redbtn .em-pill(+--green/blue/gold/red/gray/violet) .em-tabs/.em-tab .em-prog`.
- **Regola centratura globale** in `style.css` (sezione EM CHROME):
  `.em-shell #tab-container{font-family:Inter}` + `.em-shell #tab-container > *{max-width:1158px;margin-inline:auto}` + `> .em{max-width:none}`.
  → ogni tab (anche solo-remap) resta centrata nella larghezza della chrome (1130) senza wrapper per-file.
- **Classi email lightened** in `style.css`: `.inbox-tab*`, `.email-card/-body/-subject/-sender-name/-actions` ora light.
- **Script remap** (color-token dark→light) salvato in `_mockups/fase3_remap.pl` (mappa hex → palette `.em`). Uso: `perl _mockups/fase3_remap.pl < file.js > /tmp/o && mv /tmp/o file.js`. Riutilizzabile per showroom/war_room.

**⚠️ LEZIONE CRITICA (bug risolto):** le `<table>` collassano in Chrome dentro **card a metà larghezza** (grid 1fr 1fr): un `<td>` con dentro un `display:flex` o una progress-bar `flex:1` riporta min-content ~0 → la colonna si schiaccia a 24px e il testo va in overlap. **Regola:** nelle card strette usare **righe flex `.em-lrow`** (come la Home), NON `<table>`. Le tabelle a larghezza piena (card singola) vanno bene se: `.em-tbl td` ha `white-space:nowrap` (già nel kit) e le barre dentro le celle hanno **width fissa** (es. `width:52px`), mai `flex:1`. (Dispatch è stato riscritto: lista autisti ora a righe flex.)

### FASE 3 — COMPLETATA ✅ (2026-06-01 sera, sessione 2)
**TUTTE le 28 tab sono ora light.** Convertite a mano anche le 3 bespoke che mancavano:
- **`war_room.js`** (`?v=10`) — overlay fullscreen mappa province: sfondo cielo light, mare SVG `#bcd3e8`, header/sidebar/card bianche, regioni politiche colorate invariate, bordi neutri regione passati a `rgba(0,0,0,0.22)` per leggibilità su mare chiaro. Verificata via screenshot (mappa Italia OK).
- **`showroom.js`** (`?v=10`) — overlay fullscreen galleria auto + configuratore: CSS riscritto light (sfondo cielo, card bianche, pill filtri blu/viola attivi, bottoni blu, buy-btn gradiente blu). Verificata via screenshot (galleria OK).
- **`ui-store.js`** (`?v=10`) — Executive Club: ora **light-premium**. Mantiene l'**hero band scura** (gradiente, come `.em-banner` della Home) e le **art-tile scure** per pacchetto (accenti premium voluti per monetizzazione), ma tabs/pack-card/service-card/info sono light. Sfondo root → `transparent` (mostra il cielo). Verificata via screenshot.

**La transizione dark→light è finita.** Non resta nessuna tab dark.

**Extra convertiti nella stessa sessione (oltre alle 28+ tab):**
- **`ui-lifestyle.js`** (`?v=10`) — tab Lifestyle (era ancora dark, mancava dalla lista) → remap+wrap light.
- **`p2p-render.js`** (`?v=10`) — sezioni P2P market/azioni renderizzate *dentro* le tab Market e Finance → remap light (altrimenti card dark dentro tab light).
- **`ui-staff.js`** car modal + **configuratore fullscreen** (`openCarConfigurator`) → light (pannello bianco, checkbox/bottoni light, foto auto invariata). `driver_skills.js`, `map-garage.js` (garage 3D), `vtk-market.js` → remap light.

**Overlay lasciati scuri DI PROPOSITO** (flair/utility, coerenti con `.em-banner` dark della Home e hero scuro dello Store):
- `cmd-palette.js` (spotlight ⌘K), `engine.js` → `showBigEvent` (popup celebrativo) + `logToMap` (log sulla mappa Mapbox scura), `tutorial.js` (onboarding). Non sono tab; il dark qui è una scelta estetica, non debito.

### Rifinitura opzionale (non urgente)
Le tab "solo-remap" (politics, crypto, contracts, auctions, black_ops, infrastructure, nemesis, hostile_takeover, hq, help, career) sono light/centrate ma usano HTML inline invece dei componenti `.em-card/.em-pill`. Migrarle al kit pieno è solo polish estetico, non funzionale. Verifica in-game (login reale) consigliata per confermare la regola di centratura globale su strutture multi-figlio.

**Ordine storico consigliato (riferimento):**
1. `ui-dispatch.js` 2. `ui-fleet.js` 3. `ui-staff.js` 4. `ui-finance.js` 5. `ui-emails.js`, poi le restanti.

**Ricetta di conversione (per ogni `renderTab*`):**
1. Avvolgere TUTTO l'HTML in `<div class="em"><div class="em-wrap"> ... </div></div>` (la classe `.em` definisce le var `--em-*` e il font Inter; `.em-wrap` centra a max-width 1120).
2. Sostituire i colori dark inline con le classi `.em-*` (NON ridefinire i colori a mano):
   - card `#161b22`/`#0d1117` → `.em-card` (+ `.em-ch` per l'header card con `.t`/`.a`)
   - KPI strip → `.em-kpis` + `.em-kpi` (`.l` label, `.v` valore, `.s` sub)
   - righe lista/tabella → `.em-lrow` + `.em-th`/`.em-lt`/`.em-lm`/`.em-price`/`.em-bd`
   - bottoni: primario verde `.em-gbtn`, secondario `.em-bbtn`; ghost/altri → vedi palette `.em` (blue `--em-blue` #2f74c0, green #1aa06a, gold #c79a2a, red #db5746)
   - empty state → `.em-empty`; link inline → `.em-link`
   - banner scuro/hero → `.em-banner`; contratto/CTA blu → `.em-contract`; feed item → `.em-ev`/`.em-evi`/`.em-evt`/`.em-evd`
3. Tutte le classi `.em-*` sono in fondo a `style.css` (sezione "EM kit"). Se manca un componente, aggiungerlo lì con prefisso `.em-` (NON `.emc-` che è solo chrome).
4. Bump `?v=` del file in index.html.
5. Verificare con lo screenshot headless (vedi sopra) caricando il file reale — meglio creare un mini-preview tipo `_mockups/home_real_preview.html` se la tab non parte senza login.

**Riferimento target:** `_mockups/E4_erepublik_dense.html` (densità/colori) e `ui-home.js` (esempio già convertito, leggerlo come template).

**Vincoli da NON violare durante la Fase 3:**
- Mai `DS.*`. Mai classi Tailwind arbitrarie non compilate (es. `text-[9px]`, `bg-gold/5`) — solo `.em-*` o inline.
- Non toccare la chrome (`.emc-*`, `#em-chrome`, em-chrome.js) — è chiusa.
- Le mutazioni cash server-authoritative restano via RPC Supabase (invariato).

### Background
Ora è un **placeholder CSS** (skyline disegnato a rettangoli, in `.em-home` di style.css). Da sostituire con asset finale (lo creo io più ricco, oppure lo fornisce l'utente).

### Nota operativa
Verifica visiva possibile in autonomia via **Chrome headless** (comando nella sezione Fase 2 sopra) → screenshot in `/tmp` → leggerlo. Niente più dipendenza dallo "guarda tu nel browser".

---

## Ultima sessione — Analisi bug completa + polish visivo (/impeccable)

### 1. Analisi completa del codebase — codebase SANO

Scansione sistematica di tutti i 76 file JS (~47k righe). Risultati:
- ✅ 0 errori di sintassi (`node --check` su tutti i .js)
- ✅ Routing tab coerente: ogni `switchTab` punta a una `renderTab*` esistente
- ✅ 179 handler `onclick` inline → 0 funzioni orfane
- ✅ Validazione input robusta (`parseInt()||1`, guard `!amount`) — NaN non raggiunge `cash`
- ✅ Gestione errori Supabase di qualità: pattern `{data,error}` + rollback transazionale (es. p2p-market.js rimette l'auto in flotta se l'RPC fallisce)
- ✅ Timer senza leak (`_homeTimer` guard singleton, `_decreesCountdownTimer` clearato)
- ✅ Nessun marker TODO/FIXME/HACK reale

**Unico problema reale trovato e già risolto:** la Home era l'ultima superficie non migrata (vedi sotto).

### 2. ⚠️ CLAUDE.md OBSOLETO su 2 punti (da correggere)
- **`window.gameState` ORA esiste**: a `engine.js:295` c'è `Object.defineProperty(window,'gameState',{get(){return gameState}})`. Quindi `window.gameState` e `gameState` bare sono **equivalenti**. Il bug log CLAUDE.md del 2026-05-24 ("window.gameState non esiste") è superato. Gli usi in serverState.js / design-system.js / contracts.js NON sono bug.
- **I 4 file obsoleti sono già rimossi** (ui-meta.js, ui-finance-mkt.js, vip_clients.js, p2p_market.js): il TODO "git rm" nel CLAUDE.md è già fatto.

### 3. Home / Command Center — RIFATTA in eRepublik flat dark
`ui-home.js` era l'**unico** tab ancora in stile vecchio: tema light (`var(--bg)`) + glassmorphism (`.ce-glass`, blur, radius 12px). Tutti gli altri tab erano già flat dark.
- Convertita interamente a palette dark inline (#0d1117 / #161b22 / #21262d / #e6edf3) — 0 residui `var(--*)`, 0 `ce-*`, 0 colori non-token
- KPI ridisegnati in stile "terminal austero" (scelta utente): niente emoji-icona giant, label 9px mono uppercase, valore mono. Conservati: countup (`data-countup`, triggerato dal MutationObserver di motion.js), delta "vs ieri", auto-refresh 5s, tabella corse live, colonne Autisti/Notifiche, empty states
- **Bug fix:** matching notifiche era case-sensitive (`includes('multa')` non trovava "Multa") → tutte diventavano "📩 Messaggio". Ora `subj.toLowerCase()` → categorie corrette
- Verificata via screenshot (harness mock isolato, non gioco loggato)
- `ui-home.js` → **v=7**

### 4. Micro-interazioni — SISTEMATIZZATE via CSS globale
Censimento: 221 `<button>`, solo 41 con `scale(0.97)` inline (180 mancanti su ~30 file).
- Aggiunta **una regola CSS globale** in `style.css` (sezione "Buttons"): `button:active:not(:disabled){transform:scale(0.97)}` + transition. Copre tutti i bottoni (tab, modal, overlay) inclusi i futuri. Controlli Mapbox esclusi, `prefers-reduced-motion` rispettato. Gli handler inline esistenti vincono per specificità (nessun conflitto)
- `DESIGN.md` aggiornato: la micro-interazione non va più messa inline su ogni bottone
- Questo risolve anche la lacuna di Career (già flat-pulito, gli mancava solo la micro)

### 5. Loading skeleton flat
- Nuova classe `.ce-skel` in `style.css` (shimmer grigio neutro, zero neon, rispetta reduced-motion) — sostituisce la `.ds-skel` cyan-tinted (che violava il flat)
- Applicata a `ui-realestate.js` (era testo "Caricamento immobili…" → v=7) e alle righe placeholder di `ui-ranking.js` (v=8)
- Market/p2p non ha loading esplicito (rende da cache locale) → nessuno skeleton necessario
- Verificata via screenshot

### 6. A — Fix rapidi residui (FATTO)
- `logToMap` (engine.js) convertito da classi Tailwind (`border-white/5 text-[9px]`) a inline flat
- **Guard NaN su cash:** all'inizio di `gameLoop()` (engine.js), se `gameState.cash` diventa NaN/Infinity viene ripristinato l'ultimo saldo valido (`window._lastValidCash`) + notifica. Aggiunto anche `window._addCash(amt)` (utility con guard `Number.isFinite`) per il futuro
- CLAUDE.md allineato ai fatti reali: getter `window.gameState`, 4 file obsoleti già rimossi, micro-interazione ora globale via CSS
- `engine.js` → **v=9**

### 7. D — Coerenza estetica delle 3 isole di stile (FATTO)
- **showroom.js**: accento cyan neon (#00d4ff x11, #22d3ee) → blu flat #58a6ff. → **v=7**
- **war_room.js**: teal #00cccc → #58a6ff, gold-acceso #FFD700 → #d4af37, red #FF4444/#ef4444 → #f85149, green #22c55e → #3fb950. → **v=7**
- **ui-store.js**: LASCIATO premium intenzionalmente. I gradient sono sui badge funzionali (Popular/Value/New/Limited) e l'elevation serve la monetizzazione (PRODUCT.md: store = monetizzazione). Appiattirlo danneggerebbe conversione e leggibilità badge. **Decisione: non è debito, è design.**

### 8. C — Command palette (FATTO) — riduce sovraccarico 29 tab
- Nuovo file **`cmd-palette.js`** (v=1): overlay ricerca rapida sezioni, attivabile con **⌘K / Ctrl+K** o dal campo "🔍 Cerca sezione…" in cima alla sidebar
- Legge i `.sidebar-item[data-tab]` dal DOM a runtime → zero duplicazione, sempre in sync con la sidebar
- Ricerca live case-insensitive, navigazione tastiera (↑↓ Enter Esc), stile flat dark
- Verificata via screenshot

### Nessun commit fatto (non richiesto dall'utente).

---

## Stato del piano di miglioramento

Aree **A, B, C, D completate**. Resta solo, rimandata esplicitamente dall'utente al post-lancio (expansion):
- **E — Espansione contenuti:** lane taxi/truck/water-taxi (vehicleClass/requiredClass), HQ multi-città. NON iniziare finché il gioco non è lanciato — sarà introdotta come "expansion".

---

## Versioni script attuali

| File | Versione |
|---|---|
| `engine.js` | v=9 (logToMap flat + cash guard) |
| `ui-ranking.js` | v=8 (skeleton) |
| `ui-realestate.js` | v=7 (skeleton) |
| `showroom.js` | v=7 (cyan→blu flat) |
| `war_room.js` | v=7 (accenti→flat) |
| `cmd-palette.js` | v=1 (NUOVO — command palette ⌘K) |
| `em-chrome.js` | v=3 (NUOVO — chrome EM: highlight nav + offset dinamico main-panel) |
| `ui-home.js` | v=9 (kit `.em` — FASE 1) |
| `map.js` | v=7 |
| `vtk-market.js` | v=1 |
| Altri UI/engine | v=9 |
| File non toccati | v=6 |

`style.css` e `DESIGN.md` modificati (style.css non ha `?v=`, è caricato senza cache-busting).

---

## Architettura critica (invariata)

```
gameState           → let in engine.js MA ora ESPOSTO come window.gameState
                      via getter (engine.js:295). I due sono equivalenti.
window.DS           → NON usare — tutti i tab sono eRepublik flat inline
?v= scripts         → bumpare in index.html ad ogni modifica JS
Micro-interazione   → ORA globale via CSS (button:active scale .97 in style.css).
                      Non serve più l'inline onmousedown su ogni bottone.
Skeleton flat       → classe .ce-skel in style.css (shimmer grigio neutro)
countup KPI         → motion.js ha un MutationObserver su #tab-container che
                      chiama _ceTriggerCountUps() ad ogni cambio contenuto
PRODUCT.md/DESIGN.md → contesto per /impeccable. Caricare il loader con
                      IMPECCABLE_CONTEXT_DIR=<project root> (altrimenti carica
                      i file della skill stessa, non quelli del gioco!)

War Room (provinces):
  - openMapOverlay() → _ensureMap() → initMap() (se map===null)
  - initMap() NON chiama più switchTab() — era il bug della sessione precedente
```
