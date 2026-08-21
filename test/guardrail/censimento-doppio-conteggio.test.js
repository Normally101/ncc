'use strict';
/* ============================================================================
   Il censimento non deve restringersi.

   `docs/DOPPIO-CONTEGGIO.md` elenca, file per file, dove il client rimuove
   denaro che la RPC del server aveva già mosso. È stato costruito da tre lavori
   in parallelo, quattro file ciascuno, uniti a mano il 21/08.

   Questo guardiano difende due cose:
   - che tutti e dodici i file restino censiti — se qualcuno riscrive il
     documento perdendone metà, il test lo dice;
   - che i casi trovati non spariscano in silenzio. Le correzioni arriveranno
     una per volta, e quando un caso è corretto la sua riga va CAMBIATA
     (marcata «corretto il …»), non cancellata: un elenco che si accorcia da
     solo non lascia traccia di cosa è stato deciso.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOC = path.resolve(__dirname, '..', '..', 'docs', 'DOPPIO-CONTEGGIO.md');

const CENSITI = [
    'p2p-market.js', 'p2p-render.js', 'vtk-market.js', 'auctions.js',
    'alliances.js', 'hostile_takeover.js', 'infrastructure.js', 'b2b.js',
    'nemesis.js', 'tourism.js', 'black_ops.js', 'vip-clients.js',
];

describe('guardrail — censimento del doppio conteggio', () => {

    test('il documento esiste e censisce tutti e dodici i file', () => {
        assert.ok(fs.existsSync(DOC), 'docs/DOPPIO-CONTEGGIO.md non c\'è più');
        const testo = fs.readFileSync(DOC, 'utf8');

        const mancanti = CENSITI.filter(f => !testo.includes(`## ${f}`));
        assert.deepEqual(mancanti, [],
            `il censimento ha perso dei file: ${mancanti.join(', ')}`);
    });

    test('i casi trovati sono ancora scritti', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        const casi = (testo.match(/DOPPIO CONTEGGIO/g) || []).length;
        /* Al 21/08 ne erano stati trovati parecchi nei soli file di mercato.
           La soglia è bassa apposta: serve ad accorgersi se il documento viene
           svuotato, non a fissare un numero che poi si vorrà cambiare a ogni
           correzione. */
        assert.ok(casi >= 5,
            `il censimento elenca solo ${casi} casi: sembra svuotato`);
    });

    test('dice a cosa serve, non solo cosa ha trovato', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.match(testo, /NON è ancora una correzione/i,
            'senza questa avvertenza il documento sembra un lavoro finito');
    });
});
