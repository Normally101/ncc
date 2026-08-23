'use strict';
/* ================================================================
   engine-store.js — Chauffeur Empire
   Driver Coins boosters, Executive Pass, skip costruzioni/accademia.
   Dipendenze: engine.js (gameState, saveGame, logToMap,
   showNotification, showBigEvent, updateUI)
   ================================================================ */

// ── EXECUTIVE PASS ────────────────────────────────────────────────
window.activateExecutivePass = async function() {
    // Forma server-authoritative: il prezzo lo decide la RPC (dc_item_prices).
    const esito = await window.CE_money.acquistoDC('executive_pass');
    if (!esito) return;
    const cost = esito.spent;
    gameState.executivePassActive     = true;
    gameState.executivePassExpiresDay = gameState.day + 30;
    logToMap('💎 Executive Pass attivato — 30 giorni di benefici premium!');
    showBigEvent('💎', 'Executive Pass Attivo!', '−50% stress accumulo, Insta-Repair a 1 DC, accesso a corse VIP extra.');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
};

// ── SALTA COSTRUZIONE (DC) ────────────────────────────────────────
window.skipConstruction = async function(invId) {
    const idx = (gameState.constructions || []).findIndex(c => c.invId === invId);
    if (idx === -1) { showNotification('Costruzione non trovata.', 'info'); return; }
    // Prezzo deciso dal server (skip_construction × 1 unita').
    const esito = await window.CE_money.acquistoDC('skip_construction', 1);
    if (!esito) return;
    const cost = esito.spent;
    const constr = gameState.constructions[idx];
    gameState.constructions.splice(idx, 1);
    if (!gameState.investments) gameState.investments = [];
    if (!gameState.investments.includes(constr.invId)) gameState.investments.push(constr.invId);
    logToMap(`⚡ Costruzione completata istantaneamente: ${constr.invId} (${cost} DC)`);
    showNotification(`⚡ Costruzione completata! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── BOOSTER: CARBURANTE FLOTTA ────────────────────────────────────
window.fuelBoostDC = async function() {
    const esito = await window.CE_money.acquistoDC('fuel_boost');
    if (!esito) return;
    const cost = esito.spent;
    (gameState.fleet || []).forEach(c => { c.fuel = 100; });
    logToMap(`⛽ Flotta rifornita al 100% istantaneamente! (${cost} DC)`);
    showNotification(`⛽ Tutta la flotta è al 100% carburante! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── BOOSTER: SVEGLIA AUTISTA ──────────────────────────────────────
window.wakeDriverDC = async function(driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if (driver.status !== 'resting') { showNotification(`${driver.name} non è a riposo.`, 'info'); return; }
    const esito = await window.CE_money.acquistoDC('wake_driver', 1);
    if (!esito) return;
    const cost = esito.spent;
    driver.status = 'idle';
    driver.restHoursLeft = 0;
    driver.fatigue = Math.max(0, (driver.fatigue || 0) - 30);
    logToMap(`⚡ ${driver.name} risvegliato istantaneamente! (${cost} DC)`);
    showNotification(`⚡ ${driver.name} è tornato disponibile! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: ENERGIA CEO ──────────────────────────────────────────
window.energyBoostDC = async function() {
    if ((gameState.energy || 0) >= 100) { showNotification('Energia CEO già al massimo.', 'info'); return; }
    const esito = await window.CE_money.acquistoDC('energy_boost');
    if (!esito) return;
    const cost = esito.spent;
    gameState.energy = 100;
    logToMap(`⚡ Energia CEO ripristinata al 100%! (${cost} DC)`);
    showNotification(`⚡ Energia CEO al 100%! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
};

// ── BOOSTER: INSTA-HEAL AUTISTA ───────────────────────────────────
window.instaHealDC = async function(driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if ((driver.stress_level || 0) === 0 && driver.status !== 'resting' && !driver.burnout_until) {
        showNotification(`${driver.name} è già in forma.`, 'info'); return;
    }
    const esito = await window.CE_money.acquistoDC('insta_heal', 1);
    if (!esito) return;
    const cost = esito.spent;
    driver.stress_level   = 0;
    driver.burnout_until  = null;
    driver.fatigue        = Math.max(0, (driver.fatigue || 0) - 50);
    if (driver.status === 'resting') { driver.status = 'idle'; driver.restHoursLeft = 0; }
    logToMap(`💊 ${driver.name}: stress azzerato istantaneamente! (${cost} DC)`);
    showNotification(`💊 ${driver.name} è guarito! Stress → 0 (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: SVEGLIA TUTTI ────────────────────────────────────────
window.wakeAllDriversDC = async function() {
    const resting = (gameState.drivers || []).filter(d => d.id !== 'ceo' && d.status === 'resting');
    if (resting.length === 0) { showNotification('Nessun autista a riposo.', 'info'); return; }
    // Il server conosce il prezzo unitario e il minimo: il client manda solo le unita'.
    const esito = await window.CE_money.acquistoDC('wake_all_drivers', resting.length);
    if (!esito) return;
    const cost = esito.spent;
    resting.forEach(d => { d.status = 'idle'; d.restHoursLeft = 0; d.fatigue = Math.max(0, (d.fatigue || 0) - 30); });
    logToMap(`⏰ ${resting.length} autisti risvegliati (${cost} DC)`);
    showNotification(`⏰ ${resting.length} autisti disponibili! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: GUARISCI TUTTI ───────────────────────────────────────
window.healAllDriversDC = async function() {
    const stressed = (gameState.drivers || []).filter(d => d.id !== 'ceo' && ((d.stress_level || 0) > 0 || d.burnout_until));
    if (stressed.length === 0) { showNotification('Staff già in forma.', 'info'); return; }
    const esito = await window.CE_money.acquistoDC('heal_all_drivers', stressed.length);
    if (!esito) return;
    const cost = esito.spent;
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
};

// ── BOOSTER: SALTA TUTTI CORSI ────────────────────────────────────
window.skipAllAcademyDC = async function() {
    const entries = (gameState.driverAcademy || []).slice();
    if (entries.length === 0) { showNotification('Nessun corso attivo.', 'info'); return; }
    const esito = await window.CE_money.acquistoDC('academy_skip', entries.length);
    if (!esito) return;
    const cost = esito.spent;
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
};

// ── BOOSTER: SALTA TUTTE COSTRUZIONI ─────────────────────────────
window.skipAllConstructionsDC = async function() {
    const list = (gameState.constructions || []).slice();
    if (list.length === 0) { showNotification('Nessuna costruzione in corso.', 'info'); return; }
    const esito = await window.CE_money.acquistoDC('skip_construction', list.length);
    if (!esito) return;
    const cost = esito.spent;
    if (!gameState.investments) gameState.investments = [];
    list.forEach(c => { if (!gameState.investments.includes(c.invId)) gameState.investments.push(c.invId); });
    gameState.constructions = [];
    logToMap(`🏗️ ${list.length} costruzioni completate (${cost} DC)`);
    showNotification(`🏗️ ${list.length} costruzioni pronte! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── PACCHETTO OPERATIVO ───────────────────────────────────────────
window.opsBundleDC = async function() {
    const esito = await window.CE_money.acquistoDC('ops_bundle');
    if (!esito) return;
    const cost = esito.spent;
    (gameState.fleet || []).forEach(c => { c.fuel = 100; });
    gameState.energy = 100;
    (gameState.drivers || []).filter(d => d.id !== 'ceo' && d.status === 'resting').forEach(d => {
        d.status = 'idle'; d.restHoursLeft = 0; d.fatigue = Math.max(0, (d.fatigue || 0) - 30);
    });
    logToMap(`🚀 Pacchetto Operativo attivato (${cost} DC)`);
    showNotification(`🚀 Pacchetto Operativo: flotta rifornita, CEO ricaricato, staff svegliato! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
};

// ── PACCHETTO IMPERIALE ───────────────────────────────────────────
window.fullBundleDC = async function() {
    const esito = await window.CE_money.acquistoDC('full_bundle');
    if (!esito) return;
    const cost = esito.spent;
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
};
