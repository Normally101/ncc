'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/auth + landing — accesso e vetrina (auth.js, ui-landing.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 34.

   · authLogout()             — esce: blocca l'autosave, mette in pausa, chiama
     supabase signOut, azzera currentUser e la cache locale degli slot.
   · _authLogin() / _authSignup()  — leggono email/password dai campi, validano
     (campi pieni, email valida, password ≥ 6 per il signup) e poi chiamano
     supabase. Con i campi vuoti → messaggio d'errore, nessuna chiamata.
   · closeLbIfBackdrop(e)     — chiude il lightbox solo se il click è sul backdrop.
   · openShowcase(idx)        — apre il lightbox della vetrina; indice ignoto → niente.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/auth — authLogout', () => {
    let env, w, signOutChiamato;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        signOutChiamato = false;
        w.supabaseClient = { auth: { signOut: async () => { signOutChiamato = true; } } };
        w.currentUser = { id: 'u1' };
        ['chauffeurEmpireSlot_1', 'chauffeurEmpireSlot_2', 'chauffeurEmpireSlot_3']
            .forEach(k => w.localStorage.setItem(k, '{}'));
    });
    afterEach(() => env.stopAllIntervals());

    test('authLogout: pausa, signOut, currentUser azzerato, cache slot ripulita', async () => {
        await w.authLogout();

        assert.equal(signOutChiamato, true, 'supabase signOut non è stato chiamato');
        assert.equal(w.currentUser, null, 'currentUser non è stato azzerato');
        assert.equal(w._suppressCloudSave, true);
        assert.equal(w.gameState.paused, true);
        for (const k of ['chauffeurEmpireSlot_1', 'chauffeurEmpireSlot_2', 'chauffeurEmpireSlot_3']) {
            assert.equal(w.localStorage.getItem(k), null, `${k} non è stato rimosso`);
        }
    });
});

describe('sistemi/landing — _authLogin / _authSignup', () => {
    let env, w, doc, signIn, signUp;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        signIn = []; signUp = [];
        w.CE_RateLimit = { check: () => true, reset: () => {}, blockedFor: () => 0 };
        w.supabaseClient = { auth: {
            signInWithPassword: async (a) => { signIn.push(a); return { data: { user: {} }, error: null }; },
            signUp:             async (a) => { signUp.push(a); return { data: { user: {} }, error: null }; },
        } };
        w._onAuthSuccess = async () => {};
        for (const id of ['auth-email', 'auth-password']) {
            const el = doc.createElement('input'); el.id = id; doc.body.appendChild(el);
        }
        const err = doc.createElement('div'); err.id = 'auth-error'; doc.body.appendChild(err);
    });
    afterEach(() => env.stopAllIntervals());

    const errText = () => doc.getElementById('auth-error').textContent;
    const setCampi = (email, pass) => {
        doc.getElementById('auth-email').value = email;
        doc.getElementById('auth-password').value = pass;
    };

    test('_authLogin: campi vuoti → messaggio d\'errore, nessuna chiamata a supabase', async () => {
        setCampi('', '');
        await w._authLogin();
        assert.match(errText(), /email e password/i);
        assert.equal(signIn.length, 0);
    });

    test('_authLogin: credenziali valide → signInWithPassword con email in minuscolo', async () => {
        setCampi('  MARIO@Example.COM ', 'secret1');
        await w._authLogin();
        assert.equal(signIn.length, 1, 'supabase non è stato chiamato');
        assert.equal(signIn[0].email, 'mario@example.com', 'email non normalizzata');
    });

    test('_authSignup: password troppo corta → errore, nessuna chiamata', async () => {
        setCampi('mario@example.com', 'abc');
        await w._authSignup();
        assert.match(errText(), /[Pp]assword troppo corta/);
        assert.equal(signUp.length, 0);
    });

    test('_authSignup: dati validi → signUp chiamato', async () => {
        setCampi('mario@example.com', 'secret1');
        await w._authSignup();
        assert.equal(signUp.length, 1);
    });
});

describe('sistemi/landing — lightbox vetrina', () => {
    let env, w, doc;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        // `openShowcase` legge il global di browser `event` nel template (window.event
        // durante il dispatch di un click). Nel banco non c'è un dispatch reale: lo
        // rendiamo risolvibile, come farebbe il browser.
        env.sandbox.event = null;
    });
    afterEach(() => env.stopAllIntervals());

    test('closeLbIfBackdrop: chiude solo se click sul backdrop (target === currentTarget)', () => {
        const lb = doc.createElement('div'); lb.id = 'lp-lightbox'; doc.body.appendChild(lb);
        const backdrop = {};
        w.closeLbIfBackdrop({ target: backdrop, currentTarget: {} });   // click interno
        assert.ok(doc.getElementById('lp-lightbox'), 'ha chiuso su un click interno');

        w.closeLbIfBackdrop({ target: backdrop, currentTarget: backdrop });  // click sul backdrop
        assert.equal(doc.getElementById('lp-lightbox'), null, 'non ha chiuso sul backdrop');
    });

    test('openShowcase: indice valido apre il lightbox, indice ignoto non fa nulla', () => {
        w.openShowcase(0);
        assert.ok(doc.getElementById('lp-lightbox'), 'il lightbox non è stato aperto');

        w.openShowcase(0);   // riapertura: resta un solo lightbox
        assert.equal(doc.querySelectorAll('#lp-lightbox').length, 1);

        doc.getElementById('lp-lightbox').remove();
        w.openShowcase(999);
        assert.equal(doc.getElementById('lp-lightbox'), null);
    });
});
