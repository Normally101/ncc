'use strict';
/* ================================================================
   ui-finance.js — Chauffeur Empire
   Finance tab: Bloomberg dashboard, stock market, broker, credit score.
   Dipendenze: engine.js, engine-finance.js (gameState, STOCK_TICKERS,
   _hasWealthManager, _getCreditTier, BROKER_RISK_PROFILES)
   ================================================================ */

function _flashTicker(id, dir) {
    const el = document.getElementById('ftick-' + id);
    if (!el) return;
    el.classList.remove('price-flash-up', 'price-flash-down');
    void el.offsetWidth; // reflow
    el.classList.add(dir === 'up' ? 'price-flash-up' : 'price-flash-down');
}

function renderTabFinance() {
    const container = document.getElementById('tab-container');
    const hasWM = typeof _hasWealthManager === 'function' && _hasWealthManager();

    if (!hasWM) {
        container.innerHTML = DS.header({
            eyebrow: '$WALL-ST · Finance Hub',
            title:   'Mercati Finanziari',
            subtitle:'Sblocca il Wealth Manager nello Staff per accedere',
        }) + DS.card({ mod:'gold', content:`
            <div style="text-align:center;padding:16px 0">
                <div style="font-size:48px;margin-bottom:16px">💼</div>
                <div style="font-size:14px;font-weight:700;color:var(--gold);font-family:var(--font-display);margin-bottom:8px">Finance Hub Bloccato</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:20px">Assumi un <strong>Elite Wealth Manager</strong> nello Staff per sbloccare il mercato azionario, il broker personale e la leva finanziaria avanzata.</div>
                <div style="display:flex;flex-direction:column;gap:8px;text-align:left;max-width:300px;margin:0 auto">
                    ${[
                        { icon:'📈', text:'Mercato Azionario $WALL-ST (5 ticker live)' },
                        { icon:'💼', text:'Broker Personale — ROI fino al +55%' },
                        { icon:'🏦', text:'Credit Score & Leva Finanziaria' },
                        { icon:'🔶', text:'Sblocco Diamond Contracts' },
                    ].map(f => `<div style="display:flex;gap:10px;align-items:center">
                        <span>${f.icon}</span>
                        <span style="font-size:11px;color:var(--text-muted)">${f.text}</span>
                    </div>`).join('')}
                </div>
                <div style="margin-top:20px">${DS.btn({ label:'Vai allo Staff →', color:'gold', onclick:"switchTab('staff')" })}</div>
            </div>
        ` });
        return;
    }

    const prices = gameState.stockPrices || {};
    const holdings = gameState.stockHoldings || {};
    const creditScore = gameState.creditScore || 300;
    const creditTier = _getCreditTier(creditScore);
    const activeLoans = (gameState.loans || []).filter(l => l.amount > 0);
    const activeLoanTotal = activeLoans.reduce((s, l) => s + l.amount, 0);

    // ── PORTFOLIO DASHBOARD CALCULATIONS ────────────────────────
    const holdingsForDash = gameState.stockHoldings || {};
    const pricesForDash = gameState.stockPrices || {};
    const totalStockValue = (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).reduce((sum, t) => {
        const h = holdingsForDash[t.id] || { shares: 0 };
        return sum + h.shares * (pricesForDash[t.id] || t.basePrice);
    }, 0);
    const brokerActiveForDash = (gameState.brokerInvestments || []).filter(b => b.active !== false);
    const totalBrokerValue = brokerActiveForDash.reduce((s, b) => s + (b.capital || 0), 0);
    const totalPortfolio = totalStockValue + totalBrokerValue;
    const yesterday = gameState.portfolioValueYesterday || totalPortfolio;
    const dailyPL = totalPortfolio - yesterday;
    const dailyPct = yesterday > 0 ? (dailyPL / yesterday * 100) : 0;
    const stockPct = totalPortfolio > 0 ? Math.round((totalStockValue / totalPortfolio) * 100) : 0;
    const brokerPct = totalPortfolio > 0 ? Math.round((totalBrokerValue / totalPortfolio) * 100) : 0;
    const plPositive = dailyPL >= 0;
    const plClass = plPositive ? 'positive' : 'negative';
    const plArrow = plPositive ? '▲' : '▼';
    const plSign = plPositive ? '+' : '-';

    const portfolioDashHtml = totalPortfolio > 0 ? `
    <div class="finance-portfolio-dashboard">
        <div class="finance-portfolio-title">▸ PORTAFOGLIO TOTALE</div>
        <div>
            <span class="finance-portfolio-total">€${Math.round(totalPortfolio).toLocaleString()}</span>
            <span class="finance-portfolio-pl ${plClass}">${plSign}€${Math.round(Math.abs(dailyPL)).toLocaleString()} oggi ${plArrow} ${Math.abs(dailyPct).toFixed(2)}%</span>
        </div>
        <div class="finance-alloc-row">
            <span class="finance-alloc-label">Azioni</span>
            <div class="finance-alloc-bar-wrap"><div class="finance-alloc-bar stocks" style="width:${stockPct}%"></div></div>
            <span class="finance-alloc-value">€${Math.round(totalStockValue).toLocaleString()}</span>
            <span class="finance-alloc-pct">${stockPct}%</span>
        </div>
        <div class="finance-alloc-row">
            <span class="finance-alloc-label">Broker</span>
            <div class="finance-alloc-bar-wrap"><div class="finance-alloc-bar broker" style="width:${brokerPct}%"></div></div>
            <span class="finance-alloc-value">€${Math.round(totalBrokerValue).toLocaleString()}</span>
            <span class="finance-alloc-pct">${brokerPct}%</span>
        </div>
    </div>` : '';

    // ── STOCK MARKET ─────────────────────────────────────────────
    const stockHistory  = gameState.stockHistory  || {};
    const shortPositions = gameState.shortPositions || {};
    const stockPrevPrices = gameState.stockPrevPrices || {};

    function _buildSparkline(history, color) {
        if (!history || history.length < 2) return '';
        const W = 80, H = 28;
        const min = Math.min(...history), max = Math.max(...history);
        const range = max - min || 1;
        const pts = history.map((v, i) => {
            const x = (i / (history.length - 1)) * W;
            const y = H - ((v - min) / range) * H;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="sparkline-svg">
            <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }

    let stockHtml = '';
    (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).forEach(t => {
        const price = prices[t.id] || t.basePrice;
        const holding = holdings[t.id] || { shares: 0, avgCost: 0 };
        const shortPos = shortPositions[t.id];
        const prevPrice = stockPrevPrices[t.id];
        const pricePct = prevPrice ? ((price / prevPrice) - 1) * 100 : ((price / t.basePrice) - 1) * 100;
        const isUp = pricePct >= 0;
        const isFlat = Math.abs(pricePct) < 0.01;
        const changeClass = isFlat ? 'flat' : (isUp ? 'up' : 'down');
        const changeArrow = isFlat ? '─' : (isUp ? '▲' : '▼');
        const plAmt = holding.shares > 0 ? Math.round((price - holding.avgCost) * holding.shares) : 0;
        const plPct = holding.avgCost > 0 ? ((price / holding.avgCost) - 1) * 100 : 0;
        const sparkline = _buildSparkline(stockHistory[t.id], t.color);
        const shortPl = shortPos ? Math.round((shortPos.openPrice - price) * shortPos.shares) : 0;
        stockHtml += `
        <div id="ftick-${t.id}" class="finance-ticker-row">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
                <span class="text-base">${t.icon}</span>
                <div style="min-width:0;">
                    <div class="finance-ticker-symbol">${t.name}</div>
                    <div class="text-[7px] text-gray-600" style="font-family:'Courier New',monospace;">${t.fullName}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                ${sparkline}
                <span class="finance-ticker-price">€${price.toFixed(2)}</span>
                <span class="finance-ticker-change ${changeClass}">${changeArrow} ${Math.abs(pricePct).toFixed(1)}%</span>
                ${holding.shares > 0 ? `<span class="finance-ticker-shares">${holding.shares}sh</span>` : ''}
            </div>
        </div>
        <div class="mb-2 px-1">
            ${holding.shares > 0 ? `
            <div class="flex justify-between text-[9px] mb-1">
                <span class="text-gray-400">Long: <b class="text-white">${holding.shares}</b></span>
                <span class="${plAmt >= 0 ? 'text-green-400' : 'text-red-400'} font-bold">${plAmt >= 0 ? '+' : ''}€${plAmt.toLocaleString()} (${plPct.toFixed(1)}%)</span>
            </div>` : ''}
            ${shortPos ? `
            <div class="flex justify-between text-[9px] mb-1">
                <span class="text-purple-400">Short: <b class="text-white">${shortPos.shares}</b> @ €${shortPos.openPrice}</span>
                <span class="${shortPl >= 0 ? 'text-green-400' : 'text-red-400'} font-bold">${shortPl >= 0 ? '+' : ''}€${shortPl.toLocaleString()}</span>
            </div>` : ''}
            <div class="flex gap-1 mt-1">
                <input id="stock-qty-${t.id}" type="number" min="1" value="10" class="finance-input flex-1 text-[10px]" placeholder="qty">
                <button onclick="buyStocks('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-gold !text-[9px] !py-1 !px-2">Compra</button>
                ${holding.shares > 0 ? `<button onclick="sellStocks('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-blue !text-[9px] !py-1 !px-2">Vendi</button>` : ''}
                <button onclick="shortSell('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-red !text-[9px] !py-1 !px-2">Short↓</button>
                ${shortPos ? `<button onclick="coverShort('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" class="btn-purple !text-[9px] !py-1 !px-2">Copri</button>` : ''}
            </div>
        </div>`;
    });

    // ── BROKER INVESTMENTS ───────────────────────────────────────
    const brokerActive = (gameState.brokerInvestments || []).filter(i => !i.resolved);
    const currentHour = gameState.day * 24 + gameState.hour;
    let brokerActiveHtml = brokerActive.length === 0 ? `<div class="text-[10px] text-gray-600 italic mb-3">Nessun investimento attivo.</div>` : '';
    brokerActive.forEach(inv => {
        const profile = (typeof BROKER_RISK_PROFILES !== 'undefined' ? BROKER_RISK_PROFILES : []).find(p => p.id === inv.risk);
        const hoursLeft = Math.max(0, inv.endsHour - currentHour);
        const progress = Math.min(100, ((currentHour - inv.startHour) / (inv.endsHour - inv.startHour)) * 100);
        brokerActiveHtml += `
        <div class="finance-broker-card mb-2">
            <div class="flex justify-between text-[9px] mb-1">
                <span class="font-bold" style="color:${profile?.color||'#fff'}">${profile?.icon||''} ${inv.riskName}</span>
                <span class="text-gray-400">⏱ ${hoursLeft}h rimaste</span>
            </div>
            <div class="flex justify-between text-[10px] mb-1">
                <span>Capitale: <b class="text-white">€${inv.capital.toLocaleString()}</b></span>
                <span>Rendimento: <b style="color:${profile?.color||'#fff'}">${Math.round(inv.maxReturn*100)}% max</b></span>
            </div>
            <div class="broker-progress-track"><div class="broker-progress-fill" style="width:${progress.toFixed(0)}%;background:${profile?.color||'#fff'}"></div></div>
        </div>`;
    });

    // Broker form
    const brokerProfiles = typeof BROKER_RISK_PROFILES !== 'undefined' ? BROKER_RISK_PROFILES : [];
    let brokerFormHtml = `
    <div class="space-y-2 mb-3">
        <div>
            <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Capitale da investire (€)</label>
            <input id="broker-capital" type="number" min="1000" step="1000" value="10000" class="finance-input w-full text-[11px]">
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Profilo di Rischio</label>
            <div class="flex gap-1">
                ${brokerProfiles.map(p => `
                <button onclick="document.querySelectorAll('.risk-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active'); window._brokerRisk='${p.id}';"
                    class="risk-btn flex-1 text-[9px] p-2 rounded-lg border border-white/10 text-left transition-all"
                    style="--risk-color:${p.color}" data-risk="${p.id}">
                    <div class="text-base mb-0.5">${p.icon}</div>
                    <div class="font-bold" style="color:${p.color}">${p.name}</div>
                    <div class="text-[7px] text-gray-500 mt-0.5">max ${Math.round(p.maxReturn*100)}%</div>
                </button>`).join('')}
            </div>
        </div>
        <div>
            <label class="text-[9px] text-gray-500 uppercase tracking-widest block mb-1">Durata</label>
            <div class="flex gap-1">
                <button onclick="window._brokerDur=1;  document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="dur-btn flex-1 text-[9px] p-1.5 rounded-lg border border-white/10">1h</button>
                <button onclick="window._brokerDur=6;  document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="dur-btn flex-1 text-[9px] p-1.5 rounded-lg border border-white/10">6h</button>
                <button onclick="window._brokerDur=24; document.querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="dur-btn flex-1 text-[9px] p-1.5 rounded-lg border border-white/10">24h</button>
            </div>
        </div>
        <button onclick="placeBrokerInvestment(document.getElementById('broker-capital').value, window._brokerRisk||'low', window._brokerDur||6)"
            class="btn-gold w-full uppercase tracking-widest" style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-color:rgba(212,175,55,0.6)">
            💼 Piazza Investimento
        </button>
    </div>`;

    // ── CREDIT SCORE & LOANS ─────────────────────────────────────
    const loanLimit = creditTier.loanLimit;
    const remainingCredit = Math.max(0, loanLimit - activeLoanTotal);
    const loanAmounts = [100000, 500000, 1000000, 2000000, 5000000].filter(a => a <= loanLimit);
    const creditBarW = Math.round(((creditScore - 300) / 600) * 100);
    let loansHtml = `
    <div class="flex justify-between items-center mb-2">
        <div>
            <div class="text-[9px] text-gray-500 uppercase tracking-widest">Credit Score</div>
            <div class="text-xl font-bold font-mono" style="color:${creditTier.color}">${creditScore}</div>
            <div class="text-[8px] font-bold uppercase" style="color:${creditTier.color}">${creditTier.label}</div>
        </div>
        <div class="text-right">
            <div class="text-[9px] text-gray-500">Limite</div>
            <div class="text-sm font-bold font-mono text-white">€${loanLimit.toLocaleString()}</div>
            <div class="text-[9px] text-green-400">Disponibile: €${remainingCredit.toLocaleString()}</div>
        </div>
    </div>
    <div class="credit-bar-track mb-3"><div class="credit-bar-fill" style="width:${creditBarW}%;background:${creditTier.color}"></div></div>
    <div class="text-[9px] text-gray-500 mb-2">Tasso interesse: <b class="text-white">${(creditTier.rate*100).toFixed(1)}%/mese</b></div>`;

    if (activeLoans.length > 0) {
        loansHtml += `<div class="text-[9px] text-red-400 mb-2 font-bold">Prestiti attivi: €${activeLoanTotal.toLocaleString()}</div>`;
        activeLoans.forEach(l => {
            const canRepay = gameState.cash >= l.amount;
            loansHtml += `<div class="hud-card !py-1.5 mb-1 flex justify-between items-center text-[9px] gap-2">
                <span>Prestito #${l.id}</span>
                <span class="text-red-400 font-mono flex-1 text-right">€${l.amount.toLocaleString()}</span>
                <button onclick="repayLoan(${l.id})" class="btn-gold !text-[7px] !py-0.5 !px-2 shrink-0" ${canRepay ? '' : 'disabled style="opacity:0.4"'}>Salda</button>
            </div>`;
        });
    }

    loansHtml += `<div class="flex flex-wrap gap-1 mt-2">
        ${loanAmounts.map(a => `<button onclick="takeLoan(${a})" class="btn-gold !text-[8px] !py-1 !px-2">+€${(a/1000).toFixed(0)}k</button>`).join('')}
    </div>`;

    // ── PORTFOLIO SUMMARY (header stats) ─────────────────────────
    const totalDiv = gameState.totalDividendsEarned || 0;
    const totalPlStock = gameState.totalStockProfit || 0;

    container.innerHTML = DS.header({
        eyebrow: '$WALL-ST · Finance Hub',
        title:   'Mercati Finanziari',
        subtitle:`P&L oggi: ${plPositive?'+':''}€${Math.round(Math.abs(dailyPL)).toLocaleString()} ${plPositive?'▲':'▼'} ${Math.abs(dailyPct).toFixed(2)}%`,
    }) + DS.kpiStrip([
        { label:'Portfolio Totale',    val:'€'+Math.round(totalPortfolio).toLocaleString(),         color: totalPortfolio > 0 ? 'blue' : '' },
        { label:'P&L Azioni',          val:(totalPlStock>=0?'+':'')+'€'+totalPlStock.toLocaleString(), color: totalPlStock >= 0 ? 'green' : 'red' },
        { label:'Dividendi Totali',    val:'+€'+totalDiv.toLocaleString(),                          color:'green' },
        { label:'Diamond Contracts',   val: gameState.diamondContractsCompleted || 0,               color:'gold' },
    ]) + `
        ${portfolioDashHtml}

        <h3 class="finance-section-header">── MERCATO AZIONARIO ────────────────────</h3>
        <div class="mb-3">${stockHtml}</div>

        <h3 class="finance-section-header">── BROKER PERSONALE ─────────────────────</h3>
        <div class="mb-3">
            ${brokerActiveHtml}
            <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2 mt-3 border-t border-white/5 pt-2">Nuovo Investimento</div>
            ${brokerFormHtml}
        </div>

        <h3 class="finance-section-header">── CREDITO & LEVA ───────────────────────</h3>
        <div class="mb-3 hud-card">${loansHtml}</div>

        ${(() => {
            const cp    = gameState.cempPrice || 10;
            const owned = gameState.cempOwnedShares || 0;
            const hist  = gameState.cempHistory || [];
            const prev  = hist.length >= 2 ? hist[hist.length - 2] : cp;
            const chgPct = ((cp / prev) - 1) * 100;
            const isUp   = chgPct >= 0;
            const portVal = owned > 0 ? Math.round(cp * owned) : 0;

            function _sparkCemp(h) {
                if (!h || h.length < 2) return '';
                const W = 80, H = 24, mn = Math.min(...h), mx = Math.max(...h), rng = mx - mn || 1;
                const pts = h.map((v,i) => `${((i/(h.length-1))*W).toFixed(1)},${(H-((v-mn)/rng)*H).toFixed(1)}`).join(' ');
                return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${isUp?'#22c55e':'#ef4444'}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            }

            return `
            <details class="mb-3" open>
                <summary class="finance-section-title cursor-pointer">📊 $CEMP — La Tua Azienda in Borsa</summary>
                <div class="mt-2 hud-card">
                    <div class="flex justify-between items-center mb-3">
                        <div>
                            <div class="text-xs font-bold text-white">$CEMP <span class="text-[8px] text-gray-500">Chauffeur Empire SpA</span></div>
                            <div class="text-[9px] ${isUp ? 'text-green-400' : 'text-red-400'}">${isUp ? '▲' : '▼'} ${Math.abs(chgPct).toFixed(2)}% oggi</div>
                        </div>
                        <div class="flex items-end gap-3">
                            ${_sparkCemp(hist)}
                            <div class="text-right">
                                <div class="text-lg font-bold font-mono text-white">€${cp.toFixed(2)}</div>
                                <div class="text-[8px] text-gray-500">×${(gameState.cempShares||10000).toLocaleString()} azioni</div>
                            </div>
                        </div>
                    </div>
                    ${owned > 0 ? `
                    <div class="flex justify-between text-[9px] mb-2 bg-white/5 rounded p-2">
                        <span class="text-gray-400">In portafoglio: <span class="text-white font-bold">${owned.toLocaleString()} azioni</span></span>
                        <span class="text-green-400 font-mono font-bold">€${portVal.toLocaleString()}</span>
                    </div>` : ''}
                    <div class="grid grid-cols-2 gap-2">
                        ${[50,100,500,1000].map(qty => {
                            const cost = Math.round(cp * qty);
                            return `<button onclick="buyCempShares(${qty})" class="btn-gold !text-[8px] !py-1">
                                Compra ${qty}<br><span class="opacity-60">€${cost.toLocaleString()}</span></button>`;
                        }).join('')}
                    </div>
                    ${owned > 0 ? `<div class="grid grid-cols-2 gap-2 mt-2">
                        ${[Math.min(50,owned), Math.min(owned, Math.floor(owned/2))].filter((v,i,a)=>a.indexOf(v)===i && v>0).map(qty => {
                            const rev = Math.round(cp * qty);
                            return `<button onclick="sellCempShares(${qty})" class="btn-gold !bg-red-900/30 !text-red-300 !text-[8px] !py-1">
                                Vendi ${qty}<br><span class="opacity-60">+€${rev.toLocaleString()}</span></button>`;
                        }).join('')}
                    </div>` : ''}
                    <div class="text-[8px] text-gray-600 mt-2 italic">Il prezzo $CEMP riflette la tua reputazione, gli incassi settimanali e la dimensione della flotta.</div>
                </div>
            </details>`;
        })()}

        ${(() => {
            const ipo = gameState.companyIPO;
            const rep = gameState.reputation || 0;
            const canList = !ipo?.listed && rep >= 3.5 && (gameState.cash || 0) >= 50000;
            if (!ipo?.listed) {
                return `
                <details class="mb-3">
                    <summary class="finance-section-title cursor-pointer">🏛️ Quotazione in Borsa (IPO)</summary>
                    <div class="mt-2 hud-card">
                        <div class="text-[10px] text-white font-bold mb-1">Quota la tua azienda sul mercato</div>
                        <div class="text-[9px] text-gray-400 mb-3">1.000 azioni emesse · 300 acquistate subito da investitori NPC · Prezzo calcolato sul tuo cash</div>
                        <div class="space-y-1 text-[9px] mb-3">
                            <div class="flex justify-between"><span class="text-gray-500">Costo quotazione:</span> <span class="text-white">€50.000</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Reputazione richiesta:</span> <span class="${rep >= 3.5 ? 'text-green-400' : 'text-red-400'}">⭐ ${rep.toFixed(1)} / 3.5</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Cash richiesto:</span> <span class="${(gameState.cash||0) >= 50000 ? 'text-green-400' : 'text-red-400'}">€${(gameState.cash||0).toLocaleString()} / €50.000</span></div>
                            <div class="flex justify-between"><span class="text-gray-500">Prezzo azione stimato:</span> <span class="text-white font-mono">€${Math.max(10, Math.round((gameState.cash||0)/1000)).toLocaleString()}</span></div>
                        </div>
                        <button onclick="listCompanyIPO()" ${canList ? '' : 'disabled'} class="btn-gold w-full uppercase tracking-widest ${canList ? '' : 'opacity-40 cursor-not-allowed'}" style="font-size:0.8rem;">
                            📈 Quota ${gameState.companyName || 'Chauffeur Empire'} in Borsa
                        </button>
                        ${!canList ? `<div class="text-[8px] text-red-400 mt-1 text-center">${rep < 3.5 ? 'Reputazione insufficiente.' : 'Cash insufficiente.'}</div>` : ''}
                    </div>
                </details>`;
            }
            const priceEst = ipo.sharePrice || 10;
            const totalVal = Math.round(priceEst * ipo.sharesTotal);
            const npcVal   = Math.round(priceEst * ipo.npcSharesOwned);
            return `
            <details class="mb-3" open>
                <summary class="finance-section-title cursor-pointer">🏛️ IPO — ${gameState.companyName || 'Chauffeur Empire'}</summary>
                <div class="mt-2 hud-card !border-green-900/40 bg-green-950/5">
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            <div class="text-xs font-bold text-green-400">✅ Quotata in borsa</div>
                            <div class="text-[8px] text-gray-500">Dal giorno ${ipo.listedDay}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[9px] text-gray-400">Prezzo azione</div>
                            <div class="text-sm font-bold font-mono text-white">€${priceEst.toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="space-y-1 text-[9px] mb-2">
                        <div class="flex justify-between"><span class="text-gray-500">Azioni totali:</span> <span class="text-white">${ipo.sharesTotal.toLocaleString()}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">In mano a NPC:</span> <span class="text-white">${ipo.npcSharesOwned} (valore €${npcVal.toLocaleString()})</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">Capitalizzazione:</span> <span class="text-yellow-400 font-bold font-mono">€${totalVal.toLocaleString()}</span></div>
                        <div class="flex justify-between"><span class="text-gray-500">Dividendi pagati tot.:</span> <span class="text-red-400 font-mono">-€${(ipo.dividendsPaid||0).toLocaleString()}</span></div>
                    </div>
                    <div class="text-[8px] text-gray-600 italic">Ogni giorno il 10% degli utili viene distribuito agli azionisti NPC come dividendo.</div>
                </div>
            </details>`;
        })()}

        ${typeof renderP2PSharesSection === 'function' ? renderP2PSharesSection() : ''}

        <div class="hud-card !border-red-900/40 bg-red-950/5 text-center mt-2">
            <div class="text-[9px] text-red-400/80 uppercase tracking-widest mb-1">Exit Strategy</div>
            <div class="text-[9px] text-gray-500 mb-2">Vendi l'azienda a un fondo e ricomincia con un vantaggio enorme</div>
            <button onclick="sellCompanyNGP()" class="text-[9px] border border-red-800/50 text-red-400/70 px-3 py-1 rounded hover:border-red-600 hover:text-red-300 transition-colors">Avvia Exit Strategy ↗</button>
        </div>`;

    // ── PRICE FLASH ANIMATIONS ────────────────────────────────────
    (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).forEach(t => {
        const prevP = stockPrevPrices[t.id];
        const curP = prices[t.id] || t.basePrice;
        if (prevP !== undefined && prevP !== curP) {
            _flashTicker(t.id, curP > prevP ? 'up' : 'down');
        }
    });
}
window.renderTabFinance = renderTabFinance;
