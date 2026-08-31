'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/hostile_takeover — riacquisto della maggioranza (hostile_takeover.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 32. Una azione:

   · _opaRequestBuyback(opaId, price) — chiede conferma, valida prezzo e fondi,
     poi `rpc_opa_buyback {v_opa_id}`. SOLO su risposta senza errore addebita in
     locale (CE_money.addebitatoDalServer). Senza rete → si ferma con un errore:
     non deve fingere un riacquisto che il server non ha fatto (bug del 28/08).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/hostile_takeover', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 500000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.updateUI = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const errori   = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);

    test('_opaRequestBuyback: prezzo e fondi ok, RPC senza errore → addebito dal server', async () => {
        server.rispondiCon('rpc_opa_buyback', () => ({ data: { ok: true }, error: null }));
        const cassaPrima = gs().cash;

        await w._opaRequestBuyback('opa1', 120000);

        const c = chiamata('rpc_opa_buyback');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.v_opa_id, 'opa1');
        assert.equal(gs().cash, cassaPrima - 120000, 'l\'addebito dal server non è avvenuto');
        assert.ok(avvisi.some(a => a.t === 'success'));
    });

    test('_opaRequestBuyback: RPC in errore → nessun addebito, avviso d\'errore', async () => {
        server.rispondiCon('rpc_opa_buyback', () => ({ data: null, error: { message: 'no' } }));
        const cassaPrima = gs().cash;

        await w._opaRequestBuyback('opa1', 120000);

        assert.equal(gs().cash, cassaPrima, 'ha addebitato pur con errore RPC');
        assert.ok(errori().length > 0);
    });

    test('_opaRequestBuyback: senza connessione → errore, nessun addebito, niente RPC', async () => {
        w.supabaseClient = null;
        const cassaPrima = gs().cash;

        await w._opaRequestBuyback('opa1', 120000);

        assert.equal(gs().cash, cassaPrima, 'ha addebitato senza rete');
        assert.ok(errori().some(m => /[Cc]onnessione/.test(m)));
    });

    test('_opaRequestBuyback: conferma annullata → non fa nulla', async () => {
        w.confirm = () => false;
        const cassaPrima = gs().cash;

        await w._opaRequestBuyback('opa1', 120000);

        assert.equal(chiamata('rpc_opa_buyback'), undefined);
        assert.equal(gs().cash, cassaPrima);
    });

    test('_opaRequestBuyback: fondi insufficienti → errore, niente RPC', async () => {
        R.conSoldi(env, 10000);
        await w._opaRequestBuyback('opa1', 120000);
        assert.equal(chiamata('rpc_opa_buyback'), undefined);
        assert.ok(errori().some(m => /[Ff]ondi insufficienti/.test(m)));
    });
});
