'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/ranking — classifica globale (ui-ranking.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 44. File fuori dai CORE_FILES.

   · renderTabRanking() — disegna la scheda "Classifica Globale" dentro
     #tab-container; se c'è un client, interroga la view `leaderboard` e mostra
     le righe.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function rankEnv() {
    const env = createGameEnv([...CORE_FILES, 'ui-ranking.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/ranking', () => {
    let env, w, doc;

    beforeEach(() => {
        env = rankEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
    });
    afterEach(() => env.stopAllIntervals());

    const container = () => doc.getElementById('tab-container');

    test('renderTabRanking: senza container non esplode', async () => {
        doc.getElementById('tab-container').remove();
        await w.renderTabRanking();
        assert.ok(true);
    });

    test('renderTabRanking: disegna la scheda "Classifica Globale" e interroga leaderboard', async () => {
        const daFrom = [];
        w.supabaseClient = {
            from: (t) => {
                daFrom.push(t);
                const q = Promise.resolve({ data: [{ user_id: 'u9', company_name: 'Impero Test', liquid_assets: 9e6, reputation: 4.2, fleet_count: 12 }], error: null });
                q.select = () => q; q.order = () => q; q.limit = () => q; q.eq = () => q;
                return q;
            },
        };
        w.currentUser = { id: 'me' };

        await w.renderTabRanking();

        assert.match(container().innerHTML, /Classifica Globale/);
        assert.ok(daFrom.includes('leaderboard'), 'non ha interrogato la view leaderboard');
        assert.match(container().innerHTML, /Impero Test/);
    });
});
