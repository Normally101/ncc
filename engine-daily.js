'use strict';
/* ================================================================
   engine-daily.js — Chauffeur Empire
   Tick giornalieri e routine: fatica, meteo, email, carburante,
   processDailyRoutines, generazione email eventi, soddisfazione driver.
   Dipendenze: engine.js (gameState, logToMap, showNotification,
               showBigEvent, hasInvestment, saveGame, updateUI,
               _applyEmailTemplate, _checkAchievements, _getRankPosition)
   Caricato dopo: engine.js
   ================================================================ */

// ─── FATIGUE SYSTEM ───
function _sendDriverToRest(driver, hours) {
    driver.status = 'resting';
    driver.restHoursLeft = hours;
    driver.queue = [];
}

function _tickFatigue() {
    const hasHR = gameState.staff.some(s => s.id === 'hr');

    // CEO energy management
    const hasLounge = hasInvestment('inv_vip_lounge_hq');
    // Lifestyle: attico e villa danno bonus energia CEO
    const lifestyleEnergyBonus = (gameState.lifestyleAssets || []).reduce((s, id) => {
        const a = (typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : []).find(x => x.id === id);
        return s + (a ? (a.energyBonus || 0) : 0);
    }, 0);
    /* RIPOSO DI BASE (+1,0/h) PER TUTTI.
       Prima la rigenerazione viveva INTERAMENTE dentro questo ramo: chi non
       aveva HR, VIP Lounge o un asset lifestyle — cioe' ogni giocatore nuovo —
       consumava 5%/ora e non recuperava mai. Fuori dalla fase survival non
       esiste piu' nemmeno il «Dormi in auto» gratuito: restavano l'hotel a
       pagamento o 4 DC. Un giocatore che comincia non deve trovare un muro.
       HR (+1,0) e Lounge (+2,0) restano BONUS SOPRA la base, quindi conservano
       il loro valore: il riposo e' un costo in tempo, non un pedaggio. */
    {
        const ceoOnRide = gameState.activeRides.some(r => r.driverId === 'ceo');
        if (!ceoOnRide) gameState.energy = Math.min(100, gameState.energy + 1.0);
    }
    if (hasHR || hasLounge || lifestyleEnergyBonus > 0) {
        const ceoOnRide = gameState.activeRides.some(r => r.driverId === 'ceo');
        const energyGain = (hasLounge ? 2.0 : 1.0) + lifestyleEnergyBonus;
        if (!ceoOnRide) gameState.energy = Math.min(100, gameState.energy + energyGain);
        // Force-warn CEO at critical energy
        if (gameState.energy < 15 && !gameState._ceoRestWarned) {
            gameState._ceoRestWarned = true;
            showBigEvent('😴', 'HR: Riposo CEO Necessario', `Energia CEO al ${Math.round(gameState.energy)}%! L'HR Specialist ha bloccato nuove corse. Vai in hotel per recuperare prima di riprendere i servizi.`);
            logToMap(`😴 HR: CEO in riposo forzato — energia critica (${Math.round(gameState.energy)}%)`);
        }
        if (gameState.energy >= 20) gameState._ceoRestWarned = false;
    }

    // Copia: il burnout più sotto fa splice() sull'array live — iterare sull'originale
    // farebbe saltare il driver successivo a quello rimosso (forEach avanza comunque
    // all'indice successivo, che dopo lo splice punta a chi era 2 posizioni più avanti).
    [...gameState.drivers].forEach(driver => {
        if (driver.id === 'ceo') return;
        if (driver.fatigue  === undefined) driver.fatigue  = 0;
        if (driver.morale   === undefined) driver.morale   = 100;
        if (driver.restHoursLeft === undefined) driver.restHoursLeft = 0;

        // Morale: fatica alta → erosione morale; basso stipendio → erosione lenta
        if (driver.fatigue > 70) driver.morale = Math.max(0, driver.morale - 0.5);
        else if (driver.fatigue < 30) driver.morale = Math.min(100, driver.morale + 0.3);
        if ((driver.salary || 0) < 2500) driver.morale = Math.max(0, driver.morale - 0.1);

        // Burnout: morale a zero → dimissioni
        if (driver.morale <= 0 && driver.status !== 'resting') {
            const idx = gameState.drivers.indexOf(driver);
            if (idx > -1) gameState.drivers.splice(idx, 1);
            logToMap(`😤 BURNOUT: ${driver.name} ha rassegnato le dimissioni!`);
            showBigEvent('😤', `${driver.name} si è dimesso!`, 'Burnout totale. Gestisci meglio il riposo e i salari!');
            if (_tabIs('staff') && typeof renderTabStaff === 'function') renderTabStaff();
            return;
        }

        if (driver.status === 'resting') {
            // Lifestyle staff bonus: yacht +30%, villa +15%, lounge +30%
            const lifestyleStaffMult = (gameState.lifestyleAssets || []).reduce((s, id) => {
                const a = (typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : []).find(x => x.id === id);
                return s + (a ? (a.staffBonus || 0) : 0);
            }, 0);
            const baseFatigueRecovery = hasInvestment('inv_vip_lounge_hq') ? 26 : 20;
            const fatigueRecovery = Math.round(baseFatigueRecovery * (1 + lifestyleStaffMult));
            driver.fatigue = Math.max(0, driver.fatigue - fatigueRecovery);
            driver.morale  = Math.min(100, driver.morale + 5);
            if (driver.restHoursLeft > 0) driver.restHoursLeft--;
            if (driver.restHoursLeft <= 0) {
                driver.status = 'idle';
                driver.fatigue = 0;
                if (driver._returning) {
                    const rc = gameState.fleet.find(c => c.id === driver.assignedCarId);
                    if (rc) rc.currentPoiId = 'roma';
                    delete driver._returning;
                    logToMap(`🏠 ${driver.name} è tornato all'Hub.`);
                } else {
                    logToMap(`✅ ${driver.name} riposato: di nuovo disponibile.`);
                }
                if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
                if (_tabIs('staff') && typeof renderTabStaff === 'function') renderTabStaff();
                if (_tabIs('fleet') && typeof renderTabFleet === 'function') renderTabFleet();
            }
        } else if (driver.fatigue >= 85) {
            // Con HR: riposo automatico a 85% se libero o in attesa
            // Senza HR: riposo forzato a 100% (o avviso a 85%)
            if (hasHR && driver.status !== 'busy') {
                _sendDriverToRest(driver, 6);
                logToMap(`🛌 HR: ${driver.name} in riposo forzato (fatica: ${Math.floor(driver.fatigue)}%).`);
                if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
            } else if (hasHR && driver.status === 'busy') {
                driver.queue = []; // svuota coda, riposo dopo la corsa corrente
            } else if (!hasHR && driver.fatigue >= 100 && driver.status !== 'busy') {
                // Senza HR: riposo obbligatorio a 100% quando libero
                _sendDriverToRest(driver, 6);
                logToMap(`🛌 FORZATO: ${driver.name} al riposo obbligatorio (100% fatica).`);
                if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
            }
        }
    });
    _tickDriverSatisfaction();
}

// ─── METEO ────────────────────────────────────────────────────────
function _tickWeather() {
    if (!gameState.weatherHoursLeft) gameState.weatherHoursLeft = 6;
    gameState.weatherHoursLeft--;
    if (gameState.weatherHoursLeft <= 0) {
        const roll = Math.random();
        const prev = gameState.weather;
        // Probabilità: 60% sole, 30% pioggia, 10% neve (solo inverno)
        const isWinter = gameState.month === 12 || gameState.month <= 2;
        if (roll < 0.60) gameState.weather = 'sole';
        else if (roll < 0.90 || !isWinter) gameState.weather = 'pioggia';
        else gameState.weather = 'neve';
        gameState.weatherHoursLeft = 4 + Math.floor(Math.random() * 5); // 4-8h
        if (prev !== gameState.weather) {
            const ws = WEATHER_STATES.find(w => w.id === gameState.weather);
            logToMap(`${ws.icon} Meteo cambiato: ${ws.label}${gameState.weather !== 'sole' ? ' — tariffe +' + Math.round((ws.priceMult-1)*100) + '%' : ''}`);
            _applyWeatherOverlay();
            if (typeof _tabIs === 'function' && _tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
        }
    }
}

function _applyWeatherOverlay() {
    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;
    overlay.className = 'fixed inset-0 pointer-events-none z-[2] transition-all duration-[2000ms]';
    if (gameState.weather === 'pioggia') overlay.classList.add('weather-rain');
    else if (gameState.weather === 'neve') overlay.classList.add('weather-snow');
    const icon = document.getElementById('tb-weather-icon');
    const label = document.getElementById('tb-weather-label');
    const ws = WEATHER_STATES.find(w => w.id === gameState.weather);
    if (icon) icon.innerText = ws?.icon || '☀️';
    if (label) label.innerText = ws?.label || 'Sereno';
}


function _tickEmails() {
    const gameHour = gameState.day * 24 + gameState.hour;
    let expired = 0;
    gameState.emails = gameState.emails.filter(e => {
        // Rimuovi solo le email non lette scadute
        if (e.status === 'unread' && e.expiresAt && gameHour >= e.expiresAt) {
            expired++;
            logToMap(`⏰ Scaduta: "${e.subject}"`);
            // Espansione 11: VIP deluso — diventa nemico
            if (e.type && e.type.startsWith('vip_') && typeof window._nemesisAddVip === 'function') {
                const _vipNamesMap = {
                    vip_grigori: 'Grigori V.', vip_strata: "L'Erede", vip_techbro: 'Il Tech Bro',
                    vip_onorevole: 'Il Ministro', vip_emiro: "Lo Sceicco", vip_golden: 'La Popstar',
                    vip_garante: 'Il Don', vip_wedding: 'La Diva', vip_platinum: 'Il CEO', vip_erede: "L'Agente"
                };
                const key = e.type.replace(/_event.*/, '');
                const vipName = _vipNamesMap[key] || 'VIP';
                window._nemesisAddVip(key, vipName, 'scaduta');
            }
            return false;
        }
        return true;
    }).slice(-60); // max 60 email in inbox
    if (expired > 0 && typeof showNotification === 'function') {
        showNotification(`⏰ ${expired} offerta${expired>1?'e':''} scaduta${expired>1?'e':''}!`, 'error');
    }
    // Hard cap: max 5 unread messages — drop oldest
    while (gameState.emails.filter(e => e.status === 'unread').length > 5) {
        const idx = gameState.emails.findIndex(e => e.status === 'unread');
        if (idx > -1) gameState.emails.splice(idx, 1);
    }
    if (_tabIs('emails') && typeof renderTabEmails === 'function') renderTabEmails();
    const dot = document.getElementById('mail-dot');
    const hasUnread = gameState.emails.some(e => e.status === 'unread');
    if (dot) dot.classList.toggle('hidden', !hasUnread);
}


// ─── FUEL DEPOT SYSTEM ───────────────────────────────────────────
function _tickFuelPrice() {
    const change = (Math.random() - 0.48) * 0.06; // slight upward bias simulates real market
    gameState.fuelPrice = Math.max(1.55, Math.min(2.60, +(gameState.fuelPrice + change).toFixed(2)));

    const hasLogMgr = gameState.staff.some(s => s.id === 'log_mgr');
    if (!hasLogMgr || !hasInvestment('inv_fuel_depot')) return;

    // Speculative buy alert when price hits a low
    if (gameState.fuelPrice < 1.68) {
        const space = gameState.fuelTankCapacity - gameState.fuelTank;
        if (space > 3000 && Math.random() < 0.5) {
            const _infoEmail = {
                id: gameState.nextId++, sender: 'Logistics Manager',
                subject: `🛢️ OPPORTUNITÀ: Gasolio a €${gameState.fuelPrice.toFixed(2)}/L — Acquistare ora!`,
                type: 'info', status: 'unread',
                expiresAt: gameState.day * 24 + gameState.hour + 3
            };
            _applyEmailTemplate(_infoEmail, 'info', {});
            gameState.emails.push(_infoEmail);
            const dot = document.getElementById('mail-dot');
            if (dot) dot.classList.remove('hidden');
        }
    }
    // Low stock alert
    if (gameState.fuelTank < gameState.fuelTankCapacity * 0.15 && gameState.fuelTank > 0) {
        logToMap(`⚠️ Logistics: deposito carburante sotto il 15% (${Math.floor(gameState.fuelTank)}L rimasti).`);
    }
}

// ─── RIFORNIMENTO AUTOMATICO FINE CORSA ──────────────────────────
// Chiamata automaticamente da completeRide() — il Logistics Manager gestisce tutto.
function refillVehicle(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.fuel  === undefined) car.fuel  = 100;
    if (car.engineHealth === undefined) car.engineHealth = 100;
    // Engine seized: can't operate
    if (car.engineHealth <= 0) { car.outOfService = 'engine'; return; }
    if (car.tirePressure === undefined) car.tirePressure = 100;

    let outReason = null;

    // — Gasolio — (solo veicoli non-EV; gli EV non consumano carburante)
    if (!_isElectric(car) && car.fuel < 99) {
        const litresNeeded = (100 - car.fuel) * 0.5; // 1% serbatoio ≈ 0.5 L
        if ((gameState.fuelTank || 0) >= litresNeeded) {
            gameState.fuelTank -= litresNeeded;
            car.fuel = 100;
            logToMap(`⛽ ${car.name}: serbatoio pieno dal deposito. (${Math.floor(gameState.fuelTank)}L rimasti)`);
        } else if ((gameState.fuelTank || 0) > 0) {
            const litresAvail = gameState.fuelTank;
            car.fuel = Math.min(100, car.fuel + Math.floor(litresAvail / 0.5));
            gameState.fuelTank = 0;
            // Ferma l'auto solo se il carburante nel veicolo è critico (<5%)
            if (car.fuel < 5) {
                outReason = 'fuel';
                logToMap(`⚠️ ${car.name}: serbatoio quasi vuoto (${Math.floor(car.fuel)}%). Rifornire.`);
                showNotification(`🔴 ${car.name} quasi a secco! Rifornire al distributore.`, 'error');
            }
        } else {
            // Deposito aziendale vuoto — l'auto ferma SOLO se il suo serbatoio non basta
            if (car.fuel < 5) {
                outReason = 'fuel';
                logToMap(`⚠️ ${car.name}: serbatoio esaurito. Rifornire al distributore.`);
                showNotification(`🔴 ${car.name} a secco! Usa il distributore nel pannello Flotta.`, 'error');
            }
        }
    }

    // — Gomme (sostituzione se usura > 80%, cioè tirePressure < 20) —
    if (!outReason && (car.tirePressure || 100) < 20) {
        if ((gameState.depositoGomme || 0) >= 1) {
            gameState.depositoGomme -= 1;
            car.tirePressure = 100;
            logToMap(`🔧 ${car.name}: gomme sostituite automaticamente. (${gameState.depositoGomme} treni rimasti)`);
        } else {
            outReason = 'tires';
            logToMap(`⚠️ ${car.name}: nessun treno di gomme nel deposito. Auto ferma.`);
            showNotification(`🔴 Deposito gomme vuoto! ${car.name} ferma in garage.`, 'error');
        }
    }

    // Gli EV non si riforniscono di gasolio (la ricarica è manuale, pulsante nel
    // pannello Flotta): il loro flag 'battery' esce solo con la ricarica pagata,
    // non da questo rito finale che altrimenti lo cancellerebbe a ogni corsa.
    const _evFermoPerBatteria = _isElectric(car) && !outReason && car.outOfService === 'battery';
    if (!_evFermoPerBatteria) car.outOfService = outReason || null;
}

// Dopo ogni acquisto al deposito, riprova a rifornire le auto ferme
function _retryOutOfServiceVehicles() {
    const stoppedCars = gameState.fleet.filter(c => c.outOfService);
    stoppedCars.forEach(car => refillVehicle(car.id));
    if (stoppedCars.length > 0 && typeof renderTabFleet === 'function') renderTabFleet();
}

// ─── RITORNO ALL'HUB ─────────────────────────────────────────────
// ─── BLACK MARKET FUEL (Gasolio Agricolo) ─────────────────────────
// ─── STANDARD FUEL (distributore pubblico, prezzo pieno) ──────────
// ─── RIPARAZIONE MOTORE ───────────────────────────────────────────
// ─── CAR UPGRADES ────────────────────────────────────────────────
// ─── GREY MARKET MISSIONS ────────────────────────────────────────
function _maybeGreyMarketMission() {
    if (!hasInvestment('inv_grey_market')) return;
    if (Math.random() > 0.18) return;
    // Only one grey market offer at a time
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'grey_market')) return;

    const available = Object.values(POIS).filter(p => gameState.unlockedRegions.includes(p.region));
    if (available.length < 2) return;
    const from = available[Math.floor(Math.random() * available.length)];
    let to = available[Math.floor(Math.random() * available.length)];
    if (from.id === to.id) return;

    const isLong = from.region !== to.region;
    const basePrice = Math.floor(from.baseFlat * 3.0 * (isLong ? 2.8 : 1.2));
    const _gmEmail = {
        id: gameState.nextId++,
        sender: '░░░ ANONIMO ░░░',
        subject: `[RISERVATO] Trasporto discreto: ${from.name} → ${to.name} — €${basePrice}`,
        type: 'grey_market', status: 'unread',
        greyRideData: { fromId: from.id, toId: to.id, price: basePrice, isLong },
        expiresAt: gameState.day * 24 + gameState.hour + 6
    };
    _applyEmailTemplate(_gmEmail, 'grey_market', { city: from.name || 'città', amount: basePrice || 0 });
    gameState.emails.push(_gmEmail);
    const dot = document.getElementById('mail-dot');
    if (dot) dot.classList.remove('hidden');
    logToMap(`🕵️ Proposta anonima: ${from.name} → ${to.name} — €${basePrice} (3×). Alto rischio.`);
}


function processDailyRoutines() {
    const _closingDay = (gameState.day - 1) || 0; // day that just ended (day was already incremented)
    if (typeof window.CE_Contracts !== 'undefined') window.CE_Contracts.dailyTick();
    let income = 0; let expenses = 0;

    gameState.investments.forEach(invId => {
        const item = INVESTMENTS.find(i => i.id === invId);
        if (item && item.passive) income += item.passive;
    });
    // Lifestyle asset passive income
    (gameState.lifestyleAssets || []).forEach(assetId => {
        const asset = (typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : []).find(a => a.id === assetId);
        if (asset && asset.passive) income += asset.passive;
    });

    gameState.staff.forEach(s => expenses += (s.salary / 30));
    gameState.drivers.forEach(d => { if(d.salary) expenses += (d.salary / 30); });

    let hasMechanic = gameState.staff.some(s => s.id === 'mech');

    for (let i = gameState.fleet.length - 1; i >= 0; i--) {
        let car = gameState.fleet[i];
        // Noleggio breve termine: alla scadenza l'auto torna al concessionario.
        // Il costo è stato già pagato per intero al noleggio, quindi qui nessuna spesa.
        if (car.isRental && gameState.day >= car.rentalExpiresDay) {
            logToMap(`🔑 Il noleggio di ${car.name} è scaduto: restituita al concessionario.`);
            let driver = gameState.drivers.find(d => d.assignedCarId === car.id);
            if (driver) driver.assignedCarId = null;
            gameState.fleet.splice(i, 1);
            continue;
        }
        if (car.isLease) {
            expenses += car.dailyCost;
            car.leaseElapsedDays++;
            if (car.leaseElapsedDays >= (car.leaseDuration * 30)) {
                logToMap(`🔴 Il Leasing per ${car.name} è scaduto.`);
                let driver = gameState.drivers.find(d => d.assignedCarId === car.id);
                if (driver) driver.assignedCarId = null;
                gameState.fleet.splice(i, 1);
                continue;
            }
        }
        if (hasMechanic && car.condition < 100) car.condition = Math.min(100, car.condition + 15);
        if (hasInvestment('inv_carwash') && car.condition < 100) car.condition = Math.min(100, car.condition + 5);
    }

    if (hasInvestment('inv_garage_hq')) expenses *= 0.90;

    // Pension fund: after day 60, passive income (must be before tax calc so it's taxed + credited)
    if (hasInvestment('inv_pension_fund') && gameState.day >= 60) {
        const pensionIncome = 1200;
        income += pensionIncome;
        if (gameState.day === 60) logToMap('🏦 Fondo Pensione attivo: +€1.200/g di rendita!');
    }

    // Hotel Exclusive: bonus income (must be before cash settlement so it's actually credited —
    // was previously added to `income` after gameState.cash was already updated, so this €500
    // was a phantom value that still got taxed/counted in profit but never paid out)
    if (hasInvestment('inv_hotel_exclusive')) income += 500;

    let baseTax = gameState.staff.some(s => s.id === 'admin') ? 0.24 : 0.42;
    if ((gameState.activeLobbyLaws || []).includes('law_tax_cut')) baseTax = Math.min(baseTax, 0.28);
    if (hasInvestment('inv_tower')) baseTax *= 0.5;
    let profitTaxes = income > 0 ? (income * baseTax) : 0;
    let luxuryTax = Math.floor(Math.pow(gameState.fleet.length, 1.5) * 50);
    if (hasInvestment('inv_tower')) luxuryTax = Math.floor(luxuryTax * 0.5);
    // Tassa totale realmente dedotta (lusso + reddito) — usata per il display al giocatore;
    // prima si mostrava solo luxuryTax, sottostimando quanto pagato quando profitTaxes>0.
    const totalTax = luxuryTax + profitTaxes;

    expenses += totalTax;

    // === MARKETING SYSTEM ===
    // Migrate old activeCampaign string → activeCampaigns array (backward compat)
    if (gameState.activeCampaign && !(gameState.activeCampaigns || []).length) {
        gameState.activeCampaigns = [{ id: gameState.activeCampaign, startDay: gameState.day, endsDay: gameState.day + 999, cooldownUntil: 0 }];
        gameState.activeCampaign = null;
    }
    if (!gameState.activeCampaigns) gameState.activeCampaigns = [];
    if (!gameState.campaignROI) gameState.campaignROI = {};
    if (typeof gameState.brandVolume !== 'number') gameState.brandVolume = 0;
    if (typeof gameState.brandPrestige !== 'number') gameState.brandPrestige = 0;

    // Deduct daily cost + apply brand gains + expire finished campaigns
    let hasVolumeCampaign = false, hasPrestigeCampaign = false;
    gameState.activeCampaigns = gameState.activeCampaigns.filter(ac => {
        if (gameState.day > ac.endsDay) return false; // expired
        const camp = MARKETING_CAMPAIGNS.find(c => c.id === ac.id);
        if (!camp) return false;
        expenses += camp.dailyCost;
        gameState.brandVolume   = Math.min(100, gameState.brandVolume   + (camp.volumeGain   || 0));
        gameState.brandPrestige = Math.min(100, gameState.brandPrestige + (camp.prestigeGain || 0));
        if (camp.axis === 'volume' || camp.axis === 'both') hasVolumeCampaign = true;
        if (camp.axis === 'prestige' || camp.axis === 'both') hasPrestigeCampaign = true;
        return true;
    });

    // Brand decay
    if (!hasVolumeCampaign)   gameState.brandVolume   = Math.max(0, gameState.brandVolume   - 3);
    if (!hasPrestigeCampaign) gameState.brandPrestige = Math.max(0, gameState.brandPrestige - 2);

    // Unlock Diamond every 3 days if Prestige = 100
    if (gameState.brandPrestige >= 100 && gameState.day % 3 === 0) {
        if (typeof _generateDiamondContract === 'function') _generateDiamondContract();
    }

    // Portfolio tracking for Finance tab daily P&L
    const _holdings = gameState.stockHoldings || {};
    const _prices   = gameState.stockPrices   || {};
    const _stockVal = (typeof STOCK_TICKERS !== 'undefined' ? STOCK_TICKERS : [])
        .reduce((s, t) => s + ((_holdings[t.id] || {}).shares || 0) * (_prices[t.id] || t.basePrice), 0);
    const _brokerVal = (gameState.brokerInvestments || []).filter(b => b.active !== false)
        .reduce((s, b) => s + (b.capital || 0), 0);
    gameState.portfolioValueYesterday = _stockVal + _brokerVal;
    // Snapshot prev prices for flash animation
    gameState.stockPrevPrices = Object.assign({}, _prices);

    window.CE_money.earn(income - expenses, 'daily_net_profit');

    // Bankruptcy risk: track consecutive days in red
    if (gameState.cash < 0) {
        gameState.consecutiveRedDays = (gameState.consecutiveRedDays || 0) + 1;
        showNotification(`⚠️ Cassa negativa! Giorno ${gameState.consecutiveRedDays}/3 prima del pignoramento.`, 'error');
        logToMap(`🔴 Cassa negativa: €${(window._soldiLeggibili || (v => Math.floor(v || 0).toLocaleString('it-IT')))(gameState.cash)} (${gameState.consecutiveRedDays}/3 giorni)`);
        if (gameState.consecutiveRedDays >= 3) _triggerBankruptcy();
    } else {
        gameState.consecutiveRedDays = 0;
    }

    // Police heat daily decay
    _tickPoliceHeat();

    // HQ level auto-sync with investments
    if (hasInvestment('inv_tower'))     { gameState.hqLevel = 3; if (gameState.hq) gameState.hq.level = 3; }
    else if (hasInvestment('inv_hq_campus')) { gameState.hqLevel = 3; if (gameState.hq) gameState.hq.level = 3; }
    else if (hasInvestment('inv_hq_office')) { gameState.hqLevel = 2; if (gameState.hq) gameState.hq.level = 2; }
    else { // Senza investimenti avanzati, preserva livello base (1 = azienda fondata)
        const base = Math.min(1, gameState.hqLevel || 0);
        gameState.hqLevel = base; if (gameState.hq) gameState.hq.level = base;
    }
    MapBackend.updateHQMarker();

    // Watchdog: libera driver bloccati in 'busy' senza corsa attiva
    (gameState.drivers || []).forEach(d => {
        if (d.status !== 'busy') return;
        const hasLocal  = (gameState.activeRides || []).some(r => r.driverId === d.id);
        const hasServer = (gameState.activeTrips || []).some(t => t.driverId === d.id);
        if (!hasLocal && !hasServer) {
            d.status = 'idle';
            logToMap(`⚠ ${d.name} sbloccato automaticamente (nessuna corsa attiva trovata).`);
        }
    });

    // Corporate retainer rides
    if (hasInvestment('inv_corporate_retainer')) {
        for (let i = 0; i < 3; i++) generatePOIRide('business');
    }

    if ((gameState.activeLobbyLaws || []).includes('law_airport_monopoly')) for (let i = 0; i < 3; i++) generatePOIRide('vip');
    if (hasInvestment('inv_hotel_partner')) for (let i = 0; i < 3; i++) generatePOIRide('vip');
    if (hasInvestment('inv_hotel_exclusive')) for (let i = 0; i < 5; i++) generatePOIRide('vip');
    if (hasInvestment('inv_armored') && Math.random() > 0.5) {
        const ar = generatePOIRide('vip');
        if (ar) { ar.price *= 3; logToMap('🛡️ Cliente blindato: tariffa triplicata!'); }
    }
    if (gameState.cannesBoostDays > 0) {
        gameState.cannesBoostDays--;
        if (gameState.cannesBoostDays === 0) logToMap('🎬 Boost Festival di Cannes terminato.');
    }

    _tickRivalsDaily();
    _tickPricewars();

    // Scadenza multe: auto-pagamento se non gestite
    if (gameState.activeFines) {
        const gameHour = gameState.day * 24 + gameState.hour;
        gameState.activeFines.forEach(f => {
            if (f.status === 'pending' && f.expiresAt && gameHour >= f.expiresAt) {
                // Auto-pay expired fine + 30% penalty
                const penalty = Math.floor(f.amount * 1.30);
                window.CE_money.earn(-penalty, 'fine_expired');
                f.status = 'expired_paid';
                logToMap(`⚠️ Multa scaduta auto-pagata: −€${penalty}`);
                if(typeof showNotification==='function') showNotification(`Multa scaduta! −€${penalty}`, 'error');
            }
        });
        // Keep all pending/contested_reduced, keep last 10 resolved for archive
        const _pendingFines  = gameState.activeFines.filter(f => f.status === 'pending' || f.status === 'contested_reduced');
        const _resolvedFines = gameState.activeFines.filter(f => f.status !== 'pending' && f.status !== 'contested_reduced').slice(-10);
        gameState.activeFines = [..._pendingFines, ..._resolvedFines];
        const fineDot = document.getElementById('fine-dot');
        const hasPending = (gameState.activeFines || []).some(f => f.status === 'pending');
        if (fineDot) fineDot.classList.toggle('hidden', !hasPending);
    }

    // Sabotaggio rivali (ogni 7 giorni se investimento attivo)
    if (hasInvestment('inv_sabotaggio') && gameState.day % 7 === 0) {
        RIVALS.forEach(r => { r.rep = Math.max(0.1, r.rep * 0.90); });
        logToMap('🕵️ Campagna PR: reputazione rivali ridotta del 10%!');
    }

    // Ranking: se ultimo in classifica, rivale ruba autista top
    const rank = _getRankPosition();
    const totalPlayers = RIVALS.length + 1;
    if (rank >= totalPlayers && gameState.day % 3 === 0) {
        const stealable = gameState.drivers.filter(d => d.id !== 'ceo' && (d.salary || 0) >= 3000 && d.status !== 'busy');
        if (stealable.length > 0 && Math.random() < 0.30) {
            const stolen = stealable[Math.floor(Math.random() * stealable.length)];
            const rival  = RIVALS[Math.floor(Math.random() * RIVALS.length)];
            gameState.drivers.splice(gameState.drivers.indexOf(stolen), 1);
            logToMap(`💼 ${rival.name} ha rubato ${stolen.name} con una proposta irrinunciabile!`);
            showBigEvent('💼', 'Autista Perso!', `${rival.name} ha offerto a ${stolen.name} uno stipendio più alto. Senza un buon Ranking, non puoi competere per i migliori talenti. Risali la classifica!`);
        }
    }

    // Ranking Top 3: notifica bonus attivi
    if (rank <= 3 && !gameState._top3NotifiedDay) {
        gameState._top3NotifiedDay = gameState.day;
        // I "premi assicurativi −15%" non sono mai esistiti: non c'è alcun sistema di
        // premi assicurativi nel gioco. L'effetto reale del Top 3 è engine-rides.js:456,
        // che riduce del 15% la PROBABILITÀ DI INCIDENTE.
        showBigEvent('🏆', 'Top 3 del Ranking!', 'Stai dominando il mercato! Bonus attivi: rischio incidenti −15% e POI esclusivi Ultra-Luxury sbloccati (Porto Cervo, Armani Hotel, Borgo Egnazia, Belmond Splendido).');
    }
    if (rank > 3) gameState._top3NotifiedDay = null;

    // Cantieri: tick giornaliero
    _tickCantieri();
    _maybeGenerateCantieri();

    // Investment constructions: tick time-gated builds
    if (gameState.constructions && gameState.constructions.length > 0) {
        const completed = [];
        gameState.constructions = gameState.constructions.filter(c => {
            if (gameState.day >= c.completesDay) {
                completed.push(c);
                return false;
            }
            return true;
        });
        completed.forEach(c => {
            if (!gameState.investments.includes(c.invId)) gameState.investments.push(c.invId);
            if (c.invId === 'inv_ev_hub') gameState.hasEVHub = true;
            const inv = (typeof INVESTMENTS !== 'undefined' ? INVESTMENTS : []).find(i => i.id === c.invId);
            const name = inv ? inv.name : c.invId;
            logToMap(`🏗️ Costruzione completata: ${name} è ora operativo!`);
            showBigEvent('🏗️', 'Costruzione Completata!', `${name} è ora attivo e genera reddito passivo.`);
            if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
        });
    }

    // Daily upkeep for investments
    if (gameState.investments && gameState.investments.length > 0) {
        let upkeepTotal = 0;
        gameState.investments.forEach(invId => {
            const inv = (typeof INVESTMENTS !== 'undefined' ? INVESTMENTS : []).find(i => i.id === invId);
            if (inv && inv.dailyUpkeep) upkeepTotal += inv.dailyUpkeep;
        });
        if (upkeepTotal > 0) {
            window.CE_money.earn(-upkeepTotal, 'investment_upkeep');
            if (gameState.day % 7 === 0) logToMap(`🔧 Manutenzione investimenti: −€${upkeepTotal.toLocaleString()}/g`);
        }
    }

    // Quest check at day rollover
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();

    // Seized cars: release after 7 days
    if (gameState.seizedCars && gameState.seizedCars.length > 0) {
        gameState.seizedCars = gameState.seizedCars.filter(sc => {
            if (gameState.day >= sc.releaseDay) {
                // Re-add car to fleet with damaged condition
                const found = gameState.fleet.find(c => c.id === sc.carId);
                if (!found) {
                    gameState.fleet.push({ id: sc.carId, name: sc.carName + ' (Recuperata)', tier: 'business', condition: 40, isLease: false, fuel: 50, mileage: 0, tirePressure: 80, upgrades: [] });
                }
                logToMap(`🔓 ${sc.carName} rilasciata dal sequestro (condizioni al 40%).`);
                showBigEvent('🔓', 'Auto Rilasciata!', `${sc.carName} è stata restituita dalla polizia dopo il sequestro. Condizione: 40%. Falla riparare prima di rimetterla in servizio.`);
                return false;
            }
            return true;
        });
    }

    // Loyalty bonuses: check drivers for 30/60/90-day milestones
    gameState.drivers.forEach(d => {
        if (d.id === 'ceo') return;
        if (d.hiredDay === undefined) d.hiredDay = 1;
        const tenure = gameState.day - d.hiredDay;
        if (tenure > 0 && tenure % 30 === 0 && tenure <= 90) {
            const bonusAmt = tenure === 30 ? 500 : tenure === 60 ? 1000 : 2000;
            const repBonus = tenure === 90 ? 0.1 : 0;
            window.CE_money.earn(bonusAmt, 'driver_loyalty_bonus');
            if (repBonus > 0) window.CE_money.addReputation(repBonus);
            d.morale = Math.min(100, (d.morale || 100) + 15);
            logToMap(`🎖️ ${d.name}: ${tenure} giorni di servizio! Bonus fedeltà +€${bonusAmt}${repBonus > 0 ? ' +0.1★' : ''}`);
            showBigEvent('🎖️', `${d.name}: ${tenure} Giorni!`, `Fedeltà premiata con un bonus di €${bonusAmt}. Morale autista +15.`);
        }
    });

    // ── NARRATIVA INBOX CEO (messaggi degli autisti) ──────────────
    gameState.drivers.forEach(d => {
        if (d.id === 'ceo') return;
        const trait = d.trait || {};
        const fatigue = d.fatigue || 0;
        const gameHour = gameState.day * 24 + gameState.hour;
        const expiresAt = gameHour + 48;

        // Autista esausto (< 30% energia rimasta = fatigue > 70)
        if (fatigue > 70 && !d._warnedExhausted) {
            d._warnedExhausted = true;
            const _driverEmail = {
                id: gameState.nextId++, sender: d.name,
                subject: `[${d.name}] Capo, sono distrutto`,
                body: `Capo, sono completamente a pezzi. Se non mi fai riposare giuro che mi licenzio. La macchina è la mia vita, ma così non reggo.`,
                type: 'driver_msg', status: 'unread', driverId: d.id, expiresAt
            };
            _applyEmailTemplate(_driverEmail, 'driver_msg', { driverName: d.name });
            gameState.emails.push(_driverEmail);
            const dot = document.getElementById('mail-dot'); if (dot) dot.classList.remove('hidden');
        }
        if (fatigue <= 50) d._warnedExhausted = false; // reset when recovered

        // Autista in sciopero (fatigue 100%): blocca assegnazioni per 24h
        if (fatigue >= 100 && !d._onStrike) {
            d._onStrike = true;
            d._strikeEndsDay = gameState.day + 1;
            d.status = 'resting';
            d.restHoursLeft = 24;
            const _strikeEmail = {
                id: gameState.nextId++, sender: d.name,
                subject: `[SCIOPERO] ${d.name} si ferma`,
                body: `Non ce la faccio più. Mi fermo per 24 ore. Niente corse, niente discussioni. Quando sarò riposato torno al lavoro.`,
                type: 'driver_msg', status: 'unread', driverId: d.id, expiresAt
            };
            _applyEmailTemplate(_strikeEmail, 'driver_msg', { driverName: d.name });
            gameState.emails.push(_strikeEmail);
            showBigEvent('🪧', `${d.name} in Sciopero!`, `Il driver è esausto al 100%. Si ferma per 24h. Monitora l'energia degli autisti per evitarlo.`);
            const dot = document.getElementById('mail-dot'); if (dot) dot.classList.remove('hidden');
        }
        if (d._onStrike && gameState.day >= (d._strikeEndsDay || 0)) {
            d._onStrike = false;
        }
    });

    // Venture Capital: daily income from stakes
    if (gameState.ventureCapital && gameState.ventureCapital.length > 0) {
        let vcIncome = 0;
        gameState.ventureCapital.forEach(stake => {
            const agency = (typeof VENTURE_AGENCIES !== 'undefined' ? VENTURE_AGENCIES : []).find(a => a.id === stake.agencyId);
            if (!agency) return;
            const daily = Math.floor(agency.dailyIncome * (stake.stakePercent / 100));
            vcIncome += daily;
        });
        if (vcIncome > 0) {
            window.CE_money.earn(vcIncome, 'venture_capital_dividend');
            gameState.annualProfitTracker = (gameState.annualProfitTracker || 0) + vcIncome;
            if (gameState.day % 30 === 0) logToMap(`💼 Venture Capital: +€${vcIncome.toLocaleString()}/g da ${gameState.ventureCapital.length} partecipazioni.`);
        }
    }

    // Meet & Greet passive income from Airport Assistants (zero fuel consumption)
    const _mgAssistants = (gameState.staff || []).filter(s => s.skill === 'meetgreet');
    if (_mgAssistants.length > 0 && typeof MEET_GREET_RATES !== 'undefined' && MEET_GREET_RATES.length > 0) {
        let mgIncome = 0;
        _mgAssistants.forEach(asst => {
            const airport = asst.airport || 'FCO';
            const rates   = MEET_GREET_RATES.filter(r => r.airport === airport);
            if (!rates.length) return;
            const jobCount = 3 + Math.floor(Math.random() * 4); // 3–6 daily jobs
            for (let i = 0; i < jobCount; i++) {
                mgIncome += Math.floor(rates[Math.floor(Math.random() * rates.length)].sellingPrice);
            }
        });
        if (mgIncome > 0) {
            window.CE_money.earn(mgIncome, 'meet_greet_income');
            gameState.annualProfitTracker = (gameState.annualProfitTracker || 0) + mgIncome;
            gameState._lastMgIncome = mgIncome;
            if (gameState.day % 7 === 0) logToMap(`🤝 Meet & Greet: +€${mgIncome.toLocaleString()} da assistenti aeroportuali (carburante: 0).`);
        }
    }

    // Annual profit tracker: accumulate net profit daily
    const dailyNetProfit = income - expenses;
    if (dailyNetProfit > 0) {
        gameState.annualProfitTracker = (gameState.annualProfitTracker || 0) + dailyNetProfit;
    }

    // Annual tax cycle (ogni 365 giorni)
    if (gameState.day > 0 && gameState.day % 365 === 0) {
        const hasAdmin = gameState.staff.some(s => s.id === 'admin');
        const taxRate  = hasAdmin ? 0.24 : 0.25;
        const taxable  = gameState.annualProfitTracker || 0;
        const taxDue   = Math.max(0, Math.floor(taxable * taxRate));
        if (taxDue > 0) {
            window.CE_money.earn(-taxDue, 'annual_tax');
            logToMap(`📋 Dichiarazione fiscale annuale: profitti €${taxable.toLocaleString()} × ${(taxRate*100).toFixed(0)}% = −€${taxDue.toLocaleString()}`);
            showBigEvent('📋', 'Dichiarazione Fiscale Annuale', `Profitti annui: €${taxable.toLocaleString()}\nAliquota: ${(taxRate*100).toFixed(0)}%\nImposta versata: −€${taxDue.toLocaleString()}\n${hasAdmin ? '(Riduzione al 24% grazie all\'Amministratore)' : 'Assumi un Amministratore per ridurre al 24%.'}`);
        }
        gameState.annualProfitTracker = 0;
    }

    // Filantropia: +0.5 rep settimanale
    if (hasInvestment('inv_philanthropy') && gameState.day % 7 === 0) {
        window.CE_money.addReputation(0.5);
        logToMap('💝 Fondazione: +0.5★ Reputazione settimanale.');
    }

    // Rimborso prestiti mensili
    if (gameState.loans && gameState.loans.length > 0 && gameState.day % 30 === 0) {
        let totalRepayment = 0;
        gameState.loans = gameState.loans.filter(loan => {
            const rate = loan.rate || 0.08;
            const monthlyPayment = Math.ceil(loan.amount * rate);
            totalRepayment += monthlyPayment;
            loan.remaining -= monthlyPayment;
            loan.amount = Math.max(0, loan.amount - monthlyPayment);
            if (loan.amount <= 0) {
                logToMap(`✅ Prestito di €${loan.original} estinto!`);
                return false;
            }
            return true;
        });
        if (totalRepayment > 0) {
            window.CE_money.earn(-totalRepayment, 'loan_repayment');
            logToMap(`🏦 Rata prestito mensile: −€${totalRepayment}`);
            if (typeof showNotification === 'function') showNotification(`🏦 Rata prestito: −€${totalRepayment}`, 'error');
        }
    }

    // Evento sciopero casuale (ogni ~15 giorni, 20% chance)
    if (gameState.day % 15 === 0 && Math.random() < 0.20) {
        const strikeDuration = 2 + Math.floor(Math.random() * 3);
        gameState.emails.push({
            id: gameState.nextId++, sender: 'Sindacato Autisti',
            subject: `⚠️ SCIOPERO: Picco di Domanda per ${strikeDuration} giorni`,
            type: 'b2b', offer: 0, status: 'unread',
            expiresAt: gameState.day * 24 + gameState.hour + 48
        });
        for (let i = 0; i < 5; i++) generatePOIRide('business');
        logToMap(`🚌 SCIOPERO MEZZI: domanda NCC in impennata!`);
        showBigEvent('🚌', 'Sciopero Mezzi Pubblici!', `I trasporti pubblici sono fermi per ${strikeDuration} giorni. La domanda di NCC è esplosa. Approfitta del surge pricing!`);
    }

    // Classic Vacations weekly quota (ogni 7 giorni)
    if (gameState.day % 7 === 0) {
        const completed = gameState.cvWeeklyCompleted || 0;
        const target    = gameState.cvWeeklyTarget    || 8;
        if (completed >= target) {
            gameState.cvWeeklyStreak = (gameState.cvWeeklyStreak || 0) + 1;
            const streak = gameState.cvWeeklyStreak;
            const bonus  = streak >= 3 ? 10000 : streak === 2 ? 5000 : 2000;
            const repGain = streak >= 3 ? 0.2 : 0.1;
            window.CE_money.earn(bonus, 'classic_vacations_quota_bonus');
            window.CE_money.addReputation(repGain);
            logToMap(`🤝 Classic Vacations: quota settim. raggiunta (${completed}/${target})! Streak ${streak}× → +€${bonus.toLocaleString()} +${repGain}★`);
            showBigEvent('🤝', 'Quota CV Completata!', `${completed} tratte su ${target} consegnate.\nBonus: +€${bonus.toLocaleString()} · +${repGain}★ rep\nStreak: ${streak} settimane consecutive.`);
        } else if (completed > 0) {
            gameState.cvWeeklyStreak = 0;
            logToMap(`⚠️ Classic Vacations: quota non raggiunta (${completed}/${target}). Streak azzerata.`);
            showNotification(`⚠️ Quota CV mancata: ${completed}/${target}. Streak persa.`, 'error');
        }
        gameState.cvWeeklyCompleted = 0; // reset for next week
    }

    // Achievement check giornaliero
    _checkAchievements();

    _tickMacroEconomy();

    // ── MAINTENANCE CONTRACT: scadenza ─────────────────────────────────────
    if (gameState.maintenanceContract && gameState.day > gameState.maintenanceContractPaidUntilDay) {
        gameState.maintenanceContract = false;
        showNotification('📋 Contratto di Manutenzione scaduto. Rinnova in Flotta.', 'error');
        logToMap('📋 Contratto di manutenzione scaduto.');
    }

    // ── EXECUTIVE PASS: scadenza ───────────────────────────────────────────
    if (gameState.executivePassActive && gameState.day > gameState.executivePassExpiresDay) {
        gameState.executivePassActive = false;
        showNotification('💎 Executive Pass scaduto.', 'error');
    }

    // ── HUB TAX: incasso giornaliero nel conto principale ──────────────────
    if ((gameState.hubTaxBalance || 0) > 0) {
        const dailyHubIncome = Math.floor(gameState.hubTaxBalance);
        window.CE_money.earn(dailyHubIncome, 'hub_tax_income');
        logToMap(`🏛️ Entrate Hub: +€${dailyHubIncome.toLocaleString()} (tasse concessioni)`);
        gameState.hubTaxBalance = 0;
    }

    // ── CEO DELLA SETTIMANA: reset domenicale (ogni 7 giorni) ─────────────
    const _weekday = ((gameState.day - 1) % 7) + 1;
    if (_weekday === 7 && gameState.day > (gameState.weekStartDay || 0) + 3) {
        const weekWinner = gameState.weeklyEarnings || 0;
        const weekRides  = gameState.weeklyRides    || 0;
        if (weekWinner > 0) {
            const prizeTC = Math.min(50, Math.floor(weekWinner / 10000));
            window.CE_money.earnDC(prizeTC, 'weekly_prize');

            // Premio auto Limited Edition se settimanale > €100.000
            if (weekWinner >= 100000 && !(gameState.fleet || []).some(c => c.id === 'ceo_prestige')) {
                const limitedCar = {
                    id: 'ceo_prestige', name: 'Majestic G-Prestige CEO Edition', tier: 'ultra',
                    vehicleClass: 'majestic_spirit', condition: 100, isLease: false,
                    isLimitedEdition: true, fuel: 100, mileage: 0,
                    tirePressure: 100, engineHealth: 100, upgrades: [],
                    skin: 'gold_chrome',
                };
                gameState.fleet.push(limitedCar);
                showBigEvent('🏆', 'CEO della Settimana — Black Card!', `Settimana da €${weekWinner.toLocaleString()}. Hai vinto la Majestic G-Prestige CEO Edition (Limited — non vendibile) + ${prizeTC} DC!`);
            } else {
                showBigEvent('🏆', 'CEO della Settimana!', `Hai guadagnato €${weekWinner.toLocaleString()} in ${weekRides} corse questa settimana. Premio: +${prizeTC} Driver Coins!`);
            }
            logToMap(`🏆 CEO della Settimana — Guadagni: €${weekWinner.toLocaleString()} | Corse: ${weekRides} | Bonus: +${prizeTC} DC`);
            // CEMP stock boost: buona settimana = spike del prezzo azionario
            gameState.cempPrice = Math.min(9999, (gameState.cempPrice || 10) * 1.15);
        }

        /* PREMIO DEL PODIO — lo status deve pagare qualcosa.
           La classifica globale non aveva NESSUNA ricompensa agganciata: era una
           vetrina da guardare, cioe' una ricompensa «Tribe» lasciata a meta'.
           Sta qui dentro apposta, sullo stesso orologio settimanale: un secondo
           timer sarebbe stato solo un'altra cosa da tenere allineata a mano.
           Modesto per scelta (15/10/5 DC contro i 50 del CEO della Settimana):
           deve dire «sei visto», non decidere la partita. */
        if (typeof _getRankPosition === 'function') {
            const _pos = _getRankPosition();
            const _premioPodio = { 1: 15, 2: 10, 3: 5 }[_pos] || 0;
            if (_premioPodio > 0) {
                window.CE_money.earnDC(_premioPodio, 'weekly_podium');
                gameState.podiumBadge = { pos: _pos, day: gameState.day };
                gameState.podiumWeeks = (gameState.podiumWeeks || 0) + 1;
                const _medaglia = { 1: '🥇', 2: '🥈', 3: '🥉' }[_pos];
                showBigEvent(_medaglia, `${_pos}° posto in classifica`,
                    `Hai chiuso la settimana sul podio. Premio: +${_premioPodio} Driver Coins. ` +
                    `Podi totali: ${gameState.podiumWeeks}.`);
                logToMap(`${_medaglia} Podio settimanale: ${_pos}° posto — +${_premioPodio} DC`);
            }
        }
        gameState.weeklyEarnings = 0;
        gameState.weeklyRides    = 0;
        gameState.weekStartDay   = gameState.day;
    }

    // ── DRIVER ACADEMY: corsi completati ──────────────────────────────────
    if ((gameState.driverAcademy || []).length > 0) {
        const curHour = gameState.day * 24 + gameState.hour;
        gameState.driverAcademy = (gameState.driverAcademy || []).filter(course => {
            if (curHour >= course.completesHour) {
                const driver = gameState.drivers.find(d => d.id === course.driverId);
                if (driver) {
                    driver[course.skill] = Math.min(100, (driver[course.skill] || 50) + (course.skillGain || 10));
                    logToMap(`🎓 ${driver.name} ha completato "${course.courseName}": ${course.skill.replace('skill_','')} +${course.skillGain}`);
                    showNotification(`🎓 ${driver.name} — corso completato! +${course.skillGain} ${course.skill.replace('skill_','')}`, 'success');
                }
                return false;
            }
            return true;
        });
    }

    // ── NPC MARKET REFRESH (ogni 3 giorni) ────────────────────────────────
    if (gameState.day - (gameState.lastNpcMarketRefreshDay || 0) >= 3) {
        _refreshNpcMarket();
        gameState.lastNpcMarketRefreshDay = gameState.day;
    }
    _maybeStartAuction();

    // ── TALENT SCOUT: legendary check giornaliero ─────────────────────────
    // (il refresh ogni 3 ore avviene nel gameLoop hourly tick)
    if (gameState.staff.some(s => s.id === 'talent_scout') && Math.random() < 0.05) {
        _generateLegendaryRecruit();
    }

    // ── AUCTION: scadenza e NPC rilancio ──────────────────────────────────
    if (gameState.activeAuction) {
        const curH = gameState.day * 24 + gameState.hour;
        if (curH >= gameState.activeAuction.endsHour) {
            _resolveAuction();
        } else if (Math.random() < 0.4) {
            // NPC rilancio casuale
            const npcBid = gameState.activeAuction.currentBid + Math.floor(Math.random() * 5000 + 2000);
            if (!gameState.activeAuction.playerBid || npcBid > gameState.activeAuction.playerBid) {
                gameState.activeAuction.currentBid = npcBid;
            }
        }
    }

    // ── MARKETPLACE: NPC compra dopo 2 giorni ─────────────────────────────
    if ((gameState.marketplace || []).length > 0) {
        gameState.marketplace = gameState.marketplace.filter(listing => {
            if (gameState.day >= listing.listedDay + 2 && Math.random() < 0.6) {
                const car = gameState.fleet.find(c => c.id === listing.carId);
                if (car) {
                    const salePrice = Math.round(listing.askPrice * 0.95); // 5% fee
                    window.CE_money.earn(salePrice, 'marketplace_npc_sale');
                    gameState.fleet.splice(gameState.fleet.indexOf(car), 1);
                    const driver = gameState.drivers.find(d => d.assignedCarId === car.id);
                    if (driver) driver.assignedCarId = null;
                    logToMap(`💰 Mercato: ${car.name} venduta per €${salePrice.toLocaleString()} (5% fee)`);
                    showNotification(`✅ ${car.name} venduta! +€${salePrice.toLocaleString()}`, 'success');
                    if (typeof renderTabFleet === 'function') renderTabFleet();
                }
                return false;
            }
            return true;
        });
    }

    // ── HOLDING: pagamento dividendi subsidiarie ───────────────────
    const subs = (gameState.holding?.subsidiaries || []);
    if (subs.length > 0) {
        // Guardia: paga una sola volta per giorno di gioco
        if (gameState.holding.lastDividendDay === gameState.day) {
            logToMap(`🏢 Holding: dividendi già pagati oggi (giorno ${gameState.day})`);
        } else {
            const subIncome = subs.reduce((sum, sid) => {
                const tmpl = (typeof HOLDING_SUBSIDIARIES !== 'undefined' ? HOLDING_SUBSIDIARIES : window.HOLDING_SUBSIDIARIES || []).find(s => s.id === sid);
                return sum + (tmpl ? tmpl.dailyIncome : 0);
            }, 0);
            if (subIncome > 0) {
                window.CE_money.earn(subIncome, 'subsidiary_dividend');
                logToMap(`🏢 Holding: dividendi subsidiarie +€${subIncome.toLocaleString()}/g`);
                gameState.holding.lastDividendDay = gameState.day;
            }
        }
    }

    // ── $CEMP: aggiornamento prezzo azionario ──────────────────────
    {
        const repF   = 1 + (gameState.reputation || 0) / 10;
        const earnF  = 1 + Math.min(5, (gameState.weeklyEarnings || 0) / 50000);
        const fleetF = 1 + (gameState.fleet || []).length * 0.04;
        const target = Math.max(1, 10.0 * repF * earnF * fleetF);
        const cur    = gameState.cempPrice || 10.0;
        const drift  = (target - cur) * 0.25;
        const vol    = (Math.random() - 0.45) * 1.5;
        gameState.cempPrice = Math.max(0.50, +((cur + drift + vol).toFixed(2)));
        if (!gameState.cempHistory) gameState.cempHistory = [];
        gameState.cempHistory.push(gameState.cempPrice);
        if (gameState.cempHistory.length > 30) gameState.cempHistory.shift();
    }

    // ── COMPANY IPO: dividendi giornalieri agli azionisti NPC ─────
    if (gameState.companyIPO?.listed) {
        const dailyProfit = Math.max(0, income - Math.floor(expenses));
        const dividendPool = Math.floor(dailyProfit * 0.10);
        if (dividendPool > 0 && gameState.companyIPO.npcSharesOwned > 0) {
            const totalShares = gameState.companyIPO.sharesTotal || 1000;
            const npcPct = gameState.companyIPO.npcSharesOwned / totalShares;
            const npcDividend = Math.floor(dividendPool * npcPct);
            window.CE_money.earn(-npcDividend, 'ipo_npc_dividend');
            gameState.companyIPO.dividendsPaid = (gameState.companyIPO.dividendsPaid || 0) + npcDividend;
            logToMap(`📈 IPO Dividendo: €${npcDividend.toLocaleString()} pagato agli azionisti NPC (10% utili giornalieri)`);
        }
    }

    logToMap(`📊 Chiusura Giornaliera: Entrate +€${income} | Uscite -€${Math.floor(expenses)} (Inc. Tasse: €${Math.floor(totalTax)})`);

    // ── DAILY SUMMARY TOAST ───────────────────────────────────────────────────
    {
        const _net = income - Math.floor(expenses);
        const _today = gameState.todayEarnings || 0;
        const _sumType = _net >= 0 ? 'success' : 'error';
        const _todayStr = _today > 0 ? ` · Corse: €${_today.toLocaleString()}` : '';
        if (typeof showNotification === 'function') showNotification(
            `Giorno ${_closingDay} — ${_net >= 0 ? '+' : ''}€${_net.toLocaleString()} · Tasse €${Math.floor(totalTax).toLocaleString()}${_todayStr}`,
            _sumType);
        // Store daily summary for dispatch center overlay
        gameState._dailySummary = {
            day: _closingDay,
            income: Math.round(income),
            expenses: Math.round(expenses),
            net: Math.round(_net),
            todayEarnings: _today,
            totalTax: Math.round(totalTax),
            cash: gameState.cash,
            reputation: gameState.reputation,
        };
        gameState.yesterdayEarnings = _today; // save before reset
        gameState.todayEarnings = 0; // reset for the new day
    }

    // Push final authoritative cash to server — the riga 424 sync only captured
    // income/expenses at that point; everything after it (multe scadute, upkeep
    // investimenti, bonus fedeltà, VC/Meet&Greet income, tasse annuali, rata
    // prestiti, bonus CV, hub tax, vendita marketplace, dividendi holding/IPO)
    // mutates gameState.cash directly and was never mirrored — companies.cash
    // stayed stale and wiped all of it on the next login (auth.js Phase 5).
    if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});

    // GdF inspection — fire-and-forget, async (requires user logged in)
    if (typeof window._sindacatoGdfDailyCheck === 'function') window._sindacatoGdfDailyCheck();
    // B2B corporate contract daily payout
    if (typeof window._b2bDailyTick === 'function') window._b2bDailyTick();
    // Tourism B2B tender daily payout
    if (typeof window._tourismDailyTick === 'function') window._tourismDailyTick();
    // HQ daily effects (auto-repair, morale, EV recharge)
    if (typeof window._hqDailyTick === 'function') window._hqDailyTick();
}


// ─── EVENTI E EMAIL ───

/* I PREZZI DEGLI EVENTI CEO NON SONO PIU' FISSI.
   Vlad, 29/08: «I prezzi sono sempre fissi, messi cosi' non mi spingono a
   pagare. Non e' molto divertente.» Aveva ragione: la quota stava scritta a
   mano dentro l'etichetta del bottone (`Partner Ufficiale (€20.000)`) e ogni
   invito dello stesso mese arrivava identico al precedente.

   Ora la quota oscilla del ±30% attorno al listino e l'etichetta si ricostruisce
   dal numero vero, cosi' bottone e addebito non possono divergere. Il beneficio
   in reputazione NON si muove: e' quello che rende la variazione una decisione
   invece che un ritocco: lo stesso Festival di Venezia a €14.000 e' un affare da
   prendere al volo, a €26.000 si puo' lasciar perdere.

   Le scelte a costo zero o negative (`Rifiuta`, `Servizio Pagato (+€5.000)`)
   mantengono la loro etichetta: sono scelte di natura diversa, non una quota. */
var VARIAZIONE_QUOTA_EVENTO = 0.30;

function _quotaVariata(costo) {
    const fattore = 1 + (Math.random() * 2 - 1) * VARIAZIONE_QUOTA_EVENTO;
    return Math.max(500, Math.round(costo * fattore / 500) * 500);
}

function _eventoConPrezzoDelGiorno(evento) {
    if (!evento || !Array.isArray(evento.choices)) return evento;
    const choices = evento.choices.map(scelta => {
        if (!(scelta.cost > 0)) return { ...scelta };
        const costo = _quotaVariata(scelta.cost);
        // L'etichetta perde solo la parentesi finale con la cifra vecchia.
        const titolo = String(scelta.text).replace(/\s*\([^()]*\)\s*$/, '');
        return { ...scelta, cost: costo, text: `${titolo} (€${costo.toLocaleString('it-IT')})` };
    });
    /* Si copia solo cio' che serve a valle — la scheda Inbox legge `desc` e
       `choices`, negotiateEmail legge `choices`. La lettera (`da`, `testo`) e i
       requisiti restano fuori: l'email finisce nel salvataggio, e portarsi
       dietro il testo del modello con i suoi {{segnaposti}} vuol dire salvare
       per sempre una cosa che e' gia' stata scritta in `body`. */
    return { id: evento.id, name: evento.name, desc: evento.desc, choices };
}

/* Chi vede questo evento. Un giocatore con due auto non deve ricevere la
   richiesta dell'ambasciata: non e' che la rifiuterebbe, e' che non ha senso
   che gliela facciano. Tutti i campi sono opzionali; senza `requires` l'evento
   e' per chiunque. */
function _requisitiEventoOk(ev) {
    const r = ev && ev.requires;
    if (!r) return true;
    const gs = gameState || {};
    const corse = (gs.questStats && gs.questStats.totalRides) || 0;
    if (r.rides   != null && corse < r.rides) return false;
    if (r.rep     != null && (gs.reputation || 0) < r.rep) return false;
    if (r.fleet   != null && (gs.fleet || []).length < r.fleet) return false;
    if (r.drivers != null && (gs.drivers || []).filter(d => d.id !== 'ceo').length < r.drivers) return false;
    if (r.region  && !(gs.unlockedRegions || []).includes(r.region)) return false;
    if (r.staff   && !(gs.staff || []).some(s => s.id === r.staff)) return false;
    return true;
}

/* Prima: `CEO_EVENTS.find(e => e.month === gameState.month)`. Un evento solo per
   mese, sempre lo stesso per trenta giorni — la ripetizione che Vlad ha
   segnalato il 30/08 non era sfortuna, era la selezione.
   Ora il mese e' un filtro (gli eventi con `month: null` valgono tutto l'anno),
   i requisiti sono un secondo filtro, e gli ultimi 25 gia' visti si scartano
   finche' esistono alternative fresche. */
var MEMORIA_EVENTI_CEO = 25;

function _scegliEventoCEO() {
    if (typeof CEO_EVENTS === 'undefined' || !CEO_EVENTS.length) return null;
    const candidati = CEO_EVENTS.filter(e =>
        (e.month == null || e.month === gameState.month) && _requisitiEventoOk(e));
    if (!candidati.length) return null;

    const visti = Array.isArray(gameState.eventiCEOVisti) ? gameState.eventiCEOVisti : [];
    const freschi = candidati.filter(e => !visti.includes(e.id));
    const urna = freschi.length ? freschi : candidati;
    return urna[Math.floor(Math.random() * urna.length)];
}

/* La memoria si aggiorna solo quando l'evento viene DAVVERO spedito. Se si
   aggiornasse dentro la scelta, ogni giro in cui la moneta manda un'offerta
   B2B brucerebbe un evento senza mostrarlo: dopo venticinque giri la scorta di
   eventi freschi sarebbe finita e ricomincerebbero le ripetizioni — cioe'
   esattamente il difetto che stiamo togliendo. */
function _ricordaEventoCEO(id) {
    const visti = Array.isArray(gameState.eventiCEOVisti) ? gameState.eventiCEOVisti : [];
    gameState.eventiCEOVisti = visti.filter(x => x !== id).concat([id]).slice(-MEMORIA_EVENTI_CEO);
}

/* La lettera dell'evento, quando l'evento ne ha una sua. Il ripiego sui modelli
   generici resta per gli eventi che non l'hanno: e' anche il motivo per cui
   l'oggetto viene comunque riscritto col nome dell'evento a valle. */
function _lettera(email, ev, vars) {
    if (!ev || !ev.da || !ev.testo || typeof window._sostituisciSegnaposti !== 'function') return false;
    // Citta' e data si fissano una volta: nel testo devono coincidere.
    const v = Object.assign({}, vars, {
        city: (vars && vars.city) || (typeof _cittaPerEmail === 'function' ? _cittaPerEmail() : 'Roma'),
        day:  (vars && vars.day != null) ? vars.day
              : (typeof _dataPerEmail === 'function' ? _dataPerEmail(4 + Math.floor(Math.random() * 10)) : ''),
    });
    const sub = s => window._sostituisciSegnaposti(s, v);
    email.senderName = sub(ev.da.nome);
    email.senderRole = sub(ev.da.ruolo);
    email.senderIcon = ev.da.icona;
    email.body       = sub(ev.testo);
    email.signature  = sub(ev.da.nome);
    return true;
}

function generateEmailEvent() {
    const currentEvent = _scegliEventoCEO();
    const gameHour = gameState.day * 24 + gameState.hour;
    const expiresAt = gameHour + 12; // expires in 12 game hours

    if (currentEvent && Math.random() > 0.5) {
        const eventoDiOggi = _eventoConPrezzoDelGiorno(currentEvent);
        const _eventEmail = { id: gameState.nextId++, sender: "Networking Board", subject: `[INVITO] ${currentEvent.name}`, type: 'ceo_event', status: 'unread', eventData: eventoDiOggi, expiresAt };
        /* `amount` e' la quota piu' bassa dell'evento, che e' quella di cui
           parlano i testi. Citta' e data non arrivano mai dal contatore dei
           giorni: `gameState.day` vale 302 e nel testo diventava «Si terra' 302
           il Gala». */
        const quote = eventoDiOggi.choices.map(c => c.cost).filter(c => c > 0);
        const vars = {
            eventName: currentEvent.name,
            amount: quote.length ? Math.min.apply(null, quote) : null,
        };
        if (!_lettera(_eventEmail, currentEvent, vars)) {
            _applyEmailTemplate(_eventEmail, 'ceo_event', vars);
        }
        // Restore eventData in case template overwrote it (it won't, but belt-and-suspenders)
        _eventEmail.eventData = eventoDiOggi;
        /* L'oggetto e' sempre quello dell'EVENTO: il template generico ne aveva
           uno suo («Cena di Gala Rotary»), e il giocatore non capiva a cosa lo
           stessero invitando mentre i bottoni sotto parlavano d'altro. */
        _eventEmail.subject = `[INVITO] ${currentEvent.name}`;
        _ricordaEventoCEO(currentEvent.id);
        gameState.emails.push(_eventEmail);
    } else {
        gameState.emails.push({ id: gameState.nextId++, sender: "Concierge Lusso", subject: "Appalto B2B: Delega 3 Giorni", offer: Math.floor(Math.random() * 8000) + 3500, type: 'b2b', status: 'unread', expiresAt });
    }

    // Enforce max 5 before notifying
    while (gameState.emails.filter(e => e.status === 'unread').length > 5) {
        const idx = gameState.emails.findIndex(e => e.status === 'unread');
        if (idx > -1) gameState.emails.splice(idx, 1);
    }

    const dot = document.getElementById('mail-dot'); if(dot) dot.classList.remove('hidden');
    if (_tabIs('emails') && typeof renderTabEmails==='function') renderTabEmails();
}

function autoNegotiateEmails() {
    let unreadEmails = gameState.emails.filter(e => e.status === 'unread');
    let hasEventMgr = gameState.staff.some(s => s.id === 'evt_mgr');

    unreadEmails.forEach(email => {
        if (email.type === 'b2b' && hasEventMgr) {
            let counterOffer = Math.floor(email.offer * 1.15);
            logToMap(`L'Event Manager ha chiuso un Appalto B2B a €${counterOffer}`);
            window.CE_money.earn(counterOffer, 'b2b_auto_negotiate');
            window.CE_money.addReputation(0.05);
            email.status = 'resolved';

            let numRides = Math.floor(Math.random() * 3) + 3;
            for(let i=0; i<numRides; i++) generatePOIRide(Math.random()>0.5?'business':'vip');
        }
    });
    if (_tabIs('emails') && typeof renderTabEmails==='function') renderTabEmails();
    updateUI();
}

function negotiateEmail(emailId, action, choiceIdx = null) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;

    if (email.type === 'grey_market') {
        window.acceptGreyMarket(emailId);
        return;
    }

    if (email.type === 'ceo_event' && choiceIdx !== null) {
        const choice = email.eventData.choices[choiceIdx];
        const cost = Math.max(0, choice.cost || 0);
        if (cost > 0) {
            if (!window.CE_money.spend(cost, 'ceo_event_choice')) return;
        }
        /* Una scelta con `prob` puo' andare male: in quel caso l'esito e' `ko`,
           che sostituisce guadagno, reputazione e corse. Il costo invece e'
           gia' stato pagato — e' quello che rende la scommessa una scommessa.
           Senza `prob` la scelta riesce sempre, come ha sempre fatto. */
        const scommessa = typeof choice.prob === 'number' && choice.prob > 0 && choice.prob < 1;
        const riuscito = !scommessa || Math.random() < choice.prob;
        const esito = riuscito ? choice : (choice.ko || {});

        /* `gain` esiste perche' prima l'incasso si scriveva come costo negativo
           (`cost: -5000`, «Servizio Pagato (+€5.000)») e `Math.max(0, cost)` lo
           azzerava: il bottone prometteva cinquemila euro e non ne arrivava
           nessuno. */
        if (esito.gain > 0) window.CE_money.earn(esito.gain, 'ceo_event_gain');
        if (esito.repBonus) window.CE_money.addReputation(esito.repBonus);

        // Corse generate dall'evento: il tetto e' una difesa contro un dato
        // sbagliato in catalogo, non una regola di gioco.
        const quante = Math.max(0, Math.min(8, Math.floor(esito.rides || 0)));
        if (quante > 0 && typeof generatePOIRide === 'function') {
            for (let i = 0; i < quante; i++) generatePOIRide(esito.tier || 'business');
        }

        logToMap(esito.msg ? `Evento: ${esito.msg}` : `Evento: Hai scelto "${choice.text}".`);
        if (esito.msg && typeof showNotification === 'function') {
            showNotification(esito.msg, riuscito ? 'success' : 'error');
        }
    } else if (email.type === 'b2b') {
        let successChance = 100 - (((action / email.offer) - 1) * 100) + (gameState.reputation * 15);
        if (Math.random() * 100 <= successChance) {
            logToMap(`✅ Appalto B2B chiuso: €${action}`);
            window.CE_money.earn(action, 'b2b_negotiate_success');
            window.CE_money.addReputation(0.05);
            let numRides = Math.floor(Math.random() * 3) + 3;
            for(let i=0; i<numRides; i++) generatePOIRide(Math.random()>0.5?'business':'vip');
        } else {
            logToMap(`❌ Trattativa fallita.`);
            window.CE_money.addReputation(-0.02);
        }
    }

    email.status = 'resolved';
    if(typeof renderTabEmails==='function') renderTabEmails(); updateUI(); saveGame();
}


// ── DRIVER SATISFACTION ──────────────────────────────────────────
function _tickDriverSatisfaction() {
    const hasHR = gameState.staff.some(s => s.id === 'hr');
    gameState.drivers.forEach(d => {
        if (d.id === 'ceo') return;
        if (d.satisfaction === undefined) d.satisfaction = 70;
        if (d.isOnStrike   === undefined) d.isOnStrike   = false;

        // Satisfaction decays based on salary, fatigue, morale
        let decay = 0.3;
        if ((d.salary || 0) < 2000) decay += 0.4;
        if ((d.fatigue || 0) > 70) decay += 0.3;
        if ((d.morale || 100) < 40) decay += 0.4;
        if (hasHR) decay *= 0.5;

        d.satisfaction = Math.max(0, Math.min(100, d.satisfaction - decay));

        // Strike trigger
        if (d.satisfaction < 30 && !d.isOnStrike) {
            // Check HR Automation buff
            const hrExpires = gameState.hrAutomationExpiresAt ? new Date(gameState.hrAutomationExpiresAt) : null;
            const hrActive  = hrExpires && hrExpires > new Date();
            if (hrActive) {
                // Auto-resolve: boost satisfaction, no blocking popup
                d.satisfaction = 45;
                d.morale = Math.min(100, (d.morale || 50) + 15);
                const bonusCost = Math.round((d.salary || 2000) * 0.1);
                window.CE_money.earn(-bonusCost, 'hr_strike_prevention_bonus');
                showNotification(`🤝 HR ha gestito automaticamente un potenziale sciopero di ${d.name} (−€${bonusCost.toLocaleString()})`, 'success');
                logToMap(`🤝 HR Automation: sciopero di ${d.name} evitato automaticamente.`);
            } else {
                d.isOnStrike = true;
                d.status = 'striking';
                logToMap(`🪧 SCIOPERO: ${d.name} ha incrociato le braccia! (soddisfazione: ${Math.round(d.satisfaction)}%)`);
                showBigEvent('🪧', `${d.name} in Sciopero!`, `La soddisfazione è crollata al ${Math.round(d.satisfaction)}%. Paga un bonus o rischi di perdere l'autista definitivamente.`);
                if (typeof renderTabStaff === 'function') renderTabStaff();
            }
        }
        // If already striking, keep them out
        if (d.isOnStrike && d.status !== 'striking') d.status = 'striking';
    });
}


// ─── DAILY LOGIN REWARD ───────────────────────────────────────────
function _checkDailyReward() {
    const gs = gameState;
    const now = Date.now();
    const oneDayMs = 86400000;
    const last = gs.lastDailyClaim || 0;
    const elapsed = now - last;

    // Already claimed today (< 20h cooldown to be generous with timezones)
    if (elapsed < 20 * 3600 * 1000) return;

    // Broke streak if > 48h since last claim
    if (elapsed > 48 * 3600 * 1000 && last > 0) gs.loginStreak = 0;

    gs.loginStreak = (gs.loginStreak || 0) + 1;
    gs.lastDailyClaim = now;

    const streak = gs.loginStreak;

    // Reward table
    const DAILY_REWARDS = [
        { days: 1,  cash: 500,   tc: 0, label: 'Giorno 1' },
        { days: 2,  cash: 1000,  tc: 0, label: 'Giorno 2' },
        { days: 3,  cash: 1500,  tc: 1, label: 'Giorno 3' },
        { days: 5,  cash: 2500,  tc: 2, label: 'Giorno 5' },
        { days: 7,  cash: 5000,  tc: 5, label: 'Settimana!' },
        { days: 14, cash: 10000, tc: 10, label: '2 Settimane!' },
        { days: 30, cash: 25000, tc: 25, label: 'Un Mese!' },
    ];
    // Find the best matching tier
    const tier = [...DAILY_REWARDS].reverse().find(r => streak >= r.days) || DAILY_REWARDS[0];
    // Bonus ogni 7 giorni oltre il 7
    const extraMult = streak >= 7 ? 1 + Math.floor((streak - 7) / 7) * 0.1 : 1;
    const cashReward = Math.round(tier.cash * extraMult);
    const tcReward   = tier.tc;

    window.CE_money.earn(cashReward, 'daily_login_reward');
    gs.annualProfitTracker = (gs.annualProfitTracker || 0) + cashReward;
    if (tcReward > 0) {
        window.CE_money.earnDC(tcReward, 'tier_reward');
    }

    const rewardDesc = tcReward > 0
        ? `+€${cashReward.toLocaleString('it-IT')} · +${tcReward} DriverCoin`
        : `+€${cashReward.toLocaleString('it-IT')}`;

    if (typeof showBigEvent === 'function') {
        showBigEvent('🎁', `Login Streak: Giorno ${streak}`, `${tier.label}\n${rewardDesc}`);
    }
    if (typeof showNotification === 'function') {
        showNotification(`🎁 Login streak ${streak} — ${rewardDesc}`, 'success');
    }
    if (typeof logToMap === 'function') {
        logToMap(`🎁 Daily reward (streak ${streak}): ${rewardDesc}`);
    }
    if (typeof saveGame === 'function') saveGame();
    if (typeof updateUI === 'function') updateUI();
}
window._checkDailyReward = _checkDailyReward;

// ── Window exports ──────────────────────────────────────────────
window.processDailyRoutines  = processDailyRoutines;
window.generateEmailEvent    = generateEmailEvent;
window.autoNegotiateEmails   = autoNegotiateEmails;
window.negotiateEmail        = negotiateEmail;
window.refillVehicle         = refillVehicle;
