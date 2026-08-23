'use strict';
/* La coda di un autista si misura in ORE, non in numero di corse.
 *
 * Decisione Vlad 22/08/2026: tetto di 4 ore di base, allungabile con
 * Driver Coins fino a 12 ore. Il limite va confrontato con totalQueueMs
 * (gia' calcolato da _getDriverQueueInfo), non con queue.length.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Corsa standard da regione a regione uguale: durata = 10 + 3.8·√prezzo minuti.
function ride(gs, price) {
    return { id: gs.nextId++, tier: 'standard', price, fromPoi: { id: 'roma', region: 'lazio' }, toPoi: { id: 'civitavecchia', region: 'lazio' } };
}

describe('rides/queue-hours-cap — il tetto coda è un monte ORE (4→12)', () => {

    test('il tetto base è 4 ore in ms e 5 corse brevi (~3h) NON riempiono la coda', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const driver = { id: 'd1', name: 'Gigi', status: 'idle', assignedCarId: 'car1', queue: [] };
        gs.drivers = [driver];
        gs.fleet = [{ id: 'car1', tier: 'standard', vehicleClass: 'stellar_e_exec', condition: 90 }];

        for (let i = 0; i < 5; i++) driver.queue.push(ride(gs, 50)); // ~37min l'una

        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.equal(info.maxQueueMs, 4 * HOUR, 'tetto base = 4 ore');
        assert.equal(info.isFull, false, '5 corse brevi (~3h) stanno sotto il monte di 4 ore');

        // Col vecchio limite numerico la sesta breve corsa sarebbe passata; col monte ore pure,
        // ma una corsa ricca (~2h) deve mandare la coda in pieno anche con poche corse.
        driver.queue.push(ride(gs, 1000)); // ~2h
        assert.equal(sandbox._getDriverQueueInfo(driver, gs).isFull, true,
            'oltre le 4 ore la coda è piena anche con meno di 10 corse');
    });

    test('_driverCanTakeRide blocca sul monte ore, non sul numero di corse', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const car = { id: 'car1', tier: 'standard', condition: 90 };
        const driver6 = { id: 'd1', name: 'Lele', status: 'idle', assignedCarId: 'car1',
            queue: Array.from({ length: 6 }, (_, i) => ride(gs, 1000)) }; // ~12h di coda, 6 corse
        const driver2 = { id: 'd2', name: 'Anna', status: 'idle', assignedCarId: 'car1',
            queue: [ride(gs, 50), ride(gs, 50)] }; // ~75min di coda
        gs.fleet = [car];
        gs.drivers = [driver6, driver2];

        const newRide = { id: gs.nextId++, tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(driver2, newRide), true,
            '2 corse brevi in coda (~75min): si può accettare altro');
        assert.equal(sandbox._driverCanTakeRide(driver6, newRide), false,
            '6 corse ricche (~12h) devono bloccare anche se sono meno di 10');
    });

    test('l\'acquisto passa da CE_money.spendDC e il livello sopravvive al reload', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const driver = { id: 'd3', name: 'Sara', status: 'idle', assignedCarId: 'car1', queue: [] };
        gs.drivers = [driver];
        gs.fleet = [{ id: 'car1', tier: 'standard', vehicleClass: 'stellar_e_exec', condition: 90 }];
        gs.driverCoins = 30;

        assert.equal(typeof sandbox._buyQueueHours === 'function', true, 'esiste _buyQueueHours');

        sandbox._buyQueueHours(driver.id);
        assert.equal(sandbox._getDriverQueueInfo(driver, gs).maxQueueMs, 6 * HOUR, 'primo scatto: 4→6 ore');
        assert.equal(gs.driverCoins, 22, 'pagati 8 DC via spendDC, mai -= diretto');

        // Persistenza: il livello salvato sull'autista torna dopo il "reload"
        const saved = driver.queueCapLevel;
        delete driver.queueCapLevel;
        driver.queueCapLevel = saved;
        assert.equal(sandbox._getDriverQueueInfo(driver, gs).maxQueueMs, 6 * HOUR, 'il tetto acquistato sopravvive al caricamento');

        for (let i = 0; i < 10; i++) sandbox._buyQueueHours(driver.id);
        assert.equal(sandbox._getDriverQueueInfo(driver, gs).maxQueueMs, 12 * HOUR, 'massimo 12 ore');
        assert.ok(gs.driverCoins < 30 - 8, 'ogni scatto costa DC fino al tetto');
    });

    test('coda piena: il messaggio dice quanto manca e come allungare', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const driver = { id: 'd4', name: 'Marco', status: 'idle', assignedCarId: 'car1', queue: [] };
        gs.drivers = [driver];
        gs.fleet = [{ id: 'car1', tier: 'standard', vehicleClass: 'stellar_e_exec', condition: 90 }];

        for (let i = 0; i < 7; i++) driver.queue.push(ride(gs, 1000));
        const info = sandbox._getDriverQueueInfo(driver, gs);
        assert.equal(info.isFull, true);

        assert.equal(typeof sandbox._queueFullMessage === 'function', true, 'esiste _queueFullMessage');
        const msg = sandbox._queueFullMessage(driver, info);
        assert.match(msg, /ore|min/, `mostra quanto manca: "${msg}"`);
        assert.match(msg, /[Dd]river [Cc]oin/, `spiega come allungare: "${msg}"`);
    });
});
