'use strict';
/* ============================================================================
   test/progression/tetto-reputazione.test.js

   Verifica che TUTTE le strade che modificano la reputazione (guadagni e perdite):
     1. Rispettino il tetto unificato di 5.0 + prestige quando prestige > 0
     2. Rispettino il tetto di 5.0 quando prestige == 0
     3. Rispettino il pavimento di 0.0 (nessuna reputazione negativa)
     4. Passino dalla porta unica CE_money.addReputation
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('progressione — tetto della reputazione con prestigio', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv();
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('CE_money.addReputation rispetta il tetto 5.0 + prestigio e il pavimento 0', () => {
        gs.prestige = 1.5;
        gs.reputation = 5.0;
        sandbox.CE_money.addReputation(1.0);
        assert.equal(Math.round(gs.reputation * 100) / 100, 6.0, 'con prestigio 1.5 e rep 5.0, +1.0 deve raggiungere 6.0');

        sandbox.CE_money.addReputation(1.0);
        assert.equal(Math.round(gs.reputation * 100) / 100, 6.5, 'non deve superare il tetto di 5.0 + 1.5 = 6.5');

        sandbox.CE_money.addReputation(-10.0);
        assert.equal(gs.reputation, 0, 'la reputazione non deve scendere sotto 0');
    });

    test('window.rest con 5 stelle rispetta il tetto 5.0 + prestigio (non sfora oltre il tetto)', async () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.95;
        gs.cash = 10000;
        gs.energy = 50;

        await sandbox.rest(5);

        assert.equal(Math.round(gs.reputation * 100) / 100, 6.0, 'window.rest(5) deve fermarsi al tetto 6.0, non sforare a 6.05');
    });

    test('campagne marketing (_applyMarketingCampaign) incrementano la reputazione oltre 5.0 con prestigio', () => {
        gs.prestige = 1;
        gs.reputation = 5.0;
        gs.cash = 1000000;
        gs.brandVolume = 100;
        gs.brandPrestige = 100;

        sandbox._applyMarketingCampaign('f1_sponsorship');
        assert.ok(gs.reputation > 5.0, 'la reputazione deve superare 5.0 grazie al prestigio');
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.2);
    });

    test('lifestyle assets (buyLifestyleAsset) incrementano la reputazione oltre 5.0 con prestigio', () => {
        gs.prestige = 1;
        gs.reputation = 5.0;
        gs.cash = 10000000;

        sandbox.buyLifestyleAsset('attico_milano');
        assert.ok(gs.reputation > 5.0, 'la reputazione deve superare 5.0');
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.3);
    });

    test('investimenti con rep (buyInvestment) rispettano il tetto con prestigio', async () => {
        gs.prestige = 1;
        gs.reputation = 5.0;
        gs.cash = 10000000;

        // inv_garage_hq da 45000€ conferisce rep: 0.2
        await sandbox.buyInvestment('inv_garage_hq');
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.2, 'buyInvestment deve portare la reputazione a 5.2 con prestigio 1');
    });

    test('contratto diamond (acceptDiamondContract) rispetta il tetto con prestigio', () => {
        gs.prestige = 1;
        gs.reputation = 5.0;
        gs.fleet = [{ id: 'c1', tier: 'ultra', vehicleClass: 'majestic_spirit' }];
        gs.drivers = [{ id: 'd1', name: 'Driver', tier: 'ultra', status: 'idle', assignedCarId: 'c1' }];

        const email = { id: 999, offer: 30000, status: 'pending' };
        gs.emails = [email];

        sandbox.acceptDiamondContract(999);
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.2, 'acceptDiamondContract deve aggiungere 0.2 arrivando a 5.2');
    });

    test('debito Vittorio (repayVittorio) rispetta il tetto con prestigio alla chiusura', () => {
        gs.prestige = 1;
        gs.reputation = 5.0;
        gs.cash = 10000;
        gs.vittorioDebt = { principal: 500, outstanding: 500, status: 'active', startDay: 1, lastAccrualDay: 1 };

        sandbox.repayVittorio(500);
        assert.equal(gs.vittorioDebt.status, 'repaid');
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.3, 'estinzione debito Vittorio deve portare la reputazione a 5.3 con prestigio 1');
    });

    test('VTK Shop (rep_boost_01) rispetta il tetto con prestigio', async () => {
        gs.prestige = 1;
        gs.reputation = 5.0;
        gs.vtkBalance = 500;

        // Mock supabase per vtkBuyShopItem
        sandbox.supabaseClient = {
            rpc: async (fn, params) => {
                if (fn === 'rpc_spend_vtk_shop_item') {
                    gs.vtkBalance -= 300;
                    return { data: { success: true }, error: null };
                }
                return { data: null, error: null };
            }
        };

        await sandbox.vtkBuyShopItem('rep_boost_01');
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.2, 'VTK rep boost deve portare la reputazione a 5.2');
    });

    test('bivio quest (t06, m01, m02, m03, m04) rispetta il tetto 5.0 + prestigio', () => {
        gs.prestige = 1;
        gs.reputation = 5.0;

        const q_t06 = sandbox.QUEST_DB.find(q => q.id === 't06');
        const optRifiuta = q_t06.bivio.options.find(o => o.id === 'rifiuta');
        optRifiuta.effect(gs);
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.2, 't06 rifiuta deve portare rep a 5.2');

        const q_m04 = sandbox.QUEST_DB.find(q => q.id === 'm04');
        const optPassa = q_m04.bivio.options.find(o => o.id === 'accetta');
        optPassa.effect(gs);
        assert.equal(Math.round(gs.reputation * 100) / 100, 5.1, 'm04 accetta deve togliere 0.1 portando rep a 5.1');
    });
});
