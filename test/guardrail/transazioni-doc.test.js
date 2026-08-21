'use strict';
/* ============================================================================
   Test di conformità per docs/TRANSAZIONI.md — Mappa Transazioni Economiche

   Verifica che la documentazione richiesta per la decisione architetturale
   di Vlad esista, contenga tutte le aree economiche censite, la matrice di sintesi
   e la sequenza ordinata di migrazione server-authoritative.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'docs', 'TRANSAZIONI.md');

describe('Documentazione Architettura Transazioni (docs/TRANSAZIONI.md)', () => {

    test('il file docs/TRANSAZIONI.md esiste ed e popolato', () => {
        assert.ok(fs.existsSync(DOC_PATH), 'docs/TRANSAZIONI.md deve esistere');
        const stats = fs.statSync(DOC_PATH);
        assert.ok(stats.size > 2000, 'docs/TRANSAZIONI.md deve contenere una mappa dettagliata');
    });

    test('contiene la dichiarazione di copertura delle aree economiche', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(content.includes('Dichiarazione di Copertura'), 'Deve contenere la sezione di copertura');
        assert.ok(content.includes('Driver Coins'), 'Deve coprire Driver Coins');
        assert.ok(content.includes('P2P'), 'Deve coprire il mercato P2P');
        assert.ok(content.includes('Aste'), 'Deve coprire le aste');
        assert.ok(content.includes('Flotta'), 'Deve coprire la flotta');
    });

    test('analizza i controlli server-side (cosa controlla e cosa non controlla)', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(content.includes('Cosa controlla la RPC'), 'Deve descrivere i controlli attuali');
        assert.ok(content.includes('Cosa NON controlla'), 'Deve descrivere le falle e i buchi attuali');
        assert.ok(content.includes('rpc_repair_vehicle'), 'Deve citare rpc_repair_vehicle come case study');
        assert.ok(content.includes('rpc_take_loan'), 'Deve citare rpc_take_loan');
    });

    test('contiene la matrice di sintesi e la lista ordinata di prioritizzazione', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(content.includes('Matrice di Sintesi Comparativa'), 'Deve includere la tabella comparativa');
        assert.ok(content.includes('Piano di Migrazione Ordinato'), 'Deve includere il piano di migrazione ordinato');
        assert.ok(content.includes('Priorità 1') || content.includes('FASE 1'), 'Deve contenere i passi prioritari ordinati');
    });
});
