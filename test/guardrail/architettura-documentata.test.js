'use strict';
/* ============================================================================
   Il documento di architettura non deve invecchiare in silenzio.

   Perche' questo test esiste: docs/ARCHITECTURE.md e' la reference che si legge
   quando serve capire com'e' fatto il gioco. Nell'agosto 2026 era rimasto
   indietro di giorni di cambi grossi (money.js, gli interruttori di config.js,
   i collaudi e i guardrail) e conteneva affermazioni smentite dal codice
   (mobile_dispatcher.js ancora elencato fra gli script caricati). L'aggiornamento
   e' nato con questo test: sul documento vecchio e' rosso, su quello nuovo verde.
   Da qui in avanti sorveglia che queste sezioni chiave restino al loro posto:

     1. money.js come unica porta del denaro, con gli allineamenti
        accreditatoDalServer / addebitatoDalServer per le RPC;
     2. gli interruttori di config.js (FEATURES / attiva / TAB_DI) e la regola
        che una funzione si accende solo dopo il collaudo;
     3. i due piani di test: collaudi in test/funzioni, regole in test/guardrail;
     4. la distinzione ride.duration (animazione mappa) vs _getRideDurationMs
        (tempo vero di occupazione dell'autista).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'docs', 'ARCHITECTURE.md');

function leggiDoc() {
    return fs.readFileSync(DOC_PATH, 'utf8');
}

describe('guardrail — ARCHITECTURE.md documenta le regole vive', () => {

    test('documenta money.js come unica porta del denaro, allineamenti dal server inclusi', () => {
        const doc = leggiDoc();
        for (const pezzo of ['money.js', 'CE_money', 'accreditatoDalServer',
                             'addebitatoDalServer', 'una-sola-porta.test.js']) {
            assert.ok(doc.includes(pezzo), `ARCHITECTURE.md non parla piu' di "${pezzo}"`);
        }
    });

    test('documenta gli interruttori di config.js e la regola del collaudo', () => {
        const doc = leggiDoc();
        for (const pezzo of ['window.FEATURES', 'window.attiva', 'window.TAB_DI',
                             'feature-gate.js', 'collaudo']) {
            assert.ok(doc.includes(pezzo), `ARCHITECTURE.md non parla piu' di "${pezzo}"`);
        }
    });

    test('ogni costante window.MAIUSCOLA definita in config.js e\' citata nel documento', () => {
        const doc = leggiDoc();
        const sorgente = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
        const esportati = [...sorgente.matchAll(/window\.([A-Z][A-Z_]+)\s*=/g)].map(m => m[1]);
        assert.ok(esportati.length > 0, 'config.js dovrebbe esporre almeno una costante');
        for (const nome of esportati) {
            assert.ok(doc.includes(nome),
                `config.js definisce window.${nome} ma ARCHITECTURE.md non lo cita`);
        }
    });

    test('documenta entrambi i piani di test: collaudi e guardrail', () => {
        const doc = leggiDoc();
        for (const pezzo of ['test/funzioni/', 'test/guardrail/', 'game-env',
                             'ordine-script.test.js', 'interruttori-applicati.test.js']) {
            assert.ok(doc.includes(pezzo), `ARCHITECTURE.md non parla piu' di "${pezzo}"`);
        }
    });

    test('spiega la distinzione fra ride.duration (mappa) e _getRideDurationMs (tempo vero)', () => {
        const doc = leggiDoc();
        const inizio = doc.indexOf('Due durate');
        assert.notEqual(inizio, -1,
            "manca la sezione che distingue le due misure di durata di una corsa");
        const blocco = doc.slice(inizio, inizio + 900);
        assert.ok(blocco.includes('ride.duration') && blocco.includes('_getRideDurationMs'),
            'la sezione delle durate deve nominare ENTRAMBE le voci');
    });

    test('non presenta come caricato un file rimosso dal repo (mobile_dispatcher.js)', () => {
        const doc = leggiDoc();
        assert.equal(doc.includes('mobile_dispatcher.js'), false,
            'ARCHITECTURE.md elenca ancora mobile_dispatcher.js, rimosso dal repo ' +
            '(sorvegliato da test/guardrail/mobile-dispatcher-rimosso.test.js)');
    });
});
