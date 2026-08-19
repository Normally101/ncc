'use strict';
/* ============================================================================
   test/store/driver-coins-rpc.test.js

   Regressione per il bug economico delle spese Driver Coins in engine-store.js:
   tutte le 12 funzioni di spesa DC DEVONO passare da ServerState.spendDriverCoins
   (tramite CE_money.spendDC) per persistere la spesa autoritativa sul server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStoreEnv() {
    const chiamateRPC = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                chiamateRPC.push({ motivo, n });
                return { ok: true };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateRPC };
}

describe('engine-store — persistenza RPC per tutte le spese di Driver Coins', () => {

    test('1. activateExecutivePass spende 150 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 200;
        sandbox.activateExecutivePass();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1, 'spendDriverCoins deve essere chiamata esattamente una volta');
        assert.equal(chiamateRPC[0].n, 150);
        assert.equal(gs.executivePassActive, true);
    });

    test('2. skipConstruction spende 8 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.constructions = [{ invId: 'garage_londra' }];
        gs.investments = [];
        sandbox.skipConstruction('garage_londra');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 8);
        assert.ok(gs.investments.includes('garage_londra'));
    });

    test('3. fuelBoostDC spende 3 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        sandbox.fuelBoostDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 3);
        assert.equal(gs.fleet[0].fuel, 100);
    });

    test('4. wakeDriverDC spende 3 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 50 }];
        sandbox.wakeDriverDC('drv1');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 3);
        assert.equal(gs.drivers[0].status, 'idle');
    });

    test('5. energyBoostDC spende 4 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.energy = 50;
        sandbox.energyBoostDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 4);
        assert.equal(gs.energy, 100);
    });

    test('6. instaHealDC spende 2 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'idle', stress_level: 80, fatigue: 60 }];
        sandbox.instaHealDC('drv1');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 2);
        assert.equal(gs.drivers[0].stress_level, 0);
    });

    test('7. wakeAllDriversDC spende DC calcolati tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', status: 'resting' },
            { id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 40 },
            { id: 'drv2', name: 'Anna', status: 'resting', restHoursLeft: 2, fatigue: 30 },
        ];
        sandbox.wakeAllDriversDC();
        await new Promise(r => setImmediate(r));
        // resting count = 2 (senza ceo) -> cost = max(3, 2 * 2) = 4
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 4);
        assert.equal(gs.drivers[1].status, 'idle');
        assert.equal(gs.drivers[2].status, 'idle');
    });

    test('8. healAllDriversDC spende DC calcolati tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', stress_level: 50 },
            { id: 'drv1', name: 'Luca', status: 'idle', stress_level: 40, fatigue: 60 },
            { id: 'drv2', name: 'Anna', status: 'idle', stress_level: 70, fatigue: 70 },
        ];
        sandbox.healAllDriversDC();
        await new Promise(r => setImmediate(r));
        // stressed count = 2 (senza ceo) -> cost = max(4, 2 * 2) = 4
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 4);
        assert.equal(gs.drivers[1].stress_level, 0);
        assert.equal(gs.drivers[2].stress_level, 0);
    });

    test('9. skipAllAcademyDC spende DC calcolati tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.drivers = [{ id: 'drv1', name: 'Luca', driving: 50, status: 'training' }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 15 }];
        sandbox.skipAllAcademyDC();
        await new Promise(r => setImmediate(r));
        // cost = 1 * 5 = 5
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 5);
        assert.equal(gs.drivers[0].driving, 65);
        assert.equal(gs.driverAcademy.length, 0);
    });

    test('10. skipAllConstructionsDC spende DC calcolati tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.investments = [];
        gs.constructions = [{ invId: 'c1' }, { invId: 'c2' }];
        sandbox.skipAllConstructionsDC();
        await new Promise(r => setImmediate(r));
        // cost = 2 * 8 = 16
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 16);
        assert.equal(gs.constructions.length, 0);
        assert.deepEqual(gs.investments, ['c1', 'c2']);
    });

    test('11. opsBundleDC spende 9 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.energy = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 2, fatigue: 50 }];
        sandbox.opsBundleDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 9);
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].status, 'idle');
    });

    test('12. fullBundleDC spende 35 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 50;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.energy = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', stress_level: 50, fatigue: 70 }];
        gs.investments = [];
        gs.constructions = [{ invId: 'c1' }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 10 }];
        sandbox.fullBundleDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].n, 35);
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].stress_level, 0);
        assert.equal(gs.constructions.length, 0);
        assert.equal(gs.driverAcademy.length, 0);
    });

    test('fondi insufficienti: nessuna chiamata RPC ed effetto non applicato', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 0;
        gs.energy = 50;
        sandbox.energyBoostDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 0);
        assert.equal(gs.energy, 50, 'energia non deve essere modificata se i DC non bastano');
    });
});
