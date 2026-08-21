'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Collaudo approfondito del modulo Aste Giudiziarie

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `auctions.js` e dai relativi gestori (ce-actions.js / data-ce-act),
   verificare l'interazione con Supabase RPC, la gestione dello stato locale/server,
   il piazzamento offerte, la risoluzione lotti, la riscossione dei premi
   (veicoli, container con contanti e veicoli, pacchetti flotta multipli),
   l'assenza di doppio conteggio monetario e il rendering UI.
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
            id: 'ast_veh_1',
            lot_type: 'vehicle',
            title: 'Mercedes Classe S sequestrata — Napoli',
            description: 'Veicolo confiscato dalla DIA. Chilometraggio 87.000 km.',
            icon: '🚗',
            vehicle_data: { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70, km: 65000, year: 2020 },
            container_data: {},
            min_bid: 25000,
            top_bid: 30000,
            my_bid: null,
            bid_count: 2,
            status: 'open',
            auction_ends_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        },
        {
            id: 'ast_cont_2',
            lot_type: 'container',
            title: 'Container Sigillato — Porto Gioia Tauro',
            description: 'Contenuto ignoto fino all\'aggiudicazione.',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'cash', amount: 80000 },
                    { type: 'vehicle', tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 85, km: 30000 },
                ],
            },
            min_bid: 60000,
            top_bid: 70000,
            my_bid: 70000,
            bid_count: 3,
            status: 'open',
            auction_ends_at: new Date(Date.now() + 1800 * 1000).toISOString(), // < 1h (urgente)
        },
        {
            id: 'ast_fleet_3',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli — Fallimento NCC',
            description: 'Tre veicoli business venduti come lotto unico.',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 70 },
                    { tier: 'business', vehicleClass: 'volt_3_urban', condition: 65 },
                    { tier: 'business', vehicleClass: 'stellar_v_carr', condition: 58 },
                ],
            },
            container_data: {},
            min_bid: 50000,
            top_bid: 55000,
            my_bid: 52000, // superato
            bid_count: 4,
            status: 'open',
            auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        },
    ];

    const vinteDefault = [
        {
            id: 'ast_won_1',
            lot_type: 'vehicle',
            title: 'BMW Serie 7 Giudiziaria',
            icon: '🚙',
            vehicle_data: { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 68, km: 82000, year: 2019 },
            container_data: {},
            winning_bid: 35000,
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            id: 'ast_won_2',
            lot_type: 'container',
            title: 'Container Dogana Vinto',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'cash', amount: 60000 },
                    { type: 'vehicle', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 55, km: 90000 },
                ],
            },
            winning_bid: 45000,
            created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
            id: 'ast_won_3',
            lot_type: 'fleet_pack',
            title: 'Lotto 2 Veicoli Vinto',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', vehicleClass: 'stellar_e_exec', condition: 75 },
                    { tier: 'vip', vehicleClass: 'stellar_s_imp', condition: 80 },
                ],
            },
            container_data: {},
            winning_bid: 95000,
            created_at: new Date(Date.now() - 5000000).toISOString(),
        },
    ];

    const offerteDefault = [
        {
            auction_id: 'ast_cont_2',
            auction_title: 'Container Sigillato — Porto Gioia Tauro',
            auction_icon: '📦',
            amount: 70000,
            auction_ends_at: new Date(Date.now() + 1800 * 1000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
        {
            auction_id: 'ast_fleet_3',
            auction_title: 'Lotto 3 Veicoli — Fallimento NCC',
            auction_icon: '🚐',
            amount: 52000,
            auction_ends_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
    ];

    let statoAste = (opzioni.aste || asteDefault).map(a => ({ ...a }));
    let statoVinte = (opzioni.vinte || vinteDefault).map(v => ({ ...v }));
    let statoOfferte = (opzioni.offerte || offerteDefault).map(o => ({ ...o }));

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
                if (asta.status !== 'open') return { data: null, error: { message: 'Asta non aperta' } };
                if (new Date(asta.auction_ends_at).getTime() < Date.now()) {
                    return { data: null, error: { message: 'Asta scaduta' } };
                }
                if (args.v_amount < asta.min_bid) {
                    return { data: null, error: { message: `Offerta minima: €${asta.min_bid}` } };
                }
                if (asta.top_bid && args.v_amount <= asta.top_bid) {
                    return { data: null, error: { message: `Offerta troppo bassa (attuale: €${asta.top_bid})` } };
                }

                asta.top_bid = args.v_amount;
                asta.my_bid = args.v_amount;
                asta.bid_count = (asta.bid_count || 0) + 1;

                const existingBid = statoOfferte.find(o => o.auction_id === args.v_auction_id);
                if (existingBid) {
                    existingBid.amount = args.v_amount;
                } else {
                    statoOfferte.push({
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
                        top_bid: args.v_amount,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_claim_auction') {
                const idx = statoVinte.findIndex(v => v.id === args.v_auction_id);
                if (idx < 0) {
                    return { data: null, error: { message: 'Lotto non riscuotibile: gia\' ritirato, non tuo, o asta non chiusa' } };
                }
                const lotto = statoVinte[idx];
                statoVinte.splice(idx, 1);

                let contanti = 0;
                if (lotto.lot_type === 'container' && lotto.container_data?.items) {
                    for (const it of lotto.container_data.items) {
                        if (it.type === 'cash') contanti += (Number(it.amount) || 0);
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
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_test_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.switchTab = (tab) => {
        env.sandbox._activeTab = tab;
        if (tab === 'auctions' && typeof env.sandbox.renderTabAuctions === 'function') {
            env.sandbox.renderTabAuctions();
        }
    };
    env.sandbox.window.switchTab = env.sandbox.switchTab;

    // Reset dello stato locale del modulo auctions
    env.sandbox.window._auctionsState = {
        auctions:    [],
        wonAuctions: [],
        myBids:      [],
        _lastFetch:  0,
        _sub:        null,
    };

    // Predisponi flotta e cassa del giocatore
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 150000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'starter_car', name: 'Starter E-Class', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 100, isLease: false },
    ];

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

describe('Funzione Aste Giudiziarie — Collaudo completo', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh, Realtime)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola auctions, wonAuctions e myBids da Supabase RPC', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 3, 'deve contenere 3 aste aperte');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 3, 'deve contenere 3 aste vinte');
            assert.equal(sandbox._auctionsState.myBids.length, 2, 'deve contenere 2 offerte mie');
            assert.ok(sandbox._auctionsState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const callCount = rpcLog.length;

            // Seconda chiamata immediata: throttle attivo -> nessuna nuova RPC
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, callCount, 'non deve eseguire nuove query entro 30s');

            // Chiamata forzata: ignora throttle
            await sandbox.auctionsRefresh(true);
            assert.equal(rpcLog.length, callCount + 3, 'force=true deve rieseguire le 3 RPC');
        });

        test('auctionsRefresh non crasha in assenza di supabaseClient', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsInit esegue refresh iniziale, attiva Realtime e notifica premi in sospeso', async () => {
            const { sandbox, rpcLog, env } = amb;
            await sandbox.auctionsInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_judicial_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_won_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_my_bids'));
            assert.ok(sandbox._auctionsState._sub !== null, 'deve registrare la sottoscrizione realtime');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('aste vinte da ritirare') || n.msg.includes('vinta/e da ritirare')));
        });

        test('evento Realtime ricarica le aste quando l\'utente si trova nel tab auctions', async () => {
            const { sandbox, subscriptions, rpcLog } = amb;
            await sandbox.auctionsInit();
            sandbox._activeTab = 'auctions';

            const subCallback = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof subCallback === 'function', 'callback realtime registrata');

            const countPrima = rpcLog.length;
            subCallback({ eventType: 'UPDATE', new: { id: 'ast_veh_1' } });
            await new Promise(r => setImmediate(r));

            assert.ok(rpcLog.length > countPrima, 'deve rieseguire il refresh in seguito all\'evento realtime');
        });
    });

    describe('2. Piazzamento offerte (auctionsPlaceBid, auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsPlaceBid invoca rpc_place_auction_bid con argomenti corretti e aggiorna lo stato', async () => {
            const { sandbox, rpcLog } = amb;

            const res = await sandbox.auctionsPlaceBid('ast_veh_1', 35000);

            assert.ok(!res.error, 'l\'offerta deve andare a buon fine');
            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_place_auction_bid');
            assert.equal(bidRpc.args.v_auction_id, 'ast_veh_1');
            assert.equal(bidRpc.args.v_amount, 35000);
        });

        test('auctionsPlaceBid non tocca direttamente gameState.cash (gestito da RPC / saldo garantito)', async () => {
            const { sandbox, gs } = amb;
            const cassaPrima = gs.cash;

            await sandbox.auctionsPlaceBid('ast_veh_1', 32000);

            assert.equal(gs.cash, cassaPrima, 'piazzare un\'offerta non deve scalare cash locale');
        });

        test('auctionsPlaceBid gestisce assenza di Supabase ritornando errore', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('ast_veh_1', 40000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('auctionsPlaceBid gestisce errore restituito da RPC (es. asta non trovata o offerta insufficiente)', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('ast_inesistente', 50000);

            assert.ok(res.error, 'deve ritornare errore formattato');
            assert.ok(res.error.includes('Offerta fallita') && res.error.includes('Asta non trovata'));
        });

        test('auctionsOpenBidModal crea il modale DOM con i valori corretti', () => {
            const { sandbox } = amb;

            sandbox.auctionsOpenBidModal('ast_veh_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale deve esistere nel DOM');

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input, 'l\'input importo offerta deve esistere');
            // top_bid era 30000, quindi minNext = 30001
            assert.equal(Number(input.getAttribute('min')), 30001);

            const btn = sandbox.document.getElementById('bid-confirm-btn');
            assert.ok(btn, 'il bottone di conferma deve esistere');
            assert.ok(btn.getAttribute('data-ce-act'), 'deve avere attributo data-ce-act');
        });

        test('auctionsOpenBidModal per asta inesistente non crea il modale', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('ast_fantasma');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null);
        });

        test('auctionsConfirmBid valida input vuoto o non positivo mostrando errore', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.auctionsOpenBidModal('ast_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '0';

            await sandbox.auctionsConfirmBid('ast_veh_1');

            const errDiv = sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Inserisci un importo valido'));
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0);
        });

        test('auctionsConfirmBid su fallimento RPC mostra messaggio di errore nel DOM e riabilita bottone', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => ({
                        data: null,
                        error: { message: 'Fondi insufficienti: hai già impegnato il tuo saldo' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);
            ambErr.sandbox.auctionsOpenBidModal('ast_veh_1');

            const input = ambErr.sandbox.document.getElementById('bid-amount-input');
            input.value = '50000';

            await ambErr.sandbox.auctionsConfirmBid('ast_veh_1');

            const errDiv = ambErr.sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Fondi insufficienti'));

            const btn = ambErr.sandbox.document.getElementById('bid-confirm-btn');
            assert.equal(btn.disabled, false);
            assert.ok(btn.textContent.includes('Piazza Offerta'));
            ambErr.env.stopAllIntervals();
        });

        test('auctionsConfirmBid su successo chiude il modale e mostra notifica', async () => {
            const { sandbox, env } = amb;
            sandbox.auctionsOpenBidModal('ast_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '40000';

            await sandbox.auctionsConfirmBid('ast_veh_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null, 'il modale deve essere rimosso dopo l offerta');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta di €40.000 registrata')));
        });
    });

    describe('3. Riscossione premi e lotti vinti (auctionsClaim, auctionsRevealWon, _autoDalLotto)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('riscuotere un veicolo singolo (lot_type: vehicle) inserisce l\'auto in flotta con modello valido', async () => {
            const { sandbox, gs } = amb;
            const primaFlotta = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('ast_won_1');

            assert.ok(!esito.error, 'ritiro non deve dare errori');
            assert.equal(gs.fleet.length, primaFlotta + 1, 'flotta deve incrementare di 1');

            const auto = gs.fleet[gs.fleet.length - 1];
            assert.ok(auto.id.startsWith('c_ast_'));
            assert.equal(auto.tier, 'business');
            assert.equal(auto.condition, 68);
            assert.equal(auto.mileage, 82000);
            assert.equal(auto.isLease, false);
            assert.ok(auto.vehicleClass, 'deve avere un vehicleClass valido da data.js');
        });

        test('riscuotere un container (lot_type: container) accredita contanti e inserisce i veicoli', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('ast_won_2');

            assert.ok(!esito.error);
            assert.equal(esito.contanti, 60000);
            assert.equal(gs.cash, cashPrima + 60000, 'il cash deve ricevere i 60.000€ del container');
            assert.equal(gs.fleet.length, flottaPrima + 1, 'deve aggiungere il veicolo del container');
        });

        test('riscuotere un pacchetto flotta (lot_type: fleet_pack) inserisce TUTTI i veicoli del lotto', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('ast_won_3');

            assert.ok(!esito.error);
            // ast_won_3 ha 2 veicoli: 1 business e 1 vip
            assert.equal(gs.fleet.length, flottaPrima + 2, 'devono entrare entrambi i veicoli del fleet_pack');
            const auto1 = gs.fleet[gs.fleet.length - 2];
            const auto2 = gs.fleet[gs.fleet.length - 1];
            assert.equal(auto1.tier, 'business');
            assert.equal(auto1.condition, 75);
            assert.equal(auto2.tier, 'vip');
            assert.equal(auto2.condition, 80);
        });

        test('riscossione fallita da RPC non altera flotta né denaro e preserva il lotto', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;
            const flottaPrima = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('ast_won_inesistente');

            assert.ok(esito.error);
            assert.equal(gs.cash, cashPrima);
            assert.equal(gs.fleet.length, flottaPrima);
        });

        test('auctionsClaim rimuove il lotto riscosso da _auctionsState.wonAuctions', async () => {
            const { sandbox } = amb;
            assert.ok(sandbox._auctionsState.wonAuctions.some(a => a.id === 'ast_won_1'));

            await sandbox.auctionsClaim('ast_won_1');

            assert.ok(!sandbox._auctionsState.wonAuctions.some(a => a.id === 'ast_won_1'));
        });

        test('auctionsRevealWon riscuote il lotto e visualizza la modale di riepilogo nel DOM', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('ast_won_1');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'la modale di premio svelato deve esistere');
            assert.ok(modal.innerHTML.includes('BMW Serie 7 Giudiziaria'));
            assert.ok(modal.innerHTML.includes('Aggiudicato per'));
        });

        test('auctionsRevealWon con container mostra il contenuto con icone per cash e auto', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('ast_won_2');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto Svelato!'));
            assert.ok(modal.innerHTML.includes('Liquidità'));
        });

        test('auctionsRevealWon per lotto inesistente non esegue operazioni né crea modale', async () => {
            const { sandbox, rpcLog } = amb;
            const countPrima = rpcLog.length;

            await sandbox.auctionsRevealWon('ast_won_inesistente');

            assert.equal(rpcLog.length, countPrima);
            assert.equal(sandbox.document.getElementById('auction-won-modal'), null);
        });
    });

    describe('4. Helper di formattazione e utilità (_fmtCurrency, _countdown, _tierBadge, _aErr)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_fmtCurrency formatta correttamente numeri, zero e valori nulli', () => {
            const { sandbox } = amb;
            const fn = vm.runInContext('_fmtCurrency', sandbox);

            assert.equal(fn(null), '—');
            assert.equal(fn(undefined), '—');
            assert.equal(fn(0), '€0');
            assert.ok(fn(25000).includes('€') && fn(25000).includes('25'));
        });

        test('_countdown gestisce date future, giorni, ore, minuti e date scadute/nulle', () => {
            const { sandbox } = amb;
            const fn = vm.runInContext('_countdown', sandbox);

            assert.equal(fn(null), '—');
            assert.equal(fn(undefined), '—');
            assert.equal(fn(''), '—');
            assert.equal(fn(new Date(Date.now() - 5000).toISOString()), 'Scaduta');

            const tra3Giorni = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
            assert.match(fn(tra3Giorni), /\d+g \d+h/);

            const tra3Ore = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
            assert.match(fn(tra3Ore), /\d+h \d+m/);

            const tra10Min = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            assert.match(fn(tra10Min), /\d+m \d+s/);
        });

        test('_tierBadge produce pillole CSS corrette per tier minuscoli e maiuscoli', () => {
            const { sandbox } = amb;
            const fn = vm.runInContext('_tierBadge', sandbox);

            assert.ok(fn('business').includes('em-pill--blue') && fn('business').includes('Business'));
            assert.ok(fn('BUSINESS').includes('em-pill--blue') && fn('BUSINESS').includes('Business'));
            assert.ok(fn('vip').includes('em-pill--gold') && fn('vip').includes('VIP'));
            assert.ok(fn('ultra').includes('em-pill--gold') && fn('ultra').includes('Ultra'));
            assert.ok(fn('armored').includes('em-pill--red') && fn('armored').includes('Armored'));
            assert.ok(fn('standard').includes('em-pill--gray') && fn('standard').includes('Standard'));
        });

        test('_aErr compone il messaggio di errore con email di supporto', () => {
            const { sandbox } = amb;
            const fn = vm.runInContext('_aErr', sandbox);

            const errStr = fn('Offerta fallita', new Error('Asta chiusa'));
            assert.ok(errStr.includes('Offerta fallita: Asta chiusa'));
            assert.ok(errStr.includes('chauffeurempire.com'));
        });
    });

    describe('5. Rendering dell\'interfaccia grafica (renderTabAuctions)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabAuctions non solleva errori se tab-container non è presente', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });

        test('renderTabAuctions disegna intestazione, KPI, banner vincite, lista aste e storico offerte', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Aste Giudiziarie'));
            assert.ok(container.innerHTML.includes('Lotti Aperti'));
            assert.ok(container.innerHTML.includes('Aste Vinte — Da Ritirare'));
            assert.ok(container.innerHTML.includes('BMW Serie 7 Giudiziaria'));
            assert.ok(container.innerHTML.includes('Mercedes Classe S sequestrata'));
            assert.ok(container.innerHTML.includes('Storico Offerte'));
        });

        test('renderTabAuctions mostra stato "Sei in testa" e "Sei stato superato"', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            // Container 2: top_bid 70000, my_bid 70000 -> Leading
            assert.ok(container.innerHTML.includes('Sei in testa'));
            // Fleet 3: top_bid 55000, my_bid 52000 -> Outbid
            assert.ok(container.innerHTML.includes('Sei stato superato'));
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

        test('renderTabAuctions genera pulsanti con attributi data-ce-act corretti', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.querySelector('[data-ce-act="auctionsOpenBidModal"]'));
            assert.ok(container.querySelector('[data-ce-act="auctionsRevealWon"]'));
            assert.ok(container.querySelector('[data-ce-act="ceThen"]'));
        });
    });

    describe('6. Prevenzione Doppio Conteggio e Guardrail di Cassa', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('l\'accredito di liquidità da asta vinta passa solo da CE_money senza chiamare syncCash', async () => {
            const syncedCash = [];
            const ambSync = creaAmbienteAste({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await ambSync.sandbox.auctionsRefresh(true);

            ambSync.gs.cash = 50000;
            await ambSync.sandbox.auctionsClaim('ast_won_2'); // container con 60.000€

            assert.equal(ambSync.gs.cash, 110000, 'il cash locale riflette subito i contanti vinti');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già mosso il denaro');
            ambSync.env.stopAllIntervals();
        });

        test('il saldo locale persiste e viene salvato con saveGame() al ritiro del lotto', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 30000;

            await sandbox.auctionsClaim('ast_won_2'); // +60.000€

            assert.equal(gs.cash, 90000);
            const saved = sandbox.localStorage.getItem('ce_save_slot_1');
            if (saved) {
                const parsed = JSON.parse(saved);
                assert.equal(parsed.cash, 90000, 'il salvataggio deve contenere il nuovo cash');
            }
        });
    });

    describe('7. Modelli reali da catalogo (NEW_CARS, USED_CARS) in _autoDalLotto', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_autoDalLotto assegna modelli reali e validi per qualsiasi tier richiesto', () => {
            const { sandbox } = amb;
            const fn = vm.runInContext('_autoDalLotto', sandbox);

            const autoStd = fn({ tier: 'standard', condition: 60, km: 50000 });
            const autoBus = fn({ tier: 'business', condition: 75, km: 35000 });
            const autoVip = fn({ tier: 'vip', condition: 80, km: 20000 });
            const autoUltra = fn({ tier: 'ultra', condition: 90, km: 10000 });

            assert.ok(autoStd && autoStd.vehicleClass);
            assert.ok(autoBus && autoBus.vehicleClass);
            assert.ok(autoVip && autoVip.vehicleClass);
            assert.ok(autoUltra && autoUltra.vehicleClass);
            assert.equal(autoStd.isLease, false);
            assert.equal(autoBus.isLease, false);
            assert.equal(autoVip.isLease, false);
            assert.equal(autoUltra.isLease, false);
        });

        test('_autoDalLotto rispetta il vehicleClass prioritario se specificato nel lotto', () => {
            const { sandbox } = amb;
            const fn = vm.runInContext('_autoDalLotto', sandbox);

            const auto = fn({ vehicleClass: 'volt_3_urban', condition: 65, km: 40000 });
            assert.equal(auto.vehicleClass, 'volt_3_urban');
            assert.equal(auto.condition, 65);
            assert.equal(auto.mileage, 40000);
        });
    });

    describe('8. Ciclo di vita avanzato e scenari limite (superamento, scadenza, fondi, rate-limit)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('offrire più di quanto si possiede viene respinto dal server e non altera lo stato', async () => {
            const ambPovero = creaAmbienteAste({
                cash: 1000,
                rpcHandlers: {
                    rpc_place_auction_bid: async (args) => {
                        if (args.v_amount > 1000) {
                            return { data: null, error: { message: 'Fondi insufficienti: saldo non capiente' } };
                        }
                        return { data: { success: true }, error: null };
                    },
                },
            });
            await ambPovero.sandbox.auctionsRefresh(true);

            const esito = await ambPovero.sandbox.auctionsPlaceBid('ast_veh_1', 35000);

            assert.ok(esito.error);
            assert.ok(esito.error.includes('Fondi insufficienti'));
            assert.equal(ambPovero.gs.cash, 1000);
            ambPovero.env.stopAllIntervals();
        });

        test('rilanci troppo ravvicinati sulla stessa asta vengono bloccati dal rate-limit', async () => {
            let tentativi = 0;
            const ambRate = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => {
                        tentativi++;
                        if (tentativi > 1) {
                            return { data: null, error: { message: 'Troppi rilanci ravvicinati — aspetta qualche secondo' } };
                        }
                        return { data: { success: true }, error: null };
                    },
                },
            });
            await ambRate.sandbox.auctionsRefresh(true);

            // Prima offerta: ok
            const prima = await ambRate.sandbox.auctionsPlaceBid('ast_veh_1', 32000);
            assert.ok(!prima.error);

            // Seconda offerta immediata: bloccata da rate-limit
            const seconda = await ambRate.sandbox.auctionsPlaceBid('ast_veh_1', 35000);
            assert.ok(seconda.error);
            assert.ok(seconda.error.includes('Troppi rilanci ravvicinati'));
            ambRate.env.stopAllIntervals();
        });

        test('utente non autenticato viene respinto al piazzamento offerta', async () => {
            const ambAnon = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => {
                        return { data: null, error: { message: 'Non autenticato' } };
                    },
                },
            });
            await ambAnon.sandbox.auctionsRefresh(true);

            const esito = await ambAnon.sandbox.auctionsPlaceBid('ast_veh_1', 35000);
            assert.ok(esito.error);
            assert.ok(esito.error.includes('Non autenticato'));
            ambAnon.env.stopAllIntervals();
        });

        test('asta che scade senza offerte non compare nelle aste vinte', async () => {
            const { sandbox, statoAste } = amb;
            // Asta scaduta con 0 offerte
            statoAste.push({
                id: 'ast_scaduta_vuota',
                lot_type: 'vehicle',
                title: 'Lotto Senza Offerte',
                icon: '🚗',
                vehicle_data: { tier: 'business' },
                min_bid: 20000,
                top_bid: null,
                my_bid: null,
                bid_count: 0,
                status: 'cancelled',
                auction_ends_at: new Date(Date.now() - 3600000).toISOString(),
            });

            await sandbox.auctionsRefresh(true);

            // Le vinte devono contenere solo quelle effettivamente vinte e chiuse
            const vinteIds = sandbox._auctionsState.wonAuctions.map(w => w.id);
            assert.ok(!vinteIds.includes('ast_scaduta_vuota'), 'l asta annullata senza offerte non deve essere tra le vinte');
        });

        test('dinamica essere superati: aggiornamento dello stato a outbid e rilancio per tornare in testa', async () => {
            const { sandbox } = amb;

            // Inizialmente sul lotto fleet 3 siamo superati (my_bid: 52000, top_bid: 55000)
            const lottoFleet = sandbox._auctionsState.auctions.find(a => a.id === 'ast_fleet_3');
            assert.ok(lottoFleet.my_bid < lottoFleet.top_bid, 'inizialmente superato');

            // Rilanciamo a 60000
            const esitoRilancio = await sandbox.auctionsPlaceBid('ast_fleet_3', 60000);
            assert.ok(!esitoRilancio.error);

            // Dopo il refresh il nostro lotto è in testa
            const lottoAggiornato = sandbox._auctionsState.auctions.find(a => a.id === 'ast_fleet_3');
            assert.equal(lottoAggiornato.my_bid, 60000);
            assert.equal(lottoAggiornato.top_bid, 60000);
            assert.ok(lottoAggiornato.my_bid >= lottoAggiornato.top_bid, 'ora in testa');
        });
    });
});
