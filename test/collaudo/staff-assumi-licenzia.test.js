'use strict';
// COLLAUDO PROFONDO — assumere e licenziare staff d'ufficio, dall'inizio alla fine.
//
// Il flusso vero: assumere paga il costo una tantum (salary × 2, scalato dalla
// RPC del server, non in locale) e aggiunge il membro; il limite della sede
// blocca l'assunzione di troppi; licenziare rimuove il membro senza restituire
// il costo. Si verifica che il denaro passi sempre dal server e che nessuna
// assunzione risulti gratis o senza fondi.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('collaudo/staff — assumi → limite → licenzia (end-to-end)', () => {
    test('il flusso intero muove il denaro dal server e tiene lo stato coerente', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 500000; // abbondante: maxStaff sede base = 2

        // 1) ASSUMI 'hr' — il costo lo scala la RPC (salary × 2), non il client.
        const cassaPrima = gs.cash;
        await sandbox.hireOfficeStaff('hr');
        assert.equal(gs.staff.length, 1, "l'assunzione deve aggiungere il membro");
        const hr = gs.staff[0];
        const costoHr = hr.salary * 2;
        assert.equal(gs.cash, cassaPrima - costoHr,
            'assumere deve scalare il costo una tantum (salary × 2) dalla porta unica/RPC, non gratis');

        // 2) ASSUMI 'admin' — si raggiunge il limite della sede (2).
        const cassaPrima2 = gs.cash;
        await sandbox.hireOfficeStaff('admin');
        assert.equal(gs.staff.length, 2, "il secondo membro deve entrare");
        const admin = gs.staff[1];
        assert.equal(gs.cash, cassaPrima2 - admin.salary * 2, 'anche il secondo costo passa dal server');

        // 3) LIMITE — un terzo tentativo deve essere rifiutato senza toccare cassa né staff.
        const cassaAlLimite = gs.cash;
        await sandbox.hireOfficeStaff('hr'); // ci sarebbe posto solo potenziando la sede
        assert.equal(gs.staff.length, 2, 'oltre il limite della sede non si assume');
        assert.equal(gs.cash, cassaAlLimite, 'un\'assunzione rifiutata non deve addebitare nulla');

        // 4) LICENZIA 'hr' — rimuove il membro; il costo una tantum NON torna indietro.
        const cassaPrimaLicenziamento = gs.cash;
        sandbox.fireStaff('hr');
        assert.equal(gs.staff.length, 1, 'licenziare deve rimuovere il membro');
        assert.ok(!gs.staff.find(x => x.id === 'hr'), 'il membro licenziato non deve più esistere');
        assert.equal(gs.cash, cassaPrimaLicenziamento,
            'licenziare non restituisce il costo di assunzione: la cassa non cambia');
    });

    test('assumere senza fondi sufficienti non addebita e non aggiunge nessuno', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 10; // troppo poco per il costo di assunzione (salary × 2)
        const cassaPrima = gs.cash;

        await sandbox.hireOfficeStaff('hr');

        assert.equal(gs.staff.length, 0, 'senza fondi non si assume nessuno');
        assert.equal(gs.cash, cassaPrima, 'un\'assunzione fallita per fondi non deve muovere la cassa');
    });
});
