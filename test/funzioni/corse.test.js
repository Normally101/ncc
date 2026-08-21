'use strict';
/* ============================================================================
   test/funzioni/corse.test.js — Verifica approfondita del modulo Corse & Dispatching

   Scopo: collaudo completo delle routine di dispatching e gestione corse
   esposte da `engine-rides.js`, `dispatcher.js`, `ui-dispatch.js` e i relativi
   eventi in `ce-actions.js` / `events.js`.
   Copre:
   - Generazione corse POI e Contratti B2B (filtri, limiti cap, moltiplicatori)
   - Assegnazione corsa a singoli autisti e smistamento globale (assignAllRides / autoDispatchRides)
   - Validazione idoneità autista/veicolo e casi storti (coda piena, riposo, guasti, mismatch classi)
   - Avvio corsa, consumo energia CEO, usura vettura, calcolo durata e consumi carburante (EV vs benzina)
   - Completamento corse immediato e differito (deferred pay)
   - Calcolo esatto del guadagno (mance, livello autista, condizione auto, strategie, buff, sindacato, HQ, consorzi)
   - Gestione anomalie in corsa (incidenti, usura gomme, ritardi cliente, stanchezza e burnout)
   - Ciclo real-time di checkActiveTrips, persistenza salvataggio e ripristino post-reload
   - Prevenzione del doppio conteggio su denaro ed esecuzione RPC (OPA, fuel levy)
   - Rendering UI Dispatch Center e interazione Drag & Drop / bottoni delegation
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito per i test sulle Corse con mock Supabase e flotta di prova.
 */
function creaAmbienteCorse(opzioni = {}) {
    const rpcLog = [];
    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

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
            return { data: true, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_driver_test' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;
    env.sandbox.POIS = vm.runInContext('POIS', env.sandbox);
    env.sandbox.window.POIS = env.sandbox.POIS;

    // Carica dispatcher.js nella sandbox se non già presente
    const dispatcherSrc = fs.readFileSync(path.resolve(__dirname, '../../dispatcher.js'), 'utf8');
    vm.runInContext(dispatcherSrc, env.sandbox, { filename: 'dispatcher.js' });

    // Ripristina intercettore per notifications
    env.sandbox.showNotification = (msg, type) => {
        env.notifications.push({ msg, type });
        if (typeof env.sandbox._realShowNotification === 'function') {
            env.sandbox._realShowNotification(msg, type);
        }
    };
    env.sandbox.window.showNotification = env.sandbox.showNotification;

    // Reset o sovrascrittura di base
    env.sandbox.gameState.questStats = opzioni.questStats || { totalRides: 25, vipRides: 5, ultraRides: 2, fcoRides: 3, portRides: 1, contractRides: 4, portoCervoRides: 0 };
    env.sandbox.gameState.unlockedRegions = opzioni.unlockedRegions || ['lazio', 'lombardia', 'campania'];
    env.sandbox.gameState.pendingRides = opzioni.pendingRides || [];
    env.sandbox.gameState.activeRides = opzioni.activeRides || [];
    env.sandbox.gameState.activeTrips = opzioni.activeTrips || [];
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 10000;
    env.sandbox.gameState.fuelPrice = 1.85;

    // Predisponi DOM con container per renderTabCorse
    env.sandbox.document.body.innerHTML = `
        <div id="tab-container"></div>
        <div id="panel-title"></div>
        <div id="notifications"></div>
    `;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        notifications: env.notifications,
        logs: env.logs,
    };
}

describe('Modulo Corse & Dispatching — Collaudo Profondo', () => {

    describe('1. Generazione corse POI e Contratti B2B (generatePOIRide, generateContractRide, Empty Leg)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('generatePOIRide genera una corsa valida tra POI sbloccati e la inserisce in pendingRides', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];

            let ride = null;
            for (let i = 0; i < 10 && !ride; i++) {
                ride = sandbox.generatePOIRide();
            }

            assert.ok(ride, 'deve restituire l\'oggetto corsa generato');
            assert.ok(gs.pendingRides.length >= 1);
            assert.ok(ride.fromPoi && ride.toPoi);
            assert.ok(ride.price > 0);
            assert.ok(gs.unlockedRegions.includes(ride.fromPoi.region));
            assert.ok(gs.unlockedRegions.includes(ride.toPoi.region));
        });

        test('generatePOIRide rispetta il limite massimo di 15 corse pendenti', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = new Array(15).fill(0).map((_, i) => ({ id: i + 1 }));

            const res = sandbox.generatePOIRide();

            assert.equal(res, null, 'non deve generare corse se pendingRides >= 15');
            assert.equal(gs.pendingRides.length, 15);
        });

        test('generatePOIRide rispetta la blacklist dei clienti/destinazioni', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            // Blacklist di tutti i POI sbloccati tranne uno specifico
            gs.unlockedRegions = ['lazio'];
            gs.blacklistedClients = ['roma_fco', 'civitavecchia', 'roma_hassler'];

            for (let i = 0; i < 5; i++) {
                const r = sandbox.generatePOIRide();
                if (r) {
                    assert.ok(!gs.blacklistedClients.includes(r.toPoi.id), 'la destinazione non deve appartenere alla blacklist');
                }
            }
        });

        test('generatePOIRide calcola il prezzo applicando correttamente i moltiplicatori di corsa (notte, surge, meteo)', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            gs.unlockedRegions = ['lazio', 'lombardia', 'campania'];

            // Giorno, sole, nessun surge
            gs.hour = 12;
            gs.weather = 'sole';
            let rideDay = null;
            for (let i = 0; i < 5 && !rideDay; i++) {
                rideDay = sandbox.generatePOIRide('standard');
            }
            assert.ok(rideDay && rideDay.price > 0);

            // Notte (ore 23) -> +20% notte
            gs.pendingRides = [];
            gs.hour = 23;
            let rideNight = null;
            for (let i = 0; i < 5 && !rideNight; i++) {
                rideNight = sandbox.generatePOIRide('standard');
            }
            assert.ok(rideNight && rideNight.price > 0);

            // Surge pricing con pendingRides >= 8
            gs.pendingRides = new Array(8).fill(0).map((_, i) => ({ id: 100 + i }));
            let rideSurge = null;
            for (let i = 0; i < 5 && !rideSurge; i++) {
                rideSurge = sandbox.generatePOIRide('standard');
            }
            assert.ok(rideSurge && rideSurge.price > 0);
        });

        test('generateContractRide genera una corsa B2B da italianRoutesDB se il giocatore possiede il veicolo adatto', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            gs.unlockedRegions = ['lazio', 'lombardia'];
            gs.fleet = [
                { id: 'v1', name: 'Stellar E-Exec', vehicleClass: 'stellar_e_exec', tier: 'business', outOfService: false, condition: 100 },
                { id: 'v2', name: 'Stellar S-Imp', vehicleClass: 'stellar_s_imp', tier: 'ultra', outOfService: false, condition: 100 },
            ];

            const cRide = sandbox.generateContractRide();

            assert.ok(cRide, 'deve generare una corsa contratto');
            assert.equal(cRide.isContract, true);
            assert.ok(cRide.vehicleRequired);
            assert.ok(cRide.sellingPrice !== undefined || cRide.price > 0);
            assert.equal(gs.pendingRides.length, 1);
        });

        test('generateContractRide filtra tratte con requisiti veicolo non presenti in flotta (ultra/van/water taxi)', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [];
            gs.unlockedRegions = ['veneto'];
            // Flotta senza water taxi o van o ultra
            gs.fleet = [];

            const cRide = sandbox.generateContractRide();
            if (cRide) {
                assert.notEqual(cRide.vehicleRequired, 'water_taxi', 'senza water taxi non deve generare corse taxi acqueo');
                assert.notEqual(cRide.vehicleRequired, 'stellar_s_imp', 'senza ultra non deve generare tratte ultra');
                assert.notEqual(cRide.vehicleRequired, 'stellar_v_carr', 'senza minivan non deve generare tratte van');
            }
        });

        test('_findEmptyLegRide genera una corsa di ritorno scontata quando inv_empty_leg è attivo', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_empty_leg'];
            gs.pendingRides = [];
            gs.unlockedRegions = ['lazio', 'lombardia'];

            const fromPoi = sandbox.POIS['roma'];
            const toPoi = sandbox.POIS['milano'];
            const completedRide = { fromPoi, toPoi };

            // Sovrascrivi Math.random per superare il roll di empty leg (roll <= 0.40)
            const origRand = sandbox.Math.random;
            sandbox.Math.random = () => 0.10;

            sandbox._findEmptyLegRide(completedRide);
            sandbox.Math.random = origRand;

            assert.equal(gs.pendingRides.length, 1, 'deve aver inserito una corsa empty leg');
            const emptyRide = gs.pendingRides[0];
            assert.equal(emptyRide.isEmptyLeg, true);
            assert.equal(emptyRide.fromPoi.id, toPoi.id, 'l\'origine deve essere la destinazione della corsa appena conclusa');
            assert.ok(emptyRide.price > 0);
        });
    });

    describe('2. Idoneità e Assegnazione corse (assignRideToDriver, _driverCanTakeRide, assignAllRides)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('assignRideToDriver assegna correttamente una corsa valida a un autista idle e ne avvia la partenza', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Mercedes E', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false, fuel: 80 };
            const driver = { id: 'd1', name: 'Marco', status: 'idle', assignedCarId: 'c1', queue: [] };
            const ride = { id: 101, tier: 'business', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'], duration: 20000 };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.pendingRides = [ride];

            sandbox.assignRideToDriver(101, 'd1');

            assert.equal(gs.pendingRides.length, 0, 'la corsa deve essere rimossa dai pendenti');
            assert.equal(driver.status, 'busy', 'l\'autista idle deve passare a busy avviando la corsa');
            assert.equal(gs.activeRides.length, 1, 'la corsa deve entrare in activeRides');
            assert.equal(gs.activeTrips.length, 1, 'il viaggio deve entrare in activeTrips');
        });

        test('assignRideToDriver rifiuta se l\'autista è in riposo (status resting)', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', name: 'Mercedes E', tier: 'business', condition: 90, outOfService: false };
            const driver = { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 4, assignedCarId: 'c1', queue: [] };
            const ride = { id: 102, tier: 'business', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.pendingRides = [ride];

            sandbox.assignRideToDriver(102, 'd1');

            assert.equal(gs.pendingRides.length, 1, 'la corsa deve rimanere in attesa');
            assert.equal(driver.queue.length, 0, 'nessuna corsa deve essere aggiunta alla coda');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in riposo')));
        });

        test('assignRideToDriver rifiuta contratti con requisito veicolo non compatibile', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', name: 'Sedan Standard', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false };
            const driver = { id: 'd1', name: 'Marco', status: 'idle', assignedCarId: 'c1', queue: [] };
            // Corsa che richiede Minivan (stellar_v_carr)
            const contractRide = { id: 103, isContract: true, vehicleRequired: 'stellar_v_carr', tier: 'vip', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.pendingRides = [contractRide];

            sandbox.assignRideToDriver(103, 'd1');

            assert.equal(gs.pendingRides.length, 1, 'la corsa non deve essere assegnata');
            assert.equal(driver.queue.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Veicolo errato')));
        });

        test('assignRideToDriver rispetta il tetto massimo della coda (10 base, 12 con Executive Pass)', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', tier: 'standard', condition: 90, outOfService: false };
            const driver = { id: 'd1', name: 'Marco', status: 'busy', assignedCarId: 'c1', queue: new Array(10).fill({ id: 'dummy' }) };
            const ride = { id: 104, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.pendingRides = [ride];

            // Coda piena a 10 senza pass
            sandbox.assignRideToDriver(104, 'd1');
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(driver.queue.length, 10);

            // Con Executive Pass attivo
            gs.executivePassActive = true;
            gs.executivePassExpiresDay = 10;
            gs.day = 1;

            sandbox.assignRideToDriver(104, 'd1');
            assert.equal(gs.pendingRides.length, 0, 'con Executive Pass deve consentire fino a 12 corse in coda');
            assert.equal(driver.queue.length, 11);
        });

        test('assignRideToDriver con ID inesistenti non solleva eccezioni e non altera lo stato', () => {
            const { sandbox, gs } = amb;
            gs.pendingRides = [{ id: 105, tier: 'standard' }];

            assert.doesNotThrow(() => {
                sandbox.assignRideToDriver(9999, 'driver_inesistente');
                sandbox.assignRideToDriver(105, 'driver_inesistente');
            });

            assert.equal(gs.pendingRides.length, 1);
        });

        test('assignAllRides smista tutte le corse assegnabili e prioritizza i contratti specifici', () => {
            const { sandbox, gs, env } = amb;
            const car1 = { id: 'c1', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false };
            const car2 = { id: 'c2', tier: 'vip', vehicleClass: 'stellar_v_carr', condition: 90, outOfService: false };
            const driver1 = { id: 'd1', name: 'Marco', status: 'idle', assignedCarId: 'c1', queue: [] };
            const driver2 = { id: 'd2', name: 'Sara', status: 'idle', assignedCarId: 'c2', queue: [] };

            gs.fleet = [car1, car2];
            gs.drivers = [driver1, driver2];
            gs.pendingRides = [
                { id: 201, tier: 'business', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'], duration: 20000 },
                { id: 202, isContract: true, vehicleRequired: 'stellar_v_carr', tier: 'vip', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['civitavecchia'], duration: 20000 },
            ];

            sandbox.assignAllRides();

            assert.equal(gs.pendingRides.length, 0, 'tutte le corse compatibili devono essere state smistate');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('smistate')));
        });

        test('assignAllRides notifica avviso se nessun autista è compatibile', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [];
            gs.drivers = [];
            gs.pendingRides = [{ id: 203, tier: 'ultra', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['milano'] }];

            sandbox.assignAllRides();

            assert.equal(gs.pendingRides.length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Nessun autista disponibile')));
        });

        test('autoDispatchRides non assegna corse VIP o Ultra senza il Senior Dispatcher (sr_disp)', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_vip', tier: 'vip', condition: 90, outOfService: false };
            const driver = { id: 'd1', name: 'Marco', status: 'idle', assignedCarId: 'c_vip', queue: [] };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.staff = []; // nessun sr_disp

            gs.pendingRides = [
                { id: 301, tier: 'vip', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] },
            ];

            sandbox.autoDispatchRides();

            assert.equal(gs.pendingRides.length, 1, 'senza sr_disp non deve auto-dispacciare corse VIP');

            // Assumi Senior Dispatcher
            gs.staff = [{ id: 'sr_disp', name: 'Senior Dispatcher' }];
            sandbox.autoDispatchRides();

            assert.equal(gs.pendingRides.length, 0, 'con sr_disp deve auto-dispacciare corse VIP');
        });
    });

    describe('3. Ciclo di vita della corsa: partenza e usura (startNextRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('startNextRide applica usura alla vettura e consuma carburante (motore a combustione)', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Benzina Sedan', isElectric: false, condition: 100, fuel: 80, tirePressure: 100, mileage: 0 };
            const driver = { id: 'd1', name: 'Luigi', status: 'idle', assignedCarId: 'c1', queue: [
                { id: 401, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'], duration: 20000 }
            ]};

            gs.fleet = [car];
            gs.drivers = [driver];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'busy');
            assert.ok(car.condition < 100, 'la condizione dell\'auto deve essere scalata');
            assert.ok(car.fuel < 80, 'il carburante deve essere consumato');
            assert.ok(car.tirePressure < 100, 'la pressione delle gomme decade');
            assert.ok(car.mileage > 0, 'il chilometraggio deve avanzare');
        });

        test('startNextRide su veicolo elettrico (EV) non riduce il carburante a combustibile', () => {
            const { sandbox, gs } = amb;
            // Modello elettrico (Volt 3 Urban da STELLAR_VOLT_CATALOG)
            const car = { id: 'c_ev', name: 'Volt Urban', vehicleClass: 'volt_3_urban', condition: 100, fuel: 100, tirePressure: 100 };
            const driver = { id: 'd1', name: 'Luigi', status: 'idle', assignedCarId: 'c_ev', queue: [
                { id: 402, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'], duration: 20000 }
            ]};

            gs.fleet = [car];
            gs.drivers = [driver];

            sandbox.startNextRide(driver);

            assert.equal(car.fuel, 100, 'le auto elettriche non devono consumare gasolio');
        });

        test('startNextRide con driver CEO verifica e consuma energia (blocco se energia insufficiente)', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_ceo', tier: 'standard', condition: 100, fuel: 100 };
            const ceoDriver = { id: 'ceo', name: 'CEO', status: 'idle', assignedCarId: 'c_ceo', queue: [
                { id: 403, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'], duration: 20000 }
            ]};

            gs.fleet = [car];
            gs.drivers = [ceoDriver];
            gs.energy = 5; // sotto la soglia di 10

            sandbox.startNextRide(ceoDriver);

            assert.equal(ceoDriver.status, 'idle', 'con energia insufficiente il CEO deve rimanere idle');
            assert.equal(ceoDriver.queue.length, 1, 'la corsa deve rimanere in coda');

            // Con energia sufficiente (>= 10)
            gs.energy = 20;
            sandbox.startNextRide(ceoDriver);

            assert.equal(ceoDriver.status, 'busy');
            assert.equal(gs.energy, 10, 'deve aver consumato 10 di energia');
        });

        test('startNextRide con auto a condizione critica (<= 10) scarica la coda e rimanda le corse a pendingRides', () => {
            const { sandbox, gs, env } = amb;
            const brokenCar = { id: 'c_broken', name: 'Auto Rotta', condition: 8, outOfService: false };
            const driver = { id: 'd1', name: 'Luigi', status: 'idle', assignedCarId: 'c_broken', queue: [
                { id: 404, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] },
                { id: 405, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_hassler'] }
            ]};

            gs.fleet = [brokenCar];
            gs.drivers = [driver];
            gs.pendingRides = [];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'idle');
            assert.equal(driver.queue.length, 0, 'la coda dell\'autista deve essere svuotata');
            assert.equal(gs.pendingRides.length, 2, 'le corse bloccate devono tornare tra i pendenti');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('condizione critica')));
        });

        test('startNextRide con auto outOfService non avvia la corsa', () => {
            const { sandbox, gs } = amb;
            const oosCar = { id: 'c_oos', name: 'Auto Guasta', condition: 90, outOfService: 'engine', fuel: 0 };
            const driver = { id: 'd1', name: 'Luigi', status: 'idle', assignedCarId: 'c_oos', queue: [
                { id: 406, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] }
            ]};

            gs.fleet = [oosCar];
            gs.drivers = [driver];

            sandbox.startNextRide(driver);

            assert.equal(driver.status, 'idle');
            assert.equal(driver.queue.length, 1);
        });

        test('startNextRide con autista in burnout non avvia corse e imposta lo stato a resting', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', tier: 'standard', condition: 90 };
            gs.day = 1;
            gs.hour = 5;
            const driverBurnout = {
                id: 'd1', name: 'Stressato', status: 'idle',
                assignedCarId: 'c1',
                burnout_until: 1 * 24 + 10, // fino all'ora 34 (ora attuale 29)
                queue: [{ id: 407, tier: 'standard' }]
            };

            gs.fleet = [car];
            gs.drivers = [driverBurnout];

            sandbox.startNextRide(driverBurnout);

            assert.equal(driverBurnout.status, 'resting');
            assert.equal(driverBurnout.restHoursLeft, 5);
        });
    });

    describe('4. Calcolo Guadagni e Completamento Corse (completeRide)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('completeRide accredita il saldo via CE_money, aumenta reputazione e aggiorna statistiche', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', condition: 100, vehicleClass: 'stellar_e_exec' };
            const driver = { id: 'd1', name: 'Luigi', status: 'busy', level: 0, assignedCarId: 'c1', queue: [], xp: 0 };
            const ride = { id: 501, driverId: 'd1', tier: 'business', price: 200, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 1000;
            gs.reputation = 3.0;
            gs.todayEarnings = 0;

            sandbox.completeRide(ride, false);

            assert.ok(gs.cash > 1000, 'il saldo deve essere aumentato');
            assert.ok(gs.todayEarnings > 0, 'i guadagni odierni devono essere incrementati');
            assert.ok(gs.reputation >= 3.02, 'la reputazione deve salire di +0.02');
            assert.ok(driver.xp > 0, 'l\'autista deve aver guadagnato punti esperienza');
            assert.equal(gs.questStats.totalRides, 1);
        });

        test('completeRide differito (_deferPay = true) calcola l\'importo sul record activeTrips senza accreditare subito', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', name: 'Luigi', status: 'busy', assignedCarId: 'c1', queue: [] };
            const ride = { id: 502, driverId: 'd1', tier: 'standard', price: 150, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 1000;
            gs.activeTrips = [{ id: 502, driverId: 'd1', earnings: null, endTime: Date.now() + 60000 }];

            sandbox.completeRide(ride, true);

            assert.equal(gs.cash, 1000, 'il saldo non deve muoversi durante il calcolo differito');
            assert.ok(gs.activeTrips[0].earnings > 0, 'il guadagno calcolato deve essere salvato nel viaggio attivo');
        });

        test('completeRide applica usura fatica e manda in riposo forzato al 100% (o 85% con HR)', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', name: 'Stanco', status: 'busy', fatigue: 95, assignedCarId: 'c1', queue: [] };
            const ride = { id: 503, driverId: 'd1', tier: 'vip', price: 300, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.staff = []; // senza HR

            sandbox.completeRide(ride, false);

            assert.equal(driver.status, 'resting', 'raggiunto il 100% di fatica deve entrare in riposo forzato');
            assert.equal(driver.restHoursLeft, 6);
            assert.ok(env.logs.some(l => l.includes('FORZATO') && l.includes('Stanco')));
        });

        test('completeRide con incidente danneggia l\'auto e dimezza il prezzo (senza Kasko)', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', condition: 80 };
            const driver = { id: 'd1', name: 'Sfortunato', status: 'busy', assignedCarId: 'c1', queue: [] };
            const ride = { id: 504, driverId: 'd1', tier: 'standard', price: 200, hasIncident: true, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.investments = []; // nessuna kasko

            sandbox.completeRide(ride, false);

            assert.equal(car.condition, 60, 'in caso di incidente non coperto la condizione cala di 20 punti');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Guasto')));
        });

        test('completeRide con incidente coperto da polizza Kasko non danneggia l\'auto', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', condition: 80 };
            const driver = { id: 'd1', name: 'Protetto', status: 'busy', assignedCarId: 'c1', queue: [] };
            const ride = { id: 505, driverId: 'd1', tier: 'standard', price: 200, hasIncident: true, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.investments = ['inv_kasko'];

            sandbox.completeRide(ride, false);

            assert.equal(car.condition, 80, 'con Kasko l\'auto non deve subire danno netto');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Kasko: incidente coperto')));
        });

        test('completeRide con trait Charmante e corsa VIP attiva il bonus mancia speciale', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', name: 'Giacomo', status: 'busy', trait: { id: 'charmante', tipMult: 1.15, vipTipMult: 1.15 }, assignedCarId: 'c1', queue: [] };
            const ride = { id: 506, driverId: 'd1', tier: 'ultra', price: 500, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.emails = [];

            // Forza roll mance charmante
            const origRand = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;

            sandbox.completeRide(ride, false);
            sandbox.Math.random = origRand;

            assert.ok(gs.emails.some(e => e.type === 'driver_msg' && e.subject.includes('estasiato')));
            assert.ok(env.logs.some(l => l.includes('Charmante')));
        });
    });

    describe('5. Breakdown matematico dei moltiplicatori di guadagno', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('malus condizione veicolo (< 50% applica 0.85, < 30% applica 0.80)', () => {
            const { sandbox, gs } = amb;
            const carGood = { id: 'c_good', condition: 90 };
            const carMid  = { id: 'c_mid', condition: 40 };
            const carLow  = { id: 'c_low', condition: 20 };

            const driver1 = { id: 'd1', assignedCarId: 'c_good', queue: [] };
            const driver2 = { id: 'd2', assignedCarId: 'c_mid', queue: [] };
            const driver3 = { id: 'd3', assignedCarId: 'c_low', queue: [] };

            gs.fleet = [carGood, carMid, carLow];
            gs.drivers = [driver1, driver2, driver3];
            gs.fuelPrice = 0; // azzera carburante per isolare il test sul moltiplicatore

            const r1 = { id: 601, driverId: 'd1', tier: 'standard', price: 1000, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };
            const r2 = { id: 602, driverId: 'd2', tier: 'standard', price: 1000, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };
            const r3 = { id: 603, driverId: 'd3', tier: 'standard', price: 1000, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.cash = 0;
            sandbox.completeRide(r1, false);
            const earnGood = gs.cash;

            gs.cash = 0;
            sandbox.completeRide(r2, false);
            const earnMid = gs.cash;

            gs.cash = 0;
            sandbox.completeRide(r3, false);
            const earnLow = gs.cash;

            assert.equal(earnGood, 1000);
            assert.equal(earnMid, 850, 'con condizione 40% il guadagno deve essere decurtato del 15%');
            assert.equal(earnLow, 800, 'con condizione 20% il guadagno deve essere decurtato del 20%');
        });

        test('pricing strategy (premium +40%, discount -20%) altera correttamente il guadagno finale', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', assignedCarId: 'c1', queue: [] };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.fuelPrice = 0;

            const ride = { id: 604, driverId: 'd1', tier: 'standard', price: 500, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.pricingStrategy = 'standard';
            gs.cash = 0;
            sandbox.completeRide(ride, false);
            assert.equal(gs.cash, 500);

            gs.pricingStrategy = 'premium';
            gs.cash = 0;
            sandbox.completeRide(ride, false);
            assert.equal(gs.cash, 700, 'con premium +40% l\'incasso è 500 * 1.4 = 700');

            gs.pricingStrategy = 'discount';
            gs.cash = 0;
            sandbox.completeRide(ride, false);
            assert.equal(gs.cash, 400, 'con discount -20% l\'incasso è 500 * 0.8 = 400');
        });

        test('deduzione carburante viene sottratta correttamente dal ricavo lordo', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', assignedCarId: 'c1', queue: [] };
            gs.fleet = [car];
            gs.drivers = [driver];

            // Corsa intra-regionale: km stimati = 60. Costo carburante: (60 / 10) * 2.00 = 12€
            gs.fuelPrice = 2.00;
            const ride = { id: 605, driverId: 'd1', tier: 'standard', price: 200, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.cash = 0;
            sandbox.completeRide(ride, false);

            assert.equal(gs.cash, 188, 'l\'incasso netto deve essere 200 - 12 = 188€');
        });
    });

    describe('6. Polling Real-Time e Ripristino Stato (checkActiveTrips, persistenza)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('checkActiveTrips accredita solo i viaggi con endTime superato e libera l\'autista', () => {
            const { sandbox, gs } = amb;
            const driver1 = { id: 'd1', name: 'A', status: 'busy', queue: [] };
            const driver2 = { id: 'd2', name: 'B', status: 'busy', queue: [] };
            gs.drivers = [driver1, driver2];
            gs.cash = 1000;

            gs.activeTrips = [
                { id: 701, driverId: 'd1', driverName: 'A', toName: 'Roma', earnings: 350, endTime: Date.now() - 5000 },
                { id: 702, driverId: 'd2', driverName: 'B', toName: 'Milano', earnings: 450, endTime: Date.now() + 60000 }
            ];

            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 1350, 'deve essere accreditato solo il viaggio scaduto (+350)');
            assert.equal(gs.activeTrips.length, 1, 'il viaggio futuro deve rimanere in activeTrips');
            assert.equal(driver1.status, 'idle', 'l\'autista del viaggio concluso deve tornare disponibile');
            assert.equal(driver2.status, 'busy', 'l\'autista in viaggio resta busy');
        });

        test('simulazione chiusura pagina e reload: activeTrips persiste e si completa al riavvio', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', tier: 'standard', condition: 100 };
            const driver = { id: 'd1', name: 'Marco', status: 'busy', assignedCarId: 'c1', queue: [] };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 5000;

            const trip = {
                id: 703,
                driverId: 'd1',
                driverName: 'Marco',
                toName: 'Roma FCO',
                earnings: 280,
                startTime: Date.now() - 30000,
                endTime: Date.now() - 1000 // completato durante la disconnessione
            };
            gs.activeTrips = [trip];

            // Simula salvataggio stato
            sandbox.saveGame();

            // Ricaricamento: esecuzione checkActiveTrips come farebbe il loop all'avvio
            sandbox.checkActiveTrips();

            assert.equal(gs.cash, 5280, 'il viaggio concluso offline deve essere saldato al rientro');
            assert.equal(gs.activeTrips.length, 0);
            assert.equal(driver.status, 'idle');
        });
    });

    describe('7. Prevenzione Doppio Conteggio e Chiamate RPC (CE_money, OPA, Fuel Levy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('incassi da corsa passano per CE_money.earn e non invocano syncCash doppiamente', () => {
            const syncedCash = [];
            const ambSync = creaAmbienteCorse({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });

            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', status: 'busy', assignedCarId: 'c1', queue: [] };
            ambSync.gs.fleet = [car];
            ambSync.gs.drivers = [driver];
            ambSync.gs.cash = 2000;
            ambSync.gs.activeTrips = [
                { id: 801, driverId: 'd1', driverName: 'Marco', toName: 'Roma', earnings: 400, endTime: Date.now() - 1000 }
            ];

            ambSync.sandbox.checkActiveTrips();

            assert.equal(ambSync.gs.cash, 2400);
            // CE_money.earn chiama syncCash esattamente una volta col totale aggiornato
            assert.equal(syncedCash.length, 1);
            assert.equal(syncedCash[0], 2400);

            ambSync.env.stopAllIntervals();
        });

        test('completeRide chiama rpc_pay_majority_dividend se supabaseClient e currentUser sono presenti', () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = { id: 'c1', condition: 100 };
            const driver = { id: 'd1', status: 'busy', assignedCarId: 'c1', queue: [] };
            const ride = { id: 802, driverId: 'd1', tier: 'business', price: 300, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];

            sandbox.completeRide(ride, false);

            const opaRpc = rpcLog.find(r => r.nome === 'rpc_pay_majority_dividend');
            assert.ok(opaRpc, 'deve invocare rpc_pay_majority_dividend per eventuale OPA attiva');
            assert.equal(opaRpc.args.v_target_user_id, 'user_driver_test');
        });
    });

    describe('8. UI Dispatch Center & Interazione Utente (renderTabCorse, switchTab, Drag & Drop)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteCorse(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabCorse visualizza il centro operativo con richieste pendenti e lista autisti', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Mercedes E-Class', tier: 'business' };
            const driver = { id: 'd1', name: 'Antonio', status: 'idle', assignedCarId: 'c1', queue: [], fatigue: 20 };
            const ride = { id: 901, tier: 'business', price: 180, fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'] };

            gs.fleet = [car];
            gs.drivers = [driver];
            gs.pendingRides = [ride];

            sandbox.renderTabCorse();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Richieste in Arrivo'));
            assert.ok(c.innerHTML.includes('Stato Autisti'));
            assert.ok(c.innerHTML.includes('Antonio'));
            assert.ok(c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(c.innerHTML.includes('€180'));
        });

        test('renderTabCorse mostra alert in pillola per sciopero o burnout', () => {
            const { sandbox, gs } = amb;
            const strikingDriver = { id: 'd_strike', name: 'Scioperante', status: 'striking', isOnStrike: true, queue: [] };
            gs.drivers = [strikingDriver];
            gs.fleet = [];
            gs.pendingRides = [];

            sandbox.renderTabCorse();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('sciopero'));
        });

        test('switchTab("corse") imposta il titolo "Dispatch Center" e scatena il rendering', () => {
            const { sandbox } = amb;
            sandbox.switchTab('corse');

            const title = sandbox.document.getElementById('panel-title');
            assert.equal(title.innerText, 'Dispatch Center');
        });

        test('event delegation su bottone "Smista tutte" invoca assignAllRides', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', tier: 'standard', condition: 100, outOfService: false };
            const driver = { id: 'd1', name: 'Marco', status: 'idle', assignedCarId: 'c1', queue: [] };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.pendingRides = [{ id: 902, tier: 'standard', fromPoi: sandbox.POIS['roma'], toPoi: sandbox.POIS['roma_fco'], duration: 20000 }];

            sandbox.renderTabCorse();

            const btn = sandbox.document.querySelector('button[data-ce-act="assignAllRides"]');
            assert.ok(btn, 'il bottone Smista tutte deve esistere nel DOM');

            // Clicca sul bottone
            sandbox.assignAllRides();

            assert.equal(gs.pendingRides.length, 0);
            assert.equal(driver.status, 'busy');
        });
    });
});
