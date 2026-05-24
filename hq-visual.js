'use strict';
/* ================================================================
   hq-visual.js — Chauffeur Empire
   Visual Isometric Campus (SVG + Vanilla JS)
   ================================================================ */

// ── ISOMETRIC CONFIGURATION ──────────────────────────────────────────────────
const ISO_TILE_W  = 64;   // Tile screen width
const ISO_TILE_H  = 32;   // Tile screen height
const ISO_ORIGIN_X = 450; // Screen X of tile [0,0]
const ISO_ORIGIN_Y = 110; // Screen Y of tile [0,0]

// Conversion: grid -> screen pixels
function _isoToScreen(col, row) {
    return {
        x: ISO_ORIGIN_X + (col - row) * ISO_TILE_W / 2,
        y: ISO_ORIGIN_Y + (col + row) * ISO_TILE_H / 2
    };
}

// ── COLOR ADJUSTER HELPER ────────────────────────────────────────────────────
function _adjustColorBrightness(hex, percent) {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    let r = parseInt(hex.substr(0, 2), 16),
        g = parseInt(hex.substr(2, 2), 16),
        b = parseInt(hex.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, r + percent));
    g = Math.max(0, Math.min(255, g + percent));
    b = Math.max(0, Math.min(255, b + percent));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ── ROOM SIZE UTILITY ────────────────────────────────────────────────────────
function _getRoomGridSize(roomId) {
    if (roomId === 'penthouse') return 3;
    if (roomId === 'garage_main') return 2;
    if (roomId === 'helipad' || roomId === 'ev_parking') return 1.5;
    return 1;
}

// Room mappings to exact col/row coordinates
const HQ_ROOM_COORDS = {
    garage_main:     { col: 4.5, row: 4.5 },
    workshop:        { col: 6.5, row: 4.5 },
    ev_parking:      { col: 4.5, row: 6.5 },
    gym:             { col: 2.0, row: 3.0 },
    canteen:         { col: 2.0, row: 5.0 },
    infirmary:       { col: 1.0, row: 4.0 },
    mission_room:    { col: 6.5, row: 3.0 },
    it_center:       { col: 7.5, row: 4.0 },
    rd_lab:          { col: 7.5, row: 2.0 },
    control_tower:   { col: 5.0, row: 2.0 },
    security_bunker: { col: 3.0, row: 2.0 },
    vip_lounge:      { col: 6.0, row: 1.0 },
    helipad:         { col: 5.0, row: 0.0 },
    crypto_vault:    { col: 3.0, row: 0.0 },
    penthouse:       { col: 5.0, row: -1.3 }
};

// ── FIXED PARKING SLOTS FOR VISUAL FLEET ──────────────────────────────────────
const PARKING_SLOTS = [
    { col: 4.0, row: 6.0 },
    { col: 4.8, row: 6.0 },
    { col: 4.0, row: 6.8 },
    { col: 4.8, row: 6.8 },
    { col: 3.8, row: 4.2 },
    { col: 3.8, row: 4.8 }
];

// ── ISOMETRIC 3D BOX GENERATOR ───────────────────────────────────────────────
function _isoBox(x, y, w, d, h, colorTop, colorLeft, colorRight) {
    const topPts = [
        `${x},${y - h}`,
        `${x + w / 2},${y - h + d / 4}`,
        `${x},${y - h + d / 2}`,
        `${x - w / 2},${y - h + d / 4}`
    ].join(' ');

    const leftPts = [
        `${x - w / 2},${y - h + d / 4}`,
        `${x},${y - h + d / 2}`,
        `${x},${y + d / 2}`,
        `${x - w / 2},${y + d / 4}`
    ].join(' ');

    const rightPts = [
        `${x + w / 2},${y - h + d / 4}`,
        `${x},${y - h + d / 2}`,
        `${x},${y + d / 2}`,
        `${x + w / 2},${y + d / 4}`
    ].join(' ');

    return `
        <polygon points="${topPts}"   fill="${colorTop}"   />
        <polygon points="${leftPts}"  fill="${colorLeft}"  />
        <polygon points="${rightPts}" fill="${colorRight}" />
    `;
}

// ── EMPTY SLOT RENDERER ──────────────────────────────────────────────────────
function _emptySlot(cx, cy, roomId, state) {
    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    const name = room ? room.name : '';
    const scale = _getRoomGridSize(roomId);
    
    const hW = (ISO_TILE_W / 2) * scale;
    const hH = (ISO_TILE_H / 2) * scale;
    
    const pts = [
        `${cx},${cy - hH}`,
        `${cx + hW},${cy}`,
        `${cx},${cy + hH}`,
        `${cx - hW},${cy}`
    ].join(' ');

    const color = state === 'available' ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.02)';
    const stroke = state === 'available' ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.15)';
    const dash = state === 'available' ? '4,4' : '2,2';
    
    const pulseClass = state === 'available' ? 'hq-slot-pulse hq-slot-available' : 'hq-building-locked';
    const clickAction = state === 'available'
        ? `onclick="window.hqOpenBuildModalFromMap('${roomId}')"`
        : `onclick="window.hqShowLockedTooltip('${roomId}')"`;

    return `
        <g class="${pulseClass}" ${clickAction} style="cursor: pointer;">
            <polygon points="${pts}" fill="${color}" stroke="${stroke}" stroke-dasharray="${dash}" stroke-width="1.5" class="hq-tile-shape" />
            <text x="${cx}" y="${cy + 4}" fill="${state === 'available' ? '#d4af37' : '#4d6480'}" font-size="10" font-family="'Roboto Mono', monospace" text-anchor="middle" font-weight="bold">${state === 'available' ? '+' : '🔒'}</text>
            <text x="${cx}" y="${cy + 15}" fill="${state === 'available' ? '#cdd6e0' : '#4d6480'}" font-size="8" font-family="'Montserrat', sans-serif" text-anchor="middle">${name.split(' ')[0]}</text>
        </g>
    `;
}

// ── SPECIFIC BUILDING GENERATORS ─────────────────────────────────────────────

function _bld_garage_main(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'garage_main', state);
    const box = _isoBox(cx, cy, 96, 96, 45, '#544633', '#3d3225', '#2c241a');
    // Garage doors (gray)
    const doorL = `<polygon points="${cx - 35},${cy + 18} ${cx - 10},${cy + 30} ${cx - 10},${cy + 10} ${cx - 35},${cy - 2}" fill="#2e353d" stroke="#1c2024" />`;
    const doorR = `<polygon points="${cx + 10},${cy + 30} ${cx + 35},${cy + 18} ${cx + 35},${cy - 2} ${cx + 10},${cy + 10}" fill="#2e353d" stroke="#1c2024" />`;
    // Stripes
    const stripe = `<polygon points="${cx - 48},${cy - 45} ${cx + 48},${cy - 45} ${cx},${cy - 40}" fill="#d4af37" opacity="0.6"/>`;
    return `
        <g class="hq-building" id="bld-garage_main" onclick="window.hqShowInfoPanel('garage_main')">
            ${box}
            ${doorL}
            ${doorR}
            ${stripe}
            <text x="${cx}" y="${cy - 50}" fill="#ffffff" font-size="8" font-family="'Cinzel', serif" text-anchor="middle" font-weight="bold" letter-spacing="1">GARAGE</text>
        </g>
    `;
}

function _bld_workshop(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'workshop', state);
    const box = _isoBox(cx, cy, 54, 54, 35, '#2e3d52', '#202b3a', '#171f2a');
    const window = `<polygon points="${cx - 18},${cy + 10} ${cx - 6},${cy + 16} ${cx - 6},${cy + 4} ${cx - 18},${cy - 2}" fill="#f59e0b" opacity="0.85" />`;
    const chimney = _isoBox(cx + 12, cy - 35, 8, 8, 12, '#1e293b', '#0f172a', '#020617');
    return `
        <g class="hq-building" id="bld-workshop" onclick="window.hqShowInfoPanel('workshop')">
            ${box}
            ${window}
            ${chimney}
        </g>
    `;
}

function _bld_ev_parking(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'ev_parking', state);
    const pad = _isoBox(cx, cy, 70, 70, 8, '#1e382b', '#13241c', '#0d1813');
    // Green charger lines
    const lineL = `<line x1="${cx - 20}" y1="${cy + 5}" x2="${cx}" y2="${cy + 15}" stroke="#10b981" stroke-width="2" />`;
    const lineR = `<line x1="${cx}" y1="${cy + 15}" x2="${cx + 20}" y2="${cy + 5}" stroke="#10b981" stroke-width="2" />`;
    // Charger posts
    const post1 = _isoBox(cx - 15, cy - 2, 6, 6, 16, '#10b981', '#065f46', '#047857');
    const post2 = _isoBox(cx + 15, cy - 2, 6, 6, 16, '#10b981', '#065f46', '#047857');
    return `
        <g class="hq-building" id="bld-ev_parking" onclick="window.hqShowInfoPanel('ev_parking')">
            ${pad}
            ${lineL}
            ${lineR}
            ${post1}
            ${post2}
        </g>
    `;
}

function _bld_gym(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'gym', state);
    const box = _isoBox(cx, cy, 54, 54, 40, '#42324f', '#2f2438', '#211927');
    // Glass front
    const glass = `<polygon points="${cx - 20},${cy + 12} ${cx},${cy + 22} ${cx},${cy - 18} ${cx - 20},${cy - 28}" fill="rgba(100, 200, 255, 0.4)" stroke="rgba(255, 255, 255, 0.2)" />`;
    return `
        <g class="hq-building" id="bld-gym" onclick="window.hqShowInfoPanel('gym')">
            ${box}
            ${glass}
            <text x="${cx}" y="${cy - 45}" fill="#ffffff" font-size="12" text-anchor="middle">🏋️</text>
        </g>
    `;
}

function _bld_canteen(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'canteen', state);
    const box = _isoBox(cx, cy, 54, 54, 30, '#4a3525', '#332419', '#241a12');
    const windowL = `<polygon points="${cx - 18},${cy + 6} ${cx - 10},${cy + 10} ${cx - 10},${cy + 2} ${cx - 18},${cy - 2}" fill="#f97316" opacity="0.8" />`;
    const windowR = `<polygon points="${cx + 10},${cy + 10} ${cx + 18},${cy + 6} ${cx + 18},${cy - 2} ${cx + 10},${cy + 2}" fill="#f97316" opacity="0.8" />`;
    return `
        <g class="hq-building" id="bld-canteen" onclick="window.hqShowInfoPanel('canteen')">
            ${box}
            ${windowL}
            ${windowR}
        </g>
    `;
}

function _bld_infirmary(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'infirmary', state);
    const box = _isoBox(cx, cy, 54, 54, 30, '#2d4a4a', '#1e3333', '#152424');
    // Red Cross Sign
    const sign = _isoBox(cx, cy - 30, 10, 10, 10, '#ffffff', '#e2e8f0', '#cbd5e1');
    const crossH = `<line x1="${cx - 3}" y1="${cy - 35}" x2="${cx + 3}" y2="${cy - 35}" stroke="#ef4444" stroke-width="2" />`;
    const crossV = `<line x1="${cx}" y1="${cy - 38}" x2="${cx}" y2="${cy - 32}" stroke="#ef4444" stroke-width="2" />`;
    return `
        <g class="hq-building" id="bld-infirmary" onclick="window.hqShowInfoPanel('infirmary')">
            ${box}
            ${sign}
            ${crossH}
            ${crossV}
        </g>
    `;
}

function _bld_mission_room(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'mission_room', state);
    const box = _isoBox(cx, cy, 54, 54, 50, '#1b2c45', '#121f30', '#0d1724');
    const screenGlow = `<polygon points="${cx - 18},${cy + 5} ${cx - 2},${cy + 13} ${cx - 2},${cy - 12} ${cx - 18},${cy - 20}" fill="rgba(0, 242, 255, 0.35)" />`;
    const border = `<polygon points="${cx - 18},${cy + 5} ${cx - 2},${cy + 13} ${cx - 2},${cy - 12} ${cx - 18},${cy - 20}" fill="none" stroke="#00f2ff" stroke-width="0.5" />`;
    return `
        <g class="hq-building" id="bld-mission_room" onclick="window.hqShowInfoPanel('mission_room')">
            ${box}
            ${screenGlow}
            ${border}
        </g>
    `;
}

function _bld_it_center(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'it_center', state);
    const box = _isoBox(cx, cy, 54, 54, 40, '#2d1e3d', '#20152b', '#160e1f');
    // Satellite dish
    const base = `<line x1="${cx}" y1="${cy - 40}" x2="${cx}" y2="${cy - 48}" stroke="#94a3b8" stroke-width="2" />`;
    const dish = `<path d="M ${cx - 10} ${cy - 54} Q ${cx} ${cy - 48} ${cx + 10} ${cy - 54}" fill="none" stroke="#e2e8f0" stroke-width="3" />`;
    return `
        <g class="hq-building" id="bld-it_center" onclick="window.hqShowInfoPanel('it_center')">
            ${box}
            ${base}
            ${dish}
        </g>
    `;
}

function _bld_rd_lab(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'rd_lab', state);
    const box = _isoBox(cx, cy, 54, 54, 45, '#1e3b33', '#142923', '#0e1d19');
    // Glowing green dome
    const dome = `<path d="M ${cx - 14} ${cy - 45} A 14 14 0 0 1 ${cx + 14} ${cy - 45}" fill="rgba(16, 185, 129, 0.4)" stroke="#10b981" stroke-width="1" />`;
    return `
        <g class="hq-building" id="bld-rd_lab" onclick="window.hqShowInfoPanel('rd_lab')">
            ${box}
            ${dome}
        </g>
    `;
}

function _bld_control_tower(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'control_tower', state);
    // Shaft
    const shaft = _isoBox(cx, cy, 30, 30, 75, '#2e3a4e', '#202937', '#171e28');
    // Cabin
    const cabin = _isoBox(cx, cy - 75, 46, 46, 18, '#3b4d66', '#293647', '#1e2733');
    // Cabin glass
    const glassL = `<polygon points="${cx - 18},${cy - 68} ${cx},${cy - 59} ${cx},${cy - 71} ${cx - 18},${cy - 80}" fill="rgba(0, 242, 255, 0.3)" />`;
    const glassR = `<polygon points="${cx + 18},${cy - 68} ${cx},${cy - 59} ${cx},${cy - 71} ${cx + 18},${cy - 80}" fill="rgba(0, 242, 255, 0.3)" />`;
    // Blinker light at the top
    const antenna = `<line x1="${cx}" y1="${cy - 93}" x2="${cx}" y2="${cy - 105}" stroke="#94a3b8" stroke-width="1.5" />`;
    const light = `<circle cx="${cx}" cy="${cy - 106}" r="3" fill="#ef4444" class="hq-sparkle" />`;
    return `
        <g class="hq-building" id="bld-control_tower" onclick="window.hqShowInfoPanel('control_tower')">
            ${shaft}
            ${cabin}
            ${glassL}
            ${glassR}
            ${antenna}
            ${light}
        </g>
    `;
}

function _bld_security_bunker(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'security_bunker', state);
    const box = _isoBox(cx, cy, 54, 54, 25, '#262626', '#1a1a1a', '#121212');
    // Steel doors & slits
    const door = `<polygon points="${cx - 8},${cy + 13} ${cx + 8},${cy + 9} ${cx + 8},${cy - 3} ${cx - 8},${cy + 1}" fill="#404040" stroke="#171717" />`;
    const slit1 = `<line x1="${cx - 20}" y1="${cy - 6}" x2="${cx - 12}" y2="${cy - 10}" stroke="#f59e0b" stroke-width="1" />`;
    const slit2 = `<line x1="${cx + 20}" y1="${cy - 6}" x2="${cx + 12}" y2="${cy - 10}" stroke="#f59e0b" stroke-width="1" />`;
    return `
        <g class="hq-building" id="bld-security_bunker" onclick="window.hqShowInfoPanel('security_bunker')">
            ${box}
            ${door}
            ${slit1}
            ${slit2}
        </g>
    `;
}

function _bld_vip_lounge(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'vip_lounge', state);
    const box = _isoBox(cx, cy, 54, 54, 45, '#42331d', '#2e2314', '#21190e');
    const goldPillar1 = `<line x1="${cx - 24}" y1="${cy + 10}" x2="${cx - 24}" y2="${cy - 35}" stroke="#d4af37" stroke-width="2" />`;
    const goldPillar2 = `<line x1="${cx + 24}" y1="${cy + 10}" x2="${cx + 24}" y2="${cy - 35}" stroke="#d4af37" stroke-width="2" />`;
    const glass = `<polygon points="${cx - 20},${cy + 10} ${cx + 20},${cy + 10} ${cx + 20},${cy - 30} ${cx - 20},${cy - 30}" fill="rgba(212, 175, 55, 0.15)" stroke="rgba(212, 175, 55, 0.3)" />`;
    return `
        <g class="hq-building" id="bld-vip_lounge" onclick="window.hqShowInfoPanel('vip_lounge')">
            ${box}
            ${glass}
            ${goldPillar1}
            ${goldPillar2}
        </g>
    `;
}

function _bld_helipad(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'helipad', state);
    const pad = _isoBox(cx, cy, 80, 80, 5, '#2e2e2e', '#212121', '#181818');
    // H marking
    const hMark = `
        <path d="M ${cx - 10} ${cy - 12} L ${cx - 10} ${cy + 2} M ${cx + 10} ${cy - 12} L ${cx + 10} ${cy + 2} M ${cx - 10} ${cy - 5} L ${cx + 10} ${cy - 5}"
              fill="none" stroke="#d4af37" stroke-width="3" stroke-linecap="round" />
        <circle cx="${cx}" cy="${cy - 5}" r="22" fill="none" stroke="#d4af37" stroke-width="2" stroke-dasharray="6,4" />
    `;
    // Red beacon lights at corners
    const light1 = `<circle cx="${cx - 36}" cy="${cy - 5}" r="2" fill="#ef4444" class="hq-sparkle" />`;
    const light2 = `<circle cx="${cx + 36}" cy="${cy - 5}" r="2" fill="#ef4444" class="hq-sparkle" />`;
    const light3 = `<circle cx="${cx}" cy="${cy - 23}" r="2" fill="#ef4444" class="hq-sparkle" />`;
    const light4 = `<circle cx="${cx}" cy="${cy + 13}" r="2" fill="#ef4444" class="hq-sparkle" />`;
    return `
        <g class="hq-building" id="bld-helipad" onclick="window.hqShowInfoPanel('helipad')">
            ${pad}
            ${hMark}
            ${light1}
            ${light2}
            ${light3}
            ${light4}
        </g>
    `;
}

function _bld_crypto_vault(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'crypto_vault', state);
    const box = _isoBox(cx, cy, 54, 54, 35, '#1e293b', '#0f172a', '#020617');
    // Gold safe dial
    const dial = `<circle cx="${cx - 10}" cy="${cy + 8}" r="8" fill="#d4af37" stroke="#9a3412" />`;
    const handle = `<line x1="${cx - 10}" y1="${cy + 8}" x2="${cx - 4}" y2="${cy + 14}" stroke="#1e293b" stroke-width="2.5" />`;
    return `
        <g class="hq-building" id="bld-crypto_vault" onclick="window.hqShowInfoPanel('crypto_vault')">
            ${box}
            ${dial}
            ${handle}
        </g>
    `;
}

function _bld_penthouse(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'penthouse', state);
    // Floor 1 (base)
    const base = _isoBox(cx, cy, 110, 110, 35, '#1d273a', '#141b28', '#0e131d');
    // Floor 2 (setback)
    const mid = _isoBox(cx, cy - 35, 84, 84, 30, '#222f47', '#172133', '#101724');
    // Floor 3 (top lounge)
    const top = _isoBox(cx, cy - 65, 58, 58, 25, '#3b4d66', '#293647', '#1e2733');
    // Gold spires
    const spireL = `<line x1="${cx - 20}" y1="${cy - 90}" x2="${cx - 20}" y2="${cy - 120}" stroke="#d4af37" stroke-width="2" />`;
    const spireR = `<line x1="${cx + 20}" y1="${cy - 90}" x2="${cx + 20}" y2="${cy - 120}" stroke="#d4af37" stroke-width="2" />`;
    const lightL = `<circle cx="${cx - 20}" cy="${cy - 120}" r="3.5" fill="#f59e0b" class="hq-sparkle" />`;
    const lightR = `<circle cx="${cx + 20}" cy="${cy - 120}" r="3.5" fill="#f59e0b" class="hq-sparkle" />`;

    // Penthouse vertical spotlight lines (only in Stage 3 "Empire")
    let searchlights = '';
    const totalBuilt = gameState.hqRooms ? gameState.hqRooms.length : 1;
    if (totalBuilt >= 11) {
        searchlights = `
            <line x1="${cx - 30}" y1="${cy - 90}" x2="${cx - 150}" y2="${cy - 400}" stroke="rgba(212, 175, 55, 0.4)" stroke-width="4" filter="blur(3px)" class="hq-spotlight" />
            <line x1="${cx + 30}" y1="${cy - 90}" x2="${cx + 150}" y2="${cy - 400}" stroke="rgba(212, 175, 55, 0.4)" stroke-width="4" filter="blur(3px)" class="hq-spotlight" />
        `;
    }

    return `
        <g class="hq-building" id="bld-penthouse" onclick="window.hqShowInfoPanel('penthouse')">
            ${base}
            ${mid}
            ${top}
            ${spireL}
            ${spireR}
            ${lightL}
            ${lightR}
            ${searchlights}
        </g>
    `;
}

// ── GET PARKED VEHICLES RETRIEVAL ────────────────────────────────────────────
function _getParkedCars() {
    if (!gameState.fleet) return [];
    return gameState.fleet.filter(car => {
        const driver = gameState.drivers ? gameState.drivers.find(d => d.assignedCar === car.id) : null;
        // Car is parked if there is no driver, or the driver is idle, resting, or offline
        return !driver || driver.status === 'idle' || driver.status === 'resting' || driver.status === 'offline';
    }).slice(0, 6); // Cap at 6 visual cars
}

// Draw a small 3D isometric car sprite
function _hqCarSVG(car, cx, cy) {
    const color = car.color || '#d4af37';
    const colTop = color;
    const colLeft = _adjustColorBrightness(color, -25);
    const colRight = _adjustColorBrightness(color, -45);
    
    // Scale down dimensions for car: w = 20, d = 36, h = 6
    const baseBox = _isoBox(cx, cy, 20, 36, 6, colTop, colLeft, colRight);
    // Cabin: w = 14, d = 20, h = 5 (at height offset 6)
    const cabinBox = _isoBox(cx, cy - 6, 14, 20, 5, '#1e293b', '#0f172a', '#020617');
    
    // Headlights (glowing yellow points on front face, bottom corner)
    // Left headlight: bottom-left face.
    const hlLeft = `<circle cx="${cx - 5}" cy="${cy + 6}" r="1.5" fill="#fef08a" class="hq-sparkle" />`;
    const hlRight = `<circle cx="${cx + 5}" cy="${cy + 6}" r="1.5" fill="#fef08a" class="hq-sparkle" />`;
    
    return `
        <g class="hq-car" data-car-id="${car.id}" title="${CE_Sec.escapeHTML(car.brand)} ${CE_Sec.escapeHTML(car.model)}" onclick="event.stopPropagation(); window.hqShowCarDetails('${car.id}')">
            ${baseBox}
            ${cabinBox}
            ${hlLeft}
            ${hlRight}
        </g>
    `;
}

// ── RENDER MAP GROUND TILES ──────────────────────────────────────────────────
function _hqGroundTile(col, row, type) {
    const screen = _isoToScreen(col, row);
    const cx = screen.x;
    const cy = screen.y;
    
    const pts = [
        `${cx},${cy - ISO_TILE_H / 2}`,
        `${cx + ISO_TILE_W / 2},${cy}`,
        `${cx},${cy + ISO_TILE_H / 2}`,
        `${cx - ISO_TILE_W / 2},${cy}`
    ].join(' ');

    let fill = '#16231d'; // grass base
    let stroke = 'rgba(255,255,255,0.015)';
    
    if (type === 'road') {
        fill = '#1a1d24'; // asphalt
        stroke = 'rgba(255,255,255,0.03)';
    } else if (type === 'concrete') {
        fill = '#2a2f3a'; // light grey concrete
        stroke = 'rgba(255,255,255,0.04)';
    } else if (type === 'parking') {
        fill = '#1e3025'; // dark green solar-electric tarmac
        stroke = '#10b981'; // green perimeter
    } else if (type === 'marble') {
        fill = '#111827'; // luxury marble
        stroke = 'rgba(212,175,55,0.12)';
    }
    
    return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="0.5" class="hq-tile-shape" />`;
}

// ── MAIN CAMPUS GENERATOR ────────────────────────────────────────────────────
function _hqCampusHTML() {
    const builtCount = gameState.hqRooms ? gameState.hqRooms.length : 1;
    const stage = _getHQStage(builtCount);

    // 1. Build background stars if stage 3
    let starsHtml = '';
    if (stage === 3) {
        // Draw 30 static stars
        for (let i = 0; i < 30; i++) {
            const sx = (i * 37 + 43) % 900;
            const sy = (i * 19 + 23) % 180;
            const size = (i % 2 === 0) ? 1.5 : 1;
            starsHtml += `<circle cx="${sx}" cy="${sy}" r="${size}" fill="#ffffff" opacity="${0.2 + (i % 5) * 0.15}" class="hq-sparkle" />`;
        }
    }

    // 2. Render ground tiles (from back to front)
    let groundHtml = '';
    for (let r = -2; r <= 8; r++) {
        for (let c = 0; c <= 8; c++) {
            let type = 'grass';
            if (r < 0 || (c >= 4 && c <= 6 && r === 0 && window.hqHasRoom('penthouse'))) {
                type = 'marble';
            } else if (c === 5 && r === 0) {
                type = 'concrete';
            } else if (c === 4 && r === 6) {
                type = 'parking';
            } else if ((c === 4 || c === 5) && (r === 4 || r === 5)) {
                type = 'concrete';
            } else if (c === 5 || r === 5) {
                type = 'road';
            }
            groundHtml += _hqGroundTile(c, r, type);
        }
    }

    // 3. Compile all buildings and parked cars for sorting (Painter's Algorithm)
    const renderItems = [];

    // Add building slots
    Object.keys(HQ_ROOM_COORDS).forEach(roomId => {
        const coords = HQ_ROOM_COORDS[roomId];
        const screen = _isoToScreen(coords.col, coords.row);
        const built = window.hqHasRoom(roomId);
        const state = _getRoomState(roomId);
        
        renderItems.push({
            type: 'building',
            id: roomId,
            col: coords.col,
            row: coords.row,
            x: screen.x,
            y: screen.y,
            built: built,
            state: state,
            sortKey: coords.col + coords.row
        });
    });

    // Add parked cars
    const parkedCars = _getParkedCars();
    parkedCars.forEach((car, index) => {
        const slot = PARKING_SLOTS[index];
        if (slot) {
            const screen = _isoToScreen(slot.col, slot.row);
            renderItems.push({
                type: 'car',
                id: car.id,
                col: slot.col,
                row: slot.row,
                x: screen.x,
                y: screen.y,
                car: car,
                sortKey: slot.col + slot.row
            });
        }
    });

    // Sort items by sortKey (col + row) ascending
    renderItems.sort((a, b) => a.sortKey - b.sortKey);

    // Render sorted items
    let objectsHtml = '';
    renderItems.forEach(item => {
        if (item.type === 'building') {
            const fn = window[`_bld_${item.id}`] || _bld_fallback;
            // Generate building markup
            let bldSvg = fn(item.x, item.y, item.built, item.state);
            // Apply bounce animation class on newly constructed building if built
            const isNew = window._hqJustBuiltRoom === item.id;
            if (isNew && item.built) {
                bldSvg = `<g class="hq-build-anim">${bldSvg}</g>`;
            }
            objectsHtml += bldSvg;
        } else if (item.type === 'car') {
            objectsHtml += _hqCarSVG(item.car, item.x, item.y);
        }
    });

    // Check if we should inject construction dust animation
    let dustHtml = '';
    if (window._hqJustBuiltRoom) {
        const coords = HQ_ROOM_COORDS[window._hqJustBuiltRoom];
        if (coords) {
            const screen = _isoToScreen(coords.col, coords.row);
            dustHtml = `
                <g class="hq-dust" transform="translate(${screen.x}, ${screen.y})">
                    <circle cx="-15" cy="0" r="10" fill="rgba(212,175,55,0.4)" />
                    <circle cx="15" cy="0" r="12" fill="rgba(212,175,55,0.4)" />
                    <circle cx="0" cy="-10" r="8" fill="rgba(212,175,55,0.3)" />
                    <circle cx="0" cy="10" r="14" fill="rgba(212,175,55,0.4)" />
                </g>
            `;
            // Reset state after rendering once
            setTimeout(() => {
                window._hqJustBuiltRoom = null;
            }, 800);
        }
    }

    return `
        <svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg">
            <!-- Background stars -->
            ${starsHtml}
            
            <!-- Ground Layout -->
            <g id="hq-ground-layer">
                ${groundHtml}
            </g>
            
            <!-- Buildings & Cars Layer (Sorted) -->
            <g id="hq-objects-layer">
                ${objectsHtml}
            </g>
            
            <!-- Construction dust overlay -->
            ${dustHtml}
        </svg>
    `;
}

// Fallback building renderer
function _bld_fallback(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'workshop', state);
    return _isoBox(cx, cy, 54, 54, 30, '#64748b', '#475569', '#334155');
}

// ── GET ROOM STATE HELPER ────────────────────────────────────────────────────
function _getRoomState(roomId) {
    if (window.hqHasRoom(roomId)) return 'built';
    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!room) return 'locked';
    const builtRooms = gameState.hqRooms || ['garage_main'];
    const unlocked = room.prereqs.every(p => builtRooms.includes(p));
    return unlocked ? 'available' : 'locked';
}

// ── STAGE BACKGROUND UPDATER ──────────────────────────────────────────────────
function _hqStageBackground(stage) {
    const campusDiv = document.getElementById('hq-campus');
    if (!campusDiv) return;
    
    let gradient = 'radial-gradient(ellipse at 50% 30%, #1a1f2e 0%, #0a0c12 100%)';
    if (stage === 0) {
        gradient = 'radial-gradient(ellipse at 50% 30%, #202b25 0%, #0b100d 100%)'; // dark earthy green
    } else if (stage === 1) {
        gradient = 'radial-gradient(ellipse at 50% 30%, #1a2230 0%, #0a0e14 100%)'; // deep blue slate
    } else if (stage === 2) {
        gradient = 'radial-gradient(ellipse at 50% 30%, #121622 0%, #06080d 100%)'; // mid night
    } else if (stage === 3) {
        gradient = 'radial-gradient(ellipse at 50% 30%, #0a0c12 0%, #020305 100%)'; // pitch black night
    }
    campusDiv.style.background = gradient;
}

// ── EXPORTED MAIN RENDER FUNCTION ────────────────────────────────────────────
window.renderHQCampus = function() {
    const parent = document.getElementById('hq-visual-placeholder');
    if (!parent) return;

    // Create container
    let container = document.getElementById('hq-campus-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'hq-campus-container';
        parent.appendChild(container);
    }

    const builtCount = gameState.hqRooms ? gameState.hqRooms.length : 1;
    const stage = _getHQStage(builtCount);

    // Injected HTML structure
    container.innerHTML = `
        <div id="hq-campus">
            ${_hqCampusHTML()}
            
            <!-- Side slide-in panel -->
            <div id="hq-info-panel"></div>
        </div>
    `;

    // Apply specific stage background
    _hqStageBackground(stage);
    
    // Close panel on clicking empty area
    const campusDiv = document.getElementById('hq-campus');
    if (campusDiv) {
        campusDiv.addEventListener('click', function(e) {
            if (e.target.id === 'hq-campus' || e.target.tagName === 'svg' || e.target.id === 'hq-ground-layer') {
                window.hqHideInfoPanel();
            }
        });
    }
};

// ── EVENT ACTIONS ─────────────────────────────────────────────────────────────

// Open the existing build modal
window.hqOpenBuildModalFromMap = function(roomId) {
    // In our map-based coordinates, the grid position doesn't limit where the building displays.
    // However, to maintain compatibility with hq.js hqBuildRoom/hqGrid system, we need to map
    // the room ID to a grid slot index.
    // Let's find an empty slot index in gameState.hqGrid
    if (!gameState.hqGrid) gameState.hqGrid = { 7: 'garage_main' };
    
    // We map roomId to a reasonable slot index or find the next available free index
    let freeSlot = -1;
    for (let i = 0; i < 15; i++) {
        if (!gameState.hqGrid[i]) {
            freeSlot = i;
            break;
        }
    }
    
    if (freeSlot !== -1) {
        // Trigger hqOpenBuildModal from hq.js
        window.hqOpenBuildModal(freeSlot);
        // Force the chosen build modal button to focus on this room, or directly purchase it
        // by wrapping it: we can override hqOpenBuildModal to render only this room,
        // or just let them choose since they clicked this slot!
        // The most user-friendly approach is to open the build modal for this slot.
    } else {
        if (typeof showNotification === 'function') showNotification('Tutti gli slot dell\'HQ sono occupati!', 'error');
    }
};

// Locked slots tooltip
window.hqShowLockedTooltip = function(roomId) {
    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!room) return;
    const reqNames = room.prereqs.map(p => {
        const pr = window.HQ_ROOMS.find(x => x.id === p);
        return pr ? pr.name : p;
    }).join(', ');
    
    if (typeof showNotification === 'function') {
        showNotification(`Stanza bloccata! Richiede: ${reqNames}`, 'orange');
    }
};

// Open info panel on built building click
window.hqShowInfoPanel = function(roomId) {
    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!room) return;

    const panel = document.getElementById('hq-info-panel');
    if (!panel) return;

    // Active effect conversion
    const fx = room.effect;
    let effectText = room.desc;
    
    panel.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
            <div class="text-sm font-bold text-white">${room.icon} ${room.name}</div>
            <button onclick="window.hqHideInfoPanel()" class="text-gray-400 hover:text-white text-md">✕</button>
        </div>
        <div class="text-[10px] text-gray-400 mb-4">${room.desc}</div>
        
        <div class="bg-white/5 border border-white/5 rounded-lg p-3 mb-4">
            <div class="text-[9px] text-gold font-bold uppercase mb-2">⚡ Effetto Attivo</div>
            <div class="text-xs text-white font-semibold">${Object.entries(fx).map(([k, v]) => {
                if (typeof v === 'boolean') return v ? 'Attivo' : 'Non attivo';
                if (k.endsWith('Mult')) return `×${v.toFixed(2)}`;
                return `+${v}`;
            }).join(', ')}</div>
        </div>
        
        <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-mono">Dettagli Edificio</div>
        <div class="space-y-1">
            <div class="hq-info-stat-row">
                <span class="text-gray-400">Score Prestigio:</span>
                <span class="text-gold font-bold font-mono">⭐ ${room.score}</span>
            </div>
            <div class="hq-info-stat-row">
                <span class="text-gray-400">Prerequisiti:</span>
                <span class="text-gray-200">${room.prereqs.length === 0 ? 'Nessuno' : room.prereqs.map(p => window.HQ_ROOMS.find(x => x.id === p)?.name.split(' ')[0]).join(', ')}</span>
            </div>
            <div class="hq-info-stat-row">
                <span class="text-gray-400">Stato:</span>
                <span class="text-green-400 font-semibold">Operativo</span>
            </div>
        </div>
    `;

    panel.classList.add('open');
};

// Close info panel
window.hqHideInfoPanel = function() {
    const panel = document.getElementById('hq-info-panel');
    if (panel) {
        panel.classList.remove('open');
    }
};

// Show details of a parked car
window.hqShowCarDetails = function(carId) {
    if (typeof openCarModal === 'function') {
        const car = gameState.fleet ? gameState.fleet.find(c => c.id === carId) : null;
        if (car) openCarModal(car);
    }
};

// Assign dynamic functions to draw building primitives
window._bld_garage_main = _bld_garage_main;
window._bld_workshop = _bld_workshop;
window._bld_ev_parking = _bld_ev_parking;
window._bld_gym = _bld_gym;
window._bld_canteen = _bld_canteen;
window._bld_infirmary = _bld_infirmary;
window._bld_mission_room = _bld_mission_room;
window._bld_it_center = _bld_it_center;
window._bld_rd_lab = _bld_rd_lab;
window._bld_control_tower = _bld_control_tower;
window._bld_security_bunker = _bld_security_bunker;
window._bld_vip_lounge = _bld_vip_lounge;
window._bld_helipad = _bld_helipad;
window._bld_crypto_vault = _bld_crypto_vault;
window._bld_penthouse = _bld_penthouse;
