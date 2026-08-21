'use strict';
/* ============================================================================
   test/rides/meteo.test.js — Impatto del meteo sulle corse

   Verifica che il meteo (da weather_real.js o gameState.weather) influenzi:
   - Le tariffe delle corse generate (priceMult da WEATHER_STATES)
   - La durata delle corse avviate (speedMult da WEATHER_STATES)
   - Il traffico reale (_realTrafficMult)
   - I tratti/specialità specifici (es. specialty 'alpine' su neve)
   - Gli incassi finali alla conclusione della corsa
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '../..');

describe('meteo — impatto del meteo su durata e tariffe delle corse', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        // Carica CORE_FILES più weather_real.js
        env = createGameEnv(CORE_FILES);
        sandbox = env.sandbox;

        // Esegui anche weather_real.js nel contesto della sandbox
        const weatherRealSrc = fs.readFileSync(path.join(ROOT, 'weather_real.js'), 'utf8');
        vm.runInContext(weatherRealSrc, sandbox, { filename: 'weather_real.js' });

        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 10; // bypass Zero-to-Hero
        gs.hour = 12; // ora diurna (evita bonus/malus notte o rush hour)
        gs.cannesBoostDays = 0;
        gs.pricingStrategy = 'standard';
        sandbox._getSeasonalMult = () => ({ priceMult: 1.0, rideBonus: 1.0, name: '' });
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('1. Tariffe corse in base al meteo (generatePOIRide)', () => {
        test('con tempo sereno (sole), tariffa usa priceMult 1.00', () => {
            gs.weather = 'sole';
            gs.pendingRides = [];

            // Sequenza deterministica per Math.random: from (idx 0), to (idx 1)
            let rIdx = 0;
            const seq = [0.01, 0.99, 0.01]; // from idx 0 (roma), to idx last (civitavecchia)
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => seq[rIdx++ % seq.length];

            const ride = sandbox.generatePOIRide('standard');
            sandbox.Math.random = origRandom;

            assert.ok(ride, 'la corsa deve essere generata');
            const baseFlat = ride.fromPoi.baseFlat;
            const expectedPrice = Math.floor(baseFlat * 1.0);
            assert.equal(ride.price, expectedPrice, `con sole la tariffa deve essere ${expectedPrice}`);
        });

        test('con pioggia, tariffa è maggiorata del +15% (priceMult 1.15)', () => {
            gs.weather = 'pioggia';
            gs.pendingRides = [];

            let rIdx = 0;
            const seq = [0.01, 0.99, 0.01];
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => seq[rIdx++ % seq.length];

            const ride = sandbox.generatePOIRide('standard');
            sandbox.Math.random = origRandom;

            assert.ok(ride, 'la corsa deve essere generata');
            const baseFlat = ride.fromPoi.baseFlat;
            const expectedPrice = Math.floor(baseFlat * 1.15);
            assert.equal(ride.price, expectedPrice, `con pioggia la tariffa deve essere ${expectedPrice} (+15%)`);
            assert.ok(ride.price > baseFlat, 'la tariffa con pioggia deve essere maggiore di quella con sole');
        });

        test('con neve, tariffa è maggiorata del +25% (priceMult 1.25, effetto più forte che con pioggia)', () => {
            gs.weather = 'neve';
            gs.pendingRides = [];

            let rIdx = 0;
            const seq = [0.01, 0.99, 0.01];
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => seq[rIdx++ % seq.length];

            const ride = sandbox.generatePOIRide('standard');
            sandbox.Math.random = origRandom;

            assert.ok(ride, 'la corsa deve essere generata');
            const baseFlat = ride.fromPoi.baseFlat;
            const expectedPrice = Math.floor(baseFlat * 1.25);
            assert.equal(ride.price, expectedPrice, `con neve la tariffa deve essere ${expectedPrice} (+25%)`);

            const priceRain = Math.floor(baseFlat * 1.15);
            assert.ok(ride.price > priceRain, 'la tariffa con neve deve essere maggiore di quella con pioggia');
        });
    });

    describe('2. Durata corsa in base al meteo (startNextRide)', () => {
        let driver, car;

        beforeEach(() => {
            // Setup autista neutro e auto standard in perfette condizioni
            driver = {
                id: 'drv_test',
                name: 'Mario Rossi',
                status: 'idle',
                assignedCarId: 'c_test',
                queue: [],
                fatigue: 0,
                stress_level: 0,
                skill_speed: 50, // velocità base neutra (mult 1.0)
                trait: null,
                specialty: null,
            };
            car = {
                id: 'c_test',
                name: 'Berlina Test',
                tier: 'standard',
                vehicleClass: 'volt_3_urban',
                condition: 100,
                fuel: 100,
                tirePressure: 100,
                engineHealth: 100,
                upgrades: [],
                outOfService: null,
            };
            gs.drivers.push(driver);
            gs.fleet.push(car);
            gs._realTrafficMult = 1.0;
        });

        test('con tempo sereno (sole), la durata resta quella base (speedMult 1.00)', () => {
            gs.weather = 'sole';
            const ride = {
                id: 101,
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 75,
                duration: 20000,
                elapsed: 0,
            };

            driver.queue = [ride];
            sandbox.startNextRide(driver);

            assert.equal(ride.duration, 20000, 'con sole la durata deve rimanere 20000 ms');
        });

        test('con pioggia, la corsa dura di più (+25% tempo, speedMult 0.80)', () => {
            gs.weather = 'pioggia';
            const ride = {
                id: 102,
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 86,
                duration: 20000,
                elapsed: 0,
            };

            driver.queue = [ride];
            sandbox.startNextRide(driver);

            // 20000 / 0.80 = 25000 ms
            assert.equal(ride.duration, 25000, 'con pioggia la durata deve salire a 25000 ms (20000 / 0.80)');
        });

        test('con neve, la corsa dura ancora di più (+66% tempo, speedMult 0.60)', () => {
            gs.weather = 'neve';
            const ride = {
                id: 103,
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 93,
                duration: 20000,
                elapsed: 0,
            };

            driver.queue = [ride];
            sandbox.startNextRide(driver);

            // 20000 / 0.60 = 33333 ms
            assert.equal(ride.duration, 33333, 'con neve la durata deve salire a 33333 ms (20000 / 0.60)');
        });

        test('autista con specialità alpine su neve recupera velocità (+25% specialty bonus)', () => {
            gs.weather = 'neve';
            driver.specialty = 'alpine';

            const ride = {
                id: 104,
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 93,
                duration: 20000,
                elapsed: 0,
            };

            driver.queue = [ride];
            sandbox.startNextRide(driver);

            // speedMult = 0.60 * 1.25 = 0.75 -> 20000 / 0.75 = 26666 ms
            assert.equal(ride.duration, 26666, 'con specialty alpine su neve la durata deve essere 26666 ms vs 33333 ms');
        });
    });

    describe('3. Ricezione meteo da weather_real.js', () => {
        test('realWeatherRefresh aggiorna gameState.weather e gameState._realTrafficMult', async () => {
            // Mock Supabase rpc_get_real_weather
            sandbox.supabaseClient = {
                rpc: async (fn) => {
                    if (fn === 'rpc_get_real_weather') {
                        return {
                            data: [
                                {
                                    province_id: 'prov_roma',
                                    game_weather: 'pioggia',
                                    traffic_mult: 1.25,
                                    temp_celsius: 12,
                                    owm_description: 'pioggia moderata'
                                }
                            ],
                            error: null
                        };
                    }
                    return { data: null, error: null };
                }
            };

            gs.hq = { region: 'lazio' };
            await sandbox.realWeatherRefresh(true);

            assert.equal(gs.weather, 'pioggia', 'il meteo di gioco deve essere aggiornato a pioggia');
            assert.equal(gs._realTrafficMult, 1.25, 'il moltiplicatore di traffico deve essere aggiornato a 1.25');
            assert.ok(gs._realWeatherData, 'i dati meteo completi devono essere salvati in gameState');
        });

        test('il traffico reale da weather_real influenza la durata delle corse', () => {
            gs.weather = 'sole';
            gs._realTrafficMult = 0.8; // traffico reale pesante

            const driver = {
                id: 'drv_traffic',
                name: 'Autista Traffico',
                status: 'idle',
                assignedCarId: 'c_traf',
                queue: [],
                fatigue: 0,
                stress_level: 0,
                skill_speed: 50,
            };
            const car = {
                id: 'c_traf',
                name: 'Auto Traf',
                tier: 'standard',
                vehicleClass: 'volt_3_urban',
                condition: 100,
                fuel: 100,
                tirePressure: 100,
                engineHealth: 100,
                upgrades: [],
                outOfService: null,
            };
            gs.drivers.push(driver);
            gs.fleet.push(car);

            const ride = {
                id: 105,
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 75,
                duration: 20000,
                elapsed: 0,
            };

            driver.queue = [ride];
            sandbox.startNextRide(driver);

            // trafficMult = 1.0 (ore 12) * 0.8 (real traffic) = 0.8
            // 20000 / 0.8 = 25000 ms
            assert.equal(ride.duration, 25000, 'il traffico reale 0.8 deve aumentare la durata a 25000 ms');
        });
    });

    describe('4. Incasso completamento corsa influenzato dal meteo (completeRide)', () => {
        test('la tariffa maggiorata dal meteo (pioggia/neve) si traduce in maggior guadagno al completamento', () => {
            const driver = {
                id: 'drv_incasso',
                name: 'Autista Incasso',
                status: 'busy',
                assignedCarId: 'c_incasso',
                queue: [],
                fatigue: 0,
                stress_level: 0,
                skill_charisma: 50, // neutro
                level: 0,
            };
            const car = {
                id: 'c_incasso',
                name: 'Auto Incasso',
                tier: 'standard',
                vehicleClass: 'volt_3_urban',
                condition: 100,
                fuel: 100,
                tirePressure: 100,
                engineHealth: 100,
                upgrades: [],
                outOfService: null,
            };
            gs.drivers.push(driver);
            gs.fleet.push(car);
            gs.cash = 0;

            // Corsa standard generata con sole (75€)
            const rideSole = {
                id: 201,
                driverId: 'drv_incasso',
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 75,
                duration: 20000,
                elapsed: 20000,
            };
            sandbox.completeRide(rideSole);
            const incassoSole = gs.cash;

            // Reset cassa e autista per test corsa con pioggia (86€)
            gs.cash = 0;
            driver.fatigue = 0;
            driver.status = 'busy';
            const ridePioggia = {
                id: 202,
                driverId: 'drv_incasso',
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 86,
                duration: 25000,
                elapsed: 25000,
            };
            sandbox.completeRide(ridePioggia);
            const incassoPioggia = gs.cash;

            // Reset cassa e autista per test corsa con neve (93€)
            gs.cash = 0;
            driver.fatigue = 0;
            driver.status = 'busy';
            const rideNeve = {
                id: 203,
                driverId: 'drv_incasso',
                fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', name: 'FCO', region: 'lazio' },
                tier: 'standard',
                price: 93,
                duration: 33333,
                elapsed: 33333,
            };
            sandbox.completeRide(rideNeve);
            const incassoNeve = gs.cash;

            assert.ok(incassoPioggia > incassoSole, `incasso con pioggia (€${incassoPioggia}) deve superare quello con sole (€${incassoSole})`);
            assert.ok(incassoNeve > incassoPioggia, `incasso con neve (€${incassoNeve}) deve superare quello con pioggia (€${incassoPioggia})`);
        });
    });
});
