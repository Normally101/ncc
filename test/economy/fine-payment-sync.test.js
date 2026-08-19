'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economy/fine-payment-sync — sincronizzazione cassa post pagamento multa', () => {
    test('payFine manda il cash aggiornato al server tramite ServerState.syncCash', () => {
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncedCash = cash;
                    return { success: true, cash };
                },
            },
        });

        const fineAmount = 500;
        const fineId = 'fine_test_1';
        sandbox.gameState.activeFines = [
            { id: fineId, amount: fineAmount, status: 'pending', reason: 'Eccesso di velocità' },
        ];
        sandbox.gameState.cash = 2000;
        const expectedCash = 2000 - fineAmount;

        sandbox.payFine(fineId);

        assert.equal(sandbox.gameState.cash, expectedCash, 'il cash locale deve essere scalato dell\'importo della multa');
        assert.equal(sandbox.gameState.activeFines[0].status, 'paid', 'lo stato della multa deve passare a paid');
        assert.equal(syncedCash, expectedCash, 'il valore mandato al server tramite ServerState.syncCash deve coincidere col cash aggiornato');
    });

    test('payFine con fondi insufficienti non scala il cash e non chiama ServerState.syncCash', () => {
        let syncCalled = false;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncCalled = true;
                    return { success: true, cash };
                },
            },
        });

        const fineAmount = 500;
        const fineId = 'fine_test_broke';
        sandbox.gameState.activeFines = [
            { id: fineId, amount: fineAmount, status: 'pending' },
        ];
        sandbox.gameState.cash = 100;

        sandbox.payFine(fineId);

        assert.equal(sandbox.gameState.cash, 100, 'il cash locale non deve essere modificato');
        assert.equal(sandbox.gameState.activeFines[0].status, 'pending', 'la multa deve rimanere pending');
        assert.equal(syncCalled, false, 'ServerState.syncCash non deve essere chiamato se i fondi sono insufficienti');
    });

    test('payFine su multa non trovata o non pending non chiama ServerState.syncCash', () => {
        let syncCalled = false;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncCalled = true;
                    return { success: true, cash };
                },
            },
        });

        sandbox.gameState.activeFines = [
            { id: 'fine_already_paid', amount: 300, status: 'paid' },
        ];
        sandbox.gameState.cash = 1000;

        sandbox.payFine('fine_non_existent');
        sandbox.payFine('fine_already_paid');

        assert.equal(sandbox.gameState.cash, 1000, 'il cash non deve variare');
        assert.equal(syncCalled, false, 'ServerState.syncCash non deve essere invocato per multe inesistenti o già pagate');
    });
});
