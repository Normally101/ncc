'use strict';
/* ================================================================
   map-visual.js — Chauffeur Empire
   Visual animation loop: vehicle markers + trail scia su Mapbox.
   Dipendenze: map.js (map, _mapReady, _updateVehicleLayer, _updateActiveRouteLines)
               dispatcher.js (_vehicleMarkers, _rideGeomCache)
               map-router.js (calculateInterpolatedPosition, _trailGeom)
   Caricato dopo: map-router.js
   ================================================================ */

// ─── TIER COLOR MAP for trails ────────────────────────────────────
const _TRAIL_COLOR = { ultra:'#d4af37', vip:'#a78bfa', business:'#00f2ff', group:'#34d399', standard:'#9ca3af' };

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
        const serverTrip = (gameState.activeTrips || []).find(t => t.id === ride.id);
        let progress;
        if (serverTrip?.start_time && serverTrip?.end_time) {
            const startMs = new Date(serverTrip.start_time).getTime();
            const endMs   = new Date(serverTrip.end_time).getTime();
            const span    = endMs - startMs;
            progress = span > 0 ? Math.min(1, Math.max(0, (now - startMs) / span)) : 1;
        } else {
            if (!ride.lastVisualUpdate) ride.lastVisualUpdate = now;
            const delta = now - ride.lastVisualUpdate;
            ride.lastVisualUpdate = now;
            if (ride.visualElapsed == null) ride.visualElapsed = ride.elapsed;
            ride.visualElapsed = Math.min(ride.duration, ride.visualElapsed + delta);
            progress = ride.visualElapsed / ride.duration;
        }

        const bar = document.getElementById(`prog-${ride.driverId}`);
        if (bar) bar.style.width = `${Math.min(100, progress * 100)}%`;

        const pos = calculateInterpolatedPosition(ride, progress * ride.duration);
        if (!pos) return;

        _rideGeomCache[ride.id] = {
            roadGeom:  ride.roadGeom || null,
            fromPoi:   ride.fromPoi,
            toPoi:     ride.toPoi,
            tier:      ride.tier,
            lastPos:   pos,
            lastAngle: ride._lastAngle || 0,
            progress,
        };

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
        if (activeRideIds.has(trip.id)) return;
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

        if (cached.roadGeom && cached.roadGeom.length >= 2) {
            trailFeatures.push({
                type: 'Feature',
                properties: { color: _TRAIL_COLOR[trip.tier] || '#9ca3af' },
                geometry: { type: 'LineString', coordinates: cached.roadGeom }
            });
        }
    });

    // ── Cleanup: remove markers when ride is gone from both ─────────
    const activeTripIds = new Set((gameState.activeTrips || []).map(t => t.id));
    for (const id in _vehicleMarkers) {
        if (!activeRideIds.has(+id) && !activeTripIds.has(+id)) {
            _vehicleMarkers[id].remove();
            delete _vehicleMarkers[id];
            delete _rideGeomCache[id];
        }
    }

    _updateVehicleLayer();

    const trailSrc = map.getSource('vehicle-trails');
    if (trailSrc) trailSrc.setData({ type: 'FeatureCollection', features: trailFeatures });

    if (!visualLoop._frame) visualLoop._frame = 0;
    if (++visualLoop._frame % 60 === 0) _updateActiveRouteLines();
}

if (_visualLoopRafId) cancelAnimationFrame(_visualLoopRafId);
visualLoop();
