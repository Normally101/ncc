'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Verifica approfondita del modulo Contratti & B2B

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `contracts.js` e `b2b.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC per i contratti B2B, il motore AI
   delle gare corporate, la gestione di pegni (pledge), il blocco dei veicoli/autisti,
   il ciclo di vita e incassi periodici (senza duplicazioni da render), le penali di
   rescissione, la scadenza e il rendering dell'interfaccia.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente completo con mock Supabase e stato per Contratti Corporate e B2B.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const b2bDefaultContracts = [
        {
            id: 'b2b_c1',
            client_name: 'Tech Global SpA',
            client_icon: '💻',
            title: 'Servizio Navetta Dirigenziale',
            required_tier: 'BUSINESS',
            required_count: 2,
            min_reputation: 3.5,
            duration_days: 14,
            daily_payout: 4200,
            penalty_amount: 15000,
            province_id: 'prov_roma',
        },
        {
            id: 'b2b_c2',
            client_name: 'Luxury Resort & Spa',
            client_icon: '🏨',
            title: 'Transfer Esclusivo Ospiti VIP',
            required_tier: 'PREMIUM',
            required_count: 1,
            min_reputation: 4.0,
            duration_days: 7,
            daily_payout: 3500,
            penalty_amount: 10000,
            province_id: 'prov_milano',
        },
        {
            id: 'b2b_c3',
            client_name: 'Ambasciata Diplomatica',
            client_icon: '🏛️',
            title: 'Scorta e Servizio Diplomatico',
            required_tier: 'ARMORED',
            required_count: 1,
            min_reputation: 4.8,
            duration_days: 30,
            daily_payout: 8500,
            penalty_amount: 40000,
            province_id: 'prov_roma',
        },
    ];

    let statoB2BContracts = (opzioni.b2bContracts || b2bDefaultContracts).map(c => ({ ...c }));
    let activeB2BContract = opzioni.activeB2BContract !== undefined ? opzioni.activeB2BContract : null;

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: (table) => ({
            select: () => ({
                eq: (col1, val1) => ({
                    eq: (col2, val2) => ({
                        maybeSingle: async () => {
                            if (table === 'b2b_active_contracts') {
                                return { data: activeB2BContract, error: null };
                            }
                            return { data: null, error: null };
                        },
                    }),
                }),
            }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoB2BContracts, activeB2BContract });
            }

            if (nome === 'rpc_get_b2b_contracts') {
                return { data: statoB2BContracts, error: null };
            }

            if (nome === 'rpc_accept_b2b_contract') {
                const c = statoB2BContracts.find(x => x.id === args.v_contract_id);
                if (!c) return { data: null, error: { message: 'Contratto non trovato' } };
                const active = {
                    id: 'act_' + c.id,
                    daily_payout: c.daily_payout,
                    days_remaining: c.duration_days,
                    duration_days: c.duration_days,
                    title: c.title,
                    client: c.client_name,
                    icon: c.client_icon,
                    penalty: c.penalty_amount,
                };
                activeB2BContract = {
                    ...active,
                    contract_title: c.title,
                    contract_client: c.client_name,
                    contract_icon: c.client_icon,
                    penalty_amount: c.penalty_amount,
                    days_total: c.duration_days,
                    sla_score: 100,
                    status: 'active',
                    locked_vehicles: args.v_vehicle_ids,
                    locked_drivers: args.v_driver_ids,
                };
                return { data: active, error: null };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                if (!activeB2BContract) return { data: null, error: { message: 'Nessun contratto attivo' } };
                const pen = activeB2BContract.penalty_amount || 15000;
                activeB2BContract = null;
                return { data: { penalty: pen, rep_penalty: 0.5 }, error: null };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                if (!activeB2BContract) return { data: { payout: 0 }, error: null };
                const remaining = (activeB2BContract.days_remaining || 1) - 1;
                const completed = remaining <= 0;
                const payout = activeB2BContract.daily_payout || 0;
                if (completed) {
                    activeB2BContract = null;
                    return {
                        data: {
                            payout,
                            completed: true,
                            rep_bonus: 0.5,
                            title: 'Contratto B2B',
                        },
                        error: null,
                    };
                }
                activeB2BContract.days_remaining = remaining;
                return {
                    data: {
                        payout,
                        completed: false,
                        days_remaining: remaining,
                        title: activeB2BContract.contract_title || 'Contratto B2B',
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'usr_test_contratti' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi flotta e stato
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.5;
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 150000;
    env.sandbox.gameState.day = opzioni.day !== undefined ? opzioni.day : 1;

    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'car_biz_1', name: 'Mercedes E-Class', tier: 'business', condition: 100, isLease: false, outOfService: null },
        { id: 'car_biz_2', name: 'BMW 5 Series', tier: 'business', condition: 100, isLease: false, outOfService: null },
        { id: 'car_vip_1', name: 'Mercedes S-Class', tier: 'vip', condition: 95, isLease: false, outOfService: null },
        { id: 'car_ultra_1', name: 'Maybach Guard', tier: 'ultra', condition: 100, isLease: false, outOfService: null },
    ];

    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'drv_1', name: 'Mario Rossi', assignedCarId: 'car_biz_1' },
        { id: 'drv_2', name: 'Luigi Verdi', assignedCarId: 'car_biz_2' },
    ];

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        statoB2BContracts,
    };
}

describe('Funzione Contratti & B2B — Esecuzione e ciclo di vita', () => {

    /* ─── 1. B2B: Inizializzazione e recupero dati ─── */
    describe('1. B2B: Inizializzazione e recupero dati (b2bInit, b2bRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bRefresh popola i contratti disponibili e il contratto attivo da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 3, 'deve caricare i 3 contratti B2B dal server');
            assert.equal(sandbox._b2bState.activeContract, null, 'nessun contratto attivo inizialmente');
            assert.ok(sandbox._b2bState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('b2bInit esegue il refresh iniziale per utente loggato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_b2b_contracts'), 'b2bInit deve invocare rpc_get_b2b_contracts');
            assert.equal(sandbox._b2bState.contracts.length, 3);
        });

        test('b2bInit e b2bRefresh non eseguono chiamate se utente non loggato', async () => {
            const ambNoAuth = creaAmbienteContratti({ currentUser: null });
            await ambNoAuth.sandbox.b2bInit();

            assert.equal(ambNoAuth.rpcLog.length, 0, 'senza utente loggato non deve chiamare RPC');
            ambNoAuth.env.stopAllIntervals();
        });

        test('b2bRefresh non crasha se supabaseClient non è presente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.b2bRefresh();
            });
        });
    });

    /* ─── 2. B2B: Accettazione e firma contratto ─── */
    describe('2. B2B: Accettazione e firma contratto (b2bAcceptContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('accetta contratto con successo, vincola veicoli e autisti e aggiorna lo stato', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox.b2bAcceptContract('b2b_c1', ['car_biz_1', 'car_biz_2'], ['drv_1', 'drv_2']);

            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc, 'deve chiamare rpc_accept_b2b_contract');
            assert.equal(acceptRpc.args.v_contract_id, 'b2b_c1');
            assert.deepEqual(acceptRpc.args.v_vehicle_ids, ['car_biz_1', 'car_biz_2']);
            assert.deepEqual(acceptRpc.args.v_driver_ids, ['drv_1', 'drv_2']);

            assert.ok(sandbox._b2bState.activeContract, 'lo stato deve contenere il contratto attivo');
            assert.equal(sandbox._b2bState.activeContract.daily_payout, 4200);
            assert.deepEqual(sandbox.b2bLockedVehicleIds(), ['car_biz_1', 'car_biz_2']);
            assert.deepEqual(sandbox.b2bLockedDriverIds(), ['drv_1', 'drv_2']);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('accettato')));
            assert.ok(env.logs.some(l => l.includes('Appalto corporate firmato')));
        });

        test('rifiuta accettazione se utente non loggato', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bAcceptContract('b2b_c1', ['car_biz_1', 'car_biz_2'], []);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('gestione errore RPC durante l\'accettazione del contratto', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Veicoli già assegnati ad un altro servizio' },
                    }),
                },
            });
            await ambErr.sandbox.b2bRefresh();

            await ambErr.sandbox.b2bAcceptContract('b2b_c1', ['car_biz_1', 'car_biz_2'], []);

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Contratto non accettato')));
            assert.equal(ambErr.sandbox._b2bState.activeContract, null);
            ambErr.env.stopAllIntervals();
        });
    });

    /* ─── 3. B2B: Modal di selezione veicoli e conferma ─── */
    describe('3. B2B: Modal di selezione veicoli (b2bOpenAcceptModal, b2bCheckLimit, b2bConfirmAccept)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bOpenAcceptModal apre modale con veicoli disponibili e idonei', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modal #b2b-select-modal deve essere stato inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Servizio Navetta Dirigenziale'));

            const checkboxes = sandbox.document.querySelectorAll('.b2b-car-check');
            // car_biz_1, car_biz_2, car_vip_1, car_ultra_1 hanno tier >= business -> 4 auto idonee
            assert.equal(checkboxes.length, 4);
        });

        test('b2bOpenAcceptModal rifiuta apertura se veicoli idonei insufficienti', () => {
            const { sandbox, env } = amb;
            // Contratto ARMORED (richiede tier ARMORED/ultra) -> solo car_ultra_1 idoneo
            // Svuotiamo flotta ultra
            sandbox.gameState.fleet = sandbox.gameState.fleet.filter(c => c.tier !== 'ultra');

            sandbox.b2bOpenAcceptModal('b2b_c3');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.equal(modal, null, 'non deve aprire il modal se mancano veicoli');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bCheckLimit abilita il bottone di conferma solo al raggiungimento del numero richiesto', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1'); // richiede 2 veicoli

            const checkboxes = sandbox.document.querySelectorAll('.b2b-car-check');
            const confirmBtn = sandbox.document.getElementById('b2b-confirm-btn');
            assert.equal(confirmBtn.disabled, true, 'il bottone deve partire disabilitato');

            // Seleziona 1 veicolo
            checkboxes[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(confirmBtn.disabled, true);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '1');

            // Seleziona 2° veicolo
            checkboxes[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(confirmBtn.disabled, false, 'il bottone deve abilitarsi');
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');

            // Gli altri checkbox non selezionati devono essere disabilitati
            assert.equal(checkboxes[2].disabled, true);
            assert.equal(checkboxes[3].disabled, true);
        });

        test('b2bConfirmAccept legge le checkbox, associa gli autisti assegnati e chiama b2bAcceptContract', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1');

            const checkboxes = sandbox.document.querySelectorAll('.b2b-car-check');
            checkboxes[0].checked = true; // car_biz_1 (ha drv_1)
            checkboxes[1].checked = true; // car_biz_2 (ha drv_2)

            await sandbox.b2bConfirmAccept('b2b_c1', 2);

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null, 'il modal deve essere chiuso');
            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc);
            assert.deepEqual([...acceptRpc.args.v_vehicle_ids], ['car_biz_1', 'car_biz_2']);
            assert.deepEqual([...acceptRpc.args.v_driver_ids], ['drv_1', 'drv_2']);
        });

        test('b2bConfirmAccept rifiuta la conferma se le checkbox selezionate sono inferiori a requiredCount', async () => {
            const { sandbox, env, rpcLog } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1');

            const checkboxes = sandbox.document.querySelectorAll('.b2b-car-check');
            checkboxes[0].checked = true; // solo 1 selezionato su 2

            await sandbox.b2bConfirmAccept('b2b_c1', 2);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Seleziona almeno 2 veicoli')));
        });
    });

    /* ─── 4. B2B: Rescissione anticipata e penali ─── */
    describe('4. B2B: Rescissione anticipata e penali (b2bTerminateContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({
                activeB2BContract: {
                    id: 'act_b2b_c1',
                    daily_payout: 4200,
                    days_remaining: 10,
                    days_total: 14,
                    contract_title: 'Servizio Navetta Dirigenziale',
                    contract_client: 'Tech Global SpA',
                    contract_icon: '💻',
                    penalty_amount: 15000,
                    sla_score: 95,
                    status: 'active',
                    locked_vehicles: ['car_biz_1', 'car_biz_2'],
                    locked_drivers: ['drv_1', 'drv_2'],
                },
            });
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rescissione confermata applica penale cassa e reputazione via CE_money senza syncCash aggiuntivo', async () => {
            const { sandbox, gs, rpcLog, bigEvents, env } = amb;
            gs.cash = 100000;
            gs.reputation = 4.5;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_b2b_contract');
            assert.ok(termRpc, 'deve invocare rpc_terminate_b2b_contract');
            assert.equal(termRpc.args.v_active_id, 'act_b2b_c1');

            assert.equal(gs.cash, 85000, 'il saldo deve scalare della penale di €15.000');
            assert.equal(gs.reputation, 4.0, 'la reputazione deve diminuire di 0.5');
            assert.equal(sandbox._b2bState.activeContract, null, 'il contratto attivo deve essere resettato');

            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Rescisso');
            assert.ok(env.logs.some(l => l.includes('Contratto B2B rescisso')));
        });

        test('rescissione rifiutata dall\'utente (confirm = false) non effettua chiamate', async () => {
            const { sandbox, rpcLog, gs } = amb;
            sandbox.confirm = () => false;
            gs.cash = 100000;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
            assert.equal(gs.cash, 100000);
            assert.ok(sandbox._b2bState.activeContract);
        });

        test('rescissione senza utente loggato non effettua chiamate', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
        });
    });

    /* ─── 5. B2B: Routine giornaliera e incassi ─── */
    describe('5. B2B: Routine giornaliera e incassi (_b2bDailyTick)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({
                activeB2BContract: {
                    id: 'act_b2b_c1',
                    daily_payout: 4200,
                    days_remaining: 5,
                    days_total: 14,
                    contract_title: 'Servizio Navetta Dirigenziale',
                    contract_client: 'Tech Global SpA',
                    penalty_amount: 15000,
                    status: 'active',
                },
            });
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_b2bDailyTick accredita il payout giornaliero con accreditatoDalServer e scala giorni rimanenti', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 50000;

            await sandbox._b2bDailyTick();

            const tickRpc = rpcLog.find(r => r.nome === 'rpc_b2b_daily_tick');
            assert.ok(tickRpc);
            assert.equal(gs.cash, 54200, 'il saldo deve incrementarsi del payout di €4.200');
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 4);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('B2B: +€')));
        });

        test('_b2bDailyTick su completamento contratto accredita bonus reputazione e libera il contratto', async () => {
            const { sandbox, gs, bigEvents } = amb;
            sandbox._b2bState.activeContract.days_remaining = 1;
            gs.cash = 50000;
            gs.reputation = 4.0;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 54200);
            assert.equal(gs.reputation, 4.5, 'la reputazione deve salire di 0.5 bonus');
            assert.equal(sandbox._b2bState.activeContract, null, 'il contratto deve risultare completato e rimosso');
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Completato!');
        });

        test('_b2bDailyTick senza utente o client Supabase non genera errori', async () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await assert.doesNotReject(async () => {
                await sandbox._b2bDailyTick();
            });
        });
    });

    /* ─── 6. Corporate: Inizializzazione e generazione batch ─── */
    describe('6. Corporate: Inizializzazione e generazione batch (CE_Contracts)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('initState inizializza gli array di stato se non presenti', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = undefined;
            gs.corporateContracts = undefined;
            gs.tenderHistory = undefined;
            gs.nextTenderDay = undefined;

            sandbox.CE_Contracts.initState();

            assert.ok(Array.isArray(gs.corporateTenders));
            assert.ok(Array.isArray(gs.corporateContracts));
            assert.ok(Array.isArray(gs.tenderHistory));
            assert.equal(gs.nextTenderDay, 3);
        });

        test('dailyTick genera un nuovo batch di 4 bandi corporate quando day >= nextTenderDay', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.nextTenderDay = 3;
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 4, 'deve generare 4 nuovi bandi');
            assert.equal(gs.nextTenderDay, 6, 'il prossimo batch deve essere schedulato tra 3 giorni');
            for (const tender of gs.corporateTenders) {
                assert.equal(tender.status, 'open');
                assert.equal(tender.openedDay, 3);
                assert.equal(tender.closingDay, 5); // 3 + 2 giorni di apertura
                assert.ok(tender.company && tender.company.company_name);
            }
        });

        test('dailyTick non genera duplicati di aziende già attive o già a bando', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.nextTenderDay = 3;
            gs.corporateContracts = [
                { companyId: 'Pear Technologies', status: 'active' },
            ];
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            const generatedNames = gs.corporateTenders.map(t => t.companyId);
            assert.ok(!generatedNames.includes('Pear Technologies'), 'Pear Technologies non deve essere duplicata');
            assert.equal(gs.corporateTenders.length, 4);
        });
    });

    /* ─── 7. Corporate: Calcolo punteggi e requisiti flotta ─── */
    describe('7. Corporate: Calcolo punteggi e requisiti flotta (meetsRequirements, _cCountQualifying)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('meetsRequirements verifica reputazione e veicoli qualificanti', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 4.5; // 4.5 / 5.0 * 100 = 90%
            gs.fleet = [
                { id: 'f1', tier: 'ultra', condition: 90, isLease: false, outOfService: null },
                { id: 'f2', tier: 'ultra', condition: 85, isLease: false, outOfService: null },
                { id: 'f3', tier: 'vip', condition: 95, isLease: false, outOfService: null },
            ];

            const company = {
                company_name: 'Titan Defense',
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 85 },
            };

            const res = sandbox.CE_Contracts.meetsRequirements(company);
            assert.equal(res.repOk, true);
            assert.equal(res.fleetOk, true);
            assert.equal(res.qualifying, 2); // 2 veicoli ultra
            assert.equal(res.playerRepPct, 90);
        });

        test('veicoli fuori servizio o con condizione <= 10 non contano nei qualificanti', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'f1', tier: 'ultra', condition: 100, isLease: false, outOfService: null },
                { id: 'f2_broken', tier: 'ultra', condition: 5, isLease: false, outOfService: null },
                { id: 'f3_oos', tier: 'ultra', condition: 100, isLease: false, outOfService: true },
            ];

            const company = {
                company_name: 'Test Co',
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 50 },
            };

            const res = sandbox.CE_Contracts.meetsRequirements(company);
            assert.equal(res.qualifying, 1, 'solo il veicolo integro e attivo deve qualificarsi');
            assert.equal(res.fleetOk, false);
        });
    });

    /* ─── 8. Corporate: Offerta (Pledge), rialzo e cancellazione ─── */
    describe('8. Corporate: Offerta (Pledge), rialzo e cancellazione (CE_placeBid, CE_cancelBid)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 100000, day: 1 });
            amb.gs.corporateTenders = [{
                id: 'tndr_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_electric', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_placeBid scala il pledge e registra l\'offerta con lo score calcolato', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_placeBid('tndr_1', 25000);

            assert.equal(gs.cash, 75000, 'il saldo deve scalare di 25.000€');
            const tender = gs.corporateTenders.find(t => t.id === 'tndr_1');
            assert.ok(tender.playerBid);
            assert.equal(tender.playerBid.pledgedCash, 25000);
            assert.ok(tender.playerBid.score > 0);
        });

        test('CE_placeBid con rialzo scala solo la differenza netta', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_placeBid('tndr_1', 20000);
            assert.equal(gs.cash, 80000);

            // Rialzo a 35.000 (differenza 15.000)
            sandbox.CE_placeBid('tndr_1', 35000);
            assert.equal(gs.cash, 65000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 35000);
        });

        test('CE_placeBid con ribasso riaccredita la differenza netta', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_placeBid('tndr_1', 30000);
            assert.equal(gs.cash, 70000);

            // Ribasso a 10.000 (accredito 20.000)
            sandbox.CE_placeBid('tndr_1', 10000);
            assert.equal(gs.cash, 90000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 10000);
        });

        test('CE_placeBid rifiuta offerte se i fondi non sono sufficienti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 5000;

            sandbox.CE_placeBid('tndr_1', 30000);

            assert.equal(gs.cash, 5000, 'il saldo non deve cambiare');
            assert.equal(gs.corporateTenders[0].playerBid, null);
        });

        test('CE_placeBid applica il tetto massimo di 50.000€ sul pledge', () => {
            const { sandbox, gs } = amb;
            gs.cash = 200000;

            sandbox.CE_placeBid('tndr_1', 999999);

            assert.equal(gs.cash, 150000, 'deve scalare al massimo 50.000€');
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 50000);
        });

        test('CE_placeBid non esegue azioni se il bando è inesistente o chiuso', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders[0].status = 'closed';

            sandbox.CE_placeBid('tndr_1', 10000);
            sandbox.CE_placeBid('tndr_fantasma', 10000);

            assert.equal(gs.cash, 100000, 'nessun movimento di cassa');
        });

        test('CE_cancelBid rimborsa interamente il pledge e annulla l\'offerta', () => {
            const { sandbox, gs } = amb;
            sandbox.CE_placeBid('tndr_1', 20000);
            assert.equal(gs.cash, 80000);

            sandbox.CE_cancelBid('tndr_1');

            assert.equal(gs.cash, 100000, 'il pledge deve essere rimborsato');
            assert.equal(gs.corporateTenders[0].playerBid, null);

            // Secondo click / retrigger: non rimborsa una seconda volta
            sandbox.CE_cancelBid('tndr_1');
            assert.equal(gs.cash, 100000);
        });
    });

    /* ─── 9. Corporate: Risoluzione gare e rimborso in caso di sconfitta ─── */
    describe('9. Corporate: Risoluzione gare (CE_Contracts._resolve)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 50000, day: 1 });
            amb.gs.corporateContracts = [];
            amb.gs.corporateTenders = [{
                id: 'tndr_win',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_electric', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: { pledgedCash: 50000, score: 100 }, // Score massimo -> vittoria garantita
                status: 'open',
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('vittoria del bando converte il bando in contratto attivo con dailyPayout = payout_per_hour * 16', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.nextTenderDay = 3;

            sandbox.CE_Contracts.dailyTick();

            const contract = gs.corporateContracts.find(c => c.companyId === 'Pear Technologies');
            assert.ok(contract, 'deve essere creato il contratto attivo');
            assert.equal(contract.dailyPayout, 6500 * 16); // 104.000€ al giorno
            assert.equal(contract.status, 'active');
            assert.equal(contract.startDay, 3);
            assert.equal(contract.endDay, 33);
            assert.equal(gs.corporateTenders.length, 4); // il vecchio bando risolto e rimosso, 4 nuovi generati
        });

        test('sconfitta del bando rimborsa il pledge dell\'utente e archivia in tenderHistory', () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            gs.corporateTenders[0].playerBid = { pledgedCash: 10000, score: 0 }; // Score 0 -> sconfitta sicura
            gs.day = 3;

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 30000, 'il pledge di 10.000€ deve essere rimborsato');
            assert.equal(gs.corporateContracts.length, 0, 'nessun contratto attivo creato');
            assert.ok(gs.tenderHistory.some(t => t.id === 'tndr_win' && t.result.won === false));
        });
    });

    /* ─── 10. Corporate: Rescissione anticipata e scadenza contratti ─── */
    describe('10. Corporate: Rescissione e scadenza (CE_terminateContract, _expireContracts)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 50000, day: 5 });
            amb.gs.corporateContracts = [{
                id: 'ctr_123',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                startDay: 1,
                endDay: 31,
                dailyPayout: 50000,
                totalEarned: 200000,
                status: 'active',
            }];
            amb.gs.corporateTenders = [];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_terminateContract imposta lo stato a terminated con conferma', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_terminateContract('ctr_123');

            const ctr = gs.corporateContracts.find(c => c.id === 'ctr_123');
            assert.equal(ctr.status, 'terminated');
        });

        test('CE_terminateContract non muta stato se utente rifiuta confirm', () => {
            const { sandbox, gs } = amb;
            sandbox.confirm = () => false;

            sandbox.CE_terminateContract('ctr_123');

            const ctr = gs.corporateContracts.find(c => c.id === 'ctr_123');
            assert.equal(ctr.status, 'active');
        });

        test('_expireContracts imposta lo stato ad expired al raggiungimento di endDay', () => {
            const { sandbox, gs } = amb;
            gs.day = 31; // giorno di scadenza

            sandbox.CE_Contracts.dailyTick();

            const ctr = gs.corporateContracts.find(c => c.id === 'ctr_123');
            assert.equal(ctr.status, 'expired');
        });
    });

    /* ─── 11. Pagamento ricorrente e protezione doppio incasso ─── */
    describe('11. Pagamento ricorrente: una volta per ciclo, mai al render (contracts.js & b2b.js)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({
                cash: 50000,
                day: 2,
                activeB2BContract: {
                    id: 'act_b2b_c1',
                    daily_payout: 4000,
                    days_remaining: 10,
                    days_total: 14,
                    contract_title: 'Navetta B2B',
                    penalty_amount: 10000,
                    status: 'active',
                },
            });
            await amb.sandbox.b2bRefresh();
            amb.gs.corporateContracts = [{
                id: 'ctr_corp_1',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                startDay: 1,
                endDay: 31,
                dailyPayout: 10000,
                totalEarned: 0,
                status: 'active',
            }];
            amb.gs.corporateTenders = [];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts e renderTabB2B ripetuti NON muovono cassa', () => {
            const { sandbox, gs } = amb;
            const cashIniziale = gs.cash;

            // Chiamate ripetute di rendering
            sandbox.renderTabContracts();
            sandbox.renderTabContracts();
            sandbox.renderTabB2B();
            sandbox.renderTabB2B();

            assert.equal(gs.cash, cashIniziale, 'il render delle tab non deve accreditare payout');
        });

        test('b2bRefresh ripetuto NON muove cassa', async () => {
            const { sandbox, gs } = amb;
            const cashIniziale = gs.cash;

            await sandbox.b2bRefresh();
            await sandbox.b2bRefresh();

            assert.equal(gs.cash, cashIniziale, 'il refresh di rete non deve accreditare payout');
        });

        test('il payout Corporate si riscuote ESATTAMENTE una volta per dailyTick', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_Contracts.dailyTick();
            assert.equal(gs.cash, 60000, 'dailyTick accredita €10.000 da contratto corporate');
            assert.equal(gs.corporateContracts[0].totalEarned, 10000);
        });

        test('il payout B2B si accredita ESATTAMENTE una volta per _b2bDailyTick', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            await sandbox._b2bDailyTick();
            assert.equal(gs.cash, 54000, '_b2bDailyTick accredita €4.000 da contratto B2B');
        });
    });

    /* ─── 12. Rendering delle schede e UI ─── */
    describe('12. Rendering delle schede (renderTabContracts, renderTabB2B, CE_updateBidPreview)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({ cash: 100000 });
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts disegna intestazione, KPI, bandi aperti e contratti attivi', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_open',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    industry: 'Tech',
                    tier: 5,
                    lore_description: 'Trasporto campus VIP.',
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 15, required_vehicle_type: 'luxury_electric', min_reputation: 95 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Bandi &amp; Contratti Aziendali'));
            assert.ok(c.innerHTML.includes('Pear Technologies'));
            assert.ok(c.innerHTML.includes('Score stimato'));
            assert.ok(c.innerHTML.includes('data-ce-act="cePlaceBid"'));
        });

        test('CE_updateBidPreview aggiorna lo score e il pledge nel DOM in tempo reale', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_preview',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_electric', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            sandbox.renderTabContracts();

            // Aggiorna anteprima con pledge 30.000€
            sandbox.CE_updateBidPreview('t_preview', 30000);

            const scoreEl = sandbox.document.getElementById('bid-score-t_preview');
            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_preview');

            assert.ok(scoreEl);
            assert.ok(pledgeEl);
            assert.ok(pledgeEl.textContent.includes('30.000') || pledgeEl.textContent.includes('30,000'));
            assert.ok(Number(scoreEl.textContent) > 0);
        });

        test('renderTabB2B per utente non loggato mostra messaggio di invito al login', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Accedi per visualizzare i contratti disponibili'));
        });

        test('renderTabB2B disegna lista contratti disponibili con indicatori requisiti', () => {
            const { sandbox } = amb;
            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Contratti B2B'));
            assert.ok(c.innerHTML.includes('Tech Global SpA'));
            assert.ok(c.innerHTML.includes('Servizio Navetta Dirigenziale'));
            assert.ok(c.innerHTML.includes('data-ce-act="b2bOpenAcceptModal"'));
        });
    });

    /* ─── 13. Event Delegation e ce-actions.js ─── */
    describe('13. Event Delegation e ce-actions.js', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti({ cash: 100000 });
            await amb.sandbox.b2bRefresh();
            amb.gs.corporateTenders = [{
                id: 't_event',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'luxury_electric', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
            amb.sandbox.renderTabContracts();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('cePlaceBid legge il valore dallo slider e chiama CE_placeBid', () => {
            const { sandbox, gs } = amb;
            const slider = sandbox.document.getElementById('pledge-t_event');
            assert.ok(slider);
            slider.value = '20000';

            sandbox.cePlaceBid('t_event');

            assert.equal(gs.cash, 80000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 20000);
        });

        test('ceBidPreview aggiorna la vista tramite this.value', () => {
            const { sandbox } = amb;
            const slider = sandbox.document.getElementById('pledge-t_event');
            assert.ok(slider);
            slider.value = '35000';

            sandbox.ceBidPreview.call(slider, 't_event');

            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_event');
            assert.ok(pledgeEl.textContent.includes('35.000') || pledgeEl.textContent.includes('35,000'));
        });
    });
});
