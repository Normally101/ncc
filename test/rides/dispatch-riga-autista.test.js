'use strict';
/* La riga dell'autista nella scheda Dispatch diceva «coda 5/undefined»: leggeva
   `qInfo.maxQueue`, un campo che _getDriverQueueInfo non restituisce piu' da
   quando il tetto della coda si misura in ORE e non in numero di corse. Nessun
   test guardava il testo disegnato, quindi il campo e' rimasto a mostrare
   `undefined` al giocatore. */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('rides/dispatch-riga-autista — niente "undefined" nel tetto della coda', () => {
    let env, sandbox, gs, container;

    beforeEach(() => {
        env = createGameEnv(CORE_FILES, { render: true });
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 15;   // fuori dalla modalita' sopravvivenza
        container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);
    });

    afterEach(() => { env.stopAllIntervals(); container.remove(); });

    test('un autista con la coda piena non mostra mai "undefined" nella sua riga', () => {
        sandbox.hireNeighborhoodKid();
        const driver = gs.drivers[gs.drivers.length - 1];
        driver.queue = [1, 2, 3, 4, 5].map(n => ({
            id: 900 + n, tier: 'standard', price: 120, duration: 20000, elapsed: 0,
            fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
            toPoi:   { id: 'roma_fco', name: 'Roma FCO', region: 'lazio' },
        }));

        sandbox.renderTabCorse();
        const testo = container.textContent;

        assert.ok(testo.includes('coda 5'), `la riga deve dire quante corse ha in coda, letto: "${testo.slice(0, 400)}"`);
        assert.ok(!/undefined/.test(testo), 'nessun "undefined" puo' + '\'' + ' finire sotto gli occhi del giocatore');
    });

    test('il tetto della coda e\' espresso in ore, come lo misura il motore', () => {
        sandbox.hireNeighborhoodKid();
        const driver = gs.drivers[gs.drivers.length - 1];
        driver.queue = [{
            id: 950, tier: 'standard', price: 400, duration: 20000, elapsed: 0,
            fromPoi: { id: 'roma', name: 'Roma', region: 'lazio' },
            toPoi:   { id: 'roma_fco', name: 'Roma FCO', region: 'lazio' },
        }];

        const cap = sandbox._getDriverQueueInfo(driver).capHours;
        sandbox.renderTabCorse();

        assert.ok(container.textContent.includes(`/ ${cap}h`),
            `il dettaglio della coda deve mostrare il tetto in ore (/${cap}h), letto: "${container.textContent.slice(0, 400)}"`);
    });
});
