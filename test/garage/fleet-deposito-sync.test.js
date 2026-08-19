'use strict';
/* ============================================================================
   test/garage/fleet-deposito-sync.test.js

   Regressione per le 5 funzioni del deposito e manutenzione flotta:
   - buyFuelForDepot
   - upgradeFuelDepot
   - buyTiresForDepot
   - emergencyRefuel
   - buyMaintenanceContract

   Tutte DEVONO passare da CE_money (spend) e sincronizzare la cassa col server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupDepotEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('engine-fleet — sincronizzazione deposito e contratti col server (CE_money)', () => {

    describe('buyFuelForDepot', () => {
        test('acquista carburante per il deposito: scala cash e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 0;
            gs.fuelPrice = 2.0;
            gs.fuelTankLevel = 1;
            gs.activeLobbyLaws = [];
            gs.cash = 5000;

            // 1000L * €2.00 = €2000
            sandbox.buyFuelForDepot(1000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 3000);
            assert.equal(gs.fuelTank, 1000);
            assert.deepEqual(syncedCash, [3000]);
        });

        test('fondi insufficienti: non acquista carburante e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 0;
            gs.fuelPrice = 2.0;
            gs.cash = 100;

            sandbox.buyFuelForDepot(1000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.equal(gs.fuelTank, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('upgradeFuelDepot', () => {
        test('potenziamento deposito: scala cash e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.cash = 10000;

            // lvl 1 -> cost = Math.round(5000 * Math.pow(1, 1.8)) = 5000
            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(gs.fuelTankLevel, 2);
            assert.deepEqual(syncedCash, [5000]);
        });

        test('fondi insufficienti: non potenzia deposito e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.cash = 1000;

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.equal(gs.fuelTankLevel, 1);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyTiresForDepot', () => {
        test('acquista treni di gomme: scala cash e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 5000;
            gs.depositoGomme = 0;

            // 2 set * €800 = €1600
            sandbox.buyTiresForDepot(2);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 3400);
            assert.equal(gs.depositoGomme, 2);
            assert.deepEqual(syncedCash, [3400]);
        });

        test('fondi insufficienti: non acquista gomme e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 500;
            gs.depositoGomme = 0;

            sandbox.buyTiresForDepot(2);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.equal(gs.depositoGomme, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('emergencyRefuel', () => {
        test('rifornimento emergenza: scala cash e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.fleet = [{ id: 'c1', name: 'Car 1', fuel: 0, outOfService: 'fuel' }];
            gs.fuelPrice = 2.0;
            gs.cash = 1000;

            // 1 auto * 80L * (2.0 * 3) = €480
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 520);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.deepEqual(syncedCash, [520]);
        });

        test('fondi insufficienti: non rifornisce in emergenza e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.fleet = [{ id: 'c1', name: 'Car 1', fuel: 0, outOfService: 'fuel' }];
            gs.fuelPrice = 2.0;
            gs.cash = 200;

            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 200);
            assert.equal(gs.fleet[0].fuel, 0);
            assert.equal(gs.fleet[0].outOfService, 'fuel');
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyMaintenanceContract', () => {
        test('contratto manutenzione: scala cash e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.day = 5;
            gs.cash = 25000;

            // Costo = €10.000
            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 12);
            assert.deepEqual(syncedCash, [15000]);
        });

        test('fondi insufficienti: non attiva contratto e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDepotEnv();
            gs.day = 5;
            gs.cash = 5000;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(gs.maintenanceContract, false);
            assert.deepEqual(syncedCash, []);
        });
    });
});
