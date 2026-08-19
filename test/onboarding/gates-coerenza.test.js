'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('../../test-support/game-env.js');

describe('onboarding/gates-coerenza — allineamento soglie tra GATES e objective-tracker', () => {
    test('le soglie di EARLY_GATES in objective-tracker.js derivano fedelmente da window.ceOnb.GATES', () => {
        const { sandbox } = createGameEnv(['onboarding-core.js', 'objective-tracker.js']);

        assert.ok(sandbox.window.ceOnb && sandbox.window.ceOnb.GATES, 'ceOnb.GATES deve essere definito');
        assert.ok(typeof sandbox.window._earlyGates === 'function', '_earlyGates deve essere una funzione esportata');

        const earlyGates = sandbox.window._earlyGates();
        assert.ok(Array.isArray(earlyGates) && earlyGates.length > 0, 'earlyGates deve restituire un array non vuoto');

        for (const gate of earlyGates) {
            const sourceGate = sandbox.window.ceOnb.GATES[gate.tab];
            assert.ok(sourceGate, `Il tab "${gate.tab}" mostrato in objective-tracker deve esistere in ceOnb.GATES`);
            assert.equal(
                gate.rides,
                sourceGate.rides,
                `La soglia corse per il tab "${gate.tab}" (${gate.label}) in objective-tracker (${gate.rides}) deve coincidere con ceOnb.GATES (${sourceGate.rides})`
            );
        }
    });

    test('etichette in italiano e ordine storico dei gate sono preservati', () => {
        const { sandbox } = createGameEnv(['onboarding-core.js', 'objective-tracker.js']);
        const earlyGates = sandbox.window._earlyGates();

        const expectedGates = [
            { tab: 'finance',        label: 'Finanza',           rides: 3 },
            { tab: 'market',         label: 'Mercato',           rides: 5 },
            { tab: 'b2b',            label: 'Contratti B2B',     rides: 7 },
            { tab: 'hq',             label: 'Quartier Generale', rides: 9 },
            { tab: 'contracts',      label: 'Contratti',         rides: 11 },
            { tab: 'infrastructure', label: 'Infrastrutture',    rides: 15 },
            { tab: 'tourism',        label: 'Turismo',           rides: 18 },
        ];

        assert.equal(earlyGates.length, expectedGates.length, 'Il numero di gate precoci deve coincidere');
        for (let i = 0; i < expectedGates.length; i++) {
            assert.equal(earlyGates[i].tab, expectedGates[i].tab, `Gate #${i}: tab non corrispondente`);
            assert.equal(earlyGates[i].label, expectedGates[i].label, `Gate #${i}: etichetta in italiano non corrispondente`);
            assert.equal(earlyGates[i].rides, expectedGates[i].rides, `Gate #${i}: soglia rides non corrispondente`);
        }
    });

    test('modifiche a ceOnb.GATES a runtime vengono riflesse dinamicamente senza disallineamenti', () => {
        const { sandbox } = createGameEnv(['onboarding-core.js', 'objective-tracker.js']);

        // Simuliamo una variazione di bilanciamento futuro in GATES
        sandbox.window.ceOnb.GATES.finance.rides = 4;
        sandbox.window.ceOnb.GATES.market.rides = 6;

        const updatedGates = sandbox.window._earlyGates();
        const finance = updatedGates.find(g => g.tab === 'finance');
        const market = updatedGates.find(g => g.tab === 'market');

        assert.equal(finance.rides, 4, 'objective-tracker deve riflettere dinamicamente il nuovo valore di finance.rides');
        assert.equal(market.rides, 6, 'objective-tracker deve riflettere dinamicamente il nuovo valore di market.rides');
    });

    test('fallback sensato se objective-tracker viene caricato prima di onboarding-core', () => {
        // Carichiamo SOLO objective-tracker.js senza onboarding-core.js
        const { sandbox } = createGameEnv(['objective-tracker.js']);

        assert.equal(sandbox.window.ceOnb, undefined, 'ceOnb non deve essere definito in questo test');
        assert.ok(typeof sandbox.window._earlyGates === 'function', '_earlyGates deve funzionare anche in fallback');

        const fallbackGates = sandbox.window._earlyGates();
        assert.equal(fallbackGates.length, 7, 'il fallback deve coprire tutti i 7 gate precoci');
        assert.equal(fallbackGates.find(g => g.tab === 'finance')?.rides, 3);
        assert.equal(fallbackGates.find(g => g.tab === 'market')?.rides, 5);
        assert.equal(fallbackGates.find(g => g.tab === 'b2b')?.rides, 7);
        assert.equal(fallbackGates.find(g => g.tab === 'hq')?.rides, 9);
        assert.equal(fallbackGates.find(g => g.tab === 'contracts')?.rides, 11);
        assert.equal(fallbackGates.find(g => g.tab === 'infrastructure')?.rides, 15);
        assert.equal(fallbackGates.find(g => g.tab === 'tourism')?.rides, 18);
    });
});
