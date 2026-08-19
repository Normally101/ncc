'use strict';
/* ================================================================
   engine-events.js — Chauffeur Empire
   Fines, police, strikes, dynamic events, cantieri, paparazzi.
   Loaded AFTER engine.js (needs: gameState, showNotification,
   logToMap, _applyEmailTemplate; calls drawCheckpointMarker
   from dispatcher.js which is safe because runtime-only)
   ================================================================ */

// ─── POLICE HEAT SYSTEM ──────────────────────────────────────────
function _tickPoliceHeat() {
    if (!gameState.policeHeat) gameState.policeHeat = 0;
    gameState.policeHeat = Math.max(0, gameState.policeHeat - 1.5); // daily decay

    const heatPct = gameState.policeHeat;
    if (heatPct >= 80) {
        if (Math.random() < 0.25) _maybePoliceCheckpoint(); // extra checkpoint
        if (gameState.day % 2 === 0) logToMap(`🚨 ALLERTA: Polizia in sorveglianza attiva (Calore ${Math.floor(heatPct)}%). Evita il Grey Market!`);
    } else if (heatPct >= 50) {
        logToMap(`⚠️ Calore Polizia al ${Math.floor(heatPct)}%. Attenzione nelle prossime corse.`);
    }
}

// ─── FALLIMENTO TECNICO ──────────────────────────────────────────
function _triggerBankruptcy() {
    const ownedCars = gameState.fleet.filter(c => !c.isLease);
    const toSeize = ownedCars.slice(0, Math.max(1, Math.ceil(ownedCars.length / 2)));
    toSeize.forEach(car => {
        const idx = gameState.fleet.indexOf(car);
        if (idx > -1) gameState.fleet.splice(idx, 1);
        // Reassign drivers left without a car
        gameState.drivers.forEach(d => { if (d.assignedCarId === car.id) d.assignedCarId = null; });
    });
    gameState.consecutiveRedDays = 0;
    gameState.cash = Math.max(gameState.cash, 800);
    // Il tick giornaliero sincronizza la cassa prima di chiamarci (engine-daily.js:424) e di nuovo
    // in fondo a processDailyRoutines(): senza questo push, fra i due momenti companies.cash resta
    // al valore negativo pre-pignoramento mentre il giocatore vede 800. In quella finestra girano
    // showBigEvent e i render, e ogni RPC server-authoritative (P2P, alleanze, IPO, province)
    // userebbe il numero sbagliato. Vale anche se il resto del tick si interrompe per un errore.
    if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});
    showBigEvent('💥', 'FALLIMENTO TECNICO!', `Il tribunale ha emesso un decreto di pignoramento. ${toSeize.length} veicoli confiscati per coprire i debiti. Riorganizza le finanze immediatamente.`);
    logToMap(`💥 PIGNORAMENTO: ${toSeize.length} auto sequestrate dal tribunale.`);
    if (typeof renderTabFleet === 'function') renderTabFleet();
}

// ─── SINDACATO — SCIOPERO ────────────────────────────────────────
function _maybeStrike() {
    if (gameState.activeStrike) {
        const curHour = gameState.day * 24 + gameState.hour;
        if (curHour >= gameState.activeStrike.endsHour) {
            gameState.activeStrike = null;
            logToMap('✅ Sciopero terminato: autisti di nuovo operativi.');
            showNotification('✅ Sciopero finito! Autisti di ritorno.', 'success');
        }
        return;
    }
    const drivers = gameState.drivers.filter(d => d.id !== 'ceo' && d.morale !== undefined);
    if (!drivers.length) return;
    const avgMorale = drivers.reduce((s, d) => s + (d.morale || 100), 0) / drivers.length;
    if (avgMorale < 25 && Math.random() < 0.18) {
        gameState.activeStrike = { endsHour: gameState.day * 24 + gameState.hour + 4 };
        gameState.drivers.forEach(d => {
            if (d.id !== 'ceo' && d.status === 'idle') { d.status = 'resting'; d.restHoursLeft = 4; }
        });
        showBigEvent('✊', 'SCIOPERO AUTISTI!', `Morale medio al ${Math.floor(avgMorale)}%. Gli autisti hanno abbandonato i turni per 4 ore. Aumenta i salari, gestisci il riposo, evita il burnout.`);
        logToMap('✊ SCIOPERO: corse sospese per 4 ore. Morale critico!');
        if (typeof window.CE_Alert !== 'undefined') window.CE_Alert.fire({ key:'strike_event', text:'✊ SCIOPERO AUTISTI — corse sospese 4h! Vai in Staff → Risolvi', type:'danger', tab:'staff', duration:15000 });
    }
}

// ─── EVENTI DINAMICI AAA ─────────────────────────────────────────
function _maybeGenerateDynamicEvent() {
    if (gameState.activeDynamicEvent) return; // one active at a time
    if (!TITAN_EVENTS || Math.random() > 0.14) return;

    // Anti-duplicate: build set of recently seen event ids (last 10)
    if (!gameState.recentEventIds) gameState.recentEventIds = [];
    const recentSet = new Set(gameState.recentEventIds);

    // Anti-duplicate city check: no two events in same city simultaneously
    const activeCity = gameState.activeDynamicEvent?.city;

    const eligible = TITAN_EVENTS.filter(ev => {
        if (recentSet.has(ev.id)) return false; // skip recently played
        if (ev.requiresReputation && gameState.reputation < ev.requiresReputation) return false;
        if (ev.requiresArmored && !gameState.fleet.some(c => (c.upgrades||[]).includes('blindatura'))) return false;
        if (activeCity && ev.city && ev.city === activeCity) return false; // city conflict
        return true;
    });
    if (!eligible.length) {
        // Reset history if exhausted
        gameState.recentEventIds = [];
        return;
    }

    // Weighted random: legendary < epic < rare < common
    const rarityWeight = { common:50, rare:25, epic:12, legendary:4 };
    const pool = [];
    eligible.forEach(ev => {
        const w = rarityWeight[ev.rarity] || 25;
        for (let i = 0; i < w; i++) pool.push(ev);
    });
    const ev = pool[Math.floor(Math.random() * pool.length)];

    const endsHour = gameState.day * 24 + gameState.hour + ev.duration;
    gameState.activeDynamicEvent = { ...ev, endsHour };

    // Track recent event ids (keep last 10)
    gameState.recentEventIds.push(ev.id);
    if (gameState.recentEventIds.length > 10) gameState.recentEventIds.shift();

    if (ev.policeHeat > 0) gameState.policeHeat = Math.min(100, gameState.policeHeat + ev.policeHeat);

    // Generate burst of rides for the event
    const rideTier = ev.rideBias === 'any' ? null : ev.rideBias;
    for (let i = 0; i < (ev.extraRidesPerHour || 3) * 2; i++) generatePOIRide(rideTier);

    // Rarity color for big event
    const rarityColors = { common:'#9ca3af', rare:'#3b82f6', epic:'#a855f7', legendary:'#d4af37' };
    const rarityLabel  = { common:'Comune', rare:'Raro', epic:'Epico', legendary:'🌟 LEGGENDARIO' };
    const descFull = `[${rarityLabel[ev.rarity]||''} · ${ev.category?.toUpperCase()||''}] ${ev.duration}h di gioco · Tariffe ×${ev.priceMult}${ev.surge ? ' · SURGE +40%' : ''}`;
    showBigEvent(ev.icon, ev.name, descFull);
    logToMap(`${ev.icon} [${(ev.rarity||'').toUpperCase()}] ${ev.name} — ×${ev.priceMult} tariffe × ${ev.duration}h`);

    // Surge notification badge on hub
    if (ev.surge || ev.category === 'emergency' || ev.category === 'entertainment') {
        gameState._hubNewEvent = true;
        const badge = document.getElementById('hub-event-badge');
        if (badge) badge.classList.remove('hidden');
    }

    // Send ticker news
    if (typeof WORLD_NEWS !== 'undefined') WORLD_NEWS.unshift(`${ev.icon} ${ev.name} — Tariffe ×${ev.priceMult} per ${ev.duration}h`);
}

function _tickDynamicEvent() {
    if (!gameState.activeDynamicEvent) return;
    const curHour = gameState.day * 24 + gameState.hour;
    if (curHour >= gameState.activeDynamicEvent.endsHour) {
        logToMap(`${gameState.activeDynamicEvent.icon} EVENTO "${gameState.activeDynamicEvent.name}" terminato.`);
        gameState.activeDynamicEvent = null;
    } else {
        // Continuous extra rides
        const ev = gameState.activeDynamicEvent;
        const tier = ev.rideBias === 'any' ? null : ev.rideBias;
        if (Math.random() < 0.6) generatePOIRide(tier);
    }
}

// ─── SISTEMA MULTE ────────────────────────────────────────────────
function _maybeGenerateFine() {
    if (!gameState.activeFines) gameState.activeFines = [];
    // Only generate fines if there are active rides or drivers on the road
    const hasBusyDrivers = gameState.drivers.some(d => d.status === 'busy');
    if (!hasBusyDrivers || Math.random() > 0.25) return;

    // Speedy drivers generate more fines
    const speedyDrivers = gameState.drivers.filter(d => d.status === 'busy' && d.trait?.id === 'piede_pesante');
    const baseChance = 0.15 + (speedyDrivers.length * 0.10);
    if (Math.random() > baseChance) return;

    const templates = FINE_TEMPLATES;
    const template = templates[Math.floor(Math.random() * templates.length)];
    const busyDriver = gameState.drivers.filter(d => d.status === 'busy' && d.id !== 'ceo');
    if (busyDriver.length === 0) return;

    const driver = busyDriver[Math.floor(Math.random() * busyDriver.length)];
    const fine = {
        id: gameState.nextId++,
        driverName: driver.name,
        desc: template.desc,
        amount: template.amount,
        severity: template.severity,
        status: 'pending',
        expiresAt: gameState.day * 24 + gameState.hour + 24 // 24 game hours to pay/contest
    };
    gameState.activeFines.push(fine);
    gameState.policeHeat = Math.min(100, (gameState.policeHeat || 0) + 5); // each fine adds heat
    gameState.brandPrestige = Math.max(0, (gameState.brandPrestige || 0) - 5);

    // Auto-contest with legal advisor
    const hasLegal = gameState.staff.some(s => s.id === 'legal');
    if (hasLegal && Math.random() < 0.50) {
        if (Math.random() < 0.70) {
            fine.status = 'contested_won';
            logToMap(`⚖️ Avvocato: multa di €${fine.amount} annullata (${fine.desc})`);
            showNotification(`⚖️ Avvocato: multa annullata!`, 'success');
        } else {
            fine.amount = Math.floor(fine.amount * 0.70);
            fine.status = 'contested_reduced';
            logToMap(`⚖️ Avvocato: multa ridotta a €${fine.amount} (${fine.desc})`);
        }
    } else {
        const fineDot = document.getElementById('fine-dot');
        if (fineDot) fineDot.classList.remove('hidden');
        showBigEvent('🚔', 'Multa in Arrivo!', `${driver.name} ha ricevuto una sanzione: ${fine.desc}. Importo: €${fine.amount}. Hai 24h per pagare o contestare.`);
        logToMap(`🚔 MULTA: ${driver.name} — ${fine.desc} (€${fine.amount})`);
        if (typeof window.CE_Alert !== 'undefined') window.CE_Alert.fire({ key:`fine_${fine.id||Date.now()}`, text:`🚔 Multa: ${fine.desc} — €${fine.amount}`, type:'warning', tab:'legal', duration:10000 });
    }

    if (_tabIs('legal') && typeof renderTabLegal === 'function') renderTabLegal();
}

// Genera multa ZTL se un autista attivo sta consegnando in zona ZTL senza permesso
function _maybeGenerateZTLFine() {
    if (!gameState.activeFines) gameState.activeFines = [];
    if (hasInvestment('inv_ztl_centro') && hasInvestment('inv_ztl_nord')) return; // tutto coperto

    gameState.activeRides.forEach(ride => {
        const dest = ride.toPoi;
        if (!dest) return;
        const inCentro = ZTL_POIS.centro.includes(dest.id);
        const inNord   = ZTL_POIS.nord.includes(dest.id);
        if (!inCentro && !inNord) return;
        if (inCentro && hasInvestment('inv_ztl_centro')) return;
        if (inNord   && hasInvestment('inv_ztl_nord'))   return;

        if (Math.random() > 0.05) return; // bassa probabilità per non essere punitivo
        const _fineDriver = (gameState.drivers || []).find(d => d.id === ride.driverId);
        const fine = {
            id: gameState.nextId++,
            driverName: _fineDriver ? _fineDriver.name : ride.driverId,
            desc: `Accesso ZTL non autorizzato: ${dest.name}`,
            amount: 164,
            severity: 'medium',
            status: 'pending',
            expiresAt: gameState.day * 24 + gameState.hour + 24
        };
        gameState.activeFines.push(fine);
        const fineDot = document.getElementById('fine-dot');
        if (fineDot) fineDot.classList.remove('hidden');
        logToMap(`🚫 Multa ZTL: ${dest.name} — €${fine.amount}`);
        if (typeof showNotification === 'function') showNotification(`🚫 Multa ZTL a ${dest.name}: €${fine.amount}`, 'error');
        if (_tabIs('legal') && typeof renderTabLegal === 'function') renderTabLegal();
    });
}

// ─── CANTIERI (ROADWORKS) ────────────────────────────────────────
const _activeCantieri = {}; // hwKey → { endsDay }

function _maybeGenerateCantieri() {
    if (Object.keys(_activeCantieri).length >= 3) return; // max 3 concurrent
    const hwKeys = Object.keys(typeof HIGHWAYS !== 'undefined' ? HIGHWAYS : {});
    const unlocked = hwKeys.filter(k => {
        const hw = HIGHWAYS[k];
        return hw.req.some(r => gameState.unlockedRegions.includes(r));
    });
    if (!unlocked.length || Math.random() > 0.15) return;

    const hwKey = unlocked[Math.floor(Math.random() * unlocked.length)];
    if (_activeCantieri[hwKey]) return;
    const dur = 2 + Math.floor(Math.random() * 4); // 2-5 days
    _activeCantieri[hwKey] = { endsDay: gameState.day + dur };

    const hw = HIGHWAYS[hwKey];
    const midIdx = Math.floor(hw.path.length / 2);
    const [lat, lng] = hw.path[midIdx];
    if (typeof drawCantiereMarker === 'function') drawCantiereMarker(hwKey, lat, lng);
    logToMap(`🚧 Cantieri su ${hwKey.replace('-',' ↔ ')}: rallentamento per ${dur} giorni.`);
}

function _tickCantieri() {
    for (const key in _activeCantieri) {
        if (gameState.day >= _activeCantieri[key].endsDay) {
            delete _activeCantieri[key];
            if (typeof removeCantiereMarker === 'function') removeCantiereMarker(key);
            logToMap(`✅ Cantieri terminati su ${key.replace('-',' ↔ ')}.`);
        }
    }
}

function _getCantieriSpeedMult(fromId, toId) {
    // Returns <1 if any cantiere on route; requires HIGHWAYS lookup
    const directKey = `${fromId}-${toId}`;
    const revKey = `${toId}-${fromId}`;
    if (_activeCantieri[directKey] || _activeCantieri[revKey]) return 0.65;
    return 1.0;
}

// ─── POSTI DI BLOCCO (POLICE CHECKPOINTS) ───────────────────────
function _maybePoliceCheckpoint() {
    if (!gameState.activeRides.length) return;
    if (Math.random() > 0.08) return; // 8% chance per check interval

    const busyDrivers = gameState.drivers.filter(d => d.status === 'busy' && d.id !== 'ceo');
    if (!busyDrivers.length) return;

    const driver = busyDrivers[Math.floor(Math.random() * busyDrivers.length)];
    const ride = gameState.activeRides.find(r => r.driverId === driver.id);
    if (!ride) return;

    const hasTraining = hasInvestment('inv_safe_driving');
    if (hasTraining && !ride.isGreyMarket && Math.random() < 0.85) {
        logToMap(`🚔 Posto di blocco: ${driver.name} supera senza problemi.`);
        return;
    }

    const car = gameState.fleet.find(c => c.id === driver.assignedCarId);
    const hasVetri = (car?.upgrades || []).includes('vetri_oscurati');
    const stealthMult = hasVetri ? 0.35 : 1.0; // vetri oscurati: -65% rischio

    // SHADOW MISSION: rischio altissimo, checkpoint dedicato sulla mappa
    if (ride.isShadowMission) {
        const shadowRisk = (ride.seizureRisk / 100) * stealthMult;
        if (Math.random() < shadowRisk) {
            gameState.policeHeat = Math.min(100, (gameState.policeHeat || 0) + 30);
            if (car) {
                if (!gameState.seizedCars) gameState.seizedCars = [];
                gameState.seizedCars.push({ carId: car.id, carName: car.name, releaseDay: gameState.day + 7 });
                driver.assignedCarId = null; driver.status = 'idle';
                const idx = gameState.activeRides.indexOf(ride);
                if (idx > -1) gameState.activeRides.splice(idx, 1);
                showBigEvent('🚨', 'SHADOW BUST!',
                    `Checkpoint superato! ${driver.name} arrestato. ${car.name} sequestrata 7 giorni. ${hasVetri ? 'I Vetri Oscurati non bastano.' : 'Installa Vetri Oscurati per ridurre il rischio.'}`);
                logToMap(`🚨 SHADOW BUST: ${car.name} sequestrata al checkpoint. Heat +30.`);
            }
            return;
        } else {
            logToMap(`🔴 Shadow: ${driver.name} supera il checkpoint. ${hasVetri ? '(Vetri Oscurati attivi)' : ''}`);
            return;
        }
    }

    // Grey market: high seizure risk — scales with policeHeat
    const greySeizureChance = (0.30 + (gameState.policeHeat / 100) * 0.35) * stealthMult; // 30-65%, vetri -65%
    if (ride.isGreyMarket && Math.random() < greySeizureChance) {
        gameState.policeHeat = Math.min(100, (gameState.policeHeat || 0) + 20); // bust raises heat
        if (car) {
            if (!gameState.seizedCars) gameState.seizedCars = [];
            gameState.seizedCars.push({ carId: car.id, carName: car.name, releaseDay: gameState.day + 7 });
            driver.assignedCarId = null;
            driver.status = 'idle';
            const idx = gameState.activeRides.indexOf(ride);
            if (idx > -1) gameState.activeRides.splice(idx, 1);
            showBigEvent('🚨', 'Auto Sequestrata!', `La polizia ha fermato ${driver.name} durante una missione anonima. ${car.name} sequestrata per 7 giorni. ${hasVetri ? 'Anche i Vetri Oscurati non hanno retto.' : 'Installa Vetri Oscurati per ridurre il rischio.'}`);
            logToMap(`🚨 SEQUESTRO: ${car.name} sequestrata dalla polizia (Grey Market). 7 giorni.`);
        }
        return;
    }

    const roll = Math.random();
    if (roll < 0.6) {
        ride.duration = Math.floor(ride.duration * 1.25);
        logToMap(`🚔 Posto di blocco: ${driver.name} fermato 10 min. Ritardo aggiunto.`);
        if (typeof showNotification === 'function') showNotification(`🚔 Posto di blocco: ${driver.name} in ritardo.`, 'error');
    } else {
        const fine = {
            id: gameState.nextId++, driverName: driver.name,
            desc: 'Verifica documenti NCC — irregolarità',
            amount: 220, severity: 'minor', status: 'pending',
            expiresAt: gameState.day * 24 + gameState.hour + 24
        };
        gameState.activeFines.push(fine);
        const fineDot = document.getElementById('fine-dot');
        if (fineDot) fineDot.classList.remove('hidden');
        logToMap(`🚔 Multa posto di blocco: ${driver.name} — €${fine.amount}`);
        if (typeof showNotification === 'function') showNotification(`🚔 Posto di blocco: multa €${fine.amount}!`, 'error');
        if (_tabIs('legal') && typeof renderTabLegal === 'function') renderTabLegal();
    }
}

// ─── PAPARAZZI ───────────────────────────────────────────────────
function _maybeParazziEvent() {
    const nightHour = gameState.hour >= 22 || gameState.hour < 5;
    if (!nightHour) return;

    const vipRides = gameState.activeRides.filter(r => r.tier === 'vip' || r.tier === 'ultra');
    if (!vipRides.length || Math.random() > 0.12) return;

    const ride = vipRides[Math.floor(Math.random() * vipRides.length)];
    const driver = gameState.drivers.find(d => d.id === ride.driverId);

    const roll = Math.random();
    if (roll < 0.5) {
        // Positive: VIP happy with discretion, big tip
        const bonus = Math.floor(ride.price * 0.40);
        gameState.cash += bonus;
        gameState.reputation = Math.min(5.0 + (gameState.prestige || 0), gameState.reputation + 0.05);
        logToMap(`📸 Paparazzi! ${driver?.name} protegge il cliente VIP. Mancia extra: +€${bonus}`);
        if (typeof showNotification === 'function') showNotification(`📸 Paparazzi evitati! +€${bonus} mancia.`, 'success');
    } else if (roll < 0.80) {
        // Negative: photo scandal, slight rep hit
        gameState.reputation = Math.max(0, gameState.reputation - 0.08);
        logToMap(`📸 PAPARAZZI: ${driver?.name} sorpreso con cliente VIP. −0.08★ Reputazione.`);
        showBigEvent('📸', 'Scandalo Paparazzi!', `${driver?.name || 'Il tuo autista'} è stato fotografato con un cliente VIP. La discrezione è la chiave del lusso. −0.08★ reputazione.`);
    } else {
        // Viral moment: big rep boost
        gameState.reputation = Math.min(5.0 + (gameState.prestige || 0), gameState.reputation + 0.15);
        logToMap(`📸 Momento virale! Chauffeur Empire sui social. +0.15★ Reputazione.`);
        if (typeof showNotification === 'function') showNotification(`📸 Chauffeur Empire diventa virale! +0.15★`, 'success');
    }
}
