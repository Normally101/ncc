'use strict';
/* ============================================================================
   test/azioni/ombra.test.js

   Azioni "cieche" del mercato grigio / agenzia ombra: il guardrail non riesce
   ad attivarle perché vogliono uno stato di gioco preparato. Qui le attiviamo
   e verifichiamo le tre regole che contanno quando si muove denaro:
     - importo giusto, UNA VOLTA SOLA;
     - passa da window.CE_money (mai gameState.cash -= diretto);
     - se la RPC muove già il saldo lato server si usa
       CE_money.addebitatoDalServer/accreditatoDalServer e NON si risincronizza.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Ambiente comune: mock ServerState che registra le risincronizzazioni,
// supabaseClient finto che registra le RPC chiamate.
function setupOmbraEnv(rpcOverrides = {}) {
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

describe('azioni ombra — mercato grigio e agenzia dell\'ombra', () => {

    describe('payDonCarmine (p2p-render.js)', () => {
        test('paga 50.000€ UNA volta via addebitatoDalServer, senza syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            gs.cash = 100000;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo locale deve riflettere i 50.000€ spesi');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamata: rpc_pay_don_carmine muove già companies.cash sul server');
            assert.equal(rpcCalls.length, 1, 'la RPC deve essere chiamata esattamente una volta');
            assert.equal(rpcCalls[0].fn, 'rpc_pay_don_carmine');
        });

        test('con fondi insufficienti rifiuta: niente soldi mossi, niente RPC', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            gs.cash = 49999;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 49999, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0, 'RPC non deve partire senza fondi');
        });

        test('se la RPC fallisce zero movimenti', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv({
                rpc_pay_don_carmine: async () => ({ data: null, error: { message: 'DB error' } }),
            });
            gs.cash = 100000;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000, 'il saldo non deve cambiare se la RPC fallisce');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 1, 'la RPC è stata tentata una volta sola');
        });
    });
});
