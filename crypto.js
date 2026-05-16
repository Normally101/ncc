'use strict';
/* ================================================================
   crypto.js — Chauffeur Empire
   Espansione 10: Criptovalute e Conti Offshore (AMM + riciclaggio)
   ================================================================ */

window._cryptoState = {
    market:    [],  // crypto_market rows
    portfolio: [],  // user holdings with PnL
    offshore:  [],  // offshore accounts
    txLog:     [],
    _lastFetch: 0,
    _sub:      null,
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function _cErr(prefix, err) {
    const email = (window.GAME_CONFIG || {}).SUPPORT_EMAIL || 'support@chauffeurempire.com';
    return `${prefix}: ${(err && err.message) || err || 'errore'} — ${email}`;
}

function _fmt(n, dec = 2) {
    if (!n && n !== 0) return '—';
    return Number(n).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function _fmtCoin(n) {
    if (!n && n !== 0) return '—';
    if (n < 0.001) return n.toExponential(4);
    return _fmt(n, n < 1 ? 6 : 3);
}

// AMM price impact estimate
function _priceImpact(coin, eurIn) {
    const k = coin.reserve_eur * coin.supply;
    const newRes = coin.reserve_eur + eurIn * 0.995;
    const coinsOut = coin.supply - k / newRes;
    if (!coinsOut || coinsOut <= 0) return { coinsOut: 0, priceImpact: 0, avgPrice: 0 };
    const avgPrice = eurIn / coinsOut;
    const priceImpact = ((avgPrice - coin.price_eur) / coin.price_eur) * 100;
    return { coinsOut, avgPrice, priceImpact };
};

// ── DATA LAYER ────────────────────────────────────────────────────────────────

window.cryptoRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._cryptoState._lastFetch < 30000) return;
    window._cryptoState._lastFetch = now;

    const sb = window.supabaseClient;
    if (!sb) return;

    const [mRes, pRes, oRes] = await Promise.all([
        sb.from('crypto_market').select('*').order('id'),
        sb.rpc('rpc_get_crypto_portfolio'),
        sb.from('offshore_accounts').select('*').eq('user_id', (await sb.auth.getUser()).data?.user?.id),
    ]);

    if (!mRes.error) window._cryptoState.market    = mRes.data || [];
    if (!pRes.error) window._cryptoState.portfolio = pRes.data || [];
    if (!oRes.error) window._cryptoState.offshore  = oRes.data || [];
};

window.cryptoBuy = async function(coinId, eurAmount) {
    const amount = parseInt(eurAmount, 10);
    if (!amount || amount < 100) { if(typeof showNotification==='function') showNotification('Minimo €100', 'error'); return; }
    if ((gameState.cash || 0) < amount) { if(typeof showNotification==='function') showNotification('Fondi insufficienti', 'error'); return; }

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_buy_crypto', { v_coin_id: coinId, v_eur_in: amount });
    if (error) { if(typeof showNotification==='function') showNotification(_cErr('Acquisto fallito', error), 'error'); return; }

    gameState.cash -= amount;
    if (typeof updateUI === 'function') updateUI();
    if(typeof showNotification==='function') showNotification(`✅ Acquistati ${_fmtCoin(data.coins_got)} ${coinId} per €${amount.toLocaleString()}`, 'success');
    window._cryptoState._lastFetch = 0;
    await window.cryptoRefresh(true);
    if (typeof window.switchTab === 'function') window.switchTab('crypto');
};

window.cryptoSell = async function(coinId, coinAmount) {
    const amount = parseFloat(coinAmount);
    if (!amount || amount <= 0) { if(typeof showNotification==='function') showNotification('Quantità non valida', 'error'); return; }

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_sell_crypto', { v_coin_id: coinId, v_coins_in: amount });
    if (error) { if(typeof showNotification==='function') showNotification(_cErr('Vendita fallita', error), 'error'); return; }

    gameState.cash = (gameState.cash || 0) + Math.floor(data.eur_received);
    if (typeof updateUI === 'function') updateUI();
    if(typeof showNotification==='function') showNotification(`✅ Venduti ${_fmtCoin(amount)} ${coinId} per €${Math.floor(data.eur_received).toLocaleString()}`, 'success');
    window._cryptoState._lastFetch = 0;
    await window.cryptoRefresh(true);
    if (typeof window.switchTab === 'function') window.switchTab('crypto');
};

window.cryptoDepositOffshore = async function(jurisdiction, eurAmount) {
    const amount = parseInt(eurAmount, 10);
    if (!amount || amount < 10000) { if(typeof showNotification==='function') showNotification('Minimo offshore: €10.000', 'error'); return; }
    if ((gameState.cash || 0) < amount) { if(typeof showNotification==='function') showNotification('Fondi insufficienti', 'error'); return; }

    if (!confirm(`Depositare €${amount.toLocaleString()} nel conto offshore ${jurisdiction}? Commissione: 3%.`)) return;

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_deposit_offshore', { v_jurisdiction: jurisdiction, v_eur_amount: amount });
    if (error) { if(typeof showNotification==='function') showNotification(_cErr('Deposito offshore fallito', error), 'error'); return; }

    gameState.cash -= amount;
    if (typeof updateUI === 'function') updateUI();
    if(typeof showNotification==='function') showNotification(`🏦 Depositato €${data.net_deposited.toLocaleString()} in ${data.jurisdiction} (fee: €${data.fee.toLocaleString()})`, 'success');
    window._cryptoState._lastFetch = 0;
    await window.cryptoRefresh(true);
    if (typeof window.switchTab === 'function') window.switchTab('crypto');
};

window.cryptoWithdrawOffshore = async function(jurisdiction, eurAmount) {
    const amount = parseInt(eurAmount, 10);
    if (!amount || amount <= 0) { if(typeof showNotification==='function') showNotification('Importo non valido', 'error'); return; }

    if (!confirm(`Prelevare €${amount.toLocaleString()} dal conto ${jurisdiction}? RISCHIO: sequestro GdF (8%+).`)) return;

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_withdraw_offshore', { v_jurisdiction: jurisdiction, v_eur_amount: amount });
    if (error) { if(typeof showNotification==='function') showNotification(_cErr('Prelievo fallito', error), 'error'); return; }

    gameState.cash = (gameState.cash || 0) + data.received;
    if (typeof updateUI === 'function') updateUI();

    if (data.seized) {
        if(typeof showNotification==='function') showNotification(`⚠️ GdF! Sequestrati €${data.penalty.toLocaleString()}. Ricevuti €${data.received.toLocaleString()}.`, 'error');
        if(typeof logToMap==='function') logToMap(`🚔 GdF: Sequestro offshore €${data.penalty.toLocaleString()} da ${jurisdiction}!`);
    } else {
        if(typeof showNotification==='function') showNotification(`✅ Prelevati €${data.received.toLocaleString()} da ${jurisdiction}.`, 'success');
    }

    window._cryptoState._lastFetch = 0;
    await window.cryptoRefresh(true);
    if (typeof window.switchTab === 'function') window.switchTab('crypto');
};

// ── TRADE MODAL ───────────────────────────────────────────────────────────────

window.cryptoOpenTradeModal = function(coinId, side) {
    const coin = window._cryptoState.market.find(c => c.id === coinId);
    const holding = window._cryptoState.portfolio.find(p => p.coin_id === coinId);
    if (!coin) return;

    const existing = document.getElementById('crypto-trade-modal');
    if (existing) existing.remove();

    const isBuy = side === 'buy';
    const inputId = 'crypto-trade-input';

    const modal = document.createElement('div');
    modal.id = 'crypto-trade-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 w-80 max-w-full mx-4 shadow-2xl">
        <div class="flex justify-between items-center mb-4">
          <div class="font-bold text-white">${coin.icon} ${coin.name} — ${isBuy ? 'ACQUISTO' : 'VENDITA'}</div>
          <button onclick="document.getElementById('crypto-trade-modal').remove()" class="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        <div class="bg-white/5 rounded-lg p-3 mb-4 text-[11px] space-y-1">
          <div class="flex justify-between"><span class="text-gray-400">Prezzo attuale</span><span class="text-white font-mono">€${_fmt(coin.price_eur)}</span></div>
          ${holding ? `<div class="flex justify-between"><span class="text-gray-400">In portafoglio</span><span class="text-white font-mono">${_fmtCoin(holding.amount)}</span></div>` : ''}
          ${holding ? `<div class="flex justify-between"><span class="text-gray-400">PnL</span><span class="${(holding.pnl_pct||0)>=0?'text-green-400':'text-red-400'} font-mono">${(holding.pnl_pct||0).toFixed(2)}%</span></div>` : ''}
        </div>

        <div class="mb-3">
          <label class="text-[10px] text-gray-400 mb-1 block">${isBuy ? 'EUR da investire' : 'Quantità da vendere'}</label>
          <input id="${inputId}" type="number" min="${isBuy ? 100 : 0}" step="${isBuy ? 1000 : 0.01}"
            value="${isBuy ? 10000 : (holding?.amount || 0)}"
            class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-gold outline-none"
            oninput="window._cryptoUpdatePreview('${coinId}','${side}',this.value)" />
        </div>

        <div id="crypto-preview" class="text-[10px] text-gray-400 mb-3"></div>
        <div id="crypto-trade-err" class="text-red-400 text-[10px] mb-2 hidden"></div>

        <button id="crypto-trade-btn"
          onclick="${isBuy ? `window.cryptoBuy('${coinId}', document.getElementById('${inputId}').value)` : `window.cryptoSell('${coinId}', document.getElementById('${inputId}').value)`}"
          class="btn-gold w-full">
          ${isBuy ? '💰 Acquista' : '💵 Vendi'}
        </button>
      </div>`;
    document.body.appendChild(modal);
    window._cryptoUpdatePreview(coinId, side, isBuy ? 10000 : (holding?.amount || 0));
};

window._cryptoUpdatePreview = function(coinId, side, val) {
    const coin = window._cryptoState.market.find(c => c.id === coinId);
    const prev = document.getElementById('crypto-preview');
    if (!coin || !prev) return;

    if (side === 'buy') {
        const eurIn = parseFloat(val) || 0;
        const { coinsOut, avgPrice, priceImpact } = _priceImpact(coin, eurIn);
        prev.innerHTML = `Ricevi ~${_fmtCoin(coinsOut)} ${coinId} @ €${_fmt(avgPrice)} (impatto: ${priceImpact.toFixed(2)}%)`;
    } else {
        const coinsIn = parseFloat(val) || 0;
        const k = coin.reserve_eur * coin.supply;
        const newSup = coin.supply + coinsIn;
        const eurOut = (coin.reserve_eur - (k / newSup)) * 0.995;
        prev.innerHTML = `Ricevi ~€${_fmt(Math.floor(eurOut))} per ${_fmtCoin(coinsIn)} ${coinId}`;
    }
};

// ── TAB RENDERER ──────────────────────────────────────────────────────────────

window.renderTabCrypto = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const state = window._cryptoState;
    const market = state.market;
    const portfolio = state.portfolio;
    const offshore = state.offshore;

    const portfolioValue = portfolio.reduce((s, p) => s + (p.value_eur || 0), 0);
    const offshoreTotal  = offshore.reduce((s, o) => s + (o.balance || 0), 0);

    const marketHtml = market.map(coin => {
        const holding = portfolio.find(p => p.coin_id === coin.id);
        const priceChange = 0; // would need historical data
        return `
          <div class="bg-white/3 border border-white/8 rounded-xl p-3 mb-2">
            <div class="flex justify-between items-center mb-1">
              <div class="font-bold text-white text-sm">${coin.icon} ${coin.name} <span class="text-[9px] text-gray-500">${coin.id}</span></div>
              <div class="text-right">
                <div class="text-white font-mono text-sm">€${_fmt(coin.price_eur)}</div>
              </div>
            </div>
            ${holding ? `
              <div class="text-[10px] text-gray-400 mb-2">
                In portafoglio: <span class="text-white">${_fmtCoin(holding.amount)} (€${_fmt(holding.value_eur)})</span>
                — PnL: <span class="${(holding.pnl_pct||0)>=0?'text-green-400':'text-red-400'}">${(holding.pnl_pct||0).toFixed(2)}%</span>
              </div>` : ''}
            <div class="flex gap-2">
              <button onclick="window.cryptoOpenTradeModal('${coin.id}','buy')"
                class="btn-gold flex-1 !text-[10px] !py-1">💰 Acquista</button>
              ${holding ? `<button onclick="window.cryptoOpenTradeModal('${coin.id}','sell')"
                class="btn-gold flex-1 !text-[10px] !py-1 !bg-red-900/30 !text-red-300">💵 Vendi</button>` : ''}
            </div>
          </div>`;
    }).join('');

    const offshoreJurisdictions = [
        { id: 'cayman', name: 'Cayman Islands', icon: '🏝️', risk: '8%' },
        { id: 'switzerland', name: 'Svizzera', icon: '🇨🇭', risk: '5%' },
        { id: 'dubai', name: 'Dubai', icon: '🇦🇪', risk: '6%' },
    ];

    const offshoreHtml = offshoreJurisdictions.map(j => {
        const acc = offshore.find(o => o.jurisdiction === j.id);
        const depInputId = `off-dep-${j.id}`;
        const wdInputId  = `off-wd-${j.id}`;

        return `
          <div class="bg-white/3 border border-white/8 rounded-xl p-3 mb-2">
            <div class="flex justify-between items-center mb-2">
              <div class="font-bold text-white text-sm">${j.icon} ${j.name}</div>
              <div class="text-[10px] text-gray-400">Rischio GdF: ${j.risk}</div>
            </div>
            ${acc ? `<div class="text-[11px] text-gray-300 mb-2">💰 Saldo: <span class="text-white font-mono">€${acc.balance.toLocaleString()}</span></div>` : '<div class="text-[10px] text-gray-500 mb-2">Conto non aperto</div>'}
            <div class="flex gap-2 mb-1">
              <input id="${depInputId}" type="number" min="10000" step="10000" value="50000"
                class="finance-input flex-1 !text-[9px] !py-1" placeholder="€ deposito">
              <button onclick="window.cryptoDepositOffshore('${j.id}', document.getElementById('${depInputId}').value)"
                class="btn-gold !text-[9px] !py-1 !px-2">⬇️ Deposita</button>
            </div>
            ${acc && acc.balance > 0 ? `
            <div class="flex gap-2">
              <input id="${wdInputId}" type="number" min="1000" max="${acc.balance}" step="10000"
                class="finance-input flex-1 !text-[9px] !py-1" placeholder="€ prelievo">
              <button onclick="window.cryptoWithdrawOffshore('${j.id}', document.getElementById('${wdInputId}').value)"
                class="btn-gold !text-[9px] !py-1 !px-2 !bg-orange-900/30 !text-orange-300">⬆️ Preleva</button>
            </div>` : ''}
          </div>`;
    }).join('');

    container.innerHTML = `
      <div class="p-1">
        <div class="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
          <h3 class="text-[10px] text-gold uppercase tracking-widest">₿ Crypto & Offshore</h3>
          <button onclick="window.cryptoRefresh(true).then(()=>window.switchTab('crypto'))"
            class="text-[9px] text-gray-400 hover:text-white">↻ Aggiorna</button>
        </div>

        <!-- Portfolio summary -->
        <div class="grid grid-cols-2 gap-2 mb-4">
          <div class="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
            <div class="text-[9px] text-gray-400 mb-1">Portfolio Crypto</div>
            <div class="text-lg font-bold text-gold">€${Math.floor(portfolioValue).toLocaleString()}</div>
          </div>
          <div class="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
            <div class="text-[9px] text-gray-400 mb-1">Offshore Total</div>
            <div class="text-lg font-bold text-green-400">€${offshoreTotal.toLocaleString()}</div>
          </div>
        </div>

        <!-- Market -->
        <h3 class="text-[10px] text-gold uppercase tracking-widest mb-3">📈 Mercato Crypto</h3>
        ${marketHtml}

        <!-- Offshore -->
        <h3 class="text-[10px] text-gold uppercase tracking-widest border-t border-white/10 pt-3 mt-4 mb-3">🏦 Conti Offshore</h3>
        <div class="text-[9px] text-gray-500 mb-3">Fondi offshore non visibili al fisco. Prelievo soggetto a rischio sequestro GdF.</div>
        ${offshoreHtml}
      </div>`;
};

// ── REALTIME ──────────────────────────────────────────────────────────────────

function _cryptoSubscribeRealtime() {
    const sb = window.supabaseClient;
    if (!sb || window._cryptoState._sub) return;

    window._cryptoState._sub = sb
        .channel('crypto_market_changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crypto_market' }, () => {
            window._cryptoState._lastFetch = 0;
            window.cryptoRefresh(true).then(() => {
                if ((window._activeTab || '') === 'crypto') window.renderTabCrypto();
            });
        })
        .subscribe();
}

// ── INIT ──────────────────────────────────────────────────────────────────────

window.cryptoInit = async function() {
    await window.cryptoRefresh(true);
    _cryptoSubscribeRealtime();
};
