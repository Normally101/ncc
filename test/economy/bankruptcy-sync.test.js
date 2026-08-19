'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economy/bankruptcy-sync — il pignoramento sincronizza la cassa col server', () => {
    test('_triggerBankruptcy manda al server il saldo rialzato (>= 800), non quello negativo', () => {
        const synced = [];
        const { sandbox } = freshEnv({
            serverState: { syncCash: async (cash) => { synced.push(cash); return { success: true, cash }; } },
        });
        sandbox.gameState.cash = -12000;

        sandbox._triggerBankruptcy();

        assert.ok(synced.length >= 1, 'il pignoramento deve spingere il nuovo saldo al server: il tick ha sincronizzato PRIMA di chiamarlo, quindi nessun altro lo farebbe');
        assert.equal(synced[synced.length - 1], sandbox.gameState.cash, "l'ultimo valore mandato al server deve coincidere col cash locale post-pignoramento");
        assert.ok(synced[synced.length - 1] >= 800, `il server deve ricevere il saldo rialzato (>= 800), non il negativo pre-pignoramento — ricevuto ${synced[synced.length - 1]}`);
    });

    test('dopo un tick che scatena il pignoramento, il server non resta col saldo negativo', () => {
        const synced = [];
        const { sandbox } = freshEnv({
            serverState: { syncCash: async (cash) => { synced.push(cash); return { success: true, cash }; } },
        });
        sandbox.gameState.cash = -50000;
        sandbox.gameState.consecutiveRedDays = 2; // il terzo giorno in rosso fa scattare il pignoramento

        sandbox.processDailyRoutines();

        assert.equal(sandbox.gameState.consecutiveRedDays, 0, 'sanity check: il pignoramento è davvero scattato (azzera il contatore dei giorni in rosso)');
        assert.ok(synced.length >= 1, 'il tick deve aver sincronizzato almeno una volta');
        assert.equal(synced[synced.length - 1], sandbox.gameState.cash, "l'ultimo valore mandato al server deve coincidere col cash locale finale: altrimenti il giocatore vede una cassa e le RPC (P2P, alleanze, IPO, province) ne vedono un'altra");
        assert.ok(!synced.includes(-50000) || synced[synced.length - 1] !== -50000, 'il valore finale sul server non può essere il negativo pre-pignoramento');
    });
});
