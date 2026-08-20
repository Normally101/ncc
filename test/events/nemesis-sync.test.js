'use strict';
/* ============================================================================
   test/events/nemesis-sync.test.js

   Regressione per il bug economico in nemesis.js:
   tutte le funzioni di spesa DEVONO passare da CE_money (spend)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupNemesisEnv() {
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

describe('nemesis — sincronizzazione cassa col server (CE_money)', () => {

    describe('_nemesisBribeVip', () => {
        test('corruzione VIP scala denaro e sincronizza con ServerState.syncCash (pace fatta)', async () => {
            const { sandbox, gs, syncedCash } = setupNemesisEnv();
            gs.vipNemeses = {
                vip1: { name: 'VIP Boss', level: 1, anger: 40, lastFunded: 0, reason: 'scaduta' }
            };
            gs.cash = 100000;
            // bribe = Math.floor(5000 + (40 / 100) * 45000) = 23000 -> cash = 77000
            await sandbox._nemesisBribeVip('vip1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 77000, 'il saldo locale deve essere scalato dell\'importo della corruzione');
            assert.deepEqual(syncedCash, [77000], 'syncCash deve essere chiamata con il nuovo saldo');
            assert.equal(gs.vipNemeses.vip1, undefined, 'con rabbia azzerata il nemico viene rimosso');
        });

        test('corruzione VIP con rabbia alta riduce la rabbia e scala denaro sincronizzando', async () => {
            const { sandbox, gs, syncedCash } = setupNemesisEnv();
            gs.vipNemeses = {
                vip2: { name: 'VIP Angry', level: 2, anger: 80, lastFunded: 0, reason: 'fallita' }
            };
            gs.cash = 100000;
            // bribe = Math.floor(5000 + (80 / 100) * 45000) = 41000 -> cash = 59000
            await sandbox._nemesisBribeVip('vip2');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 59000);
            assert.deepEqual(syncedCash, [59000]);
            assert.equal(gs.vipNemeses.vip2.anger, 40, 'la rabbia deve diminuire di 40');
            assert.equal(gs.vipNemeses.vip2.level, 1, 'il livello deve scendere da 2 a 1');
        });

        test('fondi insufficienti: non corrompe e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupNemesisEnv();
            gs.vipNemeses = {
                vip1: { name: 'VIP Boss', level: 1, anger: 40, lastFunded: 0, reason: 'scaduta' }
            };
            gs.cash = 10000; // bribe = 23000
            await sandbox._nemesisBribeVip('vip1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.vipNemeses.vip1.anger, 40, 'la rabbia non deve cambiare');
        });

        test('annullamento conferma utente: non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupNemesisEnv();
            sandbox.confirm = () => false;
            gs.vipNemeses = {
                vip1: { name: 'VIP Boss', level: 1, anger: 40, lastFunded: 0, reason: 'scaduta' }
            };
            gs.cash = 100000;
            await sandbox._nemesisBribeVip('vip1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.vipNemeses.vip1.anger, 40);
        });

        test('VIP non presente in vipNemeses: non fa nulla e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupNemesisEnv();
            gs.vipNemeses = {};
            gs.cash = 100000;
            await sandbox._nemesisBribeVip('vip_inesistente');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
