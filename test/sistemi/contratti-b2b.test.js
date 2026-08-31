'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/contratti-b2b — gli appalti corporate.

   Fase 3 di PIANO-CHIUSURA.md, sistema 10. Come per i consorzi, «contratto» sono
   DUE sistemi diversi e vanno provati tutti e due:

   · **B2B** (`b2b.js`) — server-authoritative. b2bOpenAcceptModal costruisce il
     modal di selezione veicoli, b2bCheckLimit fa rispettare il numero richiesto,
     b2bConfirmAccept raccoglie la scelta e chiama `rpc_accept_b2b_contract`;
     b2bTerminateContract chiama `rpc_terminate_b2b_contract` e paga la penale via
     `CE_money.addebitatoDalServer` DOPO il sì del server.
   · **Contratti** (`contracts.js`) — simulazione locale. CE_cancelBid rimborsa il
     pledge da `CE_money.earn`; CE_terminateContract marca il contratto senza
     indennizzo.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

// ─────────────────────────────────────────────────────────────────────────────
describe('sistemi/contratti-b2b — B2B (b2b.js)', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conFlotta(env, 3, { tier: 'business' });
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.confirm = () => true;
        w.renderTabB2B = () => {};
        w._b2bState.contracts = [{
            id: 'app-1', title: 'Flotta Ministeriale', client_name: 'Min. Interni', client_icon: '🏛️',
            required_tier: 'BUSINESS', required_count: 2, daily_payout: 4000, duration_days: 20, penalty_amount: 30000,
        }];
        w._b2bState.activeContract = null;
    });
    afterEach(() => env.stopAllIntervals());

    const doc      = () => env.sandbox.document;
    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);
    const errori   = () => avvisi.filter(a => a.t === 'error').map(a => a.m);

    test('b2bOpenAcceptModal: senza abbastanza veicoli idonei mostra errore e non apre il modal', () => {
        gs().fleet = [];
        w.b2bOpenAcceptModal('app-1');
        assert.equal(doc().getElementById('b2b-select-modal'), null);
        assert.ok(errori().some(m => /veicoli/i.test(m)));
    });

    test('b2bOpenAcceptModal: con la flotta giusta costruisce il modal con le caselle', () => {
        w.b2bOpenAcceptModal('app-1');
        const modal = doc().getElementById('b2b-select-modal');
        assert.ok(modal, 'il modal non è stato creato');
        assert.ok(doc().querySelectorAll('.b2b-car-check').length >= 2);
        assert.equal(doc().getElementById('b2b-confirm-btn').disabled, true, 'firma disabilitata finché non scegli');
    });

    test('b2bCheckLimit: raggiunto il numero richiesto, la firma si abilita e le altre caselle si bloccano', () => {
        w.b2bOpenAcceptModal('app-1');
        const checks = [...doc().querySelectorAll('.b2b-car-check')];
        checks[0].checked = true;
        checks[1].checked = true;

        w.b2bCheckLimit(2);

        assert.equal(doc().getElementById('b2b-sel-count').textContent, '2');
        assert.equal(doc().getElementById('b2b-confirm-btn').disabled, false);
        if (checks[2]) assert.equal(checks[2].disabled, true, 'oltre il limite le caselle non toccate si bloccano');
    });

    test('b2bConfirmAccept: meno veicoli del richiesto → errore, niente server', async () => {
        w.b2bOpenAcceptModal('app-1');
        doc().querySelectorAll('.b2b-car-check')[0].checked = true;   // solo 1 su 2

        await w.b2bConfirmAccept('app-1', 2);

        assert.equal(chiamata('rpc_accept_b2b_contract'), undefined);
        assert.ok(errori().some(m => /almeno 2/i.test(m)));
    });

    test('b2bConfirmAccept: scelta completa → RPC con contratto e veicoli, contratto attivo', async () => {
        server.rispondiCon('rpc_accept_b2b_contract', () => ({
            data: { id: 'active-9', title: 'Flotta Ministeriale', daily_payout: 4000, days_remaining: 20, penalty: 30000 },
            error: null,
        }));
        w.b2bOpenAcceptModal('app-1');
        const checks = [...doc().querySelectorAll('.b2b-car-check')];
        checks[0].checked = true; checks[1].checked = true;

        await w.b2bConfirmAccept('app-1', 2);

        const c = chiamata('rpc_accept_b2b_contract');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.v_contract_id, 'app-1');
        assert.equal(c.args.v_vehicle_ids.length, 2);
        assert.ok(Array.isArray(c.args.v_driver_ids));
        assert.equal(w._b2bState.activeContract.id, 'active-9');
        assert.equal(doc().getElementById('b2b-select-modal'), null, 'il modal si chiude dopo la firma');
    });

    test('b2bTerminateContract: conferma ok → RPC {v_active_id}, penale e reputazione DOPO il server', async () => {
        gs().reputation = 3.0;
        server.rispondiCon('rpc_terminate_b2b_contract', () => ({ data: { penalty: 30000, rep_penalty: 0.5 }, error: null }));
        R.conSoldi(env, 500000);
        const cassaPrima = gs().cash;

        await w.b2bTerminateContract('active-9');

        const c = chiamata('rpc_terminate_b2b_contract');
        assert.ok(c);
        assert.equal(c.args.v_active_id, 'active-9');
        assert.equal(gs().cash, cassaPrima - 30000, 'la penale non è stata pagata');
        assert.ok(gs().reputation < 3.0, 'la penale reputazione non è arrivata');
        assert.equal(w._b2bState.activeContract, null);
    });

    test('b2bTerminateContract: il server rifiuta → nessuna penale', async () => {
        gs().reputation = 3.0;
        server.rispondiCon('rpc_terminate_b2b_contract', () => ({ data: null, error: { message: 'no' } }));
        R.conSoldi(env, 500000);
        const cassaPrima = gs().cash;

        await w.b2bTerminateContract('active-9');

        assert.equal(gs().cash, cassaPrima);
        assert.equal(gs().reputation, 3.0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sistemi/contratti-b2b — Contratti (contracts.js)', () => {
    let env, w;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 500000);
        w.confirm = () => true;
        w.renderTabContracts = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('CE_cancelBid rimborsa il pledge e azzera l\'offerta', () => {
        gs().corporateTenders = [{ id: 'gara-1', status: 'open', playerBid: { pledgedCash: 20000, score: 70 } }];
        const cassaPrima = gs().cash;

        w.CE_cancelBid('gara-1');

        assert.equal(gs().cash, cassaPrima + 20000, 'il pledge non è stato rimborsato');
        assert.equal(gs().corporateTenders[0].playerBid, null);
    });

    test('CE_cancelBid su una gara senza offerta non fa niente', () => {
        gs().corporateTenders = [{ id: 'gara-1', status: 'open', playerBid: null }];
        const cassaPrima = gs().cash;
        w.CE_cancelBid('gara-1');
        assert.equal(gs().cash, cassaPrima);
    });

    test('CE_terminateContract marca il contratto come terminato solo dopo conferma', () => {
        gs().corporateContracts = [{ id: 'c-1', status: 'active' }];

        w.confirm = () => false;
        w.CE_terminateContract('c-1');
        assert.equal(gs().corporateContracts[0].status, 'active', 'terminato senza conferma');

        w.confirm = () => true;
        w.CE_terminateContract('c-1');
        assert.equal(gs().corporateContracts[0].status, 'terminated');
    });
});
