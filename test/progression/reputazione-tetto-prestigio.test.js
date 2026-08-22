'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('progression/reputazione — ogni strada che dà reputazione usa CE_money.addReputation e rispetta il tetto (5.0 + prestigio)', () => {

    test('buyLifestyleAsset applica il bonus reputazione tramite CE_money.addReputation', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
        const asset = assets.find(a => a.repBonus > 0);
        assert.ok(asset, 'deve esistere almeno un asset con repBonus');

        gs.cash = 10_000_000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;

        let addRepCalls = [];
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalls.push(delta);
            return origAddRep(delta);
        };

        sandbox.buyLifestyleAsset(asset.id);

        assert.equal(addRepCalls.length, 1, 'buyLifestyleAsset deve invocare CE_money.addReputation');
        assert.equal(addRepCalls[0], asset.repBonus);
        assert.equal(gs.reputation, 5.0 + asset.repBonus, 'con prestigio 1.0 la reputazione deve superare 5.0');
    });

    test('_applyMarketingCampaign applica il bonus reputazione tramite CE_money.addReputation', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const campaigns = vm.runInContext('MARKETING_CAMPAIGNS', sandbox);
        const camp = campaigns.find(c => c.repBonus > 0);
        assert.ok(camp, 'deve esistere almeno una campagna con repBonus');

        gs.cash = 10_000_000;
        gs.brandVolume = 100;
        gs.brandPrestige = 100;
        gs.prestige = 1.0;
        gs.reputation = 5.0;

        let addRepCalls = [];
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalls.push(delta);
            return origAddRep(delta);
        };

        sandbox._applyMarketingCampaign(camp.id);

        assert.equal(addRepCalls.length, 1, '_applyMarketingCampaign deve invocare CE_money.addReputation');
        assert.equal(addRepCalls[0], camp.repBonus);
        assert.equal(gs.reputation, 5.0 + camp.repBonus, 'con prestigio 1.0 la reputazione deve superare 5.0');
    });

    test('window.rest con 5 stelle applica il bonus reputazione tramite CE_money.addReputation e rispetta il tetto', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 10_000;
        gs.prestige = 0;
        gs.reputation = 5.0;

        let addRepCalls = [];
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalls.push(delta);
            return origAddRep(delta);
        };

        await sandbox.rest(5);

        assert.equal(addRepCalls.length, 1, 'rest(5) deve invocare CE_money.addReputation');
        assert.equal(addRepCalls[0], 0.1);
        assert.equal(gs.reputation, 5.0, 'senza prestigio la reputazione non deve superare 5.0');
    });

    test('buyInvestment applica il bonus reputazione tramite CE_money.addReputation', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        const investments = vm.runInContext('INVESTMENTS', sandbox);
        const inv = investments.find(i => i.rep > 0 && !i.buildTime);
        assert.ok(inv, 'deve esistere almeno un investimento istantaneo con rep');

        gs.cash = 10_000_000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;

        let addRepCalls = [];
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalls.push(delta);
            return origAddRep(delta);
        };

        sandbox.buyInvestment(inv.id);

        assert.equal(addRepCalls.length, 1, 'buyInvestment deve invocare CE_money.addReputation');
        assert.equal(addRepCalls[0], inv.rep);
        assert.equal(gs.reputation, 5.0 + inv.rep, 'con prestigio 1.0 la reputazione deve superare 5.0');
    });

    test('repayVittorio applica il bonus reputazione tramite CE_money.addReputation', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 5000;
        gs.prestige = 1.0;
        gs.reputation = 5.0;
        gs.vittorioDebt = {
            principal: 500, outstanding: 500, status: 'active',
            startDay: 1, lastAccrualDay: 1, lastNagDay: 1, finalNoticeShown: false
        };

        let addRepCalls = [];
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalls.push(delta);
            return origAddRep(delta);
        };

        sandbox.repayVittorio(gs.vittorioDebt.outstanding);

        assert.equal(addRepCalls.length, 1, 'repayVittorio deve invocare CE_money.addReputation');
        assert.equal(addRepCalls[0], 0.3);
        assert.equal(gs.reputation, 5.3, 'con prestigio 1.0 la reputazione deve salire a 5.3');
    });

    test('acceptDiamondContract applica il bonus reputazione tramite CE_money.addReputation', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.reputation = 5.0;
        gs.prestige = 1.0;
        gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager', role: 'wealth_manager' }];
        gs.lifestyleAssets = ['jet_privato'];
        gs.drivers = [
            { id: 'tu_ceo', name: 'CEO', status: 'idle', level: 1, tier: 'standard' }
        ];
        gs.fleet = [
            { id: 'v_vip', name: 'Stellar S-Imperial', tier: 'vip', status: 'idle' }
        ];
        const diamondEmail = {
            id: 999,
            sender: 'Office',
            subject: '🔶 DIAMOND',
            type: 'diamond',
            offer: 45000,
            status: 'unread',
            expiresAt: 100
        };
        gs.emails.push(diamondEmail);

        let addRepCalls = [];
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalls.push(delta);
            return origAddRep(delta);
        };

        sandbox.acceptDiamondContract(999);

        assert.equal(addRepCalls.length, 1, 'acceptDiamondContract deve invocare CE_money.addReputation');
        assert.equal(addRepCalls[0], 0.2);
        assert.equal(gs.reputation, 5.2);
    });

    test('CE_money.addReputation con prestigio 1.5 rispetta il tetto 6.5', () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.prestige = 1.5;
        gs.reputation = 5.0;

        sandbox.CE_money.addReputation(2.0);
        assert.equal(gs.reputation, 6.5, 'la reputazione deve fermarsi al tetto 5.0 + 1.5 = 6.5');

        sandbox.CE_money.addReputation(-10);
        assert.equal(gs.reputation, 0, 'la reputazione non scende sotto zero');
    });
});
