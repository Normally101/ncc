'use strict';
/* ui-career.js — Chauffeur Empire
   renderTabCareer: missioni, quests, bivio narrative.
   Dipendenze: engine.js, quests.js, design-system.js */

function renderTabCareer() {
    const container = document.getElementById('tab-container');
    if (typeof window.QUEST_DB === 'undefined') {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10 text-[10px]">Sistema missioni non caricato.</div>`;
        return;
    }
    const gs = gameState;
    const completed = gs.completedQuests || [];
    const claimable = gs.claimableQuests || [];
    const total     = window.QUEST_DB.length;

    const chLabels = {
        1:'🎓 Tutorial — Il Battesimo del Fuoco',
        2:'📦 Volume I — La Prima Ombra',
        3:'🏢 Volume II-III — Le Ombre · Il Dominio',
        4:'⚡ Volume IV — L\'Energia',
        5:'👑 Volume V — Il Potere Assoluto',
        6:'🌍 Volume VI — L\'Impero Continentale',
        7:'⚔️ Volume VII — La Guerra delle Ombre',
        8:'🌑 Volume VIII — Il Giudizio Finale',
        9:'🌋 Volume Finale — L\'Apocalisse',
    };

    const tierGradient = {
        bronze:   'linear-gradient(135deg,#3d2010 0%,#1a1a2e 100%)',
        silver:   'linear-gradient(135deg,#1c2333 0%,#1a1a2e 100%)',
        gold:     'linear-gradient(135deg,#2d2200 0%,#1a1a2e 100%)',
        diamond:  'linear-gradient(135deg,#0a2233 0%,#1a1a2e 100%)',
        legendary:'linear-gradient(135deg,#2d1000 0%,#1a1a2e 100%)',
    };
    const tierColor = { bronze:'#cd7f32', silver:'#c0c0c0', gold:'#d4af37', diamond:'#a8d8ea', legendary:'#ff6b35' };
    const typeLabel = { tutorial:'Tutorial', story:'Storia', raid:'Raid Boss', milestone:'Traguardo' };

    // Find the single active quest: first in DB order that is claimable or (prereqs met and not done)
    const activeQ = window.QUEST_DB.find(q => {
        if (completed.includes(q.id)) return false;
        const prereqsMet = (q.prereqs || []).every(p => completed.includes(p));
        return prereqsMet;
    });

    // If all quests are done
    if (!activeQ) {
        container.innerHTML = `
            <div class="text-center mt-16 space-y-3">
                <div class="text-4xl">🏆</div>
                <div class="text-[13px] font-bold text-gold">Campagna completata!</div>
                <div class="text-[10px] text-gray-400">${total}/${total} missioni completate.</div>
            </div>`;
        return;
    }

    const isClaim    = claimable.includes(activeQ.id);
    const alreadyRun = !!(gs.questStats?.missionRuns?.[activeQ.id]);
    const canDispatch = activeQ.type === 'story' || activeQ.type === 'raid' ||
        (activeQ.type === 'tutorial' && ['t03','t05','t06'].includes(activeQ.id));
    const showDispatch = canDispatch && !isClaim && !alreadyRun;

    let prog = { cur: 0, tgt: 1 };
    try { prog = activeQ.check(gs); } catch(e) {}
    if (isClaim) prog.cur = prog.tgt;
    const pct = Math.min(100, Math.round(((prog.cur || 0) / Math.max(1, prog.tgt || 1)) * 100));
    const barColor = isClaim ? '#22c55e' : activeQ.type === 'raid' ? '#ff6b35' : '#d4af37';

    const tColor    = tierColor[activeQ.tier] || '#d4af37';
    const tGrad     = tierGradient[activeQ.tier] || tierGradient.gold;
    const chLabel   = chLabels[activeQ.ch] || `Capitolo ${activeQ.ch}`;
    const typeTag   = typeLabel[activeQ.type] || activeQ.type;
    const isRaid    = activeQ.type === 'raid';

    const rewardParts = [
        activeQ.rewards.cash       ? `€${activeQ.rewards.cash.toLocaleString()}` : null,
        activeQ.rewards.tc         ? `+${activeQ.rewards.tc} Driver Coins` : null,
        activeQ.rewards.rep        ? `+${activeQ.rewards.rep}★ Reputazione` : null,
        activeQ.rewards.shadowCoin ? `+${activeQ.rewards.shadowCoin.toLocaleString()} Shadow Coin` : null,
        activeQ.rewards.unlock     ? `🔓 ${activeQ.rewards.unlock}` : null,
        activeQ.rewards.title      ? `🏅 "${activeQ.rewards.title}"` : null,
    ].filter(Boolean);
    const rewardDisplay = rewardParts.length ? rewardParts : [activeQ.rewards.desc || '—'];

    // Next quest preview
    const nextQ = window.QUEST_DB.find(q => {
        if (completed.includes(q.id) || q.id === activeQ.id) return false;
        const prereqsMet = (q.prereqs || []).every(p => completed.includes(p) || q.prereqs.includes(activeQ.id) && q.prereqs.every(p2 => p2 === activeQ.id || completed.includes(p2)));
        return prereqsMet || q.prereqs.includes(activeQ.id);
    });

    const questIndex = window.QUEST_DB.findIndex(q => q.id === activeQ.id) + 1;

    let html = `
        <!-- Chapter header -->
        <div class="flex items-center justify-between mb-3">
            <div class="text-[9px] text-gray-500 uppercase tracking-widest">${chLabel}</div>
            <div class="text-[9px] text-gray-600 font-mono">${completed.length}/${total} completate</div>
        </div>

        <!-- Progress strip -->
        <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-4">
            <div class="h-full rounded-full" style="width:${Math.round(completed.length/total*100)}%;background:linear-gradient(90deg,#d4af37,#cd7f32)"></div>
        </div>

        <!-- Active mission card -->
        <div class="rounded-xl overflow-hidden border ${isRaid ? 'border-orange-500/40' : 'border-white/10'} shadow-2xl mb-4">

            <!-- Hero banner -->
            <div class="relative px-4 pt-5 pb-4" style="background:${tGrad}">
                <div class="flex items-start gap-3">
                    <div class="text-3xl flex-shrink-0 mt-0.5">${activeQ.icon}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded" style="background:${tColor}22;color:${tColor}">${typeTag}</span>
                            <span class="text-[8px] text-gray-500">#${questIndex}</span>
                        </div>
                        <div class="text-[14px] font-bold leading-tight" style="color:${tColor}">${activeQ.title}</div>
                        <div class="text-[10px] text-gray-300 mt-0.5">${activeQ.subtitle || ''}</div>
                    </div>
                </div>
                ${activeQ.giver ? `<div class="text-[8px] text-gray-500 mt-2">${activeQ.giver.name} · ${activeQ.giver.faction}</div>` : ''}
            </div>

            <!-- Lore -->
            ${activeQ.lore ? `
            <div class="px-4 py-3 bg-white/3 border-t border-white/5">
                <div class="text-[9px] text-gray-400 italic leading-relaxed">"${activeQ.lore}"</div>
            </div>` : ''}

            <!-- How to complete -->
            <div class="px-4 py-3 border-t border-white/5" style="background:rgba(212,175,55,0.06)">
                <div class="text-[8px] font-bold uppercase tracking-widest mb-1" style="color:#c9a227">📋 Come completarla</div>
                <div class="text-[10px] leading-relaxed" style="color:#1a2744">${activeQ.howTo || activeQ.subtitle || 'Segui le indicazioni del tuo mentore per avanzare.'}</div>
            </div>

            <!-- Task box -->
            <div class="px-4 py-3 bg-[#111120] border-t border-white/5">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-[10px] font-semibold text-white">${activeQ.subtitle || 'Obiettivo'}</div>
                    <div class="text-[11px] font-bold font-mono" style="color:${isClaim ? '#22c55e' : tColor}">${prog.cur}/${prog.tgt}</div>
                </div>
                <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${barColor}"></div>
                </div>
                ${isClaim ? `
                <div class="mt-3">
                    <button onclick="window.claimQuestReward('${activeQ.id}')"
                        class="w-full py-2 rounded-lg text-[11px] font-bold text-black animate-pulse"
                        style="background:linear-gradient(90deg,#22c55e,#16a34a)">
                        🎁 Ritira Ricompensa
                    </button>
                </div>` : showDispatch ? `
                <div class="mt-3">
                    <button onclick="window.startMissionRun('${activeQ.id}')"
                        class="w-full py-2 rounded-lg text-[11px] font-bold"
                        style="background:linear-gradient(90deg,${tColor}cc,${tColor}88);color:#000">
                        ▶ Avvia Missione
                    </button>
                </div>` : ''}
            </div>

            <!-- Reward section -->
            <div class="border-t border-white/10">
                <div class="px-4 py-1.5 text-center text-[8px] font-bold uppercase tracking-widest text-black" style="background:${tColor}">
                    Ricompensa
                </div>
                <div class="px-4 py-3 bg-[#0e0e1c] flex flex-wrap gap-2">
                    ${rewardDisplay.map(r => `
                    <div class="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5">
                        <span class="text-[10px] text-yellow-300">${r}</span>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- Next quest preview -->
        ${nextQ ? `
        <div class="opacity-40 rounded-xl border border-white/5 overflow-hidden">
            <div class="px-3 py-2 bg-white/3 flex items-center gap-2">
                <span class="text-base">🔒</span>
                <div>
                    <div class="text-[8px] text-gray-500 uppercase tracking-widest">Prossima missione</div>
                    <div class="text-[10px] text-gray-400 font-medium">${nextQ.title}</div>
                    <div class="text-[8px] text-gray-600">${nextQ.subtitle || ''}</div>
                </div>
            </div>
        </div>` : ''}
    `;

    container.innerHTML = html;
}
window.renderTabCareer = renderTabCareer;

window.startMissionRun = function(questId) {
    const q = (window.QUEST_DB || []).find(x => x.id === questId);
    if (!q) return;
    if (q.bivio) {
        window._showBivioModal(q);
    } else {
        if (typeof window.completeMissionRun === 'function') window.completeMissionRun(questId);
        if (typeof renderTabCareer === 'function' && typeof _tabIs === 'function' && _tabIs('career')) renderTabCareer();
    }
};

window._showBivioModal = function(q) {
    const existing = document.getElementById('bivio-modal');
    if (existing) existing.remove();

    const optHtml = q.bivio.options.map(opt => `
        <button onclick="window._applyBivioChoice('${q.id}','${opt.id}')"
                class="w-full text-left p-3 rounded-lg border border-white/10 hover:border-gold/40 hover:bg-white/5 transition-all mt-2">
            <div class="text-[10px] font-bold text-white">${opt.label}</div>
            <div class="text-[9px] text-gray-400 mt-0.5">${opt.desc}</div>
        </button>`).join('');

    const giverLine = q.giver ? `<div class="text-[9px] text-gray-500 mb-3">${q.giver.name} · ${q.giver.faction}</div>` : '';

    const modal = document.createElement('div');
    modal.id = 'bivio-modal';
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4';
    modal.innerHTML = `
        <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <div class="text-[10px] text-gold uppercase tracking-widest mb-1">${q.icon} ${q.title}</div>
            ${giverLine}
            <div class="text-[11px] text-white font-medium mb-1">${q.bivio.prompt}</div>
            ${optHtml}
            <button onclick="document.getElementById('bivio-modal').remove()"
                    class="mt-4 text-[9px] text-gray-600 hover:text-gray-400 w-full text-center">Annulla</button>
        </div>`;
    document.body.appendChild(modal);

    window._bivioQuestRef = q;
};

window._applyBivioChoice = function(questId, optionId) {
    const q = window._bivioQuestRef;
    if (!q || q.id !== questId) return;
    const opt = q.bivio.options.find(o => o.id === optionId);
    if (!opt) return;
    document.getElementById('bivio-modal')?.remove();
    try { opt.effect(gameState); } catch(e) {}
    if (typeof window.completeMissionRun === 'function') window.completeMissionRun(questId);
    if (typeof updateUI === 'function') updateUI();
    if (typeof renderTabCareer === 'function' && typeof _tabIs === 'function' && _tabIs('career')) renderTabCareer();
    if (typeof saveGame === 'function') saveGame();
};

let _ecActiveTab = 'acquire';
