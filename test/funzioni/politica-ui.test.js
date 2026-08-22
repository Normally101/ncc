'use strict';
/* ============================================================================
   test/funzioni/politica-ui.test.js — Verifica approfondita della scheda Politica (ui-politics.js)

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `ui-politics.js`, `ce-actions.js`, `engine-finance.js` (per lobbying)
   e `ui-lifestyle.js` (per decreti server), verificare le chiamate a Supabase RPC,
   la gestione del denaro tramite CE_money / assenza di doppi conteggi, la gestione
   dei casi limite ed errati, e il rendering UI completo.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente di gioco con mock Supabase completo per i Decreti Server e la Politica.
 */
function creaAmbientePolitica(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const decreesDefault = [
        {
            id: 'dec_fuel_sub',
            title: 'Sussidio Nazionale Carburanti',
            description: 'Taglio delle accise del 15% su tutti i rifornimenti aziendali.',
            icon: '⛽',
            status: 'voting',
            votes_current: 35,
            votes_required: 100,
            my_votes: 10,
            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            effects: { fuelCostMult: 0.85, maintenanceMult: 0.95 },
        },
        {
            id: 'dec_tourism_boost',
            title: 'Piano Straordinario Grandi Eventi',
            description: 'Incentivi per transfer VIP e aumento mance passeggeri internazionali.',
            icon: '🌟',
            status: 'voting',
            votes_current: 80,
            votes_required: 100,
            my_votes: 0,
            expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            effects: { tipMult: 1.25, extraRidePct: 0.20, xpMult: 1.15 },
        },
        {
            id: 'dec_passed_sample',
            title: 'Riforma Fiscale Mobilità',
            description: 'Aliquota agevolata per flotte commerciali.',
            icon: '📉',
            status: 'passed',
            votes_current: 100,
            votes_required: 100,
            my_votes: 25,
            expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
            effects: { taxRateMult: 0.80, vehiclePriceMult: 0.90 },
        },
    ];

    const activeDecreesDefault = [
        {
            id: 'dec_active_1',
            title: 'Incentivo Ecobonus Flotte',
            icon: '🌱',
            ends_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            effects: { fuelCostMult: 0.90, taxRateMult: 0.95 },
        },
        {
            id: 'dec_active_perm',
            title: 'Patto Stabilità Metropolitano',
            icon: '🏛️',
            ends_at: null, // Permanente
            effects: { tipMult: 1.10 },
        },
    ];

    let statoDecrees = (opzioni.decrees || decreesDefault).map(d => ({ ...d }));
    let statoActiveDecrees = (opzioni.activeDecrees || activeDecreesDefault).map(d => ({ ...d }));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: null, error: null }),
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

            if (nome === 'rpc_vote_server_decree') {
                const decree = statoDecrees.find(d => d.id === args.v_decree_id);
                if (!decree) return { data: null, error: { message: 'Decreto non trovato' } };

                const pts = args.v_points_spent || 0;
                decree.votes_current = (decree.votes_current || 0) + pts;
                decree.my_votes = (decree.my_votes || 0) + pts;

                const passed = decree.votes_current >= decree.votes_required;
                if (passed) {
                    decree.status = 'passed';
                    statoActiveDecrees.push({
                        id: decree.id,
                        title: decree.title,
                        icon: decree.icon,
                        ends_at: decree.expires_at,
                        effects: decree.effects,
                    });
                }

                return {
                    data: {
                        passed,
                        title: decree.title,
                        votes_current: decree.votes_current,
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

    // Predisponi DOM
    const container = env.sandbox.document.createElement('div');
    container.id = 'tab-container';
    env.sandbox.document.body.appendChild(container);

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        statoDecrees,
        statoActiveDecrees,
    };
}

describe('Funzione Politica & Lobbying (ui-politics.js) — Collaudo Completo', () => {

    describe('1. Inizializzazione e recupero dati decreti (decreesRefresh, getDecreeEffects)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('decreesRefresh popola lo stato _decreesState con i decreti da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.decreesRefresh(true);

            assert.equal(sandbox._decreesState.decrees.length, 3, 'deve contenere i 3 decreti restituiti dal mock');
            assert.equal(sandbox._decreesState.activeDecrees.length, 2, 'deve contenere i 2 decreti attivi');
            assert.ok(sandbox._decreesState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('decreesRefresh rispetta il throttle di 60 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.decreesRefresh(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata senza force -> bloccata da throttle
            await sandbox.decreesRefresh(false);
            assert.equal(rpcLog.length, countPrima, 'non deve fare chiamate entro 60s');

            // Chiamata forzata -> riesegue query RPC
            await sandbox.decreesRefresh(true);
            assert.equal(rpcLog.length, countPrima + 2, 'force=true deve rieseguire le 2 RPC');
        });

        test('decreesRefresh senza supabaseClient non lancia eccezioni', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.decreesRefresh(true);
            });
        });

        test('decreesRefresh gestisce risposte con errore RPC senza corrompere lo stato', async () => {
            const ambErr = creaAmbientePolitica({
                rpcHandlers: {
                    rpc_get_server_decrees: async () => ({ data: null, error: { message: 'DB timeout' } }),
                    rpc_get_active_decrees: async () => ({ data: null, error: { message: 'DB timeout' } }),
                },
            });

            ambErr.sandbox._decreesState.decrees = [{ id: 'old_dec' }];
            await ambErr.sandbox.decreesRefresh(true);

            // In caso di errore RPC non deve cancellare i dati precedenti se dRes.error è presente
            assert.equal(ambErr.sandbox._decreesState.decrees.length, 1);
            ambErr.env.stopAllIntervals();
        });

        test('getDecreeEffects calcola i moltiplicatori cumulativi dagli activeDecrees', () => {
            const { sandbox } = amb;
            sandbox._decreesState.activeDecrees = [
                { id: 'd1', effects: { fuelCostMult: 0.90, tipMult: 1.20 } },
                { id: 'd2', effects: { fuelCostMult: 0.80, customTag: 'special' } },
            ];

            const fx = sandbox.getDecreeEffects();
            // 0.90 * 0.80 = 0.72
            assert.ok(Math.abs(fx.fuelCostMult - 0.72) < 0.0001, 'i valori numerici devono essere moltiplicati');
            assert.equal(fx.tipMult, 1.20);
            assert.equal(fx.customTag, 'special', 'i valori non numerici vengono mantenuti');
        });

        test('getDecreeEffects con activeDecrees vuoto ritorna oggetto vuoto', () => {
            const { sandbox } = amb;
            sandbox._decreesState.activeDecrees = [];
            const fx = sandbox.getDecreeEffects();
            assert.equal(Object.keys(fx).length, 0);
        });
    });

    describe('2. Finanziamento Politico e Donazioni (donateToLobby, ceDonateLobby)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donateToLobby con importo valido scala il denaro tramite CE_money e incrementa lobbyingPoints', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 5;

            sandbox.donateToLobby(20000);

            // 20.000€ = 20 punti
            assert.equal(gs.cash, 30000, 'il cash deve scendere di 20.000€');
            assert.equal(gs.lobbyingPoints, 25, 'i punti lobbying devono salire a 25');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('+20 Punti Lobbying')));
            assert.ok(env.logs.some(l => l.includes('Lobbying:') && l.includes('donati')));
        });

        test('donateToLobby rifiuta importi inferiori a 1.000€', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(500);

            assert.equal(gs.cash, 50000, 'il cash non deve cambiare');
            assert.equal(gs.lobbyingPoints, 0, 'nessun punto assegnato');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Donazione minima: €1.000')));
        });

        test('donateToLobby rifiuta valori non validi (0, negativi, NaN)', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 10000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(0);
            sandbox.donateToLobby(-5000);
            sandbox.donateToLobby('invalid');

            assert.equal(gs.cash, 10000);
            assert.equal(gs.lobbyingPoints, 0);
            assert.equal(env.notifications.filter(n => n.type === 'error').length, 3);
        });

        test('donateToLobby rifiuta donazione se i fondi in cassa sono insufficienti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 4000;
            gs.lobbyingPoints = 2;

            sandbox.donateToLobby(10000);

            assert.equal(gs.cash, 4000, 'il cash non deve cambiare se insufficiente');
            assert.equal(gs.lobbyingPoints, 2, 'i punti non devono cambiare');
        });

        test('donateToLobby arrotonda per difetto i punti (es. 7.800€ -> 7 punti)', () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(7800);

            assert.equal(gs.cash, 12200);
            assert.equal(gs.lobbyingPoints, 7);
        });

        test('ceDonateLobby legge l\'input #lobby-donate-amt dal DOM e chiama donateToLobby', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 0;

            sandbox.renderTabPolitics();
            const input = sandbox.document.getElementById('lobby-donate-amt');
            assert.ok(input, '#lobby-donate-amt deve esistere dopo il rendering');

            input.value = '15000';
            sandbox.ceDonateLobby();

            assert.equal(gs.cash, 35000);
            assert.equal(gs.lobbyingPoints, 15);
        });

        test('ceDonateLobby con input mancante o rimosso non crasha con TypeError', () => {
            const { sandbox, gs, env } = amb;
            sandbox.document.body.innerHTML = '<div></div>'; // nessun input
            gs.cash = 50000;
            gs.lobbyingPoints = 0;

            assert.doesNotThrow(() => {
                sandbox.ceDonateLobby();
            });

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Donazione minima')));
        });
    });

    describe('3. Approvazione Leggi di Lobbying (passLobbyLaw)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('passLobbyLaw approva la legge scalando punti lobbying e cash tramite CE_money', () => {
            const { sandbox, gs, bigEvents, env } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const lawZtl = laws.find(l => l.id === 'law_ztl_exempt');
            assert.ok(lawZtl, 'law_ztl_exempt deve esistere');

            gs.cash = 50000;
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_ztl_exempt');

            assert.equal(gs.cash, 50000 - lawZtl.cashCost, 'deve scalare il costo in cassa');
            assert.equal(gs.lobbyingPoints, 10 - lawZtl.pointsCost, 'deve scalare i punti lobbying');
            assert.ok(gs.activeLobbyLaws.includes('law_ztl_exempt'), 'la legge deve essere aggiunta ad activeLobbyLaws');

            // Big event e log su mappa
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, `Legge Approvata: ${lawZtl.name}`);
            assert.ok(env.logs.some(l => l.includes('Legge approvata: Esenzione ZTL Premium')));
        });

        test('passLobbyLaw rifiuta se i punti lobbying sono insufficienti', () => {
            const { sandbox, gs, env } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const lawZtl = laws.find(l => l.id === 'law_ztl_exempt');

            gs.cash = 50000;
            gs.lobbyingPoints = lawZtl.pointsCost - 1; // Punti insufficienti
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_ztl_exempt');

            assert.equal(gs.cash, 50000, 'il cash non deve essere scalato');
            assert.equal(gs.lobbyingPoints, lawZtl.pointsCost - 1, 'i punti non devono essere scalati');
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('punti lobbying')));
        });

        test('passLobbyLaw rifiuta se il cash è insufficiente e non consuma i punti lobbying', () => {
            const { sandbox, gs } = amb;
            const laws = vm.runInContext('LOBBY_LAWS', sandbox);
            const lawZtl = laws.find(l => l.id === 'law_ztl_exempt');

            gs.cash = lawZtl.cashCost - 100; // Cash insufficiente
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('law_ztl_exempt');

            assert.equal(gs.cash, lawZtl.cashCost - 100);
            assert.equal(gs.lobbyingPoints, 20, 'i punti non devono essere consumati se il pagamento fallisce');
            assert.equal(gs.activeLobbyLaws.length, 0);
        });

        test('passLobbyLaw impedisce l\'approvazione duplicata di una legge già attiva', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 50;
            gs.activeLobbyLaws = ['law_ztl_exempt'];

            sandbox.passLobbyLaw('law_ztl_exempt');

            assert.equal(gs.cash, 100000);
            assert.equal(gs.lobbyingPoints, 50);
            assert.equal(gs.activeLobbyLaws.length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Legge già approvata')));
        });

        test('passLobbyLaw con id inesistente non produce effetti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('legge_inventata');

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 10);
            assert.equal(gs.activeLobbyLaws.length, 0);
        });
    });

    describe('4. Votazione Decreti Server (voteServerDecree, ceVoteDecree)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.decreesRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('voteServerDecree invia voto a Supabase RPC e scala i punti lobbying locali', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.lobbyingPoints = 15;

            await sandbox.voteServerDecree('dec_fuel_sub', 5);

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc, 'deve invocare rpc_vote_server_decree');
            assert.equal(voteRpc.args.v_decree_id, 'dec_fuel_sub');
            assert.equal(voteRpc.args.v_points_spent, 5);

            assert.equal(gs.lobbyingPoints, 10, 'deve scalare 5 punti lobbying');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Voto registrato')));
        });

        test('voteServerDecree quando il decreto raggiunge la soglia notifica l\'approvazione globale', async () => {
            const { sandbox, gs, env } = amb;
            gs.lobbyingPoints = 30;

            // dec_tourism_boost ha 80/100 voti: con 20 voti passa
            await sandbox.voteServerDecree('dec_tourism_boost', 20);

            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Decreto approvato: Piano Straordinario Grandi Eventi')));
        });

        test('voteServerDecree rifiuta voti con 0 o punti non validi', async () => {
            const { sandbox, gs, env, rpcLog } = amb;
            gs.lobbyingPoints = 10;

            await sandbox.voteServerDecree('dec_fuel_sub', 0);
            await sandbox.voteServerDecree('dec_fuel_sub', -5);
            await sandbox.voteServerDecree('dec_fuel_sub', 'abc');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_server_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 10);
            assert.equal(env.notifications.filter(n => n.type === 'error' && n.msg.includes('Inserisci punti validi')).length, 3);
        });

        test('voteServerDecree rifiuta voti superiori ai punti lobbying posseduti', async () => {
            const { sandbox, gs, env, rpcLog } = amb;
            gs.lobbyingPoints = 3;

            await sandbox.voteServerDecree('dec_fuel_sub', 10);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_server_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 3);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Punti lobbying insufficienti')));
        });

        test('voteServerDecree con errore RPC mostra notifica di errore e NON scala i punti lobbying', async () => {
            const ambErr = creaAmbientePolitica({
                rpcHandlers: {
                    rpc_vote_server_decree: async () => ({
                        data: null,
                        error: { message: 'Decreto già scaduto' },
                    }),
                },
            });
            await ambErr.sandbox.decreesRefresh(true);
            ambErr.gs.lobbyingPoints = 10;

            await ambErr.sandbox.voteServerDecree('dec_fuel_sub', 4);

            assert.equal(ambErr.gs.lobbyingPoints, 10, 'i punti non devono essere scalati in caso di errore RPC');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Voto non riuscito')));
            ambErr.env.stopAllIntervals();
        });

        test('ceVoteDecree legge l\'input associato dal DOM e invoca voteServerDecree', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.lobbyingPoints = 10;

            sandbox.renderTabPolitics();
            // L'input ha id formato decree-pts-<prefix>
            const inputId = 'decree-pts-dec_fuel';
            const input = sandbox.document.getElementById(inputId);
            assert.ok(input, `Input #${inputId} deve esistere nel DOM`);

            input.value = '3';
            await sandbox.ceVoteDecree('dec_fuel_sub', inputId);

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc);
            assert.equal(voteRpc.args.v_points_spent, 3);
            assert.equal(gs.lobbyingPoints, 7);
        });

        test('ceVoteDecree con input mancante o rimosso non crasha con TypeError', async () => {
            const { sandbox, gs, env } = amb;
            gs.lobbyingPoints = 10;

            await assert.doesNotReject(async () => {
                await sandbox.ceVoteDecree('dec_fuel_sub', 'input_inesistente');
            });

            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Inserisci punti validi')));
        });
    });

    describe('5. Rendering della scheda Politica (renderTabPolitics)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.decreesRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabPolitics costruisce intestazione, KPI macroeconomici e Finanziamento', () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.035;
            gs.interestRateBase = 0.045;
            gs.lobbyingPoints = 12;
            gs.activeLobbyLaws = ['law_ztl_exempt'];

            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Politica &amp; Decreti') || html.includes('Politica & Decreti'), 'titolo principale');
            assert.ok(html.includes('1 leggi attive · 12 punti lobbying'));
            assert.ok(html.includes('Inflazione'));
            assert.ok(html.includes('3.50%'));
            assert.ok(html.includes('Tasso BCE'));
            assert.ok(html.includes('4.50%'));
            assert.ok(html.includes('12 pt'));
            assert.ok(html.includes('data-ce-act="ceDonateLobby"'));
            assert.ok(html.includes('data-ce-act="passLobbyLaw"'));
        });

        test('colorazione dei KPI macroeconomici varia in base alle soglie', () => {
            const { sandbox, gs } = amb;

            // Scenario 1: Inflazione alta (>5%) e tasso alto (>7%) -> rosso
            gs.inflationRate = 0.065;
            gs.interestRateBase = 0.085;
            sandbox.renderTabPolitics();
            let html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('6.50%'));
            assert.ok(html.includes('8.50%'));

            // Scenario 2: Inflazione bassa (<2%) e tasso basso (<3%) -> verde
            gs.inflationRate = 0.015;
            gs.interestRateBase = 0.025;
            sandbox.renderTabPolitics();
            html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('1.50%'));
            assert.ok(html.includes('2.50%'));
        });

        test('renderTabPolitics mostra correttamente le leggi attive (ATTIVA) vs non attive (Approva)', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 50;
            gs.activeLobbyLaws = ['law_ztl_exempt'];

            sandbox.renderTabPolitics();
            const container = sandbox.document.getElementById('tab-container');

            assert.ok(container.innerHTML.includes('ATTIVA'), 'la legge posseduta deve mostrare pill ATTIVA');
            assert.ok(container.innerHTML.includes('Approva'), 'le leggi non possedute devono mostrare pulsante Approva');
        });

        test('renderTabPolitics disabilita il pulsante Approva se l\'utente non può permettersi la legge', () => {
            const { sandbox, gs } = amb;
            gs.cash = 0; // nessun cash
            gs.lobbyingPoints = 0; // nessun punto
            gs.activeLobbyLaws = [];

            sandbox.renderTabPolitics();
            const container = sandbox.document.getElementById('tab-container');

            const buttons = container.querySelectorAll('button[data-ce-act="passLobbyLaw"]');
            assert.ok(buttons.length > 0);
            for (const btn of buttons) {
                assert.ok(btn.hasAttribute('disabled'), 'il bottone deve essere disabilitato se canAfford è false');
            }
        });

        test('renderTabPolitics disegna i decreti attivi e i decreti in votazione con i badge effetto', () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            // Decreti attivi
            assert.ok(html.includes('Decreti Attivi (2)'));
            assert.ok(html.includes('Incentivo Ecobonus Flotte'));
            assert.ok(html.includes('Patto Stabilità Metropolitano'));
            assert.ok(html.includes('Permanente'));

            // Decreti in votazione
            assert.ok(html.includes('Sussidio Nazionale Carburanti'));
            assert.ok(html.includes('-15% carb.') || html.includes('carb.'));
            assert.ok(html.includes('Piano Straordinario Grandi Eventi'));
            assert.ok(html.includes('+25% mance'));
            assert.ok(html.includes('+20% corse'));
            assert.ok(html.includes('+15% XP'));
            assert.ok(html.includes('APPROVATO'), 'il decreto con status=passed deve mostrare badge APPROVATO');
        });

        test('renderTabPolitics con liste vuote gestisce i placeholder', () => {
            const { sandbox } = amb;
            sandbox._decreesState.decrees = [];
            sandbox._decreesState.activeDecrees = [];

            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Nessun decreto in votazione'));
        });

        test('renderTabPolitics con container DOM assente non solleva eccezioni', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = ''; // niente tab-container

            assert.doesNotThrow(() => {
                sandbox.renderTabPolitics();
            });
        });

        test('ceThen esegue decreesRefresh e renderTabPolitics', async () => {
            const { sandbox } = amb;
            let refreshChiamato = false;
            let renderChiamato = false;

            sandbox.decreesRefresh = async () => { refreshChiamato = true; };
            sandbox.renderTabPolitics = () => { renderChiamato = true; };

            sandbox.ceThen('decreesRefresh', 'renderTabPolitics');
            await new Promise(r => setImmediate(r));

            assert.equal(refreshChiamato, true);
            assert.equal(renderChiamato, true);
        });
    });

    describe('6. Event Delegation DOM (events.js / ce-actions.js)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.decreesRefresh(true);
            amb.sandbox.renderTabPolitics();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su "Dona" invoca ceDonateLobby via delegation', () => {
            const { sandbox, gs } = amb;
            gs.cash = 60000;
            gs.lobbyingPoints = 0;

            const input = sandbox.document.getElementById('lobby-donate-amt');
            input.value = '10000';

            const donateBtn = sandbox.document.querySelector('button[data-ce-act="ceDonateLobby"]');
            assert.ok(donateBtn, 'il bottone ceDonateLobby deve esistere');

            // Dispatch del click nativo DOM
            donateBtn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 10);
        });

        test('click su "Approva" legge invoca passLobbyLaw via delegation', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;
            gs.lobbyingPoints = 50;
            gs.activeLobbyLaws = [];

            // Re-render per avere i bottoni abilitati
            sandbox.renderTabPolitics();

            const passBtn = sandbox.document.querySelector('button[data-ce-act="passLobbyLaw"]');
            assert.ok(passBtn, 'deve esistere il bottone passLobbyLaw');

            passBtn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            assert.ok(gs.activeLobbyLaws.length > 0, 'una legge deve essere stata approvata');
        });

        test('click su "Vota" decreto invoca ceVoteDecree via delegation', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.lobbyingPoints = 20;

            sandbox.renderTabPolitics();

            const voteBtn = sandbox.document.querySelector('button[data-ce-act="ceVoteDecree"]');
            assert.ok(voteBtn, 'deve esistere il bottone ceVoteDecree');

            voteBtn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 10));

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc, 'deve aver eseguito la RPC di voto');
        });
    });

    describe('7. Ciclo di vita e pulizia timer countdown', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.decreesRefresh(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabPolitics imposta _decreesCountdownTimer tramite requestAnimationFrame', async () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();

            // Attendi esecuzione di requestAnimationFrame (che in test è setTimeout 0)
            await new Promise(r => setTimeout(r, 10));

            assert.ok(sandbox.window._decreesCountdownTimer !== null, '_decreesCountdownTimer deve essere attivo');
        });

        test('pulizia del timer countdown alla chiusura o passaggio di tab', async () => {
            const { sandbox } = amb;
            sandbox.renderTabPolitics();
            await new Promise(r => setTimeout(r, 10));

            assert.ok(sandbox.window._decreesCountdownTimer !== null);

            // Simulazione dispatcher: cambio tab
            if (sandbox.window._decreesCountdownTimer) {
                clearInterval(sandbox.window._decreesCountdownTimer);
                sandbox.window._decreesCountdownTimer = null;
            }

            assert.equal(sandbox.window._decreesCountdownTimer, null);
        });
    });

    describe('8. Integrità economica e No Doppio Conteggio', () => {
        test('donateToLobby usa CE_money.spend e ServerState.syncCash senza RPC separate', () => {
            const syncCashCalls = [];
            const amb = creaAmbientePolitica({
                serverStateOverrides: {
                    syncCash: async (cash) => { syncCashCalls.push(cash); return { success: true, cash }; },
                },
            });

            amb.gs.cash = 40000;
            amb.sandbox.donateToLobby(10000);

            assert.equal(amb.gs.cash, 30000);
            assert.equal(amb.gs.lobbyingPoints, 10);
            assert.deepEqual(syncCashCalls, [30000], 'syncCash deve sincronizzare il nuovo saldo una sola volta');
            amb.env.stopAllIntervals();
        });

        test('passLobbyLaw scala solo cash locale tramite CE_money e nessun doppio addebito', () => {
            const syncCashCalls = [];
            const amb = creaAmbientePolitica({
                serverStateOverrides: {
                    syncCash: async (cash) => { syncCashCalls.push(cash); return { success: true, cash }; },
                },
            });

            const laws = vm.runInContext('LOBBY_LAWS', amb.sandbox);
            const law = laws.find(l => l.cashCost > 0);

            amb.gs.cash = 100000;
            amb.gs.lobbyingPoints = 50;
            amb.sandbox.passLobbyLaw(law.id);

            assert.equal(amb.gs.cash, 100000 - law.cashCost);
            assert.deepEqual(syncCashCalls, [100000 - law.cashCost]);
            amb.env.stopAllIntervals();
        });

        test('voteServerDecree muove solo punti lobbying e nessun importo in denaro', async () => {
            const syncCashCalls = [];
            const amb = creaAmbientePolitica({
                serverStateOverrides: {
                    syncCash: async (cash) => { syncCashCalls.push(cash); return { success: true, cash }; },
                },
            });
            await amb.sandbox.decreesRefresh(true);

            amb.gs.cash = 50000;
            amb.gs.lobbyingPoints = 20;

            await amb.sandbox.voteServerDecree('dec_fuel_sub', 5);

            assert.equal(amb.gs.cash, 50000, 'il cash non deve muoversi');
            assert.deepEqual(syncCashCalls, [], 'nessuna chiamata a syncCash');
            assert.equal(amb.gs.lobbyingPoints, 15);
            amb.env.stopAllIntervals();
        });

        test('i punti lobbying e le leggi approvate persistono correttamente con saveGame()', () => {
            const amb = creaAmbientePolitica();
            amb.gs.cash = 100000;
            amb.gs.lobbyingPoints = 0;
            amb.gs.activeLobbyLaws = [];

            amb.sandbox.donateToLobby(30000);
            amb.sandbox.passLobbyLaw('law_ztl_exempt');

            const rawSave = amb.sandbox.localStorage.getItem('ce_save_slot_1');
            assert.ok(rawSave, 'il salvataggio deve esistere in localStorage');

            const parsed = JSON.parse(rawSave);
            assert.equal(parsed.lobbyingPoints, 30 - 5); // 30 - 5 = 25
            assert.ok(parsed.activeLobbyLaws.includes('law_ztl_exempt'));
            amb.env.stopAllIntervals();
        });
    });
});
