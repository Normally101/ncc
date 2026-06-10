'use strict';
/* ============================================================
   tourism.js — Chauffeur Empire · Bandi B2B Turismo
   PvP competitive bidding for 21 luxury tourism companies
   Depends on: supabase-config.js, engine.js, dispatcher.js, design-system.js
   ============================================================ */

// ── STATE ─────────────────────────────────────────────────────────────────────

window._tourismState = {
    tenders:     [],
    _lastFetch:  0,
    _subTab:     'open',   // 'open' | 'mine'
    _pledgeAmts: {},       // tenderId → pledge value
    _loading:    false,
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

const _T_RANK = { standard: 1, business: 2, vip: 3, group: 3, ultra: 4 };

function _tSb()  { return window.supabaseClient; }
function _tUid() { return window.currentUser?.id || null; }

function _tQualifyingCount(reqTier) {
    const minRank = _T_RANK[reqTier] || 1;
    return (gameState.fleet || []).filter(c =>
        !c.outOfService && !c.isLease && (_T_RANK[c.tier] || 0) >= minRank
    ).length;
}

function _tPlayerScore(reqTier, reqCount, pledgeAmt) {
    const rep      = gameState.reputation || 0;
    const qv       = _tQualifyingCount(reqTier);
    const repSc    = Math.min(40, (rep / 5.0) * 40);
    const fleetSc  = Math.min(40, reqCount > 0 ? (qv / reqCount) * 40 : 40);
    const pledgeSc = Math.min(20, (pledgeAmt / 100000) * 20);
    return {
        total:      Math.round(repSc + fleetSc + pledgeSc),
        rep:        Math.round(repSc   * 10) / 10,
        fleet:      Math.round(fleetSc * 10) / 10,
        pledge:     Math.round(pledgeSc * 10) / 10,
        qualifying: qv,
    };
}

function _tMeetsReqs(t) {
    const req    = t.requirements || {};
    const rep    = gameState.reputation || 0;
    const minRep = req.min_reputation || 0;
    if (rep < minRep) return { ok: false, reason: `Reputazione insufficiente (serve ${minRep}★, hai ${rep.toFixed(1)}★)` };
    const reqTier  = req.req_tier           || 'standard';
    const reqCount = req.req_vehicle_count  || 0;
    const qv       = _tQualifyingCount(reqTier);
    if (qv < reqCount) return { ok: false, reason: `Veicoli insufficienti (servono ${reqCount} ${reqTier}, hai ${qv})` };
    return { ok: true };
}

function _tCountdown(isoStr) {
    if (!isoStr) return '—';
    const diff = new Date(isoStr) - Date.now();
    if (diff <= 0) return 'Scaduto';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 48) return `${Math.floor(h / 24)}g ${h % 24}h`;
    if (h >= 1)  return `${h}h ${m}m`;
    return `${m}m`;
}

function _tTierBadge(tier) {
    const palette = { 1: '#1aa06a', 2: '#2f74c0', 3: '#7c5fc9', 4: '#c79a2a' };
    const labels  = { 1: 'STANDARD', 2: 'BUSINESS', 3: 'VIP', 4: 'ULTRA' };
    const c = palette[tier] || '#6a7480';
    const l = labels[tier] || `T${tier}`;
    return `<span style="font-size:8px;font-family:monospace;font-weight:700;color:${c};border:1px solid ${c};border-radius:4px;padding:2px 5px">${l}</span>`;
}

function _tBarColor(score) {
    return score >= 80 ? '#1aa06a' : score >= 60 ? '#e0922e' : '#db5746';
}

// ── FETCH ─────────────────────────────────────────────────────────────────────

window.tourismRefresh = async function(force = false) {
    if (!_tSb()) return;
    const now = Date.now();
    if (!force && (now - window._tourismState._lastFetch) < 45000) return;
    window._tourismState._loading = true;
    const { data, error } = await _tSb().rpc('rpc_get_tourism_tenders');
    window._tourismState._loading = false;
    if (!error && data) {
        window._tourismState.tenders    = Array.isArray(data) ? data : [];
        window._tourismState._lastFetch = now;
    }
};

// ── ACTIONS ───────────────────────────────────────────────────────────────────

window.tourismSubmitBid = async function(tenderId) {
    if (!_tUid()) { showNotification('Devi essere loggato.', 'error'); return; }
    const tender = window._tourismState.tenders.find(t => t.id === tenderId);
    if (!tender) return;
    const req      = tender.requirements || {};
    const reqTier  = req.req_tier          || 'standard';
    const pledgeAmt = window._tourismState._pledgeAmts[tenderId] || 0;
    const qv       = _tQualifyingCount(reqTier);

    const { data, error } = await _tSb().rpc('rpc_submit_tourism_bid', {
        v_tender_id:           tenderId,
        v_qualifying_vehicles: qv,
        v_pledge_cash:         pledgeAmt,
    });
    if (error) { showNotification(window.CE_Sec.userError('Offerta non inviata', error), 'error'); return; }
    showNotification(`✅ Offerta inviata! Score: ${data.score}`, 'success');
    logToMap(`🌍 Offerta turismo inviata per "${tender.name}" — score ${data.score}`);
    await window.tourismRefresh(true);
    window.renderTabTourism();
};

window.tourismCancelBid = async function(tenderId) {
    if (!_tUid()) return;
    const { error } = await _tSb().rpc('rpc_cancel_tourism_bid', { v_tender_id: tenderId });
    if (error) { showNotification(window.CE_Sec.userError('Annullamento non riuscito', error), 'error'); return; }
    showNotification('Offerta annullata.', 'info');
    await window.tourismRefresh(true);
    window.renderTabTourism();
};

window.tourismTerminate = async function(tenderId) {
    if (!_tUid()) return;
    const tender    = window._tourismState.tenders.find(t => t.id === tenderId);
    const repPenalty = tender ? ((tender.tier || 3) * 0.15).toFixed(2) : '?';
    if (!confirm(`Terminare anticipatamente il contratto? Penale reputazione: −${repPenalty}★`)) return;

    const { data, error } = await _tSb().rpc('rpc_terminate_tourism_contract', { v_tender_id: tenderId });
    if (error) { showNotification(window.CE_Sec.userError('Terminazione non riuscita', error), 'error'); return; }

    if (!window.ServerState?.isReady()) {
        gameState.reputation = Math.max(0, (gameState.reputation || 0) - (data.rep_penalty || 0));
    }
    showBigEvent('⚠️', 'Contratto Rescisso',
        `Penale reputazione: −${(data.rep_penalty || 0).toFixed(2)}★\n\nIl bando tornerà disponibile dopo un periodo di cooldown.`);
    logToMap(`⚠️ Contratto turismo rescisso — penale −${(data.rep_penalty || 0).toFixed(2)}★`);
    saveGame();
    if (typeof updateUI === 'function') updateUI();
    await window.tourismRefresh(true);
    window.renderTabTourism();
};

// ── TICK GIORNALIERO (chiamato da processDailyRoutines in engine.js) ──────────

window._tourismDailyTick = async function() {
    if (!_tSb() || !_tUid()) return;
    const { data, error } = await _tSb().rpc('rpc_tourism_daily_tick');
    if (error || !data || !data.total_payout) return;

    if (!window.ServerState?.isReady()) {
        gameState.cash = (gameState.cash || 0) + data.total_payout;
    }

    const payouts = Array.isArray(data.payouts) ? data.payouts : [];
    if (payouts.length === 1) {
        const p = payouts[0];
        showNotification(`${p.icon} Turismo: +€${p.amount.toLocaleString()} da "${p.name}"`, 'success');
        logToMap(`🌍 Payout turismo: +€${p.amount.toLocaleString()} — "${p.name}"`);
    } else if (payouts.length > 1) {
        showNotification(`🌍 Turismo: +€${data.total_payout.toLocaleString()} da ${payouts.length} contratti`, 'success');
        payouts.forEach(p => logToMap(`🌍 Payout turismo: +€${p.amount.toLocaleString()} — "${p.name}"`));
    }

    if (data.expiring_soon > 0) {
        showNotification(`⏳ ${data.expiring_soon} contratto/i turismo in scadenza entro domani!`, 'warning');
    }

    saveGame();
    if (typeof updateUI === 'function') updateUI();
};

// ── LIVE SCORE PREVIEW ────────────────────────────────────────────────────────

window._tUpdateScorePreview = function(tenderId) {
    const tender = window._tourismState.tenders.find(t => t.id === tenderId);
    if (!tender) return;
    const req        = tender.requirements || {};
    const pledgeAmt  = window._tourismState._pledgeAmts[tenderId] || 0;
    const sc         = _tPlayerScore(req.req_tier || 'standard', req.req_vehicle_count || 0, pledgeAmt);
    const color      = _tBarColor(sc.total);

    const get = id => document.getElementById(id);
    const scoreEl  = get(`t-score-${tenderId}`);
    const barEl    = get(`t-bar-${tenderId}`);
    const valEl    = get(`t-pledge-val-${tenderId}`);
    const repEl    = get(`t-sc-rep-${tenderId}`);
    const fleetEl  = get(`t-sc-fleet-${tenderId}`);
    const pledgeEl = get(`t-sc-pledge-${tenderId}`);

    if (scoreEl)  { scoreEl.textContent = sc.total; scoreEl.style.color = color; }
    if (barEl)    { barEl.style.width = `${sc.total}%`; barEl.style.background = color; }
    if (valEl)    valEl.textContent    = `€${pledgeAmt.toLocaleString()}`;
    if (repEl)    repEl.textContent    = sc.rep;
    if (fleetEl)  fleetEl.textContent  = sc.fleet;
    if (pledgeEl) pledgeEl.textContent = sc.pledge;
};

window._tSetPledge = function(tenderId, val) {
    window._tourismState._pledgeAmts[tenderId] = Number(val);
    window._tUpdateScorePreview(tenderId);
};

// ── RENDER ────────────────────────────────────────────────────────────────────

window.renderTabTourism = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const uid     = _tUid();
    const tenders = window._tourismState.tenders || [];
    const subTab  = window._tourismState._subTab;

    const myActive         = tenders.filter(t => t.is_mine && t.status === 'active');
    const myBids           = tenders.filter(t => t.my_bid_status === 'pending');
    const totalDailyPayout = myActive.reduce((s, t) => s + (t.daily_payout || 0), 0);
    const openCount        = tenders.filter(t => t.status === 'open_bidding').length;
    const bestScore        = myBids.length > 0 ? Math.max(...myBids.map(t => t.my_bid_score || 0)) : null;

    let html = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Mercato · PvP</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Bandi Turismo B2B</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">${myActive.length > 0 ? `${myActive.length} contratto/i attivo/i · +€${totalDailyPayout.toLocaleString()}/giorno` : `${openCount} bandi aperti · Compete con altri operatori`}</div>
        </div>
        ${myActive.length > 0 ? `<span style="font-size:9px;font-weight:700;color:#1aa06a;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:3px 8px">${myActive.length} ATTIVO</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Contratti Attivi</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${myActive.length > 0 ? '#1aa06a' : '#1f2733'}">${myActive.length > 0 ? myActive.length : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Entrate/Giorno</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${totalDailyPayout > 0 ? '#1aa06a' : '#1f2733'}">${totalDailyPayout > 0 ? '+€' + totalDailyPayout.toLocaleString() : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Offerte in Corsa</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${myBids.length > 0 ? '#c79a2a' : '#1f2733'}">${myBids.length > 0 ? myBids.length : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Miglior Score</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${bestScore !== null && bestScore >= 70 ? '#1aa06a' : '#e0922e'}">${bestScore !== null ? bestScore.toFixed(0) : '—'}</div>
        </div>
    </div>`;

    if (!uid) {
        container.innerHTML = html + `<div style="font-size:9px;color:#6b7280;font-style:italic;text-align:center;margin-top:32px">Accedi per partecipare ai bandi turismo.</div>`;
        return;
    }

    // ── SUB-TAB SWITCHER ──
    html += `
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #21262d;padding-bottom:10px;align-items:center">
        <button onclick="window._tourismState._subTab='open'; window.renderTabTourism();"
            style="padding:5px 12px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;border-radius:4px;cursor:pointer;transition:all .15s;${subTab === 'open'
                ? 'background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;font-weight:700'
                : 'background:transparent;border:1px solid transparent;color:#6b7280'}">
            Bandi Aperti <span style="opacity:.6;margin-left:4px">${openCount}</span>
        </button>
        <button onclick="window._tourismState._subTab='mine'; window.renderTabTourism();"
            style="padding:5px 12px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;border-radius:4px;cursor:pointer;transition:all .15s;${subTab === 'mine'
                ? 'background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;font-weight:700'
                : 'background:transparent;border:1px solid transparent;color:#6b7280'}">
            I Miei Contratti <span style="opacity:.6;margin-left:4px">${myActive.length}</span>
        </button>
        <button onclick="window.tourismRefresh(true).then(()=>window.renderTabTourism())"
            style="margin-left:auto;padding:4px 8px;font-size:8px;color:#6b7280;background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;transition:all .15s"
            title="Aggiorna" onmouseenter="this.style.color='#6a7480'" onmouseleave="this.style.color='#6a7480'">
            ↺ Aggiorna
        </button>
    </div>`;

    html += subTab === 'open'
        ? _tRenderOpenBids(tenders, uid)
        : _tRenderMyContracts(myActive);

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
};

// ── OPEN BIDS ─────────────────────────────────────────────────────────────────

function _tRenderOpenBids(tenders, uid) {
    if (tenders.length === 0) {
        return `<div style="font-size:9px;color:#6b7280;font-style:italic;text-align:center;padding:32px 0">Caricamento bandi… clicca ↺ Aggiorna.</div>`;
    }

    const open     = tenders.filter(t => t.status === 'open_bidding');
    const active   = tenders.filter(t => t.status === 'active' && !t.is_mine);
    const cooldown = tenders.filter(t => t.status === 'cooldown');

    let html = '';

    if (open.length === 0) {
        html += `<div style="font-size:9px;color:#6b7280;font-style:italic;text-align:center;padding:16px;border:1px solid #21262d;border-radius:6px;margin-bottom:16px">Nessun bando aperto al momento.</div>`;
    } else {
        open.forEach(t => { html += _tRenderOpenCard(t); });
    }

    if (active.length > 0) {
        html += `<div style="font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin:20px 0 8px;padding-top:12px;border-top:1px solid #21262d">In Uso — ${active.length} contratto/i</div>`;
        active.forEach(t => { html += _tRenderLockedCard(t); });
    }

    if (cooldown.length > 0) {
        html += `<div style="font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin:16px 0 8px;padding-top:12px;border-top:1px solid #21262d">In Cooldown — ${cooldown.length}</div>`;
        cooldown.forEach(t => { html += _tRenderCooldownCard(t); });
    }

    return html;
}

function _tRenderOpenCard(t) {
    const req      = t.requirements || {};
    const reqTier  = req.req_tier          || 'standard';
    const reqCount = req.req_vehicle_count || 0;
    const minRep   = req.min_reputation    || 0;
    const pledge   = window._tourismState._pledgeAmts[t.id] || 0;
    const sc       = _tPlayerScore(reqTier, reqCount, pledge);
    const reqs     = _tMeetsReqs(t);
    const hasBid   = t.my_bid_status === 'pending';
    const barColor = _tBarColor(sc.total);
    const tierBadge= _tTierBadge(t.tier);
    const dailyPay = t.daily_payout || (t.base_payout_per_hour || 0) * 16;

    return `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:10px;${!reqs.ok && !hasBid ? 'opacity:.6' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;gap:8px;flex:1;min-width:0">
                <span style="font-size:20px;flex-shrink:0">${t.icon || '✈️'}</span>
                <div style="min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
                        <span style="font-size:11px;font-weight:700;color:#e6edf3">${t.name}</span>
                        ${tierBadge}
                    </div>
                    <div style="font-size:9px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.company_type || ''} · ${t.clientele || ''}</div>
                    <div style="font-size:9px;color:#6b7280;font-style:italic;margin-top:2px">${(t.lore || '').substring(0,80)}${(t.lore||'').length>80?'…':''}</div>
                </div>
            </div>
            <div style="text-align:right;margin-left:8px;flex-shrink:0">
                <div style="font-size:10px;font-weight:700;color:#1aa06a;font-family:monospace">+€${dailyPay.toLocaleString()}/g</div>
                <div style="font-size:8px;color:#6b7280">${t.duration_days || 14}g</div>
            </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
            <span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 5px;border-radius:4px;color:#6b7280">${reqTier} ×${reqCount}</span>
            <span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 5px;border-radius:4px;color:#6b7280">⭐ ${minRep}★</span>
            <span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 5px;border-radius:4px;color:#6b7280">👥 ${t.bid_count || 0} offert${t.bid_count === 1 ? 'a' : 'e'}</span>
            <span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 5px;border-radius:4px;color:#6b7280">⏱ ${_tCountdown(t.bidding_ends_at)}</span>
        </div>

        ${!reqs.ok && !hasBid ? `<div style="font-size:9px;color:#db5746;margin-bottom:8px">🔒 ${reqs.reason}</div>` : ''}

        ${hasBid ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(63,185,80,0.06);border:1px solid rgba(63,185,80,0.2);border-radius:4px;margin-bottom:6px">
            <div style="font-size:9px;color:#1aa06a">✅ Offerta inviata — Score: <strong>${(t.my_bid_score || 0).toFixed(1)}</strong> · Pledge: €${(t.my_bid_pledge || 0).toLocaleString()}</div>
            <button onclick="window.tourismCancelBid('${t.id}')"
                style="font-size:8px;color:#db5746;background:transparent;border:1px solid rgba(248,81,73,0.3);padding:2px 7px;border-radius:4px;cursor:pointer">
                Ritira
            </button>
        </div>
        ` : reqs.ok ? `
        <div style="border-top:1px solid #21262d;padding-top:10px;margin-top:4px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:8px;color:#6b7280">Pledge (max €100k)</span>
                <span style="font-size:8px;color:#c79a2a;font-family:monospace" id="t-pledge-val-${t.id}">€0</span>
            </div>
            <input type="range" min="0" max="100000" step="1000"
                value="${pledge}"
                style="width:100%;height:4px;margin-bottom:8px;cursor:pointer;accent-color:#c79a2a"
                oninput="window._tSetPledge('${t.id}', this.value)">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div style="font-size:8px;font-family:monospace;color:#6b7280">
                    REP <span id="t-sc-rep-${t.id}" style="color:#6b7280">${sc.rep}</span>
                    &nbsp;FLEET <span id="t-sc-fleet-${t.id}" style="color:#6b7280">${sc.fleet}</span>
                    &nbsp;PLEDGE <span id="t-sc-pledge-${t.id}" style="color:#6b7280">${sc.pledge}</span>
                </div>
                <span style="font-size:10px;font-weight:700;font-family:monospace;color:${barColor}" id="t-score-${t.id}">${sc.total}</span>
            </div>
            <div style="height:4px;border-radius:2px;background:#21262d;margin-bottom:8px">
                <div id="t-bar-${t.id}" style="height:100%;border-radius:2px;width:${sc.total}%;background:${barColor};transition:width .3s"></div>
            </div>

            <button onclick="window.tourismSubmitBid('${t.id}')"
                style="width:100%;padding:7px;font-size:9px;font-weight:700;cursor:pointer;background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                🌍 Fai Offerta
            </button>
        </div>
        ` : ''}
    </div>`;
}

function _tRenderLockedCard(t) {
    return `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 14px;margin-bottom:6px;opacity:.4">
        <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">${t.icon || '✈️'}</span>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-size:9px;font-weight:700;color:#e6edf3">${t.name}</span>
                    ${_tTierBadge(t.tier)}
                    <span style="font-size:7px;font-family:monospace;color:#c79a2a;border:1px solid rgba(212,175,55,0.3);padding:1px 5px;border-radius:4px">IN USO</span>
                </div>
                <div style="font-size:8px;color:#6b7280;margin-top:2px">${t.owner_company_name || 'altro operatore'} · Scade: ${_tCountdown(t.expires_at)}</div>
            </div>
            <div style="font-size:9px;font-family:monospace;color:#6b7280;flex-shrink:0">+€${(t.daily_payout || 0).toLocaleString()}/g</div>
        </div>
    </div>`;
}

function _tRenderCooldownCard(t) {
    return `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 14px;margin-bottom:6px;opacity:.3">
        <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">${t.icon || '✈️'}</span>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-size:9px;font-weight:700;color:#e6edf3">${t.name}</span>
                    ${_tTierBadge(t.tier)}
                    <span style="font-size:7px;font-family:monospace;color:#6b7280;border:1px solid rgba(107,114,128,0.3);padding:1px 5px;border-radius:4px">COOLDOWN</span>
                </div>
                <div style="font-size:8px;color:#6b7280;margin-top:2px">Disponibile tra: ${_tCountdown(t.cooldown_until)}</div>
            </div>
        </div>
    </div>`;
}

// ── MY CONTRACTS ──────────────────────────────────────────────────────────────

function _tRenderMyContracts(myActive) {
    if (myActive.length === 0) {
        return `
        <div style="text-align:center;padding:32px 0">
            <div style="font-size:32px;margin-bottom:10px">🌍</div>
            <div style="font-size:9px;color:#6b7280">Nessun contratto turismo attivo.</div>
            <div style="font-size:8px;color:#6b7280;margin-top:4px">Partecipa ai bandi aperti per iniziare a guadagnare.</div>
        </div>`;
    }

    return myActive.map(t => {
        const sla        = t.sla_score ?? 100;
        const slaColor   = sla >= 90 ? '#1aa06a' : sla >= 70 ? '#e0922e' : '#db5746';
        const repPenalty = ((t.tier || 3) * 0.15).toFixed(2);

        return `
        <div style="background:rgba(212,175,55,0.03);border:1px solid rgba(212,175,55,0.25);border-radius:6px;padding:14px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                <div style="display:flex;align-items:flex-start;gap:8px">
                    <span style="font-size:22px">${t.icon || '✈️'}</span>
                    <div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
                            <span style="font-size:11px;font-weight:700;color:#c79a2a">${t.name}</span>
                            ${_tTierBadge(t.tier)}
                        </div>
                        <div style="font-size:8px;color:#6b7280">${t.company_type || ''}</div>
                        <div style="font-size:8px;color:#6b7280">Round #${t.round_number || 1}</div>
                    </div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:10px;font-weight:700;color:#1aa06a;font-family:monospace">+€${(t.daily_payout || 0).toLocaleString()}/g</div>
                    <div style="font-size:8px;color:#6b7280;margin-top:2px">Scade: ${_tCountdown(t.expires_at)}</div>
                    <div style="font-size:8px;color:#6b7280">Totale: €${(t.total_paid || 0).toLocaleString()}</div>
                </div>
            </div>

            <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:4px">
                    <span style="color:#6b7280">SLA Score</span>
                    <span style="color:${slaColor};font-family:monospace;font-weight:700">${Math.round(sla)}%</span>
                </div>
                <div style="height:4px;border-radius:2px;background:#21262d">
                    <div style="height:100%;border-radius:2px;width:${Math.round(sla)}%;background:${slaColor};transition:width .3s"></div>
                </div>
                <div style="font-size:7px;color:#6b7280;margin-top:3px">SLA &lt; 50%: rescissione automatica</div>
            </div>

            <button onclick="window.tourismTerminate('${t.id}')"
                style="width:100%;padding:7px;font-size:9px;font-weight:700;cursor:pointer;background:#161b22;border:1px solid #f0c4bd;color:#db5746;border-radius:4px;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                ⚠️ Rescindi Anticipatamente (−${repPenalty}★ reputazione)
            </button>
        </div>`;
    }).join('');
}

// ── INIT ──────────────────────────────────────────────────────────────────────

window.tourismInit = async function() {
    if (!_tSb() || !_tUid()) return;
    await window.tourismRefresh();
    console.log('[Tourism] Modulo inizializzato.');
};
