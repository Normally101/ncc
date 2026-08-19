# QA_PLAN.md — Piano di test per Chauffeur Empire

> Compagno di `docs/SYSTEMS.md` (la mappa). Non è più solo un piano: **Fase 2+3 sono state
> implementate** il 9-10 agosto 2026 (sessione live) — `npm test` esegue 36 test reali su 10 file
> (vedi "Stato implementazione" sotto). Le sezioni seguenti restano come riferimento su framework
> e priorità; per il codice vero vedi `test/` e `test-support/game-env.js`.

## ✅ Stato implementazione (9-10 agosto 2026)

**`npm test` → 36/36 pass**, 10 file sotto `test/`: `economy/vehicle-trade`,
`garage/repair-vehicle`, `employees/hire-fire`, `rides/complete-ride`, `rides/vip-clients`,
`daily/daily-orders`, `daily/daily-tick`, `save-load/persistence`, `progression/new-game-plus`,
`contracts/corporate-bid`.

Harness in `test-support/game-env.js` (Livello 3 sotto): carica i file `.js` **reali** del gioco
(stessa lista/ordine di `index.html`, filtrata alla logica pura — no mappa/render/realtime) in un
contesto Node condiviso, `document` reale via `jsdom` (necessario: il codice usa
`document.getElementById(...)` come segnale di stato, non solo per scrivere HTML — uno stub senza
registro elementi rompe la logica in modo silenzioso), mock di `ServerState` fedele al
comportamento reale (RPC → Realtime → `_bridgeToGameState`, replicato mutando `gameState`
direttamente come farebbe il bridge vero dopo un RPC riuscito, non un semplice stub true/false).

**Cosa copre**: economia (compra/vendi veicolo), garage (riparazione + Kasko + meccanico),
dipendenti (assunzione + licenziamento), corse (pagamento una sola volta, scenario doppio-click),
VIP (danno al veicolo giusto), daily orders (rollback su RPC fallita), daily tick (nessun
drift su chiamate ripetute), save/load (serializzazione + deserializzazione + migrazione stato
busy→idle al reload), New Game+ (sync cash col server). 6 test sono regressioni esplicite dei fix
funzionali del 9 agosto (fireDriver, daily-orders, vip-clients, New Game+).

Più `contracts/corporate-bid` (4 test: pledge, REGRESSIONE rilancio-offerta non duplica il
pledge, fondi insufficienti, doppio annullamento non rimborsa due volte).

**Cosa NON copre ancora** (SKIP esplicito): B2B/tourism/aste (zero test — contracts.js coperto
solo per il pledge sui bandi corporate, non l'intero sistema), animazioni/tooltip/UI pura
(Livello 2 jsdom smoke test — deliberatamente fuori scope, priorità bassa), E2E reale in browser
(Livello 4 — resta solo tuo, richiede Playwright + Supabase di staging).

**Bug trovato scrivendo questi test**: il cap sul delta di `rpc_sync_cash` (fix SQL della stessa
sessione, poche ore prima) era simmetrico e avrebbe rifiutato un New Game+ legittimo da cash
alto — corretto in `50_fix_sync_cash_asymmetric_delta.sql`, applicato e testato in prod.

## Come leggere questo documento
1. Prima la sezione **"Zero-day"** — non è testing, sono buchi di sicurezza attivi trovati durante
   la mappatura che vale la pena chiudere subito, indipendentemente da quando parte il resto del
   piano.
2. Poi il **framework** proposto e perché, coerente coi vincoli reali di questo ambiente cloud.
3. Poi le **priorità** (Critical/Important/Nice-to-have) applicate concretamente ai 9 sistemi di
   `SYSTEMS.md`.
4. Poi la **roadmap a fasi** — cosa fare in che ordine.
5. Infine gli **scenari di Core Gameplay Test** (A-F), scritti come sequenze di funzioni reali da
   chiamare, pronti per essere trasformati in test Playwright.

---

## Zero-day — da valutare per un fix indipendente dal piano di test

Questi non sono ipotesi: sono stati confermati leggendo il codice sorgente/SQL riga per riga
durante la mappatura (`docs/SYSTEMS.md`, sezione 9 per il dettaglio completo). Non sono stati
corretti (mandato di questo giro era solo mappare), ma la severità è alta abbastanza da meritare
una decisione tua **prima** ancora di costruire l'harness di test:

1. **`rpc_sync_cash`** — SET assoluto e arbitrario della cassa, zero validazione. Il più grave di
   tutti: qualunque giocatore autenticato può impostare il proprio cash a qualsiasi valore da
   devtools, oggi, in produzione.
2. **`rpc_sell_vehicle`** — prezzo di vendita dal client, nemmeno un controllo `>= 0`.
3. **`rpc_take_loan`** — nessun tetto sul capitale del prestito.
4. **XSS in `p2p-render.js`/`vtk-market.js`** — nomi giocatore/auto non sanitizzati nei mercati
   P2P/VTK, eseguibili nel browser di ogni altro giocatore che apre quella tab.
5. La famiglia di ~16 RPC che si fidano di un prezzo/costo mandato dal client senza confrontarlo a
   un listino server (`docs/SYSTEMS.md` §9, finding F e G) — non "solo" cash infinito una-tantum,
   ma "paga zero per qualsiasi acquisto" su gran parte del catalogo del gioco.

Non li ho corretti io in questo giro (fuori mandato), ma se li lasci lì mentre costruisci il resto
del piano, ogni test che scrivi sul "saldo dopo un acquisto" rischia di validare un sistema che è
comunque aggirabile da fuori. Suggerisco di trattarli come un **item a parte, priorità immediata**,
non come parte dello sprint "costruiamo la QA".

---

## Framework proposto

Vincoli reali di questo progetto: vanilla JS, nessun bundler/framework, `package.json` con `"type":
"commonjs"` e zero dipendenze di test oggi. Tre livelli, dal più economico al più costoso:

### Livello 1 — Unit test su logica pura (Node, zero dipendenze nuove)
Usa il **test runner integrato di Node** (`node --test` + `node:assert`, disponibile da Node 18+
senza installare nulla). Bersaglio: le funzioni di calcolo che non toccano DOM/rete — moltiplicatori
tariffa, tasse, danni/usura, formule di `driver_skills.js`, `_getCreditTier`, ecc. Molte di queste
funzioni oggi leggono `gameState`/`window.X` per riferimento diretto: il modo più pratico per
testarle senza riscriverle è caricare il file in un contesto Node con un `gameState` finto e i
`window.*` minimi che quella funzione usa (vedi esempio sotto). Non serve jsdom per questo livello.

```js
// esempio concettuale — test/engine-daily.tax.test.js
const assert = require('node:assert');
const { test } = require('node:test');
global.window = global; // le funzioni si aspettano window.X
// carica solo le funzioni pure necessarie, o refattorizza le formule più critiche
// (tasse, moltiplicatori prezzo) in funzioni esportabili se non lo sono già

test('tassa annuale non va mai negativa', () => {
  // ...
});
```

### Livello 2 — Smoke test di rendering (Node + `jsdom`, una dipendenza nuova)
Bersaglio: tutte le ~50 funzioni `renderTabX()` — il test minimo utile qui non è "il pixel è
giusto", è **"non lancia un'eccezione con uno stato di gioco plausibile"**. Con `jsdom` puoi
costruire un `document` finto, iniettare un `gameState` di fixture (vedi Livello 3) e chiamare
`renderTabX()` verificando che non lanci e che certi elementi chiave esistano nel DOM risultante.
Questo livello da solo avrebbe **catturato quasi tutti i bug "numero mostrato ≠ applicato"** già
corretti a mano nelle sveglie precedenti, se un test avesse confrontato il valore renderizzato con
quello restituito dalla funzione del motore.

### Livello 3 — Simulated gameplay headless (Node, mock di `ServerState`/RPC)
Non è un vero E2E (nessun Supabase reale, nessun browser) — è una sequenza scriptata che chiama
direttamente le funzioni di gioco in Node, con un mock di `window.ServerState` che risponde in
modo prevedibile (successo/fallimento configurabile) invece di chiamare Supabase davvero. Copre le
interazioni cross-sistema (Garage→Dipendenti→Clienti→Economia) che sono il vero timore espresso —
un bug che coinvolge 4 file insieme non lo trova un test che ne isola uno solo. Vedi gli scenari
A-F più sotto: sono scritti per essere implementati a questo livello.

### Livello 4 — E2E reale (Playwright, da eseguire SOLO da te)
Questo ambiente cloud non ha login reale né credenziali Supabase — questo livello **non posso
costruirlo/eseguirlo io**, va fatto sul Mac. Playwright è già la scelta naturale (il progetto ha
Chromium disponibile in altri contesti di sviluppo). Bersaglio: gli scenari A-F eseguiti per
davvero, con un account di test dedicato su un progetto Supabase di **staging**, non prod — verifica
che i mock del Livello 3 corrispondano davvero al comportamento reale delle RPC.

**Non provare a saltare al Livello 4 per tutto** — è il più lento e il più fragile (richiede
login, rete, stato DB pulito ad ogni run). Usalo per gli scenari end-to-end critici (elenco sotto),
non per ogni singola funzione.

---

## Priorità — Critical / Important / Nice-to-have

Applicando lo schema che hai proposto ai 9 sistemi mappati in `SYSTEMS.md`:

### 🟢 Critical — deve funzionare sempre
- **Save/Load/Auth** (`saveSystem.js`, `serverState.js`, `auth.js`, `syncManager.js`) — un bug qui
  blocca l'accesso a TUTTI i giocatori, non solo a una feature.
- **Core cash flow** (`engine.js` cash-diretto, `engine-daily.js`, `serverState.js` delta-sync) —
  è il debito #1 già noto (91 scritture client-authoritative), qui parliamo di non peggiorarlo.
- **Acquisto/vendita/riparazione flotta** (`engine-fleet.js`, `showroom.js`) — superficie più ampia
  di scritture cash dirette trovata in questo giro.
- **Dipendenti** (`engine-drivers.js`, `ui-staff.js`) — assunzione/licenziamento bypassano le RPC
  esistenti.
- **Le 3 SQL zero-day critiche** (sopra) — non aspettano un piano di test, sono exploit attivi.

### 🟡 Important — deve funzionare, tollerabile qualche imperfezione
- Contratti/B2B/Tourism/Aste (falle di validazione al bid-time, non cash infinito diretto).
- P2P/Alliances/VTK Market (XSS da correggere, ma non un mint di cash).
- VIP clients, eventi globali, HQ (bug di stato/logica, non ancora sfruttati in massa).
- Statistiche, ranking, marketing (display, non economia diretta).

### ⚪ Nice-to-have — può avere qualche bug iniziale
- Estetica: `motion.js`, `hq-visual.js` (immagini), `ui-hub.js`, `ui-help.js`, tutorial visivo,
  `push-notifications.js` (già difensivo di suo).

---

## Roadmap a fasi

**Fase 0 (fatta oggi)** — questo documento + `docs/SYSTEMS.md`. Zero righe di codice toccate.

**Fase 1 — Zero-day** — tu decidi quali dei 3 CRITICI SQL + le 2 XSS correggere subito (fuori dal
flusso "scaffold PR" della routine, dato che sono exploit attivi, non debito). Non richiede test
prima: sono bug, non feature.

**Fase 2 — Harness minimo (Livello 1+2)** — `node --test` configurato in `package.json`
(`"test": "node --test"`), + `jsdom` come devDependency. Bersaglio iniziale: le funzioni di
`engine-daily.js`/`engine-finance.js` (tasse, moltiplicatori) e smoke test su tutti i `renderTabX`
coi due gameState di fixture (nuovo giocatore, giocatore ricco — vedi sotto). Questo livello lo
può costruire anche una sessione cloud, non richiede login reale.

**Fase 3 — Simulated gameplay (Livello 3)** — implementazione degli scenari A-F sotto, con mock di
`ServerState`. Anche questo è costruibile da cloud.

**Fase 4 — E2E reale (Livello 4, solo tuo)** — Playwright contro un progetto Supabase di staging,
account di test dedicato. Qui serve il tuo Mac.

**Fase 5 — Disciplina di regressione** — una volta che Fase 2+3 esistono, ogni bug fix futuro
segue il ciclo:

```
BUG → riproduzione (nuovo test che fallisce) → causa identificata → fix minimo
    → il test passa → l'intera suite regression gira → ✓ chiuso
```

Un fix che tocca più file di quelli strettamente necessari per il bug, o che "already since I'm
here" rifattorizza qualcosa non richiesto, non rispetta questo ciclo — coerente con `CLAUDE.md`
("niente cambi speculativi") e con quanto hai chiesto tu stesso in chat.

---

## Fixture di stato — due gameState di riferimento

Per Livello 2/3 servono fixture riutilizzabili invece di costruire `gameState` a mano in ogni test:

- **`fixtures/newPlayer.json`** — cash iniziale, 1 auto starter, 0 dipendenti, nessun investimento,
  regione unica sbloccata, giorno 1. Copre il funnel `zero-to-hero.js`.
- **`fixtures/richPlayer.json`** — 20+ auto di tier misto, 10+ dipendenti (alcuni a riposo/burnout),
  holding attiva, prestiti attivi, HQ multi-città parzialmente costruita, province possedute,
  consorzio attivo. Copre la maggior parte delle interazioni cross-sistema.

(Gli scenari C/D del tuo elenco originale — "indebitato", "flotta danneggiata" — sono varianti di
`richPlayer` con segno opposto sul cash/condizione: non servono fixture separate, solo un parametro.)

---

## Core Gameplay Test — scenari A-F

Scritti come sequenza di chiamate a funzioni **reali** del codebase (nomi verificati durante
l'audit), pronti per diventare test di Livello 3 (mock RPC) e poi di Livello 4 (RPC vere).

### Scenario A — Partita nuova end-to-end (🟢 Critical)
```
_onAuthSuccess (nuovo utente)
  → auth.js:_mmoBootSequence (fresh=true)
  → engine.js:foundCompany
  → zero-to-hero.js: executeManualDrive ×10 → triggerCapitalismEvent → hireNeighborhoodKid
  → tutorial.js: startTutorial → ogni step con actionGate reale
  → engine-fleet.js/showroom.js: primo acquisto auto vero (RPC buyVehicle)
  → engine-drivers.js: hireDriver
  → engine-rides.js: generatePOIRide → assignRideToDriver → completeRide
  → engine-daily.js: processDailyRoutines (fine giornata)
  → saveSystem.js: saveGame
  → reload pagina completo
  → auth.js: boot da save esistente
  → verifica: cash, flotta, dipendenti, giorno tutti identici al pre-reload
```
Assert chiave: il cash dopo reload è quello atteso, non quello "tornato indietro" (verifica
diretta del bug New Game+/cash-diretto trovato in `engine.js`).

### Scenario B — Giocatore ricco, 50 auto (🟢 Critical)
```
fixtures/richPlayer → engine-fleet.js: bulkRepairFleet su 10+ auto
  → engine-finance.js: buyStocks/shortSell/takeLoan (ai limiti del creditTier)
  → engine-holding.js: acquireSubsidiary/divestSubsidiary stesso giorno
  → war_room.js: doAcquireProvince
  → hq.js: hqUpgradeRoom multiplo
  → engine-daily.js: processDailyRoutines
  → verifica: nessun doppio conteggio di income, nessuna scrittura cash che "sparisce" dopo un
    evento Realtime simulato (mock ServerState che sovrascrive cash a metà sequenza)
```
Assert chiave: qui si testano ESPLICITAMENTE i bug trovati in `engine-fleet.js`/`hq.js` — azioni
cash-dirette che dovrebbero "tornare" dopo un resync se non fossero mirrorate.

### Scenario C — Giocatore indebitato (variante di B)
```
richPlayer con cash basso + 3 prestiti attivi + consecutiveRedDays crescente
  → engine-daily.js: processDailyRoutines ripetuto fino a consecutiveRedDays >= 3
  → verifica: _triggerBankruptcy scatta esattamente al 3° giorno, non prima/dopo
  → engine-finance.js: repayLoan parziale
  → verifica: loanLimit/creditScore si aggiornano coerentemente
```

### Scenario D — Flotta danneggiata (variante di B)
```
richPlayer con 10 auto a condizione <20%
  → engine-events.js: simula incidenti multipli sulla stessa ride (verifica scenario ZTL multi-fine)
  → engine-fleet.js: repairVehicle su tutte
  → driver_skills.js: driverPermadeathRoll con skill vel_3 attivo
  → verifica: nessuna doppia penalità condizione+incasso (regressione sul fix già fatto)
```

### Scenario E — Save → chiusura → reload (🟢 Critical)
```
Azione cash-diretta (una qualsiasi delle ~30 trovate in questo audit, es. payFine)
  → saveGame() immediato (senza aspettare il debounce di 4s)
  → chiusura simulata (beforeunload) prima del debounce
  → riapertura → verifica che l'azione non sia andata persa
Variante: due tab aperte sullo stesso account, azione in tab A, save da tab B entro la finestra di
debounce — verifica quale versione vince (comportamento noto ma mai testato).
```

### Scenario F — Azioni rapide/doppio click/spam (🟡 Important, ma alto valore anti-cheat)
```
Doppio click rapido su: acquisto auto (showroom), takeLoan, claim quest reward, VTK shop purchase,
donazione consorzio, voto decreto server
  → verifica per ognuna: nessuna doppia applicazione dell'effetto prima che l'await completi
  → chiamata diretta (bypassando UI) a una RPC nota per fidarsi del client (es. rpc_take_loan con
    v_principal enorme) → verifica che il server rifiuti (oggi non lo fa — questo test DEVE fallire
    finché lo zero-day #3 non è corretto: usalo come test di non-regressione una volta fixato)
```

---

## Nota su come useresti questo con Claude d'ora in poi

Con `SYSTEMS.md` + questo piano, una richiesta come "correggi i bug" può diventare "prendi la riga
🔴 Critical più in alto di `SYSTEMS.md` non ancora coperta da test, scrivi il test che la riproduce,
poi il fix minimo, poi fai girare la suite" — invece di un bug-hunt a tappeto senza rete di
sicurezza sotto. Il costo one-time è costruire Fase 2+3; il beneficio è che ogni sveglia futura
della routine automatica può girare la suite prima di aprire una PR, invece di affidarsi solo a
`node --check` e boot headless come fa oggi.
