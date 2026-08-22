'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Collaudo profondo del modulo Contratti & B2B

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `contracts.js`, `b2b.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, il calcolo dei punteggi di offerta,
   la gestione dello stato locale/server, il blocco dei veicoli, il rispetto delle
   regole di non doppio-conteggio economico e l'UI di rendering.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente per il collaudo di Contratti e B2B.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];
    const syncedCash = [];

    const b2bContractsDefault = [
        {
            id: 'b2b_cat_1',
            title: 'Servizio Navetta Dirigenziale',
            client_name: 'Nexus Corp',
            client_icon: '🏢',
            required_tier: 'BUSINESS',
            required_count: 2,
            min_reputation: 2.5,
            daily_payout: 4200,
            duration_days: 14,
            penalty_amount: 8000,
            province_id: 'prov_roma',
        },
        {
            id: 'b2b_cat_2',
            title: 'Scorta Delegazione Diplomatica',
            client_name: 'Ambasciata Federale',
            client_icon: '🏛️',
            required_tier: 'ARMORED',
            required_count: 1,
            min_reputation: 4.0,
            daily_payout: 9500,
            duration_days: 7,
            penalty_amount: 25000,
            province_id: null,
        },
        {
            id: 'b2b_cat_3',
            title: 'VIP Transfer Summit',
            client_name: 'Apex Events',
            client_icon: '🌟',
            required_tier: 'ULTRA',
            required_count: 3,
            min_reputation: 4.5,
            daily_payout: 15000,
            duration_days: 30,
            penalty_amount: 40000,
            province_id: 'prov_milano',
        },
    ];

    let statoB2BContracts = (opzioni.b2bContracts || b2bContractsDefault).map(c => ({ ...c }));
    let activeB2BContract = opzioni.activeB2BContract !== undefined ? opzioni.activeB2BContract : null;

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
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: activeB2BContract, error: null }),
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
                const target = statoB2BContracts.find(c => c.id === args.v_contract_id);
                if (!target) return { data: null, error: { message: 'Contratto B2B non trovato' } };

                activeB2BContract = {
                    id: 'b2b_act_' + target.id,
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
                    sla_score: 100,
                    status: 'active',
                };
                return { data: activeB2BContract, error: null };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                if (!activeB2BContract) return { data: null, error: { message: 'Nessun contratto attivo' } };
                const penalty = activeB2BContract.penalty || activeB2BContract.penalty_amount || 5000;
                activeB2BContract = null;
                return {
                    data: {
                        penalty: penalty,
                        rep_penalty: 0.5,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                if (!activeB2BContract) return { data: { payout: 0 }, error: null };
                const payout = activeB2BContract.daily_payout;
                const rem = activeB2BContract.days_remaining - 1;
                activeB2BContract.days_remaining = rem;
                const completed = rem <= 0;

                return {
                    data: {
                        payout: payout,
                        title: activeB2BContract.title,
                        days_remaining: rem,
                        completed: completed,
                        rep_bonus: completed ? 0.4 : 0,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_contracts_tester' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi flotta e stato di default
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.2;
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 200000;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'v_u1', name: 'Rolls Royce Phantom', tier: 'ultra', condition: 95, isLease: false, outOfService: null },
        { id: 'v_u2', name: 'Mercedes Maybach', tier: 'ultra', condition: 90, isLease: false, outOfService: null },
        { id: 'v_vip1', name: 'Mercedes S-Class', tier: 'vip', condition: 85, isLease: false, outOfService: null },
        { id: 'v_bus1', name: 'BMW Serie 5', tier: 'business', condition: 80, isLease: false, outOfService: null },
        { id: 'v_bus2', name: 'Audi A6', tier: 'business', condition: 88, isLease: false, outOfService: null },
        { id: 'v_std1', name: 'Skoda Superb', tier: 'standard', condition: 75, isLease: false, outOfService: null },
    ];
    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'd1', name: 'Marco Polo', assignedCarId: 'v_bus1' },
        { id: 'd2', name: 'Giuseppe Verdi', assignedCarId: 'v_u1' },
    ];

    // Predisponi contenitore DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        syncedCash,
        statoB2BContracts,
    };
}

describe('Funzione Contratti & B2B — Esecuzione e ciclo di vita', () => {

    /* ─── 1. INIZIALIZZAZIONE E STATO LOCALE ──────────────────────────────── */
    describe('1. Inizializzazione e stato locale (CE_Contracts.initState, b2bInit, b2bRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_Contracts.initState prepara le strutture dati su gameState se assenti', () => {
            const { sandbox, gs } = amb;
            delete gs.corporateTenders;
            delete gs.corporateContracts;
            delete gs.tenderHistory;
            delete gs.nextTenderDay;

            sandbox.CE_Contracts.initState();

            assert.ok(Array.isArray(gs.corporateTenders), 'corporateTenders deve essere inizializzato come array');
            assert.ok(Array.isArray(gs.corporateContracts), 'corporateContracts deve essere inizializzato come array');
            assert.ok(Array.isArray(gs.tenderHistory), 'tenderHistory deve essere inizializzato come array');
            assert.ok(typeof gs.nextTenderDay === 'number', 'nextTenderDay deve essere un numero');
        });

        test('b2bRefresh popola i contratti B2B dal server', async () => {
            const { sandbox } = amb;
            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 3, 'deve caricare i 3 contratti B2B disponibili');
            assert.ok(sandbox._b2bState._lastFetch > 0, '_lastFetch deve essere aggiornato');
        });

        test('b2bRefresh non solleva errori se Supabase client o utente sono assenti', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.b2bRefresh();
            });
        });

        test('b2bInit esegue refresh iniziale quando loggato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bInit();

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_b2b_contracts'), 'b2bInit deve invocare rpc_get_b2b_contracts');
            assert.equal(sandbox._b2bState.contracts.length, 3);
        });

        test('b2bInit non effettua chiamate se utente non loggato', async () => {
            const ambNoAuth = creaAmbienteContratti({ currentUser: null });
            await ambNoAuth.sandbox.b2bInit();

            assert.equal(ambNoAuth.rpcLog.length, 0, 'senza utente loggato non deve chiamare il server');
            ambNoAuth.env.stopAllIntervals();
        });
    });

    /* ─── 2. REQUISITI CONTRATTI E IDONEITÀ FLOTTA ────────────────────────── */
    describe('2. Requisiti contratti corporate e B2B (meetsRequirements, filtri flotta e tier)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_Contracts.meetsRequirements convalida reputazione e flotta qualificata', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 4.5; // 4.5 / 5.0 * 100 = 90%

            const companyTech = {
                company_name: 'Mock Tech',
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'executive_sedan', min_reputation: 80 },
            };

            const reqs = sandbox.CE_Contracts.meetsRequirements(companyTech);
            assert.equal(reqs.repOk, true, 'reputazione deve essere sufficiente (90% >= 80%)');
            assert.equal(reqs.fleetOk, true, 'flotta deve essere sufficiente');
            assert.ok(reqs.qualifying >= 2, 'deve contare i veicoli con tier business o superiore');
        });

        test('CE_Contracts.meetsRequirements rifiuta se reputazione o flotta sono sotto soglia', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 2.0; // 40%

            const companyHighReq = {
                company_name: 'High End Corp',
                tender_requirements: { min_fleet_size: 10, required_vehicle_type: 'armored_suv', min_reputation: 90 },
            };

            const reqs = sandbox.CE_Contracts.meetsRequirements(companyHighReq);
            assert.equal(reqs.repOk, false, 'reputazione deve essere insufficiente (40% < 90%)');
            assert.equal(reqs.fleetOk, false, 'flotta deve essere insufficiente (2 ultra < 10)');
        });

        test('veicoli fuori servizio o con condizione degradata non si qualificano per bandi corporate', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'v1', tier: 'ultra', condition: 90, outOfService: true },
                { id: 'v2', tier: 'ultra', condition: 5, outOfService: null },
                { id: 'v3', tier: 'ultra', condition: 85, outOfService: null },
            ];

            const co = { tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 10 } };
            const reqs = sandbox.CE_Contracts.meetsRequirements(co);
            assert.equal(reqs.qualifying, 1, 'solo il veicolo in buone condizioni e non outOfService deve qualificarsi');
            assert.equal(reqs.fleetOk, false);
        });

        test('B2B gerarchia tier catalogo->flotta mappa correttamente i requisiti', () => {
            const { sandbox } = amb;
            const rankBus = vm.runInContext('_b2bReqRank("BUSINESS")', sandbox);
            const rankPrem = vm.runInContext('_b2bReqRank("PREMIUM")', sandbox);
            const rankPres = vm.runInContext('_b2bReqRank("PRESIDENTIAL")', sandbox);
            const rankArm = vm.runInContext('_b2bReqRank("ARMORED")', sandbox);
            const rankUltra = vm.runInContext('_b2bReqRank("ULTRA")', sandbox);

            assert.equal(rankBus, 2);
            assert.equal(rankPrem, 2);
            assert.equal(rankPres, 4);
            assert.equal(rankArm, 4);
            assert.equal(rankUltra, 4);

            const carStd = { tier: 'standard' };
            const carBus = { tier: 'business' };
            const carVip = { tier: 'vip' };
            const carUltra = { tier: 'ultra' };

            assert.equal(vm.runInContext(`_b2bCarRank(${JSON.stringify(carStd)})`, sandbox), 1);
            assert.equal(vm.runInContext(`_b2bCarRank(${JSON.stringify(carBus)})`, sandbox), 2);
            assert.equal(vm.runInContext(`_b2bCarRank(${JSON.stringify(carVip)})`, sandbox), 3);
            assert.equal(vm.runInContext(`_b2bCarRank(${JSON.stringify(carUltra)})`, sandbox), 4);
        });
    });

    /* ─── 3. PIAZZAMENTO ED ANNULLAMENTO OFFERTE CORPORATE ────────────────── */
    describe('3. Offerte su bandi corporate (CE_placeBid, CE_cancelBid, CE_updateBidPreview)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 'tender_101',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'luxury_electric', min_reputation: 80 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_placeBid scala il pledge e registra lo score nel bando', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('tender_101', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 80000, 'la cassa deve essere scalata del pledge di 20.000€');
            assert.deepEqual(syncedCash, [80000], 'deve sincronizzare la cassa col server');

            const tender = gs.corporateTenders.find(t => t.id === 'tender_101');
            assert.ok(tender.playerBid, 'playerBid deve essere impostato');
            assert.equal(tender.playerBid.pledgedCash, 20000);
            assert.ok(tender.playerBid.score > 0, 'lo score deve essere calcolato');
        });

        test('CE_placeBid con aumento pledge scala solo la differenza', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('tender_101', 10000); // spende 10.000
            sandbox.CE_placeBid('tender_101', 25000); // spende ulteriori 15.000
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 75000, 'totale speso deve essere 25.000€');
            assert.deepEqual(syncedCash, [90000, 75000]);
        });

        test('CE_placeBid con riduzione pledge rimborsa la differenza', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('tender_101', 30000); // cash -> 70.000
            sandbox.CE_placeBid('tender_101', 10000); // rimborso 20.000 -> cash 90.000

            assert.equal(gs.cash, 90000);
            const tender = gs.corporateTenders.find(t => t.id === 'tender_101');
            assert.equal(tender.playerBid.pledgedCash, 10000);
        });

        test('CE_placeBid rifiuta se cassa insufficiente e lascia il bando intatto', () => {
            const { sandbox, gs } = amb;
            gs.cash = 5000;

            sandbox.CE_placeBid('tender_101', 20000);

            assert.equal(gs.cash, 5000, 'la cassa non deve cambiare');
            const tender = gs.corporateTenders.find(t => t.id === 'tender_101');
            assert.equal(tender.playerBid, null, 'nessun bid deve essere stato registrato');
        });

        test('CE_placeBid ignora bandi non aperti o inesistenti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.corporateTenders[0].status = 'closed';

            sandbox.CE_placeBid('tender_101', 10000);
            sandbox.CE_placeBid('tender_inesistente', 10000);

            assert.equal(gs.cash, 50000, 'la cassa deve restare intatta');
        });

        test('CE_placeBid limita il pledge a un massimo di 50.000€', () => {
            const { sandbox, gs } = amb;
            gs.cash = 200000;

            sandbox.CE_placeBid('tender_101', 999999);

            const tender = gs.corporateTenders.find(t => t.id === 'tender_101');
            assert.equal(tender.playerBid.pledgedCash, 50000, 'il pledge deve essere bloccato a 50.000€');
            assert.equal(gs.cash, 150000);
        });

        test('CE_cancelBid rimborsa il pledge e rimuove lo score', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;

            sandbox.CE_placeBid('tender_101', 15000);
            assert.equal(gs.cash, 85000);

            sandbox.CE_cancelBid('tender_101');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000, 'il pledge deve essere stato restituito interamente');
            const tender = gs.corporateTenders.find(t => t.id === 'tender_101');
            assert.equal(tender.playerBid, null);
            assert.deepEqual(syncedCash, [85000, 100000]);
        });

        test('CE_cancelBid su bando senza offerta non muta cassa né crasha', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;

            sandbox.CE_cancelBid('tender_101');
            sandbox.CE_cancelBid('bando_non_trovato');

            assert.equal(gs.cash, 50000);
        });

        test('CE_updateBidPreview aggiorna gli elementi DOM relativi all offerta', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = `
                <div id="bid-score-tender_101">0</div>
                <div id="bid-pledge-val-tender_101">€0</div>
            `;

            sandbox.CE_updateBidPreview('tender_101', 25000);

            const scEl = sandbox.document.getElementById('bid-score-tender_101');
            const plEl = sandbox.document.getElementById('bid-pledge-val-tender_101');

            assert.ok(Number(scEl.textContent) > 0, 'il punteggio stimato deve essere > 0');
            assert.ok(plEl.textContent.includes('25.000') || plEl.textContent.includes('25,000'));
        });
    });

    /* ─── 4. RISOLUZIONE BANDI CORPORATE (CE_Contracts.dailyTick) ─────────── */
    describe('4. Risoluzione bandi corporate e nuovi batch (CE_Contracts.dailyTick)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('bando vinto crea contratto attivo e trattiene il pledge senza ri-addebitare', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.cash = 50000;

            gs.corporateTenders = [{
                id: 't_won',
                companyId: 'Titan Forge Defense',
                company: {
                    company_name: 'Titan Forge Defense',
                    tier: 5,
                    payout_per_hour: 8600,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'ultra', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                // Score 100 garantisce vittoria contro score AI (~77-90)
                playerBid: { pledgedCash: 20000, score: 100 },
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 1, 'deve essere stato creato un contratto attivo');
            const ctr = gs.corporateContracts[0];
            assert.equal(ctr.companyId, 'Titan Forge Defense');
            assert.equal(ctr.status, 'active');
            assert.equal(ctr.dailyPayout, 8600 * 16);
            assert.equal(ctr.startDay, 3);
            assert.equal(ctr.endDay, 33);
            assert.equal(gs.cash, 50000, 'il pledge e stato trattenuto e il primo payout decorre dal tick successivo');
        });

        test('bando perso rimborsa il pledge del giocatore e registra lesito nello storico', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.cash = 50000;

            gs.corporateTenders = [{
                id: 't_lost',
                companyId: 'Aureline Capital',
                company: {
                    company_name: 'Aureline Capital',
                    tier: 5,
                    payout_per_hour: 7800,
                    contract_duration_days: 30,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'ultra', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                // Score 0 garantisce sconfitta
                playerBid: { pledgedCash: 15000, score: 0 },
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 0, 'nessun contratto attivo deve essere stato creato');
            assert.equal(gs.cash, 65000, 'il pledge di 15.000€ deve essere stato rimborsato');
            assert.equal(gs.tenderHistory.length, 1, 'il bando deve essere registrato nello storico');
            assert.equal(gs.tenderHistory[0].result.won, false);
        });

        test('generazione di un nuovo batch di bandi quando day >= nextTenderDay', () => {
            const { sandbox, gs } = amb;
            gs.day = 5;
            gs.nextTenderDay = 5;
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 4, 'un nuovo batch deve contenere 4 bandi');
            assert.equal(gs.nextTenderDay, 8, 'nextTenderDay deve essere spostato di 3 giorni');
            for (const t of gs.corporateTenders) {
                assert.equal(t.status, 'open');
                assert.equal(t.openedDay, 5);
                assert.equal(t.closingDay, 7);
            }
        });
    });

    /* ─── 5. INCASSO E SCADENZA CONTRATTI CORPORATE ───────────────────────── */
    describe('5. Incassi giornalieri e termine contratti corporate (CE_Contracts, CE_terminateContract)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('i contratti attivi erogano il payout ogni giorno incrementando totalEarned', () => {
            const { sandbox, gs } = amb;
            gs.cash = 10000;
            gs.corporateContracts = [{
                id: 'ctr_1',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                dailyPayout: 104000, // 6500 * 16
                totalEarned: 0,
                status: 'active',
                startDay: 1,
                endDay: 31,
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.cash, 114000, 'la cassa deve aumentare del payout giornaliero');
            assert.equal(gs.corporateContracts[0].totalEarned, 104000);
        });

        test('i contratti scaduti al raggiungimento di endDay passano a status expired e cessano di pagare', () => {
            const { sandbox, gs } = amb;
            gs.day = 31;
            gs.cash = 10000;
            gs.corporateContracts = [{
                id: 'ctr_exp',
                companyId: 'SkyLuxe Airways',
                company: { company_name: 'SkyLuxe Airways', tier: 5, contract_duration_days: 30 },
                dailyPayout: 50000,
                totalEarned: 1500000,
                status: 'active',
                startDay: 1,
                endDay: 31,
            }];

            // Primo tick: giorno 31 -> eroga ultimo payout e poi scade
            sandbox.CE_Contracts.dailyTick();
            const ctr = gs.corporateContracts.find(c => c.id === 'ctr_exp');
            assert.equal(ctr.status, 'expired', 'lo status deve essere expired');

            // Secondo tick: giorno 32 -> nessun ulteriore payout
            gs.day = 32;
            const cashDopoScadenza = gs.cash;
            sandbox.CE_Contracts.dailyTick();
            assert.equal(gs.cash, cashDopoScadenza, 'un contratto scaduto non deve più erogare cassa');
        });

        test('CE_terminateContract imposta status terminated solo se confermato', () => {
            const { sandbox, gs } = amb;
            gs.corporateContracts = [{
                id: 'ctr_cancel_me',
                companyId: 'NovaTrust Bank',
                company: { company_name: 'NovaTrust Bank' },
                status: 'active',
            }];

            // Caso 1: rifiuto conferma
            sandbox.confirm = () => false;
            sandbox.CE_terminateContract('ctr_cancel_me');
            assert.equal(gs.corporateContracts[0].status, 'active', 'deve restare active se non confermato');

            // Caso 2: accettazione conferma
            sandbox.confirm = () => true;
            sandbox.CE_terminateContract('ctr_cancel_me');
            assert.equal(gs.corporateContracts[0].status, 'terminated', 'deve passare a terminated');
        });

        test('CE_terminateContract su ID inesistente non produce errori', () => {
            const { sandbox } = amb;
            assert.doesNotThrow(() => {
                sandbox.CE_terminateContract('contratto_fantasma');
            });
        });
    });

    /* ─── 6. GESTIONE APPALTI B2B TRAMITE SUPABASE RPC ────────────────────── */
    describe('6. Appalti B2B Supabase (b2bAcceptContract, b2bTerminateContract, _b2bDailyTick)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bAcceptContract firma il contratto e blocca i veicoli indicati', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1', 'v_bus2'], ['d1']);

            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc, 'deve chiamare rpc_accept_b2b_contract');
            assert.equal(acceptRpc.args.v_contract_id, 'b2b_cat_1');
            assert.deepEqual(acceptRpc.args.v_vehicle_ids, ['v_bus1', 'v_bus2']);

            const active = sandbox._b2bState.activeContract;
            assert.ok(active, 'activeContract deve essere popolato');
            assert.equal(active.contract_title, 'Servizio Navetta Dirigenziale');
            assert.equal(active.daily_payout, 4200);
            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), ['v_bus1', 'v_bus2'], 'i veicoli devono essere bloccati');
            /* b2bLockedDriverIds() e' stata rimossa: nessuno la chiamava tranne
               questo test. Gli autisti bloccati stanno nel contratto attivo, che
               e' lo stato vero — osservarlo li' vale piu' di tenere in vita una
               funzione che esiste solo per essere collaudata. */
            assert.deepEqual(active.locked_drivers, ['d1'], 'i driver devono essere bloccati');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('accettato')));
        });

        test('b2bAcceptContract rifiuta se utente non autenticato', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1'], []);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('b2bAcceptContract gestisce errore RPC dal server', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Requisiti non soddisfatti sul server' },
                    }),
                },
            });
            await ambErr.sandbox.b2bRefresh();

            await ambErr.sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1'], []);

            assert.equal(ambErr.sandbox._b2bState.activeContract, null);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Contratto non accettato')));
            ambErr.env.stopAllIntervals();
        });

        test('b2bTerminateContract applica penale cash e reputazione, poi resetta il contratto attivo', async () => {
            const { sandbox, gs, rpcLog, bigEvents } = amb;
            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1', 'v_bus2'], []);

            gs.cash = 50000;
            gs.reputation = 4.0;
            sandbox.confirm = () => true;

            await sandbox.b2bTerminateContract('b2b_act_b2b_cat_1');

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_b2b_contract');
            assert.ok(termRpc, 'deve chiamare rpc_terminate_b2b_contract');
            assert.equal(gs.cash, 42000, 'la cassa deve essere scalata della penale di 8.000€ via addebitatoDalServer');
            assert.equal(Math.round(gs.reputation * 10) / 10, 3.5, 'la reputazione deve essere scalata di 0.5★');
            assert.equal(sandbox._b2bState.activeContract, null, 'activeContract deve essere azzerato');
            assert.equal(bigEvents.length, 1, 'deve mostrare BigEvent di rescissione');
        });

        test('b2bTerminateContract annullato dall utente non chiama RPC', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1'], []);

            sandbox.confirm = () => false;
            await sandbox.b2bTerminateContract('b2b_act_b2b_cat_1');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
            assert.ok(sandbox._b2bState.activeContract !== null);
        });

        test('_b2bDailyTick accredita payout giornaliero tramite accreditatoDalServer', async () => {
            const { sandbox, gs, rpcLog, env, syncedCash } = amb;
            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1', 'v_bus2'], []);

            gs.cash = 10000;
            const countPrima = syncedCash.length;

            await sandbox._b2bDailyTick();

            const tickRpc = rpcLog.find(r => r.nome === 'rpc_b2b_daily_tick');
            assert.ok(tickRpc, 'deve chiamare rpc_b2b_daily_tick');
            assert.equal(gs.cash, 14200, 'cassa locale deve aumentare di 4.200€');
            assert.equal(syncedCash.length, countPrima, 'non deve chiamare syncCash (previene doppio conteggio)');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('B2B: +€4.200') || n.msg.includes('4,200')));
        });

        test('_b2bDailyTick a completamento contratto assegna bonus reputazione e libera lo slot', async () => {
            const ambComp = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_b2b_daily_tick: async () => ({
                        data: {
                            payout: 4200,
                            title: 'Servizio Navetta Dirigenziale',
                            days_remaining: 0,
                            completed: true,
                            rep_bonus: 0.5,
                        },
                        error: null,
                    }),
                },
            });
            await ambComp.sandbox.b2bRefresh();
            await ambComp.sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1'], []);

            ambComp.gs.reputation = 3.0;
            await ambComp.sandbox._b2bDailyTick();

            assert.equal(ambComp.sandbox._b2bState.activeContract, null, 'il contratto deve essere concluso');
            assert.equal(Math.round(ambComp.gs.reputation * 10) / 10, 3.5, 'reputazione incrementata del bonus');
            assert.equal(ambComp.bigEvents.length, 1);
            assert.equal(ambComp.bigEvents[0].title, 'Contratto Completato!');
            ambComp.env.stopAllIntervals();
        });
    });

    /* ─── 7. MODAL SELEZIONE VEICOLI E VINCOLI B2B ────────────────────────── */
    describe('7. Modale selezione veicoli B2B (b2bOpenAcceptModal, b2bCheckLimit, b2bConfirmAccept)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bOpenAcceptModal rifiuta se non ci sono abbastanza veicoli idonei disponibili', () => {
            const { sandbox, env } = amb;
            // Summit richiede 3 veicoli ULTRA. La flotta di default ha 2 ULTRA.
            sandbox.b2bOpenAcceptModal('b2b_cat_3');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.equal(modal, null, 'il modale non deve aprirsi');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bOpenAcceptModal apre il modale quando i requisiti sono soddisfatti', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_cat_1');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modale b2b-select-modal deve essere inserito nel DOM');
            assert.ok(modal.innerHTML.includes('Servizio Navetta Dirigenziale'));

            const checks = modal.querySelectorAll('.b2b-car-check');
            assert.ok(checks.length >= 2, 'deve mostrare almeno 2 veicoli selezionabili');
        });

        test('b2bCheckLimit abilita il bottone di conferma solo al raggiungimento del limite', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_cat_1');

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            const btn = sandbox.document.getElementById('b2b-confirm-btn');

            assert.equal(btn.disabled, true);

            // Seleziona 1 veicolo (ne servono 2)
            checks[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(btn.disabled, true);

            // Seleziona il secondo veicolo
            checks[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(btn.disabled, false);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');
        });

        test('b2bConfirmAccept auto-seleziona i driver assegnati e chiude il modale', async () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_cat_1');

            const checks = sandbox.document.querySelectorAll('.b2b-car-check');
            checks[0].checked = true;
            checks[1].checked = true;

            await sandbox.b2bConfirmAccept('b2b_cat_1', 2);

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null, 'il modale deve essere rimosso');
            assert.ok(sandbox._b2bState.activeContract !== null);
        });

        test('b2bLockedVehicleIds gestisce formati stringa o array o stato nullo', () => {
            const { sandbox } = amb;
            sandbox._b2bState.activeContract = null;
            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), []);

            sandbox._b2bState.activeContract = { status: 'active', locked_vehicles: '["v1","v2"]' };
            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), ['v1', 'v2']);

            sandbox._b2bState.activeContract = { status: 'active', locked_vehicles: ['v3'] };
            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), ['v3']);

            sandbox._b2bState.activeContract = { status: 'active', locked_vehicles: 'invalid json' };
            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), []);
        });
    });

    /* ─── 8. RENDERING DELLE SCHEDE UI ────────────────────────────────────── */
    describe('8. Rendering schede (renderTabContracts, renderTabB2B)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts disegna KPI bar, bandi aperti e storico', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_ui_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    industry: 'Tech',
                    tier: 5,
                    payout_per_hour: 6500,
                    contract_duration_days: 30,
                    lore_description: 'Lore test',
                    tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'luxury_electric', min_reputation: 90 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];

            sandbox.renderTabContracts();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Bandi &amp; Contratti Aziendali'));
            assert.ok(container.innerHTML.includes('Pear Technologies'));
            assert.ok(container.innerHTML.includes('Score stimato'));
            assert.ok(container.innerHTML.includes('Come funziona'));
        });

        test('renderTabContracts con lista bandi vuota mostra avviso prossimo batch', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [];
            gs.nextTenderDay = 4;
            gs.day = 1;

            sandbox.renderTabContracts();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Nessun bando disponibile'));
            assert.ok(container.innerHTML.includes('3 giorni'));
        });

        test('renderTabB2B per utente anonimo mostra invito all autenticazione', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabB2B();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Accedi per visualizzare i contratti disponibili'));
        });

        test('renderTabB2B disegna sia il contratto attivo che gli appalti disponibili', async () => {
            const { sandbox } = amb;
            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1', 'v_bus2'], []);

            sandbox.renderTabB2B();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Contratto Attivo'));
            assert.ok(container.innerHTML.includes('Servizio Navetta Dirigenziale'));
            assert.ok(container.innerHTML.includes('SLA Score'));
            assert.ok(container.innerHTML.includes('Appalti Disponibili'));
            assert.ok(container.innerHTML.includes('Scorta Delegazione Diplomatica'));
        });
    });

    /* ─── 9. EVENT DELEGATION E CE-ACTIONS ────────────────────────────────── */
    describe('9. Event delegation & ce-actions (cePlaceBid, ceBidPreview)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.sandbox.CE_Contracts.initState();
            amb.gs.corporateTenders = [{
                id: 't_event_1',
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

        test('cePlaceBid legge il valore dall input DOM pledge-<id> e chiama CE_placeBid', () => {
            const { sandbox, gs } = amb;
            sandbox.document.body.innerHTML = `
                <input id="pledge-t_event_1" value="18000" />
            `;

            sandbox.cePlaceBid('t_event_1');

            const tender = gs.corporateTenders.find(t => t.id === 't_event_1');
            assert.ok(tender.playerBid);
            assert.equal(tender.playerBid.pledgedCash, 18000);
        });

        test('ceBidPreview passa this.value a CE_updateBidPreview', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = `
                <div id="bid-score-t_event_1">0</div>
                <div id="bid-pledge-val-t_event_1">€0</div>
            `;

            const fakeInput = { value: '35000' };
            sandbox.ceBidPreview.call(fakeInput, 't_event_1');

            const plEl = sandbox.document.getElementById('bid-pledge-val-t_event_1');
            assert.ok(plEl.textContent.includes('35.000') || plEl.textContent.includes('35,000'));
        });
    });

    /* ─── 10. VERIFICA DOPPIO CONTEGGIO ED ECONOMIA (CE_money) ────────────── */
    describe('10. Assenza di doppio conteggio economico e pagamenti periodici', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts e renderTabB2B non alterano la cassa né eseguono movimenti economici', () => {
            const { sandbox, gs, syncedCash } = amb;
            const cassaIniziale = gs.cash;
            const countPrima = syncedCash.length;

            sandbox.renderTabContracts();
            sandbox.renderTabB2B();
            sandbox.renderTabContracts();

            assert.equal(gs.cash, cassaIniziale, 'il rendering delle tab non deve muovere denaro');
            assert.equal(syncedCash.length, countPrima, 'nessuna chiamata economica durante il render');
        });

        test('il payout B2B e le penali passano esclusivamente da RPC + accreditato/addebitatoDalServer', async () => {
            const { sandbox, gs, syncedCash } = amb;
            await sandbox.b2bAcceptContract('b2b_cat_1', ['v_bus1', 'v_bus2'], []);

            gs.cash = 50000;
            const countPrima = syncedCash.length;

            // Tick payout
            await sandbox._b2bDailyTick();
            assert.equal(gs.cash, 54200);
            assert.equal(syncedCash.length, countPrima, 'il payout non deve chiamare syncCash');

            // Rescissione
            sandbox.confirm = () => true;
            await sandbox.b2bTerminateContract('b2b_act_b2b_cat_1');
            assert.equal(gs.cash, 46200);
            assert.equal(syncedCash.length, countPrima, 'la penale rescissione non deve chiamare syncCash');
        });
    });
});
