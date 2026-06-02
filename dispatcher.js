'use strict';
/* ================================================================
   dispatcher.js — Chauffeur Empire
   Startup state, switchTab routing, showNotification, togglePanel,
   openMapOverlay, closeMapOverlay. Highway data constants.
   Dipendenze: engine.js, ui-*.js (renderTab* functions)
   ================================================================ */

function _isMobile() {
    return window.innerWidth < 768;
}
window._fleetFilter = { brand: null, tier: null };
let _fleetFilter = window._fleetFilter;
let _poiMarkers = {};
let _vehicleMarkers = {};
let _routeLines = {};
let _rideGeomCache = {}; // survives ride removal from activeRides so activeTrips can position marker at dest

const HIGHWAYS = {
    // ─── LAZIO INTERNO ───────────────────────────────────────────────────
    'roma-roma_fco':         { req:['lazio'],               path:[[41.90,12.50],[41.85,12.38],[41.80,12.25]] },
    'roma-roma_hassler':     { req:['lazio'],               path:[[41.90,12.50],[41.91,12.48]] },
    'roma-civitavecchia':    { req:['lazio'],               path:[[41.90,12.50],[41.95,12.20],[42.09,11.79]] },
    'roma_fco-civitavecchia':{ req:['lazio'],               path:[[41.80,12.25],[41.85,12.10],[42.09,11.79]] },
    // ─── A1 AUTOSTRADA DEL SOLE ──────────────────────────────────────────
    'roma-firenze':      { req:['lazio','toscana'],          path:[[41.90,12.50],[42.46,12.39],[42.72,11.95],[43.02,11.94],[43.47,11.88],[43.77,11.26]] },
    'firenze-bologna':   { req:['toscana','emilia'],         path:[[43.77,11.26],[43.89,11.15],[44.05,11.22],[44.29,11.50],[44.49,11.34]] },
    'bologna-milano':    { req:['emilia','lombardia'],       path:[[44.49,11.34],[44.65,10.93],[44.80,10.33],[45.05,9.69],[45.31,9.50],[45.47,9.19]] },
    // ─── A4 SERENISSIMA (Torino–Milano–Venezia–Trieste) ──────────────────
    'torino-milano':     { req:['piemonte','lombardia'],     path:[[45.07,7.69],[45.33,8.42],[45.45,8.62],[45.47,9.19]] },
    'milano-venezia':    { req:['lombardia','veneto'],       path:[[45.47,9.19],[45.54,10.23],[45.44,10.99],[45.55,11.55],[45.44,12.32]] },
    'venezia-trieste':   { req:['veneto','friuli'],          path:[[45.44,12.32],[45.77,12.83],[45.65,13.40],[45.65,13.78]] },
    // ─── A22 BRENNERO (Verona/Venezia–Trento / Bologna–Trento) ──────────
    'venezia-trento':    { req:['veneto','trentino'],        path:[[45.44,12.32],[45.44,10.99],[45.89,11.04],[46.07,11.12]] },
    'bologna-trento':    { req:['emilia','trentino'],        path:[[44.49,11.34],[44.78,10.88],[45.44,10.99],[45.89,11.04],[46.07,11.12]] },
    // ─── LOMBARDIA INTERNA ───────────────────────────────────────────────
    'milano-mil_mxp':    { req:['lombardia'],                path:[[45.47,9.19],[45.55,8.90],[45.63,8.73]] },
    'milano-mil_lin':    { req:['lombardia'],                path:[[45.47,9.19],[45.46,9.24],[45.45,9.28]] },
    'milano-mil_armani': { req:['lombardia'],                path:[[45.47,9.19],[45.47,9.20]] },
    'milano-como':       { req:['lombardia'],                path:[[45.47,9.19],[45.60,9.13],[45.73,9.07],[45.81,9.09]] },
    'mil_mxp-como':      { req:['lombardia'],                path:[[45.63,8.73],[45.70,8.85],[45.81,9.09]] },
    // ─── VENETO INTERNO ──────────────────────────────────────────────────
    'venezia-ven_mp':    { req:['veneto'],                   path:[[45.44,12.32],[45.50,12.34]] },
    // ─── A7 (Milano–Genova) ──────────────────────────────────────────────
    'milano-genova':     { req:['lombardia','liguria'],      path:[[45.47,9.19],[45.18,9.16],[44.90,8.87],[44.41,8.95]] },
    // ─── A26 (Torino–Genova) ─────────────────────────────────────────────
    'torino-genova':     { req:['piemonte','liguria'],       path:[[45.07,7.69],[44.90,8.21],[44.92,8.61],[44.41,8.95]] },
    // ─── SS1 AURELIA / RIVIERA (Genova–Portofino–La Spezia) ──────────────
    'genova-portofino':  { req:['liguria'],                  path:[[44.41,8.95],[44.37,9.07],[44.33,9.17],[44.30,9.21]] },
    'portofino-splendido':{ req:['liguria'],                 path:[[44.30,9.21],[44.30,9.21]] },
    'genova-rapallo':    { req:['liguria'],                  path:[[44.41,8.95],[44.36,9.10],[44.35,9.23]] },
    'rapallo-portofino': { req:['liguria'],                  path:[[44.35,9.23],[44.33,9.17],[44.30,9.21]] },
    // ─── A5 (Torino–Aosta) ───────────────────────────────────────────────
    'torino-aosta':      { req:['piemonte','valle_aosta'],   path:[[45.07,7.69],[45.47,7.88],[45.75,7.62],[45.74,7.32]] },
    // ─── A11/A12 (Firenze–Genova) ────────────────────────────────────────
    'firenze-genova':    { req:['toscana','liguria'],        path:[[43.77,11.26],[43.88,11.09],[43.93,10.91],[43.84,10.51],[44.10,9.82],[44.41,8.95]] },
    // ─── A1/A2 (Roma–Napoli) ─────────────────────────────────────────────
    'roma-napoli':       { req:['lazio','campania'],         path:[[41.90,12.50],[41.78,12.92],[41.64,13.35],[41.49,13.83],[41.07,14.33],[40.85,14.27]] },
    // ─── CAMPANIA INTERNA ────────────────────────────────────────────────
    'napoli-nap_capo':   { req:['campania'],                 path:[[40.85,14.27],[40.87,14.29]] },
    'napoli-sorrento':   { req:['campania'],                 path:[[40.85,14.27],[40.75,14.43],[40.68,14.35],[40.63,14.38]] },
    'napoli-amalfi':     { req:['campania'],                 path:[[40.85,14.27],[40.75,14.43],[40.68,14.35],[40.63,14.38],[40.63,14.60]] },
    'sorrento-amalfi':   { req:['campania'],                 path:[[40.63,14.38],[40.63,14.60]] },
    'nap_capo-sorrento': { req:['campania'],                 path:[[40.87,14.29],[40.75,14.43],[40.63,14.38]] },
    // ─── A24 (Roma–L'Aquila) ─────────────────────────────────────────────
    'roma-aquila':       { req:['lazio','abruzzo'],          path:[[41.90,12.50],[41.97,12.77],[42.10,13.09],[42.35,13.40]] },
    // ─── E45 (Roma–Perugia) ──────────────────────────────────────────────
    'roma-perugia':      { req:['lazio','umbria'],           path:[[41.90,12.50],[42.46,12.39],[42.56,12.64],[42.96,12.70],[43.11,12.39]] },
    // ─── A14 ADRIATICA (Bologna–Ancona–Bari) ─────────────────────────────
    'bologna-ancona':    { req:['emilia','marche'],          path:[[44.49,11.34],[44.29,11.88],[44.06,12.57],[43.91,12.91],[43.62,13.52]] },
    'ancona-bari':       { req:['marche','puglia'],          path:[[43.62,13.52],[43.10,13.80],[42.46,14.21],[41.46,15.56],[41.12,16.87]] },
    // ─── A16 (Napoli–Bari) ───────────────────────────────────────────────
    'napoli-bari':       { req:['campania','puglia'],        path:[[40.85,14.27],[40.91,14.79],[41.13,14.79],[41.46,15.56],[41.12,16.87]] },
    // ─── A3 (Napoli–Catanzaro) ───────────────────────────────────────────
    'napoli-catanzaro':  { req:['campania','calabria'],      path:[[40.85,14.27],[40.68,14.76],[40.00,15.65],[39.30,16.25],[38.91,16.59]] },
    // ─── SS407/A3 (Napoli–Potenza) ───────────────────────────────────────
    'napoli-potenza':    { req:['campania','basilicata'],    path:[[40.85,14.27],[40.68,14.76],[40.54,15.31],[40.64,15.81]] },
    // ─── SS87 (Napoli–Campobasso) ────────────────────────────────────────
    'napoli-campobasso': { req:['campania','molise'],        path:[[40.85,14.27],[41.13,14.79],[41.56,14.66]] },
    // ─── SS76 (Perugia–Ancona) ───────────────────────────────────────────
    'perugia-ancona':    { req:['umbria','marche'],          path:[[43.11,12.39],[43.34,12.90],[43.52,13.24],[43.62,13.52]] },
    // ─── L'AQUILA–PERUGIA (via Rieti–Terni) ──────────────────────────────
    'aquila-perugia':    { req:['abruzzo','umbria'],         path:[[42.35,13.40],[42.40,12.86],[42.56,12.64],[43.11,12.39]] },
    // ─── SS17 (L'Aquila–Campobasso) ──────────────────────────────────────
    'aquila-campobasso': { req:['abruzzo','molise'],         path:[[42.35,13.40],[42.05,13.93],[41.60,14.23],[41.56,14.66]] },
    // ─── A24 COSTA (L'Aquila–Ancona) ─────────────────────────────────────
    'aquila-ancona':     { req:['abruzzo','marche'],         path:[[42.35,13.40],[42.66,13.70],[42.46,14.21],[43.10,14.10],[43.62,13.52]] },
    // ─── CAMPOBASSO–ANCONA ────────────────────────────────────────────────
    'campobasso-ancona': { req:['molise','marche'],          path:[[41.56,14.66],[42.00,14.00],[42.46,14.21],[43.62,13.52]] },
    // ─── SS96 (Bari–Potenza) ─────────────────────────────────────────────
    'bari-potenza':      { req:['puglia','basilicata'],      path:[[41.12,16.87],[40.83,16.42],[40.64,15.81]] },
    // ─── A3 (Potenza–Catanzaro) ──────────────────────────────────────────
    'potenza-catanzaro': { req:['basilicata','calabria'],    path:[[40.64,15.81],[40.04,15.83],[39.30,16.25],[38.91,16.59]] },
    // ─── FERRY: Reggio Cal. ↔ Messina ↔ Palermo / Catania ───────────────
    'catanzaro-palermo': { req:['calabria','sicilia'],       path:[[38.91,16.59],[38.11,15.64],[38.19,15.55],[38.12,13.36]] },
    'catanzaro-catania': { req:['calabria','sicilia'],       path:[[38.91,16.59],[38.11,15.64],[38.19,15.55],[37.51,15.08]] },
    // ─── SICILIA INTERNA ────────────────────────────────────────────────
    'palermo-catania':   { req:['sicilia'],                  path:[[38.12,13.36],[37.80,13.80],[37.51,15.08]] },
    'palermo-taormina':  { req:['sicilia'],                  path:[[38.12,13.36],[37.80,13.80],[37.51,15.08],[37.85,15.29]] },
    'catania-taormina':  { req:['sicilia'],                  path:[[37.51,15.08],[37.68,15.19],[37.85,15.29]] },
    // ─── FERRY: Civitavecchia ↔ Cagliari ─────────────────────────────────
    'roma-cagliari':     { req:['lazio','sardegna'],         path:[[41.90,12.50],[42.09,11.80],[40.50,10.00],[39.22,9.12]] },
    // ─── FERRY: Genova ↔ Cagliari ────────────────────────────────────────
    'genova-cagliari':   { req:['liguria','sardegna'],       path:[[44.41,8.95],[42.90,8.80],[41.20,8.90],[39.22,9.12]] },
    // ─── SARDEGNA INTERNA ────────────────────────────────────────────────
    'cagliari-olbia':    { req:['sardegna'],                 path:[[39.22,9.12],[39.80,9.10],[40.35,9.22],[40.92,9.51]] },
    'olbia-porto_cervo': { req:['sardegna'],                 path:[[40.92,9.51],[41.05,9.52],[41.13,9.54]] },
    // ─── PUGLIA INTERNA ──────────────────────────────────────────────────
    'bari-brindisi':     { req:['puglia'],                   path:[[41.12,16.87],[40.82,17.56],[40.63,17.94]] },
    'brindisi-lecce':    { req:['puglia'],                   path:[[40.63,17.94],[40.50,18.07],[40.35,18.18]] },
    'bari-borgo_egnazia':{ req:['puglia'],                   path:[[41.12,16.87],[40.83,17.22],[40.74,17.42]] },
    // ─── CORTINA (via A27/SS51) ──────────────────────────────────────────
    'venezia-cortina':   { req:['veneto'],                   path:[[45.44,12.32],[45.90,11.85],[46.35,12.14],[46.54,12.14]] },
    'trento-cortina':    { req:['trentino','veneto'],        path:[[46.07,11.12],[46.25,11.40],[46.54,12.14]] },
};

// ─── TAB ICON MAP (used by peek tab) ─────────────────────────────
const _TAB_ICONS = {
    corse:'🚕', fleet:'🚘', staff:'👔', ranking:'🏆', consorzi:'🛡️', emails:'📩',
    regions:'🗺️', invest:'📈', marketing:'📣', legal:'⚖️', finance:'💹',
    lifestyle:'🏰', politics:'🏛️', career:'🎯', store:'🪙', map:'📡',
};

// ─── COLLAPSIBLE RIGHT PANEL ──────────────────────────────────────
window.togglePanel = function() {
    const panel   = document.getElementById('main-panel');
    const peek    = document.getElementById('panel-peek-tab');
    const btn     = document.getElementById('panel-collapse-btn');
    if (!panel) return;
    const collapsed = panel.classList.toggle('panel-collapsed');
    if (peek)  peek.classList.toggle('visible', collapsed);
    if (btn)   btn.textContent = collapsed ? '▶' : '◀';
};

window.openMapOverlay = function() {
    const overlay = document.getElementById('map-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    _ensureMap();
    window._mapOverlayOpen = true;
};

window.closeMapOverlay = function() {
    const overlay = document.getElementById('map-overlay');
    if (overlay) overlay.classList.add('hidden');
    _destroyMap();
    window._mapOverlayOpen = false;
};

window.switchTab = function(tab) {
    const _prevTab = _activeTab;
    _activeTab = tab;

    // Close map overlay when switching away from provinces (unless it was manually opened)
    if (_prevTab === 'provinces' && tab !== 'provinces') {
        window.closeMapOverlay();
    }
    // Provinces tab: auto-open map overlay
    if (tab === 'provinces') {
        window.openMapOverlay();
    }

    const container = document.getElementById('tab-container');
    const title = document.getElementById('panel-title');
    if (!container || !title) return;

    document.querySelectorAll('.nav-btn, .top-nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        const cat = activeBtn.closest('.nav-cat');
        if (cat) { const catBtn = cat.querySelector('.top-nav-btn'); if (catBtn) catBtn.classList.add('active'); }
    }

    // Clean up any open full-screen overlays before rendering the new tab.
    if (document.getElementById('srm-overlay')) { if (window._srmClose) window._srmClose(); else document.getElementById('srm-overlay')?.remove(); }
    if (document.getElementById('wr-overlay'))  { if (window._wrClose)  window._wrClose();  else document.getElementById('wr-overlay')?.remove(); }
    // Clean up decree countdown ticker when leaving politics tab.
    if (tab !== 'politics' && window._decreesCountdownTimer) { clearInterval(window._decreesCountdownTimer); window._decreesCountdownTimer = null; }

    const _safeRender = (fn) => {
        try {
            fn();
            container.classList.remove('tab-fade-in');
            void container.offsetWidth; // force reflow to restart animation
            container.classList.add('tab-fade-in');
        } catch(e) {
            console.error('[switchTab]', e);
            const _sup = (window.GAME_CONFIG||{}).SUPPORT_EMAIL||'support@chauffeurempire.com';
            container.innerHTML = `<div style="color:#f87171;font-size:11px;padding:16px">Errore rendering: ${e.message}<br><span style="color:#6b7280">Se il problema persiste, scrivi a <a href="mailto:${_sup}" style="text-decoration:underline">${_sup}</a></span></div>`;
        }
    };
    switch(tab) {
        case 'home':  title.innerText = "🏠 Command Center"; _safeRender(window.renderTabHome); break;
        case 'corse': title.innerText = "Dispatch Center"; _safeRender(renderTabCorse); break;
        case 'ranking': title.innerText = "Global Ranking"; _safeRender(renderTabRanking); break;
        case 'consorzi': title.innerText = "Consorzi"; _safeRender(window.renderTabConsorzi); break;
        case 'staff': title.innerText = "Risorse Umane"; _safeRender(renderTabStaff); break;
        case 'fleet': title.innerText = "Gestione Flotta"; _safeRender(renderTabFleet); break;
        case 'emails': title.innerText = "Inbox CEO"; _safeRender(renderTabEmails); break;
        case 'regions': title.innerText = "Licenze Regioni"; _safeRender(renderTabRegions); break;
        case 'invest': title.innerText = "Patrimonio & Asset"; _safeRender(renderTabInvestments); break;
        case 'marketing': title.innerText = "Marketing & Brand"; _safeRender(renderTabMarketing); break;
        case 'legal':    title.innerText = "Ufficio Legale"; _safeRender(renderTabLegal); break;
        case 'finance':  title.innerText = "$WALL-ST · Finance"; _safeRender(renderTabFinance); break;
        case 'lifestyle': title.innerText = "Lifestyle & Empire"; _safeRender(renderTabLifestyle); break;
        case 'politics': title.innerText = "Politica & Lobbying"; _safeRender(renderTabPolitics); break;
        case 'career':   title.innerText = "Missioni & Carriera"; window._careerPrevTab = _prevTab; _safeRender(renderTabCareer); break;
        case 'store':    title.innerText = "💎 Executive Club"; _safeRender(renderTabPremiumStore); break;
        case 'market':   title.innerText = "🚗 Mercato Auto"; _safeRender(renderTabMarket); break;
        case 'help':     title.innerText = "🆘 Aiuto & Supporto"; _safeRender(renderTabHelp); break;
        case 'provinces':
            title.innerText = "🗺️ War Room";
            _safeRender(window.renderTabWarRoom || renderTabProvinces);
            break;
        case 'showroom':   title.innerText = "🚘 Showroom"; _safeRender(renderTabShowroom); break;
        case 'realestate': title.innerText = "🏛 Real Estate"; _safeRender(renderTabRealEstate); break;
        case 'b2b':        title.innerText = "💼 Contratti B2B"; _safeRender(window.renderTabB2B); break;
        case 'auctions':   title.innerText = "⚖️ Aste Giudiziarie"; _safeRender(window.renderTabAuctions); break;
        case 'shadow':     title.innerText = "🕵️ Agenzia Ombra"; _safeRender(window.renderTabShadow); break;
        case 'crypto':     title.innerText = "₿ Crypto & Offshore"; _safeRender(window.renderTabCrypto); break;
        case 'hq':         title.innerText = "🏗️ HQ Base Builder"; _safeRender(window.renderTabHQ); break;
        case 'opa': title.innerText = "🦅 OPA Ostili"; _safeRender(window.renderTabOPA); break;
        case 'nemesis': title.innerText = "🦹 Nemici VIP"; _safeRender(window.renderTabNemesis); break;
        case 'infrastructure': title.innerText = "⛽ Monopolio Infrastrutture"; _safeRender(window.renderTabInfrastructure); break;
        case 'contracts':      title.innerText = "🤝 Corporate Contracts";       _safeRender(window.renderTabContracts);      break;
        case 'tourism':        title.innerText = "🌍 Bandi Turismo";             _safeRender(window.renderTabTourism);        break;
    }
}



// renderTabMarketing → ui-marketing.js | renderTabFinance → ui-finance.js




window.showNotification = window._realShowNotification = function(msg, type) {
    const c = document.getElementById('notifications');
    if (!c) return;
    const n = document.createElement('div');
    n.className = `notif${type === 'error' ? ' error-notif' : ''}`;
    n.innerText = msg;
    c.appendChild(n);
    setTimeout(() => n.remove(), 4000);
};

// TAB LIFESTYLE — Real Estate · Mezzi Elite · Empire Status
// ══════════════════════════════════════════════════════════════════
