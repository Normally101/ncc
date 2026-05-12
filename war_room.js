'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   war_room.js — Chauffeur Empire · War Room (eRepublik-style full-screen map)
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── SVG REGION PATHS ────────────────────────────────────────────────────────
const _WR_PATHS = {
    reg_vda:        'M18,88 L58,72 L70,78 L65,100 L36,106 Z',
    reg_piemonte:   'M6,72 L18,88 L36,106 L65,100 L70,78 L58,72 L108,58 L130,78 L136,112 L116,158 L95,205 L64,220 L36,215 L10,188 Z',
    reg_lombardia:  'M108,58 L148,35 L195,35 L240,58 L255,92 L235,125 L198,130 L158,128 L138,112 L136,112 L130,78 Z',
    reg_trentino:   'M195,35 L222,12 L268,8 L282,35 L268,60 L240,68 L240,58 Z',
    reg_veneto:     'M240,68 L268,60 L282,35 L318,38 L350,52 L352,90 L326,118 L285,140 L255,138 L235,125 L255,92 Z',
    reg_fvg:        'M350,52 L378,40 L408,48 L410,82 L392,112 L358,118 L348,95 L352,90 Z',
    reg_liguria:    'M46,218 L64,220 L95,205 L116,162 L150,162 L182,202 L178,220 L148,235 L95,240 L50,228 Z',
    reg_emilia:     'M116,162 L136,112 L158,128 L198,130 L235,125 L255,138 L285,140 L326,118 L352,135 L358,180 L320,215 L258,228 L198,228 L150,218 L150,162 Z',
    reg_toscana:    'M50,228 L95,240 L148,235 L178,220 L198,228 L258,228 L262,248 L255,285 L232,332 L205,360 L165,375 L122,365 L95,338 L85,295 L92,250 Z',
    reg_marche:     'M258,228 L285,210 L320,215 L358,228 L355,268 L328,292 L295,302 L268,288 L258,252 Z',
    reg_umbria:     'M198,240 L258,240 L268,262 L295,285 L288,308 L262,318 L230,312 L212,292 L202,268 Z',
    reg_lazio:      'M135,350 L165,332 L212,318 L238,318 L262,318 L292,325 L298,352 L278,382 L240,398 L200,402 L162,398 L138,375 Z',
    reg_abruzzo:    'M282,208 L328,200 L385,208 L390,248 L375,272 L360,292 L328,300 L298,288 L285,258 L268,245 Z',
    reg_molise:     'M305,298 L340,292 L375,298 L372,332 L342,338 L312,332 Z',
    reg_campania:   'M200,402 L240,398 L270,402 L305,405 L338,402 L372,408 L378,438 L360,462 L320,478 L280,480 L240,475 L210,458 L188,440 Z',
    reg_puglia:     'M340,338 L375,322 L392,248 L420,242 L448,252 L475,272 L488,308 L488,350 L478,388 L465,422 L452,455 L440,482 L418,498 L395,498 L378,472 L388,445 L375,432 L372,408 L372,378 L342,370 Z',
    reg_basilicata: 'M280,475 L322,472 L362,465 L392,478 L390,512 L360,528 L320,532 L285,518 Z',
    reg_calabria:   'M285,515 L322,530 L360,528 L388,532 L382,562 L368,592 L348,618 L312,628 L285,618 L268,582 L270,552 Z',
    reg_sicilia:    'M175,648 L215,632 L258,620 L315,618 L362,622 L385,642 L365,662 L308,672 L252,672 L200,662 Z',
    reg_sardegna:   'M95,392 L148,398 L162,422 L160,460 L165,492 L150,532 L125,558 L88,558 L68,530 L62,492 L75,455 L70,422 Z',
};

const _WR_META = [
    { id:'reg_vda',        name:"Valle d'Aosta", cx:38,  cy:90  },
    { id:'reg_piemonte',   name:'Piemonte',       cx:58,  cy:152 },
    { id:'reg_lombardia',  name:'Lombardia',      cx:182, cy:92  },
    { id:'reg_trentino',   name:'Trentino',       cx:238, cy:40  },
    { id:'reg_veneto',     name:'Veneto',         cx:295, cy:108 },
    { id:'reg_fvg',        name:'Friuli V.G.',    cx:378, cy:88  },
    { id:'reg_liguria',    name:'Liguria',        cx:118, cy:215 },
    { id:'reg_emilia',     name:'Emilia-Romagna', cx:238, cy:182 },
    { id:'reg_toscana',    name:'Toscana',        cx:162, cy:298 },
    { id:'reg_marche',     name:'Marche',         cx:308, cy:258 },
    { id:'reg_umbria',     name:'Umbria',         cx:245, cy:278 },
    { id:'reg_lazio',      name:'Lazio',          cx:218, cy:358 },
    { id:'reg_abruzzo',    name:'Abruzzo',        cx:328, cy:255 },
    { id:'reg_molise',     name:'Molise',         cx:338, cy:315 },
    { id:'reg_campania',   name:'Campania',       cx:282, cy:442 },
    { id:'reg_puglia',     name:'Puglia',         cx:415, cy:405 },
    { id:'reg_basilicata', name:'Basilicata',     cx:335, cy:498 },
    { id:'reg_calabria',   name:'Calabria',       cx:318, cy:568 },
    { id:'reg_sicilia',    name:'Sicilia',        cx:278, cy:645 },
    { id:'reg_sardegna',   name:'Sardegna',       cx:112, cy:470 },
];

const _WR_NAME_TO_SVG = {
    'Piemonte':             'reg_piemonte',
    "Valle d'Aosta":        'reg_vda',
    'Lombardia':            'reg_lombardia',
    'Trentino-Alto Adige':  'reg_trentino',
    'Veneto':               'reg_veneto',
    'Friuli-Venezia Giulia':'reg_fvg',
    'Liguria':              'reg_liguria',
    'Emilia-Romagna':       'reg_emilia',
    'Toscana':              'reg_toscana',
    'Marche':               'reg_marche',
    'Umbria':               'reg_umbria',
    'Lazio':                'reg_lazio',
    'Abruzzo':              'reg_abruzzo',
    'Molise':               'reg_molise',
    'Campania':             'reg_campania',
    'Puglia':               'reg_puglia',
    'Basilicata':           'reg_basilicata',
    'Calabria':             'reg_calabria',
    'Sicilia':              'reg_sicilia',
    'Sardegna':             'reg_sardegna',
};

// ─── Base political-map palette (neutral state) ─────────────────────────────
const _WR_BASE = {
    reg_vda:        '#7A5C2E',
    reg_piemonte:   '#B87030',
    reg_lombardia:  '#3A70B8',
    reg_trentino:   '#4A8AAA',
    reg_veneto:     '#6A4EA8',
    reg_fvg:        '#2E8860',
    reg_liguria:    '#A83838',
    reg_emilia:     '#B88020',
    reg_toscana:    '#4A8048',
    reg_marche:     '#3A68A0',
    reg_umbria:     '#7A58A0',
    reg_lazio:      '#9A3030',
    reg_abruzzo:    '#308070',
    reg_molise:     '#485090',
    reg_campania:   '#A86020',
    reg_puglia:     '#307840',
    reg_basilicata: '#806820',
    reg_calabria:   '#3068A0',
    reg_sicilia:    '#A02860',
    reg_sardegna:   '#6A4828',
};

// ─── Module state ────────────────────────────────────────────────────────────
let _wrCache        = null;
let _wrSelectedSvg  = null;

// ─── CSS ─────────────────────────────────────────────────────────────────────
function _wrInjectStyles() {
    if (document.getElementById('wr-style')) return;
    const st = document.createElement('style');
    st.id = 'wr-style';
    st.textContent = `
        #wr-overlay {
            position: fixed; inset: 0; z-index: 4500;
            display: flex; flex-direction: column;
            font-family: system-ui, sans-serif;
            background: #0B1525;
        }
        #wr-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 20px; flex-shrink: 0;
            background: rgba(0,0,0,0.55);
            border-bottom: 1px solid rgba(0,200,200,0.15);
        }
        #wr-body {
            flex: 1; display: flex; overflow: hidden;
        }
        #wr-map-pane {
            flex: 1; display: flex; align-items: center; justify-content: center;
            overflow: hidden; padding: 8px;
            background: #0B1525;
            cursor: default;
        }
        #wr-map-pane svg {
            height: 100%; max-height: calc(100vh - 56px);
            width: auto; display: block;
        }
        #wr-sidebar {
            width: 320px; flex-shrink: 0;
            background: #080f1c; border-left: 1px solid rgba(0,200,200,0.1);
            display: flex; flex-direction: column; overflow: hidden;
        }
        #wr-sidebar-inner { flex: 1; overflow-y: auto; padding: 14px; }
        .wr-region path { cursor: pointer; }
        .wr-region path:hover { filter: brightness(1.35); }
        .wr-region.wr-selected path { filter: brightness(1.4); }
        .wr-close-btn {
            width: 30px; height: 30px; border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.15); background: transparent;
            color: #6b7280; font-size: 15px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all .15s;
        }
        .wr-close-btn:hover { border-color: rgba(255,255,255,0.4); color: #e2e8f0; }
        /* Province cards */
        .wr-prov-card {
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 9px; padding: 11px; margin-bottom: 7px;
        }
        .wr-prov-card.is-mine  { border-color: rgba(212,175,55,0.38);  background: rgba(212,175,55,0.06); }
        .wr-prov-card.is-free  { border-color: rgba(34,197,94,0.28);   background: rgba(34,197,94,0.04); }
        .wr-prov-card.is-enemy { border-color: rgba(239,68,68,0.28);   background: rgba(239,68,68,0.04); }
        .wr-inf-track { height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin: 4px 0 2px; }
        .wr-inf-fill  { height: 100%; border-radius: 2px; transition: width .5s; }
        .wr-btn { padding: 7px 14px; border: none; border-radius: 7px; font-size: 11px;
                  font-weight: 800; cursor: pointer; transition: all .15s; white-space: nowrap; }
        .wr-btn-green { background: linear-gradient(135deg,#166534,#22c55e); color: #fff; }
        .wr-btn-green:hover { filter: brightness(1.15); }
        .wr-btn-red   { background: linear-gradient(135deg,#7f1d1d,#ef4444); color: #fff; }
        .wr-btn-red:hover { filter: brightness(1.15); }
        .wr-btn-lock  { background: rgba(30,41,59,0.8); color: #374151;
                        border: 1px solid #1e293b; cursor: not-allowed; }
        .wr-offer-inp {
            flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 6px; padding: 6px 9px; font-size: 11px; color: #fff;
            outline: none; min-width: 0;
        }
        .wr-offer-inp:focus { border-color: rgba(0,200,200,0.4); }
        @keyframes wrFadeIn { from { opacity:0 } to { opacity:1 } }
    `;
    document.head.appendChild(st);
}

// ─── MAIN ENTRY ──────────────────────────────────────────────────────────────
async function renderTabWarRoom() {
    _wrInjectStyles();

    // Create full-screen overlay
    document.getElementById('wr-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'wr-overlay';
    document.body.appendChild(overlay);

    const panel = document.getElementById('main-panel');
    if (panel) panel.style.display = 'none';
    const tc = document.getElementById('tab-container');
    if (tc) tc.innerHTML = '';

    overlay.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        color:#00cccc;font-size:13px;letter-spacing:.18em;animation:wrFadeIn .3s">
        INIZIALIZZAZIONE WAR ROOM…
    </div>`;

    // ── Fetch data ──
    let provinces = [], regions = [], influence = {};
    let offline = false;
    try {
        const snap = await window.ServerState?.getTerritorySnapshot();
        if (snap) {
            provinces = snap.provinces || [];
            regions   = snap.regions   || [];
            influence = snap.influence || {};
        } else { offline = true; }
    } catch { offline = true; }

    const regById = {};
    regions.forEach(r => { regById[r.id] = r; });
    const myCompany = gameState.companyName || '';

    const svgOwn = {};
    provinces.forEach(p => {
        const reg = regById[p.region_id] || {};
        const sid = _WR_NAME_TO_SVG[reg.name];
        if (!sid) return;
        if (!svgOwn[sid]) svgOwn[sid] = { mine:0, enemy:0, free:0, total:0,
            governor: reg.governor_company||null, govTax: reg.region_tax_pct||0.01,
            regName: reg.name||'', regId: reg.id||'' };
        svgOwn[sid].total++;
        if (!p.owner_id)                          svgOwn[sid].free++;
        else if (p.owner_company === myCompany)   svgOwn[sid].mine++;
        else                                       svgOwn[sid].enemy++;
    });

    _wrCache = { provinces, regions, regById, influence, myCompany };
    _wrSelectedSvg = null;

    let totalMine = provinces.filter(p => p.owner_company === myCompany).length;

    // ── Build HTML ──
    overlay.innerHTML = `
        <div id="wr-header">
            <div style="display:flex;align-items:center;gap:16px;">
                <div style="font-size:9px;letter-spacing:.18em;color:rgba(0,200,200,0.55);font-weight:800;text-transform:uppercase;">CHAUFFEUR EMPIRE</div>
                <div style="font-size:19px;font-weight:900;color:#00cccc;letter-spacing:.06em;">WAR ROOM</div>
                ${offline ? `<span style="font-size:9px;color:#92400e;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);border-radius:4px;padding:2px 8px;">⚠ offline</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:20px;">
                <div>
                    <span style="font-size:17px;font-weight:900;color:#d4af37;">${totalMine}</span>
                    <span style="font-size:10px;color:#4b5563;"> / ${provinces.length} province</span>
                </div>
                <button class="wr-close-btn" onclick="window._wrClose()">✕</button>
            </div>
        </div>

        <div id="wr-body">
            <div id="wr-map-pane">
                ${_wrBuildSVG(svgOwn)}
            </div>
            <div id="wr-sidebar">
                <!-- Legend -->
                <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;">
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;">
                            <div style="width:12px;height:12px;background:#d4af37;border-radius:2px;"></div> Mio territorio
                        </div>
                        <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;">
                            <div style="width:12px;height:12px;background:#dc2626;border-radius:2px;"></div> Nemico
                        </div>
                        <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;">
                            <div style="width:12px;height:12px;background:#3A68A0;border-radius:2px;"></div> Libero
                        </div>
                    </div>
                </div>
                <!-- Detail area -->
                <div id="wr-sidebar-inner">
                    <div style="text-align:center;padding:48px 16px;animation:wrFadeIn .3s;">
                        <div style="font-size:32px;margin-bottom:10px;">🗺</div>
                        <div style="font-size:11px;color:#374151;letter-spacing:.08em;text-transform:uppercase;">Clicca su una regione</div>
                        <div style="font-size:10px;color:#1f2937;margin-top:4px;line-height:1.5;">Seleziona una regione sulla mappa per vedere le province e lanciarci un'OPA</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    _wrSetupInteractions(svgOwn);
}

window._wrClose = function () {
    document.getElementById('wr-overlay')?.remove();
    const panel = document.getElementById('main-panel');
    if (panel) panel.style.display = '';
};

// ─── SVG BUILD ───────────────────────────────────────────────────────────────
function _wrBuildSVG(svgOwn) {
    const regions = _WR_META.map(m => {
        const d   = _WR_PATHS[m.id];
        if (!d) return '';
        const own  = svgOwn[m.id] || {};
        const fill = _wrFill(own, m.id);
        const stroke = _wrStroke(own);
        const sw     = _wrStrokeW(own);
        const label  = m.name;
        const cx = m.cx, cy = m.cy;
        const badge = own.mine > 0 && own.mine === own.total ? '★' : own.governor ? '♛' : '';

        return `
            <g class="wr-region" id="${m.id}" data-id="${m.id}">
                <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
                <text x="${cx}" y="${cy - (badge ? 5 : 0)}" text-anchor="middle" pointer-events="none"
                    style="font-size:6px;fill:rgba(255,255,255,0.9);font-weight:700;font-family:system-ui,sans-serif;
                           text-shadow:0 0 3px rgba(0,0,0,0.9);letter-spacing:0.02em;">${label}</text>
                ${badge ? `<text x="${cx}" y="${cy + 7}" text-anchor="middle" pointer-events="none"
                    style="font-size:8px;fill:#FFD700;font-family:system-ui,sans-serif;">${badge}</text>` : ''}
            </g>`;
    }).join('');

    return `<svg viewBox="0 0 490 720" xmlns="http://www.w3.org/2000/svg">
        <rect width="490" height="720" fill="#0B1525"/>
        ${regions}
    </svg>`;
}

function _wrFill(own, svgId) {
    if (!own || own.total === 0) return _WR_BASE[svgId] || '#2A3A5A';
    if (own.mine > 0 && own.mine >= own.enemy)  return '#B8920A';   // gold (mine dominant)
    if (own.enemy > 0 && own.enemy > own.mine)  return '#A02020';   // red (enemy dominant)
    if (own.free === own.total)                  return _WR_BASE[svgId] || '#2A3A5A';
    return '#7A6020'; // mixed
}

function _wrStroke(own) {
    if (!own || own.total === 0) return 'rgba(255,255,255,0.12)';
    if (own.mine > 0 && own.mine >= own.enemy)  return '#FFD700';
    if (own.enemy > 0 && own.enemy > own.mine)  return '#FF4444';
    return 'rgba(255,255,255,0.15)';
}

function _wrStrokeW(own) {
    if (!own || own.total === 0) return 1;
    if (own.mine > 0 && own.mine >= own.enemy)  return 2.5;
    if (own.enemy > 0 && own.enemy > own.mine)  return 2;
    return 1;
}

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
function _wrSetupInteractions(svgOwn) {
    const svg = document.querySelector('#wr-map-pane svg');
    if (!svg) return;

    svg.querySelectorAll('.wr-region').forEach(el => {
        const svgId = el.dataset.id;
        const meta  = _WR_META.find(m => m.id === svgId) || {};

        el.addEventListener('click', () => {
            // Deselect old
            svg.querySelectorAll('.wr-region.wr-selected').forEach(e => e.classList.remove('wr-selected'));
            el.classList.add('wr-selected');
            _wrSelectedSvg = svgId;

            if (!_wrCache) return;
            const { provinces, regById } = _wrCache;
            const regionEntry = Object.values(regById).find(r => _WR_NAME_TO_SVG[r.name] === svgId);
            const provs = regionEntry ? provinces.filter(p => p.region_id === regionEntry.id) : [];
            _wrShowSidebar(svgId, meta.name || svgId, regionEntry || null, provs);
        });

        el.addEventListener('mouseenter', () => { el.style.cursor = 'pointer'; });
    });
}

// ─── SIDEBAR DETAIL ──────────────────────────────────────────────────────────
function _wrShowSidebar(svgId, regionName, regionData, provs) {
    const inner = document.getElementById('wr-sidebar-inner');
    if (!inner) return;

    const myCompany  = _wrCache?.myCompany || '';
    const influence  = _wrCache?.influence || {};
    const govCompany = regionData?.governor_company || null;
    const taxReg     = ((regionData?.region_tax_pct || 0.01) * 100).toFixed(1);
    const amGov      = govCompany === myCompany;

    let provHtml = '';
    if (!provs.length) {
        provHtml = `<div style="color:#374151;font-size:11px;text-align:center;padding:24px 0;">
            Nessuna provincia mappata per questa regione.</div>`;
    } else {
        provs.forEach(p => {
            const isOwned = p.owner_company === myCompany;
            const isFree  = !p.owner_id;
            const isEnemy = !isOwned && !isFree;
            const myInf   = influence[p.id] || 0;
            const thresh  = p.required_influence || 500;
            const pct     = Math.min(100, Math.round(myInf / thresh * 100));
            const unl     = myInf >= thresh;
            const taxPct  = ((p.transit_tax_pct || 0.025) * 100).toFixed(1);
            const val     = p.current_value || 0;
            const minOpa  = Math.ceil(val * 1.20);
            const hostOpa = Math.ceil(val * 2.30);
            const infCol  = unl ? '#22c55e' : pct > 60 ? '#f59e0b' : '#475569';
            const cls     = isOwned ? 'is-mine' : isFree ? 'is-free' : 'is-enemy';
            const badge   = isOwned
                ? `<span style="color:#d4af37;font-size:9px;">✦ Tua</span>`
                : isFree
                ? `<span style="color:#22c55e;font-size:9px;">◎ Libera</span>`
                : `<span style="color:#ef4444;font-size:9px;">⚔ ${p.owner_company}</span>`;

            let ctaHtml = '';
            if (isOwned) {
                ctaHtml = `<div style="font-size:9px;color:#22c55e;background:rgba(34,197,94,0.07);
                    border:1px solid rgba(34,197,94,0.15);border-radius:5px;padding:5px 8px;">
                    ✅ Incassi il ${taxPct}%${amGov ? ` + ${taxReg}% (Governatore)` : ''}</div>`;
            } else if (!unl) {
                ctaHtml = `<button class="wr-btn wr-btn-lock" style="width:100%;padding:6px;" disabled>
                    🔒 ${(thresh - myInf).toLocaleString()} pt influenza mancanti</button>`;
            } else if (isFree) {
                ctaHtml = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;">
                    <input id="wri-${p.id}" type="number" min="${minOpa}" step="5000"
                        class="wr-offer-inp" placeholder="Min €${minOpa.toLocaleString()}">
                    <button class="wr-btn wr-btn-green" onclick="window._wrAcquire('${p.id}')">🏴 OPA</button>
                </div>
                <div style="font-size:9px;color:#374151;">Min €${minOpa.toLocaleString()}</div>`;
            } else {
                ctaHtml = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;">
                    <input id="wri-${p.id}" type="number" min="${hostOpa}" step="5000"
                        class="wr-offer-inp" style="border-color:rgba(239,68,68,0.3);"
                        placeholder="Min €${hostOpa.toLocaleString()}">
                    <button class="wr-btn wr-btn-red" onclick="window._wrAcquire('${p.id}')">⚔ OPA Ostile</button>
                </div>
                <div style="font-size:9px;color:#374151;">+130% · Min €${hostOpa.toLocaleString()}</div>`;
            }

            provHtml += `
            <div class="wr-prov-card ${cls}">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
                    <div>
                        <div style="font-size:12px;font-weight:800;color:#e2e8f0;">${p.name}</div>
                        <div style="font-size:9px;color:#374151;margin-top:1px;">${badge} · ${taxPct}% tassa</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:12px;font-weight:900;color:#d4af37;">€${val.toLocaleString()}</div>
                    </div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;color:#4b5563;">
                    <span>Influenza</span>
                    <span style="color:${infCol};font-weight:700;">${myInf.toLocaleString()} / ${thresh.toLocaleString()} ${unl ? '✅' : ''}</span>
                </div>
                <div class="wr-inf-track"><div class="wr-inf-fill" style="width:${pct}%;background:${infCol};"></div></div>
                <div style="margin-top:8px;">${ctaHtml}</div>
            </div>`;
        });
    }

    inner.innerHTML = `
        <div style="animation:wrFadeIn .2s;">
            <div style="margin-bottom:12px;">
                <div style="font-size:9px;letter-spacing:.14em;color:rgba(0,200,200,0.5);text-transform:uppercase;font-weight:800;margin-bottom:2px;">REGIONE</div>
                <div style="font-size:16px;font-weight:900;color:#00cccc;">${regionName}</div>
                <div style="font-size:9px;color:#4b5563;margin-top:2px;">
                    Gov: <span style="color:${govCompany ? '#d4af37' : '#374151'};font-weight:700;">${govCompany || 'Nessuno'}</span>
                    · Tassa: <span style="color:#9ca3af;font-weight:700;">${taxReg}%</span>
                    ${amGov ? `<span style="color:#d4af37;"> · 👑 SEI GOVERNATORE</span>` : ''}
                </div>
            </div>
            <div style="font-size:9px;color:#374151;background:rgba(0,200,200,0.04);border:1px solid rgba(0,200,200,0.08);
                border-radius:6px;padding:6px 10px;margin-bottom:10px;line-height:1.5;">
                ${provs.length} province · >50% = diventi Governatore + ${taxReg}% su corse regionali
            </div>
            ${provHtml}
        </div>`;
}

// ─── ACQUIRE ─────────────────────────────────────────────────────────────────
window._wrAcquire = async function (provinceId) {
    const input = document.getElementById(`wri-${provinceId}`);
    const offer = parseInt(input?.value, 10);
    if (!offer || offer <= 0) { showNotification("Inserisci un'offerta valida", 'error'); return; }
    if (gameState.cash < offer) { showNotification('Fondi insufficienti', 'error'); return; }
    try {
        const result = await ServerState.acquireProvince(provinceId, offer);
        if (result?.success) {
            showBigEvent('🏴', `${result.province_name} Conquistata!`, `Investimento: €${offer.toLocaleString()}`);
            _wrCache = null;
            renderTabWarRoom();
        }
    } catch (e) {
        showNotification('Errore OPA: ' + (e.message || e), 'error');
    }
};

// Override dispatcher's renderTabProvinces
window.renderTabWarRoom   = renderTabWarRoom;
window.renderTabProvinces = renderTabWarRoom;
