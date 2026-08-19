'use strict';
/* ============================================================================
   test/events/black-ops-sync.test.js

   Regressione per il bug economico in black_ops.js:
   tutte le funzioni di spesa DEVONO passare da CE_money (spend)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupShadowEnv(rpcOverrides = {}) {
    const syncedCash = [];
    const rpcCalls = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    // Mock supabaseClient per consentire le operazioni di black_ops
    const supabaseClient = {
        rpc: async (name, params) => {
            rpcCalls.push({ name, params });
            if (rpcOverrides[name]) {
                return rpcOverrides[name](params);
            }
            if (name === 'rpc_execute_shadow_op') {
                return { data: { success: true, result: {} }, error: null };
            }
            if (name === 'rpc_upgrade_shadow_defense') {
                const curLvl = env.sandbox.gameState._shadowDefenseLevel || 0;
                return { data: { new_level: curLvl + 1 }, error: null };
            }
            if (name === 'rpc_get_shadow_targets') {
                return { data: [], error: null };
            }
            if (name === 'rpc_get_shadow_ops_log') {
                return { data: [], error: null };
            }
            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = supabaseClient;
    env.sandbox.window.supabaseClient = supabaseClient;

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, rpcCalls };
}

describe('black_ops — sincronizzazione cassa col server (CE_money)', () => {

    describe('shadowExecuteOp', () => {
        test('eseguire operazione ombra scala il costo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShadowEnv();
            gs.cash = 100000;
            sandbox._shadowState.targets = [{ user_id: 'target_1', name: 'Rival Corp', reputation: 4.0, defense_lvl: 0 }];

            // spy_fleet costa 15.000€
            await sandbox.shadowExecuteOp('target_1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000, 'il saldo locale deve essere scalato del costo operazione');
            assert.deepEqual(syncedCash, [85000], 'syncCash deve ricevere il saldo aggiornato');
        });

        test('buy_off_client attiva l\'evento dinamico e sincronizza la cassa', async () => {
            const { sandbox, gs, syncedCash } = setupShadowEnv();
            gs.cash = 100000;
            sandbox._shadowState.targets = [{ user_id: 'target_1', name: 'Rival Corp' }];

            // buy_off_client costa 40.000€
            await sandbox.shadowExecuteOp('target_1', 'buy_off_client');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 60000);
            assert.deepEqual(syncedCash, [60000]);
            assert.equal(gs.activeDynamicEvent?.id, 'shadow_vip_boost');
        });

        test('fondi insufficienti: non esegue operazione e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupShadowEnv();
            gs.cash = 5000;
            sandbox._shadowState.targets = [{ user_id: 'target_1', name: 'Rival Corp' }];

            // spy_fleet costa 15.000€
            await sandbox.shadowExecuteOp('target_1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il cash non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash se mancano i fondi');
            assert.equal(rpcCalls.length, 0, 'la RPC supabase non deve essere chiamata');
        });

        test('target non valido: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupShadowEnv();
            gs.cash = 100000;
            sandbox._shadowState.targets = [{ user_id: 'target_1', name: 'Rival Corp' }];

            await sandbox.shadowExecuteOp('non_existent_target', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('operazione non valida: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupShadowEnv();
            gs.cash = 100000;
            sandbox._shadowState.targets = [{ user_id: 'target_1', name: 'Rival Corp' }];

            await sandbox.shadowExecuteOp('target_1', 'unknown_op');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('errore RPC: rimborsa la spesa e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShadowEnv({
                rpc_execute_shadow_op: async () => ({ data: null, error: new Error('DB error') }),
            });
            gs.cash = 100000;
            sandbox._shadowState.targets = [{ user_id: 'target_1', name: 'Rival Corp' }];

            await sandbox.shadowExecuteOp('target_1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            // spend 15k -> 85k, refund 15k -> 100k
            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, [85000, 100000]);
        });
    });

    describe('shadowUpgradeDefense', () => {
        test('potenziare difesa scala il costo del tier e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShadowEnv();
            gs.cash = 100000;
            gs._shadowDefenseLevel = 0;

            // Tier 1 (Guardia Base) costa 50.000€
            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo locale deve essere scalato del costo upgrade');
            assert.equal(gs._shadowDefenseLevel, 1, 'il livello difesa deve salire a 1');
            assert.deepEqual(syncedCash, [50000], 'syncCash deve ricevere il saldo aggiornato');
        });

        test('fondi insufficienti: non potenzia difesa e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupShadowEnv();
            gs.cash = 20000;
            gs._shadowDefenseLevel = 0;

            // Tier 1 costa 50.000€
            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000);
            assert.equal(gs._shadowDefenseLevel, 0);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('difesa già al massimo (lv. 5): non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupShadowEnv();
            gs.cash = 1000000;
            gs._shadowDefenseLevel = 5;

            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000000);
            assert.equal(gs._shadowDefenseLevel, 5);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('errore RPC: rimborsa costo tier e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShadowEnv({
                rpc_upgrade_shadow_defense: async () => ({ data: null, error: new Error('DB error') }),
            });
            gs.cash = 100000;
            gs._shadowDefenseLevel = 0;

            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            // Tier 1 costa 50k: spend 50k -> 50k, refund 50k -> 100k
            assert.equal(gs.cash, 100000);
            assert.equal(gs._shadowDefenseLevel, 0);
            assert.deepEqual(syncedCash, [50000, 100000]);
        });
    });
});
