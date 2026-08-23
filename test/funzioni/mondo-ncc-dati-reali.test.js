'use strict';
/* ============================================================================
   test/funzioni/mondo-ncc-dati-reali.test.js — Niente dati finti in Mondo NCC

   Due difetti chiusi (richiesta Vlad, 23/08):
   1. il chip "N online" mostrava un numero simulato (base sull'ora del giorno
      + jitter) quando dal server non arrivava nulla. Ora il numero è SOLO
      quello reale misurato dal server (window._worldRealOnline, scritto da
      ui-ranking.js sulle righe last_active fresche): senza server è 0.
   2. il feed si pre-semeva di eventi NPC inventati e ne generava altri ogni
      pochi secondi, mescolati alle news vere di global_news senza distinzione.
      Ora il feed contiene SOLO eventi reali dalla tabella global_news.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGameEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/** Ambiente minimale con solo world-feed.js caricato (e config.js, che non tocca). */
function envMondo(supabaseRows) {
    const env = createGameEnv(['config.js', 'world-feed.js']);
    if (supabaseRows !== undefined) {
        env.sandbox.supabaseClient = {
            from: () => ({
                select: () => ({
                    order: () => ({
                        limit: () => Promise.resolve({ data: supabaseRows })
                    })
                })
            }),
            channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        };
    }
    return env;
}

const attendi = (ms) => new Promise(r => setTimeout(r, ms));

describe('Contatore ONLINE di Mondo NCC', () => {

    test('senza dati dal server vale 0: nessun numero inventato', async () => {
        const env = envMondo();
        await attendi(20);
        assert.equal(env.sandbox.window._worldOnline(), 0,
            'zero giocatori online devono mostrare zero, non una stima');
    });

    test('è esattamente il numero reale misurato dal server, per qualunque valore', async () => {
        const env = envMondo([]);
        await attendi(20);
        for (const reale of [1, 7, 42, 137, 250]) {
            env.sandbox.window._worldRealOnline = reale;
            assert.equal(env.sandbox.window._worldOnline(), reale,
                `${reale} online dal server devono comparire come ${reale}, intatti`);
        }
        delete env.sandbox.window._worldRealOnline;
        assert.equal(env.sandbox.window._worldOnline(), 0);
    });

    test('nel codice non resta nessuna formula di presenza simulata', () => {
        const src = fs.readFileSync(path.join(ROOT, 'world-feed.js'), 'utf8');
        for (const traccia of ['dayCurve', 'jitter']) {
            assert.ok(!src.includes(traccia),
                `"${traccia}" era parte della formula fintа: non deve più esserci`);
        }
    });
});

describe('Feed di Mondo NCC', () => {

    test('senza fonte reale il feed nasce vuoto: nessuna news pre-seminata', async () => {
        const env = envMondo();
        await attendi(20);
        assert.equal(env.sandbox.window._worldFeed.length, 0,
            'nessun evento NPC inventato all\'avvio');
        assert.ok(env.sandbox.window.renderWorldFeedHTML().length > 0,
            'il render gestisce il caso vuoto con il suo stato dedicato');
    });

    test('gli eventi del feed arrivano solo da global_news, marcati reali', async () => {
        const righe = [
            { message: 'Nova Drive ha conquistato la provincia di Roma', created_at: '2026-08-23T09:00:00Z' },
            { message: 'Aurelia NCC ha chiuso un contratto Diamond', created_at: '2026-08-23T10:00:00Z' },
        ];
        const env = envMondo(righe);
        await attendi(20);
        assert.equal(env.sandbox.window._worldFeed.length, righe.length);
        for (const evento of env.sandbox.window._worldFeed) {
            assert.ok(evento.real, 'ogni evento nel feed viene da una fonte reale');
        }
    });

    test('nel codice non resta nessun generatore di eventi finti', () => {
        const src = fs.readFileSync(path.join(ROOT, 'world-feed.js'), 'utf8');
        for (const traccia of ['npcEvent', 'startNPC']) {
            assert.ok(!src.includes(traccia),
                `"${traccia}" era il generatore di news finte: non deve più esserci`);
        }
    });
});
