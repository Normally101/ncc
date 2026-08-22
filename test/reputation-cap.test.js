'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function caricaCap() {
  const window = {};
  const context = vm.createContext({ window });
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'reputation-cap.js'),
    'utf8'
  );
  vm.runInContext(src, context);
  return window.CE_reputationCap;
}

test('il tetto base senza prestigio resta 5', () => {
  const cap = caricaCap();
  assert.strictEqual(cap(0), 5);
  assert.strictEqual(cap(undefined), 5);
});

test('un giocatore con prestigio 2 deve superare il tetto 5', () => {
  const cap = caricaCap();
  assert.strictEqual(cap(2), 7);
  assert.ok(cap(2) > 5, 'con prestigio il tetto deve salire oltre 5');
});
