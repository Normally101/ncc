'use strict';
/* ================================================================
   quests.js — Chauffeur Empire · Quest Engine v2
   Richiede: quests-data.js caricato prima (VG, helpers, QUEST_DB)
   ================================================================ */

window.completeMissionRun = function(missionId) {
  const gs = gameState;
  if (!gs.questStats) gs.questStats = {};
  if (!gs.questStats.missionRuns) gs.questStats.missionRuns = {};
  gs.questStats.missionRuns[missionId] = true;
  if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
};

window.getMissionRequires = function(questId) {
  const q = (window.QUEST_DB || []).find(x => x.id === questId);
  return q ? (q.requires || null) : null;
};

window.checkQuestProgress = function() {
  const gs = gameState;
  if (!gs.questStats) return;
  const db = window.QUEST_DB;
  if (!db) return;
  let anyNew = false;
  if (!gs.claimableQuests) gs.claimableQuests = [];
  if (!gs.completedQuests) gs.completedQuests = [];

  db.forEach(q => {
    if (gs.completedQuests.includes(q.id)) return;
    if (gs.claimableQuests.includes(q.id)) return;
    if (!_questUnlocked(q, gs)) return;
    try {
      const { cur, tgt } = q.check(gs);
      if (cur >= tgt) { gs.claimableQuests.push(q.id); anyNew = true; }
    } catch(e) {}
  });

  if (anyNew) {
    const dot = document.getElementById('career-dot');
    if (dot) dot.classList.remove('hidden');
    if (typeof showNotification === 'function') showNotification('🏆 Ricompensa quest disponibile!', 'success');
  }
};

window.claimQuestReward = function(questId) {
  const gs = gameState;
  if (!(gs.claimableQuests || []).includes(questId)) return;
  const q = (window.QUEST_DB || []).find(x => x.id === questId);
  if (!q) return;

  gs.claimableQuests = gs.claimableQuests.filter(id => id !== questId);
  if (!gs.completedQuests) gs.completedQuests = [];
  gs.completedQuests.push(questId);

  const r = q.rewards;
  if (r.cash)       { gs.cash += r.cash; gs.annualProfitTracker = (gs.annualProfitTracker || 0) + r.cash; }
  if (r.vtk)        gs.vtkBalance = (gs.vtkBalance || 0) + r.vtk;
  if (r.tc)         gs.driverCoins = (gs.driverCoins || 0) + r.tc;
  if (r.rep)        gs.reputation = Math.min(5.0 + (gs.prestige || 0), gs.reputation + r.rep);
  if (r.shadowCoin) gs.shadowCoin = (gs.shadowCoin || 0) + r.shadowCoin;
  if (r.unlock)     { if (!gs.unlockedFeatures) gs.unlockedFeatures = []; if (!gs.unlockedFeatures.includes(r.unlock)) gs.unlockedFeatures.push(r.unlock); }
  if (r.title)      gs.playerTitle = r.title;

  if (r.cash && typeof window.spawnMoneyParticles === 'function') {
    const btn = document.activeElement;
    const rect = btn ? btn.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
    window.spawnMoneyParticles(rect.left + (rect.width || 0) / 2, rect.top, r.cash);
  }

  if (typeof showBigEvent === 'function') showBigEvent('🏆', q.title, `Missione completata!\n${r.desc}`);
  if (typeof logToMap === 'function') logToMap(`🏆 Quest: "${q.title}" → ${r.desc}`);

  const dot = document.getElementById('career-dot');
  if (dot && !(gs.claimableQuests?.length > 0)) dot.classList.add('hidden');

  if (typeof updateUI === 'function') updateUI();
  if (document.getElementById('career-modal-overlay') && typeof window.openCareerModal === 'function') window.openCareerModal();
  if (typeof saveGame === 'function') saveGame();
};
