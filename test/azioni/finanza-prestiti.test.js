'use strict';
// Attivazione delle azioni finanziarie che muovono denaro: takeLoan, repayLoan,
// repayVittorio, payFine, passLobbyLaw.
// Modello: test/economy/fine-payment-sync.test.js — stato minimo, funzione REALE
// nel banco (freshEnv), e la regola che conta: se il saldo si muove, una
// scrittura verso il server e' avvenuta, UNA VOLTA SOLA.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('azioni/finanza-prestiti — takeLoan', () => {
    test('takeLoan accredita il capitale una volta sola e avvisa il server', () => {
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: {
                // Il flusso reale NON ha una RPC dedicata al prestito: takeLoan
                // accredita via window.CE_money.earn, che poi scrive il saldo al
                // server con ServerState.syncCash. Se qualcuno introducesse anche
                // solo una seconda scrittura, questo test lo vede.
                takeLoan: async () => {
                    throw new Error('takeLoan non deve chiamare una RPC dedicata: passa da CE_money.earn');
                },
                syncCash: async (cash) => {
                    syncedCash = cash;
                    return { success: true, cash };
                },
            },
        });

        sandbox.gameState.creditScore = 300; // tier BASIC, fido 100.000
        sandbox.gameState.cash = 1000;

        sandbox.takeLoan(5000);

        assert.equal(sandbox.gameState.cash, 6000, 'il capitale deve finire in cassa una volta sola (niente doppio accredito)');
        assert.equal(sandbox.gameState.loans.length, 1, 'il prestito deve essere registrato tra quelli attivi');
        assert.equal(sandbox.gameState.loans[0].amount, 5000, 'il prestito registrato deve essere per l\'importo richiesto');
        assert.equal(syncedCash, 6000, 'saldo mosso => deve partire UNA scrittura col valore aggiornato');
    });

    test('takeLoan con importo non valido rifiuta senza toccare cassa ne\' server', () => {
        let scrittureServer = 0;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    scrittureServer++;
                    return { success: true, cash };
                },
            },
        });

        sandbox.gameState.creditScore = 300;
        sandbox.gameState.cash = 1000;

        sandbox.takeLoan(0);
        sandbox.takeLoan(-500);

        assert.equal(scrittureServer, 0, 'un importo non valido non deve produrre scritture');
        assert.equal(sandbox.gameState.cash, 1000, 'la cassa non deve muoversi su un prestito rifiutato');
    });

    test('takeLoan oltre il fido del proprio credit tier rifiuta', () => {
        let scrittureServer = 0;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    scrittureServer++;
                    return { success: true, cash };
                },
            },
        });

        sandbox.gameState.creditScore = 300; // BASIC: fido 100.000
        sandbox.gameState.cash = 0;

        sandbox.takeLoan(200000);

        assert.equal(sandbox.gameState.cash, 0, 'oltre il fido la cassa non si muove');
        assert.equal((sandbox.gameState.loans || []).length, 0, 'nessun prestito registrato oltre il fido');
        assert.equal(scrittureServer, 0, 'nessuna scrittura verso il server');
    });

    test('takeLoan ripetuto: due prestiti sotto il fido singolarmente ma sopra quello complessivo', () => {
        let scrittureServer = 0;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    scrittureServer++;
                    return { success: true, cash };
                },
            },
        });

        sandbox.gameState.creditScore = 300; // BASIC: fido complessivo 100.000
        sandbox.gameState.cash = 0;

        sandbox.takeLoan(90000); // entra
        sandbox.takeLoan(50000); // 90k + 50k sforano il fido complessivo: deve rifiutare

        assert.equal(sandbox.gameState.cash, 90000, 'solo il primo prestito deve essere accreditato');
        assert.equal(sandbox.gameState.loans.length, 1, 'il secondo prestito non deve essere registrato');
        assert.equal(scrittureServer, 1, 'una sola accettazione = una sola scrittura');
    });
});

describe('azioni/finanza-prestiti — repayLoan', () => {
    function preparaPrestito(sandbox, importo) {
        sandbox.gameState.creditScore = 300;
        sandbox.gameState.cash = 6000;
        sandbox.gameState.loans = [{ id: 7, original: importo, amount: importo, remaining: importo, rate: 0.12 }];
    }

    test('repayLoan salda il prestito: addebito una volta sola e scrittura server', () => {
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncedCash = cash;
                    return { success: true, cash };
                },
            },
        });
        preparaPrestito(sandbox, 5000);

        sandbox.repayLoan(7);

        assert.equal(sandbox.gameState.cash, 1000, 'il rimborso deve scalare la cassa una volta sola');
        assert.equal(sandbox.gameState.loans.length, 0, 'il prestito saldato va rimosso da quelli attivi');
        assert.equal(sandbox.gameState.creditScore, 320, 'saldo un prestito vale +20 Credit Score');
        assert.equal(syncedCash, 1000, 'saldo mosso => deve partire UNA scrittura col valore aggiornato');
    });

    test('repayLoan con fondi insufficienti non tocca ne\' prestito ne\' server', () => {
        let scrittureServer = 0;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    scrittureServer++;
                    return { success: true, cash };
                },
            },
        });
        preparaPrestito(sandbox, 5000);
        sandbox.gameState.cash = 100; // non basta per i 5000 del prestito

        sandbox.repayLoan(7);

        assert.equal(sandbox.gameState.cash, 100, 'senza fondi la cassa non si muove');
        assert.equal(sandbox.gameState.loans.length, 1, 'il prestito deve restare attivo');
        assert.equal(sandbox.gameState.creditScore, 300, 'nessun bonus Credit Score su un rimborso fallito');
        assert.equal(scrittureServer, 0, 'nessuna scrittura verso il server');
    });

    test('repayLoan su prestito inesistente non fa nulla', () => {
        let scrittureServer = 0;
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    scrittureServer++;
                    return { success: true, cash };
                },
            },
        });
        preparaPrestito(sandbox, 5000);

        sandbox.repayLoan(999);

        assert.equal(sandbox.gameState.cash, 6000, 'cassa invariata');
        assert.equal(sandbox.gameState.loans.length, 1, 'il prestito esistente deve restare');
        assert.equal(scrittureServer, 0, 'nessuna scrittura verso il server');
    });
});
