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

    describe('il prezzo mostrato e il prezzo addebitato vengono dalla stessa variabile', () => {

        // Il bug originario: il totale a schermo includeva gli optional ma la spesa
        // addebitava il solo prezzo base — l'auto costava meno di quanto promesso.
        // Qui NON ci si fida di _srmTotalPrice() come oracolo: si disegna il
        // configuratore vero, si legge il prezzo CHE IL GIOCATORE VEDE e si pretende
        // che CE_money.spend addebiti esattamente quello.
        test('acquista auto con optional installati include il costo degli upgrade in CE_money.spend', async () => {
            const { sandbox, gs, syncedCash } = setupShowroomEnv({ isReady: false });

            // Overlay reale nel DOM del banco: senza questo _srmOpenConfig non disegna
            // nulla (renderTabShowroom e' stubbato da freshEnv) e non c'e' prezzo da leggere.
            const overlay = sandbox.document.createElement('div');
            overlay.id = 'srm-overlay';
            sandbox.document.body.appendChild(overlay);

            // Il prezzo in topbar arriva a target con un'animazione a frame. Eseguendo
            // ogni frame SINCRONAMENTE (tick richiama se stesso solo finche' il valore
            // non ha raggiunto il target, quindi la ricorsione termina) la lettura del
            // prezzo diventa deterministica invece che una corsa coi timer.
            sandbox.requestAnimationFrame = fn => { fn(); return 0; };

            gs.cash = 500000;

            sandbox._srmOpenConfig('stellar_e_exec');   // base 120.000
            sandbox._srmToggle('opt_vernice_pearl');    // +4.000
            sandbox._srmToggle('opt_blindatura');       // +45.000

            const leggiPrezzoMostrato = () =>
                parseInt(sandbox.document.getElementById('srm-cfg-price').textContent.replace(/[^\d]/g, ''), 10);
            const mostrato = leggiPrezzoMostrato();
            const fleetBefore = gs.fleet.length;
            const cashBefore = gs.cash;

            await sandbox._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(mostrato, 120000 + 4000 + 45000,
                'il totale mostrato deve essere prezzo base piu\u0027 tutti gli optional scelti');
            assert.equal(gs.fleet.length, fleetBefore + 1, 'l\'acquisto deve andare a buon fine');
            assert.equal(gs.cash, cashBefore - mostrato,
                'CE_money.spend deve addebitare ESATTAMENTE il totale mostrato, optional inclusi');
            assert.deepEqual(syncedCash, [cashBefore - mostrato],
                'il server deve ricevere lo stesso totale che il giocatore ha visto a schermo');
        });
    });
});
