'use strict';
/* ui-fleet.js — renderTabFleet */

function renderTabFleet() {
    const container = document.getElementById('tab-container');

    // Fleet KPI data
    const _fl        = gameState.fleet || [];
    const _active    = _fl.filter(c => !c.outOfService && !c.isSeized).length;
    const _avgCond   = _fl.length ? Math.round(_fl.reduce((s, c) => s + (c.condition || 0), 0) / _fl.length) : 0;
    const _condColor = _avgCond < 40 ? 'red' : _avgCond < 70 ? 'gold' : 'green';
    const _seized    = _fl.filter(c => c.isSeized || c.outOfService).length;
    const _tierCounts = { standard: 0, business: 0, vip: 0, ultra: 0 };
    _fl.forEach(c => { if (_tierCounts[c.tier] !== undefined) _tierCounts[c.tier]++; });
    const _tierSub = Object.entries(_tierCounts).filter(([,v]) => v > 0).map(([k,v]) => `${v} ${k}`).join(' · ');

    const _fleetHeader = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Gestione Flotta</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Veicoli</div>
            <div style="font-size:11px;color:#8b949e;margin-top:4px">${_fl.length} veicoli · ${_tierSub}</div>
        </div>
        ${_seized > 0
            ? `<span style="font-size:9px;font-weight:700;color:#f85149;background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.3);border-radius:4px;padding:3px 8px">${_seized} fuori servizio</span>`
            : `<span style="font-size:9px;font-weight:700;color:#3fb950;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:3px 8px">${_active} operativi</span>`}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Flotta</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:#e6edf3">${_fl.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Operativi</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${_active < _fl.length ? '#d4af37' : '#3fb950'}">${_active}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Cond. media</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${_condColor === 'red' ? '#f85149' : _condColor === 'gold' ? '#d4af37' : '#3fb950'}">${_avgCond}%</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Fuori servizio</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${_seized > 0 ? '#f85149' : '#3fb950'}">${_seized}</div>
        </div>
    </div>`;

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
        <div style="background:rgba(88,166,255,0.04);border:1px solid rgba(88,166,255,0.25);border-radius:6px;padding:14px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-size:10px;color:#58a6ff;font-weight:700;text-transform:uppercase;letter-spacing:.08em">🛢️ Deposito Aziendale</div>
                <div style="font-size:10px;font-weight:700;color:${pColor}">€${price}/L</div>
            </div>
            ${outCount > 0 ? `<div style="font-size:9px;color:#f87171;font-weight:700;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:4px">
                <span>🔴 ${outCount} auto ferme — deposito esaurito</span>
                <button onclick="window.emergencyRefuel()" style="background:rgba(127,29,29,0.4);border:1px solid rgba(185,28,28,0.5);color:#fca5a5;font-size:7px;padding:2px 8px;border-radius:4px;cursor:pointer">🚨 Rifornimento Emergenza (3×)</button>
            </div>` : ''}
            <div style="font-size:8px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Gasolio</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <div class="fuel-bar-bg" style="flex:1"><div class="fuel-bar-fill" style="width:${pct}%; background:${tankColor}"></div></div>
                <span style="font-size:9px;font-family:monospace;color:${tankColor}">${tank.toLocaleString()}/${cap.toLocaleString()}L</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:12px">
                <button onclick="buyFuelForDepot(5000)"  style="background:#0d1b2d;border:1px solid #1d3557;color:#58a6ff;font-size:8px;padding:4px;border-radius:4px;cursor:pointer;text-align:center">+5k L<br><span style="font-size:7px;opacity:.6">€${Math.floor(5000*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
                <button onclick="buyFuelForDepot(15000)" style="background:#0d1b2d;border:1px solid #1d3557;color:#58a6ff;font-size:8px;padding:4px;border-radius:4px;cursor:pointer;text-align:center">+15k L<br><span style="font-size:7px;opacity:.6">€${Math.floor(15000*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
                <button onclick="buyFuelForDepot(${cap})" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;font-size:8px;padding:4px;border-radius:4px;cursor:pointer;text-align:center">Fill<br><span style="font-size:7px;opacity:.6">€${Math.floor((cap-tank)*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div style="font-size:8px;color:#6b7280;text-transform:uppercase">Treni di Gomme</div>
                <span style="font-size:10px;font-weight:700;font-family:monospace;color:${gommeColor}">${gomme} set</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:12px">
                <button onclick="buyTiresForDepot(1)"  style="background:#0d1b2d;border:1px solid #1d3557;color:#58a6ff;font-size:8px;padding:4px;border-radius:4px;cursor:pointer;text-align:center">+1 set<br><span style="font-size:7px;opacity:.6">€800</span></button>
                <button onclick="buyTiresForDepot(5)"  style="background:#0d1b2d;border:1px solid #1d3557;color:#58a6ff;font-size:8px;padding:4px;border-radius:4px;cursor:pointer;text-align:center">+5 set<br><span style="font-size:7px;opacity:.6">€3.500</span></button>
                <button onclick="buyTiresForDepot(10)" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;font-size:8px;padding:4px;border-radius:4px;cursor:pointer;text-align:center">+10 set<br><span style="font-size:7px;opacity:.6">€6.000</span></button>
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
                return `<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;margin-top:4px">
                    <div style="font-size:8px;color:#6b7280">🏗️ ${cur.name} <span style="color:#58a6ff">Lv.${lvl}</span></div>
                    ${next
                        ? `<button onclick="upgradeFuelDepot()" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;font-size:7px;padding:2px 6px;border-radius:4px;cursor:pointer">Upgrade → ${next.name}<br><span style="opacity:.6">€${upgCost.toLocaleString()}</span></button>`
                        : `<span style="font-size:8px;color:#4ade80;font-weight:700">MAX</span>`
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
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:0 4px">
        <span style="font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Gasolio Mercato</span>
        <span style="font-size:9px;font-weight:700;font-family:monospace;color:${fpColor}">${fpTrend} €${fp.toFixed(4)}/L</span>
        <span style="font-size:8px;color:#4b5563">(aggiornamento orario)</span>
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
    const _bm = b => _brandMeta[b] || { color:'#9ca3af', bg:'rgba(0,0,0,0.05)', border:'rgba(0,0,0,0.15)', icon:b.charAt(0).toUpperCase() };

    const filterBar = (allBrands.length > 1 || allTiers.length > 1) ? `
    <div style="margin-bottom:16px">
        ${allBrands.length > 1 ? `
        <div style="font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Produttore</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px">
            <button onclick="window._fleetFilter.brand=null;renderTabFleet()"
                style="padding:12px 6px;border-radius:12px;border:1px solid ${!activeBrand ? 'rgba(212,175,55,0.55)' : 'rgba(0,0,0,0.10)'};background:${!activeBrand ? 'rgba(212,175,55,0.12)' : 'rgba(0,0,0,0.04)'};text-align:center;cursor:pointer;transition:all .15s">
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
        <div style="font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Categoria</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
            <button onclick="window._fleetFilter.tier=null;renderTabFleet()"
                style="font-size:8px;padding:4px 8px;border-radius:99px;border:1px solid;cursor:pointer"
                style="${!activeTier ? 'background:rgba(212,175,55,0.15);border-color:rgba(212,175,55,0.5);color:#d4af37;font-weight:700' : 'background:rgba(0,0,0,0.04);border-color:rgba(0,0,0,0.12);color:#6b7280'}">
                Tutte
            </button>
            ${allTiers.map(t => {
                const cnt = gameState.fleet.filter(c => c.tier === t).length;
                const isActive = activeTier === t;
                const tierVal = isActive ? 'null' : `'${t}'`;
                return `<button onclick="window._fleetFilter.tier=${tierVal};renderTabFleet()"
                    style="font-size:8px;padding:4px 8px;border-radius:99px;border:1px solid;cursor:pointer"
                    style="${isActive ? 'background:' + tierColors[t] + ';border-color:' + tierBorder[t] + ';color:#e5e7eb;font-weight:700' : 'background:rgba(0,0,0,0.04);border-color:rgba(0,0,0,0.12);color:#9ca3af'}">
                    ${tierLabels[t]||t} <span style="opacity:0.6">${cnt}</span>
                </button>`;
            }).join('')}
        </div>` : ''}
    </div>` : '';

    const filteredFleet = (gameState.fleet || [])
        .filter(car => {
            if (window._fleetFilter.brand && _getBrand(car) !== window._fleetFilter.brand) return false;
            if (window._fleetFilter.tier  && car.tier !== window._fleetFilter.tier) return false;
            return true;
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const noResults = filteredFleet.length === 0
        ? `<div style="font-size:10px;color:#4b5563;text-align:center;padding:32px 0">Nessun veicolo corrisponde ai filtri selezionati.</div>`
        : '';

    // Pre-compute model groups for headers and bulk actions
    const _modelGroups = {};
    filteredFleet.forEach(c => {
        const m = c.name || 'Altro';
        if (!_modelGroups[m]) _modelGroups[m] = [];
        _modelGroups[m].push(c);
    });
    const _showModelHeaders = filteredFleet.length >= 3;
    let _curModelHeader = null;

    let html = _fleetHeader + `<div>` + fuelTickerHtml + fuelDepotHtml + filterBar;

    // ── FLEET TABLE ─────────────────────────────────────────────────────
    if (filteredFleet.length === 0) {
        html += noResults;
    } else {
        const _TH = t => `<th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap">${t}</th>`;
        html += `
        <div class="ce-glass" style="overflow:hidden;margin-bottom:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,0.28);border-bottom:1px solid rgba(255,255,255,0.06)">
                <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace">Flotta · ${filteredFleet.length} / ${gameState.fleet.length} veicoli</span>
            </div>
            <table style="width:100%;border-collapse:collapse">
                <thead><tr style="background:rgba(255,255,255,0.02)">${_TH('Veicolo')}${_TH('Condiz.')}${_TH('Carburante')}${_TH('Gomme')}${_TH('Autista')}${_TH('Stato')}<th></th></tr></thead>
                <tbody>`;

        filteredFleet.forEach(car => {
            // Model group header row
            const _carModel = car.name || 'Altro';
            if (_showModelHeaders && _carModel !== _curModelHeader) {
                _curModelHeader = _carModel;
                const _mg = _modelGroups[_carModel];
                const _mgAvgCond = Math.round(_mg.reduce((s, c) => s + (c.condition || 0), 0) / _mg.length);
                const _mgCondColor = _mgAvgCond < 40 ? '#ef4444' : _mgAvgCond < 70 ? '#f59e0b' : '#22c55e';
                const _mgNeedsRepair = _mg.some(c => (c.condition || 0) < 90);
                const _mgRepairIds = JSON.stringify(_mg.filter(c => (c.condition || 0) < 100).map(c => c.id));
                html += `<tr style="background:rgba(0,0,0,0.18)"><td colspan="7" style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,0.05)">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <span style="font-size:10px;font-weight:800;color:var(--text-muted)">${_carModel} <span style="font-size:9px;font-weight:400;color:#6b7280">${_mg.length}× · cond. media <span style="color:${_mgCondColor}">${_mgAvgCond}%</span></span></span>
                        ${_mgNeedsRepair ? `<button onclick="window.bulkRepairFleet(${_mgRepairIds})" style="font-size:8px;padding:3px 8px;border-radius:5px;border:1px solid rgba(212,175,55,0.35);background:rgba(212,175,55,0.08);color:#c9a227;cursor:pointer">🔧 Ripara gruppo</button>` : ''}
                    </div>
                </td></tr>`;
            }

            if (!car.upgrades) car.upgrades = [];

            // Catalog lookup
            const _VC_LG = { 'mercedes_e':'stellar_e_exec', 'mercedes_v':'stellar_v_carr', 'mercedes_sprinter':'stellar_v_carr', 'mercedes_s':'stellar_s_imp' };
            const _vc = _VC_LG[car.vehicleClass] || car.vehicleClass;
            const catalog = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : [])
                .find(c => c.vehicleClass === _vc || c.id === _vc || c.id === car.id);
            const isElectric = catalog?.fuel === 'electric';

            // Stats
            const energyPct = isElectric ? Math.floor(car.chargeLevel ?? 100) : (car.fuel !== undefined ? Math.floor(car.fuel) : 100);
            const energyColor = energyPct < 20 ? '#ff4060' : energyPct < 50 ? '#f59e0b' : (isElectric ? '#22c55e' : '#00f2ff');
            const tirePct   = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
            const tireColor = tirePct < 30 ? '#ff4060' : tirePct < 60 ? '#f59e0b' : '#22c55e';
            const condPct   = Math.max(0, Math.floor(car.condition || 0));
            const condColor = condPct <= 10 ? '#ff4060' : condPct < 30 ? '#ef4444' : condPct < 60 ? '#f59e0b' : '#22c55e';
            const eh        = car.engineHealth !== undefined ? car.engineHealth : 100;

            const outReason = car.outOfService;
            const outLabel  = (outReason === 'fuel' && energyPct > 5) ? null
                            : outReason === 'fuel'   ? (isElectric ? '🔴 Batteria scarica' : '🔴 Serbatoio esaurito')
                            : outReason === 'tires'  ? '🔴 Gomme esaurite'
                            : outReason === 'engine' ? '🔴 Motore fuso'
                            : null;

            const hasCentralina  = car.upgrades.includes('centralina');
            const hasSerbatoio   = car.upgrades.includes('serbatoio_ext');
            const hasVetriC      = car.upgrades.includes('vetri_oscurati');
            const hasTelepassCar = car.upgrades.includes('telepass_car');
            const tuningBadges   = [
                hasCentralina  ? '<span style="background:rgba(0,242,255,0.12);color:#00f2ff;border:1px solid rgba(0,242,255,0.3);font-size:7px;padding:1px 4px;border-radius:4px">+28%</span>' : '',
                hasSerbatoio   ? '<span style="background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.3);font-size:7px;padding:1px 4px;border-radius:4px">⛽−55%</span>' : '',
                hasVetriC      ? '<span style="background:rgba(168,85,247,0.12);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-size:7px;padding:1px 4px;border-radius:4px">🕶−65%</span>' : '',
                hasTelepassCar ? '<span style="background:rgba(212,175,55,0.12);color:#d4af37;border:1px solid rgba(212,175,55,0.3);font-size:7px;padding:1px 4px;border-radius:4px">🛣−15%</span>' : '',
            ].filter(Boolean).join(' ');

            const assignedDriver = gameState.drivers.find(d => d.assignedCarId === car.id && d.id !== 'ceo');
            const repairCostCond = Math.max(500, (100 - condPct) * 85);
            const repairCostEng  = Math.max(800, (100 - eh) * 180);

            // Tier badge
            const _tColors = { standard:'#6b7280', business:'#00f2ff', vip:'#d4af37', ultra:'#f97316' };
            const _tc = _tColors[car.tier] || '#6b7280';
            const tierBadge = `<span style="font-size:8px;font-weight:700;padding:2px 6px;border-radius:4px;background:${_tc}18;color:${_tc};border:1px solid ${_tc}40;white-space:nowrap">${(car.tier||'std').toUpperCase()}${isElectric ? ' ⚡' : ''}</span>`;

            // Status badge
            let statusLabel, statusColor;
            if (outLabel)                                            { statusLabel = '● FERMA';      statusColor = '#ef4444'; }
            else if (condPct < 30)                                   { statusLabel = '⚠ CRITICA';    statusColor = '#f59e0b'; }
            else if (assignedDriver && assignedDriver.status==='busy') { statusLabel = '● IN CORSA';  statusColor = '#3b82f6'; }
            else if (assignedDriver)                                 { statusLabel = '● LIBERA';     statusColor = '#22c55e'; }
            else                                                     { statusLabel = '— NO AUTISTA'; statusColor = '#6b7280'; }

            // Lease badge
            const leaseBadge = car.isLease ? (() => {
                const remDays = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
                return `<span style="font-size:7px;color:#93c5fd;border:1px solid rgba(147,197,253,0.3);padding:1px 5px;border-radius:4px;margin-left:4px">Leasing · ${remDays}g</span>`;
            })() : '';

            html += `
            <tr class="ce-table-row" style="border-bottom:1px solid rgba(255,255,255,0.04)">
                <td style="padding:11px 14px;max-width:200px">
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${car.name}${leaseBadge}</div>
                    <div style="margin-top:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">${tierBadge}${tuningBadges ? `<span style="display:inline-flex;gap:3px;flex-wrap:wrap">${tuningBadges}</span>` : ''}</div>
                    ${outLabel ? `<div style="font-size:9px;color:#ef4444;font-weight:700;margin-top:3px">${outLabel}</div>` : ''}
                </td>
                <td style="padding:11px 14px;min-width:110px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <div class="ce-progress-bar" style="flex:1;min-width:50px"><div class="ce-progress-fill" style="width:${condPct}%;background:${condColor}"></div></div>
                        <span style="font-size:9px;font-family:monospace;color:${condColor};width:28px;text-align:right;flex-shrink:0">${condPct}%</span>
                    </div>
                    ${eh < 70 ? `<div style="font-size:8px;color:#f97316;margin-top:3px">⚙ Motore ${eh}%</div>` : ''}
                </td>
                <td style="padding:11px 14px;min-width:110px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <div class="ce-progress-bar" style="flex:1;min-width:50px"><div class="ce-progress-fill" style="width:${energyPct}%;background:${energyColor}"></div></div>
                        <span style="font-size:9px;font-family:monospace;color:${energyColor};width:28px;text-align:right;flex-shrink:0">${energyPct}%</span>
                    </div>
                </td>
                <td style="padding:11px 14px;min-width:100px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <div class="ce-progress-bar" style="flex:1;min-width:40px"><div class="ce-progress-fill" style="width:${tirePct}%;background:${tireColor}"></div></div>
                        <span style="font-size:9px;font-family:monospace;color:${tireColor};width:28px;text-align:right;flex-shrink:0">${tirePct}%</span>
                    </div>
                </td>
                <td style="padding:11px 14px">
                    <div style="font-size:11px;color:${assignedDriver ? 'var(--text)' : '#ef4444'};${assignedDriver ? '' : 'font-weight:700'}">${assignedDriver ? assignedDriver.name : '—'}</div>
                    <div style="font-size:9px;color:var(--text-dim);margin-top:1px">${Math.floor((car.mileage||0)/1000)}k km</div>
                </td>
                <td style="padding:11px 14px;white-space:nowrap">
                    <span style="font-size:9px;font-weight:700;color:${statusColor}">${statusLabel}</span>
                </td>
                <td style="padding:11px 14px;text-align:right;white-space:nowrap">
                    ${condPct < 100 ? `<button onclick="repairVehicle('${car.id}')" style="font-size:8px;padding:3px 7px;border-radius:5px;border:1px solid rgba(212,175,55,0.35);background:rgba(212,175,55,0.08);color:#d4af37;cursor:pointer;margin-right:6px" title="Ripara carrozzeria">🔧 €${repairCostCond.toLocaleString()}</button>` : ''}
                    ${eh < 70 ? `<button onclick="window.repairEngine('${car.id}')" style="font-size:8px;padding:3px 7px;border-radius:5px;border:1px solid rgba(249,115,22,0.35);background:rgba(249,115,22,0.08);color:#f97316;cursor:pointer;margin-right:6px" title="Ripara motore">⚙ €${repairCostEng.toLocaleString()}</button>` : ''}
                    <button onclick="openCarModal('${car.id}')" style="font-size:9px;padding:4px 10px;border-radius:6px;border:1px solid rgba(0,242,255,0.3);background:rgba(0,242,255,0.08);color:#00f2ff;cursor:pointer;font-weight:700">Gestisci →</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    // Seized cars notice
    const seized = gameState.seizedCars || [];
    if (seized.length > 0) {
        html += `<div style="background:rgba(248,81,73,0.04);border:1px solid rgba(248,81,73,0.3);border-radius:6px;padding:14px;margin-bottom:16px"><div style="font-size:10px;color:#f85149;font-weight:700;text-transform:uppercase;margin-bottom:8px">🚨 Veicoli Sequestrati</div>`;
        seized.forEach(sc => {
            const daysLeft = Math.max(0, sc.releaseDay - gameState.day);
            html += `<div style="font-size:9px;color:#8b949e;display:flex;justify-content:space-between"><span>🚗 ${sc.carName}</span><span style="color:#f85149">Rilascio fra ${daysLeft}g</span></div>`;
        });
        html += `</div>`;
    }

    html += `
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
        html += `<div style="font-size:9px;color:#d4af37;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #21262d;padding-bottom:6px;margin-bottom:12px;margin-top:20px">🔬 Prototipi Esclusivi</div><div style="display:flex;flex-direction:column;gap:8px">`;
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
            <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px;${!canBuy && !isOwned ? 'opacity:.6' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-size:11px;font-weight:700;color:#e6edf3">${c.name}</div>
                        <div style="font-size:9px;color:#c084fc">${c.desc}</div>
                        <div style="font-size:9px;color:#8b949e">Tier: ${c.tier.toUpperCase()} · Min Rep: ${c.reqRep}★</div>
                        ${lockMsg ? `<div style="font-size:9px;color:#f85149;margin-top:2px">${lockMsg}</div>` : ''}
                    </div>
                    ${isOwned
                        ? `<span style="font-size:9px;font-weight:700;color:#3fb950">✓ In Flotta</span>`
                        : canBuy
                            ? `<button onclick="buyPrototypeCar('${c.id}')" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">€${c.price.toLocaleString()}</button>`
                            : `<span style="font-size:9px;color:#6b7280;font-weight:700;padding:0 8px">🔒</span>`
                    }
                </div>
            </div>`;
        });
    }

    // ── CONTRATTO MANUTENZIONE ─────────────────────────────────────────────
    const contractActive = gameState.maintenanceContract && gameState.day <= (gameState.maintenanceContractPaidUntilDay||0);
    const contractDaysLeft = contractActive ? gameState.maintenanceContractPaidUntilDay - gameState.day : 0;
    html += `
    <div style="font-size:9px;color:#d4af37;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #21262d;padding-bottom:6px;margin-bottom:12px;margin-top:24px">🔧 Officina &amp; Contratti</div>
    <div style="background:${contractActive ? 'rgba(63,185,80,0.04)' : '#161b22'};border:1px solid ${contractActive ? 'rgba(63,185,80,0.25)' : '#21262d'};border-radius:6px;padding:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:11px;font-weight:700;color:#e6edf3">Contratto di Manutenzione</div>
                <div style="font-size:9px;color:#8b949e;margin-top:2px">−30% su tutte le riparazioni · 7 giorni</div>
                ${contractActive ? `<div style="font-size:9px;color:#3fb950;margin-top:2px">✅ Attivo — ${contractDaysLeft}g rimasti</div>` : ''}
            </div>
            ${contractActive
                ? '<span style="font-size:9px;font-weight:700;color:#3fb950">ATTIVO</span>'
                : `<button onclick="buyMaintenanceContract()" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">€10.000 / 7g</button>`}
        </div>
    </div>`;

    // ── HUB CONQUEST ──────────────────────────────────────────────────────
    html += `<div style="font-size:9px;color:#d4af37;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #21262d;padding-bottom:6px;margin-bottom:8px;margin-top:8px">🏛️ Conquista Hub</div>
    <div style="font-size:9px;color:#8b949e;font-style:italic;margin-bottom:12px">Possiedi la concessione: incassi il 5% su ogni corsa che transita da lì.</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">`;
    const hubIds = ['roma_fco','mil_mxp','mil_lin','nap_capo','olbia','ven_mp','venezia','firenze','bologna'];
    if (typeof POIS !== 'undefined') {
        hubIds.filter(id => POIS[id] && (gameState.unlockedRegions||[]).includes(POIS[id].region)).forEach(id => {
            const hub = POIS[id];
            const owned = (gameState.ownedHubs||[]).includes(id);
            const cost  = 50000 + Math.floor(hub.baseFlat * 200);
            const canBuy = !owned && (gameState.reputation||0) >= 2.5 && gameState.cash >= cost;
            html += `
            <div style="background:${owned ? 'rgba(212,175,55,0.04)' : '#161b22'};border:1px solid ${owned ? 'rgba(212,175,55,0.3)' : '#21262d'};border-radius:6px;padding:12px;display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:11px;font-weight:700;color:#e6edf3">${hub.name}${owned ? ' 🏛️' : ''}</div>
                    <div style="font-size:9px;color:#8b949e">${hub.region} · +5% tassa corse · €${Math.round(cost/1000)}k</div>
                </div>
                ${owned
                    ? `<button onclick="sellHub('${id}')" style="background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;padding:4px 8px;border-radius:4px;font-size:8px;cursor:pointer">Cedi</button>`
                    : `<button onclick="buyHub('${id}')" ${canBuy ? '' : 'disabled'} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 10px;border-radius:4px;font-size:9px;cursor:pointer;${canBuy ? '' : 'opacity:.4;cursor:not-allowed'}">€${Math.round(cost/1000)}k</button>`
                }
            </div>`;
        });
    }
    html += `</div>`;

    container.innerHTML = html + `</div>`;
}


window.bulkRepairFleet = function(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    let count = 0;
    ids.forEach(id => {
        const car = (gameState.fleet || []).find(c => c.id === id);
        if (car && (car.condition || 0) < 100 && typeof repairVehicle === 'function') {
            repairVehicle(id);
            count++;
        }
    });
    if (count > 0) renderTabFleet();
};

window.renderTabFleet = renderTabFleet;
