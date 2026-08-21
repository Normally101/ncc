'use strict';
/* ============================================================================
   test/rides/meteo.test.js — Influenza del meteo su durata e tariffe corse

   Verifica che il meteo (reale o simulato) influenzi correttamente le corse:
   - Con tempo sereno (sole): durata base (20s) e tariffa base (weatherMult 1.00)
   - Con pioggia: velocità ridotta (speedMult 0.80 -> durata 25s) e tariffa maggiorata (+15%)
   - Con neve: rallentamento più forte (speedMult 0.60 -> durata 33.3s) e tariffa +25%
   - Con neve e autista con specialty 'alpine': bonus velocità 1.25x
   - Con meteo reale (weather_real.js): i dati OpenWeather aggiornano gameState.weather
     e gameState._realTrafficMult, influenzando tariffe e durata
   - Con meteo reale attivo: il ticker sintetico _tickWeather non sovrascrive il meteo reale
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '../..');

function safeGenerateRide(sandbox) {
    for (let attempt = 0; attempt < 50; attempt++) {
        sandbox.gameState.pendingRides = [];
        const r = sandbox.generatePOIRide('standard');
        if (r && r.fromPoi && r.toPoi && r.fromPoi.region === r.toPoi.region) return r;
    }
    throw new Error('Impossibile generare una corsa intra-regionale per il test');
}

describe('meteo — impatto su durata, tariffe e integrazione weather_real', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = createGameEnv(CORE_FILES);
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;

        // Assicurati che l'ora sia neutra (ore 12:00 -> trafficMult 1.0)
        gs.hour = 12;
        gs.activeDynamicEvent = null;
        gs.cannesBoostDays = 0;
        gs.investments = [];
        gs.pendingRides = [];
        gs.activeRides = [];
        gs.pricingStrategy = 'standard';
        gs._realTrafficMult = 1.0;
        delete gs._realWeatherData;

        // Carica weather_real.js nel sandbox
        const weatherRealSrc = fs.readFileSync(path.join(ROOT, 'weather_real.js'), 'utf8');
        vm.runInContext(weatherRealSrc, sandbox, { filename: 'weather_real.js' });
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('con tempo sereno (sole): durata e tariffa sono al valore base (1.0x)', () => {
        gs.weather = 'sole';

        const ride = safeGenerateRide(sandbox);
        assert.ok(ride, 'la corsa deve essere generata');

        // Calcola prezzo atteso con weatherMult = 1.00
        const seasonMult = sandbox._getSeasonalMult().priceMult;
        const expectedPrice = Math.floor(ride.fromPoi.baseFlat * 1.0 * seasonMult);
        assert.equal(ride.price, expectedPrice, `la tariffa con sole deve essere ${expectedPrice}`);

        // Assegna e avvia la corsa con driver standard (skill 50, nessun tratto)
        const driver = gs.drivers[0];
        driver.status = 'idle';
        driver.assignedCarId = gs.fleet[0].id;
        driver.trait = null;
        driver.specialty = null;
        driver.skill_speed = 50;
        driver.stress_level = 0;

        sandbox.assignRideToDriver(ride.id, driver.id);
        assert.equal(ride.duration, 20000, 'con sole e velocità normale la durata intra-regionale deve essere 20000ms');
    });

    test('con pioggia: corsa dura di più (+25% tempo, -20% velocità) e tariffa sale (+15%)', () => {
        gs.weather = 'pioggia';

        const ride = safeGenerateRide(sandbox);
        assert.ok(ride);

        // Prezzo con pioggia (weatherMult 1.15)
        const seasonMult = sandbox._getSeasonalMult().priceMult;
        const expectedPrice = Math.floor(ride.fromPoi.baseFlat * 1.15 * seasonMult);
        assert.equal(ride.price, expectedPrice, `la tariffa con pioggia deve includere il moltiplicatore 1.15 (${expectedPrice})`);

        // Avvio corsa: speedMult = 0.80 -> duration = Math.floor(20000 / 0.80) = 25000ms
        const driver = gs.drivers[0];
        driver.status = 'idle';
        driver.assignedCarId = gs.fleet[0].id;
        driver.trait = null;
        driver.specialty = null;
        driver.skill_speed = 50;
        driver.stress_level = 0;

        sandbox.assignRideToDriver(ride.id, driver.id);
        assert.equal(ride.duration, 25000, 'con pioggia (speedMult 0.80) la durata deve aumentare a 25000ms');
    });

    test('con neve: effetto più forte che con pioggia (durata 33.3s vs 25s, tariffa +25% vs +15%)', () => {
        gs.weather = 'neve';

        const ride = safeGenerateRide(sandbox);
        assert.ok(ride);

        // Prezzo con neve (weatherMult 1.25)
        const seasonMult = sandbox._getSeasonalMult().priceMult;
        const expectedPrice = Math.floor(ride.fromPoi.baseFlat * 1.25 * seasonMult);
        assert.equal(ride.price, expectedPrice, `la tariffa con neve deve includere il moltiplicatore 1.25 (${expectedPrice})`);

        // Avvio corsa: speedMult = 0.60 -> duration = Math.floor(20000 / 0.60) = 33333ms
        const driver = gs.drivers[0];
        driver.status = 'idle';
        driver.assignedCarId = gs.fleet[0].id;
        driver.trait = null;
        driver.specialty = null;
        driver.skill_speed = 50;
        driver.stress_level = 0;

        sandbox.assignRideToDriver(ride.id, driver.id);
        assert.equal(ride.duration, 33333, 'con neve (speedMult 0.60) la durata deve aumentare a 33333ms');
    });

    test('con neve: autista con specialty alpine ottiene bonus velocità 1.25x', () => {
        gs.weather = 'neve';

        const ride = safeGenerateRide(sandbox);
        assert.ok(ride);

        const driver = gs.drivers[0];
        driver.status = 'idle';
        driver.assignedCarId = gs.fleet[0].id;
        driver.trait = null;
        driver.specialty = 'alpine';
        driver.skill_speed = 50;
        driver.stress_level = 0;

        sandbox.assignRideToDriver(ride.id, driver.id);
        // speedMult = 0.60 * 1.25 = 0.75 -> duration = Math.floor(20000 / 0.75) = 26666ms
        assert.equal(ride.duration, Math.floor(20000 / (0.60 * 1.25)), 'alpine specialty deve applicare 1.25x sulla neve');
    });

    test('weather_real.js applica il meteo reale e il traffico reale allo stato di gioco', () => {
        // Simula ricezione dati meteo reale per Roma
        sandbox.window._realWeatherState.data['prov_roma'] = {
            province_id: 'prov_roma',
            game_weather: 'pioggia',
            traffic_mult: 1.3,
            temp_celsius: 14,
            owm_description: 'pioggia moderata',
            updated_at: new Date().toISOString()
        };

        // Imposta HQ a Roma (lazio -> prov_roma)
        gs.hq = { region: 'lazio' };
        gs.weather = 'sole';

        // Esegui applicazione meteo reale
        sandbox._applyRealWeather();

        assert.equal(gs.weather, 'pioggia', 'gameState.weather deve essere aggiornato a pioggia');
        assert.equal(gs._realTrafficMult, 1.3, 'gameState._realTrafficMult deve essere 1.3');
        assert.ok(gs._realWeatherData, 'gameState._realWeatherData deve essere presente');

        // Verifica che _getTrafficMult consideri il traffico reale
        const traffic = sandbox._getTrafficMult();
        assert.equal(traffic, 1.0 * 1.3, '_getTrafficMult deve includere il moltiplicatore reale 1.3');

        // Genera ed avvia una corsa: subisce sia meteo pioggia che traffico reale
        const ride = safeGenerateRide(sandbox);
        const driver = gs.drivers[0];
        driver.status = 'idle';
        driver.assignedCarId = gs.fleet[0].id;
        driver.trait = null;
        driver.specialty = null;
        driver.skill_speed = 50;
        driver.stress_level = 0;

        sandbox.assignRideToDriver(ride.id, driver.id);
        // speedMult = trafficMult (1.3) * weatherSpeed (0.80) = 1.04
        // ride.duration = Math.floor(20000 / 1.04) = 19230
        const expectedSpeedMult = 1.3 * 0.80;
        assert.equal(ride.duration, Math.floor(20000 / expectedSpeedMult));
    });

    test('quando il meteo reale è attivo, _tickWeather non sovrascrive il meteo reale con roll casuali', () => {
        // Meteo reale impostato a neve
        sandbox.window._realWeatherState.data['prov_roma'] = {
            province_id: 'prov_roma',
            game_weather: 'neve',
            traffic_mult: 1.0,
            temp_celsius: -2,
            owm_description: 'neve forte',
            updated_at: new Date().toISOString()
        };
        gs.hq = { region: 'lazio' };
        sandbox._applyRealWeather();

        assert.equal(gs.weather, 'neve');

        // Simula il passaggio di 20 ore di _tickWeather()
        for (let h = 0; h < 20; h++) {
            sandbox._tickWeather();
        }

        // Il meteo reale NON deve essere stato sovrascritto dal roll casuale
        assert.equal(gs.weather, 'neve', 'il meteo reale non deve essere sovrascritto da _tickWeather casuale');
    });
});
