'use strict';
/* ============================================================================
   test/economy/alliances-sync.test.js

   Regressione per il bug economico in alliances.js:
   tutte le funzioni di spesa e donazione DEVONO passare da CE_money (spend)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupAlliancesEnv() {
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
    sandbox.supabaseClient = {
        rpc: async (fn, args) => {
            rpcCalls.push({ fn, args });
            return 'mock-alliance-id';
        },
        from: () => ({
            update: () => ({ eq: async () => ({}) }),
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
    };
    sandbox.window.supabaseClient = sandbox.supabaseClient;

    return { env, sandbox, gs: sandbox.gameState, syncedCash, rpcCalls };
}

describe('alliances — sincronizzazione cassa col server (CE_money)', () => {

    describe('_alCreate', () => {
        test('_alCreate scala 25.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 50000;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Nuova Alleanza">
                <input id="al-tag" value="NALL">
                <input id="al-desc" value="Descrizione alleanza">
                <input id="al-emblem" value="🛡️">
                <input id="al-open" type="checkbox" checked>
            `;

            await sandbox._alCreate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 25000, 'il saldo locale deve essere scalato di 25.000€');
            assert.deepEqual(syncedCash, [25000], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].fn, 'rpc_create_alliance');
        });

        test('_alCreate con fondi insufficienti non spende, non chiama RPC e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 10000;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Nuova Alleanza">
                <input id="al-tag" value="NALL">
                <input id="al-desc" value="Descrizione">
                <input id="al-emblem" value="🛡️">
                <input id="al-open" type="checkbox" checked>
            `;

            await sandbox._alCreate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash per fondi insufficienti');
            assert.equal(rpcCalls.length, 0, 'la RPC non deve partire se i fondi non bastano');
        });

        test('_alCreate con nome troppo corto non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 50000;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="AB">
                <input id="al-tag" value="NALL">
                <input id="al-desc" value="Descrizione">
                <input id="al-emblem" value="🛡️">
                <input id="al-open" type="checkbox" checked>
            `;

            await sandbox._alCreate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('_alCreate con tag troppo corto non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 50000;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Nuova Alleanza">
                <input id="al-tag" value="A">
                <input id="al-desc" value="Descrizione">
                <input id="al-emblem" value="🛡️">
                <input id="al-open" type="checkbox" checked>
            `;

            await sandbox._alCreate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });
    });

    describe('_alDonate', () => {
        test('_alDonate scala l\'importo donato e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 20000;
            sandbox.document.body.innerHTML = `
                <input id="al-donate" value="5000">
            `;

            await sandbox._alDonate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000, 'il saldo locale deve essere scalato di 5.000€');
            assert.deepEqual(syncedCash, [15000], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].fn, 'rpc_donate_to_alliance');
            assert.equal(rpcCalls[0].args.p_amount, 5000);
        });

        test('_alDonate con fondi insufficienti non spende, non chiama RPC e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 2000;
            sandbox.document.body.innerHTML = `
                <input id="al-donate" value="5000">
            `;

            await sandbox._alDonate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2000, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });

        test('_alDonate con importo non valido (<= 0) non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupAlliancesEnv();
            gs.cash = 20000;
            sandbox.document.body.innerHTML = `
                <input id="al-donate" value="0">
            `;

            await sandbox._alDonate();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0);
        });
    });
});
