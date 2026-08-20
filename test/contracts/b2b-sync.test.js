'use strict';
/* ============================================================================
   test/contracts/b2b-sync.test.js

   Regressione per il bug economico in b2b.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn / addReputation)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupB2BEnv(rpcHandler) {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    env.sandbox.currentUser = { id: 'usr_test_123' };
    env.sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            if (rpcHandler) return rpcHandler(fn, params);
            return { data: null, error: null };
        },
    };
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('b2b — sincronizzazione cassa e reputazione col server (CE_money)', () => {

    describe('b2bTerminateContract', () => {
        test('rescissione contratto applica la penale e sincronizza la cassa tramite ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                if (fn === 'rpc_terminate_b2b_contract') {
                    return {
                        data: { penalty: 50000, rep_penalty: 1.0 },
                        error: null,
                    };
                }
                return { data: null, error: null };
            });

            gs.cash = 200000;
            gs.reputation = 4.0;
            sandbox._b2bState.activeContract = { id: 'act_1' };

            await sandbox.b2bTerminateContract('act_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 150000, 'il cash locale deve riflettere la penale');
            assert.equal(gs.reputation, 3.0, 'la reputazione deve essere ridotta della rep_penalty');
            assert.deepEqual(syncedCash, [150000], 'syncCash deve essere stato chiamato con il nuovo saldo');
            assert.equal(sandbox._b2bState.activeContract, null, 'il contratto attivo deve essere resettato');
        });

        test('rescissione non chiama spend se penalty è 0', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                if (fn === 'rpc_terminate_b2b_contract') {
                    return {
                        data: { penalty: 0, rep_penalty: 0.5 },
                        error: null,
                    };
                }
                return { data: null, error: null };
            });

            gs.cash = 100000;
            gs.reputation = 3.5;
            sandbox._b2bState.activeContract = { id: 'act_2' };

            await sandbox.b2bTerminateContract('act_2');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs.reputation, 3.0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_b2bDailyTick', () => {
        test('tick giornaliero accredita il payout e sincronizza tramite ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                if (fn === 'rpc_b2b_daily_tick') {
                    return {
                        data: {
                            payout: 45000,
                            completed: false,
                            days_remaining: 5,
                            title: 'Trasporto Dirigenti',
                        },
                        error: null,
                    };
                }
                return { data: null, error: null };
            });

            gs.cash = 10000;
            sandbox._b2bState.activeContract = { id: 'act_1', days_remaining: 6 };

            await sandbox._b2bDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 55000, 'il cash locale deve contenere il payout');
            assert.deepEqual(syncedCash, [55000], 'syncCash deve inviare il nuovo saldo al server');
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 5);
        });

        test('completamento contratto accredita payout e assegna bonus reputazione con tetto prestigio', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                if (fn === 'rpc_b2b_daily_tick') {
                    return {
                        data: {
                            payout: 30000,
                            completed: true,
                            rep_bonus: 0.8,
                            title: 'Summit G7',
                        },
                        error: null,
                    };
                }
                return { data: null, error: null };
            });

            gs.cash = 50000;
            gs.prestige = 2; // tetto max: 5.0 + 2 = 7.0
            gs.reputation = 4.8;
            sandbox._b2bState.activeContract = { id: 'act_completed' };

            await sandbox._b2bDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 80000);
            assert.deepEqual(syncedCash, [80000]);
            assert.equal(gs.reputation, 5.6, 'la reputazione deve salire a 5.6 grazie al prestigio (non fermarsi a 5.0)');
            assert.equal(sandbox._b2bState.activeContract, null, 'il contratto completato deve essere azzerato');
        });

        test('tick con errore o senza dati non modifica il cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                return { data: null, error: new Error('Network error') };
            });

            gs.cash = 50000;
            await sandbox._b2bDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
