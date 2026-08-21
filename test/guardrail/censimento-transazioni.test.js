'use strict';
/* ============================================================================
   Guardrail — Censimento Transazioni Economiche & Mappa RPC Server-Authoritative

   `docs/TRANSAZIONI.md` elenca in modo esaustivo ogni singola azione del gioco
   che muove denaro (cash, Driver Coins, VTK token), evidenziando il meccanismo
   attuale (CE_money / RPC / syncCash), cosa valida oggi il server, cosa NON
   valida (vulnerabilità di cheat/prezzo), la gravità dell'imbroglio e la lista
   ordinata di migrazione per Vlad.

   Questo guardiano verifica che il documento esista, contenga tutte le macro-aree
   censite, analizzi in profondità i controlli server-side e includa la lista
   ordinata per guidare le future decisioni di sviluppo.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOC = path.resolve(__dirname, '..', '..', 'docs', 'TRANSAZIONI.md');

const SEZIONI_OBBLIGATORIE = [
    'Valuta Premium',
    'Garage & Gestione Flotta',
    'Risorse Umane & Autisti',
    'Corse, Dispatch',
    'Finanza, Investimenti',
    'Contratti Corporate',
    'Multiplayer P2P',
    'Token VTK',
    'Quartier Generale',
    'Lista Ordinata di Migrazione'
];

describe('guardrail — censimento delle transazioni e validazione server-authoritative', () => {

    test('il documento docs/TRANSAZIONI.md esiste e ha una dimensione adeguata', () => {
        assert.ok(fs.existsSync(DOC), 'docs/TRANSAZIONI.md non esiste');
        const stat = fs.statSync(DOC);
        assert.ok(stat.size > 5000, `il documento è troppo corto (${stat.size} bytes)`);
    });

    test('contiene tutte le macro-sezioni economiche del gioco', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        for (const sez of SEZIONI_OBBLIGATORIE) {
            assert.ok(
                testo.includes(sez),
                `docs/TRANSAZIONI.md non contiene la sezione attesa: "${sez}"`
            );
        }
    });

    test('analizza sia cosa controlla la RPC sia cosa NON controlla (pattern anti-cheat)', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.match(testo, /Cosa controlla lato server/i, 'manca l\'analisi di cosa controlla la RPC');
        assert.match(testo, /Cosa NON controlla/i, 'manca l\'analisi delle falle/mancate validazioni delle RPC');
        assert.match(testo, /rpc_repair_vehicle/i, 'manca l\'analisi della RPC rpc_repair_vehicle');
        assert.match(testo, /rpc_sell_vehicle/i, 'manca l\'analisi della RPC rpc_sell_vehicle');
        assert.match(testo, /rpc_start_trip/i, 'manca l\'analisi della RPC rpc_start_trip');
        assert.match(testo, /rpc_add_driver_coins/i, 'manca l\'analisi di rpc_add_driver_coins');
    });

    test('fornisce la prioritizzazione strategica e la lista ordinata per la migrazione', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.match(testo, /Lista Ordinata di Migrazione/i, 'manca la sezione della lista ordinata');
        assert.match(testo, /FASE 1/i, 'manca la fase 1 nella lista ordinata');
        assert.match(testo, /Stripe/i, 'manca il riferimento a Stripe/valuta reale');
    });
});
