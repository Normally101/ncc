'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Verifica approfondita dei moduli Contratti
   (Corporate Tenders `contracts.js` e Contratti B2B `b2b.js`)

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `contracts.js`, `b2b.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, il calcolo dei punteggi e requisiti,
   la gestione del denaro tramite CE_money (spend, earn, accreditatoDalServer,
   addebitatoDalServer) senza doppi conteggi né chiamate spurie a syncCash,
   il ciclo di vita (giornaliero, scadenze, risoluzioni, penali) e l'UI di rendering.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente completo di collaudo per contratti Corporate e B2B.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const b2bContractsDefault = [
        {
            id: 'b2b_c1',
            title: 'Servizio Navetta Aeroportuale',
            client_name: 'Aeroporti di Roma',
            client_icon: '✈️',
            required_tier: 'BUSINESS',
            required_count: 2,
            duration_days: 14,
            daily_payout: 4000,
            penalty_amount: 15000,
            min_reputation: 2.5,
            province_id: 'prov_roma',
        },
        {
            id: 'b2b_c2',
            title: 'Delegazione Diplomatica',
            client_name: 'Ambasciata Internazionale',
            client_icon: '🏛️',
            required_tier: 'ARMORED',
            required_count: 1,
            duration_days: 7,
            daily_payout: 12000,
            penalty_amount: 35000,
            min_reputation: 4.5,
            province_id: 'prov_roma',
        },
        {
            id: 'b2b_c3',
            title: 'Transfer Executive Moda',
            client_name: 'Milano Fashion Week',
            client_icon: '👗',
            required_tier: 'PREMIUM',
            required_count: 3,
            duration_days: 10,
            daily_payout: 6000,
            penalty_amount: 20000,
            min_reputation: 3.5,
            province_id: 'prov_milano',
        },
    ];

    let statoB2BContracts = (opzioni.b2bContracts || b2bContractsDefault).map(c => ({ ...c }));
    let statoB2BActive = opzioni.b2bActive !== undefined ? (opzioni.b2bActive ? { ...opzioni.b2bActive } : null) : null;

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: (table) => {
            const query = {
                _table: table,
                _filters: {},
                select: () => query,
                upsert: async () => ({ data: null, error: null }),
                eq: (col, val) => { query._filters[col] = val; return query; },
                maybeSingle: async () => {
                    if (table === 'b2b_active_contracts') {
                        if (statoB2BActive && statoB2BActive.user_id === (env.sandbox.currentUser?.id || 'user_test_uuid') && statoB2BActive.status === 'active') {
                            return { data: { ...statoB2BActive }, error: null };
                        }
                        return { data: null, error: null };
                    }
                    return { data: null, error: null };
                },
                then: (resolve) => {
                    let res = [];
                    if (table === 'b2b_active_contracts') {
                        if (statoB2BActive) res = [{ ...statoB2BActive }];
                    }
                    return Promise.resolve({ data: res, error: null }).then(resolve);
                },
            };
            return query;
        },
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoB2BContracts, statoB2BActive });
            }

            if (nome === 'rpc_get_b2b_contracts') {
                return { data: statoB2BContracts, error: null };
            }

            if (nome === 'rpc_accept_b2b_contract') {
                const c = statoB2BContracts.find(x => x.id === args.v_contract_id);
                if (!c) return { data: null, error: { message: 'Contratto non trovato' } };

                const newActive = {
                    id: 'act_' + Math.random().toString(36).slice(2, 7),
                    user_id: env.sandbox.currentUser?.id || 'user_test_uuid',
                    contract_id: c.id,
                    daily_payout: c.daily_payout,
                    days_remaining: c.duration_days,
                    duration_days: c.duration_days,
                    title: c.title,
                    client: c.client_name,
                    icon: c.client_icon,
                    penalty: c.penalty_amount,
                    status: 'active',
                    locked_vehicles: args.v_vehicle_ids || [],
                    locked_drivers: args.v_driver_ids || [],
                };
                statoB2BActive = newActive;
                return { data: newActive, error: null };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                const act = statoB2BActive || env.sandbox._b2bState?.activeContract;
                if (!act) return { data: null, error: { message: 'Nessun contratto attivo' } };
                const pen = act.penalty !== undefined ? act.penalty : (act.penalty_amount || 15000);
                statoB2BActive = null;
                return {
                    data: { penalty: pen, rep_penalty: 0.5 },
                    error: null,
                };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                const act = statoB2BActive || env.sandbox._b2bState?.activeContract;
                if (!act || act.status !== 'active') {
                    return { data: null, error: null };
                }
                const rem = (act.days_remaining || 1) - 1;
                act.days_remaining = rem;
                if (rem <= 0) {
                    const completedData = {
                        payout: act.daily_payout || 0,
                        completed: true,
                        rep_bonus: 0.5,
                        title: act.title || act.contract_title || 'Appalto B2B',
                        days_remaining: 0,
                    };
                    statoB2BActive = null;
                    return { data: completedData, error: null };
                }
                return {
                    data: {
                        payout: act.daily_payout || 0,
                        completed: false,
                        days_remaining: rem,
                        title: act.title || act.contract_title || 'Appalto B2B',
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

    const dsAlerts = [];
    const dsToasts = [];
    env.sandbox.DS = {
        alert: (opts) => dsAlerts.push(opts),
        toast: (opts) => dsToasts.push(opts),
    };
    env.sandbox.window.DS = env.sandbox.DS;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi stato di gioco di default
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.5;
    env.sandbox.gameState.day = opzioni.day !== undefined ? opzioni.day : 5;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'v_bus_1', name: 'Mercedes E-Class', tier: 'business', condition: 95, isLease: false, outOfService: null },
        { id: 'v_bus_2', name: 'BMW 5-Series', tier: 'business', condition: 90, isLease: false, outOfService: null },
        { id: 'v_vip_1', name: 'Mercedes S-Class', tier: 'vip', condition: 100, isLease: false, outOfService: null },
        { id: 'v_vip_2', name: 'Audi A8 L', tier: 'vip', condition: 85, isLease: false, outOfService: null },
        { id: 'v_ultra_1', name: 'Maybach S680 Guard', tier: 'ultra', condition: 98, isLease: false, outOfService: null },
        { id: 'v_lease_1', name: 'Leased Sedan', tier: 'business', condition: 90, isLease: true, outOfService: null },
        { id: 'v_broken_1', name: 'Broken VIP', tier: 'vip', condition: 5, isLease: false, outOfService: null },
    ];
    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'd_1', name: 'Marco Rossi', assignedCarId: 'v_bus_1' },
        { id: 'd_2', name: 'Luca Bianchi', assignedCarId: 'v_bus_2' },
        { id: 'd_3', name: 'Giovanni Ferrari', assignedCarId: 'v_ultra_1' },
    ];

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        dsAlerts,
        dsToasts,
        statoB2BContracts,
        statoB2BActive,
    };
}

describe('Funzione Contratti — Collaudo profondo (contracts.js & b2b.js)', () => {

    // ── 1. Inizializzazione e stato di base ──────────────────────────────────
    describe('1. Inizializzazione e stato di base (CE_Contracts.initState, b2bInit, b2bRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_Contracts.initState inizializza le strutture dati in gameState se assenti', () => {
            const { sandbox, gs } = amb;
            delete gs.corporateTenders;
            delete gs.corporateContracts;
            delete gs.tenderHistory;
            delete gs.nextTenderDay;

            sandbox.CE_Contracts.initState();

            assert.ok(Array.isArray(gs.corporateTenders), 'corporateTenders deve essere un array');
            assert.ok(Array.isArray(gs.corporateContracts), 'corporateContracts deve essere un array');
            assert.ok(Array.isArray(gs.tenderHistory), 'tenderHistory deve essere un array');
            assert.equal(gs.nextTenderDay, gs.day + 2);
        });

        test('b2bRefresh carica contratti disponibili e contratto attivo da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 3, 'deve caricare i 3 contratti B2B');
            assert.ok(sandbox._b2bState._lastFetch > 0);
        });

        test('b2bInit esegue il refresh dei contratti B2B se utente autenticato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_b2b_contracts'), 'b2bInit deve invocare rpc_get_b2b_contracts');
        });

        test('b2bInit non esegue chiamate se utente non autenticato o supabase assente', async () => {
            const ambNoAuth = creaAmbienteContratti({ currentUser: null });
            await ambNoAuth.sandbox.b2bInit();

            assert.equal(ambNoAuth.rpcLog.length, 0, 'senza autenticazione non deve invocare RPC');
            ambNoAuth.env.stopAllIntervals();
        });
    });

    // ── 2. Calcolo punteggi e requisiti Corporate ────────────────────────────
    describe('2. Calcolo punteggi e requisiti Corporate (meetsRequirements, _cCountQualifying, _cPlayerScore)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('meetsRequirements verifica reputazione e flotta minima qualificata', () => {
            const { sandbox } = amb;
            const company = {
                tender_requirements: {
                    min_fleet_size: 2,
                    required_vehicle_type: 'business_sedan', // richiede rank >= business (rank 2)
                    min_reputation: 80, // rep 4.0 / 5.0 = 80%
                },
            };

            // Con rep 4.5 (90%) e 2 auto business + 1 vip + 1 ultra qualificate (> condition 10)
            const res = sandbox.CE_Contracts.meetsRequirements(company);
            assert.equal(res.repOk, true);
            assert.equal(res.fleetOk, true);
            assert.equal(res.playerRepPct, 90);
            assert.ok(res.qualifying >= 2);
        });

        test('meetsRequirements fallisce se reputazione insufficiente', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 2.0; // 40%
            const company = {
                tender_requirements: {
                    min_fleet_size: 1,
                    required_vehicle_type: 'business_sedan',
                    min_reputation: 80,
                },
            };

            const res = sandbox.CE_Contracts.meetsRequirements(company);
            assert.equal(res.repOk, false);
            assert.equal(res.playerRepPct, 40);
        });

        test('veicoli danneggiati (condition <= 10) o fuori servizio sono esclusi dal conteggio qualificanti', () => {
            const { sandbox } = amb;
            // v_broken_1 ha condition: 5, non deve contare
            // Flotta qualificata vip/ultra attiva: v_vip_1 (100%), v_vip_2 (85%), v_ultra_1 (98%) -> totale = 3
            const vipCount = vm.runInContext('_cCountQualifying("luxury_sedan")', sandbox); // luxury_sedan -> vip
            assert.equal(vipCount, 3, 'solo le 3 auto vip/ultra in buone condizioni e non oos contano');
        });

        test('calcolo _cPlayerScore rispetta pesi: 40% reputazione + 40% flotta + 20% pledge', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 5.0; // 100% rep -> 40 pt
            const company = {
                tender_requirements: {
                    min_fleet_size: 2,
                    required_vehicle_type: 'executive_suv', // business rank 2
                    min_reputation: 90,
                },
            };
            // Flotta disponibile >= 2 auto business -> 100% flotta -> 40 pt
            // Pledge 50.000€ -> 100% pledge -> 20 pt
            const fullScore = vm.runInContext(`_cPlayerScore(${JSON.stringify(company)}, 50000)`, sandbox);
            assert.equal(fullScore, 100);

            // Con pledge 0 -> score = 80
            const zeroPledgeScore = vm.runInContext(`_cPlayerScore(${JSON.stringify(company)}, 0)`, sandbox);
            assert.equal(zeroPledgeScore, 80);
        });
    });

    // ── 3. Invio offerte bandi Corporate ────────────────────────────────────
    describe('3. Invio offerte bandi Corporate (CE_placeBid)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 't_corp_1',
                status: 'open',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'luxury_electric', min_reputation: 90 },
                },
                playerBid: null,
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('invia offerta valida, scala il pledge dalla cassa e registra playerBid', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('t_corp_1', 25000);

            assert.equal(gs.cash, 75000, 'il cash deve scalare di 25.000€');
            const tender = gs.corporateTenders.find(t => t.id === 't_corp_1');
            assert.ok(tender.playerBid);
            assert.equal(tender.playerBid.pledgedCash, 25000);
            assert.ok(tender.playerBid.score > 0);
        });

        test('rialzo di un pledge esistente scala solo la differenza', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('t_corp_1', 10000);
            assert.equal(gs.cash, 90000);

            sandbox.CE_placeBid('t_corp_1', 30000); // aumento di 20.000€
            assert.equal(gs.cash, 70000, 'deve scalare solo il delta di 20.000€');
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 30000);
        });

        test('riduzione di un pledge esistente accredita la differenza', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('t_corp_1', 40000);
            assert.equal(gs.cash, 60000);

            sandbox.CE_placeBid('t_corp_1', 10000); // riduzione di 30.000€
            assert.equal(gs.cash, 90000, 'deve rimborsare il delta di 30.000€');
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 10000);
        });

        test('offerta con fondi insufficienti non modifica la cassa né lo stato', () => {
            const { sandbox, gs } = amb;
            gs.cash = 5000;

            sandbox.CE_placeBid('t_corp_1', 20000);

            assert.equal(gs.cash, 5000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });

        test('offerta su bando non esistente o chiuso non compie azioni', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_placeBid('tndr_inesistente', 10000);
            assert.equal(gs.cash, 50000);

            gs.corporateTenders[0].status = 'closed';
            sandbox.CE_placeBid('t_corp_1', 10000);
            assert.equal(gs.cash, 50000);
        });

        test('pledge viene clampato tra 0 e 50.000€', () => {
            const { sandbox, gs } = amb;
            gs.cash = 200000;

            sandbox.CE_placeBid('t_corp_1', 999999);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 50000, 'il pledge massimo è 50.000€');
            assert.equal(gs.cash, 150000);
        });
    });

    // ── 4. Anteprima offerta e slider UI ─────────────────────────────────────
    describe('4. Anteprima offerta e slider UI (CE_updateBidPreview, ceBidPreview)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 't_corp_prev',
                status: 'open',
                company: {
                    company_name: 'OmniSphere Cloud',
                    tier: 5,
                    payout_per_hour: 7100,
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'executive_suv', min_reputation: 92 },
                },
                playerBid: null,
            }];
            amb.sandbox.renderTabContracts();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_updateBidPreview aggiorna i testi nel DOM per score e importo', () => {
            const { sandbox } = amb;

            sandbox.CE_updateBidPreview('t_corp_prev', 30000);

            const scoreEl = sandbox.document.getElementById('bid-score-t_corp_prev');
            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_corp_prev');

            assert.ok(scoreEl);
            assert.ok(pledgeEl);
            assert.ok(Number(scoreEl.textContent) > 0);
            assert.ok(pledgeEl.textContent.includes('30.000') || pledgeEl.textContent.includes('30,000'));
        });

        test('CE_updateBidPreview per tender inesistente non lancia errori', () => {
            const { sandbox } = amb;
            assert.doesNotThrow(() => {
                sandbox.CE_updateBidPreview('tndr_inesistente', 10000);
            });
        });
    });

    // ── 5. Annullamento offerte Corporate ───────────────────────────────────
    describe('5. Annullamento offerte Corporate (CE_cancelBid)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 't_corp_cancel',
                status: 'open',
                company: {
                    company_name: 'Quantum Ledger',
                    tier: 5,
                    payout_per_hour: 6200,
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'luxury_sedan', min_reputation: 90 },
                },
                playerBid: { pledgedCash: 20000, score: 75 },
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('annullamento rimborsa interamente il pledge e azzera playerBid', () => {
            const { sandbox, gs, dsToasts } = amb;
            gs.cash = 50000;

            sandbox.CE_cancelBid('t_corp_cancel');

            assert.equal(gs.cash, 70000, 'il cash deve essere rimborsato di 20.000€');
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.ok(dsToasts.some(t => t.type === 'info' && t.msg.includes('Pledge rimborsato')));
        });

        test('doppio annullamento non rimborsa una seconda volta', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_cancelBid('t_corp_cancel');
            assert.equal(gs.cash, 70000);

            // Secondo click
            sandbox.CE_cancelBid('t_corp_cancel');
            assert.equal(gs.cash, 70000, 'non deve rimborsare due volte');
        });

        test('annullamento su offerta con 0 pledge azzera playerBid senza muovere denaro', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders[0].playerBid = { pledgedCash: 0, score: 60 };
            gs.cash = 50000;

            sandbox.CE_cancelBid('t_corp_cancel');

            assert.equal(gs.cash, 50000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });
    });

    // ── 6. Risoluzione bandi Corporate e vincita/perdita ─────────────────────
    describe('6. Risoluzione bandi Corporate (CE_Contracts.dailyTick -> _resolve)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('vittoria bando: crea contratto attivo, trattiene pledge e non lo rimborsa due volte', () => {
            const { sandbox, gs } = amb;
            gs.day = 10;
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 'tndr_win_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    contract_duration_days: 30,
                    payout_per_hour: 1000,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_sedan', min_reputation: 50 },
                },
                openedDay: 8,
                closingDay: 10,
                playerBid: { pledgedCash: 20000, score: 999 }, // punteggio imbattibile
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            // Il contratto è vinto e diventa attivo per i giorni successivi
            assert.equal(gs.corporateContracts.length, 1);
            const activeCtr = gs.corporateContracts[0];
            assert.equal(activeCtr.companyId, 'Pear Technologies');
            assert.equal(activeCtr.status, 'active');
            assert.equal(activeCtr.dailyPayout, 16000); // 1000 * 16
            // Il pledge non viene rimborsato (è trattenuto): il cash resta 50.000
            assert.equal(gs.cash, 50000);
        });

        test('sconfitta bando: rimborsa il pledge versato e sposta il bando in storico', () => {
            const { sandbox, gs } = amb;
            gs.day = 10;
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 'tndr_loss_1',
                companyId: 'Helixion BioLabs',
                company: {
                    company_name: 'Helixion BioLabs',
                    tier: 5,
                    contract_duration_days: 14,
                    payout_per_hour: 1000,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_sedan', min_reputation: 50 },
                },
                openedDay: 8,
                closingDay: 10,
                playerBid: { pledgedCash: 15000, score: 0 }, // punteggio bassissimo -> perde contro rivali AI
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 0);
            assert.equal(gs.cash, 65000, 'il pledge di 15.000€ deve essere rimborsato alla perdita');
            assert.equal(gs.tenderHistory.length, 1);
            assert.equal(gs.tenderHistory[0].result.won, false);
        });

        test('bando non ancora giunto al closingDay resta aperto e non viene risolto', () => {
            const { sandbox, gs } = amb;
            gs.day = 9;
            gs.nextTenderDay = 99; // evita generazione di nuovi batch
            gs.corporateTenders = [{
                id: 'tndr_pending',
                companyId: 'NovaTrust Bank',
                company: { company_name: 'NovaTrust Bank', tier: 4, payout_per_hour: 500 },
                openedDay: 8,
                closingDay: 10,
                playerBid: { pledgedCash: 5000, score: 80 },
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.ok(gs.corporateTenders.some(t => t.id === 'tndr_pending' && t.status === 'open'));
        });
    });

    // ── 7. Incassi contratti Corporate e scadenza ───────────────────────────
    describe('7. Incassi contratti Corporate e scadenza (CE_Contracts.dailyTick)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_collectEarnings accredita il dailyPayout solo sui contratti attivi', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            gs.corporateContracts = [
                { id: 'c1', company: { company_name: 'A' }, dailyPayout: 5000, totalEarned: 0, status: 'active', endDay: 20 },
                { id: 'c2', company: { company_name: 'B' }, dailyPayout: 3000, totalEarned: 6000, status: 'active', endDay: 20 },
                { id: 'c3', company: { company_name: 'C' }, dailyPayout: 4000, totalEarned: 8000, status: 'terminated', endDay: 20 },
            ];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 18000, 'deve accreditare 5000 + 3000 = 8000€');
            assert.equal(gs.corporateContracts.find(c => c.id === 'c1').totalEarned, 5000);
            assert.equal(gs.corporateContracts.find(c => c.id === 'c2').totalEarned, 9000);
            assert.equal(gs.corporateContracts.find(c => c.id === 'c3').totalEarned, 8000);
        });

        test('renderTabContracts NON eroga compensi (nessun incasso all\'apertura scheda)', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            gs.corporateContracts = [
                { id: 'c1', company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 }, dailyPayout: 5000, totalEarned: 0, status: 'active', startDay: 1, endDay: 30 },
            ];

            // Renderizza più volte
            sandbox.renderTabContracts();
            sandbox.renderTabContracts();
            sandbox.renderTabContracts();

            assert.equal(gs.cash, 10000, 'il rendering della UI non deve assolutamente muovere denaro');
        });

        test('contratto giunto a endDay passa a status "expired"', () => {
            const { sandbox, gs } = amb;
            gs.day = 30;
            gs.corporateContracts = [
                { id: 'c_exp', company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 }, dailyPayout: 5000, totalEarned: 145000, status: 'active', startDay: 0, endDay: 30 },
            ];

            sandbox.CE_Contracts.dailyTick();

            const ctr = gs.corporateContracts.find(c => c.id === 'c_exp');
            assert.ok(ctr);
            assert.equal(ctr.status, 'expired');
        });
    });

    // ── 8. Risoluzione anticipata contratti Corporate ───────────────────────
    describe('8. Risoluzione anticipata contratti Corporate (CE_terminateContract)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateContracts = [
                { id: 'c_term_1', company: { company_name: 'OmniSphere Cloud', tier: 5, contract_duration_days: 30 }, dailyPayout: 8000, totalEarned: 16000, status: 'active', startDay: 1, endDay: 30 },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminazione confermata imposta status a "terminated"', () => {
            const { sandbox, gs } = amb;
            sandbox.confirm = () => true;

            sandbox.CE_terminateContract('c_term_1');

            assert.equal(gs.corporateContracts[0].status, 'terminated');
        });

        test('terminazione rifiutata (confirm = false) lascia il contratto attivo', () => {
            const { sandbox, gs } = amb;
            sandbox.confirm = () => false;

            sandbox.CE_terminateContract('c_term_1');

            assert.equal(gs.corporateContracts[0].status, 'active');
        });

        test('terminazione su id inesistente non produce errori', () => {
            const { sandbox } = amb;
            assert.doesNotThrow(() => {
                sandbox.CE_terminateContract('c_fantasma');
            });
        });
    });

    // ── 9. Requisiti e idoneità contratti B2B ────────────────────────────────
    describe('9. Requisiti e idoneità contratti B2B (_b2bCarRank, _b2bReqRank)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('gerarchia dei rank veicoli e requisiti di catalogo', () => {
            const { sandbox } = amb;

            // _b2bCarRank
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "standard" })', sandbox), 1);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "business" })', sandbox), 2);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "vip" })', sandbox), 3);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "group" })', sandbox), 3);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "ultra" })', sandbox), 4);
            assert.equal(vm.runInContext('_b2bCarRank(null)', sandbox), 0);

            // _b2bReqRank
            assert.equal(vm.runInContext('_b2bReqRank("BUSINESS")', sandbox), 2);
            assert.equal(vm.runInContext('_b2bReqRank("PREMIUM")', sandbox), 2);
            assert.equal(vm.runInContext('_b2bReqRank("PRESIDENTIAL")', sandbox), 4);
            assert.equal(vm.runInContext('_b2bReqRank("ARMORED")', sandbox), 4);
            assert.equal(vm.runInContext('_b2bReqRank("ULTRA")', sandbox), 4);
        });
    });

    // ── 10. Modale di accettazione contratto B2B ────────────────────────────
    describe('10. Modale di accettazione contratto B2B (b2bOpenAcceptModal, b2bCheckLimit, b2bConfirmAccept)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bOpenAcceptModal blocca apertura e mostra errore se veicoli insufficienti', () => {
            const { sandbox, env } = amb;
            // Bando b2b_c3 richiede 3 auto PREMIUM/business. Riduciamo la flotta a 1 sola auto
            sandbox.gameState.fleet = [
                { id: 'v1', name: 'Auto', tier: 'business', isLease: false, outOfService: null },
            ];

            sandbox.b2bOpenAcceptModal('b2b_c3');

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bOpenAcceptModal crea il modal nel DOM con lista veicoli disponibili', () => {
            const { sandbox } = amb;

            sandbox.b2bOpenAcceptModal('b2b_c1'); // richiede 2 auto BUSINESS

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modal deve essere inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Servizio Navetta Aeroportuale'));

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            assert.ok(checks.length >= 2, 'devono essere presenti almeno 2 veicoli selezionabili');
        });

        test('b2bCheckLimit abilita il bottone di conferma solo al raggiungimento del limite', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1'); // richiede 2 veicoli

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            const confirmBtn = sandbox.document.getElementById('b2b-confirm-btn');

            assert.equal(confirmBtn.disabled, true);

            // Spunta 1 veicolo
            checks[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(confirmBtn.disabled, true);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '1');

            // Spunta 2° veicolo
            checks[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(confirmBtn.disabled, false);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');

            // I veicoli rimanenti non spuntati vengono disabilitati
            if (checks.length > 2) {
                assert.equal(checks[2].disabled, true);
            }
        });

        test('b2bConfirmAccept raccoglie i veicoli e i rispettivi autisti assegnati', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1');

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            checks[0].checked = true; // v_bus_1 (autista d_1)
            checks[1].checked = true; // v_bus_2 (autista d_2)

            await sandbox.b2bConfirmAccept('b2b_c1', 2);

            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc);
            assert.equal(acceptRpc.args.v_contract_id, 'b2b_c1');
            assert.deepEqual(acceptRpc.args.v_vehicle_ids, ['v_bus_1', 'v_bus_2']);
            assert.deepEqual(acceptRpc.args.v_driver_ids, ['d_1', 'd_2']);
            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null, 'il modal deve essere rimosso');
        });
    });

    // ── 11. Accettazione e firma contratti B2B ───────────────────────────────
    describe('11. Accettazione contratti B2B (b2bAcceptContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('accettazione salva activeContract comprensivo di locked_vehicles e locked_drivers', async () => {
            const { sandbox, env } = amb;

            await sandbox.b2bAcceptContract('b2b_c1', ['v_bus_1', 'v_bus_2'], ['d_1', 'd_2']);

            const active = sandbox._b2bState.activeContract;
            assert.ok(active);
            assert.equal(active.contract_title, 'Servizio Navetta Aeroportuale');
            assert.equal(active.daily_payout, 4000);
            assert.deepEqual(active.locked_vehicles, ['v_bus_1', 'v_bus_2']);
            assert.deepEqual(active.locked_drivers, ['d_1', 'd_2']);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('accettato')));
        });

        test('blocco accettazione se utente non loggato', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bAcceptContract('b2b_c1', ['v_bus_1'], ['d_1']);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('gestione errore RPC durante accettazione contratto', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Contratto già assegnato o scaduto' },
                    }),
                },
            });
            await ambErr.sandbox.b2bRefresh();

            await ambErr.sandbox.b2bAcceptContract('b2b_c1', ['v_bus_1'], ['d_1']);

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Contratto non accettato')));
            assert.equal(ambErr.sandbox._b2bState.activeContract, null);
            ambErr.env.stopAllIntervals();
        });
    });

    // ── 12. Blocco veicoli e autisti ─────────────────────────────────────────
    describe('12. Blocco veicoli e autisti (b2bLockedVehicleIds, b2bLockedDriverIds)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bLockedVehicleIds e b2bLockedDriverIds restituiscono array corretti se contratto attivo', () => {
            const { sandbox } = amb;
            sandbox._b2bState.activeContract = {
                status: 'active',
                locked_vehicles: ['v_bus_1', 'v_bus_2'],
                locked_drivers: ['d_1', 'd_2'],
            };

            assert.deepEqual(sandbox.b2bLockedVehicleIds(), ['v_bus_1', 'v_bus_2']);
            assert.deepEqual(sandbox.b2bLockedDriverIds(), ['d_1', 'd_2']);
        });

        test('se contratto non attivo o assente restituiscono array vuoto', () => {
            const { sandbox } = amb;
            sandbox._b2bState.activeContract = null;
            assert.deepEqual(sandbox.b2bLockedVehicleIds(), []);
            assert.deepEqual(sandbox.b2bLockedDriverIds(), []);

            sandbox._b2bState.activeContract = { status: 'completed', locked_vehicles: ['v1'] };
            assert.deepEqual(sandbox.b2bLockedVehicleIds(), []);
        });

        test('tollera locked_vehicles memorizzati come stringa JSON o array nativo', () => {
            const { sandbox } = amb;
            sandbox._b2bState.activeContract = {
                status: 'active',
                locked_vehicles: '["v_vip_1"]',
                locked_drivers: '["d_3"]',
            };

            assert.deepEqual(sandbox.b2bLockedVehicleIds(), ['v_vip_1']);
            assert.deepEqual(sandbox.b2bLockedDriverIds(), ['d_3']);
        });
    });

    // ── 13. Rescissione anticipata contratti B2B ────────────────────────────
    describe('13. Rescissione anticipata contratti B2B (b2bTerminateContract)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_b2b_live',
                    penalty_amount: 20000,
                    status: 'active',
                },
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rescissione confermata applica penale cassa e penale reputazione via CE_money', async () => {
            const { sandbox, gs, rpcLog, bigEvents } = amb;
            gs.cash = 100000;
            gs.reputation = 4.0;
            sandbox.confirm = () => true;

            await sandbox.b2bTerminateContract('act_b2b_live');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_b2b_contract');
            assert.ok(termRpc);
            assert.equal(termRpc.args.v_active_id, 'act_b2b_live');

            assert.equal(gs.cash, 80000, 'penale 20.000€ scalata via addebitatoDalServer');
            assert.equal(gs.reputation, 3.5, 'reputazione scalata di 0.5');
            assert.equal(sandbox._b2bState.activeContract, null);
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Rescisso');
        });

        test('rescissione rifiutata (confirm = false) non chiama RPC né muove denaro', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 100000;
            sandbox.confirm = () => false;

            await sandbox.b2bTerminateContract('act_b2b_live');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
            assert.equal(gs.cash, 100000);
        });

        test('rescissione senza autenticazione non compie azioni', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bTerminateContract('act_b2b_live');

            assert.equal(rpcLog.length, 0);
        });
    });

    // ── 14. Tick giornaliero e completamento B2B ─────────────────────────────
    describe('14. Tick giornaliero e completamento B2B (_b2bDailyTick)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('tick giornaliero accredita payout e riduce i giorni rimanenti', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 20000;
            sandbox._b2bState.activeContract = {
                id: 'act_live_1',
                daily_payout: 4000,
                days_remaining: 5,
                status: 'active',
                title: 'Servizio Navetta',
            };

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 24000, 'il cash aumenta di 4.000€ via accreditatoDalServer');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('B2B: +€4.000') || n.msg.includes('B2B: +€4,000')));
        });

        test('completamento contratto assegna bonus reputazione e azzera activeContract', async () => {
            const ambComplete = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_b2b_daily_tick: async () => ({
                        data: {
                            payout: 12000,
                            completed: true,
                            rep_bonus: 0.6,
                            title: 'Delegazione Diplomatica',
                            days_remaining: 0,
                        },
                        error: null,
                    }),
                },
            });

            ambComplete.gs.cash = 50000;
            ambComplete.gs.reputation = 4.0;
            ambComplete.sandbox._b2bState.activeContract = { id: 'act_done' };

            await ambComplete.sandbox._b2bDailyTick();

            assert.equal(ambComplete.gs.cash, 62000);
            assert.equal(ambComplete.gs.reputation, 4.6);
            assert.equal(ambComplete.sandbox._b2bState.activeContract, null);
            assert.equal(ambComplete.bigEvents.length, 1);
            assert.equal(ambComplete.bigEvents[0].title, 'Contratto Completato!');

            ambComplete.env.stopAllIntervals();
        });

        test('tick B2B con errore RPC non modifica il saldo', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_b2b_daily_tick: async () => ({
                        data: null,
                        error: { message: 'Database busy' },
                    }),
                },
            });

            ambErr.gs.cash = 30000;
            await ambErr.sandbox._b2bDailyTick();

            assert.equal(ambErr.gs.cash, 30000);
            ambErr.env.stopAllIntervals();
        });
    });

    // ── 15. Rendering interfaccia utente ─────────────────────────────────────
    describe('15. Rendering interfaccia utente (renderTabContracts, renderTabB2B)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts disegna intestazione, KPI bar, bandi aperti e storico', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [
                {
                    id: 't_ui_1',
                    company: {
                        company_name: 'Velvet Dominion',
                        tier: 4,
                        industry: 'Luxury Fashion',
                        lore_description: 'Brand fashion elitario.',
                        contract_duration_days: 14,
                        payout_per_hour: 5000,
                        tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'luxury_suv', min_reputation: 85 },
                    },
                    status: 'open',
                    closingDay: 7,
                    playerBid: null,
                },
            ];
            gs.corporateContracts = [
                {
                    id: 'c_ui_active',
                    company: { company_name: 'SkyLuxe Airways', tier: 5, industry: 'Private Aviation', contract_duration_days: 30 },
                    dailyPayout: 110400,
                    totalEarned: 220800,
                    status: 'active',
                    startDay: 1,
                    endDay: 30,
                },
            ];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Bandi &amp; Contratti Aziendali') || c.innerHTML.includes('Bandi & Contratti Aziendali'));
            assert.ok(c.innerHTML.includes('Velvet Dominion'));
            assert.ok(c.innerHTML.includes('SkyLuxe Airways'));
            assert.ok(c.innerHTML.includes('Contratti Attivi'));
        });

        test('renderTabContracts con lista vuota mostra messaggio informativo', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [];
            gs.corporateContracts = [];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessun bando disponibile'));
        });

        test('renderTabB2B per utente non loggato mostra messaggio di accesso', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Accedi per visualizzare i contratti disponibili'));
        });

        test('renderTabB2B per utente loggato disegna contratti disponibili ed eventuale contratto attivo', () => {
            const { sandbox } = amb;
            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Contratti B2B'));
            assert.ok(c.innerHTML.includes('Servizio Navetta Aeroportuale'));
            assert.ok(c.innerHTML.includes('Delegazione Diplomatica'));
            assert.ok(c.innerHTML.includes('Transfer Executive Moda'));
        });
    });

    // ── 16. Event Delegation (ce-actions.js) ─────────────────────────────────
    describe('16. Event Delegation (ce-actions.js: cePlaceBid, ceBidPreview)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 't_del_1',
                status: 'open',
                company: {
                    company_name: 'Titan Forge Defense',
                    tier: 5,
                    payout_per_hour: 8600,
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 95 },
                },
                playerBid: null,
            }];
            amb.sandbox.renderTabContracts();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ceBidPreview aggiorna la preview tramite input handler', () => {
            const { sandbox } = amb;
            const slider = sandbox.document.getElementById('pledge-t_del_1');
            assert.ok(slider);

            slider.value = '35000';
            sandbox.ceBidPreview.call(slider, 't_del_1');

            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_del_1');
            assert.ok(pledgeEl.textContent.includes('35.000') || pledgeEl.textContent.includes('35,000'));
        });

        test('cePlaceBid legge il valore dello slider dal DOM e invoca CE_placeBid', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;

            const slider = sandbox.document.getElementById('pledge-t_del_1');
            slider.value = '20000';

            sandbox.cePlaceBid('t_del_1');

            assert.equal(gs.cash, 80000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 20000);
        });
    });

    // ── 17. Doppio conteggio e sincronizzazione ServerState ───────────────────
    describe('17. Movimenti di denaro e prevenzione doppio conteggio (CE_money)', () => {
        test('CE_placeBid e CE_cancelBid usano CE_money e sincronizzano con ServerState.syncCash se pronto', () => {
            const syncedCash = [];
            const amb = creaAmbienteContratti({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 't_money_1',
                status: 'open',
                company: { company_name: 'Pear', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 } },
                playerBid: null,
            }];

            amb.gs.cash = 100000;

            // Piazza offerta: spend -> syncCash(80000)
            amb.sandbox.CE_placeBid('t_money_1', 20000);
            assert.equal(amb.gs.cash, 80000);
            assert.deepEqual(syncedCash, [80000]);

            // Annulla offerta: earn -> syncCash(100000)
            amb.sandbox.CE_cancelBid('t_money_1');
            assert.equal(amb.gs.cash, 100000);
            assert.deepEqual(syncedCash, [80000, 100000]);

            amb.env.stopAllIntervals();
        });

        test('_b2bDailyTick e b2bTerminateContract usano accreditato/addebitatoDalServer e NON chiamano syncCash', async () => {
            const syncedCash = [];
            const amb = creaAmbienteContratti({
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
                b2bActive: {
                    id: 'act_sync_test',
                    daily_payout: 5000,
                    penalty: 10000,
                    days_remaining: 3,
                    status: 'active',
                    title: 'Appalto Test',
                },
            });
            await amb.sandbox.b2bRefresh();

            amb.gs.cash = 50000;

            // Tick giornaliero
            await amb.sandbox._b2bDailyTick();
            assert.equal(amb.gs.cash, 55000, 'cash locale aggiornato con payout');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash per payout server');

            // Terminazione anticipata
            await amb.sandbox.b2bTerminateContract('act_sync_test');
            assert.equal(amb.gs.cash, 45000, 'cash locale aggiornato con penale (10k)');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash per penale server');

            amb.env.stopAllIntervals();
        });
    });
});
