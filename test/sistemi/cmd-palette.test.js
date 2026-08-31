'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/cmd-palette — palette dei comandi (cmd-palette.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 38. File fuori dai CORE_FILES.

   · openCmdPalette() — costruisce l'overlay #cmdp-overlay con l'input di ricerca
     #cmdp-input. Se è già aperto, non ne crea un secondo.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function cmdEnv() {
    const env = createGameEnv([...CORE_FILES, 'cmd-palette.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/cmd-palette', () => {
    let env, w, doc;

    beforeEach(() => {
        env = cmdEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
    });
    afterEach(() => env.stopAllIntervals());

    test('openCmdPalette: crea l\'overlay con l\'input di ricerca', () => {
        w.openCmdPalette();
        assert.ok(doc.getElementById('cmdp-overlay'), 'l\'overlay non è stato creato');
        assert.ok(doc.getElementById('cmdp-input'), 'manca l\'input di ricerca');
    });

    test('openCmdPalette: seconda chiamata → resta un solo overlay', () => {
        w.openCmdPalette();
        w.openCmdPalette();
        assert.equal(doc.querySelectorAll('#cmdp-overlay').length, 1, 'sono comparsi due overlay');
    });
});
