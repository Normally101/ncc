'use strict';
/* ============================================================================
   test/employees/ui-staff-sync.test.js

   Regressione per la sincronizzazione cassa in ui-staff.js:
   le funzioni di acquisto e leasing auto (__cfgConfirm, leaseCar) DEVONO passare
   da CE_money quando operano in modalità locale/offline (!ServerState.isReady()),
   garantendo che la cassa venga sincronizzata col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStaffEnv(isReady = false) {
    const syncedCash = [];
    const buyVehicleCalls = [];
    const env = freshEnv({
        serverState: {
            isReady: () => isReady,
            buyVehicle: async (modelId, price, hqCity) => {
                buyVehicleCalls.push({ modelId, price, hqCity });
                return { id: 'srv_car_test_123' };
            },
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, buyVehicleCalls };
}

describe('ui-staff — sincronizzazione cassa col server (CE_money)', () => {

    describe('__cfgConfirm (acquisto veicolo da configuratore in fallback locale)', () => {
        test('acquista auto in modalità offline scala il cash tramite CE_money e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv(false);
            gs.cash = 150000;
            // Configura Stellar E-Executive (prezzo 120000)
            sandbox.openCarConfigurator('stellar_e_exec', 'new');
            await sandbox.__cfgConfirm('stellar_e_exec', 'new');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000, 'il cash locale deve scalare 120.000€');
            assert.deepEqual(syncedCash, [30000], 'syncCash deve ricevere il nuovo saldo');
            assert.ok(gs.fleet.some(c => c.vehicleClass === 'stellar_e_exec'), 'il veicolo deve essere aggiunto alla flotta');
        });

        test('acquista auto con optional installati include il costo degli upgrade in CE_money.spend', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv(false);
            gs.cash = 200000;
            sandbox.openCarConfigurator('stellar_e_exec', 'new');
            // Aggiunge wifi (2500) e frigobar (3500) -> totale 126000
            sandbox.__cfgToggle('wifi');
            sandbox.__cfgToggle('frigobar');
            await sandbox.__cfgConfirm('stellar_e_exec', 'new');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 74000, 'il cash locale deve scalare 126.000€');
            assert.deepEqual(syncedCash, [74000], 'syncCash deve sincronizzare il saldo');
        });

        test('fondi insufficienti in fallback locale: non acquista il veicolo e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv(false);
            gs.cash = 50000; // servono 120.000€
            const fleetBefore = gs.fleet.length;
            sandbox.openCarConfigurator('stellar_e_exec', 'new');
            await sandbox.__cfgConfirm('stellar_e_exec', 'new');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il cash deve rimanere invariato');
            assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamata');
            assert.equal(gs.fleet.length, fleetBefore, 'nessun veicolo deve essere aggiunto');
        });
    });

    describe('leaseCar (leasing veicolo in fallback locale)', () => {
        test('leasing auto in modalità offline scala anticipo (10%) tramite CE_money e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv(false);
            gs.cash = 50000;
            // Stellar E-Executive: price 120000 -> 10% upfront = 12000
            await sandbox.leaseCar('stellar_e_exec');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 38000, 'il cash locale deve scalare 12.000€');
            assert.deepEqual(syncedCash, [38000], 'syncCash deve ricevere il nuovo saldo');
            assert.ok(gs.fleet.some(c => c.isLease && c.vehicleClass === 'stellar_e_exec'), 'il veicolo in leasing deve essere aggiunto alla flotta');
        });

        test('fondi insufficienti per anticipo leasing in fallback locale: non aggiunge auto e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv(false);
            gs.cash = 5000; // servono 12.000€
            const fleetBefore = gs.fleet.length;
            await sandbox.leaseCar('stellar_e_exec');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il cash deve rimanere invariato');
            assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamata');
            assert.equal(gs.fleet.length, fleetBefore, 'nessun veicolo deve essere aggiunto in leasing');
        });
    });
});
