'use strict';
/* ================================================================
   map.js — Chauffeur Empire
   Mapbox GL JS: initMap, visual loop, vehicle markers, trails,
   incident/checkpoint markers, garage 3D SVG, highway router.
   Dipendenze: dispatcher.js (gameState, showNotification),
   geoCoords.js, routesDB.js
   ================================================================ */

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

