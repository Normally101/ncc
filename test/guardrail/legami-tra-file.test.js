'use strict';
/* ============================================================================
   I legami fra i file: quello che nessun test riesce a vedere.

   Il gioco non ha moduli: 94 script caricati in fila che si parlano attraverso
   `window`. Questo rende possibili tre guasti che non danno errore e non
   compaiono in nessun test, perche' non riguardano cosa fa una funzione ma
   COME i file si trovano fra loro:

     1. Due file definiscono lo stesso nome. Vince l'ultimo caricato, in
        silenzio. Se le due versioni hanno firme diverse, chi chiama la prima
        ottiene un comportamento sbagliato senza alcun errore.
        (Reale: hqOpenBuildModal — hq.js la vuole (roomId), hq-visual.js
        (cityId, slotIndex); vince hq-visual, quindi chi passa un roomId
        costruisce nella citta' sbagliata.)

     2. Un pulsante chiama una funzione che non esiste. Il click non fa niente
        e non lascia traccia.

     3. Una chiamata `window.X()` a un nome che nessuno definisce: errore a
        runtime nel momento peggiore, cioe' quando il giocatore ci arriva.

   A differenza dei test di comportamento, questo copre TUTTI i file per
   costruzione: legge il sorgente, non esegue niente.
   ============================================================================ */
const { test, describe, before } = require('node:test');
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

/** Toglie commenti e stringhe: evita di scambiare un esempio in un commento per codice. */
// I commenti spariscono ma le righe restano al loro posto: se un blocco /* */
// venisse collassato in uno spazio, tutti i numeri di riga successivi sarebbero
// sbagliati e il messaggio d'errore manderebbe a cercare nel punto sbagliato.
function soloCodice(testo) {
    return testo
        .replace(/\/\*[\s\S]*?\*\//g, (blocco) => blocco.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ── Cosa definisce ogni file ─────────────────────────────────────────────── */

// Solo le FUNZIONI. Scrivere da piu' file su una variabile globale condivisa
// (`window.currentSlotIndex = 2`) e' normale e voluto: e' cosi' che questi script
// si passano lo stato. Ridefinire da piu' file la stessa FUNZIONE invece e' un
// guasto, perche' vince l'ultima caricata e nessuno se ne accorge.
function definizioniIn(f) {
    const codice = soloCodice(sorgente(f));
    const nomi = new Map(); // nome -> riga  (definizioni di FUNZIONE)
    const alias = [];       // candidati risolti nella seconda passata
    const assegnati = new Set(); // qualsiasi `window.X = ...`: a un pulsante basta questo
    const righe = codice.split('\n');
    righe.forEach((riga, i) => {
        // window.X = function… | window.X = async function… | window.X = (…) =>
        const a = riga.match(/^\s*window\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/);
        if (a) nomi.set(a[1], i + 1);
        // window.X = altraCosa;  — puo' essere l'alias di una funzione (e allora e'
        // una definizione: cosi' war_room.js si prende renderTabProvinces) oppure
        // l'assegnazione di una variabile condivisa (window.currentSlotIndex = slot),
        // che e' normale. Si distingue solo sapendo se a destra c'e' una funzione:
        // lo decide la seconda passata, qui si registra soltanto il candidato.
        const c = riga.match(/^\s*window\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/);
        if (c) alias.push({ nome: c[1], sorgente: c[2], riga: i + 1 });
        const d = riga.match(/^\s*window\.([A-Za-z_$][\w$]*)\s*=[^=]/);
        if (d) assegnati.add(d[1]);
        const b = riga.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (b) nomi.set(b[1], i + 1);
    });
    return { nomi, alias, assegnati };
}

/* ── Sovrascritture volute ────────────────────────────────────────────────── */

// Catene di decoratori: piu' file avvolgono di proposito la stessa funzione per
// aggiungere un pezzo (barra laterale, tutorial, animazioni). Sembrano collisioni
// a una scansione per nome, ma sono corrette. NON vanno "sistemate".
const DECORATORI_VOLUTI = new Set([
    'switchTab', 'updateUI', 'showNotification', 'processDailyRoutines',
    'resetGame', 'saveGame', 'loadGame', 'renderTabHome', 'logToMap',
]);

// Collisioni gia' note e in attesa del loro task. PUO' SOLO ACCORCIARSI.
const COLLISIONI_NOTE = new Set([
    'hqOpenBuildModal',        // firme incompatibili (hq.js vs hq-visual.js)
    'renderTabProvinces',      // due schermate per la stessa tab (ui-ops vs war_room)
    '_updateActiveRouteLines', // map.js vs ui-map-utils.js
    '_sb', '_uid',             // corpi identici, innocue ma fragili
]);

/* ── Il test ──────────────────────────────────────────────────────────────── */

describe('guardrail — i legami fra i file', () => {
    let file, definizioni, tutteLeDefinizioni, nomiEsistenti;

    before(() => {
        file = fileInOrdine();
        definizioni = new Map(file.map(f => [f, definizioniIn(f)]));

        // Prima passata: le funzioni vere e proprie.
        tutteLeDefinizioni = new Map(); // nome -> [{file, riga}]
        const nomiDiFunzione = new Set();
        for (const [f, { nomi }] of definizioni) {
            for (const [nome, riga] of nomi) {
                nomiDiFunzione.add(nome);
                if (!tutteLeDefinizioni.has(nome)) tutteLeDefinizioni.set(nome, []);
                tutteLeDefinizioni.get(nome).push({ file: f, riga });
            }
        }

        // Seconda passata: `window.X = Y` conta come definizione di X solo se Y e'
        // una funzione. Altrimenti e' l'assegnazione di una variabile condivisa.
        for (const [f, { alias }] of definizioni) {
            for (const a of alias) {
                if (!nomiDiFunzione.has(a.sorgente)) continue;
                if (!tutteLeDefinizioni.has(a.nome)) tutteLeDefinizioni.set(a.nome, []);
                tutteLeDefinizioni.get(a.nome).push({ file: f, riga: a.riga });
            }
        }

        // Per i pulsanti basta che il nome sia legato a qualcosa su window: non
        // serve che il rilevatore capisca che si tratta di una funzione.
        nomiEsistenti = new Set(nomiDiFunzione);
        for (const [, { assegnati }] of definizioni) for (const n of assegnati) nomiEsistenti.add(n);
    });

    test('index.html carica i file che diciamo di controllare', () => {
        assert.ok(file.length > 80, `attesi oltre 80 script, trovati ${file.length}`);
    });

    test('nessun nome globale viene sovrascritto in silenzio', () => {
        const collisioni = [];
        for (const [nome, dove] of tutteLeDefinizioni) {
            // Definire una funzione e poi esportarla (`window.X = X`) nello stesso
            // file e' la normalita', non una collisione: contano solo i file DIVERSI.
            const fileDistinti = [...new Set(dove.map(d => d.file))];
            if (fileDistinti.length < 2) continue;
            if (DECORATORI_VOLUTI.has(nome) || COLLISIONI_NOTE.has(nome)) continue;
            const vince = dove[dove.length - 1];
            collisioni.push(`${nome} — definita in ${dove.map(d => `${d.file}:${d.riga}`).join(' e ')} ; vince ${vince.file}`);
        }
        assert.deepEqual(collisioni.sort(), [],
            'Questi nomi sono definiti in piu\' file: l\'ultimo caricato vince in silenzio.\n' +
            'Se e\' voluto (una catena di decoratori) aggiungilo a DECORATORI_VOLUTI; altrimenti\n' +
            'lascia una sola implementazione e registrala in docs/AZIONI.md.');
    });

    test('la lista COLLISIONI_NOTE puo\' solo accorciarsi', () => {
        const risolte = [...COLLISIONI_NOTE].filter(nome => {
            const dove = tutteLeDefinizioni.get(nome) || [];
            return new Set(dove.map(d => d.file)).size < 2;
        });
        assert.deepEqual(risolte, [],
            'Questi nomi non collidono piu\' — rimuovili da COLLISIONI_NOTE:\n' + risolte.join('\n'));
    });

    test('ogni pulsante chiama una funzione che esiste', () => {
        // Un data-ce-act senza funzione dietro e' un click che non fa niente e non
        // lascia traccia: il giocatore pensa che il gioco sia rotto, e lo e'.
        const azioni = new Set();
        for (const f of [...file, 'index.html']) {
            const testo = sorgente(f);
            for (const m of testo.matchAll(/ceAct\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) azioni.add(m[1]);
            for (const m of testo.matchAll(/data-ce-act=\\?["']([A-Za-z_$][\w$]*)/g)) azioni.add(m[1]);
        }
        const orfani = [...azioni].filter(a => !nomiEsistenti.has(a)).sort();
        assert.deepEqual(orfani, [],
            'Questi pulsanti puntano a funzioni che non esistono in nessun file:\n' + orfani.join(', '));
    });
});
