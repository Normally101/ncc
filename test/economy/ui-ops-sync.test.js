'use strict';
/* ============================================================================
   test/economy/ui-ops-sync.test.js

   Regressione per il bug economico in ui-ops.js:
   tutte le funzioni di spesa e incasso DEVONO passare dalla porta unica CE_money
   (spendDC / spend / earn) e sincronizzare con ServerState (es. spendDriverCoins / syncCash).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupOpsEnv() {
    const chiamateDC = [];
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateDC, syncedCash };
}

describe('ui-ops — sincronizzazione movimenti Driver Coins e denaro col server', () => {

    describe('buyHRAutomation', () => {
        test('buyHRAutomation spende 5 DC tramite ServerState.spendDriverCoins (CE_money.spendDC)', async () => {
            const { sandbox, gs, chiamateDC } = setupOpsEnv();
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'drv1', name: 'Mario', isOnStrike: true, status: 'strike', satisfaction: 30, morale: 40 },
                { id: 'drv2', name: 'Luigi', isOnStrike: false, status: 'idle', satisfaction: 80, morale: 80 },
            ];

            sandbox.buyHRAutomation();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 5, 'i DC locali devono essere scalati di 5');
            assert.equal(chiamateDC.length, 1, 'spendDriverCoins deve essere chiamata una volta');
            assert.equal(chiamateDC[0].n, 5, 'la quantita spesa deve essere 5 DC');
            assert.ok(gs.hrAutomationExpiresAt, 'deve impostare hrAutomationExpiresAt');
            assert.equal(gs.drivers[0].isOnStrike, false, 'lo sciopero deve essere revocato');
            assert.equal(gs.drivers[0].status, 'idle', 'lo stato deve tornare idle');
            assert.equal(gs.drivers[0].satisfaction, 55, 'la soddisfazione minima deve essere 55');
            assert.equal(gs.drivers[0].morale, 60, 'il morale deve aumentare di 20');
        });

        test('buyHRAutomation con DC insufficienti non scala valuta, non chiama la RPC e non modifica lo stato', async () => {
            const { sandbox, gs, chiamateDC } = setupOpsEnv();
            gs.driverCoins = 3;
            gs.hrAutomationExpiresAt = null;
            gs.drivers = [
                { id: 'drv1', name: 'Mario', isOnStrike: true, status: 'strike', satisfaction: 30, morale: 40 },
            ];

            sandbox.buyHRAutomation();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 3, 'i DC non devono essere modificati');
            assert.equal(chiamateDC.length, 0, 'nessuna chiamata RPC se i fondi non bastano');
            assert.equal(gs.hrAutomationExpiresAt, null, 'la scadenza non deve essere impostata');
            assert.equal(gs.drivers[0].isOnStrike, true, 'lo sciopero deve restare attivo');
        });
    });
});
