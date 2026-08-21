'use strict';
// Ambiente minimo per eseguire il vero codice del gioco in Node, senza browser/DOM/rete.
// Livello 3 di docs/QA_PLAN.md: "una sequenza scriptata che chiama direttamente le funzioni
// di gioco in Node, con un mock di window.ServerState". Carica i file .js REALI del repo
// (stessa lista/ordine di index.html, filtrata ai file di logica pura — non rendering/mappa/
// realtime), in un unico contesto VM dove `window === global` (stessa semantica di uno
// script tag in un browser: `var` a top-level diventa proprietà condivisa).
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');

// Stessa lista/ordine di index.html. Include ora anche i file ui-*.js e i sistemi
// (p2p, aste, crypto, alleanze, VTK…) che muovono denaro: senza di loro un terzo
// delle azioni del giocatore non era nemmeno raggiungibile dai test — 90 nomi su
// 246 non risolvevano a nessuna funzione. Il rendering e i modali di quei file
// vengono neutralizzati dopo il caricamento (vedi in fondo a createGameEnv), così
// il comportamento resta quello di prima ma le loro funzioni diventano testabili.
//
// Restano fuori: serverState.js (sostituito dal mock, altrimenti sovrascriverebbe
// window.ServerState), supabase-config.js (vuole l'SDK), map-visual.js (vuole la
// mappa vera e avvia un timer che fa cadere il processo), motion.js
// (IntersectionObserver), e i file che avviano l'applicazione (boot.js, tutorial,
// onboarding, push-notifications), che mandano il caricamento in stallo.
const CORE_FILES = [
    'security.js', 'events.js', 'ce-actions.js', 'config.js', 'geoCoords.js', 'routesDB.js',
    'data.js', 'lang.js', 'syncManager.js', 'saveSystem.js', 'money.js', 'quests-data.js',
    'quests.js', 'engine.js', 'engine-daily.js', 'engine-rides.js', 'engine-finance.js',
    'engine-drivers.js', 'engine-fleet.js', 'engine-store.js', 'engine-holding.js',
    'engine-rivals.js', 'engine-events.js', 'vip-buffs.js', 'vip-clients.js', 'war_room.js',
    'ui-staff.js', 'ui-lifestyle.js', 'ui-ops.js', 'alliances.js', 'vanity.js', 'ui-politics.js',
    'ui-career.js', 'ui-store.js', 'ui-finance.js', 'daily-orders.js',
    'zero-to-hero.js', 'vittorio.js', 'showroom.js', 'vtk-market.js', 'p2p-market.js',
    'p2p-render.js', 'b2b.js', 'auctions.js', 'driver_skills.js', 'black_ops.js', 'crypto.js',
    'hq-data.js', 'hq.js', 'hostile_takeover.js', 'nemesis.js', 'infrastructure.js',
    'contracts.js', 'tourism.js'
];

// document reale via jsdom — necessario perché il codice del gioco usa
// document.getElementById('srm-overlay') (ecc.) come segnale di stato ("l'overlay è già
// aperto?"), non solo per scrivere HTML. Uno stub che non ricorda gli elementi creati
// rompe questa logica in modo silenzioso (falsi "non ancora aperto" ad ogni chiamata).
function makeDocument() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    return dom.window.document;
}

function makeLocalStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear(),
        key: (i) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
        _dump: () => Object.fromEntries(store),
    };
}

// Mock di ServerState: stessa interfaccia pubblica del vero serverState.js. Un giocatore
// realmente connesso riceve gli effetti economici via Realtime -> _bridgeToGameState (che
// scrive gameState.cash = valore autoritativo del server, vedi serverState.js:202-215) — NON
// dalla funzione che ha chiamato la RPC. Per essere un mock fedele (non un semplice stub
// true/false) ogni metodo qui muta `sandbox.gameState` esattamente come farebbe il bridge
// reale dopo che l'RPC "server" ha avuto successo. `isReady()` di default TRUE (un giocatore
// vero è quasi sempre connesso — i pochi punti con fallback locale per isReady()===false
// restano comunque testabili passando overrides.isReady).
// Override per test: passa funzioni sostitutive (es. una che rigetta) per simulare fallimenti
// RPC, come nel test di rollback di daily-orders.
function makeServerState(sandboxRef, overrides = {}) {
    let ready = true;
    const gs = () => sandboxRef.gameState;
    const base = {
        isReady: () => ready,
        _setReady: (v) => { ready = v; },
        init: async () => { ready = true; return {}; },
        getCompany: () => ({ hq_city: 'roma', cash: gs()?.cash }),
        getState: () => ({ company: base.getCompany() }),

        buyVehicle: async (modelId, price) => {
            gs().cash = (gs().cash || 0) - price;
            return { id: 'srv_veh_' + modelId + '_' + Math.random().toString(36).slice(2) };
        },
        sellVehicle: async (_serverId, price) => {
            gs().cash = (gs().cash || 0) + price;
            return { success: true, sold_price: price };
        },
        repairVehicle: async (_serverId, cost) => {
            gs().cash = Math.max(0, (gs().cash || 0) - cost);
            return { success: true };
        },
        refuelVehicle: async (_serverId, _amount, cost) => {
            gs().cash = Math.max(0, (gs().cash || 0) - cost);
            return { success: true };
        },
        buyVehicleUpgrade: async (_vehicleId, _upgradeId, price) => {
            gs().cash = Math.max(0, (gs().cash || 0) - price);
            return { success: true };
        },
        takeLoan: async (principal, interestRate, dailyPayment) => {
            gs().cash = (gs().cash || 0) + principal;
            return { id: 'loan_' + Math.random().toString(36).slice(2), principal, remaining: principal, interest_rate: interestRate, daily_payment: dailyPayment };
        },
        repayLoan: async (_loanId, amount) => {
            gs().cash = Math.max(0, (gs().cash || 0) - amount);
            return { success: true };
        },
        hireDriver: async (name, _salary, tier) => ({ id: 'srv_drv_' + Math.random().toString(36).slice(2), name, tier }),
        fireDriver: async (_driverId) => ({ success: true }),
        buyInvestment: async (_invId, price) => {
            gs().cash = (gs().cash || 0) - price;
            return { success: true };
        },
        unlockRegion: async (_regionId, price) => {
            gs().cash = (gs().cash || 0) - price;
            return { success: true };
        },
        acquireProvince: async (provinceId, offer) => {
            gs().cash = Math.max(0, (gs().cash || 0) - offer);
            return { success: true, province_id: provinceId, province_name: provinceId, offer };
        },
        addProvinceInfluence: async (_provinceId, _amount) => ({ success: true }),
        getTerritorySnapshot: async () => ({ provinces: [], regions: [], influence: {} }),
        getMyInfluence: async () => ({}),
        restCeo: async (_hotelStars, cost) => {
            gs().cash = Math.max(0, (gs().cash || 0) - cost);
            return { success: true };
        },
        syncCash: async (cash) => { gs().cash = cash; return { success: true, cash }; },
        addDriverCoins: async (amount) => {
            gs().driverCoins = (gs().driverCoins || 0) + amount;
            return { ok: true, driver_coins: gs().driverCoins };
        },
        spendDriverCoins: async (_itemId, amount) => {
            gs().driverCoins = Math.max(0, (gs().driverCoins || 0) - amount);
            return { ok: true };
        },
        findServerVehicle: () => null,
        findServerDriver: () => null,
    };
    return Object.assign(base, overrides);
}

// Costruisce un nuovo ambiente pulito (sandbox VM) e carica i file indicati, nell'ordine
// dato, tutti nello STESSO contesto (come fanno gli script tag in index.html — le globali
// `var` sono condivise tra file). Ritorna `{ sandbox, window }` — window === sandbox.
function createGameEnv(files, opzioni = {}) {
    const { serverState } = opzioni;
    const notifications = [];
    const logs = [];
    // startGameLoops/initGame registrano setInterval reali (game loop, poll trip, ecc.) su
    // `let _gameIntervals` locale al file — non accessibile da fuori (stessa regola let-vs-var
    // di CLAUDE.md). Intercettiamo qui ogni setInterval creato per poterli fermare tutti dal
    // test, altrimenti continuano a girare in background nel processo Node dopo il test.
    const activeIntervals = new Set();
    const trackedSetInterval = (...args) => { const id = setInterval(...args); activeIntervals.add(id); return id; };
    const trackedClearInterval = (id) => { activeIntervals.delete(id); clearInterval(id); };
    const sandbox = {
        console,
        setTimeout, clearTimeout, setInterval: trackedSetInterval, clearInterval: trackedClearInterval,
        Date, Math, JSON, Promise, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
        confirm: () => true,
        alert: () => {},
        localStorage: makeLocalStorage(),
        navigator: { userAgent: 'node-test', onLine: true, vibrate: () => {} },
        location: { href: 'http://localhost/', reload(){} },
        document: makeDocument(),
        innerWidth: 1280, innerHeight: 800,
        showNotification: (msg, type) => notifications.push({ msg, type }),
        logToMap: (msg) => logs.push(msg),
        addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
        requestAnimationFrame: (fn) => setTimeout(fn, 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
        fetch: async () => { throw new Error('fetch reale bloccato nell\'ambiente di test — mocka ServerState invece'); },
    };
    sandbox.window = sandbox; // stessa identità di un browser: window === global dello script tag
    sandbox.globalThis = sandbox;
    sandbox.ServerState = makeServerState(sandbox, serverState);
    sandbox.window.ServerState = sandbox.ServerState;

    vm.createContext(sandbox);

    for (const file of files) {
        const full = path.join(ROOT, file);
        const src = fs.readFileSync(full, 'utf8');
        try {
            vm.runInContext(src, sandbox, { filename: file });
        } catch (e) {
            throw new Error(`Errore caricando ${file}: ${e.message}\n${e.stack}`);
        }
    }

    // engine.js ridefinisce showNotification/logToMap come stub sicuri (no-op se
    // window._realShowNotification/#map-log non esistono — vedi engine.js:76-89,1081) che
    // SOVRASCRIVONO i recorder impostati sopra prima del caricamento (function-declaration a
    // top-level vince sulla proprietà preesistente). Li ripristiniamo qui DOPO il caricamento
    // così i test possono ancora osservare cosa il gioco avrebbe mostrato.
    sandbox.showNotification = (msg, type) => notifications.push({ msg, type });
    sandbox.logToMap = (msg) => logs.push(msg);

    const stopAllIntervals = () => { activeIntervals.forEach(id => clearInterval(id)); activeIntervals.clear(); };

    // Rendering e modali neutralizzati di default.
    //
    // Finché i file ui-*.js non erano caricati, `renderTabStaff` e compagnia non
    // esistevano e le chiamate dentro la logica di gioco venivano saltate dalle
    // guardie `typeof x === 'function'`. Caricandoli, ogni azione fa partire il
    // rendering vero, che pretende molto più stato di quanto un test di logica
    // prepari: `hireDriver` finiva per esplodere dentro zero-to-hero.js.
    //
    // Lo stesso vale per i modali (openCarModal & co.), che scrivono su elementi
    // reali della pagina: dare al banco il DOM completo di index.html li farebbe
    // funzionare, ma cambierebbe il comportamento di tutto il codice che usa la
    // presenza di un elemento come segnale di stato ("il pannello è già aperto?")
    // — e quadruplicherebbe la durata della suite.
    //
    // Stubbandoli si ottiene ESATTAMENTE il comportamento di prima, ma le funzioni
    // di quei file restano disponibili per essere testate direttamente — che è il
    // motivo per cui li carichiamo. Chi vuole il rendering vero passa
    // `{ render: true }` e se lo prepara.
    if (!opzioni.render) {
        for (const chiave of Object.keys(sandbox)) {
            if (/^(render(Tab|P2P)|open\w*Modal)/.test(chiave) && typeof sandbox[chiave] === 'function') {
                sandbox[chiave] = function () {};
                sandbox.window[chiave] = sandbox[chiave];
            }
        }
    }

    return { sandbox, notifications, logs, stopAllIntervals };
}

// Scorciatoia usata da quasi tutti i test: ambiente pulito con CORE_FILES, stato di
// "nuova partita" reale (initGame(true) — cash 0, 1 CEO, 1 auto starter), game loop
// fermato subito (i test chiamano le funzioni direttamente, non aspettano i timer).
function freshEnv(overrides) {
    const env = createGameEnv(CORE_FILES, overrides);
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

module.exports = { createGameEnv, makeServerState, makeLocalStorage, CORE_FILES, freshEnv };
