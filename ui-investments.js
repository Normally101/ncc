'use strict';
/* ui-investments.js — Chauffeur Empire
   renderTabInvestments: infrastrutture, holding, finanza.
   Dipendenze: engine.js, design-system.js */

function renderTabInvestments() {
    const container = document.getElementById('tab-container');
    const tierLabels = {
        1: 'Tier I — Consolidamento',
        2: 'Tier II — Espansione Business',
        3: 'Tier III — Lusso Estremo',
        4: 'Tier IV — Dominio del Mercato'
    };
    const tierIcons  = { 1:'🟢', 2:'🟡', 3:'🔴', 4:'💎' };
    const ownedCount = (gameState.investments||[]).length;
    const totalInvs  = typeof INVESTMENTS !== 'undefined' ? INVESTMENTS.length : 0;
    const passiveTotal = (typeof INVESTMENTS !== 'undefined' ? INVESTMENTS : [])
        .filter(i => gameState.investments.includes(i.id) && i.passive)
        .reduce((s, i) => s + i.passive, 0);
    const activeLoansTotal = (gameState.loans||[]).reduce((s,l)=>s+l.amount, 0);

    let html = DS.header({
        eyebrow: 'Patrimonio & Asset',
        title:   'Portfolio Investimenti',
        subtitle:`${ownedCount} / ${totalInvs} asset · Reddito passivo +€${passiveTotal.toLocaleString()}/g`,
    }) + DS.kpiStrip([
        { label:'Asset Attivi',    val: ownedCount,                                      color: ownedCount > 0 ? 'green' : '' },
        { label:'Reddito Passivo', val: '€' + passiveTotal.toLocaleString() + '/g',      color:'green' },
        { label:'Debito Attivo',   val: '€' + activeLoansTotal.toLocaleString(),         color: activeLoansTotal > 0 ? 'red' : 'green' },
        { label:'Budget',          val: '€' + ((gameState.cash||0)/1000).toFixed(0)+'k', color:'blue' },
    ]);
    let currentTier = 0;

    INVESTMENTS.forEach(i => {
        const owned = gameState.investments.includes(i.id);
        if (i.tier !== currentTier) {
            if (currentTier > 0) html += `</div>`;
            html += `<div class="ds-eyebrow" style="margin:${currentTier>0?'20':'0'}px 0 10px">${tierIcons[i.tier]||''} ${tierLabels[i.tier]||'Tier '+i.tier}</div><div style="display:flex;flex-direction:column;gap:8px">`;
            currentTier = i.tier;
        }
        const underConstruction = (gameState.constructions || []).find(c => c.invId === i.id);
        const daysLeft = underConstruction ? Math.max(0, underConstruction.completesDay - gameState.day) : 0;
        const dcCost   = underConstruction ? Math.ceil(daysLeft * 2) : 0;
        const reqMet = !i.reqRides || (gameState.questStats?.totalRides||0) >= i.reqRides;
        html += `<div class="ds-card${owned?' ds-card--gold':''}" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:700;color:${owned?'var(--gold)':'var(--text)'};">${i.name}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${i.desc}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
                    ${i.passive     ? DS.pill('+€'+i.passive.toLocaleString()+'/g', 'green')  : ''}
                    ${i.dailyUpkeep ? DS.pill('−€'+i.dailyUpkeep.toLocaleString()+'/g', 'red') : ''}
                    ${i.buildTime   ? DS.pill('🏗 '+i.buildTime+'g build', 'orange')           : ''}
                    ${i.reqRides && !owned ? DS.pill('🔒 '+i.reqRides+' corse', reqMet?'green':'red') : ''}
                </div>
            </div>
            <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                ${owned
                    ? `${DS.pill('✓ ATTIVO', 'green')}
                       ${DS.btn({ label:'Vendi 40%', color:'red', onclick:`window.sellInvestment('${i.id}')`, size:'sm' })}`
                    : underConstruction
                        ? `<div style="text-align:center">
                             <div style="font-size:11px;font-weight:700;color:var(--orange)">🏗️ ${daysLeft}g</div>
                             ${DS.btn({ label:`⚡ ${dcCost} DC`, color:'gold', onclick:`window.speedUpConstruction('${i.id}')`, size:'sm' })}
                           </div>`
                        : DS.btn({ label:'€'+i.price.toLocaleString(), color:'gold', onclick:`buyInvestment('${i.id}')`, disabled:!reqMet, size:'sm' })}
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
            <div class="text-[8px] flex justify-between items-center gap-1">
                <span class="text-gray-500">Prestito #${l.id}</span>
                <span class="text-red-400">Residuo: €${l.amount.toLocaleString()} (${((l.rate||0.08)*100).toFixed(0)}%/mese)</span>
                <button onclick="repayLoan(${l.id})" class="btn-gold !text-[7px] !py-0.5 !px-1.5 shrink-0" ${gameState.cash < l.amount ? 'disabled style="opacity:0.4"' : ''}>Salda</button>
            </div>`).join('')}
        </div>` : ''}
        <div class="space-y-2">`;
    } else {
        html += `</div>`;
    }

    // Venture Capital / M&A section
    const vcAgencies = typeof VENTURE_AGENCIES !== 'undefined' ? VENTURE_AGENCIES : [];
    const myStakes = gameState.ventureCapital || [];
    if (vcAgencies.length > 0) {
        html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-6">💼 Venture Capital & M&A</h3><div class="space-y-3">`;
        vcAgencies.forEach(agency => {
            const stake = myStakes.find(s => s.agencyId === agency.id);
            const ownedPct  = stake ? stake.stakePercent : 0;
            const dailyReturn = stake ? Math.floor(agency.dailyIncome * ownedPct / 100) : 0;
            const locked = gameState.reputation < agency.minRep || gameState.cash < agency.minCash;
            const riskColor = agency.riskLevel === 'high' ? '#ef4444' : agency.riskLevel === 'medium' ? '#f59e0b' : '#22c55e';
            const costFor5  = Math.floor(agency.valuation * 5 / 100);
            const costFor10 = Math.floor(agency.valuation * 10 / 100);
            html += `
            <div class="hud-card ${locked ? 'opacity-50' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <div class="text-xs font-bold text-white">${agency.icon} ${agency.name}</div>
                        <div class="text-[9px] text-gray-400 mt-0.5">${agency.desc}</div>
                        <div class="flex gap-3 mt-1 text-[8px]">
                            <span class="text-gray-500">Val: <span class="text-white font-mono">€${(agency.valuation/1e6).toFixed(1)}M</span></span>
                            <span class="text-gray-500">+€${agency.dailyIncome.toLocaleString()}/g (100%)</span>
                            <span style="color:${riskColor}">Rischio: ${agency.riskLevel.toUpperCase()}</span>
                        </div>
                        ${locked ? `<div class="text-[8px] text-red-400 mt-1">🔒 Min. ${agency.minRep}★ Rep · €${agency.minCash.toLocaleString()}</div>` : ''}
                    </div>
                    ${stake ? `<div class="text-right ml-2">
                        <div class="text-[10px] font-bold text-green-400">${ownedPct}%</div>
                        <div class="text-[8px] text-green-300 font-mono">+€${dailyReturn}/g</div>
                    </div>` : ''}
                </div>
                ${!locked ? `<div class="flex gap-1 flex-wrap">
                    <button onclick="window.acquireVentureStake('${agency.id}', 5)" class="btn-blue !text-[7px] !py-0.5">+5%<br><span class="opacity-60">€${costFor5.toLocaleString()}</span></button>
                    <button onclick="window.acquireVentureStake('${agency.id}', 10)" class="btn-gold !text-[7px] !py-0.5">+10%<br><span class="opacity-60">€${costFor10.toLocaleString()}</span></button>
                    ${stake ? `<button onclick="window.divestVentureStake('${agency.id}')" class="btn-gold !bg-red-900/30 !text-red-300 !text-[7px] !py-0.5">Vendi (75%)</button>` : ''}
                </div>` : ''}
            </div>`;
        });
        html += `</div>`;
    }

    // ── HOLDING FINANZIARIA ─────────────────────────────────────────
    const subTemplates = typeof HOLDING_SUBSIDIARIES !== 'undefined' ? HOLDING_SUBSIDIARIES : (window.HOLDING_SUBSIDIARIES || []);
    const holdingIncorporated = gameState.holding?.incorporated;
    const holdingDailyIncome = (gameState.holding?.subsidiaries || []).reduce((sum, sid) => {
        const t = subTemplates.find(s => s.id === sid);
        return sum + (t ? t.dailyIncome : 0);
    }, 0);
    html += `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3 mt-6">🏢 Holding Finanziaria</h3>`;
    if (!holdingIncorporated) {
        html += `<div class="hud-card mb-4">
            <div class="text-xs font-bold text-white mb-1">Costituisci una Holding</div>
            <div class="text-[9px] text-gray-400 mb-2">Fondare una holding ti permette di acquisire aziende sussidiarie che generano reddito passivo ogni giorno, indipendentemente dalle tue corse.</div>
            <div class="text-[9px] text-gray-500 mb-3">Requisiti: <span class="text-gold">4.0★</span> reputazione · <span class="text-gold">€200.000</span></div>
            <button onclick="incorporateHolding()" class="btn-gold w-full ${(gameState.reputation||0) >= 4.0 && gameState.cash >= 200000 ? '' : 'opacity-40'}" ${(gameState.reputation||0) >= 4.0 && gameState.cash >= 200000 ? '' : 'disabled'}>
                🏢 Fondazione Holding — €200.000
            </button>
        </div>`;
    } else {
        html += `<div class="hud-card !border-green-500/20 bg-green-950/5 mb-3 flex justify-between items-center">
            <div>
                <div class="text-xs font-bold text-white">Holding Attiva</div>
                <div class="text-[9px] text-green-400 font-mono mt-0.5">+€${holdingDailyIncome.toLocaleString()}/g dividendi</div>
            </div>
            <div class="text-[9px] text-gray-500">${(gameState.holding.subsidiaries||[]).length} sussidiarie</div>
        </div>
        <div class="space-y-2 mb-4">
        ${subTemplates.map(sub => {
            const owned = (gameState.holding.subsidiaries || []).includes(sub.id);
            return `<div class="hud-card flex justify-between items-start gap-2 ${owned ? '!border-green-500/20 bg-green-950/5' : ''}">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white">${sub.name}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5">${sub.desc}</div>
                    <div class="text-[9px] text-green-400 font-mono mt-0.5">+€${sub.dailyIncome.toLocaleString()}/g</div>
                </div>
                <div class="shrink-0">
                    ${owned
                        ? `<button onclick="divestSubsidiary('${sub.id}')" class="btn-gold !bg-red-900/30 !text-red-400 !text-[7px] !py-0.5">Cedi 60%</button>`
                        : `<button onclick="acquireSubsidiary('${sub.id}')" class="btn-gold !text-[8px] !py-1 ${gameState.cash >= sub.cost ? '' : 'opacity-40'}" ${gameState.cash >= sub.cost ? '' : 'disabled'}>€${Math.round(sub.cost/1000)}k</button>`
                    }
                </div>
            </div>`;
        }).join('')}
        </div>`;
    }

    // ── BAROMETRO DELLA COLLERA ──
    if (typeof renderBarometroWidget === 'function') html += renderBarometroWidget();

    // ── SINDACATI / HOLDINGS P2P ──
    if (typeof renderP2PHoldingsSection === 'function') html += renderP2PHoldingsSection();

    // ── CONSORZI COOPERATIVI ──
    if (typeof renderP2PConsorziSection === 'function') html += renderP2PConsorziSection();

    // ── ISPETTORATO DEL LAVORO ──
    if (typeof renderIspettoratoSection === 'function') html += renderIspettoratoSection();

    container.innerHTML = html + '</div>';
}
window.renderTabInvestments = renderTabInvestments;
