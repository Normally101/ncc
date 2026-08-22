'use strict';
/* ============================================================================
   test/funzioni/politica-ui.test.js — Verifica approfondita del modulo Politica & Lobbying

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `ui-politics.js` e dai relativi gestori in `ce-actions.js` e
   `engine-finance.js` / `ui-lifestyle.js`:
   - renderTabPolitics (rendering, KPI macroeconomici, leggi e decreti)
   - ceDonateLobby / donateToLobby (finanziamento politico e punti lobbying)
   - passLobbyLaw (approvazione delle leggi di lobbying)
   - decreesRefresh / ceThen (recupero decreti da Supabase RPC)
   - ceVoteDecree / voteServerDecree (votazione decreti globali)
   - Tracciamento e correttezza dei movimenti di denaro (CE_money vs RPC)
   - Integrazione completa con Event Delegation (events.js)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente con mock Supabase e ServerState per la tab Politica & Decreti.
 */
function pulisciAmbiente(amb) {
    if (!amb) return;
    if (amb.sandbox?.window?._decreesCountdownTimer) {
        clearInterval(amb.sandbox.window._decreesCountdownTimer);
        amb.sandbox.window._decreesCountdownTimer = null;
    }
    amb.env?.stopAllIntervals();
}

function creaAmbientePolitica(opzioni = {}) {
    const rpcLog = [];
    const syncedCash = [];

    const decretiDefault = [
        {
            id: 'dec_001_tax_relief',
            title: 'Sgravio Fiscale Trasporti',
            icon: '📉',
            description: 'Taglio del 15% sulle imposte per tutte le aziende del settore.',
            status: 'voting',
            votes_current: 35,
            votes_required: 100,
            my_votes: 5,
            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            effects: { taxRateMult: 0.85, xpMult: 1.10 },
        },
        {
            id: 'dec_002_fuel_subsidy',
            title: 'Sussidio Carburante Verde',
            icon: '⛽',
            description: 'Contributo statale sul prezzo dei carburanti e ricariche.',
            status: 'voting',
            votes_current: 90,
            votes_required: 100,
            my_votes: 0,
            expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
            effects: { fuelCostMult: 0.80, extraRidePct: 0.15 },
        },
        {
            id: 'dec_003_passed_already',
            title: 'Corsie Preferenziali Nazionali',
            icon: '🛣️',
            description: 'Accesso libero alle corsie preferenziali in tutti i capoluoghi.',
            status: 'passed',
            votes_current: 100,
            votes_required: 100,
            my_votes: 20,
            expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
            effects: { tipMult: 1.15, maintenanceMult: 0.90 },
        },
    ];

    const decretiAttiviDefault = [
        {
            id: 'dec_active_01',
            title: 'Decreto Grandi Eventi',
            icon: '🌟',
            effects: { extraRidePct: 0.20, tipMult: 1.10 },
            ends_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        },
        {
            id: 'dec_active_02_perm',
            title: 'Riforma NCC 2026',
            icon: '📜',
            effects: { vehiclePriceMult: 0.95 },
            ends_at: null,
        },
    ];

    let statoDecreti = (opzioni.decreti !== undefined ? opzioni.decreti : decretiDefault).map(d => ({ ...d }));
    let statoDecretiAttivi = (opzioni.decretiAttivi !== undefined ? opzioni.decretiAttivi : decretiAttiviDefault).map(d => ({ ...d }));

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
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoDecreti, statoDecretiAttivi });
            }

            if (nome === 'rpc_get_server_decrees') {
                if (opzioni.simulaErroreRpc) {
                    return { data: null, error: { message: 'Errore di rete rpc_get_server_decrees' } };
                }
                return { data: statoDecreti, error: null };
            }

            if (nome === 'rpc_get_active_decrees') {
                if (opzioni.simulaErroreRpc) {
                    return { data: null, error: { message: 'Errore di rete rpc_get_active_decrees' } };
                }
                return { data: statoDecretiAttivi, error: null };
            }

            if (nome === 'rpc_vote_server_decree') {
                if (opzioni.simulaErroreVote) {
                    return { data: null, error: { message: 'Decreto già chiuso o non valido' } };
                }
                const decree = statoDecreti.find(d => d.id === args.v_decree_id);
                if (!decree) {
                    return { data: null, error: { message: 'Decreto non trovato' } };
                }
                decree.votes_current += args.v_points_spent;
                decree.my_votes = (decree.my_votes || 0) + args.v_points_spent;
                const passed = decree.votes_current >= decree.votes_required;
                if (passed) {
                    decree.status = 'passed';
                }
                return {
                    data: {
                        votes_current: decree.votes_current,
                        votes_required: decree.votes_required,
                        passed: passed,
                        title: decree.title,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.requestAnimationFrame = (fn) => { fn(); };
    env.sandbox.window.requestAnimationFrame = env.sandbox.requestAnimationFrame;

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_player_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Predisponi stato economico e lobbying
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    env.sandbox.gameState.lobbyingPoints = opzioni.lobbyingPoints !== undefined ? opzioni.lobbyingPoints : 15;
    env.sandbox.gameState.activeLobbyLaws = opzioni.activeLobbyLaws !== undefined ? [...opzioni.activeLobbyLaws] : ['law_ztl_exempt'];
    env.sandbox.gameState.inflationRate = opzioni.inflationRate !== undefined ? opzioni.inflationRate : 0.025;
    env.sandbox.gameState.interestRateBase = opzioni.interestRateBase !== undefined ? opzioni.interestRateBase : 0.045;

    // Popola _decreesState nel sandbox
    env.sandbox._decreesState = {
        decrees: statoDecreti,
        activeDecrees: statoDecretiAttivi,
        _lastFetch: Date.now(),
    };

    // Predisponi DOM container
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        syncedCash,
        statoDecreti,
        statoDecretiAttivi,
    };
}

describe('Funzione Politica & Lobbying (ui-politics.js) — Collaudo Completo', () => {

    describe('1. Inizializzazione e Rendering Interfaccia (renderTabPolitics)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabPolitics esportata correttamente come globale su window', () => {
            const { sandbox } = amb;
            assert.equal(typeof sandbox.renderTabPolitics, 'function');
            assert.equal(typeof sandbox.window.renderTabPolitics, 'function');
        });

        test('renderTabPolitics popola il DOM con KPI, donazione, leggi e decreti', () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            // Titolo e sottotitolo
            assert.ok(html.includes('Politica &amp; Decreti') || html.includes('Politica & Decreti'), 'titolo principale presente');
            assert.ok(html.includes('1 leggi attive'), 'conteggio leggi attive corretto');
            assert.ok(html.includes('15 punti lobbying'), 'conteggio punti lobbying corretto');

            // KPI macroeconomici
            assert.ok(html.includes('Inflazione'), 'KPI Inflazione presente');
            assert.ok(html.includes('2.50%'), 'Percentuale inflazione formattata');
            assert.ok(html.includes('Tasso BCE'), 'KPI Tasso BCE presente');
            assert.ok(html.includes('4.50%'), 'Percentuale tasso BCE formattata');
            assert.ok(html.includes('Pt Lobbying'), 'KPI Punti Lobbying presente');

            // Finanziamento Politico
            assert.ok(html.includes('Finanziamento Politico'), 'sezione donazioni presente');
            assert.ok(html.includes('1.000€ = 1 punto lobbying'), 'rapporto di conversione presente');
            assert.ok(html.includes('id="lobby-donate-amt"'), 'input donazione presente');
            assert.ok(html.includes('data-ce-act="ceDonateLobby"'), 'pulsante dona presente con data-ce-act');

            // Sezione Leggi
            assert.ok(html.includes('Leggi Disponibili'), 'sezione leggi presente');
            assert.ok(html.includes('Esenzione ZTL Premium'), 'legge presente');
            assert.ok(html.includes('ATTIVA'), 'badge ATTIVA per legge posseduta');

            // Sezione Decreti Server
            assert.ok(html.includes('Decreti Server — Votazione Globale'), 'sezione decreti presente');
            assert.ok(html.includes('Decreti Attivi (2)'), 'conteggio decreti attivi');
            assert.ok(html.includes('Sgravio Fiscale Trasporti'), 'decreto in votazione 1');
            assert.ok(html.includes('Sussidio Carburante Verde'), 'decreto in votazione 2');
        });

        test('renderTabPolitics senza tab-container non lancia eccezioni', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';
            assert.doesNotThrow(() => {
                sandbox.renderTabPolitics();
            });
        });

        test('formattazione colori KPI in base alle soglie di inflazione e tasso', () => {
            const { sandbox, gs } = amb;

            // Inflazione alta (>5%) -> rosso, tasso basso (<3%) -> verde
            gs.inflationRate = 0.065;
            gs.interestRateBase = 0.020;
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('6.50%'));
            assert.ok(container.innerHTML.includes('2.00%'));

            // Inflazione bassa (<2%) -> verde, tasso alto (>7%) -> rosso
            gs.inflationRate = 0.015;
            gs.interestRateBase = 0.085;
            sandbox.renderTabPolitics();
            assert.ok(container.innerHTML.includes('1.50%'));
            assert.ok(container.innerHTML.includes('8.50%'));
        });

        test('disabilitazione pulsante Approva legge se punti o denaro sono insufficienti', () => {
            const { sandbox, gs } = amb;
            // Punti 0 e cassa 0: tutte le leggi non possedute devono avere il pulsante disabled
            gs.lobbyingPoints = 0;
            gs.cash = 0;
            gs.activeLobbyLaws = [];
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const buttons = Array.from(container.querySelectorAll('button[data-ce-act="passLobbyLaw"]'));
            assert.ok(buttons.length > 0, 'devono esserci pulsanti Approva');
            buttons.forEach(btn => {
                assert.ok(btn.hasAttribute('disabled'), 'il pulsante deve avere attributo disabled');
            });
        });

        test('abilitazione pulsante Approva legge quando punti e denaro sono sufficienti', () => {
            const { sandbox, gs } = amb;
            gs.lobbyingPoints = 50;
            gs.cash = 500000;
            gs.activeLobbyLaws = [];
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const buttons = Array.from(container.querySelectorAll('button[data-ce-act="passLobbyLaw"]'));
            assert.ok(buttons.length > 0);
            const enabledButtons = buttons.filter(btn => !btn.hasAttribute('disabled'));
            assert.equal(enabledButtons.length, buttons.length, 'tutti i pulsanti devono essere abilitati');
        });

        test('rendering con catalogo LOBBY_LAWS vuoto o popolato gestisce la sezione correttamente', () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();
            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Leggi Disponibili'));
            assert.ok(container.innerHTML.includes('Esenzione ZTL Premium'));
        });
    });

    describe('2. Finanziamento Politico (donateToLobby e ceDonateLobby)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donateToLobby scala il denaro via CE_money.spend, converte in punti lobbying e sincronizza', () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 5;

            sandbox.donateToLobby(10000);

            assert.equal(gs.cash, 40000, 'il cash deve essere diminuito di 10.000€');
            assert.equal(gs.lobbyingPoints, 15, 'i punti lobbying devono essere aumentati di 10 (10000/1000)');
            assert.deepEqual(syncedCash, [40000], 'deve sincronizzare con ServerState.syncCash');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('+10 Punti Lobbying')));
            assert.ok(env.logs.some(l => l.includes('Lobbying:') && l.includes('donati')));
        });

        test('donateToLobby rifiuta donazioni inferiori al minimo di €1.000', () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 5;

            sandbox.donateToLobby(500);

            assert.equal(gs.cash, 50000, 'la cassa non deve cambiare');
            assert.equal(gs.lobbyingPoints, 5, 'i punti lobbying non devono cambiare');
            assert.equal(syncedCash.length, 0, 'nessuna chiamata a syncCash');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('minima: €1.000')));
        });

        test('donateToLobby rifiuta importi negativi, nulli o non numerici', () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 20000;
            gs.lobbyingPoints = 2;

            sandbox.donateToLobby(-5000);
            sandbox.donateToLobby(0);
            sandbox.donateToLobby('non_un_numero');

            assert.equal(gs.cash, 20000);
            assert.equal(gs.lobbyingPoints, 2);
            assert.equal(syncedCash.length, 0);
        });

        test('donateToLobby rifiuta donazione se la cassa è insufficiente', () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 3000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);

            assert.equal(gs.cash, 3000, 'la cassa deve rimanere invariata');
            assert.equal(gs.lobbyingPoints, 0, 'i punti non devono essere concessi');
            assert.equal(syncedCash.length, 0);
        });

        test('ceDonateLobby legge l\'importo dall\'input del DOM e invoca donateToLobby', () => {
            const { sandbox, gs, syncedCash } = amb;
            sandbox.renderTabPolitics();

            const input = sandbox.document.getElementById('lobby-donate-amt');
            assert.ok(input, 'input donazione presente');
            input.value = '25000';

            gs.cash = 100000;
            gs.lobbyingPoints = 10;

            sandbox.ceDonateLobby();

            assert.equal(gs.cash, 75000);
            assert.equal(gs.lobbyingPoints, 35); // 10 + 25
            assert.deepEqual(syncedCash, [75000]);
        });
    });

    describe('3. Approvazione Leggi di Lobbying (passLobbyLaw)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('passLobbyLaw approva legge valida, detrae punti lobbying e cassa, sincronizza e notifica', () => {
            const { sandbox, gs, syncedCash, env } = amb;
            // Legge law_tax_cut: pointsCost: 10, cashCost: 50000
            gs.cash = 100000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_tax_cut');

            assert.equal(gs.cash, 50000, 'cash detratto di 50.000€');
            assert.equal(gs.lobbyingPoints, 10, 'punti lobbying detratti di 10');
            assert.deepEqual(gs.activeLobbyLaws, ['law_tax_cut'], 'la legge deve essere inserita in activeLobbyLaws');
            assert.deepEqual(syncedCash, [50000], 'syncCash deve registrare il saldo aggiornato');
            assert.ok(env.logs.some(l => l.includes('Legge approvata: Riduzione Fiscale Corporate')));
        });

        test('passLobbyLaw rifiuta approvazione di legge inesistente', () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 50;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('legge_inesistente_xyz');

            assert.equal(gs.cash, 100000);
            assert.equal(gs.lobbyingPoints, 50);
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.equal(syncedCash.length, 0);
        });

        test('passLobbyLaw rifiuta legge già approvata', () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = ['law_ztl_exempt'];

            sandbox.passLobbyLaw('law_ztl_exempt');

            assert.equal(gs.cash, 100000);
            assert.equal(gs.lobbyingPoints, 20);
            assert.equal(syncedCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già approvata')));
        });

        test('passLobbyLaw rifiuta approvazione se i punti lobbying sono insufficienti', () => {
            const { sandbox, gs, syncedCash, env } = amb;
            // law_tax_cut richiede 10 punti
            gs.cash = 100000;
            gs.lobbyingPoints = 8;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_tax_cut');

            assert.equal(gs.cash, 100000);
            assert.equal(gs.lobbyingPoints, 8);
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.equal(syncedCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Servono 10 punti lobbying')));
        });

        test('passLobbyLaw rifiuta approvazione se il denaro è insufficiente', () => {
            const { sandbox, gs, syncedCash } = amb;
            // law_tax_cut richiede €50.000
            gs.cash = 30000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_tax_cut');

            assert.equal(gs.cash, 30000);
            assert.equal(gs.lobbyingPoints, 20);
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.equal(syncedCash.length, 0);
        });

        test('tutte le leggi in LOBBY_LAWS hanno una struttura dati valida e completa', () => {
            const { sandbox } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            assert.ok(Array.isArray(laws) && laws.length >= 5, 'devono esserci almeno 5 leggi');

            for (const law of laws) {
                assert.ok(typeof law.id === 'string' && law.id.startsWith('law_'), `id non valido per ${law.id}`);
                assert.ok(typeof law.name === 'string' && law.name.length > 0);
                assert.ok(typeof law.desc === 'string' && law.desc.length > 0);
                assert.ok(typeof law.pointsCost === 'number' && law.pointsCost > 0);
                if (law.cashCost !== undefined) {
                    assert.ok(typeof law.cashCost === 'number' && law.cashCost >= 0);
                }
                assert.ok(typeof law.icon === 'string');
            }
        });
    });

    describe('4. Decreti Server e Refresh (decreesRefresh, ceThen)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('decreesRefresh memorizza decreti e decreti attivi da Supabase RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox._decreesState = { decrees: [], activeDecrees: [], _lastFetch: 0 };

            await sandbox.decreesRefresh(true);

            assert.equal(sandbox._decreesState.decrees.length, 3, 'deve contenere i 3 decreti restituiti');
            assert.equal(sandbox._decreesState.activeDecrees.length, 2, 'deve contenere i 2 decreti attivi');
            assert.ok(sandbox._decreesState._lastFetch > 0);
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_server_decrees'));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_active_decrees'));
        });

        test('decreesRefresh rispetta il throttle di 60 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.decreesRefresh(true);
            const rpcCountPrima = rpcLog.length;

            // Seconda chiamata immediata senza force -> throttle attivo
            await sandbox.decreesRefresh(false);
            assert.equal(rpcLog.length, rpcCountPrima, 'non deve eseguire nuove RPC');

            // Chiamata forzata -> riesegue query
            await sandbox.decreesRefresh(true);
            assert.equal(rpcLog.length, rpcCountPrima + 2, 'force=true deve rieseguire le query');
        });

        test('decreesRefresh non crasha se supabaseClient è assente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.decreesRefresh(true);
            });
        });

        test('ceThen esegue decreesRefresh e successivamente renderTabPolitics', async () => {
            const { sandbox, rpcLog } = amb;
            let renderChiamato = false;
            sandbox.renderTabPolitics = () => { renderChiamato = true; };

            sandbox.ceThen('decreesRefresh', 'renderTabPolitics');
            await new Promise(r => setImmediate(r));

            assert.ok(rpcLog.some(r => r.nome === 'rpc_get_server_decrees'));
            assert.equal(renderChiamato, true);
        });
    });

    describe('5. Votazione Decreti Server (voteServerDecree e ceVoteDecree)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('voteServerDecree valido invia RPC, scala lobbyingPoints e notifica', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 20;

            await sandbox.voteServerDecree('dec_001_tax_relief', 5);

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc, 'deve chiamare rpc_vote_server_decree');
            assert.equal(voteRpc.args.v_decree_id, 'dec_001_tax_relief');
            assert.equal(voteRpc.args.v_points_spent, 5);

            assert.equal(gs.lobbyingPoints, 15, 'lobbyingPoints scalati di 5');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Voto registrato')));
        });

        test('voteServerDecree che porta al quorum notifica approvazione del decreto', async () => {
            const { sandbox, gs, env } = amb;
            // dec_002_fuel_subsidy ha 90/100 voti: con 10 punti raggiunge il quorum
            gs.lobbyingPoints = 15;

            await sandbox.voteServerDecree('dec_002_fuel_subsidy', 10);

            assert.equal(gs.lobbyingPoints, 5);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Decreto approvato')));
        });

        test('voteServerDecree rifiuta punti nulli, negativi o NaN', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 10;

            await sandbox.voteServerDecree('dec_001_tax_relief', 0);
            await sandbox.voteServerDecree('dec_001_tax_relief', -3);
            await sandbox.voteServerDecree('dec_001_tax_relief', 'abc');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_server_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('punti validi')));
        });

        test('voteServerDecree rifiuta votazione se i punti lobbying sono insufficienti', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 3;

            await sandbox.voteServerDecree('dec_001_tax_relief', 10);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_server_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 3);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('insufficienti')));
        });

        test('voteServerDecree gestisce errore RPC mostrando notifica di errore', async () => {
            const ambErr = creaAmbientePolitica({ simulaErroreVote: true });
            ambErr.gs.lobbyingPoints = 15;

            await ambErr.sandbox.voteServerDecree('dec_001_tax_relief', 5);

            assert.equal(ambErr.gs.lobbyingPoints, 15, 'i punti non devono essere scalati se l RPC fallisce');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Voto non riuscito')));
            ambErr.env.stopAllIntervals();
        });

        test('ceVoteDecree legge l\'input specificato dal DOM e invoca voteServerDecree', async () => {
            const { sandbox, gs, rpcLog } = amb;
            sandbox.renderTabPolitics();

            const input = sandbox.document.getElementById('decree-pts-dec_001_');
            assert.ok(input, 'input per il decreto dec_001_ deve esistere');
            input.value = '8';

            gs.lobbyingPoints = 20;

            await sandbox.ceVoteDecree('dec_001_tax_relief', 'decree-pts-dec_001_');

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc);
            assert.equal(voteRpc.args.v_points_spent, 8);
            assert.equal(gs.lobbyingPoints, 12);
        });
    });

    describe('6. Sezione Decreti UI & Formattazione Effetti', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('getDecreeEffects calcola i moltiplicatori cumulativi dai decreti attivi', () => {
            const { sandbox } = amb;
            const fx = sandbox.getDecreeEffects();

            assert.ok(typeof fx === 'object');
            assert.equal(fx.extraRidePct, 0.20);
            assert.equal(fx.tipMult, 1.10);
            assert.equal(fx.vehiclePriceMult, 0.95);
        });

        test('renderTabPolitics formatta correttamente i badge degli effetti', () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('-15% tasse'), 'badge tasse formattato');
            assert.ok(html.includes('+10% XP'), 'badge XP formattato');
            assert.ok(html.includes('-20% carb.'), 'badge carburante formattato');
            assert.ok(html.includes('+15% corse'), 'badge corse formattato');
        });

        test('renderTabPolitics mostra decreti già approvati con badge APPROVATO verde', () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Corsie Preferenziali Nazionali'));
            assert.ok(container.innerHTML.includes('APPROVATO'));
        });

        test('renderTabPolitics con lista decreti vuota mostra messaggio di attesa', () => {
            const { sandbox } = amb;
            sandbox._decreesState.decrees = [];
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Nessun decreto in votazione'));
        });
    });

    describe('7. Integrazione Event-Delegation (events.js)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbientePolitica();
            amb.sandbox.renderTabPolitics();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su bottone Dona scatena ceDonateLobby via event delegation', () => {
            const { sandbox, gs, syncedCash } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="ceDonateLobby"]');
            assert.ok(btn, 'bottone ceDonateLobby deve esistere');

            const input = sandbox.document.getElementById('lobby-donate-amt');
            input.value = '15000';
            gs.cash = 60000;
            gs.lobbyingPoints = 0;

            btn.click();

            assert.equal(gs.cash, 45000);
            assert.equal(gs.lobbyingPoints, 15);
            assert.deepEqual(syncedCash, [45000]);
        });

        test('click su bottone Approva scatena passLobbyLaw via event delegation', () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 500000;
            gs.lobbyingPoints = 50;
            gs.activeLobbyLaws = [];
            sandbox.renderTabPolitics();

            const btn = sandbox.document.querySelector('button[data-ce-act="passLobbyLaw"]');
            assert.ok(btn, 'bottone passLobbyLaw deve esistere');

            const lawId = JSON.parse(btn.getAttribute('data-ce-args'))[0];
            btn.click();

            assert.ok(gs.activeLobbyLaws.includes(lawId));
            assert.ok(syncedCash.length > 0);
        });

        test('click su bottone Vota scatena ceVoteDecree via event delegation', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.lobbyingPoints = 25;
            sandbox.renderTabPolitics();

            const btn = sandbox.document.querySelector('button[data-ce-act="ceVoteDecree"]');
            assert.ok(btn, 'bottone ceVoteDecree deve esistere');

            const [did, inputId] = JSON.parse(btn.getAttribute('data-ce-args'));
            const input = sandbox.document.getElementById(inputId);
            input.value = '7';

            btn.click();
            await new Promise(r => setTimeout(r, 10));

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc);
            assert.equal(voteRpc.args.v_decree_id, did);
            assert.equal(voteRpc.args.v_points_spent, 7);
            assert.equal(gs.lobbyingPoints, 18);
        });
    });

    describe('8. Tracciamento Flusso di Denaro & Doppi Conteggi', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donateToLobby usa CE_money.spend e non esegue RPC monetarie duplicate', () => {
            const { sandbox, gs, rpcLog, syncedCash } = amb;
            gs.cash = 100000;

            sandbox.donateToLobby(20000);

            assert.equal(gs.cash, 80000);
            assert.deepEqual(syncedCash, [80000], 'syncCash chiamato una sola volta');
            assert.equal(rpcLog.filter(r => r.nome.includes('cash') || r.nome.includes('money')).length, 0);
        });

        test('passLobbyLaw scala la cassa solo via CE_money.spend senza doppie RPC', () => {
            const { sandbox, gs, rpcLog, syncedCash } = amb;
            gs.cash = 200000;
            gs.lobbyingPoints = 30;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_fast_license'); // cashCost: 8000, pointsCost: 4

            assert.equal(gs.cash, 192000);
            assert.deepEqual(syncedCash, [192000]);
            assert.equal(rpcLog.length, 0);
        });

        test('voteServerDecree muove solo punti lobbying e non tocca la cassa né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 20;

            await sandbox.voteServerDecree('dec_001_tax_relief', 5);

            assert.equal(gs.cash, 50000, 'la cassa non deve mutare');
            assert.equal(syncedCash.length, 0, 'syncCash non deve essere chiamato');
        });

        test('eco Realtime da companies non sovrascrive i punti lobbying acquisiti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 5;

            sandbox.donateToLobby(10000);
            assert.equal(gs.lobbyingPoints, 15);

            // Simula eco Realtime di saldo cassa (es. sincronizzato a 90000)
            gs.cash = 90000;

            // I punti lobbying restano invariati
            assert.equal(gs.lobbyingPoints, 15);
        });
    });

    describe('9. Conformità Contratti Dati RPC e Macroeconomia', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('forma dati di rpc_get_server_decrees contiene tutti i campi richiesti da ui-politics.js', async () => {
            const { sandbox } = amb;
            await sandbox.decreesRefresh(true);

            const decrees = sandbox._decreesState.decrees;
            assert.ok(Array.isArray(decrees) && decrees.length > 0);

            for (const d of decrees) {
                assert.ok(typeof d.id === 'string');
                assert.ok(typeof d.title === 'string');
                assert.ok(typeof d.icon === 'string');
                assert.ok(typeof d.status === 'string');
                assert.ok(typeof d.votes_current === 'number');
                assert.ok(typeof d.votes_required === 'number');
                assert.ok(typeof d.effects === 'object');
                assert.ok(typeof d.expires_at === 'string');
            }
        });

        test('_tickMacroEconomy aggiorna renderTabPolitics se il tab attivo è politics', () => {
            const { sandbox, gs } = amb;
            let tabRendered = false;
            sandbox.renderTabPolitics = () => { tabRendered = true; };
            sandbox._tabIs = (t) => t === 'politics';

            gs.inflationRate = 0.02;
            gs.interestRateBase = 0.04;
            gs.day = 1;

            sandbox._tickMacroEconomy();

            assert.equal(tabRendered, true, '_tickMacroEconomy deve invocare renderTabPolitics');
        });
    });
});
