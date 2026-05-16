'use strict';
/* ================================================================
   global_events.js — Chauffeur Empire
   Espansione 4: Mega-Eventi Globali Stagionali
   ================================================================ */

window._globalEventsState = {
    events:     [],   // active + upcoming global events from Supabase
    _lastFetch: 0,
    _sub:       null,
};

// ── DATA LAYER ────────────────────────────────────────────────────────────────

window.globalEventsRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._globalEventsState._lastFetch < 120000) return; // 2-min cache
    window._globalEventsState._lastFetch = now;

    const sb = window.supabaseClient;
    if (!sb) return;

    // Sync statuses server-side first (idempotent)
    await sb.rpc('rpc_sync_global_event_status').catch(() => {});

    const { data, error } = await sb.rpc('rpc_get_active_global_events');
    if (!error && data) {
        window._globalEventsState.events = data;
        _applyGlobalEventBanner();
    }
};

// Returns merged effects object for all currently active global events
window.getGlobalEventEffects = function() {
    const now = Date.now();
    const active = window._globalEventsState.events.filter(e => {
        return e.status === 'active' || (new Date(e.starts_at) <= now && new Date(e.ends_at) > now);
    });

    const merged = {};
    for (const ev of active) {
        const fx = ev.effects || {};
        for (const [k, v] of Object.entries(fx)) {
            if (typeof v === 'number') {
                if (k.endsWith('Mult') || k.endsWith('Pct')) {
                    merged[k] = (merged[k] || 1.0) * v;
                } else {
                    merged[k] = Math.max(merged[k] || 0, v);
                }
            } else {
                merged[k] = v;
            }
        }
    }
    return merged;
};

// Current active event for display
window.getActiveGlobalEvent = function() {
    const now = Date.now();
    return window._globalEventsState.events.find(e =>
        new Date(e.starts_at) <= now && new Date(e.ends_at) > now
    ) || null;
};

// ── HUB BANNER ────────────────────────────────────────────────────────────────

function _applyGlobalEventBanner() {
    const ev = window.getActiveGlobalEvent();
    const banner = document.getElementById('hub-event-banner');
    if (!banner) return;

    if (!ev) {
        banner.classList.add('hidden');
        return;
    }

    banner.classList.remove('hidden');

    const iconEl = document.getElementById('hub-ev-icon');
    const nameEl = document.getElementById('hub-ev-name');
    const metaEl = document.getElementById('hub-ev-meta');
    const multEl = document.getElementById('hub-ev-mult');

    if (iconEl) iconEl.textContent = ev.icon;
    if (nameEl) nameEl.textContent = ev.name;

    if (metaEl) {
        const endsIn = new Date(ev.ends_at) - Date.now();
        const h = Math.floor(endsIn / 3600000);
        const d = Math.floor(h / 24);
        metaEl.textContent = d > 0 ? `Termina tra ${d}g ${h % 24}h` : `Termina tra ${h}h`;
    }

    if (multEl) {
        const fx = ev.effects || {};
        const tipM = fx.tipMult || 1.0;
        multEl.textContent = tipM > 1 ? `×${tipM.toFixed(1)}` : '🌍';
    }

    // Also sync with local gameState activeDynamicEvent so engine picks up effects
    if (typeof gameState !== 'undefined') {
        const fx = ev.effects || {};
        gameState.activeDynamicEvent = {
            id:           'global_' + ev.id,
            name:         ev.name,
            icon:         ev.icon,
            endsHour:     Infinity, // managed by globalEvents, not local timer
            tipMult:      fx.tipMult    || 1.0,
            xpMult:       fx.xpMult    || 1.0,
            fuelMult:     fx.fuelMult   || 1.0,
            wearMult:     fx.wearMult   || 1.0,
            speedMult:    fx.speedMult  || 1.0,
            extraRidePct: fx.extraRidePct || 0,
            forceAirport: fx.forceAirport || false,
        };
    }
}

// ── REALTIME ──────────────────────────────────────────────────────────────────

function _globalEventsSubscribe() {
    const sb = window.supabaseClient;
    if (!sb || window._globalEventsState._sub) return;

    window._globalEventsState._sub = sb
        .channel('global_events_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'global_events' }, () => {
            window._globalEventsState._lastFetch = 0;
            window.globalEventsRefresh(true);
        })
        .subscribe();
}

// ── TAB RENDERER (section within Hub or dedicated panel) ──────────────────────

window.renderGlobalEventPanel = function(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const events = window._globalEventsState.events;
    const now = Date.now();

    if (events.length === 0) {
        el.innerHTML = '<div class="text-[10px] text-gray-500 text-center py-4">Nessun evento globale attivo.</div>';
        return;
    }

    el.innerHTML = events.map(ev => {
        const isActive = new Date(ev.starts_at) <= now && new Date(ev.ends_at) > now;
        const startsIn = new Date(ev.starts_at) - now;
        const endsIn   = new Date(ev.ends_at) - now;
        const fx = ev.effects || {};

        const fxBadges = [
            fx.tipMult    > 1 ? `+${Math.round((fx.tipMult - 1) * 100)}% mance` : null,
            fx.xpMult     > 1 ? `+${Math.round((fx.xpMult - 1) * 100)}% XP` : null,
            fx.xpMult     < 1 ? `${Math.round((fx.xpMult - 1) * 100)}% XP` : null,
            fx.extraRidePct   ? `+${Math.round(fx.extraRidePct * 100)}% corse` : null,
            fx.fuelMult   > 1 ? `+${Math.round((fx.fuelMult - 1) * 100)}% carb.` : null,
            fx.wearMult   > 1 ? `+${Math.round((fx.wearMult - 1) * 100)}% usura` : null,
            fx.forceAirport   ? `✈️ Aeroporti prioritari` : null,
        ].filter(Boolean);

        const timeLabel = isActive
            ? `⏱ Termina tra ${Math.floor(endsIn / 3600000)}h`
            : `⏳ Inizia tra ${Math.floor(startsIn / 3600000)}h`;

        return `
          <div class="bg-white/3 border ${isActive ? 'border-gold/40' : 'border-white/8'} rounded-xl p-3 mb-2">
            <div class="flex justify-between items-start mb-1">
              <div class="font-bold text-sm ${isActive ? 'text-gold' : 'text-gray-300'}">${ev.icon} ${ev.name}</div>
              <div class="text-[9px] ${isActive ? 'text-gold' : 'text-gray-500'} shrink-0 ml-2">${timeLabel}</div>
            </div>
            <div class="text-[10px] text-gray-400 mb-2">${ev.description || ''}</div>
            <div class="flex flex-wrap gap-1">
              ${fxBadges.map(b => `<span class="text-[9px] bg-white/10 rounded px-1.5 py-0.5 text-gray-300">${b}</span>`).join('')}
            </div>
          </div>`;
    }).join('');
};

// ── INIT ──────────────────────────────────────────────────────────────────────

window.globalEventsInit = async function() {
    await window.globalEventsRefresh(true);
    _globalEventsSubscribe();

    // Refresh every 10 minutes
    setInterval(() => window.globalEventsRefresh(), 600000);

    // Announce active event
    const ev = window.getActiveGlobalEvent();
    if (ev && typeof showNotification === 'function') {
        showNotification(`🌍 Evento globale attivo: ${ev.icon} ${ev.name}!`, 'info');
    }
};
