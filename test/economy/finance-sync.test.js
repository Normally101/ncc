'use strict';
/* ============================================================================
   test/economy/finance-sync.test.js

   Regressione per il bug economico in engine-finance.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupFinanceEnv() {
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

describe('engine-finance — sincronizzazione cassa col server (CE_money)', () => {

    describe('_payStockDividends', () => {
        test('accredita dividendi e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 100 };
            gs.stockHoldings = { OIL: { shares: 1200, avgCost: 85 } };
            gs.cash = 1000;
            // div = floor(1200 * 100 * 0.020 / 24) = floor(2400 / 24) = 100
            sandbox._payStockDividends();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1100);
            assert.deepEqual(syncedCash, [1100]);
        });

        test('senza wealth manager non accredita dividendi né sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [];
            gs.stockPrices = { OIL: 100 };
            gs.stockHoldings = { OIL: { shares: 1200, avgCost: 85 } };
            gs.cash = 1000;
            sandbox._payStockDividends();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_tickBrokerInvestments', () => {
        test('risolve investimento a scadenza, accredita payout e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.day = 1;
            gs.hour = 0; // currentHour = 24
            gs.cash = 2000;
            gs.brokerInvestments = [{
                id: 1,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                startHour: 0,
                endsHour: 24,
                minReturn: 0.10,
                maxReturn: 0.10,
                resolved: false,
                actualGain: null
            }];
            sandbox._tickBrokerInvestments();
            await new Promise(r => setImmediate(r));
            // gain = 1000, payout = 11000. cash = 2000 + 11000 = 13000
            assert.equal(gs.cash, 13000);
            assert.equal(gs.brokerInvestments[0].resolved, true);
            assert.deepEqual(syncedCash, [13000]);
        });
    });

    describe('buyStocks & sellStocks', () => {
        test('buyStocks scala totale costo azioni e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 100 };
            gs.stockHoldings = { OIL: { shares: 0, avgCost: 0 } };
            gs.cash = 5000;

            sandbox.buyStocks('OIL', 20); // costo 2000
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 3000);
            assert.equal(gs.stockHoldings.OIL.shares, 20);
            assert.deepEqual(syncedCash, [3000]);
        });

        test('buyStocks con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 100 };
            gs.stockHoldings = { OIL: { shares: 0, avgCost: 0 } };
            gs.cash = 500;

            sandbox.buyStocks('OIL', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500);
            assert.equal(gs.stockHoldings.OIL.shares, 0);
            assert.deepEqual(syncedCash, []);
        });

        test('sellStocks accredita incasso e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 120 };
            gs.stockHoldings = { OIL: { shares: 10, avgCost: 100 } };
            gs.cash = 1000;

            sandbox.sellStocks('OIL', 5); // proceeds = 600
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1600);
            assert.equal(gs.stockHoldings.OIL.shares, 5);
            assert.deepEqual(syncedCash, [1600]);
        });

        test('sellStocks senza quote sufficienti non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 120 };
            gs.stockHoldings = { OIL: { shares: 2, avgCost: 100 } };
            gs.cash = 1000;

            sandbox.sellStocks('OIL', 5);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1000);
            assert.equal(gs.stockHoldings.OIL.shares, 2);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('placeBrokerInvestment', () => {
        test('scala il capitale investito e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.brokerInvestments = [];
            gs.cash = 15000;

            sandbox.placeBrokerInvestment(5000, 'low', 12);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.equal(gs.brokerInvestments.length, 1);
            assert.deepEqual(syncedCash, [10000]);
        });

        test('fondi insufficienti: non avvia investimento e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.brokerInvestments = [];
            gs.cash = 1000;

            sandbox.placeBrokerInvestment(5000, 'low', 12);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1000);
            assert.equal(gs.brokerInvestments.length, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyLifestyleAsset', () => {
        test('scala il prezzo dell\'asset e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.lifestyleAssets = [];
            gs.cash = 5000000;

            // attico_milano costa 2800000
            sandbox.buyLifestyleAsset('attico_milano');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 2200000);
            assert.deepEqual(gs.lifestyleAssets, ['attico_milano']);
            assert.deepEqual(syncedCash, [2200000]);
        });

        test('fondi insufficienti: non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.lifestyleAssets = [];
            gs.cash = 100000;

            sandbox.buyLifestyleAsset('attico_milano');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.deepEqual(gs.lifestyleAssets, []);
            assert.deepEqual(syncedCash, []);
        });

        test('asset già posseduto: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.lifestyleAssets = ['attico_milano'];
            gs.cash = 5000000;

            sandbox.buyLifestyleAsset('attico_milano');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('shortSell & coverShort', () => {
        test('shortSell blocca margine (20%) e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 100 };
            gs.cash = 10000;

            // 10 shares * 100 * 0.20 = 200 margine
            sandbox.shortSell('OIL', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 9800);
            assert.equal(gs.shortMarginHeld, 200);
            assert.deepEqual(syncedCash, [9800]);
        });

        test('shortSell con fondi insufficienti non apre short e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.stockPrices = { OIL: 100 };
            gs.cash = 50;

            sandbox.shortSell('OIL', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50);
            assert.deepEqual(syncedCash, []);
        });

        test('coverShort restituisce margine + profitto e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.shortPositions = { OIL: { shares: 10, openPrice: 100 } };
            gs.shortMarginHeld = 200;
            gs.stockPrices = { OIL: 80 };
            gs.cash = 5000;

            // profit = (100 - 80) * 10 = 200. marginReturn = 100 * 10 * 0.20 = 200. Total = 400
            sandbox.coverShort('OIL', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5400);
            assert.equal(gs.shortPositions.OIL, undefined);
            assert.deepEqual(syncedCash, [5400]);
        });

        test('coverShort senza posizione non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.shortPositions = {};
            gs.cash = 5000;

            sandbox.coverShort('OIL', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('donateToLobby & passLobbyLaw', () => {
        test('donateToLobby scala cash, assegna punti e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000);
            assert.equal(gs.lobbyingPoints, 5);
            assert.deepEqual(syncedCash, [5000]);
        });

        test('donateToLobby con fondi insufficienti non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 500;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500);
            assert.equal(gs.lobbyingPoints, 0);
            assert.deepEqual(syncedCash, []);
        });

        test('passLobbyLaw scala punti e costo in denaro sincronizzando con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            // law_ztl_exempt: pointsCost 5, cashCost 15000
            sandbox.passLobbyLaw('law_ztl_exempt');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 35000);
            assert.equal(gs.lobbyingPoints, 5);
            assert.deepEqual(gs.activeLobbyLaws, ['law_ztl_exempt']);
            assert.deepEqual(syncedCash, [35000]);
        });

        test('passLobbyLaw con fondi insufficienti non approva la legge né scala punti o chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 5000;
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_ztl_exempt');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.deepEqual(gs.activeLobbyLaws, []);
            assert.deepEqual(syncedCash, []);
        });

        test('passLobbyLaw con punti insufficienti non scala denaro né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.lobbyingPoints = 2;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_ztl_exempt');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 2);
            assert.deepEqual(gs.activeLobbyLaws, []);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('acquireVentureStake & divestVentureStake', () => {
        test('acquireVentureStake scala costo quota e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.reputation = 3.0;
            gs.cash = 100000;
            gs.ventureCapital = [];

            // vc_startup: valuation 500000, 10% = 50000
            sandbox.acquireVentureStake('vc_startup', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.deepEqual(gs.ventureCapital, [{ agencyId: 'vc_startup', stakePercent: 10 }]);
            assert.deepEqual(syncedCash, [50000]);
        });

        test('acquireVentureStake con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.reputation = 3.0;
            gs.cash = 10000;
            gs.ventureCapital = [];

            sandbox.acquireVentureStake('vc_startup', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(gs.ventureCapital, []);
            assert.deepEqual(syncedCash, []);
        });

        test('acquireVentureStake con quota oltre il massimo non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.reputation = 3.0;
            gs.cash = 500000;
            gs.ventureCapital = [{ agencyId: 'vc_startup', stakePercent: 40 }];

            // vc_startup maxStake is 49. 40 + 20 = 60 > 49 -> should fail
            sandbox.acquireVentureStake('vc_startup', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500000);
            assert.deepEqual(gs.ventureCapital, [{ agencyId: 'vc_startup', stakePercent: 40 }]);
            assert.deepEqual(syncedCash, []);
        });

        test('divestVentureStake accredita rimborso (75%) e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 1000;
            gs.ventureCapital = [{ agencyId: 'vc_startup', stakePercent: 10 }];

            // vc_startup: valuation 500000, 10% = 50000 -> 75% = 37500. Cash = 1000 + 37500 = 38500
            sandbox.divestVentureStake('vc_startup');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 38500);
            assert.deepEqual(gs.ventureCapital, []);
            assert.deepEqual(syncedCash, [38500]);
        });

        test('divestVentureStake con quota non posseduta non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 1000;
            gs.ventureCapital = [];

            sandbox.divestVentureStake('vc_startup');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
