'use strict';
// Livello numerico del giocatore (richiesta Vlad 22/08): si parte da 1 e sale
// spesso nei primi passi. Convive col grado di ui-home.js:_homeLevel, che resta
// il titolo raro agganciato al prestigio: qui c'e' solo il numero che sale.
//
// Scala scelta: la prima soglia (L1->L2) costa 10 XP e ognuna successiva cresce
// del fattore GROWTH. Cosi' le prime salite arrivano in pochi minuti di gioco e
// poi diradano (L2->L3 ~16, L3->L4 ~24, ... L9->L10 ~339).

const FIRST_LEVEL_XP = 10;
const GROWTH = 1.55;

// XP necessari per passare da `level` a `level + 1`.
function xpToNext(level) {
  return Math.round(FIRST_LEVEL_XP * Math.pow(GROWTH, level - 1));
}

// XP cumulativi richiesti per AVERE raggiunto `level`.
function totalXpForLevel(level) {
  let tot = 0;
  for (let l = 1; l < level; l++) tot += xpToNext(l);
  return tot;
}

function levelFromXp(xp) {
  let level = 1;
  while (xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

// Normalizza i campi del livello dentro lo stato salvato. Chiamato anche al
// caricamento: se un salvataggio vecchio non ha playerLevel lo si ricava dagli
// XP, e il livello non torna MAI indietro (vince il massimo tra salvato e derivato).
function ensurePlayerLevel(state) {
  if (!state || typeof state !== 'object') return state;
  if (!Number.isFinite(state.playerXp)) state.playerXp = 0;
  if (!Number.isFinite(state.playerLevel) || state.playerLevel < 1) state.playerLevel = 1;
  const derivato = levelFromXp(state.playerXp);
  if (derivato > state.playerLevel) state.playerLevel = derivato;
  return state;
}

// Aggiunge XP e fa salire il livello di conseguenza. Ritorna quanti livelli
// guadagnati (0 se nessuno). Gli XP negativi vengono ignorati: il livello
// non deve poter scendere.
function addPlayerXp(state, amount) {
  if (!state || !(amount > 0)) return 0;
  ensurePlayerLevel(state);
  const prima = state.playerLevel;
  state.playerXp += Math.max(1, Math.floor(amount));
  const guadagnati = Math.max(0, levelFromXp(state.playerXp) - prima);
  if (guadagnati > 0) state.playerLevel += guadagnati;
  return guadagnati;
}

/* Doppia esposizione, di proposito.
   Il file era scritto solo per Node (`module.exports`) e non era mai stato
   incluso in index.html: il sistema di livelli esisteva, era testato, e non
   girava. Adesso vive anche nel browser come `window.CE_level`, senza toccare
   la firma usata dai test. */
const _CE_level = { xpToNext, totalXpForLevel, levelFromXp, ensurePlayerLevel, addPlayerXp };

if (typeof module !== 'undefined' && module.exports) module.exports = _CE_level;
if (typeof window !== 'undefined') window.CE_level = _CE_level;
