'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Coda autista come MONTE ORE (decisione Vlad 22/08/2026):
   4h di base per autista, allungabili coi Driver Coins fino a 12h.
   Il limite si confronta con totalQueueMs di _getDriverQueueInfo,
   non con il numero di corse in coda.
   Durate usate qui (curva 10 + 3.8×√prezzo, stessa regione):
     price 1000 → 130min ≈ 2h10m   |  price 15 → 25min */
const MIN = 60 * 1000;

function corsa(price, id) {
    return {
        id: id || ('r_' + Math.random().toString(36).slice(2)),
        tier: 'standard',
        price,
        fromPoi: { region: 'lazio', name: 'A' },
        toPoi: { region: 'lazio', name: 'B' },
    };
}

describe('rides/coda-in-ore — tetto coda autista come monte ore', () => {

    test('due sole corse lunghe (>4h totale) riempiono la coda: il limite è in ore, non a 10 corse', () => {
        const { sandbox } = freshEnv();
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [corsa(1000), corsa(1000)] };

        const info = sandbox._getDriverQueueInfo(driver);

        assert.equal(info.capHours, 4, 'il tetto di base deve essere 4 ore');
        assert.equal(info.capMs, 4 * 60 * MIN, 'il tetto in ms deve essere 4h');
        assert.ok(info.totalQueueMs >= 4 * 60 * MIN, 'prerequisito: 2×130min = 4h20m');
        assert.equal(info.isFull, true, '4h20m di lavoro superano il tetto di 4h anche con solo 2 corse in coda');
    });

    test('corse corte sotto il tetto NON riempiono la coda (9 × 25min = 3h45m)', () => {
        const { sandbox } = freshEnv();
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: Array.from({ length: 9 }, () => corsa(15)) };

        const info = sandbox._getDriverQueueInfo(driver);

        assert.equal(info.isFull, false, '3h45m stanno dentro il tetto di 4h');
    });

    test('il tetto allungato sull\'autista alza il limite: 4h20m entrano in un tetto da 6h', () => {
        const { sandbox } = freshEnv();
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [corsa(1000), corsa(1000)], queueCapHours: 6 };

        const info = sandbox._getDriverQueueInfo(driver);

        assert.equal(info.capHours, 6, 'il livello comprato deve essere letto dall\'autista');
        assert.equal(info.isFull, false, 'con tetto 6h, 4h20m non sono più coda piena');
    });

    test('l\'allungamento passa da CE_money.spendDC e salva il livello sull\'autista', () => {
        const { sandbox } = freshEnv();
        const driver = { id: 'd_up', name: 'Upgrade', status: 'idle', assignedCarId: null, queue: [] };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.driverCoins = 200;
        const prima = sandbox.gameState.driverCoins;

        assert.equal(typeof sandbox.upgradeDriverQueueCap, 'function', 'deve esistere la funzione di acquisto');
        assert.equal(sandbox.upgradeDriverQueueCap('d_up'), true, 'il primo scatto (4h→6h) deve riuscire');
        assert.equal(driver.queueCapHours, 6, 'il livello raggiunto va salvato sull\'autista');
        assert.ok(sandbox.gameState.driverCoins < prima, 'i Driver Coins devono essere scalati via spendDC');
        assert.equal(sandbox._getDriverQueueInfo(driver).capHours, 6);

        // Scala completa 6→8→10→12, poi stop al massimo
        assert.equal(sandbox.upgradeDriverQueueCap('d_up'), true);
        assert.equal(sandbox.upgradeDriverQueueCap('d_up'), true);
        assert.equal(sandbox.upgradeDriverQueueCap('d_up'), true);
        assert.equal(driver.queueCapHours, 12, 'il tetto massimo è 12 ore');
        assert.equal(sandbox.upgradeDriverQueueCap('d_up'), false, 'oltre 12h non si può andare');
    });

    test('il livello comprato sopravvive al salvataggio e al ricaricamento', async () => {
        const { sandbox } = freshEnv();
        // Intercetta il payload che saveCurrentSlot spedirebbe al cloud:
        // è lo stesso JSON che loadGame rilegge al reload.
        let rigaSalvata = null;
        sandbox.window.currentUser = { id: 'u1' };
        sandbox.window.supabaseClient = {
            // solo la tabella dei salvataggi interessa: 'leaderboard' fa un suo upsert
            from: (tabella) => ({
                upsert: async (row) => {
                    if (tabella === 'game_saves') rigaSalvata = row;
                    return { error: null };
                },
            }),
        };
        const driver = { id: 'd_save', name: 'Persist', status: 'idle', assignedCarId: null, queue: [] };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.driverCoins = 50;

        sandbox.upgradeDriverQueueCap('d_save'); // fa anche saveGame()
        await new Promise(r => setTimeout(r, 0));

        assert.ok(rigaSalvata, 'il save deve partire');
        const nelSave = (rigaSalvata.game_state.drivers || []).find(d => d.id === 'd_save');
        assert.equal(nelSave?.queueCapHours, 6, 'queueCapHours deve finire nel salvataggio');

        // Reload: loadGame ricostruisce i driver dal JSON del save
        const ricaricato = JSON.parse(JSON.stringify(nelSave));
        assert.equal(sandbox._getDriverQueueInfo(ricaricato).capHours, 6,
            'al reload l\'autista riparte col tetto comprato');
    });

    test('assignRideToDriver rifiuta con monte ore pieno e dice fino a quando l\'autista lavora', () => {
        const { sandbox, notifications } = freshEnv();
        const driver = { id: 'd_full', name: 'Pieno', status: 'busy', assignedCarId: null, queue: [corsa(1000), corsa(1000)] };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.activeTrips.push({ id: 't1', driverId: 'd_full', endTime: Date.now() + 60 * MIN });
        const nuova = corsa(100, 'r_nuova');
        sandbox.gameState.pendingRides.push(nuova);

        sandbox.assignRideToDriver('r_nuova', 'd_full');

        assert.ok(sandbox.gameState.pendingRides.some(r => r.id === 'r_nuova'),
            'coda piena in ore (2h10m rimanenti + 4h20m di coda > 4h): la corsa resta in attesa');
        const msg = notifications.map(n => n.msg).join(' ');
        assert.match(msg, /lavora fino alle/, 'il messaggio deve dire l\'orario di fine lavoro');
        assert.match(msg, /(tetto|ore)/i, 'il messaggio deve suggerire come allargare la coda');
    });

    test('_driverCanTakeRide segue il monte ore: 9 corse corte ok, 2 lunghe no', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'standard', condition: 90, outOfService: false };
        sandbox.gameState.fleet = [car];
        const corto = { id: 'd_c', name: 'Corto', status: 'idle', assignedCarId: 'car1', queue: Array.from({ length: 9 }, () => corsa(15)) };
        const lungo = { id: 'd_l', name: 'Lungo', status: 'idle', assignedCarId: 'car1', queue: [corsa(1000), corsa(1000)] };
        sandbox.gameState.drivers.push(corto, lungo);

        const ride = { id: 'r1', tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(corto, ride), true, '3h45m di cota stanno nei 4h');
        assert.equal(sandbox._driverCanTakeRide(lungo, ride), false, '4h20m superano i 4h: autista indisponibile');
    });
});
