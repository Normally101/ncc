'use strict';
/* ============================================================================
   test/progression/reputation-cap.test.js — Tetto reputazione con prestigio.

   Verifica che OGNI strada nel gioco che incrementa o decrementa la reputazione
   rispetti la formula unica del tetto: `5.0 + (gameState.prestige || 0)`
   e il pavimento `0.0`, transitando correttamente attraverso `CE_money.addReputation`.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('reputazione — tetto dinamico basato sul prestigio (5.0 + prestige)', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv({ render: true });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        gs.prestige = 2.0; // Tetto atteso: 7.0★
        gs.reputation = 5.0; // Già al cap base di 5.0★
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('CE_money.addReputation rispetta il tetto 5.0 + prestige e il floor 0', () => {
        sandbox.CE_money.addReputation(1.5);
        assert.equal(Number(gs.reputation.toFixed(1)), 6.5, 'con prestige 2.0 il tetto è 7.0, rep deve salire a 6.5');

        sandbox.CE_money.addReputation(2.0);
        assert.equal(Number(gs.reputation.toFixed(1)), 7.0, 'rep non deve superare il tetto di 7.0');

        sandbox.CE_money.addReputation(-10.0);
        assert.equal(gs.reputation, 0, 'rep non deve scendere sotto 0');
    });

    test('buyLifestyleAsset (engine-finance.js) incrementa la reputazione oltre 5.0 con prestigio', () => {
        gs.cash = 10000000;
        gs.lifestyleAssets = [];

        // Trova un lifestyle asset con repBonus
        const asset = sandbox.LIFESTYLE_ASSETS.find(a => (a.repBonus || 0) > 0);
        assert.ok(asset, 'deve esistere almeno un lifestyle asset con repBonus');

        sandbox.buyLifestyleAsset(asset.id);
        const repAttesa = Number((5.0 + asset.repBonus).toFixed(2));
        assert.equal(Number(gs.reputation.toFixed(2)), repAttesa, 'il bonus reputazione dell asset deve superare 5.0');
    });

    test('repayVittorio (vittorio.js) incrementa la reputazione oltre 5.0 quando il debito è saldato', () => {
        gs.cash = 10000;
        const d = sandbox._vittorioDebt();
        assert.ok(d, 'debito Vittorio deve esistere');
        d.outstanding = 500;
        d.status = 'active';

        sandbox.repayVittorio(500);

        assert.equal(d.status, 'repaid');
        assert.equal(Number(gs.reputation.toFixed(1)), 5.3, 'repayVittorio deve portare rep da 5.0 a 5.3 con prestigio');
    });

    test('_applyMarketingCampaign (engine.js) incrementa la reputazione oltre 5.0 con prestigio', () => {
        gs.cash = 500000;
        gs.brandVolume = 100;
        gs.brandPrestige = 100;

        const camp = sandbox.MARKETING_CAMPAIGNS.find(c => (c.repBonus || 0) > 0);
        assert.ok(camp, 'deve esistere una campagna con repBonus');

        sandbox._applyMarketingCampaign(camp.id);
        const repAttesa = Number((5.0 + camp.repBonus).toFixed(2));
        assert.equal(Number(gs.reputation.toFixed(2)), repAttesa, 'marketing campaign deve incrementare rep oltre 5.0');
    });

    test('bivio morale quest (quests-data.js) incrementa la reputazione oltre 5.0 con prestigio', () => {
        gs.completedQuests = ['t05'];
        sandbox.startMissionRun('t06');
        assert.ok(sandbox.document.getElementById('bivio-modal'));

        // Opzione 'rifiuta' assegna +0.2★
        sandbox._applyBivioChoice('t06', 'rifiuta');

        assert.equal(Number(gs.reputation.toFixed(1)), 5.2, 'bivio t06 opzione rifiuta deve portare rep a 5.2');
    });

    test('claimQuestReward (quests.js) incrementa la reputazione oltre 5.0 con prestigio', () => {
        gs.claimableQuests = ['m01']; // m01 dà +0.2 rep
        gs.completedQuests = [];

        sandbox.claimQuestReward('m01');

        assert.equal(Number(gs.reputation.toFixed(1)), 5.2, 'claimQuestReward deve portare rep a 5.2 con prestigio');
    });
});
