'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('progression/tetto-reputazione — il tetto è 5.0 + prestige in tutte le vie', () => {

    test('CE_money.addReputation rispetta il tetto 5.0 + prestigio e pavimento 0', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2;
        gs.reputation = 5.0;

        sandbox.CE_money.addReputation(1.5);
        assert.equal(gs.reputation, 6.5, 'con prestigio 2 il tetto è 7.0, 5.0 + 1.5 deve raggiungere 6.5');

        sandbox.CE_money.addReputation(2.0);
        assert.equal(gs.reputation, 7.0, 'con prestigio 2 non si supera il tetto di 7.0');

        sandbox.CE_money.addReputation(-10.0);
        assert.equal(gs.reputation, 0, 'la reputazione non può scendere sotto 0');
    });

    test('_applyMarketingCampaign accredita reputazione oltre 5.0 con prestigio > 0', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;
        gs.cash = 500000;
        gs.brandVolume = 100;
        gs.brandPrestige = 100;

        // Trova una campagna con repBonus (es. mkt_tv o mkt_influencer)
        const camp = sandbox.MARKETING_CAMPAIGNS.find(c => c.repBonus > 0);
        assert.ok(camp, 'deve esistere una campagna con repBonus');

        const ok = sandbox._applyMarketingCampaign(camp.id);
        assert.equal(ok, true);
        assert.equal(gs.reputation, 5.0 + camp.repBonus, 'la reputazione deve salire oltre 5.0 grazie al prestigio');
    });

    test('rest(5) con hotel 5 stelle accredita reputazione rispettando il tetto con prestigio', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;
        gs.cash = 5000;
        gs.energy = 20;

        await sandbox.rest(5);
        assert.equal(gs.reputation, 5.1, 'rest(5) a 5.0 con prestigio 2 deve portare la reputazione a 5.1');
    });

    test('buyLifestyleAsset accredita reputazione oltre 5.0 con prestigio > 0', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;
        gs.cash = 10000000;

        const asset = sandbox.LIFESTYLE_ASSETS.find(a => a.repBonus > 0);
        assert.ok(asset, 'deve esistere un lifestyle asset con repBonus');

        sandbox.buyLifestyleAsset(asset.id);
        assert.equal(gs.reputation, 5.0 + asset.repBonus, 'lifestyle asset deve aumentare la rep oltre 5.0 con prestigio');
    });

    test('buyInvestment accredita reputazione oltre 5.0 con prestigio > 0', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;
        gs.cash = 5000000;
        gs.questStats.totalRides = 500;

        const inv = sandbox.INVESTMENTS.find(i => i.rep > 0 && !i.buildTime);
        assert.ok(inv, 'deve esistere un investimento immediato con rep');

        await sandbox.buyInvestment(inv.id);
        assert.equal(gs.reputation, 5.0 + inv.rep, 'buyInvestment deve aumentare la rep oltre 5.0 con prestigio');
    });

    test('acceptDiamondContract accredita +0.2★ reputazione oltre 5.0 con prestigio > 0', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;
        gs.cash = 10000;

        // Prepara flotta e autista qualificati
        gs.fleet.push({ id: 'c_dia', tier: 'ultra', vehicleClass: 'majestic_spirit', condition: 100 });
        gs.drivers.push({ id: 'd_dia', name: 'Elite Driver', status: 'idle', level: 3, tier: 'ultra', queue: [] });

        const email = { id: 999, offer: 50000, status: 'unread' };
        sandbox.acceptDiamondContract(email);

        assert.equal(gs.reputation, 5.2, 'diamond contract deve portare la rep a 5.2 con prestigio 2');
    });

    test('repayVittorio a saldo estinto accredita +0.3★ reputazione oltre 5.0 con prestigio > 0', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;
        gs.cash = 5000;

        const debt = sandbox._vittorioDebt();
        assert.ok(debt, 'vittorioDebt deve essere attivo');

        sandbox.repayVittorio(debt.outstanding);
        assert.equal(debt.status, 'repaid');
        assert.equal(gs.reputation, 5.3, 'repayVittorio a saldo 0 deve portare rep a 5.3 con prestigio 2');
    });

    test('VTK Shop rep_boost_01 rispetta il tetto con prestigio > 0', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.0;

        const item = sandbox.VTK_SHOP_ITEMS.find(x => x.id === 'rep_boost_01');
        assert.ok(item, 'rep_boost_01 deve esistere nel catalogo VTK');

        const res = item.apply(gs);
        assert.equal(res.ok, true);
        assert.equal(gs.reputation, 5.2, 'VTK rep boost deve portare rep a 5.2 con prestigio 2');
    });
});
