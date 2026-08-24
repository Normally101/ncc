'use strict';
// Guardrail contrasto testo su sfondo scuro (bug: grigio #6b7280/#4b5563 quasi
// illeggibile su card scure in Obiettivi, classifica e marketing).
// Regola: nelle tre zone il testo secondario NON puo' scendere sotto #9ca3af,
// e il testo descrittivo usa #e5e7eb. Font globale = stack sans-serif eRepublik.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const leggi = f => fs.readFileSync(path.join(root, f), 'utf8');

// tutti i colori esadecimali presenti nel sorgente
function coloriChiave(testo) {
  return testo.match(/#[0-9a-fA-F]{6}\b/g) || [];
}

// Grigi piu' scuri del minimo ammesso (#9ca3af) su sfondo scuro
const GRIGI_VETATI = ['#6b7280', '#4b5563', '#374151', '#1f2937', '#1f2733'];

function occorrenze(testo, colore) {
  return testo.split(colore).length - 1;
}

test('classifica (ui-ranking.js): nessun grigio sotto #9ca3af, descrizioni a #e5e7eb', () => {
  const src = leggi('ui-ranking.js');
  for (const c of GRIGI_VETATI) {
    assert.strictEqual(occorrenze(src, c), 0, `colore ${c} troppo scuro trovato in ui-ranking.js`);
  }
  // tabella classifica: intestazioni th leggibili
  assert.ok(/<th[^>]*color:#9ca3af/.test(src), 'le celle <th> della classifica devono usare #9ca3af');
  // sezione Obiettivi resa da ui-ranking.js: le descrizioni dei traguardi devono essere chiare
  assert.ok(/Obiettivi \(/.test(src) && /ach\.desc/.test(src), 'sezione Obiettivi non trovata');
  assert.ok(/color:#e5e7eb;margin-top:3px">\$\{ach\.desc\}</.test(src),
    'la descrizione dei traguardi (ach.desc) deve usare #e5e7eb');
  assert.ok(coloriChiave(src).includes('#e5e7eb'), 'serve almeno un testo descrittivo a #e5e7eb');
});

test('marketing (ui-marketing.js): nessun grigio sotto #9ca3af, card canali leggibili', () => {
  const src = leggi('ui-marketing.js');
  for (const c of GRIGI_VETATI) {
    assert.strictEqual(occorrenze(src, c), 0, `colore ${c} troppo scuro trovato in ui-marketing.js`);
  }
  assert.ok(coloriChiave(src).includes('#e5e7eb'), 'serve almeno un testo descrittivo a #e5e7eb');
});

test('style.css: le regole .mkt-* non usano grigi vietati', () => {
  const css = leggi('style.css');
  const blocchiMkt = css.match(/[^{}]*(?:\.mkt-|\.campaign-|\.brand-gauge)[^{]*\{[^}]*\}/g) || [];
  assert.ok(blocchiMkt.length > 0, 'blocco .mkt-* non trovato in style.css');
  for (const blocco of blocchiMkt) {
    for (const c of GRIGI_VETATI) {
      assert.strictEqual(occorrenze(blocco, c), 0, `colore ${c} in regola: ${blocco.trim().slice(0, 80)}`);
    }
  }
});

test('style.css: font-family globale = stack sans-serif stile eRepublik', () => {
  const css = leggi('style.css');
  const stack = "font-family: 'Inter', 'Open Sans', Arial, Helvetica, sans-serif";
  assert.ok(css.includes(stack), 'manca lo stack richiesto nel body/global');
  // ogni regola body con font-family deve usare lo stack (niente Montserrat globale)
  const regoleBody = css.match(/body\s*\{[^}]*\}/g) || [];
  let conFont = 0;
  for (const regola of regoleBody) {
    const m = regola.match(/font-family:\s*([^;}]+)/);
    if (m) {
      conFont++;
      assert.strictEqual(m[1].trim(), "'Inter', 'Open Sans', Arial, Helvetica, sans-serif", `regola body errata: ${regola.slice(0, 60)}`);
    }
  }
  assert.ok(conFont >= 2, 'attese almeno le due regole body con font-family');
});
