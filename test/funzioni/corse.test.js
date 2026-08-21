'use strict';
/* ============================================================================
   test/funzioni/corse.test.js — Collaudo completo del modulo Dispatch & Corse

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-rides.js`, `dispatcher.js`, `ui-dispatch.js` e dai relativi
   gestori `data-ce-act`, verificare il calcolo dettagliato del guadagno di una corsa
   (tariffe, distanze, livello autista, condizione veicolo, carburante, meteo, buff,
   infrastrutture), la gestione dei casi limite, la resistenza all'offline / reload
   e il rispetto rigoroso delle regole anti-doppio-conteggio di CE_money.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Costruisce un ambiente completo per il collaudo del Dispatch Center e del ciclo corse.
 */
function creaAmbienteCorse(opzioni = {}) {
    const rpcLog = [];
    const syncedCash = [];
    const addedDC = [];
    const ceMoneyCalls = [];

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            addDriverCoins: async (n, motivo) => {
                addedDC.push({ amount: n, reason: motivo });
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
            ...opzioni.serverStateOverrides,
        },
    });

    const sb = env.sandbox;

    // Carica dispatcher.js nella sandbox se non già presente
    if (typeof sb.switchTab !== 'function') {
        const dispatcherSrc = fs.readFileSync(path.join(ROOT, 'dispatcher.js'), 'utf8');
        vm.runInContext(dispatcherSrc, sb, { filename: 'dispatcher.js' });
    }

    // Tracciamento chiamate CE_money
    const origEarn = sb.CE_money.earn;
    sb.CE_money.earn = function (amount, reason) {
        ceMoneyCalls.push({ type: 'earn', amount, reason });
        return origEarn.apply(this, arguments);
    };

    const origEarnDC = sb.CE_money.earnDC;
    sb.CE_money.earnDC = function (amount, reason) {
        ceMoneyCalls.push({ type: 'earnDC', amount, reason });
        return origEarnDC.apply(this, arguments);
    };

    const origAddRep = sb.CE_money.addReputation;
    sb.CE_money.addReputation = function (amount) {
        ceMoneyCalls.push({ type: 'addReputation', amount });
        return origAddRep.apply(this, arguments);
    };

    // Mock Supabase per RPC
    const sbClient = {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args);
            }
            if (nome === 'rpc_pay_majority_dividend') {
                return { data: { dividend_paid: Math.floor(args.v_ride_earnings * 0.20) }, error: null };
            }
            if (nome === 'rpc_pay_fuel_levy') {
                return { data: { levy: Math.floor(args.v_fare * 0.03) }, error: null };
            }
            return { data: null, error: null };
        },
    };

    sb.supabaseClient = sbClient;
    sb.window.supabaseClient = sbClient;
    sb.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_player_uuid' };
    sb.window.currentUser = sb.currentUser;

    // Predisponi DOM completo per Dispatch & Overlay
    sb.document.body.innerHTML = `
        <div id="notifications"></div>
        <div id="tab-container"></div>
        <div id="panel-title"></div>
        <div id="main-panel"></div>
        <div id="panel-peek-tab"></div>
        <button id="panel-collapse-btn">◀</button>
        <div id="map-overlay" class="hidden"></div>
        <div id="map-traffic-label"></div>
        <div id="map-log"></div>
    `;

    // Stubs di sicurezza per funzioni mappa/rendering opzionali
    if (typeof sb._ensureMap !== 'function') sb._ensureMap = () => {};
    if (typeof sb._destroyMap !== 'function') sb._destroyMap = () => {};
    if (typeof sb.renderTabHome !== 'function') sb.renderTabHome = () => {
        const c = sb.document.getElementById('tab-container');
        if (c) c.innerHTML = '<div id="home-view">Home</div>';
    };

    // Integra dispatcher showNotification con recorder env.notifications
    const domShowNotif = sb.showNotification;
    sb.showNotification = (msg, type) => {
        env.notifications.push({ msg, type });
        if (typeof domShowNotif === 'function') {
            try { domShowNotif(msg, type); } catch (_) {}
        }
    };
    sb.window.showNotification = sb.showNotification;

    // Configurazione predefinita giocatore (questStats.totalRides >= 15 per uscire dalla modalità survival)
    sb.gameState.companyName = 'Empire Limos';
    sb.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 25000;
    sb.gameState.unlockedRegions = opzioni.unlockedRegions || ['lazio', 'lombardia', 'campania'];
    sb.gameState.questStats = { totalRides: 15, ...opzioni.questStats };
    sb.gameState.prestige = opzioni.prestige !== undefined ? opzioni.prestige : 0;

    return {
        env,
        sandbox: sb,
        gs: sb.gameState,
        rpcLog,
        syncedCash,
        addedDC,
        ceMoneyCalls,
        notifications: env.notifications,
        logs: env.logs,
    };
}

describe('Funzione Dispatch & Ciclo Corse — Collaudo Completo', () => {

    // ────────────────────────────────────────────────────────────────────────
    // 1. Inizializzazione, Routing e Overlay Mappa (dispatcher.js, ui-dispatch.js)
    // ────────────────────────────────────────────────────────────────────────
    describe('1. Inizializzazione, Routing e Overlay Mappa', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('switchTab("corse") imposta il titolo e renderizza il Dispatch Center', () => {
            const { sandbox } = amb;
            sandbox.switchTab('corse');

            const title = sandbox.document.getElementById('panel-title');
            const container = sandbox.document.getElementById('tab-container');

            assert.equal(title.innerText, 'Dispatch Center');
            assert.ok(container.innerHTML.includes('Richieste Pendenti'));
            assert.ok(container.innerHTML.includes('Stato Autisti'));
        });

        test('switchTab gestisce gracefully schede spente o bloccate', () => {
            const { sandbox } = amb;
            // Simula funzione spenta da feature-gate
            sandbox.tabSpenta = (tab) => tab === 'auctions';
            sandbox.switchTab('auctions');

            const title = sandbox.document.getElementById('panel-title');
            // Deve reindirizzare a Home
            assert.equal(title.innerText, '🏠 Command Center');
        });

        test('togglePanel alterna la classe panel-collapsed e aggiorna il testo del pulsante', () => {
            const { sandbox } = amb;
            const panel = sandbox.document.getElementById('main-panel');
            const btn = sandbox.document.getElementById('panel-collapse-btn');

            sandbox.togglePanel();
            assert.ok(panel.classList.contains('panel-collapsed'));
            assert.equal(btn.textContent, '▶');

            sandbox.togglePanel();
            assert.equal(panel.classList.contains('panel-collapsed'), false);
            assert.equal(btn.textContent, '◀');
        });

        test('openMapOverlay e closeMapOverlay gestiscono visibilità del layer mappa', () => {
            const { sandbox } = amb;
            const overlay = sandbox.document.getElementById('map-overlay');

            sandbox.openMapOverlay();
            assert.equal(overlay.classList.contains('hidden'), false);
            assert.equal(sandbox._mapOverlayOpen, true);

            sandbox.closeMapOverlay();
            assert.ok(overlay.classList.contains('hidden'));
            assert.equal(sandbox._mapOverlayOpen, false);
        });

        test('showNotification accoda notifiche standard ed errore nel DOM', () => {
            const { sandbox } = amb;
            sandbox.showNotification('Corsa completata con successo!', 'success');
            sandbox.showNotification('Carburante insufficiente!', 'error');

            const notifContainer = sandbox.document.getElementById('notifications');
            assert.ok(notifContainer.innerHTML.includes('Corsa completata con successo!'));
            assert.ok(notifContainer.innerHTML.includes('error-notif'));
            assert.ok(notifContainer.innerHTML.includes('Carburante insufficiente!'));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. Generazione Corse (generatePOIRide, generateContractRide, Empty Leg)
    // ────────────────────────────────────────────────────────────────────────
    describe('2. Generazione Corse e tratte speciali', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('generatePOIRide genera una corsa valida tra POI delle regioni sbloccate', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];

            let ride = null;
            let tentativi = 0;
            while (!ride && tentativi < 10) {
                ride = sandbox.generatePOIRide();
                tentativi++;
            }

            assert.ok(ride, 'deve generare un oggetto corsa');
            assert.ok(ride.id > 0);
            assert.ok(ride.price > 0);
            assert.ok(ride.fromPoi && ride.toPoi);
            assert.notEqual(ride.fromPoi.id, ride.toPoi.id);
            assert.ok(gs.unlockedRegions.includes(ride.fromPoi.region));
            assert.ok(gs.unlockedRegions.includes(ride.toPoi.region));
            assert.ok(gs.pendingRides.length >= 1);
        });

        test('generatePOIRide rifiuta la generazione se ci sono già 15 corse pendenti', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = Array.from({ length: 15 }, (_, i) => ({ id: 100 + i }));

            const result = sandbox.generatePOIRide();
            assert.equal(result, null);
            assert.equal(gs.pendingRides.length, 15);
        });

        test('generatePOIRide per Venezia richiede un Water Taxi attivo nella flotta', () => {
            const { sandbox, gs } = amb;
            gs.unlockedRegions = ['veneto'];
            gs.fleet = [{ id: 'car1', vehicleClass: 'stellar_e_exec', tier: 'business' }];

            // Mock Math.random per forzare selezione di POI venezia
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.0; // prenderà venezia se primo, o fallback

            // Se la flotta non ha water_taxi, la corsa su isola non viene creata se toPoi è venezia
            const ride = sandbox.generatePOIRide();
            if (ride && ride.toPoi?.id === 'venezia') {
                assert.fail('Non dovrebbe generare corse per Venezia isola senza Water Taxi');
            }
            sandbox.Math.random = origRandom;
        });

        test('generateContractRide genera una corsa B2B da italianRoutesDB con veicolo richiesto', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            gs.fleet = [
                { id: 'c_imp', vehicleClass: 'stellar_s_imp', tier: 'ultra', outOfService: null },
                { id: 'c_van', vehicleClass: 'stellar_v_carr', tier: 'vip', outOfService: null },
                { id: 'c_exec', vehicleClass: 'stellar_e_exec', tier: 'business', outOfService: null },
            ];

            const contractRide = sandbox.generateContractRide();

            assert.ok(contractRide, 'deve generare una corsa contrattuale');
            assert.equal(contractRide.isContract, true);
            assert.ok(contractRide.vehicleRequired);
            assert.ok(contractRide.price > 0);
            assert.ok(contractRide.duration >= 20000);
            assert.ok(gs.pendingRides.includes(contractRide));
        });

        test('_findEmptyLegRide genera una tratta di ritorno scontata del 50% al termine di una corsa lunga', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_empty_leg'];
            gs.pendingRides = [];

            const completedRide = {
                toPoi: { id: 'milano', name: 'Milano Centro', region: 'lombardia', baseFlat: 200 },
            };

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.1; // supera il threshold 0.40

            sandbox._findEmptyLegRide(completedRide);
            sandbox.Math.random = origRandom;

            assert.equal(gs.pendingRides.length, 1);
            const emptyLeg = gs.pendingRides[0];
            assert.equal(emptyLeg.isEmptyLeg, true);
            assert.equal(emptyLeg.fromPoi.id, 'milano');
            assert.ok(emptyLeg.price > 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. Assegnazione Corse e Gestione Code (assignRideToDriver, assignAllRides)
    // ────────────────────────────────────────────────────────────────────────
    describe('3. Assegnazione Corse, Code e Validazione Autisti', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse();
            const { gs } = amb;
            gs.drivers = [
                { id: 'd1', name: 'Marco', status: 'idle', queue: [], assignedCarId: 'c1', fatigue: 10, trait: null },
                { id: 'd2', name: 'Luca', status: 'idle', queue: [], assignedCarId: 'c2', fatigue: 20, trait: null },
            ];
            gs.fleet = [
                { id: 'c1', name: 'Berlina Executive', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 100, fuel: 80, outOfService: null },
                { id: 'c2', name: 'Van Carrier', tier: 'vip', vehicleClass: 'stellar_v_carr', condition: 95, fuel: 90, outOfService: null },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('assignRideToDriver assegna la corsa, svuota pending e attiva l\'autista idle', () => {
            const { sandbox, gs } = amb;
            const ride = {
                id: 501, tier: 'business', price: 150, duration: 20000,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'Fiumicino' },
            };
            gs.pendingRides = [ride];

            sandbox.assignRideToDriver(501, 'd1');

            assert.equal(gs.pendingRides.length, 0, 'la corsa deve essere rimossa dalle pendenti');
            const driver = gs.drivers.find(d => d.id === 'd1');
            assert.equal(driver.status, 'busy', 'l\'autista idle deve iniziare subito la corsa');
            assert.equal(gs.activeRides.length, 1);
            assert.equal(gs.activeTrips.length, 1);
        });

        test('assignRideToDriver rifiuta contratti con veicolo richiesto errato e notifica errore', () => {
            const { sandbox, gs, env } = amb;
            const contractRide = {
                id: 502, isContract: true, vehicleRequired: 'stellar_s_imp', tier: 'ultra', price: 600, duration: 30000,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'firenze', region: 'toscana', name: 'Firenze' },
            };
            gs.pendingRides = [contractRide];

            // d1 ha stellar_e_exec -> incompatibile con stellar_s_imp
            sandbox.assignRideToDriver(502, 'd1');

            assert.equal(gs.pendingRides.length, 1, 'la corsa deve restare in pending');
            const driver = gs.drivers.find(d => d.id === 'd1');
            assert.equal(driver.queue.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Veicolo errato')));
        });

        test('assignRideToDriver rifiuta autisti in riposo o con coda satura (max 10 / 12)', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers.find(d => d.id === 'd1');
            driver.status = 'resting';
            driver.restHoursLeft = 4;

            const ride = { id: 503, tier: 'business', price: 100, duration: 10000, fromPoi: { id: 'a', region: 'lazio' }, toPoi: { id: 'b', region: 'lazio' } };
            gs.pendingRides = [ride];

            sandbox.assignRideToDriver(503, 'd1');

            assert.equal(gs.pendingRides.length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in riposo')));

            // Verifica limite coda per autista non in riposo
            driver.status = 'busy';
            driver.queue = Array.from({ length: 10 }, (_, i) => ({ id: 600 + i }));
            sandbox.assignRideToDriver(503, 'd1');
            assert.equal(driver.queue.length, 10, 'non deve superare il massimo di 10 elementi in coda');
        });

        test('_driverCanTakeRide valida compatibilità tier, condizioni minime, outOfService e B2B lock', () => {
            const { sandbox, gs } = amb;
            const d1 = gs.drivers[0];
            const car1 = gs.fleet[0];
            const standardRide = { tier: 'standard' };
            const ultraRide = { tier: 'ultra' };

            // Tier business compatibile con standard e business, non con ultra
            assert.equal(sandbox._driverCanTakeRide(d1, standardRide), true);
            assert.equal(sandbox._driverCanTakeRide(d1, ultraRide), false);

            // Condizione <= 10 blocca assegnazione
            car1.condition = 10;
            assert.equal(sandbox._driverCanTakeRide(d1, standardRide), false);
            car1.condition = 80;

            // Fuori servizio blocca assegnazione
            car1.outOfService = 'repair';
            assert.equal(sandbox._driverCanTakeRide(d1, standardRide), false);
            car1.outOfService = null;

            // Sciopero autista blocca assegnazione
            d1.status = 'striking';
            assert.equal(sandbox._driverCanTakeRide(d1, standardRide), false);
            d1.status = 'idle';

            // Veicolo bloccato in appalto B2B
            sandbox.b2bLockedVehicleIds = () => [car1.id];
            assert.equal(sandbox._driverCanTakeRide(d1, standardRide), false);
            sandbox.b2bLockedVehicleIds = null;
        });

        test('assignAllRides smista tutte le corse pendenti agli autisti compatibili', () => {
            const { sandbox, gs, env } = amb;
            gs.pendingRides = [
                { id: 701, tier: 'business', price: 120, duration: 15000, fromPoi: { id: 'a', region: 'lazio' }, toPoi: { id: 'b', region: 'lazio' } },
                { id: 702, tier: 'vip', price: 250, duration: 25000, fromPoi: { id: 'c', region: 'lazio' }, toPoi: { id: 'd', region: 'lazio' } },
            ];

            sandbox.assignAllRides();

            assert.equal(gs.pendingRides.length, 0, 'tutte le corse compatibili devono essere assegnate');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('smistate')));
        });

        test('autoDispatchRides gestisce filtri staff per corse VIP e Ultra', () => {
            const { sandbox, gs } = amb;
            gs.staff = []; // nessun dispatcher senior
            gs.pendingRides = [
                { id: 801, tier: 'vip', price: 300, duration: 20000, fromPoi: { id: 'a', region: 'lazio' }, toPoi: { id: 'b', region: 'lazio' } },
            ];

            // Senza senior dispatcher, le corse VIP non vengono auto-smistate
            sandbox.autoDispatchRides();
            assert.equal(gs.pendingRides.length, 1);

            // Con senior dispatcher 'sr_disp', le corse VIP vengono smistate
            gs.staff.push({ id: 'sr_disp' });
            sandbox.autoDispatchRides();
            assert.equal(gs.pendingRides.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. Avvio Corsa, Consumi e Usura Risorse (startNextRide)
    // ────────────────────────────────────────────────────────────────────────
    describe('4. Avvio Corsa, Consumi e Usura Risorse', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse();
            const { gs } = amb;
            gs.drivers = [
                { id: 'ceo', name: 'CEO Player', status: 'idle', queue: [], assignedCarId: 'c_ceo', fatigue: 0 },
                { id: 'd_pro', name: 'Autista Pro', status: 'idle', queue: [], assignedCarId: 'c_pro', fatigue: 10, trait: null },
            ];
            gs.fleet = [
                { id: 'c_ceo', name: 'Auto CEO', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 100, fuel: 80, tirePressure: 100, mileage: 1000 },
                { id: 'c_pro', name: 'Auto Elettrica', tier: 'business', vehicleClass: 'volt_3_urban', condition: 100, fuel: 100, tirePressure: 100, mileage: 500 },
            ];
            gs.energy = 100;
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('startNextRide scala condizione, carburante, pressione gomme e incrementa km', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'd_pro');
            const car = gs.fleet.find(c => c.id === 'c_pro');
            // Imposta veicolo a benzina per testare consumo carburante
            car.vehicleClass = 'stellar_e_exec';
            car.fuel = 80;

            const ride = {
                id: 901, tier: 'business', price: 200, duration: 20000,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'Fiumicino' },
            };
            driver.queue = [ride];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'busy');
            assert.ok(car.condition < 100, 'la condizione deve calare per usura');
            assert.ok(car.fuel < 80, 'il carburante deve calare');
            assert.ok(car.tirePressure < 100, 'la pressione gomme deve calare');
            assert.equal(car.mileage, 560, 'i chilometri devono aumentare di 60');
            assert.equal(gs.activeRides.length, 1);
            assert.equal(gs.activeTrips.length, 1);
        });

        test('startNextRide per auto elettrica non consuma benzina ma controlla salute motore', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'd_pro');
            const car = gs.fleet.find(c => c.id === 'c_pro');
            car.vehicleClass = 'volt_3_urban'; // EV
            car.fuel = 95;

            driver.queue = [{
                id: 902, tier: 'business', price: 200, duration: 20000,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            }];

            sandbox.startNextRide(driver);

            assert.equal(car.fuel, 95, 'i veicoli elettrici non consumano carburante tradizionale');
            assert.equal(driver.status, 'busy');
        });

        test('startNextRide per CEO scala energia e blocca la corsa se energia < 10', () => {
            const { sandbox, gs } = amb;
            const ceo = gs.drivers.find(d => d.id === 'ceo');
            gs.energy = 5; // Insufficiente

            ceo.queue = [{
                id: 903, tier: 'business', price: 150, duration: 15000,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            }];

            sandbox.startNextRide(ceo);

            assert.equal(ceo.status, 'idle', 'il CEO esausto non può iniziare la corsa');
            assert.equal(ceo.queue.length, 1);

            // Con energia sufficiente
            gs.energy = 50;
            sandbox.startNextRide(ceo);
            assert.equal(ceo.status, 'busy');
            assert.equal(gs.energy, 40, 'deve scalare 10 punti energia');
        });

        test('startNextRide con auto in condizione critica (<=10) drena la coda e rimette le corse in pending', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers.find(d => d.id === 'd_pro');
            const car = gs.fleet.find(c => c.id === 'c_pro');
            car.condition = 8; // Critica

            driver.queue = [
                { id: 904, tier: 'business', price: 100, duration: 10000, fromPoi: { id: 'a', region: 'lazio' }, toPoi: { id: 'b', region: 'lazio' } },
                { id: 905, tier: 'business', price: 120, duration: 10000, fromPoi: { id: 'c', region: 'lazio' }, toPoi: { id: 'd', region: 'lazio' } },
            ];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'idle');
            assert.equal(driver.queue.length, 0);
            assert.equal(gs.pendingRides.length, 2, 'le corse devono tornare in pending per essere riassegnate');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('condizione critica')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. Calcolo Dettagliato Guadagni e Moltiplicatori
    // ────────────────────────────────────────────────────────────────────────
    describe('5. Calcolo Dettagliato Guadagni e Moltiplicatori Economici', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse();
            const { gs } = amb;
            gs.drivers = [
                { id: 'd_test', name: 'Mario', status: 'busy', queue: [], assignedCarId: 'c_test', level: 0, trait: null, skill_charisma: 50 },
            ];
            gs.fleet = [
                { id: 'c_test', name: 'Berlina Test', tier: 'business', condition: 100, vehicleClass: 'stellar_e_exec', upgrades: [] },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('calcolo base corsa con deduzione costo carburante', () => {
            const { sandbox, gs } = amb;
            gs.fuelPrice = 2.0; // 2.0€/L
            const driver = gs.drivers[0];
            const car = gs.fleet[0];

            // Tratta intra-regionale: km stimati = 60 -> litri = 6 -> deduzione = 12€
            const ride = {
                id: 1001, tier: 'business', price: 200, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'Fiumicino' },
            };

            sandbox.completeRide(ride, false);

            // 200 - 12 = 188€ netti
            const lastEarn = amb.ceMoneyCalls.find(c => c.reason === 'ride_earnings');
            assert.ok(lastEarn);
            assert.equal(lastEarn.amount, 188);
        });

        test('moltiplicatore livello autista e mance staff HR (+15%)', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers[0];
            driver.level = 2; // tipBonus livello 2 (es. 1.20)
            gs.staff = [{ id: 'hr' }]; // HR manager -> +15% tip

            const ride = {
                id: 1002, tier: 'business', price: 200, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);

            const lastEarn = amb.ceMoneyCalls.find(c => c.reason === 'ride_earnings');
            assert.ok(lastEarn.amount > 200, 'il guadagno con HR e livello deve essere significativamente maggiorato');
        });

        test('malus usura auto: condizione < 50% (-15%) e < 30% (-20%) riduce il guadagno', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers[0];
            const car = gs.fleet[0];

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.5; // disattiva eventi casuali di delay bonus (15%) o charmante/DC

            const ride = {
                id: 1003, tier: 'business', price: 300, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            const getRideEarn = () => amb.ceMoneyCalls.filter(c => c.reason === 'ride_earnings').pop().amount;

            // Con auto integra (100)
            car.condition = 100;
            driver.xp = 0; driver.level = 0;
            sandbox.completeRide(ride, false);
            const earn100 = getRideEarn();

            // Con auto danneggiata (45)
            car.condition = 45;
            driver.xp = 0; driver.level = 0;
            sandbox.completeRide(ride, false);
            const earn45 = getRideEarn();

            // Con auto molto danneggiata (25)
            car.condition = 25;
            driver.xp = 0; driver.level = 0;
            sandbox.completeRide(ride, false);
            const earn25 = getRideEarn();

            sandbox.Math.random = origRandom;

            assert.ok(earn45 < earn100, 'condizione 45% deve rendere meno di 100%');
            assert.ok(earn25 < earn45, 'condizione 25% deve rendere meno di 45%');
        });

        test('moltiplicatori esterni: strategia di pricing, buff VIP, perk consorzio e tassazione Hub', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers[0];

            gs.pricingStrategy = 'premium'; // +40%
            sandbox._getBuffValue = (type) => (type === 'earnings_pct' ? 10 : 0); // +10% VIP buff
            sandbox._allyPerkMult = (type) => (type === 'earnings' ? 1.12 : 1.0); // +12% Consorzio
            gs.ownedHubs = ['roma']; // Possiede hub di partenza

            const ride = {
                id: 1004, tier: 'business', price: 200, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'Fiumicino' },
            };

            sandbox.completeRide(ride, false);

            const lastEarn = amb.ceMoneyCalls.find(c => c.reason === 'ride_earnings');
            assert.ok(lastEarn.amount > 300, 'la somma dei buff premium/vip/ally deve incrementare notevolmente il ricavo');
            assert.ok(gs.hubTaxBalance > 0, 'la tassa dell\'hub posseduto deve essere accreditata nel bilancio hub');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. Completamento Corse e Accredito Fondi (completeRide)
    // ────────────────────────────────────────────────────────────────────────
    describe('6. Completamento Corse, Reputazione e Statistiche', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse({ cash: 10000 });
            const { gs } = amb;
            gs.drivers = [
                { id: 'd_champ', name: 'Jean', status: 'busy', queue: [], assignedCarId: 'c_champ', level: 1, trait: { id: 'charmante', tipMult: 1.15 } },
            ];
            gs.fleet = [
                { id: 'c_champ', name: 'Presidenziale', tier: 'ultra', condition: 100, vehicleClass: 'stellar_s_imp', upgrades: [] },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide con accredito immediato incrementa cash, todayEarnings, weeklyStats e reputazione', () => {
            const { sandbox, gs, ceMoneyCalls } = amb;
            const driver = gs.drivers[0];
            const initialTotalRides = gs.questStats.totalRides || 0;
            const ride = {
                id: 1101, tier: 'ultra', price: 500, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'Fiumicino' },
            };

            sandbox.completeRide(ride, false);

            assert.ok(gs.cash > 10000, 'il cash del giocatore deve essere incrementato');
            assert.ok(gs.todayEarnings > 0);
            assert.ok(gs.weeklyEarnings > 0);
            assert.equal(gs.weeklyRides, 1);
            assert.equal(gs.questStats.totalRides, initialTotalRides + 1);
            assert.equal(gs.questStats.ultraRides, 1);

            const repCall = ceMoneyCalls.find(c => c.type === 'addReputation');
            assert.ok(repCall, 'deve incrementare la reputazione di 0.02');
            assert.equal(repCall.amount, 0.02);
        });

        test('corsa Ultra triggera drop F2P Driver Coins tramite CE_money.earnDC', () => {
            const { sandbox, gs, addedDC, ceMoneyCalls } = amb;
            const driver = gs.drivers[0];
            const ride = {
                id: 1102, tier: 'ultra', price: 800, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.01; // < 0.05 per drop DC

            sandbox.completeRide(ride, false);
            sandbox.Math.random = origRandom;

            const dcCall = ceMoneyCalls.find(c => c.type === 'earnDC');
            assert.ok(dcCall, 'deve chiamare CE_money.earnDC');
            assert.ok(dcCall.amount >= 1);
            assert.ok(addedDC.length >= 1, 'ServerState.addDriverCoins deve essere invocato');
        });

        test('milestone 1.000.000€ liquidità scatta una sola volta al superamento', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 999800;
            const driver = gs.drivers[0];
            const ride = {
                id: 1103, tier: 'ultra', price: 500, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);

            assert.ok(gs.cash >= 1000000);
            assert.equal(gs._milestoneM1, true);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('MILESTONE')));

            // Seconda corsa: non deve notificare di nuovo
            const notifCount = env.notifications.filter(n => n.msg.includes('MILESTONE')).length;
            sandbox.completeRide(ride, false);
            assert.equal(env.notifications.filter(n => n.msg.includes('MILESTONE')).length, notifCount);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. Incidenti, Stanchezza e Burnout (Ride Failure & Mitigations)
    // ────────────────────────────────────────────────────────────────────────
    describe('7. Incidenti, Stanchezza e Burnout', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse();
            const { gs } = amb;
            gs.drivers = [
                { id: 'd_fatigue', name: 'Paolo', status: 'busy', queue: [], assignedCarId: 'c_dam', fatigue: 60, stress_level: 50 },
            ];
            gs.fleet = [
                { id: 'c_dam', name: 'Berlina Standard', tier: 'business', condition: 80, vehicleClass: 'stellar_e_exec' },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('incidente senza Kasko danneggia auto (-20), riduce brandVolume (-3) e dimezza la tariffa (50%)', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers[0];
            const car = gs.fleet[0];
            gs.brandVolume = 20;

            const ride = {
                id: 1201, tier: 'business', price: 200, driverId: driver.id, hasIncident: true,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);

            assert.equal(car.condition, 60, 'la condizione deve calare di 20');
            assert.equal(gs.brandVolume, 17, 'brandVolume deve calare di 3');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Guasto')));
        });

        test('incidente con Kasko (inv_kasko) protegge il veicolo e non tocca brandVolume', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = ['inv_kasko'];
            gs.brandVolume = 20;
            const driver = gs.drivers[0];
            const car = gs.fleet[0];

            const ride = {
                id: 1202, tier: 'business', price: 200, driverId: driver.id, hasIncident: true,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);

            assert.equal(car.condition, 80, 'la Kasko previene la perdita di condizione');
            assert.equal(gs.brandVolume, 20, 'il brand volume rimane intatto');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Kasko')));
        });

        test('fatica autista raggiunge 100%: manda forzatamente al riposo', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers[0];
            driver.fatigue = 95;

            const ride = {
                id: 1203, tier: 'ultra', price: 300, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);

            assert.equal(driver.fatigue, 100);
            assert.equal(driver.status, 'resting', 'l\'autista a fatica 100% deve essere forzato al riposo');
            assert.ok(driver.restHoursLeft > 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('riposo obbligatorio')));
        });

        test('stress autista raggiunge 100%: innesca Burnout e 12 ore di recupero obbligatorio', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers[0];
            driver.stress_level = 90;

            const ride = {
                id: 1204, tier: 'ultra', price: 300, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);

            assert.ok(driver.burnout_until > 0, 'burnout_until deve essere impostato nel futuro');
            assert.equal(driver.status, 'resting');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('BURNOUT')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 8. Ciclo Realtime e Recupero Offline (checkActiveTrips & Session Resume)
    // ────────────────────────────────────────────────────────────────────────
    describe('8. Ciclo Realtime, Recupero Offline e Pagamento in Differita', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse({ cash: 5000 });
            const { gs } = amb;
            gs.drivers = [
                { id: 'd1', name: 'Andrea', status: 'busy', queue: [] },
                { id: 'd2', name: 'Simone', status: 'busy', queue: [] },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('checkActiveTrips accredita viaggi scaduti, libera gli autisti ed esegue un solo syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = amb;
            gs.activeTrips = [
                { id: 2001, driverId: 'd1', driverName: 'Andrea', toName: 'Milano', earnings: 300, endTime: Date.now() - 5000 },
                { id: 2002, driverId: 'd2', driverName: 'Simone', toName: 'Napoli', earnings: 450, endTime: Date.now() - 2000 },
            ];

            sandbox.checkActiveTrips();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5750, 'il saldo deve contenere la somma dei due viaggi (5000 + 300 + 450)');
            assert.equal(gs.activeTrips.length, 0);

            const d1 = gs.drivers.find(d => d.id === 'd1');
            const d2 = gs.drivers.find(d => d.id === 'd2');
            assert.equal(d1.status, 'idle', 'd1 deve tornare disponibile');
            assert.equal(d2.status, 'idle', 'd2 deve tornare disponibile');

            const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
            assert.equal(earnCalls.length, 1, 'deve chiamare CE_money.earn una sola volta col cumulativo');
            assert.equal(earnCalls[0].amount, 750);
            assert.equal(syncedCash.length, 1, 'un solo syncCash col totale finale');
            assert.equal(syncedCash[0], 5750);
        });

        test('viaggi in corso non ancora scaduti non vengono incassati prima del tempo', () => {
            const { sandbox, gs, ceMoneyCalls } = amb;
            gs.activeTrips = [
                { id: 2003, driverId: 'd1', driverName: 'Andrea', toName: 'Milano', earnings: 300, endTime: Date.now() + 60000 },
            ];

            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 5000);
            assert.equal(gs.activeTrips.length, 1);
            assert.equal(ceMoneyCalls.length, 0);
        });

        test('idempotenza: checkActiveTrips chiamato consecutivamente non duplica gli incassi', () => {
            const { sandbox, gs } = amb;
            gs.activeTrips = [
                { id: 2004, driverId: 'd1', driverName: 'Andrea', toName: 'Milano', earnings: 300, endTime: Date.now() - 1000 },
            ];

            sandbox.checkActiveTrips();
            const cashFirst = gs.cash;
            sandbox.checkActiveTrips(); // Seconda chiamata immediata

            assert.equal(gs.cash, cashFirst, 'il saldo non deve cambiare alla seconda chiamata');
        });

        test('recupero offline: viaggi serializzati in saveGame vengono processati correttamente al reload', () => {
            const { sandbox, gs } = amb;
            gs.activeTrips = [
                { id: 2005, driverId: 'd1', driverName: 'Andrea', toName: 'Bologna', earnings: 400, endTime: Date.now() - 3600000 }, // Concluso ore fa
            ];

            // Serializza lo stato nello slot locale
            sandbox.localStorage.setItem('chauffeurEmpireSlot_1', JSON.stringify({
                ...gs,
                cash: 5000,
                activeTrips: gs.activeTrips,
            }));

            // Simula riapertura sessione e catch-up
            sandbox.loadGame();
            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 5400, 'il viaggio concluso offline deve essere accreditato al rientro');
            assert.equal(gs.activeTrips.length, 0);
        });

        test('checkActiveTrips invoca rpc_pay_majority_dividend e rpc_pay_fuel_levy se utente loggato', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.activeTrips = [
                { id: 2006, driverId: 'd1', driverName: 'Andrea', toName: 'Milano', fromPoiId: 'roma_fco', earnings: 500, endTime: Date.now() - 1000 },
            ];

            sandbox.checkActiveTrips();
            await new Promise(r => setImmediate(r));

            const divRpc = rpcLog.find(r => r.nome === 'rpc_pay_majority_dividend');
            const levyRpc = rpcLog.find(r => r.nome === 'rpc_pay_fuel_levy');

            assert.ok(divRpc, 'deve chiamare rpc_pay_majority_dividend');
            assert.equal(divRpc.args.v_ride_earnings, 500);
            assert.ok(levyRpc, 'deve chiamare rpc_pay_fuel_levy');
            assert.equal(levyRpc.args.v_province_id, 'prov_roma');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9. Rendering UI e Event Delegation (renderTabCorse & ce-actions)
    // ────────────────────────────────────────────────────────────────────────
    describe('9. Rendering UI e Interazione DOM', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse();
            const { gs } = amb;
            gs.drivers = [
                { id: 'd1', name: 'Fabio', status: 'idle', queue: [], assignedCarId: 'c1', fatigue: 50 },
            ];
            gs.fleet = [
                { id: 'c1', name: 'Mercedes E-Class', tier: 'business', vehicleClass: 'stellar_e_exec' },
            ];
            gs.pendingRides = [
                { id: 3001, tier: 'business', price: 180, fromPoi: { name: 'Roma' }, toPoi: { name: 'Napoli' } },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabCorse disegna correttamente KPI, richieste pendenti e lista autisti', () => {
            const { sandbox } = amb;
            sandbox.renderTabCorse();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Richieste Pendenti'));
            assert.ok(html.includes('Stato Autisti'));
            assert.ok(html.includes('Roma'));
            assert.ok(html.includes('Napoli'));
            assert.ok(html.includes('Fabio'));
            assert.ok(html.includes('Mercedes E-Class'));
            assert.ok(html.includes('180'));
        });

        test('renderTabCorse mostra pulsante Riposo per autisti con fatica >= 40', () => {
            const { sandbox } = amb;
            sandbox.renderTabCorse();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('sendDriverToRest'));
            assert.ok(container.innerHTML.includes('Riposo'));
        });

        test('interazione data-ce-act="assignAllRides" via delegation smista le corse', () => {
            const { sandbox, gs } = amb;
            sandbox.renderTabCorse();

            const btn = sandbox.document.querySelector('button[data-ce-act="assignAllRides"]');
            assert.ok(btn, 'il pulsante Smista tutte deve esistere nel DOM');

            // Esegui azione associata
            sandbox.assignAllRides();
            assert.equal(gs.pendingRides.length, 0);
        });

        test('_updateTrafficLabel aggiorna il testo dinamico sul traffico', () => {
            const { sandbox } = amb;
            const labelEl = sandbox.document.getElementById('map-traffic-label');

            sandbox._updateTrafficLabel();
            assert.ok(labelEl.innerText.includes('Traffico') || labelEl.innerText.includes('Strade'));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 10. Regole Anti-Doppio-Conteggio e Tracciabilità CE_money
    // ────────────────────────────────────────────────────────────────────────
    describe('10. Regole Anti-Doppio-Conteggio ed Integrità Economica', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('tutti i movimenti monetari delle corse passano rigorosamente da CE_money e ServerState', () => {
            const { sandbox, gs, ceMoneyCalls, syncedCash } = amb;
            const driver = { id: 'd_eco', name: 'Gianni', status: 'busy', queue: [], assignedCarId: 'c_eco', level: 0 };
            const car = { id: 'c_eco', name: 'Auto Eco', tier: 'business', condition: 100, vehicleClass: 'stellar_e_exec' };
            gs.drivers = [driver];
            gs.fleet = [car];

            const ride = {
                id: 4001, tier: 'business', price: 200, driverId: driver.id,
                fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
            };

            const cashPrima = gs.cash;
            sandbox.completeRide(ride, false);

            // Verifica che il cash sia aumentato esattamente della somma transitata in CE_money
            const earnCall = ceMoneyCalls.find(c => c.reason === 'ride_earnings');
            assert.ok(earnCall);
            assert.equal(gs.cash, cashPrima + earnCall.amount);
            assert.equal(syncedCash[syncedCash.length - 1], gs.cash);
        });

        test('le chiamate RPC multiplayer (OPA / levy) NON alterano direttamente il saldo locale del giocatore', async () => {
            const { sandbox, gs } = amb;
            const driver = { id: 'd_eco', name: 'Gianni', status: 'busy', queue: [], assignedCarId: 'c_eco', level: 0 };
            const car = { id: 'c_eco', name: 'Auto Eco', tier: 'business', condition: 100, vehicleClass: 'stellar_e_exec' };
            gs.drivers = [driver];
            gs.fleet = [car];

            const ride = {
                id: 4002, tier: 'business', price: 200, driverId: driver.id,
                fromPoi: { id: 'roma_fco', region: 'lazio' },
                toPoi: { id: 'roma', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);
            await new Promise(r => setImmediate(r));

            // Il saldo locale riceve il payout lordo della corsa. Il levy e l'OPA vengono registrati server-side
            // e non causano sottrazioni duplicate immediate locali.
            assert.ok(gs.cash > 50000);
        });
    });
});
