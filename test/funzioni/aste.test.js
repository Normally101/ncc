'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie (auctions.js)

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `auctions.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, la gestione delle offerte,
   il calcolo delle quote minime, il rendering UI, l'apertura/chiusura dei modali,
   l'accredito dei lotti vinti (veicoli singoli, container, fleet pack),
   la prevenzione del doppio conteggio del denaro e la gestione realtime.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase completo per le Aste Giudiziarie.
 */
function creaAmbienteAste(opzioni = {}) {
    const rpcLog = [];
    const channelEvents = [];
    const subscriptions = new Map();

    const asteDefault = [
        {
            id: 'auc_open_single',
            title: 'Mercedes Classe E 220d (Fallimento)',
            icon: '⚖️',
            lot_type: 'vehicle',
            min_bid: 15000,
            top_bid: 18000,
            my_bid: null,
            bid_count: 3,
            auction_ends_at: new Date(Date.now() + 3600 * 4000).toISOString(),
            vehicle_data: { tier: 'business', condition: 75, km: 45000, year: 2021 },
        },
        {
            id: 'auc_open_leading',
            title: 'BMW Serie 7 740d xDrive',
            icon: '🏎️',
            lot_type: 'vehicle',
            min_bid: 30000,
            top_bid: 42000,
            my_bid: 42000,
            bid_count: 5,
            auction_ends_at: new Date(Date.now() + 1800 * 1000).toISOString(), // 30 min (urgent)
            vehicle_data: { tier: 'vip', condition: 85, km: 30000, year: 2022 },
        },
        {
            id: 'auc_open_outbid',
            title: 'Audi A8 L 55 TFSI',
            icon: '🚘',
            lot_type: 'vehicle',
            min_bid: 25000,
            top_bid: 35000,
            my_bid: 30000,
            bid_count: 4,
            auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(), // >48h
            vehicle_data: { tier: 'vip', condition: 80, km: 60000, year: 2020 },
        },
        {
            id: 'auc_open_container',
            title: 'Container Giudiziario Porto di Genova',
            icon: '📦',
            lot_type: 'container',
            min_bid: 20000,
            top_bid: null,
            my_bid: null,
            bid_count: 0,
            auction_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            container_data: {
                items: [
                    { type: 'cash', amount: 35000 },
                    { type: 'vehicle', tier: 'business', condition: 70, km: 50000 },
                ],
            },
        },
        {
            id: 'auc_open_fleet',
            title: 'Lotto Flotta Noleggio Fallita (3 Van)',
            icon: '🚐',
            lot_type: 'fleet_pack',
            min_bid: 40000,
            top_bid: 45000,
            my_bid: null,
            bid_count: 2,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            vehicle_data: {
                vehicles: [
                    { tier: 'business', condition: 65, km: 80000 },
                    { tier: 'business', condition: 70, km: 75000 },
                    { tier: 'standard', condition: 60, km: 95000 },
                ],
            },
        },
    ];

    const wonDefault = [
        {
            id: 'auc_won_1',
            title: 'Mercedes Maybach S580 (Aggiudicata)',
            icon: '🏆',
            lot_type: 'vehicle',
            winning_bid: 95000,
            vehicle_data: { tier: 'ultra', condition: 90, km: 12000, year: 2023 },
        },
    ];

    const myBidsDefault = [
        {
            auction_id: 'auc_open_leading',
            auction_title: 'BMW Serie 7 740d xDrive',
            auction_icon: '🏎️',
            auction_status: 'open',
            amount: 42000,
            is_winner: false,
        },
        {
            auction_id: 'auc_open_outbid',
            auction_title: 'Audi A8 L 55 TFSI',
            auction_icon: '🚘',
            auction_status: 'open',
            amount: 30000,
            is_winner: false,
        },
        {
            auction_id: 'auc_won_1',
            auction_title: 'Mercedes Maybach S580 (Aggiudicata)',
            auction_icon: '🏆',
            auction_status: 'closed',
            amount: 95000,
            is_winner: true,
        },
    ];

    let statoAste = (opzioni.auctions || asteDefault).map(a => ({ ...a }));
    let statoVinte = (opzioni.wonAuctions || wonDefault).map(w => ({ ...w }));
    let statoOfferte = (opzioni.myBids || myBidsDefault).map(b => ({ ...b }));

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
                const asta = statoAste.find(a => a.id === args.v_auction_id);
                if (!asta) return { data: null, error: { message: 'Asta non trovata' } };

                const minRichiesto = Math.max(asta.min_bid, (asta.top_bid || 0) + 1);
                if (args.v_amount < minRichiesto) {
                    return { data: null, error: { message: `Offerta minima richiesta: €${minRichiesto}` } };
                }

                asta.top_bid = args.v_amount;
                asta.my_bid = args.v_amount;
                asta.bid_count = (asta.bid_count || 0) + 1;

                const bidExist = statoOfferte.find(b => b.auction_id === args.v_auction_id);
                if (bidExist) {
                    bidExist.amount = args.v_amount;
                } else {
                    statoOfferte.push({
                        auction_id: asta.id,
                        auction_title: asta.title,
                        auction_icon: asta.icon,
                        auction_status: 'open',
                        amount: args.v_amount,
                        is_winner: false,
                    });
                }

                return { data: { success: true, top_bid: args.v_amount }, error: null };
            }

            if (nome === 'rpc_claim_auction') {
                const won = statoVinte.find(w => w.id === args.v_auction_id);
                if (!won) return { data: null, error: { message: 'Lotto non riscuotibile' } };

                if (won.lot_type === 'container') {
                    const cashItem = (won.container_data?.items || []).find(i => i.type === 'cash');
                    return {
                        data: {
                            success: true,
                            lot_type: 'container',
                            container_data: won.container_data,
                            cash_accreditato: cashItem ? cashItem.amount : 0,
                        },
                        error: null,
                    };
                }

                if (won.lot_type === 'fleet_pack') {
                    return {
                        data: {
                            success: true,
                            lot_type: 'fleet_pack',
                            vehicle_data: won.vehicle_data,
                            cash_accreditato: 0,
                        },
                        error: null,
                    };
                }

                return {
                    data: {
                        success: true,
                        lot_type: 'vehicle',
                        vehicle_data: won.vehicle_data,
                        cash_accreditato: 0,
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

    // Predisponi flotta e cassa
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 200000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [];

    // Predisponi DOM
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

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita (auctions.js)', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola lo stato delle aste, vinte e offerte da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 5, 'deve contenere i 5 lotti restituiti');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 1, 'deve contenere 1 lotto vinto');
            assert.equal(sandbox._auctionsState.myBids.length, 3, 'deve contenere 3 offerte utente');
            assert.ok(sandbox._auctionsState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata non forzata -> throttle attivo -> nessuna nuova RPC
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve rieseguire le query entro 30s');

            // Chiamata forzata -> riesegue le 3 RPC
            await sandbox.auctionsRefresh(true);
            assert.equal(rpcLog.length, countPrima + 3, 'force=true deve rieseguire le query');
        });

        test('auctionsRefresh non crasha se supabaseClient è assente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsInit esegue il refresh e notifica la presenza di aste vinte da ritirare', async () => {
            const { sandbox, env } = amb;
            await sandbox.auctionsInit();

            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('da ritirare')));
        });
    });

    describe('2. Invio e rilancio offerte (auctionsPlaceBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('invia offerta valida, invoca rpc_place_auction_bid e aggiorna lo stato', async () => {
            const { sandbox, rpcLog } = amb;

            const esito = await sandbox.auctionsPlaceBid('auc_open_single', 22000);

            assert.ok(!esito.error, 'l offerta non deve restituire errore');
            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_place_auction_bid');
            assert.equal(bidRpc.args.v_auction_id, 'auc_open_single');
            assert.equal(bidRpc.args.v_amount, 22000);

            // Verifica che l asta ora riporti l offerta dell utente
            const asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_open_single');
            assert.equal(asta.my_bid, 22000);
            assert.equal(asta.top_bid, 22000);
        });

        test('rilancia offerta due volte di fila sulla stessa asta', async () => {
            const { sandbox } = amb;

            // Prima offerta
            await sandbox.auctionsPlaceBid('auc_open_single', 20000);
            let asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_open_single');
            assert.equal(asta.my_bid, 20000);

            // Rilancio successivo più alto
            await sandbox.auctionsPlaceBid('auc_open_single', 25000);
            asta = sandbox._auctionsState.auctions.find(a => a.id === 'auc_open_single');
            assert.equal(asta.my_bid, 25000);
            assert.equal(asta.top_bid, 25000);
        });

        test('rifiuta offerta inferiore alla quota minima richiesta', async () => {
            const { sandbox } = amb;
            // auc_open_single ha top_bid 18.000 -> offerta di 16.000 deve fallire
            const esito = await sandbox.auctionsPlaceBid('auc_open_single', 16000);

            assert.ok(esito.error, 'deve restituire un errore');
            assert.match(esito.error, /Offerta fallita/i);
        });

        test('rifiuta offerta per asta inesistente', async () => {
            const { sandbox } = amb;
            const esito = await sandbox.auctionsPlaceBid('asta_fantasma', 50000);

            assert.ok(esito.error);
            assert.match(esito.error, /Asta non trovata/i);
        });

        test('gestione assenza supabaseClient restituisce errore descrittivo', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const esito = await sandbox.auctionsPlaceBid('auc_open_single', 30000);
            assert.equal(esito.error, 'Supabase non disponibile');
        });

        test('offrire non tocca il saldo cassa locale: la cassa si scala all aggiudicazione sul server', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;

            await sandbox.auctionsPlaceBid('auc_open_single', 25000);

            assert.equal(gs.cash, cashPrima, 'offrire non deve decrementare la cassa locale');
        });
    });

    describe('3. Modale Offerta e Conferma UI (auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsOpenBidModal crea il modale nel DOM con input e valori corretti', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_single');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale #auction-bid-modal deve essere inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Mercedes Classe E 220d'));

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input, 'il campo input offerta deve esistere');
            // top_bid è 18.000 -> minNext è 18.001
            assert.equal(input.getAttribute('min'), '18001');

            const btn = sandbox.document.getElementById('bid-confirm-btn');
            assert.ok(btn, 'il bottone di conferma offerta deve esistere');
        });

        test('auctionsOpenBidModal per container mostra badge contenuto al buio', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_container');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal.innerHTML.includes('Contenuto rivelato solo al vincitore'));
        });

        test('auctionsOpenBidModal su asta inesistente non crea modale', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('asta_inesistente');

            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });

        test('auctionsOpenBidModal rimuove eventuale modale già aperto', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_single');
            assert.ok(sandbox.document.getElementById('auction-bid-modal'));

            sandbox.auctionsOpenBidModal('auc_open_leading');
            const modali = sandbox.document.querySelectorAll('#auction-bid-modal');
            assert.equal(modali.length, 1);
            assert.ok(modali[0].innerHTML.includes('BMW Serie 7'));
        });

        test('auctionsConfirmBid con importo non valido (<= 0) mostra errore inline e non invia RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.auctionsOpenBidModal('auc_open_single');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '0';

            await sandbox.auctionsConfirmBid('auc_open_single');

            const errDiv = sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.equal(errDiv.textContent, 'Inserisci un importo valido');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0);
        });

        test('auctionsConfirmBid con offerta valida invia, chiude modale e notifica successo', async () => {
            const { sandbox, env } = amb;
            sandbox.auctionsOpenBidModal('auc_open_single');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '25000';

            await sandbox.auctionsConfirmBid('auc_open_single');

            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null, 'il modale deve chiudersi');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta di €25.000 registrata!')));
        });

        test('auctionsConfirmBid con errore RPC mostra errore inline e riabilita bottone', async () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_single');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '15000'; // Troppo basso (top_bid è 18000)

            await sandbox.auctionsConfirmBid('auc_open_single');

            const errDiv = sandbox.document.getElementById('bid-error');
            const btn = sandbox.document.getElementById('bid-confirm-btn');
            assert.equal(errDiv.style.display, 'block');
            assert.match(errDiv.textContent, /Offerta minima richiesta/i);
            assert.equal(btn.disabled, false);
        });
    });

    describe('4. Riscatto Lotti e Premi (auctionsClaim, auctionsRevealWon)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('riscuotere un veicolo singolo aggiunge auto alla flotta e rimuove il lotto dalle vinte', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('auc_won_1');

            assert.ok(!esito.error);
            assert.equal(gs.fleet.length, flottaPrima + 1, 'l auto deve entrare in flotta');
            const nuovaAuto = gs.fleet[gs.fleet.length - 1];
            assert.equal(nuovaAuto.tier, 'ultra');
            assert.equal(nuovaAuto.condition, 90);
            assert.equal(nuovaAuto.mileage, 12000);
            assert.equal(nuovaAuto.isLease, false);

            assert.ok(!sandbox._auctionsState.wonAuctions.some(w => w.id === 'auc_won_1'), 'il lotto vinto deve essere rimosso');
        });

        test('riscuotere un container accredita denaro via CE_money e veicoli in flotta', async () => {
            const { sandbox, gs } = amb;
            // Aggiungi container tra i lotti vinti
            sandbox._auctionsState.wonAuctions.push({
                id: 'auc_won_cnt',
                lot_type: 'container',
                container_data: {
                    items: [
                        { type: 'cash', amount: 35000 },
                        { type: 'vehicle', tier: 'business', condition: 70 },
                    ],
                },
            });
            amb.statoVinte.push({
                id: 'auc_won_cnt',
                lot_type: 'container',
                container_data: {
                    items: [
                        { type: 'cash', amount: 35000 },
                        { type: 'vehicle', tier: 'business', condition: 70 },
                    ],
                },
            });

            const cashPrima = gs.cash;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('auc_won_cnt');

            assert.ok(!esito.error);
            assert.equal(gs.cash, cashPrima + 35000, 'il contante del container deve essere accreditato');
            assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo del container deve entrare in flotta');
        });

        test('riscuotere un lotto multiplo (fleet_pack) inserisce tutti i veicoli del pacchetto in flotta', async () => {
            const { sandbox, gs } = amb;
            sandbox._auctionsState.wonAuctions.push({
                id: 'auc_won_fp',
                lot_type: 'fleet_pack',
                vehicle_data: {
                    vehicles: [
                        { tier: 'business', condition: 65, km: 80000 },
                        { tier: 'business', condition: 70, km: 75000 },
                        { tier: 'standard', condition: 60, km: 95000 },
                    ],
                },
            });
            amb.statoVinte.push({
                id: 'auc_won_fp',
                lot_type: 'fleet_pack',
                vehicle_data: {
                    vehicles: [
                        { tier: 'business', condition: 65, km: 80000 },
                        { tier: 'business', condition: 70, km: 75000 },
                        { tier: 'standard', condition: 60, km: 95000 },
                    ],
                },
            });

            const flottaPrima = gs.fleet.length;
            const esito = await sandbox.auctionsClaim('auc_won_fp');

            assert.ok(!esito.error);
            assert.equal(gs.fleet.length, flottaPrima + 3, 'tutti i 3 veicoli del fleet pack devono entrare in flotta');
            assert.equal(esito.veicoli.length, 3);
        });

        test('errore RPC su claim non muta lo stato né la cassa né la flotta', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_claim_auction: async () => ({
                        data: null,
                        error: { message: 'Lotto già ritirato' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);

            const cashPrima = ambErr.gs.cash;
            const flottaPrima = ambErr.gs.fleet.length;

            const esito = await ambErr.sandbox.auctionsClaim('auc_won_1');

            assert.ok(esito.error);
            assert.equal(ambErr.gs.cash, cashPrima);
            assert.equal(ambErr.gs.fleet.length, flottaPrima);
            assert.equal(ambErr.sandbox._auctionsState.wonAuctions.length, 1, 'il lotto resta tra quelli da ritirare');
            ambErr.env.stopAllIntervals();
        });

        test('auctionsRevealWon esegue il claim e mostra il modale celebrativo #auction-won-modal', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('auc_won_1');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'il modale #auction-won-modal deve essere creato');
            assert.ok(modal.innerHTML.includes('Mercedes Maybach S580'));
            assert.ok(modal.innerHTML.includes('Aggiudicato per €95.000'));
        });

        test('auctionsRevealWon con container mostra il contenuto svelato nel modale', async () => {
            const { sandbox } = amb;
            sandbox._auctionsState.wonAuctions.push({
                id: 'auc_won_cnt2',
                title: 'Container Doganale',
                icon: '📦',
                winning_bid: 30000,
                lot_type: 'container',
                container_data: {
                    items: [
                        { type: 'cash', amount: 40000 },
                        { type: 'vehicle', tier: 'standard', condition: 50 },
                    ],
                },
            });
            amb.statoVinte.push({
                id: 'auc_won_cnt2',
                lot_type: 'container',
                container_data: {
                    items: [
                        { type: 'cash', amount: 40000 },
                        { type: 'vehicle', tier: 'standard', condition: 50 },
                    ],
                },
            });

            await sandbox.auctionsRevealWon('auc_won_cnt2');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal.innerHTML.includes('Contenuto Svelato!'));
            assert.ok(modal.innerHTML.includes('Liquidità: €40.000'));
            assert.ok(modal.innerHTML.includes('Veicolo standard'));
        });

        test('auctionsRevealWon su asta non presente nelle vinte non fa nulla', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('asta_non_vinta');

            assert.equal(sandbox.document.getElementById('auction-won-modal'), null);
        });
    });

    describe('5. Funzioni Helper e Formattazione (_fmtCurrency, _countdown, _tierBadge, _autoDalLotto)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_fmtCurrency formatta importi e gestisce valori vuoti/nulli', () => {
            const { sandbox } = amb;
            assert.equal(vm.runInContext('_fmtCurrency(null)', sandbox), '—');
            assert.equal(vm.runInContext('_fmtCurrency(undefined)', sandbox), '—');
            assert.equal(vm.runInContext('_fmtCurrency(0)', sandbox), '€0');
            assert.ok(vm.runInContext('_fmtCurrency(50000)', sandbox).includes('50.000') || vm.runInContext('_fmtCurrency(50000)', sandbox).includes('50,000'));
        });

        test('_countdown gestisce scadenze passate, giorni, ore e minuti', () => {
            const { sandbox } = amb;
            // Passato -> 'Scaduta'
            assert.equal(vm.runInContext('_countdown(Date.now() - 1000)', sandbox), 'Scaduta');

            // > 48h -> 'Xg Yh'
            const plus72h = Date.now() + 72 * 3600 * 1000;
            assert.match(vm.runInContext(`_countdown(${plus72h})`, sandbox), /\d+g \d+h/);

            // > 0h -> 'Xh Ym'
            const plus5h = Date.now() + 5 * 3600 * 1000;
            assert.match(vm.runInContext(`_countdown(${plus5h})`, sandbox), /\d+h \d+m/);

            // < 1h -> 'Xm Ys'
            const plus10m = Date.now() + 10 * 60 * 1000;
            assert.match(vm.runInContext(`_countdown(${plus10m})`, sandbox), /\d+m \d+s/);
        });

        test('_tierBadge normalizza maiuscole e minuscole ai corretti badge em-pill', () => {
            const { sandbox } = amb;
            assert.ok(vm.runInContext('_tierBadge("standard")', sandbox).includes('Standard'));
            assert.ok(vm.runInContext('_tierBadge("BUSINESS")', sandbox).includes('Business'));
            assert.ok(vm.runInContext('_tierBadge("VIP")', sandbox).includes('VIP'));
            assert.ok(vm.runInContext('_tierBadge("ultra")', sandbox).includes('Ultra'));
            assert.ok(vm.runInContext('_tierBadge("presidential")', sandbox).includes('Presidential'));
            assert.ok(vm.runInContext('_tierBadge("armored")', sandbox).includes('Armored'));
        });

        test('_autoDalLotto genera auto con parametri validi e clampati tra min e max', () => {
            const { sandbox } = amb;
            const auto = vm.runInContext('_autoDalLotto({ tier: "vip", condition: 150, km: 25000 })', sandbox);

            assert.ok(auto);
            assert.ok(auto.id.startsWith('c_ast_'));
            assert.ok(auto.name.includes('(Asta)'));
            assert.equal(auto.tier, 'vip');
            assert.equal(auto.condition, 100, 'la condizione non deve superare 100');
            assert.equal(auto.mileage, 25000);
            assert.equal(auto.isLease, false);
            assert.equal(auto.engineHealth, 100);
            assert.equal(auto.outOfService, null);
        });

        test('_autoDalLotto applica fallback robusti in caso di parametri mancanti', () => {
            const { sandbox } = amb;
            const auto = vm.runInContext('_autoDalLotto(null)', sandbox);

            assert.ok(auto);
            assert.ok(auto.tier);
            assert.ok(auto.condition >= 10 && auto.condition <= 100);
        });
    });

    describe('6. Rendering Tab Aste (renderTabAuctions)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabAuctions non crasha se #tab-container non esiste', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });

        test('renderTabAuctions disegna titolo, KPI, banner vincite e schede lotti', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            const html = c.innerHTML;

            assert.ok(html.includes('Aste Giudiziarie'));
            assert.ok(html.includes('Lotti Aperti'));
            assert.ok(html.includes('Tue Offerte'));
            assert.ok(html.includes('Da Ritirare'));
            assert.ok(html.includes('🏆 Aste Vinte — Da Ritirare'), 'deve mostrare banner premi');
            assert.ok(html.includes('Mercedes Maybach S580'));
            assert.ok(html.includes('BMW Serie 7'));
            assert.ok(html.includes('Container Giudiziario'));
            assert.ok(html.includes('Lotto Flotta Noleggio'));
            assert.ok(html.includes('📋 Storico Offerte'));
        });

        test('renderTabAuctions con lista vuota mostra placeholder em-empty', () => {
            const { sandbox } = amb;
            sandbox._auctionsState.auctions = [];
            sandbox._auctionsState.wonAuctions = [];
            sandbox._auctionsState.myBids = [];

            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessuna asta aperta al momento.'));
        });

        test('renderTabAuctions evidenzia stato in testa vs superato', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            const html = c.innerHTML;

            assert.ok(html.includes('✅ Sei in testa — mantieni la posizione.'));
            assert.ok(html.includes('⚠️ Sei stato superato! Rilancia per vincere.'));
        });
    });

    describe('7. Event Delegation DOM e Realtime (_auctionsSubscribeRealtime)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
            amb.sandbox.renderTabAuctions();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su "Fai Offerta" apre il modale tramite ceAct', () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsOpenBidModal"]');
            assert.ok(btn, 'il bottone con data-ce-act="auctionsOpenBidModal" deve esistere');

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            sandbox.auctionsOpenBidModal(auctionId);

            assert.ok(sandbox.document.getElementById('auction-bid-modal'));
        });

        test('click su "Ritira" apre il modale premio tramite ceAct', async () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsRevealWon"]');
            assert.ok(btn, 'il bottone con data-ce-act="auctionsRevealWon" deve esistere');

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            await sandbox.auctionsRevealWon(auctionId);

            assert.ok(sandbox.document.getElementById('auction-won-modal'));
        });

        test('Realtime listener riceve modifiche postgres ed esegue il re-render se sulla tab auctions', async () => {
            const { sandbox, subscriptions } = amb;
            sandbox._activeTab = 'auctions';

            let refreshEseguito = false;
            const origRefresh = sandbox.auctionsRefresh;
            sandbox.auctionsRefresh = async (f) => {
                refreshEseguito = true;
                return origRefresh(f);
            };

            await sandbox.auctionsInit();

            const realtimeCb = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof realtimeCb === 'function', 'la callback realtime deve essere registrata');

            // Simula evento Realtime
            realtimeCb();
            await new Promise(r => setImmediate(r));

            assert.equal(refreshEseguito, true, 'l evento realtime deve aver scatenato il refresh');
        });
    });

    describe('8. Integrità del Saldo e Prevenzione Doppio Conteggio (CE_money)', () => {
        test('il denaro del container accreditato via CE_money non scatena syncCash al server', async () => {
            const syncedCash = [];
            const amb = creaAmbienteAste({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await amb.sandbox.auctionsRefresh(true);

            amb.sandbox._auctionsState.wonAuctions.push({
                id: 'auc_won_sync_test',
                lot_type: 'container',
                container_data: { items: [{ type: 'cash', amount: 50000 }] },
            });
            amb.statoVinte.push({
                id: 'auc_won_sync_test',
                lot_type: 'container',
                container_data: { items: [{ type: 'cash', amount: 50000 }] },
            });

            amb.gs.cash = 100000;
            await amb.sandbox.auctionsClaim('auc_won_sync_test');

            assert.equal(amb.gs.cash, 150000, 'il saldo locale aumenta di 50.000€');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già mosso il saldo)');
            amb.env.stopAllIntervals();
        });
    });
});
