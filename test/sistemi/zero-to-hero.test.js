'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/zero-to-hero — la sopravvivenza iniziale (zero-to-hero.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 21. Quattro azioni del "fondo del barile":

   · executeManualDrive   — una corsa a mano: −10 energia, incassa via
     `CE_money.earn` (la porta unica, con causale), +1 corsa completata.
   · executeSleepInCar     — dormi in auto: energia → 100 (l'orologio NON avanza).
   · _ceCapitalismAck      — chiude la rivelazione "diventa manager".
   · hireNeighborhoodKid   — il primo autista a €0 d'ingaggio, eredita la berlina
     starter; non lo si assume due volte.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/zero-to-hero', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.renderManualSurvivalMode = () => {};
        w._z2hApplyNav = () => {};
        w.spawnMoneyParticles = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('executeManualDrive: −10 energia, incassa dalla porta, +1 corsa', () => {
        gs().energy = 50;
        gs().questStats = { totalRides: 0 };
        const cassaPrima = gs().cash;

        w.executeManualDrive();

        assert.equal(gs().energy, 40);
        assert.ok(gs().cash > cassaPrima, 'la corsa non ha incassato niente');
        assert.equal(gs().questStats.totalRides, 1);
    });

    test('executeManualDrive: senza energia non fa niente', () => {
        gs().energy = 5;
        gs().questStats = { totalRides: 0 };
        const cassaPrima = gs().cash;

        w.executeManualDrive();

        assert.equal(gs().energy, 5);
        assert.equal(gs().cash, cassaPrima);
        assert.equal(gs().questStats.totalRides, 0);
    });

    test('executeSleepInCar: energia a 100', () => {
        gs().energy = 12;
        w.executeSleepInCar();
        assert.equal(gs().energy, 100);
    });

    test('_ceCapitalismAck: rimuove la rivelazione e il tema survival', () => {
        const ov = env.sandbox.document.createElement('div'); ov.id = 'z2h-capitalism';
        env.sandbox.document.body.appendChild(ov);
        env.sandbox.document.body.classList.add('theme-survival');

        w._ceCapitalismAck();

        assert.equal(env.sandbox.document.getElementById('z2h-capitalism'), null);
        assert.equal(env.sandbox.document.body.classList.contains('theme-survival'), false);
    });

    test('hireNeighborhoodKid: aggiunge il Ragazzo di Quartiere e gli dà la berlina starter, una volta sola', () => {
        gs().fleet = [{ id: 'c_starter', name: 'Berlina Base', isStarter: true }];
        const n = gs().drivers.length;

        w.hireNeighborhoodKid();

        const kid = gs().drivers.find(d => d.name === 'Ragazzo di Quartiere');
        assert.ok(kid, 'il ragazzo non è stato assunto');
        assert.equal(kid.salary, 40);
        assert.equal(kid.assignedCarId, 'c_starter');
        assert.equal(gs().drivers.length, n + 1);

        w.hireNeighborhoodKid();
        assert.equal(gs().drivers.filter(d => d.name === 'Ragazzo di Quartiere').length, 1, 'assunto due volte');
    });
});
