'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/vanity + vittorio + driver_skills — tre sistemi piccoli e vicini.

   Fase 3 di PIANO-CHIUSURA.md, sistema 20.

   · vanity (vanity.js): _vanityEmblem / _vanityColor / _vanityTitle — cosmetici
     in DC. Se già posseduti si equipaggiano gratis; se nuovi si comprano con
     `CE_money.spendDC` e solo allora si equipaggiano.
   · vittorio (vittorio.js): repayVittorio (paga min(richiesto, residuo, cassa),
     rep +0,3 se salda), flipVittorio (solo con prestige ≥ 1), _closeVittorioModal.
   · driver_skills (driver_skills.js): driverSelectBranch (permanente),
     driverUnlockSkill (costa punti abilità, rispetta i prerequisiti),
     renderDriverSkillModal (costruisce il modal).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/vanity', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.gameState.driverCoins = 1000;
        w.gameState.ownedEmblems = []; w.gameState.ownedColors = []; w.gameState.ownedTitles = [];
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;
    // EMBLEMS/COLORS/TITLES vivono nella IIFE di vanity.js: valori noti dal sorgente.
    const EMBLEMA_A_PAGAMENTO = '⚜️';   // c: 5
    const COLORE_A_PAGAMENTO  = '#8aa0b5'; // Platino, c: 6
    const TITOLO_A_PAGAMENTO  = 'Magnate'; // c: 8

    test('_vanityEmblem: compra in DC uno stemma nuovo e lo equipaggia', () => {
        w._vanityEmblem(EMBLEMA_A_PAGAMENTO);
        assert.equal(gs().driverCoins, 1000 - 5);
        assert.ok(gs().ownedEmblems.includes(EMBLEMA_A_PAGAMENTO));
        assert.equal(gs().companyLogo, EMBLEMA_A_PAGAMENTO);
    });

    test('_vanityEmblem: uno stemma già posseduto si riequipaggia gratis', () => {
        gs().ownedEmblems.push(EMBLEMA_A_PAGAMENTO);
        w._vanityEmblem(EMBLEMA_A_PAGAMENTO);
        assert.equal(gs().driverCoins, 1000, 'ha ripagato uno stemma che aveva già');
        assert.equal(gs().companyLogo, EMBLEMA_A_PAGAMENTO);
    });

    test('_vanityColor: senza DC per un colore nuovo non lo equipaggia', () => {
        gs().driverCoins = 0;
        w._vanityColor(COLORE_A_PAGAMENTO);
        assert.ok(!gs().ownedColors.includes(COLORE_A_PAGAMENTO));
        assert.notEqual(gs().companyColor, COLORE_A_PAGAMENTO);
    });

    test('_vanityTitle: compra in DC e imposta il titolo', () => {
        w._vanityTitle(TITOLO_A_PAGAMENTO);
        assert.equal(gs().driverCoins, 1000 - 8);
        assert.equal(gs().companyTitle, TITOLO_A_PAGAMENTO);
    });
});

describe('sistemi/vittorio', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 200000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        R.conDebitoVittorio(env);
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('repayVittorio: paga un acconto e riduce il residuo', () => {
        const d = gs().vittorioDebt;
        d.outstanding = 800;               // sopra l'acconto, così resta attivo
        const cassaPrima = gs().cash;

        w.repayVittorio(200);

        assert.equal(gs().cash, cassaPrima - 200);
        assert.equal(d.outstanding, 600);
        assert.equal(d.status, 'active');
    });

    test('repayVittorio: saldare tutto chiude il debito e dà +0,3★', () => {
        const d = gs().vittorioDebt;
        gs().reputation = 2;
        R.conSoldi(env, d.outstanding + 50000);

        w.repayVittorio(d.outstanding);

        assert.equal(d.outstanding, 0);
        assert.equal(d.status, 'repaid');
        assert.ok(gs().reputation > 2);
    });

    test('repayVittorio senza contanti: errore, debito invariato', () => {
        const d = gs().vittorioDebt;
        const residuoPrima = d.outstanding;
        R.conSoldi(env, 0);
        w.repayVittorio(5000);
        assert.equal(d.outstanding, residuoPrima);
    });

    test('flipVittorio: serve prestige ≥ 1; con prestige ribalta lo strozzino in socio', () => {
        gs().prestige = 0;
        w.flipVittorio();
        assert.equal(gs().vittorioDebt.status, 'active', 'senza prestige non doveva ribaltare');

        gs().prestige = 1;
        w.flipVittorio();
        assert.equal(gs().vittorioDebt.status, 'flipped');
        assert.equal(gs().vittorioPartner, true);
    });

    test('_closeVittorioModal: rimuove l\'overlay #vittorio-modal', () => {
        const m = env.sandbox.document.createElement('div'); m.id = 'vittorio-modal';
        env.sandbox.document.body.appendChild(m);
        w._closeVittorioModal();
        assert.equal(env.sandbox.document.getElementById('vittorio-modal'), null);
    });
});

describe('sistemi/driver_skills', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.renderDriverSkillModal = w.renderDriverSkillModal;   // resta la vera
        w.gameState.drivers.push({ id: 'd1', name: 'Rookie', level: 3, skill_tree: { branch: null, unlocked: [], skill_points: 5 } });
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const tree   = () => R.catalogo(env, 'DRIVER_SKILL_TREE') || w.DRIVER_SKILL_TREE;

    test('driverSelectBranch: sceglie un ramo, e poi non lo si può cambiare', () => {
        const branchKey = Object.keys(tree())[0];
        w.driverSelectBranch('d1', branchKey);
        assert.equal(gs().drivers.find(d => d.id === 'd1').skill_tree.branch, branchKey);

        const altro = Object.keys(tree())[1];
        w.driverSelectBranch('d1', altro);
        assert.equal(gs().drivers.find(d => d.id === 'd1').skill_tree.branch, branchKey, 'il ramo è cambiato');
        assert.ok(errori().some(m => /già scelto/i.test(m)));
    });

    test('driverUnlockSkill: senza un ramo scelto rifiuta', () => {
        const skillId = tree()[Object.keys(tree())[0]].skills[0].id;
        w.driverUnlockSkill('d1', skillId);
        assert.ok(errori().some(m => /ramo/i.test(m)));
    });

    test('driverUnlockSkill: spende i punti abilità e sblocca; prerequisiti rispettati', () => {
        const branchKey = Object.keys(tree())[0];
        const skills = tree()[branchKey].skills;
        const primo = skills.find(s => (s.requires || []).length === 0);
        w.driverSelectBranch('d1', branchKey);
        const st = gs().drivers.find(d => d.id === 'd1').skill_tree;
        const puntiPrima = st.skill_points;

        w.driverUnlockSkill('d1', primo.id);

        assert.ok(st.unlocked.includes(primo.id));
        assert.equal(st.skill_points, puntiPrima - primo.cost);

        // una skill che richiede un prerequisito non ancora sbloccato
        const conReq = skills.find(s => (s.requires || []).some(r => !st.unlocked.includes(r)));
        if (conReq) {
            w.driverUnlockSkill('d1', conReq.id);
            assert.ok(!st.unlocked.includes(conReq.id));
            assert.ok(errori().some(m => /[Pp]rerequisiti/.test(m)));
        }
    });

    test('renderDriverSkillModal: costruisce il modal #driver-skill-modal', () => {
        w.driverSelectBranch('d1', Object.keys(tree())[0]);
        w.renderDriverSkillModal('d1');
        assert.ok(env.sandbox.document.getElementById('driver-skill-modal'));
    });
});
