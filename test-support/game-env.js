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
// window.ServerState), supabase-config.js (vuole l'SDK), motion.js
// (IntersectionObserver), e i file che avviano l'applicazione (boot.js, tutorial,
// onboarding, push-notifications), che mandano il caricamento in stallo.
const CORE_FILES = [
    'security.js', 'events.js', 'ce-actions.js', 'design-system.js', 'config.js', 'feature-gate.js',
    /* map-api.js: puro, senza DOM e senza effetti al caricamento. Nel banco
       nessun backend viene registrato, quindi ogni MapBackend.* e' un no-op —
       lo stesso comportamento che davano le guardie `typeof drawPOIs ===
       'function'` che ha sostituito. */
    'map-api.js',
    'geoCoords.js', 'routesDB.js',
    /* map-router.js e ride-progress.js: matematica dell'instradamento e
       orologio delle corse. Vivevano dentro i file di mappa e per questo non
       erano collaudabili; ora sono nel banco, che e' il punto di tutto il
       lavoro del 23/08. */
    'map-router.js', 'ride-progress.js',
    'data.js', 'lang.js', 'syncManager.js', 'saveSystem.js', 'money.js', 'ui-landing.js', 'auth.js',
    'quests-data.js',
    'quests.js', 'engine.js', 'engine-daily.js', 'engine-rides.js', 'engine-finance.js',
    'engine-drivers.js', 'engine-fleet.js', 'engine-store.js', 'engine-holding.js',
    'engine-rivals.js', 'engine-events.js', 'vip-buffs.js', 'vip-clients.js', 'ui-fleet.js', 'ui-staff.js',
    'ui-lifestyle.js', 'ui-ops.js', 'alliances.js', 'vanity.js', 'ui-career.js', 'ui-store.js',
    'ui-finance.js', 'daily-orders.js', 'ui-realestate.js', 'ui-dispatch.js',
    'onboarding-core.js', 'zero-to-hero.js', 'vittorio.js', 'showroom.js', 'vtk-market.js', 'p2p-market.js',
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

/* Specchio di dc_item_prices (66_server_priced_dc_purchase.sql): il prezzo e'
   conoscenza del SERVER, quindi vive nel mock del server — mai nel client. */
const DC_ITEM_PRICES = {
    executive_pass:      { unit_price: 150, min_total: 1 },
    skip_construction:   { unit_price: 8,   min_total: 1 },
    academy_skip:        { unit_price: 5,   min_total: 1 },
    fuel_boost:          { unit_price: 3,   min_total: 1 },
    wake_driver:         { unit_price: 3,   min_total: 1 },
    energy_boost:        { unit_price: 4,   min_total: 1 },
    insta_heal:          { unit_price: 2,   min_total: 1 },
    wake_all_drivers:    { unit_price: 2,   min_total: 3 },
    heal_all_drivers:    { unit_price: 2,   min_total: 4 },
    ops_bundle:          { unit_price: 9,   min_total: 1 },
    full_bundle:         { unit_price: 35,  min_total: 1 },
};

function makeServerState(sandboxRef, overrides = {}) {
    let ready = true;
    const gs = () => sandboxRef.gameState;
    const base = {
        isReady: () => ready,
        _setReady: (v) => { ready = v; },
        init: async () => { ready = true; return {}; },
        getCompany: () => ({ hq_city: 'roma', cash: gs()?.cash }),
        getState: () => ({ company: base.getCompany() }),

        /* rpc_buy_vehicle (01_mmo_migration.sql): RAISE se cash < price (qui: null,
           senza toccare la cassa), poi scala e INSERT ... RETURNING della riga
           vehicles. Il client (showroom._srmPurchase) NON scala in locale quando
           ServerState è pronto: il finto deve muovere la cassa per lui. */
        buyVehicle: async (modelId, price, hqCity) => {
            if ((gs().cash || 0) < price) return null;
            gs().cash = (gs().cash || 0) - price;
            return {
                id: 'srv_veh_' + modelId + '_' + Math.random().toString(36).slice(2),
                model_id: modelId,
                current_city: hqCity || 'roma',
                status: 'IDLE',
            };
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
        refillCarTires: async (_vehicleId, cost) => {
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
        /* Contratto di rpc_repay_loan (02_mmo_rpcs_extension.sql): { repaid,
           remaining_after }. Il finto non tiene un registro dei prestiti:
           remaining_after=0 è il caso di rimborno integrale. */
        repayLoan: async (_loanId, amount) => {
            gs().cash = Math.max(0, (gs().cash || 0) - amount);
            return { repaid: amount, remaining_after: 0 };
        },
        /* rpc_hire_driver (02_mmo_rpcs_extension.sql): valida il tier contro la
           whitelist del DB (RAISE per tutto il resto), scala salary×2 di costo
           assunzione e rifiuta se la cassa non basta. Il client
           (ui-staff.hireOfficeStaff) NON muove cassa in locale su questa strada:
           un finto che non la scala faceva risultare gratis ogni assunzione. */
        hireDriver: async (name, _salary, tier = 'STANDARD') => {
            if (!['STANDARD', 'BUSINESS', 'VIP', 'ULTRA'].includes(tier)) return null;
            const costoAssunzione = _salary * 2;
            if ((gs().cash || 0) < costoAssunzione) return null;
            gs().cash = (gs().cash || 0) - costoAssunzione;
            return { id: 'srv_drv_' + Math.random().toString(36).slice(2), name, salary: _salary, tier, status: 'AVAILABLE' };
        },
        fireDriver: async (driverId) => ({ fired: true, driver_id: driverId }),
        buyInvestment: async (_invId, price) => {
            gs().cash = (gs().cash || 0) - price;
            return { success: true };
        },
        unlockRegion: async (_regionId, price) => {
            gs().cash = (gs().cash || 0) - price;
            return { success: true };
        },
        restCeo: async (_hotelStars, cost) => {
            gs().cash = Math.max(0, (gs().cash || 0) - cost);
            /* Contratto di rpc_rest_ceo (02_mmo_rpcs_extension.sql):
               energy_recovered = stelle × 20. */
            return { stars: _hotelStars, cost, energy_recovered: _hotelStars * 20 };
        },
        /* Stessi CAMPI di rpc_buy_real_estate (09_provinces_realestate_fuel.sql).
           COMPORTAMENTO non riproducibile: la vera scala listing.cost letto dal DB,
           ma la firma passa solo il listing_id — il finto non può conoscere il prezzo.
           Un test che vuole il debit deve fare override di questo metodo. */
        buyRealEstate: async (listingId) => ({
            success: true,
            listing_id: listingId,
            name: 'Immobile ' + listingId,
            daily_rent: 1000
        }),
        syncCash: async (cash) => { gs().cash = cash; return { success: true, cash }; },
        /* Stesso discorso di spendDriverCoins, lato accredito: rpc_add_driver_coins
           (17_executive_club.sql) accredita sul SUO saldo e restituisce quello nuovo;
           CE_money.earnDC ha gia' accreditato in locale e si riallinea sulla risposta.
           Accreditare di nuovo qui valeva ogni premio Driver Coins il doppio. */
        addDriverCoins: async (_amount) => {
            return { ok: true, driver_coins: Math.max(0, gs().driverCoins || 0) };
        },
        /* Il vero server scala i Driver Coins sul SUO saldo e restituisce quello
           nuovo; CE_money.spendDC ha gia' scalato in locale e si riallinea sulla
           risposta. Un finto server che scala di nuovo li toglie due volte — e
           faceva fallire test scritti su codice corretto. Qui si restituisce il
           saldo risultante, che e' quello che il server manderebbe indietro
           quando browser e server sono d'accordo. */
        spendDriverCoins: async (itemId, amount) => {
            /* Contratto COMPLETO di rpc_ec_spend (17_executive_club.sql):
               { ok, item_id, spent, driver_coins } — prima mancavano item_id e spent. */
            return { ok: true, item_id: itemId, spent: amount, driver_coins: Math.max(0, gs().driverCoins || 0) };
        },
        /* Contratto di rpc_dc_purchase (66_server_priced_dc_purchase.sql): il
           finto server legge IL SUO catalogo prezzi, rifiuta senza toccare nulla
           se il saldo non basta e restituisce { ok, item_id, units, spent,
           driver_coins }. Il client (CE_money.acquistoDC) non calcola niente:
           scrive solo il saldo che gli torna indietro — quindi qui la mutazione
           del saldo va fatta dal mock, come farebbe il bridge Realtime vero. */
        purchaseDCItem: async (itemId, units = 1) => {
            const prezzo = DC_ITEM_PRICES[itemId];
            if (!prezzo) return null;
            const spent = Math.max(prezzo.min_total, prezzo.unit_price * Math.max(1, units));
            if ((gs().driverCoins || 0) < spent) return null; // RAISE della vera RPC -> _rpc -> null
            gs().driverCoins = (gs().driverCoins || 0) - spent;
            return { ok: true, item_id: itemId, units, spent, driver_coins: gs().driverCoins };
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
    // Anche i setTimeout vanno tracciati: initGame(true) pianta un setTimeout
    // REALE a 800ms di kickstart (engine.js: corse POI + bandi + updateUI) che
    // stopAllIntervals non uccideva. Nei test che vivono piu' di 800ms (facile
    // a suite parallela carica) il callback scattava A META' TEST mutando
    // pendingRides/nextTenderDay: e' la causa del "a volte rosso, a volte verde"
    // della suite su stesso codice (regressione: test/guardrail/timer-residui-initgame.test.js).
    const trackedSetTimeout = (...args) => { const id = setTimeout(...args); activeIntervals.add(id); return id; };
    const trackedClearTimeout = (id) => { activeIntervals.delete(id); clearTimeout(id); };
    const trackedSetInterval = (...args) => { const id = setInterval(...args); activeIntervals.add(id); return id; };
    const trackedClearInterval = (id) => { activeIntervals.delete(id); clearInterval(id); };
    const sandbox = {
        console,
        setTimeout: trackedSetTimeout, clearTimeout: trackedClearTimeout,
        setInterval: trackedSetInterval, clearInterval: trackedClearInterval,
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

    // In Node clearInterval e clearTimeout sono intercambiabili sugli id: un solo
    // giro basta per uccidere sia gli intervalli che i timeout tracciati.
    const stopAllIntervals = () => {
        activeIntervals.forEach(id => { clearInterval(id); clearTimeout(id); });
        activeIntervals.clear();
    };

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
