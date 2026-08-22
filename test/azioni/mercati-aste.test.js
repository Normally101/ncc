'use strict';
/* ============================================================================
   test/azioni/mercati-aste.test.js — Banco di prova per le azioni dei mercati
   e delle aste che muovono denaro.

   Azioni collaudate (una sezione per funzione):
   - bidOnAuction      (engine-fleet.js, asta live NPC)
   - CE_cancelBid      (contracts.js)
   - listCarForSale    (engine-fleet.js, mercato NPC locale)
   - cancelListing     (engine-fleet.js)
   - buyP2PCar         (p2p-market.js, mercato P2P reale)

   Per ognuna valgono le tre regole del denaro:
   1. l'importo giusto, una volta sola;
   2. il movimento passa da window.CE_money, mai da un gameState.cash diretto;
   3. quando la RPC ha gia' mosso il saldo lato server si usa
      accreditatoDalServer / addebitatoDalServer e NON si risincronizza.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Ambiente pulito con mock Supabase che registra ogni RPC.
 */
function creaAmbiente(opzioni = {}) {
    const rpcCalls = [];
    const env = freshEnv({
        serverState: {
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    // Mock del client Supabase: registra le RPC e risponde con i dati forniti
    // dal test (rpcRisposte['nome_rpc'] -> { data, error }).
    const sb = {
        // Il test puo' istruire le risposte anche DOPO la creazione:
        // amb.supabase.risposte['nome_rpc'] = { data, error }.
        risposte: {},
        rpc: async (nome, args) => {
            rpcCalls.push({ nome, args });
            const pronta = sb.risposte[nome];
            if (pronta) return typeof pronta === 'function' ? await pronta(args) : pronta;
            return { data: null, error: null };
        },
        from: () => ({
            upsert: async () => ({ data: null, error: null }),
            select: () => ({
                gt: () => ({
                    order: () => ({
                        limit: async () => ({ data: [], error: null }),
                    }),
                }),
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
                eq: () => ({ data: [], error: null }),
            }),
        }),
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
    };
    env.sandbox.supabaseClient = sb;
    env.sandbox.currentUser = { id: 'user_test_1' };

    // Spia su CE_money: registra OGNI movimento di cassa senza cambiarne il
    // comportamento. Serve a dimostrare che la cassa si e' mossa SOLO tramite
    // la porta legale (delta cassa === somma movimenti registrati).
    const movimenti = [];
    const money = env.sandbox.CE_money;
    for (const nome of ['spend', 'earn', 'accreditatoDalServer', 'addebitatoDalServer']) {
        const orig = money[nome].bind(money);
        money[nome] = (...args) => {
            movimenti.push({ fn: nome, importo: args[0], motivo: args[1] });
            return orig(...args);
        };
    }

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcCalls,
        notifications: env.notifications,
        logs: env.logs,
        movimenti,
        supabase: sb,
    };
}

/** Somma algebrica dei movimenti registrati sulla cassa dalla spia CE_money. */
function saldoAttesoDaSpia(movimenti) {
    return movimenti.reduce((acc, m) => {
        if (!Number.isFinite(m.importo)) return acc;
        if (m.fn === 'spend' || m.fn === 'addebitatoDalServer') return acc - m.importo;
        return acc + m.importo; // earn, accreditatoDalServer
    }, 0);
}

describe('Mercati e Aste — azioni esercitabili nel banco di prova', () => {

    // ────────────────────────────────────────────────────────────────────────
    // 1. ASTA LIVE (bidOnAuction — engine-fleet.js)
    // ────────────────────────────────────────────────────────────────────────
    /* Asta NPC locale: nessuna RPC, il denaro si muove TUTTO via CE_money
       (earn per rimborsare l'offerta precedente, spend per quella nuova). */
    describe('bidOnAuction', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('prima offerta: addebita ESATTAMENTE una volta l\'importo offerto via CE_money', () => {
            const { sandbox, gs, movimenti } = amb;
            gs.activeAuction = { id: 'auc_1', name: 'Majestic Spirit', currentBid: 250000, minBid: 250000, playerBid: null };
            gs.cash = 300000;

            sandbox.bidOnAuction(260000);

            // Importo giusto, una volta sola: uno solo spend da 260.000...
            const spend = movimenti.filter(m => m.fn === 'spend');
            assert.equal(spend.length, 1, 'una sola spesa');
            assert.equal(spend[0].importo, 260000);
            assert.equal(spend[0].motivo, 'auction_bid');
            // ...nessun accredito, e la cassa combacia con quanto passato da CE_money
            const earn = movimenti.filter(m => m.fn === 'earn');
            assert.equal(earn.length, 0, 'nessun rimborso alla prima offerta');
            assert.equal(gs.cash, 300000 - 260000);
            assert.equal(gs.cash - 300000, saldoAttesoDaSpia(movimenti),
                'il delta di cassa deve coincidere coi soli movimenti CE_money');
            // Stato asta aggiornato
            assert.equal(gs.activeAuction.playerBid, 260000);
            assert.equal(gs.activeAuction.currentBid, 260000);
        });

        test('rilancio: rimborsa la precedente e scala la nuova (netto giusto, un movimento ciascuno)', () => {
            const { sandbox, gs, movimenti } = amb;
            gs.activeAuction = { id: 'auc_2', name: 'Majestic Spirit', currentBid: 260000, minBid: 250000, playerBid: 260000 };
            gs.cash = 40000;

            sandbox.bidOnAuction(280000);

            const earn = movimenti.filter(m => m.fn === 'earn');
            const spend = movimenti.filter(m => m.fn === 'spend');
            assert.equal(earn.length, 1, 'un rimborso');
            assert.equal(earn[0].importo, 260000, 'rimborsa la vecchia offerta');
            assert.equal(earn[0].motivo, 'auction_bid_refund');
            assert.equal(spend.length, 1, 'un addebito');
            assert.equal(spend[0].importo, 280000);
            assert.equal(gs.cash, 40000 + 260000 - 280000, 'netto: +vecchia −nuova');
            assert.equal(gs.cash - 40000, saldoAttesoDaSpia(movimenti));
            assert.equal(gs.activeAuction.playerBid, 280000);
        });

        test('offerta troppo bassa: rifiutata senza muovere un euro', () => {
            const { sandbox, gs, movimenti, notifications } = amb;
            gs.activeAuction = { id: 'auc_3', name: 'Majestic Spirit', currentBid: 250000, minBid: 250000, playerBid: null };
            gs.cash = 500000;

            sandbox.bidOnAuction(240000);

            assert.equal(movimenti.length, 0, 'nessun movimento di cassa');
            assert.equal(gs.cash, 500000);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('Offerta troppo bassa')));
        });

        test('fondi insufficienti: rifiutata senza muovere un euro', () => {
            const { sandbox, gs, movimenti, notifications } = amb;
            gs.activeAuction = { id: 'auc_4', name: 'Majestic Spirit', currentBid: 250000, minBid: 250000, playerBid: null };
            gs.cash = 100000;

            sandbox.bidOnAuction(260000);

            assert.equal(movimenti.length, 0, 'nessun movimento di cassa');
            assert.equal(gs.cash, 100000);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('Liquidità insufficiente')));
            assert.equal(gs.activeAuction.playerBid, null, 'l\'offerta non viene registrata');
        });

        test('nessuna asta attiva: non crasha e non muove nulla', () => {
            const { sandbox, gs, movimenti } = amb;
            gs.activeAuction = null;
            gs.cash = 70000;

            assert.doesNotThrow(() => sandbox.bidOnAuction(10000));

            assert.equal(movimenti.length, 0);
            assert.equal(gs.cash, 70000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. BANDI CORPORATE (CE_cancelBid — contracts.js)
    // ────────────────────────────────────────────────────────────────────────
    /* Annullamento offerta su bando corporate: il pledge scalato da
       CE_placeBid torna in cassa tramite CE_money.earn, una volta sola. */
    describe('CE_cancelBid', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbiente();
            amb.gs.corporateTenders = [];
        });
        afterEach(() => amb.env.stopAllIntervals());

        function preparaBandoConOfferta(gs) {
            // Il catalogo aziende e' un const dentro il contesto VM: si legge da li'.
            const company = vm.runInContext('CORPORATE_COMPANIES[0]', amb.sandbox);
            gs.corporateTenders.push({
                id: 'tndr_test_1',
                companyId: company.company_name,
                company,
                openedDay: 1, closingDay: 3,
                playerBid: null,
                status: 'open',
            });
            gs.cash = 30000;
            // Offerta reale via porta legale: scala il pledge di 20.000 -> cassa 10.000
            amb.sandbox.CE_placeBid('tndr_test_1', 20000);
            return gs.corporateTenders[0];
        }

        test('annulla l\'offerta e rimborsa ESATTAMENTE il pledge, una volta', () => {
            const { sandbox, gs, movimenti } = amb;
            const tender = preparaBandoConOfferta(gs);
            assert.equal(tender.playerBid.pledgedCash, 20000, 'preparazione: pledge attivo');

            sandbox.CE_cancelBid('tndr_test_1');

            const earn = movimenti.filter(m => m.fn === 'earn' && m.motivo === 'corporate_bid_cancel');
            assert.equal(earn.length, 1, 'un solo rimborso');
            assert.equal(earn[0].importo, 20000);
            assert.equal(gs.cash, 30000, 'pledge rimborsato per intero: netto zero sul giro');
            // Il delta complessivo (spend della preparazione − earn del rimborso)
            // combacia coi soli movimenti CE_money: nessuna scrittura diretta.
            assert.equal(gs.cash - 30000, saldoAttesoDaSpia(movimenti));
            assert.equal(tender.playerBid, null, 'offerta azzerata');
        });

        test('azione ripetuta due volte (doppio click): il rimborso avviene UNA sola volta', () => {
            const { sandbox, gs, movimenti } = amb;
            const tender = preparaBandoConOfferta(gs);

            sandbox.CE_cancelBid('tndr_test_1');
            sandbox.CE_cancelBid('tndr_test_1'); // secondo click: nessun playerBid

            const earn = movimenti.filter(m => m.fn === 'earn' && m.motivo === 'corporate_bid_cancel');
            assert.equal(earn.length, 1, 'nessun doppio rimborso');
            assert.equal(gs.cash, 30000, 'tornata alla cassa di partenza, nemmeno un euro di piu\'');
        });

        test('bersaglio inesistente o senza offerta: nessun movimento, nessun crash', () => {
            const { sandbox, gs, movimenti } = amb;
            const company = vm.runInContext('CORPORATE_COMPANIES[0]', amb.sandbox);
            gs.corporateTenders.push({ id: 'tndr_vuoto', company, status: 'open', playerBid: null });
            gs.cash = 12000;

            assert.doesNotThrow(() => sandbox.CE_cancelBid('tndr_inesistente'));
            assert.doesNotThrow(() => sandbox.CE_cancelBid('tndr_vuoto'));

            assert.equal(movimenti.filter(m => m.motivo === 'corporate_bid_cancel').length, 0);
            assert.equal(gs.cash, 12000);
        });

        test('offerta con pledge zero: annulla senza muovere cassa', () => {
            const { sandbox, gs, movimenti } = amb;
            gs.corporateTenders.push({
                id: 'tndr_zero', company: vm.runInContext('CORPORATE_COMPANIES[0]', amb.sandbox),
                status: 'open', playerBid: { pledgedCash: 0, score: 50 },
            });
            gs.cash = 9000;

            sandbox.CE_cancelBid('tndr_zero');

            assert.equal(movimenti.length, 0, 'pledge zero: nessun earn');
            assert.equal(gs.cash, 9000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. MERCATO AUTO NPC LOCALE (listCarForSale, cancelListing — engine-fleet.js)
    // ────────────────────────────────────────────────────────────────────────
    /* Storia dei "due magazzini": un tempo esistevano due vendite diverse
       (questa locale e quella P2P) e il rischio era che si pubblicasse in un
       registro e si ritirasse dall'altro. Qui si dimostra che list e cancel
       parlano dello STESSO registro, gameState.marketplace: se qualcuno
       li disallinea di nuovo, il ciclo completo qui sotto diventa rosso. */
    describe('listCarForSale e cancelListing — lo stesso magazzino', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('listCarForSale pubblica l\'annuncio senza muovere cassa e senza togliere l\'auto dalla flotta', () => {
            const { sandbox, gs, movimenti } = amb;
            const car = { id: 'c_vend_1', name: 'Stellar E-Executive', tier: 'business' };
            gs.fleet.push(car);
            gs.cash = 45000;

            sandbox.listCarForSale('c_vend_1', 30000);

            assert.equal((gs.marketplace || []).length, 1);
            const listing = gs.marketplace[0];
            assert.equal(listing.carId, 'c_vend_1');
            assert.equal(listing.askPrice, 30000);
            // La vendita NPC non incassa ora (l'acquirente arriva dopo): zero movimenti.
            assert.equal(movimenti.length, 0, 'nessun movimento di cassa alla pubblicazione');
            assert.equal(gs.cash, 45000);
            assert.ok(gs.fleet.some(c => c.id === 'c_vend_1'), 'l\'auto resta in flotta finche\' non viene venduta');
        });

        test('listCarForSale rifiuta: edizione limitata, auto gia\' in vendita, autista al lavoro', () => {
            const { sandbox, gs, movimenti, notifications } = amb;
            gs.fleet.push({ id: 'c_ltd', name: 'Ltd', isLimitedEdition: true });
            gs.fleet.push({ id: 'c_dup', name: 'Dup' });
            gs.fleet.push({ id: 'c_busy', name: 'Busy' });
            gs.drivers.push({ id: 'd_busy', name: 'Franco', assignedCarId: 'c_busy', status: 'busy' });

            sandbox.listCarForSale('c_ltd', 10000);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));

            sandbox.listCarForSale('c_dup', 10000);
            sandbox.listCarForSale('c_dup', 12000); // seconda volta: veicolo già in vendita
            assert.ok(notifications.some(n => n.type === 'info' && n.msg.includes('già in vendita')));
            assert.equal((gs.marketplace || []).filter(l => l.carId === 'c_dup').length, 1,
                'nessun annuncio duplicato');

            sandbox.listCarForSale('c_busy', 10000);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('in servizio')));

            assert.equal((gs.marketplace || []).length, 1, 'solo l\'annuncio valido');
            assert.equal(movimenti.length, 0);
        });

        test('ciclo completo list -> cancel: annuncio tolto dallo stesso magazzino, flotta intatta', () => {
            const { sandbox, gs, movimenti } = amb;
            const car = { id: 'c_ciclo', name: 'Volt 3-Urban', tier: 'business' };
            gs.fleet.push(car);
            gs.cash = 20000;

            sandbox.listCarForSale('c_ciclo', 18000);
            assert.equal(gs.marketplace.length, 1);

            sandbox.cancelListing(gs.marketplace[0].id);

            assert.equal(gs.marketplace.length, 0, 'il ritiro tocca lo stesso registro della pubblicazione');
            assert.equal(gs.fleet.filter(c => c.id === 'c_ciclo').length, 1,
                'l\'auto torna disponibile una volta sola, mai duplicata');
            assert.equal(movimenti.length, 0, 'il ciclo di vendita NPC non muove denaro');
            assert.equal(gs.cash, 20000);
        });

        test('cancelListing su bersaglio inesistente o ripetuto due volte: no-op silenziosa', () => {
            const { sandbox, gs, movimenti } = amb;
            const car = { id: 'c_noop', name: 'Auto' };
            gs.fleet.push(car);

            sandbox.listCarForSale('c_noop', 15000);
            const listingId = gs.marketplace[0].id;

            sandbox.cancelListing('m_inesistente');   // bersaglio che non c'e'
            sandbox.cancelListing(listingId);          // ritiro vero
            sandbox.cancelListing(listingId);          // secondo click

            assert.equal(gs.marketplace.length, 0);
            assert.doesNotThrow(() => sandbox.cancelListing('m_altro_inesistente'));
            assert.equal(movimenti.length, 0);
            assert.equal(gs.cash, 0, 'la cassa parte a zero in una nuova partita e non si muove');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. MERCATO P2P REALE (buyP2PCar — p2p-market.js)
    // ────────────────────────────────────────────────────────────────────────
    /* Qui il denaro si muove DENTRO rpc_buy_market_car: il client deve solo
       allineare la previsione locale con addebitatoDalServer, senza mai
       rispedire il saldo al server (syncCash). */
    describe('buyP2PCar', () => {
        let amb;
        beforeEach(() => {
            const syncCashCalls = [];
            amb = creaAmbiente({
                serverStateOverrides: {
                    syncCash: async (cash) => {
                        syncCashCalls.push(cash);
                        amb.gs.cash = cash;
                        return { success: true, cash };
                    },
                },
            });
            amb.syncCashCalls = syncCashCalls;
        });
        afterEach(() => amb.env.stopAllIntervals());

        function preparaListing(amb, prezzo) {
            const listing = {
                id: 'lst_1',
                seller_user_id: 'user_altro',
                seller_name: 'Concorrente',
                ask_price: prezzo,
                car_snapshot: { name: 'Majestic Spirit', tier: 'ultra' },
            };
            amb.sandbox._p2pMarket.listings = [listing];
            return listing;
        }

        test('acquisto riuscito: addebita il PREZZO PAGATO DAL SERVER una volta, via addebitatoDalServer, senza risincronizzare', async () => {
            const { sandbox, gs, movimenti, rpcCalls, syncCashCalls } = amb;
            preparaListing(amb, 42000);
            gs.cash = 100000;

            // Risposta RPC: il server ha GIA' scalato 40.000 (prezzo negoziato, non i 42k in vetrina)
            amb.supabase.risposte['rpc_buy_market_car'] = {
                data: { price_paid: 40000, fee: 2000, seller_name: 'Concorrente', car: { name: 'Majestic Spirit', tier: 'ultra' } },
                error: null,
            };

            await sandbox.buyP2PCar('lst_1');

            assert.equal(rpcCalls.length, 1, 'una sola RPC');
            assert.equal(rpcCalls[0].nome, 'rpc_buy_market_car');
            // Confronto per campo: gli argomenti nascono nel contesto VM e
            // deepStrictEqual li rifiuterebbe per il prototipo diverso.
            assert.equal(rpcCalls[0].args.v_listing_id, 'lst_1');

            const addebiti = movimenti.filter(m => m.fn === 'addebitatoDalServer');
            assert.equal(addebiti.length, 1, 'un solo addebito');
            assert.equal(addebiti[0].importo, 40000, 'si scala quello che il server ha davvero preso');
            assert.equal(addebiti[0].motivo, 'buy_p2p_car');
            assert.equal(movimenti.filter(m => m.fn === 'spend').length, 0,
                'non si usa spend: il saldo lato server e\' gia\' stato mosso dalla RPC');
            assert.equal(gs.cash, 60000);
            assert.equal(gs.cash - 100000, saldoAttesoDaSpia(movimenti));

            assert.equal(syncCashCalls.length, 0,
                'la RPC ha gia\' mosso il saldo: NESSUNA risincronizzazione dal client');
            assert.ok(gs.fleet.some(c => c.name === 'Majestic Spirit'), 'auto entrata in flotta');
        });

        test('fondi insufficienti: rifiutato PRIMA della RPC, senza muovere nulla', async () => {
            const { sandbox, gs, movimenti, rpcCalls, notifications } = amb;
            preparaListing(amb, 42000);
            gs.cash = 1000;

            await sandbox.buyP2PCar('lst_1');

            assert.equal(rpcCalls.length, 0, 'nessuna chiamata al server');
            assert.equal(movimenti.length, 0);
            assert.equal(gs.cash, 1000);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('inserzione inesistente (gia\' venduta): rifiutato senza toccare il server', async () => {
            const { sandbox, gs, movimenti, rpcCalls, notifications } = amb;
            gs.cash = 100000;
            amb.sandbox._p2pMarket.listings = [];

            await sandbox.buyP2PCar('lst_fantasma');

            assert.equal(rpcCalls.length, 0);
            assert.equal(movimenti.length, 0);
            assert.equal(gs.cash, 100000);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('non trovata')));
        });

        test('auto di se\' stessi: rifiutata senza chiamare la RPC', async () => {
            const { sandbox, gs, movimenti, rpcCalls, notifications } = amb;
            const listing = preparaListing(amb, 42000);
            listing.seller_user_id = 'user_test_1'; // il mio stesso annuncio
            gs.cash = 100000;

            await sandbox.buyP2PCar('lst_1');

            assert.equal(rpcCalls.length, 0);
            assert.equal(movimenti.length, 0);
            assert.ok(notifications.some(n => n.type === 'info' && n.msg.includes('tua stessa auto')));
        });

        test('RPC in errore: nessun addebito e nessuna auto in flotta', async () => {
            const { sandbox, gs, movimenti, rpcCalls, notifications } = amb;
            preparaListing(amb, 42000);
            gs.cash = 100000;
            amb.supabase.risposte['rpc_buy_market_car'] = { data: null, error: { message: 'P0001 listing gia\' venduto' } };

            await sandbox.buyP2PCar('lst_1');

            assert.equal(rpcCalls.length, 1);
            assert.equal(movimenti.length, 0, 'errore RPC: zero movimenti di cassa');
            assert.equal(gs.cash, 100000);
            assert.equal(gs.fleet.length, 1, 'solo l\'auto starter: niente auto fantasma');
            assert.ok(notifications.some(n => n.type === 'error'));
        });
    });

});
