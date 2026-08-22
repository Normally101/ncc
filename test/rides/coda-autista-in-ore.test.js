'use strict';
/* ============================================================================
   test/rides/coda-autista-in-ore.test.js

   La coda di un autista non si misura più in NUMERO di corse ma in monte ORE.
   Decisione Vlad 22/08/2026: tetto di 4 ore di base, allungabile con Driver
   Coins fino a 12h. Il limite va confrontato con totalQueueMs di
   _getDriverQueueInfo, non con queue.length, e quando la coda è piena il
   messaggio deve dire quanto manca e come allungarla.

   RED prima: questi test falliscono sul codice che conta le corse (10 / 12
   con Executive Pass).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ORA_MS = 3600000;

describe('rides/coda-autista-in-ore — il tetto della coda è un monte ore, non un numero di corse', () => {
    let env, sandbox, gs, container;
    const now = 1700000000000;

    beforeEach(() => {
        env = createGameEnv(CORE_FILES, { render: true });
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 15; // esci da survival mode (Zero-to-Hero)

        container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);

        sandbox.Date.now = () => now;

        // Autista con auto assegnata, in servizio con una corsa attiva da 30min rimanenti
        gs.fleet = [{ id: 'car_1', name: 'Auto Test', condition: 100, fuel: 100, tier: 'standard' }];
        gs.drivers = [{ id: 'd1', name: 'Mario', status: 'busy', assignedCarId: 'car_1', queue: [], fatigue: 10 }];
        gs.activeTrips = [{
            id: 101, driverId: 'd1', carId: 'car_1', driverName: 'Mario',
            startTime: now - 30 * 60000,
            endTime: now + 30 * 60000, // 30 min rimanenti
            tier: 'standard'
        }];
    });

    afterEach(() => {
        env.stopAllIntervals();
        container.remove();
    });

    // Corsa da ~86 minuti l'una (prezzo 400 → 10 + 3.8·√400 = 86 min, stessa regione, nessun routeType)
    const corsaLunga = (id) => ({ id, price: 400, tier: 'standard' });

    test('1. il tetto di base è 4 ORE: tre corse lunghe riempiono la coda anche se sono meno di 10', () => {
        const driver = gs.drivers[0];
        driver.queue = [corsaLunga(1), corsaLunga(2), corsaLunga(3)]; // ~4h18min totali col residuo

        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.ok(info, 'queueInfo deve essere restituito');
        assert.equal(info.maxQueueMs, 4 * ORA_MS, 'il tetto di base deve essere 4 ore in millisecondi');
        assert.equal(info.queueHours, 4, 'il tetto di base deve essere 4 ore');
        assert.equal(
            info.isFull, true,
            'con 30min in corso + 258min di coda (> 4h) la coda deve risultare piena ANCHE se contiene solo 3 corse'
        );
    });

    test('2. assignRideToDriver rifiuta la corsa che sfora il monte ore, anche con poche corse in coda', () => {
        const driver = gs.drivers[0];
        driver.queue = [corsaLunga(1), corsaLunga(2)]; // 30 + 172 = 202min; +86 = 288min > 240min

        const notifications = [];
        const origNotify = sandbox.showNotification;
        sandbox.showNotification = (msg, tipo) => notifications.push({ msg, tipo });

        const nuova = corsaLunga(950);
        gs.pendingRides = [nuova];
        sandbox.assignRideToDriver(950, 'd1');

        sandbox.showNotification = origNotify;

        assert.equal(gs.pendingRides.length, 1, 'la corsa deve restare in attesa: il monte ore non regge');
        assert.equal(driver.queue.length, 2, 'la coda non deve crescere oltre il tetto di 4h');
        assert.equal(notifications.length >= 1, true, 'coda piena NON deve essere un rifiuto muto');
        assert.ok(
            notifications.some(n => /Driver Coin/i.test(n.msg)),
            'il messaggio di coda piena deve dire come allungare il tetto (Driver Coins)'
        );
    });

    test('3. l\'allungamento passa da window.CE_money.spendDC e il livello resta sull\'autista', async () => {
        const driver = gs.drivers[0];
        gs.driverCoins = 100;

        const ceCalls = [];
        const origSpendDC = sandbox.CE_money.spendDC;
        sandbox.CE_money.spendDC = function (quantita, motivo) {
            ceCalls.push({ quantita, motivo });
            return origSpendDC.apply(this, arguments);
        };

        assert.equal(typeof sandbox.upgradeDriverQueueDC, 'function', 'deve esistere upgradeDriverQueueDC');
        sandbox.upgradeDriverQueueDC('d1');
        await new Promise(r => setImmediate(r));

        assert.equal(ceCalls.length, 1, 'l\'acquisto deve passare dalla porta unica CE_money.spendDC');
        assert.notEqual(ceCalls[0].motivo, undefined, 'va passato un motivo di spesa');
        assert.equal(driver.queueHoursLevel, 1, 'il livello raggiunto deve essere salvato sull\'autista');

        // Sopravvive al ricaricamento: il livello vive sull'oggetto autista, non in memoria volatile
        const ricaricato = JSON.parse(JSON.stringify(gs.drivers[0]));
        assert.equal(sandbox._getDriverQueueCapMs(ricaricato), 6 * ORA_MS, 'dopo il primo scatto il tetto è 6h');

        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.equal(info.maxQueueMs, 6 * ORA_MS, 'il tetto aggiornato deve valere subito');
    });

    test('4. dopo l\'allungamento la stessa corsa viene accettata', () => {
        const driver = gs.drivers[0];
        driver.queueHoursLevel = 2; // tetto 8h, direttamente dal salvataggio
        driver.queue = [corsaLunga(1), corsaLunga(2)];

        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.equal(info.maxQueueMs, 8 * ORA_MS, 'il tetto letto dal livello salvato deve essere 8h');

        const nuova = corsaLunga(960);
        gs.pendingRides = [nuova];
        sandbox.assignRideToDriver(960, 'd1');

        assert.equal(gs.pendingRides.length, 0, 'con tetto a 8h la corsa entra nel monte ore');
        assert.equal(driver.queue.length, 3);
    });

    test('5. Executive Pass NON buca più il tetto: senza scatti DC la coda resta piena a 4h', () => {
        gs.executivePassActive = true;
        gs.day = 1;
        gs.executivePassExpiresDay = 5;

        const driver = gs.drivers[0];
        driver.queue = [corsaLunga(1), corsaLunga(2)]; // 202min totali: sotto il vecchio limite di conteggio

        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.equal(info.maxQueueMs, 4 * ORA_MS, 'il Pass non deve alzare il tetto in ore');
        assert.equal(info.isFull, false);

        const nuova = corsaLunga(970); // 288min > 240min: sfora comunque
        gs.pendingRides = [nuova];
        sandbox.assignRideToDriver(970, 'd1');

        assert.equal(gs.pendingRides.length, 1, 'l\'Executive Pass non deve concedere spazio extra a conteggio');
        assert.equal(driver.queue.length, 2);
    });

    test('6. la UI mostra l\'orario di fine: "lavora fino alle HH:MM"', () => {
        const driver = gs.drivers[0];
        driver.queue = [corsaLunga(1)];
        gs.pendingRides = [];

        sandbox.renderTabCorse();
        const html = container.innerHTML;
        assert.match(html, /lavora fino alle \d{2}:\d{2}/, 'deve comparire l\'orario di fine lavoro, non solo la durata');
    });
});
