'use strict';
/* ============================================================================
   test/rides/dispatch-weather.test.js — Visualizzazione meteo nel Dispatch Center

   Verifica che il meteo sia visibile dove il giocatore decide le corse
   (renderTabCorse in ui-dispatch.js), con i dati reali letti da WEATHER_STATES:
   - Icona e condizione meteo attuale (Sereno, Pioggia, Neve)
   - Impatto sulla velocità (es. "-40% velocità")
   - Impatto sulle tariffe (es. "+25% tariffe")
   - I numeri non sono hardcoded ma derivati dinamicamente da WEATHER_STATES
   - Il cambio di gameState.weather aggiorna la vista di dispatch
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('dispatch — visualizzazione meteo nel centro di smistamento corse', () => {
    let env, sandbox, gs, container;

    beforeEach(() => {
        env = createGameEnv(CORE_FILES, { render: true });
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        // Esci da survival (Zero-to-Hero) per visualizzare il vero Dispatch Center
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 15;

        container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);
    });

    afterEach(() => {
        env.stopAllIntervals();
        container.remove();
    });

    test('quando il meteo è pioggia, il dispatch mostra Pioggia, -20% velocità e +15% tariffe', () => {
        gs.weather = 'pioggia';
        sandbox.renderTabCorse();

        const html = container.innerHTML;
        assert.ok(html.includes('Pioggia'), 'deve mostrare la condizione meteo Pioggia');
        assert.ok(html.includes('-20% velocità'), 'deve mostrare -20% velocità calcolato da speedMult 0.80');
        assert.ok(html.includes('+15% tariffe'), 'deve mostrare +15% tariffe calcolato da priceMult 1.15');
    });

    test('quando il meteo è neve, il dispatch mostra Neve, -40% velocità e +25% tariffe', () => {
        gs.weather = 'neve';
        sandbox.renderTabCorse();

        const html = container.innerHTML;
        assert.ok(html.includes('Neve'), 'deve mostrare la condizione meteo Neve');
        assert.ok(html.includes('-40% velocità'), 'deve mostrare -40% velocità calcolato da speedMult 0.60');
        assert.ok(html.includes('+25% tariffe'), 'deve mostrare +25% tariffe calcolato da priceMult 1.25');
    });

    test('quando il meteo è sereno (sole), il dispatch mostra Sereno', () => {
        gs.weather = 'sole';
        sandbox.renderTabCorse();

        const html = container.innerHTML;
        assert.ok(html.includes('Sereno'), 'deve mostrare la condizione meteo Sereno');
        assert.ok(html.includes('☀️'), 'deve mostrare l\'icona del sole');
    });

    test('i numeri mostrati cambiano dinamicamente se cambiano i moltiplicatori in WEATHER_STATES (non hardcoded)', () => {
        const weatherStates = vm.runInContext('WEATHER_STATES', sandbox);
        const pioggiaState = weatherStates.find(w => w.id === 'pioggia');
        assert.ok(pioggiaState, 'pioggia deve esistere in WEATHER_STATES');

        // Modifica temporanea dei moltiplicatori per testare che non siano stringhe fisse
        const origSpeed = pioggiaState.speedMult;
        const origPrice = pioggiaState.priceMult;
        pioggiaState.speedMult = 0.70; // -30% velocità
        pioggiaState.priceMult = 1.35; // +35% tariffe

        gs.weather = 'pioggia';
        sandbox.renderTabCorse();

        const html = container.innerHTML;
        assert.ok(html.includes('-30% velocità'), 'deve calcolare dinamicamente -30% velocità');
        assert.ok(html.includes('+35% tariffe'), 'deve calcolare dinamicamente +35% tariffe');

        // Ripristino
        pioggiaState.speedMult = origSpeed;
        pioggiaState.priceMult = origPrice;
    });

    test('cambiare gameState.weather aggiorna il testo visualizzato nel dispatch', () => {
        gs.weather = 'sole';
        sandbox.renderTabCorse();
        assert.ok(container.innerHTML.includes('Sereno'));
        assert.ok(!container.innerHTML.includes('-40% velocità'));

        gs.weather = 'neve';
        sandbox.renderTabCorse();
        assert.ok(container.innerHTML.includes('Neve'));
        assert.ok(container.innerHTML.includes('-40% velocità'));
        assert.ok(container.innerHTML.includes('+25% tariffe'));

        gs.weather = 'pioggia';
        sandbox.renderTabCorse();
        assert.ok(container.innerHTML.includes('Pioggia'));
        assert.ok(container.innerHTML.includes('-20% velocità'));
        assert.ok(container.innerHTML.includes('+15% tariffe'));
    });
});
