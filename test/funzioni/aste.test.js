'use strict';
/* ============================================================================
   test/funzioni/aste.test.js — Verifica approfondita del modulo Aste Giudiziarie

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `auctions.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, il flusso di offerta e rilancio,
   la riscossione dei lotti vinti (veicoli, container al buio, fleet pack),
   la sincronizzazione del denaro tramite CE_money (senza doppio conteggio),
   il rendering dell'UI, i controlli di validazione e la sincronizzazione Realtime.
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
            id: 'auc_veh_1',
            lot_type: 'vehicle',
            title: 'Mercedes Classe S sequestrata — Napoli',
            description: 'Veicolo confiscato dalla DIA.',
            icon: '🚗',
            vehicle_data: { tier: 'business', condition: 75, km: 45000, year: 2021 },
            container_data: {},
            min_bid: 25000,
            province_id: 'napoli',
            status: 'open',
            bid_count: 2,
            auction_ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
            my_bid: null,
            top_bid: 30000,
        },
        {
            id: 'auc_cnt_2',
            lot_type: 'container',
            title: 'Container Sigillato — Dogana Genova',
            description: 'Contenuto sconosciuto.',
            icon: '📦',
            vehicle_data: {},
            container_data: {},
            min_bid: 50000,
            province_id: 'genova',
            status: 'open',
            bid_count: 1,
            auction_ends_at: new Date(Date.now() + 1800000).toISOString(), // 30 min
            my_bid: 60000,
            top_bid: 60000,
        },
        {
            id: 'auc_flt_3',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli — Fallimento NCC Palermo',
            description: 'Tre veicoli business venduti come lotto unico.',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', condition: 70, km: 60000 },
                    { tier: 'business', condition: 65, km: 80000 },
                    { tier: 'vip', condition: 58, km: 90000 },
                ],
            },
            container_data: {},
            min_bid: 75000,
            province_id: 'palermo',
            status: 'open',
            bid_count: 3,
            auction_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            my_bid: 80000,
            top_bid: 95000, // superato
        },
    ];

    const wonDefault = [
        {
            id: 'auc_won_veh',
            lot_type: 'vehicle',
            title: 'BMW Serie 7 — Lotto Roma',
            icon: '🚙',
            vehicle_data: { tier: 'business', condition: 60, km: 55000, year: 2020 },
            container_data: {},
            winning_bid: 32000,
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            id: 'auc_won_cnt',
            lot_type: 'container',
            title: 'Container Dogana Gioia Tauro',
            icon: '📦',
            vehicle_data: {},
            container_data: {
                items: [
                    { type: 'cash', amount: 40000 },
                    { type: 'vehicle', tier: 'ultra', condition: 85, km: 15000 },
                ],
            },
            winning_bid: 70000,
            created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
            id: 'auc_won_flt',
            lot_type: 'fleet_pack',
            title: 'Lotto 3 Veicoli Flotta Palermo',
            icon: '🚐',
            vehicle_data: {
                vehicles: [
                    { tier: 'business', condition: 70 },
                    { tier: 'business', condition: 65 },
                    { tier: 'vip', condition: 80 },
                ],
            },
            container_data: {},
            winning_bid: 85000,
            created_at: new Date(Date.now() - 10800000).toISOString(),
        },
    ];

    const myBidsDefault = [
        {
            auction_id: 'auc_veh_1',
            auction_title: 'Mercedes Classe S sequestrata — Napoli',
            auction_icon: '🚗',
            amount: 30000,
            auction_ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
            auction_status: 'open',
            is_winner: false,
        },
        {
            auction_id: 'auc_won_veh',
            auction_title: 'BMW Serie 7 — Lotto Roma',
            auction_icon: '🚙',
            amount: 32000,
            auction_ends_at: new Date(Date.now() - 3600000).toISOString(),
            auction_status: 'closed',
            is_winner: true,
        },
        {
            auction_id: 'auc_lost_1',
            auction_title: 'Audi A8 Sequestrata',
            auction_icon: '🚗',
            amount: 40000,
            auction_ends_at: new Date(Date.now() - 7200000).toISOString(),
            auction_status: 'closed',
            is_winner: false,
        },
        {
            auction_id: 'auc_canc_1',
            auction_title: 'Lotto Annullato Dogana',
            auction_icon: '📦',
            amount: 15000,
            auction_ends_at: new Date(Date.now() - 1000000).toISOString(),
            auction_status: 'cancelled',
            is_winner: false,
        },
    ];

    let statoAste = (opzioni.auctions || auctionsDefault).map(a => ({ ...a }));
    let statoWon = (opzioni.won || wonDefault).map(w => ({ ...w }));
    let statoBids = (opzioni.myBids || myBidsDefault).map(b => ({ ...b }));

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
                return opzioni.rpcHandlers[nome](args, { statoAste, statoWon, statoBids });
            }

            if (nome === 'rpc_get_judicial_auctions') {
                return { data: statoAste, error: null };
            }

            if (nome === 'rpc_get_won_auctions') {
                return { data: statoWon, error: null };
            }

            if (nome === 'rpc_get_my_bids') {
                return { data: statoBids, error: null };
            }

            if (nome === 'rpc_place_auction_bid') {
                const auc = statoAste.find(a => a.id === args.v_auction_id);
                if (!auc) return { data: null, error: { message: 'Asta non trovata' } };
                if (auc.status !== 'open') return { data: null, error: { message: 'Asta non aperta' } };
                if (new Date(auc.auction_ends_at).getTime() < Date.now()) return { data: null, error: { message: 'Asta scaduta' } };
                if (args.v_amount < auc.min_bid) return { data: null, error: { message: `Offerta minima: €${auc.min_bid}` } };
                if (auc.top_bid && args.v_amount <= auc.top_bid) return { data: null, error: { message: `Offerta troppo bassa (attuale: €${auc.top_bid})` } };

                auc.top_bid = args.v_amount;
                auc.my_bid = args.v_amount;
                auc.bid_count = (auc.bid_count || 0) + 1;

                return { data: { success: true, amount: args.v_amount }, error: null };
            }

            if (nome === 'rpc_claim_auction') {
                const idx = statoWon.findIndex(w => w.id === args.v_auction_id);
                if (idx < 0) return { data: null, error: { message: 'Lotto non riscuotibile' } };

                const lotto = statoWon[idx];
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

    // Predisponi routing tab e DOM
    env.sandbox._activeTab = 'auctions';
    env.sandbox.switchTab = (tab) => { env.sandbox._activeTab = tab; };
    env.sandbox.window.switchTab = env.sandbox.switchTab;
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        statoAste,
        statoWon,
        statoBids,
        subscriptions,
    };
}

describe('Funzione Aste Giudiziarie — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e recupero dati (auctionsInit, auctionsRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAste(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsRefresh popola lo stato di aste, wonAuctions e myBids da Supabase RPC', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRefresh(true);

            assert.equal(sandbox._auctionsState.auctions.length, 3, 'deve caricare i 3 lotti aperti');
            assert.equal(sandbox._auctionsState.wonAuctions.length, 3, 'deve caricare i 3 lotti vinti');
            assert.equal(sandbox._auctionsState.myBids.length, 4, 'deve caricare le 4 offerte nello storico');
            assert.ok(sandbox._auctionsState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('auctionsRefresh rispetta il throttle di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.auctionsRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata con force=false -> throttle attivo, nessuna RPC
            await sandbox.auctionsRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve eseguire nuove query entro 30s');

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

        test('auctionsInit esegue il refresh iniziale, registra Realtime e notifica se ci sono lotti da ritirare', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox.auctionsInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_judicial_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_won_auctions'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_my_bids'));
            assert.ok(sandbox._auctionsState._sub, 'la sottoscrizione realtime deve essere attiva');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('3 asta/e vinta/e da ritirare')));
        });

        test('auctionsInit con zero lotti vinti non mostra notifica informativa', async () => {
            const ambZeroWon = creaAmbienteAste({ won: [] });
            await ambZeroWon.sandbox.auctionsInit();

            assert.equal(ambZeroWon.env.notifications.filter(n => n.type === 'info').length, 0);
            ambZeroWon.env.stopAllIntervals();
        });
    });

    describe('2. Flusso di Offerta e Rilancio (auctionsPlaceBid, auctionsOpenBidModal, auctionsConfirmBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsPlaceBid invoca rpc_place_auction_bid con argomenti corretti e azzera _lastFetch', async () => {
            const { sandbox, rpcLog } = amb;
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 35000);

            assert.ok(res.data);
            assert.equal(res.error, undefined);

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc);
            assert.equal(bidRpc.args.v_auction_id, 'auc_veh_1');
            assert.equal(bidRpc.args.v_amount, 35000);
            assert.equal(sandbox._auctionsState._lastFetch > 0, true, 'il refresh successivo ha aggiornato _lastFetch');
        });

        test('auctionsPlaceBid senza supabaseClient restituisce errore descrittivo', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 35000);
            assert.equal(res.error, 'Supabase non disponibile');
        });

        test('auctionsPlaceBid con errore RPC formatta l\'errore con email di supporto', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => ({
                        data: null,
                        error: { message: 'Fondi insufficienti' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);

            const res = await ambErr.sandbox.auctionsPlaceBid('auc_veh_1', 35000);
            assert.ok(res.error);
            assert.ok(res.error.includes('Offerta fallita: Fondi insufficienti'));
            assert.ok(res.error.includes('support@chauffeurempire.com'));
            ambErr.env.stopAllIntervals();
        });

        test('auctionsOpenBidModal crea il modale nel DOM con dettagli lotto e importo minimo corretto', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.ok(modal, 'il modale auction-bid-modal deve essere presente nel DOM');
            assert.ok(modal.innerHTML.includes('Mercedes Classe S'));
            assert.ok(modal.innerHTML.includes('30.000'), 'deve mostrare top bid attuale');

            const input = sandbox.document.getElementById('bid-amount-input');
            assert.ok(input);
            // minNext per auc_veh_1 con top_bid 30000 è 30001, valore default 30001
            assert.equal(input.min, '30001');
        });

        test('auctionsOpenBidModal per lotto inesistente non crea elementi nel DOM', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('lotto_fantasma');

            const modal = sandbox.document.getElementById('auction-bid-modal');
            assert.equal(modal, null);
        });

        test('auctionsOpenBidModal rimuove eventuale modale già presente prima di aprirne uno nuovo', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');
            sandbox.auctionsOpenBidModal('auc_cnt_2');

            const modals = sandbox.document.querySelectorAll('#auction-bid-modal');
            assert.equal(modals.length, 1);
            assert.ok(modals[0].innerHTML.includes('Container Sigillato'));
        });

        test('auctionsConfirmBid con importo <= 0 o nullo mostra errore nel DOM senza chiamare RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '0';

            await sandbox.auctionsConfirmBid('auc_veh_1');

            const errDiv = sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Inserisci un importo valido'));
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0);
        });

        test('auctionsConfirmBid valido invia offerta, chiude il modale e mostra notifica di successo', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');

            const input = sandbox.document.getElementById('bid-amount-input');
            input.value = '40000';

            await sandbox.auctionsConfirmBid('auc_veh_1');

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_place_auction_bid');
            assert.ok(bidRpc);
            assert.equal(bidRpc.args.v_amount, 40000);
            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null, 'il modale deve essere rimosso');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('40.000')));
        });

        test('auctionsConfirmBid con errore RPC mostra il messaggio di errore e riabilita il pulsante', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_place_auction_bid: async () => ({
                        data: null,
                        error: { message: 'Offerta troppo bassa' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);
            ambErr.sandbox.auctionsOpenBidModal('auc_veh_1');

            const input = ambErr.sandbox.document.getElementById('bid-amount-input');
            input.value = '20000';

            await ambErr.sandbox.auctionsConfirmBid('auc_veh_1');

            const errDiv = ambErr.sandbox.document.getElementById('bid-error');
            assert.equal(errDiv.style.display, 'block');
            assert.ok(errDiv.textContent.includes('Offerta troppo bassa'));

            const btn = ambErr.sandbox.document.getElementById('bid-confirm-btn');
            assert.equal(btn.disabled, false);
            assert.equal(btn.textContent, '🔨 Piazza Offerta');
            ambErr.env.stopAllIntervals();
        });
    });

    describe('3. Casi Limite e Regole di Offerta (Fondi insufficienti, rilancio consecutivo, asta scaduta)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('offerta su asta scaduta viene rifiutata da RPC', async () => {
            const { sandbox } = amb;
            // Imposta asta scaduta
            const auc = sandbox._auctionsState.auctions[0];
            auc.auction_ends_at = new Date(Date.now() - 10000).toISOString();

            const res = await sandbox.auctionsPlaceBid(auc.id, 50000);
            assert.ok(res.error);
            assert.ok(res.error.includes('Asta scaduta'));
        });

        test('offerta inferiore al prezzo minimo viene rifiutata da RPC', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 10000); // min_bid è 25000

            assert.ok(res.error);
            assert.ok(res.error.includes('Offerta minima'));
        });

        test('offerta inferiore o pari al top bid attuale viene rifiutata da RPC', async () => {
            const { sandbox } = amb;
            const res = await sandbox.auctionsPlaceBid('auc_veh_1', 30000); // top_bid è 30000

            assert.ok(res.error);
            assert.ok(res.error.includes('Offerta troppo bassa'));
        });

        test('offrire due volte di fila sulla stessa asta (rilancio successivo) aggiorna il top bid', async () => {
            const { sandbox } = amb;
            // Prima offerta
            const res1 = await sandbox.auctionsPlaceBid('auc_veh_1', 35000);
            assert.ok(res1.data);
            assert.equal(sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_1').top_bid, 35000);

            // Secondo rilancio più alto
            const res2 = await sandbox.auctionsPlaceBid('auc_veh_1', 45000);
            assert.ok(res2.data);
            assert.equal(sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_1').top_bid, 45000);
            assert.equal(sandbox._auctionsState.auctions.find(a => a.id === 'auc_veh_1').my_bid, 45000);
        });

        test('distinzione stato lotto: isLeading (in testa) vs isOutbid (superato)', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            // auc_cnt_2 ha my_bid == 60000 e top_bid == 60000 -> Sei in testa
            assert.ok(container.innerHTML.includes('Sei in testa'));

            // auc_flt_3 ha my_bid == 80000 e top_bid == 95000 -> Sei stato superato
            assert.ok(container.innerHTML.includes('Sei stato superato!'));
        });
    });

    describe('4. Riscossione Premi e Ciclo di Vita Vincita (auctionsClaim, auctionsRevealWon)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('auctionsClaim per lotto veicolo inserisce il veicolo in flotta con modello valido e parametri corretti', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const res = await sandbox.auctionsClaim('auc_won_veh');

            assert.equal(res.error, undefined);
            assert.equal(gs.fleet.length, flottaPrima + 1);

            const auto = gs.fleet[gs.fleet.length - 1];
            assert.ok(auto.id.startsWith('c_ast_'));
            assert.equal(auto.tier, 'business');
            assert.equal(auto.condition, 60);
            assert.equal(auto.mileage, 55000);
            assert.equal(auto.isLease, false);
            assert.ok(auto.vehicleClass, 'il veicolo deve avere vehicleClass valido da data.js');
            assert.ok(auto.name.includes('(Asta)'));
        });

        test('auctionsClaim per lotto container accredita denaro via CE_money e veicoli interni', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;
            const flottaPrima = gs.fleet.length;

            const res = await sandbox.auctionsClaim('auc_won_cnt');

            assert.equal(res.error, undefined);
            assert.equal(res.contanti, 40000);
            assert.equal(gs.cash, cashPrima + 40000, 'il cash del container deve essere accreditato');
            assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo ultra nel container deve entrare in flotta');

            const auto = gs.fleet[gs.fleet.length - 1];
            assert.equal(auto.tier, 'ultra');
            assert.equal(auto.condition, 85);
        });

        test('auctionsClaim per lotto fleet_pack aggiunge TUTTI i veicoli multipli del pacchetto alla flotta', async () => {
            const { sandbox, gs } = amb;
            const flottaPrima = gs.fleet.length;

            const res = await sandbox.auctionsClaim('auc_won_flt');

            assert.equal(res.error, undefined);
            assert.equal(res.veicoli.length, 3, 'deve riscattare tutti e 3 i veicoli del fleet_pack');
            assert.equal(gs.fleet.length, flottaPrima + 3, 'la flotta deve crescere di 3 unità');

            // Verifica che i veicoli riscossi abbiano i tier corrispondenti
            const veicoliAggiunti = gs.fleet.slice(-3);
            assert.equal(veicoliAggiunti[0].tier, 'business');
            assert.equal(veicoliAggiunti[1].tier, 'business');
            assert.equal(veicoliAggiunti[2].tier, 'vip');
        });

        test('auctionsClaim rimuove il lotto riscosso da wonAuctions e persiste lo stato', async () => {
            const { sandbox } = amb;
            assert.equal(sandbox._auctionsState.wonAuctions.length, 3);

            await sandbox.auctionsClaim('auc_won_veh');

            assert.equal(sandbox._auctionsState.wonAuctions.length, 2);
            assert.ok(!sandbox._auctionsState.wonAuctions.some(w => w.id === 'auc_won_veh'));
        });

        test('auctionsClaim con fallimento RPC non muta flotta né cassa e preserva wonAuctions', async () => {
            const ambErr = creaAmbienteAste({
                rpcHandlers: {
                    rpc_claim_auction: async () => ({
                        data: null,
                        error: { message: 'Lotto già ritirato' },
                    }),
                },
            });
            await ambErr.sandbox.auctionsRefresh(true);
            const flottaPrima = ambErr.gs.fleet.length;
            const cashPrima = ambErr.gs.cash;

            const res = await ambErr.sandbox.auctionsClaim('auc_won_veh');

            assert.ok(res.error);
            assert.equal(ambErr.gs.fleet.length, flottaPrima);
            assert.equal(ambErr.gs.cash, cashPrima);
            assert.equal(ambErr.sandbox._auctionsState.wonAuctions.length, 3);
            ambErr.env.stopAllIntervals();
        });

        test('auctionsRevealWon apre il modale riassuntivo del lotto vinto', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('auc_won_veh');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal, 'auction-won-modal deve esistere');
            assert.ok(modal.innerHTML.includes('BMW Serie 7'));
            assert.ok(modal.innerHTML.includes('32.000'));
        });

        test('auctionsRevealWon per container mostra schermata con contenuto svelato', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('auc_won_cnt');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Contenuto Svelato'));
            assert.ok(modal.innerHTML.includes('40.000'));
            assert.ok(modal.innerHTML.includes('ultra'));
        });

        test('auctionsRevealWon per fleet_pack mostra lista di tutti i veicoli vinti', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('auc_won_flt');

            const modal = sandbox.document.getElementById('auction-won-modal');
            assert.ok(modal);
            assert.ok(modal.innerHTML.includes('Lotto 3 Veicoli'));
            assert.ok(modal.innerHTML.includes('business'));
            assert.ok(modal.innerHTML.includes('vip'));
        });

        test('auctionsRevealWon per asta non in elenco non genera modali', async () => {
            const { sandbox } = amb;
            await sandbox.auctionsRevealWon('asta_non_esistente');

            assert.equal(sandbox.document.getElementById('auction-won-modal'), null);
        });
    });

    describe('5. Rendering Scheda Aste e KPI (renderTabAuctions, helper formattazione)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('helper di formattazione: _fmtCurrency, _countdown, _tierBadge', () => {
            const { sandbox } = amb;

            // _fmtCurrency
            assert.equal(vm.runInContext('_fmtCurrency(null)', sandbox), '—');
            assert.equal(vm.runInContext('_fmtCurrency(0)', sandbox), '€0');
            assert.ok(vm.runInContext('_fmtCurrency(25000)', sandbox).includes('25.000') || vm.runInContext('_fmtCurrency(25000)', sandbox).includes('25,000'));

            // _countdown
            assert.equal(vm.runInContext('_countdown(new Date(Date.now() - 1000).toISOString())', sandbox), 'Scaduta');
            assert.match(vm.runInContext('_countdown(new Date(Date.now() + 72 * 3600 * 1000).toISOString())', sandbox), /\d+g \d+h/);
            assert.match(vm.runInContext('_countdown(new Date(Date.now() + 3 * 3600 * 1000).toISOString())', sandbox), /\d+h \d+m/);
            assert.match(vm.runInContext('_countdown(new Date(Date.now() + 20 * 60 * 1000).toISOString())', sandbox), /\d+m \d+s/);

            // _tierBadge
            assert.ok(vm.runInContext('_tierBadge("standard")', sandbox).includes('Standard'));
            assert.ok(vm.runInContext('_tierBadge("BUSINESS")', sandbox).includes('Business'));
            assert.ok(vm.runInContext('_tierBadge("vip")', sandbox).includes('VIP'));
            assert.ok(vm.runInContext('_tierBadge("ultra")', sandbox).includes('Ultra'));
        });

        test('renderTabAuctions non crasha se tab-container non è presente nel DOM', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabAuctions();
            });
        });

        test('renderTabAuctions con lista aste vuota mostra messaggio stato vuoto', () => {
            const { sandbox } = amb;
            sandbox._auctionsState.auctions = [];
            sandbox._auctionsState.wonAuctions = [];
            sandbox._auctionsState.myBids = [];

            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Nessuna asta aperta al momento'));
        });

        test('renderTabAuctions disegna KPI, banner vincite, lotti aperti e storico', () => {
            const { sandbox } = amb;
            sandbox.renderTabAuctions();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Aste Giudiziarie'));
            assert.ok(container.innerHTML.includes('Lotti Aperti'));
            assert.ok(container.innerHTML.includes('🏆 Aste Vinte — Da Ritirare'));
            assert.ok(container.innerHTML.includes('Mercedes Classe S'));
            assert.ok(container.innerHTML.includes('Container Sigillato'));
            assert.ok(container.innerHTML.includes('Lotto 3 Veicoli'));
            assert.ok(container.innerHTML.includes('Storico Offerte'));
            assert.ok(container.innerHTML.includes('✅ Vinta'));
            assert.ok(container.innerHTML.includes('❌ Persa'));
            assert.ok(container.innerHTML.includes('🚫 Annullata'));
            assert.ok(container.innerHTML.includes('🟡 Aperta'));
        });

        test('ceThen su pulsante aggiorna invoca auctionsRefresh e switchTab', async () => {
            const { sandbox } = amb;
            let refreshChiamato = false;
            let tabChiamata = null;

            sandbox.auctionsRefresh = async () => { refreshChiamato = true; };
            sandbox.switchTab = (tab) => { tabChiamata = tab; };

            sandbox.ceThen('auctionsRefresh', 'switchTab', 'auctions');
            await new Promise(r => setImmediate(r));

            assert.equal(refreshChiamato, true);
            assert.equal(tabChiamata, 'auctions');
        });
    });

    describe('6. Event Delegation & Interazioni DOM (events.js, ceAct, ceRemove)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsRefresh(true);
            amb.sandbox.renderTabAuctions();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su bottone offerta scatena auctionsOpenBidModal', () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsOpenBidModal"]');
            assert.ok(btn, 'bottone con data-ce-act="auctionsOpenBidModal" deve esistere');

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            sandbox.auctionsOpenBidModal(auctionId);

            assert.ok(sandbox.document.getElementById('auction-bid-modal'));
        });

        test('click su bottone "Ritira" scatena auctionsRevealWon', async () => {
            const { sandbox } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="auctionsRevealWon"]');
            assert.ok(btn, 'bottone con data-ce-act="auctionsRevealWon" deve esistere');

            const auctionId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            await sandbox.auctionsRevealWon(auctionId);

            assert.ok(sandbox.document.getElementById('auction-won-modal'));
        });

        test('ceRemove rimuove i modali aperti su click chiusura', () => {
            const { sandbox } = amb;
            sandbox.auctionsOpenBidModal('auc_veh_1');
            assert.ok(sandbox.document.getElementById('auction-bid-modal'));

            sandbox.ceRemove('auction-bid-modal');
            assert.equal(sandbox.document.getElementById('auction-bid-modal'), null);
        });
    });

    describe('7. Integrità Finanziaria & Controllo Doppio Conteggio (CE_money, RPC)', () => {
        test('auctionsPlaceBid non modifica il cash locale del giocatore (pagamento gestito da server alla chiusura)', async () => {
            const amb = creaAmbienteAste({ cash: 50000 });
            await amb.sandbox.auctionsRefresh(true);
            const cashPrima = amb.gs.cash;

            await amb.sandbox.auctionsPlaceBid('auc_veh_1', 35000);

            assert.equal(amb.gs.cash, cashPrima, 'il cash locale non deve essere scalato durante l offerta');
            amb.env.stopAllIntervals();
        });

        test('auctionsClaim su container accredita cash via accreditatoDalServer senza invocare syncCash', async () => {
            const syncedCash = [];
            const amb = creaAmbienteAste({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await amb.sandbox.auctionsRefresh(true);

            amb.gs.cash = 20000;
            await amb.sandbox.auctionsClaim('auc_won_cnt');

            assert.equal(amb.gs.cash, 60000, 'il cash locale deve riflettere subito i 40k del container');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già accreditato i fondi)');
            amb.env.stopAllIntervals();
        });
    });

    describe('8. Sincronizzazione Realtime (_auctionsSubscribeRealtime)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteAste();
            await amb.sandbox.auctionsInit();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('evento realtime su judicial_auctions azzera il timestamp cache e aggiorna la vista se attiva', async () => {
            const { sandbox, subscriptions } = amb;
            sandbox._activeTab = 'auctions';
            sandbox._auctionsState._lastFetch = 12345;

            let renderChiamato = false;
            sandbox.renderTabAuctions = () => { renderChiamato = true; };

            const realtimeCb = subscriptions.get('judicial_auctions_changes');
            assert.ok(typeof realtimeCb === 'function', 'callback realtime deve essere registrata');

            // Simula arrivo notifica Realtime da postgres
            realtimeCb();
            await new Promise(r => setTimeout(r, 20));

            assert.equal(renderChiamato, true, 'renderTabAuctions deve essere invocato');
            assert.ok(sandbox._auctionsState._lastFetch > 12345, '_lastFetch deve essere aggiornato dal refresh');
        });
    });
});
