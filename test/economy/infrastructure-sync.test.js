'use strict';
/* ============================================================================
   test/economy/infrastructure-sync.test.js

   Regressione per il bug economico in infrastructure.js:
   le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupInfraEnv() {
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

describe('infrastructure — sincronizzazione cassa col server (CE_money)', () => {

    describe('_infraBuyDepot', () => {
        test('acquista deposito carburante scala 300.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200000, 'il saldo locale deve essere scalato di 300.000€');
            assert.deepEqual(syncedCash, [200000], 'ServerState.syncCash deve ricevere il nuovo saldo');
        });

        test('fondi insufficienti: non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 100000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se i fondi sono insufficienti');
        });

        test('annullamento conferma utente: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            sandbox.confirm = () => false;
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500000, 'il saldo locale non deve cambiare se l\'utente annulla');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se l\'azione è annullata');
        });
    });
});
