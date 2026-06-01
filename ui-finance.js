'use strict';
/* ui-finance.js — Chauffeur Empire */

function _flashTicker(id, dir) {
    const el = document.getElementById('ftick-' + id);
    if (!el) return;
    el.classList.remove('price-flash-up', 'price-flash-down');
    void el.offsetWidth;
    el.classList.add(dir === 'up' ? 'price-flash-up' : 'price-flash-down');
}

function renderTabFinance() {
    const container = document.getElementById('tab-container');

    // Inject animation + interactive button CSS once
    if (!document.getElementById('finance-css')) {
        const s = document.createElement('style');
        s.id = 'finance-css';
        s.textContent = `
@keyframes fi-flash-up   { 0%{background:#dff5e8} 100%{background:transparent} }
@keyframes fi-flash-down { 0%{background:#fde8e4} 100%{background:transparent} }
.price-flash-up   { animation: fi-flash-up   .8s ease-out; }
.price-flash-down { animation: fi-flash-down .8s ease-out; }
.fi-risk-btn { background:#fff;border:1px solid #d6dee8;border-radius:6px;padding:8px;cursor:pointer;text-align:left;flex:1;transition:border-color .15s; }
.fi-risk-btn.active { border-color:#c79a2a;background:#fff8e8; }
.fi-dur-btn  { background:#fff;border:1px solid #d6dee8;border-radius:6px;padding:5px 8px;cursor:pointer;color:#6a7480;font-size:10px;flex:1;transition:border-color .15s; }
.fi-dur-btn.active  { border-color:#c79a2a;color:#c79a2a;background:#fff8e8; }
.fi-progress-track { background:#e2e6ec;border-radius:3px;height:4px;overflow:hidden;margin:4px 0; }
.fi-progress-fill  { height:100%;border-radius:3px; }
.fi-credit-track   { background:#e2e6ec;border-radius:3px;height:6px;overflow:hidden;margin:8px 0 12px; }
.fi-credit-fill    { height:100%;border-radius:3px; }`;
        document.head.appendChild(s);
    }

    const hasWM = typeof _hasWealthManager === 'function' && _hasWealthManager();

    if (!hasWM) {
        container.innerHTML = `<div class="em em-page"><div class="em-wrap">
        <div style="padding:0 0 16px">
            <div style="font-size:9px;color:#6a7480;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">$WALL-ST · Finance Hub</div>
            <div style="font-size:20px;font-weight:700;color:#1f2733">Mercati Finanziari</div>
        </div>
        <div style="background:#ffffff;border:1px solid #c79a2a;border-radius:6px;padding:28px;text-align:center">
            <div style="font-size:40px;margin-bottom:14px">💼</div>
            <div style="font-size:14px;font-weight:700;color:#c79a2a;margin-bottom:8px">Finance Hub Bloccato</div>
            <div style="font-size:11px;color:#6a7480;margin-bottom:20px;max-width:340px;margin-left:auto;margin-right:auto">Assumi un <strong style="color:#1f2733">Elite Wealth Manager</strong> nello Staff per sbloccare il mercato azionario, il broker personale e la leva finanziaria avanzata.</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;max-width:300px;margin:0 auto 20px">
                ${[
                    { icon:'📈', text:'Mercato Azionario $WALL-ST (5 ticker live)' },
                    { icon:'💼', text:'Broker Personale — ROI fino al +55%' },
                    { icon:'🏦', text:'Credit Score & Leva Finanziaria' },
                    { icon:'🔶', text:'Sblocco Diamond Contracts' },
                ].map(f => `<div style="display:flex;gap:10px;align-items:center">
                    <span>${f.icon}</span><span style="font-size:11px;color:#6a7480">${f.text}</span>
                </div>`).join('')}
            </div>
            <button onclick="switchTab('staff')" style="background:#fff8e8;border:1px solid #c79a2a;border-radius:4px;padding:7px 18px;color:#c79a2a;font-size:11px;cursor:pointer">Vai allo Staff →</button>
        </div></div></div>`;
        return;
    }

    const prices       = gameState.stockPrices    || {};
    const holdings     = gameState.stockHoldings  || {};
    const creditScore  = gameState.creditScore    || 300;
    const creditTier   = _getCreditTier(creditScore);
    const activeLoans  = (gameState.loans || []).filter(l => l.amount > 0);
    const activeLoanTotal = activeLoans.reduce((s, l) => s + l.amount, 0);

    // Portfolio calculations
    const TICKERS = typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : [];
    const totalStockValue = TICKERS.reduce((sum, t) => {
        const h = holdings[t.id] || { shares: 0 };
        return sum + h.shares * (prices[t.id] || t.basePrice);
    }, 0);
    const brokerActiveAll = (gameState.brokerInvestments || []).filter(b => b.active !== false);
    const totalBrokerValue = brokerActiveAll.reduce((s, b) => s + (b.capital || 0), 0);
    const totalPortfolio   = totalStockValue + totalBrokerValue;
    const yesterday  = gameState.portfolioValueYesterday || totalPortfolio;
    const dailyPL    = totalPortfolio - yesterday;
    const dailyPct   = yesterday > 0 ? (dailyPL / yesterday * 100) : 0;
    const stockPct   = totalPortfolio > 0 ? Math.round((totalStockValue  / totalPortfolio) * 100) : 0;
    const brokerPct  = totalPortfolio > 0 ? Math.round((totalBrokerValue / totalPortfolio) * 100) : 0;
    const plPositive = dailyPL >= 0;
    const plSign     = plPositive ? '+' : '-';
    const plColor    = plPositive ? '#1aa06a' : '#db5746';

    function _kpi(label, val, color) {
        const c = color === 'gold' ? '#c79a2a' : color === 'green' ? '#1aa06a' : color === 'blue' ? '#2f74c0' : color === 'red' ? '#db5746' : '#1f2733';
        return `<div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${label}</div>
            <div style="font-size:15px;font-weight:700;color:${c};font-family:monospace">${val}</div>
        </div>`;
    }

    function _sec(title) {
        return `<div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;border-top:1px solid #d6dee8;padding-top:16px;margin:16px 0 12px">${title}</div>`;
    }

    // Portfolio dashboard
    const portfolioDashHtml = totalPortfolio > 0 ? `
    <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px 16px;margin-bottom:16px">
        <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Portafoglio Totale</div>
        <div style="margin-bottom:10px">
            <span style="font-size:22px;font-weight:700;color:#1f2733;font-family:monospace">€${Math.round(totalPortfolio).toLocaleString()}</span>
            <span style="font-size:10px;color:${plColor};margin-left:8px">${plSign}€${Math.round(Math.abs(dailyPL)).toLocaleString()} oggi ${plPositive?'▲':'▼'} ${Math.abs(dailyPct).toFixed(2)}%</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:9px;color:#6a7480;width:42px">Azioni</span>
            <div style="flex:1;background:#d6dee8;border-radius:2px;height:4px"><div style="width:${stockPct}%;height:100%;background:#2f74c0;border-radius:2px"></div></div>
            <span style="font-size:9px;color:#1f2733;font-family:monospace;width:80px;text-align:right">€${Math.round(totalStockValue).toLocaleString()}</span>
            <span style="font-size:9px;color:#6a7480;width:30px;text-align:right">${stockPct}%</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:9px;color:#6a7480;width:42px">Broker</span>
            <div style="flex:1;background:#d6dee8;border-radius:2px;height:4px"><div style="width:${brokerPct}%;height:100%;background:#c79a2a;border-radius:2px"></div></div>
            <span style="font-size:9px;color:#1f2733;font-family:monospace;width:80px;text-align:right">€${Math.round(totalBrokerValue).toLocaleString()}</span>
            <span style="font-size:9px;color:#6a7480;width:30px;text-align:right">${brokerPct}%</span>
        </div>
    </div>` : '';

    // Stock market
    const stockHistory    = gameState.stockHistory    || {};
    const shortPositions  = gameState.shortPositions  || {};
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
        return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    let stockHtml = `<table style="width:100%;border-collapse:collapse">`;
    TICKERS.forEach(t => {
        const price    = prices[t.id] || t.basePrice;
        const holding  = holdings[t.id] || { shares: 0, avgCost: 0 };
        const shortPos = shortPositions[t.id];
        const prevPrice = stockPrevPrices[t.id];
        const pricePct  = prevPrice ? ((price / prevPrice) - 1) * 100 : ((price / t.basePrice) - 1) * 100;
        const isUp   = pricePct >= 0;
        const isFlat = Math.abs(pricePct) < 0.01;
        const changeArrow = isFlat ? '─' : (isUp ? '▲' : '▼');
        const changeColor = isFlat ? '#6a7480' : (isUp ? '#1aa06a' : '#db5746');
        const plAmt  = holding.shares > 0 ? Math.round((price - holding.avgCost) * holding.shares) : 0;
        const plPct  = holding.avgCost > 0 ? ((price / holding.avgCost) - 1) * 100 : 0;
        const spark  = _buildSparkline(stockHistory[t.id], t.color);
        const shortPl = shortPos ? Math.round((shortPos.openPrice - price) * shortPos.shares) : 0;
        stockHtml += `
        <tr id="ftick-${t.id}" style="border-bottom:1px solid #d6dee8">
            <td style="padding:8px 6px;width:24px;font-size:16px">${t.icon}</td>
            <td style="padding:8px 0;min-width:90px">
                <div style="font-size:11px;font-weight:700;color:#1f2733">${t.name}</div>
                <div style="font-size:8px;color:#6a7480;font-family:monospace">${t.fullName}</div>
            </td>
            <td style="padding:8px 6px;vertical-align:middle">${spark}</td>
            <td style="padding:8px 6px;text-align:right;vertical-align:middle">
                <div style="font-size:12px;font-weight:700;color:#1f2733;font-family:monospace">€${price.toFixed(2)}</div>
                <div style="font-size:9px;color:${changeColor};font-family:monospace">${changeArrow} ${Math.abs(pricePct).toFixed(1)}%</div>
            </td>
            <td style="padding:8px 6px">
                ${holding.shares > 0 ? `
                <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:3px">
                    <span style="color:#6a7480">Long: <b style="color:#1f2733">${holding.shares}</b></span>
                    <span style="color:${plAmt >= 0 ? '#1aa06a' : '#db5746'};font-weight:700">${plAmt >= 0 ? '+' : ''}€${plAmt.toLocaleString()} (${plPct.toFixed(1)}%)</span>
                </div>` : ''}
                ${shortPos ? `
                <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:3px">
                    <span style="color:#7c5fc9">Short: <b style="color:#1f2733">${shortPos.shares}</b> @ €${shortPos.openPrice}</span>
                    <span style="color:${shortPl >= 0 ? '#1aa06a' : '#db5746'};font-weight:700">${shortPl >= 0 ? '+' : ''}€${shortPl.toLocaleString()}</span>
                </div>` : ''}
                <div style="display:flex;gap:4px;margin-top:3px">
                    <input id="stock-qty-${t.id}" type="number" min="1" value="10" style="width:50px;background:#f3f6f9;border:1px solid #d6dee8;border-radius:3px;padding:3px 5px;color:#1f2733;font-size:9px;font-family:monospace">
                    <button onclick="buyStocks('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" style="background:#fff8e8;border:1px solid #c79a2a;border-radius:3px;padding:3px 7px;color:#c79a2a;font-size:9px;cursor:pointer">Compra</button>
                    ${holding.shares > 0 ? `<button onclick="sellStocks('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" style="background:#f3f6f9;border:1px solid #cfe0f1;border-radius:3px;padding:3px 7px;color:#2f74c0;font-size:9px;cursor:pointer">Vendi</button>` : ''}
                    <button onclick="shortSell('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" style="background:#ffffff;border:1px solid #f0c4bd;border-radius:3px;padding:3px 7px;color:#db5746;font-size:9px;cursor:pointer">Short↓</button>
                    ${shortPos ? `<button onclick="coverShort('${t.id}', parseInt(document.getElementById('stock-qty-${t.id}').value)||1)" style="background:#f3f6f9;border:1px solid #d9c9f0;border-radius:3px;padding:3px 7px;color:#7c5fc9;font-size:9px;cursor:pointer">Copri</button>` : ''}
                </div>
            </td>
        </tr>`;
    });
    stockHtml += `</table>`;

    // Broker investments
    const brokerActive  = (gameState.brokerInvestments || []).filter(i => !i.resolved);
    const currentHour   = gameState.day * 24 + gameState.hour;
    const PROFILES      = typeof BROKER_RISK_PROFILES !== 'undefined' ? BROKER_RISK_PROFILES : [];

    let brokerActiveHtml = brokerActive.length === 0
        ? `<div style="font-size:10px;color:#98a1ae;font-style:italic;margin-bottom:12px">Nessun investimento attivo.</div>`
        : '';
    brokerActive.forEach(inv => {
        const profile  = PROFILES.find(p => p.id === inv.risk);
        const hoursLeft = Math.max(0, inv.endsHour - currentHour);
        const progress  = Math.min(100, ((currentHour - inv.startHour) / (inv.endsHour - inv.startHour)) * 100);
        brokerActiveHtml += `
        <div style="background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:6px">
                <span style="font-weight:700;color:${profile?.color||'#1f2733'}">${profile?.icon||''} ${inv.riskName}</span>
                <span style="color:#6a7480">⏱ ${hoursLeft}h rimaste</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:6px">
                <span style="color:#6a7480">Capitale: <b style="color:#1f2733">€${inv.capital.toLocaleString()}</b></span>
                <span style="color:#6a7480">Rendimento: <b style="color:${profile?.color||'#1f2733'}">${Math.round(inv.maxReturn*100)}% max</b></span>
            </div>
            <div class="fi-progress-track"><div class="fi-progress-fill" style="width:${progress.toFixed(0)}%;background:${profile?.color||'#1f2733'}"></div></div>
        </div>`;
    });

    const brokerFormHtml = `
    <div style="margin-bottom:12px">
        <label style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:4px">Capitale da investire (€)</label>
        <input id="broker-capital" type="number" min="1000" step="1000" value="10000" style="width:100%;background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:6px 8px;color:#1f2733;font-size:11px;font-family:monospace;box-sizing:border-box">
    </div>
    <div style="margin-bottom:12px">
        <label style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:6px">Profilo di Rischio</label>
        <div style="display:flex;gap:6px">
            ${PROFILES.map(p => `
            <button onclick="document.querySelectorAll('.fi-risk-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');window._brokerRisk='${p.id}';"
                class="fi-risk-btn" data-risk="${p.id}">
                <div style="font-size:14px;margin-bottom:2px">${p.icon}</div>
                <div style="font-size:9px;font-weight:700;color:${p.color}">${p.name}</div>
                <div style="font-size:7px;color:#6a7480;margin-top:2px">max ${Math.round(p.maxReturn*100)}%</div>
            </button>`).join('')}
        </div>
    </div>
    <div style="margin-bottom:12px">
        <label style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:6px">Durata</label>
        <div style="display:flex;gap:6px">
            <button onclick="window._brokerDur=1;  document.querySelectorAll('.fi-dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="fi-dur-btn">1h</button>
            <button onclick="window._brokerDur=6;  document.querySelectorAll('.fi-dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="fi-dur-btn">6h</button>
            <button onclick="window._brokerDur=24; document.querySelectorAll('.fi-dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')" class="fi-dur-btn">24h</button>
        </div>
    </div>
    <button onclick="placeBrokerInvestment(document.getElementById('broker-capital').value, window._brokerRisk||'low', window._brokerDur||6)"
        style="width:100%;background:#fff8e8;border:1px solid #c79a2a;border-radius:4px;padding:8px;color:#c79a2a;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">
        💼 Piazza Investimento
    </button>`;

    // Credit & loans
    const loanLimit       = creditTier.loanLimit;
    const remainingCredit = Math.max(0, loanLimit - activeLoanTotal);
    const loanAmounts     = [100000, 500000, 1000000, 2000000, 5000000].filter(a => a <= loanLimit);
    const creditBarW      = Math.round(((creditScore - 300) / 600) * 100);

    let loansHtml = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em">Credit Score</div>
            <div style="font-size:22px;font-weight:700;font-family:monospace;color:${creditTier.color}">${creditScore}</div>
            <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:${creditTier.color}">${creditTier.label}</div>
        </div>
        <div style="text-align:right">
            <div style="font-size:9px;color:#6a7480">Limite</div>
            <div style="font-size:13px;font-weight:700;font-family:monospace;color:#1f2733">€${loanLimit.toLocaleString()}</div>
            <div style="font-size:9px;color:#1aa06a">Disponibile: €${remainingCredit.toLocaleString()}</div>
        </div>
    </div>
    <div class="fi-credit-track"><div class="fi-credit-fill" style="width:${creditBarW}%;background:${creditTier.color}"></div></div>
    <div style="font-size:9px;color:#6a7480;margin-bottom:10px">Tasso interesse: <b style="color:#1f2733">${(creditTier.rate*100).toFixed(1)}%/mese</b></div>`;

    if (activeLoans.length > 0) {
        loansHtml += `<div style="font-size:9px;color:#db5746;font-weight:700;margin-bottom:8px">Prestiti attivi: €${activeLoanTotal.toLocaleString()}</div>`;
        activeLoans.forEach(l => {
            const canRepay = gameState.cash >= l.amount;
            loansHtml += `<div style="background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:6px 10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px">
                <span style="font-size:9px;color:#6a7480">Prestito #${l.id}</span>
                <span style="font-size:9px;color:#db5746;font-family:monospace;flex:1;text-align:right">€${l.amount.toLocaleString()}</span>
                <button onclick="repayLoan(${l.id})" ${canRepay ? '' : 'disabled'}
                    style="background:#fff8e8;border:1px solid #c79a2a;border-radius:3px;padding:3px 8px;color:#c79a2a;font-size:8px;cursor:${canRepay?'pointer':'default'};flex-shrink:0;opacity:${canRepay?1:0.4}">Salda</button>
            </div>`;
        });
    }

    loansHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
        ${loanAmounts.map(a => `<button onclick="takeLoan(${a})" style="background:#fff8e8;border:1px solid #c79a2a;border-radius:3px;padding:4px 10px;color:#c79a2a;font-size:9px;cursor:pointer">+€${(a/1000).toFixed(0)}k</button>`).join('')}
    </div>`;

    // $CEMP section
    const cempHtml = (() => {
        const cp     = gameState.cempPrice || 10;
        const owned  = gameState.cempOwnedShares || 0;
        const hist   = gameState.cempHistory || [];
        const prev   = hist.length >= 2 ? hist[hist.length - 2] : cp;
        const chgPct = ((cp / prev) - 1) * 100;
        const cUp    = chgPct >= 0;
        const portVal = owned > 0 ? Math.round(cp * owned) : 0;

        function _sparkCemp(h) {
            if (!h || h.length < 2) return '';
            const W = 80, H = 24, mn = Math.min(...h), mx = Math.max(...h), rng = mx - mn || 1;
            const pts = h.map((v,i) => `${((i/(h.length-1))*W).toFixed(1)},${(H-((v-mn)/rng)*H).toFixed(1)}`).join(' ');
            return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${cUp?'#1aa06a':'#db5746'}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
        }

        return `<div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px 16px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div>
                    <div style="font-size:12px;font-weight:700;color:#1f2733">$CEMP <span style="font-size:8px;color:#6a7480">Chauffeur Empire SpA</span></div>
                    <div style="font-size:9px;color:${cUp?'#1aa06a':'#db5746'}">${cUp?'▲':'▼'} ${Math.abs(chgPct).toFixed(2)}% oggi</div>
                </div>
                <div style="display:flex;align-items:flex-end;gap:12px">
                    ${_sparkCemp(hist)}
                    <div style="text-align:right">
                        <div style="font-size:18px;font-weight:700;font-family:monospace;color:#1f2733">€${cp.toFixed(2)}</div>
                        <div style="font-size:8px;color:#6a7480">×${(gameState.cempShares||10000).toLocaleString()} azioni</div>
                    </div>
                </div>
            </div>
            ${owned > 0 ? `<div style="display:flex;justify-content:space-between;font-size:9px;background:#f3f6f9;border-radius:4px;padding:6px 8px;margin-bottom:10px">
                <span style="color:#6a7480">In portafoglio: <span style="color:#1f2733;font-weight:700">${owned.toLocaleString()} azioni</span></span>
                <span style="color:#1aa06a;font-family:monospace;font-weight:700">€${portVal.toLocaleString()}</span>
            </div>` : ''}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px">
                ${[50,100,500,1000].map(qty => {
                    const cost = Math.round(cp * qty);
                    return `<button onclick="buyCempShares(${qty})" style="background:#fff8e8;border:1px solid #c79a2a;border-radius:4px;padding:6px 4px;color:#c79a2a;font-size:9px;cursor:pointer;text-align:center;line-height:1.6">
                        Compra ${qty}<br><span style="font-size:8px;opacity:.6">€${cost.toLocaleString()}</span></button>`;
                }).join('')}
            </div>
            ${owned > 0 ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
                ${[Math.min(50,owned), Math.min(owned, Math.floor(owned/2))].filter((v,i,a)=>a.indexOf(v)===i && v>0).map(qty => {
                    const rev = Math.round(cp * qty);
                    return `<button onclick="sellCempShares(${qty})" style="background:#ffffff;border:1px solid #f0c4bd;border-radius:4px;padding:6px 4px;color:#db5746;font-size:9px;cursor:pointer;text-align:center;line-height:1.6">
                        Vendi ${qty}<br><span style="font-size:8px;opacity:.6">+€${rev.toLocaleString()}</span></button>`;
                }).join('')}
            </div>` : ''}
            <div style="font-size:8px;color:#98a1ae;margin-top:8px;font-style:italic">Il prezzo $CEMP riflette la tua reputazione, gli incassi settimanali e la dimensione della flotta.</div>
        </div>`;
    })();

    // IPO section
    const ipoHtml = (() => {
        const ipo = gameState.companyIPO;
        const rep = gameState.reputation || 0;
        const canList = !ipo?.listed && rep >= 3.5 && (gameState.cash || 0) >= 50000;
        if (!ipo?.listed) {
            return `<div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px 16px;margin-bottom:12px">
                <div style="font-size:11px;font-weight:700;color:#1f2733;margin-bottom:4px">Quotazione in Borsa (IPO)</div>
                <div style="font-size:9px;color:#6a7480;margin-bottom:12px">1.000 azioni emesse · 300 acquistate subito da investitori NPC · Prezzo calcolato sul tuo cash</div>
                <div style="margin-bottom:12px">
                    ${[
                        ['Costo quotazione:',       '€50.000',                                                         true],
                        ['Reputazione richiesta:',  `⭐ ${rep.toFixed(1)} / 3.5`,                                     rep >= 3.5],
                        ['Cash richiesto:',         `€${(gameState.cash||0).toLocaleString()} / €50.000`,             (gameState.cash||0) >= 50000],
                        ['Prezzo azione stimato:',  `€${Math.max(10, Math.round((gameState.cash||0)/1000)).toLocaleString()}`, true],
                    ].map(([label, val, ok]) => `<div style="display:flex;justify-content:space-between;font-size:9px;padding:3px 0">
                        <span style="color:#6a7480">${label}</span>
                        <span style="color:${ok?'#1f2733':'#db5746'}">${val}</span>
                    </div>`).join('')}
                </div>
                <button onclick="listCompanyIPO()" ${canList ? '' : 'disabled'}
                    style="width:100%;background:${canList?'#fff8e8':'#f3f6f9'};border:1px solid ${canList?'#c79a2a':'#d6dee8'};border-radius:4px;padding:7px;color:${canList?'#c79a2a':'#98a1ae'};font-size:10px;cursor:${canList?'pointer':'not-allowed'};text-transform:uppercase;letter-spacing:.08em">
                    📈 Quota ${gameState.companyName || 'Chauffeur Empire'} in Borsa
                </button>
                ${!canList ? `<div style="font-size:8px;color:#db5746;margin-top:4px;text-align:center">${rep < 3.5 ? 'Reputazione insufficiente.' : 'Cash insufficiente.'}</div>` : ''}
            </div>`;
        }
        const priceEst = ipo.sharePrice || 10;
        const totalVal = Math.round(priceEst * ipo.sharesTotal);
        const npcVal   = Math.round(priceEst * ipo.npcSharesOwned);
        return `<div style="background:#ffffff;border:1px solid #bfe6cd;border-radius:6px;padding:14px 16px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div>
                    <div style="font-size:11px;font-weight:700;color:#1aa06a">✅ Quotata in borsa</div>
                    <div style="font-size:8px;color:#6a7480">Dal giorno ${ipo.listedDay}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:9px;color:#6a7480">Prezzo azione</div>
                    <div style="font-size:13px;font-weight:700;font-family:monospace;color:#1f2733">€${priceEst.toLocaleString()}</div>
                </div>
            </div>
            ${[
                ['Azioni totali:',          ipo.sharesTotal.toLocaleString(),                               '#1f2733', false],
                ['In mano a NPC:',          `${ipo.npcSharesOwned} (valore €${npcVal.toLocaleString()})`,  '#1f2733', false],
                ['Capitalizzazione:',       `€${totalVal.toLocaleString()}`,                                '#c79a2a', true],
                ['Dividendi pagati tot.:',  `-€${(ipo.dividendsPaid||0).toLocaleString()}`,                '#db5746', true],
            ].map(([l,v,c,bold]) => `<div style="display:flex;justify-content:space-between;font-size:9px;padding:3px 0">
                <span style="color:#6a7480">${l}</span>
                <span style="color:${c};font-weight:${bold?700:400};font-family:monospace">${v}</span>
            </div>`).join('')}
            <div style="font-size:8px;color:#98a1ae;margin-top:8px;font-style:italic">Ogni giorno il 10% degli utili viene distribuito agli azionisti NPC come dividendo.</div>
        </div>`;
    })();

    const totalDiv     = gameState.totalDividendsEarned || 0;
    const totalPlStock = gameState.totalStockProfit     || 0;

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 0 16px">
        <div>
            <div style="font-size:9px;color:#6a7480;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">$WALL-ST · Finance Hub</div>
            <div style="font-size:20px;font-weight:700;color:#1f2733;margin-bottom:2px">Mercati Finanziari</div>
            <div style="font-size:11px;color:${plColor}">P&L oggi: ${plPositive?'+':''}€${Math.round(Math.abs(dailyPL)).toLocaleString()} ${plPositive?'▲':'▼'} ${Math.abs(dailyPct).toFixed(2)}%</div>
        </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        ${_kpi('Portfolio Totale',  '€'+Math.round(totalPortfolio).toLocaleString(),              totalPortfolio > 0 ? 'blue' : '')}
        ${_kpi('P&L Azioni',        (totalPlStock>=0?'+':'')+'€'+totalPlStock.toLocaleString(),   totalPlStock >= 0 ? 'green' : 'red')}
        ${_kpi('Dividendi Totali',  '+€'+totalDiv.toLocaleString(),                               'green')}
        ${_kpi('Diamond Contracts', gameState.diamondContractsCompleted || 0,                     'gold')}
    </div>

    ${portfolioDashHtml}

    ${_sec('Mercato Azionario')}
    <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;overflow:hidden;margin-bottom:16px">${stockHtml}</div>

    ${_sec('Broker Personale')}
    <div style="margin-bottom:16px">
        ${brokerActiveHtml}
        ${brokerActive.length > 0 ? `<div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #d6dee8;padding-top:10px;margin:12px 0 8px">Nuovo Investimento</div>` : ''}
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px 16px">${brokerFormHtml}</div>
    </div>

    ${_sec('Credito & Leva')}
    <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px 16px;margin-bottom:16px">${loansHtml}</div>

    ${_sec('$CEMP — La Tua Azienda in Borsa')}
    ${cempHtml}

    ${_sec('Quotazione in Borsa')}
    ${ipoHtml}

    ${typeof renderP2PSharesSection === 'function' ? renderP2PSharesSection() : ''}

    <div style="background:#ffffff;border:1px solid #f0c4bd;border-radius:6px;padding:16px;text-align:center;margin-top:12px">
        <div style="font-size:9px;color:#db5746;opacity:.7;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Exit Strategy</div>
        <div style="font-size:9px;color:#6a7480;margin-bottom:10px">Vendi l'azienda a un fondo e ricomincia con un vantaggio enorme</div>
        <button onclick="sellCompanyNGP()" style="font-size:9px;border:1px solid #f0c4bd;color:#db5746;opacity:.7;background:none;border-radius:3px;padding:4px 12px;cursor:pointer">Avvia Exit Strategy ↗</button>
    </div></div></div>`;

    // Price flash animations
    TICKERS.forEach(t => {
        const prevP = stockPrevPrices[t.id];
        const curP  = prices[t.id] || t.basePrice;
        if (prevP !== undefined && prevP !== curP) {
            _flashTicker(t.id, curP > prevP ? 'up' : 'down');
        }
    });
}
window.renderTabFinance = renderTabFinance;
