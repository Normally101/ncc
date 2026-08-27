'use strict';
// COLLAUDO PROFONDO — acquistare una licenza territoriale, dall'inizio alla fine.
//
// Non un test per funzione: qui si esercita il FLUSSO completo come lo vive un
// giocatore — sblocca una regione costa il prezzo giusto via RPC del server e la
// regione risulta sbloccata; con fondi insufficienti è rifiutata senza addebito.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('collaudo/acquista-licenza-territoriale — sblocca regione (end-to-end)', () => {
    test('sbloccare una regione costa il prezzo giusto via RPC e la regione risulta sbloccata', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        // Setup: servono reputazione e cassa sufficienti per 'umbria'
        // umbria: price=10000, repReq=0.8
        gs.reputation = 1.0;
        gs.cash = 50000;

        const cassaPrima = gs.cash;
        const regioniPrima = [...gs.unlockedRegions];

        // Azione: compra la licenza per l'Umbria
        await sandbox.buyRegion('umbria');

        // Verifica: il prezzo è stato scalato ESATTAMENTE una volta (porta unica / RPC)
        assert.equal(gs.cash, cassaPrima - 10000,
            'sbloccare deve scalare esattamente il prezzo della regione (porta unica / RPC), né più né meno');

        // Verifica: la regione risulta sbloccata
        assert.ok(gs.unlockedRegions.includes('umbria'),
            'la regione sbloccata deve finire in unlockedRegions');

        // Verifica: invariante — nessuna altra regione è stata toccata
        assert.equal(gs.unlockedRegions.length, regioniPrima.length + 1,
            'una sola regione deve essere stata aggiunta, le altre restano invariate');
    });

    test('con fondi insufficienti lo sblocco è rifiutato SENZA addebito', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        // Setup: reputazione ok, ma cassa MENO del prezzo (umbria = 10000)
        gs.reputation = 1.0;
        gs.cash = 5000;

        const cassaPrima = gs.cash;
        const regioniPrima = [...gs.unlockedRegions];

        // Azione: prova a comprare senza soldi
        await sandbox.buyRegion('umbria');

        // Verifica: NESSUN addebito (la RPC non deve nemmeno essere chiamata / deve fallire)
        assert.equal(gs.cash, cassaPrima,
            'con fondi insufficienti non deve esserci ALCUN addebito — nemmeno tentato');

        // Verifica: la regione NON risulta sbloccata
        assert.ok(!gs.unlockedRegions.includes('umbria'),
            'la regione NON deve finire in unlockedRegions se il pagamento fallisce');

        // Verifica: invariante — stato invariato (confronto per contenuto, non riferimento)
        assert.ok(gs.unlockedRegions.length === regioniPrima.length &&
            gs.unlockedRegions.every((r, i) => r === regioniPrima[i]),
            'lo stato delle regioni sbloccate deve restare identico al prima');
    });

    test('con reputazione insufficiente lo sblocco è rifiutato SENZA addebito', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        // Setup: cassa ok, ma reputazione SOTTO la soglia (umbria richiede 0.8★)
        gs.reputation = 0.5;
        gs.cash = 50000;

        const cassaPrima = gs.cash;
        const regioniPrima = [...gs.unlockedRegions];

        // Azione: prova a comprare senza reputazione
        await sandbox.buyRegion('umbria');

        // Verifica: NESSUN addebito
        assert.equal(gs.cash, cassaPrima,
            'con reputazione insufficiente non deve esserci ALCUN addebito');

        // Verifica: la regione NON risulta sbloccata
        assert.ok(!gs.unlockedRegions.includes('umbria'),
            'la regione NON deve finire in unlockedRegions se la reputazione non basta');

        // Verifica: stato invariato (confronto per contenuto, non riferimento)
        assert.ok(gs.unlockedRegions.length === regioniPrima.length &&
            gs.unlockedRegions.every((r, i) => r === regioniPrima[i]),
            'lo stato delle regioni sbloccate deve restare identico al prima');
    });

    test('regione inesistente non fa nulla e non muove denaro', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.reputation = 10;
        gs.cash = 50000;

        const cassaPrima = gs.cash;
        const regioniPrima = [...gs.unlockedRegions];

        // Azione: id regione che non esiste
        await sandbox.buyRegion('regione_inesistente');

        // Verifica: nessun addebito, nessuna regione aggiunta
        assert.equal(gs.cash, cassaPrima);
        assert.ok(gs.unlockedRegions.length === regioniPrima.length &&
            gs.unlockedRegions.every((r, i) => r === regioniPrima[i]),
            'lo stato delle regioni sbloccate deve restare identico al prima');
    });

    test('regione già sbloccata non fa nulla e non muove denaro', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        // Lazio è già sbloccato di default
        gs.reputation = 10;
        gs.cash = 50000;

        const cassaPrima = gs.cash;
        const regioniPrima = [...gs.unlockedRegions];

        // Azione: riprova a sbloccare lazio
        await sandbox.buyRegion('lazio');

        // Verifica: nessun addebito, nessuna duplicazione
        assert.equal(gs.cash, cassaPrima);
        assert.ok(gs.unlockedRegions.length === regioniPrima.length &&
            gs.unlockedRegions.every((r, i) => r === regioniPrima[i]),
            'lo stato delle regioni sbloccate deve restare identico al prima');
        assert.equal(gs.unlockedRegions.filter(r => r === 'lazio').length, 1,
            'lazio non deve essere duplicato in unlockedRegions');
    });
});