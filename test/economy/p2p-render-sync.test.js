'use strict';
/* ============================================================================
   test/economy/p2p-render-sync.test.js

   Regressione per il bug economico in p2p-render.js:
   le RPC del server muovono già companies.cash, quindi il client deve usare
   CE_money.addebitatoDalServer e NON risincronizzare tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupP2PRenderEnv(rpcOverrides = {}) {
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

    const sandbox = env.sandbox;
    sandbox.currentUser = { id: 'usr_test_123', email: 'test@example.com' };
    sandbox.window.currentUser = sandbox.currentUser;

    const queryBuilder = {
        select: () => queryBuilder,
        order: () => queryBuilder,
        eq: () => queryBuilder,
        gt: () => queryBuilder,
        limit: () => queryBuilder,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => ({ error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
    };

    sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            rpcCalls.push({ fn, params });
            if (rpcOverrides[fn]) {
                return rpcOverrides[fn](params);
            }
            return { data: {}, error: null };
        },
        from: () => queryBuilder,
    };
    sandbox.window.supabaseClient = sandbox.supabaseClient;

    return { env, sandbox, gs: sandbox.gameState, syncedCash, rpcCalls };
}

describe('p2p-render — il server ha già mosso i soldi (addebitatoDalServer)', () => {

    describe('contributeConsorzio', () => {
        test('contributeConsorzio scala la cifra localmente via addebitatoDalServer ma NON chiama ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupP2PRenderEnv();
            gs.cash = 50000;

            await sandbox.contributeConsorzio('cso_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000, 'il saldo locale deve riflettere la spesa');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: rpc_contribute_consorzio muove già companies.cash sul server');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].fn, 'rpc_contribute_consorzio');
            assert.equal(rpcCalls[0].params?.v_consorzio_id, 'cso_1');
            assert.equal(rpcCalls[0].params?.v_amount, 10000);
        });

        test('contributeConsorzio con eco Realtime arrivato prima della fine RPC non provoca doppio addebito o syncCash', async () => {
            const synced = [];
            const env = freshEnv({
                serverState: {
                    syncCash: async (v) => {
                        synced.push(v);
                        return { success: true, cash: v };
                    },
                },
            });
            const sandbox = env.sandbox;
            const gs = sandbox.gameState;
            gs.cash = 50000;
            sandbox.currentUser = { id: 'usr_test_123', email: 'test@example.com' };
            sandbox.window.currentUser = sandbox.currentUser;
            sandbox.supabaseClient = {
                rpc: async (fn, params) => {
                    // Simula eco realtime dal server prima del ritorno della RPC
                    gs.cash = 40000;
                    return { data: { success: true }, error: null };
                },
                from: () => ({
                    select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }), then: (resolve) => resolve({ data: [], error: null }) }) }) }),
                }),
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            await sandbox.contributeConsorzio('cso_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.deepEqual(synced, [], 'nessuna risincronizzazione');
        });

        test('contributeConsorzio con fondi insufficienti non scala cash, non chiama syncCash né RPC', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupP2PRenderEnv();
            gs.cash = 5000;

            await sandbox.contributeConsorzio('cso_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione per spesa rifiutata');
            assert.equal(rpcCalls.length, 0, 'RPC non deve essere chiamata senza fondi');
        });

        test('contributeConsorzio con importo non valido (0 o negativo) non muove denaro', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupP2PRenderEnv();
            gs.cash = 50000;

            await sandbox.contributeConsorzio('cso_1', 0);
            await sandbox.contributeConsorzio('cso_1', -500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('contributeConsorzio se la RPC fallisce non tocca cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PRenderEnv({
                rpc_contribute_consorzio: async () => ({ data: null, error: { message: 'DB error' } }),
            });
            gs.cash = 50000;

            await sandbox.contributeConsorzio('cso_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo non deve cambiare se la RPC fallisce');
            assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamato in caso di errore RPC');
        });
    });

    describe('payDonCarmine', () => {
        test('payDonCarmine scala €50.000 localmente via addebitatoDalServer ma NON chiama ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupP2PRenderEnv({
                rpc_pay_don_carmine: async () => ({
                    data: { immunity_until: '2026-09-01T12:00:00Z' },
                    error: null,
                }),
            });
            gs.cash = 80000;
            sandbox._sindacatoState.gdfRisk = 60;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000, 'il saldo locale deve essere scalato di 50.000€');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: rpc_pay_don_carmine scala già companies.cash');
            assert.equal(sandbox._sindacatoState.gdfRisk, 0);
            assert.equal(sandbox._sindacatoState.carmineImmunityUntil, '2026-09-01T12:00:00Z');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].fn, 'rpc_pay_don_carmine');
        });

        test('payDonCarmine con eco Realtime arrivato prima della fine RPC non provoca doppio addebito o syncCash', async () => {
            const synced = [];
            const env = freshEnv({
                serverState: {
                    syncCash: async (v) => {
                        synced.push(v);
                        return { success: true, cash: v };
                    },
                },
            });
            const sandbox = env.sandbox;
            const gs = sandbox.gameState;
            gs.cash = 80000;
            sandbox.currentUser = { id: 'usr_test_123', email: 'test@example.com' };
            sandbox.window.currentUser = sandbox.currentUser;
            sandbox.supabaseClient = {
                rpc: async (fn, params) => {
                    // Simula eco realtime dal server prima del ritorno della RPC
                    gs.cash = 30000;
                    return { data: { immunity_until: '2026-09-01T12:00:00Z' }, error: null };
                },
                from: () => ({
                    select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }), then: (resolve) => resolve({ data: [], error: null }) }) }) }),
                }),
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.deepEqual(synced, [], 'nessuna risincronizzazione');
        });

        test('payDonCarmine con fondi insufficienti non scala denaro e non chiama syncCash né RPC', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupP2PRenderEnv();
            gs.cash = 30000;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('payDonCarmine se la RPC fallisce non tocca cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PRenderEnv({
                rpc_pay_don_carmine: async () => ({ data: null, error: { message: 'Don Carmine non risponde' } }),
            });
            gs.cash = 80000;
            sandbox._sindacatoState.gdfRisk = 50;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 80000, 'il saldo non deve cambiare se la RPC fallisce');
            assert.deepEqual(syncedCash, []);
            assert.equal(sandbox._sindacatoState.gdfRisk, 50, 'il rischio non deve essere azzerato se la chiamata fallisce');
        });
    });
});
