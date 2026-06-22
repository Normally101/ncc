'use strict';
/* ui-investments.js — Chauffeur Empire
   renderTabInvestments: infrastrutture, holding, finanza. */

function renderTabInvestments() {
    const container = document.getElementById('tab-container');

    const tierLabels = {
        1: 'Tier I — Consolidamento',
        2: 'Tier II — Espansione Business',
        3: 'Tier III — Lusso Estremo',
        4: 'Tier IV — Dominio del Mercato',
    };
    const ownedCount    = (gameState.investments||[]).length;
    const totalInvs     = typeof INVESTMENTS !== 'undefined' ? INVESTMENTS.length : 0;
    const passiveTotal  = (typeof INVESTMENTS !== 'undefined' ? INVESTMENTS : [])
        .filter(i => (gameState.investments||[]).includes(i.id) && i.passive)
        .reduce((s, i) => s + i.passive, 0);
    const activeLoansTotal = (gameState.loans||[]).reduce((s,l)=>s+l.amount, 0);

    const _pill = (t, c) => `<span style="display:inline-flex;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;font-family:monospace;background:${c}18;border:1px solid ${c}44;color:${c}">${t}</span>`;
    const _btn  = (t, fn, c, dis) => {
        const bg = c==='gold'?'#fff8e8':c==='green'?'#0d2116':c==='red'?'#1e0d0d':c==='blue'?'#f3f6f9':'#ffffff';
        const bd = c==='gold'?'#c79a2a':c==='green'?'#1a4731':c==='red'?'#471a1a':c==='blue'?'#1e3a5f':'#d6dee8';
        const tc = c==='gold'?'#c79a2a':c==='green'?'#1aa06a':c==='red'?'#db5746':c==='blue'?'#2f74c0':'#6a7480';
        return `<button ${dis?'':fn} ${dis?'disabled':''} style="background:${bg};border:1px solid ${bd};color:${tc};padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};opacity:${dis?.45:1};font-family:inherit;white-space:nowrap">${t}</button>`;
    };
    const _SEC = t => `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin:20px 0 8px;font-weight:600">${t}</div>`;

    let html = `
<div style="padding:16px;max-width:800px">

    <div style="padding-bottom:16px;border-bottom:1px solid #21262d;margin-bottom:16px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Patrimonio & Asset</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3;letter-spacing:-.01em">Portfolio Investimenti</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${ownedCount} / ${totalInvs} asset · Reddito passivo +€${passiveTotal.toLocaleString()}/g</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Asset Attivi</div>
            <div style="font-size:18px;font-weight:700;color:${ownedCount>0?'#1aa06a':'#1f2733'};font-family:monospace">${ownedCount}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Reddito Passivo</div>
            <div style="font-size:18px;font-weight:700;color:#1aa06a;font-family:monospace">€${passiveTotal.toLocaleString()}<span style="font-size:10px">/g</span></div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Debito Attivo</div>
            <div style="font-size:18px;font-weight:700;color:${activeLoansTotal>0?'#db5746':'#1aa06a'};font-family:monospace">€${activeLoansTotal.toLocaleString()}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Budget</div>
            <div style="font-size:18px;font-weight:700;color:#2f74c0;font-family:monospace">€${((gameState.cash||0)/1000).toFixed(0)}k</div>
        </div>
    </div>`;

    // ── INVESTMENTS BY TIER ───────────────────────────────────────
    if (typeof INVESTMENTS !== 'undefined') {
        let currentTier = 0;
        let tierOpen = false;
        INVESTMENTS.forEach(i => {
            const owned = (gameState.investments||[]).includes(i.id);
            if (i.tier !== currentTier) {
                if (tierOpen) html += `</div>`;
                html += `${_SEC(tierLabels[i.tier]||'Tier '+i.tier)}<div style="display:flex;flex-direction:column;gap:6px" class="ce-stagger">`;
                currentTier = i.tier;
                tierOpen = true;
            }
            const uc       = (gameState.constructions||[]).find(c => c.invId === i.id);
            const daysLeft = uc ? Math.max(0, uc.completesDay - gameState.day) : 0;
            const dcCost   = uc ? Math.ceil(daysLeft * 2) : 0;
            const reqMet   = !i.reqRides || (gameState.questStats?.totalRides||0) >= i.reqRides;

            html += `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:#161b22;border:1px solid ${owned?'#c79a2a':'#d6dee8'};border-radius:6px;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:${owned?'#c79a2a':'#1f2733'}">${i.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.4">${i.desc}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
                        ${i.passive     ? _pill('+€'+i.passive.toLocaleString()+'/g', '#1aa06a')  : ''}
                        ${i.dailyUpkeep ? _pill('−€'+i.dailyUpkeep.toLocaleString()+'/g', '#db5746') : ''}
                        ${i.buildTime   ? _pill(i.buildTime+'g build', '#e0922e')                  : ''}
                        ${i.reqRides && !owned ? _pill(i.reqRides+' corse', reqMet?'#1aa06a':'#db5746') : ''}
                    </div>
                </div>
                <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-top:2px">
                    ${owned
                        ? `${_pill('✓ ATTIVO', '#1aa06a')}
                           ${_btn('Vendi 40%', ceAct('sellInvestment', [i.id]), 'red', false)}`
                        : uc
                            ? `<div style="text-align:center">
                                 <div style="font-size:11px;font-weight:700;color:#e0922e;font-family:monospace">${daysLeft}g rimasti</div>
                                 ${_btn('⚡ '+dcCost+' DC', ceAct('speedUpConstruction', [i.id]), 'gold', false)}
                               </div>`
                            : _btn('€'+i.price.toLocaleString(), ceAct('buyInvestment', [i.id]), 'gold', !reqMet)}
                </div>
            </div>`;
        });
        if (tierOpen) html += `</div>`;
    }

    // ── LINEA DI CREDITO ─────────────────────────────────────────
    if ((gameState.investments||[]).includes('inv_loan_facility')) {
        const activeLoans  = gameState.loans || [];
        const totalDebt    = activeLoans.reduce((s,l)=>s+l.amount, 0);
        const dynRate      = typeof _getLoanInterestRate === 'function' ? _getLoanInterestRate() : 0.08;
        const ratePct      = (dynRate * 100).toFixed(0);
        const rateColor    = dynRate <= 0.04 ? '#1aa06a' : dynRate <= 0.06 ? '#e0922e' : '#db5746';
        const debtPct      = Math.min(100, (totalDebt/500000)*100);

        html += `${_SEC('Linea di Credito')}
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#6b7280;margin-bottom:10px">
                <span>Debito: <span style="color:#db5746;font-weight:700;font-family:monospace">€${totalDebt.toLocaleString()}</span></span>
                <span>Tasso: <span style="color:${rateColor};font-weight:700">${ratePct}%</span> <span style="color:#6b7280">(Rep. ${(gameState.reputation||0).toFixed(1)}★)</span></span>
            </div>
            <div style="height:4px;background:#21262d;border-radius:2px;overflow:hidden;margin-bottom:14px">
                <div style="height:100%;width:${debtPct}%;background:#db5746;border-radius:2px;transition:width .3s"></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                ${[50000, 100000, 250000, 500000].map(amt => `
                <button ${ceAct('takeLoan', [amt])} ${totalDebt >= 500000 ? 'disabled' : ''}
                    style="background:#0d1117;border:1px solid #1e3a5f;color:#2f74c0;padding:8px 6px;border-radius:4px;font-family:monospace;font-size:9px;font-weight:700;cursor:${totalDebt>=500000?'not-allowed':'pointer'};opacity:${totalDebt>=500000?.35:1};text-align:center">
                    Prestito €${(amt/1000).toFixed(0)}k<br><span style="opacity:.6;font-size:8px">Rata: €${Math.ceil(amt*dynRate).toLocaleString()}/mese</span>
                </button>`).join('')}
            </div>
        </div>
        ${activeLoans.length > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
            ${activeLoans.map(l => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:9px;padding:6px 12px;background:#161b22;border:1px solid #21262d;border-radius:4px">
                <span style="color:#6b7280;font-family:monospace">Prestito #${l.id}</span>
                <span style="color:#db5746;font-family:monospace">Residuo: €${l.amount.toLocaleString()} (${((l.rate||0.08)*100).toFixed(0)}%/mese)</span>
                ${_btn('Salda', ceAct('repayLoan', [l.id]), 'gold', gameState.cash < l.amount)}
            </div>`).join('')}
        </div>` : ''}`;
    }

    // ── VENTURE CAPITAL & M&A ────────────────────────────────────
    const vcAgencies = typeof VENTURE_AGENCIES !== 'undefined' ? VENTURE_AGENCIES : [];
    const myStakes   = gameState.ventureCapital || [];
    if (vcAgencies.length > 0) {
        html += `${_SEC('Venture Capital & M&A')}<div style="display:flex;flex-direction:column;gap:6px" class="ce-stagger">`;
        vcAgencies.forEach(agency => {
            const stake       = myStakes.find(s => s.agencyId === agency.id);
            const ownedPct    = stake ? stake.stakePercent : 0;
            const dailyReturn = stake ? Math.floor(agency.dailyIncome * ownedPct / 100) : 0;
            const locked      = gameState.reputation < agency.minRep || gameState.cash < agency.minCash;
            const riskColor   = agency.riskLevel === 'high' ? '#db5746' : agency.riskLevel === 'medium' ? '#e0922e' : '#1aa06a';
            const costFor5    = Math.floor(agency.valuation * 5 / 100);
            const costFor10   = Math.floor(agency.valuation * 10 / 100);

            html += `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:#161b22;border:1px solid #21262d;border-radius:6px;gap:12px;opacity:${locked?.5:1}">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:#e6edf3">${agency.icon} ${agency.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;line-height:1.3">${agency.desc}</div>
                    <div style="display:flex;gap:12px;margin-top:6px;font-size:9px;font-family:monospace">
                        <span style="color:#6b7280">Val: <span style="color:#e6edf3">€${(agency.valuation/1e6).toFixed(1)}M</span></span>
                        <span style="color:#6b7280">+€${agency.dailyIncome.toLocaleString()}/g</span>
                        <span style="color:${riskColor}">${agency.riskLevel.toUpperCase()}</span>
                    </div>
                    ${locked ? `<div style="font-size:9px;color:#db5746;margin-top:4px">Min. ${agency.minRep}★ · €${agency.minCash.toLocaleString()}</div>` : ''}
                </div>
                <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                    ${stake ? `<div style="text-align:right">
                        <div style="font-size:14px;font-weight:700;color:#1aa06a;font-family:monospace">${ownedPct}%</div>
                        <div style="font-size:10px;color:#1aa06a;font-family:monospace">+€${dailyReturn}/g</div>
                    </div>` : ''}
                    ${!locked ? `<div style="display:flex;flex-direction:column;gap:4px">
                        ${_btn('+5% · €'+costFor5.toLocaleString(), ceAct('acquireVentureStake', [agency.id, 5]), 'blue', gameState.cash<costFor5)}
                        ${_btn('+10% · €'+costFor10.toLocaleString(), ceAct('acquireVentureStake', [agency.id, 10]), 'gold', gameState.cash<costFor10)}
                        ${stake ? _btn('Vendi 75%', ceAct('divestVentureStake', [agency.id]), 'red', false) : ''}
                    </div>` : ''}
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── HOLDING FINANZIARIA ───────────────────────────────────────
    const subTemplates       = typeof HOLDING_SUBSIDIARIES !== 'undefined' ? HOLDING_SUBSIDIARIES : (window.HOLDING_SUBSIDIARIES || []);
    const holdingIncorporated = gameState.holding?.incorporated;
    const holdingDailyIncome  = (gameState.holding?.subsidiaries || []).reduce((sum, sid) => {
        const t = subTemplates.find(s => s.id === sid);
        return sum + (t ? t.dailyIncome : 0);
    }, 0);

    html += `${_SEC('Holding Finanziaria')}`;

    if (!holdingIncorporated) {
        const canFound = (gameState.reputation||0) >= 4.0 && gameState.cash >= 200000;
        html += `
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:12px;font-weight:700;color:#e6edf3;margin-bottom:6px">Costituisci una Holding</div>
            <div style="font-size:10px;color:#6b7280;line-height:1.5;margin-bottom:8px">Fondare una holding ti permette di acquisire aziende sussidiarie che generano reddito passivo ogni giorno, indipendentemente dalle tue corse.</div>
            <div style="font-size:10px;color:#6b7280;margin-bottom:12px;font-family:monospace">Requisiti: <span style="color:#c79a2a">4.0★</span> reputazione · <span style="color:#c79a2a">€200.000</span></div>
            ${_btn('Fondazione Holding — €200.000', ceAct('incorporateHolding', []), 'gold', !canFound)}
        </div>`;
    } else {
        html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#0d2116;border:1px solid #1a4731;border-radius:6px;margin-bottom:10px">
            <div>
                <div style="font-size:12px;font-weight:700;color:#e6edf3">Holding Attiva</div>
                <div style="font-size:10px;color:#1aa06a;font-family:monospace;margin-top:2px">+€${holdingDailyIncome.toLocaleString()}/g dividendi</div>
            </div>
            <div style="font-size:10px;color:#6b7280;font-family:monospace">${(gameState.holding.subsidiaries||[]).length} sussidiarie</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px" class="ce-stagger">
        ${subTemplates.map(sub => {
            const owned = (gameState.holding.subsidiaries||[]).includes(sub.id);
            return `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:${owned?'#0d2116':'#ffffff'};border:1px solid ${owned?'#1a4731':'#d6dee8'};border-radius:6px;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:${owned?'#1aa06a':'#1f2733'}">${sub.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;line-height:1.3">${sub.desc}</div>
                    <div style="font-size:10px;color:#1aa06a;font-family:monospace;margin-top:4px">+€${sub.dailyIncome.toLocaleString()}/g</div>
                </div>
                <div style="flex-shrink:0;margin-top:2px">
                    ${owned
                        ? _btn('Cedi 60%', ceAct('divestSubsidiary', [sub.id]), 'red', false)
                        : _btn('€'+Math.round(sub.cost/1000)+'k', ceAct('acquireSubsidiary', [sub.id]), 'gold', gameState.cash<sub.cost)}
                </div>
            </div>`;
        }).join('')}
        </div>`;
    }

    // Sezioni delegate
    if (typeof renderBarometroWidget   === 'function') html += renderBarometroWidget();
    if (typeof renderP2PHoldingsSection === 'function') html += renderP2PHoldingsSection();
    if (typeof renderP2PConsorziSection === 'function') html += renderP2PConsorziSection();
    if (typeof renderIspettoratoSection === 'function') html += renderIspettoratoSection();

    html += `</div>`;
    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}
window.renderTabInvestments = renderTabInvestments;
