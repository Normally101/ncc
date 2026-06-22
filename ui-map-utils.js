'use strict';
/* ui-map-utils.js — Chauffeur Empire
   Utilità mappa: particelle, day/night, HQ marker, founding overlay,
   route traffic, academy modal, _traitBadgeHTML.
   Dipendenze: dispatcher.js (mappa Mapbox), engine.js */

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
            <button ${ceAct('_startFoundingMode', [])} style="padding:16px 40px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.6);border-radius:12px;color:#d4af37;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:2px;text-transform:uppercase;">📍 Scegli sulla Mappa</button>
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
            <button ${ceAct('_cancelFoundingMode', [])} style="margin-top:20px;padding:8px 24px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:8px;color:#ef4444;font-size:0.8rem;cursor:pointer;">✕ Annulla</button>
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
    <button ${ceAct('ceRemove', ['academy-modal'])}
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
        return `<button ${ceAct('_academySelectDriver', [d.id])}
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
          return `<button ${ceAct('ceStartAcademy', [selDriver.id, c.id])}
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

