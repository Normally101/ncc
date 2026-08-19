'use strict';
/* ================================================================
   black_ops.js — Chauffeur Empire
   Espansione 3: Agenzia Ombra (Spionaggio/Sabotaggio PvP)
   ================================================================ */

window._shadowState = {
    targets:    [],
    log:        [],
    _lastFetch: 0,
};

window.SHADOW_OPS = [
    {
        id:    'spy_fleet',
        name:  '🔍 Spionaggio Flotta',
        desc:  'Rivela dimensione e tier massimo della flotta nemica.',
        cost:  15000,
        risk:  'Basso',
        successMsg: (r) => `Flotta rivelata: ${r.fleet_size || '?'} veicoli, tier max: ${r.top_tier || '?'}`,
    },
    {
        id:    'spy_finances',
        name:  '💰 Spionaggio Finanze',
        desc:  'Ottieni una stima del cash e dei ricavi giornalieri del target.',
        cost:  20000,
        risk:  'Basso',
        successMsg: () => 'Report finanziario acquisito.',
    },
    {
        id:    'fake_review',
        name:  '⭐ Recensione Falsa',
        desc:  'Pubblica recensioni negative. Il target perde −0.15 reputazione.',
        cost:  25000,
        risk:  'Medio',
        successMsg: () => '−0.15★ reputazione inflitta al target.',
    },
    {
        id:    'buy_off_client',
        name:  '🎯 Dirottamento Cliente',
        desc:  'Sottrarre un cliente VIP al competitor. Aumenta le tue corse VIP per 24h.',
        cost:  40000,
        risk:  'Medio',
        successMsg: () => '+30% corse VIP per 24h.',
    },
    {
        id:    'bribe_driver',
        name:  '🤝 Corruzione Autista',
        desc:  'Corrompi un autista del target. Viene bloccato per 8h.',
        cost:  50000,
        risk:  'Alto',
        successMsg: () => 'Autista del target bloccato per 8h.',
    },
    {
        id:    'sabotage_vehicle',
        name:  '🔧 Sabotaggio Veicolo',
        desc:  'Causa danno fisico a un veicolo casuale del target (−20 condizione).',
        cost:  80000,
        risk:  'Molto Alto',
        successMsg: (r) => `Veicolo sabotato: −${r.condition_damage || 20} condizione.`,
    },
    {
        id:    'hijack_client',
        name:  '🚗 Intercetta Corsa',
        desc:  'Intercetta una corsa premium del target e divertila a te.',
        cost:  60000,
        risk:  'Alto',
        successMsg: () => 'Corsa premium intercettata.',
    },
];

const _DEFENSE_TIERS = [
    { level: 1, name: 'Guardia Base',     cost: 50000,  desc: '−8% successo operazioni nemiche' },
    { level: 2, name: 'Controspionaggio', cost: 100000, desc: '−16% successo; avviso attacchi rilevati' },
    { level: 3, name: 'Cellula Sicura',   cost: 200000, desc: '−24% successo; doppio cooldown nemico' },
    { level: 4, name: 'Blindatura Info',  cost: 400000, desc: '−32% successo; operazioni spy bloccate' },
    { level: 5, name: 'Fortezza Ombra',  cost: 800000, desc: 'Massima protezione. −40% su tutto.' },
];

function _sErr(prefix, err) {
    if (window.CE_Sec && typeof window.CE_Sec.userError === 'function') {
        return window.CE_Sec.userError(prefix, err, { support: true });
    }
    try { console.warn('[SHADOW]', prefix, err && (err.message || err)); } catch {}
    return `${prefix}, riprova.`;
}

window.shadowRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._shadowState._lastFetch < 30000) return;
    window._shadowState._lastFetch = now;
    const sb = window.supabaseClient;
    if (!sb) return;
    const [tRes, lRes] = await Promise.all([
        sb.rpc('rpc_get_shadow_targets'),
        sb.rpc('rpc_get_shadow_ops_log'),
    ]);
    if (!tRes.error) window._shadowState.targets = tRes.data || [];
    if (!lRes.error) window._shadowState.log     = lRes.data || [];
};

window.shadowExecuteOp = async function(targetId, opId) {
    const op = window.SHADOW_OPS.find(o => o.id === opId);
    if (!op) return;

    const target = window._shadowState.targets.find(t => t.user_id === targetId);
    if (!target) { if(typeof showNotification==='function') showNotification('Target non trovato', 'error'); return; }

    const sb = window.supabaseClient;
    if (!sb) return;

    if (typeof confirm === 'function' && !confirm(`Eseguire "${op.name}" su ${target.name || 'target'} per €${op.cost.toLocaleString()}?`)) return;

    if (!window.CE_money.spend(op.cost, 'shadow_op_' + opId)) return;

    const { data, error } = await sb.rpc('rpc_execute_shadow_op', {
        v_target_id: targetId,
        v_op_type:   opId,
        v_op_cost:   op.cost,
    });

    if (error) {
        window.CE_money.earn(op.cost, 'shadow_op_refund');
        if (typeof showNotification === 'function') showNotification(_sErr('Operazione fallita', error), 'error');
        return;
    }

    if (typeof updateUI === 'function') updateUI();

    if (data.success) {
        const msg = op.successMsg ? op.successMsg(data.result || {}) : 'Operazione riuscita.';
        if(typeof showNotification==='function') showNotification(`✅ ${op.name}: ${msg}`, 'success');
        if(typeof logToMap==='function') logToMap(`🕵️ Op. Ombra riuscita: ${op.name} su ${target.name || 'target'}.`);

        if (opId === 'buy_off_client' && typeof gameState !== 'undefined') {
            gameState.activeDynamicEvent = {
                ...(gameState.activeDynamicEvent || {}),
                id: 'shadow_vip_boost', name: 'Cliente VIP Dirottato',
                icon: '🎯', endsHour: (gameState.day * 24 + gameState.hour) + 24,
                tipMult: (gameState.activeDynamicEvent?.tipMult || 1.0) * 1.30,
            };
        }
    } else {
        const detectedMsg = data.detected ? ' Sei stato identificato! Il target ha aumentato le sue difese.' : '';
        if(typeof showNotification==='function') showNotification(`❌ ${op.name}: fallita.${detectedMsg}`, 'error');
    }

    window._shadowState._lastFetch = 0;
    await window.shadowRefresh(true);
    if (typeof window.switchTab === 'function') window.switchTab('shadow');
};

window.shadowUpgradeDefense = async function() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const currentLevel = gameState._shadowDefenseLevel || 0;
    const tier = _DEFENSE_TIERS[currentLevel];
    if (!tier) { if(typeof showNotification==='function') showNotification('Difesa già al massimo!', 'error'); return; }

    if (!window.CE_money.spend(tier.cost, 'shadow_defense_upgrade')) return;

    const { data, error } = await sb.rpc('rpc_upgrade_shadow_defense', { v_cost: tier.cost });
    if (error) {
        window.CE_money.earn(tier.cost, 'shadow_defense_refund');
        if (typeof showNotification === 'function') showNotification(_sErr('Upgrade difesa fallito', error), 'error');
        return;
    }
    gameState._shadowDefenseLevel = data.new_level;
    if (typeof saveGame === 'function') saveGame();
    if (typeof updateUI === 'function') updateUI();
    if(typeof showNotification==='function') showNotification(`🛡️ Difesa aggiornata a Livello ${data.new_level}: ${_DEFENSE_TIERS[data.new_level - 1]?.name}!`, 'success');
    if (typeof window.switchTab === 'function') window.switchTab('shadow');
};

window.renderTabShadow = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const state    = window._shadowState;
    const targets  = state.targets;
    const log      = state.log;
    const defLevel = gameState._shadowDefenseLevel || 0;
    const nextTier = _DEFENSE_TIERS[defLevel];

    const targetsHtml = targets.length === 0
        ? `<div class="em-empty">Nessun target disponibile.<br>Scala la classifica reputazione per sbloccare competitor.</div>`
        : targets.map(t => `
            <div class="em-card" style="padding:12px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div>
                  <div style="font-size:12px;font-weight:700;margin-bottom:2px">${t.name || 'Anonimo'}</div>
                  <div style="font-size:10px;color:var(--em-muted)">⭐ ${(t.reputation || 0).toFixed(1)} · Difesa Lv.${t.defense_lvl || 0}</div>
                </div>
                <div style="font-size:9px;color:var(--em-muted)">${t.hq_city || ''}</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                ${window.SHADOW_OPS.map(op => `
                  <button class="em-ghbtn" ${ceAct('shadowExecuteOp', [t.user_id,op.id])}
                    title="${op.desc} — €${op.cost.toLocaleString()}"
                    style="font-size:8px;padding:3px 7px;${(gameState.cash||0) < op.cost ? 'opacity:.4' : ''}">
                    ${op.name.split(' ')[0]} €${Math.round(op.cost/1000)}k
                  </button>`).join('')}
              </div>
            </div>`).join('');

    const logHtml = log.length === 0
        ? `<div class="em-empty">Nessuna operazione registrata.</div>`
        : log.slice(0, 15).map(l => {
            const op = window.SHADOW_OPS.find(o => o.id === l.op_type) || {};
            const role   = l.is_attacker ? '🗡️ Attacco' : '🛡️ Difesa';
            const status = l.success ? '✅' : l.detected ? '❌ Rilevato' : '❌';
            return `
              <div class="em-lrow" style="font-size:10px">
                <div style="flex:1">
                  <span style="color:var(--em-muted)">${role}</span>
                  <span style="margin-left:6px">${op.name || l.op_type}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="color:var(--em-muted);font-family:monospace">€${(l.op_cost||0).toLocaleString()}</span>
                  <span>${status}</span>
                </div>
              </div>`;
          }).join('');

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line);display:flex;align-items:flex-start;justify-content:space-between">
            <div>
                <div class="em-sec" style="margin-bottom:4px">Operazioni</div>
                <div style="font-size:20px;font-weight:800;margin-bottom:2px">Agenzia Ombra</div>
                <div style="font-size:11px;color:var(--em-muted)">${targets.length} target disponibili · Difesa Lv.${defLevel}/5</div>
            </div>
            <button class="em-ghbtn" ${ceAct('ceThen', ['shadowRefresh', 'switchTab', 'shadow'])}>↻ Aggiorna</button>
        </div>

        <div class="em-card" style="padding:14px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-size:11px;font-weight:700">🛡️ Difesa Aziendale</div>
                <div style="font-size:10px;color:var(--em-muted)">Lv.${defLevel}/5</div>
            </div>
            <div class="em-prog" style="margin-bottom:8px">
                <i style="width:${Math.round(defLevel/5*100)}%;background:var(--em-blue);transition:width .3s"></i>
            </div>
            ${nextTier
                ? `<div style="font-size:9px;color:var(--em-muted);margin-bottom:8px">Prossimo: ${nextTier.name} — €${nextTier.cost.toLocaleString()}</div>
                   <button class="em-goldbtn" ${ceAct('shadowUpgradeDefense', [])} style="width:100%;${(gameState.cash||0) < nextTier.cost ? 'opacity:.45;cursor:not-allowed' : ''}">🛡️ Potenzia Difesa</button>`
                : `<div style="font-size:9px;color:var(--em-green)">Difesa massima raggiunta!</div>`}
        </div>

        <div class="em-sec" style="margin-bottom:10px;color:var(--em-gold)">🎯 Target Disponibili</div>
        ${targetsHtml}

        <div class="em-sec" style="margin-bottom:8px;margin-top:16px">📋 Registro Operazioni</div>
        <div class="em-card">
            ${logHtml}
        </div>
    </div></div>`;
};

window.shadowInit = async function() {
    if (!gameState._shadowDefenseLevel) gameState._shadowDefenseLevel = 0;
    await window.shadowRefresh(true);
};
