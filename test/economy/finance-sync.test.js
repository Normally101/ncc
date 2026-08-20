'use strict';
/* ============================================================================
   test/economy/finance-sync.test.js

   Regressione per la sincronizzazione economica in engine-finance.js:
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
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 10000;
            gs.stockPrices = { ENI: 100 };
            gs.stockHoldings = { ENI: { shares: 240, avgCost: 100 } };
            // dividendPct per ENI è 0.05 (o simile da STOCK_TICKERS)
            const ticker = sandbox.STOCK_TICKERS?.find(t => t.id === 'ENI') || { id: 'ENI', dividendPct: 0.1 };
            ticker.dividendPct = 0.10; // 240 * 100 * 0.10 / 24 = 100
            sandbox._payStockDividends();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10100);
            assert.deepEqual(syncedCash, [10100]);
        });

        test('senza Wealth Manager non accredita né sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [];
            gs.cash = 10000;
            gs.stockPrices = { ENI: 100 };
            gs.stockHoldings = { ENI: { shares: 240, avgCost: 100 } };
            sandbox._payStockDividends();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_tickBrokerInvestments', () => {
        test('quando un investimento scade accredita il payout e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 5000;
            gs.day = 1;
            gs.hour = 10;
            gs.brokerInvestments = [{
                id: 1,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                startHour: 0,
                endsHour: 24, // currentHour è 1*24+10 = 34 >= 24 -> scaduto
                minReturn: 0.1,
                maxReturn: 0.1,
                resolved: false,
                actualGain: null
            }];
            sandbox._tickBrokerInvestments();
            await new Promise(r => setImmediate(r));
            // Gain = 10000 * 0.1 = 1000, Payout = 11000, Cash = 5000 + 11000 = 16000
            assert.equal(gs.cash, 16000);
            assert.equal(gs.brokerInvestments[0].resolved, true);
            assert.deepEqual(syncedCash, [16000]);
        });
    });

    describe('repayLoan & takeLoan', () => {
        test('repayLoan scala il debito e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.loans = [{ id: 10, original: 20000, amount: 20000, remaining: 20000, rate: 0.05 }];
            sandbox.repayLoan(10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 30000);
            assert.equal(gs.loans.length, 0);
            assert.deepEqual(syncedCash, [30000]);
        });

        test('repayLoan con fondi insufficienti non modifica saldo né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 5000;
            gs.loans = [{ id: 10, original: 20000, amount: 20000, remaining: 20000, rate: 0.05 }];
            sandbox.repayLoan(10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000);
            assert.equal(gs.loans.length, 1);
            assert.deepEqual(syncedCash, []);
        });

        test('takeLoan accredita l\'importo del prestito e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            gs.creditScore = 600; // SILVER fido 1.000.000
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 60000);
            assert.equal(gs.loans.length, 1);
            assert.deepEqual(syncedCash, [60000]);
        });
    });

    describe('buyStocks & sellStocks', () => {
        test('buyStocks scala il costo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 50000;
            const ticker = sandbox.STOCK_TICKERS[0];
            gs.stockPrices = { [ticker.id]: 100 };
            gs.stockHoldings = { [ticker.id]: { shares: 0, avgCost: 0 } };
            sandbox.buyStocks(ticker.id, 100); // 100 * 100 = 10000
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 40000);
            assert.equal(gs.stockHoldings[ticker.id].shares, 100);
            assert.deepEqual(syncedCash, [40000]);
        });

        test('buyStocks con fondi insufficienti non scala né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 5000;
            const ticker = sandbox.STOCK_TICKERS[0];
            gs.stockPrices = { [ticker.id]: 100 };
            gs.stockHoldings = { [ticker.id]: { shares: 0, avgCost: 0 } };
            sandbox.buyStocks(ticker.id, 100);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000);
            assert.equal(gs.stockHoldings[ticker.id].shares, 0);
            assert.deepEqual(syncedCash, []);
        });

        test('sellStocks accredita il ricavo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 10000;
            const ticker = sandbox.STOCK_TICKERS[0];
            gs.stockPrices = { [ticker.id]: 150 };
            gs.stockHoldings = { [ticker.id]: { shares: 50, avgCost: 100 } };
            sandbox.sellStocks(ticker.id, 20); // 20 * 150 = 3000
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 13000);
            assert.equal(gs.stockHoldings[ticker.id].shares, 30);
            assert.deepEqual(syncedCash, [13000]);
        });
    });

    describe('placeBrokerInvestment', () => {
        test('scala il capitale investito e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 25000;
            gs.brokerInvestments = [];
            const risk = sandbox.BROKER_RISK_PROFILES[0].id;
            sandbox.placeBrokerInvestment(5000, risk, 24);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 20000);
            assert.equal(gs.brokerInvestments.length, 1);
            assert.deepEqual(syncedCash, [20000]);
        });

        test('senza fondi non piazza investimento e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 2000;
            gs.brokerInvestments = [];
            const risk = sandbox.BROKER_RISK_PROFILES[0].id;
            sandbox.placeBrokerInvestment(5000, risk, 24);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 2000);
            assert.equal(gs.brokerInvestments.length, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyLifestyleAsset', () => {
        test('scala il prezzo dell\'asset, assegna rep e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const asset = sandbox.LIFESTYLE_ASSETS[0]; // es. orologio, attico...
            gs.cash = asset.price + 10000;
            gs.reputation = 4.0;
            gs.lifestyleAssets = [];
            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.ok(gs.lifestyleAssets.includes(asset.id));
            assert.deepEqual(syncedCash, [10000]);
        });

        test('senza fondi non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const asset = sandbox.LIFESTYLE_ASSETS[0];
            gs.cash = asset.price - 100;
            gs.lifestyleAssets = [];
            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, asset.price - 100);
            assert.equal(gs.lifestyleAssets.length, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('shortSell & coverShort', () => {
        test('shortSell scala il margine e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 20000;
            const ticker = sandbox.STOCK_TICKERS[0];
            gs.stockPrices = { [ticker.id]: 100 };
            // 100 quote @ 100 = 10000 valore -> margine 20% = 2000
            sandbox.shortSell(ticker.id, 100);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 18000);
            assert.equal(gs.shortMarginHeld, 2000);
            assert.equal(gs.shortPositions[ticker.id].shares, 100);
            assert.deepEqual(syncedCash, [18000]);
        });

        test('coverShort accredita margine e profitto sincronizzando con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [{ id: 'ewm', name: 'Elite Wealth Manager' }];
            gs.cash = 10000;
            const ticker = sandbox.STOCK_TICKERS[0];
            gs.stockPrices = { [ticker.id]: 80 }; // sceso da 100 a 80
            gs.shortMarginHeld = 2000;
            gs.shortPositions = { [ticker.id]: { shares: 100, openPrice: 100 } };
            // profit = (100 - 80) * 100 = 2000, marginReturn = 100 * 100 * 0.20 = 2000 -> payout = 4000
            sandbox.coverShort(ticker.id, 100);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 14000);
            assert.equal(gs.shortPositions[ticker.id], undefined);
            assert.deepEqual(syncedCash, [14000]);
        });
    });

    describe('donateToLobby & passLobbyLaw', () => {
        test('donateToLobby scala donazione, assegna punti e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 15000;
            sandbox.donateToLobby(5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.equal(gs.lobbyingPoints, 5);
            assert.deepEqual(syncedCash, [10000]);
        });

        test('passLobbyLaw scala punti e cashCost sincronizzando con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const law = sandbox.LOBBY_LAWS.find(l => l.cashCost > 0) || sandbox.LOBBY_LAWS[0];
            law.cashCost = law.cashCost || 5000;
            gs.lobbyingPoints = law.pointsCost + 10;
            gs.cash = law.cashCost + 10000;
            gs.activeLobbyLaws = [];
            sandbox.passLobbyLaw(law.id);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.ok(gs.activeLobbyLaws.includes(law.id));
            assert.deepEqual(syncedCash, [10000]);
        });
    });

    describe('acquireVentureStake & divestVentureStake', () => {
        test('acquireVentureStake scala il costo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const agency = sandbox.VENTURE_AGENCIES[0];
            gs.reputation = agency.minRep + 1.0;
            // valuation 100000, stake 10% -> 10000
            agency.valuation = 100000;
            agency.maxStake = 30;
            gs.cash = 50000;
            gs.ventureCapital = [];
            sandbox.acquireVentureStake(agency.id, 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 40000);
            assert.deepEqual(gs.ventureCapital, [{ agencyId: agency.id, stakePercent: 10 }]);
            assert.deepEqual(syncedCash, [40000]);
        });

        test('divestVentureStake accredita il 75% della valutazione e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const agency = sandbox.VENTURE_AGENCIES[0];
            agency.valuation = 100000;
            gs.cash = 5000;
            gs.ventureCapital = [{ agencyId: agency.id, stakePercent: 10 }];
            // refund = 100000 * 10 / 100 * 0.75 = 7500 -> cash = 5000 + 7500 = 12500
            sandbox.divestVentureStake(agency.id);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 12500);
            assert.deepEqual(gs.ventureCapital, []);
            assert.deepEqual(syncedCash, [12500]);
        });
    });
});
