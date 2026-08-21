'use strict';
/* ============================================================================
   test/economy/store-sync.test.js

   Regressione per il bug economico delle spese Driver Coins nel negozio (engine-store.js):
   ogni spesa DEVE passare da CE_money.spendDC e sincronizzarsi col server tramite
   ServerState.spendDriverCoins.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStoreEnv() {
    const rpcCalls = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                rpcCalls.push({ motivo, n });
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, rpcCalls };
}

describe('engine-store — sincronizzazione Driver Coins col server (CE_money.spendDC)', () => {

    describe('activateExecutivePass', () => {
        test('attiva pass, scala 150 DC e invia RPC al server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 200;
            sandbox.activateExecutivePass();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50, 'il saldo locale DC deve diminuire di 150');
            assert.equal(gs.executivePassActive, true);
            assert.deepEqual(rpcCalls, [{ motivo: 'executive_pass', n: 150 }]);
        });

        test('fondi insufficienti: non attiva pass e non chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 100;
            gs.executivePassActive = false;
            sandbox.activateExecutivePass();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 100);
            assert.equal(gs.executivePassActive, false);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('skipConstruction', () => {
        test('completa costruzione, scala 8 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.constructions = [{ invId: 'garage_roma' }];
            gs.investments = [];
            sandbox.skipConstruction('garage_roma');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 12);
            assert.ok(gs.investments.includes('garage_roma'));
            assert.equal(gs.constructions.length, 0);
            assert.deepEqual(rpcCalls, [{ motivo: 'skip_construction', n: 8 }]);
        });

        test('costruzione non trovata: non scala DC e non chiama RPC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.constructions = [];
            sandbox.skipConstruction('inesistente');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });

        test('fondi insufficienti: non completa la costruzione', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 5;
            gs.constructions = [{ invId: 'garage_roma' }];
            sandbox.skipConstruction('garage_roma');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.equal(gs.constructions.length, 1);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('fuelBoostDC', () => {
        test('rifornisce la flotta, scala 3 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.fleet = [{ id: 'v1', fuel: 20 }, { id: 'v2', fuel: 50 }];
            sandbox.fuelBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 7);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.deepEqual(rpcCalls, [{ motivo: 'fuel_boost', n: 3 }]);
        });

        test('fondi insufficienti: flotta non rifornita', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 2;
            gs.fleet = [{ id: 'v1', fuel: 20 }];
            sandbox.fuelBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 2);
            assert.equal(gs.fleet[0].fuel, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('wakeDriverDC', () => {
        test('risveglia autista a riposo, scala 3 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.drivers = [{ id: 'drv1', name: 'Mario', status: 'resting', restHoursLeft: 5, fatigue: 40 }];
            sandbox.wakeDriverDC('drv1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 7);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].restHoursLeft, 0);
            assert.equal(gs.drivers[0].fatigue, 10);
            assert.deepEqual(rpcCalls, [{ motivo: 'wake_driver', n: 3 }]);
        });

        test('autista non a riposo: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.drivers = [{ id: 'drv1', name: 'Mario', status: 'idle' }];
            sandbox.wakeDriverDC('drv1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('energyBoostDC', () => {
        test('ricarica energia CEO al 100%, scala 4 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.energy = 30;
            sandbox.energyBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 6);
            assert.equal(gs.energy, 100);
            assert.deepEqual(rpcCalls, [{ motivo: 'energy_boost', n: 4 }]);
        });

        test('energia già al 100%: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.energy = 100;
            sandbox.energyBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('instaHealDC', () => {
        test('azzera stress e burnout, scala 2 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.drivers = [{ id: 'drv1', name: 'Mario', status: 'resting', stress_level: 60, burnout_until: 5, fatigue: 70 }];
            sandbox.instaHealDC('drv1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 8);
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].burnout_until, null);
            assert.equal(gs.drivers[0].fatigue, 20);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(rpcCalls, [{ motivo: 'insta_heal', n: 2 }]);
        });

        test('autista già in forma: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.drivers = [{ id: 'drv1', name: 'Mario', status: 'idle', stress_level: 0, burnout_until: null }];
            sandbox.instaHealDC('drv1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('wakeAllDriversDC', () => {
        test('risveglia tutti gli autisti a riposo (escluso CEO) e spende DC calcolati', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', status: 'resting' },
                { id: 'd1', name: 'Mario', status: 'resting', restHoursLeft: 3, fatigue: 40 },
                { id: 'd2', name: 'Luigi', status: 'resting', restHoursLeft: 2, fatigue: 50 },
            ];
            sandbox.wakeAllDriversDC();
            await new Promise(r => setImmediate(r));
            // 2 autisti * 2 = 4 DC
            assert.equal(gs.driverCoins, 16);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[2].status, 'idle');
            assert.deepEqual(rpcCalls, [{ motivo: 'wake_all_drivers', n: 4 }]);
        });

        test('nessun autista a riposo: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'idle' }];
            sandbox.wakeAllDriversDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('healAllDriversDC', () => {
        test('guarisce tutti gli autisti stressati (escluso CEO) e spende DC calcolati', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 50 },
                { id: 'd1', name: 'Mario', status: 'idle', stress_level: 40, fatigue: 60 },
                { id: 'd2', name: 'Luigi', status: 'resting', stress_level: 0, burnout_until: 3, fatigue: 70 },
            ];
            sandbox.healAllDriversDC();
            await new Promise(r => setImmediate(r));
            // 2 autisti * 2 = 4 DC
            assert.equal(gs.driverCoins, 16);
            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[2].burnout_until, null);
            assert.equal(gs.drivers[2].status, 'idle');
            assert.deepEqual(rpcCalls, [{ motivo: 'heal_all_drivers', n: 4 }]);
        });

        test('nessun autista stressato: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', stress_level: 0, burnout_until: null }];
            sandbox.healAllDriversDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('skipAllAcademyDC', () => {
        test('completa tutti i corsi accademia, scala 5 DC per corso e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.drivers = [
                { id: 'd1', driving: 50, status: 'training' },
                { id: 'd2', comfort: 60, status: 'training' },
            ];
            gs.driverAcademy = [
                { driverId: 'd1', skill: 'driving', skillGain: 10 },
                { driverId: 'd2', skill: 'comfort', skillGain: 15 },
            ];
            sandbox.skipAllAcademyDC();
            await new Promise(r => setImmediate(r));
            // 2 corsi * 5 = 10 DC
            assert.equal(gs.driverCoins, 20);
            assert.equal(gs.drivers[0].driving, 60);
            assert.equal(gs.drivers[1].comfort, 75);
            assert.equal(gs.driverAcademy.length, 0);
            assert.deepEqual(rpcCalls, [{ motivo: 'skip_all_academy', n: 10 }]);
        });

        test('nessun corso attivo: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.driverAcademy = [];
            sandbox.skipAllAcademyDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 30);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('skipAllConstructionsDC', () => {
        test('completa tutte le costruzioni, scala 8 DC per costruzione e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.investments = [];
            gs.constructions = [{ invId: 'garage_1' }, { invId: 'garage_2' }];
            sandbox.skipAllConstructionsDC();
            await new Promise(r => setImmediate(r));
            // 2 costruzioni * 8 = 16 DC
            assert.equal(gs.driverCoins, 14);
            assert.deepEqual(gs.investments, ['garage_1', 'garage_2']);
            assert.equal(gs.constructions.length, 0);
            assert.deepEqual(rpcCalls, [{ motivo: 'skip_all_constructions', n: 16 }]);
        });

        test('nessuna costruzione attiva: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.constructions = [];
            sandbox.skipAllConstructionsDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 30);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('opsBundleDC', () => {
        test('attiva Pacchetto Operativo, scala 9 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.fleet = [{ id: 'v1', fuel: 10 }];
            gs.energy = 30;
            gs.drivers = [{ id: 'd1', status: 'resting', restHoursLeft: 4, fatigue: 60 }];
            sandbox.opsBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 11);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(rpcCalls, [{ motivo: 'ops_bundle', n: 9 }]);
        });

        test('fondi insufficienti: pacchetto operativo non attivato', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 5;
            gs.energy = 30;
            sandbox.opsBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.equal(gs.energy, 30);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('fullBundleDC', () => {
        test('attiva Pacchetto Imperiale, scala 35 DC e chiama spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            gs.fleet = [{ id: 'v1', fuel: 10 }];
            gs.energy = 20;
            gs.drivers = [{ id: 'd1', status: 'resting', stress_level: 50, fatigue: 80 }];
            gs.investments = [];
            gs.constructions = [{ invId: 'c1' }];
            gs.driverAcademy = [{ driverId: 'd1', skill: 'driving', skillGain: 10 }];
            sandbox.fullBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 15);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(gs.investments, ['c1']);
            assert.equal(gs.constructions.length, 0);
            assert.equal(gs.driverAcademy.length, 0);
            assert.deepEqual(rpcCalls, [{ motivo: 'full_bundle', n: 35 }]);
        });

        test('fondi insufficienti: pacchetto imperiale non attivato', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.energy = 20;
            sandbox.fullBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.equal(gs.energy, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });
});
