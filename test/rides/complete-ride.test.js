'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('rides/complete-ride — pagamento corsa una sola volta', () => {
    test('checkActiveTrips paga una corsa scaduta esattamente una volta', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.drivers.push({ id: 'd1', name: 'Autista Test', status: 'busy', queue: [] });
        sandbox.gameState.cash = 1000;
        sandbox.gameState.activeTrips.push({
            id: 't1', driverId: 'd1', driverName: 'Autista Test', toName: 'Roma',
            earnings: 500, endTime: Date.now() - 1000, // già scaduta
        });
        const cashBefore = sandbox.gameState.cash;

        sandbox.checkActiveTrips();

        assert.equal(sandbox.gameState.cash, cashBefore + 500, 'il pagamento deve avvenire esattamente una volta');
        assert.equal(sandbox.gameState.activeTrips.length, 0, 'il viaggio pagato deve essere rimosso da activeTrips');
    });

    test('SCENARIO F (doppio click/race): chiamare checkActiveTrips due volte di fila non paga due volte', () => {
        // Simula il caso "il game loop e un secondo trigger (es. click manuale su un pulsante
        // di refresh) sparano la stessa funzione quasi in contemporanea" — un difetto qui
        // duplicherebbe l'incasso ad ogni doppio trigger.
        const { sandbox } = freshEnv();
        sandbox.gameState.drivers.push({ id: 'd1', name: 'Autista Test', status: 'busy', queue: [] });
        sandbox.gameState.cash = 1000;
        sandbox.gameState.activeTrips.push({
            id: 't1', driverId: 'd1', driverName: 'Autista Test', toName: 'Roma',
            earnings: 500, endTime: Date.now() - 1000,
        });
        const cashBefore = sandbox.gameState.cash;

        sandbox.checkActiveTrips();
        sandbox.checkActiveTrips(); // seconda chiamata immediata — non deve trovare nulla da pagare

        assert.equal(sandbox.gameState.cash, cashBefore + 500, 'il secondo trigger non deve pagare una seconda volta');
    });

    test('un viaggio non ancora scaduto non viene pagato', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.drivers.push({ id: 'd1', name: 'Autista Test', status: 'busy', queue: [] });
        sandbox.gameState.cash = 1000;
        sandbox.gameState.activeTrips.push({
            id: 't1', driverId: 'd1', driverName: 'Autista Test', toName: 'Roma',
            earnings: 500, endTime: Date.now() + 60000, // scade tra 1 minuto
        });
        const cashBefore = sandbox.gameState.cash;

        sandbox.checkActiveTrips();

        assert.equal(sandbox.gameState.cash, cashBefore, 'un viaggio non scaduto non deve pagare');
        assert.equal(sandbox.gameState.activeTrips.length, 1, 'il viaggio deve restare in attesa');
    });

    test('a fine viaggio l\'autista torna idle', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.drivers.push({ id: 'd1', name: 'Autista Test', status: 'busy', queue: [] });
        sandbox.gameState.activeTrips.push({
            id: 't1', driverId: 'd1', driverName: 'Autista Test', toName: 'Roma',
            earnings: 200, endTime: Date.now() - 1000,
        });

        sandbox.checkActiveTrips();

        const driver = sandbox.gameState.drivers.find(d => d.id === 'd1');
        assert.equal(driver.status, 'idle', 'l\'autista deve tornare disponibile dopo il pagamento');
    });
});
