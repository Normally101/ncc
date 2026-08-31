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

    /* generatePOIRide è probabilistico: pesca origine e destinazione a caso fra i
       POI sbloccati e restituisce null se coincidono (in una partita nuova le
       regioni sono poche, quindi capita). Si insiste finché almeno una corsa
       standard è in coda — in isolamento bastava un colpo, a suite piena no. */
    function seminaCorse() {
        for (let i = 0; i < 60 && gs().pendingRides.length === 0; i++) w.generatePOIRide('standard');
        assert.ok(gs().pendingRides.length >= 1, 'non sono riuscito a generare una corsa in attesa');
        return gs().pendingRides.length;
    }

    test('assignAllRides: corse in attesa + autista compatibile → assegnate, avviso di successo', () => {
        seminaCorse();

        w.assignAllRides();

        assert.equal(gs().pendingRides.length, 0, 'le corse non sono state tolte dalla lista d\'attesa');
        assert.ok(successi().some(m => /smistat/.test(m)), 'nessun avviso di corse smistate');
    });

    test('assignAllRides: nessun autista compatibile → le corse restano, avviso d\'errore', () => {
        const n = seminaCorse();
        gs().drivers = [];

        w.assignAllRides();

        assert.equal(gs().pendingRides.length, n, 'ha "assegnato" corse senza autisti');
        assert.ok(errori().some(m => /[Nn]essun autista/.test(m)));
    });

    test('assignAllRides: lista d\'attesa vuota → nessun avviso', () => {
        gs().pendingRides = [];
        w.assignAllRides();
        assert.equal(avvisi.length, 0);
    });
});
