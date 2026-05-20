'use strict';
/* ui-dispatch.js — renderTabCorse + drag-drop */

function renderTabCorse() {
    const container = document.getElementById('tab-container');
    const _sig = (gameState.pendingRides.map(r => r.id).join(',')) + '|' +
                 (gameState.drivers.map(d => d.id + ':' + d.status + ':' + (d.queue?.length || 0) + ':' + (d.restHoursLeft | 0)).join(',')) + '|' +
                 (gameState._dailySummary ? gameState._dailySummary.day : 0);
    if (renderTabCorse._sig === _sig && container.children.length > 0) return;
    renderTabCorse._sig = _sig;

    const gs = gameState;
    const activeDrivers  = gs.drivers.filter(d => d.status === 'busy').length;
    const restingDrivers = gs.drivers.filter(d => d.status === 'resting').length;
    const freeDrivers    = gs.drivers.filter(d => d.status !== 'busy' && d.status !== 'resting').length;
    const todayEarnings  = gs.todayEarnings || 0;
    const pendingCount   = gs.pendingRides.length;
    const fleetActive    = gs.fleet.filter(v => !v.isSequestered).length;
    const ceoEnergy      = typeof gs.energy !== 'undefined' ? gs.energy : (typeof gs.ceoEnergy !== 'undefined' ? gs.ceoEnergy : 100);
    const stressColor    = ceoEnergy < 25 ? '#ef4444' : ceoEnergy < 50 ? '#f59e0b' : '#22c55e';
    const urgentAlert    = pendingCount >= 5 ? `<span class="ops-alert-pill">⚠ ${pendingCount} IN ATTESA</span>` : '';
    const strikingDrivers = gs.drivers.filter(d => d.id !== 'ceo' && d.isOnStrike).length;
    const burnoutDrivers  = gs.drivers.filter(d => d.id !== 'ceo' && d.burnout_until && (gs.day*24+gs.hour) < d.burnout_until).length;

    const typeIcon = { Airport:'✈', 'City-to-City':'⬡', Rail:'◈', Port:'⚓', Boat:'⛵', Transfer:'⊞' };

    // ── KPI STRIP ────────────────────────────────────────────────
    let html = `
    <div class="ops-kpi-strip">
        <div class="ops-kpi">
            <span class="ops-kpi-label">RICHIESTE PENDENTI</span>
            <span class="ops-kpi-value ${pendingCount > 0 ? 'text-yellow-300' : 'text-gray-500'}">${pendingCount}</span>
        </div>
        <div class="ops-kpi-sep"></div>
        <div class="ops-kpi">
            <span class="ops-kpi-label">AUTISTI ATTIVI</span>
            <span class="ops-kpi-value text-blue-400">${activeDrivers}<span class="ops-kpi-sub">/${gs.drivers.length}</span></span>
        </div>
        <div class="ops-kpi-sep"></div>
        <div class="ops-kpi">
            <span class="ops-kpi-label">FLOTTA OPERATIVA</span>
            <span class="ops-kpi-value text-cyan-400">${fleetActive}<span class="ops-kpi-sub"> veicoli</span></span>
        </div>
        <div class="ops-kpi-sep"></div>
        <div class="ops-kpi">
            <span class="ops-kpi-label">INCASSO OGGI</span>
            <span class="ops-kpi-value text-green-400">€${todayEarnings.toLocaleString('it-IT')}</span>
        </div>
        <div class="ops-kpi-sep"></div>
        <div class="ops-kpi" style="min-width:100px">
            <span class="ops-kpi-label">ENERGIA CEO</span>
            <div style="display:flex;align-items:center;gap:4px;margin-top:3px;width:100%">
                ${DS.progress(Math.round(ceoEnergy), ceoEnergy < 25 ? 'red' : ceoEnergy < 50 ? 'orange' : 'green')}
                <span style="font-size:9px;font-family:monospace;color:${stressColor};flex-shrink:0">${Math.round(ceoEnergy)}%</span>
            </div>
        </div>
        <div class="ml-auto flex items-center gap-2">
            ${urgentAlert}
            ${strikingDrivers > 0 ? `<span class="ops-alert-pill" style="background:rgba(239,68,68,0.2);border-color:#ef4444;color:#ef4444">🪧 ${strikingDrivers} SCIOPERO</span>` : ''}
            ${burnoutDrivers  > 0 ? `<span class="ops-alert-pill" style="background:rgba(249,115,22,0.2);border-color:#f97316;color:#f97316">🔥 ${burnoutDrivers} BURNOUT</span>` : ''}
            <button onclick="window.openMapOverlay()" class="ops-action-btn ops-action-btn--blue">🗺 LIVE MAP</button>
            <button onclick="assignAllRides()" class="ops-action-btn ops-action-btn--gold">⚡ SMISTA TUTTE</button>
        </div>
    </div>

    <!-- ── MAIN GRID ── -->
    <div class="ops-grid">

        <!-- LEFT: INCOMING REQUESTS -->
        <div class="ops-col">
            <div class="ops-col-header">
                <span class="ops-col-title">RICHIESTE IN ARRIVO</span>
                <span class="ops-col-badge ${pendingCount > 0 ? 'ops-col-badge--active' : ''}">${pendingCount}</span>
            </div>
            <div class="ops-ride-list">`;

    if (pendingCount === 0) {
        html += `<div class="ops-empty-state">
            <div class="text-2xl mb-2 opacity-30">📡</div>
            <div class="text-[10px] text-gray-600 uppercase tracking-widest">In attesa di chiamate...</div>
        </div>`;
    }

    gs.pendingRides.forEach(ride => {
        const isContract = ride.isContract;
        const fromName = ride.originName || ride.fromPoi?.name || '?';
        const toName   = ride.destinationName || ride.toPoi?.name || '?';
        const tIcon    = typeIcon[ride.routeType] || '⬡';
        const margin   = (ride.price || 0) - (ride.netCost || 0);
        const tierColors = { standard:'#6b7280', business:'#00f2ff', first:'#d4af37', ultra:'#f97316', presidential:'#c084ff' };
        const tColor = tierColors[ride.tier] || '#6b7280';

        html += `
            <div class="ops-ride-card ${isContract ? 'ops-ride-card--contract' : ''}" draggable="true" data-id="${ride.id}">
                <div class="ops-ride-tier" style="background:${tColor}20;border-color:${tColor}40;color:${tColor}">
                    ${isContract ? '🏢' : tIcon} ${(ride.tier || 'std').toUpperCase()}
                </div>
                <div class="ops-ride-route">${fromName} <span class="ops-ride-arrow">→</span> ${toName}</div>
                <div class="ops-ride-price">€${(ride.price || 0).toLocaleString('it-IT')}
                    ${isContract ? `<span class="ops-ride-margin ${margin >= 0 ? 'text-green-400' : 'text-red-400'}">+€${margin.toLocaleString('it-IT')}</span>` : ''}
                </div>
            </div>`;
    });

    html += `</div></div>

        <!-- RIGHT: DRIVER STATUS BOARD -->
        <div class="ops-col">
            <div class="ops-col-header">
                <span class="ops-col-title">STATO AUTISTI</span>
                <div class="flex items-center gap-2 text-[9px] font-mono">
                    <span class="text-blue-400">● ${activeDrivers} attivi</span>
                    <span class="text-orange-400">● ${restingDrivers} riposo</span>
                    <span class="text-green-400">● ${freeDrivers} liberi</span>
                </div>
            </div>
            <div class="ops-driver-list">`;

    gs.drivers.forEach(driver => {
        const car       = gs.fleet.find(c => c.id === driver.assignedCarId);
        const isResting = driver.status === 'resting';
        const isBusy    = driver.status === 'busy';
        const fatigue   = driver.fatigue || 0;
        const fatigueColor = fatigue >= 85 ? '#ef4444' : fatigue >= 60 ? '#f59e0b' : '#22c55e';
        const statusDot = isResting ? '#f97316' : isBusy ? '#3b82f6' : '#22c55e';
        const statusText = isResting ? `RIPOSO −${driver.restHoursLeft}h` : isBusy ? 'IN SERVIZIO' : 'DISPONIBILE';
        const restBtn = (!isResting && !isBusy && driver.id !== 'ceo' && fatigue >= 40)
            ? `<button onclick="sendDriverToRest('${driver.id}')" class="ops-mini-btn">RIPOSO</button>` : '';

        html += `
            <div class="ops-driver-row ${isResting ? 'opacity-50' : ''}" data-id="${driver.id}">
                <div class="ops-driver-status-dot" style="background:${statusDot}"></div>
                <div class="ops-driver-info">
                    <div class="ops-driver-name">${driver.name} ${restBtn}</div>
                    <div class="ops-driver-car">${car ? car.name : '— nessun veicolo —'}</div>
                </div>
                <div class="ops-driver-right">
                    <div class="ops-driver-status-label" style="color:${statusDot}">${statusText}</div>
                    <div class="ops-driver-queue">${driver.queue.length > 0 ? `coda: ${driver.queue.length}` : ''}</div>
                </div>
                <div class="ops-driver-bars">
                    <div class="ops-bar-wrap">
                        <div class="ops-bar-fill" id="prog-${driver.id}" style="background:#00f2ff;width:0%"></div>
                    </div>
                    ${driver.id !== 'ceo' ? `
                    <div class="ops-bar-wrap">
                        <div class="ops-bar-fill" style="background:${fatigueColor};width:${fatigue}%"></div>
                    </div>` : ''}
                </div>
            </div>`;
    });

    html += `</div></div></div>`;

    // Daily summary strip — shows yesterday's P&L (populated by engine.js processDailyRoutines)
    const _ds = gameState._dailySummary;
    if (_ds) {
        const _netColor = _ds.net >= 0 ? '#22c55e' : '#ef4444';
        const _netSign  = _ds.net >= 0 ? '+' : '';
        html += `
        <div class="ops-daily-summary">
            <span class="ops-daily-label">GIORNO ${_ds.day} — CHIUSURA</span>
            <span class="ops-daily-sep">·</span>
            <span style="color:${_netColor};font-weight:700;font-family:monospace">${_netSign}€${_ds.net.toLocaleString('it-IT')} netto</span>
            <span class="ops-daily-sep">·</span>
            <span class="ops-daily-item">Entrate <strong style="color:#22c55e">€${_ds.income.toLocaleString('it-IT')}</strong></span>
            <span class="ops-daily-sep">·</span>
            <span class="ops-daily-item">Uscite <strong style="color:#ef4444">€${_ds.expenses.toLocaleString('it-IT')}</strong></span>
            ${_ds.luxuryTax > 0 ? `<span class="ops-daily-sep">·</span><span class="ops-daily-item">Tax <strong style="color:#f59e0b">€${_ds.luxuryTax.toLocaleString('it-IT')}</strong></span>` : ''}
            <span class="ops-daily-sep">·</span>
            <span class="ops-daily-item">Cash <strong style="color:#60a5fa">€${_ds.cash.toLocaleString('it-IT')}</strong></span>
        </div>`;
    }

    container.innerHTML = html;
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

window.renderTabCorse = renderTabCorse;
