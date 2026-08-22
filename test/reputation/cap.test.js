'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { CE_reputationCap } = require('../../reputation-cap.js');

// --- unita' della funzione unica ---

test('CE_reputationCap: base 5 senza prestigio', () => {
    assert.equal(CE_reputationCap({}), 5.0);
    assert.equal(CE_reputationCap(undefined), 5.0);
});

test('CE_reputationCap: il prestigio alza il tetto', () => {
    assert.equal(CE_reputationCap({ prestige: 2 }), 7.0);
    assert.equal(CE_reputationCap(3), 8.0);
});

// --- guardrail: la venticinquesima copia non deve nascere ---
// Il calcolo del tetto vive solo in reputation-cap.js (e in money.js,
// intoccabile perche' condiviso). Ogni nuova copia letterale e' un bug
// potenziale: quella senza prestigio blocca chi ha fatto prestigio.

const REPO_ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'test', 'scripts', 'docs', '.git']);
const ALLOWED_FILES = new Set(['money.js']);

function jsFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (SKIP_DIRS.has(e.name)) return [];
        const p = path.join(dir, e.name);
        return e.isDirectory() ? jsFiles(p) : (e.name.endsWith('.js') ? [p] : []);
    });
}

test('guardrail: nessuna copia locale del tetto reputazione', () => {
    const copies = [];
    for (const f of jsFiles(REPO_ROOT)) {
        if (ALLOWED_FILES.has(path.basename(f))) continue;
        const src = fs.readFileSync(f, 'utf8');
        const re = /Math\.min\(\s*5(?:\.0)?\s*\+/g; // tetto con eventuale prestigio inline
        const reNoPrestige = /Math\.min\(\s*5(?:\.0)?\s*,/g; // tetto che IGNORA il prestigio
        let m;
        while ((m = re.exec(src))) copies.push(`${path.relative(REPO_ROOT, f)}:${src.slice(0, m.index).split('\n').length}`);
        while ((m = reNoPrestige.exec(src))) copies.push(`${path.relative(REPO_ROOT, f)}:${src.slice(0, m.index).split('\n').length}`);
    }
    assert.deepEqual(copies, [], 'trovate copie del tetto reputazione: usa CE_reputationCap');
});
