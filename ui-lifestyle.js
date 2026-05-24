'use strict';
/* ================================================================
   ui-lifestyle.js — Chauffeur Empire
   Lifestyle tab (asset di lusso, CEO status).
   Server Decrees state: decreesRefresh, getDecreeEffects, voteServerDecree.
   Dipendenze: engine.js, engine-finance.js (LIFESTYLE_ASSETS),
   dispatcher.js (gameState, showNotification, updateUI)
   ================================================================ */

function renderTabLifestyle() {
    const container = document.getElementById('tab-container');
    const owned  = gameState.lifestyleAssets || [];
    const assets = typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : [];

    const portfolioValue = owned.reduce((s, id) => { const a = assets.find(x => x.id === id); return s + (a ? a.price : 0); }, 0);
    const dailyPassive   = owned.reduce((s, id) => { const a = assets.find(x => x.id === id); return s + (a && a.passive ? a.passive : 0); }, 0);
    const intlUnlocked   = owned.includes('jet_privato');
    const statusLabel    = owned.length >= 4 ? 'MOGUL' : owned.length >= 2 ? 'ELITE' : owned.length >= 1 ? 'RISING' : 'NASCENT';
    const statusColor    = owned.length >= 4 ? 'gold' : owned.length >= 2 ? 'blue' : owned.length >= 1 ? 'green' : '';

    let html = DS.header({
        eyebrow: 'Lifestyle & Status',
        title:   'Empire Portfolio',
        subtitle:`${owned.length} asset · Rendita +€${dailyPassive.toLocaleString()}/g ${intlUnlocked?'· ✈️ Tratte internazionali attive':''}`,
    }) + DS.kpiStrip([
        { label:'Status CEO',       val: statusLabel,                                        color: statusColor },
        { label:'Valore Portfolio', val: '€' + portfolioValue.toLocaleString(),              color:'gold' },
        { label:'Rendita Passiva',  val: '+€' + dailyPassive.toLocaleString() + '/g',        color:'green' },
        { label:'Asset Posseduti',  val: owned.length + ' / ' + assets.length },
    ]);

    // Mappa asset → immagine
    const _LIFESTYLE_IMG = {
        attico_milano:      'assets/lifestyle/attico-citylife.jpg',
        villa_porto_cervo:  'assets/lifestyle/villa-porto-cervo.jpg',
        ufficio_wall_street:'assets/lifestyle/ufficio-one-world-trade.jpg',
        jet_privato:        'assets/lifestyle/gulfstream-g700.jpg',
        yacht_lusso:        'assets/lifestyle/mega-yacht.jpg',
        villa_como:         'assets/lifestyle/villa-como.jpg',
        casino_montecarlo:  'assets/lifestyle/casino-montecarlo.jpg',
        penthouse_dubai:    'assets/lifestyle/penthouse-dubai.jpg',
    };

    const _lifestyleCard = (a, accentColor) => {
        const isOwned   = owned.includes(a.id);
        const canAfford = gameState.cash >= a.price;
        const imgSrc    = _LIFESTYLE_IMG[a.id];
        const badges = [
            a.passive > 0      ? `<span class="ls-badge ls-badge-green">+€${a.passive.toLocaleString()}/g</span>` : '',
            a.repBonus > 0     ? `<span class="ls-badge ls-badge-gold">+${a.repBonus}★ rep</span>` : '',
            a.unlocksDiamond   ? `<span class="ls-badge ls-badge-gold">🔶 Diamond</span>` : '',
            a.stockBonus > 0   ? `<span class="ls-badge ls-badge-cyan">+${Math.round(a.stockBonus*100)}% stocks</span>` : '',
            a.intlUnlock       ? `<span class="ls-badge ls-badge-cyan">✈️ Rotte Intl</span>` : '',
            a.staffBonus > 0   ? `<span class="ls-badge ls-badge-purple">Staff +${Math.round(a.staffBonus*100)}%</span>` : '',
            a.energyBonus > 0  ? `<span class="ls-badge ls-badge-purple">CEO +${a.energyBonus} energia</span>` : '',
        ].filter(Boolean).join('');

        return `
        <div class="ls-card mb-4 ${isOwned ? 'ls-card-owned' : ''}">
            ${imgSrc ? `
            <div class="ls-card-img-wrap">
                <img src="${imgSrc}" alt="${a.name}" class="ls-card-img" loading="lazy">
                ${isOwned ? '<div class="ls-card-owned-badge">✓ Posseduto</div>' : ''}
                <div class="ls-card-img-overlay"></div>
                <div class="ls-card-img-title">
                    <div class="ls-card-name">${a.name}</div>
                    <div class="ls-card-location" style="color:${accentColor}">${a.location}</div>
                </div>
            </div>` : `
            <div class="ls-card-no-img px-4 pt-4 flex items-center gap-3">
                <span class="text-3xl">${a.icon}</span>
                <div>
                    <div class="ls-card-name">${a.name}</div>
                    <div class="ls-card-location" style="color:${accentColor}">${a.location}</div>
                </div>
            </div>`}
            <div class="px-4 py-3">
                <div class="text-[9px] text-gray-400 leading-relaxed mb-3">${a.desc}</div>
                <div class="flex flex-wrap gap-1 mb-3">${badges}</div>
                <div class="flex justify-between items-center">
                    <div class="text-xs font-bold font-mono" style="color:${accentColor}">€${a.price.toLocaleString('it-IT')}</div>
                    ${isOwned
                        ? `<span class="text-[9px] font-bold text-green-400 uppercase">✓ Nel portfolio</span>`
                        : `<button onclick="buyLifestyleAsset('${a.id}')"
                             class="btn-gold !text-[9px] !py-1.5 !px-3 ${canAfford ? '' : 'opacity-40 cursor-not-allowed'}"
                             ${canAfford ? '' : 'disabled'}>
                             Acquista
                           </button>`
                    }
                </div>
            </div>
        </div>`;
    };

    // Real Estate section
    const realEstate = assets.filter(a => a.category === 'real_estate');
    html += `<div class="text-[9px] uppercase tracking-widest mb-3 mt-1" style="color:#d4af37">🏙️ Immobili di Lusso</div>`;
    realEstate.forEach(a => { html += _lifestyleCard(a, '#d4af37'); });

    // Elite vehicles
    const eliteVehicles = assets.filter(a => a.category === 'vehicle_elite');
    html += `<div class="text-[9px] uppercase tracking-widest mb-3 mt-4" style="color:#00f2ff">✈️ Mezzi Elite</div>`;
    eliteVehicles.forEach(a => { html += _lifestyleCard(a, '#00f2ff'); });

    // Diamond requirements info
    const diamondEligible = owned.some(id => assets.find(a => a.id === id && a.unlocksDiamond));
    html += `
    <div class="hud-card !border-yellow-800/40 bg-yellow-950/10 mt-3">
        <div class="text-[9px] uppercase tracking-widest mb-2" style="color:#d4af37">🔶 Diamond Contracts</div>
        <div class="text-[9px] text-gray-400 mb-2">Contratti ultra-premium riservati ai CEO con asset Lifestyle specifici. Pagamento da €20.000 a €80.000 per singolo contratto.</div>
        ${diamondEligible && gameState.reputation >= 4.5
            ? `<div class="text-[9px] text-green-400 font-bold">✓ Sei eleggibile — Contratti in arrivo via Inbox</div>`
            : `<div class="text-[9px] text-gray-500">Requisi: asset Lifestyle + reputazione ≥ 4.5★ + Elite Wealth Manager</div>`}
    </div>`;

    container.innerHTML = html;
}
window.renderTabLifestyle = renderTabLifestyle;

// ── POLITICS TAB ─────────────────────────────────────────────────
// ── SERVER DECREES STATE ──────────────────────────────────────────────────────
window._decreesState = { decrees: [], activeDecrees: [], _lastFetch: 0 };

window.decreesRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._decreesState._lastFetch < 60000) return;
    window._decreesState._lastFetch = now;
    const sb = window.supabaseClient;
    if (!sb) return;
    const [dRes, aRes] = await Promise.all([
        sb.rpc('rpc_get_server_decrees'),
        sb.rpc('rpc_get_active_decrees'),
    ]);
    if (!dRes.error) window._decreesState.decrees = dRes.data || [];
    if (!aRes.error) window._decreesState.activeDecrees = aRes.data || [];
};

window.getDecreeEffects = function() {
    const fx = {};
    for (const d of window._decreesState.activeDecrees) {
        for (const [k, v] of Object.entries(d.effects || {})) {
            if (typeof v === 'number') {
                fx[k] = (fx[k] || 1.0) * v;
            } else {
                fx[k] = v;
            }
        }
    }
    return fx;
};

window.voteServerDecree = async function(decreeId, points) {
    const pts = parseInt(points, 10);
    if (!pts || pts < 1) { if(typeof showNotification==='function') showNotification('Inserisci punti validi', 'error'); return; }
    if ((gameState.lobbyingPoints || 0) < pts) { if(typeof showNotification==='function') showNotification('Punti lobbying insufficienti', 'error'); return; }

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_vote_server_decree', { v_decree_id: decreeId, v_points_spent: pts });
    if (error) { if(typeof showNotification==='function') showNotification('Voto fallito: ' + error.message, 'error'); return; }

    gameState.lobbyingPoints = (gameState.lobbyingPoints || 0) - pts;
    if (typeof saveGame === 'function') saveGame();
    if (data.passed) {
        if(typeof showNotification==='function') showNotification(`🎉 Decreto approvato: ${data.title}!`, 'success');
    } else {
        if(typeof showNotification==='function') showNotification(`✅ Voto registrato. (${data.votes_current}/${window._decreesState.decrees.find(d=>d.id===decreeId)?.votes_required||'?'})`, 'success');
    }
    await window.decreesRefresh(true);
    if (typeof renderTabPolitics === 'function') renderTabPolitics();
};


// renderTabStaff exported in ui-staff.js
// renderTabLifestyle exported above (line 118)
