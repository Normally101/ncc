'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/nemesi — la corruzione del VIP che ti si è rivoltato contro.

   Fase 3 di PIANO-CHIUSURA.md, sistema 8. Una sola azione del giocatore:
   `_nemesisBribeVip(vipId)`. Denaro locale (`CE_money.spend`). La tangente
   dipende dalla rabbia (5.000 + fino a 45.000), abbassa la rabbia di 40 punti,
   e se scende sotto la soglia la nemesi sparisce del tutto.

   Nota di piano: la nemesi che *finanzia i rivali* è cancellata (era una
   stampante di denaro) — vedi DOMANDE-PER-VLAD.md. Questa azione è l'altra metà,
   quella in cui è il giocatore a pagare.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/nemesi — _nemesisBribeVip', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 1_000_000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.confirm = () => true;
        w.renderTabNemesis = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('senza una nemesi per quel vip non succede niente', () => {
        const prima = gs().cash;
        w._nemesisBribeVip('nessuno');
        assert.equal(gs().cash, prima);
    });

    test('conferma annullata: nessuna spesa, rabbia invariata', () => {
        const nem = R.conNemesi(env, { rabbia: 80, id: 'grigori' });
        w.confirm = () => false;
        const prima = gs().cash;

        w._nemesisBribeVip('grigori');

        assert.equal(gs().cash, prima);
        assert.equal(nem.anger, 80);
    });

    test('tangente pagata: scala l\'importo giusto e abbassa la rabbia di 40', () => {
        R.conNemesi(env, { rabbia: 80, id: 'grigori' });
        const atteso = Math.floor(5000 + (80 / 100) * 45000);   // 41.000
        const prima = gs().cash;

        w._nemesisBribeVip('grigori');

        assert.equal(gs().cash, prima - atteso);
        assert.equal(gs().vipNemeses.grigori.anger, 40, 'la rabbia doveva scendere di 40');
        assert.ok(avvisi.some(a => /diffidente|preso i soldi/i.test(a.m)), 'resta una nemesi, solo più calma');
    });

    test('rabbia bassa: la tangente pacifica del tutto e la nemesi sparisce', () => {
        R.conNemesi(env, { rabbia: 30, id: 'grigori' });

        w._nemesisBribeVip('grigori');

        assert.equal(gs().vipNemeses.grigori, undefined, 'la nemesi doveva essere risolta');
        assert.ok(avvisi.some(a => a.t === 'success' && /[Pp]ace/.test(a.m)));
    });

    test('fondi insufficienti: rabbia invariata, nemesi ancora lì', () => {
        const nem = R.conNemesi(env, { rabbia: 80, id: 'grigori' });
        R.conSoldi(env, 100);
        const prima = gs().cash;

        w._nemesisBribeVip('grigori');

        assert.equal(gs().cash, prima);
        assert.equal(nem.anger, 80);
        assert.ok(gs().vipNemeses.grigori, 'la nemesi è stata risolta senza pagarla');
    });
});
