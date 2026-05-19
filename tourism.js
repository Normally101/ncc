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
    const colors = ['', 'text-green-400', 'text-blue-400', 'text-purple-400', 'text-yellow-300'];
    const labels = ['', 'STANDARD',       'BUSINESS',      'VIP',             'ULTRA'];
    const c = colors[tier] || 'text-gray-400';
    const l = labels[tier] || `T${tier}`;
    return `<span class="text-[7px] font-mono font-bold ${c} border border-current/30 px-1.5 py-0.5 rounded">${l}</span>`;
}

function _tBarColor(score) {
    return score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
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
    if (error) { showNotification(`Errore offerta: ${error.message}`, 'error'); return; }
    showNotification(`✅ Offerta inviata! Score: ${data.score}`, 'success');
    logToMap(`🌍 Offerta turismo inviata per "${tender.name}" — score ${data.score}`);
    await window.tourismRefresh(true);
    window.renderTabTourism();
};

window.tourismCancelBid = async function(tenderId) {
    if (!_tUid()) return;
    const { error } = await _tSb().rpc('rpc_cancel_tourism_bid', { v_tender_id: tenderId });
    if (error) { showNotification(`Errore: ${error.message}`, 'error'); return; }
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
    if (error) { showNotification(`Errore: ${error.message}`, 'error'); return; }

    if (!window.ServerState?.isReady()) {
        gameState.reputation = Math.max(0, (gameState.reputation || 0) - (data.rep_penalty || 0));
    }
    showBigEvent('⚠️', 'Contratto Rescisso',
        `Penale reputazione: −${(data.rep_penalty || 0).toFixed(2)}★\n\nIl bando tornerà disponibile dopo un periodo di cooldown.`);
    logToMap(`⚠️ Contratto turismo rescisso — penale −${(data.rep_penalty || 0).toFixed(2)}★`);
    await saveGame();
    updateUI();
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

    await saveGame();
    updateUI();
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

    let html = DS.header({
        eyebrow:  'Mercato · PvP',
        title:    'Bandi Turismo B2B',
        subtitle: myActive.length > 0
            ? `${myActive.length} contratto/i attivo/i · +€${totalDailyPayout.toLocaleString()}/giorno`
            : `${openCount} bandi aperti · Compete con altri operatori`,
        actions: myActive.length > 0 ? DS.pill(`${myActive.length} ATTIVO`, 'green', true) : '',
    }) + DS.kpiStrip([
        { label: 'Contratti Attivi', val: myActive.length  > 0 ? myActive.length  : '—', color: myActive.length > 0 ? 'green' : '' },
        { label: 'Entrate/Giorno',  val: totalDailyPayout > 0 ? `+€${totalDailyPayout.toLocaleString()}` : '—', color: totalDailyPayout > 0 ? 'green' : '' },
        { label: 'Offerte in Corsa', val: myBids.length   > 0 ? myBids.length     : '—', color: myBids.length > 0 ? 'gold' : '' },
        { label: 'Miglior Score',   val: bestScore !== null ? bestScore.toFixed(0) : '—', color: bestScore !== null && bestScore >= 70 ? 'green' : 'orange' },
    ]);

    if (!uid) {
        container.innerHTML = html + `<div class="text-[9px] text-gray-500 italic text-center mt-8">Accedi per partecipare ai bandi turismo.</div>`;
        return;
    }

    // ── SUB-TAB SWITCHER ──
    html += `
    <div class="flex gap-1 mb-4 border-b border-white/5 pb-2">
        <button onclick="window._tourismState._subTab='open'; window.renderTabTourism();"
            class="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded transition-all ${subTab === 'open'
                ? 'bg-gold text-black font-bold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'}">
            Bandi Aperti <span class="ml-1 opacity-60">${openCount}</span>
        </button>
        <button onclick="window._tourismState._subTab='mine'; window.renderTabTourism();"
            class="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest rounded transition-all ${subTab === 'mine'
                ? 'bg-gold text-black font-bold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'}">
            I Miei Contratti <span class="ml-1 opacity-60">${myActive.length}</span>
        </button>
        <button onclick="window.tourismRefresh(true).then(()=>window.renderTabTourism())"
            class="ml-auto px-2 py-1 text-[8px] text-gray-600 hover:text-gray-300 hover:bg-white/5 rounded transition-all" title="Aggiorna">
            ↺ Aggiorna
        </button>
    </div>`;

    html += subTab === 'open'
        ? _tRenderOpenBids(tenders, uid)
        : _tRenderMyContracts(myActive);

    container.innerHTML = html;
};

// ── OPEN BIDS ─────────────────────────────────────────────────────────────────

function _tRenderOpenBids(tenders, uid) {
    if (tenders.length === 0) {
        return `<div class="text-[9px] text-gray-600 italic text-center py-8">Caricamento bandi… clicca ↺ Aggiorna.</div>`;
    }

    const open     = tenders.filter(t => t.status === 'open_bidding');
    const active   = tenders.filter(t => t.status === 'active' && !t.is_mine);
    const cooldown = tenders.filter(t => t.status === 'cooldown');

    let html = '';

    if (open.length === 0) {
        html += `<div class="text-[9px] text-gray-500 italic text-center py-4 border border-white/5 rounded mb-4">Nessun bando aperto al momento.</div>`;
    } else {
        open.forEach(t => { html += _tRenderOpenCard(t); });
    }

    if (active.length > 0) {
        html += `<div class="text-[8px] text-gray-600 uppercase tracking-widest mt-5 mb-2 border-t border-white/5 pt-3">In Uso — ${active.length} contratto/i</div>`;
        active.forEach(t => { html += _tRenderLockedCard(t); });
    }

    if (cooldown.length > 0) {
        html += `<div class="text-[8px] text-gray-600 uppercase tracking-widest mt-4 mb-2 border-t border-white/5 pt-3">In Cooldown — ${cooldown.length}</div>`;
        cooldown.forEach(t => { html += _tRenderCooldownCard(t); });
    }

    return html;
}

function _tRenderOpenCard(t) {
    const req       = t.requirements || {};
    const reqTier   = req.req_tier          || 'standard';
    const reqCount  = req.req_vehicle_count || 0;
    const minRep    = req.min_reputation    || 0;
    const pledge    = window._tourismState._pledgeAmts[t.id] || 0;
    const sc        = _tPlayerScore(reqTier, reqCount, pledge);
    const reqs      = _tMeetsReqs(t);
    const hasBid    = t.my_bid_status === 'pending';
    const barColor  = _tBarColor(sc.total);
    const tierBadge = _tTierBadge(t.tier);
    const dailyPay  = t.daily_payout || (t.base_payout_per_hour || 0) * 16;

    return `
    <div class="hud-card mb-3${!reqs.ok && !hasBid ? ' opacity-60' : ''}">
        <div class="flex justify-between items-start mb-2">
            <div class="flex items-start gap-2 flex-1 min-w-0">
                <span class="text-xl leading-none mt-0.5 shrink-0">${t.icon || '✈️'}</span>
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-0.5">
                        <span class="text-[11px] font-bold text-white">${t.name}</span>
                        ${tierBadge}
                    </div>
                    <div class="text-[8px] text-gray-500 truncate">${t.company_type || ''} · ${t.clientele || ''}</div>
                    <div class="text-[8px] text-gray-600 italic mt-0.5 line-clamp-2">${t.lore || ''}</div>
                </div>
            </div>
            <div class="text-right ml-2 shrink-0">
                <div class="text-[10px] font-bold text-green-400 font-mono">+€${dailyPay.toLocaleString()}/g</div>
                <div class="text-[8px] text-gray-500">${t.duration_days || 14}g</div>
            </div>
        </div>

        <div class="flex flex-wrap gap-1 mb-2">
            <span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">${reqTier} ×${reqCount}</span>
            <span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">⭐ ${minRep}★</span>
            <span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">👥 ${t.bid_count || 0} offert${t.bid_count === 1 ? 'a' : 'e'}</span>
            <span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">⏱ ${_tCountdown(t.bidding_ends_at)}</span>
        </div>

        ${!reqs.ok && !hasBid ? `<div class="text-[8px] text-red-400 mb-2">🔒 ${reqs.reason}</div>` : ''}

        ${hasBid ? `
        <div class="flex items-center justify-between p-2 bg-green-950/30 border border-green-500/20 rounded mb-2">
            <div class="text-[9px] text-green-400">✅ Offerta inviata — Score: <strong>${(t.my_bid_score || 0).toFixed(1)}</strong> · Pledge: €${(t.my_bid_pledge || 0).toLocaleString()}</div>
            <button onclick="window.tourismCancelBid('${t.id}')"
                class="text-[7px] text-red-400 hover:text-red-300 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-950/30 transition-colors">
                Ritira
            </button>
        </div>
        ` : reqs.ok ? `
        <div class="border-t border-white/5 pt-2 mt-1">
            <div class="flex items-center justify-between mb-1">
                <span class="text-[8px] text-gray-500">Pledge (max €100k)</span>
                <span class="text-[8px] text-gold font-mono" id="t-pledge-val-${t.id}">€0</span>
            </div>
            <input type="range" min="0" max="100000" step="1000"
                value="${pledge}"
                class="w-full h-1 mb-2 accent-yellow-400 cursor-pointer"
                oninput="window._tSetPledge('${t.id}', this.value)">

            <div class="flex justify-between items-center mb-1">
                <div class="text-[8px] text-gray-600 font-mono space-x-2">
                    <span>REP <span id="t-sc-rep-${t.id}" class="text-gray-400">${sc.rep}</span></span>
                    <span>FLEET <span id="t-sc-fleet-${t.id}" class="text-gray-400">${sc.fleet}</span></span>
                    <span>PLEDGE <span id="t-sc-pledge-${t.id}" class="text-gray-400">${sc.pledge}</span></span>
                </div>
                <span class="text-[10px] font-bold font-mono" id="t-score-${t.id}" style="color:${barColor}">${sc.total}</span>
            </div>
            <div class="w-full h-1 bg-white/10 rounded-full mb-2">
                <div id="t-bar-${t.id}" class="h-1 rounded-full transition-all" style="width:${sc.total}%;background:${barColor}"></div>
            </div>

            <button onclick="window.tourismSubmitBid('${t.id}')"
                class="btn-gold w-full !text-[8px] !py-1.5">
                🌍 Fai Offerta
            </button>
        </div>
        ` : ''}
    </div>`;
}

function _tRenderLockedCard(t) {
    return `
    <div class="hud-card mb-2 opacity-40 !py-2">
        <div class="flex items-center gap-2">
            <span class="text-lg leading-none">${t.icon || '✈️'}</span>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[9px] font-bold text-white">${t.name}</span>
                    ${_tTierBadge(t.tier)}
                    <span class="text-[7px] font-mono text-gold border border-gold/30 px-1.5 py-0.5 rounded">IN USO</span>
                </div>
                <div class="text-[8px] text-gray-500">${t.owner_company_name || 'altro operatore'} · Scade: ${_tCountdown(t.expires_at)}</div>
            </div>
            <div class="text-[9px] font-mono text-gray-600 shrink-0">+€${(t.daily_payout || 0).toLocaleString()}/g</div>
        </div>
    </div>`;
}

function _tRenderCooldownCard(t) {
    return `
    <div class="hud-card mb-2 opacity-30 !py-2">
        <div class="flex items-center gap-2">
            <span class="text-lg leading-none">${t.icon || '✈️'}</span>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[9px] font-bold text-white">${t.name}</span>
                    ${_tTierBadge(t.tier)}
                    <span class="text-[7px] font-mono text-gray-500 border border-gray-600/30 px-1.5 py-0.5 rounded">COOLDOWN</span>
                </div>
                <div class="text-[8px] text-gray-600">Disponibile tra: ${_tCountdown(t.cooldown_until)}</div>
            </div>
        </div>
    </div>`;
}

// ── MY CONTRACTS ──────────────────────────────────────────────────────────────

function _tRenderMyContracts(myActive) {
    if (myActive.length === 0) {
        return `
        <div class="text-center py-8">
            <div class="text-3xl mb-3">🌍</div>
            <div class="text-[9px] text-gray-500">Nessun contratto turismo attivo.</div>
            <div class="text-[8px] text-gray-600 mt-1">Partecipa ai bandi aperti per iniziare a guadagnare.</div>
        </div>`;
    }

    return myActive.map(t => {
        const sla       = t.sla_score ?? 100;
        const slaColor  = sla >= 90 ? '#22c55e' : sla >= 70 ? '#f59e0b' : '#ef4444';
        const repPenalty = ((t.tier || 3) * 0.15).toFixed(2);

        return `
        <div class="hud-card mb-3 !border-gold/30 bg-gold/3">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-start gap-2">
                    <span class="text-2xl leading-none">${t.icon || '✈️'}</span>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap mb-0.5">
                            <span class="text-[11px] font-bold text-gold">${t.name}</span>
                            ${_tTierBadge(t.tier)}
                        </div>
                        <div class="text-[8px] text-gray-500">${t.company_type || ''}</div>
                        <div class="text-[8px] text-gray-600">Round #${t.round_number || 1}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] font-bold text-green-400 font-mono">+€${(t.daily_payout || 0).toLocaleString()}/g</div>
                    <div class="text-[8px] text-gray-500">Scade: ${_tCountdown(t.expires_at)}</div>
                    <div class="text-[8px] text-gray-600">Totale: €${(t.total_paid || 0).toLocaleString()}</div>
                </div>
            </div>

            <div class="mb-3">
                <div class="flex justify-between text-[8px] mb-0.5">
                    <span class="text-gray-500">SLA Score</span>
                    <span style="color:${slaColor}" class="font-mono font-bold">${Math.round(sla)}%</span>
                </div>
                <div class="w-full h-1 bg-white/10 rounded-full">
                    <div class="h-1 rounded-full transition-all" style="width:${Math.round(sla)}%;background:${slaColor}"></div>
                </div>
                <div class="text-[7px] text-gray-700 mt-0.5">SLA &lt; 50%: rescissione automatica</div>
            </div>

            <button onclick="window.tourismTerminate('${t.id}')"
                class="btn-gold !bg-red-900/30 !text-red-400 !text-[8px] w-full">
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
