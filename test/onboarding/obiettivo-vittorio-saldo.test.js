'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('../../test-support/game-env.js');

// Regressioni banner/obiettivo "Ripaga Vittorio": la barra obiettivi (objective-tracker)
// non deve mai mostrare "devi €0": se il residuo è a zero il passo è COMPLETATO e il
// widget deve lasciare il posto all'obiettivo successivo.
describe('onboarding/obiettivo-vittorio-saldo — il banner sparisce quando il debito è a saldo', () => {

    // Stato minimo da "nuova partita" che arriva al ramo 2b) di currentObjective():
    // prestigio 0 (non veterano), almeno 1 autista non-CEO (step assunzione superato),
    // cassa ≥ 80 così la condizione di mostrare Vittorio è soddisfatta.
    function envConDebito(outstanding) {
        const { sandbox } = createGameEnv(['onboarding-core.js', 'vittorio.js', 'objective-tracker.js']);
        sandbox.window.gameState = {
            day: 1,
            cash: 100,
            prestige: 0,
            reputation: 5.0,
            drivers: [{ id: 'dip-1', name: 'Ragazzo di quartiere' }],
            fleet: [],
            questStats: { totalRides: 0 },
            claimableQuests: [],
            vittorioDebt: {
                principal: 500, outstanding, status: 'active',
                startDay: 1, lastAccrualDay: 1, lastNagDay: 1, finalNoticeShown: false,
            },
        };
        return sandbox;
    }

    function rendi(sandbox) {
        sandbox.window.renderObjectiveTracker();
        return sandbox.document.getElementById('obj-tracker');
    }

    test('a debito saldato (residuo 0 ma stato ancora "active") il banner NON mostra "devi €0"', () => {
        const sandbox = envConDebito(0);
        const el = rendi(sandbox);
        assert.ok(el, 'il tracker deve essere montato nel DOM');
        assert.ok(
            !el.textContent.includes('Ripaga Vittorio'),
            `con residuo 0 il banner deve sparire/aggiornarsi, mostra invece: "${el.textContent}"`
        );
    });

    test('con debito residuo e contanti a sufficienza il banner resta visibile con l\'importo giusto', () => {
        const sandbox = envConDebito(515);
        const el = rendi(sandbox);
        assert.ok(el.textContent.includes('Ripaga Vittorio'), 'il banner deve restare per il debito aperto');
        assert.ok(el.textContent.includes('515'), `l\'importo residuo deve comparire, letto: "${el.textContent}"`);
    });

    test('dopo repayVittorio a saldo intero il widget lascia il posto al prossimo obiettivo', () => {
        const sandbox = envConDebito(200);
        sandbox.window.gameState.cash = 200;

        let el = rendi(sandbox);
        assert.ok(el.textContent.includes('Ripaga Vittorio'), 'prima del pagamento il banner deve esserci');

        sandbox.window.repayVittorio(200);

        const debito = sandbox.window._vittorioDebt();
        assert.equal(debito.status, 'repaid', 'repayVittorio a saldo deve chiudere lo stato');
        el = rendi(sandbox);
        assert.ok(
            !el.textContent.includes('Ripaga Vittorio'),
            `dopo il saldo integrale il banner non deve tornare, letto: "${el.textContent}"`
        );
    });
});
