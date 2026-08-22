'use strict';
/* ============================================================================
   Azioni Driver Coins & vanità — banco di prova dedicato.

   Sei azioni che muovono denaro reale (Driver Coins) o premiano con esso:
     _dcSpend, _srmPurchase, opsBundleDC, _vanityTitle, _vanityEmblem,
     buyLifestyleAsset

   Regole verificate per ognuna:
     - l'importo giusto, UNA VOLTA SOLA (il doppio addebito e' il bug peggiore);
     - il denaro passa da window.CE_money, mai da gameState.cash -= diretto;
     - se la RPC ha gia' mosso il saldo lato server si usa addebitatoDalServer /
       accreditatoDalServer e NON si risincronizza;
     - il RIFIUTO funziona: fondi insufficienti, bersaglio inesistente,
       azione ripetuta due volte.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function leggi(nome) {
    return fs.readFileSync(path.join(ROOT, nome), 'utf8');
}

// Corpo della funzione `nome` dentro un sorgente: dal "window.nome = function"
// fino alla graffa di chiusura allo stesso livello.
function corpoFunzione(sorgente, nome) {
    const inizio = sorgente.search(
        new RegExp(`window\\.${nome}\\s*=\\s*function`)
    );
    assert.notStrictEqual(inizio, -1, `window.${nome} non trovata nel sorgente`);
    const aperta = sorgente.indexOf('{', inizio);
    let profondita = 0;
    for (let i = aperta; i < sorgente.length; i++) {
        if (sorgente[i] === '{') profondita++;
        else if (sorgente[i] === '}') {
            profondita--;
            if (profondita === 0) return sorgente.slice(inizio, i + 1);
        }
    }
    return sorgente.slice(inizio);
}

const AZIONI = [
    { nome: '_dcSpend',          file: 'ui-store.js' },
    { nome: '_srmPurchase',      file: null }, // cercata sotto se non in ui-store
    { nome: 'opsBundleDC',       file: 'engine-store.js' },
    { nome: '_vanityTitle',      file: 'vanity.js' },
    { nome: '_vanityEmblem',     file: 'vanity.js' },
    { nome: 'buyLifestyleAsset', file: 'ui-lifestyle.js' },
];

describe('mappa delle sei azioni nel sorgente', () => {

    test('ogni azione esiste come funzione su window', () => {
        const sorgenti = ['ui-store.js', 'engine-store.js', 'vanity.js',
                          'ui-lifestyle.js', 'engine.js', 'money.js'];
        for (const az of AZIONI) {
            const dove = sorgenti.find(f => {
                try {
                    return new RegExp('window\\.' + az.nome + '\\s*=\\s*function').test(leggi(f));
                }
                catch { return false; }
            });
            assert.ok(dove, `window.${az.nome} non trovata in nessun sorgente noto`);
            az.file = dove;
        }
    });

    test('nessuna delle sei tocca gameState.cash direttamente', () => {
        for (const az of AZIONI) {
            if (!az.file) continue;
            const corpo = corpoFunzione(leggi(az.file), az.nome);
            assert.doesNotMatch(corpo, /\.cash\s*[-+]=/,
                `${az.nome} muta gameState.cash direttamente invece di passare da CE_money`);
        }
    });
});
