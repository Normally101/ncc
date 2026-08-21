'use strict';
/* ============================================================================
   test/funzioni/lusso.test.js — Lifestyle & Real Estate (ui-lifestyle, ui-realestate)

   Verifica del funzionamento della feature "lusso" (disattivata in config.js).
   Collauda tutte le azioni e funzioni esposte dai moduli ui-lifestyle.js e ui-realestate.js:
   - renderTabLifestyle, buyLifestyleAsset, effetti su rendite, fatigue e credit score
   - decreesRefresh, getDecreeEffects, voteServerDecree
   - renderTabRealEstate, doBuyRealEstate
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione lusso — lifestyle assets, status e real estate', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv({
            render: true,
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('rendering tab lifestyle (renderTabLifestyle)', () => {
        test('renderTabLifestyle costruisce la schermata con stato CEO, valore portafoglio e cards', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.cash = 10000000;
            gs.lifestyleAssets = ['attico_milano'];
            gs.reputation = 4.8;

            sandbox.renderTabLifestyle();

            const html = container.innerHTML;
            assert.ok(html.includes('Empire Portfolio'), 'manca titolo portafoglio');
            assert.ok(html.includes('RISING'), 'lo status con 1 asset deve essere RISING');
            assert.ok(html.includes('Attico CityLife'), 'manca card attico');
            assert.ok(html.includes('data-ce-act="buyLifestyleAsset"'), 'mancano bottoni acquisto');
            assert.ok(html.includes('Sei eleggibile'), 'deve mostrare eleggibilità diamond contracts');
        });

        test('lo status del CEO progredisce in base al numero di asset posseduti', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.lifestyleAssets = [];
            sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('NASCENT'), '0 asset -> NASCENT');

            gs.lifestyleAssets = ['attico_milano'];
            sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('RISING'), '1 asset -> RISING');

            gs.lifestyleAssets = ['attico_milano', 'villa_porto_cervo'];
            sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('ELITE'), '2 asset -> ELITE');

            gs.lifestyleAssets = ['attico_milano', 'villa_porto_cervo', 'ufficio_wall_street', 'jet_privato'];
            sandbox.renderTabLifestyle();
            assert.ok(container.innerHTML.includes('MOGUL'), '4+ asset -> MOGUL');
        });
    });

    describe('acquisto asset lifestyle (buyLifestyleAsset)', () => {
        test('buyLifestyleAsset scala il prezzo, assegna l asset e aumenta la reputazione', () => {
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const attico = assets.find(a => a.id === 'attico_milano');
            assert.ok(attico, 'attico_milano deve esistere in LIFESTYLE_ASSETS');

            gs.cash = attico.price + 500000;
            gs.lifestyleAssets = [];
            gs.reputation = 3.0;

            const cashPrima = gs.cash;
            sandbox.buyLifestyleAsset(attico.id);

            assert.equal(gs.cash, cashPrima - attico.price);
            assert.ok(gs.lifestyleAssets.includes(attico.id));
            assert.equal(gs.reputation, 3.0 + attico.repBonus);
        });

        test('buyLifestyleAsset fallisce se i fondi sono insufficienti', () => {
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const attico = assets.find(a => a.id === 'attico_milano');

            gs.cash = attico.price - 1000;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset(attico.id);

            assert.equal(gs.lifestyleAssets.length, 0);
            assert.equal(gs.cash, attico.price - 1000);
        });

        test('buyLifestyleAsset non consente acquisti duplicati dello stesso asset', () => {
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const attico = assets.find(a => a.id === 'attico_milano');

            gs.cash = attico.price * 3;
            gs.lifestyleAssets = [attico.id];

            const cashPrima = gs.cash;
            sandbox.buyLifestyleAsset(attico.id);

            assert.equal(gs.cash, cashPrima);
            assert.equal(gs.lifestyleAssets.length, 1);
            assert.ok(env.notifications.some(n => n.msg.includes('Asset già posseduto')));
        });

        test('acquistare il jet privato sblocca le tratte internazionali', () => {
            const assets = vm.runInContext('LIFESTYLE_ASSETS', sandbox);
            const jet = assets.find(a => a.id === 'jet_privato');
            assert.ok(jet && jet.intlUnlock, 'jet_privato deve avere intlUnlock');

            gs.cash = jet.price + 100000;
            gs.unlockedRegions = ['centro', 'nord'];

            sandbox.buyLifestyleAsset(jet.id);

            assert.ok(gs.unlockedRegions.includes('svizzera'));
            assert.ok(gs.unlockedRegions.includes('costa_azzurra'));
        });

        test('un asset non presente nel catalogo viene ignorato', () => {
            gs.cash = 10000000;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset('castello_fantasma');

            assert.equal(gs.lifestyleAssets.length, 0);
            assert.equal(gs.cash, 10000000);
        });
    });

    describe('effetti collaterali degli asset lifestyle su altri sistemi', () => {
        test('processDailyRoutines include la rendita passiva degli asset lifestyle (al netto delle imposte)', () => {
            gs.lifestyleAssets = ['attico_milano', 'villa_porto_cervo'];
            gs.cash = 0;
            gs.investments = [];
            gs.fleet = [];
            gs.staff = [];
            gs.drivers = [];

            // attico 3500 + villa 8000 = 11500 lordi
            // tassazione base 42% -> 11500 * (1 - 0.42) = 6670 netti
            sandbox.processDailyRoutines();

            assert.equal(gs.cash, 6670);
        });

        test('gli asset lifestyle aumentano il credit score aziendale', () => {
            gs.reputation = 4.0;
            gs.cash = 100000;
            gs.loans = [];
            gs.lifestyleAssets = [];

            sandbox._updateCreditScore();
            const scoreBase = gs.creditScore;

            gs.lifestyleAssets = ['attico_milano', 'villa_porto_cervo'];
            sandbox._updateCreditScore();

            assert.equal(gs.creditScore, scoreBase + 40); // 20 per asset
        });

        test('_tickFatigue applica il bonus recupero energia CEO dagli asset lifestyle', () => {
            gs.lifestyleAssets = ['attico_milano']; // energyBonus: 0.5
            gs.activeRides = [];
            gs.energy = 50;

            sandbox._tickFatigue();

            // guadagno: 1.0 base + 0.5 bonus = 1.5
            assert.equal(gs.energy, 51.5);
        });
    });

    describe('decreti governativi (Server Decrees)', () => {
        test('decreesRefresh memorizza decreti e decreti attivi da Supabase', async () => {
            sandbox.supabaseClient = {
                rpc: async (fn) => {
                    if (fn === 'rpc_get_server_decrees') {
                        return { data: [{ id: 'dec_1', title: 'Tassa carburante', votes_required: 10 }] };
                    }
                    if (fn === 'rpc_get_active_decrees') {
                        return { data: [{ id: 'dec_2', effects: { fuel_mult: 0.9 } }] };
                    }
                    return { data: null };
                }
            };

            await sandbox.decreesRefresh(true);

            assert.equal(sandbox._decreesState.decrees.length, 1);
            assert.equal(sandbox._decreesState.decrees[0].id, 'dec_1');
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);
            assert.equal(sandbox._decreesState.activeDecrees[0].id, 'dec_2');
        });

        test('getDecreeEffects calcola i moltiplicatori cumulativi degli activeDecrees', () => {
            sandbox._decreesState.activeDecrees = [
                { id: 'd1', effects: { fuel_cost: 0.9, rep_bonus: 1.1 } },
                { id: 'd2', effects: { fuel_cost: 0.8 } },
            ];

            const fx = sandbox.getDecreeEffects();
            assert.ok(Math.abs(fx.fuel_cost - 0.72) < 0.0001);
            assert.equal(fx.rep_bonus, 1.1);
        });

        test('voteServerDecree rifiuta punti non validi o insufficienti', async () => {
            gs.lobbyingPoints = 5;

            await sandbox.voteServerDecree('dec_1', 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Inserisci punti validi')));

            await sandbox.voteServerDecree('dec_1', 10);
            assert.ok(env.notifications.some(n => n.msg.includes('Punti lobbying insufficienti')));
            assert.equal(gs.lobbyingPoints, 5);
        });

        test('voteServerDecree invia il voto all RPC Supabase e scala lobbyingPoints', async () => {
            gs.lobbyingPoints = 15;
            let rpcCallArgs = null;

            sandbox.supabaseClient = {
                rpc: async (fn, args) => {
                    if (fn === 'rpc_vote_server_decree') {
                        rpcCallArgs = { ...args };
                        return { data: { passed: false, votes_current: 5 } };
                    }
                    if (fn === 'rpc_get_server_decrees') return { data: [] };
                    if (fn === 'rpc_get_active_decrees') return { data: [] };
                    return { data: null };
                }
            };

            await sandbox.voteServerDecree('dec_1', 6);

            assert.equal(rpcCallArgs.v_decree_id, 'dec_1');
            assert.equal(rpcCallArgs.v_points_spent, 6);
            assert.equal(gs.lobbyingPoints, 9);
        });
    });

    describe('real estate (ui-realestate.js)', () => {
        test('renderTabRealEstate renderizza listings e proprietà possedute', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.cash = 10000000;

            sandbox.supabaseClient = {
                from: (table) => {
                    if (table === 'real_estate_listings') {
                        return {
                            select: () => ({
                                order: () => Promise.resolve({
                                    data: [
                                        { id: 're_milano', name: 'Attico CityLife', cost: 5000000, daily_rent: 15000, city: 'Milano' },
                                        { id: 're_roma', name: 'Palazzetto Trastevere', cost: 3500000, daily_rent: 10000, city: 'Roma' }
                                    ],
                                    error: null
                                })
                            })
                        };
                    }
                    if (table === 'company_real_estate') {
                        return {
                            select: () => Promise.resolve({
                                data: [
                                    { id: 'cre_1', listing_id: 're_milano', last_rent_at: new Date().toISOString() }
                                ],
                                error: null
                            })
                        };
                    }
                }
            };

            await sandbox.renderTabRealEstate();

            const html = container.innerHTML;
            assert.ok(html.includes('Portafoglio Immobiliare'), 'manca titolo real estate');
            assert.ok(html.includes('Attico CityLife'), 'manca nome immobile milano');
            assert.ok(html.includes('Palazzetto Trastevere'), 'manca nome immobile roma');
            assert.ok(html.includes('data-ce-act="doBuyRealEstate"'), 'manca ceAct doBuyRealEstate');
            assert.ok(html.includes('TUO'), 'deve mostrare badge TUO per milano');
        });

        test('doBuyRealEstate chiama ServerState.buyRealEstate e notifica il successo', async () => {
            let buyListingId = null;
            let renderCalled = false;

            sandbox.ServerState.buyRealEstate = async (id) => {
                buyListingId = id;
                return { success: true, name: 'Palazzetto Trastevere', daily_rent: 10000 };
            };
            sandbox.renderTabRealEstate = async () => { renderCalled = true; };

            await sandbox.doBuyRealEstate('re_roma');

            assert.equal(buyListingId, 're_roma');
            assert.equal(renderCalled, true);
        });
    });
});
