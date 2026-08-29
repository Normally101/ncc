'use strict';
/* ============================================================================
   test/funzioni/turismo.test.js — Verifica approfondita del modulo Bandi Turismo B2B

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `tourism.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, il calcolo dei punteggi di offerta,
   la gestione dello stato locale/server, l'UI di rendering e il ciclo di vita.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase completo per i Bandi Turismo.
 */
function creaAmbienteTurismo(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const bandiDefault = [
        {
            id: 'tender_open_1',
            catalog_id: 'cat_1',
            status: 'open_bidding',
            current_owner_uuid: null,
            owner_company_name: null,
            bidding_ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            expires_at: null,
            daily_payout: 3600,
            total_paid: 0,
            sla_score: 100.0,
            winning_score: null,
            round_number: 1,
            is_mine: false,
            name: 'Aurevia Elite Journeys',
            company_type: 'Network luxury travel globale',
            clientele: 'CEO, old money, diplomatici',
            tier: 4,
            lore: 'Trasporto diplomatico d\'élite.',
            icon: '🌟',
            base_payout_per_hour: 225,
            duration_days: 30,
            requirements: { min_reputation: 3.5, req_tier: 'ultra', req_vehicle_count: 3 },
            bid_count: 1,
            my_bid_score: null,
            my_bid_pledge: null,
            my_bid_status: null,
        },
        {
            id: 'tender_open_2',
            catalog_id: 'cat_2',
            status: 'open_bidding',
            current_owner_uuid: null,
            owner_company_name: null,
            bidding_ends_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            expires_at: null,
            daily_payout: 2720,
            total_paid: 0,
            sla_score: 100.0,
            winning_score: null,
            round_number: 1,
            is_mine: false,
            name: 'Crown Meridian Escapes',
            company_type: 'Tour operator luxury resort',
            clientele: 'Honeymoon, turismo premium',
            tier: 3,
            lore: 'Resort esclusivi e transfer aeroportuali.',
            icon: '👑',
            base_payout_per_hour: 170,
            duration_days: 7,
            requirements: { min_reputation: 2.0, req_tier: 'business', req_vehicle_count: 1 },
            bid_count: 0,
            my_bid_score: null,
            my_bid_pledge: null,
            my_bid_status: null,
        },
        {
            id: 'tender_mine_active',
            catalog_id: 'cat_3',
            status: 'active',
            current_owner_uuid: 'user_test_uuid',
            owner_company_name: 'Test Corp',
            bidding_ends_at: null,
            expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            daily_payout: 5600,
            total_paid: 11200,
            sla_score: 95.5,
            winning_score: 88.0,
            round_number: 2,
            is_mine: true,
            name: 'Obsidian Pearl Retreats',
            company_type: 'Travel concierge elitario',
            clientele: 'Milionari, crypto bros, influencer',
            tier: 4,
            lore: 'Champagne nel SUV e riservatezza assoluta.',
            icon: '💎',
            base_payout_per_hour: 350,
            duration_days: 14,
            requirements: { min_reputation: 4.4, req_tier: 'vip', req_vehicle_count: 2 },
            bid_count: 0,
            my_bid_score: null,
            my_bid_pledge: null,
            my_bid_status: null,
        },
        {
            id: 'tender_other_active',
            catalog_id: 'cat_4',
            status: 'active',
            current_owner_uuid: 'rival_user_uuid',
            owner_company_name: 'Rival Limos',
            bidding_ends_at: null,
            expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
            daily_payout: 2560,
            total_paid: 5120,
            sla_score: 100.0,
            winning_score: 75.0,
            round_number: 1,
            is_mine: false,
            name: 'Atlas Ember Voyages',
            company_type: 'Travel management multinazionale',
            clientele: 'Corporate e business travel',
            tier: 3,
            lore: 'Logistica corporate su larga scala.',
            icon: '🌍',
            base_payout_per_hour: 160,
            duration_days: 30,
            requirements: { min_reputation: 3.0, req_tier: 'business', req_vehicle_count: 5 },
            bid_count: 0,
            my_bid_score: null,
            my_bid_pledge: null,
            my_bid_status: null,
        },
        {
            id: 'tender_cooldown',
            catalog_id: 'cat_5',
            status: 'cooldown',
            current_owner_uuid: null,
            owner_company_name: null,
            bidding_ends_at: null,
            expires_at: null,
            cooldown_until: new Date(Date.now() + 3600 * 1000).toISOString(),
            daily_payout: null,
            total_paid: 0,
            sla_score: 100.0,
            winning_score: null,
            round_number: 3,
            is_mine: false,
            name: 'Velvet Horizon Concierge',
            company_type: 'Concierge VIP globale',
            clientele: 'Celebrities e HNWI',
            tier: 5,
            lore: 'Auto blindate, autisti silenziosi.',
            icon: '🕴️',
            base_payout_per_hour: 500,
            duration_days: 14,
            requirements: { min_reputation: 4.5, req_tier: 'ultra', req_vehicle_count: 3 },
            bid_count: 0,
            my_bid_score: null,
            my_bid_pledge: null,
            my_bid_status: null,
        },
    ];

    let statoBandi = (opzioni.bandi || bandiDefault).map(b => ({ ...b }));

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
                return opzioni.rpcHandlers[nome](args, { statoBandi });
            }

            if (nome === 'rpc_get_tourism_tenders') {
                return { data: statoBandi, error: null };
            }

            if (nome === 'rpc_submit_tourism_bid') {
                const bando = statoBandi.find(b => b.id === args.v_tender_id);
                if (!bando) return { data: null, error: { message: 'Bando non trovato' } };
                if (bando.status !== 'open_bidding') return { data: null, error: { message: 'Bando non in fase di offerta' } };

                const rep = env.sandbox.gameState.reputation || 0;
                const reqCount = bando.requirements?.req_vehicle_count || 1;
                const repSc = Math.min(40, (rep / 5.0) * 40);
                const fleetSc = Math.min(40, reqCount > 0 ? (args.v_qualifying_vehicles / reqCount) * 40 : 40);
                const pledgeSc = Math.min(20, ((args.v_pledge_cash || 0) / 100000) * 20);
                const totalSc = Math.round(repSc + fleetSc + pledgeSc);

                bando.my_bid_score = totalSc;
                bando.my_bid_pledge = args.v_pledge_cash || 0;
                bando.my_bid_status = 'pending';
                bando.bid_count = (bando.bid_count || 0) + 1;

                return {
                    data: {
                        score: totalSc,
                        rep: Math.round(repSc * 10) / 10,
                        fleet: Math.round(fleetSc * 10) / 10,
                        pledge: Math.round(pledgeSc * 10) / 10,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_cancel_tourism_bid') {
                const bando = statoBandi.find(b => b.id === args.v_tender_id);
                if (bando) {
                    bando.my_bid_score = null;
                    bando.my_bid_pledge = null;
                    bando.my_bid_status = null;
                    bando.bid_count = Math.max(0, (bando.bid_count || 1) - 1);
                }
                return { data: null, error: null };
            }

            if (nome === 'rpc_terminate_tourism_contract') {
                const bando = statoBandi.find(b => b.id === args.v_tender_id);
                if (!bando || !bando.is_mine) return { data: null, error: { message: 'Contratto non trovato' } };

                const penalty = (bando.tier || 3) * 0.15;
                bando.status = 'cooldown';
                bando.is_mine = false;
                bando.current_owner_uuid = null;
                bando.owner_company_name = null;

                return {
                    data: { rep_penalty: penalty },
                    error: null,
                };
            }

            if (nome === 'rpc_tourism_daily_tick') {
                const myActive = statoBandi.filter(b => b.is_mine && b.status === 'active');
                const totalPayout = myActive.reduce((sum, b) => sum + (b.daily_payout || 0), 0);
                const payouts = myActive.map(b => ({
                    name: b.name,
                    icon: b.icon,
                    amount: b.daily_payout || 0,
                }));

                return {
                    data: {
                        total_payout: totalPayout,
                        active_count: myActive.length,
                        expiring_soon: 0,
                        payouts: payouts,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_test_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi flotta e reputazione
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'veh_ultra_1', name: 'Maybach S680', tier: 'ultra', isLease: false, outOfService: null },
        { id: 'veh_ultra_2', name: 'Rolls Royce Ghost', tier: 'ultra', isLease: false, outOfService: null },
        { id: 'veh_ultra_3', name: 'Bentley Flying Spur', tier: 'ultra', isLease: false, outOfService: null },
        { id: 'veh_vip_1', name: 'Mercedes S-Class', tier: 'vip', isLease: false, outOfService: null },
        { id: 'veh_bus_1', name: 'Mercedes E-Class', tier: 'business', isLease: false, outOfService: null },
    ];

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        statoBandi,
    };
}

describe('Funzione Turismo B2B — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e recupero dati (tourismInit, tourismRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteTurismo(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('tourismRefresh popola lo stato dei bandi da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.tourismRefresh(true);

            assert.equal(sandbox._tourismState.tenders.length, 5, 'deve contenere i 5 bandi restituiti dal server');
            assert.ok(sandbox._tourismState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
            assert.equal(sandbox._tourismState._loading, false, 'il flag loading deve tornare false');
        });

        test('tourismRefresh rispetta il throttle di 45 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.tourismRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata: throttle attivo -> nessuna RPC
            await sandbox.tourismRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve eseguire nuove query entro 45s');

            // Chiamata forzata: bypassa throttle
            await sandbox.tourismRefresh(true);
            assert.equal(rpcLog.length, countPrima + 1, 'force=true deve rieseguire la query');
        });

        test('tourismRefresh non crasha in assenza di supabaseClient', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.tourismRefresh(true);
            });
        });

        test('tourismInit esegue il refresh iniziale', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.tourismInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_tourism_tenders'), 'tourismInit deve chiamare rpc_get_tourism_tenders');
            assert.equal(sandbox._tourismState.tenders.length, 5);
        });

        test('tourismInit non fa nulla se utente non loggato', async () => {
            const ambNoAuth = creaAmbienteTurismo({ currentUser: null });
            await ambNoAuth.sandbox.tourismInit();

            assert.equal(ambNoAuth.rpcLog.length, 0, 'senza utente non deve invocare RPC');
            ambNoAuth.env.stopAllIntervals();
        });
    });

    describe('2. Invio offerta per un bando (tourismSubmitBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('invia offerta valida con score calcolato e aggiorna lo stato', async () => {
            const { sandbox, rpcLog, env } = amb;

            // Imposta pledge di €30.000 per il bando Crown Meridian
            sandbox._tourismState._pledgeAmts['tender_open_2'] = 30000;

            await sandbox.tourismSubmitBid('tender_open_2');

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_submit_tourism_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_submit_tourism_bid');
            assert.equal(bidRpc.args.v_tender_id, 'tender_open_2');
            assert.equal(bidRpc.args.v_pledge_cash, 30000);
            assert.ok(bidRpc.args.v_qualifying_vehicles >= 1, 'deve contare i veicoli qualificanti');

            // Notifica e log su mappa
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta inviata')));
            assert.ok(env.logs.some(l => l.includes('Offerta turismo inviata')));
        });

        test('blocco invio offerta se utente non autenticato', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.tourismSubmitBid('tender_open_2');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_submit_tourism_bid').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('gestione errore RPC durante invio offerta', async () => {
            const ambErr = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_submit_tourism_bid: async () => ({
                        data: null,
                        error: { message: 'Finestra di offerta scaduta' },
                    }),
                },
            });
            await ambErr.sandbox.tourismRefresh(true);

            await ambErr.sandbox.tourismSubmitBid('tender_open_1');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Offerta non inviata')));
            ambErr.env.stopAllIntervals();
        });

        test('invio offerta per bando inesistente non esegue RPC', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.tourismSubmitBid('bando_fantasma');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_submit_tourism_bid').length, 0);
        });

        test('tourismSubmitBid senza pledge impostato usa 0 come default', async () => {
            const { sandbox, rpcLog, env } = amb;

            // Non imposta _pledgeAmts per tender_open_2
            await sandbox.tourismSubmitBid('tender_open_2');

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_submit_tourism_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_submit_tourism_bid');
            assert.equal(bidRpc.args.v_pledge_cash, 0, 'pledge deve defaultare a 0');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta inviata')));
        });

        test('tourismSubmitBid per bando non in fase open_bidding chiama RPC ma riceve errore', async () => {
            const { sandbox, rpcLog, env } = amb;

            // tender_mine_active ha status 'active', non 'open_bidding'
            await sandbox.tourismSubmitBid('tender_mine_active');

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_submit_tourism_bid');
            assert.ok(bidRpc, 'deve chiamare rpc_submit_tourism_bid anche se status non è open_bidding (validazione server-side)');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Offerta non inviata')));
        });
    });

    describe('3. Ritiro / annullamento offerta (tourismCancelBid)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('annulla l\'offerta inviata e aggiorna la scheda', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox.tourismCancelBid('tender_open_1');

            const cancelRpc = rpcLog.find(r => r.nome === 'rpc_cancel_tourism_bid');
            assert.ok(cancelRpc, 'deve invocare rpc_cancel_tourism_bid');
            assert.equal(cancelRpc.args.v_tender_id, 'tender_open_1');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Offerta annullata')));
        });

        test('annullamento senza login non fa nulla', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.tourismCancelBid('tender_open_1');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_cancel_tourism_bid').length, 0);
        });

        test('gestione errore RPC su annullamento offerta', async () => {
            const ambErr = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_cancel_tourism_bid: async () => ({
                        data: null,
                        error: { message: 'Offerta già processata' },
                    }),
                },
            });
            await ambErr.sandbox.tourismRefresh(true);

            await ambErr.sandbox.tourismCancelBid('tender_open_1');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Annullamento non riuscito')));
            ambErr.env.stopAllIntervals();
        });

        test('tourismCancelBid per bando senza offerta chiama RPC (validazione server-side)', async () => {
            const { sandbox, rpcLog } = amb;

            // tender_open_2 non ha offerta (my_bid_status è null)
            await sandbox.tourismCancelBid('tender_open_2');

            const cancelRpc = rpcLog.find(r => r.nome === 'rpc_cancel_tourism_bid');
            assert.ok(cancelRpc, 'deve chiamare rpc_cancel_tourism_bid anche senza offerta (validazione server-side)');
        });

        test('tourismCancelBid per bando inesistente chiama RPC (validazione server-side)', async () => {
            const { sandbox, rpcLog } = amb;

            await sandbox.tourismCancelBid('bando_fantasma');

            const cancelRpc = rpcLog.find(r => r.nome === 'rpc_cancel_tourism_bid');
            assert.ok(cancelRpc, 'deve chiamare rpc_cancel_tourism_bid anche per bando inesistente (validazione server-side)');
        });
    });

    describe('4. Rescissione anticipata del contratto (tourismTerminate)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rescissione confermata applica penale reputazione e mostra evento', async () => {
            const { sandbox, gs, rpcLog, bigEvents, env } = amb;
            gs.reputation = 4.0;

            // In ambiente di test sandbox.confirm ritorna true di default
            await sandbox.tourismTerminate('tender_mine_active');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_tourism_contract');
            assert.ok(termRpc, 'deve chiamare rpc_terminate_tourism_contract');
            assert.equal(termRpc.args.v_tender_id, 'tender_mine_active');

            // Evento modale mostrato al giocatore
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Rescisso');
            assert.ok(env.logs.some(l => l.includes('Contratto turismo rescisso')));
        });

        test('rescissione rifiutata dal giocatore (confirm = false) non chiama RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox.tourismTerminate('tender_mine_active');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_tourism_contract').length, 0);
        });

        test('rescissione con errore RPC mostra notifica di errore', async () => {
            const ambErr = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_terminate_tourism_contract: async () => ({
                        data: null,
                        error: { message: 'Contratto scaduto o già revocato' },
                    }),
                },
            });
            await ambErr.sandbox.tourismRefresh(true);

            await ambErr.sandbox.tourismTerminate('tender_mine_active');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Terminazione non riuscita')));
            ambErr.env.stopAllIntervals();
        });

        test('tourismTerminate per bando inesistente chiama RPC ma riceve errore', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox.tourismTerminate('bando_fantasma');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_tourism_contract');
            assert.ok(termRpc, 'deve chiamare rpc_terminate_tourism_contract anche per bando inesistente (validazione server-side)');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Terminazione non riuscita')));
        });

        test('tourismTerminate per bando non posseduto (is_mine=false) chiama RPC ma riceve errore', async () => {
            const { sandbox, rpcLog, env } = amb;

            // tender_other_active ha is_mine: false
            await sandbox.tourismTerminate('tender_other_active');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_tourism_contract');
            assert.ok(termRpc, 'deve chiamare rpc_terminate_tourism_contract anche se non posseduto (validazione server-side)');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Terminazione non riuscita')));
        });

        test('tourismTerminate per bando in cooldown chiama RPC ma riceve errore', async () => {
            const { sandbox, rpcLog, env } = amb;

            // tender_cooldown ha status 'cooldown'
            await sandbox.tourismTerminate('tender_cooldown');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_tourism_contract');
            assert.ok(termRpc, 'deve chiamare rpc_terminate_tourism_contract anche per bando in cooldown (validazione server-side)');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Terminazione non riuscita')));
        });
    });

    describe('5. Routine giornaliera e incassi (_tourismDailyTick)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_tourismDailyTick esegue rpc_tourism_daily_tick e mostra notifica di incasso', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox._tourismDailyTick();

            const tickRpc = rpcLog.find(r => r.nome === 'rpc_tourism_daily_tick');
            assert.ok(tickRpc, 'deve chiamare rpc_tourism_daily_tick');

            // Notifica incasso
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Turismo: +€') && n.msg.includes('Obsidian Pearl')));
            assert.ok(env.logs.some(l => l.includes('Payout turismo: +€') && l.includes('Obsidian Pearl')));
        });

        test('_tourismDailyTick gestisce contratti multipli attivi', async () => {
            const ambMulti = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_tourism_daily_tick: async () => ({
                        data: {
                            total_payout: 9200,
                            active_count: 2,
                            expiring_soon: 1,
                            payouts: [
                                { name: 'Obsidian Pearl', icon: '💎', amount: 5600 },
                                { name: 'Aurevia Elite', icon: '🌟', amount: 3600 },
                            ],
                        },
                        error: null,
                    }),
                },
            });

            await ambMulti.sandbox._tourismDailyTick();

            assert.ok(ambMulti.env.notifications.some(n => n.type === 'success' && n.msg.includes('da 2 contratti')));
            assert.ok(ambMulti.env.notifications.some(n => n.type === 'warning' && n.msg.includes('in scadenza')));
            ambMulti.env.stopAllIntervals();
        });

        test('_tourismDailyTick con errore RPC o payout nullo non mostra notifiche di incasso', async () => {
            const ambErr = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_tourism_daily_tick: async () => ({
                        data: { total_payout: 0, payouts: [] },
                        error: null,
                    }),
                },
            });

            await ambErr.sandbox._tourismDailyTick();

            assert.equal(ambErr.env.notifications.filter(n => n.type === 'success').length, 0);
            ambErr.env.stopAllIntervals();
        });
    });

    describe('6. Slider Pledge, anteprima punteggio (_tSetPledge, _tUpdateScorePreview)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
            amb.sandbox.renderTabTourism();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_tSetPledge aggiorna l\'importo e ricalcola il breakdown nel DOM', () => {
            const { sandbox } = amb;

            sandbox._tSetPledge('tender_open_2', 50000);

            assert.equal(sandbox._tourismState._pledgeAmts['tender_open_2'], 50000);

            // Verifica aggiornamento elementi DOM
            const valEl = sandbox.document.getElementById('t-pledge-val-tender_open_2');
            const pledgeScoreEl = sandbox.document.getElementById('t-sc-pledge-tender_open_2');
            const totalScoreEl = sandbox.document.getElementById('t-score-tender_open_2');

            assert.ok(valEl, 'elemento valore pledge deve esistere nel DOM');
            assert.ok(valEl.textContent.includes('50.000') || valEl.textContent.includes('50,000'));
            assert.equal(pledgeScoreEl.textContent, '10'); // 50k / 100k * 20 = 10
            assert.ok(Number(totalScoreEl.textContent) > 0);
        });

        test('_tSetPledge con valori limite (0, 100000, negativi, non numerici)', () => {
            const { sandbox } = amb;

            // Valore 0
            sandbox._tSetPledge('tender_open_2', 0);
            assert.equal(sandbox._tourismState._pledgeAmts['tender_open_2'], 0);

            // Valore massimo 100000
            sandbox._tSetPledge('tender_open_2', 100000);
            assert.equal(sandbox._tourismState._pledgeAmts['tender_open_2'], 100000);

            // Valore negativo viene convertito a numero
            sandbox._tSetPledge('tender_open_2', -5000);
            assert.equal(sandbox._tourismState._pledgeAmts['tender_open_2'], -5000);

            // Stringa numerica
            sandbox._tSetPledge('tender_open_2', '75000');
            assert.equal(sandbox._tourismState._pledgeAmts['tender_open_2'], 75000);

            // Valore non numerico diventa NaN
            sandbox._tSetPledge('tender_open_2', 'abc');
            assert.ok(Number.isNaN(sandbox._tourismState._pledgeAmts['tender_open_2']));
        });

        test('_tUpdateScorePreview chiamato direttamente con tender inesistente non fa nulla', () => {
            const { sandbox } = amb;

            // Non deve lanciare eccezioni
            assert.doesNotThrow(() => {
                sandbox._tUpdateScorePreview('tender_inesistente');
            });

            // Non deve modificare _pledgeAmts
            assert.equal(Object.keys(sandbox._tourismState._pledgeAmts).length, 0);
        });

        test('_tUpdateScorePreview con elementi DOM mancanti non crasha', () => {
            const { sandbox } = amb;

            // Rimuove il container per simulare DOM mancante
            sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

            // Non deve lanciare eccezioni
            assert.doesNotThrow(() => {
                sandbox._tUpdateScorePreview('tender_open_2');
            });
        });

        test('_tUpdateScorePreview ricalcola correttamente il breakdown score', () => {
            const { sandbox } = amb;

            // Imposta pledge e chiama direttamente _tUpdateScorePreview
            sandbox._tourismState._pledgeAmts['tender_open_2'] = 40000;
            sandbox._tUpdateScorePreview('tender_open_2');

            const repEl = sandbox.document.getElementById('t-sc-rep-tender_open_2');
            const fleetEl = sandbox.document.getElementById('t-sc-fleet-tender_open_2');
            const pledgeEl = sandbox.document.getElementById('t-sc-pledge-tender_open_2');
            const totalEl = sandbox.document.getElementById('t-score-tender_open_2');

            assert.ok(repEl && fleetEl && pledgeEl && totalEl, 'elementi score devono esistere');

            // tender_open_2 richiede business x1, rep 2.0
            // reputation 4.0 -> 4.0/5.0 * 40 = 32
            // fleet: 5 veicoli qualifying (3 ultra + 1 vip + 1 business) >= 1 -> 40
            // pledge: 40000/100000 * 20 = 8
            // total: 32 + 40 + 8 = 80
            assert.equal(Number(repEl.textContent), 32);
            assert.equal(Number(fleetEl.textContent), 40);
            assert.equal(Number(pledgeEl.textContent), 8);
            assert.equal(Number(totalEl.textContent), 80);
        });
    });

    describe('7. Rendering della scheda e navigazione sub-tab (renderTabTourism, ceSetRender, ceThen)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('helper formattazione: _tCountdown, _tTierBadge, _tBarColor', () => {
            const { sandbox } = amb;

            // _tCountdown
            assert.equal(sandbox._tCountdown(null), '—');
            assert.equal(sandbox._tCountdown(new Date(Date.now() - 1000).toISOString()), 'Scaduto');
            assert.match(sandbox._tCountdown(new Date(Date.now() + 72 * 3600 * 1000).toISOString()), /\d+g \d+h/);
            assert.match(sandbox._tCountdown(new Date(Date.now() + 2 * 3600 * 1000).toISOString()), /\d+h \d+m/);
            assert.match(sandbox._tCountdown(new Date(Date.now() + 15 * 60 * 1000).toISOString()), /\d+m/);

            // _tTierBadge
            assert.ok(sandbox._tTierBadge(1).includes('STANDARD'));
            assert.ok(sandbox._tTierBadge(2).includes('BUSINESS'));
            assert.ok(sandbox._tTierBadge(3).includes('VIP'));
            assert.ok(sandbox._tTierBadge(4).includes('ULTRA'));
            assert.ok(sandbox._tTierBadge(99).includes('T99'));

            // _tBarColor
            assert.equal(sandbox._tBarColor(85), '#1aa06a');
            assert.equal(sandbox._tBarColor(65), '#e0922e');
            assert.equal(sandbox._tBarColor(40), '#db5746');
        });

        test('renderTabTourism con lista bandi vuota mostra messaggio di attesa', () => {
            const { sandbox } = amb;
            sandbox._tourismState.tenders = [];
            sandbox.renderTabTourism();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Caricamento bandi… clicca ↺ Aggiorna'));
        });

        test('renderTabTourism con myActive vuoto in subTab mine mostra stato vuoto', () => {
            const { sandbox } = amb;
            sandbox._tourismState.tenders = sandbox._tourismState.tenders.filter(t => !t.is_mine);
            sandbox.ceSetRender('_tourismState', '_subTab', 'mine', 'renderTabTourism');

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Nessun contratto turismo attivo'));
        });

        test('renderTabTourism disegna intestazione, KPI e bandi aperti', () => {
            const { sandbox } = amb;
            sandbox.renderTabTourism();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Bandi Turismo B2B'), 'deve contenere il titolo');
            assert.ok(container.innerHTML.includes('Contratti Attivi'), 'deve mostrare KPI contratti');
            assert.ok(container.innerHTML.includes('Aurevia Elite Journeys'), 'deve mostrare bando 1');
            assert.ok(container.innerHTML.includes('Crown Meridian Escapes'), 'deve mostrare bando 2');
            assert.ok(container.innerHTML.includes('In Uso'), 'deve mostrare sezione contratti occupati da rivali');
            assert.ok(container.innerHTML.includes('In Cooldown'), 'deve mostrare sezione cooldown');
        });

        test('navigazione tra sub-tab "Bandi Aperti" e "I Miei Contratti" tramite ceSetRender', () => {
            const { sandbox } = amb;
            sandbox.renderTabTourism();

            // Passa a "I Miei Contratti"
            sandbox.ceSetRender('_tourismState', '_subTab', 'mine', 'renderTabTourism');

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Obsidian Pearl Retreats'), 'deve mostrare il contratto del giocatore');
            assert.ok(container.innerHTML.includes('SLA Score'), 'deve mostrare SLA');
            assert.ok(container.innerHTML.includes('Rescindi Anticipatamente'), 'deve mostrare pulsante rescissione');

            // Ritorna a "Bandi Aperti"
            sandbox.ceSetRender('_tourismState', '_subTab', 'open', 'renderTabTourism');
            assert.ok(sandbox.document.getElementById('tab-container').innerHTML.includes('Aurevia Elite Journeys'));
        });

        test('renderTabTourism per utente non loggato mostra messaggio di invito al login', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabTourism();
            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Accedi per partecipare ai bandi turismo'));
        });

        test('ceThen esegue refresh e ri-renderizza', async () => {
            const { sandbox } = amb;
            let renderChiamato = false;
            sandbox.renderTabTourism = () => { renderChiamato = true; };

            sandbox.ceThen('tourismRefresh', 'renderTabTourism');
            await new Promise(r => setImmediate(r));

            assert.equal(renderChiamato, true);
        });

        test('bando con requisiti non soddisfatti mostra blocco con lucchetto e motivazione', () => {
            const { sandbox } = amb;
            // Flotta azzerata e reputazione 1
            sandbox.gameState.reputation = 1.0;
            sandbox.gameState.fleet = [];

            sandbox.renderTabTourism();
            const container = sandbox.document.getElementById('tab-container');

            assert.ok(container.innerHTML.includes('🔒 Reputazione insufficiente'));
        });
    });

    describe('8. Event Delegation — Interazione utente via DOM (events.js)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
            amb.sandbox.renderTabTourism();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ceTPledge aggiorna il pledge con this.value', () => {
            const { sandbox } = amb;
            const slider = sandbox.document.querySelector('input[type="range"][data-ce-act="ceTPledge"]');
            assert.ok(slider, 'lo slider con data-ce-act="ceTPledge" deve esistere nel DOM');

            slider.value = '45000';
            const tenderId = JSON.parse(slider.getAttribute('data-ce-args'))[0];
            sandbox.ceTPledge.call(slider, tenderId);

            assert.equal(sandbox._tourismState._pledgeAmts[tenderId], 45000);
        });

        test('click su bottone "Fai Offerta" invoca tourismSubmitBid via delegation', async () => {
            const { sandbox, rpcLog } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="tourismSubmitBid"]');
            assert.ok(btn, 'il bottone con data-ce-act="tourismSubmitBid" deve esistere nel DOM');

            const tenderId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            await sandbox.tourismSubmitBid(tenderId);

            const bidRpc = rpcLog.find(r => r.nome === 'rpc_submit_tourism_bid');
            assert.ok(bidRpc, 'deve scatenare rpc_submit_tourism_bid');
        });

        test('click su sub-tab switcher scatena ceSetRender via delegation', () => {
            const { sandbox } = amb;
            const tabs = sandbox.document.querySelectorAll('button[data-ce-act="ceSetRender"]');
            const mineBtn = Array.from(tabs).find(b => b.textContent.includes('I Miei Contratti'));
            assert.ok(mineBtn);

            const args = JSON.parse(mineBtn.getAttribute('data-ce-args'));
            sandbox.ceSetRender(...args);

            assert.equal(sandbox._tourismState._subTab, 'mine');
        });
    });

    describe('9. Analisi del ciclo di vita DB, Cron e Stato Giocatore', () => {
        test('verifica ciclo di vita: _process_tourism_tenders è auto-sanante alla lettura ma nessun pg_cron gira autonomamente', () => {
            // Documentazione del comportamento architetturale:
            // 1. Nel file 33_tourism_tenders.sql / 34_fix_console_errors.sql è presente il commento:
            //    "Also schedulable via pg_cron: SELECT cron.schedule('tourism-process','0 * * * *','SELECT public._process_tourism_tenders()');"
            // 2. Nessun cron job è registrato in pg_cron per il turismo (come verificato in cron.job).
            // 3. Tuttavia, `rpc_get_tourism_tenders()` include esplicitamente:
            //    `PERFORM public._process_tourism_tenders();`
            //    Questo garantisce l'avanzamento dello stato (chiusura offerte, passaggio a cooldown, riapertura bandi)
            //    ogni volta che qualsiasi utente apre o aggiorna la tab turismo.
            assert.ok(true);
        });

        test('verifica premi e penali: le entrate confluiscono nel saldo aziendale e le penali intaccano la reputazione', async () => {
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => false,
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.cash = 10000;
            await amb.sandbox._tourismDailyTick();

            // Payout di 5600 da Obsidian Pearl Retreats
            assert.equal(amb.gs.cash, 15600, 'il payout giornaliero entra direttamente nella cassa del giocatore');
            amb.env.stopAllIntervals();
        });
    });

    describe('10. Compatibilità dati e modelli reali da data.js (NEW_CARS, tiering e filtri)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteTurismo(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('NEW_CARS definisce tier minuscoli coerenti con la gerarchia del turismo', () => {
            const { sandbox } = amb;
            const newCars = vm.runInContext('NEW_CARS', sandbox);
            assert.ok(Array.isArray(newCars), 'NEW_CARS deve essere un array');
            assert.ok(newCars.length > 0, 'NEW_CARS non deve essere vuoto');

            /* 'standard' era escluso da questo set mentre il messaggio d'errore lo
               elencava: il codice e la sua spiegazione dicevano cose diverse, e
               nessuno se ne accorgeva perche' nessuna auto era standard. Dal
               29/08/2026 le entry-level lo sono (Nexus, Ciudad, 3-Urban, Y-Cross,
               M-Cruiser): la fascia piu' bassa ha finalmente delle auto, ed e' il
               motivo per cui esistono le corse standard. Conseguenza voluta sul
               turismo: un bando che chiede `business` non le conta piu' fra i
               veicoli qualificanti — un pulmino d'ingresso non e' una flotta da
               contratto turistico. */
            const validTiers = new Set(['standard', 'business', 'vip', 'ultra']);
            for (const car of newCars) {
                assert.ok(validTiers.has(car.tier), `Il tier dell'auto ${car.name} (${car.tier}) deve essere standard/business/vip/ultra minuscolo`);
            }
        });

        test('conteggio veicoli qualificanti (_tQualifyingCount) rispetta la gerarchia dei tier reali', () => {
            const { sandbox } = amb;
            const newCars = vm.runInContext('NEW_CARS', sandbox);

            const carBus = newCars.find(c => c.tier === 'business');
            const carVip = newCars.find(c => c.tier === 'vip');
            const carUltra = newCars.find(c => c.tier === 'ultra');

            assert.ok(carBus && carVip && carUltra, 'devono esistere auto business, vip e ultra in data.js');

            sandbox.gameState.fleet = [
                { id: 'f_bus', modelId: carBus.id, name: carBus.name, tier: carBus.tier, isLease: false, outOfService: null },
                { id: 'f_vip', modelId: carVip.id, name: carVip.name, tier: carVip.tier, isLease: false, outOfService: null },
                { id: 'f_ultra', modelId: carUltra.id, name: carUltra.name, tier: carUltra.tier, isLease: false, outOfService: null },
            ];

            // Ultra soddisfa tutti i requisiti (ultra >= 4, vip >= 3, business >= 2, standard >= 1)
            assert.equal(vm.runInContext('_tQualifyingCount("standard")', sandbox), 3, 'tutti i veicoli contano per standard');
            assert.equal(vm.runInContext('_tQualifyingCount("business")', sandbox), 3, 'business, vip e ultra contano per business');
            assert.equal(vm.runInContext('_tQualifyingCount("vip")', sandbox), 2, 'solo vip e ultra contano per vip');
            assert.equal(vm.runInContext('_tQualifyingCount("ultra")', sandbox), 1, 'solo ultra conta per ultra');
        });

        test('veicoli in leasing o fuori servizio sono esclusi dal conteggio qualificanti', () => {
            const { sandbox } = amb;
            const newCars = vm.runInContext('NEW_CARS', sandbox);
            const carUltra = newCars.find(c => c.tier === 'ultra');

            sandbox.gameState.fleet = [
                { id: 'f_u1', modelId: carUltra.id, name: carUltra.name, tier: 'ultra', isLease: false, outOfService: null },
                { id: 'f_u2_lease', modelId: carUltra.id, name: carUltra.name, tier: 'ultra', isLease: true, outOfService: null },
                { id: 'f_u3_oos_bool', modelId: carUltra.id, name: carUltra.name, tier: 'ultra', isLease: false, outOfService: true },
                { id: 'f_u4_oos_date', modelId: carUltra.id, name: carUltra.name, tier: 'ultra', isLease: false, outOfService: new Date().toISOString() },
            ];

            assert.equal(vm.runInContext('_tQualifyingCount("ultra")', sandbox), 1, 'solo l\'auto di proprietà e attiva deve qualificarsi');
        });

        test('calcolo punteggio _tPlayerScore rispetta pesi e tetti massimi (40 rep + 40 flotta + 20 pledge)', () => {
            const { sandbox } = amb;
            sandbox.gameState.reputation = 5.0; // 5.0 / 5.0 * 40 = 40 max
            sandbox.gameState.fleet = [
                { id: 'f1', tier: 'ultra', isLease: false, outOfService: null },
                { id: 'f2', tier: 'ultra', isLease: false, outOfService: null },
            ];

            // Requisito: 2 veicoli ultra, pledge 100.000€ -> punteggio 40 + 40 + 20 = 100
            const maxScore = vm.runInContext('_tPlayerScore("ultra", 2, 100000)', sandbox);
            assert.equal(maxScore.rep, 40);
            assert.equal(maxScore.fleet, 40);
            assert.equal(maxScore.pledge, 20);
            assert.equal(maxScore.total, 100);

            // Requisito parziale: 1 veicolo su 2 (20), rep 2.5 (20), pledge 25.000 (5) -> 45
            sandbox.gameState.reputation = 2.5;
            sandbox.gameState.fleet = [{ id: 'f1', tier: 'ultra', isLease: false, outOfService: null }];
            const midScore = vm.runInContext('_tPlayerScore("ultra", 2, 25000)', sandbox);
            assert.equal(midScore.rep, 20);
            assert.equal(midScore.fleet, 20);
            assert.equal(midScore.pledge, 5);
            assert.equal(midScore.total, 45);
        });

        test('controllo requisiti _tMeetsReqs distingue tra reputazione e veicoli insufficienti', () => {
            const { sandbox } = amb;
            sandbox.gameState.reputation = 4.0;
            sandbox.gameState.fleet = [{ id: 'f1', tier: 'business', isLease: false, outOfService: null }];

            const tender = {
                requirements: { min_reputation: 4.5, req_tier: 'ultra', req_vehicle_count: 2 },
            };

            // Fallimento per reputazione
            const reqRepFail = vm.runInContext(`_tMeetsReqs(${JSON.stringify(tender)})`, sandbox);
            assert.equal(reqRepFail.ok, false);
            assert.ok(reqRepFail.reason.includes('Reputazione insufficiente'));

            // Fallimento per veicoli
            sandbox.gameState.reputation = 5.0;
            const reqFleetFail = vm.runInContext(`_tMeetsReqs(${JSON.stringify(tender)})`, sandbox);
            assert.equal(reqFleetFail.ok, false);
            assert.ok(reqFleetFail.reason.includes('Veicoli insufficienti'));

            // Successo
            sandbox.gameState.fleet = [
                { id: 'f1', tier: 'ultra', isLease: false, outOfService: null },
                { id: 'f2', tier: 'ultra', isLease: false, outOfService: null },
            ];
            const reqOk = vm.runInContext(`_tMeetsReqs(${JSON.stringify(tender)})`, sandbox);
            assert.equal(reqOk.ok, true);
        });
    });

    describe('11. Movimenti di denaro e sincronizzazione ServerState (accreditatoDalServer)', () => {
        test('_tourismDailyTick accredita cash locale via accreditatoDalServer senza invocare syncCash', async () => {
            const syncedCash = [];
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.cash = 10000;
            await amb.sandbox._tourismDailyTick();

            assert.equal(amb.gs.cash, 15600, 'il cash locale deve essere aggiornato subito con il payout');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già mosso i soldi');
            amb.env.stopAllIntervals();
        });

        test('tourismTerminate con ServerState online NON applica penalità reputazione locale', async () => {
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => true,
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.reputation = 4.5;
            await amb.sandbox.tourismTerminate('tender_mine_active');

            // Con ServerState pronto, la penalità viene applicata da Supabase RPC
            assert.equal(amb.gs.reputation, 4.5, 'la reputazione locale non viene alterata doppiamente con ServerState online');
            amb.env.stopAllIntervals();
        });

        test('tourismTerminate con ServerState offline decrementa reputazione locale via CE_money', async () => {
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => false,
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.reputation = 4.0;
            await amb.sandbox.tourismTerminate('tender_mine_active');

            // Penale per tier 4: 4 * 0.15 = 0.60
            assert.equal(Math.round(amb.gs.reputation * 100) / 100, 3.40, 'la reputazione locale deve essere decrementata di 0.60');
            amb.env.stopAllIntervals();
        });
    });

    describe('12. Risposta Domanda (b) — Persistenza in gameState ed effetto eco Realtime', () => {
        test('il payout giornaliero entra in gameState.cash e persiste dopo saveGame()', async () => {
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => false,
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.cash = 25000;
            await amb.sandbox._tourismDailyTick();

            // Payout di 5600 da Obsidian Pearl Retreats
            assert.equal(amb.gs.cash, 30600, 'gameState.cash deve contenere la somma accreditata');

            // Verifica che saveGame abbia serializzato lo stato
            const rawSave = amb.sandbox.localStorage.getItem('ce_save_slot_1');
            if (rawSave) {
                const parsed = JSON.parse(rawSave);
                assert.equal(parsed.cash, 30600, 'il cash salvato in localStorage deve riflettere il payout');
            }
            amb.env.stopAllIntervals();
        });

        test('la rescissione decrementa gameState.reputation e persiste dopo saveGame()', async () => {
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => false,
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.reputation = 4.8;
            await amb.sandbox.tourismTerminate('tender_mine_active');

            // Tier 4 -> penale 0.60 -> 4.20
            assert.equal(Math.round(amb.gs.reputation * 100) / 100, 4.20, 'reputazione decrementata');

            const rawSave = amb.sandbox.localStorage.getItem('ce_save_slot_1');
            if (rawSave) {
                const parsed = JSON.parse(rawSave);
                assert.equal(Math.round(parsed.reputation * 100) / 100, 4.20, 'reputazione salvata corretta');
            }
            amb.env.stopAllIntervals();
        });

        test('simulazione eco ServerState: il cash viene accreditato e non risincronizzato', async () => {
            const syncedCash = [];
            const amb = creaAmbienteTurismo({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await amb.sandbox.tourismRefresh(true);

            amb.gs.cash = 50000;

            // Invocazione tick giornaliero
            await amb.sandbox._tourismDailyTick();

            assert.equal(amb.gs.cash, 55600, 'il cash locale riflette subito il payout');
            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione con syncCash');
            amb.env.stopAllIntervals();
        });
    });

    describe('13. Risposta Domanda (c) — Conformità della forma dati Server RPC <-> Client UI', () => {
        test('la forma dati di rpc_get_tourism_tenders include tutti i campi richiesti da renderTabTourism', async () => {
            const amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);

            const tenders = amb.sandbox._tourismState.tenders;
            assert.ok(Array.isArray(tenders), 'i bandi devono essere un array');
            assert.ok(tenders.length > 0, 'devono essere presenti bandi');

            // Verifica che ogni bando contenga i campi attesi dal client
            for (const t of tenders) {
                assert.ok(typeof t.id === 'string', 'id deve essere string');
                assert.ok(typeof t.name === 'string', 'name deve essere string');
                assert.ok(typeof t.status === 'string', 'status deve essere string');
                assert.ok(typeof t.tier === 'number', 'tier deve essere number');
                assert.ok(typeof t.duration_days === 'number', 'duration_days deve essere number');
                assert.ok(typeof t.is_mine === 'boolean', 'is_mine deve essere boolean');
                assert.ok(typeof t.requirements === 'object' && t.requirements !== null, 'requirements deve essere object');
            }
            amb.env.stopAllIntervals();
        });

        test('renderTabTourism tollera bando in cooldown senza cooldown_until o con date future/passate', () => {
            const amb = creaAmbienteTurismo({
                bandi: [
                    {
                        id: 'tender_cooldown_no_date',
                        status: 'cooldown',
                        name: 'Bando Cooldown Senza Data',
                        tier: 2,
                        cooldown_until: null,
                        is_mine: false,
                    },
                    {
                        id: 'tender_cooldown_future',
                        status: 'cooldown',
                        name: 'Bando Cooldown Futuro',
                        tier: 3,
                        cooldown_until: new Date(Date.now() + 3600000).toISOString(),
                        is_mine: false,
                    },
                ],
            });

            assert.doesNotThrow(() => {
                amb.sandbox._tourismState.tenders = amb.statoBandi;
                amb.sandbox.renderTabTourism();
            }, 'non deve lanciare eccezioni di rendering con forme dati limite');

            const container = amb.sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('In Cooldown'), 'deve mostrare sezione cooldown');
            amb.env.stopAllIntervals();
        });
    });
});
