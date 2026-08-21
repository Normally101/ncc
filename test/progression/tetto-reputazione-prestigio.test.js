'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('progression/tetto-reputazione-prestigio — ogni strada rispetta 5.0 + prestigio', () => {

    test('window.rest(5) rispetta il tetto 5.0 + prestige e non lo supera', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.prestige = 1; // Tetto max = 6.0
        sandbox.gameState.reputation = 5.95;
        sandbox.gameState.cash = 10000;

        await sandbox.rest(5);

        assert.equal(sandbox.gameState.reputation, 6.0, 'la reputazione deve essere limitata a 6.0 (5.0 + prestigio 1)');
    });

    test('buyLifestyleAsset rispetta il tetto 5.0 + prestige con prestigio > 0', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.prestige = 1; // Tetto max = 6.0
        sandbox.gameState.reputation = 5.8;
        sandbox.gameState.cash = 10_000_000;

        // Trova un lifestyle asset con repBonus
        const asset = (sandbox.LIFESTYLE_ASSETS || []).find(a => (a.repBonus || 0) > 0);
        assert.ok(asset, 'deve esistere un lifestyle asset con repBonus');

        sandbox.buyLifestyleAsset(asset.id);
        assert.ok(sandbox.gameState.reputation <= 6.0, 'la reputazione non deve superare il tetto di 6.0');
        assert.ok(sandbox.gameState.reputation > 5.8, 'la reputazione deve salire oltre il 5.0');
    });

    test('_applyMarketingCampaign accredita reputazione tramite CE_money rispettando il prestigio', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.prestige = 2; // Tetto max = 7.0
        sandbox.gameState.reputation = 5.5;
        sandbox.gameState.cash = 100_000;
        sandbox.gameState.brandVolume = 100;
        sandbox.gameState.brandPrestige = 100;

        const camp = (sandbox.MARKETING_CAMPAIGNS || []).find(c => (c.repBonus || 0) > 0);
        assert.ok(camp, 'deve esistere una campagna marketing con repBonus');

        sandbox._applyMarketingCampaign(camp.id);
        assert.equal(sandbox.gameState.reputation, 5.5 + camp.repBonus, 'la reputazione deve salire oltre 5.0 con prestigio 2');
    });

    test('repayVittorio rispetta il tetto 5.0 + prestige quando il debito viene saldato', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.prestige = 1; // Tetto max = 6.0
        sandbox.gameState.reputation = 5.9;
        sandbox.gameState.cash = 10000;

        const debt = sandbox._vittorioDebt();
        assert.ok(debt, 'debito Vittorio deve esistere');

        sandbox.repayVittorio(debt.outstanding);
        assert.equal(debt.status, 'repaid');
        assert.equal(sandbox.gameState.reputation, 6.0, 'la reputazione saldata deve fermarsi a 6.0 (5.0 + 1)');
    });

    test('buyInvestment con item.rep rispetta il tetto 5.0 + prestige', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.prestige = 1; // Tetto max = 6.0
        sandbox.gameState.reputation = 5.9;
        sandbox.gameState.cash = 1_000_000;

        const inv = (sandbox.INVESTMENTS || []).find(i => (i.rep || 0) > 0 && !i.buildTime);
        assert.ok(inv, 'deve esistere un investimento con rep istantanea');

        await sandbox.buyInvestment(inv.id);
        assert.ok(sandbox.gameState.reputation <= 6.0, 'la reputazione non deve superare 6.0');
    });

    test('VTK Shop rep_boost_01 rispetta il tetto 5.0 + prestige', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.prestige = 1; // Tetto max = 6.0
        sandbox.gameState.reputation = 5.2;

        const item = sandbox.VTK_SHOP_ITEMS.find(x => x.id === 'rep_boost_01');
        assert.ok(item, 'rep_boost_01 deve esistere nel catalogo VTK');

        const res = item.apply(sandbox.gameState);
        assert.equal(res.ok, true);
        assert.equal(sandbox.gameState.reputation, 5.4, 'la reputazione deve salire a 5.4 con prestigio 1');
    });
});
