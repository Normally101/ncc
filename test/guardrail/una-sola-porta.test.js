'use strict';
/* ============================================================================
   Regola 1 — una sola porta per il denaro, sorvegliata da un test.

   Perche' questo test esiste: una convenzione scritta in un documento non
   ferma nessuno. Il 19/08/2026 un'analisi eseguendo il codice ha trovato 19
   azioni che scalavano soldi senza mai dirlo al server, piu' 12 funzioni del
   negozio che regalavano booster premium (i Driver Coins tornavano indietro
   al primo evento Realtime, l'effetto comprato restava). Erano tutte scritte
   da chi conosceva la regola: la regola da sola non basta.

   Questo test fallisce se qualcuno muta cash / driverCoins / vtkBalance
   fuori da money.js. La lista ECCEZIONI elenca i file non ancora convertiti:
   PUO' SOLO ACCORCIARSI. Chi la allunga sta reintroducendo il bug.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

// Gli unici due file autorizzati a toccare le valute direttamente:
// money.js perche' E' la porta, serverState.js perche' e' il ponte col server.
const AUTORIZZATI = new Set(['money.js', 'serverState.js']);

// Debito noto: file non ancora convertiti alla porta unica.
// Ogni task di conversione RIMUOVE una riga da qui. Nessun task ne aggiunge.
const ECCEZIONI = new Set([
    'engine-finance.js',
    'engine-fleet.js',
    'engine-rides.js',
    'engine.js',
    'hq.js',
    'p2p-market.js',
    'p2p-render.js',
    'showroom.js',
    'tourism.js',
    'ui-ops.js',
    'ui-staff.js',
    'ui-store.js',
    'vanity.js',
    'vip-clients.js',
    'vtk-market.js',
]);

const MUTAZIONE = /gameState\.(cash|driverCoins|vtkBalance)\s*(?:[-+*/]?=)(?!=)/g;

function fileDiGioco() {
    return fs.readdirSync(ROOT)
        .filter(f => f.endsWith('.js') && f !== 'sw.js')
        .filter(f => fs.statSync(path.join(ROOT, f)).isFile());
}

function mutazioniIn(file) {
    const testo = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const righe = testo.split('\n');
    const trovate = [];
    righe.forEach((riga, i) => {
        // Salta i commenti di riga: parlare del bug non e' commetterlo.
        const senzaCommento = riga.replace(/\/\/.*$/, '');
        MUTAZIONE.lastIndex = 0;
        if (MUTAZIONE.test(senzaCommento)) trovate.push(`${file}:${i + 1}  ${riga.trim()}`);
    });
    return trovate;
}

describe('guardrail — una sola porta per il denaro', () => {

    test('nessun file converted muta cash/driverCoins/vtkBalance fuori da money.js', () => {
        const colpevoli = [];
        for (const f of fileDiGioco()) {
            if (AUTORIZZATI.has(f) || ECCEZIONI.has(f)) continue;
            colpevoli.push(...mutazioniIn(f));
        }
        assert.deepEqual(colpevoli, [],
            'Queste righe muovono valuta scavalcando CE_money. Usa CE_money.spend/earn/spendDC/earnDC:\n' +
            colpevoli.join('\n'));
    });

    test('la lista ECCEZIONI puo\' solo accorciarsi: ogni voce deve essere ancora colpevole', () => {
        // Se un file e' stato convertito ma lasciato in ECCEZIONI, la lista mente e
        // il guardrail smette di sorvegliarlo. Questo test costringe a toglierlo.
        const inutili = [];
        for (const f of ECCEZIONI) {
            if (!fs.existsSync(path.join(ROOT, f))) { inutili.push(`${f} (file non esiste piu')`); continue; }
            if (mutazioniIn(f).length === 0) inutili.push(`${f} (gia' convertito)`);
        }
        assert.deepEqual(inutili, [],
            'Questi file non hanno piu\' bisogno di essere in ECCEZIONI — rimuovili dalla lista:\n' +
            inutili.join('\n'));
    });

    test('money.js espone la porta completa', () => {
        const sorgente = fs.readFileSync(path.join(ROOT, 'money.js'), 'utf8');
        for (const fn of ['spend', 'earn', 'spendDC', 'earnDC', 'addReputation']) {
            assert.ok(new RegExp(`function ${fn}\\b`).test(sorgente), `money.js deve esporre ${fn}()`);
        }
    });
});
