'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/drivers — la gestione degli autisti (engine-drivers.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 13. Sette azioni, tutte a denaro locale
   (`CE_money.spend`) o senza denaro: riposo, pausa, bonus, azzera-stress,
   risolvi-sciopero, assunzione, licenziamento. Per ognuna: l'effetto sullo stato
   dell'autista, il denaro che si muove dalla porta, il rifiuto quando l'autista
   è in servizio o mancano i fondi.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/drivers', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 500000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const nuovo  = (over = {}) => {
        const d = { id: 'd_test', name: 'Marco', salary: 2500, status: 'idle', stress_level: 0, morale: 100, satisfaction: 50, ...over };
        gs().drivers.push(d);
        return d;
    };

    test('sendDriverToRest: un autista libero va a riposo; uno occupato o già a riposo non si tocca', () => {
        const d = nuovo();
        w.sendDriverToRest('d_test');
        assert.equal(d.status, 'resting');

        const busy = nuovo({ id: 'd_busy', status: 'busy' });
        w.sendDriverToRest('d_busy');
        assert.equal(busy.status, 'busy');
    });

    test('putDriverOnBreak: pausa 4h e stress −40; in servizio → errore', () => {
        const d = nuovo({ stress_level: 70 });
        w.putDriverOnBreak('d_test');
        assert.equal(d.status, 'resting');
        assert.equal(d.stress_level, 30);

        const busy = nuovo({ id: 'd_busy', status: 'busy', stress_level: 70 });
        w.putDriverOnBreak('d_busy');
        assert.equal(busy.stress_level, 70, 'non doveva ridurre lo stress di uno in servizio');
        assert.ok(errori().some(m => /servizio/i.test(m)));
    });

    test('payDriverBonus: scala l\'importo e alza soddisfazione e morale', () => {
        const d = nuovo({ satisfaction: 20, morale: 50 });
        const prima = gs().cash;

        w.payDriverBonus('d_test', 3000);

        assert.equal(gs().cash, prima - 3000);
        assert.ok(d.satisfaction > 20 && d.morale > 50);
    });

    test('payDriverBonus: importo ≤ 0 o fondi insufficienti → nessuna spesa', () => {
        const d = nuovo();
        const prima = gs().cash;
        w.payDriverBonus('d_test', 0);
        w.payDriverBonus('d_test', -100);
        assert.equal(gs().cash, prima);

        R.conSoldi(env, 100);
        w.payDriverBonus('d_test', 5000);
        assert.equal(gs().cash, 100);
    });

    test('payStressClear: €1.000 azzerano stress e burnout; non stressato → niente spesa', () => {
        const d = nuovo({ stress_level: 90, burnout_until: 999 });
        const prima = gs().cash;

        w.payStressClear('d_test');

        assert.equal(gs().cash, prima - 1000);
        assert.equal(d.stress_level, 0);
        assert.equal(d.burnout_until, null);

        const prima2 = gs().cash;
        w.payStressClear('d_test');       // ora non è più stressato
        assert.equal(gs().cash, prima2);
    });

    test('resolveStrike: paga metà stipendio e riporta l\'autista al lavoro', () => {
        const d = nuovo({ isOnStrike: true, salary: 3000, status: 'idle' });
        const prima = gs().cash;

        w.resolveStrike('d_test');

        assert.equal(gs().cash, prima - 1500);
        assert.equal(d.isOnStrike, false);
        assert.equal(d.status, 'idle');
    });

    test('resolveStrike con fondi insufficienti: lo sciopero continua', () => {
        const d = nuovo({ isOnStrike: true, salary: 3000 });
        R.conSoldi(env, 100);
        w.resolveStrike('d_test');
        assert.equal(d.isOnStrike, true);
        assert.equal(gs().cash, 100);
    });

    test('hireDriver: costa il doppio dello stipendio e aggiunge l\'autista', () => {
        const prima = gs().cash;
        const nDrivers = gs().drivers.length;

        w.hireDriver('Nuovo Autista', 2000);

        assert.equal(gs().cash, prima - 4000);
        assert.equal(gs().drivers.length, nDrivers + 1);
        assert.ok(gs().drivers.some(d => d.name === 'Nuovo Autista'));
    });

    test('hireDriver con fondi insufficienti: nessun assunto, cassa intatta', () => {
        R.conSoldi(env, 1000);
        const nDrivers = gs().drivers.length;
        w.hireDriver('Costoso', 5000);
        assert.equal(gs().drivers.length, nDrivers);
        assert.equal(gs().cash, 1000);
    });

    test('fireDriver: rimuove l\'autista; se è in servizio rifiuta e lo tiene', () => {
        const d = nuovo();
        const n = gs().drivers.length;
        w.fireDriver('d_test');
        assert.equal(gs().drivers.length, n - 1);

        const busy = nuovo({ id: 'd_busy', status: 'busy' });
        const n2 = gs().drivers.length;
        w.fireDriver('d_busy');
        assert.equal(gs().drivers.length, n2, 'non si licenzia un autista in corsa');
        assert.ok(errori().some(m => /servizio/i.test(m)));
    });
});
