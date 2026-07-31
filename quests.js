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
  if (r.cash)       { gs.cash += r.cash; gs.annualProfitTracker = (gs.annualProfitTracker || 0) + r.cash;
    // Server-authoritative mirror (come per il VTK sotto): senza questo il reward cash
    // resta solo locale e al prossimo bridge col server viene sovrascritto → desync/exploit.
    if (typeof window.ServerState !== 'undefined' && typeof window.ServerState.syncCash === 'function') window.ServerState.syncCash(gs.cash).catch(() => {}); }
  if (r.vtk) {
    gs.vtkBalance = (gs.vtkBalance || 0) + r.vtk;   // optimistic
    // VTK-5: il server applica il cap giornaliero (500) ed è autoritativo.
    // Passiamo anche il mission_id per l'audit; riconciliamo il saldo locale con
    // quanto il server ha REALMENTE accreditato (se cap raggiunto, < r.vtk).
    if (window.supabaseClient && window.currentUser?.id) {
      window.supabaseClient.rpc('rpc_award_mission_vtk', { v_vtk_amount: r.vtk, v_mission_id: questId })
        .then(({ data, error }) => {
          if (error) { console.warn('[VTK-5] award error:', error.code || '', error.message || error); return; }
          const awarded = data && typeof data.awarded === 'number' ? data.awarded : r.vtk;
          if (awarded !== r.vtk) {                  // cap colpito → correggi l'ottimismo
            gs.vtkBalance = Math.max(0, (gs.vtkBalance || 0) - (r.vtk - awarded));
            if (typeof updateUI === 'function') updateUI();
          }
        });
    }
  }
  if (r.tc) {
    gs.driverCoins = (gs.driverCoins || 0) + r.tc;
    window.ServerState?.addDriverCoins?.(r.tc, 'quest_reward')
        ?.then(_r => { if (_r?.ok && _r.driver_coins != null) { gs.driverCoins = _r.driver_coins; if (typeof updateUI === 'function') updateUI(); } })
        ?.catch(() => {});
  }
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
