'use strict';
/* ============================================================================
   test/economy/vtk-sync.test.js

   Regressione per il difetto di doppio conteggio in vtk-market.js:
   `rpc_fill_vtk_order` muove GIA' il saldo Driver Coins e VTK sul server (21_vtk_token.sql).
   Pertanto il client NON deve chiamare ServerState.spendDriverCoins / CE_money.spendDC,
   altrimenti il saldo DC viene addebitato due volte sul server.
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

    return { sandbox, gs: sandbox.gameState, chiamateDC, notifications: env.notifications };
}

describe('vtk-market — sincronizzazione Driver Coins col server (prevenzione doppio addebito)', () => {

    describe('vtkFillOrder', () => {
        test('vtkFillOrder invoca rpc_fill_vtk_order e NON chiama spendDriverCoins (il server ha già scalato i DC)', async () => {
            const { sandbox, gs, chiamateDC } = setupVTKEnv();
            gs.driverCoins = 50;
            gs.vtkBalance = 0;

            await sandbox.vtkFillOrder('ord_123', 10);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 0, 'spendDriverCoins NON deve essere chiamata: rpc_fill_vtk_order scala già i DC sul server');
        });

        test('vtkFillOrder anche se l eco realtime arriva durante la RPC non chiama spendDriverCoins', async () => {
            const { sandbox, gs, chiamateDC } = setupVTKEnv({
                rpc_fill_vtk_order: () => {
                    // Simula eco realtime dal server
                    gs.driverCoins = 50 - 10;
                    gs.vtkBalance = 0 + 50;
                    return {
                        data: { vtk_received: 50, dc_paid: 10 },
                        error: null,
                    };
                },
            });
            gs.driverCoins = 50;
            gs.vtkBalance = 0;

            await sandbox.vtkFillOrder('ord_123', 10);
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateDC.length, 0, 'nessuna chiamata ridondante a spendDriverCoins');
            assert.equal(gs.driverCoins, 40, 'il saldo locale rispecchia l eco del server');
            assert.equal(gs.vtkBalance, 50, 'il saldo VTK rispecchia l eco del server');
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

        test('vtkFillOrder se la RPC fallisce si ferma: notifica errore, nessun messaggio di successo', async () => {
            // Un errore RPC deve terminare il flusso: se il ramo error non facesse
            // return, il codice proseguirebbe nel percorso di successo e mostrerebbe
            // anche "✅ Acquistati N VTK!" su un ordine che il server ha rifiutato.
            const { sandbox, gs, notifications } = setupVTKEnv({
                rpc_fill_vtk_order: () => ({
                    data: null,
                    error: { message: 'Ordine già acquistato' },
                }),
            });

            gs.driverCoins = 50;

            await sandbox.vtkFillOrder('ord_123', 10);
            await new Promise(r => setImmediate(r));

            assert.ok(notifications.some(n => n.type === 'error'),
                'un fallimento RPC deve notificare un errore');
            assert.ok(!notifications.some(n => n.type === 'success'),
                'un fallimento RPC NON deve produrre alcuna notifica di successo');
        });
    });
});
