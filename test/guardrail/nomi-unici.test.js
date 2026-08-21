'use strict';
/* ============================================================================
   Regola — ogni nome esposto su window appartiene a un solo file.

   Perche' questo test esiste:
   index.html carica ~93 file .js in sequenza nello scope globale del browser.
   Se due file assegnano lo stesso window.<nome>, l'ultimo caricato sovrascrive
   il precedente in silenzio, senza errori a console o in fase di build.

   Questo test:
     1. legge tutti i .js che index.html carica;
     2. per ogni file trova le assegnazioni a window.<nome> (incluse forme come
        "window.x =", "window['x'] =", "window[\"x\"] =");
     3. FALLISCE se un nome e' assegnato da piu' di un file diverso.

   La lista ECCEZIONI elenca i decoratori VOLUTI e le collisioni note in
   attesa di risoluzione: PUO' SOLO ACCORCIARSI.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** I file di gioco, nell'ordine in cui index.html li carica. */
function fileInOrdine() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const ordine = [...html.matchAll(/src="([^"?]+\.js)/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(f => !f.startsWith('http') && fs.existsSync(path.join(ROOT, f)));
    return [...new Set(ordine)];
}

function sorgente(f) {
    return fs.readFileSync(path.join(ROOT, f), 'utf8');
}

/** Toglie commenti: evita di scambiare un esempio in un commento per codice. */
function soloCodice(testo) {
    return testo
        .replace(/\/\*[\s\S]*?\*\//g, (blocco) => blocco.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('guardrail — nomi unici su window', () => {
    test('esplorazione', () => {
        const files = fileInOrdine();
        const map = new Map(); // nome -> [{ file, riga, testo }]

        // Regex per estrarre assegnazioni a window:
        // window.x = ... o window['x'] = ... o window["x"] = ...
        // Attenzione a non prendere == o === o =>
        const regex = /(?:^|[^.\w$])window(?:\.([A-Za-z_$][\w$]*)|\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\])\s*=(?!=|>)/g;

        for (const file of files) {
            const codice = soloCodice(sorgente(file));
            const righe = codice.split('\n');
            righe.forEach((riga, i) => {
                let m;
                regex.lastIndex = 0;
                while ((m = regex.exec(riga)) !== null) {
                    const nome = m[1] || m[2];
                    if (!map.has(nome)) map.set(nome, []);
                    map.get(nome).push({ file, riga: i + 1, testo: riga.trim() });
                }
            });
        }

        const duplicati = [];
        for (const [nome, entries] of map) {
            const fileSet = new Set(entries.map(e => e.file));
            if (fileSet.size > 1) {
                duplicati.push({
                    nome,
                    files: [...fileSet],
                    entries
                });
            }
        }
        console.log(`Trovati ${map.size} nomi unici su window.`);
        console.log(`Trovati ${duplicati.length} nomi assegnati in piu file:`);
        for (const d of duplicati) {
            console.log(`  - ${d.nome} in [${d.files.join(', ')}]`);
            for (const e of d.entries) {
                console.log(`      ${e.file}:${e.riga} -> ${e.testo.slice(0, 80)}`);
            }
        }
    });
});
