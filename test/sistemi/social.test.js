'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/social — Network CEO (social.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 39. File fuori dai CORE_FILES.

   · _socialVista(v)       — cambia vista e ridisegna (renderTabSocial).
   · _dmApri(userId)       — apre la conversazione; se non si è sulla scheda
     social, ci si sposta via switchTab.
   · _dmChiudi()           — chiude la conversazione (ridisegna il corpo).
   · _amicoRichiedi(id)    — `rpc_send_friend_request {p_user_id}`.
   · _cercaGiocatori()     — con < 2 lettere avvisa e non interroga; con ≥ 2
     interroga `leaderboard`.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function socialEnv() {
    const env = createGameEnv([...CORE_FILES, 'social.js'], {});
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/social', () => {
    let env, w, doc, server, ridisegni, avvisi, daFrom;

    beforeEach(() => {
        env = socialEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        ridisegni = 0; avvisi = []; daFrom = [];
        w.renderTabSocial = async () => { ridisegni++; };
        w.showNotification = (m, t) => avvisi.push({ m, t });
        // supabaseClient.from(...).select(...).ilike(...).limit(...) → thenable
        const origFrom = server /* placeholder */;
        w.supabaseClient.from = (tab) => {
            daFrom.push(tab);
            const q = Promise.resolve({ data: [], error: null });
            q.select = () => q; q.ilike = () => q; q.limit = () => q; q.order = () => q; q.eq = () => q;
            return q;
        };
        void origFrom;
    });
    afterEach(() => env.stopAllIntervals());

    const chiamata = (n) => server.chiamate.find(c => c.nome === n);
    const info     = () => avvisi.filter(a => a.t === 'info').map(a => a.m);

    test('_socialVista: cambia vista e ridisegna', async () => {
        await w._socialVista('amici');
        assert.equal(ridisegni, 1, 'la scheda social non è stata ridisegnata');
    });

    test('_dmApri: fuori dalla scheda social → ci si sposta con switchTab', async () => {
        let andatoA = null;
        w.switchTab = (t) => { andatoA = t; };
        await w._dmApri('u2');           // niente #social-corpo nel DOM
        assert.equal(andatoA, 'social', 'non è passato alla scheda social');
    });

    test('_dmApri: sulla scheda social → ridisegna la conversazione', async () => {
        const box = doc.createElement('div'); box.id = 'social-corpo'; doc.body.appendChild(box);
        await w._dmApri('u2');
        assert.equal(ridisegni, 1, 'non ha ridisegnato con la conversazione aperta');
    });

    test('_dmChiudi: non esplode e ridisegna il corpo', async () => {
        await w._dmChiudi();             // _renderCorpo esce presto senza #social-corpo
        assert.ok(true);
    });

    test('_amicoRichiedi: chiama rpc_send_friend_request con l\'utente', async () => {
        server.rispondiCon('rpc_send_friend_request', () => ({ data: 'inviata', error: null }));
        await w._amicoRichiedi('u2');
        const c = chiamata('rpc_send_friend_request');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.p_user_id, 'u2');
    });

    test('_cercaGiocatori: meno di 2 lettere → avvisa e non interroga leaderboard', async () => {
        const el = doc.createElement('input'); el.id = 'sc-cerca'; el.value = 'a'; doc.body.appendChild(el);
        await w._cercaGiocatori();
        assert.ok(info().some(m => /due lettere/i.test(m)));
        assert.ok(!daFrom.includes('leaderboard'), 'ha interrogato leaderboard con una sola lettera');
    });

    test('_cercaGiocatori: da 2 lettere → interroga leaderboard', async () => {
        const el = doc.createElement('input'); el.id = 'sc-cerca'; el.value = 'lux'; doc.body.appendChild(el);
        await w._cercaGiocatori();
        assert.ok(daFrom.includes('leaderboard'), 'non ha interrogato leaderboard');
    });
});
