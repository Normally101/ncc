'use strict';
/* ============================================================================
   test/economy/finance-borsa.test.js

   Test per le 5 funzioni di borsa e broker in engine-finance.js:
     - buyStocks
     - sellStocks
     - shortSell
     - coverShort
     - placeBrokerInvestment
   Tutte le movimentazioni di denaro DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/** Un titolo vero del listino di data.js: OIL, CARS, TECH, LUX, BIO. */
const TICKER = 'OIL';

function setupFinanceEnv() {
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
    // Assumi Elite Wealth Manager per abilitare le azioni finanziarie
    gs.staff = gs.staff || [];
    gs.staff.push({ id: 'ewm', name: 'Elite Wealth Manager', salary: 5000 });

    // Inizializza tickers e prezzi se necessario
    if (!gs.stockPrices) gs.stockPrices = {};
    if (!gs.stockHoldings) gs.stockHoldings = {};
    if (!gs.brokerInvestments) gs.brokerInvestments = [];
    if (!gs.shortPositions) gs.shortPositions = {};

    /* I titoli veri di data.js. La prima stesura usava un ticker inventato
       ('AUTOGRILL'): buyStocks usciva subito su `if (!ticker)`, i controlli sul
       percorso buono fallivano e — peggio — quelli sui rifiuti passavano senza
       provare niente, perche' la funzione non arrivava mai al punto in cui
       avrebbe potuto sbagliare.
       Si leggono da dentro la sandbox: `const STOCK_TICKERS` a top-level di
       data.js finisce nello scope lessicale del contesto, non fra le proprieta'
       di `env.sandbox`, quindi da fuori non si vede. */
    const tickers = vm.runInContext('STOCK_TICKERS', env.sandbox);
    if (!tickers || !tickers.length) throw new Error('STOCK_TICKERS non caricato: il test non proverebbe niente');
    if (!tickers.some(t => t.id === TICKER)) {
        throw new Error(`il titolo ${TICKER} non esiste piu' in data.js: aggiorna il test`);
    }
    tickers.forEach(t => {
        gs.stockPrices[t.id] = t.basePrice;
        gs.stockHoldings[t.id] = { shares: 0, avgCost: 0 };
    });

    return { env, sandbox: env.sandbox, gs, syncedCash };
}

describe('engine-finance — borsa e broker (CE_money)', () => {

    describe('buyStocks', () => {
        test('buyStocks scala la spesa e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            const price = gs.stockPrices[tickerId] || 10;
            const shares = 100;
            const totalCost = Math.round(price * shares);

            gs.cash = 50000;
            sandbox.buyStocks(tickerId, shares);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000 - totalCost, 'il cash deve essere scalato');
            assert.deepEqual(syncedCash, [50000 - totalCost], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.stockHoldings[tickerId].shares, 100);
        });

        test('buyStocks con fondi insufficienti non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            const shares = 10000;

            gs.cash = 100;
            sandbox.buyStocks(tickerId, shares);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.stockHoldings[tickerId].shares, 0);
        });

        test('buyStocks senza Elite Wealth Manager non effettua acquisto e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = []; // Rimuovi wealth manager
            gs.cash = 50000;

            sandbox.buyStocks(TICKER, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });

        test('buyStocks con quantità non valida non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;

            sandbox.buyStocks(TICKER, 0);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('sellStocks', () => {
        test('sellStocks accredita il ricavo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            const price = gs.stockPrices[tickerId] || 10;
            gs.stockHoldings[tickerId] = { shares: 50, avgCost: 8 };
            gs.cash = 1000;

            sandbox.sellStocks(tickerId, 30);
            await new Promise(r => setImmediate(r));

            const proceeds = Math.round(price * 30);
            assert.equal(gs.cash, 1000 + proceeds, 'il cash deve essere accreditato');
            assert.deepEqual(syncedCash, [1000 + proceeds], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.stockHoldings[tickerId].shares, 20);
        });

        test('sellStocks con quote insufficienti non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            gs.stockHoldings[tickerId] = { shares: 10, avgCost: 8 };
            gs.cash = 1000;

            sandbox.sellStocks(tickerId, 50);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.stockHoldings[tickerId].shares, 10);
        });

        test('sellStocks senza Elite Wealth Manager non vende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [];
            gs.stockHoldings[TICKER] = { shares: 50, avgCost: 8 };
            gs.cash = 1000;

            sandbox.sellStocks(TICKER, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('placeBrokerInvestment', () => {
        test('placeBrokerInvestment scala il capitale e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 20000;

            const profile = vm.runInContext('BROKER_RISK_PROFILES', sandbox)[0];
            sandbox.placeBrokerInvestment(5000, profile.id, 24);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000, 'il cash deve essere scalato');
            assert.deepEqual(syncedCash, [15000], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.brokerInvestments.length, 1);
        });

        test('placeBrokerInvestment con fondi insufficienti non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 2000;

            const profile = vm.runInContext('BROKER_RISK_PROFILES', sandbox)[0];
            sandbox.placeBrokerInvestment(5000, profile.id, 24);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.brokerInvestments.length, 0);
        });

        test('placeBrokerInvestment con capitale < 1000 non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 20000;

            const profile = vm.runInContext('BROKER_RISK_PROFILES', sandbox)[0];
            sandbox.placeBrokerInvestment(500, profile.id, 24);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.brokerInvestments.length, 0);
        });

        test('placeBrokerInvestment con 3 investimenti già attivi non piazza e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.brokerInvestments = [
                { id: 1, resolved: false },
                { id: 2, resolved: false },
                { id: 3, resolved: false },
            ];

            const profile = vm.runInContext('BROKER_RISK_PROFILES', sandbox)[0];
            sandbox.placeBrokerInvestment(5000, profile.id, 24);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.brokerInvestments.length, 3);
        });
    });

    describe('shortSell', () => {
        test('shortSell scala il margine richiesto (20%) e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            const price = gs.stockPrices[tickerId] || 10;
            const shares = 100;
            const margin = Math.round(price * shares * 0.20);

            gs.cash = 10000;
            sandbox.shortSell(tickerId, shares);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000 - margin, 'il margine deve essere scalato dal cash');
            assert.deepEqual(syncedCash, [10000 - margin], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.shortPositions[tickerId].shares, 100);
            assert.equal(gs.shortMarginHeld, margin);
        });

        test('shortSell con margine insufficiente non apre posizione e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            const shares = 10000;

            gs.cash = 50;
            sandbox.shortSell(tickerId, shares);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.shortPositions[tickerId], undefined);
        });

        test('shortSell senza Elite Wealth Manager non apre posizione e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [];
            gs.cash = 10000;

            sandbox.shortSell(TICKER, 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('coverShort', () => {
        test('coverShort accredita restituzione margine + profitto e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const tickerId = TICKER;
            gs.stockPrices[tickerId] = 8; // Il prezzo è sceso da 10 a 8 -> profitto!
            gs.shortPositions[tickerId] = { shares: 100, openPrice: 10 };
            gs.shortMarginHeld = 200; // 10 * 100 * 0.20
            gs.cash = 5000;

            sandbox.coverShort(tickerId, 100);
            await new Promise(r => setImmediate(r));

            // profit = (10 - 8) * 100 = 200
            // marginReturn = 10 * 100 * 0.20 = 200
            // total credited = 400
            assert.equal(gs.cash, 5400, 'il cash deve ricevere margine restituito + profitto');
            assert.deepEqual(syncedCash, [5400], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.shortPositions[tickerId], undefined);
            assert.equal(gs.shortMarginHeld, 0);
        });

        test('coverShort senza posizione short non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 5000;

            sandbox.coverShort(TICKER, 50);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });

        test('coverShort senza Elite Wealth Manager non chiude short e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.staff = [];
            gs.shortPositions[TICKER] = { shares: 100, openPrice: 10 };
            gs.cash = 5000;

            sandbox.coverShort(TICKER, 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
