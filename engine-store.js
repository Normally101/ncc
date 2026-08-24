'use strict';
/* ================================================================
   engine-store.js — Chauffeur Empire
   Driver Coins boosters, Executive Pass, skip costruzioni/accademia.
   Dipendenze: engine.js (gameState, saveGame, logToMap,
   showNotification, showBigEvent, updateUI)
   ================================================================ */

// ── EXECUTIVE PASS ────────────────────────────────────────────────
window.activateExecutivePass = async function() {
    // Il prezzo lo decide il server dal listino (66_server_priced_purchases.sql):
    // qui non c'e' nessuna cifra, solo la richiesta di acquisto.
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'executive_pass');
    if (!esito) return;
    gameState.executivePassActive     = true;
    gameState.executivePassExpiresDay = gameState.day + 30;
    logToMap(`💎 Executive Pass attivato — 30 giorni di benefici premium! (${esito.spent} DC)`);
    showBigEvent('💎', 'Executive Pass Attivo!', '−50% stress accumulo, Insta-Repair a 1 DC, accesso a corse VIP extra.');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
};

// ── SALTA COSTRUZIONE (DC) ────────────────────────────────────────
window.skipConstruction = async function(invId) {
    const idx = (gameState.constructions || []).findIndex(c => c.invId === invId);
    if (idx === -1) { showNotification('Costruzione non trovata.', 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'skip_construction', 1);
    if (!esito) return;
    const constr = gameState.constructions[idx];
    gameState.constructions.splice(idx, 1);
    if (!gameState.investments) gameState.investments = [];
    if (!gameState.investments.includes(constr.invId)) gameState.investments.push(constr.invId);
    logToMap(`⚡ Costruzione completata istantaneamente: ${constr.invId} (${esito.spent} DC)`);
    showNotification(`⚡ Costruzione completata! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── BOOSTER: CARBURANTE FLOTTA ────────────────────────────────────
window.fuelBoostDC = async function() {
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'fuel_boost');
    if (!esito) return;
    (gameState.fleet || []).forEach(c => { c.fuel = 100; });
    logToMap(`⛽ Flotta rifornita al 100% istantaneamente! (${esito.spent} DC)`);
    showNotification(`⛽ Tutta la flotta è al 100% carburante! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── BOOSTER: SVEGLIA AUTISTA ──────────────────────────────────────
window.wakeDriverDC = async function(driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if (driver.status !== 'resting') { showNotification(`${driver.name} non è a riposo.`, 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'wake_driver', 1);
    if (!esito) return;
    driver.status = 'idle';
    driver.restHoursLeft = 0;
    driver.fatigue = Math.max(0, (driver.fatigue || 0) - 30);
    logToMap(`⚡ ${driver.name} risvegliato istantaneamente! (${esito.spent} DC)`);
    showNotification(`⚡ ${driver.name} è tornato disponibile! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: ENERGIA CEO ──────────────────────────────────────────
window.energyBoostDC = async function() {
    if ((gameState.energy || 0) >= 100) { showNotification('Energia CEO già al massimo.', 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'energy_boost');
    if (!esito) return;
    gameState.energy = 100;
    logToMap(`⚡ Energia CEO ripristinata al 100%! (${esito.spent} DC)`);
    showNotification(`⚡ Energia CEO al 100%! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
};

// ── BOOSTER: INSTA-HEAL AUTISTA ───────────────────────────────────
window.instaHealDC = async function(driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if ((driver.stress_level || 0) === 0 && driver.status !== 'resting' && !driver.burnout_until) {
        showNotification(`${driver.name} è già in forma.`, 'info'); return;
    }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'insta_heal', 1);
    if (!esito) return;
    driver.stress_level   = 0;
    driver.burnout_until  = null;
    driver.fatigue        = Math.max(0, (driver.fatigue || 0) - 50);
    if (driver.status === 'resting') { driver.status = 'idle'; driver.restHoursLeft = 0; }
    logToMap(`💊 ${driver.name}: stress azzerato istantaneamente! (${esito.spent} DC)`);
    showNotification(`💊 ${driver.name} è guarito! Stress → 0 (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: SVEGLIA TUTTI ────────────────────────────────────────
window.wakeAllDriversDC = async function() {
    const resting = (gameState.drivers || []).filter(d => d.id !== 'ceo' && d.status === 'resting');
    if (resting.length === 0) { showNotification('Nessun autista a riposo.', 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'wake_all_drivers', resting.length);
    if (!esito) return;
    resting.forEach(d => { d.status = 'idle'; d.restHoursLeft = 0; d.fatigue = Math.max(0, (d.fatigue || 0) - 30); });
    logToMap(`⏰ ${resting.length} autisti risvegliati (${esito.spent} DC)`);
    showNotification(`⏰ ${resting.length} autisti disponibili! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: GUARISCI TUTTI ───────────────────────────────────────
window.healAllDriversDC = async function() {
    const stressed = (gameState.drivers || []).filter(d => d.id !== 'ceo' && ((d.stress_level || 0) > 0 || d.burnout_until));
    if (stressed.length === 0) { showNotification('Staff già in forma.', 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'heal_all_drivers', stressed.length);
    if (!esito) return;
    stressed.forEach(d => {
        d.stress_level = 0; d.burnout_until = null;
        d.fatigue = Math.max(0, (d.fatigue || 0) - 50);
        if (d.status === 'resting') { d.status = 'idle'; d.restHoursLeft = 0; }
    });
    logToMap(`💊 Benessere staff ripristinato (${esito.spent} DC)`);
    showNotification(`💊 ${stressed.length} autisti guariti! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: SALTA TUTTI CORSI ────────────────────────────────────
window.skipAllAcademyDC = async function() {
    const entries = (gameState.driverAcademy || []).slice();
    if (entries.length === 0) { showNotification('Nessun corso attivo.', 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'academy_skip', entries.length);
    if (!esito) return;
    entries.forEach(entry => {
        const drv = gameState.drivers.find(d => d.id === entry.driverId);
        if (!drv) return;
        drv[entry.skill] = Math.min(100, (drv[entry.skill] || 50) + (entry.skillGain || 10));
        drv.status = 'idle';
    });
    gameState.driverAcademy = [];
    logToMap(`🎓 ${entries.length} corsi completati (${esito.spent} DC)`);
    showNotification(`🎓 ${entries.length} corsi completati! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── BOOSTER: SALTA TUTTE COSTRUZIONI ─────────────────────────────
window.skipAllConstructionsDC = async function() {
    const list = (gameState.constructions || []).slice();
    if (list.length === 0) { showNotification('Nessuna costruzione in corso.', 'info'); return; }
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'construction_skip', list.length);
    if (!esito) return;
    if (!gameState.investments) gameState.investments = [];
    list.forEach(c => { if (!gameState.investments.includes(c.invId)) gameState.investments.push(c.invId); });
    gameState.constructions = [];
    logToMap(`🏗️ ${list.length} costruzioni completate (${esito.spent} DC)`);
    showNotification(`🏗️ ${list.length} costruzioni pronte! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ── PACCHETTO OPERATIVO ───────────────────────────────────────────
window.opsBundleDC = async function() {
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'ops_bundle');
    if (!esito) return;
    (gameState.fleet || []).forEach(c => { c.fuel = 100; });
    gameState.energy = 100;
    (gameState.drivers || []).filter(d => d.id !== 'ceo' && d.status === 'resting').forEach(d => {
        d.status = 'idle'; d.restHoursLeft = 0; d.fatigue = Math.max(0, (d.fatigue || 0) - 30);
    });
    logToMap(`🚀 Pacchetto Operativo attivato (${esito.spent} DC)`);
    showNotification(`🚀 Pacchetto Operativo: flotta rifornita, CEO ricaricato, staff svegliato! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
};

// ── PACCHETTO IMPERIALE ───────────────────────────────────────────
window.fullBundleDC = async function() {
    const esito = await window.CE_money.acquistoDalListino('driver_coins', 'full_bundle');
    if (!esito) return;
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
    logToMap(`👑 Pacchetto Imperiale attivato (${esito.spent} DC)`);
    showNotification(`👑 Pacchetto Imperiale: tutto l'impero è al massimo! (−${esito.spent} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabPremiumStore === 'function') renderTabPremiumStore();
    if (typeof renderTabStaff === 'function') renderTabStaff();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};
