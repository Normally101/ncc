'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/tutorial — l'onboarding guidato di Vittorio (tutorial.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 45. File fuori dai CORE_FILES.

   · tutorialNext() — avanza di un passo e ridisegna la bolla #tut-box; oltre
     l'ultimo passo chiude e segna il tutorial come fatto.
   · tutorialSkip() — salta tutto: pulisce il DOM e scrive la chiave
     `chauffeurEmpireTutorialDone_v3` nel localStorage.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function tutEnv() {
    const env = createGameEnv([...CORE_FILES, 'tutorial.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/tutorial', () => {
    let env, w, doc;

    beforeEach(() => {
        env = tutEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        w.switchTab = () => {};
        for (const id of ['tb-cash', 'tb-rep', 'tb-energy-bar']) {
            const el = doc.createElement('div'); el.id = id; doc.body.appendChild(el);
        }
        w.startTutorial();               // parte dal passo 0 (intro)
    });
    afterEach(() => env.stopAllIntervals());

    const box = () => doc.getElementById('tut-box');
    const KEY = 'chauffeurEmpireTutorialDone_v3';

    test('startTutorial + tutorialNext: la bolla passa dal passo 0 al passo 1', () => {
        assert.ok(box(), 'il tutorial non ha disegnato la bolla');
        assert.match(box().textContent, /Benvenuto/, 'non è sul passo introduttivo');

        w.tutorialNext();

        assert.ok(box(), 'la bolla è sparita dopo un passo');
        assert.match(box().textContent, /La Cassa/, 'non è avanzato al passo successivo');
    });

    test('tutorialSkip: pulisce la bolla e segna il tutorial come fatto', () => {
        w.tutorialSkip();
        assert.equal(box(), null, 'la bolla non è stata rimossa');
        assert.equal(w.localStorage.getItem(KEY), '1', 'la chiave "tutorial fatto" non è stata scritta');
    });
});
