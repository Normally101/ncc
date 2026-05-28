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
        BUSINESS:    { label: 'Business',     color: '#58a6ff',  bg: 'rgba(88,166,255,0.12)' },
        PREMIUM:     { label: 'Premium',      color: '#c084fc',  bg: 'rgba(192,132,252,0.12)' },
        PRESIDENTIAL:{ label: 'Presidential', color: '#f59e0b',  bg: 'rgba(245,158,11,0.12)' },
        ARMORED:     { label: 'Armored',      color: '#f85149',  bg: 'rgba(248,81,73,0.12)' },
        ULTRA:       { label: 'Ultra',        color: '#d4af37',  bg: 'rgba(212,175,55,0.12)' },
    };
    const t = map[tier] || { label: tier || '?', color: '#8b949e', bg: 'rgba(139,148,158,0.12)' };
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
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 w-80 max-w-full mx-4 shadow-2xl">
        <div class="flex justify-between items-start mb-3">
          <div>
            <div class="text-sm font-bold text-white">${auction.icon} ${auction.title}</div>
            ${isContainer ? '<div class="text-[10px] text-amber-400 mt-1">📦 Contenuto rivelato solo al vincitore</div>' : ''}
            ${auction.vehicle_data?.tier ? _tierBadge(auction.vehicle_data.tier) : ''}
          </div>
          <button onclick="document.getElementById('auction-bid-modal').remove()" class="text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div class="bg-white/5 rounded-lg p-3 mb-4 space-y-1 text-[11px]">
          <div class="flex justify-between"><span class="text-gray-400">Offerta minima</span><span class="text-white font-mono">${_fmtCurrency(auction.min_bid)}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Offerta più alta</span><span class="text-gold font-mono">${auction.top_bid ? _fmtCurrency(auction.top_bid) : '—'}</span></div>
          ${myBid ? `<div class="flex justify-between"><span class="text-gray-400">La tua offerta</span><span class="text-blue-300 font-mono">${_fmtCurrency(myBid)}</span></div>` : ''}
          <div class="flex justify-between"><span class="text-gray-400">Offerte totali</span><span class="text-white">${auction.bid_count || 0}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Scadenza</span><span class="text-red-300">${_countdown(auction.auction_ends_at)}</span></div>
        </div>

        <div class="mb-3">
          <label class="text-[10px] text-gray-400 mb-1 block">La tua offerta (min ${_fmtCurrency(minNext)})</label>
          <input id="bid-amount-input" type="number" min="${minNext}" step="1000"
            value="${Math.max(minNext, myBid ? myBid + 5000 : minNext)}"
            class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-gold outline-none" />
        </div>

        <div id="bid-error" class="text-red-400 text-[10px] mb-2 hidden"></div>

        <button id="bid-confirm-btn" onclick="window.auctionsConfirmBid('${auctionId}')"
          class="btn-gold w-full">
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
        errDiv.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Invio...';
    errDiv.classList.add('hidden');

    const result = await window.auctionsPlaceBid(auctionId, amount);
    if (result.error) {
        errDiv.textContent = result.error;
        errDiv.classList.remove('hidden');
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

    let contentHtml = '';
    if (won.lot_type === 'container') {
        const items = (won.container_data?.items || []);
        contentHtml = `
          <div class="text-amber-400 text-center text-2xl mb-2">📦 Contenuto Svelato!</div>
          <div class="space-y-2">
            ${items.map(item => {
                if (item.type === 'vehicle') {
                    return `<div class="bg-white/5 rounded p-2 text-[11px]">🚗 Veicolo ${item.tier} — Condizione ${item.condition}%</div>`;
                } else if (item.type === 'cash') {
                    return `<div class="bg-white/5 rounded p-2 text-[11px]">💰 Liquidità: ${_fmtCurrency(item.amount)}</div>`;
                }
                return `<div class="bg-white/5 rounded p-2 text-[11px]">📦 ${JSON.stringify(item)}</div>`;
            }).join('')}
          </div>`;
    } else if (won.lot_type === 'fleet_pack') {
        const vehicles = won.vehicle_data?.vehicles || [];
        contentHtml = `
          <div class="space-y-2">
            ${vehicles.map(v => `<div class="bg-white/5 rounded p-2 text-[11px]">🚗 ${v.tier} — Condizione ${v.condition}%</div>`).join('')}
          </div>`;
    } else {
        const vd = won.vehicle_data || {};
        contentHtml = `
          <div class="bg-white/5 rounded p-3 text-[11px] space-y-1">
            ${vd.tier ? `<div class="flex justify-between"><span class="text-gray-400">Tier</span>${_tierBadge(vd.tier)}</div>` : ''}
            ${vd.condition ? `<div class="flex justify-between"><span class="text-gray-400">Condizione</span><span class="text-white">${vd.condition}%</span></div>` : ''}
            ${vd.km ? `<div class="flex justify-between"><span class="text-gray-400">Chilometri</span><span class="text-white">${Number(vd.km).toLocaleString()} km</span></div>` : ''}
            ${vd.year ? `<div class="flex justify-between"><span class="text-gray-400">Anno</span><span class="text-white">${vd.year}</span></div>` : ''}
          </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'auction-won-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-[#1a1a2e] border border-gold/40 rounded-xl p-5 w-80 max-w-full mx-4 shadow-2xl">
        <div class="text-center mb-4">
          <div class="text-3xl mb-2">${won.icon}</div>
          <div class="text-sm font-bold text-gold">${won.title}</div>
          <div class="text-[10px] text-gray-400 mt-1">Aggiudicato per ${_fmtCurrency(won.winning_bid)}</div>
        </div>
        ${contentHtml}
        <button onclick="document.getElementById('auction-won-modal').remove()"
          class="btn-gold w-full mt-4">Chiudi</button>
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
            <div style="font-size:11px;font-weight:700;color:#d4af37;margin-bottom:10px">🏆 Aste Vinte — Da Ritirare</div>
            ${won.map(w => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#0d1117;border-radius:4px;padding:8px 12px;margin-bottom:6px">
                <div style="font-size:11px;color:#e6edf3">${w.icon} ${w.title}</div>
                <button onclick="window.auctionsRevealWon('${w.id}')"
                  style="padding:4px 10px;font-size:9px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;transition:opacity .15s"
                  onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">🎁 Ritira</button>
              </div>`).join('')}
          </div>`;
    }

    let auctionsHtml = '';
    if (auctions.length === 0) {
        auctionsHtml = `<div style="text-align:center;color:#8b949e;padding:40px 0;font-size:13px">Nessuna asta aperta al momento.<br><span style="font-size:10px">Torna più tardi per nuovi lotti giudiziari.</span></div>`;
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
              <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:10px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
                  <div>
                    <div style="font-size:13px;font-weight:700;color:#e6edf3">${a.icon} ${a.title}</div>
                    ${isContainer ? '<div style="font-size:10px;color:#f59e0b;margin-top:3px">📦 Contenuto sconosciuto</div>' : ''}
                    ${isFleetPack ? '<div style="font-size:10px;color:#58a6ff;margin-top:3px">🚐 Lotto multiplo</div>' : ''}
                    ${vd.tier ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px">${_tierBadge(vd.tier)}${vd.condition ? `<span style="font-size:9px;color:#8b949e">Condiz. ${vd.condition}%</span>` : ''}${vd.km ? `<span style="font-size:9px;color:#8b949e">${Number(vd.km).toLocaleString()} km</span>` : ''}</div>` : ''}
                  </div>
                  <div style="text-align:right;flex-shrink:0;margin-left:8px">
                    <div style="font-size:10px;color:${urgent ? '#f85149' : '#8b949e'}">⏱ ${ends}</div>
                    <div style="font-size:9px;color:#6b7280;margin-top:2px">${a.bid_count || 0} offerte</div>
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
                  <div style="background:#0d1117;border-radius:4px;padding:6px;text-align:center">
                    <div style="font-size:9px;color:#6b7280">Min</div>
                    <div style="font-size:10px;font-family:monospace;color:#e6edf3">${_fmtCurrency(a.min_bid)}</div>
                  </div>
                  <div style="background:#0d1117;border-radius:4px;padding:6px;text-align:center">
                    <div style="font-size:9px;color:#6b7280">Top bid</div>
                    <div style="font-size:10px;font-family:monospace;color:#d4af37">${topBid ? _fmtCurrency(topBid) : '—'}</div>
                  </div>
                  <div style="background:#0d1117;border-radius:4px;padding:6px;text-align:center">
                    <div style="font-size:9px;color:#6b7280">La tua</div>
                    <div style="font-size:10px;font-family:monospace;color:${isLeading ? '#3fb950' : isOutbid ? '#f85149' : '#6b7280'}">${myBid ? _fmtCurrency(myBid) : '—'}</div>
                  </div>
                </div>

                ${isOutbid ? '<div style="font-size:10px;color:#f85149;margin-bottom:8px">⚠️ Sei stato superato! Rilancia per vincere.</div>' : ''}
                ${isLeading ? '<div style="font-size:10px;color:#3fb950;margin-bottom:8px">✅ Sei in testa — mantieni la posizione.</div>' : ''}

                <button onclick="window.auctionsOpenBidModal('${a.id}')"
                  style="width:100%;padding:7px;font-size:11px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;transition:opacity .15s"
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
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">📋 Storico Offerte</div>
            ${myBids.slice(0, 10).map(b => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#161b22;border-radius:4px;padding:8px 12px;margin-bottom:6px;font-size:11px">
                <div>
                  <span style="color:#e6edf3">${b.auction_icon} ${b.auction_title}</span>
                  <span style="color:#8b949e;margin-left:8px">${b.auction_status === 'closed' ? (b.is_winner ? '✅ Vinta' : '❌ Persa') : b.auction_status === 'cancelled' ? '🚫 Annullata' : '🟡 Aperta'}</span>
                </div>
                <span style="color:#d4af37;font-family:monospace">${_fmtCurrency(b.amount)}</span>
              </div>`).join('')}
          </div>`;
    }

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Aste</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Aste Giudiziarie</div>
            <div style="font-size:11px;color:#8b949e;margin-top:4px">${auctions.length} lotti aperti · ${myBids.length} tue offerte · ${won.length > 0 ? won.length + ' da ritirare' : 'Nessun premio in attesa'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
            ${won.length > 0 ? `<span style="font-size:9px;font-weight:700;color:#d4af37;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:3px 8px">${won.length} Da Ritirare</span>` : ''}
            <button onclick="window.auctionsRefresh(true).then(()=>window.switchTab('auctions'))" style="background:#161b22;border:1px solid #21262d;color:#8b949e;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">↻ Aggiorna</button>
        </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Lotti Aperti</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${auctions.length > 0 ? '#58a6ff' : '#e6edf3'}">${auctions.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Tue Offerte</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${myBids.length > 0 ? '#d4af37' : '#e6edf3'}">${myBids.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Da Ritirare</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${won.length > 0 ? '#3fb950' : '#e6edf3'}">${won.length}</div>
        </div>
    </div>` + `<div class="p-1">
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
