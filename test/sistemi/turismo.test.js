'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/turismo — i bandi turistici (tourism.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 9. Tre azioni, tutte server-authoritative
   e tutte dietro il login (`_tUid()`):

   · `tourismSubmitBid`   — invia l'offerta: `rpc_submit_tourism_bid`
     con {v_tender_id, v_qualifying_vehicles, v_pledge_cash}. Il pledge lo tiene
     il server; qui non si muove cassa.
   · `tourismCancelBid`   — `rpc_cancel_tourism_bid` {v_tender_id}.
   · `tourismTerminate`   — `rpc_terminate_tourism_contract` {v_tender_id}, con
     conferma. La penale di reputazione la applica il client SOLO se ServerState
     non è pronto (altrimenti la scrive il server).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/turismo', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        // ServerState non pronto: così la penale reputazione di tourismTerminate
        // la applica il client e la si può osservare (con ServerState pronto la
        // scrive il server e qui non si vedrebbe).
        env = freshEnv({ serverState: { isReady: () => false } });
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.confirm = () => true;
        w.renderTabTourism = () => {};
        w._tourismState.tenders = [
            { id: 'bando-1', name: 'Costa Smeralda VIP', requirements: { req_tier: 'standard' }, tier: 3 },
        ];
        w._tourismState._pledgeAmts = { 'bando-1': 50000 };
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);
    const errori   = () => avvisi.filter(a => a.t === 'error').map(a => a.m);

    // ── tourismSubmitBid ────────────────────────────────────────────────────

    describe('tourismSubmitBid', () => {

        test('senza login: errore, niente server', async () => {
            w.currentUser = null; env.sandbox.currentUser = null;
            await w.tourismSubmitBid('bando-1');
            assert.equal(chiamata('rpc_submit_tourism_bid'), undefined);
            assert.ok(errori().some(m => /loggato/i.test(m)));
        });

        test('bando inesistente: nessuna chiamata', async () => {
            await w.tourismSubmitBid('non-esiste');
            assert.equal(chiamata('rpc_submit_tourism_bid'), undefined);
        });

        test('offerta inviata: RPC con tender, veicoli qualificati e pledge', async () => {
            server.rispondiCon('rpc_submit_tourism_bid', () => ({ data: { score: 88 }, error: null }));

            await w.tourismSubmitBid('bando-1');

            const c = chiamata('rpc_submit_tourism_bid');
            assert.ok(c, 'il server non è stato chiamato');
            assert.equal(c.args.v_tender_id, 'bando-1');
            assert.equal(c.args.v_pledge_cash, 50000, 'il pledge letto da _pledgeAmts');
            assert.equal(typeof c.args.v_qualifying_vehicles, 'number');
            assert.ok(avvisi.some(a => a.t === 'success' && /Score/i.test(a.m)));
        });

        test('il server rifiuta: errore mostrato', async () => {
            server.rispondiCon('rpc_submit_tourism_bid', () => ({ data: null, error: { message: 'flotta insufficiente' } }));
            await w.tourismSubmitBid('bando-1');
            assert.ok(errori().some(m => /non inviata|insufficiente/i.test(m)));
        });
    });

    // ── tourismCancelBid ────────────────────────────────────────────────────

    describe('tourismCancelBid', () => {

        test('senza login non chiama il server', async () => {
            w.currentUser = null; env.sandbox.currentUser = null;
            await w.tourismCancelBid('bando-1');
            assert.equal(chiamata('rpc_cancel_tourism_bid'), undefined);
        });

        test('annulla: RPC con il tender giusto', async () => {
            server.rispondiCon('rpc_cancel_tourism_bid', () => ({ data: null, error: null }));
            await w.tourismCancelBid('bando-1');
            const c = chiamata('rpc_cancel_tourism_bid');
            assert.ok(c);
            assert.equal(c.args.v_tender_id, 'bando-1');
        });

        test('il server rifiuta: errore mostrato', async () => {
            server.rispondiCon('rpc_cancel_tourism_bid', () => ({ data: null, error: { message: 'no' } }));
            await w.tourismCancelBid('bando-1');
            assert.ok(errori().some(m => /non riuscito/i.test(m)));
        });
    });

    // ── tourismTerminate ────────────────────────────────────────────────────

    describe('tourismTerminate', () => {

        test('conferma annullata: niente server', async () => {
            w.confirm = () => false;
            await w.tourismTerminate('bando-1');
            assert.equal(chiamata('rpc_terminate_tourism_contract'), undefined);
        });

        test('rescinde: RPC col tender, e la penale reputazione applicata in offline', async () => {
            server.rispondiCon('rpc_terminate_tourism_contract', () => ({ data: { rep_penalty: 0.45 }, error: null }));
            gs().reputation = 3.0;             // altrimenti il pavimento a 0 nasconde la penale
            const repPrima = gs().reputation;

            await w.tourismTerminate('bando-1');

            const c = chiamata('rpc_terminate_tourism_contract');
            assert.ok(c);
            assert.equal(c.args.v_tender_id, 'bando-1');
            assert.ok(gs().reputation < repPrima, 'la penale di reputazione non è stata applicata');
        });

        test('il server rifiuta: errore, reputazione intatta', async () => {
            server.rispondiCon('rpc_terminate_tourism_contract', () => ({ data: null, error: { message: 'no' } }));
            const repPrima = gs().reputation;
            await w.tourismTerminate('bando-1');
            assert.equal(gs().reputation, repPrima);
            assert.ok(errori().some(m => /non riuscita/i.test(m)));
        });
    });
});
