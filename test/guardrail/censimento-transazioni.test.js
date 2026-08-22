'use strict';
/* ============================================================================
   Guardrail — Censimento e Mappa delle Transazioni Economiche

   Verifica che il documento di analisi architetturale docs/TRANSAZIONI.md
   esista, sia completo e mantenga la copertura delle macro-aree economiche,
   della matrice di rischio e della sequenza ordinata di migrazione verso il
   modello server-authoritative.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'docs', 'TRANSAZIONI.md');

const SEZIONI_OBBLIGATORIE = [
    'Flotta & Manutenzione',
    'Corse, Dispatch & Eventi Stradali',
    'Autisti & Gestione Personale',
    'Mercato P2P & Aste Giudiziarie',
    'Valuta Premium (Driver Coins) & Token VTK',
    'Contratti B2B & Turismo',
    'Finanza, Prestiti, Cripto & Borsa',
    'Consorzi, Alleanze & Sindacato',
    'Infrastruttura, HQ & Immobili',
    'Black Ops & Nemesi',
    'Marketing, Lobby & Politica',
    'Ricompense Giornaliere & Missioni',
    'Fallimento & Reset Prestigio'
];

describe('guardrail — mappa delle transazioni economiche (docs/TRANSAZIONI.md)', () => {

    test('il documento esiste ed è compilato', () => {
        assert.ok(fs.existsSync(DOC_PATH), 'docs/TRANSAZIONI.md non esiste');
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.length > 3000, 'il documento è troppo corto o incompleto');
    });

    test('censisce tutte le 13 macro-aree economiche', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        for (const sez of SEZIONI_OBBLIGATORIE) {
            assert.ok(testo.includes(sez), `Manca la sezione obbligatoria "${sez}" in docs/TRANSAZIONI.md`);
        }
    });

    test('contiene la matrice di rischio comparativa e la lista di priorità ordinata', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('Matrice Comparativa di Rischio'), 'Manca la matrice comparativa di rischio');
        assert.ok(testo.includes('Piano di Migrazione Ordinato per Priorità'), 'Manca il piano ordinato di migrazione');
        assert.ok(testo.includes('Priorità 1: Sicurezza Valuta Premium'), 'Manca la definizione di Priorità 1');
        assert.ok(testo.includes('Priorità 2: Integrità Economica Multiplayer'), 'Manca la definizione di Priorità 2');
        assert.ok(testo.includes('Priorità 3: Protezione del Core Loop'), 'Manca la definizione di Priorità 3');
        assert.ok(testo.includes('Priorità 4: Validazione Listini di Flotta'), 'Manca la definizione di Priorità 4');
    });

    test('analizza sia i controlli lato server esistenti che i parametri non controllati', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('Cosa controlla lato server'), 'Manca il censimento dei controlli server attuali');
        assert.ok(testo.includes('Cosa NON controlla'), 'Manca il censimento delle falle e parametri client');
        assert.ok(testo.includes('rpc_sync_cash'), 'Manca l\'analisi di rpc_sync_cash');
        assert.ok(testo.includes('rpc_repair_vehicle'), 'Manca l\'analisi di rpc_repair_vehicle');
        assert.ok(testo.includes('rpc_add_driver_coins'), 'Manca l\'analisi di rpc_add_driver_coins');
    });

    test('fa riferimento a docs/ECONOMY_SERVER_AUTH.md senza duplicare lo scaffold del ledger', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('ECONOMY_SERVER_AUTH.md'), 'docs/TRANSAZIONI.md deve fare riferimento a docs/ECONOMY_SERVER_AUTH.md');
    });

    test('elenca in cima le azioni coperte e conclude con la raccomandazione di partenza', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.includes('Azioni Coperte'), 'Manca l\'indice/elenco iniziale delle azioni coperte');
        assert.ok(testo.includes('Da quale conviene partire e perché') || testo.includes('Da quale conviene partire'), 'Manca la sezione di raccomandazione iniziale');
    });
});
