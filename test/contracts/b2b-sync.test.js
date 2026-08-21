'use strict';
/* ============================================================================
   test/contracts/b2b-sync.test.js

   Regressione per il difetto di doppio conteggio in b2b.js:
   le RPC del server (rpc_terminate_b2b_contract, rpc_b2b_daily_tick) muovono
   GIA' il saldo `cash` e `reputation` sul server (19_b2b_contracts.sql).
   Pertanto il client DEVE allineare la cassa locale usando
   `CE_money.addebitatoDalServer` e `CE_money.accreditatoDalServer` SENZA chiamare
   `ServerState.syncCash`, altrimenti il saldo si muove due volte.
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
        test('rescissione contratto applica la penale localmente con addebitatoDalServer e NON chiama ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già scalato cash');
            assert.equal(sandbox._b2bState.activeContract, null, 'il contratto attivo deve essere resettato');
        });

        test('rescissione contratto anche con eco realtime durante RPC non risincronizza cassa', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                if (fn === 'rpc_terminate_b2b_contract') {
                    // Simula arrivo dell'eco Realtime del server durante la chiamata
                    gs.cash = 200000 - 50000;
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

            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione');
        });

        test('rescissione non chiama addebitatoDalServer se penalty è 0', async () => {
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
        test('tick giornaliero accredita payout con accreditatoDalServer e NON chiama ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già accreditato il cash');
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 5);
        });

        test('tick giornaliero anche con eco realtime durante RPC non risincronizza cassa', async () => {
            const { sandbox, gs, syncedCash } = setupB2BEnv((fn) => {
                if (fn === 'rpc_b2b_daily_tick') {
                    // Simula eco realtime arrivato durante la RPC
                    gs.cash = 10000 + 45000;
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

            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione');
        });

        test('completamento contratto accredita payout senza chiamare syncCash e assegna bonus reputazione con tetto prestigio', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamato');
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
