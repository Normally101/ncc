'use strict';
/* ============================================================================
   test/economy/engine-corse.test.js

   Regressione per le funzioni relative a corse e riparazioni in engine.js:
   ogni spesa e ogni incasso DEVONO passare da CE_money (spend / earn / addReputation)
   e sincronizzarsi col server (ServerState.syncCash).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEngineCorseEnv() {
    const syncedCash = [];
    const ceMoneyCalls = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    const origSpend = env.sandbox.CE_money.spend;
    env.sandbox.CE_money.spend = function (amount, reason) {
        ceMoneyCalls.push({ type: 'spend', amount, reason });
        return origSpend.apply(this, arguments);
    };

    const origEarn = env.sandbox.CE_money.earn;
    env.sandbox.CE_money.earn = function (amount, reason) {
        ceMoneyCalls.push({ type: 'earn', amount, reason });
        return origEarn.apply(this, arguments);
    };

    const origAddRep = env.sandbox.CE_money.addReputation;
    env.sandbox.CE_money.addReputation = function (delta) {
        ceMoneyCalls.push({ type: 'addReputation', delta });
        return origAddRep.apply(this, arguments);
    };

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, ceMoneyCalls };
}

describe('engine.js — corse e riparazioni (CE_money)', () => {

    describe('payToRepairCar', () => {
        test('offline: scala costo riparazione tramite CE_money.spend e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            sandbox.ServerState._setReady(false);

            gs.fleet = [{
                id: 'c1',
                _serverId: 's1',
                name: 'Auto Test',
                tier: 'business',
                condition: 40,
                isLease: false,
                outOfService: 'condition',
            }];
            gs.cash = 10000;
            const cost = sandbox.window.repairCostFor(gs.fleet[0]); // (100 - 40) * 85 = 5100
            const expectedCash = gs.cash - cost;

            await sandbox.window.payToRepairCar('c1');

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve scalare del costo riparazione');
            assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
            const spendCalls = ceMoneyCalls.filter(c => c.type === 'spend');
            assert.ok(spendCalls.length >= 1, 'deve passare da CE_money.spend');
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].outOfService, null);
        });

        test('offline con fondi insufficienti: non ripara e non sincronizza', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            sandbox.ServerState._setReady(false);

            gs.fleet = [{
                id: 'c1',
                _serverId: 's1',
                name: 'Auto Test',
                tier: 'business',
                condition: 40,
                isLease: false,
                outOfService: 'condition',
            }];
            gs.cash = 1000; // servono 5100

            await sandbox.window.payToRepairCar('c1');

            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.fleet[0].condition, 40);
            assert.equal(gs.fleet[0].outOfService, 'condition');
        });
    });

    describe('acceptDiamondContract', () => {
        test('accredita compenso tramite CE_money.earn e aumenta reputazione tramite CE_money.addReputation', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();

            gs.cash = 5000;
            gs.reputation = 4.5;
            gs.drivers = [
                { id: 'ceo', name: 'Tu (CEO)', status: 'idle' },
                { id: 'd1', name: 'Autista Elite', status: 'idle', level: 3, tier: 'ultra' },
            ];
            gs.fleet = [
                { id: 'c1', name: 'Majestic Spirit', tier: 'ultra', condition: 100 },
            ];
            gs.emails = [{
                id: 42,
                sender: 'Fondazione Diamond',
                subject: 'Servizio di Gala',
                type: 'diamond',
                offer: 35000,
                status: 'unread',
            }];

            sandbox.window.acceptDiamondContract(42);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000, 'il saldo locale deve aumentare di 35.000€');
            assert.deepEqual(syncedCash, [40000], 'ServerState.syncCash deve ricevere il nuovo saldo');
            const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
            assert.ok(earnCalls.length >= 1, 'deve passare da CE_money.earn');
            const repCalls = ceMoneyCalls.filter(c => c.type === 'addReputation');
            assert.ok(repCalls.length >= 1, 'deve passare da CE_money.addReputation');
            assert.equal(gs.diamondContractsCompleted, 1);
            assert.equal(gs.emails[0].status, 'resolved');
        });
    });

    describe('_triggerVIPMidRideEvent', () => {
        test('scelta A con costo scala denaro con CE_money.spend e incrementa reputazione con CE_money.addReputation', () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();

            gs.cash = 10000;
            gs.reputation = 3.0;
            gs.drivers = [{ id: 'd1', name: 'Marco', status: 'busy' }];

            // Mock document elements per gestire il toast VIP
            const ride = { id: 1, driverId: 'd1', tier: 'vip', toPoi: { name: 'Hotel de Russie' }, elapsed: 100, duration: 500 };

            // Forziamo il VIP event con costo (es. rose rosse, costo 500, rep 0.2)
            const VIP_EVENTS = vm.runInContext('VIP_EVENTS', sandbox);
            const evWithCost = VIP_EVENTS.find(e => e.costA > 0);
            assert.ok(evWithCost, 'deve esistere un evento con costA');

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0; // seleziona primo evento (rose rosse)

            const _triggerVIPMidRideEvent = vm.runInContext('_triggerVIPMidRideEvent', sandbox);
            _triggerVIPMidRideEvent(ride);

            const btnA = sandbox.document.getElementById('vip-toast-a');
            assert.ok(btnA, 'il toast deve mostrare il pulsante A');
            btnA.onclick();

            sandbox.Math.random = origRandom;

            assert.equal(gs.cash, 10000 - evWithCost.costA, 'il saldo deve scalare di costA');
            assert.deepEqual(syncedCash, [10000 - evWithCost.costA], 'ServerState.syncCash deve ricevere il nuovo saldo');
            const spendCalls = ceMoneyCalls.filter(c => c.type === 'spend');
            assert.ok(spendCalls.length >= 1, 'deve passare da CE_money.spend');
            const repCalls = ceMoneyCalls.filter(c => c.type === 'addReputation');
            assert.ok(repCalls.length >= 1, 'deve passare da CE_money.addReputation');
        });
    });
});
