/* ═══════════════════════════════════════════════════════════════════════════
   war_room.js — Chauffeur Empire · War Room (Mappa Geopolitica SVG)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

// ─── SVG REGION PATHS ────────────────────────────────────────────────────────
// viewBox "0 0 490 720", scale ~40px/°lon · 64px/°lat, origin 6.5°E / 47.1°N
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

// Region centroid labels
const _WR_META = [
    { id:'reg_vda',        name:"Valle\nd'Aosta",    cx:38,  cy:90  },
    { id:'reg_piemonte',   name:'Piemonte',           cx:60,  cy:152 },
    { id:'reg_lombardia',  name:'Lombardia',          cx:182, cy:97  },
    { id:'reg_trentino',   name:'Trentino\nA.A.',    cx:235, cy:48  },
    { id:'reg_veneto',     name:'Veneto',             cx:290, cy:112 },
    { id:'reg_fvg',        name:'Friuli\nV.G.',       cx:375, cy:92  },
    { id:'reg_liguria',    name:'Liguria',            cx:112, cy:215 },
    { id:'reg_emilia',     name:'Emilia-\nRomagna',  cx:240, cy:182 },
    { id:'reg_toscana',    name:'Toscana',            cx:158, cy:302 },
    { id:'reg_marche',     name:'Marche',             cx:308, cy:258 },
    { id:'reg_umbria',     name:'Umbria',             cx:242, cy:280 },
    { id:'reg_lazio',      name:'Lazio',              cx:215, cy:355 },
    { id:'reg_abruzzo',    name:'Abruzzo',            cx:328, cy:258 },
    { id:'reg_molise',     name:'Molise',             cx:338, cy:318 },
    { id:'reg_campania',   name:'Campania',           cx:282, cy:440 },
    { id:'reg_puglia',     name:'Puglia',             cx:418, cy:405 },
    { id:'reg_basilicata', name:'Basilicata',         cx:335, cy:498 },
    { id:'reg_calabria',   name:'Calabria',           cx:318, cy:572 },
    { id:'reg_sicilia',    name:'Sicilia',            cx:278, cy:645 },
    { id:'reg_sardegna',   name:'Sardegna',           cx:110, cy:475 },
];

// DB region name → SVG region ID
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

// Module state
let _wrCache = null;

// ─── CSS ─────────────────────────────────────────────────────────────────────
function _wrInjectStyles() {
    if (document.getElementById('wr-style')) return;
    const st = document.createElement('style');
    st.id = 'wr-style';
    st.textContent = `
        #wr-map-wrap {
            background: radial-gradient(ellipse at 40% 35%, #03071a 0%, #010305 100%);
            border: 1px solid rgba(0,200,200,0.12); border-radius: 12px;
            overflow: hidden; position: relative; user-select: none;
        }
        #wr-map-wrap svg { display: block; width: 100%; height: auto; }
        .wr-region {
            cursor: pointer;
            transition: fill 0.18s ease, filter 0.18s ease;
        }
        .wr-region:hover {
            filter: brightness(1.7) drop-shadow(0 0 5px rgba(0,220,220,0.5));
        }
        #wr-tooltip {
            position: fixed; pointer-events: none; z-index: 9999;
            background: linear-gradient(140deg, rgba(3,7,22,0.98), rgba(8,14,38,0.98));
            border: 1px solid rgba(0,200,200,0.28); border-radius: 10px;
            padding: 10px 13px; min-width: 175px;
            box-shadow: 0 8px 28px rgba(0,0,0,0.7);
            display: none; font-size: 11px; color: #e2e8f0;
        }
        #wr-tooltip .tt-title { font-weight: 800; color: #00cccc; font-size: 12.5px; margin-bottom: 5px; }
        #wr-tooltip .tt-row { display: flex; justify-content: space-between; gap: 14px; margin-top: 3px; }
        #wr-tooltip .tt-lbl { color: #4b5563; }
        #wr-tooltip .tt-val { font-weight: 700; color: #e2e8f0; }
        .wr-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,5,0.82); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); animation: wrFadeIn .15s ease;
        }
        .wr-modal {
            background: linear-gradient(150deg, rgba(3,6,20,0.99), rgba(6,10,28,0.99));
            border: 1px solid rgba(0,200,200,0.18); border-radius: 16px;
            width: 94%; max-width: 560px; max-height: 88vh; overflow-y: auto;
            padding: 20px; box-shadow: 0 24px 64px rgba(0,0,0,0.9);
            animation: wrSlideUp .2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .wr-prov-card {
            background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07);
            border-radius: 10px; padding: 12px; margin-bottom: 8px;
        }
        .wr-prov-card.is-mine  { border-color: rgba(212,175,55,0.4);  background: rgba(212,175,55,0.06); }
        .wr-prov-card.is-free  { border-color: rgba(34,197,94,0.32);  background: rgba(34,197,94,0.05); }
        .wr-prov-card.is-enemy { border-color: rgba(239,68,68,0.32);  background: rgba(239,68,68,0.05); }
        .wr-inf-track { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin: 3px 0; }
        .wr-inf-fill  { height: 100%; border-radius: 2px; transition: width .5s ease; }
        .wr-btn       { display: flex; align-items: center; justify-content: center; padding: 7px 14px;
                        border: none; border-radius: 7px; font-size: 0.72rem; font-weight: 800;
                        cursor: pointer; white-space: nowrap; transition: all .15s; }
        .wr-btn-green { background: linear-gradient(135deg,#15803d,#22c55e); color: #fff; }
        .wr-btn-green:hover { background: linear-gradient(135deg,#16a34a,#4ade80); }
        .wr-btn-red   { background: linear-gradient(135deg,#991b1b,#ef4444); color: #fff; }
        .wr-btn-red:hover { background: linear-gradient(135deg,#b91c1c,#f87171); }
        .wr-btn-locked { background: rgba(30,41,59,0.8); color: #4b5563; border: 1px solid #1e293b; cursor: not-allowed; }
        .wr-offer-input {
            flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12);
            border-radius: 6px; padding: 7px 10px; font-size: 0.72rem; color: #fff;
            outline: none; min-width: 0;
        }
        .wr-offer-input:focus { border-color: rgba(0,200,200,0.4); }
        @keyframes wrFadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes wrSlideUp  { from { transform:translateY(18px);opacity:0 } to { transform:translateY(0);opacity:1 } }
    `;
    document.head.appendChild(st);
}

// ─── MAIN RENDER ─────────────────────────────────────────────────────────────
async function renderTabWarRoom() {
    const container = document.getElementById('tab-container');
    _wrInjectStyles();
    container.innerHTML = `
        <div style="color:#00cccc;font-size:0.7rem;text-align:center;padding:24px 0;letter-spacing:.12em;animation:wrFadeIn .3s">
            INIZIALIZZAZIONE WAR ROOM…
        </div>`;

    let provinces = [], regions = [], influence = {};
    try {
        const snap = await window.ServerState?.getTerritorySnapshot();
        if (!snap) throw new Error('snapshot nullo');
        provinces = snap.provinces || [];
        regions   = snap.regions   || [];
        influence = snap.influence || {};
    } catch(e) {
        container.innerHTML = `
            <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px;font-size:0.78rem;color:#ef4444;margin-top:8px;">
                ⚠ Mappa non disponibile offline<br>
                <span style="color:#4b5563;font-size:0.65rem;">${e.message}</span>
            </div>
            <div style="margin-top:12px;font-size:0.7rem;color:#4b5563;text-align:center;">Le Province War sono accessibili solo con connessione attiva.</div>`;
        return;
    }

    const regById = {};
    regions.forEach(r => { regById[r.id] = r; });

    const myCompany = gameState.companyName || '';

    // Build per-SVG-region ownership summary
    const svgOwn = {};
    provinces.forEach(p => {
        const reg = regById[p.region_id] || {};
        const svgId = _WR_NAME_TO_SVG[reg.name];
        if (!svgId) return;
        if (!svgOwn[svgId]) svgOwn[svgId] = {
            mine: 0, enemy: 0, free: 0, total: 0,
            governor: reg.governor_company || null,
            govTax: reg.region_tax_pct || 0.01,
            regName: reg.name || '',
            regId: reg.id || '',
        };
        const o = svgOwn[svgId];
        o.total++;
        if (!p.owner_id) o.free++;
        else if (p.owner_company === myCompany) o.mine++;
        else o.enemy++;
    });

    _wrCache = { provinces, regions, regById, influence, myCompany };

    // Player stats summary
    let totalMine = 0, totalProvs = provinces.length;
    provinces.forEach(p => { if (p.owner_company === myCompany) totalMine++; });
    const isGovSomewhere = regions.some(r => r.governor_company === myCompany);

    container.innerHTML = `
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div>
                <div style="font-size:0.58rem;letter-spacing:.18em;color:rgba(0,200,200,0.55);text-transform:uppercase;font-weight:700;">CHAUFFEUR EMPIRE</div>
                <div style="font-size:1.02rem;font-weight:900;color:#00cccc;letter-spacing:.04em;">WAR ROOM</div>
                <div style="font-size:0.6rem;color:#374151;margin-top:1px;">Geopolitica & Conquista Territoriale</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.62rem;font-weight:700;color:#d4af37;">${totalMine} / ${totalProvs}</div>
                <div style="font-size:0.58rem;color:#4b5563;">province</div>
                ${isGovSomewhere ? `<div style="font-size:0.58rem;color:#d4af37;margin-top:2px;">👑 Governatore attivo</div>` : ''}
            </div>
        </div>

        <!-- Legend -->
        <div style="display:flex;gap:14px;font-size:0.6rem;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:4px;"><div style="width:10px;height:10px;background:rgba(212,175,55,0.55);border-radius:2px;"></div><span style="color:#6b7280;">Tuo controllo</span></div>
            <div style="display:flex;align-items:center;gap:4px;"><div style="width:10px;height:10px;background:rgba(212,175,55,0.28);border-radius:2px;"></div><span style="color:#6b7280;">Influenza parziale</span></div>
            <div style="display:flex;align-items:center;gap:4px;"><div style="width:10px;height:10px;background:rgba(239,68,68,0.38);border-radius:2px;"></div><span style="color:#6b7280;">Nemico</span></div>
            <div style="display:flex;align-items:center;gap:4px;"><div style="width:10px;height:10px;background:rgba(18,30,55,0.9);border:1px solid rgba(0,200,200,0.15);border-radius:2px;"></div><span style="color:#6b7280;">Neutrale</span></div>
        </div>

        <!-- SVG Map -->
        <div id="wr-map-wrap">${_wrBuildSVG(svgOwn)}</div>
        <div style="margin-top:6px;font-size:0.6rem;color:#374151;text-align:center;">
            Hover per dettagli · Click per aprire il pannello di conquista
        </div>

        <!-- Floating tooltip -->
        <div id="wr-tooltip">
            <div class="tt-title" id="wr-tt-name">—</div>
            <div class="tt-row"><span class="tt-lbl">Governatore</span><span class="tt-val" id="wr-tt-gov">—</span></div>
            <div class="tt-row"><span class="tt-lbl">Tassa regionale</span><span class="tt-val" id="wr-tt-tax">—</span></div>
            <div class="tt-row"><span class="tt-lbl">Province</span><span class="tt-val" id="wr-tt-prov">—</span></div>
        </div>
    `;

    _wrSetupInteractions(svgOwn);
}

// ─── SVG BUILD ───────────────────────────────────────────────────────────────
function _wrBuildSVG(svgOwn) {
    const regionPaths = _WR_META.map(m => {
        const d = _WR_PATHS[m.id];
        if (!d) return '';
        const own  = svgOwn[m.id] || {};
        const fill = _wrFill(own);
        const lines = m.name.split('\n');
        const textY = m.cy - (lines.length > 1 ? 4 : 0);
        return `
            <path id="${m.id}" class="wr-region" d="${d}"
                fill="${fill}" stroke="rgba(0,180,180,0.18)" stroke-width="0.6"
                data-svgid="${m.id}"/>
            ${lines.map((l, i) => `<text x="${m.cx}" y="${textY + i * 9}"
                text-anchor="middle" pointer-events="none"
                style="font-size:5.5px;fill:rgba(255,255,255,0.38);font-weight:700;
                       letter-spacing:0.03em;font-family:system-ui,sans-serif;">${l}</text>`).join('')}
        `;
    }).join('');

    return `<svg viewBox="0 0 490 720" xmlns="http://www.w3.org/2000/svg" style="max-height:510px;">
        <defs>
            <radialGradient id="sea-grad" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stop-color="#020a1e"/>
                <stop offset="100%" stop-color="#010408"/>
            </radialGradient>
        </defs>
        <rect width="490" height="720" fill="url(#sea-grad)"/>
        <!-- Strait of Messina marker -->
        <line x1="285" y1="630" x2="312" y2="618" stroke="rgba(0,200,200,0.08)" stroke-width="1" stroke-dasharray="3,3"/>
        ${regionPaths}
    </svg>`;
}

function _wrFill(own) {
    if (!own || own.total === 0) return 'rgba(15,25,50,0.85)';
    if (own.mine > 0 && own.mine === own.total)  return 'rgba(212,175,55,0.58)'; // full control
    if (own.mine > 0 && own.mine > own.enemy)    return 'rgba(212,175,55,0.30)'; // I lead
    if (own.enemy > 0 && own.enemy >= own.mine)  return 'rgba(239,68,68,0.38)'; // enemy leads
    if (own.free === own.total)                  return 'rgba(15,28,55,0.88)';  // all neutral
    return 'rgba(25,40,75,0.75)';                                               // mixed
}

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
function _wrSetupInteractions(svgOwn) {
    const tooltip = document.getElementById('wr-tooltip');
    const svg = document.querySelector('#wr-map-wrap svg');
    if (!svg) return;

    svg.querySelectorAll('.wr-region').forEach(el => {
        const svgId = el.dataset.svgid;
        const meta  = _WR_META.find(m => m.id === svgId) || {};
        const own   = svgOwn[svgId] || {};

        el.addEventListener('mouseenter', () => {
            if (!tooltip) return;
            const govLabel = own.governor || 'Territorio Libero';
            const taxPct   = ((own.govTax || 0.01) * 100).toFixed(1);
            const fullName = (meta.name || svgId).replace('\n', ' ');
            document.getElementById('wr-tt-name').textContent  = fullName;
            document.getElementById('wr-tt-gov').textContent   = govLabel;
            document.getElementById('wr-tt-gov').style.color   = own.governor ? '#d4af37' : '#4b5563';
            document.getElementById('wr-tt-tax').textContent   = taxPct + '%';
            document.getElementById('wr-tt-prov').textContent  = `${own.mine || 0} / ${own.total || 0} mie`;
            tooltip.style.display = 'block';
        });

        el.addEventListener('mousemove', e => {
            if (!tooltip) return;
            tooltip.style.left = (e.clientX + 16) + 'px';
            tooltip.style.top  = Math.max(4, e.clientY - 50) + 'px';
        });

        el.addEventListener('mouseleave', () => {
            if (tooltip) tooltip.style.display = 'none';
        });

        el.addEventListener('click', () => {
            if (tooltip) tooltip.style.display = 'none';
            if (!_wrCache) return;
            const { provinces, regById } = _wrCache;
            const regionEntry = Object.values(regById).find(r => _WR_NAME_TO_SVG[r.name] === svgId);
            if (!regionEntry) {
                _wrShowModal(svgId, (meta.name || svgId).replace('\n', ' '), null, []);
                return;
            }
            const provs = provinces.filter(p => p.region_id === regionEntry.id);
            _wrShowModal(svgId, (meta.name || svgId).replace('\n', ' '), regionEntry, provs);
        });
    });
}

// ─── CONQUEST MODAL ──────────────────────────────────────────────────────────
function _wrShowModal(svgId, regionName, regionData, provs) {
    document.getElementById('wr-modal-overlay')?.remove();

    const myCompany = _wrCache?.myCompany || '';
    const influence = _wrCache?.influence || {};
    const govCompany = regionData?.governor_company || null;
    const taxReg    = ((regionData?.region_tax_pct || 0.01) * 100).toFixed(1);
    const amGov     = govCompany === myCompany;

    // Province cards
    let provHtml = '';
    if (!provs.length) {
        provHtml = `<div style="color:#374151;font-size:0.75rem;text-align:center;padding:24px;">
            Nessuna provincia mappata per questa regione.</div>`;
    } else {
        provs.forEach(p => {
            const isOwned  = p.owner_company === myCompany;
            const isFree   = !p.owner_id;
            const isEnemy  = !isOwned && !isFree;
            const myInf    = influence[p.id] || 0;
            const thresh   = p.required_influence || 500;
            const pct      = Math.min(100, Math.round(myInf / thresh * 100));
            const unlocked = myInf >= thresh;
            const taxPct   = ((p.transit_tax_pct || 0.025) * 100).toFixed(1);
            const val      = p.current_value || 0;
            const minOpa   = Math.ceil(val * 1.20);
            const hostOpa  = Math.ceil(val * 2.30);
            const infColor = unlocked ? '#22c55e' : pct > 60 ? '#f59e0b' : '#475569';

            const cardCls = isOwned ? 'is-mine' : isFree ? 'is-free' : 'is-enemy';
            const badge   = isOwned
                ? `<span style="color:#d4af37;font-size:0.6rem;">✦ Tua</span>`
                : isFree
                ? `<span style="color:#22c55e;font-size:0.6rem;">◎ Libera</span>`
                : `<span style="color:#ef4444;font-size:0.6rem;">⚔ ${p.owner_company}</span>`;

            let ctaHtml = '';
            if (isOwned) {
                ctaHtml = `<div style="font-size:0.68rem;color:#22c55e;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.18);border-radius:6px;padding:6px 10px;">
                    ✅ Incassi il ${taxPct}% su ogni corsa${amGov ? ` + ${taxReg}% come Governatore` : ''}
                </div>`;
            } else if (!unlocked) {
                ctaHtml = `<button class="wr-btn wr-btn-locked" style="width:100%;padding:8px;" disabled>
                    🔒 Influenza Insufficiente — ${(thresh - myInf).toLocaleString()} pt mancanti
                </button>`;
            } else if (isFree) {
                ctaHtml = `<div style="display:flex;gap:6px;align-items:center;">
                    <input id="wr-offer-${p.id}" type="number" min="${minOpa}" step="5000"
                        class="wr-offer-input" placeholder="Min €${minOpa.toLocaleString()}">
                    <button class="wr-btn wr-btn-green" onclick="window._wrAcquire('${p.id}')">🏴 Acquisisci</button>
                </div>
                <div style="font-size:0.6rem;color:#374151;margin-top:3px;">OPA minima: €${minOpa.toLocaleString()}</div>`;
            } else {
                ctaHtml = `<div style="display:flex;gap:6px;align-items:center;">
                    <input id="wr-offer-${p.id}" type="number" min="${hostOpa}" step="5000"
                        class="wr-offer-input" style="border-color:rgba(239,68,68,0.3);"
                        placeholder="Min €${hostOpa.toLocaleString()}">
                    <button class="wr-btn wr-btn-red" onclick="window._wrAcquire('${p.id}')">⚔ OPA Ostile</button>
                </div>
                <div style="font-size:0.6rem;color:#374151;margin-top:3px;">OPA Ostile +130% · Min €${hostOpa.toLocaleString()}</div>`;
            }

            provHtml += `
            <div class="wr-prov-card ${cardCls}">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div>
                        <div style="font-size:0.82rem;font-weight:800;color:#fff;">${p.name}</div>
                        <div style="font-size:0.62rem;color:#374151;margin-top:2px;">${badge} · Tassa: ${taxPct}%</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:0.88rem;font-weight:900;color:#d4af37;">€${val.toLocaleString()}</div>
                        <div style="font-size:0.58rem;color:#374151;">valore</div>
                    </div>
                </div>

                <!-- Influence progress -->
                <div style="margin-bottom:9px;">
                    <div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-bottom:3px;">
                        <span style="color:#4b5563;">Influenza</span>
                        <span style="color:${infColor};font-weight:700;">${myInf.toLocaleString()} / ${thresh.toLocaleString()} ${unlocked ? '✅' : ''}</span>
                    </div>
                    <div class="wr-inf-track">
                        <div class="wr-inf-fill" style="width:${pct}%;background:${infColor};"></div>
                    </div>
                    ${!unlocked ? `<div style="font-size:0.58rem;color:#374151;margin-top:2px;">Completa corse da/verso questa provincia per guadagnare influenza</div>` : ''}
                </div>

                ${ctaHtml}
            </div>`;
        });
    }

    const overlay = document.createElement('div');
    overlay.id = 'wr-modal-overlay';
    overlay.className = 'wr-modal-overlay';
    overlay.innerHTML = `
        <div class="wr-modal">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px;">
                <div>
                    <div style="font-size:0.58rem;letter-spacing:.15em;color:rgba(0,200,200,0.55);text-transform:uppercase;font-weight:700;">REGIONE ITALIANA</div>
                    <div style="font-size:1.1rem;font-weight:900;color:#00cccc;">${regionName}</div>
                    <div style="font-size:0.66rem;color:#4b5563;margin-top:3px;">
                        Governatore: <span style="font-weight:700;color:${govCompany ? '#d4af37' : '#374151'}">${govCompany || 'Nessuno'}</span>
                        · Tassa regionale: <span style="font-weight:700;color:#fff;">${taxReg}%</span>
                        ${amGov ? `<span style="color:#d4af37;font-size:0.58rem;"> — TU SEI GOVERNATORE</span>` : ''}
                    </div>
                </div>
                <button onclick="document.getElementById('wr-modal-overlay').remove()"
                    style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                           color:#6b7280;width:28px;height:28px;border-radius:50%;font-size:14px;
                           cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>

            <div style="font-size:0.64rem;color:#374151;padding:6px 10px;background:rgba(0,200,200,0.04);
                        border:1px solid rgba(0,200,200,0.1);border-radius:7px;margin-bottom:12px;line-height:1.5;">
                ${provs.length} province · >50% controllo = Governatore + ${taxReg}% su ogni corsa regionale
            </div>

            ${provHtml}
        </div>
    `;

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ─── ACQUIRE ────────────────────────────────────────────────────────────────
window._wrAcquire = async function(provinceId) {
    const input = document.getElementById(`wr-offer-${provinceId}`);
    const offer = parseInt(input?.value, 10);
    if (!offer || offer <= 0) { showNotification('Inserisci un\'offerta valida', 'error'); return; }
    if (gameState.cash < offer) { showNotification('Fondi insufficienti', 'error'); return; }
    try {
        const result = await ServerState.acquireProvince(provinceId, offer);
        if (result?.success) {
            document.getElementById('wr-modal-overlay')?.remove();
            showBigEvent('🏴', `${result.province_name} Conquistata!`, `Investimento: €${offer.toLocaleString()}`);
            _wrCache = null;
            renderTabWarRoom();
        }
    } catch(e) {
        showNotification('Errore OPA: ' + (e.message || e), 'error');
    }
};

// Override dispatcher.js version
window.renderTabProvinces = renderTabWarRoom;
