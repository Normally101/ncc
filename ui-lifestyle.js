'use strict';
/* ui-lifestyle.js — Chauffeur Empire
   Lifestyle tab (asset di lusso, CEO status) + Server Decrees state. */

function renderTabLifestyle() {
    const container = document.getElementById('tab-container');
    const owned     = gameState.lifestyleAssets || [];
    const assets    = typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : [];

    const portfolioValue = owned.reduce((s,id) => { const a = assets.find(x=>x.id===id); return s+(a?a.price:0); }, 0);
    const dailyPassive   = owned.reduce((s,id) => { const a = assets.find(x=>x.id===id); return s+(a&&a.passive?a.passive:0); }, 0);
    const intlUnlocked   = owned.includes('jet_privato');
    const statusLabel    = owned.length >= 4 ? 'MOGUL' : owned.length >= 2 ? 'ELITE' : owned.length >= 1 ? 'RISING' : 'NASCENT';
    const statusColor    = owned.length >= 4 ? '#c79a2a' : owned.length >= 2 ? '#2f74c0' : owned.length >= 1 ? '#1aa06a' : '#6a7480';

    const _pill = (t, c) => `<span style="display:inline-flex;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;font-family:monospace;background:${c}18;border:1px solid ${c}44;color:${c}">${t}</span>`;
    const _btn  = (t, fn, c, dis) => {
        const bg = c==='gold'?'#1a1608':'#161b22';
        const bd = c==='gold'?'#c79a2a':'#21262d';
        const tc = c==='gold'?'#c79a2a':'#6b7280';
        return `<button ${dis?'':fn} ${dis?'disabled':''} style="background:${bg};border:1px solid ${bd};color:${tc};padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};opacity:${dis?.45:1};font-family:inherit;white-space:nowrap">${t}</button>`;
    };
    const _SEC = t => `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin:20px 0 8px;font-weight:600">${t}</div>`;

    const _LIFESTYLE_IMG = {
        attico_milano:       'assets/lifestyle/attico-citylife.jpg',
        villa_porto_cervo:   'assets/lifestyle/villa-porto-cervo.jpg',
        ufficio_wall_street: 'assets/lifestyle/ufficio-one-world-trade.jpg',
        jet_privato:         'assets/lifestyle/gulfstream-g700.jpg',
        yacht_lusso:         'assets/lifestyle/mega-yacht.jpg',
        villa_como:          'assets/lifestyle/villa-como.jpg',
        casino_montecarlo:   'assets/lifestyle/casino-montecarlo.jpg',
        penthouse_dubai:     'assets/lifestyle/penthouse-dubai.jpg',
    };

    const _lifestyleCard = (a) => {
        const isOwned   = owned.includes(a.id);
        const canAfford = gameState.cash >= a.price;
        const imgSrc    = _LIFESTYLE_IMG[a.id];

        const badges = [
            a.passive > 0      ? _pill('+€'+a.passive.toLocaleString()+'/g', '#1aa06a')     : '',
            a.repBonus > 0     ? _pill('+'+a.repBonus+'★ rep', '#c79a2a')                    : '',
            a.unlocksDiamond   ? _pill('Diamond', '#c79a2a')                                  : '',
            a.stockBonus > 0   ? _pill('+'+Math.round(a.stockBonus*100)+'% stocks', '#2f74c0'): '',
            a.intlUnlock       ? _pill('Rotte Intl', '#2f74c0')                               : '',
            a.staffBonus > 0   ? _pill('Staff +'+Math.round(a.staffBonus*100)+'%', '#7c5fc9') : '',
            a.energyBonus > 0  ? _pill('CEO +'+a.energyBonus+' energia', '#7c5fc9')           : '',
        ].filter(Boolean).join('');

        return `
        <div class="ls-card${isOwned?' ls-card-owned':''}">
            ${imgSrc ? `
            <div class="ls-card-img-wrap">
                <img src="${imgSrc}" alt="${a.name}" class="ls-card-img" loading="lazy">
                ${isOwned ? '<div class="ls-card-owned-badge">✓ Posseduto</div>' : ''}
                <div class="ls-card-img-overlay"></div>
                <div class="ls-card-img-title">
                    <div class="ls-card-name">${a.name}</div>
                    <div class="ls-card-location" style="color:#c79a2a">${a.location}</div>
                </div>
            </div>` : `
            <div class="ls-card-no-img" style="padding:14px 14px 4px;display:flex;align-items:center;gap:12px">
                <span style="font-size:28px">${a.icon}</span>
                <div>
                    <div class="ls-card-name">${a.name}</div>
                    <div class="ls-card-location" style="color:#c79a2a">${a.location}</div>
                </div>
            </div>`}
            <div style="padding:12px 14px">
                <div style="font-size:9px;color:#6b7280;line-height:1.5;margin-bottom:10px">${a.desc}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">${badges}</div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:13px;font-weight:700;color:#c79a2a;font-family:monospace">€${a.price.toLocaleString('it-IT')}</div>
                    ${isOwned
                        ? `<span style="font-size:9px;font-weight:700;color:#1aa06a;font-family:monospace">✓ NEL PORTFOLIO</span>`
                        : _btn('Acquista', ceAct('buyLifestyleAsset', [a.id]), 'gold', !canAfford)}
                </div>
            </div>
        </div>`;
    };

    const realEstate    = assets.filter(a => a.category === 'real_estate');
    const eliteVehicles = assets.filter(a => a.category === 'vehicle_elite');
    const diamondEligible = owned.some(id => assets.find(a => a.id === id && a.unlocksDiamond));

    let html = `
<div style="padding:16px;max-width:800px">

    <div style="padding-bottom:16px;border-bottom:1px solid #21262d;margin-bottom:16px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Lifestyle & Status</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3;letter-spacing:-.01em">Empire Portfolio</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${owned.length} asset · Rendita +€${dailyPassive.toLocaleString()}/g${intlUnlocked?' · Tratte internazionali attive':''}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Status CEO</div>
            <div style="font-size:16px;font-weight:700;color:${statusColor};font-family:monospace">${statusLabel}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Valore Portfolio</div>
            <div style="font-size:16px;font-weight:700;color:#c79a2a;font-family:monospace">€${(portfolioValue/1000).toFixed(0)}k</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Rendita Passiva</div>
            <div style="font-size:16px;font-weight:700;color:#1aa06a;font-family:monospace">+€${dailyPassive.toLocaleString()}<span style="font-size:10px">/g</span></div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Asset Posseduti</div>
            <div style="font-size:16px;font-weight:700;color:#e6edf3;font-family:monospace">${owned.length}<span style="font-size:11px;color:#6b7280">/${assets.length}</span></div>
        </div>
    </div>

    ${_SEC('Immobili di Lusso')}
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:4px">
        ${realEstate.map(_lifestyleCard).join('')}
    </div>

    ${_SEC('Mezzi Elite')}
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:4px">
        ${eliteVehicles.map(_lifestyleCard).join('')}
    </div>

    <div style="background:#161b22;border:1px solid #c79a2a;border-radius:6px;padding:14px;margin-top:20px">
        <div style="font-size:9px;color:#c79a2a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:600">Diamond Contracts</div>
        <div style="font-size:10px;color:#6b7280;line-height:1.5;margin-bottom:8px">Contratti ultra-premium riservati ai CEO con asset Lifestyle specifici. Pagamento da €20.000 a €80.000 per singolo contratto.</div>
        ${diamondEligible && (gameState.reputation||0) >= 4.5
            ? `<div style="font-size:10px;color:#1aa06a;font-weight:700">✓ Sei eleggibile — Contratti in arrivo via Inbox</div>`
            : `<div style="font-size:10px;color:#6b7280">Requisiti: asset Lifestyle + reputazione ≥ 4.5★ + Elite Wealth Manager</div>`}
    </div>

</div>`;

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}
window.renderTabLifestyle = renderTabLifestyle;

// ── SERVER DECREES STATE ──────────────────────────────────────────
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
    if (!pts || pts < 1) { if (typeof showNotification==='function') showNotification('Inserisci punti validi', 'error'); return; }
    if ((gameState.lobbyingPoints || 0) < pts) { if (typeof showNotification==='function') showNotification('Punti lobbying insufficienti', 'error'); return; }
    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_vote_server_decree', { v_decree_id: decreeId, v_points_spent: pts });
    if (error) { if (typeof showNotification==='function') showNotification(window.CE_Sec.userError('Voto non riuscito', error), 'error'); return; }
    gameState.lobbyingPoints = (gameState.lobbyingPoints || 0) - pts;
    if (typeof saveGame === 'function') saveGame();
    if (data.passed) {
        if (typeof showNotification==='function') showNotification(`Decreto approvato: ${data.title}!`, 'success');
    } else {
        if (typeof showNotification==='function') showNotification(`Voto registrato. (${data.votes_current}/${window._decreesState.decrees.find(d=>d.id===decreeId)?.votes_required||'?'})`, 'success');
    }
    await window.decreesRefresh(true);
    if (typeof renderTabPolitics === 'function') renderTabPolitics();
};
