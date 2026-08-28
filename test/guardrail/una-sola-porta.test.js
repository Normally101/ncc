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
const ECCEZIONI = new Set([]);

// Righe autorizzate in deroga perche' non sono transazioni economiche:
// ciascuna ha il motivo esplicito accanto. Non allargare l'espressione regolare.
const RIGHE_CONSENTITE = new Map([
    // engine.js:
    // 1. `gameState.cash = 0` all'inizio di una partita nuova: e' inizializzazione.
    ['engine.js:gameState.cash = 0;', 'Inizializzazione nuova partita'],
    // 2. il ripiego dentro `_addCash` per quando money.js non e' ancora caricato.
    ['engine.js:gameState.cash += amount;', 'Ripiego _addCash prima del caricamento di money.js'],
    // 3. il ripristino dell'ultimo saldo valido quando il saldo diventa NaN: e' una riparazione.
    ['engine.js:gameState.cash = (typeof window._lastValidCash === \'number\') ? window._lastValidCash : 0;', 'Ripristino ultimo saldo valido quando non-finito'],

    /* ── Emerse il 28/08/2026, quando questo guardrail ha smesso di cercare solo
       `gameState.cash` e ha cominciato a vedere anche gli alias locali (`gs.cash`).
       Nessuna di queste e' un bypass: sono ripieghi, rollback, o valute con una
       porta propria. Ognuna ha il suo motivo scritto accanto — chi ne aggiunge una
       senza motivo sta reintroducendo il bug. ──────────────────────────────────── */

    // quests.js e quests-data.js: RIPIEGHI. Provano prima `window.CE_money`, e usano
    // la via diretta solo se la porta non e' caricata. Stesso schema di `_addCash`.
    ['quests.js:gs.cash = (gs.cash || 0) + r.cash;', 'Ripiego: usato solo se CE_money.earn non esiste (riga sopra)'],
    ['quests.js:gs.driverCoins = (gs.driverCoins || 0) + r.tc;', 'Ripiego: usato solo se CE_money.earnDC non esiste (riga sopra)'],
    ['quests.js:?.then(_r => { if (_r?.ok && _r.driver_coins != null) { gs.driverCoins = _r.driver_coins; if (typeof updateUI === \'function\') updateUI(); } })',
        'Riallineamento sul saldo AUTORITATIVO che il server ha appena dichiarato'],

    // VTK: non passa da CE_money perche' CE_money non ha una porta VTK. L'autorita'
    // e' `rpc_award_mission_vtk`, che applica il tetto giornaliero (500) lato server;
    // qui si accredita in via ottimistica e poi si corregge su quanto il server dice.
    ['quests.js:gs.vtkBalance = (gs.vtkBalance || 0) + r.vtk;   // optimistic',
        'Accredito ottimistico VTK: l\'autorita\' e\' rpc_award_mission_vtk, che applica il cap'],
    ['quests.js:gs.vtkBalance = Math.max(0, (gs.vtkBalance || 0) - (r.vtk - awarded));',
        'Correzione dell\'ottimismo VTK sul valore realmente accreditato dal server'],

    // daily-orders.js: ROLLBACK, non un movimento. Disfa un credito ottimistico
    // quando la RPC fallisce, altrimenti il premio resterebbe accreditato a vuoto.
    ['daily-orders.js:gs.driverCoins = Math.max(0, (gs.driverCoins || 0) - rw.dc);',
        'Rollback del credito ottimistico quando la RPC fallisce'],

    // zero-to-hero.js: RIPIEGO, nell'`else` del tentativo con CE_money.earn appena
    // sopra. La sincronizzazione col server avviene comunque poco piu' in basso,
    // sotto la stessa condizione: senza, al ricaricamento il ponte col server
    // azzera il primo guadagno e l'onboarding si blocca.
    ['zero-to-hero.js:gs.cash = (gs.cash || 0) + importo;',
        'Ripiego: usato solo se CE_money.earn non esiste (riga sopra)'],
]);

/* Le quattro scelte a bivio di quests-data.js hanno la stessa forma: tutta la
   logica su UNA riga, con `window.CE_money?.earn` provato per primo e la via
   diretta come ripiego. Elencarle a mano significherebbe incollare quattro righe
   lunghissime che si romperebbero al primo ritocco di testo: si riconoscono dal
   fatto che il ripiego e' nello stesso `else` del tentativo con la porta unica. */
const RIPIEGO_SULLA_STESSA_RIGA = /window\.CE_money\?\.(earn|spend|earnDC|spendDC)\b[\s\S]*\belse\b/;

/* Cerca la mutazione sia sul nome pieno sia sugli ALIAS locali.
   Il 28/08/2026 una prova dal vivo nel browser ha mostrato che la corsa guidata
   dell'onboarding muoveva la cassa senza passare da CE_money — e questo guardrail
   non se n'era mai accorto: cercava solo `gameState.cash`, mentre il codice usa
   quasi ovunque un alias locale (`const gs = window.gameState`, 24 volte nel
   repo). Bastava rinominare la variabile per rendersi invisibili al controllo.
   Un guardrail aggirabile con un alias non e' un guardrail. */
const MUTAZIONE = /\b(?:gameState|gs|_gs\(\))\.(cash|driverCoins|vtkBalance)\s*(?:[-+*/]?=)(?!=)/g;

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
        if (MUTAZIONE.test(senzaCommento)) {
            const trimmed = riga.trim();
            if (RIGHE_CONSENTITE.has(`${file}:${trimmed}`)) return;
            if (RIPIEGO_SULLA_STESSA_RIGA.test(trimmed)) return;
            trovate.push(`${file}:${i + 1}  ${trimmed}`);
        }
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

    test('le righe consentite in deroga devono esistere davvero nel sorgente', () => {
        for (const [chiave, motivo] of RIGHE_CONSENTITE) {
            const [file, riga] = chiave.split(/:(.+)/);
            const testo = fs.readFileSync(path.join(ROOT, file), 'utf8');
            assert.ok(testo.includes(riga), `Riga consentita non trovata in ${file} (${motivo}): ${riga}`);
        }
    });
});
