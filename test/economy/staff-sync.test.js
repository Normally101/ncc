'use strict';
/* ============================================================================
   test/economy/staff-sync.test.js

   Regressione per il bug economico in ui-staff.js:
   tutte le funzioni di acquisto / leasing veicoli quando offline o fallback
   DEVONO passare dalla porta unica CE_money (spend) e sincronizzare la cassa
   col server tramite ServerState.syncCash invece di mutare direttamente gameState.cash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStaffEnv(overrides = {}) {
    const syncedCash = [];
    const isReady = overrides.isReady !== undefined ? overrides.isReady : false;
    const env = freshEnv({
        serverState: {
            isReady: () => isReady,
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
            buyVehicle: async (modelId, price) => {
                // Nel fallback offline il mock restituisce un record fittizio
                return { id: 'srv_veh_' + modelId + '_' + Date.now() };
            },
            buyVehicleUpgrade: async () => ({ success: true }),
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('ui-staff — sincronizzazione movimenti denaro col server (CE_money)', () => {

    describe('__cfgConfirm (acquisto veicolo da configuratore)', () => {
        test('__cfgConfirm scala il prezzo totale e sincronizza con ServerState.syncCash via CE_money quando offline', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv({ isReady: false });
            gs.cash = 200000;
            // Apri il configuratore per impostare __cfgConfirm e sel
            sandbox.openCarConfigurator('stellar_e_exec', 'new');
            // stellar_e_exec: prezzo base 120.000, aggiungiamo optional se vogliamo o totale base 120.000
            await sandbox.__cfgConfirm('stellar_e_exec', 'new');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 80000, 'il saldo locale deve essere scalato di 120.000');
            assert.deepEqual(syncedCash, [80000], 'ServerState.syncCash deve essere stato chiamato tramite CE_money.spend');
        });

        test('__cfgConfirm con optional inclusi scala prezzo base + optional e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv({ isReady: false });
            gs.cash = 300000;
            sandbox.openCarConfigurator('stellar_e_exec', 'new');
            // Seleziona un optional (es. opt_wifi da CAR_UPGRADES: wifi costa 2500)
            sandbox.__cfgToggle('wifi');
            await sandbox.__cfgConfirm('stellar_e_exec', 'new');
            await new Promise(r => setImmediate(r));

            const expectedCash = 300000 - (120000 + 2500);
            assert.equal(gs.cash, expectedCash, 'il saldo locale deve includere gli optional');
            assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve essere stato chiamato con il totale corretto');
        });

        test('__cfgConfirm con fondi insufficienti non modifica il cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv({ isReady: false });
            gs.cash = 50000; // stellar_e_exec costa 120.000
            sandbox.openCarConfigurator('stellar_e_exec', 'new');
            await sandbox.__cfgConfirm('stellar_e_exec', 'new');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo non deve cambiare se i fondi non bastano');
            assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione su spesa fallita');
        });
    });

    describe('leaseCar (leasing veicolo)', () => {
        test('leaseCar scala l\'anticipo (10%) e sincronizza con ServerState.syncCash via CE_money quando offline', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv({ isReady: false });
            gs.cash = 100000;
            // stellar_e_exec costa 120.000, 10% anticipo = 12.000
            await sandbox.leaseCar('stellar_e_exec');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 88000, 'il saldo locale deve essere scalato del 10% di anticipo (12.000)');
            assert.deepEqual(syncedCash, [88000], 'ServerState.syncCash deve essere stato chiamato tramite CE_money.spend');
        });

        test('leaseCar con fondi insufficienti non modifica il cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupStaffEnv({ isReady: false });
            gs.cash = 5000; // anticipo richiesto 12.000
            await sandbox.leaseCar('stellar_e_exec');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, []);
        });
    });
});
