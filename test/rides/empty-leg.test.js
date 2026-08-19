'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

const POI_ROMA = { id: 'roma', name: 'Roma Centro', region: 'lazio', baseFlat: 75 };
const POI_FCO = { id: 'roma_fco', name: 'Aeroporto FCO', region: 'lazio', baseFlat: 90 };
const POI_CIVITAVECCHIA = { id: 'civitavecchia', name: 'Porto Civitavecchia', region: 'lazio', baseFlat: 234 };
const POI_NAPOLI = { id: 'napoli', name: 'Napoli', region: 'campania', baseFlat: 72 };
const POI_MILANO = { id: 'milano', name: 'Milano', region: 'lombardia', baseFlat: 90 };

describe('rides/empty-leg — ottimizzazione corse di ritorno (_findEmptyLegRide)', () => {
    test('senza investimento inv_empty_leg non viene generata alcuna corsa', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = []; // nessun investimento
        sandbox.gameState.pendingRides = [];
        sandbox.Math.random = () => 0.1; // roll favorevole (<= 0.40)

        const completedRide = {
            fromPoi: POI_ROMA,
            toPoi: POI_MILANO,
        };

        sandbox._findEmptyLegRide(completedRide);

        assert.equal(sandbox.gameState.pendingRides.length, 0, 'senza inv_empty_leg non deve generare corse in pendingRides');
    });

    test('con inv_empty_leg ma roll casuale > 0.40 non viene generata la corsa', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        sandbox.gameState.pendingRides = [];
        sandbox.Math.random = () => 0.41; // roll sfortunato (> 0.40)

        const completedRide = {
            fromPoi: POI_ROMA,
            toPoi: POI_MILANO,
        };

        sandbox._findEmptyLegRide(completedRide);

        assert.equal(sandbox.gameState.pendingRides.length, 0, 'con roll > 0.40 la corsa non deve essere generata');
    });

    test('corsa di ritorno nella stessa regione (intra-regionale): tariffa base 50% e durata 20s', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        sandbox.gameState.unlockedRegions = ['lazio'];
        sandbox.gameState.pendingRides = [];

        // completedRide arriva a roma (baseFlat = 75)
        const completedRide = {
            fromPoi: POI_CIVITAVECCHIA,
            toPoi: POI_ROMA,
        };

        // Math.random: primo roll per la probabilità (0.1 <= 0.40), secondo roll per la scelta destinazione
        sandbox.Math.random = () => 0.1;

        const idBefore = sandbox.gameState.nextId;
        sandbox._findEmptyLegRide(completedRide);

        assert.equal(sandbox.gameState.pendingRides.length, 1, 'deve generare 1 corsa empty leg');
        const emptyRide = sandbox.gameState.pendingRides[0];

        assert.equal(emptyRide.id, idBefore, 'id corsa deve essere gameState.nextId');
        assert.equal(emptyRide.isEmptyLeg, true, 'il flag isEmptyLeg deve essere true');
        assert.equal(emptyRide.tier, 'standard', 'tier deve essere standard');
        assert.equal(emptyRide.fromPoi.id, POI_ROMA.id, 'fromPoi deve corrispondere al toPoi della corsa completata');
        assert.equal(emptyRide.toPoi.region, 'lazio', 'toPoi deve appartenere a una regione sbloccata');
        assert.notEqual(emptyRide.toPoi.id, POI_ROMA.id, 'toPoi non può essere uguale a fromPoi');

        // Intra-regionale: isLong = false -> price = Math.floor(75 * 1.0 * 1.0 * 0.50) = 37, duration = 20000
        const expectedPrice = Math.floor(POI_ROMA.baseFlat * 1.0 * 0.50);
        assert.equal(emptyRide.price, expectedPrice, 'prezzo deve essere 50% della tariffa base intra-regionale');
        assert.equal(emptyRide.duration, 20000, 'durata intra-regionale deve essere 20000 ms');
        assert.equal(emptyRide.elapsed, 0, 'elapsed iniziale deve essere 0');
    });

    test('corsa di ritorno tra regioni diverse (interregionale): tariffa 2.8x al 50% e durata 40s', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        // Sblocchiamo campania (dove arriva l'auto) e toscana
        sandbox.gameState.unlockedRegions = ['campania', 'toscana'];
        sandbox.gameState.pendingRides = [];

        // Auto finisce a Napoli (baseFlat = 72, regione = campania)
        const completedRide = {
            fromPoi: POI_ROMA,
            toPoi: POI_NAPOLI,
        };

        // Sblocchiamo toscana in modo che qualsiasi destinazione estratta sia interregionale (campania -> toscana)
        sandbox.gameState.unlockedRegions = ['toscana'];

        let roll = 0;
        sandbox.Math.random = () => {
            roll++;
            if (roll === 1) return 0.2; // <= 0.40 (successo probabilità)
            return 0.1; // seleziona il primo POI disponibile (firenze)
        };

        sandbox._findEmptyLegRide(completedRide);

        assert.equal(sandbox.gameState.pendingRides.length, 1, 'deve generare 1 corsa');
        const emptyRide = sandbox.gameState.pendingRides[0];

        assert.equal(emptyRide.fromPoi.id, 'napoli');
        assert.equal(emptyRide.toPoi.id, 'firenze');
        assert.equal(emptyRide.toPoi.region, 'toscana');
        assert.equal(emptyRide.isEmptyLeg, true);

        // Interregionale: isLong = true -> price = Math.floor(72 * 2.8 * 0.50) = 100, duration = 40000
        const expectedPrice = Math.floor(POI_NAPOLI.baseFlat * 2.8 * 0.50);
        assert.equal(emptyRide.price, expectedPrice, 'prezzo interregionale deve applicare moltiplicatore 2.8x al 50%');
        assert.equal(emptyRide.duration, 40000, 'durata interregionale deve essere 40000 ms');
    });

    test('nessun POI disponibile oltre alla destinazione corrente non genera alcuna corsa', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        // Creiamo una situazione in cui l'unica regione sbloccata ha solo 1 POI che coincide con toPoi
        sandbox.gameState.unlockedRegions = ['regione_fittizia'];
        sandbox.gameState.pendingRides = [];
        sandbox.Math.random = () => 0.1;

        const fakePoi = { id: 'poi_solo', region: 'regione_fittizia', name: 'Solo', baseFlat: 100 };
        const completedRide = {
            fromPoi: { id: 'partenza', region: 'altra' },
            toPoi: fakePoi,
        };

        sandbox._findEmptyLegRide(completedRide);

        assert.equal(sandbox.gameState.pendingRides.length, 0, 'senza POI disponibili non deve aggiungere corse');
    });

    test('notifica e log di gioco vengono emessi alla generazione di un empty leg', () => {
        const { sandbox, notifications, logs } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        sandbox.gameState.unlockedRegions = ['lazio'];
        sandbox.Math.random = () => 0.1;

        const completedRide = {
            fromPoi: POI_CIVITAVECCHIA,
            toPoi: POI_ROMA,
        };

        sandbox._findEmptyLegRide(completedRide);

        const hasEmptyLegLog = logs.some(l => l.includes('Empty Leg'));
        const hasEmptyLegNotif = notifications.some(n => n.msg.includes('Empty Leg trovato') && n.type === 'success');

        assert.equal(hasEmptyLegLog, true, 'deve loggare l\'evento di empty leg nella mappa');
        assert.equal(hasEmptyLegNotif, true, 'deve mostrare una notifica di successo');
    });

    test('integrazione completeRide: corsa a lungo raggio con inv_empty_leg invoca _findEmptyLegRide', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        sandbox.gameState.unlockedRegions = ['lazio', 'campania'];
        sandbox.gameState.pendingRides = [];

        const car = { id: 'car1', tier: 'business', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'busy', assignedCarId: 'car1', queue: [] };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        // Corsa interregionale: lazio -> campania
        const ride = {
            id: 101,
            driverId: 'd1',
            fromPoi: POI_ROMA,       // lazio
            toPoi: POI_NAPOLI,       // campania
            tier: 'business',
            price: 200,
            duration: 40000,
            isEmptyLeg: false,
        };

        sandbox.Math.random = () => 0.1; // roll favorevole

        sandbox.completeRide(ride);

        assert.equal(sandbox.gameState.pendingRides.length, 1, 'completeRide su corsa interregionale deve innescare _findEmptyLegRide');
        assert.equal(sandbox.gameState.pendingRides[0].isEmptyLeg, true, 'la nuova corsa generata deve essere un empty leg');
    });

    test('integrazione completeRide: corsa locale nella stessa regione NON attiva empty leg', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        sandbox.gameState.unlockedRegions = ['lazio'];
        sandbox.gameState.pendingRides = [];

        const car = { id: 'car1', tier: 'standard', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'busy', assignedCarId: 'car1', queue: [] };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        // Corsa intra-regionale: roma -> fco (entrambi lazio)
        const ride = {
            id: 102,
            driverId: 'd1',
            fromPoi: POI_ROMA,
            toPoi: POI_FCO,
            tier: 'standard',
            price: 90,
            duration: 20000,
            isEmptyLeg: false,
        };

        sandbox.Math.random = () => 0.1;

        sandbox.completeRide(ride);

        assert.equal(sandbox.gameState.pendingRides.length, 0, 'completeRide su corsa locale non deve innescare empty leg');
    });

    test('integrazione completeRide: una corsa già empty leg completata non ne innesca una a catena', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments = ['inv_empty_leg'];
        sandbox.gameState.unlockedRegions = ['lazio', 'campania'];
        sandbox.gameState.pendingRides = [];

        const car = { id: 'car1', tier: 'standard', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'busy', assignedCarId: 'car1', queue: [] };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        // Corsa interregionale ma con isEmptyLeg = true
        const ride = {
            id: 103,
            driverId: 'd1',
            fromPoi: POI_ROMA,
            toPoi: POI_NAPOLI,
            tier: 'standard',
            price: 100,
            duration: 40000,
            isEmptyLeg: true,
        };

        sandbox.Math.random = () => 0.1;

        sandbox.completeRide(ride);

        assert.equal(sandbox.gameState.pendingRides.length, 0, 'il completamento di un empty leg non deve generare un altro empty leg');
    });
});
