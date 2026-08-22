'use strict';
/* ============================================================================
   test/economy/staff-sync.test.js

   Test di integrazione per ui-staff.js:
   gestione assunzione e licenziamento staff ufficio (hireOfficeStaff, fireStaff),
   rispetto dei tetti di capacita della sede e sincronizzazione con ServerState.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStaffEnv(overrides = {}) {
    const hiredDrivers = [];
    const env = freshEnv({
        serverState: {
            hireDriver: async (name, salary, tier) => {
                hiredDrivers.push({ name, salary, tier });
                return { id: 'srv_staff_' + Date.now(), name, salary, tier };
            },
            ...(overrides.serverState || {}),
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, hiredDrivers };
}

describe('ui-staff — gestione assunzioni staff ufficio e sincronizzazione server', () => {

    describe('hireOfficeStaff', () => {
        test('hireOfficeStaff assume un ruolo valido e chiama ServerState.hireDriver con tier STAFF', async () => {
            const { sandbox, gs, hiredDrivers } = setupStaffEnv();
            gs.staff = [];
            gs.drivers = [{ id: 'ceo', name: 'CEO' }]; // CEO non conta nel conteggio driverCount
            gs.hqLevel = 1; // maxStaff = 4 (o default >= 2)

            await sandbox.hireOfficeStaff('hr');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 1, 'lo staff deve contenere 1 membro');
            assert.equal(gs.staff[0].id, 'hr');
            assert.equal(hiredDrivers.length, 1, 'ServerState.hireDriver deve essere stato chiamato');
            // 'STANDARD': rpc_hire_driver (02_mmo_rpcs_extension.sql) rifiuta con RAISE
            // qualsiasi tier fuori da STANDARD/BUSINESS/VIP/ULTRA — 'STAFF' non esiste.
            assert.equal(hiredDrivers[0].tier, 'STANDARD');
        });

        test('hireOfficeStaff blocca l\'assunzione se il limite massimo staff della sede e raggiunto', async () => {
            const { sandbox, gs, hiredDrivers } = setupStaffEnv();
            gs.hqLevel = 0; // Garage Condiviso: maxStaff = 2
            gs.staff = [{ id: 'accountant', name: 'Commercialista' }];
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Autista 1' },
            ]; // currentStaff = 1 staff + 1 driver = 2 >= maxStaff (2)

            await sandbox.hireOfficeStaff('hr');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 1, 'nessun nuovo membro deve essere aggiunto allo staff');
            assert.equal(hiredDrivers.length, 0, 'ServerState.hireDriver non deve essere chiamato se limite raggiunto');
        });

        test('hireOfficeStaff con ruolo inesistente non fa nulla', async () => {
            const { sandbox, gs, hiredDrivers } = setupStaffEnv();
            gs.staff = [];

            await sandbox.hireOfficeStaff('non_existent_role');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 0);
            assert.equal(hiredDrivers.length, 0);
        });

        test('hireOfficeStaff non aggiunge il membro se ServerState.hireDriver ritorna falsy', async () => {
            const { sandbox, gs } = setupStaffEnv({
                serverState: {
                    hireDriver: async () => null,
                },
            });
            gs.staff = [];

            await sandbox.hireOfficeStaff('hr');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 0, 'lo staff deve restare invariato su errore server');
        });
    });

    describe('fireStaff', () => {
        test('fireStaff rimuove il membro dello staff con l\'id indicato', () => {
            const { sandbox, gs } = setupStaffEnv();
            gs.staff = [
                { id: 'hr', name: 'Responsabile HR', salary: 3000 },
                { id: 'accountant', name: 'Commercialista', salary: 2500 }
            ];

            sandbox.fireStaff('hr');

            assert.equal(gs.staff.length, 1);
            assert.equal(gs.staff[0].id, 'accountant');
        });

        test('fireStaff con id inesistente lascia lo staff inalterato', () => {
            const { sandbox, gs } = setupStaffEnv();
            gs.staff = [{ id: 'hr', name: 'Responsabile HR', salary: 3000 }];

            sandbox.fireStaff('non_existent');

            assert.equal(gs.staff.length, 1);
        });
    });
});
