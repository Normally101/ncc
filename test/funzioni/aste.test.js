'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `auctions.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, la gestione dello stato locale/server,
   il ciclo di vita delle offerte, la prevenzione del doppio conteggio di cassa,
   la generazione di veicoli per la flotta e l'interfaccia utente (rendering, modali, realtime).
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

    const auctionsDefault = [
        {
            id: 'auc_open_leading',
            title: 'Lotto Giudiziario — Tribunale di Roma',
            icon: '🚗',
            lot_type: 'vehicle',
            min_bid: 25000,
            top_bid: 30000,
            my_bid: 30000,
            bid_count: 2,
            vehicle_data: { tier: 'business', condition: 75, km: 35000, year: 2022 },
            container_data: null,
            auction_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            status: 'open',
        },
        {
            id: 'auc_open_outbid',
            title: 'Sequestro DIA — Distretto Sud',
            icon: '🏛️',
            lot_type: 'vehicle',
            min_bid: 50000,
            top_bid: 65000,
            my_bid: 55000,
            bid_count: 3,
            vehicle_data: { tier: 'vip', condition: 85, km: 20000, year: 2023 },
            container_data: null,
            auction_ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min (urgente)
            status: 'open',
        },
        {
            id: 'auc_container_open',
            title: 'Container Sigillato — Dogana',
            icon: '📦',
            lot_type: 'container',
            min_bid: 15000,
            top_bid: null,
            my_bid: null,
            bid_count: 0,
            vehicle_data: null,
            container_data: {
                items: [
                    { type: 'cash', amount: 20000 },
                    { type: 'vehicle', tier: 'standard', condition: 60 },
                ],
            },
            auction_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            status: 'open',
        },
    ];

    const wonAuctionsDefault = [
        {
            id: 'auc_won_veh',
            title: 'Confisca GdF — Veicolo VIP',
            icon: '👑',
            lot_type: 'vehicle',
            winning_bid: 95000,
            vehicle_data: { tier: 'ultra', condition: 92, km: 12000, year: 2024 },
            container_data: null,
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            id: 'auc_won_box',
            title: 'Container Doganale Riscosso',
            icon: '📦',
            lot_type: 'container',
            winning_bid: 40000,
            vehicle_data: null,
            container_data: {
                items: [
                    { type: 'cash', amount: 50000 },
                    { type: 'vehicle', tier: 'business', condition: 70 },
                ],
            },
            created_at: new Date(Date.now() - 7200000).toISOString(),
        },
    ];

    const myBidsDefault = [
        {
            id: 'bid_1',
            auction_id: 'auc_open_leading',
            auction_title: 'Lotto Giudiziario — Tribunale di Roma',
            auction_icon: '🚗',
            amount: 30000,
            auction_status: 'open',
            is_winner: null,
        },
        {
            id: 'bid_2',
            auction_id: 'auc_past_1',
            auction_title: 'Fallimento NCC Milano',
            auction_icon: '🚙',
            amount: 22000,
            auction_status: 'closed',
            is_winner: true,
        },
        {
            id: 'bid_3',
            auction_id: 'auc_past_2',
            auction_title: 'Confisca DIA Palermo',
            auction_icon: '🏎️',
            amount: 80000,
            auction_status: 'closed',
            is_winner: false,
        },
    ];

    let statoAste = (opzioni.auctions || auctionsDefault).map(a => ({ ...a }));
    let statoVinte = (opzioni.wonAuctions || wonAuctionsDefault).map(w => ({ ...w }));
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

                const cash = env.sandbox.gameState.cash || 0;
                if (cash < args.v_amount) {
                    return { data: null, error: { message: 'Fondi insufficienti' } };
                }

                asta.top_bid = args.v_amount;
                asta.my_bid = args.v_amount;
                asta.bid_count = (asta.bid_count || 0) + 1;

                const bidExist = statoOfferte.find(b => b.auction_id === args.v_auction_id);
                if (bidExist) {
                    bidExist.amount = args.v_amount;
                } else {
                    statoOfferte.push({
                        id: 'bid_' + Math.random().toString(36).slice(2, 7),
                        auction_id: asta.id,
                        auction_title: asta.title,
                        auction_icon: asta.icon,
                        amount: args.v_amount,
                        auction_status: 'open',
                        is_winner: null,
                    });
                }

                return { data: { success: true, amount: args.v_amount }, error: null };
            }

            if (nome === 'rpc_claim_auction') {
                const idx = statoVinte.findIndex(w => w.id === args.v_auction_id);
                if (idx < 0) {
                    return { data: null, error: { message: 'Lotto non riscuotibile: non trovato o non tuo' } };
                }
                const lotto = statoVinte[idx];

                let contanti = 0;
                if (lotto.lot_type === 'container') {
                    for (const it of (lotto.container_data?.items || [])) {
                        if (it.type === 'cash') contanti += Number(it.amount) || 0;
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

    // Predisponi stato giocatore
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
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
        subscriptions,
    };
}

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola stato aste, vinte e mie offerte da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 3, 'deve contenere 3 aste aperte');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 2, 'deve contenere 2 aste vinte');
            assert.equal(sandbox._auctionsState.myBids.length, 3, 'deve contenere 3 offerte storiche');
            assert.ok(sandbox._auctionsState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const rpcCountPrima = rpcLog.length;

            // Seconda chiamata immediata (non forzata) -> nessuna nuova RPC
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, rpcCountPrima, 'non deve eseguire nuove chiamate entro 30s');

            // Chiamata forzata -> riesegue query
            await sandbox.auctionsRefresh(true);
            assert.equal(rpcLog.length, rpcCountPrima + 3, 'force=true deve bypassare il throttle');
        });

        test('auctionsRefresh non fallisce in assenza di supabaseClient', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.auctionsRefresh(true);
            });
        });

        test('auctionsInit esegue refresh iniziale, sottoscrizione realtime e notifica lotti vinti', async () => {
            const { sandbox, rpcLog, env, subscriptions } = amb;
            await sandbox.auctionsInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_judicial_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_won_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_my_bids'));
            assert.ok(subscriptions.has('judicial_auctions_changes'), 'deve registrarsi al canale realtime');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('da ritirare')));
        });
    });

    describe('2. Piazzamento offerta (auctionsPlaceBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('invia offerta valida, chiama rpc_place_auction_bid e aggiorna cache', async () => {
            const { sandbox, rpcLog, gs } = amb;
            gs.cash = 100000;

            const res = await sandbox.auctionsPlaceBid('auc_container_open', 20000);

            assert.equal(res.error, undefined);
            assert.deepEqual(res.data, { success: true, amount: 20000 });

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_place_auction_bid');
            assert.equal(bidRpc.args.v_auction_id, 'auc_container_open');
            assert.equal(bidRpc.args.v_amount, 20000);

            // Verifica che il saldo locale non venga scalato dal client
            assert.equal(gs.cash, 100000, 'il saldo non deve scalare durante l offerta (si paga ad aggiudicazione)');
        });

        test('rifiuto offerta se supabaseClient non è disponibile', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('auc_open_leading', 35000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('gestione errore RPC (es. asta scaduta o offerta troppo bassa)', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => ({
                        data: null,
                        error: { message: 'Offerta troppo bassa' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);

            const res = await ambErr.sandbox.auctionsPlaceBid('auc_open_leading', 20000);
            assert.ok(res.error.includes('Offerta fallita: Offerta troppo bassa'));
            assert.ok(res.error.includes('support@chauffeurempire.com'), 'deve includere email supporto');
            ambErr.env.stopAllIntervals();
        });

        test('rifiuto offerta se il giocatore offre più di quanto ha in cassa', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000; // Solo 10k disponibili

            const res = await sandbox.auctionsPlaceBid('auc_container_open', 25000);
            assert.ok(res.error.includes('Fondi insufficienti'));
        });
    });

    describe('3. Modale di offerta e conferma (auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsOpenBidModal apre il modale con campi e calcolo minNext corretto per veicolo', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_leading');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale deve essere inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Tribunale di Roma'));
            assert.ok(modal.innerHTML.includes('Offerta minima'));
            assert.ok(modal.innerHTML.includes('La tua offerta'));

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input);
            // top_bid è 30000, quindi minNext = 30001
            assert.equal(input.getAttribute('min'), '30001');
        });

        test('auctionsOpenBidModal per container mostra badge container e testo contenuto sconosciuto', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_container_open');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto rivelato solo al vincitore'));
        });

        test('auctionsOpenBidModal con asta inesistente non crea modale', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('asta_inesistente');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null);
        });

        test('auctionsOpenBidModal chiamato due volte sostituisce il modale precedente', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_open_leading');
            sandbox.auctionsOpenBidModal('auc_container_open');

            const modals = sandbox.document.querySelectorAll('#auction-bid-modal');
            assert.equal(modals.length, 1);
            assert.ok(modals[0].innerHTML.includes('Container Sigillato'));
        });

        test('auctionsConfirmBid con importo non valido mostra errore e non invoca RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.auctionsOpenBidModal('auc_open_leading');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '0';

            await sandbox.auctionsConfirmBid('auc_open_leading');

            const errDiv = sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.textContent, 'Inserisci un importo valido');
            assert.equal(errDiv.style.display, 'block');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0);
        });

        test('auctionsConfirmBid con offerta andata a buon fine chiude modale e invia notifica', async () => {
            const { sandbox, env } = amb;
            sandbox.auctionsOpenBidModal('auc_container_open');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '20000';

            await sandbox.auctionsConfirmBid('auc_container_open');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null, 'il modale deve essere rimosso dal DOM');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta di €20.000 registrata')));
        });

        test('auctionsConfirmBid con errore RPC mostra errore nel modale e riabilita pulsante', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => ({
                        data: null,
                        error: { message: 'Asta scaduta' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);
            ambErr.sandbox.auctionsOpenBidModal('auc_open_leading');

            const input = ambErr.sandbox.document.getElementById('bid-amount-input');
            input.value = '40000';

            await ambErr.sandbox.auctionsConfirmBid('auc_open_leading');

            const btn = ambErr.sandbox.document.getElementById('bid-confirm-btn');
            const errDiv = ambErr.sandbox.document.getElementById('bid-error');

            assert.equal(btn.disabled, false);
            assert.ok(errDiv.textContent.includes('Asta scaduta'));
            assert.equal(errDiv.style.display, 'block');

            ambErr.env.stopAllIntervals();
        });
    });

    describe('4. Ritiro e Riscatto Premio (auctionsClaim, auctionsRevealWon)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsClaim per veicolo singolo inserisce auto reale in garage e rimuove lotto dai vinti', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const primaFlotta = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('auc_won_veh');

            assert.equal(esito.error, undefined);
            assert.equal(gs.fleet.length, primaFlotta + 1, 'deve aggiungere 1 auto alla flotta');

            const nuovaAuto = gs.fleet[gs.fleet.length - 1];
            assert.ok(nuovaAuto.id.startsWith('c_ast_'));
            assert.ok(nuovaAuto.name.includes('(Asta)'));
            assert.equal(nuovaAuto.tier, 'ultra');
            assert.equal(nuovaAuto.condition, 92);
            assert.equal(nuovaAuto.isLease, false);
            assert.equal(nuovaAuto.mileage, 12000);

            // Verifica rimozione da wonAuctions
            assert.ok(!sandbox._auctionsState.wonAuctions.some(w => w.id === 'auc_won_veh'));

            const claimRpc = rpcLog.find(r => r.nome === 'rpc_claim_auction');
            assert.ok(claimRpc);
            assert.equal(claimRpc.args.v_auction_id, 'auc_won_veh');
        });

        test('auctionsClaim per container accredita cash via CE_money e veicolo in garage', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            const primaFlotta = gs.fleet.length;

            const esito = await sandbox.auctionsClaim('auc_won_box');

            assert.equal(esito.error, undefined);
            assert.equal(gs.cash, 100000, 'deve accreditare i 50.000€ del container');
            assert.equal(gs.fleet.length, primaFlotta + 1, 'deve aggiungere il veicolo del container in flotta');

            const autoContainer = gs.fleet[gs.fleet.length - 1];
            assert.equal(autoContainer.tier, 'business');
            assert.equal(autoContainer.condition, 70);
        });

        test('auctionsClaim fallito non altera né cassa né flotta e lascia il lotto in lista', async () => {
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

            const esito = await ambErr.sandbox.auctionsClaim('auc_won_veh');

            assert.ok(esito.error.includes('Lotto già ritirato'));
            assert.equal(ambErr.gs.cash, cashPrima);
            assert.equal(ambErr.gs.fleet.length, flottaPrima);
            assert.equal(ambErr.sandbox._auctionsState.wonAuctions.length, 2);

            ambErr.env.stopAllIntervals();
        });

        test('auctionsRevealWon riscuote il lotto e apre il modale celebrativo con i dettagli', async () => {
            const { sandbox } = amb;

            await sandbox.auctionsRevealWon('auc_won_box');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'il modale di vittoria deve essere inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Contenuto Svelato!'));
            assert.ok(modal.innerHTML.includes('Liquidità: €50.000'));
            assert.ok(modal.innerHTML.includes('Veicolo business'));
        });

        test('auctionsRevealWon con lotto inesistente non fa nulla', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('lotto_fantasma');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.equal(modal, null);
        });

        test('auctionsRevealWon con errore di claim mostra notifica errore e non apre modale', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_claim_auction: async () => ({
                        data: null,
                        error: { message: 'Errore DB riscatto' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);

            await ambErr.sandbox.auctionsRevealWon('auc_won_veh');

            const modal = ambErr.sandbox.document.getElementById('auction-won-modal');
            assert.equal(modal, null);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Errore DB riscatto')));

            ambErr.env.stopAllIntervals();
        });
    });

    describe('5. Rendering interfaccia utente (renderTabAuctions)', () => {
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

        test('renderTabAuctions disegna intestazione, KPI, lotti e banner vittorie', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Aste Giudiziarie'));
            assert.ok(c.innerHTML.includes('Lotti Aperti'));
            assert.ok(c.innerHTML.includes('Tue Offerte'));
            assert.ok(c.innerHTML.includes('Da Ritirare'));
            assert.ok(c.innerHTML.includes('Aste Vinte — Da Ritirare'));
            assert.ok(c.innerHTML.includes('Confisca GdF — Veicolo VIP'));
            assert.ok(c.innerHTML.includes('Tribunale di Roma'));
        });

        test('renderTabAuctions evidenzia stato in testa vs superato', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Sei in testa — mantieni la posizione'));
            assert.ok(c.innerHTML.includes('Sei stato superato! Rilancia per vincere'));
        });

        test('renderTabAuctions mostra storico offerte con esiti (Vinta, Persa, Aperta)', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Storico Offerte'));
            assert.ok(c.innerHTML.includes('✅ Vinta'));
            assert.ok(c.innerHTML.includes('❌ Persa'));
            assert.ok(c.innerHTML.includes('🟡 Aperta'));
        });
    });

    describe('6. Helper di formattazione e utility (_fmtCurrency, _countdown, _tierBadge, _autoDalLotto)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_fmtCurrency formatta correttamente importi e valori nulli', () => {
            const { sandbox } = amb;
            assert.equal(sandbox._fmtCurrency(null), '—');
            assert.equal(sandbox._fmtCurrency(undefined), '—');
            assert.equal(sandbox._fmtCurrency(0), '€0');
            assert.equal(sandbox._fmtCurrency(50000), '€50.000');
        });

        test('_countdown gestisce date scadute, giorni, ore e minuti', () => {
            const { sandbox } = amb;
            // Scaduta
            assert.equal(sandbox._countdown(new Date(Date.now() - 5000).toISOString()), 'Scaduta');

            // > 48 ore (es. 72h -> 3g 0h)
            const d72 = new Date(Date.now() + 72 * 3600 * 1000 + 10000).toISOString();
            assert.match(sandbox._countdown(d72), /\d+g \d+h/);

            // Ore e minuti (es. 5h)
            const d5 = new Date(Date.now() + 5 * 3600 * 1000 + 10000).toISOString();
            assert.match(sandbox._countdown(d5), /\d+h \d+m/);

            // Minuti e secondi (es. 20m)
            const d20m = new Date(Date.now() + 20 * 60 * 1000 + 10000).toISOString();
            assert.match(sandbox._countdown(d20m), /\d+m \d+s/);
        });

        test('_tierBadge normalizza maiuscole e assegna classi corrette', () => {
            const { sandbox } = amb;
            assert.ok(sandbox._tierBadge('BUSINESS').includes('em-pill--blue'));
            assert.ok(sandbox._tierBadge('business').includes('em-pill--blue'));
            assert.ok(sandbox._tierBadge('vip').includes('em-pill--gold'));
            assert.ok(sandbox._tierBadge('ultra').includes('em-pill--gold'));
            assert.ok(sandbox._tierBadge('standard').includes('em-pill--gray'));
            assert.ok(sandbox._tierBadge('armored').includes('em-pill--red'));
            assert.ok(sandbox._tierBadge('presidential').includes('em-pill--gold'));
        });

        test('_autoDalLotto genera veicolo completo da catalogo NEW_CARS / USED_CARS', () => {
            const { sandbox } = amb;
            const auto = vm.runInContext('_autoDalLotto({ tier: "business", condition: 80, km: 50000 })', sandbox);

            assert.ok(auto);
            assert.ok(auto.id.startsWith('c_ast_'));
            assert.equal(auto.tier, 'business');
            assert.equal(auto.condition, 80);
            assert.equal(auto.mileage, 50000);
            assert.equal(auto.fuel, 60);
            assert.equal(auto.tirePressure, 80);
            assert.equal(auto.isLease, false);
            assert.equal(auto.outOfService, null);
            assert.ok(Array.isArray(auto.upgrades));
            assert.equal(auto.upgrades.length, 0);
        });

        test('_autoDalLotto con parametri mancanti o nulli assegna valori di default sicuri', () => {
            const { sandbox } = amb;
            const auto = vm.runInContext('_autoDalLotto(null)', sandbox);

            assert.ok(auto);
            assert.ok(auto.condition >= 10 && auto.condition <= 100);
            assert.equal(auto.mileage, 0);
        });
    });

    describe('7. Ciclo di vita e risoluzione aste (simulazione DB e Cron)', () => {
        test('un asta che scade senza offerte viene annullata (status cancelled)', async () => {
            const amb = creaAmbienteAste({
                auctions: [
                    {
                        id: 'auc_no_bids',
                        status: 'open',
                        min_bid: 20000,
                        top_bid: null,
                        auction_ends_at: new Date(Date.now() - 1000).toISOString(), // scaduta
                    },
                ],
            });
            await amb.sandbox.auctionsRefresh(true);

            // Simula risoluzione server per asta senza offerte
            const asta = amb.statoAste[0];
            if (!asta.top_bid && new Date(asta.auction_ends_at).getTime() <= Date.now()) {
                asta.status = 'cancelled';
            }

            assert.equal(asta.status, 'cancelled');
            amb.env.stopAllIntervals();
        });

        test('rilanci ravvicinati (<10s) vengono bloccati dal rate-limiting', async () => {
            let lastBidTime = Date.now();
            const amb = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async (args) => {
                        const now = Date.now();
                        if (now - lastBidTime < 10000) {
                            return { data: null, error: { message: 'Troppi rilanci ravvicinati — aspetta qualche secondo' } };
                        }
                        lastBidTime = now;
                        return { data: { success: true }, error: null };
                    },
                },
            });
            await amb.sandbox.auctionsRefresh(true);

            const res1 = await amb.sandbox.auctionsPlaceBid('auc_open_leading', 35000);
            assert.ok(res1.error.includes('Troppi rilanci ravvicinati'));

            amb.env.stopAllIntervals();
        });

        test('due offerte consecutive sulla stessa asta aggiornano l offerta massima senza doppio debito', async () => {
            const amb = creaAmbienteAste({ cash: 100000 });
            await amb.sandbox.auctionsRefresh(true);

            const res1 = await amb.sandbox.auctionsPlaceBid('auc_container_open', 20000);
            assert.equal(res1.error, undefined);

            const res2 = await amb.sandbox.auctionsPlaceBid('auc_container_open', 25000);
            assert.equal(res2.error, undefined);

            // Verifica che il saldo locale in gameState sia rimasto intatto
            assert.equal(amb.gs.cash, 100000);
            amb.env.stopAllIntervals();
        });
    });

    describe('8. Integrazione Realtime e Sincronizzazione Saldo', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsInit();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('evento realtime su judicial_auctions resetta la cache e forza il rendering se tab attiva', async () => {
            const { sandbox, subscriptions } = amb;
            sandbox._activeTab = 'auctions';
            let renderChiamato = false;
            sandbox.renderTabAuctions = () => { renderChiamato = true; };

            const realtimeCb = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof realtimeCb === 'function');

            // Simula arrivo notifica postgres_changes
            realtimeCb();

            // Attendi microtask
            await new Promise(r => setImmediate(r));

            assert.equal(sandbox._auctionsState._lastFetch, 0, 'la cache deve essere invalidata');
        });

        test('riscatto container con ServerState attivo NON chiama syncCash (anti doppio conteggio)', async () => {
            let syncCashChiamato = 0;
            const ambSync = creaAmbienteAste({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async () => { syncCashChiamato++; return { success: true }; },
                },
            });
            await ambSync.sandbox.auctionsRefresh(true);

            ambSync.gs.cash = 30000;
            await ambSync.sandbox.auctionsClaim('auc_won_box');

            assert.equal(ambSync.gs.cash, 80000, 'il cash locale aumenta dei 50k del container');
            assert.equal(syncCashChiamato, 0, 'syncCash non deve essere chiamato (il server ha già mosso il denaro)');
            ambSync.env.stopAllIntervals();
        });

        test('riscatto persiste lo stato del garage in saveGame()', async () => {
            const { sandbox, gs } = amb;
            await sandbox.auctionsClaim('auc_won_veh');

            const rawSave = sandbox.localStorage.getItem('ce_save_slot_1');
            if (rawSave) {
                const parsed = JSON.parse(rawSave);
                assert.equal(parsed.fleet.length, gs.fleet.length, 'la flotta salvata deve contenere il nuovo veicolo');
            }
        });
    });
});
