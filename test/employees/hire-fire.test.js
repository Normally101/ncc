'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('employees/hire-fire — assunzione e licenziamento', () => {
    test('assumere un autista scala il cash (salary*2) e lo aggiunge al roster', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 10000;
        const cashBefore = sandbox.gameState.cash;
        const driversBefore = sandbox.gameState.drivers.length;

        sandbox.hireDriver('Mario Rossi', 1000);

        assert.equal(sandbox.gameState.cash, cashBefore - 2000, 'il costo di assunzione è salary*2');
        assert.equal(sandbox.gameState.drivers.length, driversBefore + 1, 'un autista in più nel roster');
        assert.ok(sandbox.gameState.drivers.find(d => d.name === 'Mario Rossi'), 'il nuovo autista deve essere nel roster');
    });

    test('assumere senza fondi sufficienti non modifica cash né roster', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 100;
        const cashBefore = sandbox.gameState.cash;
        const driversBefore = sandbox.gameState.drivers.length;

        sandbox.hireDriver('Troppo Caro', 1000);

        assert.equal(sandbox.gameState.cash, cashBefore, 'fondi insufficienti: cash invariato');
        assert.equal(sandbox.gameState.drivers.length, driversBefore, 'fondi insufficienti: roster invariato');
    });

    test('REGRESSIONE (fix 9 agosto 2026): licenziare un autista IDLE funziona normalmente', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.drivers.push({ id: 'd_idle', name: 'Autista Libero', status: 'idle' });
        const before = sandbox.gameState.drivers.length;

        sandbox.fireDriver('d_idle');

        assert.equal(sandbox.gameState.drivers.length, before - 1, 'un autista idle deve poter essere licenziato');
        assert.ok(!sandbox.gameState.drivers.find(d => d.id === 'd_idle'), 'non deve più essere nel roster');
    });

    test('REGRESSIONE (fix 9 agosto 2026): licenziare un autista BUSY (a metà corsa) viene bloccato', () => {
        // Prima del fix, fireDriver rimuoveva comunque l'autista, lasciando ride.driverId
        // orfano e liberando l'auto assegnata per la riassegnazione mentre la vecchia corsa
        // pagava comunque a fine corsa — vedi docs/SYSTEMS.md §4, HANDOFF.md 9 agosto.
        const { sandbox, notifications } = freshEnv();
        sandbox.gameState.drivers.push({ id: 'd_busy', name: 'Autista In Corsa', status: 'busy' });
        const before = sandbox.gameState.drivers.length;

        sandbox.fireDriver('d_busy');

        assert.equal(sandbox.gameState.drivers.length, before, 'un autista busy NON deve poter essere licenziato');
        assert.ok(sandbox.gameState.drivers.find(d => d.id === 'd_busy'), 'deve restare nel roster');
        assert.ok(notifications.some(n => n.type === 'error'), 'deve mostrare una notifica di errore, non fallire in silenzio');
    });
});
