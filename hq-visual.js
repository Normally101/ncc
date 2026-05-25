'use strict';
/* ================================================================
   hq-visual.js — Chauffeur Empire
   Visual Isometric Campus (SVG + Vanilla JS) — v3 Tiers & Multi-City
   ================================================================ */

// ── ISOMETRIC CONFIGURATION ──────────────────────────────────────────────────
const ISO_TILE_W   = 72;
const ISO_TILE_H   = 36;
const ISO_ORIGIN_X = 460;
const ISO_ORIGIN_Y = 130;

function _isoToScreen(col, row) {
    return {
        x: ISO_ORIGIN_X + (col - row) * ISO_TILE_W / 2,
        y: ISO_ORIGIN_Y + (col + row) * ISO_TILE_H / 2
    };
}

// ── ROOM SIZE UTILITY ─────────────────────────────────────────────────────────
function _getRoomGridSize(roomId) {
    if (roomId === 'penthouse') return 3;
    if (roomId === 'garage_main') return 2;
    if (roomId === 'helipad' || roomId === 'ev_parking' || roomId === 'water_dock') return 1.5;
    return 1;
}

// ── SVG DEFS (filters, patterns) ─────────────────────────────────────────────
const SVG_DEFS = `
<defs>
  <radialGradient id="groundGrad" cx="50%" cy="50%" r="60%">
    <stop offset="0%" stop-color="#1c2a22"/>
    <stop offset="100%" stop-color="#0d1510"/>
  </radialGradient>
  <pattern id="gridPat" width="36" height="18" patternUnits="userSpaceOnUse" patternTransform="skewX(-26.57) scale(1)">
    <rect width="36" height="18" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
  </pattern>
</defs>`;

// ── EMPTY SLOT ───────────────────────────────────────────────────────────────
function _emptySlot(cx, cy, roomId, state) {
    const room  = window.HQ_ROOMS ? window.HQ_ROOMS.find(r => r.id === roomId) : null;
    const name  = room ? room.name : roomId;
    const scale = _getRoomGridSize(roomId);
    const hW    = (ISO_TILE_W / 2) * scale;
    const hH    = (ISO_TILE_H / 2) * scale;
    const pts   = `${cx},${cy - hH} ${cx + hW},${cy} ${cx},${cy + hH} ${cx - hW},${cy}`;

    if (state === 'available') {
        return `<g class="hq-slot-available hq-slot-pulse" onclick="window.hqOpenBuildModal('${roomId}')" style="cursor:pointer">
            <polygon points="${pts}" fill="rgba(212,175,55,0.07)" stroke="rgba(212,175,55,0.6)" stroke-dasharray="5,4" stroke-width="1.5"/>
            <text x="${cx}" y="${cy + 4}" fill="#d4af37" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">+</text>
            <text x="${cx}" y="${cy + 16}" fill="rgba(212,175,55,0.8)" font-size="7.5" font-family="'Montserrat',sans-serif" text-anchor="middle">${name}</text>
        </g>`;
    }
    return `<g class="hq-building-locked" style="cursor:pointer">
        <polygon points="${pts}" fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,4" stroke-width="1"/>
        <text x="${cx}" y="${cy + 5}" fill="#334155" font-size="11" font-family="sans-serif" text-anchor="middle">🔒</text>
    </g>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BUILDING RENDERER (Dynamic Sprite)
// ═══════════════════════════════════════════════════════════════════════════════

function _bld_sprite(cx, cy, roomId, level) {
    const scale = _getRoomGridSize(roomId);
    const width = 120 * scale; 
    const hw = width / 2;
    const yOffset = width * 0.8; 
    
    // Fallback block if image doesn't load
    const fW = (ISO_TILE_W / 2) * scale;
    const fH = (ISO_TILE_H / 2) * scale;
    const fallbackPts = `${cx},${cy - fH} ${cx + fW},${cy} ${cx},${cy + fH} ${cx - fW},${cy}`;
    const fallback = `
        <polygon points="${fallbackPts}" fill="rgba(100,100,100,0.2)" stroke="#555" stroke-width="1"/>
        <text x="${cx}" y="${cy}" fill="#888" font-size="10" text-anchor="middle">${roomId} Lvl${level}</text>
    `;

    // Attempt to load the tier image (e.g. assets/buildings/garage_main_lvl1.png)
    // Se il giocatore non ha ancora l'immagine per questo livello, il browser non mostrerà nulla (o un broken link se non è inline SVG),
    // e si vedrà il fallback sottostante.
    return `<g class="hq-building" id="bld-${roomId}" onclick="window.hqShowInfoPanel('${roomId}')">
        ${fallback}
        <image href="assets/buildings/${roomId}_lvl${level}.png" x="${cx - hw}" y="${cy - yOffset}" width="${width}" height="${width}" preserveAspectRatio="xMidYMax meet" style="pointer-events: none;" />
    </g>`;
}

// ── MAIN RENDER LOOP ──────────────────────────────────────────────────────────

window.renderHQCampus = function() {
    const placeholder = document.getElementById('hq-visual-placeholder');
    if (!placeholder) return;

    if (!gameState.hqs) return;
    const currentCityId = gameState.currentHQCity || 'roma';
    const cityData = gameState.hqs[currentCityId];
    if (!cityData) return;

    const builtRooms = cityData.rooms || {};
    const grid = cityData.grid || {};

    let html = `<svg width="100%" height="400" viewBox="0 0 920 400" preserveAspectRatio="xMidYMid meet" 
                     style="background: #0f1519; border-radius:12px; overflow:visible;">`;
    
    html += SVG_DEFS;

    // 1. Draw Ground Base
    html += _hqGroundGrid();

    // 2. Draw slots (empty or built)
    // First draw all empty grid slots
    for (let slot = 0; slot < HQ_GRID_SIZE; slot++) {
        const row = Math.floor(slot / HQ_GRID_COLS);
        const col = slot % HQ_GRID_COLS;
        const pos = _isoToScreen(col * 1.5, row * 1.5); // Spread them out
        
        if (!grid[slot]) {
            // Draw generic empty grid slot
            const pts = `${pos.x},${pos.y - ISO_TILE_H/2} ${pos.x + ISO_TILE_W/2},${pos.y} ${pos.x},${pos.y + ISO_TILE_H/2} ${pos.x - ISO_TILE_W/2},${pos.y}`;
            html += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
        }
    }

    // 3. Collect built objects and sort them by Y coordinate (Painter's Algorithm)
    const objectsToDraw = [];
    
    for (const [slot, roomId] of Object.entries(grid)) {
        const s = parseInt(slot, 10);
        const row = Math.floor(s / HQ_GRID_COLS);
        const col = s % HQ_GRID_COLS;
        const pos = _isoToScreen(col * 1.5, row * 1.5);
        const level = builtRooms[roomId] || 1;
        
        objectsToDraw.push({
            roomId: roomId,
            level: level,
            x: pos.x,
            y: pos.y,
            svg: _bld_sprite(pos.x, pos.y, roomId, level)
        });
    }

    // Sort ascending by Y to draw back-to-front
    objectsToDraw.sort((a, b) => a.y - b.y);

    for (const obj of objectsToDraw) {
        html += obj.svg;
    }

    html += `</svg>`;
    placeholder.innerHTML = html;
};

// ── GROUND GENERATION ─────────────────────────────────────────────────────────

function _hqGroundGrid() {
    // Generate a large isometric rhombus for the campus ground
    const cols = 9;
    const rows = 6;
    
    const top    = _isoToScreen(0, 0);
    const right  = _isoToScreen(cols, 0);
    const bottom = _isoToScreen(cols, rows);
    const left   = _isoToScreen(0, rows);

    // Apply offset because origin is inside
    const ox = -ISO_TILE_W;
    const oy = -ISO_TILE_H;

    const pts = `${top.x+ox},${top.y+oy} ${right.x+ox},${right.y+oy} ${bottom.x+ox},${bottom.y+oy} ${left.x+ox},${left.y+oy}`;

    let svg = `<polygon points="${pts}" fill="url(#groundGrad)" stroke="#27382e" stroke-width="1"/>`;
    // Add grid pattern overlay mapped to isometric plane
    svg += `<polygon points="${pts}" fill="url(#gridPat)" opacity="0.3"/>`;

    // Road (asphalt dark strip) at the front edge
    const rL = _isoToScreen(-0.5, rows+0.5);
    const rR = _isoToScreen(cols+0.5, rows+0.5);
    const rB = _isoToScreen(cols+1, rows+1);
    const rBL= _isoToScreen(0, rows+1);
    
    svg += `<polygon points="${rL.x+ox},${rL.y+oy} ${rR.x+ox},${rR.y+oy} ${rB.x+ox},${rB.y+oy} ${rBL.x+ox},${rBL.y+oy}" fill="#141a1f"/>`;
    
    return svg;
}

// ── INFO PANEL (CLICK ON BUILDING) ────────────────────────────────────────────

window.hqShowInfoPanel = function(roomId) {
    const currentCityId = gameState.currentHQCity || 'roma';
    const currentLevel = window.hqGetRoomLevel(currentCityId, roomId);
    if (currentLevel === 0) return;

    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!room) return;
    
    const tDef = room.tiers.find(t => t.level === currentLevel);
    if (!tDef) return;

    let fxHtml = '';
    for (const [k, v] of Object.entries(tDef.effect)) {
        if (typeof v === 'number') {
            const val = k.endsWith('Mult') ? `×${v.toFixed(2)}` : `+${v}`;
            fxHtml += `<span class="text-[10px] bg-gold/10 text-gold px-2 py-1 rounded mr-1">${val}</span>`;
        } else {
            fxHtml += `<span class="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded mr-1">${v}</span>`;
        }
    }

    const existing = document.getElementById('hq-info-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'hq-info-panel';
    panel.className = 'absolute z-50 bg-[#161b22]/95 border border-white/20 p-4 rounded-xl shadow-2xl backdrop-blur-md hq-info-pop max-w-[280px] pointer-events-auto';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';

    panel.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div>
                <h3 class="text-white font-bold text-sm">${room.icon} ${room.name}</h3>
                <div class="text-xs text-gold font-mono uppercase">Livello ${currentLevel}</div>
            </div>
            <button onclick="this.closest('#hq-info-panel').remove()" class="text-gray-400 hover:text-white ml-4">✕</button>
        </div>
        <p class="text-[11px] text-gray-300 mb-3">${room.desc}</p>
        <div class="mb-3">
            <div class="text-[9px] text-gray-500 uppercase mb-1">Effetti (Questo Livello)</div>
            <div class="flex flex-wrap">${fxHtml}</div>
        </div>
    `;

    document.getElementById('tab-container').appendChild(panel);
};

window.hqShowLockedTooltip = function(roomId) {
    if(typeof showNotification==='function') showNotification('Struttura bloccata. Controlla i prerequisiti.', 'warning');
};
