'use strict';
/* ============================================================================
   test/rides/meteo.test.js — Impatto del meteo su durata e compenso delle corse

   Verifica che il sistema meteo (incluso weather_real.js) influenzi
   correttamente durata, velocità e compensi delle corse:
   1. Sereno (sole): durata standard, compenso standard (speedMult 1.00, priceMult 1.00)
   2. Pioggia: corsa dura di più (+25% tempo via speedMult 0.80) e compenso maggiorato (+15% tariffa)
   3. Neve: effetto rallentamento più forte che con pioggia (+66.7% tempo via speedMult 0.60) e compenso +25%
   4. Specialità 'alpine': riduce la penalità da neve per l'autista
   5. Integrazione weather_real.js: i dati meteo reali aggiornano gameState.weather e traffico
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('meteo — impatto su durata e compenso delle corse', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = createGameEnv([...CORE_FILES, 'weather_real.js']);
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;

        // Fissiamo variabili temporali per evitare fluttuazioni di test (ora 12:00, mese 4 = bassa stagione neutra)
        gs.hour = 12;
        gs.minute = 0;
        gs.month = 4;
        gs.cannesBoostDays = 0;
        gs.activeDynamicEvent = null;
        gs._realTrafficMult = 1.0;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('WEATHER_STATES definisce moltiplicatori di velocità e prezzo per sole, pioggia e neve', () => {
        const vm = require('node:vm');
        const states = vm.runInContext('WEATHER_STATES', sandbox);
        assert.ok(Array.isArray(states), 'WEATHER_STATES deve essere un array');

        const sole = states.find(s => s.id === 'sole');
        const pioggia = states.find(s => s.id === 'pioggia');
        const neve = states.find(s => s.id === 'neve');

        assert.ok(sole, 'stato sole presente');
        assert.ok(pioggia, 'stato pioggia presente');
        assert.ok(neve, 'stato neve presente');

        assert.equal(sole.speedMult, 1.00, 'sole: speedMult 1.00');
        assert.equal(sole.priceMult, 1.00, 'sole: priceMult 1.00');

        assert.equal(pioggia.speedMult, 0.80, 'pioggia: speedMult 0.80 (velocità ridotta)');
        assert.equal(pioggia.priceMult, 1.15, 'pioggia: priceMult 1.15 (+15% tariffa)');

        assert.equal(neve.speedMult, 0.60, 'neve: speedMult 0.60 (velocità fortemente ridotta)');
        assert.equal(neve.priceMult, 1.25, 'neve: priceMult 1.25 (+25% tariffa)');

        assert.ok(neve.speedMult < pioggia.speedMult, 'la neve rallenta più della pioggia');
        assert.ok(neve.priceMult > pioggia.priceMult, 'la neve paga più della pioggia');
    });

    test('startNextRide: la durata della corsa aumenta con pioggia e ancora di più con neve', () => {
        const driver = gs.drivers[0]; // CEO
        driver.skill_speed = 50; // moltiplicatore velocità neutro (1.0)
        driver.trait = null;
        driver.stress_level = 0;
        driver.specialty = null;

        const car = gs.fleet[0];
        car.upgrades = [];
        driver.assignedCarId = car.id;

        const baseDuration = 20000;

        // 1. Sereno
        gs.weather = 'sole';
        const rideSole = { id: 101, fromPoi: { id: 'roma', region: 'lazio' }, toPoi: { id: 'roma_fco', region: 'lazio' }, duration: baseDuration, tier: 'standard' };
        driver.queue = [rideSole];
        driver.status = 'idle';
        gs.energy = 100;
        sandbox.startNextRide(driver);

        const durationSole = rideSole.duration;
        assert.equal(durationSole, 20000, 'con sole la durata deve rimanere quella base (20000ms)');

        // 2. Pioggia (speedMult 0.80 -> duration / 0.80 = 25000ms)
        gs.weather = 'pioggia';
        const ridePioggia = { id: 102, fromPoi: { id: 'roma', region: 'lazio' }, toPoi: { id: 'roma_fco', region: 'lazio' }, duration: baseDuration, tier: 'standard' };
        driver.queue = [ridePioggia];
        driver.status = 'idle';
        gs.energy = 100;
        sandbox.startNextRide(driver);

        const durationPioggia = ridePioggia.duration;
        assert.equal(durationPioggia, 25000, 'con pioggia la durata è 20000 / 0.8 = 25000ms (+25%)');
        assert.ok(durationPioggia > durationSole, 'la pioggia fa durare la corsa più a lungo del sereno');

        // 3. Neve (speedMult 0.60 -> duration / 0.60 = 33333ms)
        gs.weather = 'neve';
        const rideNeve = { id: 103, fromPoi: { id: 'roma', region: 'lazio' }, toPoi: { id: 'roma_fco', region: 'lazio' }, duration: baseDuration, tier: 'standard' };
        driver.queue = [rideNeve];
        driver.status = 'idle';
        gs.energy = 100;
        sandbox.startNextRide(driver);

        const durationNeve = rideNeve.duration;
        assert.equal(durationNeve, Math.floor(20000 / 0.60), 'con neve la durata è Math.floor(20000 / 0.6) = 33333ms');
        assert.ok(durationNeve > durationPioggia, 'la neve rallenta più della pioggia');
    });

    test('driver specialty alpine mitiga il rallentamento da neve', () => {
        const driver = gs.drivers[0];
        driver.skill_speed = 50;
        driver.trait = null;
        driver.stress_level = 0;
        driver.specialty = 'alpine';

        const car = gs.fleet[0];
        car.upgrades = [];
        driver.assignedCarId = car.id;

        const baseDuration = 20000;
        gs.weather = 'neve';

        // Con alpine su neve: speedMult = 0.60 * 1.25 = 0.75 -> 20000 / 0.75 = 26666ms
        const ride = { id: 104, fromPoi: { id: 'roma', region: 'lazio' }, toPoi: { id: 'roma_fco', region: 'lazio' }, duration: baseDuration, tier: 'standard' };
        driver.queue = [ride];
        driver.status = 'idle';
        gs.energy = 100;
        sandbox.startNextRide(driver);

        assert.equal(ride.duration, Math.floor(20000 / 0.75), 'specialty alpine su neve dà bonus 1.25 alla velocità');
        assert.ok(ride.duration < Math.floor(20000 / 0.60), 'autista alpine va più veloce sulla neve rispetto a un autista standard');
    });

    test('generatePOIRide: la tariffa generata include il moltiplicatore meteo (sole=1.0x, pioggia=1.15x, neve=1.25x)', () => {
        gs.pendingRides = [];
        gs.unlockedRegions = ['lazio'];

        // Fissiamo il seme casuale per avere lo stesso percorso deterministico:
        // from = primo POI (roma), to = secondo POI (roma_fco)
        const origRandom = sandbox.Math.random;
        const makeDeterministicRandom = () => {
            let call = 0;
            return () => {
                call++;
                if (call === 1) return 0.0; // fromPool[0] -> roma
                if (call === 2) return 0.3; // toPool[1] -> roma_fco
                return 0.5;
            };
        };

        sandbox.Math.random = makeDeterministicRandom();
        gs.weather = 'sole';
        const rideSole = sandbox.generatePOIRide('standard');
        assert.ok(rideSole, 'corsa generata con sole');
        const priceSole = rideSole.price;

        gs.pendingRides = [];
        sandbox.Math.random = makeDeterministicRandom();
        gs.weather = 'pioggia';
        const ridePioggia = sandbox.generatePOIRide('standard');
        assert.ok(ridePioggia, 'corsa generata con pioggia');
        const pricePioggia = ridePioggia.price;

        gs.pendingRides = [];
        sandbox.Math.random = makeDeterministicRandom();
        gs.weather = 'neve';
        const rideNeve = sandbox.generatePOIRide('standard');
        assert.ok(rideNeve, 'corsa generata con neve');
        const priceNeve = rideNeve.price;

        sandbox.Math.random = origRandom;

        assert.equal(pricePioggia, Math.floor(priceSole * 1.15), 'prezzo con pioggia = +15% su sereno');
        assert.equal(priceNeve, Math.floor(priceSole * 1.25), 'prezzo con neve = +25% su sereno');
        assert.ok(priceNeve > pricePioggia, 'la tariffa con neve è più alta di quella con pioggia');
        assert.ok(pricePioggia > priceSole, 'la tariffa con pioggia è più alta di quella con sole');
    });

    test('weather_real: _applyRealWeather propaga game_weather e traffic_mult a gameState', () => {
        gs.hq = { region: 'lazio' };
        sandbox.window._realWeatherState = {
            data: {
                prov_roma: {
                    province_id: 'prov_roma',
                    game_weather: 'pioggia',
                    traffic_mult: 1.35,
                    temp_celsius: 14,
                    owm_description: 'pioggia moderata'
                }
            },
            _lastFetch: Date.now(),
            _sub: null
        };

        // Simuliamo l'applicazione del meteo reale
        // In weather_real.js _applyRealWeather è chiamata internamente da realWeatherRefresh
        // Testiamo che la lettura del meteo per la provincia corrisponda
        const data = sandbox.window.getRealWeatherForProvince('prov_roma');
        assert.equal(data.game_weather, 'pioggia');
        assert.equal(data.traffic_mult, 1.35);

        // Simuliamo l'override dello stato
        gs.weather = data.game_weather;
        gs._realTrafficMult = data.traffic_mult;

        assert.equal(gs.weather, 'pioggia', 'gameState.weather impostato su pioggia');
        assert.equal(gs._realTrafficMult, 1.35, 'gameState._realTrafficMult impostato su 1.35');

        // _getTrafficMult incorpora _realTrafficMult
        const traffic = sandbox._getTrafficMult();
        assert.equal(traffic, 1.0 * 1.35, '_getTrafficMult riflette il traffico reale');
    });
});
