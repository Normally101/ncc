'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/war_room — la War Room delle province (war_room.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 40. File fuori dai CORE_FILES.

   · _wrAcquire(provinceId) — legge l'offerta da `#wri-<id>`, valida (>0, cassa
     capiente), poi `ServerState.acquireProvince`; su successo evento + ridisegno.
   · _wrClose()             — rimuove l'overlay #wr-overlay e ripristina #main-panel.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function wrEnv(serverState) {
    const env = createGameEnv([...CORE_FILES, 'war_room.js'], { serverState });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/war_room', () => {
    let env, w, doc, avvisi, eventi, chiamate;

    beforeEach(() => {
        chiamate = [];
        env = wrEnv({
            acquireProvince: async (id, offer) => {
                chiamate.push({ id, offer });
                return { success: true, province_name: 'Latina' };
            },
        });
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        avvisi = []; eventi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = (i, t) => eventi.push(t);
        w.renderTabWarRoom = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);

    function offerInput(id, value) {
        const el = doc.createElement('input'); el.id = `wri-${id}`; el.value = String(value);
        doc.body.appendChild(el);
    }

    test('_wrAcquire: offerta valida → RPC con id e importo, evento di conquista', async () => {
        R.conSoldi(env, 400000);
        offerInput('pv1', 90000);

        await w._wrAcquire('pv1');

        assert.deepEqual(chiamate, [{ id: 'pv1', offer: 90000 }]);
        assert.ok(eventi.some(t => /Latina/.test(t)), 'nessun evento di conquista');
    });

    test('_wrAcquire: offerta non valida → errore, niente server', async () => {
        R.conSoldi(env, 400000);
        offerInput('pv1', 0);
        await w._wrAcquire('pv1');
        assert.equal(chiamate.length, 0);
        assert.ok(errori().some(m => /offerta valida/i.test(m)));
    });

    test('_wrAcquire: fondi insufficienti → errore, niente server', async () => {
        R.conSoldi(env, 10000);
        offerInput('pv1', 90000);
        await w._wrAcquire('pv1');
        assert.equal(chiamate.length, 0);
        assert.ok(errori().some(m => /[Ff]ondi insufficienti/.test(m)));
    });

    test('_wrClose: rimuove #wr-overlay e ripristina #main-panel', () => {
        const ov = doc.createElement('div'); ov.id = 'wr-overlay'; doc.body.appendChild(ov);
        const mp = doc.createElement('div'); mp.id = 'main-panel'; mp.style.display = 'none'; doc.body.appendChild(mp);

        w._wrClose();

        assert.equal(doc.getElementById('wr-overlay'), null, 'l\'overlay non è stato rimosso');
        assert.equal(mp.style.display, '', 'il pannello principale non è stato ripristinato');
    });
});
