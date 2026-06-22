'use strict';
/* ================================================================
   driver_skills.js — Chauffeur Empire
   Espansione 2: Alberi delle Abilità Autisti (RPG + Permadeath)
   ================================================================ */

// ── SKILL TREE DEFINITION ─────────────────────────────────────────────────────

window.DRIVER_SKILL_TREE = {
    velocista: {
        label: '🏎️ Velocista',
        desc:  'Velocità e adrenalina — più XP, meno fatica, più rischio.',
        color: '#db5746',
        border: 'rgba(248,81,73,0.35)',
        skills: [
            {
                id: 'vel_1', name: 'Guida Sportiva', cost: 1,
                desc: '+15% XP per ogni corsa completata.',
                effect: { xpMult: 1.15 },
                requires: [],
            },
            {
                id: 'vel_2', name: 'Scorciatoia', cost: 1,
                desc: '−20% fatica accumulata per corsa.',
                effect: { fatigueMult: 0.80 },
                requires: ['vel_1'],
            },
            {
                id: 'vel_3', name: 'Adrenalina', cost: 2,
                desc: '+25% guadagno su corse express. Aumenta lievemente rischio incidente (+3%).',
                effect: { expressMult: 1.25, accidentDelta: 0.003 },
                requires: ['vel_2'],
            },
        ],
    },
    diplomatico: {
        label: '💎 Diplomatico',
        desc:  'Charme e networking — mance più alte, corse VIP prioritarie.',
        color: '#7c5fc9',
        border: 'rgba(192,132,252,0.35)',
        skills: [
            {
                id: 'dip_1', name: 'Sorriso di Platino', cost: 1,
                desc: '+15% mance su tutte le corse.',
                effect: { tipMult: 1.15 },
                requires: [],
            },
            {
                id: 'dip_2', name: 'Rete VIP', cost: 1,
                desc: '+20% probabilità di ricevere corse VIP/Ultra assegnate.',
                effect: { vipPriority: true },
                requires: ['dip_1'],
            },
            {
                id: 'dip_3', name: 'Ambasciatore', cost: 2,
                desc: 'Ogni corsa VIP completata aggiunge +0.01 reputazione aziendale.',
                effect: { vipRepGain: 0.01 },
                requires: ['dip_2'],
            },
        ],
    },
    tecnico: {
        label: '⚙️ Tecnico',
        desc:  'Efficienza e manutenzione — meno consumo, meno degrado veicolo.',
        color: '#1aa06a',
        border: 'rgba(63,185,80,0.35)',
        skills: [
            {
                id: 'tec_1', name: 'Guida Eco', cost: 1,
                desc: '−20% consumo carburante per corsa.',
                effect: { fuelMult: 0.80 },
                requires: [],
            },
            {
                id: 'tec_2', name: 'Manutenzione Preventiva', cost: 1,
                desc: '−25% degrado condizione veicolo per corsa.',
                effect: { wearMult: 0.75 },
                requires: ['tec_1'],
            },
            {
                id: 'tec_3', name: 'Maestro Meccanico', cost: 2,
                desc: 'Dopo ogni corsa, se la condizione auto è < 30, recupera +5 punti auto.',
                effect: { autoRepair: 5, autoRepairThreshold: 30 },
                requires: ['tec_2'],
            },
        ],
    },
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

window.driverSkillTree = function(driver) {
    if (!driver.skill_tree) driver.skill_tree = { branch: null, unlocked: [], skill_points: 0 };
    return driver.skill_tree;
};

window.driverHasSkill = function(driver, skillId) {
    return (driver.skill_tree?.unlocked || []).includes(skillId);
};

window.driverSkillEffect = function(driver, effectKey) {
    const tree = driver.skill_tree;
    if (!tree?.branch || !tree.unlocked?.length) return null;

    const branch = window.DRIVER_SKILL_TREE[tree.branch];
    if (!branch) return null;

    for (const skill of branch.skills) {
        if (tree.unlocked.includes(skill.id) && effectKey in skill.effect) {
            return skill.effect[effectKey];
        }
    }
    return null;
};

// Collect ALL effects for a driver (all unlocked skills)
window.driverAllEffects = function(driver) {
    const tree = driver.skill_tree;
    const effects = {};
    if (!tree?.branch || !tree.unlocked?.length) return effects;

    const branch = window.DRIVER_SKILL_TREE[tree.branch];
    if (!branch) return effects;

    for (const skill of branch.skills) {
        if (tree.unlocked.includes(skill.id)) {
            Object.assign(effects, skill.effect);
        }
    }
    return effects;
};

// Award skill point on level up (called from engine.js _checkDriverLevel)
window.driverAwardSkillPoint = function(driver) {
    const st = window.driverSkillTree(driver);
    st.skill_points = (st.skill_points || 0) + 1;
};

// ── ACTIONS ───────────────────────────────────────────────────────────────────

window.driverSelectBranch = function(driverId, branch) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    const st = window.driverSkillTree(driver);
    if (st.branch) {
        if (typeof showNotification === 'function')
            showNotification('Hai già scelto un ramo. Non puoi cambiarlo.', 'error');
        return;
    }
    if (!window.DRIVER_SKILL_TREE[branch]) return;
    st.branch = branch;
    if (typeof saveGame === 'function') saveGame();
    if (typeof showNotification === 'function')
        showNotification(`✅ ${driver.name} segue il percorso ${window.DRIVER_SKILL_TREE[branch].label}!`, 'success');
    window.renderDriverSkillModal(driverId);
};

window.driverUnlockSkill = function(driverId, skillId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    const st = window.driverSkillTree(driver);
    const branch = window.DRIVER_SKILL_TREE[st.branch];
    if (!branch) { if (typeof showNotification === 'function') showNotification('Scegli prima un ramo!', 'error'); return; }

    const skill = branch.skills.find(s => s.id === skillId);
    if (!skill) return;

    // Already unlocked
    if (st.unlocked.includes(skillId)) {
        if (typeof showNotification === 'function') showNotification('Abilità già sbloccata.', 'error');
        return;
    }

    // Check requirements
    for (const req of skill.requires) {
        if (!st.unlocked.includes(req)) {
            if (typeof showNotification === 'function') showNotification('Prerequisiti non soddisfatti.', 'error');
            return;
        }
    }

    // Check skill points
    if ((st.skill_points || 0) < skill.cost) {
        if (typeof showNotification === 'function') showNotification(`Punti abilità insufficienti (serve ${skill.cost}).`, 'error');
        return;
    }

    st.skill_points -= skill.cost;
    st.unlocked.push(skillId);
    if (typeof saveGame === 'function') saveGame();
    if (typeof showNotification === 'function') showNotification(`⭐ ${driver.name}: "${skill.name}" sbloccata!`, 'success');
    window.renderDriverSkillModal(driverId);
};

// ── PERMADEATH ────────────────────────────────────────────────────────────────

window.driverPermadeathRoll = function(driver, car) {
    // Base 2% chance on accident; increased by bad car condition and Adrenalina skill
    let chance = 0.02;
    if ((car?.condition || 100) < 20) chance = 0.06;
    if (window.driverHasSkill(driver, 'vel_3')) chance += 0.03;

    if (Math.random() >= chance) return false;

    // Permadeath triggered
    driver.dead = true;
    driver.status = 'dead';
    if (typeof logToMap === 'function')
        logToMap(`🪦 TRAGEDIA: ${driver.name} non è sopravvissuto all'incidente. Riposa in pace.`);
    if (typeof showBigEvent === 'function')
        showBigEvent('🪦', `${driver.name} — In Memoriam`, `Un incidente grave ha stroncato la carriera di ${driver.name}. Le sue abilità e la sua storia sono perdute per sempre. Assumine un altro e ricomincia.`);

    // Remove after a moment so the player can see the event
    setTimeout(() => {
        const idx = gameState.drivers.findIndex(d => d.id === driver.id);
        if (idx > -1) {
            // Keep a small obituary in gameState for display
            if (!gameState.driverObituaries) gameState.driverObituaries = [];
            gameState.driverObituaries.push({
                name: driver.name,
                level: driver.level || 0,
                xp: driver.xp || 0,
                branch: driver.skill_tree?.branch || null,
                skills: driver.skill_tree?.unlocked || [],
                day: (typeof gameState !== 'undefined' ? gameState.day : 0),
            });
            if (gameState.driverObituaries.length > 10) gameState.driverObituaries.shift();
            gameState.drivers.splice(idx, 1);
        }
        if (typeof saveGame === 'function') saveGame();
    }, 5000);

    return true;
};

// ── MODAL RENDERER ────────────────────────────────────────────────────────────

window.renderDriverSkillModal = function(driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;

    const existing = document.getElementById('driver-skill-modal');
    if (existing) existing.remove();

    const st = window.driverSkillTree(driver);
    const lvlData = (typeof DRIVER_LEVELS !== 'undefined' ? DRIVER_LEVELS : [])[driver.level || 0] || {};

    let bodyHtml = '';

    // Branch selection
    if (!st.branch) {
        bodyHtml = `
          <div style="font-size:10px;color:#6b7280;margin-bottom:12px;text-align:center">Scegli il percorso di specializzazione di ${driver.name}.<br>La scelta è permanente.</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${Object.entries(window.DRIVER_SKILL_TREE).map(([key, b]) => `
              <button ${ceAct('driverSelectBranch', [driverId,key])}
                style="width:100%;text-align:left;background:#21262d;border:1px solid ${b.border};border-radius:6px;padding:12px;cursor:pointer;transition:background .15s">
                <div style="font-weight:700;color:${b.color};font-size:13px">${b.label}</div>
                <div style="font-size:10px;color:#6b7280;margin-top:2px">${b.desc}</div>
              </button>`).join('')}
          </div>`;
    } else {
        const branch = window.DRIVER_SKILL_TREE[st.branch];
        bodyHtml = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-weight:700;color:${branch.color};font-size:13px">${branch.label}</div>
            <div style="font-size:10px;background:#21262d;border-radius:4px;padding:3px 8px;color:#e6edf3">${st.skill_points || 0} punti disponibili</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${branch.skills.map(skill => {
                const isUnlocked = st.unlocked.includes(skill.id);
                const reqsMet = skill.requires.every(r => st.unlocked.includes(r));
                const canAfford = (st.skill_points || 0) >= skill.cost;
                const canUnlock = !isUnlocked && reqsMet && canAfford;
                const locked = !isUnlocked && !reqsMet;
                const borderC = isUnlocked ? 'rgba(212,175,55,0.35)' : locked ? '#eef1f5' : branch.border;
                const titleC  = isUnlocked ? '#c79a2a' : locked ? '#6a7480' : '#1f2733';

                return `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid ${borderC};border-radius:6px;padding:12px">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                      <div>
                        <div style="font-size:13px;font-weight:600;color:${titleC}">${isUnlocked ? '✅ ' : locked ? '🔒 ' : ''}${skill.name}</div>
                        <div style="font-size:10px;color:#6b7280;margin-top:2px">${skill.desc}</div>
                        ${skill.requires.length > 0 ? `<div style="font-size:9px;color:#6b7280;margin-top:4px">Richiede: ${skill.requires.join(', ')}</div>` : ''}
                      </div>
                      <div style="flex-shrink:0;margin-left:8px">
                        ${isUnlocked
                            ? `<span style="font-size:9px;color:#c79a2a">Sbloccata</span>`
                            : `<button ${ceAct('driverUnlockSkill', [driverId,skill.id])}
                                ${canUnlock ? '' : 'disabled'}
                                style="padding:4px 8px;font-size:9px;border-radius:4px;cursor:${canUnlock?'pointer':'not-allowed'};background:${canUnlock?'#fff8e8':'#6a7480'};border:1px solid ${canUnlock?'#c79a2a':'transparent'};color:${canUnlock?'#c79a2a':'#6a7480'};transition:opacity .15s">
                                ${skill.cost}pt
                              </button>`
                        }
                      </div>
                    </div>
                  </div>`;
            }).join('')}
          </div>

          ${(gameState.driverObituaries?.length > 0) ? `
          <div style="margin-top:16px;border-top:1px solid #eef1f5;padding-top:12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">🪦 In Memoriam</div>
            ${(gameState.driverObituaries || []).map(o => `
              <div style="font-size:9px;color:#6b7280">Day ${o.day}: ${o.name} — Lv.${o.level} ${o.branch ? '(' + o.branch + ')' : ''}</div>
            `).join('')}
          </div>` : ''}`;
    }

    const modal = document.createElement('div');
    modal.id = 'driver-skill-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#e6edf3">${driver.name}</div>
            <div style="font-size:10px;color:#6b7280">Lv.${driver.level || 0} ${lvlData.name || 'Rookie'} · ${driver.xp || 0} XP</div>
          </div>
          <button ${ceAct('ceRemove', ['driver-skill-modal'])} style="background:transparent;border:none;color:#6b7280;font-size:16px;cursor:pointer;padding:0;line-height:1">✕</button>
        </div>
        ${bodyHtml}
      </div>`;
    document.body.appendChild(modal);
};

window.driverSkillsInit = function() {
    // Migrate existing drivers to include skill_tree
    if (typeof gameState !== 'undefined' && gameState.drivers) {
        for (const d of gameState.drivers) {
            if (!d.skill_tree) d.skill_tree = { branch: null, unlocked: [], skill_points: 0 };
            if (d.driverObituaries === undefined) { /* not on driver, on gameState */ }
        }
        if (!gameState.driverObituaries) gameState.driverObituaries = [];
    }
};
