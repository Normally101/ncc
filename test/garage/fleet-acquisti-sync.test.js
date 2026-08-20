'use strict';
/* ============================================================================
   test/garage/fleet-acquisti-sync.test.js

   Regressione per il bug economico in engine-fleet.js:
   tutte le funzioni di acquisto, cessione, asta, lease e rientro flotta
   DEVONO passare da CE_money (spend / earn / spendDC)
   e sincronizzare la cassa / DC col server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupFleetEnv() {
    const syncedCash = [];
    const dcSpends = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            spendDriverCoins: async (item, n) => {
                dcSpends.push([item, n]);
                return { ok: true };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, dcSpends };
}

describe('engine-fleet — sincronizzazione valuta col server (CE_money)', () => {

    describe('buyHub & sellHub', () => {
        test('buyHub scala il costo dell\'hub e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 100000;
            gs.reputation = 3.0;
            gs.ownedHubs = [];
            // POIS.roma_fco.baseFlat = 90 -> costo = 50000 + 90 * 200 = 68000
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 32000);
            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.deepEqual(syncedCash, [32000]);
        });

        test('buyHub con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 50000;
            gs.reputation = 3.0;
            gs.ownedHubs = [];
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.deepEqual(gs.ownedHubs, []);
            assert.deepEqual(syncedCash, []);
        });

        test('sellHub accredita il 60% del valore e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 10000;
            gs.ownedHubs = ['roma_fco'];
            // roma_fco costo 68000 -> 60% = 40800
            sandbox.sellHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50800);
            assert.equal(gs.ownedHubs.includes('roma_fco'), false);
            assert.deepEqual(syncedCash, [50800]);
        });
    });

    describe('buyPrototypeCar', () => {
        test('buyPrototypeCar scala il prezzo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 200000;
            gs.reputation = 4.5;
            gs.hasEVHub = true;
            // proto_van_vip costa 110000
            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 90000);
            assert.ok(gs.fleet.some(c => c.protoId === 'proto_van_vip'));
            assert.deepEqual(syncedCash, [90000]);
        });

        test('buyPrototypeCar con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 50000;
            gs.reputation = 4.5;
            gs.hasEVHub = true;
            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.some(c => c.protoId === 'proto_van_vip'), false);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyNpcCar', () => {
        test('buyNpcCar scala il prezzo del veicolo NPC e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 50000;
            gs.npcMarket = [{ id: 'npc_1', name: 'Auto Usata', tier: 'business', price: 35000, condition: 80, mileage: 40000 }];
            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 15000);
            assert.ok(gs.fleet.some(c => c.name === 'Auto Usata'));
            assert.deepEqual(syncedCash, [15000]);
        });

        test('buyNpcCar con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 20000;
            gs.npcMarket = [{ id: 'npc_1', name: 'Auto Usata', tier: 'business', price: 35000, condition: 80, mileage: 40000 }];
            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 20000);
            assert.equal(gs.fleet.some(c => c.name === 'Auto Usata'), false);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('bidOnAuction', () => {
        test('bidOnAuction scala l\'offerta e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 80000;
            gs.activeAuction = { id: 'auc_1', name: 'Auto Rara', currentBid: 50000, playerBid: null };
            sandbox.bidOnAuction(60000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 20000);
            assert.equal(gs.activeAuction.playerBid, 60000);
            assert.equal(gs.activeAuction.currentBid, 60000);
            assert.deepEqual(syncedCash, [20000]);
        });

        test('bidOnAuction con rilancio rimborsa la precedente e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 50000;
            gs.activeAuction = { id: 'auc_1', name: 'Auto Rara', currentBid: 60000, playerBid: 60000 };
            sandbox.bidOnAuction(70000);
            await new Promise(r => setImmediate(r));
            // Rimborso 60000 -> cash = 110000, poi spesa 70000 -> cash = 40000
            assert.equal(gs.cash, 40000);
            assert.equal(gs.activeAuction.playerBid, 70000);
            assert.deepEqual(syncedCash, [110000, 40000]);
        });

        test('bidOnAuction con fondi insufficienti non piazza offerta e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 30000;
            gs.activeAuction = { id: 'auc_1', name: 'Auto Rara', currentBid: 50000, playerBid: null };
            sandbox.bidOnAuction(60000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 30000);
            assert.equal(gs.activeAuction.playerBid, null);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('instantRepairDC', () => {
        test('instantRepairDC spende Driver Coins tramite ServerState.spendDriverCoins', async () => {
            const { sandbox, gs, dcSpends } = setupFleetEnv();
            gs.driverCoins = 10;
            const car = { id: 'c_rep', name: 'Auto Danneggiata', condition: 40, outOfService: 'condition' };
            gs.fleet.push(car);
            sandbox.instantRepairDC('c_rep');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 8);
            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.deepEqual(dcSpends, [['instant_repair_dc', 2]]);
        });

        test('instantRepairDC con DC insufficienti non ripara e non chiama spendDriverCoins', async () => {
            const { sandbox, gs, dcSpends } = setupFleetEnv();
            gs.driverCoins = 1;
            const car = { id: 'c_rep', name: 'Auto Danneggiata', condition: 40, outOfService: 'condition' };
            gs.fleet.push(car);
            sandbox.instantRepairDC('c_rep');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 1);
            assert.equal(car.condition, 40);
            assert.deepEqual(dcSpends, []);
        });
    });

    describe('applyVehicleSkin', () => {
        test('applyVehicleSkin spende Driver Coins tramite ServerState.spendDriverCoins', async () => {
            const { sandbox, gs, dcSpends } = setupFleetEnv();
            gs.driverCoins = 20;
            const car = { id: 'c_skin', name: 'Auto Perla' };
            gs.fleet.push(car);
            // matte_black costa 10 DC
            sandbox.applyVehicleSkin('c_skin', 'matte_black');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.equal(car.skin, 'matte_black');
            assert.deepEqual(dcSpends, [['vehicle_skin', 10]]);
        });

        test('applyVehicleSkin con DC insufficienti non applica skin e non chiama spendDriverCoins', async () => {
            const { sandbox, gs, dcSpends } = setupFleetEnv();
            gs.driverCoins = 5;
            const car = { id: 'c_skin', name: 'Auto Perla' };
            gs.fleet.push(car);
            sandbox.applyVehicleSkin('c_skin', 'matte_black');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.equal(car.skin, undefined);
            assert.deepEqual(dcSpends, []);
        });
    });

    describe('terminateLease', () => {
        test('terminateLease scala la penale e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 50000;
            const car = {
                id: 'c_lease', name: 'Auto Leasing', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 60, leaseMonthlyRate: 1000
            };
            gs.fleet.push(car);
            // remainingDays = 300 -> remainingMonths = 10 -> penalty = 10 * 1000 * 0.5 = 5000
            sandbox.terminateLease('c_lease');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 45000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease'), false);
            assert.deepEqual(syncedCash, [45000]);
        });

        test('terminateLease con fondi insufficienti non cancella il leasing e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 2000;
            const car = {
                id: 'c_lease', name: 'Auto Leasing', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 60, leaseMonthlyRate: 1000
            };
            gs.fleet.push(car);
            sandbox.terminateLease('c_lease');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 2000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease'), true);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('returnToHub', () => {
        test('returnToHub scala le spese di rientro e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 50000;
            const car = { id: 'c_milan', currentPoiId: 'milano' };
            const driver = { id: 'd_milan', name: 'Luigi', assignedCarId: 'c_milan', status: 'idle' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            sandbox.returnToHub('c_milan');
            await new Promise(r => setImmediate(r));
            assert.ok(gs.cash < 50000);
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.deepEqual(syncedCash, [gs.cash]);
        });

        test('returnToHub con fondi insufficienti non avvia rientro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 5;
            const car = { id: 'c_milan', currentPoiId: 'milano' };
            const driver = { id: 'd_milan', name: 'Luigi', assignedCarId: 'c_milan', status: 'idle' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            sandbox.returnToHub('c_milan');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5);
            assert.equal(driver.status, 'idle');
            assert.deepEqual(syncedCash, []);
        });
    });
});
