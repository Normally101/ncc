'use strict';
/* ============================================================================
   guardrail — mappa delle transazioni economiche e piano anti-cheat.

   Verifica che `docs/TRANSAZIONI.md` esista, sia completo e mantenga la
   struttura richiesta per le decisioni architetturali dell'economia di gioco:
   - censimento di tutte le categorie di transazioni monetarie
   - analisi dei controlli presenti / mancanti nelle RPC attuali
   - requisiti per una RPC sicura
   - livello di gravità del cheating
   - roadmap di priorità ordinata
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOC = path.resolve(__dirname, '..', '..', 'docs', 'TRANSAZIONI.md');

const SEZIONI_CHIAVE = [
    'Flotta e Garage',
    'Personale e Autisti',
    'Corse, Viaggi e Contratti',
    'Finanza, Credito e Immobili',
    'Mercato P2P, Aste Giudiziarie e Titoli Societari',
    'Meccaniche Territoriali, Consorzi e Shadow Ops',
    'Valuta Premium (Driver Coins) & Token VTK',
    'Piano di Intervento Ordinato (Roadmap di Priorità)',
];

const RPCS_CHIAVE = [
    'rpc_buy_vehicle',
    'rpc_sell_vehicle',
    'rpc_repair_vehicle',
    'rpc_start_trip',
    'rpc_claim_trip_reward',
    'rpc_hire_driver',
    'rpc_take_loan',
    'rpc_buy_real_estate',
    'rpc_add_driver_coins',
    'rpc_sync_cash',
];

describe('guardrail — mappa delle transazioni (docs/TRANSAZIONI.md)', () => {

    test('il documento esiste ed è popolato', () => {
        assert.ok(fs.existsSync(DOC), 'docs/TRANSAZIONI.md non esiste');
        const stat = fs.statSync(DOC);
        assert.ok(stat.size > 2000, 'docs/TRANSAZIONI.md sembra troppo corto o incompleto');
    });

    test('contiene tutte le sezioni tematiche previste', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        for (const sez of SEZIONI_CHIAVE) {
            assert.ok(testo.includes(sez), `Manca la sezione "${sez}" in docs/TRANSAZIONI.md`);
        }
    });

    test('analizza le RPC monetarie principali e i relativi controlli', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        for (const rpc of RPCS_CHIAVE) {
            assert.ok(testo.includes(rpc), `Manca l'analisi della RPC "${rpc}" in docs/TRANSAZIONI.md`);
        }
    });

    test('include la roadmap di priorità ordinata e la gravità', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.ok(testo.includes('Roadmap di Priorità'), 'Manca la roadmap ordinata');
        assert.ok(testo.includes('CRITICA') || testo.includes('MASSIMA'), 'Manca la classificazione di gravità');
        assert.ok(testo.includes('Driver Coins'), 'Manca la priorità su Driver Coins');
    });
});
