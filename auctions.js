'use strict';
/* ================================================================
   auctions.js — Chauffeur Empire
   Espansione 7: Aste Giudiziarie (P2P Avanzato + container al buio)
   ================================================================ */

window._auctionsState = {
    auctions:    [],
    wonAuctions: [],
    myBids:      [],
    _lastFetch:  0,
    _sub:        null,
};

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

/* I lotti vecchi scrivono il tier in maiuscolo ('BUSINESS'), quelli generati
   dal server lo scrivono come il resto del gioco ('business'). Si normalizza
   qui invece di tenere due vocabolari vivi in due posti. */
function _tierBadge(tier) {
    const t = String(tier || '').toLowerCase();
    const cls = {
        standard:     'em-pill--gray',
        business:     'em-pill--blue',
        premium:      'em-pill--violet',
        vip:          'em-pill--gold',
        presidential: 'em-pill--gold',
        armored:      'em-pill--red',
        ultra:        'em-pill--gold',
    }[t] || 'em-pill--gray';
    const labels = {
        standard:'Standard', business:'Business', premium:'Premium', vip:'VIP',
        presidential:'Presidential', armored:'Armored', ultra:'Ultra',
    };
    return `<span class="em-pill ${cls}">${labels[t] || tier || '?'}</span>`;
}

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

    window._auctionsState._lastFetch = 0;
    if (typeof window.auctionsRefresh === 'function') await window.auctionsRefresh(true);
    return { data };
};

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
      <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:13px;font-weight:700;color:#e6edf3">${auction.icon} ${auction.title}</div>
            ${isContainer ? '<div style="font-size:10px;color:#e0922e;margin-top:3px">📦 Contenuto rivelato solo al vincitore</div>' : ''}
            ${auction.vehicle_data?.tier ? `<div style="margin-top:6px">${_tierBadge(auction.vehicle_data.tier)}</div>` : ''}
          </div>
          <button ${ceAct('ceRemove', ['auction-bid-modal'])} style="background:transparent;border:none;color:#6b7280;font-size:16px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">✕</button>
        </div>

        <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">Offerta minima</span><span style="color:#e6edf3;font-family:monospace">${_fmtCurrency(auction.min_bid)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">Offerta più alta</span><span style="color:#c79a2a;font-family:monospace">${auction.top_bid ? _fmtCurrency(auction.top_bid) : '—'}</span></div>
          ${myBid ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">La tua offerta</span><span style="color:#2f74c0;font-family:monospace">${_fmtCurrency(myBid)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">Offerte totali</span><span style="color:#e6edf3">${auction.bid_count || 0}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#6b7280">Scadenza</span><span style="color:#db5746">${_countdown(auction.auction_ends_at)}</span></div>
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:10px;color:#6b7280;display:block;margin-bottom:4px">La tua offerta (min ${_fmtCurrency(minNext)})</label>
          <input id="bid-amount-input" type="number" min="${minNext}" step="1000"
            value="${Math.max(minNext, myBid ? myBid + 5000 : minNext)}"
            style="width:100%;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:8px 10px;color:#e6edf3;font-size:12px;outline:none;box-sizing:border-box" />
        </div>

        <div id="bid-error" style="color:#db5746;font-size:10px;margin-bottom:8px;display:none"></div>

        <button id="bid-confirm-btn" ${ceAct('auctionsConfirmBid', [auctionId])}
          style="width:100%;padding:9px;font-size:12px;font-weight:700;cursor:pointer;background:linear-gradient(180deg,#e3b441,#c79a2a);color:#fff;border:none;border-radius:7px;box-shadow:0 2px 5px rgba(199,154,42,.24)">
          🔨 Piazza Offerta
        </button>
      </div>`;
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

/* ── Dal lotto vinto all'auto in garage ──────────────────────────────────────
   Il server decide la parte economica del lotto — tier, condizione, chilometri
   — e non il modello preciso, perche' il catalogo delle auto vive in data.js e
   deve restare scritto in un posto solo. Qui si sceglie un'auto vera di quel
   tier e le si applica lo stato del lotto. */
function _autoDalLotto(datiVeicolo) {
    const dati = datiVeicolo || {};
    const tier = String(dati.tier || 'business').toLowerCase();

    const catalogo = [
        ...(typeof USED_CARS !== 'undefined' ? USED_CARS : []),
        ...(typeof NEW_CARS  !== 'undefined' ? NEW_CARS  : []),
    ];
    // I lotti piu' vecchi portano gia' un vehicleClass: in quel caso comanda lui.
    const candidati = dati.vehicleClass
        ? catalogo.filter(c => c.vehicleClass === dati.vehicleClass)
        : catalogo.filter(c => c.tier === tier);
    const modello = (candidati.length ? candidati : catalogo)[
        Math.floor(Math.random() * (candidati.length || catalogo.length || 1))
    ];
    if (!modello) return null;

    return {
        id:           'c_ast_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name:         `${modello.name} (Asta)`,
        tier:         modello.tier,
        vehicleClass: modello.vehicleClass,
        condition:    Math.max(10, Math.min(100, Number(dati.condition) || 60)),
        isLease:      false,
        fuel:         60,
        mileage:      Number(dati.km) || 0,
        tirePressure: 80,
        engineHealth: Math.max(30, Math.min(100, Number(dati.condition) || 60)),
        outOfService: null,
        upgrades:     [],
    };
}

/**
 * Riscuote un lotto vinto: e' il momento in cui il giocatore riceve davvero
 * qualcosa. Prima di questa funzione la schermata "hai vinto" era solo una
 * schermata — il veicolo non entrava in flotta e il denaro del container non
 * arrivava mai, quindi si pagava l'aggiudicazione e non si riceveva niente.
 *
 * Il denaro lo accredita il server dentro `rpc_claim_auction`; qui si allinea
 * solo la previsione locale. Il veicolo invece nasce qui, perche' e' qui che
 * la flotta vive.
 */
window.auctionsClaim = async function(auctionId) {
    const sb = window.supabaseClient;
    if (!sb) return { error: 'Supabase non disponibile' };

    const { data, error } = await sb.rpc('rpc_claim_auction', { v_auction_id: auctionId });
    if (error) return { error: _aErr('Ritiro fallito', error) };

    const nuove = [];
    const contanti = Number(data?.cash_accreditato) || 0;
    if (contanti > 0 && window.CE_money) {
        window.CE_money.accreditatoDalServer(contanti, 'asta giudiziaria');
    }

    if (data?.lot_type === 'container') {
        for (const item of (data.container_data?.items || [])) {
            if (item?.type !== 'vehicle') continue;
            const auto = _autoDalLotto(item);
            if (auto) { window.gameState?.fleet?.push(auto); nuove.push(auto); }
        }
    } else {
        const auto = _autoDalLotto(data?.vehicle_data);
        if (auto) { window.gameState?.fleet?.push(auto); nuove.push(auto); }
    }

    // Il lotto e' riscosso: non deve piu' comparire fra quelli da ritirare.
    window._auctionsState.wonAuctions =
        window._auctionsState.wonAuctions.filter(a => a.id !== auctionId);
    if (typeof window.saveGame === 'function') window.saveGame();
    if (typeof window.updateUI === 'function') window.updateUI();

    return { data, veicoli: nuove, contanti };
};

window.auctionsRevealWon = async function(auctionId) {
    const won = window._auctionsState.wonAuctions.find(a => a.id === auctionId);
    if (!won) return;

    const esito = await window.auctionsClaim(auctionId);
    if (esito.error) {
        if (typeof showNotification === 'function') showNotification(esito.error, 'error');
        return;
    }

    const existing = document.getElementById('auction-won-modal');
    if (existing) existing.remove();

    const _itemCard = s => `<div style="background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:8px 12px;font-size:11px;color:#e6edf3;margin-bottom:4px">${s}</div>`;
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
          <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:12px;margin-bottom:12px">
            ${vd.tier ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">Tier</span>${_tierBadge(vd.tier)}</div>` : ''}
            ${vd.condition ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">Condizione</span><span style="color:#e6edf3">${vd.condition}%</span></div>` : ''}
            ${vd.km ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:#6b7280">Chilometri</span><span style="color:#e6edf3">${Number(vd.km).toLocaleString()} km</span></div>` : ''}
            ${vd.year ? `<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#6b7280">Anno</span><span style="color:#e6edf3">${vd.year}</span></div>` : ''}
          </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'auction-won-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#161b22;border:1px solid rgba(212,175,55,0.35);border-radius:8px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:36px;margin-bottom:8px">${won.icon}</div>
          <div style="font-size:14px;font-weight:700;color:#c79a2a">${won.title}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:4px">Aggiudicato per ${_fmtCurrency(won.winning_bid)}</div>
        </div>
        ${contentHtml}
        <button ${ceAct('ceRemove', ['auction-won-modal'])}
          style="width:100%;padding:9px;font-size:12px;font-weight:700;cursor:pointer;background:linear-gradient(180deg,#e3b441,#c79a2a);color:#fff;border:none;border-radius:7px;box-shadow:0 2px 5px rgba(199,154,42,.24)">
          Chiudi
        </button>
      </div>`;
    document.body.appendChild(modal);
};

window.renderTabAuctions = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const state    = window._auctionsState;
    const auctions = state.auctions;
    const won      = state.wonAuctions;
    const myBids   = state.myBids;

    const wonBanner = won.length > 0 ? `
        <div class="em-card" style="padding:14px;margin-bottom:16px;border-color:rgba(199,154,42,.35)">
            <div style="font-size:11px;font-weight:700;color:var(--em-gold);margin-bottom:10px">🏆 Aste Vinte — Da Ritirare</div>
            ${won.map(w => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:#0d1117;border-radius:4px;padding:8px 12px;margin-bottom:6px">
                <div style="font-size:11px;color:var(--em-ink)">${w.icon} ${w.title}</div>
                <button class="em-goldbtn" ${ceAct('auctionsRevealWon', [w.id])} style="font-size:9px;padding:4px 10px">🎁 Ritira</button>
              </div>`).join('')}
        </div>` : '';

    const auctionsHtml = auctions.length === 0
        ? `<div class="em-empty">Nessuna asta aperta al momento.<br><span style="font-size:10px">Torna più tardi per nuovi lotti giudiziari.</span></div>`
        : auctions.map(a => {
            const isContainer = a.lot_type === 'container';
            const isFleetPack = a.lot_type === 'fleet_pack';
            const vd       = a.vehicle_data || {};
            const myBid    = a.my_bid;
            const topBid   = a.top_bid;
            const isLeading = myBid && topBid && myBid >= topBid;
            const isOutbid  = myBid && topBid && myBid < topBid;
            const ends     = _countdown(a.auction_ends_at);
            const urgent   = new Date(a.auction_ends_at) - Date.now() < 3600000;

            return `
              <div class="em-card" style="padding:14px;margin-bottom:10px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
                  <div>
                    <div style="font-size:13px;font-weight:700;margin-bottom:3px">${a.icon} ${a.title}</div>
                    ${isContainer ? '<div style="font-size:10px;color:var(--em-amber);margin-top:3px">📦 Contenuto sconosciuto</div>' : ''}
                    ${isFleetPack ? '<div style="font-size:10px;color:var(--em-blue);margin-top:3px">🚐 Lotto multiplo</div>' : ''}
                    ${vd.tier ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px">${_tierBadge(vd.tier)}${vd.condition ? `<span style="font-size:9px;color:var(--em-muted)">Condiz. ${vd.condition}%</span>` : ''}${vd.km ? `<span style="font-size:9px;color:var(--em-muted)">${Number(vd.km).toLocaleString()} km</span>` : ''}</div>` : ''}
                  </div>
                  <div style="text-align:right;flex-shrink:0;margin-left:8px">
                    <div style="font-size:10px;color:${urgent ? 'var(--em-red)' : 'var(--em-muted)'}">⏱ ${ends}</div>
                    <div style="font-size:9px;color:var(--em-muted);margin-top:2px">${a.bid_count || 0} offerte</div>
                  </div>
                </div>

                <div class="em-kpibar" style="margin-bottom:10px">
                  <div class="k" style="text-align:center">
                    <div class="l">Min</div>
                    <div class="v" style="font-size:10px;font-family:monospace">${_fmtCurrency(a.min_bid)}</div>
                  </div>
                  <div class="k" style="text-align:center">
                    <div class="l">Top bid</div>
                    <div class="v" style="font-size:10px;font-family:monospace;color:var(--em-gold)">${topBid ? _fmtCurrency(topBid) : '—'}</div>
                  </div>
                  <div class="k" style="text-align:center">
                    <div class="l">La tua</div>
                    <div class="v" style="font-size:10px;font-family:monospace;color:${isLeading ? 'var(--em-green)' : isOutbid ? 'var(--em-red)' : 'var(--em-muted)'}">${myBid ? _fmtCurrency(myBid) : '—'}</div>
                  </div>
                </div>

                ${isOutbid ? '<div style="font-size:10px;color:var(--em-red);margin-bottom:8px">⚠️ Sei stato superato! Rilancia per vincere.</div>' : ''}
                ${isLeading ? '<div style="font-size:10px;color:var(--em-green);margin-bottom:8px">✅ Sei in testa — mantieni la posizione.</div>' : ''}

                <button class="em-goldbtn" ${ceAct('auctionsOpenBidModal', [a.id])} style="width:100%">
                  🔨 ${myBid ? 'Rilancia Offerta' : 'Fai Offerta'}
                </button>
              </div>`;
        }).join('');

    const myBidsHtml = myBids.length > 0 ? `
        <div style="margin-top:16px">
            <div class="em-sec" style="margin-bottom:10px">📋 Storico Offerte</div>
            <div class="em-card">
              ${myBids.slice(0, 10).map(b => `
                <div class="em-lrow" style="font-size:10px">
                  <div style="flex:1">
                    <span>${b.auction_icon} ${b.auction_title}</span>
                    <span style="color:var(--em-muted);margin-left:8px">${b.auction_status === 'closed' ? (b.is_winner ? '✅ Vinta' : '❌ Persa') : b.auction_status === 'cancelled' ? '🚫 Annullata' : '🟡 Aperta'}</span>
                  </div>
                  <span style="color:var(--em-gold);font-family:monospace">${_fmtCurrency(b.amount)}</span>
                </div>`).join('')}
            </div>
        </div>` : '';

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line);display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
                <div class="em-sec" style="margin-bottom:4px">Aste</div>
                <div style="font-size:20px;font-weight:800;margin-bottom:2px">Aste Giudiziarie</div>
                <div style="font-size:11px;color:var(--em-muted)">${auctions.length} lotti aperti · ${myBids.length} tue offerte · ${won.length > 0 ? won.length + ' da ritirare' : 'Nessun premio in attesa'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                ${won.length > 0 ? `<span class="em-pill em-pill--gold">${won.length} Da Ritirare</span>` : ''}
                <button class="em-ghbtn" ${ceAct('ceThen', ['auctionsRefresh', 'switchTab', 'auctions'])}>↻ Aggiorna</button>
            </div>
        </div>

        <div class="em-kpis" style="margin-bottom:16px">
            <div class="em-kpi">
                <div class="l">Lotti Aperti</div>
                <div class="v" style="color:${auctions.length > 0 ? 'var(--em-blue)' : 'var(--em-muted)'}">${auctions.length}</div>
            </div>
            <div class="em-kpi">
                <div class="l">Tue Offerte</div>
                <div class="v" style="color:${myBids.length > 0 ? 'var(--em-gold)' : 'var(--em-muted)'}">${myBids.length}</div>
            </div>
            <div class="em-kpi">
                <div class="l">Da Ritirare</div>
                <div class="v" style="color:${won.length > 0 ? 'var(--em-green)' : 'var(--em-muted)'}">${won.length}</div>
            </div>
            <div class="em-kpi">
                <div class="l">Attive in Top</div>
                <div class="v" style="color:var(--em-gold)">${auctions.filter(a => a.my_bid && a.top_bid && a.my_bid >= a.top_bid).length}</div>
            </div>
        </div>

        ${wonBanner}
        ${auctionsHtml}
        ${myBidsHtml}
    </div></div>`;
};

function _auctionsSubscribeRealtime() {
    const sb = window.supabaseClient;
    if (!sb || window._auctionsState._sub) return;

    window._auctionsState._sub = sb
        .channel('judicial_auctions_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'judicial_auctions' }, () => {
            window._auctionsState._lastFetch = 0;
            if (document.getElementById('tab-container') && typeof window.switchTab === 'function') {
                if ((window._activeTab || '') === 'auctions') {
                    window.auctionsRefresh(true).then(() => window.renderTabAuctions());
                }
            }
        })
        .subscribe();
}

window.auctionsInit = async function() {
    await window.auctionsRefresh(true);
    _auctionsSubscribeRealtime();

    if (window._auctionsState.wonAuctions.length > 0) {
        if (typeof showNotification === 'function') {
            showNotification(`🏆 Hai ${window._auctionsState.wonAuctions.length} asta/e vinta/e da ritirare!`, 'info');
        }
    }
};
