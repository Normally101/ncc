'use strict';
// COLLAUDO PROFONDO — prendere un prestito e restituirlo, dall'inizio alla fine.
//
// Il flusso vero: prendere un prestito accredita il denaro (porta unica
// CE_money) e registra il debito; restituirlo scala l'importo, cancella il
// debito e migliora il credit score. Si verifica che prendere e restituire
// subito riporti ESATTAMENTE al punto di partenza — niente denaro creato o
// distrutto per sbaglio — e che un rimborso senza fondi non cancelli il debito.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('collaudo/prestito — prendi → restituisci (end-to-end)', () => {
    test('prendere e restituire subito riporta cassa e debiti al punto di partenza', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 0;
        gs.loans = [];
        const scorePrima = gs.creditScore || 300;
        const importo = 5000;

        // 1) PRENDI — la cassa sale dell'importo, il debito viene registrato.
        sandbox.takeLoan(importo);
        assert.equal(gs.loans.length, 1, 'il prestito deve essere registrato');
        assert.equal(gs.cash, importo, 'prendere un prestito accredita esattamente l\'importo (porta unica)');
        const prestito = gs.loans[0];

        // 2) RESTITUISCI — la cassa scala dell'importo dovuto, il debito sparisce.
        sandbox.repayLoan(prestito.id);
        assert.equal(gs.loans.length, 0, 'restituire deve cancellare il debito');
        assert.equal(gs.cash, importo - prestito.amount,
            'restituire scala esattamente il dovuto dalla porta unica');

        // 3) INVARIANTE — prendere e restituire subito è a somma zero sulla cassa.
        assert.equal(gs.cash, 0,
            'prendere e restituire subito deve riportare la cassa a com\'era: nessun denaro creato o distrutto');
        assert.ok((gs.creditScore || 300) > scorePrima,
            'saldare un prestito deve migliorare il credit score');
    });

    test('restituire senza fondi non cancella il debito', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 0;
        gs.loans = [];

        sandbox.takeLoan(5000);
        const prestito = gs.loans[0];
        gs.cash = 0; // speso tutto il prestito altrove: non c'è di che rimborsare

        sandbox.repayLoan(prestito.id);

        assert.equal(gs.loans.length, 1, 'senza fondi il debito deve restare');
        assert.equal(gs.cash, 0, 'un rimborso fallito non deve muovere la cassa');
    });

    test('un importo non valido non crea denaro né debito', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 0;
        gs.loans = [];

        sandbox.takeLoan(0);
        sandbox.takeLoan(-1000);

        assert.equal(gs.loans.length, 0, 'importi non validi non registrano prestiti');
        assert.equal(gs.cash, 0, 'importi non validi non accreditano nulla');
    });
});
