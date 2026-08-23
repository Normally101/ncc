'use strict';
/* ============================================================================
   test/funzioni/acquistoPacchettiExecutiveClub.test.js — regressione cassa EC

   Vlad (playtest): cliccando "Acquista" su un pacchetto Executive Club i DC
   arrivano senza NESSUN pagamento: _dcSimPurchase accreditava direttamente via
   CE_money.earnDC. Bypass totale della cassa.

   Regole verificate qui:
   (a) il click sul pacchetto NON accredita nulla finche' il pagamento non e'
       confermato;
   (b) i DC arrivano SOLO dopo una spesa reale tracciata da CE_money.spend
       (porta unica, money.js);
   (c) senza fondi la conferma rifiuta e non accredita nulla.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('acquisto pacchetti Executive Club — nessun DC senza pagamento confermato', () => {
    let env, sandbox, gs;
    let rpcSpendCalls, rpcAddCalls, cashSyncCalls;

    beforeEach(() => {
        rpcSpendCalls = [];
        rpcAddCalls = [];
        cashSyncCalls = [];
        env = freshEnv({
            serverState: {
                spendDriverCoins: async (motivo, n) => {
                    rpcSpendCalls.push({ motivo, n });
                    return { ok: true, driver_coins: (sandbox.gameState.driverCoins || 0) };
                },
                addDriverCoins: async (n, motivo) => {
                    rpcAddCalls.push({ motivo, n });
                    return { ok: true, driver_coins: (sandbox.gameState.driverCoins || 0) };
                },
                syncCash: async (cash) => { cashSyncCalls.push(cash); },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('(a) il click sul pacchetto NON accredita DC finche\' il pagamento non e\' confermato', () => {
        gs.driverCoins = 0;
        gs.cash = 1000000;

        // Cosa fa il bottone "Acquista": _dcSimPurchase(220) per il Corporate Pack.
        sandbox._dcSimPurchase(220);

        assert.equal(gs.driverCoins, 0, 'nessun DC deve arrivare prima della conferma');
        assert.equal(rpcAddCalls.length, 0, 'nessuna RPC di accredito prima della conferma');
    });

    test('(b) i DC arrivano SOLO dopo la spesa reale tracciata da CE_money.spend', () => {
        gs.driverCoins = 10;
        gs.cash = 500;

        // Conferma pagamento del Corporate Pack: 220 DC a €19,99.
        sandbox._dcConfirmPurchase(220, 19.99);

        // La spesa passa dalla porta unica (cash scalata e sincronizzata al server).
        assert.ok(Math.abs(gs.cash - (500 - 19.99)) < 1e-9, 'il pagamento deve scalare la cassa');
        assert.equal(cashSyncCalls.length, 1, 'la spesa deve essere comunicata al server');
        // Solo dopo il pagamento l'accredito DC, tracciato dalla RPC dedicata.
        assert.equal(rpcAddCalls.length, 1, 'l\'accredito DC deve passare dalla RPC');
        assert.equal(rpcAddCalls[0].n, 220);
        assert.equal(gs.driverCoins, 230);
    });

    test('(c) conferma senza fondi sufficienti: nessun DC, nessun movimento', () => {
        gs.driverCoins = 10;
        gs.cash = 5; // servono 19.99

        sandbox._dcConfirmPurchase(220, 19.99);

        assert.equal(gs.cash, 5, 'la cassa non si muove');
        assert.equal(gs.driverCoins, 10, 'nessun DC accreditato');
        assert.equal(rpcAddCalls.length, 0);
        assert.equal(cashSyncCalls.length, 0);
    });
});
