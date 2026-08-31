'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/career + quests — l'albero missioni (ui-career.js, quests.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 23.

   · startMissionRun(id)        — avvia una missione: se ha un bivio apre il
     modale della scelta, altrimenti la segna come "run" (completeMissionRun).
   · _applyBivioChoice(id,opt)  — applica l'effetto della scelta al bivio giusto,
     poi segna la run e chiude il modale del bivio.
   · closeCareerModal()         — rimuove l'overlay #career-modal-overlay.
   · claimQuestReward(id)       — riscuote una quest "claimable": paga il premio
     dalla porta (CE_money.earn), la sposta in completedQuests, applica gli
     unlock. Doppio click → non paga due volte.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/career', () => {
    let env, w;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 100000);
        w.showNotification = () => {};
        w.updateUI = () => {};
        w.openCareerModal = () => {};        // stub: non ci interessa il ridisegno
    });
    afterEach(() => env.stopAllIntervals());

    const gs  = () => env.sandbox.window.gameState;
    const doc = () => env.sandbox.document;

    test('startMissionRun: quest senza bivio → viene segnata come run', () => {
        gs().questStats = {};
        w.startMissionRun('t02');           // t02: tutorial, nessun bivio
        assert.equal(gs().questStats.missionRuns.t02, true, 'la run non è stata registrata');
    });

    test('startMissionRun: quest con bivio → apre il modale della scelta, niente run', () => {
        gs().questStats = {};
        w.startMissionRun('m01');           // m01: ha bivio
        assert.ok(doc().getElementById('bivio-modal'), 'il modale del bivio non è stato aperto');
        assert.ok(!gs().questStats.missionRuns || !gs().questStats.missionRuns.m01, 'non doveva ancora segnare la run');
    });

    test('startMissionRun: id ignoto → niente', () => {
        gs().questStats = {};
        w.startMissionRun('quest-che-non-esiste');
        assert.equal(doc().getElementById('bivio-modal'), null);
        assert.deepEqual(gs().questStats, {});
    });

    test('_applyBivioChoice: applica l\'effetto della scelta, segna la run e chiude il bivio', () => {
        gs().questStats = {};
        w.startMissionRun('m01');
        const cassaPrima = gs().cash;

        w._applyBivioChoice('m01', 'accetta');   // effect: CE_money.earn(150000)

        assert.equal(gs().cash, cassaPrima + 150000, 'l\'effetto "accetta" non ha pagato');
        assert.equal(gs().questStats.missionRuns.m01, true, 'la run non è stata segnata');
        assert.equal(doc().getElementById('bivio-modal'), null, 'il modale del bivio non si è chiuso');
    });

    test('_applyBivioChoice: se il bivio di riferimento non combacia → nessun effetto', () => {
        gs().questStats = {};
        w.startMissionRun('m01');
        const cassaPrima = gs().cash;

        w._applyBivioChoice('m02', 'accetta');   // questId diverso da _bivioQuestRef

        assert.equal(gs().cash, cassaPrima, 'ha applicato un effetto su un bivio sbagliato');
        assert.ok(doc().getElementById('bivio-modal'), 'non doveva chiudere il modale');
    });

    test('closeCareerModal: rimuove l\'overlay #career-modal-overlay', () => {
        const ov = doc().createElement('div'); ov.id = 'career-modal-overlay';
        doc().body.appendChild(ov);
        w.closeCareerModal();
        assert.equal(doc().getElementById('career-modal-overlay'), null);
        w.closeCareerModal();                // senza overlay: no-op, non esplode
    });
});

describe('sistemi/quests', () => {
    let env, w;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 0);
        w.showNotification = () => {};
        w.showBigEvent = () => {};
        w.updateUI = () => {};
        w.spawnMoneyParticles = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('claimQuestReward: paga il premio dalla porta, sposta in completate, applica l\'unlock', () => {
        gs().claimableQuests = ['t02'];      // t02 rewards: { cash:500, unlock:'dispatch' }
        gs().completedQuests = [];
        gs().unlockedFeatures = [];
        const cassaPrima = gs().cash;

        w.claimQuestReward('t02');

        assert.equal(gs().cash, cassaPrima + 500, 'il premio in cash non è stato accreditato');
        assert.ok(gs().completedQuests.includes('t02'));
        assert.ok(!gs().claimableQuests.includes('t02'), 'resta fra le riscuotibili');
        assert.ok(gs().unlockedFeatures.includes('dispatch'), 'l\'unlock non è stato applicato');
    });

    test('claimQuestReward: seconda chiamata → non paga due volte', () => {
        gs().claimableQuests = ['t02'];
        gs().completedQuests = [];
        w.claimQuestReward('t02');
        const cassaDopoPrimo = gs().cash;

        w.claimQuestReward('t02');            // non più claimable

        assert.equal(gs().cash, cassaDopoPrimo, 'ha pagato una seconda volta');
    });

    test('claimQuestReward: quest non riscuotibile → niente', () => {
        gs().claimableQuests = [];
        gs().completedQuests = [];
        const cassaPrima = gs().cash;
        w.claimQuestReward('t02');
        assert.equal(gs().cash, cassaPrima);
        assert.ok(!(gs().completedQuests || []).includes('t02'));
    });
});
