'use strict';
/* ================================================================
   engine-store.js — Chauffeur Empire
   Driver Coins boosters, Executive Pass, skip costruzioni/accademia.
   Dipendenze: engine.js (gameState, saveGame, logToMap,
   showNotification, showBigEvent, updateUI)
   ================================================================ */

// ── EXECUTIVE PASS ────────────────────────────────────────────────
window.activateExecutivePass = function() {
    // Acquisto deciso dal server (rpc_economy_purchase): il client dichiara solo
    // COSA compra, il prezzo sta in economy_catalog e il saldo che vale e'
    // quello restituito dalla RPC.
    window.CE_money.acquistoServer('driver_coins_shop', 'executive_pass').then(ok => {
        if (!ok) return;
        gameState.executivePassActive     = true;
        gameState.executivePassExpiresDay = gameState.day + 30;
        logToMap('💎 Executive Pass attivato — 30 giorni di benefici premium!');
        showBigEvent('💎', 'Executive Pass Attivo!', '−50% stress accumulo, Insta-Repair a 1 DC, accesso a corse VIP extra.');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    });
};

// ── SALTA COSTRUZIONE (DC) ────────────────────────────────────────
window.skipConstruction = function(invId) {
    const cost = 8;
    const idx = (gameState.constructions || []).findIndex(c => c.invId === invId);
    if (idx === -1) { showNotification('Costruzione non trovata.', 'info'); return; }
    window.CE_money.acquistoServer('driver_coins_shop', 'skip_construction').then(ok => {
        if (!ok) return;
        const constr = gameState.constructions[idx];
        if (!constr) return;
        gameState.constructions.splice(idx, 1);
        if (!gameState.investments) gameState.investments = [];
        if (!gameState.investments.includes(constr.invId)) gameState.investments.push(constr.invId);
        logToMap(`⚡ Costruzione completata istantaneamente: ${constr.invId} (${cost} DC)`);
        showNotification(`⚡ Costruzione completata! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabInvestments === 'function') renderTabInvestments();
    });
};

// ── BOOSTER: CARBURANTE FLOTTA ────────────────────────────────────
window.fuelBoostDC = function() {
    const cost = 3;
    window.CE_money.acquistoServer('driver_coins_shop', 'fuel_boost').then(ok => {
        if (!ok) return;
        (gameState.fleet || []).forEach(c => { c.fuel = 100; });
        logToMap(`⛽ Flotta rifornita al 100% istantaneamente! (${cost} DC)`);
        showNotification(`⛽ Tutta la flotta è al 100% carburante! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabFleet === 'function') renderTabFleet();
    });
};

// ── BOOSTER: SVEGLIA AUTISTA ──────────────────────────────────────
window.wakeDriverDC = function(driverId) {
    const cost = 3;
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if (driver.status !== 'resting') { showNotification(`${driver.name} non è a riposo.`, 'info'); return; }
    window.CE_money.acquistoServer('driver_coins_shop', 'wake_driver').then(ok => {
        if (!ok) return;
        driver.status = 'idle';
        driver.restHoursLeft = 0;
        driver.fatigue = Math.max(0, (driver.fatigue || 0) - 30);
        logToMap(`⚡ ${driver.name} risvegliato istantaneamente! (${cost} DC)`);
        showNotification(`⚡ ${driver.name} è tornato disponibile! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabStaff === 'function') renderTabStaff();
    });
};

// ── BOOSTER: ENERGIA CEO ──────────────────────────────────────────
window.energyBoostDC = function() {
    const cost = 4;
    if ((gameState.energy || 0) >= 100) { showNotification('Energia CEO già al massimo.', 'info'); return; }
    window.CE_money.acquistoServer('driver_coins_shop', 'energy_boost').then(ok => {
        if (!ok) return;
        gameState.energy = 100;
        logToMap(`⚡ Energia CEO ripristinata al 100%! (${cost} DC)`);
        showNotification(`⚡ Energia CEO al 100%! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
    });
};

// ── BOOSTER: INSTA-HEAL AUTISTA ───────────────────────────────────
window.instaHealDC = function(driverId) {
    const cost = 2;
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if ((driver.stress_level || 0) === 0 && driver.status !== 'resting' && !driver.burnout_until) {
        showNotification(`${driver.name} è già in forma.`, 'info'); return;
    }
    window.CE_money.acquistoServer('driver_coins_shop', 'insta_heal').then(ok => {
        if (!ok) return;
        driver.stress_level   = 0;
        driver.burnout_until  = null;
        driver.fatigue        = Math.max(0, (driver.fatigue || 0) - 50);
        if (driver.status === 'resting') { driver.status = 'idle'; driver.restHoursLeft = 0; }
        logToMap(`💊 ${driver.name}: stress azzerato istantaneamente! (${cost} DC)`);
        showNotification(`💊 ${driver.name} è guarito! Stress → 0 (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabStaff === 'function') renderTabStaff();
    });
};

// ── BOOSTER: SVEGLIA TUTTI ────────────────────────────────────────
window.wakeAllDriversDC = function() {
    const resting = (gameState.drivers || []).filter(d => d.id !== 'ceo' && d.status === 'resting');
    if (resting.length === 0) { showNotification('Nessun autista a riposo.', 'info'); return; }
    const cost = Math.max(3, resting.length * 2);
    // Costo variabile: il client dichiara la QUANTITA' (n. autisti), il prezzo
    // unitario e il totale restano decisione del server.
    window.CE_money.acquistoServer('driver_coins_shop', 'wake_all_drivers', resting.length).then(ok => {
        if (!ok) return;
        resting.forEach(d => { d.status = 'idle'; d.restHoursLeft = 0; d.fatigue = Math.max(0, (d.fatigue || 0) - 30); });
        logToMap(`⏰ ${resting.length} autisti risvegliati (${cost} DC)`);
        showNotification(`⏰ ${resting.length} autisti disponibili! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
        if (typeof renderTabStaff === 'function') renderTabStaff();
    });
};

// ── BOOSTER: GUARISCI TUTTI ───────────────────────────────────────
window.healAllDriversDC = function() {
    const stressed = (gameState.drivers || []).filter(d => d.id !== 'ceo' && ((d.stress_level || 0) > 0 || d.burnout_until));
    if (stressed.length === 0) { showNotification('Staff già in forma.', 'info'); return; }
    const cost = Math.max(4, stressed.length * 2);
    window.CE_money.acquistoServer('driver_coins_shop', 'heal_all_drivers', stressed.length).then(ok => {
        if (!ok) return;
        stressed.forEach(d => {
            d.stress_level = 0; d.burnout_until = null;
            d.fatigue = Math.max(0, (d.fatigue || 0) - 50);
            if (d.status === 'resting') { d.status = 'idle'; d.restHoursLeft = 0; }
        });
        logToMap(`💊 Benessere staff ripristinato (${cost} DC)`);
        showNotification(`💊 ${stressed.length} autisti guariti! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
        if (typeof renderTabStaff === 'function') renderTabStaff();
    });
};

// ── BOOSTER: SALTA TUTTI CORSI ────────────────────────────────────
window.skipAllAcademyDC = function() {
    const entries = (gameState.driverAcademy || []).slice();
    if (entries.length === 0) { showNotification('Nessun corso attivo.', 'info'); return; }
    const cost = entries.length * 5;
    window.CE_money.acquistoServer('driver_coins_shop', 'skip_all_academy', entries.length).then(ok => {
        if (!ok) return;
        entries.forEach(entry => {
            const drv = gameState.drivers.find(d => d.id === entry.driverId);
            if (!drv) return;
            drv[entry.skill] = Math.min(100, (drv[entry.skill] || 50) + (entry.skillGain || 10));
            drv.status = 'idle';
        });
        gameState.driverAcademy = [];
        logToMap(`🎓 ${entries.length} corsi completati (${cost} DC)`);
        showNotification(`🎓 ${entries.length} corsi completati! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
        if (typeof renderTabStaff === 'function') renderTabStaff();
    });
};

// ── BOOSTER: SALTA TUTTE COSTRUZIONI ─────────────────────────────
window.skipAllConstructionsDC = function() {
    const list = (gameState.constructions || []).slice();
    if (list.length === 0) { showNotification('Nessuna costruzione in corso.', 'info'); return; }
    const cost = list.length * 8;
    window.CE_money.acquistoServer('driver_coins_shop', 'skip_all_constructions', list.length).then(ok => {
        if (!ok) return;
        if (!gameState.investments) gameState.investments = [];
        list.forEach(c => { if (!gameState.investments.includes(c.invId)) gameState.investments.push(c.invId); });
        gameState.constructions = [];
        logToMap(`🏗️ ${list.length} costruzioni completate (${cost} DC)`);
        showNotification(`🏗️ ${list.length} costruzioni pronte! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
        if (typeof renderTabInvestments === 'function') renderTabInvestments();
    });
};

// ── PACCHETTO OPERATIVO ───────────────────────────────────────────
window.opsBundleDC = function() {
    const cost = 9;
    window.CE_money.acquistoServer('driver_coins_shop', 'ops_bundle').then(ok => {
        if (!ok) return;
        (gameState.fleet || []).forEach(c => { c.fuel = 100; });
        gameState.energy = 100;
        (gameState.drivers || []).filter(d => d.id !== 'ceo' && d.status === 'resting').forEach(d => {
            d.status = 'idle'; d.restHoursLeft = 0; d.fatigue = Math.max(0, (d.fatigue || 0) - 30);
        });
        logToMap(`🚀 Pacchetto Operativo attivato (${cost} DC)`);
        showNotification(`🚀 Pacchetto Operativo: flotta rifornita, CEO ricaricato, staff svegliato! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    });
};

// ── PACCHETTO IMPERIALE ───────────────────────────────────────────
window.fullBundleDC = function() {
    const cost = 35;
    window.CE_money.acquistoServer('driver_coins_shop', 'full_bundle').then(ok => {
        if (!ok) return;
        (gameState.fleet || []).forEach(c => { c.fuel = 100; });
        gameState.energy = 100;
        (gameState.drivers || []).filter(d => d.id !== 'ceo').forEach(d => {
            if (d.status === 'resting') { d.status = 'idle'; d.restHoursLeft = 0; }
            d.stress_level = 0; d.burnout_until = null; d.fatigue = Math.max(0, (d.fatigue || 0) - 60);
        });
        const entries = (gameState.driverAcademy || []).slice();
        entries.forEach(entry => {
            const drv = gameState.drivers.find(d => d.id === entry.driverId);
            if (!drv) return;
            drv[entry.skill] = Math.min(100, (drv[entry.skill] || 50) + (entry.skillGain || 10));
            drv.status = 'idle';
        });
        gameState.driverAcademy = [];
        const constructions = (gameState.constructions || []).slice();
        if (!gameState.investments) gameState.investments = [];
        constructions.forEach(c => { if (!gameState.investments.includes(c.invId)) gameState.investments.push(c.invId); });
        gameState.constructions = [];
        logToMap(`👑 Pacchetto Imperiale attivato (${cost} DC)`);
        showNotification(`👑 Pacchetto Imperiale: tutto l'impero è al massimo! (−${cost} DC)`, 'success');
        updateUI(); saveGame();
        if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
        if (typeof renderTabStaff === 'function') renderTabStaff();
        if (typeof renderTabInvestments === 'function') renderTabInvestments();
    });
};
