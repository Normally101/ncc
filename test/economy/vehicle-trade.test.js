'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economy/vehicle-trade — comprare e vendere un veicolo', () => {
    test('comprare un veicolo scala il cash e aggiunge il veicolo alla flotta', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 500000; // Stellar E-Executive costa 120000
        const fleetBefore = sandbox.gameState.fleet.length;

        sandbox.renderTabShowroom(); // apre il tab (crea l'overlay una volta) — _srmOpenConfig
        // senza overlay già esistente ricade su renderTabShowroom() che resetta la selezione,
        // esattamente come nell'app reale: prima si apre il tab, poi si clicca un'auto.
        sandbox._srmOpenConfig('stellar_e_exec');
        const price = sandbox._srmTotalPrice();
        const cashBefore = sandbox.gameState.cash;

        await sandbox._srmPurchase();

        assert.equal(sandbox.gameState.cash, cashBefore - price,
            `il cash deve scalare esattamente del prezzo (${price}), non di più/meno`);
        assert.equal(sandbox.gameState.fleet.length, fleetBefore + 1, 'la flotta deve avere un veicolo in più');
        const bought = sandbox.gameState.fleet[sandbox.gameState.fleet.length - 1];
        assert.ok(bought._serverId, 'il veicolo comprato deve avere un _serverId dalla RPC (non solo locale)');
    });

    test('comprare un veicolo senza fondi sufficienti non modifica cash né flotta', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 100; // troppo poco per qualsiasi auto del catalogo
        const cashBefore = sandbox.gameState.cash;
        const fleetBefore = sandbox.gameState.fleet.length;

        sandbox.renderTabShowroom();
        sandbox._srmOpenConfig('stellar_e_exec');
        await sandbox._srmPurchase();

        assert.equal(sandbox.gameState.cash, cashBefore, 'fondi insufficienti: il cash non deve cambiare');
        assert.equal(sandbox.gameState.fleet.length, fleetBefore, 'fondi insufficienti: nessun veicolo aggiunto');
    });

    test('vendere un veicolo aumenta il cash e lo rimuove dalla flotta', async () => {
        const { sandbox } = freshEnv();
        const car = { id: 'c_test', _serverId: 'srv_test', name: 'Test Car', tier: 'business', condition: 100, isLease: false };
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;
        const fleetBefore = sandbox.gameState.fleet.length;

        await sandbox.sellCar('c_test');

        const expectedPrice = Math.floor(35000 * (100 / 100) * 0.7); // baseValue 'business' (default, non ultra/vip) = 35000, vedi engine.js::sellCar
        assert.equal(sandbox.gameState.cash, cashBefore + expectedPrice, 'il cash deve aumentare esattamente del prezzo di vendita');
        assert.equal(sandbox.gameState.fleet.length, fleetBefore - 1, 'il veicolo venduto deve sparire dalla flotta');
        assert.ok(!sandbox.gameState.fleet.find(c => c.id === 'c_test'), 'il veicolo specifico non deve più esistere in flotta');
    });

    test('non si può vendere un veicolo in leasing', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.fleet.push({ id: 'c_lease', _serverId: 's1', name: 'Lease Car', tier: 'business', condition: 100, isLease: true });
        const cashBefore = sandbox.gameState.cash;
        const fleetBefore = sandbox.gameState.fleet.length;

        await sandbox.sellCar('c_lease');

        assert.equal(sandbox.gameState.cash, cashBefore, 'vendita bloccata: cash invariato');
        assert.equal(sandbox.gameState.fleet.length, fleetBefore, 'vendita bloccata: flotta invariata');
    });
});
