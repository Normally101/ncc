'use strict';
/* ui-dispatch.js — renderTabCorse + drag-drop */

function renderTabCorse() {
    const container = document.getElementById('tab-container');
    // Zero-to-Hero: sotto le 10 corse la tab Corse è sostituita dalla guida manuale.
    if (typeof window._z2hState === 'function' && window._z2hState() === 'survival'
        && typeof window.renderManualSurvivalMode === 'function') {
        return window.renderManualSurvivalMode();
    }
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

    // tier accent colors (light theme)
    const tierColors = { standard:'#6a7480', business:'#2f74c0', first:'#c79a2a', ultra:'#b86b3a', presidential:'#7c5fc9' };
    const tierBg     = { standard:'#eef1f5', business:'#e7f0fb', first:'#fff3cf', ultra:'#f7e6db', presidential:'#ece4f7' };
    const typeLabel  = { Airport:'AIR', 'City-to-City':'CITY', Rail:'RAIL', Port:'PORT', Boat:'BOAT', Transfer:'TRF' };

    // ── KPI BAR ────────────────────────────────────────────────
    const energyColor = ceoEnergy < 25 ? 'var(--em-red)' : ceoEnergy < 50 ? 'var(--em-amber)' : 'var(--em-green)';
    const alerts = [
        pendingCount >= 5 ? `<span class="em-pill em-pill--gold">${pendingCount} in attesa</span>` : '',
        strikingDrivers > 0 ? `<span class="em-pill em-pill--red">${strikingDrivers} sciopero</span>` : '',
        burnoutDrivers  > 0 ? `<span class="em-pill" style="background:#fdeede;color:var(--em-amber)">${burnoutDrivers} burnout</span>` : '',
    ].filter(Boolean).join('');

    let html = `
    <div class="em em-page"><div class="em-wrap">

    <div class="em-kpibar">
        <div class="k"><div class="l">Richieste Pendenti</div><div class="v" style="color:${pendingCount > 0 ? 'var(--em-gold)' : 'var(--em-dim)'}">${pendingCount}</div></div>
        <div class="k"><div class="l">Autisti Attivi</div><div class="v" style="color:var(--em-blue)">${activeDrivers}<span style="font-size:11px;color:var(--em-dim)">/${gs.drivers.length}</span></div></div>
        <div class="k"><div class="l">Flotta Operativa</div><div class="v">${fleetActive}<span style="font-size:11px;color:var(--em-dim)"> veicoli</span></div></div>
        <div class="k"><div class="l">Incasso Oggi</div><div class="v" style="color:var(--em-green)">€${todayEarnings.toLocaleString('it-IT')}</div></div>
        <div class="k" style="min-width:140px">
            <div class="l">Energia CEO</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
                <span class="em-prog" style="flex:1"><i style="width:${Math.round(ceoEnergy)}%;background:${energyColor}"></i></span>
                <span style="font-size:10px;font-weight:800;color:${energyColor};flex-shrink:0">${Math.round(ceoEnergy)}%</span>
            </div>
        </div>
    </div>

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px">
        ${alerts}
        <div style="margin-left:auto;display:flex;gap:8px">
            <button ${ceAct('openMapOverlay', [])} class="em-bbtn">🗺 Live Map</button>
            <button ${ceAct('assignAllRides', [])} class="em-goldbtn">Smista tutte</button>
        </div>
    </div>

    <!-- MAIN GRID -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">

        <!-- LEFT: INCOMING RIDES -->
        <div class="em-card">
            <div class="em-ch"><span class="t">Richieste in Arrivo</span><span class="a" style="color:${pendingCount > 0 ? 'var(--em-gold)' : 'var(--em-dim)'}">${pendingCount}</span></div>
            <div style="max-height:62vh;overflow-y:auto">`;

    if (pendingCount === 0) {
        html += `<div class="em-empty">In attesa di chiamate…</div>`;
    } else {
        html += `<table class="em-tbl">
            <thead><tr><th>Tipo</th><th>Percorso</th><th class="r">Prezzo</th></tr></thead>
            <tbody>`;
        gs.pendingRides.forEach(ride => {
            const isContract = ride.isContract;
            const fromName   = ride.originName      || ride.fromPoi?.name || '?';
            const toName     = ride.destinationName || ride.toPoi?.name   || '?';
            const tier       = ride.tier || 'standard';
            const tColor     = tierColors[tier] || '#6a7480';
            const tBg        = tierBg[tier] || '#eef1f5';
            const tLabel     = typeLabel[ride.routeType] || (ride.routeType || 'STD').substring(0, 3).toUpperCase();
            const margin     = (ride.price || 0) - (ride.netCost || 0);

            html += `<tr class="ops-ride-card" draggable="true" data-id="${ride.id}" style="cursor:grab">
                <td style="white-space:nowrap"><span class="em-pill" style="background:${tBg};color:${tColor}">${isContract ? 'B2B' : tLabel}</span></td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${fromName} <span style="color:var(--em-dim)">→</span> ${toName}
                    ${isContract ? `<div style="font-size:9.5px;color:var(--em-muted);margin-top:2px">margine: <span style="color:${margin >= 0 ? 'var(--em-green-d)' : 'var(--em-red)'};font-weight:700">€${margin.toLocaleString('it-IT')}</span></div>` : ''}
                </td>
                <td class="r em-price" style="white-space:nowrap">€${(ride.price || 0).toLocaleString('it-IT')}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    html += `</div></div>

        <!-- RIGHT: DRIVER STATUS -->
        <div class="em-card">
            <div class="em-ch"><span class="t">Stato Autisti</span>
                <span style="display:flex;gap:8px;font-size:10px;font-weight:700">
                    <span style="color:var(--em-blue)">${activeDrivers} attivi</span>
                    <span style="color:var(--em-gold)">${restingDrivers} riposo</span>
                    <span style="color:var(--em-green)">${freeDrivers} liberi</span>
                </span>
            </div>
            <div style="max-height:62vh;overflow-y:auto">`;

    gs.drivers.forEach(driver => {
        const car       = gs.fleet.find(c => c.id === driver.assignedCarId);
        const isResting = driver.status === 'resting';
        const isBusy    = driver.status === 'busy';
        const fatigue   = driver.fatigue || 0;
        const fatColor  = fatigue >= 85 ? 'var(--em-red)' : fatigue >= 60 ? 'var(--em-amber)' : 'var(--em-green)';
        const dotColor  = isResting ? 'var(--em-gold)' : isBusy ? 'var(--em-blue)' : 'var(--em-green)';
        const statusPill = isResting ? `<span class="em-pill em-pill--gold">Riposo −${driver.restHoursLeft}h</span>`
                          : isBusy ? `<span class="em-pill em-pill--blue">In servizio</span>`
                          : `<span class="em-pill em-pill--green">Disponibile</span>`;
        const restBtn = (!isResting && !isBusy && driver.id !== 'ceo' && fatigue >= 40)
            ? `<button ${ceAct('sendDriverToRest', [driver.id])} class="em-ghbtn" style="margin-left:7px;padding:2px 8px;font-size:9.5px">Riposo</button>`
            : '';

        html += `<div class="ops-driver-row em-lrow" data-id="${driver.id}" style="align-items:flex-start;${isResting ? 'opacity:0.5' : ''}">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-top:4px;flex-shrink:0"></span>
            <div style="flex:1;min-width:0">
                <div class="em-lt" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${driver.name}${restBtn}</div>
                <div class="em-lm"><span>${car ? car.name : '— nessun veicolo —'}</span>${driver.queue.length > 0 ? `<span>· coda ${driver.queue.length}</span>` : ''}</div>
            </div>
            ${driver.id !== 'ceo' ? `<div style="display:flex;align-items:center;gap:5px;width:88px;flex-shrink:0">
                <span class="em-prog" style="width:52px"><i style="width:${fatigue}%;background:${fatColor}"></i></span>
                <span style="font-size:9.5px;font-weight:700;color:${fatColor};width:28px;text-align:right">${Math.round(fatigue)}%</span>
            </div>` : '<span style="width:88px;flex-shrink:0;color:var(--em-dim);text-align:center">—</span>'}
            <div style="width:96px;flex-shrink:0;text-align:right">${statusPill}</div>
        </div>`;
    });

    html += `</div></div></div>`;

    // Daily summary
    const _ds = gameState._dailySummary;
    if (_ds) {
        const netColor = _ds.net >= 0 ? 'var(--em-green-d)' : 'var(--em-red)';
        const netSign  = _ds.net >= 0 ? '+' : '';
        html += `
        <div class="em-card" style="margin-top:7px;padding:9px 14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:11px">
            <span class="em-sec">Giorno ${_ds.day} — Chiusura</span>
            <span style="color:${netColor};font-weight:800">${netSign}€${_ds.net.toLocaleString('it-IT')} netto</span>
            <span style="color:var(--em-dim)">·</span>
            <span style="color:var(--em-muted)">Entrate <strong style="color:var(--em-green-d)">€${_ds.income.toLocaleString('it-IT')}</strong></span>
            <span style="color:var(--em-dim)">·</span>
            <span style="color:var(--em-muted)">Uscite <strong style="color:var(--em-red)">€${_ds.expenses.toLocaleString('it-IT')}</strong></span>
            ${_ds.totalTax > 0 ? `<span style="color:var(--em-dim)">·</span><span style="color:var(--em-muted)">Tax <strong style="color:var(--em-amber)">€${_ds.totalTax.toLocaleString('it-IT')}</strong></span>` : ''}
            <span style="color:var(--em-dim)">·</span>
            <span style="color:var(--em-muted)">Cash <strong style="color:var(--em-blue)">€${_ds.cash.toLocaleString('it-IT')}</strong></span>
        </div>`;
    }

    html += `</div></div>`;
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
