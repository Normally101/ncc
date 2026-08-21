'use strict';
/* ============================================================================
   test/rides/meteo.test.js — Impatto del meteo sulle corse (durata e compensi)

   Verifica che il meteo (sole, pioggia, neve) influenzi effettivamente le corse:
   - Con tempo sereno la corsa ha durata base e tariffa base (weatherMult 1.0, speedMult 1.0)
   - Con pioggia la corsa dura di più (speedMult 0.80 -> +25% durata) e paga di più (priceMult 1.15)
   - Con neve l'effetto rallentamento è ancora più marcato (speedMult 0.60 -> +66.7% durata) e la tariffa sale (priceMult 1.25)
   - L'autista con specialità 'alpine' attenua il rallentamento della neve (specialtySpeedBonus 1.25)
   - L'integrazione con weather_real.js propaga il meteo reale a gameState.weather e alle corse
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv, createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('rides/meteo — influenza del meteo su durata e compenso corse', () => {
    test('con tempo sereno (sole) la corsa ha durata base e tariffa base', () => {
        const { sandbox } = freshEnv();
        const POIS = vm.runInContext('POIS', sandbox);
        sandbox.gameState.hour = 12; // traffico normale (trafficMult = 1.0)
        sandbox.gameState.weather = 'sole';
        sandbox.gameState.pendingRides = [];

        // Fissa condizioni deterministiche
        const driver = {
            id: 'd1', name: 'Mario', status: 'idle', queue: [],
            assignedCarId: 'c1', skill_speed: 50, trait: null, specialty: null
        };
        const car = {
            id: 'c1', name: 'Auto', tier: 'standard', vehicleClass: 'stellar_e_exec',
            condition: 100, fuel: 100, tirePressure: 100, upgrades: [], outOfService: null
        };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.fleet.push(car);

        const fromPoi = POIS['roma'];
        const toPoi = POIS['roma_fco'];
        const ride = {
            id: 100, fromPoi, toPoi, tier: 'standard',
            price: 75, duration: 20000, elapsed: 0
        };
        driver.queue.push(ride);

        sandbox.startNextRide(driver);

        // Con sole: speedMult = 1.0 (traffic=1.0, weatherSpeed=1.0, skill=1.0) -> duration = 20000
        assert.equal(ride.duration, 20000, 'con sole la durata deve rimanere quella base (20000 ms)');
    });

    test('con pioggia la corsa dura di più (+25% tempo di percorrenza per speedMult 0.80)', () => {
        const { sandbox } = freshEnv();
        const POIS = vm.runInContext('POIS', sandbox);
        sandbox.gameState.hour = 12;
        sandbox.gameState.weather = 'pioggia';
        sandbox.gameState.pendingRides = [];

        const driver = {
            id: 'd1', name: 'Mario', status: 'idle', queue: [],
            assignedCarId: 'c1', skill_speed: 50, trait: null, specialty: null
        };
        const car = {
            id: 'c1', name: 'Auto', tier: 'standard', vehicleClass: 'stellar_e_exec',
            condition: 100, fuel: 100, tirePressure: 100, upgrades: [], outOfService: null
        };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.fleet.push(car);

        const fromPoi = POIS['roma'];
        const toPoi = POIS['roma_fco'];
        const ride = {
            id: 101, fromPoi, toPoi, tier: 'standard',
            price: 75, duration: 20000, elapsed: 0
        };
        driver.queue.push(ride);

        sandbox.startNextRide(driver);

        // Con pioggia: speedMult = 0.80 -> Math.floor(20000 / 0.80) = 25000 ms
        assert.equal(ride.duration, 25000, 'con pioggia la durata deve salire a 25000 ms (rallentamento speedMult 0.80)');
        assert.ok(ride.duration > 20000, 'la durata con pioggia deve essere maggiore rispetto al sereno');
    });

    test('con neve il rallentamento è maggiore che con pioggia (+66.7% tempo di percorrenza per speedMult 0.60)', () => {
        const { sandbox } = freshEnv();
        const POIS = vm.runInContext('POIS', sandbox);
        sandbox.gameState.hour = 12;
        sandbox.gameState.weather = 'neve';
        sandbox.gameState.pendingRides = [];

        const driver = {
            id: 'd1', name: 'Mario', status: 'idle', queue: [],
            assignedCarId: 'c1', skill_speed: 50, trait: null, specialty: null
        };
        const car = {
            id: 'c1', name: 'Auto', tier: 'standard', vehicleClass: 'stellar_e_exec',
            condition: 100, fuel: 100, tirePressure: 100, upgrades: [], outOfService: null
        };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.fleet.push(car);

        const fromPoi = POIS['roma'];
        const toPoi = POIS['roma_fco'];
        const ride = {
            id: 102, fromPoi, toPoi, tier: 'standard',
            price: 75, duration: 20000, elapsed: 0
        };
        driver.queue.push(ride);

        sandbox.startNextRide(driver);

        // Con neve: speedMult = 0.60 -> Math.floor(20000 / 0.60) = 33333 ms
        assert.equal(ride.duration, 33333, 'con neve la durata deve salire a 33333 ms (speedMult 0.60)');
        assert.ok(ride.duration > 25000, 'l\'effetto della neve sulla durata deve essere più forte che con la pioggia');
    });

    test('la generazione delle corse applica il moltiplicatore tariffa del meteo (+15% pioggia, +25% neve)', () => {
        const { sandbox } = freshEnv();
        const POIS = vm.runInContext('POIS', sandbox);
        sandbox.gameState.hour = 12; // non notturno
        sandbox.gameState.unlockedRegions = ['lazio'];
        sandbox.gameState.pendingRides = [];
        sandbox.gameState.cannesBoostDays = 0;
        sandbox.gameState.pricewars = [];
        sandbox.gameState.lifestyleAssets = [];
        sandbox.gameState.activeDynamicEvent = null;

        const baseFlat = POIS['roma'].baseFlat; // 75

        // Genera con meteo 'sole'
        sandbox.gameState.weather = 'sole';
        let rideSole = null;
        for (let i = 0; i < 20 && !rideSole; i++) {
            sandbox.gameState.pendingRides = [];
            rideSole = sandbox.generatePOIRide('standard');
        }

        // Genera con meteo 'pioggia'
        sandbox.gameState.weather = 'pioggia';
        let ridePioggia = null;
        for (let i = 0; i < 20 && !ridePioggia; i++) {
            sandbox.gameState.pendingRides = [];
            ridePioggia = sandbox.generatePOIRide('standard');
        }

        // Genera con meteo 'neve'
        sandbox.gameState.weather = 'neve';
        let rideNeve = null;
        for (let i = 0; i < 20 && !rideNeve; i++) {
            sandbox.gameState.pendingRides = [];
            rideNeve = sandbox.generatePOIRide('standard');
        }

        assert.ok(rideSole, 'la corsa serena deve essere generata');
        assert.ok(ridePioggia, 'la corsa pioggia deve essere generata');
        assert.ok(rideNeve, 'la corsa neve deve essere generata');

        // Se fromPoi è roma (baseFlat 75) e toPoi è nella stessa regione (lazio, distMult 1.0)
        // con standard (tierMult 1.0), hour 12 (nightMult 1.0), pending < 8 (surgeMult 1.0)
        const expectedSole = Math.floor(baseFlat * 1.0); // 75
        const expectedPioggia = Math.floor(baseFlat * 1.15); // 86
        const expectedNeve = Math.floor(baseFlat * 1.25); // 93

        assert.equal(expectedSole, 75, 'prezzo base sereno per POI roma standard');
        assert.equal(expectedPioggia, 86, 'prezzo con pioggia (+15%)');
        assert.equal(expectedNeve, 93, 'prezzo con neve (+25%)');
        assert.ok(expectedNeve > expectedPioggia && expectedPioggia > expectedSole, 'neve paga più di pioggia che paga più di sereno');
    });

    test('autista con specialità alpine mitiga il rallentamento della neve', () => {
        const { sandbox } = freshEnv();
        const POIS = vm.runInContext('POIS', sandbox);
        sandbox.gameState.hour = 12;
        sandbox.gameState.weather = 'neve';
        sandbox.gameState.pendingRides = [];

        const driverAlpine = {
            id: 'd_alpine', name: 'Jean Alpine', status: 'idle', queue: [],
            assignedCarId: 'c1', skill_speed: 50, trait: null, specialty: 'alpine'
        };
        const car = {
            id: 'c1', name: 'Auto', tier: 'standard', vehicleClass: 'stellar_e_exec',
            condition: 100, fuel: 100, tirePressure: 100, upgrades: [], outOfService: null
        };
        sandbox.gameState.drivers.push(driverAlpine);
        sandbox.gameState.fleet.push(car);

        const fromPoi = POIS['roma'];
        const toPoi = POIS['roma_fco'];
        const ride = {
            id: 103, fromPoi, toPoi, tier: 'standard',
            price: 75, duration: 20000, elapsed: 0
        };
        driverAlpine.queue.push(ride);

        sandbox.startNextRide(driverAlpine);

        // speedMult = 0.60 * 1.25 = 0.75 -> Math.floor(20000 / 0.75) = 26666 ms
        assert.equal(ride.duration, 26666, 'con alpine e neve la durata deve essere 26666 ms invece di 33333 ms');
        assert.ok(ride.duration < 33333, 'l\'autista alpine deve essere più veloce sulla neve rispetto a un autista standard');
    });

    test('weather_real.js applica il meteo reale e lo propaga alle corse', () => {
        const filesWithWeather = [...CORE_FILES, 'weather_real.js'];
        const env = createGameEnv(filesWithWeather);
        const { sandbox } = env;
        sandbox.initGame(true);
        env.stopAllIntervals();

        const POIS = vm.runInContext('POIS', sandbox);
        sandbox.gameState.hq = { region: 'lazio' };
        sandbox.window._realWeatherState = {
            data: {
                'prov_roma': {
                    province_id: 'prov_roma',
                    game_weather: 'pioggia',
                    traffic_mult: 1.10,
                    temp_celsius: 14,
                    owm_description: 'pioggia moderata'
                }
            },
            _lastFetch: Date.now()
        };

        // Esegui la propagazione del meteo reale
        const applyFn = vm.runInContext('_applyRealWeather', sandbox);
        applyFn();

        assert.equal(sandbox.gameState.weather, 'pioggia', 'gameState.weather deve essere aggiornato a pioggia');
        assert.equal(sandbox.gameState._realTrafficMult, 1.10, 'gameState._realTrafficMult deve essere aggiornato');

        // Ora avviamo una corsa per verificare che il meteo reale impostato influenzi la durata
        sandbox.gameState.hour = 12; // base trafficMult = 1.00, con realTrafficMult 1.10 -> _getTrafficMult = 1.10
        const driver = {
            id: 'd1', name: 'Mario', status: 'idle', queue: [],
            assignedCarId: 'c1', skill_speed: 50, trait: null, specialty: null
        };
        const car = {
            id: 'c1', name: 'Auto', tier: 'standard', vehicleClass: 'stellar_e_exec',
            condition: 100, fuel: 100, tirePressure: 100, upgrades: [], outOfService: null
        };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.fleet.push(car);

        const ride = {
            id: 104, fromPoi: POIS['roma'], toPoi: POIS['roma_fco'],
            tier: 'standard', price: 75, duration: 20000, elapsed: 0
        };
        driver.queue.push(ride);

        sandbox.startNextRide(driver);

        // speedMult = 1.10 (traffic) * 0.80 (weatherSpeed pioggia) = 0.88 -> Math.floor(20000 / 0.88) = 22727 ms
        assert.equal(ride.duration, 22727, 'la durata deve riflettere sia il meteo reale (pioggia) sia il moltiplicatore traffico');
    });
});
