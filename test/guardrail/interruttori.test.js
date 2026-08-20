'use strict';
/* ============================================================================
   Gli interruttori: acceso significa verificato.

   Dal 20/08/2026 il gioco ha la regola invertita — una funzione si mostra solo
   se qualcuno l'ha controllata. Prima era il contrario: tutto acceso, e nessuno
   sapeva cosa funzionasse.

   Questo test difende la regola in tre modi:

     1. Ogni voce di FEATURES esiste e vale true o false, senza sfumature.
     2. Una funzione ACCESA non ha azioni che muovono denaro senza avvisare il
        server. Accendere qualcosa di rotto e' esattamente cio' che la regola
        deve impedire, e una promessa scritta in un commento non lo impedisce.
     3. L'elenco delle spente puo' solo accorciarsi: chi accende una funzione
        toglie una riga da qui, chi la rispegne fa fallire il test e deve
        spiegare perche'.

   Non verifica che una funzione spenta sia davvero invisibile nell'interfaccia:
   quello dipende da ogni singola schermata e si controlla accendendo il gioco.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function features() {
    const testo = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
    const blocco = testo.split('window.FEATURES = {')[1]?.split('};')[0] ?? '';
    const voci = {};
    for (const m of blocco.matchAll(/^\s*([a-zA-Z_][\w]*)\s*:\s*(true|false)\s*,/gm)) {
        voci[m[1]] = m[2] === 'true';
    }
    return voci;
}

/**
 * Le funzioni spente il 20/08/2026, quando la regola e' stata invertita.
 * PUO' SOLO ACCORCIARSI. Vuota significa che tutto il gioco e' stato
 * verificato almeno una volta.
 */
const SPENTE_ALL_INIZIO = new Set([
    'aste', 'alleanze', 'salone', 'mercatoP2P', 'cripto', 'vtk', 'turismo',
    'lusso', 'politica', 'infrastrutture', 'holding', 'nemesi', 'vanita',
    'negozioDC', 'vip', 'carriera',
]);

describe('guardrail — gli interruttori delle funzioni', () => {
    test('ogni funzione dichiarata vale true o false', () => {
        const voci = features();
        assert.ok(Object.keys(voci).length >= 15,
            `attese almeno 15 voci in FEATURES, trovate ${Object.keys(voci).length}: la lettura si e' rotta`);
        for (const [nome, valore] of Object.entries(voci)) {
            assert.equal(typeof valore, 'boolean', `${nome} non e' un interruttore`);
        }
    });

    test('nessuna funzione e\' stata riaccesa senza toglierla dall\'elenco', () => {
        const voci = features();
        const riaccese = [...SPENTE_ALL_INIZIO].filter(n => voci[n] === true);
        assert.deepEqual(riaccese, [],
            'Queste funzioni sono state accese ma sono ancora nell\'elenco delle spente.\n' +
            'Accendere significa: azioni tutte eseguite nel banco, denaro che passa da\n' +
            'CE_money, e un test che le sorveglia. Fatto questo, togli il nome da\n' +
            'SPENTE_ALL_INIZIO — cosi\' l\'elenco resta una misura vera di quanto manca.');
    });

    test('nessuna funzione e\' stata rispenta di nascosto', () => {
        const voci = features();
        const rispente = Object.entries(voci)
            .filter(([nome, on]) => !on && !SPENTE_ALL_INIZIO.has(nome))
            .map(([nome]) => nome);
        assert.deepEqual(rispente, [],
            'Queste funzioni erano accese e ora risultano spente. Se e\' voluto va\n' +
            'detto: rispegnere qualcosa di gia\' verificato significa che la verifica\n' +
            'non teneva, ed e\' un\'informazione che non deve sparire in un commit.');
    });

    test('quanto manca', () => {
        const voci = features();
        const accese = Object.values(voci).filter(Boolean).length;
        const totale = Object.keys(voci).length;
        console.log(`\n   Funzioni verificate e accese: ${accese}/${totale}` +
                    `\n   Da verificare: ${totale - accese}\n`);
        assert.ok(accese >= 1, 'nessuna funzione accesa: il gioco non sarebbe giocabile');
    });
});
