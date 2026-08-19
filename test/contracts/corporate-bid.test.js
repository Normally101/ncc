'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function primeTender(sandbox, overrides = {}) {
    sandbox.gameState.corporateTenders = [{
        id: 't1', status: 'open',
        company: { tender_requirements: { required_vehicle_type: 'standard', min_fleet_size: 1, min_reputation: 0 } },
        playerBid: null,
        ...overrides,
    }];
    return sandbox.gameState.corporateTenders[0];
}

describe('contracts/corporate-bid — pledge su un bando corporate', () => {
    test('piazzare un\'offerta scala il cash del pledge esatto', () => {
        const { sandbox } = freshEnv();
        primeTender(sandbox);
        sandbox.gameState.cash = 100000;
        const cashBefore = sandbox.gameState.cash;

        sandbox.CE_placeBid('t1', 10000);

        assert.equal(sandbox.gameState.cash, cashBefore - 10000, 'il cash deve scalare esattamente del pledge');
        assert.equal(sandbox.gameState.corporateTenders[0].playerBid.pledgedCash, 10000);
    });

    test('REGRESSIONE (fix 6 agosto 2026): rialzare un\'offerta esistente non duplica il pledge', () => {
        // Prima del fix (vedi HANDOFF.md "26 fix mergiati", denaro duplicabile nei bandi
        // corporate): il rimborso del pledge precedente avveniva PRIMA della validazione
        // fondi, e uscire a metà lasciava un pledge rimborsato ma ancora registrato —
        // annullare dopo lo rimborsava una seconda volta. Qui verifichiamo il comportamento
        // net corretto: rialzare un'offerta scala solo la DIFFERENZA, non l'intero nuovo importo.
        const { sandbox } = freshEnv();
        primeTender(sandbox);
        sandbox.gameState.cash = 100000;

        sandbox.CE_placeBid('t1', 10000);
        const cashAfterFirst = sandbox.gameState.cash; // 90000

        sandbox.CE_placeBid('t1', 15000); // rialza di 5000

        assert.equal(sandbox.gameState.cash, cashAfterFirst - 5000,
            'rialzare l\'offerta deve scalare solo la differenza (5000), non il nuovo importo intero (15000) sopra a quanto già scalato');
        assert.equal(sandbox.gameState.corporateTenders[0].playerBid.pledgedCash, 15000);
    });

    test('offerta oltre i fondi disponibili (considerando il pledge già scalato) viene rifiutata senza mutare il cash', () => {
        const { sandbox } = freshEnv();
        primeTender(sandbox);
        sandbox.gameState.cash = 5000;
        const cashBefore = sandbox.gameState.cash;

        sandbox.CE_placeBid('t1', 50000); // ben oltre i fondi disponibili

        assert.equal(sandbox.gameState.cash, cashBefore, 'fondi insufficienti: cash invariato');
        assert.equal(sandbox.gameState.corporateTenders[0].playerBid, null, 'fondi insufficienti: nessuna offerta registrata');
    });

    test('annullare un\'offerta rimborsa il pledge, e un secondo annullamento non rimborsa due volte', () => {
        const { sandbox } = freshEnv();
        primeTender(sandbox);
        sandbox.gameState.cash = 100000;
        sandbox.CE_placeBid('t1', 10000);
        const cashAfterBid = sandbox.gameState.cash; // 90000

        sandbox.CE_cancelBid('t1');
        assert.equal(sandbox.gameState.cash, cashAfterBid + 10000, 'il pledge deve essere rimborsato per intero');

        const cashAfterCancel = sandbox.gameState.cash;
        sandbox.CE_cancelBid('t1'); // doppio click / retrigger

        assert.equal(sandbox.gameState.cash, cashAfterCancel, 'un secondo annullamento non deve rimborsare di nuovo (playerBid è già null)');
    });
});
