'use strict';
/* ============================================================================
   test/economy/vtk-sync.test.js

   Regressione per il bug economico in vtk-market.js:
   le spese in Driver Coins DEVONO passare da CE_money (spendDC)
   e persistere la spesa sul server tramite ServerState.spendDriverCoins.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupVtkEnv(opzioni = {}) {
    const { rpcResult, rpcError } = opzioni;
    const chiamateDC = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
        },
    });

    // Mock supabaseClient per il mercato P2P VTK
    env.sandbox.supabaseClient = {
        rpc: async (fnName, params) => {
            if (rpcError) return { data: null, error: rpcError };
            if (fnName === 'rpc_fill_vtk_order') {
                return { data: rpcResult || { vtk_received: 50 }, error: null };
            }
            if (fnName === 'rpc_get_vtk_market_orders') {
                return { data: [], error: null };
            }
            return { data: null, error: null };
        },
    };
    env.sandbox.window.supabaseClient = env.sandbox.supabaseClient;

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateDC };
}

describe('vtk-market — sincronizzazione valuta col server (CE_money)', () => {

    describe('vtkFillOrder', () => {
        test('acquisto ordine VTK spende DC tramite ServerState.spendDriverCoins (CE_money.spendDC)', async () => {
            const { sandbox, gs, chiamateDC } = setupVtkEnv({ rpcResult: { vtk_received: 100 } });
            gs.driverCoins = 50;
            gs.vtkBalance = 10;

            await sandbox.vtkFillOrder('order_1', 20);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 1, 'spendDriverCoins deve essere chiamata sul server');
            assert.equal(chiamateDC[0].n, 20);
            assert.equal(gs.driverCoins, 30);
            assert.equal(gs.vtkBalance, 110);
        });

        test('fondi DC insufficienti: non chiama spendDriverCoins e non accredita VTK', async () => {
            const { sandbox, gs, chiamateDC } = setupVtkEnv({ rpcResult: { vtk_received: 100 } });
            gs.driverCoins = 10;
            gs.vtkBalance = 0;

            await sandbox.vtkFillOrder('order_1', 25);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 0, 'nessuna chiamata RPC se i DC sono insufficienti');
            assert.equal(gs.driverCoins, 10);
            assert.equal(gs.vtkBalance, 0);
        });

        test('errore RPC backend: non scala DC e non accredita VTK', async () => {
            const { sandbox, gs, chiamateDC } = setupVtkEnv({ rpcError: { message: 'Order already filled' } });
            gs.driverCoins = 50;
            gs.vtkBalance = 0;

            await sandbox.vtkFillOrder('order_1', 20);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 0, 'nessuna spesa DC se l\'ordine fallisce sul server');
            assert.equal(gs.driverCoins, 50);
            assert.equal(gs.vtkBalance, 0);
        });
    });
});
