'use strict';
/* ============================================================================
   test/guardrail/spenddc-rifiuto-server.test.js

   Regressione: una spesa Driver Coins RIFIUTATA dal server non deve lasciare
   ne' il saldo scalato ne' il giocatore all'oscuro. spendDC scala il saldo in
   locale e risponde `true` subito (il chiamante applica cosi' l'effetto
   comprato); se la RPC poi fallisce — tipicamente perche' il browser credeva
   di avere piu' coin di quanti ne aveva davvero — il rifiuto deve tornare
   visibile: avviso al giocatore e saldo riportato al valore vero.

   Copre ENTRAMBE le forme in cui il rifiuto arriva a money.js:
     - promessa rigettata (mock diretti, errori di rete),
     - promessa risolta con `null`: il vero serverState.js trasforma l'errore
       della RPC in null (_rpc), quindi il .then di spendDC riceve null e il
       .catch non scatta mai.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** ServerState finto che registra il tentativo e RIFIUTA la spesa DC. */
function ambienteCheRifiuta(risposta) {
    const tentativi = [];
    const { sandbox, notifications } = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                tentativi.push({ motivo, n });
                if (risposta === 'rigetta') throw new Error('Driver Coins insufficienti.');
                return risposta; // null: la forma con cui il vero serverState segnala il rifiuto
            },
        },
    });
    return { sandbox, gs: sandbox.gameState, notifications, tentativi };
}

describe('CE_money.spendDC — rifiuto del server su una spesa Driver Coins', () => {

    test('promessa rigettata: avviso al giocatore e saldo ripristinato', async () => {
        const { sandbox, gs, notifications, tentativi } = ambienteCheRifiuta('rigetta');
        gs.driverCoins = 50;
        sandbox.CE_money.spendDC(4, 'energia');
        await new Promise(r => setImmediate(r));
        assert.equal(tentativi.length, 1, 'la RPC di spesa deve essere stata tentata');
        assert.ok(notifications.some(n => n.type === 'error'),
            'il giocatore deve ricevere un avviso per la spesa rifiutata');
        assert.equal(gs.driverCoins, 50,
            'il saldo non deve restare scalato per una spesa che il server non ha accettato');
    });

    test('promessa risolta con null (forma _rpc): stesso trattamento del rigetto', async () => {
        const { sandbox, gs, notifications, tentativi } = ambienteCheRifiuta(null);
        gs.driverCoins = 50;
        sandbox.CE_money.spendDC(4, 'energia');
        await new Promise(r => setImmediate(r));
        assert.equal(tentativi.length, 1, 'la RPC di spesa deve essere stata tentata');
        assert.ok(notifications.some(n => n.type === 'error'),
            'anche un rifiuto mascherato da null deve arrivare al giocatore');
        assert.equal(gs.driverCoins, 50,
            'il saldo deve tornare al valore precedente allo scalamento non autorizzato');
    });
});
