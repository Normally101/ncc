'use strict';
/* ============================================================================
   test/economy/p2p-render-sync.test.js

   Regressione per il bug economico in p2p-render.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
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

describe('p2p-render — sincronizzazione cassa col server (CE_money)', () => {

    describe('contributeConsorzio', () => {
        test('contributeConsorzio scala la cifra e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupP2PRenderEnv();
            gs.cash = 50000;

            await sandbox.contributeConsorzio('cso_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000, 'il saldo locale deve riflettere la spesa');
            assert.deepEqual(syncedCash, [40000], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].fn, 'rpc_contribute_consorzio');
            assert.equal(rpcCalls[0].params?.v_consorzio_id, 'cso_1');
            assert.equal(rpcCalls[0].params?.v_amount, 10000);
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

        test('contributeConsorzio con errore RPC esegue rollback del denaro', async () => {
            const { sandbox, gs, syncedCash } = setupP2PRenderEnv({
                rpc_contribute_consorzio: async () => ({ data: null, error: { message: 'DB error' } }),
            });
            gs.cash = 50000;

            await sandbox.contributeConsorzio('cso_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo deve tornare a 50000 dopo il rollback');
            assert.deepEqual(syncedCash, [40000, 50000], 'syncCash deve registrare spesa e successivo riaccredito');
        });
    });

    describe('payDonCarmine', () => {
        test('payDonCarmine scala €50.000 e sincronizza con ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [30000], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(sandbox._sindacatoState.gdfRisk, 0);
            assert.equal(sandbox._sindacatoState.carmineImmunityUntil, '2026-09-01T12:00:00Z');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].fn, 'rpc_pay_don_carmine');
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

        test('payDonCarmine con errore RPC esegue rollback del denaro', async () => {
            const { sandbox, gs, syncedCash } = setupP2PRenderEnv({
                rpc_pay_don_carmine: async () => ({ data: null, error: { message: 'Don Carmine non risponde' } }),
            });
            gs.cash = 80000;
            sandbox._sindacatoState.gdfRisk = 50;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 80000, 'il saldo deve tornare a 80000 dopo il rollback');
            assert.deepEqual(syncedCash, [30000, 80000], 'syncCash deve registrare spesa e riaccredito');
            assert.equal(sandbox._sindacatoState.gdfRisk, 50, 'il rischio non deve essere azzerato se la chiamata fallisce');
        });
    });
});
