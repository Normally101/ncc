'use strict';
/* ============================================================================
   Guardrail — una sola porta anche per la REPUTAZIONE.

   Il tetto della reputazione (5.0 + prestigio) vive SOLO dentro
   CE_money.addReputation (money.js). Chi ha bisogno di alzare o abbassare
   la reputazione deve chiamare quella funzione: ricalcolare il tetto in
   giro duplica la regola e prima o poi le copie divergono.

   Questo test fallisce se qualcuno riscrive il calcolo letterale
   `5.0 + (gameState.prestige ...)` / `5.0+(gs.prestige ...)` fuori da
   money.js. La lista ECCEZIONI puo' solo accorciarsi.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

// L'unico file autorizzato a scrivere il tetto: money.js perche' E' la porta.
const AUTORIZZATI = new Set(['money.js']);

// Debito noto: nessuno. PUO' SOLO RESTARE VUOTA.
const ECCEZIONI = new Set([]);

// Pattern letterali del calcolo del tetto scritto fuori dalla porta.
// Volutamente ESATTI (spazi compresi): vtk-market.js legge `5.0 + (gs.prestige …)`
// per il solo pre-controllo del dry-run su copia, dove la scrittura via porta
// sarebbe impossibile (il dry-run non deve mutare il vero stato).
const PATTERN_TETTO = [
    '5.0 + (gameState.prestige',
    '5.0+(gs.prestige',
];

function fileDiGioco() {
    return fs.readdirSync(ROOT)
        .filter(f => f.endsWith('.js') && f !== 'sw.js')
        .filter(f => fs.statSync(path.join(ROOT, f)).isFile());
}

function violazioniIn(file) {
    const testo = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const righe = testo.split('\n');
    const trovate = [];
    righe.forEach((riga, i) => {
        // Salta i commenti di riga: parlare del bug non e' commetterlo.
        const senzaCommento = riga.replace(/\/\/.*$/, '');
        if (PATTERN_TETTO.some(p => senzaCommento.includes(p))) {
            trovate.push(`${file}:${i + 1}  ${riga.trim()}`);
        }
    });
    return trovate;
}

describe('guardrail — una sola porta per il tetto della reputazione', () => {

    test('nessun file ricalcola 5.0 + prestigio fuori da CE_money.addReputation', () => {
        const colpevoli = [];
        for (const f of fileDiGioco()) {
            if (AUTORIZZATI.has(f) || ECCEZIONI.has(f)) continue;
            colpevoli.push(...violazioniIn(f));
        }
        assert.deepEqual(colpevoli, [],
            'Queste righe ricalcolano il tetto reputazione scavalcando CE_money. Usa CE_money.addReputation(delta):\n' +
            colpevoli.join('\n'));
    });

    test('la porta espone reputationCap(): il tetto si LEGGE da money.js, non si ricopia', () => {
        // Chi deve solo CONOSCERE il tetto (pre-controlli, dry-run su copia)
        // non deve riscriverlo: lo chiede alla porta.
        const vm = require('node:vm');
        const window = { gameState: { prestige: 2, reputation: 0 } };
        const contesto = vm.createContext({ window });
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'money.js'), 'utf8'), contesto);
        assert.equal(typeof window.CE_money.reputationCap, 'function',
            'money.js deve esportare reputationCap()');
        assert.equal(window.CE_money.reputationCap(), 7);
        // Coerenza col comportamento di addReputation: stesso tetto, stessa porta.
        window.CE_money.addReputation(99);
        assert.equal(window.gameState.reputation, 7,
            'addReputation deve fermarsi esattamente al cap esposto da reputationCap()');
    });

    test('reputation-cap.js non esiste piu\': la seconda funzione canonica e\' stata rimossa', () => {
        // Era il codice morto del tentativo precedente: una CE_reputationCap
        // parallela che nessuno chiamava. Se torna, torna il doppione.
        assert.equal(fs.existsSync(path.join(ROOT, 'reputation-cap.js')), false,
            'reputation-cap.js va eliminato: il tetto vive in money.js');
        assert.equal(fs.existsSync(path.join(ROOT, 'test', 'reputation-cap.test.js')), false,
            'anche il suo test va eliminato');
    });

});
