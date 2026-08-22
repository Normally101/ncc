'use strict';
/* ================================================================
   engine-rides.js — Chauffeur Empire
   Ciclo corse: generazione, assegnazione, completamento, checkActiveTrips.
   Dipendenze: engine.js (gameState, tutte le private helpers),
               quests.js (checkQuestProgress, completeMissionRun),
               vip-buffs.js (_getBuffValue), vip-clients.js (_vipOnComplete),
               map-router.js (_buildRideWaypoints), map.js (_fetchRoadGeom)
   Caricato dopo: engine.js
   ================================================================ */

// ─── EMPTY LEG OPTIMIZER ─────────────────────────────────────────
function _findEmptyLegRide(completedRide) {
    if (!hasInvestment('inv_empty_leg')) return;
    if (Math.random() > 0.40) return; // 40% chance per long ride

    const fromPoi = completedRide.toPoi; // car is now at destination
    const available = Object.values(POIS).filter(p => gameState.unlockedRegions.includes(p.region) && p.id !== fromPoi.id);
    if (!available.length) return;
    const toPoi = available[Math.floor(Math.random() * available.length)];
    const isLong = fromPoi.region !== toPoi.region;
    const price  = Math.floor(fromPoi.baseFlat * 1.0 * (isLong ? 2.8 : 1.0) * 0.50);
    const emptyRide = {
        id: gameState.nextId++, fromPoi, toPoi,
        tier: 'standard', price,
        duration: isLong ? 40000 : 20000, elapsed: 0,
        isEmptyLeg: true
    };
    gameState.pendingRides.push(emptyRide);
    logToMap(`🔄 Empty Leg: ${fromPoi.name} → ${toPoi.name} (50% tariffa = €${price})`);
    if (typeof showNotification === 'function') showNotification(`🔄 Empty Leg trovato: +€${price}!`, 'success');
    if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
}


// ─── GENERAZIONE CORSE ───
function generatePOIRide(tierOverride = null) {
    if ((gameState.pendingRides || []).length >= 15) return null;
    // Pricing strategy: premium = 30% fewer rides available; discount = 30% chance of an extra ride
    const _pStrat = gameState.pricingStrategy || 'standard';
    if (_pStrat === 'premium' && Math.random() < 0.30) return null;
    if (_pStrat === 'discount' && Math.random() < 0.30) setTimeout(generatePOIRide, 200);
    const rank = _getRankPosition();
    const availablePOIs = Object.values(POIS).filter(p => {
        if (!gameState.unlockedRegions.includes(p.region)) return false;
        if (p.exclusiveRank && rank > p.exclusiveRank) return false; // exclusive to top N
        return true;
    });
    if (availablePOIs.length < 2) return null;

    // Airport bribe: increase chance of airport origin/dest rides
    let fromPool = availablePOIs;
    const airportIds = ['roma_fco', 'nap_capo', 'mil_mxp', 'mil_lin'];
    if (hasInvestment('inv_airport_bribe') && Math.random() < 0.30) {
        const airportPOIs = availablePOIs.filter(p => airportIds.includes(p.id));
        if (airportPOIs.length > 0) fromPool = airportPOIs;
    }
    const from = fromPool[Math.floor(Math.random() * fromPool.length)];
    // Filter blacklisted destinations
    const blacklist = gameState.blacklistedClients || [];
    const toPool = availablePOIs.filter(p => !blacklist.includes(p.id));
    // Airport-forced events
    const airportForce = gameState.activeDynamicEvent?.forceAirport;
    const airportIds2 = ['roma_fco','nap_capo','mil_mxp','mil_lin','ven_mp','olbia'];
    const finalToPool = airportForce
        ? toPool.filter(p => airportIds2.includes(p.id)).concat(toPool).slice(0, 10)
        : toPool;
    let to = (finalToPool.length ? finalToPool : toPool)[Math.floor(Math.random() * (finalToPool.length || toPool.length))];
    if (!to || from.id === to.id) return null;

    // Venezia island rides require a Water Taxi; silently skip if none available
    if (to.id === 'venezia') {
        const hasWaterTaxi = gameState.fleet.some(c => c.vehicleClass === 'water_taxi' && c.outOfService !== 'fuel');
        if (!hasWaterTaxi) return null;
    }

    let tier;
    if (tierOverride) {
        tier = tierOverride;
    } else {
        const roll = Math.random();
        const threshold = (hasInvestment('inv_terminal_fco') && from.region === 'lazio') ? 0.45 : 0.7;
        tier = roll > threshold ? from.minTier : 'standard';
    }
    // Prezzi reali NCC: baseFlat × moltiplicatori multipli
    const isLongDistance = from.region !== to.region;
    const distMult    = isLongDistance ? 2.8 : 1.0;
    const cannesMult  = gameState.cannesBoostDays > 0 ? 2.0 : 1.0;
    const tierMult    = RIDE_PRICING[tier] || 1.0;
    const nightMult   = (gameState.hour >= 22 || gameState.hour < 7) ? 1.20 : 1.0;
    const weatherMult = (WEATHER_STATES.find(w => w.id === gameState.weather) || {priceMult:1}).priceMult;
    // Surge pricing: domanda alta = tariffe più alte
    const pending = gameState.pendingRides.length;
    const surgeMult = pending >= 8 ? 1.15 : 1.0;
    const seasonMult  = _getSeasonalMult().priceMult;
    const livreMult   = hasInvestment('inv_livrea') ? 1.08 : 1.0;
    const carbonMult2 = hasInvestment('inv_carbon_neutral') && tier === 'business' && Math.random() < 0.3 ? 1.15 : 1.0;
    const activeEv    = gameState.activeDynamicEvent;
    const eventMult   = activeEv ? (activeEv.priceMult || 1.0) : 1.0;
    // Surge pricing: +40% extra for emergency/entertainment events with surge flag
    const surgeCatMult = (activeEv?.surge && (activeEv?.category === 'emergency' || activeEv?.category === 'entertainment')) ? 1.40 : 1.0;
    const secEscort   = hasInvestment('inv_security_escort') && (tier === 'ultra' || tier === 'vip') ? 1.80 : 1.0;
    // Price-war: -30% durante la guerra, +40% durante il monopolio
    const activePW    = (gameState.pricewars || []).find(pw => pw.regionId === from.region || pw.regionId === to.region);
    const pricewarMult = activePW
        ? (activePW.monopolyEndsDay ? 1.40 : 0.70)
        : 1.0;
    // Lifestyle: yacht → +20% su corse Ultra costiere
    const yachtMult = (gameState.lifestyleAssets || []).includes('yacht_lusso') && tier === 'ultra' ? 1.20 : 1.0;
    const finalPrice  = Math.floor(from.baseFlat * tierMult * distMult * cannesMult * nightMult * weatherMult * surgeMult * seasonMult * livreMult * carbonMult2 * eventMult * surgeCatMult * secEscort * pricewarMult * yachtMult);

    const ride = { id: gameState.nextId++, fromPoi: from, toPoi: to, tier: tier, price: finalPrice, duration: from.region !== to.region ? 40000 : 20000, elapsed: 0 };
    gameState.pendingRides.push(ride);

    if (_tabIs('corse') && typeof renderTabCorse==='function') renderTabCorse();
    return ride;
}

// ─── CONTRACT RIDE GENERATOR (italianRoutesDB) ───────────────────────────────
const _VEHICLE_CLASS_MAP = {
    'Stellar E-Executive':            'stellar_e_exec',
    'Stellar V-Carrier':              'stellar_v_carr',
    'Stellar S-Imperial':             'stellar_s_imp',
    'Stellar G-Overlord':             'stellar_g_over',
    'Majestic Spirit':                'majestic_spirit',
    'Water Taxi':                     'water_taxi',
    // Legacy backward-compat keys (old routes DB still uses these names)
    'Mercedes E-Class Sedan':         'stellar_e_exec',
    'Mercedes V-Class Minivan':       'stellar_v_carr',
    'Mercedes S-Class Presidential':  'stellar_s_imp',
    'Mercedes Sprinter':              'stellar_v_carr',
};
const _CONTRACT_TIER = {
    stellar_s_imp:    'ultra',
    stellar_g_over:   'ultra',
    majestic_spirit:  'ultra',
    water_taxi:       'ultra',
    stellar_v_carr:   'vip',
    stellar_q_carr:   'vip',
    stellar_e_exec:   'business',
    stellar_q_exec:   'business',
    volt_3_urban:     'business',
    volt_y_cross:     'business',
    // Legacy
    mercedes_s:       'ultra',
    mercedes_v:       'vip',
    mercedes_sprinter:'business',
    mercedes_e:       'business',
};

function generateContractRide() {
    if (typeof italianRoutesDB === 'undefined' || typeof REGION_TO_DB === 'undefined') return null;
    if (gameState.pendingRides.length > 22) return null;

    // Build list of available DB regions from unlocked game regions
    const availDBRegions = new Set();
    (gameState.unlockedRegions || []).forEach(gr => {
        (REGION_TO_DB[gr] || []).forEach(dbr => availDBRegions.add(dbr));
    });
    if (availDBRegions.size === 0) return null;

    // Filter routes: unlocked region + required vehicle available
    const candidates = italianRoutesDB.filter(r => {
        if (!availDBRegions.has(r.region)) return false;
        const vc = _VEHICLE_CLASS_MAP[r.vehicle] || 'stellar_e_exec';
        // Skip routes requiring vehicles the player doesn't own
        const _ultraVcs = ['stellar_s_imp','stellar_g_over','majestic_spirit','mercedes_s'];
        const _vanVcs   = ['stellar_v_carr','stellar_q_carr','mercedes_sprinter','mercedes_v'];
        if (_ultraVcs.includes(vc) && !gameState.fleet.some(c => (_ultraVcs.includes(c.vehicleClass)) && !c.outOfService)) return false;
        if (_vanVcs.includes(vc)   && !gameState.fleet.some(c => (_vanVcs.includes(c.vehicleClass))   && !c.outOfService)) return false;
        if (r.requiresWaterTaxi    && !gameState.fleet.some(c => c.vehicleClass === 'water_taxi'       && !c.outOfService)) return false;
        return true;
    });
    if (candidates.length === 0) return null;

    const route = candidates[Math.floor(Math.random() * candidates.length)];
    const vehicleRequired = _VEHICLE_CLASS_MAP[route.vehicle] || 'stellar_e_exec';
    const tier = _CONTRACT_TIER[vehicleRequired] || 'business';

    // Hub POI for map display and serialization
    const poiKey = (typeof DB_REGION_TO_POI_KEY !== 'undefined' ? DB_REGION_TO_POI_KEY : {})[route.region] || 'roma';
    const hubPOI = POIS[poiKey] || POIS['roma'];

    // Real coordinates via geoCoords lookup
    const originCoords = (typeof resolveCoords === 'function') ? resolveCoords(route.origin)      : null;
    const destCoords   = (typeof resolveCoords === 'function') ? resolveCoords(route.destination) : null;

    // Duration: City-to-City = 2× normal; Boat/Airport = standard
    const isLongHaul = route.type === 'City-to-City';
    const duration = isLongHaul ? 48000 : 24000;

    const ride = {
        id:              gameState.nextId++,
        isContract:      true,
        routeId:         route.id,
        routeType:       route.type,
        originName:      route.origin,
        destinationName: route.destination,
        vehicleRequired,
        fromPoi: originCoords ? { id: 'route_' + route.id + '_from', name: route.origin,      lat: originCoords[0], lng: originCoords[1] } : hubPOI,
        toPoi:   destCoords   ? { id: 'route_' + route.id + '_to',   name: route.destination, lat: destCoords[0],   lng: destCoords[1]   } : hubPOI,
        originCoords,
        destCoords,
        tier,
        price:           Math.floor(route.sellingPrice),
        netCost:         Math.floor(route.netCost),
        duration,
        elapsed:         0,
        region:          route.region,
    };

    gameState.pendingRides.push(ride);
    if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
    return ride;
}

const TIER_COMPATIBILITY = {
    'ultra':    ['ultra'],
    'vip':      ['vip', 'ultra', 'group'],
    'business': ['business', 'vip', 'ultra', 'group'],
    'standard': ['standard', 'business', 'vip', 'ultra', 'group']
};

function _getRideDurationMs(ride) {
    const price = ride.sellingPrice || ride.basePrice || ride.price || 150;
    // Pacing (17/08/2026): 0.4 rendeva una corsa da ~90€ lunga 36 minuti reali,
    // misurato dal vivo — dimezzato a 0.2, stesso tetto/pavimento.
    let minutes = Math.max(10, Math.min(360, price * 0.2));
    // routeType is set by generateContractRide from routesDB route.type ('Airport','Rail','Transfer','Boat','Port','City-to-City')
    const rType = ride.routeType || '';
    if (rType === 'Airport' || rType === 'Rail' || rType === 'Transfer') minutes *= 0.7;
    else if (rType === 'Boat' || rType === 'Port') minutes *= 1.3;
    const fromRegion = ride.fromPoi?.region || '';
    const toRegion   = ride.toPoi?.region   || '';
    if (fromRegion && toRegion && fromRegion !== toRegion) minutes *= 1.5;
    return Math.round(minutes) * 60 * 1000;
}

function _formatDuration(ms) {
    if (!ms || ms <= 0) return '0min';
    const totalMinutes = Math.round(ms / 60000);
    if (totalMinutes <= 0) return '0min';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
}

// ── MONTE ORE CODA AUTISTA (decisione Vlad 22/08/2026) ────────────
// Il tetto della coda non è più un NUMERO di corse ma un monte ore per
// autista: 4h di base, allungabili con Driver Coins fino a 12h. Il limite si
// confronta con totalQueueMs (corsa attiva rimanente + coda), non con
// queue.length: la domanda vera del giocatore è «quando devo rientrare?».
// NB: la scala degli scatti e i prezzi NON sono stati decisi da Vlad — sono
// una proposta da ratificare (+2h a scatto, prezzi in linea con
// «Limite Offline +2h» che costa 20 DC per lo stesso valore di gioco).
const DRIVER_QUEUE_HOURS = {
    base: 4,
    max:  12,
    steps: [
        { hours: 6,  cost: 20 },
        { hours: 8,  cost: 35 },
        { hours: 10, cost: 50 },
        { hours: 12, cost: 70 },
    ],
};

function _getDriverQueueCapMs(driver) {
    const raw = Number(driver && driver.queueHours);
    const h = Number.isFinite(raw)
        ? Math.max(DRIVER_QUEUE_HOURS.base, Math.min(DRIVER_QUEUE_HOURS.max, raw))
        : DRIVER_QUEUE_HOURS.base; // autisti salvati prima del cambio: 4h di base
    return h * 60 * 60 * 1000;
}

function _getDriverQueueInfo(driver, gs = (typeof gameState !== 'undefined' ? gameState : {})) {
    if (!driver) return null;
    const now = Date.now();
    const activeTrip = (gs.activeTrips || []).find(t => t.driverId === driver.id);
    const currentRemainingMs = activeTrip ? Math.max(0, activeTrip.endTime - now) : 0;
    const isBusy = driver.status === 'busy' && !!activeTrip;
    const queuedRides = driver.queue || [];
    const queuedDurationMs = queuedRides.reduce((sum, r) => {
        const fn = (typeof window !== 'undefined' && typeof window._getRideDurationMs === 'function')
            ? window._getRideDurationMs : _getRideDurationMs;
        return sum + (fn(r) || 0);
    }, 0);
    const totalQueueMs = (isBusy ? currentRemainingMs : 0) + queuedDurationMs;
    const queueCapMs = _getDriverQueueCapMs(driver);
    const isFull = totalQueueMs >= queueCapMs;
    const nextSlotFreeMs = isBusy ? currentRemainingMs : 0;
    const freeAtDate = new Date(now + totalQueueMs);

    return {
        activeTrip,
        isBusy,
        currentRemainingMs,
        queuedCount: queuedRides.length,
        queueCapMs,
        queueRemainingMs: Math.max(0, queueCapMs - totalQueueMs),
        isFull,
        queuedDurationMs,
        totalQueueMs,
        nextSlotFreeMs,
        freeAtDate,
        freeAtTimeStr: freeAtDate.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })
    };
}

function _previewQueueWithRide(driver, ride, gs = (typeof gameState !== 'undefined' ? gameState : {})) {
    const info = _getDriverQueueInfo(driver, gs);
    const fn = (typeof window !== 'undefined' && typeof window._getRideDurationMs === 'function')
        ? window._getRideDurationMs : _getRideDurationMs;
    const addedDurationMs = ride ? (fn(ride) || 0) : 0;
    const currentQueueMs = info ? info.totalQueueMs : 0;
    const newTotalQueueMs = currentQueueMs + addedDurationMs;
    const newFreeAtDate = new Date(Date.now() + newTotalQueueMs);
    return {
        currentQueueMs,
        addedDurationMs,
        newTotalQueueMs,
        newFreeAtDate,
        newFreeAtTimeStr: newFreeAtDate.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })
    };
}

function assignRideToDriver(rideId, driverId) {
    const rideIdx = gameState.pendingRides.findIndex(r => r.id == rideId);
    const driver = gameState.drivers.find(d => d.id == driverId);

    if (rideIdx > -1 && driver) {
        // Monte ore coda: si confronta la durata TOTALE (attiva + accodate), non il numero corse
        const _qInfo = _getDriverQueueInfo(driver, gameState);
        if (_qInfo.isFull) {
            if (typeof showNotification === 'function') {
                showNotification(
                    `🚫 ${driver.name}: monte ore coda pieno (${_formatDuration(_qInfo.totalQueueMs)}/${Math.round(_qInfo.queueCapMs / 3600000)}h) — libero verso le ${_qInfo.freeAtTimeStr}. Allungalo con Driver Coins dalla sua riga nel Dispatch.`,
                    'error'
                );
            }
            return;
        }
        if (driver.status === 'resting') { if(typeof showNotification==='function') showNotification(`${driver.name} è in riposo!`, 'error'); return; }

        const ride = gameState.pendingRides[rideIdx];

        // Contract rides: hard vehicle class check
        if (ride.vehicleRequired) {
            const assignedCar = gameState.fleet.find(c => c.id === driver.assignedCarId);
            if (!assignedCar || assignedCar.vehicleClass !== ride.vehicleRequired) {
                const vcNames = {
                    stellar_e_exec:'Stellar E-Executive', stellar_v_carr:'Stellar V-Carrier',
                    stellar_s_imp:'Stellar S-Imperial',   stellar_q_exec:'Stellar Q-Executive',
                    stellar_q_imp:'Stellar Q-Imperial',   stellar_q_carr:'Stellar Q-Carrier',
                    volt_s_apex:'Volt S-Apex',            volt_s_hyper:'Volt S-Hyper',
                    volt_3_urban:'Volt 3-Urban',          volt_y_cross:'Volt Y-Cross',
                    majestic_spirit:'Majestic Spirit',    majestic_e_specter:'Majestic E-Specter',
                    water_taxi:'Water Taxi'
                };
                if (typeof showNotification === 'function')
                    showNotification(`❌ Veicolo errato! Questa tratta richiede: ${vcNames[ride.vehicleRequired] || ride.vehicleRequired}`, 'error');
                return;
            }
        }

        gameState.pendingRides.splice(rideIdx, 1);
        driver.queue.push(ride);

        // Fetch real road geometry for smooth map animation (async, non-blocking)
        // resolveCoords returns [lat,lng]; _fetchRoadGeom (Mapbox) needs [lng,lat]
        if (typeof window._fetchRoadGeom === 'function') {
            const from = ride.originCoords ? [ride.originCoords[1], ride.originCoords[0]] : (ride.fromPoi ? [ride.fromPoi.lng, ride.fromPoi.lat] : null);
            const to   = ride.destCoords   ? [ride.destCoords[1],   ride.destCoords[0]]   : (ride.toPoi   ? [ride.toPoi.lng,   ride.toPoi.lat]   : null);
            if (from && to) window._fetchRoadGeom(from, to).then(geom => { if (geom) ride.roadGeom = geom; });
        }

        if (driver.status === 'idle') startNextRide(driver);
        if (_tabIs('corse') && typeof renderTabCorse==='function') renderTabCorse();
    }
}

function _driverCanTakeRide(driver, ride) {
    if (driver.status === 'striking') return false;
    const car = gameState.fleet.find(c => c.id === driver.assignedCarId);
    if (!car) return false;
    if (car.outOfService) return false;
    if (car.condition <= 10) return false;
    if (!TIER_COMPATIBILITY[ride.tier]?.includes(car.tier)) return false;
    if (ride.vehicleRequired && car.vehicleClass !== ride.vehicleRequired) return false;
    const _queueInfo = _getDriverQueueInfo(driver);
    if (_queueInfo && _queueInfo.isFull) return false;
    if (driver.status === 'resting') return false;
    // B2B contract locks: vehicles committed to a corporate contract are unavailable
    if (typeof window.b2bLockedVehicleIds === 'function' && window.b2bLockedVehicleIds().includes(car.id)) return false;
    // Aviation vehicles: elicotteri e jet solo per corse intercity (Espansione 1)
    const _carDef = [...(typeof NEW_CARS !== 'undefined' ? NEW_CARS : [])].find(c => c.vehicleClass === car.vehicleClass);
    if (_carDef?.intercityOnly && ride.fromPoi && ride.toPoi) {
        if (ride.fromPoi.region === ride.toPoi.region) return false;
    }
    return true;
}

function assignAllRides() {
    if (gameState.pendingRides.length === 0) return;

    // Priorità: prima i contratti con veicolo richiesto, poi le corse generiche
    const toAssign = [...gameState.pendingRides].sort((a, b) => (b.vehicleRequired ? 1 : 0) - (a.vehicleRequired ? 1 : 0));

    let assigned = 0;
    let skipped  = 0;

    for (const ride of toAssign) {
        // Skip se già rimossa da un'assegnazione precedente in questo ciclo
        if (!gameState.pendingRides.some(r => r.id === ride.id)) continue;

        const validDrivers = gameState.drivers
            .filter(d => _driverCanTakeRide(d, ride))
            .sort((a, b) => a.queue.length - b.queue.length);

        if (validDrivers.length > 0) {
            // Assegna al driver con la coda più corta; in caso di parità, ruota tra i driver
            assignRideToDriver(ride.id, validDrivers[0].id);
            assigned++;
        } else {
            skipped++;
        }
    }

    if (assigned > 0 && typeof showNotification === 'function') {
        const skipNote = skipped > 0 ? ` (${skipped} senza autista compatibile)` : '';
        showNotification(`⚡ ${assigned} cors${assigned === 1 ? 'a smistata' : 'e smistate'}!${skipNote}`, 'success');
    } else if (assigned === 0 && typeof showNotification === 'function') {
        showNotification('⚠ Nessun autista disponibile per le corse in attesa.', 'error');
    }
}

function autoDispatchRides() {
    if (gameState.pendingRides.length === 0) return;
    const canHandleVIP = gameState.staff.some(s => s.id === 'sr_disp');
    for (let i = gameState.pendingRides.length - 1; i >= 0; i--) {
        const ride = gameState.pendingRides[i];
        if (!canHandleVIP && (ride.tier === 'vip' || ride.tier === 'ultra')) continue;
        const validDrivers = gameState.drivers.filter(d => _driverCanTakeRide(d, ride)).sort((a, b) => a.queue.length - b.queue.length);
        if (validDrivers.length > 0) assignRideToDriver(ride.id, validDrivers[0].id);
    }
}

function startNextRide(driver) {
    if (driver.status === 'resting') return;

    // Burnout check: driver is in forced recovery
    const _nowH = gameState.day * 24 + gameState.hour;
    if (driver.burnout_until && _nowH < driver.burnout_until) {
        driver.status = 'resting';
        driver.restHoursLeft = Math.ceil(driver.burnout_until - _nowH);
        return;
    }

    if (driver.queue.length === 0) {
        driver.status = 'idle';
        if (_tabIs('corse') && typeof renderTabCorse==='function') renderTabCorse();
        return;
    }

    const car = gameState.fleet.find(c => c.id === driver.assignedCarId);
    if (!car || car.condition <= 10) {
        // Drain stuck queued rides back to pending so they can be re-assigned
        while (driver.queue.length > 0) {
            const _r = driver.queue.shift();
            delete _r.driverId;
            gameState.pendingRides.push(_r);
        }
        driver.status = 'idle';
        if (!driver.assignedCarId && typeof showNotification === 'function') {
            showNotification(`⚠️ ${driver.name}: nessun veicolo assegnato! Assegna un auto dalla tab Flotta.`, 'error');
        } else if (car && car.condition <= 10 && typeof showNotification === 'function') {
            showNotification(`🔧 ${car.name}: condizione critica! Vai in Officina.`, 'error');
        }
        return;
    }
    // Auto-heal stale fuel flag if the car's own tank is sufficient
    if (car.outOfService === 'fuel' && (car.fuel || 0) > 5) car.outOfService = null;
    if (car.outOfService) {
        driver.status = 'idle';
        return;
    }
    if (car.fuel === undefined) car.fuel = 100;

    if (driver.id === 'ceo') {
        const hasHR = gameState.staff.some(s => s.id === 'hr');
        const energyThreshold = hasHR ? 15 : 10;
        if (gameState.energy < energyThreshold) { driver.status = 'idle'; return; }
        gameState.energy -= 10;
    }

    const ride = driver.queue.shift();
    ride.driverId = driver.id;
    driver.status = 'busy';

    // Condizione auto (+ global event wearMult + Tecnico wearMult)
    let condLoss = ride.tier === 'ultra' ? 2.5 : (ride.tier === 'vip' ? 2 : 1.5);
    if (hasInvestment('inv_driver_school')) condLoss = Math.max(0.5, condLoss * 0.5);
    if (driver.trait?.condMult) condLoss *= driver.trait.condMult;
    const _globalFx = (typeof window.getGlobalEventEffects === 'function') ? window.getGlobalEventEffects() : {};
    const _skillFx  = (driver && typeof window.driverAllEffects === 'function') ? window.driverAllEffects(driver) : {};
    condLoss *= (_globalFx.wearMult || 1.0) * (_skillFx.wearMult || 1.0);
    car.condition = Math.max(0, car.condition - condLoss);

    // Durata: traffico + meteo + tratto autista + Telepass
    const trafficMult  = _getTrafficMult();
    const weatherSpeed = (WEATHER_STATES.find(w => w.id === gameState.weather) || {speedMult:1}).speedMult;
    // Specialty bonus: speed
    let specialtySpeedBonus = 1.0;
    if (driver.specialty === 'airport_pro' && (ride.fromPoi.type === 'hub' || ['roma_fco','nap_capo','mil_mxp','mil_lin','ven_mp','olbia'].includes(ride.fromPoi.id))) specialtySpeedBonus = 1.15;
    if (driver.specialty === 'city_roma'   && (ride.fromPoi.region === 'lazio'     || ride.toPoi.region === 'lazio'))     specialtySpeedBonus = 1.20;
    if (driver.specialty === 'city_milano' && (ride.fromPoi.region === 'lombardia' || ride.toPoi.region === 'lombardia')) specialtySpeedBonus = 1.20;
    if (driver.specialty === 'city_napoli' && (ride.fromPoi.region === 'campania'  || ride.toPoi.region === 'campania'))  specialtySpeedBonus = 1.20;
    if (driver.specialty === 'alpine'      && gameState.weather === 'neve') specialtySpeedBonus = 1.25;
    // Dynamic event speed multiplier
    const eventSpeedMult = gameState.activeDynamicEvent?.speedMult || 1.0;
    // Centralina ECU Sport: +28% velocità
    const centralinaMult = (car.upgrades || []).includes('centralina') ? 1.28 : 1.0;
    // Skill Velocità (1-100): da -20% a +20% rispetto a 50 di base
    const skillSpeedMult = 1.0 + ((driver.skill_speed || 50) - 50) / 250;
    let speedMult = (driver.trait?.speedMult || 1.0) * trafficMult * weatherSpeed * specialtySpeedBonus * eventSpeedMult * centralinaMult * skillSpeedMult;
    ride.duration = Math.max(5000, Math.floor(ride.duration / speedMult));
    // Stress: >80% aggiunge 50% di durata (autista teso = più lento)
    if ((driver.stress_level || 0) >= 80) {
        ride.duration = Math.floor(ride.duration * 1.5);
    }
    // Telepass Premium: -10% su trasferimenti interregionali
    if (hasInvestment('inv_telepass') && ride.fromPoi.region !== ride.toPoi.region) {
        ride.duration = Math.floor(ride.duration * 0.90);
    }
    // Telepass Auto (per-car upgrade): -15% durata su tutte le corse
    if ((car.upgrades || []).includes('telepass_car')) {
        ride.duration = Math.floor(ride.duration * 0.85);
    }
    // Cantieri: +35% duration if roadworks on this route
    const cantieriMult = _getCantieriSpeedMult(ride.fromPoi.id, ride.toPoi.id);
    if (cantieriMult < 1.0) {
        ride.duration = Math.floor(ride.duration / cantieriMult);
        logToMap(`🚧 ${driver.name} passa per cantieri: corsa rallentata.`);
    }

    // Incidente: base 1%, ridotto da auto nuova / meccanico / tratto / Dashcam / Ranking Top 3 / safe driving
    let accidentProb = 0.010;
    if (car.condition > 80) accidentProb *= 0.50;
    if ((car.tirePressure || 100) < 30) accidentProb *= 1.80; // flat-ish tires are dangerous
    if (gameState.staff.some(s => s.id === 'mech')) accidentProb *= 0.30;
    if (driver.trait?.accidentMult) accidentProb *= driver.trait.accidentMult;
    if (hasInvestment('inv_dashcam')) accidentProb *= 0.50;
    if (hasInvestment('inv_safe_driving')) accidentProb *= 0.50;
    if (_getRankPosition() <= 3) accidentProb *= 0.85;
    if (Math.random() < accidentProb) ride.hasIncident = true;

    // Tire pressure decay
    if (car.tirePressure === undefined) car.tirePressure = 100;
    car.tirePressure = Math.max(0, car.tirePressure - (3 + Math.random() * 4));
    if (car.tirePressure < 20 && Math.random() < 0.15) {
        logToMap(`🔴 ${car.name}: gomme critiche! Rischio guasto aumentato.`);
        if (typeof showNotification === 'function') showNotification(`⚠️ ${car.name}: pressione gomme critica!`, 'error');
    }

    // Fuel consumption: intercity uses more fuel; EVs skip gasoline logic entirely
    if (!_isElectric(car)) {
        const fuelCost = { standard:12, business:16, vip:20, ultra:25, group:18 };
        const baseFuel = fuelCost[ride.tier] || 14;
        const tireFuelMult = car.tirePressure < 50 ? 1.25 : car.tirePressure < 70 ? 1.10 : 1.0;
        // Serbatoio Maggiorato: -55% consumo; Tecnico Guida Eco: -20%
        const serbatoioMult = (car.upgrades || []).includes('serbatoio_ext') ? 0.45 : 1.0;
        const _ecoMult = (driver && typeof window.driverAllEffects === 'function') ? (window.driverAllEffects(driver).fuelMult || 1.0) : 1.0;
        car.fuel = Math.max(0, car.fuel - (ride.fromPoi.region !== ride.toPoi.region ? baseFuel * 1.5 : baseFuel) * tireFuelMult * serbatoioMult * _ecoMult);

        // Engine health penalty: <30% → double fuel consumption on next ride
        if ((car.engineHealth || 100) === 0) {
            car.outOfService = 'engine';
            return;
        }
        const _ehMult = (car.engineHealth || 100) < 30 ? 2.0 : 1.0;
        if (_ehMult > 1) {
            car.fuel = Math.max(0, car.fuel - (baseFuel * (_ehMult - 1) * serbatoioMult));
        }
    } else {
        // EV: engine seized check still applies
        if ((car.engineHealth || 100) === 0) { car.outOfService = 'engine'; return; }
    }

    // Mileage tracking
    if (car.mileage === undefined) car.mileage = 0;
    const kmGain = ride.fromPoi.region !== ride.toPoi.region ? 250 : 60;
    car.mileage += kmGain;
    if (car.mileage > 0 && car.mileage % 5000 < kmGain) {
        logToMap(`🔧 ${car.name} ha superato i ${Math.floor(car.mileage/1000)}k km: manutenzione consigliata!`);
        if (typeof showNotification === 'function') showNotification(`🔧 ${car.name}: tagliando necessario a ${Math.floor(car.mileage/1000)}k km!`, 'error');
    }

    gameState.activeRides.push(ride);

    // Real-time trip duration derived from route price (€1 ≈ 0.4 min, capped 10–360 min)
    const _isIntercity = ride.fromPoi.region !== ride.toPoi.region;
    const _realMs      = _getRideDurationMs(ride);
    gameState.activeTrips.push({
        id:         ride.id,
        driverId:   driver.id,
        carId:      car.id,
        driverName: driver.name,
        fromName:   ride.fromPoi?.name || '?',
        toName:     ride.toPoi?.name  || '?',
        fromPoiId:  ride.fromPoi?.id  || null,
        tier:       ride.tier,
        startTime:  Date.now(),
        endTime:    Date.now() + _realMs,
        earnings:   null, // filled by completeRide when visual simulation ends
    });

    const trafficLabel = trafficMult < 1 ? ' 🚦' : trafficMult > 1 ? ' 🌙' : '';
    logToMap(`🚖 ${driver.name} partito per ${ride.toPoi?.name || '?'}${trafficLabel}`);

    if (_tabIs('corse') && typeof renderTabCorse==='function') renderTabCorse();
}

function completeRide(ride, _deferPay = false) {
    const hasHR = gameState.staff.some(s => s.id === 'hr');
    const driver = gameState.drivers.find(d => d.id === ride.driverId);

    // Fatigue gain (non-CEO drivers only)
    if (driver && driver.id !== 'ceo') {
        if (driver.fatigue === undefined) driver.fatigue = 0;
        const fatigueCost = { ultra: 20, vip: 15, business: 10, standard: 8 };
        const prevFatigue = driver.fatigue;
        const levelFatigueMult = (DRIVER_LEVELS[driver.level || 0] || DRIVER_LEVELS[0]).fatigueBonus;
        // Skill Efficienza (1-100): a 100 riduce fatica del 40%, a 1 la aumenta del 20%
        const skillEffMult = 1.0 - ((driver.skill_efficiency || 50) - 50) / 100 * 0.6;
        const fatigueMult = (driver.trait?.fatigueMult || 1.0) * levelFatigueMult * skillEffMult;
        driver.fatigue = Math.min(100, driver.fatigue + (fatigueCost[ride.tier] || 8) * fatigueMult);

        // Avviso primo superamento 70% senza HR
        if (!hasHR && prevFatigue < 70 && driver.fatigue >= 70) {
            if(typeof showNotification==='function') showNotification(`⚠️ ${driver.name} stanco (${Math.floor(driver.fatigue)}%). Considera il riposo.`, 'error');
        }

        // Con HR: riposo automatico a 85%
        // Senza HR: riposo forzato a 100% (prevenzione incidenti gravi)
        if (hasHR && driver.fatigue >= 85) {
            _sendDriverToRest(driver, 6);
            logToMap(`🛌 HR: ${driver.name} in riposo (fatica: ${Math.floor(driver.fatigue)}%).`);
        } else if (!hasHR && driver.fatigue >= 100) {
            driver.fatigue = 100;
            // Rischio incidente per stanchezza estrema
            const car = gameState.fleet.find(c => c.id === driver.assignedCarId);
            if (car && Math.random() < 0.15) {
                car.condition = Math.max(0, car.condition - 25);
                logToMap(`💥 INCIDENTE: ${driver.name} esausto! Auto danneggiata (-25 cond.).`);
                if(typeof showNotification==='function') showNotification(`💥 ${driver.name} ha avuto un incidente per stanchezza!`, 'error');
            }
            _sendDriverToRest(driver, 6);
            logToMap(`🛌 FORZATO: ${driver.name} al riposo (fatica 100%).`);
            if(typeof showNotification==='function') showNotification(`🛌 ${driver.name} va in riposo obbligatorio.`, 'error');
        }

        // ── STRESS SYSTEM ────────────────────────────────────────
        if (driver.stress_level === undefined) driver.stress_level = 0;
        const _execPassStressMult = gameState.executivePassActive ? 0.5 : 1.0;
        const stressGain = Math.round((ride.tier === 'ultra' ? 25 : ride.tier === 'vip' ? 20 : 15) * _execPassStressMult);
        const prevStress = driver.stress_level;
        driver.stress_level = Math.min(100, driver.stress_level + stressGain);
        if (prevStress < 80 && driver.stress_level >= 80) {
            if(typeof showNotification==='function') showNotification(`😰 ${driver.name} sotto stress! Velocità −33%. Fallo riposare.`, 'error');
        }
        if (driver.stress_level >= 100) {
            // BURNOUT: 12h di recupero forzato
            const _bHour = gameState.day * 24 + gameState.hour;
            driver.burnout_until = _bHour + 12;
            driver.stress_level = 0;
            _sendDriverToRest(driver, 12);
            logToMap(`🔥 BURNOUT: ${driver.name} — recupero forzato 12h!`);
            if(typeof showNotification==='function') showNotification(`🔥 ${driver.name} in BURNOUT! Riposo 12 ore.`, 'error');
        }
    }

    // Condizione dell'auto PRIMA di un eventuale incidente di questa corsa — usata più sotto
    // per il conditionMult, così il danno di QUESTO incidente non si scarica due volte sulla
    // stessa corsa (una volta via il taglio prezzo 50%, una seconda via conditionMult che
    // altrimenti leggerebbe la condizione già danneggiata).
    const _conditionBeforeIncident = gameState.fleet.find(c => c.id === driver?.assignedCarId)?.condition;

    // Incidente: auto danneggiata, incasso ridotto
    if (ride.hasIncident) {
        const car = gameState.fleet.find(c => c.id === driver?.assignedCarId);
        if (hasInvestment('inv_kasko')) {
            logToMap(`🛡️ Kasko: incidente coperto per ${driver?.name}, auto riparata automaticamente.`);
            if(typeof showNotification==='function') showNotification(`🛡️ Kasko: incidente coperto!`, 'success');
        } else {
            if (car) car.condition = Math.max(0, car.condition - 20);
            gameState.brandVolume = Math.max(0, (gameState.brandVolume || 0) - 3);
            logToMap(`💥 Guasto en-route: ${driver?.name}! Auto danneggiata (-20 cond.).`);
            if(typeof showNotification==='function') showNotification(`💥 Guasto! Auto di ${driver?.name} danneggiata.`, 'error');
        }
        ride.price = Math.floor(ride.price * 0.5); // Cliente risarcito del ritardo
    }

    // Incident map marker
    if (ride.hasIncident && typeof addIncidentMarker === 'function') {
        addIncidentMarker(ride.toPoi.lat, ride.toPoi.lng, driver?.name || '?');
    }
    // Permadeath roll (Espansione 2: Alberi Abilità)
    if (ride.hasIncident && driver && driver.id !== 'ceo' && typeof window.driverPermadeathRoll === 'function') {
        const _pCar = gameState.fleet.find(c => c.id === driver.assignedCarId);
        window.driverPermadeathRoll(driver, _pCar);
    }

    // Mance: HR +15%, tratto Gentleman, livello XP, upgrade auto, specialty, dynamic event, skill tree
    const hrTipMult     = hasHR ? 1.15 : 1.0;
    const isVipOrUltra  = ride.tier === 'vip' || ride.tier === 'ultra';
    const traitTipMult  = (driver?.trait?.tipMult || 1.0) * (isVipOrUltra ? (driver?.trait?.vipTipMult || 1.0) : 1.0);
    const levelData     = driver ? (DRIVER_LEVELS[driver.level] || DRIVER_LEVELS[0]) : DRIVER_LEVELS[0];
    const levelTipMult  = driver ? levelData.tipBonus : 1.0;
    // Skill tree tip bonus (Diplomatico: Sorriso di Platino)
    const _skillEffects = (driver && typeof window.driverAllEffects === 'function') ? window.driverAllEffects(driver) : {};
    const skillTipMult  = _skillEffects.tipMult || 1.0;
    // Diplomatico: Ambasciatore — VIP rep gain
    if (isVipOrUltra && _skillEffects.vipRepGain && driver?.id !== 'ceo') {
        window.CE_money.addReputation(_skillEffects.vipRepGain);
    }
    // Specialty tip bonus
    let specTipMult = 1.0;
    if (driver?.specialty === 'night_owl' && (gameState.hour >= 22 || gameState.hour < 6)) specTipMult = 1.30;
    if (driver?.specialty === 'vip_escort' && (ride.tier === 'vip' || ride.tier === 'ultra')) specTipMult = 1.10;
    if (driver?.specialty === 'city_roma'   && ride.toPoi.region === 'lazio')     specTipMult = Math.max(specTipMult, 1.20);
    if (driver?.specialty === 'city_milano' && ride.toPoi.region === 'lombardia') specTipMult = Math.max(specTipMult, 1.20);
    if (driver?.specialty === 'city_napoli' && ride.toPoi.region === 'campania')  specTipMult = Math.max(specTipMult, 1.20);
    // Dynamic event tip
    const eventTipMult = gameState.activeDynamicEvent?.tipMult || 1.0;
    // Car upgrade price multiplier
    const car2 = gameState.fleet.find(c => c.id === driver?.assignedCarId);
    const upgradeMult = (car2?.upgrades || []).reduce((acc, uid) => {
        const u = CAR_UPGRADES.find(x => x.id === uid);
        return u ? acc * u.priceMult : acc;
    }, 1.0);

    // ── Extra Hours / Delay penalty (15% chance per ride) ────────────
    let delayBonus = 0;
    let delayHours = 0;
    let isDelayed  = false;
    if (!ride.hasIncident && Math.random() < 0.15) {
        isDelayed   = true;
        delayHours  = 1; // 1 extra hour billed
        const car3  = gameState.fleet.find(c => c.id === driver?.assignedCarId);
        const vClass = car3?.vehicleClass || 'stellar_e_exec';
        const extraRates = {
            stellar_e_exec:105, stellar_q_exec:105, volt_3_urban:105,
            stellar_v_carr:125, stellar_q_carr:125, volt_y_cross:125,
            stellar_s_imp:195,  stellar_q_imp:195,  volt_s_apex:195,
            volt_s_hyper:250,   majestic_spirit:300, majestic_e_specter:300,
            water_taxi:221
        };
        const extraRate = extraRates[vClass] || 105;
        delayBonus  = Math.floor(extraRate * 1.25); // selling price version
        if (ride.duration !== undefined) ride.duration += 3_600_000; // car blocked 1 more hour
        logToMap(`⏱️ Ritardo cliente: +1h fatturata a ${driver?.name || 'autista'} (corsa ${ride.toPoi?.name || ''}). Bonus +€${delayBonus}`);
        showNotification(`⏱️ Ritardo cliente! +€${delayBonus} extra fatturati.`, 'success');
    }

    // Skill Carisma (1-100): a 100 +25% guadagni, a 1 -12.5%
    const skillCharismaMult = 1.0 + ((driver?.skill_charisma || 50) - 50) / 200;
    // Pricing Strategy: discount −20%, standard ×1, premium +40%
    const _ps = gameState.pricingStrategy || 'standard';
    const strategyMult = _ps === 'premium' ? 1.40 : _ps === 'discount' ? 0.80 : 1.0;
    // Condition malus: <50% → −15%, <30% → −20% (i clienti VIP odiano le auto malridotte)
    const _car3 = gameState.fleet.find(c => c.id === driver?.assignedCarId);
    const _cond3 = _conditionBeforeIncident != null ? _conditionBeforeIncident : (_car3 ? (_car3.condition || 0) : 100);
    const conditionMult = _cond3 < 30 ? 0.80 : _cond3 < 50 ? 0.85 : 1.0;
    const _kmEst = _car3 && ride.fromPoi?.region !== ride.toPoi?.region ? 250 : 60;
    const _fuelDeduction = Math.round((_kmEst / 10) * (gameState.fuelPrice || 1.85));
    // Sindacato modifiers (server-authoritative state cached in _sindacatoState)
    const _ss = window._sindacatoState || {};
    const _strikeMult    = _ss.strikeActive ? 0.70 : 1.0;
    const _crumiriMult   = (_ss.crumiriBoostUntil && new Date() < new Date(_ss.crumiriBoostUntil)) ? 1.50 : 1.0;
    const _consorzioMult = (_ss.consorzioMembersCount >= 5) ? 1.08 : 1.0;
    const _vipEarningsBuff = typeof window._getBuffValue === 'function' ? (1 + window._getBuffValue('earnings_pct') / 100) : 1.0;
    const _vipTipBuff      = typeof window._getBuffValue === 'function' ? (1 + window._getBuffValue('tip_pct') / 100) : 1.0;
    // Server decree effects (Espansione 5)
    const _decreeFx  = (typeof window.getDecreeEffects === 'function') ? window.getDecreeEffects() : {};
    const _decreeTip = _decreeFx.tipMult || 1.0;
    // HQ allEarningsMult (Espansione 6: Penthouse CEO)
    const _hqFx  = (typeof window.hqAllEffects === 'function') ? window.hqAllEffects() : {};
    const _hqTip = _hqFx.allEarningsMult || 1.0;
    // Bottega del Consorzio — perk guadagni attivo (boost_income / mega_income)
    const _allyEarn = (typeof window._allyPerkMult === 'function') ? window._allyPerkMult('earnings') : 1.0;
    const earned = Math.max(0, Math.floor((ride.price + delayBonus) * hrTipMult * traitTipMult * _vipTipBuff * levelTipMult * upgradeMult * specTipMult * eventTipMult * skillCharismaMult * strategyMult * conditionMult * _strikeMult * _crumiriMult * _consorzioMult * _vipEarningsBuff * skillTipMult * _decreeTip * _hqTip * _allyEarn) - _fuelDeduction);

    const prevCash = gameState.cash;
    if (_deferPay) {
        const _trip = (gameState.activeTrips || []).find(t => t.id === ride.id);
        if (_trip) _trip.earnings = earned;
    } else {
        window.CE_money.earn(earned, 'ride_earnings');
        gameState.todayEarnings = (gameState.todayEarnings || 0) + earned;
        // Dividendo OPA: se il giocatore è sotto OPA ostile, paga il 20% al raider
        if (window.supabaseClient && window.currentUser) {
            // Entrambe le RPC scalano companies.cash SUL SERVER (27_hostile_takeovers.sql,
            // 29_infrastructure_monopoly.sql): il totale appena sincronizzato da earn()
            // contiene ancora quei soldi. Quando la RPC ritorna l'importo scalato,
            // allineiamo la previsione locale con addebitatoDalServer SENZA risincronizzare.
            window.supabaseClient.rpc('rpc_pay_majority_dividend', {
                v_target_user_id: window.currentUser.id,
                v_ride_earnings:  earned
            }).then((dividendo) => {
                if (dividendo > 0) window.CE_money.addebitatoDalServer(dividendo, 'opa_majority_dividend');
            }, () => { /* silent — offline o nessuna OPA attiva */ });
            // Espansione 12: levy deposito carburante
            const _levyProv = ride.fromPoi?.id ? _POI_TO_PROVINCE[ride.fromPoi.id] : null;
            if (_levyProv) {
                window.supabaseClient.rpc('rpc_pay_fuel_levy', {
                    v_province_id: _levyProv,
                    v_fare: earned
                }).then((levyRes) => {
                    if (levyRes && levyRes.levy > 0) window.CE_money.addebitatoDalServer(levyRes.levy, 'fuel_levy');
                }, () => {});
            }
        }
    }
    window.CE_money.addReputation(0.02);

    // Milestone €1.000.000 (una volta sola)
    if (prevCash < 1_000_000 && gameState.cash >= 1_000_000 && !gameState._milestoneM1) {
        gameState._milestoneM1 = true;
        if (typeof _broadcastNews === 'function') _broadcastNews(`${gameState.companyName} ha raggiunto €1.000.000 di liquidità! 💰`, 'milestone');
        showNotification('🎉 MILESTONE: €1.000.000 in cassa!', 'success');
    }

    // XP gain for non-CEO drivers (+ Velocista bonus)
    if (driver && driver.id !== 'ceo') {
        const xpGain = { standard:10, business:20, vip:35, ultra:60, group:15 };
        if (driver.xp === undefined) driver.xp = 0;
        const _xpMult = (typeof window.driverAllEffects === 'function' ? (window.driverAllEffects(driver).xpMult || 1.0) : 1.0);
        driver.xp += Math.round((xpGain[ride.tier] || 10) * _xpMult);
        _checkDriverLevel(driver);
    }

    // Tecnico: Maestro Meccanico — auto-repair if condition low
    if (driver && typeof window.driverAllEffects === 'function') {
        const _tec = window.driverAllEffects(driver);
        if (_tec.autoRepair) {
            const _tCar = gameState.fleet.find(c => c.id === driver.assignedCarId);
            if (_tCar && (_tCar.condition || 0) < (_tec.autoRepairThreshold || 30)) {
                _tCar.condition = Math.min(100, (_tCar.condition || 0) + _tec.autoRepair);
            }
        }
    }

    const extras = [hasHR ? '+HR' : null, traitTipMult > 1 ? `+${Math.round((traitTipMult-1)*100)}%` : null, levelTipMult > 1 ? `Lv${driver?.level}` : null, ride.isEmptyLeg ? 'EmptyLeg' : null, ride.isGreyMarket ? '🕵️' : null, isDelayed ? '⏱️+1h' : null].filter(Boolean).join(' ');
    logToMap(`💰 Incasso: €${earned} da ${ride.toPoi?.name || '?'}${extras ? ` (${extras})` : ''}`);

    // ── HUB TAX: se il giocatore possiede un hub di origine/destinazione ──────
    if ((gameState.ownedHubs || []).length > 0) {
        const hubTax = [ride.fromPoi?.id, ride.toPoi?.id]
            .filter(id => gameState.ownedHubs.includes(id))
            .length * Math.round(earned * 0.03);
        if (hubTax > 0) {
            gameState.hubTaxBalance = (gameState.hubTaxBalance || 0) + hubTax;
            logToMap(`🏛️ Tassa Hub: +€${hubTax} (patrimonio hub: €${gameState.hubTaxBalance.toLocaleString()})`);
        }
    }

    // ── CEO DELLA SETTIMANA — weekly tracking ────────────────────────────────
    gameState.weeklyEarnings = (gameState.weeklyEarnings || 0) + earned;
    gameState.weeklyRides    = (gameState.weeklyRides || 0) + 1;

    // Classic Vacations contract tracking
    if (ride.isContract) {
        gameState.cvWeeklyCompleted = (gameState.cvWeeklyCompleted || 0) + 1;
        const margin = Math.max(0, (ride.price || 0) - (ride.netCost || 0));
        gameState.totalContractMargin = (gameState.totalContractMargin || 0) + margin;
    }

    // Quest stat tracking
    // Riempi i contatori MANCANTI uno per uno, non solo il caso "oggetto assente":
    // Object.assign in loadGame sostituisce questStats in blocco, quindi un salvataggio
    // salvato prima che un contatore esistesse lo lascerebbe undefined -> `++` = NaN.
    if (!gameState.questStats) gameState.questStats = {};
    for (const _k of ['totalRides','vipRides','ultraRides','fcoRides','portRides','contractRides','portoCervoRides']) {
        if (typeof gameState.questStats[_k] !== 'number' || !isFinite(gameState.questStats[_k])) gameState.questStats[_k] = 0;
    }
    const qs = gameState.questStats;
    qs.totalRides++;
    if (ride.tier === 'ultra') qs.ultraRides++;
    if (ride.tier === 'vip' || ride.tier === 'ultra') qs.vipRides++;
    if (ride.fromPoi?.id === 'roma_fco' || ride.toPoi?.id === 'roma_fco') qs.fcoRides++;
    if (ride.toPoi?.type === 'port' || ride.fromPoi?.type === 'port') qs.portRides++;
    if (ride.isContract) qs.contractRides++;
    if ((ride.toPoi?.id === 'porto_cervo' || ride.toPoi?.name?.toLowerCase().includes('porto cervo')) && ride.tier === 'ultra') qs.portoCervoRides++;

    // Charmante trait: +15% mance VIP/Ultra (already via vipTipMult), 10% chance of big tip email
    if (driver?.trait?.id === 'charmante' && (ride.tier === 'vip' || ride.tier === 'ultra') && Math.random() < 0.10) {
        const bonus = 250 + Math.floor(Math.random() * 250);
        window.CE_money.earn(bonus, 'charmante_tip');
        const gameHour = gameState.day * 24 + gameState.hour;
        const _charmanteEmail = {
            id: gameState.nextId++, sender: driver.name,
            subject: `[${driver.name}] Il cliente era estasiato!`,
            body: `Capo, il cliente era in estasi per il servizio. Mi ha lasciato una mancia extra di €${bonus * 2}. Come promesso, ti giro la metà: +€${bonus} in cassa.`,
            type: 'driver_msg', status: 'unread', expiresAt: gameHour + 48
        };
        _applyEmailTemplate(_charmanteEmail, 'driver_msg', { driverName: driver?.name || '' });
        gameState.emails.push(_charmanteEmail);
        logToMap(`✨ Charmante: ${driver.name} → mancia extra +€${bonus}!`);
        const dot = document.getElementById('mail-dot'); if (dot) dot.classList.remove('hidden');
    }

    // F2P Driver Coins drop: 5% chance on ultra-tier ride
    if (ride.tier === 'ultra' && Math.random() < 0.05) {
        const drop = 1 + Math.floor(Math.random() * 3);
        window.CE_money.earnDC(drop, 'ultra_ride_drop');
        logToMap(`🪙 Driver Coins: +${drop} DC da transfer Presidential!`);
        if (typeof showNotification === 'function') showNotification(`🪙 +${drop} Driver Coins guadagnati!`, 'success');
    }

    // Story mission completion hook
    if (ride.missionId && typeof window.completeMissionRun === 'function') {
        window.completeMissionRun(ride.missionId);
    }

    // Check quest progress after every completed ride
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();

    // VIP client completion hook
    if (ride.vipClientId && typeof window._vipOnComplete === 'function') {
        window._vipOnComplete(ride.vipClientId, ride, driver, earned);
    }

    // Territory influence (async, fire & forget)
    _awardTerritoryInfluence(ride);

    saveGame();

    // Empty leg: if a long-distance ride just completed, look for a return passenger
    if (ride.fromPoi.region !== ride.toPoi.region && !ride.isEmptyLeg && driver) {
        _findEmptyLegRide(ride);
    }

    const bar = document.getElementById(`prog-${ride.driverId}`);
    if (bar) bar.style.width = '0%';

    // Rifornimento automatico: il Logistics Manager gestisce gasolio e gomme
    if (car2) refillVehicle(car2.id);

    // Posizione persistente: l'auto resta nell'ultima destinazione
    if (car2 && ride.toPoi?.id) car2.currentPoiId = ride.toPoi.id;

    // If pay is deferred, driver stays busy until checkActiveTrips() fires at endTime.
    // If paying immediately (legacy/manual calls), free the driver now.
    if (!_deferPay && driver) startNextRide(driver);
}


// ─── REAL-TIME TRIP COMPLETION ────────────────────────────────────
function checkActiveTrips() {
    // VIP buff tick and fuel lock enforcement
    if (typeof window._vipBuffTick === 'function') window._vipBuffTick();
    if (gameState.fuelPriceLock && gameState.fuelPriceLockUntil > gameState.day * 24 + gameState.hour) {
        gameState.fuelPrice = gameState.fuelPriceLock;
    } else if (gameState.fuelPriceLock) {
        gameState.fuelPriceLock = null;
    }

    // Temp Kasko pruning — remove when past expiry day (unless player bought permanent kasko)
    if ((gameState.tempKaskoExpiresDay || 0) > 0 && gameState.day > gameState.tempKaskoExpiresDay) {
        if (!gameState._permKasko) {
            gameState.investments = (gameState.investments || []).filter(i => i !== 'inv_kasko');
        }
        gameState.tempKaskoExpiresDay = 0;
        if (typeof logToMap === 'function') logToMap('🛡️ Polizza Kasko Corporate scaduta.');
    }

    const trips = gameState.activeTrips || [];
    if (!trips.length) return;
    const now = Date.now();
    let completed = 0;
    let totalEarnings = 0;
    for (let i = trips.length - 1; i >= 0; i--) {
        const trip = trips[i];
        if (now < trip.endTime) continue;
        // Pay earnings
        if (trip.earnings != null) {
            totalEarnings += trip.earnings;
            gameState.todayEarnings = (gameState.todayEarnings || 0) + trip.earnings;
            // Dividendo OPA: se il giocatore è sotto OPA ostile, paga il 20% al raider
            if (window.supabaseClient && window.currentUser) {
                // Stessa ragione del ramo completeRide: le RPC scalano companies.cash sul
                // server, quindi l'importo ritornato va tolto anche dalla previsione locale
                // (addebitatoDalServer, senza risincronizzare) prima o dopo il earn() del totale.
                window.supabaseClient.rpc('rpc_pay_majority_dividend', {
                    v_target_user_id: window.currentUser.id,
                    v_ride_earnings:  trip.earnings
                }).then((dividendo) => {
                    if (dividendo > 0) window.CE_money.addebitatoDalServer(dividendo, 'opa_majority_dividend');
                }, () => { /* silent — offline o nessuna OPA attiva */ });
                // Espansione 12: levy deposito carburante
                const _tripProvince = trip.fromPoiId ? _POI_TO_PROVINCE[trip.fromPoiId] : null;
                if (_tripProvince) {
                    window.supabaseClient.rpc('rpc_pay_fuel_levy', {
                        v_province_id: _tripProvince,
                        v_fare: trip.earnings
                    }).then((levyRes) => {
                        if (levyRes && levyRes.levy > 0) window.CE_money.addebitatoDalServer(levyRes.levy, 'fuel_levy');
                    }, () => {});
                }
            }
            const fmt = trip.earnings >= 1000
                ? `€${(trip.earnings / 1000).toFixed(1)}k`
                : `€${trip.earnings}`;
            showNotification(`✅ ${trip.driverName} → ${trip.toName}: +${fmt} incassati`, 'success');
            logToMap(`💰 Viaggio completato: +€${trip.earnings} — ${trip.toName}`);
        }
        // Free driver
        const driver = gameState.drivers.find(d => d.id === trip.driverId);
        if (driver && driver.status === 'busy') {
            driver.status = 'idle';
            startNextRide(driver);
        }
        trips.splice(i, 1);
        completed++;
    }
    if (totalEarnings > 0) {
        window.CE_money.earn(totalEarnings, 'completed_trips');
    }
    if (completed > 0) {
        updateUI();
        saveGame();
    }
}


// ── Window exports ──────────────────────────────────────────────
window.generatePOIRide      = generatePOIRide;
window.generateContractRide = generateContractRide;
window.autoDispatchRides    = autoDispatchRides;
window.assignRideToDriver   = assignRideToDriver;
window.startNextRide        = startNextRide;
window.completeRide         = completeRide;
window.checkActiveTrips     = checkActiveTrips;
window._getRideDurationMs   = _getRideDurationMs;
window._formatDuration      = _formatDuration;
window._getDriverQueueInfo  = _getDriverQueueInfo;
window._getDriverQueueCapMs = _getDriverQueueCapMs;
window.DRIVER_QUEUE_HOURS   = DRIVER_QUEUE_HOURS;
window._previewQueueWithRide = _previewQueueWithRide;
