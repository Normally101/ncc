'use strict';
/* ====================================================================
   showroom.js — Chauffeur Empire · Autosalone Premium
   Fase 1: Galleria per categoria · Fase 2: Configuratore Mercedes-style
   ==================================================================== */

// ── Vehicle metadata (body type, desc, display stats) ──────────────
const _SRM_META = {
    stellar_e_exec:     { body:'berlina',     bodyLabel:'Berlina Executive',  desc:'La berlina executive di riferimento. Equilibrio perfetto tra rappresentanza e affidabilità operativa.',       stats:{ prestigio:6,  comfort:7,  durabilita:8,  velocita:6  } },
    stellar_q_exec:     { body:'berlina',     bodyLabel:'Berlina EV',         desc:'Controparte full-electric. Silenzio assoluto in cabina, zero emissioni, ricarica rapida DC.',                stats:{ prestigio:7,  comfort:7,  durabilita:8,  velocita:7  } },
    stellar_v_carr:     { body:'van',         bodyLabel:'Van Luxury',         desc:'Monovolume di alta classe per trasporti di gruppo in comfort superiore. 7 posti configurabili.',               stats:{ prestigio:6,  comfort:8,  durabilita:8,  velocita:5  } },
    stellar_q_carr:     { body:'van',         bodyLabel:'Van EV Luxury',      desc:'Minivan elettrico sette posti. Zero emissioni per clienti corporate con le esigenze più alte.',               stats:{ prestigio:7,  comfort:8,  durabilita:8,  velocita:6  } },
    stellar_s_imp:      { body:'ammiraglia',  bodyLabel:'Ammiraglia',         desc:'Limousine presidenziale. Salone posteriore da 2,1 m, isolamento acustico totale, privacy vetri.',            stats:{ prestigio:9,  comfort:9,  durabilita:8,  velocita:7  } },
    stellar_q_imp:      { body:'ammiraglia',  bodyLabel:'Ammiraglia EV',      desc:'Limousine elettrica ultra-silenziosa. L\'assenza di rumore motore eleva il comfort a livelli inediti.',       stats:{ prestigio:9,  comfort:9,  durabilita:8,  velocita:8  } },
    stellar_g_over:     { body:'suv',         bodyLabel:'SUV Blindato',       desc:'SUV ultra-armored certificato B4+. Comfort presidenziale in qualsiasi contesto operativo e terreno.',        stats:{ prestigio:9,  comfort:9,  durabilita:10, velocita:8  } },
    volt_3_urban:       { body:'city',        bodyLabel:'City EV',            desc:'Compatta elettrica per la mobilità urbana. Efficiente, manovrabile, zero emissioni in qualsiasi ZTL.',       stats:{ prestigio:5,  comfort:6,  durabilita:8,  velocita:7  } },
    volt_y_cross:       { body:'suv',         bodyLabel:'SUV EV',             desc:'SUV elettrico crossover. Versatile e sostenibile, si adatta a ogni territorio e tipologia di cliente.',      stats:{ prestigio:6,  comfort:7,  durabilita:8,  velocita:7  } },
    volt_s_apex:        { body:'granturismo', bodyLabel:'Gran Turismo EV',    desc:'Gran Turismo elettrica da 1.020 CV. Per clienti che pretendono il massimo in ogni chilometro.',             stats:{ prestigio:10, comfort:8,  durabilita:7,  velocita:10 } },
    volt_s_hyper:       { body:'hypercar',    bodyLabel:'Hypercar EV',        desc:'La punta di diamante. Tecnologia derivata dalla Formula, comfort da sala riunioni. Irripetibile.',           stats:{ prestigio:10, comfort:9,  durabilita:7,  velocita:10 } },
    majestic_spirit:    { body:'ammiraglia',  bodyLabel:'Ultra Luxury',       desc:'Il pinnacolo della mobilità terrestre. Commissionato da capi di stato, oligarchi e CEO Fortune 500.',       stats:{ prestigio:10, comfort:10, durabilita:9,  velocita:9  } },
    majestic_e_specter: { body:'ammiraglia',  bodyLabel:'Ultra Luxury EV',    desc:'Ultra-luxury elettrica. Zero emissioni, zero compromessi. Il futuro della mobilità presidenziale.',         stats:{ prestigio:10, comfort:10, durabilita:9,  velocita:10 } },
    // Nexus entry-level
    nexus_h_line:       { body:'berlina',     bodyLabel:'Berlina Entry',      desc:'La berlina d\'ingresso ideale per iniziare. Affidabile, economica da gestire, ottima per la formazione della flotta.',  stats:{ prestigio:4,  comfort:5,  durabilita:8,  velocita:6  } },
    // Volt expanded
    volt_ciudad:        { body:'city',        bodyLabel:'City EV Compact',    desc:'Piccola elettrica ultracompatta per la città. Perfetta nelle ZTL, costo operativo quasi zero.',                        stats:{ prestigio:5,  comfort:5,  durabilita:8,  velocita:7  } },
    volt_e_estate:      { body:'berlina',     bodyLabel:'Station Wagon EV',   desc:'Station wagon elettrica a ruote alte. Spazio bagagli XL, autonomia elevata, silenzio totale in cabina.',               stats:{ prestigio:7,  comfort:8,  durabilita:8,  velocita:7  } },
    // Majestic SUV
    majestic_citadel:   { body:'suv',         bodyLabel:'SUV Luxury',         desc:'SUV luxury urbano firmato Majestic. Presenza scenica, sospensioni pneumatiche adattive, interni in pelle pieno fiore.',stats:{ prestigio:8,  comfort:9,  durabilita:9,  velocita:7  } },
    // Stellar commercial
    stellar_m_cruiser:  { body:'van',         bodyLabel:'Van Commercial',     desc:'Monovolume commerciale per transfer aeroportuali e aziendali. Robusto, capiente, ottimo rapporto costo/km.',           stats:{ prestigio:5,  comfort:6,  durabilita:9,  velocita:5  } },
    // Aviazione Privata (Espansione 1)
    helicopter:         { body:'aviation',   bodyLabel:'Elicottero Privato', desc:'Airbus AS350 per transfer intercity rapidi. Zero traffico, max 6 passeggeri, atterraggio ovunque.',           stats:{ prestigio:10, comfort:8,  durabilita:7,  velocita:10 } },
    private_jet:        { body:'aviation',   bodyLabel:'Jet Privato',        desc:'Embraer Phenom 300. Il massimo della mobilità aerea privata per i tuoi clienti più esclusivi.',                 stats:{ prestigio:10, comfort:10, durabilita:8,  velocita:10 } },
};

const _SRM_FUEL_FILTERS = [
    { id:'all',      label:'Tutti',    icon:'⊞' },
    { id:'electric', label:'Elettrico',icon:'⚡' },
    { id:'thermal',  label:'Termico',  icon:'⛽' },
    { id:'aviation', label:'Aviazione',icon:'🚁' },
];

const _SRM_BRAND_FILTERS = [
    { id:'all',      label:'Tutti i Marchi', icon:'⊞' },
    { id:'stellar',  label:'Stellar',        icon:'★' },
    { id:'volt',     label:'Volt',           icon:'⚡' },
    { id:'majestic', label:'Majestic',       icon:'👑' },
    { id:'nexus',    label:'Nexus',          icon:'◈' },
    { id:'aviation', label:'Aviazione',      icon:'🚁' },
];

function _srmFuelGroup(v) {
    if (v.fuel === 'electric') return 'electric';
    if (v.fuel === 'avgas' || v.fuel === 'jet') return 'aviation';
    return 'thermal';
}

function _srmBrand(v) {
    const id = v.id || '';
    if (id.startsWith('stellar'))                              return 'stellar';
    if (id.startsWith('volt'))                                 return 'volt';
    if (id.startsWith('majestic'))                             return 'majestic';
    if (id.startsWith('nexus'))                                return 'nexus';
    if (id.startsWith('helicopter') || id.startsWith('private_jet')) return 'aviation';
    return 'other';
}

const _SRM_SECTIONS = [
    { id:'generali',  label:'Generali',   icon:'📋' },
    { id:'esterni',   label:'Esterni',    icon:'🎨' },
    { id:'interni',   label:'Interni',    icon:'💺' },
    { id:'speciali',  label:'Speciali',   icon:'⚙' },
    { id:'riepilogo', label:'Riepilogo',  icon:'✅' },
];

const _SRM_OPTIONS = [
    { section:'esterni',  id:'opt_vernice_pearl',   name:'Vernice Madreperla',      price:4000,  desc:'Finitura a lustro profondo, 12 strati applicati a mano.',              mods:{ prestigio:1 } },
    { section:'esterni',  id:'opt_cerchi_21',        name:'Cerchi 21" Forgiati',     price:6000,  desc:'Leghe forgiati monoblocco, riduzione peso di 4 kg per cerchio.',       mods:{ velocita:1 } },
    { section:'esterni',  id:'opt_tetto_panoramico', name:'Tetto Panoramico',        price:3500,  desc:'Vetro fisso 1,4 m² con oscuramento elettrocromico integrato.',         mods:{ comfort:1 } },
    { section:'esterni',  id:'opt_oscuramento',      name:'Oscuramento Integrale',   price:1500,  desc:'Vetri oscurati al 95% su tutti i finestrini, omologazione VIP.',       mods:{ prestigio:1 } },
    { section:'interni',  id:'opt_pelle_nappa',      name:'Pelle Nappa Piena',       price:8000,  desc:'Selleria artigianale in nappa italiana, concia vegetale 100%.',        mods:{ comfort:2 } },
    { section:'interni',  id:'opt_massaggi',         name:'Sedili Massaggianti',     price:5000,  desc:'16 punti di massaggio con riscaldamento, ventilazione e memoria.',     mods:{ comfort:1 } },
    { section:'interni',  id:'opt_audio_bespoke',    name:'Audio Bespoke 1500W',     price:7000,  desc:'24 altoparlanti, subwoofer integrato nella cassa strutturale.',        mods:{ comfort:1, prestigio:1 } },
    { section:'interni',  id:'opt_bar_bordo',        name:'Minibar a Bordo',         price:4500,  desc:'Frigorifero 8L + cristalleria firmata, compartimento refrigerato.',    mods:{ comfort:1 } },
    { section:'speciali', id:'opt_blindatura',       name:'Blindatura B4',           price:45000, desc:'Protezione balistica certificata B4, vetri 38mm, +340 kg strutturali.',mods:{ durabilita:3 } },
    { section:'speciali', id:'opt_chauffeur_ai',     name:'Chauffeur AI System',     price:15000, desc:'Routing intelligente, anticollisione proattiva, monitoraggio passeggeri.',mods:{ velocita:1, prestigio:2 } },
];

// ── Module state ────────────────────────────────────────────────────
const _srmState = {
    view:           'gallery',
    selectedId:     null,
    section:        'generali',
    selectedOpts:   new Set(),
    filterFuel:     'all',
    filterBrand:    'all',
    animFrame:      null,
    displayedPrice: 0,
    targetPrice:    0,
};

// ── Helpers ─────────────────────────────────────────────────────────
function _srmCatalog() {
    return (typeof STELLAR_VOLT_CATALOG !== 'undefined') ? STELLAR_VOLT_CATALOG : [];
}
function _srmVehicle(id) {
    return _srmCatalog().find(c => c.id === id || c.vehicleClass === id) || null;
}
function _srmTierColor(tier) {
    const t = (tier || '').toUpperCase();
    if (t === 'PRESIDENTIAL' || t === 'ULTRA') return '#b040ff';
    if (t === 'ARMORED')                        return '#ef4444';
    if (t === 'VIP')                            return '#d4af37';
    if (t === 'PREMIUM')                        return '#60a5fa';
    return '#6b7280';
}
function _srmTotalPrice() {
    const v = _srmVehicle(_srmState.selectedId);
    if (!v) return 0;
    let t = v.price;
    for (const oid of _srmState.selectedOpts) {
        const opt = _SRM_OPTIONS.find(o => o.id === oid);
        if (opt) t += opt.price;
    }
    return t;
}
function _srmComputeStats() {
    const meta = _SRM_META[_srmState.selectedId];
    if (!meta) return { prestigio:0, comfort:0, durabilita:0, velocita:0 };
    const s = { ...meta.stats };
    for (const oid of _srmState.selectedOpts) {
        const opt = _SRM_OPTIONS.find(o => o.id === oid);
        if (opt) for (const [k, v] of Object.entries(opt.mods)) s[k] = Math.min(12, (s[k]||0) + v);
    }
    return s;
}
function _srmOptCount(sectionId) {
    return _SRM_OPTIONS.filter(o => o.section === sectionId && _srmState.selectedOpts.has(o.id)).length;
}

// ── CSS (once) ───────────────────────────────────────────────────────
function _srmInjectStyles() {
    if (document.getElementById('srm-styles')) return;
    const st = document.createElement('style');
    st.id = 'srm-styles';
    st.textContent = `
        /* ── Full-screen overlay ── */
        #srm-overlay {
            position:fixed; inset:0; z-index:4500;
            background:#070c14; display:flex; flex-direction:column;
            font-family:system-ui,sans-serif;
        }
        /* ── Gallery top bar ── */
        #srm-gallery-topbar {
            display:flex; align-items:center; justify-content:space-between;
            padding:14px 24px; border-bottom:1px solid rgba(255,255,255,0.07);
            background:#08111e; flex-shrink:0;
        }
        #srm-gallery-topbar .srm-logo { font-size:18px; font-weight:900; color:#e2e8f0; letter-spacing:.04em; }
        #srm-gallery-topbar .srm-logo span { color:#00d4ff; }
        .srm-close-btn {
            width:34px; height:34px; border-radius:50%; border:1px solid rgba(255,255,255,0.12);
            background:transparent; color:#6b7280; font-size:16px; cursor:pointer;
            display:flex; align-items:center; justify-content:center; transition:all .15s;
        }
        .srm-close-btn:hover { border-color:rgba(255,255,255,0.3); color:#e2e8f0; background:rgba(255,255,255,0.06); }
        /* ── Filter bar ── */
        #srm-filter-bar {
            display:flex; flex-direction:column; gap:0;
            border-bottom:1px solid rgba(255,255,255,0.05);
            background:#070c14; flex-shrink:0;
        }
        .srm-filter-row {
            display:flex; align-items:center; gap:6px;
            padding:8px 24px; flex-wrap:wrap;
        }
        .srm-filter-row:first-child { border-bottom:1px solid rgba(255,255,255,0.04); }
        .srm-filter-label {
            font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:.12em;
            color:#374151; margin-right:4px; width:52px; flex-shrink:0;
        }
        .srm-fbtn {
            padding:5px 14px; border-radius:20px; font-size:11px; font-weight:700;
            cursor:pointer; border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04); color:#6b7280;
            transition:all .18s; letter-spacing:.04em;
        }
        .srm-fbtn:hover  { border-color:rgba(255,255,255,0.25); color:#9ca3af; }
        /* fuel row active */
        .srm-filter-row.fuel-row .srm-fbtn.srm-fa { background:rgba(0,212,255,0.12); border-color:rgba(0,212,255,0.4); color:#00d4ff; }
        /* brand row active */
        .srm-filter-row.brand-row .srm-fbtn.srm-fa { background:rgba(168,85,247,0.12); border-color:rgba(168,85,247,0.4); color:#c084fc; }
        /* ── Gallery grid ── */
        #srm-grid-wrap { flex:1; overflow-y:auto; }
        #srm-grid {
            display:grid; grid-template-columns:repeat(4,1fr);
            gap:16px; padding:20px 24px;
        }
        @media (max-width:1200px) { #srm-grid { grid-template-columns:repeat(3,1fr); } }
        @media (max-width:800px)  { #srm-grid { grid-template-columns:repeat(2,1fr); } }
        .srm-vcard {
            border-radius:12px; overflow:hidden;
            border:1px solid rgba(255,255,255,0.07);
            background:#0d1520; cursor:pointer;
            transition:transform .2s, border-color .2s, box-shadow .2s;
        }
        .srm-vcard:hover {
            transform:translateY(-4px);
            border-color:rgba(0,212,255,0.4);
            box-shadow:0 16px 48px rgba(0,0,0,0.7);
        }
        .srm-vcard-photo { width:100%; aspect-ratio:16/9; object-fit:cover; display:block; background:#0a0f1e; }
        .srm-vcard-body  { padding:14px; }
        .srm-vcard-tier  { font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; margin-bottom:3px; }
        .srm-vcard-name  { font-size:15px; font-weight:700; color:#e2e8f0; margin-bottom:3px; }
        .srm-vcard-sub   { font-size:10px; color:#6b7280; margin-bottom:12px; display:flex; align-items:center; gap:6px; }
        .srm-vcard-price { font-size:18px; font-weight:800; color:#fff; letter-spacing:-.02em; }
        .srm-vcard-cta   { display:flex; align-items:center; justify-content:space-between; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06); }
        .srm-vcard-btn   { padding:8px 18px; border-radius:8px; font-size:11px; font-weight:700; border:none; cursor:pointer; background:rgba(0,212,255,0.12); color:#00d4ff; transition:all .18s; }
        .srm-vcard-btn:hover { background:rgba(0,212,255,0.24); }
        .srm-fuel-ev  { background:rgba(34,211,238,0.12); color:#22d3ee; font-size:8px; font-weight:700; padding:2px 6px; border-radius:4px; }
        .srm-fuel-gas { background:rgba(251,191,36,0.1);  color:#fbbf24; font-size:8px; font-weight:700; padding:2px 6px; border-radius:4px; }
        /* ── Configurator ── */
        #srm-config { display:flex; flex-direction:column; height:100%; }
        #srm-cfg-topbar {
            display:flex; align-items:center; gap:14px;
            padding:12px 24px; border-bottom:1px solid rgba(255,255,255,0.07);
            background:#08111e; flex-shrink:0;
        }
        #srm-cfg-back {
            padding:7px 14px; border-radius:8px; font-size:11px; font-weight:700;
            border:1px solid rgba(255,255,255,0.1); background:transparent;
            color:#6b7280; cursor:pointer; transition:all .15s; white-space:nowrap;
        }
        #srm-cfg-back:hover { border-color:rgba(255,255,255,0.3); color:#9ca3af; }
        #srm-cfg-title { flex:1; }
        #srm-cfg-vname { font-size:17px; font-weight:800; color:#e2e8f0; }
        #srm-cfg-vsub  { font-size:11px; color:#4b5563; margin-top:2px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        #srm-cfg-price { font-size:22px; font-weight:900; color:#00d4ff; font-family:monospace; white-space:nowrap; }
        #srm-cfg-body  { flex:1; display:flex; overflow:hidden; }
        #srm-cfg-sidebar {
            width:180px; flex-shrink:0; padding:12px 8px;
            border-right:1px solid rgba(255,255,255,0.06);
            background:#08111e; overflow-y:auto;
        }
        .srm-sec-btn {
            width:100%; display:flex; align-items:center; gap:9px;
            padding:11px 12px; border-radius:8px; margin-bottom:2px;
            border:none; background:transparent; cursor:pointer;
            text-align:left; transition:all .15s; position:relative;
        }
        .srm-sec-btn:hover { background:rgba(255,255,255,0.04); }
        .srm-sec-btn.srm-active { background:rgba(0,212,255,0.1); }
        .srm-sec-icon  { font-size:15px; flex-shrink:0; }
        .srm-sec-label { font-size:12px; font-weight:600; color:#9ca3af; }
        .srm-sec-btn.srm-active .srm-sec-label { color:#00d4ff; }
        .srm-sec-badge {
            position:absolute; right:10px; top:50%; transform:translateY(-50%);
            background:#00d4ff; color:#000; font-size:8px; font-weight:900;
            width:16px; height:16px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
        }
        #srm-cfg-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        #srm-cfg-photo-wrap { flex-shrink:0; background:#080e1a; overflow:hidden; height:42vh; }
        #srm-cfg-photo { width:100%; height:100%; object-fit:cover; display:block; }
        #srm-cfg-content { flex:1; overflow-y:auto; padding:20px 24px; }
        /* Stats */
        .srm-stat-row   { margin-bottom:12px; }
        .srm-stat-hd    { font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:.07em; display:flex; justify-content:space-between; margin-bottom:4px; }
        .srm-stat-track { height:5px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden; }
        .srm-stat-fill  { height:100%; border-radius:3px; transition:width .5s cubic-bezier(.4,0,.2,1); background:#00d4ff; }
        /* Option cards */
        .srm-opt-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        .srm-opt-card {
            display:flex; align-items:flex-start; gap:12px;
            padding:14px 16px; border-radius:10px;
            border:1px solid rgba(255,255,255,0.07);
            background:rgba(255,255,255,0.02); cursor:pointer; transition:all .18s;
        }
        .srm-opt-card:hover { border-color:rgba(0,212,255,0.3); background:rgba(0,40,80,0.28); }
        .srm-opt-card.srm-sel { border-color:rgba(0,212,255,0.65); background:rgba(0,55,100,0.38); }
        .srm-opt-chk {
            width:20px; height:20px; flex-shrink:0; border-radius:4px; margin-top:2px;
            border:1.5px solid rgba(255,255,255,0.2); display:flex; align-items:center;
            justify-content:center; font-size:11px; transition:all .15s;
        }
        .srm-opt-card.srm-sel .srm-opt-chk { background:#00d4ff; border-color:#00d4ff; color:#000; font-weight:900; }
        .srm-opt-info  { flex:1; }
        .srm-opt-name  { font-size:12px; font-weight:700; color:#e2e8f0; }
        .srm-opt-desc  { font-size:10px; color:#6b7280; margin-top:3px; line-height:1.45; }
        .srm-opt-foot  { display:flex; align-items:center; gap:8px; margin-top:8px; }
        .srm-opt-price { font-size:13px; font-weight:700; color:#fff; }
        .srm-opt-mods  { font-size:9px; color:#22d3ee; background:rgba(34,211,238,0.1); padding:2px 7px; border-radius:3px; }
        /* Riepilogo */
        .srm-recap-row { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px; }
        .srm-recap-row:last-child { border:none; }
        .srm-buy-btn {
            width:100%; padding:18px; border-radius:12px; font-size:15px; font-weight:800;
            border:none; cursor:pointer; letter-spacing:.08em; text-transform:uppercase;
            background:linear-gradient(135deg,#0066aa,#0099cc);
            color:#fff; box-shadow:0 6px 28px rgba(0,120,200,0.3); transition:all .2s; margin-top:18px;
        }
        .srm-buy-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 36px rgba(0,120,200,0.5); }
        .srm-buy-btn:disabled { background:rgba(255,255,255,0.05); color:#374151; cursor:not-allowed; box-shadow:none; }
    `;
    document.head.appendChild(st);
}

// ── Main entry point ─────────────────────────────────────────────────
function renderTabShowroom() {
    _srmInjectStyles();
    let overlay = document.getElementById('srm-overlay');
    if (!overlay) {
        _srmState.view = 'gallery';
        _srmState.selectedId = null;
        _srmState.selectedOpts.clear();
        overlay = document.createElement('div');
        overlay.id = 'srm-overlay';
        document.body.appendChild(overlay);
        const panel = document.getElementById('main-panel');
        if (panel) panel.style.display = 'none';
    }
    const tc = document.getElementById('tab-container');
    if (tc) tc.innerHTML = '';
    if (_srmState.view === 'gallery') {
        _srmRenderGallery(overlay);
    } else {
        _srmRenderConfig(overlay);
    }
}

window._srmClose = function() {
    if (_srmState.animFrame) { cancelAnimationFrame(_srmState.animFrame); _srmState.animFrame = null; }
    document.getElementById('srm-overlay')?.remove();
    const panel = document.getElementById('main-panel');
    if (panel) panel.style.display = '';
};

// ═══════════════════════════════════════════════════════════════════
// GALLERY
// ═══════════════════════════════════════════════════════════════════
function _srmRenderGallery(overlay) {
    const catalog = _srmCatalog();
    const activeFuel  = _srmState.filterFuel;
    const activeBrand = _srmState.filterBrand;

    const filtered = catalog.filter(v => {
        const fuelOk  = activeFuel  === 'all' || _srmFuelGroup(v) === activeFuel;
        const brandOk = activeBrand === 'all' || _srmBrand(v)    === activeBrand;
        return fuelOk && brandOk;
    });

    const fuelRowHtml = _SRM_FUEL_FILTERS.map(f => {
        const count = f.id === 'all' ? catalog.length
            : catalog.filter(v => _srmFuelGroup(v) === f.id).length;
        if (count === 0 && f.id !== 'all') return '';
        return `<button class="srm-fbtn${activeFuel === f.id ? ' srm-fa' : ''}" onclick="window._srmFilterFuel('${f.id}')">
            ${f.icon} ${f.label} <span style="opacity:0.5;font-weight:400">${count}</span>
        </button>`;
    }).join('');

    const brandRowHtml = _SRM_BRAND_FILTERS.map(f => {
        const count = f.id === 'all' ? catalog.length
            : catalog.filter(v => _srmBrand(v) === f.id).length;
        if (count === 0 && f.id !== 'all') return '';
        return `<button class="srm-fbtn${activeBrand === f.id ? ' srm-fa' : ''}" onclick="window._srmFilterBrand('${f.id}')">
            ${f.icon} ${f.label} <span style="opacity:0.5;font-weight:400">${count}</span>
        </button>`;
    }).join('');

    const filterHtml = `
        <div class="srm-filter-row fuel-row">
            <span class="srm-filter-label">Motore</span>${fuelRowHtml}
        </div>
        <div class="srm-filter-row brand-row">
            <span class="srm-filter-label">Marchio</span>${brandRowHtml}
        </div>`;

    const cardsHtml = filtered.map(v => {
        const meta = _SRM_META[v.id] || _SRM_META[v.vehicleClass] || {};
        const isEV = v.fuel === 'electric';
        const tierColor = _srmTierColor(v.tier);
        const totalRides = gameState?.questStats?.totalRides || 0;
        const hasEV = gameState?.hasEVHub || false;
        const locked = (v.rideGate || 0) > totalRides
            ? `🔒 Richiede ${v.rideGate} corse`
            : (isEV && !hasEV ? '⚡ Richiede Hub di Ricarica' : null);

        return `<div class="srm-vcard" style="position:relative;${locked ? 'opacity:0.6' : ''}" onclick="${locked ? '' : `window._srmOpenConfig('${v.id}')`}">
            <img class="srm-vcard-photo" src="${v.img}" alt="${v.name}" onerror="this.style.display='none'">
            <div class="srm-vcard-body">
                <div class="srm-vcard-tier" style="color:${tierColor}">${v.tier}</div>
                <div class="srm-vcard-name">${v.name}</div>
                <div class="srm-vcard-sub">
                    <span>${meta.bodyLabel || ''}</span>
                    <span class="${isEV ? 'srm-fuel-ev' : 'srm-fuel-gas'}">${isEV ? '⚡ EV' : '⛽ Benzina'}</span>
                </div>
                <div class="srm-vcard-cta">
                    <div class="srm-vcard-price">€ ${(v.price || 0).toLocaleString('it-IT')}</div>
                    ${locked
                        ? `<span style="font-size:9px;color:#ef4444;">${locked}</span>`
                        : `<button class="srm-vcard-btn" onclick="window._srmOpenConfig('${v.id}')">Configura →</button>`
                    }
                </div>
            </div>
        </div>`;
    }).join('');

    overlay.innerHTML = `
        <div id="srm-gallery-topbar">
            <div class="srm-logo">CHAUFFEUR <span>SHOWROOM</span></div>
            <button class="srm-close-btn" onclick="window._srmClose()">✕</button>
        </div>
        <div id="srm-filter-bar">${filterHtml}</div>
        <div id="srm-grid-wrap">
            <div id="srm-grid">${cardsHtml || '<div style="padding:32px;text-align:center;color:#374151;font-size:12px;">Nessun modello disponibile.</div>'}</div>
        </div>`;
}

window._srmFilterFuel = function(fuelId) {
    _srmState.filterFuel = fuelId;
    const overlay = document.getElementById('srm-overlay');
    if (overlay) _srmRenderGallery(overlay);
    else renderTabShowroom();
};

window._srmFilterBrand = function(brandId) {
    _srmState.filterBrand = brandId;
    const overlay = document.getElementById('srm-overlay');
    if (overlay) _srmRenderGallery(overlay);
    else renderTabShowroom();
};

window._srmOpenConfig = function(vehicleId) {
    _srmState.selectedId = vehicleId;
    _srmState.view = 'config';
    _srmState.section = 'generali';
    _srmState.selectedOpts.clear();
    const overlay = document.getElementById('srm-overlay');
    if (overlay) _srmRenderConfig(overlay);
    else renderTabShowroom();
};

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATOR
// ═══════════════════════════════════════════════════════════════════
function _srmRenderConfig(overlay) {
    const v    = _srmVehicle(_srmState.selectedId);
    const meta = _SRM_META[_srmState.selectedId] || {};
    if (!v) { _srmState.view = 'gallery'; _srmRenderGallery(overlay); return; }

    const tierColor = _srmTierColor(v.tier);
    const isEV = v.fuel === 'electric';
    const total = _srmTotalPrice();
    const selCount = _srmState.selectedOpts.size;

    const sidebarHtml = _SRM_SECTIONS.map(s => {
        const count = (s.id === 'esterni' || s.id === 'interni' || s.id === 'speciali') ? _srmOptCount(s.id) : 0;
        const isAct = _srmState.section === s.id;
        return `<button class="srm-sec-btn${isAct ? ' srm-active' : ''}" onclick="window._srmSetSection('${s.id}')">
            <span class="srm-sec-icon">${s.icon}</span>
            <span class="srm-sec-label">${s.label}</span>
            ${count > 0 ? `<span class="srm-sec-badge">${count}</span>` : ''}
        </button>`;
    }).join('');

    const contentHtml = _srmSectionContent(v, meta);

    overlay.innerHTML = `<div id="srm-config">
        <div id="srm-cfg-topbar">
            <button id="srm-cfg-back" onclick="window._srmBackToGallery()">← Galleria</button>
            <div id="srm-cfg-title">
                <div id="srm-cfg-vname">${v.name}</div>
                <div id="srm-cfg-vsub">
                    <span style="color:${tierColor};font-weight:800">${v.tier}</span>
                    · ${meta.bodyLabel || ''}
                    · <span class="${isEV ? 'srm-fuel-ev' : 'srm-fuel-gas'}">${isEV ? '⚡ EV' : '⛽ Benzina'}</span>
                    ${selCount > 0 ? `<span style="color:#d4af37;margin-left:6px;">+${selCount} optional</span>` : ''}
                </div>
            </div>
            <div id="srm-cfg-price">€ ${total.toLocaleString('it-IT')}</div>
            <button class="srm-close-btn" onclick="window._srmClose()" style="margin-left:12px;">✕</button>
        </div>
        <div id="srm-cfg-body">
            <div id="srm-cfg-sidebar">${sidebarHtml}</div>
            <div id="srm-cfg-main">
                <div id="srm-cfg-photo-wrap">
                    <img id="srm-cfg-photo" src="${v.img}" alt="${v.name}" onerror="this.style.display='none'">
                </div>
                <div id="srm-cfg-content">${contentHtml}</div>
            </div>
        </div>
    </div>`;

    _srmAnimatePrice(true);
}

function _srmSectionContent(v, meta) {
    const section = _srmState.section;

    if (section === 'generali') {
        const stats = _srmComputeStats();
        const statMeta = { prestigio:'🌟 Prestigio', comfort:'🛋️ Comfort', durabilita:'🛡️ Durabilità', velocita:'⚡ Velocità' };
        const statBars = Object.entries(statMeta).map(([k, label]) => {
            const val = stats[k] || 0;
            const pct = Math.min(100, (val / 12) * 100);
            return `<div class="srm-stat-row">
                <div class="srm-stat-hd"><span>${label}</span><span style="color:#e2e8f0;font-weight:700">${val}</span></div>
                <div class="srm-stat-track"><div class="srm-stat-fill" style="width:${pct}%"></div></div>
            </div>`;
        }).join('');

        return `<div style="font-size:12px;color:#9ca3af;line-height:1.6;margin-bottom:20px;">${meta.desc || ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 12px;">
                <div style="font-size:8px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Prezzo base</div>
                <div style="font-size:14px;font-weight:800;color:#fff">€ ${(v.price||0).toLocaleString('it-IT')}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 12px;">
                <div style="font-size:8px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Propulsione</div>
                <div style="font-size:13px;font-weight:700;color:${v.fuel==='electric'?'#22d3ee':'#fbbf24'}">${v.fuel==='electric'?'⚡ Full Electric':'⛽ Benzina'}</div>
            </div>
            ${(v.rideGate||0) > 0 ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 12px;">
                <div style="font-size:8px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Corse richieste</div>
                <div style="font-size:13px;font-weight:700;color:#f59e0b">${(v.rideGate||0).toLocaleString()}</div>
            </div>` : ''}
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 12px;">
                <div style="font-size:8px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;">Classe</div>
                <div style="font-size:13px;font-weight:700;color:${_srmTierColor(v.tier)}">${v.tier}</div>
            </div>
        </div>
        <div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Statistiche Operative</div>
        ${statBars}`;
    }

    if (section === 'riepilogo') {
        const selectedOpts = [..._srmState.selectedOpts].map(oid => _SRM_OPTIONS.find(o => o.id === oid)).filter(Boolean);
        const total = _srmTotalPrice();
        const canAfford = (gameState?.cash || 0) >= total;

        const optsHtml = selectedOpts.length > 0
            ? selectedOpts.map(o => `<div class="srm-recap-row">
                <span style="color:#9ca3af;">${o.name}</span>
                <span style="color:#e2e8f0;font-weight:700">+€ ${o.price.toLocaleString('it-IT')}</span>
              </div>`).join('')
            : `<div style="font-size:11px;color:#374151;padding:8px 0;">Nessun optional selezionato</div>`;

        return `<div style="margin-bottom:16px;">
            <div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">Riepilogo Configurazione</div>
            <div class="srm-recap-row">
                <span style="color:#9ca3af;">Veicolo base</span>
                <span style="color:#e2e8f0;font-weight:700">€ ${(v.price||0).toLocaleString('it-IT')}</span>
            </div>
            ${optsHtml}
            <div style="border-top:1px solid rgba(255,255,255,0.12);margin-top:8px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:800;color:#e2e8f0;">Totale</span>
                <span style="font-size:20px;font-weight:900;color:#00d4ff;font-family:monospace;">€ ${total.toLocaleString('it-IT')}</span>
            </div>
            ${!canAfford ? `<div style="font-size:10px;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:7px;padding:8px 10px;margin-top:10px;">
                ⚠ Fondi insufficienti. Hai € ${(gameState?.cash||0).toLocaleString('it-IT')}, mancano € ${(total-(gameState?.cash||0)).toLocaleString('it-IT')}.
            </div>` : ''}
        </div>
        <button class="srm-buy-btn" id="srm-buy-btn" onclick="window._srmPurchase()" ${!canAfford ? 'disabled' : ''}>
            Acquista ${v.name}
        </button>`;
    }

    // Esterni / Interni / Speciali — option cards
    const sectionOpts = _SRM_OPTIONS.filter(o => o.section === section);
    if (!sectionOpts.length) return `<div style="color:#374151;font-size:11px;text-align:center;padding:24px;">Nessun optional disponibile per questa categoria.</div>`;

    const cards = sectionOpts.map(o => {
        const sel = _srmState.selectedOpts.has(o.id);
        const modStr = Object.entries(o.mods).map(([k,val]) => `+${val} ${k}`).join(' · ');
        return `<div class="srm-opt-card${sel ? ' srm-sel' : ''}" onclick="window._srmToggle('${o.id}')">
            <div class="srm-opt-chk">${sel ? '✓' : ''}</div>
            <div class="srm-opt-info">
                <div class="srm-opt-name">${o.name}</div>
                <div class="srm-opt-desc">${o.desc}</div>
                <div class="srm-opt-foot">
                    <span class="srm-opt-price">+€ ${o.price.toLocaleString('it-IT')}</span>
                    <span class="srm-opt-mods">${modStr}</span>
                </div>
            </div>
        </div>`;
    }).join('');

    return `<div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">${_SRM_SECTIONS.find(s=>s.id===section)?.label || ''}</div>
    <div class="srm-opt-grid">${cards}</div>`;
}

// ── Navigation ───────────────────────────────────────────────────────
window._srmBackToGallery = function() {
    _srmState.view = 'gallery';
    _srmState.selectedId = null;
    _srmState.selectedOpts.clear();
    const overlay = document.getElementById('srm-overlay');
    if (overlay) _srmRenderGallery(overlay);
    else renderTabShowroom();
};

window._srmSetSection = function(sectionId) {
    _srmState.section = sectionId;
    const content = document.getElementById('srm-cfg-content');
    if (content) {
        const v    = _srmVehicle(_srmState.selectedId);
        const meta = _SRM_META[_srmState.selectedId] || {};
        content.innerHTML = _srmSectionContent(v, meta);
    }
    document.querySelectorAll('.srm-sec-btn').forEach(btn => {
        const sid = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        btn.classList.toggle('srm-active', sid === sectionId);
        btn.querySelector('.srm-sec-label').style.color = sid === sectionId ? '#00d4ff' : '#9ca3af';
    });
};

// ── Option toggle ────────────────────────────────────────────────────
window._srmToggle = function(optId) {
    if (_srmState.selectedOpts.has(optId)) {
        _srmState.selectedOpts.delete(optId);
    } else {
        _srmState.selectedOpts.add(optId);
    }
    // Update card UI
    document.querySelectorAll('.srm-opt-card').forEach(el => {
        const m = el.getAttribute('onclick')?.match(/'([^']+)'/);
        if (!m) return;
        const sel = _srmState.selectedOpts.has(m[1]);
        el.classList.toggle('srm-sel', sel);
        const chk = el.querySelector('.srm-opt-chk');
        if (chk) chk.textContent = sel ? '✓' : '';
    });
    // Update section badges
    document.querySelectorAll('.srm-sec-btn').forEach(btn => {
        const sid = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (!sid || !['esterni','interni','speciali'].includes(sid)) return;
        const count = _srmOptCount(sid);
        let badge = btn.querySelector('.srm-sec-badge');
        if (count > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'srm-sec-badge'; btn.appendChild(badge); }
            badge.textContent = count;
        } else {
            badge?.remove();
        }
    });
    // Update topbar sub label
    const sub = document.getElementById('srm-cfg-vsub');
    if (sub) {
        const v = _srmVehicle(_srmState.selectedId);
        const meta = _SRM_META[_srmState.selectedId] || {};
        const isEV = v?.fuel === 'electric';
        const selCount = _srmState.selectedOpts.size;
        sub.innerHTML = `<span style="color:${_srmTierColor(v?.tier)};font-weight:800">${v?.tier||''}</span>
            · ${meta.bodyLabel || ''}
            · <span class="${isEV ? 'srm-fuel-ev' : 'srm-fuel-gas'}">${isEV ? '⚡ EV' : '⛽ Benzina'}</span>
            ${selCount > 0 ? `<span style="color:#d4af37;margin-left:6px;">+${selCount} optional</span>` : ''}`;
    }
    _srmAnimatePrice(false);
};

// ── Price animation ──────────────────────────────────────────────────
function _srmAnimatePrice(instant) {
    const target = _srmTotalPrice();
    _srmState.targetPrice = target;
    if (instant) {
        _srmState.displayedPrice = target;
        const el = document.getElementById('srm-cfg-price');
        if (el) el.textContent = '€ ' + Math.round(target).toLocaleString('it-IT');
        return;
    }
    if (_srmState.animFrame) cancelAnimationFrame(_srmState.animFrame);
    const tick = () => {
        const diff = _srmState.targetPrice - _srmState.displayedPrice;
        if (Math.abs(diff) < 1) { _srmState.displayedPrice = _srmState.targetPrice; }
        else { _srmState.displayedPrice += diff * 0.14; }
        const el = document.getElementById('srm-cfg-price');
        if (el) el.textContent = '€ ' + Math.round(_srmState.displayedPrice).toLocaleString('it-IT');
        if (_srmState.displayedPrice !== _srmState.targetPrice)
            _srmState.animFrame = requestAnimationFrame(tick);
    };
    _srmState.animFrame = requestAnimationFrame(tick);
}

// ── Purchase ─────────────────────────────────────────────────────────
window._srmPurchase = async function() {
    const v = _srmVehicle(_srmState.selectedId);
    if (!v) return;
    const total = _srmTotalPrice();
    const opts  = [..._srmState.selectedOpts];

    if ((gameState.cash || 0) < total) {
        showNotification(`Fondi insufficienti. Servono € ${total.toLocaleString('it-IT')}`, 'error');
        return;
    }
    const btn = document.getElementById('srm-buy-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Elaborazione acquisto…'; }

    const result = await ServerState.buyVehicle(v.id, total, ServerState.getCompany()?.hq_city || 'roma');
    if (!result) {
        if (btn) { btn.disabled = false; btn.textContent = `Acquista ${v.name}`; }
        return;
    }
    // Mappa i tier del catalogo Showroom ai tier compatibili con TIER_COMPATIBILITY
    const _SHOWROOM_TIER_MAP = {
        BUSINESS:'business', PREMIUM:'business', STANDARD:'standard',
        PRESIDENTIAL:'ultra', ARMORED:'ultra', ULTRA:'ultra', VIP:'vip', GROUP:'group'
    };
    gameState.fleet.push({
        id: 'c_' + Date.now(), _serverId: result.id,
        name: v.name, tier: _SHOWROOM_TIER_MAP[(v.tier||'').toUpperCase()] || 'business',
        condition: 100, isLease: false, fuel: 100, mileage: 0,
        tirePressure: 100, engineHealth: 100, outOfService: false,
        upgrades: opts, vehicleClass: v.id,
    });
    _srmState.selectedOpts.clear();
    updateUI();
    if (typeof saveGame === 'function') saveGame();
    showBigEvent('🚗', `${v.name} Acquisita!`,
        opts.length > 0 ? `${opts.length} optional installati · pronta al servizio.` : 'Veicolo pronto per la flotta.');
    if (['PRESIDENTIAL','ULTRA','ARMORED'].includes((v.tier||'').toUpperCase()) && v.price >= 300000) {
        if (typeof _broadcastNews === 'function')
            _broadcastNews(`${gameState.companyName} ha acquisito una ${v.name} 🚗`, 'milestone');
    }
    _srmState.view = 'gallery';
    _srmState.selectedId = null;
    const overlay = document.getElementById('srm-overlay');
    if (overlay) _srmRenderGallery(overlay);
    else renderTabShowroom();
};
