'use strict';
/* ============================================================================
   test/rides/driver-queue-hours.test.js — Monte ore coda autista

   Decisione Vlad 22/08/2026: il tetto della coda non è più un NUMERO di corse
   (10, o 12 con Executive Pass) ma un MONTE ORE per autista: 4h di base,
   allungabile con Driver Coins fino a 12h. Il limite va confrontato con
   totalQueueMs (_getDriverQueueInfo), non con queue.length: dieci corse brevi
   e dieci lunghe devono pesare diverso, perché la domanda vera del giocatore
   è «quando devo rientrare?».
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv, CORE_FILES, createGameEnv } = require('../../test-support/game-env.js');

// Autista con auto standard idonea. Le corse finte portano solo i campi che
// _getRideDurationMs legge: price*0.2 minuti (tetto 360), x1.5 se interregionale.
function setupEnv(sandboxOverrides) {
    const env = freshEnv(sandboxOverrides);
    const sandbox = env.sandbox;
    sandbox.gameState.fleet = [{ id: 'car1', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false }];
    sandbox.gameState.pendingRides = [];
    sandbox.gameState.activeTrips = [];
    sandbox.gameState.activeRides = [];
    return env;
}

function mkDriver(sandbox, overrides = {}) {
    const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1', queue: [], ...overrides };
    sandbox.gameState.drivers = [driver];
    return driver;
}

// Corsa locale da 130 min (price 650 * 0.2)
const corsaLunga = (id) => ({ id, tier: 'business', price: 650, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } });
// Corsa locale da 20 min (price 100 * 0.2)
const corsaBreve = (id) => ({ id, tier: 'standard', price: 100, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } });

describe('rides/driver-queue-hours — monte ore coda (decisione Vlad 22/08/2026)', () => {

    test('la scala parte da 4h di base, arriva a 12h con scatti crescenti acquistabili in DC', () => {
        const { sandbox } = setupEnv();
        const scale = sandbox.DRIVER_QUEUE_HOURS;

        assert.ok(scale, 'DRIVER_QUEUE_HOURS deve essere esposta su window');
        assert.equal(scale.base, 4, 'tetto di partenza: 4 ore come da decisione');
        assert.equal(scale.max, 12, 'tetto massimo: 12 ore come da decisione');
        assert.ok(Array.isArray(scale.steps) && scale.steps.length > 0, 'devono esistere gli scatti acquistabili');
        scale.steps.forEach((step, i) => {
            assert.ok(Number.isFinite(step.hours) && step.hours > scale.base, `scatto ${i}: deve valere più della base`);
            assert.ok(Number.isFinite(step.cost) && step.cost > 0, `scatto ${i}: deve avere un prezzo in DC`);
            if (i > 0) assert.ok(step.hours > scale.steps[i - 1].hours, 'gli scatti devono essere crescenti');
        });
        assert.equal(scale.steps[scale.steps.length - 1].hours, 12, 'l\'ultimo scatto porta a 12 ore');
    });

    test('due sole corse ricche (~2h l\'una) saturano le 4h: la coda è piena per ORE, non per numero', () => {
        const { sandbox } = setupEnv();
        const driver = mkDriver(sandbox);
        driver.status = 'busy'; // busy senza viaggio attivo: totalQueueMs = somma coda
        driver.queue = [corsaLunga(1), corsaLunga(2)]; // 260min = 4h 20min >= 4h

        const info = sandbox._getDriverQueueInfo(driver, sandbox.gameState);

        assert.equal(info.queuedCount, 2, 'solo DUE corse in coda');
        assert.equal(info.isFull, true, 'con 4h20 di lavoro accodato il monte ore di 4h è pieno anche con 2 corse sole');
    });

    test('cinque corse brevi (1h40 totale) NON saturano il monte ore, pur essendo 5 corse', () => {
        const { sandbox } = setupEnv();
        const driver = mkDriver(sandbox);
        driver.status = 'busy';
        driver.queue = [corsaBreve(1), corsaBreve(2), corsaBreve(3), corsaBreve(4), corsaBreve(5)]; // 100min

        const info = sandbox._getDriverQueueInfo(driver, sandbox.gameState);

        assert.equal(info.isFull, false, '1h40 totale sta dentro le 4h: la coda non è piena');
    });

    test('il monte ore allungato con DC alza il tetto: 6h30 di coda stanno in 8h, ma non in 4h', () => {
        const { sandbox } = setupEnv();
        const driverBase = mkDriver(sandbox);
        driverBase.status = 'busy';
        driverBase.queue = [corsaLunga(1), corsaLunga(2), corsaLunga(3)]; // 390min = 6h 30min
        assert.equal(sandbox._getDriverQueueInfo(driverBase, sandbox.gameState).isFull, true,
            'a monte ore base (4h) 6h30 di coda satura');

        const driverEsteso = mkDriver(sandbox, { id: 'd2', name: 'Luigi', queueHours: 8 });
        driverEsteso.status = 'busy';
        driverEsteso.queue = [corsaLunga(1), corsaLunga(2), corsaLunga(3)];
        const info = sandbox._getDriverQueueInfo(driverEsteso, sandbox.gameState);
        assert.equal(info.isFull, false, 'con monte ore allungato a 8h la stessa coda ci sta');
        assert.equal(info.queueCapMs, 8 * 60 * 60 * 1000, 'il tetto restituito riflette il livello comprato');
    });

    test('valori fuori scala vengono limitati: mai sotto 4h, mai sopra 12h', () => {
        const { sandbox } = setupEnv();
        const driverBasso = mkDriver(sandbox, { queueHours: 1 });
        assert.equal(sandbox._getDriverQueueCapMs(driverBasso), 4 * 60 * 60 * 1000, 'sotto base torna a 4h');

        const driverAlto = mkDriver(sandbox, { id: 'd2', name: 'Luigi', queueHours: 99 });
        assert.equal(sandbox._getDriverQueueCapMs(driverAlto), 12 * 60 * 60 * 1000, 'sopra massimo viene limitato a 12h');

        const driverVecchioSalvataggio = mkDriver(sandbox, { id: 'd3', name: 'Vecchio' });
        delete driverVecchioSalvataggio.queueHours;
        assert.equal(sandbox._getDriverQueueCapMs(driverVecchioSalvataggio), 4 * 60 * 60 * 1000,
            'un autista salvato prima del cambio ha comunque le 4h di base');
    });

    test('assignRideToDriver rifiuta quando il monte ore è esaurito e spiega come allungarlo', () => {
        const { sandbox, notifications } = setupEnv();
        const driver = mkDriver(sandbox);
        driver.status = 'busy'; // busy senza viaggio attivo
        driver.queue = [corsaLunga(1), corsaLunga(2)]; // 4h 20min >= 4h

        const ride = { id: 950, tier: 'business', price: 200, fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
        sandbox.gameState.pendingRides = [ride];

        sandbox.assignRideToDriver(950, 'd1');

        assert.equal(sandbox.gameState.pendingRides.length, 1, 'la corsa deve rimanere in pending col monte ore pieno');
        assert.equal(driver.queue.length, 2, 'la coda non deve crescere');
        const msg = notifications.find(n => n.type === 'error' && n.msg.includes('monte ore'));
        assert.ok(msg, 'deve arrivare un messaggio sul monte ore, non un secco rifiuto');
        assert.ok(msg.msg.includes('Driver Coins') || msg.msg.includes('DC'), 'il messaggio deve dire come allungare il monte ore');
    });

    test('_driverCanTakeRide rispetta il monte ore: pieno a 4h di base, libero dopo l\'allungamento', () => {
        const { sandbox } = setupEnv();
        const ride = { id: 901, tier: 'business', fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };

        const driver = mkDriver(sandbox);
        driver.status = 'busy';
        driver.queue = [corsaLunga(1), corsaLunga(2), corsaLunga(3)]; // 6h 30min > 4h
        assert.equal(sandbox._driverCanTakeRide(driver, ride), false, 'monte ore esaurito: nessuna nuova corsa');

        driver.queueHours = 8; // allungato a 8h: la stessa coda ora ci sta
        assert.equal(sandbox._driverCanTakeRide(driver, ride), true, 'col monte ore allungato l\'autista torna disponibile');
    });

    describe('acquisto scatto monte ore (buyQueueHoursDC)', () => {

        function envConDC() {
            const env = setupEnv();
            env.sandbox.gameState.driverCoins = 500;
            const spendCalls = [];
            const origSpendDC = env.sandbox.CE_money.spendDC.bind(env.sandbox.CE_money);
            env.sandbox.CE_money.spendDC = (qta, motivo) => {
                spendCalls.push({ qta, motivo });
                return origSpendDC(qta, motivo);
            };
            return { env, spendCalls };
        }

        test('porta l\'autista allo scatto successivo passando da CE_money.spendDC', () => {
            const { env, spendCalls } = envConDC();
            const { sandbox } = env;
            const driver = mkDriver(sandbox);

            sandbox.buyQueueHoursDC('d1');

            assert.equal(driver.queueHours, 6, 'dal livello base il primo scatto porta a 6h');
            assert.equal(spendCalls.length, 1, 'la spesa deve passare dalla porta unica CE_money.spendDC');
            assert.equal(spendCalls[0].motivo, 'driver_queue_hours');
            assert.ok(driver.queueHours > 4, 'il livello raggiunto vive sull\'autista');
        });

        test('scatti successivi e tetto massimo: oltre 12h non spende nulla', () => {
            const { env, spendCalls } = envConDC();
            const { sandbox } = env;
            const driver = mkDriver(sandbox, { queueHours: 12 });

            sandbox.buyQueueHoursDC('d1');

            assert.equal(driver.queueHours, 12, 'al massimo non cambia nulla');
            assert.equal(spendCalls.length, 0, 'al massimo non deve scalare DC');
        });

        test('senza Driver Coins sufficienti il livello non cambia', () => {
            const { env } = envConDC();
            const { sandbox } = env;
            sandbox.gameState.driverCoins = 1; // meno del costo del primo scatto
            const driver = mkDriver(sandbox);

            sandbox.buyQueueHoursDC('d1');

            assert.ok(!driver.queueHours || driver.queueHours <= 4, 'senza soldi il monte ore resta quello di base');
        });

        test('il livello comprato sopravvive a salvataggio e ricaricamento', async () => {
            const { env } = envConDC();
            const { sandbox } = env;

            // ── metà SAVE: cosa arriva al cloud ──
            let savedPayload = null;
            sandbox.currentUser = { id: 'user-test', email: 't@example.com' };
            sandbox.window.currentSlotIndex = 0;
            sandbox.supabaseClient = {
                from: (table) => ({
                    upsert: async (payload) => {
                        if (table === 'game_saves') savedPayload = payload;
                        return { error: null };
                    },
                }),
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            const driver = mkDriver(sandbox);
            sandbox.buyQueueHoursDC('d1');
            sandbox.saveGame();

            assert.equal(savedPayload?.game_state?.drivers?.find(d => d.id === 'd1')?.queueHours, 6,
                'queueHours deve finire nel payload di salvataggio');

            // ── metà LOAD: un vecchio salvataggio con il livello comprato ──
            const fakeSave = {
                ...sandbox.gameState,
                drivers: [{ id: 'd_saved', name: 'Autista Fedele', status: 'idle', queue: [], queueHours: 10 }],
            };
            sandbox.window.currentSlotIndex = null; // forza la chiave legacy, vedi loadGame()
            sandbox.localStorage.setItem('chauffeurEmpireSave_v2', JSON.stringify(fakeSave));

            assert.equal(sandbox.loadGame(), true);
            const ricaricato = sandbox.gameState.drivers.find(d => d.id === 'd_saved');
            assert.equal(ricaricato.queueHours, 10, 'il monte ore comprato deve sopravvivere al reload');
            assert.equal(sandbox._getDriverQueueCapMs(ricaricato), 10 * 60 * 60 * 1000,
                'dopo il reload il limite reale usa le ore comprate, non le 4h di base');
        });
    });

    describe('interfaccia dispatch — orario di fine, monte ore e come allungarlo', () => {
        let env, sandbox, gs, container;

        beforeEach(() => {
            env = createGameEnv(CORE_FILES, { render: true });
            sandbox = env.sandbox;
            sandbox.initGame(true);
            env.stopAllIntervals();
            gs = sandbox.gameState;
            gs.questStats = gs.questStats || {};
            gs.questStats.totalRides = 15; // esci da survival mode
            gs.fleet = [{ id: 'car1', name: 'Auto', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 100, fuel: 100 }];
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1', queue: [] }];

            container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);
        });

        afterEach(() => {
            env.stopAllIntervals();
            container.remove();
        });

        test('la scheda autista mostra il monte ore, L\'ORARIO DI FINE e lo scatto per allungare', () => {
            const now = 1700000000000;
            const origNow = sandbox.Date.now;
            sandbox.Date.now = () => now;

            const driver = gs.drivers[0];
            driver.status = 'busy';
            gs.activeTrips = [{
                id: 99, driverId: 'd1', carId: 'car1', driverName: 'Mario',
                startTime: now, endTime: now + (25 * 60 * 1000), tier: 'standard',
            }];
            driver.queue = [corsaLunga(1), corsaLunga(2), corsaLunga(3)]; // +6h30 -> 6h55 totali > 4h

            sandbox.renderTabCorse();
            const html = container.innerHTML;
            sandbox.Date.now = origNow;

            assert.ok(html.includes('monte ore'), 'deve mostrare il consumo del monte ore in ore');
            assert.ok(html.includes('lavora fino alle'), 'deve mostrare l\'orario di rientro, non solo la durata');
            assert.ok(/Monte ore\s*&?r?a?r?r?;?\s*(6|h)/.test(html) || html.includes('Monte ore'), 'deve proporre lo scatto per allungare il monte ore');
            assert.ok(html.includes('DC'), 'lo scatto proposto deve mostrare il prezzo in DC');
        });
    });
});
