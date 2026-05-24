'use strict';
/* ui-hub.js — Chauffeur Empire
   Smart Hub overlay: toggleHub, openHub, closeHub, hubNavigate.
   Dipendenze: engine.js, dispatcher.js */

window.toggleHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    const isHidden = modal.classList.contains('hidden');
    if (isHidden) { window.openHub(); } else { window.closeHub(); }
};

window.openHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('hub-modal-open');
    _updateHubStats();
    // Clear event badge
    if (typeof gameState !== 'undefined') gameState._hubNewEvent = false;
    const badge = document.getElementById('hub-event-badge');
    if (badge) badge.classList.add('hidden');
};

window.closeHub = function() {
    const modal = document.getElementById('hub-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('hub-modal-open');
};

window.hubNavigate = function(tab) {
    window.closeHub();
    setTimeout(() => { if (typeof switchTab === 'function') switchTab(tab); }, 80);
};

function _updateHubStats() {
    if (typeof gameState === 'undefined') return;
    const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

    const cashEl = document.getElementById('hub-cash');
    const repEl  = document.getElementById('hub-rep');
    const dayEl  = document.getElementById('hub-day');
    const timeEl = document.getElementById('hub-time');
    const logoEl = document.getElementById('hub-company-logo');
    const nameEl = document.getElementById('hub-company-name');

    const c = gameState.cash || 0;
    const cashStr = c >= 1e9 ? `€${(c/1e9).toFixed(2)}B` : c >= 1e6 ? `€${(c/1e6).toFixed(2)}M` : c >= 1e3 ? `€${Math.floor(c/1e3)}k` : `€${Math.floor(c)}`;
    if (cashEl) cashEl.innerText = cashStr;
    if (repEl)  repEl.innerText  = `${(gameState.reputation||0).toFixed(1)}★`;
    if (dayEl)  dayEl.innerText  = `${gameState.day||1} ${MONTHS[(gameState.month||1)-1]}`;
    if (timeEl) timeEl.innerText = `${String(gameState.hour||8).padStart(2,'0')}:${String(gameState.minute||0).padStart(2,'0')}`;
    if (logoEl) logoEl.innerText = gameState.companyLogo || '👁️';
    if (nameEl) nameEl.innerText = gameState.companyName || 'Chauffeur Empire';

    // Module badges
    const ridesEl   = document.getElementById('hmod-rides');
    const staffEl   = document.getElementById('hmod-staff');
    const mailEl    = document.getElementById('hmod-mail');
    const strikeEl  = document.getElementById('hmod-strike');
    const unread = (gameState.emails||[]).filter(e=>e.status==='unread').length;
    const striking = (gameState.drivers||[]).filter(d=>d.isOnStrike).length;
    if (ridesEl) ridesEl.innerText = (gameState.pendingRides||[]).length;
    if (staffEl) staffEl.innerText = (gameState.drivers||[]).filter(d=>d.id!=='ceo').length;
    if (mailEl)  { mailEl.innerText = unread; mailEl.classList.toggle('hidden', unread === 0); }
    if (strikeEl) strikeEl.classList.toggle('hidden', striking === 0);

    // Espansione 11: badge nemici VIP
    const nemBadge = document.getElementById('hmod-nemesis');
    if (nemBadge) {
        const nemCount = Object.keys(gameState.vipNemeses || {}).length;
        nemBadge.textContent = nemCount;
        nemBadge.classList.toggle('hidden', nemCount === 0);
    }

    // Active event banner
    const ev = gameState.activeDynamicEvent;
    const banner = document.getElementById('hub-event-banner');
    if (banner) {
        if (ev) {
            banner.classList.remove('hidden');
            const evIcon = document.getElementById('hub-ev-icon');
            const evName = document.getElementById('hub-ev-name');
            const evMeta = document.getElementById('hub-ev-meta');
            const evMult = document.getElementById('hub-ev-mult');
            const hoursLeft = Math.max(0, ev.endsHour - ((gameState.day||1)*24 + (gameState.hour||0)));
            if (evIcon) evIcon.innerText = ev.icon || '🎬';
            if (evName) evName.innerText = ev.name;
            if (evMeta) evMeta.innerText = `${(ev.rarity||'').toUpperCase()} · ${(ev.category||'')} · ${hoursLeft}h rimaste`;
            if (evMult) evMult.innerText = `×${ev.priceMult||1}${ev.surge?' +SURGE':''}`;
            banner.style.borderColor = ev.rarity === 'legendary' ? 'rgba(212,175,55,0.5)' : ev.rarity === 'epic' ? 'rgba(168,85,247,0.5)' : 'rgba(59,130,246,0.4)';
        } else {
            banner.classList.add('hidden');
        }
    }
}
window._updateHubStats = _updateHubStats;

