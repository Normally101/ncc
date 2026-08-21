'use strict';
/* ============================================================================
   test/funzioni/finanza.test.js — Collaudo approfondito del modulo Finanza

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-finance.js`, `ui-finance.js`, `ui-investments.js` e dai
   relativi gestori in `ce-actions.js`.
   Verificare movimenti di denaro, segni, interessi, prestiti, inadempienza,
   multe, borsa, broker, lifestyle, venture capital, lobbying, macro-economia,
   rendering UI ed event delegation.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente di gioco con sandbox predisposta per la finanza.
 */
function creaAmbienteFinanza(opzioni = {}) {
    const syncedCash = [];
    const bigEvents = [];

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sandbox = env.sandbox;
    const gs = sandbox.gameState;

    // Carica ui-investments.js nel contesto sandbox
    const srcInvestments = fs.readFileSync(path.resolve(__dirname, '../../ui-investments.js'), 'utf8');
    vm.runInContext(srcInvestments, sandbox, { filename: 'ui-investments.js' });

    // Configura staff di default: se opzioni.withWealthManager è false, niente EWM
    gs.staff = gs.staff || [];
    if (opzioni.withWealthManager !== false) {
        gs.staff.push({ id: 'ewm', name: 'Elite Wealth Manager', salary: 5000 });
    }

    // Configura cassa e reputazione di base
    gs.cash = opzioni.cash !== undefined ? opzioni.cash : 50000;
    gs.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    gs.creditScore = opzioni.creditScore !== undefined ? opzioni.creditScore : 300;
    gs.loans = opzioni.loans ? [...opzioni.loans] : [];
    gs.activeFines = opzioni.activeFines ? [...opzioni.activeFines] : [];
    gs.brokerInvestments = opzioni.brokerInvestments ? [...opzioni.brokerInvestments] : [];
    gs.lifestyleAssets = opzioni.lifestyleAssets ? [...opzioni.lifestyleAssets] : [];
    gs.ventureCapital = opzioni.ventureCapital ? [...opzioni.ventureCapital] : [];
    gs.activeLobbyLaws = opzioni.activeLobbyLaws ? [...opzioni.activeLobbyLaws] : [];
    gs.shortPositions = opzioni.shortPositions ? { ...opzioni.shortPositions } : {};
    gs.emails = opzioni.emails ? [...opzioni.emails] : [];

    sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi DOM
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox,
        gs,
        syncedCash,
        bigEvents,
    };
}

describe('Modulo Finanza — Collaudo Completo e Ciclo di Vita', () => {

    /* ─────────────────────────────────────────────────────────────
       1. PRESTITI, LINEA DI CREDITO E RIMBORSI (takeLoan, repayLoan)
       ───────────────────────────────────────────────────────────── */
    describe('1. Prestiti, Linea di Credito e Rimborsi (takeLoan, repayLoan)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza({ creditScore: 650 }); }); // SILVER tier (fido 1M, rate 6%)
        afterEach(() => amb.env.stopAllIntervals());

        test('takeLoan accredita il capitale richiesto e apre la posizione debitoria', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 10000;

            sandbox.takeLoan(100000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 110000, 'il cash deve aumentare esattamente di 100.000€');
            assert.deepEqual(syncedCash, [110000], 'syncCash deve inviare il nuovo saldo');
            assert.equal(gs.loans.length, 1, 'un prestito deve essere registrato');

            const loan = gs.loans[0];
            assert.equal(loan.original, 100000);
            assert.equal(loan.amount, 100000);
            assert.equal(loan.remaining, 100000);
            assert.equal(loan.rate, 0.06, 'tasso tier SILVER deve essere 6%');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('approvato')));
        });

        test('takeLoan rifiuta importo che supera il fido massimo per il proprio Credit Score', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 10000;

            // Fido SILVER è 1.000.000€ -> richiediamo 1.500.000€
            sandbox.takeLoan(1500000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000, 'il cash non deve muoversi');
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Credit Score troppo basso')));
        });

        test('takeLoan rifiuta un prestito se la somma dei prestiti attivi supera il fido', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 10000;

            sandbox.takeLoan(800000); // Entro fido 1M
            await new Promise(r => setImmediate(r));
            assert.equal(gs.loans.length, 1);

            // Secondo prestito da 300.000€: 800k + 300k = 1.1M > 1M
            sandbox.takeLoan(300000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.loans.length, 1, 'il secondo prestito deve essere rifiutato');
            assert.equal(gs.cash, 810000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fido insufficiente')));
        });

        test('takeLoan rifiuta importi non validi (zero, negativi o NaN)', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 10000;

            sandbox.takeLoan(0);
            sandbox.takeLoan(-50000);
            sandbox.takeLoan('non_un_numero');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000, 'il cash non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 0);
        });

        test('repayLoan estingue il prestito, scala il debito dal saldo e aumenta il Credit Score', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 10000;
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));
            syncedCash.length = 0;

            const loanId = gs.loans[0].id;
            const initialScore = gs.creditScore;

            sandbox.repayLoan(loanId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000, 'il cash deve tornare al saldo iniziale');
            assert.deepEqual(syncedCash, [10000], 'syncCash riceve il saldo post-repay');
            assert.equal(gs.loans.length, 0, 'il prestito è rimosso');
            assert.equal(gs.creditScore, initialScore + 20, 'il credit score aumenta di +20');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('saldato')));
        });

        test('repayLoan con fondi insufficienti non estingue il prestito e non scala cash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));
            syncedCash.length = 0;

            // Spendi il denaro per rimanere senza liquidità
            gs.cash = 500;
            const loanId = gs.loans[0].id;

            sandbox.repayLoan(loanId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 1, 'il prestito deve restare attivo');
        });

        test('repayLoan su prestito inesistente o già saldato non effettua addebiti', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;

            sandbox.repayLoan(99999);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    /* ─────────────────────────────────────────────────────────────
       2. MATURAZIONE INTERESSI E AMMORTAMENTO MENSILE
       ───────────────────────────────────────────────────────────── */
    describe('2. Maturazione Interessi e Ammortamento Mensile (processDailyRoutines)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('al giorno 30 processDailyRoutines addebita la rata mensile calcolata con il tasso pattuito', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.day = 30;
            gs.loans = [
                { id: 1, original: 100000, amount: 100000, remaining: 100000, rate: 0.05 },
            ];

            // Rata: Math.ceil(100000 * 0.05) = 5000
            const cashPrima = gs.cash;
            sandbox.processDailyRoutines();

            const rataAttesa = 5000;
            assert.equal(gs.loans[0].amount, 100000 - rataAttesa, 'il debito residuo deve diminuire della rata pagata');
            assert.ok(gs.cash < cashPrima, 'il cash deve essere diminuito per effetto della rata');
        });

        test('quando l\'ammortamento azzera il prestito, il prestito viene rimosso automaticamente', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.day = 30;
            // Prestito residuo di soli 2000€ con rata del 10% (ma il pagamento estingue il rimanente)
            gs.loans = [
                { id: 1, original: 10000, amount: 1000, remaining: 1000, rate: 1.0 },
            ];

            sandbox.processDailyRoutines();

            assert.equal(gs.loans.length, 0, 'il prestito estinto deve essere rimosso da gameState.loans');
        });

        test('in giorni non multipli di 30 non viene addebitata alcuna rata di prestito', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.day = 15;
            gs.loans = [
                { id: 1, original: 100000, amount: 100000, remaining: 100000, rate: 0.05 },
            ];

            sandbox.processDailyRoutines();

            assert.equal(gs.loans[0].amount, 100000, 'il debito resta invariato a metà mese');
        });
    });

    /* ─────────────────────────────────────────────────────────────
       3. CASO PRESTITO NON RESTITUITO, INSOLVENZA E MULTE SCADUTE
       ───────────────────────────────────────────────────────────── */
    describe('3. Insolvenza, Cassa Negativa e Multe Scadute', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('cassa in rosso incrementa consecutiveRedDays e scatta il fallimento al 3° giorno', () => {
            const { sandbox, gs } = amb;
            let bankruptcyTriggered = false;
            sandbox._triggerBankruptcy = () => { bankruptcyTriggered = true; };

            gs.cash = -5000;
            gs.day = 1;
            sandbox.processDailyRoutines();
            assert.equal(gs.consecutiveRedDays, 1);
            assert.equal(bankruptcyTriggered, false);

            gs.day = 2;
            sandbox.processDailyRoutines();
            assert.equal(gs.consecutiveRedDays, 2);
            assert.equal(bankruptcyTriggered, false);

            gs.day = 3;
            sandbox.processDailyRoutines();
            assert.equal(gs.consecutiveRedDays, 3);
            assert.equal(bankruptcyTriggered, true, 'dopo 3 giorni in rosso deve scattare la bancarotta');
        });

        test('ritorno in cassa positiva azzera consecutiveRedDays', () => {
            const { sandbox, gs } = amb;
            gs.cash = -2000;
            sandbox.processDailyRoutines();
            assert.equal(gs.consecutiveRedDays, 1);

            // Rientro in attivo
            gs.cash = 5000;
            sandbox.processDailyRoutines();
            assert.equal(gs.consecutiveRedDays, 0);
        });

        test('multa scaduta viene auto-pagata con penale del 30% e passa a expired_paid', () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            gs.day = 5;
            gs.hour = 10;
            const currentH = gs.day * 24 + gs.hour;

            gs.activeFines = [
                { id: 'fine_1', amount: 1000, status: 'pending', expiresAt: currentH - 2 },
            ];

            const initialCash = gs.cash;
            sandbox.processDailyRoutines();

            const penaleAttesa = Math.floor(1000 * 1.30); // 1300€
            assert.equal(gs.activeFines[0].status, 'expired_paid');
            assert.ok(gs.cash <= initialCash - penaleAttesa, 'il saldo deve scontare la multa con penale del 30%');
        });

        test('multe non ancora scadute restano in stato pending', () => {
            const { sandbox, gs } = amb;
            gs.day = 5;
            gs.hour = 10;
            const currentH = gs.day * 24 + gs.hour;

            gs.activeFines = [
                { id: 'fine_ok', amount: 800, status: 'pending', expiresAt: currentH + 10 },
            ];

            sandbox.processDailyRoutines();
            assert.equal(gs.activeFines[0].status, 'pending');
        });
    });

    /* ─────────────────────────────────────────────────────────────
       4. CALCOLO DINAMICO CREDIT SCORE E TIER DI CREDITO
       ───────────────────────────────────────────────────────────── */
    describe('4. Calcolo Dinamico Credit Score e Tier (_updateCreditScore, _getCreditTier)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_getCreditTier assegna correttamente fido e tasso per ciascuna fascia', () => {
            const { sandbox } = amb;

            // BASIC (<500)
            const basic = sandbox._getCreditTier(450);
            assert.equal(basic.label, 'BASIC');
            assert.equal(basic.loanLimit, 100000);
            assert.equal(basic.rate, 0.12);

            // BRONZE (500..599)
            const bronze = sandbox._getCreditTier(550);
            assert.equal(bronze.label, 'BRONZE');
            assert.equal(bronze.loanLimit, 500000);
            assert.equal(bronze.rate, 0.08);

            // SILVER (600..699)
            const silver = sandbox._getCreditTier(650);
            assert.equal(silver.label, 'SILVER');
            assert.equal(silver.loanLimit, 1000000);
            assert.equal(silver.rate, 0.06);

            // GOLD (700..799)
            const gold = sandbox._getCreditTier(750);
            assert.equal(gold.label, 'GOLD');
            assert.equal(gold.loanLimit, 2000000);
            assert.equal(gold.rate, 0.045);

            // PLATINUM (>=800)
            const platinum = sandbox._getCreditTier(850);
            assert.equal(platinum.label, 'PLATINUM');
            assert.equal(platinum.loanLimit, 5000000);
            assert.equal(platinum.rate, 0.03);
        });

        test('_updateCreditScore calcola il punteggio combinando reputazione, cassa, prestiti e asset', () => {
            const { sandbox, gs } = amb;

            // Reputazione 5.0 (300 pt), Cassa 1.500.000€ (150 pt), Nessun debito
            gs.reputation = 5.0;
            gs.cash = 1500000;
            gs.loans = [];
            gs.lifestyleAssets = ['villa_como', 'attico_milano']; // +40 pt
            gs.achievements = ['ach_1', 'ach_2']; // +10 pt

            vm.runInContext('_updateCreditScore()', sandbox);

            // Base 300 + 300 + 150 + 40 + 10 = 800
            assert.equal(gs.creditScore, 800);

            // Aggiunta debito con alto utilizzo (>80%): -30 (active loan) - 50 (utilization) = -80
            gs.loans = [{ original: 100000, amount: 90000 }];
            vm.runInContext('_updateCreditScore()', sandbox);
            assert.equal(gs.creditScore, 720);
        });

        test('_updateCreditScore rispetta i limiti assoluti [300, 900]', () => {
            const { sandbox, gs } = amb;

            // Caso peggiore
            gs.reputation = 0;
            gs.cash = 0;
            gs.loans = Array(15).fill({ original: 10000, amount: 9000 });
            vm.runInContext('_updateCreditScore()', sandbox);
            assert.equal(gs.creditScore, 300, 'il punteggio non può scendere sotto 300');

            // Caso migliore
            gs.reputation = 5.0;
            gs.cash = 50000000;
            gs.loans = [];
            gs.lifestyleAssets = Array(20).fill('asset');
            gs.achievements = Array(20).fill('ach');
            vm.runInContext('_updateCreditScore()', sandbox);
            assert.equal(gs.creditScore, 900, 'il punteggio non può superare 900');
        });
    });

    /* ─────────────────────────────────────────────────────────────
       5. MERCATO AZIONARIO (buyStocks, sellStocks, Dividendi, Tick)
       ───────────────────────────────────────────────────────────── */
    describe('5. Mercato Azionario (buyStocks, sellStocks, Dividendi, Tick)', () => {
            let amb;
            beforeEach(() => {
                amb = creaAmbienteFinanza();
                vm.runInContext('_initStockPrices()', amb.sandbox);
            });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStocks scala spesa corretta, aggiorna le quote e il costo medio ponderato', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 100;
            gs.stockHoldings[ticker.id] = { shares: 10, avgCost: 80 };
            gs.cash = 20000;

            // Compra 10 quote a 100€ -> spesa 1000€
            sandbox.buyStocks(ticker.id, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 19000);
            assert.deepEqual(syncedCash, [19000]);
            assert.equal(gs.stockHoldings[ticker.id].shares, 20);
            // Nuovo costo medio: (10*80 + 10*100) / 20 = 90€
            assert.equal(gs.stockHoldings[ticker.id].avgCost, 90);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('acquistate')));
        });

        test('buyStocks senza Wealth Manager viene bloccato e notificato', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.staff = []; // Rimuovi EWM
            gs.cash = 20000;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];

            sandbox.buyStocks(ticker.id, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000);
            assert.deepEqual(syncedCash, []);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Wealth Manager')));
        });

        test('buyStocks rifiuta ticker inesistente o quantità <= 0', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 20000;

            sandbox.buyStocks('TICKER_FANTASMA', 10);
            sandbox.buyStocks('OIL', 0);
            sandbox.buyStocks('OIL', -5);
            sandbox.buyStocks('OIL', 'abc');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000);
            assert.deepEqual(syncedCash, []);
        });

        test('sellStocks accredita il ricavo, calcola il P&L e azzera avgCost alla vendita totale', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 120;
            gs.stockHoldings[ticker.id] = { shares: 50, avgCost: 100 };
            gs.cash = 5000;
            gs.totalStockProfit = 0;

            // Vendi tutte le 50 quote a 120€: ricavo 6000€, costo base 5000€, profitto 1000€
            sandbox.sellStocks(ticker.id, 50);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 11000, 'il cash riceve il ricavo lordo (5000 + 6000)');
            assert.deepEqual(syncedCash, [11000]);
            assert.equal(gs.stockHoldings[ticker.id].shares, 0);
            assert.equal(gs.stockHoldings[ticker.id].avgCost, 0, 'avgCost deve resettarsi a 0 a posizione chiusa');
            assert.equal(gs.totalStockProfit, 1000);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('vendute')));
        });

        test('sellStocks rifiuta vendita con quote insufficienti o quantità negative', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockHoldings[ticker.id] = { shares: 10, avgCost: 100 };
            gs.cash = 5000;

            sandbox.sellStocks(ticker.id, 50); // Più quote di quelle possedute
            sandbox.sellStocks(ticker.id, -10); // Quantità negativa
            sandbox.sellStocks(ticker.id, 0);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.stockHoldings[ticker.id].shares, 10);
        });

        test('_payStockDividends accredita dividendi orari in base a quote e rendimento annuo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const tickers = vm.runInContext('STOCK_TICKERS', sandbox);
            const divTicker = tickers.find(t => t.dividendPct > 0) || tickers[0];

            gs.cash = 10000;
            gs.stockPrices[divTicker.id] = 100;
            gs.stockHoldings[divTicker.id] = { shares: 2400, avgCost: 90 };

            // Formula: Math.floor(2400 * 100 * dividendPct / 24) = 10000 * dividendPct
            const divAtteso = Math.floor(2400 * 100 * divTicker.dividendPct / 24);
            assert.ok(divAtteso > 0);

            vm.runInContext('_payStockDividends()', sandbox);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000 + divAtteso);
            assert.deepEqual(syncedCash, [10000 + divAtteso]);
            assert.equal(gs.totalDividendsEarned, divAtteso);
        });

        test('_tickStockMarket aggiorna i prezzi rispettando il floor del 20% della base', () => {
            const { sandbox, gs } = amb;
            const tickers = vm.runInContext('STOCK_TICKERS', sandbox);

            // Simula crash estremo impostando i prezzi a 0
            tickers.forEach(t => { gs.stockPrices[t.id] = 0.01; });

            vm.runInContext('_tickStockMarket()', sandbox);

            tickers.forEach(t => {
                const floor = t.basePrice * 0.20;
                assert.ok(gs.stockPrices[t.id] >= floor, `Il prezzo di ${t.name} (${gs.stockPrices[t.id]}) non deve scendere sotto il floor di €${floor}`);
            });
        });

        test('_tickStockHistory registra lo storico orario e mantiene al massimo 24 punti', () => {
            const { sandbox, gs } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];

            for (let i = 0; i < 30; i++) {
                gs.stockPrices[ticker.id] = 100 + i;
                vm.runInContext('_tickStockHistory()', sandbox);
            }

            assert.equal(gs.stockHistory[ticker.id].length, 24, 'lo sparkline storico deve avere lunghezza max 24');
            assert.equal(gs.stockHistory[ticker.id][23], 129);
        });

        test('_tickStockMarket reagisce al sentiment delle breaking news e applica il bonus ufficio Wall Street', () => {
            const { sandbox, gs } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            const keyword = ticker.newsKeywords[0];
            sandbox._lastNewsForStocks = `Incredibile boom nel settore: ${keyword} registra utili record!`;
            gs.lifestyleAssets = ['ufficio_wall_street'];
            gs.stockPrices[ticker.id] = 100;

            vm.runInContext('_tickStockMarket()', sandbox);

            assert.ok(gs.stockPrices[ticker.id] > 0);
            assert.ok(typeof gs.stockPrices[ticker.id] === 'number');
        });

        test('_initStockPrices inizializza prezzi e stockHoldings se non definiti', () => {
            const { sandbox, gs } = amb;
            gs.stockPrices = {};
            gs.stockHoldings = {};

            vm.runInContext('_initStockPrices()', sandbox);

            const tickers = vm.runInContext('STOCK_TICKERS', sandbox);
            tickers.forEach(t => {
                assert.ok(gs.stockPrices[t.id] > 0, `Prezzo iniziale per ${t.id} deve essere definito`);
                assert.equal(gs.stockHoldings[t.id].shares, 0);
                assert.equal(gs.stockHoldings[t.id].avgCost, 0);
            });
        });

        test('_hasWealthManager riconosce la presenza di EWM nello staff', () => {
            const { sandbox, gs } = amb;
            gs.staff = [{ id: 'ewm' }];
            assert.equal(sandbox._hasWealthManager(), true);

            gs.staff = [{ id: 'mech' }];
            assert.equal(sandbox._hasWealthManager(), false);
        });
    });

    /* ─────────────────────────────────────────────────────────────
       6. SHORT SELLING E COPERTURA POSIZIONI ALLO SCOPERTO
       ───────────────────────────────────────────────────────────── */
    describe('6. Short Selling e Copertura Posizioni (shortSell, coverShort)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFinanza();
            amb.sandbox._initStockPrices();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('shortSell impegna il margine del 20% e apre la posizione short', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 50;
            gs.cash = 10000;

            // 100 quote @ 50€ = controvalore 5.000€ -> margine 20% = 1.000€
            sandbox.shortSell(ticker.id, 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 9000, 'il margine deve essere scalato dalla cassa');
            assert.deepEqual(syncedCash, [9000]);
            assert.equal(gs.shortPositions[ticker.id].shares, 100);
            assert.equal(gs.shortPositions[ticker.id].openPrice, 50);
            assert.equal(gs.shortMarginHeld, 1000);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Short')));
        });

        test('shortSell rifiuta operazione se margine insufficiente o quantità <= 0', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 100;
            gs.cash = 100; // Margine insufficiente per 100 quote (richiesti 2.000€)

            sandbox.shortSell(ticker.id, 100);
            sandbox.shortSell(ticker.id, 0);
            sandbox.shortSell(ticker.id, -10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.shortPositions[ticker.id], undefined);
        });

        test('coverShort in profitto restituisce il margine e accredita il guadagno', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 30; // Prezzo sceso da 50 a 30 -> profitto 20€/azione
            gs.shortPositions[ticker.id] = { shares: 100, openPrice: 50 };
            gs.shortMarginHeld = 1000;
            gs.cash = 5000;
            gs.totalStockProfit = 0;

            // Chiusura completa: profitto (50-30)*100 = 2000€, margine 1000€ -> accredito totale 3000€
            sandbox.coverShort(ticker.id, 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 8000);
            assert.deepEqual(syncedCash, [8000]);
            assert.equal(gs.shortPositions[ticker.id], undefined, 'la posizione short è chiusa');
            assert.equal(gs.shortMarginHeld, 0);
            assert.equal(gs.totalStockProfit, 2000);
        });

        test('coverShort parziale riduce la posizione e svincola la quota proporzionale di margine', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 40; // Profitto 10€/azione
            gs.shortPositions[ticker.id] = { shares: 100, openPrice: 50 };
            gs.shortMarginHeld = 1000;
            gs.cash = 5000;

            // Copertura parziale di 40 quote: profitto 400€, margine svincolato 400€ -> accredito 800€
            sandbox.coverShort(ticker.id, 40);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5800);
            assert.deepEqual(syncedCash, [5800]);
            assert.equal(gs.shortPositions[ticker.id].shares, 60);
            assert.equal(gs.shortMarginHeld, 600);
        });

        test('shortSell incrementa posizione short esistente ricalcolando la media ponderata openPrice', async () => {
            const { sandbox, gs } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.cash = 20000;
            gs.stockPrices[ticker.id] = 50;
            sandbox.shortSell(ticker.id, 100); // 100 quote @ 50€

            gs.stockPrices[ticker.id] = 70;
            sandbox.shortSell(ticker.id, 100); // 100 quote @ 70€

            assert.equal(gs.shortPositions[ticker.id].shares, 200);
            assert.equal(gs.shortPositions[ticker.id].openPrice, 60, 'prezzo medio open (50+70)/2 = 60€');
        });

        test('coverShort in perdita calcola il saldo negativo correttamente', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 60; // Prezzo salito da 50 a 60 -> perdita 10€/azione (-1000€)
            gs.shortPositions[ticker.id] = { shares: 100, openPrice: 50 };
            gs.shortMarginHeld = 1000; // Margine depositato: 1000€
            gs.cash = 5000;

            // Margine restituito (1000€) + perdita (-1000€) = 0€ netti accreditati
            sandbox.coverShort(ticker.id, 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(gs.totalStockProfit, -1000);
            assert.equal(gs.shortPositions[ticker.id], undefined);
        });
    });

    /* ─────────────────────────────────────────────────────────────
       7. BROKER PERSONALE E GESTIONE INVESTIMENTI
       ───────────────────────────────────────────────────────────── */
    describe('7. Broker Personale (placeBrokerInvestment, _tickBrokerInvestments)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('placeBrokerInvestment scala il capitale e avvia l\'investimento', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 30000;
            const profile = vm.runInContext('BROKER_RISK_PROFILES', sandbox)[0];

            sandbox.placeBrokerInvestment(10000, profile.id, 12);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000);
            assert.deepEqual(syncedCash, [20000]);
            assert.equal(gs.brokerInvestments.length, 1);

            const inv = gs.brokerInvestments[0];
            assert.equal(inv.capital, 10000);
            assert.equal(inv.risk, profile.id);
            assert.equal(inv.resolved, false);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Investimento')));
        });

        test('placeBrokerInvestment rifiuta investimenti se capitale < 1000 o se già 3 attivi', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            const profile = vm.runInContext('BROKER_RISK_PROFILES', sandbox)[0];

            // Rifiuto capitale < 1000
            sandbox.placeBrokerInvestment(500, profile.id, 6);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);

            // Simula 3 investimenti già attivi
            gs.brokerInvestments = [
                { id: 1, resolved: false },
                { id: 2, resolved: false },
                { id: 3, resolved: false },
            ];

            sandbox.placeBrokerInvestment(5000, profile.id, 6);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.equal(gs.brokerInvestments.length, 3);
        });

        test('_tickBrokerInvestments risolve l\'investimento a scadenza e accredita il payout', async () => {
            const { sandbox, gs, syncedCash, bigEvents } = amb;
            gs.cash = 10000;
            gs.day = 1;
            gs.hour = 20;
            const curH = gs.day * 24 + gs.hour; // 44

            gs.brokerInvestments = [{
                id: 1,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                minReturn: 0.05,
                maxReturn: 0.10,
                startHour: 10,
                endsHour: curH - 1, // Scaduto
                resolved: false,
                actualGain: null,
            }];

            vm.runInContext('_tickBrokerInvestments()', sandbox);
            await new Promise(r => setImmediate(r));

            const inv = gs.brokerInvestments.find(i => i.id === 1);
            assert.equal(inv.resolved, true);
            assert.ok(inv.actualGain >= 0, 'il guadagno effettivo deve essere valorizzato');

            const payoutAtteso = inv.capital + inv.actualGain;
            assert.equal(gs.cash, 10000 + payoutAtteso);
            assert.deepEqual(syncedCash, [10000 + payoutAtteso]);
            assert.equal(bigEvents.length, 1);
            assert.ok(gs.emails.some(e => e.type === 'broker_result'));
        });

        test('_tickBrokerInvestments non tocca investimenti non ancora scaduti', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 10000;
            gs.day = 1;
            gs.hour = 5;
            const curH = gs.day * 24 + gs.hour;

            gs.brokerInvestments = [{
                id: 1,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                minReturn: 0.05,
                maxReturn: 0.10,
                startHour: curH,
                endsHour: curH + 12, // Scade tra 12 ore
                resolved: false,
                actualGain: null,
            }];

            vm.runInContext('_tickBrokerInvestments()', sandbox);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.brokerInvestments[0].resolved, false);
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('_tickBrokerInvestments con ufficio Wall Street incrementa i rendimenti positivi del +15%', async () => {
            const { sandbox, gs } = amb;
            gs.lifestyleAssets = ['ufficio_wall_street'];
            gs.day = 1;
            gs.hour = 10;
            const curH = gs.day * 24 + gs.hour;

            gs.brokerInvestments = [{
                id: 10,
                capital: 10000,
                risk: 'low',
                riskName: 'Conservativo',
                minReturn: 0.10,
                maxReturn: 0.10, // Rendimento fisso +10% -> con bonus 1.15 diventa +11.5% (+1150€)
                startHour: 0,
                endsHour: curH - 1,
                resolved: false,
                actualGain: null,
            }];

            vm.runInContext('_tickBrokerInvestments()', sandbox);
            await new Promise(r => setImmediate(r));

            const inv = gs.brokerInvestments.find(i => i.id === 10);
            assert.equal(inv.actualGain, 1150, 'gain deve includere il +15% di bonus Wall Street');
        });

        test('_tickBrokerInvestments mantiene solo gli ultimi 5 investimenti risolti nell\'archivio', () => {
            const { sandbox, gs } = amb;
            gs.day = 1;
            gs.hour = 20;

            gs.brokerInvestments = [];
            for (let i = 1; i <= 8; i++) {
                gs.brokerInvestments.push({
                    id: i,
                    capital: 1000,
                    risk: 'low',
                    riskName: 'Conservativo',
                    minReturn: 0.05,
                    maxReturn: 0.10,
                    startHour: 0,
                    endsHour: 5,
                    resolved: false,
                    actualGain: null,
                });
            }

            vm.runInContext('_tickBrokerInvestments()', sandbox);

            const risolti = gs.brokerInvestments.filter(i => i.resolved);
            assert.equal(risolti.length, 5, 'devono essere conservati al massimo 5 investimenti risolti');
        });
    });

    /* ─────────────────────────────────────────────────────────────
       8. LIFESTYLE ASSETS, VENTURE CAPITAL & LOBBYING
       ───────────────────────────────────────────────────────────── */
    describe('8. Lifestyle Assets, Venture Capital & Lobbying', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyLifestyleAsset scala il prezzo, assegna l\'asset e sblocca tratte se previste', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const asset = vm.runInContext('LIFESTYLE_ASSETS', sandbox).find(a => a.intlUnlock) || vm.runInContext('LIFESTYLE_ASSETS', sandbox)[0];
            gs.cash = asset.price + 50000;
            gs.unlockedRegions = ['roma'];

            const cashPrima = gs.cash;
            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashPrima - asset.price);
            assert.deepEqual(syncedCash, [cashPrima - asset.price]);
            assert.ok(gs.lifestyleAssets.includes(asset.id));

            if (asset.intlUnlock) {
                assert.ok(gs.unlockedRegions.includes('svizzera'));
                assert.ok(gs.unlockedRegions.includes('costa_azzurra'));
            }
        });

        test('buyLifestyleAsset rifiuta asset già posseduto o fondi insufficienti', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const asset = vm.runInContext('LIFESTYLE_ASSETS', sandbox)[0];
            gs.lifestyleAssets = [asset.id];
            gs.cash = asset.price + 50000;

            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, asset.price + 50000);
            assert.deepEqual(syncedCash, []);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già posseduto')));
        });

        test('acquireVentureStake acquisisce quota, rispetta maxStake e scala il costo proporzionale', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const agency = vm.runInContext('VENTURE_AGENCIES', sandbox)[0];
            gs.reputation = agency.minRep + 0.5;
            gs.cash = agency.valuation;

            const cost10 = Math.floor(agency.valuation * 10 / 100);
            sandbox.acquireVentureStake(agency.id, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, agency.valuation - cost10);
            assert.deepEqual(syncedCash, [agency.valuation - cost10]);

            const stake = gs.ventureCapital.find(s => s.agencyId === agency.id);
            assert.ok(stake);
            assert.equal(stake.stakePercent, 10);
        });

        test('divestVentureStake disinveste al 75% della valutazione e rimuove la quota', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const agency = vm.runInContext('VENTURE_AGENCIES', sandbox)[0];
            gs.ventureCapital = [{ agencyId: agency.id, stakePercent: 20 }];
            gs.cash = 10000;

            const refund = Math.floor(agency.valuation * 20 / 100 * 0.75);
            sandbox.divestVentureStake(agency.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000 + refund);
            assert.deepEqual(syncedCash, [10000 + refund]);
            assert.equal(gs.ventureCapital.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('ceduta')));
        });

        test('donateToLobby e passLobbyLaw muovono cash e punti lobbying in modo coerente', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 0;

            // Donazione di 10.000€ -> +10 punti lobbying
            sandbox.donateToLobby(10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000);
            assert.deepEqual(syncedCash, [40000]);
            assert.equal(gs.lobbyingPoints, 10);

            // Approva legge da 5 pt e 5.000€
            const law = vm.runInContext('LOBBY_LAWS', sandbox)[0];
            law.pointsCost = 5;
            law.cashCost = 5000;

            sandbox.passLobbyLaw(law.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 35000);
            assert.deepEqual(syncedCash, [40000, 35000]);
            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(gs.activeLobbyLaws.includes(law.id));
        });

        test('acquireVentureStake rifiuta acquisizione se la quota supera maxStake o se rep insufficiente', async () => {
            const { sandbox, gs, env } = amb;
            const agency = vm.runInContext('VENTURE_AGENCIES', sandbox)[0];
            gs.reputation = agency.minRep - 1.0; // Reputazione troppo bassa
            gs.cash = 500000;

            sandbox.acquireVentureStake(agency.id, 5);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.ventureCapital.length, 0);

            // Reputazione sufficiente ma quota eccessiva
            gs.reputation = agency.minRep + 1.0;
            gs.ventureCapital = [{ agencyId: agency.id, stakePercent: agency.maxStake }];
            sandbox.acquireVentureStake(agency.id, 5);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.ventureCapital[0].stakePercent, agency.maxStake);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Quota massima')));
        });

        test('divestVentureStake su agenzia non posseduta non esegue rimborsi', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 10000;
            gs.ventureCapital = [];

            sandbox.divestVentureStake('agenzia_inesistente');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('passLobbyLaw rifiuta approvazione se legge già approvata o punti insufficienti', async () => {
            const { sandbox, gs, env } = amb;
            const law = vm.runInContext('LOBBY_LAWS', sandbox)[0];
            gs.lobbyingPoints = law.pointsCost - 1; // Punti insufficienti
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('punti lobbying')));

            // Legge già approvata
            gs.lobbyingPoints = law.pointsCost + 10;
            gs.activeLobbyLaws = [law.id];
            sandbox.passLobbyLaw(law.id);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già approvata')));
        });
    });

    /* ─────────────────────────────────────────────────────────────
       9. MACRO-ECONOMIA (Inflazione, Tassi BCE, Shock)
       ───────────────────────────────────────────────────────────── */
    describe('9. Macro-Economia (_tickMacroEconomy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_tickMacroEconomy mantiene inflazione e tassi nei range consentiti', () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.03;
            gs.interestRateBase = 0.04;

            for (let d = 1; d <= 60; d++) {
                gs.day = d;
                vm.runInContext('_tickMacroEconomy()', sandbox);

                assert.ok(gs.inflationRate >= 0.005 && gs.inflationRate <= 0.08, `Inflazione ${gs.inflationRate} fuori range al giorno ${d}`);
                assert.ok(gs.interestRateBase >= 0.005 && gs.interestRateBase <= 0.12, `Tasso BCE ${gs.interestRateBase} fuori range al giorno ${d}`);
            }
        });
    });

    /* ─────────────────────────────────────────────────────────────
       10. RENDERING UI E EVENT DELEGATION
       ───────────────────────────────────────────────────────────── */
    describe('10. Rendering UI e Event Delegation (renderTabFinance, renderTabInvestments, ce-actions)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFinanza();
            amb.sandbox._initStockPrices();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFinance senza Wealth Manager mostra schermata di blocco con CTA Staff', () => {
            const { sandbox, gs } = amb;
            gs.staff = []; // Niente EWM

            sandbox.renderTabFinance();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Finance Hub Bloccato'));
            assert.ok(c.innerHTML.includes('Elite Wealth Manager'));
            assert.ok(c.innerHTML.includes('switchTab'));
        });

        test('renderTabFinance con Wealth Manager disegna KPI, tabella borsa, broker e credito', () => {
            const { sandbox } = amb;

            sandbox.renderTabFinance();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Mercati Finanziari'));
            assert.ok(c.innerHTML.includes('Portfolio Totale'));
            assert.ok(c.innerHTML.includes('Mercato Azionario'));
            assert.ok(c.innerHTML.includes('Broker Personale'));
            assert.ok(c.innerHTML.includes('Credit Score'));
            assert.ok(c.innerHTML.includes('data-ce-act="ceStockAction"'));
            assert.ok(c.innerHTML.includes('data-ce-act="cePlaceBroker"'));
            assert.ok(c.innerHTML.includes('data-ce-act="takeLoan"'));
        });

        test('renderTabInvestments mostra portfolio, prestiti, venture capital e holding', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_loan_facility'];

            sandbox.renderTabInvestments();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Portfolio Investimenti'));
            assert.ok(c.innerHTML.includes('Linea di Credito'));
            assert.ok(c.innerHTML.includes('Venture Capital'));
            assert.ok(c.innerHTML.includes('Holding Finanziaria'));
        });

        test('ceStockAction legge la quantità dall\'input ed esegue l\'azione', async () => {
            const { sandbox, gs } = amb;
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 50;
            gs.cash = 10000;

            // Inietta input nel DOM come farebbe renderTabFinance
            sandbox.document.body.innerHTML += `<input id="stock-qty-${ticker.id}" value="20">`;

            sandbox.ceStockAction('buyStocks', ticker.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 9000, 'ha acquistato 20 quote @ 50€ = 1000€ spesi');
            assert.equal(gs.stockHoldings[ticker.id].shares, 20);
        });

        test('cePlaceBroker legge il form ed esegue placeBrokerInvestment', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 30000;
            sandbox.document.body.innerHTML += `<input id="broker-capital" value="15000">`;
            sandbox._brokerRisk = 'medium';
            sandbox._brokerDur = 24;

            sandbox.cePlaceBroker();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.brokerInvestments.length, 1);
            assert.equal(gs.brokerInvestments[0].capital, 15000);
            assert.equal(gs.brokerInvestments[0].risk, 'medium');
        });
    });

    /* ─────────────────────────────────────────────────────────────
       11. ASSENZA DI DOPPIO CONTEGGIO (ServerState & CE_money)
       ───────────────────────────────────────────────────────────── */
    describe('11. Integrità Denaro e Assenza di Doppio Conteggio', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFinanza(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('tutte le movimentazioni client-authoritative sincronizzano la cassa una sola volta', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;

            // 1. Prestito
            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));

            // 2. Acquisto azioni
            const ticker = vm.runInContext('STOCK_TICKERS', sandbox)[0];
            gs.stockPrices[ticker.id] = 100;
            sandbox.buyStocks(ticker.id, 100);
            await new Promise(r => setImmediate(r));

            // 3. Rimborso prestito
            sandbox.repayLoan(gs.loans[0].id);
            await new Promise(r => setImmediate(r));

            // Saldo finale atteso: 100k + 50k - 10k - 50k = 90.000€
            assert.equal(gs.cash, 90000);
            assert.deepEqual(syncedCash, [150000, 140000, 90000], 'ogni operazione deve aver chiamato syncCash esattamente una volta col saldo esatto');
        });
    });
});
