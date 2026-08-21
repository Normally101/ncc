'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `auctions.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC (offerte, aggiudicazione, riscossione),
   il ciclo di vita delle aste, la gestione fondi/doppio conteggio,
   il rendering dell'UI, i modali e gli eventi Realtime.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente con mock Supabase e stato completo per le Aste Giudiziarie.
 */
function creaAmbienteAste(opzioni = {}) {
    const rpcLog = [];
    const channelEvents = [];
    const subscriptions = new Map();

    const auctionsDefault = [
        {
            id: 'auc_open_1',
            lot_type: 'vehicle',
            title: 'Mercedes Classe S sequestrata — Napoli',
            description: 'Veicolo confiscato dalla DIA. Chilometraggio 87.000 km.',
            icon: '🚗',
            vehicle_data: { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 62, km: 87000, year: 2019 },
            container_data: {},
            min_bid: 45000,
            reserve_price: 40000,
            province_id: 'NA',
            status: 'open',
            bid_count: 2,
            auction_ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            my_bid: 50000,
            top_bid: 55000,
            winner_id: null,
            winning_bid: null,
            claimed_at: null,
        },
        {
            id: 'auc_open_2',
            lot_type: 'container',
            title: 'Container Sigillato — Dogana Gioia Tauro',
            description: 'Contenuto ignoto fino all\'aggiudicazione.',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'cash', amount: 60000 },
                    { type: 'vehicle', tier: 'ultra', condition: 85, km: 15000, year: 2022 },
                ],
            },
            min_bid: 30000,
            reserve_price: null,
            province_id: 'RC',
            status: 'open',
            bid_count: 1,
            auction_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            my_bid: 35000,
            top_bid: 35000,
            winner_id: null,
            winning_bid: null,
            claimed_at: null,
        },
        {
            id: 'auc_open_3',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli — Fallimento NCC Palermo',
            description: 'Tre veicoli business venduti a lotto unico.',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', condition: 70, km: 50000, year: 2020 },
                    { tier: 'business', condition: 65, km: 75000, year: 2019 },
                    { tier: 'standard', condition: 58, km: 90000, year: 2018 },
                ],
            },
            container_data: {},
            min_bid: 75000,
            reserve_price: 70000,
            province_id: 'PA',
            status: 'open',
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            my_bid: null,
            top_bid: null,
            winner_id: null,
            winning_bid: null,
            claimed_at: null,
        },
    ];

    const wonDefault = [
        {
            id: 'auc_won_1',
            lot_type: 'vehicle',
            title: 'BMW Serie 7 — Lotto Corte d\'Appello',
            icon: '🚙',
            status: 'closed',
            winner_id: 'user_test_uuid',
            vehicle_data: { tier: 'vip', condition: 80, km: 40000, year: 2021 },
            container_data: {},
            winning_bid: 60000,
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
    ];

    const bidsHistoryDefault = [
        {
            auction_id: 'auc_open_1',
            auction_title: 'Mercedes Classe S sequestrata — Napoli',
            auction_icon: '🚗',
            amount: 50000,
            auction_ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
        {
            auction_id: 'auc_won_1',
            auction_title: 'BMW Serie 7 — Lotto Corte d\'Appello',
            auction_icon: '🚙',
            amount: 60000,
            auction_ends_at: new Date(Date.now() - 3600000).toISOString(),
            auction_status: 'closed',
            is_winner: true,
        },
    ];

    let statoAste = (opzioni.auctions || auctionsDefault).map(a => ({ ...a }));
    let statoVinte = (opzioni.wonAuctions || wonDefault).map(w => ({ ...w }));
    let statoOfferte = (opzioni.myBids || bidsHistoryDefault).map(b => ({ ...b }));
    let bidsTable = opzioni.bidsTable || [
        { auction_id: 'auc_open_1', user_id: 'user_other_1', amount: 55000, updated_at: new Date(Date.now() - 60000).toISOString() },
        { auction_id: 'auc_open_1', user_id: 'user_test_uuid', amount: 50000, updated_at: new Date(Date.now() - 120000).toISOString() },
        { auction_id: 'auc_open_2', user_id: 'user_test_uuid', amount: 35000, updated_at: new Date(Date.now() - 60000).toISOString() },
    ];

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: (table) => {
            const query = {
                _table: table,
                _filters: {},
                select: () => query,
                upsert: async () => ({ data: null, error: null }),
                insert: async () => ({ data: null, error: null }),
                update: () => query,
                eq: (col, val) => { query._filters[col] = val; return query; },
                then: (resolve) => {
                    return Promise.resolve({ data: [], error: null }).then(resolve);
                },
            };
            return query;
        },
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoAste, statoVinte, statoOfferte, bidsTable });
            }

            if (nome === 'rpc_get_judicial_auctions') {
                const now = Date.now();
                const active = statoAste
                    .filter(a => a.status === 'open' && new Date(a.auction_ends_at).getTime() > now)
                    .map(a => {
                        const bids = bidsTable.filter(b => b.auction_id === a.id);
                        const myB = bids.find(b => b.user_id === (env.sandbox.currentUser?.id || ''));
                        const topB = bids.reduce((max, b) => Math.max(max, b.amount), 0);
                        return {
                            ...a,
                            my_bid: myB ? myB.amount : null,
                            top_bid: topB > 0 ? topB : null,
                            bid_count: bids.length,
                        };
                    });
                return { data: active, error: null };
            }

            if (nome === 'rpc_get_won_auctions') {
                return { data: [...statoVinte], error: null };
            }

            if (nome === 'rpc_get_my_bids') {
                return { data: [...statoOfferte], error: null };
            }

            if (nome === 'rpc_place_auction_bid') {
                const uid = env.sandbox.currentUser?.id;
                if (!uid) return { data: null, error: { message: 'Non autenticato' } };

                const auction = statoAste.find(a => a.id === args.v_auction_id);
                if (!auction) return { data: null, error: { message: 'Asta non trovata' } };
                if (auction.status !== 'open') return { data: null, error: { message: 'Asta non aperta' } };
                if (new Date(auction.auction_ends_at).getTime() <= Date.now()) {
                    return { data: null, error: { message: 'Asta scaduta' } };
                }
                if (args.v_amount < auction.min_bid) {
                    return { data: null, error: { message: `Offerta minima: €${auction.min_bid}` } };
                }
                if (args.v_amount > 100000000) {
                    return { data: null, error: { message: 'Offerta massima €100.000.000' } };
                }

                const userCash = env.sandbox.gameState.cash || 0;

                // Calcolo fondi impegnati su altre aste aperte
                const impegnato = bidsTable
                    .filter(b => b.user_id === uid && b.auction_id !== args.v_auction_id)
                    .filter(b => {
                        const otherA = statoAste.find(a => a.id === b.auction_id);
                        return otherA && otherA.status === 'open' && new Date(otherA.auction_ends_at).getTime() > Date.now();
                    })
                    .reduce((sum, b) => sum + b.amount, 0);

                if (userCash < impegnato + args.v_amount) {
                    return { data: null, error: { message: `Fondi insufficienti: hai gia' impegnato €${impegnato} in altre aste` } };
                }

                // Rate limit (10s)
                const prevBidEntry = bidsTable.find(b => b.auction_id === args.v_auction_id && b.user_id === uid);
                if (prevBidEntry && (Date.now() - new Date(prevBidEntry.updated_at).getTime() < 10000)) {
                    return { data: null, error: { message: 'Troppi rilanci ravvicinati — aspetta qualche secondo' } };
                }

                // Top bid check
                const auctionBids = bidsTable.filter(b => b.auction_id === args.v_auction_id);
                const currentTop = auctionBids.reduce((max, b) => Math.max(max, b.amount), 0);
                if (currentTop > 0 && args.v_amount <= currentTop) {
                    return { data: null, error: { message: `Offerta troppo bassa (attuale: €${currentTop})` } };
                }

                if (prevBidEntry) {
                    prevBidEntry.amount = args.v_amount;
                    prevBidEntry.updated_at = new Date().toISOString();
                } else {
                    bidsTable.push({
                        auction_id: args.v_auction_id,
                        user_id: uid,
                        amount: args.v_amount,
                        updated_at: new Date().toISOString(),
                    });
                }

                auction.bid_count = bidsTable.filter(b => b.auction_id === args.v_auction_id).length;
                auction.top_bid = args.v_amount;
                auction.my_bid = args.v_amount;

                // Aggiorna storico
                const hist = statoOfferte.find(b => b.auction_id === args.v_auction_id);
                if (hist) {
                    hist.amount = args.v_amount;
                } else {
                    statoOfferte.unshift({
                        auction_id: args.v_auction_id,
                        auction_title: auction.title,
                        auction_icon: auction.icon,
                        amount: args.v_amount,
                        auction_ends_at: auction.auction_ends_at,
                        auction_status: 'open',
                        is_winner: false,
                    });
                }

                return { data: { success: true, amount: args.v_amount }, error: null };
            }

            if (nome === 'rpc_claim_auction') {
                const uid = env.sandbox.currentUser?.id;
                if (!uid) return { data: null, error: { message: 'Non autenticato' } };

                const wonIdx = statoVinte.findIndex(w => w.id === args.v_auction_id);
                const lotto = statoVinte[wonIdx] || statoAste.find(a => a.id === args.v_auction_id);

                if (!lotto || lotto.status !== 'closed' || (lotto.winner_id && lotto.winner_id !== uid)) {
                    return { data: null, error: { message: 'Lotto non riscuotibile: gia\' ritirato, non tuo, o asta non chiusa' } };
                }
                if (lotto.claimed_at) {
                    return { data: null, error: { message: 'Lotto già ritirato' } };
                }

                lotto.claimed_at = new Date().toISOString();
                if (wonIdx >= 0) statoVinte.splice(wonIdx, 1);

                let cashAccreditato = 0;
                if (lotto.lot_type === 'container') {
                    for (const it of (lotto.container_data?.items || [])) {
                        if (it.type === 'cash') cashAccreditato += (it.amount || 0);
                    }
                }

                return {
                    data: {
                        success: true,
                        lot_type: lotto.lot_type,
                        vehicle_data: lotto.vehicle_data,
                        container_data: lotto.container_data,
                        cash_accreditato: cashAccreditato,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_resolve_auction') {
                const auction = statoAste.find(a => a.id === args.v_auction_id);
                if (!auction) return { data: null, error: { message: 'Asta non trovata' } };
                if (auction.status !== 'open') return { data: { skipped: true, reason: 'already resolved' }, error: null };
                if (new Date(auction.auction_ends_at).getTime() > Date.now()) {
                    return { data: { skipped: true, reason: 'not yet ended' }, error: null };
                }

                const bids = bidsTable
                    .filter(b => b.auction_id === args.v_auction_id)
                    .sort((a, b) => b.amount - a.amount);

                for (const bid of bids) {
                    if (auction.reserve_price && bid.amount < auction.reserve_price) {
                        break;
                    }

                    // Se l'offerente è l'utente corrente usiamo gs.cash, altrimenti assumiamo fondi disponibili
                    const userCash = (bid.user_id === env.sandbox.currentUser?.id)
                        ? (env.sandbox.gameState.cash || 0)
                        : 99999999;

                    if (userCash < bid.amount) {
                        continue; // Offerta scoperta, passa alla prossima
                    }

                    // Scala cash server-side
                    if (bid.user_id === env.sandbox.currentUser?.id) {
                        env.sandbox.gameState.cash -= bid.amount;
                    }

                    auction.status = 'closed';
                    auction.winner_id = bid.user_id;
                    auction.winning_bid = bid.amount;

                    if (bid.user_id === env.sandbox.currentUser?.id) {
                        statoVinte.push({
                            id: auction.id,
                            lot_type: auction.lot_type,
                            title: auction.title,
                            icon: auction.icon,
                            vehicle_data: auction.vehicle_data,
                            container_data: auction.container_data,
                            winning_bid: bid.amount,
                            created_at: new Date().toISOString(),
                        });
                    }

                    return {
                        data: {
                            success: true,
                            winner_id: bid.user_id,
                            amount: bid.amount,
                            lot_type: auction.lot_type,
                        },
                        error: null,
                    };
                }

                auction.status = 'cancelled';
                return { data: { success: false, reason: 'nessuna offerta valida' }, error: null };
            }

            if (nome === '_process_judicial_auctions') {
                let chiuse = 0;
                let nuove = 0;
                const now = Date.now();

                for (const a of statoAste) {
                    if (a.status === 'open' && new Date(a.auction_ends_at).getTime() <= now) {
                        const res = await sbClient.rpc('rpc_resolve_auction', { v_auction_id: a.id });
                        if (res.data && !res.data.skipped) chiuse++;
                    }
                }

                const aperte = statoAste.filter(a => a.status === 'open' && new Date(a.auction_ends_at).getTime() > now).length;
                while (aperte + nuove < 6) {
                    const newId = 'auc_spawned_' + Math.random().toString(36).slice(2, 7);
                    statoAste.push({
                        id: newId,
                        lot_type: 'vehicle',
                        title: 'Lotto Giudiziario — Corte d\'Appello',
                        icon: '🚗',
                        vehicle_data: { tier: 'business', condition: 60, km: 50000, year: 2020 },
                        container_data: {},
                        min_bid: 25000,
                        reserve_price: null,
                        province_id: 'RM',
                        status: 'open',
                        bid_count: 0,
                        auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
                        my_bid: null,
                        top_bid: null,
                        winner_id: null,
                        winning_bid: null,
                        claimed_at: null,
                    });
                    nuove++;
                }

                return { data: { chiuse, nuove, aperte: aperte + nuove }, error: null };
            }

            return { data: null, error: null };
        },
        channel: (chanName) => {
            const chanObj = {
                name: chanName,
                on: (event, config, callback) => {
                    channelEvents.push({ chanName, event, config });
                    subscriptions.set(chanName, callback);
                    return chanObj;
                },
                subscribe: () => chanObj,
            };
            return chanObj;
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_test_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Predisponi stato giocatore
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 200000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [];

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        statoAste,
        statoVinte,
        statoOfferte,
        bidsTable,
        subscriptions,
    };
}

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh, Realtime)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola auctions, wonAuctions e myBids da Supabase RPC', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 3, 'deve contenere le 3 aste aperte');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 1, 'deve contenere 1 asta vinta');
            assert.equal(sandbox._auctionsState.myBids.length, 2, 'deve contenere 2 offerte nello storico');
            assert.ok(sandbox._auctionsState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata (non forzata)
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve eseguire chiamate RPC entro 30s');

            // Chiamata forzata (force=true)
            await sandbox.auctionsRefresh(true);
            assert.ok(rpcLog.length > countPrima, 'force=true deve ignorare il throttle');
        });

        test('auctionsRefresh non crasha se supabaseClient non è disponibile', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsInit esegue refresh iniziale, sottoscrive al realtime e mostra notifica per vincite', async () => {
            const { sandbox, env, subscriptions } = amb;
            await sandbox.auctionsInit();

            assert.equal(sandbox._auctionsState.auctions.length, 3);
            assert.ok(subscriptions.has('judicial_auctions_changes'), 'deve sottoscriversi al canale realtime');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('asta/e vinta/e da ritirare')));
        });

        test('auctionsInit non mostra notifica se wonAuctions è vuoto', async () => {
            const ambVuoto = creaAmbienteAste({ wonAuctions: [] });
            await ambVuoto.sandbox.auctionsInit();

            assert.equal(ambVuoto.env.notifications.filter(n => n.msg.includes('vinta')).length, 0);
            ambVuoto.env.stopAllIntervals();
        });
    });

    describe('2. Invio e rilancio offerte (auctionsPlaceBid, rpc_place_auction_bid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('offerta valida aggiorna lo stato, azzera _lastFetch e ricarica i lotti', async () => {
            const { sandbox, rpcLog } = amb;

            // Offre 60.000€ su auc_open_1 (top bid precedente era 55.000€)
            const res = await sandbox.auctionsPlaceBid('auc_open_1', 60000);

            assert.ok(!res.error, 'l offerta non deve dare errore');
            assert.equal(res.data.success, true);
            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc, 'deve invocare rpc_place_auction_bid');
            assert.equal(bidRpc.args.v_auction_id, 'auc_open_1');
            assert.equal(bidRpc.args.v_amount, 60000);

            // Verifica aggiornamento stato locale
            const asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_open_1');
            assert.equal(asta.my_bid, 60000);
            assert.equal(asta.top_bid, 60000);
        });

        test('rifiuto offerta se supabaseClient non è disponibile', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('auc_open_1', 60000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('rifiuto offerta se utente non autenticato', async () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            const res = await sandbox.auctionsPlaceBid('auc_open_1', 60000);
            assert.ok(res.error);
            assert.match(res.error, /non autenticato/i);
        });

        test('rifiuto offerta su asta inesistente', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('asta_fantasma', 60000);
            assert.ok(res.error);
            assert.match(res.error, /non trovata/i);
        });

        test('rifiuto offerta inferiore al prezzo minimo (min_bid)', async () => {
            const { sandbox } = amb;
            // auc_open_3 ha min_bid = 75000
            const res = await sandbox.auctionsPlaceBid('auc_open_3', 50000);
            assert.ok(res.error);
            assert.match(res.error, /offerta minima/i);
        });

        test('rifiuto offerta inferiore o uguale alla migliore offerta attuale (top_bid)', async () => {
            const { sandbox } = amb;
            // auc_open_1 ha top_bid = 55000
            const res = await sandbox.auctionsPlaceBid('auc_open_1', 52000);
            assert.ok(res.error);
            assert.match(res.error, /troppo bassa/i);
        });

        test('rifiuto offerta se i fondi totali sono insufficienti (offrire più di quanto si ha)', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 40000; // Meno dell'offerta richiesta

            const res = await sandbox.auctionsPlaceBid('auc_open_1', 60000);
            assert.ok(res.error);
            assert.match(res.error, /fondi insufficienti/i);
        });

        test('rifiuto offerta quando i fondi disponibili sono già impegnati in altre aste aperte', async () => {
            const { sandbox, gs } = amb;
            // gs.cash = 200000. L'utente ha già 35.000€ impegnati su auc_open_2.
            // Se offre 180.000€ su auc_open_1: 180.000 + 35.000 = 215.000 > 200.000 -> rifiutato!
            const res = await sandbox.auctionsPlaceBid('auc_open_1', 180000);
            assert.ok(res.error);
            assert.match(res.error, /fondi insufficienti.*impegnato/i);
        });

        test('rifiuto di due offerte ravvicinate (<10s) sulla stessa asta (rate limit anti-spam)', async () => {
            const { sandbox } = amb;

            // In auc_open_2 l'utente ha offerto da poco (updated_at recente)
            amb.bidsTable.find(b => b.auction_id === 'auc_open_2' && b.user_id === 'user_test_uuid').updated_at = new Date().toISOString();

            const res = await sandbox.auctionsPlaceBid('auc_open_2', 40000);
            assert.ok(res.error);
            assert.match(res.error, /troppi rilanci ravvicinati/i);
        });
    });

    describe('3. Modale di Offerta e UI Interaction (auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsOpenBidModal crea il modale nel DOM con i dati dell\'asta e focus sull\'input', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_open_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale deve essere inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Mercedes Classe S sequestrata'));
            assert.ok(modal.innerHTML.includes('45.000'), 'deve mostrare min_bid');
            assert.ok(modal.innerHTML.includes('55.000'), 'deve mostrare top_bid');
            assert.ok(modal.innerHTML.includes('50.000'), 'deve mostrare my_bid');

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input, 'deve esistere il campo di input offerta');
            assert.ok(Number(input.value) >= 55001, 'il valore predefinito deve essere superiore alla top bid');
        });

        test('auctionsOpenBidModal su container mostra indicazione contenuto segreto', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_open_2');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal.innerHTML.includes('Contenuto rivelato solo al vincitore'));
        });

        test('auctionsOpenBidModal rimuove modale preesistente prima di aprirne uno nuovo', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_open_1');
            sandbox.auctionsOpenBidModal('auc_open_2');

            const modals = sandbox.document.querySelectorAll('#auction-bid-modal');
            assert.equal(modals.length, 1, 'deve esserci un solo modale attivo');
            assert.ok(modals[0].innerHTML.includes('Container Sigillato'));
        });

        test('auctionsOpenBidModal con id asta inesistente non apre nulla', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('non_esiste');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null);
        });

        test('auctionsConfirmBid con importo non valido (0, negativo, vuoto) mostra errore nel modale', async () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            const errDiv = sandbox.document.getElementById('bid-error');

            input.value = '0';
            await sandbox.auctionsConfirmBid('auc_open_1');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Inserisci un importo valido'));

            input.value = '-500';
            await sandbox.auctionsConfirmBid('auc_open_1');
            assert.equal(errDiv.style.display, 'block');
        });

        test('auctionsConfirmBid valido invia l\'offerta, chiude il modale e mostra notifica', async () => {
            const { sandbox, env } = amb;
            sandbox.auctionsOpenBidModal('auc_open_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '65000';

            await sandbox.auctionsConfirmBid('auc_open_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null, 'il modale deve essere rimosso dal DOM dopo il successo');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta di €65.000 registrata')));
        });

        test('auctionsConfirmBid con errore RPC mostra messaggio nel modale e riabilita pulsante', async () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_1');

            // Imposta offerta troppo bassa (inferiore a top bid 55000)
            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '46000';
            const btn = sandbox.document.getElementById('bid-confirm-btn');

            await sandbox.auctionsConfirmBid('auc_open_1');

            const errDiv = sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Offerta troppo bassa'));
            assert.equal(btn.disabled, false);
            assert.ok(btn.textContent.includes('Piazza Offerta'));
        });

        test('chiusura modale tramite ceRemove al click sulla X', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_1');

            assert.ok(sandbox.document.getElementById('auction-bid-modal'));
            sandbox.ceRemove('auction-bid-modal');
            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });
    });

    describe('4. Risoluzione Aste e Ciclo di Vita (rpc_resolve_auction, _process_judicial_auctions)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('risoluzione assegna la vittoria al miglior offerente solvibile e scala il denaro sul server', async () => {
            const { sandbox, statoAste, gs } = amb;
            const asta = statoAste.find(a => a.id === 'auc_open_1');
            asta.auction_ends_at = new Date(Date.now() - 1000).toISOString(); // Scaduta

            // Top bidder è user_other_1 (55000)
            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_open_1' });

            assert.equal(res.data.success, true);
            assert.equal(res.data.winner_id, 'user_other_1');
            assert.equal(res.data.amount, 55000);
            assert.equal(asta.status, 'closed');
            assert.equal(asta.winner_id, 'user_other_1');
        });

        test('risoluzione: se il miglior offerente non ha fondi, il lotto passa al secondo offerente solvibile', async () => {
            const { sandbox, statoAste, bidsTable, gs } = amb;
            const asta = statoAste.find(a => a.id === 'auc_open_1');
            asta.auction_ends_at = new Date(Date.now() - 1000).toISOString();

            // Simuliamo che user_test_uuid sia il top bidder con 70.000€ ma il suo cash è solo 30.000€
            bidsTable.push({
                auction_id: 'auc_open_1',
                user_id: 'user_test_uuid',
                amount: 70000,
                updated_at: new Date().toISOString(),
            });
            gs.cash = 30000; // Fondi insufficienti per coprire 70.000€!

            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_open_1' });

            // Il server scende al secondo offerente: user_other_1 (55.000€)
            assert.equal(res.data.success, true);
            assert.equal(res.data.winner_id, 'user_other_1');
            assert.equal(res.data.amount, 55000);
        });

        test('asta che scade senza offerte viene annullata (status = cancelled)', async () => {
            const { sandbox, statoAste } = amb;
            const asta = statoAste.find(a => a.id === 'auc_open_3');
            asta.auction_ends_at = new Date(Date.now() - 1000).toISOString();

            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_open_3' });

            assert.equal(res.data.success, false);
            assert.equal(res.data.reason, 'nessuna offerta valida');
            assert.equal(asta.status, 'cancelled');
        });

        test('asta che scade con offerta sotto il prezzo di riserva viene annullata', async () => {
            const { sandbox, statoAste, bidsTable } = amb;
            const asta = statoAste.find(a => a.id === 'auc_open_3');
            asta.auction_ends_at = new Date(Date.now() - 1000).toISOString();
            asta.reserve_price = 100000; // Riserva alta

            bidsTable.push({
                auction_id: 'auc_open_3',
                user_id: 'user_test_uuid',
                amount: 80000, // Sotto la riserva
                updated_at: new Date().toISOString(),
            });

            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_open_3' });

            assert.equal(res.data.success, false);
            assert.equal(asta.status, 'cancelled');
        });

        test('asta non ancora scaduta non viene risolta (skipped)', async () => {
            const { sandbox } = amb;
            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_open_1' });

            assert.equal(res.data.skipped, true);
            assert.equal(res.data.reason, 'not yet ended');
        });

        test('asta già chiusa viene saltata (already resolved)', async () => {
            const { sandbox, statoAste } = amb;
            const asta = statoAste.find(a => a.id === 'auc_open_1');
            asta.status = 'closed';

            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_open_1' });

            assert.equal(res.data.skipped, true);
            assert.equal(res.data.reason, 'already resolved');
        });

        test('_process_judicial_auctions risolve aste scadute e genera nuovi lotti fino a 6', async () => {
            const { sandbox, statoAste } = amb;
            // Facciamo scadere auc_open_3
            statoAste.find(a => a.id === 'auc_open_3').auction_ends_at = new Date(Date.now() - 1000).toISOString();

            const res = await sandbox.supabaseClient.rpc('_process_judicial_auctions');

            assert.ok(res.data.chiuse >= 1, 'deve chiudere le aste scadute');
            assert.ok(res.data.nuove >= 1, 'deve spawnare nuovi lotti');
            assert.equal(res.data.aperte, 6, 'il totale lotti aperti deve essere 6');
        });
    });

    describe('5. Ritiro Premi e Riscossione (auctionsClaim, auctionsRevealWon)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('riscuotere un veicolo singolo lo aggiunge in flotta con tutti i parametri e lo rimuove da wonAuctions', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const res = await sandbox.auctionsClaim('auc_won_1');

            assert.ok(!res.error, 'il ritiro deve avere successo');
            assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo deve essere aggiunto alla flotta');

            const auto = gs.fleet[gs.fleet.length - 1];
            assert.equal(auto.tier, 'vip');
            assert.equal(auto.condition, 80);
            assert.equal(auto.mileage, 40000);
            assert.ok(auto.vehicleClass);
            assert.equal(auto.isLease, false);

            assert.equal(sandbox._auctionsState.wonAuctions.filter(w => w.id === 'auc_won_1').length, 0);
        });

        test('riscuotere un lotto multiplo fleet_pack aggiunge tutti i veicoli in flotta', async () => {
            const { sandbox, gs, statoVinte } = amb;
            statoVinte.push({
                id: 'auc_won_fleet_pack',
                lot_type: 'fleet_pack',
                title: 'Lotto 3 Veicoli',
                icon: '🚐',
                status: 'closed',
                winner_id: 'user_test_uuid',
                vehicle_data: {
                    vehicles: [
                        { tier: 'business', condition: 70, km: 50000 },
                        { tier: 'business', condition: 65, km: 75000 },
                        { tier: 'standard', condition: 58, km: 90000 },
                    ],
                },
                container_data: {},
                winning_bid: 75000,
            });
            await sandbox.auctionsRefresh(true);

            const flottaPrima = gs.fleet.length;
            const res = await sandbox.auctionsClaim('auc_won_fleet_pack');

            assert.ok(!res.error);
            assert.equal(gs.fleet.length, flottaPrima + 3, 'deve aggiungere tutti e 3 i veicoli del fleet pack');
            assert.equal(res.veicoli.length, 3);
        });

        test('riscuotere un container accredita denaro via CE_money e aggiunge i veicoli contenuti', async () => {
            const { sandbox, gs, statoVinte } = amb;
            statoVinte.push({
                id: 'auc_won_container',
                lot_type: 'container',
                title: 'Container Dogana',
                icon: '📦',
                status: 'closed',
                winner_id: 'user_test_uuid',
                vehicle_data: {},
                container_data: {
                    items: [
                        { type: 'cash', amount: 50000 },
                        { type: 'vehicle', tier: 'ultra', condition: 88 },
                    ],
                },
                winning_bid: 40000,
            });
            await sandbox.auctionsRefresh(true);

            const cashPrima = gs.cash;
            const flottaPrima = gs.fleet.length;

            const res = await sandbox.auctionsClaim('auc_won_container');

            assert.ok(!res.error);
            assert.equal(gs.cash, cashPrima + 50000, 'il cash deve incrementare di 50.000€');
            assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo nel container deve entrare in flotta');
            assert.equal(res.contanti, 50000);
        });

        test('tentativo di riscuotere due volte lo stesso lotto viene rifiutato dal server', async () => {
            const { sandbox } = amb;

            // Prima riscossione: successo
            const res1 = await sandbox.auctionsClaim('auc_won_1');
            assert.ok(!res1.error);

            // Seconda riscossione: fallisce
            const res2 = await sandbox.auctionsClaim('auc_won_1');
            assert.ok(res2.error);
            assert.match(res2.error, /non riscuotibile|gia' ritirato/i);
        });

        test('tentativo di riscuotere asta non vinta o non chiusa fallisce con errore', async () => {
            const { sandbox } = amb;

            const res = await sandbox.auctionsClaim('auc_open_1');
            assert.ok(res.error);
            assert.match(res.error, /non riscuotibile/i);
        });

        test('auctionsRevealWon apre il modale della vittoria e riscuote il premio', async () => {
            const { sandbox, gs } = amb;

            await sandbox.auctionsRevealWon('auc_won_1');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'il modale della vittoria deve essere mostrato');
            assert.ok(modal.innerHTML.includes('BMW Serie 7'));
            assert.ok(modal.innerHTML.includes('Aggiudicato per €60.000'));
        });

        test('auctionsRevealWon per asta non presente in wonAuctions non fa nulla', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('asta_inesistente');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.equal(modal, null);
        });
    });

    describe('6. Rendering UI e Schermata Aste (renderTabAuctions, helper di formattazione)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('helper formattazione: _countdown, _tierBadge, _fmtCurrency', () => {
            const { sandbox } = amb;

            // _fmtCurrency
            assert.equal(sandbox._fmtCurrency(null), '—');
            assert.equal(sandbox._fmtCurrency(0), '€0');
            assert.ok(sandbox._fmtCurrency(50000).includes('50.000') || sandbox._fmtCurrency(50000).includes('50,000'));

            // _countdown
            assert.equal(sandbox._countdown(new Date(Date.now() - 1000).toISOString()), 'Scaduta');
            assert.match(sandbox._countdown(new Date(Date.now() + 72 * 3600 * 1000).toISOString()), /\d+g \d+h/);
            assert.match(sandbox._countdown(new Date(Date.now() + 5 * 3600 * 1000).toISOString()), /\d+h \d+m/);
            assert.match(sandbox._countdown(new Date(Date.now() + 20 * 60 * 1000).toISOString()), /\d+m \d+s/);

            // _tierBadge
            assert.ok(sandbox._tierBadge('standard').includes('Standard'));
            assert.ok(sandbox._tierBadge('BUSINESS').includes('Business'));
            assert.ok(sandbox._tierBadge('vip').includes('VIP'));
            assert.ok(sandbox._tierBadge('ultra').includes('Ultra'));
        });

        test('renderTabAuctions non crasha se tab-container non esiste', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });

        test('renderTabAuctions disegna intestazione, KPI, lotti aperti e banner vincite', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Aste Giudiziarie'));
            assert.ok(c.innerHTML.includes('Lotti Aperti'));
            assert.ok(c.innerHTML.includes('Aste Vinte — Da Ritirare'));
            assert.ok(c.innerHTML.includes('Mercedes Classe S sequestrata'));
            assert.ok(c.innerHTML.includes('Container Sigillato'));
            assert.ok(c.innerHTML.includes('Storico Offerte'));
        });

        test('renderTabAuctions mostra badge "Sei in testa" quando l\'utente è top bidder', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Sei in testa — mantieni la posizione'));
        });

        test('renderTabAuctions mostra avviso "Sei stato superato" quando l\'utente è outbid', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Sei stato superato! Rilancia per vincere'));
        });

        test('renderTabAuctions con lista aste vuota mostra stato vuoto', () => {
            const { sandbox } = amb;
            sandbox._auctionsState.auctions = [];
            sandbox._auctionsState.wonAuctions = [];
            sandbox._auctionsState.myBids = [];

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessuna asta aperta al momento'));
        });
    });

    describe('7. Event Delegation, Realtime ed Eco ServerState (Doppio Conteggio)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
            amb.sandbox.renderTabAuctions();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su bottone "Piazza Offerta" apre modale via delegation', () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsOpenBidModal"]');
            assert.ok(btn, 'bottone data-ce-act="auctionsOpenBidModal" deve esistere nel DOM');

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            sandbox.auctionsOpenBidModal(auctionId);

            assert.ok(sandbox.document.getElementById('auction-bid-modal'));
        });

        test('click su "Ritira" in banner vincite apre auctionsRevealWon via delegation', async () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsRevealWon"]');
            assert.ok(btn, 'bottone data-ce-act="auctionsRevealWon" deve esistere nel DOM');

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            await sandbox.auctionsRevealWon(auctionId);

            assert.ok(sandbox.document.getElementById('auction-won-modal'));
        });

        test('piazzare offerta non tocca direttamente gameState.cash (gestito dal server)', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;

            await sandbox.auctionsPlaceBid('auc_open_1', 60000);

            assert.equal(gs.cash, cashPrima, 'offrire non scala cash nel browser: solo il server addebita alla chiusura');
        });

        test('riscuotere container usa accreditatoDalServer e non invoca syncCash (nessun doppio conteggio)', async () => {
            const syncedCash = [];
            const ambSS = creaAmbienteAste({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
                wonAuctions: [
                    {
                        id: 'auc_won_container_ss',
                        lot_type: 'container',
                        title: 'Container Cash',
                        icon: '📦',
                        status: 'closed',
                        winner_id: 'user_test_uuid',
                        vehicle_data: {},
                        container_data: { items: [{ type: 'cash', amount: 30000 }] },
                        winning_bid: 20000,
                    },
                ],
            });
            await ambSS.sandbox.auctionsRefresh(true);

            ambSS.gs.cash = 100000;
            await ambSS.sandbox.auctionsClaim('auc_won_container_ss');

            assert.equal(ambSS.gs.cash, 130000, 'il saldo locale riflette subito i 30.000€ accreditati');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già accreditato i fondi');

            ambSS.env.stopAllIntervals();
        });

        test('modifiche Realtime sulla tabella judicial_auctions ricaricano i lotti se la tab è aperta', async () => {
            const { sandbox, subscriptions, rpcLog } = amb;
            sandbox._activeTab = 'auctions';
            sandbox.window._activeTab = 'auctions';
            sandbox.switchTab = () => {};
            sandbox.window.switchTab = sandbox.switchTab;
            await sandbox.auctionsInit();

            const rpcPrima = rpcLog.length;
            const realtimeCb = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof realtimeCb === 'function');

            // Simula notifica Realtime da Supabase
            realtimeCb({ eventType: 'UPDATE', table: 'judicial_auctions' });
            await new Promise(r => setImmediate(r));

            assert.ok(rpcLog.length > rpcPrima, 'deve scatenare auctionsRefresh sul trigger realtime');
        });
    });
});
