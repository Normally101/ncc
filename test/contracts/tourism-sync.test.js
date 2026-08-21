'use strict';
/* ============================================================================
   test/contracts/tourism-sync.test.js

   Regressione per il difetto di sincronizzazione in tourism.js:
   la RPC rpc_tourism_daily_tick muove GIA' il saldo `cash` sul server (33_tourism_tenders.sql).
   Pertanto il client DEVE allineare la cassa locale usando
   `CE_money.accreditatoDalServer` SENZA chiamare `ServerState.syncCash`, altrimenti
   il saldo viene accreditato due volte (specie se l'eco Realtime arriva prima).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupTourismEnv(overrides = {}) {
    const syncedCash = [];
    const isReady = overrides.isReady !== undefined ? overrides.isReady : false;
    const env = freshEnv({
        serverState: {
            isReady: () => isReady,
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    const sandbox = env.sandbox;
    sandbox.currentUser = { id: 'user_test_123' };

    return { env, sandbox, gs: sandbox.gameState, syncedCash };
}

describe('tourism — il server ha già accreditato i soldi (accreditatoDalServer)', () => {

    describe('_tourismDailyTick', () => {
        test('_tourismDailyTick accredita il payout localmente ma NON chiama syncCash (il server ha già accreditato)', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: false });
            gs.cash = 50000;

            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_tourism_daily_tick') {
                        return {
                            data: {
                                total_payout: 15000,
                                payouts: [{ name: 'Aurevia Elite Journeys', icon: '🌟', amount: 15000 }],
                                expiring_soon: 0,
                            },
                            error: null,
                        };
                    }
                    return { data: null, error: new Error('RPC non trovata') };
                },
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 65000, 'il saldo locale deve includere il payout');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già accreditato');
        });

        test('_tourismDailyTick anche se l eco realtime arriva durante la RPC il saldo non viene risincronizzato', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: false });
            gs.cash = 50000;

            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_tourism_daily_tick') {
                        // Simula arrivo eco Realtime prima del ritorno della chiamata
                        gs.cash = 50000 + 15000;
                        return {
                            data: {
                                total_payout: 15000,
                                payouts: [{ name: 'Aurevia Elite Journeys', icon: '🌟', amount: 15000 }],
                                expiring_soon: 0,
                            },
                            error: null,
                        };
                    }
                    return { data: null, error: new Error('RPC non trovata') };
                },
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione con syncCash');
        });

        test('_tourismDailyTick con errore RPC non modifica cassa né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: false });
            gs.cash = 50000;

            sandbox.supabaseClient = {
                rpc: async () => ({ data: null, error: new Error('DB error') }),
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });

        test('_tourismDailyTick con payout nullo non modifica cassa né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: false });
            gs.cash = 50000;

            sandbox.supabaseClient = {
                rpc: async () => ({ data: { total_payout: 0, payouts: [] }, error: null }),
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('tourismTerminate', () => {
        test('tourismTerminate applica la penale reputazione tramite CE_money.addReputation quando offline', async () => {
            const { sandbox, gs } = setupTourismEnv({ isReady: false });
            gs.reputation = 4.0;
            sandbox._tourismState.tenders = [
                { id: 'tender_1', name: 'Aurevia Elite', tier: 4 },
            ];

            sandbox.supabaseClient = {
                rpc: async (name, params) => {
                    if (name === 'rpc_terminate_tourism_contract') {
                        return { data: { rep_penalty: 0.60 }, error: null };
                    }
                    if (name === 'rpc_get_tourism_tenders') {
                        return { data: [], error: null };
                    }
                    return { data: null, error: null };
                },
            };

            await sandbox.tourismTerminate('tender_1');
            await new Promise(r => setImmediate(r));

            assert.equal(Math.round(gs.reputation * 100) / 100, 3.4);
        });
    });
});
