'use strict';
/* ============================================================================
   test/rides/rides-sync.test.js

   Regressione per il bug economico in engine-rides.js:
   tutte le funzioni di incasso e valuta DEVONO passare da CE_money (earn / earnDC)
   e sincronizzare con ServerState (syncCash / addDriverCoins).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupRidesEnv() {
    const syncedCash = [];
    const addedDC = [];
    const earnCalls = [];
    const earnDCCalls = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            addDriverCoins: async (n, motivo) => {
                addedDC.push([n, motivo]);
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
        },
    });

    const origEarn = env.sandbox.CE_money.earn;
    env.sandbox.CE_money.earn = function (amount, reason) {
        earnCalls.push([amount, reason]);
        return origEarn.apply(this, arguments);
    };

    const origEarnDC = env.sandbox.CE_money.earnDC;
    env.sandbox.CE_money.earnDC = function (qty, reason) {
        earnDCCalls.push([qty, reason]);
        return origEarnDC.apply(this, arguments);
    };

    return {
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        syncedCash,
        addedDC,
        earnCalls,
        earnDCCalls,
    };
}

describe('engine-rides — sincronizzazione valute col server (CE_money)', () => {

    describe('completeRide — pagamento immediato (_deferPay = false)', () => {
        test('accredita incasso tramite CE_money.earn e sincronizza cassa', async () => {
            const { sandbox, gs, syncedCash, earnCalls } = setupRidesEnv();
            gs.cash = 1000;
            const car = { id: 'car1', name: 'Auto Test', condition: 100, upgrades: [], vehicleClass: 'stellar_e_exec', tier: 'business' };
            const driver = { id: 'd1', name: 'Autista Test', status: 'busy', assignedCarId: 'car1', queue: [], level: 0 };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            const ride = {
                id: 101,
                driverId: 'd1',
                price: 200,
                tier: 'business',
                fromPoi: { id: 'p1', name: 'Poi A', region: 'lazio' },
                toPoi: { id: 'p2', name: 'Poi B', region: 'lazio' },
            };

            sandbox.completeRide(ride, false);
            await new Promise(r => setImmediate(r));

            assert.ok(earnCalls.length >= 1, 'completeRide deve chiamare CE_money.earn');
            assert.ok(gs.cash > 1000, 'il saldo cassa deve essere incrementato');
            assert.ok(syncedCash.includes(gs.cash), 'la cassa deve essere sincronizzata col server tramite ServerState.syncCash');
        });
    });

    describe('completeRide — mancia extra tratto Charmante', () => {
        test('accredita mancia Charmante tramite CE_money.earn e sincronizza cassa', async () => {
            const { sandbox, gs, syncedCash, earnCalls } = setupRidesEnv();
            gs.cash = 1000;
            const car = { id: 'car1', name: 'Auto Test', condition: 100, upgrades: [], vehicleClass: 'stellar_s_imp', tier: 'ultra' };
            const driver = {
                id: 'd1',
                name: 'Autista Charmante',
                status: 'busy',
                assignedCarId: 'car1',
                queue: [],
                level: 0,
                trait: { id: 'charmante', name: 'Charmante', vipTipMult: 1.15 },
            };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            const ride = {
                id: 102,
                driverId: 'd1',
                price: 500,
                tier: 'ultra',
                fromPoi: { id: 'p1', name: 'Poi A', region: 'lazio' },
                toPoi: { id: 'p2', name: 'Poi B', region: 'lazio' },
            };

            // Forziamo Math.random per triggerare la mancia Charmante (< 0.10) e non altri branch casuali
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            try {
                sandbox.completeRide(ride, false);
            } finally {
                sandbox.Math.random = origRandom;
            }
            await new Promise(r => setImmediate(r));

            const charmanteEarn = earnCalls.find(c => c[1] === 'charmante_tip');
            assert.ok(charmanteEarn, 'la mancia Charmante deve passare da CE_money.earn con motivo charmante_tip');
            assert.ok(charmanteEarn[0] >= 250, 'importo mancia valido');
            assert.ok(syncedCash.includes(gs.cash), 'il saldo post-mancia deve essere inviato al server');
        });
    });

    describe('completeRide — drop F2P Driver Coins su corse Ultra', () => {
        test('accredita DC tramite CE_money.earnDC e chiama addDriverCoins RPC', async () => {
            const { sandbox, gs, addedDC, earnDCCalls } = setupRidesEnv();
            gs.driverCoins = 5;
            const car = { id: 'car1', name: 'Auto Test', condition: 100, upgrades: [], vehicleClass: 'stellar_s_imp', tier: 'ultra' };
            const driver = { id: 'd1', name: 'Autista Test', status: 'busy', assignedCarId: 'car1', queue: [], level: 0 };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            const ride = {
                id: 103,
                driverId: 'd1',
                price: 500,
                tier: 'ultra',
                fromPoi: { id: 'p1', name: 'Poi A', region: 'lazio' },
                toPoi: { id: 'p2', name: 'Poi B', region: 'lazio' },
            };

            // Forziamo Math.random per triggerare il drop DC (< 0.05)
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.02;
            try {
                sandbox.completeRide(ride, false);
            } finally {
                sandbox.Math.random = origRandom;
            }
            await new Promise(r => setImmediate(r));

            assert.ok(earnDCCalls.length >= 1, 'il drop DC deve passare da CE_money.earnDC');
            assert.equal(earnDCCalls[0][1], 'ultra_ride_drop');
            assert.ok(addedDC.length >= 1, 'addDriverCoins deve essere chiamato');
            assert.equal(addedDC[0][1], 'ultra_ride_drop');
        });
    });

    describe('checkActiveTrips — accredito viaggi differiti', () => {
        test('accredita guadagni viaggio completato tramite CE_money.earn e sincronizza cassa', async () => {
            const { sandbox, gs, syncedCash, earnCalls } = setupRidesEnv();
            gs.cash = 500;
            gs.drivers.push({ id: 'd1', name: 'Autista Test', status: 'busy', queue: [] });
            gs.activeTrips.push({
                id: 'trip1',
                driverId: 'd1',
                driverName: 'Autista Test',
                toName: 'Milano',
                earnings: 350,
                endTime: Date.now() - 1000,
            });

            sandbox.checkActiveTrips();
            await new Promise(r => setImmediate(r));

            assert.ok(earnCalls.length >= 1, 'checkActiveTrips deve chiamare CE_money.earn');
            assert.equal(earnCalls[0][0], 350);
            assert.equal(gs.cash, 850);
            assert.ok(syncedCash.includes(850), 'la cassa deve essere sincronizzata col server');
        });
    });
});
