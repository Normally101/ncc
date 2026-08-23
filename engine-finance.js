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
        const holding = (gameState.stockHoldings || {})[t.id];
        if (!holding || holding.shares <= 0 || t.dividendPct <= 0) return;
        const price = (gameState.stockPrices || {})[t.id] || t.basePrice;
        const div = Math.floor(holding.shares * price * t.dividendPct / 24); // hourly rate from annual
        if (div > 0) {
            totalDiv += div;
            gameState.totalDividendsEarned = (gameState.totalDividendsEarned || 0) + div;
        }
    });
    if (totalDiv > 0) {
        window.CE_money.earn(totalDiv, 'stock_dividends');
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
        window.CE_money.earn(payout, 'broker_payout');
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

// ══════════════════════════════════════════════════════════════
// AZIONI FINANZIARIE PLAYER
// ══════════════════════════════════════════════════════════════

// ── PRESTITI ─────────────────────────────────────────────────────
window.repayLoan = function(loanId) {
    const loan = (gameState.loans || []).find(l => l.id === loanId);
    if (!loan) return;
    if (!window.CE_money.spend(loan.amount, 'repay_loan')) return;
    gameState.loans = gameState.loans.filter(l => l.id !== loanId);
    gameState.creditScore = Math.min(900, (gameState.creditScore || 300) + 20);
    logToMap(`✅ Prestito #${loanId} saldato — €${loan.amount.toLocaleString()} rimborsati. Credit Score +20`);
    showNotification(`✅ Prestito saldato! +20 Credit Score`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

window.takeLoan = function(amount) {
    amount = Math.round(Number(amount));
    if (!amount || amount <= 0) return;
    if (!gameState.loans) gameState.loans = [];
    const creditTier = _getCreditTier(gameState.creditScore || 300);
    const activeLoanTotal = gameState.loans.reduce((s, l) => s + l.amount, 0);
    if (activeLoanTotal >= creditTier.loanLimit) {
        if (typeof showNotification === 'function') showNotification(`Limite massimo di credito raggiunto (€${creditTier.loanLimit.toLocaleString()})!`, 'error');
        return;
    }
    if (amount > creditTier.loanLimit) {
        if (typeof showNotification === 'function') showNotification(`Credit Score troppo basso per questo importo. Score attuale: ${gameState.creditScore} (${creditTier.label})`, 'error');
        return;
    }
    // FIX (stabilizzazione 10 agosto): mancava il controllo sulla SOMMA — due prestiti
    // ciascuno sotto il fido singolarmente potevano superare il fido complessivo
    // (es. fido 100k: 90k + 50k = 140k, entrambi i check sopra passavano).
    if (activeLoanTotal + amount > creditTier.loanLimit) {
        if (typeof showNotification === 'function') showNotification(`Fido insufficiente: hai già €${activeLoanTotal.toLocaleString()} di prestiti attivi su un fido di €${creditTier.loanLimit.toLocaleString()}.`, 'error');
        return;
    }
    const rate = creditTier.rate;
    window.CE_money.earn(amount, 'take_loan');
    gameState.loans.push({ id: gameState.nextId++, original: amount, amount: amount, remaining: amount, rate });
    logToMap(`🏦 Prestito €${amount.toLocaleString()} — tasso ${(rate*100).toFixed(1)}%/mese (Score: ${gameState.creditScore} ${creditTier.label})`);
    if (typeof showNotification === 'function') showNotification(`💰 Prestito €${amount.toLocaleString()} approvato!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

// ── AZIONI: COMPRA / VENDI ───────────────────────────────────────
window.buyStocks = function(tickerId, shares) {
    if (!_hasWealthManager()) { showNotification('Assumi un Elite Wealth Manager prima!', 'error'); return; }
    const ticker = (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).find(t => t.id === tickerId);
    if (!ticker) return;
    shares = Math.round(Number(shares));
    if (!shares || shares <= 0) { showNotification('Quantità non valida.', 'error'); return; }
    const price = (gameState.stockPrices || {})[tickerId] || ticker.basePrice;
    const totalCost = Math.round(price * shares);
    if (totalCost <= 0) { showNotification('Quantità non valida.', 'error'); return; }
    if (!window.CE_money.spend(totalCost, 'buy_stocks')) return;
    if (!gameState.stockHoldings) gameState.stockHoldings = {};
    if (!gameState.stockHoldings[tickerId]) gameState.stockHoldings[tickerId] = { shares: 0, avgCost: 0 };
    const holding = gameState.stockHoldings[tickerId];
    const prevTotal = holding.shares * holding.avgCost;
    holding.avgCost = +((prevTotal + totalCost) / (holding.shares + shares)).toFixed(2);
    holding.shares += shares;
    logToMap(`📊 Comprato ${shares} quote ${ticker.name} @ €${price.toFixed(2)} — Totale: €${totalCost.toLocaleString()}`);
    showNotification(`${shares}x ${ticker.name} acquistate!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

window.sellStocks = function(tickerId, shares) {
    if (!_hasWealthManager()) return;
    const ticker = (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).find(t => t.id === tickerId);
    if (!ticker) return;
    shares = Math.round(Number(shares));
    if (!shares || shares <= 0) { showNotification('Quantità non valida.', 'error'); return; }
    if (!gameState.stockHoldings) gameState.stockHoldings = {};
    const holding = gameState.stockHoldings[tickerId];
    if (!holding || holding.shares < shares) { showNotification('Quote insufficienti!', 'error'); return; }
    const price = (gameState.stockPrices || {})[tickerId] || ticker.basePrice;
    const proceeds = Math.round(price * shares);
    const costBasis = Math.round(holding.avgCost * shares);
    const profit = proceeds - costBasis;
    window.CE_money.earn(proceeds, 'sell_stocks');
    holding.shares -= shares;
    if (holding.shares === 0) holding.avgCost = 0;
    gameState.totalStockProfit = (gameState.totalStockProfit || 0) + profit;
    const pl = profit >= 0 ? `+€${profit.toLocaleString()}` : `−€${Math.abs(profit).toLocaleString()}`;
    logToMap(`📊 Venduto ${shares} quote ${ticker.name} @ €${price.toFixed(2)} — P&L: ${pl}`);
    showNotification(`${shares}x ${ticker.name} vendute — ${pl}`, profit >= 0 ? 'success' : 'error');
    updateUI(); saveGame();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

// ── BROKER: PIAZZA INVESTIMENTO ──────────────────────────────────
window.placeBrokerInvestment = function(capital, riskId, durationHours) {
    if (!_hasWealthManager()) { showNotification('Assumi un Elite Wealth Manager prima!', 'error'); return; }
    if (gameState.brokerInvestments.filter(i => !i.resolved).length >= 3) {
        showNotification('Massimo 3 investimenti broker simultanei!', 'error'); return;
    }
    const profile = (typeof BROKER_RISK_PROFILES !== 'undefined' ? BROKER_RISK_PROFILES : []).find(p => p.id === riskId);
    if (!profile) return;
    capital = Math.round(Number(capital));
    if (capital < 1000) { showNotification('Capitale minimo: €1.000', 'error'); return; }
    if (!window.CE_money.spend(capital, 'broker_investment')) return;
    const currentHour = gameState.day * 24 + gameState.hour;
    gameState.brokerInvestments.push({
        id: gameState.nextId++,
        capital, risk: riskId, riskName: profile.name,
        startHour: currentHour, endsHour: currentHour + durationHours,
        minReturn: profile.minReturn, maxReturn: profile.maxReturn,
        resolved: false, actualGain: null
    });
    const dLabel = durationHours < 24 ? `${durationHours}h` : `${durationHours / 24}gg`;
    logToMap(`💼 Broker: €${capital.toLocaleString()} → ${profile.name} × ${dLabel}`);
    showNotification(`Investimento piazzato: €${capital.toLocaleString()} (${profile.name})`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

// ── LIFESTYLE ASSETS ─────────────────────────────────────────────
window.buyLifestyleAsset = function(assetId) {
    const asset = (typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : []).find(a => a.id === assetId);
    if (!asset) return;
    if ((gameState.lifestyleAssets || []).includes(assetId)) { showNotification('Asset già posseduto!', 'error'); return; }
    if (!window.CE_money.spend(asset.price, 'buy_lifestyle_asset')) return;
    if (!gameState.lifestyleAssets) gameState.lifestyleAssets = [];
    gameState.lifestyleAssets.push(assetId);
    if (asset.repBonus) window.CE_money.addReputation(asset.repBonus);
    logToMap(`🏰 Acquisito: ${asset.name} (${asset.location}) — €${asset.price.toLocaleString()}`);
    showBigEvent(asset.icon, `Acquisito: ${asset.name}!`,
        `${asset.desc}\n\n${asset.repBonus > 0 ? `+${asset.repBonus}★ Reputazione immediata. ` : ''}${asset.passive > 0 ? `+€${asset.passive.toLocaleString()}/g entrate passive. ` : ''}${asset.intlUnlock ? 'Tratte internazionali sbloccate!' : ''}`
    );
    if (asset.intlUnlock && typeof FUTURE_POIS !== 'undefined') {
        ['svizzera', 'costa_azzurra'].forEach(r => {
            if (!gameState.unlockedRegions.includes(r)) gameState.unlockedRegions.push(r);
        });
        MapBackend.drawHighways();
        MapBackend.drawPOIs();
        logToMap('✈️ Tratte internazionali sbloccate: Ginevra, Montecarlo, Nizza, Cannes!');
    }
    updateUI(); saveGame();
    if (typeof renderTabLifestyle === 'function' && _tabIs('lifestyle')) renderTabLifestyle();
};

// ── SHORT SELLING ────────────────────────────────────────────────
window.shortSell = function(tickerId, shares) {
    if (!_hasWealthManager()) { showNotification('Serve un Elite Wealth Manager per vendite allo scoperto!', 'error'); return; }
    const ticker = (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).find(t => t.id === tickerId);
    if (!ticker) return;
    shares = Math.round(Number(shares));
    if (!shares || shares <= 0) { showNotification('Quantità non valida.', 'error'); return; }
    const price = (gameState.stockPrices || {})[tickerId] || ticker.basePrice;
    const margin = Math.round(price * shares * 0.20);
    if (!window.CE_money.spend(margin, 'short_sell')) return;
    if (!gameState.shortPositions) gameState.shortPositions = {};
    const existing = gameState.shortPositions[tickerId];
    if (existing) {
        existing.shares += shares;
        existing.openPrice = +((existing.openPrice * (existing.shares - shares) + price * shares) / existing.shares).toFixed(2);
    } else {
        gameState.shortPositions[tickerId] = { shares, openPrice: +price.toFixed(2) };
    }
    gameState.shortMarginHeld = (gameState.shortMarginHeld || 0) + margin;
    logToMap(`📉 Short: ${shares} quote ${ticker.name} @ €${price.toFixed(2)} — margine bloccato €${margin.toLocaleString()}`);
    showNotification(`Short ${shares}x ${ticker.name} aperto!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

window.coverShort = function(tickerId, shares) {
    if (!_hasWealthManager()) return;
    const ticker = (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : []).find(t => t.id === tickerId);
    if (!ticker) return;
    const pos = (gameState.shortPositions || {})[tickerId];
    if (!pos || pos.shares <= 0) { showNotification('Nessuna posizione short su questo titolo!', 'error'); return; }
    shares = Math.min(Math.round(Number(shares)), pos.shares);
    if (!shares || shares <= 0) return;
    const currentPrice = (gameState.stockPrices || {})[tickerId] || ticker.basePrice;
    const priceDiff = pos.openPrice - currentPrice;
    const profit = Math.round(priceDiff * shares);
    const marginReturn = Math.round(pos.openPrice * shares * 0.20);
    window.CE_money.earn(marginReturn + profit, 'cover_short');
    gameState.shortMarginHeld = Math.max(0, (gameState.shortMarginHeld || 0) - marginReturn);
    pos.shares -= shares;
    if (pos.shares <= 0) delete gameState.shortPositions[tickerId];
    gameState.totalStockProfit = (gameState.totalStockProfit || 0) + profit;
    const pl = profit >= 0 ? `+€${profit.toLocaleString()}` : `−€${Math.abs(profit).toLocaleString()}`;
    logToMap(`📉 Short chiuso: ${shares}x ${ticker.name} @ €${currentPrice.toFixed(2)} — P&L: ${pl}`);
    showNotification(`Short chiuso — ${pl}`, profit >= 0 ? 'success' : 'error');
    updateUI(); saveGame();
    if (typeof renderTabFinance === 'function' && _tabIs('finance')) renderTabFinance();
};

// ── LOBBYING ────────────────────────────────────────────────────
window.donateToLobby = function(amount) {
    amount = Math.round(Number(amount));
    if (!amount || amount < 1000) { showNotification('Donazione minima: €1.000', 'error'); return; }
    if (!window.CE_money.spend(amount, 'lobby_donation')) return;
    const points = Math.floor(amount / 1000);
    gameState.lobbyingPoints = (gameState.lobbyingPoints || 0) + points;
    logToMap(`🏛️ Lobbying: €${amount.toLocaleString()} donati — +${points} punti lobbying`);
    showNotification(`+${points} Punti Lobbying acquisiti!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPolitics === 'function' && _tabIs('politics')) renderTabPolitics();
};

window.passLobbyLaw = function(lawId) {
    if (typeof LOBBY_LAWS === 'undefined') return;
    const law = LOBBY_LAWS.find(l => l.id === lawId);
    if (!law) return;
    if ((gameState.activeLobbyLaws || []).includes(lawId)) { showNotification('Legge già approvata!', 'error'); return; }
    if ((gameState.lobbyingPoints || 0) < law.pointsCost) { showNotification(`Servono ${law.pointsCost} punti lobbying!`, 'error'); return; }
    if (law.cashCost && !window.CE_money.spend(law.cashCost, 'pass_lobby_law')) return;
    gameState.lobbyingPoints -= law.pointsCost;
    if (!gameState.activeLobbyLaws) gameState.activeLobbyLaws = [];
    gameState.activeLobbyLaws.push(lawId);
    logToMap(`⚖️ Legge approvata: ${law.name} — Costo: ${law.pointsCost}pt + €${(law.cashCost||0).toLocaleString()}`);
    showBigEvent('⚖️', `Legge Approvata: ${law.name}`, law.desc);
    updateUI(); saveGame();
    if (typeof renderTabPolitics === 'function' && _tabIs('politics')) renderTabPolitics();
};

// ─── VENTURE CAPITAL ─────────────────────────────────────────────
window.acquireVentureStake = function(agencyId, stakePercent) {
    if (typeof VENTURE_AGENCIES === 'undefined') return;
    const agency = VENTURE_AGENCIES.find(a => a.id === agencyId);
    if (!agency) return;
    if (gameState.reputation < agency.minRep) {
        showNotification(`Reputazione insufficiente! Servono ${agency.minRep}★`, 'error'); return;
    }
    stakePercent = Math.min(agency.maxStake, Math.max(1, Math.round(Number(stakePercent))));
    const cost = Math.floor(agency.valuation * stakePercent / 100);
    const existing = (gameState.ventureCapital || []).find(s => s.agencyId === agencyId);
    if (existing && existing.stakePercent + stakePercent > agency.maxStake) {
        showNotification(`Quota massima acquisibile: ${agency.maxStake}%`, 'error'); return;
    }
    if (!window.CE_money.spend(cost, 'acquire_venture_stake')) return;
    if (existing) {
        existing.stakePercent += stakePercent;
    } else {
        if (!gameState.ventureCapital) gameState.ventureCapital = [];
        gameState.ventureCapital.push({ agencyId, stakePercent });
    }
    const dailyReturn = Math.floor(agency.dailyIncome * stakePercent / 100);
    logToMap(`💼 M&A: Acquisita quota ${stakePercent}% di ${agency.name} per €${cost.toLocaleString()}. Rendita: +€${dailyReturn}/g`);
    showBigEvent('💼', `Acquisita: ${agency.name}`, `Quota: ${stakePercent}%\nInvestimento: €${cost.toLocaleString()}\nRendita giornaliera: +€${dailyReturn}\nRischio: ${agency.riskLevel.toUpperCase()}`);
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function' && _tabIs('invest')) renderTabInvestments();
};

window.divestVentureStake = function(agencyId) {
    const idx = (gameState.ventureCapital || []).findIndex(s => s.agencyId === agencyId);
    if (idx === -1) return;
    const agency = (typeof VENTURE_AGENCIES !== 'undefined' ? VENTURE_AGENCIES : []).find(a => a.id === agencyId);
    const stake  = gameState.ventureCapital[idx];
    const refund = Math.floor((agency ? agency.valuation : 100000) * stake.stakePercent / 100 * 0.75);
    gameState.ventureCapital.splice(idx, 1);
    window.CE_money.earn(refund, 'divest_venture_stake');
    logToMap(`💼 Disinvestito ${agency?.name || agencyId}: +€${refund.toLocaleString()} (75% valutazione)`);
    showNotification(`📤 Quota ceduta: +€${refund.toLocaleString()}`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function' && _tabIs('invest')) renderTabInvestments();
};
