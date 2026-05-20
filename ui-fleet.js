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

    const _fleetHeader = DS.header({
        eyebrow: 'Gestione Flotta',
        title:   'Veicoli',
        subtitle: `${_fl.length} veicoli · ${_tierSub}`,
        actions: _seized > 0 ? DS.pill(`${_seized} fuori servizio`, 'red', true) : DS.pill(`${_active} operativi`, 'green'),
    }) + DS.kpiStrip([
        { label: 'Flotta',        val: _fl.length,                         },
        { label: 'Operativi',     val: _active,          color: _active < _fl.length ? 'gold' : 'green' },
        { label: 'Cond. media',   val: _avgCond + '%',   color: _condColor },
        { label: 'Fuori servizio',val: _seized,          color: _seized > 0 ? 'red' : 'green' },
    ]);

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
            ${outCount > 0 ? `<div class="text-[9px] text-red-400 font-bold mb-2 flex items-center justify-between gap-1">
                <span>🔴 ${outCount} auto ferme — deposito esaurito</span>
                <button onclick="window.emergencyRefuel()" class="btn-gold !bg-red-900/40 !text-red-300 !text-[7px] !py-0.5 !px-2 animate-pulse">🚨 Rifornimento Emergenza (3×)</button>
            </div>` : ''}
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
            <div class="grid grid-cols-3 gap-1 mb-3">
                <button onclick="buyTiresForDepot(1)"  class="btn-blue !text-[8px] !py-1">+1 set<br><span class="text-[7px] opacity-60">€800</span></button>
                <button onclick="buyTiresForDepot(5)"  class="btn-blue !text-[8px] !py-1">+5 set<br><span class="text-[7px] opacity-60">€3.500</span></button>
                <button onclick="buyTiresForDepot(10)" class="btn-gold !text-[8px] !py-1">+10 set<br><span class="text-[7px] opacity-60">€6.000</span></button>
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
                return `<div class="flex justify-between items-center border-t border-white/5 pt-2 mt-1">
                    <div class="text-[8px] text-gray-500">🏗️ ${cur.name} <span class="text-blue">Lv.${lvl}</span></div>
                    ${next
                        ? `<button onclick="upgradeFuelDepot()" class="btn-gold !text-[7px] !py-0.5 !px-1.5">Upgrade → ${next.name}<br><span class="opacity-60">€${upgCost.toLocaleString()}</span></button>`
                        : `<span class="text-[8px] text-green-400 font-bold">MAX</span>`
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
    <div class="flex items-center gap-2 mb-3 px-1">
        <span class="text-[8px] text-gray-500 uppercase tracking-widest">Gasolio Mercato</span>
        <span class="text-[9px] font-bold font-mono" style="color:${fpColor}">${fpTrend} €${fp.toFixed(4)}/L</span>
        <span class="text-[8px] text-gray-600">(aggiornamento orario)</span>
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
    const _bm = b => _brandMeta[b] || { color:'#9ca3af', bg:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.12)', icon:b.charAt(0).toUpperCase() };

    const filterBar = (allBrands.length > 1 || allTiers.length > 1) ? `
    <div class="mb-4">
        ${allBrands.length > 1 ? `
        <div class="text-[8px] text-gray-500 uppercase tracking-widest mb-2">Produttore</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px">
            <button onclick="window._fleetFilter.brand=null;renderTabFleet()"
                style="padding:12px 6px;border-radius:12px;border:1px solid ${!activeBrand ? 'rgba(212,175,55,0.55)' : 'rgba(255,255,255,0.1)'};background:${!activeBrand ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)'};text-align:center;cursor:pointer;transition:all .15s">
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
        <div class="text-[8px] text-gray-500 uppercase tracking-widest mb-1.5">Categoria</div>
        <div class="flex flex-wrap gap-1.5">
            <button onclick="window._fleetFilter.tier=null;renderTabFleet()"
                class="text-[8px] px-2 py-1 rounded-full border transition-colors"
                style="${!activeTier ? 'background:rgba(212,175,55,0.15);border-color:rgba(212,175,55,0.5);color:#d4af37;font-weight:700' : 'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12);color:#6b7280'}">
                Tutte
            </button>
            ${allTiers.map(t => {
                const cnt = gameState.fleet.filter(c => c.tier === t).length;
                const isActive = activeTier === t;
                const tierVal = isActive ? 'null' : `'${t}'`;
                return `<button onclick="window._fleetFilter.tier=${tierVal};renderTabFleet()"
                    class="text-[8px] px-2 py-1 rounded-full border transition-colors"
                    style="${isActive ? 'background:' + tierColors[t] + ';border-color:' + tierBorder[t] + ';color:#e5e7eb;font-weight:700' : 'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12);color:#9ca3af'}">
                    ${tierLabels[t]||t} <span style="opacity:0.6">${cnt}</span>
                </button>`;
            }).join('')}
        </div>` : ''}
    </div>` : '';

    const filteredFleet = (gameState.fleet || []).filter(car => {
        if (window._fleetFilter.brand && _getBrand(car) !== window._fleetFilter.brand) return false;
        if (window._fleetFilter.tier  && car.tier !== window._fleetFilter.tier) return false;
        return true;
    });

    const noResults = filteredFleet.length === 0
        ? `<div class="text-[10px] text-gray-600 text-center py-8">Nessun veicolo corrisponde ai filtri selezionati.</div>`
        : '';

    let html = _fleetHeader + `<div class="p-1">` + fuelTickerHtml + fuelDepotHtml + filterBar + `<div class="ds-eyebrow" style="margin:0 0 10px">Tua Flotta <span style="font-weight:400;color:var(--text-dim)">${filteredFleet.length}/${gameState.fleet.length}</span></div>` + noResults + `<div class="space-y-3 mb-6">`;

    filteredFleet.forEach(car => {
        if (!car.upgrades) car.upgrades = [];

        // Catalog lookup for image + electric type (remap legacy vehicleClass on the fly)
        const _VC_LG = { 'mercedes_e':'stellar_e_exec', 'mercedes_v':'stellar_v_carr', 'mercedes_sprinter':'stellar_v_carr', 'mercedes_s':'stellar_s_imp' };
        const _vc = _VC_LG[car.vehicleClass] || car.vehicleClass;
        const catalog = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : [])
            .find(c => c.vehicleClass === _vc || c.id === _vc || c.id === car.id);
        const isElectric = catalog?.fuel === 'electric';
        const cardImg = catalog?.img || 'assets/fleet/stellar-e-executive.jpg';

        // Energy level (charge for electric, fuel for gasoline)
        const energyPct = isElectric
            ? Math.floor(car.chargeLevel ?? 100)
            : (car.fuel !== undefined ? Math.floor(car.fuel) : 100);
        const energyColor = energyPct < 20 ? '#ff4060' : energyPct < 50 ? '#f59e0b' : (isElectric ? '#22c55e' : '#00f2ff');
        const energyIcon  = isElectric ? '⚡' : '⛽';

        const tirePct  = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
        const tireColor = tirePct < 30 ? '#ff4060' : tirePct < 60 ? '#f59e0b' : '#22c55e';
        const condPct   = Math.max(0, Math.floor(car.condition || 0));
        const condColor = condPct <= 10 ? '#ff4060' : condPct < 30 ? '#ef4444' : condPct < 60 ? '#f59e0b' : '#22c55e';
        const eh        = car.engineHealth !== undefined ? car.engineHealth : 100;
        const ehColor   = eh <= 0 ? '#ff4060' : eh < 30 ? '#ef4444' : eh < 60 ? '#f59e0b' : '#22c55e';

        const outReason = car.outOfService;
        const outLabel  = (outReason === 'fuel' && energyPct > 5) ? null
                        : outReason === 'fuel'   ? (isElectric ? '🔴 FERMA — Batteria scarica' : '🔴 FERMA — Serbatoio esaurito')
                        : outReason === 'tires'  ? '🔴 FERMA — Deposito Gomme esaurito'
                        : outReason === 'engine' ? '🔴 MOTORE FUSO — Riparazione urgente'
                        : null;
        const condWarn  = condPct <= 10 ? '🔴 FERMA — Officina urgente!' : condPct < 30 ? '⚠ Salute critica — incasso −15%' : '';

        const hasCentralina  = car.upgrades.includes('centralina');
        const hasSerbatoio   = car.upgrades.includes('serbatoio_ext');
        const hasVetriC      = car.upgrades.includes('vetri_oscurati');
        const hasTelepassCar = car.upgrades.includes('telepass_car');
        const tuningBadges   = [
            hasCentralina  ? '<span style="background:rgba(0,242,255,0.12);color:#00f2ff;border:1px solid rgba(0,242,255,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🔧+28%</span>' : '',
            hasSerbatoio   ? '<span style="background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.3);font-size:8px;padding:1px 5px;border-radius:6px">⛽−55%</span>' : '',
            hasVetriC      ? '<span style="background:rgba(168,85,247,0.12);color:#c084fc;border:1px solid rgba(168,85,247,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🕶−65%</span>' : '',
            hasTelepassCar ? '<span style="background:rgba(212,175,55,0.12);color:#d4af37;border:1px solid rgba(212,175,55,0.3);font-size:8px;padding:1px 5px;border-radius:6px">🛣−15%</span>' : '',
        ].filter(Boolean).join(' ');

        // Position tracking
        const assignedDriver = gameState.drivers.find(d => d.assignedCarId === car.id && d.id !== 'ceo');
        const poiName   = car.currentPoiId && typeof POIS !== 'undefined' && POIS[car.currentPoiId] ? POIS[car.currentPoiId].name : null;
        const isAtHub   = !car.currentPoiId || car.currentPoiId === 'roma';
        const isReturning = assignedDriver && assignedDriver._returning;
        let returnCostStr = '';
        if (!isAtHub && !isReturning && car.currentPoiId && typeof POIS !== 'undefined' && POIS[car.currentPoiId]) {
            const fp = POIS[car.currentPoiId], hp = POIS['roma'];
            if (fp && hp) {
                const R2 = 6371, dL = (hp.lat-fp.lat)*Math.PI/180, dG = (hp.lng-fp.lng)*Math.PI/180;
                const aa = Math.sin(dL/2)**2 + Math.cos(fp.lat*Math.PI/180)*Math.cos(hp.lat*Math.PI/180)*Math.sin(dG/2)**2;
                const d2 = R2*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa));
                const fc = Math.round(d2*0.18), tc = (hasTelepassCar || (typeof hasInvestment==='function' && hasInvestment('inv_telepass'))) ? 0 : Math.round(d2*0.08);
                returnCostStr = `€${(fc+tc).toLocaleString()} · ${Math.max(1,Math.ceil(d2/90))}h`;
            }
        }

        const repairCostCond = Math.max(500, (100 - condPct) * 85);
        const repairCostEng  = Math.max(800, (100 - eh) * 180);
        const borderClass    = outReason ? 'border-red-500/60' : condPct <= 10 ? 'border-orange-500/60' : 'border-white/10';

        html += `
        <div class="fleet-card-luxury ${borderClass}" style="${cardImg ? `--card-img:url('${cardImg}')` : ''}">
            ${cardImg ? `<div class="fleet-card-photo"></div>` : ''}
            <div class="fleet-card-glass">
                <!-- Header -->
                <div class="fleet-card-header">
                    <div class="flex-1 min-w-0">
                        <div class="fleet-card-brand truncate">
                            ${car.name}
                            ${car.isLease ? (() => {
                            const remDays = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
                            const remMonths = Math.ceil(remDays / 30);
                            const monthly = car.leaseMonthlyRate || Math.round((car.dailyCost||0)*30);
                            const penalty = Math.round(remMonths * monthly * 0.5);
                            return `<span class="text-[8px] text-blue-300 border border-blue-400/40 px-1 ml-1 rounded uppercase">Leasing</span>` +
                                   `<span class="text-[8px] text-gray-500 ml-1">· scade in ${remDays}g</span>` +
                                   `<span class="text-[8px] text-red-400/70 ml-1">· penale €${penalty.toLocaleString()}</span>`;
                        })() : ''}
                        </div>
                        <div class="fleet-card-tier ${isElectric ? 'fleet-card-electric' : ''}">
                            ${car.tier.toUpperCase()} · ${Math.floor((car.mileage||0)/1000)}k km
                            ${isElectric ? '<span class="ml-1 text-[8px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded">CO2 ESENTE</span>' : ''}
                            ${(car.mileage||0) > 0 && (car.mileage||0) % 5000 < 300 ? '<span class="ml-1 text-orange-400">⚠ Tagliando</span>' : ''}
                        </div>
                        ${tuningBadges ? `<div class="mt-1 flex gap-1 flex-wrap">${tuningBadges}</div>` : ''}
                        ${isReturning    ? `<div class="text-[9px] text-cyan-400 mt-0.5">🏠 In rientro all'Hub…</div>`
                          : poiName && !isAtHub ? `<div class="text-[9px] text-yellow-400 mt-0.5">📍 ${poiName}</div>`
                          : `<div class="text-[9px] text-green-400/60 mt-0.5">🏠 Hub Roma</div>`}
                        ${condWarn  ? `<div class="text-[9px] font-bold mt-0.5" style="color:${condColor}">${condWarn}</div>` : ''}
                        ${outLabel  ? `<div class="text-[9px] text-red-400 font-bold mt-0.5">${outLabel}</div>` : ''}
                    </div>
                    <button onclick="openCarModal('${car.id}')" class="btn-blue !py-1 !px-2 ml-2 shrink-0">Gestisci</button>
                </div>

                <!-- Stats bars -->
                <div class="fleet-card-stats">
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">🔧 Carrozzeria</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${condPct}%;background:${condColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${condColor}">${condPct}%</span>
                        ${condPct < 100 ? `
                        <button onclick="repairVehicle('${car.id}')" class="workshop-repair-btn" title="Ripara: €${repairCostCond.toLocaleString()}">🔩 €${repairCostCond.toLocaleString()}</button>
                        <button onclick="instantRepairDC('${car.id}')" class="text-[7px] bg-yellow-900/40 text-yellow-300 px-1 rounded hover:bg-yellow-800/50" title="Insta-Repair: 2 DC">⚡2DC</button>` : ''}
                    </div>
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">${energyIcon} ${isElectric ? 'Batteria' : 'Carburante'}</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${energyPct}%;background:${energyColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${energyColor}">${energyPct}%</span>
                    </div>
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">🔵 Gomme</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${tirePct}%;background:${tireColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${tireColor}">${tirePct}%</span>
                    </div>
                    <div class="fleet-stat-row">
                        <span class="fleet-stat-label">⚙️ Motore</span>
                        <div class="fleet-stat-bar"><div class="fleet-stat-fill" style="width:${eh}%;background:${ehColor}"></div></div>
                        <span class="text-[8px] font-mono" style="color:${ehColor}">${eh}%</span>
                        ${eh < 30 && eh > 0 ? '<span class="text-[8px] text-red-400 font-bold">⚠ −2×</span>' : ''}
                    </div>
                </div>

                <!-- Actions -->
                <div class="fleet-card-actions">
                    ${isElectric ? `
                    <button onclick="window.superchargeVehicle('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-green-600/50 bg-green-950/40 text-green-300 hover:bg-green-900/50 transition-colors">
                        ⚡ Supercharger<br><span class="text-[7px] opacity-60">€80 flat</span>
                    </button>` : `
                    <button onclick="window.buyStandardFuel('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-cyan-700/50 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40 transition-colors"
                        title="Distributore pubblico: prezzo pieno">
                        ⛽ Rifornisci<br><span class="text-[7px] opacity-60">€${Math.floor((100-(car.fuel||0))*0.5*(gameState.fuelPrice||1.85))}</span>
                    </button>
                    <button onclick="window.buyBlackMarketFuel('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-yellow-700/50 bg-yellow-950/30 text-yellow-400 hover:bg-yellow-900/40 transition-colors"
                        title="Gasolio Agricolo: −40%, 10% rischio motore">
                        🖤 Agricolo<br><span class="text-[7px] opacity-60">€${Math.floor((100-(car.fuel||0))*0.5*(gameState.fuelPrice||1.85)*0.60)}</span>
                    </button>`}
                    ${eh < 100 ? `
                    <button onclick="window.repairEngine('${car.id}')"
                        class="flex-1 text-[8px] py-1 px-1 rounded border border-orange-600/50 bg-orange-950/30 text-orange-300 hover:bg-orange-900/40 transition-colors">
                        🔧 Motore<br><span class="text-[7px] opacity-60">€${repairCostEng.toLocaleString()}</span>
                    </button>` : ''}
                </div>

                ${!isAtHub && !isReturning && assignedDriver && assignedDriver.status === 'idle' ? `
                <button onclick="window.returnToHub('${car.id}')"
                    class="w-full mt-1.5 text-[8px] py-1 px-2 rounded border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 transition-colors">
                    🏠 Ritorna all'Hub &nbsp;<span class="opacity-60">${returnCostStr}</span>
                </button>` : ''}
                ${car.isLease ? (() => {
                    const remDays   = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
                    const remMonths = Math.ceil(remDays / 30);
                    const monthly   = car.leaseMonthlyRate || Math.round((car.dailyCost||0)*30);
                    const penalty   = Math.round(remMonths * monthly * 0.5);
                    return `<button onclick="window.terminateLease('${car.id}')"
                        class="w-full mt-1.5 text-[8px] py-1 px-2 rounded border border-red-600/40 bg-red-950/30 text-red-400 hover:bg-red-900/40 transition-colors">
                        📋 Termina Leasing &nbsp;<span class="opacity-70">penale €${penalty.toLocaleString()}</span>
                    </button>`;
                })() : ''}
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

    html += `</div>
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
        html += `</div><h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-4">🔬 Prototipi Esclusivi</h3><div class="space-y-2">`;
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
            <div class="hud-card ${canBuy ? 'hover:border-gold/50' : 'opacity-60'}">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="text-xs font-bold text-white">${c.name}</div>
                        <div class="text-[9px] text-purple-400">${c.desc}</div>
                        <div class="text-[9px] text-gray-500">Tier: ${c.tier.toUpperCase()} · Min Rep: ${c.reqRep}★</div>
                        ${lockMsg ? `<div class="text-[9px] text-red-400 mt-0.5">${lockMsg}</div>` : ''}
                    </div>
                    ${isOwned
                        ? `<span class="text-green-400 text-[9px] font-bold">✓ In Flotta</span>`
                        : canBuy
                            ? `<button onclick="buyPrototypeCar('${c.id}')" class="btn-gold !text-[8px]">€${c.price.toLocaleString()}</button>`
                            : `<span class="text-gray-600 text-[9px] font-bold px-2">🔒</span>`
                    }
                </div>
            </div>`;
        });
    }

    // ── CONTRATTO MANUTENZIONE ─────────────────────────────────────────────
    const contractActive = gameState.maintenanceContract && gameState.day <= (gameState.maintenanceContractPaidUntilDay||0);
    const contractDaysLeft = contractActive ? gameState.maintenanceContractPaidUntilDay - gameState.day : 0;
    html += `
    <h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-5">🔧 Officina & Contratti</h3>
    <div class="hud-card mb-4 ${contractActive ? '!border-green-500/30 bg-green-950/10' : ''}">
        <div class="flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">Contratto di Manutenzione</div>
                <div class="text-[9px] text-gray-400">−30% su tutte le riparazioni · 7 giorni</div>
                ${contractActive ? `<div class="text-[9px] text-green-400 mt-0.5">✅ Attivo — ${contractDaysLeft}g rimasti</div>` : ''}
            </div>
            ${contractActive
                ? '<span class="text-green-500 text-[9px] font-bold">ATTIVO</span>'
                : `<button onclick="buyMaintenanceContract()" class="btn-gold !text-[8px]">€10.000 / 7g</button>`}
        </div>
    </div>`;

    // ── HUB CONQUEST ──────────────────────────────────────────────────────
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-2">🏛️ Conquista Hub</h3>
    <p class="text-[9px] text-gray-500 italic mb-3">Possiedi la concessione: incassi il 5% su ogni corsa che transita da lì.</p>
    <div class="space-y-2 mb-4">`;
    const hubIds = ['roma_fco','mil_mxp','mil_lin','nap_capo','olbia','ven_mp','venezia','firenze','bologna'];
    if (typeof POIS !== 'undefined') {
        hubIds.filter(id => POIS[id] && (gameState.unlockedRegions||[]).includes(POIS[id].region)).forEach(id => {
            const hub = POIS[id];
            const owned = (gameState.ownedHubs||[]).includes(id);
            const cost  = 50000 + Math.floor(hub.baseFlat * 200);
            const canBuy = !owned && (gameState.reputation||0) >= 2.5 && gameState.cash >= cost;
            html += `
            <div class="hud-card flex justify-between items-center ${owned ? '!border-gold/40 bg-gold/5' : ''}">
                <div>
                    <div class="text-xs font-bold text-white">${hub.name}${owned ? ' 🏛️' : ''}</div>
                    <div class="text-[9px] text-gray-500">${hub.region} · +5% tassa corse · €${Math.round(cost/1000)}k</div>
                </div>
                ${owned
                    ? `<button onclick="sellHub('${id}')" class="btn-gold !bg-red-900/30 !text-red-400 !text-[7px] !py-0.5">Cedi</button>`
                    : `<button onclick="buyHub('${id}')" class="${canBuy ? 'btn-gold' : 'btn-gold opacity-40'} !text-[8px] !py-1" ${canBuy ? '' : 'disabled'}>€${Math.round(cost/1000)}k</button>`
                }
            </div>`;
        });
    }
    html += `</div>`;

    container.innerHTML = html + `</div></div>`;
}


window.renderTabFleet = renderTabFleet;
