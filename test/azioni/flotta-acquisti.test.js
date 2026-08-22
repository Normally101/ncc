'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('azioni/flotta-acquisti — acquisti flotta esercitabili nel banco di prova', () => {
    // Forma copiata da test/economy/vehicle-upgrade-sync.test.js
    test('buyCARUpgrade scala il costo dell\'upgrade una volta sola e sincronizza il server', () => {
        let syncCalls = 0;
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncCalls++;
                    syncedCash = cash;
                    return { success: true, cash };
                },
            },
        });
        const upg = { id: 'wifi', price: 2500 };
        sandbox.gameState.cash = upg.price + 1000;
        const expectedCash = sandbox.gameState.cash - upg.price;

        sandbox.buyCARUpgrade('c_starter', upg.id);

        assert.equal(sandbox.gameState.cash, expectedCash, 'il cash locale deve scalare del costo una volta sola');
        assert.equal(syncedCash, expectedCash, 'il valore mandato al server deve coincidere col cash aggiornato');
        assert.equal(syncCalls, 1, 'una sola sincronizzazione per acquisto');
    });
});
