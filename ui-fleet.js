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

    const _fleetHeader = `<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
            <div class="em-sec">Gestione Flotta</div>
            <div style="font-size:20px;font-weight:800;margin-top:3px">Veicoli</div>
            <div style="font-size:11px;color:var(--em-muted);margin-top:3px">${_fl.length} veicoli · ${_tierSub}</div>
        </div>
        ${_seized > 0
            ? `<span class="em-pill em-pill--red">${_seized} fuori servizio</span>`
            : `<span class="em-pill em-pill--green">${_active} operativi</span>`}
    </div>
    <div class="em-kpibar">
        <div class="k"><div class="l">Flotta</div><div class="v">${_fl.length}</div></div>
        <div class="k"><div class="l">Operativi</div><div class="v" style="color:${_active < _fl.length ? 'var(--em-gold)' : 'var(--em-green)'}">${_active}</div></div>
        <div class="k"><div class="l">Cond. media</div><div class="v" style="color:${_condColor === 'red' ? 'var(--em-red)' : _condColor === 'gold' ? 'var(--em-gold)' : 'var(--em-green)'}">${_avgCond}%</div></div>
        <div class="k"><div class="l">Fuori servizio</div><div class="v" style="color:${_seized > 0 ? 'var(--em-red)' : 'var(--em-green)'}">${_seized}</div></div>
    </div>`;

    // Depot block (gasolio + gomme)
    const hasDepot = typeof hasInvestment === 'function' && hasInvestment('inv_fuel_depot');
    let fuelDepotHtml = '';
    if (hasDepot) {
        const tank      = Math.floor(gameState.fuelTank || 0);
        const cap       = gameState.fuelTankCapacity || 50000;
        const pct       = Math.min(100, Math.round(tank / cap * 100));
        const price     = (gameState.fuelPrice || 1.85).toFixed(2);
        const pColor    = (gameState.fuelPrice||1.85) < 1.68 ? 'var(--em-green)' : (gameState.fuelPrice||1.85) > 2.20 ? 'var(--em-red)' : 'var(--em-amber)';
        const tankColor = pct < 15 ? 'var(--em-red)' : pct < 40 ? 'var(--em-amber)' : 'var(--em-blue)';
        const gomme     = gameState.depositoGomme || 0;
        const gommeColor= gomme === 0 ? 'var(--em-red)' : gomme < 3 ? 'var(--em-amber)' : 'var(--em-green)';
        const outCount  = gameState.fleet.filter(c => c.outOfService).length;
        fuelDepotHtml = `
        <div class="em-card" style="padding:14px;margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div class="em-sec" style="color:var(--em-blue)">🛢️ Deposito Aziendale</div>
                <div style="font-size:12px;font-weight:800;color:${pColor}">€${price}/L</div>
            </div>
            ${outCount > 0 ? `<div style="font-size:11px;color:var(--em-red);font-weight:700;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:4px">
                <span>🔴 ${outCount} auto ferme — deposito esaurito</span>
                <button ${ceAct('emergencyRefuel', [])} class="em-redbtn" style="padding:3px 9px;font-size:9.5px">🚨 Rifornimento Emergenza (3×)</button>
            </div>` : ''}
            <div class="em-sec" style="margin-bottom:4px">Gasolio</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span class="em-prog" style="flex:1;height:7px"><i style="width:${pct}%;background:${tankColor}"></i></span>
                <span style="font-size:11px;font-weight:700;color:${tankColor}">${tank.toLocaleString()}/${cap.toLocaleString()}L</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:12px">
                <button ${ceAct('buyFuelForDepot', [5000])}  class="em-bbtn" style="text-align:center;padding:5px">+5k L<br><span style="font-size:9px;opacity:.7">€${Math.floor(5000*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
                <button ${ceAct('buyFuelForDepot', [15000])} class="em-bbtn" style="text-align:center;padding:5px">+15k L<br><span style="font-size:9px;opacity:.7">€${Math.floor(15000*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
                <button ${ceAct('buyFuelForDepot', [cap])} class="em-goldbtn" style="text-align:center;padding:5px">Fill<br><span style="font-size:9px;opacity:.8">€${Math.floor((cap-tank)*(gameState.fuelPrice||1.85)).toLocaleString()}</span></button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div class="em-sec">Treni di Gomme</div>
                <span style="font-size:12px;font-weight:800;color:${gommeColor}">${gomme} set</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:12px">
                <button ${ceAct('buyTiresForDepot', [1])}  class="em-bbtn" style="text-align:center;padding:5px">+1 set<br><span style="font-size:9px;opacity:.7">€800</span></button>
                <button ${ceAct('buyTiresForDepot', [5])}  class="em-bbtn" style="text-align:center;padding:5px">+5 set<br><span style="font-size:9px;opacity:.7">€3.500</span></button>
                <button ${ceAct('buyTiresForDepot', [10])} class="em-goldbtn" style="text-align:center;padding:5px">+10 set<br><span style="font-size:9px;opacity:.8">€6.000</span></button>
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
                return `<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--em-line2);padding-top:8px;margin-top:4px">
                    <div style="font-size:10px;color:var(--em-muted)">🏗️ ${cur.name} <span style="color:var(--em-blue);font-weight:700">Lv.${lvl}</span></div>
                    ${next
                        ? `<button ${ceAct('upgradeFuelDepot', [])} class="em-goldbtn" style="font-size:9.5px;padding:3px 8px">Upgrade → ${next.name} · €${upgCost.toLocaleString()}</button>`
                        : `<span class="em-pill em-pill--green">MAX</span>`
                    }
                </div>`;
            })()}
        </div>`;
    }

    // Fuel price ticker (always visible)
    const fp = gameState.fuelPrice || 1.85;
    const fpColor = fp < 1.68 ? 'var(--em-green)' : fp > 2.20 ? 'var(--em-red)' : 'var(--em-amber)';
    const fpTrend = fp < 1.68 ? '📉' : fp > 2.20 ? '📈' : '➡️';
    const fuelTickerHtml = !hasDepot ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:0 2px">
        <span class="em-sec">Gasolio Mercato</span>
        <span style="font-size:11px;font-weight:800;color:${fpColor}">${fpTrend} €${fp.toFixed(4)}/L</span>
        <span style="font-size:10px;color:var(--em-dim)">(aggiornamento orario)</span>
    </div>` : '';

    // ── Fleet filter bar ──────────────────────────────────────
    window._fleetFilter = window._fleetFilter || { brand: null, tier: null };
    const _getBrand = car => car.name ? car.name.split(' ')[0] : 'Altro';
    const allBrands = [...new Set((gameState.fleet || []).map(_getBrand))].sort();
    const allTiers  = [...new Set((gameState.fleet || []).map(c => c.tier))];
    const tierOrder = ['standard','business','vip','ultra'];
    allTiers.sort((a,b) => tierOrder.indexOf(a) - tierOrder.indexOf(b));
    const tierLabels = { standard:'Standard', business:'Business', vip:'VIP', ultra:'Ultra' };
    const activeBrand = window._fleetFilter.brand;
    const activeTier  = window._fleetFilter.tier;

    const filterBar = (allBrands.length > 1 || allTiers.length > 1) ? `
    <div style="margin-bottom:10px">
        ${allBrands.length > 1 ? `
        <div class="em-sec" style="margin-bottom:6px">Produttore</div>
        <div class="em-tabs" style="margin-bottom:10px">
            <button ${ceAct('ceSetRender', ['_fleetFilter', 'brand', null, 'renderTabFleet'])} class="em-tab${!activeBrand ? ' on' : ''}">🚗 Tutti <span style="opacity:.7">${gameState.fleet.length}</span></button>
            ${allBrands.map(b => {
                const cnt = gameState.fleet.filter(c => _getBrand(c) === b).length;
                const isActive = activeBrand === b;
                const brandVal = isActive ? 'null' : `'${b}'`;
                return `<button ${ceAct('ceSetRender', ['_fleetFilter', 'brand', brandVal, 'renderTabFleet'])} class="em-tab${isActive ? ' on' : ''}">${b} <span style="opacity:.7">${cnt}</span></button>`;
            }).join('')}
        </div>` : ''}
        ${allTiers.length > 1 ? `
        <div class="em-sec" style="margin-bottom:6px">Categoria</div>
        <div class="em-tabs">
            <button ${ceAct('ceSetRender', ['_fleetFilter', 'tier', null, 'renderTabFleet'])} class="em-tab${!activeTier ? ' on' : ''}">Tutte</button>
            ${allTiers.map(t => {
                const cnt = gameState.fleet.filter(c => c.tier === t).length;
                const isActive = activeTier === t;
                const tierVal = isActive ? 'null' : `'${t}'`;
                return `<button ${ceAct('ceSetRender', ['_fleetFilter', 'tier', tierVal, 'renderTabFleet'])} class="em-tab${isActive ? ' on' : ''}">${tierLabels[t]||t} <span style="opacity:.7">${cnt}</span></button>`;
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
        ? `<div class="em-empty">Nessun veicolo corrisponde ai filtri selezionati.</div>`
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
        html += `
        <div class="em-card" style="margin-bottom:7px">
            <div class="em-ch"><span class="t">Flotta</span><span class="a" style="color:var(--em-muted)">${filteredFleet.length} / ${gameState.fleet.length} veicoli</span></div>
            <table class="em-tbl">
                <thead><tr><th>Veicolo</th><th>Condiz.</th><th>Carburante</th><th>Gomme</th><th>Autista</th><th>Stato</th><th></th></tr></thead>
                <tbody>`;

        filteredFleet.forEach(car => {
            // Model group header row
            const _carModel = car.name || 'Altro';
            if (_showModelHeaders && _carModel !== _curModelHeader) {
                _curModelHeader = _carModel;
                const _mg = _modelGroups[_carModel];
                const _mgAvgCond = Math.round(_mg.reduce((s, c) => s + (c.condition || 0), 0) / _mg.length);
                const _mgCondColor = _mgAvgCond < 40 ? 'var(--em-red)' : _mgAvgCond < 70 ? 'var(--em-amber)' : 'var(--em-green)';
                const _mgNeedsRepair = _mg.some(c => (c.condition || 0) < 90);
                const _mgRepairIds = _mg.filter(c => (c.condition || 0) < 100).map(c => c.id);
                html += `<tr style="background:#0d1117"><td colspan="7" style="padding:6px 12px">
                    <div style="display:flex;align-items:center;justify-content:space-between">
                        <span style="font-size:11px;font-weight:800;color:var(--em-ink)">${_carModel} <span style="font-weight:500;color:var(--em-muted)">${_mg.length}× · cond. media <span style="color:${_mgCondColor};font-weight:700">${_mgAvgCond}%</span></span></span>
                        ${_mgNeedsRepair ? `<button ${ceAct('bulkRepairFleet', [_mgRepairIds])} class="em-goldbtn" style="font-size:9.5px;padding:3px 9px">🔧 Ripara gruppo</button>` : ''}
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
            const energyColor = energyPct < 20 ? 'var(--em-red)' : energyPct < 50 ? 'var(--em-amber)' : (isElectric ? 'var(--em-green)' : 'var(--em-blue)');
            const tirePct   = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
            const tireColor = tirePct < 30 ? 'var(--em-red)' : tirePct < 60 ? 'var(--em-amber)' : 'var(--em-green)';
            const condPct   = Math.max(0, Math.floor(car.condition || 0));
            const condColor = condPct <= 10 ? 'var(--em-red)' : condPct < 30 ? 'var(--em-red)' : condPct < 60 ? 'var(--em-amber)' : 'var(--em-green)';
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
                hasCentralina  ? '<span class="em-pill em-pill--blue">+28%</span>' : '',
                hasSerbatoio   ? '<span class="em-pill em-pill--green">⛽−55%</span>' : '',
                hasVetriC      ? '<span class="em-pill em-pill--violet">🕶−65%</span>' : '',
                hasTelepassCar ? '<span class="em-pill em-pill--gold">🛣−15%</span>' : '',
            ].filter(Boolean).join(' ');

            const assignedDriver = gameState.drivers.find(d => d.assignedCarId === car.id && d.id !== 'ceo');
            // Prezzo dalla funzione canonica: la formula era ricopiata qui e in
            // ui-staff.js, e divergeva da quella davvero addebitata.
            const repairCostCond = window.repairCostFor(car);
            const repairCostEng  = Math.max(800, (100 - eh) * 180);

            // Tier badge
            const _tCls = { standard:'em-pill--gray', business:'em-pill--blue', vip:'em-pill--gold', ultra:'em-pill--red' };
            const tierBadge = `<span class="em-pill ${_tCls[car.tier] || 'em-pill--gray'}">${(car.tier||'std').toUpperCase()}${isElectric ? ' ⚡' : ''}</span>`;

            // Status badge
            let statusLabel, statusCls;
            if (outLabel)                                            { statusLabel = '● Ferma';      statusCls = 'em-pill--red'; }
            else if (condPct < 30)                                   { statusLabel = '⚠ Critica';    statusCls = 'em-pill--gold'; }
            else if (assignedDriver && assignedDriver.status==='busy') { statusLabel = '● In corsa';  statusCls = 'em-pill--blue'; }
            else if (assignedDriver)                                 { statusLabel = '● Libera';     statusCls = 'em-pill--green'; }
            else                                                     { statusLabel = '— No autista'; statusCls = 'em-pill--gray'; }

            // Lease badge
            const leaseBadge = car.isLease ? (() => {
                const remDays = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
                return `<span class="em-pill em-pill--blue" style="margin-left:4px">Leasing · ${remDays}g</span>`;
            })() : '';

            html += `
            <tr>
                <td style="max-width:200px">
                    <div style="font-weight:700">${car.name}${leaseBadge}</div>
                    <div style="margin-top:4px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">${tierBadge}${tuningBadges ? `<span style="display:inline-flex;gap:3px;flex-wrap:wrap">${tuningBadges}</span>` : ''}</div>
                    ${outLabel ? `<div style="font-size:10px;color:var(--em-red);font-weight:700;margin-top:3px">${outLabel}</div>` : ''}
                </td>
                <td style="min-width:110px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <span class="em-prog" style="width:56px"><i style="width:${condPct}%;background:${condColor}"></i></span>
                        <span style="font-size:9.5px;font-weight:700;color:${condColor};width:28px;text-align:right;flex-shrink:0">${condPct}%</span>
                    </div>
                    ${eh < 70 ? `<div style="font-size:9.5px;color:var(--em-amber);margin-top:3px">⚙ Motore ${eh}%</div>` : ''}
                </td>
                <td style="min-width:110px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <span class="em-prog" style="width:56px"><i style="width:${energyPct}%;background:${energyColor}"></i></span>
                        <span style="font-size:9.5px;font-weight:700;color:${energyColor};width:28px;text-align:right;flex-shrink:0">${energyPct}%</span>
                    </div>
                </td>
                <td style="min-width:100px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <span class="em-prog" style="width:56px"><i style="width:${tirePct}%;background:${tireColor}"></i></span>
                        <span style="font-size:9.5px;font-weight:700;color:${tireColor};width:28px;text-align:right;flex-shrink:0">${tirePct}%</span>
                    </div>
                </td>
                <td>
                    <div style="color:${assignedDriver ? 'var(--em-ink)' : 'var(--em-red)'};${assignedDriver ? '' : 'font-weight:700'}">${assignedDriver ? assignedDriver.name : '—'}</div>
                    <div style="font-size:9.5px;color:var(--em-dim);margin-top:1px">${Math.floor((car.mileage||0)/1000)}k km</div>
                </td>
                <td style="white-space:nowrap"><span class="em-pill ${statusCls}">${statusLabel}</span></td>
                <td class="r" style="white-space:nowrap">
                    ${condPct < 100 ? `<button ${ceAct('payToRepairCar', [car.id])} class="em-goldbtn" style="font-size:9.5px;padding:3px 8px;margin-right:5px" title="Ripara carrozzeria">🔧 €${repairCostCond.toLocaleString()}</button>` : ''}
                    ${eh < 70 ? `<button ${ceAct('repairEngine', [car.id])} class="em-pill" style="border:1px solid #f0d2a8;background:#fdeede;color:var(--em-amber);cursor:pointer;font-size:9.5px;padding:4px 8px;margin-right:5px" title="Ripara motore">⚙ €${repairCostEng.toLocaleString()}</button>` : ''}
                    <button ${ceAct('openCarModal', [car.id])} class="em-bbtn" style="padding:5px 11px">Gestisci →</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    // Seized cars notice
    const seized = gameState.seizedCars || [];
    if (seized.length > 0) {
        html += `<div class="em-card" style="border-color:#f0c4bd;padding:14px;margin-bottom:7px"><div class="em-sec" style="color:var(--em-red);margin-bottom:8px">🚨 Veicoli Sequestrati</div>`;
        seized.forEach(sc => {
            const daysLeft = Math.max(0, sc.releaseDay - gameState.day);
            html += `<div style="font-size:11px;color:var(--em-muted);display:flex;justify-content:space-between;padding:2px 0"><span>🚗 ${sc.carName}</span><span style="color:var(--em-red);font-weight:700">Rilascio fra ${daysLeft}g</span></div>`;
        });
        html += `</div>`;
    }

    html += `
    <div ${ceAct('hubNavigate', ['showroom'])} class="em-card"
         style="margin-bottom:7px;padding:14px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;border-color:#1a2535;background:#0d1a2a">
        <div>
            <div style="font-size:12.5px;font-weight:800;color:var(--em-blue)">🚘 Acquisto Veicoli</div>
            <div style="font-size:10.5px;color:var(--em-muted);margin-top:2px">Vai allo Showroom per configurare e acquistare nuovi veicoli</div>
        </div>
        <div style="font-size:18px;color:var(--em-blue)">→</div>
    </div>`;

    const _totalRides = gameState.questStats?.totalRides || 0;
    const _hasEVHub   = gameState.hasEVHub || false;

    // Prototype / exclusive vehicles
    if (typeof PROTOTYPE_CARS !== 'undefined' && PROTOTYPE_CARS.length > 0) {
        html += `<div class="em-sec" style="border-bottom:1px solid var(--em-line);padding-bottom:6px;margin:16px 0 10px">🔬 Prototipi Esclusivi</div><div style="display:flex;flex-direction:column;gap:6px">`;
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
            <div class="em-card" style="padding:12px;${!canBuy && !isOwned ? 'opacity:.6' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-weight:700">${c.name}</div>
                        <div style="font-size:10px;color:var(--em-violet)">${c.desc}</div>
                        <div style="font-size:10px;color:var(--em-muted)">Tier: ${c.tier.toUpperCase()} · Min Rep: ${c.reqRep}★</div>
                        ${lockMsg ? `<div style="font-size:10px;color:var(--em-red);margin-top:2px">${lockMsg}</div>` : ''}
                    </div>
                    ${isOwned
                        ? `<span class="em-pill em-pill--green">✓ In Flotta</span>`
                        : canBuy
                            ? `<button ${ceAct('buyPrototypeCar', [c.id])} class="em-goldbtn">€${c.price.toLocaleString()}</button>`
                            : `<span style="font-size:13px;color:var(--em-dim);padding:0 8px">🔒</span>`
                    }
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── CONTRATTO MANUTENZIONE ─────────────────────────────────────────────
    const contractActive = gameState.maintenanceContract && gameState.day <= (gameState.maintenanceContractPaidUntilDay||0);
    const contractDaysLeft = contractActive ? gameState.maintenanceContractPaidUntilDay - gameState.day : 0;
    html += `
    <div class="em-sec" style="border-bottom:1px solid var(--em-line);padding-bottom:6px;margin:18px 0 10px">🔧 Officina &amp; Contratti</div>
    <div class="em-card" style="padding:14px;margin-bottom:7px;${contractActive ? 'border-color:#bfe6cd' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-weight:700">Contratto di Manutenzione</div>
                <div style="font-size:10.5px;color:var(--em-muted);margin-top:2px">−30% su tutte le riparazioni · 7 giorni</div>
                ${contractActive ? `<div style="font-size:10.5px;color:var(--em-green-d);margin-top:2px">✅ Attivo — ${contractDaysLeft}g rimasti</div>` : ''}
            </div>
            ${contractActive
                ? '<span class="em-pill em-pill--green">Attivo</span>'
                : `<button ${ceAct('buyMaintenanceContract', [])} class="em-goldbtn">€10.000 / 7g</button>`}
        </div>
    </div>`;

    // ── HUB CONQUEST ──────────────────────────────────────────────────────
    html += `<div class="em-sec" style="border-bottom:1px solid var(--em-line);padding-bottom:6px;margin:8px 0">🏛️ Conquista Hub</div>
    <div style="font-size:10.5px;color:var(--em-muted);font-style:italic;margin-bottom:10px">Possiedi la concessione: incassi il 5% su ogni corsa che transita da lì.</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">`;
    const hubIds = ['roma_fco','mil_mxp','mil_lin','nap_capo','olbia','ven_mp','venezia','firenze','bologna'];
    if (typeof POIS !== 'undefined') {
        hubIds.filter(id => POIS[id] && (gameState.unlockedRegions||[]).includes(POIS[id].region)).forEach(id => {
            const hub = POIS[id];
            const owned = (gameState.ownedHubs||[]).includes(id);
            const cost  = 50000 + Math.floor(hub.baseFlat * 200);
            const canBuy = !owned && (gameState.reputation||0) >= 2.5 && gameState.cash >= cost;
            html += `
            <div class="em-card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;${owned ? 'border-color:#ecd9a0' : ''}">
                <div>
                    <div style="font-weight:700">${hub.name}${owned ? ' 🏛️' : ''}</div>
                    <div style="font-size:10px;color:var(--em-muted)">${hub.region} · +5% tassa corse · €${Math.round(cost/1000)}k</div>
                </div>
                ${owned
                    ? `<button ${ceAct('sellHub', [id])} class="em-redbtn" style="padding:4px 10px;font-size:10px">Cedi</button>`
                    : `<button ${ceAct('buyHub', [id])} ${canBuy ? '' : 'disabled'} class="em-goldbtn" style="${canBuy ? '' : 'opacity:.4;cursor:not-allowed'}">€${Math.round(cost/1000)}k</button>`
                }
            </div>`;
        });
    }
    html += `</div>`;

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div></div>`;
}


window.bulkRepairFleet = async function(ids) {
    if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch (_) {}
    }
    if (!Array.isArray(ids) || !ids.length) return;
    let count = 0;
    for (const id of ids) {
        const car = (gameState.fleet || []).find(c => c.id === id);
        if (car && (car.condition || 0) < 100 && typeof window.payToRepairCar === 'function') {
            await window.payToRepairCar(id);
            count++;
        }
    }
    if (count > 0 && typeof renderTabFleet === 'function') renderTabFleet();
};

window.renderTabFleet = renderTabFleet;
