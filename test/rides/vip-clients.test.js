'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('rides/vip-clients — Golden Boy/Erede colpiscono l\'auto giusta', () => {
    test('REGRESSIONE (fix 9 agosto 2026): Golden Boy danneggia l\'auto REALMENTE in uso, non quella della creazione ride', () => {
        // Prima del fix: cercava l'auto con `c.id === ride.carId || c.id === driver.assignedCarId`
        // in un solo .find() — se il driver era stato riassegnato tra la creazione della ride
        // VIP e il suo completamento, quale auto veniva colpita dipendeva dall'ordine
        // dell'array invece che dal veicolo davvero usato. Vedi docs/SYSTEMS.md §5.
        const { sandbox } = freshEnv();
        sandbox.gameState.fleet.push(
            { id: 'carA', name: 'Auto A (alla creazione ride)', condition: 100 },
            { id: 'carB', name: 'Auto B (dopo riassegnazione)', condition: 100 },
        );
        const driver = { id: 'd1', name: 'Autista', assignedCarId: 'carB', stress_level: 50 };
        sandbox.gameState.drivers.push(driver);
        const ride = { carId: 'carA' }; // congelato alla creazione, driver guidava ancora carA allora

        const origRandom = Math.random;
        Math.random = () => 0.01; // forza il ramo "danno applicato" (soglia 0.60 in _vipCompleteGolden)
        try {
            sandbox._vipCompleteGolden(ride, driver, 1000);
        } finally {
            Math.random = origRandom;
        }

        const carA = sandbox.gameState.fleet.find(c => c.id === 'carA');
        const carB = sandbox.gameState.fleet.find(c => c.id === 'carB');
        assert.ok(carB.condition < 100, 'l\'auto REALMENTE in uso (B, assignedCarId attuale) deve subire danno');
        assert.equal(carA.condition, 100, 'l\'auto della vecchia assegnazione (A) non deve essere toccata');
    });

    test('REGRESSIONE: L\'Erede ripara l\'auto REALMENTE in uso, non quella della creazione ride', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.fleet.push(
            { id: 'carA', name: 'Auto A (alla creazione ride)', condition: 60 },
            { id: 'carB', name: 'Auto B (dopo riassegnazione)', condition: 40 },
        );
        const driver = { id: 'd1', name: 'Autista', assignedCarId: 'carB' };
        sandbox.gameState.drivers.push(driver);
        const ride = { carId: 'carA' };

        const origRandom = Math.random;
        Math.random = () => 0.01; // forza il ramo incidente/kasko (soglia 0.30 in _vipCompleteErede)
        try {
            sandbox._vipCompleteErede(ride, driver, 1000);
        } finally {
            Math.random = origRandom;
        }

        const carA = sandbox.gameState.fleet.find(c => c.id === 'carA');
        const carB = sandbox.gameState.fleet.find(c => c.id === 'carB');
        assert.equal(carB.condition, 100, 'l\'auto REALMENTE in uso (B) deve essere riparata dalla Kasko dell\'Erede');
        assert.equal(carA.condition, 60, 'l\'auto della vecchia assegnazione (A) non deve essere toccata');
    });
});
