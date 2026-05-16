'use strict';
/* ============================================================
   b2b.js — Chauffeur Empire · Contratti Corporate B2B
   Dipende da: supabase-config.js, engine.js, dispatcher.js
   ============================================================ */

// ── STATO LOCALE ──────────────────────────────────────────────────────────────

window._b2bState = {
    contracts:      [],   // contratti disponibili dal server
    activeContract: null, // contratto attivo del giocatore
    _lastFetch:     0,
};

const _TIER_ORDER = ['BUSINESS', 'PREMIUM', 'PRESIDENTIAL', 'ARMORED', 'ULTRA'];
const _TIER_LABEL = {
    BUSINESS:     '🟢 Business',
    PREMIUM:      '🔵 Premium',
    PRESIDENTIAL: '🟡 Presidential',
    ARMORED:      '🔴 Armored',
    ULTRA:        '💎 Ultra',
};

function _sb()  { return window.supabaseClient; }
function _uid() { return window.currentUser?.id || null; }

// ── FETCH ─────────────────────────────────────────────────────────────────────

async function _b2bFetchContracts() {
    if (!_sb()) return;
    const { data, error } = await _sb().rpc('rpc_get_b2b_contracts');
    if (!error && data) window._b2bState.contracts = data;
}

async function _b2bFetchActive() {
    if (!_sb() || !_uid()) return;
    const { data, error } = await _sb()
        .from('b2b_active_contracts')
        .select('*')
        .eq('user_id', _uid())
        .eq('status', 'active')
        .maybeSingle();
    if (!error) window._b2bState.activeContract = data || null;
}

window.b2bRefresh = async function() {
    await Promise.all([_b2bFetchContracts(), _b2bFetchActive()]);
    window._b2bState._lastFetch = Date.now();
};

// ── LOCKED VEHICLES (filtro per dispatch) ────────────────────────────────────

window.b2bLockedVehicleIds = function() {
    const ac = window._b2bState.activeContract;
    if (!ac || ac.status !== 'active') return [];
    try { return JSON.parse(typeof ac.locked_vehicles === 'string' ? ac.locked_vehicles : JSON.stringify(ac.locked_vehicles)) || []; }
    catch { return []; }
};

window.b2bLockedDriverIds = function() {
    const ac = window._b2bState.activeContract;
    if (!ac || ac.status !== 'active') return [];
    try { return JSON.parse(typeof ac.locked_drivers === 'string' ? ac.locked_drivers : JSON.stringify(ac.locked_drivers)) || []; }
    catch { return []; }
};

// ── AZIONI ────────────────────────────────────────────────────────────────────

window.b2bAcceptContract = async function(contractId, vehicleIds, driverIds) {
    if (!_uid()) { showNotification('Devi essere loggato.', 'error'); return; }

    const { data, error } = await _sb().rpc('rpc_accept_b2b_contract', {
        v_contract_id: contractId,
        v_vehicle_ids: vehicleIds,
        v_driver_ids:  driverIds,
    });

    if (error) {
        const se = (window.GAME_CONFIG||{}).SUPPORT_EMAIL||'support@chauffeurempire.com';
        showNotification(`Contratto non accettato: ${error.message} — Se il problema persiste scrivi a ${se}`, 'error');
        return;
    }

    window._b2bState.activeContract = {
        id:             data.id,
        daily_payout:   data.daily_payout,
        days_remaining: data.days_remaining,
        days_total:     data.duration_days || data.days_remaining,
        contract_title: data.title,
        contract_client: data.client,
        contract_icon:  data.icon || '💼',
        penalty_amount:  data.penalty,
        sla_score:      100,
        status:         'active',
    };
    await saveGame();

    showNotification(`✅ Contratto "${data.title}" accettato! +€${data.daily_payout.toLocaleString()}/giorno.`, 'success');
    logToMap(`💼 Appalto corporate firmato: "${data.title}" — €${data.daily_payout.toLocaleString()}/g per ${data.days_remaining} giorni.`);
    if (typeof renderTabB2B === 'function') renderTabB2B();
};

window.b2bTerminateContract = async function(activeId) {
    if (!_uid()) return;
    if (!confirm('Terminare anticipatamente il contratto? Pagherai la penale e perderai reputazione.')) return;

    const { data, error } = await _sb().rpc('rpc_terminate_b2b_contract', {
        v_active_id: activeId,
    });

    if (error) {
        const se = (window.GAME_CONFIG||{}).SUPPORT_EMAIL||'support@chauffeurempire.com';
        showNotification(`Errore terminazione: ${error.message} — Se il problema persiste scrivi a ${se}`, 'error');
        return;
    }

    if (!window.ServerState?.isReady()) {
        gameState.cash = Math.max(0, (gameState.cash||0) - data.penalty);
        gameState.reputation = Math.max(0, (gameState.reputation||0) - data.rep_penalty);
    }
    await saveGame();
    window._b2bState.activeContract = null;

    showBigEvent('⚠️', 'Contratto Rescisso',
        `Penale pagata: −€${data.penalty.toLocaleString()}\nReputazione: −${data.rep_penalty}★\n\nIl cliente ha revocato il rapporto commerciale.`);
    logToMap(`⚠️ Contratto B2B rescisso. Penale −€${data.penalty.toLocaleString()}`);
    updateUI();
    if (typeof renderTabB2B === 'function') renderTabB2B();
};

// ── TICK GIORNALIERO (chiamato da processDailyRoutines in engine.js) ──────────

window._b2bDailyTick = async function() {
    if (!_sb() || !_uid()) return;
    const { data, error } = await _sb().rpc('rpc_b2b_daily_tick');
    if (error || !data) return;

    if (!window.ServerState?.isReady()) {
        gameState.cash = (gameState.cash||0) + data.payout;
    }

    if (data.completed) {
        window._b2bState.activeContract = null;
        showBigEvent('💼', 'Contratto Completato!',
            `"${data.title}"\n\n✅ SLA rispettato al 100%.\nBonus reputazione: +${data.rep_bonus}★\n\nEseguita la consegna finale. Il cliente è soddisfatto.`);
        logToMap(`💼 Appalto B2B completato: "${data.title}" — +${data.rep_bonus}★ reputazione`);
        if (!window.ServerState?.isReady()) {
            gameState.reputation = Math.min(5.0, (gameState.reputation||0) + (data.rep_bonus||0));
        }
    } else if (data.payout > 0) {
        showNotification(`💼 B2B: +€${data.payout.toLocaleString()} da "${data.title}" (${data.days_remaining}g rim.)`, 'success');
        logToMap(`💼 Payout B2B: +€${data.payout.toLocaleString()} — ${data.days_remaining} giorni rimanenti`);
        if (window._b2bState.activeContract) {
            window._b2bState.activeContract.days_remaining = data.days_remaining;
        }
    }

    await saveGame();
    updateUI();
    if (typeof renderTabB2B === 'function') renderTabB2B();
};

// ── MODAL SELEZIONE VEICOLI ───────────────────────────────────────────────────

window.b2bOpenAcceptModal = function(contractId) {
    const contract = window._b2bState.contracts.find(c => c.id === contractId);
    if (!contract) return;

    const tierIndex  = _TIER_ORDER.indexOf(contract.required_tier);
    const eligibleCars = (gameState.fleet||[]).filter(c => {
        if (c.isLease || c.isLimitedEdition) return false;
        const ci = _TIER_ORDER.indexOf((c.tier||'').toUpperCase());
        return ci >= tierIndex;
    });

    const lockedIds = window.b2bLockedVehicleIds();
    const available = eligibleCars.filter(c => !lockedIds.includes(c.id));

    if (available.length < contract.required_count) {
        showNotification(`Non hai abbastanza veicoli ${_TIER_LABEL[contract.required_tier]} o superiore (servono ${contract.required_count}, disponibili ${available.length}).`, 'error');
        return;
    }

    // Costruisce il modal di selezione
    let existing = document.getElementById('b2b-select-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'b2b-select-modal';
    modal.className = 'fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex justify-center items-center pointer-events-auto';
    modal.innerHTML = `
    <div class="bg-panel border border-white/10 rounded-2xl w-[460px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
        <h2 class="text-gold font-bold uppercase tracking-widest text-sm mb-1">💼 Accetta Appalto</h2>
        <div class="text-[10px] text-gray-400 mb-1">${contract.client_icon} ${contract.client_name}</div>
        <div class="text-[10px] text-gold mb-4">${contract.title}</div>

        <div class="grid grid-cols-2 gap-2 mb-4 text-[9px]">
            <div class="hud-card !py-2"><div class="text-gray-500">Payout giornaliero</div><div class="text-green-400 font-mono font-bold">+€${contract.daily_payout.toLocaleString()}</div></div>
            <div class="hud-card !py-2"><div class="text-gray-500">Durata</div><div class="text-white font-bold">${contract.duration_days} giorni</div></div>
            <div class="hud-card !py-2"><div class="text-gray-500">Penale rescissione</div><div class="text-red-400 font-mono">−€${contract.penalty_amount.toLocaleString()}</div></div>
            <div class="hud-card !py-2"><div class="text-gray-500">Tier richiesto</div><div class="text-white">${_TIER_LABEL[contract.required_tier]}</div></div>
        </div>

        <div class="text-[10px] text-gray-400 mb-2 uppercase tracking-widest">Seleziona ${contract.required_count} veicoli da vincolare:</div>
        <div id="b2b-car-list" class="space-y-1 mb-4 max-h-48 overflow-y-auto">
            ${available.map(c => `
            <label class="flex items-center gap-2 hud-card !py-1.5 cursor-pointer hover:border-gold/30 transition-colors">
                <input type="checkbox" class="b2b-car-check accent-gold" value="${c.id}" onchange="b2bCheckLimit(${contract.required_count})">
                <div class="flex-1 min-w-0">
                    <div class="text-[9px] font-bold text-white truncate">${c.name}</div>
                    <div class="text-[8px] text-gray-500">${_TIER_LABEL[(c.tier||'').toUpperCase()] || c.tier} · Cond. ${c.condition||100}%</div>
                </div>
            </label>`).join('')}
        </div>

        <div class="text-[10px] text-gray-500 mb-2">
            <span id="b2b-sel-count">0</span>/${contract.required_count} selezionati
        </div>

        <div class="flex gap-2">
            <button onclick="document.getElementById('b2b-select-modal').remove()"
                class="flex-1 p-2 bg-white/5 hover:bg-white/10 rounded text-xs text-gray-400">Annulla</button>
            <button id="b2b-confirm-btn" onclick="b2bConfirmAccept('${contractId}', ${contract.required_count})"
                disabled
                class="flex-1 p-2 bg-gold hover:bg-yellow-500 text-black font-bold rounded text-xs uppercase opacity-40 cursor-not-allowed transition-all"
                data-req="${contract.required_count}">
                Firma Contratto
            </button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.b2bCheckLimit = function(max) {
    const checks = document.querySelectorAll('.b2b-car-check:checked');
    const all    = document.querySelectorAll('.b2b-car-check');
    const count  = checks.length;
    const el = document.getElementById('b2b-sel-count');
    if (el) el.textContent = count;
    // Disabilita gli altri checkbox se abbiamo raggiunto il limite
    all.forEach(cb => {
        if (!cb.checked) cb.disabled = count >= max;
    });
    const btn = document.getElementById('b2b-confirm-btn');
    if (btn) {
        const ok = count >= max;
        btn.disabled = !ok;
        btn.classList.toggle('opacity-40', !ok);
        btn.classList.toggle('cursor-not-allowed', !ok);
    }
};

window.b2bConfirmAccept = async function(contractId, requiredCount) {
    const selectedIds = [...document.querySelectorAll('.b2b-car-check:checked')].map(cb => cb.value);
    if (selectedIds.length < requiredCount) {
        showNotification(`Seleziona almeno ${requiredCount} veicoli.`, 'error'); return;
    }
    // Auto-seleziona driver assegnati ai veicoli selezionati
    const driverIds = selectedIds
        .map(vid => (gameState.drivers||[]).find(d => d.assignedCarId === vid)?.id)
        .filter(Boolean);

    document.getElementById('b2b-select-modal')?.remove();
    await window.b2bAcceptContract(contractId, selectedIds, driverIds);
};

// ── RENDER TAB ────────────────────────────────────────────────────────────────

function renderTabB2B() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const uid      = _uid();
    const active   = window._b2bState.activeContract;
    const contracts = window._b2bState.contracts || [];
    const rep      = gameState.reputation || 0;

    let html = `<h3 class="text-[10px] text-gold uppercase tracking-widest border-b border-white/10 pb-1 mb-3">💼 Contratti Corporate B2B</h3>`;

    if (!uid) {
        container.innerHTML = html + `<div class="text-[9px] text-gray-500 italic text-center mt-8">Accedi per visualizzare i contratti disponibili.</div>`;
        return;
    }

    // ── CONTRATTO ATTIVO ──
    if (active) {
        const _dt = active.days_total || active.days_remaining || 1;
        const pct = Math.max(0, Math.min(100, Math.round((((_dt) - active.days_remaining) / _dt) * 100)));
        const sla = active.sla_score ?? 100;
        const slaColor = sla >= 90 ? '#22c55e' : sla >= 70 ? '#f59e0b' : '#ef4444';
        const lockedVehicles = window.b2bLockedVehicleIds();
        const lockedNames = lockedVehicles
            .map(id => (gameState.fleet||[]).find(c => c.id === id)?.name || id)
            .join(', ') || '—';

        html += `
        <div class="hud-card !border-gold/40 bg-gold/5 mb-4">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">Contratto Attivo</div>
                    <div class="text-[11px] font-bold text-gold">${active.contract_icon||'💼'} ${active.contract_title}</div>
                    <div class="text-[9px] text-gray-400">${active.contract_client}</div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] font-bold text-green-400 font-mono">+€${(active.daily_payout||0).toLocaleString()}/g</div>
                    <div class="text-[8px] text-gray-500">${active.days_remaining} giorni rimanenti</div>
                </div>
            </div>

            <div class="mb-2">
                <div class="flex justify-between text-[8px] text-gray-500 mb-0.5">
                    <span>Progresso</span><span>${pct}%</span>
                </div>
                <div class="w-full h-1.5 bg-white/10 rounded-full">
                    <div class="h-1.5 rounded-full bg-gold transition-all" style="width:${pct}%"></div>
                </div>
            </div>

            <div class="mb-2">
                <div class="flex justify-between text-[8px] mb-0.5">
                    <span class="text-gray-500">SLA Score</span>
                    <span style="color:${slaColor}" class="font-mono font-bold">${Math.round(sla)}%</span>
                </div>
                <div class="w-full h-1 bg-white/10 rounded-full">
                    <div class="h-1 rounded-full transition-all" style="width:${Math.round(sla)}%;background:${slaColor}"></div>
                </div>
                <div class="text-[7px] text-gray-600 mt-0.5">SLA &lt; 50%: contratto rescisso automaticamente</div>
            </div>

            <div class="text-[8px] text-gray-500 mb-3">
                🔒 Veicoli bloccati: <span class="text-gray-300">${lockedNames}</span>
            </div>

            <button onclick="b2bTerminateContract('${active.id}')"
                class="btn-gold !bg-red-900/30 !text-red-400 !text-[8px] w-full">
                ⚠️ Rescindi Anticipatamente (penale −€${(active.penalty_amount||0).toLocaleString()})
            </button>
        </div>`;
    } else {
        html += `
        <div class="hud-card !border-green-500/20 bg-green-950/5 mb-4 text-center">
            <div class="text-[9px] text-gray-400">Nessun contratto attivo. Scegli un appalto qui sotto per iniziare il farming passivo.</div>
        </div>`;
    }

    // ── CONTRATTI DISPONIBILI ──
    html += `<div class="text-[9px] text-gray-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Appalti Disponibili</div>`;

    if (contracts.length === 0) {
        html += `<div class="text-[9px] text-gray-600 italic text-center py-4">Nessun appalto disponibile al momento. Riprova più tardi.</div>`;
    } else {
        contracts.forEach(c => {
            const locked       = !!active;
            const repOk        = rep >= (c.min_reputation || 0);
            const tierIndex    = _TIER_ORDER.indexOf(c.required_tier);
            const eligibleCars = (gameState.fleet||[]).filter(car => {
                const ci = _TIER_ORDER.indexOf((car.tier||'').toUpperCase());
                return ci >= tierIndex && !car.isLease;
            });
            const carsOk = eligibleCars.length >= c.required_count;
            const canAccept = !locked && repOk && carsOk;

            const totalPayout = c.daily_payout * c.duration_days;
            const roi = c.penalty_amount > 0 ? ((totalPayout / c.penalty_amount) * 100).toFixed(0) : '∞';

            html += `
            <div class="hud-card mb-2 ${!repOk || !carsOk ? 'opacity-50' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1 mb-0.5">
                            <span class="text-base">${c.client_icon}</span>
                            <div>
                                <div class="text-[10px] font-bold text-white truncate">${c.title}</div>
                                <div class="text-[8px] text-gray-400">${c.client_name}</div>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-1 mt-1">
                            <span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">${_TIER_LABEL[c.required_tier]} ×${c.required_count}</span>
                            ${c.province_id ? `<span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">📍 ${c.province_id.replace('prov_','')}</span>` : ''}
                            <span class="text-[7px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">⭐ min ${c.min_reputation}★</span>
                        </div>
                    </div>
                    <div class="text-right ml-2 shrink-0">
                        <div class="text-[11px] font-bold text-green-400 font-mono">+€${c.daily_payout.toLocaleString()}/g</div>
                        <div class="text-[8px] text-gray-500">${c.duration_days}g · tot. €${(totalPayout/1000).toFixed(0)}k</div>
                        <div class="text-[8px] text-gray-600">ROI vs penale: ${roi}%</div>
                    </div>
                </div>

                <div class="flex justify-between text-[8px] mb-2">
                    <span class="text-gray-500">Penale rescissione:</span>
                    <span class="text-red-400 font-mono">−€${c.penalty_amount.toLocaleString()}</span>
                </div>

                ${!repOk ? `<div class="text-[8px] text-red-400 mb-1">🔒 Reputazione insufficiente (serve ${c.min_reputation}★, hai ${rep.toFixed(1)}★)</div>` : ''}
                ${!carsOk ? `<div class="text-[8px] text-red-400 mb-1">🔒 Veicoli insufficienti (serve ×${c.required_count} ${_TIER_LABEL[c.required_tier]}, disponibili ${eligibleCars.length})</div>` : ''}
                ${locked ? `<div class="text-[8px] text-yellow-500 mb-1">⏳ Hai già un contratto attivo</div>` : ''}

                <button onclick="b2bOpenAcceptModal('${c.id}')"
                    ${canAccept ? '' : 'disabled'}
                    class="btn-gold w-full !text-[8px] !py-1.5 ${canAccept ? '' : 'opacity-40 cursor-not-allowed'}">
                    💼 Accetta Appalto
                </button>
            </div>`;
        });
    }

    container.innerHTML = html;
}

window.renderTabB2B = renderTabB2B;

// ── INIT ──────────────────────────────────────────────────────────────────────

window.b2bInit = async function() {
    if (!_sb() || !_uid()) return;
    await window.b2bRefresh();
    console.log('[B2B] Modulo inizializzato.');
};
