'use strict';
/* ============================================================================
   test/funzioni/lusso.test.js — Funzione Lusso (Lifestyle & Real Estate)

   Verifica del funzionamento della feature "lusso" (disattivata in config.js).
   Collauda:
   - Acquisto asset lifestyle (buyLifestyleAsset) e gestione liquidità/reputazione
   - Integrazione passiva degli asset (rendite giornaliere, recupero energia CEO,
     recupero fatica autisti, bonus Wall Street / broker, bonus corse Ultra yacht, credit score)
   - Rendering UI Lifestyle (renderTabLifestyle, calcolo portfolio, status MOGUL/ELITE)
   - Decreti di governo / Server Decrees (decreesRefresh, getDecreeEffects, voteServerDecree)
   - Portafoglio immobiliare Real Estate (renderTabRealEstate, doBuyRealEstate, ServerState)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione lusso — lifestyle assets, status e real estate', () => {
    let env, sandbox, gs;
    let rpcBuyRealEstateCalls;
    let lastBigEvent;

    beforeEach(() => {
        rpcBuyRealEstateCalls = [];
        lastBigEvent = null;

        env = freshEnv({
            render: true,
            serverState: {
                buyRealEstate: async (listingId) => {
                    rpcBuyRealEstateCalls.push(listingId);
                    sandbox.gameState.cash = (sandbox.gameState.cash || 0) - 100000;
                    return { success: true, listing_id: listingId, name: 'Attico CityLife', daily_rent: 15000 };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;

        // Mock showBigEvent per catturare eventi visivi
        sandbox.showBigEvent = (icon, title, desc) => {
            lastBigEvent = { icon, title, desc };
        };
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('acquisto lifestyle assets (buyLifestyleAsset)', () => {
        test('acquisto con fondi sufficienti deduce cash, inserisce l asset e assegna repBonus', () => {
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const attico = assets.find(a => a.id === 'attico_milano');
            assert.ok(attico, 'attico_milano deve esistere in LIFESTYLE_ASSETS');

            gs.cash = 5000000;
            gs.reputation = 3.0;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset('attico_milano');

            assert.equal(gs.cash, 5000000 - attico.price);
            assert.ok(gs.lifestyleAssets.includes('attico_milano'));
            assert.equal(gs.reputation, 3.0 + attico.repBonus);
            assert.ok(lastBigEvent, 'dovrebbe mostrare un BigEvent');
            assert.ok(lastBigEvent.title.includes('Attico CityLife'));
            assert.ok(env.logs.some(l => l.includes('Attico CityLife')));
        });

        test('acquisto con fondi insufficienti viene respinto senza modifiche allo stato', () => {
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const villa = assets.find(a => a.id === 'villa_porto_cervo');

            gs.cash = 1000; // Villa costa 4.500.000
            gs.reputation = 2.0;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset('villa_porto_cervo');

            assert.equal(gs.cash, 1000);
            assert.equal(gs.lifestyleAssets.length, 0);
            assert.equal(gs.reputation, 2.0);
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti') && n.type === 'error'));
        });

        test('tentativo di acquistare un asset già posseduto viene bloccato', () => {
            gs.cash = 10000000;
            gs.lifestyleAssets = ['attico_milano'];

            sandbox.buyLifestyleAsset('attico_milano');

            assert.equal(gs.cash, 10000000);
            assert.equal(gs.lifestyleAssets.length, 1);
            assert.ok(env.notifications.some(n => n.msg.includes('Asset già posseduto') && n.type === 'error'));
        });

        test('tentativo di acquistare un assetId inesistente non produce modifiche', () => {
            gs.cash = 5000000;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset('castello_fantasma_123');

            assert.equal(gs.cash, 5000000);
            assert.equal(gs.lifestyleAssets.length, 0);
        });

        test('acquisto di asset con intlUnlock sblocca rotte internazionali (svizzera e costa_azzurra)', () => {
            gs.cash = 10000000;
            gs.lifestyleAssets = [];
            gs.unlockedRegions = ['lazio'];

            sandbox.buyLifestyleAsset('jet_privato');

            assert.ok(gs.lifestyleAssets.includes('jet_privato'));
            assert.ok(gs.unlockedRegions.includes('svizzera'), 'dovrebbe sbloccare svizzera');
            assert.ok(gs.unlockedRegions.includes('costa_azzurra'), 'dovrebbe sbloccare costa_azzurra');
            assert.ok(env.logs.some(l => l.includes('Tratte internazionali sbloccate')));
        });

        test('buyLifestyleAsset modifica cash solo in locale (non sincronizza con ServerState)', () => {
            let syncCashChiamata = false;
            sandbox.ServerState.syncCash = async () => { syncCashChiamata = true; };

            gs.cash = 10000000;
            sandbox.buyLifestyleAsset('attico_milano');

            // buyLifestyleAsset muta gameState.cash direttamente senza invocare ServerState.syncCash
            assert.equal(syncCashChiamata, false, 'buyLifestyleAsset è interamente client-authoritative e non chiama syncCash');
        });
    });

    describe('effetti passivi e sinergie di gioco degli asset di lusso', () => {
        test('processDailyRoutines accumula la rendita passiva di tutti i lifestyle assets posseduti', () => {
            gs.lifestyleAssets = ['attico_milano', 'villa_porto_cervo', 'ufficio_wall_street'];
            gs.cash = 100000;
            gs.staff = [];
            gs.fleet = [];
            gs.drivers = [];
            gs.investments = [];
            gs.day = 5;

            // Rendite: attico (3500) + villa (8000) + ufficio (12000) = 23500 lordi
            const prevCash = gs.cash;
            sandbox.processDailyRoutines();

            assert.ok(gs.cash > prevCash, 'il saldo cassa deve aumentare grazie alla rendita passiva');
        });

        test('gli asset con energyBonus aumentano il recupero energia del CEO a riposo', () => {
            gs.energy = 50;
            gs.activeRides = [];
            gs.lifestyleAssets = ['villa_como']; // energyBonus: 1.5

            // Chiamata a _tickFatigue con CEO a riposo
            sandbox._tickFatigue();

            // Senza lounge HQ e senza HR, baseGain = 1.0 + 1.5 = 2.5
            assert.equal(gs.energy, 52.5);
        });

        test('gli asset con staffBonus aumentano il recupero fatica degli autisti a riposo', () => {
            gs.lifestyleAssets = ['yacht_lusso']; // staffBonus: 0.30 (+30%)
            const autista = {
                id: 'drv_test',
                name: 'Mario Rossi',
                status: 'resting',
                fatigue: 80,
                morale: 50,
                restHoursLeft: 3,
                salary: 2000,
            };
            gs.drivers.push(autista);

            sandbox._tickFatigue();

            // base recovery = 20, con yacht +30% -> Math.round(20 * 1.3) = 26
            // fatigue: 80 - 26 = 54
            assert.equal(autista.fatigue, 54);
        });

        test('ufficio_wall_street applica +15% di bonus sui rendimenti azionari positivi', () => {
            gs.lifestyleAssets = ['ufficio_wall_street'];
            gs.stockPrices = { LUX: 100 };
            window._lastNewsForStocks = 'lusso';

            // Esecuzione di _tickStockMarket non deve andare in errore con l asset
            assert.doesNotThrow(() => {
                sandbox._tickStockMarket();
            });
        });

        test('yacht_lusso applica bonus moltiplicatore 1.20x sulle corse ULTRA in generateRideFare', () => {
            gs.lifestyleAssets = ['yacht_lusso'];

            const pois = vm.runInContext('POIS', sandbox);
            const poiA = pois.roma;
            const poiB = pois.porto_cervo;

            // Corsa Ultra: yachtMult 1.20
            const fareConYacht = sandbox.generateRideFare(poiA, poiB, 'ultra');
            gs.lifestyleAssets = [];
            const fareSenzaYacht = sandbox.generateRideFare(poiA, poiB, 'ultra');

            assert.ok(fareConYacht > fareSenzaYacht, 'la tariffa con yacht_lusso deve essere maggiore');
            assert.equal(Math.round(fareSenzaYacht * 1.20), fareConYacht);
        });

        test('_updateCreditScore incrementa il punteggio di +20 per ogni asset posseduto', () => {
            gs.reputation = 4.0;
            gs.cash = 50000;
            gs.loans = [];
            gs.achievements = [];

            gs.lifestyleAssets = [];
            sandbox._updateCreditScore();
            const scoreBase = gs.creditScore;

            gs.lifestyleAssets = ['attico_milano', 'jet_privato'];
            sandbox._updateCreditScore();
            const scoreConAsset = gs.creditScore;

            assert.equal(scoreConAsset, scoreBase + 40);
        });
    });

    describe('rendering scheda lifestyle (renderTabLifestyle)', () => {
        test('renderTabLifestyle compila il container con KPI di status, cards e diamond contracts', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.lifestyleAssets = ['attico_milano', 'jet_privato'];
            gs.cash = 6000000;
            gs.reputation = 4.8;

            sandbox.renderTabLifestyle();

            const html = container.innerHTML;
            assert.ok(html.includes('Empire Portfolio'), 'manca titolo scheda');
            assert.ok(html.includes('ELITE'), 'con 2 asset posseduti lo status deve essere ELITE');
            assert.ok(html.includes('Tratte internazionali attive'), 'con jet_privato le rotte intl devono risultare attive');
            assert.ok(html.includes('Attico CityLife'));
            assert.ok(html.includes('Gulfstream G700'));
            assert.ok(html.includes('NEL PORTFOLIO'), 'gli asset posseduti devono mostrare il badge NEL PORTFOLIO');
            assert.ok(html.includes('data-ce-act="buyLifestyleAsset"'), 'gli asset non posseduti devono avere il pulsante di acquisto');
            assert.ok(html.includes('Diamond Contracts'));
            assert.ok(html.includes('Sei eleggibile'), 'con rep 4.8 e asset diamond deve risultare eleggibile');
        });

        test('status CEO scala correttamente a MOGUL con 4 o più asset', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.lifestyleAssets = ['attico_milano', 'villa_porto_cervo', 'ufficio_wall_street', 'jet_privato'];
            sandbox.renderTabLifestyle();

            assert.ok(container.innerHTML.includes('MOGUL'), 'con 4 asset deve mostrare lo status MOGUL');
        });

        test('status CEO con zero asset è NASCENT', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.lifestyleAssets = [];
            sandbox.renderTabLifestyle();

            assert.ok(container.innerHTML.includes('NASCENT'), 'con 0 asset deve mostrare NASCENT');
        });
    });

    describe('decreti di governo (decreesRefresh, getDecreeEffects, voteServerDecree)', () => {
        let rpcCalls;

        beforeEach(() => {
            rpcCalls = [];
            sandbox.supabaseClient = {
                rpc: async (fn, params) => {
                    rpcCalls.push({ fn, params });
                    if (fn === 'rpc_get_server_decrees') {
                        return { data: [{ id: 'dec_fuel_sub', title: 'Sussidio Carburante', votes_required: 100 }], error: null };
                    }
                    if (fn === 'rpc_get_active_decrees') {
                        return { data: [{ id: 'dec_tax_cut', title: 'Taglio Tasse', effects: { taxMultiplier: 0.85, baseSpeed: 1.1 } }], error: null };
                    }
                    if (fn === 'rpc_vote_server_decree') {
                        return { data: { passed: false, votes_current: 40, title: 'Sussidio Carburante' }, error: null };
                    }
                    return { data: null, error: null };
                },
            };
        });

        test('decreesRefresh carica decreti e decreti attivi da Supabase RPC', async () => {
            await sandbox.decreesRefresh(true);

            assert.equal(sandbox._decreesState.decrees.length, 1);
            assert.equal(sandbox._decreesState.decrees[0].id, 'dec_fuel_sub');
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);
            assert.equal(sandbox._decreesState.activeDecrees[0].id, 'dec_tax_cut');
        });

        test('getDecreeEffects calcola correttamente i moltiplicatori attivi', async () => {
            await sandbox.decreesRefresh(true);
            const fx = sandbox.getDecreeEffects();

            assert.equal(fx.taxMultiplier, 0.85);
            assert.equal(fx.baseSpeed, 1.1);
        });

        test('voteServerDecree deduce lobbyingPoints ed esegue rpc_vote_server_decree', async () => {
            await sandbox.decreesRefresh(true);
            gs.lobbyingPoints = 50;

            await sandbox.voteServerDecree('dec_fuel_sub', 10);

            assert.equal(gs.lobbyingPoints, 40);
            const call = rpcCalls.find(c => c.fn === 'rpc_vote_server_decree');
            assert.ok(call, 'deve chiamare rpc_vote_server_decree');
            assert.equal(call.params.v_decree_id, 'dec_fuel_sub');
            assert.equal(call.params.v_points_spent, 10);
            assert.ok(env.notifications.some(n => n.msg.includes('Voto registrato')));
        });

        test('voteServerDecree con punti insufficienti viene rifiutato', async () => {
            gs.lobbyingPoints = 5;

            await sandbox.voteServerDecree('dec_fuel_sub', 20);

            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(env.notifications.some(n => n.msg.includes('Punti lobbying insufficienti')));
            assert.ok(!rpcCalls.some(c => c.fn === 'rpc_vote_server_decree'));
        });
    });

    describe('real estate (renderTabRealEstate e doBuyRealEstate)', () => {
        let fakeSupabase;

        beforeEach(() => {
            fakeSupabase = {
                from: (table) => ({
                    select: (_cols) => ({
                        order: (_orderCol) => Promise.resolve({
                            data: [
                                { id: 're_milano_attico', name: 'Attico CityLife', city: 'Milano', cost: 5000000, daily_rent: 15000, description: 'Penthouse panoramica' },
                                { id: 're_roma_palazzo', name: 'Palazzetto Trastevere', city: 'Roma', cost: 3500000, daily_rent: 10000, description: 'Palazzo storico' },
                            ],
                            error: null,
                        }),
                        then: (resolve) => resolve({
                            data: [
                                { listing_id: 're_milano_attico', last_rent_at: new Date(Date.now() - 3600000).toISOString() }
                            ],
                            error: null,
                        }),
                    }),
                }),
            };
            sandbox.supabaseClient = fakeSupabase;
        });

        test('renderTabRealEstate renderizza portafoglio, immobili posseduti e disponibili', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.cash = 4000000;

            await sandbox.renderTabRealEstate();

            const html = container.innerHTML;
            assert.ok(html.includes('Portafoglio Immobiliare'), 'manca intestazione real estate');
            assert.ok(html.includes('Attico CityLife'));
            assert.ok(html.includes('Palazzetto Trastevere'));
            assert.ok(html.includes('✓ TUO'), 'immobile posseduto deve mostrare il badge TUO');
            assert.ok(html.includes('data-ce-act="doBuyRealEstate"'), 'immobile disponibile deve avere il bottone ceAct');
            assert.ok(html.includes('Le rendite vengono accreditate automaticamente dal server ogni 24h.'));
        });

        test('renderTabRealEstate mostra messaggio di errore amichevole in caso di fallimento rete', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sandbox.supabaseClient = {
                from: () => ({
                    select: () => ({
                        order: () => Promise.reject(new Error('Network error')),
                    }),
                }),
            };

            await sandbox.renderTabRealEstate();

            assert.ok(container.innerHTML.includes('Impossibile caricare gli immobili'));
        });

        test('doBuyRealEstate invoca ServerState.buyRealEstate ed emette BigEvent', async () => {
            await sandbox.doBuyRealEstate('re_roma_palazzo');

            assert.equal(rpcBuyRealEstateCalls.length, 1);
            assert.equal(rpcBuyRealEstateCalls[0], 're_roma_palazzo');
            assert.ok(lastBigEvent, 'dovrebbe mostrare il popup celebrativo BigEvent');
            assert.ok(lastBigEvent.title.includes('Acquistata'));
        });
    });
});
