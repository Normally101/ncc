'use strict';
/* ============================================================================
   test/funzioni/tab-sempre-visibili.test.js — Nessuna tab dietro un cancello

   Decisione Vlad 22/08 (HANDOFF.md): tutto il gioco resta disponibile
   dall'inizio, nessuna area sbloccabile. Si verifica che:
   1. ogni voce della barra di navigazione in index.html sia cliccabile a
      partita nuova (gameState appena creato): window.tabSpenta(tab) === false,
      quindi anche il guardiano dentro switchTab (dispatcher.js) la lascia passare;
   2. feature-gate.js non scriva alcuna regola CSS display:none sui punti
      d'ingresso (voci di menu data-tab, riquadri home data-ce-args);
   3. gs.unlockedFeatures non governi nessuna scheda: l'unico file di
      produzione che la cita è quests.js, che la SCRIVE come status — nessuno
      la legge come cancello.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/** Tutti i data-tab distinti presenti negli statici di index.html (topbar + sidebar). */
function tabNelDomStatico() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    return [...new Set([...html.matchAll(/data-tab="([a-z-]+)"/g)].map(m => m[1]))];
}

describe('Tab sempre visibili e cliccabili dal primo minuto', () => {

    test('a partita nuova nessuna scheda della navigazione è spenta', () => {
        const env = freshEnv();
        const tabs = tabNelDomStatico();
        assert.ok(tabs.length >= 20, `index.html deve contenere le voci di menu (trovate ${tabs.length})`);
        for (const tab of tabs) {
            assert.equal(env.sandbox.window.tabSpenta(tab), false,
                `"${tab}" deve essere cliccabile dall'inizio: nessuna dietro gli interruttori`);
        }
    });

    test('tutti gli interruttori FEATURES sono accesi (nessuna area sbloccabile)', () => {
        const env = freshEnv();
        const spente = Object.entries(env.sandbox.window.FEATURES)
            .filter(([, valore]) => valore !== true)
            .map(([nome]) => nome);
        assert.deepEqual(spente, [],
            'decisione Vlad 22/08: tutto il gioco disponibile dall\'inizio');
    });

    test('feature-gate non nasconde alcun punto d\'ingresso: foglio di stile vuoto', () => {
        const env = freshEnv();
        const doc = env.sandbox.document;
        // Stesse due forme di punto d'ingresso che feature-gate.js sa nascondere:
        // le voci di menu (data-tab) e i riquadri della home (data-ce-args).
        for (const tab of tabNelDomStatico()) {
            const voce = doc.createElement('a');
            voce.setAttribute('data-tab', tab);
            doc.body.appendChild(voce);

            const riquadro = doc.createElement('button');
            riquadro.setAttribute('data-ce-args', `["${tab}"]`);
            doc.body.appendChild(riquadro);
        }
        env.sandbox.window.applicaInterruttori();

        const foglio = doc.getElementById('feature-gate-style');
        assert.ok(foglio, 'il foglio #feature-gate-style esiste');
        assert.equal(foglio.textContent, '',
            'con tutti gli interruttori accesi nessuna voce deve ricevere display:none');
    });

    test('gs.unlockedFeatures è solo uno status scritto dalle missioni: nessun gate lo legge', () => {
        const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
        const cheLoCitano = files.filter(f =>
            fs.readFileSync(path.join(ROOT, f), 'utf8').includes('unlockedFeatures'));
        assert.deepEqual(cheLoCitano, ['quests.js'],
            'nessun file di produzione oltre allo scrittore deve usare unlockedFeatures come cancello');
    });
});
