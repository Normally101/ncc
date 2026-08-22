'use strict';
/**
 * Copertura del banco di prova: TUTTI gli script locali di index.html devono
 * stare in CORE_FILES, tranne quelli esclusi a nota qui sotto.
 *
 * Perche' questo test esiste: il 22/08 e' stato misurato uno per uno ognuno dei
 * 37 file allora fuori dal banco e 34 si caricano senza errori. Portarli dentro
 * a scaglioni senza un test che sorveglia la copertura significa che il prossimo
 * ritocco a game-env.js puo' far uscire un file in silenzio e nessuno se ne
 * accorge (il guardrail dei soli NON_CARICABILI non copre questo buco: non sa
 * quali file DOVREBBO caricare il banco).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

/* Fuori dal banco, col motivo. L'elenco puo' solo ACCORCIARSI.
   I primi tre sono la proiezione di NON_CARICABILI (banco-file-mancanti.test.js);
   serverState.js invece si caricherebbe ma resta fuori PER PROGETTO: definisce
   `const ServerState` nel lessico globale del contesto VM e chiude con
   window.ServerState = ServerState — da quel momento ogni riferimento risolve
   al client reale (che vuole Supabase), non piu' al mock che usano in blocco
   i test costruiti su freshEnv(). */
const ESCLUSI_A_NOTA = {
    'supabase-config.js': "serve la libreria Supabase (createClient), che nel banco non c'e'",
    'map-visual.js':      'usa la globale `map` di Mapbox, che esiste solo con la mappa vera',
    'motion.js':          'usa IntersectionObserver, che jsdom non fornisce',
    'serverState.js':     'e\' sostituito dal mock ServerState del banco: caricarlo toglierebbe il mock a tutti gli altri test',
};

test('il banco di prova carica ogni script di index.html tranne quelli esclusi a nota', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const re = /<script\s+[^>]*src="([^"]+\.js)(?:\?[^"]*)?"/g;
    const script = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        if (!m[1].startsWith('http')) script.push(m[1]);
    }

    const dimenticati = script.filter(f => !CORE_FILES.includes(f) && !(f in ESCLUSI_A_NOTA));

    assert.deepEqual(
        dimenticati, [],
        'Questi script di index.html non sono ne\' in CORE_FILES ne\' nell\'elenco delle esclusioni:\n' +
        dimenticati.map(f => `  - ${f}`).join('\n') + '\n' +
        'O entrano nel banco (a scaglioni, in ordine di index.html) oppure finiscono\n' +
        'in ESCLUSI_A_NOTA col motivo vero.'
    );
});
