'use strict';
/* ================================================================
   engine-fleet.js — Chauffeur Empire
   Azioni player sulla flotta: riparazione, carburante, skin,
   upgrade, leasing, hub, mercato auto, aste.
   Dipendenze: engine.js (gameState, saveGame, logToMap,
   showNotification, showBigEvent, hasInvestment, _isElectric,
   refillVehicle, _retryOutOfServiceVehicles, updateUI, _tabIs,
   POIS, CAR_UPGRADES, PROTOTYPE_CARS, ServerState)
   ================================================================ */

// ── SUPERCHARGER (EV) ─────────────────────────────────────────────
window.superchargeVehicle = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car || !_isElectric(car)) return;
    const charge = car.chargeLevel ?? 100;
    if (charge >= 100) { showNotification('Batteria già al 100%!', 'error'); return; }
    const cost = 80;
    const result = await window.ServerState?.refuelVehicle(car._serverId, 0, cost);
    if (!result) return;
    car.chargeLevel = 100;
    if (car.outOfService === 'fuel') car.outOfService = null;
    logToMap(`⚡ ${car.name}: ricaricata al Supercharger. −€${cost}`);
    showNotification(`⚡ Supercharger: batteria al 100% · −€${cost}`, 'success');
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── PRESSIONE GOMME ───────────────────────────────────────────────
window.refillTires = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.tirePressure === undefined) car.tirePressure = 0;
    const missing = 100 - car.tirePressure;
    if (missing <= 0) { showNotification('Pressione gomme ottimale!', 'error'); return; }
    const cost = Math.ceil(missing * 0.8);
    const result = await window.ServerState?.refillCarTires(car._serverId, cost);
    if (!result) return;
    car.tirePressure = 100;
    logToMap(`🔧 ${car.name}: pressione gomme ripristinata. (−€${cost})`);
    if (typeof closeModals === 'function') closeModals();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    saveGame();
};

// ── RIPARAZIONE CONDIZIONI ────────────────────────────────────────
window.repairVehicle = function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    const missing = 100 - Math.max(0, Math.floor(car.condition || 0));
    if (missing <= 0) { showNotification('Veicolo già in ottime condizioni!', 'info'); return; }
    const hasMech = gameState.staff.some(s => s.id === 'mech');
    const contractDisc = (gameState.maintenanceContract && gameState.day <= gameState.maintenanceContractPaidUntilDay) ? 0.70 : 1.0;
    const mechDisc     = hasMech ? 0.50 : 1.0;
    const baseCost = Math.max(500, missing * 85);
    const cost = Math.round(baseCost * contractDisc * mechDisc);
    if ((car.engineHealth !== undefined) && car.engineHealth <= 0) {
        showNotification('⚙️ Motore fuso — usa "Ripara Motore" prima di riparare la carrozzeria.', 'error');
        return;
    }
    if (gameState.cash < cost) { showNotification(`Fondi insufficienti — Riparazione: €${cost.toLocaleString()}`, 'error'); return; }
    gameState.cash -= cost;
    car.condition = 100;
    car.outOfService = null;
    let discLabel = '';
    if (contractDisc < 1 && hasMech) discLabel = ' (−30% contratto + −50% Capo Officina)';
    else if (contractDisc < 1) discLabel = ' (−30% contratto)';
    else if (hasMech) discLabel = ' (−50% Capo Officina)';
    logToMap(`🔧 ${car.name} riparata: 100% (€${cost.toLocaleString()}${discLabel})`);
    showNotification(`✅ ${car.name} riparata!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── RIPARAZIONE MOTORE ────────────────────────────────────────────
window.repairEngine = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if ((car.engineHealth || 100) >= 100) { showNotification('Il motore è già in perfette condizioni.', 'error'); return; }
    const damage     = 100 - (car.engineHealth || 100);
    const repairCost = Math.max(800, damage * 180);
    const result = await window.ServerState?.repairVehicle(car._serverId, repairCost);
    if (!result) return;
    car.engineHealth = 100;
    if (car.outOfService === 'engine') car.outOfService = null;
    logToMap(`🔧 ${car.name}: motore riparato. −€${repairCost.toLocaleString()}`);
    showNotification(`✅ Motore di ${car.name} riparato! −€${repairCost.toLocaleString()}`, 'success');
    if (typeof closeModals === 'function') closeModals();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    saveGame();
};

// ── INSTA-REPAIR (DC) ─────────────────────────────────────────────
window.instantRepairDC = function(carId) {
    const cost = gameState.executivePassActive ? 1 : 2;
    if ((gameState.driverCoins || 0) < cost) { showNotification(`DC insufficienti — servono ${cost} DC.`, 'error'); return; }
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if ((car.condition || 0) >= 100) { showNotification('Veicolo già al 100%.', 'info'); return; }
    gameState.driverCoins -= cost;
    car.condition = 100;
    car.outOfService = null;
    logToMap(`⚡ ${car.name} riparata istantaneamente (${cost} DC)!`);
    showNotification(`⚡ ${car.name} riparata! (−${cost} DC)`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── CARBURANTE STANDARD ───────────────────────────────────────────
window.buyStandardFuel = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.engineHealth <= 0) { showNotification('⚙️ Motore fuso! Ripara prima il motore.', 'error'); return; }
    const fuelNeeded = 100 - (car.fuel || 0);
    if (fuelNeeded < 1) { showNotification('Il serbatoio è già pieno!', 'error'); return; }
    const litres = fuelNeeded * 0.5;
    const price  = gameState.fuelPrice || 1.85;
    const cost   = Math.floor(litres * price);
    const result = await window.ServerState?.refuelVehicle(car._serverId, Math.ceil(litres), cost);
    if (!result) return;
    car.fuel = 100;
    if (car.outOfService === 'fuel') car.outOfService = null;
    logToMap(`⛽ ${car.name}: rifornito al distributore. −€${cost}`);
    showNotification(`⛽ Rifornimento standard: +${Math.floor(fuelNeeded)}% · −€${cost}`, 'success');
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── GASOLIO AGRICOLO (black market) ──────────────────────────────
window.buyBlackMarketFuel = async function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.engineHealth <= 0) { showNotification('⚙️ Motore fuso! Ripara prima il motore.', 'error'); return; }
    const fuelNeeded = 100 - (car.fuel || 0);
    if (fuelNeeded < 1) { showNotification('Il serbatoio è già pieno!', 'error'); return; }
    const litres = fuelNeeded * 0.5;
    const price  = (gameState.fuelPrice || 1.85) * 0.60;
    const cost   = Math.floor(litres * price);
    const result = await window.ServerState?.refuelVehicle(car._serverId, Math.ceil(litres), cost);
    if (!result) return;
    car.fuel = 100;
    if (car.outOfService === 'fuel') car.outOfService = null;
    logToMap(`⛽🖤 ${car.name}: rifornito con gasolio agricolo. −€${cost}`);
    showNotification(`⛽ Gasolio agricolo: +${Math.floor(fuelNeeded)}% · −€${cost}`, 'success');
    if (Math.random() < 0.10) {
        car.engineHealth = Math.max(0, (car.engineHealth || 100) - 20);
        logToMap(`⚙️ RISCHIO MOTORE: ${car.name} danneggiato (${car.engineHealth}%)!`);
        showNotification(`⚠️ Gasolio agricolo ha danneggiato il motore di ${car.name}! Salute motore: ${car.engineHealth}%`, 'error');
        if (car.engineHealth <= 0) {
            car.outOfService = 'engine';
            showNotification(`🔴 MOTORE FUSO: ${car.name} necessita riparazione urgente!`, 'error');
        }
    }
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── DEPOSITO CARBURANTE AZIENDALE ─────────────────────────────────
const _DEPOT_LEVELS = [
    { level: 1, capacity: 10000,  priceDiscount: 0.00, name: 'Cisterna Base' },
    { level: 2, capacity: 20000,  priceDiscount: 0.02, name: 'Cisterna Doppia' },
    { level: 3, capacity: 35000,  priceDiscount: 0.05, name: 'Deposito Professionale' },
    { level: 4, capacity: 50000,  priceDiscount: 0.08, name: 'Mega-Depot' },
    { level: 5, capacity: 80000,  priceDiscount: 0.12, name: 'Hub Logistico' },
];

window.buyFuelForDepot = function(litres) {
    if (!hasInvestment('inv_fuel_depot')) { showNotification('Acquista prima il Deposito Carburante!', 'error'); return; }
    const cap = gameState.fuelTankCapacity || 10000;
    const space = cap - (gameState.fuelTank || 0);
    const actual = Math.min(litres, space);
    if (actual <= 0) { showNotification('Deposito già pieno!', 'error'); return; }
    const lobbyDiscount  = (gameState.activeLobbyLaws || []).includes('law_fuel_subsidy') ? 0.70 : 1.0;
    const depotLvlData   = _DEPOT_LEVELS.find(d => d.level === (gameState.fuelTankLevel || 1)) || _DEPOT_LEVELS[0];
    const depotDiscount  = 1.0 - (depotLvlData.priceDiscount || 0);
    const _consorzioFuelDiscount = ((window._sindacatoState || {}).consorzioMembersCount >= 3) ? 0.95 : 1.0;
    // Bottega del Consorzio — perk carburante attivo (fuel_save)
    const _allyFuelDiscount = (typeof window._allyPerkMult === 'function') ? window._allyPerkMult('fuel') : 1.0;
    const fuelDiscount   = lobbyDiscount * depotDiscount * _consorzioFuelDiscount * _allyFuelDiscount;
    const cost = Math.floor(actual * (gameState.fuelPrice || 1.85) * fuelDiscount);
    if (gameState.cash < cost) { showNotification(`Fondi insufficienti! Servono €${cost.toLocaleString()}`, 'error'); return; }
    gameState.cash -= cost;
    gameState.fuelTank = (gameState.fuelTank || 0) + actual;
    logToMap(`🛢️ Deposito: +${actual.toLocaleString()}L a €${(gameState.fuelPrice||1.85).toFixed(2)}/L. Costo −€${cost.toLocaleString()}`);
    showNotification(`🛢️ +${actual.toLocaleString()}L nel deposito!`, 'success');
    _retryOutOfServiceVehicles();
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

window.getDepotLevelData = function() {
    const lvl = gameState.fuelTankLevel || 1;
    return _DEPOT_LEVELS.find(d => d.level === lvl) || _DEPOT_LEVELS[0];
};

window.emergencyRefuel = function() {
    const stoppedCars = gameState.fleet.filter(c => c.outOfService === 'fuel');
    if (stoppedCars.length === 0) { showNotification('Nessuna auto ferma per carburante.', 'info'); return; }
    const litresNeeded = stoppedCars.length * 80;
    const emergencyPrice = (gameState.fuelPrice || 1.85) * 3;
    const cost = Math.ceil(litresNeeded * emergencyPrice);
    if (gameState.cash < cost) {
        showNotification(`Fondi insufficienti per il rifornimento di emergenza! Servono €${cost.toLocaleString()}`, 'error'); return;
    }
    gameState.cash -= cost;
    stoppedCars.forEach(car => { car.fuel = 100; car.outOfService = null; });
    logToMap(`🚨 Rifornimento emergenza: ${stoppedCars.length} auto rifornite al triplo prezzo. Costo: −€${cost.toLocaleString()}`);
    showNotification(`🚨 ${stoppedCars.length} auto rifornite! −€${cost.toLocaleString()} (3× tariffa emergenza)`, 'error');
    _retryOutOfServiceVehicles();
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

window.upgradeFuelDepot = function() {
    if (!hasInvestment('inv_fuel_depot')) { showNotification('Acquista prima il Deposito Carburante!', 'error'); return; }
    const lvl  = gameState.fuelTankLevel || 1;
    const next = _DEPOT_LEVELS.find(d => d.level === lvl + 1);
    if (!next) { showNotification('Deposito già al livello massimo!', 'info'); return; }
    const cost = Math.round(5000 * Math.pow(lvl, 1.8));
    if (gameState.cash < cost) { showNotification(`Fondi insufficienti! Servono €${cost.toLocaleString()}`, 'error'); return; }
    gameState.cash -= cost;
    gameState.fuelTankLevel = next.level;
    gameState.fuelTankCapacity = next.capacity;
    logToMap(`🏗️ Mega-Depot potenziato: ${next.name} (${(next.capacity/1000).toFixed(0)}kL, −${(next.priceDiscount*100).toFixed(0)}% carburante)`);
    showBigEvent('🏗️', 'Deposito Potenziato!', `${next.name} attivo. Capacità: ${next.capacity.toLocaleString()}L. Sconto carburante: −${(next.priceDiscount*100).toFixed(0)}%.`);
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

window.buyTiresForDepot = function(sets) {
    if (!hasInvestment('inv_fuel_depot')) { showNotification('Attiva prima il Deposito Aziendale!', 'error'); return; }
    const costPerSet = 800;
    const cost = sets * costPerSet;
    if (gameState.cash < cost) { showNotification(`Fondi insufficienti! Servono €${cost.toLocaleString()}`, 'error'); return; }
    gameState.cash -= cost;
    gameState.depositoGomme = (gameState.depositoGomme || 0) + sets;
    logToMap(`🔧 Deposito: +${sets} treni di gomme. (Totale: ${gameState.depositoGomme})`);
    showNotification(`🔧 +${sets} treni di gomme nel deposito!`, 'success');
    _retryOutOfServiceVehicles();
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── UPGRADE VEICOLO ───────────────────────────────────────────────
window.buyCARUpgrade = function(carId, upgradeId) {
    const car = gameState.fleet.find(c => c.id === carId);
    const upg = CAR_UPGRADES.find(u => u.id === upgradeId);
    if (!car || !upg) return;
    if (!car.upgrades) car.upgrades = [];
    if (car.upgrades.includes(upgradeId)) { showNotification('Upgrade già installato!', 'error'); return; }
    if (gameState.cash < upg.price) { showNotification('Fondi insufficienti!', 'error'); return; }
    gameState.cash -= upg.price;
    car.upgrades.push(upgradeId);
    showNotification(`${upg.name} installato su ${car.name}!`, 'success');
    logToMap(`🔧 Upgrade: ${upg.name} su ${car.name}`);
    updateUI();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    if (typeof closeModals === 'function') closeModals();
    saveGame();
};

// ── GREY MARKET ACCETTA ───────────────────────────────────────────
window.acceptGreyMarket = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email || email.type !== 'grey_market') return;
    const { fromId, toId, price, isLong } = email.greyRideData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;
    const ride = {
        id: gameState.nextId++, fromPoi: from, toPoi: to,
        tier: 'vip', price, duration: isLong ? 40000 : 20000, elapsed: 0,
        isGreyMarket: true
    };
    gameState.pendingRides.push(ride);
    email.status = 'resolved';
    logToMap(`🕵️ Corsa anonima accettata: ${from.name} → ${to.name}. Stai attento ai posti di blocco!`);
    showNotification(`🕵️ Missione discreta: ${from.name} → ${to.name}`, 'success');
    if (typeof renderTabEmails === 'function') renderTabEmails();
    if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
    saveGame();
};

// ── RITORNA ALL'HUB ───────────────────────────────────────────────
window.returnToHub = function(carId) {
    const car    = gameState.fleet.find(c => c.id === carId);
    const driver = gameState.drivers.find(d => d.assignedCarId === carId && d.id !== 'ceo');
    if (!car || !driver) return;
    if (driver.status !== 'idle') {
        if (typeof showNotification === 'function') showNotification('Autista non disponibile.', 'error'); return;
    }
    if (car.currentPoiId === 'roma' || !car.currentPoiId) {
        if (typeof showNotification === 'function') showNotification('Veicolo già all\'Hub.', 'info'); return;
    }
    const fromPoi = POIS[car.currentPoiId];
    const hubPoi  = POIS['roma'];
    if (!fromPoi || !hubPoi) return;
    const R = 6371;
    const dLat = (hubPoi.lat - fromPoi.lat) * Math.PI / 180;
    const dLng = (hubPoi.lng - fromPoi.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(fromPoi.lat*Math.PI/180) * Math.cos(hubPoi.lat*Math.PI/180) * Math.sin(dLng/2)**2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const avgSpeedKmh = 90;
    const travelHours = Math.max(1, Math.ceil(distKm / avgSpeedKmh));
    const fuelCost    = Math.round(distKm * 0.18);
    const hasTelepass = hasInvestment('inv_telepass') || (car.upgrades||[]).includes('telepass_car');
    const tollCost    = hasTelepass ? 0 : Math.round(distKm * 0.08);
    const totalCost   = fuelCost + tollCost;
    if (gameState.cash < totalCost) {
        if (typeof showNotification === 'function') showNotification(`Fondi insufficienti per il rientro (€${totalCost}).`, 'error'); return;
    }
    gameState.cash -= totalCost;
    driver.status        = 'resting';
    driver.restHoursLeft = travelHours;
    driver._returning    = true;
    if (typeof logToMap === 'function') logToMap(`🏠 ${driver.name} in rientro da ${fromPoi.name} (${Math.round(distKm)} km, ${travelHours}h). Costo: €${totalCost}.`);
    if (typeof showNotification === 'function') showNotification(`🏠 ${driver.name} in rientro all'Hub — ${travelHours}h, €${totalCost} (carb.+pedaggi).`, 'info');
    if (typeof renderTabFleet === 'function') renderTabFleet();
    if (typeof updateUI === 'function') updateUI();
};

// ── CONTRATTO MANUTENZIONE ────────────────────────────────────────
window.buyMaintenanceContract = function() {
    const cost = 10000;
    if (gameState.cash < cost) { showNotification('Fondi insufficienti (€10.000).', 'error'); return; }
    gameState.cash -= cost;
    gameState.maintenanceContract = true;
    gameState.maintenanceContractPaidUntilDay = gameState.day + 7;
    logToMap('📋 Contratto di Manutenzione attivato — riparazioni −30% per 7 giorni.');
    showNotification('📋 Contratto Manutenzione attivo! Riparazioni −30% per 7 giorni.', 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── STRATEGIA TARIFFARIA ──────────────────────────────────────────
window.setPricingStrategy = function(mode) {
    if (!['discount', 'standard', 'premium'].includes(mode)) return;
    gameState.pricingStrategy = mode;
    const labels = { discount: '📉 Scontato', standard: '⚖️ Standard', premium: '💎 Premium' };
    logToMap(`💼 Strategia tariffaria: ${labels[mode]}`);
    showNotification(`Strategia: ${labels[mode]}`, 'success');
    saveGame();
    if (typeof renderTabMarketing === 'function') renderTabMarketing();
};

// ── SKIN VEICOLO ──────────────────────────────────────────────────
const VEHICLE_SKINS = [
    { id:'matte_black',   name:'Nero Opaco',        cost:10, color:'#1a1a1a', border:'#333' },
    { id:'gold_chrome',   name:'Cromo Oro',          cost:15, color:'#d4af37', border:'#b8960c' },
    { id:'carbon_fiber',  name:'Fibra di Carbonio',  cost:12, color:'#2d2d2d', border:'#555' },
    { id:'pearl_white',   name:'Bianco Perla',       cost:8,  color:'#f0f0f8', border:'#ccc' },
    { id:'midnight_blue', name:'Blu Notte',          cost:10, color:'#1a1a4e', border:'#2a2a8e' },
    { id:'racing_red',    name:'Rosso Racing',       cost:12, color:'#8b0000', border:'#cc0000' },
];
window.VEHICLE_SKINS = VEHICLE_SKINS;

window.applyVehicleSkin = function(carId, skinId) {
    const car  = gameState.fleet.find(c => c.id === carId);
    const skin = VEHICLE_SKINS.find(s => s.id === skinId);
    if (!car || !skin) return;
    const cost = skin.cost;
    if ((gameState.driverCoins || 0) < cost) { showNotification(`DC insufficienti — Skin: ${cost} DC`, 'error'); return; }
    gameState.driverCoins -= cost;
    car.skin = skinId;
    logToMap(`🎨 ${car.name}: skin "${skin.name}" applicata (${cost} DC)`);
    showNotification(`🎨 ${skin.name} applicata a ${car.name}!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── TERMINA LEASING ───────────────────────────────────────────────
window.terminateLease = function(carId) {
    const idx = gameState.fleet.findIndex(c => c.id === carId);
    if (idx === -1) return;
    const car = gameState.fleet[idx];
    if (!car.isLease) return;
    const remainingDays  = Math.max(0, car.leaseDuration * 30 - (car.leaseElapsedDays || 0));
    const remainingMonths = Math.ceil(remainingDays / 30);
    const monthly  = car.leaseMonthlyRate || Math.round((car.dailyCost || 0) * 30);
    const penalty  = Math.round(remainingMonths * monthly * 0.5);
    if (!confirm(
        `Terminare anticipatamente il leasing di "${car.name}"?\n\n` +
        `Mesi rimanenti: ${remainingMonths}\n` +
        `Penale (50% mesi rimanenti): €${penalty.toLocaleString()}\n\n` +
        `Premere OK per confermare.`
    )) return;
    if (gameState.cash < penalty) {
        showNotification(`Fondi insufficienti per la penale: €${penalty.toLocaleString()}`, 'error'); return;
    }
    gameState.cash -= penalty;
    const driver = (gameState.drivers || []).find(d => d.assignedCarId === carId);
    if (driver) driver.assignedCarId = null;
    gameState.fleet.splice(idx, 1);
    if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});
    showBigEvent('📋', 'Leasing Terminato', `${car.name} restituita al concessionario. Penale applicata: €${penalty.toLocaleString()}.`);
    logToMap(`📋 Leasing "${car.name}" terminato anticipatamente — penale €${penalty.toLocaleString()}`);
    updateUI();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    if (typeof saveGame === 'function') saveGame();
};

// ── PROTOTIPO ESCLUSIVO ───────────────────────────────────────────
window.buyPrototypeCar = function(protoId) {
    if (typeof PROTOTYPE_CARS === 'undefined') return;
    const proto = PROTOTYPE_CARS.find(p => p.id === protoId);
    if (!proto) return;
    if (gameState.fleet.some(f => f.protoId === protoId)) { showNotification('Hai già questo prototipo!', 'error'); return; }
    if (gameState.reputation < proto.reqRep) { showNotification(`Reputazione insufficiente! Serve ${proto.reqRep}★`, 'error'); return; }
    const _protoRides = gameState.questStats?.totalRides || 0;
    if ((proto.rideGate || 0) > _protoRides) { showNotification(`Sblocco non raggiunto! Servono ${proto.rideGate} corse completate — hai ${_protoRides}.`, 'error'); return; }
    if (proto.fuel === 'electric' && !gameState.hasEVHub) { showNotification('Infrastruttura mancante: costruisci l\'Hub di Ricarica Corporate prima di acquistare veicoli EV.', 'error'); return; }
    if (gameState.cash < proto.price) { showNotification('Fondi insufficienti!', 'error'); return; }
    gameState.cash -= proto.price;
    gameState.fleet.push({ id: 'c_proto_' + Date.now(), name: proto.name, tier: proto.tier, condition: 100, isLease: false, fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100, outOfService: null, upgrades: [], protoId: proto.id, vehicleClass: proto.vehicleClass || 'mercedes_e' });
    showBigEvent('🔬', `${proto.name} Acquisita!`, proto.desc);
    logToMap(`🔬 Prototipo: ${proto.name} aggiunta alla flotta!`);
    updateUI();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    saveGame();
};

// ── HUB CONQUEST ─────────────────────────────────────────────────
window.buyHub = function(hubId) {
    const hub = typeof POIS !== 'undefined' ? POIS[hubId] : null;
    if (!hub) return;
    if ((gameState.ownedHubs || []).includes(hubId)) { showNotification('Hub già controllato.', 'info'); return; }
    const cost = 50000 + Math.floor(hub.baseFlat * 200);
    const repReq = 2.5;
    if ((gameState.reputation || 0) < repReq) { showNotification(`Reputazione insufficiente (min ${repReq}★).`, 'error'); return; }
    if (gameState.cash < cost) { showNotification(`Fondi insufficienti — Concessione Hub: €${cost.toLocaleString()}`, 'error'); return; }
    gameState.cash -= cost;
    if (!gameState.ownedHubs) gameState.ownedHubs = [];
    gameState.ownedHubs.push(hubId);
    logToMap(`🏛️ Hub conquistato: ${hub.name} — tassa del 5% su ogni corsa!`);
    showBigEvent('🏛️', `Hub Conquistato: ${hub.name}!`, `Ora intaschi il 5% su ogni corsa che origina o termina qui. Difendilo dalla concorrenza!`);
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

window.sellHub = function(hubId) {
    const hub = typeof POIS !== 'undefined' ? POIS[hubId] : null;
    if (!hub) return;
    const idx = (gameState.ownedHubs || []).indexOf(hubId);
    if (idx === -1) return;
    const resaleValue = Math.floor((50000 + Math.floor(hub.baseFlat * 200)) * 0.6);
    gameState.ownedHubs.splice(idx, 1);
    gameState.cash += resaleValue;
    logToMap(`💰 Hub ${hub.name} ceduto — +€${resaleValue.toLocaleString()} (60% del costo)`);
    showNotification(`Hub ${hub.name} ceduto. +€${resaleValue.toLocaleString()}`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
};

// ── MERCATO AUTO NPC ──────────────────────────────────────────────
window.listCarForSale = function(carId, askPrice) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.isLimitedEdition) { showNotification('Le edizioni limitate non possono essere messe in vendita.', 'error'); return; }
    if ((gameState.marketplace||[]).some(l => l.carId === carId)) { showNotification('Veicolo già in vendita.', 'info'); return; }
    const driver = gameState.drivers.find(d => d.assignedCarId === carId && d.id !== 'ceo');
    if (driver && driver.status === 'busy') { showNotification('Autista in servizio — impossibile vendere.', 'error'); return; }
    if (!gameState.marketplace) gameState.marketplace = [];
    if (driver) driver.assignedCarId = null;
    gameState.marketplace.push({ id: 'm_' + Date.now(), carId, askPrice, listedDay: gameState.day });
    logToMap(`🏪 ${car.name} messa in vendita a €${askPrice.toLocaleString()}`);
    showNotification(`${car.name} in vendita! Un acquirente arriverà in 1-2 giorni.`, 'success');
    saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    if (typeof renderTabMarket === 'function') renderTabMarket();
};

window.cancelListing = function(listingId) {
    if (!gameState.marketplace) return;
    const idx = gameState.marketplace.findIndex(l => l.id === listingId);
    if (idx === -1) return;
    gameState.marketplace.splice(idx, 1);
    showNotification('Annuncio rimosso.', 'success');
    saveGame();
    if (typeof renderTabMarket === 'function') renderTabMarket();
};

window.buyNpcCar = function(listingId) {
    const listing = (gameState.npcMarket || []).find(l => l.id === listingId);
    if (!listing) return;
    if (gameState.cash < listing.price) { showNotification(`Fondi insufficienti — €${listing.price.toLocaleString()}`, 'error'); return; }
    gameState.cash -= listing.price;
    const newCar = {
        id: 'c_' + Date.now(), name: listing.name, tier: listing.tier,
        vehicleClass: listing.vehicleClass || 'mercedes_e',
        condition: listing.condition, isLease: false, fuel: 60,
        mileage: listing.mileage, tirePressure: 80, engineHealth: 100, outOfService: null, upgrades: [],
    };
    gameState.fleet.push(newCar);
    gameState.npcMarket = (gameState.npcMarket || []).filter(l => l.id !== listingId);
    logToMap(`🚗 Acquistata: ${listing.name} a €${listing.price.toLocaleString()} (cond. ${listing.condition}%)`);
    showNotification(`✅ ${listing.name} aggiunta alla flotta!`, 'success');
    updateUI(); saveGame();
    if (typeof renderTabFleet === 'function') renderTabFleet();
    if (typeof renderTabMarket === 'function') renderTabMarket();
};

// ── ASTA LIVE ─────────────────────────────────────────────────────
window.bidOnAuction = function(amount) {
    const auc = gameState.activeAuction;
    if (!auc) return;
    amount = Math.round(Number(amount));
    if (amount <= auc.currentBid) { showNotification(`Offerta troppo bassa — minimo €${(auc.currentBid+1000).toLocaleString()}`, 'error'); return; }
    if (gameState.cash < amount) { showNotification('Liquidità insufficiente per questa offerta.', 'error'); return; }
    if (auc.playerBid) gameState.cash += auc.playerBid;
    gameState.cash -= amount;
    auc.playerBid   = amount;
    auc.currentBid  = amount;
    logToMap(`🔨 Tua offerta: €${amount.toLocaleString()} per ${auc.name}`);
    showNotification(`Offerta di €${amount.toLocaleString()} registrata!`, 'success');
    saveGame();
    if (typeof renderTabMarket === 'function') renderTabMarket();
};
