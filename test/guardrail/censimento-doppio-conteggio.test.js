'use strict';
/* ============================================================================
   censimento-doppio-conteggio.test.js
   Verifica la presenza e la completezza del censimento docs/DOPPIO-CONTEGGIO.md.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('guardrail — censimento doppio conteggio', () => {
    test('docs/DOPPIO-CONTEGGIO.md esiste e include i file censiti', () => {
        const p = path.join(ROOT, 'docs', 'DOPPIO-CONTEGGIO.md');
        assert.ok(fs.existsSync(p), 'docs/DOPPIO-CONTEGGIO.md deve esistere');

        const content = fs.readFileSync(p, 'utf8');
        const requiredFiles = ['alliances.js', 'hostile_takeover.js', 'infrastructure.js', 'b2b.js'];
        for (const f of requiredFiles) {
            assert.ok(content.includes(`## ${f}`), `Il censimento deve includere una sezione per ${f}`);
        }
        assert.ok(content.includes('DOPPIO CONTEGGIO'), 'Il censimento deve identificare i casi di doppio conteggio');
    });
});
