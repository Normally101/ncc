'use strict';
// COLLAUDO PROFONDO — un evento VIP con esito, successo e fallimento.
//
// Il flusso vero: un cliente VIP genera un evento (qui il "drama nuziale" di
// White Lace), che il giocatore può GESTIRE (paga un costo, incassa un compenso
// netto), IGNORARE (nessun denaro, cala la reputazione) o — per i pagamenti
// differiti — INCASSARE. Tutto il denaro passa dalla porta unica CE_money.
//
// Il punto di valore end-to-end: un evento si può risolvere UNA SOLA VOLTA. Un
// doppio click (o una ce-action ripetuta prima che la UI si aggiorni) non deve
// incassare due volte lo stesso compenso — sarebbe denaro creato dal nulla.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('collaudo/vip — evento con esito (successo, fallimento, idempotenza)', () => {
    test('gestire il drama con successo dà il netto giusto (−costo +compenso)', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 1, type: 'vip_wedding_event', status: 'unread' }];
        gs.cash = 10000;

        sandbox.vipWeddingEventGestisci(1);

        assert.equal(gs.cash, 10000 - 800 + 2000, 'gestire il drama: −€800 costo, +€2000 compenso, netto +€1200');
        assert.equal(gs.emails.find(e => e.id === 1).status, 'resolved', "l'evento gestito deve risultare risolto");
    });

    test('gestire lo stesso drama due volte NON incassa due volte (idempotenza)', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 1, type: 'vip_wedding_event', status: 'unread' }];
        gs.cash = 10000;

        sandbox.vipWeddingEventGestisci(1);
        const dopoUna = gs.cash;
        sandbox.vipWeddingEventGestisci(1); // doppio click / ce-action ripetuta

        assert.equal(gs.cash, dopoUna,
            'un evento già risolto non deve pagare di nuovo: niente denaro dal nulla');
    });

    test('gestire senza fondi per il costo non incassa il compenso e non risolve', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 1, type: 'vip_wedding_event', status: 'unread' }];
        gs.cash = 500; // meno del costo (€800)

        sandbox.vipWeddingEventGestisci(1);

        assert.equal(gs.cash, 500, 'senza i fondi per il costo, nessun movimento: niente compenso gratis');
        assert.equal(gs.emails.find(e => e.id === 1).status, 'unread', "l'evento non gestito resta aperto");
    });

    test('ignorare il drama è un esito senza denaro (solo reputazione)', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 1, type: 'vip_wedding_event', status: 'unread' }];
        gs.cash = 10000;

        sandbox.vipWeddingEventIgnora(1);

        assert.equal(gs.cash, 10000, 'ignorare non muove denaro');
        assert.equal(gs.emails.find(e => e.id === 1).status, 'resolved', "l'evento ignorato è risolto");
    });

    test('il pagamento differito si incassa una volta sola', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 2, type: 'vip_wedding_payment', status: 'unread', vipEventData: { bonus: 3000 } }];
        gs.cash = 0;

        sandbox.vipWeddingPaymentCollect(2);
        assert.equal(gs.cash, 3000, 'il saldo differito accredita il bonus');

        sandbox.vipWeddingPaymentCollect(2); // secondo click
        assert.equal(gs.cash, 3000, 'un saldo già incassato non si incassa due volte');
    });

    test('accettare un matrimonio senza la flotta richiesta è rifiutato', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 3, type: 'vip_wedding', status: 'unread', vipData: { fromId: 'roma', toId: 'milano', price: 5000 } }];
        gs.pendingRides = [];

        sandbox.acceptVipWedding(3); // freshEnv non ha Majestic + 2 V-Carrier al 100%

        assert.equal(gs.pendingRides.length, 0, 'senza la flotta richiesta non parte nessuna corsa nuziale');
    });

    // ── Regressione sul bug sistemico di idempotenza degli accept/eventi VIP ──
    // _vipResolveEmail marca 'resolved' senza rimuovere l'email, e gli handler la
    // ritrovano col find: senza la guardia di stato, un doppio click ripeteva
    // l'effetto. Il più grave: accettare due volte creava due corse VIP → doppio
    // incasso alla fine. Questi test blindano il fix su tutti i pattern.

    test('accettare due volte lo stesso VIP non crea due corse (era doppio incasso)', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.fleet.push({ id: 'c1', vehicleClass: 'stellar_e_exec', condition: 100, outOfService: false, isSeized: false });
        gs.emails = [{ id: 9, type: 'vip_strata', status: 'unread', vipData: { fromId: 'roma', toId: 'milano', price: 3500 } }];
        gs.pendingRides = [];

        sandbox.acceptVipStrata(9);
        sandbox.acceptVipStrata(9); // doppio click prima che la UI si aggiorni

        assert.equal(gs.pendingRides.length, 1,
            'accettare due volte deve creare UNA sola corsa: due corse = doppio incasso alla fine');
    });

    test('pagare due volte la stessa multa Garante non raddoppia la spesa', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 5, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 2000 } }];
        gs.cash = 10000;

        sandbox.vipGaranteEventPaga(5);
        const dopoUna = gs.cash;
        sandbox.vipGaranteEventPaga(5);

        assert.equal(gs.cash, dopoUna, 'una multa già pagata non si paga di nuovo');
    });

    test('resistere due volte alla GdF non regala due gettoni politici', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.emails = [{ id: 6, type: 'vip_onorevole_event', status: 'unread' }];
        gs.politicalTokens = 0;

        sandbox.vipOnorevoleEventResisti(6);
        const dopoUna = gs.politicalTokens;
        sandbox.vipOnorevoleEventResisti(6);

        assert.equal(gs.politicalTokens, dopoUna,
            'un evento già risolto non deve regalare un secondo gettone politico');
    });
});
