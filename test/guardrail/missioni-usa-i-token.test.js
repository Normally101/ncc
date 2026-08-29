'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   guardrail/missioni-usa-i-token — la scheda Missioni resta dentro il kit.

   Vlad, 29/08: il tutorial e le missioni «hanno font, colori e proporzioni di
   un altro gioco». Il numero era questo: 153 colori scritti a mano in
   `ui-career.js`, zero token `--em-*`, e 23 dichiarazioni `font-family:monospace`
   in un gioco che scrive tutto in Inter.

   Fra i 153 c'erano 27 occorrenze di **#6b7280**, cioe' l'esatto grigio che il
   28/08 era stato corretto NEL TOKEN perche' dava contrasto 3.58 su fondo
   carta. Correggere il token non basta se il colore e' anche copiato a mano:
   questo test e' il motivo per cui non ricapita.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
// I file del tutorial e delle missioni, quelli che il giocatore nuovo vede per primi.
const FILE = ['ui-career.js', 'tutorial.js', 'zero-to-hero.js', 'vittorio.js'];

describe('guardrail/missioni-usa-i-token', () => {

    test('nessun colore esadecimale scritto a mano', () => {
        const colpe = [];
        for (const f of FILE) {
            const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
            src.split('\n').forEach((riga, i) => {
                // I commenti citano i vecchi valori apposta: sono documentazione, non stile.
                const senzaCommenti = riga.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
                if (/^\s*[*/]/.test(riga)) return;
                const trovati = senzaCommenti.match(/#[0-9a-fA-F]{3,8}\b/g);
                /* #fff su un fondo pieno resta ammesso: e' testo bianco su un
                   colore d'accento, lo stesso che fa .em-tab.on nel kit. */
                const veri = (trovati || []).filter(c => !/^#(fff|ffffff|0d1117)$/i.test(c));
                if (veri.length) colpe.push(`${f}:${i + 1} → ${veri.join(', ')}`);
            });
        }
        assert.deepEqual(colpe, [],
            'I colori si prendono dai token --em-* di style.css (regola in CLAUDE.md):\n' +
            'sono tarati per il fondo scuro e verificati a contrasto ≥4.5. Un colore\n' +
            'copiato a mano non segue il token quando il token viene corretto.');
    });

    test('niente font-family:monospace: il gioco scrive in Inter', () => {
        const colpe = FILE.filter(f => /font-family\s*:\s*monospace/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
        assert.deepEqual(colpe, [],
            'Il monospace e\' la cosa che faceva sembrare la scheda Missioni un altro gioco.');
    });

    test('i token nuovi usati da questi file esistono davvero in style.css', () => {
        const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
        const usati = new Set();
        for (const f of FILE) {
            const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
            for (const m of src.matchAll(/var\(\s*(--em-[a-z0-9-]+)/gi)) usati.add(m[1]);
        }
        assert.ok(usati.size > 10, `il censimento deve trovare i token usati, trovati ${usati.size}`);
        const inesistenti = [...usati].filter(t => !new RegExp('\\' + t + '\\s*:').test(css));
        assert.deepEqual(inesistenti, [],
            'Un var(--em-…) che non esiste non da\' errore: il colore semplicemente non si applica,\n' +
            'e il difetto si vede solo guardando la pagina.');
    });

    test('i token stanno su :root, non solo dentro .em (i modali vivono fuori dal kit)', () => {
        const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
        const blocco = css.match(/:root\{[^}]*--em-gold\s*:[^}]*\}/s);
        assert.ok(blocco,
            'I token --em-* devono essere dichiarati su :root. Dentro `.em` non li vedono\n' +
            'il tutorial, i modali e le schermate attaccate a <body>: il colore cade\n' +
            'sull\'ereditato e il pannello esce senza colore (misurato nel browser il 30/08).');
    });
});
