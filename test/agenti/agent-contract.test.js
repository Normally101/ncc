'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function caricaContratto() {
  const window = {};
  const context = vm.createContext({ window });
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'agent-contract.js'),
    'utf8'
  );
  vm.runInContext(src, context);
  return window.CE_agentContract;
}

function runValida() {
  return {
    runId: 'run-1',
    provider: 'test-provider',
    at: '2026-01-01T00:00:00Z',
    input: { agentId: 'dispatcher', goal: 'chiudi il turno' },
    output: {
      status: 'ok',
      result: { fatto: true },
      usage: { steps: 3, tokens: 120 },
    },
  };
}

test('un input completo è valido', () => {
  const c = caricaContratto();
  const esito = c.validateRunInput({
    agentId: 'dispatcher',
    goal: 'chiudi il turno',
    budget: { maxSteps: 5 },
  });
  assert.strictEqual(esito.valido, true);
});

test('un input senza agentId è rifiutato', () => {
  const c = caricaContratto();
  const esito = c.validateRunInput({ goal: 'solo goal' });
  assert.strictEqual(esito.valido, false);
});

test('un output ok senza result è rifiutato', () => {
  const c = caricaContratto();
  const esito = c.validateRunOutput({
    status: 'ok',
    usage: { steps: 1, tokens: 10 },
  });
  assert.strictEqual(esito.valido, false);
});

test('un output error senza messaggio è rifiutato', () => {
  const c = caricaContratto();
  const esito = c.validateRunOutput({
    status: 'error',
    usage: { steps: 0, tokens: 0 },
  });
  assert.strictEqual(esito.valido, false);
});

test('usage negativa è rifiutata', () => {
  const c = caricaContratto();
  const esito = c.validateRunOutput({
    status: 'ok',
    result: {},
    usage: { steps: -1, tokens: 0 },
  });
  assert.strictEqual(esito.valido, false);
});

test('la voce di audit copre input, output e consumo della run', () => {
  const c = caricaContratto();
  const voce = c.buildAuditEntry(runValida());
  assert.strictEqual(voce.runId, 'run-1');
  assert.strictEqual(voce.agentId, 'dispatcher');
  assert.strictEqual(voce.provider, 'test-provider');
  assert.strictEqual(voce.status, 'ok');
  // oggetto creato dentro la vm: confronto campo per campo, non per riferimento
  assert.strictEqual(voce.usage.steps, 3);
  assert.strictEqual(voce.usage.tokens, 120);
});

test('una run corrotta produce una voce di audit marcata invalid', () => {
  const c = caricaContratto();
  const run = runValida();
  delete run.output.usage;
  const voce = c.buildAuditEntry(run);
  // l'input era valido: si sa chi ha girato, ma la run è invalid
  assert.strictEqual(voce.status, 'invalid');
  assert.strictEqual(voce.agentId, 'dispatcher');
  assert.strictEqual(voce.usage, null);
});
