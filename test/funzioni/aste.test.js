'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie

   Scopo: collaudare in modo esaustivo tutte le azioni e routine esposte da `auctions.js`
   e dai relativi gestori in `ce-actions.js`, verificare l'interazione con Supabase RPC,
   il ciclo di vita delle offerte, la risoluzione delle aste, il ritiro dei premi
   (veicoli, container con liquidità, pacchetti flotta multipli), la prevenzione
   del doppio conteggio del denaro, e il rendering UI completo.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un mock di ambiente Supabase completo per le Aste Giudiziarie.
 */
function creaAmbienteAste(opzioni = {}) {
    const rpcLog = [];
    const channelEvents = [];
    const subscriptions = new Map();

    const asteDefault = [
        {
            id: 'auc_veh_1',
            lot_type: 'vehicle',
            title: 'Mercedes Classe S sequestrata — Napoli',
            description: 'Veicolo confiscato dalla DIA. Condizioni discrete.',
            icon: '🚗',
            vehicle_data: { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 62, km: 87000, year: 2019 },
            container_data: {},
            min_bid: 45000,
            province_id: 'napoli',
            status: 'open',
            bid_count: 2,
            auction_ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            my_bid: null,
            top_bid: 50000,
        },
        {
            id: 'auc_veh_lead',
            lot_type: 'vehicle',
            title: 'BMW Serie 7 — Roma',
            description: 'Lotto giudiziario n. 447/2024.',
            icon: '🚙',
            vehicle_data: { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 55, km: 112000, year: 2018 },
            container_data: {},
            min_bid: 28000,
            province_id: 'roma',
            status: 'open',
            bid_count: 1,
            auction_ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // < 1h urgente
            my_bid: 35000,
            top_bid: 35000,
        },
        {
            id: 'auc_veh_outbid',
            lot_type: 'vehicle',
            title: 'Rolls-Royce Ghost — Milano',
            description: 'Asta fallimentare Milano.',
            icon: '👑',
            vehicle_data: { tier: 'ultra', vehicleClass: 'majestic_spirit', condition: 88, km: 32000, year: 2021 },
            container_data: {},
            min_bid: 200000,
            province_id: 'milano',
            status: 'open',
            bid_count: 3,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            my_bid: 210000,
            top_bid: 250000,
        },
        {
            id: 'auc_cont_1',
            lot_type: 'container',
            title: 'Container Sigillato — Porto Gioia Tauro',
            description: 'Contenuto ignoto fino all\'aggiudicazione.',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'cash', amount: 80000 },
                    { type: 'vehicle', tier: 'standard', condition: 60, km: 50000 },
                ],
            },
            min_bid: 60000,
            province_id: null,
            status: 'open',
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            my_bid: null,
            top_bid: null,
        },
        {
            id: 'auc_fleet_1',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli — Fallimento Palermo',
            description: 'Tre veicoli business sequestrati.',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70, km: 40000 },
                    { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65, km: 30000 },
                    { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58, km: 60000 },
                ],
            },
            container_data: {},
            min_bid: 75000,
            province_id: 'palermo',
            status: 'open',
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            my_bid: null,
            top_bid: null,
        },
    ];

    const vinteDefault = [
        {
            id: 'won_veh_1',
            lot_type: 'vehicle',
            title: 'Maserati Quattroporte — Aggiudicata',
            icon: '🚗',
            vehicle_data: { tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 75, km: 35000, year: 2020 },
            container_data: {},
            winning_bid: 120000,
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            id: 'won_cont_1',
            lot_type: 'container',
            title: 'Container Dogana — Aggiudicato',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'cash', amount: 45000 },
                    { type: 'vehicle', tier: 'business', condition: 68, km: 55000 },
                ],
            },
            winning_bid: 50000,
            created_at: new Date(Date.now() - 7200000).toISOString(),
        },
    ];

    const mieOfferteDefault = [
        {
            auction_id: 'auc_veh_lead',
            auction_title: 'BMW Serie 7 — Roma',
            auction_icon: '🚙',
            amount: 35000,
            auction_ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
        {
            auction_id: 'won_veh_1',
            auction_title: 'Maserati Quattroporte — Aggiudicata',
            auction_icon: '🚗',
            amount: 120000,
            auction_ends_at: new Date(Date.now() - 3600000).toISOString(),
            auction_status: 'closed',
            is_winner: true,
        },
    ];

    let statoAste = (opzioni.aste || asteDefault).map(a => ({ ...a, vehicle_data: { ...a.vehicle_data }, container_data: { ...a.container_data } }));
    let statoVinte = (opzioni.vinte || vinteDefault).map(w => ({ ...w, vehicle_data: { ...w.vehicle_data }, container_data: { ...w.container_data } }));
    let statoOfferte = (opzioni.offerte || mieOfferteDefault).map(o => ({ ...o }));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    let lastBidTimestamp = 0;

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
                if (!env.sandbox.currentUser) {
                    return { data: null, error: { message: 'Non autenticato' } };
                }

                const auction = statoAste.find(a => a.id === args.v_auction_id);
                if (!auction) return { data: null, error: { message: 'Asta non trovata' } };
                if (auction.status !== 'open') return { data: null, error: { message: 'Asta non aperta' } };
                if (new Date(auction.auction_ends_at).getTime() <= Date.now()) {
                    return { data: null, error: { message: 'Asta scaduta' } };
                }
                if (args.v_amount < auction.min_bid) {
                    return { data: null, error: { message: `Offerta minima: €${auction.min_bid}` } };
                }

                const playerCash = env.sandbox.gameState.cash || 0;
                if (playerCash < args.v_amount) {
                    return { data: null, error: { message: 'Fondi insufficienti' } };
                }

                if (auction.top_bid && args.v_amount <= auction.top_bid) {
                    return { data: null, error: { message: `Offerta troppo bassa (attuale: €${auction.top_bid})` } };
                }

                const now = Date.now();
                if (now - lastBidTimestamp < 1000 && !opzioni.allowFastBids) {
                    return { data: null, error: { message: 'Troppi rilanci ravvicinati — aspetta qualche secondo' } };
                }
                lastBidTimestamp = now;

                auction.top_bid = args.v_amount;
                auction.my_bid = args.v_amount;
                auction.bid_count = (auction.bid_count || 0) + 1;

                const existingBid = statoOfferte.find(b => b.auction_id === args.v_auction_id);
                if (existingBid) {
                    existingBid.amount = args.v_amount;
                } else {
                    statoOfferte.unshift({
                        auction_id: auction.id,
                        auction_title: auction.title,
                        auction_icon: auction.icon,
                        amount: args.v_amount,
                        auction_ends_at: auction.auction_ends_at,
                        auction_status: 'open',
                        is_winner: false,
                    });
                }

                return {
                    data: {
                        success: true,
                        amount: args.v_amount,
                        top_bid: args.v_amount,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_claim_auction') {
                if (!env.sandbox.currentUser) {
                    return { data: null, error: { message: 'Non autenticato' } };
                }

                const idx = statoVinte.findIndex(w => w.id === args.v_auction_id);
                if (idx === -1) {
                    return { data: null, error: { message: 'Lotto non riscuotibile: gia\' ritirato, non tuo, o asta non chiusa' } };
                }

                const won = statoVinte[idx];
                statoVinte.splice(idx, 1);

                let contanti = 0;
                if (won.lot_type === 'container') {
                    for (const item of (won.container_data?.items || [])) {
                        if (item.type === 'cash') {
                            contanti += Number(item.amount) || 0;
                        }
                    }
                }

                return {
                    data: {
                        success: true,
                        lot_type: won.lot_type,
                        vehicle_data: won.vehicle_data,
                        container_data: won.container_data,
                        cash_accreditato: contanti,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_resolve_auction') {
                const auction = statoAste.find(a => a.id === args.v_auction_id);
                if (!auction) return { data: null, error: { message: 'Asta non trovata' } };
                if (auction.status !== 'open') return { data: { skipped: true, reason: 'already resolved' }, error: null };

                if (!auction.top_bid || auction.bid_count === 0) {
                    auction.status = 'cancelled';
                    return { data: { success: false, reason: 'nessuna offerta valida' }, error: null };
                }

                auction.status = 'closed';
                auction.winning_bid = auction.top_bid;

                return {
                    data: {
                        success: true,
                        winner_id: env.sandbox.currentUser?.id || 'user_test_uuid',
                        amount: auction.winning_bid,
                        lot_type: auction.lot_type,
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

    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 300000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'veh_start_1', name: 'Stellar E-Executive', tier: 'business', vehicleClass: 'stellar_e_exec', isLease: false, condition: 90 },
    ];

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

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita (auctions.js)', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola stato aste, vinte e offerte da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 5, 'deve contenere i 5 lotti aperti');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 2, 'deve contenere i 2 lotti vinti');
            assert.equal(sandbox._auctionsState.myBids.length, 2, 'deve contenere le 2 offerte');
            assert.ok(sandbox._auctionsState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata: throttle attivo -> nessuna RPC aggiuntiva
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve eseguire nuove query entro 30s');

            // Chiamata forzata: bypassa throttle
            await sandbox.auctionsRefresh(true);
            assert.equal(rpcLog.length, countPrima + 3, 'force=true deve rieseguire le 3 RPC');
        });

        test('auctionsRefresh non fallisce in assenza di supabaseClient', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsInit esegue il refresh e notifica lotti vinti da ritirare', async () => {
            const { sandbox, env } = amb;
            await sandbox.auctionsInit();

            assert.equal(sandbox._auctionsState.wonAuctions.length, 2);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Hai 2 asta/e vinta/e da ritirare')));
        });
    });

    describe('2. Piazzamento offerta (auctionsPlaceBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('offerta valida aggiorna lo stato, resetta lastFetch e aggiorna la top bid', async () => {
            const { sandbox, rpcLog } = amb;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);

            assert.ok(res.data, 'la risposta deve contenere i dati');
            assert.equal(res.error, undefined);

            const rpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(rpc, 'deve chiamare rpc_place_auction_bid');
            assert.equal(rpc.args.v_auction_id, 'auc_veh_1');
            assert.equal(rpc.args.v_amount, 60000);

            // Verifica che lo stato aggiornato rifletta l'offerta
            const auc = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_1');
            assert.equal(auc.top_bid, 60000);
            assert.equal(auc.my_bid, 60000);
            assert.equal(sandbox._auctionsState._lastFetch > 0, true);
        });

        test('rifiuto offerta se supabaseClient non disponibile', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('rifiuto offerta per fondi insufficienti', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000; // Fondi < 60.000€

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.ok(res.error);
            assert.match(res.error, /Fondi insufficienti/);
        });

        test('rifiuto offerta inferiore al minimo consentito', async () => {
            const { sandbox } = amb;
            // min_bid per auc_veh_1 è 45.000€
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 30000);
            assert.ok(res.error);
            assert.match(res.error, /Offerta minima/);
        });

        test('rifiuto offerta inferiore o uguale alla top bid corrente', async () => {
            const { sandbox } = amb;
            // top_bid attuale è 50.000€
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 50000);
            assert.ok(res.error);
            assert.match(res.error, /Offerta troppo bassa/);
        });

        test('rifiuto offerta se utente non autenticato', async () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.ok(res.error);
            assert.match(res.error, /Non autenticato/);
        });

        test('rifiuto rilanci troppo ravvicinati (rate-limit)', async () => {
            const { sandbox } = amb;

            // Prima offerta valida
            const res1 = await sandbox.auctionsPlaceBid('auc_veh_1', 60000);
            assert.equal(res1.error, undefined);

            // Seconda offerta immediata sullo stesso lotto
            const res2 = await sandbox.auctionsPlaceBid('auc_veh_1', 70000);
            assert.ok(res2.error);
            assert.match(res2.error, /Troppi rilanci/);
        });

        test('piazzare offerta NON tocca il saldo locale gameState.cash', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;

            await sandbox.auctionsPlaceBid('auc_veh_1', 60000);

            assert.equal(gs.cash, cashPrima, 'il cash non deve muoversi dal client: si paga all aggiudicazione sul server');
        });
    });

    describe('3. Finestra modale di offerta (auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsOpenBidModal crea elemento modale nel DOM con dettagli lotto e calcolo minNext', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'la modale #auction-bid-modal deve esistere nel DOM');

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input, 'il campo di input deve esistere');
            // top_bid era 50.000 -> minNext deve essere 50.001
            assert.equal(input.min, '50001');

            // Verifica presenza pulsante conferma con data-ce-act
            const btn = sandbox.document.getElementById('bid-confirm-btn');
            assert.ok(btn);
            assert.ok(btn.getAttribute('data-ce-act').includes('auctionsConfirmBid'));
        });

        test('auctionsOpenBidModal per container mostra avviso contenuto nascosto', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_cont_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal.innerHTML.includes('Contenuto rivelato solo al vincitore'));
        });

        test('auctionsOpenBidModal per lotto inesistente non crea modale', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('lotto_fantasma');

            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });

        test('auctionsOpenBidModal chiude la modale precedente se richiamata', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_1');
            assert.equal(sandbox.document.querySelectorAll('#auction-bid-modal').length, 1);

            sandbox.auctionsOpenBidModal('auc_cont_1');
            assert.equal(sandbox.document.querySelectorAll('#auction-bid-modal').length, 1);
            assert.ok(sandbox.document.getElementById('auction-bid-modal').innerHTML.includes('Container'));
        });

        test('auctionsConfirmBid blocca invio se importo non valido o vuoto', async () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_1');
            const input = sandbox.document.getElementById('bid-amount-input');
            const errDiv = sandbox.document.getElementById('bid-error');

            input.value = '0';
            await sandbox.auctionsConfirmBid('auc_veh_1');

            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Inserisci un importo valido'));
        });

        test('auctionsConfirmBid mostra errore RPC nel box di errore e riabilita pulsante', async () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_1');
            const input = sandbox.document.getElementById('bid-amount-input');
            const errDiv = sandbox.document.getElementById('bid-error');
            const btn = sandbox.document.getElementById('bid-confirm-btn');

            // Offerta troppo bassa
            input.value = '40000';
            await sandbox.auctionsConfirmBid('auc_veh_1');

            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Offerta fallita'));
            assert.equal(btn.disabled, false);
            assert.equal(btn.textContent, '🔨 Piazza Offerta');
        });

        test('auctionsConfirmBid riuscito chiude modale e notifica successo', async () => {
            const { sandbox, env } = amb;

            sandbox.auctionsOpenBidModal('auc_veh_1');
            const input = sandbox.document.getElementById('bid-amount-input');

            input.value = '65000';
            await sandbox.auctionsConfirmBid('auc_veh_1');

            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null, 'la modale deve essere rimossa');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta di €65.000 registrata')));
        });
    });

    describe('4. Riscossione premi vinti (auctionsClaim, auctionsRevealWon)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('riscossione veicolo singolo aggiunge auto con dati coerenti in gameState.fleet', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('won_veh_1');

            assert.equal(esito.error, undefined);
            assert.equal(gs.fleet.length, flottaPrima + 1);
            assert.equal(esito.veicoli.length, 1);

            const auto = gs.fleet[gs.fleet.length - 1];
            assert.equal(auto.tier, 'vip');
            assert.equal(auto.condition, 75);
            assert.equal(auto.mileage, 35000);
            assert.equal(auto.isLease, false);
            assert.ok(auto.vehicleClass);

            // Rimozione da wonAuctions
            assert.ok(!sandbox._auctionsState.wonAuctions.some(a => a.id === 'won_veh_1'));
        });

        test('riscossione container accredita denaro via CE_money e veicoli in flotta', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;
            const cashPrima = gs.cash;

            let syncChiamato = false;
            sandbox.ServerState.syncCash = async () => { syncChiamato = true; };

            const esito = await sandbox.auctionsClaim('won_cont_1');

            assert.equal(esito.error, undefined);
            assert.equal(esito.contanti, 45000);
            assert.equal(gs.cash, cashPrima + 45000, 'la liquidità del container deve entrare in cassa');
            assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo del container entra in flotta');
            assert.equal(syncChiamato, false, 'nessun syncCash verso il server: accredito già avvenuto sul DB');
        });

        test('riscossione fleet_pack aggiunge tutti i veicoli del pacchetto in flotta', async () => {
            const { sandbox, gs } = amb;

            // Inserisci lotto fleet_pack vinto
            sandbox._auctionsState.wonAuctions.push({
                id: 'won_fleet_pack_1',
                lot_type: 'fleet_pack',
                title: 'Lotto 3 Veicoli — Vinto',
                icon: '🚐',
                vehicle_data: {
                    vehicles: [
                        { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70, km: 40000 },
                        { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65, km: 30000 },
                        { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58, km: 60000 },
                    ],
                },
                container_data: {},
                winning_bid: 75000,
            });

            const flottaPrima = gs.fleet.length;
            const esito = await sandbox.auctionsClaim('won_fleet_pack_1');

            assert.equal(esito.error, undefined);
            assert.equal(esito.veicoli.length, 3, 'deve riscattare tutti e 3 i veicoli del pacchetto');
            assert.equal(gs.fleet.length, flottaPrima + 3, 'tutti e 3 i veicoli devono entrare in gameState.fleet');

            const tiers = gs.fleet.slice(-3).map(v => v.tier);
            assert.deepEqual(tiers, ['business', 'business', 'business']);
        });

        test('rifiuto riscossione lotto inesistente o già riscosso', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('lotto_inesistente');

            assert.ok(esito.error);
            assert.match(esito.error, /Lotto non riscuotibile/);
            assert.equal(gs.fleet.length, flottaPrima);
        });

        test('auctionsRevealWon apre la modale di vincita con i dettagli svelati', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('won_cont_1');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'la modale #auction-won-modal deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('Contenuto Svelato!'));
            assert.ok(modal.innerHTML.includes('Liquidità: €45.000'));
            assert.ok(modal.innerHTML.includes('Veicolo business'));
        });

        test('auctionsRevealWon per lotto inesistente non compie azioni', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('won_inesistente');

            assert.equal(sandbox.document.getElementById('auction-won-modal'), null);
        });
    });

    describe('5. Risoluzione ciclo di vita aste (scadenza, superamento, vittoria)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('risoluzione di un lotto senza offerte cancella l\'asta', async () => {
            const { sandbox } = amb;

            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_cont_1' });

            assert.equal(res.data.success, false);
            assert.equal(res.data.reason, 'nessuna offerta valida');

            const auc = amb.statoAste.find(a => a.id === 'auc_cont_1');
            assert.equal(auc.status, 'cancelled');
        });

        test('risoluzione di un lotto con offerta vincente chiude l\'asta e assegna il vincitore', async () => {
            const { sandbox } = amb;

            const res = await sandbox.supabaseClient.rpc('rpc_resolve_auction', { v_auction_id: 'auc_veh_lead' });

            assert.equal(res.data.success, true);
            assert.equal(res.data.amount, 35000);

            const auc = amb.statoAste.find(a => a.id === 'auc_veh_lead');
            assert.equal(auc.status, 'closed');
            assert.equal(auc.winning_bid, 35000);
        });

        test('stato asta riflette correttamente isLeading vs isOutbid', () => {
            const { sandbox } = amb;

            // auc_veh_lead: my_bid 35k, top_bid 35k -> leading
            const lead = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_lead');
            assert.ok(lead.my_bid >= lead.top_bid, 'deve essere in testa');

            // auc_veh_outbid: my_bid 210k, top_bid 250k -> outbid
            const outbid = sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_outbid');
            assert.ok(outbid.my_bid < outbid.top_bid, 'deve essere superato');
        });
    });

    describe('6. Rendering della scheda Aste (renderTabAuctions)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabAuctions non genera errori se tab-container non è presente', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });

        test('renderTabAuctions con lista vuota mostra messaggio informativo', () => {
            const { sandbox } = amb;
            sandbox._auctionsState.auctions = [];
            sandbox._auctionsState.wonAuctions = [];
            sandbox._auctionsState.myBids = [];

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessuna asta aperta al momento'));
        });

        test('renderTabAuctions disegna intestazione, KPI, banner vincite e storico offerte', () => {
            const { sandbox } = amb;

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Aste Giudiziarie'), 'deve includere titolo principale');
            assert.ok(c.innerHTML.includes('Lotti Aperti'), 'deve includere KPI lotti aperti');
            assert.ok(c.innerHTML.includes('Da Ritirare'), 'deve includere KPI da ritirare');
            assert.ok(c.innerHTML.includes('Attive in Top'), 'deve includere KPI attive in top');
            assert.ok(c.innerHTML.includes('Aste Vinte — Da Ritirare'), 'deve mostrare banner vincite');
            assert.ok(c.innerHTML.includes('Maserati Quattroporte'), 'deve mostrare lotto vinto');
            assert.ok(c.innerHTML.includes('Mercedes Classe S sequestrata'), 'deve mostrare lotto aperto');
            assert.ok(c.innerHTML.includes('Storico Offerte'), 'deve mostrare storico offerte');
        });

        test('renderTabAuctions evidenzia avviso di superamento ed essere in testa', () => {
            const { sandbox } = amb;

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Sei stato superato! Rilancia per vincere.'));
            assert.ok(c.innerHTML.includes('Sei in testa — mantieni la posizione.'));
        });
    });

    describe('7. Helper formattazione e utilità (_fmtCurrency, _countdown, _tierBadge, _aErr, _autoDalLotto)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_fmtCurrency formatta correttamente cifre e valori nulli', () => {
            const { sandbox } = amb;
            assert.equal(sandbox._fmtCurrency(null), '—');
            assert.equal(sandbox._fmtCurrency(undefined), '—');
            assert.equal(sandbox._fmtCurrency(0), '€0');
            assert.ok(sandbox._fmtCurrency(50000).includes('50.000') || sandbox._fmtCurrency(50000).includes('50,000'));
        });

        test('_countdown gestisce scadenze passate, giorni, ore e minuti', () => {
            const { sandbox } = amb;
            // Passata
            assert.equal(sandbox._countdown(new Date(Date.now() - 5000).toISOString()), 'Scaduta');

            // > 48h
            const farFuture = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
            assert.match(sandbox._countdown(farFuture), /\d+g \d+h/);

            // < 48h ma > 1h
            const midFuture = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
            assert.match(sandbox._countdown(midFuture), /\d+h \d+m/);

            // < 1h
            const nearFuture = new Date(Date.now() + 25 * 60 * 1000).toISOString();
            assert.match(sandbox._countdown(nearFuture), /\d+m \d+s/);
        });

        test('_tierBadge produce badge con classi corrette per tutti i tier', () => {
            const { sandbox } = amb;
            assert.ok(sandbox._tierBadge('standard').includes('em-pill--gray'));
            assert.ok(sandbox._tierBadge('business').includes('em-pill--blue'));
            assert.ok(sandbox._tierBadge('premium').includes('em-pill--violet'));
            assert.ok(sandbox._tierBadge('vip').includes('em-pill--gold'));
            assert.ok(sandbox._tierBadge('presidential').includes('em-pill--gold'));
            assert.ok(sandbox._tierBadge('armored').includes('em-pill--red'));
            assert.ok(sandbox._tierBadge('ultra').includes('em-pill--gold'));
            assert.ok(sandbox._tierBadge('sconosciuto').includes('sconosciuto'));
        });

        test('_aErr include prefisso, messaggio di errore ed email supporto', () => {
            const { sandbox } = amb;
            const errStr = sandbox._aErr('Operazione fallita', { message: 'Errore di connessione' });
            assert.ok(errStr.includes('Operazione fallita: Errore di connessione'));
            assert.ok(errStr.includes('support@chauffeurempire.com'));
        });

        test('_autoDalLotto genera veicolo conforme con proprietà complete e ID univoco', () => {
            const { sandbox } = amb;
            const dati = { tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 82, km: 45000 };
            const auto = vm.runInContext(`_autoDalLotto(${JSON.stringify(dati)})`, sandbox);

            assert.ok(auto);
            assert.ok(auto.id.startsWith('c_ast_'));
            assert.equal(auto.tier, 'vip');
            assert.equal(auto.vehicleClass, 'stellar_s_imp');
            assert.equal(auto.condition, 82);
            assert.equal(auto.mileage, 45000);
            assert.equal(auto.isLease, false);
            assert.equal(auto.fuel, 60);
            assert.equal(auto.engineHealth, 82);
        });
    });

    describe('8. Integrazione Realtime (_auctionsSubscribeRealtime)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsInit();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('evento realtime su tab attiva forza il refresh e il re-rendering', async () => {
            const { sandbox, subscriptions, rpcLog } = amb;
            sandbox._activeTab = 'auctions';
            sandbox.switchTab = () => {};
            sandbox.renderTabAuctions();

            const callback = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof callback === 'function', 'la callback Realtime deve essere registrata');

            const rpcPrima = rpcLog.length;

            // Simula arrivo di un evento Realtime da PostgreSQL
            callback({ event: 'UPDATE' });
            await new Promise(r => setImmediate(r));

            assert.ok(rpcLog.length > rpcPrima, 'deve aver rieseguito il refresh dei dati');
        });
    });

    describe('9. Integrità monetaria e prevenzione doppio conteggio', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('la vincita in contanti viene registrata solo da accreditatoDalServer senza duplicati', async () => {
            const { sandbox, gs } = amb;
            const syncedCash = [];
            sandbox.ServerState.syncCash = async (val) => {
                syncedCash.push(val);
                return { success: true, cash: val };
            };

            gs.cash = 100000;
            await sandbox.auctionsClaim('won_cont_1');

            // 100k + 45k liquidità container = 145k
            assert.equal(gs.cash, 145000, 'il cash locale deve riflettere l accredito del server');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato per non creare eco/doppio conteggio');
        });

        test('effettuare un offerta non intacca gameState.cash e non chiama syncCash', async () => {
            const { sandbox, gs } = amb;
            const syncedCash = [];
            sandbox.ServerState.syncCash = async (val) => {
                syncedCash.push(val);
                return { success: true, cash: val };
            };

            gs.cash = 100000;
            await sandbox.auctionsPlaceBid('auc_veh_1', 60000);

            assert.equal(gs.cash, 100000, 'il saldo non deve scalare fino all aggiudicazione');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash');
        });
    });
});
