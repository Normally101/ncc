'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('progression/tetto-reputazione — tutte le strade rispettano il tetto 5.0 + prestige', () => {

    test('CE_money.addReputation rispetta il tetto 5.0 + prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.prestige = 1.5;
        gs.reputation = 5.0;
        sandbox.CE_money.addReputation(0.8);
        assert.equal(Number(gs.reputation.toFixed(2)), 5.8, 'con prestige 1.5 e rep 5.0, +0.8 porta a 5.8');

        sandbox.CE_money.addReputation(2.0);
        assert.equal(Number(gs.reputation.toFixed(2)), 6.5, 'con prestige 1.5 il tetto massimo è 6.5');
    });

    test('marketing campaign repBonus passa per CE_money.addReputation e supera 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.cash = 100000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;
        gs.brandVolume = 80;
        gs.brandPrestige = 80;

        const res = sandbox._applyMarketingCampaign('mktg_lux'); // repBonus: 0.2
        assert.equal(res, true);
        assert.equal(Number(gs.reputation.toFixed(2)), 5.2, 'campagna marketing con repBonus deve portare la reputazione a 5.2');
    });

    test('buyLifestyleAsset passa per CE_money.addReputation e supera 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.cash = 10000000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;
        gs.lifestyleAssets = [];

        sandbox.buyLifestyleAsset('villa_porto_cervo'); // repBonus: 0.5
        assert.equal(Number(gs.reputation.toFixed(2)), 5.5, 'lifestyle asset deve portare la reputazione a 5.5');
    });

    test('buyInvestment con rep bonus passa per CE_money.addReputation e supera 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.cash = 1000000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;
        gs.investments = [];

        sandbox.buyInvestment('inv_pr'); // rep: 0.3, buildTime: 0
        assert.equal(Number(gs.reputation.toFixed(2)), 5.3, 'investimento con rep bonus deve portare la reputazione a 5.3');
    });

    test('diamond contract email resolution supera 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.prestige = 1.0;
        gs.reputation = 5.0;
        gs.fleet = [{ id: 'c1', tier: 'ultra', condition: 100, outOfService: null }];

        const email = { id: 'em_d1', offer: 50000, status: 'unread' };
        sandbox._resolveDiamondContractEmail(email);

        assert.equal(Number(gs.reputation.toFixed(2)), 5.2, 'diamond contract deve incrementare reputazione a 5.2');
    });

    test('VIP mid-ride event scelta A incrementa reputazione sopra 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.cash = 50000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;

        const ev = { icon: '⭐', repA: 0.2, costA: 100, repB: -0.1 };
        sandbox._resolveVipMidRideEvent(ev, 'A');

        assert.equal(Number(gs.reputation.toFixed(2)), 5.2, 'evento VIP scelta A deve portare reputazione a 5.2');
    });

    test('restCeo applica il tetto massimo corretto di 5.0 + prestigio', async () => {
        const { sandbox } = freshEnv({
            serverState: {
                restCeo: async () => ({ success: true }),
            },
        });
        const gs = sandbox.gameState;

        gs.cash = 50000;
        gs.prestige = 1.0; // tetto = 6.0
        gs.reputation = 5.9;

        // Hotel 5 stelle dà repGain 0.2
        await sandbox.restCeo(5);

        assert.equal(Number(gs.reputation.toFixed(2)), 6.0, 'restCeo deve rispettare il tetto 6.0 e non sforare');
    });

    test('repayVittorio saldo debito incrementa reputazione sopra 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        gs.prestige = 1.0;
        gs.reputation = 5.0;
        gs.cash = 1000;
        gs.vittorioDebt = {
            principal: 500, outstanding: 500, status: 'active',
            startDay: 1, lastAccrualDay: 1, lastNagDay: 1, finalNoticeShown: false,
        };

        sandbox.repayVittorio(500);

        assert.equal(gs.vittorioDebt.status, 'repaid');
        assert.equal(Number(gs.reputation.toFixed(2)), 5.3, 'repayVittorio deve portare reputazione a 5.3');
    });

    test('VTK Shop rep_boost_01 incrementa reputazione sopra 5.0 con prestigio', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        const vtkShopItem = sandbox.VTK_SHOP_ITEMS.find(i => i.id === 'rep_boost_01');
        assert.ok(vtkShopItem, 'rep_boost_01 deve esistere nel catalogo VTK shop');

        gs.prestige = 1.0;
        gs.reputation = 5.0;

        const res = vtkShopItem.apply(gs);
        assert.equal(res.ok, true);
        assert.equal(Number(gs.reputation.toFixed(2)), 5.2, 'rep_boost_01 deve portare reputazione a 5.2');
    });
});
