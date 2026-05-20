'use strict';
/* ui-meta.js — remaining renderTab* from dispatcher.js */

async function renderTabRanking() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const renderToken = Symbol();
    renderTabRanking._token = renderToken;

    // Loading skeleton
    container.innerHTML = DS.header({
        eyebrow: 'MULTIPLAYER · LIVE',
        title:   'Classifica Globale',
        subtitle:'Caricamento dati in tempo reale...',
        actions: DS.btn({ label:'⟳ Aggiorna', color:'ghost', onclick:'renderTabRanking()', size:'sm' }),
    }) + DS.kpiStrip([
        { label:'La Tua Posizione', val:'—' },
        { label:'Patrimonio',       val:'—' },
        { label:'Reputazione',      val:'—' },
        { label:'Aziende Globali',  val:'—' },
    ]) + `<div style="display:flex;flex-direction:column;gap:8px">${Array(5).fill(`<div class="ds-skel" style="height:52px;border-radius:10px"></div>`).join('')}</div>`;

    // Fetch leaderboard from Supabase — columns match table exactly
    let rows = [];
    let fetchError = null;
    if (window.supabaseClient) {
        try {
            console.log('MULTIPLAYER: Caricamento classifica globale...');
            const { data, error } = await window.supabaseClient
                .from('leaderboard')
                .select('user_id,company_name,liquid_assets,reputation,fleet_count,last_active')
                .order('liquid_assets', { ascending: false })
                .limit(50);
            if (error) {
                fetchError = error.message || JSON.stringify(error);
                console.error('ERRORE MULTIPLAYER fetch classifica:', error);
            } else {
                rows = data || [];
                console.log('MULTIPLAYER: Classifica caricata —', rows.length, 'aziende:', rows);
            }
        } catch(e) {
            fetchError = e.message || 'Errore di rete';
            console.error('ERRORE MULTIPLAYER fetch eccezione:', e);
        }
    } else {
        fetchError = 'Supabase non disponibile';
    }

    // User switched tab while fetching — don't overwrite their current tab
    if (renderTabRanking._token !== renderToken) return;

    const myId   = window.currentUser?.id;
    const now    = Date.now();
    const ONLINE_MS = 5 * 60 * 1000;

    // Inject own row if not in top 50 (using exact table column names)
    const myInList = rows.some(r => r.user_id === myId);
    if (!myInList && myId) {
        rows.push({
            user_id:      myId,
            company_name: gameState.companyName || 'Chauffeur Empire',
            liquid_assets: Math.floor(gameState.cash || 0),
            reputation:   gameState.reputation || 0,
            fleet_count:  (gameState.fleet || []).length,
            last_active:  new Date().toISOString(),
            _injected:    true,
        });
        rows.sort((a, b) => b.liquid_assets - a.liquid_assets);
    }

    const myRank  = rows.findIndex(r => r.user_id === myId) + 1;
    const total   = rows.length;
    const myRow   = rows.find(r => r.user_id === myId);
    const rankIcon = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : myRank > 0 ? `#${myRank}` : '—';
    const isTop3  = myRank > 0 && myRank <= 3;

    // Top-3 bonus banner
    const bonusBanner = isTop3 ? `<div class="ds-card ds-card--gold" style="margin-bottom:20px">
        <div class="ds-eyebrow" style="color:var(--gold);margin-bottom:8px">✨ Bonus Attivo — Top ${myRank}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--text-muted)">🚘 Corse Ultra-Luxury sbloccate</span>
            <span style="font-size:11px;color:var(--text-muted)">🛡 Premi assicurativi −15%</span>
            <span style="font-size:11px;color:var(--text-muted)">📍 POI esclusivi visibili</span>
        </div>
    </div>` : '';

    // Error banner
    const errBanner = fetchError ? `<div class="ds-card ds-card--alert" style="margin-bottom:16px">
        <span style="font-size:11px;color:var(--red)">⚠ ${fetchError}</span>
    </div>` : '';

    let html = DS.header({
        eyebrow: 'MULTIPLAYER · LIVE',
        title:   'Classifica Globale',
        subtitle:`${total} aziende attive · Aggiornato adesso`,
        actions: DS.btn({ label:'⟳ Aggiorna', color:'ghost', onclick:'renderTabRanking()', size:'sm' }),
    }) + DS.kpiStrip([
        { label:'La Tua Posizione', val: rankIcon,                                          color: isTop3 ? 'gold' : '' },
        { label:'Patrimonio',       val: '€' + Math.floor(myRow?.liquid_assets||gameState.cash||0).toLocaleString('it-IT'), color:'green' },
        { label:'Reputazione',      val: '★' + Number(myRow?.reputation||gameState.reputation||0).toFixed(1), color:'blue' },
        { label:'Aziende Globali',  val: total },
    ]) + errBanner + bonusBanner;

    // ── Leaderboard table ────────────────────────────────────────
    if (rows.length === 0) {
        html += DS.empty({ icon:'🏆', title:'Classifica vuota', body:'Completa una corsa per comparire nella classifica globale.' });
    } else {
        html += `<div class="ds-table-wrap">
        <table class="ds-table">
            <thead><tr>
                <th style="width:50px">#</th>
                <th>Azienda</th>
                <th class="col-right">Patrimonio</th>
                <th class="col-center">⭐ Rep</th>
                <th class="col-center">🚘</th>
                <th class="col-center">Status</th>
            </tr></thead>
            <tbody>`;
        rows.forEach((r, i) => {
            const pos    = i + 1;
            const isMe   = r.user_id === myId;
            const tsMs   = r.last_active ? new Date(r.last_active).getTime() : 0;
            const online = tsMs && (now - tsMs) < ONLINE_MS;
            const medal  = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
            const rowStyle = isMe ? 'background:rgba(212,175,55,0.07);' : '';
            const nameColor = isMe ? 'color:var(--gold);' : '';
            const onlineDot = online ? `<span style="display:inline-block;width:6px;height:6px;background:var(--green);border-radius:50%;margin-left:6px;box-shadow:var(--glow-green)"></span>` : '';
            html += `<tr style="${rowStyle}">
                <td style="text-align:center;font-size:${pos<=3?'18':'12'}px">${medal}</td>
                <td>
                    <div style="font-weight:700;${nameColor}font-size:11px">${r.company_name || 'Chauffeur Empire'}${isMe?`<span style="font-size:9px;color:var(--gold);margin-left:6px">(Tu)</span>`:''}${onlineDot}</div>
                </td>
                <td class="col-right" style="font-family:var(--font-mono);font-weight:700;color:var(--blue)">€${(Math.floor(r.liquid_assets||0)/1000).toFixed(0)}k</td>
                <td class="col-center" style="font-family:var(--font-mono)">${Number(r.reputation||0).toFixed(1)}</td>
                <td class="col-center" style="color:var(--text-muted)">${r.fleet_count||0}</td>
                <td class="col-center">${online ? `<span class="ds-pill ds-pill--green">ONLINE</span>` : `<span style="font-size:9px;color:var(--text-dim)">—</span>`}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // ── Guerra dei Prezzi ────────────────────────────────────────
    const activePricewars = gameState.pricewars || [];
    const unlockedRegionIds = (gameState.unlockedRegions||[]).filter(id => REGIONS[id]);
    html += `<div class="ds-eyebrow" style="margin:24px 0 12px">⚔️ Guerra dei Prezzi</div>`;
    activePricewars.forEach(pw => {
        const rname = REGIONS[pw.regionId]?.name || pw.regionId;
        const isMono = !!pw.monopolyEndsDay;
        html += `<div class="ds-card ds-card--${isMono?'gold':'alert'}" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:11px;font-weight:700;color:${isMono?'var(--gold)':'var(--red)'}">${isMono?'👑 MONOPOLIO':'⚔️ Guerra'}: ${rname}</div>
                <div style="font-size:9px;color:var(--text-muted)">${isMono?`Scade giorno ${pw.monopolyEndsDay} (+40% tariffe)`:`Fine giorno ${pw.endsDay} (−30% prezzi)`}</div>
            </div>
            ${DS.pill(isMono?'+40%':'−30%', isMono?'gold':'red')}
        </div>`;
    });

    if (unlockedRegionIds.length > 0) {
        html += `<div class="ds-card" style="margin-bottom:16px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Attacca una regione: −30% tariffe ai rivali per 3 giorni. Se crollano → <strong style="color:var(--gold)">Monopolio +40% per 7 giorni</strong></div>
            <div style="display:flex;gap:8px;align-items:center">
                <select id="attack-region-select" style="flex:1;font-size:11px;background:rgba(0,0,0,0.5);border:1px solid var(--border-sub);border-radius:6px;padding:6px 10px;color:var(--text);font-family:var(--font-mono)">
                    ${unlockedRegionIds.map(id => {
                        const r = REGIONS[id];
                        const atWar = activePricewars.some(pw => pw.regionId === id);
                        const warCost = Math.floor(r.price * 0.25 + 15000);
                        return `<option value="${id}" ${atWar?'disabled':''}>${r.name}${atWar?' (guerra)':''} — €${warCost.toLocaleString()}</option>`;
                    }).join('')}
                </select>
                ${DS.btn({ label:'⚔️ Attacca', color:'red', onclick:"attackTerritory(document.getElementById('attack-region-select').value)" })}
            </div>
        </div>`;
    }

    // ── Obiettivi ────────────────────────────────────────────────
    if (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS.length > 0) {
        const earned = gameState.achievements || [];
        html += `<div class="ds-eyebrow" style="margin:24px 0 12px">🏅 Obiettivi (${earned.length}/${ACHIEVEMENTS.length})</div>
        <div class="ds-grid-4">`;
        ACHIEVEMENTS.forEach(ach => {
            const done = earned.includes(ach.id);
            html += `<div class="ds-card" style="text-align:center;padding:12px;${!done?'opacity:0.35':''}${done?'border-color:var(--gold-border)':''}">
                <div style="font-size:24px;margin-bottom:6px">${ach.icon}</div>
                <div style="font-size:9px;font-weight:700;color:${done?'var(--gold)':'var(--text-muted)'}">${ach.name}</div>
                <div style="font-size:8px;color:var(--text-dim);margin-top:3px">${ach.desc}</div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── New Game+ ────────────────────────────────────────────────
    if (gameState.reputation >= 4.5) {
        html += `<div class="ds-card" style="margin-top:20px;text-align:center;border-color:rgba(168,85,247,0.4);background:rgba(168,85,247,0.05)">
            <div style="font-size:32px;margin-bottom:10px">♾️</div>
            <div style="font-size:12px;font-weight:700;color:var(--purple);margin-bottom:6px;font-family:var(--font-display)">NEW GAME+ DISPONIBILE</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px">Ricomincia da capo con reputazione e bonus iniziale. La tua leggenda continua.</div>
            ${DS.btn({ label:'Inizia New Game+', color:'blue', onclick:'newGamePlus()' })}
        </div>`;
    }

    const _savedRegion = document.getElementById('attack-region-select')?.value;
    container.innerHTML = html;
    const _regionSel = document.getElementById('attack-region-select');
    if (_regionSel && _savedRegion) _regionSel.value = _savedRegion;
}/* ================================================================
   dispatcher.js — RECOVERY PARTE 3: MERCATI, STAFF & EMAIL
   ================================================================ */


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

function renderTabLegal() {
    const container = document.getElementById('tab-container');
    const hasLegal  = (gameState.staff||[]).some(s => s.id === 'legal');
    const pending   = (gameState.activeFines || []).filter(f => f.status === 'pending');
    const resolved  = (gameState.activeFines || []).filter(f => f.status !== 'pending');
    const successRate = hasLegal ? 70 : 35;
    const totalFines = pending.reduce((s, f) => s + (f.amount||0), 0);
    const gameHour  = gameState.day * 24 + gameState.hour;

    let html = DS.header({
        eyebrow: 'Compliance & Diritto',
        title:   'Ufficio Legale',
        subtitle:`${pending.length} sanzione${pending.length !== 1 ? 'i' : ''} in attesa · Rischio esposizione €${totalFines.toLocaleString()}`,
    }) + DS.kpiStrip([
        { label:'Status Studio',  val: hasLegal ? 'ATTIVO' : 'ASSENTE',       color: hasLegal ? 'green' : 'red' },
        { label:'Tasso Successo', val: successRate + '%',                       color: successRate >= 70 ? 'green' : 'red' },
        { label:'Sanzioni Aperte',val: pending.length,                          color: pending.length > 0 ? 'red' : 'green' },
        { label:'Esposizione',    val: '€' + totalFines.toLocaleString(),       color: totalFines > 0 ? 'red' : 'green' },
    ]);

    if (!hasLegal) {
        html += `<div class="ds-card ds-card--alert" style="margin-bottom:20px">
            <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:4px">⚠ Nessun Avvocato in Staff</div>
            <div style="font-size:11px;color:var(--text-muted)">Tasso di contestazione automatica: solo 35%. Assumi un Avvocato nel tab Staff per salire al 70%.</div>
        </div>`;
    }

    html += `<div class="ds-eyebrow" style="margin:0 0 12px">⚖️ Sanzioni Attive (${pending.length})</div>`;

    if (pending.length === 0) {
        html += DS.empty({ icon:'✅', title:'Nessuna sanzione in sospeso', body:'La tua flotta è in regola. Continua così.' });
    } else {
        pending.forEach(f => {
            const hoursLeft = Math.max(0, (f.expiresAt || 0) - gameHour);
            html += `<div class="ds-card ds-card--alert" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--text)">${f.desc}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">👤 ${f.driverName} · Scade in ${hoursLeft}h</div>
                    </div>
                    <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--red)">€${(f.amount||0).toLocaleString()}</div>
                </div>
                <div style="display:flex;gap:8px">
                    ${DS.btn({ label:`Paga €${(f.amount||0).toLocaleString()}`, color:'red',  onclick:`payFine(${f.id})` })}
                    ${DS.btn({ label:`Contesta (${successRate}%)`,              color:'blue', onclick:`contestFine(${f.id})` })}
                </div>
            </div>`;
        });
    }

    if (resolved.length > 0) {
        html += `<div class="ds-eyebrow" style="margin:20px 0 12px">📁 Archivio (${resolved.length})</div>`;
        html += DS.table(
            [
                { label:'Descrizione', key:'desc' },
                { label:'Autista',     key:'driverName' },
                { label:'Importo',     key:'amount', align:'right', render: r => `<span style="font-family:var(--font-mono)">€${(r.amount||0).toLocaleString()}</span>` },
                { label:'Esito',       key:'status',  align:'center', render: r => {
                    const labels = { paid:'Pagata', contested_won:'Annullata ✓', contested_lost:'Ricorso Perso', contested_reduced:'Ridotta', expired_paid:'Scaduta (Pagata)' };
                    const colors = { contested_won:'green', paid:'red', expired_paid:'red', contested_lost:'', contested_reduced:'orange' };
                    const label = labels[r.status] || r.status;
                    const color = colors[r.status] || '';
                    return DS.pill(label, color || 'ghost');
                }},
            ],
            resolved.slice(-10).reverse()
        );
    }

    container.innerHTML = html;

    const fineDot = document.getElementById('fine-dot');
    if (fineDot) fineDot.classList.toggle('hidden', pending.length === 0);
}

function renderTabPolitics() {
    const container = document.getElementById('tab-container');
    const inflPct   = ((gameState.inflationRate || 0.020) * 100).toFixed(2);
    const ratePct   = ((gameState.interestRateBase || 0.045) * 100).toFixed(2);
    const points    = gameState.lobbyingPoints || 0;
    const active    = gameState.activeLobbyLaws || [];
    const laws      = typeof LOBBY_LAWS !== 'undefined' ? LOBBY_LAWS : [];
    const activeLaws= laws.filter(l => active.includes(l.id)).length;
    const inflVal   = parseFloat(inflPct);
    const rateVal   = parseFloat(ratePct);

    const inflColor = inflVal > 5 ? 'red' : inflVal < 2 ? 'green' : 'gold';
    const rateColor = rateVal > 7 ? 'red' : rateVal < 3 ? 'green' : 'gold';

    let lawsHtml = laws.map(l => {
        const owned = active.includes(l.id);
        const canAfford = points >= l.pointsCost && (gameState.cash || 0) >= (l.cashCost || 0);
        return `<div class="ds-card${owned ? ' ds-card--gold' : ''}" style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;font-weight:700;color:${owned?'var(--gold)':'var(--text)'}">${l.icon} ${l.name} ${owned?'✓':''}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${l.desc}</div>
                    <div style="display:flex;gap:12px;margin-top:6px">
                        ${DS.pill(l.pointsCost + ' pt', points >= l.pointsCost ? 'gold' : 'ghost')}
                        ${l.cashCost ? DS.pill('€'+l.cashCost.toLocaleString(), (gameState.cash||0)>=l.cashCost?'green':'red') : ''}
                    </div>
                </div>
                <div style="flex-shrink:0">
                    ${owned
                        ? DS.pill('ATTIVA', 'green')
                        : DS.btn({ label:'Approva', color:'gold', onclick:`passLobbyLaw('${l.id}')`, disabled:!canAfford, size:'sm' })}
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = DS.header({
        eyebrow: 'Lobbying & Economia',
        title:   'Politica & Decreti',
        subtitle:`${activeLaws} leggi attive · ${points} punti lobbying disponibili`,
        actions: DS.btn({ label:'↻ Decr.', color:'ghost', onclick:"window.decreesRefresh(true).then(()=>window.renderTabPolitics())", size:'sm' }),
    }) + DS.kpiStrip([
        { label:'Inflazione',     val: inflPct + '%',                             color: inflColor },
        { label:'Tasso BCE',      val: ratePct + '%',                             color: rateColor },
        { label:'Pt Lobbying',    val: points,                                    color: points > 0 ? 'gold' : '' },
        { label:'Leggi Attive',   val: activeLaws + ' / ' + laws.length,          color: activeLaws > 0 ? 'green' : '' },
    ]) + `
    <div class="ds-card" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
                <div class="ds-eyebrow">Finanziamento Politico</div>
                <div style="font-size:11px;color:var(--text-muted)">1.000€ = 1 punto lobbying</div>
            </div>
            <div style="font-size:22px;font-weight:700;font-family:var(--font-mono);color:var(--gold)">${points} pt</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
            <input id="lobby-donate-amt" type="number" min="1000" step="5000" value="10000"
                style="flex:1;background:rgba(0,0,0,0.4);border:1px solid var(--border-sub);border-radius:6px;padding:8px 12px;color:var(--text);font-family:var(--font-mono);font-size:11px"
                placeholder="€ donazione">
            ${DS.btn({ label:'Dona', color:'gold', onclick:"donateToLobby(document.getElementById('lobby-donate-amt').value)" })}
        </div>
    </div>

    <div class="ds-eyebrow" style="margin:0 0 12px">⚖️ Leggi Disponibili</div>
    <div>${lawsHtml}</div>

    ${_renderDecreesSection(points)}`;
}
window.renderTabPolitics = renderTabPolitics;

function _renderDecreesSection(lobbyPoints) {
    const decrees = window._decreesState?.decrees || [];
    const passed  = window._decreesState?.activeDecrees || [];

    const passedHtml = passed.length === 0 ? '' : `
        <div class="ds-card ds-card--gold" style="margin-bottom:12px">
            <div class="ds-eyebrow" style="color:var(--green);margin-bottom:8px">✅ Decreti Attivi (${passed.length})</div>
            ${passed.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:11px;color:var(--text)">${d.icon} ${d.title}</span>
                <span style="font-size:9px;color:var(--text-muted)">${d.ends_at ? 'Scade '+new Date(d.ends_at).toLocaleDateString('it-IT') : 'Permanente'}</span>
            </div>`).join('')}
        </div>`;

    let votingHtml = '';
    if (decrees.length === 0) {
        votingHtml = DS.empty({ icon:'📜', title:'Nessun decreto in votazione', body:'Aggiorna tra qualche minuto.' });
    } else {
        votingHtml = decrees.map(d => {
            const isPassed = d.status === 'passed';
            const pct = Math.min(100, Math.round((d.votes_current / d.votes_required) * 100));
            const myVotes = d.my_votes || 0;
            const inputId = `decree-pts-${d.id.substring(0, 8)}`;
            const msLeft   = Math.max(0, new Date(d.expires_at) - Date.now());
            const daysLeft = Math.floor(msLeft / 86400000);
            const hoursLeft= Math.floor((msLeft % 86400000) / 3600000);
            const minsLeft = Math.floor((msLeft % 3600000) / 60000);
            const countdownId = `decree-cd-${d.id.substring(0, 8)}`;
            const _fmtCountdown = (ms) => {
                const d2 = Math.floor(ms / 86400000);
                const h2 = Math.floor((ms % 86400000) / 3600000);
                const m2 = Math.floor((ms % 3600000) / 60000);
                if (d2 > 0) return `${d2}g ${h2}h rimasti`;
                if (h2 > 0) return `${h2}h ${m2}m rimasti`;
                if (m2 > 0) return `⚠ ${m2}m rimasti`;
                return `⚠ scade ora`;
            };
            const countdownText = _fmtCountdown(msLeft);
            const fxBadges = Object.entries(d.effects || {}).map(([k, v]) => {
                if (k === 'tipMult')         return `+${Math.round((v-1)*100)}% mance`;
                if (k === 'xpMult')          return `+${Math.round((v-1)*100)}% XP`;
                if (k === 'fuelCostMult')    return `${Math.round((v-1)*100)}% carb.`;
                if (k === 'maintenanceMult') return `${Math.round((v-1)*100)}% manutenzione`;
                if (k === 'taxRateMult')     return `${Math.round((v-1)*100)}% tasse`;
                if (k === 'vehiclePriceMult')return `${Math.round((v-1)*100)}% veicoli`;
                if (k === 'extraRidePct')    return `+${Math.round(v*100)}% corse`;
                return null;
            }).filter(Boolean);

            return `<div class="ds-card${isPassed?' ds-card--gold':''}" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:11px;font-weight:700;color:${isPassed?'var(--green)':'var(--text)'}">${d.icon} ${d.title} ${isPassed?'✓':''}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${d.description||''}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                            ${fxBadges.map(b => DS.pill(b, 'blue')).join('')}
                        </div>
                    </div>
                    <div style="flex-shrink:0;text-align:right">
                        ${isPassed
                            ? DS.pill('APPROVATO', 'green')
                            : `<div id="${countdownId}" style="font-size:9px;color:${msLeft < 3600000 ? 'var(--red)' : msLeft < 86400000 ? 'var(--orange)' : 'var(--text-muted)'}">${countdownText}</div>
                               ${myVotes > 0 ? `<div style="font-size:9px;color:var(--blue);margin-top:2px">Votato: ${myVotes}pt</div>` : ''}`}
                    </div>
                </div>
                <div style="margin-bottom:${isPassed?'0':'10px'}">
                    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-bottom:4px">
                        <span>${d.votes_current}/${d.votes_required} voti</span>
                        <span>${pct}%</span>
                    </div>
                    ${DS.progress(pct, isPassed ? 'green' : 'gold')}
                </div>
                ${!isPassed ? `<div style="display:flex;gap:8px;align-items:center">
                    <input id="${inputId}" type="number" min="1" max="${lobbyPoints}" value="1"
                        style="flex:1;background:rgba(0,0,0,0.4);border:1px solid var(--border-sub);border-radius:6px;padding:7px 10px;color:var(--text);font-family:var(--font-mono);font-size:11px"
                        placeholder="punti">
                    ${DS.btn({ label:'Vota', color:'gold', onclick:`window.voteServerDecree('${d.id}', document.getElementById('${inputId}').value)`, disabled: lobbyPoints < 1, size:'sm' })}
                </div>` : ''}
            </div>`;
        }).join('');
    }

    // Wire up live countdown tickers after DOM injection (runs once per renderTabPolitics call)
    requestAnimationFrame(() => {
        if (window._decreesCountdownTimer) { clearInterval(window._decreesCountdownTimer); window._decreesCountdownTimer = null; }
        const decreeData = decrees.filter(d => d.status !== 'passed').map(d => ({
            id: `decree-cd-${d.id.substring(0, 8)}`,
            expires: new Date(d.expires_at).getTime(),
        }));
        if (!decreeData.length) return;
        window._decreesCountdownTimer = setInterval(() => {
            const now = Date.now();
            let anyAlive = false;
            decreeData.forEach(({ id, expires }) => {
                const el = document.getElementById(id);
                if (!el) return;
                anyAlive = true;
                const ms = Math.max(0, expires - now);
                const d2 = Math.floor(ms / 86400000);
                const h2 = Math.floor((ms % 86400000) / 3600000);
                const m2 = Math.floor((ms % 3600000) / 60000);
                let txt, col;
                if (d2 > 0)      { txt = `${d2}g ${h2}h rimasti`; col = 'var(--text-muted)'; }
                else if (h2 > 0) { txt = `${h2}h ${m2}m rimasti`; col = 'var(--orange)'; }
                else if (m2 > 0) { txt = `⚠ ${m2}m rimasti`;      col = 'var(--red)'; }
                else             { txt = `⚠ scade ora`;            col = 'var(--red)'; }
                el.textContent = txt;
                el.style.color = col;
            });
            if (!anyAlive) clearInterval(window._decreesCountdownTimer);
        }, 60000);
    });

    return `<div class="ds-eyebrow" style="margin:24px 0 12px">📜 Decreti Server — Votazione Globale</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Vota con i tuoi punti lobbying. Al raggiungimento della soglia, l'effetto si applica a <strong>tutti</strong> i giocatori.</div>
      ${passedHtml}
      ${votingHtml}`;
}


function renderTabCareer() {
    const container = document.getElementById('tab-container');
    if (typeof window.QUEST_DB === 'undefined') {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10 text-[10px]">Sistema missioni non caricato.</div>`;
        return;
    }
    const gs = gameState;
    const completed = gs.completedQuests || [];
    const claimable = gs.claimableQuests || [];
    const total     = window.QUEST_DB.length;

    const chLabels = {
        1:'🎓 Tutorial — Il Battesimo del Fuoco',
        2:'📦 Volume I — La Prima Ombra',
        3:'🏢 Volume II-III — Le Ombre · Il Dominio',
        4:'⚡ Volume IV — L\'Energia',
        5:'👑 Volume V — Il Potere Assoluto',
        6:'🌍 Volume VI — L\'Impero Continentale',
        7:'⚔️ Volume VII — La Guerra delle Ombre',
        8:'🌑 Volume VIII — Il Giudizio Finale',
        9:'🌋 Volume Finale — L\'Apocalisse',
    };

    const tierGradient = {
        bronze:   'linear-gradient(135deg,#3d2010 0%,#1a1a2e 100%)',
        silver:   'linear-gradient(135deg,#1c2333 0%,#1a1a2e 100%)',
        gold:     'linear-gradient(135deg,#2d2200 0%,#1a1a2e 100%)',
        diamond:  'linear-gradient(135deg,#0a2233 0%,#1a1a2e 100%)',
        legendary:'linear-gradient(135deg,#2d1000 0%,#1a1a2e 100%)',
    };
    const tierColor = { bronze:'#cd7f32', silver:'#c0c0c0', gold:'#d4af37', diamond:'#a8d8ea', legendary:'#ff6b35' };
    const typeLabel = { tutorial:'Tutorial', story:'Storia', raid:'Raid Boss', milestone:'Traguardo' };

    // Find the single active quest: first in DB order that is claimable or (prereqs met and not done)
    const activeQ = window.QUEST_DB.find(q => {
        if (completed.includes(q.id)) return false;
        const prereqsMet = (q.prereqs || []).every(p => completed.includes(p));
        return prereqsMet;
    });

    // If all quests are done
    if (!activeQ) {
        container.innerHTML = `
            <div class="text-center mt-16 space-y-3">
                <div class="text-4xl">🏆</div>
                <div class="text-[13px] font-bold text-gold">Campagna completata!</div>
                <div class="text-[10px] text-gray-400">${total}/${total} missioni completate.</div>
            </div>`;
        return;
    }

    const isClaim    = claimable.includes(activeQ.id);
    const alreadyRun = !!(gs.questStats?.missionRuns?.[activeQ.id]);
    const canDispatch = activeQ.type === 'story' || activeQ.type === 'raid' ||
        (activeQ.type === 'tutorial' && ['t03','t05','t06'].includes(activeQ.id));
    const showDispatch = canDispatch && !isClaim && !alreadyRun;

    let prog = { cur: 0, tgt: 1 };
    try { prog = activeQ.check(gs); } catch(e) {}
    if (isClaim) prog.cur = prog.tgt;
    const pct = Math.min(100, Math.round(((prog.cur || 0) / Math.max(1, prog.tgt || 1)) * 100));
    const barColor = isClaim ? '#22c55e' : activeQ.type === 'raid' ? '#ff6b35' : '#d4af37';

    const tColor    = tierColor[activeQ.tier] || '#d4af37';
    const tGrad     = tierGradient[activeQ.tier] || tierGradient.gold;
    const chLabel   = chLabels[activeQ.ch] || `Capitolo ${activeQ.ch}`;
    const typeTag   = typeLabel[activeQ.type] || activeQ.type;
    const isRaid    = activeQ.type === 'raid';

    const rewardParts = [
        activeQ.rewards.cash       ? `€${activeQ.rewards.cash.toLocaleString()}` : null,
        activeQ.rewards.tc         ? `+${activeQ.rewards.tc} Driver Coins` : null,
        activeQ.rewards.rep        ? `+${activeQ.rewards.rep}★ Reputazione` : null,
        activeQ.rewards.shadowCoin ? `+${activeQ.rewards.shadowCoin.toLocaleString()} Shadow Coin` : null,
        activeQ.rewards.unlock     ? `🔓 ${activeQ.rewards.unlock}` : null,
        activeQ.rewards.title      ? `🏅 "${activeQ.rewards.title}"` : null,
    ].filter(Boolean);
    const rewardDisplay = rewardParts.length ? rewardParts : [activeQ.rewards.desc || '—'];

    // Next quest preview
    const nextQ = window.QUEST_DB.find(q => {
        if (completed.includes(q.id) || q.id === activeQ.id) return false;
        const prereqsMet = (q.prereqs || []).every(p => completed.includes(p) || q.prereqs.includes(activeQ.id) && q.prereqs.every(p2 => p2 === activeQ.id || completed.includes(p2)));
        return prereqsMet || q.prereqs.includes(activeQ.id);
    });

    const questIndex = window.QUEST_DB.findIndex(q => q.id === activeQ.id) + 1;

    let html = `
        <!-- Chapter header -->
        <div class="flex items-center justify-between mb-3">
            <div class="text-[9px] text-gray-500 uppercase tracking-widest">${chLabel}</div>
            <div class="text-[9px] text-gray-600 font-mono">${completed.length}/${total} completate</div>
        </div>

        <!-- Progress strip -->
        <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-4">
            <div class="h-full rounded-full" style="width:${Math.round(completed.length/total*100)}%;background:linear-gradient(90deg,#d4af37,#cd7f32)"></div>
        </div>

        <!-- Active mission card -->
        <div class="rounded-xl overflow-hidden border ${isRaid ? 'border-orange-500/40' : 'border-white/10'} shadow-2xl mb-4">

            <!-- Hero banner -->
            <div class="relative px-4 pt-5 pb-4" style="background:${tGrad}">
                <div class="flex items-start gap-3">
                    <div class="text-3xl flex-shrink-0 mt-0.5">${activeQ.icon}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded" style="background:${tColor}22;color:${tColor}">${typeTag}</span>
                            <span class="text-[8px] text-gray-500">#${questIndex}</span>
                        </div>
                        <div class="text-[14px] font-bold leading-tight" style="color:${tColor}">${activeQ.title}</div>
                        <div class="text-[10px] text-gray-300 mt-0.5">${activeQ.subtitle || ''}</div>
                    </div>
                </div>
                ${activeQ.giver ? `<div class="text-[8px] text-gray-500 mt-2">${activeQ.giver.name} · ${activeQ.giver.faction}</div>` : ''}
            </div>

            <!-- Lore -->
            ${activeQ.lore ? `
            <div class="px-4 py-3 bg-white/3 border-t border-white/5">
                <div class="text-[9px] text-gray-400 italic leading-relaxed">"${activeQ.lore}"</div>
            </div>` : ''}

            <!-- Task box -->
            <div class="px-4 py-3 bg-[#111120] border-t border-white/5">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-[10px] font-semibold text-white">${activeQ.subtitle || 'Obiettivo'}</div>
                    <div class="text-[11px] font-bold font-mono" style="color:${isClaim ? '#22c55e' : tColor}">${prog.cur}/${prog.tgt}</div>
                </div>
                <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width:${pct}%;background:${barColor}"></div>
                </div>
                ${isClaim ? `
                <div class="mt-3">
                    <button onclick="window.claimQuestReward('${activeQ.id}')"
                        class="w-full py-2 rounded-lg text-[11px] font-bold text-black animate-pulse"
                        style="background:linear-gradient(90deg,#22c55e,#16a34a)">
                        🎁 Ritira Ricompensa
                    </button>
                </div>` : showDispatch ? `
                <div class="mt-3">
                    <button onclick="window.startMissionRun('${activeQ.id}')"
                        class="w-full py-2 rounded-lg text-[11px] font-bold"
                        style="background:linear-gradient(90deg,${tColor}cc,${tColor}88);color:#000">
                        ▶ Avvia Missione
                    </button>
                </div>` : ''}
            </div>

            <!-- Reward section -->
            <div class="border-t border-white/10">
                <div class="px-4 py-1.5 text-center text-[8px] font-bold uppercase tracking-widest text-black" style="background:${tColor}">
                    Ricompensa
                </div>
                <div class="px-4 py-3 bg-[#0e0e1c] flex flex-wrap gap-2">
                    ${rewardDisplay.map(r => `
                    <div class="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5">
                        <span class="text-[10px] text-yellow-300">${r}</span>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- Next quest preview -->
        ${nextQ ? `
        <div class="opacity-40 rounded-xl border border-white/5 overflow-hidden">
            <div class="px-3 py-2 bg-white/3 flex items-center gap-2">
                <span class="text-base">🔒</span>
                <div>
                    <div class="text-[8px] text-gray-500 uppercase tracking-widest">Prossima missione</div>
                    <div class="text-[10px] text-gray-400 font-medium">${nextQ.title}</div>
                    <div class="text-[8px] text-gray-600">${nextQ.subtitle || ''}</div>
                </div>
            </div>
        </div>` : ''}
    `;

    container.innerHTML = html;
}
window.renderTabCareer = renderTabCareer;

window.startMissionRun = function(questId) {
    const q = (window.QUEST_DB || []).find(x => x.id === questId);
    if (!q) return;
    if (q.bivio) {
        window._showBivioModal(q);
    } else {
        if (typeof window.completeMissionRun === 'function') window.completeMissionRun(questId);
        if (typeof renderTabCareer === 'function' && typeof _tabIs === 'function' && _tabIs('career')) renderTabCareer();
    }
};

window._showBivioModal = function(q) {
    const existing = document.getElementById('bivio-modal');
    if (existing) existing.remove();

    const optHtml = q.bivio.options.map(opt => `
        <button onclick="window._applyBivioChoice('${q.id}','${opt.id}')"
                class="w-full text-left p-3 rounded-lg border border-white/10 hover:border-gold/40 hover:bg-white/5 transition-all mt-2">
            <div class="text-[10px] font-bold text-white">${opt.label}</div>
            <div class="text-[9px] text-gray-400 mt-0.5">${opt.desc}</div>
        </button>`).join('');

    const giverLine = q.giver ? `<div class="text-[9px] text-gray-500 mb-3">${q.giver.name} · ${q.giver.faction}</div>` : '';

    const modal = document.createElement('div');
    modal.id = 'bivio-modal';
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4';
    modal.innerHTML = `
        <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <div class="text-[10px] text-gold uppercase tracking-widest mb-1">${q.icon} ${q.title}</div>
            ${giverLine}
            <div class="text-[11px] text-white font-medium mb-1">${q.bivio.prompt}</div>
            ${optHtml}
            <button onclick="document.getElementById('bivio-modal').remove()"
                    class="mt-4 text-[9px] text-gray-600 hover:text-gray-400 w-full text-center">Annulla</button>
        </div>`;
    document.body.appendChild(modal);

    window._bivioQuestRef = q;
};

window._applyBivioChoice = function(questId, optionId) {
    const q = window._bivioQuestRef;
    if (!q || q.id !== questId) return;
    const opt = q.bivio.options.find(o => o.id === optionId);
    if (!opt) return;
    document.getElementById('bivio-modal')?.remove();
    try { opt.effect(gameState); } catch(e) {}
    if (typeof window.completeMissionRun === 'function') window.completeMissionRun(questId);
    if (typeof updateUI === 'function') updateUI();
    if (typeof renderTabCareer === 'function' && typeof _tabIs === 'function' && _tabIs('career')) renderTabCareer();
    if (typeof saveGame === 'function') saveGame();
};

let _ecActiveTab = 'acquire';
window._ecSwitchTab = function(tab) { _ecActiveTab = tab; renderTabPremiumStore(); };


function renderTabPremiumStore() {
    const container = document.getElementById('tab-container');
    const dc = gameState.driverCoins || 0;
    const offLimit = gameState.offlineLimit || 2;
    const autoRest = gameState.autoRestEnabled || false;

    // ── INJECT EXECUTIVE CLUB STYLES ─────────────────────────────────────────
    if (!document.getElementById('ec-style')) {
        const st = document.createElement('style');
        st.id = 'ec-style';
        st.textContent = `
            .ec-card {
                background: linear-gradient(135deg, rgba(10,10,25,0.95), rgba(20,20,45,0.9));
                border: 1px solid rgba(212,175,55,0.25);
                border-radius: 12px; padding: 14px; position: relative;
                transition: box-shadow .2s, border-color .2s;
            }
            .ec-card:hover { border-color: rgba(212,175,55,0.5); box-shadow: 0 0 18px rgba(212,175,55,0.12); }
            .ec-tab {
                padding: 7px 18px; font-size: 0.72rem; font-weight: 700; letter-spacing: .08em;
                border-bottom: 2px solid transparent; color: #6b7280; cursor: pointer;
                transition: color .15s, border-color .15s; user-select: none;
            }
            .ec-tab.active { color: #d4af37; border-bottom-color: #d4af37; }
            .ec-yield-ribbon {
                position: absolute; top: -1px; right: 10px;
                background: linear-gradient(90deg, #c9a227, #f0d060);
                color: #000; font-size: 7.5px; font-weight: 900; letter-spacing: .05em;
                padding: 2px 8px 3px; border-radius: 0 0 6px 6px;
            }
            .ec-section-label {
                font-size: 0.62rem; font-weight: 700; letter-spacing: .14em;
                color: rgba(212,175,55,0.65); text-transform: uppercase;
                border-bottom: 1px solid rgba(212,175,55,0.15);
                padding-bottom: 5px; margin-bottom: 10px; margin-top: 16px;
            }
            .ec-section-label:first-child { margin-top: 0; }
            .ec-btn {
                display: inline-flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, #c9a227, #d4af37); color: #000;
                font-weight: 800; font-size: 0.72rem; padding: 7px 12px;
                border-radius: 6px; border: none; cursor: pointer; transition: all .15s;
            }
            .ec-btn:hover:not(:disabled) { background: linear-gradient(135deg, #d4af37, #edd97a); box-shadow: 0 4px 12px rgba(212,175,55,0.3); }
            .ec-btn:disabled { opacity: 0.35; cursor: not-allowed; background: #374151; color: #9ca3af; }
            .ec-coin {
                border-radius: 50%;
                background: radial-gradient(circle at 35% 35%, #f0d060 0%, #c9a227 55%, #8b6914 100%);
                display: inline-flex; align-items: center; justify-content: center;
                font-weight: 900; color: #000; flex-shrink: 0;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.3);
            }
        `;
        document.head.appendChild(st);
    }

    const kaskoActive = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
    const tempKaskoDay = gameState.tempKaskoExpiresDay || 0;
    const tempKaskoActive = kaskoActive && tempKaskoDay > 0 && gameState.day <= tempKaskoDay;
    const execPassActive = !!(gameState.executivePassActive && gameState.day <= (gameState.executivePassExpiresDay||0));
    const radarActive = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    const plate = !!gameState.hasPrestigiousPlate;
    const restingCount   = (gameState.drivers||[]).filter(d => d.id!=='ceo' && d.status==='resting').length;
    const stressedCount  = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0||d.burnout_until)).length;
    const trainingCount  = (gameState.driverAcademy||[]).length;
    const constructions  = (gameState.constructions||[]);
    const lowFuel        = (gameState.fleet||[]).filter(c => (c.fuel||0)<100).length;
    const ceoNeedEnergy  = (gameState.energy||0) < 100;

    // ── TAB: ACQUISISCI FONDI ─────────────────────────────────────────────────
    const ecPkgs = [
        { dc:50,   bonus:null,  price:'€4,99',  label:'Il Fondo Cassa',       sub:'Liquidità operativa immediata' },
        { dc:220,  bonus:'+10%', price:'€19,99', label:'Portafoglio Corporate', sub:'Executive Yield incluso' },
        { dc:600,  bonus:'+20%', price:'€49,99', label:'Conto Offshore',        sub:'Rendimento garantito' },
        { dc:1300, bonus:'+30%', price:'€99,99', label:'Il Fondo Sovrano',      sub:'Rendimento massimizzato' },
    ];

    const _acqHtml = `
        <div style="font-size:0.68rem;color:rgba(212,175,55,0.5);text-align:center;margin-bottom:16px;letter-spacing:.03em;">
            Pacchetti simulati (demo) — I Driver Coins si accumulano con missioni Presidential e trasferimenti VIP.
        </div>
        <div class="grid grid-cols-2 gap-3">
        ${ecPkgs.map(p => `
            <div class="ec-card" style="${p.bonus==='+30%'?'border-color:rgba(212,175,55,0.6);background:linear-gradient(135deg,rgba(15,12,30,0.98),rgba(30,22,60,0.96));':''}">
                ${p.bonus ? `<div class="ec-yield-ribbon">Executive Yield ${p.bonus}</div>` : ''}
                <div style="padding-top:${p.bonus?'12px':'0'};">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                        <div class="ec-coin" style="width:24px;height:24px;font-size:8px;">CE</div>
                        <span style="font-size:1.4rem;font-weight:900;color:#d4af37;line-height:1;">${p.dc}</span>
                        <span style="font-size:0.62rem;color:#9ca3af;margin-top:6px;">DC</span>
                    </div>
                    <div style="font-size:0.78rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:2px;">${p.label}</div>
                    <div style="font-size:0.62rem;color:rgba(212,175,55,0.55);margin-bottom:10px;">${p.sub}</div>
                    <div style="font-size:1.05rem;font-weight:900;color:#d4af37;margin-bottom:10px;">${p.price}</div>
                    <button class="ec-btn" style="width:100%;" onclick="window._dcSimPurchase(${p.dc})">Acquisisci</button>
                </div>
            </div>`).join('')}
        </div>
    `;

    // ── TAB: SERVIZI ESCLUSIVI ────────────────────────────────────────────────
    const _itemRow = (it) => `
        <div class="ec-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;${it.disabled?'opacity:0.4;':''}">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <span style="font-size:1.25rem;flex-shrink:0;">${it.icon}</span>
                <div style="min-width:0;">
                    <div style="font-size:0.77rem;font-weight:700;color:#fff;line-height:1.2;">${it.label}</div>
                    <div style="font-size:0.62rem;color:#9ca3af;line-height:1.3;">${it.sub}</div>
                </div>
            </div>
            <button class="ec-btn" style="width:auto;padding:6px 12px;white-space:nowrap;flex-shrink:0;"
                onclick="${it.disabled?'':it.fn}" ${it.disabled?'disabled':''}>
                ${it.disabled ? it.disabledLabel : `${it.cost} DC`}
            </button>
        </div>`;

    const opItems = [
        { label:'Caffè Sospeso',        sub:'Azzera lo stress del driver più esausto',          cost:10,  icon:'☕',  fn:'window._ecCaffeSospeso()',        disabled:stressedCount===0,     disabledLabel:'Staff in forma' },
        { label:'Manutenzione Express', sub:'Ripara il veicolo più danneggiato al 100%',        cost:25,  icon:'🔧', fn:'window._ecManutenzioneExpress()',  disabled:(gameState.fleet||[]).every(c=>(c.condition||100)>=100), disabledLabel:'Flotta perfetta' },
        { label:'Tangente al Sindacato',sub:'Blocca scioperi per 1 giorno di gioco',            cost:50,  icon:'🤝', fn:'window._ecTangenteSindacato()',    disabled:(gameState.tangenteUntil||0)>gameState.day, disabledLabel:'Già protetto' },
        { label:'Rifornimento Flotta',  sub:`${lowFuel} veicoli sotto al 100% di carburante`,  cost:3,   icon:'⛽',  fn:'fuelBoostDC()',                    disabled:lowFuel===0,           disabledLabel:'Flotta piena' },
        { label:'Ricarica Energia CEO', sub:'Recupero immediato al 100%',                       cost:4,   icon:'⚡',  fn:'energyBoostDC()',                  disabled:!ceoNeedEnergy,        disabledLabel:'Già al 100%' },
        { label:'Sveglia Flotta',       sub:`${restingCount} autisti in pausa forzata`,         cost:Math.max(3,restingCount*2), icon:'⏰', fn:'wakeAllDriversDC()', disabled:restingCount===0, disabledLabel:'Nessuno a riposo' },
        { label:'Benessere Staff',      sub:`${stressedCount} autisti con stress o burnout`,    cost:Math.max(4,stressedCount*2), icon:'💊', fn:'healAllDriversDC()', disabled:stressedCount===0, disabledLabel:'Staff in forma' },
        { label:'Completamento Corsi',  sub:`${trainingCount} corsi in accademia attivi`,       cost:Math.max(1,trainingCount*5), icon:'🎓', fn:'skipAllAcademyDC()', disabled:trainingCount===0, disabledLabel:'Nessun corso' },
        { label:'Costruzioni Lampo',    sub:`${constructions.length} cantieri in corso`,        cost:Math.max(1,constructions.length*8), icon:'🏗️', fn:'skipAllConstructionsDC()', disabled:constructions.length===0, disabledLabel:'Nessuna costruzione' },
        { label:'Pacchetto Operativo',  sub:'Carburante + Energia CEO + Sveglia autisti',       cost:9,   icon:'🚀', fn:'opsBundleDC()',  disabled:lowFuel===0&&!ceoNeedEnergy&&restingCount===0, disabledLabel:'Tutto OK' },
        { label:'Pacchetto Imperiale',  sub:'Tutto in uno: flotta, staff, corsi, edifici',      cost:35,  icon:'👑', fn:'fullBundleDC()', disabled:false,  disabledLabel:'' },
        { label:'Limite Offline +2h',   sub:`Progressione offline attuale: ${offLimit}h (max 12h)`, cost:20, icon:'🕐', fn:"window._dcSpend('offline_limit',20)", disabled:offLimit>=12, disabledLabel:'Massimo raggiunto' },
        { label:'Auto-Rest CEO',        sub:'Recupero energetico automatico durante offline',   cost:30,  icon:'🛌', fn:"window._dcSpend('auto_rest',30)", disabled:autoRest, disabledLabel:'Già attivo' },
    ];

    const assicItems = [
        {
            label:'Polizza Kasko Corporate',
            sub: kaskoActive && !tempKaskoActive ? 'Polizza permanente attiva — copertura illimitata'
                : tempKaskoActive ? `Attiva fino al giorno ${tempKaskoDay} (${tempKaskoDay - gameState.day} gg rimasti)`
                : 'Copertura incidenti per 7 giorni di gioco',
            cost:150, icon:'🛡️', fn:'window._ecPolizzaKasko()',
            disabled: kaskoActive && !tempKaskoActive, disabledLabel:'Polizza attiva'
        },
        {
            label:'Executive Pass',
            sub: execPassActive ? `Attivo — ${(gameState.executivePassExpiresDay||0)-gameState.day} giorni rimasti`
                : '+25% slot corse · −50% stress · Insta-Repair 1DC · VIP extra',
            cost:150, icon:'💎', fn:'activateExecutivePass()',
            disabled:execPassActive, disabledLabel:'Già attivo'
        },
    ];

    const presItems = [
        {
            label:'Radar VIP',
            sub: radarActive ? 'Attivo — accesso prioritario corse VIP potenziato'
                : 'Priority queue +100% per 72 ore di gioco',
            cost:200, icon:'📡', fn:'window._ecRadarVip()',
            disabled:radarActive, disabledLabel:'Già attivo'
        },
        {
            label:'Targa Nera Presidenziale',
            sub: plate ? 'Targa applicata — prestigio massimo sbloccato'
                : 'Cosmetico permanente. Sblocca clienti esclusivi e reputazione extra.',
            cost:500, icon:'🏴', fn:'window._ecTargaPresidenziale()',
            disabled:plate, disabledLabel:'Già posseduta'
        },
    ];

    const _serviziHtml = `
        <div class="ec-section-label">Operatività & Flotta</div>
        ${opItems.map(_itemRow).join('')}
        <div class="ec-section-label">Assicurazioni & Licenze</div>
        ${assicItems.map(_itemRow).join('')}
        <div class="ec-section-label">Prestigio</div>
        ${presItems.map(_itemRow).join('')}
    `;

    // ── RENDER ────────────────────────────────────────────────────────────────
    container.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(5,5,15,0.98),rgba(15,12,35,0.98));border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:0.58rem;letter-spacing:.2em;color:rgba(212,175,55,0.55);text-transform:uppercase;font-weight:700;">Chauffeur Empire</div>
                <div style="font-size:1.05rem;font-weight:900;color:#d4af37;letter-spacing:.04em;font-family:serif;">Executive Club</div>
                <div style="font-size:0.6rem;color:#4b5563;margin-top:2px;">Private Banking · Black Card Services</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.58rem;letter-spacing:.1em;color:rgba(212,175,55,0.45);text-transform:uppercase;">Saldo</div>
                <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-top:3px;">
                    <div class="ec-coin" style="width:20px;height:20px;font-size:7px;">CE</div>
                    <span style="font-size:1.15rem;font-weight:900;color:#d4af37;font-family:monospace;">${dc.toLocaleString()}</span>
                    <span style="font-size:0.62rem;color:#6b7280;">DC</span>
                </div>
            </div>
        </div>

        <div style="display:flex;border-bottom:1px solid rgba(212,175,55,0.15);margin-bottom:16px;">
            <div class="ec-tab ${_ecActiveTab==='acquire'?'active':''}" onclick="window._ecSwitchTab('acquire')">Acquisisci Fondi</div>
            <div class="ec-tab ${_ecActiveTab==='services'?'active':''}" onclick="window._ecSwitchTab('services')">Servizi Esclusivi</div>
        </div>

        ${_ecActiveTab === 'acquire' ? _acqHtml : _serviziHtml}
    `;
}
window.renderTabPremiumStore = renderTabPremiumStore;

window._dcSimPurchase = async function(amount) {
    // Optimistic local credit
    gameState.driverCoins = (gameState.driverCoins || 0) + amount;
    renderTabPremiumStore();
    updateUI();

    // Persist to DB so RPCs can debit the authoritative column
    try {
        const result = await window.ServerState?.addDriverCoins(amount);
        if (result?.ok && result.driver_coins != null) {
            gameState.driverCoins = result.driver_coins;
            renderTabPremiumStore();
            updateUI();
        }
    } catch (e) {
        console.warn('[_dcSimPurchase] RPC error — balance is local only:', e);
    }

    if (typeof showNotification === 'function') showNotification(`🪙 +${amount} Driver Coins! (Acquisto simulato)`, 'success');
    saveGame();
};

window._dcSpend = async function(itemId, cost) {
    if ((gameState.driverCoins || 0) < cost) {
        if (typeof showNotification === 'function') showNotification(`Driver Coins insufficienti! Servono ${cost} DC.`, 'error');
        return;
    }

    // Optimistic local debit — server RPC is the authority
    gameState.driverCoins -= cost;
    updateUI();

    try {
        let result;
        switch (itemId) {
            case 'energy_full':
                result = await window.ServerState?.buyEnergyRefill(cost);
                if (result?.ok) {
                    gameState.energy = 100;
                    logToMap('⚡ Energia CEO ricaricata (DC)!');
                }
                break;
            case 'repair_all':
                result = await window.ServerState?.buyFleetRepair(cost);
                if (result?.ok) {
                    (gameState.fleet || []).forEach(c => { c.condition = 100; c.fuel = 100; c.tirePressure = 100; });
                    logToMap('🔧 Tutta la flotta riparata (DC)!');
                }
                break;
            case 'unlock_ride':
                result = await window.ServerState?.buyVipContact(cost);
                if (result?.ok && typeof generatePOIRide === 'function') {
                    const r = generatePOIRide('ultra');
                    if (r) logToMap('🎫 Contatto VIP: corsa ultra generata (DC)!');
                }
                break;
            case 'offline_limit':
                result = await window.ServerState?.upgradeOfflineLimit(cost);
                if (result?.ok) {
                    gameState.offlineLimit = result.offline_limit_hours;
                    logToMap(`🕐 Limite offline espanso a ${result.offline_limit_hours}h (DC)!`);
                }
                break;
            case 'auto_rest':
                result = await window.ServerState?.buyAutoRest(cost);
                if (result?.ok) {
                    gameState.autoRestEnabled = true;
                    logToMap('🛌 Auto-Rest CEO attivato (DC)!');
                }
                break;
            default:
                // itemId non riconosciuto — rollback immediato
                gameState.driverCoins += cost;
                if (typeof showNotification === 'function') showNotification(`⚠ Operazione non riconosciuta: ${itemId}`, 'error');
                return;
        }

        if (result && !result.ok) {
            // RPC rejected — roll back local debit
            gameState.driverCoins += cost;
            if (typeof showNotification === 'function') showNotification(`⚠ ${result.error || 'Operazione fallita'}`, 'error');
        } else if (result?.ok) {
            // Sync authoritative coin count from server response
            if (result.driver_coins !== undefined) gameState.driverCoins = result.driver_coins;
            if (typeof showNotification === 'function') showNotification(`🪙 −${cost} DC · attivato!`, 'success');
        }
    } catch (e) {
        // Network error — roll back
        gameState.driverCoins += cost;
        console.error('[_dcSpend] RPC error:', e);
        if (typeof showNotification === 'function') showNotification('⚠ Errore di rete — operazione annullata', 'error');
    }

    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    renderTabPremiumStore();
    updateUI();
    saveGame();
};

// ── EXECUTIVE CLUB — SPEND HANDLERS ──────────────────────────────────────────

window._ecCaffeSospeso = async function() {
    const COST = 10;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const stressed = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0 || d.burnout_until));
    if (!stressed.length) { showNotification('Nessun autista esausto.','info'); return; }
    stressed.sort((a,b) => (b.stress_level||0)-(a.stress_level||0));
    const target = stressed[0];
    gameState.driverCoins -= COST;
    target.stress_level = 0; delete target.burnout_until;
    try { await window.ServerState?.spendDriverCoins('caffe_sospeso', COST); } catch(e) { console.error(e); }
    logToMap(`☕ Caffè Sospeso: ${target.name} è tornato operativo!`);
    showNotification(`☕ ${target.name}: stress azzerato! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecManutenzioneExpress = async function() {
    const COST = 25;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const damaged = (gameState.fleet||[]).filter(c => (c.condition||100)<100);
    if (!damaged.length) { showNotification('Flotta in perfette condizioni.','info'); return; }
    damaged.sort((a,b) => (a.condition||100)-(b.condition||100));
    const car = damaged[0];
    gameState.driverCoins -= COST;
    car.condition = 100; car.fuel = 100;
    try { await window.ServerState?.spendDriverCoins('manutenzione_express', COST); } catch(e) { console.error(e); }
    logToMap(`🔧 Manutenzione Express: ${car.name||car.id} ripristinata al 100%!`);
    showNotification(`🔧 ${car.name||car.id}: condizione 100%! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecTangenteSindacato = async function() {
    const COST = 50;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    if ((gameState.tangenteUntil||0) > gameState.day) { showNotification('Già protetto dagli scioperi!','info'); return; }
    gameState.driverCoins -= COST;
    gameState.tangenteUntil = gameState.day + 1;
    try { await window.ServerState?.spendDriverCoins('tangente_sindacato', COST); } catch(e) { console.error(e); }
    logToMap('🤝 Tangente al Sindacato pagata — scioperi bloccati per 24 ore!');
    showNotification(`🤝 Scioperi bloccati per 24h! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecPolizzaKasko = async function() {
    const COST = 150;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const hasPerm = typeof hasInvestment === 'function' && hasInvestment('inv_kasko') && !gameState.tempKaskoExpiresDay;
    if (hasPerm) { showNotification('Polizza Kasko permanente già attiva!','info'); return; }
    const tempStillActive = (gameState.tempKaskoExpiresDay||0) > 0 && gameState.day <= gameState.tempKaskoExpiresDay;
    if (tempStillActive) { showNotification('Polizza Kasko già attiva!','info'); return; }
    gameState.driverCoins -= COST;
    if (!hasInvestment('inv_kasko')) {
        if (!gameState.investments) gameState.investments = [];
        gameState.investments.push('inv_kasko');
    }
    gameState.tempKaskoExpiresDay = gameState.day + 7;
    try { await window.ServerState?.spendDriverCoins('polizza_kasko', COST); } catch(e) { console.error(e); }
    logToMap('🛡️ Polizza Kasko Corporate attivata per 7 giorni di gioco!');
    showNotification(`🛡️ Kasko attiva per 7 giorni! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecRadarVip = async function() {
    const COST = 200;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const already = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    if (already) { showNotification('Radar VIP già attivo!','info'); return; }
    gameState.driverCoins -= COST;
    if (typeof window._applyBuff === 'function') window._applyBuff('radar_vip', 'vip_queue', 100, 72);
    try { await window.ServerState?.spendDriverCoins('radar_vip', COST); } catch(e) { console.error(e); }
    logToMap('📡 Radar VIP: accesso prioritario corse VIP per 72 ore!');
    showNotification(`📡 Radar VIP attivato per 72 ore! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecTargaPresidenziale = async function() {
    const COST = 500;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    if (gameState.hasPrestigiousPlate) { showNotification('Targa Presidenziale già posseduta!','info'); return; }
    gameState.driverCoins -= COST;
    gameState.hasPrestigiousPlate = true;
    try { await window.ServerState?.spendDriverCoins('targa_presidenziale', COST); } catch(e) { console.error(e); }
    logToMap('🏴 Targa Nera Presidenziale: massimo prestigio raggiunto!');
    showNotification(`🏴 Targa Presidenziale applicata! Benvenuto nell\'élite. (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

// ── MERCATO AUTO + ASTE LIVE ──────────────────────────────────────────────────

function renderTabMarket() {
    const container = document.getElementById('tab-container');
    const npcList     = gameState.npcMarket || [];
    const myListings  = (gameState.marketplace||[]).map(l => ({...l, car:gameState.fleet.find(c=>c.id===l.carId)})).filter(l=>l.car);
    const auc         = gameState.activeAuction;
    const curH        = gameState.day * 24 + gameState.hour;
    const fleetVal    = gameState.fleet.reduce((s,c)=>{
        const cond = c.condition||100;
        return s + Math.round(20000*(cond/100)*(c.tier==='ultra'?5:c.tier==='vip'?3:c.tier==='business'?1.8:1));
    }, 0);

    let html = DS.header({
        eyebrow: 'Compravendita Veicoli',
        title:   'Mercato Auto',
        subtitle:`${npcList.length} disponibili · ${myListings.length} tuoi annunci · Flotta stimata €${Math.round(fleetVal/1000)}k`,
    }) + DS.kpiStrip([
        { label:'Usato Disponibile', val: npcList.length,                                  color: npcList.length > 0 ? 'blue' : '' },
        { label:'Tuoi Annunci',      val: myListings.length,                               color: myListings.length > 0 ? 'gold' : '' },
        { label:'Asta Live',         val: auc ? 'ATTIVA' : 'Nessuna',                      color: auc ? 'red' : '' },
        { label:'Budget',            val: '€' + ((gameState.cash||0)/1000).toFixed(0)+'k', color:'green' },
    ]);

    // ── ASTA LIVE ─────────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:0 0 12px">🔨 Asta Live</div>`;
    if (auc) {
        const hoursLeft = Math.max(0, auc.endsHour - curH);
        const isWinning = auc.playerBid && auc.playerBid >= auc.currentBid;
        const urgentColor = hoursLeft < 3 ? 'var(--red)' : 'var(--text)';
        html += `<div class="ds-card ds-card--gold" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                    <div style="font-size:13px;font-weight:700;color:var(--text)">${auc.name}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${auc.tier.toUpperCase()}</div>
                    <div style="margin-top:6px">
                        ${isWinning ? DS.pill('✅ Stai vincendo!', 'green') : auc.playerBid ? DS.pill('⚠ Superato!', 'red', true) : DS.pill('Fai un\'offerta', 'blue')}
                    </div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:9px;color:var(--text-muted)">Scade in</div>
                    <div style="font-size:20px;font-weight:700;font-family:var(--font-mono);color:${urgentColor}">${hoursLeft}h</div>
                    <div style="font-size:20px;font-weight:700;font-family:var(--font-mono);color:var(--gold)">€${auc.currentBid.toLocaleString()}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                ${[auc.currentBid + 5000, auc.currentBid + 15000, auc.currentBid + 50000].map(bid =>
                    `<button onclick="bidOnAuction(${bid})" class="ds-btn ds-btn--gold" style="flex-direction:column;gap:2px;padding:10px 6px;justify-content:center;font-size:9px">
                        <span>+€${(bid - auc.currentBid).toLocaleString()}</span>
                        <span style="opacity:.6;font-size:8px">tot €${bid.toLocaleString()}</span>
                    </button>`
                ).join('')}
            </div>
        </div>`;
    } else {
        html += DS.empty({ icon:'🔨', title:'Nessuna asta attiva', body:'Le aste rare partono casualmente ogni giorno di gioco.' });
        html += '<div style="margin-bottom:20px"></div>';
    }

    // ── VEICOLI NPC ───────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:0 0 12px">🚗 Usato Disponibile (${npcList.length})</div>`;
    if (npcList.length === 0) {
        html += DS.empty({ icon:'🚗', title:'Nessun veicolo', body:'Il mercato si aggiorna ogni 3 giorni di gioco.' });
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">`;
        npcList.forEach(listing => {
            const condColor = listing.condition < 40 ? 'red' : listing.condition < 70 ? 'orange' : 'green';
            const canBuy = (gameState.cash||0) >= listing.price;
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${listing.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${listing.tier.toUpperCase()} · ${Math.floor(listing.mileage/1000)}k km</div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                        ${DS.pill(listing.condition + '%', condColor)}
                        ${DS.progress(listing.condition, condColor)}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:var(--font-mono)">€${listing.price.toLocaleString()}</div>
                    ${DS.btn({ label:'Acquista', color: canBuy ? 'gold' : 'ghost', onclick:`buyNpcCar('${listing.id}')`, disabled:!canBuy, size:'sm' })}
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── TUOI ANNUNCI ──────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:0 0 12px">📋 Tuoi Annunci (${myListings.length})</div>`;
    if (myListings.length === 0) {
        html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:20px">Nessun annuncio attivo. Vai in <strong>Flotta</strong> → card veicolo → Metti in Vendita.</div>`;
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">`;
        myListings.forEach(l => {
            const daysLeft = Math.max(0, 2 - (gameState.day - l.listedDay));
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${l.car.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">€${l.askPrice.toLocaleString()} · ${daysLeft > 0 ? `Acquirente in ~${daysLeft}g` : 'Vendita in corso…'}</div>
                </div>
                ${DS.btn({ label:'Ritira', color:'red', onclick:`cancelListing('${l.id}')`, size:'sm' })}
            </div>`;
        });
        html += `</div>`;
    }

    // ── VENDI DALLA FLOTTA ────────────────────────────────────────
    const sellableCars = gameState.fleet.filter(c =>
        !c.isLease &&
        !(gameState.marketplace||[]).some(l => l.carId === c.id) &&
        !gameState.drivers.some(d => d.assignedCarId === c.id && d.status === 'busy')
    );
    if (sellableCars.length > 0) {
        html += `<div class="ds-eyebrow" style="margin:0 0 12px">💰 Metti in Vendita</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">`;
        sellableCars.forEach(car => {
            const condPct = Math.floor(car.condition || 0);
            const suggest = Math.round(20000*(condPct/100)*(car.tier==='ultra'?5:car.tier==='vip'?3:car.tier==='business'?1.8:1));
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${car.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${car.tier.toUpperCase()} · ${condPct}% condizione</div>
                    <div style="font-size:10px;color:var(--green);margin-top:2px">Stima: ~€${suggest.toLocaleString()}</div>
                </div>
                ${DS.btn({ label:`Vendi ~€${(suggest/1000).toFixed(0)}k`, color:'gold', onclick:`listCarForSale('${car.id}', ${suggest})`, size:'sm' })}
            </div>`;
        });
        html += `</div>`;
    }

    // ── P2P MERCATO REALE ─────────────────────────────────────────
    if (typeof renderP2PMarketSection === 'function') html += renderP2PMarketSection();

    container.innerHTML = html;
}
window.renderTabMarket = renderTabMarket;

// ══════════════════════════════════════════════════════════════════
// TAB AIUTO & SUPPORTO
// ══════════════════════════════════════════════════════════════════

function renderTabHelp() {
    const container = document.getElementById('tab-container');
    const cfg = window.GAME_CONFIG || {};
    const email = cfg.SUPPORT_EMAIL || 'support@chauffeurempire.com';
    const userId = window.currentUser?.id || 'N/D';
    const companyName = (gameState.companyName || 'La tua azienda');
    const bugSubject = encodeURIComponent(`Bug Report — ID: ${userId}`);
    const generalSubject = encodeURIComponent(`Supporto — ${companyName}`);
    const build = new Date().toLocaleDateString('it-IT', { month:'short', year:'numeric' });

    container.innerHTML = DS.header({
        eyebrow: 'Centro Assistenza',
        title:   'Supporto & Documentazione',
        subtitle:`Risposta garantita entro 24h · Build ${build}`,
    }) + `

    <div class="ds-grid-2" style="margin-bottom:20px">

        <div class="ds-card">
            <div class="ds-eyebrow" style="margin-bottom:10px">Contatto Diretto</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">📧 Email Ufficiale</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Il team risponde entro 24h nei giorni lavorativi. Includi sempre il tuo ID compagnia.</div>
            <a href="mailto:${email}" class="ds-btn ds-btn--gold" style="display:inline-flex;text-decoration:none">
                ✉ ${email}
            </a>
        </div>

        <div class="ds-card ds-card--alert">
            <div class="ds-eyebrow" style="margin-bottom:10px;color:var(--red)">Segnalazione Bug</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">🐛 Report Tecnico</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">ID Compagnia pre-compilato nell'oggetto. Descrivi il bug nella mail.</div>
            <div style="font-size:9px;font-family:var(--font-mono);color:var(--text-dim);margin-bottom:12px;word-break:break-all">${userId}</div>
            <a href="mailto:${email}?subject=${bugSubject}" class="ds-btn ds-btn--red" style="display:inline-flex;text-decoration:none;width:100%;justify-content:center">
                🐛 Apri Email — Segnala Bug
            </a>
        </div>
    </div>

    <div class="ds-card" style="margin-bottom:20px">
        <div class="ds-eyebrow" style="margin-bottom:12px">Domande Frequenti</div>
        <div style="display:flex;flex-direction:column;gap:0">
            ${[
                { q:'Come recupero la password?',  a:`Usa il link "Password dimenticata" nella schermata di login. Il link è valido 30 minuti.` },
                { q:'I miei progressi sono salvati?', a:`Sì. Il gioco usa salvataggio cloud automatico su Supabase. I dati vengono sincronizzati ogni volta che esegui un\'azione.` },
                { q:'Come funziona la classifica?', a:`Si aggiorna ogni volta che un giocatore completa un\'azione (corsa, acquisto, ecc). Mostra il patrimonio liquido totale.` },
                { q:'Posso giocare su più dispositivi?', a:`Sì, il salvataggio cloud ti permette di continuare su qualsiasi browser. Usa le stesse credenziali.` },
                { q:'Problemi con i pagamenti DC?', a:`Scrivi all\'email di supporto con oggetto "Pagamento DC" e il tuo ID compagnia. Verifichiamo entro 4h.` },
            ].map((faq, i) => `
            <div style="padding:12px 0;border-bottom:1px solid var(--border-sub);cursor:pointer"
                 onclick="this.querySelector('.faq-a').style.display=this.querySelector('.faq-a').style.display==='none'?'block':'none'">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:11px;font-weight:600;color:var(--text)">${faq.q}</div>
                    <span style="color:var(--text-muted);font-size:14px">⌄</span>
                </div>
                <div class="faq-a" style="display:none;margin-top:8px;font-size:11px;color:var(--text-muted);line-height:1.5">${faq.a}</div>
            </div>`).join('')}
        </div>
    </div>

    <div style="text-align:center;padding:16px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid var(--border-sub)">
        <div style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">
            CHAUFFEUR EMPIRE · ${cfg.GAME_URL || 'chauffeurempire.com'} · Build ${build}
        </div>
        <div style="margin-top:8px;display:flex;gap:12px;justify-content:center">
            <a href="terms.html" target="_blank" style="font-size:9px;color:var(--text-muted);text-decoration:none">Termini</a>
            <a href="privacy.html" target="_blank" style="font-size:9px;color:var(--text-muted);text-decoration:none">Privacy</a>
            <a href="rules.html" target="_blank" style="font-size:9px;color:var(--text-muted);text-decoration:none">Regole</a>
        </div>
    </div>`;
}
window.renderTabHelp = renderTabHelp;

// Re-render whatever tab is currently active (used by lang.js setLang)
window.renderCurrentTab = function() {
    if (typeof _activeTab !== 'undefined' && _activeTab) {
        window.switchTab(_activeTab);
    }
};

// ── SMART HUB ────────────────────────────────────────────────────
window.toggleHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    const isHidden = modal.classList.contains('hidden');
    if (isHidden) { window.openHub(); } else { window.closeHub(); }
};

window.openHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('hub-modal-open');
    _updateHubStats();
    // Clear event badge
    if (typeof gameState !== 'undefined') gameState._hubNewEvent = false;
    const badge = document.getElementById('hub-event-badge');
    if (badge) badge.classList.add('hidden');
};

window.closeHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('hub-modal-open');
};

window.hubNavigate = function(tab) {
    window.closeHub();
    setTimeout(() => { if (typeof switchTab === 'function') switchTab(tab); }, 80);
};

function _updateHubStats() {
    if (typeof gameState === 'undefined') return;
    const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

    const cashEl = document.getElementById('hub-cash');
    const repEl  = document.getElementById('hub-rep');
    const dayEl  = document.getElementById('hub-day');
    const timeEl = document.getElementById('hub-time');
    const logoEl = document.getElementById('hub-company-logo');
    const nameEl = document.getElementById('hub-company-name');

    const c = gameState.cash || 0;
    const cashStr = c >= 1e9 ? `€${(c/1e9).toFixed(2)}B` : c >= 1e6 ? `€${(c/1e6).toFixed(2)}M` : c >= 1e3 ? `€${Math.floor(c/1e3)}k` : `€${Math.floor(c)}`;
    if (cashEl) cashEl.innerText = cashStr;
    if (repEl)  repEl.innerText  = `${(gameState.reputation||0).toFixed(1)}★`;
    if (dayEl)  dayEl.innerText  = `${gameState.day||1} ${MONTHS[(gameState.month||1)-1]}`;
    if (timeEl) timeEl.innerText = `${String(gameState.hour||8).padStart(2,'0')}:${String(gameState.minute||0).padStart(2,'0')}`;
    if (logoEl) logoEl.innerText = gameState.companyLogo || '👁️';
    if (nameEl) nameEl.innerText = gameState.companyName || 'Chauffeur Empire';

    // Module badges
    const ridesEl   = document.getElementById('hmod-rides');
    const staffEl   = document.getElementById('hmod-staff');
    const mailEl    = document.getElementById('hmod-mail');
    const strikeEl  = document.getElementById('hmod-strike');
    const unread = (gameState.emails||[]).filter(e=>e.status==='unread').length;
    const striking = (gameState.drivers||[]).filter(d=>d.isOnStrike).length;
    if (ridesEl) ridesEl.innerText = (gameState.pendingRides||[]).length;
    if (staffEl) staffEl.innerText = (gameState.drivers||[]).filter(d=>d.id!=='ceo').length;
    if (mailEl)  { mailEl.innerText = unread; mailEl.classList.toggle('hidden', unread === 0); }
    if (strikeEl) strikeEl.classList.toggle('hidden', striking === 0);

    // Espansione 11: badge nemici VIP
    const nemBadge = document.getElementById('hmod-nemesis');
    if (nemBadge) {
        const nemCount = Object.keys(gameState.vipNemeses || {}).length;
        nemBadge.textContent = nemCount;
        nemBadge.classList.toggle('hidden', nemCount === 0);
    }

    // Active event banner
    const ev = gameState.activeDynamicEvent;
    const banner = document.getElementById('hub-event-banner');
    if (banner) {
        if (ev) {
            banner.classList.remove('hidden');
            const evIcon = document.getElementById('hub-ev-icon');
            const evName = document.getElementById('hub-ev-name');
            const evMeta = document.getElementById('hub-ev-meta');
            const evMult = document.getElementById('hub-ev-mult');
            const hoursLeft = Math.max(0, ev.endsHour - ((gameState.day||1)*24 + (gameState.hour||0)));
            if (evIcon) evIcon.innerText = ev.icon || '🎬';
            if (evName) evName.innerText = ev.name;
            if (evMeta) evMeta.innerText = `${(ev.rarity||'').toUpperCase()} · ${(ev.category||'')} · ${hoursLeft}h rimaste`;
            if (evMult) evMult.innerText = `×${ev.priceMult||1}${ev.surge?' +SURGE':''}`;
            banner.style.borderColor = ev.rarity === 'legendary' ? 'rgba(212,175,55,0.5)' : ev.rarity === 'epic' ? 'rgba(168,85,247,0.5)' : 'rgba(59,130,246,0.4)';
        } else {
            banner.classList.add('hidden');
        }
    }
}
window._updateHubStats = _updateHubStats;

// ─── GLOBAL NEWS FEED (Supabase Realtime) ────────────────────────
function _appendNewsTicker(message) {
    const track = document.getElementById('news-ticker-track');
    if (!track) return;
    const span = document.createElement('span');
    span.textContent = '🌐 ' + message;
    track.appendChild(span);
    // Rimuovi le notizie più vecchie se si accumulano troppo
    const spans = track.querySelectorAll('span');
    if (spans.length > 80) spans[0].remove();
}

async function _initGlobalNewsFeed() {
    if (!window.supabaseClient) return;
    // Carica le ultime 10 notizie già esistenti
    try {
        const { data } = await window.supabaseClient
            .from('global_news')
            .select('message')
            .order('created_at', { ascending: false })
            .limit(10);
        if (data) [...data].reverse().forEach(row => _appendNewsTicker(row.message));
    } catch(e) { /* offline, silenzioso */ }
    // Sottoscrizione Realtime: aggiunge live le nuove notizie
    window.supabaseClient.channel('global_news_feed')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'global_news' },
            payload => _appendNewsTicker(payload.new.message))
        .subscribe();
}

// ─── PROVINCE WAR TAB ───────────────────────────────────────────────────────

async function renderTabRealEstate() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[10px] text-gray-500 text-center py-10">Caricamento immobili…</div>`;

    let listings = [], owned = [];
    try {
        const [lRes, oRes] = await Promise.all([
            window.supabaseClient.from('real_estate_listings').select('*').order('cost'),
            window.supabaseClient.from('company_real_estate').select('*'),
        ]);
        if (lRes.error) throw lRes.error;
        listings = lRes.data || [];
        owned    = oRes.data || [];
    } catch(e) {
        container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore caricamento immobili: ${e.message}</div>`;
        return;
    }

    const ownedIds = new Set(owned.map(o => o.listing_id));
    const totalDailyRent = listings
        .filter(l => ownedIds.has(l.id))
        .reduce((s, l) => s + (l.daily_rent || 0), 0);
    const portfolioValue = listings
        .filter(l => ownedIds.has(l.id))
        .reduce((s, l) => s + (l.cost || 0), 0);

    let html = DS.header({
        eyebrow: 'Real Estate',
        title:   'Portafoglio Immobiliare',
        subtitle: `${ownedIds.size} proprietà · Valore €${portfolioValue.toLocaleString('it-IT')} · Rendita €${totalDailyRent > 0 ? totalDailyRent.toLocaleString('it-IT') : '0'}/g`,
        actions: ownedIds.size > 0 ? DS.pill(`🏛 ${ownedIds.size} Proprietà`, 'gold') : '',
    }) + DS.kpiStrip([
        { label: 'Proprietà',    val: ownedIds.size,  color: ownedIds.size > 0 ? 'gold' : '' },
        { label: 'Valore Port.', val: portfolioValue > 0 ? '€' + Math.round(portfolioValue/1000) + 'k' : '—', color: portfolioValue > 0 ? 'gold' : '' },
        { label: 'Rendita/g',   val: totalDailyRent > 0 ? '+€' + totalDailyRent.toLocaleString('it-IT') : '—', color: totalDailyRent > 0 ? 'green' : '' },
        { label: 'Budget',       val: '€' + Math.round((gameState.cash||0)/1000) + 'k', color: 'blue' },
    ]);

    if (ownedIds.size > 0) {
        html += `<div class="ds-card" style="border-color:rgba(34,197,94,0.3);margin-bottom:16px;font-size:10px;color:var(--text-muted)">
            Le rendite vengono accreditate automaticamente dal server ogni 24h.
        </div>`;
    }

    html += `<div style="display:flex;flex-direction:column;gap:12px">`;
    listings.forEach(l => {
        const isOwned   = ownedIds.has(l.id);
        const canAfford = gameState.cash >= (l.cost || 0);
        const ownedRow  = owned.find(o => o.listing_id === l.id);

        let nextRentStr = '';
        if (isOwned && ownedRow?.last_rent_at) {
            const diffMs = new Date(ownedRow.last_rent_at).getTime() + 86400000 - Date.now();
            if (diffMs > 0) {
                const hrs = Math.floor(diffMs / 3600000), mins = Math.floor((diffMs % 3600000) / 60000);
                nextRentStr = `🕐 ${hrs}h ${mins}m alla prossima rendita`;
            } else {
                nextRentStr = '🕐 Rendita in arrivo…';
            }
        }

        html += `<div class="ds-card${isOwned ? ' ds-card--gold' : !canAfford ? '' : ''}${!canAfford && !isOwned ? '' : ''}">`;

        if (l.image_url) {
            html += `<div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;margin:-16px -16px 12px">
                <img src="${l.image_url}" alt="${l.name}" style="width:100%;height:120px;object-fit:cover;display:block" loading="lazy">
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 60%)"></div>
                ${isOwned ? `<div style="position:absolute;top:8px;right:8px">${DS.pill('✓ Tuo', 'gold')}</div>` : ''}
                <div style="position:absolute;bottom:8px;left:12px">
                    <div style="font-size:14px;font-weight:700;color:#fff">${l.name}</div>
                    <div style="font-size:11px;color:var(--gold)">${l.city}</div>
                </div>
            </div>`;
        } else {
            html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <div style="font-size:14px;font-weight:700;color:var(--text)">${l.name}</div>
                    <div style="font-size:11px;color:var(--gold)">${l.city}</div>
                </div>
                ${isOwned ? DS.pill('✓ Tuo', 'gold') : ''}
            </div>`;
        }

        html += `<div>`;
        if (l.description) {
            html += `<div style="font-size:10px;color:var(--text-muted);line-height:1.5;margin-bottom:8px">${l.description}</div>`;
        }
        html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${DS.pill('+€' + (l.daily_rent||0).toLocaleString('it-IT') + '/g', 'green')}
            ${l.bonus_type === 'driver_stress_recovery' ? DS.pill('✨ Recupero stress', 'purple') : ''}
            ${isOwned && nextRentStr ? DS.pill(nextRentStr, 'blue') : ''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:var(--font-mono)">€${(l.cost||0).toLocaleString('it-IT')}</div>
            ${isOwned
                ? DS.pill('✓ Rendita attiva', 'green')
                : DS.btn({ label: canAfford ? 'Acquista' : `Mancano €${((l.cost||0) - gameState.cash).toLocaleString('it-IT')}`, color: canAfford ? 'gold' : 'ghost', onclick:`window.doBuyRealEstate('${l.id}')`, disabled: !canAfford, size:'sm' })}
        </div></div></div>`;
    });

    html += `</div>`;
    if (listings.length === 0) {
        html += DS.empty({ icon: '🏛', title: 'Nessun immobile disponibile', body: 'Il mercato immobiliare si espanderà nelle prossime stagioni.' });
    }
    container.innerHTML = html;
}

window.doBuyRealEstate = async function(listingId) {
    const result = await window.ServerState?.buyRealEstate(listingId);
    if (result?.success) {
        showBigEvent('🏛', `${result.name} Acquistata!`, `Rendita: €${(result.daily_rent||0).toLocaleString()}/giorno`);
        renderTabRealEstate();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    setupDragAndDrop();
    _initGlobalNewsFeed();
    if (_isMobile()) {
        document.body.classList.add('mobile-mode');
        const sidebar = document.querySelector('nav.fixed.left-4');
        if (sidebar) sidebar.style.display = 'none';
        if (typeof window.renderMobileDispatcher === 'function') {
            window.renderMobileDispatcher();
        }
    }
});

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
            <button onclick="window._startFoundingMode()" style="padding:16px 40px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.6);border-radius:12px;color:#d4af37;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:2px;text-transform:uppercase;">📍 Scegli sulla Mappa</button>
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
            <button onclick="window._cancelFoundingMode()" style="margin-top:20px;padding:8px 24px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:8px;color:#ef4444;font-size:0.8rem;cursor:pointer;">✕ Annulla</button>
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
    <button onclick="document.getElementById('academy-modal').remove()"
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
        return `<button onclick="window._academySelectDriver('${d.id}')"
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
          return `<button onclick="startAcademyCourse('${selDriver.id}','${c.id}');window.openAcademyModal()"
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

window.renderTabRanking     = renderTabRanking;
window.renderTabInvestments = renderTabInvestments;
window.renderTabLegal       = renderTabLegal;
window.renderTabPolitics    = renderTabPolitics;
window.renderTabCareer      = renderTabCareer;
window.renderTabPremiumStore = renderTabPremiumStore;
window.renderTabMarket      = renderTabMarket;
window.renderTabHelp        = renderTabHelp;
window.renderTabRealEstate  = renderTabRealEstate;
