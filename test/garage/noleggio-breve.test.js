'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

// Banco di prova per il NOLEGGIO a breve termine dal showroom (showroom.rentCar).
// Regola del sistema: un'auto noleggiata si guida come una di proprieta' (fa corse)
// ma non si vende e torna al concessionario alla scadenza. Il costo si paga SUBITO
// per intero via window.CE_money.spend — mai a rate (a differenza del leasing
// confirmLease, che invece addebita un dailyCost giorno per giorno).

function veicoloCatalogo(sandbox) {
    // Nexus H-Line: l'entry-level che un giocatore nuovo deve poter noleggiare.
    return vm.runInContext('STELLAR_VOLT_CATALOG.find(v => v.id === "nexus_h_line")', sandbox);
}

describe('azioni/noleggio-breve — rentCar', () => {
    test('assegna l\'auto con scadenza corretta e scala il costo intero UNA volta sola via CE_money', () => {
        const chiamate = [];
        const { sandbox } = freshEnv();
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => {
            chiamate.push({ importo, motivo });
            return origSpend(importo, motivo);
        };
        const v = veicoloCatalogo(sandbox);
        sandbox.gameState.cash = sandbox._srmRentPrice(v.price, 3) + 200;
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.rentCar('nexus_h_line', 3);

        assert.equal(chiamate.length, 1, 'il pagamento passa da CE_money una volta sola');
        assert.equal(chiamate[0].importo, sandbox._srmRentPrice(v.price, 3), 'importo = prezzo del noleggio, pagato tutto subito');
        assert.equal(chiamate[0].motivo, 'rent_car');

        const car = sandbox.gameState.fleet[sandbox.gameState.fleet.length - 1];
        assert.equal(sandbox.gameState.fleet.length, flottaPrima + 1, 'l\'auto entra in flotta');
        assert.equal(car.vehicleClass, 'nexus_h_line');
        assert.equal(car.isLease, true, 'flag leasing: sblocca l\'uso come auto di flotta e blocca la vendita');
        assert.equal(car.dailyCost, 0, 'nessun canone giornaliero: il costo è stato pagato upfront');
        assert.equal(car.leaseElapsedDays, 0);
        assert.equal(car.rentalDays, 3, 'la scadenza è a 3 giorni, non mesi');
    });

    test('fondi insufficienti: rifiutato senza scalare nulla né toccare la flotta', () => {
        const chiamate = [];
        const { sandbox } = freshEnv();
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => {
            const esito = origSpend(importo, motivo);
            chiamate.push({ importo, esito });
            return esito;
        };
        const v = veicoloCatalogo(sandbox);
        sandbox.gameState.cash = sandbox._srmRentPrice(v.price, 3) - 1;
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.rentCar('nexus_h_line', 3);

        // spend viene interrogata una volta sola e rifiuta: è lei la guardia dei fondi.
        assert.equal(chiamate.length, 1, 'un solo tentativo di spesa');
        assert.equal(chiamate[0].esito, false, 'la spesa è stata rifiutata');
        assert.equal(sandbox.gameState.fleet.length, flottaPrima, 'flotta intatta');
        assert.equal(sandbox.gameState.cash, sandbox._srmRentPrice(v.price, 3) - 1, 'cassa intatta');
    });

    test('durata non tra quelle previste: rifiutato senza muovere nulla', () => {
        const { sandbox } = freshEnv();
        const v = veicoloCatalogo(sandbox);
        sandbox.gameState.cash = sandbox._srmRentPrice(v.price, 3) + 99999;
        const flottaPrima = sandbox.gameState.fleet.length;
        const cashPrima = sandbox.gameState.cash;

        sandbox.rentCar('nexus_h_line', 10); // 10 giorni non è un'offerta

        assert.equal(sandbox.gameState.fleet.length, flottaPrima);
        assert.equal(sandbox.gameState.cash, cashPrima);
    });

    test('a scadenza il veicolo esce dalla flotta (torna al concessionario)', () => {
        const { sandbox } = freshEnv();
        const v = veicoloCatalogo(sandbox);
        sandbox.gameState.cash = sandbox._srmRentPrice(v.price, 3) + 100000;
        sandbox.rentCar('nexus_h_line', 3);
        const idNoleggiata = sandbox.gameState.fleet[sandbox.gameState.fleet.length - 1].id;

        // Due giorni di routine: l'auto deve restare (scadenza a 3).
        sandbox.processDailyRoutines();
        sandbox.processDailyRoutines();
        assert.ok(sandbox.gameState.fleet.some(c => c.id === idNoleggiata), 'prima della scadenza resta in flotta');

        // Terzo giorno: scade e viene rimossa.
        sandbox.processDailyRoutines();
        assert.ok(!sandbox.gameState.fleet.some(c => c.id === idNoleggiata),
            'alla scadenza l\'auto noleggiata esce dalla flotta');
    });

    test('il noleggio segna isLease: la vendita resta bloccata come per le auto in leasing', () => {
        const { sandbox } = freshEnv();
        const v = veicoloCatalogo(sandbox);
        sandbox.gameState.cash = sandbox._srmRentPrice(v.price, 3) + 100000;
        sandbox.rentCar('nexus_h_line', 3);
        const car = sandbox.gameState.fleet[sandbox.gameState.fleet.length - 1];

        // p2p-market.js rifiuta di listare le auto isLease ("Le auto in leasing
        // non si vendono") e ui-market le esclude: il contratto del noleggio è
        // lo stesso flag, quindi la stessa protezione copre entrambe.
        assert.equal(car.isLease, true);
    });
});

describe('azioni/noleggio-breve — calibrazione prezzi', () => {
    test('offre solo le 5 durate richieste: 3, 5, 7, 14, 30 giorni', () => {
        const { sandbox } = freshEnv();
        // spread: l'array vive nel realm VM e deepStrictEqual confronta anche i prototipi.
        assert.deepEqual([...sandbox.RENTAL_DURATIONS], [3, 5, 7, 14, 30]);
    });

    test('la durata più corta si paga con i ~5.000€ del giocatore nuovo', () => {
        const { sandbox } = freshEnv();
        const v = veicoloCatalogo(sandbox);
        assert.ok(sandbox._srmRentPrice(v.price, 3) <= 5000,
            `noleggio 3 giorni = ${sandbox._srmRentPrice(v.price, 3)}: deve restare sotto 5000`);
    });

    test('proiettata sui tempi lunghi costa più del comprare (è noleggio, non affare)', () => {
        const { sandbox } = freshEnv();
        for (const id of ['nexus_h_line', 'stellar_e_exec']) {
            const v = vm.runInContext(`STELLAR_VOLT_CATALOG.find(v => v.id === "${id}")`, sandbox);
            const prezzo30g = sandbox._srmRentPrice(v.price, 30);
            assert.ok(prezzo30g > v.price,
                `${id}: 30 giorni (${prezzo30g}) devono costare più dell'acquisto (${v.price})`);
            // e il prezzo è crescente nelle durate, senza mai scontare sotto il buy
            const prezzi = [...sandbox.RENTAL_DURATIONS].map(g => sandbox._srmRentPrice(v.price, g));
            const ordinati = [...prezzi].sort((a, b) => a - b);
            assert.deepEqual(prezzi, ordinati, `${id}: più giorni = più soldi, sempre`);
        }
    });
});
