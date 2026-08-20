'use strict';
/* ============================================================================
   test/daily/daily-orders-sync.test.js

   Regressione per il bug economico in daily-orders.js:
   tutte le funzioni che accreditano valuta (cash / Driver Coins / reputazione)
   DEVONO passare dalla porta unica CE_money (earn / earnDC / addReputation)
   e sincronizzare con ServerState (syncCash / addDriverCoins).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupDailyOrdersEnv() {
    const syncedCash = [];
    const addedDC = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            addDriverCoins: async (amount, motivo) => {
                addedDC.push({ amount, motivo });
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, addedDC };
}

describe('daily-orders — sincronizzazione cassa, DC e reputazione col server (CE_money)', () => {

    test('1. claimDailyOrder con ricompensa cash accredita denaro e chiama ServerState.syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupDailyOrdersEnv();
        gs.cash = 1000;
        gs.todayEarnings = 5000;
        gs.questStats.totalRides = 0; // tier 'new' -> target 2000, rw: { cash: 500 }
        gs.dailyOrders = {
            day: gs.day,
            picks: [{ id: 'earn', base: 0 }],
            claimed: [],
        };

        sandbox.claimDailyOrder('earn');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 1500, 'il saldo locale deve aumentare di €500');
        assert.ok(gs.dailyOrders.claimed.includes('earn'), 'l\'ordine deve risultare riscosso');
        assert.deepEqual(syncedCash, [1500], 'syncCash deve ricevere il nuovo saldo via CE_money.earn');
    });

    test('2. claimDailyOrder con ricompensa DC accredita DC e chiama ServerState.addDriverCoins via CE_money', async () => {
        const { sandbox, gs, addedDC } = setupDailyOrdersEnv();
        gs.driverCoins = 10;
        gs.questStats.totalRides = 5; // tier 'new' -> target 3, rw: { dc: 2 }
        gs.dailyOrders = {
            day: gs.day,
            picks: [{ id: 'rides', base: 0 }],
            claimed: [],
        };

        sandbox.claimDailyOrder('rides');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.driverCoins, 12, 'i DC locali devono aumentare di 2');
        assert.ok(gs.dailyOrders.claimed.includes('rides'), 'l\'ordine deve risultare riscosso');
        assert.equal(addedDC.length, 1, 'addDriverCoins deve essere chiamata una volta');
        assert.equal(addedDC[0].amount, 2);
        assert.equal(addedDC[0].motivo, 'daily_order_rides');
    });

    test('3. ordine non completato non accredita denaro né DC e non chiama ServerState', async () => {
        const { sandbox, gs, syncedCash, addedDC } = setupDailyOrdersEnv();
        gs.cash = 1000;
        gs.driverCoins = 10;
        gs.todayEarnings = 100; // target 2000 non raggiunto
        gs.questStats.totalRides = 0;
        gs.dailyOrders = {
            day: gs.day,
            picks: [{ id: 'earn', base: 0 }, { id: 'rides', base: 0 }],
            claimed: [],
        };

        sandbox.claimDailyOrder('earn');
        sandbox.claimDailyOrder('rides');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 1000);
        assert.equal(gs.driverCoins, 10);
        assert.deepEqual(syncedCash, []);
        assert.deepEqual(addedDC, []);
        assert.equal(gs.dailyOrders.claimed.length, 0);
    });

    test('4. ordine già riscosso non accredita di nuovo', async () => {
        const { sandbox, gs, syncedCash } = setupDailyOrdersEnv();
        gs.cash = 1000;
        gs.todayEarnings = 5000;
        gs.questStats.totalRides = 0;
        gs.dailyOrders = {
            day: gs.day,
            picks: [{ id: 'earn', base: 0 }],
            claimed: ['earn'],
        };

        sandbox.claimDailyOrder('earn');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 1000);
        assert.deepEqual(syncedCash, []);
    });
});
