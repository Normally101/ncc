'use strict';
/* ============================================================================
   Banco di prova dei CONTRATTI VIP accettabili (definiti in vip-clients.js):
   acceptVipEmiro, acceptVipErede, acceptVipGarante, acceptVipGrigori,
   acceptVipOnorevole, acceptVipPlatinum.

   Queste azioni NON muovono cassa al momento dell'accettazione: creano una
   corsa pendente e chiudono l'email. Quindi qui si verifica che
   - la corsa pendente nasce con i dati giusti dell'email (prezzo, classe);
   - l'email viene chiusa UNA volta sola;
   - i rifiuti (veicolo/autista mancanti, email inesistente o gia' risolta)
     non toccano NESSUNO stato di gioco.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function preparaMondo() {
    const { sandbox, notifications, stopAllIntervals } = freshEnv();
    const gs = sandbox.gameState;
    gs.cash = 1_000_000;
    // Il rendering non c'entra con le conseguenze dei contratti.
    sandbox.updateUI = function () {};
    sandbox.saveGame = function () {};

    const mondo = { sandbox, gs, notifications, stopAllIntervals };
    mondo.syncCashCalls = [];
    const origSyncCash = sandbox.ServerState.syncCash.bind(sandbox.ServerState);
    sandbox.ServerState.syncCash = (cash) => {
        mondo.syncCashCalls.push(cash);
        return origSyncCash(cash);
    };
    return mondo;
}

// Email VIP non letta, come la crea _vipPushEmail in vip-clients.js.
function pushEmailVip(gs, id, tipo, vipData) {
    const email = {
        id,
        sender: 'Test VIP',
        subject: 'contratto vip',
        type: tipo,
        status: 'unread',
        vipData,
        expiresAt: (gs.day * 24 + gs.hour) + 4,
    };
    gs.emails.push(email);
    return email;
}

describe('contratti VIP accettabili — esistenza nel banco', () => {

    test('le sei azioni di accettazione esistono su window', () => {
        const { sandbox, stopAllIntervals } = preparaMondo();
        try {
            for (const nome of [
                'acceptVipEmiro', 'acceptVipErede', 'acceptVipGarante',
                'acceptVipGrigori', 'acceptVipOnorevole', 'acceptVipPlatinum',
            ]) {
                assert.equal(typeof sandbox.window[nome], 'function', `${nome} deve essere una funzione`);
            }
        } finally {
            stopAllIntervals();
        }
    });
});

describe('acceptVipGrigori', () => {

    test('email inesistente: nessuno stato toccato', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            sandbox.acceptVipGrigori(99999);
            assert.equal(gs.pendingRides.length, 0);
            assert.deepEqual(syncCashCalls, []);
        } finally {
            stopAllIntervals();
        }
    });

    test('senza veicolo presidenziale: rifiuto pulito', () => {
        const { sandbox, gs, syncCashCalls, stopAllIntervals } = preparaMondo();
        try {
            const email = pushEmailVip(gs, 101, 'vip_grigori', { fromId: 'airport', toId: 'hotel', price: 8000 });
            sandbox.acceptVipGrigori(101);
            assert.equal(email.status, 'unread');
            assert.equal(gs.pendingRides.length, 0);
            assert.deepEqual(syncCashCalls, []);
        } finally {
            stopAllIntervals();
        }
    });
});
