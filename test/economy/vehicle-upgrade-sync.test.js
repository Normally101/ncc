'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economy/vehicle-upgrade-sync — sincronizzazione cassa post upgrade veicolo', () => {
    test('buyCARUpgrade manda il cash aggiornato al server tramite ServerState.syncCash', () => {
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncedCash = cash;
                    return { success: true, cash };
                },
            },
        });
        const upg = { id: 'wifi', price: 2500 };
        sandbox.gameState.cash = upg.price + 1000;
        const expectedCash = sandbox.gameState.cash - upg.price;

        sandbox.buyCARUpgrade('c_starter', upg.id);

        assert.equal(sandbox.gameState.cash, expectedCash, 'il cash locale deve essere scalato del costo upgrade');
        assert.equal(syncedCash, expectedCash, 'il valore mandato al server tramite ServerState.syncCash deve coincidere col cash aggiornato');
    });
});
