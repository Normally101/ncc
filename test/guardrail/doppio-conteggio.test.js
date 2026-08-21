'use strict';
/* ============================================================================
   Censimento Doppio Conteggio — Verifica documento e tracciamento vulnerabilità.

   Verifica che docs/DOPPIO-CONTEGGIO.md esista, contenga i 4 file richiesti
   (nemesis.js, tourism.js, black_ops.js, vip-clients.js) e documenti
   correttamente i casi di doppio conteggio (server RPC vs client CE_money).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(ROOT, 'docs', 'DOPPIO-CONTEGGIO.md');

describe('guardrail — censimento doppio conteggio', () => {
    test('docs/DOPPIO-CONTEGGIO.md esiste e ha l\'intestazione con data e file esaminati', () => {
        assert.ok(fs.existsSync(DOC_PATH), 'docs/DOPPIO-CONTEGGIO.md deve esistere');
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(content.includes('Data:'), 'Il documento deve indicare la data');
        assert.ok(content.includes('File esaminati:'), 'Il documento deve elencare i file esaminati in cima');
    });

    test('contiene sezioni per tutti e 4 i file richiesti', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        const requiredFiles = ['nemesis.js', 'tourism.js', 'black_ops.js', 'vip-clients.js'];
        for (const file of requiredFiles) {
            assert.ok(content.includes(`## ${file}`), `Manca la sezione per ${file}`);
        }
    });

    test('documenta correttamente i casi di doppio conteggio trovati', () => {
        const content = fs.readFileSync(DOC_PATH, 'utf8');
        assert.ok(content.includes('rpc_tourism_daily_tick'), 'Deve documentare rpc_tourism_daily_tick');
        assert.ok(content.includes('rpc_execute_shadow_op'), 'Deve documentare rpc_execute_shadow_op');
        assert.ok(content.includes('rpc_upgrade_shadow_defense'), 'Deve documentare rpc_upgrade_shadow_defense');
        assert.ok(content.includes('DOPPIO CONTEGGIO'), 'Deve segnalare i casi di DOPPIO CONTEGGIO');
    });
});
