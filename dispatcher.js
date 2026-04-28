'use strict';
/* ================================================================
   dispatcher.js — Olga Vision Agency · RECOVERY PARTE 1
   ================================================================ */

const styleFix = document.createElement('style');
styleFix.innerHTML = `
    .leaflet-marker-icon { transition: none !important; } 
    .car-arrow { transition: none !important; }
    .ride-progress-fill { transition: width 0.1s linear !important; }
`;
document.head.appendChild(styleFix);

let map = null; 
let _poiMarkers = {}; 
let _vehicleMarkers = {}; 
let _routeLines = {};

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

function initMap() {
    if (map) return;
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

        _mapReady = true;
        drawHighways();
        drawPOIs();
        // Secondo render ritardato: assicura che highway e POI siano visibili
        // anche se il tile-load è lento o lo stato del gioco si carica dopo
        setTimeout(() => { drawHighways(); drawPOIs(); }, 800);
        setTimeout(() => { drawHighways(); drawPOIs(); }, 2500);
    });
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
    setTimeout(() => marker.remove(), 60000);
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
    setTimeout(() => { marker.remove(); delete _checkpointMarkers[rideId]; }, 90000);
};
window.removeCheckpointMarker = function(rideId) {
    if (_checkpointMarkers[rideId]) { _checkpointMarkers[rideId].remove(); delete _checkpointMarkers[rideId]; }
};

// ─── VISUAL LOOP (Mapbox vehicle markers) ────────────────────────
function visualLoop() {
    requestAnimationFrame(visualLoop);
    if (!map || !_mapReady || !gameState || gameState.paused) return;
    const now = Date.now();

    gameState.activeRides.forEach(ride => {
        if (!ride.lastVisualUpdate) ride.lastVisualUpdate = now;
        const delta = now - ride.lastVisualUpdate;
        ride.lastVisualUpdate = now;
        if (!ride.visualElapsed) ride.visualElapsed = ride.elapsed;
        ride.visualElapsed += delta * (5000 / 600);
        if (Math.abs(ride.visualElapsed - ride.elapsed) > 5000) ride.visualElapsed = ride.elapsed;

        // Progress bar update (UI element)
        const bar = document.getElementById(`prog-${ride.driverId}`);
        if (bar) bar.style.width = `${Math.min(100, (ride.visualElapsed / ride.duration) * 100)}%`;

        // Position interpolation (returns [lat, lng] Leaflet-style)
        const pos = calculateInterpolatedPosition(ride, ride.visualElapsed);
        if (!pos) return;

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

        if (!_vehicleMarkers[ride.id]) {
            const wrap = document.createElement('div');
            wrap.className = 'car-marker-wrap';
            const arrow = document.createElement('div');
            arrow.className = 'car-arrow';
            arrow.style.transform = `rotate(${angle}deg)`;
            wrap.appendChild(arrow);
            _vehicleMarkers[ride.id] = new mapboxgl.Marker({ element: wrap })
                .setLngLat([pos[1], pos[0]])   // [lng, lat]
                .addTo(map);
        } else {
            _vehicleMarkers[ride.id].setLngLat([pos[1], pos[0]]);
            const arrow = _vehicleMarkers[ride.id].getElement()?.querySelector('.car-arrow');
            if (arrow) arrow.style.transform = `rotate(${angle}deg)`;
        }
    });

    // Cleanup markers for finished rides
    for (const id in _vehicleMarkers) {
        if (!gameState.activeRides.find(r => r.id == id)) {
            _vehicleMarkers[id].remove();
            delete _vehicleMarkers[id];
        }
    }
}
visualLoop();

// ─── THREE.JS GARAGE 3D ──────────────────────────────────────────
let _g3d = null; // garage 3D state

window.openGarage3D = function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car || typeof THREE === 'undefined') {
        if (typeof showNotification === 'function') showNotification('Three.js non disponibile', 'error');
        return;
    }
    document.getElementById('garage3d-title').innerText = `🚗 ${car.name}`;
    document.getElementById('modal-garage3d').classList.remove('hidden');
    document.getElementById('modal-garage3d').classList.add('flex');

    // Stats panel
    const fuelPct = Math.floor(car.fuel || 100);
    const tirePct = Math.floor(car.tirePressure !== undefined ? car.tirePressure : 100);
    const upgCount = (car.upgrades || []).length;
    document.getElementById('garage3d-info').innerHTML = `
        <div class="hud-card text-center !py-1.5"><div class="text-[8px] text-gray-500">Carburante</div><div class="font-bold text-blue" style="font-size:11px">${fuelPct}%</div></div>
        <div class="hud-card text-center !py-1.5"><div class="text-[8px] text-gray-500">Gomme</div><div class="font-bold ${tirePct<40?'text-red-400':tirePct<70?'text-yellow-400':'text-green-400'}" style="font-size:11px">${tirePct}%</div></div>
        <div class="hud-card text-center !py-1.5"><div class="text-[8px] text-gray-500">Upgrade</div><div class="font-bold text-gold" style="font-size:11px">${upgCount}</div></div>`;

    _initThreeJSScene(car);
};

window.closeGarage3D = function() {
    const modal = document.getElementById('modal-garage3d');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    // Stop animation
    if (_g3d) { _g3d.running = false; _g3d = null; }
    const container = document.getElementById('garage3d-canvas');
    if (container) container.innerHTML = '';
};

function _initThreeJSScene(car) {
    const container = document.getElementById('garage3d-canvas');
    if (!container) return;
    container.innerHTML = '';

    // Scene setup
    const W = container.offsetWidth, H = 300;
    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.Fog(0x050510, 20, 60);

    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(4, 2.5, 5);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0x202040, 3);
    scene.add(ambient);

    const frontLight = new THREE.DirectionalLight(0x00f2ff, 4);
    frontLight.position.set(5, 6, 6);
    frontLight.castShadow = true;
    frontLight.shadow.mapSize.set(512, 512);
    scene.add(frontLight);

    const backLight = new THREE.DirectionalLight(0xd4af37, 2);
    backLight.position.set(-4, 3, -4);
    scene.add(backLight);

    const rimLight = new THREE.PointLight(0x00f2ff, 2, 12);
    rimLight.position.set(-3, 1, 3);
    scene.add(rimLight);

    // Floor grid
    const grid = new THREE.GridHelper(20, 40, 0x001a2a, 0x001a2a);
    grid.position.y = -0.3;
    scene.add(grid);

    // Car group
    const carGroup = new THREE.Group();

    // Tier-based color
    const tierColors = { standard: 0x1a3a6a, business: 0x0d2d4a, vip: 0x2a0045, ultra: 0x0a0a1a, group: 0x1a4a2a };
    const baseColor  = tierColors[car.tier] || 0x1a3a6a;

    // Check upgrades
    const hasLivrea    = (car.upgrades || []).includes('livrea') || (car.upgrades || []).includes('cerchi');
    const hasBlindatura = (car.upgrades || []).includes('blindatura');
    const paintColor   = hasLivrea ? 0x001a4a : baseColor;

    const bodyMat = new THREE.MeshPhongMaterial({
        color: paintColor,
        shininess: hasBlindatura ? 30 : 120,
        specular: hasLivrea ? 0x00f2ff : 0x3399aa,
        reflectivity: 1
    });

    // Body
    const bodyGeo = new THREE.BoxGeometry(2.6, 0.55, 1.1);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.38;
    body.castShadow = true;
    carGroup.add(body);

    // Roof / cabin
    const roofGeo = new THREE.BoxGeometry(1.5, 0.45, 0.9);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(-0.15, 0.84, 0);
    roof.castShadow = true;
    carGroup.add(roof);

    // Windshield (dark glass)
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x001a22, transparent: true, opacity: 0.7, shininess: 200 });
    const windshieldGeo = new THREE.BoxGeometry(0.04, 0.38, 0.82);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0.61, 0.78, 0);
    carGroup.add(windshield);

    const rearGlassGeo = new THREE.BoxGeometry(0.04, 0.38, 0.82);
    const rearGlass = new THREE.Mesh(rearGlassGeo, glassMat);
    rearGlass.position.set(-0.91, 0.78, 0);
    carGroup.add(rearGlass);

    // Wheels (4 cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 20);
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 40 });
    const rimMat   = new THREE.MeshPhongMaterial({ color: (car.upgrades||[]).includes('cerchi') ? 0xd4af37 : 0x444466, shininess: 200 });
    const rimGeo   = new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10);

    const wheelPositions = [
        [0.85, 0.10, 0.60], [-0.85, 0.10, 0.60],
        [0.85, 0.10, -0.60], [-0.85, 0.10, -0.60]
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.castShadow = true;
        carGroup.add(wheel);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(pos[0] + (pos[2] > 0 ? 0.02 : -0.02), pos[1], pos[2]);
        carGroup.add(rim);
    });

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.06, 0.10, 0.22);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.3, 0.3].forEach(z => {
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(1.32, 0.40, z);
        carGroup.add(light);
    });

    // Neon underglow if livrea upgrade
    if (hasLivrea) {
        const underglowGeo = new THREE.BoxGeometry(2.4, 0.04, 0.9);
        const underglowMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });
        const underglow = new THREE.Mesh(underglowGeo, underglowMat);
        underglow.position.set(0, -0.01, 0);
        carGroup.add(underglow);
        const pointLight = new THREE.PointLight(0x00f2ff, 3, 3);
        pointLight.position.set(0, -0.15, 0);
        carGroup.add(pointLight);
    }

    // Armor plates if blindatura
    if (hasBlindatura) {
        const armorGeo = new THREE.BoxGeometry(2.65, 0.08, 1.15);
        const armorMat = new THREE.MeshPhongMaterial({ color: 0x1a1a2a, shininess: 5 });
        const armor = new THREE.Mesh(armorGeo, armorMat);
        armor.position.y = 0.62;
        carGroup.add(armor);
    }

    carGroup.position.y = 0.22;
    scene.add(carGroup);

    // Mouse drag rotation
    let isDragging = false, prevMouse = { x: 0, y: 0 };
    let rotY = 0.3, rotX = 0.08;
    let zoomDist = 5;

    renderer.domElement.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => { isDragging = false; });
    renderer.domElement.addEventListener('mousemove', e => {
        if (!isDragging) return;
        rotY += (e.clientX - prevMouse.x) * 0.012;
        rotX  = Math.max(-0.3, Math.min(0.7, rotX + (e.clientY - prevMouse.y) * 0.008));
        prevMouse = { x: e.clientX, y: e.clientY };
    });
    renderer.domElement.addEventListener('wheel', e => {
        zoomDist = Math.max(2.5, Math.min(10, zoomDist + e.deltaY * 0.006));
        e.preventDefault();
    }, { passive: false });

    // Touch support
    let lastTouch = null;
    renderer.domElement.addEventListener('touchstart', e => { lastTouch = e.touches[0]; });
    renderer.domElement.addEventListener('touchmove', e => {
        if (!lastTouch) return;
        rotY += (e.touches[0].clientX - lastTouch.clientX) * 0.012;
        lastTouch = e.touches[0];
        e.preventDefault();
    }, { passive: false });

    // Animate
    const state = { running: true };
    _g3d = state;

    function animate() {
        if (!state.running) return;
        requestAnimationFrame(animate);
        if (!isDragging) rotY += 0.005;
        carGroup.rotation.y = rotY;
        carGroup.rotation.x = rotX;
        camera.position.x = Math.sin(rotY * 0.5) * zoomDist * 0.3 + 4;
        camera.position.z = zoomDist;
        camera.lookAt(0, 0.5, 0);
        rimLight.position.x = Math.sin(Date.now() * 0.001) * 3;
        renderer.render(scene, camera);
    }
    animate();
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

    // Cache computed waypoints for this ride instance
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

window.switchTab = function(tab) {
    _activeTab = tab;
    const container = document.getElementById('tab-container');
    const title = document.getElementById('panel-title');
    const mapLog = document.getElementById('live-map-overlay');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    if(tab === 'map') { 
        mapLog.classList.remove('hidden'); mapLog.classList.add('flex'); 
    } else { 
        mapLog.classList.add('hidden'); mapLog.classList.remove('flex'); 
    }

    switch(tab) {
        case 'corse': title.innerText = "Dispatch Center"; renderTabCorse(); break;
        case 'ranking': title.innerText = "Global Ranking"; renderTabRanking(); break;
        case 'staff': title.innerText = "Risorse Umane"; renderTabStaff(); break;
        case 'fleet': title.innerText = "Gestione Flotta"; renderTabFleet(); break;
        case 'emails': title.innerText = "Inbox CEO"; renderTabEmails(); break;
        case 'regions': title.innerText = "Licenze Regioni"; renderTabRegions(); break;
        case 'invest': title.innerText = "Patrimonio & Asset"; renderTabInvestments(); break;
        case 'marketing': title.innerText = "Marketing & Brand"; renderTabMarketing(); break;
        case 'legal':    title.innerText = "Ufficio Legale"; renderTabLegal(); break;
        case 'finance':  title.innerText = "$WALL-ST · Finance"; renderTabFinance(); break;
        case 'lifestyle': title.innerText = "Lifestyle & Empire"; renderTabLifestyle(); break;
        case 'politics': title.innerText = "Politica & Lobbying"; renderTabPolitics(); break;
        case 'map': title.innerText = "Radar Live"; {
            const heat = gameState.policeHeat || 0;
            const heatColor = heat >= 80 ? '#ff4060' : heat >= 50 ? '#f59e0b' : '#22c55e';
            const ev = gameState.activeDynamicEvent;
            const evBanner = ev
                ? `<div class="hud-card border-gold/40 bg-gold/5 mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${ev.icon}</span>
                        <div class="flex-1 min-w-0">
                            <div class="text-[10px] font-bold text-gold">${ev.name}</div>
                            <div class="text-[9px] text-gray-400">×${ev.priceMult.toFixed(1)} prezzi · ${Math.max(0, ev.endsHour - (gameState.day*24+gameState.hour))}h rimaste</div>
                        </div>
                    </div>
                   </div>`
                : '';
            container.innerHTML = `
                ${evBanner}
                <div class="text-[10px] text-gray-500 text-center mt-4 uppercase tracking-widest">Sistemi Radar Operativi</div>
                <div class="mt-4 space-y-2 px-2">
                    <div class="hud-card text-center">
                        <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Traffico Ora</div>
                        <div id="map-traffic-label" class="text-sm font-bold text-white">—</div>
                    </div>
                    <div class="hud-card">
                        <div class="flex justify-between text-[9px] mb-1">
                            <span class="text-gray-500 uppercase tracking-widest">Allerta Polizia</span>
                            <span style="color:${heatColor}" class="font-bold font-mono">${Math.round(heat)}%</span>
                        </div>
                        <div class="w-full h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                            <div style="width:${heat}%;height:100%;background:${heatColor};border-radius:4px;transition:width 0.4s ease;box-shadow:0 0 6px ${heatColor}"></div>
                        </div>
                        ${heat >= 80 ? '<div class="text-[8px] text-red-400 mt-1">⚠ Rischio checkpoint attivo!</div>' : ''}
                    </div>
                </div>
                <div class="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button onclick="resetGame()" class="text-[9px] border border-red-900/40 text-red-500/60 px-3 py-1.5 rounded-lg hover:border-red-500/60 hover:text-red-400 transition-colors">⚠ Reset Partita</button>
                </div>`;
            _updateTrafficLabel();
        }
        break;
    }
}

function renderTabCorse() {
    const container = document.getElementById('tab-container');
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
                    ${driver.trait ? `<div class="text-[8px] text-purple-400 font-semibold mt-0.5">${driver.trait.name} — ${driver.trait.desc}</div>` : ''}
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

function renderTabRanking() {
    const container = document.getElementById('tab-container');
    // Assicura che ogni rivale abbia lo stato simulato
    RIVALS.forEach(r => {
        if (r.drivers  === undefined) r.drivers  = Math.max(1, Math.round(r.rep));
        if (r.fleet    === undefined) r.fleet    = Math.max(1, Math.round(r.rep * 0.8));
        if (r.missions === undefined) r.missions = 0;
    });
    const myName = (gameState.companyName || 'Olga Vision') + ' (Tu)';
    const myAgency = { name: myName, rep: gameState.reputation, cash: gameState.cash, me: true,
        drivers: gameState.drivers.filter(d => d.id !== 'ceo').length, fleet: gameState.fleet.length, missions: null };
    const slotRivals = typeof window.getSharedSlotRivals === 'function' ? window.getSharedSlotRivals() : [];
    const all = [...RIVALS, ...slotRivals, myAgency].sort((a,b) => b.rep - a.rep);
    const myRank = all.findIndex(a => a.me) + 1;
    const total  = all.length;

    const rankIcon  = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : myRank === total ? '🔴' : '⬜';
    const rankColor = myRank <= 3 ? 'text-gold' : myRank === total ? 'text-red-400' : 'text-gray-300';

    // Build perks / warnings for current rank
    let statusHtml = '';
    if (myRank <= 3) {
        statusHtml = `
        <div class="hud-card !border-gold/40 bg-gold/5 mb-4">
            <div class="text-[9px] text-gold font-bold uppercase tracking-widest mb-2">✨ Bonus Top ${myRank}</div>
            <ul class="text-[9px] text-gray-300 space-y-1">
                <li>🚗 Corse Ultra-Luxury accessibili</li>
                <li>🛡 Premi assicurativi −15% su tutta la flotta</li>
                <li>📍 POI esclusivi visibili (Porto Cervo, Armani Hotel)</li>
            </ul>
        </div>`;
    } else if (myRank === total) {
        statusHtml = `
        <div class="hud-card !border-red-500/40 bg-red-950/20 mb-4">
            <div class="text-[9px] text-red-400 font-bold uppercase tracking-widest mb-2">⚠ Ultimo in Classifica</div>
            <ul class="text-[9px] text-gray-400 space-y-1">
                <li>💼 I rivali possono rubarti gli autisti migliori</li>
                <li>🔒 POI esclusivi non accessibili</li>
                <li>📉 Risali per sbloccare i bonus</li>
            </ul>
        </div>`;
    } else {
        statusHtml = `
        <div class="hud-card mb-4">
            <div class="text-[9px] text-gray-400 uppercase tracking-widest">Posizione #${myRank} / ${total}</div>
            <div class="text-[9px] text-gray-500 mt-1">Scala al Top 3 per sbloccare i bonus Elite.</div>
        </div>`;
    }

    let html = `
    <div class="flex items-center gap-3 mb-4">
        <div class="text-3xl">${rankIcon}</div>
        <div>
            <div class="text-[9px] text-gray-500 uppercase">La tua posizione</div>
            <div class="font-bold text-lg ${rankColor}">#${myRank} di ${total}</div>
        </div>
    </div>
    ${statusHtml}
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Campionato Agenzie VIP</h3>
    <div class="space-y-2">`;

    all.forEach((a, i) => {
        const pos = i + 1;
        const posIcon = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
        const repDelta = (i > 0 && !a.me) ? ` <span style="color:#555;font-size:9px">(−${(all[i-1].rep - a.rep).toFixed(1)}★)</span>` : '';
        const fleetLine = `🚗 ${a.fleet}  👤 ${a.drivers}${a.missions !== null ? `  ✅ ${a.missions}` : ''}`;
        const threatLabel = (!a.me && a.rep > gameState.reputation && a.cash > gameState.cash * 2)
            ? '<span style="color:#ff4060;font-size:8px;font-weight:700"> ⚠ MINACCIA</span>' : '';
        html += `
        <div class="hud-card ${a.me ? '!border-gold/50 bg-gold/5' : ''} flex justify-between items-center py-2">
            <div class="flex items-center gap-3">
                <div style="font-size:18px;width:28px;text-align:center">${posIcon}</div>
                <div>
                    <div style="font-size:12px;font-weight:700;color:${a.me ? '#d4af37' : a.isSlotRival ? '#a78bfa' : '#e8eaf0'}">${a.isSlotRival ? (a.logo || '⊞') + ' ' : ''}${a.name}${threatLabel}</div>
                    <div style="font-size:10px;color:#6b7280">€${Math.floor(a.cash).toLocaleString()}${repDelta}</div>
                    <div style="font-size:9px;color:#4b5563">${fleetLine}</div>
                </div>
            </div>
            <div style="font-family:'Roboto Mono',monospace;font-weight:700;color:#d4af37;font-size:15px">${a.rep.toFixed(1)} ★</div>
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

    container.innerHTML = html;
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
            ${outCount > 0 ? `<div class="text-[9px] text-red-400 font-bold mb-2 flex items-center gap-1">🔴 ${outCount} auto ferme — rifornisci il deposito!</div>` : ''}
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
            <div class="grid grid-cols-3 gap-1">
                <button onclick="buyTiresForDepot(1)"  class="btn-blue !text-[8px] !py-1">+1 set<br><span class="text-[7px] opacity-60">€800</span></button>
                <button onclick="buyTiresForDepot(5)"  class="btn-blue !text-[8px] !py-1">+5 set<br><span class="text-[7px] opacity-60">€3.500</span></button>
                <button onclick="buyTiresForDepot(10)" class="btn-gold !text-[8px] !py-1">+10 set<br><span class="text-[7px] opacity-60">€6.000</span></button>
            </div>
        </div>`;
    }

    let html = fuelDepotHtml + `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Tua Flotta</h3><div class="space-y-2 mb-6">`;
    
    gameState.fleet.forEach(car => {
        if (!car.upgrades) car.upgrades = [];
        const fuelPct = car.fuel !== undefined ? Math.floor(car.fuel) : 100;
        const fuelColor = fuelPct < 20 ? '#ff4060' : fuelPct < 50 ? '#f59e0b' : '#00f2ff';
        const upgradePills = car.upgrades.map(uid => {
            const u = CAR_UPGRADES.find(x => x.id === uid);
            return u ? `<span class="upgrade-pill">${u.name}</span>` : '';
        }).join(' ');
        const tirePct = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
        const tireColor = tirePct < 30 ? '#ff4060' : tirePct < 60 ? '#f59e0b' : '#22c55e';
        const outReason = car.outOfService;
        const outLabel = outReason === 'fuel'  ? '🔴 FERMA — Deposito Gasolio esaurito'
                       : outReason === 'tires' ? '🔴 FERMA — Deposito Gomme esaurito'
                       : null;
        const hasCentralina   = (car.upgrades||[]).includes('centralina');
        const hasSerbatoio    = (car.upgrades||[]).includes('serbatoio_ext');
        const hasVetriC       = (car.upgrades||[]).includes('vetri_oscurati');
        const tuningBadges    = [
            hasCentralina ? '<span style="background:rgba(0,242,255,0.12);color:#00f2ff;border:1px solid rgba(0,242,255,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🔧+28%</span>' : '',
            hasSerbatoio  ? '<span style="background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.3);font-size:8px;padding:1px 5px;border-radius:6px">⛽−55%</span>' : '',
            hasVetriC     ? '<span style="background:rgba(168,85,247,0.12);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🕶−65%</span>' : '',
        ].filter(Boolean).join(' ');
        html += `
        <div class="hud-card ${outReason ? '!border-red-500/50 bg-red-950/10' : ''}">
            <div class="flex justify-between items-center">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white truncate">${car.name} ${car.isLease ? '<span class="text-[8px] text-blue border border-blue/40 px-1 ml-1 rounded uppercase">Leasing</span>' : ''}</div>
                    <div class="text-[9px] text-gray-500">Salute: ${Math.floor(car.condition)}% · ${car.tier.toUpperCase()} · ${Math.floor((car.mileage||0)/1000)}k km${upgradePills ? ' · ' + upgradePills : ''}${(car.mileage||0) > 0 && (car.mileage||0) % 5000 < 300 ? ' <span class="text-orange-400">⚠ Tagliando</span>' : ''}</div>
                    ${tuningBadges ? `<div class="mt-0.5 flex gap-1 flex-wrap">${tuningBadges}</div>` : ''}
                    ${outLabel ? `<div class="text-[9px] text-red-400 font-bold mt-0.5">${outLabel}</div>` : ''}
                </div>
                <button onclick="openCarModal('${car.id}')" class="btn-blue !py-1 !px-2 ml-2">Gestisci</button>
            </div>
            <div class="flex items-center gap-1 mt-1.5">
                <span class="text-[8px] text-gray-600 w-8 shrink-0">⛽</span>
                <div class="fuel-bar-bg flex-1"><div class="fuel-bar-fill" style="width:${fuelPct}%; background:${fuelColor}"></div></div>
                <span class="text-[8px] font-mono ml-1" style="color:${fuelColor}">${fuelPct}%</span>
            </div>
            <div class="flex items-center gap-1 mt-1">
                <span class="text-[8px] text-gray-600 w-8 shrink-0">🔵</span>
                <div class="fuel-bar-bg flex-1"><div class="fuel-bar-fill" style="width:${tirePct}%; background:${tireColor}"></div></div>
                <span class="text-[8px] font-mono ml-1" style="color:${tireColor}">${tirePct}%</span>
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

    html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Concessionario (Nuovo & Leasing)</h3><div class="space-y-2">`;
    NEW_CARS.forEach(c => {
        html += `
        <div class="hud-card flex justify-between items-center">
            <div><div class="text-xs font-bold text-white">${c.name}</div><div class="text-[9px] text-gray-500">Tier: ${c.tier.toUpperCase()}</div></div>
            <div class="flex gap-2">
                <button onclick="buyCar('${c.id}','new')" class="btn-gold !text-[8px]">€${c.price.toLocaleString()}</button>
                <button onclick="openLeasingModal('${c.tier}')" class="btn-gold !bg-blue-600 !text-white !text-[8px]">Lease</button>
            </div>
        </div>`;
    });

    html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">Mercato dell'Usato</h3><div class="space-y-2">`;
    USED_CARS.forEach(c => {
        html += `
        <div class="hud-card flex justify-between items-center">
            <div><div class="text-xs font-bold text-white">${c.name}</div><div class="text-[9px] text-red-400">Salute: ${c.condition}%</div></div>
            <button onclick="buyCar('${c.id}','used')" class="btn-gold !bg-gray-800">€${c.price.toLocaleString()}</button>
        </div>`;
    });

    // Prototype / exclusive vehicles
    if (typeof PROTOTYPE_CARS !== 'undefined' && PROTOTYPE_CARS.length > 0) {
        html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🔬 Prototipi Esclusivi</h3><div class="space-y-2">`;
        PROTOTYPE_CARS.forEach(c => {
            const isOwned = gameState.fleet.some(f => f.protoId === c.id);
            const canBuy  = gameState.reputation >= c.reqRep && !isOwned;
            const lockMsg = isOwned ? '✓ In Flotta' : gameState.reputation < c.reqRep ? `🔒 Richiede ${c.reqRep}★ Rep` : '';
            html += `
            <div class="hud-card ${canBuy ? 'hover:border-gold/50' : 'opacity-60'}">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="text-xs font-bold text-white">${c.name}</div>
                        <div class="text-[9px] text-purple-400">${c.desc}</div>
                        <div class="text-[9px] text-gray-500">Tier: ${c.tier.toUpperCase()} · Min Rep: ${c.reqRep}★</div>
                    </div>
                    ${isOwned
                        ? `<span class="text-green-400 text-[9px] font-bold">✓ In Flotta</span>`
                        : canBuy
                            ? `<button onclick="buyPrototypeCar('${c.id}')" class="btn-gold !text-[8px]">€${c.price.toLocaleString()}</button>`
                            : `<span class="text-gray-600 text-[9px]">${lockMsg}</span>`
                    }
                </div>
            </div>`;
        });
    }
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
            <div class="flex-shrink-0 pt-0.5">
                ${owned ? '<span class="text-green-500 text-[9px] font-bold uppercase">✓ Attivo</span>' : `<button onclick="hireOfficeStaff('${s.id}')" class="btn-gold !py-1 !px-2">Assumi</button>`}
            </div>
        </div>`;
    }
    const hasHR = gameState.staff.some(s => s.id === 'hr');
    html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">I Tuoi Autisti</h3><div class="space-y-2">`;
    gameState.drivers.filter(d => d.id !== 'ceo').forEach(d => {
        const fatigue = d.fatigue || 0;
        const fatigueColor = fatigue >= 85 ? '#ef4444' : fatigue >= 60 ? '#f59e0b' : '#8b5cf6';
        const isResting = d.status === 'resting';
        const levelData = (DRIVER_LEVELS || [])[d.level || 0] || { name:'Rookie', xpMin:0, xpMax:200, badge:'lvl-rookie' };
        const nextLvl   = (DRIVER_LEVELS || [])[Math.min((d.level||0)+1, DRIVER_LEVELS.length-1)];
        const xpPct = nextLvl ? Math.min(100, Math.round(((d.xp||0) - levelData.xpMin) / (nextLvl.xpMin - levelData.xpMin) * 100)) : 100;
        const statusLabel = isResting
            ? `<span class="text-orange-400 font-bold text-[9px]">In Riposo (${d.restHoursLeft}h rimaste)</span>`
            : fatigue >= 85
                ? `<span class="text-red-400 text-[9px] font-bold">⚠ ESAUSTO${!hasHR ? ' — Mandalo a riposo!' : ''}</span>`
                : '';
        html += `
        <div class="hud-card">
            <div class="flex justify-between items-center">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white">${d.name} <span class="lvl-badge ${levelData.badge} ml-1">${levelData.name}</span>${d.isOnStrike ? '<span class="ml-2 text-[8px] bg-red-900/60 text-red-400 px-1 rounded font-bold">🪧 SCIOPERO</span>' : ''}</div>
                    ${d.trait ? `<div class="text-[8px] text-purple-400 mt-0.5">${d.trait.name} — ${d.trait.desc}</div>` : ''}
                    <div class="text-[9px] text-gray-500">€${d.salary}/mese · XP: ${d.xp||0}</div>
                    ${statusLabel ? `<div class="mt-0.5">${statusLabel}</div>` : ''}
                </div>
                <div class="flex gap-2 items-center shrink-0">
                    ${d.isOnStrike
                        ? `<button onclick="resolveStrike('${d.id}')" class="btn-gold !bg-yellow-900/30 !text-yellow-400 !text-[8px]">🤝 Accordo</button>`
                        : (!isResting && d.status !== 'busy' && fatigue >= 40)
                            ? `<button onclick="sendDriverToRest('${d.id}')" class="btn-gold !bg-orange-900/30 !text-orange-400 !text-[8px]">Riposo</button>`
                            : ''}
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
        </div>`;
    });
    const tierIcon = { standard:'🟢', business:'🔵', vip:'🟣', ultra:'⚫' };
    html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">Mercato Reclutamento</h3>
    <p class="text-[9px] text-gray-600 mb-3 italic">I candidati si aggiornano dopo ogni assunzione.</p>
    <div class="space-y-2">`;
    (gameState.availableRecruits || []).forEach(p => {
        html += `
        <div class="hud-card flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">${p.name} <span class="text-[9px] ml-1">${tierIcon[p.tier] || ''} ${p.tier.toUpperCase()}</span></div>
                ${p.trait ? `<div class="text-[8px] text-purple-400">${p.trait.name} — ${p.trait.desc}</div>` : ''}
                <div class="text-[9px] text-gray-500">Stipendio: €${p.salary}/mese | Anticipo: €${p.salary*2}</div>
            </div>
            <button onclick="hireDriver('${p.name}', ${p.salary})" class="btn-gold !py-1">Assumi</button>
        </div>`;
    });
    if ((gameState.availableRecruits || []).length === 0) {
        html += `<div class="text-[10px] text-gray-600 italic">Nessun candidato disponibile al momento.</div>`;
    }
    container.innerHTML = html + `</div>`;
}

function renderTabEmails() {
    const container = document.getElementById('tab-container');
    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">Comunicazioni Riservate</h3>`;
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
        const cardBorder = isGrey ? '!border-red-500/40 bg-red-950/10'
                         : isDiamond ? '!border-yellow-400/50 bg-yellow-950/15'
                         : isBroker ? (e.brokerGain >= 0 ? '!border-green-500/40 bg-green-950/10' : '!border-red-500/40 bg-red-950/10')
                         : '';
        const typeLabel  = isGrey    ? '<span class="text-red-400 font-bold uppercase text-[8px]">⚠ GREY MARKET</span>'
                         : isDiamond ? '<span class="font-bold uppercase text-[8px]" style="color:#d4af37">🔶 DIAMOND</span>'
                         : isBroker  ? `<span class="${e.brokerGain >= 0 ? 'text-green-400' : 'text-red-400'} font-bold uppercase text-[8px]">📊 BROKER</span>`
                         : `<span class="text-gold uppercase text-[8px]">${e.type.replace('_',' ')}</span>`;

        html += `<div class="hud-card mb-3 ${cardBorder}"><div class="text-[9px] text-gray-500 mb-1 flex justify-between"><span>DA: ${e.sender}</span>${typeLabel}</div><div class="text-xs font-bold ${isGrey ? 'text-red-300' : isDiamond ? 'text-yellow-300' : 'text-white'} mb-1">${e.subject}</div>${expiryLabel ? `<div class="mb-2">${expiryLabel}</div>` : ''}`;

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
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue w-full !text-[9px]">OK, Incassato</button>`;
        } else if (e.type === 'info') {
            html += `<div class="text-[10px] text-gray-300 mb-3">${e.subject}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue w-full !text-[9px]">OK, Capito</button>`;
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
    ${outReason ? `<div class="p-2 border border-red-500/40 bg-red-950/20 rounded-lg text-[9px] text-red-300 font-bold">
        🔴 Auto ferma: deposito ${outReason === 'fuel' ? 'gasolio' : 'gomme'} esaurito.<br>
        <span class="text-gray-400 font-normal">Rifornisci il deposito nella schermata Flotta — il Logistics Manager riprenderà l'auto automaticamente.</span>
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
        html += `<button onclick="assignCarToDriver('${car.id}','${d.id}')" class="text-left p-1.5 border border-white/10 rounded text-[9px] ${isSet?'border-gold text-gold bg-gold/5':'text-white hover:border-white/20'}">${d.name} ${isSet?'(Assegnato)':''}</button>`;
    });
    html += `</div>
    <button onclick="openGarage3D('${car.id}')" class="w-full btn-blue !text-[9px]">🚗 Vista 3D Garage</button>`;
    if(!car.isLease) html += `<button onclick="sellCar('${car.id}')" class="w-full btn-gold !bg-red-900/20 !text-red-400 !border !border-red-900/40 mt-1">💰 Vendi</button>`;
    document.getElementById('car-modal-content').innerHTML = html + `</div>`;
    document.getElementById('modal-car').classList.remove('hidden');
    document.getElementById('modal-car').classList.add('flex');
}

window.closeModals = function() { 
    document.querySelectorAll('[id^="modal-"]').forEach(m => { m.classList.add('hidden'); m.classList.remove('flex'); }); 
}

// --- LOGICHE FINALI ---
window.hireOfficeStaff = function(id) {
    const s = STAFF_ROLES[Object.keys(STAFF_ROLES).find(k => STAFF_ROLES[k].id === id)];
    if (!s) return;
    const maxStaff = typeof _getMaxStaff === 'function' ? _getMaxStaff() : 2;
    const currentStaff = gameState.staff.length + gameState.drivers.filter(d => d.id !== 'ceo').length;
    if (currentStaff >= maxStaff) {
        showNotification(`Limite staff raggiunto (${maxStaff}). Potenzia la sede!`, 'error');
        return;
    }
    if(gameState.cash >= s.salary) {
        gameState.cash -= s.salary; gameState.staff.push(s);
        showNotification(`${s.name} assunto con successo!`, "success");
        updateUI(); renderTabStaff();
        if(typeof saveGame==='function') saveGame();
    } else {
        showNotification('Fondi insufficienti!', 'error');
    }
};

window.buyCar = function(carId, type) {
    const carT = (type === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === carId);
    if(gameState.cash >= carT.price) {
        gameState.cash -= carT.price;
        gameState.fleet.push({ id: 'c_'+Date.now(), name: carT.name, tier: carT.tier, condition: carT.condition, isLease: false, fuel: 100, mileage: 0, tirePressure: 100, upgrades: [] });
        updateUI(); renderTabFleet(); showNotification("Veicolo acquistato!", "success");
        if(typeof saveGame==='function') saveGame();
    } else showNotification("Fondi insufficienti!", "error");
};

window.leaseCar = function(carId) {
    const c = NEW_CARS.find(x => x.id === carId);
    let upFront = c.price * 0.1;
    if(gameState.cash >= upFront) {
        gameState.cash -= upFront;
        gameState.fleet.push({ id: 'l_'+Date.now(), name: c.name, tier: c.tier, condition: 100, isLease: true, dailyCost: Math.floor(c.price/300) });
        updateUI(); renderTabFleet(); showNotification("Contratto Leasing approvato!", "success");
    }
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
        html += `
        <div class="hud-card flex justify-between items-start gap-2">
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-white truncate">${i.name}</div>
                <div class="text-[9px] text-gray-500 mt-0.5">${i.desc}</div>
                ${i.passive ? `<div class="text-[9px] text-green-400 font-mono mt-0.5">+€${i.passive.toLocaleString()}/g</div>` : ''}
            </div>
            <div class="flex-shrink-0">
                ${owned
                    ? `<span class="text-green-500 text-[9px] font-bold uppercase">✓ Attivo</span>`
                    : `<button onclick="buyInvestment('${i.id}')" class="btn-gold !text-[8px] !py-1 !px-2">€${i.price.toLocaleString()}</button>`}
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
            <div class="text-[8px] text-gray-500 flex justify-between">
                <span>Prestito #${l.id}</span>
                <span class="text-red-400">Residuo: €${l.amount.toLocaleString()} (${((l.rate||0.08)*100).toFixed(0)}%/mese)</span>
            </div>`).join('')}
        </div>` : ''}
        <div class="space-y-2">`;
    } else {
        html += `</div>`;
    }

    container.innerHTML = html + `</div>`;
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

    let html = `
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

window.showNotification = function(msg, type) {
    const c = document.getElementById('notifications');
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
            loansHtml += `<div class="hud-card !py-1.5 mb-1 flex justify-between text-[9px]">
                <span>Prestito #${l.id}</span>
                <span class="text-red-400 font-mono">€${l.amount.toLocaleString()}</span>
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

    // Real Estate section
    const realEstate = assets.filter(a => a.category === 'real_estate');
    html += `<div class="text-[9px] uppercase tracking-widest mb-2 mt-1" style="color:#d4af37">🏙️ Immobili di Lusso</div>`;
    realEstate.forEach(a => {
        const isOwned = owned.includes(a.id);
        const canAfford = gameState.cash >= a.price;
        html += `
        <div class="lifestyle-card mb-3 ${isOwned ? 'lifestyle-owned' : ''}">
            <div class="flex items-start gap-3 mb-2">
                <span class="text-3xl">${a.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white">${a.name}</div>
                    <div class="text-[9px]" style="color:#d4af37">${a.location}</div>
                    <div class="text-[9px] text-gray-400 mt-1 leading-relaxed">${a.desc}</div>
                </div>
            </div>
            <div class="flex justify-between items-center mt-2">
                <div class="flex gap-3">
                    ${a.passive > 0 ? `<span class="text-[9px] text-green-400">+€${a.passive.toLocaleString()}/g</span>` : ''}
                    ${a.repBonus > 0 ? `<span class="text-[9px]" style="color:#d4af37">+${a.repBonus}★</span>` : ''}
                    ${a.unlocksDiamond ? `<span class="text-[9px]" style="color:#d4af37">🔶 Diamond</span>` : ''}
                    ${a.stockBonus > 0 ? `<span class="text-[9px]" style="color:#00f2ff">+${Math.round(a.stockBonus*100)}% stocks</span>` : ''}
                </div>
                ${isOwned
                    ? `<span class="text-[9px] font-bold text-green-400 uppercase">✓ Posseduto</span>`
                    : `<button onclick="buyLifestyleAsset('${a.id}')" class="btn-gold !text-[9px] !py-1 ${canAfford?'':'opacity-50'}"  ${canAfford?'':'disabled'}>€${a.price.toLocaleString()}</button>`
                }
            </div>
        </div>`;
    });

    // Elite vehicles
    const eliteVehicles = assets.filter(a => a.category === 'vehicle_elite');
    html += `<div class="text-[9px] uppercase tracking-widest mb-2 mt-3" style="color:#00f2ff">✈️ Mezzi Elite</div>`;
    eliteVehicles.forEach(a => {
        const isOwned = owned.includes(a.id);
        const canAfford = gameState.cash >= a.price;
        html += `
        <div class="lifestyle-card mb-3 ${isOwned ? 'lifestyle-owned' : ''}">
            <div class="flex items-start gap-3 mb-2">
                <span class="text-3xl">${a.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white">${a.name}</div>
                    <div class="text-[9px]" style="color:#00f2ff">${a.location}</div>
                    <div class="text-[9px] text-gray-400 mt-1 leading-relaxed">${a.desc}</div>
                </div>
            </div>
            <div class="flex justify-between items-center mt-2">
                <div class="flex gap-3">
                    ${a.passive > 0 ? `<span class="text-[9px] text-green-400">+€${a.passive.toLocaleString()}/g</span>` : ''}
                    ${a.repBonus > 0 ? `<span class="text-[9px]" style="color:#d4af37">+${a.repBonus}★</span>` : ''}
                    ${a.intlUnlock ? `<span class="text-[9px]" style="color:#00f2ff">✈️ Intl Routes</span>` : ''}
                    ${a.staffBonus > 0 ? `<span class="text-[9px] text-purple-400">Staff +${Math.round(a.staffBonus*100)}% energy</span>` : ''}
                </div>
                ${isOwned
                    ? `<span class="text-[9px] font-bold text-green-400 uppercase">✓ Posseduto</span>`
                    : `<button onclick="buyLifestyleAsset('${a.id}')" class="btn-gold !text-[9px] !py-1 ${canAfford?'':'opacity-50'}" ${canAfford?'':'disabled'}>€${a.price.toLocaleString()}</button>`
                }
            </div>
        </div>`;
    });

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
    <div>${lawsHtml}</div>`;
}
window.renderTabPolitics = renderTabPolitics;

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
    if (nameEl) nameEl.innerText = gameState.companyName || 'Olga Vision Agency';

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

window.addEventListener('DOMContentLoaded', () => { initMap(); setupDragAndDrop(); });