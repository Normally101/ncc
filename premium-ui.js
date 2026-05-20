'use strict';
/* ================================================================
   premium-ui.js — Chauffeur Empire
   Sidebar live stats, updateUI patch, hash routing, mobile toggle.
   Loaded LAST — after all other scripts are defined.
   ================================================================ */

// ── DISPATCH DIAGNOSTICS ─────────────────────────────────────────
// Run window.diagDispatch() in the browser console to diagnose
// why rides can't be assigned to drivers.

window.diagDispatch = function() {
    /* gameState is a top-level `let` in engine.js — not on window */
    const gs = (typeof gameState !== 'undefined') ? gameState : null;
    if (!gs) { console.error('gameState not found — try typing `gameState` directly in console'); return; }

    const TIER_COMPAT = {
        'ultra':    ['ultra'],
        'vip':      ['vip', 'ultra', 'group'],
        'business': ['business', 'vip', 'ultra', 'group'],
        'standard': ['standard', 'business', 'vip', 'ultra', 'group']
    };

    console.group('🔍 Dispatch Diagnostics');
    console.log(`Pending rides: ${gs.pendingRides.length}`);
    console.log(`Drivers: ${gs.drivers.length}`);
    console.log(`Fleet: ${gs.fleet.length}`);

    // Ride breakdown
    const contractRides   = gs.pendingRides.filter(r => r.isContract || r.vehicleRequired);
    const regularRides    = gs.pendingRides.filter(r => !r.isContract && !r.vehicleRequired);
    console.log(`Contract/vehicleRequired rides: ${contractRides.length}, Regular rides: ${regularRides.length}`);
    if (contractRides.length > 0) {
        const vreqs = [...new Set(contractRides.map(r => r.vehicleRequired))];
        console.log('vehicleRequired values in pending:', vreqs);
    }

    // Fleet vehicleClass summary
    const fleetClasses = gs.fleet.map(c => c.vehicleClass || '(none)');
    const classCounts = {};
    fleetClasses.forEach(c => { classCounts[c] = (classCounts[c]||0)+1; });
    console.log('Fleet vehicleClass breakdown:', classCounts);

    // Sample first regular ride (if any), else first contract
    const ride = regularRides[0] || gs.pendingRides[0];
    if (!ride) { console.warn('No pending rides'); console.groupEnd(); return; }
    console.log('Sample ride:', { id: ride.id, tier: ride.tier, vehicleRequired: ride.vehicleRequired, fromPoi: ride.fromPoi?.id, toPoi: ride.toPoi?.id });

    // Full _driverCanTakeRide mirror (including vehicleRequired)
    let counts = { ok:0, striking:0, noCar:0, outOfService:0, condition:0, tier:0, vehicleRequired:0, queueFull:0, resting:0 };
    gs.drivers.forEach(d => {
        if (d.status === 'striking')       { counts.striking++; return; }
        const car = gs.fleet.find(c => c.id === d.assignedCarId);
        if (!car)                           { counts.noCar++; return; }
        if (car.outOfService)              { counts.outOfService++; return; }
        if (car.condition <= 10)           { counts.condition++; return; }
        if (!TIER_COMPAT[ride.tier]?.includes(car.tier)) { counts.tier++; return; }
        if (ride.vehicleRequired && car.vehicleClass !== ride.vehicleRequired) { counts.vehicleRequired++; return; }
        if (d.queue.length >= 10)          { counts.queueFull++; return; }
        if (d.status === 'resting')        { counts.resting++; return; }
        counts.ok++;
    });
    console.table(counts);

    // Show first 3 drivers in detail
    console.group('First 3 drivers detail');
    gs.drivers.slice(0, 3).forEach(d => {
        const car = gs.fleet.find(c => c.id === d.assignedCarId);
        console.log(`${d.name}:`, {
            status: d.status,
            carTier: car?.tier,
            carVehicleClass: car?.vehicleClass,
            carCondition: car?.condition,
            carOutOfService: car?.outOfService,
            queue: d.queue.length,
            rideTier: ride.tier,
            rideVehicleRequired: ride.vehicleRequired,
            tierOK: car ? !!TIER_COMPAT[ride.tier]?.includes(car.tier) : false,
            vehicleClassOK: !ride.vehicleRequired || car?.vehicleClass === ride.vehicleRequired
        });
    });
    console.groupEnd();
    console.groupEnd();
};

// ── AVATAR INITIALS COLOR ─────────────────────────────────────────

function _avatarColor(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    const hue = Math.abs(h) % 360;
    return `hsl(${hue},40%,28%)`;
}

// ── SIDEBAR STATS UPDATE ──────────────────────────────────────────

window.updateSidebarStats = function() {
    if (typeof gameState === 'undefined') return;
    const gs = gameState;

    // Avatar + company name
    const name     = gs.companyName || 'CE';
    const initials = name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g, '').slice(0, 2).toUpperCase() || 'CE';
    const av = document.getElementById('sidebar-avatar');
    if (av) {
        av.textContent       = initials;
        av.style.background  = _avatarColor(name);
    }
    const sc = document.getElementById('sidebar-company');
    if (sc) sc.textContent = name;

    // XP bar — reputation 0–5 mapped to 0–100%
    const repVal = gs.reputation || 0;
    const xpPct  = Math.min(100, Math.round((repVal / 5) * 100));
    const xpBar  = document.getElementById('sidebar-xp-bar');
    const xpTxt  = document.getElementById('sidebar-xp-pct');
    if (xpBar) xpBar.style.width = xpPct + '%';
    if (xpTxt) xpTxt.textContent = xpPct + '%';

    // Reputation
    const repEl = document.getElementById('sidebar-rep');
    if (repEl) repEl.textContent = Number(repVal).toFixed(1);

    // Cash (compact: M / k)
    const cashEl = document.getElementById('sidebar-cash');
    if (cashEl) {
        const c = gs.cash || 0;
        cashEl.textContent = c >= 1e6
            ? '€' + (c / 1e6).toFixed(1) + 'M'
            : c >= 1e3
                ? '€' + Math.round(c / 1e3) + 'k'
                : '€' + Math.round(c).toLocaleString('it-IT');
    }

    // Fleet size
    const fleetEl = document.getElementById('sidebar-fleet');
    if (fleetEl) fleetEl.textContent = (gs.fleet || []).length;

    // Staff size
    const staffEl = document.getElementById('sidebar-staff');
    if (staffEl) staffEl.textContent = (gs.staff || []).length;

    // Day + time
    const dayEl  = document.getElementById('sidebar-day');
    const timeEl = document.getElementById('sidebar-time');
    if (dayEl)  dayEl.textContent  = gs.day || 1;
    if (timeEl) {
        const h = String(gs.hour   || 8).padStart(2, '0');
        const m = String(gs.minute || 0).padStart(2, '0');
        timeEl.textContent = `${h}:${m}`;
    }
};

// ── PATCH updateUI ────────────────────────────────────────────────

(function() {
    const _orig = window.updateUI;
    window.updateUI = function() {
        if (_orig) _orig.apply(this, arguments);
        window.updateSidebarStats();
    };
})();

// ── PATCH switchTab FOR HASH ROUTING ─────────────────────────────

(function() {
    // Wait until switchTab is defined (it's in dispatcher.js, already loaded)
    const _origSwitch = window.switchTab;
    if (!_origSwitch) { console.warn('[premium-ui] switchTab not yet defined — hash routing disabled'); return; }

    window.switchTab = function(tab) {
        _origSwitch.apply(this, arguments);
        if (tab && typeof history !== 'undefined') {
            history.replaceState(null, '', '#' + tab);
        }
    };
})();

// ── RESTORE TAB FROM URL HASH ON LOAD ────────────────────────────

window.addEventListener('load', function() {
    const VALID_TABS = [
        'corse','fleet','staff','emails','finance','marketing','showroom',
        'shadow','provinces','ranking','career','market','hq','regions',
        'politics','invest','realestate','crypto','b2b','contracts',
        'tourism','infrastructure','store','legal','help','auctions',
        'nemesis','opa'
    ];
    const hash = (window.location.hash || '').replace('#', '').trim();
    if (hash && VALID_TABS.includes(hash) && typeof window.switchTab === 'function') {
        window.switchTab(hash);
    }
    // Initial sidebar fill
    window.updateSidebarStats();
});

// ── MOBILE SIDEBAR TOGGLE ─────────────────────────────────────────

window.toggleSidebar = function(open) {
    const sidebar   = document.getElementById('sidebar-player');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const closeBtn  = document.getElementById('sidebar-close-btn');
    if (!sidebar) return;
    if (open) {
        sidebar.style.transform = 'translateX(0)';
        sidebar.style.boxShadow = '4px 0 24px rgba(0,0,0,0.8)';
        if (closeBtn)  closeBtn.classList.remove('hidden');
        if (toggleBtn) toggleBtn.classList.add('hidden');
    } else {
        sidebar.style.transform = 'translateX(-220px)';
        sidebar.style.boxShadow = '';
        if (closeBtn)  closeBtn.classList.add('hidden');
        if (toggleBtn) toggleBtn.classList.remove('hidden');
    }
};
