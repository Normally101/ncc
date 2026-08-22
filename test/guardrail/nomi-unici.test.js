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

/* Collisioni gia' presenti alla data della verifica per mutazione: decoratori
   voluti e stato condiviso scritto da piu' file (stessa natura di DECORATORI_VOLUTI
   e delle variabili comuni in legami-tra-file.test.js).
   PUO' SOLO ACCORCIARSI: quando un nome smette di essere duplicato va tolto di
   qui, e la prova sotto lo pretende. */
const ECCEZIONI = new Set([
    '_selectedColorSS',        // flag condiviso: colore scelto nel configuratore showroom
    'currentSlotIndex',        // stato condiviso: slot attivo scritto da piu' moduli
    'resetGame',               // catena di decorator (saveSystem.js -> engine.js)
    '_suppressCloudSave',      // flag condiviso: blocco temporaneo del salvataggio cloud
    'processDailyRoutines',    // decoratore (vittorio.js avvolge engine-daily.js)
    '_fleetFilter',            // default dei filtri flotta scritto da dispatcher e ui-fleet
    'switchTab',               // catena di decorator documentata in legami-tra-file
    '_decreesCountdownTimer',  // timer decreti gestito da dispatcher e ui-politics
    'updateUI',                // catena di decorator (objective-tracker avvolge ui-sidebar)
]);

/** nome -> [{ file, riga, testo }] di tutte le assegnazioni a window.<nome>. */
function raccogliAssegnazioni() {
    const map = new Map();

    // Regex per estrarre assegnazioni a window:
    // window.x = ... o window['x'] = ... o window["x"] = ...
    // Attenzione a non prendere == o === o =>
    const regex = /(?:^|[^.\w$])window(?:\.([A-Za-z_$][\w$]*)|\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\])\s*=(?!=|>)/g;

    for (const file of fileInOrdine()) {
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
    return map;
}

describe('guardrail — nomi unici su window', () => {
    test('nessun nome su window e\' assegnato da piu\' di un file (fuori dalle ECCEZIONI)', () => {
        const map = raccogliAssegnazioni();
        assert.ok(map.size > 400,
            `attesi oltre 400 nomi su window, trovati ${map.size}: l'estrazione dal sorgente si e' rotta`);

        const duplicati = [];
        for (const [nome, entries] of map) {
            if (ECCEZIONI.has(nome)) continue;
            const fileSet = new Set(entries.map(e => e.file));
            if (fileSet.size > 1) {
                duplicati.push(`${nome} in [${[...fileSet].join(', ')}]`);
            }
        }
        assert.deepEqual(duplicati.sort(), [],
            'Questi nomi window.* sono assegnati da piu\' file: l\'ultimo caricato vince\n' +
            'in silenzio, senza errori ne\' a build ne\' a console. Se la sovrascrittura\n' +
            'e\' voluta (decoratore o stato condiviso) documentala in ECCEZIONI;\n' +
            'altrimenti lascia una sola definizione.');
    });

    test('la lista ECCEZIONI puo\' solo accorciarsi: ogni voce deve ancora collidere', () => {
        const map = raccogliAssegnazioni();
        const risolte = [...ECCEZIONI].filter(nome => {
            const entries = map.get(nome) || [];
            return new Set(entries.map(e => e.file)).size < 2;
        });
        assert.deepEqual(risolte, [],
            'Questi nomi non sono piu\' duplicati — rimuovili da ECCEZIONI:\n' + risolte.join('\n'));
    });
});
