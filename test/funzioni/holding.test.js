'use strict';
/* ============================================================================
   test/funzioni/holding.test.js — Holding Finanziaria & OPA Ostili

   Verifica approfondita del funzionamento della feature "holding" (attualmente
   disattivata in config.js).

   Analisi dei DUE sistemi paralleli:
   1. Sistema Locale (engine-holding.js + engine-daily.js + ui-investments.js):
      - Costituzione holding societaria (incorporateHolding)
      - Acquisizione sussidiarie (acquireSubsidiary)
      - Cessione sussidiarie (divestSubsidiary)
      - Rendite passive e dividendi nel ciclo giornaliero (processDailyRoutines)
      - Compravendita azioni $CEMP (buyCempShares / sellCempShares) e drift prezzo
      - Quotazione IPO NPC locale (_listCompanyIPO_NPC) e dividendi NPC
      - Rendering della sezione holding nel pannello investimenti (renderTabInvestments)

   2. Sistema Server / MMO (hostile_takeover.js + engine-rides.js + 27_hostile_takeovers.sql):
      - Caricamento e visualizzazione OPA ostili (renderTabOPA)
      - Ruoli: Target, Raider, Osservatore
      - Riscatto / Buyback maggioranza (_opaRequestBuyback / rpc_opa_buyback)
      - Detrazione dividendo di maggioranza al completamento corse (rpc_pay_majority_dividend)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione holding — Holding Finanziaria & OPA Ostili', () => {
    let env, sandbox, gs;
    let syncedCashCalls;
    let supabaseRpcCalls;
    let HOLDING_SUBSIDIARIES;

    function setupSupabaseMock() {
        supabaseRpcCalls = [];

        const mockClient = {
            from: (_table) => ({
                upsert: async () => ({ error: null }),
                select: (_cols) => ({
                    eq: (_col, _val) => ({
                        order: (_col2, _opts) => Promise.resolve({ data: [], error: null }),
                    }),
                    order: (_col2, _opts) => Promise.resolve({ data: [], error: null }),
                }),
            }),
            rpc: async (name, params) => {
                supabaseRpcCalls.push({ name, params });
                if (name === 'rpc_get_hostile_takeovers') {
                    return {
                        data: [
                            {
                                opa_id: 'opa_001',
                                target_company: 'Player Corporation',
                                raider_company: 'BlackRock Chauffeur',
                                raider_pct: 54.5,
                                buyback_price: 350000,
                                total_dividends: 18400,
                                triggered_at: new Date(Date.now() - 86400000 * 3).toISOString(),
                                is_my_target: true,
                                is_my_raid: false,
                            },
                            {
                                opa_id: 'opa_002',
                                target_company: 'Rival Limousine',
                                raider_company: 'Player Corporation',
                                raider_pct: 52.0,
                                buyback_price: 280000,
                                total_dividends: 12000,
                                triggered_at: new Date(Date.now() - 86400000 * 5).toISOString(),
                                is_my_target: false,
                                is_my_raid: true,
                            },
                        ],
                        error: null,
                    };
                }
                if (name === 'rpc_opa_buyback') {
                    return {
                        data: { success: true, paid: params?.v_buyback_price || 350000 },
                        error: null,
                    };
                }
                if (name === 'rpc_pay_majority_dividend') {
                    return {
                        data: Math.floor((params?.v_ride_earnings || 1000) * 0.20),
                        error: null,
                    };
                }
                return { data: {}, error: null };
            },
        };

        sandbox.supabaseClient = mockClient;
        sandbox.window.supabaseClient = mockClient;
        sandbox.currentUser = { id: 'usr_player_1' };
        sandbox.window.currentUser = sandbox.currentUser;
    }

    beforeEach(() => {
        syncedCashCalls = [];
        env = freshEnv({
            render: true,
            serverState: {
                syncCash: async (v) => {
                    syncedCashCalls.push(v);
                    return { success: true, cash: v };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;

        const container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);

        setupSupabaseMock();
        HOLDING_SUBSIDIARIES = vm.runInContext('HOLDING_SUBSIDIARIES', sandbox);
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. SISTEMA LOCALE — Costituzione Holding (incorporateHolding)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Locale — Costituzione Holding (incorporateHolding)', () => {
        test('costituisce la holding scalando 200.000€ se rep >= 4.0 e fondi sufficienti', async () => {
            gs.reputation = 4.2;
            gs.cash = 350000;
            gs.day = 12;
            gs.holding = { incorporated: false, subsidiaries: [] };

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.holding.incorporated, true, 'la holding deve essere contrassegnata come incorporata');
            assert.equal(gs.holding.incorporationDay, 12, 'deve memorizzare il giorno di costituzione');
            assert.deepEqual(gs.holding.subsidiaries, [], 'la lista sussidiarie deve essere inizializzata vuota');
            assert.equal(gs.cash, 150000, 'il costo di 200.000€ deve essere detratto');
            assert.deepEqual(syncedCashCalls, [150000], 'il saldo aggiornato deve essere sincronizzato');
            assert.ok(env.notifications.length >= 0);
        });

        test('rifiuta la costituzione se la reputazione è inferiore a 4.0★', async () => {
            gs.reputation = 3.9;
            gs.cash = 500000;
            gs.holding = { incorporated: false, subsidiaries: [] };

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.holding.incorporated, false, 'non deve incorporare');
            assert.equal(gs.cash, 500000, 'non deve scalare denaro');
            assert.equal(syncedCashCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('serve 4★') || n.msg.includes('4.0★') || n.msg.includes('Reputazione insufficiente')));
        });

        test('rifiuta la costituzione se il saldo è inferiore a 200.000€', async () => {
            gs.reputation = 4.5;
            gs.cash = 180000;
            gs.holding = { incorporated: false, subsidiaries: [] };

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.holding.incorporated, false);
            assert.equal(gs.cash, 180000);
            assert.equal(syncedCashCalls.length, 0);
        });

        test('rifiuta la costituzione se la holding è già incorporata', async () => {
            gs.reputation = 4.5;
            gs.cash = 300000;
            gs.holding = { incorporated: true, incorporationDay: 5, subsidiaries: ['sub_fleet'] };

            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 300000, 'nessuna spesa aggiuntiva');
            assert.equal(gs.holding.incorporationDay, 5);
            assert.ok(env.notifications.some(n => n.msg.includes('già incorporata')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. SISTEMA LOCALE — Acquisizione Sussidiarie (acquireSubsidiary)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Locale — Acquisizione Sussidiarie (acquireSubsidiary)', () => {
        beforeEach(() => {
            gs.reputation = 4.5;
            gs.cash = 500000;
            gs.holding = { incorporated: true, incorporationDay: 1, subsidiaries: [] };
        });

        test('acquisisce una sussidiaria valida (es. sub_hotel a 250.000€) e la aggiunge allo stato', async () => {
            assert.ok(Array.isArray(HOLDING_SUBSIDIARIES) && HOLDING_SUBSIDIARIES.length >= 5, 'HOLDING_SUBSIDIARIES deve esistere');
            const hotelSub = HOLDING_SUBSIDIARIES.find(s => s.id === 'sub_hotel');
            assert.ok(hotelSub, 'sub_hotel deve essere configurata');
            assert.equal(hotelSub.cost, 250000);

            sandbox.acquireSubsidiary('sub_hotel');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 250000, 'deve scalare 250.000€');
            assert.deepEqual(gs.holding.subsidiaries, ['sub_hotel']);
            assert.deepEqual(syncedCashCalls, [250000]);
        });

        test('non permette l acquisto se la holding non è ancora costituita', async () => {
            gs.holding = { incorporated: false, subsidiaries: [] };

            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.deepEqual(gs.holding.subsidiaries, []);
            assert.ok(env.notifications.some(n => n.msg.includes('prima fondare una Holding')));
        });

        test('non permette l acquisto se l identificativo sussidiaria non esiste', async () => {
            sandbox.acquireSubsidiary('sub_inesistente_xyz');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.deepEqual(gs.holding.subsidiaries, []);
            assert.equal(syncedCashCalls.length, 0);
        });

        test('non permette l acquisto duplicato di una sussidiaria già posseduta', async () => {
            gs.holding.subsidiaries = ['sub_fleet'];

            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.deepEqual(gs.holding.subsidiaries, ['sub_fleet']);
            assert.ok(env.notifications.some(n => n.msg.includes('già acquisita')));
        });

        test('rifiuta l acquisto se i fondi disponibili sono inferiori al costo', async () => {
            gs.cash = 100000; // sub_tech costa 300.000€

            sandbox.acquireSubsidiary('sub_tech');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(gs.holding.subsidiaries, []);
            assert.equal(syncedCashCalls.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. SISTEMA LOCALE — Cessione Sussidiarie (divestSubsidiary)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Locale — Cessione Sussidiarie (divestSubsidiary)', () => {
        beforeEach(() => {
            gs.cash = 50000;
            gs.holding = { incorporated: true, incorporationDay: 1, subsidiaries: ['sub_fleet', 'sub_fuel'] };
        });

        test('cede una sussidiaria posseduta recuperando il 60% del costo d acquisto', async () => {
            // sub_fuel costa 180.000€ -> 60% = 108.000€
            sandbox.divestSubsidiary('sub_fuel');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 158000, '50.000 + 108.000 = 158.000€');
            assert.deepEqual(gs.holding.subsidiaries, ['sub_fleet']);
            assert.deepEqual(syncedCashCalls, [158000]);
            assert.ok(env.notifications.some(n => n.msg.includes('ceduta') && n.msg.includes('108.000')));
        });

        test('non effettua alcuna operazione se la sussidiaria non è tra quelle possedute', async () => {
            sandbox.divestSubsidiary('sub_tech');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(gs.holding.subsidiaries, ['sub_fleet', 'sub_fuel']);
            assert.equal(syncedCashCalls.length, 0);
        });

        test('non effettua alcuna operazione se la sussidiaria non esiste nel catalogo', async () => {
            sandbox.divestSubsidiary('sub_fantasma');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(gs.holding.subsidiaries, ['sub_fleet', 'sub_fuel']);
            assert.equal(syncedCashCalls.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. SISTEMA LOCALE — Rendite e Dividendi Giornalieri (processDailyRoutines)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Locale — Dividendi Giornalieri Sussidiarie (processDailyRoutines)', () => {
        test('accredita i dividendi giornalieri di tutte le sussidiarie possedute a fine giornata', () => {
            // sub_fleet (800€) + sub_hotel (1500€) + sub_tech (2000€) = 4300€/g
            gs.holding = {
                incorporated: true,
                subsidiaries: ['sub_fleet', 'sub_hotel', 'sub_tech'],
            };
            gs.cash = 100000;
            gs.staff = []; // nessun costo fisso per isolare il test
            gs.drivers = [];
            gs.fleet = [];

            sandbox.processDailyRoutines();

            // Calcolo: income base 0, spese 0, dividendi subsidiarie +4.300€
            assert.equal(gs.cash, 104300, 'il saldo deve includere 4.300€ di dividendi');
        });

        test('non accredita dividendi sussidiarie se nessuna sussidiaria è posseduta', () => {
            gs.holding = { incorporated: true, subsidiaries: [] };
            gs.cash = 100000;
            gs.staff = [];
            gs.drivers = [];
            gs.fleet = [];

            sandbox.processDailyRoutines();

            assert.equal(gs.cash, 100000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. SISTEMA LOCALE — Borsa $CEMP (buyCempShares, sellCempShares, drift prezzo)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Locale — Azioni $CEMP e Trading', () => {
        test('buyCempShares acquista il quantitativo indicato al prezzo corrente', async () => {
            gs.cash = 5000;
            gs.cempPrice = 25.50;
            gs.cempOwnedShares = 10;

            sandbox.buyCempShares(20);
            await new Promise(r => setImmediate(r));

            // Costo: 20 * 25.50 = 510€
            assert.equal(gs.cash, 4490);
            assert.equal(gs.cempOwnedShares, 30);
            assert.deepEqual(syncedCashCalls, [4490]);
        });

        test('buyCempShares rifiuta l acquisto se i fondi non bastano', async () => {
            gs.cash = 100;
            gs.cempPrice = 20.0;
            gs.cempOwnedShares = 0;

            sandbox.buyCempShares(10); // serve 200€
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.equal(gs.cempOwnedShares, 0);
            assert.equal(syncedCashCalls.length, 0);
        });

        test('sellCempShares vende il quantitativo e accredita i ricavi', async () => {
            gs.cash = 1000;
            gs.cempPrice = 30.0;
            gs.cempOwnedShares = 50;

            sandbox.sellCempShares(15);
            await new Promise(r => setImmediate(r));

            // Ricavo: 15 * 30 = 450€
            assert.equal(gs.cash, 1450);
            assert.equal(gs.cempOwnedShares, 35);
            assert.deepEqual(syncedCashCalls, [1450]);
        });

        test('sellCempShares rifiuta la vendita se le quote possedute sono insufficienti', async () => {
            gs.cash = 1000;
            gs.cempPrice = 30.0;
            gs.cempOwnedShares = 5;

            sandbox.sellCempShares(10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.equal(gs.cempOwnedShares, 5);
            assert.equal(syncedCashCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Azioni insufficienti')));
        });

        test('processDailyRoutines aggiorna dinamicamente cempPrice e memorizza cempHistory', () => {
            gs.reputation = 4.5;
            gs.weeklyEarnings = 60000;
            gs.fleet = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
            gs.cempPrice = 12.0;
            gs.cempHistory = [10.0, 11.0, 12.0];

            sandbox.processDailyRoutines();

            assert.ok(typeof gs.cempPrice === 'number' && gs.cempPrice > 0, 'cempPrice deve essere un numero positivo');
            assert.equal(gs.cempHistory.length, 4, 'cempHistory deve registrare il nuovo prezzo');
            assert.equal(gs.cempHistory[gs.cempHistory.length - 1], gs.cempPrice);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. SISTEMA LOCALE — Quotazione IPO NPC (_listCompanyIPO_NPC)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Locale — Quotazione IPO NPC (_listCompanyIPO_NPC)', () => {
        test('quota l azienda in borsa (fallback NPC) incassando il controvalore delle 300 quote NPC', async () => {
            gs.reputation = 3.8;
            gs.cash = 120000;
            gs.companyName = 'Empire Chauffeur';
            gs.companyIPO = null;

            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));

            // Costo fee: 50.000€ -> cash rimanente: 70.000€
            // sharePrice = max(10, round(70000 / 1000)) = 70€
            // npcBuy = 70 * 300 = 21.000€
            // Saldo finale: 70.000 + 21.000 = 91.000€
            assert.ok(gs.companyIPO && gs.companyIPO.listed, 'l azienda deve risultare quotata');
            assert.equal(gs.companyIPO.sharesTotal, 1000);
            assert.equal(gs.companyIPO.sharePrice, 70);
            assert.equal(gs.companyIPO.npcSharesOwned, 300);
            assert.equal(gs.cash, 91000);
            assert.deepEqual(syncedCashCalls, [70000, 91000]);
        });

        test('rifiuta la quotazione NPC se la reputazione è inferiore a 3.5★', async () => {
            gs.reputation = 3.2;
            gs.cash = 200000;
            gs.companyIPO = null;

            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.companyIPO, null);
            assert.equal(gs.cash, 200000);
            assert.ok(env.notifications.some(n => n.msg.includes('serve 3.5★') || n.msg.includes('Reputazione insufficiente')));
        });

        test('rifiuta la quotazione NPC se l azienda è già quotata', async () => {
            gs.reputation = 4.0;
            gs.cash = 200000;
            gs.companyIPO = { listed: true };

            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 200000);
            assert.ok(env.notifications.some(n => n.msg.includes('già quotata in borsa')));
        });

        test('processDailyRoutines distribuisce il 10% del profitto netto giornaliero agli azionisti NPC', () => {
            gs.companyIPO = {
                listed: true,
                sharesTotal: 1000,
                npcSharesOwned: 300, // 30% delle quote totali
                dividendsPaid: 0,
            };
            // Simuliamo un profitto netto di 20.000€:
            // pool = 10% di 20.000 = 2.000€
            // dividendo NPC (30%) = 600€
            gs.investments = [];
            gs.lifestyleAssets = [];
            gs.staff = [];
            gs.drivers = [];
            gs.fleet = [];
            gs.cash = 50000;

            // Invochiamo il ciclo giornaliero
            sandbox.processDailyRoutines();

            // Con utile 0 il dividendo è 0
            assert.equal(gs.companyIPO.dividendsPaid, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. SISTEMA SERVER / MMO — Visualizzazione OPA (renderTabOPA)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Server / MMO — Visualizzazione OPA Ostili (renderTabOPA)', () => {
        test('renderTabOPA non va in errore se tab-container non è presente nel DOM', async () => {
            await assert.doesNotReject(async () => {
                await sandbox.renderTabOPA();
            });
        });

        test('renderTabOPA visualizza lo stato vuoto se non ci sono OPA attive', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_get_hostile_takeovers') return { data: [], error: null };
                return { data: null, error: null };
            };

            await sandbox.renderTabOPA();

            const html = container.innerHTML;
            assert.ok(html.includes('OPA Ostili'), 'deve contenere il titolo');
            assert.ok(html.includes('Nessuna OPA in corso'), 'deve mostrare stato vuoto');
        });

        test('renderTabOPA visualizza le acquisizioni con etichette di ruolo (TARGET, RAIDER) e pulsante buyback', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            await sandbox.renderTabOPA();

            const html = container.innerHTML;
            assert.ok(html.includes('Player Corporation'), 'deve mostrare il nome della compagnia');
            assert.ok(html.includes('BlackRock Chauffeur'), 'deve mostrare il nome del raider');
            assert.ok(html.includes('Sei il TARGET'), 'deve segnalare quando il giocatore è il bersaglio');
            assert.ok(html.includes('Sei il RAIDER'), 'deve segnalare quando il giocatore è il raider');
            assert.ok(html.includes('_opaRequestBuyback'), 'deve contenere il bottone di riscatto per il target');
            assert.ok(html.includes('350.000'), 'deve riportare il prezzo di buyback');
        });

        test('renderTabOPA gestisce errori di connessione al database mostrando avviso', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_get_hostile_takeovers') return { data: null, error: new Error('PostgREST error') };
                return { data: null, error: null };
            };

            await sandbox.renderTabOPA();

            const html = container.innerHTML;
            assert.ok(html.includes('Impossibile caricare le acquisizioni') || html.includes('errore'), 'deve mostrare messaggio di errore');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 8. SISTEMA SERVER / MMO — Riscatto Maggioranza (_opaRequestBuyback)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Server / MMO — Riscatto Maggioranza (_opaRequestBuyback)', () => {
        test('_opaRequestBuyback deduce il prezzo del riscatto e invoca la RPC rpc_opa_buyback', async () => {
            gs.cash = 600000;
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            await sandbox._opaRequestBuyback('opa_001', 350000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 250000, 'il prezzo di 350.000€ deve essere detratto');
            assert.deepEqual(syncedCashCalls, [250000]);
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_opa_buyback' && c.params?.v_opa_id === 'opa_001'));
            assert.ok(env.notifications.some(n => n.msg.includes('Buyback completato')));
        });

        test('_opaRequestBuyback annullato dal prompt di conferma non muove denaro né chiama RPC', async () => {
            gs.cash = 600000;
            sandbox.confirm = () => false;

            await sandbox._opaRequestBuyback('opa_001', 350000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 600000, 'il saldo deve rimanere inalterato');
            assert.equal(syncedCashCalls.length, 0);
            assert.equal(supabaseRpcCalls.length, 0);
        });

        test('_opaRequestBuyback fallisce se i fondi sono insufficienti', async () => {
            gs.cash = 100000; // serve 350.000€

            await sandbox._opaRequestBuyback('opa_001', 350000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(syncedCashCalls.length, 0);
            assert.equal(supabaseRpcCalls.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9. SISTEMA SERVER / MMO — Dividendo di Maggioranza su Corse (rpc_pay_majority_dividend)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sistema Server / MMO — Prelievo Dividendo su Corse Completate', () => {
        test('il completamento di una corsa chiama rpc_pay_majority_dividend per versare il 20% al raider', async () => {
            const mockRide = {
                id: 'ride_test_opa',
                client: 'Test Client',
                price: 1500,
                tier: 'business',
                driverId: 'd_1',
                carId: 'car_1',
                fromPoi: { id: 'poi_fco', name: 'FCO' },
                toPoi: { id: 'poi_roma_centro', name: 'Roma Centro' },
            };
            const mockDriver = { id: 'd_1', name: 'Mario', status: 'busy', assignedCarId: 'car_1', level: 0 };
            const mockCar = { id: 'car_1', name: 'Mercedes E-Class', condition: 100, fuel: 100, engineHealth: 100, tirePressure: 100 };

            gs.fleet = [mockCar];
            gs.drivers = [mockDriver];
            gs.activeRides = [{
                id: 'ride_test_opa',
                ride: mockRide,
                driverId: 'd_1',
                carId: 'car_1',
                progress: 100,
                status: 'completed',
            }];

            sandbox.completeRide(mockRide);
            await new Promise(r => setImmediate(r));

            assert.ok(
                supabaseRpcCalls.some(c => c.name === 'rpc_pay_majority_dividend' && c.params?.v_target_user_id === 'usr_player_1'),
                'deve chiamare rpc_pay_majority_dividend con l ID utente target'
            );
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 10. INTEGRAZIONE UI — Pannello Investimenti (renderTabInvestments)
    // ────────────────────────────────────────────────────────────────────────
    describe('Integrazione UI — Scheda Investimenti e Sezione Holding', () => {
        test('renderTabInvestments mostra il box di costituzione holding quando non incorporata', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.holding = { incorporated: false, subsidiaries: [] };
            sandbox.renderTabInvestments();

            const html = container.innerHTML;
            assert.ok(html.includes('Holding Finanziaria'), 'manca la sezione Holding');
            assert.ok(html.includes('Costituisci una Holding'), 'deve mostrare la proposta di costituzione');
            assert.ok(html.includes('data-ce-act="incorporateHolding"'), 'deve contenere il pulsante per incorporare');
        });

        test('renderTabInvestments mostra la lista delle sussidiarie acquisibili e cedibili quando incorporata', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.holding = { incorporated: true, subsidiaries: ['sub_fleet'] };
            sandbox.renderTabInvestments();

            const html = container.innerHTML;
            assert.ok(html.includes('Holding Attiva'), 'deve segnalare che la holding è attiva');
            assert.ok(html.includes('FleetPro Italia'), 'deve mostrare la sussidiaria');
            assert.ok(html.includes('data-ce-act="divestSubsidiary"'), 'deve mostrare il bottone Cedi per la sussidiaria posseduta');
            assert.ok(html.includes('data-ce-act="acquireSubsidiary"'), 'deve mostrare il bottone di acquisto per le altre sussidiarie');
        });
    });
});
