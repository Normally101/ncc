'use strict';
/* ================================================================
   vip-buffs.js — Chauffeur Empire
   Buff system: _applyBuff, _getBuffValue, _pruneExpiredBuffs, _vipBuffTick.
   Private VIP helpers: _vipCooldownOk, _vipCreateRide, _vipFleetCar, etc.
   Loaded BEFORE vip-clients.js (provides shared helpers).
   Dipendenze: engine.js (gameState, logToMap, showNotification)
   ================================================================ */


// ─── BUFF SYSTEM ─────────────────────────────────────────────────────────────
// gameState.activeBuffs = [{id, type, value, until}]
// 'until' = game hours (day*24+hour). Types:
//   earnings_pct: +value% to final ride earnings
//   tip_pct:      +value% to tips only
//   vip_queue:    +value% chance VIP rides generate
//   fine_discount: next fine (or until expired) reduced by value%
//   speed_boost:  ride duration reduced by value%
//   fuel_lock:    fuel price locked at gameState.fuelPriceLock

window._applyBuff = function(id, type, value, durationGameHours) {
    if (!gameState.activeBuffs) gameState.activeBuffs = [];
    gameState.activeBuffs = gameState.activeBuffs.filter(b => b.id !== id);
    const until = gameState.day * 24 + gameState.hour + durationGameHours;
    gameState.activeBuffs.push({ id, type, value, until });
    logToMap(`✨ Buff attivo: ${id} (+${value}${type==='earnings_pct'?'% guadagni':type==='tip_pct'?'% mance':type==='fine_discount'?'% sconto multa':type==='speed_boost'?'% velocità':''}) per ${durationGameHours}h`);
};

window._getBuffValue = function(type) {
    if (!gameState.activeBuffs) return 0;
    const now = gameState.day * 24 + gameState.hour;
    return gameState.activeBuffs
        .filter(b => b.type === type && b.until > now)
        .reduce((s, b) => s + b.value, 0);
};

window._pruneExpiredBuffs = function() {
    if (!gameState.activeBuffs) return;
    const now = gameState.day * 24 + gameState.hour;
    const before = gameState.activeBuffs.length;
    gameState.activeBuffs = gameState.activeBuffs.filter(b => b.until > now);
    if (gameState.activeBuffs.length < before) {
        if (typeof renderTabEmails === 'function' && typeof _tabIs === 'function' && _tabIs('emails')) renderTabEmails();
    }
};

// Called from engine.js checkActiveTrips every tick
window._vipBuffTick = function() { window._pruneExpiredBuffs(); };

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _vipCooldownOk(key, minHours) {
    if (!gameState.vipCooldowns) gameState.vipCooldowns = {};
    const now = gameState.day * 24 + gameState.hour;
    return (gameState.vipCooldowns[key] || 0) + minHours <= now;
}

function _vipSetCooldown(key) {
    if (!gameState.vipCooldowns) gameState.vipCooldowns = {};
    gameState.vipCooldowns[key] = gameState.day * 24 + gameState.hour;
}

function _vipMailDot() {
    const dot = document.getElementById('mail-dot');
    if (dot) dot.classList.remove('hidden');
}

function _vipRandomPoi(excludeId) {
    const avail = Object.values(POIS).filter(p => gameState.unlockedRegions.includes(p.region) && p.id !== excludeId);
    return avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
}

function _vipRandomRoute() {
    const avail = Object.values(POIS).filter(p => gameState.unlockedRegions.includes(p.region));
    if (avail.length < 2) return null;
    const from = avail[Math.floor(Math.random() * avail.length)];
    const to   = _vipRandomPoi(from.id);
    return to ? { from, to } : null;
}

function _vipPushEmail(obj) {
    gameState.emails.push(obj);
    _vipMailDot();
}

function _vipResolveEmail(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (e) e.status = 'resolved';
}

function _vipRefreshUI() {
    if (typeof renderTabEmails === 'function' && typeof _tabIs === 'function' && _tabIs('emails')) renderTabEmails();
    if (typeof renderTabCorse  === 'function' && typeof _tabIs === 'function' && _tabIs('corse'))  renderTabCorse();
}

function _vipCreateRide(from, to, tier, price, clientId, overrides) {
    return Object.assign({
        id: gameState.nextId++,
        fromPoi: from, toPoi: to,
        tier, price,
        duration: from.region !== to.region ? 40000 : 20000,
        elapsed: 0,
        isVipRide: true,
        vipClientId: clientId
    }, overrides || {});
}

function _vipFleetCar(vcSet, minCond, requireNonEV, requireEV) {
    return gameState.fleet.find(c => {
        if (c.outOfService || c.isSeized) return false;
        if (!vcSet.includes(c.vehicleClass)) return false;
        if ((c.condition || 0) < minCond) return false;
        const isEV = typeof _isElectric === 'function' ? _isElectric(c) : false;
        if (requireNonEV && isEV) return false;
        if (requireEV && !isEV) return false;
        return true;
    });
}

function _vipAssignedDriver(carId, opts) {
    opts = opts || {};
    return gameState.drivers.find(d => {
        if (d.assignedCarId !== carId) return false;
        if (d.restHoursLeft > 0) return false;
        if (d.isOnStrike) return false;
        if (opts.minLevel && (d.level || 0) < opts.minLevel && d.tier !== 'ultra' && d.tier !== 'vip') return false;
        if (opts.maxStress !== undefined && (d.stress_level || 0) > opts.maxStress) return false;
        return true;
    });
}

