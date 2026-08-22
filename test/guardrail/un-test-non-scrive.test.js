'use strict';
/**
 * Un test guarda, non tocca.
 *
 * Il 22/08 un test che rigenerava `docs/AZIONI-interfaccia.md` e lo scriveva nel
 * repo ha fatto respingere 152 lavori dell'agente e bruciato ~115 euro di
 * modello: ogni ramo si portava dietro la stessa modifica al documento e
 * litigava con main, qualunque cosa contenesse.
 *
 * La correzione di quel singolo file non e' bastata: poche ore dopo un altro
 * lavoro ha reintrodotto la stessa cosa in `test/guardrail/temp-genera.js`, e la
 * cascata e' ricominciata. Una regola scritta in un documento non ferma nessuno;
 * un test rosso si'.
 *
 * Quindi qui si vieta alla radice: nessun file sotto `test/` puo' scrivere nel
 * repository. Se serve rigenerare un documento, lo si fa con uno script fuori da
 * `test/`, lanciato a mano — non dentro la suite che l'agente esegue a ogni
 * lavoro.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEST_DIR = path.resolve(__dirname, '..');

/* Le scritture su file temporanei di sistema sono legittime: un test puo' avere
   bisogno di un file finto da leggere. Il divieto riguarda il REPOSITORY. */
const SCRITTURE = [
  'writeFileSync',
  'appendFileSync',
  'unlinkSync',
  'rmSync',
  'renameSync',
  'copyFileSync',
  'mkdirSync',
];

function tuttiIFileDiTest(dir) {
  const out = [];
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) out.push(...tuttiIFileDiTest(p));
    else if (voce.name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('un test guarda, non tocca', () => {
  test('nessun file sotto test/ scrive nel repository', () => {
    const colpevoli = [];

    for (const file of tuttiIFileDiTest(TEST_DIR)) {
      const righe = fs.readFileSync(file, 'utf8').split('\n');
      righe.forEach((riga, i) => {
        /* I commenti raccontano questa storia apposta: non sono violazioni. */
        const codice = riga.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        for (const fn of SCRITTURE) {
          if (!codice.includes(`${fn}(`)) continue;
          /* Scrivere dentro la cartella temporanea di sistema e' consentito. */
          if (/os\.tmpdir\(\)|\/tmp\//.test(codice)) continue;
          colpevoli.push(
            `${path.relative(TEST_DIR, file)}:${i + 1} → ${fn} — ${codice.trim().slice(0, 70)}`
          );
        }
      });
    }

    assert.deepEqual(
      colpevoli,
      [],
      'Questi test scrivono nel repository. Un test che modifica un file fa\n' +
        'respingere OGNI ramo dell\'agente, perche\' ogni ramo si porta dietro la\n' +
        'stessa modifica e litiga con main. Se serve rigenerare un documento,\n' +
        'mettilo in uno script fuori da test/ e lancialo a mano:\n\n  ' +
        colpevoli.join('\n  ')
    );
  });
});
