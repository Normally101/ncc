// Guardrail: la reputazione ha una sola porta canonica, CE_money.addReputation
// in money.js (tetto = 5.0 + prestige). Vietato ricalcolare il tetto fuori da
// money.js e vietato resuscitare reputation-cap.js (funzione parallela morta).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'test-support', 'scripts', 'docs', 'assets', 'supabase']);

function jsFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out = out.concat(jsFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.js')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Il tetto va calcolato SOLO dentro money.js.
const PATTERN_TETTO = /5\.0\s*\+\s*\(\s*(gameState|gs)\.prestige/g;

function fileRelativi() {
  return jsFiles(ROOT)
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter((f) => f !== 'money.js');
}

test('nessun calcolo diretto del tetto reputazione fuori da money.js', () => {
  const colpevoli = [];
  for (const rel of fileRelativi()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (PATTERN_TETTO.test(src)) colpevoli.push(rel);
    PATTERN_TETTO.lastIndex = 0;
  }
  assert.deepStrictEqual(colpevoli, [],
    `Tetto reputazione ricalcolato fuori dalla porta CE_money.addReputation: ${colpevoli.join(', ')}`);
});

test('reputation-cap.js non deve esistere (porta parallela morta)', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'reputation-cap.js')),
    'reputation-cap.js e\' codice morto: rimuoverlo');
  assert.ok(!fs.existsSync(path.join(ROOT, 'test', 'reputation-cap.test.js')),
    'test/reputation-cap.test.js testa codice morto: rimuoverlo');
});

test('i punti di chiamata noti usano la porta CE_money.addReputation', () => {
  const attesi = ['vittorio.js', 'quests.js', 'engine-finance.js'];
  for (const rel of attesi) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(/CE_money\.addReputation\(/.test(src),
      `${rel} deve passare da CE_money.addReputation`);
  }
});
