'use strict';
/* ui-career.js — Chauffeur Empire · Missioni (modal overlay) */

/* ── Constants ──────────────────────────────────────────────── */
const _CH_NAMES = {
    1: 'Il Battesimo del Fuoco',
    2: 'Volume I — La Prima Ombra',
    3: 'Volume II — Le Ombre · Il Dominio',
    4: 'Volume III — L\'Energia',
    5: 'Volume IV — Il Potere Assoluto',
    6: 'Volume V — L\'Impero Continentale',
    7: 'Volume VI — La Guerra delle Ombre',
    8: 'Volume VII — Il Giudizio Finale',
    9: 'Volume Finale — L\'Apocalisse',
};

const _TIER_COLOR = {
    bronze: 'var(--em-tier-bronze)', silver: 'var(--em-tier-silver)', gold: 'var(--em-gold)',
    diamond: 'var(--em-tier-diamond)', legendary: 'var(--em-tier-legend)',
};

const _TYPE_LABEL = { tutorial: 'Tutorial', story: 'Storia', raid: 'Raid Boss', milestone: 'Traguardo' };

/* ── CSS injected once ──────────────────────────────────────── */
(function _injectCareerCSS() {
    if (document.getElementById('career-modal-css')) return;
    const s = document.createElement('style');
    s.id = 'career-modal-css';
    s.textContent = `
#career-modal-overlay {
    position:fixed;inset:0;background:rgba(7,9,15,0.82);
    z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;padding:20px;
}
#career-modal-wrap { position:relative;width:100%;max-width:820px;max-height:90vh;display:flex;flex-direction:column; }
#career-modal-close {
    position:absolute;top:-8px;right:-8px;z-index:1;
    width:24px;height:24px;background:var(--em-line);border:1px solid var(--em-line3);
    color:var(--em-muted);font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;
}
#career-modal-close:hover { background:var(--em-line);color:var(--em-ink); }
#career-modal {
    background:var(--em-card);border:1px solid var(--em-line);border-top:2px solid var(--em-gold);
    display:grid;grid-template-columns:1fr 240px;max-height:90vh;overflow:hidden;
}
.cm-main { display:flex;flex-direction:column;overflow:hidden;min-width:0; }
.cm-head {
    padding:14px 16px 12px;border-bottom:1px solid var(--em-line);background:var(--em-bg);flex-shrink:0;
}
.cm-breadcrumb { font-size:8px;color:var(--em-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px; }
.cm-breadcrumb .gold { color:var(--em-gold); }
.cm-title { font-size:15px;font-weight:700;color:var(--em-ink);margin-bottom:5px; }
.cm-giver { display:flex;align-items:center;gap:8px;font-size:10px;color:var(--em-muted); }
.cm-giver-badge { font-size:9px;background:var(--em-gold-soft);border:1px solid var(--em-gold);color:var(--em-gold);padding:1px 8px; }
.cm-timeline {
    display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid var(--em-line);
    background:var(--em-bg);gap:0;overflow-x:auto;flex-shrink:0;
}
.cm-tl-node {
    width:22px;height:22px;border:1px solid;display:flex;align-items:center;justify-content:center;
    font-size:8px;font-weight:700;flex-shrink:0;position:relative;cursor:default;
}
.cm-tl-node.done   { border-color:var(--em-green-edge);background:var(--em-green-soft);color:var(--em-green-d); }
.cm-tl-node.active { border-color:var(--em-gold);background:var(--em-gold-soft);color:var(--em-gold); }
.cm-tl-node.locked { border-color:var(--em-line);background:var(--em-bg);color:var(--em-line); }
.cm-tl-label {
    position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:var(--em-card);
    border:1px solid var(--em-line3);padding:2px 6px;font-size:8px;white-space:nowrap;color:var(--em-muted);
    pointer-events:none;display:none;z-index:10;
}
.cm-tl-node:hover .cm-tl-label { display:block; }
.cm-tl-line { flex:1;height:1px;background:var(--em-line);min-width:10px; }
.cm-tl-line.done { background:var(--em-green-edge); }
.cm-tl-next { font-size:8px;color:var(--em-line);margin-left:10px;white-space:nowrap;flex-shrink:0; }
.cm-status {
    display:flex;align-items:center;gap:12px;padding:7px 16px;border-bottom:1px solid var(--em-line);
    background:var(--em-bg);flex-shrink:0;
}
.cm-status-badge {
    font-size:8px;text-transform:uppercase;letter-spacing:1px;
    padding:2px 8px;border:1px solid var(--em-gold);color:var(--em-gold);background:var(--em-gold-soft);
}
.cm-status-badge.claim { border-color:var(--em-green-edge);color:var(--em-green-d);background:var(--em-green-soft); }
.cm-status-sub { font-size:9px;color:var(--em-muted); }
.cm-lore {
    padding:12px 16px;border-bottom:1px solid var(--em-line);border-left:3px solid var(--em-gold);
    font-size:11px;color:var(--em-muted);line-height:1.6;font-style:italic;background:var(--em-bg);flex-shrink:0;
}
.cm-objectives { flex:1;overflow-y:auto; }
.cm-obj-table { width:100%;border-collapse:collapse; }
.cm-obj-table thead tr { background:var(--em-bg); }
.cm-obj-table thead th {
    padding:7px 16px;font-size:8px;text-transform:uppercase;
    letter-spacing:1px;color:var(--em-muted);text-align:left;font-weight:600;border-bottom:1px solid var(--em-line);
}
.cm-obj-table thead th:last-child { text-align:right; }
.cm-obj-table tbody tr { border-bottom:1px solid var(--em-line); }
.cm-obj-table tbody tr:hover { background:var(--em-line); }
.cm-obj-table tbody td { padding:9px 16px;font-size:10px;color:var(--em-muted);vertical-align:middle; }
.cm-obj-status { font-size:8px;font-weight:700;white-space:nowrap; }
.cm-obj-status.done  { color:var(--em-green-d); }
.cm-obj-status.prog  { color:var(--em-gold); }
.cm-obj-status.open  { color:var(--em-line); }
.cm-mbar-wrap { display:flex;align-items:center;gap:8px; }
.cm-mbar-bg { width:70px;height:3px;background:var(--em-line);overflow:hidden;flex-shrink:0; }
.cm-mbar-fill { height:100%; }
.cm-mbar-val { font-size:9px;color:var(--em-muted);white-space:nowrap; }
.cm-howto { font-size:9px;color:var(--em-muted);line-height:1.5;margin-top:4px; }
.cm-reward {
    padding:10px 16px;border-top:1px solid var(--em-line);background:var(--em-bg);
    display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;
}
.cm-rlabel { font-size:8px;text-transform:uppercase;letter-spacing:1px;color:var(--em-muted);margin-right:4px; }
.cm-chip { font-size:9px;padding:3px 10px;border:1px solid var(--em-line3);color:var(--em-muted);background:var(--em-card); }
.cm-chip.gold  { border-color:var(--em-gold);color:var(--em-gold);background:var(--em-gold-soft); }
.cm-chip.green { border-color:var(--em-green-edge);color:var(--em-green-d);background:var(--em-green-soft); }
.cm-chip.vtk   { border-color:var(--em-blue-edge);color:var(--em-blue);background:var(--em-blue-soft); }
.cm-btn {
    margin-left:auto;padding:6px 18px;background:var(--em-gold-soft);border:1px solid var(--em-gold);
    color:var(--em-gold);font-size:9px;font-weight:700;text-transform:uppercase;
    letter-spacing:1px;cursor:pointer;
}
.cm-btn:hover { background:var(--em-gold-hover); }
.cm-btn.claim { background:var(--em-green-soft);border-color:var(--em-green-edge);color:var(--em-green-d); }
.cm-btn.claim:hover { background:var(--em-green-hover); }
.cm-sidebar { border-left:1px solid var(--em-line);display:flex;flex-direction:column;background:var(--em-bg);overflow-y:auto; }
.cm-side-head {
    padding:8px 12px;border-bottom:1px solid var(--em-line);display:flex;justify-content:space-between;
    align-items:center;font-size:8px;text-transform:uppercase;
    letter-spacing:1px;color:var(--em-muted);flex-shrink:0;background:var(--em-bg);
}
.cm-side-head .gold { color:var(--em-gold); }
.cm-node-row { display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--em-line);cursor:default; }
.cm-node-row.active-row { background:var(--em-row-on);border-left:2px solid var(--em-gold);padding-left:10px; }
.cm-node-num {
    width:18px;height:18px;border:1px solid;display:flex;align-items:center;justify-content:center;
    font-size:8px;font-weight:700;flex-shrink:0;
}
.cm-node-num.done   { border-color:var(--em-green-edge);color:var(--em-green-d);background:var(--em-green-soft); }
.cm-node-num.active { border-color:var(--em-gold);color:var(--em-gold);background:var(--em-gold-soft); }
.cm-node-num.locked { border-color:var(--em-line);color:var(--em-line);background:var(--em-bg); }
.cm-node-name { font-size:10px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.cm-node-name.done   { color:var(--em-muted); }
.cm-node-name.active { color:var(--em-ink);font-weight:600; }
.cm-node-name.locked { color:var(--em-line); }
.cm-node-tag { font-size:8px;flex-shrink:0; }
.cm-node-tag.ic { border:1px solid var(--em-gold);color:var(--em-gold);padding:1px 5px; }
.cm-node-tag.lock { color:var(--em-line3); }
.cm-node-tag.date { color:var(--em-muted); }
.cm-dots { padding:8px 12px;font-size:10px;color:var(--em-line3);letter-spacing:4px; }
.cm-arch-section { border-top:1px solid var(--em-line);flex-shrink:0; }
.cm-arch-row { display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-bottom:1px solid var(--em-line); }
.cm-arch-name { font-size:9px;color:var(--em-muted); }
.cm-arch-date { font-size:8px;color:var(--em-line); }
.cm-miles-section { padding:12px 16px;border-top:1px solid var(--em-line);flex-shrink:0; }
.cm-miles-label { font-size:8px;text-transform:uppercase;letter-spacing:1px;color:var(--em-muted);margin-bottom:8px; }
.cm-mile-row { display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--em-line); }
.cm-mile-icon { font-size:14px;flex-shrink:0; }
.cm-mile-name { font-size:10px;color:var(--em-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.cm-mile-bar-bg { width:50px;height:3px;background:var(--em-line);overflow:hidden;flex-shrink:0; }
.cm-mile-bar-fill { height:100%; }
.cm-mile-val { font-size:8px;color:var(--em-muted);white-space:nowrap;flex-shrink:0; }
.cm-empty { text-align:center;padding:48px 20px;color:var(--em-muted);font-size:11px; }
    `;
    document.head.appendChild(s);
})();

/* ── Helpers ────────────────────────────────────────────────── */
function _carIsUnlocked(q, completed) {
    return (q.prereqs || []).every(id => completed.includes(id));
}

function _carRewardLine(r) {
    const parts = [
        r.cash       ? `+€${r.cash.toLocaleString('it')}` : null,
        r.vtk        ? `+${r.vtk} VTK` : null,
        r.tc         ? `+${r.tc} DC` : null,
        r.rep        ? `+${r.rep}★` : null,
        r.shadowCoin ? `+${r.shadowCoin.toLocaleString('it')} SC` : null,
        r.unlock     ? r.unlock : null,
        r.title      ? `"${r.title}"` : null,
    ].filter(Boolean);
    return parts.length ? parts.join('  ·  ') : (r.desc || '—');
}

function _carGetData() {
    const gs        = gameState;
    const completed = gs.completedQuests  || [];
    const claimable = gs.claimableQuests  || [];
    const db        = window.QUEST_DB     || [];

    const storyTypes = ['tutorial', 'story', 'raid'];
    let   activeStory = null;
    const activeMiles = [];
    const claimMiles  = [];

    for (const q of db) {
        if (completed.includes(q.id)) continue;
        if (!_carIsUnlocked(q, completed)) continue;
        if (storyTypes.includes(q.type)) {
            if (!activeStory) activeStory = q;
        } else if (q.type === 'milestone') {
            if (claimable.includes(q.id)) claimMiles.push(q);
            else activeMiles.push(q);
        }
    }

    const completedByChapter = {};
    for (const q of db) {
        if (!completed.includes(q.id)) continue;
        if (!completedByChapter[q.ch]) completedByChapter[q.ch] = [];
        completedByChapter[q.ch].push(q);
    }

    const totalCompleted = completed.length;
    const currentCh      = activeStory
        ? activeStory.ch
        : (totalCompleted > 0 ? Math.max(...db.filter(q => completed.includes(q.id)).map(q => q.ch)) : 1);
    const chName         = _CH_NAMES[currentCh] || `Capitolo ${currentCh}`;
    const chQuests       = db.filter(q => q.ch === currentCh && storyTypes.includes(q.type));

    return { gs, completed, claimable, activeStory, activeMiles, claimMiles,
             completedByChapter, totalCompleted, currentCh, chName, chQuests };
}

/* ── Build modal HTML ───────────────────────────────────────── */
function _buildCareerModal() {
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    const d = _carGetData();
    const { gs, completed, claimable, activeStory, activeMiles, claimMiles,
            completedByChapter, totalCompleted, currentCh, chName, chQuests } = d;

    /* timeline */
    let tlHtml = '';
    for (let i = 0; i < chQuests.length; i++) {
        const q    = chQuests[i];
        const isDone   = completed.includes(q.id);
        const isActive = activeStory && q.id === activeStory.id;
        const isLocked = !isDone && !isActive && !_carIsUnlocked(q, completed);
        const cls  = isDone ? 'done' : isActive ? 'active' : isLocked ? 'locked' : 'locked';
        const lbl  = isDone ? '✓' : String(i + 1);
        if (i > 0) {
            tlHtml += `<div class="cm-tl-line${isDone ? ' done' : ''}"></div>`;
        }
        tlHtml += `<div class="cm-tl-node ${cls}">${lbl}<div class="cm-tl-label">${q.title}</div></div>`;
    }
    // hint for next chapter
    if (chQuests.length > 0) {
        tlHtml += `<div class="cm-tl-next">→ Cap. ${currentCh + 1}</div>`;
    }

    /* active mission */
    let mainHtml = '';

    if (!activeStory && activeMiles.length === 0 && claimMiles.length === 0) {
        mainHtml = `<div class="cm-empty">Campagna completata — hai dominato il mercato.</div>`;
    } else {
        /* claim banner for claimable story */
        if (activeStory && claimable.includes(activeStory.id)) {
            mainHtml += _buildClaimStory(activeStory);
        } else if (activeStory) {
            mainHtml += _buildActiveStory(activeStory, gs, claimable);
        }
        /* milestone claim banners */
        if (claimMiles.length > 0) {
            mainHtml += `<div style="border-top:1px solid var(--em-line)">`;
            for (const q of claimMiles) mainHtml += _buildClaimMile(q);
            mainHtml += `</div>`;
        }
    }

    /* active milestones footer */
    if (activeMiles.length > 0) {
        mainHtml += `
        <div class="cm-miles-section">
            <div class="cm-miles-label">Traguardi in Corso</div>
            ${activeMiles.slice(0, 4).map(q => _buildMileRow(q, gs)).join('')}
            ${activeMiles.length > 4 ? `<div style="font-size:9px;color:var(--em-muted);padding:6px 0">+${activeMiles.length - 4} altri…</div>` : ''}
        </div>`;
    }

    /* sidebar node list */
    let nodesHtml = chQuests.map((q, i) => {
        const isDone   = completed.includes(q.id);
        const isActive = activeStory && q.id === activeStory.id;
        const isLocked = !isDone && !isActive;
        const cls      = isDone ? 'done' : isActive ? 'active' : 'locked';
        const numCls   = isDone ? 'done' : isActive ? 'active' : 'locked';
        const num      = isDone ? '✓' : String(i + 1);
        const rowCls   = isActive ? 'cm-node-row active-row' : 'cm-node-row';
        const tag      = isDone
            ? `<span class="cm-node-tag date">${_dayCompleted(q.id, gs)}</span>`
            : isActive
            ? `<span class="cm-node-tag ic">● attiva</span>`
            : `<span class="cm-node-tag lock">🔒</span>`;
        return `<div class="${rowCls}">
            <div class="cm-node-num ${numCls}">${num}</div>
            <div class="cm-node-name ${cls}">${q.title}</div>
            ${tag}
        </div>`;
    }).join('') + `<div class="cm-dots">· · ·</div>`;

    /* sidebar archive */
    const archChapters = Object.keys(completedByChapter).map(Number).sort((a, b) => b - a);
    let archHtml = '';
    if (archChapters.length > 0) {
        archHtml = `<div class="cm-arch-section">
            <div class="cm-side-head"><span>Archivio Completate</span><span class="gold">${totalCompleted}</span></div>
            ${archChapters.map(ch => {
                const cqs = completedByChapter[ch];
                return cqs.map(q => `
                    <div class="cm-arch-row">
                        <div class="cm-arch-name">${q.title}</div>
                        <div class="cm-arch-date">Cap.${ch}</div>
                    </div>`).join('');
            }).join('')}
        </div>`;
    }

    return `
    <div id="career-modal-wrap">
        <div id="career-modal-close" ${ceAct('closeCareerModal', [])}>✕</div>
        <div id="career-modal">
            <!-- LEFT -->
            <div class="cm-main">
                <!-- Header -->
                <div class="cm-head">
                    <div class="cm-breadcrumb">Capitolo ${currentCh} &nbsp;›&nbsp; <span class="gold">${chName}</span></div>
                    <div class="cm-title">${activeStory ? activeStory.title : 'Campagna Completata'}</div>
                    <div class="cm-giver">
                        ${activeStory?.giver ? `<div class="cm-giver-badge">${activeStory.giver.name}</div>${activeStory.giver.faction}` : ''}
                    </div>
                </div>
                <!-- Timeline -->
                <div class="cm-timeline">${tlHtml}</div>
                <!-- Body -->
                <div class="cm-objectives" id="cm-main-body">${mainHtml}</div>
            </div>
            <!-- RIGHT -->
            <div class="cm-sidebar">
                <div class="cm-side-head">
                    <span>Capitolo ${currentCh}</span>
                    <span class="gold">${chQuests.filter(q => completed.includes(q.id)).length} / ${chQuests.length}</span>
                </div>
                ${nodesHtml}
                ${archHtml}
            </div>
        </div>
    </div>`;
}

function _dayCompleted(qid, gs) {
    // We don't track per-quest completion day, so just show checkmark
    return 'fatto';
}

// CTA buttons per missioni tutorial che richiedono navigazione a una tab
const _QUEST_CTA = {
    't01': { label: '🛒 Vai allo Showroom', tab: 'showroom' },
    't02': { label: '👔 Vai a Staff',       tab: 'staff'    },
    't03': { label: '🚕 Vai a Dispatch',    tab: 'corse'    },
    't04': { label: '🏢 Vai a HQ',          tab: 'hq'       },
};

/* ── Sub-builders ───────────────────────────────────────────── */
function _buildActiveStory(q, gs, claimable) {
    const isClaim = claimable.includes(q.id);
    const tc      = _TIER_COLOR[q.tier] || 'var(--em-gold)';
    let prog = { cur: 0, tgt: 1 };
    try { prog = q.check(gs); } catch(e) {}
    const pct = Math.min(100, Math.round((prog.cur / Math.max(1, prog.tgt)) * 100));
    const alreadyRun = !!(gs.questStats?.missionRuns?.[q.id]);
    const canDispatch = ['story','raid','tutorial'].includes(q.type) && ['t03','t05','t06'].includes(q.id);
    const showDispatch = canDispatch && !isClaim && !alreadyRun;
    const cta = !isClaim ? _QUEST_CTA[q.id] : null;

    const statusBadge = isClaim
        ? `<div class="cm-status-badge claim">Completata — da riscuotere</div>`
        : `<div class="cm-status-badge">${_TYPE_LABEL[q.type] || 'In Corso'}</div>`;

    const btn = isClaim
        ? `<button class="cm-btn claim" ${ceAct('claimQuestReward', [q.id])}>Riscuoti Ricompensa →</button>`
        : cta
        ? `<button class="cm-btn" ${ceAct('ceCareerCta', [cta.tab])}>${cta.label}</button>`
        : showDispatch
        ? `<button class="cm-btn" ${ceAct('startMissionRun', [q.id])}>Avvia Missione →</button>`
        : '';

    const rewardChips = _buildRewardChips(q.rewards);

    return `
        <div class="cm-status">
            ${statusBadge}
            <div class="cm-status-sub">${pct}% completato · ${prog.cur} / ${prog.tgt}</div>
        </div>
        ${q.lore ? `<div class="cm-lore">«${q.lore}»</div>` : ''}
        <table class="cm-obj-table">
            <thead>
                <tr>
                    <th style="width:22px"></th>
                    <th>Obiettivo</th>
                    <th style="width:120px">Progresso</th>
                    <th style="width:56px;text-align:right">Stato</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><span style="font-size:9px;color:${isClaim ? 'var(--em-green-d)' : pct > 0 ? 'var(--em-gold)' : 'var(--em-muted)'}">${isClaim ? '✓' : pct > 0 ? '◐' : '○'}</span></td>
                    <td>
                        <div style="${isClaim ? 'text-decoration:line-through;color:var(--em-muted)' : ''}">${q.howTo || q.subtitle || q.title}</div>
                    </td>
                    <td>
                        <div class="cm-mbar-wrap">
                            <div class="cm-mbar-bg"><div class="cm-mbar-fill" style="width:${pct}%;background:${tc}"></div></div>
                            <div class="cm-mbar-val">${prog.cur} / ${prog.tgt}</div>
                        </div>
                    </td>
                    <td style="text-align:right"><span class="cm-obj-status ${isClaim ? 'done' : pct > 0 ? 'prog' : 'open'}">${isClaim ? 'FATTO' : pct > 0 ? 'IN CORSO' : '—'}</span></td>
                </tr>
            </tbody>
        </table>
        <div class="cm-reward">
            <div class="cm-rlabel">Ricompensa</div>
            ${rewardChips}
            ${btn}
        </div>`;
}

function _buildClaimStory(q) {
    const rewardChips = _buildRewardChips(q.rewards);
    return `
        <div class="cm-status">
            <div class="cm-status-badge claim">Completata — da riscuotere</div>
        </div>
        ${q.lore ? `<div class="cm-lore">«${q.lore}»</div>` : ''}
        <table class="cm-obj-table">
            <thead><tr><th style="width:22px"></th><th>Obiettivo</th><th></th><th style="text-align:right">Stato</th></tr></thead>
            <tbody>
                <tr>
                    <td><span style="font-size:9px;color:var(--em-green-d)">✓</span></td>
                    <td style="text-decoration:line-through;color:var(--em-muted)">${q.howTo || q.title}</td>
                    <td></td>
                    <td style="text-align:right"><span class="cm-obj-status done">FATTO</span></td>
                </tr>
            </tbody>
        </table>
        <div class="cm-reward">
            <div class="cm-rlabel">Ricompensa</div>
            ${rewardChips}
            <button class="cm-btn claim" ${ceAct('claimQuestReward', [q.id])}>Riscuoti →</button>
        </div>`;
}

function _buildClaimMile(q) {
    const rewardChips = _buildRewardChips(q.rewards);
    return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--em-line)">
            <span style="font-size:18px;flex-shrink:0">${q.icon}</span>
            <div style="flex:1;min-width:0">
                <div style="font-size:8px;color:var(--em-green-d);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Traguardo completato</div>
                <div style="font-size:11px;font-weight:600;color:var(--em-ink)">${q.title}</div>
                <div style="font-size:9px;color:var(--em-muted);margin-top:2px">${rewardChips}</div>
            </div>
            <button class="cm-btn claim" style="flex-shrink:0" ${ceAct('claimQuestReward', [q.id])}>Riscuoti →</button>
        </div>`;
}

function _buildMileRow(q, gs) {
    const tc = _TIER_COLOR[q.tier] || 'var(--em-gold)';
    let prog = { cur: 0, tgt: 1 };
    try { prog = q.check(gs); } catch(e) {}
    const pct = Math.min(100, Math.round((prog.cur / Math.max(1, prog.tgt)) * 100));
    return `
        <div class="cm-mile-row">
            <div class="cm-mile-icon">${q.icon}</div>
            <div class="cm-mile-name">${q.title}</div>
            <div class="cm-mile-bar-bg"><div class="cm-mile-bar-fill" style="width:${pct}%;background:${tc}"></div></div>
            <div class="cm-mile-val">${prog.cur}/${prog.tgt}</div>
        </div>`;
}

function _buildRewardChips(r) {
    const chips = [];
    if (r.cash)       chips.push(`<span class="cm-chip gold">+€${r.cash.toLocaleString('it')}</span>`);
    if (r.vtk)        chips.push(`<span class="cm-chip vtk">+${r.vtk} VTK</span>`);
    if (r.tc)         chips.push(`<span class="cm-chip gold">+${r.tc} DC</span>`);
    if (r.rep)        chips.push(`<span class="cm-chip gold">+${r.rep}★</span>`);
    if (r.shadowCoin) chips.push(`<span style="font-size:9px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);color:var(--em-blue);border-radius:4px;padding:2px 6px">+${r.shadowCoin.toLocaleString('it')} SC</span>`);
    if (r.unlock)     chips.push(`<span style="font-size:9px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);color:var(--em-blue);border-radius:4px;padding:2px 6px">${r.unlock}</span>`);
    if (r.title)      chips.push(`<span style="font-size:9px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);color:var(--em-blue);border-radius:4px;padding:2px 6px">"${r.title}"</span>`);
    if (chips.length === 0 && r.desc) chips.push(`<span style="font-size:9px;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);color:var(--em-blue);border-radius:4px;padding:2px 6px">${r.desc}</span>`);
    return chips.join('');
}

/* ── Public API ─────────────────────────────────────────────── */
window.openCareerModal = function() {
    document.getElementById('career-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'career-modal-overlay';
    overlay.innerHTML = _buildCareerModal();

    // Close on backdrop click
    overlay.addEventListener('click', e => {
        if (e.target === overlay) window.closeCareerModal();
    });

    document.body.appendChild(overlay);

    // Escape key
    const onKey = e => { if (e.key === 'Escape') window.closeCareerModal(); };
    document.addEventListener('keydown', onKey);
    overlay._keyHandler = onKey;
};

window.closeCareerModal = function() {
    const overlay = document.getElementById('career-modal-overlay');
    if (!overlay) return;
    if (overlay._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
    overlay.remove();
    // Return to previous tab
    const prev = window._careerPrevTab;
    if (prev && prev !== 'career' && typeof window.switchTab === 'function') {
        window.switchTab(prev);
    }
};

window.renderTabCareer = function() {
    // Tab-container gets emptied — modal covers it
    const container = document.getElementById('tab-container');
    if (container) container.innerHTML = '';
    window.openCareerModal();
};

window.startMissionRun = function(questId) {
    const q = (window.QUEST_DB || []).find(x => x.id === questId);
    if (!q) return;
    if (q.bivio) {
        window._showBivioModal(q);
    } else {
        if (typeof window.completeMissionRun === 'function') window.completeMissionRun(questId);
        // Refresh modal if open
        if (document.getElementById('career-modal-overlay')) window.openCareerModal();
    }
};

window._showBivioModal = function(q) {
    document.getElementById('bivio-modal')?.remove();
    const optHtml = q.bivio.options.map(opt => `
        <button ${ceAct('_applyBivioChoice', [q.id,opt.id])}
                style="display:block;width:100%;text-align:left;padding:10px 12px;background:var(--em-card);border:1px solid var(--em-line);color:var(--em-ink);margin-top:8px;cursor:pointer;font-size:10px">
            <div style="font-weight:700;margin-bottom:2px">${opt.label}</div>
            <div style="font-size:9px;color:var(--em-muted)">${opt.desc}</div>
        </button>`).join('');

    const giverLine = q.giver
        ? `<div style="font-size:9px;color:var(--em-muted);margin-bottom:10px">${q.giver.name} · ${q.giver.faction}</div>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'bivio-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);padding:20px';
    modal.innerHTML = `
        <div style="background:var(--em-card);border:1px solid var(--em-line);border-top:2px solid var(--em-gold);padding:20px;max-width:360px;width:100%">
            <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:var(--em-gold);margin-bottom:6px">${q.icon} ${q.title}</div>
            ${giverLine}
            <div style="font-size:11px;color:var(--em-ink);font-weight:600;margin-bottom:4px">${q.bivio.prompt}</div>
            ${optHtml}
            <button ${ceAct('ceRemove', ['bivio-modal'])}
                    style="margin-top:14px;font-size:9px;color:var(--em-muted);background:none;border:none;cursor:pointer;width:100%;text-align:center">Annulla</button>
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
    if (document.getElementById('career-modal-overlay')) window.openCareerModal();
    if (typeof saveGame === 'function') saveGame();
};
