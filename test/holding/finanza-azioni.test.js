'use strict';
/* ============================================================================
   test/holding/finanza-azioni.test.js

   Prima copertura reale delle AZIONI PLAYER di engine-finance.js
   (prestiti, borsa, broker, shorting, lobbying, venture capital).
   Ogni azione che muove denaro DEVE passare da CE_money e sincronizzare
   la cassa col server tramite ServerState.syncCash: i test diventano ROSSI
   se la sincronizzazione viene tolta.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupFinanzaEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('engine-finance — prestiti', () => {

    describe('takeLoan', () => {
        test('prestito approva: accreditato dal server e registrato nei loans', async () => {
            const { sandbox, gs, syncedCash } = setupFinanzaEnv();
            gs.creditScore = 300; // tier BASIC, fido 100k
            gs.cash = 1000;

            sandbox.takeLoan(5000);
            await new Promise(r => setImmediate(r));

            // Il denaro arriva SOLO via CE_money.earn -> la cassa locale cresce...
            assert.equal(gs.cash, 6000);
            // ...e la previsione viene comunicata al server.
            assert.deepEqual(syncedCash, [6000]);
            const loan = gs.loans.find(l => l.original === 5000);
            assert.ok(loan, 'il prestito deve finire in gameState.loans');
            assert.equal(loan.amount, 5000);
            assert.equal(loan.remaining, 5000);
        });

        test('somma dei prestiti oltre il fido del tier: rifiutata, nessun denaro mosso', async () => {
            const { sandbox, gs, syncedCash } = setupFinanzaEnv();
            gs.creditScore = 300; // fido totale 100k
            gs.cash = 1000;
            gs.loans = [{ id: 900, original: 98000, amount: 98000, remaining: 98000, rate: 0.12 }];

            sandbox.takeLoan(5000); // 98000 + 5000 > 100000
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000, 'nessun accredito se il fido complessivo non basta');
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 1, 'nessun nuovo prestito');
        });
    });

    describe('repayLoan', () => {
        test('estinzione scala il debito dalla cassa, rimuove il prestito e dà +20 credit score', async () => {
            const { sandbox, gs, syncedCash } = setupFinanzaEnv();
            gs.cash = 5000;
            gs.creditScore = 300;
            gs.loans = [{ id: 7, original: 2000, amount: 2000, remaining: 2000, rate: 0.12 }];

            sandbox.repayLoan(7);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 3000);
            assert.deepEqual(syncedCash, [3000]);
            assert.deepEqual(gs.loans, [], 'il prestito estinto va rimosso');
            assert.equal(gs.creditScore, 320);
        });

        test('fondi insufficienti: il prestito resta e nessun denaro si muove', async () => {
            const { sandbox, gs, syncedCash } = setupFinanzaEnv();
            gs.cash = 500;
            gs.loans = [{ id: 7, original: 2000, amount: 2000, remaining: 2000, rate: 0.12 }];

            sandbox.repayLoan(7);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 1);
        });
    });
});
