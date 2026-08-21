'use strict';
/* ============================================================================
   test/funzioni/contratti.test.js — Verifica approfondita Contratti & Bandi Corporate / B2B

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `contracts.js` (bandi corporate locali) e `b2b.js` (appalti B2B server)
   e dai relativi gestori in `ce-actions.js`:
   1. Ciclo di vita bandi corporate (offerta, rialzo, cancellazione, risoluzione, riscossione, scadenza, rescissione)
   2. Calcolo requisiti, rank veicoli e punteggi (flotta, reputazione, pledge)
   3. Appalti B2B con Supabase RPC (modal selezione veicoli, blocco flotta/driver, accettazione, rescissione con penale, tick giornaliero)
   4. Rispetto dei guardrail monetari (CE_money.spend/earn, accreditatoDalServer, addebitatoDalServer, nessun doppio conteggio)
   5. Idempotenza e periodicità dei pagamenti (accredito solo al tick giornaliero, MAI al render/reload della scheda)
   6. Rendering UI e integrazione Event Delegation (ceAct, ce-actions.js)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente con mock Supabase e ServerState per Contratti e B2B.
 */
function creaAmbienteContratti(opzioni = {}) {
    const rpcLog = [];
    const syncedCash = [];
    const bigEvents = [];

    const b2bContractsDefault = [
        {
            id: 'b2b_c1',
            client_name: 'Stark Logistics Corp',
            client_icon: '🏢',
            title: 'Navetta Executive Headquarter',
            required_tier: 'BUSINESS',
            required_count: 2,
            min_reputation: 3.5,
            daily_payout: 4200,
            duration_days: 14,
            penalty_amount: 15000,
            province_id: 'prov_roma',
        },
        {
            id: 'b2b_c2',
            client_name: 'Apex Global Diplomatic',
            client_icon: '🏛️',
            title: 'Scorta Delegazione Internazionale',
            required_tier: 'ARMORED',
            required_count: 1,
            min_reputation: 4.5,
            daily_payout: 8500,
            duration_days: 30,
            penalty_amount: 35000,
            province_id: 'prov_milano',
        },
    ];

    let statoB2BContracts = (opzioni.b2bContracts || b2bContractsDefault).map(c => ({ ...c }));
    let statoB2BActive = opzioni.b2bActive !== undefined ? (opzioni.b2bActive ? { ...opzioni.b2bActive } : null) : null;

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            ...opzioni.serverStateOverrides,
        },
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
                        if (opzioni.simulaErroreActiveFetch) {
                            return { data: null, error: { message: 'Errore DB fetch attivo' } };
                        }
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
                if (opzioni.simulaErroreContractsRpc) {
                    return { data: null, error: { message: 'Errore caricamento contratti' } };
                }
                return { data: statoB2BContracts, error: null };
            }

            if (nome === 'rpc_accept_b2b_contract') {
                const c = statoB2BContracts.find(x => x.id === args.v_contract_id);
                if (!c) return { data: null, error: { message: 'Contratto non trovato' } };
                const activeData = {
                    id: 'act_' + c.id,
                    daily_payout: c.daily_payout,
                    days_remaining: c.duration_days,
                    duration_days: c.duration_days,
                    title: c.title,
                    client: c.client_name,
                    icon: c.client_icon,
                    penalty: c.penalty_amount,
                    locked_vehicles: args.v_vehicle_ids,
                    locked_drivers: args.v_driver_ids,
                };
                statoB2BActive = activeData;
                return { data: activeData, error: null };
            }

            if (nome === 'rpc_terminate_b2b_contract') {
                const penalty = statoB2BActive?.penalty || 10000;
                statoB2BActive = null;
                return {
                    data: {
                        penalty: penalty,
                        rep_penalty: 0.5,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_b2b_daily_tick') {
                if (!statoB2BActive) return { data: { payout: 0, completed: false }, error: null };
                const remaining = (statoB2BActive.days_remaining || 1) - 1;
                statoB2BActive.days_remaining = remaining;
                if (remaining <= 0) {
                    const res = {
                        payout: statoB2BActive.daily_payout || 0,
                        completed: true,
                        title: statoB2BActive.title || 'Appalto B2B',
                        rep_bonus: 0.3,
                        days_remaining: 0,
                    };
                    statoB2BActive = null;
                    return { data: res, error: null };
                }
                return {
                    data: {
                        payout: statoB2BActive.daily_payout || 0,
                        completed: false,
                        title: statoB2BActive.title || 'Appalto B2B',
                        rep_bonus: 0,
                        days_remaining: remaining,
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

    // Predisponi flotta e stato
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    env.sandbox.gameState.day = opzioni.day !== undefined ? opzioni.day : 1;
    env.sandbox.gameState.fleet = opzioni.fleet !== undefined ? opzioni.fleet : [
        { id: 'veh_bus_1', name: 'Mercedes E-Class', tier: 'business', condition: 95, outOfService: null, isLease: false },
        { id: 'veh_bus_2', name: 'BMW 5 Series', tier: 'business', condition: 90, outOfService: null, isLease: false },
        { id: 'veh_vip_1', name: 'Mercedes S-Class', tier: 'vip', condition: 100, outOfService: null, isLease: false },
        { id: 'veh_ultra_1', name: 'Rolls Royce Phantom Armored', tier: 'ultra', condition: 100, outOfService: null, isLease: false },
    ];
    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'drv_1', name: 'Mario Rossi', assignedCarId: 'veh_bus_1' },
        { id: 'drv_2', name: 'Luigi Bianchi', assignedCarId: 'veh_bus_2' },
        { id: 'drv_3', name: 'Giuseppe Verdi', assignedCarId: 'veh_ultra_1' },
    ];

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        syncedCash,
        bigEvents,
        statoB2BContracts,
        getStatoB2BActive: () => statoB2BActive,
    };
}

describe('Funzione Contratti & Bandi Corporate / B2B — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione e Stato Iniziale (CE_Contracts.initState, b2bInit, b2bRefresh)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_Contracts.initState popola gli array e imposta nextTenderDay', () => {
            const { sandbox, gs } = amb;
            delete gs.corporateTenders;
            delete gs.corporateContracts;
            delete gs.tenderHistory;
            delete gs.nextTenderDay;
            gs.day = 5;

            sandbox.CE_Contracts.initState();

            assert.ok(Array.isArray(gs.corporateTenders), 'corporateTenders deve essere un array');
            assert.ok(Array.isArray(gs.corporateContracts), 'corporateContracts deve essere un array');
            assert.ok(Array.isArray(gs.tenderHistory), 'tenderHistory deve essere un array');
            assert.equal(gs.nextTenderDay, 7, 'nextTenderDay deve essere day + 2 se non impostato');
        });

        test('b2bRefresh carica i contratti e il contratto attivo da Supabase', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.b2bRefresh();

            assert.equal(sandbox._b2bState.contracts.length, 2);
            assert.equal(sandbox._b2bState.activeContract, null);
            assert.ok(sandbox._b2bState._lastFetch > 0);
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_b2b_contracts'));
        });

        test('b2bRefresh non solleva errori se supabaseClient è assente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.b2bRefresh();
            });
        });

        test('b2bInit non invoca RPC se utente non loggato', async () => {
            const ambNoAuth = creaAmbienteContratti({ currentUser: null });
            await ambNoAuth.sandbox.b2bInit();

            assert.equal(ambNoAuth.rpcLog.length, 0);
            ambNoAuth.env.stopAllIntervals();
        });
    });

    describe('2. Requisiti e Calcolo Punteggi (meetsRequirements, _cCountQualifying, _cPlayerScore, Rank B2B)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_Contracts.meetsRequirements valuta correttamente reputazione e veicoli qualificanti', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 4.5; // 4.5 / 5.0 * 100 = 90%

            const companyUltra = {
                company_name: 'Titan Forge Defense',
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'armored_suv', min_reputation: 85 },
            };

            // Flotta ha 1 veicolo ultra -> fleetOk = false (servono 2), repOk = true (90 >= 85)
            const res1 = sandbox.CE_Contracts.meetsRequirements(companyUltra);
            assert.equal(res1.repOk, true);
            assert.equal(res1.fleetOk, false);
            assert.equal(res1.qualifying, 1);
            assert.equal(res1.playerRepPct, 90);

            // Aggiungiamo un secondo veicolo ultra -> fleetOk = true
            gs.fleet.push({ id: 'veh_ultra_2', tier: 'ultra', condition: 90, outOfService: null });
            const res2 = sandbox.CE_Contracts.meetsRequirements(companyUltra);
            assert.equal(res2.fleetOk, true);
            assert.equal(res2.qualifying, 2);
        });

        test('_cCountQualifying esclude veicoli fuori servizio o con condizione <= 10', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', tier: 'vip', condition: 100, outOfService: null },
                { id: 'c2', tier: 'vip', condition: 8, outOfService: null }, // condizione troppo bassa
                { id: 'c3', tier: 'vip', condition: 95, outOfService: true }, // fuori servizio
            ];

            const countVip = vm.runInContext('_cCountQualifying("luxury_sedan")', sandbox);
            assert.equal(countVip, 1, 'solo c1 deve qualificarsi');
        });

        test('_cPlayerScore calcola la formula ponderata 40% rep + 40% flotta + 20% pledge con tetto 100', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 5.0; // 100% rep -> 40 pt
            gs.fleet = [
                { id: 'v1', tier: 'business', condition: 100, outOfService: null },
                { id: 'v2', tier: 'business', condition: 100, outOfService: null },
            ];

            const company = {
                tender_requirements: { min_fleet_size: 2, required_vehicle_type: 'executive_sedan', min_reputation: 70 },
            };

            // Pledge €50.000 -> 100% pledge (20 pt) -> totale 40 + 40 + 20 = 100
            const scoreMax = vm.runInContext(`_cPlayerScore(${JSON.stringify(company)}, 50000)`, sandbox);
            assert.equal(scoreMax, 100);

            // Pledge €0 -> totale 40 + 40 + 0 = 80
            const scoreNoPledge = vm.runInContext(`_cPlayerScore(${JSON.stringify(company)}, 0)`, sandbox);
            assert.equal(scoreNoPledge, 80);

            // Rep 2.5 (20 pt), 1 auto su 2 (20 pt), pledge €25.000 (10 pt) -> totale 50
            gs.reputation = 2.5;
            gs.fleet = [{ id: 'v1', tier: 'business', condition: 100, outOfService: null }];
            const scoreMid = vm.runInContext(`_cPlayerScore(${JSON.stringify(company)}, 25000)`, sandbox);
            assert.equal(scoreMid, 50);
        });

        test('mappatura rank B2B (_b2bCarRank, _b2bReqRank) confronta catalogo maiuscolo e flotta minuscola', () => {
            const { sandbox } = amb;

            assert.equal(vm.runInContext('_b2bCarRank({ tier: "standard" })', sandbox), 1);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "business" })', sandbox), 2);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "vip" })', sandbox), 3);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "group" })', sandbox), 3);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "ultra" })', sandbox), 4);
            assert.equal(vm.runInContext('_b2bCarRank({ tier: "sconosciuto" })', sandbox), 0);

            assert.equal(vm.runInContext('_b2bReqRank("BUSINESS")', sandbox), 2);
            assert.equal(vm.runInContext('_b2bReqRank("PREMIUM")', sandbox), 2);
            assert.equal(vm.runInContext('_b2bReqRank("PRESIDENTIAL")', sandbox), 4);
            assert.equal(vm.runInContext('_b2bReqRank("ARMORED")', sandbox), 4);
            assert.equal(vm.runInContext('_b2bReqRank("ULTRA")', sandbox), 4);
            assert.equal(vm.runInContext('_b2bReqRank("SCONOSCIUTO")', sandbox), 2);
        });
    });

    describe('3. Bandi Corporate — Offerte e Preview (CE_placeBid, CE_cancelBid, CE_updateBidPreview)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 100000 });
            amb.gs.corporateTenders = [{
                id: 't_alpha_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    contract_duration_days: 30,
                    payout_per_hour: 6500,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'business_sedan', min_reputation: 70 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_placeBid piazza offerta valida detraendo il pledge dal saldo e registrando lo score', async () => {
            const { sandbox, gs, syncedCash } = amb;

            sandbox.CE_placeBid('t_alpha_1', 15000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000, 'il cash scala di 15000€');
            const tender = gs.corporateTenders.find(t => t.id === 't_alpha_1');
            assert.ok(tender.playerBid);
            assert.equal(tender.playerBid.pledgedCash, 15000);
            assert.ok(tender.playerBid.score > 0);
            assert.deepEqual(syncedCash, [85000]);
        });

        test('CE_placeBid rialza un\'offerta detraendo unicamente la differenza', async () => {
            const { sandbox, gs, syncedCash } = amb;

            sandbox.CE_placeBid('t_alpha_1', 10000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 90000);

            // Rialzo a 25000 -> differenza 15000
            sandbox.CE_placeBid('t_alpha_1', 25000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 75000);
            assert.deepEqual(syncedCash, [90000, 75000]);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 25000);
        });

        test('CE_placeBid riduce un\'offerta rimborsando la differenza', async () => {
            const { sandbox, gs, syncedCash } = amb;

            sandbox.CE_placeBid('t_alpha_1', 30000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 70000);

            // Riduzione a 10000 -> rimborso 20000
            sandbox.CE_placeBid('t_alpha_1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 90000);
            assert.deepEqual(syncedCash, [70000, 90000]);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 10000);
        });

        test('CE_placeBid rifiuta offerte con fondi insufficienti senza intaccare la cassa', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 5000;

            sandbox.CE_placeBid('t_alpha_1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.deepEqual(syncedCash, []);
        });

        test('CE_placeBid su bando inesistente o chiuso non altera lo stato', async () => {
            const { sandbox, gs, syncedCash } = amb;

            sandbox.CE_placeBid('tndr_inesistente', 10000);
            assert.equal(gs.cash, 100000);

            gs.corporateTenders[0].status = 'closed';
            sandbox.CE_placeBid('t_alpha_1', 10000);
            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
        });

        test('CE_placeBid limita il pledge nell intervallo 0 - 50.000€', async () => {
            const { sandbox, gs } = amb;

            // Tentativo con pledge 90.000 -> clamped a 50.000
            sandbox.CE_placeBid('t_alpha_1', 90000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 50000);
            assert.equal(gs.cash, 50000);

            // Tentativo con valore negativo -> clamped a 0
            sandbox.CE_placeBid('t_alpha_1', -5000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 0);
            assert.equal(gs.cash, 100000);
        });

        test('CE_cancelBid rimborsa il pledge e secondo annullamento è idempotente', async () => {
            const { sandbox, gs, syncedCash } = amb;

            sandbox.CE_placeBid('t_alpha_1', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 80000);

            // Primo annullamento -> rimborsa 20000
            sandbox.CE_cancelBid('t_alpha_1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.equal(gs.corporateTenders[0].playerBid, null);

            // Secondo annullamento -> nessun effetto e nessun rimborso duplicato
            sandbox.CE_cancelBid('t_alpha_1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, [80000, 100000]);
        });

        test('CE_updateBidPreview aggiorna i nodi DOM con score ricalcolato e valore formattato', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = `
                <div id="tab-container"></div>
                <div id="bid-score-t_alpha_1">0</div>
                <div id="bid-pledge-val-t_alpha_1">€0</div>
            `;

            sandbox.CE_updateBidPreview('t_alpha_1', 25000);

            const scoreEl = sandbox.document.getElementById('bid-score-t_alpha_1');
            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_alpha_1');
            assert.ok(Number(scoreEl.textContent) > 0);
            assert.ok(pledgeEl.textContent.includes('25.000') || pledgeEl.textContent.includes('25,000'));
        });
    });

    describe('4. Ciclo Giornaliero Bandi e Risoluzione (CE_Contracts.dailyTick)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 50000 });
            amb.sandbox.CE_Contracts.initState();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('dailyTick accredita il payout giornaliero dei contratti attivi e aggiorna totalEarned', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 2;
            gs.corporateContracts = [{
                id: 'ctr_1',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                startDay: 1,
                endDay: 31,
                dailyPayout: 104000, // 6500 * 16
                totalEarned: 0,
                status: 'active',
            }];

            sandbox.CE_Contracts.dailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 154000);
            assert.equal(gs.corporateContracts[0].totalEarned, 104000);
            assert.deepEqual(syncedCash, [154000]);
        });

        test('dailyTick fa scadere i contratti giunti a endDay e li sposta nello storico', () => {
            const { sandbox, gs } = amb;
            gs.day = 15;
            gs.corporateContracts = [{
                id: 'ctr_exp',
                companyId: 'Quick Foods',
                company: { company_name: 'Quick Foods', tier: 2, contract_duration_days: 7 },
                startDay: 1,
                endDay: 8, // scaduto a giorno 8
                dailyPayout: 1500,
                totalEarned: 10500,
                status: 'active',
            }];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateContracts.length, 1);
            assert.equal(gs.corporateContracts[0].status, 'expired');
        });

        test('dailyTick risolve bando vinto: crea contratto attivo con payout orario * 16', () => {
            const { sandbox, gs } = amb;
            gs.day = 3;
            gs.corporateTenders = [{
                id: 't_win',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    contract_duration_days: 30,
                    payout_per_hour: 6500,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'business_sedan', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: { pledgedCash: 50000, score: 999 }, // punteggio imbattibile
                status: 'open',
            }];

            gs.nextTenderDay = 99; // evita generazione di un nuovo batch in questo test
            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 0, 'il bando chiuso deve essere rimosso dai bandi aperti');
            assert.equal(gs.corporateContracts.length, 1);
            const c = gs.corporateContracts[0];
            assert.equal(c.status, 'active');
            assert.equal(c.dailyPayout, 6500 * 16); // 104.000€
            assert.equal(c.startDay, 3);
            assert.equal(c.endDay, 33);
        });

        test('dailyTick risolve bando perso: rimborsa automaticamente il pledge via CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 3;
            gs.cash = 50000;
            gs.corporateTenders = [{
                id: 't_loss',
                companyId: 'Quantum Ledger',
                company: {
                    company_name: 'Quantum Ledger',
                    tier: 5,
                    contract_duration_days: 14,
                    payout_per_hour: 6200,
                    tender_requirements: { min_fleet_size: 5, required_vehicle_type: 'luxury_sedan', min_reputation: 90 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: { pledgedCash: 25000, score: 0 }, // punteggio 0 -> perde sicuro
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 75000, 'il pledge di 25000€ viene rimborsato');
            assert.deepEqual(syncedCash, [75000]);
            assert.equal(gs.corporateContracts.length, 0);
            assert.equal(gs.tenderHistory.length, 1);
            assert.equal(gs.tenderHistory[0].result.won, false);
        });

        test('dailyTick genera un nuovo batch di 4 bandi quando day >= nextTenderDay', () => {
            const { sandbox, gs } = amb;
            gs.day = 10;
            gs.nextTenderDay = 10;
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();

            assert.equal(gs.corporateTenders.length, 4, 'deve generare 4 bandi');
            assert.equal(gs.nextTenderDay, 13, 'nextTenderDay deve essere 10 + 3 = 13');
            gs.corporateTenders.forEach(t => {
                assert.equal(t.status, 'open');
                assert.equal(t.openedDay, 10);
                assert.equal(t.closingDay, 12);
                assert.equal(t.playerBid, null);
            });
        });

        test('idempotenza pagamenti: il render della scheda NON accredita payout contratti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            gs.corporateContracts = [{
                id: 'c1',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                dailyPayout: 50000,
                totalEarned: 0,
                status: 'active',
            }];

            sandbox.renderTabContracts();
            sandbox.renderTabContracts();
            sandbox.renderTabContracts();

            assert.equal(gs.cash, 20000, 'il render ripetuto non deve muovere denaro');
            assert.equal(gs.corporateContracts[0].totalEarned, 0);
        });
    });

    describe('5. Rescissione Contratti Corporate Locali (CE_terminateContract)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti();
            amb.gs.corporateContracts = [{
                id: 'ctr_term',
                companyId: 'Pear Technologies',
                company: { company_name: 'Pear Technologies', tier: 5, contract_duration_days: 30 },
                status: 'active',
            }];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('CE_terminateContract con conferma imposta lo stato su terminated', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_terminateContract('ctr_term');

            assert.equal(gs.corporateContracts[0].status, 'terminated');
        });

        test('CE_terminateContract con confirm=false non rescinde il contratto', () => {
            const { sandbox, gs } = amb;
            sandbox.confirm = () => false;

            sandbox.CE_terminateContract('ctr_term');

            assert.equal(gs.corporateContracts[0].status, 'active');
        });

        test('CE_terminateContract su contratto inesistente non fa nulla', () => {
            const { sandbox, gs } = amb;

            sandbox.CE_terminateContract('ctr_fantasma');
            assert.equal(gs.corporateContracts[0].status, 'active');
        });
    });

    describe('6. Contratti B2B Server — Modal di Selezione e Accettazione (b2bOpenAcceptModal, b2bCheckLimit, b2bConfirmAccept, b2bAcceptContract)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bOpenAcceptModal apre il modale con i veicoli qualificati disponibili', () => {
            const { sandbox } = amb;

            sandbox.b2bOpenAcceptModal('b2b_c1');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.ok(modal, 'il modale b2b-select-modal deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('Navetta Executive Headquarter'));
            assert.ok(modal.innerHTML.includes('Mercedes E-Class'));
            assert.ok(modal.innerHTML.includes('BMW 5 Series'));
            assert.ok(modal.innerHTML.includes('data-ce-act="b2bConfirmAccept"'));
        });

        test('b2bOpenAcceptModal rifiuta e mostra errore se i veicoli idonei disponibili sono insufficienti', () => {
            const { sandbox, env } = amb;
            // Impostiamo solo 1 veicolo business quando per b2b_c1 ne servono 2
            sandbox.gameState.fleet = [
                { id: 'v1', tier: 'business', condition: 100, isLease: false },
            ];

            sandbox.b2bOpenAcceptModal('b2b_c1');

            const modal = sandbox.document.getElementById('b2b-select-modal');
            assert.equal(modal, null);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bOpenAcceptModal esclude veicoli in leasing o già vincolati', () => {
            const { sandbox, env } = amb;
            sandbox._b2bState.activeContract = {
                status: 'active',
                locked_vehicles: ['veh_bus_1'],
            };

            // b2b_c2 richiede ARMORED (ultra). Nella flotta di default c'è solo 1 auto ultra.
            // Se la blocchiamo nell'attivo, non deve essere selezionabile.
            sandbox._b2bState.activeContract.locked_vehicles = ['veh_ultra_1'];

            sandbox.b2bOpenAcceptModal('b2b_c2');

            assert.equal(sandbox.document.getElementById('b2b-select-modal'), null);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non hai abbastanza veicoli')));
        });

        test('b2bLockedVehicleIds e b2bLockedDriverIds gestiscono parsing stringa e array', () => {
            const { sandbox } = amb;

            sandbox._b2bState.activeContract = {
                status: 'active',
                locked_vehicles: ['v1', 'v2'],
                locked_drivers: '["d1", "d2"]',
            };

            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), ['v1', 'v2']);
            assert.deepEqual(Array.from(sandbox.b2bLockedDriverIds()), ['d1', 'd2']);

            sandbox._b2bState.activeContract = null;
            assert.deepEqual(Array.from(sandbox.b2bLockedVehicleIds()), []);
            assert.deepEqual(Array.from(sandbox.b2bLockedDriverIds()), []);
        });

        test('b2bCheckLimit aggiorna contatore e stato pulsante conferma', () => {
            const { sandbox } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1'); // richiede 2 veicoli

            const checkboxes = sandbox.document.querySelectorAll('.b2b-car-check');
            assert.ok(checkboxes.length >= 2);

            // Spunta prima checkbox
            checkboxes[0].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '1');
            assert.equal(sandbox.document.getElementById('b2b-confirm-btn').disabled, true);

            // Spunta seconda checkbox
            checkboxes[1].checked = true;
            sandbox.b2bCheckLimit(2);
            assert.equal(sandbox.document.getElementById('b2b-sel-count').textContent, '2');
            assert.equal(sandbox.document.getElementById('b2b-confirm-btn').disabled, false);
        });

        test('b2bConfirmAccept blocca se selezione parziale e accetta se completa con driver associati', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.b2bOpenAcceptModal('b2b_c1');

            // Nessuna checkbox spuntata -> fallisce
            await sandbox.b2bConfirmAccept('b2b_c1', 2);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Seleziona almeno 2 veicoli')));

            // Spunta veh_bus_1 e veh_bus_2
            const cbs = sandbox.document.querySelectorAll('.b2b-car-check');
            cbs[0].checked = true;
            cbs[1].checked = true;

            await sandbox.b2bConfirmAccept('b2b_c1', 2);

            const acceptRpc = rpcLog.find(r => r.nome === 'rpc_accept_b2b_contract');
            assert.ok(acceptRpc);
            assert.equal(acceptRpc.args.v_contract_id, 'b2b_c1');
            assert.deepEqual(Array.from(acceptRpc.args.v_vehicle_ids), ['veh_bus_1', 'veh_bus_2']);
            assert.deepEqual(Array.from(acceptRpc.args.v_driver_ids), ['drv_1', 'drv_2']);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('accettato')));
        });

        test('b2bAcceptContract senza utente loggato notifica errore', async () => {
            const { sandbox, rpcLog, env } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1'], ['drv_1']);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_accept_b2b_contract').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Devi essere loggato')));
        });

        test('b2bAcceptContract con errore RPC mostra notifica di errore', async () => {
            const ambErr = creaAmbienteContratti({
                rpcHandlers: {
                    rpc_accept_b2b_contract: async () => ({
                        data: null,
                        error: { message: 'Contratto già assegnato ad un altro concorrente' },
                    }),
                },
            });
            await ambErr.sandbox.b2bRefresh();

            await ambErr.sandbox.b2bAcceptContract('b2b_c1', ['veh_bus_1'], ['drv_1']);

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Contratto non accettato')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('7. Contratti B2B Server — Rescissione e Penale (b2bTerminateContract)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({
                cash: 100000,
                reputation: 4.5,
                b2bActive: {
                    id: 'act_b2b_c1',
                    daily_payout: 4200,
                    days_remaining: 10,
                    penalty: 15000,
                    status: 'active',
                },
            });
            amb.sandbox._b2bState.activeContract = amb.getStatoB2BActive();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('b2bTerminateContract confermato addebita penale via addebitatoDalServer e applica penalità reputazione', async () => {
            const { sandbox, gs, rpcLog, syncedCash, bigEvents } = amb;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            assert.equal(gs.cash, 85000, 'penale di 15000€ scalata dal saldo');
            assert.deepEqual(syncedCash, [], 'ServerState.syncCash NON deve essere chiamato (addebitatoDalServer)');
            assert.equal(Math.round(gs.reputation * 100) / 100, 4.00, 'penale reputazione di -0.5 applicata');
            assert.equal(sandbox._b2bState.activeContract, null);

            const termRpc = rpcLog.find(r => r.nome === 'rpc_terminate_b2b_contract');
            assert.ok(termRpc);
            assert.equal(termRpc.args.v_active_id, 'act_b2b_c1');
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Rescisso');
        });

        test('b2bTerminateContract annullato dall\'utente (confirm=false) non invoca RPC e non toglie soldi', async () => {
            const { sandbox, gs, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            assert.equal(gs.cash, 100000);
            assert.equal(gs.reputation, 4.5);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
        });

        test('b2bTerminateContract con utente non loggato non fa nulla', async () => {
            const { sandbox, gs, rpcLog } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.b2bTerminateContract('act_b2b_c1');

            assert.equal(gs.cash, 100000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_terminate_b2b_contract').length, 0);
        });
    });

    describe('8. Contratti B2B Server — Routine Giornaliera e Payout (_b2bDailyTick)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({
                cash: 50000,
                reputation: 4.0,
                b2bActive: {
                    id: 'act_b2b_c1',
                    daily_payout: 4200,
                    days_remaining: 5,
                    title: 'Navetta Executive',
                    status: 'active',
                },
            });
            amb.sandbox._b2bState.activeContract = amb.getStatoB2BActive();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_b2bDailyTick accredita payout giornaliero tramite accreditatoDalServer senza invocare syncCash', async () => {
            const { sandbox, gs, rpcLog, syncedCash, env } = amb;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 54200);
            assert.deepEqual(syncedCash, [], 'ServerState.syncCash NON deve essere chiamato (accreditatoDalServer)');
            assert.ok(rpcLog.some(r => r.nome === 'rpc_b2b_daily_tick'));
            assert.equal(sandbox._b2bState.activeContract.days_remaining, 4);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('B2B: +€4')));
        });

        test('_b2bDailyTick al completamento contratto azzera contratto attivo e assegna bonus reputazione', async () => {
            const { sandbox, gs, bigEvents } = amb;
            sandbox._b2bState.activeContract.days_remaining = 1;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 54200);
            assert.equal(sandbox._b2bState.activeContract, null);
            assert.equal(Math.round(gs.reputation * 100) / 100, 4.30, 'bonus reputazione +0.3 applicato');
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Contratto Completato!');
        });

        test('_b2bDailyTick senza utente o senza risposta non muove denaro', async () => {
            const { sandbox, gs } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox._b2bDailyTick();

            assert.equal(gs.cash, 50000);
        });

        test('idempotenza pagamenti B2B: renderTabB2B non accredita alcun denaro', () => {
            const { sandbox, gs } = amb;

            sandbox.renderTabB2B();
            sandbox.renderTabB2B();

            assert.equal(gs.cash, 50000);
        });
    });

    describe('9. Rendering Schede e Navigazione UI (renderTabContracts, renderTabB2B)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteContratti();
            await amb.sandbox.b2bRefresh();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabContracts disegna intestazione, KPI, bandi aperti e storico', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [{
                id: 't_test',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    industry: 'Tech',
                    lore_description: 'Lore test',
                    tier: 5,
                    contract_duration_days: 30,
                    payout_per_hour: 6500,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'business_sedan', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
            gs.tenderHistory = [{
                company: { company_name: 'Alpha Corp', tier: 3, payout_per_hour: 200 },
                result: { won: true, pScore: 85, bestAI: 70 },
            }];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Bandi &amp; Contratti Aziendali'));
            assert.ok(c.innerHTML.includes('Pear Technologies'));
            assert.ok(c.innerHTML.includes('Storico Bandi'));
            assert.ok(c.innerHTML.includes('Alpha Corp'));
            assert.ok(c.innerHTML.includes('VINTO'));
        });

        test('renderTabContracts con lista bandi vuota mostra stato di attesa', () => {
            const { sandbox, gs } = amb;
            gs.corporateTenders = [];

            sandbox.renderTabContracts();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessun bando disponibile'));
        });

        test('renderTabB2B per utente non loggato mostra invito al login', () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Accedi per visualizzare i contratti disponibili'));
        });

        test('renderTabB2B con contratto attivo disegna card attiva con SLA, progresso e tasto rescissione', () => {
            const { sandbox } = amb;
            sandbox._b2bState.activeContract = {
                id: 'act_1',
                contract_title: 'Navetta VIP',
                contract_client: 'Stark Corp',
                contract_icon: '🏢',
                daily_payout: 5000,
                days_total: 10,
                days_remaining: 7,
                sla_score: 95,
                penalty_amount: 10000,
                locked_vehicles: ['veh_bus_1'],
                status: 'active',
            };

            sandbox.renderTabB2B();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Contratto Attivo'));
            assert.ok(c.innerHTML.includes('Navetta VIP'));
            assert.ok(c.innerHTML.includes('SLA Score'));
            assert.ok(c.innerHTML.includes('95%'));
            assert.ok(c.innerHTML.includes('Rescindi Anticipatamente'));
            assert.ok(c.innerHTML.includes('data-ce-act="b2bTerminateContract"'));
        });
    });

    describe('10. Event Delegation — Integrazione ce-actions.js ed events.js', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteContratti({ cash: 100000 });
            amb.gs.corporateTenders = [{
                id: 't_dom_1',
                companyId: 'Pear Technologies',
                company: {
                    company_name: 'Pear Technologies',
                    tier: 5,
                    contract_duration_days: 30,
                    payout_per_hour: 6500,
                    tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'business_sedan', min_reputation: 50 },
                },
                openedDay: 1,
                closingDay: 3,
                playerBid: null,
                status: 'open',
            }];
            amb.sandbox.renderTabContracts();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ceBidPreview aggiorna lo score di anteprima', () => {
            const { sandbox } = amb;
            const slider = sandbox.document.getElementById('pledge-t_dom_1');
            assert.ok(slider);

            slider.value = '35000';
            sandbox.ceBidPreview.call(slider, 't_dom_1');

            const scoreEl = sandbox.document.getElementById('bid-score-t_dom_1');
            const pledgeEl = sandbox.document.getElementById('bid-pledge-val-t_dom_1');
            assert.ok(Number(scoreEl.textContent) > 0);
            assert.ok(pledgeEl.textContent.includes('35.000') || pledgeEl.textContent.includes('35,000'));
        });

        test('cePlaceBid legge il valore da pledge-input e invoca CE_placeBid', () => {
            const { sandbox, gs } = amb;
            const slider = sandbox.document.getElementById('pledge-t_dom_1');
            slider.value = '20000';

            sandbox.cePlaceBid('t_dom_1');

            assert.equal(gs.cash, 80000);
            assert.equal(gs.corporateTenders[0].playerBid.pledgedCash, 20000);
        });
    });

    describe('11. Guardrail Monetari e Anti-Doppio Conteggio', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteContratti({ cash: 100000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('sistema locale contracts.js sincronizza sempre la cassa tramite ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.corporateTenders = [{
                id: 't1',
                company: { company_name: 'Test', tender_requirements: { min_fleet_size: 1, required_vehicle_type: 'standard', min_reputation: 0 } },
                status: 'open',
                playerBid: null,
            }];

            sandbox.CE_placeBid('t1', 12000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 88000);
            assert.deepEqual(syncedCash, [88000], 'il sistema locale DEVE chiamare syncCash');
        });

        test('sistema server b2b.js NON deve chiamare ServerState.syncCash su tick o penale', async () => {
            const ambB2B = creaAmbienteContratti({
                cash: 100000,
                b2bActive: {
                    id: 'act_1',
                    daily_payout: 3000,
                    days_remaining: 5,
                    penalty: 8000,
                    status: 'active',
                },
            });
            const { sandbox, gs, syncedCash } = ambB2B;
            sandbox._b2bState.activeContract = ambB2B.getStatoB2BActive();

            // Tick giornaliero
            await sandbox._b2bDailyTick();
            assert.equal(gs.cash, 103000);
            assert.deepEqual(syncedCash, [], 'tick B2B non deve scatenare syncCash');

            // Rescissione con penale
            await sandbox.b2bTerminateContract('act_1');
            assert.equal(gs.cash, 95000);
            assert.deepEqual(syncedCash, [], 'rescissione B2B non deve scatenare syncCash');
            ambB2B.env.stopAllIntervals();
        });
    });
});
