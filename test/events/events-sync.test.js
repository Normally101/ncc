'use strict';
/* ============================================================================
   test/events/events-sync.test.js

   Regressione per il bug economico in engine-events.js:
   tutte le funzioni di accredito o spesa valuta DEVONO passare da CE_money
   (spend / earn / spendDC / earnDC / addReputation) e sincronizzare la cassa
   col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEventsEnv() {
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

describe('engine-events — sincronizzazione cassa e reputazione col server (CE_money)', () => {

    describe('_maybeParazziEvent', () => {
        test('mancia paparazzi VIP accredita il bonus e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupEventsEnv();
            gs.hour = 23; // notte (>= 22 || < 5)
            gs.cash = 1000;
            gs.reputation = 4.0;
            gs.drivers = [{ id: 'drv1', name: 'Mario' }];
            gs.activeRides = [
                { tier: 'vip', price: 500, driverId: 'drv1' }
            ];

            // Mock Math.random:
            // 1) random > 0.12 -> 0.05 (non scarta)
            // 2) scelta ride -> 0
            // 3) roll evento -> 0.2 (roll < 0.5 -> bonus mancia 40%)
            const originalRandom = sandbox.Math.random;
            let callCount = 0;
            sandbox.Math.random = () => {
                callCount++;
                if (callCount === 1) return 0.05;
                if (callCount === 2) return 0.0;
                if (callCount === 3) return 0.2;
                return 0.5;
            };

            try {
                sandbox._maybeParazziEvent();
                await new Promise(r => setImmediate(r));

                // bonus = floor(500 * 0.40) = 200 -> cash atteso = 1200
                assert.equal(gs.cash, 1200, 'il cash locale deve riflettere il bonus ricevuto');
                assert.deepEqual(syncedCash, [1200], 'ServerState.syncCash deve essere chiamato con il saldo aggiornato');
                assert.equal(Math.round(gs.reputation * 100) / 100, 4.05, 'la reputazione deve aumentare di 0.05');
            } finally {
                sandbox.Math.random = originalRandom;
            }
        });

        test('scandalo paparazzi riduce reputazione tramite CE_money.addReputation senza toccare cassa', async () => {
            const { sandbox, gs, syncedCash } = setupEventsEnv();
            gs.hour = 1; // notte
            gs.cash = 1000;
            gs.reputation = 4.0;
            gs.drivers = [{ id: 'drv1', name: 'Mario' }];
            gs.activeRides = [
                { tier: 'ultra', price: 1000, driverId: 'drv1' }
            ];

            const originalRandom = sandbox.Math.random;
            let callCount = 0;
            sandbox.Math.random = () => {
                callCount++;
                if (callCount === 1) return 0.05;
                if (callCount === 2) return 0.0;
                if (callCount === 3) return 0.6; // 0.5 <= roll < 0.80 -> scandalo
                return 0.5;
            };

            try {
                sandbox._maybeParazziEvent();
                await new Promise(r => setImmediate(r));

                assert.equal(gs.cash, 1000, 'il cash non deve cambiare');
                assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione cassa');
                assert.equal(Math.round(gs.reputation * 100) / 100, 3.92, 'la reputazione deve diminuire di 0.08');
            } finally {
                sandbox.Math.random = originalRandom;
            }
        });

        test('momento virale paparazzi incrementa reputazione rispettando il prestigio tramite CE_money', async () => {
            const { sandbox, gs, syncedCash } = setupEventsEnv();
            gs.hour = 2; // notte
            gs.cash = 1000;
            gs.prestige = 1;
            gs.reputation = 5.0; // oltre 5.0 grazie a prestige 1 (tetto 6.0)
            gs.drivers = [{ id: 'drv1', name: 'Mario' }];
            gs.activeRides = [
                { tier: 'vip', price: 800, driverId: 'drv1' }
            ];

            const originalRandom = sandbox.Math.random;
            let callCount = 0;
            sandbox.Math.random = () => {
                callCount++;
                if (callCount === 1) return 0.05;
                if (callCount === 2) return 0.0;
                if (callCount === 3) return 0.9; // roll >= 0.80 -> momento virale (+0.15 rep)
                return 0.5;
            };

            try {
                sandbox._maybeParazziEvent();
                await new Promise(r => setImmediate(r));

                assert.equal(gs.cash, 1000);
                assert.deepEqual(syncedCash, []);
                assert.equal(Math.round(gs.reputation * 100) / 100, 5.15, 'con prestigio 1 la reputazione deve poter superare 5.0');
            } finally {
                sandbox.Math.random = originalRandom;
            }
        });
    });

    describe('_triggerBankruptcy', () => {
        test('riporta la cassa a 800€ con saldo negativo e sincronizza col server via CE_money', async () => {
            const { sandbox, gs, syncedCash } = setupEventsEnv();
            gs.cash = -5000;
            gs.fleet = [
                { id: 'car1', isLease: false },
                { id: 'car2', isLease: false },
            ];
            gs.drivers = [{ id: 'drv1', assignedCarId: 'car1' }];

            sandbox._triggerBankruptcy();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 800, 'il cash deve essere rialzato a 800');
            assert.deepEqual(syncedCash, [800], 'il server deve ricevere il cash 800');
            assert.equal(gs.fleet.length, 1, 'una vettura deve essere confiscata');
        });

        test('con cassa già >= 800 non aggiunge fondi superflui', async () => {
            const { sandbox, gs, syncedCash } = setupEventsEnv();
            gs.cash = 1500;
            gs.fleet = [{ id: 'car1', isLease: false }];
            gs.drivers = [];

            sandbox._triggerBankruptcy();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1500, 'il cash non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata earn/syncCash');
        });
    });
});
