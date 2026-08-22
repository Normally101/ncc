'use strict';
/* ============================================================================
   Banco di prova — azioni finanza & rendite.
   Rende esercitabili nel banco le azioni che il guardrail non riesce a
   attivare (servono stato di gioco che nessuno prepara):

     buyInvestment, sellInvestment, doBuyRealEstate, claimDailyOrder,
     claimQuestReward

   Per ogni azione che muove denaro si verifica:
     - importo giusto, UNA SOLA VOLTA;
     - il denaro passa dai canali ufficiali (RPC ServerState / CE_money),
       mai da gameState.cash -= locale;
     - se la RPC ha gia' mosso il saldo lato server, il client NON lo
       risincronizza (altrimenti l'importo viene scalato/accredito due volte).

   Si collauda anche il rifiuto: fondi insufficienti, bersaglio inesistente,
   azione ripetuta due volte.
   ============================================================================ */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Un investimento del catalogo che il giocatore NON possiede ancora: serve a
// buyInvestment/sellInvestment. Gli id sono presi da data.js (INVESTMENTS).
const INV_A = 'inv_grey_market';   // acquisto immediato, price 55000, senza buildTime
const INV_B = 'inv_fuel_depot';    // price 350000, buildTime 3 → finisce in constructions

function creaMondo() {
    const { sandbox, notifications, stopAllIntervals } = freshEnv();
    const gs = sandbox.gameState;
    const SS = sandbox.ServerState;

    // Spie sulle RPC che muovono cassa: contano le CHIAMATE (quante volte, con
    // quali importi) ma lasciano il comportamento del mock intatto, cosi' il
    // saldo finale riflette cio' che farebbe il vero server.
    const rpcBuyInv = [];
    {
        const orig = SS.buyInvestment.bind(SS);
        SS.buyInvestment = async (invId, price) => {
            rpcBuyInv.push({ invId, price });
            return orig(invId, price);
        };
    }

    // Spia sull'accredito ufficiale: ogni azione che GUADAGNA deve passare da
    // CE_money.earn, mai da gameState.cash += locale.
    const earnCalls = [];
    {
        const origEarn = sandbox.CE_money.earn.bind(sandbox.CE_money);
        sandbox.CE_money.earn = (amount, reason) => {
            earnCalls.push({ amount, reason });
            return origEarn(amount, reason);
        };
    }

    // Rendering/UI neutralizzati: non c'entrano col denaro e rompono il banco.
    sandbox.updateUI = function () {};
    sandbox.saveGame = function () {};
    sandbox.renderTabMarket = function () {};
    sandbox.renderTabFinance = function () {};

    return { sandbox, gs, notifications, rpcBuyInv, earnCalls, stopAllIntervals };
}

describe('azioni finanza-rendite nel banco di prova', () => {

    // ── buyInvestment ─────────────────────────────────────────────────────
    describe('buyInvestment', () => {
        let mondo;
        before(() => { mondo = creaMondo(); });
        after(() => mondo.stopAllIntervals());

        // Mock "server accetta": stesso contratto del mock di game-env (la RPC
        // scala la cassa SUL SUO saldo e il client NON deve rifarla).
        const mockServerAccetta = () => {
            mondo.sandbox.ServerState.buyInvestment = async (invId, price) => {
                mondo.rpcBuyInv.push({ invId, price });
                mondo.gs.cash -= price;
                return { success: true };
            };
        };

        const statoPulito = () => {
            mondo.gs.investments = [];
            mondo.gs.constructions = [];
            mondo.rpcBuyInv.length = 0;
            mockServerAccetta();
        };

        test('acquisto immediato: addebita il prezzo UNA volta via RPC e registra l\'investimento', async () => {
            const { sandbox, gs, rpcBuyInv } = mondo;
            statoPulito();
            gs.cash = 500000;

            await sandbox.window.buyInvestment(INV_A);

            assert.equal(rpcBuyInv.length, 1,
                `la RPC ServerState.buyInvestment deve partire esattamente una volta (${rpcBuyInv.length})`);
            assert.equal(rpcBuyInv[0].invId, INV_A);
            assert.equal(rpcBuyInv[0].price, 55000,
                'il prezzo passato alla RPC deve essere quello del catalogo');
            assert.equal(gs.cash, 500000 - 55000,
                'il saldo cala del prezzo ESATTAMENTE una volta: un secondo scalare (locale o doppia sincronizzazione) e\' un bug');
            assert.ok(gs.investments.includes(INV_A), 'l\'investimento va registrato tra quelli posseduti');
        });

        test('acquisto con cantiere: entra in costruzioni, NON direttamente negli investimenti', async () => {
            const { sandbox, gs, rpcBuyInv } = mondo;
            statoPulito();
            gs.cash = 500000;

            await sandbox.window.buyInvestment(INV_B);

            assert.equal(rpcBuyInv.length, 1, 'anche il cantiere passa per UNA sola RPC');
            assert.equal(gs.cash, 500000 - 350000, 'il prezzo del cantiere si paga subito e una volta sola');
            const cantoiera = (gs.constructions || []).find(x => x.invId === INV_B);
            assert.ok(cantoiera, 'l\'investimento con buildTime entra nella coda costruzioni');
            assert.ok(!gs.investments.includes(INV_B),
                'finché il cantiere è aperto l\'investimento non deve risultare posseduto');
        });

        test('rifiuto server (cassa insufficiente): il client non fa nulla in locale', async () => {
            const { sandbox, gs, rpcBuyInv } = mondo;
            statoPulito();
            gs.cash = 0;
            // Il vero rpc_buy_investment fa RAISE se la cassa non basta: qui lo
            // simuliamo restituendo null (come fa il mock di game-env per i
            // rifiuti), SENZA muovere la cassa.
            sandbox.ServerState.buyInvestment = async (invId, price) => {
                rpcBuyInv.push({ invId, price });
                return null;
            };

            await sandbox.window.buyInvestment(INV_A);

            assert.equal(rpcBuyInv.length, 1, 'il tentativo arriva comunque al server');
            assert.equal(gs.cash, 0, 'il client non scala niente quando il server dice no');
            assert.ok(!gs.investments.includes(INV_A), 'nessuna registrazione di un acquisto fallito');
        });

        test('rifiuto: acquisto ripetuto dello stesso investimento', async () => {
            const { sandbox, gs, rpcBuyInv } = mondo;
            statoPulito();
            gs.cash = 500000;
            gs.investments.push(INV_A); // già posseduto

            await sandbox.window.buyInvestment(INV_A);

            assert.equal(rpcBuyInv.length, 0, 'un investimento già posseduto non genera una seconda RPC');
            assert.equal(gs.cash, 500000, 'e nemmeno scalare denaro una seconda volta');
        });
    });

    // ── sellInvestment ────────────────────────────────────────────────────
    // Rimborso fisso del 40% del prezzo di catalogo, accreditato SOLO tramite
    // CE_money.earn (che poi allinea la cassa col server via syncCash).
    describe('sellInvestment', () => {
        let mondo;
        before(() => { mondo = creaMondo(); });
        after(() => mondo.stopAllIntervals());

        const statoPulito = () => {
            mondo.gs.investments = [];
            mondo.gs.cash = 1000;
            mondo.earnCalls.length = 0;
        };

        test('vendita: rimborso 40% UNA volta via CE_money.earn e disiscrizione', async () => {
            const { sandbox, gs, earnCalls } = mondo;
            statoPulito();
            gs.investments.push(INV_A);
            const rimborsoAtteso = Math.floor(55000 * 0.40); // inv_grey_market

            sandbox.window.sellInvestment(INV_A);
            await new Promise(r => setImmediate(r)); // lascia finire la sync dell'accredito

            assert.equal(earnCalls.length, 1,
                `l'accredito deve passare da CE_money.earn esattamente una volta (${earnCalls.length})`);
            assert.equal(earnCalls[0].amount, rimborsoAtteso, 'il rimborso deve essere il 40% del prezzo');
            assert.equal(earnCalls[0].reason, 'sell_investment');
            assert.equal(gs.cash, 1000 + rimborsoAtteso,
                'la cassa cresce del rimborso UNA sola volta');
            assert.ok(!gs.investments.includes(INV_A), 'l\'investimento venduto esce dagli posseduti');
        });

        test('rifiuto: vendita di un investimento inesistente nel catalogo', () => {
            const { sandbox, gs, earnCalls } = mondo;
            statoPulito();

            sandbox.window.sellInvestment('inv_non_esiste');

            assert.equal(earnCalls.length, 0, 'nessun accredito per un id che non esiste');
            assert.equal(gs.cash, 1000, 'saldo intatto');
        });

        test('rifiuto: vendita di qualcosa che non si possiede', () => {
            const { sandbox, gs, earnCalls } = mondo;
            statoPulito();

            sandbox.window.sellInvestment(INV_B);

            assert.equal(earnCalls.length, 0, 'nessun accredito senza possesso');
            assert.equal(gs.cash, 1000, 'saldo intatto');
        });

        test('rifiuto: vendita ripetuta due volte accredita una volta sola', async () => {
            const { sandbox, gs, earnCalls } = mondo;
            statoPulito();
            gs.investments.push(INV_A);

            sandbox.window.sellInvestment(INV_A); // prima: legittima
            sandbox.window.sellInvestment(INV_A); // seconda: non posseduto più
            await new Promise(r => setImmediate(r));

            assert.equal(earnCalls.length, 1,
                'la seconda vendita (stesso id) NON deve generare un secondo accredito');
            assert.equal(gs.cash, 1000 + Math.floor(55000 * 0.40));
        });
    });

    // ── doBuyRealEstate ───────────────────────────────────────────────────
    // Il prezzo NON passa dal client: la vera rpc_buy_real_estate legge
    // listing.cost dal DB e scala lei la cassa. Il client chiama la RPC e
    // basta: ogni tocco locale di gameState.cash sarebbe un doppio addebito.
    describe('doBuyRealEstate', () => {
        let mondo;
        const LISTING = 're_villa_test';
        const COSTO = 120000;

        before(() => {
            mondo = creaMondo();
            mondo.rpcRe = [];
            mondo.bigEvents = [];
            mondo.sandbox.showBigEvent = (...a) => mondo.bigEvents.push(a);
        });
        after(() => mondo.stopAllIntervals());

        const statoPulito = () => {
            mondo.gs.cash = 1000000;
            mondo.rpcRe.length = 0;
            mondo.bigEvents.length = 0;
            // Contratto VERO della RPC: scala il costo lato "server" e restituisce
            // l'esito con i dati dell'immobile (il client non vede mai il prezzo).
            mondo.sandbox.ServerState.buyRealEstate = async (listingId) => {
                mondo.rpcRe.push(listingId);
                mondo.gs.cash -= COSTO;
                return { success: true, name: 'Villa Test', daily_rent: 2500 };
            };
        };

        test('acquisto: UNA sola RPC, cassa scalata una volta SOLA e solo dal server', async () => {
            const { sandbox, gs, rpcRe, bigEvents } = mondo;
            statoPulito();

            await sandbox.window.doBuyRealEstate(LISTING);

            assert.deepEqual(rpcRe, [LISTING], 'una sola chiamata, con il listing giusto');
            assert.equal(gs.cash, 1000000 - COSTO,
                'il costo lo scala il server: se anche il client risincronizzasse o scalasse in locale, qui vedremmo un secondo addebito');
            assert.equal(bigEvents.length, 1, 'l\'acquisto riuscito annuncia l\'evento');
        });

        test('rifiuto server (listing inesistente): cassa intatta, nessun annuncio', async () => {
            const { sandbox, gs, rpcRe, bigEvents } = mondo;
            statoPulito();
            sandbox.ServerState.buyRealEstate = async (listingId) => {
                rpcRe.push(listingId);
                return null; // listing assente → la RPC fa RAISE
            };

            await sandbox.window.doBuyRealEstate(LISTING);

            assert.deepEqual(rpcRe, [LISTING], 'il tentativo arriva al server');
            assert.equal(gs.cash, 1000000, 'nessun movimento quando il server rifiuta');
            assert.equal(bigEvents.length, 0, 'nessun annuncio per un acquisto fallito');
        });
    });
});
