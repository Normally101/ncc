'use strict';
/* ============================================================================
   test/economy/finance-resto.test.js

   Test per le rimanenti funzioni finanziarie in engine-finance.js:
     - _payStockDividends (accredito dividendi azionari)
     - _tickBrokerInvestments (accredito payout chiusura investimento)
     - repayLoan (rimborso prestito)
     - takeLoan (richiesta prestito)
     - buyLifestyleAsset (acquisto beni di lusso / lifestyle)
     - passLobbyLaw (approvazione leggi con costo in cassa)

   Tutte le movimentazioni di denaro DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
        },
    });

    const gs = env.sandbox.gameState;
    gs.staff = gs.staff || [];
    gs.staff.push({ id: 'ewm', name: 'Elite Wealth Manager', salary: 5000 });

    return { env, sandbox: env.sandbox, gs, syncedCash };
}

describe('engine-finance — dividendi, broker payout, prestiti, lifestyle e leggi (CE_money)', () => {

    describe('_payStockDividends', () => {
        test('_payStockDividends accredita i dividendi tramite CE_money.earn e sincronizza', async () => {
            const { env, sandbox, gs, syncedCash } = setupEnv();
            const tickers = vm.runInContext('STOCK_TICKERS', sandbox);
            const ticker = tickers.find(t => t.dividendPct > 0) || tickers[0];

            gs.cash = 10000;
            gs.stockPrices = { [ticker.id]: 100 };
            gs.stockHoldings = { [ticker.id]: { shares: 1000, avgCost: 80 } };

            // Calcolo dividendo atteso: Math.floor(1000 * 100 * dividendPct / 24)
            const expectedDiv = Math.floor(1000 * 100 * ticker.dividendPct / 24);
            assert.ok(expectedDiv > 0, 'Il dividendo calcolato deve essere positivo');

            vm.runInContext('_payStockDividends()', sandbox);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000 + expectedDiv, 'il cash deve essere accreditato dei dividendi');
            assert.deepEqual(syncedCash, [10000 + expectedDiv], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.totalDividendsEarned, expectedDiv);
        });
    });

    describe('_tickBrokerInvestments', () => {
        test('_tickBrokerInvestments accredita il payout tramite CE_money.earn e sincronizza', async () => {
            const { env, sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 20000;
            gs.day = 1;
            gs.hour = 10;
            gs.emails = [];

            // Investimento scaduto
            gs.brokerInvestments = [{
                id: 1,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                minReturn: 0.05,
                maxReturn: 0.10,
                startHour: 0,
                endsHour: 5, // minore di day*24 + hour (34)
                resolved: false,
                actualGain: null,
            }];

            vm.runInContext('_tickBrokerInvestments()', sandbox);
            await new Promise(r => setImmediate(r));

            const inv = gs.brokerInvestments.find(i => i.id === 1);
            assert.ok(inv.resolved, 'Investimento deve essere contrassegnato come risolto');
            const expectedPayout = inv.capital + inv.actualGain;
            assert.equal(gs.cash, 20000 + expectedPayout, 'il cash deve ricevere il payout completo');
            assert.deepEqual(syncedCash, [20000 + expectedPayout], 'syncCash deve ricevere il nuovo saldo');
        });
    });

    describe('takeLoan e repayLoan', () => {
        test('takeLoan accredita il prestito tramite CE_money.earn e sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 5000;

            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 55000, 'il cash deve essere accreditato del prestito');
            assert.deepEqual(syncedCash, [55000], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.loans.length, 1);
        });

        test('repayLoan scala il saldo tramite CE_money.spend e sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 5000;
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));
            syncedCash.length = 0;

            const loanId = gs.loans[0].id;
            sandbox.repayLoan(loanId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il cash deve scalare l importo rimborsato');
            assert.deepEqual(syncedCash, [5000], 'syncCash deve ricevere il nuovo saldo dopo il rimborso');
            assert.equal(gs.loans.length, 0);
        });

        test('repayLoan con fondi insufficienti non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 5000;
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));
            syncedCash.length = 0;

            // Riduci cash simulando altre spese
            gs.cash = 100;
            const loanId = gs.loans[0].id;
            sandbox.repayLoan(loanId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 1, 'il prestito non deve essere rimosso');
        });
    });

    describe('buyLifestyleAsset', () => {
        test('buyLifestyleAsset acquista l asset, scala il prezzo tramite CE_money.spend e sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const asset = assets[0];

            gs.cash = asset.price + 10000;
            const initialCash = gs.cash;

            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, initialCash - asset.price, 'il cash deve essere scalato del prezzo');
            assert.deepEqual(syncedCash, [initialCash - asset.price], 'syncCash deve ricevere il nuovo saldo');
            assert.ok(gs.lifestyleAssets.includes(asset.id), 'l asset deve essere aggiunto alla lista');
        });

        test('buyLifestyleAsset con fondi insufficienti non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const asset = assets[0];

            gs.cash = 100;
            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.deepEqual(syncedCash, []);
            assert.ok(!gs.lifestyleAssets || !gs.lifestyleAssets.includes(asset.id));
        });
    });

    describe('passLobbyLaw', () => {
        test('passLobbyLaw con cashCost scala il cash tramite CE_money.spend e sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws.find(l => l.cashCost > 0);

            gs.lobbyingPoints = law.pointsCost + 5;
            gs.cash = law.cashCost + 10000;
            const initialCash = gs.cash;

            sandbox.passLobbyLaw(law.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, initialCash - law.cashCost, 'il cash deve essere scalato del costo legge');
            assert.deepEqual(syncedCash, [initialCash - law.cashCost], 'syncCash deve ricevere il nuovo saldo');
            assert.ok(gs.activeLobbyLaws.includes(law.id), 'la legge deve essere attivata');
            assert.equal(gs.lobbyingPoints, 5, 'i punti lobbying devono essere scalati');
        });

        test('passLobbyLaw con fondi insufficienti non attiva la legge e non consuma punti', async () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws.find(l => l.cashCost > 0);

            gs.lobbyingPoints = law.pointsCost + 5;
            gs.cash = law.cashCost - 100;

            sandbox.passLobbyLaw(law.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, law.cashCost - 100);
            assert.deepEqual(syncedCash, []);
            assert.ok(!gs.activeLobbyLaws || !gs.activeLobbyLaws.includes(law.id));
            assert.equal(gs.lobbyingPoints, law.pointsCost + 5, 'i punti lobbying non devono essere scalati');
        });
    });
});
