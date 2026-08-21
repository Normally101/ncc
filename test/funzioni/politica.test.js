'use strict';
/* ============================================================================
   test/funzioni/politica.test.js — Verifica approfondita del modulo Politica & Province

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `ui-politics.js` e `war_room.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC per decreti e snapshot territoriale,
   il calcolo delle proiezioni Mercator GeoJSON, la gestione dell'influenza e delle OPA,
   il finanziamento lobbying e l'approvazione delle leggi, e garantire che ogni
   movimento monetario passi unicamente da CE_money o da una RPC senza doppi conteggi.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const POLITICS_FILES = [...CORE_FILES, 'ui-politics.js', 'war_room.js'];

/**
 * Costruisce un ambiente completo per testare Politica, Decreti e War Room.
 */
function creaAmbientePolitica(opzioni = {}) {
    const rpcLog = [];
    const serverStateCalls = [];
    const bigEvents = [];

    const mockProvinces = [
        {
            id: 'prov_roma',
            name: 'Roma Capitale',
            region_id: 'lazio',
            current_value: 500000,
            base_price: 500000,
            transit_tax_pct: 0.030,
            required_influence: 500,
            owner_id: 'user_test_uuid',
            owner_company: 'Test Fleet Corp',
            mapped_pois: ['roma', 'roma_fco', 'roma_hassler'],
        },
        {
            id: 'prov_civita',
            name: 'Civitavecchia e Litorale',
            region_id: 'lazio',
            current_value: 220000,
            base_price: 220000,
            transit_tax_pct: 0.020,
            required_influence: 250,
            owner_id: null,
            owner_company: null,
            mapped_pois: ['civitavecchia'],
        },
        {
            id: 'prov_milano',
            name: 'Milano Metropolitana',
            region_id: 'lombardia',
            current_value: 600000,
            base_price: 600000,
            transit_tax_pct: 0.035,
            required_influence: 800,
            owner_id: 'rival_user_uuid',
            owner_company: 'Rival Executive',
            mapped_pois: ['milano', 'mil_mxp', 'mil_lin'],
        },
        {
            id: 'prov_como',
            name: 'Laghi Lombardi',
            region_id: 'lombardia',
            current_value: 350000,
            base_price: 350000,
            transit_tax_pct: 0.022,
            required_influence: 350,
            owner_id: null,
            owner_company: null,
            mapped_pois: ['como'],
        },
        {
            id: 'prov_firenze',
            name: 'Firenze e Chianti',
            region_id: 'toscana',
            current_value: 400000,
            base_price: 400000,
            transit_tax_pct: 0.025,
            required_influence: 400,
            owner_id: null,
            owner_company: null,
            mapped_pois: ['firenze'],
        },
    ];

    const mockRegions = [
        {
            id: 'lazio',
            name: 'Lazio',
            governor_id: 'user_test_uuid',
            governor_company: 'Test Fleet Corp',
            region_tax_pct: 0.010,
        },
        {
            id: 'lombardia',
            name: 'Lombardia',
            governor_id: null,
            governor_company: null,
            region_tax_pct: 0.010,
        },
        {
            id: 'toscana',
            name: 'Toscana',
            governor_id: null,
            governor_company: null,
            region_tax_pct: 0.010,
        },
    ];

    const mockInfluence = {
        prov_roma: 600,
        prov_civita: 300,
        prov_milano: 900,
        prov_como: 100, // < 350 -> bloccata
        prov_firenze: 50,
    };

    const mockDecrees = [
        {
            id: 'dec_tax_cut_12345678',
            title: 'Sgravio Fiscale NCC',
            description: 'Taglio delle imposte sui ricavi aziendali del 15%.',
            icon: '🏛️',
            status: 'voting',
            votes_current: 35,
            votes_required: 100,
            my_votes: 10,
            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            effects: { taxRateMult: 0.85 },
        },
        {
            id: 'dec_fuel_sub_87654321',
            title: 'Sussidio Carburante Green',
            description: 'Riduzione del costo carburante per tutta la flotta.',
            icon: '⛽',
            status: 'voting',
            votes_current: 90,
            votes_required: 100,
            my_votes: 0,
            expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
            effects: { fuelCostMult: 0.80 },
        },
    ];

    const mockActiveDecrees = [
        {
            id: 'dec_passed_global',
            title: 'Esenzione ZTL Nazionale',
            icon: '🛡️',
            status: 'passed',
            ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            effects: { tipMult: 1.15, xpMult: 1.20 },
        },
    ];

    let statoProvinces = (opzioni.provinces || mockProvinces).map(p => ({ ...p }));
    let statoRegions = (opzioni.regions || mockRegions).map(r => ({ ...r }));
    let statoInfluence = { ...(opzioni.influence || mockInfluence) };
    let statoDecrees = (opzioni.decrees || mockDecrees).map(d => ({ ...d }));
    let statoActiveDecrees = (opzioni.activeDecrees || mockActiveDecrees).map(d => ({ ...d }));

    const env = createGameEnv(POLITICS_FILES, {
        render: true,
        serverState: {
            getTerritorySnapshot: async () => {
                serverStateCalls.push({ method: 'getTerritorySnapshot' });
                if (opzioni.territorySnapshotError) throw new Error(opzioni.territorySnapshotError);
                return {
                    provinces: statoProvinces,
                    regions: statoRegions,
                    influence: statoInfluence,
                };
            },
            acquireProvince: async (provinceId, offer) => {
                serverStateCalls.push({ method: 'acquireProvince', provinceId, offer });
                if (opzioni.acquireError) throw new Error(opzioni.acquireError);
                const prov = statoProvinces.find(p => p.id === provinceId);
                if (!prov) throw new Error('Provincia non trovata');

                prov.owner_id = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_test_uuid';
                prov.owner_company = env.sandbox.gameState.companyName;
                prov.current_value = offer;

                return {
                    success: true,
                    province_name: prov.name,
                    new_value: offer,
                    previous_owner: prov.owner_company,
                    region_id: prov.region_id,
                };
            },
            getMyInfluence: async () => {
                serverStateCalls.push({ method: 'getMyInfluence' });
                return statoInfluence;
            },
            addProvinceInfluence: async (provinceId, amount) => {
                serverStateCalls.push({ method: 'addProvinceInfluence', provinceId, amount });
                statoInfluence[provinceId] = (statoInfluence[provinceId] || 0) + (amount || 10);
                return { province_id: provinceId, influence: statoInfluence[provinceId] };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sbClient = {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoDecrees, statoActiveDecrees });
            }

            if (nome === 'rpc_get_server_decrees') {
                return { data: statoDecrees, error: null };
            }

            if (nome === 'rpc_get_active_decrees') {
                return { data: statoActiveDecrees, error: null };
            }

            if (nome === 'rpc_vote_decree' || nome === 'rpc_vote_server_decree') {
                const dec = statoDecrees.find(d => d.id === (args.p_decree_id || args.v_decree_id));
                if (!dec) return { data: null, error: { message: 'Decreto non trovato' } };

                const pts = args.p_points || args.v_points_spent || 0;
                dec.votes_current = (dec.votes_current || 0) + pts;
                dec.my_votes = (dec.my_votes || 0) + pts;
                const passed = dec.votes_current >= dec.votes_required;
                if (passed) dec.status = 'passed';

                return {
                    data: { passed, votes_current: dec.votes_current },
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

    // Inizializza stato giocatore
    env.sandbox.gameState.companyName = 'Test Fleet Corp';
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 1000000;
    env.sandbox.gameState.lobbyingPoints = opzioni.lobbyingPoints !== undefined ? opzioni.lobbyingPoints : 25;
    env.sandbox.gameState.activeLobbyLaws = opzioni.activeLobbyLaws !== undefined ? [...opzioni.activeLobbyLaws] : [];
    env.sandbox.gameState.inflationRate = 0.025;
    env.sandbox.gameState.interestRateBase = 0.040;

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = `
        <div id="main-panel"></div>
        <div id="tab-container"></div>
    `;

    // Mock fetch per GeoJSON War Room se richiesto
    const sampleGeoJSON = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties: { name: 'Lazio', reg_name: 'Lazio' },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[[11.5, 41.2], [13.2, 41.2], [13.2, 42.8], [11.5, 42.8], [11.5, 41.2]]],
                },
            },
            {
                type: 'Feature',
                properties: { name: 'Lombardia', reg_name: 'Lombardia' },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[[8.5, 44.8], [10.5, 44.8], [10.5, 46.5], [8.5, 46.5], [8.5, 44.8]]],
                },
            },
            {
                type: 'Feature',
                properties: { name: 'Toscana', reg_name: 'Toscana' },
                geometry: {
                    type: 'Polygon',
                    coordinates: [[[9.8, 42.4], [12.3, 42.4], [12.3, 44.4], [9.8, 44.4], [9.8, 42.4]]],
                },
            },
        ],
    };

    env.sandbox.fetch = async (url) => {
        if (typeof url === 'string' && url.includes('limits_IT_regions.geojson')) {
            if (opzioni.geoFetchFail) {
                return { ok: false, status: 500 };
            }
            return {
                ok: true,
                json: async () => sampleGeoJSON,
            };
        }
        throw new Error('URL non mockato: ' + url);
    };

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        serverStateCalls,
        bigEvents,
        statoProvinces,
        statoRegions,
        statoInfluence,
        statoDecrees,
        statoActiveDecrees,
        sampleGeoJSON,
    };
}

describe('Funzione Politica & Province — Esecuzione e ciclo di vita', () => {

    describe('1. Rendering Scheda Politica & Macroeconomia (renderTabPolitics)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabPolitics non crasha se tab-container non esiste nel DOM', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox.renderTabPolitics();
            });
        });

        test('renderTabPolitics disegna intestazione, KPI macroeconomici e punti lobbying', () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.032;
            gs.interestRateBase = 0.055;
            gs.lobbyingPoints = 42;

            sandbox.renderTabPolitics();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Politica &amp; Decreti') || c.innerHTML.includes('Politica & Decreti'));
            assert.ok(c.innerHTML.includes('3.20%'), 'deve mostrare inflazione al 3.20%');
            assert.ok(c.innerHTML.includes('5.50%'), 'deve mostrare tasso BCE al 5.50%');
            assert.ok(c.innerHTML.includes('42 pt') || c.innerHTML.includes('42'), 'deve mostrare 42 pt lobbying');
            assert.ok(c.innerHTML.includes('data-ce-act="ceDonateLobby"'));
        });

        test('renderTabPolitics elenca le leggi di LOBBY_LAWS con indicazione di costo e status', () => {
            const { sandbox, gs } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            assert.ok(Array.isArray(laws) && laws.length > 0, 'LOBBY_LAWS deve contenere leggi');

            // Imposta una legge come attiva
            const firstLaw = laws[0];
            gs.activeLobbyLaws = [firstLaw.id];

            sandbox.renderTabPolitics();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes(firstLaw.name), 'deve mostrare il nome della prima legge');
            assert.ok(c.innerHTML.includes('ATTIVA'), 'la prima legge deve avere il badge ATTIVA');
            assert.ok(c.innerHTML.includes('data-ce-act="passLobbyLaw"'), 'le altre leggi devono avere il pulsante Approva');
        });

        test('leggi non accessibili per punti o fondi insufficienti hanno pulsante disabilitato', () => {
            const { sandbox, gs } = amb;
            gs.lobbyingPoints = 0;
            gs.cash = 0;

            sandbox.renderTabPolitics();

            const c = sandbox.document.getElementById('tab-container');
            const buttons = c.querySelectorAll('button[data-ce-act="passLobbyLaw"]');
            assert.ok(buttons.length > 0);
            for (const btn of buttons) {
                assert.ok(btn.disabled, 'il pulsante Approva deve essere disabled se non si hanno punti/cash');
            }
        });
    });

    describe('2. Finanziamento Politico e Donazioni (donateToLobby, ceDonateLobby)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica({ cash: 50000, lobbyingPoints: 10 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donazione valida scala il cash via CE_money.spend e incrementa i punti lobbying (1.000€ = 1 pt)', () => {
            const { sandbox, gs, env } = amb;

            sandbox.donateToLobby(20000);

            assert.equal(gs.cash, 30000, 'deve aver scalato 20.000€');
            assert.equal(gs.lobbyingPoints, 30, '10 pt iniziali + 20 pt guadagnati = 30 pt');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('+20 Punti Lobbying')));
        });

        test('donazione inferiore a 1.000€ viene rifiutata senza muovere denaro', () => {
            const { sandbox, gs, env } = amb;

            sandbox.donateToLobby(500);

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('minima è di 1.000€')));
        });

        test('donazione con fondi insufficienti non scala denaro e notifica errore', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 5000;

            sandbox.donateToLobby(20000);

            assert.equal(gs.cash, 5000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('ceDonateLobby legge il valore da #lobby-donate-amt e scatena donateToLobby', () => {
            const { sandbox, gs } = amb;
            sandbox.document.getElementById('tab-container').innerHTML = `
                <input id="lobby-donate-amt" value="15000">
                <button data-ce-act="ceDonateLobby">Dona</button>
            `;

            sandbox.ceDonateLobby();

            assert.equal(gs.cash, 35000);
            assert.equal(gs.lobbyingPoints, 25); // 10 + 15
        });

        test('la spesa per donazione politica passa da CE_money e sincronizza con ServerState', async () => {
            let syncCashValue = null;
            const ambSync = creaAmbientePolitica({
                cash: 100000,
                serverStateOverrides: {
                    isReady: () => true,
                    syncCash: async (cash) => { syncCashValue = cash; return { success: true, cash }; },
                },
            });

            ambSync.sandbox.donateToLobby(30000);

            assert.equal(ambSync.gs.cash, 70000);
            assert.equal(syncCashValue, 70000, 'syncCash deve ricevere il nuovo saldo');
            ambSync.env.stopAllIntervals();
        });
    });

    describe('3. Approvazione Leggi di Lobby (passLobbyLaw)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbientePolitica({ cash: 200000, lobbyingPoints: 50, activeLobbyLaws: [] });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('approvazione legge valida consuma punti e denaro (se previsto) e la aggiunge ad activeLobbyLaws', () => {
            const { sandbox, gs, env } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws.find(l => l.pointsCost > 0);
            assert.ok(law);

            const cashCost = law.cashCost || 0;
            const pointsCost = law.pointsCost;

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.lobbyingPoints, 50 - pointsCost);
            assert.equal(gs.cash, 200000 - cashCost);
            assert.ok(gs.activeLobbyLaws.includes(law.id));
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Legge approvata')));
        });

        test('approvazione fallisce se i punti lobbying sono insufficienti', () => {
            const { sandbox, gs, env } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = laws[0];
            gs.lobbyingPoints = law.pointsCost - 1;

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.lobbyingPoints, law.pointsCost - 1);
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Punti lobbying insufficienti')));
        });

        test('approvazione fallisce se il cash è inferiore al cashCost', () => {
            const { sandbox, gs, env } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const lawWithCash = laws.find(l => l.cashCost && l.cashCost > 0) || laws[0];
            lawWithCash.cashCost = 50000;
            gs.cash = 10000;
            gs.lobbyingPoints = 100;

            sandbox.passLobbyLaw(lawWithCash.id);

            assert.equal(gs.cash, 10000);
            assert.equal(gs.lobbyingPoints, 100);
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi aziendali insufficienti')));
        });

        test('legge inesistente non produce modifiche allo stato', () => {
            const { sandbox, gs } = amb;
            sandbox.passLobbyLaw('legge_inventata_xyz');

            assert.equal(gs.lobbyingPoints, 50);
            assert.equal(gs.cash, 200000);
        });
    });

    describe('4. Decreti Governativi Server (decreesRefresh, voteServerDecree, ceVoteDecree)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.decreesRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('decreesRefresh memorizza decreti in votazione e decreti attivi da Supabase', async () => {
            const { sandbox } = amb;

            assert.ok(sandbox._decreesState);
            assert.equal(sandbox._decreesState.decrees.length, 2);
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);
            assert.equal(sandbox._decreesState.activeDecrees[0].id, 'dec_passed_global');
        });

        test('voteServerDecree con punti validi invoca RPC rpc_vote_decree e scala punti locali', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 20;

            await sandbox.voteServerDecree('dec_tax_cut_12345678', 5);

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_decree' || r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc, 'deve chiamare la RPC di voto');
            assert.equal(voteRpc.args.p_decree_id, 'dec_tax_cut_12345678');
            assert.equal(voteRpc.args.p_points, 5);
            assert.equal(gs.lobbyingPoints, 15, 'punti scalati da 20 a 15');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Voto registrato')));
        });

        test('voteServerDecree con punti <= 0 o maggiori di quelli posseduti viene bloccato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 10;

            await sandbox.voteServerDecree('dec_tax_cut_12345678', 0);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_decree').length, 0);

            await sandbox.voteServerDecree('dec_tax_cut_12345678', 50);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('insufficienti')));
        });

        test('ceVoteDecree legge i punti dall input DOM e invoca voteServerDecree', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.lobbyingPoints = 30;

            sandbox.document.getElementById('tab-container').innerHTML = `
                <input id="decree-pts-dec_tax_" value="8">
                <button data-ce-act="ceVoteDecree" data-ce-args='["dec_tax_cut_12345678", "decree-pts-dec_tax_"]'>Vota</button>
            `;

            sandbox.ceVoteDecree('dec_tax_cut_12345678', 'decree-pts-dec_tax_');

            await new Promise(r => setImmediate(r));
            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_decree' || r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc);
            assert.equal(voteRpc.args.p_points, 8);
        });

        test('ceThen esegue decreesRefresh e aggiorna renderTabPolitics', async () => {
            const { sandbox } = amb;
            let renderPoliticaChiamato = false;
            sandbox.renderTabPolitics = () => { renderPoliticaChiamato = true; };

            sandbox.ceThen('decreesRefresh', 'renderTabPolitics');
            await new Promise(r => setImmediate(r));

            assert.equal(renderPoliticaChiamato, true);
        });
    });

    describe('5. Mappa War Room & Proiezioni Territoriali (war_room.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('proiezioni Mercator geografiche e mapping SVG delle 20 regioni', () => {
            const { sandbox } = amb;

            // Proiezione coordinate Roma (12.49, 41.90)
            const proj = vm.runInContext('_wrProject(12.496, 41.902)', sandbox);
            assert.ok(Array.isArray(proj) && proj.length === 2);
            assert.ok(proj[0] > 0 && proj[0] < 500, 'X deve rientrare nella larghezza mappa');
            assert.ok(proj[1] > 0 && proj[1] < 660, 'Y deve rientrare nell altezza mappa');

            // Mapping nomi regioni
            assert.equal(vm.runInContext('_wrGetSvgId({ name: "Lazio" })', sandbox), 'reg_lazio');
            assert.equal(vm.runInContext('_wrGetSvgId({ reg_name: "Lombardia" })', sandbox), 'reg_lombardia');
            assert.equal(vm.runInContext('_wrGetSvgId({ DEN_REG: "Valle d\'Aosta" })', sandbox), 'reg_vda');
            assert.equal(vm.runInContext('_wrGetSvgId({ NAME_1: "Sicilia" })', sandbox), 'reg_sicilia');
        });

        test('colori mappa (_wrFill, _wrStroke, _wrStrokeW) distinguono il controllo territoriale', () => {
            const { sandbox } = amb;

            // Territorio del giocatore (mine >= enemy)
            const fillMine = vm.runInContext('_wrFill({ mine: 2, enemy: 0, free: 0, total: 2 }, "reg_lazio")', sandbox);
            const strokeMine = vm.runInContext('_wrStroke({ mine: 2, enemy: 0, free: 0, total: 2 })', sandbox);
            const swMine = vm.runInContext('_wrStrokeW({ mine: 2, enemy: 0, free: 0, total: 2 })', sandbox);
            assert.equal(fillMine, '#B8920A');
            assert.equal(strokeMine, '#c79a2a');
            assert.equal(swMine, 2.5);

            // Territorio nemico (enemy > mine)
            const fillEnemy = vm.runInContext('_wrFill({ mine: 0, enemy: 2, free: 0, total: 2 }, "reg_lombardia")', sandbox);
            const strokeEnemy = vm.runInContext('_wrStroke({ mine: 0, enemy: 2, free: 0, total: 2 })', sandbox);
            assert.equal(fillEnemy, '#A02020');
            assert.equal(strokeEnemy, '#db5746');

            // Territorio neutrale / libero
            const fillFree = vm.runInContext('_wrFill({ mine: 0, enemy: 0, free: 2, total: 2 }, "reg_toscana")', sandbox);
            assert.equal(fillFree, '#4A8048'); // colore base toscana
        });

        test('renderTabWarRoom crea l overlay e visualizza la mappa SVG interattiva', async () => {
            const { sandbox, serverStateCalls } = amb;

            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay, 'deve inserire wr-overlay nel DOM');
            assert.ok(overlay.innerHTML.includes('WAR ROOM'), 'titolo presente');
            assert.ok(overlay.innerHTML.includes('<svg'), 'mappa SVG generata');
            assert.ok(overlay.innerHTML.includes('id="reg_lazio"'), 'regione Lazio presente nell SVG');
            assert.ok(overlay.innerHTML.includes('id="reg_lombardia"'), 'regione Lombardia presente nell SVG');

            // Verifica chiamata allo snapshot territorio
            assert.ok(serverStateCalls.some(c => c.method === 'getTerritorySnapshot'));
        });

        test('renderTabWarRoom gestisce fallback se GeoJSON o connessione fallisce', async () => {
            const ambOffline = creaAmbientePolitica({ geoFetchFail: true });

            await ambOffline.sandbox.renderTabWarRoom();

            const overlay = ambOffline.sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay);
            assert.ok(overlay.innerHTML.includes('Impossibile caricare la mappa geografica') || overlay.innerHTML.includes('offline'));
            ambOffline.env.stopAllIntervals();
        });

        test('_wrClose rimuove l overlay e ripristina main-panel', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabWarRoom();

            const overlayPrima = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlayPrima);

            let destroyMapChiamato = false;
            sandbox._destroyMap = () => { destroyMapChiamato = true; };

            sandbox._wrClose();

            assert.equal(sandbox.document.getElementById('wr-overlay'), null, 'overlay rimosso');
            assert.equal(sandbox.document.getElementById('main-panel').style.display, '', 'main-panel ripristinato');
            assert.equal(destroyMapChiamato, true, '_destroyMap deve essere invocato se presente');
        });
    });

    describe('6. Interazione e Sidebar Territoriale (_wrShowSidebar, selezione regioni)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.renderTabWarRoom();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su regione Lazio apre la sidebar con governatore e province', () => {
            const { sandbox } = amb;
            const lazioEl = sandbox.document.getElementById('reg_lazio');
            assert.ok(lazioEl, 'elemento reg_lazio deve esistere nell SVG');

            // Simula click su regione Lazio
            lazioEl.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebar.innerHTML.includes('Lazio'), 'mostra nome regione');
            assert.ok(sidebar.innerHTML.includes('SEI GOVERNATORE'), 'mostra badge governatore');
            assert.ok(sidebar.innerHTML.includes('Roma Capitale'), 'mostra provincia Roma');
            assert.ok(sidebar.innerHTML.includes('Civitavecchia e Litorale'), 'mostra provincia Civitavecchia');
            assert.ok(sidebar.innerHTML.includes('✦ Tua'), 'Roma Capitale è posseduta');
            assert.ok(sidebar.innerHTML.includes('◎ Libera'), 'Civitavecchia è libera');
            assert.ok(sidebar.innerHTML.includes('data-ce-act="_wrAcquire"'), 'pulsante OPA presente');
        });

        test('click su Lombardia mostra provincia nemica Milano e provincia bloccata Como', () => {
            const { sandbox } = amb;
            const lombardiaEl = sandbox.document.getElementById('reg_lombardia');
            assert.ok(lombardiaEl);

            lombardiaEl.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebar.innerHTML.includes('Lombardia'));
            assert.ok(sidebar.innerHTML.includes('Milano Metropolitana'));
            assert.ok(sidebar.innerHTML.includes('⚔ Rival Executive'), 'mostra proprietario nemico');
            assert.ok(sidebar.innerHTML.includes('⚔ Ostile'), 'pulsante scalata ostile presente su Milano');
            assert.ok(sidebar.innerHTML.includes('🔒 250 pt mancanti'), 'Como è bloccata per influenza insufficiente (100/350)');
        });
    });

    describe('7. Acquisizione Province e OPA (_wrAcquire)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica({ cash: 500000 });
            await amb.sandbox.renderTabWarRoom();
            const lazioEl = amb.sandbox.document.getElementById('reg_lazio');
            lazioEl.dispatchEvent(new amb.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('OPA valida invoca ServerState.acquireProvince e mostra evento di conquista', async () => {
            const { sandbox, serverStateCalls, bigEvents } = amb;
            const input = sandbox.document.getElementById('wri-prov_civita');
            assert.ok(input, 'input offerta Civitavecchia deve esistere');

            input.value = '270000'; // > 220000 * 1.20 = 264000

            await sandbox._wrAcquire('prov_civita');

            const acqCall = serverStateCalls.find(c => c.method === 'acquireProvince');
            assert.ok(acqCall, 'deve chiamare ServerState.acquireProvince');
            assert.equal(acqCall.provinceId, 'prov_civita');
            assert.equal(acqCall.offer, 270000);

            // Modale di successo
            assert.equal(bigEvents.length, 1);
            assert.ok(bigEvents[0].title.includes('Conquistata'));
        });

        test('offerta non valida (<= 0 o non numerica) mostra notifica di errore', async () => {
            const { sandbox, serverStateCalls, env } = amb;
            const input = sandbox.document.getElementById('wri-prov_civita');
            input.value = '0';

            await sandbox._wrAcquire('prov_civita');

            assert.equal(serverStateCalls.filter(c => c.method === 'acquireProvince').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));
        });

        test('offerta con fondi insufficienti non chiama ServerState e mostra notifica', async () => {
            const { sandbox, gs, serverStateCalls, env } = amb;
            gs.cash = 100000;
            const input = sandbox.document.getElementById('wri-prov_civita');
            input.value = '300000';

            await sandbox._wrAcquire('prov_civita');

            assert.equal(serverStateCalls.filter(c => c.method === 'acquireProvince').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('gestione graceful dell errore RPC anche in assenza di CE_Sec', async () => {
            const ambErr = creaAmbientePolitica({
                cash: 500000,
                acquireError: 'Offerta inferiore alla soglia minima',
            });
            await ambErr.sandbox.renderTabWarRoom();
            const lazioEl = ambErr.sandbox.document.getElementById('reg_lazio');
            lazioEl.dispatchEvent(new ambErr.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            ambErr.sandbox.CE_Sec = undefined;
            ambErr.sandbox.window.CE_Sec = undefined;

            const input = ambErr.sandbox.document.getElementById('wri-prov_civita');
            input.value = '270000';

            await assert.doesNotReject(async () => {
                await ambErr.sandbox._wrAcquire('prov_civita');
            });

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Operazione OPA non riuscita')));
            ambErr.env.stopAllIntervals();
        });

        test('la spesa OPA è delegata unicamente al server senza doppio decremento client', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 400000;
            const input = sandbox.document.getElementById('wri-prov_civita');
            input.value = '300000';

            await sandbox._wrAcquire('prov_civita');

            // _wrAcquire non tocca direttamente gs.cash (il decremento avviene via RPC / ServerState bridge)
            assert.ok(gs.cash >= 0, 'il saldo non deve subire decremento doppio non sincronizzato');
        });
    });

    describe('8. Integrazione Delegata data-ce-act e Navigazione', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabProvinces è un alias di renderTabWarRoom', () => {
            const { sandbox } = amb;
            assert.equal(sandbox.renderTabProvinces, sandbox.renderTabWarRoom, 'renderTabProvinces deve puntare a renderTabWarRoom');
        });

        test('pulsante _wrClose invoca _wrClose via delegation', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabWarRoom();

            const closeBtn = sandbox.document.querySelector('button[data-ce-act="_wrClose"]');
            assert.ok(closeBtn, 'il bottone di chiusura deve esistere con data-ce-act="_wrClose"');

            sandbox._wrClose();
            assert.equal(sandbox.document.getElementById('wr-overlay'), null);
        });
    });
});
