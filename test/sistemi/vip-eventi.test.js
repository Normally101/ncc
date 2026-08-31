'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/vip-eventi — le scelte di follow-up dei clienti VIP (vip-clients.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 16. Undici azioni: dopo aver accettato un
   VIP, alcuni fanno arrivare un secondo bivio via email (il poliziotto del
   Garante, i paparazzi della Diva, la GdF dell'Onorevole, il dramma del
   matrimonio…). Tutte a denaro locale.

   Il difetto che questa famiglia ha già nascosto: **il doppio click incassava o
   pagava due volte** — `_vipResolveEmail` marca `resolved` ma non rimuove
   l'email, e il `find` non filtra per stato. Ogni handler ha la guardia
   `if (e.status === 'resolved') return;` e qui c'è il test che la difende.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/vip-eventi', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 500000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w._vipRefreshUI = () => {};
        w._applyBuff = () => {};
        w.spawnMoneyParticles = () => {};
        w.gameState.vipCooldowns = {};
        w.gameState.politicalTokens = 0;
    });
    afterEach(() => env.stopAllIntervals());

    const gs  = () => env.sandbox.window.gameState;
    const mail = (over = {}) => {
        const e = { id: 'e1', type: 'vip_x', status: 'unread', vipEventData: {}, ...over };
        gs().emails.push(e);
        return e;
    };

    // ── Grigori ────────────────────────────────────────────────────────────

    test('vipGrigoriEventAccept: paga il rerouting una volta sola', () => {
        mail({ vipEventData: { cost: 500 } });
        const prima = gs().cash;
        w.vipGrigoriEventAccept('e1');
        assert.equal(gs().cash, prima - 500);
        w.vipGrigoriEventAccept('e1');                     // doppio click
        assert.equal(gs().cash, prima - 500, 'ha pagato due volte lo stesso rerouting');
    });

    test('vipGrigoriEventDecline: −0,1★ una volta sola', () => {
        gs().reputation = 3;
        mail();
        w.vipGrigoriEventDecline('e1');
        w.vipGrigoriEventDecline('e1');
        assert.ok(Math.abs(gs().reputation - 2.9) < 1e-6, 'la penale reputazione è stata applicata due volte');
    });

    // ── Platinum (la Diva) ────────────────────────────────────────────────

    test('vipPlatinumEventBlock: −€300 e email risolta; non due volte', () => {
        mail();
        const prima = gs().cash;
        w.vipPlatinumEventBlock('e1');
        assert.equal(gs().cash, prima - 300);
        assert.equal(gs().emails[0].status, 'resolved');
        w.vipPlatinumEventBlock('e1');
        assert.equal(gs().cash, prima - 300);
    });

    test('vipPlatinumEventAllow: +0,15★ una volta sola', () => {
        gs().reputation = 2;
        mail();
        w.vipPlatinumEventAllow('e1');
        w.vipPlatinumEventAllow('e1');
        assert.ok(gs().reputation > 2 && gs().reputation <= 2.15 + 1e-9);
    });

    // ── Onorevole (la GdF) ────────────────────────────────────────────────

    test('vipOnorevoleEventCopera: col gettone politico non paga; senza gettone paga la multa', () => {
        gs().politicalTokens = 1;
        mail();
        const prima = gs().cash;
        w.vipOnorevoleEventCopera('e1');
        assert.equal(gs().cash, prima, 'col gettone non doveva pagare');
        assert.equal(gs().politicalTokens, 0);

        gs().politicalTokens = 0;
        mail({ id: 'e2' });
        const prima2 = gs().cash;
        w.vipOnorevoleEventCopera('e2');
        assert.equal(gs().cash, prima2 - 1000, 'senza gettone doveva pagare la multa');
    });

    test('vipOnorevoleEventResisti: +1 gettone politico e −0,05★', () => {
        gs().reputation = 3;
        mail();
        w.vipOnorevoleEventResisti('e1');
        assert.equal(gs().politicalTokens, 1);
        assert.ok(gs().reputation < 3);
        w.vipOnorevoleEventResisti('e1');
        assert.equal(gs().politicalTokens, 1, 'ha dato un secondo gettone per lo stesso evento');
    });

    // ── Garante (il posto di blocco) ─────────────────────────────────────

    test('vipGaranteEventPaga: paga la multa una volta sola', () => {
        mail({ vipEventData: { fine: 2000 } });
        const prima = gs().cash;
        w.vipGaranteEventPaga('e1');
        assert.equal(gs().cash, prima - 2000);
        w.vipGaranteEventPaga('e1');
        assert.equal(gs().cash, prima - 2000, 'multa pagata due volte');
    });

    test('vipGaranteEventIntimidisci: col gettone politico risolve senza pagare', () => {
        gs().politicalTokens = 1;
        mail({ vipEventData: { fine: 2000 } });
        const prima = gs().cash;
        w.vipGaranteEventIntimidisci('e1');
        assert.equal(gs().cash, prima);
        assert.equal(gs().politicalTokens, 0);
        assert.equal(gs().emails[0].status, 'resolved');
    });

    test('vipGaranteEventIntimidisci: senza gettone, dado sfortunato → paga la multa doppia', () => {
        mail({ vipEventData: { fine: 2000 } });
        const prima = gs().cash;
        R.conDadoTruccato(0.9, () => w.vipGaranteEventIntimidisci('e1'));   // >= 0.5 → paga ×2
        assert.equal(gs().cash, prima - 4000);
    });

    // ── Wedding (il matrimonio) ─────────────────────────────────────────

    test('vipWeddingEventGestisci: −€800 poi +€2.000 (netto +1.200), una volta sola', () => {
        mail();
        const prima = gs().cash;
        w.vipWeddingEventGestisci('e1');
        assert.equal(gs().cash, prima + 1200);
        w.vipWeddingEventGestisci('e1');
        assert.equal(gs().cash, prima + 1200, 'il compenso è stato incassato due volte');
    });

    test('vipWeddingEventIgnora: −0,2★ una volta sola', () => {
        gs().reputation = 3;
        mail();
        w.vipWeddingEventIgnora('e1');
        w.vipWeddingEventIgnora('e1');
        assert.ok(Math.abs(gs().reputation - 2.8) < 1e-6);
    });

    test('vipWeddingPaymentCollect: incassa il saldo una volta sola', () => {
        mail({ vipEventData: { bonus: 5000 } });
        const prima = gs().cash;
        w.vipWeddingPaymentCollect('e1');
        assert.equal(gs().cash, prima + 5000);
        w.vipWeddingPaymentCollect('e1');
        assert.equal(gs().cash, prima + 5000, 'saldo accreditato due volte');
    });
});
