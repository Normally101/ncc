'use strict';
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/* La coda dell'autista non si misura più in NUMERO di corse ma in ORE:
   4 ore di base per autista, allungabile con Driver Coins fino a 12.
   Vlad, decisione del 22/08/2026. */

const MIN = 60 * 1000;

function mkRide(id, price, durMs) {
    return {
        id,
        price,
        tier: 'standard',
        duration: durMs,
        elapsed: 0,
        fromPoi: { id: 'roma_fco', name: 'Roma FCO', region: 'lazio' },
        toPoi: { id: 'roma_term', name: 'Roma Termini', region: 'lazio' }
    };
}

describe('rides/coda-a-ore — il tetto della coda è un monte ore, non un numero di corse', () => {
    let env, sandbox, gs, container;

    beforeEach(() => {
        env = createGameEnv(CORE_FILES, { render: true });
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 15;

        container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);
    });

    afterEach(() => {
        env.stopAllIntervals();
        container.remove();
    });

    test('1. il limite di coda è espresso in ORE: 4 di base per ogni autista', () => {
        assert.equal(typeof sandbox._getDriverQueueLimitHours, 'function',
            'deve esistere _getDriverQueueLimitHours(driver)');
        const d1 = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [] };
        const d2 = { id: 'd2', name: 'Luigi', status: 'idle', assignedCarId: null, queue: [] };
        assert.equal(sandbox._getDriverQueueLimitHours(d1), 4, 'base 4 ore');
        assert.equal(sandbox._getDriverQueueLimitHours(d2), 4, 'uguale per tutti gli autisti nuovi');
    });

    test('2. la scala degli scatti è 4→6→8→10→12 e si paga in Driver Coins via spendDC', () => {
        const d = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [] };
        assert.equal(typeof sandbox.DRIVER_QUEUE_HOURS_STEPS, 'object', 'deve esistere la scala degli scatti');
        assert.deepEqual(sandbox.DRIVER_QUEUE_HOURS_STEPS, [4, 6, 8, 10, 12]);
        assert.equal(sandbox.DRIVER_QUEUE_HOURS_MAX, 12, 'tetto massimo 12 ore');

        // l'acquisto passa da window.CE_money.spendDC, mai da gameState.driverCoins -=
        let speso = null;
        sandbox.window.CE_money.spendDC = (cost, reason) => { speso = { cost, reason }; return true; };
        gs.driverCoins = 1000;

        assert.equal(typeof sandbox.upgradeDriverQueueHours, 'function',
            'deve esistere upgradeDriverQueueHours(driver)');
        const ok = sandbox.upgradeDriverQueueHours(d);
        assert.ok(ok, 'l upgrade deve riuscire');
        assert.ok(speso && speso.cost > 0, 'deve chiamare spendDC con un costo positivo');
        assert.equal(gs.driverCoins, 1000, 'non deve mai sottrarre driverCoins direttamente');
        assert.equal(sandbox._getDriverQueueLimitHours(d), 6, 'dopo il primo scatto il tetto è 6 ore');

        // fino al tetto
        sandbox.upgradeDriverQueueHours(d); // 8
        sandbox.upgradeDriverQueueHours(d); // 10
        sandbox.upgradeDriverQueueHours(d); // 12
        assert.equal(sandbox._getDriverQueueLimitHours(d), 12, 'arriva a 12 ore');
        speso = null;
        assert.equal(sandbox.upgradeDriverQueueHours(d), false, 'oltre 12 ore non si può');
        assert.equal(speso, null, 'a tetto pieno non si spende nulla');
    });

    test('3. il livello raggiunto sopravvive al salvataggio/caricamento', () => {
        const d = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [] };
        sandbox.window.CE_money.spendDC = () => true;
        sandbox.upgradeDriverQueueHours(d); // 6 ore
        sandbox.upgradeDriverQueueHours(d); // 8 ore

        // simula il giro salva → carica: lo stato dell'autista passa per JSON
        const roundTrip = JSON.parse(JSON.stringify(gs.drivers));
        const ricaricato = roundTrip[0];
        assert.equal(sandbox._getDriverQueueLimitHours(ricaricato), 8,
            'dopo reload il tetto dell autista resta quello comprato');
    });

    test('4. il confronto col tetto è sui MILLISECONDI della coda, non su queue.length', () => {
        const now = 1700000000000;
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        const driver = gs.drivers[0];
        driver.status = 'busy';
        driver.queueHoursLevel = undefined; // nessun potenziamento: 4 ore

        // corsa attiva con 3 ore rimanenti
        gs.activeTrips.push({
            id: 101, driverId: driver.id, carId: driver.assignedCarId,
            driverName: driver.name,
            startTime: now, endTime: now + 180 * MIN, tier: 'standard'
        });

        // UNA SOLA corsa in coda ma da 2 ore: totalQueueMs = 5h > tetto 4h
        driver.queue = [mkRide(201, 900, 120 * MIN)];
        assert.equal(driver.queue.length, 1, 'una sola corsa in coda');

        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.ok(info.totalQueueMs > 4 * 60 * MIN, 'la coda occupa piu di 4 ore');
        assert.equal(sandbox.isDriverQueueFull(driver, gs), true,
            'con 5h di coda e tetto 4h la coda è PIENA anche con una sola corsa');

        // due corse brevi invece stanno dentro le 4 ore
        const d2 = gs.drivers[0];
        d2.status = 'busy';
        gs.activeTrips.push({
            id: 102, driverId: d2.id, carId: d2.assignedCarId,
            driverName: d2.name,
            startTime: now, endTime: now + 30 * MIN, tier: 'standard'
        });
        d2.queue = [mkRide(301, 80, 60 * MIN), mkRide(302, 90, 60 * MIN)];
        const info2 = sandbox._getDriverQueueInfo(d2, gs);
        assert.ok(info2.totalQueueMs <= 4 * 60 * MIN, '2h30 sta dentro il tetto');
        assert.equal(sandbox.isDriverQueueFull(d2, gs), false,
            'coda sotto tetto NON è piena anche se avesse molte corse brevi');

        sandbox.Date.now = origNow;
    });

    test('5. assignRideToDriver rifiuta quando il monte ore è esaurito, accetta quando c\'è spazio', () => {
        const ride = mkRide(999, 1200, 120 * MIN);
        gs.pendingRides.push(ride);

        const driver = gs.drivers[0];
        driver.status = 'idle';
        driver.queue = [];

        const now = 1700000000000;
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        // riempi il monte ore: attiva 2h + coda 2h = 4h esatte
        gs.activeTrips.push({
            id: 501, driverId: driver.id, carId: driver.assignedCarId,
            driverName: driver.name,
            startTime: now - 30 * MIN, endTime: now + 90 * MIN, tier: 'standard'
        });
        driver.status = 'busy';
        driver.queue = [mkRide(502, 300, 120 * MIN)];

        const rifiutata = mkRide(998, 200, 60 * MIN);
        gs.pendingRides.push(rifiutata);
        const res = sandbox.assignRideToDriver(rifiutata.id, driver.id);
        assert.equal(res, false, 'a monte ore pieno la corsa NON viene assegnata');
        assert.equal(driver.queue.some(c => c.id === 998), false);

        // allungo il tetto a 6 ore: ora c'è spazio
        sandbox.window.CE_money.spendDC = () => true;
        sandbox.upgradeDriverQueueHours(driver); // 4 -> 6
        const res2 = sandbox.assignRideToDriver(rifiutata.id, driver.id);
        assert.notEqual(res2, false, 'col tetto allungato la stessa corsa passa');
        assert.equal(driver.queue.some(c => c.id === 998), true, 'la corsa è in coda');

        sandbox.Date.now = origNow;
    });

    test('6. _formatDriverQueueEndTime mostra l ORARIO DI FINE, non solo la durata', () => {
        assert.equal(typeof sandbox._formatDriverQueueEndTime, 'function',
            'deve esistere _formatDriverQueueEndTime');
        const now = new Date(2026, 7, 22, 17, 25, 0).getTime(); // 22/08/2026 17:25
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        const out = sandbox._formatDriverQueueEndTime(135 * MIN); // +2h15 → 19:40
        assert.match(out, /19:40/, `deve comparire l orario di fine ("${out}")`);

        sandbox.Date.now = origNow;
    });
});
