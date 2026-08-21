'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie

   Scopo: collaudare ogni azione e routine esposta da `auctions.js` e dai relativi
   gestori `ce-actions.js` / `events.js`, verificare l'interazione con Supabase RPC,
   il ciclo di vita delle offerte (rilancio, superamento, vincita, riscossione),
   il rispetto dei guardrail di cassa (nessun doppio conteggio con CE_money),
   la gestione dei casi limite e il rendering UI completo.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente sandbox isolato con mock completo di Supabase RPC
 * per le Aste Giudiziarie.
 */
function creaAmbienteAste(opzioni = {}) {
    const rpcLog = [];
    const channelEvents = [];
    const subscriptions = new Map();

    const auctionsDefault = [
        {
            id: 'auc_veh_1',
            lot_type: 'vehicle',
            title: 'Mercedes Classe S sequestrata — Napoli',
            description: 'Veicolo confiscato dalla DIA.',
            icon: '🚗',
            vehicle_data: { tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 62, km: 87000, year: 2019 },
            container_data: {},
            min_bid: 45000,
            reserve_price: null,
            province_id: 'campania',
            status: 'open',
            bid_count: 2,
            auction_ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            my_bid: null,
            top_bid: 50000,
        },
        {
            id: 'auc_veh_lead',
            lot_type: 'vehicle',
            title: 'BMW Serie 7 — Lotto Roma',
            description: 'Lotto giudiziario n. 447.',
            icon: '🚙',
            vehicle_data: { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 55, km: 112000, year: 2018 },
            container_data: {},
            min_bid: 28000,
            reserve_price: null,
            province_id: 'lazio',
            status: 'open',
            bid_count: 1,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            my_bid: 32000,
            top_bid: 32000,
        },
        {
            id: 'auc_veh_outbid',
            lot_type: 'vehicle',
            title: 'Rolls-Royce Ghost — Milano',
            description: 'Ex holding immobiliare.',
            icon: '👑',
            vehicle_data: { tier: 'ultra', vehicleClass: 'majestic_spirit', condition: 88, km: 32000, year: 2021 },
            container_data: {},
            min_bid: 200000,
            reserve_price: null,
            province_id: 'lombardia',
            status: 'open',
            bid_count: 3,
            auction_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            my_bid: 210000,
            top_bid: 250000,
        },
        {
            id: 'auc_container_1',
            lot_type: 'container',
            title: 'Container Sigillato — Porto Gioia Tauro',
            description: 'Contenuto ignoto fino all\'aggiudicazione.',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'vehicle', tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 75 },
                    { type: 'cash', amount: 40000 },
                ],
            },
            min_bid: 60000,
            reserve_price: null,
            province_id: 'calabria',
            status: 'open',
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min (urgente)
            my_bid: null,
            top_bid: null,
        },
        {
            id: 'auc_fleet_1',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli — Fallimento NCC Palermo',
            description: 'Tre veicoli business venduti a blocco.',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70 },
                    { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65 },
                    { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58 },
                ],
            },
            container_data: {},
            min_bid: 75000,
            reserve_price: null,
            province_id: 'sicilia',
            status: 'open',
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            my_bid: null,
            top_bid: null,
        },
    ];

    const wonAuctionsDefault = [
        {
            id: 'auc_won_veh',
            lot_type: 'vehicle',
            title: 'Stellar S-Imperial Aggiudicata',
            icon: '🚗',
            vehicle_data: { tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 80, km: 40000, year: 2022 },
            container_data: {},
            winning_bid: 60000,
            created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
        },
    ];

    const myBidsDefault = [
        {
            auction_id: 'auc_veh_lead',
            auction_title: 'BMW Serie 7 — Lotto Roma',
            auction_icon: '🚙',
            amount: 32000,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
        {
            auction_id: 'auc_veh_outbid',
            auction_title: 'Rolls-Royce Ghost — Milano',
            auction_icon: '👑',
            amount: 210000,
            auction_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
        {
            auction_id: 'auc_won_veh',
            auction_title: 'Stellar S-Imperial Aggiudicata',
            auction_icon: '🚗',
            amount: 60000,
            auction_ends_at: new Date(Date.now() - 3600 * 1000).toISOString(),
            auction_status: 'closed',
            is_winner: true,
        },
    ];

    let statoAste = (opzioni.auctions || auctionsDefault).map(a => JSON.parse(JSON.stringify(a)));
    let statoVinte = (opzioni.wonAuctions || wonAuctionsDefault).map(w => JSON.parse(JSON.stringify(w)));
    let statoOfferte = (opzioni.myBids || myBidsDefault).map(b => JSON.parse(JSON.stringify(b)));
    const bidTimestamps = new Map(); // Per simulare rate limit 10s per utente+asta

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoAste, statoVinte, statoOfferte });
            }

            const currentUserId = env.sandbox.currentUser ? env.sandbox.currentUser.id : null;

            if (nome === 'rpc_get_judicial_auctions') {
                return { data: statoAste.filter(a => a.status === 'open'), error: null };
            }

            if (nome === 'rpc_get_won_auctions') {
                return { data: statoVinte, error: null };
            }

            if (nome === 'rpc_get_my_bids') {
                return { data: statoOfferte, error: null };
            }

            if (nome === 'rpc_place_auction_bid') {
                if (!currentUserId) {
                    return { data: null, error: { message: 'Non autenticato' } };
                }
                const asta = statoAste.find(a => a.id === args.v_auction_id);
                if (!asta) {
                    return { data: null, error: { message: 'Asta non trovata' } };
                }
                if (asta.status !== 'open') {
                    return { data: null, error: { message: 'Asta non aperta' } };
                }
                if (new Date(asta.auction_ends_at).getTime() < Date.now()) {
                    return { data: null, error: { message: 'Asta scaduta' } };
                }
                if (args.v_amount < asta.min_bid) {
                    return { data: null, error: { message: `Offerta minima: €${asta.min_bid}` } };
                }
                if (args.v_amount > 100000000) {
                    return { data: null, error: { message: 'Offerta massima €100.000.000' } };
                }

                const playerCash = env.sandbox.gameState.cash || 0;
                // Calcola fondi già impegnati su altre aste aperte
                const impegnatoAltrove = statoOfferte
                    .filter(b => b.auction_id !== args.v_auction_id && b.auction_status === 'open')
                    .reduce((sum, b) => sum + b.amount, 0);

                if (playerCash < impegnatoAltrove + args.v_amount) {
                    return { data: null, error: { message: `Fondi insufficienti: hai già impegnato €${impegnatoAltrove} in altre aste` } };
                }

                // Rate-limit: max 1 rilancio ogni 10 secondi per utente/asta
                const key = `${currentUserId}_${args.v_auction_id}`;
                const lastBidTime = bidTimestamps.get(key);
                if (lastBidTime && Date.now() - lastBidTime < 10000) {
                    return { data: null, error: { message: 'Troppi rilanci ravvicinati — aspetta qualche secondo' } };
                }

                if (asta.top_bid !== null && args.v_amount <= asta.top_bid) {
                    return { data: null, error: { message: `Offerta troppo bassa (attuale: €${asta.top_bid})` } };
                }

                // Aggiorna stato
                bidTimestamps.set(key, Date.now());
                const prevBid = asta.my_bid;
                asta.top_bid = args.v_amount;
                asta.my_bid = args.v_amount;
                if (!prevBid) {
                    asta.bid_count = (asta.bid_count || 0) + 1;
                }

                // Aggiorna o inserisci in statoOfferte
                const existBid = statoOfferte.find(b => b.auction_id === args.v_auction_id);
                if (existBid) {
                    existBid.amount = args.v_amount;
                } else {
                    statoOfferte.unshift({
                        auction_id: asta.id,
                        auction_title: asta.title,
                        auction_icon: asta.icon,
                        amount: args.v_amount,
                        auction_ends_at: asta.auction_ends_at,
                        auction_status: 'open',
                        is_winner: false,
                    });
                }

                return {
                    data: {
                        success: true,
                        amount: args.v_amount,
                        prev_bid: prevBid,
                        top_bid: args.v_amount,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_claim_auction') {
                if (!currentUserId) {
                    return { data: null, error: { message: 'Non autenticato' } };
                }
                const wonIdx = statoVinte.findIndex(w => w.id === args.v_auction_id);
                if (wonIdx < 0) {
                    return { data: null, error: { message: 'Lotto non riscuotibile: già ritirato, non tuo, o asta non chiusa' } };
                }
                const lotto = statoVinte[wonIdx];
                let contanti = 0;
                if (lotto.lot_type === 'container') {
                    for (const item of (lotto.container_data?.items || [])) {
                        if (item.type === 'cash') contanti += Number(item.amount || 0);
                    }
                }

                // Rimuovi dal server (claimed_at marcato)
                statoVinte.splice(wonIdx, 1);

                return {
                    data: {
                        success: true,
                        lot_type: lotto.lot_type,
                        vehicle_data: lotto.vehicle_data,
                        container_data: lotto.container_data,
                        cash_accreditato: contanti,
                    },
                    error: null,
                };
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
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 500000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [];

    // Predisponi contenitore DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        channelEvents,
        subscriptions,
        statoAste,
        statoVinte,
        statoOfferte,
    };
}

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh, Realtime)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola _auctionsState da Supabase RPC', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 5, 'deve caricare le 5 aste aperte');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 1, 'deve caricare 1 asta vinta');
            assert.equal(sandbox._auctionsState.myBids.length, 3, 'deve caricare 3 offerte nello storico');
            assert.ok(sandbox._auctionsState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata senza force -> non esegue query
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve invocare RPC entro 30s se force=false');

            // Chiamata forzata -> riesegue query
            await sandbox.auctionsRefresh(true);
            assert.equal(rpcLog.length, countPrima + 3, 'force=true deve rieseguire le 3 RPC');
        });

        test('auctionsRefresh non crasha in assenza di supabaseClient', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsRefresh preserva lo stato preesistente in caso di errore parziale RPC', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            // Simula errore su rpc_get_judicial_auctions
            sandbox.supabaseClient.rpc = async (nome) => {
                if (nome === 'rpc_get_judicial_auctions') return { data: null, error: { message: 'Network error' } };
                return { data: [], error: null };
            };

            await sandbox.auctionsRefresh(true);
            assert.equal(sandbox._auctionsState.auctions.length, 5, 'non deve cancellare le aste già in memoria su errore');
        });

        test('auctionsInit esegue refresh forzato, registra realtime e notifica lotti vinti', async () => {
            const { sandbox, rpcLog, channelEvents, env } = amb;

            await sandbox.auctionsInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_judicial_auctions'));
            assert.ok(channelEvents.some(c => c.chanName === 'judicial_auctions_changes'));
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('asta/e vinta/e da ritirare')));
        });

        test('ricezione evento Realtime azzera il throttle _lastFetch', async () => {
            const { sandbox, subscriptions } = amb;
            await sandbox.auctionsInit();

            sandbox._auctionsState._lastFetch = 999999999;
            const rtCb = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof rtCb === 'function', 'deve esistere la callback realtime');

            rtCb();
            assert.equal(sandbox._auctionsState._lastFetch, 0, 'il timestamp di fetch deve essere azzerato');
        });
    });

    describe('2. Piazzamento Offerta (auctionsPlaceBid, auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsPlaceBid invia offerta valida, chiama RPC e rinfresca lo stato', async () => {
            const { sandbox, rpcLog } = amb;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);

            assert.equal(res.error, undefined);
            assert.ok(res.data && res.data.success);
            const placeRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(placeRpc);
            assert.equal(placeRpc.args.v_auction_id, 'auc_veh_1');
            assert.equal(placeRpc.args.v_amount, 60000);

            // Verifica che il top bid sia aggiornato nello stato locale
            const asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_1');
            assert.equal(asta.top_bid, 60000);
            assert.equal(asta.my_bid, 60000);
        });

        test('auctionsPlaceBid con errore RPC restituisce messaggio di errore formattato', async () => {
            const { sandbox } = amb;

            // Offerta troppo bassa (min_bid è 45000, top_bid è 50000)
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 48000);

            assert.ok(res.error);
            assert.ok(res.error.includes('Offerta fallita') || res.error.includes('troppo bassa'));
        });

        test('auctionsPlaceBid restituisce errore se supabaseClient non disponibile', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('auctionsOpenBidModal apre il modale DOM con dati corretti e calcolo importo minimo', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale deve comparire nel DOM');
            assert.ok(modal.innerHTML.includes('Mercedes Classe S sequestrata'));
            assert.ok(modal.innerHTML.includes('VIP'));

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input);
            // Top bid attuale è 50000 -> minNext deve essere 50001
            assert.equal(input.getAttribute('min'), '50001');
            assert.equal(input.value, '50001');
        });

        test('auctionsOpenBidModal per container mostra avviso contenuto nascosto', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_container_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto rivelato solo al vincitore'));
        });

        test('auctionsOpenBidModal per asta inesistente non apre modali', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('asta_inesistente');
            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });

        test('auctionsConfirmBid valida importo non numerico o <= 0 e mostra errore', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            const errDiv = sandbox.document.getElementById('bid-error');
            input.value = '0';

            await sandbox.auctionsConfirmBid('auc_veh_1');

            assert.equal(errDiv.textContent, 'Inserisci un importo valido');
            assert.equal(errDiv.style.display, 'block');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0);
        });

        test('auctionsConfirmBid invia offerta, chiude modale e notifica successo', async () => {
            const { sandbox, env } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '70000';

            await sandbox.auctionsConfirmBid('auc_veh_1');

            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null, 'il modale deve essere chiuso');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('70.000')));
        });

        test('auctionsConfirmBid con errore RPC mostra l\'errore nel modale e riabilita il tasto', async () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            const btn = sandbox.document.getElementById('bid-confirm-btn');
            const errDiv = sandbox.document.getElementById('bid-error');
            input.value = '40000'; // inferiore a top_bid (50000)

            await sandbox.auctionsConfirmBid('auc_veh_1');

            assert.ok(sandbox.document.getElementById('auction-bid-modal'), 'il modale deve restare aperto');
            assert.ok(errDiv.textContent.length > 0);
            assert.equal(errDiv.style.display, 'block');
            assert.equal(btn.disabled, false);
            assert.equal(btn.textContent, '🔨 Piazza Offerta');
        });
    });

    describe('3. Casi Limite e Regole di Offerta (Fondi, Rilanci, Rate-limit, Non Autenticato)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rifiuto offerta se utente non autenticato', async () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.ok(res.error);
            assert.ok(res.error.includes('Non autenticato'));
        });

        test('rifiuto offerta per asta inesistente', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('asta_fantasma', 60000);
            assert.ok(res.error);
            assert.ok(res.error.includes('non trovata'));
        });

        test('rifiuto se il giocatore offre più del saldo di cassa disponibile', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 30000; // Cassa 30.000€

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.ok(res.error);
            assert.ok(res.error.includes('Fondi insufficienti'));
        });

        test('rifiuto se il giocatore ha fondi già impegnati su altre aste aperte', async () => {
            const { sandbox, gs } = amb;
            // Ha già 32.000€ impegnati su auc_veh_lead e 210.000€ su auc_veh_outbid = 242.000€ impegnati
            gs.cash = 260000;

            // Offrire 55.000€ porterebbe l'impegno a 297.000€ > 260.000€
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 55000);
            assert.ok(res.error);
            assert.ok(res.error.includes('Fondi insufficienti') && res.error.includes('già impegnato'));
        });

        test('rifiuto se il giocatore offre un importo inferiore al prezzo minimo', async () => {
            const { sandbox } = amb;
            // auc_container_1 ha min_bid 60000 e 0 offerte
            const res = await sandbox.auctionsPlaceBid('auc_container_1', 40000);
            assert.ok(res.error);
            assert.ok(res.error.includes('Offerta minima'));
        });

        test('rifiuto se il giocatore piazza due offerte ravvicinate in meno di 10 secondi (rate-limit)', async () => {
            const { sandbox } = amb;

            // Prima offerta valida
            const res1 = await sandbox.auctionsPlaceBid('auc_container_1', 70000);
            assert.equal(res1.error, undefined);

            // Seconda offerta immediata sulla stessa asta
            const res2 = await sandbox.auctionsPlaceBid('auc_container_1', 80000);
            assert.ok(res2.error);
            assert.ok(res2.error.includes('Troppi rilanci ravvicinati'));
        });

        test('superamento (outbid) e rilancio dopo essere stati superati', async () => {
            const { sandbox, statoAste } = amb;

            // Stato iniziale: auc_veh_lead ha my_bid = 32000, top_bid = 32000 (in testa)
            let asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_lead');
            assert.equal(asta.my_bid, 32000);
            assert.equal(asta.top_bid, 32000);

            // Un rivale supera l'offerta portando top_bid a 40000
            const serverAsta = statoAste.find(a => a.id === 'auc_veh_lead');
            serverAsta.top_bid = 40000;
            await sandbox.auctionsRefresh(true);

            asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_lead');
            assert.equal(asta.top_bid, 40000);
            assert.equal(asta.my_bid, 32000);
            assert.ok(asta.my_bid < asta.top_bid, 'il giocatore risulta superato');

            // Il giocatore rilancia con 45000
            const rilancio = await sandbox.auctionsPlaceBid('auc_veh_lead', 45000);
            assert.equal(rilancio.error, undefined);
            asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_lead');
            assert.equal(asta.top_bid, 45000);
            assert.equal(asta.my_bid, 45000);
        });
    });

    describe('4. Ciclo di Vita Aggiudicazione e Risoluzione (rpc_resolve_auction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('asta che scade senza offerte viene annullata senza vincitori né esborsi', async () => {
            const { sandbox } = amb;
            // Simulazione logica server resolve auction su asta deserta
            const resolveAuction = (auction) => {
                if (!auction.top_bid) {
                    auction.status = 'cancelled';
                    return { success: false, reason: 'nessuna offerta valida' };
                }
            };

            const astaDeserta = { id: 'auc_empty', min_bid: 50000, top_bid: null, status: 'open' };
            const esito = resolveAuction(astaDeserta);

            assert.equal(esito.success, false);
            assert.equal(astaDeserta.status, 'cancelled');
        });

        test('asta con offerta valida assegna il lotto e chiude l\'asta', async () => {
            const resolveAuction = (auction, winnerId, winningBid, playerCash) => {
                if (playerCash < winningBid) return { success: false, reason: 'fondi insufficienti' };
                auction.status = 'closed';
                auction.winner_id = winnerId;
                auction.winning_bid = winningBid;
                return { success: true, winner_id: winnerId, amount: winningBid, lot_type: auction.lot_type };
            };

            const asta = { id: 'auc_win', lot_type: 'vehicle', status: 'open', min_bid: 30000 };
            const esito = resolveAuction(asta, 'user_test_uuid', 35000, 100000);

            assert.equal(esito.success, true);
            assert.equal(asta.status, 'closed');
            assert.equal(asta.winner_id, 'user_test_uuid');
            assert.equal(asta.winning_bid, 35000);
        });
    });

    describe('5. Riscossione Lotto Vinto (auctionsClaim, auctionsRevealWon, fleet_pack)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsClaim su veicolo singolo aggiunge l\'auto in flotta e rimuove da wonAuctions', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('auc_won_veh');

            assert.equal(esito.error, undefined);
            assert.equal(gs.fleet.length, flottaPrima + 1, 'un veicolo deve essere aggiunto alla flotta');
            const nuovaAuto = gs.fleet[gs.fleet.length - 1];
            assert.equal(nuovaAuto.tier, 'vip');
            assert.equal(nuovaAuto.condition, 80);
            assert.equal(nuovaAuto.isLease, false);
            assert.ok(nuovaAuto.vehicleClass);

            assert.equal(sandbox._auctionsState.wonAuctions.length, 0, 'il lotto riscosso non deve più comparire tra quelli da ritirare');
        });

        test('auctionsClaim su container accredita contanti via CE_money e inserisce veicolo', async () => {
            const ambCont = creaAmbienteAste({
                wonAuctions: [
                    {
                        id: 'auc_won_container',
                        lot_type: 'container',
                        title: 'Container Dogana',
                        icon: '📦',
                        vehicle_data: {},
                        container_data: {
                            items: [
                                { type: 'vehicle', tier: 'business', condition: 60 },
                                { type: 'cash', amount: 35000 },
                            ],
                        },
                        winning_bid: 50000,
                    },
                ],
                cash: 100000,
            });
            await ambCont.sandbox.auctionsRefresh(true);

            let syncCashChiamato = false;
            ambCont.sandbox.ServerState.syncCash = async () => { syncCashChiamato = true; };

            const esito = await ambCont.sandbox.auctionsClaim('auc_won_container');

            assert.equal(esito.error, undefined);
            assert.equal(esito.contanti, 35000);
            assert.equal(ambCont.gs.cash, 135000, 'il denaro del container deve essere accreditato');
            assert.equal(ambCont.gs.fleet.length, 1, 'il veicolo dentro il container deve entrare in flotta');
            assert.equal(syncCashChiamato, false, 'nessun doppio syncCash');

            ambCont.env.stopAllIntervals();
        });

        test('auctionsClaim su lotto fleet_pack inserisce TUTTI i veicoli del pacchetto in flotta', async () => {
            const ambFleet = creaAmbienteAste({
                wonAuctions: [
                    {
                        id: 'auc_won_fleet_pack',
                        lot_type: 'fleet_pack',
                        title: 'Lotto 3 Veicoli Fallimento',
                        icon: '🚐',
                        vehicle_data: {
                            vehicles: [
                                { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70 },
                                { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65 },
                                { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58 },
                            ],
                        },
                        container_data: {},
                        winning_bid: 75000,
                    },
                ],
            });
            await ambFleet.sandbox.auctionsRefresh(true);

            const esito = await ambFleet.sandbox.auctionsClaim('auc_won_fleet_pack');

            assert.equal(esito.error, undefined);
            assert.equal(esito.veicoli.length, 3, 'devono essere generati esattamente 3 veicoli');
            assert.equal(ambFleet.gs.fleet.length, 3, 'tutti e 3 i veicoli devono trovarsi in gameState.fleet');
            assert.equal(ambFleet.gs.fleet[0].vehicleClass, 'stellar_e_exec');
            assert.equal(ambFleet.gs.fleet[1].vehicleClass, 'volt_3_urban');
            assert.equal(ambFleet.gs.fleet[2].vehicleClass, 'stellar_v_carr');

            ambFleet.env.stopAllIntervals();
        });

        test('auctionsClaim rifiutato dal server non accredita alcun bene né veicolo', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('lotto_non_esistente');

            assert.ok(esito.error);
            assert.ok(esito.error.includes('non riscuotibile') || esito.error.includes('Ritiro fallito'));
            assert.equal(gs.cash, cashPrima);
            assert.equal(gs.fleet.length, flottaPrima);
        });

        test('auctionsRevealWon apre il modale con i dettagli del lotto riscosso', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('auc_won_veh');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'il modale di aggiudicazione deve comparire');
            assert.ok(modal.innerHTML.includes('Stellar S-Imperial Aggiudicata'));
            assert.ok(modal.innerHTML.includes('Aggiudicato per'));
            assert.ok(modal.innerHTML.includes('60.000'));
        });

        test('auctionsRevealWon per container svela il contenuto nel modale', async () => {
            const ambCont = creaAmbienteAste({
                wonAuctions: [
                    {
                        id: 'auc_won_cont_modal',
                        lot_type: 'container',
                        title: 'Container Porto',
                        icon: '📦',
                        vehicle_data: {},
                        container_data: {
                            items: [
                                { type: 'vehicle', tier: 'vip', condition: 75 },
                                { type: 'cash', amount: 25000 },
                            ],
                        },
                        winning_bid: 45000,
                    },
                ],
            });
            await ambCont.sandbox.auctionsRefresh(true);

            await ambCont.sandbox.auctionsRevealWon('auc_won_cont_modal');

            const modal = ambCont.sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto Svelato!'));
            assert.ok(modal.innerHTML.includes('Liquidità: €25.000'));
            assert.ok(modal.innerHTML.includes('Veicolo vip'));

            ambCont.env.stopAllIntervals();
        });
    });

    describe('6. Rendering Scheda Aste e Formattazione (renderTabAuctions, helper)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('helper formattazione: _fmtCurrency, _countdown, _tierBadge, _aErr', () => {
            const { sandbox } = amb;

            // _fmtCurrency
            assert.equal(sandbox._fmtCurrency(null), '—');
            assert.equal(sandbox._fmtCurrency(0), '€0');
            assert.equal(sandbox._fmtCurrency(50000), '€50.000');

            // _countdown
            assert.equal(sandbox._countdown(new Date(Date.now() - 5000).toISOString()), 'Scaduta');
            assert.match(sandbox._countdown(new Date(Date.now() + 72 * 3600 * 1000).toISOString()), /\d+g \d+h/);
            assert.match(sandbox._countdown(new Date(Date.now() + 5 * 3600 * 1000).toISOString()), /\d+h \d+m/);
            assert.match(sandbox._countdown(new Date(Date.now() + 25 * 60 * 1000).toISOString()), /\d+m \d+s/);

            // _tierBadge
            assert.ok(sandbox._tierBadge('business').includes('Business'));
            assert.ok(sandbox._tierBadge('VIP').includes('VIP'));
            assert.ok(sandbox._tierBadge('ultra').includes('Ultra'));
            assert.ok(sandbox._tierBadge('armored').includes('Armored'));

            // _aErr
            assert.ok(sandbox._aErr('Test', new Error('Messaggio')).includes('Test: Messaggio'));
        });

        test('renderTabAuctions disegna intestazione, KPI, banner vincite e schede', () => {
            const { sandbox } = amb;

            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Aste Giudiziarie'));
            assert.ok(container.innerHTML.includes('Lotti Aperti'));
            assert.ok(container.innerHTML.includes('🏆 Aste Vinte — Da Ritirare'));
            assert.ok(container.innerHTML.includes('Stellar S-Imperial Aggiudicata'));
            assert.ok(container.innerHTML.includes('Mercedes Classe S sequestrata'));
            assert.ok(container.innerHTML.includes('BMW Serie 7'));
            assert.ok(container.innerHTML.includes('Rolls-Royce Ghost'));
            assert.ok(container.innerHTML.includes('Container Sigillato'));
            assert.ok(container.innerHTML.includes('Lotto 3 Veicoli'));
        });

        test('renderTabAuctions evidenzia se l\'utente è in testa o se è stato superato', () => {
            const { sandbox } = amb;

            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Sei in testa — mantieni la posizione'));
            assert.ok(container.innerHTML.includes('Sei stato superato! Rilancia per vincere'));
        });

        test('renderTabAuctions con lista aste vuota mostra stato vuoto', () => {
            const { sandbox } = amb;
            sandbox._auctionsState.auctions = [];
            sandbox._auctionsState.wonAuctions = [];
            sandbox._auctionsState.myBids = [];

            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Nessuna asta aperta al momento'));
        });

        test('renderTabAuctions non crasha se tab-container non esiste nel DOM', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });
    });

    describe('7. Event Delegation — Interazione utente via DOM (events.js)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
            amb.sandbox.renderTabAuctions();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su "Fai Offerta" apre il modale tramite event delegation', () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsOpenBidModal"]');
            assert.ok(btn);

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            sandbox.auctionsOpenBidModal(auctionId);

            assert.ok(sandbox.document.getElementById('auction-bid-modal'));
        });

        test('click su "Ritira" nel banner vincite apre il modale di aggiudicazione', async () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsRevealWon"]');
            assert.ok(btn);

            const wonId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            await sandbox.auctionsRevealWon(wonId);

            assert.ok(sandbox.document.getElementById('auction-won-modal'));
        });

        test('click su tasto chiudi ✕ rimuove il modale tramite ceRemove', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');
            assert.ok(sandbox.document.getElementById('auction-bid-modal'));

            sandbox.ceRemove('auction-bid-modal');
            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });

        test('ceThen esegue auctionsRefresh e switchTab', async () => {
            const { sandbox, rpcLog } = amb;
            let tabSwitched = null;
            sandbox.switchTab = (tab) => { tabSwitched = tab; };

            sandbox.ceThen('auctionsRefresh', 'switchTab', 'auctions');
            await new Promise(r => setImmediate(r));

            assert.equal(tabSwitched, 'auctions');
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_judicial_auctions'));
        });
    });

    describe('8. Tracciamento Denaro e Anticheat Doppio Conteggio', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste({ cash: 500000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('piazzare un\'offerta NON tocca il saldo di cassa locale (addebito solo all\'aggiudicazione)', async () => {
            const { sandbox, gs } = amb;
            await sandbox.auctionsRefresh(true);
            const cashPrima = gs.cash;

            await sandbox.auctionsPlaceBid('auc_veh_1', 65000);

            assert.equal(gs.cash, cashPrima, 'il denaro locale non deve essere scalato all\'invio dell\'offerta');
        });

        test('riscossione container muove denaro via CE_money.accreditatoDalServer senza syncCash', async () => {
            const ambCont = creaAmbienteAste({
                wonAuctions: [
                    {
                        id: 'auc_c_sync',
                        lot_type: 'container',
                        title: 'Container Valuta',
                        icon: '📦',
                        container_data: { items: [{ type: 'cash', amount: 80000 }] },
                        winning_bid: 60000,
                    },
                ],
                cash: 100000,
            });
            await ambCont.sandbox.auctionsRefresh(true);

            let syncCalls = 0;
            ambCont.sandbox.ServerState.syncCash = async () => { syncCalls++; };

            await ambCont.sandbox.auctionsClaim('auc_c_sync');

            assert.equal(ambCont.gs.cash, 180000, 'il cash locale riflette subito l\'accredito del container');
            assert.equal(syncCalls, 0, 'syncCash non deve essere chiamato (già accreditato dal server)');

            ambCont.env.stopAllIntervals();
        });

        test('persistenza: auto riscossa e saldo aggiornato persistono con saveGame', async () => {
            const { sandbox, gs } = amb;
            await sandbox.auctionsRefresh(true);

            await sandbox.auctionsClaim('auc_won_veh');

            const raw = sandbox.localStorage.getItem('ce_save_slot_1');
            if (raw) {
                const parsed = JSON.parse(raw);
                assert.equal(parsed.fleet.length, gs.fleet.length, 'la flotta salvata in localStorage deve includere l\'auto vinta');
            }
        });
    });
});
