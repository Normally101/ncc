'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/map-svg — mappa 2D di riserva (map-svg.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 42. File fuori dai CORE_FILES.

   · _mapSbloccaRegione(id) — inoltra a `buyRegion(id)` (server-authoritative) e
     poi rinfresca la mappa. Se `buyRegion` non c'è, non fa nulla.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function mapEnv() {
    const env = createGameEnv([...CORE_FILES, 'map-svg.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/map-svg', () => {
    let env, w;

    beforeEach(() => {
        env = mapEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
    });
    afterEach(() => env.stopAllIntervals());

    test('_mapSbloccaRegione: inoltra a buyRegion con l\'id della regione', async () => {
        const chiamate = [];
        w.buyRegion = (id) => { chiamate.push(id); return Promise.resolve({ success: true }); };

        await w._mapSbloccaRegione('lazio');

        assert.deepEqual(chiamate, ['lazio'], 'buyRegion non è stato chiamato con la regione');
    });

    test('_mapSbloccaRegione: senza buyRegion non esplode', () => {
        w.buyRegion = undefined;
        w._mapSbloccaRegione('lazio');
        assert.ok(true);
    });
});
