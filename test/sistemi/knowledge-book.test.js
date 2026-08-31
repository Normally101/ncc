'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/knowledge-book — il manuale (knowledge-book.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 33. Una azione:

   · _kbApri(id) — apre un capitolo del manuale: memorizza `_kbCapitoloAperto`,
     ridisegna la scheda e riporta lo scroll del contenuto in cima.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/knowledge-book', () => {
    let env, w, ridisegni;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        ridisegni = 0;
        w.renderTabManuale = () => { ridisegni++; };
    });
    afterEach(() => env.stopAllIntervals());

    const doc = () => env.sandbox.document;

    test('_kbApri: memorizza il capitolo, ridisegna e riporta lo scroll in cima', () => {
        let scrolledTo = null;
        const c = doc().createElement('div'); c.id = 'kb-contenuto';
        c.scrollTo = (x, y) => { scrolledTo = [x, y]; };
        doc().body.appendChild(c);

        w._kbApri('economia');

        assert.equal(w._kbCapitoloAperto, 'economia', 'il capitolo aperto non è stato memorizzato');
        assert.equal(ridisegni, 1, 'la scheda non è stata ridisegnata');
        assert.deepEqual(scrolledTo, [0, 0], 'lo scroll non è tornato in cima');
    });

    test('_kbApri: senza il contenitore #kb-contenuto non esplode', () => {
        w._kbApri('flotta');
        assert.equal(w._kbCapitoloAperto, 'flotta');
        assert.equal(ridisegni, 1);
    });
});
