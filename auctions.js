'use strict';
/* ================================================================
   auctions.js — Chauffeur Empire
   Espansione 7: Aste Giudiziarie (P2P Avanzato + container al buio)
   ================================================================ */

window._auctionsState = {
    auctions:    [],  // open auctions from rpc_get_judicial_auctions
    wonAuctions: [],  // won but not yet acknowledged
    myBids:      [],  // rpc_get_my_bids
    _lastFetch:  0,
    _sub:        null,
};

// ── HELPERS ──────────────────────────────────────────────────────────────────

function _aErr(prefix, err) {
    const email = (window.GAME_CONFIG || {}).SUPPORT_EMAIL || 'support@chauffeurempire.com';
    return `${prefix}: ${(err && err.message) || err || 'errore sconosciuto'} — ${email}`;
}

function _fmtCurrency(n) {
    if (!n && n !== 0) return '—';
    return '€' + Number(n).toLocaleString('it-IT');
}

function _countdown(endsAt) {
    const diff = new Date(endsAt) - Date.now();
    if (diff <= 0) return 'Scaduta';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (h > 48) return Math.floor(h / 24) + 'g ' + (h % 24) + 'h';
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

// Tier label + color
function _tierBadge(tier) {
    const map = {
        BUSINESS:    { label: 'Business',     color: '#2f74c0',  bg: 'rgba(88,166,255,0.12)' },
        PREMIUM:     { label: 'Premium',      color: '#7c5fc9',  bg: 'rgba(192,132,252,0.12)' },
        PRESIDENTIAL:{ label: 'Presidential', color: '#e0922e',  bg: 'rgba(245,158,11,0.12)' },
        ARMORED:     { label: 'Armored',      color: '#db5746',  bg: 'rgba(248,81,73,0.12)' },
        ULTRA:       { label: 'Ultra',        color: '#c79a2a',  bg: 'rgba(212,175,55,0.12)' },
    };
    const t = map[tier] || { label: tier || '?', color: '#6a7480', bg: 'rgba(139,148,158,0.12)' };
    return `<span style="font-size:9px;font-weight:700;color:${t.color};background:${t.bg};border:1px solid ${t.color};border-radius:4px;padding:2px 6px">${t.label}</span>`;
}

// ── DATA LAYER ────────────────────────────────────────────────────────────────

window.auctionsRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._auctionsState._lastFetch < 30000) return;
    window._auctionsState._lastFetch = now;

    const sb = window.supabaseClient;
    if (!sb) return;

    const [aRes, wRes, bRes] = await Promise.all([
        sb.rpc('rpc_get_judicial_auctions'),
        sb.rpc('rpc_get_won_auctions'),
        sb.rpc('rpc_get_my_bids'),
    ]);

    if (!aRes.error) window._auctionsState.auctions    = aRes.data || [];
    if (!wRes.error) window._auctionsState.wonAuctions = wRes.data || [];
    if (!bRes.error) window._auctionsState.myBids      = bRes.data || [];
};

window.auctionsPlaceBid = async function(auctionId, amount) {
    const sb = window.supabaseClient;
    if (!sb) return { error: 'Supabase non disponibile' };

    const { data, error } = await sb.rpc('rpc_place_auction_bid', {
        v_auction_id: auctionId,
        v_amount:     amount,
    });
    if (error) return { error: _aErr('Offerta fallita', error) };

    window._auctionsState._lastFetch = 0; // force refresh
    if (typeof window.auctionsRefresh === 'function') await window.auctionsRefresh(true);
    return { data };
};

// ── BID MODAL ─────────────────────────────────────────────────────────────────

window.auctionsOpenBidModal = function(auctionId) {
    const auction = window._auctionsState.auctions.find(a => a.id === auctionId);
    if (!auction) return;

    const isContainer = auction.lot_type === 'container';
    const minNext = Math.max(auction.min_bid, (auction.top_bid || 0) + 1);
    const myBid   = auction.my_bid;

    const existing = document.getElementById('auction-bid-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'auction-bid-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:8px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#1f2733">${auction.icon} ${auction.title}</div>
            ${isContainer ? '<div style="font-size:10px;color:#e0922e;margin-top:3px">📦 Contenuto rivelato solo al vincitore</div>' : ''}
            ${auction.vehicle_data?.tier ? `<div style="margin-top:6px">${_tierBadge(auction.vehicle_data.tier)}</div>` : ''}
          </div>
          <button onclick="document.getElementById('auction-bid-modal').remove()" style="background:transparent;border:none;color:#6a7480;font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">✕</button>
        </div>

        <div style="background:#f3f6f9;border:1px solid #d6dee8;border-radius:6px;padding:12px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">Offerta minima</span><span style="color:#1f2733;font-family:monospace">${_fmtCurrency(auction.min_bid)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">Offerta più alta</span><span style="color:#c79a2a;font-family:monospace">${auction.top_bid ? _fmtCurrency(auction.top_bid) : '—'}</span></div>
          ${myBid ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">La tua offerta</span><span style="color:#2f74c0;font-family:monospace">${_fmtCurrency(myBid)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">Offerte totali</span><span style="color:#1f2733">${auction.bid_count || 0}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#6a7480">Scadenza</span><span style="color:#db5746">${_countdown(auction.auction_ends_at)}</span></div>
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:10px;color:#6a7480;display:block;margin-bottom:4px">La tua offerta (min ${_fmtCurrency(minNext)})</label>
          <input id="bid-amount-input" type="number" min="${minNext}" step="1000"
            value="${Math.max(minNext, myBid ? myBid + 5000 : minNext)}"
            style="width:100%;background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:8px 10px;color:#1f2733;font-size:12px;outline:none;box-sizing:border-box" />
        </div>

        <div id="bid-error" style="color:#db5746;font-size:10px;margin-bottom:8px;display:none"></div>

        <button id="bid-confirm-btn" onclick="window.auctionsConfirmBid('${auctionId}')"
          style="width:100%;padding:9px;font-size:12px;font-weight:700;cursor:pointer;background:#fff8e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;transition:opacity .15s"
          onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
          🔨 Piazza Offerta
        </button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#bid-amount-input').focus();
};

window.auctionsConfirmBid = async function(auctionId) {
    const input = document.getElementById('bid-amount-input');
    const errDiv = document.getElementById('bid-error');
    const btn = document.getElementById('bid-confirm-btn');
    if (!input || !btn) return;

    const amount = parseInt(input.value, 10);
    if (!amount || amount <= 0) {
        errDiv.textContent = 'Inserisci un importo valido';
        errDiv.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Invio...';
    errDiv.style.display = 'none';

    const result = await window.auctionsPlaceBid(auctionId, amount);
    if (result.error) {
        errDiv.textContent = result.error;
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '🔨 Piazza Offerta';
        return;
    }

    document.getElementById('auction-bid-modal')?.remove();
    if (typeof showNotification === 'function') showNotification(`✅ Offerta di ${_fmtCurrency(amount)} registrata!`, 'success');
    if (typeof window.switchTab === 'function') window.switchTab('auctions');
};

// ── WON AUCTION REVEAL ────────────────────────────────────────────────────────

window.auctionsRevealWon = function(auctionId) {
    const won = window._auctionsState.wonAuctions.find(a => a.id === auctionId);
    if (!won) return;

    const existing = document.getElementById('auction-won-modal');
    if (existing) existing.remove();

    const _itemCard = s => `<div style="background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:8px 12px;font-size:11px;color:#1f2733;margin-bottom:4px">${s}</div>`;
    let contentHtml = '';
    if (won.lot_type === 'container') {
        const items = (won.container_data?.items || []);
        contentHtml = `
          <div style="font-size:22px;text-align:center;color:#e0922e;margin-bottom:8px">📦 Contenuto Svelato!</div>
          <div style="margin-bottom:12px">
            ${items.map(item => {
                if (item.type === 'vehicle') return _itemCard(`🚗 Veicolo ${item.tier} — Condizione ${item.condition}%`);
                if (item.type === 'cash')    return _itemCard(`💰 Liquidità: ${_fmtCurrency(item.amount)}`);
                return _itemCard(`📦 ${JSON.stringify(item)}`);
            }).join('')}
          </div>`;
    } else if (won.lot_type === 'fleet_pack') {
        const vehicles = won.vehicle_data?.vehicles || [];
        contentHtml = `<div style="margin-bottom:12px">${vehicles.map(v => _itemCard(`🚗 ${v.tier} — Condizione ${v.condition}%`)).join('')}</div>`;
    } else {
        const vd = won.vehicle_data || {};
        contentHtml = `
          <div style="background:#f3f6f9;border:1px solid #d6dee8;border-radius:6px;padding:12px;margin-bottom:12px">
            ${vd.tier ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">Tier</span>${_tierBadge(vd.tier)}</div>` : ''}
            ${vd.condition ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">Condizione</span><span style="color:#1f2733">${vd.condition}%</span></div>` : ''}
            ${vd.km ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6a7480">Chilometri</span><span style="color:#1f2733">${Number(vd.km).toLocaleString()} km</span></div>` : ''}
            ${vd.year ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#6a7480">Anno</span><span style="color:#1f2733">${vd.year}</span></div>` : ''}
          </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'auction-won-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#ffffff;border:1px solid rgba(212,175,55,0.35);border-radius:8px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:36px;margin-bottom:8px">${won.icon}</div>
          <div style="font-size:14px;font-weight:700;color:#c79a2a">${won.title}</div>
          <div style="font-size:10px;color:#6a7480;margin-top:4px">Aggiudicato per ${_fmtCurrency(won.winning_bid)}</div>
        </div>
        ${contentHtml}
        <button onclick="document.getElementById('auction-won-modal').remove()"
          style="width:100%;padding:9px;font-size:12px;font-weight:700;cursor:pointer;background:#fff8e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;transition:opacity .15s"
          onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Chiudi</button>
      </div>
    `;
    document.body.appendChild(modal);
};

// ── TAB RENDERER ──────────────────────────────────────────────────────────────

window.renderTabAuctions = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const state = window._auctionsState;
    const auctions = state.auctions;
    const won = state.wonAuctions;
    const myBids = state.myBids;

    let wonBanner = '';
    if (won.length > 0) {
        wonBanner = `
          <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:6px;padding:14px;margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:#c79a2a;margin-bottom:10px">🏆 Aste Vinte — Da Ritirare</div>
            ${won.map(w => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#f3f6f9;border-radius:4px;padding:8px 12px;margin-bottom:6px">
                <div style="font-size:11px;color:#1f2733">${w.icon} ${w.title}</div>
                <button onclick="window.auctionsRevealWon('${w.id}')"
                  style="padding:4px 10px;font-size:9px;font-weight:700;cursor:pointer;background:#fff8e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;transition:opacity .15s"
                  onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">🎁 Ritira</button>
              </div>`).join('')}
          </div>`;
    }

    let auctionsHtml = '';
    if (auctions.length === 0) {
        auctionsHtml = `<div style="text-align:center;color:#6a7480;padding:40px 0;font-size:13px">Nessuna asta aperta al momento.<br><span style="font-size:10px">Torna più tardi per nuovi lotti giudiziari.</span></div>`;
    } else {
        auctionsHtml = auctions.map(a => {
            const isContainer = a.lot_type === 'container';
            const isFleetPack = a.lot_type === 'fleet_pack';
            const vd = a.vehicle_data || {};
            const myBid = a.my_bid;
            const topBid = a.top_bid;
            const isLeading = myBid && topBid && myBid >= topBid;
            const isOutbid = myBid && topBid && myBid < topBid;
            const ends = _countdown(a.auction_ends_at);
            const urgent = new Date(a.auction_ends_at) - Date.now() < 3600000;

            return `
              <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px;margin-bottom:10px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
                  <div>
                    <div style="font-size:13px;font-weight:700;color:#1f2733">${a.icon} ${a.title}</div>
                    ${isContainer ? '<div style="font-size:10px;color:#e0922e;margin-top:3px">📦 Contenuto sconosciuto</div>' : ''}
                    ${isFleetPack ? '<div style="font-size:10px;color:#2f74c0;margin-top:3px">🚐 Lotto multiplo</div>' : ''}
                    ${vd.tier ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px">${_tierBadge(vd.tier)}${vd.condition ? `<span style="font-size:9px;color:#6a7480">Condiz. ${vd.condition}%</span>` : ''}${vd.km ? `<span style="font-size:9px;color:#6a7480">${Number(vd.km).toLocaleString()} km</span>` : ''}</div>` : ''}
                  </div>
                  <div style="text-align:right;flex-shrink:0;margin-left:8px">
                    <div style="font-size:10px;color:${urgent ? '#db5746' : '#6a7480'}">⏱ ${ends}</div>
                    <div style="font-size:9px;color:#6a7480;margin-top:2px">${a.bid_count || 0} offerte</div>
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
                  <div style="background:#f3f6f9;border-radius:4px;padding:6px;text-align:center">
                    <div style="font-size:9px;color:#6a7480">Min</div>
                    <div style="font-size:10px;font-family:monospace;color:#1f2733">${_fmtCurrency(a.min_bid)}</div>
                  </div>
                  <div style="background:#f3f6f9;border-radius:4px;padding:6px;text-align:center">
                    <div style="font-size:9px;color:#6a7480">Top bid</div>
                    <div style="font-size:10px;font-family:monospace;color:#c79a2a">${topBid ? _fmtCurrency(topBid) : '—'}</div>
                  </div>
                  <div style="background:#f3f6f9;border-radius:4px;padding:6px;text-align:center">
                    <div style="font-size:9px;color:#6a7480">La tua</div>
                    <div style="font-size:10px;font-family:monospace;color:${isLeading ? '#1aa06a' : isOutbid ? '#db5746' : '#6a7480'}">${myBid ? _fmtCurrency(myBid) : '—'}</div>
                  </div>
                </div>

                ${isOutbid ? '<div style="font-size:10px;color:#db5746;margin-bottom:8px">⚠️ Sei stato superato! Rilancia per vincere.</div>' : ''}
                ${isLeading ? '<div style="font-size:10px;color:#1aa06a;margin-bottom:8px">✅ Sei in testa — mantieni la posizione.</div>' : ''}

                <button onclick="window.auctionsOpenBidModal('${a.id}')"
                  style="width:100%;padding:7px;font-size:11px;font-weight:700;cursor:pointer;background:#fff8e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;transition:opacity .15s"
                  onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                  🔨 ${myBid ? 'Rilancia Offerta' : 'Fai Offerta'}
                </button>
              </div>`;
        }).join('');
    }

    let myBidsHtml = '';
    if (myBids.length > 0) {
        myBidsHtml = `
          <div style="margin-top:24px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">📋 Storico Offerte</div>
            ${myBids.slice(0, 10).map(b => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#ffffff;border-radius:4px;padding:8px 12px;margin-bottom:6px;font-size:11px">
                <div>
                  <span style="color:#1f2733">${b.auction_icon} ${b.auction_title}</span>
                  <span style="color:#6a7480;margin-left:8px">${b.auction_status === 'closed' ? (b.is_winner ? '✅ Vinta' : '❌ Persa') : b.auction_status === 'cancelled' ? '🚫 Annullata' : '🟡 Aperta'}</span>
                </div>
                <span style="color:#c79a2a;font-family:monospace">${_fmtCurrency(b.amount)}</span>
              </div>`).join('')}
          </div>`;
    }

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #d6dee8;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Aste</div>
            <div style="font-size:20px;font-weight:700;color:#1f2733">Aste Giudiziarie</div>
            <div style="font-size:11px;color:#6a7480;margin-top:4px">${auctions.length} lotti aperti · ${myBids.length} tue offerte · ${won.length > 0 ? won.length + ' da ritirare' : 'Nessun premio in attesa'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
            ${won.length > 0 ? `<span style="font-size:9px;font-weight:700;color:#c79a2a;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:3px 8px">${won.length} Da Ritirare</span>` : ''}
            <button onclick="window.auctionsRefresh(true).then(()=>window.switchTab('auctions'))" style="background:#ffffff;border:1px solid #d6dee8;color:#6a7480;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">↻ Aggiorna</button>
        </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Lotti Aperti</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${auctions.length > 0 ? '#2f74c0' : '#1f2733'}">${auctions.length}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Tue Offerte</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${myBids.length > 0 ? '#c79a2a' : '#1f2733'}">${myBids.length}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Da Ritirare</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${won.length > 0 ? '#1aa06a' : '#1f2733'}">${won.length}</div>
        </div>
    </div>` + `<div>
        ${wonBanner}
        ${auctionsHtml}
        ${myBidsHtml}
      </div>`;
};

// ── REALTIME ──────────────────────────────────────────────────────────────────

function _auctionsSubscribeRealtime() {
    const sb = window.supabaseClient;
    if (!sb || window._auctionsState._sub) return;

    window._auctionsState._sub = sb
        .channel('judicial_auctions_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'judicial_auctions' }, () => {
            window._auctionsState._lastFetch = 0;
            if (document.getElementById('tab-container') && typeof window.switchTab === 'function') {
                const activeTab = window._activeTab || '';
                if (activeTab === 'auctions') {
                    window.auctionsRefresh(true).then(() => window.renderTabAuctions());
                }
            }
        })
        .subscribe();
}

// ── INIT ──────────────────────────────────────────────────────────────────────

window.auctionsInit = async function() {
    await window.auctionsRefresh(true);
    _auctionsSubscribeRealtime();

    // Notify user of pending won auctions
    if (window._auctionsState.wonAuctions.length > 0) {
        if (typeof showNotification === 'function') {
            showNotification(`🏆 Hai ${window._auctionsState.wonAuctions.length} asta/e vinta/e da ritirare!`, 'info');
        }
    }
};
