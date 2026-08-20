'use strict';
/* ============================================================================
   test/garage/showroom-sync.test.js

   Regressione per il bug economico in showroom.js:
   la funzione di acquisto veicoli nel nuovo Showroom (con e senza optional)
   DEVE passare da CE_money.spend e sincronizzare la cassa col server
   tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupShowroomEnv() {
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

describe('showroom — sincronizzazione cassa col server (CE_money)', () => {

    describe('_srmPurchase', () => {
        test('acquista veicolo base scala il prezzo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv();
            gs.cash = 200000;
            const initialFleetCount = gs.fleet.length;

            // Seleziona un veicolo nel catalogo showroom (es. stellar_e_exec: base 65.000)
            sandbox._srmOpenConfig('stellar_e_exec');
            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            // stellar_e_exec costa 65000 -> cassa rimanente 135000
            assert.equal(gs.cash, 135000);
            assert.equal(gs.fleet.length, initialFleetCount + 1);
            const bought = gs.fleet[gs.fleet.length - 1];
            assert.equal(bought.name, 'Stellar E-Executive');
            assert.equal(bought.tier, 'business');
            assert.deepEqual(bought.upgrades, []);
            assert.deepEqual(syncedCash, [135000]);
        });

        test('acquista veicolo con optional calcola il totale corretto e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv();
            gs.cash = 200000;
            const initialFleetCount = gs.fleet.length;

            // Seleziona stellar_e_exec (65000) e aggiunge optional
            sandbox._srmOpenConfig('stellar_e_exec');
            // opt_vernice_pearl (4000) + opt_cerchi_21 (6000) = 10000 optional -> totale 75000
            sandbox._srmToggle('opt_vernice_pearl');
            sandbox._srmToggle('opt_cerchi_21');

            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 125000);
            assert.equal(gs.fleet.length, initialFleetCount + 1);
            const bought = gs.fleet[gs.fleet.length - 1];
            assert.equal(bought.name, 'Stellar E-Executive');
            assert.ok(bought.upgrades.includes('opt_vernice_pearl'));
            assert.ok(bought.upgrades.includes('opt_cerchi_21'));
            assert.deepEqual(syncedCash, [125000]);
        });

        test('fondi insufficienti: non acquista veicolo e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv();
            gs.cash = 50000; // stellar_e_exec costa 65000
            const initialFleetCount = gs.fleet.length;

            sandbox._srmOpenConfig('stellar_e_exec');
            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.length, initialFleetCount);
            assert.deepEqual(syncedCash, []);
        });

        test('nessun veicolo selezionato: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv();
            gs.cash = 200000;
            const initialFleetCount = gs.fleet.length;

            // Nessun _srmOpenConfig chiamato
            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 200000);
            assert.equal(gs.fleet.length, initialFleetCount);
            assert.deepEqual(syncedCash, []);
        });
    });
});
