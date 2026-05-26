'use strict';
/* ui-career.js — Chauffeur Empire
   renderTabCareer: quest journal cinematico.
   Mostra solo missioni sbloccate e completate — mai quelle locked. */

/* ── Costanti UI ──────────────────────────────────────────── */
const _CH_NAMES = {
    1: '🎓 Il Battesimo del Fuoco',
    2: '📦 Volume I — La Prima Ombra',
    3: '🏢 Volume II — Le Ombre · Il Dominio',
    4: '⚡ Volume III — L\'Energia',
    5: '👑 Volume IV — Il Potere Assoluto',
    6: '🌍 Volume V — L\'Impero Continentale',
    7: '⚔️ Volume VI — La Guerra delle Ombre',
    8: '🌑 Volume VII — Il Giudizio Finale',
    9: '🌋 Volume Finale — L\'Apocalisse',
};

const _TIER_COLOR = {
    bronze: '#cd7f32', silver: '#b0b8c4', gold: '#d4af37',
    diamond: '#7ec8e3', legendary: '#ff6b35',
};
const _TIER_GRAD = {
    bronze:   'linear-gradient(135deg,#2a1608 0%,#12121e 100%)',
    silver:   'linear-gradient(135deg,#141c28 0%,#0e0e1c 100%)',
    gold:     'linear-gradient(135deg,#1e1600 0%,#0e0e1c 100%)',
    diamond:  'linear-gradient(135deg,#051828 0%,#0e0e1c 100%)',
    legendary:'linear-gradient(135deg,#1f0800 0%,#0e0e1c 100%)',
};
const _TYPE_LABEL = { tutorial: 'Tutorial', story: 'Storia', raid: '⚔️ Raid Boss', milestone: 'Traguardo' };

function _isUnlocked(q, completed) {
    return (q.prereqs || []).every(id => completed.includes(id));
}

function _rewardLine(r) {
    const parts = [
        r.cash       ? `💰 €${r.cash.toLocaleString('it')}` : null,
        r.tc         ? `🪙 +${r.tc} TC` : null,
        r.rep        ? `⭐ +${r.rep}★` : null,
        r.shadowCoin ? `👁️ +${r.shadowCoin.toLocaleString('it')} SC` : null,
        r.unlock     ? `🔓 ${r.unlock}` : null,
        r.title      ? `🏅 "${r.title}"` : null,
    ].filter(Boolean);
    return parts.length ? parts.join('  ·  ') : (r.desc || '—');
}

/* ── Main render ──────────────────────────────────────────── */
function renderTabCareer() {
    const container = document.getElementById('tab-container');
    if (!window.QUEST_DB) {
        container.innerHTML = `<div style="color:rgba(255,255,255,0.3);font-size:10px;text-align:center;margin-top:40px">Sistema missioni non caricato.</div>`;
        return;
    }

    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();

    const gs        = gameState;
    const completed = gs.completedQuests || [];
    const claimable = gs.claimableQuests || [];

    // Classify all quests
    const storyTypes = ['tutorial', 'story', 'raid'];
    let activeStory     = null; // first unlocked story/raid/tutorial quest
    const activeMiles   = [];   // all unlocked milestones not yet completed
    const claimMiles    = [];   // claimable milestones

    for (const q of window.QUEST_DB) {
        if (completed.includes(q.id)) continue;
        if (!_isUnlocked(q, completed)) continue;
        if (storyTypes.includes(q.type)) {
            if (!activeStory) activeStory = q;
        } else if (q.type === 'milestone') {
            if (claimable.includes(q.id)) claimMiles.push(q);
            else activeMiles.push(q);
        }
    }

    // Completed quests grouped by chapter (story only for archive)
    const completedByChapter = {};
    for (const q of window.QUEST_DB) {
        if (!completed.includes(q.id)) continue;
        const ch = q.ch;
        if (!completedByChapter[ch]) completedByChapter[ch] = [];
        completedByChapter[ch].push(q);
    }

    const totalCompleted = completed.length;
    const currentCh      = activeStory ? activeStory.ch : (totalCompleted > 0 ? Math.max(...window.QUEST_DB.filter(q => completed.includes(q.id)).map(q => q.ch)) : 1);
    const chName         = _CH_NAMES[currentCh] || `Capitolo ${currentCh}`;

    let html = '';

    // ── HEADER ──────────────────────────────────────────────
    html += `
    <div style="background:linear-gradient(135deg,#0a0c16,#111828);border-bottom:1px solid rgba(212,175,55,0.12);padding:18px 20px 14px;position:sticky;top:0;z-index:10">
        <div style="display:flex;align-items:flex-end;justify-content:space-between">
            <div>
                <div style="font-size:8px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:3px">Percorso Corrente</div>
                <div style="font-size:13px;font-weight:800;color:#d4af37;font-family:'Orbitron',monospace;line-height:1.1">${chName}</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:22px;font-weight:900;color:white;line-height:1">${totalCompleted}</div>
                <div style="font-size:8px;color:rgba(255,255,255,0.3)">missioni completate</div>
            </div>
        </div>
        <div style="height:2px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:12px;overflow:hidden">
            <div style="height:100%;background:linear-gradient(90deg,#d4af37,#cd7f32);border-radius:2px;width:${Math.round(totalCompleted / Math.max(1, window.QUEST_DB.length) * 100)}%;transition:width 0.6s ease"></div>
        </div>
    </div>
    <div style="padding:16px">`;

    // ── CAMPAGNA COMPLETATA ──────────────────────────────────
    if (!activeStory && activeMiles.length === 0 && claimMiles.length === 0) {
        html += `
        <div style="text-align:center;padding:60px 20px">
            <div style="font-size:48px;margin-bottom:12px">🏆</div>
            <div style="font-size:14px;font-weight:800;color:#d4af37;margin-bottom:6px">Campagna Completata.</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.35)">Hai dominato il mercato NCC italiano.</div>
        </div>`;
    }

    // ── MISSIONI DA RISCATTARE (priorità assoluta) ───────────
    if (activeStory && claimable.includes(activeStory.id)) {
        html += _renderClaimBanner(activeStory);
    }
    if (claimMiles.length > 0) {
        html += `<div style="margin-bottom:4px">`;
        for (const q of claimMiles) html += _renderClaimBanner(q);
        html += `</div>`;
    }

    // ── MISSIONE ATTIVA (storia) ─────────────────────────────
    if (activeStory && !claimable.includes(activeStory.id)) {
        html += _renderActiveStory(activeStory, gs, claimable);
    }

    // ── TRAGUARDI ATTIVI ────────────────────────────────────
    if (activeMiles.length > 0) {
        html += `
        <div style="margin-top:${activeStory ? 20 : 0}px">
            <div style="font-size:8px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px">🏅 Traguardi in Corso</div>
            <div style="display:flex;flex-direction:column;gap:8px">`;
        for (const q of activeMiles.slice(0, 5)) {
            html += _renderMilestoneCard(q, gs);
        }
        if (activeMiles.length > 5) {
            html += `<div style="font-size:9px;color:rgba(255,255,255,0.25);text-align:center;padding:8px">+${activeMiles.length - 5} altri traguardi in corso</div>`;
        }
        html += `</div></div>`;
    }

    // ── ARCHIVIO COMPLETATE ──────────────────────────────────
    const archiveChapters = Object.keys(completedByChapter).map(Number).sort((a, b) => b - a);
    if (archiveChapters.length > 0) {
        html += `
        <div style="margin-top:28px;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px">
            <div style="font-size:8px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:14px">📚 Archivio Completate</div>`;
        for (const ch of archiveChapters) {
            const quests = completedByChapter[ch];
            const chLabel = _CH_NAMES[ch] || `Capitolo ${ch}`;
            html += `
            <div style="margin-bottom:16px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.45)">${chLabel}</div>
                    <div style="font-size:8px;color:rgba(255,255,255,0.2);font-variant-numeric:tabular-nums">${quests.length} completate</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px">`;
            for (const q of quests) {
                const tc = _TIER_COLOR[q.tier] || '#d4af37';
                html += `
                <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:rgba(255,255,255,0.025);border-radius:7px;border-left:2px solid ${tc}40">
                    <span style="font-size:14px;flex-shrink:0">${q.icon}</span>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${q.title}</div>
                        <div style="font-size:8px;color:rgba(255,255,255,0.25)">${_rewardLine(q.rewards)}</div>
                    </div>
                    <span style="color:#22c55e;font-size:11px;flex-shrink:0">✓</span>
                </div>`;
            }
            // Subtle "more" hint if this is the current chapter and there are locked quests ahead
            if (ch === currentCh && activeStory) {
                html += `<div style="text-align:center;padding:10px 0 2px;color:rgba(255,255,255,0.12);font-size:12px;letter-spacing:0.3em">· · ·</div>`;
            }
            html += `</div></div>`;
        }
        html += `</div>`;
    }

    html += `</div>`; // close padding wrapper
    container.innerHTML = html;
}

/* ── Card Builders ────────────────────────────────────────── */
function _renderClaimBanner(q) {
    const tc = _TIER_COLOR[q.tier] || '#d4af37';
    return `
    <div style="background:linear-gradient(135deg,rgba(34,197,94,0.12),rgba(21,128,61,0.08));border:1px solid rgba(34,197,94,0.35);border-radius:12px;padding:14px 16px;margin-bottom:12px;animation:tut-pulse 2s ease-in-out infinite">
        <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">${q.icon}</span>
            <div style="flex:1">
                <div style="font-size:8px;color:#22c55e;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:2px">🎁 Ricompensa Disponibile</div>
                <div style="font-size:12px;font-weight:800;color:white">${q.title}</div>
                <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:1px">${_rewardLine(q.rewards)}</div>
            </div>
            <button onclick="window.claimQuestReward('${q.id}')" style="padding:8px 16px;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;border-radius:8px;color:white;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap;flex-shrink:0">RISCATTA</button>
        </div>
    </div>`;
}

function _renderActiveStory(q, gs, claimable) {
    const tc       = _TIER_COLOR[q.tier] || '#d4af37';
    const tGrad    = _TIER_GRAD[q.tier]  || _TIER_GRAD.gold;
    const isRaid   = q.type === 'raid';
    const typeTag  = _TYPE_LABEL[q.type] || q.type;

    let prog = { cur: 0, tgt: 1 };
    try { prog = q.check(gs); } catch(e) {}
    const pct = Math.min(100, Math.round((prog.cur / Math.max(1, prog.tgt)) * 100));
    const barColor = isRaid ? '#ff6b35' : tc;

    const isClaim    = claimable.includes(q.id);
    const alreadyRun = !!(gs.questStats?.missionRuns?.[q.id]);
    const canDispatch = q.type === 'story' || q.type === 'raid' || (q.type === 'tutorial' && ['t03','t05','t06'].includes(q.id));
    const showDispatch = canDispatch && !isClaim && !alreadyRun;

    const giverHtml = q.giver ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <div style="width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);flex-shrink:0">${q.giver.name[0]}</div>
            <div style="font-size:9px;color:rgba(255,255,255,0.4)">${q.giver.name} <span style="color:rgba(255,255,255,0.2)">·</span> ${q.giver.faction}</div>
        </div>` : '';

    const ctaHtml = isClaim
        ? `<button onclick="window.claimQuestReward('${q.id}')" style="width:100%;padding:10px;background:linear-gradient(90deg,#22c55e,#16a34a);border:none;border-radius:8px;color:white;font-size:11px;font-weight:800;cursor:pointer;margin-top:12px">🎁 Ritira Ricompensa</button>`
        : showDispatch
        ? `<button onclick="window.startMissionRun('${q.id}')" style="width:100%;padding:10px;background:${tc}22;border:1px solid ${tc}55;border-radius:8px;color:${tc};font-size:11px;font-weight:700;cursor:pointer;margin-top:12px">▶ Avvia Missione</button>`
        : '';

    return `
    <div style="border:1px solid ${isRaid ? 'rgba(255,107,53,0.35)' : 'rgba(255,255,255,0.08)'};border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.5)">

        <!-- Hero banner -->
        <div style="padding:20px 18px 16px;background:${tGrad}">
            <div style="display:flex;align-items:flex-start;gap:12px">
                <div style="font-size:36px;line-height:1;flex-shrink:0">${q.icon}</div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                        <span style="font-size:7px;text-transform:uppercase;letter-spacing:0.1em;padding:2px 7px;border-radius:3px;background:${tc}20;color:${tc};font-weight:700">${typeTag}</span>
                    </div>
                    <div style="font-size:16px;font-weight:900;color:${tc};line-height:1.1;font-family:'Orbitron',monospace">${q.title}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:3px">${q.subtitle || ''}</div>
                </div>
            </div>
            ${giverHtml}
        </div>

        <!-- Lore -->
        ${q.lore ? `<div style="padding:14px 18px;background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.05)">
            <div style="font-size:9.5px;color:rgba(255,255,255,0.38);font-style:italic;line-height:1.7">"${q.lore}"</div>
        </div>` : ''}

        <!-- Come fare -->
        ${q.howTo ? `<div style="padding:12px 18px;background:rgba(212,175,55,0.04);border-top:1px solid rgba(212,175,55,0.1)">
            <div style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#c9a227;margin-bottom:5px">📋 Come completarla</div>
            <div style="font-size:9.5px;color:rgba(255,255,255,0.55);line-height:1.65">${q.howTo}</div>
        </div>` : ''}

        <!-- Progress -->
        <div style="padding:14px 18px;background:#0a0c12;border-top:1px solid rgba(255,255,255,0.05)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="font-size:9px;color:rgba(255,255,255,0.4)">Progresso</div>
                <div style="font-size:11px;font-weight:800;font-family:monospace;color:${isClaim ? '#22c55e' : tc}">${prog.cur} / ${prog.tgt}</div>
            </div>
            <div style="height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden">
                <div style="height:100%;background:${barColor};border-radius:3px;width:${pct}%;transition:width 0.6s ease"></div>
            </div>
            ${ctaHtml}
        </div>

        <!-- Reward bar -->
        <div style="border-top:1px solid rgba(255,255,255,0.06)">
            <div style="padding:6px 18px;background:${tc};text-align:center">
                <span style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:rgba(0,0,0,0.75)">Ricompensa</span>
            </div>
            <div style="padding:12px 18px;background:#0d0f1a">
                <div style="font-size:10px;color:rgba(255,255,255,0.6);line-height:1.7">${_rewardLine(q.rewards)}</div>
            </div>
        </div>
    </div>`;
}

function _renderMilestoneCard(q, gs) {
    const tc = _TIER_COLOR[q.tier] || '#d4af37';
    let prog = { cur: 0, tgt: 1 };
    try { prog = q.check(gs); } catch(e) {}
    const pct = Math.min(100, Math.round((prog.cur / Math.max(1, prog.tgt)) * 100));

    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:9px;border:1px solid rgba(255,255,255,0.06)">
        <span style="font-size:18px;flex-shrink:0">${q.icon}</span>
        <div style="flex:1;min-width:0">
            <div style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${q.title}</div>
            <div style="height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden">
                <div style="height:100%;background:${tc};border-radius:2px;width:${pct}%"></div>
            </div>
        </div>
        <div style="font-size:9px;font-weight:700;color:${tc};font-family:monospace;flex-shrink:0">${prog.cur}/${prog.tgt}</div>
    </div>`;
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
