'use strict';
/* ================================================================
   map.js — Chauffeur Empire
   Mapbox GL JS: initMap, visual loop, vehicle markers, trails,
   incident/checkpoint markers, garage 3D SVG, highway router.
   Dipendenze: dispatcher.js (gameState, showNotification),
   geoCoords.js, routesDB.js
   ================================================================ */

// ─── MAPBOX GL JS MAP ────────────────────────────────────────────
// Token PUBBLICO 'pk.' dedicato "chauffeur-empire-web", RISTRETTO PER DOMINIO
// (allowedUrls: normally101.github.io, chauffeurempire.com, www., localhost).
// Verificato: i domini non autorizzati ricevono 403 sui tile/render → niente
// furto di quota. Scope read-only (styles/fonts/tiles/datasets/vision read).
// Se aggiungi un nuovo dominio di hosting, aggiorna gli allowedUrls del token su Mapbox.
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZm9yZWlzYmFieSIsImEiOiJjbXE4anVidzAwOXRnMnNzZDF0cTljdHFhIn0.xQWjWXFRai5EgZA6Ah_V_g';
var map = null; // var so window.map is accessible from all scripts (ui-meta.js etc.)
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
window._updateActiveRouteLines = _updateActiveRouteLines;

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


// ─── REGISTRAZIONE COME BACKEND DELLA MAPPA ──────────────────────
// Il gioco non chiama piu' queste funzioni per nome: chiede a MapBackend.
// Qui map.js si presenta al registro come l'implementazione 'mapbox'.
// Vedi map-api.js per il perche'.
let _onceClickHandler = null;

if (window.MapBackend) {
    window.MapBackend.register('mapbox', {
        ensure:  _ensureMap,
        destroy: () => { _onceClickHandler = null; _destroyMap(); },
        isReady: () => !!map && _mapReady,

        drawHighways,
        drawPOIs,
        updateRouteLines: _updateActiveRouteLines,
        updateVehicles:   _updateVehicleLayer,
        updateHQMarker:   () => { if (typeof window._updateHQMarker === 'function') window._updateHQMarker(); },
        flyToHQ:          () => { if (typeof window.flyToHQ === 'function') window.flyToHQ(); },
        dayNight:         () => { if (typeof window._updateDayNight === 'function') window._updateDayNight(); },

        onceMapClick(cb) {
            if (!map) return false;
            _onceClickHandler = (e) => {
                _onceClickHandler = null;
                cb(e.lngLat.lng, e.lngLat.lat);
            };
            map.once('click', _onceClickHandler);
            return true;
        },
        cancelMapClick() {
            if (map && _onceClickHandler) { map.off('click', _onceClickHandler); }
            _onceClickHandler = null;
        }
    });
    window.MapBackend.use('mapbox');
}
