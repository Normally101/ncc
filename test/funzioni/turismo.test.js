'use strict';
/* ============================================================================
   test/funzioni/turismo.test.js — Verifica approfondita del modulo Bandi B2B Turismo

   Scopo: verificare che tutte le azioni esposte da `tourism.js` e dai relativi
   gestori `ce-actions.js` funzionino realmente in presenza del contesto e dei
   dati attesi (Supabase RPC, bandi turismo, flotta veicoli, SLA, pagamenti).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase per il sistema bandi turismo.
 */
function creaAmbienteTurismo(opzioni = {}) {
    const rpcLog = [];

    const bandiDefault = [
        {
            id: 'tender_1',
            catalog_id: 'cat_1',
            name: 'Crown Meridian Escapes',
            company_type: 'Tour operator luxury resort',
            clientele: 'Honeymoon, turismo premium USA-Europa',
            tier: 3,
            lore: 'Resort esclusivi e transfer aeroportuali premium.',
            icon: '👑',
            base_payout_per_hour: 170,
            duration_days: 7,
            status: 'open_bidding',
            bidding_ends_at: new Date(Date.now() + 86400000).toISOString(),
            requirements: {
                min_reputation: 2.5,
                req_tier: 'business',
                req_vehicle_count: 2,
                req_driver_count: 0,
                req_completions: 0,
            },
            bid_count: 1,
            is_mine: false,
            my_bid_status: null,
            my_bid_score: null,
            my_bid_pledge: null,
        },
        {
            id: 'tender_2',
            catalog_id: 'cat_2',
            name: 'Velvet Horizon Concierge',
            company_type: 'Concierge VIP globale',
            clientele: 'Celebrities e HNWI',
            tier: 5,
            lore: 'Auto blindate, autisti silenziosi.',
            icon: '🕴️',
            base_payout_per_hour: 500,
            duration_days: 14,
            status: 'open_bidding',
            bidding_ends_at: new Date(Date.now() + 86400000).toISOString(),
            requirements: {
                min_reputation: 4.5,
                req_tier: 'ultra',
                req_vehicle_count: 3,
                req_driver_count: 3,
                req_completions: 0,
            },
            bid_count: 0,
            is_mine: false,
            my_bid_status: null,
            my_bid_score: null,
            my_bid_pledge: null,
        },
        {
            id: 'tender_3',
            catalog_id: 'cat_3',
            name: 'Aurevia Elite Journeys',
            company_type: 'Network luxury travel globale',
            clientele: 'CEO, old money, diplomatici',
            tier: 4,
            lore: 'Trasporto diplomatico d\'élite.',
            icon: '🌟',
            base_payout_per_hour: 225,
            daily_payout: 3600,
            total_paid: 10800,
            sla_score: 95.0,
            duration_days: 30,
            status: 'active',
            current_owner_uuid: 'user_test',
            owner_company_name: 'Test Chauffeur',
            expires_at: new Date(Date.now() + 86400000 * 10).toISOString(),
            is_mine: true,
            my_bid_status: 'won',
            round_number: 1,
        },
        {
            id: 'tender_4',
            catalog_id: 'cat_4',
            name: 'Zenith Harbor Leisure',
            company_type: 'Turismo crocieristico premium',
            clientele: 'Crociere luxury',
            tier: 2,
            icon: '⛵',
            base_payout_per_hour: 130,
            daily_payout: 2080,
            duration_days: 7,
            status: 'active',
            current_owner_uuid: 'user_rival',
            owner_company_name: 'Rival Chauffeur',
            expires_at: new Date(Date.now() + 86400000 * 3).toISOString(),
            is_mine: false,
        },
        {
            id: 'tender_5',
            catalog_id: 'cat_5',
            name: 'Nova Dynasty Holidays',
            company_type: 'Travel tech company',
            clientele: 'Giovani milionari tech',
            tier: 3,
            icon: '⚡',
            status: 'cooldown',
            cooldown_until: new Date(Date.now() + 7200000).toISOString(),
            is_mine: false,
        },
    ];

    let statoBandi = (opzioni.bandi || bandiDefault).map(b => JSON.parse(JSON.stringify(b)));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoBandi });
            }

            if (nome === 'rpc_get_tourism_tenders') {
                return { data: statoBandi, error: null };
            }

            if (nome === 'rpc_submit_tourism_bid') {
                const tender = statoBandi.find(t => t.id === args.v_tender_id);
                if (!tender) return { data: null, error: { message: 'Bando non trovato' } };
                tender.my_bid_status = 'pending';
                tender.my_bid_pledge = args.v_pledge_cash || 0;
                tender.bid_count = (tender.bid_count || 0) + 1;
                const score = 75.5;
                tender.my_bid_score = score;
                return {
                    data: {
                        score: score,
                        rep: 32.0,
                        fleet: 35.0,
                        pledge: 8.5,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_cancel_tourism_bid') {
                const tender = statoBandi.find(t => t.id === args.v_tender_id);
                if (tender) {
                    tender.my_bid_status = null;
                    tender.my_bid_score = null;
                    tender.my_bid_pledge = null;
                    tender.bid_count = Math.max(0, (tender.bid_count || 1) - 1);
                }
                return { data: null, error: null };
            }

            if (nome === 'rpc_terminate_tourism_contract') {
                const tender = statoBandi.find(t => t.id === args.v_tender_id);
                if (!tender) return { data: null, error: { message: 'Contratto non trovato' } };
                tender.status = 'cooldown';
                tender.is_mine = false;
                const penalty = (tender.tier || 3) * 0.15;
                return {
                    data: {
                        rep_penalty: penalty,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_tourism_daily_tick') {
                const active = statoBandi.filter(t => t.is_mine && t.status === 'active');
                const total = active.reduce((s, t) => s + (t.daily_payout || 0), 0);
                const payouts = active.map(t => ({
                    name: t.name,
                    icon: t.icon,
                    amount: t.daily_payout || 0,
                }));
                return {
                    data: {
                        total_payout: total,
                        active_count: active.length,
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
    if (opzioni.userId !== null) {
        env.sandbox.currentUser = { id: opzioni.userId || 'user_test' };
        env.sandbox.window.currentUser = env.sandbox.currentUser;
    } else {
        env.sandbox.currentUser = null;
        env.sandbox.window.currentUser = null;
    }

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        statoBandi,
    };
}

describe('Funzione Turismo — Esecuzione e ciclo di vita', () => {

    describe('window.tourismInit e window.tourismRefresh', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteTurismo(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('tourismInit e tourismRefresh caricano i bandi da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.tourismInit();

            assert.equal(sandbox._tourismState.tenders.length, 5, 'devono esserci 5 bandi');
            assert.ok(sandbox._tourismState._lastFetch > 0, 'timestamp _lastFetch deve essere aggiornato');
            assert.equal(sandbox._tourismState._loading, false, 'stato loading deve tornare false');
        });

        test('tourismRefresh rispetta il throttling di 45 secondi se force=false', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.tourismRefresh(true);
            const chiamatePrima = rpcLog.length;

            // Seconda chiamata immediata senza force -> bloccata da throttle
            await sandbox.tourismRefresh(false);
            assert.equal(rpcLog.length, chiamatePrima, 'la chiamata throttled non deve invocare RPC');

            // Chiamata con force=true -> riesegue RPC
            await sandbox.tourismRefresh(true);
            assert.equal(rpcLog.length, chiamatePrima + 1, 'la chiamata con force=true deve bypassare il throttle');
        });

        test('tourismRefresh senza supabaseClient ritorna silenziosamente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.tourismRefresh(true);
            });
        });

        test('tourismInit senza utente o senza supabaseClient non fa query', async () => {
            const ambNoAuth = creaAmbienteTurismo({ userId: null });
            await ambNoAuth.sandbox.tourismInit();
            assert.equal(ambNoAuth.rpcLog.length, 0, 'non deve chiamare RPC se non loggato');
            ambNoAuth.env.stopAllIntervals();
        });
    });

    describe('window.tourismSubmitBid — Invio offerta per un bando', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('invia offerta con calcolo veicoli qualificanti e pledge cash', async () => {
            const { sandbox, gs, rpcLog, env } = amb;

            // Flotta con 2 auto business e 1 vip
            gs.fleet = [
                { id: 'c1', name: 'Auto 1', tier: 'business', condition: 90, outOfService: false, isLease: false },
                { id: 'c2', name: 'Auto 2', tier: 'business', condition: 85, outOfService: false, isLease: false },
                { id: 'c3', name: 'Auto 3', tier: 'vip', condition: 95, outOfService: false, isLease: false },
                { id: 'c4', name: 'Auto Lease', tier: 'business', isLease: true }, // leasing ignorato
                { id: 'c5', name: 'Auto Guasta', tier: 'ultra', outOfService: true }, // guasta ignorata
            ];
            gs.reputation = 4.0;

            // Imposta pledge di €25.000 per tender_1
            sandbox._tSetPledge('tender_1', 25000);

            await sandbox.tourismSubmitBid('tender_1');

            const submitRpc = rpcLog.find(r => r.nome === 'rpc_submit_tourism_bid');
            assert.ok(submitRpc, 'deve chiamare rpc_submit_tourism_bid');
            assert.equal(submitRpc.args.v_tender_id, 'tender_1');
            assert.equal(submitRpc.args.v_qualifying_vehicles, 3, '2 business + 1 vip = 3 veicoli idonei per requirement business');
            assert.equal(submitRpc.args.v_pledge_cash, 25000);

            // Verifica notifica e mappa
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Offerta inviata! Score: 75.5')));
            assert.ok(env.logs.some(l => l.includes('Offerta turismo inviata per "Crown Meridian Escapes"')));
        });

        test('blocco invio offerta se utente non è autenticato', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.tourismSubmitBid('tender_1');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_submit_tourism_bid').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('invio per tenderId non esistente non produce errori e non invoca RPC', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.tourismSubmitBid('tender_inesistente');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_submit_tourism_bid').length, 0);
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
            await ambErr.sandbox.tourismSubmitBid('tender_1');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Finestra di offerta scaduta')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.tourismCancelBid — Ritiro offerta', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ritiro offerta valido chiama RPC e notifica il giocatore', async () => {
            const { sandbox, rpcLog, env } = amb;
            await sandbox.tourismCancelBid('tender_1');

            const cancelRpc = rpcLog.find(r => r.nome === 'rpc_cancel_tourism_bid');
            assert.ok(cancelRpc, 'deve chiamare rpc_cancel_tourism_bid');
            assert.equal(cancelRpc.args.v_tender_id, 'tender_1');

            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Offerta annullata.')));
        });

        test('ritiro senza utente loggato non esegue RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.tourismCancelBid('tender_1');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_cancel_tourism_bid').length, 0);
        });

        test('ritiro con errore RPC mostra notifica di errore', async () => {
            const ambErr = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_cancel_tourism_bid: async () => ({
                        data: null,
                        error: { message: 'Offerta già processata' },
                    }),
                },
            });
            await ambErr.sandbox.tourismRefresh(true);
            await ambErr.sandbox.tourismCancelBid('tender_1');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Annullamento non riuscito')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.tourismTerminate — Rescissione anticipata contratto', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rescissione confermata applica penale reputazione e aggiorna stato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.reputation = 4.5;
            sandbox.confirm = () => true;

            // tender_3 è attivo e di proprietà dell'utente, tier 4 -> penalty = 4 * 0.15 = 0.60
            // Testiamo in modalità serverState non pronto per verificare l'effetto sul gameState locale
            sandbox.ServerState._setReady(false);

            await sandbox.tourismTerminate('tender_3');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_tourism_contract');
            assert.ok(termRpc, 'deve chiamare rpc_terminate_tourism_contract');
            assert.equal(termRpc.args.v_tender_id, 'tender_3');

            // Verifica riduzione reputazione locale
            assert.ok(gs.reputation < 4.5, 'la reputazione deve diminuire per la penale');
            assert.equal(gs.reputation.toFixed(2), '3.90');

            assert.ok(env.logs.some(l => l.includes('Contratto turismo rescisso — penale −0.60★')));
        });

        test('rescissione rifiutata da confirm() annulla l\'operazione', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox.tourismTerminate('tender_3');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_tourism_contract').length, 0);
        });

        test('rescissione senza login non fa nulla', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.tourismTerminate('tender_3');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_tourism_contract').length, 0);
        });
    });

    describe('window._tourismDailyTick — Payout giornaliero automatico', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('accredita guadagni dai contratti turismo attivi', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 10000;
            sandbox.ServerState._setReady(false);

            await sandbox._tourismDailyTick();

            const tickRpc = rpcLog.find(r => r.nome === 'rpc_tourism_daily_tick');
            assert.ok(tickRpc, 'deve chiamare rpc_tourism_daily_tick');

            // In stato default tender_3 rende 3600/giorno
            assert.equal(gs.cash, 13600, 'il payout di 3600 deve essere aggiunto alla cassa');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Turismo: +€3.600 da "Aurevia Elite Journeys"')));
            assert.ok(env.logs.some(l => l.includes('Payout turismo: +€3.600 — "Aurevia Elite Journeys"')));
        });

        test('gestisce payout multipli ed avviso di contratti in scadenza', async () => {
            const ambMulti = creaAmbienteTurismo({
                rpcHandlers: {
                    rpc_tourism_daily_tick: async () => ({
                        data: {
                            total_payout: 7500,
                            active_count: 2,
                            expiring_soon: 1,
                            payouts: [
                                { name: 'Contratto A', icon: '👑', amount: 4000 },
                                { name: 'Contratto B', icon: '🌟', amount: 3500 },
                            ],
                        },
                        error: null,
                    }),
                },
            });
            ambMulti.gs.cash = 5000;
            ambMulti.sandbox.ServerState._setReady(false);

            await ambMulti.sandbox._tourismDailyTick();

            assert.equal(ambMulti.gs.cash, 12500);
            assert.ok(ambMulti.env.notifications.some(n => n.type === 'success' && n.msg.includes('Turismo: +€7.500 da 2 contratti')));
            assert.ok(ambMulti.env.notifications.some(n => n.type === 'warning' && n.msg.includes('in scadenza entro domani')));
            ambMulti.env.stopAllIntervals();
        });

        test('non fa nulla se non ci sono payout o utente anonimo', async () => {
            const { sandbox, gs } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;
            gs.cash = 5000;

            await sandbox._tourismDailyTick();
            assert.equal(gs.cash, 5000);
        });
    });

    describe('Score preview e calcolo requisiti (_tPlayerScore, _tMeetsReqs, _tQualifyingCount)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('qualifying count scala correttamente i tier dei veicoli', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', tier: 'standard' },
                { id: 'c2', tier: 'business' },
                { id: 'c3', tier: 'vip' },
                { id: 'c4', tier: 'ultra' },
            ];

            // In sandbox le funzioni private sono accessibili eseguendo nel contesto VM o tramite _tUpdateScorePreview
            const qvStandard = vm.runInContext('_tQualifyingCount("standard")', sandbox);
            const qvBusiness = vm.runInContext('_tQualifyingCount("business")', sandbox);
            const qvVip = vm.runInContext('_tQualifyingCount("vip")', sandbox);
            const qvUltra = vm.runInContext('_tQualifyingCount("ultra")', sandbox);

            assert.equal(qvStandard, 4, 'tutti i veicoli (standard..ultra) qualificano per standard');
            assert.equal(qvBusiness, 3, 'business, vip, ultra qualificano per business');
            assert.equal(qvVip, 2, 'vip, ultra qualificano per vip');
            assert.equal(qvUltra, 1, 'solo ultra qualifica per ultra');
        });

        test('_tPlayerScore calcola correttamente la formula rep(40) + fleet(40) + pledge(20)', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 5.0; // 40 pt
            gs.fleet = [
                { id: 'c1', tier: 'business' },
                { id: 'c2', tier: 'business' },
            ];

            // reqCount = 2 -> fleetSc = (2/2) * 40 = 40 pt
            // pledge = 50.000 -> pledgeSc = (50000/100000) * 20 = 10 pt
            // Total = 40 + 40 + 10 = 90
            const res = vm.runInContext('_tPlayerScore("business", 2, 50000)', sandbox);
            assert.equal(res.rep, 40);
            assert.equal(res.fleet, 40);
            assert.equal(res.pledge, 10);
            assert.equal(res.total, 90);
        });

        test('_tMeetsReqs verifica soglie di reputazione e veicoli minimi', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 2.0;
            gs.fleet = [{ id: 'c1', tier: 'standard' }];

            const t = {
                requirements: {
                    min_reputation: 3.0,
                    req_tier: 'business',
                    req_vehicle_count: 2,
                },
            };

            const r1 = vm.runInContext(`_tMeetsReqs(${JSON.stringify(t)})`, sandbox);
            assert.equal(r1.ok, false);
            assert.ok(r1.reason.includes('Reputazione insufficiente'));

            gs.reputation = 3.5;
            const r2 = vm.runInContext(`_tMeetsReqs(${JSON.stringify(t)})`, sandbox);
            assert.equal(r2.ok, false);
            assert.ok(r2.reason.includes('Veicoli insufficienti'));

            gs.fleet.push({ id: 'c2', tier: 'business' }, { id: 'c3', tier: 'business' });
            const r3 = vm.runInContext(`_tMeetsReqs(${JSON.stringify(t)})`, sandbox);
            assert.equal(r3.ok, true);
        });
    });

    describe('UI: Rendering della scheda (renderTabTourism) e interazioni ce-actions', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteTurismo();
            await amb.sandbox.tourismRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabTourism disegna header KPI, bandi aperti e sezioni stato', () => {
            const { sandbox } = amb;
            sandbox.renderTabTourism();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Bandi Turismo B2B'));
            assert.ok(container.innerHTML.includes('Crown Meridian Escapes'));
            assert.ok(container.innerHTML.includes('Velvet Horizon Concierge'));
            assert.ok(container.innerHTML.includes('Zenith Harbor Leisure'));
            assert.ok(container.innerHTML.includes('Nova Dynasty Holidays'));
        });

        test('renderTabTourism con subTab="mine" mostra i contratti attivi e lo score SLA', () => {
            const { sandbox } = amb;
            sandbox._tourismState._subTab = 'mine';
            sandbox.renderTabTourism();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Aurevia Elite Journeys'));
            assert.ok(container.innerHTML.includes('SLA Score'));
            assert.ok(container.innerHTML.includes('95%'));
            assert.ok(container.innerHTML.includes('Rescindi Anticipatamente'));
        });

        test('renderTabTourism senza utente loggato mostra messaggio di autenticazione', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;
            sandbox.renderTabTourism();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Accedi per partecipare ai bandi turismo.'));
        });

        test('ceTPledge aggiorna il pledge e gli elementi DOM di live score preview', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'c1', tier: 'business' }, { id: 'c2', tier: 'business' }];
            gs.reputation = 3.0;
            sandbox.renderTabTourism();

            const slider = { value: '40000' };
            sandbox.ceTPledge.call(slider, 'tender_1');

            assert.equal(sandbox._tourismState._pledgeAmts['tender_1'], 40000);

            const pledgeValEl = sandbox.document.getElementById('t-pledge-val-tender_1');
            if (pledgeValEl) {
                assert.ok(pledgeValEl.textContent.includes('40'));
            }
        });

        test('ceSetRender passa alla scheda "mine" e aggiorna il DOM', () => {
            const { sandbox } = amb;
            sandbox.renderTabTourism();

            sandbox.ceSetRender('_tourismState', '_subTab', 'mine', 'renderTabTourism');
            assert.equal(sandbox._tourismState._subTab, 'mine');

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Aurevia Elite Journeys'));
        });

        test('ceThen invoca refresh e render in sequenza', async () => {
            const { sandbox } = amb;
            let refreshFatto = false;
            let renderFatto = false;

            sandbox.tourismRefresh = async () => { refreshFatto = true; };
            sandbox.renderTabTourism = () => { renderFatto = true; };

            sandbox.ceThen('tourismRefresh', 'renderTabTourism');
            await new Promise(r => setImmediate(r));

            assert.equal(refreshFatto, true);
            assert.equal(renderFatto, true);
        });
    });
});
