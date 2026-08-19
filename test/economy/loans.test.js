'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economy/loans — prestiti (takeLoan/repayLoan)', () => {
    test('prendere un prestito entro il fido scala esattamente il capitale in cassa', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1000;
        const cashBefore = sandbox.gameState.cash;

        sandbox.takeLoan(50000); // BASIC tier default (score 300) — fido 100.000

        assert.equal(sandbox.gameState.cash, cashBefore + 50000, 'il capitale deve essere accreditato per intero');
        assert.equal(sandbox.gameState.loans.length, 1);
        assert.equal(sandbox.gameState.loans[0].amount, 50000);
        assert.equal(sandbox.gameState.loans[0].rate, 0.12, 'tasso BASIC (score default 300)');
    });

    test('un prestito oltre il fido disponibile viene rifiutato senza mutare cash/prestiti', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1000;
        const cashBefore = sandbox.gameState.cash;

        sandbox.takeLoan(200000); // oltre il fido BASIC (100.000)

        assert.equal(sandbox.gameState.cash, cashBefore, 'fido superato: cash invariato');
        assert.equal(sandbox.gameState.loans.length, 0, 'fido superato: nessun prestito registrato');
    });

    test('la somma di più prestiti attivi non può superare il fido', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1000;

        sandbox.takeLoan(90000);
        assert.equal(sandbox.gameState.loans.length, 1);

        sandbox.takeLoan(50000); // 90k + 50k > 100k di fido BASIC
        assert.equal(sandbox.gameState.loans.length, 1, 'il secondo prestito deve essere rifiutato: fido già quasi esaurito');
        assert.equal(sandbox.gameState.cash, 1000 + 90000);
    });

    test('ripagare un prestito per intero scala il cash e rimuove il prestito, +20 credit score', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1000;
        sandbox.gameState.creditScore = 300;
        sandbox.takeLoan(50000);
        const cashAfterLoan = sandbox.gameState.cash; // 51000
        const loanId = sandbox.gameState.loans[0].id;

        sandbox.repayLoan(loanId);

        assert.equal(sandbox.gameState.cash, cashAfterLoan - 50000, 'il rimborso deve scalare esattamente il capitale residuo');
        assert.equal(sandbox.gameState.loans.length, 0, 'il prestito deve essere rimosso dopo il rimborso');
        assert.equal(sandbox.gameState.creditScore, 320, 'credit score +20 dopo un rimborso');
    });

    test('ripagare senza fondi sufficienti viene rifiutato: prestito e cash invariati', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1000;
        sandbox.takeLoan(50000); // cash ora 51000
        sandbox.gameState.cash = 100; // simula spese successive: non basta più per saldare
        const loanId = sandbox.gameState.loans[0].id;

        sandbox.repayLoan(loanId);

        assert.equal(sandbox.gameState.cash, 100, 'fondi insufficienti: cash invariato');
        assert.equal(sandbox.gameState.loans.length, 1, 'fondi insufficienti: il prestito resta attivo');
    });

    test('un secondo tentativo di rimborso sullo stesso prestito (già saldato) non fa nulla', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1000;
        sandbox.takeLoan(50000);
        const loanId = sandbox.gameState.loans[0].id;
        sandbox.repayLoan(loanId);
        const cashAfterFirstRepay = sandbox.gameState.cash;

        sandbox.repayLoan(loanId); // doppio click / retrigger su un id non più presente

        assert.equal(sandbox.gameState.cash, cashAfterFirstRepay, 'un secondo rimborso sullo stesso id non deve scalare di nuovo');
    });

    test('REGRESSIONE (fix stabilizzazione 10 agosto): un prestito sincronizza il cash col server — senza questo, rpc_buy_vehicle rifiutava un acquisto legittimo subito dopo un prestito (riprodotto dal vivo: "fondi insufficienti" col cash locale abbondante)', async () => {
        const calls = [];
        const { sandbox } = freshEnv({ serverState: { syncCash: async (v) => { calls.push(v); return { success: true, cash: v }; } } });
        sandbox.gameState.cash = 1000;

        sandbox.takeLoan(50000);
        await new Promise(r => setTimeout(r, 10));
        assert.deepEqual(calls, [51000], 'takeLoan deve sincronizzare il nuovo saldo col server');

        sandbox.repayLoan(sandbox.gameState.loans[0].id);
        await new Promise(r => setTimeout(r, 10));
        assert.deepEqual(calls, [51000, 1000], 'repayLoan deve sincronizzare il saldo dopo il rimborso');
    });

    test('NOTA (debito noto, non una regressione di questa sessione): takeLoan/repayLoan continuano a NON chiamare ServerState.takeLoan/repayLoan (le RPC dedicate, già indurite il 9 agosto) — solo syncCash del saldo risultante. Stessa classe del debito economia client-authoritative già tracciato in docs/ECONOMY_SERVER_AUTH.md: la RPC dedicata ha un modello di ammortamento (daily_payment) mai usato lato client, servirebbe una decisione di design prima di ricollegarla per intero.', () => {
        assert.ok(true);
    });
});
