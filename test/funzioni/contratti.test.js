'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Collaudo approfondito del modulo Contratti & B2B

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `contracts.js`, `b2b.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, la gestione dei bandi locali e server,
   l'eleggibilità della flotta, la sincronizzazione del denaro senza doppio conteggio,
   l'UI di rendering e l'intero ciclo di vita (apertura, offerta, firma, riscossione,
   scadenza, rescissione).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente di collaudo con mock Supabase e stato completo per Contratti e B2B.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const b2bCatalogDefault = [
        {
            id: 'b2b_cat_1',
            title: 'Servizio Navetta Dirigenziale',
            client_name: 'Nexora Tech',
            client_icon: '🏢',
            required_tier: 'BUSINESS',
            required_count: 2,
            min_reputation: 3.5,
            daily_payout: 4500,
            duration_days: 14,
            penalty_amount: 15000,
            province_id: 'prov_roma',
        },
        {
            id: 'b2b_cat_2',
            title: 'Scorta & Transfer Delegazioni',
            client_name: 'Aethelgard Embassies',
            client_icon: '🏛️',
            required_tier: 'ARMORED',
            required_count: 1,
            min_reputation: 4.5,
            daily_payout: 9000,
            duration_days: 30,
            penalty_amount: 35000,
            province_id: 'prov_milano',
        },
        {
            id: 'b2b_cat_3',
            title: 'VIP Concierge Limousine',
            client_name: 'Solaria Luxury Hotels',
            client_icon: '👑',
            required_tier: 'PREMIUM',
            required_count: 3,
            min_reputation: 4.0,
            daily_payout: 6800,
            duration_days: 7,
            penalty_amount: 20000,
            province_id: 'prov_firenze',
        },
    ];

    let statoB2BDisponibili = (opzioni.b2bContracts || b2bCatalogDefault).map(c => ({ ...c }));
    let statoB2BAttivo = opzioni.b2bActive !== undefined ? (opzioni.b2bActive ? { ...opzioni.b2bActive } : null) : null;

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
                        if (query._filters.user_id && statoB2BAttivo && statoB2BAttivo.user_id === query._filters.user_id && statoB2BAttivo.status === 'active') {
                            return { data: { ...statoB2BAttivo }, error: null };
                        }
                        return { data: null, error: null };
                    }
                    return { data: null, error: null };
                },
                then: (resolve) => {
                    return Promise.resolve({ data: [], error: null }).then(resolve);
                },
            };
            return query;
        },
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoB2BDisponibili, statoB2BAttivo });
            }

            if (nome === 'rpc_get_b2b_contracts') {
                return { data: statoB2BDisponibili, error: null };
            }

            if (nome === 'rpc_accept_b2b_contract') {
                const c = statoB2BDisponibili.find(x => x.id === args.v_contract_id);
                if (!c) return { data: null, error: { message: 'Contratto non trovato' } };
                if (statoB2BAttivo) return { data: null, error: { message: 'Hai già un contratto attivo' } };

                statoB2BAttivo = {
                    id: 'act_' + Math.random().toString(36).slice(2, 7),
                    user_id: env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_test_uuid',
                    contract_id: c.id,
                    title: c.title,
                    client: c.client_name,
                    icon: c.client_icon,
                    daily_payout: c.daily_payout,
                    days_remaining: c.duration_days,
                    duration_days: c.duration_days,
                    penalty: c.penalty_amount,
                    penalty_amount: c.penalty_amount,
                    sla_score: 100,
                    status: 'active',
                    locked_vehicles: args.v_vehicle_ids || [],
                    locked_drivers: args.v_driver_ids || [],
                };
                return { data: { ...statoB2BAttivo }, error: null };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                if (!statoB2BAttivo || statoB2BAttivo.id !== args.v_active_id) {
                    return { data: null, error: { message: 'Contratto attivo non trovato' } };
                }
                const pen = statoB2BAttivo.penalty || statoB2BAttivo.penalty_amount || 0;
                const repPen = 0.5;
                statoB2BAttivo = null;
                return {
                    data: { penalty: pen, rep_penalty: repPen },
                    error: null,
                };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                if (!statoB2BAttivo || statoB2BAttivo.status !== 'active') {
                    return { data: null, error: null };
                }
                statoB2BAttivo.days_remaining -= 1;
                const completed = statoB2BAttivo.days_remaining <= 0;
                const res = {
                    payout: statoB2BAttivo.daily_payout,
                    days_remaining: Math.max(0, statoB2BAttivo.days_remaining),
                    completed: completed,
                    rep_bonus: completed ? 0.8 : 0,
                    title: statoB2BAttivo.contract_title || statoB2BAttivo.title,
                };
                if (completed) {
                    statoB2BAttivo = null;
                }
                return { data: res, error: null };
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

    // Predisponi flotta iniziale, driver, reputazione, cassa e giorno di gioco
    env.sandbox.gameState.day = opzioni.day !== undefined ? opzioni.day : 1;
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.2;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'veh_bus_1', name: 'Mercedes E-Class', tier: 'business', isLease: false, condition: 100, outOfService: null },
        { id: 'veh_bus_2', name: 'BMW Serie 5', tier: 'business', isLease: false, condition: 95, outOfService: null },
        { id: 'veh_vip_1', name: 'Mercedes S-Class', tier: 'vip', isLease: false, condition: 90, outOfService: null },
        { id: 'veh_ultra_1', name: 'Rolls Royce Phantom Armored', tier: 'ultra', isLease: false, condition: 100, outOfService: null },
    ];
    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'drv_1', name: 'Marco V.', assignedCarId: 'veh_bus_1' },
        { id: 'drv_2', name: 'Luca B.', assignedCarId: 'veh_bus_2' },
        { id: 'drv_3', name: 'Alessandro R.', assignedCarId: 'veh_ultra_1' },
    ];

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        statoB2BDisponibili,
        getStatoB2BAttivo: () => statoB2BAttivo,
        setStatoB2BAttivo: (v) => { statoB2BAttivo = v; },
    };
}

describe('Funzione Contratti & B2B — Esecuzione e ciclo di vita completo', () => {

    describe('1. Inizializzazione e recupero dati (b2bInit, b2bRefresh, CE_Contracts.initState)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bRefresh popola contratti disponibili e contratto attivo da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 3, 'deve contenere i 3 contratti B2B dal server');
            assert.equal(sandbox._b2bState.activeContract, null, 'nessun contratto attivo inizialmente');
            assert.ok(sandbox._b2bState._lastFetch > 0, 'timestamp _lastFetch aggiornato');
        });

        test('b2bRefresh carica contratto attivo se presente su Supabase', async () => {
            const ambActive = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_existing_1',
                    user_id: 'user_test_uuid',
                    contract_title: 'Servizio Navetta',
                    contract_client: 'Nexora Tech',
                    daily_payout: 4500,
                    days_remaining: 10,
                    status: 'active',
                    locked_vehicles: ['veh_bus_1'],
                    locked_drivers: ['drv_1'],
                },
            });

            await ambActive.sandbox.b2bRefresh();
            assert.ok(ambActive.sandbox._b2bState.activeContract);
            assert.equal(ambActive.sandbox._b2bState.activeContract.id, 'act_existing_1');
            ambActive.env.stopAllIntervals();
        });

        test('b2bRefresh non crasha se supabaseClient è assente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.b2bRefresh();
            });
        });

        test('b2bInit esegue b2bRefresh quando loggato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_b2b_contracts'), 'b2bInit deve invocare rpc_get_b2b_contracts');
        });

        test('b2bInit non invoca query se utente non loggato', async () => {
            const ambNoAuth = creaAmbienteContratti({ currentUser: null });
            await ambNoAuth.sandbox.b2bInit();

            assert.equal(ambNoAuth.rpcLog.length, 0, 'senza utente loggato non deve fare chiamate');
            ambNoAuth.env.stopAllIntervals();
        });

        test('CE_Contracts.initState inizializza array di stato e nextTenderDay in gameState', () => {
            const { sandbox, gs } = amb;
            delete gs.corporateTenders;
            delete gs.corporateContracts;
            delete gs.tenderHistory;
            delete gs.nextTenderDay;

            sandbox.CE_Contracts.initState();

            assert.ok(Array.isArray(gs.corporateTenders), 'corporateTenders deve essere un array');
            assert.ok(Array.isArray(gs.corporateContracts), 'corporateContracts deve essere un array');
            assert.ok(Array.isArray(gs.tenderHistory), 'tenderHistory deve essere un array');
            assert.equal(gs.nextTenderDay, (gs.day || 1) + 2);
        });
    });

    describe('2. Requisiti di idoneità flotta e reputazione (_b2bCarRank, _b2bReqRank, meetsRequirements, _cCountQualifying)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_b2bCarRank mappa correttamente i tier dei veicoli', () => {
            const { sandbox } = amb;
            assert.equal(sandbox._b2bCarRank({ tier: 'standard' }), 1);
            assert.equal(sandbox._b2bCarRank({ tier: 'business' }), 2);
            assert.equal(sandbox._b2bCarRank({ tier: 'vip' }), 3);
            assert.equal(sandbox._b2bCarRank({ tier: 'group' }), 3);
            assert.equal(sandbox._b2bCarRank({ tier: 'ultra' }), 4);
            assert.equal(sandbox._b2bCarRank({ tier: 'sconosciuto' }), 0);
            assert.equal(sandbox._b2bCarRank(null), 0);
        });

        test('_b2bReqRank mappa i tier richiesti dal catalogo B2B', () => {
            const { sandbox } = amb;
            assert.equal(sandbox._b2bReqRank('BUSINESS'), 2);
            assert.equal(sandbox._b2bReqRank('PREMIUM'), 2);
            assert.equal(sandbox._b2bReqRank('PRESIDENTIAL'), 4);
            assert.equal(sandbox._b2bReqRank('ARMORED'), 4);
            assert.equal(sandbox._b2bReqRank('ULTRA'), 4);
            assert.equal(sandbox._b2bReqRank('ALTRO'), 2); // default 2
        });

        test('CE_Contracts.meetsRequirements verifica reputazione e flotta qualificata', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 4.5; // 4.5 / 5.0 * 100 = 90%
            gs.fleet = [
                { tier: 'business', outOfService: null, condition: 100 },
                { tier: 'vip', outOfService: null, condition: 100 },
            ];

            const comp1 = {
                tender_requirements: { min_reputation: 80, min_fleet_size: 1, required_vehicle_type: 'executive_sedan' }, // executive_sedan -> business
            };
            const req1 = sandbox.CE_Contracts.meetsRequirements(comp1);
            assert.equal(req1.repOk, true);
            assert.equal(req1.fleetOk, true);
            assert.equal(req1.qualifying, 2);

            const compFailRep = {
                tender_requirements: { min_reputation: 95, min_fleet_size: 1, required_vehicle_type: 'executive_sedan' },
            };
            const req2 = sandbox.CE_Contracts.meetsRequirements(compFailRep);
            assert.equal(req2.repOk, false);

            const compFailFleet = {
                tender_requirements: { min_reputation: 80, min_fleet_size: 3, required_vehicle_type: 'executive_sedan' },
            };
            const req3 = sandbox.CE_Contracts.meetsRequirements(compFailFleet);
            assert.equal(req3.fleetOk, false);
        });

        test('_cCountQualifying esclude auto fuori servizio o con condizione <= 10%', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { tier: 'vip', outOfService: null, condition: 100 },
                { tier: 'vip', outOfService: 'in_repair', condition: 100 },
                { tier: 'vip', outOfService: null, condition: 10 }, // <= 10 -> escluso
                { tier: 'vip', outOfService: null, condition: 50 },
            ];

            // luxury_sedan -> vip
            const count = vm.runInContext('_cCountQualifying("luxury_sedan")', sandbox);
            assert.equal(count, 2, 'solo le 2 auto in servizio e cond > 10 devono qualificarsi');
        });

        test('_cPlayerScore calcola correttamente il punteggio con pesi (40% rep, 40% flotta, 20% pledge)', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 5.0; // repPct = 100 -> 40 pt
            gs.fleet = [
                { tier: 'ultra', outOfService: null, condition: 100 },
                { tier: 'ultra', outOfService: null, condition: 100 },
            ];

            const comp = {
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv' }, // armored_suv -> ultra
            };

            // Pledge 50.000€ -> 20 pt -> totale 40 + 40 + 20 = 100
            const scoreMax = vm.runInContext(`_cPlayerScore(${JSON.stringify(comp)}, 50000)`, sandbox);
            assert.equal(scoreMax, 100);

            // Pledge 0€ -> totale 40 + 40 + 0 = 80
            const scoreZeroPledge = vm.runInContext(`_cPlayerScore(${JSON.stringify(comp)}, 0)`, sandbox);
            assert.equal(scoreZeroPledge, 80);
        });
    });

    describe('3. Modale di selezione veicoli B2B (b2bOpenAcceptModal, b2bCheckLimit, b2bConfirmAccept)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bOpenAcceptModal apre modale DOM con checkbox dei veicoli idonei', () => {
            const { sandbox } = amb;

            sandbox.b2bOpenAcceptModal('b2b_cat_1'); // Servizio Navetta, richiede 2 BUSINESS

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modale b2b-select-modal deve essere appeso al DOM');
            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            assert.ok(checks.length >= 2, 'devono essere presenti almeno 2 checkbox veicoli');

            const confirmBtn = sandbox.document.getElementById('b2b-confirm-btn');
            assert.ok(confirmBtn.disabled, 'il bottone di conferma deve essere disabilitato all\'apertura');
        });

        test('b2bOpenAcceptModal mostra errore se i veicoli idonei disponibili sono insufficienti', () => {
            const { sandbox, env } = amb;
            // Solo 1 auto ultra presente nella flotta
            sandbox.b2bOpenAcceptModal('b2b_cat_3'); // Richiede 3 PREMIUM (business o superiore)

            // Abbiamo 2 business + 1 vip + 1 ultra = 4 disponibili -> ok
            // Riduciamo la flotta a 1 sola auto
            sandbox.gameState.fleet = [{ id: 'veh_bus_1', tier: 'business', isLease: false, condition: 100 }];
            sandbox.b2bOpenAcceptModal('b2b_cat_3');

            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bCheckLimit aggiorna conteggio e abilita il tasto conferma al raggiungimento del limite', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_cat_1'); // Richiede 2 veicoli

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            assert.ok(checks.length >= 2);

            // Spunta prima checkbox
            checks[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '1');
            assert.ok(sandbox.document.getElementById('b2b-confirm-btn').disabled);

            // Spunta seconda checkbox
            checks[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');
            assert.equal(sandbox.document.getElementById('b2b-confirm-btn').disabled, false, 'con 2 spunte il tasto deve abilitarsi');
        });

        test('b2bConfirmAccept preleva i veicoli selezionati e auto-associa i driver assegnati', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.b2bOpenAcceptModal('b2b_cat_1');

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            checks[0].checked = true;
            checks[1].checked = true;

            await sandbox.b2bConfirmAccept('b2b_cat_1', 2);

            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc, 'deve invocare rpc_accept_b2b_contract');
            assert.equal(acceptRpc.args.v_contract_id, 'b2b_cat_1');
            assert.equal(acceptRpc.args.v_vehicle_ids.length, 2);
            assert.equal(acceptRpc.args.v_driver_ids.length, 2, 'deve aver trovato i driver assegnati drv_1 e drv_2');

            // Il modale viene rimosso
            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('accettato!')));
        });

        test('b2bConfirmAccept rifiuta con errore se selezionati meno veicoli del richiesto', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.b2bOpenAcceptModal('b2b_cat_1');

            // Nessun veicolo spuntato
            await sandbox.b2bConfirmAccept('b2b_cat_1', 2);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Seleziona almeno 2 veicoli')));
        });
    });

    describe('4. Accettazione e blocco veicoli B2B (b2bAcceptContract, b2bLockedVehicleIds, b2bLockedDriverIds)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bAcceptContract salva il contratto attivo e popola i veicoli/driver bloccati', async () => {
            const { sandbox } = amb;

            await sandbox.b2bAcceptContract('b2b_cat_1', ['veh_bus_1', 'veh_bus_2'], ['drv_1', 'drv_2']);

            assert.ok(sandbox._b2bState.activeContract);
            assert.equal(sandbox._b2bState.activeContract.daily_payout, 4500);
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 14);

            assert.deepEqual([...sandbox.b2bLockedVehicleIds()], ['veh_bus_1', 'veh_bus_2']);
            assert.deepEqual([...sandbox.b2bLockedDriverIds()], ['drv_1', 'drv_2']);
        });

        test('b2bAcceptContract rifiuta se utente non autenticato', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bAcceptContract('b2b_cat_1', ['veh_bus_1'], ['drv_1']);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('b2bAcceptContract gestisce errore RPC (es. contratto già occupato)', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Contratto già assegnato ad altra azienda' },
                    }),
                },
            });
            await ambErr.sandbox.b2bRefresh();

            await ambErr.sandbox.b2bAcceptContract('b2b_cat_1', ['veh_bus_1'], ['drv_1']);

            assert.equal(ambErr.sandbox._b2bState.activeContract, null);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Contratto non accettato')));
            ambErr.env.stopAllIntervals();
        });

        test('b2bLockedVehicleIds e b2bLockedDriverIds restituiscono array vuoto se non c\'è contratto attivo', () => {
            const { sandbox } = amb;
            sandbox._b2bState.activeContract = null;

            assert.deepEqual([...sandbox.b2bLockedVehicleIds()], []);
            assert.deepEqual([...sandbox.b2bLockedDriverIds()], []);
        });
    });

    describe('5. Offerte bandi locali (CE_placeBid, CE_cancelBid, CE_updateBidPreview, cePlaceBid, ceBidPreview)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [
                {
                    id: 'tender_loc_1',
                    companyId: 'Pear Technologies',
                    company: {
                        company_name: 'Pear Technologies',
                        tier: 5,
                        contract_duration_days: 30,
                        payout_per_hour: 6500,
                        tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_electric', min_reputation: 80 },
                    },
                    openedDay: 1,
                    closingDay: 3,
                    playerBid: null,
                    status: 'open',
                },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_placeBid piazza offerta valida e scala il pledge tramite CE_money.spend', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_placeBid('tender_loc_1', 10000);

            assert.equal(gs.cash, 40000, 'il pledge di 10.000€ deve essere scalato');
            const t = gs.corporateTenders[0];
            assert.ok(t.playerBid);
            assert.equal(t.playerBid.pledgedCash, 10000);
            assert.ok(t.playerBid.score > 0);
        });

        test('CE_placeBid con fondi insufficienti non scala denaro e non invia offerta', () => {
            const { sandbox, gs } = amb;
            gs.cash = 5000;

            sandbox.CE_placeBid('tender_loc_1', 20000);

            assert.equal(gs.cash, 5000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });

        test('CE_placeBid adeguamento pledge (aumento o riduzione) gestisce correttamente la differenza', () => {
            const { sandbox, gs } = amb;
            gs.cash = 60000;

            // Prima offerta 10.000€
            sandbox.CE_placeBid('tender_loc_1', 10000);
            assert.equal(gs.cash, 50000);

            // Aumento a 25.000€ -> scala ulteriori 15.000€
            sandbox.CE_placeBid('tender_loc_1', 25000);
            assert.equal(gs.cash, 35000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 25000);

            // Riduzione a 5.000€ -> accredita 20.000€
            sandbox.CE_placeBid('tender_loc_1', 5000);
            assert.equal(gs.cash, 55000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 5000);
        });

        test('CE_placeBid su bando inesistente o chiuso non effettua modifiche', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_placeBid('bando_fantasma', 10000);
            assert.equal(gs.cash, 50000);

            gs.corporateTenders[0].status = 'closed';
            sandbox.CE_placeBid('tender_loc_1', 10000);
            assert.equal(gs.cash, 50000);
        });

        test('CE_cancelBid rimborsa il pledge tramite CE_money.earn e azzera playerBid', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            sandbox.CE_placeBid('tender_loc_1', 15000);
            assert.equal(gs.cash, 35000);

            sandbox.CE_cancelBid('tender_loc_1');

            assert.equal(gs.cash, 50000, 'il pledge di 15.000€ deve essere rimborsato interamente');
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });

        test('CE_cancelBid su bando senza offerta non altera il saldo', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_cancelBid('tender_loc_1');
            assert.equal(gs.cash, 50000);
        });

        test('CE_updateBidPreview aggiorna score e importo pledge negli elementi DOM', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = `
                <div id="bid-score-tender_loc_1">0</div>
                <div id="bid-pledge-val-tender_loc_1">€0</div>
            `;

            sandbox.CE_updateBidPreview('tender_loc_1', 20000);

            assert.ok(Number(sandbox.document.getElementById('bid-score-tender_loc_1').textContent) > 0);
            assert.ok(sandbox.document.getElementById('bid-pledge-val-tender_loc_1').textContent.includes('20.000') || sandbox.document.getElementById('bid-pledge-val-tender_loc_1').textContent.includes('20,000'));
        });

        test('cePlaceBid e ceBidPreview tramite ce-actions leggono i valori da DOM', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            sandbox.document.body.innerHTML = `
                <input id="pledge-tender_loc_1" value="8000">
                <div id="bid-score-tender_loc_1">0</div>
                <div id="bid-pledge-val-tender_loc_1">€0</div>
            `;

            // Preview
            const inputEl = sandbox.document.getElementById('pledge-tender_loc_1');
            sandbox.ceBidPreview.call(inputEl, 'tender_loc_1');
            assert.ok(Number(sandbox.document.getElementById('bid-score-tender_loc_1').textContent) > 0);

            // Place Bid
            sandbox.cePlaceBid('tender_loc_1');
            assert.equal(gs.cash, 42000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 8000);
        });
    });

    describe('6. Rescissione e terminazione contratti (b2bTerminateContract, CE_terminateContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_term_1',
                    user_id: 'user_test_uuid',
                    contract_title: 'Navetta VIP',
                    daily_payout: 4500,
                    penalty: 15000,
                    penalty_amount: 15000,
                    status: 'active',
                },
            });
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bTerminateContract confermato addebita penale e penale reputazione e azzera activeContract', async () => {
            const { sandbox, gs, rpcLog, bigEvents } = amb;
            gs.cash = 50000;
            gs.reputation = 4.0;

            await sandbox.b2bTerminateContract('act_term_1');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_b2b_contract');
            assert.ok(termRpc);
            assert.equal(termRpc.args.v_active_id, 'act_term_1');

            assert.equal(sandbox._b2bState.activeContract, null, 'activeContract deve essere azzerato');
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Rescisso');
        });

        test('b2bTerminateContract con confirm = false non invoca RPC e preserva il contratto', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox.b2bTerminateContract('act_term_1');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
            assert.ok(sandbox._b2bState.activeContract);
        });

        test('b2bTerminateContract senza login non fa nulla', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bTerminateContract('act_term_1');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
        });

        test('CE_terminateContract per contratto locale imposta status su terminated', () => {
            const { sandbox, gs } = amb;
            gs.corporateContracts = [
                { id: 'c_loc_1', status: 'active', company: { company_name: 'Test Corp' } },
            ];

            sandbox.CE_terminateContract('c_loc_1');

            assert.equal(gs.corporateContracts[0].status, 'terminated');
        });

        test('CE_terminateContract rifiutato (confirm = false) mantiene status active', () => {
            const { sandbox, gs } = amb;
            sandbox.confirm = () => false;
            gs.corporateContracts = [
                { id: 'c_loc_1', status: 'active', company: { company_name: 'Test Corp' } },
            ];

            sandbox.CE_terminateContract('c_loc_1');

            assert.equal(gs.corporateContracts[0].status, 'active');
        });
    });

    describe('7. Ciclo giornaliero e riscossione incassi (_b2bDailyTick, CE_Contracts.dailyTick)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_daily_1',
                    user_id: 'user_test_uuid',
                    contract_title: 'Navetta Corporate',
                    daily_payout: 5000,
                    days_remaining: 5,
                    status: 'active',
                },
            });
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_b2bDailyTick accredita payout e decrementa giorni rimanenti', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 20000;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 25000, 'il payout di 5.000€ deve entrare nella cassa locale');
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 4);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('B2B: +€') && n.msg.includes('Navetta Corporate')));
        });

        test('_b2bDailyTick completamento contratto assegna bonus reputazione e azzera activeContract', async () => {
            const ambComp = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_last_day',
                    user_id: 'user_test_uuid',
                    contract_title: 'Gran Tour',
                    daily_payout: 8000,
                    days_remaining: 1, // ultimo giorno
                    status: 'active',
                },
            });
            await ambComp.sandbox.b2bRefresh();
            ambComp.gs.cash = 30000;
            ambComp.gs.reputation = 4.0;

            await ambComp.sandbox._b2bDailyTick();

            assert.equal(ambComp.gs.cash, 38000);
            assert.equal(ambComp.sandbox._b2bState.activeContract, null, 'contratto completato azzerato');
            assert.equal(ambComp.bigEvents.length, 1);
            assert.equal(ambComp.bigEvents[0].title, 'Contratto Completato!');
            ambComp.env.stopAllIntervals();
        });

        test('CE_Contracts.dailyTick raccoglie incassi contratti attivi locali e incrementa totalEarned', () => {
            const { sandbox, gs } = amb;
            gs.day = 5;
            gs.cash = 10000;
            gs.corporateContracts = [
                {
                    id: 'c1',
                    companyId: 'Alpha Corp',
                    company: { company_name: 'Alpha Corp', tier: 3, contract_duration_days: 14 },
                    startDay: 1,
                    endDay: 15,
                    dailyPayout: 3000,
                    totalEarned: 6000,
                    status: 'active',
                },
            ];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 13000, 'il saldo deve salire di 3.000€');
            assert.equal(gs.corporateContracts[0].totalEarned, 9000);
        });

        test('il pagamento ricorrente non avviene all\'apertura della scheda né al rendering', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.corporateContracts = [
                {
                    id: 'c1',
                    company: { company_name: 'Alpha Corp', tier: 3, contract_duration_days: 14 },
                    dailyPayout: 3000,
                    totalEarned: 0,
                    status: 'active',
                },
            ];

            // Renderizza più volte le schede
            sandbox.renderTabB2B();
            sandbox.renderTabContracts();
            sandbox.renderTabB2B();
            sandbox.renderTabContracts();

            assert.equal(gs.cash, 50000, 'il rendering delle tab NON deve accreditare payout ricorrente');
        });
    });

    describe('8. Risoluzione bandi e ciclo di vita contratti locali (CE_Contracts)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('risoluzione bando vinto crea contratto attivo e trattiene il pledge', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.cash = 40000;
            gs.corporateTenders = [
                {
                    id: 'tender_win_1',
                    companyId: 'Pear Technologies',
                    company: {
                        company_name: 'Pear Technologies',
                        tier: 1,
                        contract_duration_days: 30,
                        payout_per_hour: 500,
                        tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 },
                    },
                    openedDay: 1,
                    closingDay: 3,
                    playerBid: { pledgedCash: 5000, score: 999 }, // punteggio schiacciante
                    status: 'open',
                },
            ];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 1, 'il contratto deve essere aggiunto ai contratti attivi');
            assert.equal(gs.corporateContracts[0].status, 'active');
            assert.equal(gs.corporateContracts[0].companyId, 'Pear Technologies');
            assert.equal(gs.cash, 40000, 'il pledge è stato trattenuto e non scalato una seconda volta');

            // Giorno successivo: incasso della prima rata
            gs.day = 4;
            sandbox.CE_Contracts.dailyTick();
            assert.equal(gs.cash, 40000 + gs.corporateContracts[0].dailyPayout, 'incasso della prima giornata accreditato al cambio giorno');
        });

        test('risoluzione bando perso rimborsa automaticamente il pledge', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.cash = 30000;
            gs.corporateTenders = [
                {
                    id: 'tender_lose_1',
                    companyId: 'Titan Forge Defense',
                    company: {
                        company_name: 'Titan Forge Defense',
                        tier: 5,
                        contract_duration_days: 30,
                        payout_per_hour: 8600,
                        tender_requirements: { min_fleet_size: 20, required_vehicle_type: 'armored_suv', min_reputation: 97 },
                    },
                    openedDay: 1,
                    closingDay: 3,
                    playerBid: { pledgedCash: 12000, score: 5 }, // punteggio bassissimo -> perde sicuro
                    status: 'open',
                },
            ];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 42000, 'il pledge di 12.000€ deve essere rimborsato');
            assert.equal(gs.corporateContracts.length, 0, 'nessun contratto attivo vinto');
            assert.ok(gs.tenderHistory.some(t => t.id === 'tender_lose_1' && t.result.won === false));
        });

        test('scadenza contratti: contratti che raggiungono endDay passano ad expired e finiscono in history', () => {
            const { sandbox, gs } = amb;
            gs.day = 16;
            gs.corporateContracts = [
                {
                    id: 'c_expiring',
                    companyId: 'Alpha Corp',
                    company: { company_name: 'Alpha Corp', tier: 3, contract_duration_days: 14 },
                    startDay: 1,
                    endDay: 15,
                    dailyPayout: 2000,
                    totalEarned: 28000,
                    status: 'active',
                },
            ];

            sandbox.CE_Contracts.dailyTick();

            const expired = gs.corporateContracts.find(c => c.id === 'c_expiring');
            assert.ok(expired);
            assert.equal(expired.status, 'expired');
        });

        test('generazione periodica nuovi bandi ogni 3 giorni', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.nextTenderDay = 3;
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 4, 'devono essere generati 4 nuovi bandi');
            assert.equal(gs.nextTenderDay, 6, 'il prossimo batch deve essere schedulato tra 3 giorni');
        });
    });

    describe('9. Rendering dell\'interfaccia (renderTabB2B, renderTabContracts)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabB2B per utente non autenticato mostra messaggio di login', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabB2B();
            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Accedi per visualizzare i contratti disponibili'));
        });

        test('renderTabB2B disegna intestazione, KPI e contratti disponibili', () => {
            const { sandbox } = amb;

            sandbox.renderTabB2B();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Contratti B2B'));
            assert.ok(container.innerHTML.includes('Appalti Disponibili'));
            assert.ok(container.innerHTML.includes('Servizio Navetta Dirigenziale'));
            assert.ok(container.innerHTML.includes('Scorta &amp; Transfer Delegazioni') || container.innerHTML.includes('Scorta & Transfer Delegazioni'));
        });

        test('renderTabB2B con contratto attivo disegna dettagli, SLA e pulsante rescissione', async () => {
            const { sandbox } = amb;
            await sandbox.b2bAcceptContract('b2b_cat_1', ['veh_bus_1', 'veh_bus_2'], ['drv_1', 'drv_2']);

            sandbox.renderTabB2B();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Contratto Attivo'));
            assert.ok(container.innerHTML.includes('Servizio Navetta Dirigenziale'));
            assert.ok(container.innerHTML.includes('SLA Score'));
            assert.ok(container.innerHTML.includes('Rescindi Anticipatamente'));
        });

        test('renderTabContracts disegna KPI, bandi corporate e storico bandi', () => {
            const { sandbox, gs } = amb;
            sandbox.CE_Contracts.initState();
            gs.corporateTenders = [
                {
                    id: 't_card_1',
                    companyId: 'Pear Technologies',
                    company: {
                        company_name: 'Pear Technologies',
                        tier: 5,
                        industry: 'Tech',
                        lore_description: 'Trasporto tech.',
                        contract_duration_days: 30,
                        payout_per_hour: 6500,
                        tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_electric', min_reputation: 80 },
                    },
                    openedDay: 1,
                    closingDay: 3,
                    playerBid: null,
                    status: 'open',
                },
            ];

            sandbox.renderTabContracts();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Bandi &amp; Contratti Aziendali') || container.innerHTML.includes('Bandi & Contratti Aziendali'));
            assert.ok(container.innerHTML.includes('Pear Technologies'));
            assert.ok(container.innerHTML.includes('Invia Offerta'));
        });

        test('renderTabB2B e renderTabContracts non crashano se tab-container non esiste', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabB2B();
                sandbox.renderTabContracts();
            });
        });
    });

    describe('10. Anti-doppio conteggio e persistenza', () => {
        test('_b2bDailyTick muove cassa con accreditatoDalServer e NON chiama ServerState.syncCash', async () => {
            const syncedCash = [];
            const amb = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_sync_test',
                    user_id: 'user_test_uuid',
                    contract_title: 'Navetta Luxury',
                    daily_payout: 7500,
                    days_remaining: 3,
                    status: 'active',
                },
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await amb.sandbox.b2bRefresh();
            amb.gs.cash = 40000;

            await amb.sandbox._b2bDailyTick();

            assert.equal(amb.gs.cash, 47500, 'il cash deve essere aggiornato subito');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già modificato il saldo)');
            amb.env.stopAllIntervals();
        });

        test('b2bTerminateContract muove cassa con addebitatoDalServer e NON chiama ServerState.syncCash', async () => {
            const syncedCash = [];
            const amb = creaAmbienteContratti({
                b2bActive: {
                    id: 'act_sync_term',
                    user_id: 'user_test_uuid',
                    contract_title: 'Navetta Luxury',
                    daily_payout: 7500,
                    penalty: 20000,
                    penalty_amount: 20000,
                    status: 'active',
                },
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });
            await amb.sandbox.b2bRefresh();
            amb.gs.cash = 50000;

            await amb.sandbox.b2bTerminateContract('act_sync_term');

            assert.equal(amb.gs.cash, 30000, 'penale di 20.000€ addebitata localmente');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
            amb.env.stopAllIntervals();
        });

        test('lo stato dei contratti locali persiste in localStorage dopo saveGame', () => {
            const amb = creaAmbienteContratti();
            const { sandbox, gs } = amb;
            sandbox.CE_Contracts.initState();
            gs.cash = 77000;
            gs.corporateContracts = [
                {
                    id: 'c_persisted',
                    companyId: 'Alpha Corp',
                    company: { company_name: 'Alpha Corp', tier: 3, contract_duration_days: 14 },
                    dailyPayout: 2000,
                    totalEarned: 4000,
                    status: 'active',
                },
            ];

            sandbox.saveGame();

            const rawSave = sandbox.localStorage.getItem('chauffeurEmpireSlot_1');
            assert.ok(rawSave);
            const parsed = JSON.parse(rawSave);
            assert.equal(parsed.cash, 77000);
            assert.equal(parsed.corporateContracts.length, 1);
            assert.equal(parsed.corporateContracts[0].id, 'c_persisted');
            amb.env.stopAllIntervals();
        });
    });
});
