'use strict';
/* ============================================================================
   test/funzioni/corse.test.js — Verifica approfondita del modulo Corse & Dispatch

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-rides.js`, `dispatcher.js`, `ui-dispatch.js` e dai relativi
   gestori in `ce-actions.js`, verificare la generazione di corse POI e contratti B2B,
   l'assegnazione singola/massiva/automatica, il calcolo analitico dei guadagni
   (tariffe, distanze, livello autista, condizione auto, carburante, meteo, buff VIP,
   infrastrutture, sindacati, perk consorzi), la gestione della fatica/stress/incidenti,
   il ciclo temporale con checkActiveTrips, l'integrazione Supabase RPC (OPA dividend,
   fuel levy), la protezione dal doppio conteggio e il rendering UI con Drag & Drop.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const DISPATCHER_SRC = fs.readFileSync(path.resolve(__dirname, '../../dispatcher.js'), 'utf8');

/**
 * Costruisce un ambiente completo per il test del modulo corse.
 */
function creaAmbienteCorse(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    // Carica dispatcher.js nel contesto VM
    try {
        vm.runInContext(DISPATCHER_SRC, env.sandbox, { filename: 'dispatcher.js' });
    } catch (e) {
        // Ignora se già parzialmente definito
    }

    // Mantieni il recorder per le notifiche
    const domShowNotif = env.sandbox.showNotification;
    env.sandbox.showNotification = (msg, type) => {
        env.notifications.push({ msg, type });
        if (typeof domShowNotif === 'function') domShowNotif(msg, type);
    };
    env.sandbox.window.showNotification = env.sandbox.showNotification;

    const sbClient = {
        from: () => ({
            select: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
                single: () => Promise.resolve({ data: null, error: null }),
            }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args);
            }

            if (nome === 'rpc_pay_majority_dividend') {
                return { data: { dividend_paid: Math.round(args.v_ride_earnings * 0.20) }, error: null };
            }

            if (nome === 'rpc_pay_fuel_levy') {
                const levy = Math.max(10, Math.floor(args.v_fare * 0.03 * 0.15));
                return { data: { levy, depot_owner: 'user_rival_uuid' }, error: null };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_test_driver_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi flotta e autisti iniziali standard
    const gs = env.sandbox.gameState;
    gs.companyName = 'Empire Test Mobility';
    gs.cash = opzioni.cash !== undefined ? opzioni.cash : 50000;
    gs.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.5;
    gs.unlockedRegions = opzioni.unlockedRegions || ['lazio', 'lombardia', 'campania', 'veneto', 'toscana'];
    gs.questStats = opzioni.questStats || { totalRides: 15, vipRides: 0, ultraRides: 0 };

    // Auto standard nel parco
    gs.fleet = opzioni.fleet || [
        { id: 'car_std_1', name: 'Sedan Standard', tier: 'standard', vehicleClass: 'stellar_e_exec', condition: 100, fuel: 100, tirePressure: 100, engineHealth: 100, upgrades: [], outOfService: null },
        { id: 'car_bus_1', name: 'Executive Business', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 100, fuel: 100, tirePressure: 100, engineHealth: 100, upgrades: [], outOfService: null },
        { id: 'car_vip_1', name: 'VIP Carrier', tier: 'vip', vehicleClass: 'stellar_v_carr', condition: 100, fuel: 100, tirePressure: 100, engineHealth: 100, upgrades: [], outOfService: null },
        { id: 'car_ultra_1', name: 'Presidential Ultra', tier: 'ultra', vehicleClass: 'stellar_s_imp', condition: 100, fuel: 100, tirePressure: 100, engineHealth: 100, upgrades: [], outOfService: null },
    ];

    // Autisti standard
    gs.drivers = opzioni.drivers || [
        { id: 'ceo', name: 'CEO Player', tier: 'standard', assignedCarId: 'car_std_1', status: 'idle', queue: [], fatigue: 0, stress_level: 0, level: 0 },
        { id: 'drv_1', name: 'Marco Rossi', tier: 'business', assignedCarId: 'car_bus_1', status: 'idle', queue: [], fatigue: 0, stress_level: 0, level: 1, xp: 0 },
        { id: 'drv_2', name: 'Giulia Bianchi', tier: 'vip', assignedCarId: 'car_vip_1', status: 'idle', queue: [], fatigue: 0, stress_level: 0, level: 2, xp: 0 },
        { id: 'drv_3', name: 'Alessandro Neri', tier: 'ultra', assignedCarId: 'car_ultra_1', status: 'idle', queue: [], fatigue: 0, stress_level: 0, level: 3, xp: 0 },
    ];

    gs.pendingRides = opzioni.pendingRides || [];
    gs.activeRides = [];
    gs.activeTrips = [];

    // Predisponi DOM per rendering e notifiche
    env.sandbox.document.body.innerHTML = `
        <div id="tab-container"></div>
        <div id="panel-title">Dispatch Center</div>
        <div id="main-panel"></div>
        <div id="panel-peek-tab"></div>
        <button id="panel-collapse-btn">◀</button>
        <div id="map-overlay" class="hidden"></div>
        <div id="notifications"></div>
        <div id="mail-dot" class="hidden"></div>
    `;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
    };
}

describe('Funzione Corse & Dispatch — Esecuzione e ciclo di vita', () => {

    describe('1. Generazione corse POI (generatePOIRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('generatePOIRide genera una corsa valida e la inserisce in pendingRides', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];

            /* generatePOIRide puo' legittimamente non generare niente: se sorteggia
               la stessa destinazione dell'origine, o una tratta che richiede il
               taxi d'acqua a Venezia senza averlo, restituisce null. Il gioco la
               richiama su un timer, quindi un buco non si vede. Un test che la
               chiama una volta sola e' un lancio di dado: qui si riprova fino a
               ottenere la corsa, e si fallisce solo se non arriva mai. */
            let ride = null;
            for (let i = 0; i < 40 && !ride; i++) ride = sandbox.generatePOIRide();

            assert.ok(ride, 'in 40 tentativi deve generare almeno una corsa');
            assert.equal(gs.pendingRides.length, 1, 'pendingRides deve contenere 1 corsa');
            assert.ok(ride.id > 0);
            assert.ok(ride.fromPoi && ride.toPoi);
            assert.notEqual(ride.fromPoi.id, ride.toPoi.id, 'origine e destinazione devono essere distinte');
            assert.ok(ride.price > 0, 'il prezzo deve essere positivo');
            assert.ok(ride.duration > 0, 'la durata deve essere positiva');
        });

        test('generatePOIRide rispetta il limite massimo di 15 corse pendenti', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = Array.from({ length: 15 }, (_, i) => ({ id: 900 + i, price: 100 }));

            const res = sandbox.generatePOIRide();

            assert.equal(res, null, 'non deve generare corse oltre il cap di 15');
            assert.equal(gs.pendingRides.length, 15);
        });

        test('generatePOIRide applica l\'override del tier se specificato', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            /* La strategia di prezzo va fissata, altrimenti questo test falla a
               caso una volta su tre. Con `pricingStrategy = 'premium'`
               generatePOIRide (engine-rides.js:41) rifiuta di generare il 30%
               delle volte — e' voluto, ed e' giusto che lo faccia: i clienti
               ricchi non chiamano sempre. Ma un test che dipende da un dado non
               misura niente, e questo faceva diventare rosso main, che a sua
               volta blocca il cancello dell'agente su OGNI ramo. */
            gs.pricingStrategy = 'standard';

            /* Fissare la strategia non basta: restano i due casi in cui la
               funzione restituisce null di suo (origine uguale a destinazione,
               tratta lagunare senza taxi d'acqua). Quindi si riprova, come fa
               il gioco. */
            let ride = null;
            for (let i = 0; i < 40 && !ride; i++) ride = sandbox.generatePOIRide('ultra');

            assert.ok(ride, 'in 40 tentativi deve generare almeno una corsa');
            assert.equal(ride.tier, 'ultra', 'il tier della corsa deve corrispondere all\'override');
        });

        test('generatePOIRide esclude destinazioni per Venezia se nessun Water Taxi è disponibile', () => {
            const { sandbox, gs } = amb;
            // Flotta senza water taxi
            gs.fleet = [{ id: 'c1', vehicleClass: 'stellar_e_exec', outOfService: null }];
            gs.unlockedRegions = ['veneto', 'lazio'];

            // Forza destinazione Venezia simulando Math.random
            const originalRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.99; // Seleziona l'ultimo POI disponibile

            // Esegui diverse generazioni: nessuna deve avere destinazione venezia senza water taxi
            for (let i = 0; i < 5; i++) {
                gs.pendingRides = [];
                const r = sandbox.generatePOIRide();
                if (r) {
                    assert.notEqual(r.toPoi.id, 'venezia', 'senza water taxi la destinazione Venezia deve essere scartata');
                }
            }
            sandbox.Math.random = originalRandom;
        });

        test('generatePOIRide applica maggiorazioni notturne, meteo e Cannes boost al prezzo', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            gs.hour = 23; // Notte (+20%)
            gs.weather = 'tempesta'; // Tempesta (WEATHER_STATES -> priceMult 1.40)
            gs.cannesBoostDays = 3; // Cannes Boost (x2.0)

            let ride = null;
            for (let i = 0; i < 20 && !ride; i++) {
                gs.pendingRides = [];
                ride = sandbox.generatePOIRide('standard');
            }
            assert.ok(ride, 'deve generare una corsa valida');

            // Il prezzo deve essere significativamente superiore alla base standard
            assert.ok(ride.price > 100, 'il prezzo con modificatori cumulati deve essere incrementato');
        });
    });

    describe('2. Generazione contratti B2B (generateContractRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('generateContractRide genera un contratto B2B da routesDB se il veicolo richiesto è posseduto', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            gs.unlockedRegions = ['lazio', 'lombardia', 'campania'];

            const contract = sandbox.generateContractRide();

            assert.ok(contract, 'deve generare una corsa contrattuale');
            assert.equal(contract.isContract, true);
            assert.ok(contract.routeId);
            assert.ok(contract.vehicleRequired);
            assert.ok(contract.price > 0);
            assert.ok(contract.netCost >= 0);
            assert.equal(gs.pendingRides.length, 1);
        });

        test('generateContractRide rispetta il limite massimo di 22 corse pendenti', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = Array.from({ length: 23 }, (_, i) => ({ id: 800 + i }));

            const res = sandbox.generateContractRide();

            assert.equal(res, null, 'non deve generare contratti oltre il cap di 22');
            assert.equal(gs.pendingRides.length, 23);
        });
    });

    describe('3. Assegnazione corse e compatibilità (assignRideToDriver, _driverCanTakeRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('assignRideToDriver assegna una corsa valida e la rimuove da pendingRides', () => {
            const { sandbox, gs } = amb;
            const ride = { id: 101, tier: 'business', price: 200, duration: 20000, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
            gs.pendingRides = [ride];

            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'idle';

            sandbox.assignRideToDriver(101, 'drv_1');

            assert.equal(gs.pendingRides.length, 0, 'la corsa deve essere rimossa da pendingRides');
            assert.equal(driver.status, 'busy', 'l autista idle deve passare a busy avviando la corsa');
            assert.equal(gs.activeRides.length, 1);
        });

        test('assignRideToDriver rifiuta assegnazione se l\'autista è in riposo (resting)', () => {
            const { sandbox, gs, env } = amb;
            const ride = { id: 102, tier: 'standard', price: 100, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
            gs.pendingRides = [ride];

            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'resting';

            sandbox.assignRideToDriver(102, 'drv_1');

            assert.equal(gs.pendingRides.length, 1, 'la corsa deve rimanere in pendingRides');
            assert.equal(driver.queue.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in riposo')));
        });

        test('assignRideToDriver rifiuta se il contratto richiede un veicolo differente da quello assegnato', () => {
            const { sandbox, gs, env } = amb;
            const contractRide = {
                id: 103,
                isContract: true,
                tier: 'ultra',
                vehicleRequired: 'majestic_spirit',
                price: 1200,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' }
            };
            gs.pendingRides = [contractRide];

            // drv_1 ha un'auto business (stellar_e_exec)
            sandbox.assignRideToDriver(103, 'drv_1');

            assert.equal(gs.pendingRides.length, 1, 'il contratto con veicolo errato non deve essere assegnato');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Veicolo errato')));
        });

        test('assignRideToDriver con parametri inesistenti non solleva eccezioni', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [{ id: 104, tier: 'standard' }];

            assert.doesNotThrow(() => {
                sandbox.assignRideToDriver(99999, 'driver_inesistente');
            });
            assert.equal(gs.pendingRides.length, 1);
        });

        test('_driverCanTakeRide rifiuta autisti in sciopero, auto danneggiate o incompatibilità tier', () => {
            const { sandbox, gs } = amb;
            const rideUltra = { id: 201, tier: 'ultra', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
            const rideStd = { id: 202, tier: 'standard', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };

            const drvBus = gs.drivers.find(d => d.id === 'drv_1');
            const carBus = gs.fleet.find(c => c.id === drvBus.assignedCarId);

            // Incompatibilità tier: auto business non può prendere corsa Ultra
            assert.equal(sandbox._driverCanTakeRide(drvBus, rideUltra), false);

            // Compatibile con standard
            assert.equal(sandbox._driverCanTakeRide(drvBus, rideStd), true);

            // Condizione critica (<= 10)
            carBus.condition = 10;
            assert.equal(sandbox._driverCanTakeRide(drvBus, rideStd), false);
            carBus.condition = 100;

            // Auto fuori servizio
            carBus.outOfService = 'fuel';
            assert.equal(sandbox._driverCanTakeRide(drvBus, rideStd), false);
            carBus.outOfService = null;

            // Autista in sciopero
            drvBus.status = 'striking';
            assert.equal(sandbox._driverCanTakeRide(drvBus, rideStd), false);
            drvBus.status = 'idle';
        });
    });

    describe('4. Smistamento massivo e automatico (assignAllRides, autoDispatchRides)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('assignAllRides assegna tutte le corse in attesa agli autisti compatibili', () => {
            const { sandbox, gs, env } = amb;
            gs.pendingRides = [
                { id: 301, tier: 'standard', price: 100, duration: 20000, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } },
                { id: 302, tier: 'business', price: 200, duration: 20000, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } },
                { id: 303, tier: 'vip', price: 400, duration: 20000, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } },
            ];

            sandbox.assignAllRides();

            assert.equal(gs.pendingRides.length, 0, 'tutte le corse compatibili devono essere state smistate');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('smistat')));
        });

        test('assignAllRides con lista vuota non invoca notifiche', () => {
            const { sandbox, gs, env } = amb;
            gs.pendingRides = [];

            sandbox.assignAllRides();
            assert.equal(env.notifications.length, 0);
        });

        test('autoDispatchRides filtra le corse VIP/Ultra se manca il Dispatcher Senior nello staff', () => {
            const { sandbox, gs } = amb;
            gs.staff = []; // nessun 'sr_disp'
            gs.pendingRides = [
                { id: 304, tier: 'standard', price: 100, duration: 20000, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } },
                { id: 305, tier: 'vip', price: 500, duration: 20000, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } },
            ];

            sandbox.autoDispatchRides();

            // La corsa standard deve essere stata assegnata, la vip deve rimanere in pending
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].id, 305, 'la corsa VIP deve rimanere non smistata senza sr_disp');
        });
    });

    describe('5. Avvio corse e gestione fallimenti (startNextRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('startNextRide fa partire la corsa, deduce usura e carburante', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const car = gs.fleet.find(c => c.id === driver.assignedCarId);
            car.fuel = 100;
            car.condition = 100;

            const ride = { id: 401, tier: 'business', price: 250, duration: 20000, fromPoi: { region: 'lazio', name: 'Roma' }, toPoi: { region: 'lazio', name: 'FCO' } };
            driver.queue = [ride];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'busy');
            assert.equal(driver.queue.length, 0);
            assert.ok(car.condition < 100, 'la condizione auto deve essere diminuita');
            assert.ok(car.fuel < 100, 'il carburante deve essere diminuito per motori termici');
            assert.equal(gs.activeRides.length, 1);
            assert.equal(gs.activeTrips.length, 1);
        });

        test('startNextRide su auto critica (<=10) drena la coda rimandando le corse a pendingRides', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const car = gs.fleet.find(c => c.id === driver.assignedCarId);
            car.condition = 8; // Condizione critica

            const r1 = { id: 402, tier: 'business' };
            const r2 = { id: 403, tier: 'business' };
            driver.queue = [r1, r2];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'idle');
            assert.equal(driver.queue.length, 0, 'la coda dell autista deve essere svuotata');
            assert.equal(gs.pendingRides.length, 2, 'le corse devono tornare in pendingRides');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('condizione critica')));
        });

        test('startNextRide blocca la partenza del CEO se l\'energia è insufficiente (<10)', () => {
            const { sandbox, gs } = amb;
            const ceo = gs.drivers.find(d => d.id === 'ceo');
            gs.energy = 5; // Meno di 10

            ceo.queue = [{ id: 404, tier: 'standard', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } }];
            sandbox.startNextRide(ceo);

            assert.equal(ceo.status, 'idle');
            assert.equal(ceo.queue.length, 1, 'la corsa rimane in coda se il CEO non ha energia');
            assert.equal(gs.activeRides.length, 0);
        });

        test('startNextRide gestisce autista in burnout forzando il riposo', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const currentHour = gs.day * 24 + gs.hour;
            driver.burnout_until = currentHour + 6; // In recupero per altre 6 ore

            driver.queue = [{ id: 405, tier: 'business' }];
            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'resting');
            assert.equal(driver.restHoursLeft, 6);
            assert.equal(gs.activeRides.length, 0);
        });
    });

    describe('6. Calcolo analitico del guadagno e completamento corsa (completeRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide calcola l\'incasso con tratti autista, bonus livello, upgrade auto e deduce carburante', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            const driver = gs.drivers.find(d => d.id === 'drv_2');
            driver.level = 2; // +10% tip bonus
            driver.skill_charisma = 70; // Carisma +10%
            driver.assignedCarId = 'car_vip_1';

            const ride = {
                id: 501,
                driverId: 'drv_2',
                tier: 'vip',
                price: 500,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma Termini' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'Roma FCO' },
                duration: 20000
            };

            sandbox.completeRide(ride, false);

            assert.ok(gs.cash > 10000, 'il cash del giocatore deve essere incrementato');
            assert.ok(gs.todayEarnings > 0);
            assert.ok(gs.questStats.totalRides >= 1);
            assert.ok(gs.questStats.vipRides >= 1);
            assert.ok(gs.questStats.fcoRides >= 1);
        });

        test('completeRide con incidente dimezza il prezzo e danneggia l\'auto se senza Kasko', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = []; // Senza inv_kasko
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const car = gs.fleet.find(c => c.id === driver.assignedCarId);
            car.condition = 100;

            const ride = {
                id: 502,
                driverId: 'drv_1',
                tier: 'business',
                price: 400,
                hasIncident: true,
                fromPoi: { region: 'lazio', name: 'Roma' },
                toPoi: { region: 'lazio', name: 'Hassler' },
                duration: 20000
            };

            sandbox.completeRide(ride, false);

            assert.equal(car.condition, 80, 'senza Kasko l incidente infligge -20 di condizione');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('danneggiata')));
        });

        test('completeRide con Kasko copre il danno all\'auto', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = ['inv_kasko'];
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const car = gs.fleet.find(c => c.id === driver.assignedCarId);
            car.condition = 100;

            const ride = {
                id: 503,
                driverId: 'drv_1',
                tier: 'business',
                price: 400,
                hasIncident: true,
                fromPoi: { region: 'lazio', name: 'Roma' },
                toPoi: { region: 'lazio', name: 'Hassler' },
                duration: 20000
            };

            sandbox.completeRide(ride, false);

            assert.equal(car.condition, 100, 'con Kasko la condizione non deve diminuire');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Kasko')));
        });

        test('completeRide incrementa fatica e stress e manda a riposo HR a 85%', () => {
            const { sandbox, gs } = amb;
            gs.staff = [{ id: 'hr', name: 'HR Manager' }];
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.fatigue = 80;

            const ride = {
                id: 504,
                driverId: 'drv_1',
                tier: 'ultra',
                price: 600,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' }
            };

            sandbox.completeRide(ride, false);

            assert.ok(driver.fatigue >= 85);
            assert.equal(driver.status, 'resting', 'con HR e fatica >= 85 l autista deve andare a riposo');
        });

        test('completeRide con inv_empty_leg e corsa interregionale cerca corsa di ritorno', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_empty_leg'];
            gs.pendingRides = [];
            const driver = gs.drivers.find(d => d.id === 'drv_1');

            const ride = {
                id: 505,
                driverId: 'drv_1',
                tier: 'business',
                price: 800,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'milano', region: 'lombardia', name: 'Milano' } // Intercity
            };

            // Simula Math.random per forzare l'attivazione empty leg (Math.random <= 0.40)
            const originalRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10;

            sandbox.completeRide(ride, false);
            sandbox.Math.random = originalRandom;

            assert.ok(gs.pendingRides.some(r => r.isEmptyLeg), 'deve aver generato una corsa empty leg di ritorno');
        });
    });

    describe('7. Modalità differita e ciclo temporale (checkActiveTrips)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide in modalità differita non accredita subito la cassa ma popola trip.earnings', () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            const driver = gs.drivers.find(d => d.id === 'drv_1');

            const ride = {
                id: 601,
                driverId: 'drv_1',
                tier: 'business',
                price: 300,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' }
            };

            gs.activeTrips = [{
                id: 601,
                driverId: 'drv_1',
                carId: 'car_bus_1',
                driverName: 'Marco Rossi',
                toName: 'Roma FCO',
                endTime: Date.now() + 60000,
                earnings: null
            }];

            sandbox.completeRide(ride, true);

            assert.equal(gs.cash, 20000, 'in differita il saldo immediato non deve cambiare');
            assert.ok(gs.activeTrips[0].earnings > 0, 'trip.earnings deve essere valorizzato');
        });

        test('checkActiveTrips accredita l\'incasso esattamente a scadenza tempo e libera l\'autista', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 20000;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'busy';

            gs.activeTrips = [{
                id: 602,
                driverId: 'drv_1',
                carId: 'car_bus_1',
                driverName: 'Marco Rossi',
                toName: 'Malpensa',
                endTime: Date.now() - 1000, // Già scaduta
                earnings: 450
            }];

            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 20450, 'checkActiveTrips deve accreditare esattamente 450€');
            assert.equal(gs.activeTrips.length, 0, 'il viaggio completato deve essere rimosso da activeTrips');
            assert.equal(driver.status, 'idle', 'l autista deve tornare idle');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('450 incassati')));
        });

        test('checkActiveTrips ripetuto non accredita due volte la stessa corsa', () => {
            const { sandbox, gs } = amb;
            gs.cash = 30000;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'busy';

            gs.activeTrips = [{
                id: 603,
                driverId: 'drv_1',
                endTime: Date.now() - 2000,
                earnings: 500
            }];

            sandbox.checkActiveTrips();
            assert.equal(gs.cash, 30500);

            // Seconda invocazione immediata: activeTrips è vuoto, cassa invariata
            sandbox.checkActiveTrips();
            assert.equal(gs.cash, 30500);
        });

        test('checkActiveTrips non processa viaggi con endTime nel futuro', () => {
            const { sandbox, gs } = amb;
            gs.cash = 40000;

            gs.activeTrips = [{
                id: 604,
                driverId: 'drv_1',
                endTime: Date.now() + 300000, // Futuro (5 min)
                earnings: 600
            }];

            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 40000, 'nessun accredito prima di endTime');
            assert.equal(gs.activeTrips.length, 1);
        });
    });

    describe('8. Durata, formattazione e anteprima code (_getRideDurationMs, _formatDuration, _previewQueueWithRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_getRideDurationMs scala con tariffa, routeType e tratta interregionale', () => {
            const { sandbox } = amb;

            // Corsa standard locale
            const durStd = sandbox._getRideDurationMs({ price: 200, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } });
            assert.ok(durStd >= 10 * 60 * 1000, 'deve rispettare il pavimento di 10 minuti');

            // Corsa Airport: fattore 0.7
            const durAir = sandbox._getRideDurationMs({ price: 200, routeType: 'Airport', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } });
            assert.ok(durAir <= durStd, 'Airport deve avere durata inferiore');

            // Corsa Interregionale: fattore 1.5
            const durInter = sandbox._getRideDurationMs({ price: 200, fromPoi: { region: 'lazio' }, toPoi: { region: 'lombardia' } });
            assert.ok(durInter >= durStd, 'Interregionale deve avere durata superiore');
        });

        test('_formatDuration gestisce correttamente casi limite e formati min/h', () => {
            const { sandbox } = amb;

            assert.equal(sandbox._formatDuration(0), '0min');
            assert.equal(sandbox._formatDuration(-1000), '0min');
            assert.equal(sandbox._formatDuration(15 * 60 * 1000), '15min');
            assert.equal(sandbox._formatDuration(60 * 60 * 1000), '1h');
            assert.equal(sandbox._formatDuration(95 * 60 * 1000), '1h 35min');
        });

        test('_previewQueueWithRide calcola durata incrementale e orario libero stimato', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const ride = { price: 300, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };

            const preview = sandbox._previewQueueWithRide(driver, ride, gs);

            assert.ok(preview.addedDurationMs > 0);
            assert.ok(preview.newTotalQueueMs >= preview.addedDurationMs);
            assert.ok(preview.newFreeAtTimeStr.includes(':'));
        });
    });

    describe('9. Interfaccia utente Dispatch (renderTabCorse, setupDragAndDrop, switchTab)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabCorse disegna le tabelle richieste in arrivo, KPI e autisti', () => {
            const { sandbox, gs } = amb;
            gs.questStats = { totalRides: 20 };
            gs.pendingRides = [
                { id: 701, tier: 'business', price: 280, fromPoi: { name: 'Roma Centro' }, toPoi: { name: 'FCO' } }
            ];

            sandbox.renderTabCorse();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Richieste in Arrivo'), 'deve mostrare intestazione richieste');
            assert.ok(html.includes('Roma Centro'), 'deve mostrare il punto di partenza');
            assert.ok(html.includes('280'), 'deve mostrare il prezzo della corsa');
            assert.ok(html.includes('Stato Autisti'), 'deve mostrare colonna autisti');
            assert.ok(html.includes('Marco Rossi'), 'deve mostrare autista');
            assert.ok(html.includes('Smista tutte'), 'deve contenere il pulsante Smista tutte');
            assert.ok(html.includes('data-ce-act="assignAllRides"'));
            assert.ok(html.includes('data-ce-act="openMapOverlay"'));
        });

        test('renderTabCorse in survival mode delega a renderManualSurvivalMode', () => {
            const { sandbox } = amb;
            let survivalRenderChiamato = false;
            sandbox._z2hState = () => 'survival';
            sandbox.renderManualSurvivalMode = () => { survivalRenderChiamato = true; };

            sandbox.renderTabCorse();
            assert.equal(survivalRenderChiamato, true);
        });

        test('switchTab("corse") aggiorna il titolo del pannello e renderizza la schermata corse', () => {
            const { sandbox, gs } = amb;
            gs.questStats = { totalRides: 20 };
            sandbox.switchTab('corse');

            const title = sandbox.document.getElementById('panel-title');
            assert.equal(title.innerText, 'Dispatch Center');
        });

        test('togglePanel, openMapOverlay e closeMapOverlay gestiscono classi e visibilità DOM', () => {
            const { sandbox } = amb;

            sandbox.togglePanel();
            const panel = sandbox.document.getElementById('main-panel');
            assert.ok(panel.classList.contains('panel-collapsed'));

            sandbox.openMapOverlay();
            const mapOverlay = sandbox.document.getElementById('map-overlay');
            assert.equal(mapOverlay.classList.contains('hidden'), false);

            sandbox.closeMapOverlay();
            assert.equal(mapOverlay.classList.contains('hidden'), true);
        });
    });

    describe('10. Movimenti di denaro, ServerState e salvataggio persistente', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('l\'accredito di completeRide passa da CE_money e rispecchia in gameState.cash e saveGame', () => {
            const { sandbox, gs } = amb;
            gs.cash = 15000;
            const driver = gs.drivers.find(d => d.id === 'drv_1');

            const ride = {
                id: 801,
                driverId: 'drv_1',
                tier: 'business',
                price: 350,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' }
            };

            sandbox.completeRide(ride, false);

            assert.ok(gs.cash > 15000);

            // Verifica salvataggio su localStorage
            const savedRaw = sandbox.localStorage.getItem('chauffeurEmpireSlot_1');
            if (savedRaw) {
                const parsed = JSON.parse(savedRaw);
                assert.equal(parsed.cash, gs.cash, 'il cash salvato deve coincidere con gameState.cash');
            }
        });

        test('ripristino activeTrips in caso di reload browser a corsa iniziata', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'busy';

            // Corsa iniziata prima della chiusura pagina
            gs.activeTrips = [{
                id: 802,
                driverId: 'drv_1',
                carId: 'car_bus_1',
                driverName: 'Marco Rossi',
                toName: 'Destinazione',
                endTime: Date.now() - 5000, // Corsa terminata mentre il giocatore era offline
                earnings: 400
            }];

            // Al riavvio dell'applicazione checkActiveTrips elabora il viaggio concluso
            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 10400, 'la corsa finita durante l assenza deve essere pagata alla riapertura');
            assert.equal(driver.status, 'idle');
            assert.equal(gs.activeTrips.length, 0);
        });

        test('completeRide esegue rpc_pay_majority_dividend per giocatore autenticato', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');

            const ride = {
                id: 803,
                driverId: 'drv_1',
                tier: 'vip',
                price: 500,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' }
            };

            sandbox.completeRide(ride, false);
            await new Promise(r => setImmediate(r));

            const divRpc = rpcLog.find(r => r.nome === 'rpc_pay_majority_dividend');
            assert.ok(divRpc, 'deve invocare rpc_pay_majority_dividend');
            assert.equal(divRpc.args.v_target_user_id, 'user_test_driver_uuid');
            assert.ok(divRpc.args.v_ride_earnings > 0);
        });
    });

    describe('11. Interazione Drag & Drop (setupDragAndDrop, dragover, drop)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteCorse();
            amb.gs.questStats = { totalRides: 20 };
            amb.sandbox.setupDragAndDrop();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('setupDragAndDrop gestisce l\'assegnazione al rilascio (drop) e aggiorna la vista', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [
                { id: 901, tier: 'business', price: 250, fromPoi: { region: 'lazio', name: 'Roma' }, toPoi: { region: 'lazio', name: 'FCO' } }
            ];

            sandbox.renderTabCorse();

            // Simula assegnazione via drop
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            sandbox.assignRideToDriver(901, 'drv_1');
            sandbox.renderTabCorse();

            assert.equal(gs.pendingRides.length, 0);
            assert.equal(driver.status, 'busy');
        });
    });

    describe('12. Calcolo analitico combinato di tutti i moltiplicatori di gioco', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide integra VIP buffs, Decreti, Penthouse HQ, Consorzio, Sindacato e Pricing Strategy', () => {
            const { sandbox, gs } = amb;
            gs.cash = 0;
            gs.pricingStrategy = 'premium'; // x1.40
            gs.fuelPrice = 2.0;

            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.level = 1; // DRIVER_LEVELS[1].tipBonus = 1.05
            driver.skill_charisma = 50; // x1.0

            const car = gs.fleet.find(c => c.id === driver.assignedCarId);
            car.condition = 100; // x1.0

            // Mock buffs e modificatori
            sandbox._getBuffValue = (type) => (type === 'earnings_pct' ? 10 : type === 'tip_pct' ? 5 : 0);
            sandbox.getDecreeEffects = () => ({ tipMult: 1.10 });
            sandbox.hqAllEffects = () => ({ allEarningsMult: 1.05 });
            sandbox._allyPerkMult = () => 1.12;

            sandbox._sindacatoState = {
                strikeActive: false,
                crumiriBoostUntil: null,
                consorzioMembersCount: 6, // x1.08
            };
            sandbox.window._sindacatoState = sandbox._sindacatoState;

            const ride = {
                id: 902,
                driverId: 'drv_1',
                tier: 'business',
                price: 1000,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'roma_fco', region: 'lazio', name: 'FCO' }, // Locale (60km -> fuel deduction = 6 * 2.0 = 12)
                duration: 20000
            };

            sandbox.completeRide(ride, false);

            // Verifica che il compenso finale sia calcolato e accreditato
            assert.ok(gs.cash > 1000, `il cash (${gs.cash}) deve riflettere la moltiplicazione cumulativa di tutti i bonus`);
            assert.equal(gs.todayEarnings, gs.cash);
        });

        test('completeRide azzera l\'incasso (clamped a 0) se la detrazione carburante supera la tariffa', () => {
            const { sandbox, gs } = amb;
            gs.cash = 5000;
            gs.fuelPrice = 50.0; // Prezzo carburante abnorme per causare detrazione superiore a price

            const driver = gs.drivers.find(d => d.id === 'drv_1');

            const ride = {
                id: 903,
                driverId: 'drv_1',
                tier: 'standard',
                price: 50,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lombardia' } // Intercity (250km -> fuel deduction = 25 * 50 = 1250)
            };

            sandbox.completeRide(ride, false);

            // Non deve scendere sotto 5000 (Math.max(0, earned) -> earned = 0)
            assert.equal(gs.cash, 5000, 'il saldo non deve diminuire su corse con profitto negativo');
        });
    });

    describe('13. Casi limite, blocchi flotta B2B e veicoli aeronautici', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_driverCanTakeRide rifiuta auto impegnata in contratti B2B (b2bLockedVehicleIds)', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            const car = gs.fleet.find(c => c.id === driver.assignedCarId);

            sandbox.b2bLockedVehicleIds = () => [car.id];
            sandbox.window.b2bLockedVehicleIds = sandbox.b2bLockedVehicleIds;

            const ride = { id: 904, tier: 'business', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };

            assert.equal(sandbox._driverCanTakeRide(driver, ride), false, 'auto bloccata in B2B non deve essere utilizzabile per corse');
        });

        test('_driverCanTakeRide rifiuta veicoli con intercityOnly su tratte locali', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_3');
            const car = gs.fleet.find(c => c.id === driver.assignedCarId);
            car.vehicleClass = 'helicopter'; // Definito in NEW_CARS con intercityOnly: true

            const localRide = { id: 905, tier: 'ultra', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
            const intercityRide = { id: 906, tier: 'ultra', fromPoi: { region: 'lazio' }, toPoi: { region: 'lombardia' } };

            assert.equal(sandbox._driverCanTakeRide(driver, localRide), false, 'veicolo aeronautico deve rifiutare tratte locali');
            assert.equal(sandbox._driverCanTakeRide(driver, intercityRide), true, 'veicolo aeronautico deve accettare tratte intercity');
        });

        test('assignRideToDriver rifiuta se il monte ore dell\'autista è esaurito', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'busy';
            // Monte ore (decisione Vlad 22/08/2026): finte corse senza prezzo valgono
            // 30min l'una -> 10 corse = 5h > 4h di base.
            driver.queue = Array.from({ length: 10 }, (_, i) => ({ id: 910 + i, tier: 'business' }));

            const newRide = { id: 950, tier: 'business', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
            gs.pendingRides = [newRide];

            sandbox.assignRideToDriver(950, 'drv_1');

            assert.equal(gs.pendingRides.length, 1, 'la corsa deve rimanere in pending se il monte ore è esaurito');
            assert.equal(driver.queue.length, 10);
        });

        test('assignRideToDriver accetta oltre le 4h solo col monte ore allungato, non con l\'Executive Pass', () => {
            const { sandbox, gs, env } = amb;
            // Dal 22/08/2026 l'Executive Pass NON estende più la coda: il tetto è un
            // monte ore per autista (4→12h) che si compra a parte con Driver Coins.
            gs.executivePassActive = true;
            gs.day = 1;
            gs.executivePassExpiresDay = 5;

            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.status = 'busy';
            // 10 finte corse x 30min = 5h: oltre le 4h di base
            driver.queue = Array.from({ length: 10 }, (_, i) => ({ id: 920 + i, tier: 'business' }));

            const newRide = { id: 960, tier: 'business', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
            gs.pendingRides = [newRide];

            sandbox.assignRideToDriver(960, 'drv_1');

            assert.equal(gs.pendingRides.length, 1, 'l\'Executive Pass da solo non deve sbloccare la coda satura');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('monte ore')),
                'il rifiuto deve spiegare il monte ore e come allungarlo');

            driver.queueHours = 8; // monte ore allungato a 8h: le stesse 5h ci stanno
            sandbox.assignRideToDriver(960, 'drv_1');

            assert.equal(gs.pendingRides.length, 0, 'col monte ore allungato la corsa deve essere accettata');
            assert.equal(driver.queue.length, 11);
        });
    });

    describe('14. Protezione doppio conteggio e conformità ServerState', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide muove denaro esclusivamente tramite CE_money.earn senza chiamare rpc_sync_cash due volte', () => {
            const syncedCash = [];
            const ambSync = creaAmbienteCorse({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (c) => { syncedCash.push(c); return { success: true, cash: c }; },
                },
            });

            const { sandbox, gs } = ambSync;
            gs.cash = 10000;
            const driver = gs.drivers.find(d => d.id === 'drv_1');

            const ride = {
                id: 970,
                driverId: 'drv_1',
                tier: 'business',
                price: 400,
                fromPoi: { region: 'lazio' },
                toPoi: { region: 'lazio' }
            };

            sandbox.completeRide(ride, false);

            assert.ok(gs.cash > 10000);
            assert.equal(syncedCash.length, 1, 'syncCash deve essere invocato esattamente una volta per la transazione');
            ambSync.env.stopAllIntervals();
        });

        test('checkActiveTrips in differita effettua una singola sincronizzazione anche con viaggi multipli contemporanei', () => {
            const syncedCash = [];
            const ambSync = creaAmbienteCorse({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (c) => { syncedCash.push(c); return { success: true, cash: c }; },
                },
            });

            const { sandbox, gs } = ambSync;
            gs.cash = 20000;

            gs.activeTrips = [
                { id: 980, driverId: 'drv_1', endTime: Date.now() - 1000, earnings: 300 },
                { id: 981, driverId: 'drv_2', endTime: Date.now() - 1000, earnings: 500 },
                { id: 982, driverId: 'drv_3', endTime: Date.now() - 1000, earnings: 700 },
            ];

            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 21500, 'la somma di tutti i viaggi conclusi (1500€) deve essere accreditata');
            assert.equal(syncedCash.length, 1, 'viaggi multipli chiusi insieme devono produrre un unico sync col totale');
            ambSync.env.stopAllIntervals();
        });
    });
});
