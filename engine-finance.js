'use strict';
/* ================================================================
   engine-finance.js — Chauffeur Empire
   Stock market, broker investments, credit score, macroeconomy.
   Loaded AFTER engine.js (needs: gameState, showNotification,
   logToMap, hasInvestment, STOCK_TICKERS, STOCK_SECTORS, LOAN_TIERS)
   ================================================================ */

// ══════════════════════════════════════════════════════════════
// HOLDING FINANZIARIA — MOTORE AZIONARIO E BROKER
// ══════════════════════════════════════════════════════════════

function _hasWealthManager() {
    return gameState.staff.some(s => s.id === 'ewm');
}
window._hasWealthManager = _hasWealthManager;

// Inizializza i prezzi azionari se assenti
function _initStockPrices() {
    if (typeof STOCK_TICKERS === 'undefined') return;
    STOCK_TICKERS.forEach(t => {
        if (gameState.stockPrices[t.id] === undefined) {
            // Small random variance at start
            gameState.stockPrices[t.id] = +(t.basePrice * (0.95 + Math.random() * 0.10)).toFixed(2);
        }
        if (!gameState.stockHoldings[t.id]) {
            gameState.stockHoldings[t.id] = { shares: 0, avgCost: 0 };
        }
    });
}

// Fluttuazione prezzi ogni game-hour
function _tickStockMarket() {
    if (typeof STOCK_TICKERS === 'undefined') return;
    const lastNews = window._lastNewsForStocks || '';
    STOCK_TICKERS.forEach(t => {
        const prev = gameState.stockPrices[t.id] || t.basePrice;
        // Base random walk
        let pct = (Math.random() - 0.48) * t.volatility;
        // News sentiment boost: se l'ultima news contiene una keyword del ticker
        const matched = t.newsKeywords.some(k => lastNews.toLowerCase().includes(k));
        if (matched) pct += (Math.random() > 0.4 ? 1 : -1) * t.volatility * 0.6;
        // Wall Street ufficio: +15% sui rendimenti azionari
        const wsBonus = (gameState.lifestyleAssets || []).includes('ufficio_wall_street') ? 0.15 : 0;
        if (pct > 0) pct *= (1 + wsBonus);
        // Floor: no crash below 20% of base
        const newPrice = Math.max(t.basePrice * 0.20, +(prev * (1 + pct)).toFixed(2));
        gameState.stockPrices[t.id] = newPrice;
    });
    _tickStockHistory();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
}

// Dividendi ogni game-hour
function _payStockDividends() {
    if (typeof STOCK_TICKERS === 'undefined' || !_hasWealthManager()) return;
    let totalDiv = 0;
    STOCK_TICKERS.forEach(t => {
        const holding = gameState.stockHoldings[t.id];
        if (!holding || holding.shares <= 0 || t.dividendPct <= 0) return;
        const price = gameState.stockPrices[t.id] || t.basePrice;
        const div = Math.floor(holding.shares * price * t.dividendPct / 24); // hourly rate from annual
        if (div > 0) {
            totalDiv += div;
            gameState.totalDividendsEarned = (gameState.totalDividendsEarned || 0) + div;
        }
    });
    if (totalDiv > 0) {
        gameState.cash += totalDiv;
        if (Math.random() < 0.1) logToMap(`💰 Dividendi azionari: +€${totalDiv}`);
    }
}

// Tick investimenti broker ogni game-hour
function _tickBrokerInvestments() {
    if (!gameState.brokerInvestments || !_hasWealthManager()) return;
    const currentHour = gameState.day * 24 + gameState.hour;
    gameState.brokerInvestments.forEach(inv => {
        if (inv.resolved) return;
        if (currentHour < inv.endsHour) return;
        // Calcola rendimento effettivo (distribuzione skewed verso positivo per Conservativo)
        const rand = Math.random();
        let actualReturnPct;
        if (inv.risk === 'low') {
            actualReturnPct = inv.minReturn + rand * (inv.maxReturn - inv.minReturn);
            // Conservative: bias toward positive
            if (actualReturnPct < 0) actualReturnPct *= 0.3;
        } else if (inv.risk === 'medium') {
            actualReturnPct = inv.minReturn + rand * (inv.maxReturn - inv.minReturn);
        } else {
            // High risk: bimodal — either boom or bust
            actualReturnPct = Math.random() < 0.45
                ? inv.minReturn * (0.5 + Math.random() * 0.5)
                : inv.maxReturn * (0.3 + Math.random() * 0.7);
        }
        // Wall Street ufficio: +15% sui rendimenti positivi
        if (actualReturnPct > 0 && (gameState.lifestyleAssets || []).includes('ufficio_wall_street')) {
            actualReturnPct *= 1.15;
        }
        const gain = Math.round(inv.capital * actualReturnPct);
        const payout = inv.capital + gain;
        inv.resolved = true;
        inv.actualGain = gain;
        gameState.cash += payout;
        const isProfit = gain >= 0;
        const label = isProfit ? `+€${gain.toLocaleString()}` : `−€${Math.abs(gain).toLocaleString()}`;
        const icon = isProfit ? '📈' : '📉';
        logToMap(`${icon} Broker: investimento ${inv.riskName} chiuso — ${label} (capitale: €${inv.capital.toLocaleString()})`);
        showBigEvent(icon,
            isProfit ? `Investimento Profittevole!` : `Investimento in Perdita`,
            `Il tuo portafoglio "${inv.riskName}" da €${inv.capital.toLocaleString()} ha chiuso con ${label}.\n${isProfit ? 'Il Wealth Manager ha fatto un ottimo lavoro.' : 'Il mercato è stato impietoso. Rivedi la strategia di rischio.'}`
        );
        // Notifica nel tab Finance
        const _brokerEmail = {
            id: gameState.nextId++,
            sender: 'Elite Wealth Manager',
            subject: `${icon} Broker Report: ${label}`,
            type: 'broker_result',
            brokerGain: gain, brokerCapital: inv.capital, brokerRisk: inv.riskName,
            status: 'unread',
            expiresAt: (gameState.day * 24 + gameState.hour) + 48
        };
        _applyEmailTemplate(_brokerEmail, 'broker_result', { amount: Math.abs(gain) });
        // Preserve game-logic fields that template must not overwrite
        _brokerEmail.brokerGain = gain;
        _brokerEmail.brokerCapital = inv.capital;
        _brokerEmail.brokerRisk = inv.riskName;
        gameState.emails.push(_brokerEmail);
        if (typeof renderTabEmails === 'function') renderTabEmails();
        if (typeof updateUI === 'function') updateUI();
    });
    // Remove old resolved investments (keep last 5)
    const resolved = gameState.brokerInvestments.filter(i => i.resolved);
    if (resolved.length > 5) gameState.brokerInvestments = gameState.brokerInvestments.filter(i => !i.resolved || resolved.indexOf(i) >= resolved.length - 5);
}

// Credit score dinamico basato su reputazione, prestiti, assets
function _updateCreditScore() {
    let score = 300;
    score += Math.min(300, gameState.reputation * 60);  // max 300 from rep (5★ = 300)
    score += Math.min(150, Math.floor(gameState.cash / 10000)); // max 150 from cash
    const activeLoans = (gameState.loans || []).filter(l => l.amount > 0);
    score -= activeLoans.length * 30; // -30 per active loan
    if (activeLoans.some(l => l.amount > l.original * 0.8)) score -= 50; // high utilization
    score += (gameState.lifestyleAssets || []).length * 20; // assets as collateral
    score += (gameState.achievements || []).length * 5;
    score = Math.max(300, Math.min(900, Math.round(score)));
    gameState.creditScore = score;
}

function _getCreditTier(score) {
    if (score >= 800) return { label:'PLATINUM', color:'#d4af37', loanLimit:5000000,  rate:0.03 };
    if (score >= 700) return { label:'GOLD',     color:'#fbbf24', loanLimit:2000000,  rate:0.045 };
    if (score >= 600) return { label:'SILVER',   color:'#9ca3af', loanLimit:1000000,  rate:0.06 };
    if (score >= 500) return { label:'BRONZE',   color:'#b45309', loanLimit:500000,   rate:0.08 };
    return                    { label:'BASIC',   color:'#6b7280', loanLimit:100000,   rate:0.12 };
}
window._getCreditTier = _getCreditTier;

// ── MACRO-ECONOMIA ───────────────────────────────────────────────
function _tickMacroEconomy() {
    // Inflation: random walk ±0.001, bounded [0.005, 0.08]
    const inflDelta = (Math.random() - 0.50) * 0.001;
    gameState.inflationRate = Math.max(0.005, Math.min(0.08, +(gameState.inflationRate + inflDelta).toFixed(4)));

    // BCE rate: mean-reverts toward 0.04, small shock every 7 days
    const rateDelta = (Math.random() - 0.50) * 0.0005;
    const revert = (0.04 - gameState.interestRateBase) * 0.02;
    gameState.interestRateBase = Math.max(0.005, Math.min(0.12, +(gameState.interestRateBase + rateDelta + revert).toFixed(4)));

    // Big shock every 30 days
    if (gameState.day % 30 === 0) {
        const shock = (Math.random() - 0.50) * 0.008;
        gameState.inflationRate    = Math.max(0.005, Math.min(0.08, +(gameState.inflationRate + shock).toFixed(4)));
        gameState.interestRateBase = Math.max(0.005, Math.min(0.12, +(gameState.interestRateBase + shock * 0.5).toFixed(4)));
        if (Math.abs(shock) > 0.003) {
            const dir = shock > 0 ? 'aumento' : 'riduzione';
            logToMap(`📊 BCE: ${dir} tassi → ${(gameState.interestRateBase*100).toFixed(2)}% | Inflazione: ${(gameState.inflationRate*100).toFixed(1)}%`);
        }
    }

    // Update credit score daily
    _updateCreditScore();

    // Update Finance UI if visible
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
    if (typeof renderTabPolitics === 'function' && _tabIs('politics')) renderTabPolitics();
}

// ── STOCK HISTORY (sparkline) ────────────────────────────────────
function _tickStockHistory() {
    if (typeof STOCK_TICKERS === 'undefined') return;
    if (!gameState.stockHistory) gameState.stockHistory = {};
    STOCK_TICKERS.forEach(t => {
        if (!gameState.stockHistory[t.id]) gameState.stockHistory[t.id] = [];
        const price = gameState.stockPrices[t.id] || t.basePrice;
        gameState.stockHistory[t.id].push(+price.toFixed(2));
        if (gameState.stockHistory[t.id].length > 24) gameState.stockHistory[t.id].shift();
    });
}
