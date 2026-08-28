'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Coda autista come MONTE ORE (decisione Vlad 22/08/2026):
   4h di base per autista, allungabili coi Driver Coins fino a 12h.
   Il limite si confronta con totalQueueMs di _getDriverQueueInfo,
   non con il numero di corse in coda.
   ⚠️ I prezzi delle corse di prova NON sono piu' scritti a mano.
   Fino al 28/08/2026 questo file diceva «price 1000 → 130min» e ci costruiva
   sopra gli scenari. Quando il ritmo delle corse e' stato accelerato (playtest
   di Pietro: 128 minuti REALI di attesa per una corsa sola), quei numeri sono
   diventati falsi e 12 test sono diventati rossi pur essendo ancora giusti
   nell'intento. Un test che codifica una costante di bilanciamento si rompe a
   ogni ribilanciamento e non dice niente di utile.
   Ora il prezzo che serve per una durata voluta si CHIEDE al gioco, con
   `prezzoPerDurata()`: se il ritmo cambia ancora, questi test reggono. */
const MIN = 60 * 1000;

/** Il prezzo piu' piccolo la cui corsa dura almeno `minutiVoluti` minuti.
 *  Cerca per tentativi sulla curva vera invece di indovinarla. */
function prezzoPerDurata(sandbox, minutiVoluti) {
    const durata = p => sandbox._getRideDurationMs(corsa(p)) / MIN;
    let basso = 1, alto = 5_000_000;
    if (durata(alto) < minutiVoluti) {
        throw new Error(`nessun prezzo raggiunge ${minutiVoluti} minuti: la curva delle durate e' cambiata troppo`);
    }
    while (alto - basso > 1) {
        const mezzo = Math.floor((basso + alto) / 2);
        if (durata(mezzo) >= minutiVoluti) alto = mezzo; else basso = mezzo;
    }
    return alto;
}

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

    test('due sole corse lunghe riempiono la coda: il limite è in ore, non a numero di corse', () => {
        const { sandbox } = freshEnv();
        // Due corse da poco piu' di 2h l'una: qualunque sia il ritmo, sforano le 4h.
        const lunga = prezzoPerDurata(sandbox, 125);
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [corsa(lunga), corsa(lunga)] };

        const info = sandbox._getDriverQueueInfo(driver);

        assert.equal(info.capHours, 4, 'il tetto di base deve essere 4 ore');
        assert.equal(info.capMs, 4 * 60 * MIN, 'il tetto in ms deve essere 4h');
        assert.ok(info.totalQueueMs >= 4 * 60 * MIN, 'prerequisito dello scenario: due corse oltre le 4h');
        assert.equal(info.isFull, true, 'due sole corse bastano a riempire il tetto: conta il tempo, non il numero');
    });

    test('molte corse corte NON riempiono la coda se restano sotto il tetto in ore', () => {
        const { sandbox } = freshEnv();
        // La corsa piu' corta possibile: quante ne servono per stare sotto le 4h.
        const cortaMs = sandbox._getRideDurationMs(corsa(1));
        const quante  = Math.max(1, Math.floor((4 * 60 * MIN) / cortaMs) - 1);
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null,
                         queue: Array.from({ length: quante }, () => corsa(1)) };

        const info = sandbox._getDriverQueueInfo(driver);

        assert.ok(quante > 2, 'lo scenario ha senso solo con piu' + String.fromCharCode(39) + ' corse corte');
        assert.equal(info.isFull, false, 'sotto il tetto in ore la coda accetta, per quante corse siano');
    });

    test('il tetto allungato sull\'autista alza il limite: ciò che sforava 4h entra in 6h', () => {
        const { sandbox } = freshEnv();
        const lunga = prezzoPerDurata(sandbox, 125);
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [corsa(lunga), corsa(lunga)], queueCapHours: 6 };

        const info = sandbox._getDriverQueueInfo(driver);

        assert.equal(info.capHours, 6, 'il livello comprato deve essere letto dall\'autista');
        assert.equal(info.isFull, false, 'con tetto 6h quel lavoro non è più coda piena');
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
        const lunga = prezzoPerDurata(sandbox, 125);
        const driver = { id: 'd_full', name: 'Pieno', status: 'busy', assignedCarId: null, queue: [corsa(lunga), corsa(lunga)] };
        sandbox.gameState.drivers.push(driver);
        sandbox.gameState.activeTrips.push({ id: 't1', driverId: 'd_full', endTime: Date.now() + 60 * MIN });
        const nuova = corsa(100, 'r_nuova');
        sandbox.gameState.pendingRides.push(nuova);

        sandbox.assignRideToDriver('r_nuova', 'd_full');

        assert.ok(sandbox.gameState.pendingRides.some(r => r.id === 'r_nuova'),
            'coda piena in ore (corsa in corso + oltre 4h di coda): la corsa resta in attesa');
        const msg = notifications.map(n => n.msg).join(' ');
        assert.match(msg, /lavora fino alle/, 'il messaggio deve dire l\'orario di fine lavoro');
        assert.match(msg, /(tetto|ore)/i, 'il messaggio deve suggerire come allargare la coda');
    });

    test('_driverCanTakeRide segue il monte ore: tante corte sì, due lunghe no', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'standard', condition: 90, outOfService: false };
        sandbox.gameState.fleet = [car];
        const cortaMs = sandbox._getRideDurationMs(corsa(1));
        const quante  = Math.max(1, Math.floor((4 * 60 * MIN) / cortaMs) - 1);
        const lunga   = prezzoPerDurata(sandbox, 125);
        const corto = { id: 'd_c', name: 'Corto', status: 'idle', assignedCarId: 'car1',
                        queue: Array.from({ length: quante }, () => corsa(1)) };
        const lungo = { id: 'd_l', name: 'Lungo', status: 'idle', assignedCarId: 'car1',
                        queue: [corsa(lunga), corsa(lunga)] };
        sandbox.gameState.drivers.push(corto, lungo);

        const ride = { id: 'r1', tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(corto, ride), true, 'sotto il tetto in ore: disponibile');
        assert.equal(sandbox._driverCanTakeRide(lungo, ride), false, 'sopra il tetto in ore: indisponibile');
    });
});
