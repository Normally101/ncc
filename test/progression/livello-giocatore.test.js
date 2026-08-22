'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const pl = require('../../player-level.js');

test('il giocatore parte dal livello 1', () => {
  const state = {};
  pl.ensurePlayerLevel(state);
  assert.strictEqual(state.playerLevel, 1);
  assert.strictEqual(state.playerXp, 0);
});

test('le soglie sono strettamente crescenti', () => {
  for (let l = 1; l < 30; l++) {
    assert.ok(pl.xpToNext(l + 1) > pl.xpToNext(l), `soglia ${l}->${l + 1} non crescente`);
  }
});

test('i primi livelli arrivano in fretta: L5 costa meno della sola salita 9->10', () => {
  assert.ok(pl.totalXpForLevel(5) < pl.xpToNext(9));
});

test('salire facendo azioni: gli XP fanno crescere il livello e non lo abbassano mai', () => {
  const state = {};
  pl.ensurePlayerLevel(state);
  const guadagnati = pl.addPlayerXp(state, 60); // abbastanza per superare le prime soglie
  assert.ok(guadagnati > 0);
  assert.ok(state.playerLevel > 1);

  // XP persi / rollback: il livello non deve scendere sotto quello gia' raggiunto
  state.playerXp = 0;
  pl.ensurePlayerLevel(state);
  assert.ok(state.playerLevel >= guadagnati && state.playerLevel > 1);

  assert.strictEqual(pl.addPlayerXp(state, -100), 0);
});

test('sopravvive al ricaricamento: livello ricostruito dagli XP salvati', () => {
  const state = {};
  pl.ensurePlayerLevel(state);
  pl.addPlayerXp(state, 500);
  const salvato = JSON.parse(JSON.stringify({ playerXp: state.playerXp })); // come un vecchio save senza playerLevel
  const ricaricato = pl.ensurePlayerLevel(salvato);
  assert.strictEqual(ricaricato.playerLevel, state.playerLevel);
});
