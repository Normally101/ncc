'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('progression/new-game-plus — reset e sync col server', () => {
    test('REGRESSIONE (fix 9 agosto 2026): newGamePlus manda il nuovo cash al server, non solo in locale', () => {
        // Prima del fix: newGamePlus resettava gameState.cash localmente senza mai chiamare
        // ServerState.syncCash — auth.js Fase 5 fa sempre vincere il valore server al prossimo
        // login/refresh, quindi il New Game+ poteva "tornare indietro" silenziosamente al cash
        // pre-reset. Vedi docs/SYSTEMS.md §1, HANDOFF.md 9 agosto.
        let syncedCash = 'NON CHIAMATO';
        const env = createGameEnv(CORE_FILES, {
            serverState: { syncCash: async (cash) => { syncedCash = cash; return { success: true, cash }; } },
        });
        env.sandbox.initGame(true);
        env.stopAllIntervals();
        env.sandbox.gameState.cash = 5_000_000; // giocatore ricco prima del reset
        env.sandbox.gameState.reputation = 4.0;

        env.sandbox.newGamePlus();

        assert.notEqual(syncedCash, 'NON CHIAMATO', 'ServerState.syncCash deve essere chiamata dopo il reset');
        assert.equal(syncedCash, env.sandbox.gameState.cash, 'il valore mandato al server deve coincidere col nuovo cash locale (legacyCash), non con quello vecchio');
        assert.ok(env.sandbox.gameState.cash < 5_000_000, 'il cash deve essere davvero resettato (legacy bonus, non il patrimonio pre-reset)');
    });

    test('newGamePlus eredita una quota di reputazione e resetta la progressione', () => {
        const env = createGameEnv(CORE_FILES);
        env.sandbox.initGame(true);
        env.stopAllIntervals();
        env.sandbox.gameState.reputation = 4.0;
        env.sandbox.gameState.day = 250;
        env.sandbox.gameState.fleet.push({ id: 'c_old', name: 'Vecchia Auto', tier: 'ultra', condition: 100, isLease: false });

        env.sandbox.newGamePlus();

        assert.equal(env.sandbox.gameState.day, 1, 'il giorno deve resettarsi a 1');
        assert.equal(env.sandbox.gameState.newGamePlusCount, 1, 'il contatore NG+ deve incrementare');
        assert.ok(env.sandbox.gameState.reputation > 0 && env.sandbox.gameState.reputation <= 2.0, 'la reputazione ereditata deve essere una frazione limitata (max 2.0), non quella intera');
        assert.equal(env.sandbox.gameState.fleet.find(c => c.id === 'c_old'), undefined, 'la vecchia flotta non deve sopravvivere al reset');
    });

    test('REGRESSIONE: sellCompanyNGP manda il nuovo cash al server', () => {
        let syncedCash = 'NON CHIAMATO';
        const env = createGameEnv(CORE_FILES, {
            serverState: { syncCash: async (cash) => { syncedCash = cash; return { success: true, cash }; } },
        });
        env.sandbox.initGame(true);
        env.stopAllIntervals();
        env.sandbox.gameState.staff.push({ id: 'ewm', name: 'Elite Wealth Manager' });
        env.sandbox.gameState.cash = 2_000_000;
        env.sandbox.gameState.reputation = 4.5;

        env.sandbox.sellCompanyNGP();

        assert.notEqual(syncedCash, 'NON CHIAMATO', 'ServerState.syncCash deve essere chiamata dopo l\'exit');
        assert.equal(syncedCash, env.sandbox.gameState.cash, 'il valore mandato al server deve coincidere col nuovo cash locale');
    });
});
