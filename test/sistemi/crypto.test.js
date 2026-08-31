'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/crypto — il modale di trading (crypto.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 25. Una azione:

   · cryptoOpenTradeModal(coinId, side) — apre il modale con l'input dell'importo
     per una moneta nota. Moneta sconosciuta → niente. Riapertura → il vecchio
     modale viene rimosso prima (niente doppioni nel DOM).

   `open\w*Modal` è stub no-op nell'env di default → si testa con render:true.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/crypto — cryptoOpenTradeModal (render vero)', () => {
    let env, w, doc;

    beforeEach(() => {
        env = freshEnv({ render: true });
        w = env.sandbox.window;
        R.conSchermo(env);
        doc = env.sandbox.document;
        w.showNotification = () => {};
        w._cryptoState.market = [
            { id: 'btc', name: 'Bitcoin', icon: '₿', price_eur: 50000 },
            { id: 'eth', name: 'Ether',   icon: 'Ξ', price_eur: 3000 },
        ];
        w._cryptoState.portfolio = [];
    });
    afterEach(() => env.stopAllIntervals());

    test('cryptoOpenTradeModal: moneta nota + "buy" → modale con input dell\'importo', () => {
        w.cryptoOpenTradeModal('btc', 'buy');
        assert.ok(doc.getElementById('crypto-trade-modal'), 'il modale non è stato creato');
        assert.ok(doc.getElementById('crypto-trade-input'), 'manca l\'input dell\'importo');
    });

    test('cryptoOpenTradeModal: moneta sconosciuta → nessun modale', () => {
        w.cryptoOpenTradeModal('doge', 'buy');
        assert.equal(doc.getElementById('crypto-trade-modal'), null);
    });

    test('cryptoOpenTradeModal: riapertura → un solo modale nel DOM', () => {
        w.cryptoOpenTradeModal('btc', 'buy');
        w.cryptoOpenTradeModal('eth', 'sell');
        assert.equal(doc.querySelectorAll('#crypto-trade-modal').length, 1, 'sono rimasti due modali');
    });
});
