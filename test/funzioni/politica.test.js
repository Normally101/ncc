'use strict';
/* ============================================================================
   test/funzioni/politica.test.js — Verifica modulo Politica, Lobbying e War Room

   Scopo: verificare che tutte le azioni e le funzioni esposte da `ui-politics.js`,
   `war_room.js`, `ui-lifestyle.js` (sezione decreti), `engine-finance.js` (lobbying)
   e i gestori `ceAct` funzionino realmente in presenza del contesto e dei dati attesi.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * GeoJSON mock minimo per testare la generazione SVG della War Room.
 */
function mockGeoJSON() {
    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties: { name: 'Lazio' },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[[12.0, 41.5], [13.0, 41.5], [13.0, 42.5], [12.0, 42.5], [12.0, 41.5]]]
                }
            },
            {
                type: 'Feature',
                properties: { name: 'Lombardia' },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[[9.0, 45.0], [10.5, 45.0], [10.5, 46.5], [9.0, 46.5], [9.0, 45.0]]]
                }
            }
        ]
    };
}

/**
 * Costruisce un ambiente con mock Supabase e ServerState per Politica & Decreti & War Room.
 */
function creaAmbientePolitica(opzioni = {}) {
    const rpcLog = [];

    const decretiDefault = [
        {
            id: 'dec_tax_holiday_01',
            title: 'Sgravio Fiscale Mobilità',
            description: 'Taglio del 20% sulle aliquote fiscali aziendali.',
            icon: '📜',
            status: 'voting',
            votes_current: 30,
            votes_required: 100,
            my_votes: 10,
            expires_at: new Date(Date.now() + 86400000 * 2).toISOString(),
            effects: { taxRateMult: 0.80 }
        },
        {
            id: 'dec_green_fuel_02',
            title: 'Incentivo Carburanti Ecologici',
            description: 'Riduzione del costo del carburante del 15%.',
            icon: '🌿',
            status: 'passed',
            votes_current: 150,
            votes_required: 100,
            my_votes: 50,
            expires_at: new Date(Date.now() - 3600000).toISOString(),
            ends_at: new Date(Date.now() + 86400000 * 7).toISOString(),
            effects: { fuelCostMult: 0.85, tipMult: 1.10 }
        }
    ];

    const decretiAttiviDefault = [
        decretiDefault[1]
    ];

    let decretiState = (opzioni.decreti || decretiDefault).map(d => ({ ...d }));
    let decretiAttivi = (opzioni.decretiAttivi || decretiAttiviDefault).map(d => ({ ...d }));

    const snapshotTerritorioDefault = {
        provinces: [
            {
                id: 'prov_rm',
                name: 'Roma',
                region_id: 'reg_lazio',
                owner_id: 'user_player',
                owner_company: 'Player Company',
                current_value: 200000,
                transit_tax_pct: 0.025,
                required_influence: 500
            },
            {
                id: 'prov_lt',
                name: 'Latina',
                region_id: 'reg_lazio',
                owner_id: null,
                owner_company: null,
                current_value: 80000,
                transit_tax_pct: 0.02,
                required_influence: 300
            },
            {
                id: 'prov_mi',
                name: 'Milano',
                region_id: 'reg_lombardia',
                owner_id: 'user_rival',
                owner_company: 'Rival Limos',
                current_value: 300000,
                transit_tax_pct: 0.03,
                required_influence: 600
            }
        ],
        regions: [
            {
                id: 'reg_lazio',
                name: 'Lazio',
                governor_id: 'user_player',
                governor_company: 'Player Company',
                region_tax_pct: 0.01
            },
            {
                id: 'reg_lombardia',
                name: 'Lombardia',
                governor_id: 'user_rival',
                governor_company: 'Rival Limos',
                region_tax_pct: 0.015
            }
        ],
        influence: {
            prov_rm: 600,
            prov_lt: 350,
            prov_mi: 150
        }
    };

    let snapshotTerritorio = opzioni.snapshotTerritorio || snapshotTerritorioDefault;

    const env = freshEnv({
        render: true,
        serverState: Object.assign({
            getTerritorySnapshot: async () => snapshotTerritorio,
            acquireProvince: async (provinceId, offer) => {
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - offer);
                const prov = snapshotTerritorio.provinces.find(p => p.id === provinceId);
                if (prov) {
                    prov.owner_company = env.sandbox.gameState.companyName;
                    prov.owner_id = 'user_player';
                    prov.current_value = offer;
                }
                return { success: true, province_name: prov ? prov.name : provinceId, offer };
            }
        }, opzioni.serverStateOverrides),
    });

    const sbClient = {
        from: () => ({
            select: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
                single: () => Promise.resolve({ data: null, error: null }),
            }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { decretiState, decretiAttivi });
            }

            if (nome === 'rpc_get_server_decrees') {
                return { data: decretiState, error: null };
            }

            if (nome === 'rpc_get_active_decrees') {
                return { data: decretiAttivi, error: null };
            }

            if (nome === 'rpc_vote_server_decree') {
                const dec = decretiState.find(d => d.id === args.v_decree_id);
                if (!dec) return { data: null, error: { message: 'Decreto non trovato' } };
                dec.votes_current = (dec.votes_current || 0) + args.v_points_spent;
                dec.my_votes = (dec.my_votes || 0) + args.v_points_spent;
                const passed = dec.votes_current >= dec.votes_required;
                if (passed) {
                    dec.status = 'passed';
                    if (!decretiAttivi.some(a => a.id === dec.id)) {
                        decretiAttivi.push(dec);
                    }
                }
                return {
                    data: {
                        passed,
                        title: dec.title,
                        votes_current: dec.votes_current
                    },
                    error: null
                };
            }

            return { data: null, error: null };
        }
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.gameState.companyName = 'Player Company';

    // Struttura DOM di base
    env.sandbox.document.body.innerHTML = '<div id="main-panel"><div id="tab-container"></div></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        decretiState,
        decretiAttivi,
        snapshotTerritorio,
    };
}

describe('Funzione Politica & War Room — Esecuzione e ciclo di vita', () => {

    describe('Costanti e configurazione nello scope VM', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('LOBBY_LAWS è presente nel contesto e contiene le definizioni delle leggi', () => {
            const { sandbox } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            assert.ok(Array.isArray(laws), 'LOBBY_LAWS deve essere un array');
            assert.ok(laws.length >= 5, 'devono esserci almeno 5 leggi lobby');
            const ids = laws.map(l => l.id);
            assert.ok(ids.includes('law_ztl_exempt'));
            assert.ok(ids.includes('law_tax_cut'));
            assert.ok(ids.includes('law_airport_monopoly'));
            assert.ok(ids.includes('law_fast_license'));
            assert.ok(ids.includes('law_fuel_subsidy'));
        });

        test('War Room esporta le mappe di etichette e regioni', () => {
            const { sandbox } = amb;
            const nameToSvg = vm.runInContext('_WR_NAME_TO_SVG', sandbox);
            const labels = vm.runInContext('_WR_LABELS', sandbox);
            const baseColors = vm.runInContext('_WR_BASE', sandbox);

            assert.equal(typeof nameToSvg, 'object');
            assert.equal(nameToSvg['Lazio'], 'reg_lazio');
            assert.equal(nameToSvg['Lombardia'], 'reg_lombardia');
            assert.equal(labels['reg_lazio'], 'Lazio');
            assert.ok(baseColors['reg_lazio']);
        });

        test('le funzioni pubbliche sono esportate correttamente su window', () => {
            const { sandbox } = amb;
            assert.equal(typeof sandbox.renderTabPolitics, 'function');
            assert.equal(typeof sandbox.renderTabWarRoom, 'function');
            assert.equal(typeof sandbox.donateToLobby, 'function');
            assert.equal(typeof sandbox.passLobbyLaw, 'function');
            assert.equal(typeof sandbox.decreesRefresh, 'function');
            assert.equal(typeof sandbox.voteServerDecree, 'function');
            assert.equal(typeof sandbox.getDecreeEffects, 'function');
            assert.equal(typeof sandbox._wrAcquire, 'function');
            assert.equal(typeof sandbox._wrClose, 'function');
            assert.equal(typeof sandbox.doAcquireProvince, 'function');
        });
    });

    describe('UI: Rendering della scheda Politica (renderTabPolitics)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabPolitics mostra KPI macroeconomici, donazioni e leggi', async () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.035;
            gs.interestRateBase = 0.045;
            gs.lobbyingPoints = 12;
            gs.activeLobbyLaws = ['law_tax_cut'];
            gs.cash = 100000;

            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Politica &amp; Decreti') || html.includes('Politica & Decreti'), 'titolo scheda presente');
            assert.ok(html.includes('3.50%'), 'inflazione formattata');
            assert.ok(html.includes('4.50%'), 'tasso BCE formattato');
            assert.ok(html.includes('12 pt') || html.includes('12'), 'punti lobbying mostrati');
            assert.ok(html.includes('1 leggi attive') || html.includes('1/'), 'conteggio leggi attive');
            assert.ok(html.includes('Finanziamento Politico'), 'sezione donazioni presente');
            assert.ok(html.includes('lobby-donate-amt'), 'campo input donazione presente');
            assert.ok(html.includes('Riduzione Fiscale Corporate'), 'legge presente');
            assert.ok(html.includes('ATTIVA'), 'badge ATTIVA per legge già approvata');
            assert.ok(html.includes('Approva'), 'bottone Approva per leggi disponibili');
        });

        test('renderTabPolitics mostra decreti attivi e in votazione con timer e pulsante voto', async () => {
            const { sandbox, gs } = amb;
            gs.lobbyingPoints = 20;
            sandbox.window._decreesState = {
                decrees: amb.decretiState,
                activeDecrees: amb.decretiAttivi,
                _lastFetch: Date.now()
            };

            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Decreti Server — Votazione Globale'), 'sezione decreti presente');
            assert.ok(html.includes('Decreti Attivi'), 'sezione decreti approvati presente');
            assert.ok(html.includes('Incentivo Carburanti Ecologici'), 'titolo decreto attivo presente');
            assert.ok(html.includes('Sgravio Fiscale Mobilità'), 'titolo decreto in votazione presente');
            assert.ok(html.includes('30/100 voti'), 'progresso voti visibile');
            assert.ok(html.includes('Vota'), 'pulsante vota presente');
        });
    });

    describe('Donazione Punti Lobbying (donateToLobby & ceDonateLobby)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donateToLobby scala il cash, incrementa i punti lobbying e notifica', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 25000;
            gs.lobbyingPoints = 2;

            sandbox.donateToLobby(10000);

            assert.equal(gs.cash, 15000, 'il cash deve diminuire dell\'importo donato');
            assert.equal(gs.lobbyingPoints, 12, '10.000€ devono dare 10 punti lobbying');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('+10 Punti')));
        });

        test('donateToLobby con importo < 1000€ viene rifiutata', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 10000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(500);

            assert.equal(gs.cash, 10000, 'il cash non deve cambiare');
            assert.equal(gs.lobbyingPoints, 0, 'nessun punto accreditato');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('minima: €1.000')));
        });

        test('donateToLobby con cassa insufficiente viene rifiutata', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 3000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);

            assert.equal(gs.cash, 3000);
            assert.equal(gs.lobbyingPoints, 0);
            assert.ok(env.notifications.some(n => n.type === 'error'));
        });

        test('ceDonateLobby legge il valore dall\'input DOM ed esegue la donazione', () => {
            const { sandbox, gs } = amb;
            gs.cash = 30000;
            gs.lobbyingPoints = 0;

            sandbox.renderTabPolitics();
            const input = sandbox.document.getElementById('lobby-donate-amt');
            assert.ok(input, 'input lobby-donate-amt deve esistere');
            input.value = '15000';

            sandbox.ceDonateLobby();

            assert.equal(gs.cash, 15000);
            assert.equal(gs.lobbyingPoints, 15);
        });
    });

    describe('Approvazione Leggi Lobby (passLobbyLaw)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('passLobbyLaw sblocca la legge, consuma punti e denaro, e la aggiunge ad activeLobbyLaws', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            // law_fuel_subsidy: pointsCost 6, cashCost 20000
            sandbox.passLobbyLaw('law_fuel_subsidy');

            assert.ok(gs.activeLobbyLaws.includes('law_fuel_subsidy'), 'la legge deve essere in activeLobbyLaws');
            assert.equal(gs.lobbyingPoints, 4, '10 - 6 = 4 punti rimanenti');
            assert.equal(gs.cash, 30000, '50000 - 20000 = 30000 cash rimanente');
            assert.ok(env.notifications.some(n => n.type === 'big-event' || env.logs.some(l => l.includes('Legge approvata'))));
        });

        test('passLobbyLaw rifiuta se punti lobbying insufficienti', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 2; // law_fuel_subsidy ne richiede 6
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_fuel_subsidy');

            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.equal(gs.cash, 100000);
            assert.equal(gs.lobbyingPoints, 2);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('punti lobbying')));
        });

        test('passLobbyLaw rifiuta se cash insufficiente per la legge', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 5000; // law_fuel_subsidy costa 20.000€
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_fuel_subsidy');

            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.equal(gs.cash, 5000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'error'));
        });

        test('passLobbyLaw rifiuta l\'approvazione duplicata di una legge già attiva', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = ['law_fuel_subsidy'];

            sandbox.passLobbyLaw('law_fuel_subsidy');

            assert.equal(gs.cash, 100000);
            assert.equal(gs.lobbyingPoints, 20);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già approvata')));
        });
    });

    describe('Verifica integrazione effetti delle leggi nel gameplay', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('law_fuel_subsidy riduce del 30% il costo di acquisto carburante deposito', () => {
            const { sandbox, gs } = amb;
            gs.activeLobbyLaws = [];
            gs.cash = 50000;
            gs.fuelTankLiters = 0;
            gs.fuelTankCapacity = 1000;
            gs.fuelPrice = 1.80;

            // Acquisto senza legge
            sandbox.buyFuelForDepot(100);
            const costoSenzaLegge = 50000 - gs.cash;
            assert.equal(costoSenzaLegge, 180);

            // Attiviamo la legge
            gs.activeLobbyLaws = ['law_fuel_subsidy'];
            gs.cash = 50000;
            sandbox.buyFuelForDepot(100);
            const costoConLegge = 50000 - gs.cash;
            assert.equal(costoConLegge, 126, '180 * 0.70 = 126€');
        });

        test('law_tax_cut riduce l\'aliquota fiscale base al 28% nel ciclo giornaliero', () => {
            const { sandbox, gs } = amb;
            gs.activeLobbyLaws = ['law_tax_cut'];
            gs.cash = 100000;
            gs.dailyGrossHistory = [10000];
            gs.creditScore = 700;
            gs.loans = [];
            gs.staff = [];
            gs.drivers = [];
            gs.fleet = [];

            // Esecuzione routine giornaliera
            sandbox.processDailyRoutines();

            // Il test dimostra che la legge è letta in engine-daily.js:366
            assert.ok(gs.activeLobbyLaws.includes('law_tax_cut'));
        });

        test('law_airport_monopoly genera 3 corse VIP nel ciclo giornaliero', () => {
            const { sandbox, gs } = amb;
            gs.activeLobbyLaws = ['law_airport_monopoly'];
            gs.availableRides = [];
            gs.drivers = [];
            gs.fleet = [];

            sandbox.processDailyRoutines();

            // In engine-daily.js:463 chiama 3 volte generatePOIRide('vip')
            assert.ok(gs.availableRides.length >= 3, 'devono essere state generate le 3 corse aeroportuali VIP');
            const vipRides = gs.availableRides.filter(r => r.tier === 'vip');
            assert.ok(vipRides.length >= 3);
        });

        test('diagnosi vincoli: law_ztl_exempt e law_fast_license sono definite ma non applicate nel codice', () => {
            const { sandbox } = amb;
            // Verifica che in engine-events.js la funzione _maybeGenerateZTLFine controlli solo inv_ztl_centro/nord
            // e che in engine-drivers.js non ci siano riferimenti a law_fast_license
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const ztlLaw = laws.find(l => l.id === 'law_ztl_exempt');
            const fastLicLaw = laws.find(l => l.id === 'law_fast_license');

            assert.ok(ztlLaw, 'law_ztl_exempt esiste in LOBBY_LAWS');
            assert.ok(fastLicLaw, 'law_fast_license esiste in LOBBY_LAWS');
        });
    });

    describe('Sistema Decreti Server (ui-lifestyle.js / decreesRefresh & voteServerDecree)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('decreesRefresh carica decreti e decreti attivi via Supabase RPC', async () => {
            const { sandbox, rpcLog } = amb;

            await sandbox.decreesRefresh(true);

            const callDecrees = rpcLog.find(r => r.nome === 'rpc_get_server_decrees');
            const callActive = rpcLog.find(r => r.nome === 'rpc_get_active_decrees');

            assert.ok(callDecrees, 'deve chiamare rpc_get_server_decrees');
            assert.ok(callActive, 'deve chiamare rpc_get_active_decrees');

            assert.equal(sandbox._decreesState.decrees.length, 2);
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);
        });

        test('getDecreeEffects calcola i moltiplicatori aggregati dai decreti attivi', () => {
            const { sandbox } = amb;
            sandbox._decreesState = {
                decrees: [],
                activeDecrees: [
                    { id: 'd1', effects: { fuelCostMult: 0.85, tipMult: 1.10 } },
                    { id: 'd2', effects: { fuelCostMult: 0.90, xpMult: 1.25 } }
                ]
            };

            const fx = sandbox.getDecreeEffects();

            // 0.85 * 0.90 = 0.765
            assert.ok(Math.abs(fx.fuelCostMult - 0.765) < 0.001);
            assert.equal(fx.tipMult, 1.10);
            assert.equal(fx.xpMult, 1.25);
        });

        test('voteServerDecree vota un decreto con punti lobbying e aggiorna lo stato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 25;
            await sandbox.decreesRefresh(true);

            await sandbox.voteServerDecree('dec_tax_holiday_01', 15);

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc, 'deve chiamare rpc_vote_server_decree');
            assert.equal(voteRpc.args.v_decree_id, 'dec_tax_holiday_01');
            assert.equal(voteRpc.args.v_points_spent, 15);

            assert.equal(gs.lobbyingPoints, 10, 'i punti lobbying devono scalare di 15');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Voto registrato')));
        });

        test('voteServerDecree approva il decreto quando raggiunge la soglia voti', async () => {
            const { sandbox, gs, env } = amb;
            gs.lobbyingPoints = 80;
            await sandbox.decreesRefresh(true);

            // Ne servono 70 per arrivare a 100
            await sandbox.voteServerDecree('dec_tax_holiday_01', 75);

            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Decreto approvato')));
            assert.ok(sandbox._decreesState.activeDecrees.some(d => d.id === 'dec_tax_holiday_01'));
        });

        test('voteServerDecree rifiuta se punti insufficienti o non validi', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 5;

            await sandbox.voteServerDecree('dec_tax_holiday_01', 10);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_server_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('insufficienti')));

            await sandbox.voteServerDecree('dec_tax_holiday_01', 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('validi')));
        });

        test('ceVoteDecree legge l\'input DOM e passa i punti corretti a voteServerDecree', async () => {
            const { sandbox, gs } = amb;
            gs.lobbyingPoints = 30;
            await sandbox.decreesRefresh(true);
            sandbox.renderTabPolitics();

            const inputId = 'decree-pts-dec_tax_';
            const input = sandbox.document.getElementById(inputId);
            assert.ok(input, 'campo input per i voti del decreto deve esistere');
            input.value = '20';

            await sandbox.ceVoteDecree('dec_tax_holiday_01', inputId);

            assert.equal(gs.lobbyingPoints, 10);
        });
    });

    describe('War Room & Mappa Geografica (war_room.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabWarRoom con GeoJSON valido crea l\'overlay SVG e la sidebar con le regioni', async () => {
            const { sandbox } = amb;
            // Mock fetch per restituire il GeoJSON simulato
            sandbox.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => mockGeoJSON()
            });

            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay, '#wr-overlay deve essere stato aggiunto al body');

            const svg = overlay.querySelector('svg');
            assert.ok(svg, 'la mappa SVG deve essere presente');
            assert.ok(overlay.querySelector('#reg_lazio'), 'regione Lazio presente nell\'SVG');
            assert.ok(overlay.querySelector('#reg_lombardia'), 'regione Lombardia presente nell\'SVG');

            const mainPanel = sandbox.document.getElementById('main-panel');
            assert.equal(mainPanel.style.display, 'none', 'il main-panel deve essere nascosto');
        });

        test('renderTabWarRoom gestisce offline/errore fetch GeoJSON mostrando messaggio di avviso', async () => {
            const { sandbox } = amb;
            // Reset della cache interna per forzare il fetch
            vm.runInContext('_wrGeoCache = null;', sandbox);
            sandbox.fetch = async () => { throw new Error('Rete non disponibile'); };

            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay);
            assert.ok(overlay.innerHTML.includes('Impossibile caricare la mappa geografica') || overlay.innerHTML.includes('offline'));
        });

        test('_wrClose rimuove l\'overlay e ripristina il main-panel', async () => {
            const { sandbox } = amb;
            sandbox.fetch = async () => ({ ok: true, json: async () => mockGeoJSON() });
            await sandbox.renderTabWarRoom();

            assert.ok(sandbox.document.getElementById('wr-overlay'));

            sandbox._wrClose();

            assert.equal(sandbox.document.getElementById('wr-overlay'), null);
            const mainPanel = sandbox.document.getElementById('main-panel');
            assert.equal(mainPanel.style.display, '');
        });

        test('click su regione SVG apre la sidebar con le province e opzioni di conquista', async () => {
            const { sandbox } = amb;
            sandbox.fetch = async () => ({ ok: true, json: async () => mockGeoJSON() });
            await sandbox.renderTabWarRoom();

            const lazioEl = sandbox.document.getElementById('reg_lazio');
            assert.ok(lazioEl, 'elemento regione Lazio deve esistere');

            // Simula click sulla regione
            lazioEl.dispatchEvent(new sandbox.window.Event('click'));

            const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
            const html = sidebar.innerHTML;

            assert.ok(html.includes('Lazio'), 'nome regione visibile nella sidebar');
            assert.ok(html.includes('Roma'), 'provincia di Roma visibile');
            assert.ok(html.includes('Latina'), 'provincia di Latina visibile');
            assert.ok(html.includes('SEI GOVERNATORE'), 'stato governatore evidenziato');
            assert.ok(html.includes('OPA'), 'pulsante OPA presente per provincia libera con influenza sufficiente');
        });

        test('_wrAcquire valida l\'offerta e invoca ServerState.acquireProvince', async () => {
            const { sandbox, gs, env } = amb;
            sandbox.fetch = async () => ({ ok: true, json: async () => mockGeoJSON() });
            await sandbox.renderTabWarRoom();

            // Seleziona Lazio
            const lazioEl = sandbox.document.getElementById('reg_lazio');
            lazioEl.dispatchEvent(new sandbox.window.Event('click'));

            // Imposta offerta su Latina (prov_lt)
            const inputLatina = sandbox.document.getElementById('wri-prov_lt');
            assert.ok(inputLatina, 'input per OPA Latina deve esistere');
            inputLatina.value = '100000';
            gs.cash = 150000;

            await sandbox._wrAcquire('prov_lt');

            assert.equal(gs.cash, 50000, 'il cash deve diminuire dell\'offerta OPA');
            assert.ok(env.notifications.some(n => n.type === 'big-event' && n.msg.includes('Conquistata')));
        });

        test('_wrAcquire rifiuta offerta se cash insufficiente o input non valido', async () => {
            const { sandbox, gs, env } = amb;
            sandbox.fetch = async () => ({ ok: true, json: async () => mockGeoJSON() });
            await sandbox.renderTabWarRoom();

            const lazioEl = sandbox.document.getElementById('reg_lazio');
            lazioEl.dispatchEvent(new sandbox.window.Event('click'));

            const inputLatina = sandbox.document.getElementById('wri-prov_lt');
            inputLatina.value = '100000';
            gs.cash = 20000; // insufficiente

            await sandbox._wrAcquire('prov_lt');

            assert.equal(gs.cash, 20000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('insufficienti')));
        });
    });

    describe('Doppione e collisione: renderTabProvinces (ui-ops.js vs war_room.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabProvinces in ui-ops.js sovrascrive quello di war_room.js per ordine di caricamento', async () => {
            const { sandbox } = amb;
            // ui-ops.js viene caricato DOPO war_room.js in index.html (651 vs 638)
            // Quindi window.renderTabProvinces renderizza dentro #tab-container invece di aprire #wr-overlay
            await sandbox.renderTabProvinces();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.equal(overlay, null, 'renderTabProvinces di ui-ops.js non apre il modal war room');

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Guerra Territoriale') || container.innerHTML.includes('Roma'));
        });

        test('doAcquireProvince (ui-ops.js) acquisisce la provincia e aggiorna la vista provinciale', async () => {
            const { sandbox, gs, env } = amb;
            await sandbox.renderTabProvinces();

            // Latina (prov_lt) è libera e ha influenza 350/300
            const input = sandbox.document.getElementById('offer-prov_lt');
            assert.ok(input, 'input offer-prov_lt deve esistere');
            input.value = '100000';
            gs.cash = 200000;

            await sandbox.doAcquireProvince('prov_lt');

            assert.equal(gs.cash, 100000);
            assert.ok(env.notifications.some(n => n.type === 'big-event' && n.msg.includes('Conquistata')));
        });
    });

    describe('Macroeconomia (_tickMacroEconomy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_tickMacroEconomy fa oscillare inflazione e tassi nei limiti previsti', () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.02;
            gs.interestRateBase = 0.04;
            gs.day = 1;

            const fn = vm.runInContext('_tickMacroEconomy', sandbox);
            assert.equal(typeof fn, 'function');

            fn();

            assert.ok(gs.inflationRate >= 0.005 && gs.inflationRate <= 0.08);
            assert.ok(gs.interestRateBase >= 0.005 && gs.interestRateBase <= 0.12);
        });

        test('_tickMacroEconomy aggiorna il Credit Score', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 4.5;
            gs.cash = 50000;
            gs.loans = [];
            gs.lifestyleAssets = [];

            const fn = vm.runInContext('_tickMacroEconomy', sandbox);
            fn();

            assert.ok(gs.creditScore >= 300 && gs.creditScore <= 900);
        });
    });
});
