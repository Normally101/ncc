'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function addSecondDriverAndCar(sandbox) {
    sandbox.gameState.drivers.push({ id: 'd2', name: 'Driver 2', status: 'idle', assignedCarId: null, queue: [] });
    sandbox.gameState.fleet.push({ id: 'c2', name: 'Car 2', tier: 'standard', condition: 100, isLease: false, upgrades: [] });
}

describe('garage/assign — assegnazione auto-autista', () => {
    test('assegnare un\'auto libera a un autista funziona', () => {
        const { sandbox } = freshEnv();
        addSecondDriverAndCar(sandbox);

        sandbox.assignCarToDriver('c2', 'd2');

        assert.equal(sandbox.gameState.drivers.find(d => d.id === 'd2').assignedCarId, 'c2');
    });

    test('REGRESSIONE (fix stabilizzazione 10 agosto): assegnare un\'auto già in uso a un secondo autista libera il primo — prima restavano entrambi assegnati alla stessa auto', () => {
        const { sandbox } = freshEnv();
        addSecondDriverAndCar(sandbox);

        sandbox.assignCarToDriver('c_starter', 'ceo');
        sandbox.assignCarToDriver('c_starter', 'd2');

        const onSameCar = sandbox.gameState.drivers.filter(d => d.assignedCarId === 'c_starter');
        assert.equal(onSameCar.length, 1, 'solo un autista deve restare assegnato alla vettura');
        assert.equal(onSameCar[0].id, 'd2');
        assert.equal(sandbox.gameState.drivers.find(d => d.id === 'ceo').assignedCarId, null, 'il vecchio autista deve essere liberato');
    });

    test('riassegnare la STESSA auto allo stesso autista non lo libera da se stesso', () => {
        const { sandbox } = freshEnv();
        sandbox.assignCarToDriver('c_starter', 'ceo');

        sandbox.assignCarToDriver('c_starter', 'ceo');

        assert.equal(sandbox.gameState.drivers.find(d => d.id === 'ceo').assignedCarId, 'c_starter');
    });
});

describe('garage/upgrade — buyCARUpgrade', () => {
    test('installare un upgrade scala il cash esatto e lo aggiunge alla lista', () => {
        const { sandbox } = freshEnv();
        const upg = { id: 'wifi', price: 2500 }; // data.js: Wi-Fi Starlink
        sandbox.gameState.cash = upg.price + 1000;
        const cashBefore = sandbox.gameState.cash;

        sandbox.buyCARUpgrade('c_starter', upg.id);

        assert.equal(sandbox.gameState.cash, cashBefore - upg.price);
        assert.ok(sandbox.gameState.fleet.find(c => c.id === 'c_starter').upgrades.includes(upg.id));
    });

    test('lo stesso upgrade non può essere installato due volte (nessun doppio addebito)', () => {
        const { sandbox } = freshEnv();
        const upg = { id: 'wifi', price: 2500 }; // data.js: Wi-Fi Starlink
        sandbox.gameState.cash = upg.price * 3;
        sandbox.buyCARUpgrade('c_starter', upg.id);
        const cashAfterFirst = sandbox.gameState.cash;

        sandbox.buyCARUpgrade('c_starter', upg.id);

        assert.equal(sandbox.gameState.cash, cashAfterFirst, 'un secondo tentativo sullo stesso upgrade non deve scalare di nuovo');
        assert.equal(sandbox.gameState.fleet.find(c => c.id === 'c_starter').upgrades.filter(u => u === upg.id).length, 1);
    });

    test('fondi insufficienti: upgrade rifiutato, cash e lista invariati', () => {
        const { sandbox } = freshEnv();
        const upg = { id: 'wifi', price: 2500 }; // data.js: Wi-Fi Starlink
        sandbox.gameState.cash = 0;

        sandbox.buyCARUpgrade('c_starter', upg.id);

        assert.equal(sandbox.gameState.cash, 0);
        assert.equal(sandbox.gameState.fleet.find(c => c.id === 'c_starter').upgrades.length, 0);
    });

    test('REGRESSIONE (fix 15 agosto 2026, trovato da Gemini review): buyCARUpgrade sincronizza il cash col server — prima restava locale, un refresh subito dopo ripristinava il vecchio saldo dal server mantenendo comunque l\'upgrade installato ("sconto" gratuito)', () => {
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: { syncCash: async (cash) => { syncedCash = cash; return { success: true, cash }; } },
        });
        const upg = { id: 'wifi', price: 2500 }; // data.js: Wi-Fi Starlink
        sandbox.gameState.cash = upg.price + 1000;

        sandbox.buyCARUpgrade('c_starter', upg.id);

        assert.equal(syncedCash, sandbox.gameState.cash, 'il valore mandato al server deve coincidere col cash locale dopo l\'upgrade');
    });
});
