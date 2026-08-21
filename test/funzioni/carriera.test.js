'use strict';
/* ============================================================================
   test/funzioni/carriera.test.js — Verifica approfondita Missioni & Carriera

   Verifica del funzionamento della feature "carriera" (attualmente disattivata in config.js):
   1. Modello Dati e Catalogo Missioni (quests-data.js):
      - Costanti classi veicoli VG e predicati helper (_mRun, _vehicleOk, _driverOk, _questUnlocked)
      - QUEST_DB: tutorial (t01-t06), story (m01-m89), raid boss (m50, m60, m70, m80), milestone (q01-q50)
   2. Motore di Avanzamento e Riscatto Ricompense (quests.js):
      - Verifica avanzamento (checkQuestProgress)
      - Completamento corse speciali / missioni (completeMissionRun, getMissionRequires)
      - Consegna reale ricompense nello stato (claimQuestReward): cash, VTK, Driver Coins, reputazione, ShadowCoin, unlock feature, titoli
      - Sincronizzazione autoritativa ServerState / RPC Supabase (syncCash, addDriverCoins, rpc_award_mission_vtk)
   3. Interfaccia Modale e Scelte Morali Bivio (ui-career.js & ce-actions.js):
      - Apertura, rendering e chiusura modale carriera (openCareerModal, renderTabCareer, closeCareerModal)
      - Gestione bivi narrativi (_showBivioModal, _applyBivioChoice)
      - Navigazione CTA rapida (ceCareerCta) ed Event-Delegation ceAct
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito e configurato per la progressione carriera e missioni.
 */
function creaAmbienteCarriera(opzioni = {}) {
    const syncedCash = [];
    const addedDriverCoins = [];
    const rpcLog = [];

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            addDriverCoins: async (amt, reason) => {
                addedDriverCoins.push({ amt, reason });
                const current = (env.sandbox.gameState.driverCoins || 0);
                return { ok: true, driver_coins: current };
            },
            ...opzioni.serverStateOverrides,
        },
    });

    const sbClient = {
        from: () => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
            upsert: async () => ({ error: null }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args);
            }
            if (nome === 'rpc_award_mission_vtk') {
                if (opzioni.simulaErroreRpcVtk) {
                    return { data: null, error: { message: 'RPC vtk error', code: '500' } };
                }
                const cap = (opzioni.vtkCapAwarded !== undefined ? opzioni.vtkCapAwarded : args.v_vtk_amount);
                return { data: { success: true, awarded: cap }, error: null };
            }
            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = { id: 'usr_test_123', email: 'ceo@example.com' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Prepara contenitori DOM
    env.sandbox.document.body.innerHTML = `
        <div id="tab-container"></div>
        <div id="career-dot" class="hidden"></div>
    `;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        syncedCash,
        addedDriverCoins,
        rpcLog,
    };
}

describe('Funzione Carriera — Modello Dati e Predicati (quests-data.js)', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteCarriera(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('QUEST_DB e VG sono definiti e contengono definizioni coerenti', () => {
        const questDb = vm.runInContext('QUEST_DB', amb.sandbox);
        const vg = vm.runInContext('VG', amb.sandbox);

        assert.ok(Array.isArray(questDb), 'QUEST_DB deve essere un array');
        assert.ok(questDb.length >= 80, 'QUEST_DB deve contenere tutte le missioni previste');
        assert.ok(typeof vg === 'object' && vg !== null, 'VG deve essere una mappa di classi');

        // Verifica struttura minima di ogni quest
        questDb.forEach(q => {
            assert.ok(typeof q.id === 'string', `id invalido per ${q.id}`);
            assert.ok(typeof q.ch === 'number', `capitolo invalido per ${q.id}`);
            assert.ok(['tutorial', 'story', 'raid', 'milestone'].includes(q.type), `tipo invalido per ${q.id}`);
            assert.ok(typeof q.title === 'string' && q.title.length > 0, `titolo mancante per ${q.id}`);
            assert.ok(Array.isArray(q.prereqs), `prereqs deve essere array in ${q.id}`);
            assert.ok(typeof q.check === 'function', `check deve essere funzione in ${q.id}`);
            assert.ok(typeof q.rewards === 'object' && q.rewards !== null, `rewards deve essere oggetto in ${q.id}`);
        });
    });

    test('getMissionRequires restituisce requisiti per missioni complesse o null se assenti', () => {
        const { sandbox } = amb;
        const reqT01 = sandbox.getMissionRequires('t01');
        assert.equal(reqT01, null, 't01 non ha oggetto requires esplicito');

        const reqM01 = sandbox.getMissionRequires('m01');
        assert.ok(reqM01 !== null, 'm01 deve avere requires');
        assert.ok(Array.isArray(reqM01.vehicle?.classes));
        assert.equal(reqM01.vehicle.armor, 'B6');
        assert.equal(reqM01.driver?.levelMin, 3);
    });

    test('predicati helper _questUnlocked, _mRun, _vehicleOk e _driverOk operano correttamente', () => {
        const { sandbox, gs } = amb;

        // _mRun
        gs.questStats = { missionRuns: { t03: true } };
        const runT03 = vm.runInContext('_mRun(gameState, "t03")', sandbox);
        const runT04 = vm.runInContext('_mRun(gameState, "t04")', sandbox);
        assert.equal(runT03, 1);
        assert.equal(runT04, 0);

        // _questUnlocked
        gs.completedQuests = ['t01', 't02'];
        const qUnlocked = { prereqs: ['t01', 't02'] };
        const qLocked = { prereqs: ['t01', 't02', 't03'] };
        assert.equal(vm.runInContext('_questUnlocked', sandbox)(qUnlocked, gs), true);
        assert.equal(vm.runInContext('_questUnlocked', sandbox)(qLocked, gs), false);

        // _vehicleOk
        gs.fleet = [
            { vehicleClass: 'stellar_g_overlord', condition: 98, clean: 95, armor: 'B6' },
            { vehicleClass: 'nexus_h_line', condition: 80, clean: 70, armor: null }
        ];
        const vOkB6 = vm.runInContext('_vehicleOk(gameState, ["stellar_g_overlord"], { cond: 90, armor: "B6" })', sandbox);
        const vFailCond = vm.runInContext('_vehicleOk(gameState, ["nexus_h_line"], { cond: 90 })', sandbox);
        assert.equal(vOkB6, true);
        assert.equal(vFailCond, false);

        // _driverOk
        gs.drivers = [
            { id: 'ceo', level: 10, stress: 0 },
            { id: 'drv_1', level: 3, stress: 20 },
            { id: 'drv_2', level: 1, stress: 80 }
        ];
        const dOkLv3 = vm.runInContext('_driverOk(gameState, { lv: 3, stress: 30, n: 1 })', sandbox);
        const dFailLv4 = vm.runInContext('_driverOk(gameState, { lv: 4, stress: 30, n: 1 })', sandbox);
        assert.equal(dOkLv3, true);
        assert.equal(dFailLv4, false);
    });
});

describe('Funzione Carriera — Avanzamento e Controllo Missioni (quests.js)', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteCarriera(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('checkQuestProgress rileva missioni completabili e attiva il badge carriera', () => {
        const { sandbox, gs, env } = amb;
        gs.fleet = [{ id: 'veh_0', vehicleClass: 'nexus_h_line', condition: 100 }];
        gs.completedQuests = [];
        gs.claimableQuests = [];

        sandbox.checkQuestProgress();

        assert.ok(gs.claimableQuests.includes('t01'), 't01 deve diventare claimable dato che possediamo un nexus_h_line');
        const dot = sandbox.document.getElementById('career-dot');
        assert.equal(dot.classList.contains('hidden'), false, 'il badge career-dot non deve avere classe hidden');
        assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Ricompensa quest')));
    });

    test('checkQuestProgress non aggiunge duplicati né sblocca quest con prerequisiti non soddisfatti', () => {
        const { sandbox, gs } = amb;
        gs.fleet = [{ id: 'veh_0', vehicleClass: 'nexus_h_line', condition: 100 }];
        gs.drivers = [{ id: 'ceo' }, { id: 'drv_1', level: 1 }];
        gs.completedQuests = [];
        gs.claimableQuests = ['t01'];

        // t02 richiede t01 completata: anche se abbiamo un autista, finché t01 non è in completedQuests t02 non deve diventare claimable
        sandbox.checkQuestProgress();

        assert.deepEqual(gs.claimableQuests, ['t01']);
        assert.equal(gs.claimableQuests.filter(id => id === 't01').length, 1, 'non devono esserci duplicati');
    });

    test('completeMissionRun registra la corsa in questStats e scatena checkQuestProgress', () => {
        const { sandbox, gs } = amb;
        gs.completedQuests = ['t01', 't02'];
        gs.claimableQuests = [];

        sandbox.completeMissionRun('t03');

        assert.equal(gs.questStats?.missionRuns?.['t03'], true);
        assert.ok(gs.claimableQuests.includes('t03'), 't03 deve diventare claimable dopo il run');
    });
});

describe('Funzione Carriera — Erogazione Ricompense (claimQuestReward)', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteCarriera(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('claimQuestReward ignora chiamate per quest non presenti in claimableQuests', () => {
        const { sandbox, gs, syncedCash } = amb;
        gs.cash = 1000;
        gs.claimableQuests = ['t01'];
        gs.completedQuests = [];

        sandbox.claimQuestReward('t02');

        assert.equal(gs.cash, 1000);
        assert.deepEqual(gs.claimableQuests, ['t01']);
        assert.deepEqual(gs.completedQuests, []);
        assert.equal(syncedCash.length, 0);
    });

    test('claimQuestReward eroga Cash, annualProfitTracker e sincronizza con ServerState', () => {
        const { sandbox, gs, syncedCash, env } = amb;
        gs.cash = 2000;
        gs.annualProfitTracker = 10000;
        gs.claimableQuests = ['t03']; // t03 ricompensa: cash 1500, vtk 80
        gs.completedQuests = ['t01', 't02'];

        sandbox.claimQuestReward('t03');

        assert.equal(gs.cash, 3500);
        assert.equal(gs.annualProfitTracker, 11500);
        assert.ok(gs.completedQuests.includes('t03'));
        assert.equal(gs.claimableQuests.includes('t03'), false);
        assert.deepEqual(syncedCash, [3500]);
        assert.ok(env.logs.some(l => l.includes('Quest: "Il Cliente Pignolo"')));
    });

    test('claimQuestReward eroga VTK e invoca RPC Supabase rpc_award_mission_vtk', async () => {
        const { sandbox, gs, rpcLog } = amb;
        gs.vtkBalance = 100;
        gs.claimableQuests = ['t01']; // t01 ricompensa: vtk 50, unlock 'hr_tab'

        sandbox.claimQuestReward('t01');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.vtkBalance, 150);
        assert.ok(gs.unlockedFeatures?.includes('hr_tab'));
        const vtkRpc = rpcLog.find(r => r.nome === 'rpc_award_mission_vtk');
        assert.ok(vtkRpc, 'deve chiamare rpc_award_mission_vtk');
        assert.equal(vtkRpc.args.v_vtk_amount, 50);
        assert.equal(vtkRpc.args.v_mission_id, 't01');
    });

    test('claimQuestReward riconcilia saldo VTK se il server applica un cap inferiore', async () => {
        const ambCapped = creaAmbienteCarriera({ vtkCapAwarded: 30 }); // 30 erogati invece di 80
        const { sandbox, gs } = ambCapped;
        gs.vtkBalance = 200;
        gs.claimableQuests = ['t03']; // ricompensa nominale 80 VTK

        sandbox.claimQuestReward('t03');
        await new Promise(r => setImmediate(r));

        // Iniziale 200 + 80 nominale - 50 (cap correzione) = 230
        assert.equal(gs.vtkBalance, 230);
        ambCapped.env.stopAllIntervals();
    });

    test('claimQuestReward eroga Driver Coins (tc) e invoca ServerState.addDriverCoins', async () => {
        const { sandbox, gs, addedDriverCoins } = amb;
        gs.driverCoins = 50;
        gs.claimableQuests = ['m16']; // m16 rewards: tc: 120, vtk: 200, unlock: 'union_office'

        sandbox.claimQuestReward('m16');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.driverCoins, 170);
        assert.ok(gs.unlockedFeatures.includes('union_office'));
        assert.deepEqual(addedDriverCoins, [{ amt: 120, reason: 'quest_reward' }]);
    });

    test('claimQuestReward eroga Reputazione, ShadowCoin e Titoli speciali', () => {
        const { sandbox, gs } = amb;
        gs.reputation = 4.2;
        gs.prestige = 0.5; // Cap max reputazione = 5.5
        gs.shadowCoin = 1000;
        gs.claimableQuests = ['m50']; // Raid boss: cash 1M, shadowCoin 500k, title 'Governatore Supremo', unlock 'majestic_spirit_gold'

        sandbox.claimQuestReward('m50');

        assert.equal(gs.cash, 1000000);
        assert.equal(gs.shadowCoin, 501000);
        assert.equal(gs.playerTitle, 'Governatore Supremo');
        assert.ok(gs.unlockedFeatures.includes('majestic_spirit_gold'));
    });

    test('claimQuestReward rimuove badge career-dot quando la lista claimable è vuota', () => {
        const { sandbox, gs } = amb;
        const dot = sandbox.document.getElementById('career-dot');
        dot.classList.remove('hidden');

        gs.claimableQuests = ['t01'];
        sandbox.claimQuestReward('t01');

        assert.equal(dot.classList.contains('hidden'), true);
    });
});

describe('Funzione Carriera — Ciclo Completo Tutorial Capitolo 1 (t01 → t06)', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteCarriera(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('progressione sequenziale completa dal battesimo del fuoco allo sblocco mappa', async () => {
        const { sandbox, gs } = amb;

        // Reset stato
        gs.cash = 1000;
        gs.reputation = 3.0;
        gs.completedQuests = [];
        gs.claimableQuests = [];
        gs.unlockedFeatures = [];
        gs.questStats = { missionRuns: {} };

        // 1. T01: Possesso veicolo starter
        gs.fleet = [{ id: 'veh_0', vehicleClass: 'nexus_h_line', condition: 100 }];
        sandbox.checkQuestProgress();
        assert.ok(gs.claimableQuests.includes('t01'));
        sandbox.claimQuestReward('t01');
        assert.ok(gs.completedQuests.includes('t01'));
        assert.ok(gs.unlockedFeatures.includes('hr_tab'));

        // 2. T02: Assunzione autista
        sandbox.checkQuestProgress();
        assert.equal(gs.claimableQuests.includes('t02'), false, 't02 non ancora completata finché non c è un autista');
        gs.drivers.push({ id: 'drv_t02', name: 'Mario Rossi', level: 1, stress: 0 });
        sandbox.checkQuestProgress();
        assert.ok(gs.claimableQuests.includes('t02'));
        sandbox.claimQuestReward('t02');
        assert.ok(gs.completedQuests.includes('t02'));
        assert.ok(gs.unlockedFeatures.includes('dispatch'));

        // 3. T03: Missione speciale corsa
        sandbox.startMissionRun('t03');
        assert.ok(gs.claimableQuests.includes('t03'));
        sandbox.claimQuestReward('t03');
        assert.ok(gs.completedQuests.includes('t03'));

        // 4. T04: Manutenzione flotta
        gs.fleet[0].condition = 96;
        sandbox.checkQuestProgress();
        assert.ok(gs.claimableQuests.includes('t04'));
        sandbox.claimQuestReward('t04');
        assert.ok(gs.completedQuests.includes('t04'));
        assert.ok(gs.unlockedFeatures.includes('business_tier'));

        // 5. T05: Corsa di benvenuto nel club
        sandbox.startMissionRun('t05');
        assert.ok(gs.claimableQuests.includes('t05'));
        sandbox.claimQuestReward('t05');
        assert.ok(gs.completedQuests.includes('t05'));
        assert.ok(gs.unlockedFeatures.includes('market'));

        // 6. T06: Bivio morale GdF
        sandbox.startMissionRun('t06');
        assert.ok(sandbox.document.getElementById('bivio-modal'), 'deve aprire il modale bivio per t06');

        // Scegliamo l opzione "rifiuta" per ottenere +0.2 reputazione
        const initialRep = gs.reputation;
        sandbox._applyBivioChoice('t06', 'rifiuta');
        assert.equal(sandbox.document.getElementById('bivio-modal'), null, 'il modale bivio deve essere rimosso');
        assert.equal(Number((gs.reputation - initialRep).toFixed(1)), 0.2);

        assert.ok(gs.claimableQuests.includes('t06'));
        sandbox.claimQuestReward('t06');
        assert.ok(gs.completedQuests.includes('t06'));
        assert.ok(gs.unlockedFeatures.includes('full_map'));

        // Verifica che tutte le 6 quest siano completate
        assert.deepEqual(gs.completedQuests, ['t01', 't02', 't03', 't04', 't05', 't06']);
    });
});

describe('Funzione Carriera — Traguardi Milestone e Bivi Morali Avanzati', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteCarriera(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('progressione traguardo milestone (q01 prima corsa)', () => {
        const { sandbox, gs } = amb;
        gs.questStats = { totalRides: 1 };
        gs.completedQuests = [];
        gs.claimableQuests = [];

        sandbox.checkQuestProgress();

        assert.ok(gs.claimableQuests.includes('q01'), 'q01 deve risultare completabile con 1 corsa');
        const prevCash = gs.cash;
        sandbox.claimQuestReward('q01'); // ricompensa €1500, 3 tc, 150 VTK

        assert.ok(gs.completedQuests.includes('q01'));
        assert.equal(gs.cash, prevCash + 1500);
    });

    test('bivio morale m01 (collaboratore di giustizia): ramo accetta con tangente e calo reputazione', () => {
        const { sandbox, gs } = amb;
        gs.completedQuests = ['t06'];
        gs.cash = 10000;
        gs.reputation = 4.0;

        sandbox.startMissionRun('m01');
        assert.ok(sandbox.document.getElementById('bivio-modal'));

        // Accetta tangente: +150.000€ ma -0.5 reputazione
        sandbox._applyBivioChoice('m01', 'accetta');

        assert.equal(gs.cash, 160000);
        assert.equal(gs.reputation, 3.5);
        assert.ok(gs.claimableQuests.includes('m01'));

        // Riscatto ricompensa nominale (+30.000€, +0.2 rep)
        sandbox.claimQuestReward('m01');
        assert.equal(gs.cash, 190000);
        assert.equal(gs.reputation, 3.7);
    });
});

describe('Funzione Carriera — Interfaccia Utente e Modali (ui-career.js & ce-actions.js)', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteCarriera(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('openCareerModal e renderTabCareer creano il modale con struttura completa', () => {
        const { sandbox, gs } = amb;
        gs.completedQuests = ['t01'];
        gs.claimableQuests = ['t02'];

        sandbox.renderTabCareer();

        const overlay = sandbox.document.getElementById('career-modal-overlay');
        assert.ok(overlay, 'career-modal-overlay deve essere inserito nel DOM');

        const html = overlay.innerHTML;
        assert.ok(html.includes('Capitolo 1'));
        assert.ok(html.includes('Il Battesimo del Fuoco'));
        assert.ok(html.includes('Carne da Macello')); // Titolo t02
        assert.ok(html.includes('data-ce-act="claimQuestReward"'));
        assert.ok(html.includes('Archivio Completate'));
    });

    test('closeCareerModal rimuove overlay e ripristina la tab precedente', () => {
        const { sandbox } = amb;
        let tabSwitchedTo = null;
        sandbox.switchTab = (tab) => { tabSwitchedTo = tab; };
        sandbox._careerPrevTab = 'fleet';

        sandbox.openCareerModal();
        assert.ok(sandbox.document.getElementById('career-modal-overlay'));

        sandbox.closeCareerModal();
        assert.equal(sandbox.document.getElementById('career-modal-overlay'), null);
        assert.equal(tabSwitchedTo, 'fleet');
    });

    test('pressione del tasto Escape chiude il modale carriera', () => {
        const { sandbox } = amb;
        sandbox.openCareerModal();
        assert.ok(sandbox.document.getElementById('career-modal-overlay'));

        // Simula evento keydown Escape sul document
        const escEvent = new sandbox.document.defaultView.KeyboardEvent('keydown', { key: 'Escape' });
        sandbox.document.dispatchEvent(escEvent);

        assert.equal(sandbox.document.getElementById('career-modal-overlay'), null);
    });

    test('click sul pulsante CTA ceCareerCta chiude overlay e naviga alla tab specificata', () => {
        const { sandbox } = amb;
        let tabNavigata = null;
        sandbox.switchTab = (tab) => { tabNavigata = tab; };

        sandbox.openCareerModal();
        assert.ok(sandbox.document.getElementById('career-modal-overlay'));

        // Invocazione azione ceCareerCta
        sandbox.ceCareerCta('showroom');

        assert.equal(sandbox.document.getElementById('career-modal-overlay'), null);
        assert.equal(tabNavigata, 'showroom');
    });

    test('startMissionRun senza bivio completa la corsa e aggiorna il modale aperto', () => {
        const { sandbox, gs } = amb;
        gs.completedQuests = ['t01', 't02'];
        sandbox.openCareerModal();

        sandbox.startMissionRun('t03');

        assert.ok(gs.questStats?.missionRuns?.['t03']);
        const overlay = sandbox.document.getElementById('career-modal-overlay');
        assert.ok(overlay.innerHTML.includes('Completata — da riscuotere'));
    });

    test('click sul backdrop dell overlay chiude il modale carriera', () => {
        const { sandbox } = amb;
        sandbox.openCareerModal();
        const overlay = sandbox.document.getElementById('career-modal-overlay');
        assert.ok(overlay);

        // Click direttamente sull'overlay di sfondo
        overlay.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        assert.equal(sandbox.document.getElementById('career-modal-overlay'), null);
    });

    test('_showBivioModal crea il modale del bivio con opzioni e pulsante di annullamento', () => {
        const { sandbox } = amb;
        const qMock = {
            id: 'mock_bivio',
            icon: '⚡',
            title: 'Scelta Critica',
            giver: { name: 'Contatto', faction: 'Mondo Notturno' },
            bivio: {
                prompt: 'Cosa decidi di fare?',
                options: [
                    { id: 'opt_a', label: 'Opzione A', desc: 'Descrizione A', effect: (gs) => { gs.cash += 100; } },
                    { id: 'opt_b', label: 'Opzione B', desc: 'Descrizione B', effect: (gs) => { gs.reputation += 0.1; } },
                ]
            }
        };

        sandbox._showBivioModal(qMock);

        const modal = sandbox.document.getElementById('bivio-modal');
        assert.ok(modal, 'bivio-modal deve esistere nel DOM');
        assert.ok(modal.innerHTML.includes('Scelta Critica'));
        assert.ok(modal.innerHTML.includes('Opzione A'));
        assert.ok(modal.innerHTML.includes('data-ce-act="_applyBivioChoice"'));
        assert.ok(modal.innerHTML.includes('data-ce-act="ceRemove"'));
    });

    test('_applyBivioChoice con quest o opzione non corrispondente non altera lo stato', () => {
        const { sandbox, gs } = amb;
        const prevCash = gs.cash;
        sandbox._bivioQuestRef = { id: 'm01', bivio: { options: [{ id: 'opt_1' }] } };

        // Quest ID errato
        sandbox._applyBivioChoice('quest_sbagliata', 'opt_1');
        assert.equal(gs.cash, prevCash);

        // Opzione inesistente
        sandbox._applyBivioChoice('m01', 'opt_inesistente');
        assert.equal(gs.cash, prevCash);
    });

    test('startMissionRun con id non presente in QUEST_DB non genera eccezioni', () => {
        const { sandbox } = amb;
        assert.doesNotThrow(() => {
            sandbox.startMissionRun('quest_inesistente_xyz');
        });
    });

    test('openCareerModal mostra messaggio di completamento quando tutte le missioni sono terminate', () => {
        const { sandbox, gs } = amb;
        const questDb = vm.runInContext('QUEST_DB', sandbox);
        // Segniamo tutte le quest come completate
        gs.completedQuests = questDb.map(q => q.id);
        gs.claimableQuests = [];

        sandbox.openCareerModal();

        const overlay = sandbox.document.getElementById('career-modal-overlay');
        assert.ok(overlay.innerHTML.includes('Campagna completata — hai dominato il mercato.'));
    });

    test('funzioni helper _carRewardLine e _buildRewardChips formattano correttamente i vari reward', () => {
        const { sandbox } = amb;
        const rewardCompleto = {
            cash: 50000,
            vtk: 200,
            tc: 10,
            rep: 0.3,
            shadowCoin: 15000,
            unlock: 'feature_segreta',
            title: 'Magnate Supremo',
        };

        const line = vm.runInContext('_carRewardLine', sandbox)(rewardCompleto);
        assert.ok(line.includes('+€50.000'));
        assert.ok(line.includes('+200 VTK'));
        assert.ok(line.includes('+10 DC'));
        assert.ok(line.includes('+0.3★'));
        assert.ok(line.includes('+15.000 SC'));
        assert.ok(line.includes('feature_segreta'));
        assert.ok(line.includes('"Magnate Supremo"'));

        const chips = vm.runInContext('_buildRewardChips', sandbox)(rewardCompleto);
        assert.ok(chips.includes('cm-chip gold'));
        assert.ok(chips.includes('cm-chip vtk'));
        assert.ok(chips.includes('Magnate Supremo'));
    });
});
