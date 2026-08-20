'use strict';
/* ============================================================================
   test/vip/vip-sync.test.js

   Regressione per il bug economico in vip-clients.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupVipEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('vip-clients — sincronizzazione cassa col server (CE_money)', () => {

    describe('Grigori V.', () => {
        test('completamento corsa accredita la mancia di 15.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 5000;
            sandbox._vipOnComplete('grigori', {}, {}, 8000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 20000, 'il cash locale deve includere la mancia di €15.000');
            assert.deepEqual(syncedCash, [20000], 'syncCash deve essere chiamata con il saldo aggiornato');
        });

        test('vipGrigoriEventAccept scala il costo di rerouting e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 1000;
            gs.emails = [{ id: 101, type: 'vip_grigori_event', status: 'unread', vipEventData: { cost: 500 } }];
            gs.vipCooldowns = { grigori: 48 };
            sandbox.vipGrigoriEventAccept(101);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, [500]);
        });

        test('vipGrigoriEventAccept con fondi insufficienti non scala denaro e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 200;
            gs.emails = [{ id: 101, type: 'vip_grigori_event', status: 'unread', vipEventData: { cost: 500 } }];
            sandbox.vipGrigoriEventAccept(101);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('Strata Consulting', () => {
        test('completamento con chargeback scala il 50% dell\'incasso e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 10000;
            // Forziamo Math.random per scatenare il chargeback (< 0.20)
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10;
            try {
                sandbox._vipOnComplete('strata', {}, {}, 4000);
                await new Promise(r => setImmediate(r));
                // chargeback = 4000 * 0.5 = 2000 -> cash = 8000
                assert.equal(gs.cash, 8000);
                assert.deepEqual(syncedCash, [8000]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('Platinum Talent', () => {
        test('vipPlatinumEventBlock scala 300€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 1000;
            gs.emails = [{ id: 201, type: 'vip_platinum_event', status: 'unread' }];
            sandbox.vipPlatinumEventBlock(201);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 700);
            assert.deepEqual(syncedCash, [700]);
        });

        test('vipPlatinumEventBlock con fondi insufficienti non scala e non risolve email', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 100;
            gs.emails = [{ id: 201, type: 'vip_platinum_event', status: 'unread' }];
            sandbox.vipPlatinumEventBlock(201);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100);
            assert.equal(gs.emails[0].status, 'unread');
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('Onorevole', () => {
        test('vipOnorevoleEventCopera senza token scala 1.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 3000;
            gs.politicalTokens = 0;
            gs.emails = [{ id: 301, type: 'vip_onorevole_event', status: 'unread' }];
            sandbox.vipOnorevoleEventCopera(301);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 2000);
            assert.deepEqual(syncedCash, [2000]);
        });
    });

    describe('Royal Entourage (Emiro)', () => {
        test('completamento con shopping detour accredita 5.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 10000;
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10;
            try {
                sandbox._vipOnComplete('emiro', {}, {}, 18000);
                await new Promise(r => setImmediate(r));
                assert.equal(gs.cash, 15000);
                assert.deepEqual(syncedCash, [15000]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('Il Garante', () => {
        test('vipGaranteEventPaga scala la multa e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 5000;
            gs.emails = [{ id: 401, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 2000 } }];
            sandbox.vipGaranteEventPaga(401);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 3000);
            assert.deepEqual(syncedCash, [3000]);
        });

        test('vipGaranteEventIntimidisci fallito senza token scala multa raddoppiata e sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 5000;
            gs.politicalTokens = 0;
            gs.emails = [{ id: 401, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 1500 } }];
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.90; // > 0.5 -> fallisce intimidazione
            try {
                sandbox.vipGaranteEventIntimidisci(401);
                await new Promise(r => setImmediate(r));
                // fine = 1500 * 2 = 3000 -> cash = 2000
                assert.equal(gs.cash, 2000);
                assert.deepEqual(syncedCash, [2000]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('White Lace Weddings', () => {
        test('vipWeddingEventGestisci spende 800€, accredita 2.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 1000;
            gs.emails = [{ id: 501, type: 'vip_wedding_event', status: 'unread' }];
            sandbox.vipWeddingEventGestisci(501);
            await new Promise(r => setImmediate(r));
            // spend 800 -> 200, earn 2000 -> 2200
            assert.equal(gs.cash, 2200);
            assert.deepEqual(syncedCash, [200, 2200]);
        });

        test('vipWeddingEventGestisci con fondi insufficienti non spende e non accredita', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 500;
            gs.emails = [{ id: 501, type: 'vip_wedding_event', status: 'unread' }];
            sandbox.vipWeddingEventGestisci(501);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
        });

        test('vipWeddingPaymentCollect riscuote il saldo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 5000;
            gs.emails = [{ id: 502, type: 'vip_wedding_payment', status: 'unread', vipEventData: { bonus: 3000 } }];
            sandbox.vipWeddingPaymentCollect(502);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 8000);
            assert.deepEqual(syncedCash, [8000]);
        });
    });

    describe('L\'Erede Viziato', () => {
        test('completamento con effetto virale accredita bonus e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 1000;
            const origRandom = sandbox.Math.random;
            // First random for car accident (<0.30 or >=0.30), second random for viral (<0.30)
            let callCount = 0;
            sandbox.Math.random = () => {
                callCount++;
                if (callCount === 1) return 0.50; // no car damage
                return 0.10; // triggers viral
            };
            try {
                sandbox._vipOnComplete('erede', {}, {}, 9500);
                await new Promise(r => setImmediate(r));
                // viral bonus = 9500 -> cash = 10500
                assert.equal(gs.cash, 10500);
                assert.deepEqual(syncedCash, [10500]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });
});
