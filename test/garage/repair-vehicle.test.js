'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('garage/repair-vehicle — riparazione veicolo', () => {
    test('riparare un veicolo danneggiato scala il cash e riporta la condizione a 100', async () => {
        const { sandbox } = freshEnv();
        const car = { id: 'c_dmg', _serverId: 'srv_dmg', name: 'Auto Danneggiata', tier: 'business', condition: 40, isLease: false };
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;
        // 19/08/2026: il prezzo passa da €25 a €85 al punto. Non e' un ritocco di
        // bilanciamento: €85 e' la cifra che ENTRAMBE le interfacce mostravano da
        // sempre sul pulsante, mentre l'addebito reale usava di nascosto €25.
        // Consolidato su cio' che il giocatore legge. Fonte unica: repairCostFor.
        const expectedCost = (100 - 40) * 85;

        await sandbox.payToRepairCar('c_dmg');

        assert.equal(car.condition, 100, 'la condizione deve tornare al 100%');
        assert.equal(sandbox.gameState.cash, cashBefore - expectedCost, `il cash deve scalare esattamente del costo riparazione (${expectedCost})`);
    });

    test('un veicolo già al 100% non genera alcun costo di riparazione', async () => {
        const { sandbox } = freshEnv();
        const car = { id: 'c_ok', _serverId: 'srv_ok', name: 'Auto OK', tier: 'business', condition: 100, isLease: false };
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;

        await sandbox.payToRepairCar('c_ok');

        assert.equal(sandbox.gameState.cash, cashBefore, 'nessun costo se la condizione è già 100%');
    });

    test('con investimento Kasko la riparazione è gratuita', async () => {
        const { sandbox } = freshEnv();
        const car = { id: 'c_dmg2', _serverId: 'srv_dmg2', name: 'Auto Danneggiata', tier: 'business', condition: 20, isLease: false };
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.investments.push('inv_kasko');
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;

        await sandbox.payToRepairCar('c_dmg2');

        assert.equal(car.condition, 100, 'Kasko ripara comunque al 100%');
        assert.equal(sandbox.gameState.cash, cashBefore, 'Kasko: nessun addebito');
    });

    test('un meccanico in staff dimezza il costo di riparazione', async () => {
        const { sandbox } = freshEnv();
        const car = { id: 'c_dmg3', _serverId: 'srv_dmg3', name: 'Auto Danneggiata', tier: 'business', condition: 40, isLease: false };
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.staff.push({ id: 'mech', name: 'Meccanico' });
        sandbox.gameState.cash = 50000;
        const cashBefore = sandbox.gameState.cash;
        const expectedCost = Math.round((100 - 40) * 85 * 0.5);

        await sandbox.payToRepairCar('c_dmg3');

        assert.equal(sandbox.gameState.cash, cashBefore - expectedCost, `col meccanico il costo deve essere dimezzato (${expectedCost})`);
    });
});
