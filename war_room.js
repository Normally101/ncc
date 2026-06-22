'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   war_room.js — Chauffeur Empire · War Room
   Mappa geografica reale (GeoJSON ISTAT via openpolis CDN)
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Name → internal ID (must match DB region names) ────────────────────────
const _WR_NAME_TO_SVG = {
    'Piemonte':              'reg_piemonte',
    "Valle d'Aosta":         'reg_vda',
    "Valle D'Aosta":         'reg_vda',
    'Lombardia':             'reg_lombardia',
    'Trentino-Alto Adige':   'reg_trentino',
    'Trentino Alto Adige':   'reg_trentino',
    'Trentino-South Tyrol':  'reg_trentino',
    'Veneto':                'reg_veneto',
    'Friuli-Venezia Giulia': 'reg_fvg',
    'Friuli Venezia Giulia': 'reg_fvg',
    'Liguria':               'reg_liguria',
    'Emilia-Romagna':        'reg_emilia',
    'Toscana':               'reg_toscana',
    'Marche':                'reg_marche',
    'Umbria':                'reg_umbria',
    'Lazio':                 'reg_lazio',
    'Abruzzo':               'reg_abruzzo',
    'Molise':                'reg_molise',
    'Campania':              'reg_campania',
    'Puglia':                'reg_puglia',
    'Basilicata':            'reg_basilicata',
    'Calabria':              'reg_calabria',
    'Sicilia':               'reg_sicilia',
    'Sardegna':              'reg_sardegna',
};

// Region display labels
const _WR_LABELS = {
    reg_vda:'Valle d\'Aosta', reg_piemonte:'Piemonte', reg_lombardia:'Lombardia',
    reg_trentino:'Trentino A.A.', reg_veneto:'Veneto', reg_fvg:'Friuli V.G.',
    reg_liguria:'Liguria', reg_emilia:'Emilia-Romagna', reg_toscana:'Toscana',
    reg_marche:'Marche', reg_umbria:'Umbria', reg_lazio:'Lazio',
    reg_abruzzo:'Abruzzo', reg_molise:'Molise', reg_campania:'Campania',
    reg_puglia:'Puglia', reg_basilicata:'Basilicata', reg_calabria:'Calabria',
    reg_sicilia:'Sicilia', reg_sardegna:'Sardegna',
};

// Base political-map colors (neutral state)
const _WR_BASE = {
    reg_vda:'#6B4F2A', reg_piemonte:'#B07030', reg_lombardia:'#3A70B8',
    reg_trentino:'#4A8AAA', reg_veneto:'#6A4EA8', reg_fvg:'#2E8860',
    reg_liguria:'#A83838', reg_emilia:'#B88020', reg_toscana:'#4A8048',
    reg_marche:'#3A68A0', reg_umbria:'#7A58A0', reg_lazio:'#9A3030',
    reg_abruzzo:'#308070', reg_molise:'#485090', reg_campania:'#A86020',
    reg_puglia:'#307840', reg_basilicata:'#806820', reg_calabria:'#3068A0',
    reg_sicilia:'#A02860', reg_sardegna:'#6A4828',
};

// ─── Module state ────────────────────────────────────────────────────────────
let _wrCache       = null;
let _wrGeoCache    = null;   // cached GeoJSON
let _wrSelectedSvg = null;

// ─── Mercator projection for Italy ──────────────────────────────────────────
const _WR_PROJ = { W:500, H:660, minLon:6.4, maxLon:18.8, minLat:35.1, maxLat:47.3 };

function _wrProject(lon, lat) {
    const p = _WR_PROJ;
    const x = (lon - p.minLon) / (p.maxLon - p.minLon) * p.W;
    const toM = l => Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360));
    const y = (1 - (toM(lat) - toM(p.minLat)) / (toM(p.maxLat) - toM(p.minLat))) * p.H;
    return [x, y];
}

function _wrRingToD(ring) {
    return ring.map(([lon, lat], i) => {
        const [x, y] = _wrProject(lon, lat);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join('') + 'Z';
}

function _wrFeatureToPath(feature) {
    const g = feature.geometry;
    if (g.type === 'Polygon')
        return g.coordinates.map(_wrRingToD).join('');
    if (g.type === 'MultiPolygon')
        return g.coordinates.flatMap(p => p.map(_wrRingToD)).join('');
    return '';
}

function _wrFeatureCentroid(feature) {
    const g = feature.geometry;
    let ring;
    if (g.type === 'Polygon') {
        ring = g.coordinates[0];
    } else if (g.type === 'MultiPolygon') {
        // pick the polygon with the most vertices (usually the mainland)
        ring = g.coordinates.reduce((a, b) => a[0].length >= b[0].length ? a : b)[0];
    }
    if (!ring || !ring.length) return [250, 330];
    let sLon = 0, sLat = 0;
    ring.forEach(([lon, lat]) => { sLon += lon; sLat += lat; });
    return _wrProject(sLon / ring.length, sLat / ring.length);
}

function _wrGetSvgId(props) {
    const raw = (props.reg_name || props.name || props.DEN_REG || props.NAME_1 || '').split('/')[0].trim();
    return _WR_NAME_TO_SVG[raw] || null;
}

// ─── GeoJSON fetch (cached) ──────────────────────────────────────────────────
async function _wrLoadGeo() {
    if (_wrGeoCache) return _wrGeoCache;
    const url = 'https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('GeoJSON fetch failed ' + resp.status);
    _wrGeoCache = await resp.json();
    return _wrGeoCache;
}

// ─── Build accurate SVG from GeoJSON ────────────────────────────────────────
function _wrGeoToSVG(geo, svgOwn) {
    const { W, H } = _WR_PROJ;
    const regions = geo.features.map(f => {
        const svgId = _wrGetSvgId(f.properties);
        if (!svgId) return '';
        const own    = svgOwn[svgId] || {};
        const fill   = _wrFill(own, svgId);
        const stroke = _wrStroke(own);
        const sw     = _wrStrokeW(own);
        const d      = _wrFeatureToPath(f);
        const [cx, cy] = _wrFeatureCentroid(f);
        const label  = _WR_LABELS[svgId] || svgId;
        const badge  = own.mine > 0 && own.mine === own.total ? '★' : (own.governor ? '♛' : '');

        return `
        <g class="wr-region" id="${svgId}" data-id="${svgId}">
            <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>
            <text x="${cx.toFixed(1)}" y="${(cy - (badge ? 4 : 0)).toFixed(1)}"
                text-anchor="middle" pointer-events="none"
                style="font-size:7px;fill:rgba(255,255,255,0.92);font-weight:700;
                       font-family:system-ui,sans-serif;paint-order:stroke;
                       stroke:#000;stroke-width:2px;stroke-linejoin:round;">${label}</text>
            ${badge ? `<text x="${cx.toFixed(1)}" y="${(cy + 8).toFixed(1)}" text-anchor="middle"
                pointer-events="none" style="font-size:9px;fill:#c79a2a;font-family:system-ui;">${badge}</text>` : ''}
        </g>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="#bcd3e8"/>
        ${regions}
    </svg>`;
}

// ─── Ownership fill/stroke helpers ──────────────────────────────────────────
function _wrFill(own, svgId) {
    if (!own || own.total === 0)                        return _WR_BASE[svgId] || '#2A3A5A';
    if (own.mine > 0 && own.mine >= own.enemy)          return '#B8920A';
    if (own.enemy > 0 && own.enemy > own.mine)          return '#A02020';
    if (own.free === own.total)                         return _WR_BASE[svgId] || '#2A3A5A';
    return '#7A6020';
}
function _wrStroke(own) {
    if (!own || own.total === 0)                        return "rgba(0,0,0,0.22)";
    if (own.mine > 0 && own.mine >= own.enemy)          return '#c79a2a';
    if (own.enemy > 0 && own.enemy > own.mine)          return '#db5746';
    return "rgba(0,0,0,0.22)";
}
function _wrStrokeW(own) {
    if (own?.mine > 0 && own.mine >= own.enemy)  return 2.5;
    if (own?.enemy > 0 && own.enemy > own.mine)  return 2;
    return 0.8;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
function _wrInjectStyles() {
    if (document.getElementById('wr-style')) return;
    const st = document.createElement('style');
    st.id = 'wr-style';
    st.textContent = `
        #wr-overlay {
            position:fixed; inset:0; z-index:4500;
            display:flex; flex-direction:column;
            font-family:'Inter',system-ui,sans-serif;
            background:#0a0c12;
        }
        #wr-header {
            display:flex; align-items:center; justify-content:space-between;
            padding:9px 16px; flex-shrink:0;
            background:#161b22;
            border-bottom:1px solid #21262d; box-shadow:0 1px 2px rgba(0,0,0,.4);
        }
        #wr-body { flex:1; display:flex; overflow:hidden; }
        #wr-map-pane {
            flex:1; display:flex; align-items:center; justify-content:center;
            overflow:hidden; padding:10px 6px;
        }
        #wr-map-pane svg { height:100%; max-height:calc(100vh - 56px); width:auto; display:block; }
        #wr-sidebar {
            width:300px; flex-shrink:0; background:#161b22;
            border-left:1px solid #21262d;
            display:flex; flex-direction:column; overflow:hidden;
        }
        #wr-sidebar-inner { flex:1; overflow-y:auto; padding:12px; }
        .wr-region { cursor:pointer; }
        .wr-region path { transition:filter .15s; }
        .wr-region:hover path { filter:brightness(1.12); }
        .wr-region.wr-sel path { filter:brightness(1.16) drop-shadow(0 0 6px rgba(199,154,42,0.6)); }
        .wr-close-btn {
            width:30px; height:30px; border-radius:50%;
            border:1px solid #21262d; background:#161b22;
            color:#6b7280; font-size:14px; cursor:pointer;
            display:flex; align-items:center; justify-content:center; transition:all .15s;
        }
        .wr-close-btn:hover { border-color:#30363d; color:#e6edf3; }
        .wr-prov-card {
            background:#161b22; border:1px solid #21262d;
            border-radius:8px; padding:10px; margin-bottom:6px; box-shadow:0 1px 2px rgba(0,0,0,.3);
        }
        .wr-prov-card.is-mine  { border-color:#d4af37; background:#1a1608; }
        .wr-prov-card.is-free  { border-color:#3fb950; background:#0d1a12; }
        .wr-prov-card.is-enemy { border-color:#f85149; background:#1a0d0d; }
        .wr-inf-track { height:3px; background:#21262d; border-radius:2px; overflow:hidden; margin:4px 0 2px; }
        .wr-inf-fill  { height:100%; border-radius:2px; transition:width .5s; }
        .wr-btn { padding:6px 13px; border:none; border-radius:6px; font-size:11px;
                  font-weight:800; cursor:pointer; transition:filter .15s; white-space:nowrap; }
        .wr-btn-green { background:linear-gradient(180deg,#22ab73,#15885a); color:#fff; }
        .wr-btn-red   { background:linear-gradient(135deg,#db5746,#b8392b); color:#fff; }
        .wr-btn-green:hover,.wr-btn-red:hover { filter:brightness(1.08); }
        .wr-btn-lock { background:#21262d; color:#6b7280; border:1px solid #30363d; cursor:not-allowed; }
        .wr-offer-inp {
            flex:1; background:#0d1117; border:1px solid #21262d;
            border-radius:6px; padding:6px 9px; font-size:11px; color:#e6edf3; outline:none; min-width:0;
        }
        .wr-offer-inp:focus { border-color:#58a6ff; }
        @keyframes wrFadeIn { from{opacity:0} to{opacity:1} }
    `;
    document.head.appendChild(st);
}

// ─── MAIN ENTRY ──────────────────────────────────────────────────────────────
async function renderTabWarRoom() {
    _wrInjectStyles();

    document.getElementById('wr-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'wr-overlay';
    document.body.appendChild(overlay);

    const panel = document.getElementById('main-panel');
    if (panel) panel.style.display = 'none';
    const tc = document.getElementById('tab-container');
    if (tc) tc.innerHTML = '';

    overlay.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;
        justify-content:center;flex-direction:column;gap:10px;">
        <div style="color:#2f74c0;font-size:13px;letter-spacing:.18em;animation:wrFadeIn .3s">
            CARICAMENTO MAPPA…
        </div>
        <div style="font-size:10px;color:#6b7280;">Scaricamento confini regionali…</div>
    </div>`;

    // ── Parallel fetch: territory data + GeoJSON ──
    let provinces = [], regions = [], influence = {}, offline = false, geo = null;
    const [snapResult, geoResult] = await Promise.allSettled([
        window.ServerState?.getTerritorySnapshot(),
        _wrLoadGeo()
    ]);

    if (snapResult.status === 'fulfilled' && snapResult.value) {
        provinces = snapResult.value.provinces || [];
        regions   = snapResult.value.regions   || [];
        influence = snapResult.value.influence || {};
    } else { offline = true; }

    if (geoResult.status === 'fulfilled') {
        geo = geoResult.value;
    }

    // ── Build ownership map ──
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
        if      (!p.owner_id)                        svgOwn[sid].free++;
        else if (p.owner_company === myCompany)       svgOwn[sid].mine++;
        else                                          svgOwn[sid].enemy++;
    });

    _wrCache = { provinces, regions, regById, influence, myCompany };
    _wrSelectedSvg = null;
    const totalMine = provinces.filter(p => p.owner_company === myCompany).length;

    // ── SVG map ──
    const mapSvg = geo
        ? _wrGeoToSVG(geo, svgOwn)
        : `<div style="color:#db5746;font-size:11px;padding:20px;text-align:center;">
              ⚠ Impossibile caricare la mappa geografica.<br>
              <span style="color:#6b7280;font-size:9px;">Verifica connessione internet e riprova.</span>
           </div>`;

    overlay.innerHTML = `
        <div id="wr-header">
            <div style="display:flex;align-items:center;gap:14px;">
                <div style="font-size:9px;letter-spacing:.18em;color:#2a8f8f;font-weight:800;text-transform:uppercase;">CHAUFFEUR EMPIRE</div>
                <div style="font-size:18px;font-weight:900;color:#2f74c0;letter-spacing:.05em;">WAR ROOM</div>
                ${offline ? `<span style="font-size:9px;color:#92400e;background:rgba(251,191,36,0.1);
                    border:1px solid rgba(251,191,36,0.25);border-radius:4px;padding:2px 8px;">⚠ offline</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:18px;">
                <div>
                    <span style="font-size:16px;font-weight:900;color:#c79a2a;">${totalMine}</span>
                    <span style="font-size:10px;color:#6b7280;"> / ${provinces.length} province</span>
                </div>
                <button class="wr-close-btn" ${ceAct('_wrClose', [])}>✕</button>
            </div>
        </div>
        <div id="wr-body">
            <div id="wr-map-pane">${mapSvg}</div>
            <div id="wr-sidebar">
                <div style="padding:10px 12px;border-bottom:1px solid #21262d;flex-shrink:0;">
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;">
                            <div style="width:11px;height:11px;background:#B8920A;border:1.5px solid #c79a2a;border-radius:2px;"></div> Mio
                        </div>
                        <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;">
                            <div style="width:11px;height:11px;background:#A02020;border:1.5px solid #db5746;border-radius:2px;"></div> Nemico
                        </div>
                        <div style="display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;">
                            <div style="width:11px;height:11px;background:#3A68A0;border:1px solid rgba(255,255,255,0.2);border-radius:2px;"></div> Libero
                        </div>
                    </div>
                </div>
                <div id="wr-sidebar-inner">
                    <div style="text-align:center;padding:40px 14px;animation:wrFadeIn .3s;">
                        <div style="font-size:30px;margin-bottom:10px;">🗺</div>
                        <div style="font-size:11px;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;">Clicca su una regione</div>
                        <div style="font-size:10px;color:#6b7280;margin-top:4px;line-height:1.5;">Seleziona una regione sulla mappa per vedere le province e conquistarle</div>
                    </div>
                </div>
            </div>
        </div>`;

    if (geo) _wrSetupInteractions(svgOwn);
}

window._wrClose = function () {
    document.getElementById('wr-overlay')?.remove();
    const panel = document.getElementById('main-panel');
    if (panel) panel.style.display = '';
    // Distruggi la mappa Mapbox che era attiva sotto l'overlay
    if (typeof window._destroyMap === 'function') window._destroyMap();
};

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
function _wrSetupInteractions(svgOwn) {
    const svg = document.querySelector('#wr-map-pane svg');
    if (!svg) return;

    svg.querySelectorAll('.wr-region').forEach(el => {
        el.addEventListener('click', () => {
            svg.querySelectorAll('.wr-region.wr-sel').forEach(e => e.classList.remove('wr-sel'));
            el.classList.add('wr-sel');
            _wrSelectedSvg = el.dataset.id;
            if (!_wrCache) return;
            const { provinces, regById } = _wrCache;
            const regionEntry = Object.values(regById).find(r => _WR_NAME_TO_SVG[r.name] === _wrSelectedSvg);
            const provs = regionEntry ? provinces.filter(p => p.region_id === regionEntry.id) : [];
            _wrShowSidebar(_wrSelectedSvg, _WR_LABELS[_wrSelectedSvg] || _wrSelectedSvg, regionEntry || null, provs);
        });
    });
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
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
        provHtml = `<div style="color:#6b7280;font-size:11px;text-align:center;padding:24px 0;">Nessuna provincia mappata.</div>`;
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
            const infCol  = unl ? '#1aa06a' : pct > 60 ? "#e0922e" : "#98a1ae";
            const cls     = isOwned ? 'is-mine' : isFree ? 'is-free' : 'is-enemy';
            const badge   = isOwned
                ? `<span style="color:#c79a2a;font-size:9px;">✦ Tua</span>`
                : isFree
                ? `<span style="color:#1aa06a;font-size:9px;">◎ Libera</span>`
                : `<span style="color:#db5746;font-size:9px;">⚔ ${p.owner_company}</span>`;

            let ctaHtml = '';
            if (isOwned) {
                ctaHtml = `<div style="font-size:9px;color:#1aa06a;background:rgba(34,197,94,0.07);
                    border:1px solid rgba(34,197,94,0.15);border-radius:5px;padding:5px 8px;">
                    ✅ Incassi il ${taxPct}%${amGov ? ` + ${taxReg}% (Gov)` : ''}</div>`;
            } else if (!unl) {
                ctaHtml = `<button class="wr-btn wr-btn-lock" style="width:100%;padding:6px;" disabled>
                    🔒 ${(thresh - myInf).toLocaleString()} pt mancanti</button>`;
            } else if (isFree) {
                ctaHtml = `<div style="display:flex;gap:5px;align-items:center;margin-bottom:3px;">
                    <input id="wri-${p.id}" type="number" min="${minOpa}" step="5000"
                        class="wr-offer-inp" placeholder="Min €${minOpa.toLocaleString()}">
                    <button class="wr-btn wr-btn-green" ${ceAct('_wrAcquire', [p.id])}>🏴 OPA</button>
                </div>
                <div style="font-size:9px;color:#6b7280;">Min €${minOpa.toLocaleString()}</div>`;
            } else {
                ctaHtml = `<div style="display:flex;gap:5px;align-items:center;margin-bottom:3px;">
                    <input id="wri-${p.id}" type="number" min="${hostOpa}" step="5000"
                        class="wr-offer-inp" style="border-color:rgba(239,68,68,0.3);"
                        placeholder="Min €${hostOpa.toLocaleString()}">
                    <button class="wr-btn wr-btn-red" ${ceAct('_wrAcquire', [p.id])}>⚔ Ostile</button>
                </div>
                <div style="font-size:9px;color:#6b7280;">+130% · Min €${hostOpa.toLocaleString()}</div>`;
            }

            provHtml += `<div class="wr-prov-card ${cls}">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:5px;">
                    <div>
                        <div style="font-size:12px;font-weight:800;color:#e2e8f0;">${p.name}</div>
                        <div style="font-size:9px;color:#6b7280;margin-top:1px;">${badge} · ${taxPct}% tassa</div>
                    </div>
                    <div style="font-size:12px;font-weight:900;color:#c79a2a;flex-shrink:0;">€${val.toLocaleString()}</div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;color:#6b7280;">
                    <span>Influenza</span>
                    <span style="color:${infCol};font-weight:700;">${myInf.toLocaleString()} / ${thresh.toLocaleString()} ${unl?'✅':''}</span>
                </div>
                <div class="wr-inf-track"><div class="wr-inf-fill" style="width:${pct}%;background:${infCol};"></div></div>
                <div style="margin-top:8px;">${ctaHtml}</div>
            </div>`;
        });
    }

    inner.innerHTML = `<div style="animation:wrFadeIn .2s;">
        <div style="margin-bottom:10px;">
            <div style="font-size:8px;letter-spacing:.15em;color:#2a8f8f;text-transform:uppercase;font-weight:800;margin-bottom:1px;">REGIONE</div>
            <div style="font-size:15px;font-weight:900;color:#2f74c0;">${regionName}</div>
            <div style="font-size:9px;color:#6b7280;margin-top:2px;">
                Gov: <span style="color:${govCompany?'#c79a2a':'#6a7480'};font-weight:700;">${govCompany||'Nessuno'}</span>
                · Tassa: <span style="color:#6b7280;font-weight:700;">${taxReg}%</span>
                ${amGov ? `<span style="color:#c79a2a;"> · 👑 SEI GOVERNATORE</span>` : ''}
            </div>
        </div>
        <div style="font-size:9px;color:#6b7280;background:#0d1a12;border:1px solid #1a4731;
            border-radius:6px;padding:6px 10px;margin-bottom:10px;line-height:1.5;">
            ${provs.length} province · >50% = Governatore + ${taxReg}% su corse regionali
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
        const result = await window.ServerState?.acquireProvince(provinceId, offer);
        if (result?.success) {
            showBigEvent('🏴', `${result.province_name} Conquistata!`, `Investimento: €${offer.toLocaleString()}`);
            _wrCache = null;
            renderTabWarRoom();
        }
    } catch (e) {
        showNotification(window.CE_Sec.userError('Operazione OPA non riuscita', e), 'error');
    }
};

window.renderTabWarRoom   = renderTabWarRoom;
window.renderTabProvinces = renderTabWarRoom;
