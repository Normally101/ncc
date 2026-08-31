'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/ops — acquisizione province (ui-ops.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 26. Una azione:

   · doAcquireProvince(provinceId) — legge l'offerta da `#offer-<id>`, la valida
     (>0 e cassa capiente), poi chiama `ServerState.acquireProvince`. Su successo
     mostra l'evento e ridisegna. È operazione server-authoritative: la cassa
     scende via il finto ServerState, non in locale.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function opsEnv(serverState) {
    const env = createGameEnv(CORE_FILES, { serverState });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/ops', () => {
    let env, w, avvisi, chiamate;

    beforeEach(() => {
        chiamate = [];
        env = opsEnv({
            acquireProvince: async (id, offer) => {
                chiamate.push({ id, offer });
                env.sandbox.window.gameState.cash -= offer;   // come il bridge dopo l'RPC
                return { success: true, province_name: 'Frosinone' };
            },
        });
        w = env.sandbox.window;
        R.conSchermo(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.renderTabProvinces = () => { w.renderTabProvinces._n = (w.renderTabProvinces._n || 0) + 1; };
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);

    function offerInput(id, value) {
        const el = env.sandbox.document.createElement('input');
        el.id = `offer-${id}`; el.value = String(value);
        env.sandbox.document.body.appendChild(el);
    }

    test('doAcquireProvince: offerta valida → RPC con id e importo, cassa scalata dal server, ridisegno', async () => {
        R.conSoldi(env, 500000);
        offerInput('p1', 120000);

        await w.doAcquireProvince('p1');

        assert.deepEqual(chiamate, [{ id: 'p1', offer: 120000 }]);
        assert.equal(gs().cash, 500000 - 120000, 'la cassa non è stata scalata dal server');
        assert.ok(w.renderTabProvinces._n >= 1, 'nessun ridisegno dopo l\'acquisto');
    });

    test('doAcquireProvince: offerta non valida → errore, niente server', async () => {
        R.conSoldi(env, 500000);
        offerInput('p1', 0);

        await w.doAcquireProvince('p1');

        assert.equal(chiamate.length, 0, 'ha chiamato il server con un\'offerta a zero');
        assert.ok(errori().some(m => /offerta valida/i.test(m)));
    });

    test('doAcquireProvince: fondi insufficienti → errore, niente server', async () => {
        R.conSoldi(env, 50000);
        offerInput('p1', 120000);

        await w.doAcquireProvince('p1');

        assert.equal(chiamate.length, 0, 'ha chiamato il server senza fondi');
        assert.ok(errori().some(m => /[Ff]ondi insufficienti/.test(m)));
    });
});
