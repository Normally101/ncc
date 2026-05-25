'use strict';
/* ================================================================
   hq-visual.js — Chauffeur Empire
   Visual Isometric Campus (SVG + Vanilla JS) — v2 REALISTIC
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

// ── STAGE CALCULATOR ─────────────────────────────────────────────────────────
function _getHQStage(builtCount) {
    if (builtCount >= 12) return 3;
    if (builtCount >= 8)  return 2;
    if (builtCount >= 4)  return 1;
    return 0;
}

// ── COLOR HELPERS ─────────────────────────────────────────────────────────────
function _hex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function _shade(hex, pct) { // pct: 0=black, 1=original, >1=lighter
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return _hex(r * pct, g * pct, b * pct);
}

// ── ISOMETRIC 3D BOX — Realistic face shading ────────────────────────────────
// topColor: the material color. Left face = 75%, right face = 55%
function _isoBox(x, y, w, d, h, topHex, topBrightness = 1.0) {
    const left  = _shade(topHex, topBrightness * 0.72);
    const right = _shade(topHex, topBrightness * 0.52);
    const top   = _shade(topHex, topBrightness);

    // Isometric diamond top face
    const tx = [x, x + w/2, x, x - w/2].join(',');
    const ty = [y - h, y - h + d/4, y - h + d/2, y - h + d/4].join(',');
    const topPts = `${x},${y - h} ${x + w/2},${y - h + d/4} ${x},${y - h + d/2} ${x - w/2},${y - h + d/4}`;
    const leftPts  = `${x - w/2},${y - h + d/4} ${x},${y - h + d/2} ${x},${y + d/2} ${x - w/2},${y + d/4}`;
    const rightPts = `${x + w/2},${y - h + d/4} ${x},${y - h + d/2} ${x},${y + d/2} ${x + w/2},${y + d/4}`;

    return `<polygon points="${topPts}" fill="${top}" />
            <polygon points="${leftPts}" fill="${left}" />
            <polygon points="${rightPts}" fill="${right}" />`;
}

// ── WINDOW GRID GENERATOR ─────────────────────────────────────────────────────
// Draws a grid of windows on the left or right face of an isometric building
// face: 'left' | 'right'
function _windowGrid(bx, by, w, d, h, face, cols, rows, winColor, skipMask = []) {
    const out = [];
    const cellW = (face === 'left') ? (w / 2) / cols : (w / 2) / cols;
    const cellH = h / rows;
    const stepX = face === 'left' ? -(w / 2) / cols : (w / 2) / cols;
    const baseY = by + d / 4; // bottom of top edge on that face

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (skipMask.includes(r * cols + c)) continue;
            // Random window lit/unlit — deterministic via seed
            const seed = (bx * 7 + by * 3 + r * 11 + c * 5) % 17;
            const lit = seed > 3; // ~76% lit
            const alpha = lit ? (0.75 + (seed % 4) * 0.06) : 0.12;

            // Position on the iso face
            // For left face: origin at bottom-left of top (x - w/2, y - h + d/4)
            // shift right by c cells, down by r cells
            let ox, oy;
            if (face === 'left') {
                const colRatio = (c + 0.15) / cols;
                const rowRatio = (r + 0.12) / rows;
                const colRatio2 = (c + 0.85) / cols;
                const rowRatio2 = (r + 0.88) / rows;
                // 4 corners of this window on the left face
                const face_tl_x = bx - w/2 + colRatio * w/2;
                const face_tl_y = (by - h + d/4) + colRatio * d/8 + rowRatio * h;
                const face_tr_x = bx - w/2 + colRatio2 * w/2;
                const face_tr_y = (by - h + d/4) + colRatio2 * d/8 + rowRatio * h;
                const face_br_x = bx - w/2 + colRatio2 * w/2;
                const face_br_y = (by - h + d/4) + colRatio2 * d/8 + rowRatio2 * h;
                const face_bl_x = bx - w/2 + colRatio * w/2;
                const face_bl_y = (by - h + d/4) + colRatio * d/8 + rowRatio2 * h;
                const pts = `${face_tl_x.toFixed(1)},${face_tl_y.toFixed(1)} ${face_tr_x.toFixed(1)},${face_tr_y.toFixed(1)} ${face_br_x.toFixed(1)},${face_br_y.toFixed(1)} ${face_bl_x.toFixed(1)},${face_bl_y.toFixed(1)}`;
                const glow = lit ? `filter="url(#winGlow)"` : '';
                out.push(`<polygon points="${pts}" fill="${winColor}" opacity="${alpha.toFixed(2)}" ${glow}/>`);
            } else {
                // Right face: origin at bottom-right of top (x + w/2, y - h + d/4)
                const colRatio  = (c + 0.15) / cols;
                const rowRatio  = (r + 0.12) / rows;
                const colRatio2 = (c + 0.85) / cols;
                const rowRatio2 = (r + 0.88) / rows;
                const face_tl_x = bx + w/2 - colRatio2 * w/2;
                const face_tl_y = (by - h + d/4) + colRatio2 * d/8 + rowRatio * h;
                const face_tr_x = bx + w/2 - colRatio * w/2;
                const face_tr_y = (by - h + d/4) + colRatio * d/8 + rowRatio * h;
                const face_br_x = bx + w/2 - colRatio * w/2;
                const face_br_y = (by - h + d/4) + colRatio * d/8 + rowRatio2 * h;
                const face_bl_x = bx + w/2 - colRatio2 * w/2;
                const face_bl_y = (by - h + d/4) + colRatio2 * d/8 + rowRatio2 * h;
                const pts = `${face_tl_x.toFixed(1)},${face_tl_y.toFixed(1)} ${face_tr_x.toFixed(1)},${face_tr_y.toFixed(1)} ${face_br_x.toFixed(1)},${face_br_y.toFixed(1)} ${face_bl_x.toFixed(1)},${face_bl_y.toFixed(1)}`;
                const glow = lit ? `filter="url(#winGlow)"` : '';
                out.push(`<polygon points="${pts}" fill="${winColor}" opacity="${alpha.toFixed(2)}" ${glow}/>`);
            }
        }
    }
    return out.join('');
}

// ── ROOM SIZE UTILITY ─────────────────────────────────────────────────────────
function _getRoomGridSize(roomId) {
    if (roomId === 'penthouse') return 3;
    if (roomId === 'garage_main') return 2;
    if (roomId === 'helipad' || roomId === 'ev_parking') return 1.5;
    return 1;
}

// ── ROOM COORDS ───────────────────────────────────────────────────────────────
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
    penthouse:       { col: 4.8, row: -1.0 }
};

const PARKING_SLOTS = [
    { col: 3.8, row: 6.0 }, { col: 4.5, row: 6.1 },
    { col: 3.8, row: 6.8 }, { col: 4.5, row: 6.9 },
    { col: 3.5, row: 4.2 }, { col: 3.5, row: 4.8 }
];

// ── SVG DEFS (filters, patterns) ─────────────────────────────────────────────
const SVG_DEFS = `
<defs>
  <filter id="winGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="1.5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="4" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="lampGlow">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
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
        return `<g class="hq-slot-available hq-slot-pulse" onclick="window.hqOpenBuildModalFromMap('${roomId}')" style="cursor:pointer">
            <polygon points="${pts}" fill="rgba(212,175,55,0.07)" stroke="rgba(212,175,55,0.6)" stroke-dasharray="5,4" stroke-width="1.5"/>
            <text x="${cx}" y="${cy + 4}" fill="#d4af37" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="bold">+</text>
            <text x="${cx}" y="${cy + 16}" fill="rgba(212,175,55,0.8)" font-size="7.5" font-family="'Montserrat',sans-serif" text-anchor="middle">${name}</text>
        </g>`;
    }
    return `<g class="hq-building-locked" onclick="window.hqShowLockedTooltip('${roomId}')" style="cursor:pointer">
        <polygon points="${pts}" fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,4" stroke-width="1"/>
        <text x="${cx}" y="${cy + 5}" fill="#334155" font-size="11" font-family="sans-serif" text-anchor="middle">🔒</text>
    </g>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BUILDING RENDERERS — each returns SVG string
// ═══════════════════════════════════════════════════════════════════════════════

function _bld_sprite(cx, cy, built, state, roomId, width, yOffset) {
    if (!built) return _emptySlot(cx, cy, roomId, state);
    const hw = width / 2;
    return `<g class="hq-building" id="bld-${roomId}" onclick="window.hqShowInfoPanel('${roomId}')">
        <image href="assets/buildings/${roomId}.png" x="${cx - hw}" y="${cy - yOffset}" width="${width}" height="${width}" preserveAspectRatio="xMidYMax meet" style="pointer-events: none;" />
    </g>`;
}

function _bld_garage_main(cx, cy, built, state) {
    return _bld_sprite(cx, cy, built, state, 'garage_main', 200, 160);
}

function _bld_workshop(cx, cy, built, state) {
    return _bld_sprite(cx, cy, built, state, 'workshop', 140, 120);
}

function _bld_ev_parking(cx, cy, built, state) {
    return _bld_sprite(cx, cy, built, state, 'ev_parking', 160, 100);
}

function _bld_gym(cx, cy, built, state) {
    return _bld_sprite(cx, cy, built, state, 'gym', 140, 130);
}

function _bld_canteen(cx, cy, built, state) {
    return _bld_sprite(cx, cy, built, state, 'canteen', 140, 120);
}

function _bld_infirmary(cx, cy, built, state) {
    return _bld_sprite(cx, cy, built, state, 'infirmary', 140, 120);
}

function _bld_mission_room(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'mission_room', state);
    const W = 58, D = 58, H = 56;
    const body = _isoBox(cx, cy, W, D, H, '#1e3a5f', 1.15);
    // Tactical screen glow on left face
    const screen = `<polygon points="${cx-W/2+4},${cy-H+D/4+12} ${cx-4},${cy-H+D/2+8} ${cx-4},${cy-H+D/2-18} ${cx-W/2+4},${cy-H+D/4-14}" fill="rgba(0,242,255,0.28)" stroke="#00f2ff" stroke-width="0.8"/>
                    <polygon points="${cx-W/2+6},${cy-H+D/4+8} ${cx-6},${cy-H+D/2+5} ${cx-6},${cy-H+D/2-14} ${cx-W/2+6},${cy-H+D/4-10}" fill="rgba(0,242,255,0.08)"/>`;
    // Scanline
    const scan = `<line x1="${cx-W/2+4}" y1="${cy-H+D/4}" x2="${cx-4}" y2="${cy-H+D/2}" stroke="rgba(0,242,255,0.5)" stroke-width="1.5" class="hq-sparkle"/>`;
    const winsR = _windowGrid(cx, cy, W, D, H, 'right', 2, 4, '#00f2ff');
    // Satellite dish
    const mast  = `<line x1="${cx+8}" y1="${cy-H-2}" x2="${cx+8}" y2="${cy-H-18}" stroke="#475569" stroke-width="2"/>`;
    const dish  = `<path d="M ${cx} ${cy-H-22} Q ${cx+8} ${cy-H-14} ${cx+16} ${cy-H-22}" fill="rgba(148,163,184,0.6)" stroke="#94a3b8" stroke-width="1.5"/>`;
    return `<g class="hq-building" id="bld-mission_room" onclick="window.hqShowInfoPanel('mission_room')">${body}${screen}${scan}${winsR}${mast}${dish}</g>`;
}

function _bld_it_center(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'it_center', state);
    const W = 58, D = 58, H = 46;
    const body = _isoBox(cx, cy, W, D, H, '#312e81', 1.1);
    const winsL = _windowGrid(cx, cy, W, D, H, 'left', 3, 4, '#a78bfa');
    const winsR = _windowGrid(cx, cy, W, D, H, 'right', 3, 4, '#a78bfa');
    // Server rack vents on right face
    const vents = `<line x1="${cx+4}" y1="${cy-H+D/4+20}" x2="${cx+W/2-4}" y2="${cy-H+D/4+12}" stroke="#4c1d95" stroke-width="1.5"/>
                   <line x1="${cx+4}" y1="${cy-H+D/4+26}" x2="${cx+W/2-4}" y2="${cy-H+D/4+18}" stroke="#4c1d95" stroke-width="1.5"/>
                   <line x1="${cx+4}" y1="${cy-H+D/4+32}" x2="${cx+W/2-4}" y2="${cy-H+D/4+24}" stroke="#4c1d95" stroke-width="1.5"/>`;
    // Large dish array on roof
    const mast  = `<line x1="${cx-6}" y1="${cy-H-2}" x2="${cx-6}" y2="${cy-H-16}" stroke="#64748b" stroke-width="2"/>
                   <line x1="${cx+6}" y1="${cy-H-2}" x2="${cx+6}" y2="${cy-H-12}" stroke="#64748b" stroke-width="1.5"/>`;
    const dish1 = `<path d="M ${cx-16} ${cy-H-22} Q ${cx-6} ${cy-H-12} ${cx+4} ${cy-H-22}" fill="rgba(148,163,184,0.5)" stroke="#94a3b8" stroke-width="1.5"/>`;
    return `<g class="hq-building" id="bld-it_center" onclick="window.hqShowInfoPanel('it_center')">${body}${winsL}${winsR}${vents}${mast}${dish1}</g>`;
}

function _bld_rd_lab(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'rd_lab', state);
    const W = 58, D = 58, H = 52;
    const body = _isoBox(cx, cy, W, D, H, '#14532d', 1.1);
    const winsL = _windowGrid(cx, cy, W, D, H, 'left', 2, 4, '#6ee7b7');
    const winsR = _windowGrid(cx, cy, W, D, H, 'right', 2, 4, '#6ee7b7');
    // Glass dome
    const dome  = `<path d="M ${cx-18} ${cy-H-2} A 18 10 0 0 1 ${cx+18} ${cy-H-2}" fill="rgba(16,185,129,0.22)" stroke="#10b981" stroke-width="1.5"/>
                   <path d="M ${cx-10} ${cy-H-8} A 10 6 0 0 1 ${cx+10} ${cy-H-8}" fill="rgba(16,185,129,0.15)" stroke="#34d399" stroke-width="1"/>`;
    // Dome glow
    const dGlow = `<ellipse cx="${cx}" cy="${cy-H-2}" rx="20" ry="6" fill="rgba(16,185,129,0.12)" filter="url(#lampGlow)"/>`;
    return `<g class="hq-building" id="bld-rd_lab" onclick="window.hqShowInfoPanel('rd_lab')">${body}${winsL}${winsR}${dome}${dGlow}</g>`;
}

function _bld_control_tower(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'control_tower', state);
    // Shaft
    const shaft = _isoBox(cx, cy, 32, 32, 90, '#334155', 1.1);
    // Cabin
    const cabin = _isoBox(cx, cy - 90, 52, 52, 20, '#1e3a5f', 1.2);
    // Cabin glass — both faces
    const glL = `<polygon points="${cx-26},${cy-90+52/4} ${cx},${cy-90+52/2} ${cx},${cy-90+52/2+20} ${cx-26},${cy-90+52/4+20}" fill="rgba(56,189,248,0.32)" stroke="rgba(125,211,252,0.5)" stroke-width="0.8"/>`;
    const glR = `<polygon points="${cx+26},${cy-90+52/4} ${cx},${cy-90+52/2} ${cx},${cy-90+52/2+20} ${cx+26},${cy-90+52/4+20}" fill="rgba(56,189,248,0.22)" stroke="rgba(125,211,252,0.4)" stroke-width="0.8"/>`;
    // Interior glow
    const intGlow = `<ellipse cx="${cx}" cy="${cy-90+52/2+10}" rx="16" ry="6" fill="rgba(56,189,248,0.2)" filter="url(#winGlow)"/>`;
    // Antenna
    const ant    = `<line x1="${cx}" y1="${cy-110}" x2="${cx}" y2="${cy-136}" stroke="#94a3b8" stroke-width="2"/>
                    <line x1="${cx-6}" y1="${cy-124}" x2="${cx+6}" y2="${cy-124}" stroke="#94a3b8" stroke-width="1.5"/>
                    <line x1="${cx-4}" y1="${cy-130}" x2="${cx+4}" y2="${cy-130}" stroke="#94a3b8" stroke-width="1"/>`;
    const beacon = `<circle cx="${cx}" cy="${cy-136}" r="3.5" fill="#ef4444" class="hq-sparkle" filter="url(#lampGlow)"/>`;
    return `<g class="hq-building" id="bld-control_tower" onclick="window.hqShowInfoPanel('control_tower')">${shaft}${cabin}${glL}${glR}${intGlow}${ant}${beacon}</g>`;
}

function _bld_security_bunker(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'security_bunker', state);
    const W = 58, D = 58, H = 28;
    const body = _isoBox(cx, cy, W, D, H, '#374151', 0.9);
    // Blast door (heavy steel)
    const door  = `<polygon points="${cx-10},${cy+D/4+12} ${cx+10},${cy+D/4+8} ${cx+10},${cy+D/4-4} ${cx-10},${cy+D/4}" fill="#1f2937" stroke="#111827" stroke-width="1"/>
                   <line x1="${cx-10}" y1="${cy+D/4+6}" x2="${cx+10}" y2="${cy+D/4+2}" stroke="#374151" stroke-width="1.5"/>`;
    // Slit windows (gun ports)
    const slit1 = `<polygon points="${cx-W/2+4},${cy-H+D/4+H*0.35} ${cx-W/2+14},${cy-H+D/4+H*0.35+3} ${cx-W/2+14},${cy-H+D/4+H*0.35+1} ${cx-W/2+4},${cy-H+D/4+H*0.35-2}" fill="#f59e0b" opacity="0.8"/>`;
    const slit2 = `<polygon points="${cx-W/2+4},${cy-H+D/4+H*0.55} ${cx-W/2+14},${cy-H+D/4+H*0.55+3} ${cx-W/2+14},${cy-H+D/4+H*0.55+1} ${cx-W/2+4},${cy-H+D/4+H*0.55-2}" fill="#f59e0b" opacity="0.8"/>`;
    // Camera mount
    const cam   = `<circle cx="${cx+W/2-6}" cy="${cy-H+D/4+8}" r="3" fill="#111827" stroke="#374151"/>
                   <line x1="${cx+W/2-6}" y1="${cy-H+D/4+8}" x2="${cx+W/2+2}" y2="${cy-H+D/4+4}" stroke="#374151" stroke-width="1.5"/>`;
    // Barbed wire on roof
    const wire  = `<path d="M ${cx-W/2} ${cy-H} L ${cx+W/2} ${cy-H}" stroke="#6b7280" stroke-width="1" stroke-dasharray="3,2"/>`;
    return `<g class="hq-building" id="bld-security_bunker" onclick="window.hqShowInfoPanel('security_bunker')">${body}${door}${slit1}${slit2}${cam}${wire}</g>`;
}

function _bld_vip_lounge(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'vip_lounge', state);
    const W = 62, D = 62, H = 50;
    const body = _isoBox(cx, cy, W, D, H, '#78502a', 1.05);
    // Gold curtain-wall on both faces
    const cwL = `<polygon points="${cx-W/2},${cy-H+D/4} ${cx},${cy-H+D/2} ${cx},${cy+D/2} ${cx-W/2},${cy+D/4}" fill="rgba(212,175,55,0.10)" stroke="rgba(212,175,55,0.35)" stroke-width="0.8"/>`;
    const cwR = `<polygon points="${cx+W/2},${cy-H+D/4} ${cx},${cy-H+D/2} ${cx},${cy+D/2} ${cx+W/2},${cy+D/4}" fill="rgba(212,175,55,0.07)" stroke="rgba(212,175,55,0.25)" stroke-width="0.8"/>`;
    const winsL = _windowGrid(cx, cy, W, D, H, 'left', 3, 4, '#fbbf24');
    const winsR = _windowGrid(cx, cy, W, D, H, 'right', 3, 4, '#fbbf24');
    // Gold columns
    const colL = `<line x1="${cx-W/2}" y1="${cy-H+D/4}" x2="${cx-W/2}" y2="${cy+D/4}" stroke="#d4af37" stroke-width="2.5"/>`;
    const colR = `<line x1="${cx+W/2}" y1="${cy-H+D/4}" x2="${cx+W/2}" y2="${cy+D/4}" stroke="#b8922e" stroke-width="2.5"/>`;
    // Rooftop terrace railing
    const rail  = `<path d="M ${cx-W/2} ${cy-H} L ${cx} ${cy-H+D/2} L ${cx+W/2} ${cy-H}" fill="none" stroke="rgba(212,175,55,0.6)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    // Gold ambient glow
    const amb   = `<ellipse cx="${cx}" cy="${cy+D/4+4}" rx="32" ry="8" fill="rgba(212,175,55,0.06)" filter="url(#lampGlow)"/>`;
    return `<g class="hq-building" id="bld-vip_lounge" onclick="window.hqShowInfoPanel('vip_lounge')">${body}${cwL}${cwR}${winsL}${winsR}${colL}${colR}${rail}${amb}</g>`;
}

function _bld_helipad(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'helipad', state);
    const W = 88, D = 88, H = 6;
    const pad = _isoBox(cx, cy, W, D, H, '#1a1a1a', 1.1);
    // Yellow safety ring
    const ring = `<ellipse cx="${cx}" cy="${cy-H+D/4+3}" rx="${W*0.38}" ry="${D/4*0.38}" fill="none" stroke="#eab308" stroke-width="2.5" stroke-dasharray="8,5"/>`;
    // H marking on top face
    const hMark = `
        <line x1="${cx-12}" y1="${cy-H-6}" x2="${cx-12}" y2="${cy-H+8}" stroke="#d4af37" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="${cx+12}" y1="${cy-H-6}" x2="${cx+12}" y2="${cy-H+8}" stroke="#d4af37" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="${cx-12}" y1="${cy-H+1}" x2="${cx+12}" y2="${cy-H+1}" stroke="#d4af37" stroke-width="3.5" stroke-linecap="round"/>`;
    // Corner beacons
    const b = (bx, by) => `<circle cx="${bx}" cy="${by}" r="2.5" fill="#ef4444" class="hq-sparkle" filter="url(#lampGlow)"/>`;
    const beacons = b(cx-38, cy-H+D/4-8) + b(cx+38, cy-H+D/4-8) + b(cx-38, cy-H+D/4+D/4+8) + b(cx+38, cy-H+D/4+D/4+8);
    return `<g class="hq-building" id="bld-helipad" onclick="window.hqShowInfoPanel('helipad')">${pad}${ring}${hMark}${beacons}</g>`;
}

function _bld_crypto_vault(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'crypto_vault', state);
    const W = 58, D = 58, H = 40;
    const body = _isoBox(cx, cy, W, D, H, '#0f172a', 1.3);
    // Gold cladding stripes on top
    const cl1 = `<polygon points="${cx-W/2},${cy-H} ${cx},${cy-H+D/2} ${cx+W/2},${cy-H}" fill="none" stroke="rgba(212,175,55,0.5)" stroke-width="1"/>`;
    const cl2 = `<polygon points="${cx-W/4},${cy-H+D/4} ${cx},${cy-H+D/2} ${cx+W/4},${cy-H+D/4}" fill="rgba(212,175,55,0.08)"/>`;
    // Vault door on right face
    const vaultDoor = `<circle cx="${cx+W/4+2}" cy="${cy-H+D/4+H*0.5+4}" r="12" fill="#1e293b" stroke="#d4af37" stroke-width="2"/>
                       <circle cx="${cx+W/4+2}" cy="${cy-H+D/4+H*0.5+4}" r="8" fill="#0f172a" stroke="#b8922e" stroke-width="1.5"/>
                       <line x1="${cx+W/4+2}" y1="${cy-H+D/4+H*0.5+4}" x2="${cx+W/4+10}" y2="${cy-H+D/4+H*0.5-2}" stroke="#d4af37" stroke-width="2"/>`;
    // BTC symbol on left face
    const btc = `<text x="${cx-W/4-2}" y="${cy-H+D/4+H*0.55}" fill="rgba(212,175,55,0.5)" font-size="14" font-family="sans-serif" text-anchor="middle">₿</text>`;
    return `<g class="hq-building" id="bld-crypto_vault" onclick="window.hqShowInfoPanel('crypto_vault')">${body}${cl1}${cl2}${vaultDoor}${btc}</g>`;
}

function _bld_penthouse(cx, cy, built, state) {
    if (!built) return _emptySlot(cx, cy, 'penthouse', state);
    // Base podium
    const base = _isoBox(cx, cy, 118, 118, 32, '#1e293b', 1.05);
    // Mid floor setback
    const mid  = _isoBox(cx, cy - 32, 90, 90, 28, '#243048', 1.1);
    // Upper penthouse floor
    const top  = _isoBox(cx, cy - 60, 64, 64, 30, '#2d3e5c', 1.2);
    // Floor-to-ceiling glass on both floors
    const gwL1 = `<polygon points="${cx-45},${cy-32+90/4} ${cx},${cy-32+90/2} ${cx},${cy-32+90/2+28} ${cx-45},${cy-32+90/4+28}" fill="rgba(186,230,253,0.13)" stroke="rgba(186,230,253,0.3)" stroke-width="0.8"/>`;
    const gwR1 = `<polygon points="${cx+45},${cy-32+90/4} ${cx},${cy-32+90/2} ${cx},${cy-32+90/2+28} ${cx+45},${cy-32+90/4+28}" fill="rgba(186,230,253,0.09)" stroke="rgba(186,230,253,0.22)" stroke-width="0.8"/>`;
    const gwL2 = `<polygon points="${cx-32},${cy-60+64/4} ${cx},${cy-60+64/2} ${cx},${cy-60+64/2+30} ${cx-32},${cy-60+64/4+30}" fill="rgba(212,175,55,0.12)" stroke="rgba(212,175,55,0.4)" stroke-width="0.8"/>`;
    const gwR2 = `<polygon points="${cx+32},${cy-60+64/4} ${cx},${cy-60+64/2} ${cx},${cy-60+64/2+30} ${cx+32},${cy-60+64/4+30}" fill="rgba(212,175,55,0.09)" stroke="rgba(212,175,55,0.3)" stroke-width="0.8"/>`;
    const winsB = _windowGrid(cx, cy - 32, 90, 90, 28, 'left', 4, 3, '#bae6fd');
    const winsBR = _windowGrid(cx, cy - 32, 90, 90, 28, 'right', 4, 3, '#bae6fd');
    const winsT = _windowGrid(cx, cy - 60, 64, 64, 30, 'left', 3, 3, '#fde68a');
    const winsTR = _windowGrid(cx, cy - 60, 64, 64, 30, 'right', 3, 3, '#fde68a');
    // Gold spires with globe tops
    const spL = `<line x1="${cx-22}" y1="${cy-90}" x2="${cx-22}" y2="${cy-128}" stroke="#d4af37" stroke-width="2.5"/>
                 <circle cx="${cx-22}" cy="${cy-128}" r="4" fill="#f59e0b" filter="url(#lampGlow)"/>`;
    const spR = `<line x1="${cx+22}" y1="${cy-90}" x2="${cx+22}" y2="${cy-122}" stroke="#d4af37" stroke-width="2.5"/>
                 <circle cx="${cx+22}" cy="${cy-122}" r="4" fill="#f59e0b" filter="url(#lampGlow)"/>`;
    // Rooftop terrace pool (light teal rectangle on top face)
    const pool = `<polygon points="${cx-12},${cy-93} ${cx+6},${cy-89} ${cx+6},${cy-83} ${cx-12},${cy-87}" fill="rgba(34,211,238,0.4)" stroke="#06b6d4" stroke-width="1"/>`;
    // Spotlights for Stage 3
    const totalBuilt = (gameState && gameState.hqRooms) ? gameState.hqRooms.length : 1;
    let spots = '';
    if (totalBuilt >= 11) {
        spots = `<line x1="${cx-28}" y1="${cy-90}" x2="${cx-180}" y2="${cy-520}" stroke="rgba(212,175,55,0.25)" stroke-width="8" class="hq-spotlight"/>
                 <line x1="${cx+28}" y1="${cy-90}" x2="${cx+180}" y2="${cy-520}" stroke="rgba(212,175,55,0.25)" stroke-width="8" class="hq-spotlight"/>`;
    }
    // Ambient gold glow at base
    const amb = `<ellipse cx="${cx}" cy="${cy+32/2}" rx="60" ry="14" fill="rgba(212,175,55,0.05)" filter="url(#lampGlow)"/>`;
    return `<g class="hq-building" id="bld-penthouse" onclick="window.hqShowInfoPanel('penthouse')">${spots}${base}${mid}${top}${gwL1}${gwR1}${gwL2}${gwR2}${winsB}${winsBR}${winsT}${winsTR}${spL}${spR}${pool}${amb}</g>`;
}

// ── PARKED CARS ───────────────────────────────────────────────────────────────
function _getParkedCars() {
    if (!gameState || !gameState.fleet) return [];
    return gameState.fleet.filter(car => {
        const driver = gameState.drivers ? gameState.drivers.find(d => d.assignedCar === car.id) : null;
        return !driver || driver.status === 'idle' || driver.status === 'resting' || driver.status === 'offline';
    }).slice(0, 6);
}

function _hqCarSVG(car, cx, cy) {
    const col = car.color || '#c0a020';
    // Body
    const bodyTop   = col;
    const bodyLeft  = _shade(col, 0.72);
    const bodyRight = _shade(col, 0.52);
    // Chassis (flat dark base)
    const chassis = _isoBox(cx, cy + 2, 26, 40, 4, '#18181b', 0.9);
    // Main body
    const body    = _isoBox(cx, cy, 26, 40, 8, col, 1.0);
    // Cabin setback
    const cabin   = _isoBox(cx, cy - 8, 18, 24, 7, '#0f172a', 1.05);
    // Windshield tint
    const wshield = `<polygon points="${cx-9},${cy-11} ${cx},${cy-7} ${cx},${cy-15} ${cx-9},${cy-19}" fill="rgba(147,210,255,0.35)" stroke="rgba(147,210,255,0.4)" stroke-width="0.5"/>`;
    // Headlights
    const hl1 = `<circle cx="${cx-8}" cy="${cy+10}" r="2" fill="#fef9c3" class="hq-sparkle"/>`;
    const hl2 = `<circle cx="${cx+8}" cy="${cy+10}" r="2" fill="#fef9c3" class="hq-sparkle"/>`;
    const brand = CE_Sec.escHtml((car.brand || '').slice(0, 12));
    return `<g class="hq-car" data-car-id="${car.id}" title="${brand}" onclick="event.stopPropagation(); window.hqShowCarDetails('${car.id}')">${chassis}${body}${cabin}${wshield}${hl1}${hl2}</g>`;
}

// ── GROUND TILES ──────────────────────────────────────────────────────────────
function _hqGroundTile(col, row, type) {
    const s = _isoToScreen(col, row);
    const cx = s.x, cy = s.y;
    const hw = ISO_TILE_W / 2, hh = ISO_TILE_H / 2;
    const pts = `${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`;

    let fill = '#162118', stroke = 'rgba(255,255,255,0.015)', sw = '0.5';
    if (type === 'road')     { fill = '#1c1f28'; stroke = 'rgba(255,255,255,0.04)'; }
    if (type === 'concrete') { fill = '#252b36'; stroke = 'rgba(255,255,255,0.05)'; }
    if (type === 'parking')  { fill = '#162520'; stroke = '#10b98155'; }
    if (type === 'marble')   { fill = '#0e1320'; stroke = 'rgba(212,175,55,0.14)'; }

    let extras = '';
    // Road markings
    if (type === 'road' && (col % 2 === 0)) {
        extras = `<line x1="${cx-4}" y1="${cy}" x2="${cx+4}" y2="${cy}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
    }
    // Parking lot lines
    if (type === 'parking') {
        extras = `<line x1="${cx-hw+6}" y1="${cy}" x2="${cx}" y2="${cy+hh-4}" stroke="rgba(16,185,129,0.3)" stroke-width="1"/>
                  <line x1="${cx}" y1="${cy-hh+4}" x2="${cx+hw-6}" y2="${cy}" stroke="rgba(16,185,129,0.3)" stroke-width="1"/>`;
    }

    return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>${extras}`;
}

// ── GROUND GRID ───────────────────────────────────────────────────────────────
function _hqGroundGrid() {
    let html = '';
    const evBuilt = window.hqHasRoom ? window.hqHasRoom('ev_parking') : false;
    const pBuilt  = window.hqHasRoom ? window.hqHasRoom('penthouse') : false;
    for (let r = -2; r <= 9; r++) {
        for (let c = -1; c <= 10; c++) {
            let type = 'grass';
            if (r < 0)                                   type = pBuilt ? 'marble' : 'concrete';
            else if (c === 5 || r === 5)                 type = 'road';
            else if ((c === 4 || c === 5) && r >= 4 && r <= 5) type = 'concrete';
            else if (c >= 4 && c <= 5 && r >= 6 && evBuilt) type = 'parking';
            html += _hqGroundTile(c, r, type);
        }
    }
    return html;
}

// ── ROOM STATE ────────────────────────────────────────────────────────────────
function _getRoomState(roomId) {
    if (window.hqHasRoom && window.hqHasRoom(roomId)) return 'built';
    const room = window.HQ_ROOMS ? window.HQ_ROOMS.find(r => r.id === roomId) : null;
    if (!room) return 'locked';
    const builtRooms = (gameState && gameState.hqRooms) || ['garage_main'];
    return room.prereqs.every(p => builtRooms.includes(p)) ? 'available' : 'locked';
}

// ── STREET LAMPS ──────────────────────────────────────────────────────────────
function _streetLamps() {
    const positions = [
        { col: 2.5, row: 5.5 }, { col: 5.5, row: 2.5 },
        { col: 5.5, row: 5.5 }, { col: 7.5, row: 5.5 }
    ];
    return positions.map(p => {
        const s = _isoToScreen(p.col, p.row);
        const x = s.x, y = s.y;
        return `<g>
            <line x1="${x}" y1="${y}" x2="${x}" y2="${y-32}" stroke="#64748b" stroke-width="1.5"/>
            <line x1="${x}" y1="${y-32}" x2="${x+10}" y2="${y-28}" stroke="#64748b" stroke-width="1.5"/>
            <circle cx="${x+10}" cy="${y-28}" r="2.5" fill="#fde68a"/>
            <ellipse cx="${x+10}" cy="${y-24}" rx="10" ry="6" fill="rgba(253,230,138,0.12)" filter="url(#lampGlow)"/>
        </g>`;
    }).join('');
}

// ── BACKGROUND STARS ─────────────────────────────────────────────────────────
function _stars(stage) {
    if (stage < 2) return '';
    let out = '';
    for (let i = 0; i < 40; i++) {
        const sx  = (i * 43 + 71) % 900;
        const sy  = (i * 17 + 29) % 160;
        const sz  = 0.8 + (i % 3) * 0.6;
        const op  = 0.15 + (i % 6) * 0.1;
        out += `<circle cx="${sx}" cy="${sy}" r="${sz}" fill="#ffffff" opacity="${op.toFixed(2)}" class="hq-sparkle"/>`;
    }
    return out;
}

// ── MAIN CAMPUS HTML ──────────────────────────────────────────────────────────
function _hqCampusHTML() {
    const builtCount = (gameState && gameState.hqRooms) ? gameState.hqRooms.length : 1;
    const stage      = _getHQStage(builtCount);

    const ground  = _hqGroundGrid();
    const lamps   = _streetLamps();
    const starBg  = _stars(stage);

    // Collect & sort by painter's algorithm
    const items = [];
    Object.keys(HQ_ROOM_COORDS).forEach(roomId => {
        const coords = HQ_ROOM_COORDS[roomId];
        const screen = _isoToScreen(coords.col, coords.row);
        items.push({
            type: 'building', id: roomId,
            x: screen.x, y: screen.y,
            built: window.hqHasRoom ? window.hqHasRoom(roomId) : false,
            state: _getRoomState(roomId),
            sortKey: coords.col + coords.row
        });
    });
    const parkedCars = _getParkedCars();
    parkedCars.forEach((car, i) => {
        const slot   = PARKING_SLOTS[i];
        if (!slot) return;
        const screen = _isoToScreen(slot.col, slot.row);
        items.push({ type: 'car', car, x: screen.x, y: screen.y, sortKey: slot.col + slot.row });
    });
    items.sort((a, b) => a.sortKey - b.sortKey);

    let objects = '';
    const bldFns = {
        garage_main: _bld_garage_main, workshop: _bld_workshop, ev_parking: _bld_ev_parking,
        gym: _bld_gym, canteen: _bld_canteen, infirmary: _bld_infirmary,
        mission_room: _bld_mission_room, it_center: _bld_it_center, rd_lab: _bld_rd_lab,
        control_tower: _bld_control_tower, security_bunker: _bld_security_bunker,
        vip_lounge: _bld_vip_lounge, helipad: _bld_helipad,
        crypto_vault: _bld_crypto_vault, penthouse: _bld_penthouse
    };
    items.forEach(item => {
        if (item.type === 'building') {
            const fn  = bldFns[item.id] || (() => '');
            let svg   = fn(item.x, item.y, item.built, item.state);
            if (window._hqJustBuiltRoom === item.id && item.built) {
                svg = `<g class="hq-build-anim">${svg}</g>`;
            }
            objects += svg;
        } else {
            objects += _hqCarSVG(item.car, item.x, item.y);
        }
    });

    // Dust for newly built
    let dust = '';
    if (window._hqJustBuiltRoom && HQ_ROOM_COORDS[window._hqJustBuiltRoom]) {
        const sc = _isoToScreen(HQ_ROOM_COORDS[window._hqJustBuiltRoom].col, HQ_ROOM_COORDS[window._hqJustBuiltRoom].row);
        dust = `<g class="hq-dust" transform="translate(${sc.x},${sc.y})">
            <circle cx="-18" cy="0" r="12" fill="rgba(212,175,55,0.35)"/>
            <circle cx="18" cy="0" r="14" fill="rgba(212,175,55,0.35)"/>
            <circle cx="0" cy="-12" r="10" fill="rgba(212,175,55,0.25)"/>
        </g>`;
        setTimeout(() => { window._hqJustBuiltRoom = null; }, 800);
    }

    return `<svg viewBox="0 0 900 560" xmlns="http://www.w3.org/2000/svg">
        ${SVG_DEFS}
        <!-- Sky -->
        <rect width="900" height="560" fill="transparent"/>
        ${starBg}
        <!-- Ground -->
        <g id="hq-ground-layer">${ground}</g>
        <!-- Street lamps -->
        ${lamps}
        <!-- Buildings & Cars -->
        <g id="hq-objects-layer">${objects}</g>
        <!-- Dust FX -->
        ${dust}
    </svg>`;
}

// ── STAGE BACKGROUND ──────────────────────────────────────────────────────────
function _hqStageBackground(stage) {
    const el = document.getElementById('hq-campus');
    if (!el) return;
    const gradients = [
        'radial-gradient(ellipse at 50% 20%, #1a2e20 0%, #0a120c 100%)',
        'radial-gradient(ellipse at 50% 20%, #162035 0%, #080e18 100%)',
        'radial-gradient(ellipse at 50% 20%, #0e1422 0%, #040608 100%)',
        'radial-gradient(ellipse at 50% 15%, #08090f 0%, #020204 100%)',
    ];
    el.style.background = gradients[stage] || gradients[0];
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
window.renderHQCampus = function() {
    const parent = document.getElementById('hq-visual-placeholder');
    if (!parent) return;

    let container = document.getElementById('hq-campus-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'hq-campus-container';
        parent.appendChild(container);
    }

    const builtCount = (gameState && gameState.hqRooms) ? gameState.hqRooms.length : 1;
    const stage      = _getHQStage(builtCount);

    container.innerHTML = `<div id="hq-campus">${_hqCampusHTML()}<div id="hq-info-panel"></div></div>`;
    _hqStageBackground(stage);

    const campusDiv = document.getElementById('hq-campus');
    if (campusDiv) {
        campusDiv.addEventListener('click', e => {
            if (['hq-campus', 'hq-ground-layer'].includes(e.target.id) || e.target.tagName === 'svg') {
                window.hqHideInfoPanel();
            }
        });
    }
};

// ── EVENT HANDLERS ────────────────────────────────────────────────────────────
window.hqOpenBuildModalFromMap = function(roomId) {
    if (!gameState.hqGrid) gameState.hqGrid = { 7: 'garage_main' };
    let freeSlot = -1;
    for (let i = 0; i < 15; i++) { if (!gameState.hqGrid[i]) { freeSlot = i; break; } }
    if (freeSlot !== -1) window.hqOpenBuildModal(freeSlot);
    else if (typeof showNotification === 'function') showNotification('Tutti gli slot sono occupati!', 'error');
};

window.hqShowLockedTooltip = function(roomId) {
    const room = window.HQ_ROOMS ? window.HQ_ROOMS.find(r => r.id === roomId) : null;
    if (!room) return;
    const reqs = room.prereqs.map(p => window.HQ_ROOMS.find(x => x.id === p)?.name || p).join(', ');
    if (typeof showNotification === 'function') showNotification(`🔒 Richiede: ${reqs || 'prerequisiti'}`, 'orange');
};

window.hqShowInfoPanel = function(roomId) {
    const room  = window.HQ_ROOMS ? window.HQ_ROOMS.find(r => r.id === roomId) : null;
    const panel = document.getElementById('hq-info-panel');
    if (!room || !panel) return;
    const fx = room.effect || {};
    const fxLines = Object.entries(fx).map(([k, v]) => {
        if (typeof v === 'boolean') return v ? `<div class="hq-info-stat-row"><span class="text-gray-400">${k}</span><span class="text-green-400">Attivo</span></div>` : '';
        const label = k.endsWith('Mult') ? `×${v.toFixed(2)}` : `+${v}`;
        return `<div class="hq-info-stat-row"><span class="text-gray-400">${k.replace(/([A-Z])/g,' $1').trim()}</span><span class="text-gold font-mono font-bold">${label}</span></div>`;
    }).join('');
    panel.innerHTML = `
        <div class="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
            <div class="text-sm font-bold text-white">${room.icon} ${room.name}</div>
            <button onclick="window.hqHideInfoPanel()" class="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div class="text-[10px] text-gray-400 mb-4 leading-relaxed">${room.desc}</div>
        <div class="bg-white/4 rounded-lg p-3 mb-3">
            <div class="text-[9px] text-gold font-bold uppercase tracking-widest mb-2">⚡ Effetti</div>
            ${fxLines}
        </div>
        <div class="hq-info-stat-row"><span class="text-gray-400">Prestigio</span><span class="text-gold font-mono font-bold">⭐ ${room.score}</span></div>
        <div class="hq-info-stat-row"><span class="text-gray-400">Stato</span><span class="text-green-400 font-semibold">Operativo ✓</span></div>`;
    panel.classList.add('open');
};

window.hqHideInfoPanel = function() {
    const p = document.getElementById('hq-info-panel');
    if (p) p.classList.remove('open');
};

window.hqShowCarDetails = function(carId) {
    const car = gameState.fleet ? gameState.fleet.find(c => c.id === carId) : null;
    if (car && typeof openCarModal === 'function') openCarModal(car);
};
