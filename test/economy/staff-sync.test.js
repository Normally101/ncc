'use strict';
/* ============================================================================
   test/economy/staff-sync.test.js

   Test per le funzioni di gestione del personale di sede in ui-staff.js:
   - hireOfficeStaff: assunzione staff ufficio con chiamata a ServerState.hireDriver
   - verifica limite capacità sede (_getMaxStaff)
   - fireStaff: licenziamento staff ufficio
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStaffEnv(overrides = {}) {
    const hiredCalls = [];
    const isReady = overrides.isReady !== undefined ? overrides.isReady : true;
    const hireShouldFail = !!overrides.hireShouldFail;
    const env = freshEnv({
        serverState: {
            isReady: () => isReady,
            hireDriver: async (name, salary, type) => {
                hiredCalls.push({ name, salary, type });
                if (hireShouldFail) return null;
                return { id: 'srv_staff_' + Date.now(), name, salary };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, hiredCalls };
}

describe('ui-staff — gestione assunzione e licenziamento staff ufficio', () => {

    describe('hireOfficeStaff', () => {
        test('assume un membro dello staff ufficio chiamando ServerState.hireDriver e aggiornando gameState.staff', async () => {
            const { sandbox, gs, hiredCalls } = setupStaffEnv();
            gs.staff = [];
            gs.drivers = [{ id: 'ceo', name: 'CEO' }];
            sandbox._getMaxStaff = () => 5;

            // Assumiamo HR Specialist (id: 'hr' in STAFF_ROLES)
            await sandbox.hireOfficeStaff('hr');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 1, 'lo staff in gameState deve contenere il membro assunto');
            assert.equal(gs.staff[0].id, 'hr');
            assert.equal(hiredCalls.length, 1, 'ServerState.hireDriver deve essere stato invocato');
            assert.equal(hiredCalls[0].type, 'STAFF');
        });

        test('blocca l\'assunzione se la capacità massima della sede è stata raggiunta', async () => {
            const { sandbox, gs, hiredCalls } = setupStaffEnv();
            gs.staff = [{ id: 'admin', name: 'Responsabile Amm.ne', salary: 3000 }];
            gs.drivers = [{ id: 'ceo', name: 'CEO' }, { id: 'd1', name: 'Autista 1' }];
            // currentStaff = 1 (staff) + 1 (driver non ceo) = 2. Con limite = 2 deve bloccare.
            sandbox._getMaxStaff = () => 2;

            await sandbox.hireOfficeStaff('hr');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 1, 'lo staff non deve aumentare');
            assert.equal(hiredCalls.length, 0, 'nessuna chiamata a ServerState se oltre limite');
        });

        test('se ServerState.hireDriver fallisce, lo staff locale non viene modificato', async () => {
            const { sandbox, gs, hiredCalls } = setupStaffEnv({ hireShouldFail: true });
            gs.staff = [];
            gs.drivers = [{ id: 'ceo', name: 'CEO' }];
            sandbox._getMaxStaff = () => 5;

            await sandbox.hireOfficeStaff('hr');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 0, 'lo staff non deve essere aggiunto su errore server');
            assert.equal(hiredCalls.length, 1);
        });

        test('ruolo inesistente non produce modifiche né chiamate', async () => {
            const { sandbox, gs, hiredCalls } = setupStaffEnv();
            gs.staff = [];
            sandbox._getMaxStaff = () => 5;

            await sandbox.hireOfficeStaff('ruolo_inesistente_xyz');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.staff.length, 0);
            assert.equal(hiredCalls.length, 0);
        });
    });

    describe('fireStaff', () => {
        test('rimuove il membro dello staff da gameState.staff previa conferma', () => {
            const { sandbox, gs } = setupStaffEnv();
            gs.staff = [
                { id: 'hr', name: 'HR Specialist', salary: 2800 },
                { id: 'mech', name: 'Capo Officina', salary: 2600 },
            ];
            sandbox.confirm = () => true;

            sandbox.fireStaff('hr');

            assert.equal(gs.staff.length, 1, 'deve rimanere 1 solo membro');
            assert.equal(gs.staff[0].id, 'mech');
        });

        test('se l\'utente annulla la conferma, il membro dello staff non viene rimosso', () => {
            const { sandbox, gs } = setupStaffEnv();
            gs.staff = [{ id: 'hr', name: 'HR Specialist', salary: 2800 }];
            sandbox.confirm = () => false;

            sandbox.fireStaff('hr');

            assert.equal(gs.staff.length, 1, 'lo staff deve rimanere intatto');
        });
    });
});
