'use strict';
/* ============================================================================
   test/progression/reputation-cap.test.js — Verifica unificazione tetto reputazione

   Verifica che ogni via di guadagno/perdita di reputazione nel gioco
   utilizzi la porta unica CE_money.addReputation e rispetti il tetto 5.0 + prestige.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('tetto reputazione unificato (5.0 + prestige)', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv({ render: true });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('CE_money.addReputation rispetta il tetto con prestigio = 0 (max 5.0)', () => {
        gs.prestige = 0;
        gs.reputation = 4.9;
        sandbox.CE_money.addReputation(0.3);
        assert.equal(gs.reputation, 5.0);
    });

    test('CE_money.addReputation rispetta il tetto esteso con prestigio = 2 (max 7.0)', () => {
        gs.prestige = 2;
        gs.reputation = 5.5;
        sandbox.CE_money.addReputation(0.5);
        assert.equal(gs.reputation, 6.0);
    });

    test('CE_money.addReputation non scende mai sotto zero per penalita', () => {
        gs.prestige = 0;
        gs.reputation = 0.2;
        sandbox.CE_money.addReputation(-0.5);
        assert.equal(gs.reputation, 0);
    });

    test('buyLifestyleAsset aumenta reputazione oltre 5.0 se prestige > 0', () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.0;
        gs.cash = 10000000;
        gs.lifestyleAssets = [];
        sandbox.buyLifestyleAsset('attico_milano'); // repBonus: 0.3
        assert.equal(Number(gs.reputation.toFixed(1)), 5.3);
    });

    test('repayVittorio aumenta reputazione oltre 5.0 se prestige > 0', () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.0;
        gs.cash = 10000;
        sandbox._vittorioDebt();
        sandbox.repayVittorio(500);
        assert.equal(Number(gs.reputation.toFixed(1)), 5.3);
    });

    test('diamond contract aumenta reputazione oltre 5.0 se prestige > 0', () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.0;
        gs.lifestyleAssets = ['jet_privato'];
        gs.fleet = [{ id: 'v1', tier: 'vip', status: 'idle' }];
        const email = { id: 101, type: 'diamond', offer: 40000, status: 'unread' };
        gs.emails = [email];
        sandbox.acceptDiamondContract(101);
        assert.equal(Number(gs.reputation.toFixed(1)), 5.2);
    });

    test('campagna marketing applica repBonus rispettando il tetto con prestigio', () => {
        gs.prestige = 2; // tetto 7.0
        gs.reputation = 5.2;
        gs.cash = 1000000;
        gs.brandVolume = 80;
        gs.brandPrestige = 80;
        sandbox._applyMarketingCampaign('mktg_prestige_final'); // repBonus: 0.2
        assert.equal(Number(gs.reputation.toFixed(1)), 5.4);
    });

    test('investimenti con bonus reputazione rispettano il tetto con prestigio', () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.1;
        gs.cash = 1000000;
        sandbox.buyInvestment('inv_academy'); // rep: 0.2
        assert.equal(Number(gs.reputation.toFixed(1)), 5.3);
    });

    test('riposo CEO 5 stelle aumenta reputazione rispettando il tetto con prestigio', async () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.0;
        gs.cash = 10000;
        await sandbox.rest(5); // repGain: 0.1
        assert.equal(Number(gs.reputation.toFixed(1)), 5.1);
    });

    test('VTK shop boost reputazione incrementa la reputazione oltre 5.0 con prestigio', () => {
        gs.prestige = 1; // tetto 6.0
        gs.reputation = 5.0;
        const item = sandbox.VTK_SHOP_ITEMS.find(i => i.id === 'rep_boost_01');
        assert.ok(item);
        const res = item.apply(gs);
        assert.equal(res.ok, true);
        assert.equal(Number(gs.reputation.toFixed(1)), 5.2);
    });
});
