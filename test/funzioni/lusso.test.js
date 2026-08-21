'use strict';
/* ============================================================================
   test/funzioni/lusso.test.js — Lifestyle, Asset di Lusso e Real Estate

   Verifica approfondita del funzionamento della funzione "lusso"
   (attualmente disattivata in config.js).
   Collauda tutte le azioni e funzioni esposte da ui-lifestyle.js, ui-realestate.js
   ed engine-finance.js (buyLifestyleAsset), la persistenza in gameState.lifestyleAssets,
   l'impatto sul daily tick, credit score, tratte internazionali, contratti Diamond,
   la natura server-authoritative del Real Estate e il sistema dei Server Decrees.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv, createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('funzione lusso — Lifestyle Assets, Real Estate & Status CEO', () => {
    let env, sandbox, gs, lifestyleAssets;
    let syncCashCalls, buyRealEstateCalls;

    beforeEach(() => {
        syncCashCalls = [];
        buyRealEstateCalls = [];
        env = freshEnv({
            serverState: {
                syncCash: async (cash) => {
                    syncCashCalls.push(cash);
                    sandbox.gameState.cash = cash;
                    return { success: true, cash };
                },
                buyRealEstate: async (listingId) => {
                    buyRealEstateCalls.push(listingId);
                    return {
                        success: true,
                        listing_id: listingId,
                        name: 'Attico San Babila',
                        daily_rent: 4500,
                    };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        lifestyleAssets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('dati e configurazione asset di lusso (data.js)', () => {
        test('LIFESTYLE_ASSETS contiene la lista ufficiale dei beni di lusso con categorie e prezzi validi', () => {
            assert.ok(Array.isArray(lifestyleAssets), 'LIFESTYLE_ASSETS deve essere un array');
            assert.ok(lifestyleAssets.length >= 6, 'devono esserci almeno 6 asset di lusso definiti');

            const ids = new Set();
            lifestyleAssets.forEach(asset => {
                assert.ok(asset.id, 'l asset deve avere un id');
                assert.ok(asset.name, 'l asset deve avere un nome');
                assert.ok(typeof asset.price === 'number' && asset.price > 0, 'il prezzo deve essere positivo');
                assert.ok(['real_estate', 'vehicle_elite'].includes(asset.category), 'categoria valida');
                assert.ok(ids.has(asset.id) === false, `id duplicato: ${asset.id}`);
                ids.add(asset.id);
            });
        });

        test('include asset chiave: attico_milano, jet_privato, villa_porto_cervo, yacht_lusso, ufficio_wall_street', () => {
            const attico = lifestyleAssets.find(a => a.id === 'attico_milano');
            const jet = lifestyleAssets.find(a => a.id === 'jet_privato');
            const villa = lifestyleAssets.find(a => a.id === 'villa_porto_cervo');
            const yacht = lifestyleAssets.find(a => a.id === 'yacht_lusso');
            const ws = lifestyleAssets.find(a => a.id === 'ufficio_wall_street');

            assert.ok(attico, 'attico_milano deve esistere');
            assert.equal(attico.category, 'real_estate');
            assert.ok(attico.passive > 0, 'attico deve generare rendita passiva');

            assert.ok(jet, 'jet_privato deve esistere');
            assert.equal(jet.intlUnlock, true, 'jet_privato deve sbloccare rotte internazionali');

            assert.ok(villa, 'villa_porto_cervo deve esistere');
            assert.ok(villa.repBonus > 0, 'villa deve fornire bonus reputazione');

            assert.ok(yacht, 'yacht_lusso deve esistere');
            assert.equal(yacht.category, 'vehicle_elite');

            assert.ok(ws, 'ufficio_wall_street deve esistere');
            assert.ok(ws.stockBonus > 0, 'ufficio Wall Street deve dare bonus azionario');
        });
    });

    describe('rendering della scheda Lifestyle (renderTabLifestyle)', () => {
        test('renderTabLifestyle calcola e mostra lo status CEO Nascent/Rising/Elite/Mogul', () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            rEnv.sandbox.initGame(true);
            rEnv.stopAllIntervals();

            const container = rEnv.sandbox.document.createElement('div');
            container.id = 'tab-container';
            rEnv.sandbox.document.body.appendChild(container);

            // 0 asset -> NASCENT
            rEnv.sandbox.gameState.lifestyleAssets = [];
            rEnv.sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('NASCENT'), 'status iniziale deve essere NASCENT');

            // 1 asset -> RISING
            rEnv.sandbox.gameState.lifestyleAssets = ['attico_milano'];
            rEnv.sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('RISING'), '1 asset deve dare status RISING');

            // 2 asset -> ELITE
            rEnv.sandbox.gameState.lifestyleAssets = ['attico_milano', 'jet_privato'];
            rEnv.sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('ELITE'), '2 asset devono dare status ELITE');

            // 4 asset -> MOGUL
            rEnv.sandbox.gameState.lifestyleAssets = ['attico_milano', 'jet_privato', 'villa_porto_cervo', 'yacht_lusso'];
            rEnv.sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('MOGUL'), '4 o più asset devono dare status MOGUL');
        });

        test('renderTabLifestyle visualizza il valore del portafoglio e le azioni di acquisto ceAct', () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            rEnv.sandbox.initGame(true);
            rEnv.stopAllIntervals();

            const container = rEnv.sandbox.document.createElement('div');
            container.id = 'tab-container';
            rEnv.sandbox.document.body.appendChild(container);

            rEnv.sandbox.gameState.cash = 10000000;
            rEnv.sandbox.gameState.lifestyleAssets = ['attico_milano'];
            rEnv.sandbox.renderTabLifestyle();

            const html = container.innerHTML;
            assert.ok(html.includes('Lifestyle &amp; Status') || html.includes('Lifestyle & Status'), 'titolo sezione presente');
            assert.ok(html.includes('Empire Portfolio'), 'titolo portafoglio presente');
            assert.ok(html.includes('✓ NEL PORTFOLIO'), 'asset posseduto contrassegnato');
            assert.ok(html.includes('data-ce-act="buyLifestyleAsset"'), 'pulsanti acquisto con data-ce-act presenti');
        });

        test('renderTabLifestyle mostra lo stato di eleggibilità per i contratti Diamond', () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            rEnv.sandbox.initGame(true);
            rEnv.stopAllIntervals();

            const container = rEnv.sandbox.document.createElement('div');
            container.id = 'tab-container';
            rEnv.sandbox.document.body.appendChild(container);

            // Senza asset diamond
            rEnv.sandbox.gameState.lifestyleAssets = [];
            rEnv.sandbox.gameState.reputation = 4.0;
            rEnv.sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('Requisiti: asset Lifestyle + reputazione ≥ 4.5★'), 'deve mostrare requisiti non soddisfatti');

            // Con asset diamond e rep >= 4.5
            rEnv.sandbox.gameState.lifestyleAssets = ['attico_milano'];
            rEnv.sandbox.gameState.reputation = 4.8;
            rEnv.sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('Sei eleggibile'), 'deve indicare eleggibilità raggiunta');
        });
    });

    describe('acquisto asset di lusso (buyLifestyleAsset)', () => {
        test('acquista l asset con fondi sufficienti, incrementa reputazione e sincronizza cassa col server', () => {
            const jet = lifestyleAssets.find(a => a.id === 'jet_privato');
            gs.cash = jet.price + 500000;
            gs.reputation = 3.5;
            gs.lifestyleAssets = [];
            gs.unlockedRegions = ['lombardia', 'lazio'];

            sandbox.buyLifestyleAsset(jet.id);

            assert.equal(gs.cash, 500000, 'il prezzo deve essere scalato dal cash');
            assert.ok(gs.lifestyleAssets.includes(jet.id), 'l asset deve comparire in lifestyleAssets');
            assert.equal(gs.reputation, 3.5 + jet.repBonus, 'la reputazione deve aumentare del repBonus');
            assert.ok(gs.unlockedRegions.includes('svizzera'), 'jet_privato deve sbloccare svizzera');
            assert.ok(gs.unlockedRegions.includes('costa_azzurra'), 'jet_privato deve sbloccare costa_azzurra');
            assert.equal(syncCashCalls.length, 1, 'deve chiamare ServerState.syncCash');
            assert.equal(syncCashCalls[0], 500000);
        });

        test('rifiuta l acquisto se i fondi sono insufficienti senza mutare lo stato', () => {
            const attico = lifestyleAssets.find(a => a.id === 'attico_milano');
            gs.cash = attico.price - 1000;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset(attico.id);

            assert.equal(gs.cash, attico.price - 1000, 'il saldo non deve essere toccato');
            assert.ok(!gs.lifestyleAssets.includes(attico.id), 'l asset non deve essere acquisito');
            assert.equal(syncCashCalls.length, 0, 'non deve inviare syncCash');
        });

        test('impedisce acquisti duplicati dello stesso asset di lusso', () => {
            const villa = lifestyleAssets.find(a => a.id === 'villa_porto_cervo');
            gs.cash = villa.price * 2;
            gs.lifestyleAssets = [villa.id];

            sandbox.buyLifestyleAsset(villa.id);

            assert.equal(gs.cash, villa.price * 2, 'il denaro non deve essere scalato');
            assert.equal(gs.lifestyleAssets.length, 1, 'la lista non deve duplicare l asset');
            assert.equal(syncCashCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Asset già posseduto')));
        });

        test('ignora chiamate con id asset inesistente', () => {
            gs.cash = 1000000;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset('castello_fantasma');

            assert.equal(gs.cash, 1000000);
            assert.equal(gs.lifestyleAssets.length, 0);
            assert.equal(syncCashCalls.length, 0);
        });
    });

    describe('impatto dei beni di lusso sulle meccaniche di gioco', () => {
        test('il daily tick accredita la rendita passiva di tutti gli asset posseduti', () => {
            const attico = lifestyleAssets.find(a => a.id === 'attico_milano');
            const yacht = lifestyleAssets.find(a => a.id === 'yacht_lusso');
            gs.cash = 100000;
            gs.lifestyleAssets = [attico.id, yacht.id];

            const renditaAttesa = attico.passive + yacht.passive;
            assert.ok(renditaAttesa > 0, 'la rendita complessiva deve essere positiva');

            const cashPrima = gs.cash;
            sandbox.processDailyRoutines();

            // Il netto giornaliero comprende la rendita passiva da lifestyle
            assert.ok(gs.cash >= cashPrima - 100000 + renditaAttesa, 'la cassa deve includere la rendita lifestyle');
        });

        test('il recupero energia CEO include il bonus dagli asset lifestyle', () => {
            const attico = lifestyleAssets.find(a => a.id === 'attico_milano');
            gs.lifestyleAssets = [attico.id];
            gs.energy = 10;

            sandbox.processDailyRoutines();

            // Base 20 + attico.energyBonus (0.5)
            assert.ok(gs.energy >= 30, 'l energia CEO deve beneficiare del bonus lifestyle');
        });

        test('ogni asset di lusso posseduto aggiunge +20 punti al creditScore', () => {
            gs.reputation = 3.0;
            gs.cash = 50000;
            gs.loans = [];
            gs.achievements = [];

            gs.lifestyleAssets = [];
            sandbox._updateCreditScore();
            const baseScore = gs.creditScore;

            gs.lifestyleAssets = ['attico_milano', 'jet_privato'];
            sandbox._updateCreditScore();
            const nuovoScore = gs.creditScore;

            assert.equal(nuovoScore, baseScore + 40, '2 asset devono aggiungere 40 punti al credit score');
        });

        test('il valore netto dell impero (calculateNetWorth) include gli asset lifestyle', () => {
            const attico = lifestyleAssets.find(a => a.id === 'attico_milano');
            const jet = lifestyleAssets.find(a => a.id === 'jet_privato');
            gs.cash = 50000;
            gs.fleet = [];
            gs.lifestyleAssets = [attico.id, jet.id];

            const nw = sandbox.calculateNetWorth();
            const valoreAsset = attico.price + jet.price;

            assert.ok(nw.totalNetWorth >= valoreAsset, 'il patrimonio netto deve includere il valore di acquisto degli asset');
        });
    });

    describe('funzione Real Estate e acquisto server-authoritative (ui-realestate.js)', () => {
        test('doBuyRealEstate invoca la RPC ServerState.buyRealEstate senza mutare il cash in locale', async () => {
            gs.cash = 5000000;

            await sandbox.doBuyRealEstate('san_babila_penthouse');

            assert.equal(buyRealEstateCalls.length, 1, 'deve chiamare ServerState.buyRealEstate');
            assert.equal(buyRealEstateCalls[0], 'san_babila_penthouse');
            // L'acquisto degli immobili è server-authoritative: il bridge Realtime
            // aggiornerà gameState.cash quando la RPC sul database PostgreSQL conferma la transazione
            assert.equal(gs.cash, 5000000, 'il browser non scala denaro direttamente per immobili server');
        });

        test('renderTabRealEstate gestisce lo stato di caricamento e gli immobili disponibili', async () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            rEnv.sandbox.initGame(true);
            rEnv.stopAllIntervals();

            const container = rEnv.sandbox.document.createElement('div');
            container.id = 'tab-container';
            rEnv.sandbox.document.body.appendChild(container);

            // Mock supabaseClient per la query real_estate_listings
            rEnv.sandbox.supabaseClient = {
                from: (table) => ({
                    select: () => ({
                        order: () => Promise.resolve({
                            data: [
                                { id: 're_1', name: 'Palazzo Borghese', city: 'Roma', cost: 3000000, daily_rent: 4000, description: 'Prestigioso palazzo d epoca' },
                            ],
                            error: null,
                        }),
                    }),
                }),
                channel: () => ({ on: () => ({ subscribe: () => {} }) }),
            };

            await rEnv.sandbox.renderTabRealEstate();

            const html = container.innerHTML;
            assert.ok(html.includes('Portafoglio Immobiliare'), 'titolo Real Estate presente');
            assert.ok(html.includes('Palazzo Borghese'), 'immobile caricato presente');
            assert.ok(html.includes('data-ce-act="doBuyRealEstate"'), 'bottone doBuyRealEstate presente');
        });
    });

    describe('sistema Server Decrees (ui-lifestyle.js)', () => {
        test('_decreesState memorizza i decreti e decreesRefresh li aggiorna da Supabase', async () => {
            assert.deepEqual(sandbox._decreesState.decrees, []);
            assert.deepEqual(sandbox._decreesState.activeDecrees, []);

            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_get_server_decrees') {
                        return { data: [{ id: 'dec_1', title: 'Tassa sul Lusso', votes_required: 100, votes_current: 40 }], error: null };
                    }
                    if (name === 'rpc_get_active_decrees') {
                        return { data: [{ id: 'dec_0', title: 'Deregulation NCC', effects: { ride_price_mult: 1.15 } }], error: null };
                    }
                    return { data: null, error: null };
                },
            };

            await sandbox.decreesRefresh(true);

            assert.equal(sandbox._decreesState.decrees.length, 1);
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);

            const effects = sandbox.getDecreeEffects();
            assert.equal(effects.ride_price_mult, 1.15, 'gli effetti dei decreti attivi devono essere applicati');
        });

        test('voteServerDecree valida i punti lobbying e invoca la RPC rpc_vote_server_decree', async () => {
            let voteRpcArgs = null;
            sandbox.supabaseClient = {
                rpc: async (name, args) => {
                    if (name === 'rpc_vote_server_decree') {
                        voteRpcArgs = args;
                        return { data: { passed: false, title: 'Tassa sul Lusso', votes_current: 50 }, error: null };
                    }
                    if (name === 'rpc_get_server_decrees' || name === 'rpc_get_active_decrees') {
                        return { data: [], error: null };
                    }
                    return { data: null, error: null };
                },
            };

            gs.lobbyingPoints = 25;
            await sandbox.voteServerDecree('dec_1', 10);

            assert.ok(voteRpcArgs, 'la RPC di voto deve essere invocata');
            assert.equal(voteRpcArgs.v_decree_id, 'dec_1');
            assert.equal(voteRpcArgs.v_points_spent, 10);
            assert.equal(gs.lobbyingPoints, 15, 'i punti lobbying devono essere scalati');
        });

        test('voteServerDecree rifiuta voti se i punti lobbying sono insufficienti o non validi', async () => {
            let voteCalled = false;
            sandbox.supabaseClient = {
                rpc: async () => { voteCalled = true; return { data: null, error: null }; },
            };

            gs.lobbyingPoints = 5;
            await sandbox.voteServerDecree('dec_1', 10);

            assert.equal(voteCalled, false, 'non deve chiamare RPC se punti insufficienti');
            assert.equal(gs.lobbyingPoints, 5);

            await sandbox.voteServerDecree('dec_1', -2);
            assert.equal(voteCalled, false);
        });
    });
});
