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
    saveGame();

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
    saveGame();
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
            gameState.reputation = Math.min(5.0 + (gameState.prestige || 0), (gameState.reputation||0) + (data.rep_bonus||0));
        }
    } else if (data.payout > 0) {
        showNotification(`💼 B2B: +€${data.payout.toLocaleString()} da "${data.title}" (${data.days_remaining}g rim.)`, 'success');
        logToMap(`💼 Payout B2B: +€${data.payout.toLocaleString()} — ${data.days_remaining} giorni rimanenti`);
        if (window._b2bState.activeContract) {
            window._b2bState.activeContract.days_remaining = data.days_remaining;
        }
    }

    saveGame();
    if (typeof updateUI === 'function') updateUI();
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
    modal.style.cssText = 'position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;pointer-events:auto';
    modal.innerHTML = `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;width:460px;max-height:85vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
        <div style="font-size:9px;color:#c79a2a;font-weight:700;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px">💼 Accetta Appalto</div>
        <div style="font-size:10px;color:#6b7280;margin-bottom:2px">${contract.client_icon} ${contract.client_name}</div>
        <div style="font-size:13px;font-weight:700;color:#c79a2a;margin-bottom:16px">${contract.title}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 12px">
                <div style="font-size:9px;color:#6b7280">Payout giornaliero</div>
                <div style="font-size:12px;font-weight:700;color:#1aa06a;font-family:monospace">+€${contract.daily_payout.toLocaleString()}</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 12px">
                <div style="font-size:9px;color:#6b7280">Durata</div>
                <div style="font-size:12px;font-weight:700;color:#e6edf3">${contract.duration_days} giorni</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 12px">
                <div style="font-size:9px;color:#6b7280">Penale rescissione</div>
                <div style="font-size:12px;font-weight:700;color:#db5746;font-family:monospace">−€${contract.penalty_amount.toLocaleString()}</div>
            </div>
            <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 12px">
                <div style="font-size:9px;color:#6b7280">Tier richiesto</div>
                <div style="font-size:12px;font-weight:700;color:#e6edf3">${_TIER_LABEL[contract.required_tier]}</div>
            </div>
        </div>

        <div style="font-size:10px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">Seleziona ${contract.required_count} veicoli da vincolare:</div>
        <div id="b2b-car-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px;max-height:192px;overflow-y:auto">
            ${available.map(c => `
            <label style="display:flex;align-items:center;gap:10px;background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 12px;cursor:pointer">
                <input type="checkbox" class="b2b-car-check" style="accent-color:#c79a2a;width:14px;height:14px;flex-shrink:0" value="${c.id}" onchange="b2bCheckLimit(${contract.required_count})">
                <div style="flex:1;min-width:0">
                    <div style="font-size:10px;font-weight:700;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
                    <div style="font-size:9px;color:#6b7280">${_TIER_LABEL[(c.tier||'').toUpperCase()] || c.tier} · Cond. ${c.condition||100}%</div>
                </div>
            </label>`).join('')}
        </div>

        <div style="font-size:10px;color:#6b7280;margin-bottom:12px">
            <span id="b2b-sel-count">0</span>/${contract.required_count} selezionati
        </div>

        <div style="display:flex;gap:8px">
            <button onclick="document.getElementById('b2b-select-modal').remove()"
                style="flex:1;padding:8px;border-radius:4px;font-size:11px;cursor:pointer;background:#161b22;border:1px solid #21262d;color:#6b7280">Annulla</button>
            <button id="b2b-confirm-btn" onclick="b2bConfirmAccept('${contractId}', ${contract.required_count})"
                disabled
                style="flex:1;padding:8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;cursor:not-allowed;background:#1a1608;border:1px solid #c79a2a;color:#c79a2a;opacity:.4;transition:all .15s"
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
        btn.style.opacity    = ok ? '1' : '0.4';
        btn.style.cursor     = ok ? 'pointer' : 'not-allowed';
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

    const monthlyFromActive = active ? (active.daily_payout || 0) * 30 : 0;
    const _kpiC = c => c === 'green' ? '#1aa06a' : c === 'gold' ? '#c79a2a' : c === 'red' ? '#db5746' : c === 'blue' ? '#2f74c0' : c === 'orange' ? '#e0922e' : '#1f2733';
    let html = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #d6dee8;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Corporate</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Contratti B2B</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">${active ? `Contratto attivo: ${active.contract_title} · €${(active.daily_payout||0).toLocaleString()}/g` : `${contracts.length} contratti disponibili · Reputazione ${rep.toFixed(1)}★`}</div>
        </div>
        ${active ? `<span style="font-size:9px;font-weight:700;color:#1aa06a;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:3px 8px">ATTIVO</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Contratto</div>
            <div style="font-size:14px;font-weight:700;font-family:monospace;color:${active ? '#c79a2a' : '#1f2733'}">${active ? active.contract_icon + ' ' + (active.contract_client || '—') : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Entrate/g</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${active ? '#1aa06a' : '#1f2733'}">${active ? '+€' + (active.daily_payout||0).toLocaleString() : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Giorni rimasti</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${active && active.days_remaining <= 3 ? '#db5746' : '#1f2733'}">${active ? active.days_remaining : '—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">SLA Score</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${active && (active.sla_score ?? 100) >= 90 ? '#1aa06a' : '#e0922e'}">${active ? Math.round(active.sla_score ?? 100) + '%' : '—'}</div>
        </div>
    </div>`;

    if (!uid) {
        container.innerHTML = html + `<div style="font-size:9px;color:#6b7280;font-style:italic;text-align:center;margin-top:32px">Accedi per visualizzare i contratti disponibili.</div>`;
        return;
    }

    // ── CONTRATTO ATTIVO ──
    if (active) {
        const _dt = active.days_total || active.days_remaining || 1;
        const pct = Math.max(0, Math.min(100, Math.round((((_dt) - active.days_remaining) / _dt) * 100)));
        const sla = active.sla_score ?? 100;
        const slaColor = sla >= 90 ? '#1aa06a' : sla >= 70 ? '#e0922e' : '#db5746';
        const lockedVehicles = window.b2bLockedVehicleIds();
        const lockedNames = lockedVehicles
            .map(id => (gameState.fleet||[]).find(c => c.id === id)?.name || id)
            .join(', ') || '—';

        html += `
        <div style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:6px;padding:16px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Contratto Attivo</div>
                    <div style="font-size:11px;font-weight:700;color:#c79a2a">${active.contract_icon||'💼'} ${active.contract_title}</div>
                    <div style="font-size:9px;color:#6b7280;margin-top:2px">${active.contract_client}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:10px;font-weight:700;color:#1aa06a;font-family:monospace">+€${(active.daily_payout||0).toLocaleString()}/g</div>
                    <div style="font-size:8px;color:#6b7280;margin-top:2px">${active.days_remaining} giorni rimanenti</div>
                </div>
            </div>
            <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:8px;color:#6b7280;margin-bottom:4px"><span>Progresso</span><span>${pct}%</span></div>
                <div style="height:5px;border-radius:3px;background:#21262d"><div style="height:100%;width:${pct}%;background:#c79a2a;border-radius:3px;transition:width .3s"></div></div>
            </div>
            <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:4px"><span style="color:#6b7280">SLA Score</span><span style="color:${slaColor};font-family:monospace;font-weight:700">${Math.round(sla)}%</span></div>
                <div style="height:4px;border-radius:3px;background:#21262d"><div style="height:100%;width:${Math.round(sla)}%;background:${slaColor};border-radius:3px;transition:width .3s"></div></div>
                <div style="font-size:7px;color:#6b7280;margin-top:3px">SLA &lt; 50%: contratto rescisso automaticamente</div>
            </div>
            <div style="font-size:8px;color:#6b7280;margin-bottom:12px">🔒 Veicoli bloccati: <span style="color:#6b7280">${lockedNames}</span></div>
            <button onclick="b2bTerminateContract('${active.id}')"
                style="width:100%;padding:7px;font-size:9px;font-weight:700;cursor:pointer;background:#161b22;border:1px solid #f0c4bd;color:#db5746;border-radius:4px;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                ⚠️ Rescindi Anticipatamente (penale −€${(active.penalty_amount||0).toLocaleString()})
            </button>
        </div>`;
    } else {
        html += `<div style="background:rgba(63,185,80,0.04);border:1px solid rgba(63,185,80,0.15);border-radius:6px;padding:14px;margin-bottom:16px;text-align:center;font-size:9px;color:#6b7280">Nessun contratto attivo. Scegli un appalto qui sotto per iniziare il farming passivo.</div>`;
    }

    // ── CONTRATTI DISPONIBILI ──
    html += `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #d6dee8">Appalti Disponibili</div>`;

    if (contracts.length === 0) {
        html += `<div style="font-size:9px;color:#6b7280;font-style:italic;text-align:center;padding:16px 0">Nessun appalto disponibile al momento. Riprova più tardi.</div>`;
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
            <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:8px;${!repOk || !carsOk ? 'opacity:.5' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                            <span style="font-size:16px">${c.client_icon}</span>
                            <div>
                                <div style="font-size:11px;font-weight:700;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.title}</div>
                                <div style="font-size:9px;color:#6b7280">${c.client_name}</div>
                            </div>
                        </div>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                            <span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 6px;border-radius:4px;color:#6b7280">${_TIER_LABEL[c.required_tier]} ×${c.required_count}</span>
                            ${c.province_id ? `<span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 6px;border-radius:4px;color:#6b7280">📍 ${c.province_id.replace('prov_','')}</span>` : ''}
                            <span style="font-size:8px;background:#0d1117;border:1px solid #21262d;padding:2px 6px;border-radius:4px;color:#6b7280">⭐ min ${c.min_reputation}★</span>
                        </div>
                    </div>
                    <div style="text-align:right;margin-left:8px;flex-shrink:0">
                        <div style="font-size:11px;font-weight:700;color:#1aa06a;font-family:monospace">+€${c.daily_payout.toLocaleString()}/g</div>
                        <div style="font-size:8px;color:#6b7280">${c.duration_days}g · tot. €${(totalPayout/1000).toFixed(0)}k</div>
                        <div style="font-size:8px;color:#6b7280">ROI vs penale: ${roi}%</div>
                    </div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:10px">
                    <span style="color:#6b7280">Penale rescissione:</span>
                    <span style="color:#db5746;font-family:monospace">−€${c.penalty_amount.toLocaleString()}</span>
                </div>
                ${!repOk ? `<div style="font-size:9px;color:#db5746;margin-bottom:4px">🔒 Reputazione insufficiente (serve ${c.min_reputation}★, hai ${rep.toFixed(1)}★)</div>` : ''}
                ${!carsOk ? `<div style="font-size:9px;color:#db5746;margin-bottom:4px">🔒 Veicoli insufficienti (serve ×${c.required_count} ${_TIER_LABEL[c.required_tier]}, disponibili ${eligibleCars.length})</div>` : ''}
                ${locked ? `<div style="font-size:9px;color:#e0922e;margin-bottom:4px">⏳ Hai già un contratto attivo</div>` : ''}
                <button onclick="b2bOpenAcceptModal('${c.id}')"
                    ${canAccept ? '' : 'disabled'}
                    style="width:100%;padding:7px;font-size:9px;font-weight:700;border-radius:4px;cursor:${canAccept?'pointer':'not-allowed'};background:#1a1608;border:1px solid #c79a2a;color:#c79a2a;transition:opacity .15s;${canAccept ? '' : 'opacity:.4'}"
                    onmousedown="if(!this.disabled)this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                    💼 Accetta Appalto
                </button>
            </div>`;
        });
    }

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}

window.renderTabB2B = renderTabB2B;

// ── INIT ──────────────────────────────────────────────────────────────────────

window.b2bInit = async function() {
    if (!_sb() || !_uid()) return;
    await window.b2bRefresh();
    console.log('[B2B] Modulo inizializzato.');
};
