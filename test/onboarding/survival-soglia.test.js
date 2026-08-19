'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('../../test-support/game-env.js');

const ONBOARDING_FILES = [
    'security.js',
    'ce-actions.js',
    'onboarding-core.js',
    'zero-to-hero.js',
];

describe('onboarding/survival-soglia — allineamento soglia survival fra onboarding-core e zero-to-hero', () => {
    test('la soglia dell\'evento capitalismo in zero-to-hero coincide con il termine della fase survival in onboarding-core', () => {
        const { sandbox } = createGameEnv(ONBOARDING_FILES);

        // 1. Ricava la soglia di fine fase survival direttamente dal comportamento reale di ceOnb.phase()
        sandbox.gameState = {
            energy: 100,
            cash: 0,
            questStats: { totalRides: 0 },
            prestige: 0,
        };

        let onbSurvivalThreshold = null;
        for (let r = 0; r <= 100; r++) {
            sandbox.gameState.questStats.totalRides = r;
            const currentPhase = sandbox.ceOnb.phase();
            if (currentPhase !== 'survival') {
                onbSurvivalThreshold = r;
                break;
            }
        }

        assert.ok(
            onbSurvivalThreshold !== null,
            'ceOnb.phase() deve uscire dalla fase "survival" a una soglia finita di totalRides'
        );

        // 2. Ricava a quale numero di corse executeManualDrive scatena triggerCapitalismEvent in zero-to-hero.js
        sandbox.gameState = {
            energy: 100,
            cash: 0,
            questStats: { totalRides: 0 },
            prestige: 0,
        };

        let z2hCapitalismTriggerRides = null;
        let callCount = 0;
        sandbox.triggerCapitalismEvent = () => {
            callCount++;
            z2hCapitalismTriggerRides = sandbox.gameState.questStats.totalRides;
        };

        // Simula le corse manuali dall'inizio
        const maxRidesToSimulate = onbSurvivalThreshold + 10;
        for (let i = 0; i < maxRidesToSimulate; i++) {
            sandbox.gameState.energy = 100;
            sandbox.executeManualDrive();
        }

        assert.equal(
            callCount,
            1,
            `triggerCapitalismEvent deve essere chiamato esattamente una volta durante la progressione (chiamato ${callCount} volte)`
        );

        assert.equal(
            z2hCapitalismTriggerRides,
            onbSurvivalThreshold,
            `La soglia dell'evento capitalismo in zero-to-hero.js (${z2hCapitalismTriggerRides}) deve coincidere con la fine della fase survival in onboarding-core.js (${onbSurvivalThreshold})`
        );
    });
});
