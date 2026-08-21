'use strict';
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('rides/dispatch-queue-duration — trasparenza durata corse e code autisti', () => {
    let env, sandbox, gs, container;

    beforeEach(() => {
        env = createGameEnv(CORE_FILES, { render: true });
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 15; // esci da survival mode

        container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);
    });

    afterEach(() => {
        env.stopAllIntervals();
        container.remove();
    });

    test('1. _getRideDurationMs e _formatDuration sono esposte su window', () => {
        assert.equal(typeof sandbox._getRideDurationMs, 'function', '_getRideDurationMs deve essere esposta su window');
        assert.equal(typeof sandbox._formatDuration, 'function', '_formatDuration deve essere esposta su window');
    });

    test('2. la durata mostrata prima di assegnare coincide con quella che la corsa avrà una volta assegnata', () => {
        const ride = {
            id: 999,
            price: 250, // 250 * 0.2 = 50 min = 3.000.000 ms
            fromPoi: { id: 'roma_fco', name: 'Roma FCO', region: 'lazio' },
            toPoi: { id: 'roma_term', name: 'Roma Termini', region: 'lazio' },
            routeType: 'Airport', // Airport -> 50 * 0.7 = 35 min = 2.100.000 ms
            tier: 'standard',
            duration: 20000,
            elapsed: 0
        };
        gs.pendingRides.push(ride);

        const durMsPrima = sandbox._getRideDurationMs(ride);
        const formattedPrima = sandbox._formatDuration(durMsPrima);
        assert.equal(durMsPrima, 35 * 60 * 1000, 'durata calcolata prima dell\'assegnazione deve essere 35 min');
        assert.equal(formattedPrima, '35min', 'formattazione leggibile');

        // Assegna la corsa all\'autista
        gs.fleet = [{ id: 'car_1', name: 'Auto Test', condition: 100, fuel: 100, tier: 'standard' }];
        gs.drivers = [{ id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car_1', queue: [] }];
        sandbox.assignRideToDriver(ride.id, 'd1');

        // Controlla il viaggio attivo creato
        const activeTrip = gs.activeTrips.find(t => t.id === 999);
        assert.ok(activeTrip, 'deve esistere il viaggio attivo');
        const durMsDopo = activeTrip.endTime - activeTrip.startTime;

        assert.equal(durMsDopo, durMsPrima, 'la durata reale assegnata deve coincidere esattamente con la stima preliminare');
    });

    test('3. il totale della coda è la somma delle sue corse (corsa attiva rimanente + corse in coda)', () => {
        const now = 1700000000000;
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        const driver = gs.drivers[0];
        driver.status = 'busy';

        // Corsa attiva con 20 minuti rimanenti (su 30 totali)
        gs.activeTrips.push({
            id: 101,
            driverId: driver.id,
            carId: driver.assignedCarId,
            driverName: driver.name,
            startTime: now - (10 * 60 * 1000),
            endTime: now + (20 * 60 * 1000), // 20 min rimanenti
            tier: 'standard'
        });

        // 3 corse in coda: 15 min (75€), 45 min (225€), 60 min (300€)
        const q1 = { id: 201, price: 75, tier: 'standard' };  // 15 min
        const q2 = { id: 202, price: 225, tier: 'standard' }; // 45 min
        const q3 = { id: 203, price: 300, tier: 'standard' }; // 60 min
        driver.queue = [q1, q2, q3];

        const queueInfo = sandbox._getDriverQueueInfo(driver, gs);
        assert.ok(queueInfo, 'queueInfo deve essere restituito');

        // Totale: 20 min rimasti + 15 + 45 + 60 = 140 min (2h 20min) = 8.400.000 ms
        assert.equal(queueInfo.currentRemainingMs, 20 * 60 * 1000, 'rimanente corsa in corso deve essere 20 min');
        assert.equal(queueInfo.queuedDurationMs, 120 * 60 * 1000, 'somma corse in coda deve essere 120 min');
        assert.equal(queueInfo.totalQueueMs, 140 * 60 * 1000, 'totale coda deve essere 140 min (2h 20min)');

        sandbox.Date.now = origNow;
    });

    test('4. il tempo del primo slot libero è quello della prima corsa della coda (in corso), non dell\'intera coda', () => {
        const now = 1700000000000;
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        const driver = gs.drivers[0];
        driver.status = 'busy';

        // Corsa attiva: termina tra 15 minuti
        gs.activeTrips.push({
            id: 101,
            driverId: driver.id,
            carId: driver.assignedCarId,
            driverName: driver.name,
            startTime: now - (15 * 60 * 1000),
            endTime: now + (15 * 60 * 1000), // 15 min
            tier: 'standard'
        });

        // Coda con altre corse lunghe (totale oltre 5 ore)
        driver.queue = [
            { id: 201, price: 600, tier: 'standard' }, // 120 min
            { id: 202, price: 900, tier: 'standard' }, // 180 min
        ];

        const queueInfo = sandbox._getDriverQueueInfo(driver, gs);

        // Il primo slot si libera quando finisce la corsa IN CORSO (15 min), NON alla fine di tutta la coda (315 min)
        assert.equal(queueInfo.nextSlotFreeMs, 15 * 60 * 1000, 'il primo slot libero deve essere a 15 minuti');
        assert.notEqual(queueInfo.nextSlotFreeMs, queueInfo.totalQueueMs, 'il primo slot non deve essere la durata totale');

        sandbox.Date.now = origNow;
    });

    test('5. _formatDuration gestisce correttamente ore e minuti ("3h 14min", "20min", "1h")', () => {
        assert.equal(sandbox._formatDuration(194 * 60 * 1000), '3h 14min', '194 minuti -> 3h 14min');
        assert.equal(sandbox._formatDuration(155 * 60 * 1000), '2h 35min', '155 minuti -> 2h 35min');
        assert.equal(sandbox._formatDuration(20 * 60 * 1000), '20min', '20 minuti -> 20min');
        assert.equal(sandbox._formatDuration(60 * 60 * 1000), '1h', '60 minuti -> 1h');
        assert.equal(sandbox._formatDuration(360 * 60 * 1000), '6h', '360 minuti -> 6h');
    });

    test('6. renderTabCorse mostra durata prevista sulle corse pendenti e info coda su scheda autista', () => {
        const now = 1700000000000;
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        const ride = {
            id: 501,
            price: 970, // 970 * 0.2 = 194 min = 3h 14min
            fromPoi: { id: 'roma', name: 'Roma Centro', region: 'lazio' },
            toPoi: { id: 'milano', name: 'Milano Hub', region: 'lombardia' }, // intercity -> 194 * 1.5 = 291 min = 4h 51min
            tier: 'business',
            duration: 40000,
            elapsed: 0
        };
        gs.pendingRides = [ride];

        const driver = gs.drivers[0];
        driver.status = 'busy';
        gs.activeTrips = [{
            id: 99,
            driverId: driver.id,
            carId: driver.assignedCarId,
            driverName: driver.name,
            startTime: now,
            endTime: now + (25 * 60 * 1000), // 25 min
            tier: 'standard'
        }];
        driver.queue = [{ id: 102, price: 100, tier: 'standard' }]; // 20 min

        sandbox.renderTabCorse();
        const html = container.innerHTML;

        // Verifica durata su corsa pendente
        assert.ok(html.includes('4h 51min'), 'deve mostrare la durata prevista "4h 51min" sulla corsa pendente');

        // Verifica info coda autista: tempo corsa attiva (25min), durata totale (45min), prossimo slot (25min)
        assert.ok(html.includes('25min'), 'deve mostrare il conto alla rovescia o tempo corsa attiva');
        assert.ok(html.includes('45min'), 'deve mostrare la durata totale della coda');

        sandbox.Date.now = origNow;
    });

    test('7. _previewQueueWithRide calcola correttamente l\'impatto prima di confermare l\'accodamento', () => {
        const driver = gs.drivers[0];
        driver.status = 'busy';
        const now = 1700000000000;
        const origNow = sandbox.Date.now;
        sandbox.Date.now = () => now;

        gs.activeTrips = [{
            id: 99,
            driverId: driver.id,
            carId: driver.assignedCarId,
            driverName: driver.name,
            startTime: now,
            endTime: now + (30 * 60 * 1000), // 30 min rimanenti
            tier: 'standard'
        }];
        driver.queue = [];

        const newRide = { id: 301, price: 150, tier: 'standard' }; // 30 min
        const preview = sandbox._previewQueueWithRide(driver, newRide, gs);

        assert.equal(preview.currentQueueMs, 30 * 60 * 1000, 'coda attuale 30 min');
        assert.equal(preview.addedDurationMs, 30 * 60 * 1000, 'durata corsa aggiunta 30 min');
        assert.equal(preview.newTotalQueueMs, 60 * 60 * 1000, 'nuova durata coda 60 min');

        sandbox.Date.now = origNow;
    });
});
