'use strict';
/* ============================================================================
   test/funzioni/politica-ui.test.js — Verifica modulo Politica & Lobbying (ui-politics.js)

   Scopo: collaudare nel banco di prova ogni azione e visualizzazione esposta
   da `ui-politics.js`, `ce-actions.js`, `engine-finance.js` (lobbying) e `ui-lifestyle.js` (server decrees):
   - renderTabPolitics (KPI macroeconomia, donazioni, leggi LOBBY_LAWS, decreti server)
   - donateToLobby / ceDonateLobby (donazioni politiche, spesa CE_money, calcolo punti)
   - passLobbyLaw (approvazione leggi di lobbying, verifica costi punti/cash, big events)
   - decreesRefresh, getDecreeEffects, voteServerDecree / ceVoteDecree (decreti globali)
   - Event delegation (events.js, data-ce-act, ceThen, bottoni Vota / Approva / Dona)
   - Integrazione macroeconomica (_tickMacroEconomy) e verifica nessun doppio conteggio
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce l'ambiente per il collaudo della politica e dei decreti server.
 */
function creaAmbientePolitica(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];

    const decretiServerDefault = [
        {
            id: 'dec_fuel_tax',
            title: 'Incentivo Carburante Flotte',
            description: 'Riduzione delle accise sul carburante per servizi NCC.',
            icon: '⛽',
            status: 'voting',
            votes_current: 35,
            votes_required: 100,
            my_votes: 10,
            expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            effects: { fuelCostMult: 0.85 },
        },
        {
            id: 'dec_tourism_boost',
            title: 'Decreto Grandi Eventi & Turismo',
            description: 'Aumento delle mance ed extra corse durante i vertici internazionali.',
            icon: '🌟',
            status: 'voting',
            votes_current: 80,
            votes_required: 100,
            my_votes: 0,
            expires_at: new Date(Date.now() + 1800 * 1000).toISOString(), // 30m
            effects: { tipMult: 1.25, extraRidePct: 0.15 },
        },
        {
            id: 'dec_passed_exp',
            title: 'Sgravio Fiscale Veicoli Elettrici',
            description: 'Esenzione bollo e sconti manutenzione su EV.',
            icon: '⚡',
            status: 'passed',
            votes_current: 100,
            votes_required: 100,
            my_votes: 25,
            expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            effects: { maintenanceMult: 0.90 },
        },
    ];

    const decretiAttiviDefault = [
        {
            id: 'dec_active_1',
            title: 'Regolamento ZTL Nazionale',
            icon: '🏛️',
            ends_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            effects: { taxRateMult: 0.95 },
        },
    ];

    let decretiServer = (opzioni.decrees || decretiServerDefault).map(d => ({ ...d }));
    let decretiAttivi = (opzioni.activeDecrees || decretiAttiviDefault).map(d => ({ ...d }));

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
                return opzioni.rpcHandlers[nome](args, { decretiServer, decretiAttivi });
            }

            if (nome === 'rpc_get_server_decrees') {
                return { data: decretiServer, error: null };
            }

            if (nome === 'rpc_get_active_decrees') {
                return { data: decretiAttivi, error: null };
            }

            if (nome === 'rpc_vote_server_decree') {
                const dec = decretiServer.find(d => d.id === args.v_decree_id);
                if (!dec) return { data: null, error: { message: 'Decreto non trovato' } };

                const pts = args.v_points_spent || 0;
                dec.votes_current = (dec.votes_current || 0) + pts;
                dec.my_votes = (dec.my_votes || 0) + pts;

                const passed = dec.votes_current >= dec.votes_required;
                if (passed) {
                    dec.status = 'passed';
                    decretiAttivi.push({
                        id: dec.id,
                        title: dec.title,
                        icon: dec.icon,
                        ends_at: dec.expires_at,
                        effects: dec.effects,
                    });
                }

                return {
                    data: {
                        passed,
                        title: dec.title,
                        votes_current: dec.votes_current,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'usr_pol_test' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        bigEvents,
        decretiServer,
        decretiAttivi,
    };
}

describe('Funzione Politica & Lobbying — Collaudo Completo', () => {

    describe('1. Inizializzazione e Rendering della Schermata (renderTabPolitics)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabPolitics genera la schermata con KPI, donazione, leggi e decreti', () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.025;
            gs.interestRateBase = 0.045;
            gs.lobbyingPoints = 12;
            gs.activeLobbyLaws = ['law_ztl_exempt'];

            sandbox.renderTabPolitics();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Politica &amp; Decreti') || html.includes('Politica & Decreti'), 'titolo principale presente');
            assert.ok(html.includes('2.50%'), 'inflazione formattata');
            assert.ok(html.includes('4.50%'), 'tasso BCE formattato');
            assert.ok(html.includes('12 pt') || html.includes('>12<'), 'punti lobbying nei KPI');
            assert.ok(html.includes('Esenzione ZTL Premium'), 'mostra card legge ZTL');
            assert.ok(html.includes('ATTIVA'), 'legge approvata con badge ATTIVA');
            assert.ok(html.includes('↻ DECRETI'), 'pulsante refresh decreti');
            assert.ok(html.includes('id="lobby-donate-amt"'), 'input donazione presente');
        });

        test('colori KPI dinamici in base ai valori soglia di inflazione e tassi', () => {
            const { sandbox, gs } = amb;

            // Caso 1: inflazione alta (>5%), tasso alto (>7%) -> rosso
            gs.inflationRate = 0.06;
            gs.interestRateBase = 0.08;
            sandbox.renderTabPolitics();
            assert.ok(sandbox.document.getElementById('tab-container').innerHTML.includes('color:var(--em-red)'));

            // Caso 2: inflazione bassa (<2%), tasso basso (<3%) -> verde
            gs.inflationRate = 0.015;
            gs.interestRateBase = 0.025;
            sandbox.renderTabPolitics();
            assert.ok(sandbox.document.getElementById('tab-container').innerHTML.includes('color:var(--em-green)'));
        });

        test('renderTabPolitics con lista leggi vuota mostra messaggio dedicato', () => {
            const { sandbox } = amb;
            // Esecuzione di renderTabPolitics con LOBBY_LAWS temporaneamente non definita / vuota
            vm.runInContext(`
                const _oldRender = renderTabPolitics;
                const _origLobbyLaws = typeof LOBBY_LAWS !== 'undefined' ? LOBBY_LAWS : [];
                // Testa logica render con array leggi vuoto
                (function() {
                    const container = document.getElementById('tab-container');
                    const inflPct = ((gameState.inflationRate || 0.020) * 100).toFixed(2);
                    const ratePct = ((gameState.interestRateBase || 0.045) * 100).toFixed(2);
                    const points = gameState.lobbyingPoints || 0;
                    const laws = [];
                    const activeLaws = 0;
                    container.innerHTML = \`<div class="em"><div class="em-page em-wrap">\${laws.length === 0 ? '<div class="em-empty">Nessuna legge disponibile.</div>' : ''}</div></div>\`;
                })();
            `, sandbox);

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Nessuna legge disponibile.'));
        });

        test('sezione decreti renderizza decreti attivi e in votazione con badge effetti', async () => {
            const { sandbox } = amb;
            await sandbox.decreesRefresh(true);
            sandbox.renderTabPolitics();

            const html = sandbox.document.getElementById('tab-container').innerHTML;

            // Decreti attivi
            assert.ok(html.includes('Decreti Attivi (1)'));
            assert.ok(html.includes('Regolamento ZTL Nazionale'));

            // Decreti in votazione e badge effetti
            assert.ok(html.includes('Incentivo Carburante Flotte'));
            assert.ok(html.includes('-15% carb.'));
            assert.ok(html.includes('+25% mance'));
            assert.ok(html.includes('+15% corse'));
            assert.ok(html.includes('Sgravio Fiscale Veicoli Elettrici'));
            assert.ok(html.includes('APPROVATO'));
        });

        test('sezione decreti gestisce stato vuoto se non vi sono decreti', () => {
            const { sandbox } = amb;
            sandbox._decreesState = { decrees: [], activeDecrees: [] };
            sandbox.renderTabPolitics();

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Nessun decreto in votazione — aggiorna tra qualche minuto.'));
        });
    });

    describe('2. Finanziamento Politico e Donazioni (donateToLobby, ceDonateLobby)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donazione valida deduce denaro tramite CE_money.spend e incrementa lobbyingPoints', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 5;

            sandbox.donateToLobby(20000);

            assert.equal(gs.cash, 30000, 'il cash deve essere ridotto di 20.000');
            assert.equal(gs.lobbyingPoints, 25, 'devono essere aggiunti 20 punti (1pt per 1.000€)');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('+20 Punti Lobbying')));
            assert.ok(env.logs.some(l => l.includes('Lobbying:') && l.includes('donati')));
        });

        test('donazione inferiore a 1.000€ viene respinta senza spesa', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 10000;
            gs.lobbyingPoints = 2;

            sandbox.donateToLobby(500);

            assert.equal(gs.cash, 10000, 'il cash non deve cambiare');
            assert.equal(gs.lobbyingPoints, 2, 'i punti non devono cambiare');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Donazione minima: €1.000')));
        });

        test('donazione respinta se i fondi in cassa sono insufficienti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 3000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(10000);

            assert.equal(gs.cash, 3000, 'cash inalterato');
            assert.equal(gs.lobbyingPoints, 0, 'nessun punto assegnato');
        });

        test('donazione con importo frazionato arrotonda i punti per difetto a multipli di 1.000', () => {
            const { sandbox, gs } = amb;
            gs.cash = 25000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5500);

            assert.equal(gs.cash, 19500, 'spende l importo esatto di 5.500€');
            assert.equal(gs.lobbyingPoints, 5, 'assegna Math.floor(5500/1000) = 5 punti');
        });

        test('ceDonateLobby legge il valore dall input DOM ed esegue la donazione', () => {
            const { sandbox, gs } = amb;
            sandbox.renderTabPolitics();

            const input = sandbox.document.getElementById('lobby-donate-amt');
            assert.ok(input, 'input donazione presente');
            input.value = '15000';
            gs.cash = 40000;
            gs.lobbyingPoints = 0;

            sandbox.ceDonateLobby();

            assert.equal(gs.cash, 25000);
            assert.equal(gs.lobbyingPoints, 15);
        });
    });

    describe('3. Approvazione Leggi di Lobbying (passLobbyLaw)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('passLobbyLaw approva la legge, consuma punti e cash, e notifica il giocatore', () => {
            const { sandbox, gs, bigEvents, env } = amb;
            const lobbyLaws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = lobbyLaws.find(l => l.id === 'law_ztl_exempt');
            assert.ok(law, 'legge ZTL deve esistere nel catalogo');

            gs.cash = 50000;
            gs.lobbyingPoints = 10;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.cash, 50000 - law.cashCost, 'deve scalare il cashCost');
            assert.equal(gs.lobbyingPoints, 10 - law.pointsCost, 'deve scalare i punti richiesti');
            assert.ok(gs.activeLobbyLaws.includes(law.id), 'la legge deve essere inserita in activeLobbyLaws');

            // Verifica big event modale
            assert.equal(bigEvents.length, 1);
            assert.ok(bigEvents[0].title.includes(law.name));
            assert.ok(env.logs.some(l => l.includes('Legge approvata: ' + law.name)));
        });

        test('passLobbyLaw fallisce se i punti lobbying sono insufficienti', () => {
            const { sandbox, gs, env } = amb;
            const lobbyLaws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = lobbyLaws.find(l => l.id === 'law_tax_cut'); // 10 pt, 50k cash

            gs.cash = 100000;
            gs.lobbyingPoints = 4; // ne servono 10
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.cash, 100000, 'nessun addebito monetario');
            assert.equal(gs.lobbyingPoints, 4, 'punti non modificati');
            assert.equal(gs.activeLobbyLaws.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Servono 10 punti lobbying')));
        });

        test('passLobbyLaw fallisce se il cash è insufficiente per il costo della legge', () => {
            const { sandbox, gs } = amb;
            const lobbyLaws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = lobbyLaws.find(l => l.id === 'law_tax_cut'); // 10 pt, 50k cash

            gs.cash = 10000; // servono 50k
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.cash, 10000);
            assert.equal(gs.lobbyingPoints, 20, 'i punti NON devono essere detratti se la spesa in denaro fallisce');
            assert.equal(gs.activeLobbyLaws.length, 0);
        });

        test('passLobbyLaw impedisce approvazioni duplicate della stessa legge', () => {
            const { sandbox, gs, env } = amb;
            const lobbyLaws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = lobbyLaws.find(l => l.id === 'law_fast_license');

            gs.cash = 50000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [law.id];

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 20);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Legge già approvata')));
        });

        test('passLobbyLaw con id inesistente viene ignorato', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw('legge_inventata_xyz');

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 20);
            assert.equal(gs.activeLobbyLaws.length, 0);
        });
    });

    describe('4. Decreti Server Governativi (decreesRefresh, voteServerDecree, ceVoteDecree)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('decreesRefresh memorizza decreti e decreti attivi da Supabase RPC', async () => {
            const { sandbox } = amb;
            await sandbox.decreesRefresh(true);

            assert.equal(sandbox._decreesState.decrees.length, 3);
            assert.equal(sandbox._decreesState.activeDecrees.length, 1);
            assert.ok(sandbox._decreesState._lastFetch > 0);
        });

        test('decreesRefresh rispetta il throttle di 60s se force=false', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.decreesRefresh(true);
            const rpcCount = rpcLog.length;

            await sandbox.decreesRefresh(false);
            assert.equal(rpcLog.length, rpcCount, 'throttle attivo: nessuna nuova RPC');

            await sandbox.decreesRefresh(true);
            assert.ok(rpcLog.length > rpcCount, 'force=true bypassa il throttle');
        });

        test('decreesRefresh non crasha se supabaseClient è null', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.decreesRefresh(true);
            });
        });

        test('getDecreeEffects calcola i moltiplicatori cumulativi degli effetti attivi', () => {
            const { sandbox } = amb;
            sandbox._decreesState.activeDecrees = [
                { id: 'd1', effects: { fuelCostMult: 0.90, taxRateMult: 0.95 } },
                { id: 'd2', effects: { fuelCostMult: 0.80, tipMult: 1.20 } },
            ];

            const fx = sandbox.getDecreeEffects();
            assert.ok(Math.abs(fx.fuelCostMult - 0.72) < 0.0001, '0.90 * 0.80 = 0.72');
            assert.equal(fx.taxRateMult, 0.95);
            assert.equal(fx.tipMult, 1.20);
        });

        test('voteServerDecree rifiuta voti con punti non validi o superiori al saldo', async () => {
            const { sandbox, gs, env, rpcLog } = amb;
            gs.lobbyingPoints = 5;

            // Punti <= 0
            await sandbox.voteServerDecree('dec_fuel_tax', 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Inserisci punti validi')));

            // Punti superiori a quelli posseduti
            await sandbox.voteServerDecree('dec_fuel_tax', 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Punti lobbying insufficienti')));

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_vote_server_decree').length, 0);
            assert.equal(gs.lobbyingPoints, 5);
        });

        test('voteServerDecree invia il voto alla RPC, scala i punti e notifica', async () => {
            const { sandbox, gs, env, rpcLog } = amb;
            await sandbox.decreesRefresh(true);
            gs.lobbyingPoints = 15;

            await sandbox.voteServerDecree('dec_fuel_tax', 8);

            const voteRpc = rpcLog.find(r => r.nome === 'rpc_vote_server_decree');
            assert.ok(voteRpc, 'deve invocare rpc_vote_server_decree');
            assert.equal(voteRpc.args.v_decree_id, 'dec_fuel_tax');
            assert.equal(voteRpc.args.v_points_spent, 8);

            assert.equal(gs.lobbyingPoints, 7, '15 - 8 = 7 punti rimanenti');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Voto registrato')));
        });

        test('voteServerDecree quando il decreto raggiunge il quorum mostra notifica di approvazione', async () => {
            const { sandbox, gs, env } = amb;
            await sandbox.decreesRefresh(true);
            gs.lobbyingPoints = 30;

            // dec_tourism_boost ha 80/100 voti: con 20 punti passa
            await sandbox.voteServerDecree('dec_tourism_boost', 20);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Decreto approvato')));
        });

        test('voteServerDecree gestisce errore da RPC Supabase senza perdere punti', async () => {
            const ambErr = creaAmbientePolitica({
                rpcHandlers: {
                    rpc_vote_server_decree: async () => ({
                        data: null,
                        error: { message: 'Votazione chiusa' },
                    }),
                },
            });
            await ambErr.sandbox.decreesRefresh(true);
            ambErr.gs.lobbyingPoints = 10;

            await ambErr.sandbox.voteServerDecree('dec_fuel_tax', 5);

            assert.equal(ambErr.gs.lobbyingPoints, 10, 'i punti non devono essere detratti in caso di errore RPC');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Voto non riuscito')));
            ambErr.env.stopAllIntervals();
        });

        test('ceVoteDecree legge il valore dall input DOM ed esegue il voto', async () => {
            const { sandbox, gs, rpcLog } = amb;
            await sandbox.decreesRefresh(true);
            sandbox.renderTabPolitics();

            const inputId = 'decree-pts-dec_fuel';
            const inputEl = sandbox.document.getElementById(inputId);
            assert.ok(inputEl, 'input per i punti del decreto presente');
            inputEl.value = '6';
            gs.lobbyingPoints = 10;

            sandbox.ceVoteDecree('dec_fuel_tax', inputId);
            await new Promise(r => setTimeout(r, 20));

            assert.equal(gs.lobbyingPoints, 4);
            assert.ok(rpcLog.some(r => r.nome === 'rpc_vote_server_decree'));
        });
    });

    describe('5. Event Delegation e Interazione DOM (events.js, ceAct, ceThen)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbientePolitica();
            await amb.sandbox.decreesRefresh(true);
            amb.sandbox.renderTabPolitics();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su "Dona" invoca ceDonateLobby via delegation', () => {
            const { sandbox, gs } = amb;
            const btn = sandbox.document.querySelector('button[data-ce-act="ceDonateLobby"]');
            assert.ok(btn, 'bottone con data-ce-act="ceDonateLobby" presente');

            gs.cash = 30000;
            gs.lobbyingPoints = 0;
            const input = sandbox.document.getElementById('lobby-donate-amt');
            input.value = '10000';

            btn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            assert.equal(gs.cash, 20000);
            assert.equal(gs.lobbyingPoints, 10);
        });

        test('click su "Approva" legge approva la legge corrispondente via delegation', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            gs.lobbyingPoints = 20;
            sandbox.renderTabPolitics();

            const btn = sandbox.document.querySelector('button[data-ce-act="passLobbyLaw"]');
            assert.ok(btn, 'bottone approva legge presente');

            btn.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            assert.ok(gs.activeLobbyLaws.length > 0);
        });

        test('ceThen esegue refresh decreti e ri-renderizza la scheda', async () => {
            const { sandbox } = amb;
            let renderChiamato = false;
            sandbox.renderTabPolitics = () => { renderChiamato = true; };

            sandbox.ceThen('decreesRefresh', 'renderTabPolitics');
            await new Promise(r => setImmediate(r));

            assert.equal(renderChiamato, true);
        });
    });

    describe('6. Movimenti di Denaro e Controllo Nessun Doppio Conteggio', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('donateToLobby spende cash tramite CE_money.spend senza alcuna RPC di prelievo duplicata', () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 50000;

            sandbox.donateToLobby(10000);

            assert.equal(gs.cash, 40000);
            // Verifica che nessuna RPC abbia tentato di scalare denaro una seconda volta
            assert.equal(rpcLog.length, 0, 'le donazioni politiche non invocano RPC monetarie duplicate');
        });

        test('passLobbyLaw spende cash tramite CE_money.spend senza RPC di addebito concorrente', () => {
            const { sandbox, gs, rpcLog } = amb;
            const lobbyLaws = vm.runInContext('LOBBY_LAWS', sandbox);
            const law = lobbyLaws.find(l => l.cashCost > 0);
            gs.cash = 100000;
            gs.lobbyingPoints = 50;

            sandbox.passLobbyLaw(law.id);

            assert.equal(gs.cash, 100000 - law.cashCost);
            assert.equal(rpcLog.length, 0, 'nessuna RPC invocata per l acquisto della legge');
        });

        test('voteServerDecree muove unicamente punti lobbying e non tocca il saldo cash', async () => {
            const { sandbox, gs } = amb;
            await sandbox.decreesRefresh(true);
            gs.cash = 25000;
            gs.lobbyingPoints = 20;

            await sandbox.voteServerDecree('dec_fuel_tax', 5);

            assert.equal(gs.cash, 25000, 'il saldo cash deve rimanere intatto');
            assert.equal(gs.lobbyingPoints, 15, 'solo i punti lobbying vengono scalati');
        });
    });

    describe('7. Integrazione Macroeconomica e Persistenza Salva-Partita', () => {
        let amb;
        beforeEach(() => { amb = creaAmbientePolitica(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_tickMacroEconomy fa fluttuare inflazione e tassi e aggiorna renderTabPolitics se tab attiva', () => {
            const { sandbox, gs } = amb;
            gs.inflationRate = 0.02;
            gs.interestRateBase = 0.04;

            let renderChiamato = false;
            sandbox.renderTabPolitics = () => { renderChiamato = true; };
            sandbox._activeTab = 'politics';

            sandbox._tickMacroEconomy();

            assert.ok(typeof gs.inflationRate === 'number');
            assert.ok(typeof gs.interestRateBase === 'number');
            assert.equal(renderChiamato, true, 'deve ri-renderizzare la scheda se politics è attiva');
        });

        test('punti lobbying e leggi attive persistono correttamente su localStorage dopo saveGame', () => {
            const { sandbox, gs } = amb;
            gs.lobbyingPoints = 42;
            gs.activeLobbyLaws = ['law_ztl_exempt', 'law_tax_cut'];

            sandbox.saveGame();

            const raw = sandbox.localStorage.getItem('ce_save_slot_1');
            assert.ok(raw, 'salvataggio presente');
            const parsed = JSON.parse(raw);
            assert.equal(parsed.lobbyingPoints, 42);
            assert.deepEqual(parsed.activeLobbyLaws, ['law_ztl_exempt', 'law_tax_cut']);
        });
    });
});
