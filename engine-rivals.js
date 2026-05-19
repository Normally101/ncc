'use strict';
/* ================================================================
   engine-rivals.js — Chauffeur Empire
   Rival company AI: price wars, active tick, sabotage.
   Loaded AFTER engine.js (needs: gameState, RIVALS,
   showNotification, logToMap, generatePOIRide)
   ================================================================ */

function _tickPricewars() {
    if (!gameState.pricewars || gameState.pricewars.length === 0) return;
    const toRemove = [];
    gameState.pricewars.forEach(pw => {
        // Fine guerra: controlla monopolio
        if (gameState.day >= pw.endsDay && !pw.monopolyEndsDay) {
            const regionName = REGIONS[pw.regionId]?.name || pw.regionId;
            const weakRivals = RIVALS.filter(r => r.rep < 0.3);
            if (weakRivals.length >= 2) {
                pw.monopolyEndsDay = gameState.day + 7;
                showBigEvent('👑', `MONOPOLIO: ${regionName}!`,
                    `${weakRivals.length} rivali in bancarotta! Hai il monopolio per 7 giorni — tariffe +40% in ${regionName}.`);
                logToMap(`👑 MONOPOLIO attivo: ${regionName} per 7 giorni! +40% tariffe.`);
            } else {
                toRemove.push(pw.regionId);
                logToMap(`⚔️ Guerra prezzi ${regionName} terminata. Nessun monopolio ottenuto.`);
            }
        }
        // Fine monopolio
        if (pw.monopolyEndsDay && gameState.day >= pw.monopolyEndsDay) {
            toRemove.push(pw.regionId);
            logToMap(`👑 Monopolio ${REGIONS[pw.regionId]?.name} scaduto.`);
        }
    });
    gameState.pricewars = gameState.pricewars.filter(pw => !toRemove.includes(pw.regionId));
}

// ─── RIVALS AI ───────────────────────────────────────────────────

// Stato interno rivali (driver count, fleet count, missioni simulate)
function _ensureRivalState(r) {
    if (r.drivers  === undefined) r.drivers  = Math.max(1, Math.round(r.rep));
    if (r.fleet    === undefined) r.fleet    = Math.max(1, Math.round(r.rep * 0.8));
    if (r.missions === undefined) r.missions = 0;
    if (r.lastAction === undefined) r.lastAction = '';
}

// Chiamata ogni 15 minuti di gioco
function _tickRivalsActive() {
    if (!RIVALS || RIVALS.length === 0) return;
    const hour = gameState.hour;

    RIVALS.forEach(r => {
        _ensureRivalState(r);

        // Simulazione missione: ogni tick c'è una probabilità di completare una corsa
        const missionProb = 0.35 + (r.rep / 5) * 0.4; // 35–75% per tick
        if (Math.random() < missionProb) {
            const baseFare = 80 + r.rep * 120;
            const nightBonus = (hour >= 20 || hour < 6) ? 1.25 : 1.0;
            const earned = Math.floor(baseFare * nightBonus * (0.8 + Math.random() * 0.5));
            r.cash += earned;
            r.missions++;
            // Guadagno reputazione lento ma costante
            r.rep = Math.min(5.0, r.rep + 0.003);
        }

        // Rivale forte può comprare un'auto
        if (r.cash > 80000 && r.fleet < Math.floor(r.rep * 2) && Math.random() < 0.08) {
            const carCost = 35000 + Math.floor(Math.random() * 60000);
            r.cash -= carCost;
            r.fleet++;
            r.lastAction = `+1 auto (flotta: ${r.fleet})`;
        }

        // Rivale può assumere un driver
        if (r.cash > 20000 && r.drivers < r.fleet + 1 && Math.random() < 0.10) {
            const hireCost = 4000 + Math.floor(Math.random() * 4000);
            r.cash -= hireCost;
            r.drivers++;
            r.lastAction = `+1 autista (totale: ${r.drivers})`;
        }

        // Rivale in difficoltà: crolla lentamente
        if (r.cash < 5000 && Math.random() < 0.05) {
            r.rep = Math.max(0.1, r.rep - 0.02);
        }
    });

    // Ranking non auto-refresh — utente usa il pulsante "Aggiorna"
}

// Chiamata giornaliera da processDailyRoutines
function _tickRivalsDaily() {
    if (!RIVALS || RIVALS.length === 0) return;
    RIVALS.forEach(r => {
        _ensureRivalState(r);
        // Spese giornaliere simulate (stipendi, leasing)
        const dailyCosts = r.drivers * 80 + r.fleet * 40;
        r.cash = Math.max(5000, r.cash - dailyCosts);
    });
    _maybeRivalSabotage();
}

// Poaching e fake client
function _maybeRivalSabotage() {
    const rank = _getRankPosition();
    const myDrivers = gameState.drivers.filter(d => d.id !== 'ceo');

    // POACHING — rivale con alto budget tenta di rubarti il miglior driver
    if (myDrivers.length > 0 && Math.random() < 0.08) {
        const richRival = RIVALS.filter(r => r.cash > 150000 && r.rep > gameState.reputation * 0.8)
                               .sort((a,b) => b.cash - a.cash)[0];
        if (richRival) {
            const target = [...myDrivers].sort((a,b) => (b.xp||0) - (a.xp||0))[0];
            const poachOffer = Math.floor((target.salary || 2500) * 2.2);
            const _poachEmail = {
                id: gameState.nextId++,
                sender: richRival.name,
                subject: `💼 Offerta per ${target.name}: €${poachOffer}/mese`,
                type: 'poaching',
                status: 'unread',
                driverId: target.id,
                driverName: target.name,
                rivalName: richRival.name,
                counterOffer: poachOffer,
                expiresAt: gameState.day * 24 + gameState.hour + 8,
            };
            _applyEmailTemplate(_poachEmail, 'poaching', { driverName: target.name, rivalName: richRival.name, amount: poachOffer });
            gameState.emails.push(_poachEmail);
            const dot = document.getElementById('mail-dot');
            if (dot) dot.classList.remove('hidden');
            showNotification(`💼 ${richRival.name} vuole rubarti ${target.name}! Controlla l'inbox.`, 'error');
        }
    }

    // FAKE CLIENT — un rivale invia un cliente truffaldino che danneggia l'auto
    if (rank >= (RIVALS.length + 1) && Math.random() < 0.10) {
        const aggressorRival = RIVALS[Math.floor(Math.random() * RIVALS.length)];
        const victims = gameState.fleet.filter(c => !c.outOfService && c.condition > 30);
        if (victims.length > 0) {
            const car = victims[Math.floor(Math.random() * victims.length)];
            const damage = 15 + Math.floor(Math.random() * 20);
            car.condition = Math.max(5, car.condition - damage);
            showBigEvent('🕵️', 'Sabotaggio Rivale!',
                `${aggressorRival.name} ha inviato un cliente-truffa. La tua ${car.name} ha subito danni (−${damage}% condizione). Risali il ranking per diventare immune.`);
            logToMap(`🕵️ ${aggressorRival.name}: fake client — ${car.name} danneggiata −${damage}%.`);
        }
    }
}
