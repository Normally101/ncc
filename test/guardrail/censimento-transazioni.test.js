'use strict';
/* ============================================================================
   Guardrail per la mappa delle transazioni (docs/TRANSAZIONI.md).

   Questo test verifica che il documento di analisi per Vlad:
   - esista nella cartella docs/;
   - contenga tutte e 10 le macro-aree di transazione censite;
   - analizzi il meccanismo attuale di divergenza vs imbroglio (syncCash);
   - contenga la matrice di rischio e la roadmap ordinata a 4 fasi.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOC_PATH = path.resolve(__dirname, '..', '..', 'docs', 'TRANSAZIONI.md');

const MACRO_AREE = [
    'Valute Premium, Token e Negozio',
    'Mercato P2P, Holding, Azioni Aziendali e Sindacato',
    'Aste Giudiziarie, Contratti B2B e Turismo',
    'Mercato Nero, Shadow Ops, Crypto & Nemesis',
    'Flotta, Veicoli, Riparazioni, Carburante & Infrastrutture',
    'Risorse Umane, Autisti e Accademia',
    'Finanza Aziendale, Prestiti, Marketing e Fisco',
    'Corse, Dispatch, Tratte e Clienti VIP',
    'Sede HQ, Immobili di Pregio e Lifestyle',
    'Missioni, Bivi Morali, Onboarding (Zero-to-Hero) ed Eventi',
];

describe('guardrail — mappa delle transazioni (docs/TRANSAZIONI.md)', () => {

    test('il documento docs/TRANSAZIONI.md esiste ed è non vuoto', () => {
        assert.ok(fs.existsSync(DOC_PATH), 'docs/TRANSAZIONI.md non trovato');
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(testo.length > 2000, 'docs/TRANSAZIONI.md è troppo breve o incompleto');
    });

    test('copre tutte e 10 le macro-aree di transazione censite', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        const mancanti = MACRO_AREE.filter(area => !testo.includes(area));
        assert.deepEqual(mancanti, [], `Mancano delle macro-aree in docs/TRANSAZIONI.md: ${mancanti.join(', ')}`);
    });

    test('analizza il meccanismo di syncCash, divergenza vs imbroglio e RPC di riferimento', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.match(testo, /rpc_sync_cash/i, 'Manca riferimento a rpc_sync_cash');
        assert.match(testo, /CE_money/i, 'Manca riferimento a CE_money');
        assert.match(testo, /DIVERGENZA/i, 'Manca la spiegazione della divergenza');
        assert.match(testo, /IMBROGLIO/i, 'Manca la spiegazione del rischio imbroglio');
        assert.match(testo, /rpc_repair_vehicle/i, 'Manca il riferimento al benchmark rpc_repair_vehicle');
    });

    test('include la matrice dei rischi e la lista ordinata di priorità per Vlad', () => {
        const testo = fs.readFileSync(DOC_PATH, 'utf8');
        assert.match(testo, /Matrice di Sintesi/i, 'Manca la matrice di sintesi');
        assert.match(testo, /Piano d'Azione Ordinato/i, 'Manca il piano di priorità per Vlad');
        assert.match(testo, /FASE 1/i, 'Manca la fase 1');
        assert.match(testo, /FASE 2/i, 'Manca la fase 2');
        assert.match(testo, /FASE 3/i, 'Manca la fase 3');
        assert.match(testo, /FASE 4/i, 'Manca la fase 4');
    });
});
