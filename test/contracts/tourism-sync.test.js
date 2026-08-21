'use strict';
/* ============================================================================
   test/contracts/tourism-sync.test.js

   Regressione per il bug economico in tourism.js:
   tutte le funzioni di accredito/spesa e reputazione DEVONO passare da CE_money
   (earn / spend / addReputation) e sincronizzare la cassa col server tramite
   ServerState.syncCash.
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

describe('tourism — il server ha già mosso i soldi (accreditatoDalServer)', () => {

    describe('_tourismDailyTick', () => {
        test('_tourismDailyTick accredita il payout via accreditatoDalServer e NON chiama ServerState.syncCash', async () => {
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
                from: () => ({
                    upsert: () => Promise.resolve({ data: null, error: null }),
                }),
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 65000, 'il saldo locale deve includere il payout');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: rpc_tourism_daily_tick muove già companies.cash');
        });

        test('_tourismDailyTick con ServerState online accredita comunque il saldo locale senza syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: true });
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
                from: () => ({
                    upsert: () => Promise.resolve({ data: null, error: null }),
                }),
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 65000, 'il saldo locale deve essere allineato');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash');
        });

        test('eco Realtime arrivato durante rpc_tourism_daily_tick non provoca risincronizzazione', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: false });
            gs.cash = 50000;

            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_tourism_daily_tick') {
                        // Eco realtime arrivato prima del ritorno RPC
                        gs.cash = 65000;
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
                from: () => ({
                    upsert: () => Promise.resolve({ data: null, error: null }),
                }),
            };

            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione');
        });

        test('_tourismDailyTick con errore RPC non modifica cassa né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupTourismEnv({ isReady: false });
            gs.cash = 50000;

            sandbox.supabaseClient = {
                rpc: async () => ({ data: null, error: new Error('DB error') }),
                from: () => ({
                    upsert: () => Promise.resolve({ data: null, error: null }),
                }),
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
                from: () => ({
                    upsert: () => Promise.resolve({ data: null, error: null }),
                }),
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
                from: () => ({
                    upsert: () => Promise.resolve({ data: null, error: null }),
                }),
            };

            await sandbox.tourismTerminate('tender_1');
            await new Promise(r => setImmediate(r));

            assert.equal(Math.round(gs.reputation * 100) / 100, 3.4);
        });
    });
});
