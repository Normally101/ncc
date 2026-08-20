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

describe('hostile_takeover — sincronizzazione cassa col server (CE_money)', () => {

    test('_opaRequestBuyback scala il prezzo del buyback e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        gs.cash = 500000;
        await sandbox._opaRequestBuyback('opa_123', 200000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 300000, 'il saldo locale deve essere scalato del prezzo di buyback');
        assert.deepEqual(syncedCash, [300000], 'syncCash deve ricevere il saldo aggiornato');
    });

    test('_opaRequestBuyback con fondi insufficienti non modifica il cash e non chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupOPAEnv();
        gs.cash = 100000;
        await sandbox._opaRequestBuyback('opa_123', 200000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 100000, 'il saldo non deve cambiare');
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

    test('_opaRequestBuyback con supabaseClient rpc completata con successo scala il saldo e sincronizza', async () => {
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
        assert.deepEqual(syncedCash, [350000], 'syncCash deve ricevere il saldo aggiornato');
    });
});
