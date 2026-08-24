'use strict';
/* ============================================================================
   test/store/driver-coins-rpc.test.js

   Regressione per il bug economico delle spese Driver Coins in engine-store.js:
   tutte le 12 funzioni di spesa DC DEVONO passare da ServerState.purchaseItem
   (tramite CE_money.acquistoDalListino) per persistere la spesa autoritativa
   sul server. Il server decide il prezzo (tabella purchase_prices), il client
   manda solo valuta + articolo + quantita'.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const { createPurchaseItemMock } = require('../../test-support/dc-catalog.js');

function setupStoreEnv() {
    const chiamateRPC = [];
    const env = freshEnv({
        serverState: {
            purchaseItem: createPurchaseItemMock(env.sandbox.gameState, chiamateRPC),
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateRPC };
}

describe('engine-store — persistenza RPC per tutte le spese di Driver Coins', () => {

    test('1. activateExecutivePass acquista executive_pass tramite ServerState.purchaseItem', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 200;
        await sandbox.activateExecutivePass();
        assert.equal(chiamateRPC.length, 1, 'purchaseItem deve essere chiamata esattamente una volta');
        assert.equal(chiamateRPC[0].itemId, 'executive_pass');
        assert.equal(chiamateRPC[0].spent, 150);
        assert.equal(gs.executivePassActive, true);
    });

    test('2. skipConstruction acquista skip_construction qty=1', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.constructions = [{ invId: 'garage_londra' }];
        gs.investments = [];
        await sandbox.skipConstruction('garage_londra');
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'skip_construction');
        assert.equal(chiamateRPC[0].spent, 8);
        assert.ok(gs.investments.includes('garage_londra'));
    });

    test('3. fuelBoostDC acquista fuel_boost', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        await sandbox.fuelBoostDC();
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'fuel_boost');
        assert.equal(chiamateRPC[0].spent, 3);
        assert.equal(gs.fleet[0].fuel, 100);
    });

    test('4. wakeDriverDC acquista wake_driver qty=1', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 50 }];
        await sandbox.wakeDriverDC('drv1');
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'wake_driver');
        assert.equal(chiamateRPC[0].spent, 3);
        assert.equal(gs.drivers[0].status, 'idle');
    });

    test('5. energyBoostDC acquista energy_boost', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.energy = 50;
        await sandbox.energyBoostDC();
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'energy_boost');
        assert.equal(chiamateRPC[0].spent, 4);
        assert.equal(gs.energy, 100);
    });

    test('6. instaHealDC acquista insta_heal qty=1', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'idle', stress_level: 80, fatigue: 60 }];
        await sandbox.instaHealDC('drv1');
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'insta_heal');
        assert.equal(chiamateRPC[0].spent, 2);
        assert.equal(gs.drivers[0].stress_level, 0);
    });

    test('7. wakeAllDriversDC acquista wake_all_drivers qty=n', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', status: 'resting' },
            { id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 40 },
            { id: 'drv2', name: 'Anna', status: 'resting', restHoursLeft: 2, fatigue: 30 },
        ];
        await sandbox.wakeAllDriversDC();
        // 2 autisti (ceo escluso) -> unit=2, min=3 => max(3, 2*2)=4
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'wake_all_drivers');
        assert.equal(chiamateRPC[0].qty, 2);
        assert.equal(chiamateRPC[0].spent, 4);
        assert.equal(gs.drivers[1].status, 'idle');
        assert.equal(gs.drivers[2].status, 'idle');
    });

    test('8. healAllDriversDC acquista heal_all_drivers qty=n', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', stress_level: 50 },
            { id: 'drv1', name: 'Luca', status: 'idle', stress_level: 40, fatigue: 60 },
            { id: 'drv2', name: 'Anna', status: 'idle', stress_level: 70, fatigue: 70 },
        ];
        await sandbox.healAllDriversDC();
        // 2 stressati -> unit=2, min=4 => max(4, 2*2)=4
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'heal_all_drivers');
        assert.equal(chiamateRPC[0].qty, 2);
        assert.equal(chiamateRPC[0].spent, 4);
        assert.equal(gs.drivers[1].stress_level, 0);
        assert.equal(gs.drivers[2].stress_level, 0);
    });

    test('9. skipAllAcademyDC acquista academy_skip qty=n', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.drivers = [{ id: 'drv1', name: 'Luca', driving: 50, status: 'training' }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 15 }];
        await sandbox.skipAllAcademyDC();
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'academy_skip');
        assert.equal(chiamateRPC[0].qty, 1);
        assert.equal(chiamateRPC[0].spent, 5);
        assert.equal(gs.drivers[0].driving, 65);
        assert.equal(gs.driverAcademy.length, 0);
    });

    test('10. skipAllConstructionsDC acquista construction_skip qty=n', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.investments = [];
        gs.constructions = [{ invId: 'c1' }, { invId: 'c2' }];
        await sandbox.skipAllConstructionsDC();
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'construction_skip');
        assert.equal(chiamateRPC[0].qty, 2);
        assert.equal(chiamateRPC[0].spent, 16);
        assert.equal(gs.constructions.length, 0);
        assert.deepEqual(gs.investments, ['c1', 'c2']);
    });

    test('11. opsBundleDC acquista ops_bundle', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.energy = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 2, fatigue: 50 }];
        await sandbox.opsBundleDC();
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'ops_bundle');
        assert.equal(chiamateRPC[0].spent, 9);
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].status, 'idle');
    });

    test('12. fullBundleDC acquista full_bundle', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 50;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.energy = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', stress_level: 50, fatigue: 70 }];
        gs.investments = [];
        gs.constructions = [{ invId: 'c1' }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 10 }];
        await sandbox.fullBundleDC();
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'full_bundle');
        assert.equal(chiamateRPC[0].spent, 35);
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
        await sandbox.energyBoostDC();
        assert.equal(chiamateRPC.length, 0, 'senza DC il server rifiuta e non viene chiamata purchaseItem');
        assert.equal(gs.energy, 50, 'energia non deve essere modificata se i DC non bastano');
    });
});