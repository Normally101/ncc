'use strict';
/* Test: l'Executive Pass NON deve allungare la coda degli autisti.
 *
 * Decisione Vlad 22/08/2026: si toglie del tutto l'allungamento 10 → 12,
 * senza metterne un altro al suo posto. Con o senza Pass il limite della
 * coda deve essere lo stesso (10).
 *
 * Il file engine-rides.js è un script browser: lo valutiamo in un sandbox
 * minimale (window + _tabIs stub) e ne esponiamo le funzioni sotto test. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const _src = fs.readFileSync(path.join(__dirname, '..', '..', 'engine-rides.js'), 'utf8');
globalThis.window = globalThis;
globalThis._tabIs = () => false;
(0, eval)(_src + '\n;globalThis.__EP = { assignRideToDriver, _driverCanTakeRide, _getDriverQueueInfo };');
const { assignRideToDriver, _driverCanTakeRide, _getDriverQueueInfo } = globalThis.__EP;

function _mkGameState(execPass) {
    return {
        day: 10,
        executivePassActive: execPass,
        executivePassExpiresDay: execPass ? 100 : 0,
        pendingRides: [],
        activeTrips: [],
        drivers: [],
        fleet: [],
        staff: [],
    };
}

function _mkRide(id) {
    return {
        id, tier: 'standard', price: 100, duration: 60000, elapsed: 0,
        fromPoi: { id: 'a', region: 'lazio', name: 'A' },
        toPoi:   { id: 'b', region: 'lazio', name: 'B' },
    };
}

test('Executive Pass attivo: il limite coda riportato da _getDriverQueueInfo resta 10', () => {
    globalThis.gameState = _mkGameState(true);
    const driver = { id: 'd1', name: 'Test', status: 'idle', queue: [] };
    const info = _getDriverQueueInfo(driver, globalThis.gameState);
    assert.equal(info.maxQueue, 10, 'il Pass non deve alzare il limite della coda');
});

test('Executive Pass attivo: _driverCanTakeRide rifiuta corse oltre le 10 in coda', () => {
    const gs = _mkGameState(true);
    globalThis.gameState = gs;
    gs.fleet.push({ id: 'c1', name: 'Auto', condition: 100, tier: 'business', vehicleClass: 'stellar_e_exec' });
    const driver = { id: 'd1', name: 'Test', status: 'busy', assignedCarId: 'c1', queue: [] };
    gs.drivers.push(driver);
    for (let i = 0; i < 10; i++) driver.queue.push(_mkRide(1000 + i));
    assert.equal(_driverCanTakeRide(driver, _mkRide(999)), false,
        'a coda piena (10) non si accettano altre corse, Pass o non Pass');
});

test('Executive Pass attivo: assignRideToDriver non supera le 10 corse in coda', () => {
    const gs = _mkGameState(true);
    globalThis.gameState = gs;
    const driver = { id: 'd1', name: 'Test', status: 'busy', queue: [] };
    gs.drivers.push(driver);
    for (let i = 0; i < 10; i++) driver.queue.push(_mkRide(2000 + i));
    for (let i = 0; i < 3; i++) {
        const ride = _mkRide(3000 + i);
        gs.pendingRides.push(ride);
        assignRideToDriver(ride.id, 'd1');
    }
    assert.equal(driver.queue.length, 10, 'con Pass attivo la coda si ferma a 10 come senza');
});

test('Senza Executive Pass la coda resta a 10 (controllo simmetria)', () => {
    const gs = _mkGameState(false);
    globalThis.gameState = gs;
    const driver = { id: 'd1', name: 'Test', status: 'idle', queue: [] };
    const info = _getDriverQueueInfo(driver, gs);
    assert.equal(info.maxQueue, 10);
});
