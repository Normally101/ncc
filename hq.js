'use strict';
/* ================================================================
   hq.js — Chauffeur Empire
   Espansione 6: Base Building HQ Multi-Città e Tiers
   ================================================================ */

// Grid layout: 5 columns × 3 rows
const HQ_GRID_COLS = 5;
const HQ_GRID_ROWS = 3;
const HQ_GRID_SIZE = HQ_GRID_COLS * HQ_GRID_ROWS;

// ── INIT & MIGRATION ──────────────────────────────────────────────────────────

window.hqInit = function() {
    // Migration from old state to new state
    if (!gameState.hqs) {
        gameState.hqs = {
            'roma': { rooms: {}, grid: {} }
        };
        // Migrate old rooms
        if (gameState.hqRooms) {
            for (const r of gameState.hqRooms) {
                gameState.hqs['roma'].rooms[r] = 1; // default to tier 1
            }
            if (gameState.hqGrid) {
                gameState.hqs['roma'].grid = gameState.hqGrid;
            } else {
                gameState.hqs['roma'].grid = { 0: 'garage_main' };
            }
            // Cleanup old state
            delete gameState.hqRooms;
            delete gameState.hqGrid;
        } else {
            // New game
            gameState.hqs['roma'].rooms['garage_main'] = 1;
            gameState.hqs['roma'].grid = { 0: 'garage_main' };
        }
    }
    
    // Ensure all cities exist
    for (const city of window.HQ_CITIES) {
        if (!gameState.hqs[city.id]) {
            gameState.hqs[city.id] = { rooms: {}, grid: {} };
        }
    }

    if (!gameState.currentHQCity) {
        gameState.currentHQCity = 'roma';
    }

    if (!gameState.driverObituaries) gameState.driverObituaries = [];
};

// ── STATE ACCESS ──────────────────────────────────────────────────────────────

window.hqGetCityRooms = function(cityId) {
    if (!gameState.hqs || !gameState.hqs[cityId]) return {};
    return gameState.hqs[cityId].rooms || {};
};

window.hqHasRoomInCity = function(cityId, roomId) {
    const r = window.hqGetCityRooms(cityId);
    return r[roomId] !== undefined && r[roomId] > 0;
};

window.hqGetRoomLevel = function(cityId, roomId) {
    const r = window.hqGetCityRooms(cityId);
    return r[roomId] || 0;
};

// Sum up all effects across all cities
window.hqAllEffects = function() {
    const fx = {};
    if (!gameState.hqs) return fx;
    
    for (const cityId of Object.keys(gameState.hqs)) {
        const rooms = gameState.hqs[cityId].rooms || {};
        for (const [roomId, level] of Object.entries(rooms)) {
            if (level > 0) {
                const roomDef = window.HQ_ROOMS.find(r => r.id === roomId);
                if (roomDef) {
                    const tierDef = roomDef.tiers.find(t => t.level === level);
                    if (tierDef && tierDef.effect) {
                        for (const [k, v] of Object.entries(tierDef.effect)) {
                            if (typeof v === 'number') {
                                if (k.endsWith('Mult')) fx[k] = (fx[k] || 1.0) * v;
                                else fx[k] = (fx[k] || 0) + v;
                            } else {
                                // For boolean flags like freeEVRecharge
                                fx[k] = v;
                            }
                        }
                    }
                }
            }
        }
    }
    return fx;
};

window.hqGetEffect = function(effectKey) {
    return window.hqAllEffects()[effectKey];
};

// ── ACTION: BUILD / UPGRADE ───────────────────────────────────────────────────

window.hqUpgradeRoom = async function(cityId, roomId, slotIndex) {
    const roomDef = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!roomDef) return;
    
    const currentLevel = window.hqGetRoomLevel(cityId, roomId);
    const nextTier = roomDef.tiers.find(t => t.level === currentLevel + 1);
    
    if (!nextTier) {
        if(typeof showNotification==='function') showNotification('Livello massimo raggiunto!', 'error');
        return;
    }

    // Check prerequisites if level 0
    if (currentLevel === 0) {
        for (const preq of roomDef.prereqs) {
            if (!window.hqHasRoomInCity(cityId, preq)) {
                if(typeof showNotification==='function') showNotification(`Richiede prima: ${window.HQ_ROOMS.find(r=>r.id===preq)?.name || preq} in questa città`, 'error');
                return;
            }
        }
        // Check city specific
        if (roomDef.citySpecific && !roomDef.citySpecific.includes(cityId)) {
            if(typeof showNotification==='function') showNotification(`Questa struttura può essere costruita solo a: ${roomDef.citySpecific.join(', ')}`, 'error');
            return;
        }
    }

    // Check grid slot if building new
    if (currentLevel === 0 && slotIndex !== undefined) {
        if (gameState.hqs[cityId].grid[slotIndex]) {
            if(typeof showNotification==='function') showNotification('Slot occupato!', 'error');
            return;
        }
    }

    // Check rep req
    if ((gameState.reputation || 0) < nextTier.reqRep) {
        if(typeof showNotification==='function') showNotification(`Reputazione insufficiente (serve ${nextTier.reqRep}⭐)`, 'error');
        return;
    }

    // Check cash
    if ((gameState.cash || 0) < nextTier.cost) {
        if(typeof showNotification==='function') showNotification(`Fondi insufficienti (serve €${nextTier.cost.toLocaleString()})`, 'error');
        return;
    }

    const actionName = currentLevel === 0 ? 'Costruire' : 'Migliorare';
    if (nextTier.cost > 0) {
        if (!confirm(`${actionName} ${roomDef.icon} ${roomDef.name} a Livello ${nextTier.level} per €${nextTier.cost.toLocaleString()}?`)) return;
        gameState.cash -= nextTier.cost;
    }

    gameState.hqs[cityId].rooms[roomId] = nextTier.level;
    if (currentLevel === 0 && slotIndex !== undefined) {
        gameState.hqs[cityId].grid[slotIndex] = roomId;
    }

    // Apply one-time permanent effects if any (from the delta)
    // Note: permanent effects like reputationBonus shouldn't be added every tick, they are permanent state changes.
    // In the new system, it's better to just calculate reputation dynamically or add it here.
    if (nextTier.effect.reputationBonus) {
        const prevBonus = currentLevel > 0 ? roomDef.tiers.find(t=>t.level===currentLevel).effect.reputationBonus || 0 : 0;
        const delta = nextTier.effect.reputationBonus - prevBonus;
        if (delta > 0) {
            gameState.reputation = Math.min(5.0 + (gameState.prestige || 0), (gameState.reputation || 0) + delta);
        }
    }

    if (typeof saveGame === 'function') saveGame();
    if (typeof updateUI === 'function') updateUI();

    if(typeof showNotification==='function') showNotification(`🏗️ ${roomDef.icon} ${roomDef.name} ${currentLevel===0 ? 'costruita' : 'migliorata'} al Livello ${nextTier.level}!`, 'success');
    window._hqJustBuiltRoom = roomId; 
    window.renderTabHQ();
};

window.hqSwitchCity = function(cityId) {
    gameState.currentHQCity = cityId;
    window.renderTabHQ();
};

// ── TAB RENDERER ──────────────────────────────────────────────────────────────

window.renderTabHQ = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    if (!gameState.hqs) window.hqInit();

    const currentCityId = gameState.currentHQCity || 'roma';
    const cityData = window.HQ_CITIES.find(c => c.id === currentCityId);

    let totalScore = 0;
    for (const cid of Object.keys(gameState.hqs)) {
        const rooms = gameState.hqs[cid].rooms || {};
        for (const [rId, lvl] of Object.entries(rooms)) {
            if (lvl > 0) {
                const rDef = window.HQ_ROOMS.find(r => r.id === rId);
                if (rDef) {
                    const tDef = rDef.tiers.find(t => t.level === lvl);
                    if (tDef) totalScore += tDef.score;
                }
            }
        }
    }

    const fx = window.hqAllEffects();

    const cityTabsHtml = window.HQ_CITIES.map(c => `
        <button ${ceAct('hqSwitchCity', [c.id])}
                class="${c.id === currentCityId ? 'em-goldbtn' : 'em-ghbtn'}"
                style="font-size:11px;white-space:nowrap">
            ${c.icon} ${c.name}
        </button>
    `).join('');

    const cityRooms    = window.hqGetCityRooms(currentCityId);
    const availableRooms = window.HQ_ROOMS.filter(r => (!r.citySpecific || r.citySpecific.includes(currentCityId)));

    let roomListHtml = '';
    for (const r of availableRooms) {
        const currentLevel    = cityRooms[r.id] || 0;
        const nextTier        = r.tiers.find(t => t.level === currentLevel + 1);
        const isMaxLevel      = !nextTier;
        const isLocked        = currentLevel === 0 && !r.prereqs.every(p => window.hqHasRoomInCity(currentCityId, p));
        const canAffordUpgrade = nextTier && (gameState.cash||0) >= nextTier.cost && (gameState.reputation||0) >= nextTier.reqRep;

        roomListHtml += `
          <div class="em-card" style="padding:12px;margin-bottom:8px;${isLocked ? 'opacity:.5' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1">
                <div style="font-size:12px;font-weight:700;margin-bottom:2px">${r.icon} ${r.name} <span class="em-pill em-pill--${currentLevel > 0 ? 'gold' : 'gray'}" style="font-size:8px">Lv ${currentLevel}</span></div>
                <div style="font-size:10px;color:var(--em-muted)">${r.desc}</div>
                ${isLocked ? `<div style="font-size:9px;color:var(--em-muted);margin-top:4px">🔒 Richiede: ${r.prereqs.map(p=>window.HQ_ROOMS.find(x=>x.id===p)?.name||p).join(', ')}</div>` : ''}
                ${!isMaxLevel && !isLocked ? `<div style="font-size:9px;color:var(--em-blue);margin-top:4px">Prossimo Livello: Richiede ${nextTier.reqRep}⭐ reputazione.</div>` : ''}
              </div>
              <div style="flex-shrink:0;margin-left:8px;text-align:right">
                ${isMaxLevel
                    ? `<span class="em-pill em-pill--green" style="font-size:8px">Max</span>`
                    : `<div style="font-size:10px;color:var(--em-gold);font-family:monospace;margin-bottom:4px">€${nextTier.cost.toLocaleString()}</div>
                       ${!isLocked ? `<button class="em-goldbtn" ${currentLevel === 0 ? ceAct('_hqBuildFromList', [r.id]) : ceAct('hqUpgradeRoom', [currentCityId, r.id])}
                         style="font-size:9px;${!canAffordUpgrade ? 'opacity:.4;cursor:not-allowed' : ''}">
                         ${currentLevel === 0 ? '🏗️ Costruisci' : '⬆️ Migliora'}
                       </button>` : ''}`}
              </div>
            </div>
          </div>`;
    }

    const _hqFxLabel = (k, v) => {
        if (typeof v !== 'number') return (k === 'freeEVRecharge' && v) ? 'Ricarica EV gratuita' : (k === 'unlocksWaterTaxis' && v ? 'Water Taxi Sbloccati' : null);
        switch (k) {
            case 'extraVehicleSlots':          return `+${v} slot veicoli`;
            case 'dailyMoraleBonus':           return `+${v}% morale/giorno`;
            case 'driverXpMult':               return `×${v.toFixed(2)} XP autisti`;
            case 'autoRepairDaily':            return `+${v} riparazione auto/giorno`;
            case 'salaryCostMult':             return `×${v.toFixed(2)} costo salari`;
            case 'vipRideBonus':               return `+${Math.round(v*100)}% corse VIP`;
            case 'burnoutReduction':           return `−${Math.round(v*100)}% burnout`;
            case 'tipMult':                    return `×${v.toFixed(2)} mance`;
            case 'waterTaxiTipMult':           return `×${v.toFixed(2)} mance Water Taxi`;
            case 'helicopterRideGateOverride': return `Elicottero sbloccato a ${v} corse`;
            case 'upgradeDiscountMult':        return `×${v.toFixed(2)} upgrade`;
            case 'allEarningsMult':            return `×${v.toFixed(2)} tutti i redditi`;
            case 'evRangeBonus':               return `×${v.toFixed(2)} autonomia EV`;
            default:                           return null;
        }
    };

    const fxItems = Object.entries(fx)
        .filter(([k]) => !['reputationBonus', 'shadowDefenseBonus'].includes(k))
        .map(([k, v]) => _hqFxLabel(k, v))
        .filter(Boolean);

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line);display:flex;align-items:flex-start;justify-content:space-between">
            <div>
                <div class="em-sec" style="margin-bottom:4px">Quartier Generale</div>
                <div style="font-size:20px;font-weight:800;margin-bottom:2px">HQ Base Builder</div>
                <div style="font-size:11px;color:var(--em-muted)">Score Globale ⭐ ${totalScore} · Sedi: ${Object.keys(gameState.hqs).length}</div>
            </div>
            <span class="em-pill ${totalScore >= 50 ? 'em-pill--gold' : 'em-pill--blue'}">Score ${totalScore}</span>
        </div>

        <div style="display:flex;gap:6px;padding:8px 0;overflow-x:auto;margin-bottom:12px;border-bottom:1px solid var(--em-line)">
            ${cityTabsHtml}
        </div>

        <div style="padding:6px 0;margin-bottom:10px">
            <div style="font-size:14px;font-weight:700;color:var(--em-gold)">${cityData.icon} Sede di ${cityData.name}</div>
            <div style="font-size:10px;color:var(--em-muted);margin-top:2px">${cityData.desc}</div>
        </div>

        <div id="hq-visual-placeholder" style="margin-bottom:16px"></div>

        ${fxItems.length > 0 ? `
          <div class="em-card" style="padding:12px;margin-bottom:16px;border-color:rgba(199,154,42,.3)">
            <div class="em-sec" style="color:var(--em-gold);margin-bottom:8px">⚡ Effetti Globali Attivi</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${fxItems.map(f => `<span class="em-pill em-pill--gray" style="font-size:9px">${f}</span>`).join('')}
            </div>
          </div>` : ''}

        <div class="em-sec" style="margin-bottom:10px;color:var(--em-gold)">🏢 Gestione Strutture</div>
        ${roomListHtml}
    </div></div>`;

    // Render visual diorama campus
    if (typeof window.renderHQCampus === 'function') {
        window.renderHQCampus();
    }
};

window.hqOpenBuildModal = function(roomId) {
    const currentCityId = gameState.currentHQCity || 'roma';
    const grid = gameState.hqs[currentCityId].grid || {};
    
    // Find empty slots
    const emptySlots = [];
    for (let i = 0; i < HQ_GRID_SIZE; i++) {
        if (!grid[i]) emptySlots.push(i);
    }

    const existing = document.getElementById('hq-build-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'hq-build-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid #21262d;border-radius:6px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;box-shadow:0 20px 60px rgba(0,0,0,0.8);max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#e6edf3">🏗️ Scegli lo slot per ${window.HQ_ROOMS.find(r=>r.id===roomId).name}</div>
          <button ${ceAct('ceRemove', ['hq-build-modal'])} style="color:#6b7280;background:none;border:none;font-size:18px;cursor:pointer;padding:0;line-height:1">✕</button>
        </div>
        ${emptySlots.length === 0
            ? '<div style="font-size:10px;color:#6b7280;text-align:center;padding:16px 0">Nessuno slot libero in questa città.</div>'
            : emptySlots.map(slot => `
              <div style="background:rgba(255,255,255,0.03);border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;cursor:pointer"
                   ${ceAct('ceHqBuildConfirm', ['hq-build-modal', currentCityId, roomId, slot])}>
                <div style="font-weight:700;color:#e6edf3;font-size:12px">Slot #${slot}</div>
                <div style="color:#c79a2a;font-size:11px;font-family:monospace">Posiziona qui</div>
              </div>`).join('')}
      </div>`;
    document.body.appendChild(modal);
};

// ── DAILY EFFECTS IN ENGINE ────────────────────────────────────────────────────
// Called from processDailyRoutines via window._hqDailyTick

window._hqDailyTick = function() {
    const fx = window.hqAllEffects();

    // Auto-repair veicoli sotto threshold
    if (fx.autoRepairDaily && fx.autoRepairThreshold !== undefined) {
        for (const car of (gameState.fleet || [])) {
            if ((car.condition || 0) < fx.autoRepairThreshold) {
                car.condition = Math.min(100, (car.condition || 0) + fx.autoRepairDaily);
            }
        }
    }

    // Morale boost autisti
    if (fx.dailyMoraleBonus) {
        for (const d of (gameState.drivers || [])) {
            d.morale = Math.min(100, (d.morale || 100) + fx.dailyMoraleBonus);
        }
    }

    // EV free recharge
    if (fx.freeEVRecharge) {
        for (const car of (gameState.fleet || [])) {
            if (typeof _isElectric === 'function' && _isElectric(car)) {
                car.fuel = 100;
            }
        }
    }

    // Helipad: override helicopter rideGate
    if (fx.helicopterRideGateOverride !== undefined) {
        window._hqHelicopterRideGateOverride = fx.helicopterRideGateOverride;
    }
};

window._hqBuildFromList = function(roomId) {
    const cityId = gameState.currentHQCity || 'roma';
    const cityConfig = (window.HQ_CITIES || []).find(c => c.id === cityId);
    if (!cityConfig) return;
    const grid = (gameState.hqs[cityId] || {}).grid || {};
    const freeSlot = cityConfig.slots.find(s => !grid[s.id]);
    const slotIndex = freeSlot ? freeSlot.id : undefined;
    window.hqUpgradeRoom(cityId, roomId, slotIndex);
};
