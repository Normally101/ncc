'use strict';
/* ================================================================
   dispatcher.js — Chauffeur Empire · RECOVERY PARTE 1
   ================================================================ */

const styleFix = document.createElement('style');
styleFix.innerHTML = `
    .leaflet-marker-icon { transition: none !important; } 
    .car-arrow { transition: none !important; }
    .ride-progress-fill { transition: width 0.1s linear !important; }
`;
document.head.appendChild(styleFix);

let map = null;

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

// ─── MAPBOX GL JS MAP ────────────────────────────────────────────
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZm9yZWlzYmFieSIsImEiOiJjbW9ocG14djEwN29tMnFzOTMzMDZjcjBtIn0.0SOq8l2z-w9M22v1s-fYKw';
let _mapReady = false;
let _cantiereMarkers = {};

// ─── REAL ROAD GEOMETRY ──────────────────────────────────────────
const _roadGeomCache = {};
window._fetchRoadGeom = async function(fromLngLat, toLngLat) {
    const key = `${fromLngLat[0].toFixed(4)},${fromLngLat[1].toFixed(4)}->${toLngLat[0].toFixed(4)},${toLngLat[1].toFixed(4)}`;
    if (_roadGeomCache[key]) return _roadGeomCache[key];
    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLngLat[0]},${fromLngLat[1]};${toLngLat[0]},${toLngLat[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
        const resp = await fetch(url);
        const json = await resp.json();
        const coords = json.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length >= 2) { _roadGeomCache[key] = coords; return coords; }
    } catch(e) { /* silent — fallback to HIGHWAYS BFS */ }
    return null;
};

function initMap() {
    if (map) return;
    if (typeof mapboxgl === 'undefined') {
        document.getElementById('leaflet-map').style.cssText = 'display:flex;align-items:center;justify-content:center;background:#0a0a10;color:#ef4444;font:bold 13px monospace;z-index:0;position:fixed;inset:0;';
        document.getElementById('leaflet-map').textContent = '⚠ Mapbox GL non caricato — verifica connessione internet';
        return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
        container: 'leaflet-map',
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [12.4964, 41.9028],
        zoom: 5.5,
        pitch: 50,
        bearing: -10,
        antialias: true,
        attributionControl: false
    });

    map.on('load', () => {
        // 3D Terrain
        map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 });

        // Sky atmosphere
        map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-sun': [0.0, 90.0],
                'sky-atmosphere-sun-intensity': 5
            }
        });

        // Initialize highway GeoJSON sources (empty, will be populated)
        map.addSource('highways', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        // Glow pass
        map.addLayer({
            id: 'highways-glow',
            type: 'line',
            source: 'highways',
            paint: {
                'line-color': '#00f2ff',
                'line-width': 8,
                'line-opacity': 0.13,
                'line-blur': 6
            }
        });
        // Core neon dash
        map.addLayer({
            id: 'highways-core',
            type: 'line',
            source: 'highways',
            paint: {
                'line-color': '#00f2ff',
                'line-width': 1.5,
                'line-opacity': 0.88,
                'line-dasharray': [2, 4]
            }
        });

        // ─── LOD: Region centroid labels (zoom < 7) ───────────────
        map.addSource('region-centroids', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'region-labels',
            type: 'symbol',
            source: 'region-centroids',
            maxzoom: 7,
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': 14,
                'text-anchor': 'center',
            },
            paint: {
                'text-color': '#e5e0d5',
                'text-halo-color': '#000',
                'text-halo-width': 1.5,
                'text-opacity': 0.9
            }
        });

        // ─── LOD: Contract destination dots + labels ───────────────
        map.addSource('contract-destinations', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'contract-dest-dots',
            type: 'circle',
            source: 'contract-destinations',
            minzoom: 9.5,
            paint: {
                'circle-radius': 4,
                'circle-color': '#f59e0b',
                'circle-opacity': 0.75,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff'
            }
        });
        map.addLayer({
            id: 'contract-dest-labels',
            type: 'symbol',
            source: 'contract-destinations',
            minzoom: 11.5,
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
                'text-size': 10,
                'text-offset': [0, 1.2],
                'text-anchor': 'top',
            },
            paint: {
                'text-color': '#f59e0b',
                'text-halo-color': '#000',
                'text-halo-width': 1
            }
        });

        // ─── Active ride route lines (amber, dashed) ───────────────
        map.addSource('active-routes', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'active-routes-glow',
            type: 'line',
            source: 'active-routes',
            paint: { 'line-color': '#f59e0b', 'line-width': 7, 'line-opacity': 0.10, 'line-blur': 5 }
        });
        map.addLayer({
            id: 'active-routes-core',
            type: 'line',
            source: 'active-routes',
            paint: { 'line-color': '#f59e0b', 'line-width': 1.5, 'line-opacity': 0.80, 'line-dasharray': [3, 5] }
        });

        // ─── Vehicle trail lines (traveled portion of route) ───────
        map.addSource('vehicle-trails', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'vehicle-trails-glow',
            type: 'line',
            source: 'vehicle-trails',
            paint: { 'line-color': ['get', 'color'], 'line-width': 8, 'line-opacity': 0.18, 'line-blur': 6 }
        });
        map.addLayer({
            id: 'vehicle-trails-core',
            type: 'line',
            source: 'vehicle-trails',
            paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.90 }
        });

        // ─── Italian Region Borders (cyan neon overlay) ────────────
        map.addSource('italy-reg-src', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-streets-v8'
        });
        // Glow halo
        map.addLayer({
            id: 'italy-reg-glow',
            type: 'line',
            source: 'italy-reg-src',
            'source-layer': 'admin',
            filter: ['all', ['==', 'admin_level', 4], ['==', 'maritime', 'false']],
            paint: { 'line-color': '#00cccc', 'line-width': 6, 'line-opacity': 0.10, 'line-blur': 5 }
        });
        // Core border
        map.addLayer({
            id: 'italy-reg-line',
            type: 'line',
            source: 'italy-reg-src',
            'source-layer': 'admin',
            filter: ['all', ['==', 'admin_level', 4], ['==', 'maritime', 'false']],
            paint: { 'line-color': '#00cccc', 'line-width': 1.0, 'line-opacity': 0.55, 'line-dasharray': [3, 3] }
        });

        // Sorgente GeoJSON per veicoli — rendering nativo WebGL (niente DOM nodes)
        map.addSource('vehicles', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
            id: 'vehicles-layer',
            type: 'circle',
            source: 'vehicles',
            paint: {
                'circle-radius': [
                    'match', ['get', 'tier'],
                    'economy',   5, 'business', 6, 'first', 7,
                    'vip',       9, 'helicopter', 10, 'jet', 10, 5
                ],
                'circle-color': [
                    'match', ['get', 'tier'],
                    'economy',   '#9ca3af', 'business', '#60a5fa', 'first', '#a78bfa',
                    'vip',       '#fbbf24', 'helicopter', '#34d399', 'jet', '#f472b6',
                    '#9ca3af'
                ],
                'circle-opacity': 0.95,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-opacity': 0.5
            }
        });

        map.on('zoom', _updatePOIVisibility);

        _mapReady = true;
        drawHighways();
        drawPOIs();
        // HQ marker
        setTimeout(() => { if (typeof window._updateHQMarker === 'function') window._updateHQMarker(); }, 500);
        // Founding overlay if no regions unlocked
        setTimeout(() => { if (typeof window._checkFoundingOverlay === 'function') window._checkFoundingOverlay(); }, 800);
        // Secondo render ritardato: assicura che highway e POI siano visibili
        setTimeout(() => { drawHighways(); drawPOIs(); }, 800);
        setTimeout(() => { drawHighways(); drawPOIs(); }, 2500);
        if (typeof window.switchTab === 'function') window.switchTab('corse');
        // Rimuovi loading placeholder
        const _mapLoader = document.getElementById('map-loading');
        if (_mapLoader) _mapLoader.remove();
    });
}

function _ensureMap() {
    if (map) return;
    if (window.innerWidth < 768) return;
    initMap();
}

function _destroyMap() {
    if (!map) return;
    Object.values(_cantiereMarkers || {}).forEach(m => m.remove());
    Object.keys(_cantiereMarkers || {}).forEach(k => delete _cantiereMarkers[k]);
    if (window._hqMarker) { window._hqMarker.remove(); window._hqMarker = null; }
    map.remove();
    map = null;
    const el = document.getElementById('leaflet-map');
    if (el) el.classList.add('hidden');
}
window._destroyMap = _destroyMap;

function _updateVehicleLayer() {
    if (!map || !map.getSource('vehicles')) return;
    const features = [];
    (gameState.activeRides || []).forEach(ride => {
        const cached = _rideGeomCache[ride.id];
        if (!cached || !cached.lastPos) return;
        const [lat, lng] = cached.lastPos;
        features.push({
            type: 'Feature',
            properties: { id: ride.id, tier: ride.tier || 'economy' },
            geometry: { type: 'Point', coordinates: [lng, lat] }
        });
    });
    (gameState.activeTrips || []).forEach(trip => {
        const cached = _rideGeomCache[trip.id];
        if (!cached) return;
        let pos = cached.lastPos;
        if (cached.roadGeom && cached.roadGeom.length >= 2) {
            const dest = cached.roadGeom[cached.roadGeom.length - 1];
            pos = [dest[1], dest[0]];
        } else if (cached.toPoi) {
            pos = [cached.toPoi.lat, cached.toPoi.lng];
        }
        if (!pos) return;
        features.push({
            type: 'Feature',
            properties: { id: trip.id, tier: trip.tier || 'economy' },
            geometry: { type: 'Point', coordinates: [pos[1], pos[0]] }
        });
    });
    map.getSource('vehicles').setData({ type: 'FeatureCollection', features });
}

function _updateRegionLabels() {
    if (!map || !_mapReady || typeof REGION_CENTROIDS === 'undefined') return;
    const features = (gameState.unlockedRegions || []).map(rid => {
        const centroid = REGION_CENTROIDS[rid];
        if (!centroid) return null;
        const label = rid.charAt(0).toUpperCase() + rid.slice(1).replace(/_/g, ' ');
        return { type: 'Feature', properties: { name: label }, geometry: { type: 'Point', coordinates: centroid } };
    }).filter(Boolean);
    const src = map.getSource('region-centroids');
    if (src) src.setData({ type: 'FeatureCollection', features });
}

function _updateContractDestinations() {
    if (!map || !_mapReady || typeof buildContractDestinationsGeoJSON === 'undefined') return;
    const gj = buildContractDestinationsGeoJSON(gameState.unlockedRegions || []);
    const src = map.getSource('contract-destinations');
    if (src) src.setData(gj);
}

function _updateActiveRouteLines() {
    if (!map || !_mapReady) return;
    const features = (gameState.activeRides || [])
        .filter(r => r.roadGeom && r.roadGeom.length >= 2)
        .map(r => ({ type: 'Feature', properties: { rideId: r.id }, geometry: { type: 'LineString', coordinates: r.roadGeom } }));
    const src = map.getSource('active-routes');
    if (src) src.setData({ type: 'FeatureCollection', features });
}

function drawHighways() {
    if (!map || !_mapReady) return;
    const features = [];
    for (const key in HIGHWAYS) {
        const hw = HIGHWAYS[key];
        if (!hw.req.every(r => gameState.unlockedRegions.includes(r))) continue;
        features.push({
            type: 'Feature',
            properties: { key },
            geometry: {
                type: 'LineString',
                // HIGHWAYS paths stored as [lat,lng]; Mapbox GeoJSON needs [lng,lat]
                coordinates: hw.path.map(p => [p[1], p[0]])
            }
        });
    }
    const src = map.getSource('highways');
    if (src) src.setData({ type: 'FeatureCollection', features });
}

function drawPOIs() {
    if (!map) return;
    // Remove old markers
    for (const key in _poiMarkers) { _poiMarkers[key].remove(); }
    _poiMarkers = {};

    for (const key in POIS) {
        const p = POIS[key];
        const isUnlocked = gameState.unlockedRegions.includes(p.region);
        const el = document.createElement('div');
        el.className = `poi-marker ${p.type} ${isUnlocked ? '' : 'locked'}`;

        const popup = new mapboxgl.Popup({ offset: 12, closeButton: false, closeOnClick: false })
            .setHTML(`<span>${isUnlocked ? p.name : '🔒 ' + p.name}</span>${isUnlocked ? `<br><span style="color:#888;font-size:9px">${p.baseFlat ? '€'+p.baseFlat+' base' : ''}</span>` : ''}`);

        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([p.lng, p.lat])
            .setPopup(popup)
            .addTo(map);

        if (isUnlocked) {
            el.addEventListener('mouseenter', () => popup.addTo(map));
            el.addEventListener('mouseleave', () => popup.remove());
        }
        _poiMarkers[key] = marker;
    }
    _updateRegionLabels();
    _updateContractDestinations();
    _updatePOIVisibility();
}

function _updatePOIVisibility() {
    if (!map) return;
    const z = map.getZoom();
    for (const key in _poiMarkers) {
        const p = POIS[key];
        const el = _poiMarkers[key]?.getElement();
        if (!p || !el) continue;
        if (z < 7) {
            el.style.display = 'none';
        } else if (z < 9.5) {
            // Only major hubs visible (airports, main city hubs)
            el.style.display = (p.type === 'hub') ? '' : 'none';
        } else {
            el.style.display = '';
        }
    }
}

function drawCantiereMarker(hwKey, lat, lng) {
    if (!map) return;
    if (_cantiereMarkers[hwKey]) _cantiereMarkers[hwKey].remove();
    const el = document.createElement('div');
    el.className = 'cantiere-marker';
    el.title = '🚧 Cantieri in corso';
    _cantiereMarkers[hwKey] = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
}

function removeCantiereMarker(hwKey) {
    if (_cantiereMarkers[hwKey]) { _cantiereMarkers[hwKey].remove(); delete _cantiereMarkers[hwKey]; }
}

// ─── INCIDENT MARKERS ────────────────────────────────────────────
window.addIncidentMarker = function(lat, lng, driverName) {
    if (!map) return;
    const el = document.createElement('div');
    el.className = 'incident-marker';
    el.title = `🚨 Incidente: ${driverName}`;
    const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    setTimeout(() => { try { marker.remove(); } catch(e) {} }, 60000);
};

// ─── CHECKPOINT MARKERS (Shadow/Grey) ────────────────────────────
const _checkpointMarkers = {};
window.addCheckpointMarker = function(lat, lng, rideId) {
    if (!map) return;
    const el = document.createElement('div');
    el.className = 'checkpoint-marker';
    el.title = '🚔 Posto di Blocco';
    const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    if (rideId) _checkpointMarkers[rideId] = marker;
    // Auto-rimuovi dopo 90s
    setTimeout(() => { try { marker.remove(); } catch(e) {} delete _checkpointMarkers[rideId]; }, 90000);
};
window.removeCheckpointMarker = function(rideId) {
    if (_checkpointMarkers[rideId]) { _checkpointMarkers[rideId].remove(); delete _checkpointMarkers[rideId]; }
};

// ─── TIER COLOR MAP for trails ────────────────────────────────────
const _TRAIL_COLOR = { ultra:'#d4af37', vip:'#a78bfa', business:'#00f2ff', group:'#34d399', standard:'#9ca3af' };

// Extract the traveled portion of a roadGeom up to `progress` (0-1)
function _trailGeom(roadGeom, progress) {
    if (!roadGeom || roadGeom.length < 2) return null;
    const p = Math.min(1, Math.max(0, progress));
    const totalSeg = roadGeom.length - 1;
    const segF = p * totalSeg;
    const idx = Math.min(Math.floor(segF), totalSeg - 1);
    const t = segF - idx;
    const tip = [
        roadGeom[idx][0] + (roadGeom[idx + 1][0] - roadGeom[idx][0]) * t,
        roadGeom[idx][1] + (roadGeom[idx + 1][1] - roadGeom[idx][1]) * t
    ];
    return [...roadGeom.slice(0, idx + 1), tip];
}

// ─── VISUAL LOOP (Mapbox vehicle markers + trail scia) ────────────
let _visualLoopRafId = null;
function visualLoop() {
    _visualLoopRafId = requestAnimationFrame(visualLoop);
    if (!map || !_mapReady || !gameState || gameState.paused) return;
    const now = Date.now();
    const trailFeatures = [];

    // ── Phase 1: animate rides using real server timestamps ───────
    gameState.activeRides.forEach(ride => {
        // Resolve progress from server trip timestamps when available
        const serverTrip = (gameState.activeTrips || []).find(t => t.id === ride.id);
        let progress;
        if (serverTrip?.start_time && serverTrip?.end_time) {
            const startMs = new Date(serverTrip.start_time).getTime();
            const endMs   = new Date(serverTrip.end_time).getTime();
            const span    = endMs - startMs;
            progress = span > 0 ? Math.min(1, Math.max(0, (now - startMs) / span)) : 1;
        } else {
            // No server trip yet — fallback to local elapsed (no speed multiplier)
            if (!ride.lastVisualUpdate) ride.lastVisualUpdate = now;
            const delta = now - ride.lastVisualUpdate;
            ride.lastVisualUpdate = now;
            if (ride.visualElapsed == null) ride.visualElapsed = ride.elapsed;
            ride.visualElapsed = Math.min(ride.duration, ride.visualElapsed + delta);
            progress = ride.visualElapsed / ride.duration;
        }

        // Progress bar update (UI element)
        const bar = document.getElementById(`prog-${ride.driverId}`);
        if (bar) bar.style.width = `${Math.min(100, progress * 100)}%`;

        // Position interpolation (returns [lat, lng] Leaflet-style)
        const pos = calculateInterpolatedPosition(ride, progress * ride.duration);
        if (!pos) return;

        // Cache geometry so activeTrips can use it after ride leaves activeRides
        _rideGeomCache[ride.id] = {
            roadGeom:  ride.roadGeom || null,
            fromPoi:   ride.fromPoi,
            toPoi:     ride.toPoi,
            tier:      ride.tier,
            lastPos:   pos,
            lastAngle: ride._lastAngle || 0,
            progress,
        };

        // Heading calculation
        let angle = ride._lastAngle || 0;
        if (ride._lastPos) {
            const dy = pos[0] - ride._lastPos[0];
            const dx = pos[1] - ride._lastPos[1];
            if (Math.abs(dx) + Math.abs(dy) > 1e-6) {
                angle = Math.atan2(dx, dy) * (180 / Math.PI);
                ride._lastAngle = angle;
            }
        }
        ride._lastPos = pos;
        _rideGeomCache[ride.id].lastAngle = angle;

        if (!_vehicleMarkers[ride.id]) {
            const wrap = document.createElement('div');
            wrap.className = 'car-marker-wrap';
            const arrow = document.createElement('div');
            arrow.className = 'car-arrow';
            arrow.style.transform = `rotate(${angle}deg)`;
            wrap.appendChild(arrow);
            _vehicleMarkers[ride.id] = new mapboxgl.Marker({ element: wrap })
                .setLngLat([pos[1], pos[0]])
                .addTo(map);
        } else {
            _vehicleMarkers[ride.id].setLngLat([pos[1], pos[0]]);
            const el = _vehicleMarkers[ride.id].getElement();
            el?.classList.remove('waiting');
            const arrow = el?.querySelector('.car-arrow');
            if (arrow) arrow.style.transform = `rotate(${angle}deg)`;
        }

        // Trail: traveled portion of the road geometry
        const geom = _trailGeom(ride.roadGeom, _rideGeomCache[ride.id].progress);
        if (geom && geom.length >= 2) {
            trailFeatures.push({
                type: 'Feature',
                properties: { color: _TRAIL_COLOR[ride.tier] || '#9ca3af' },
                geometry: { type: 'LineString', coordinates: geom }
            });
        }
    });

    // ── Phase 2: keep markers for activeTrips past visual completion ─
    const activeRideIds = new Set(gameState.activeRides.map(r => r.id));
    (gameState.activeTrips || []).forEach(trip => {
        if (activeRideIds.has(trip.id)) return; // still handled by Phase 1
        const cached = _rideGeomCache[trip.id];
        if (!cached) return;

        // Position at destination (progress = 1)
        let pos = cached.lastPos;
        if (cached.roadGeom && cached.roadGeom.length >= 2) {
            const dest = cached.roadGeom[cached.roadGeom.length - 1];
            pos = [dest[1], dest[0]]; // [lat, lng]
        } else if (cached.toPoi) {
            pos = [cached.toPoi.lat, cached.toPoi.lng];
        }
        if (!pos) return;

        if (!_vehicleMarkers[trip.id]) {
            const wrap = document.createElement('div');
            wrap.className = 'car-marker-wrap waiting';
            const arrow = document.createElement('div');
            arrow.className = 'car-arrow';
            arrow.style.transform = `rotate(${cached.lastAngle || 0}deg)`;
            wrap.appendChild(arrow);
            _vehicleMarkers[trip.id] = new mapboxgl.Marker({ element: wrap })
                .setLngLat([pos[1], pos[0]])
                .addTo(map);
        } else {
            const el = _vehicleMarkers[trip.id].getElement();
            el?.classList.add('waiting');
        }

        // Full trail (100%) while waiting for payout
        if (cached.roadGeom && cached.roadGeom.length >= 2) {
            trailFeatures.push({
                type: 'Feature',
                properties: { color: _TRAIL_COLOR[trip.tier] || '#9ca3af' },
                geometry: { type: 'LineString', coordinates: cached.roadGeom }
            });
        }
    });

    // ── Cleanup: remove markers only when ride is gone from both ────
    const activeTripIds = new Set((gameState.activeTrips || []).map(t => t.id));
    for (const id in _vehicleMarkers) {
        if (!activeRideIds.has(+id) && !activeTripIds.has(+id)) {
            _vehicleMarkers[id].remove();
            delete _vehicleMarkers[id];
            delete _rideGeomCache[id];
        }
    }

    // ── Aggiorna GeoJSON vehicle layer (WebGL circles) ─────────────
    _updateVehicleLayer();

    // ── Update trail source ─────────────────────────────────────────
    const trailSrc = map.getSource('vehicle-trails');
    if (trailSrc) trailSrc.setData({ type: 'FeatureCollection', features: trailFeatures });

    // ── Update active route lines every 60 frames ───────────────────
    if (!visualLoop._frame) visualLoop._frame = 0;
    if (++visualLoop._frame % 60 === 0) _updateActiveRouteLines();
}
// Cancel any existing loop before starting (prevents duplicate loops on hot-reload)
if (_visualLoopRafId) cancelAnimationFrame(_visualLoopRafId);
visualLoop();

// ─── GARAGE SVG — ISPEZIONE VEICOLO ─────────────────────────────
window.openGarage3D = function(carId) {
    let car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;

    const modal = document.getElementById('modal-garage3d');

    // Remap legacy vehicleClass on the fly for display (persistent fix is in loadGame migration)
    const _VC_LEGACY = { 'mercedes_e':'stellar_e_exec', 'mercedes_v':'stellar_v_carr', 'mercedes_sprinter':'stellar_v_carr', 'mercedes_s':'stellar_s_imp' };
    const vClass   = _VC_LEGACY[car.vehicleClass] || car.vehicleClass || 'stellar_e_exec';
    const upgrades = car.upgrades || [];

    const _LEGACY_NAMES = {
        'standard_sedan':'Stellar C-Line', 'van_x':'Vanguard Transit',
        'sedan':'Stellar C-Line', 'van':'Vanguard Transit',
        'mercedes e-class sedan':'Stellar E-Executive', 'mercedes e-class':'Stellar E-Executive',
        'mercedes v-class minivan':'Stellar V-Carrier', 'mercedes v-class':'Stellar V-Carrier',
        'mercedes v-class (leasing)':'Stellar V-Carrier (Leasing)', 'mercedes v-class minivan (leasing)':'Stellar V-Carrier (Leasing)',
        'mercedes e-class sedan (leasing)':'Stellar E-Executive (Leasing)', 'mercedes e-class (leasing)':'Stellar E-Executive (Leasing)',
        'mercedes s-class presidential (leasing)':'Stellar S-Imperial (Leasing)', 'mercedes s-class (leasing)':'Stellar S-Imperial (Leasing)',
        'mercedes sprinter (leasing)':'Stellar V-Carrier (Leasing)',
        'mercedes sprinter':'Stellar V-Carrier',
        'mercedes s-class presidential':'Stellar S-Imperial', 'mercedes s-class':'Stellar S-Imperial',
    };
    const _nameLow = (car.name || '').toLowerCase();
    if (_LEGACY_NAMES[_nameLow]) car = { ...car, name: _LEGACY_NAMES[_nameLow] };

    const catalog  = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : []).find(c => c.vehicleClass === vClass || c.id === vClass);
    const carImg   = catalog?.img || 'assets/fleet/stellar-e-executive.jpg';
    const isElec   = catalog?.fuel === 'electric';

    const template = (typeof FLEET_VEHICLE_CLASSES !== 'undefined' ? FLEET_VEHICLE_CLASSES : []).find(x => x.id === vClass) || {};
    const seats   = template.capacity || (vClass.includes('carr') ? 7 : vClass.includes('sprinter') ? 8 : 3);
    const luggage = vClass.includes('carr') ? 7 : vClass.includes('sprinter') ? 12 : 3;

    const leftPanel = carImg
        ? `<div class="w-full md:w-3/5 relative overflow-hidden" style="min-height:320px">
               <img src="${carImg}" alt="${car.name}"
                    class="absolute inset-0 w-full h-full object-cover"
                    style="object-position:center">
               ${isElec ? `<div class="absolute top-4 left-4 bg-green-500/90 text-white text-xs font-bold px-2 py-1 rounded shadow">⚡ CO2 ESENTE</div>` : ''}
               <div class="absolute bottom-3 left-4 text-white/50 text-[8px] uppercase tracking-widest font-mono">${vClass.replace(/_/g,' ').toUpperCase()}</div>
           </div>`
        : `<div class="w-full md:w-3/5 bg-black/80 relative flex items-center justify-center p-8 overflow-hidden" style="min-height:320px">
               <div class="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-black/90 pointer-events-none"></div>
               <div class="relative z-10 w-full drop-shadow-[0_20px_30px_rgba(0,0,0,1)] transition-transform duration-700 hover:scale-105">
                   ${typeof _generateVehicleSVG === 'function' ? _generateVehicleSVG(vClass, upgrades) : ''}
               </div>
           </div>`;

    modal.innerHTML = `
        <div class="bg-panel border border-white/10 rounded-2xl w-[95%] max-w-5xl min-h-[500px] overflow-hidden relative shadow-2xl flex flex-col md:flex-row transform transition-all" style="max-height:90vh">
            ${leftPanel}
            <div class="w-full md:w-2/5 p-8 bg-panel border-l border-white/10 flex flex-col justify-between overflow-y-auto">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <h2 class="text-2xl font-bold text-white uppercase tracking-wider leading-tight">${car.name}</h2>
                        <span class="bg-white/10 text-white px-2 py-1 rounded text-xs font-mono border border-white/20 ml-2 flex-shrink-0">${car.tier.toUpperCase()}</span>
                    </div>
                    <p class="text-gold text-sm mb-6 font-mono">${vClass.replace(/_/g, ' ').toUpperCase()}</p>
                    <div class="space-y-5">
                        <div>
                            <div class="flex justify-between text-xs mb-1.5 font-bold"><span class="text-gray-400">🔧 CONDIZIONE</span><span class="text-white">${Math.floor(car.condition)}%</span></div>
                            <div class="w-full bg-black/60 h-3 rounded-full overflow-hidden border border-white/10">
                                <div class="h-full transition-all duration-1000 ease-out ${car.condition > 50 ? 'bg-green-500' : 'bg-red-500'}" style="width:0%" id="anim-cond"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1.5 font-bold"><span class="text-gray-400">${isElec ? '⚡ BATTERIA' : '⛽ CARBURANTE'}</span><span class="text-white">${isElec ? Math.floor(car.chargeLevel ?? 100) : Math.floor(car.fuel || 100)}%</span></div>
                            <div class="w-full bg-black/60 h-3 rounded-full overflow-hidden border border-white/10">
                                <div class="h-full ${isElec ? 'bg-green-500' : 'bg-blue-500'} transition-all duration-1000 ease-out" style="width:0%" id="anim-fuel"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1.5 font-bold"><span class="text-gray-400">🛞 PRESSIONE GOMME</span><span class="text-white">${Math.floor(car.tirePressure !== undefined ? car.tirePressure : 100)}%</span></div>
                            <div class="w-full bg-black/60 h-3 rounded-full overflow-hidden border border-white/10">
                                <div class="h-full bg-yellow-500 transition-all duration-1000 ease-out" style="width:0%" id="anim-tire"></div>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3 mt-4">
                            <div class="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center gap-3 hover:border-white/20 transition-colors">
                                <span class="text-2xl">💺</span>
                                <div><p class="text-[9px] text-gray-500 font-bold">POSTI</p><p class="text-base font-bold text-white">${seats}</p></div>
                            </div>
                            <div class="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center gap-3 hover:border-white/20 transition-colors">
                                <span class="text-2xl">🧳</span>
                                <div><p class="text-[9px] text-gray-500 font-bold">BAGAGLI</p><p class="text-base font-bold text-white">${luggage}</p></div>
                            </div>
                        </div>
                        <div class="mt-4">
                            <p class="text-[9px] text-gray-500 font-bold mb-2 uppercase tracking-widest">Upgrade Installati</p>
                            <div class="flex flex-wrap gap-1.5">
                                ${upgrades.length > 0
                                    ? upgrades.map(u => `<span class="bg-blue-900/40 text-blue-300 border border-blue-500/30 text-[9px] px-2 py-0.5 rounded">${u.replace('upg_','').toUpperCase()}</span>`).join('')
                                    : '<span class="text-gray-600 text-xs italic">Nessun upgrade</span>'}
                            </div>
                        </div>
                    </div>
                </div>
                <button onclick="closeGarage3D()" class="mt-6 w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl bg-red-900/30 border border-red-500/40 text-red-300 hover:bg-red-900/50 transition-colors">✕ Chiudi Ispezione</button>
            </div>
        </div>`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.cssText = 'position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';

    setTimeout(() => {
        const condEl = document.getElementById('anim-cond');
        const fuelEl = document.getElementById('anim-fuel');
        const tireEl = document.getElementById('anim-tire');
        if (condEl) condEl.style.width = `${Math.floor(car.condition)}%`;
        if (fuelEl) fuelEl.style.width = `${isElec ? Math.floor(car.chargeLevel ?? 100) : Math.floor(car.fuel || 100)}%`;
        if (tireEl) tireEl.style.width = `${Math.floor(car.tirePressure !== undefined ? car.tirePressure : 100)}%`;
    }, 50);
};

window.closeGarage3D = function() {
    const modal = document.getElementById('modal-garage3d');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.style.cssText = '';
        modal.innerHTML = '';
    }
};

function _generateVehicleSVG(vClass, upgrades) {
    const isTinted = upgrades.includes('upg_tint') || upgrades.includes('tint');
    const isArmor  = upgrades.includes('upg_armor') || upgrades.includes('blindatura');
    const hasLivrea = upgrades.includes('upg_vip') || upgrades.includes('livrea') || upgrades.includes('neon');

    const paint1     = isArmor ? '#1a1a1c' : '#232733';
    const paint2     = isArmor ? '#0d0d0e' : '#080a0f';
    const glassColor = isTinted ? '#030303' : '#1e2436';
    const rimColor   = isArmor ? '#333' : '#778090';
    const neonColor  = hasLivrea ? '#00f2ff' : 'none';

    const wheelY = 250;
    const drawWheel = (cx) => `
        <circle cx="${cx}" cy="${wheelY}" r="45" fill="#040404"/>
        <circle cx="${cx}" cy="${wheelY}" r="36" fill="#111"/>
        <circle cx="${cx}" cy="${wheelY}" r="26" fill="none" stroke="${rimColor}" stroke-width="4"/>
        <circle cx="${cx}" cy="${wheelY}" r="10" fill="#444"/>
        <path d="M${cx},${wheelY-26} L${cx},${wheelY+26} M${cx-26},${wheelY} L${cx+26},${wheelY} M${cx-18},${wheelY-18} L${cx+18},${wheelY+18} M${cx-18},${wheelY+18} L${cx+18},${wheelY-18}" stroke="${rimColor}" stroke-width="3"/>
        ${hasLivrea ? `<circle cx="${cx}" cy="${wheelY}" r="46" fill="none" stroke="#00f2ff" stroke-width="1.5" opacity="0.5"/>` : ''}`;

    let bodyPath, windowsPath, details;

    if (vClass === 'mercedes_v') {
        bodyPath    = "M110,140 C110,100 130,90 150,90 L520,90 C560,90 640,140 680,160 L710,230 C715,250 700,250 680,250 L110,250 Z";
        windowsPath = "M150,150 L170,100 L500,100 L620,150 Z";
        details = `${drawWheel(220)} ${drawWheel(580)}
            <path d="M680,160 L710,175 L700,195 L670,180 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M110,140 L100,150 L100,190 L110,190 Z" fill="#f00" filter="url(#glow)"/>
            <line x1="360" y1="100" x2="360" y2="240" stroke="#111" stroke-width="2"/>
            ${hasLivrea ? '<line x1="110" y1="248" x2="680" y2="248" stroke="#00f2ff" stroke-width="2" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'mercedes_sprinter') {
        bodyPath    = "M90,250 L90,50 C90,30 110,20 130,20 L520,20 C550,20 620,130 670,160 L710,240 C715,250 700,250 680,250 Z";
        windowsPath = "M520,60 L600,150 L530,150 Z";
        details = `${drawWheel(220)} ${drawWheel(580)}
            <rect x="130" y="50" width="370" height="180" rx="5" fill="#15171e" stroke="#111" stroke-width="2"/>
            <path d="M670,160 L710,180 L700,200 L660,180 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M90,100 L80,110 L80,200 L90,200 Z" fill="#f00" filter="url(#glow)"/>
            ${hasLivrea ? '<rect x="91" y="248" width="589" height="2" fill="#00f2ff" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'mercedes_s') {
        bodyPath    = "M70,180 L180,175 L330,120 L530,120 L680,175 L780,190 C790,200 790,240 760,250 L70,250 C50,250 50,190 70,180 Z";
        windowsPath = "M195,175 L335,125 L520,125 L650,175 Z";
        details = `${drawWheel(210)} ${drawWheel(630)}
            <path d="M70,240 L780,240" stroke="#444" stroke-width="2"/>
            <path d="M760,190 L780,195 L775,205 L755,200 Z" fill="#fff" filter="url(#glow)"/>
            <path d="M70,185 L60,195 L60,205 L70,205 Z" fill="#f00" filter="url(#glow)"/>
            <rect x="340" y="118" width="170" height="3" rx="1.5" fill="#d4af37" opacity="0.8"/>
            ${hasLivrea ? '<path d="M70,249 L780,249" stroke="#00f2ff" stroke-width="2" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'water_taxi') {
        bodyPath    = "M100,220 C100,250 150,280 200,280 L600,280 C680,280 720,240 750,200 L100,200 Z";
        windowsPath = "M250,200 L300,120 L550,120 L600,200 Z";
        details = `
            <path d="M250,200 L300,120 L550,120 L600,200 Z" fill="#4a2e15" stroke="#2b1a0a" stroke-width="3"/>
            <path d="M280,190 L320,130 L530,130 L570,190 Z" fill="url(#glass)"/>
            <path d="M80,270 Q425,250 780,270" stroke="#00f2ff" stroke-width="2" stroke-dasharray="12 6" opacity="0.4"/>
            <path d="M730,200 L745,205 L740,215 L725,210 Z" fill="#fff" filter="url(#glow)"/>
            <path d="M110,205 L100,210 L100,220 L110,215 Z" fill="#f00" filter="url(#glow)"/>
            <ellipse cx="155" cy="170" rx="25" ry="35" fill="none" stroke="#5a3a1a" stroke-width="3"/>
            <line x1="155" y1="135" x2="155" y2="100" stroke="#5a3a1a" stroke-width="3"/>`;
    } else {
        // Default: mercedes_e sedan
        bodyPath    = "M90,180 L180,175 L310,120 L490,120 L630,175 L740,190 C750,200 750,240 720,250 L90,250 C70,250 70,190 90,180 Z";
        windowsPath = "M195,175 L315,125 L480,125 L610,175 Z";
        details = `${drawWheel(210)} ${drawWheel(600)}
            <rect x="420" y="125" width="15" height="50" fill="#111"/>
            <path d="M720,190 L740,195 L735,205 L715,200 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M90,185 L80,195 L80,205 L90,205 Z" fill="#f00" filter="url(#glow)"/>
            ${hasLivrea ? '<path d="M90,249 L720,249" stroke="#00f2ff" stroke-width="2" opacity="0.7"/>' : ''}`;
    }

    return `<svg viewBox="0 0 850 320" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bodyPaint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${paint1}"/><stop offset="100%" stop-color="${paint2}"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${glassColor}" stop-opacity="0.9"/><stop offset="100%" stop-color="#050505" stop-opacity="0.95"/>
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        <filter id="shadow">
          <feGaussianBlur stdDeviation="18" result="blur"/>
        </filter>
      </defs>
      <ellipse cx="425" cy="278" rx="350" ry="14" fill="#000" filter="url(#shadow)" opacity="0.85"/>
      <path d="${bodyPath}" fill="url(#bodyPaint)" stroke="${isArmor ? '#2a2a30' : '#1a1c28'}" stroke-width="1.5"/>
      ${vClass !== 'water_taxi' ? `<path d="${windowsPath}" fill="url(#glass)"/>` : ''}
      ${details}
    </svg>`;
}

// ─── HIGHWAY GRAPH ROUTER ────────────────────────────────────────────────────
let _hwGraph = null;
function _getHWGraph() {
    if (_hwGraph) return _hwGraph;
    _hwGraph = {};
    for (const key in HIGHWAYS) {
        const dash = key.indexOf('-');
        const a = key.substring(0, dash), b = key.substring(dash + 1);
        if (!_hwGraph[a]) _hwGraph[a] = [];
        if (!_hwGraph[b]) _hwGraph[b] = [];
        _hwGraph[a].push({ to: b, key, rev: false });
        _hwGraph[b].push({ to: a, key, rev: true });
    }
    return _hwGraph;
}

function _findHWPath(fromId, toId) {
    if (fromId === toId) return [];
    const g = _getHWGraph();
    const queue = [{ node: fromId, segs: [] }];
    const visited = new Set([fromId]);
    while (queue.length) {
        const { node, segs } = queue.shift();
        for (const edge of (g[node] || [])) {
            if (edge.to === toId) return [...segs, edge];
            if (!visited.has(edge.to)) {
                visited.add(edge.to);
                queue.push({ node: edge.to, segs: [...segs, edge] });
            }
        }
    }
    return null;
}

// Nodi hub principali nella rete autostradale (per routing fallback)
const _HUB_NODES = ['roma','milano','napoli','bologna','firenze','torino','venezia','genova','bari','palermo'];

function _buildRideWaypoints(fromPoi, toPoi) {
    const fwd = `${fromPoi.id}-${toPoi.id}`, rev = `${toPoi.id}-${fromPoi.id}`;
    if (HIGHWAYS[fwd]) return HIGHWAYS[fwd].path;
    if (HIGHWAYS[rev]) return [...HIGHWAYS[rev].path].reverse();

    // Multi-hop BFS routing through the highway network
    const segs = _findHWPath(fromPoi.id, toPoi.id);
    if (segs && segs.length) {
        let wpts = [];
        segs.forEach((seg, i) => {
            const segPath = HIGHWAYS[seg.key].path;
            const segWpts = seg.rev ? [...segPath].reverse() : segPath;
            wpts = i === 0 ? [...segWpts] : [...wpts, ...segWpts.slice(1)];
        });
        return wpts;
    }

    // Fallback: routing via hub intermedio più vicino
    // Trova il hub connesso più vicino a fromPoi e a toPoi
    const g = _getHWGraph();
    const allNodes = Object.keys(g);
    const _dist = (a, b) => {
        const pa = POIS[a], pb = POIS[b];
        if (!pa || !pb) return Infinity;
        return Math.hypot(pa.lat - pb.lat, pa.lng - pb.lng);
    };
    // Cerca hub vicino a fromPoi raggiungibile nella rete
    const fromHub = allNodes.filter(n => _HUB_NODES.includes(n))
        .sort((a, b) => _dist(fromPoi.id, a) - _dist(fromPoi.id, b))[0];
    const toHub   = allNodes.filter(n => _HUB_NODES.includes(n))
        .sort((a, b) => _dist(toPoi.id, a) - _dist(toPoi.id, b))[0];

    if (!fromHub || !toHub) return null;

    // Costruisci: fromPoi → fromHub → toHub → toPoi tramite BFS su ogni segmento
    const segs1 = _findHWPath(fromPoi.id, fromHub);
    const segs2 = _findHWPath(fromHub, toHub);
    const segs3 = _findHWPath(toHub, toPoi.id);

    const _segsToWpts = (segs) => {
        if (!segs || !segs.length) return null;
        let w = [];
        segs.forEach((seg, i) => {
            const sp = HIGHWAYS[seg.key].path;
            const sw = seg.rev ? [...sp].reverse() : sp;
            w = i === 0 ? [...sw] : [...w, ...sw.slice(1)];
        });
        return w;
    };

    const w1 = _segsToWpts(segs1);
    const w2 = _segsToWpts(segs2);
    const w3 = _segsToWpts(segs3);

    // Combina i segmenti trovati
    let combined = [];
    if (w1) combined = [...w1];
    else combined = [[fromPoi.lat, fromPoi.lng]];
    if (w2) combined = combined.length ? [...combined, ...w2.slice(1)] : w2;
    if (w3) combined = combined.length ? [...combined, ...w3.slice(1)] : w3;
    else combined.push([toPoi.lat, toPoi.lng]);

    return combined.length >= 2 ? combined : null;
}

function calculateInterpolatedPosition(ride, currentElapsed) {
    const progress = Math.min(1, currentElapsed / ride.duration);

    // Real road routing: interpolate along Mapbox Directions geometry [lng,lat]
    if (ride.roadGeom && ride.roadGeom.length >= 2) {
        const rg = ride.roadGeom;
        const totalSeg = rg.length - 1;
        const segF = progress * totalSeg;
        const idx = Math.min(Math.floor(segF), totalSeg - 1);
        const t = segF - idx;
        const lng = rg[idx][0] + (rg[idx + 1][0] - rg[idx][0]) * t;
        const lat = rg[idx][1] + (rg[idx + 1][1] - rg[idx][1]) * t;
        return [lat, lng]; // return [lat, lng] to match existing convention
    }

    // Fallback: HIGHWAYS BFS waypoints
    if (!ride._waypoints) ride._waypoints = _buildRideWaypoints(ride.fromPoi, ride.toPoi);
    const wpts = ride._waypoints;

    if (!wpts || wpts.length < 2) {
        return [
            ride.fromPoi.lat + (ride.toPoi.lat - ride.fromPoi.lat) * progress,
            ride.fromPoi.lng + (ride.toPoi.lng - ride.fromPoi.lng) * progress
        ];
    }
    const totalSeg = wpts.length - 1;
    const segF = progress * totalSeg;
    const idx = Math.min(Math.floor(segF), totalSeg - 1);
    const t = segF - idx;
    return [
        wpts[idx][0] + (wpts[idx + 1][0] - wpts[idx][0]) * t,
        wpts[idx][1] + (wpts[idx + 1][1] - wpts[idx][1]) * t
    ];
}/* ================================================================
   dispatcher.js — RECOVERY PARTE 2: UI & DISPATCH CENTER
   ================================================================ */

// ─── TAB ICON MAP (used by peek tab) ─────────────────────────────
const _TAB_ICONS = {
    corse:'🚕', fleet:'🚘', staff:'👔', ranking:'🏆', emails:'📩',
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

window.switchTab = function(tab) {
    // Lifecycle mappa: mostra solo nei tab che la usano
    const _mapTabs = new Set(['corse', 'provinces']);
    // showroom/war_room gestiscono i propri overlay full-screen indipendentemente
    const _selfOverlayTabs = new Set(['showroom']);
    const _prevTab = _activeTab;
    _activeTab = tab;

    if (_mapTabs.has(tab)) {
        const mapEl = document.getElementById('leaflet-map');
        if (mapEl) mapEl.classList.remove('hidden');
        _ensureMap();
    } else if (!_mapTabs.has(tab) && map) {
        _destroyMap();
    }

    const container = document.getElementById('tab-container');
    const title = document.getElementById('panel-title');
    const mapLog = document.getElementById('live-map-overlay');
    if (!container || !title) return;

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // Update peek tab icon to reflect current section
    const peekIcon = document.getElementById('peek-tab-icon');
    if (peekIcon) peekIcon.textContent = _TAB_ICONS[tab] || '📋';

    // ── Full-screen vs pannello stretto ─────────────────────────────────────
    // Dispatch/mappa → pannello stretto a destra
    // Tutti gli altri → pannello a tutto schermo (nasconde mappa e navbar)
    // showroom → ha il proprio overlay, non tocchiamo il pannello
    const panel       = document.getElementById('main-panel');
    const collapseBtn = document.getElementById('panel-collapse-btn');
    const backBtn     = document.getElementById('panel-back-btn');
    if (panel) {
        if (_mapTabs.has(tab)) {
            // Ripristina pannello stretto
            panel.style.cssText = '';
            if (collapseBtn) collapseBtn.style.display = '';
            if (backBtn)     backBtn.style.display     = 'none';
            // Rimuovi panel-collapsed se era rimasto
            const peek = document.getElementById('panel-peek-tab');
            if (panel.classList.contains('panel-collapsed')) {
                panel.classList.remove('panel-collapsed');
                if (peek) peek.classList.remove('visible');
                if (collapseBtn) collapseBtn.textContent = '◀';
            }
        } else if (!_selfOverlayTabs.has(tab)) {
            // Espandi a tutto schermo
            panel.style.cssText = 'position:fixed;inset:0;width:auto;border-radius:0;z-index:2000;';
            if (collapseBtn) collapseBtn.style.display = 'none';
            if (backBtn)     backBtn.style.display     = '';
        }
    } else {
        // Fallback legacy: auto-expand se collassato
        const peek = document.getElementById('panel-peek-tab');
        if (panel && panel.classList.contains('panel-collapsed')) {
            panel.classList.remove('panel-collapsed');
            if (peek)  peek.classList.remove('visible');
            const btn = document.getElementById('panel-collapse-btn');
            if (btn) btn.textContent = '◀';
        }
    }

    if(mapLog) { mapLog.classList.add('hidden'); mapLog.classList.remove('flex'); }

    // Clean up any open full-screen overlays before rendering the new tab.
    if (document.getElementById('srm-overlay')) { if (window._srmClose) window._srmClose(); else document.getElementById('srm-overlay')?.remove(); }
    if (document.getElementById('wr-overlay'))  { if (window._wrClose)  window._wrClose();  else document.getElementById('wr-overlay')?.remove(); }

    const _safeRender = (fn) => { try { fn(); } catch(e) { console.error('[switchTab]', e); const _sup = (window.GAME_CONFIG||{}).SUPPORT_EMAIL||'support@chauffeurempire.com'; container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore rendering: ${e.message}<br><span class="text-gray-500">Se il problema persiste, scrivi a <a href="mailto:${_sup}" class="underline">${_sup}</a></span></div>`; } };
    switch(tab) {
        case 'corse': title.innerText = "Dispatch Center"; _safeRender(renderTabCorse); break;
        case 'ranking': title.innerText = "Global Ranking"; _safeRender(renderTabRanking); break;
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
        case 'career':   title.innerText = "Missioni & Carriera"; _safeRender(renderTabCareer); break;
        case 'store':    title.innerText = "💎 Executive Club"; _safeRender(renderTabPremiumStore); break;
        case 'market':   title.innerText = "🚗 Mercato Auto"; _safeRender(renderTabMarket); break;
        case 'help':     title.innerText = "🆘 Aiuto & Supporto"; _safeRender(renderTabHelp); break;
        case 'provinces':
            title.innerText = "🗺️ War Room";
            {
                const _mapEl = document.getElementById('leaflet-map');
                if (_mapEl) _mapEl.classList.remove('hidden');
                _ensureMap();
            }
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
    }
}

function renderTabCorse() {
    const container = document.getElementById('tab-container');
    // Dirty-check: skip full DOM replacement if nothing relevant changed
    const _sig = (gameState.pendingRides.map(r => r.id).join(',')) + '|' +
                 (gameState.drivers.map(d => d.id + ':' + d.status + ':' + (d.queue?.length || 0) + ':' + (d.restHoursLeft | 0)).join(','));
    if (renderTabCorse._sig === _sig && container.children.length > 0) return;
    renderTabCorse._sig = _sig;

    let html = `
        <div class="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
            <h3 class="text-[10px] text-gold uppercase tracking-widest">Richieste Pendenti</h3>
            <button onclick="assignAllRides()" class="btn-gold !py-1 !px-2 !text-[9px]">⚡ Smista Tutte</button>
        </div>
        <div class="space-y-2 mb-6 max-h-48 overflow-y-auto">`;
    
    if(gameState.pendingRides.length === 0) {
        html += `<div class="text-[10px] text-gray-600 italic">In attesa di nuove chiamate...</div>`;
    }

    gameState.pendingRides.forEach(ride => {
        if (ride.isContract) {
            const typeIcon = { Airport:'✈️', 'City-to-City':'🚗', Rail:'🚂', Port:'⚓', Boat:'⛵', Transfer:'🚐' }[ride.routeType] || '🚗';
            const vcNames  = { mercedes_e:'E-Class', mercedes_v:'V-Class', mercedes_sprinter:'Sprinter', mercedes_s:'S-Class 👑', water_taxi:'Water Taxi ⛵' };
            const margin   = (ride.price || 0) - (ride.netCost || 0);
            const fromName = ride.originName || ride.fromPoi?.name || '?';
            const toName   = ride.destinationName || ride.toPoi?.name || '?';
            html += `
        <div class="hud-card ride-card cursor-grab active:cursor-grabbing !border-amber-500/30 bg-amber-950/10" draggable="true" data-id="${ride.id}">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 mb-0.5">
                        <span class="text-[8px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold tracking-wider">🏢 CV</span>
                        <span class="text-[9px] text-gray-500">${typeIcon}</span>
                        ${ride.vehicleRequired ? `<span class="text-[8px] bg-white/5 text-gray-400 px-1 rounded">${vcNames[ride.vehicleRequired] || ride.vehicleRequired}</span>` : ''}
                    </div>
                    <div class="text-xs font-bold text-white truncate">${fromName} ➔ ${toName}</div>
                    <div class="text-[8px] text-gray-500 uppercase mt-0.5">${ride.tier}</div>
                </div>
                <div class="text-right shrink-0">
                    <div class="text-green-400 font-mono font-bold text-[11px]">€${ride.price.toLocaleString()}</div>
                    <div class="text-[8px] ${margin >= 0 ? 'text-emerald-500' : 'text-red-400'} font-mono">netto +€${margin.toLocaleString()}</div>
                </div>
            </div>
        </div>`;
        } else {
            html += `
        <div class="hud-card ride-card cursor-grab active:cursor-grabbing" draggable="true" data-id="${ride.id}">
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-xs font-bold text-white">${ride.fromPoi.name} ➔ ${ride.toPoi.name}</div>
                    <div class="text-[9px] text-gray-400 mt-1 uppercase tracking-tighter">Classe: ${ride.tier}</div>
                </div>
                <div class="text-green-400 font-mono font-bold">€${ride.price}</div>
            </div>
        </div>`;
        }
    });
    
    html += `</div>
        <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-4">Code Autisti</h3>
        <div class="space-y-3">`;

    const hasHR = gameState.staff.some(s => s.id === 'hr');
    gameState.drivers.forEach(driver => {
        const car = gameState.fleet.find(c => c.id === driver.assignedCarId);
        const isResting = driver.status === 'resting';
        const isBusy    = driver.status === 'busy';
        const fatigue   = driver.fatigue || 0;
        const fatigueColor = fatigue >= 85 ? '#ef4444' : fatigue >= 60 ? '#f59e0b' : '#8b5cf6';
        const statusLabel = isResting
            ? `<span class="text-orange-400 font-bold">RIPOSO (−${driver.restHoursLeft}h)</span>`
            : isBusy
                ? `<span class="text-blue-400">In Servizio</span>`
                : `<span class="text-green-500">Disponibile</span>`;
        const restBtn = (!isResting && !isBusy && driver.id !== 'ceo' && fatigue >= 40)
            ? `<button onclick="sendDriverToRest('${driver.id}')" class="text-[8px] border border-orange-500/40 text-orange-400 px-1.5 py-0.5 rounded hover:bg-orange-500/10 ml-1">Riposo</button>`
            : '';
        html += `
        <div class="hud-card driver-card transition-all ${isResting ? 'opacity-60' : ''}" data-id="${driver.id}">
            <div class="flex justify-between items-center">
                <div>
                    <div class="text-xs font-bold text-white">${driver.name}${restBtn}</div>
                    ${driver.trait ? `<div class="mt-0.5">${typeof window._traitBadgeHTML === 'function' ? window._traitBadgeHTML(driver) : ''} <span class="text-[8px] text-gray-500">${driver.trait.desc}</span></div>` : ''}
                    <div class="text-[9px] text-gray-500">${car ? `${car.name}${car.isLease ? ' (Leasing)' : ''}` : 'Nessun veicolo assegnato'}</div>
                </div>
                <div class="text-right">
                    <div class="text-[9px] font-bold uppercase">${statusLabel}</div>
                    <div class="text-[9px] text-gray-500 font-mono">${driver.queue.length > 0 ? `Coda: ${driver.queue.length} assegnate` : 'Coda vuota'}</div>
                </div>
            </div>
            <div class="ride-progress-bg mt-1">
                <div id="prog-${driver.id}" class="ride-progress-fill" style="width: 0%"></div>
            </div>
            ${driver.id !== 'ceo' ? `
            <div class="flex items-center gap-1 mt-1">
                <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">Fatica</span>
                <div class="fatigue-bar-bg flex-1">
                    <div class="fatigue-bar-fill" style="width:${fatigue}%; background:${fatigueColor}"></div>
                </div>
                <span class="text-[8px] font-mono ml-1" style="color:${fatigueColor}">${Math.floor(fatigue)}%</span>
            </div>` : ''}
        </div>`;
    });
    container.innerHTML = html + `</div>`;
}

async function renderTabRanking() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    // Remember which render is current — prevents stale async write on tab switch
    const renderToken = Symbol();
    renderTabRanking._token = renderToken;

    container.innerHTML = `
    <div class="flex items-center gap-2 mb-4">
        <div class="text-2xl">&#x1F3C6;</div>
        <div>
            <div class="text-[9px] text-gray-500 uppercase">Classifica Globale</div>
            <div class="font-bold text-lg text-gold">Caricamento...</div>
        </div>
    </div>
    <div class="space-y-2">${Array(5).fill('<div class="hud-card animate-pulse h-12"></div>').join('')}</div>`;

    // Fetch leaderboard from Supabase — columns match table exactly
    let rows = [];
    let fetchError = null;
    if (window.supabaseClient) {
        try {
            console.log('MULTIPLAYER: Caricamento classifica globale...');
            const { data, error } = await window.supabaseClient
                .from('leaderboard')
                .select('user_id,company_name,liquid_assets,reputation,fleet_count,last_active')
                .order('liquid_assets', { ascending: false })
                .limit(50);
            if (error) {
                fetchError = error.message || JSON.stringify(error);
                console.error('ERRORE MULTIPLAYER fetch classifica:', error);
            } else {
                rows = data || [];
                console.log('MULTIPLAYER: Classifica caricata —', rows.length, 'aziende:', rows);
            }
        } catch(e) {
            fetchError = e.message || 'Errore di rete';
            console.error('ERRORE MULTIPLAYER fetch eccezione:', e);
        }
    } else {
        fetchError = 'Supabase non disponibile';
    }

    // User switched tab while fetching — don't overwrite their current tab
    if (renderTabRanking._token !== renderToken) return;

    const myId   = window.currentUser?.id;
    const now    = Date.now();
    const ONLINE_MS = 5 * 60 * 1000;

    // Inject own row if not in top 50 (using exact table column names)
    const myInList = rows.some(r => r.user_id === myId);
    if (!myInList && myId) {
        rows.push({
            user_id:      myId,
            company_name: gameState.companyName || 'Chauffeur Empire',
            liquid_assets: Math.floor(gameState.cash || 0),
            reputation:   gameState.reputation || 0,
            fleet_count:  (gameState.fleet || []).length,
            last_active:  new Date().toISOString(),
            _injected:    true,
        });
        rows.sort((a, b) => b.liquid_assets - a.liquid_assets);
    }

    const myRank  = rows.findIndex(r => r.user_id === myId) + 1;
    const total   = rows.length;
    const rankIcon  = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`;
    const rankColor = myRank > 0 && myRank <= 3 ? 'text-gold' : 'text-gray-300';

    let statusHtml = '';
    if (myRank > 0 && myRank <= 3) {
        statusHtml = `
        <div class="hud-card !border-gold/40 bg-gold/5 mb-4">
            <div class="text-[9px] text-gold font-bold uppercase tracking-widest mb-1">&#x2728; Bonus Top ${myRank}</div>
            <ul class="text-[9px] text-gray-300 space-y-1">
                <li>&#x1F697; Corse Ultra-Luxury accessibili</li>
                <li>&#x1F6E1; Premi assicurativi &minus;15% su tutta la flotta</li>
                <li>&#x1F4CD; POI esclusivi visibili (Porto Cervo, Armani Hotel)</li>
            </ul>
        </div>`;
    } else if (myRank > 0) {
        statusHtml = `
        <div class="hud-card mb-4">
            <div class="text-[9px] text-gray-400 uppercase tracking-widest">Posizione #${myRank} / ${total} aziende globali</div>
            <div class="text-[9px] text-gray-500 mt-1">Scala al Top 3 per sbloccare i bonus Elite.</div>
        </div>`;
    }

    let html = `
    <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
            <div class="text-3xl">${myRank > 0 ? rankIcon : '🏆'}</div>
            <div>
                <div class="text-[9px] text-gray-500 uppercase">La tua posizione</div>
                <div class="font-bold text-lg ${rankColor}">${myRank > 0 ? `#${myRank} di ${total}` : '&mdash;'}</div>
            </div>
        </div>
        <button onclick="renderTabRanking()" style="font-size:11px;color:#00f2ff;background:none;border:1px solid #00f2ff33;cursor:pointer;padding:4px 8px;border-radius:6px">&#x21BB; Aggiorna</button>
    </div>
    ${fetchError ? `<div class="hud-card !border-red-500/40 bg-red-950/10 mb-3 text-[9px] text-red-400">&#x26A0; ${fetchError}</div>` : ''}
    ${statusHtml}
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">&#x1F3C6; Top 50 Aziende Globali</h3>
    <div class="space-y-2">`;

    if (rows.length === 0) {
        html += `<div class="text-[9px] text-gray-500 text-center py-6">Nessun dato disponibile.<br>Gioca per comparire in classifica!</div>`;
    }

    rows.forEach((r, i) => {
        const pos     = i + 1;
        const posIcon = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
        const isMe    = r.user_id === myId;
        const tsMs    = r.last_active ? new Date(r.last_active).getTime() : 0;
        const online  = tsMs && (now - tsMs) < ONLINE_MS;
        const onlineDot = online
            ? `<span style="display:inline-block;width:6px;height:6px;background:#22c55e;border-radius:50%;margin-left:4px;vertical-align:middle;box-shadow:0 0 4px #22c55e"></span>`
            : '';
        html += `
        <div class="hud-card ${isMe ? '!border-gold/50 bg-gold/5' : ''} flex justify-between items-center py-2">
            <div class="flex items-center gap-3">
                <div style="font-size:18px;width:28px;text-align:center;flex-shrink:0">${posIcon}</div>
                <div>
                    <div style="font-size:11px;font-weight:700;color:${isMe ? '#d4af37' : '#e8eaf0'}">
                        ${r.company_name || 'Chauffeur Empire'}${isMe ? ' <span style="color:#d4af37;font-size:9px">(Tu)</span>' : ''}${onlineDot}
                    </div>
                    <div style="font-size:9px;color:#6b7280">&euro;${Math.floor(r.liquid_assets || 0).toLocaleString('it-IT')} &middot; &#x2605;${Number(r.reputation || 0).toFixed(1)}</div>
                    <div style="font-size:8px;color:#4b5563">&#x1F697; ${r.fleet_count || 0} auto</div>
                </div>
            </div>
            <div style="font-family:'Roboto Mono',monospace;font-weight:700;color:#00f2ff;font-size:13px;white-space:nowrap">
                &euro;${(Math.floor(r.liquid_assets || 0) / 1000).toFixed(0)}k
            </div>
        </div>`;
    });

    // ── ATTACK TERRITORY ─────────────────────────────────────────
    const activePricewars = gameState.pricewars || [];
    const unlockedRegionIds = gameState.unlockedRegions.filter(id => REGIONS[id]);
    html += `</div>
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">⚔️ Guerra dei Prezzi</h3>`;
    if (activePricewars.length > 0) {
        activePricewars.forEach(pw => {
            const rname = REGIONS[pw.regionId]?.name || pw.regionId;
            const isMonopoly = !!pw.monopolyEndsDay;
            html += `<div class="hud-card !border-red-500/40 bg-red-950/10 mb-2 flex justify-between items-center">
                <div>
                    <div style="font-size:11px;font-weight:700;color:${isMonopoly?'#d4af37':'#ff4060'}">${isMonopoly?'👑 MONOPOLIO':'⚔️ Guerra'}: ${rname}</div>
                    <div style="font-size:9px;color:#6b7280">${isMonopoly ? `Scade giorno ${pw.monopolyEndsDay} (+40% tariffe)` : `Fine giorno ${pw.endsDay} (−30% prezzi tuoi)`}</div>
                </div>
                <div style="font-size:10px;font-weight:700;color:${isMonopoly?'#d4af37':'#ff4060'}">${isMonopoly?'+40%':'−30%'}</div>
            </div>`;
        });
    }
    html += `<div class="hud-card mb-2">
        <div style="font-size:9px;color:#9ca3af;margin-bottom:6px">Seleziona una regione sbloccata per attaccare i rivali locali (−30% tariffe per 3 giorni). Se crollano → <b style="color:#d4af37">Monopolio +40% per 7 giorni</b>.</div>
        <div class="flex gap-2">
            <select id="attack-region-select" class="flex-1 text-[9px] bg-black/50 border border-white/10 rounded px-2 py-1 text-gray-200">
                ${unlockedRegionIds.map(id => {
                    const r = REGIONS[id];
                    const atWar = activePricewars.some(pw => pw.regionId === id);
                    const warCost = Math.floor(r.price * 0.25 + 15000);
                    return `<option value="${id}" ${atWar?'disabled':''}>
                        ${r.name}${atWar?' (guerra attiva)':''} — €${warCost.toLocaleString()}
                    </option>`;
                }).join('')}
            </select>
            <button onclick="attackTerritory(document.getElementById('attack-region-select').value)" class="btn-gold !text-[9px] !py-1 !bg-red-900/40 !text-red-300 !border !border-red-700/50">⚔️ Attacca</button>
        </div>
    </div>`;

    // Achievements section
    if (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS.length > 0) {
        const earned = gameState.achievements || [];
        html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🏅 Obiettivi (${earned.length}/${ACHIEVEMENTS.length})</h3><div class="grid grid-cols-2 gap-2">`;
        ACHIEVEMENTS.forEach(ach => {
            const done = earned.includes(ach.id);
            html += `
            <div class="hud-card ${done ? '!border-gold/40 bg-gold/5' : 'opacity-40'} text-center py-2">
                <div class="text-xl mb-1">${ach.icon}</div>
                <div class="text-[8px] font-bold ${done ? 'text-gold' : 'text-gray-500'} leading-tight">${ach.name}</div>
                <div class="text-[7px] text-gray-600 mt-0.5 leading-tight">${ach.desc}</div>
            </div>`;
        });
        html += `</div>`;
    }

    // New Game+ (show after reputation >= 4.5)
    if (gameState.reputation >= 4.5) {
        html += `
        <div class="hud-card !border-purple-500/40 bg-purple-950/20 mt-4 text-center">
            <div class="text-xl mb-2">♾️</div>
            <div class="text-[9px] text-purple-300 font-bold uppercase mb-1">New Game+ Disponibile</div>
            <div class="text-[8px] text-gray-400 mb-3">Ricomincia da capo con un lascito di reputazione e un bonus iniziale. La tua leggenda continua.</div>
            <button onclick="newGamePlus()" class="btn-blue !border-purple-500/50 w-full">Inizia New Game+</button>
        </div>`;
    }

    // Preserve dropdown selection across innerHTML replacement
    const _savedRegion = document.getElementById('attack-region-select')?.value;
    container.innerHTML = html;
    const _regionSel = document.getElementById('attack-region-select');
    if (_regionSel && _savedRegion) _regionSel.value = _savedRegion;
}/* ================================================================
   dispatcher.js — RECOVERY PARTE 3: MERCATI, STAFF & EMAIL
   ================================================================ */

function renderTabFleet() {
    const container = document.getElementById('tab-container');

    // Depot block (gasolio + gomme)
    const hasDepot = typeof hasInvestment === 'function' && hasInvestment('inv_fuel_depot');
    let fuelDepotHtml = '';
    if (hasDepot) {
        const tank      = Math.floor(gameState.fuelTank || 0);
        const cap       = gameState.fuelTankCapacity || 50000;
        const pct       = Math.min(100, Math.round(tank / cap * 100));
        const price     = (gameState.fuelPrice || 1.85).toFixed(2);
        const pColor    = (gameState.fuelPrice||1.85) < 1.68 ? '#22c55e' : (gameState.fuelPrice||1.85) > 2.20 ? '#ff4060' : '#f59e0b';
        const tankColor = pct < 15 ? '#ff4060' : pct < 40 ? '#f59e0b' : '#00f2ff';
        const gomme     = gameState.depositoGomme || 0;
        const gommeColor= gomme === 0 ? '#ff4060' : gomme < 3 ? '#f59e0b' : '#22c55e';
        const outCount  = gameState.fleet.filter(c => c.outOfService).length;
        fuelDepotHtml = `
        <div class="hud-card !border-blue/30 bg-blue/5 mb-4">
            <div class="flex justify-between items-center mb-2">
                <div class="text-[10px] text-blue font-bold uppercase tracking-widest">🛢️ Deposito Aziendale</div>
                <div class="text-[10px] font-bold" style="color:${pColor}">€${price}/L</div>
            </div>
            ${outCount > 0 ? `<div class="text-[9px] text-red-400 font-bold mb-2 flex items-center justify-between gap-1">
                <span>🔴 ${outCount} auto ferme — deposito esaurito</span>
                <button onclick="window.emergencyRefuel()" class="btn-gold !bg-red-900/40 !text-red-300 !text-[7px] !py-0.5 !px-2 animate-pulse">🚨 Rifornimento Emergenza (3×)</button>
            </div>` : ''}
            <div class="text-[8px] text-gray-500 uppercase mb-1">Gasolio</div>
            <div class="flex items-center gap-2 mb-2">
                <div class="fuel-bar-bg flex-1"><div class="fuel-bar-fill" style="width:${pct}%; background:${tankColor}"></div></div>
                <span class="text-[9px] font-mono" style="color:${tankColor}">${tank.toLocaleString()}/${cap.toLocaleString()}L</span>
            </div>
            <div class="grid grid-cols-3 gap-1 mb-3">
                <button onclick="buyFuelForDepot(5000)"  class="btn-blue !text-[8px] !py-1">+5k L<br><span class="text-[7px] opacity-60">€${Math.floor(5000*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
                <button onclick="buyFuelForDepot(15000)" class="btn-blue !text-[8px] !py-1">+15k L<br><span class="text-[7px] opacity-60">€${Math.floor(15000*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
                <button onclick="buyFuelForDepot(${cap})" class="btn-gold !text-[8px] !py-1">Fill<br><span class="text-[7px] opacity-60">€${Math.floor((cap-tank)*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
            </div>
            <div class="flex justify-between items-center mb-1">
                <div class="text-[8px] text-gray-500 uppercase">Treni di Gomme</div>
                <span class="text-[10px] font-bold font-mono" style="color:${gommeColor}">${gomme} set</span>
            </div>
            <div class="grid grid-cols-3 gap-1 mb-3">
                <button onclick="buyTiresForDepot(1)"  class="btn-blue !text-[8px] !py-1">+1 set<br><span class="text-[7px] opacity-60">€800</span></button>
                <button onclick="buyTiresForDepot(5)"  class="btn-blue !text-[8px] !py-1">+5 set<br><span class="text-[7px] opacity-60">€3.500</span></button>
                <button onclick="buyTiresForDepot(10)" class="btn-gold !text-[8px] !py-1">+10 set<br><span class="text-[7px] opacity-60">€6.000</span></button>
            </div>
            ${(() => {
                const lvl = gameState.fuelTankLevel || 1;
                const DEPOT_LVL_LIST = [
                    { level:1, name:'Cisterna Base', priceDiscount:0.00 },
                    { level:2, name:'Cisterna Doppia', priceDiscount:0.02 },
                    { level:3, name:'Deposito Professionale', priceDiscount:0.05 },
                    { level:4, name:'Mega-Depot', priceDiscount:0.08 },
                    { level:5, name:'Hub Logistico', priceDiscount:0.12 },
                ];
                const cur  = DEPOT_LVL_LIST.find(d => d.level === lvl) || DEPOT_LVL_LIST[0];
                const next = DEPOT_LVL_LIST.find(d => d.level === lvl + 1);
                const upgCost = next ? Math.round(5000 * Math.pow(lvl, 1.8)) : 0;
                return `<div class="flex justify-between items-center border-t border-white/5 pt-2 mt-1">
                    <div class="text-[8px] text-gray-500">🏗️ ${cur.name} <span class="text-blue">Lv.${lvl}</span></div>
                    ${next
                        ? `<button onclick="upgradeFuelDepot()" class="btn-gold !text-[7px] !py-0.5 !px-1.5">Upgrade → ${next.name}<br><span class="opacity-60">€${upgCost.toLocaleString()}</span></button>`
                        : `<span class="text-[8px] text-green-400 font-bold">MAX</span>`
                    }
                </div>`;
            })()}
        </div>`;
    }

    // Fuel price ticker (always visible)
    const fp = gameState.fuelPrice || 1.85;
    const fpColor = fp < 1.68 ? '#22c55e' : fp > 2.20 ? '#ff4060' : '#f59e0b';
    const fpTrend = fp < 1.68 ? '📉' : fp > 2.20 ? '📈' : '➡️';
    const fuelTickerHtml = !hasDepot ? `
    <div class="flex items-center gap-2 mb-3 px-1">
        <span class="text-[8px] text-gray-500 uppercase tracking-widest">Gasolio Mercato</span>
        <span class="text-[9px] font-bold font-mono" style="color:${fpColor}">${fpTrend} €${fp.toFixed(4)}/L</span>
        <span class="text-[8px] text-gray-600">(aggiornamento orario)</span>
    </div>` : '';

    // ── Fleet filter bar ──────────────────────────────────────
    const _getBrand = car => car.name ? car.name.split(' ')[0] : 'Altro';
    const allBrands = [...new Set((gameState.fleet || []).map(_getBrand))].sort();
    const allTiers  = [...new Set((gameState.fleet || []).map(c => c.tier))];
    const tierOrder = ['standard','business','vip','ultra'];
    allTiers.sort((a,b) => tierOrder.indexOf(a) - tierOrder.indexOf(b));
    const tierLabels = { standard:'Standard', business:'Business', vip:'VIP', ultra:'Ultra' };
    const tierColors = { standard:'rgba(107,114,128,0.35)', business:'rgba(59,130,246,0.25)', vip:'rgba(168,85,247,0.25)', ultra:'rgba(212,175,55,0.2)' };
    const tierBorder = { standard:'rgba(107,114,128,0.5)', business:'rgba(59,130,246,0.5)', vip:'rgba(168,85,247,0.5)', ultra:'rgba(212,175,55,0.6)' };
    const activeBrand = window._fleetFilter.brand;
    const activeTier  = window._fleetFilter.tier;

    const _brandMeta = {
        'Stellar':  { color:'#3b82f6', bg:'rgba(59,130,246,0.12)',  border:'rgba(59,130,246,0.35)',  icon:'✦' },
        'Volt':     { color:'#22c55e', bg:'rgba(34,197,94,0.12)',   border:'rgba(34,197,94,0.35)',   icon:'⚡' },
        'Majestic': { color:'#d4af37', bg:'rgba(212,175,55,0.12)',  border:'rgba(212,175,55,0.35)',  icon:'♛' },
    };
    const _bm = b => _brandMeta[b] || { color:'#9ca3af', bg:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.12)', icon:b.charAt(0).toUpperCase() };

    const filterBar = (allBrands.length > 1 || allTiers.length > 1) ? `
    <div class="mb-4">
        ${allBrands.length > 1 ? `
        <div class="text-[8px] text-gray-500 uppercase tracking-widest mb-2">Produttore</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px">
            <button onclick="window._fleetFilter.brand=null;renderTabFleet()"
                style="padding:12px 6px;border-radius:12px;border:1px solid ${!activeBrand ? 'rgba(212,175,55,0.55)' : 'rgba(255,255,255,0.1)'};background:${!activeBrand ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)'};text-align:center;cursor:pointer;transition:all .15s">
                <div style="font-size:16px;margin-bottom:4px">🚗</div>
                <div style="font-size:10px;font-weight:800;color:${!activeBrand ? '#d4af37' : '#9ca3af'}">Tutti</div>
                <div style="font-size:9px;color:#4b5563;margin-top:2px">${gameState.fleet.length} auto</div>
            </button>
            ${allBrands.map(b => {
                const cnt = gameState.fleet.filter(c => _getBrand(c) === b).length;
                const isActive = activeBrand === b;
                const bm = _bm(b);
                const brandVal = isActive ? 'null' : `'${b}'`;
                return `<button onclick="window._fleetFilter.brand=${brandVal};renderTabFleet()"
                    style="padding:12px 6px;border-radius:12px;border:1px solid ${isActive ? bm.border.replace('0.35','0.7') : bm.border};background:${isActive ? bm.bg.replace('0.12','0.22') : bm.bg};text-align:center;cursor:pointer;transition:all .15s">
                    <div style="font-size:16px;margin-bottom:4px;color:${bm.color}">${bm.icon}</div>
                    <div style="font-size:10px;font-weight:800;color:${isActive ? bm.color : '#9ca3af'}">${b}</div>
                    <div style="font-size:9px;color:#4b5563;margin-top:2px">${cnt} auto</div>
                </button>`;
            }).join('')}
        </div>` : ''}
        ${allTiers.length > 1 ? `
        <div class="text-[8px] text-gray-500 uppercase tracking-widest mb-1.5">Categoria</div>
        <div class="flex flex-wrap gap-1.5">
            <button onclick="window._fleetFilter.tier=null;renderTabFleet()"
                class="text-[8px] px-2 py-1 rounded-full border transition-colors"
                style="${!activeTier ? 'background:rgba(212,175,55,0.15);border-color:rgba(212,175,55,0.5);color:#d4af37;font-weight:700' : 'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12);color:#6b7280'}">
                Tutte
            </button>
            ${allTiers.map(t => {
                const cnt = gameState.fleet.filter(c => c.tier === t).length;
                const isActive = activeTier === t;
                const tierVal = isActive ? 'null' : `'${t}'`;
                return `<button onclick="window._fleetFilter.tier=${tierVal};renderTabFleet()"
                    class="text-[8px] px-2 py-1 rounded-full border transition-colors"
                    style="${isActive ? 'background:' + tierColors[t] + ';border-color:' + tierBorder[t] + ';color:#e5e7eb;font-weight:700' : 'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12);color:#9ca3af'}">
                    ${tierLabels[t]||t} <span style="opacity:0.6">${cnt}</span>
                </button>`;
            }).join('')}
        </div>` : ''}
    </div>` : '';

    const filteredFleet = (gameState.fleet || []).filter(car => {
        if (window._fleetFilter.brand && _getBrand(car) !== window._fleetFilter.brand) return false;
        if (window._fleetFilter.tier  && car.tier !== window._fleetFilter.tier) return false;
        return true;
    });

    const noResults = filteredFleet.length === 0
        ? `<div class="text-[10px] text-gray-600 text-center py-8">Nessun veicolo corrisponde ai filtri selezionati.</div>`
        : '';

    let html = fuelTickerHtml + fuelDepotHtml + filterBar + `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Tua Flotta <span class="text-gray-600 font-normal">${filteredFleet.length}/${gameState.fleet.length}</span></h3>` + noResults + `<div class="space-y-3 mb-6">`;

    filteredFleet.forEach(car => {
        if (!car.upgrades) car.upgrades = [];

        // Catalog lookup for image + electric type (remap legacy vehicleClass on the fly)
        const _VC_LG = { 'mercedes_e':'stellar_e_exec', 'mercedes_v':'stellar_v_carr', 'mercedes_sprinter':'stellar_v_carr', 'mercedes_s':'stellar_s_imp' };
        const _vc = _VC_LG[car.vehicleClass] || car.vehicleClass;
        const catalog = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : [])
            .find(c => c.vehicleClass === _vc || c.id === _vc || c.id === car.id);
        const isElectric = catalog?.fuel === 'electric';
        const cardImg = catalog?.img || 'assets/fleet/stellar-e-executive.jpg';

        // Energy level (charge for electric, fuel for gasoline)
        const energyPct = isElectric
            ? Math.floor(car.chargeLevel ?? 100)
            : (car.fuel !== undefined ? Math.floor(car.fuel) : 100);
        const energyColor = energyPct < 20 ? '#ff4060' : energyPct < 50 ? '#f59e0b' : (isElectric ? '#22c55e' : '#00f2ff');
        const energyIcon  = isElectric ? '⚡' : '⛽';

        const tirePct  = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
        const tireColor = tirePct < 30 ? '#ff4060' : tirePct < 60 ? '#f59e0b' : '#22c55e';
        const condPct   = Math.max(0, Math.floor(car.condition || 0));
        const condColor = condPct <= 10 ? '#ff4060' : condPct < 30 ? '#ef4444' : condPct < 60 ? '#f59e0b' : '#22c55e';
        const eh        = car.engineHealth !== undefined ? car.engineHealth : 100;
        const ehColor   = eh <= 0 ? '#ff4060' : eh < 30 ? '#ef4444' : eh < 60 ? '#f59e0b' : '#22c55e';

        const outReason = car.outOfService;
        const outLabel  = (outReason === 'fuel' && energyPct > 5) ? null
                        : outReason === 'fuel'   ? (isElectric ? '🔴 FERMA — Batteria scarica' : '🔴 FERMA — Serbatoio esaurito')
                        : outReason === 'tires'  ? '🔴 FERMA — Deposito Gomme esaurito'
                        : outReason === 'engine' ? '🔴 MOTORE FUSO — Riparazione urgente'
                        : null;
        const condWarn  = condPct <= 10 ? '🔴 FERMA — Officina urgente!' : condPct < 30 ? '⚠ Salute critica — incasso −15%' : '';

        const hasCentralina  = car.upgrades.includes('centralina');
        const hasSerbatoio   = car.upgrades.includes('serbatoio_ext');
        const hasVetriC      = car.upgrades.includes('vetri_oscurati');
        const hasTelepassCar = car.upgrades.includes('telepass_car');
        const tuningBadges   = [
            hasCentralina  ? '<span style="background:rgba(0,242,255,0.12);color:#00f2ff;border:1px solid rgba(0,242,255,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🔧+28%</span>' : '',
            hasSerbatoio   ? '<span style="background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.3);font-size:8px;padding:1px 5px;border-radius:6px">⛽−55%</span>' : '',
            hasVetriC      ? '<span style="background:rgba(168,85,247,0.12);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🕶−65%</span>' : '',
            hasTelepassCar ? '<span style="background:rgba(212,175,55,0.12);color:#d4af37;border:1px solid rgba(212,175,55,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🛣−15%</span>' : '',
        ].filter(Boolean).join(' ');

        // Position tracking
        const assignedDriver = gameState.drivers.find(d => d.assignedCarId === car.id && d.id !== 'ceo');
        const poiName   = car.currentPoiId && typeof POIS !== 'undefined' && POIS[car.currentPoiId] ? POIS[car.currentPoiId].name : null;
        const isAtHub   = !car.currentPoiId || car.currentPoiId === 'roma';
        const isReturning = assignedDriver && assignedDriver._returning;
        let returnCostStr = '';
        if (!isAtHub && !isReturning && car.currentPoiId && typeof POIS !== 'undefined' && POIS[car.currentPoiId]) {
            const fp = POIS[car.currentPoiId], hp = POIS['roma'];
            if (fp && hp) {
                const R2 = 6371, dL = (hp.lat-fp.lat)*Math.PI/180, dG = (hp.lng-fp.lng)*Math.PI/180;
                const aa = Math.sin(dL/2)**2 + Math.cos(fp.lat*Math.PI/180)*Math.cos(hp.lat*Math.PI/180)*Math.sin(dG/2)**2;
                const d2 = R2*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa));
                const fc = Math.round(d2*0.18), tc = (hasTelepassCar || (typeof hasInvestment==='function' && hasInvestment('inv_telepass'))) ? 0 : Math.round(d2*0.08);
                returnCostStr = `€${(fc+tc).toLocaleString()} · ${Math.max(1,Math.ceil(d2/90))}h`;
            }
        }

        const repairCostCond = Math.max(500, (100 - condPct) * 85);
        const repairCostEng  = Math.max(800, (100 - eh) * 180);
        const borderClass    = outReason ? 'border-red-500/60' : condPct <= 10 ? 'border-orange-500/60' : 'border-white/10';

        html += `
        <div class="fleet-card-luxury ${borderClass}" style="${cardImg ? `--card-img:url('${cardImg}')` : ''}">
            ${cardImg ? `<div class="fleet-card-photo"></div>` : ''}
            <div class="fleet-card-glass">
                <!-- Header -->
                <div class="fleet-card-header">
                    <div class="flex-1 min-w-0">
                        <div class="fleet-card-brand truncate">
                            ${car.name}
                            ${car.isLease ? (() => {
                            const remDays = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
                            const remMonths = Math.ceil(remDays / 30);
                            const monthly = car.leaseMonthlyRate || Math.round((car.dailyCost||0)*30);
                            const penalty = Math.round(remMonths * monthly * 0.5);
                            return `<span class="text-[8px] text-blue-300 border border-blue-400/40 px-1 ml-1 rounded uppercase">Leasing</span>` +
                                   `<span class="text-[8px] text-gray-500 ml-1">· scade in ${remDays}g</span>` +
                                   `<span class="text-[8px] text-red-400/70 ml-1">· penale €${penalty.toLocaleString()}</span>`;
                        })() : ''}
                        </div>
                        <div class="fleet-card-tier ${isElectric ? 'fleet-card-electric' : ''}">
                            ${car.tier.toUpperCase()} · ${Math.floor((car.mileage||0)/1000)}k km
                            ${isElectric ? '<span class="ml-1 text-[8px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded">CO2 ESENTE</span>' : ''}
                            ${(car.mileage||0) > 0 && (car.mileage||0) % 5000 < 300 ? '<span class="ml-1 text-orange-400">⚠ Tagliando</span>' : ''}
                        </div>
                        ${tuningBadges ? `<div class="mt-1 flex gap-1 flex-wrap">${tuningBadges}</div>` : ''}
                        ${isReturning    ? `<div class="text-[9px] text-cyan-400 mt-0.5">🏠 In rientro all'Hub…</div>`
                          : poiName && !isAtHub ? `<div class="text-[9px] text-yellow-400 mt-0.5">📍 ${poiName}</div>`
                          : `<div class="text-[9px] text-green-400/60 mt-0.5">🏠 Hub Roma</div>`}
                        ${condWarn  ? `<div class="text-[9px] font-bold mt-0.5" style="color:${condColor}">${condWarn}</div>` : ''}
                        ${outLabel  ? `<div class="text-[9px] text-red-400 font-bold mt-0.5">${outLabel}</div>` : ''}
                    </div>
                    <button onclick="openCarModal('${car.id}')" class="btn-blue !py-1 !px-2 ml-2 shrink-0">Gestisci</button>
                </div>

                <!-- Stats bars -->
                <div class="fleet-card-stats">
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">🔧 Carrozzeria</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${condPct}%;background:${condColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${condColor}">${condPct}%</span>
                        ${condPct < 100 ? `
                        <button onclick="repairVehicle('${car.id}')" class="workshop-repair-btn" title="Ripara: €${repairCostCond.toLocaleString()}">🔩 €${repairCostCond.toLocaleString()}</button>
                        <button onclick="instantRepairDC('${car.id}')" class="text-[7px] bg-yellow-900/40 text-yellow-300 px-1 rounded hover:bg-yellow-800/50" title="Insta-Repair: 2 DC">⚡2DC</button>` : ''}
                    </div>
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">${energyIcon} ${isElectric ? 'Batteria' : 'Carburante'}</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${energyPct}%;background:${energyColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${energyColor}">${energyPct}%</span>
                    </div>
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">🔵 Gomme</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${tirePct}%;background:${tireColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${tireColor}">${tirePct}%</span>
                    </div>
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">⚙️ Motore</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${eh}%;background:${ehColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${ehColor}">${eh}%</span>
                        ${eh < 30 && eh > 0 ? '<span class="text-[8px] text-red-400 font-bold">⚠ −2×</span>' : ''}
                    </div>
                </div>

                <!-- Actions -->
                <div class="fleet-card-actions">
                    ${isElectric ? `
                    <button onclick="window.superchargeVehicle('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-green-600/50 bg-green-950/40 text-green-300 hover:bg-green-900/50 transition-colors">
                        ⚡ Supercharger<br><span class="text-[7px] opacity-60">€80 flat</span>
                    </button>` : `
                    <button onclick="window.buyStandardFuel('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-cyan-700/50 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40 transition-colors"
                        title="Distributore pubblico: prezzo pieno">
                        ⛽ Rifornisci<br><span class="text-[7px] opacity-60">€${Math.floor((100-(car.fuel||0))*0.5*(gameState.fuelPrice||1.85))}</span>
                    </button>
                    <button onclick="window.buyBlackMarketFuel('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-yellow-700/50 bg-yellow-950/30 text-yellow-400 hover:bg-yellow-900/40 transition-colors"
                        title="Gasolio Agricolo: −40%, 10% rischio motore">
                        🖤 Agricolo<br><span class="text-[7px] opacity-60">€${Math.floor((100-(car.fuel||0))*0.5*(gameState.fuelPrice||1.85)*0.60)}</span>
                    </button>`}
                    ${eh < 100 ? `
                    <button onclick="window.repairEngine('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-orange-600/50 bg-orange-950/30 text-orange-300 hover:bg-orange-900/40 transition-colors">
                        🔧 Motore<br><span class="text-[7px] opacity-60">€${repairCostEng.toLocaleString()}</span>
                    </button>` : ''}
                </div>

                ${!isAtHub && !isReturning && assignedDriver && assignedDriver.status === 'idle' ? `
                <button onclick="window.returnToHub('${car.id}')"
                    class="w-full mt-1.5 text-[8px] py-1 px-2 rounded border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 transition-colors">
                    🏠 Ritorna all'Hub &nbsp;<span class="opacity-60">${returnCostStr}</span>
                </button>` : ''}
                ${car.isLease ? (() => {
                    const remDays   = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
                    const remMonths = Math.ceil(remDays / 30);
                    const monthly   = car.leaseMonthlyRate || Math.round((car.dailyCost||0)*30);
                    const penalty   = Math.round(remMonths * monthly * 0.5);
                    return `<button onclick="window.terminateLease('${car.id}')"
                        class="w-full mt-1.5 text-[8px] py-1 px-2 rounded border border-red-600/40 bg-red-950/30 text-red-400 hover:bg-red-900/40 transition-colors">
                        📋 Termina Leasing &nbsp;<span class="opacity-70">penale €${penalty.toLocaleString()}</span>
                    </button>`;
                })() : ''}
            </div>
        </div>`;
    });

    // Seized cars notice
    const seized = gameState.seizedCars || [];
    if (seized.length > 0) {
        html += `</div><div class="hud-card !border-red-500/40 bg-red-950/10 mb-4"><div class="text-[10px] text-red-400 font-bold uppercase mb-2">🚨 Veicoli Sequestrati</div>`;
        seized.forEach(sc => {
            const daysLeft = Math.max(0, sc.releaseDay - gameState.day);
            html += `<div class="text-[9px] text-gray-400 flex justify-between"><span>🚗 ${sc.carName}</span><span class="text-red-400">Rilascio fra ${daysLeft}g</span></div>`;
        });
        html += `</div>`;
    }

    html += `</div>
    <div onclick="window.hubNavigate('showroom')"
         style="margin:12px 0;padding:14px 16px;border-radius:10px;
                border:1px solid rgba(0,212,255,0.2);background:rgba(0,212,255,0.05);
                cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:all .18s;"
         onmouseover="this.style.borderColor='rgba(0,212,255,0.45)'"
         onmouseout="this.style.borderColor='rgba(0,212,255,0.2)'">
        <div>
            <div style="font-size:11px;font-weight:800;color:#00d4ff;">🚘 Acquisto Veicoli</div>
            <div style="font-size:10px;color:#4b5563;margin-top:2px;">Vai allo Showroom per configurare e acquistare nuovi veicoli</div>
        </div>
        <div style="font-size:18px;color:rgba(0,212,255,0.4);">→</div>
    </div>`;

    const _totalRides = gameState.questStats?.totalRides || 0;
    const _hasEVHub   = gameState.hasEVHub || false;

    // Prototype / exclusive vehicles
    if (typeof PROTOTYPE_CARS !== 'undefined' && PROTOTYPE_CARS.length > 0) {
        html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🔬 Prototipi Esclusivi</h3><div class="space-y-2">`;
        PROTOTYPE_CARS.forEach(c => {
            const isOwned    = gameState.fleet.some(f => f.protoId === c.id);
            const repOk      = gameState.reputation >= c.reqRep;
            const rideOk     = (c.rideGate||0) <= _totalRides;
            const evOk       = c.fuel !== 'electric' || _hasEVHub;
            const canBuy     = repOk && rideOk && evOk && !isOwned;
            const lockParts  = [];
            if (!repOk)  lockParts.push(`Rep ${c.reqRep}★`);
            if (!rideOk) lockParts.push(`${c.rideGate} corse`);
            if (!evOk)   lockParts.push('Hub EV');
            const lockMsg = isOwned ? '' : lockParts.length ? `🔒 Richiede: ${lockParts.join(' · ')}` : '';
            html += `
            <div class="hud-card ${canBuy ? 'hover:border-gold/50' : 'opacity-60'}">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="text-xs font-bold text-white">${c.name}</div>
                        <div class="text-[9px] text-purple-400">${c.desc}</div>
                        <div class="text-[9px] text-gray-500">Tier: ${c.tier.toUpperCase()} · Min Rep: ${c.reqRep}★</div>
                        ${lockMsg ? `<div class="text-[9px] text-red-400 mt-0.5">${lockMsg}</div>` : ''}
                    </div>
                    ${isOwned
                        ? `<span class="text-green-400 text-[9px] font-bold">✓ In Flotta</span>`
                        : canBuy
                            ? `<button onclick="buyPrototypeCar('${c.id}')" class="btn-gold !text-[8px]">€${c.price.toLocaleString()}</button>`
                            : `<span class="text-gray-600 text-[9px] font-bold px-2">🔒</span>`
                    }
                </div>
            </div>`;
        });
    }

    // ── CONTRATTO MANUTENZIONE ─────────────────────────────────────────────
    const contractActive = gameState.maintenanceContract && gameState.day <= (gameState.maintenanceContractPaidUntilDay||0);
    const contractDaysLeft = contractActive ? gameState.maintenanceContractPaidUntilDay - gameState.day : 0;
    html += `
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-5">🔧 Officina & Contratti</h3>
    <div class="hud-card mb-4 ${contractActive ? '!border-green-500/30 bg-green-950/10' : ''}">
        <div class="flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">Contratto di Manutenzione</div>
                <div class="text-[9px] text-gray-400">−30% su tutte le riparazioni · 7 giorni</div>
                ${contractActive ? `<div class="text-[9px] text-green-400 mt-0.5">✅ Attivo — ${contractDaysLeft}g rimasti</div>` : ''}
            </div>
            ${contractActive
                ? '<span class="text-green-500 text-[9px] font-bold">ATTIVO</span>'
                : `<button onclick="buyMaintenanceContract()" class="btn-gold !text-[8px]">€10.000 / 7g</button>`}
        </div>
    </div>`;

    // ── HUB CONQUEST ──────────────────────────────────────────────────────
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-2">🏛️ Conquista Hub</h3>
    <p class="text-[9px] text-gray-500 italic mb-3">Possiedi la concessione: incassi il 5% su ogni corsa che transita da lì.</p>
    <div class="space-y-2 mb-4">`;
    const hubIds = ['roma_fco','mil_mxp','mil_lin','nap_capo','olbia','ven_mp','venezia','firenze','bologna'];
    if (typeof POIS !== 'undefined') {
        hubIds.filter(id => POIS[id] && (gameState.unlockedRegions||[]).includes(POIS[id].region)).forEach(id => {
            const hub = POIS[id];
            const owned = (gameState.ownedHubs||[]).includes(id);
            const cost  = 50000 + Math.floor(hub.baseFlat * 200);
            const canBuy = !owned && (gameState.reputation||0) >= 2.5 && gameState.cash >= cost;
            html += `
            <div class="hud-card flex justify-between items-center ${owned ? '!border-gold/40 bg-gold/5' : ''}">
                <div>
                    <div class="text-xs font-bold text-white">${hub.name}${owned ? ' 🏛️' : ''}</div>
                    <div class="text-[9px] text-gray-500">${hub.region} · +5% tassa corse · €${Math.round(cost/1000)}k</div>
                </div>
                ${owned
                    ? `<button onclick="sellHub('${id}')" class="btn-gold !bg-red-900/30 !text-red-400 !text-[7px] !py-0.5">Cedi</button>`
                    : `<button onclick="buyHub('${id}')" class="${canBuy ? 'btn-gold' : 'btn-gold opacity-40'} !text-[8px] !py-1" ${canBuy ? '' : 'disabled'}>€${Math.round(cost/1000)}k</button>`
                }
            </div>`;
        });
    }
    html += `</div>`;

    container.innerHTML = html + `</div>`;
}

function renderTabStaff() {
    const container = document.getElementById('tab-container');
    const hqLvl = typeof HQ_LEVELS !== 'undefined' ? HQ_LEVELS.find(l => l.level === (gameState.hqLevel || 0)) : null;
    const maxStaff = hqLvl ? hqLvl.maxStaff : 2;
    const currentStaff = gameState.staff.length + gameState.drivers.filter(d => d.id !== 'ceo').length;
    const hqName = hqLvl ? hqLvl.name : 'Garage Condiviso';
    let html = `
    <div class="hud-card mb-4 flex justify-between items-center">
        <div>
            <div class="text-[9px] text-gray-500 uppercase tracking-widest">Sede Operativa</div>
            <div class="text-xs font-bold text-gold">${hqName}</div>
        </div>
        <div class="text-right">
            <div class="text-[9px] text-gray-500">Staff</div>
            <div class="text-sm font-bold ${currentStaff >= maxStaff ? 'text-red-400' : 'text-white'}">${currentStaff}/${maxStaff === 99 ? '∞' : maxStaff}</div>
        </div>
    </div>
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Ufficio Centralizzato</h3><div class="space-y-2 mb-6">`;
    for(let k in STAFF_ROLES) {
        let s = STAFF_ROLES[k]; let owned = gameState.staff.some(x => x.id === s.id);
        html += `
        <div class="hud-card flex justify-between items-start gap-2">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-white">${s.name}</div>
                <div class="text-[9px] text-gray-500">€${s.salary}/mese</div>
                <div class="text-[9px] text-gray-400 mt-0.5 leading-tight">${s.desc}</div>
            </div>
            <div class="flex-shrink-0 pt-0.5 flex flex-col items-end gap-1">
                ${owned
                    ? `<span class="text-green-500 text-[9px] font-bold uppercase">✓ Attivo</span>
                       <button onclick="window.fireStaff('${s.id}')"
                         class="text-[8px] text-red-400 border border-red-500/30 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer">
                         Licenzia
                       </button>`
                    : `<button onclick="hireOfficeStaff('${s.id}')" class="btn-gold !py-1 !px-2">Assumi</button>`
                }
            </div>
        </div>`;
    }
    const hasHR = gameState.staff.some(s => s.id === 'hr');

    // ── HR Automation premium buff ──────────────────────────────────────────
    const hrExpires  = gameState.hrAutomationExpiresAt ? new Date(gameState.hrAutomationExpiresAt) : null;
    const hrActive   = hrExpires && hrExpires > new Date();
    const hrTimeLeft = hrActive ? (() => {
        const ms = hrExpires - Date.now();
        const d  = Math.floor(ms / 86400000);
        const h  = Math.floor((ms % 86400000) / 3600000);
        return d > 0 ? `${d}g ${h}h` : `${h}h`;
    })() : null;
    html += `</div>
    <div class="hud-card mb-4 ${hrActive ? '!border-purple-500/50 bg-purple-950/10' : '!border-white/10'}">
        <div class="flex justify-between items-start">
            <div>
                <div class="text-[9px] text-purple-400 uppercase tracking-widest font-bold mb-0.5">🤝 Gestione Sindacale HR</div>
                <div class="text-[9px] text-gray-400 leading-snug max-w-[220px]">Gli scioperi vengono risolti automaticamente senza popup bloccanti. L'HR applica un accordo immediato.</div>
                ${hrActive ? `<div class="text-[9px] text-green-400 mt-1 font-bold">✅ Attivo — scade tra ${hrTimeLeft}</div>` : `<div class="text-[9px] text-gray-500 mt-1">7 giorni · 5 DC</div>`}
            </div>
            <div class="shrink-0 ml-2">
                ${hrActive
                    ? `<span class="text-green-400 text-[9px] font-bold">ATTIVO</span>`
                    : `<button onclick="window.buyHRAutomation()" class="btn-gold !py-1 !px-2 !text-[8px]">🪙 5 DC<br><span class="opacity-60">7 giorni</span></button>`}
            </div>
        </div>
    </div>
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">I Tuoi Autisti</h3><div class="space-y-2">`;
    gameState.drivers.filter(d => d.id !== 'ceo').forEach(d => {
        const fatigue = d.fatigue || 0;
        const fatigueColor = fatigue >= 85 ? '#ef4444' : fatigue >= 60 ? '#f59e0b' : '#8b5cf6';
        const isResting = d.status === 'resting';
        const levelData = (DRIVER_LEVELS || [])[d.level || 0] || { name:'Rookie', xpMin:0, xpMax:200, badge:'lvl-rookie' };
        const nextLvl   = (DRIVER_LEVELS || [])[Math.min((d.level||0)+1, DRIVER_LEVELS.length-1)];
        const _xpDenom = nextLvl ? (nextLvl.xpMin - levelData.xpMin) : 0;
        const xpPct = (!nextLvl || nextLvl === levelData || _xpDenom <= 0) ? 100 : Math.max(0, Math.min(100, Math.round(((d.xp||0) - levelData.xpMin) / _xpDenom * 100)));
        const stress      = d.stress_level !== undefined ? d.stress_level : 0;
        const isBurnout   = d.burnout_until && (gameState.day * 24 + gameState.hour) < d.burnout_until;
        const stressColor = stress >= 100 ? '#ff4060' : stress >= 80 ? '#ef4444' : stress >= 50 ? '#f59e0b' : '#22c55e';
        const statusLabel = isBurnout
            ? `<span class="text-red-400 font-bold text-[9px]">🔥 BURNOUT — Recupero ${d.restHoursLeft}h</span>`
            : isResting
                ? `<span class="text-orange-400 font-bold text-[9px]">☕ Riposo (${d.restHoursLeft}h rimaste)</span>`
                : fatigue >= 85
                    ? `<span class="text-red-400 text-[9px] font-bold">⚠ ESAUSTO${!hasHR ? ' — Mandalo a riposo!' : ''}</span>`
                    : stress >= 80
                        ? `<span class="text-orange-300 text-[9px] font-bold">😰 Sotto stress — velocità −33%</span>`
                        : '';
        const avatarHtml = d.avatarBase64
            ? `<img src="${d.avatarBase64}" class="driver-avatar" onclick="document.getElementById('avatar-upload-${d.id}').click()" title="Clicca per cambiare foto">`
            : `<div class="driver-avatar-placeholder" onclick="document.getElementById('avatar-upload-${d.id}').click()" title="Aggiungi foto">👤</div>`;
        html += `
        <div class="hud-card">
            <input type="file" id="avatar-upload-${d.id}" accept="image/*" style="display:none" onchange="window.setDriverAvatar('${d.id}', this)">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    ${avatarHtml}
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-white">${d.name} <span class="lvl-badge ${levelData.badge} ml-1">${levelData.name}</span>${d.isOnStrike ? '<span class="ml-2 text-[8px] bg-red-900/60 text-red-400 px-1 rounded font-bold">🪧 SCIOPERO</span>' : ''}</div>
                        ${d.trait ? `<div class="text-[8px] text-purple-400 mt-0.5">${d.trait.name} — ${d.trait.desc}</div>` : ''}
                        <div class="text-[9px] text-gray-500">€${d.salary}/mese · XP: ${d.xp||0}</div>
                        ${statusLabel ? `<div class="mt-0.5">${statusLabel}</div>` : ''}
                    </div>
                </div>
                <div class="flex gap-1 items-center shrink-0">
                    ${d.isOnStrike
                        ? `<button onclick="resolveStrike('${d.id}')" class="btn-gold !bg-yellow-900/30 !text-yellow-400 !text-[8px]">🤝 Accordo</button>`
                        : (!isResting && !isBurnout && d.status !== 'busy' && (fatigue >= 40 || stress >= 50))
                            ? `<button onclick="putDriverOnBreak('${d.id}')" class="btn-gold !bg-orange-900/30 !text-orange-400 !text-[8px]" title="Pausa 4h: riduce stress del 40%">☕ Pausa</button>`
                            : ''}
                    <button onclick="window.renderDriverSkillModal('${d.id}')" class="btn-gold !bg-blue-900/30 !text-blue-300 !text-[8px]" title="Albero Abilità">⭐ Skills</button>
                    <button onclick="fireDriver('${d.id}')" class="btn-gold !bg-red-900/30 !text-red-400 !text-[8px]">Licenzia</button>
                </div>
            </div>
            <div class="flex items-center gap-1 mt-1.5">
                <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">Fatica</span>
                <div class="fatigue-bar-bg flex-1">
                    <div class="fatigue-bar-fill" style="width:${fatigue}%; background:${fatigueColor}"></div>
                </div>
                <span class="text-[8px] font-mono ml-1" style="color:${fatigueColor}">${Math.floor(fatigue)}%</span>
            </div>
            <div class="flex items-center gap-1 mt-1">
                <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">XP</span>
                <div class="xp-bar-bg flex-1"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
                <span class="text-[8px] font-mono ml-1 text-blue">${xpPct}%</span>
            </div>
            ${(() => {
                const morale = d.morale !== undefined ? d.morale : 100;
                const moraleColor = morale < 25 ? '#ff4060' : morale < 60 ? '#f59e0b' : '#22c55e';
                return `<div class="flex items-center gap-1 mt-1">
                    <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">Morale</span>
                    <div class="fatigue-bar-bg flex-1"><div class="fatigue-bar-fill" style="width:${morale}%; background:${moraleColor}"></div></div>
                    <span class="text-[8px] font-mono ml-1" style="color:${moraleColor}">${Math.floor(morale)}%</span>
                </div>`;
            })()}
            ${(() => {
                const sat = d.satisfaction !== undefined ? d.satisfaction : 70;
                const satColor = sat < 30 ? '#ff4060' : sat < 60 ? '#f59e0b' : '#22c55e';
                return `<div class="flex items-center gap-1 mt-1">
                    <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">Soddi.</span>
                    <div class="fatigue-bar-bg flex-1"><div class="fatigue-bar-fill" style="width:${sat}%; background:${satColor}"></div></div>
                    <span class="text-[8px] font-mono ml-1" style="color:${satColor}">${Math.floor(sat)}%</span>
                    <button onclick="payDriverBonus('${d.id}', 500)" class="ml-1 text-[7px] bg-green-900/40 text-green-400 px-1 rounded hover:bg-green-800/50">+€500</button>
                </div>`;
            })()}
            <div class="flex items-center gap-1 mt-1">
                <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">Stress</span>
                <div class="fatigue-bar-bg flex-1">
                    <div class="fatigue-bar-fill" style="width:${stress}%; background:${stressColor}"></div>
                </div>
                <span class="text-[8px] font-mono ml-1" style="color:${stressColor}">${Math.floor(stress)}%</span>
                ${stress >= 50 && !isResting && !isBurnout && d.status !== 'busy'
                    ? `<button onclick="putDriverOnBreak('${d.id}')" class="ml-1 text-[7px] bg-orange-900/40 text-orange-400 px-1 rounded hover:bg-orange-800/50" title="Pausa 4h — stress −40%">☕ −40%</button>
                       <button onclick="payStressClear('${d.id}')" class="ml-1 text-[7px] bg-green-900/40 text-green-400 px-1 rounded hover:bg-green-800/50" title="Paga €1.000 — azzera stress istantaneamente">💊 €1k</button>`
                    : ''}
            </div>
            ${(() => {
                const specs = typeof DRIVER_SPECIALTIES !== 'undefined' ? DRIVER_SPECIALTIES : [];
                const curSpec = specs.find(s => s.id === d.specialty);
                const opts = specs.map(s => `<option value="${s.id}" ${d.specialty === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
                return `<div class="flex items-center gap-1 mt-1.5">
                    <span class="text-[8px] text-gray-600 uppercase w-10 shrink-0">Spec.</span>
                    <select onchange="assignSpecialty('${d.id}', this.value)" class="flex-1 text-[8px] bg-black/40 border border-white/10 rounded px-1 py-0.5 text-gray-300 cursor-pointer">
                        <option value="">— Nessuna —</option>${opts}
                    </select>
                    ${curSpec ? `<span class="text-[8px] text-blue-400 ml-1">${curSpec.name.split(' ')[0]}</span>` : ''}
                </div>`;
            })()}
            <div class="driver-skills-row mt-2">
                ${[
                    ['⚡ Vel.', d.skill_speed      ?? 50, '#00f2ff'],
                    ['🔧 Eff.', d.skill_efficiency ?? 50, '#22c55e'],
                    ['✨ Car.', d.skill_charisma   ?? 50, '#a855f7'],
                ].map(([label, val, color]) => `
                <div class="driver-skill-chip">
                    <span class="driver-skill-label">${label}</span>
                    <div class="driver-skill-bar-bg">
                        <div class="driver-skill-bar-fill" style="width:${val}%;background:${color}"></div>
                    </div>
                    <span class="driver-skill-val" style="color:${color}">${val}</span>
                </div>`).join('')}
            </div>
        </div>`;
    });
    // Meet & Greet status section
    const _mgStaff = (gameState.staff || []).filter(s => s.skill === 'meetgreet');
    if (_mgStaff.length > 0) {
        const _mgIncome = gameState._lastMgIncome || 0;
        html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🤝 Meet &amp; Greet Aeroportuale</h3><div class="space-y-2 mb-6">`;
        _mgStaff.forEach(asst => {
            html += `<div class="hud-card flex justify-between items-center">
                <div>
                    <div class="text-xs font-bold text-white">${asst.name}</div>
                    <div class="text-[9px] text-gray-400">Aeroporto: ${asst.airport || '—'} · Missioni passive: attive · Carburante: €0</div>
                    <div class="text-[9px] text-green-400 mt-0.5">Entrate ultima sessione: +€${(_mgIncome / _mgStaff.length).toFixed(0)}/g</div>
                </div>
                <span class="text-green-500 text-[9px] font-bold">✓ ON DUTY</span>
            </div>`;
        });
    }
    const tierIcon = { standard:'🟢', business:'🔵', vip:'🟣', ultra:'⚫' };
    html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">Mercato Reclutamento</h3>
    <p class="text-[9px] text-gray-600 mb-3 italic">I candidati si aggiornano dopo ogni assunzione.</p>
    <div class="space-y-2">`;
    (gameState.availableRecruits || []).forEach(p => {
        html += `
        <div class="hud-card flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">${p.name} <span class="text-[9px] ml-1">${tierIcon[p.tier] || ''} ${p.tier.toUpperCase()}</span></div>
                ${p.trait ? `<div class="mt-0.5">${typeof window._traitBadgeHTML === 'function' ? window._traitBadgeHTML(p) : ''} <span class="text-[8px] text-gray-500">${p.trait.desc}</span></div>` : ''}
                <div class="text-[9px] text-gray-500 mt-0.5">Stipendio: €${p.salary}/mese | Anticipo: €${p.salary*2}</div>
            </div>
            <button onclick="hireDriver('${p.name}', ${p.salary})" class="btn-gold !py-1">Assumi</button>
        </div>`;
    });
    if ((gameState.availableRecruits || []).length === 0) {
        html += `<div class="text-[10px] text-gray-600 italic">Nessun candidato disponibile al momento.</div>`;
    }

    // ── DRIVER ACADEMY ─────────────────────────────────────────────────────
    const _academyDrivers = gameState.drivers.filter(d => d.id !== 'ceo');
    const _inTrainingCount = (gameState.driverAcademy||[]).length;
    html += `</div><div class="flex items-center justify-between border-b border-white/10 pb-1 mb-3 mt-5">
        <h3 class="text-[10px] text-gold uppercase tracking-widest">🎓 Accademia Autisti</h3>
        ${_inTrainingCount > 0 ? `<span class="text-[9px] text-yellow-400 font-bold">📚 ${_inTrainingCount} in formazione</span>` : ''}
    </div>`;
    if (_academyDrivers.length === 0) {
        html += `<div class="text-[9px] text-gray-600 italic mb-4">Assumi almeno un autista per accedere all'Accademia.</div>`;
    } else {
        html += `
        <div class="hud-card mb-3 flex items-center justify-between gap-3">
            <div>
                <div class="text-xs font-bold text-white">Gestione Corsi</div>
                <div class="text-[9px] text-gray-500 mt-0.5">${_academyDrivers.length} autisti · ${_inTrainingCount} in corso · 5 corsi disponibili</div>
            </div>
            <button onclick="window.openAcademyModal()" class="btn-gold !text-[9px] !py-1.5 !px-3 shrink-0">Apri Accademia →</button>
        </div>`;
    }

    // ── CEO DELLA SETTIMANA ────────────────────────────────────────────────
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🏆 CEO della Settimana</h3>
    <div class="hud-card">
        <div class="flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">Settimana in Corso</div>
                <div class="text-[9px] text-gray-400">Reset domenica · Premio: Driver Coins</div>
            </div>
            <div class="text-right">
                <div class="text-[10px] font-bold text-gold">€${(gameState.weeklyEarnings||0).toLocaleString()}</div>
                <div class="text-[8px] text-gray-500">${gameState.weeklyRides||0} corse</div>
            </div>
        </div>
        <div class="text-[8px] text-gray-600 mt-1 italic">Il vincitore riceve fino a 50 DC domenica sera.</div>
    </div>`;

    container.innerHTML = html + `</div>`;
}

function renderTabEmails() {
    const container = document.getElementById('tab-container');
    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Comunicazioni Riservate</h3>`;

    // Active buffs + political tokens banner
    const now = gameState.day * 24 + gameState.hour;
    const activeBuffs = (gameState.activeBuffs || []).filter(b => b.until > now);
    const polTokens = gameState.politicalTokens || 0;
    if (activeBuffs.length || polTokens) {
        html += `<div class="hud-card mb-3 !border-green-500/30 bg-green-950/10 text-[9px] text-green-300">`;
        if (polTokens) html += `<span class="mr-3">🏛️ Gettoni Politici: <b>${polTokens}</b></span>`;
        activeBuffs.forEach(b => {
            const hoursLeft = Math.max(0, b.until - now);
            const label = b.type === 'earnings_pct' ? `+${b.value}% guadagni`
                        : b.type === 'tip_pct'      ? `+${b.value}% mance`
                        : b.type === 'fine_discount' ? `−${b.value}% multe`
                        : b.type === 'speed_boost'  ? `+${b.value}% velocità`
                        : b.type === 'vip_queue'    ? `+${b.value}% clienti VIP`
                        : b.type;
            html += `<span class="mr-3">✨ ${label} <span class="text-gray-400">(${hoursLeft}h)</span></span>`;
        });
        if (gameState.fuelPriceLock && gameState.fuelPriceLockUntil > now) {
            const h = Math.max(0, gameState.fuelPriceLockUntil - now);
            html += `<span class="mr-3">⛽ Prezzo carburante bloccato €${gameState.fuelPriceLock.toFixed(2)} <span class="text-gray-400">(${h}h)</span></span>`;
        }
        html += `</div>`;
    }

    const unread = gameState.emails.filter(e => e.status === 'unread');
    if (unread.length === 0) html += `<div class="text-center text-gray-600 mt-10 italic text-[11px]">Nessun nuovo messaggio in arrivo.</div>`;
    unread.forEach(e => {
        const gameHour = gameState.day * 24 + gameState.hour;
        const hoursLeft = e.expiresAt ? Math.max(0, e.expiresAt - gameHour) : null;
        const expiryLabel = hoursLeft !== null
            ? `<span class="text-${hoursLeft <= 3 ? 'red' : 'orange'}-400 text-[8px]">⏰ Scade in ${hoursLeft}h</span>`
            : '';
        const isGrey    = e.type === 'grey_market';
        const isDiamond = e.type === 'diamond';
        const isBroker  = e.type === 'broker_result';
        const isVip     = e.type.startsWith('vip_');
        const isVipEvent= isVip && (e.type.endsWith('_event') || e.type.endsWith('_payment'));
        const cardBorder = isGrey ? '!border-red-500/40 bg-red-950/10'
                         : isDiamond ? '!border-yellow-400/50 bg-yellow-950/15'
                         : isBroker ? (e.brokerGain >= 0 ? '!border-green-500/40 bg-green-950/10' : '!border-red-500/40 bg-red-950/10')
                         : isVipEvent ? '!border-orange-500/40 bg-orange-950/10'
                         : isVip ? '!border-purple-500/40 bg-purple-950/10'
                         : '';
        const typeLabel  = isGrey    ? '<span class="text-red-400 font-bold uppercase text-[8px]">⚠ GREY MARKET</span>'
                         : isDiamond ? '<span class="font-bold uppercase text-[8px]" style="color:#d4af37">🔶 DIAMOND</span>'
                         : isBroker  ? `<span class="${e.brokerGain >= 0 ? 'text-green-400' : 'text-red-400'} font-bold uppercase text-[8px]">📊 BROKER</span>`
                         : isVipEvent ? '<span class="text-orange-400 font-bold uppercase text-[8px]">⚡ EVENTO VIP</span>'
                         : isVip ? '<span class="text-purple-400 font-bold uppercase text-[8px]">👑 CLIENTE VIP</span>'
                         : `<span class="text-gold uppercase text-[8px]">${e.type.replace('_',' ')}</span>`;
        const subjectColor = isGrey ? 'text-red-300' : isDiamond ? 'text-yellow-300' : isVip ? 'text-purple-200' : 'text-white';

        html += `<div class="hud-card mb-3 ${cardBorder}"><div class="text-[9px] text-gray-500 mb-1 flex justify-between"><span>DA: ${e.sender}</span>${typeLabel}</div><div class="text-xs font-bold ${subjectColor} mb-1">${e.subject}</div>${expiryLabel ? `<div class="mb-2">${expiryLabel}</div>` : ''}`;

        if (e.type === 'ceo_event') {
            html += `<div class="text-[10px] text-gray-300 mb-3">${e.eventData.desc}</div><div class="flex flex-col gap-2">`;
            e.eventData.choices.forEach((c, idx) => {
                html += `<button onclick="negotiateEmail(${e.id}, 0, ${idx})" class="btn-gold !text-[9px] !text-left">${c.text}</button>`;
            });
            html += `</div>`;
        } else if (e.type === 'shadow') {
            const sr = e.shadowData;
            const hasVetri = gameState.fleet.some(c => (c.upgrades||[]).includes('vetri_oscurati'));
            html += `<div class="text-[10px] text-red-200 mb-1">Pagamento: <b style="color:#ff4060">×5 tariffa</b> — Rischio sequestro: <b style="color:#ff4060">${sr.seizureRisk}%</b>${hasVetri ? ' <span style="color:#22c55e">(−65% con Vetri Oscurati)</span>' : ' <span style="color:#f59e0b">⚠ Installa Vetri Oscurati</span>'}</div>
            <div class="text-[10px] text-gray-400 mb-3">Un checkpoint della polizia verrà posizionato sulla rotta. Operazione ad altissimo rischio.</div>
            <div class="flex gap-2">
                <button onclick="acceptShadowMission(${e.id})" class="btn-gold !bg-red-950/60 !text-red-200 !border !border-red-600/60 flex-1">🔴 ACCETTA RISCHIO (×5)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Rifiuta</button>
            </div>`;
        } else if (e.type === 'poaching') {
            html += `<div class="text-[10px] text-orange-300 mb-3">${e.rivalName} offre a <b>${e.driverName}</b> €${e.counterOffer.toLocaleString()}/mese. Vuoi pareggiare l'offerta?</div>
            <div class="flex gap-2">
                <button onclick="respondPoaching(${e.id}, true)"  class="btn-gold flex-1 !text-[9px]">✅ Pareggia (€${e.counterOffer.toLocaleString()}/mese)</button>
                <button onclick="respondPoaching(${e.id}, false)" class="btn-blue flex-1 !text-[9px] !text-red-300">❌ Lascialo andare</button>
            </div>`;
        } else if (e.type === 'grey_market') {
            html += `<div class="text-[10px] text-gray-400 mb-3">Tariffa tripla. Se la polizia ti ferma durante questa corsa il veicolo viene sequestrato per 7 giorni.</div>
            <div class="flex gap-2">
                <button onclick="acceptGreyMarket(${e.id})" class="btn-gold !bg-red-900/40 !text-red-300 !border !border-red-700/50 flex-1">⚠ Accetta Rischio</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Rifiuta</button>
            </div>`;
        } else if (e.type === 'diamond') {
            html += `<div class="text-[10px] mb-2" style="color:#d4af37">Contratto Diamond — €${(e.offer||0).toLocaleString()}</div>
            <div class="text-[9px] text-gray-400 mb-3">Richiede asset Lifestyle specifici e reputazione minima. Pagamento in contanti alla consegna.</div>
            <div class="flex gap-2">
                <button onclick="acceptDiamondContract(${e.id})" class="btn-gold flex-1 !text-[9px]" style="background:linear-gradient(135deg,#92400e,#78350f);border-color:#d4af37">🔶 ACCETTA</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;
        } else if (e.type === 'broker_result') {
            const pl = e.brokerGain >= 0 ? `+€${e.brokerGain.toLocaleString()}` : `−€${Math.abs(e.brokerGain).toLocaleString()}`;
            const plColor = e.brokerGain >= 0 ? '#22c55e' : '#ef4444';
            html += `<div class="text-[10px] mb-2">Capitale investito: <b>€${(e.brokerCapital||0).toLocaleString()}</b> · Profilo: ${e.brokerRisk||''}</div>
            <div class="text-sm font-bold mb-3" style="color:${plColor}">${pl}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; if(typeof spawnMoneyParticles==='function'){const r=this.getBoundingClientRect();spawnMoneyParticles(r.left+r.width/2,r.top,${e.brokerGain||0});} renderTabEmails();" class="btn-blue w-full !text-[9px]">OK, Incassato</button>`;
        } else if (e.type === 'driver_msg') {
            html += `<div class="text-[10px] text-gray-300 mb-3 leading-relaxed">${e.body || e.subject}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue w-full !text-[9px]">Ho capito</button>`;
        } else if (e.type === 'info') {
            html += `<div class="text-[10px] text-gray-300 mb-3">${e.subject}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue w-full !text-[9px]">OK, Capito</button>`;

        // ── VIP CLIENTS ──────────────────────────────────────────────────────
        } else if (e.type === 'vip_grigori') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `<div class="text-[10px] text-gray-300 mb-2">🕵️ Richiede: <b>Majestic Spirit o E-Specter ≥95%</b> e autista Lv2+.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b> + mancia €15.000</div>
            <div class="flex gap-2">
                <button onclick="acceptVipGrigori(${e.id})" class="btn-gold flex-1 !text-[9px]">🕵️ Accetta (VVIP)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_grigori_event') {
            const cost = (e.vipEventData||{}).cost||500;
            html += `<div class="text-[10px] text-gray-300 mb-3">Durante il trasporto Grigori ha richiesto un rerouting di emergenza per motivi di sicurezza. Come gestite la situazione?</div>
            <div class="flex gap-2">
                <button onclick="vipGrigoriEventAccept(${e.id})" class="btn-gold flex-1 !text-[9px]">✅ Soddisfa (−€${cost})</button>
                <button onclick="vipGrigoriEventDecline(${e.id})" class="btn-blue flex-1 !text-[9px] !text-red-300">❌ Ignora (−0.1★)</button>
            </div>`;

        } else if (e.type === 'vip_strata') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `<div class="text-[10px] text-gray-300 mb-2">💼 Richiede: <b>Berlina Business (Stellar E/S/Q)</b> ≥70%.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">⚠ 20% rischio chargeback · 5-streak = buff +10% guadagni</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipStrata(${e.id})" class="btn-gold flex-1 !text-[9px]">💼 Accetta B2B</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_platinum') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const vCount = (gameState.fleet||[]).filter(c=>c.vehicleClass==='stellar_v_carr'&&(c.condition||0)>=70&&!c.outOfService&&!c.isSeized).length;
            html += `<div class="text-[10px] text-gray-300 mb-2">⭐ Richiede: <b>2× Stellar V-Carrier ≥70%</b> (disponibili: ${vCount}/2).<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">40% paparazzi event · Hype buff +20% mance</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipPlatinum(${e.id})" class="btn-gold flex-1 !text-[9px]">⭐ Accetta (Diva)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_platinum_event') {
            html += `<div class="text-[10px] text-gray-300 mb-3">📸 Paparazzi intercettati sul percorso. Come vuoi gestire la situazione?</div>
            <div class="flex gap-2">
                <button onclick="vipPlatinumEventBlock(${e.id})" class="btn-gold flex-1 !text-[9px]">🚫 Blocca (−€300 + buff)</button>
                <button onclick="vipPlatinumEventAllow(${e.id})" class="btn-blue flex-1 !text-[9px]">📸 Lascia scattare (+0.15★)</button>
            </div>`;

        } else if (e.type === 'vip_onorevole') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `<div class="text-[10px] text-gray-300 mb-2">🏛️ Richiede: <b>Berlina Discreta (no EV) Lv2+ autista</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Compenso: +1 Gettone Politico · 10% GdF check</div>
            <div class="flex gap-2">
                <button onclick="acceptVipOnorevole(${e.id})" class="btn-gold flex-1 !text-[9px]">🏛️ Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_onorevole_event') {
            html += `<div class="text-[10px] text-gray-300 mb-3">🚔 La Guardia di Finanza ha fermato il veicolo durante il trasporto istituzionale. Come procedi?</div>
            <div class="flex gap-2">
                <button onclick="vipOnorevoleEventCopera(${e.id})" class="btn-gold flex-1 !text-[9px]">🤝 Coopera (−Token o −€1k)</button>
                <button onclick="vipOnorevoleEventResisti(${e.id})" class="btn-blue flex-1 !text-[9px]">⚖️ Resisti (+1 Token, −0.05★)</button>
            </div>`;

        } else if (e.type === 'vip_emiro') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const validVcSet = ['majestic_spirit','majestic_e_specter','stellar_s_imp','stellar_g_over','volt_s_hyper'];
            const readyCount = (gameState.fleet||[]).filter(c=>validVcSet.includes(c.vehicleClass)&&(c.condition||0)>=80&&!c.outOfService&&!c.isSeized).length;
            html += `<div class="text-[10px] text-gray-300 mb-2">👑 Richiede: <b>4 veicoli VIP/Ultra ≥80%</b> (disponibili: ${readyCount}/4).<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Bonus: blocco prezzo carburante 48h · 30% shopping +€5k</div>
            <div class="flex gap-2">
                <button onclick="acceptVipEmiro(${e.id})" class="btn-gold flex-1 !text-[9px]">👑 Accetta Convoglio</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_golden') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `<div class="text-[10px] text-gray-300 mb-2">⚽ Richiede: <b>Majestic Spirit / Volt S-Hyper / E-Specter ≥80%</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">60% danno auto · Tutti autisti −20 stress dopo la corsa</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipGolden(${e.id})" class="btn-gold flex-1 !text-[9px]">⚽ Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_techbro') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `<div class="text-[10px] text-gray-300 mb-2">⚡ Richiede: <b>EV ≥90% condizione · autista stress ≤20%</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Bonus: routing buff +5% velocità per 24h</div>
            <div class="flex gap-2">
                <button onclick="acceptVipTechBro(${e.id})" class="btn-gold flex-1 !text-[9px]">⚡ Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_garante') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `<div class="text-[10px] text-gray-300 mb-2">⚠️ Richiede: <b>G-Overlord o Majestic Spirit ≥85% (no EV)</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-red-400">25% posto di blocco · Autista +50 stress · Multa −50% per 24h</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipGarante(${e.id})" class="btn-gold !bg-red-950/50 !border-red-700/50 flex-1 !text-[9px] !text-red-200">⚠️ Accetta (Rischio)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_garante_event') {
            const fine = (e.vipEventData||{}).fine||2000;
            const disc = typeof window._getBuffValue === 'function' ? window._getBuffValue('fine_discount') : 0;
            const finalFine = Math.floor(fine * (1 - disc/100));
            html += `<div class="text-[10px] text-gray-300 mb-3">🚔 Posto di blocco durante il trasporto. Multa stimata: €${finalFine.toLocaleString()}${disc>0?` (−${disc}% buff Il Garante)`:''}</div>
            <div class="flex gap-2">
                <button onclick="vipGaranteEventPaga(${e.id})" class="btn-blue flex-1 !text-[9px]">💸 Paga (€${finalFine.toLocaleString()})</button>
                <button onclick="vipGaranteEventIntimidisci(${e.id})" class="btn-gold flex-1 !text-[9px]">😤 Intimidisci (Token/Rischio)</button>
            </div>`;

        } else if (e.type === 'vip_wedding') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const majesticOk = (gameState.fleet||[]).some(c=>c.vehicleClass==='majestic_spirit'&&c.condition>=100&&!c.outOfService&&!c.isSeized);
            const vCount = (gameState.fleet||[]).filter(c=>c.vehicleClass==='stellar_v_carr'&&c.condition>=100&&!c.outOfService&&!c.isSeized).length;
            html += `<div class="text-[10px] text-gray-300 mb-2">💍 Richiede: <b>Majestic Spirit 100%</b> ${majesticOk?'✅':'❌'} <b>+ 2× V-Carrier 100%</b> (${vCount}/2).<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Saldo posticipato · 30% drama · VIP queue +25% 24h</div>
            <div class="flex gap-2">
                <button onclick="acceptVipWedding(${e.id})" class="btn-gold flex-1 !text-[9px]">💍 Accetta Corteo</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_wedding_event') {
            html += `<div class="text-[10px] text-gray-300 mb-3">💥 Drama nuziale: uno sposo ha abbandonato la cerimonia. White Lace chiede il tuo intervento immediato.</div>
            <div class="flex gap-2">
                <button onclick="vipWeddingEventGestisci(${e.id})" class="btn-gold flex-1 !text-[9px]">💍 Gestisci (−€800 +€2k)</button>
                <button onclick="vipWeddingEventIgnora(${e.id})" class="btn-blue flex-1 !text-[9px] !text-red-300">❌ Ignora (−0.2★)</button>
            </div>`;

        } else if (e.type === 'vip_wedding_payment') {
            const bonus = (e.vipEventData||{}).bonus||0;
            html += `<div class="text-[10px] text-gray-300 mb-3">💍 Saldo posticipato White Lace Weddings: <b class="text-green-400">+€${bonus.toLocaleString()}</b></div>
            <button onclick="vipWeddingPaymentCollect(${e.id})" class="btn-gold w-full !text-[9px]">💰 Incassa Saldo</button>`;

        } else if (e.type === 'vip_erede') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const hasKasko = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
            html += `<div class="text-[10px] text-gray-300 mb-2">💸 Richiede: <b>Volt S-Hyper / Majestic ≥80%</b> + Kasko ${hasKasko?'✅':'❌ MANCANTE'}.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">30% incidente (Kasko protegge) · 30% viral +100% tip</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipErede(${e.id})" class="btn-gold flex-1 !text-[9px]" ${!hasKasko?'disabled style="opacity:0.4"':''}>💸 Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else {
            html += `<div class="text-[10px] text-gray-300 mb-3">Appalto potenziale da €${(e.offer||0).toLocaleString()}.</div><div class="flex gap-2"><button onclick="negotiateEmail(${e.id}, ${e.offer||0})" class="btn-gold flex-1">Accetta</button><button onclick="negotiateEmail(${e.id}, ${Math.floor((e.offer||0)*1.3)})" class="btn-gold !bg-gray-800 flex-1">Rilancia</button></div>`;
        }
        html += `</div></div>`;
    });
    container.innerHTML = html;
}

window.openCarModal = function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if(!car) return;
    document.getElementById('car-modal-title').innerText = car.name;
    document.getElementById('car-modal-desc').innerText = `${car.tier.toUpperCase()} · Condizione ${Math.floor(car.condition)}% · Carburante ${Math.floor(car.fuel||100)}%`;

    let repairCost = Math.floor((100 - car.condition) * 25);
    if (gameState.staff.some(s => s.id === 'mech')) repairCost = Math.floor(repairCost * 0.5);

    const fuelPct = car.fuel !== undefined ? Math.floor(car.fuel) : 100;
    const fuelColor = fuelPct < 20 ? '#ff4060' : fuelPct < 50 ? '#f59e0b' : '#00f2ff';

    if (!car.upgrades) car.upgrades = [];
    const installedUpgrades = car.upgrades.map(uid => CAR_UPGRADES.find(u => u.id === uid)?.name || uid).join(', ');

    const tirePct2 = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
    const tireColor2 = tirePct2 < 20 ? '#ff4060' : tirePct2 < 50 ? '#f59e0b' : '#22c55e';
    const outReason = car.outOfService;

    let html = `<div class="space-y-3">
    ${(outReason && !(outReason === 'fuel' && fuelPct > 5)) ? `<div class="p-2 border border-red-500/40 bg-red-950/20 rounded-lg text-[9px] text-red-300 font-bold">
        🔴 Auto ferma: ${outReason === 'fuel' ? 'serbatoio esaurito — rifornisci qui sotto' : outReason === 'engine' ? 'motore fuso — riparazione urgente' : 'deposito gomme esaurito'}.<br>
        <span class="text-gray-400 font-normal">${outReason === 'fuel' ? 'Usa "Rifornisci" o "Gasolio Agric." qui sotto per sbloccarla.' : outReason === 'engine' ? 'Usa il pulsante Ripara Motore qui sotto.' : 'Rifornisci il deposito gomme nella schermata Flotta.'}</span>
    </div>` : ''}
    <div>
        <div class="flex justify-between text-[9px] text-gray-500 mb-1"><span>⛽ Carburante</span><span style="color:${fuelColor}">${fuelPct}%</span></div>
        <div class="fuel-bar-bg"><div class="fuel-bar-fill" style="width:${fuelPct}%; background:${fuelColor}"></div></div>
        <div class="text-[8px] text-gray-600 mt-0.5 text-center">Rifornimento automatico via Deposito Aziendale</div>
    </div>
    <div>
        <div class="flex justify-between text-[9px] text-gray-500 mb-1"><span>🔵 Gomme</span><span style="color:${tireColor2}">${tirePct2}%</span></div>
        <div class="fuel-bar-bg"><div class="fuel-bar-fill" style="width:${tirePct2}%; background:${tireColor2}"></div></div>
        <div class="text-[8px] text-gray-600 mt-0.5 text-center">Sostituzione automatica (sotto 20%) via Deposito Aziendale</div>
    </div>
    ${car.condition < 100 ? `<button onclick="payToRepairCar('${car.id}')" class="w-full btn-gold !bg-blue-900/30 !text-blue-300 !border !border-blue-500/30">🔧 Ripara (€${repairCost})</button>` : ''}
    <h4 class="text-[10px] text-gray-500 uppercase">Upgrade VIP</h4>
    <div class="space-y-1 max-h-28 overflow-y-auto">`;

    CAR_UPGRADES.forEach(upg => {
        const owned = car.upgrades.includes(upg.id);
        html += `<div class="flex justify-between items-center p-1.5 border border-white/5 rounded text-[9px] ${owned ? 'opacity-50' : ''}">
            <div><span class="text-white font-bold">${upg.name}</span><span class="text-gray-500 ml-1">${upg.desc}</span></div>
            ${owned ? '<span class="upgrade-pill">✓</span>' : `<button onclick="buyCARUpgrade('${car.id}','${upg.id}')" class="btn-blue !text-[8px] !py-0.5 !px-1.5">€${upg.price.toLocaleString()}</button>`}
        </div>`;
    });

    html += `</div>${installedUpgrades ? `<div class="text-[9px] text-gray-500">Upgrade attivi: <span class="text-blue font-bold">${installedUpgrades}</span></div>` : ''}
    <h4 class="text-[10px] text-gray-500 uppercase mt-2">Assegna Autista</h4>
    <div class="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto pr-1">`;

    gameState.drivers.forEach(d => {
        const isSet = d.assignedCarId === car.id;
        const lvl = d.level || 0;
        const driverTier = lvl >= 6 ? 'ULTRA' : lvl >= 4 ? 'VIP' : lvl >= 2 ? 'BUSINESS' : 'STANDARD';
        const tierColor  = lvl >= 6 ? '#a855f7' : lvl >= 4 ? '#00f2ff' : lvl >= 2 ? '#f59e0b' : '#6b7280';
        const specLabel  = d.specialty && d.specialty !== 'none' ? ` · ${d.specialty.replace(/_/g,' ')}` : '';
        html += `<button onclick="assignCarToDriver('${car.id}','${d.id}')" class="text-left p-1.5 border border-white/10 rounded text-[9px] w-full ${isSet?'border-gold text-gold bg-gold/5':'text-white hover:border-white/20'}">
            <span class="font-bold">${d.name}</span>
            <span style="font-size:8px;font-weight:700;color:${tierColor};margin-left:4px">[${driverTier}]</span>
            <span style="font-size:8px;color:#4b5563">${specLabel}</span>
            ${isSet ? '<span style="font-size:8px;color:#d4af37;margin-left:4px">✓ Assegnato</span>' : ''}
        </button>`;
    });
    // Skin badge
    const _activeSkin = car.skin ? (typeof VEHICLE_SKINS !== 'undefined' ? VEHICLE_SKINS : (window.VEHICLE_SKINS||[])).find(s => s.id === car.skin) : null;
    if (_activeSkin) {
        html += `<div class="text-[9px] mt-1" style="color:${_activeSkin.color}">🎨 Livrea: ${_activeSkin.name}</div>`;
    }
    html += `</div>
    <button onclick="openGarage3D('${car.id}')" class="w-full btn-blue !text-[9px]">🚗 Vista 3D Garage</button>`;
    // Instant Repair DC
    const condPctModal = Math.floor(car.condition || 0);
    const dcRepairCost = gameState.executivePassActive ? 1 : 2;
    if (condPctModal < 100) {
        html += `<button onclick="instantRepairDC('${car.id}')" class="w-full btn-gold !text-[9px] mt-1">⚡ Ripara Istant. (${dcRepairCost} DC)</button>`;
    }
    if(!car.isLease) {
        html += `<button onclick="sellCar('${car.id}')" class="w-full btn-gold !bg-red-900/20 !text-red-400 !border !border-red-900/40 mt-1">💰 Vendi (usato)</button>`;
        const alreadyListed = (gameState.marketplace||[]).some(l => l.carId === car.id);
        if (!alreadyListed) {
            const suggestPrice = Math.round(20000 * ((condPctModal/100)) * (car.tier === 'ultra' ? 5 : car.tier === 'vip' ? 3 : car.tier === 'business' ? 1.8 : 1));
            html += `<button onclick="listCarForSale('${car.id}', ${suggestPrice}); closeModals();" class="w-full btn-gold !bg-purple-900/20 !text-purple-300 !border !border-purple-900/40 mt-1">🏪 Metti in Mercato (~€${(suggestPrice/1000).toFixed(0)}k)</button>`;
        }
    }
    document.getElementById('car-modal-content').innerHTML = html + `</div>`;
    document.getElementById('modal-car').classList.remove('hidden');
    document.getElementById('modal-car').classList.add('flex');
}

window.closeModals = function() { 
    document.querySelectorAll('[id^="modal-"]').forEach(m => { m.classList.add('hidden'); m.classList.remove('flex'); }); 
}

// --- LOGICHE FINALI ---

window.fireStaff = function(staffId) {
    const s = gameState.staff.find(x => x.id === staffId);
    if (!s) return;
    if (!confirm(`Licenziare ${s.name}?\n\nRisparmio: €${s.salary.toLocaleString('it-IT')}/mese.\nTutti i benefici verranno rimossi immediatamente.`)) return;
    gameState.staff = gameState.staff.filter(x => x.id !== staffId);
    if (typeof showNotification === 'function') showNotification(`${s.name} licenziato.`, 'warning');
    renderTabStaff();
    if (typeof saveGame === 'function') saveGame();
};

window.hireOfficeStaff = async function(id) {
    const s = STAFF_ROLES[Object.keys(STAFF_ROLES).find(k => STAFF_ROLES[k].id === id)];
    if (!s) return;
    const maxStaff = typeof _getMaxStaff === 'function' ? _getMaxStaff() : 2;
    const currentStaff = gameState.staff.length + gameState.drivers.filter(d => d.id !== 'ceo').length;
    if (currentStaff >= maxStaff) {
        showNotification(`Limite staff raggiunto (${maxStaff}). Potenzia la sede!`, 'error');
        return;
    }

    const result = await ServerState.hireDriver(s.name, s.salary, 'STAFF');
    if (!result) return;

    gameState.staff.push(s);
    showNotification(`${s.name} assunto con successo!`, 'success');
    updateUI(); renderTabStaff();
    if(typeof saveGame==='function') saveGame();
};

window.openCarConfigurator = function(carId, type) {
    const carT = (type === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === carId);
    if (!carT) return;
    const totalRides = gameState.questStats?.totalRides || 0;
    const rideGate = carT.rideGate || 0;
    if (totalRides < rideGate) {
        showNotification(`Sblocco non raggiunto! Servono ${rideGate} corse completate — hai ${totalRides}.`, 'error');
        return;
    }
    if (carT.fuel === 'electric' && !gameState.hasEVHub) {
        showNotification('Infrastruttura mancante: costruisci l\'Hub di Ricarica Corporate prima di acquistare veicoli EV.', 'error');
        return;
    }
    const old = document.getElementById('modal-configurator');
    if (old) old.remove();

    const catalog = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : [])
        .find(c => c.vehicleClass === carT.vehicleClass || c.id === carT.vehicleClass);
    const carImg  = catalog?.img || 'assets/fleet/stellar-e-executive.jpg';
    const isElec  = catalog?.fuel === 'electric';

    const modal = document.createElement('div');
    modal.id = 'modal-configurator';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);

    const sel = new Set();

    // ── Build static shell (photo + config panel) once ───────────────────────
    modal.innerHTML = `
<div style="display:flex;width:100%;max-width:1020px;height:90vh;border-radius:20px;overflow:hidden;box-shadow:0 60px 120px rgba(0,0,0,0.95)">

  <!-- LEFT: full-height photo -->
  <div style="width:58%;position:relative;flex-shrink:0;background:#080808">
    <img src="${carImg}" alt="${carT.name}"
         style="width:100%;height:100%;object-fit:cover;object-position:center;display:block">
    <!-- subtle bottom fade for readability -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 100%)"></div>
    <!-- car name badge bottom-left -->
    <div style="position:absolute;bottom:28px;left:28px;right:28px">
      <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,0.8)">${carT.name}</div>
      ${isElec ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.4);color:#4ade80;font-size:9px;font-weight:800;padding:4px 12px;border-radius:20px;letter-spacing:1.5px;backdrop-filter:blur(4px)">⚡ ZERO EMISSIONI</div>` : ''}
    </div>
  </div>

  <!-- RIGHT: config panel -->
  <div id="cfg-right" style="flex:1;background:#111114;overflow-y:auto;display:flex;flex-direction:column;min-width:0;scrollbar-width:thin;scrollbar-color:#2a2a30 transparent">

    <!-- top bar: close -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 0">
      <div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:3px">Configuratore</div>
      <button onclick="document.getElementById('modal-configurator').remove()"
        style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#6b7280;font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s"
        onmouseover="this.style.background='rgba(255,255,255,0.1)';this.style.color='#fff'"
        onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.color='#6b7280'">✕</button>
    </div>

    <!-- car name + tier + base price block -->
    <div style="padding:16px 24px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:0.5px;line-height:1.2">${carT.name}</div>
      <div style="font-size:9px;color:#d4af37;text-transform:uppercase;letter-spacing:2px;margin-top:4px">${carT.tier}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px">
        <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Prezzo base</span>
        <span style="font-size:24px;font-weight:900;color:#fff;font-family:monospace;letter-spacing:-0.5px">€${carT.price.toLocaleString()}</span>
      </div>
    </div>

    <!-- optional list -->
    <div style="padding:20px 24px;flex:1">
      <div style="font-size:8px;color:#d4af37;text-transform:uppercase;letter-spacing:3px;margin-bottom:14px">Optional disponibili</div>
      <div id="cfg-upgrades" style="display:flex;flex-direction:column;gap:6px">
        ${CAR_UPGRADES.map(u => `
        <div id="cfg-upg-${u.id}" onclick="__cfgToggle('${u.id}')"
             style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);cursor:pointer;user-select:none;transition:all 0.15s">
          <div id="cfg-chk-${u.id}"
               style="width:17px;height:17px;border-radius:4px;border:1.5px solid rgba(255,255,255,0.18);background:transparent;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:900;color:#000"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:#e5e7eb">${u.name}</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px;line-height:1.4">${u.desc}</div>
          </div>
          <div id="cfg-price-${u.id}" style="font-size:11px;font-family:monospace;color:#6b7280;flex-shrink:0;font-weight:600">+€${u.price.toLocaleString()}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- sticky footer -->
    <div id="cfg-footer" style="position:sticky;bottom:0;background:#111114;border-top:1px solid rgba(255,255,255,0.07);padding:18px 24px"></div>
  </div>
</div>`;

    // ── Summary update (no scroll reset) ──────────────────────────────────────
    function _updateSummary() {
        const upTotal = [...sel].reduce((s, uid) => { const u = CAR_UPGRADES.find(x => x.id === uid); return s + (u ? u.price : 0); }, 0);
        const total   = carT.price + upTotal;
        const ok      = gameState.cash >= total;
        document.getElementById('cfg-footer').innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
            <span style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:2px">Totale</span>
            <span style="font-size:28px;font-family:monospace;font-weight:900;color:${ok ? '#fff' : '#f87171'};letter-spacing:-1px">€${total.toLocaleString()}</span>
          </div>
          ${!ok ? `<div style="font-size:9px;color:#f87171;margin-bottom:10px;text-align:right">Fondi insufficienti — disponibili: €${gameState.cash.toLocaleString()}</div>` : ''}
          <div style="display:flex;gap:10px">
            <button onclick="document.getElementById('modal-configurator').remove()"
              style="flex:0 0 auto;padding:12px 20px;font-size:10px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#6b7280;background:transparent;cursor:pointer">
              Annulla
            </button>
            <button onclick="__cfgConfirm('${carId}','${type}')" ${!ok ? 'disabled' : ''}
              style="flex:1;padding:12px;font-size:11px;font-weight:800;border-radius:10px;cursor:${ok ? 'pointer' : 'not-allowed'};letter-spacing:0.5px;
                     background:${ok ? 'linear-gradient(135deg,#d4af37,#b8961f)' : 'rgba(255,255,255,0.05)'};
                     color:${ok ? '#000' : '#4b5563'};border:${ok ? 'none' : '1px solid rgba(255,255,255,0.08)'}">
              ${ok ? '🚗 Conferma & Acquista' : 'Fondi insufficienti'}
            </button>
          </div>`;
    }

    // ── Toggle: update only the affected row + summary (NO scroll reset) ──────
    window.__cfgSel = sel;
    window.__cfgToggle = function(uid) {
        sel.has(uid) ? sel.delete(uid) : sel.add(uid);
        const on  = sel.has(uid);
        const row = document.getElementById(`cfg-upg-${uid}`);
        const chk = document.getElementById(`cfg-chk-${uid}`);
        const prc = document.getElementById(`cfg-price-${uid}`);
        if (row) {
            row.style.borderColor  = on ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.08)';
            row.style.background   = on ? 'rgba(212,175,55,0.06)' : 'rgba(0,0,0,0.3)';
        }
        if (chk) {
            chk.style.background   = on ? '#d4af37' : 'rgba(0,0,0,0.4)';
            chk.style.borderColor  = on ? '#d4af37' : 'rgba(255,255,255,0.2)';
            chk.textContent        = on ? '✓' : '';
        }
        if (prc) prc.style.color = on ? '#d4af37' : '#9ca3af';
        _updateSummary();
    };

    _updateSummary();

    window.__cfgConfirm = async function(cId, cType) {
        const car = (cType === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === cId);
        if (!car) return;
        const ups     = [...sel];
        const upTotal = ups.reduce((s, uid) => { const u = CAR_UPGRADES.find(x => x.id === uid); return s + (u ? u.price : 0); }, 0);
        const total   = car.price + upTotal;

        const result = await ServerState.buyVehicle(
            car.vehicleClass || car.id,
            total,
            ServerState.getCompany()?.hq_city || 'roma'
        );
        if (!result) return;

        // Apply per-upgrade server records (best-effort, non-blocking)
        for (const uid of ups) {
            const u = CAR_UPGRADES.find(x => x.id === uid);
            if (u) ServerState.buyVehicleUpgrade(result.id, uid, u.price).catch(() => {});
        }

        gameState.fleet.push({
            id: 'c_' + Date.now(), _serverId: result.id,
            name: car.name, tier: car.tier, condition: car.condition || 100,
            isLease: false, fuel: 100, mileage: 0, tirePressure: 100,
            upgrades: ups, vehicleClass: car.vehicleClass || 'mercedes_e',
        });
        document.getElementById('modal-configurator')?.remove();
        updateUI(); renderTabFleet();
        showBigEvent('🚗', `${car.name} Configurata!`, ups.length > 0 ? `${ups.length} optional installati · pronta al servizio.` : 'Veicolo standard pronto per la flotta.');
        if (typeof saveGame === 'function') saveGame();
        if ((car.tier === 'ultra' || car.tier === 'vip') && car.price >= 80000) {
            if (typeof _broadcastNews === 'function')
                _broadcastNews(`${gameState.companyName} ha aggiunto alla flotta una ${car.name} 🚗`, 'milestone');
        }
    };
    _updateSummary();
};

window.buyCar = function(carId, type) { window.openCarConfigurator(carId, type); };

window.leaseCar = async function(carId) {
    const c = NEW_CARS.find(x => x.id === carId);
    if (!c) return;
    const upFront = Math.floor(c.price * 0.1);

    const result = await ServerState.buyVehicle(
        c.vehicleClass || c.id,
        upFront,
        ServerState.getCompany()?.hq_city || 'roma'
    );
    if (!result) return;

    gameState.fleet.push({
        id: 'l_' + Date.now(), _serverId: result.id,
        name: c.name, tier: c.tier, condition: 100,
        isLease: true, dailyCost: Math.floor(c.price / 300),
        vehicleClass: c.vehicleClass || 'mercedes_e',
        fuel: 100, mileage: 0, tirePressure: 100, upgrades: [],
    });
    updateUI(); renderTabFleet();
    showNotification('Contratto Leasing approvato!', 'success');
};

function renderTabRegions() {
    const container = document.getElementById('tab-container');
    const GROUPS = [
        { label:'📍 Centro Italia', ids:['lazio','umbria','marche','abruzzo','molise','toscana'] },
        { label:'🌶️ Sud Italia',    ids:['campania','puglia','basilicata','calabria'] },
        { label:'🏝️ Isole',         ids:['sicilia','sardegna'] },
        { label:'🏔️ Nord Italia',   ids:['emilia','liguria','piemonte','lombardia','veneto','friuli','trentino','valle_aosta'] },
    ];
    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Licenze Regionali — Italia Completa</h3>`;
    GROUPS.forEach(group => {
        html += `<div class="text-[9px] text-gray-500 uppercase tracking-widest mt-4 mb-2 border-b border-white/5 pb-1">${group.label}</div><div class="grid grid-cols-2 gap-2">`;
        group.ids.forEach(rid => {
            const r = REGIONS[rid];
            if (!r) return;
            const owned    = gameState.unlockedRegions.includes(r.id);
            const hasRep   = gameState.reputation >= r.repReq;
            const canAfford= gameState.cash >= r.price;
            const canBuy   = hasRep && canAfford;
            html += `
            <div class="hud-card flex flex-col gap-1 ${owned ? 'border-gold/30 bg-gold/5' : ''}">
                <div class="text-[10px] font-bold ${owned ? 'text-gold' : 'text-white'} leading-tight">${r.name}</div>
                <div class="text-[8px] ${hasRep ? 'text-gray-500' : 'text-red-400'}">
                    ${r.repReq}★ richiesta
                </div>
                <div class="mt-auto pt-1">
                    ${owned
                        ? `<span class="text-gold text-[8px] font-bold">✓ ATTIVA</span>`
                        : r.price === 0 ? ''
                        : `<button onclick="buyRegion('${r.id}')"
                            class="w-full btn-gold !text-[8px] !py-0.5 !px-1 ${!canBuy ? 'opacity-30 cursor-not-allowed' : ''}"
                            ${!canBuy ? 'disabled' : ''}>
                            €${(r.price/1000).toFixed(0)}k
                           </button>`
                    }
                </div>
            </div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

function renderTabInvestments() {
    const container = document.getElementById('tab-container');
    const tierLabels = {
        1: '🟢 Tier I — Consolidamento',
        2: '🟡 Tier II — Espansione Business',
        3: '🔴 Tier III — Lusso Estremo',
        4: '💎 Tier IV — Dominio del Mercato'
    };
    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Portfolio Asset</h3>`;
    let currentTier = 0;

    INVESTMENTS.forEach(i => {
        const owned = gameState.investments.includes(i.id);
        if (i.tier !== currentTier) {
            if (currentTier > 0) html += `</div>`;
            html += `<div class="text-[9px] text-gray-500 uppercase tracking-widest mt-4 mb-2 border-b border-white/5 pb-1">${tierLabels[i.tier]}</div><div class="space-y-2">`;
            currentTier = i.tier;
        }
        const underConstruction = (gameState.constructions || []).find(c => c.invId === i.id);
        const daysLeft = underConstruction ? Math.max(0, underConstruction.completesDay - gameState.day) : 0;
        const dcCost   = underConstruction ? Math.ceil(daysLeft * 2) : 0;
        html += `
        <div class="hud-card flex justify-between items-start gap-2">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-white truncate">${i.name}</div>
                <div class="text-[9px] text-gray-500 mt-0.5">${i.desc}</div>
                ${i.passive ? `<div class="text-[9px] text-green-400 font-mono mt-0.5">+€${i.passive.toLocaleString()}/g</div>` : ''}
                ${i.dailyUpkeep ? `<div class="text-[9px] text-red-400 font-mono mt-0.5">−€${i.dailyUpkeep.toLocaleString()}/g manutenzione</div>` : ''}
                ${i.buildTime ? `<div class="text-[8px] text-yellow-500/60 mt-0.5">🏗️ ${i.buildTime} giorni costruzione</div>` : ''}
                ${i.reqRides && !owned ? `<div class="text-[8px] text-${(gameState.questStats?.totalRides||0)>=i.reqRides?'green':'red'}-400 mt-0.5">🔒 Richiede ${i.reqRides} corse (hai ${gameState.questStats?.totalRides||0})</div>` : ''}
            </div>
            <div class="flex-shrink-0 flex flex-col items-end gap-1">
                ${owned
                    ? `<span class="text-green-500 text-[9px] font-bold uppercase">✓ Attivo</span>
                       <button onclick="window.sellInvestment('${i.id}')" class="text-[7px] text-red-400/60 hover:text-red-400 border border-red-900/30 rounded px-1 py-0.5">Vendi 40%</button>`
                    : underConstruction
                        ? `<div class="text-center">
                             <div class="text-[9px] text-yellow-400 font-bold">🏗️ ${daysLeft}g</div>
                             <button onclick="window.speedUpConstruction('${i.id}')" class="text-[7px] bg-yellow-600/20 border border-yellow-500/40 text-yellow-300 rounded px-1.5 py-0.5 mt-0.5 hover:bg-yellow-600/40">⚡ ${dcCost} DC</button>
                           </div>`
                        : `<button onclick="buyInvestment('${i.id}')" class="btn-gold !text-[8px] !py-1 !px-2" ${i.reqRides&&(gameState.questStats?.totalRides||0)<i.reqRides?'disabled style="opacity:0.35;cursor:not-allowed"':''}>€${i.price.toLocaleString()}</button>`}
            </div>
        </div>`;
    });
    // Loan panel (only visible if inv_loan_facility is owned)
    if (gameState.investments.includes('inv_loan_facility')) {
        const activeLoans = gameState.loans || [];
        const totalDebt = activeLoans.reduce((s, l) => s + l.amount, 0);
        const dynRate = typeof _getLoanInterestRate === 'function' ? _getLoanInterestRate() : 0.08;
        const ratePct = (dynRate * 100).toFixed(0);
        const rateColor = dynRate <= 0.04 ? 'text-green-400' : dynRate <= 0.06 ? 'text-yellow-400' : 'text-red-400';
        html += `</div>
        <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🏦 Linea di Credito</h3>
        <div class="hud-card mb-3">
            <div class="flex justify-between text-[9px] mb-2">
                <span class="text-gray-400">Debito: <span class="text-red-400 font-bold font-mono">€${totalDebt.toLocaleString()}</span></span>
                <span>Tasso: <span class="${rateColor} font-bold">${ratePct}%</span> <span class="text-gray-600">(Rep. ${gameState.reputation.toFixed(1)}★)</span></span>
            </div>
            <div class="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                <div class="h-full bg-red-500" style="width:${Math.min(100, (totalDebt/500000)*100)}%"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${[50000, 100000, 250000, 500000].map(amt => `
                <button onclick="takeLoan(${amt})" class="btn-blue !text-[9px] !py-1.5" ${totalDebt >= 500000 ? 'disabled style="opacity:0.3"' : ''}>
                    Prestito €${(amt/1000).toFixed(0)}k<br><span class="text-[7px] text-gray-400">Rata: €${Math.ceil(amt*dynRate).toLocaleString()}/mese</span>
                </button>`).join('')}
            </div>
        </div>
        ${activeLoans.length > 0 ? `
        <div class="space-y-1">
            ${activeLoans.map(l => `
            <div class="text-[8px] flex justify-between items-center gap-1">
                <span class="text-gray-500">Prestito #${l.id}</span>
                <span class="text-red-400">Residuo: €${l.amount.toLocaleString()} (${((l.rate||0.08)*100).toFixed(0)}%/mese)</span>
                <button onclick="repayLoan(${l.id})" class="btn-gold !text-[7px] !py-0.5 !px-1.5 shrink-0" ${gameState.cash < l.amount ? 'disabled style="opacity:0.4"' : ''}>Salda</button>
            </div>`).join('')}
        </div>` : ''}
        <div class="space-y-2">`;
    } else {
        html += `</div>`;
    }

    // Venture Capital / M&A section
    const vcAgencies = typeof VENTURE_AGENCIES !== 'undefined' ? VENTURE_AGENCIES : [];
    const myStakes = gameState.ventureCapital || [];
    if (vcAgencies.length > 0) {
        html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-6">💼 Venture Capital & M&A</h3><div class="space-y-3">`;
        vcAgencies.forEach(agency => {
            const stake = myStakes.find(s => s.agencyId === agency.id);
            const ownedPct  = stake ? stake.stakePercent : 0;
            const dailyReturn = stake ? Math.floor(agency.dailyIncome * ownedPct / 100) : 0;
            const locked = gameState.reputation < agency.minRep || gameState.cash < agency.minCash;
            const riskColor = agency.riskLevel === 'high' ? '#ef4444' : agency.riskLevel === 'medium' ? '#f59e0b' : '#22c55e';
            const costFor5  = Math.floor(agency.valuation * 5 / 100);
            const costFor10 = Math.floor(agency.valuation * 10 / 100);
            html += `
            <div class="hud-card ${locked ? 'opacity-50' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <div class="text-xs font-bold text-white">${agency.icon} ${agency.name}</div>
                        <div class="text-[9px] text-gray-400 mt-0.5">${agency.desc}</div>
                        <div class="flex gap-3 mt-1 text-[8px]">
                            <span class="text-gray-500">Val: <span class="text-white font-mono">€${(agency.valuation/1e6).toFixed(1)}M</span></span>
                            <span class="text-gray-500">+€${agency.dailyIncome.toLocaleString()}/g (100%)</span>
                            <span style="color:${riskColor}">Rischio: ${agency.riskLevel.toUpperCase()}</span>
                        </div>
                        ${locked ? `<div class="text-[8px] text-red-400 mt-1">🔒 Min. ${agency.minRep}★ Rep · €${agency.minCash.toLocaleString()}</div>` : ''}
                    </div>
                    ${stake ? `<div class="text-right ml-2">
                        <div class="text-[10px] font-bold text-green-400">${ownedPct}%</div>
                        <div class="text-[8px] text-green-300 font-mono">+€${dailyReturn}/g</div>
                    </div>` : ''}
                </div>
                ${!locked ? `<div class="flex gap-1 flex-wrap">
                    <button onclick="window.acquireVentureStake('${agency.id}', 5)" class="btn-blue !text-[7px] !py-0.5">+5%<br><span class="opacity-60">€${costFor5.toLocaleString()}</span></button>
                    <button onclick="window.acquireVentureStake('${agency.id}', 10)" class="btn-gold !text-[7px] !py-0.5">+10%<br><span class="opacity-60">€${costFor10.toLocaleString()}</span></button>
                    ${stake ? `<button onclick="window.divestVentureStake('${agency.id}')" class="btn-gold !bg-red-900/30 !text-red-300 !text-[7px] !py-0.5">Vendi (75%)</button>` : ''}
                </div>` : ''}
            </div>`;
        });
        html += `</div>`;
    }

    // ── HOLDING FINANZIARIA ─────────────────────────────────────────
    const subTemplates = typeof HOLDING_SUBSIDIARIES !== 'undefined' ? HOLDING_SUBSIDIARIES : (window.HOLDING_SUBSIDIARIES || []);
    const holdingIncorporated = gameState.holding?.incorporated;
    const holdingDailyIncome = (gameState.holding?.subsidiaries || []).reduce((sum, sid) => {
        const t = subTemplates.find(s => s.id === sid);
        return sum + (t ? t.dailyIncome : 0);
    }, 0);
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-6">🏢 Holding Finanziaria</h3>`;
    if (!holdingIncorporated) {
        html += `<div class="hud-card mb-4">
            <div class="text-xs font-bold text-white mb-1">Costituisci una Holding</div>
            <div class="text-[9px] text-gray-400 mb-2">Fondare una holding ti permette di acquisire aziende sussidiarie che generano reddito passivo ogni giorno, indipendentemente dalle tue corse.</div>
            <div class="text-[9px] text-gray-500 mb-3">Requisiti: <span class="text-gold">4.0★</span> reputazione · <span class="text-gold">€200.000</span></div>
            <button onclick="incorporateHolding()" class="btn-gold w-full ${(gameState.reputation||0) >= 4.0 && gameState.cash >= 200000 ? '' : 'opacity-40'}" ${(gameState.reputation||0) >= 4.0 && gameState.cash >= 200000 ? '' : 'disabled'}>
                🏢 Fondazione Holding — €200.000
            </button>
        </div>`;
    } else {
        html += `<div class="hud-card !border-green-500/20 bg-green-950/5 mb-3 flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">Holding Attiva</div>
                <div class="text-[9px] text-green-400 font-mono mt-0.5">+€${holdingDailyIncome.toLocaleString()}/g dividendi</div>
            </div>
            <div class="text-[9px] text-gray-500">${(gameState.holding.subsidiaries||[]).length} sussidiarie</div>
        </div>
        <div class="space-y-2 mb-4">
        ${subTemplates.map(sub => {
            const owned = (gameState.holding.subsidiaries || []).includes(sub.id);
            return `<div class="hud-card flex justify-between items-start gap-2 ${owned ? '!border-green-500/20 bg-green-950/5' : ''}">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white">${sub.name}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5">${sub.desc}</div>
                    <div class="text-[9px] text-green-400 font-mono mt-0.5">+€${sub.dailyIncome.toLocaleString()}/g</div>
                </div>
                <div class="shrink-0">
                    ${owned
                        ? `<button onclick="divestSubsidiary('${sub.id}')" class="btn-gold !bg-red-900/30 !text-red-400 !text-[7px] !py-0.5">Cedi 60%</button>`
                        : `<button onclick="acquireSubsidiary('${sub.id}')" class="btn-gold !text-[8px] !py-1 ${gameState.cash >= sub.cost ? '' : 'opacity-40'}" ${gameState.cash >= sub.cost ? '' : 'disabled'}>€${Math.round(sub.cost/1000)}k</button>`
                    }
                </div>
            </div>`;
        }).join('')}
        </div>`;
    }

    // ── BAROMETRO DELLA COLLERA ──
    if (typeof renderBarometroWidget === 'function') html += renderBarometroWidget();

    // ── SINDACATI / HOLDINGS P2P ──
    if (typeof renderP2PHoldingsSection === 'function') html += renderP2PHoldingsSection();

    // ── CONSORZI COOPERATIVI ──
    if (typeof renderP2PConsorziSection === 'function') html += renderP2PConsorziSection();

    // ── ISPETTORATO DEL LAVORO ──
    if (typeof renderIspettoratoSection === 'function') html += renderIspettoratoSection();

    container.innerHTML = html + '</div>';
}

function renderTabMarketing() {
    const container = document.getElementById('tab-container');
    const active = gameState.activeCampaign;
    const activeCamp = active ? MARKETING_CAMPAIGNS.find(c => c.id === active) : null;

    // Meteo attuale
    const ws = WEATHER_STATES.find(w => w.id === (gameState.weather || 'sole')) || WEATHER_STATES[0];

    // Stats surge
    const pending = gameState.pendingRides.length;
    const surgeLabel = pending >= 15 ? '🔥 Surge +35%' : pending >= 8 ? '⚡ Surge +15%' : '🟢 Prezzi standard';
    const surgeColor = pending >= 15 ? 'text-red-400' : pending >= 8 ? 'text-yellow-400' : 'text-green-400';

    const _ps = gameState.pricingStrategy || 'standard';
    let html = `
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Strategia Tariffaria</h3>
    <div class="pricing-strategy-panel mb-5">
        <button onclick="setPricingStrategy('discount')" class="pricing-btn ${_ps === 'discount' ? 'pricing-btn-active' : ''}">
            <span class="pricing-btn-icon">📉</span>
            <span class="pricing-btn-label">Scontato</span>
            <span class="pricing-btn-sub">+30% corse · −20% guadagno</span>
        </button>
        <button onclick="setPricingStrategy('standard')" class="pricing-btn ${_ps === 'standard' ? 'pricing-btn-active' : ''}">
            <span class="pricing-btn-icon">⚖️</span>
            <span class="pricing-btn-label">Standard</span>
            <span class="pricing-btn-sub">Bilanciato</span>
        </button>
        <button onclick="setPricingStrategy('premium')" class="pricing-btn ${_ps === 'premium' ? 'pricing-btn-active' : ''}">
            <span class="pricing-btn-icon">💎</span>
            <span class="pricing-btn-label">Premium</span>
            <span class="pricing-btn-sub">−30% corse · +40% guadagno</span>
        </button>
    </div>
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Situazione Mercato</h3>
    <div class="grid grid-cols-2 gap-2 mb-5">
        <div class="hud-card text-center">
            <div class="text-2xl mb-1">${ws.icon}</div>
            <div class="text-[9px] text-gray-400">${ws.label}</div>
            <div class="text-[9px] font-bold text-yellow-400">Tariffe +${Math.round((ws.priceMult-1)*100)}%</div>
        </div>
        <div class="hud-card text-center flex flex-col justify-center">
            <div class="text-[10px] font-bold ${surgeColor}">${surgeLabel}</div>
            <div class="text-[9px] text-gray-500 mt-1">Corse in attesa: ${pending}</div>
        </div>
    </div>

    ${(() => {
        const season = typeof _getSeasonalMult === 'function' ? _getSeasonalMult() : null;
        if (!season || season.priceMult === 1.0) return '';
        return `<div class="hud-card !border-gold/30 bg-gold/5 mb-4">
            <div class="text-[9px] text-gold font-bold uppercase mb-1">${season.name}</div>
            <div class="text-[9px] text-gray-300">Tariffe +${Math.round((season.priceMult-1)*100)}% · Volume corse ×${season.rideBonus.toFixed(1)}</div>
        </div>`;
    })()}
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Campagne Pubblicitarie</h3>
    <div class="space-y-3 mb-5">`;

    MARKETING_CAMPAIGNS.forEach(camp => {
        const isActive = active === camp.id;
        html += `
        <div class="hud-card ${isActive ? '!border-gold/50 bg-gold/5' : ''}">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="text-xs font-bold text-white">${camp.name} ${isActive ? '<span class="text-gold text-[8px] ml-1">▶ ATTIVA</span>' : ''}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5">${camp.desc}</div>
                    <div class="text-[9px] text-red-400 font-mono mt-1">−€${camp.dailyCost.toLocaleString()}/giorno</div>
                </div>
                <div class="ml-3 shrink-0">
                    ${isActive
                        ? `<button onclick="deactivateCampaign()" class="btn-gold !bg-red-900/30 !text-red-400 !text-[8px]">Stop</button>`
                        : `<button onclick="activateCampaign('${camp.id}')" class="btn-gold !text-[8px]">Attiva</button>`
                    }
                </div>
            </div>
        </div>`;
    });

    // Daily cost deducted in processDailyRoutines
    const dailyCost = activeCamp ? activeCamp.dailyCost : 0;
    html += `</div>
    <div class="hud-card bg-black/30">
        <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Costo Campagna Attiva</div>
        <div class="text-sm font-bold font-mono ${dailyCost > 0 ? 'text-red-400' : 'text-gray-600'}">
            ${dailyCost > 0 ? `−€${dailyCost.toLocaleString()}/giorno` : 'Nessuna campagna attiva'}
        </div>
    </div>`;

    container.innerHTML = html;
}

function renderTabLegal() {
    const container = document.getElementById('tab-container');
    const hasLegal = gameState.staff.some(s => s.id === 'legal');
    const pending  = (gameState.activeFines || []).filter(f => f.status === 'pending');
    const resolved = (gameState.activeFines || []).filter(f => f.status !== 'pending');

    const successRate = hasLegal ? '70%' : '35%';

    let html = `
    <div class="hud-card mb-4 flex justify-between items-center">
        <div>
            <div class="text-[9px] text-gray-500 uppercase tracking-widest">Studio Legale</div>
            <div class="text-xs font-bold ${hasLegal ? 'text-blue' : 'text-red-400'} mt-0.5">
                ${hasLegal ? '⚖️ Avvocato Attivo' : '⚠ Nessun avvocato — auto-contest al 35%'}
            </div>
        </div>
        <div class="text-[9px] text-gray-500">${successRate} successo</div>
    </div>

    <h3 class="text-[10px] text-blue uppercase tracking-widest border-b border-white/10 pb-1 mb-3">
        Sanzioni Attive (${pending.length})
    </h3>`;

    if (pending.length === 0) {
        html += `<div class="text-center text-gray-600 mt-6 italic text-[11px]">Nessuna multa in sospeso. Ottimo!</div>`;
    }

    const gameHour = gameState.day * 24 + gameState.hour;
    pending.forEach(f => {
        const hoursLeft = Math.max(0, (f.expiresAt || 0) - gameHour);
        html += `
        <div class="hud-card fine-card mb-2">
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-xs font-bold text-white">${f.desc}</div>
                    <div class="text-[9px] text-gray-400">👤 ${f.driverName} · Scade in ${hoursLeft}h</div>
                </div>
                <div class="text-red-400 font-mono font-bold text-sm">€${f.amount}</div>
            </div>
            <div class="flex gap-2 mt-2">
                <button onclick="payFine(${f.id})" class="flex-1 btn-gold !text-[8px] !py-1 !bg-red-900/30 !text-red-400">Paga €${f.amount}</button>
                <button onclick="contestFine(${f.id})" class="flex-1 btn-blue !text-[8px] !py-1">Contesta (${successRate})</button>
            </div>
        </div>`;
    });

    if (resolved.length > 0) {
        html += `<h3 class="text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/5 pb-1 mt-4 mb-2">Archivio (${resolved.length})</h3>`;
        resolved.slice(-5).reverse().forEach(f => {
            const statusLabel = {
                'paid':'Pagata', 'contested_won':'Annullata ✓', 'contested_lost':'Ricorso Perso',
                'contested_reduced':'Ridotta', 'expired_paid':'Scaduta (Pagata)'
            }[f.status] || f.status;
            const statusColor = f.status === 'contested_won' ? 'text-green-400' : f.status === 'paid' || f.status === 'expired_paid' ? 'text-red-400' : 'text-gray-400';
            html += `
            <div class="hud-card mb-1 opacity-60">
                <div class="flex justify-between text-[9px]">
                    <span class="text-gray-400">${f.desc} (${f.driverName})</span>
                    <span class="${statusColor} font-bold">${statusLabel}</span>
                </div>
            </div>`;
        });
    }
    container.innerHTML = html;

    // Update fine dot
    const fineDot = document.getElementById('fine-dot');
    if (fineDot) fineDot.classList.toggle('hidden', pending.length === 0);
}

function _updateTrafficLabel() {
    const el = document.getElementById('map-traffic-label');
    if (!el || typeof _getTrafficMult !== 'function') return;
    const m = _getTrafficMult();
    el.innerText = m < 1 ? `🚦 Traffico intenso (−${Math.round((1-m)*100)}% velocità)` : m > 1 ? `🌙 Strade libere (+${Math.round((m-1)*100)}% velocità)` : '🟢 Traffico regolare';
    el.className = `text-sm font-bold ${m < 1 ? 'text-red-400' : m > 1 ? 'text-blue-300' : 'text-green-400'}`;
}

let draggedRideId = null;
function setupDragAndDrop() {
    document.addEventListener('dragstart', (e) => { const card = e.target.closest('.ride-card'); if (card) { draggedRideId = card.getAttribute('data-id'); card.style.opacity = '0.5'; } });
    document.addEventListener('dragend', (e) => { const card = e.target.closest('.ride-card'); if (card) { card.style.opacity = '1'; draggedRideId = null; } });
    document.addEventListener('dragover', (e) => { const dCard = e.target.closest('.driver-card'); if (dCard) { e.preventDefault(); dCard.classList.add('bg-white/10'); } });
    document.addEventListener('dragleave', (e) => { const dCard = e.target.closest('.driver-card'); if (dCard) dCard.classList.remove('bg-white/10'); });
    document.addEventListener('drop', (e) => { e.preventDefault(); const dCard = e.target.closest('.driver-card'); if (dCard && draggedRideId) { dCard.classList.remove('bg-white/10'); assignRideToDriver(draggedRideId, dCard.getAttribute('data-id')); renderTabCorse(); } });
}

window.showNotification = window._realShowNotification = function(msg, type) {
    const c = document.getElementById('notifications');
    if (!c) return;
    const n = document.createElement('div');
    n.className = `notif${type === 'error' ? ' error-notif' : ''}`;
    n.innerText = msg;
    c.appendChild(n);
    setTimeout(() => n.remove(), 4000);
};

// ══════════════════════════════════════════════════════════════════
// TAB FINANCE — $WALL-ST · Broker · Credit Score
// ══════════════════════════════════════════════════════════════════
function renderTabFinance() {
    const container = document.getElementById('tab-container');
    const hasWM = typeof _hasWealthManager === 'function' && _hasWealthManager();

    if (!hasWM) {
        container.innerHTML = `
            <div class="text-center mt-10 px-4">
                <div class="text-4xl mb-4">💼</div>
                <h3 class="text-gold font-bold uppercase tracking-widest text-sm mb-2">Finance Hub Bloccato</h3>
                <p class="text-[10px] text-gray-400 mb-4">Assumi un <span class="text-gold font-bold">Elite Wealth Manager</span> nel tab Staff per sbloccare il mercato azionario, il broker personale e la leva finanziaria avanzata.</p>
                <div class="finance-lock-card p-4 rounded-xl mt-4 text-left">
                    <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Include:</div>
                    <div class="space-y-1 text-[10px] text-gray-400">
                        <div>📈 Mercato Azionario $WALL-ST (5 ticker live)</div>
                        <div>💼 Broker Personale — ROI fino al +55%</div>
                        <div>🏦 Credit Score & Leva Finanziaria</div>
                        <div>🔶 Sblocco Diamond Contracts</div>
                    </div>
                </div>
            </div>`;
        return;
    }

    const prices = gameState.stockPrices || {};
    const holdings = gameState.stockHoldings || {};
    const creditScore = gameState.creditScore || 300;
    const creditTier = _getCreditTier(creditScore);
    const activeLoans = (gameState.loans || []).filter(l => l.amount > 0);
    const activeLoanTotal = activeLoans.reduce((s, l) => s + l.amount, 0);

    // ── STOCK MARKET ─────────────────────────────────────────────
    const stockHistory  = gameState.stockHistory  || {};
    const shortPositions = gameState.shortPositions || {};

    function _buildSparkline(history, color) {
        if (!history || history.length < 2) return '';
        const W = 80, H = 28;
        const min = Math.min(...history), max = Math.max(...history);
        const range = max - min || 1;
        const pts = history.map((v, i) => {
            const x = (i / (history.length - 1)) * W;
            const y = H - ((v - min) / range) * H;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="sparkline-svg">
            <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }

    let stockHtml = '';
    (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).forEach(t => {
        const price = prices[t.id] || t.basePrice;
        const holding = holdings[t.id] || { shares: 0, avgCost: 0 };
        const shortPos = shortPositions[t.id];
        const pricePct = ((price / t.basePrice) - 1) * 100;
        const isUp = pricePct >= 0;
        const plAmt = holding.shares > 0 ? Math.round((price - holding.avgCost) * holding.shares) : 0;
        const plPct = holding.avgCost > 0 ? ((price / holding.avgCost) - 1) * 100 : 0;
        const sparkline = _buildSparkline(stockHistory[t.id], t.color);
        const shortPl = shortPos ? Math.round((shortPos.openPrice - price) * shortPos.shares) : 0;
        stockHtml += `
        <div class="finance-stock-card mb-2">
            <div class="flex justify-between items-center mb-1">
                <div class="flex items-center gap-2">
                    <span class="text-base">${t.icon}</span>
                    <div>
                        <div class="text-[11px] font-bold font-mono" style="color:${t.color}">${t.name}</div>
                        <div class="text-[8px] text-gray-500">${t.fullName}</div>
                    </div>
                </div>
                <div class="flex items-end gap-2">
                    ${sparkline}
                    <div class="text-right">
                        <div class="text-sm font-bold font-mono text-white">€${price.toFixed(2)}</div>
                        <div class="text-[9px] font-mono ${isUp ? 'text-green-400' : 'text-red-400'}">${isUp ? '▲' : '▼'} ${Math.abs(pricePct).toFixed(1)}%</div>
                    </div>
                </div>
            </div>
            ${holding.shares > 0 ? `
            <div class="flex justify-between text-[9px] mb-1">
                <span class="text-gray-400">Long: <b class="text-white">${holding.shares}</b></span>
                <span class="${plAmt >= 0 ? 'text-green-400' : 'text-red-400'} font-bold">${plAmt >= 0 ? '+' : ''}€${plAmt.toLocaleString()} (${plPct.toFixed(1)}%)</span>
            </div>` : ''}
            ${shortPos ? `
            <div class="flex justify-between text-[9px] mb-1">
                <span class="text-purple-400">Short: <b class="text-white">${shortPos.shares}</b> @ €${shortPos.openPrice}</span>
                <span class="${shortPl >= 0 ? 'text-green-400' : 'text-red-400'} font-bold">${shortPl >= 0 ? '+' : ''}€${shortPl.toLocaleString()}</span>
            </div>` : ''}
            <div class="flex gap-1">
                <input id="stock-qty-${t.id}" type="number" min="1" value="10" class="finance-input flex-1 text-[10px]" placeholder="qty">
                <button onclick="buyStocks('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-gold !text-[9px] !py-1 !px-2">Compra</button>
                ${holding.shares > 0 ? `<button onclick="sellStocks('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-blue !text-[9px] !py-1 !px-2">Vendi</button>` : ''}
                <button onclick="shortSell('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-red !text-[9px] !py-1 !px-2">Short↓</button>
                ${shortPos ? `<button onclick="coverShort('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-purple !text-[9px] !py-1 !px-2">Copri</button>` : ''}
            </div>
        </div>`;
    });

    // ── BROKER INVESTMENTS ───────────────────────────────────────
    const brokerActive = (gameState.brokerInvestments || []).filter(i => !i.resolved);
    const currentHour = gameState.day * 24 + gameState.hour;
    let brokerActiveHtml = brokerActive.length === 0 ? `<div class="text-[10px] text-gray-600 italic mb-3">Nessun investimento attivo.</div>` : '';
    brokerActive.forEach(inv => {
        const profile = (typeof BROKER_RISK_PROFILES !== 'undefined' ? BROKER_RISK_PROFILES : []).find(p => p.id === inv.risk);
        const hoursLeft = Math.max(0, inv.endsHour - currentHour);
        const progress = Math.min(100, ((currentHour - inv.startHour) / (inv.endsHour - inv.startHour)) * 100);
        brokerActiveHtml += `
        <div class="finance-broker-card mb-2">
            <div class="flex justify-between text-[9px] mb-1">
                <span class="font-bold" style="color:${profile?.color||'#fff'}">${profile?.icon||''} ${inv.riskName}</span>
                <span class="text-gray-400">⏱ ${hoursLeft}h rimaste</span>
            </div>
            <div class="flex justify-between text-[10px] mb-1">
                <span>Capitale: <b class="text-white">€${inv.capital.toLocaleString()}</b></span>
                <span>Rendimento: <b style="color:${profile?.color||'#fff'}">${Math.round(inv.maxReturn*100)}% max</b></span>
            </div>
            <div class="broker-progress-track"><div class="broker-progress-fill" style="width:${progress.toFixed(0)}%;background:${profile?.color||'#fff'}"></div></div>
        </div>`;
    });

    // Broker form
    const brokerProfiles = typeof BROKER_RISK_PROFILES !== 'undefined' ? BROKER_RISK_PROFILES : [];
    let brokerFormHtml = `
    <div class="space-y-2 mb-3">
        <div>
            <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Capitale da investire (€)</label>
            <input id="broker-capital" type="number" min="1000" step="1000" value="10000" class="finance-input w-full text-[11px]">
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Profilo di Rischio</label>
            <div class="flex gap-1">
                ${brokerProfiles.map(p => `
                <button onclick="document.querySelectorAll('.risk-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active'); window._brokerRisk='${p.id}';"
                    class="risk-btn flex-1 text-[9px] p-2 rounded-lg border border-white/10 text-left transition-all"
                    style="--risk-color:${p.color}" data-risk="${p.id}">
                    <div class="text-base mb-0.5">${p.icon}</div>
                    <div class="font-bold" style="color:${p.color}">${p.name}</div>
                    <div class="text-[7px] text-gray-500 mt-0.5">max ${Math.round(p.maxReturn*100)}%</div>
                </button>`).join('')}
            </div>
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Durata</label>
            <div class="flex gap-1">
                <button onclick="window._brokerDur=1;  document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="dur-btn flex-1 text-[9px] p-1.5 rounded-lg border border-white/10">1h</button>
                <button onclick="window._brokerDur=6;  document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="dur-btn flex-1 text-[9px] p-1.5 rounded-lg border border-white/10">6h</button>
                <button onclick="window._brokerDur=24; document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="dur-btn flex-1 text-[9px] p-1.5 rounded-lg border border-white/10">24h</button>
            </div>
        </div>
        <button onclick="placeBrokerInvestment(document.getElementById('broker-capital').value, window._brokerRisk||'low', window._brokerDur||6)"
            class="btn-gold w-full uppercase tracking-widest" style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-color:rgba(212,175,55,0.6)">
            💼 Piazza Investimento
        </button>
    </div>`;

    // ── CREDIT SCORE & LOANS ─────────────────────────────────────
    const loanLimit = creditTier.loanLimit;
    const remainingCredit = Math.max(0, loanLimit - activeLoanTotal);
    const loanAmounts = [100000, 500000, 1000000, 2000000, 5000000].filter(a => a <= loanLimit);
    const creditBarW = Math.round(((creditScore - 300) / 600) * 100);
    let loansHtml = `
    <div class="flex justify-between items-center mb-2">
        <div>
            <div class="text-[9px] text-gray-500 uppercase tracking-widest">Credit Score</div>
            <div class="text-xl font-bold font-mono" style="color:${creditTier.color}">${creditScore}</div>
            <div class="text-[8px] font-bold uppercase" style="color:${creditTier.color}">${creditTier.label}</div>
        </div>
        <div class="text-right">
            <div class="text-[9px] text-gray-500">Limite</div>
            <div class="text-sm font-bold font-mono text-white">€${loanLimit.toLocaleString()}</div>
            <div class="text-[9px] text-green-400">Disponibile: €${remainingCredit.toLocaleString()}</div>
        </div>
    </div>
    <div class="credit-bar-track mb-3"><div class="credit-bar-fill" style="width:${creditBarW}%;background:${creditTier.color}"></div></div>
    <div class="text-[9px] text-gray-500 mb-2">Tasso interesse: <b class="text-white">${(creditTier.rate*100).toFixed(1)}%/mese</b></div>`;

    if (activeLoans.length > 0) {
        loansHtml += `<div class="text-[9px] text-red-400 mb-2 font-bold">Prestiti attivi: €${activeLoanTotal.toLocaleString()}</div>`;
        activeLoans.forEach(l => {
            const canRepay = gameState.cash >= l.amount;
            loansHtml += `<div class="hud-card !py-1.5 mb-1 flex justify-between items-center text-[9px] gap-2">
                <span>Prestito #${l.id}</span>
                <span class="text-red-400 font-mono flex-1 text-right">€${l.amount.toLocaleString()}</span>
                <button onclick="repayLoan(${l.id})" class="btn-gold !text-[7px] !py-0.5 !px-2 shrink-0" ${canRepay ? '' : 'disabled style="opacity:0.4"'}>Salda</button>
            </div>`;
        });
    }

    loansHtml += `<div class="flex flex-wrap gap-1 mt-2">
        ${loanAmounts.map(a => `<button onclick="takeLoan(${a})" class="btn-gold !text-[8px] !py-1 !px-2">+€${(a/1000).toFixed(0)}k</button>`).join('')}
    </div>`;

    // ── PORTFOLIO SUMMARY ────────────────────────────────────────
    const totalDiv = gameState.totalDividendsEarned || 0;
    const totalPlStock = gameState.totalStockProfit || 0;

    container.innerHTML = `
        <div class="finance-header mb-4">
            <div class="flex justify-between items-center">
                <div>
                    <h3 class="text-sm font-bold font-mono" style="color:#00f2ff">$WALL-ST · Finance Hub</h3>
                    <div class="text-[9px] text-gray-500">Elite Wealth Manager Attivo</div>
                </div>
                <div class="text-right">
                    <div class="text-[9px] text-gray-500">Dividendi tot.</div>
                    <div class="text-sm font-bold text-green-400 font-mono">+€${totalDiv.toLocaleString()}</div>
                </div>
            </div>
            <div class="flex gap-3 mt-2">
                <div class="text-center flex-1">
                    <div class="text-[8px] text-gray-600 uppercase">P&L Azioni</div>
                    <div class="text-[11px] font-bold font-mono ${totalPlStock >= 0 ? 'text-green-400' : 'text-red-400'}">${totalPlStock >= 0 ? '+' : ''}€${totalPlStock.toLocaleString()}</div>
                </div>
                <div class="text-center flex-1">
                    <div class="text-[8px] text-gray-600 uppercase">Diamond Contracts</div>
                    <div class="text-[11px] font-bold font-mono" style="color:#d4af37">${gameState.diamondContractsCompleted || 0}</div>
                </div>
                <div class="text-center flex-1">
                    <div class="text-[8px] text-gray-600 uppercase">Inv. Broker</div>
                    <div class="text-[11px] font-bold font-mono text-white">${brokerActive.length}/3</div>
                </div>
            </div>
        </div>

        <details open class="mb-3">
            <summary class="finance-section-title cursor-pointer">📈 Mercato Azionario</summary>
            <div class="mt-2">${stockHtml}</div>
        </details>

        <details class="mb-3">
            <summary class="finance-section-title cursor-pointer">💼 Broker Personale</summary>
            <div class="mt-2">
                ${brokerActiveHtml}
                <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2 mt-3 border-t border-white/5 pt-2">Nuovo Investimento</div>
                ${brokerFormHtml}
            </div>
        </details>

        <details class="mb-3">
            <summary class="finance-section-title cursor-pointer">🏦 Credit Score & Leva</summary>
            <div class="mt-2 hud-card">${loansHtml}</div>
        </details>

        ${(() => {
            const cp    = gameState.cempPrice || 10;
            const owned = gameState.cempOwnedShares || 0;
            const hist  = gameState.cempHistory || [];
            const prev  = hist.length >= 2 ? hist[hist.length - 2] : cp;
            const chgPct = ((cp / prev) - 1) * 100;
            const isUp   = chgPct >= 0;
            const portVal = owned > 0 ? Math.round(cp * owned) : 0;

            function _sparkCemp(h) {
                if (!h || h.length < 2) return '';
                const W = 80, H = 24, mn = Math.min(...h), mx = Math.max(...h), rng = mx - mn || 1;
                const pts = h.map((v,i) => `${((i/(h.length-1))*W).toFixed(1)},${(H-((v-mn)/rng)*H).toFixed(1)}`).join(' ');
                return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${isUp?'#22c55e':'#ef4444'}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            }

            return `
            <details class="mb-3" open>
                <summary class="finance-section-title cursor-pointer">📊 $CEMP — La Tua Azienda in Borsa</summary>
                <div class="mt-2 hud-card">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <div class="text-xs font-bold text-white">$CEMP <span class="text-[8px] text-gray-500">Chauffeur Empire SpA</span></div>
                            <div class="text-[9px] ${isUp ? 'text-green-400' : 'text-red-400'}">${isUp ? '▲' : '▼'} ${Math.abs(chgPct).toFixed(2)}% oggi</div>
                        </div>
                        <div class="flex items-end gap-3">
                            ${_sparkCemp(hist)}
                            <div class="text-right">
                                <div class="text-lg font-bold font-mono text-white">€${cp.toFixed(2)}</div>
                                <div class="text-[8px] text-gray-500">×${(gameState.cempShares||10000).toLocaleString()} azioni</div>
                            </div>
                        </div>
                    </div>
                    ${owned > 0 ? `
                    <div class="flex justify-between text-[9px] mb-2 bg-white/5 rounded p-2">
                        <span class="text-gray-400">In portafoglio: <span class="text-white font-bold">${owned.toLocaleString()} azioni</span></span>
                        <span class="text-green-400 font-mono font-bold">€${portVal.toLocaleString()}</span>
                    </div>` : ''}
                    <div class="grid grid-cols-2 gap-2">
                        ${[50,100,500,1000].map(qty => {
                            const cost = Math.round(cp * qty);
                            return `<button onclick="buyCempShares(${qty})" class="btn-gold !text-[8px] !py-1">
                                Compra ${qty}<br><span class="opacity-60">€${cost.toLocaleString()}</span></button>`;
                        }).join('')}
                    </div>
                    ${owned > 0 ? `<div class="grid grid-cols-2 gap-2 mt-2">
                        ${[Math.min(50,owned), Math.min(owned, Math.floor(owned/2))].filter((v,i,a)=>a.indexOf(v)===i && v>0).map(qty => {
                            const rev = Math.round(cp * qty);
                            return `<button onclick="sellCempShares(${qty})" class="btn-gold !bg-red-900/30 !text-red-300 !text-[8px] !py-1">
                                Vendi ${qty}<br><span class="opacity-60">+€${rev.toLocaleString()}</span></button>`;
                        }).join('')}
                    </div>` : ''}
                    <div class="text-[8px] text-gray-600 mt-2 italic">Il prezzo $CEMP riflette la tua reputazione, gli incassi settimanali e la dimensione della flotta.</div>
                </div>
            </details>`;
        })()}

        ${(() => {
            const ipo = gameState.companyIPO;
            const rep = gameState.reputation || 0;
            const canList = !ipo?.listed && rep >= 3.5 && (gameState.cash || 0) >= 50000;
            if (!ipo?.listed) {
                return `
                <details class="mb-3">
                    <summary class="finance-section-title cursor-pointer">🏛️ Quotazione in Borsa (IPO)</summary>
                    <div class="mt-2 hud-card">
                        <div class="text-[10px] text-white font-bold mb-1">Quota la tua azienda sul mercato</div>
                        <div class="text-[9px] text-gray-400 mb-3">1.000 azioni emesse · 300 acquistate subito da investitori NPC · Prezzo calcolato sul tuo cash</div>
                        <div class="space-y-1 text-[9px] mb-3">
                            <div class="flex justify-between"><span class="text-gray-500">Costo quotazione:</span> <span class="text-white">€50.000</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Reputazione richiesta:</span> <span class="${rep >= 3.5 ? 'text-green-400' : 'text-red-400'}">⭐ ${rep.toFixed(1)} / 3.5</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Cash richiesto:</span> <span class="${(gameState.cash||0) >= 50000 ? 'text-green-400' : 'text-red-400'}">€${(gameState.cash||0).toLocaleString()} / €50.000</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Prezzo azione stimato:</span> <span class="text-white font-mono">€${Math.max(10, Math.round((gameState.cash||0)/1000)).toLocaleString()}</span></div>
                        </div>
                        <button onclick="listCompanyIPO()" ${canList ? '' : 'disabled'} class="btn-gold w-full uppercase tracking-widest ${canList ? '' : 'opacity-40 cursor-not-allowed'}" style="font-size:0.8rem;">
                            📈 Quota ${gameState.companyName || 'Chauffeur Empire'} in Borsa
                        </button>
                        ${!canList ? `<div class="text-[8px] text-red-400 mt-1 text-center">${rep < 3.5 ? 'Reputazione insufficiente.' : 'Cash insufficiente.'}</div>` : ''}
                    </div>
                </details>`;
            }
            const priceEst = ipo.sharePrice || 10;
            const totalVal = Math.round(priceEst * ipo.sharesTotal);
            const npcVal   = Math.round(priceEst * ipo.npcSharesOwned);
            return `
            <details class="mb-3" open>
                <summary class="finance-section-title cursor-pointer">🏛️ IPO — ${gameState.companyName || 'Chauffeur Empire'}</summary>
                <div class="mt-2 hud-card !border-green-900/40 bg-green-950/5">
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <div class="text-xs font-bold text-green-400">✅ Quotata in borsa</div>
                            <div class="text-[8px] text-gray-500">Dal giorno ${ipo.listedDay}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[9px] text-gray-400">Prezzo azione</div>
                            <div class="text-sm font-bold font-mono text-white">€${priceEst.toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="space-y-1 text-[9px] mb-2">
                        <div class="flex justify-between"><span class="text-gray-500">Azioni totali:</span> <span class="text-white">${ipo.sharesTotal.toLocaleString()}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">In mano a NPC:</span> <span class="text-white">${ipo.npcSharesOwned} (valore €${npcVal.toLocaleString()})</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">Capitalizzazione:</span> <span class="text-yellow-400 font-bold font-mono">€${totalVal.toLocaleString()}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">Dividendi pagati tot.:</span> <span class="text-red-400 font-mono">-€${(ipo.dividendsPaid||0).toLocaleString()}</span></div>
                    </div>
                    <div class="text-[8px] text-gray-600 italic">Ogni giorno il 10% degli utili viene distribuito agli azionisti NPC come dividendo.</div>
                </div>
            </details>`;
        })()}

        ${typeof renderP2PSharesSection === 'function' ? renderP2PSharesSection() : ''}

        <div class="hud-card !border-red-900/40 bg-red-950/5 text-center mt-2">
            <div class="text-[9px] text-red-400/80 uppercase tracking-widest mb-1">Exit Strategy</div>
            <div class="text-[9px] text-gray-500 mb-2">Vendi l'azienda a un fondo e ricomincia con un vantaggio enorme</div>
            <button onclick="sellCompanyNGP()" class="text-[9px] border border-red-800/50 text-red-400/70 px-3 py-1 rounded hover:border-red-600 hover:text-red-300 transition-colors">Avvia Exit Strategy ↗</button>
        </div>`;
}
window.renderTabFinance = renderTabFinance;

// ══════════════════════════════════════════════════════════════════
// TAB LIFESTYLE — Real Estate · Mezzi Elite · Empire Status
// ══════════════════════════════════════════════════════════════════
function renderTabLifestyle() {
    const container = document.getElementById('tab-container');
    const owned = gameState.lifestyleAssets || [];
    const assets = typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : [];

    // Portfolio value summary
    const portfolioValue = owned.reduce((s, id) => {
        const a = assets.find(x => x.id === id);
        return s + (a ? a.price : 0);
    }, 0);
    const dailyPassive = owned.reduce((s, id) => {
        const a = assets.find(x => x.id === id);
        return s + (a && a.passive ? a.passive : 0);
    }, 0);
    const intlUnlocked = owned.includes('jet_privato');

    let html = `
    <div class="lifestyle-header mb-4">
        <h3 class="text-[10px] uppercase tracking-widest mb-1" style="color:#d4af37">Empire Portfolio</h3>
        <div class="flex gap-3">
            <div class="flex-1 text-center">
                <div class="text-[8px] text-gray-600 uppercase">Asset Totali</div>
                <div class="text-sm font-bold font-mono text-white">€${portfolioValue.toLocaleString()}</div>
            </div>
            <div class="flex-1 text-center">
                <div class="text-[8px] text-gray-600 uppercase">Rendita/g</div>
                <div class="text-sm font-bold font-mono text-green-400">€${dailyPassive.toLocaleString()}</div>
            </div>
            <div class="flex-1 text-center">
                <div class="text-[8px] text-gray-600 uppercase">Status</div>
                <div class="text-[11px] font-bold" style="color:#d4af37">${owned.length >= 4 ? 'MOGUL' : owned.length >= 2 ? 'ELITE' : owned.length >= 1 ? 'RISING' : 'NASCENT'}</div>
            </div>
        </div>
        ${intlUnlocked ? `<div class="mt-2 text-[9px] text-center" style="color:#00f2ff">✈️ Tratte internazionali attive — Ginevra · Montecarlo · Cannes</div>` : ''}
    </div>`;

    // Mappa asset → immagine
    const _LIFESTYLE_IMG = {
        attico_milano:      'assets/lifestyle/attico-citylife.jpg',
        villa_porto_cervo:  'assets/lifestyle/villa-porto-cervo.jpg',
        ufficio_wall_street:'assets/lifestyle/ufficio-one-world-trade.jpg',
        jet_privato:        'assets/lifestyle/gulfstream-g700.jpg',
        yacht_lusso:        'assets/lifestyle/mega-yacht.jpg',
    };

    const _lifestyleCard = (a, accentColor) => {
        const isOwned   = owned.includes(a.id);
        const canAfford = gameState.cash >= a.price;
        const imgSrc    = _LIFESTYLE_IMG[a.id];
        const badges = [
            a.passive > 0      ? `<span class="ls-badge ls-badge-green">+€${a.passive.toLocaleString()}/g</span>` : '',
            a.repBonus > 0     ? `<span class="ls-badge ls-badge-gold">+${a.repBonus}★ rep</span>` : '',
            a.unlocksDiamond   ? `<span class="ls-badge ls-badge-gold">🔶 Diamond</span>` : '',
            a.stockBonus > 0   ? `<span class="ls-badge ls-badge-cyan">+${Math.round(a.stockBonus*100)}% stocks</span>` : '',
            a.intlUnlock       ? `<span class="ls-badge ls-badge-cyan">✈️ Rotte Intl</span>` : '',
            a.staffBonus > 0   ? `<span class="ls-badge ls-badge-purple">Staff +${Math.round(a.staffBonus*100)}%</span>` : '',
            a.energyBonus > 0  ? `<span class="ls-badge ls-badge-purple">CEO +${a.energyBonus} energia</span>` : '',
        ].filter(Boolean).join('');

        return `
        <div class="ls-card mb-4 ${isOwned ? 'ls-card-owned' : ''}">
            ${imgSrc ? `
            <div class="ls-card-img-wrap">
                <img src="${imgSrc}" alt="${a.name}" class="ls-card-img" loading="lazy">
                ${isOwned ? '<div class="ls-card-owned-badge">✓ Posseduto</div>' : ''}
                <div class="ls-card-img-overlay"></div>
                <div class="ls-card-img-title">
                    <div class="ls-card-name">${a.name}</div>
                    <div class="ls-card-location" style="color:${accentColor}">${a.location}</div>
                </div>
            </div>` : `
            <div class="ls-card-no-img px-4 pt-4 flex items-center gap-3">
                <span class="text-3xl">${a.icon}</span>
                <div>
                    <div class="ls-card-name">${a.name}</div>
                    <div class="ls-card-location" style="color:${accentColor}">${a.location}</div>
                </div>
            </div>`}
            <div class="px-4 py-3">
                <div class="text-[9px] text-gray-400 leading-relaxed mb-3">${a.desc}</div>
                <div class="flex flex-wrap gap-1 mb-3">${badges}</div>
                <div class="flex justify-between items-center">
                    <div class="text-xs font-bold font-mono" style="color:${accentColor}">€${a.price.toLocaleString('it-IT')}</div>
                    ${isOwned
                        ? `<span class="text-[9px] font-bold text-green-400 uppercase">✓ Nel portfolio</span>`
                        : `<button onclick="buyLifestyleAsset('${a.id}')"
                             class="btn-gold !text-[9px] !py-1.5 !px-3 ${canAfford ? '' : 'opacity-40 cursor-not-allowed'}"
                             ${canAfford ? '' : 'disabled'}>
                             Acquista
                           </button>`
                    }
                </div>
            </div>
        </div>`;
    };

    // Real Estate section
    const realEstate = assets.filter(a => a.category === 'real_estate');
    html += `<div class="text-[9px] uppercase tracking-widest mb-3 mt-1" style="color:#d4af37">🏙️ Immobili di Lusso</div>`;
    realEstate.forEach(a => { html += _lifestyleCard(a, '#d4af37'); });

    // Elite vehicles
    const eliteVehicles = assets.filter(a => a.category === 'vehicle_elite');
    html += `<div class="text-[9px] uppercase tracking-widest mb-3 mt-4" style="color:#00f2ff">✈️ Mezzi Elite</div>`;
    eliteVehicles.forEach(a => { html += _lifestyleCard(a, '#00f2ff'); });

    // Diamond requirements info
    const diamondEligible = owned.some(id => assets.find(a => a.id === id && a.unlocksDiamond));
    html += `
    <div class="hud-card !border-yellow-800/40 bg-yellow-950/10 mt-3">
        <div class="text-[9px] uppercase tracking-widest mb-2" style="color:#d4af37">🔶 Diamond Contracts</div>
        <div class="text-[9px] text-gray-400 mb-2">Contratti ultra-premium riservati ai CEO con asset Lifestyle specifici. Pagamento da €20.000 a €80.000 per singolo contratto.</div>
        ${diamondEligible && gameState.reputation >= 4.5
            ? `<div class="text-[9px] text-green-400 font-bold">✓ Sei eleggibile — Contratti in arrivo via Inbox</div>`
            : `<div class="text-[9px] text-gray-500">Requisi: asset Lifestyle + reputazione ≥ 4.5★ + Elite Wealth Manager</div>`}
    </div>`;

    container.innerHTML = html;
}
window.renderTabLifestyle = renderTabLifestyle;

// ── POLITICS TAB ─────────────────────────────────────────────────
// ── SERVER DECREES STATE ──────────────────────────────────────────────────────
window._decreesState = { decrees: [], activeDecrees: [], _lastFetch: 0 };

window.decreesRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._decreesState._lastFetch < 60000) return;
    window._decreesState._lastFetch = now;
    const sb = window.supabaseClient;
    if (!sb) return;
    const [dRes, aRes] = await Promise.all([
        sb.rpc('rpc_get_server_decrees'),
        sb.rpc('rpc_get_active_decrees'),
    ]);
    if (!dRes.error) window._decreesState.decrees = dRes.data || [];
    if (!aRes.error) window._decreesState.activeDecrees = aRes.data || [];
};

window.getDecreeEffects = function() {
    const fx = {};
    for (const d of window._decreesState.activeDecrees) {
        for (const [k, v] of Object.entries(d.effects || {})) {
            if (typeof v === 'number') {
                fx[k] = (fx[k] || 1.0) * v;
            } else {
                fx[k] = v;
            }
        }
    }
    return fx;
};

window.voteServerDecree = async function(decreeId, points) {
    const pts = parseInt(points, 10);
    if (!pts || pts < 1) { if(typeof showNotification==='function') showNotification('Inserisci punti validi', 'error'); return; }
    if ((gameState.lobbyingPoints || 0) < pts) { if(typeof showNotification==='function') showNotification('Punti lobbying insufficienti', 'error'); return; }

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_vote_server_decree', { v_decree_id: decreeId, v_points_spent: pts });
    if (error) { if(typeof showNotification==='function') showNotification('Voto fallito: ' + error.message, 'error'); return; }

    gameState.lobbyingPoints = (gameState.lobbyingPoints || 0) - pts;
    if (typeof saveGameState === 'function') saveGameState();
    if (data.passed) {
        if(typeof showNotification==='function') showNotification(`🎉 Decreto approvato: ${data.title}!`, 'success');
    } else {
        if(typeof showNotification==='function') showNotification(`✅ Voto registrato. (${data.votes_current}/${window._decreesState.decrees.find(d=>d.id===decreeId)?.votes_required||'?'})`, 'success');
    }
    await window.decreesRefresh(true);
    if (typeof renderTabPolitics === 'function') renderTabPolitics();
};

function renderTabPolitics() {
    const container = document.getElementById('tab-container');
    const inflPct   = ((gameState.inflationRate || 0.020) * 100).toFixed(2);
    const ratePct   = ((gameState.interestRateBase || 0.045) * 100).toFixed(2);
    const points    = gameState.lobbyingPoints || 0;
    const active    = gameState.activeLobbyLaws || [];

    const laws = typeof LOBBY_LAWS !== 'undefined' ? LOBBY_LAWS : [];

    // Macro panel
    const inflColor = parseFloat(inflPct) > 5 ? '#ff4060' : parseFloat(inflPct) < 2 ? '#22c55e' : '#f59e0b';
    const rateColor = parseFloat(ratePct) > 7  ? '#ff4060' : parseFloat(ratePct) < 3 ? '#22c55e' : '#d4af37';

    let lawsHtml = laws.map(l => {
        const owned = active.includes(l.id);
        const canAfford = points >= l.pointsCost && (gameState.cash || 0) >= (l.cashCost || 0);
        return `
        <div class="hud-card mb-2 ${owned ? '!border-green-500/30 bg-green-950/10' : ''}">
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold ${owned ? 'text-green-400' : 'text-white'}">${l.icon} ${l.name} ${owned ? '✓' : ''}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5 leading-tight">${l.desc}</div>
                    <div class="flex gap-3 mt-1 text-[8px]">
                        <span class="${points >= l.pointsCost ? 'text-gold' : 'text-gray-600'}">${l.pointsCost} pt lobbying</span>
                        ${l.cashCost ? `<span class="${(gameState.cash||0) >= l.cashCost ? 'text-green-400' : 'text-red-400'}">€${l.cashCost.toLocaleString()}</span>` : ''}
                    </div>
                </div>
                <div class="shrink-0">
                    ${owned
                        ? '<span class="text-green-500 text-[9px] font-bold uppercase">Attiva</span>'
                        : `<button onclick="passLobbyLaw('${l.id}')" class="btn-gold !py-1 !px-2 !text-[9px] ${!canAfford ? 'opacity-40 pointer-events-none' : ''}">Approva</button>`}
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
    <div class="hud-card mb-4" style="background:linear-gradient(135deg,rgba(26,26,46,0.8),rgba(22,33,62,0.6));border-color:rgba(212,175,55,0.2)">
        <div class="text-[9px] text-gold font-bold uppercase tracking-widest mb-3">📊 Indicatori Macro-Economici</div>
        <div class="grid grid-cols-2 gap-3">
            <div class="text-center p-2 rounded-lg bg-black/30">
                <div class="text-[8px] text-gray-500 uppercase">📈 Inflazione</div>
                <div class="text-xl font-bold font-mono mt-1" style="color:${inflColor}">${inflPct}%</div>
                <div class="text-[8px] text-gray-600 mt-0.5">${parseFloat(inflPct) > 4 ? '⚠ Alta' : parseFloat(inflPct) < 1.5 ? '↘ Bassa' : '✓ Stabile'}</div>
            </div>
            <div class="text-center p-2 rounded-lg bg-black/30">
                <div class="text-[8px] text-gray-500 uppercase">🏦 Tasso BCE</div>
                <div class="text-xl font-bold font-mono mt-1" style="color:${rateColor}">${ratePct}%</div>
                <div class="text-[8px] text-gray-600 mt-0.5">${parseFloat(ratePct) > 6 ? '⚠ Restrittivo' : parseFloat(ratePct) < 2.5 ? '↘ Espansivo' : '✓ Neutro'}</div>
            </div>
        </div>
        <div class="text-[8px] text-gray-600 mt-2 text-center italic">I tassi influenzano i costi dei prestiti e i rendimenti broker.</div>
    </div>

    <div class="hud-card mb-4">
        <div class="flex justify-between items-center mb-2">
            <div class="text-[9px] text-gold font-bold uppercase tracking-widest">🏛️ Punti Lobbying</div>
            <div class="text-xl font-bold font-mono text-gold">${points} pt</div>
        </div>
        <div class="text-[9px] text-gray-500 mb-3">Guadagna punti donando alla politica. 1.000€ = 1 punto lobbying.</div>
        <div class="flex gap-2">
            <input id="lobby-donate-amt" type="number" min="1000" step="5000" value="10000" class="finance-input flex-1 text-[10px]" placeholder="€ donazione">
            <button onclick="donateToLobby(document.getElementById('lobby-donate-amt').value)" class="btn-gold !text-[9px] !py-1 !px-3">Dona</button>
        </div>
    </div>

    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">⚖️ Leggi Disponibili</h3>
    <div>${lawsHtml}</div>

    ${_renderDecreesSection(points)}`;
}
window.renderTabPolitics = renderTabPolitics;

function _renderDecreesSection(lobbyPoints) {
    const decrees = window._decreesState?.decrees || [];
    const passed  = (window._decreesState?.activeDecrees || []);

    let passedHtml = '';
    if (passed.length > 0) {
        passedHtml = `
          <div class="bg-green-950/20 border border-green-500/20 rounded-lg p-3 mb-3">
            <div class="text-[9px] text-green-400 font-bold uppercase mb-2">✅ Decreti Attivi</div>
            ${passed.map(d => `
              <div class="flex justify-between items-center text-[10px] mb-1">
                <span class="text-white">${d.icon} ${d.title}</span>
                <span class="text-gray-400 text-[9px]">${d.ends_at ? 'Scade ' + new Date(d.ends_at).toLocaleDateString('it-IT') : 'Permanente'}</span>
              </div>`).join('')}
          </div>`;
    }

    let votingHtml = '';
    if (decrees.length === 0) {
        votingHtml = `<div class="text-[10px] text-gray-500 text-center py-4">Nessun decreto in votazione.<br><span class="text-[9px]">Aggiorna tra poco.</span></div>`;
    } else {
        votingHtml = decrees.map(d => {
            const isPassed = d.status === 'passed';
            const pct = Math.min(100, Math.round((d.votes_current / d.votes_required) * 100));
            const myVotes = d.my_votes || 0;
            const inputId = `decree-pts-${d.id.substring(0, 8)}`;
            const expires = new Date(d.expires_at);
            const daysLeft = Math.max(0, Math.ceil((expires - Date.now()) / 86400000));
            const fxBadges = Object.entries(d.effects || {}).map(([k, v]) => {
                if (k === 'tipMult')         return `+${Math.round((v-1)*100)}% mance`;
                if (k === 'xpMult')          return `+${Math.round((v-1)*100)}% XP`;
                if (k === 'fuelCostMult')    return `${Math.round((v-1)*100)}% carb.`;
                if (k === 'maintenanceMult') return `${Math.round((v-1)*100)}% manutenzione`;
                if (k === 'taxRateMult')     return `${Math.round((v-1)*100)}% tasse`;
                if (k === 'vehiclePriceMult')return `${Math.round((v-1)*100)}% veicoli`;
                if (k === 'extraRidePct')    return `+${Math.round(v*100)}% corse`;
                return null;
            }).filter(Boolean);

            return `
              <div class="hud-card mb-2 ${isPassed ? '!border-green-500/30' : ''}">
                <div class="flex justify-between items-start gap-2 mb-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold ${isPassed ? 'text-green-400' : 'text-white'}">${d.icon} ${d.title} ${isPassed ? '✓' : ''}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5 leading-tight">${d.description || ''}</div>
                    <div class="flex flex-wrap gap-1 mt-1">
                      ${fxBadges.map(b => `<span class="text-[8px] bg-white/10 rounded px-1 py-0.5">${b}</span>`).join('')}
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    ${isPassed
                        ? '<span class="text-[9px] text-green-400 font-bold">Approvato</span>'
                        : `<div class="text-[8px] text-gray-500">${daysLeft}g rimasti</div>
                           ${myVotes > 0 ? `<div class="text-[8px] text-blue-400">Votato: ${myVotes}pt</div>` : ''}`}
                  </div>
                </div>

                <div class="mb-2">
                  <div class="flex justify-between text-[8px] text-gray-500 mb-1">
                    <span>${d.votes_current}/${d.votes_required} voti</span>
                    <span>${pct}%</span>
                  </div>
                  <div class="w-full bg-white/5 rounded-full h-1.5">
                    <div class="bg-gold h-1.5 rounded-full transition-all" style="width:${pct}%"></div>
                  </div>
                </div>

                ${!isPassed ? `
                  <div class="flex gap-2">
                    <input id="${inputId}" type="number" min="1" max="${lobbyPoints}" value="1"
                      class="finance-input flex-1 !text-[9px] !py-1" placeholder="punti">
                    <button onclick="window.voteServerDecree('${d.id}', document.getElementById('${inputId}').value)"
                      class="btn-gold !text-[9px] !py-1 !px-2 ${lobbyPoints < 1 ? 'opacity-40 pointer-events-none' : ''}">
                      Vota
                    </button>
                  </div>` : ''}
              </div>`;
        }).join('');
    }

    return `
      <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mt-4 mb-3">📜 Decreti Server</h3>
      <div class="text-[9px] text-gray-500 mb-3">Vota i decreti collettivi con i tuoi punti lobbying. Una volta raggiunta la soglia, l'effetto si applica a tutti i giocatori.</div>
      <button onclick="window.decreesRefresh(true).then(()=>window.renderTabPolitics())" class="text-[9px] text-gray-400 hover:text-white mb-3 block">↻ Aggiorna decreti</button>
      ${passedHtml}
      ${votingHtml}`;
}

function renderTabCareer() {
    const container = document.getElementById('tab-container');
    if (typeof window.QUEST_DB === 'undefined') {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10 text-[10px]">Sistema missioni non caricato.</div>`;
        return;
    }
    const gs = gameState;
    const completed  = gs.completedQuests  || [];
    const claimable  = gs.claimableQuests  || [];

    const chLabels = { 1:'📦 Capitolo I — Il Padroncino', 2:'🏢 Capitolo II — L\'Agenzia', 3:'💎 Capitolo III — Il Lusso', 4:'🏛️ Capitolo IV — L\'Impero' };

    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Missioni & Carriera</h3>`;

    let currentCh = 0;
    window.QUEST_DB.forEach(q => {
        if (q.ch !== currentCh) {
            if (currentCh > 0) html += `</div>`;
            html += `<div class="text-[9px] text-gray-500 uppercase tracking-widest mt-4 mb-2 border-b border-white/5 pb-1">${chLabels[q.ch] || 'Capitolo '+q.ch}</div><div class="space-y-2">`;
            currentCh = q.ch;
        }

        const isDone     = completed.includes(q.id);
        const isClaim    = claimable.includes(q.id);
        const prereqsMet = (q.prereqs || []).every(p => completed.includes(p));
        const isLocked   = !isDone && !isClaim && !prereqsMet;

        let prog = { cur: 0, tgt: 1 };
        if (!isDone && !isLocked && typeof q.check === 'function') {
            try { prog = q.check(gs); } catch(e) {}
        }
        if (isDone) prog = { cur: prog.tgt || 1, tgt: prog.tgt || 1 };

        const pct = Math.min(100, Math.round(((prog.cur || 0) / Math.max(1, prog.tgt || 1)) * 100));

        const rewardStr = [
            q.rewards.cash ? `€${q.rewards.cash.toLocaleString()}` : null,
            q.rewards.tc   ? `${q.rewards.tc} DC` : null,
            q.rewards.rep  ? `+${q.rewards.rep}★` : null
        ].filter(Boolean).join(' · ');

        html += `<div class="hud-card ${isDone ? 'opacity-50' : ''} ${isLocked ? 'opacity-30' : ''}">
            <div class="flex items-start gap-2">
                <span class="text-lg flex-shrink-0">${isLocked ? '🔒' : isDone ? '✅' : q.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center">
                        <div class="text-[10px] font-bold text-white">${q.title}</div>
                        ${isClaim ? `<button onclick="window.claimQuestReward('${q.id}')" class="btn-gold !text-[7px] !py-0.5 !px-2 ml-1 flex-shrink-0 animate-pulse">🎁 Ritira</button>` : ''}
                    </div>
                    <div class="text-[9px] text-gray-400 mt-0.5">${q.desc}</div>
                    ${!isDone && !isLocked ? `
                    <div class="flex items-center gap-2 mt-1.5">
                        <div class="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${pct>=100?'#22c55e':'#d4af37'}"></div>
                        </div>
                        <div class="text-[8px] text-gray-500 font-mono whitespace-nowrap">${prog.cur}/${prog.tgt}</div>
                    </div>` : ''}
                    <div class="text-[8px] text-yellow-400/70 mt-1">🏅 ${rewardStr}${q.rewards.desc ? ' · '+q.rewards.desc : ''}</div>
                </div>
            </div>
        </div>`;
    });
    if (currentCh > 0) html += `</div>`;
    container.innerHTML = html;
}
window.renderTabCareer = renderTabCareer;

let _ecActiveTab = 'acquire';
window._ecSwitchTab = function(tab) { _ecActiveTab = tab; renderTabPremiumStore(); };

function renderTabPremiumStore() {
    const container = document.getElementById('tab-container');
    const dc = gameState.driverCoins || 0;
    const offLimit = gameState.offlineLimit || 2;
    const autoRest = gameState.autoRestEnabled || false;

    // ── INJECT EXECUTIVE CLUB STYLES ─────────────────────────────────────────
    if (!document.getElementById('ec-style')) {
        const st = document.createElement('style');
        st.id = 'ec-style';
        st.textContent = `
            .ec-card {
                background: linear-gradient(135deg, rgba(10,10,25,0.95), rgba(20,20,45,0.9));
                border: 1px solid rgba(212,175,55,0.25);
                border-radius: 12px; padding: 14px; position: relative;
                transition: box-shadow .2s, border-color .2s;
            }
            .ec-card:hover { border-color: rgba(212,175,55,0.5); box-shadow: 0 0 18px rgba(212,175,55,0.12); }
            .ec-tab {
                padding: 7px 18px; font-size: 0.72rem; font-weight: 700; letter-spacing: .08em;
                border-bottom: 2px solid transparent; color: #6b7280; cursor: pointer;
                transition: color .15s, border-color .15s; user-select: none;
            }
            .ec-tab.active { color: #d4af37; border-bottom-color: #d4af37; }
            .ec-yield-ribbon {
                position: absolute; top: -1px; right: 10px;
                background: linear-gradient(90deg, #c9a227, #f0d060);
                color: #000; font-size: 7.5px; font-weight: 900; letter-spacing: .05em;
                padding: 2px 8px 3px; border-radius: 0 0 6px 6px;
            }
            .ec-section-label {
                font-size: 0.62rem; font-weight: 700; letter-spacing: .14em;
                color: rgba(212,175,55,0.65); text-transform: uppercase;
                border-bottom: 1px solid rgba(212,175,55,0.15);
                padding-bottom: 5px; margin-bottom: 10px; margin-top: 16px;
            }
            .ec-section-label:first-child { margin-top: 0; }
            .ec-btn {
                display: inline-flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, #c9a227, #d4af37); color: #000;
                font-weight: 800; font-size: 0.72rem; padding: 7px 12px;
                border-radius: 6px; border: none; cursor: pointer; transition: all .15s;
            }
            .ec-btn:hover:not(:disabled) { background: linear-gradient(135deg, #d4af37, #edd97a); box-shadow: 0 4px 12px rgba(212,175,55,0.3); }
            .ec-btn:disabled { opacity: 0.35; cursor: not-allowed; background: #374151; color: #9ca3af; }
            .ec-coin {
                border-radius: 50%;
                background: radial-gradient(circle at 35% 35%, #f0d060 0%, #c9a227 55%, #8b6914 100%);
                display: inline-flex; align-items: center; justify-content: center;
                font-weight: 900; color: #000; flex-shrink: 0;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.3);
            }
        `;
        document.head.appendChild(st);
    }

    const kaskoActive = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
    const tempKaskoDay = gameState.tempKaskoExpiresDay || 0;
    const tempKaskoActive = kaskoActive && tempKaskoDay > 0 && gameState.day <= tempKaskoDay;
    const execPassActive = !!(gameState.executivePassActive && gameState.day <= (gameState.executivePassExpiresDay||0));
    const radarActive = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    const plate = !!gameState.hasPrestigiousPlate;
    const restingCount   = (gameState.drivers||[]).filter(d => d.id!=='ceo' && d.status==='resting').length;
    const stressedCount  = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0||d.burnout_until)).length;
    const trainingCount  = (gameState.driverAcademy||[]).length;
    const constructions  = (gameState.constructions||[]);
    const lowFuel        = (gameState.fleet||[]).filter(c => (c.fuel||0)<100).length;
    const ceoNeedEnergy  = (gameState.energy||0) < 100;

    // ── TAB: ACQUISISCI FONDI ─────────────────────────────────────────────────
    const ecPkgs = [
        { dc:50,   bonus:null,  price:'€4,99',  label:'Il Fondo Cassa',       sub:'Liquidità operativa immediata' },
        { dc:220,  bonus:'+10%', price:'€19,99', label:'Portafoglio Corporate', sub:'Executive Yield incluso' },
        { dc:600,  bonus:'+20%', price:'€49,99', label:'Conto Offshore',        sub:'Rendimento garantito' },
        { dc:1300, bonus:'+30%', price:'€99,99', label:'Il Fondo Sovrano',      sub:'Rendimento massimizzato' },
    ];

    const _acqHtml = `
        <div style="font-size:0.68rem;color:rgba(212,175,55,0.5);text-align:center;margin-bottom:16px;letter-spacing:.03em;">
            Pacchetti simulati (demo) — I Driver Coins si accumulano con missioni Presidential e trasferimenti VIP.
        </div>
        <div class="grid grid-cols-2 gap-3">
        ${ecPkgs.map(p => `
            <div class="ec-card" style="${p.bonus==='+30%'?'border-color:rgba(212,175,55,0.6);background:linear-gradient(135deg,rgba(15,12,30,0.98),rgba(30,22,60,0.96));':''}">
                ${p.bonus ? `<div class="ec-yield-ribbon">Executive Yield ${p.bonus}</div>` : ''}
                <div style="padding-top:${p.bonus?'12px':'0'};">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                        <div class="ec-coin" style="width:24px;height:24px;font-size:8px;">CE</div>
                        <span style="font-size:1.4rem;font-weight:900;color:#d4af37;line-height:1;">${p.dc}</span>
                        <span style="font-size:0.62rem;color:#9ca3af;margin-top:6px;">DC</span>
                    </div>
                    <div style="font-size:0.78rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:2px;">${p.label}</div>
                    <div style="font-size:0.62rem;color:rgba(212,175,55,0.55);margin-bottom:10px;">${p.sub}</div>
                    <div style="font-size:1.05rem;font-weight:900;color:#d4af37;margin-bottom:10px;">${p.price}</div>
                    <button class="ec-btn" style="width:100%;" onclick="window._dcSimPurchase(${p.dc})">Acquisisci</button>
                </div>
            </div>`).join('')}
        </div>
    `;

    // ── TAB: SERVIZI ESCLUSIVI ────────────────────────────────────────────────
    const _itemRow = (it) => `
        <div class="ec-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;${it.disabled?'opacity:0.4;':''}">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <span style="font-size:1.25rem;flex-shrink:0;">${it.icon}</span>
                <div style="min-width:0;">
                    <div style="font-size:0.77rem;font-weight:700;color:#fff;line-height:1.2;">${it.label}</div>
                    <div style="font-size:0.62rem;color:#9ca3af;line-height:1.3;">${it.sub}</div>
                </div>
            </div>
            <button class="ec-btn" style="width:auto;padding:6px 12px;white-space:nowrap;flex-shrink:0;"
                onclick="${it.disabled?'':it.fn}" ${it.disabled?'disabled':''}>
                ${it.disabled ? it.disabledLabel : `${it.cost} DC`}
            </button>
        </div>`;

    const opItems = [
        { label:'Caffè Sospeso',        sub:'Azzera lo stress del driver più esausto',          cost:10,  icon:'☕',  fn:'window._ecCaffeSospeso()',        disabled:stressedCount===0,     disabledLabel:'Staff in forma' },
        { label:'Manutenzione Express', sub:'Ripara il veicolo più danneggiato al 100%',        cost:25,  icon:'🔧', fn:'window._ecManutenzioneExpress()',  disabled:(gameState.fleet||[]).every(c=>(c.condition||100)>=100), disabledLabel:'Flotta perfetta' },
        { label:'Tangente al Sindacato',sub:'Blocca scioperi per 1 giorno di gioco',            cost:50,  icon:'🤝', fn:'window._ecTangenteSindacato()',    disabled:(gameState.tangenteUntil||0)>gameState.day, disabledLabel:'Già protetto' },
        { label:'Rifornimento Flotta',  sub:`${lowFuel} veicoli sotto al 100% di carburante`,  cost:3,   icon:'⛽',  fn:'fuelBoostDC()',                    disabled:lowFuel===0,           disabledLabel:'Flotta piena' },
        { label:'Ricarica Energia CEO', sub:'Recupero immediato al 100%',                       cost:4,   icon:'⚡',  fn:'energyBoostDC()',                  disabled:!ceoNeedEnergy,        disabledLabel:'Già al 100%' },
        { label:'Sveglia Flotta',       sub:`${restingCount} autisti in pausa forzata`,         cost:Math.max(3,restingCount*2), icon:'⏰', fn:'wakeAllDriversDC()', disabled:restingCount===0, disabledLabel:'Nessuno a riposo' },
        { label:'Benessere Staff',      sub:`${stressedCount} autisti con stress o burnout`,    cost:Math.max(4,stressedCount*2), icon:'💊', fn:'healAllDriversDC()', disabled:stressedCount===0, disabledLabel:'Staff in forma' },
        { label:'Completamento Corsi',  sub:`${trainingCount} corsi in accademia attivi`,       cost:Math.max(1,trainingCount*5), icon:'🎓', fn:'skipAllAcademyDC()', disabled:trainingCount===0, disabledLabel:'Nessun corso' },
        { label:'Costruzioni Lampo',    sub:`${constructions.length} cantieri in corso`,        cost:Math.max(1,constructions.length*8), icon:'🏗️', fn:'skipAllConstructionsDC()', disabled:constructions.length===0, disabledLabel:'Nessuna costruzione' },
        { label:'Pacchetto Operativo',  sub:'Carburante + Energia CEO + Sveglia autisti',       cost:9,   icon:'🚀', fn:'opsBundleDC()',  disabled:lowFuel===0&&!ceoNeedEnergy&&restingCount===0, disabledLabel:'Tutto OK' },
        { label:'Pacchetto Imperiale',  sub:'Tutto in uno: flotta, staff, corsi, edifici',      cost:35,  icon:'👑', fn:'fullBundleDC()', disabled:false,  disabledLabel:'' },
        { label:'Limite Offline +2h',   sub:`Progressione offline attuale: ${offLimit}h (max 12h)`, cost:20, icon:'🕐', fn:"window._dcSpend('offline_limit',20)", disabled:offLimit>=12, disabledLabel:'Massimo raggiunto' },
        { label:'Auto-Rest CEO',        sub:'Recupero energetico automatico durante offline',   cost:30,  icon:'🛌', fn:"window._dcSpend('auto_rest',30)", disabled:autoRest, disabledLabel:'Già attivo' },
    ];

    const assicItems = [
        {
            label:'Polizza Kasko Corporate',
            sub: kaskoActive && !tempKaskoActive ? 'Polizza permanente attiva — copertura illimitata'
                : tempKaskoActive ? `Attiva fino al giorno ${tempKaskoDay} (${tempKaskoDay - gameState.day} gg rimasti)`
                : 'Copertura incidenti per 7 giorni di gioco',
            cost:150, icon:'🛡️', fn:'window._ecPolizzaKasko()',
            disabled: kaskoActive && !tempKaskoActive, disabledLabel:'Polizza attiva'
        },
        {
            label:'Executive Pass',
            sub: execPassActive ? `Attivo — ${(gameState.executivePassExpiresDay||0)-gameState.day} giorni rimasti`
                : '+25% slot corse · −50% stress · Insta-Repair 1DC · VIP extra',
            cost:150, icon:'💎', fn:'activateExecutivePass()',
            disabled:execPassActive, disabledLabel:'Già attivo'
        },
    ];

    const presItems = [
        {
            label:'Radar VIP',
            sub: radarActive ? 'Attivo — accesso prioritario corse VIP potenziato'
                : 'Priority queue +100% per 72 ore di gioco',
            cost:200, icon:'📡', fn:'window._ecRadarVip()',
            disabled:radarActive, disabledLabel:'Già attivo'
        },
        {
            label:'Targa Nera Presidenziale',
            sub: plate ? 'Targa applicata — prestigio massimo sbloccato'
                : 'Cosmetico permanente. Sblocca clienti esclusivi e reputazione extra.',
            cost:500, icon:'🏴', fn:'window._ecTargaPresidenziale()',
            disabled:plate, disabledLabel:'Già posseduta'
        },
    ];

    const _serviziHtml = `
        <div class="ec-section-label">Operatività & Flotta</div>
        ${opItems.map(_itemRow).join('')}
        <div class="ec-section-label">Assicurazioni & Licenze</div>
        ${assicItems.map(_itemRow).join('')}
        <div class="ec-section-label">Prestigio</div>
        ${presItems.map(_itemRow).join('')}
    `;

    // ── RENDER ────────────────────────────────────────────────────────────────
    container.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(5,5,15,0.98),rgba(15,12,35,0.98));border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:0.58rem;letter-spacing:.2em;color:rgba(212,175,55,0.55);text-transform:uppercase;font-weight:700;">Chauffeur Empire</div>
                <div style="font-size:1.05rem;font-weight:900;color:#d4af37;letter-spacing:.04em;font-family:serif;">Executive Club</div>
                <div style="font-size:0.6rem;color:#4b5563;margin-top:2px;">Private Banking · Black Card Services</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.58rem;letter-spacing:.1em;color:rgba(212,175,55,0.45);text-transform:uppercase;">Saldo</div>
                <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-top:3px;">
                    <div class="ec-coin" style="width:20px;height:20px;font-size:7px;">CE</div>
                    <span style="font-size:1.15rem;font-weight:900;color:#d4af37;font-family:monospace;">${dc.toLocaleString()}</span>
                    <span style="font-size:0.62rem;color:#6b7280;">DC</span>
                </div>
            </div>
        </div>

        <div style="display:flex;border-bottom:1px solid rgba(212,175,55,0.15);margin-bottom:16px;">
            <div class="ec-tab ${_ecActiveTab==='acquire'?'active':''}" onclick="window._ecSwitchTab('acquire')">Acquisisci Fondi</div>
            <div class="ec-tab ${_ecActiveTab==='services'?'active':''}" onclick="window._ecSwitchTab('services')">Servizi Esclusivi</div>
        </div>

        ${_ecActiveTab === 'acquire' ? _acqHtml : _serviziHtml}
    `;
}
window.renderTabPremiumStore = renderTabPremiumStore;

window._dcSimPurchase = async function(amount) {
    // Optimistic local credit
    gameState.driverCoins = (gameState.driverCoins || 0) + amount;
    renderTabPremiumStore();
    updateUI();

    // Persist to DB so RPCs can debit the authoritative column
    try {
        const result = await window.ServerState?.addDriverCoins(amount);
        if (result?.ok && result.driver_coins != null) {
            gameState.driverCoins = result.driver_coins;
            renderTabPremiumStore();
            updateUI();
        }
    } catch (e) {
        console.warn('[_dcSimPurchase] RPC error — balance is local only:', e);
    }

    if (typeof showNotification === 'function') showNotification(`🪙 +${amount} Driver Coins! (Acquisto simulato)`, 'success');
    saveGame();
};

window._dcSpend = async function(itemId, cost) {
    if ((gameState.driverCoins || 0) < cost) {
        if (typeof showNotification === 'function') showNotification(`Driver Coins insufficienti! Servono ${cost} DC.`, 'error');
        return;
    }

    // Optimistic local debit — server RPC is the authority
    gameState.driverCoins -= cost;
    updateUI();

    try {
        let result;
        switch (itemId) {
            case 'energy_full':
                result = await window.ServerState?.buyEnergyRefill(cost);
                if (result?.ok) {
                    gameState.energy = 100;
                    logToMap('⚡ Energia CEO ricaricata (DC)!');
                }
                break;
            case 'repair_all':
                result = await window.ServerState?.buyFleetRepair(cost);
                if (result?.ok) {
                    (gameState.fleet || []).forEach(c => { c.condition = 100; c.fuel = 100; c.tirePressure = 100; });
                    logToMap('🔧 Tutta la flotta riparata (DC)!');
                }
                break;
            case 'unlock_ride':
                result = await window.ServerState?.buyVipContact(cost);
                if (result?.ok && typeof generatePOIRide === 'function') {
                    const r = generatePOIRide('ultra');
                    if (r) logToMap('🎫 Contatto VIP: corsa ultra generata (DC)!');
                }
                break;
            case 'offline_limit':
                result = await window.ServerState?.upgradeOfflineLimit(cost);
                if (result?.ok) {
                    gameState.offlineLimit = result.offline_limit_hours;
                    logToMap(`🕐 Limite offline espanso a ${result.offline_limit_hours}h (DC)!`);
                }
                break;
            case 'auto_rest':
                result = await window.ServerState?.buyAutoRest(cost);
                if (result?.ok) {
                    gameState.autoRestEnabled = true;
                    logToMap('🛌 Auto-Rest CEO attivato (DC)!');
                }
                break;
            default:
                // itemId non riconosciuto — rollback immediato
                gameState.driverCoins += cost;
                if (typeof showNotification === 'function') showNotification(`⚠ Operazione non riconosciuta: ${itemId}`, 'error');
                return;
        }

        if (result && !result.ok) {
            // RPC rejected — roll back local debit
            gameState.driverCoins += cost;
            if (typeof showNotification === 'function') showNotification(`⚠ ${result.error || 'Operazione fallita'}`, 'error');
        } else if (result?.ok) {
            // Sync authoritative coin count from server response
            if (result.driver_coins !== undefined) gameState.driverCoins = result.driver_coins;
            if (typeof showNotification === 'function') showNotification(`🪙 −${cost} DC · attivato!`, 'success');
        }
    } catch (e) {
        // Network error — roll back
        gameState.driverCoins += cost;
        console.error('[_dcSpend] RPC error:', e);
        if (typeof showNotification === 'function') showNotification('⚠ Errore di rete — operazione annullata', 'error');
    }

    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    renderTabPremiumStore();
    updateUI();
    saveGame();
};

// ── EXECUTIVE CLUB — SPEND HANDLERS ──────────────────────────────────────────

window._ecCaffeSospeso = async function() {
    const COST = 10;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const stressed = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0 || d.burnout_until));
    if (!stressed.length) { showNotification('Nessun autista esausto.','info'); return; }
    stressed.sort((a,b) => (b.stress_level||0)-(a.stress_level||0));
    const target = stressed[0];
    gameState.driverCoins -= COST;
    target.stress_level = 0; delete target.burnout_until;
    try { await window.ServerState?.spendDriverCoins('caffe_sospeso', COST); } catch(e) { console.error(e); }
    logToMap(`☕ Caffè Sospeso: ${target.name} è tornato operativo!`);
    showNotification(`☕ ${target.name}: stress azzerato! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecManutenzioneExpress = async function() {
    const COST = 25;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const damaged = (gameState.fleet||[]).filter(c => (c.condition||100)<100);
    if (!damaged.length) { showNotification('Flotta in perfette condizioni.','info'); return; }
    damaged.sort((a,b) => (a.condition||100)-(b.condition||100));
    const car = damaged[0];
    gameState.driverCoins -= COST;
    car.condition = 100; car.fuel = 100;
    try { await window.ServerState?.spendDriverCoins('manutenzione_express', COST); } catch(e) { console.error(e); }
    logToMap(`🔧 Manutenzione Express: ${car.name||car.id} ripristinata al 100%!`);
    showNotification(`🔧 ${car.name||car.id}: condizione 100%! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecTangenteSindacato = async function() {
    const COST = 50;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    if ((gameState.tangenteUntil||0) > gameState.day) { showNotification('Già protetto dagli scioperi!','info'); return; }
    gameState.driverCoins -= COST;
    gameState.tangenteUntil = gameState.day + 1;
    try { await window.ServerState?.spendDriverCoins('tangente_sindacato', COST); } catch(e) { console.error(e); }
    logToMap('🤝 Tangente al Sindacato pagata — scioperi bloccati per 24 ore!');
    showNotification(`🤝 Scioperi bloccati per 24h! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecPolizzaKasko = async function() {
    const COST = 150;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const hasPerm = typeof hasInvestment === 'function' && hasInvestment('inv_kasko') && !gameState.tempKaskoExpiresDay;
    if (hasPerm) { showNotification('Polizza Kasko permanente già attiva!','info'); return; }
    const tempStillActive = (gameState.tempKaskoExpiresDay||0) > 0 && gameState.day <= gameState.tempKaskoExpiresDay;
    if (tempStillActive) { showNotification('Polizza Kasko già attiva!','info'); return; }
    gameState.driverCoins -= COST;
    if (!hasInvestment('inv_kasko')) {
        if (!gameState.investments) gameState.investments = [];
        gameState.investments.push('inv_kasko');
    }
    gameState.tempKaskoExpiresDay = gameState.day + 7;
    try { await window.ServerState?.spendDriverCoins('polizza_kasko', COST); } catch(e) { console.error(e); }
    logToMap('🛡️ Polizza Kasko Corporate attivata per 7 giorni di gioco!');
    showNotification(`🛡️ Kasko attiva per 7 giorni! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecRadarVip = async function() {
    const COST = 200;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const already = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    if (already) { showNotification('Radar VIP già attivo!','info'); return; }
    gameState.driverCoins -= COST;
    if (typeof window._applyBuff === 'function') window._applyBuff('radar_vip', 'vip_queue', 100, 72);
    try { await window.ServerState?.spendDriverCoins('radar_vip', COST); } catch(e) { console.error(e); }
    logToMap('📡 Radar VIP: accesso prioritario corse VIP per 72 ore!');
    showNotification(`📡 Radar VIP attivato per 72 ore! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecTargaPresidenziale = async function() {
    const COST = 500;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    if (gameState.hasPrestigiousPlate) { showNotification('Targa Presidenziale già posseduta!','info'); return; }
    gameState.driverCoins -= COST;
    gameState.hasPrestigiousPlate = true;
    try { await window.ServerState?.spendDriverCoins('targa_presidenziale', COST); } catch(e) { console.error(e); }
    logToMap('🏴 Targa Nera Presidenziale: massimo prestigio raggiunto!');
    showNotification(`🏴 Targa Presidenziale applicata! Benvenuto nell\'élite. (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

// ── MERCATO AUTO + ASTE LIVE ──────────────────────────────────────────────────
function renderTabMarket() {
    const container = document.getElementById('tab-container');
    let html = '';

    // ── ASTA LIVE ──
    const auc = gameState.activeAuction;
    const curH = gameState.day * 24 + gameState.hour;
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">🔨 Asta Live</h3>`;
    if (auc) {
        const hoursLeft = Math.max(0, auc.endsHour - curH);
        const isWinning = auc.playerBid && auc.playerBid >= auc.currentBid;
        html += `
        <div class="hud-card !border-gold/40 bg-gold/5 mb-5">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="text-xs font-bold text-white">${auc.name}</div>
                    <div class="text-[9px] text-gray-400">${auc.tier.toUpperCase()} · Offerta attuale: <span class="text-gold font-bold">€${auc.currentBid.toLocaleString()}</span></div>
                    ${isWinning ? '<div class="text-[9px] text-green-400 font-bold mt-0.5">✅ Stai vincendo!</div>' : auc.playerBid ? '<div class="text-[9px] text-red-400 mt-0.5">⚠ Sei stato superato!</div>' : ''}
                </div>
                <div class="text-right">
                    <div class="text-[8px] text-gray-500 uppercase">Scade in</div>
                    <div class="text-[10px] font-bold ${hoursLeft < 3 ? 'text-red-400 animate-pulse' : 'text-white'}">${hoursLeft}h</div>
                </div>
            </div>
            <div class="flex gap-2 mt-2">
                ${[auc.currentBid + 5000, auc.currentBid + 15000, auc.currentBid + 50000].map(bid =>
                    `<button onclick="bidOnAuction(${bid})" class="flex-1 text-[8px] py-1 rounded border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 transition-colors">+€${(bid - auc.currentBid).toLocaleString()}<br><span class="opacity-60">€${bid.toLocaleString()}</span></button>`
                ).join('')}
            </div>
        </div>`;
    } else {
        html += `<div class="hud-card text-center mb-5">
            <div class="text-2xl mb-1">🔨</div>
            <div class="text-[10px] text-gray-500 italic">Nessuna asta attiva.<br>Le aste rare partono casualmente ogni giorno.</div>
        </div>`;
    }

    // ── VEICOLI NPC DA ACQUISTARE ──
    const npcList = gameState.npcMarket || [];
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">🚗 Usato Disponibile</h3>`;
    if (npcList.length === 0) {
        html += `<div class="text-[9px] text-gray-600 italic mb-4">Nessun veicolo disponibile. Si aggiorna ogni 3 giorni.</div>`;
    } else {
        html += `<div class="space-y-2 mb-5">`;
        npcList.forEach(listing => {
            const condColor = listing.condition < 40 ? '#ef4444' : listing.condition < 70 ? '#f59e0b' : '#22c55e';
            html += `
            <div class="hud-card flex justify-between items-center">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white">${listing.name}</div>
                    <div class="text-[9px] text-gray-400">${listing.tier.toUpperCase()} · ${Math.floor(listing.mileage/1000)}k km</div>
                    <div class="flex items-center gap-1 mt-1">
                        <div class="fuel-bar-bg" style="width:60px"><div class="fuel-bar-fill" style="width:${listing.condition}%;background:${condColor}"></div></div>
                        <span class="text-[8px]" style="color:${condColor}">${listing.condition}%</span>
                    </div>
                </div>
                <div class="text-right ml-2 shrink-0">
                    <div class="text-sm font-bold text-gold">€${listing.price.toLocaleString()}</div>
                    <button onclick="buyNpcCar('${listing.id}')" class="btn-gold !py-0.5 !text-[8px] mt-1">Acquista</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── LE TUE AUTO IN VENDITA ──
    const myListings = (gameState.marketplace || []).map(l => ({
        ...l, car: gameState.fleet.find(c => c.id === l.carId)
    })).filter(l => l.car);
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">📋 Tuoi Annunci</h3>`;
    if (myListings.length === 0) {
        html += `<div class="text-[9px] text-gray-600 italic mb-4">Nessun annuncio attivo.<br>Vai in Flotta → card veicolo → Gestisci → Metti in Vendita.</div>`;
    } else {
        html += `<div class="space-y-2 mb-5">`;
        myListings.forEach(l => {
            const daysLeft = Math.max(0, 2 - (gameState.day - l.listedDay));
            html += `
            <div class="hud-card flex justify-between items-center">
                <div>
                    <div class="text-xs font-bold text-white">${l.car.name}</div>
                    <div class="text-[9px] text-gray-400">Prezzo: €${l.askPrice.toLocaleString()} · ${daysLeft > 0 ? `Acquirente in ~${daysLeft}g` : 'Vendita in corso…'}</div>
                </div>
                <button onclick="cancelListing('${l.id}')" class="btn-gold !bg-red-900/30 !text-red-400 !text-[8px]">Ritira</button>
            </div>`;
        });
        html += `</div>`;
    }

    // ── VENDI AUTO DALLA FLOTTA ──
    const sellableCars = gameState.fleet.filter(c =>
        !c.isLease &&
        !(gameState.marketplace||[]).some(l => l.carId === c.id) &&
        !gameState.drivers.some(d => d.assignedCarId === c.id && d.status === 'busy')
    );
    if (sellableCars.length > 0) {
        html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">💰 Metti in Vendita</h3><div class="space-y-2">`;
        sellableCars.forEach(car => {
            const condPct = Math.floor(car.condition || 0);
            const suggestPrice = Math.round(20000 * (condPct/100) * (car.tier === 'ultra' ? 5 : car.tier === 'vip' ? 3 : car.tier === 'business' ? 1.8 : 1));
            html += `
            <div class="hud-card flex justify-between items-center">
                <div>
                    <div class="text-xs font-bold text-white">${car.name}</div>
                    <div class="text-[9px] text-gray-400">${car.tier.toUpperCase()} · Cond. ${condPct}%</div>
                    <div class="text-[9px] text-green-400">Stima: ~€${suggestPrice.toLocaleString()}</div>
                </div>
                <button onclick="listCarForSale('${car.id}', ${suggestPrice})" class="btn-gold !text-[8px] !py-1">Vendi ~€${(suggestPrice/1000).toFixed(0)}k</button>
            </div>`;
        });
        html += `</div>`;
    }

    // ── P2P MERCATO REALE ──
    if (typeof renderP2PMarketSection === 'function') html += renderP2PMarketSection();

    container.innerHTML = html;
}
window.renderTabMarket = renderTabMarket;

// ══════════════════════════════════════════════════════════════════
// TAB AIUTO & SUPPORTO
// ══════════════════════════════════════════════════════════════════
function renderTabHelp() {
    const container = document.getElementById('tab-container');
    const cfg = window.GAME_CONFIG || {};
    const email = cfg.SUPPORT_EMAIL || 'support@chauffeurempire.com';
    const companyId = window.currentUser?.id || 'N/D';
    const companyName = (gameState.companyName || 'La tua azienda');
    const bugSubject = encodeURIComponent(`Segnalazione Bug - ID Compagnia: ${companyId}`);
    const generalSubject = encodeURIComponent(`Assistenza - ${companyName}`);

    container.innerHTML = `
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">🆘 Aiuto & Supporto</h3>

    <div class="hud-card mb-3">
        <div class="text-[10px] font-bold text-white mb-1">📧 Email Ufficiale</div>
        <div class="text-[9px] text-gray-400 mb-2">Il nostro team risponde entro 24h nei giorni lavorativi.</div>
        <a href="mailto:${email}" class="text-[9px] text-gold underline underline-offset-2 break-all">${email}</a>
    </div>

    <div class="hud-card mb-3">
        <div class="text-[10px] font-bold text-white mb-1">🐛 Segnala un Bug</div>
        <div class="text-[9px] text-gray-400 mb-2">Il tuo ID Compagnia verrà precompilato nell'oggetto così possiamo rintracciarti subito nel database.</div>
        <div class="text-[8px] text-gray-600 font-mono mb-2 break-all">ID: ${companyId}</div>
        <a href="mailto:${email}?subject=${bugSubject}" class="btn-gold !text-[8px] !py-1 inline-block text-center w-full">
            🐛 Apri Client Email — Segnala Bug
        </a>
    </div>

    <div class="hud-card mb-3">
        <div class="text-[10px] font-bold text-white mb-1">💬 Assistenza Generale</div>
        <div class="text-[9px] text-gray-400 mb-2">Domande sul gioco, pagamenti DC, recupero account.</div>
        <a href="mailto:${email}?subject=${generalSubject}" class="btn-gold !bg-white/5 !text-gray-300 !text-[8px] !py-1 inline-block text-center w-full">
            ✉️ Contatta il Supporto
        </a>
    </div>

    <div class="hud-card !border-white/5 bg-white/2">
        <div class="text-[9px] text-gray-600 text-center leading-relaxed">
            Chauffeur Empire · ${cfg.GAME_URL || 'chauffeurempire.com'}<br>
            <span class="text-[8px]">Versione build ${new Date().toLocaleDateString('it-IT', {month:'short', year:'numeric'})}</span>
        </div>
    </div>`;
}
window.renderTabHelp = renderTabHelp;

// Re-render whatever tab is currently active (used by lang.js setLang)
window.renderCurrentTab = function() {
    if (typeof _activeTab !== 'undefined' && _activeTab) {
        window.switchTab(_activeTab);
    }
};

// ── SMART HUB ────────────────────────────────────────────────────
window.toggleHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    const isHidden = modal.classList.contains('hidden');
    if (isHidden) { window.openHub(); } else { window.closeHub(); }
};

window.openHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('hub-modal-open');
    _updateHubStats();
    // Clear event badge
    if (typeof gameState !== 'undefined') gameState._hubNewEvent = false;
    const badge = document.getElementById('hub-event-badge');
    if (badge) badge.classList.add('hidden');
};

window.closeHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('hub-modal-open');
};

window.hubNavigate = function(tab) {
    window.closeHub();
    setTimeout(() => { if (typeof switchTab === 'function') switchTab(tab); }, 80);
};

function _updateHubStats() {
    if (typeof gameState === 'undefined') return;
    const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

    const cashEl = document.getElementById('hub-cash');
    const repEl  = document.getElementById('hub-rep');
    const dayEl  = document.getElementById('hub-day');
    const timeEl = document.getElementById('hub-time');
    const logoEl = document.getElementById('hub-company-logo');
    const nameEl = document.getElementById('hub-company-name');

    const c = gameState.cash || 0;
    const cashStr = c >= 1e9 ? `€${(c/1e9).toFixed(2)}B` : c >= 1e6 ? `€${(c/1e6).toFixed(2)}M` : c >= 1e3 ? `€${Math.floor(c/1e3)}k` : `€${Math.floor(c)}`;
    if (cashEl) cashEl.innerText = cashStr;
    if (repEl)  repEl.innerText  = `${(gameState.reputation||0).toFixed(1)}★`;
    if (dayEl)  dayEl.innerText  = `${gameState.day||1} ${MONTHS[(gameState.month||1)-1]}`;
    if (timeEl) timeEl.innerText = `${String(gameState.hour||8).padStart(2,'0')}:${String(gameState.minute||0).padStart(2,'0')}`;
    if (logoEl) logoEl.innerText = gameState.companyLogo || '👁️';
    if (nameEl) nameEl.innerText = gameState.companyName || 'Chauffeur Empire';

    // Module badges
    const ridesEl   = document.getElementById('hmod-rides');
    const staffEl   = document.getElementById('hmod-staff');
    const mailEl    = document.getElementById('hmod-mail');
    const strikeEl  = document.getElementById('hmod-strike');
    const unread = (gameState.emails||[]).filter(e=>e.status==='unread').length;
    const striking = (gameState.drivers||[]).filter(d=>d.isOnStrike).length;
    if (ridesEl) ridesEl.innerText = (gameState.pendingRides||[]).length;
    if (staffEl) staffEl.innerText = (gameState.drivers||[]).filter(d=>d.id!=='ceo').length;
    if (mailEl)  { mailEl.innerText = unread; mailEl.classList.toggle('hidden', unread === 0); }
    if (strikeEl) strikeEl.classList.toggle('hidden', striking === 0);

    // Espansione 11: badge nemici VIP
    const nemBadge = document.getElementById('hmod-nemesis');
    if (nemBadge) {
        const nemCount = Object.keys(gameState.vipNemeses || {}).length;
        nemBadge.textContent = nemCount;
        nemBadge.classList.toggle('hidden', nemCount === 0);
    }

    // Active event banner
    const ev = gameState.activeDynamicEvent;
    const banner = document.getElementById('hub-event-banner');
    if (banner) {
        if (ev) {
            banner.classList.remove('hidden');
            const evIcon = document.getElementById('hub-ev-icon');
            const evName = document.getElementById('hub-ev-name');
            const evMeta = document.getElementById('hub-ev-meta');
            const evMult = document.getElementById('hub-ev-mult');
            const hoursLeft = Math.max(0, ev.endsHour - ((gameState.day||1)*24 + (gameState.hour||0)));
            if (evIcon) evIcon.innerText = ev.icon || '🎬';
            if (evName) evName.innerText = ev.name;
            if (evMeta) evMeta.innerText = `${(ev.rarity||'').toUpperCase()} · ${(ev.category||'')} · ${hoursLeft}h rimaste`;
            if (evMult) evMult.innerText = `×${ev.priceMult||1}${ev.surge?' +SURGE':''}`;
            banner.style.borderColor = ev.rarity === 'legendary' ? 'rgba(212,175,55,0.5)' : ev.rarity === 'epic' ? 'rgba(168,85,247,0.5)' : 'rgba(59,130,246,0.4)';
        } else {
            banner.classList.add('hidden');
        }
    }
}
window._updateHubStats = _updateHubStats;

// ─── GLOBAL NEWS FEED (Supabase Realtime) ────────────────────────
function _appendNewsTicker(message) {
    const track = document.getElementById('news-ticker-track');
    if (!track) return;
    const span = document.createElement('span');
    span.textContent = '🌐 ' + message;
    track.appendChild(span);
    // Rimuovi le notizie più vecchie se si accumulano troppo
    const spans = track.querySelectorAll('span');
    if (spans.length > 80) spans[0].remove();
}

async function _initGlobalNewsFeed() {
    if (!window.supabaseClient) return;
    // Carica le ultime 10 notizie già esistenti
    try {
        const { data } = await window.supabaseClient
            .from('global_news')
            .select('message')
            .order('created_at', { ascending: false })
            .limit(10);
        if (data) [...data].reverse().forEach(row => _appendNewsTicker(row.message));
    } catch(e) { /* offline, silenzioso */ }
    // Sottoscrizione Realtime: aggiunge live le nuove notizie
    window.supabaseClient.channel('global_news_feed')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'global_news' },
            payload => _appendNewsTicker(payload.new.message))
        .subscribe();
}

// ─── PROVINCE WAR TAB ───────────────────────────────────────────────────────
async function renderTabProvinces() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[10px] text-gray-500 text-center py-6">Caricamento mappa territoriale…</div>`;

    let provinces = [], regions = [], influence = {};
    try {
        const snap = await window.ServerState.getTerritorySnapshot();
        if (!snap) throw new Error('snapshot nullo');
        provinces = snap.provinces || [];
        regions   = snap.regions   || [];
        influence = snap.influence  || {};
    } catch(e) {
        container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore caricamento territorio: ${e.message}</div>`;
        return;
    }

    // Build region lookup
    const regionMap = {};
    regions.forEach(r => { regionMap[r.id] = r; });

    // Count provinces per region owned by me
    const myCompanyName = gameState.companyName || '';
    const myOwnedCount  = {}; // regionId → count
    const totalCount    = {}; // regionId → total
    provinces.forEach(p => {
        totalCount[p.region_id] = (totalCount[p.region_id] || 0) + 1;
        if (p.owner_company === myCompanyName) {
            myOwnedCount[p.region_id] = (myOwnedCount[p.region_id] || 0) + 1;
        }
    });

    // Group by region for display
    const byRegion = {};
    provinces.forEach(p => {
        if (!byRegion[p.region_id]) byRegion[p.region_id] = [];
        byRegion[p.region_id].push(p);
    });

    let html = `
    <div class="mb-3 hud-card !border-gold/30 bg-gold/5">
        <div class="text-[10px] text-gold font-bold uppercase tracking-widest mb-1">🏴 Guerra Territoriale</div>
        <div class="text-[9px] text-gray-400 leading-relaxed">
            Ogni corsa che parte o arriva in una provincia ti guadagna <b class="text-white">+10 Punti Influenza</b>.
            Raggiungi la soglia per lanciare un'OPA (120% del valore). Chi controlla >50% delle province di una regione
            diventa <b class="text-yellow-300">Governatore</b> e percepisce l'1% su ogni corsa nella regione.
        </div>
    </div>`;

    // Render by region
    Object.entries(byRegion).forEach(([regionId, provs]) => {
        const reg = regionMap[regionId] || { name: regionId, governor_company: null };
        const myCount  = myOwnedCount[regionId]  || 0;
        const total    = totalCount[regionId]     || 0;
        const amGov    = reg.governor_company === myCompanyName;
        const govLabel = reg.governor_company
            ? `<span class="text-yellow-300">👑 ${reg.governor_company}</span>`
            : `<span class="text-gray-600">— nessun governatore</span>`;

        html += `
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2 px-1">
                <div class="text-[9px] font-bold text-gray-300 uppercase tracking-widest">${reg.name}</div>
                <div class="text-[8px] text-gray-500">
                    ${govLabel}
                    ${amGov ? ' <span class="text-[7px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1 rounded">TU SEI GOVERNATORE</span>' : ''}
                    · ${myCount}/${total} province
                </div>
            </div>
            <div class="space-y-2">`;

        provs.forEach(p => {
            const isOwned   = p.owner_company === myCompanyName;
            const isFree    = !p.owner_id;
            const myInf     = influence[p.id] || 0;
            const threshold = p.required_influence || 500;
            const infPct    = Math.min(100, Math.round((myInf / threshold) * 100));
            const infUnlocked = myInf >= threshold;
            const minOffer  = Math.ceil((p.current_value || 0) * 1.20);
            const taxPct    = ((p.transit_tax_pct || 0.025) * 100).toFixed(1);

            html += `
            <div class="hud-card ${isOwned ? '!border-gold/60 bg-gold/5' : isFree ? '!border-green-500/30 bg-green-950/10' : '!border-white/10'}">
                <div class="flex justify-between items-start mb-1">
                    <div>
                        <span class="text-[10px] font-bold text-white">${p.name}</span>
                        ${isOwned ? '<span class="ml-1 text-[7px] bg-gold/20 text-gold border border-gold/30 px-1 rounded">TUA</span>' : ''}
                        ${isFree  ? '<span class="ml-1 text-[7px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded">LIBERA</span>' : ''}
                        ${amGov && !isOwned ? '<span class="ml-1 text-[7px] bg-yellow-500/10 text-yellow-500 border border-yellow-600/30 px-1 rounded">+1% regionale</span>' : ''}
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] font-bold text-gold">€${(p.current_value||0).toLocaleString()}</div>
                        <div class="text-[7px] text-gray-600">tassa: ${taxPct}%</div>
                    </div>
                </div>

                ${!isOwned && !isFree ? `<div class="text-[8px] text-gray-400 mb-1">Proprietario: <span class="text-blue-300">${p.owner_company}</span></div>` : ''}

                <!-- Barra influenza -->
                <div class="mb-1">
                    <div class="flex justify-between text-[7px] text-gray-500 mb-0.5">
                        <span>Influenza</span>
                        <span class="${infUnlocked ? 'text-green-400' : 'text-gray-500'}">${myInf}/${threshold} ${infUnlocked ? '✅' : ''}</span>
                    </div>
                    <div class="fuel-bar-bg">
                        <div class="fuel-bar-fill" style="width:${infPct}%;background:${infUnlocked ? '#22c55e' : infPct > 60 ? '#f59e0b' : '#6b7280'}"></div>
                    </div>
                    ${!infUnlocked ? `<div class="text-[7px] text-gray-600 mt-0.5">Completa corse da/verso questa provincia per aumentare l'influenza</div>` : ''}
                </div>

                ${isOwned ? `
                <div class="text-[8px] text-green-400 bg-green-950/20 border border-green-500/20 rounded px-2 py-1">
                    ✅ Percepisci il ${taxPct}% su ogni corsa provinciale${amGov ? ` + 1% come Governatore di ${reg.name}` : ''}
                </div>` : infUnlocked ? `
                <div class="flex gap-1 mt-1">
                    <input id="offer-${p.id}" type="number" min="${minOffer}" step="10000"
                        class="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1 text-[8px] text-white"
                        placeholder="Offerta min. €${minOffer.toLocaleString()}">
                    <button onclick="window.doAcquireProvince('${p.id}')" class="btn-gold !text-[7px] !py-1 !px-2 shrink-0">🏴 OPA</button>
                </div>
                <div class="text-[7px] text-gray-600 mt-0.5">Min: €${minOffer.toLocaleString()} · Vecchio proprietario riceve 80%</div>` : `
                <div class="text-[7px] text-gray-600 mt-1 italic">🔒 Raggiungi ${threshold} punti influenza per sbloccare l'OPA</div>`}
            </div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
}

window.buyHRAutomation = async function() {
    const cost = 5, days = 7;
    if ((gameState.driverCoins || 0) < cost) {
        showNotification(`Driver Coins insufficienti (servono ${cost} DC)`, 'error');
        return;
    }
    const result = await ServerState.buyHRAutomation(cost, days);
    if (!result?.success) return;

    gameState.hrAutomationExpiresAt = result.expires_at;
    gameState.driverCoins = Math.max(0, (gameState.driverCoins || 0) - cost);

    // Resolve all drivers already on strike
    let resolved = 0;
    (gameState.drivers || []).forEach(d => {
        if (d.isOnStrike) {
            d.isOnStrike = false;
            d.status = 'idle';
            d.satisfaction = Math.max(d.satisfaction || 0, 55);
            d.morale = Math.min(100, (d.morale || 50) + 20);
            resolved++;
        }
    });

    const resolvedMsg = resolved > 0
        ? ` ${resolved} autist${resolved === 1 ? 'a' : 'i'} in sciopero ${resolved === 1 ? 'è stato richiamato' : 'sono stati richiamati'} al lavoro.`
        : '';
    showBigEvent('🤝', 'Gestione Sindacale HR Attivata!',
        `Il sistema HR gestirà automaticamente gli scioperi per i prossimi ${days} giorni.${resolvedMsg}`);

    updateUI();
    if (typeof renderTabStaff === 'function') renderTabStaff();
    if (typeof saveGame === 'function') saveGame();
};

window.doAcquireProvince = async function(provinceId) {
    const input = document.getElementById(`offer-${provinceId}`);
    const offer = parseInt(input?.value, 10);
    if (!offer || offer <= 0) { showNotification('Inserisci un\'offerta valida', 'error'); return; }
    if (gameState.cash < offer) { showNotification('Fondi insufficienti', 'error'); return; }
    const result = await ServerState.acquireProvince(provinceId, offer);
    if (result?.success) {
        showBigEvent('🏴', `${result.province_name} Conquistata!`, `Investimento: €${offer.toLocaleString()}`);
        renderTabProvinces();
    }
};

// ─── REAL ESTATE TAB ────────────────────────────────────────────────────────
async function renderTabRealEstate() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[10px] text-gray-500 text-center py-10">Caricamento immobili…</div>`;

    let listings = [], owned = [];
    try {
        const [lRes, oRes] = await Promise.all([
            window.supabaseClient.from('real_estate_listings').select('*').order('cost'),
            window.supabaseClient.from('company_real_estate').select('*'),
        ]);
        if (lRes.error) throw lRes.error;
        listings = lRes.data || [];
        owned    = oRes.data || [];
    } catch(e) {
        container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore caricamento immobili: ${e.message}</div>`;
        return;
    }

    const ownedIds = new Set(owned.map(o => o.listing_id));
    const totalDailyRent = listings
        .filter(l => ownedIds.has(l.id))
        .reduce((s, l) => s + (l.daily_rent || 0), 0);
    const portfolioValue = listings
        .filter(l => ownedIds.has(l.id))
        .reduce((s, l) => s + (l.cost || 0), 0);

    let html = `
    <div class="mb-5 ls-card !border-yellow-800/40">
      <div class="px-4 py-3">
        <div class="text-[10px] text-gold font-bold uppercase tracking-widest mb-2">🏛 Real Estate Portfolio</div>
        <div class="flex gap-4">
          <div><div class="text-[8px] text-gray-500 uppercase">Proprietà</div><div class="text-sm font-bold text-white">${ownedIds.size}</div></div>
          <div><div class="text-[8px] text-gray-500 uppercase">Valore</div><div class="text-sm font-bold font-mono text-gold">€${portfolioValue.toLocaleString('it-IT')}</div></div>
          <div><div class="text-[8px] text-gray-500 uppercase">Rendita/g</div><div class="text-sm font-bold font-mono text-green-400">${totalDailyRent > 0 ? '€' + totalDailyRent.toLocaleString('it-IT') : '—'}</div></div>
        </div>
        <div class="text-[9px] text-gray-500 mt-2">Le rendite vengono accreditate automaticamente dal server ogni 24h.</div>
      </div>
    </div>
    <div class="space-y-4">`;

    listings.forEach(l => {
        const isOwned   = ownedIds.has(l.id);
        const canAfford = gameState.cash >= (l.cost || 0);
        const ownedRow  = owned.find(o => o.listing_id === l.id);

        let nextRentStr = '';
        if (isOwned && ownedRow?.last_rent_at) {
            const diffMs = new Date(ownedRow.last_rent_at).getTime() + 86400000 - Date.now();
            if (diffMs > 0) {
                const hrs = Math.floor(diffMs / 3600000), mins = Math.floor((diffMs % 3600000) / 60000);
                nextRentStr = `🕐 Prossima rendita tra ${hrs}h ${mins}m`;
            } else {
                nextRentStr = '🕐 Rendita in arrivo…';
            }
        }

        html += `
        <div class="ls-card ${isOwned ? 'ls-card-owned' : !canAfford ? 'opacity-60' : ''}">
          ${l.image_url ? `
          <div class="ls-card-img-wrap">
            <img src="${l.image_url}" alt="${l.name}" class="ls-card-img" loading="lazy">
            ${isOwned ? '<div class="ls-card-owned-badge">✓ Tuo</div>' : ''}
            <div class="ls-card-img-overlay"></div>
            <div class="ls-card-img-title">
              <div class="ls-card-name">${l.name}</div>
              <div class="ls-card-location" style="color:#d4af37">${l.city}</div>
            </div>
          </div>` : `
          <div class="ls-card-no-img px-4 pt-3 flex justify-between">
            <div><div class="ls-card-name">${l.name}</div><div class="ls-card-location" style="color:#d4af37">${l.city}</div></div>
            ${isOwned ? '<div class="ls-card-owned-badge" style="position:static;margin-top:4px">✓ Tuo</div>' : ''}
          </div>`}
          <div class="px-4 py-3">
            ${l.description ? `<div class="text-[9px] text-gray-400 leading-relaxed mb-2">${l.description}</div>` : ''}
            <div class="flex flex-wrap gap-1 mb-3">
              <span class="ls-badge ls-badge-green">+€${(l.daily_rent||0).toLocaleString('it-IT')}/g</span>
              ${l.bonus_type === 'driver_stress_recovery' ? `<span class="ls-badge ls-badge-purple">✨ Recupero stress autisti</span>` : ''}
              ${isOwned && nextRentStr ? `<span class="ls-badge ls-badge-cyan">${nextRentStr}</span>` : ''}
            </div>
            <div class="flex justify-between items-center">
              <div class="text-xs font-bold font-mono text-gold">€${(l.cost||0).toLocaleString('it-IT')}</div>
              ${isOwned
                ? `<span class="text-[9px] font-bold text-green-400">✓ Rendita attiva</span>`
                : `<button onclick="window.doBuyRealEstate('${l.id}')"
                     class="btn-gold !text-[9px] !py-1.5 !px-3 ${canAfford ? '' : 'opacity-40 cursor-not-allowed'}"
                     ${canAfford ? '' : 'disabled'}>
                     Acquista
                   </button>`
              }
            </div>
            ${!isOwned && !canAfford ? `<div class="text-[8px] text-red-400 text-right mt-1">Mancano €${((l.cost||0) - gameState.cash).toLocaleString('it-IT')}</div>` : ''}
          </div>
        </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
}

window.doBuyRealEstate = async function(listingId) {
    const result = await ServerState.buyRealEstate(listingId);
    if (result?.success) {
        showBigEvent('🏛', `${result.name} Acquistata!`, `Rendita: €${(result.daily_rent||0).toLocaleString()}/giorno`);
        renderTabRealEstate();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    setupDragAndDrop();
    _initGlobalNewsFeed();
    if (_isMobile()) {
        document.body.classList.add('mobile-mode');
        const sidebar = document.querySelector('nav.fixed.left-4');
        if (sidebar) sidebar.style.display = 'none';
        if (typeof window.renderMobileDispatcher === 'function') {
            window.renderMobileDispatcher();
        }
    }
});

// ─── MONEY PARTICLES ────────────────────────────────────────────
window.spawnMoneyParticles = function(x, y, amount) {
    const count = Math.min(20, Math.max(8, Math.floor(amount / 500)));
    const labels = amount >= 10000 ? ['💰', `+€${Math.floor(amount/1000)}k`] : ['€', `+€${amount}`];
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'money-particle';
        el.textContent = labels[Math.floor(Math.random() * labels.length)];
        const spread = 60;
        el.style.left = `${x + (Math.random() - 0.5) * spread}px`;
        el.style.top  = `${y + (Math.random() - 0.5) * 20}px`;
        el.style.animationDelay = `${Math.random() * 0.3}s`;
        el.style.animationDuration = `${0.8 + Math.random() * 0.6}s`;
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
    }
};

// ─── DAY/NIGHT CYCLE ────────────────────────────────────────────
let _lastNightState = null;
function _updateDayNight() {
    const h = gameState.hour;
    const isNight = h >= 19 || h < 7;
    if (isNight === _lastNightState) return;
    _lastNightState = isNight;
    const overlay = document.getElementById('night-overlay');
    if (overlay) overlay.style.background = isNight ? 'rgba(0,0,20,0.18)' : 'rgba(0,0,20,0)';
    // Sky atmosphere sun angle
    if (map && _mapReady && map.getLayer('sky')) {
        const sunAngle = isNight ? [0.0, 110.0] : [0.0, 90.0];
        try { map.setPaintProperty('sky', 'sky-atmosphere-sun', sunAngle); } catch(e) {}
    }
}
window._updateDayNight = _updateDayNight;

// ─── HQ MARKER ──────────────────────────────────────────────────
let _hqMarker = null;
const _HQ_MARKER_STYLES = [
    { icon:'🛖', label:'Garage',   style:'border:2px solid #555;background:rgba(20,20,30,0.9);' },
    { icon:'🏢', label:'Ufficio',  style:'border:2px solid #00f2ff;background:rgba(0,20,40,0.9);box-shadow:0 0 10px #00f2ff88;' },
    { icon:'🏛️', label:'Campus',   style:'border:2px solid #22c55e;background:rgba(0,30,10,0.9);animation:hqPulse 2s infinite;' },
    { icon:'🏙️', label:'Tower',    style:'border:2px solid #d4af37;background:rgba(20,15,0,0.95);animation:hqGlow 2s infinite;' },
];

window._updateHQMarker = function() {
    if (!map || !_mapReady) return;
    const hq = gameState.hq;
    if (!hq || hq.lng === null) return;

    if (_hqMarker) _hqMarker.remove();

    const lvl = Math.min(3, Math.max(0, hq.level || 0));
    const cfg = _HQ_MARKER_STYLES[lvl];
    const el = document.createElement('div');
    el.style.cssText = `${cfg.style}border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;`;
    el.title = `${cfg.label} — ${hq.name || 'HQ'}`;
    el.textContent = cfg.icon;
    el.onclick = () => window.flyToHQ();

    _hqMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([hq.lng, hq.lat])
        .addTo(map);
};

window.flyToHQ = function() {
    const hq = gameState.hq;
    if (!map || !hq || hq.lng === null) return;
    map.flyTo({ center: [hq.lng, hq.lat], zoom: 14, pitch: 60, bearing: -20, duration: 2500, essential: true });
};

// ─── COMPANY FOUNDING OVERLAY ────────────────────────────────────
let _foundingMode = false;
window._checkFoundingOverlay = function() {
    if ((gameState.unlockedRegions || []).length > 0) return; // already founded
    let ov = document.getElementById('founding-overlay');
    if (ov) return; // already shown
    ov = document.createElement('div');
    ov.id = 'founding-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,10,0.92);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:center;';
    ov.innerHTML = `
        <div style="text-align:center;max-width:520px;padding:32px;">
            <div style="font-size:4rem;margin-bottom:16px;">🏢</div>
            <h1 style="font-size:2rem;font-weight:900;color:#d4af37;text-transform:uppercase;letter-spacing:4px;margin-bottom:12px;">SCEGLI LA TUA SEDE</h1>
            <p style="color:#9ca3af;font-size:0.9rem;line-height:1.7;margin-bottom:32px;">Ogni grande impero inizia con un indirizzo. Clicca su qualsiasi punto della mappa italiana per fondare la tua Agenzia NCC. La regione sarà tua, gratuitamente.</p>
            <button onclick="window._startFoundingMode()" style="padding:16px 40px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.6);border-radius:12px;color:#d4af37;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:2px;text-transform:uppercase;">📍 Scegli sulla Mappa</button>
        </div>`;
    document.body.appendChild(ov);
};

window._startFoundingMode = function() {
    _foundingMode = true;
    const ov = document.getElementById('founding-overlay');
    if (ov) ov.innerHTML = `
        <div style="text-align:center;max-width:480px;padding:24px;">
            <div style="font-size:2.5rem;margin-bottom:12px;">📍</div>
            <h2 style="font-size:1.3rem;font-weight:900;color:#d4af37;letter-spacing:3px;text-transform:uppercase;">Clicca sulla Mappa</h2>
            <p style="color:#6b7280;margin-top:8px;font-size:0.85rem;">Scegli la posizione della tua sede centrale</p>
            <button onclick="window._cancelFoundingMode()" style="margin-top:20px;padding:8px 24px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:8px;color:#ef4444;font-size:0.8rem;cursor:pointer;">✕ Annulla</button>
        </div>`;

    map.once('click', (e) => {
        if (!_foundingMode) return;
        _foundingMode = false;
        const lng = e.lngLat.lng, lat = e.lngLat.lat;
        const name = prompt('Dai un nome alla tua sede (es: Via Nazionale 12, Roma):', 'Sede Principale') || 'Sede Principale';
        const ov2 = document.getElementById('founding-overlay');
        if (ov2) ov2.remove();
        window.foundCompany(lng, lat, name);
        map.flyTo({ center: [lng, lat], zoom: 12, pitch: 55, bearing: -15, duration: 2000, essential: true });
    });
};

window._cancelFoundingMode = function() {
    _foundingMode = false;
    const ov = document.getElementById('founding-overlay');
    if (ov) ov.remove();
    window._checkFoundingOverlay();
};

// ─── TRAFFIC COLOR ON ROUTE LINES ───────────────────────────────
function _updateActiveRouteLinesColored() {
    if (!map || !_mapReady) return;
    const normalFeatures  = [];
    const trafficFeatures = [];
    (gameState.activeRides || []).forEach(r => {
        if (!r.roadGeom || r.roadGeom.length < 2) return;
        const feat = { type: 'Feature', properties: { rideId: r.id }, geometry: { type: 'LineString', coordinates: r.roadGeom } };
        if (r.inTraffic) trafficFeatures.push(feat);
        else normalFeatures.push(feat);
    });
    const allFeatures = [...normalFeatures, ...trafficFeatures];
    const src = map.getSource('active-routes');
    if (src) src.setData({ type: 'FeatureCollection', features: allFeatures });

    // Update glow/core colors for traffic rides
    try {
        const hasTraffic = trafficFeatures.length > 0;
        if (hasTraffic && map.getLayer('active-routes-glow')) {
            map.setPaintProperty('active-routes-glow', 'line-color', '#ff4060');
            map.setPaintProperty('active-routes-core', 'line-color', '#ff6080');
            setTimeout(() => {
                if (!map || !map.getSource('active-routes')) return;
                if (trafficFeatures.length === 0) {
                    try { map.setPaintProperty('active-routes-glow', 'line-color', '#f59e0b'); } catch(e) {}
                    try { map.setPaintProperty('active-routes-core', 'line-color', '#fbbf24'); } catch(e) {}
                }
            }, 3000);
        }
    } catch(e) {}
}

// Hook into the visual loop — replace the old call
const _origVisualLoopUpdateRoutes = window._updateActiveRouteLines;
window._updateActiveRouteLines = _updateActiveRouteLinesColored;

// ─── ACCADEMIA AUTISTI MODAL ─────────────────────────────────────
window.openAcademyModal = function() {
    document.getElementById('academy-modal')?.remove();

    const courses = typeof ACADEMY_COURSES !== 'undefined' ? ACADEMY_COURSES
                  : (typeof window.ACADEMY_COURSES !== 'undefined' ? window.ACADEMY_COURSES : []);
    const drivers = (gameState.drivers || []).filter(d => d.id !== 'ceo');
    const curH    = gameState.day * 24 + gameState.hour;

    const modal = document.createElement('div');
    modal.id    = 'academy-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';

    const renderModal = (selectedDriverId) => {
        const selDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];
        const inTraining = selDriver ? (gameState.driverAcademy||[]).find(c => c.driverId === selDriver.id) : null;

        modal.innerHTML = `
<div style="width:100%;max-width:820px;max-height:90vh;border-radius:20px;background:#0d0d14;border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,0.9)">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 28px 16px;border-bottom:1px solid rgba(255,255,255,0.07)">
    <div>
      <div style="font-size:13px;font-weight:800;color:#f3f4f6;letter-spacing:.04em">🎓 Accademia Autisti</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Seleziona un autista e iscrivilo a un corso</div>
    </div>
    <button onclick="document.getElementById('academy-modal').remove()"
      style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#6b7280;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
  </div>

  <div style="display:flex;flex:1;overflow:hidden;min-height:0">

    <!-- LEFT: driver list -->
    <div style="width:220px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.06);overflow-y:auto;padding:12px;scrollbar-width:thin;scrollbar-color:#2a2a30 transparent">
      ${drivers.map(d => {
        const training = (gameState.driverAcademy||[]).find(c => c.driverId === d.id);
        const hoursLeft = training ? Math.max(0, Math.ceil(training.completesHour - curH)) : 0;
        const isSel     = selDriver && d.id === selDriver.id;
        const statusColor = training ? '#facc15' : d.status === 'resting' ? '#60a5fa' : d.status === 'busy' ? '#4ade80' : '#9ca3af';
        const statusIcon  = training ? '📚' : d.status === 'resting' ? '😴' : d.status === 'busy' ? '🚗' : '✓';
        return `<button onclick="window._academySelectDriver('${d.id}')"
          style="width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid ${isSel ? 'rgba(212,175,55,0.55)' : 'rgba(255,255,255,0.06)'};background:${isSel ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)'};margin-bottom:6px;cursor:pointer;transition:all .15s">
          <div style="font-size:11px;font-weight:700;color:${isSel ? '#d4af37' : '#e5e7eb'};margin-bottom:3px">${d.name}</div>
          <div style="font-size:9px;color:${statusColor}">${statusIcon} ${training ? training.courseName + ' — ' + hoursLeft + 'h' : d.status === 'busy' ? 'In servizio' : d.status === 'resting' ? 'A riposo' : 'Disponibile'}</div>
          <div style="font-size:8px;color:#4b5563;margin-top:2px">${d.tier?.toUpperCase() || ''} · ⭐ ${d.salary?.toLocaleString()}/g</div>
        </button>`;
      }).join('')}
    </div>

    <!-- RIGHT: courses -->
    <div style="flex:1;overflow-y:auto;padding:20px 24px;scrollbar-width:thin;scrollbar-color:#2a2a30 transparent">
      ${!selDriver ? '<div style="color:#4b5563;font-size:12px;text-align:center;padding-top:60px">Nessun autista disponibile</div>' : `
      <div style="font-size:13px;font-weight:800;color:#f3f4f6;margin-bottom:4px">${selDriver.name}</div>
      <div style="font-size:9px;color:#6b7280;margin-bottom:18px">${selDriver.tier?.toUpperCase() || ''} · Stipendio €${selDriver.salary?.toLocaleString()}/g</div>

      ${inTraining ? `
      <div style="background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.25);border-radius:12px;padding:18px 20px">
        <div style="font-size:11px;font-weight:800;color:#facc15;margin-bottom:4px">📚 In Formazione</div>
        <div style="font-size:13px;font-weight:700;color:#f3f4f6;margin-bottom:6px">${inTraining.courseName}</div>
        <div style="font-size:10px;color:#9ca3af">Completamento tra <strong style="color:#facc15">${Math.max(0, Math.ceil(inTraining.completesHour - curH))} ore</strong></div>
        <div style="margin-top:14px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden;height:4px">
          <div style="height:100%;background:#d4af37;width:${Math.max(5,Math.min(100,(1-(Math.max(0,inTraining.completesHour-curH)/(courses.find(c=>c.id==(inTraining.skill||'lang'))?.hours||8)))*100))}%"></div>
        </div>
      </div>` : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${courses.map(c => {
          const canAfford = gameState.cash >= c.cost;
          const notBusy   = selDriver.status !== 'busy';
          const enabled   = canAfford && notBusy;
          return `<button onclick="startAcademyCourse('${selDriver.id}','${c.id}');window.openAcademyModal()"
            style="text-align:left;padding:16px 18px;border-radius:14px;border:1px solid ${enabled ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.06)'};background:${enabled ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)'};cursor:${enabled ? 'pointer' : 'not-allowed'};opacity:${enabled ? '1' : '0.45'};transition:all .15s"
            ${enabled ? '' : 'disabled'}>
            <div style="font-size:11px;font-weight:800;color:${enabled ? '#f3f4f6' : '#6b7280'};margin-bottom:2px">${c.name}</div>
            <div style="font-size:9px;color:#9ca3af;margin-bottom:8px;line-height:1.5">${c.desc}</div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:11px;font-weight:700;color:#d4af37;font-family:monospace">€${c.cost.toLocaleString()}</span>
              <span style="font-size:9px;color:#4b5563">⏱ ${c.hours}h</span>
            </div>
            ${!canAfford ? '<div style="font-size:8px;color:#ef4444;margin-top:4px">Fondi insufficienti</div>' : ''}
            ${!notBusy ? '<div style="font-size:8px;color:#ef4444;margin-top:4px">Autista in servizio</div>' : ''}
          </button>`;
        }).join('')}
      </div>`}
      `}
    </div>
  </div>
</div>`;
    };

    window._academySelectDriver = (dId) => renderModal(dId);
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    renderModal(drivers[0]?.id || null);
};

// ─── TRAIT BADGE HELPER ──────────────────────────────────────────
window._traitBadgeHTML = function(driver) {
    const trait = driver.trait;
    if (!trait) return '';
    const bgColor = trait.badge === 'pregi' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
    const border  = trait.badge === 'pregi' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
    return `<span style="background:${bgColor};border:1px solid ${border};color:${trait.color || '#fff'};font-size:8px;padding:1px 5px;border-radius:4px;display:inline-block;margin-top:2px;">${trait.name}</span>`;
};
