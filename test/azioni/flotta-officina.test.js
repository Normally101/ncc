'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Banco di prova per le azioni officina/flotta che muovono denaro o Driver Coins:
// repairEngine, instantRepairDC, emergencyRefuel, buyFuelForDepot, buyTiresForDepot.
// Regola osservata: se il saldo si muove, la scrittura passa dal server
// (ServerState.* o CE_money), mai da un gameState.cash -= locale.

function autoOfficina(id, extra = {}) {
    return Object.assign({
        id,
        _serverId: 'srv_' + id,
        name: 'Auto ' + id,
        tier: 'business',
        condition: 100,
        engineHealth: 100,
        isLease: false,
    }, extra);
}

describe('azioni/flotta-officina — repairEngine', () => {
    test('ripara il motore danneggiato addebitando il costo UNA volta sola via RPC', async () => {
        const chiamate = [];
        const { sandbox } = freshEnv({
            serverState: {
                // Spy sul mock: il costo deve passare qui, una sola volta.
                repairVehicle: async (_serverId, cost) => {
                    chiamate.push(cost);
                    sandbox.gameState.cash -= cost;
                    return { success: true };
                },
            },
        });
        const car = autoOfficina('c_eng', { engineHealth: 40 });
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;
        const atteso = Math.max(800, (100 - 40) * 180);

        await sandbox.repairEngine('c_eng');

        assert.equal(chiamate.length, 1, 'la RPC di riparazione deve partire una volta sola');
        assert.equal(chiamate[0], atteso, `la RPC deve ricevere il costo esatto (${atteso})`);
        assert.equal(car.engineHealth, 100, 'il motore torna al 100%');
        assert.equal(sandbox.gameState.cash, cashBefore - atteso,
            'il cash scala una sola volta, dell\u2019importo passato alla RPC');
    });

    test('motore gia\u0300 integro: nessun costo', async () => {
        const { sandbox } = freshEnv();
        const car = autoOfficina('c_okeng', { engineHealth: 100 });
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;

        await sandbox.repairEngine('c_okeng');

        assert.equal(sandbox.gameState.cash, cashBefore, 'nessun movimento di cassa');
        assert.equal(car.engineHealth, 100);
    });

    test('bersaglio inesistente: non esplode e non muove cassa', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;

        await sandbox.repairEngine('c_non_esiste');

        assert.equal(sandbox.gameState.cash, cashBefore);
    });

    test('fondo cassa insufficiente: la RPC rifiuta e il motore resta rotto', async () => {
        let costoRichiesto = null;
        const { sandbox } = freshEnv({
            serverState: {
                repairVehicle: async (_serverId, cost) => {
                    costoRichiesto = cost;
                    if ((sandbox.gameState.cash || 0) < cost) return null; // RAISE del vero rpc
                    sandbox.gameState.cash -= cost;
                    return { success: true };
                },
            },
        });
        const car = autoOfficina('c_povera', { engineHealth: 40 });
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 100; // meno del costo minimo 800

        await sandbox.repairEngine('c_povera');

        assert.ok(costoRichiesto >= 800, 'il costo minimo \u00e8 800');
        assert.equal(car.engineHealth, 40, 'nessuna riparazione senza fondi');
        assert.equal(sandbox.gameState.cash, 100, 'cassa intatta dopo il rifiuto');
    });
});

describe('azioni/flotta-officina — instantRepairDC', () => {
    test('riparazione istantanea costa 2 DC e riporta la condizione a 100', () => {
        const { sandbox } = freshEnv();
        const car = autoOfficina('c_dc', { condition: 50, outOfService: 'tires' });
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.driverCoins = 10;

        sandbox.instantRepairDC('c_dc');

        assert.equal(car.condition, 100, 'condizione rispristinata');
        assert.equal(car.outOfService, null, 'il fermo tecnico viene tolto');
        assert.equal(sandbox.gameState.driverCoins, 8, 'esattamente 2 DC spesi');
    });

    test('con Executive Pass la riparazione istantanea costa 1 DC', () => {
        const { sandbox } = freshEnv();
        const car = autoOfficina('c_dc2', { condition: 30 });
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.executivePassActive = true;
        sandbox.gameState.driverCoins = 10;

        sandbox.instantRepairDC('c_dc2');

        assert.equal(car.condition, 100);
        assert.equal(sandbox.gameState.driverCoins, 9, 'solo 1 DC con il pass');
    });

    test('DC insufficienti: la spesa viene rifiutata e nulla cambia', () => {
        const { sandbox } = freshEnv();
        const car = autoOfficina('c_dcpo', { condition: 30 });
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.driverCoins = 1;

        sandbox.instantRepairDC('c_dcpo');

        assert.equal(car.condition, 30, 'senza DC la riparazione non avviene');
        assert.equal(sandbox.gameState.driverCoins, 1, 'saldo DC intatto');
    });

    test('veicolo gia\u0300 al 100%: nessun DC speso', () => {
        const { sandbox } = freshEnv();
        const car = autoOfficina('c_dcok');
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.driverCoins = 5;

        sandbox.instantRepairDC('c_dcok');

        assert.equal(sandbox.gameState.driverCoins, 5);
    });
});
