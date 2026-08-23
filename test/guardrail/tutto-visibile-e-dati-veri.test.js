'use strict';
/* ============================================================================
   Tutto visibile dal primo minuto, e niente dati finti.

   Decisione di Vlad del 22/08/2026 (HANDOFF.md): tutto il gioco resta
   disponibile dall'inizio, nessuna area sbloccabile. E il playtest ha
   beccato due dati finti: il contatore «137 ONLINE» di Mondo NCC (un numero
   scritto nel codice, non letto dal server) e le news NPC del feed,
   spacciate per eventi reali.

   Questo test difende le tre decisioni sul codice vero:

     1. Nessuna scheda dietro gate: ogni voce di FEATURES è accesa e
        tabSpenta() non spegne più nulla sulla pagina vera (index.html).
     2. Il contatore ONLINE vale esattamente ciò che riporta la presenza
        reale (ui-ranking → window._worldRealOnline): zero dati = zero.
     3. Il feed di Mondo NCC parte vuoto e si riempie SOLO di eventi reali
        dalla tabella Supabase `global_news`.
   ============================================================================ */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** La pagina vera con config.js + feature-gate.js caricati dentro. */
function apriIlGioco() {
    const dom = new JSDOM(leggi('index.html'), { runScripts: 'outside-only' });
    const w = dom.window;
    const ctx = dom.getInternalVMContext();
    for (const file of ['config.js', 'feature-gate.js']) {
        vm.runInContext(leggi(file), ctx, { filename: file });
    }
    w.applicaInterruttori();
    return w;
}

/**
 * world-feed.js da solo, senza rete e senza timer veri.
 * Il setTimeout spento serve anche da lente: sul codice vecchio il feed
 * riarmava un timer a tempo indeterminato che teneva vivo il processo.
 */
function caricaWorldFeed(extra) {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
    const w = dom.window;
    const ctx = dom.getInternalVMContext();
    w.setTimeout = () => 0;
    Object.assign(w, extra || {});
    vm.runInContext(leggi('world-feed.js'), ctx, { filename: 'world-feed.js' });
    return w;
}

/** Microtask svuotati: loadReal() è async e va lasciata concludere. */
const aspetta = () => new Promise(r => setImmediate(r));

describe('guardrail — tutte le tab sempre visibili', () => {
    let w;
    before(() => { w = apriIlGioco(); });

    test('nessuna funzione risulta spenta in config.js', () => {
        const spente = Object.entries(w.FEATURES)
            .filter(([nome, on]) => !on).map(([nome]) => nome);
        assert.deepEqual(spente.sort(), [],
            'Dalla decisione del 22/08 tutto il gioco è disponibile dall\'inizio:\n' +
            'nessuna voce di FEATURES può restare false.');
    });

    test('ogni voce di menu della pagina vera è cliccabile a partita appena creata', () => {
        /* La barra laterale è HTML statico in index.html: la visibilità la
           governa solo tabSpenta(). gameState appena creato non cambia nulla —
           ed è proprio questo il punto: nessuna tab dipende da progressione. */
        const spente = [...new Set(
            [...w.document.querySelectorAll('[data-tab]')]
                .map(el => el.getAttribute('data-tab'))
                .filter(tab => w.tabSpenta(tab))
        )];
        assert.deepEqual(spente, [],
            'Queste schede risultano spente ma sono nel menu del giocatore nuovo.\n' +
            'Nessuna area del gioco deve stare dietro un gate.');
    });

    test('il foglio di stile del gate non nasconde più nulla', () => {
        const foglio = w.document.getElementById('feature-gate-style');
        const testo = foglio ? foglio.textContent.replace(/\/\*[\s\S]*?\*\//g, '').trim() : '';
        assert.equal(testo, '',
            'feature-gate.js sta ancora scrivendo regole display:none: con tutte\n' +
            'le funzioni accese il foglio deve restare vuoto.');
    });
});

describe('guardrail — il contatore ONLINE dice il vero', () => {
    test('senza dati reali vale zero, non un minimo inventato', () => {
        const w = caricaWorldFeed();
        assert.equal(w._worldOnline(), 0,
            '_worldOnline() ha restituito un numero senza nessuna fonte: è un\n' +
            'dato finto scritto nel codice (il «137 ONLINE» del playtest).');
    });

    test('vale esattamente la presenza reale riportata dalla classifica', () => {
        const w = caricaWorldFeed({ _worldRealOnline: 3 });
        assert.equal(w._worldOnline(), 3);
    });
});

describe('guardrail — Mondo NCC senza news finte', () => {
    test('a fresco il feed è vuoto e lo dice', () => {
        const w = caricaWorldFeed();
        assert.equal(w._worldFeed.length, 0,
            'Il feed contiene eventi all\'avvio senza che il server abbia detto\n' +
            'nulla: sono news inventate.');
        const html = w.renderWorldFeedHTML();
        assert.match(html, /si sta svegliando/,
            'A feed vuoto la home deve mostrare lo stato vuoto, non eventi finti.');
    });

    test('il codice non porta piu\u0300 dentro nomi e frasi delle news NPC', () => {
        for (const file of ['world-feed.js', 'ui-home.js']) {
            const src = leggi(file);
            assert.ok(!src.includes('Black Tie Chauffeurs'),
                `${file} contiene ancora il pool di aziende finte delle news NPC.`);
            assert.ok(!src.includes('npcEvent') && !src.includes('renderConflictHTML'),
                `${file} genera ancora eventi simulati spacciati per reali.`);
        }
    });

    test('gli eventi reali di global_news arrivano nel feed marcati live', async () => {
        const canale = { on() { return canale; }, subscribe() { return canale; } };
        const w = caricaWorldFeed({
            supabaseClient: {
                from(tabella) {
                    assert.equal(tabella, 'global_news');
                    return {
                        select() {
                            return { order() {
                                return { limit() {
                                    return Promise.resolve({ data: [{
                                        message: 'NovaDrive NCC ha conquistato la provincia di Milano',
                                        created_at: new Date().toISOString(),
                                    }] });
                                } };
                            } };
                        },
                    };
                },
                channel() { return canale; },
            },
        });
        await aspetta(); await aspetta();

        assert.equal(w._worldFeed.length, 1, 'solo l\'evento reale deve comparire');
        assert.equal(w._worldFeed[0].real, true);
        assert.ok(w._worldFeed[0].x.includes('NovaDrive NCC'));
        assert.ok(w.renderWorldFeedHTML().includes('live'),
            'un evento reale va presentato come live, non mescolato ai finti');
    });
});
