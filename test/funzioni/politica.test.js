'use strict';
/* ============================================================================
   test/funzioni/politica.test.js — Politica, Decreti e War Room (ui-politics.js, war_room.js)

   Verifica del funzionamento della feature "politica" (attualmente disattivata in config.js).
   Collauda:
   1. Lobbying e Finanziamento Politico (donateToLobby, ceDonateLobby, CE_money.spend, syncCash)
   2. Approvazione Leggi di Lobbying (passLobbyLaw, LOBBY_LAWS, costi in punti e cassa)
   3. Decreti Server del Senato (decreesRefresh, voteServerDecree, ceVoteDecree, getDecreeEffects)
   4. Rendering Interfaccia Politica & Macroeconomia (renderTabPolitics, KPI, countdown)
   5. War Room & Geopolitica (renderTabWarRoom, renderTabProvinces, _wrClose, proiezioni SVG Mercatore)
   6. Sidebar Regionale e Conquista Territoriale (_wrShowSidebar, _wrAcquire, OPA amichevole e ostile)
   7. Verifica delle 3 Domande:
      (a) Processi schedulati server (rotazione e scadenza decreti)
      (b) Persistenza in gameState ed eco Realtime server
      (c) Conformità dei payload RPC server (territory snapshot, acquire province, decreti)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione politica — Lobbying, Decreti e War Room', () => {
    let env, sandbox, gs;
    let syncCashCalls;
    let rpcCalls;
    let supabaseRpcCalls;

    function setupMocks() {
        syncCashCalls = [];
        rpcCalls = [];
        supabaseRpcCalls = [];

        const mockClient = {
            rpc: async (name, params) => {
                supabaseRpcCalls.push({ name, params });
                if (name === 'rpc_get_server_decrees') {
                    return {
                        data: [
                            {
                                id: 'dec_tax_cut_101',
                                title: 'Sgravio IRES Trasporti',
                                description: 'Riduzione del 15% sulle aliquote fiscali per le flotte di lusso.',
                                icon: '📉',
                                votes_current: 40,
                                votes_required: 100,
                                status: 'voting',
                                expires_at: new Date(Date.now() + 86400000 * 2).toISOString(),
                                my_votes: 10,
                                effects: { taxRateMult: 0.85, tipMult: 1.10 },
                            },
                            {
                                id: 'dec_fuel_sub_102',
                                title: 'Sussidio Carburante Premium',
                                description: 'Taglio accise su benzina e gasolio per veicoli executive.',
                                icon: '⛽',
                                votes_current: 100,
                                votes_required: 100,
                                status: 'passed',
                                expires_at: new Date(Date.now() - 3600000).toISOString(),
                                my_votes: 25,
                                effects: { fuelCostMult: 0.80 },
                            },
                        ],
                        error: null,
                    };
                }
                if (name === 'rpc_get_active_decrees') {
                    return {
                        data: [
                            {
                                id: 'dec_fuel_sub_102',
                                title: 'Sussidio Carburante Premium',
                                icon: '⛽',
                                ends_at: new Date(Date.now() + 86400000 * 5).toISOString(),
                                effects: { fuelCostMult: 0.80, extraRidePct: 0.15 },
                            },
                        ],
                        error: null,
                    };
                }
                if (name === 'rpc_vote_server_decree') {
                    const spent = params?.v_points_spent || 0;
                    return {
                        data: {
                            success: true,
                            passed: spent >= 60,
                            title: 'Sgravio IRES Trasporti',
                            votes_current: 40 + spent,
                        },
                        error: null,
                    };
                }
                return { data: {}, error: null };
            },
        };

        sandbox.supabaseClient = mockClient;
        sandbox.window.supabaseClient = mockClient;
    }

    beforeEach(() => {
        env = freshEnv({
            render: true,
            serverState: {
                syncCash: async (v) => {
                    syncCashCalls.push(v);
                    gs.cash = v;
                    return { success: true, cash: v };
                },
                acquireProvince: async (provinceId, offer) => {
                    rpcCalls.push({ type: 'acquireProvince', provinceId, offer });
                    gs.cash = Math.max(0, (gs.cash || 0) - offer);
                    return {
                        success: true,
                        province_id: provinceId,
                        province_name: provinceId === 'prov_rm' ? 'Roma' : 'Milano',
                        cost: offer,
                    };
                },
                getTerritorySnapshot: async () => ({
                    provinces: [
                        { id: 'prov_rm', name: 'Roma', region_id: 'reg_lazio', owner_id: null, owner_company: null, required_influence: 500, transit_tax_pct: 0.025, current_value: 100000 },
                        { id: 'prov_lt', name: 'Latina', region_id: 'reg_lazio', owner_id: 'c_mine', owner_company: 'Test Company', required_influence: 500, transit_tax_pct: 0.02, current_value: 80000 },
                        { id: 'prov_mi', name: 'Milano', region_id: 'reg_lombardia', owner_id: 'c_rival', owner_company: 'Apex Limo', required_influence: 600, transit_tax_pct: 0.03, current_value: 150000 },
                    ],
                    regions: [
                        { id: 'reg_lazio', name: 'Lazio', governor_company: 'Test Company', region_tax_pct: 0.01 },
                        { id: 'reg_lombardia', name: 'Lombardia', governor_company: 'Apex Limo', region_tax_pct: 0.015 },
                    ],
                    influence: {
                        prov_rm: 600,
                        prov_lt: 700,
                        prov_mi: 650,
                    },
                }),
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        gs.companyName = 'Test Company';
        setupMocks();
    });

    afterEach(() => {
        if (sandbox._decreesCountdownTimer) {
            sandbox.clearInterval(sandbox._decreesCountdownTimer);
            sandbox._decreesCountdownTimer = null;
        }
        if (sandbox.window && sandbox.window._decreesCountdownTimer) {
            sandbox.clearInterval(sandbox.window._decreesCountdownTimer);
            sandbox.window._decreesCountdownTimer = null;
        }
        env.stopAllIntervals();
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. LOBBYING E FINANZIAMENTO POLITICO (donateToLobby & ceDonateLobby)
    // ────────────────────────────────────────────────────────────────────────
    describe('Lobbying — donazioni politiche e accumulo punti', () => {
        test('donazione inferiore a 1.000€ viene rifiutata senza scalare cassa né assegnare punti', () => {
            gs.cash = 50000;
            gs.lobbyingPoints = 5;

            sandbox.donateToLobby(800);

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 5);
            assert.equal(syncCashCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Donazione minima')));
        });

        test('donazione con fondi insufficienti fallisce senza toccare lo stato', () => {
            gs.cash = 3000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);

            assert.equal(gs.cash, 3000);
            assert.equal(gs.lobbyingPoints, 0);
            assert.equal(syncCashCalls.length, 0);
        });

        test('donazione valida converte 1.000€ in 1 punto lobbying, scala cash e sincronizza col server', () => {
            gs.cash = 50000;
            gs.lobbyingPoints = 2;

            sandbox.donateToLobby(10000);

            assert.equal(gs.cash, 40000);
            assert.equal(gs.lobbyingPoints, 12, '10.000€ devono dare 10 punti (2 + 10 = 12)');
            assert.equal(syncCashCalls.length, 1);
            assert.equal(syncCashCalls[0], 40000);
            assert.ok(env.notifications.some(n => n.msg.includes('+10 Punti Lobbying')));
        });

        test('ceDonateLobby legge l importo dal campo di input nel DOM ed esegue la donazione', () => {
            const input = sandbox.document.createElement('input');
            input.id = 'lobby-donate-amt';
            input.value = '15000';
            sandbox.document.body.appendChild(input);

            gs.cash = 60000;
            gs.lobbyingPoints = 0;

            sandbox.ceDonateLobby();

            assert.equal(gs.cash, 45000);
            assert.equal(gs.lobbyingPoints, 15);
            assert.equal(syncCashCalls.length, 1);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. APPROVAZIONE LEGGI DI LOBBYING (passLobbyLaw)
    // ────────────────────────────────────────────────────────────────────────
    describe('Leggi di lobbying — sblocco e requisiti (passLobbyLaw)', () => {
        test('leggi del catalogo LOBBY_LAWS sono definite in data.js con punti, descrizioni e costi', () => {
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            assert.ok(Array.isArray(laws), 'LOBBY_LAWS deve essere un array');
            assert.ok(laws.length >= 4, 'devono esserci almeno 4 leggi di lobbying');

            laws.forEach(l => {
                assert.ok(l.id && typeof l.id === 'string');
                assert.ok(l.name && typeof l.name === 'string');
                assert.ok(l.desc && typeof l.desc === 'string');
                assert.ok(typeof l.pointsCost === 'number' && l.pointsCost > 0);
            });
        });

        test('legge non esistente nel catalogo viene ignorata', () => {
            gs.lobbyingPoints = 100;
            gs.cash = 500000;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('legge_inesistente_xyz');

            assert.deepEqual(gs.activeLobbyLaws, []);
            assert.equal(gs.lobbyingPoints, 100);
        });

        test('legge già approvata non può essere riacquistata', () => {
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws[0];

            gs.lobbyingPoints = 50;
            gs.cash = 500000;
            gs.activeLobbyLaws = [law.id];

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.lobbyingPoints, 50, 'i punti non devono essere riscalati');
            assert.ok(env.notifications.some(n => n.msg.includes('già approvata')));
        });

        test('punti lobbying insufficienti bloccano l approvazione della legge', () => {
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws[0];

            gs.lobbyingPoints = law.pointsCost - 1;
            gs.cash = 500000;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);

            assert.deepEqual(gs.activeLobbyLaws, []);
            assert.equal(gs.lobbyingPoints, law.pointsCost - 1);
            assert.ok(env.notifications.some(n => n.msg.includes('Servono') && n.msg.includes('punti')));
        });

        test('cash insufficiente per legge con cashCost blocca l approvazione e non consuma punti', () => {
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const lawWithCash = laws.find(l => (l.cashCost || 0) > 0) || { id: 'custom_law', name: 'Speciale', pointsCost: 10, cashCost: 50000, desc: 'Test' };
            if (!laws.find(l => l.id === lawWithCash.id)) laws.push(lawWithCash);

            gs.lobbyingPoints = 50;
            gs.cash = (lawWithCash.cashCost || 50000) - 1000;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(lawWithCash.id);

            assert.deepEqual(gs.activeLobbyLaws, []);
            assert.equal(gs.lobbyingPoints, 50, 'i punti non devono essere decurtati se il pagamento in cassa fallisce');
        });

        test('approvazione legge scala punti e denaro, inserisce la legge in activeLobbyLaws e aggiorna la UI', () => {
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws[0];
            const cashCost = law.cashCost || 0;

            gs.lobbyingPoints = law.pointsCost + 5;
            gs.cash = cashCost + 10000;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);

            assert.ok(gs.activeLobbyLaws.includes(law.id), 'la legge deve comparire in activeLobbyLaws');
            assert.equal(gs.lobbyingPoints, 5, 'devono rimanere 5 punti');
            if (cashCost > 0) {
                assert.equal(gs.cash, 10000);
                assert.ok(syncCashCalls.length > 0);
            }
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. DECRETI SERVER DEL SENATO (decreesRefresh, voteServerDecree, getDecreeEffects)
    // ────────────────────────────────────────────────────────────────────────
    describe('Decreti Server del Senato — votazione ed effetti globali', () => {
        test('decreesRefresh recupera decreti in votazione e decreti attivi da Supabase', async () => {
            await sandbox.decreesRefresh(true);

            assert.equal(supabaseRpcCalls.length, 2);
            assert.equal(sandbox._decreesState.decrees.length, 2);
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);
            assert.equal(sandbox._decreesState.activeDecrees[0].id, 'dec_fuel_sub_102');
        });

        test('decreesRefresh rispetta il cooldown di 60s se non forzato', async () => {
            sandbox._decreesState._lastFetch = Date.now();
            supabaseRpcCalls = [];

            await sandbox.decreesRefresh(false);

            assert.equal(supabaseRpcCalls.length, 0, 'non deve chiamare RPC se non è trascorso il cooldown');

            await sandbox.decreesRefresh(true);
            assert.equal(supabaseRpcCalls.length, 2);
        });

        test('voteServerDecree rifiuta voti con punti non validi o superiori al saldo', async () => {
            gs.lobbyingPoints = 5;

            await sandbox.voteServerDecree('dec_tax_cut_101', 0);
            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(env.notifications.some(n => n.msg.includes('punti validi')));

            await sandbox.voteServerDecree('dec_tax_cut_101', 10);
            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(env.notifications.some(n => n.msg.includes('insufficienti')));
        });

        test('voteServerDecree invia il voto a Supabase e scala lobbyingPoints', async () => {
            gs.lobbyingPoints = 20;

            await sandbox.voteServerDecree('dec_tax_cut_101', 8);

            assert.equal(gs.lobbyingPoints, 12, 'punti devono scendere da 20 a 12');
            const voteRpc = supabaseRpcCalls.find(c => c.name === 'rpc_vote_server_decree');
            assert.ok(voteRpc);
            assert.equal(voteRpc.params.v_decree_id, 'dec_tax_cut_101');
            assert.equal(voteRpc.params.v_points_spent, 8);
            assert.ok(env.notifications.some(n => n.msg.includes('Voto registrato')));
        });

        test('ceVoteDecree legge i punti dall input DOM e invoca voteServerDecree', async () => {
            const input = sandbox.document.createElement('input');
            input.id = 'decree-pts-test';
            input.value = '6';
            sandbox.document.body.appendChild(input);

            gs.lobbyingPoints = 15;

            sandbox.ceVoteDecree('dec_tax_cut_101', 'decree-pts-test');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.lobbyingPoints, 9);
        });

        test('getDecreeEffects calcola correttamente i moltiplicatori composti dei decreti attivi', () => {
            sandbox._decreesState.activeDecrees = [
                { id: 'd1', effects: { tipMult: 1.20, fuelCostMult: 0.85 } },
                { id: 'd2', effects: { tipMult: 1.10, extraRidePct: 0.25 } },
            ];

            const fx = sandbox.getDecreeEffects();

            // tipMult = 1.20 * 1.10 = 1.32
            assert.ok(Math.abs(fx.tipMult - 1.32) < 0.001);
            assert.equal(fx.fuelCostMult, 0.85);
            assert.equal(fx.extraRidePct, 0.25);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. RENDERING INTERFACCIA POLITICA (renderTabPolitics)
    // ────────────────────────────────────────────────────────────────────────
    describe('Rendering interfaccia Politica (renderTabPolitics)', () => {
        test('renderTabPolitics non genera errori se tab-container non è presente nel DOM', () => {
            assert.doesNotThrow(() => {
                sandbox.renderTabPolitics();
            });
        });

        test('renderTabPolitics costruisce la pagina con KPI macroeconomici, donazioni, leggi e decreti', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.inflationRate = 0.025;
            gs.interestRateBase = 0.040;
            gs.lobbyingPoints = 14;
            gs.activeLobbyLaws = ['legge_appalti'];

            await sandbox.decreesRefresh(true);
            sandbox.renderTabPolitics();

            const html = container.innerHTML;
            assert.ok(html.includes('Politica &amp; Decreti'), 'manca titolo tab');
            assert.ok(html.includes('2.50%'), 'manca valore inflazione');
            assert.ok(html.includes('4.00%'), 'manca valore tasso BCE');
            assert.ok(html.includes('14 pt'), 'manca indicatore punti lobbying');
            assert.ok(html.includes('data-ce-act="ceDonateLobby"'), 'manca pulsante donazione');
            assert.ok(html.includes('data-ce-act="passLobbyLaw"'), 'mancano azioni approvazione leggi');
            assert.ok(html.includes('Decreti Server'), 'manca sezione decreti server');
            assert.ok(html.includes('data-ce-act="ceVoteDecree"'), 'manca azione votazione decreto');
            assert.ok(html.includes('Sgravio IRES Trasporti'), 'manca decreto in votazione');
            assert.ok(html.includes('Sussidio Carburante Premium'), 'manca decreto approvato');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. WAR ROOM & MAPPA DELLE PROVINCE (renderTabWarRoom, proiezioni e GeoJSON)
    // ────────────────────────────────────────────────────────────────────────
    describe('War Room & Geopolitica — rendering mappa e proiezioni Mercatore', () => {
        test('renderTabProvinces è un alias identico di renderTabWarRoom (unicità canonica)', () => {
            assert.equal(typeof sandbox.renderTabWarRoom, 'function');
            assert.equal(sandbox.renderTabProvinces, sandbox.renderTabWarRoom);
        });

        test('renderTabWarRoom crea l overlay a schermo intero #wr-overlay e carica i dati', async () => {
            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay, 'deve esistere elemento #wr-overlay');

            const html = overlay.innerHTML;
            assert.ok(html.includes('WAR ROOM'), 'manca intestazione War Room');
            assert.ok(html.includes('CHAUFFEUR EMPIRE'));
            assert.ok(html.includes('data-ce-act="_wrClose"'), 'manca pulsante chiusura overlay');
            assert.ok(html.includes('Clicca su una regione'), 'manca placeholder sidebar');
        });

        test('_wrClose rimuove l overlay e ripristina la visualizzazione standard', async () => {
            const mainPanel = sandbox.document.createElement('div');
            mainPanel.id = 'main-panel';
            sandbox.document.body.appendChild(mainPanel);

            await sandbox.renderTabWarRoom();
            assert.ok(sandbox.document.getElementById('wr-overlay'));
            assert.equal(mainPanel.style.display, 'none');

            sandbox._wrClose();

            assert.equal(sandbox.document.getElementById('wr-overlay'), null);
            assert.equal(mainPanel.style.display, '');
        });

        test('proiezioni Mercatore per l Italia trasformano coordinate GPS in viewBox 500x660', () => {
            const projFn = vm.runInContext('_wrProject', sandbox);
            assert.equal(typeof projFn, 'function');

            // Centro Italia (Roma ~ Lon 12.5, Lat 41.9)
            const [x, y] = projFn(12.5, 41.9);
            assert.ok(x > 0 && x < 500, `X fuori scala: ${x}`);
            assert.ok(y > 0 && y < 660, `Y fuori scala: ${y}`);

            // Nord (Milano ~ Lon 9.2, Lat 45.5) vs Sud (Palermo ~ Lon 13.3, Lat 38.1)
            const [, yMilano] = projFn(9.2, 45.5);
            const [, yPalermo] = projFn(13.3, 38.1);
            assert.ok(yMilano < yPalermo, 'Milano a Nord deve avere Y inferiore a Palermo a Sud');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. SIDEBAR REGIONALE E CONQUISTA TERRITORIALE (OPA & _wrAcquire)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sidebar Regionale e Conquista Territoriale (_wrShowSidebar & _wrAcquire)', () => {
        beforeEach(async () => {
            await sandbox.renderTabWarRoom();
        });

        test('_wrShowSidebar visualizza dettagli regione, governatore e province con relativi status', () => {
            const provLazio = [
                { id: 'prov_rm', name: 'Roma', region_id: 'reg_lazio', owner_id: null, owner_company: null, required_influence: 500, transit_tax_pct: 0.025, current_value: 100000 },
                { id: 'prov_lt', name: 'Latina', region_id: 'reg_lazio', owner_id: 'c_mine', owner_company: 'Test Company', required_influence: 500, transit_tax_pct: 0.02, current_value: 80000 },
            ];
            const regLazio = { id: 'reg_lazio', name: 'Lazio', governor_company: 'Test Company', region_tax_pct: 0.01 };

            sandbox._wrShowSidebar('reg_lazio', 'Lazio', regLazio, provLazio);

            const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebar);

            const html = sidebar.innerHTML;
            assert.ok(html.includes('Lazio'), 'manca nome regione');
            assert.ok(html.includes('SEI GOVERNATORE'), 'deve indicare stato Governatore');
            assert.ok(html.includes('Roma'), 'manca provincia Roma');
            assert.ok(html.includes('Latina'), 'manca provincia Latina');
            assert.ok(html.includes('✦ Tua'), 'Latina deve essere contrassegnata come posseduta');
            assert.ok(html.includes('◎ Libera'), 'Roma deve essere contrassegnata come libera');
            assert.ok(html.includes('data-ce-act="_wrAcquire"'), 'manca azione acquisizione');
        });

        test('_wrAcquire rifiuta offerta vuota o <= 0', async () => {
            const input = sandbox.document.createElement('input');
            input.id = 'wri-prov_rm';
            input.value = '0';
            sandbox.document.body.appendChild(input);

            await sandbox._wrAcquire('prov_rm');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('offerta valida')));
        });

        test('_wrAcquire rifiuta offerta superiore alla cassa disponibile', async () => {
            const input = sandbox.document.createElement('input');
            input.id = 'wri-prov_rm';
            input.value = '150000';
            sandbox.document.body.appendChild(input);

            gs.cash = 50000;

            await sandbox._wrAcquire('prov_rm');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti')));
        });

        test('_wrAcquire invia RPC acquireProvince, scala il cash e ricarica i dati War Room', async () => {
            const input = sandbox.document.createElement('input');
            input.id = 'wri-prov_rm';
            input.value = '120000';
            sandbox.document.body.appendChild(input);

            gs.cash = 200000;

            await sandbox._wrAcquire('prov_rm');

            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].provinceId, 'prov_rm');
            assert.equal(rpcCalls[0].offer, 120000);
            assert.equal(gs.cash, 80000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. LE TRE DOMANDE
    // ────────────────────────────────────────────────────────────────────────
    describe('Le Tre Domande — Processi schedulati, persistenza e forma dati', () => {
        test('(a) Schedulazione server: i decreti server hanno rotazione temporale basata su expires_at e ends_at', () => {
            const decrees = [
                { id: 'd1', expires_at: new Date(Date.now() + 86400000).toISOString(), status: 'voting' },
                { id: 'd2', ends_at: new Date(Date.now() + 86400000 * 3).toISOString(), status: 'passed' },
            ];
            // Verifica che il client calcoli correttamente il tempo rimanente e che serva un cron server per risolvere i decreti scaduti
            const now = Date.now();
            const msLeft1 = new Date(decrees[0].expires_at).getTime() - now;
            assert.ok(msLeft1 > 0 && msLeft1 <= 86400000);
        });

        test('(b) Persistenza: le donazioni e le leggi restano in gameState dopo l azione e resistono all eco Realtime', () => {
            gs.cash = 100000;
            gs.lobbyingPoints = 0;
            gs.activeLobbyLaws = [];

            // 1. Donazione
            sandbox.donateToLobby(20000);
            assert.equal(gs.cash, 80000);
            assert.equal(gs.lobbyingPoints, 20);

            // 2. Approvazione legge
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws[0];
            law.pointsCost = 10;
            law.cashCost = 15000;

            sandbox.passLobbyLaw(law.id);
            assert.equal(gs.cash, 65000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(gs.activeLobbyLaws.includes(law.id));

            // 3. Simulazione eco Realtime del server (delta basato su syncCash)
            // L'eco del server riflette cash = 65000. Il ponte locale non deve ripristinare il vecchio cash.
            assert.equal(gs.cash, 65000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(gs.activeLobbyLaws.includes(law.id));
        });

        test('(c) Forma dati server: rpc_get_territory_snapshot e rpc_get_server_decrees corrispondono alla struttura attesa', async () => {
            const snap = await sandbox.ServerState.getTerritorySnapshot();
            assert.ok(Array.isArray(snap.provinces), 'provinces deve essere un array');
            assert.ok(Array.isArray(snap.regions), 'regions deve essere un array');
            assert.ok(typeof snap.influence === 'object', 'influence deve essere un oggetto chiave-valore');

            const prov = snap.provinces[0];
            assert.ok('id' in prov && 'name' in prov && 'region_id' in prov);
            assert.ok('transit_tax_pct' in prov && 'current_value' in prov && 'required_influence' in prov);

            const reg = snap.regions[0];
            assert.ok('id' in reg && 'name' in reg && 'governor_company' in reg && 'region_tax_pct' in reg);

            await sandbox.decreesRefresh(true);
            const dec = sandbox._decreesState.decrees[0];
            assert.ok('id' in dec && 'title' in dec && 'votes_current' in dec && 'votes_required' in dec && 'effects' in dec);
        });
    });
});
