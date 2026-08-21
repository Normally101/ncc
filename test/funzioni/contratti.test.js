'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Verifica approfondita dei Contratti (Deals & B2B)

   Scopo: collaudo completo e profondo di contracts.js e b2b.js, inclusi i gestori
   in ce-actions.js, l'integrazione monetaria con CE_money / RPC ServerState,
   la prevenzione del doppio conteggio, il ciclo di vita (apertura bandi, offerte,
   vittoria, incassi ricorrenti, completamento, scadenza e rescissione con penale),
   i vincoli su veicoli/autisti e il rendering delle schede.
   ============================================================================ */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente isolato con mock Supabase e CE_money per i contratti.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];
    const notifications = [];
    const mapLogs = [];
    const toasts = [];
    const alerts = [];
    const syncedCash = [];

    const b2bCatalogDefault = [
        {
            id: 'b2b_ctr_1',
            client_name: 'Nexus Corp',
            client_icon: '🏢',
            title: 'Servizio Navetta Dirigenziale',
            daily_payout: 4200,
            duration_days: 14,
            penalty_amount: 15000,
            required_tier: 'PREMIUM',
            required_count: 2,
            min_reputation: 3.5,
            province_id: 'prov_rm',
        },
        {
            id: 'b2b_ctr_2',
            client_name: 'Starlight Global',
            client_icon: '✨',
            title: 'Scorta VIP e Delegazioni',
            daily_payout: 8500,
            duration_days: 30,
            penalty_amount: 35000,
            required_tier: 'ULTRA',
            required_count: 3,
            min_reputation: 4.5,
            province_id: 'prov_mi',
        },
        {
            id: 'b2b_ctr_3',
            client_name: 'Urban Logistics',
            client_icon: '📦',
            title: 'Flotta Business Urbana',
            daily_payout: 2100,
            duration_days: 7,
            penalty_amount: 5000,
            required_tier: 'BUSINESS',
            required_count: 1,
            min_reputation: 2.0,
            province_id: null,
        },
    ];

    let b2bCatalog = (opzioni.b2bCatalog || b2bCatalogDefault).map(c => ({ ...c }));
    let b2bActiveDb = opzioni.b2bActiveDb !== undefined ? opzioni.b2bActiveDb : null;

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sbClient = {
        from: (table) => ({
            select: (cols) => ({
                eq: (col1, val1) => ({
                    eq: (col2, val2) => ({
                        maybeSingle: async () => {
                            if (table === 'b2b_active_contracts') {
                                return { data: b2bActiveDb, error: null };
                            }
                            return { data: null, error: null };
                        },
                    }),
                }),
            }),
            upsert: async () => ({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { b2bCatalog, b2bActiveDb });
            }

            if (nome === 'rpc_get_b2b_contracts') {
                return { data: b2bCatalog, error: null };
            }

            if (nome === 'rpc_accept_b2b_contract') {
                const target = b2bCatalog.find(c => c.id === args.v_contract_id);
                if (!target) return { data: null, error: { message: 'Contratto non trovato' } };
                b2bActiveDb = {
                    id: 'act_' + target.id,
                    user_id: env.sandbox.currentUser?.id,
                    contract_id: target.id,
                    title: target.title,
                    client: target.client_name,
                    icon: target.client_icon,
                    daily_payout: target.daily_payout,
                    days_remaining: target.duration_days,
                    duration_days: target.duration_days,
                    penalty: target.penalty_amount,
                    locked_vehicles: args.v_vehicle_ids || [],
                    locked_drivers: args.v_driver_ids || [],
                    status: 'active',
                };
                return {
                    data: {
                        id: b2bActiveDb.id,
                        daily_payout: target.daily_payout,
                        days_remaining: target.duration_days,
                        duration_days: target.duration_days,
                        title: target.title,
                        client: target.client_name,
                        icon: target.client_icon,
                        penalty: target.penalty_amount,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                if (!b2bActiveDb || b2bActiveDb.id !== args.v_active_id) {
                    return { data: null, error: { message: 'Nessun contratto attivo da terminare' } };
                }
                const pen = b2bActiveDb.penalty || 10000;
                b2bActiveDb = null;
                return {
                    data: { penalty: pen, rep_penalty: 0.5 },
                    error: null,
                };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                if (!b2bActiveDb) return { data: null, error: null };
                b2bActiveDb.days_remaining -= 1;
                const completed = b2bActiveDb.days_remaining <= 0;
                const payout = b2bActiveDb.daily_payout || 0;
                const title = b2bActiveDb.title;
                if (completed) {
                    b2bActiveDb = null;
                    return {
                        data: {
                            payout,
                            completed: true,
                            rep_bonus: 0.5,
                            title,
                            days_remaining: 0,
                        },
                        error: null,
                    };
                }
                return {
                    data: {
                        payout,
                        completed: false,
                        days_remaining: b2bActiveDb.days_remaining,
                        title,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'usr_test_vip' };

    env.sandbox.showNotification = (msg, tipo) => { notifications.push({ msg, tipo }); };
    env.sandbox.showBigEvent = (icon, title, desc) => { bigEvents.push({ icon, title, desc }); };
    env.sandbox.logToMap = (msg) => { mapLogs.push(msg); };
    env.sandbox.updateUI = () => {};
    env.sandbox.confirm = (msg) => opzioni.confirmResult !== undefined ? opzioni.confirmResult : true;

    env.sandbox.DS = {
        toast: (o) => toasts.push(o),
        alert: (o) => alerts.push(o),
    };

    // Assicura tab container nel DOM
    let container = env.sandbox.document.getElementById('tab-container');
    if (!container) {
        container = env.sandbox.document.createElement('div');
        container.id = 'tab-container';
        env.sandbox.document.body.appendChild(container);
    }

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        notifications,
        mapLogs,
        toasts,
        alerts,
        syncedCash,
        getB2bActiveDb: () => b2bActiveDb,
        setB2bActiveDb: (v) => { b2bActiveDb = v; },
    };
}

describe('Modulo Contratti & Corporate Deals — Collaudo Completo', () => {

    // ──────────────────────────────────────────────────────────────────────────
    // 1. INIZIALIZZAZIONE E STATO
    // ──────────────────────────────────────────────────────────────────────────
    describe('1. Inizializzazione e gestione dello stato', () => {
        test('CE_Contracts.initState inizializza array e scadenze se assenti', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            delete gs.corporateTenders;
            delete gs.corporateContracts;
            delete gs.tenderHistory;
            delete gs.nextTenderDay;
            gs.day = 5;

            sandbox.CE_Contracts.initState();

            assert.equal(Array.isArray(gs.corporateTenders), true);
            assert.equal(gs.corporateTenders.length, 0);
            assert.equal(Array.isArray(gs.corporateContracts), true);
            assert.equal(gs.corporateContracts.length, 0);
            assert.equal(Array.isArray(gs.tenderHistory), true);
            assert.equal(gs.tenderHistory.length, 0);
            assert.equal(gs.nextTenderDay, 7, 'nextTenderDay deve essere day + 2');
        });

        test('CE_Contracts.initState preserva strutture già esistenti', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            const existingTenders = [{ id: 't_pre' }];
            const existingContracts = [{ id: 'c_pre' }];
            gs.corporateTenders = existingTenders;
            gs.corporateContracts = existingContracts;
            gs.nextTenderDay = 12;

            sandbox.CE_Contracts.initState();

            assert.equal(gs.corporateTenders, existingTenders);
            assert.equal(gs.corporateContracts, existingContracts);
            assert.equal(gs.nextTenderDay, 12);
        });

        test('b2bRefresh popola contracts e activeContract da Supabase', async () => {
            const { sandbox } = creaAmbienteContratti();
            sandbox._b2bState.contracts = [];
            sandbox._b2bState.activeContract = null;

            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 3, 'deve caricare i 3 contratti B2B dal server');
            assert.equal(sandbox._b2bState.activeContract, null, 'nessun contratto attivo per default');
            assert.ok(sandbox._b2bState._lastFetch > 0, 'deve registrare il timestamp dell\'ultimo fetch');
        });

        test('b2bInit esegue il refresh quando client e utente sono autenticati', async () => {
            const { sandbox } = creaAmbienteContratti();
            await sandbox.b2bInit();
            assert.equal(sandbox._b2bState.contracts.length, 3);
        });

        test('b2bInit e b2bRefresh non crashano se supabaseClient o currentUser sono nulli', async () => {
            const { sandbox } = creaAmbienteContratti({ currentUser: null });
            sandbox.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.b2bInit();
                await sandbox.b2bRefresh();
            });
            assert.equal(sandbox._b2bState.contracts.length, 0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. REQUISITI ED ELEGGIBILITÀ FLOTTA / REPUTAZIONE
    // ──────────────────────────────────────────────────────────────────────────
    describe('2. Requisiti di idoneità flotta e reputazione', () => {
        test('meetsRequirements verifica reputazione e flotta per bando corporate', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.reputation = 4.5; // 90%
            gs.fleet = [
                { id: 'v1', tier: 'ultra', condition: 90, outOfService: false },
                { id: 'v2', tier: 'ultra', condition: 85, outOfService: false },
                { id: 'v3', tier: 'standard', condition: 95, outOfService: false },
            ];

            const company = {
                company_name: 'Aureline Capital',
                tender_requirements: {
                    min_fleet_size: 2,
                    required_vehicle_type: 'armored_suv', // richiede rank ultra
                    min_reputation: 85,
                },
            };

            const check = sandbox.CE_Contracts.meetsRequirements(company);
            assert.equal(check.playerRepPct, 90);
            assert.equal(check.repOk, true);
            assert.equal(check.qualifying, 2);
            assert.equal(check.fleetOk, true);
        });

        test('meetsRequirements esclude veicoli fuori servizio o in cattive condizioni (condizione <= 10)', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.reputation = 5.0;
            gs.fleet = [
                { id: 'v1', tier: 'ultra', condition: 90, outOfService: true }, // escluso: outOfService
                { id: 'v2', tier: 'ultra', condition: 5, outOfService: false },  // escluso: condizione <= 10
                { id: 'v3', tier: 'ultra', condition: 80, outOfService: false }, // valido
            ];

            const company = {
                company_name: 'Titan Forge',
                tender_requirements: {
                    min_fleet_size: 2,
                    required_vehicle_type: 'armored_suv',
                    min_reputation: 90,
                },
            };

            const check = sandbox.CE_Contracts.meetsRequirements(company);
            assert.equal(check.qualifying, 1, 'solo 1 veicolo ultra è idoneo e in servizio');
            assert.equal(check.fleetOk, false, 'servivano 2 veicoli');
        });

        test('b2b CarRank e ReqRank confrontano correttamente catalogo maiuscolo e flotta minuscola', () => {
            const { sandbox } = creaAmbienteContratti();
            assert.equal(sandbox._b2bReqRank('BUSINESS'), 2);
            assert.equal(sandbox._b2bReqRank('PREMIUM'), 2);
            assert.equal(sandbox._b2bReqRank('PRESIDENTIAL'), 4);
            assert.equal(sandbox._b2bReqRank('ARMORED'), 4);
            assert.equal(sandbox._b2bReqRank('ULTRA'), 4);

            assert.equal(sandbox._b2bCarRank({ tier: 'standard' }), 1);
            assert.equal(sandbox._b2bCarRank({ tier: 'business' }), 2);
            assert.equal(sandbox._b2bCarRank({ tier: 'vip' }), 3);
            assert.equal(sandbox._b2bCarRank({ tier: 'group' }), 3);
            assert.equal(sandbox._b2bCarRank({ tier: 'ultra' }), 4);

            // Veicolo VIP (rank 3) soddisfa requisito PREMIUM (rank 2)
            assert.ok(sandbox._b2bCarRank({ tier: 'vip' }) >= sandbox._b2bReqRank('PREMIUM'));
            // Veicolo Standard (rank 1) non soddisfa BUSINESS (rank 2)
            assert.ok(sandbox._b2bCarRank({ tier: 'standard' }) < sandbox._b2bReqRank('BUSINESS'));
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. OFFERTE CORPORATE DEALS (CE_placeBid, CE_updateBidPreview)
    // ──────────────────────────────────────────────────────────────────────────
    describe('3. Gestione offerte per Bandi Corporate Deals', () => {
        test('CE_placeBid scala denaro via CE_money.spend e registra offerta', () => {
            const { sandbox, gs, syncedCash, toasts } = creaAmbienteContratti();
            gs.cash = 100000;
            gs.reputation = 4.0; // 80% -> 32pt
            gs.fleet = [{ id: 'v1', tier: 'vip', condition: 100, outOfService: false }];
            gs.corporateTenders = [{
                id: 'tnd_101',
                status: 'open',
                company: {
                    company_name: 'Quantum Ledger',
                    tier: 5,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_sedan', min_reputation: 80 },
                },
                playerBid: null,
            }];

            sandbox.CE_placeBid('tnd_101', 25000);

            assert.equal(gs.cash, 75000, 'il cash deve scalare di 25.000€');
            assert.deepEqual(syncedCash, [75000], 'deve sincronizzare con ServerState.syncCash');
            const bid = gs.corporateTenders[0].playerBid;
            assert.ok(bid, 'l\'offerta deve essere registrata');
            assert.equal(bid.pledgedCash, 25000);
            assert.ok(bid.score > 0, 'il punteggio deve essere calcolato');
            assert.ok(toasts.length > 0, 'deve mostrare un toast di conferma');
        });

        test('CE_placeBid rifiuta offerta con fondi insufficienti senza mutare lo stato', () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 5000;
            gs.corporateTenders = [{
                id: 'tnd_102',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 } },
                playerBid: null,
            }];

            sandbox.CE_placeBid('tnd_102', 20000);

            assert.equal(gs.cash, 5000, 'il saldo non deve cambiare');
            assert.equal(gs.corporateTenders[0].playerBid, null, 'nessuna offerta deve essere piazzata');
            assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione cassa');
        });

        test('CE_placeBid su bando inesistente o chiuso non fa nulla', () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 'tnd_closed',
                status: 'closed',
                company: { company_name: 'Pear Tech', tender_requirements: {} },
                playerBid: null,
            }];

            sandbox.CE_placeBid('tnd_unknown', 10000);
            sandbox.CE_placeBid('tnd_closed', 10000);

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });

        test('CE_placeBid limita il pledge a 50.000€ massimo e 0€ minimo', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.cash = 200000;
            gs.corporateTenders = [{
                id: 'tnd_limits',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 } },
                playerBid: null,
            }];

            sandbox.CE_placeBid('tnd_limits', 999999);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 50000, 'deve avere tetto a 50.000€');
            assert.equal(gs.cash, 150000);
        });

        test('CE_updateBidPreview aggiorna i campi DOM di anteprima', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.reputation = 5.0;
            gs.fleet = [{ id: 'v1', tier: 'ultra', condition: 100, outOfService: false }];
            gs.corporateTenders = [{
                id: 'tnd_prev',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'armored_suv', min_reputation: 50 } },
                playerBid: null,
            }];

            const scoreSpan = sandbox.document.createElement('span');
            scoreSpan.id = 'bid-score-tnd_prev';
            const valSpan = sandbox.document.createElement('span');
            valSpan.id = 'bid-pledge-val-tnd_prev';
            sandbox.document.body.appendChild(scoreSpan);
            sandbox.document.body.appendChild(valSpan);

            sandbox.CE_updateBidPreview('tnd_prev', 20000);

            assert.notEqual(scoreSpan.textContent, '');
            assert.equal(valSpan.textContent, '€20.000');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. ANNULLAMENTO E MODIFICA OFFERTE (CE_cancelBid)
    // ──────────────────────────────────────────────────────────────────────────
    describe('4. Annullamento e modifica offerte Corporate Deals', () => {
        test('CE_cancelBid rimborsa il pledge per intero e azzera playerBid', () => {
            const { sandbox, gs, syncedCash, toasts } = creaAmbienteContratti();
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 'tnd_cancel',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: {} },
                playerBid: { pledgedCash: 15000, score: 75 },
            }];

            sandbox.CE_cancelBid('tnd_cancel');

            assert.equal(gs.cash, 65000, 'il cash deve aumentare del rimborso');
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.deepEqual(syncedCash, [65000]);
            assert.ok(toasts.length > 0);
        });

        test('CE_cancelBid ripetuto due volte non rimborsa una seconda volta', () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 'tnd_cancel_double',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: {} },
                playerBid: { pledgedCash: 10000, score: 70 },
            }];

            sandbox.CE_cancelBid('tnd_cancel_double');
            assert.equal(gs.cash, 60000);

            sandbox.CE_cancelBid('tnd_cancel_double'); // secondo click
            assert.equal(gs.cash, 60000, 'il cash non deve aumentare ancora');
            assert.deepEqual(syncedCash, [60000]);
        });

        test('modifica offerta: rialzo scala solo il delta, ribasso rimborsa solo il delta', () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 100000;
            gs.corporateTenders = [{
                id: 'tnd_delta',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 } },
                playerBid: null,
            }];

            // 1. Prima offerta: 10.000€
            sandbox.CE_placeBid('tnd_delta', 10000);
            assert.equal(gs.cash, 90000);

            // 2. Rialzo a 30.000€ (delta +20.000€)
            sandbox.CE_placeBid('tnd_delta', 30000);
            assert.equal(gs.cash, 70000, 'deve scalare solo 20.000€ di differenza');

            // 3. Ribasso a 15.000€ (delta -15.000€ rimborso)
            sandbox.CE_placeBid('tnd_delta', 15000);
            assert.equal(gs.cash, 85000, 'deve rimborsare 15.000€ di differenza');

            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 15000);
            assert.deepEqual(syncedCash, [90000, 70000, 85000]);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. RISOLUZIONE BANDI E GENERAZIONE BATCH (_resolve, _generateBatch)
    // ──────────────────────────────────────────────────────────────────────────
    describe('5. Risoluzione dei Bandi Corporate Deals e generazione batch', () => {
        test('CE_Contracts.dailyTick genera un batch di 4 nuovi bandi se scaduto il ciclo', () => {
            const { sandbox, gs, alerts } = creaAmbienteContratti();
            gs.day = 3;
            gs.nextTenderDay = 3;
            gs.corporateTenders = [];
            gs.corporateContracts = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 4, 'deve generare 4 nuovi bandi');
            assert.equal(gs.nextTenderDay, 6, 'prossimo batch fissato tra 3 giorni');
            assert.ok(alerts.length > 0, 'deve mostrare alert di notifica nuovi bandi');
            gs.corporateTenders.forEach(t => {
                assert.equal(t.status, 'open');
                assert.equal(t.openedDay, 3);
                assert.equal(t.closingDay, 5); // 2 giorni di apertura
            });
        });

        test('vittoria bando: se playerBid.score >= rivale AI, crea contratto attivo e trattiene pledge', () => {
            const { sandbox, gs, alerts } = creaAmbienteContratti();
            gs.day = 4;
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 'tnd_win',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 1,
                    payout_per_hour: 100,
                    contract_duration_days: 10,
                },
                openedDay: 1,
                closingDay: 4, // in scadenza oggi
                playerBid: { pledgedCash: 20000, score: 100 }, // punteggio massimo -> vince sicuro
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 0, 'il bando chiuso viene rimosso dai bandi aperti');
            assert.equal(gs.corporateContracts.length, 1, 'il contratto deve essere aggiunto');
            const ctr = gs.corporateContracts[0];
            assert.equal(ctr.companyId, 'Pear Technologies');
            assert.equal(ctr.status, 'active');
            assert.equal(ctr.dailyPayout, 1600); // 100 * 16
            assert.equal(ctr.startDay, 4);
            assert.equal(ctr.endDay, 14);
            assert.equal(gs.cash, 50000, 'il pledge NON viene restituito né ri-scalato: viene trattenuto');
            assert.ok(alerts.some(a => a.text.includes('CONTRATTO VINTO')));
        });

        test('sconfitta bando: se playerBid.score < rivale AI, rimborsa il pledge ed evidenzia sconfitta', () => {
            const { sandbox, gs, syncedCash, alerts } = creaAmbienteContratti();
            gs.day = 4;
            gs.cash = 30000;
            gs.corporateTenders = [{
                id: 'tnd_lose',
                companyId: 'OmniSphere Cloud',
                company: {
                    company_name: 'OmniSphere Cloud',
                    tier: 5,
                    payout_per_hour: 200,
                    contract_duration_days: 10,
                },
                openedDay: 1,
                closingDay: 4,
                playerBid: { pledgedCash: 12000, score: 0 }, // punteggio minimo -> perde sicuro
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 0, 'nessun contratto creato');
            assert.equal(gs.cash, 42000, 'il pledge di 12.000€ deve essere rimborsato');
            assert.deepEqual(syncedCash, [42000]);
            assert.ok(alerts.some(a => a.text.includes('Bando perso')));
            assert.equal(gs.tenderHistory.length, 1);
            assert.equal(gs.tenderHistory[0].result.won, false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. CICLO DI VITA CONTRATTI CORPORATE DEALS (Incassi, Scadenza, Terminazione)
    // ──────────────────────────────────────────────────────────────────────────
    describe('6. Ciclo di vita ed esecuzione contratti Corporate Deals', () => {
        test('incasso giornaliero contratti attivi accredita payout via CE_money', () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.day = 5;
            gs.cash = 10000;
            gs.corporateContracts = [
                {
                    id: 'ctr_1',
                    companyId: 'Alpha Corp',
                    company: { company_name: 'Alpha Corp', tier: 3, contract_duration_days: 10 },
                    startDay: 1,
                    endDay: 11,
                    dailyPayout: 3000,
                    totalEarned: 6000,
                    status: 'active',
                },
                {
                    id: 'ctr_2',
                    companyId: 'Beta Corp',
                    company: { company_name: 'Beta Corp', tier: 4, contract_duration_days: 10 },
                    startDay: 2,
                    endDay: 12,
                    dailyPayout: 5000,
                    totalEarned: 10000,
                    status: 'active',
                },
            ];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 18000, 'deve incassare 3000€ + 5000€ = 8000€');
            assert.equal(gs.corporateContracts[0].totalEarned, 9000);
            assert.equal(gs.corporateContracts[1].totalEarned, 15000);
            assert.deepEqual(syncedCash, [13000, 18000]);
        });

        test('scadenza contratti: contratti che raggiungono endDay passano a status expired e non incassano oltre', () => {
            const { sandbox, gs, alerts } = creaAmbienteContratti();
            gs.day = 10;
            gs.cash = 20000;
            gs.corporateContracts = [{
                id: 'ctr_exp',
                companyId: 'Gamma Corp',
                company: { company_name: 'Gamma Corp', tier: 2, contract_duration_days: 5 },
                startDay: 5,
                endDay: 10, // scade oggi al tick
                dailyPayout: 2000,
                totalEarned: 8000,
                status: 'active',
            }];

            sandbox.CE_Contracts.dailyTick();

            // Il tick esegue: collectEarnings, poi expireContracts
            assert.equal(gs.corporateContracts[0].status, 'expired');
            assert.ok(alerts.some(a => a.text.includes('scaduto')));

            // Il giorno successivo non deve incassare
            gs.day = 11;
            const cashAfterExp = gs.cash;
            sandbox.CE_Contracts.dailyTick();
            assert.equal(gs.cash, cashAfterExp, 'il contratto scaduto non deve generare ulteriori incassi');
        });

        test('CE_terminateContract imposta status a terminated dopo conferma', () => {
            const { sandbox, gs } = creaAmbienteContratti({ confirmResult: true });
            gs.corporateContracts = [{
                id: 'ctr_term',
                companyId: 'Delta Corp',
                company: { company_name: 'Delta Corp', tier: 3, contract_duration_days: 14 },
                startDay: 1,
                endDay: 15,
                dailyPayout: 4000,
                totalEarned: 8000,
                status: 'active',
            }];

            sandbox.CE_terminateContract('ctr_term');
            assert.equal(gs.corporateContracts[0].status, 'terminated');
        });

        test('CE_terminateContract rifiutata dall\'utente (confirm = false) non altera il contratto', () => {
            const { sandbox, gs } = creaAmbienteContratti({ confirmResult: false });
            gs.corporateContracts = [{
                id: 'ctr_keep',
                companyId: 'Delta Corp',
                company: { company_name: 'Delta Corp' },
                status: 'active',
            }];

            sandbox.CE_terminateContract('ctr_keep');
            assert.equal(gs.corporateContracts[0].status, 'active');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 7. SELEZIONE VEICOLI E FIRMA APPALTI B2B (b2bOpenAcceptModal, b2bAcceptContract)
    // ──────────────────────────────────────────────────────────────────────────
    describe('7. Selezione veicoli e firma appalti B2B', () => {
        test('b2bOpenAcceptModal apre modale con veicoli idonei disponibili', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.fleet = [
                { id: 'car_1', name: 'Mercedes E-Class', tier: 'business', condition: 100 },
                { id: 'car_2', name: 'BMW 7 Series', tier: 'vip', condition: 95 },
                { id: 'car_3', name: 'Fiat Panda', tier: 'standard', condition: 100 }, // non idonea per PREMIUM (rank 2)
            ];
            sandbox._b2bState.contracts = [{
                id: 'b2b_ctr_1',
                title: 'Servizio Navetta Dirigenziale',
                client_name: 'Nexus Corp',
                client_icon: '🏢',
                required_tier: 'PREMIUM',
                required_count: 2,
                daily_payout: 4200,
                duration_days: 14,
                penalty_amount: 15000,
            }];

            sandbox.b2bOpenAcceptModal('b2b_ctr_1');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modale di selezione veicoli deve essere inserito nel DOM');
            const checkboxes = modal.querySelectorAll('.b2b-car-check');
            assert.equal(checkboxes.length, 2, 'solo car_1 e car_2 sono idonee');
        });

        test('b2bOpenAcceptModal rifiuta se non ci sono abbastanza veicoli disponibili', () => {
            const { sandbox, gs, notifications } = creaAmbienteContratti();
            gs.fleet = [
                { id: 'car_1', name: 'Mercedes E-Class', tier: 'business', condition: 100 },
            ];
            sandbox._b2bState.contracts = [{
                id: 'b2b_ctr_need_2',
                required_tier: 'PREMIUM',
                required_count: 2,
            }];

            sandbox.b2bOpenAcceptModal('b2b_ctr_need_2');

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null);
            assert.ok(notifications.some(n => n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bCheckLimit aggiorna conteggio e abilita tasto firma al raggiungimento del limite', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.fleet = [
                { id: 'car_1', tier: 'business' },
                { id: 'car_2', tier: 'business' },
            ];
            sandbox._b2bState.contracts = [{
                id: 'b2b_ctr_test',
                required_tier: 'BUSINESS',
                required_count: 2,
            }];

            sandbox.b2bOpenAcceptModal('b2b_ctr_test');
            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            const btn = sandbox.document.getElementById('b2b-confirm-btn');

            assert.equal(btn.disabled, true);

            // Seleziona prima auto
            checks[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '1');
            assert.equal(btn.disabled, true);

            // Seleziona seconda auto
            checks[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');
            assert.equal(btn.disabled, false, 'il pulsante deve abilitarsi al raggiungimento del target');
        });

        test('b2bConfirmAccept recupera autisti assegnati e invoca b2bAcceptContract', async () => {
            const { sandbox, gs, rpcLog } = creaAmbienteContratti();
            gs.fleet = [
                { id: 'car_1', tier: 'business' },
                { id: 'car_2', tier: 'business' },
            ];
            gs.drivers = [
                { id: 'drv_1', name: 'Mario', assignedCarId: 'car_1' },
                { id: 'drv_2', name: 'Luigi', assignedCarId: 'car_2' },
            ];
            sandbox._b2bState.contracts = [{
                id: 'b2b_ctr_confirm',
                required_tier: 'BUSINESS',
                required_count: 2,
            }];

            sandbox.b2bOpenAcceptModal('b2b_ctr_confirm');
            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            checks[0].checked = true;
            checks[1].checked = true;

            await sandbox.b2bConfirmAccept('b2b_ctr_confirm', 2);

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null, 'il modale deve chiudersi');
            const rpcCall = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(rpcCall);
            assert.deepEqual([...rpcCall.args.v_vehicle_ids], ['car_1', 'car_2']);
            assert.deepEqual([...rpcCall.args.v_driver_ids], ['drv_1', 'drv_2']);
        });

        test('b2bAcceptContract imposta activeContract e blocca veicoli e autisti', async () => {
            const { sandbox, notifications, mapLogs } = creaAmbienteContratti();
            await sandbox.b2bRefresh();

            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v_10', 'v_11'], ['d_10', 'd_11']);

            const ac = sandbox._b2bState.activeContract;
            assert.ok(ac, 'deve esserci un contratto attivo');
            assert.equal(ac.daily_payout, 4200);
            assert.equal(ac.days_remaining, 14);
            assert.deepEqual(ac.locked_vehicles, ['v_10', 'v_11']);
            assert.deepEqual(ac.locked_drivers, ['d_10', 'd_11']);
            assert.ok(notifications.some(n => n.msg.includes('accettato')));
            assert.ok(mapLogs.some(m => m.includes('Appalto corporate firmato')));
        });

        test('b2bAcceptContract rifiuta se utente non autenticato', async () => {
            const { sandbox, notifications, rpcLog } = creaAmbienteContratti({ currentUser: null });

            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v_1'], ['d_1']);

            assert.equal(sandbox._b2bState.activeContract, null);
            assert.ok(notifications.some(n => n.msg.includes('Devi essere loggato')));
            assert.equal(rpcLog.length, 0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 8. RISOLUZIONE E TICK GIORNALIERO B2B (_b2bDailyTick)
    // ──────────────────────────────────────────────────────────────────────────
    describe('8. Routine giornaliera e incassi B2B (_b2bDailyTick)', () => {
        test('_b2bDailyTick accredita payout giornaliero con accreditatoDalServer SENZA syncCash', async () => {
            const { sandbox, gs, syncedCash, notifications, mapLogs } = creaAmbienteContratti();
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v_1', 'v_2'], []);

            gs.cash = 50000;

            await sandbox._b2bDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 54200, 'deve accreditare 4.200€ localmente');
            assert.deepEqual(syncedCash, [], 'ServerState.syncCash NON deve essere chiamato (doppio conteggio evitato)');
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 13);
            assert.ok(notifications.some(n => n.msg.includes('B2B: +€') && n.msg.includes('4') && n.msg.includes('200')));
            assert.ok(mapLogs.some(m => m.includes('Payout B2B')));
        });

        test('_b2bDailyTick completa il contratto all\'ultimo giorno e aggiunge reputazione', async () => {
            const { sandbox, gs, syncedCash, bigEvents, getB2bActiveDb } = creaAmbienteContratti();
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v_1', 'v_2'], []);

            // Imposta a 1 giorno rimanente
            sandbox._b2bState.activeContract.days_remaining = 1;
            const db = getB2bActiveDb();
            db.days_remaining = 1;

            gs.cash = 10000;
            gs.reputation = 4.0;

            await sandbox._b2bDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 14200, 'incassa l\'ultimo payout');
            assert.equal(gs.reputation, 4.5, 'guadagna +0.5 di reputazione');
            assert.equal(sandbox._b2bState.activeContract, null, 'il contratto attivo viene rimosso');
            assert.deepEqual(syncedCash, [], 'nessun syncCash duplicato');
            assert.ok(bigEvents.some(b => b.title.includes('Contratto Completato')));
        });

        test('_b2bDailyTick non fa nulla se non loggato o nessun contratto attivo', async () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 25000;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 25000);
            assert.deepEqual(syncedCash, []);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 9. RESCISSIONE ANTICIPATA B2B (b2bTerminateContract)
    // ──────────────────────────────────────────────────────────────────────────
    describe('9. Rescissione anticipata appalti B2B (b2bTerminateContract)', () => {
        test('b2bTerminateContract applica penale cash con addebitatoDalServer e riduce reputazione', async () => {
            const { sandbox, gs, syncedCash, bigEvents, mapLogs } = creaAmbienteContratti({ confirmResult: true });
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v_1', 'v_2'], []);

            gs.cash = 100000;
            gs.reputation = 4.0;

            await sandbox.b2bTerminateContract('act_b2b_ctr_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000, 'penale di 15.000€ scalata localmente');
            assert.equal(gs.reputation, 3.5, 'penale reputazione -0.5★');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server scala già la penale');
            assert.equal(sandbox._b2bState.activeContract, null);
            assert.ok(bigEvents.some(b => b.title.includes('Contratto Rescisso')));
            assert.ok(mapLogs.some(m => m.includes('Contratto B2B rescisso')));
        });

        test('b2bTerminateContract rifiutata dall\'utente non esegue RPC e preserva il contratto', async () => {
            const { sandbox, gs, syncedCash, rpcLog } = creaAmbienteContratti({ confirmResult: false });
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v_1'], []);

            const rpcCountBefore = rpcLog.length;
            gs.cash = 50000;

            await sandbox.b2bTerminateContract('act_b2b_ctr_1');

            assert.equal(gs.cash, 50000);
            assert.notEqual(sandbox._b2bState.activeContract, null);
            assert.equal(rpcLog.length, rpcCountBefore, 'nessuna RPC inviata');
            assert.deepEqual(syncedCash, []);
        });

        test('b2bTerminateContract non fa nulla se utente non loggato', async () => {
            const { sandbox, rpcLog } = creaAmbienteContratti({ currentUser: null });
            await sandbox.b2bTerminateContract('any_id');
            assert.equal(rpcLog.length, 0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 10. BLOCCO VEICOLI E AUTISTI (b2bLockedVehicleIds, b2bLockedDriverIds)
    // ──────────────────────────────────────────────────────────────────────────
    describe('10. Blocco e sblocco veicoli e autisti B2B', () => {
        test('b2bLockedVehicleIds e b2bLockedDriverIds restituiscono array corretti', async () => {
            const { sandbox } = creaAmbienteContratti();
            await sandbox.b2bRefresh();

            // Senza contratto attivo
            assert.deepEqual([...sandbox.b2bLockedVehicleIds()], []);
            assert.deepEqual([...sandbox.b2bLockedDriverIds()], []);

            // Con contratto attivo
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['car_alpha', 'car_beta'], ['drv_alpha', 'drv_beta']);
            assert.deepEqual([...sandbox.b2bLockedVehicleIds()], ['car_alpha', 'car_beta']);
            assert.deepEqual([...sandbox.b2bLockedDriverIds()], ['drv_alpha', 'drv_beta']);
        });

        test('b2bLockedVehicleIds gestisce sia array che stringhe JSON serializzate', () => {
            const { sandbox } = creaAmbienteContratti();
            sandbox._b2bState.activeContract = {
                status: 'active',
                locked_vehicles: '["v1","v2"]',
                locked_drivers: '["d1"]',
            };

            assert.deepEqual([...sandbox.b2bLockedVehicleIds()], ['v1', 'v2']);
            assert.deepEqual([...sandbox.b2bLockedDriverIds()], ['d1']);
        });

        test('b2bLockedVehicleIds resiste a JSON non valido', () => {
            const { sandbox } = creaAmbienteContratti();
            sandbox._b2bState.activeContract = {
                status: 'active',
                locked_vehicles: '{not json',
            };

            assert.deepEqual([...sandbox.b2bLockedVehicleIds()], []);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 11. PREVENZIONE DOPPIO CONTEGGIO E CONFORMITÀ MONETARIA
    // ──────────────────────────────────────────────────────────────────────────
    describe('11. Movimenti monetari e prevenzione doppio conteggio', () => {
        test('Corporate Deals: spend ed earn sincronizzano la cassa locale col server via ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 100000;
            gs.corporateTenders = [{
                id: 't_bid',
                status: 'open',
                company: { company_name: 'Pear Tech', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 } },
                playerBid: null,
            }];

            sandbox.CE_placeBid('t_bid', 10000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 90000);
            assert.deepEqual(syncedCash, [90000]);

            sandbox.CE_cancelBid('t_bid');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, [90000, 100000]);
        });

        test('B2B: accreditatoDalServer e addebitatoDalServer NON chiamano ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti({ confirmResult: true });
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1', 'v2'], []);

            gs.cash = 50000;

            // 1. Tick payout dal server
            await sandbox._b2bDailyTick();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 54200);
            assert.deepEqual(syncedCash, [], 'nessun syncCash su tick server');

            // 2. Rescissione con penale dal server
            await sandbox.b2bTerminateContract('act_b2b_ctr_1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 39200);
            assert.deepEqual(syncedCash, [], 'nessun syncCash su penale server');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 12. ISOLAMENTO PAGAMENTI RICORRENTI (Nessun accredito su render o reload)
    // ──────────────────────────────────────────────────────────────────────────
    describe('12. Isolamento pagamenti ricorrenti (verifica bug Holding/Sveglia)', () => {
        test('renderTabContracts può essere invocato N volte senza alterare cassa o pagamenti', () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            gs.cash = 45000;
            gs.corporateContracts = [{
                id: 'c_static',
                companyId: 'Pear Tech',
                company: { company_name: 'Pear Tech', tier: 5, contract_duration_days: 30, payout_per_hour: 500 },
                startDay: 1,
                endDay: 30,
                dailyPayout: 8000,
                totalEarned: 16000,
                status: 'active',
            }];

            for (let i = 0; i < 10; i++) {
                sandbox.renderTabContracts();
            }

            assert.equal(gs.cash, 45000, 'il cash deve rimanere rigorosamente invariato dopo 10 render');
            assert.equal(gs.corporateContracts[0].totalEarned, 16000, 'il totale guadagnato non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata di syncCash dai render');
        });

        test('renderTabB2B può essere invocato N volte senza alterare cassa o pagamenti', async () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1', 'v2'], []);

            gs.cash = 70000;

            for (let i = 0; i < 10; i++) {
                sandbox.renderTabB2B();
            }

            assert.equal(gs.cash, 70000, 'il cash non deve mutare nei render B2B');
            assert.deepEqual(syncedCash, []);
        });

        test('il refresh B2B (b2bRefresh) non accredita denaro né modifica i giorni del contratto', async () => {
            const { sandbox, gs, syncedCash } = creaAmbienteContratti();
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1', 'v2'], []);

            gs.cash = 30000;
            const daysBefore = sandbox._b2bState.activeContract.days_remaining;

            await sandbox.b2bRefresh();
            await sandbox.b2bRefresh();

            assert.equal(gs.cash, 30000);
            assert.equal(sandbox._b2bState.activeContract.days_remaining, daysBefore);
            assert.deepEqual(syncedCash, []);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 13. RENDERING UI ED EVENT DELEGATION
    // ──────────────────────────────────────────────────────────────────────────
    describe('13. Rendering UI e interazione Event Delegation (CSP-safe)', () => {
        test('renderTabContracts disegna KPI bar, bandi aperti e storico bandi', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.corporateTenders = [{
                id: 't_ui_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    industry: 'Tech',
                    lore_description: 'Campus segreti.',
                    contract_duration_days: 30,
                    payout_per_hour: 500,
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 80 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
            gs.tenderHistory = [{
                id: 't_hist_1',
                company: { company_name: 'Old Corp', tier: 2, payout_per_hour: 100 },
                result: { won: true, pScore: 85, bestAI: 60 },
            }];

            sandbox.renderTabContracts();

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Pear Technologies'));
            assert.ok(html.includes('Bandi &amp; Contratti Aziendali'));
            assert.ok(html.includes('Storico Bandi'));
            assert.ok(html.includes('Old Corp'));
            assert.ok(html.includes('VINTO'));
        });

        test('renderTabB2B disegna contratto attivo e opzione di rescissione', async () => {
            const { sandbox } = creaAmbienteContratti();
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1', 'v2'], []);

            sandbox.renderTabB2B();

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Contratto Attivo'));
            assert.ok(html.includes('Servizio Navetta Dirigenziale'));
            assert.ok(html.includes('Rescindi Anticipatamente'));
        });

        test('Event Delegation: trigger cePlaceBid ed evento input su ceBidPreview', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.cash = 100000;
            gs.corporateTenders = [{
                id: 't_evt_1',
                status: 'open',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 3,
                    industry: 'Tech',
                    lore_description: '...',
                    contract_duration_days: 14,
                    payout_per_hour: 200,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 },
                },
                playerBid: null,
            }];

            sandbox.renderTabContracts();

            const slider = sandbox.document.getElementById('pledge-t_evt_1');
            assert.ok(slider, 'lo slider del pledge deve esistere');
            slider.value = '15000';

            // Simula evento input sullo slider tramite ceBidPreview o dispatch
            sandbox.ceBidPreview.call(slider, 't_evt_1');
            const previewVal = sandbox.document.getElementById('bid-pledge-val-t_evt_1');
            assert.equal(previewVal.textContent, '€15.000');

            // Simula click sul pulsante Invia Offerta
            const submitBtn = sandbox.document.querySelector('button.em-bbtn');
            assert.ok(submitBtn, 'il pulsante di invio deve esistere');
            submitBtn.click();

            assert.equal(gs.cash, 85000, 'il click tramite event delegation deve piazzare l\'offerta');
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 15000);
        });

        test('Event Delegation: trigger CE_cancelBid su bando con offerta', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.cash = 80000;
            gs.corporateTenders = [{
                id: 't_evt_cancel',
                status: 'open',
                company: {
                    company_name: 'Pear Tech',
                    tier: 3,
                    industry: 'Tech',
                    lore_description: '...',
                    contract_duration_days: 14,
                    payout_per_hour: 200,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 },
                },
                playerBid: { pledgedCash: 20000, score: 80 },
            }];

            sandbox.renderTabContracts();

            const cancelBtn = sandbox.document.querySelector('button.em-redbtn');
            assert.ok(cancelBtn, 'il tasto annulla deve esistere');
            cancelBtn.click();

            assert.equal(gs.cash, 100000, 'l\'annullamento via click deve rimborsare il pledge');
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 14. ROBUSTEZZA CASI LIMITE ED ERRORI
    // ──────────────────────────────────────────────────────────────────────────
    describe('14. Robustezza casi limite, gestione errori e sicurezza', () => {
        test('CE_Contracts.dailyTick restituisce safe se gameState è nullo', () => {
            const { sandbox } = creaAmbienteContratti();
            sandbox.gameState = null;
            assert.doesNotThrow(() => {
                sandbox.CE_Contracts.dailyTick();
            });
        });

        test('CE_terminateContract con ID inesistente non lancia errori e non altera lo stato', () => {
            const { sandbox, gs } = creaAmbienteContratti();
            gs.corporateContracts = [{ id: 'ctr_exist', status: 'active' }];
            sandbox.CE_terminateContract('ctr_fake');
            assert.equal(gs.corporateContracts[0].status, 'active');
        });

        test('b2bAcceptContract gestisce errore restituito da RPC mostrando errore all\'utente', async () => {
            const { sandbox, notifications } = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Veicoli non conformi' },
                    }),
                },
            });
            await sandbox.b2bRefresh();

            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1'], []);

            assert.equal(sandbox._b2bState.activeContract, null);
            assert.ok(notifications.some(n => n.tipo === 'error'));
        });

        test('b2bTerminateContract gestisce errore RPC mostrando notifica di errore', async () => {
            const { sandbox, notifications } = creaAmbienteContratti({
                confirmResult: true,
                rpcHandlers: {
                    rpc_terminate_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Errore DB' },
                    }),
                },
            });
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1'], []);

            await sandbox.b2bTerminateContract('act_b2b_ctr_1');

            assert.notEqual(sandbox._b2bState.activeContract, null, 'il contratto non deve essere cancellato se la RPC fallisce');
            assert.ok(notifications.some(n => n.tipo === 'error'));
        });

        test('_b2bDailyTick gestisce errore RPC senza rompere lo stato locale', async () => {
            const { sandbox, gs } = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_b2b_daily_tick: async () => ({
                        data: null,
                        error: { message: 'Timeout' },
                    }),
                },
            });
            gs.cash = 40000;
            await sandbox.b2bRefresh();
            await sandbox.b2bAcceptContract('b2b_ctr_1', ['v1'], []);

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 40000, 'il cash deve restare invariato');
        });
    });
});
