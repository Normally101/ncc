'use strict';
/* Smoke del banco di prova: CORE_FILES, per intero, si carica senza errori,
   avvia una partita nuova e non lascia intervalli attivi nel processo.
   Quando si aggiunge un file al banco questo è il primo test da guardare:
   se diventa rosso, il file nuovo non regge l'ambiente Node o rompe un file
   caricato prima di lui (createGameEnv include il nome del file nell'errore). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

test('il banco carica tutti i file di CORE_FILES e avvia una partita nuova', () => {
    const env = createGameEnv(CORE_FILES);
    try {
        assert.equal(typeof env.sandbox.initGame, 'function', 'initGame deve esistere dopo il caricamento');
        env.sandbox.initGame(true);
        assert.ok(env.sandbox.gameState, 'initGame(true) deve produrre gameState');
    } finally {
        env.stopAllIntervals();
    }
});
