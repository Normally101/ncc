'use strict';
/* ================================================================
   crypto.js — Chauffeur Empire
   Espansione 10: Criptovalute e Conti Offshore (AMM + riciclaggio)
   ================================================================ */

window._cryptoState = {
    market:    [],
    portfolio: [],
    offshore:  [],
    txLog:     [],
    _lastFetch: 0,
    _sub:      null,
};

function _cErr(prefix, err) {
    if (window.CE_Sec && typeof window.CE_Sec.userError === 'function') {
        return window.CE_Sec.userError(prefix, err, { support: true });
    }
    try { console.warn('[CRYPTO]', prefix, err && (err.message || err)); } catch {}
    return `${prefix}, riprova.`;
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

function _priceImpact(coin, eurIn) {
    const k = coin.reserve_eur * coin.supply;
    const newRes = coin.reserve_eur + eurIn * 0.995;
    const coinsOut = coin.supply - k / newRes;
    if (!coinsOut || coinsOut <= 0) return { coinsOut: 0, priceImpact: 0, avgPrice: 0 };
    const avgPrice = eurIn / coinsOut;
    const priceImpact = ((avgPrice - coin.price_eur) / coin.price_eur) * 100;
    return { coinsOut, avgPrice, priceImpact };
}

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

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_buy_crypto', { v_coin_id: coinId, v_eur_in: amount });
    if (error) { if(typeof showNotification==='function') showNotification(_cErr('Acquisto fallito', error), 'error'); return; }

    window.CE_money.addebitatoDalServer(amount, 'crypto_buy');
    const modalEl = document.getElementById('crypto-trade-modal');
    if (modalEl) modalEl.remove();
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

    window.CE_money.accreditatoDalServer(Math.floor(data.eur_received), 'crypto_sell');
    const modalEl = document.getElementById('crypto-trade-modal');
    if (modalEl) modalEl.remove();
    if (typeof updateUI === 'function') updateUI();
    if(typeof showNotification==='function') showNotification(`✅ Venduti ${_fmtCoin(amount)} ${coinId} per €${Math.floor(data.eur_received).toLocaleString()}`, 'success');
    window._cryptoState._lastFetch = 0;
    await window.cryptoRefresh(true);
    if (typeof window.switchTab === 'function') window.switchTab('crypto');
};

window.cryptoDepositOffshore = async function(jurisdiction, eurAmount) {
    const amount = parseInt(eurAmount, 10);
    if (!amount || amount < 10000) { if(typeof showNotification==='function') showNotification('Minimo offshore: €10.000', 'error'); return; }

    if (!confirm(`Depositare €${amount.toLocaleString()} nel conto offshore ${jurisdiction}? Commissione: 3%.`)) return;

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_deposit_offshore', { v_jurisdiction: jurisdiction, v_eur_amount: amount });
    if (error) { if(typeof showNotification==='function') showNotification(_cErr('Deposito offshore fallito', error), 'error'); return; }

    window.CE_money.addebitatoDalServer(amount, 'crypto_deposit_offshore');
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

    window.CE_money.accreditatoDalServer(data.received, 'crypto_withdraw_offshore');
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
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:20px;width:320px;max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.6)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-size:13px;font-weight:700;color:#e6edf3">${coin.icon} ${coin.name} — ${isBuy ? 'ACQUISTO' : 'VENDITA'}</div>
          <button ${ceAct('ceRemove', ['crypto-trade-modal'])} style="background:transparent;border:none;color:#6b7280;font-size:16px;cursor:pointer;padding:0;line-height:1">✕</button>
        </div>

        <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:#6b7280">Prezzo attuale</span><span style="color:#e6edf3;font-family:monospace">€${_fmt(coin.price_eur)}</span></div>
          ${holding ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:#6b7280">In portafoglio</span><span style="color:#e6edf3;font-family:monospace">${_fmtCoin(holding.amount)}</span></div>` : ''}
          ${holding ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#6b7280">PnL</span><span style="color:${(holding.pnl_pct||0)>=0?'#1aa06a':'#db5746'};font-family:monospace">${(holding.pnl_pct||0).toFixed(2)}%</span></div>` : ''}
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:10px;color:#6b7280;display:block;margin-bottom:4px">${isBuy ? 'EUR da investire' : 'Quantità da vendere'}</label>
          <input id="${inputId}" type="number" min="${isBuy ? 100 : 0}" step="${isBuy ? 1000 : 0.01}"
            value="${isBuy ? 10000 : (holding?.amount || 0)}"
            style="width:100%;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:8px 10px;color:#e6edf3;font-size:12px;outline:none;box-sizing:border-box"
            ${ceAct('ceCryptoPreview', [coinId, side], 'input')} />
        </div>

        <div id="crypto-preview" style="font-size:10px;color:#6b7280;margin-bottom:10px"></div>
        <div id="crypto-trade-err" style="color:#db5746;font-size:10px;margin-bottom:8px;display:none"></div>

        <button id="crypto-trade-btn"
          ${ceAct('ceCryptoTrade', [isBuy ? 'buy' : 'sell', coinId, inputId])}
          style="width:100%;padding:9px;font-size:12px;font-weight:700;cursor:pointer;background:linear-gradient(180deg,#e3b441,#c79a2a);color:#fff;border:none;border-radius:7px;box-shadow:0 2px 5px rgba(199,154,42,.24)">
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

window.renderTabCrypto = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const state     = window._cryptoState;
    const market    = state.market;
    const portfolio = state.portfolio;
    const offshore  = state.offshore;

    const portfolioValue = portfolio.reduce((s, p) => s + (p.value_eur || 0), 0);
    const offshoreTotal  = offshore.reduce((s, o) => s + (o.balance || 0), 0);

    const marketHtml = market.map(coin => {
        const holding = portfolio.find(p => p.coin_id === coin.id);
        return `
          <div class="em-card" style="padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${holding ? 8 : 10}px">
              <div style="font-size:13px;font-weight:700">${coin.icon} ${coin.name} <span style="font-size:9px;color:var(--em-muted)">${coin.id}</span></div>
              <div style="font-family:monospace;font-size:13px">€${_fmt(coin.price_eur)}</div>
            </div>
            ${holding ? `
              <div style="font-size:10px;color:var(--em-muted);margin-bottom:10px">
                In portafoglio: <span style="color:var(--em-ink)">${_fmtCoin(holding.amount)} (€${_fmt(holding.value_eur)})</span>
                — PnL: <span style="color:${(holding.pnl_pct||0)>=0?'var(--em-green)':'var(--em-red)'}">${(holding.pnl_pct||0).toFixed(2)}%</span>
              </div>` : ''}
            <div style="display:flex;gap:8px">
              <button class="em-goldbtn" ${ceAct('cryptoOpenTradeModal', [coin.id,'buy'])} style="flex:1;padding:5px 0;font-size:10px">💰 Acquista</button>
              ${holding ? `<button class="em-redbtn" ${ceAct('cryptoOpenTradeModal', [coin.id,'sell'])} style="flex:1;padding:5px 0;font-size:10px">💵 Vendi</button>` : ''}
            </div>
          </div>`;
    }).join('');

    const offshoreJurisdictions = [
        { id: 'cayman',      name: 'Cayman Islands', icon: '🏝️', risk: '8%' },
        { id: 'switzerland', name: 'Svizzera',        icon: '🇨🇭', risk: '5%' },
        { id: 'dubai',       name: 'Dubai',           icon: '🇦🇪', risk: '6%' },
    ];

    const offshoreHtml = offshoreJurisdictions.map(j => {
        const acc       = offshore.find(o => o.jurisdiction === j.id);
        const depInputId = `off-dep-${j.id}`;
        const wdInputId  = `off-wd-${j.id}`;

        return `
          <div class="em-card" style="padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-size:13px;font-weight:700">${j.icon} ${j.name}</div>
              <span class="em-pill em-pill--gray">Rischio GdF: ${j.risk}</span>
            </div>
            ${acc ? `<div style="font-size:11px;color:var(--em-muted);margin-bottom:8px">💰 Saldo: <span style="font-family:monospace">€${acc.balance.toLocaleString()}</span></div>` : '<div style="font-size:10px;color:var(--em-muted);margin-bottom:8px">Conto non aperto</div>'}
            <div style="display:flex;gap:8px;margin-bottom:6px">
              <input id="${depInputId}" type="number" min="10000" step="10000" value="50000"
                style="flex:1;background:#0d1117;border:1px solid var(--em-line);border-radius:4px;padding:5px 8px;font-size:10px;color:var(--em-ink);outline:none" placeholder="€ deposito">
              <button class="em-goldbtn" ${ceAct('ceCryptoDeposit', [j.id, depInputId])} style="font-size:9px;white-space:nowrap">⬇️ Deposita</button>
            </div>
            ${acc && acc.balance > 0 ? `
            <div style="display:flex;gap:8px">
              <input id="${wdInputId}" type="number" min="1000" max="${acc.balance}" step="10000"
                style="flex:1;background:#0d1117;border:1px solid var(--em-line);border-radius:4px;padding:5px 8px;font-size:10px;color:var(--em-ink);outline:none" placeholder="€ prelievo">
              <button class="em-ghbtn" ${ceAct('ceCryptoWithdraw', [j.id, wdInputId])} style="font-size:9px;white-space:nowrap;color:var(--em-amber)">⬆️ Preleva</button>
            </div>` : ''}
          </div>`;
    }).join('');

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line);display:flex;align-items:flex-start;justify-content:space-between">
            <div>
                <div class="em-sec" style="margin-bottom:4px">Finanza Alternativa</div>
                <div style="font-size:20px;font-weight:800;margin-bottom:2px">Crypto &amp; Offshore</div>
                <div style="font-size:11px;color:var(--em-muted)">Portfolio €${Math.floor(portfolioValue).toLocaleString()} · Offshore €${offshoreTotal.toLocaleString()}</div>
            </div>
            <button class="em-ghbtn" ${ceAct('ceThen', ['cryptoRefresh', 'switchTab', 'crypto'])}>↻ Aggiorna</button>
        </div>

        <div class="em-kpis" style="margin-bottom:16px">
            <div class="em-kpi">
                <div class="l">Portfolio Crypto</div>
                <div class="v" style="color:${portfolioValue > 0 ? 'var(--em-gold)' : 'var(--em-muted)'}">€${Math.floor(portfolioValue/1000)}k</div>
            </div>
            <div class="em-kpi">
                <div class="l">Offshore</div>
                <div class="v" style="color:${offshoreTotal > 0 ? 'var(--em-green)' : 'var(--em-muted)'}">${offshoreTotal > 0 ? '€' + Math.floor(offshoreTotal/1000) + 'k' : '—'}</div>
            </div>
            <div class="em-kpi">
                <div class="l">Coin Detenute</div>
                <div class="v" style="color:${portfolio.length > 0 ? 'var(--em-blue)' : 'var(--em-muted)'}">${portfolio.length}</div>
            </div>
            <div class="em-kpi">
                <div class="l">Conti Aperti</div>
                <div class="v" style="color:var(--em-gold)">${offshore.filter(o => o.balance > 0).length}</div>
            </div>
        </div>

        <div class="em-sec" style="margin-bottom:10px">📈 Mercato Crypto</div>
        ${marketHtml}

        <div class="em-sec" style="margin-bottom:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--em-line)">🏦 Conti Offshore</div>
        <div style="font-size:10px;color:var(--em-muted);margin-bottom:12px">Fondi offshore non visibili al fisco. Prelievo soggetto a rischio sequestro GdF.</div>
        ${offshoreHtml}
    </div></div>`;
};

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

window.cryptoInit = async function() {
    await window.cryptoRefresh(true);
    _cryptoSubscribeRealtime();
};
