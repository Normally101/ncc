'use strict';
/* ================================================================
   hq.js — Chauffeur Empire
   Espansione 6: Base Building HQ (diorama isometrico semplificato)
   ================================================================ */

// ── ROOM DEFINITIONS ──────────────────────────────────────────────────────────

window.HQ_ROOMS = [
    {
        id: 'garage_main', name: 'Garage Principale', icon: '🏠',
        cost: 0, prereqs: [], permanent: true,
        desc: 'Struttura base. Ospita 2 veicoli extra.',
        effect: { extraVehicleSlots: 2 },
        score: 5,
    },
    {
        id: 'gym', name: 'Palestra Autisti', icon: '🏋️',
        cost: 120000, prereqs: ['garage_main'],
        desc: '+5% morale autisti al giorno.',
        effect: { dailyMoraleBonus: 5 },
        score: 10,
    },
    {
        id: 'mission_room', name: 'Sala Missioni', icon: '🎯',
        cost: 200000, prereqs: ['garage_main'],
        desc: '+15% XP guadagnato da tutti gli autisti.',
        effect: { driverXpMult: 1.15 },
        score: 15,
    },
    {
        id: 'workshop', name: 'Officina HQ', icon: '🔧',
        cost: 180000, prereqs: ['garage_main'],
        desc: 'Ripara automaticamente i veicoli sotto il 20% di condizione (+10/giorno).',
        effect: { autoRepairThreshold: 20, autoRepairDaily: 10 },
        score: 12,
    },
    {
        id: 'canteen', name: 'Mensa', icon: '🍕',
        cost: 90000, prereqs: ['gym'],
        desc: '−10% costo salari mensili autisti.',
        effect: { salaryCostMult: 0.90 },
        score: 8,
    },
    {
        id: 'control_tower', name: 'Torre di Controllo', icon: '📡',
        cost: 350000, prereqs: ['mission_room'],
        desc: '+20% probabilità corse VIP/Ultra.',
        effect: { vipRideBonus: 0.20 },
        score: 20,
    },
    {
        id: 'security_bunker', name: 'Bunker Sicurezza', icon: '🛡️',
        cost: 500000, prereqs: ['control_tower'],
        desc: '+2 livelli difesa shadow ops automaticamente.',
        effect: { shadowDefenseBonus: 2 },
        score: 25,
    },
    {
        id: 'infirmary', name: 'Infermeria', icon: '💊',
        cost: 150000, prereqs: ['canteen'],
        desc: '−30% durata burnout autisti.',
        effect: { burnoutReduction: 0.30 },
        score: 12,
    },
    {
        id: 'it_center', name: 'Centro IT', icon: '💻',
        cost: 280000, prereqs: ['mission_room'],
        desc: '+5% mance su tutte le corse.',
        effect: { tipMult: 1.05 },
        score: 18,
    },
    {
        id: 'ev_parking', name: 'Parcheggio EV', icon: '🔋',
        cost: 200000, prereqs: ['workshop'],
        desc: 'Ricarica automatica veicoli elettrici a costo zero.',
        effect: { freeEVRecharge: true },
        score: 15,
    },
    {
        id: 'helipad', name: 'Pista Elicotteri', icon: '🛫',
        cost: 2000000, prereqs: ['control_tower'],
        desc: 'Sblocca gli elicotteri dal rideGate 2000 → 500.',
        effect: { helicopterRideGateOverride: 500 },
        score: 30,
    },
    {
        id: 'rd_lab', name: 'Laboratorio R&D', icon: '🔬',
        cost: 800000, prereqs: ['it_center'],
        desc: '−10% costo upgrade veicoli.',
        effect: { upgradeDiscountMult: 0.90 },
        score: 22,
    },
    {
        id: 'vip_lounge', name: 'VIP Lounge', icon: '🥂',
        cost: 400000, prereqs: ['control_tower', 'canteen'],
        desc: '+0.2 reputazione aziendale permanente.',
        effect: { reputationBonus: 0.2 },
        score: 20,
    },
    {
        id: 'crypto_vault', name: 'Crypto Vault', icon: '🔐',
        cost: 1000000, prereqs: ['security_bunker'],
        desc: 'Riduce il rischio sequestro GdF per prelievi offshore del 30%.',
        effect: { offshoreSiezeReduction: 0.30 },
        score: 28,
    },
    {
        id: 'penthouse', name: 'Penthouse CEO', icon: '🏙️',
        cost: 5000000, prereqs: ['vip_lounge', 'rd_lab'],
        desc: '+25% su tutti i moltiplicatori di reddito. Il massimo del lusso.',
        effect: { allEarningsMult: 1.25 },
        score: 50,
    },
];

// Grid layout: 5 columns × 3 rows
const HQ_GRID_COLS = 5;
const HQ_GRID_ROWS = 3;
const HQ_GRID_SIZE = HQ_GRID_COLS * HQ_GRID_ROWS;

// ── STATE ACCESS ──────────────────────────────────────────────────────────────

function _hqRooms() {
    if (!gameState.hqRooms) gameState.hqRooms = ['garage_main']; // start with main garage
    return gameState.hqRooms;
}

window.hqHasRoom = function(roomId) {
    return _hqRooms().includes(roomId);
};

window.hqGetEffect = function(effectKey) {
    const rooms = _hqRooms();
    let result = null;
    for (const room of window.HQ_ROOMS) {
        if (rooms.includes(room.id) && effectKey in room.effect) {
            const val = room.effect[effectKey];
            if (typeof val === 'number') {
                result = result === null ? val : (effectKey.endsWith('Mult') ? result * val : result + val);
            } else {
                result = val;
            }
        }
    }
    return result;
};

// Combined all active effects
window.hqAllEffects = function() {
    const rooms = _hqRooms();
    const fx = {};
    for (const room of window.HQ_ROOMS) {
        if (rooms.includes(room.id)) {
            for (const [k, v] of Object.entries(room.effect)) {
                if (typeof v === 'number') {
                    if (k.endsWith('Mult')) fx[k] = (fx[k] || 1.0) * v;
                    else fx[k] = (fx[k] || 0) + v;
                } else {
                    fx[k] = v;
                }
            }
        }
    }
    return fx;
};

// ── BUILD ACTION ──────────────────────────────────────────────────────────────

window.hqBuildRoom = async function(roomId, slotIndex) {
    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!room) return;
    if (window.hqHasRoom(roomId)) { if(typeof showNotification==='function') showNotification('Stanza già costruita!', 'error'); return; }

    // Check prerequisites
    for (const preq of room.prereqs) {
        if (!window.hqHasRoom(preq)) {
            if(typeof showNotification==='function') showNotification(`Richiede prima: ${window.HQ_ROOMS.find(r=>r.id===preq)?.name || preq}`, 'error');
            return;
        }
    }

    // Check grid slot
    if (!gameState.hqGrid) gameState.hqGrid = {};
    if (slotIndex !== undefined && gameState.hqGrid[slotIndex]) {
        if(typeof showNotification==='function') showNotification('Slot occupato!', 'error');
        return;
    }

    // Check cash
    if ((gameState.cash || 0) < room.cost) {
        if(typeof showNotification==='function') showNotification(`Fondi insufficienti (serve €${room.cost.toLocaleString()})`, 'error');
        return;
    }

    if (room.cost > 0) {
        if (!confirm(`Costruire ${room.icon} ${room.name} per €${room.cost.toLocaleString()}?`)) return;
        gameState.cash -= room.cost;
    }

    _hqRooms().push(roomId);
    if (slotIndex !== undefined) gameState.hqGrid[slotIndex] = roomId;

    // Apply one-time permanent effects
    const fx = room.effect;
    if (fx.reputationBonus) {
        gameState.reputation = Math.min(5.0, (gameState.reputation || 0) + fx.reputationBonus);
    }
    if (fx.shadowDefenseBonus) {
        gameState._shadowDefenseLevel = Math.min(5, (gameState._shadowDefenseLevel || 0) + fx.shadowDefenseBonus);
    }

    if (typeof saveGameState === 'function') saveGameState();
    if (typeof updateUI === 'function') updateUI();

    // Update leaderboard
    const sb = window.supabase;
    if (sb) {
        const score = _hqRooms().reduce((s, id) => s + (window.HQ_ROOMS.find(r=>r.id===id)?.score || 0), 0);
        sb.rpc('rpc_update_hq_status', {
            v_rooms_built: _hqRooms().length,
            v_hq_score:    score,
        }).catch(() => {});
    }

    if(typeof showNotification==='function') showNotification(`🏗️ ${room.icon} ${room.name} costruita!`, 'success');
    if(typeof logToMap==='function') logToMap(`🏗️ HQ: costruita ${room.name}. Effetto: ${room.desc}`);
    window.renderTabHQ();
};

// ── TAB RENDERER ──────────────────────────────────────────────────────────────

window.renderTabHQ = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const builtRooms = _hqRooms();
    if (!gameState.hqGrid) gameState.hqGrid = { 7: 'garage_main' }; // center slot

    const totalScore = builtRooms.reduce((s, id) => s + (window.HQ_ROOMS.find(r=>r.id===id)?.score || 0), 0);
    const fx = window.hqAllEffects();

    // Grid visualization
    const gridHtml = Array.from({ length: HQ_GRID_SIZE }, (_, i) => {
        const roomId = gameState.hqGrid[i];
        const room   = roomId ? window.HQ_ROOMS.find(r => r.id === roomId) : null;
        return room
            ? `<div class="hq-tile hq-tile-built" title="${room.name}: ${room.desc}">
                 <div class="text-xl">${room.icon}</div>
                 <div class="text-[7px] text-center leading-tight text-gray-300 mt-0.5">${room.name.split(' ')[0]}</div>
               </div>`
            : `<div class="hq-tile hq-tile-empty" onclick="window.hqOpenBuildModal(${i})" title="Slot vuoto — clicca per costruire">
                 <div class="text-gray-700 text-lg">+</div>
               </div>`;
    }).join('');

    // Available rooms
    const availableRooms = window.HQ_ROOMS.filter(r => !builtRooms.includes(r.id));
    const unlockedRooms  = availableRooms.filter(r => r.prereqs.every(p => builtRooms.includes(p)));
    const lockedRooms    = availableRooms.filter(r => !r.prereqs.every(p => builtRooms.includes(p)));

    const roomListHtml = (rooms, locked) => rooms.map(r => `
      <div class="bg-white/3 border ${locked ? 'border-white/5' : 'border-white/8'} rounded-xl p-3 mb-2 ${locked ? 'opacity-50' : ''}">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="text-sm font-bold ${locked ? 'text-gray-600' : 'text-white'}">${r.icon} ${r.name}</div>
            <div class="text-[10px] text-gray-400 mt-0.5">${r.desc}</div>
            ${locked ? `<div class="text-[9px] text-gray-600 mt-1">🔒 Richiede: ${r.prereqs.map(p=>window.HQ_ROOMS.find(x=>x.id===p)?.name||p).join(', ')}</div>` : ''}
          </div>
          <div class="shrink-0 ml-2 text-right">
            <div class="text-[10px] text-gold font-mono">€${r.cost.toLocaleString()}</div>
            ${!locked ? `<button onclick="window.hqBuildRoom('${r.id}')"
              class="btn-gold !text-[9px] !py-1 !px-2 mt-1 ${(gameState.cash||0) < r.cost ? 'opacity-40' : ''}">
              🏗️ Costruisci
            </button>` : ''}
          </div>
        </div>
      </div>`).join('');

    // Active effects summary
    const fxItems = Object.entries(fx)
        .filter(([k]) => !['reputationBonus', 'shadowDefenseBonus'].includes(k))
        .map(([k, v]) => {
            const labels = {
                extraVehicleSlots: `+${v} slot veicoli`,
                dailyMoraleBonus: `+${v}% morale/giorno`,
                driverXpMult: `×${v.toFixed(2)} XP autisti`,
                autoRepairDaily: `+${v} riparazione auto/giorno`,
                salaryCostMult: `×${v.toFixed(2)} costo salari`,
                vipRideBonus: `+${Math.round(v*100)}% corse VIP`,
                burnoutReduction: `−${Math.round(v*100)}% burnout`,
                tipMult: `×${v.toFixed(2)} mance`,
                freeEVRecharge: v ? 'Ricarica EV gratuita' : null,
                helicopterRideGateOverride: `Elicottero sbloccato a ${v} corse`,
                upgradeDiscountMult: `×${v.toFixed(2)} upgrade`,
                allEarningsMult: `×${v.toFixed(2)} tutti i redditi`,
            };
            return labels[k] || null;
        }).filter(Boolean);

    container.innerHTML = `
      <div class="p-1">
        <div class="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
          <h3 class="text-[10px] text-gold uppercase tracking-widest">🏗️ HQ Base Builder</h3>
          <div class="text-[10px] text-gray-400">⭐ Score: ${totalScore}</div>
        </div>

        <!-- Grid -->
        <div class="mb-4">
          <div class="text-[9px] text-gray-500 mb-2">Mappa HQ — Clicca su uno slot + per costruire</div>
          <div class="hq-grid" style="display:grid;grid-template-columns:repeat(${HQ_GRID_COLS},1fr);gap:4px;">
            ${gridHtml}
          </div>
        </div>

        <!-- Active effects -->
        ${fxItems.length > 0 ? `
          <div class="bg-gold/5 border border-gold/20 rounded-lg p-3 mb-4">
            <div class="text-[9px] text-gold font-bold uppercase mb-2">⚡ Effetti Attivi</div>
            <div class="flex flex-wrap gap-1">
              ${fxItems.map(f => `<span class="text-[8px] bg-white/10 rounded px-1.5 py-0.5 text-gray-300">${f}</span>`).join('')}
            </div>
          </div>` : ''}

        <!-- Build options -->
        ${unlockedRooms.length > 0 ? `
          <h3 class="text-[10px] text-gold uppercase tracking-widest mb-2">🔓 Stanze Disponibili</h3>
          ${roomListHtml(unlockedRooms, false)}` : ''}
        ${lockedRooms.length > 0 ? `
          <h3 class="text-[10px] text-gray-600 uppercase tracking-widest mb-2 mt-3">🔒 Stanze Bloccate</h3>
          ${roomListHtml(lockedRooms, true)}` : ''}
      </div>

      <style>
        .hq-tile { border-radius:8px; aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:all 0.15s; }
        .hq-tile-built { background:rgba(212,175,55,0.08); border:1px solid rgba(212,175,55,0.25); }
        .hq-tile-empty { background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.08); }
        .hq-tile-empty:hover { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.2); }
      </style>`;
};

window.hqOpenBuildModal = function(slotIndex) {
    const builtRooms = _hqRooms();
    const unlockedRooms = window.HQ_ROOMS.filter(r =>
        !builtRooms.includes(r.id) && r.prereqs.every(p => builtRooms.includes(p))
    );

    const existing = document.getElementById('hq-build-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'hq-build-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 w-80 max-w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <div class="text-sm font-bold text-white">🏗️ Scegli cosa costruire</div>
          <button onclick="document.getElementById('hq-build-modal').remove()" class="text-gray-500 hover:text-white text-lg">✕</button>
        </div>
        ${unlockedRooms.length === 0
            ? '<div class="text-[10px] text-gray-500 text-center py-4">Nessuna stanza disponibile. Costruisci prima i prerequisiti.</div>'
            : unlockedRooms.map(r => `
              <div class="bg-white/3 border border-white/8 rounded-lg p-3 mb-2">
                <div class="font-bold text-white text-sm">${r.icon} ${r.name}</div>
                <div class="text-[10px] text-gray-400 mt-0.5 mb-2">${r.desc}</div>
                <div class="flex justify-between items-center">
                  <span class="text-gold text-[11px] font-mono">€${r.cost.toLocaleString()}</span>
                  <button onclick="document.getElementById('hq-build-modal').remove(); window.hqBuildRoom('${r.id}', ${slotIndex})"
                    class="btn-gold !text-[9px] !py-1 !px-2 ${(gameState.cash||0) < r.cost ? 'opacity-40' : ''}">
                    Costruisci qui
                  </button>
                </div>
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

// ── INIT ──────────────────────────────────────────────────────────────────────

window.hqInit = function() {
    if (!gameState.hqRooms) gameState.hqRooms = ['garage_main'];
    if (!gameState.hqGrid) gameState.hqGrid = { 7: 'garage_main' };
    if (!gameState.driverObituaries) gameState.driverObituaries = [];
};
