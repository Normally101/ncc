'use strict';
/* ============================================================================
   test/economy/takeover-sync.test.js

   Regressione per il bug economico in hostile_takeover.js:
   tutte le funzioni che muovono denaro DEVONO passare dalla porta unica
   CE_money (spend / earn) e sincronizzare la cassa col server tramite
   ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupOPAEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('hostile_takeover — il server ha già mosso i soldi (addebitatoDalServer)', () => {

    test('_opaRequestBuyback scala il prezzo del buyback localmente via addebitatoDalServer ma NON chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        gs.cash = 500000;
        await sandbox._opaRequestBuyback('opa_123', 200000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 300000, 'il saldo locale deve essere scalato del prezzo di buyback');
        assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: rpc_opa_buyback muove già companies.cash sul server');
    });

    test('_opaRequestBuyback con eco Realtime arrivato prima della fine RPC non provoca doppio addebito o syncCash', async () => {
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
        gs.cash = 500000;
        sandbox.supabaseClient = {
            rpc: async (name, params) => {
                if (name === 'rpc_opa_buyback') {
                    // Simula eco realtime arrivato prima che la RPC ritorni risposta al browser
                    gs.cash = 300000;
                    return { data: { success: true }, error: null };
                }
                return { data: [], error: null };
            },
        };
        sandbox.window.supabaseClient = sandbox.supabaseClient;

        await sandbox._opaRequestBuyback('opa_123', 200000);
        await new Promise(r => setImmediate(r));

        assert.deepEqual(synced, [], 'nessuna risincronizzazione');
    });

    test('_opaRequestBuyback con fondi insufficienti non modifica il cash, non chiama RPC e non chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        let rpcCalled = false;
        sandbox.supabaseClient = {
            rpc: async () => {
                rpcCalled = true;
                return { data: null, error: null };
            },
        };
        gs.cash = 100000;
        await sandbox._opaRequestBuyback('opa_123', 200000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 100000, 'il saldo non deve cambiare');
        assert.equal(rpcCalled, false, 'la RPC non deve partire se i fondi non bastano');
        assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash se i fondi non bastano');
    });

    test('_opaRequestBuyback annullato dall\'utente (confirm=false) non scala cassa né chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        gs.cash = 500000;
        sandbox.confirm = () => false;
        await sandbox._opaRequestBuyback('opa_123', 200000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 500000, 'il saldo deve rimanere invariato se l\'utente annulla');
        assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash se l\'azione è annullata');
    });

    test('_opaRequestBuyback con supabaseClient rpc completata con successo scala il saldo e non sincronizza', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        gs.cash = 600000;
        sandbox.supabaseClient = {
            rpc: async (name, params) => {
                if (name === 'rpc_opa_buyback') return { data: { success: true }, error: null };
                if (name === 'rpc_get_hostile_takeovers') return { data: [], error: null };
                return { data: null, error: null };
            },
        };
        await sandbox._opaRequestBuyback('opa_456', 250000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 350000, 'il saldo locale deve essere scalato');
        assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
    });

    test('_opaRequestBuyback se RPC fallisce non tocca il cash locale e non chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        gs.cash = 600000;
        sandbox.supabaseClient = {
            rpc: async (name) => {
                if (name === 'rpc_opa_buyback') return { data: null, error: { message: 'Fondi insufficienti sul server' } };
                return { data: [], error: null };
            },
        };
        await sandbox._opaRequestBuyback('opa_456', 250000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 600000, 'il saldo locale non deve cambiare se la RPC fallisce');
        assert.deepEqual(syncedCash, []);
    });
});
