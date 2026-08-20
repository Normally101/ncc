'use strict';
/* ============================================================================
   test/rides/rides-sync.test.js

   Regressione per il bug economico in engine-rides.js:
   tutte le funzioni di incasso cassa e Driver Coins DEVONO passare da CE_money
   (earn / earnDC) e sincronizzare col server tramite ServerState.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupRidesEnv() {
    const syncedCash = [];
    const addedDC = [];
    const ceMoneyCalls = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            addDriverCoins: async (n, motivo) => {
                addedDC.push({ amount: n, reason: motivo });
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
        },
    });

    const origEarn = env.sandbox.CE_money.earn;
    env.sandbox.CE_money.earn = function (amount, reason) {
        ceMoneyCalls.push({ type: 'earn', amount, reason });
        return origEarn.apply(this, arguments);
    };

    const origEarnDC = env.sandbox.CE_money.earnDC;
    env.sandbox.CE_money.earnDC = function (amount, reason) {
        ceMoneyCalls.push({ type: 'earnDC', amount, reason });
        return origEarnDC.apply(this, arguments);
    };

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, addedDC, ceMoneyCalls };
}

describe('engine-rides — sincronizzazione cassa e DC col server (CE_money)', () => {

    describe('completeRide con pagamento immediato (_deferPay = false)', () => {
        test('accredita incasso tramite CE_money.earn e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupRidesEnv();
            gs.cash = 1000;
            gs.drivers.push({
                id: 'd1', name: 'Mario', status: 'busy', queue: [],
                assignedCarId: 'c1', level: 0, trait: null,
            });
            gs.fleet.push({
                id: 'c1', name: 'Berlina', tier: 'standard', condition: 100,
                vehicleClass: 'stellar_e_exec', upgrades: [],
            });

            const ride = {
                id: 1, driverId: 'd1', tier: 'standard', price: 200,
                fromPoi: { id: 'p1', region: 'lazio', name: 'Roma Centro' },
                toPoi: { id: 'p2', region: 'lazio', name: 'Roma Nord' },
            };

            sandbox.completeRide(ride, false);
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash > 1000, 'il saldo deve essere aumentato');
            const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
            assert.ok(earnCalls.length >= 1, 'completeRide deve passare da CE_money.earn');
            assert.ok(syncedCash.length >= 1, 'il nuovo saldo deve essere sincronizzato sul server');
            assert.equal(syncedCash[syncedCash.length - 1], gs.cash);
        });
    });

    describe('completeRide con mancia extra Charmante', () => {
        test('accredita bonus Charmante tramite CE_money.earn e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupRidesEnv();
            gs.cash = 5000;
            gs.drivers.push({
                id: 'd1', name: 'Jean-Luc', status: 'busy', queue: [],
                assignedCarId: 'c1', level: 0,
                trait: { id: 'charmante', name: 'Charmante' },
            });
            gs.fleet.push({
                id: 'c1', name: 'Limousine', tier: 'ultra', condition: 100,
                vehicleClass: 'stellar_s_imp', upgrades: [],
            });

            const origRandom = sandbox.Math.random;
            // Forza il trigger del 10% per il tratto charmante (e disattiva altri random come DC drop o incidente)
            sandbox.Math.random = function () { return 0.01; };

            const ride = {
                id: 2, driverId: 'd1', tier: 'ultra', price: 500,
                fromPoi: { id: 'p1', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'p2', region: 'lazio', name: 'Fiumicino' },
            };

            sandbox.completeRide(ride, true);
            await new Promise(r => setImmediate(r));
            sandbox.Math.random = origRandom;

            const charmanteEarn = ceMoneyCalls.find(c => c.reason === 'charmante_tip');
            assert.ok(charmanteEarn, 'il bonus charmante deve passare da CE_money.earn');
            assert.ok(charmanteEarn.amount >= 250, 'il bonus deve essere almeno 250€');
            assert.ok(syncedCash.includes(gs.cash), 'ServerState.syncCash deve aver ricevuto il nuovo saldo');
        });
    });

    describe('completeRide con drop Driver Coins (Ultra)', () => {
        test('accredita Driver Coins tramite CE_money.earnDC e chiama ServerState.addDriverCoins', async () => {
            const { sandbox, gs, addedDC, ceMoneyCalls } = setupRidesEnv();
            gs.driverCoins = 10;
            gs.drivers.push({
                id: 'd1', name: 'Mario', status: 'busy', queue: [],
                assignedCarId: 'c1', level: 0, trait: null,
            });
            gs.fleet.push({
                id: 'c1', name: 'Presidenziale', tier: 'ultra', condition: 100,
                vehicleClass: 'stellar_s_imp', upgrades: [],
            });

            const origRandom = sandbox.Math.random;
            // random < 0.05 attiva il drop DC
            sandbox.Math.random = function () { return 0.02; };

            const ride = {
                id: 3, driverId: 'd1', tier: 'ultra', price: 800,
                fromPoi: { id: 'p1', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'p2', region: 'lazio', name: 'Fiumicino' },
            };

            sandbox.completeRide(ride, true);
            await new Promise(r => setImmediate(r));
            sandbox.Math.random = origRandom;

            assert.ok(gs.driverCoins > 10, 'i Driver Coins devono essere aumentati');
            const dcCalls = ceMoneyCalls.filter(c => c.type === 'earnDC');
            assert.ok(dcCalls.length >= 1, 'il drop DC deve passare da CE_money.earnDC');
            assert.ok(addedDC.length >= 1, 'ServerState.addDriverCoins deve essere stato chiamato');
        });
    });

    describe('checkActiveTrips', () => {
        test('accredita guadagni viaggio tramite CE_money.earn e fa un solo syncCash col totale finale', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupRidesEnv();
            gs.cash = 2000;
            gs.drivers.push(
                { id: 'd1', name: 'Mario', status: 'busy', queue: [] },
                { id: 'd2', name: 'Luigi', status: 'busy', queue: [] },
            );
            gs.activeTrips = [
                { id: 101, driverId: 'd1', driverName: 'Mario', toName: 'Milano', earnings: 350, endTime: Date.now() - 5000 },
                { id: 102, driverId: 'd2', driverName: 'Luigi', toName: 'Torino', earnings: 450, endTime: Date.now() - 5000 },
            ];

            sandbox.checkActiveTrips();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2800, 'il saldo deve includere entrambi i viaggi (2000 + 350 + 450)');
            const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
            assert.equal(earnCalls.length, 1, 'checkActiveTrips deve chiamare CE_money.earn una sola volta col totale');
            assert.equal(earnCalls[0].amount, 800, 'l\'importo passato a CE_money.earn deve essere la somma dei viaggi');
            assert.equal(syncedCash.length, 1, 'deve esserci un solo syncCash col totale finale');
            assert.equal(syncedCash[0], 2800);
        });

        test('nessun viaggio completato: non chiama CE_money.earn né syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupRidesEnv();
            gs.cash = 2000;
            gs.activeTrips = [
                { id: 103, driverId: 'd1', driverName: 'Mario', toName: 'Milano', earnings: 350, endTime: Date.now() + 60000 },
            ];

            sandbox.checkActiveTrips();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2000);
            assert.equal(ceMoneyCalls.length, 0, 'nessuna chiamata a CE_money se nessun viaggio è completato');
            assert.equal(syncedCash.length, 0, 'nessuna sincronizzazione se non ci sono incassi');
        });
    });
});
