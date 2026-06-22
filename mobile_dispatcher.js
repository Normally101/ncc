'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   mobile_dispatcher.js — Chauffeur Empire · Mobile Dispatcher App
   ═══════════════════════════════════════════════════════════════════════════ */

window.renderMobileDispatcher = function() {
    const root = document.getElementById('mobile-dispatcher');
    if (!root) return;
    root.classList.remove('hidden');
    root.classList.add('mobile-dispatcher-root');

    root.innerHTML = `
    <div class="mobile-header">
      <div class="mobile-header-left">
        <span class="mobile-logo">🚕</span>
        <div>
          <div class="mobile-company-name" id="mob-company">Chauffeur Empire</div>
          <div class="mobile-tagline">Dispatcher · Mobile HQ</div>
        </div>
      </div>
      <div class="mobile-header-right">
        <div class="mobile-stat-pill"><span>💰</span><span id="mob-cash">€0</span></div>
        <div class="mobile-stat-pill"><span>⭐</span><span id="mob-rep">0.0</span></div>
      </div>
    </div>
    <div class="mobile-section-title">Corse disponibili</div>
    <div id="mob-rides-list" class="mobile-rides-list">
      <div class="mobile-empty">Nessuna corsa disponibile</div>
    </div>
    <nav class="mobile-bottom-nav">
      <button ${ceAct('mobTab', ['dispatch'])} class="mob-nav-btn active" data-mob-tab="dispatch"><span>🚕</span><span>Dispatch</span></button>
      <button ${ceAct('mobTab', ['fleet'])} class="mob-nav-btn" data-mob-tab="fleet"><span>🚘</span><span>Flotta</span></button>
      <button ${ceAct('mobTab', ['finance'])} class="mob-nav-btn" data-mob-tab="finance"><span>💹</span><span>Finanza</span></button>
      <button ${ceAct('mobTab', ['ranking'])} class="mob-nav-btn" data-mob-tab="ranking"><span>🏆</span><span>Ranking</span></button>
      <button ${ceAct('mobTab', ['hub'])} class="mob-nav-btn" data-mob-tab="hub"><span>☰</span><span>Hub</span></button>
    </nav>`;

    _mobUpdateStats();
    _mobRefreshRides();
};

function _mobUpdateStats() {
    const cash = (typeof gameState !== 'undefined' && gameState?.cash) ? gameState.cash : 0;
    const rep  = (typeof gameState !== 'undefined' && gameState?.reputation) ? gameState.reputation : 0;
    const comp = (typeof gameState !== 'undefined' && gameState?.companyName) ? gameState.companyName : 'La Tua Azienda';
    const el = (id) => document.getElementById(id);
    if (el('mob-cash'))    el('mob-cash').textContent    = '€' + cash.toLocaleString('it-IT');
    if (el('mob-rep'))     el('mob-rep').textContent     = rep.toFixed(1) + '★';
    if (el('mob-company')) el('mob-company').textContent = comp;
}

function _mobRefreshRides() {
    const list = document.getElementById('mob-rides-list');
    if (!list) return;
    const rides = ((typeof gameState !== 'undefined' && gameState?.pendingRides) ? gameState.pendingRides : []).slice(0, 8);
    if (!rides.length) {
        list.innerHTML = '<div class="mobile-empty">Nessuna corsa disponibile — attendi...</div>';
        return;
    }
    list.innerHTML = rides.map((r, i) => `
    <div class="mob-ride-card" data-idx="${i}">
      <div class="mob-ride-top">
        <span class="mob-ride-tier">${_MOB_TIER_ICON[r.tier] || '🚕'} ${r.tier || 'Economy'}</span>
        <span class="mob-ride-earn">+€${(r.earnings || 0).toLocaleString('it-IT')}</span>
      </div>
      <div class="mob-ride-route">
        <span>📍 ${r.fromPoi?.name || r.from || '?'}</span>
        <span class="mob-route-arrow">→</span>
        <span>🏁 ${r.toPoi?.name || r.to || '?'}</span>
      </div>
      <div class="mob-ride-meta">
        <span>⏱ ${r.durationMin || '?'} min</span>
        <span>📏 ${r.distanceKm || '?'} km</span>
        ${r.vipClient ? '<span class="mob-vip">👑 VIP</span>' : ''}
      </div>
      <div class="mob-ride-actions">
        <button class="mob-btn-reject" ${ceAct('_mobRejectRide', [i])}>✕ Passa</button>
        <button class="mob-btn-accept" ${ceAct('_mobAcceptRide', [i])}>✓ Accetta</button>
      </div>
    </div>`).join('');
}

const _MOB_TIER_ICON = {
    economy:'🚕', business:'🚙', first:'🚘', vip:'💎', helicopter:'🚁', jet:'✈️'
};

window.mobTab = function(tab) {
    document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-mob-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    if (tab === 'dispatch') { _mobRefreshRides(); return; }
    if (tab === 'hub') { window.toggleHub?.(); return; }
    if (typeof window.switchTab === 'function') window.switchTab(tab);
};

window._mobAcceptRide = function(idx) {
    const rides = (typeof gameState !== 'undefined' && gameState?.pendingRides) ? gameState.pendingRides : [];
    const ride = rides[idx];
    if (!ride) return;
    // Assegna la corsa al primo autista disponibile (come fa la UI desktop)
    const driver = (gameState.drivers || []).find(d => d.status === 'idle' && d.id !== 'ceo');
    if (typeof window.assignRideToDriver === 'function') {
        if (driver) {
            window.assignRideToDriver(ride.id, driver.id);
        } else {
            // Nessun driver disponibile — affida al CEO
            const ceo = (gameState.drivers || []).find(d => d.id === 'ceo');
            if (ceo) window.assignRideToDriver(ride.id, ceo.id);
        }
    }
    setTimeout(_mobRefreshRides, 300);
};

window._mobRejectRide = function(idx) {
    if (typeof gameState !== 'undefined' && gameState?.pendingRides) {
        gameState.pendingRides.splice(idx, 1);
        _mobRefreshRides();
    }
};

setInterval(() => {
    if (!document.getElementById('mob-rides-list')) return;
    _mobUpdateStats();
    _mobRefreshRides();
}, 10000);
