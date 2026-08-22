'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Livello numerico del giocatore (richiesta vocale Vlad 22/08): parte da 1,
   sale con le azioni di gioco, convive coi gradi da prestigio senza
   sostituirli, sopravvive al ricaricamento e non scende mai. */

describe('progression/livello-giocatore — livello numerico che sale spesso nei primi passi', () => {

    test('una nuova partita parte dal livello 1 con 0 XP', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        assert.equal(gs.playerLevel, 1, 'il livello iniziale deve essere 1');
        assert.equal(gs.playerXp, 0, "l'XP iniziale deve essere 0");
        assert.equal(sandbox.playerLevelFromXp(gs.playerXp), 1,
            '0 XP devono corrispondere al livello 1');
    });

    test('le soglie di XP sono strettamente crescenti e coprono molti livelli', () => {
        const { sandbox } = freshEnv();
        const soglie = sandbox.PLAYER_LEVELS_XP;
        assert.ok(Array.isArray(soglie) && soglie.length >= 15, 'servono almeno 15 livelli');
        assert.equal(soglie[0], 0, 'la prima soglia è 0 (livello 1)');
        for (let i = 1; i < soglie.length; i++) {
            assert.ok(soglie[i] > soglie[i - 1],
                `la soglia del livello ${i + 1} (${soglie[i]}) deve superare quella del livello ${i} (${soglie[i - 1]})`);
        }
    });

    test('_addPlayerXp fa salire il livello e non scende mai', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        sandbox._addPlayerXp(-50);
        assert.equal(gs.playerXp, 0, 'XP negativo deve essere ignorato');
        assert.equal(gs.playerLevel, 1);

        sandbox._addPlayerXp(sandbox.PLAYER_LEVELS_XP[3]);
        assert.equal(gs.playerLevel, 4, 'raggiunta la soglia del livello 4, il livello è 4');

        const prima = gs.playerLevel;
        sandbox._addPlayerXp(-10);
        assert.equal(gs.playerLevel, prima, 'nessun input può far scendere il livello');
        assert.equal(gs.playerXp, sandbox.PLAYER_LEVELS_XP[3], 'e nemmeno l’XP accumulato');
    });

    test('livello e XP sopravvivono al ricaricamento (loadGame)', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        sandbox._addPlayerXp(sandbox.PLAYER_LEVELS_XP[5]);
        const lvlPrima = gs.playerLevel;
        assert.ok(lvlPrima >= 6);

        const fakeSave = { ...gs };
        sandbox.window.currentSlotIndex = null; // forza il fallback localStorage, come persistence.test.js
        sandbox.localStorage.setItem('chauffeurEmpireSave_v2', JSON.stringify(fakeSave));

        assert.equal(sandbox.loadGame(), true);
        assert.equal(sandbox.gameState.playerXp, sandbox.PLAYER_LEVELS_XP[5], "l'XP deve essere ripristinato");
        assert.equal(sandbox.gameState.playerLevel, lvlPrima, 'il livello non cambia ricaricando');
    });

    test('un salvataggio vecchio senza playerXp non crasha e parte dal livello 1', () => {
        const { sandbox } = freshEnv();
        const fakeSave = { ...sandbox.gameState };
        delete fakeSave.playerXp;
        delete fakeSave.playerLevel;
        sandbox.window.currentSlotIndex = null;
        sandbox.localStorage.setItem('chauffeurEmpireSave_v2', JSON.stringify(fakeSave));

        assert.equal(sandbox.loadGame(), true, 'loadGame deve accettare salvataggi precedenti al livello');
        assert.equal(sandbox.gameState.playerLevel, 1, 'un salvataggio senza livello riparte da 1');
        assert.equal(sandbox.gameState.playerXp, 0);
    });
});
