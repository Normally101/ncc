'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   guardrail/tutorial-bersagli — il tutorial non deve poter puntare al vuoto.

   Lo Spotlight ancorato (scelta di Vlad del 29/08/2026) illumina un elemento
   vero della pagina e mette la spiegazione accanto. E' il piu' potente dei
   cinque mock-up ed e' anche il piu' fragile: **se l'interfaccia cambia, il
   tutorial indica un punto vuoto**, e nessuno se ne accorge finche' non lo
   guarda un giocatore.

   Questo test e' la protezione contro quel giorno. Legge i selettori
   dichiarati in `_TUT_STEPS` (nel file vero, non in una copia) e pretende che
   ognuno esista nell'HTML della pagina. Rinominare un id diventa un rosso
   nella suite invece che un buco nel tutorial.

   Il tutorial degrada comunque con eleganza a schermata centrata quando il
   bersaglio manca — quello lo verifica test/funzioni/tutorial-spotlight.test.js.
   Qui si difende l'intenzione: i bersagli DEVONO esserci.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

function selettoriDichiarati() {
    const src = fs.readFileSync(path.join(ROOT, 'tutorial.js'), 'utf8');
    const trovati = [];
    const re = /target:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) {
        trovati.push({ selettore: m[1], riga: src.slice(0, m.index).split('\n').length });
    }
    return trovati;
}

function tabDichiarati() {
    const src = fs.readFileSync(path.join(ROOT, 'tutorial.js'), 'utf8');
    const trovati = [];
    const re = /tab:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) trovati.push(m[1]);
    return [...new Set(trovati)];
}

describe('guardrail/tutorial-bersagli', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const bersagli = selettoriDichiarati();

    test('il censimento trova i bersagli dichiarati (se va a zero non sta guardando niente)', () => {
        assert.ok(bersagli.length >= 4,
            `_TUT_STEPS deve dichiarare dei bersagli, trovati ${bersagli.length}`);
    });

    test('ogni bersaglio dello spotlight esiste nella pagina', () => {
        const persi = bersagli
            .filter(b => !doc.querySelector(b.selettore))
            .map(b => `${b.selettore} (tutorial.js:${b.riga})`);
        assert.deepEqual([...new Set(persi)], [],
            'Il tutorial illuminerebbe un punto vuoto. Se l\'elemento e\' stato rinominato,\n' +
            'aggiorna il selettore in _TUT_STEPS; se e\' stato tolto, togli o riscrivi il passo.');
    });

    test('ogni tab a cui il tutorial naviga esiste nella sidebar', () => {
        const noti = new Set(
            [...doc.querySelectorAll('[data-tab]')].map(el => el.getAttribute('data-tab'))
        );
        const persi = tabDichiarati().filter(t => !noti.has(t));
        assert.deepEqual(persi, [],
            'Il tutorial naviga verso schede che non esistono piu\' nella sidebar.');
    });

    test('lo spotlight non scrive colori a mano: li prende dai token --em-*', () => {
        const src = fs.readFileSync(path.join(ROOT, 'tutorial.js'), 'utf8');
        const aMano = (src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []);
        assert.deepEqual(aMano, [],
            'I colori del tutorial stanno in .ce-spot-* dentro style.css, che legge i token --em-*.\n' +
            'La versione precedente aveva un oro suo (#d4af37) diverso da quello del gioco.');
    });

    test('le classi dello spotlight usate da tutorial.js sono definite in style.css', () => {
        const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
        for (const classe of ['ce-spot-scrim', 'ce-spot-ring', 'ce-spot-bolla']) {
            assert.ok(css.includes('.' + classe),
                `manca la regola .${classe} in style.css: la bolla verrebbe disegnata senza stile`);
        }
    });
});
