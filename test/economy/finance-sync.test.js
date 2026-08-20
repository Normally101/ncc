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
        test('paga dividendi azionari aggregati e sincronizza col server una sola volta', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 10000;
            gs.stockPrices = { ENEL: 10, ISP: 5 };
            gs.stockHoldings = {
                ENEL: { shares: 240, avgCost: 10 },
                ISP: { shares: 480, avgCost: 5 }
            };
            sandbox._payStockDividends();
            await new Promise(r => setImmediate(r));

            // ENEL (dividendPct 0.07): 240 * 10 * 0.07 / 24 = 7
            // ISP (dividendPct 0.08): 480 * 5 * 0.08 / 24 = 8
            // Total dividends = 15
            assert.equal(gs.cash, 10015);
            assert.deepEqual(syncedCash, [10015]);
        });

        test('senza wealth manager non accredita dividendi e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [];
            gs.cash = 10000;
            gs.stockHoldings = { ENEL: { shares: 240, avgCost: 10 } };
            sandbox._payStockDividends();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_tickBrokerInvestments', () => {
        test('investimento broker completato accredita il payout e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 5000;
            gs.day = 1;
            gs.hour = 10;
            gs.brokerInvestments = [{
                id: 1,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                startHour: 0,
                endsHour: 24, // day 1 hour 10 = 34 >= 24
                minReturn: 0.05,
                maxReturn: 0.05,
                resolved: false,
                actualGain: null
            }];
            sandbox._tickBrokerInvestments();
            await new Promise(r => setImmediate(r));

            // gain = 10000 * 0.05 = 500, payout = 10500
            // cash = 5000 + 10500 = 15500
            assert.equal(gs.cash, 15500);
            assert.equal(gs.brokerInvestments[0].resolved, true);
            assert.deepEqual(syncedCash, [15500]);
        });
    });

    describe('repayLoan', () => {
        test('restituzione prestito scala la somma e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 20000;
            gs.loans = [{ id: 101, amount: 5000, original: 5000, remaining: 5000, rate: 0.05 }];
            sandbox.repayLoan(101);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.loans.length, 0);
            assert.deepEqual(syncedCash, [15000]);
        });

        test('fondi insufficienti: non rimborsa e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 1000;
            gs.loans = [{ id: 101, amount: 5000, original: 5000, remaining: 5000, rate: 0.05 }];
            sandbox.repayLoan(101);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.equal(gs.loans.length, 1);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('takeLoan', () => {
        test('accensione prestito accredita la somma e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 2000;
            gs.creditScore = 750; // GOLD: limit 2.000.000
            gs.loans = [];
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 52000);
            assert.equal(gs.loans.length, 1);
            assert.deepEqual(syncedCash, [52000]);
        });
    });

    describe('buyStocks', () => {
        test('compra azioni scala il costo totale e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 20000;
            gs.stockPrices = { ENEL: 10 };
            gs.stockHoldings = { ENEL: { shares: 0, avgCost: 0 } };
            sandbox.buyStocks('ENEL', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 19000);
            assert.equal(gs.stockHoldings.ENEL.shares, 100);
            assert.deepEqual(syncedCash, [19000]);
        });

        test('fondi insufficienti: non acquista azioni e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 500;
            gs.stockPrices = { ENEL: 10 };
            gs.stockHoldings = { ENEL: { shares: 0, avgCost: 0 } };
            sandbox.buyStocks('ENEL', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.equal(gs.stockHoldings.ENEL.shares, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('sellStocks', () => {
        test('vendi azioni accredita il ricavo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 5000;
            gs.stockPrices = { ENEL: 12 };
            gs.stockHoldings = { ENEL: { shares: 100, avgCost: 10 } };
            sandbox.sellStocks('ENEL', 50);
            await new Promise(r => setImmediate(r));

            // Ricavo: 12 * 50 = 600 -> Cash: 5000 + 600 = 5600
            assert.equal(gs.cash, 5600);
            assert.equal(gs.stockHoldings.ENEL.shares, 50);
            assert.deepEqual(syncedCash, [5600]);
        });

        test('quote non possedute: non vende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 5000;
            gs.stockPrices = { ENEL: 12 };
            gs.stockHoldings = { ENEL: { shares: 10, avgCost: 10 } };
            sandbox.sellStocks('ENEL', 50);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('placeBrokerInvestment', () => {
        test('piazza investimento broker scala il capitale e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 15000;
            gs.brokerInvestments = [];
            sandbox.placeBrokerInvestment(5000, 'low', 24);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.equal(gs.brokerInvestments.length, 1);
            assert.deepEqual(syncedCash, [10000]);
        });

        test('fondi insufficienti: non piazza investimento e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 2000;
            gs.brokerInvestments = [];
            sandbox.placeBrokerInvestment(5000, 'low', 24);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2000);
            assert.equal(gs.brokerInvestments.length, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyLifestyleAsset', () => {
        test('acquista lifestyle asset scala il prezzo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 200000;
            gs.lifestyleAssets = [];
            // rolex_sub costa 15000
            sandbox.buyLifestyleAsset('rolex_sub');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 185000);
            assert.deepEqual(gs.lifestyleAssets, ['rolex_sub']);
            assert.deepEqual(syncedCash, [185000]);
        });

        test('fondi insufficienti: non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 5000;
            gs.lifestyleAssets = [];
            sandbox.buyLifestyleAsset('rolex_sub');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(gs.lifestyleAssets, []);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('shortSell', () => {
        test('short sell scala il margine richiesto e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 10000;
            gs.stockPrices = { ENEL: 10 };
            sandbox.shortSell('ENEL', 100);
            await new Promise(r => setImmediate(r));

            // Margine: 10 * 100 * 0.20 = 200 -> Cash: 10000 - 200 = 9800
            assert.equal(gs.cash, 9800);
            assert.equal(gs.shortPositions.ENEL.shares, 100);
            assert.deepEqual(syncedCash, [9800]);
        });

        test('fondi insufficienti per margine: non apre short e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 100;
            gs.stockPrices = { ENEL: 10 };
            sandbox.shortSell('ENEL', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('coverShort', () => {
        test('cover short accredita margine e profitto e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Wealth Manager' }];
            gs.cash = 1000;
            gs.stockPrices = { ENEL: 8 };
            gs.shortPositions = { ENEL: { shares: 100, openPrice: 10 } };
            gs.shortMarginHeld = 200;
            sandbox.coverShort('ENEL', 100);
            await new Promise(r => setImmediate(r));

            // priceDiff = 10 - 8 = 2, profit = 2 * 100 = 200
            // marginReturn = 10 * 100 * 0.20 = 200
            // Total payout: 400 -> Cash: 1000 + 400 = 1400
            assert.equal(gs.cash, 1400);
            assert.deepEqual(syncedCash, [1400]);
        });
    });

    describe('donateToLobby', () => {
        test('donazione lobby scala la donazione e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            sandbox.donateToLobby(3000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 7000);
            assert.equal(gs.lobbyingPoints, 3);
            assert.deepEqual(syncedCash, [7000]);
        });

        test('fondi insufficienti: non dona e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 500;
            sandbox.donateToLobby(3000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('passLobbyLaw', () => {
        test('approvazione legge con cashCost scala punti e cash sincronizzando con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.lobbyingPoints = 50;
            gs.activeLobbyLaws = [];
            // law_fuel_subsidy: pointsCost 20, cashCost 15000
            sandbox.passLobbyLaw('law_fuel_subsidy');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 35000);
            assert.equal(gs.lobbyingPoints, 30);
            assert.deepEqual(gs.activeLobbyLaws, ['law_fuel_subsidy']);
            assert.deepEqual(syncedCash, [35000]);
        });

        test('punti insufficienti: non approva e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.lobbyingPoints = 5;
            gs.activeLobbyLaws = [];
            sandbox.passLobbyLaw('law_fuel_subsidy');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 5);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('acquireVentureStake & divestVentureStake', () => {
        test('acquireVentureStake scala il costo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.reputation = 4.5;
            gs.ventureCapital = [];
            // va_startup: valuation 100000, maxStake 49, minRep 3.5
            sandbox.acquireVentureStake('va_startup', 20);
            await new Promise(r => setImmediate(r));

            // cost: 100000 * 20 / 100 = 20000 -> Cash: 50000 - 20000 = 30000
            assert.equal(gs.cash, 30000);
            assert.deepEqual(gs.ventureCapital, [{ agencyId: 'va_startup', stakePercent: 20 }]);
            assert.deepEqual(syncedCash, [30000]);
        });

        test('acquireVentureStake con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 5000;
            gs.reputation = 4.5;
            gs.ventureCapital = [];
            sandbox.acquireVentureStake('va_startup', 20);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(gs.ventureCapital, []);
            assert.deepEqual(syncedCash, []);
        });

        test('divestVentureStake accredita il rimborso e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            gs.ventureCapital = [{ agencyId: 'va_startup', stakePercent: 20 }];
            // refund: 100000 * 20 / 100 * 0.75 = 15000 -> Cash: 10000 + 15000 = 25000
            sandbox.divestVentureStake('va_startup');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 25000);
            assert.deepEqual(gs.ventureCapital, []);
            assert.deepEqual(syncedCash, [25000]);
        });
    });
});
