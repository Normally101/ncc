'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/hq-visual — planimetria HQ (hq-visual.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 43. File fuori dai CORE_FILES.

   · hqOpenBuildModalSlot(city, slot) — costruisce #hq-build-modal con le stanze
     che si possono mettere in quel lotto; riapertura → un solo modale.
   · hqShowInfoPanel(roomId)          — pannello #hq-info-panel per una stanza già
     costruita; stanza a livello 0 → niente.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function hqvEnv() {
    const env = createGameEnv([...CORE_FILES, 'hq-visual.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/hq-visual', () => {
    let env, w, doc;

    beforeEach(() => {
        env = hqvEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        w.hqInit();                       // garantisce gameState.hqs
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('hqOpenBuildModalSlot: costruisce il modale del lotto; riapertura → uno solo', () => {
        w.hqOpenBuildModalSlot('roma', 1);
        assert.ok(doc.getElementById('hq-build-modal'), 'il modale non è stato creato');

        w.hqOpenBuildModalSlot('roma', 2);
        assert.equal(doc.querySelectorAll('#hq-build-modal').length, 1, 'sono rimasti due modali');
    });

    test('hqShowInfoPanel: per una stanza costruita crea #hq-info-panel', () => {
        gs().currentHQCity = 'roma';
        assert.equal(w.hqGetRoomLevel('roma', 'garage_main'), 1, 'il garage starter non è a L1');

        w.hqShowInfoPanel('garage_main');

        assert.ok(doc.getElementById('hq-info-panel'), 'il pannello info non è stato creato');
    });

    test('hqShowInfoPanel: stanza non costruita (livello 0) → nessun pannello', () => {
        gs().currentHQCity = 'roma';
        w.hqShowInfoPanel('workshop');    // mai costruita
        assert.equal(doc.getElementById('hq-info-panel'), null);
    });
});
