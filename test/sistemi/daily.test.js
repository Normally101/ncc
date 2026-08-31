'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/daily — email di trattativa + ordini del giorno.

   Fase 3 di PIANO-CHIUSURA.md, sistema 29.

   · negotiateEmail(id, action, choiceIdx)  (engine-daily.js) — sul ramo
     `ceo_event` paga il costo della scelta (CE_money.spend) e, se riesce,
     incassa `gain` (CE_money.earn); poi segna l'email `resolved`. Se il costo
     non è coperto → esce, l'email resta aperta.
   · claimDailyOrder(id)  (daily-orders.js) — riscuote un ordine del giorno
     COMPLETATO: accredita il premio (earnDC / earn / addReputation) e lo mette
     fra i `claimed`. Non completato o già riscosso → niente.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/daily — negotiateEmail (ceo_event)', () => {
    let env, w;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 100000);
        w.showNotification = () => {};
        w.renderTabEmails = () => {};
        w.updateUI = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    function emailEvento(choice) {
        gs().emails = [{ id: 'e1', type: 'ceo_event', status: 'unread', eventData: { choices: [choice] } }];
    }

    test('negotiateEmail: paga il costo, incassa il gain, marca l\'email risolta', () => {
        emailEvento({ text: 'Sfrutta il contatto', cost: 2000, gain: 5000 });
        const cassaPrima = gs().cash;

        w.negotiateEmail('e1', null, 0);

        assert.equal(gs().cash, cassaPrima - 2000 + 5000, 'costo o incasso non applicati');
        assert.equal(gs().emails[0].status, 'resolved');
    });

    test('negotiateEmail: costo non coperto → esce, email ancora aperta, nessun incasso', () => {
        emailEvento({ text: 'Mossa costosa', cost: 999999, gain: 5000 });
        R.conSoldi(env, 1000);
        const cassaPrima = gs().cash;

        w.negotiateEmail('e1', null, 0);

        assert.equal(gs().cash, cassaPrima, 'ha toccato la cassa senza fondi');
        assert.equal(gs().emails[0].status, 'unread', 'l\'email non doveva risolversi');
    });

    test('negotiateEmail: id sconosciuto → niente', () => {
        emailEvento({ text: 'x', cost: 0, gain: 1000 });
        const cassaPrima = gs().cash;
        w.negotiateEmail('ignota', null, 0);
        assert.equal(gs().cash, cassaPrima);
        assert.equal(gs().emails[0].status, 'unread');
    });
});

describe('sistemi/daily — claimDailyOrder', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 0);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.spawnMoneyParticles = () => {};
        w.updateUI = () => {};
        w.renderTabHome = () => {};
        // ordine "rides" (rw: { dc: 2 }), target tier "new" = 3 corse
        gs().dailyOrders = { day: gs().day, picks: [{ id: 'rides', base: 0 }], claimed: [] };
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('claimDailyOrder: ordine completato → accredita i DC e lo mette fra i riscossi', () => {
        gs().questStats = { totalRides: 5 };          // >= 3 → done
        const dcPrima = gs().driverCoins || 0;

        w.claimDailyOrder('rides');

        assert.equal(gs().driverCoins, dcPrima + 2, 'i 2 DC non sono stati accreditati');
        assert.ok(gs().dailyOrders.claimed.includes('rides'));
        assert.ok(avvisi.some(a => a.t === 'success'));
    });

    test('claimDailyOrder: seconda chiamata → non accredita di nuovo', () => {
        gs().questStats = { totalRides: 5 };
        w.claimDailyOrder('rides');
        const dcDopo = gs().driverCoins;

        w.claimDailyOrder('rides');

        assert.equal(gs().driverCoins, dcDopo, 'ha pagato due volte lo stesso ordine');
    });

    test('claimDailyOrder: ordine non ancora completato → niente', () => {
        gs().questStats = { totalRides: 1 };          // < 3
        const dcPrima = gs().driverCoins || 0;

        w.claimDailyOrder('rides');

        assert.equal(gs().driverCoins || 0, dcPrima, 'ha pagato un ordine incompleto');
        assert.ok(!gs().dailyOrders.claimed.includes('rides'));
    });
});
