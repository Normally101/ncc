'use strict';
/* ============================================================================
   Il censimento non deve restringersi.

   `docs/DOPPIO-CONTEGGIO.md` elenca, file per file, dove il client rimuove
   denaro che la RPC del server aveva già mosso. È stato costruito da tre lavori
   in parallelo, quattro file ciascuno, uniti a mano il 21/08.

   Questo guardiano difende due cose:
   - che tutti e dodici i file restino censiti — se qualcuno riscrive il
     documento perdendone metà, il test lo dice;
   - che i casi trovati non spariscano in silenzio. Le correzioni sono arrivate
     una per volta e ogni riga chiusa resta scritta col suo verdetto
     («CORRETTO:» con il come, o «ANCORA APERTO:»): un elenco che si accorcia
     da solo non lascia traccia di cosa è stato deciso.
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

    test('dichiara quanti casi restano aperti', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        /* Al 22/08 tutti i casi sono chiusi: il documento deve dirlo esplicitamente,
           e l'avvertenza d'epoca («NON è ancora una correzione») non deve tornare,
           sarebbe di nuovo una menzogna. */
        assert.match(testo, /ZERO casi ancora aperti/i,
            'manca la dichiarazione di quanti casi restano aperti');
        assert.doesNotMatch(testo, /NON è ancora una correzione/i,
            'è tornata l\'avvertenza d\'epoca, ormai falsa: tutti i casi sono chiusi');
    });

    test('ogni caso storico ha un verdetto: CORRETTO o ANCORA APERTO', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        /* Ogni blocco che porta il marcatore storico «era DOPPIO CONTEGGIO» deve
           essere stato chiuso con un verdetto esplicito, mai lasciato a metà. */
        const blocchi = testo.split(/\n(?=- )/);
        const casi = blocchi.filter(b => b.includes('era DOPPIO CONTEGGIO'));
        assert.ok(casi.length >= 17,
            `il censimento storico aveva 17 casi, nei blocchi ne trovo ${casi.length}`);
        const senzaVerdetto = casi.filter(b => !/(CORRETTO|ANCORA APERTO):/.test(b));
        assert.deepEqual(senzaVerdetto, [],
            `${senzaVerdetto.length} casi senza verdetto esplicito`);
    });
});
