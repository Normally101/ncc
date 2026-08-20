'use strict';
/* ============================================================================
   test/garage/showroom-sync.test.js

   Sincronizzazione cassa col server (CE_money) per showroom.js:
   l'acquisto veicolo in modalità offline/fallback DEVE passare da CE_money.spend,
   sincronizzare la cassa con ServerState.syncCash, e aggiungere il veicolo alla
   flotta SOLO SE la spesa ha avuto successo. Se i fondi sono insufficienti,
   nessun veicolo deve essere aggiunto alla flotta e il saldo non deve cambiare.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupShowroomEnv(overrides = {}) {
    const syncedCash = [];
    const isReady = overrides.isReady !== undefined ? overrides.isReady : false;
    const env = freshEnv({
        serverState: {
            isReady: () => isReady,
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            ...(overrides.serverState || {}),
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('showroom — sincronizzazione acquisto veicoli (CE_money)', () => {

    describe('_srmPurchase in fallback locale (ServerState non ready)', () => {
        test('comprare un veicolo scala il cash tramite CE_money.spend e aggiunge il veicolo alla flotta', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv({ isReady: false });
            gs.cash = 300000;
            const fleetBefore = gs.fleet.length;

            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');
            const price = sandbox._srmTotalPrice(); // 120000
            const cashBefore = gs.cash;

            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashBefore - price, 'il cash deve scalare del prezzo del veicolo');
            assert.equal(gs.fleet.length, fleetBefore + 1, 'la flotta deve avere un veicolo in più');
            const bought = gs.fleet[gs.fleet.length - 1];
            assert.equal(bought.vehicleClass, 'stellar_e_exec');
            assert.deepEqual(syncedCash, [cashBefore - price], 'syncCash deve essere stato chiamato con il nuovo saldo');
        });

        test('comprare un veicolo con optional calcola il totale e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv({ isReady: false });
            gs.cash = 300000;
            const fleetBefore = gs.fleet.length;

            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');
            sandbox._srmToggle('opt_vernice_pearl'); // +4000
            const price = sandbox._srmTotalPrice(); // 124000
            const cashBefore = gs.cash;

            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashBefore - price);
            assert.equal(gs.fleet.length, fleetBefore + 1);
            const bought = gs.fleet[gs.fleet.length - 1];
            assert.ok(bought.upgrades.includes('opt_vernice_pearl'), 'gli optional selezionati devono essere registrati');
            assert.deepEqual(syncedCash, [cashBefore - price]);
        });

        test('fondi insufficienti: nessun veicolo aggiunto alla flotta, cash invariato e nessun syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv({ isReady: false });
            gs.cash = 50000; // stellar_e_exec costa 120000
            const fleetBefore = gs.fleet.length;
            const cashBefore = gs.cash;

            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');

            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashBefore, 'il saldo non deve cambiare');
            assert.equal(gs.fleet.length, fleetBefore, 'nessun veicolo deve essere aggiunto alla flotta');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash per fondi insufficienti');
        });
    });

    describe('_srmPurchase con ServerState online (isReady: true)', () => {
        test('online: acquisto passa dalla RPC buyVehicle e assegna _serverId', async () => {
            const { sandbox, gs } = setupShowroomEnv({ isReady: true });
            gs.cash = 500000;
            const fleetBefore = gs.fleet.length;

            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');
            const price = sandbox._srmTotalPrice();
            const cashBefore = gs.cash;

            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashBefore - price);
            assert.equal(gs.fleet.length, fleetBefore + 1);
            const bought = gs.fleet[gs.fleet.length - 1];
            assert.ok(bought._serverId, 'il veicolo deve avere un _serverId restituito dal server');
        });
    });
});
