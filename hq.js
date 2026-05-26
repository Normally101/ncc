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
            gameState.reputation = Math.min(5.0, (gameState.reputation || 0) + delta);
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
    
    // Ensure initialized
    if (!gameState.hqs) window.hqInit();

    const currentCityId = gameState.currentHQCity || 'roma';
    const cityData = window.HQ_CITIES.find(c => c.id === currentCityId);
    
    let totalScore = 0;
    // Calculate total score across all cities
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

    // City Selector Tabs
    const cityTabsHtml = window.HQ_CITIES.map(c => `
        <button onclick="window.hqSwitchCity('${c.id}')" 
                class="px-3 py-1.5 rounded text-xs font-bold transition-all border ${c.id === currentCityId ? 'bg-gold text-black border-gold' : 'bg-[#1a1a2e] text-gray-400 border-white/10 hover:border-white/30'}">
            ${c.icon} ${c.name}
        </button>
    `).join('');

    // Room List for Current City
    const cityRooms = window.hqGetCityRooms(currentCityId);
    const availableRooms = window.HQ_ROOMS.filter(r => (!r.citySpecific || r.citySpecific.includes(currentCityId)));
    
    let roomListHtml = '';
    
    for (const r of availableRooms) {
        const currentLevel = cityRooms[r.id] || 0;
        const nextTier = r.tiers.find(t => t.level === currentLevel + 1);
        const isMaxLevel = !nextTier;
        
        const isLocked = currentLevel === 0 && !r.prereqs.every(p => window.hqHasRoomInCity(currentCityId, p));
        
        const tDef = currentLevel > 0 ? r.tiers.find(t => t.level === currentLevel) : null;
        
        roomListHtml += `
          <div class="bg-white/3 border ${isLocked ? 'border-white/5' : 'border-white/8'} rounded-xl p-3 mb-2 ${isLocked ? 'opacity-50' : ''}">
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <div class="text-sm font-bold ${isLocked ? 'text-gray-600' : 'text-white'}">${r.icon} ${r.name} <span class="text-xs text-gold ml-1">Lvl ${currentLevel}</span></div>
                <div class="text-[10px] text-gray-400 mt-0.5">${r.desc}</div>
                ${isLocked ? `<div class="text-[9px] text-gray-600 mt-1">🔒 Richiede: ${r.prereqs.map(p=>window.HQ_ROOMS.find(x=>x.id===p)?.name||p).join(', ')}</div>` : ''}
                ${!isMaxLevel && !isLocked ? `<div class="text-[9px] text-blue-400 mt-1">Prossimo Livello: Richiede ${nextTier.reqRep}⭐ reputazione.</div>` : ''}
              </div>
              <div class="shrink-0 ml-2 text-right">
                ${isMaxLevel ? `<div class="text-[10px] text-green-400 font-mono">Max Level</div>` : `
                    <div class="text-[10px] text-gold font-mono">€${nextTier.cost.toLocaleString()}</div>
                    ${!isLocked ? `<button onclick="${currentLevel === 0 ? `window.hqOpenBuildModal('${r.id}')` : `window.hqUpgradeRoom('${currentCityId}', '${r.id}')`}"
                      class="btn-gold !text-[9px] !py-1 !px-2 mt-1 ${(gameState.cash||0) < nextTier.cost || (gameState.reputation||0) < nextTier.reqRep ? 'opacity-40' : ''}">
                      ${currentLevel === 0 ? '🏗️ Costruisci' : '⬆️ Migliora'}
                    </button>` : ''}
                `}
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

    container.innerHTML = DS.header({
        eyebrow: 'Quartier Generale',
        title:   'HQ Base Builder',
        subtitle: `Score Globale ⭐ ${totalScore} · Sedi: ${Object.keys(gameState.hqs).length}`,
        actions: DS.pill('Score ' + totalScore, totalScore >= 50 ? 'gold' : 'blue'),
    }) + `
      <div class="flex gap-2 p-2 overflow-x-auto hide-scrollbar mb-2 border-b border-white/5">
        ${cityTabsHtml}
      </div>
      
      <div class="p-2 mb-2">
        <h2 class="text-gold font-bold">${cityData.icon} Sede di ${cityData.name}</h2>
        <p class="text-xs text-gray-400">${cityData.desc}</p>
      </div>
      ` + DS.kpiStrip([
        { label: 'Effetti Globali Attivi',   val: fxItems.length, color: fxItems.length > 0 ? 'blue' : '' },
    ]) + `
      <div class="p-1">

        <!-- Visual Isometric Campus -->
        <div id="hq-visual-placeholder" class="mb-4"></div>

        <!-- Active effects -->
        ${fxItems.length > 0 ? `
          <div class="bg-gold/5 border border-gold/20 rounded-lg p-3 mb-4">
            <div class="text-[9px] text-gold font-bold uppercase mb-2">⚡ Effetti Globali Attivi</div>
            <div class="flex flex-wrap gap-1">
              ${fxItems.map(f => `<span class="text-[8px] bg-white/10 rounded px-1.5 py-0.5 text-gray-300">${f}</span>`).join('')}
            </div>
          </div>` : ''}

        <!-- Build options -->
        <h3 class="text-[10px] text-gold uppercase tracking-widest mb-2">🏢 Gestione Strutture</h3>
        ${roomListHtml}
      </div>`;

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
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 w-80 max-w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <div class="text-sm font-bold text-white">🏗️ Scegli lo slot per ${window.HQ_ROOMS.find(r=>r.id===roomId).name}</div>
          <button onclick="document.getElementById('hq-build-modal').remove()" class="text-gray-500 hover:text-white text-lg">✕</button>
        </div>
        ${emptySlots.length === 0
            ? '<div class="text-[10px] text-gray-500 text-center py-4">Nessuno slot libero in questa città.</div>'
            : emptySlots.map(slot => `
              <div class="bg-white/3 border border-white/8 rounded-lg p-3 mb-2 flex justify-between items-center hover:bg-white/10 transition cursor-pointer"
                   onclick="document.getElementById('hq-build-modal').remove(); window.hqUpgradeRoom('${currentCityId}', '${roomId}', ${slot})">
                <div class="font-bold text-white text-sm">Slot #${slot}</div>
                <div class="text-gold text-[11px] font-mono">Posiziona qui</div>
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
