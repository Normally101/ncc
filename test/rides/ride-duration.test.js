'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('rides/ride-duration — calcolo durata corsa (_getRideDurationMs)', () => {
    test('calcolo base a 0.2 minuti per euro', () => {
        const { sandbox } = freshEnv();
        // 100€ * 0.2 = 20 minuti = 1.200.000 ms
        const duration100 = sandbox._getRideDurationMs({ price: 100 });
        assert.equal(duration100, 20 * 60 * 1000, '100€ devono corrispondere a 20 minuti in ms');

        // 250€ * 0.2 = 50 minuti = 3.000.000 ms
        const duration250 = sandbox._getRideDurationMs({ price: 250 });
        assert.equal(duration250, 50 * 60 * 1000, '250€ devono corrispondere a 50 minuti in ms');

        // Rispetta la priorità delle proprietà prezzo: sellingPrice > basePrice > price > default 150
        assert.equal(sandbox._getRideDurationMs({ sellingPrice: 200, price: 100 }), 40 * 60 * 1000, 'sellingPrice deve avere la precedenza su price');
        assert.equal(sandbox._getRideDurationMs({ basePrice: 200, price: 100 }), 40 * 60 * 1000, 'basePrice deve avere la precedenza su price');
        assert.equal(sandbox._getRideDurationMs({}), 30 * 60 * 1000, 'senza prezzo deve usare il default di 150€ (30 min)');
    });

    test('pavimento di 10 minuti per corse molto economiche', () => {
        const { sandbox } = freshEnv();
        // 30€ * 0.2 = 6 minuti, ma il pavimento è 10 minuti (600.000 ms)
        const duration30 = sandbox._getRideDurationMs({ price: 30 });
        assert.equal(duration30, 10 * 60 * 1000, '30€ (6 min) devono essere limitati al pavimento di 10 minuti');

        // 10€ * 0.2 = 2 minuti, ma il pavimento è 10 minuti
        const duration10 = sandbox._getRideDurationMs({ price: 10 });
        assert.equal(duration10, 10 * 60 * 1000, '10€ (2 min) devono essere limitati al pavimento di 10 minuti');

        // 45€ * 0.2 = 9 minuti, ma il pavimento è 10 minuti
        const duration45 = sandbox._getRideDurationMs({ price: 45 });
        assert.equal(duration45, 10 * 60 * 1000, '45€ (9 min) devono essere limitati al pavimento di 10 minuti');
    });

    test('tetto di 360 minuti (6 ore) per corse molto costose', () => {
        const { sandbox } = freshEnv();
        // 3000€ * 0.2 = 600 minuti, ma il tetto è 360 minuti (21.600.000 ms)
        const durationHigh = sandbox._getRideDurationMs({ price: 3000 });
        assert.equal(durationHigh, 360 * 60 * 1000, 'corse sopra i 1800€ devono essere limitate al tetto di 360 minuti');

        const durationVeryHigh = sandbox._getRideDurationMs({ price: 10000 });
        assert.equal(durationVeryHigh, 360 * 60 * 1000, 'corse con prezzi estremi devono restare a 360 minuti');
    });

    test('moltiplicatori per routeType (Airport, Rail, Transfer, Boat, Port)', () => {
        const { sandbox } = freshEnv();
        const baseRide = { price: 100 }; // 20 minuti base

        // Airport, Rail, Transfer moltiplicano per 0.7 -> 20 * 0.7 = 14 minuti (840.000 ms)
        assert.equal(
            sandbox._getRideDurationMs({ ...baseRide, routeType: 'Airport' }),
            14 * 60 * 1000,
            'routeType Airport deve applicare moltiplicatore 0.7'
        );
        assert.equal(
            sandbox._getRideDurationMs({ ...baseRide, routeType: 'Rail' }),
            14 * 60 * 1000,
            'routeType Rail deve applicare moltiplicatore 0.7'
        );
        assert.equal(
            sandbox._getRideDurationMs({ ...baseRide, routeType: 'Transfer' }),
            14 * 60 * 1000,
            'routeType Transfer deve applicare moltiplicatore 0.7'
        );

        // Boat e Port moltiplicano per 1.3 -> 20 * 1.3 = 26 minuti (1.560.000 ms)
        assert.equal(
            sandbox._getRideDurationMs({ ...baseRide, routeType: 'Boat' }),
            26 * 60 * 1000,
            'routeType Boat deve applicare moltiplicatore 1.3'
        );
        assert.equal(
            sandbox._getRideDurationMs({ ...baseRide, routeType: 'Port' }),
            26 * 60 * 1000,
            'routeType Port deve applicare moltiplicatore 1.3'
        );

        // City-to-City o senza routeType non applica moltiplicatori speciali
        assert.equal(
            sandbox._getRideDurationMs({ ...baseRide, routeType: 'City-to-City' }),
            20 * 60 * 1000,
            'routeType City-to-City deve mantenere durata base'
        );
    });

    test('moltiplicatore interregionale (1.5x) tra regioni diverse', () => {
        const { sandbox } = freshEnv();
        // 100€ base (20 min) * 1.5 = 30 minuti (1.800.000 ms)
        const durationInterregion = sandbox._getRideDurationMs({
            price: 100,
            fromPoi: { region: 'lazio' },
            toPoi: { region: 'toscana' },
        });
        assert.equal(durationInterregion, 30 * 60 * 1000, 'viaggi tra regioni diverse devono applicare moltiplicatore 1.5x');

        // Stessa regione non deve applicare il moltiplicatore
        const durationIntraregion = sandbox._getRideDurationMs({
            price: 100,
            fromPoi: { region: 'lazio' },
            toPoi: { region: 'lazio' },
        });
        assert.equal(durationIntraregion, 20 * 60 * 1000, 'viaggi nella stessa regione non devono subire modifiche');
    });
});
