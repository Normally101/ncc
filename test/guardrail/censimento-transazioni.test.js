'use strict';
/* ============================================================================
   Guardrail per la mappa delle transazioni (docs/TRANSAZIONI.md).

   Questo guardiano verifica:
   - che docs/TRANSAZIONI.md esista e documenti le transazioni economiche;
   - che contenga l'analisi delle RPC esistenti (cosa controllano e cosa non controllano);
   - che contenga la classifica ordinata delle priorità per la migrazione server-authoritative.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOC = path.resolve(__dirname, '..', '..', 'docs', 'TRANSAZIONI.md');

describe('guardrail — censimento e mappa transazioni', () => {

    test('il documento docs/TRANSAZIONI.md esiste ed è strutturato', () => {
        assert.ok(fs.existsSync(DOC), 'docs/TRANSAZIONI.md non trovato');
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.ok(testo.length > 2000, 'il documento è troppo corto o vuoto');
    });

    test('copre le aree economiche chiave del gioco', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        const aree = [
            'Riparazione veicolo',
            'Rifornimento carburante',
            'Acquisto veicolo',
            'Incasso corsa',
            'Driver Coins',
            'Prestiti Bancari',
            'P2P',
            'Aste Giudiziarie',
            'Mercato Azionario',
        ];
        for (const area of aree) {
            assert.ok(testo.includes(area), `Area economica mancante nel censimento: ${area}`);
        }
    });

    test('documenta cosa controllano e cosa non controllano le RPC', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.match(testo, /Cosa controlla la RPC/i, 'manca la sezione di verifica controlli RPC');
        assert.match(testo, /Cosa NON controlla/i, 'manca la sezione di analisi vulnerabilità/mancati controlli RPC');
    });

    test('include la lista ordinata di priorità di intervento', () => {
        const testo = fs.readFileSync(DOC, 'utf8');
        assert.match(testo, /Lista Ordinata delle Priorità/i, 'manca la roadmap/lista priorità');
        assert.match(testo, /TIER 1/i, 'mancano i livelli di priorità (Tier 1)');
    });
});
