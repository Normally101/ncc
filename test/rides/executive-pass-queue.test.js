'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Vlad 22/08/2026: l'Executive Pass non allunga piu' la coda (10 -> 12 tolto).
// Il limite deve restare identico con e senza Pass; gli altri perk non cambiano.
describe('rides/executive-pass — il Pass NON allunga piu\u0300 la coda', () => {

    function attivaPass(sandbox) {
        sandbox.gameState.executivePassActive = true;
        sandbox.gameState.executivePassExpiresDay = sandbox.gameState.day + 30;
    }

    test('con Pass attivo il limite coda di _getDriverQueueInfo resta 10', () => {
        const { sandbox } = freshEnv();
        const driver = { id: 'd1', name: 'Mario', status: 'busy', assignedCarId: null, queue: [] };
        sandbox.gameState.drivers = [driver];
        attivaPass(sandbox);

        const info = sandbox._getDriverQueueInfo(driver);
        assert.equal(info.maxQueue, 10, 'il limite della coda non deve salire a 12 con il Pass attivo');
    });

    test('con Pass attivo _driverCanTakeRide blocca alla stessa coda di 10 corse', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false };
        const driver = {
            id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1',
            queue: Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, tier: 'standard' }))
        };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];
        attivaPass(sandbox);

        const ride = { id: 'r1', tier: 'standard' };
        assert.equal(
            sandbox._driverCanTakeRide(driver, ride),
            false,
            'la 11ª corsa deve essere rifiutata anche con il Pass attivo'
        );
    });

    test('con Pass attivo assignRideToDriver non aggiunge una 11ª corsa in coda', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'busy', assignedCarId: 'car1',
            queue: Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, tier: 'standard' })) };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];
        sandbox.gameState.pendingRides = [{ id: 'r1', tier: 'standard' }];
        attivaPass(sandbox);

        sandbox.assignRideToDriver('r1', 'd1');
        assert.equal(driver.queue.length, 10, 'la coda non deve superare 10 corse con il Pass attivo');
    });

    test('senza Pass il comportamento resta lo stesso: coda piena a 10', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false };
        const driver = {
            id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1',
            queue: Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, tier: 'standard' }))
        };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        const ride = { id: 'r1', tier: 'standard' };
        assert.equal(sandbox._driverCanTakeRide(driver, ride), false);
        assert.equal(sandbox._getDriverQueueInfo(driver).maxQueue, 10);
    });
});
