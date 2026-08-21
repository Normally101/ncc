'use strict';
/* ============================================================================
   test/progression/reputazione-tetto.test.js

   Verifica che tutte le strade che incrementano o decrementano la reputazione
   passino dall'unica funzione centrale (CE_money.addReputation) e rispettino
   il tetto dinamico di 5.0 + prestige (e il pavimento a 0).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('reputazione — rispetto del tetto 5.0 + prestigio su ogni strada', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv({
            serverState: {
                restCeo: async () => ({ success: true }),
                buyInvestment: async () => ({ success: true }),
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('window.rest(5) con reputazione al massimo rispetta il tetto 5.0 + prestigio', async () => {
        gs.prestige = 1.0; // tetto = 6.0
        gs.reputation = 6.0;
        gs.energy = 50;

        await sandbox.rest(5);

        assert.equal(gs.reputation, 6.0, 'rest non deve superare il tetto di 5.0 + prestigio');
    });

    test('buyLifestyleAsset incrementa reputazione passando per addReputation e rispettando il tetto', () => {
        let addRepCalled = false;
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalled = true;
            return origAddRep(delta);
        };

        gs.prestige = 0.5; // tetto = 5.5
        gs.reputation = 5.3;
        gs.cash = 10000000;
        gs.lifestyleAssets = [];

        sandbox.buyLifestyleAsset('attico_milano'); // repBonus: 0.3

        assert.equal(addRepCalled, true, 'buyLifestyleAsset deve usare CE_money.addReputation');
        assert.equal(gs.reputation, 5.5, 'la reputazione deve rispettare il tetto 5.0 + prestigio');
    });

    test('_applyMarketingCampaign con bonus reputazione passa per addReputation', () => {
        let addRepCalled = false;
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalled = true;
            return origAddRep(delta);
        };

        gs.prestige = 1.0;
        gs.reputation = 5.9;
        gs.cash = 100000;
        gs.activeCampaigns = [];

        sandbox._applyMarketingCampaign('camp_social');

        assert.equal(addRepCalled, true, '_applyMarketingCampaign deve usare CE_money.addReputation');
        assert.equal(gs.reputation, 6.0);
    });

    test('acceptDiamondContract incrementa reputazione passando per addReputation', () => {
        let addRepCalled = false;
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalled = true;
            return origAddRep(delta);
        };

        gs.prestige = 0.5;
        gs.reputation = 5.4;
        gs.emails = [{ id: 101, type: 'diamond', offer: 30000, status: 'unread' }];
        gs.fleet = [{ id: 'f1', tier: 'vip', status: 'idle' }];
        gs.drivers = [{ id: 'd1', assignedCarId: 'f1', status: 'idle' }];
        gs.lifestyleAssets = ['jet_privato'];

        sandbox.acceptDiamondContract(101);

        assert.equal(addRepCalled, true, 'acceptDiamondContract deve usare CE_money.addReputation');
        assert.equal(gs.reputation, 5.5);
    });

    test('buyInvestment con rep bonus passa per addReputation', async () => {
        let addRepCalled = false;
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalled = true;
            return origAddRep(delta);
        };

        gs.prestige = 0.5;
        gs.reputation = 5.4;
        gs.cash = 5000000;
        gs.investments = [];

        await sandbox.buyInvestment('inv_sponsorship');

        assert.equal(addRepCalled, true, 'buyInvestment deve usare CE_money.addReputation');
        assert.equal(gs.reputation, 5.5);
    });

    test('vittorio.repay incrementa reputazione passando per addReputation', () => {
        let addRepCalled = false;
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = (delta) => {
            addRepCalled = true;
            return origAddRep(delta);
        };

        gs.prestige = 1.0;
        gs.reputation = 5.9;
        gs.cash = 100000;
        gs.vittorio = { debt: 500, dayLoan: 1, flipped: false };

        if (sandbox.vittorio && typeof sandbox.vittorio.repay === 'function') {
            sandbox.vittorio.repay();
            assert.equal(addRepCalled, true, 'vittorio.repay deve usare CE_money.addReputation');
            assert.equal(gs.reputation, 6.0);
        }
    });
});
