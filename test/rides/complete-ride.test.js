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

    test('REGRESSIONE (playtest 15 agosto 2026): il pagamento della corsa viene rispecchiato sul server', () => {
        // Bug trovato giocando: engine-rides.js incrementava gameState.cash senza mai chiamare
        // syncCash. Il blob game_saves finiva a 923 mentre companies.cash restava a 650, e al
        // reload bridgeToGameState() sovrascriveva col valore del server → ogni incasso da corsa
        // spariva. È il ciclo di gioco centrale, quindi va bloccato con un test.
        const { sandbox } = freshEnv();
        const synced = [];
        sandbox.window.ServerState.syncCash = async (cash) => { synced.push(cash); return { success: true, cash }; };

        sandbox.gameState.drivers.push({ id: 'd1', name: 'Autista Test', status: 'busy', queue: [] });
        sandbox.gameState.cash = 1000;
        sandbox.gameState.activeTrips.push({
            id: 't1', driverId: 'd1', driverName: 'Autista Test', toName: 'Roma',
            earnings: 500, endTime: Date.now() - 1000,
        });

        sandbox.checkActiveTrips();

        assert.equal(sandbox.gameState.cash, 1500, 'il pagamento locale deve restare corretto');
        assert.ok(synced.length >= 1, 'checkActiveTrips deve rispecchiare il cash sul server');
        assert.equal(synced[synced.length - 1], 1500, 'il valore sincronizzato deve includere l\'incasso della corsa');
    });

    test('REGRESSIONE: più viaggi chiusi nello stesso passaggio producono un solo sync col totale finale', () => {
        const { sandbox } = freshEnv();
        const synced = [];
        sandbox.window.ServerState.syncCash = async (cash) => { synced.push(cash); return { success: true, cash }; };

        sandbox.gameState.drivers.push({ id: 'd1', name: 'A', status: 'busy', queue: [] });
        sandbox.gameState.drivers.push({ id: 'd2', name: 'B', status: 'busy', queue: [] });
        sandbox.gameState.cash = 1000;
        sandbox.gameState.activeTrips.push(
            { id: 't1', driverId: 'd1', driverName: 'A', toName: 'Roma',  earnings: 300, endTime: Date.now() - 1000 },
            { id: 't2', driverId: 'd2', driverName: 'B', toName: 'Milano', earnings: 200, endTime: Date.now() - 1000 },
        );

        sandbox.checkActiveTrips();

        assert.equal(sandbox.gameState.cash, 1500, 'entrambi i viaggi devono essere pagati');
        assert.equal(synced.length, 1, 'un solo sync per passaggio, non uno per viaggio');
        assert.equal(synced[0], 1500, 'il sync deve portare il totale dopo tutti i pagamenti');
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
