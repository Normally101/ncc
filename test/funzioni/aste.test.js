'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `auctions.js` e dai relativi gestori UI / event delegation,
   verificare l'interazione con Supabase RPC, la gestione del ciclo di vita
   dei lotti (veicoli singoli, container al buio, lotti multipli fleet_pack),
   il rispetto dell'integrità contabile senza doppio conteggio (CE_money),
   la gestione dei casi limite (fondi insufficienti, rate limit, rilanci ravvicinati,
   aste scadute o non autenticate) e il rendering realtime.
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
            id: 'auc_veh_1',
            lot_type: 'vehicle',
            title: 'Mercedes Classe S sequestrata — Napoli',
            icon: '🚗',
            min_bid: 45000,
            top_bid: 50000,
            my_bid: 50000,
            bid_count: 3,
            auction_ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            vehicle_data: {
                tier: 'PREMIUM',
                vehicleClass: 'stellar_s_imp',
                condition: 62,
                km: 87000,
                year: 2019,
            },
            container_data: {},
        },
        {
            id: 'auc_veh_2',
            lot_type: 'vehicle',
            title: 'BMW Serie 7 — Corte d\'Appello Roma',
            icon: '🚙',
            min_bid: 28000,
            top_bid: 35000,
            my_bid: 30000, // outbid
            bid_count: 4,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            vehicle_data: {
                tier: 'business',
                vehicleClass: 'stellar_e_exec',
                condition: 55,
                km: 112000,
                year: 2018,
            },
            container_data: {},
        },
        {
            id: 'auc_cont_3',
            lot_type: 'container',
            title: 'Container Sigillato — Dogana Gioia Tauro',
            icon: '📦',
            min_bid: 80000,
            top_bid: null,
            my_bid: null,
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 1800 * 1000).toISOString(), // 30m
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'vehicle', tier: 'presidential', vehicleClass: 'stellar_q_exec', condition: 78, km: 45000 },
                    { type: 'cash', amount: 120000 },
                ],
            },
        },
        {
            id: 'auc_fleet_4',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli — Fallimento NCC Palermo',
            icon: '🚐',
            min_bid: 75000,
            top_bid: 90000,
            my_bid: null,
            bid_count: 2,
            auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            vehicle_data: {
                vehicles: [
                    { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70 },
                    { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65 },
                    { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58 },
                ],
            },
            container_data: {},
        },
    ];

    const wonAuctionsDefault = [
        {
            id: 'auc_won_1',
            lot_type: 'vehicle',
            title: 'Rolls-Royce Ghost — Asta Fallimentare Milano',
            icon: '👑',
            winning_bid: 380000,
            created_at: new Date(Date.now() - 3600000).toISOString(),
            vehicle_data: {
                tier: 'ultra',
                vehicleClass: 'majestic_spirit',
                condition: 88,
                km: 32000,
                year: 2021,
            },
            container_data: {},
        },
    ];

    const myBidsDefault = [
        {
            auction_id: 'auc_veh_1',
            auction_title: 'Mercedes Classe S sequestrata — Napoli',
            auction_icon: '🚗',
            auction_status: 'open',
            is_winner: false,
            amount: 50000,
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            auction_id: 'auc_veh_2',
            auction_title: 'BMW Serie 7 — Corte d\'Appello Roma',
            auction_icon: '🚙',
            auction_status: 'open',
            is_winner: false,
            amount: 30000,
            created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
            auction_id: 'auc_won_1',
            auction_title: 'Rolls-Royce Ghost — Asta Fallimentare Milano',
            auction_icon: '👑',
            auction_status: 'closed',
            is_winner: true,
            amount: 380000,
            created_at: new Date(Date.now() - 86400000).toISOString(),
        },
    ];

    let statoAste = (opzioni.auctions || auctionsDefault).map(a => JSON.parse(JSON.stringify(a)));
    let statoVinte = (opzioni.wonAuctions || wonAuctionsDefault).map(w => JSON.parse(JSON.stringify(w)));
    let statoOfferte = (opzioni.myBids || myBidsDefault).map(b => JSON.parse(JSON.stringify(b)));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: () => ({
            select: () => ({
                eq: () => Promise.resolve({ data: null, error: null }),
            }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoAste, statoVinte, statoOfferte });
            }

            if (nome === 'rpc_get_judicial_auctions') {
                return { data: statoAste, error: null };
            }

            if (nome === 'rpc_get_won_auctions') {
                return { data: statoVinte, error: null };
            }

            if (nome === 'rpc_get_my_bids') {
                return { data: statoOfferte, error: null };
            }

            if (nome === 'rpc_place_auction_bid') {
                if (!env.sandbox.currentUser) {
                    return { data: null, error: { message: 'Non autenticato' } };
                }

                const asta = statoAste.find(a => a.id === args.v_auction_id);
                if (!asta) return { data: null, error: { message: 'Asta non trovata' } };
                if (new Date(asta.auction_ends_at).getTime() <= Date.now()) {
                    return { data: null, error: { message: 'Asta scaduta' } };
                }
                if (args.v_amount < asta.min_bid) {
                    return { data: null, error: { message: `Offerta minima: €${asta.min_bid}` } };
                }
                if (args.v_amount > 100000000) {
                    return { data: null, error: { message: 'Offerta massima €100.000.000' } };
                }
                if (asta.top_bid && args.v_amount <= asta.top_bid) {
                    return { data: null, error: { message: `Offerta troppo bassa (attuale: €${asta.top_bid})` } };
                }

                const cashGiocatore = env.sandbox.gameState.cash || 0;
                if (cashGiocatore < args.v_amount) {
                    return { data: null, error: { message: 'Fondi insufficienti' } };
                }

                asta.top_bid = args.v_amount;
                asta.my_bid = args.v_amount;
                asta.bid_count = (asta.bid_count || 0) + 1;

                const bidRecord = statoOfferte.find(b => b.auction_id === asta.id);
                if (bidRecord) {
                    bidRecord.amount = args.v_amount;
                } else {
                    statoOfferte.push({
                        auction_id: asta.id,
                        auction_title: asta.title,
                        auction_icon: asta.icon,
                        auction_status: 'open',
                        is_winner: false,
                        amount: args.v_amount,
                        created_at: new Date().toISOString(),
                    });
                }

                return { data: { success: true, amount: args.v_amount }, error: null };
            }

            if (nome === 'rpc_claim_auction') {
                if (!env.sandbox.currentUser) {
                    return { data: null, error: { message: 'Non autenticato' } };
                }

                const wonIdx = statoVinte.findIndex(w => w.id === args.v_auction_id);
                if (wonIdx < 0) {
                    return { data: null, error: { message: 'Lotto non riscuotibile: gia\' ritirato, non tuo, o asta non chiusa' } };
                }

                const lotto = statoVinte[wonIdx];
                let contanti = 0;
                if (lotto.lot_type === 'container') {
                    for (const it of (lotto.container_data?.items || [])) {
                        if (it.type === 'cash') contanti += (it.amount || 0);
                    }
                }

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
        removeChannel: (chanObj) => {
            if (chanObj && chanObj.name) subscriptions.delete(chanObj.name);
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_player_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Predisponi stato giocatore
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 500000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [];

    // Predisponi funzioni window e DOM
    env.sandbox.switchTab = (tab) => { env.sandbox._activeTab = tab; };
    env.sandbox.window.switchTab = env.sandbox.switchTab;
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        statoAste,
        statoVinte,
        statoOfferte,
        subscriptions,
    };
}

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola auctions, wonAuctions e myBids da Supabase RPC', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 4, 'deve caricare 4 aste aperte');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 1, 'deve caricare 1 asta vinta');
            assert.equal(sandbox._auctionsState.myBids.length, 3, 'deve caricare 3 offerte effettuate');
            assert.ok(sandbox._auctionsState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata: throttle attivo -> nessuna RPC
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve eseguire nuove query entro 30s');

            // Chiamata forzata: bypassa throttle
            await sandbox.auctionsRefresh(true);
            assert.equal(rpcLog.length, countPrima + 3, 'force=true deve ricaricare le 3 tabelle');
        });

        test('auctionsRefresh non crasha in assenza di supabaseClient', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsInit esegue il refresh iniziale e registra la sottoscrizione realtime', async () => {
            const { sandbox, rpcLog, subscriptions } = amb;
            await sandbox.auctionsInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_judicial_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_won_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_my_bids'));
            assert.ok(subscriptions.has('judicial_auctions_changes'), 'deve sottoscrivere il canale realtime');
        });

        test('auctionsInit mostra notifica informativa se ci sono lotti vinti da ritirare', async () => {
            const { sandbox, env } = amb;
            await sandbox.auctionsInit();

            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('asta/e vinta/e da ritirare')));
        });
    });

    describe('2. Piazzamento offerta (auctionsPlaceBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('invia offerta valida, chiama rpc_place_auction_bid e aggiorna la cache', async () => {
            const { sandbox, rpcLog, env } = amb;

            const res = await sandbox.auctionsPlaceBid('auc_veh_2', 40000);

            assert.equal(res.error, undefined);
            assert.ok(res.data);
            assert.equal(res.data.success, true);

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_place_auction_bid');
            assert.equal(bidRpc.args.v_auction_id, 'auc_veh_2');
            assert.equal(bidRpc.args.v_amount, 40000);
        });

        test('errore se supabaseClient non è disponibile', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('rifiuto offerta se fondi insufficienti (gestione errore RPC)', async () => {
            const ambNoFunds = creaAmbienteAste({ cash: 10000 });
            await ambNoFunds.sandbox.auctionsRefresh(true);

            const res = await ambNoFunds.sandbox.auctionsPlaceBid('auc_veh_1', 60000);

            assert.ok(res.error, 'deve ritornare errore');
            assert.match(res.error, /Fondi insufficienti/);
            ambNoFunds.env.stopAllIntervals();
        });

        test('rifiuto offerta inferiore al top bid o al minimo', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 48000); // top_bid is 50000

            assert.ok(res.error);
            assert.match(res.error, /Offerta troppo bassa/);
        });

        test('rifiuto offerta che supera il cap di 100M', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 105000000);

            assert.ok(res.error);
            assert.match(res.error, /Offerta massima/);
        });

        test('rifiuto offerta su asta inesistente o scaduta', async () => {
            const { sandbox } = amb;
            const resInesistente = await sandbox.auctionsPlaceBid('auc_fantasma', 50000);
            assert.ok(resInesistente.error);
            assert.match(resInesistente.error, /Asta non trovata/);

            const ambScaduta = creaAmbienteAste({
                auctions: [{
                    id: 'auc_scaduta_1',
                    lot_type: 'vehicle',
                    title: 'Asta Scaduta',
                    min_bid: 10000,
                    top_bid: null,
                    auction_ends_at: new Date(Date.now() - 10000).toISOString(),
                }],
            });
            await ambScaduta.sandbox.auctionsRefresh(true);
            const resScaduta = await ambScaduta.sandbox.auctionsPlaceBid('auc_scaduta_1', 15000);
            assert.ok(resScaduta.error);
            assert.match(resScaduta.error, /Asta scaduta/);
            ambScaduta.env.stopAllIntervals();
        });

        test('rifiuto offerta se utente non autenticato', async () => {
            const ambNoAuth = creaAmbienteAste({ currentUser: null });
            await ambNoAuth.sandbox.auctionsRefresh(true);

            const res = await ambNoAuth.sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.ok(res.error);
            assert.match(res.error, /Non autenticato/);
            ambNoAuth.env.stopAllIntervals();
        });

        test('rifiuto se due offerte di fila inviate troppo velocemente (rate limit 10s)', async () => {
            let lastCall = 0;
            const ambRate = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => {
                        const now = Date.now();
                        if (now - lastCall < 10000 && lastCall > 0) {
                            return { data: null, error: { message: 'Troppi rilanci ravvicinati — aspetta qualche secondo' } };
                        }
                        lastCall = now;
                        return { data: { success: true }, error: null };
                    },
                },
            });
            await ambRate.sandbox.auctionsRefresh(true);

            const prima = await ambRate.sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.equal(prima.error, undefined);

            const seconda = await ambRate.sandbox.auctionsPlaceBid('auc_veh_1', 65000);
            assert.ok(seconda.error);
            assert.match(seconda.error, /Troppi rilanci ravvicinati/);
            ambRate.env.stopAllIntervals();
        });
    });

    describe('3. Modale di offerta e conferme (auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsOpenBidModal genera il modale nel DOM con dettagli del lotto', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_2');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('BMW Serie 7'));
            assert.ok(modal.innerHTML.includes('Offerta minima'));
            assert.ok(modal.innerHTML.includes('Offerta più alta'));
            assert.ok(modal.innerHTML.includes('La tua offerta'));

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input);
            assert.equal(input.getAttribute('min'), '35001'); // Math.max(min_bid, top_bid + 1)
        });

        test('auctionsOpenBidModal su container mostra badge contenuto nascosto', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_cont_3');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto rivelato solo al vincitore'));
        });

        test('auctionsOpenBidModal per asta inesistente non apre nulla', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('non_esiste');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null);
        });

        test('auctionsConfirmBid blocca importi nulli o <= 0 e mostra errore inline', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_2');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '0';

            await sandbox.auctionsConfirmBid('auc_veh_2');

            const errDiv = sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Inserisci un importo valido'));
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0);
        });

        test('auctionsConfirmBid gestisce errore RPC: mostra messaggio e riabilita bottone', async () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_2');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '30000'; // Troppo bassa (top_bid è 35000)

            await sandbox.auctionsConfirmBid('auc_veh_2');

            const errDiv = sandbox.document.getElementById('bid-error');
            const btn = sandbox.document.getElementById('bid-confirm-btn');

            assert.equal(errDiv.style.display, 'block');
            assert.match(errDiv.textContent, /Offerta troppo bassa/);
            assert.equal(btn.disabled, false);
            assert.equal(btn.textContent, '🔨 Piazza Offerta');
        });

        test('auctionsConfirmBid riuscita chiude il modale, invia notifica e naviga a tab auctions', async () => {
            const { sandbox, env } = amb;
            let tabNavigato = null;
            sandbox.switchTab = (tab) => { tabNavigato = tab; };

            sandbox.auctionsOpenBidModal('auc_veh_2');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '40000';

            await sandbox.auctionsConfirmBid('auc_veh_2');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null, 'il modale deve essere stato rimosso');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta di €40.000 registrata')));
            assert.equal(tabNavigato, 'auctions');
        });
    });

    describe('4. Riscossione vincita e consegna premio (auctionsClaim, auctionsRevealWon)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsClaim riscuote lotto singolo veicolo, lo inserisce in flotta e lo rimuove dai da ritirare', async () => {
            const { sandbox, gs } = amb;
            const prima = gs.fleet.length;

            const res = await sandbox.auctionsClaim('auc_won_1');

            assert.equal(res.error, undefined);
            assert.equal(gs.fleet.length, prima + 1);
            const auto = gs.fleet[gs.fleet.length - 1];
            assert.equal(auto.tier, 'ultra');
            assert.equal(auto.condition, 88);
            assert.equal(auto.isLease, false);

            assert.ok(!sandbox._auctionsState.wonAuctions.some(w => w.id === 'auc_won_1'), 'deve essere rimosso dai lotti da ritirare');
        });

        test('auctionsClaim riscuote lotto multiplo fleet_pack consegnando TUTTI i veicoli alla flotta', async () => {
            const ambFleet = creaAmbienteAste({
                wonAuctions: [{
                    id: 'auc_won_fleet_pack',
                    lot_type: 'fleet_pack',
                    title: 'Lotto 3 Veicoli — Fallimento NCC',
                    winning_bid: 75000,
                    vehicle_data: {
                        vehicles: [
                            { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70 },
                            { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65 },
                            { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58 },
                        ],
                    },
                    container_data: {},
                }],
            });
            await ambFleet.sandbox.auctionsRefresh(true);

            const res = await ambFleet.sandbox.auctionsClaim('auc_won_fleet_pack');

            assert.equal(res.error, undefined);
            assert.equal(res.veicoli.length, 3, 'deve creare 3 veicoli dal fleet_pack');
            assert.equal(ambFleet.gs.fleet.length, 3, 'tutti e 3 i veicoli devono essere aggiunti a gameState.fleet');
            assert.equal(ambFleet.gs.fleet[0].condition, 70);
            assert.equal(ambFleet.gs.fleet[1].condition, 65);
            assert.equal(ambFleet.gs.fleet[2].condition, 58);
            ambFleet.env.stopAllIntervals();
        });

        test('auctionsClaim riscuote container con denaro e veicolo via CE_money.accreditatoDalServer', async () => {
            const ambCont = creaAmbienteAste({
                wonAuctions: [{
                    id: 'auc_won_cont',
                    lot_type: 'container',
                    title: 'Container Misterioso',
                    winning_bid: 80000,
                    vehicle_data: {},
                    container_data: {
                        items: [
                            { type: 'cash', amount: 120000 },
                            { type: 'vehicle', tier: 'presidential', condition: 80 },
                        ],
                    },
                }],
                cash: 100000,
            });
            await ambCont.sandbox.auctionsRefresh(true);

            const res = await ambCont.sandbox.auctionsClaim('auc_won_cont');

            assert.equal(res.error, undefined);
            assert.equal(ambCont.gs.cash, 220000, 'il denaro del container deve essere accreditato');
            assert.equal(ambCont.gs.fleet.length, 1, 'il veicolo del container deve essere aggiunto alla flotta');
            ambCont.env.stopAllIntervals();
        });

        test('auctionsClaim gestione errore su lotto già ritirato o inesistente', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsClaim('lotto_inesistente');

            assert.ok(res.error);
            assert.match(res.error, /non riscuotibile/);
        });

        test('auctionsRevealWon apre modale svelando il premio', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('auc_won_1');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'il modale di vittoria deve essere aperto nel DOM');
            assert.ok(modal.innerHTML.includes('Rolls-Royce Ghost'));
            assert.ok(modal.innerHTML.includes('Aggiudicato per €380.000'));
        });

        test('auctionsRevealWon con container svela la composizione (veicoli e cash)', async () => {
            const ambCont = creaAmbienteAste({
                wonAuctions: [{
                    id: 'auc_won_cont',
                    lot_type: 'container',
                    title: 'Container Dogana',
                    icon: '📦',
                    winning_bid: 80000,
                    vehicle_data: {},
                    container_data: {
                        items: [
                            { type: 'cash', amount: 50000 },
                            { type: 'vehicle', tier: 'standard', condition: 60 },
                        ],
                    },
                }],
            });
            await ambCont.sandbox.auctionsRefresh(true);

            await ambCont.sandbox.auctionsRevealWon('auc_won_cont');

            const modal = ambCont.sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto Svelato!'));
            assert.ok(modal.innerHTML.includes('Liquidità: €50.000'));
            assert.ok(modal.innerHTML.includes('Veicolo standard'));
            ambCont.env.stopAllIntervals();
        });

        test('auctionsRevealWon con errore notifica al giocatore e non apre modale', async () => {
            const ambErr = creaAmbienteAste({
                wonAuctions: [{ id: 'auc_err_1', title: 'Asta Errore' }],
                rpcHandlers: {
                    rpc_claim_auction: async () => ({
                        data: null,
                        error: { message: 'Errore di sincronizzazione server' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);

            await ambErr.sandbox.auctionsRevealWon('auc_err_1');

            const modal = ambErr.sandbox.document.getElementById('auction-won-modal');
            assert.equal(modal, null);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Errore di sincronizzazione')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('5. Helper di formattazione e visualizzazione (_countdown, _tierBadge, _fmtCurrency, _autoDalLotto)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_countdown formatta correttamente scadenze passate, a lungo termine e a breve termine', () => {
            const { sandbox } = amb;

            // Passata
            assert.equal(vm.runInContext('_countdown(new Date(Date.now() - 5000).toISOString())', sandbox), 'Scaduta');

            // Più di 48h (es. 72h -> 3g 0h)
            const res48h = vm.runInContext('_countdown(new Date(Date.now() + 72 * 3600 * 1000).toISOString())', sandbox);
            assert.match(res48h, /3g \d+h/);

            // Tra 1h e 48h (es. 5h -> 5h 0m)
            const res5h = vm.runInContext('_countdown(new Date(Date.now() + 5 * 3600 * 1000).toISOString())', sandbox);
            assert.match(res5h, /4h \d+m|5h \d+m/);

            // Meno di 1h (es. 15m -> 15m 0s)
            const res15m = vm.runInContext('_countdown(new Date(Date.now() + 15 * 60 * 1000).toISOString())', sandbox);
            assert.match(res15m, /14m \d+s|15m \d+s/);
        });

        test('_tierBadge normalizza maiuscolo/minuscolo e restituisce pill corretto', () => {
            const { sandbox } = amb;

            const standard = vm.runInContext('_tierBadge("standard")', sandbox);
            assert.ok(standard.includes('em-pill--gray') && standard.includes('Standard'));

            const business = vm.runInContext('_tierBadge("BUSINESS")', sandbox);
            assert.ok(business.includes('em-pill--blue') && business.includes('Business'));

            const ultra = vm.runInContext('_tierBadge("ultra")', sandbox);
            assert.ok(ultra.includes('em-pill--gold') && ultra.includes('Ultra'));

            const sconosciuto = vm.runInContext('_tierBadge("custom_tier")', sandbox);
            assert.ok(sconosciuto.includes('em-pill--gray') && sconosciuto.includes('custom_tier'));
        });

        test('_fmtCurrency formatta importi e valori nulli', () => {
            const { sandbox } = amb;

            assert.equal(vm.runInContext('_fmtCurrency(null)', sandbox), '—');
            assert.equal(vm.runInContext('_fmtCurrency(undefined)', sandbox), '—');
            assert.equal(vm.runInContext('_fmtCurrency(0)', sandbox), '€0');
            assert.ok(vm.runInContext('_fmtCurrency(50000)', sandbox).includes('50.000') || vm.runInContext('_fmtCurrency(50000)', sandbox).includes('50,000'));
        });

        test('_autoDalLotto genera auto valide attingendo dai cataloghi reali', () => {
            const { sandbox } = amb;

            const auto = vm.runInContext('_autoDalLotto({ tier: "vip", condition: 75, km: 50000 })', sandbox);

            assert.ok(auto);
            assert.ok(auto.id.startsWith('c_ast_'));
            assert.equal(auto.isLease, false);
            assert.equal(auto.condition, 75);
            assert.equal(auto.mileage, 50000);
            assert.ok(auto.vehicleClass);
        });
    });

    describe('6. Rendering del tab Aste (renderTabAuctions)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabAuctions non crasha se tab-container non esiste', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });

        test('renderTabAuctions con zero aste mostra stato vuoto', () => {
            const { sandbox } = amb;
            sandbox._auctionsState.auctions = [];
            sandbox._auctionsState.wonAuctions = [];
            sandbox._auctionsState.myBids = [];

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessuna asta aperta al momento'));
        });

        test('renderTabAuctions disegna KPI, banner vincite, lotti aperti e storico offerte', () => {
            const { sandbox } = amb;

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Aste Giudiziarie'));
            assert.ok(c.innerHTML.includes('Lotti Aperti'));
            assert.ok(c.innerHTML.includes('Tue Offerte'));
            assert.ok(c.innerHTML.includes('Da Ritirare'));
            assert.ok(c.innerHTML.includes('Aste Vinte — Da Ritirare'));
            assert.ok(c.innerHTML.includes('Mercedes Classe S'));
            assert.ok(c.innerHTML.includes('BMW Serie 7'));
            assert.ok(c.innerHTML.includes('Sei in testa — mantieni la posizione'));
            assert.ok(c.innerHTML.includes('Sei stato superato! Rilancia per vincere'));
            assert.ok(c.innerHTML.includes('Storico Offerte'));
        });
    });

    describe('7. Event Delegation & Azioni DOM (ceAct, ceRemove, ceThen, Realtime)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
            amb.sandbox.renderTabAuctions();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su "Fai Offerta" / "Rilancia Offerta" apre il modale via delegation', () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsOpenBidModal"]');
            assert.ok(btn);

            const args = JSON.parse(btn.getAttribute('data-ce-args'));
            sandbox.auctionsOpenBidModal(...args);

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal);
        });

        test('chiusura modale tramite ceRemove rimuove l\'elemento DOM', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal);

            sandbox.ceRemove('auction-bid-modal');

            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });

        test('click su "Ritira" invoca auctionsRevealWon via delegation', async () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsRevealWon"]');
            assert.ok(btn);

            const args = JSON.parse(btn.getAttribute('data-ce-args'));
            await sandbox.auctionsRevealWon(...args);

            const wonModal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(wonModal);
        });

        test('ricezione evento realtime su judicial_auctions aggiorna e ri-renderizza il tab attivo', async () => {
            const { sandbox, subscriptions, rpcLog } = amb;
            sandbox._activeTab = 'auctions';
            sandbox.window._activeTab = 'auctions';
            await sandbox.auctionsInit();

            const countPrima = rpcLog.length;
            const rtCallback = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof rtCallback === 'function');

            // Simula arrivo notifica Realtime da Postgres
            rtCallback({ eventType: 'UPDATE' });
            await new Promise(r => setTimeout(r, 20));

            assert.ok(rpcLog.length > countPrima, 'deve rieseguire il fetch dei lotti');
        });
    });

    describe('8. Integrità contabile ed assenza di doppio conteggio (CE_money / ServerState)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste({ cash: 500000 });
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsPlaceBid non altera il saldo locale gameState.cash né invoca syncCash', async () => {
            const syncedCash = [];
            amb.sandbox.ServerState = {
                isReady: () => true,
                syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
            };

            const cashPrima = amb.gs.cash;
            await amb.sandbox.auctionsPlaceBid('auc_veh_2', 40000);

            assert.equal(amb.gs.cash, cashPrima, 'il cash locale non deve essere scalato dal client al momento dell offerta');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash');
        });

        test('auctionsClaim per container con denaro usa accreditatoDalServer senza syncCash ridondante', async () => {
            const syncedCash = [];
            const ambCont = creaAmbienteAste({
                wonAuctions: [{
                    id: 'auc_won_cont_sync',
                    lot_type: 'container',
                    title: 'Container Cash',
                    winning_bid: 50000,
                    vehicle_data: {},
                    container_data: { items: [{ type: 'cash', amount: 80000 }] },
                }],
                cash: 100000,
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await ambCont.sandbox.auctionsRefresh(true);

            await ambCont.sandbox.auctionsClaim('auc_won_cont_sync');

            assert.equal(ambCont.gs.cash, 180000, 'il denaro deve essere aggiunto alla cassa locale');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato poiché il server ha già mosso il denaro');
            ambCont.env.stopAllIntervals();
        });
    });
});
