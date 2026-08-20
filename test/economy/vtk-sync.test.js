'use strict';
/* ============================================================================
   test/economy/vtk-sync.test.js

   Regressione per il bug economico in vtk-market.js:
   tutte le funzioni di spesa DC (es. vtkFillOrder) DEVONO passare da CE_money
   (spendDC) e persistere la spesa autoritativa sul server tramite
   ServerState.spendDriverCoins.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupVTKEnv(rpcResponses = {}) {
    const chiamateDC = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
        },
    });

    const { sandbox } = env;
    sandbox.currentUser = { id: 'test_user_me' };
    sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            if (rpcResponses[fn]) {
                const res = typeof rpcResponses[fn] === 'function' ? rpcResponses[fn](params) : rpcResponses[fn];
                return res;
            }
            if (fn === 'rpc_fill_vtk_order') {
                return {
                    data: { vtk_received: 50, dc_paid: params.v_order_id ? 10 : 0 },
                    error: null,
                };
            }
            return { data: null, error: null };
        },
    };
    sandbox.window.supabaseClient = sandbox.supabaseClient;

    return { sandbox, gs: sandbox.gameState, chiamateDC };
}

describe('vtk-market — sincronizzazione Driver Coins col server (CE_money)', () => {

    describe('vtkFillOrder', () => {
        test('vtkFillOrder scala DC tramite ServerState.spendDriverCoins (CE_money.spendDC)', async () => {
            const { sandbox, gs, chiamateDC } = setupVTKEnv();
            gs.driverCoins = 50;
            gs.vtkBalance = 0;

            await sandbox.vtkFillOrder('ord_123', 10);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 1, 'spendDriverCoins deve essere chiamata esattamente una volta');
            assert.equal(chiamateDC[0].n, 10, 'la spesa deve essere di 10 DC');
            assert.equal(gs.driverCoins, 40, 'il saldo locale DC deve essere scalato');
        });

        test('vtkFillOrder con DC insufficienti non chiama né la RPC né spendDriverCoins', async () => {
            let rpcCalled = false;
            const { sandbox, gs, chiamateDC } = setupVTKEnv({
                rpc_fill_vtk_order: () => {
                    rpcCalled = true;
                    return { data: { vtk_received: 50 }, error: null };
                },
            });

            gs.driverCoins = 5;

            await sandbox.vtkFillOrder('ord_123', 10);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcCalled, false, 'con DC insufficienti la RPC non deve partire');
            assert.equal(chiamateDC.length, 0, 'spendDriverCoins non deve essere chiamata');
            assert.equal(gs.driverCoins, 5, 'il saldo DC non deve cambiare');
        });

        test('vtkFillOrder se la RPC fallisce non chiama spendDriverCoins e non tocca DC', async () => {
            const { sandbox, gs, chiamateDC } = setupVTKEnv({
                rpc_fill_vtk_order: () => ({
                    data: null,
                    error: { message: 'Ordine già acquistato' },
                }),
            });

            gs.driverCoins = 50;

            await sandbox.vtkFillOrder('ord_123', 10);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 0, 'in caso di errore RPC non deve spendere DC');
            assert.equal(gs.driverCoins, 50, 'il saldo DC non deve cambiare');
        });
    });
});
