'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/hq — il Base Builder multi-città (hq.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 24. Tre azioni:

   · hqSwitchCity(cityId)              — cambia la città HQ mostrata.
   · _hqBuildFromList(roomId)         — costruisce la stanza nel primo slot libero
     della città corrente (delega a hqUpgradeRoom).
   · hqUpgradeRoom(city,room,slot)    — costruisce/migliora: controlla prereq,
     reputazione e cassa, poi spende in locale (CE_money.spend) e alza il livello.

   L'HQ è dietro l'interruttore `HQ_ENABLED` (config.js: false dal 19/08). I test
   accendono l'interruttore per esercitare la logica vera, e uno lo lascia spento
   apposta per difendere la guardia — senza la quale la spesa avveniva solo in
   locale (nessun syncCash) e la stanza restava: costruzione gratis al reload.

   Stato di partenza (initGame): a Roma il `garage_main` è già L1 nello slot 0.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/hq', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        w.HQ_ENABLED = true;
        w.hqInit();
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.renderTabHQ = () => {};
        w.updateUI = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const livello = (room) => w.hqGetRoomLevel('roma', room);

    test('hqSwitchCity: cambia la città HQ corrente', () => {
        w.hqSwitchCity('milano');
        assert.equal(gs().currentHQCity, 'milano');
    });

    test('_hqBuildFromList: costruisce una nuova stanza nel primo slot libero e ne scala il costo', async () => {
        gs().currentHQCity = 'roma';
        R.conSoldi(env, 400000);
        assert.equal(livello('workshop'), 0);
        const cassaPrima = gs().cash;

        w._hqBuildFromList('workshop');            // cost 180000, prereq garage_main ✓
        await new Promise(r => setImmediate(r));

        assert.equal(livello('workshop'), 1, 'l\'officina non è stata costruita');
        assert.equal(gs().cash, cassaPrima - 180000, 'il costo non è stato scalato');
        const grid = gs().hqs.roma.grid;
        assert.ok(Object.values(grid).includes('workshop'), 'nessuno slot occupato dall\'officina');
    });

    test('hqUpgradeRoom: un miglioramento a pagamento scala la cassa in locale e alza il livello', async () => {
        R.conSoldi(env, 300000);
        gs().reputation = 1;                       // garage L2 chiede reqRep 1
        const cassaPrima = gs().cash;

        await w.hqUpgradeRoom('roma', 'garage_main');   // L1 → L2 (cost 100000)

        assert.equal(livello('garage_main'), 2, 'il garage non è salito a L2');
        assert.equal(gs().cash, cassaPrima - 100000, 'il costo non è stato scalato');
    });

    test('hqUpgradeRoom: cassa insufficiente → errore, nessuna spesa, livello invariato', async () => {
        R.conSoldi(env, 50000);
        gs().reputation = 1;
        const cassaPrima = gs().cash;

        await w.hqUpgradeRoom('roma', 'garage_main');    // L1 → L2 vuole 100000

        assert.equal(livello('garage_main'), 1, 'è salito senza fondi');
        assert.equal(gs().cash, cassaPrima, 'ha speso comunque');
        assert.ok(errori().some(m => /[Ff]ondi insufficienti/.test(m)));
    });

    test('hqUpgradeRoom: con l\'interruttore spento non costruisce e non tocca la cassa', async () => {
        w.HQ_ENABLED = false;
        R.conSoldi(env, 400000);
        const cassaPrima = gs().cash;

        w._hqBuildFromList('workshop');
        await new Promise(r => setImmediate(r));

        assert.equal(livello('workshop'), 0, 'ha costruito a interruttore spento');
        assert.equal(gs().cash, cassaPrima, 'ha toccato la cassa a interruttore spento');
    });
});
