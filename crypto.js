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

    const uid = window.currentUser?.id;
    const [mRes, pRes, oRes] = await Promise.all([
        sb.from('crypto_market').select('*').order('id'),
        sb.rpc('rpc_get_crypto_portfolio'),
        sb.from('offshore_accounts').select('*').eq('user_id', uid),
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
        return `
          <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${holding ? 8 : 10}px">
              <div style="font-size:13px;font-weight:700;color:#e6edf3">${coin.icon} ${coin.name} <span style="font-size:9px;color:#6b7280">${coin.id}</span></div>
              <div style="font-family:monospace;font-size:13px;color:#e6edf3">€${_fmt(coin.price_eur)}</div>
            </div>
            ${holding ? `
              <div style="font-size:10px;color:#8b949e;margin-bottom:10px">
                In portafoglio: <span style="color:#e6edf3">${_fmtCoin(holding.amount)} (€${_fmt(holding.value_eur)})</span>
                — PnL: <span style="color:${(holding.pnl_pct||0)>=0?'#3fb950':'#f85149'}">${(holding.pnl_pct||0).toFixed(2)}%</span>
              </div>` : ''}
            <div style="display:flex;gap:8px">
              <button onclick="window.cryptoOpenTradeModal('${coin.id}','buy')"
                style="flex:1;padding:5px 0;font-size:10px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">💰 Acquista</button>
              ${holding ? `<button onclick="window.cryptoOpenTradeModal('${coin.id}','sell')"
                style="flex:1;padding:5px 0;font-size:10px;font-weight:700;cursor:pointer;background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;border-radius:4px;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">💵 Vendi</button>` : ''}
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
          <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-size:13px;font-weight:700;color:#e6edf3">${j.icon} ${j.name}</div>
              <div style="font-size:10px;color:#8b949e">Rischio GdF: ${j.risk}</div>
            </div>
            ${acc ? `<div style="font-size:11px;color:#8b949e;margin-bottom:8px">💰 Saldo: <span style="color:#e6edf3;font-family:monospace">€${acc.balance.toLocaleString()}</span></div>` : '<div style="font-size:10px;color:#6b7280;margin-bottom:8px">Conto non aperto</div>'}
            <div style="display:flex;gap:8px;margin-bottom:6px">
              <input id="${depInputId}" type="number" min="10000" step="10000" value="50000"
                style="flex:1;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:5px 8px;font-size:10px;color:#e6edf3;outline:none" placeholder="€ deposito">
              <button onclick="window.cryptoDepositOffshore('${j.id}', document.getElementById('${depInputId}').value)"
                style="padding:5px 10px;font-size:9px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;white-space:nowrap;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">⬇️ Deposita</button>
            </div>
            ${acc && acc.balance > 0 ? `
            <div style="display:flex;gap:8px">
              <input id="${wdInputId}" type="number" min="1000" max="${acc.balance}" step="10000"
                style="flex:1;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:5px 8px;font-size:10px;color:#e6edf3;outline:none" placeholder="€ prelievo">
              <button onclick="window.cryptoWithdrawOffshore('${j.id}', document.getElementById('${wdInputId}').value)"
                style="padding:5px 10px;font-size:9px;font-weight:700;cursor:pointer;background:#1a1a08;border:1px solid #9a7b1a;color:#f59e0b;border-radius:4px;white-space:nowrap;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">⬆️ Preleva</button>
            </div>` : ''}
          </div>`;
    }).join('');

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Finanza Alternativa</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Crypto &amp; Offshore</div>
            <div style="font-size:11px;color:#8b949e;margin-top:4px">Portfolio €${Math.floor(portfolioValue).toLocaleString()} · Offshore €${offshoreTotal.toLocaleString()}</div>
        </div>
        <button onclick="window.cryptoRefresh(true).then(()=>window.switchTab('crypto'))" style="background:#161b22;border:1px solid #21262d;color:#8b949e;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">↻ Aggiorna</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Portfolio Crypto</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${portfolioValue > 0 ? '#d4af37' : '#e6edf3'}">€${Math.floor(portfolioValue/1000)}k</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Offshore</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${offshoreTotal > 0 ? '#3fb950' : '#e6edf3'}">${offshoreTotal > 0 ? '€' + Math.floor(offshoreTotal/1000) + 'k' : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Coin Detenute</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${portfolio.length > 0 ? '#58a6ff' : '#e6edf3'}">${portfolio.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Conti Aperti</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:#d4af37">${offshore.filter(o => o.balance > 0).length}</div>
        </div>
    </div>` + `
    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">📈 Mercato Crypto</div>
    ${marketHtml}
    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-top:20px;margin-bottom:8px;padding-top:16px;border-top:1px solid #21262d">🏦 Conti Offshore</div>
    <div style="font-size:10px;color:#8b949e;margin-bottom:12px">Fondi offshore non visibili al fisco. Prelievo soggetto a rischio sequestro GdF.</div>
    ${offshoreHtml}`;
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
