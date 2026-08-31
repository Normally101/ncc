'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/rides — "Smista tutte" (engine-rides.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 30. Una azione:

   · assignAllRides() — assegna ogni corsa in attesa all'autista compatibile con
     la coda più corta. Se ne assegna almeno una → avviso di successo con il
     conteggio; se non c'è nessun autista compatibile → avviso d'errore; lista
     vuota → non fa nulla.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/rides', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.updateUI = () => {};
        // CEO con la berlina starter assegnata e in buono stato
        gs().drivers[0].assignedCarId = 'c_starter';
        gs().fleet[0].condition = 85;
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const successi = () => avvisi.filter(a => a.t === 'success').map(a => a.m);

    test('assignAllRides: una corsa in attesa + autista compatibile → assegnata, avviso di successo', () => {
        w.generatePOIRide('standard');
        assert.equal(gs().pendingRides.length, 1);

        w.assignAllRides();

        assert.equal(gs().pendingRides.length, 0, 'la corsa non è stata tolta dalla lista d\'attesa');
        assert.ok(successi().some(m => /smistat/.test(m)), 'nessun avviso di corse smistate');
    });

    test('assignAllRides: nessun autista compatibile → la corsa resta, avviso d\'errore', () => {
        w.generatePOIRide('standard');
        gs().drivers = [];

        w.assignAllRides();

        assert.equal(gs().pendingRides.length, 1, 'ha "assegnato" una corsa senza autisti');
        assert.ok(errori().some(m => /[Nn]essun autista/.test(m)));
    });

    test('assignAllRides: lista d\'attesa vuota → nessun avviso', () => {
        gs().pendingRides = [];
        w.assignAllRides();
        assert.equal(avvisi.length, 0);
    });
});
