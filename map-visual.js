'use strict';
/* ================================================================
   map-visual.js — Chauffeur Empire
   Disegno dei veicoli e delle scie SULLA MAPPA MAPBOX.
   Dipendenze: map.js (map, _mapReady, _updateVehicleLayer,
               _updateActiveRouteLines), dispatcher.js (_vehicleMarkers,
               _rideGeomCache), ride-progress.js (tickRideProgress).
   Caricato dopo: map-router.js
   ================================================================

   Due cose che questo file NON fa piu', ed erano due difetti veri:

   1. Non calcola piu' il progresso delle corse. Quel pezzo e' l'orologio
      del gioco, non disegno, e vive in ride-progress.js — dove il banco di
      prova lo carica e lo collauda. Finche' stava qui era intoccabile.

   2. Non avvia piu' il ciclo di animazione al caricamento del file. La
      vecchia ultima riga era `visualLoop();`, e da quel momento il ciclo
      girava per sempre: a mappa chiusa, a scheda del browser nascosta,
      sessanta volte al secondo, protetto solo da `if (!map)`. Ora parte in
      `avviaCicloVisivo()` e si ferma in `fermaCicloVisivo()`, che la mappa
      chiama montandosi e smontandosi.
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
    if (!map || !_mapReady || typeof gameState === 'undefined' || !gameState || gameState.paused) return;
    /* Scheda nascosta: il browser rallenta gia' i fotogrammi, ma non li
       ferma sempre. Disegnare per nessuno e' lavoro sprecato. Si guarda
       visibilityState e non `document.hidden`, che vale true anche per
       'prerender'. */
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const veicoli = typeof window.tickRideProgress === 'function' ? window.tickRideProgress(Date.now()) : [];
    const trailFeatures = [];
    const visti = new Set();

    veicoli.forEach(v => {
        visti.add(v.id);

        _rideGeomCache[v.id] = {
            roadGeom:  v.percorso || null,
            tier:      v.tier,
            lastPos:   [v.lat, v.lon],
            lastAngle: v.angolo,
            progress:  v.progresso,
        };

        if (!_vehicleMarkers[v.id]) {
            const wrap = document.createElement('div');
            wrap.className = 'car-marker-wrap' + (v.inAttesa ? ' waiting' : '');
            const arrow = document.createElement('div');
            arrow.className = 'car-arrow';
            arrow.style.transform = `rotate(${v.angolo}deg)`;
            wrap.appendChild(arrow);
            _vehicleMarkers[v.id] = new mapboxgl.Marker({ element: wrap })
                .setLngLat([v.lon, v.lat])
                .addTo(map);
        } else {
            _vehicleMarkers[v.id].setLngLat([v.lon, v.lat]);
            const el = _vehicleMarkers[v.id].getElement();
            el?.classList.toggle('waiting', !!v.inAttesa);
            const arrow = el?.querySelector('.car-arrow');
            if (arrow) arrow.style.transform = `rotate(${v.angolo}deg)`;
        }

        const geom = _trailGeom(v.percorso, v.progresso);
        if (geom && geom.length >= 2) {
            trailFeatures.push({
                type: 'Feature',
                properties: { color: _TRAIL_COLOR[v.tier] || '#9ca3af' },
                geometry: { type: 'LineString', coordinates: geom }
            });
        }
    });

    // ── Cleanup: via i marcatori delle corse che non esistono piu' ──
    for (const id in _vehicleMarkers) {
        if (!visti.has(+id)) {
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

function avviaCicloVisivo() {
    if (_visualLoopRafId !== null) return;
    visualLoop();
}

function fermaCicloVisivo() {
    if (_visualLoopRafId === null) return;
    cancelAnimationFrame(_visualLoopRafId);
    _visualLoopRafId = null;
}

window.avviaCicloVisivo = avviaCicloVisivo;
window.fermaCicloVisivo = fermaCicloVisivo;
window._trailGeom = _trailGeom;
