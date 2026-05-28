'use strict';
/* ui-dispatch.js — renderTabCorse + drag-drop */

function renderTabCorse() {
    const container = document.getElementById('tab-container');
    const _sig = (gameState.pendingRides.map(r => r.id).join(',')) + '|' +
                 (gameState.drivers.map(d => d.id + ':' + d.status + ':' + (d.queue?.length || 0) + ':' + (d.restHoursLeft | 0)).join(',')) + '|' +
                 (gameState._dailySummary ? gameState._dailySummary.day : 0);
    if (renderTabCorse._sig === _sig && container.children.length > 0) return;
    renderTabCorse._sig = _sig;

    const gs             = gameState;
    const activeDrivers  = gs.drivers.filter(d => d.status === 'busy').length;
    const restingDrivers = gs.drivers.filter(d => d.status === 'resting').length;
    const freeDrivers    = gs.drivers.filter(d => d.status !== 'busy' && d.status !== 'resting').length;
    const todayEarnings  = gs.todayEarnings || 0;
    const pendingCount   = gs.pendingRides.length;
    const fleetActive    = gs.fleet.filter(v => !v.isSequestered).length;
    const ceoEnergy      = typeof gs.energy !== 'undefined' ? gs.energy : 100;
    const strikingDrivers = gs.drivers.filter(d => d.id !== 'ceo' && d.isOnStrike).length;
    const burnoutDrivers  = gs.drivers.filter(d => d.id !== 'ceo' && d.burnout_until && (gs.day * 24 + gs.hour) < d.burnout_until).length;

    const tierColors = { standard:'#6b7280', business:'#4b7ab8', first:'#b8962b', ultra:'#b86b3a', presidential:'#8a5fa0' };
    const typeLabel  = { Airport:'AIR', 'City-to-City':'CITY', Rail:'RAIL', Port:'PORT', Boat:'BOAT', Transfer:'TRF' };

    const _TH = t => `<th style="padding:7px 14px;font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
    const _THR = t => `<th style="padding:7px 14px;font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;

    // ── KPI STRIP ────────────────────────────────────────────────
    const energyColor = ceoEnergy < 25 ? '#ef4444' : ceoEnergy < 50 ? '#f59e0b' : '#4b8b4f';
    const alerts = [
        pendingCount >= 5 ? `<span class="ops-alert-pill">${pendingCount} IN ATTESA</span>` : '',
        strikingDrivers > 0 ? `<span class="ops-alert-pill" style="background:rgba(239,68,68,0.15);border-color:#5a2a2a;color:#ef4444">${strikingDrivers} SCIOPERO</span>` : '',
        burnoutDrivers  > 0 ? `<span class="ops-alert-pill" style="background:rgba(249,115,22,0.15);border-color:#5a3a1a;color:#f97316">${burnoutDrivers} BURNOUT</span>` : '',
    ].filter(Boolean).join('');

    let html = `
    <div class="ops-kpi-strip" style="background:#0d1117;border:none;border-bottom:1px solid #21262d;border-radius:0;padding:10px 16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div class="ops-kpi">
            <div style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:2px">Richieste Pendenti</div>
            <div style="font-size:16px;font-weight:700;font-family:monospace;color:${pendingCount > 0 ? '#d4af37' : '#3d4450'}">${pendingCount}</div>
        </div>
        <div style="width:1px;height:30px;background:#21262d"></div>
        <div class="ops-kpi">
            <div style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:2px">Autisti Attivi</div>
            <div style="font-size:16px;font-weight:700;font-family:monospace;color:#4b7ab8">${activeDrivers}<span style="font-size:10px;color:#6b7280">/${gs.drivers.length}</span></div>
        </div>
        <div style="width:1px;height:30px;background:#21262d"></div>
        <div class="ops-kpi">
            <div style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:2px">Flotta Operativa</div>
            <div style="font-size:16px;font-weight:700;font-family:monospace;color:#8b949e">${fleetActive} <span style="font-size:10px">veicoli</span></div>
        </div>
        <div style="width:1px;height:30px;background:#21262d"></div>
        <div class="ops-kpi">
            <div style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:2px">Incasso Oggi</div>
            <div style="font-size:16px;font-weight:700;font-family:monospace;color:#4b8b4f">€${todayEarnings.toLocaleString('it-IT')}</div>
        </div>
        <div style="width:1px;height:30px;background:#21262d"></div>
        <div class="ops-kpi" style="min-width:120px">
            <div style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:4px">Energia CEO</div>
            <div style="display:flex;align-items:center;gap:6px">
                <div style="flex:1;height:3px;background:#21262d;overflow:hidden">
                    <div style="height:100%;width:${Math.round(ceoEnergy)}%;background:${energyColor}"></div>
                </div>
                <span style="font-size:9px;font-family:monospace;color:${energyColor};flex-shrink:0">${Math.round(ceoEnergy)}%</span>
            </div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
            ${alerts}
            <button onclick="window.openMapOverlay()" class="ops-action-btn ops-action-btn--blue" style="font-size:9px;padding:5px 12px;border:1px solid #21262d;background:#161b22;color:#8b949e;cursor:pointer;font-family:monospace">LIVE MAP</button>
            <button onclick="assignAllRides()" style="font-size:9px;padding:5px 12px;border:1px solid #b8962b;background:#2a2210;color:#d4af37;cursor:pointer;font-family:monospace;font-weight:700">SMISTA TUTTE</button>
        </div>
    </div>

    <!-- MAIN GRID -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1;overflow:hidden">

        <!-- LEFT: INCOMING RIDES -->
        <div style="display:flex;flex-direction:column;border-right:1px solid #21262d;overflow:hidden">
            <div style="padding:8px 14px;border-bottom:1px solid #21262d;background:#0d1117;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
                <span style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280">Richieste in Arrivo</span>
                <span style="font-size:9px;font-family:monospace;color:${pendingCount > 0 ? '#d4af37' : '#30363d'};font-weight:700">${pendingCount}</span>
            </div>
            <div style="flex:1;overflow-y:auto">`;

    if (pendingCount === 0) {
        html += `<div style="text-align:center;padding:40px 20px;color:#30363d;font-size:10px;font-family:monospace">IN ATTESA DI CHIAMATE...</div>`;
    } else {
        html += `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#0d1117">${_TH('Tipo')}${_TH('Percorso')}${_THR('Prezzo')}</tr></thead>
            <tbody>`;
        gs.pendingRides.forEach(ride => {
            const isContract = ride.isContract;
            const fromName   = ride.originName      || ride.fromPoi?.name || '?';
            const toName     = ride.destinationName || ride.toPoi?.name   || '?';
            const tier       = ride.tier || 'standard';
            const tColor     = tierColors[tier] || '#6b7280';
            const tLabel     = typeLabel[ride.routeType] || (ride.routeType || 'STD').substring(0, 3).toUpperCase();
            const margin     = (ride.price || 0) - (ride.netCost || 0);

            html += `<tr class="ops-ride-card ce-table-row" draggable="true" data-id="${ride.id}"
                style="border-bottom:1px solid #21262d;cursor:grab">
                <td style="padding:9px 14px;white-space:nowrap">
                    <span style="font-size:8px;font-family:monospace;font-weight:700;padding:2px 7px;border:1px solid ${tColor}40;color:${tColor};background:${tColor}15">${isContract ? 'B2B' : tLabel}</span>
                </td>
                <td style="padding:9px 14px;font-size:10px;color:#c9d1d9;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${fromName} <span style="color:#30363d">→</span> ${toName}
                    ${isContract ? `<div style="font-size:8px;color:#6b7280;margin-top:2px">margine: <span style="color:${margin >= 0 ? '#4b8b4f' : '#8b3a3a'}">€${margin.toLocaleString('it-IT')}</span></div>` : ''}
                </td>
                <td style="padding:9px 14px;text-align:right;font-family:monospace;font-weight:700;font-size:11px;color:#4b8b4f;white-space:nowrap">€${(ride.price || 0).toLocaleString('it-IT')}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    html += `</div></div>

        <!-- RIGHT: DRIVER STATUS -->
        <div style="display:flex;flex-direction:column;overflow:hidden">
            <div style="padding:8px 14px;border-bottom:1px solid #21262d;background:#0d1117;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
                <span style="font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:1px;color:#6b7280">Stato Autisti</span>
                <div style="display:flex;gap:10px;font-size:8px;font-family:monospace">
                    <span style="color:#4b7ab8">${activeDrivers} attivi</span>
                    <span style="color:#6b5a3a">${restingDrivers} riposo</span>
                    <span style="color:#4b8b4f">${freeDrivers} liberi</span>
                </div>
            </div>
            <div style="flex:1;overflow-y:auto">
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="background:#0d1117">${_TH('Autista')}${_TH('Veicolo')}${_TH('Fatica')}${_THR('Stato')}</tr></thead>
                    <tbody>`;

    gs.drivers.forEach(driver => {
        const car       = gs.fleet.find(c => c.id === driver.assignedCarId);
        const isResting = driver.status === 'resting';
        const isBusy    = driver.status === 'busy';
        const fatigue   = driver.fatigue || 0;
        const fatColor  = fatigue >= 85 ? '#8b3a3a' : fatigue >= 60 ? '#8b6a3a' : '#3d5a3e';
        const statusColor = isResting ? '#6b5a3a' : isBusy ? '#3a5a8b' : '#3d5a3e';
        const statusText  = isResting ? `RIPOSO −${driver.restHoursLeft}h` : isBusy ? 'IN SERVIZIO' : 'DISPONIBILE';
        const restBtn = (!isResting && !isBusy && driver.id !== 'ceo' && fatigue >= 40)
            ? `<button onclick="sendDriverToRest('${driver.id}')" style="margin-left:6px;font-size:8px;font-family:monospace;padding:1px 6px;border:1px solid #30363d;background:#161b22;color:#6b7280;cursor:pointer">RIPOSO</button>`
            : '';

        html += `<tr class="ops-driver-row ce-table-row" data-id="${driver.id}"
            style="border-bottom:1px solid #21262d;${isResting ? 'opacity:0.45' : ''}">
            <td style="padding:9px 14px">
                <div style="font-size:10px;font-weight:600;color:#c9d1d9;display:flex;align-items:center">
                    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${isResting ? '#6b5a3a' : isBusy ? '#3a5a8b' : '#3d5a3e'};margin-right:7px;flex-shrink:0"></span>
                    ${driver.name}${restBtn}
                </div>
                ${driver.queue.length > 0 ? `<div style="font-size:8px;font-family:monospace;color:#6b7280;margin-top:2px;margin-left:14px">coda: ${driver.queue.length}</div>` : ''}
            </td>
            <td style="padding:9px 14px;font-size:9px;color:#6b7280">${car ? car.name : '— nessun veicolo —'}</td>
            <td style="padding:9px 14px;min-width:90px">
                ${driver.id !== 'ceo' ? `<div style="display:flex;align-items:center;gap:5px">
                    <div style="flex:1;height:3px;background:#21262d;overflow:hidden">
                        <div style="height:100%;width:${fatigue}%;background:${fatColor}"></div>
                    </div>
                    <span style="font-size:8px;font-family:monospace;color:${fatColor};width:26px;text-align:right;flex-shrink:0">${Math.round(fatigue)}%</span>
                </div>` : '<span style="font-size:8px;color:#30363d">—</span>'}
            </td>
            <td style="padding:9px 14px;text-align:right">
                <span style="font-size:8px;font-family:monospace;font-weight:700;padding:2px 8px;border:1px solid ${statusColor};color:${statusColor === '#3d5a3e' ? '#4b8b4f' : statusColor === '#3a5a8b' ? '#4b7ab8' : '#b8962b'};background:${statusColor}20">${statusText}</span>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div></div></div>`;

    // Daily summary
    const _ds = gameState._dailySummary;
    if (_ds) {
        const netColor = _ds.net >= 0 ? '#4b8b4f' : '#8b3a3a';
        const netSign  = _ds.net >= 0 ? '+' : '';
        html += `
        <div style="padding:8px 16px;border-top:1px solid #21262d;background:#0d1117;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:9px;font-family:monospace;flex-shrink:0">
            <span style="color:#6b7280;text-transform:uppercase;letter-spacing:1px">Giorno ${_ds.day} — Chiusura</span>
            <span style="color:${netColor};font-weight:700">${netSign}€${_ds.net.toLocaleString('it-IT')} netto</span>
            <span style="color:#30363d">·</span>
            <span style="color:#6b7280">Entrate <strong style="color:#4b8b4f">€${_ds.income.toLocaleString('it-IT')}</strong></span>
            <span style="color:#30363d">·</span>
            <span style="color:#6b7280">Uscite <strong style="color:#8b3a3a">€${_ds.expenses.toLocaleString('it-IT')}</strong></span>
            ${_ds.luxuryTax > 0 ? `<span style="color:#30363d">·</span><span style="color:#6b7280">Tax <strong style="color:#8b6a3a">€${_ds.luxuryTax.toLocaleString('it-IT')}</strong></span>` : ''}
            <span style="color:#30363d">·</span>
            <span style="color:#6b7280">Cash <strong style="color:#4b7ab8">€${_ds.cash.toLocaleString('it-IT')}</strong></span>
        </div>`;
    }

    container.innerHTML = html;
}

function _updateTrafficLabel() {
    const el = document.getElementById('map-traffic-label');
    if (!el || typeof _getTrafficMult !== 'function') return;
    const m = _getTrafficMult();
    el.innerText = m < 1 ? `Traffico intenso (−${Math.round((1-m)*100)}% velocità)` : m > 1 ? `Strade libere (+${Math.round((m-1)*100)}% velocità)` : 'Traffico regolare';
}

let draggedRideId = null;
function setupDragAndDrop() {
    document.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.ops-ride-card');
        if (card) { draggedRideId = card.getAttribute('data-id'); card.style.opacity = '0.5'; }
    });
    document.addEventListener('dragend', (e) => {
        const card = e.target.closest('.ops-ride-card');
        if (card) { card.style.opacity = '1'; draggedRideId = null; }
    });
    document.addEventListener('dragover', (e) => {
        const dCard = e.target.closest('.ops-driver-row');
        if (dCard) { e.preventDefault(); dCard.style.background = 'rgba(212,175,55,0.06)'; }
    });
    document.addEventListener('dragleave', (e) => {
        const dCard = e.target.closest('.ops-driver-row');
        if (dCard) dCard.style.background = '';
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        const dCard = e.target.closest('.ops-driver-row');
        if (dCard) { dCard.style.background = ''; }
        if (dCard && draggedRideId) { assignRideToDriver(draggedRideId, dCard.getAttribute('data-id')); renderTabCorse(); }
    });
}

window.renderTabCorse = renderTabCorse;
