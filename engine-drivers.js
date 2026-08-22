'use strict';
/* ================================================================
   engine-drivers.js — Chauffeur Empire
   Azioni player sui driver: assunzione, licenziamento, riposo,
   bonus, accademia, specializzazioni, sciopero.
   Dipendenze: engine.js (gameState, saveGame, logToMap,
   showNotification, showBigEvent, _sendDriverToRest, _tabIs,
   updateUI, ACADEMY_COURSES), data.js (DRIVER_SPECIALTIES)
   ================================================================ */

// ── MANDA IN RIPOSO ───────────────────────────────────────────────
window.sendDriverToRest = function(driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver || driver.status === 'busy' || driver.status === 'resting') return;
    _sendDriverToRest(driver, 6);
    logToMap(`🛌 ${driver.name} mandato in riposo manuale.`);
    if (typeof showNotification === 'function') showNotification(`${driver.name} in riposo per 6h.`, 'success');
    if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
    if (_tabIs('staff') && typeof renderTabStaff === 'function') renderTabStaff();
};

// ── PAUSA / STRESS ────────────────────────────────────────────────
window.putDriverOnBreak = function(driverId) {
    const d = gameState.drivers.find(x => x.id === driverId);
    if (!d) return;
    if (d.status === 'busy') { showNotification('Autista in servizio — attendi che finisca la corsa.', 'error'); return; }
    if (d.status === 'resting') { showNotification(`${d.name} è già a riposo.`, 'info'); return; }
    _sendDriverToRest(d, 4);
    d.stress_level = Math.max(0, (d.stress_level || 0) - 40);
    logToMap(`☕ ${d.name} in pausa 4h — stress −40%.`);
    showNotification(`☕ ${d.name} in pausa. Stress ridotto.`, 'success');
    saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
    if (typeof renderTabCorse  === 'function') renderTabCorse();
};

// ── BONUS MONETARIO ───────────────────────────────────────────────
window.payDriverBonus = function(driverId, amount) {
    amount = Math.round(Number(amount));
    if (amount <= 0) return;
    const d = gameState.drivers.find(x => x.id === driverId);
    if (!d) return;
    if (!window.CE_money.spend(amount, 'driver_bonus')) return;
    d.satisfaction = Math.min(100, (d.satisfaction || 0) + Math.min(40, amount / 100));
    d.morale = Math.min(100, (d.morale || 100) + 15);
    logToMap(`💸 Bonus €${amount.toLocaleString()} pagato a ${d.name} — soddisfazione +${Math.min(40, Math.round(amount/100))}`);
    showNotification(`Bonus pagato a ${d.name}!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── AZZERA STRESS (€1.000) ────────────────────────────────────────
window.payStressClear = function(driverId) {
    const cost = 1000;
    const d = gameState.drivers.find(x => x.id === driverId);
    if (!d || d.id === 'ceo') return;
    if ((d.stress_level || 0) === 0 && !d.burnout_until) { showNotification(`${d.name} non è stressato.`, 'info'); return; }
    if (!window.CE_money.spend(cost, 'pay_stress_clear')) return;
    d.stress_level = 0;
    d.burnout_until = null;
    if (d.status === 'resting' && (d.restHoursLeft || 0) > 0) { d.status = 'idle'; d.restHoursLeft = 0; }
    logToMap(`💸 Bonus Stress €1.000 pagato a ${d.name} — stress azzerato istantaneamente`);
    showNotification(`✅ Stress di ${d.name} azzerato! (€1.000)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── RISOLVI SCIOPERO ──────────────────────────────────────────────
window.resolveStrike = function(driverId) {
    const d = gameState.drivers.find(x => x.id === driverId);
    if (!d || !d.isOnStrike) return;
    const settlementCost = Math.round((d.salary || 2500) * 0.5);
    if (!window.CE_money.spend(settlementCost, 'resolve_strike')) return;
    d.isOnStrike = false;
    d.status = 'idle';
    d.satisfaction = 60;
    d.morale = Math.min(100, (d.morale || 50) + 20);
    logToMap(`🤝 Accordo sindacale: ${d.name} rientra al lavoro (costo: €${settlementCost.toLocaleString()})`);
    showBigEvent('🤝', `${d.name}: Sciopero Risolto`, `Pagato accordo sindacale di €${settlementCost.toLocaleString()}. L'autista è tornato operativo.`);
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── ACCADEMIA AUTISTI ─────────────────────────────────────────────
const ACADEMY_COURSES = [
    { id:'lang',    name:'Lingue Straniere',    skill:'skill_charisma',   skillGain:12, cost:2500,  hours:8,  desc:'+12 Carisma — sblocca clienti VIP internazionali' },
    { id:'defense', name:'Guida Difensiva',     skill:'skill_efficiency', skillGain:10, cost:1800,  hours:8,  desc:'+10 Efficienza — riduce consumo carburante e usura' },
    { id:'vip',     name:'Protocollo VIP',      skill:'skill_charisma',   skillGain:18, cost:4200,  hours:16, desc:'+18 Carisma — accede alle corse Ultra premium' },
    { id:'speed',   name:'Guida Sportiva',      skill:'skill_speed',      skillGain:15, cost:3000,  hours:12, desc:'+15 Velocità — tempi di percorrenza ridotti' },
    { id:'stamina', name:'Gestione Stress',     skill:'skill_efficiency', skillGain:8,  cost:1500,  hours:6,  desc:'+8 Efficienza — burnout più lento' },
];
window.ACADEMY_COURSES = ACADEMY_COURSES;

window.startAcademyCourse = function(driverId, courseId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    const course = ACADEMY_COURSES.find(c => c.id === courseId);
    if (!driver || !course) return;
    if (driver.status === 'busy') { showNotification('Autista in servizio.', 'error'); return; }
    if ((gameState.driverAcademy||[]).some(c => c.driverId === driverId)) {
        showNotification(`${driver.name} è già in formazione.`, 'error'); return;
    }
    if (!window.CE_money.spend(course.cost, 'start_academy_course')) return;
    if (!gameState.driverAcademy) gameState.driverAcademy = [];
    gameState.driverAcademy.push({
        driverId, skill: course.skill, skillGain: course.skillGain,
        courseName: course.name,
        completesHour: gameState.day * 24 + gameState.hour + course.hours,
    });
    _sendDriverToRest(driver, course.hours);
    logToMap(`🎓 ${driver.name} inizia "${course.name}" (${course.hours}h, €${course.cost.toLocaleString()})`);
    showNotification(`🎓 ${driver.name} in formazione: ${course.name}`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

window.skipAcademyTraining = function(driverId) {
    const cost = 5;
    const entry = (gameState.driverAcademy || []).find(c => c.driverId === driverId);
    if (!entry) { showNotification('Nessun corso attivo per questo autista.', 'info'); return; }
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    if (!window.CE_money.spendDC(cost, 'skip_academy')) return;
    driver[entry.skill] = Math.min(100, (driver[entry.skill] || 50) + (entry.skillGain || 10));
    gameState.driverAcademy = gameState.driverAcademy.filter(c => c.driverId !== driverId);
    driver.status = 'idle';
    logToMap(`⚡ ${driver.name} — corso completato istantaneamente! (${cost} DC)`);
    showNotification(`⚡ ${driver.name}: corso completato! +${entry.skillGain} ${entry.skill.replace('skill_','')}`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};

// ── ASSUNZIONE / LICENZIAMENTO ────────────────────────────────────
window.hireDriver = function hireDriver(name, salary) {
    if (!name) return;
    const cost = salary * 2;
    if (!window.CE_money.spend(cost, 'hire_driver')) return;
    const recruit = (gameState.availableRecruits || []).find(r => r.name === name);
    gameState.drivers.push({
        id: 'd_' + Date.now(), name, salary, status: 'idle', assignedCarId: null, queue: [],
        // Monte ore coda di base (decisione Vlad 22/08/2026): la scala vive in
        // engine-rides.js (DRIVER_QUEUE_HOURS); i salvataggi vecchi non hanno il
        // campo e _getDriverQueueCapMs li riporta comunque a 4h.
        queueHours: (typeof DRIVER_QUEUE_HOURS !== 'undefined' ? DRIVER_QUEUE_HOURS.base : 4),
        fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100,
        trait: recruit?.trait || null, upgrades: [], hiredDay: gameState.day,
        skill_efficiency: recruit?.skill_efficiency ?? 50,
        skill_charisma:   recruit?.skill_charisma   ?? 50,
        skill_speed:      recruit?.skill_speed      ?? 50,
        stress_level: 0, burnout_until: null,
    });
    const idx = (gameState.availableRecruits || []).findIndex(r => r.name === name);
    if (idx > -1) gameState.availableRecruits.splice(idx, 1);
    _refreshRecruits();
    if(typeof showNotification==='function') showNotification(`${name} assunto!`, 'success');
    updateUI(); saveGame();
    if(typeof renderTabStaff==='function') renderTabStaff();
};

window.fireDriver = function fireDriver(driverId) {
    const idx = gameState.drivers.findIndex(d => d.id === driverId);
    if (idx === -1) return;
    const driver = gameState.drivers[idx];
    // Un autista 'busy' è assegnato a una corsa attiva (ride.driverId punta a lui):
    // rimuoverlo ora lascerebbe quel riferimento orfano — la corsa completa comunque
    // (completeRide gestisce driver mancante) ma l'auto assegnata torna libera subito,
    // riassegnabile a un altro autista mentre la corsa vecchia è ancora "in corso".
    // Stesso guard già usato per l'Accademia (startAcademyCourse) e altrove nel file.
    if (driver.status === 'busy') { if (typeof showNotification === 'function') showNotification(`${driver.name} è in servizio — attendi che finisca la corsa prima di licenziarlo.`, 'error'); return; }
    gameState.drivers.splice(idx, 1);
    if(typeof showNotification==='function') showNotification(`${driver.name} licenziato.`, 'error');
    if(typeof saveGame==='function') saveGame();
    if(typeof renderTabStaff==='function') renderTabStaff();
};

window.setDriverAvatar = function(driverId, input) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver || !input.files || !input.files[0]) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        driver.avatarBase64 = e.target.result;
        saveGame();
        if (typeof renderTabStaff === 'function') renderTabStaff();
    };
    reader.readAsDataURL(file);
};

window.assignSpecialty = function(driverId, specialtyId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if (!driver) return;
    const spec = (typeof DRIVER_SPECIALTIES !== 'undefined' ? DRIVER_SPECIALTIES : []).find(s => s.id === specialtyId);
    if (!spec) return;
    driver.specialty = specialtyId;
    showNotification(`${driver.name}: specializzazione ${spec.name} assegnata!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabStaff === 'function') renderTabStaff();
};
