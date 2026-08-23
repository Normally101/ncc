// Test TDD (stato iniziale: stub). Obiettivo: le schede di assunzione con
// doppio costo (una tantum + mensile) devono mostrare ENTRAMBI i numeri
// PRIMA del click. Da raffinare col censimento di ui-staff.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('sanity: ui-staff.js esiste', () => {
  const src = fs.readFileSync(path.join(ROOT, 'ui-staff.js'), 'utf8');
  assert.ok(src.length > 0);
});
