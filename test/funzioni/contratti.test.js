'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Verifica approfondita dei moduli Contratti
   (Corporate Tenders: `contracts.js` e Contratti Corporate B2B: `b2b.js`)

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `contracts.js`, `b2b.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, il calcolo dei punteggi di offerta,
   la gestione dello stato locale/server, il blocco veicoli, l'integrità economica
   (CE_money / accreditatoDalServer / addebitatoDalServer senza doppio conteggio),
   il ciclo di vita e l'UI di rendering.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase e stato completo per i Contratti B2B e Corporate.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];
    const toasts = [];
    const alerts = [];

    const b2bContractsDefault = [
        {
            id: 'b2b_c1',
            client_name: 'Stark Logistics',
            client_icon: '🏢',
            title: 'Navetta Dirigenziale Hub',
            daily_payout: 4200,
            duration_days: 14,
            penalty_amount: 15000,
            required_tier: 'BUSINESS',
            required_count: 2,
            min_reputation: 3.0,
            province_id: 'prov_rm',
        },
        {
            id: 'b2b_c2',
            client_name: 'Aethelgard Private Banking',
            client_icon: '🏛️',
            title: 'Scorta VIP Ambasciate',
            daily_payout: 8500,
            duration_days: 30,
            penalty_amount: 40000,
            required_tier: 'PRESIDENTIAL',
            required_count: 1,
            min_reputation: 4.5,
            province_id: 'prov_mi',
        },
        {
            id: 'b2b_c3',
            client_name: 'Nexis Tech Global',
            client_icon: '🌐',
            title: 'Delegazione Silicon Hub',
            daily_payout: 6000,
            duration_days: 7,
            penalty_amount: 20000,
            required_tier: 'ULTRA',
            required_count: 2,
            min_reputation: 4.8,
            province_id: 'prov_to',
        },
    ];

    let statoB2BContracts = (opzioni.b2bContracts || b2bContractsDefault).map(c => ({ ...c }));
    let statoB2BActive = opzioni.b2bActiveContract !== undefined ? opzioni.b2bActiveContract : null;

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
                        return { data: statoB2BActive ? { ...statoB2BActive } : null, error: null };
                    }
                    return { data: null, error: null };
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
                if (statoB2BActive) return { data: null, error: { message: 'Hai già un contratto attivo' } };

                statoB2BActive = {
                    id: 'act_' + c.id,
                    contract_id: c.id,
                    user_id: env.sandbox.currentUser ? env.sandbox.currentUser.id : 'usr_test',
                    daily_payout: c.daily_payout,
                    days_remaining: c.duration_days,
                    duration_days: c.duration_days,
                    title: c.title,
                    client: c.client_name,
                    icon: c.client_icon,
                    penalty: c.penalty_amount,
                    locked_vehicles: args.v_vehicle_ids || [],
                    locked_drivers: args.v_driver_ids || [],
                    status: 'active',
                };
                return {
                    data: {
                        id: statoB2BActive.id,
                        daily_payout: statoB2BActive.daily_payout,
                        days_remaining: statoB2BActive.days_remaining,
                        duration_days: statoB2BActive.duration_days,
                        title: statoB2BActive.title,
                        client: statoB2BActive.client,
                        icon: statoB2BActive.icon,
                        penalty: statoB2BActive.penalty,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                if (!statoB2BActive) return { data: null, error: { message: 'Nessun contratto attivo' } };
                const penalty = statoB2BActive.penalty || 15000;
                statoB2BActive = null;
                return {
                    data: { penalty: penalty, rep_penalty: 0.5 },
                    error: null,
                };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                if (!statoB2BActive) return { data: { payout: 0, completed: false }, error: null };
                statoB2BActive.days_remaining = (statoB2BActive.days_remaining || 1) - 1;
                const isCompleted = statoB2BActive.days_remaining <= 0;
                const payout = statoB2BActive.daily_payout;
                const title = statoB2BActive.title;
                if (isCompleted) {
                    statoB2BActive = null;
                    return {
                        data: {
                            payout: payout,
                            completed: true,
                            rep_bonus: 0.5,
                            title: title,
                            days_remaining: 0,
                        },
                        error: null,
                    };
                }
                return {
                    data: {
                        payout: payout,
                        completed: false,
                        rep_bonus: 0,
                        title: title,
                        days_remaining: statoB2BActive.days_remaining,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'usr_test_123' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    env.sandbox.DS = {
        toast: (opts) => toasts.push(opts),
        alert: (opts) => alerts.push(opts),
    };
    env.sandbox.window.DS = env.sandbox.DS;

    // Predisponi flotta, driver, reputazione, cassa
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    env.sandbox.gameState.day = opzioni.day !== undefined ? opzioni.day : 1;
    env.sandbox.gameState.prestige = opzioni.prestige !== undefined ? opzioni.prestige : 0;

    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'veh_bus_1', name: 'Mercedes E-Class', tier: 'business', condition: 95, isLease: false, outOfService: null },
        { id: 'veh_bus_2', name: 'BMW 5 Series', tier: 'business', condition: 90, isLease: false, outOfService: null },
        { id: 'veh_vip_1', name: 'Mercedes S-Class', tier: 'vip', condition: 92, isLease: false, outOfService: null },
        { id: 'veh_ultra_1', name: 'Rolls Royce Ghost', tier: 'ultra', condition: 100, isLease: false, outOfService: null },
        { id: 'veh_ultra_2', name: 'Maybach S680', tier: 'ultra', condition: 98, isLease: false, outOfService: null },
    ];

    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'drv_1', name: 'Marco Rossi', assignedCarId: 'veh_bus_1', status: 'idle' },
        { id: 'drv_2', name: 'Luca Bianchi', assignedCarId: 'veh_bus_2', status: 'idle' },
        { id: 'drv_3', name: 'Giuseppe Verdi', assignedCarId: 'veh_ultra_1', status: 'idle' },
    ];

    env.sandbox.gameState.corporateTenders = opzioni.corporateTenders || [];
    env.sandbox.gameState.corporateContracts = opzioni.corporateContracts || [];
    env.sandbox.gameState.tenderHistory = opzioni.tenderHistory || [];

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        toasts,
        alerts,
        statoB2BContracts,
        statoB2BActive,
    };
}

describe('Modulo Contratti & B2B — Verifica Approfondita', () => {

    /* ═══════════════════════════════════════════════════════════════════════
       PARTE 1: CONTRATTI CORPORATE B2B (b2b.js)
       ═══════════════════════════════════════════════════════════════════════ */

    describe('1. Inizializzazione B2B e Recupero Dati (b2bInit, b2bRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bRefresh popola contratti disponibili e contratto attivo da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 3, 'deve caricare i 3 contratti del mock');
            assert.equal(sandbox._b2bState.activeContract, null, 'nessun contratto attivo inizialmente');
            assert.ok(sandbox._b2bState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('b2bInit invoca il refresh iniziale se utente loggato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_b2b_contracts'), 'deve chiamare rpc_get_b2b_contracts');
            assert.equal(sandbox._b2bState.contracts.length, 3);
        });

        test('b2bInit e b2bRefresh non eseguono chiamate se utente non loggato', async () => {
            const ambNoAuth = creaAmbienteContratti({ currentUser: null });
            await ambNoAuth.sandbox.b2bInit();

            assert.equal(ambNoAuth.rpcLog.length, 0, 'senza utente non deve invocare RPC');
            ambNoAuth.env.stopAllIntervals();
        });

        test('b2bRefresh gestisce assenza di supabaseClient senza crash', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.b2bRefresh();
            });
        });

        test('apertura scheda o refresh non muove denaro né locale né sul server', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const cashIniziale = gs.cash;

            await sandbox.b2bRefresh();
            sandbox.renderTabB2B();

            assert.equal(gs.cash, cashIniziale, 'il cash non deve mutare su refresh o render');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_sync_cash' || r.nome === 'rpc_b2b_daily_tick').length, 0);
        });
    });

    describe('2. Requisiti, Mappatura Rank e Modal di Selezione Veicoli', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('gerarchia rank veicoli catalogo vs flotta (_b2bCarRank, _b2bReqRank)', () => {
            const { sandbox } = amb;

            assert.equal(sandbox._b2bCarRank({ tier: 'standard' }), 1);
            assert.equal(sandbox._b2bCarRank({ tier: 'business' }), 2);
            assert.equal(sandbox._b2bCarRank({ tier: 'vip' }), 3);
            assert.equal(sandbox._b2bCarRank({ tier: 'group' }), 3);
            assert.equal(sandbox._b2bCarRank({ tier: 'ultra' }), 4);

            assert.equal(sandbox._b2bReqRank('BUSINESS'), 2);
            assert.equal(sandbox._b2bReqRank('PREMIUM'), 2);
            assert.equal(sandbox._b2bReqRank('PRESIDENTIAL'), 4);
            assert.equal(sandbox._b2bReqRank('ARMORED'), 4);
            assert.equal(sandbox._b2bReqRank('ULTRA'), 4);
        });

        test('b2bOpenAcceptModal blocca se flotta idonea insufficiente', () => {
            const { sandbox, env } = amb;
            // c3 richiede 2 veicoli ULTRA. Rimuoviamo i veicoli ultra.
            sandbox.gameState.fleet = [
                { id: 'veh_bus_1', name: 'Mercedes E-Class', tier: 'business', condition: 95, isLease: false },
            ];

            sandbox.b2bOpenAcceptModal('b2b_c3');

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null, 'il modal non deve aprirsi');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bOpenAcceptModal apre modal DOM con lista veicoli disponibili non bloccati', () => {
            const { sandbox } = amb;

            sandbox.b2bOpenAcceptModal('b2b_c1');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modal deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('Navetta Dirigenziale Hub'));
            assert.ok(modal.innerHTML.includes('Stark Logistics'));

            const checkboxes = modal.querySelectorAll('.b2b-car-check');
            assert.ok(checkboxes.length >= 2, 'devono essere mostrati almeno i veicoli business e superiori');
        });

        test('b2bCheckLimit abilita il pulsante conferma solo quando la quota è raggiunta', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1'); // richiede 2 veicoli

            const btn = sandbox.document.getElementById('b2b-confirm-btn');
            assert.equal(btn.disabled, true);

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            checks[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(btn.disabled, true);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '1');

            checks[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(btn.disabled, false);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');
        });

        test('b2bConfirmAccept auto-seleziona i driver corretti da gameState.drivers tramite assignedCarId', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1'); // richiede 2 veicoli

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            // Seleziona veh_bus_1 e veh_bus_2
            checks.forEach(cb => {
                if (cb.value === 'veh_bus_1' || cb.value === 'veh_bus_2') cb.checked = true;
                else cb.checked = false;
            });

            await sandbox.b2bConfirmAccept('b2b_c1', 2);

            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc, 'deve invocare rpc_accept_b2b_contract');
            assert.deepEqual(acceptRpc.args.v_vehicle_ids, ['veh_bus_1', 'veh_bus_2']);
            // I driver associati a veh_bus_1 e veh_bus_2 in gameState.drivers sono drv_1 e drv_2
            assert.deepEqual(acceptRpc.args.v_driver_ids, ['drv_1', 'drv_2'], 'deve estrarre i driver ID corretti da gameState.drivers');
        });

        test('b2bConfirmAccept con selezione inferiore al requisito viene rifiutata', async () => {
            const { sandbox, env, rpcLog } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1');

            // Nessuna checkbox spuntata
            await sandbox.b2bConfirmAccept('b2b_c1', 2);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Seleziona almeno 2 veicoli')));
        });
    });

    describe('3. Accettazione e Firma Contratto (b2bAcceptContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('firma contratto imposta activeContract e blocca i veicoli per il dispatch corse', async () => {
            const { sandbox, env } = amb;

            await sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1', 'veh_bus_2'], ['drv_1', 'drv_2']);

            assert.ok(sandbox._b2bState.activeContract, 'activeContract deve essere popolato');
            assert.equal(sandbox._b2bState.activeContract.daily_payout, 4200);
            assert.equal(sandbox._b2bState.activeContract.status, 'active');

            // Verifica blocco veicoli
            const lockedVehs = sandbox.b2bLockedVehicleIds();
            assert.deepEqual(lockedVehs, ['veh_bus_1', 'veh_bus_2']);

            const lockedDrvs = sandbox.b2bLockedDriverIds();
            assert.deepEqual(lockedDrvs, ['drv_1', 'drv_2']);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Navetta Dirigenziale Hub')));
            assert.ok(env.logs.some(l => l.includes('Appalto corporate firmato')));
        });

        test('b2bAcceptContract senza autenticazione rifiuta l\'azione', async () => {
            const { sandbox, env, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1'], []);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('gestione errore RPC durante accettazione contratto', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Contratto già assegnato ad altra azienda' },
                    }),
                },
            });
            await ambErr.sandbox.b2bRefresh();

            await ambErr.sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1'], []);

            assert.equal(ambErr.sandbox._b2bState.activeContract, null);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Contratto non accettato')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('4. Rescissione Anticipata Contratto B2B (b2bTerminateContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
            await amb.sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1', 'veh_bus_2'], ['drv_1', 'drv_2']);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rescissione confermata applica penale cash e reputazione tramite CE_money (senza syncCash)', async () => {
            const { sandbox, gs, bigEvents, rpcLog } = amb;
            gs.cash = 100000;
            gs.reputation = 4.5;

            const activeId = sandbox._b2bState.activeContract.id;
            await sandbox.b2bTerminateContract(activeId);

            assert.equal(gs.cash, 85000, 'penale di 15.000€ scalata tramite addebitatoDalServer');
            assert.equal(Math.round(gs.reputation * 10) / 10, 4.0, 'penale reputazione 0.5 scalata');
            assert.equal(sandbox._b2bState.activeContract, null, 'activeContract azzerato');
            assert.deepEqual(sandbox.b2bLockedVehicleIds(), [], 'veicoli sbloccati');

            // Nessuna chiamata a rpc_sync_cash (evita doppio addebito server)
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_sync_cash').length, 0);

            // Modale BigEvent
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Rescisso');
        });

        test('rescissione rifiutata dall\'utente (confirm = false) non chiama RPC e non tocca nulla', async () => {
            const { sandbox, gs, rpcLog } = amb;
            sandbox.confirm = () => false;
            const cashPrima = gs.cash;
            const repPrima = gs.reputation;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
            assert.equal(gs.cash, cashPrima);
            assert.equal(gs.reputation, repPrima);
            assert.ok(sandbox._b2bState.activeContract);
        });

        test('rescissione senza login non esegue RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bTerminateContract('act_b2b_c1');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
        });
    });

    describe('5. Routine Giornaliera e Incassi B2B (_b2bDailyTick)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
            await amb.sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1', 'veh_bus_2'], []);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_b2bDailyTick accredita payout giornaliero tramite accreditatoDalServer senza syncCash', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.cash = 50000;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 54200, 'cash incrementato di 4.200€');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_sync_cash').length, 0, 'mai chiamare syncCash da rpc server');
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 13);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Navetta Dirigenziale Hub')));
        });

        test('_b2bDailyTick a fine durata completa il contratto e assegna bonus reputazione', async () => {
            const { sandbox, gs, bigEvents } = amb;
            gs.cash = 50000;
            gs.reputation = 4.0;
            sandbox._b2bState.activeContract.days_remaining = 1;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 54200, 'ultimo payout accreditato');
            assert.equal(gs.reputation, 4.5, 'bonus reputazione +0.5 aggiunto');
            assert.equal(sandbox._b2bState.activeContract, null, 'contratto attivo azzerato a completamento');
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Completato!');
        });

        test('_b2bDailyTick senza contratto attivo o con errore RPC non accredita cassa', async () => {
            const { sandbox, gs } = amb;
            sandbox._b2bState.activeContract = null;
            gs.cash = 50000;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 50000);
        });
    });

    describe('6. Rendering Scheda B2B (renderTabB2B)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabB2B per utente non loggato mostra messaggio di accesso', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Accedi per visualizzare i contratti disponibili'));
        });

        test('renderTabB2B senza contratto attivo mostra lista appalti disponibili e KPI vuoti', () => {
            const { sandbox } = amb;
            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Contratti B2B'));
            assert.ok(c.innerHTML.includes('Navetta Dirigenziale Hub'));
            assert.ok(c.innerHTML.includes('Scorta VIP Ambasciate'));
            assert.ok(c.innerHTML.includes('Nessun contratto attivo'));
            assert.ok(c.innerHTML.includes('data-ce-act="b2bOpenAcceptModal"'));
        });

        test('renderTabB2B con contratto attivo mostra progresso, SLA, veicoli bloccati e tasto rescissione', async () => {
            const { sandbox } = amb;
            await sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1', 'veh_bus_2'], []);

            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('ATTIVO'));
            assert.ok(c.innerHTML.includes('Rescindi Anticipatamente'));
            assert.ok(c.innerHTML.includes('data-ce-act="b2bTerminateContract"'));
            assert.ok(c.innerHTML.includes('Mercedes E-Class, BMW 5 Series'));
        });

        test('renderTabB2B non crasha in assenza di #tab-container', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabB2B();
            });
        });
    });


    /* ═══════════════════════════════════════════════════════════════════════
       PARTE 2: SISTEMA BANDI CORPORATE (contracts.js)
       ═══════════════════════════════════════════════════════════════════════ */

    describe('7. Inizializzazione e Generazione Batch Bandi (CE_Contracts)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('initState inizializza gli array di stato se assenti', () => {
            const { sandbox, gs } = amb;
            delete gs.corporateTenders;
            delete gs.corporateContracts;
            delete gs.tenderHistory;
            delete gs.nextTenderDay;

            sandbox.CE_Contracts.initState();

            assert.ok(Array.isArray(gs.corporateTenders));
            assert.ok(Array.isArray(gs.corporateContracts));
            assert.ok(Array.isArray(gs.tenderHistory));
            assert.equal(gs.nextTenderDay, 3);
        });

        test('dailyTick genera 4 nuovi bandi corporate a ciclo (ogni 3 giorni)', () => {
            const { sandbox, gs, alerts } = amb;
            gs.day = 3;
            gs.nextTenderDay = 3;

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 4, 'un batch genera esattamente 4 bandi');
            assert.equal(gs.nextTenderDay, 6, 'il prossimo batch deve essere a day + 3');
            assert.ok(alerts.some(a => a.text.includes('nuovi bandi corporate')));

            for (const tender of gs.corporateTenders) {
                assert.ok(tender.id.startsWith('tndr_'));
                assert.equal(tender.status, 'open');
                assert.equal(tender.openedDay, 3);
                assert.equal(tender.closingDay, 5); // 3 + 2
                assert.ok(tender.company.company_name);
            }
        });

        test('generazione bandi esclude aziende con bandi o contratti già attivi', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.nextTenderDay = 3;
            gs.corporateContracts = [{
                id: 'ctr_existing',
                companyId: 'Pear Technologies',
                status: 'active',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.filter(t => t.companyId === 'Pear Technologies').length, 0);
        });
    });

    describe('8. Requisiti e Calcolo Punteggio Offerta (_cPlayerScore, meetsRequirements)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('meetsRequirements verifica reputazione e veicoli idonei', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 4.5; // 90%
            gs.fleet = [
                { id: 'v1', tier: 'ultra', condition: 90, outOfService: null },
                { id: 'v2', tier: 'ultra', condition: 85, outOfService: null },
            ];

            const co = {
                company_name: 'Titan Defense',
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 85 },
            };

            const checkOk = sandbox.CE_Contracts.meetsRequirements(co);
            assert.equal(checkOk.repOk, true);
            assert.equal(checkOk.fleetOk, true);
            assert.equal(checkOk.qualifying, 2);

            // Fallimento reputazione
            gs.reputation = 3.5; // 70% < 85%
            const checkRepFail = sandbox.CE_Contracts.meetsRequirements(co);
            assert.equal(checkRepFail.repOk, false);

            // Fallimento flotta (veicolo fuori servizio)
            gs.reputation = 4.5;
            gs.fleet[0].outOfService = true;
            const checkFleetFail = sandbox.CE_Contracts.meetsRequirements(co);
            assert.equal(checkFleetFail.fleetOk, false);
        });

        test('calcolo punteggio offerta con tetto massimo a 100 anche con prestigio', () => {
            const { sandbox, gs } = amb;
            // Con prestigio 2 e reputazione 6.5 (> 5.0), il punteggio non deve eccedere 100
            gs.reputation = 6.5;
            gs.fleet = [
                { id: 'v1', tier: 'ultra', condition: 100, outOfService: null },
                { id: 'v2', tier: 'ultra', condition: 100, outOfService: null },
            ];

            const co = {
                company_name: 'Test Corp',
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 90 },
            };

            // Esegui calcolo punteggio tramite funzione interna
            const scoreMax = vm.runInContext(`_cPlayerScore(${JSON.stringify(co)}, 50000)`, sandbox);
            assert.equal(scoreMax, 100, 'il punteggio deve saturare a 100 e non superarlo');
        });

        test('CE_updateBidPreview aggiorna gli elementi DOM nel tender card', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_preview',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 15, required_vehicle_type: 'luxury_electric', min_reputation: 95 },
                },
                status: 'open',
            }];

            sandbox.document.body.innerHTML = `
                <div id="tab-container">
                    <span id="bid-score-t_preview">0</span>
                    <span id="bid-pledge-val-t_preview">€0</span>
                </div>
            `;

            sandbox.CE_updateBidPreview('t_preview', 30000);

            const scoreEl = sandbox.document.getElementById('bid-score-t_preview');
            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_preview');

            assert.ok(Number(scoreEl.textContent) >= 0);
            assert.ok(pledgeEl.textContent.includes('30.000') || pledgeEl.textContent.includes('30,000'));
        });
    });

    describe('9. Invio Offerta Bando Corporate (CE_placeBid)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 100000 });
            amb.sandbox.gameState.corporateTenders = [{
                id: 't_bid_1',
                companyId: 'Quantum Ledger',
                company: {
                    company_name: 'Quantum Ledger',
                    tier: 5,
                    payout_per_hour: 6200,
                    contract_duration_days: 14,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 50 },
                },
                status: 'open',
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('offerta valida scala il pledge dal cash e sincronizza con ServerState', () => {
            const { sandbox, gs, toasts } = amb;

            sandbox.CE_placeBid('t_bid_1', 25000);

            assert.equal(gs.cash, 75000, 'cash scalato di 25.000€ tramite CE_money.spend');
            const tender = gs.corporateTenders[0];
            assert.ok(tender.playerBid);
            assert.equal(tender.playerBid.pledgedCash, 25000);
            assert.ok(tender.playerBid.score > 0);
            assert.ok(toasts.some(t => t.type === 'success' && t.title.includes('Offerta inviata')));
        });

        test('rialzo offerta scala solo la differenza', () => {
            const { sandbox, gs } = amb;
            sandbox.CE_placeBid('t_bid_1', 10000);
            assert.equal(gs.cash, 90000);

            sandbox.CE_placeBid('t_bid_1', 30000); // aumento di 20.000€
            assert.equal(gs.cash, 70000, 'deve scalare solo i 20.000€ addizionali');
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 30000);
        });

        test('ribasso offerta rimborsa la differenza con CE_money.earn', () => {
            const { sandbox, gs } = amb;
            sandbox.CE_placeBid('t_bid_1', 40000);
            assert.equal(gs.cash, 60000);

            sandbox.CE_placeBid('t_bid_1', 15000); // riduzione di 25.000€
            assert.equal(gs.cash, 85000, 'deve rimborsare 25.000€');
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 15000);
        });

        test('offerta con fondi insufficienti non modifica cassa né stato', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 5000;

            sandbox.CE_placeBid('t_bid_1', 20000);

            assert.equal(gs.cash, 5000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('offerta su bando inesistente o chiuso non effettua movimenti', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders[0].status = 'closed';

            sandbox.CE_placeBid('t_fantasma', 10000);
            sandbox.CE_placeBid('t_bid_1', 10000);

            assert.equal(gs.cash, 100000);
        });
    });

    describe('10. Annullamento Offerta Corporate (CE_cancelBid)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 60000 });
            amb.sandbox.gameState.corporateTenders = [{
                id: 't_cancel_1',
                companyId: 'Royal Mirage',
                company: {
                    company_name: 'Royal Mirage',
                    tier: 4,
                    payout_per_hour: 5100,
                    contract_duration_days: 14,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 50 },
                },
                status: 'open',
                playerBid: { pledgedCash: 20000, score: 75 },
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('annullamento offerta rimborsa intero pledge e azzera playerBid', () => {
            const { sandbox, gs, toasts } = amb;

            sandbox.CE_cancelBid('t_cancel_1');

            assert.equal(gs.cash, 80000, 'cash aumentato di 20.000€');
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.ok(toasts.some(t => t.type === 'info' && t.title.includes('Offerta annullata')));
        });

        test('secondo annullamento immediato (doppio click) è idempotente', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_cancelBid('t_cancel_1');
            assert.equal(gs.cash, 80000);

            sandbox.CE_cancelBid('t_cancel_1');
            assert.equal(gs.cash, 80000, 'il cash non deve raddoppiare');
        });

        test('annullamento su bando senza offerta o inesistente non fa nulla', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders[0].playerBid = null;

            sandbox.CE_cancelBid('t_cancel_1');
            sandbox.CE_cancelBid('t_inesistente');

            assert.equal(gs.cash, 60000);
        });
    });

    describe('11. Risoluzione Bandi, Incassi Passivi e Scadenza (_resolve, dailyTick)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 50000, day: 5 });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('risoluzione con vittoria: crea contratto attivo, trattiene pledge e genera alert', () => {
            const { sandbox, gs, alerts } = amb;
            gs.corporateTenders = [{
                id: 't_win',
                companyId: 'Helixion BioLabs',
                company: {
                    company_name: 'Helixion BioLabs',
                    tier: 4,
                    payout_per_hour: 4700,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 50 },
                },
                openedDay: 3,
                closingDay: 5, // scadenza raggiunta
                status: 'open',
                playerBid: { pledgedCash: 10000, score: 999 }, // punteggio massimo garantito
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 1, 'contratto creato');
            const ctr = gs.corporateContracts[0];
            assert.equal(ctr.companyId, 'Helixion BioLabs');
            assert.equal(ctr.status, 'active');
            assert.equal(ctr.dailyPayout, 4700 * 16); // 75.200€/gg
            assert.equal(ctr.startDay, 5);
            assert.equal(ctr.endDay, 35);

            // Il pledge non viene rimborsato perché è vinto (trattenuto)
            assert.equal(gs.cash, 50000 + ctr.dailyPayout, 'il cash include solo il primo daily payout, nessun rimborso pledge');
            assert.ok(alerts.some(a => a.type === 'success' && a.text.includes('CONTRATTO VINTO')));
        });

        test('risoluzione con sconfitta: rimborsa pledge e registra storico', () => {
            const { sandbox, gs, alerts } = amb;
            gs.corporateTenders = [{
                id: 't_loss',
                companyId: 'Aureline Capital',
                company: {
                    company_name: 'Aureline Capital',
                    tier: 5,
                    payout_per_hour: 7800,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 50 },
                },
                openedDay: 3,
                closingDay: 5,
                status: 'open',
                playerBid: { pledgedCash: 15000, score: -10 }, // punteggio negativo garantisce sconfitta
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 0, 'nessun contratto vinto');
            assert.equal(gs.cash, 65000, 'pledge di 15.000€ rimborsato');
            assert.equal(gs.tenderHistory.length, 1);
            assert.equal(gs.tenderHistory[0].result.won, false);
            assert.ok(alerts.some(a => a.type === 'warning' && a.text.includes('Bando perso')));
        });

        test('incassi passivi giornalieri accumulano in totalEarned e cassa', () => {
            const { sandbox, gs } = amb;
            gs.corporateContracts = [{
                id: 'ctr_act_1',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                dailyPayout: 50000,
                totalEarned: 100000,
                startDay: 1,
                endDay: 30,
                status: 'active',
            }];
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 100000, 'cash passato da 50k a 100k');
            assert.equal(gs.corporateContracts[0].totalEarned, 150000);
        });

        test('contratti giunti a scadenza passano a expired', () => {
            const { sandbox, gs, alerts } = amb;
            gs.day = 30;
            gs.corporateContracts = [{
                id: 'ctr_expiring',
                companyId: 'Expiring Corp',
                company: { company_name: 'Expiring Corp', tier: 3, contract_duration_days: 30 },
                dailyPayout: 10000,
                totalEarned: 300000,
                startDay: 0,
                endDay: 30, // scaduto oggi
                status: 'active',
            }];
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts[0].status, 'expired');
            assert.ok(alerts.some(a => a.type === 'info' && a.text.includes('scaduto')));
        });
    });

    describe('12. Rescissione Anticipata Contratto Corporate (CE_terminateContract)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.gameState.corporateContracts = [{
                id: 'ctr_term_1',
                companyId: 'OmniSphere Cloud',
                company: { company_name: 'OmniSphere Cloud', tier: 5, contract_duration_days: 30 },
                dailyPayout: 60000,
                totalEarned: 120000,
                startDay: 1,
                endDay: 30,
                status: 'active',
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminazione confermata imposta status "terminated" senza indennizzo', () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;

            sandbox.CE_terminateContract('ctr_term_1');

            assert.equal(gs.corporateContracts[0].status, 'terminated');
            assert.equal(gs.cash, cashPrima, 'nessun rimborso o spesa su rescissione corporate');
        });

        test('terminazione rifiutata (confirm = false) lascia il contratto attivo', () => {
            const { sandbox, gs } = amb;
            sandbox.confirm = () => false;

            sandbox.CE_terminateContract('ctr_term_1');

            assert.equal(gs.corporateContracts[0].status, 'active');
        });

        test('terminazione con ID inesistente non produce errori', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_terminateContract('ctr_inesistente');
            assert.equal(gs.corporateContracts[0].status, 'active');
        });
    });

    describe('13. Rendering Tab Contratti Corporate (renderTabContracts)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts disegna KPI, bandi aperti e stato vuoto', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [];
            gs.corporateContracts = [];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Bandi &amp; Contratti Aziendali'));
            assert.ok(c.innerHTML.includes('Nessun bando disponibile'));
            assert.ok(c.innerHTML.includes('Come funziona:'));
        });

        test('renderTabContracts disegna card bandi con slider pledge e pulsante offerta', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_render_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    industry: 'Tech & Silicon Valley',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    lore_description: 'Trasporto dirigenti.',
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'standard', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Pear Technologies'));
            assert.ok(c.innerHTML.includes('Tech &amp; Silicon Valley'));
            assert.ok(c.innerHTML.includes('data-ce-act="cePlaceBid"'));
            assert.ok(c.innerHTML.includes('data-ce-act="ceBidPreview"'));
        });

        test('renderTabContracts con offerta già inviata mostra pulsante Annulla', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_render_2',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    industry: 'Tech',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    lore_description: 'Trasporto.',
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'standard', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: { pledgedCash: 20000, score: 85 },
                status: 'open',
            }];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Offerta inviata'));
            assert.ok(c.innerHTML.includes('Score: <strong>85/100</strong>'));
            assert.ok(c.innerHTML.includes('data-ce-act="CE_cancelBid"'));
        });

        test('renderTabContracts con contratti attivi mostra card contratto e pulsante Termina', () => {
            const { sandbox, gs } = amb;
            gs.corporateContracts = [{
                id: 'ctr_active_1',
                companyId: 'OmniSphere Cloud',
                company: {
                    company_name: 'OmniSphere Cloud',
                    industry: 'Cloud Infrastructure',
                    tier: 5,
                    contract_duration_days: 30,
                },
                dailyPayout: 7100 * 16,
                totalEarned: 227200,
                startDay: 1,
                endDay: 31,
                status: 'active',
            }];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Contratti Attivi'));
            assert.ok(c.innerHTML.includes('OmniSphere Cloud'));
            assert.ok(c.innerHTML.includes('data-ce-act="CE_terminateContract"'));
        });

        test('renderTabContracts tollera assenza di #tab-container', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabContracts();
            });
        });
    });

    describe('14. Event Delegation DOM (ce-actions.js / events.js)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 100000 });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('cePlaceBid legge il valore da pledge-<id> e chiama CE_placeBid', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_ev_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 10 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            sandbox.document.body.innerHTML = `
                <div id="tab-container">
                    <input id="pledge-t_ev_1" value="15000">
                </div>
            `;

            sandbox.cePlaceBid('t_ev_1');

            assert.equal(gs.cash, 85000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 15000);
        });

        test('ceBidPreview richiama CE_updateBidPreview con this.value', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_ev_2',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 10 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            sandbox.document.body.innerHTML = `
                <div id="tab-container">
                    <input id="pledge-t_ev_2" value="20000">
                    <span id="bid-score-t_ev_2">0</span>
                    <span id="bid-pledge-val-t_ev_2">€0</span>
                </div>
            `;

            const inputEl = sandbox.document.getElementById('pledge-t_ev_2');
            sandbox.ceBidPreview.call(inputEl, 't_ev_2');

            const valEl = sandbox.document.getElementById('bid-pledge-val-t_ev_2');
            assert.ok(valEl.textContent.includes('20.000') || valEl.textContent.includes('20,000'));
        });
    });

    describe('15. Garanzie Economiche e Anti-Doppio Conteggio (Server RPC vs CE_money)', () => {
        test('in B2B tutti gli incassi e addebiti passano da accreditatoDalServer / addebitatoDalServer senza syncCash', async () => {
            const syncedCash = [];
            const amb = creaAmbienteContratti({
                serverStateOverrides: {
                    syncCash: async (v) => {
                        syncedCash.push(v);
                        return { success: true, cash: v };
                    },
                },
            });
            await amb.sandbox.b2bRefresh();
            await amb.sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1', 'veh_bus_2'], []);

            // 1. Tick giornaliero (accredito RPC)
            amb.gs.cash = 20000;
            await amb.sandbox._b2bDailyTick();
            assert.equal(amb.gs.cash, 24200);
            assert.deepEqual(syncedCash, [], 'il tick giornaliero B2B non deve MAI invocare syncCash');

            // 2. Rescissione anticipata (addebito penale RPC)
            await amb.sandbox.b2bTerminateContract('act_b2b_c1');
            assert.equal(amb.gs.cash, 9200); // 24200 - 15000
            assert.deepEqual(syncedCash, [], 'la rescissione B2B non deve MAI invocare syncCash');

            amb.env.stopAllIntervals();
        });

        test('in Corporate Contracts tutte le transazioni client passano da CE_money (spend/earn) e sincronizzano regolarmente', async () => {
            const syncedCash = [];
            const amb = creaAmbienteContratti({
                cash: 100000,
                serverStateOverrides: {
                    syncCash: async (v) => {
                        syncedCash.push(v);
                        return { success: true, cash: v };
                    },
                },
            });
            amb.sandbox.gameState.corporateTenders = [{
                id: 't_sync_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 10 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            // 1. Invia offerta -> spende 20k
            amb.sandbox.CE_placeBid('t_sync_1', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(amb.gs.cash, 80000);
            assert.deepEqual(syncedCash, [80000]);

            // 2. Annulla offerta -> rimborsa 20k
            amb.sandbox.CE_cancelBid('t_sync_1');
            await new Promise(r => setImmediate(r));
            assert.equal(amb.gs.cash, 100000);
            assert.deepEqual(syncedCash, [80000, 100000]);

            amb.env.stopAllIntervals();
        });
    });
});
