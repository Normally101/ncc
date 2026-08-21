'use strict';
/* ================================================================
   vip-clients.js — Chauffeur Empire
   VIP client handlers (Grigori, Strata, Platinum, Onorevole, Emiro,
   Golden Boy, Tech Bro, Garante, Wedding, Erede + _vipOnComplete).
   Dipendenze: vip-buffs.js (helpers), engine.js (gameState, saveGame)
   ================================================================ */

/**
 * Il cash mosso da un'azione email VIP va anche al server.
 * saveGame() scrive solo il blob del salvataggio (game_saves): `companies.cash`,
 * che è quello che leggono le RPC (P2P, alleanze, IPO, province), resterebbe
 * indietro fino alla prima azione che sincronizza per conto suo. Stesso pattern
 * di engine-rides.js e engine-daily.js.
 * Le _vipComplete* non ne hanno bisogno: girano dentro il completamento corsa,
 * che sincronizza già alla fine.
 */
function _vipSyncCash() {
    if (typeof window.ServerState !== 'undefined' && typeof window.ServerState.syncCash === 'function')
        window.ServerState.syncCash(gameState.cash).catch(() => {});
}

// ─── 1. GRIGORI V. — OLIGARCA PARANOICO ──────────────────────────────────────

window._maybeVipGrigori = function() {
    if (!_vipCooldownOk('grigori', 72)) return;
    if (Math.random() > 0.15) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_grigori')) return;

    const car = _vipFleetCar(['majestic_spirit','majestic_e_specter'], 95);
    if (!car) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('grigori');
    _vipPushEmail({
        id: gameState.nextId++,
        sender: 'Assistente di Grigori V.',
        subject: '[VVIP] Trasporto Presidenziale — Protocollo Riserbo Massimo',
        type: 'vip_grigori', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 8000 },
        expiresAt: gameState.day * 24 + gameState.hour + 8
    });
    logToMap('🕵️ Richiesta VVIP: Grigori V. — Veicolo Presidenziale richiesto.');
};

window.acceptVipGrigori = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const car = _vipFleetCar(['majestic_spirit','majestic_e_specter'], 95);
    if (!car) { showNotification('Nessun veicolo presidenziale (condizione ≥95%)!', 'error'); return; }
    const driver = _vipAssignedDriver(car.id, { minLevel: 2 });
    if (!driver) { showNotification('Nessun autista qualificato (Lv2+ o VIP/Ultra) disponibile!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'ultra', price, 'grigori', { driverId: driver.id }));
    _vipResolveEmail(emailId);
    logToMap(`🕵️ Grigori V. accettato: ${from.name} → ${to.name} — €${price.toLocaleString()}`);
    showNotification('Trasporto VVIP attivo. Silenzio radio totale.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteGrigori(ride, driver, earned) {
    const tip = 15000;
    window.CE_money.earn(tip, 'vip_grigori_tip');
    window.CE_money.addReputation(0.1);
    logToMap(`💰 Grigori V.: mancia di €${tip.toLocaleString()}! Reputazione +0.1★`);
    showNotification(`🕵️ Grigori soddisfatto! +€${tip.toLocaleString()} mancia`, 'success');

    if (Math.random() < 0.05) {
        gameState.watchDropCount = (gameState.watchDropCount || 0) + 1;
        showNotification('⌚ Grigori ti ha lasciato un orologio svizzero di lusso!', 'success');
    }

    if (Math.random() < 0.25) {
        _vipPushEmail({
            id: gameState.nextId++, sender: 'Grigori V. — Assistente',
            subject: '⚠️ Incidente di Percorso — Richiesta Rerouting',
            type: 'vip_grigori_event', status: 'unread',
            vipEventData: { cost: 500 },
            expiresAt: gameState.day * 24 + gameState.hour + 4
        });
    }
}

window.vipGrigoriEventAccept = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    const cost = (e.vipEventData || {}).cost || 500;
    if (!window.CE_money.spend(cost, 'vip_grigori_rerouting')) return;
    _vipSetCooldown('grigori'); // resets for next offer sooner
    gameState.vipCooldowns.grigori -= 24; // loyalty: next offer 24h earlier
    _vipResolveEmail(emailId);
    showNotification(`🕵️ Rerouting gestito. −€${cost}. Grigori fidelizzato.`, 'success');
    _vipRefreshUI(); saveGame();
};

window.vipGrigoriEventDecline = function(emailId) {
    _vipResolveEmail(emailId);
    window.CE_money.addReputation(-0.1);
    showNotification('Grigori non è contento. Reputazione −0.1★', 'error');
    _vipRefreshUI(); saveGame();
};

// ─── 2. STRATA CONSULTING — B2B PARTNER ──────────────────────────────────────

window._maybeVipStrata = function() {
    if (!_vipCooldownOk('strata', 48)) return;
    if (Math.random() > 0.25) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_strata')) return;

    const car = _vipFleetCar(['stellar_e_exec','stellar_s_imp','stellar_q_exec'], 70);
    if (!car) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('strata');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Strata Consulting — Procurement',
        subject: `[B2B] Trasferimento Corporate — €3.500`,
        type: 'vip_strata', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 3500 },
        expiresAt: gameState.day * 24 + gameState.hour + 6
    });
    logToMap('💼 Offerta B2B: Strata Consulting — Transfer Corporate');
};

window.acceptVipStrata = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const car = _vipFleetCar(['stellar_e_exec','stellar_s_imp','stellar_q_exec'], 70);
    if (!car) { showNotification('Nessuna berlina business disponibile (condizione ≥70%)!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'business', price, 'strata'));
    _vipResolveEmail(emailId);
    logToMap(`💼 Strata Consulting accettato: ${from.name} → ${to.name}`);
    showNotification('Contratto B2B attivo — SLA stringente.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteStrata(ride, driver, earned) {
    if (!gameState.strataStreak) gameState.strataStreak = 0;

    if (Math.random() < 0.20) {
        const chargeback = Math.floor(earned * 0.5);
        const toPay = Math.min(gameState.cash || 0, chargeback);
        window.CE_money.spend(toPay, 'vip_strata_chargeback');
        gameState.strataStreak = 0;
        logToMap(`💼 Strata chargeback: −€${chargeback}. Streak azzerata.`);
        showNotification(`💼 Strata: chargeback! −€${chargeback.toLocaleString()}`, 'error');
    } else {
        gameState.strataStreak++;
        logToMap(`💼 Strata streak: ${gameState.strataStreak}/5`);
        if (gameState.strataStreak >= 5) {
            gameState.strataStreak = 0;
            window._applyBuff('strata_5streak', 'earnings_pct', 10, 8);
            showNotification('💼 Strata Consulting: 5-streak! +10% guadagni per 8h', 'success');
        }
    }
}

// ─── 3. PLATINUM TALENT — DIVA ───────────────────────────────────────────────

window._maybeVipPlatinum = function() {
    if (!_vipCooldownOk('platinum', 56)) return;
    if (Math.random() > 0.20) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_platinum')) return;

    const vCars = gameState.fleet.filter(c => c.vehicleClass === 'stellar_v_carr' && (c.condition||0) >= 70 && !c.outOfService && !c.isSeized);
    if (vCars.length < 2) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('platinum');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Platinum Talent Agency',
        subject: '⭐ Transfer Artista VIP — 2× Stellar V-Carrier Richiesti',
        type: 'vip_platinum', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 6500 },
        expiresAt: gameState.day * 24 + gameState.hour + 6
    });
    logToMap('⭐ Richiesta VIP: Platinum Talent — La Diva è in città.');
};

window.acceptVipPlatinum = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const vCars = gameState.fleet.filter(c => c.vehicleClass === 'stellar_v_carr' && (c.condition||0) >= 70 && !c.outOfService && !c.isSeized);
    if (vCars.length < 2) { showNotification('Servono almeno 2 Stellar V-Carrier (condizione ≥70%)!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'vip', price, 'platinum'));
    _vipResolveEmail(emailId);
    logToMap(`⭐ Platinum Talent accettato: ${from.name} → ${to.name}`);
    showNotification('Transfer artista VIP confermato. Occhio ai paparazzi!', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompletePlatinum(ride, driver, earned) {
    if (Math.random() < 0.40) {
        _vipPushEmail({
            id: gameState.nextId++, sender: 'Agenzia — Situazione Stampa',
            subject: '📸 Paparazzi in Zona — Intervento Richiesto',
            type: 'vip_platinum_event', status: 'unread',
            expiresAt: gameState.day * 24 + gameState.hour + 3
        });
    } else {
        window._applyBuff('platinum_hype', 'tip_pct', 20, 4);
        showNotification('⭐ La Diva ha elogiato il servizio! +20% mance per 4h', 'success');
    }
}

window.vipPlatinumEventBlock = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    const fine = 300;
    if (!window.CE_money.spend(fine, 'vip_platinum_block')) return;
    _vipResolveEmail(emailId);
    window._applyBuff('platinum_hype', 'tip_pct', 20, 4);
    showNotification(`📸 Paparazzi bloccati. −€${fine}. La Diva riconoscente! +20% mance 4h`, 'success');
    _vipRefreshUI(); saveGame();
};

window.vipPlatinumEventAllow = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    _vipResolveEmail(emailId);
    window.CE_money.addReputation(0.15);
    logToMap('📸 Paparazzi liberi di scattare. Hype! Reputazione +0.15★');
    showNotification('📸 Buzz mediatico! Reputazione +0.15★', 'success');
    _vipRefreshUI(); saveGame();
};

// ─── 4. L'ONOREVOLE — POLITICO ───────────────────────────────────────────────

window._maybeVipOnorevole = function() {
    if (!_vipCooldownOk('onorevole', 72)) return;
    if (Math.random() > 0.15) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_onorevole')) return;

    const car = _vipFleetCar(['stellar_e_exec','stellar_s_imp'], 80, true);
    if (!car) return;
    const driver = _vipAssignedDriver(car.id, { minLevel: 2 });
    if (!driver) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('onorevole');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Segreteria Parlamentare',
        subject: '[RISERVATO] Trasporto Istituzionale — Berlina Discreta',
        type: 'vip_onorevole', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 5000 },
        expiresAt: gameState.day * 24 + gameState.hour + 6
    });
    logToMap('🏛️ Richiesta: L\'Onorevole — Trasporto istituzionale.');
};

window.acceptVipOnorevole = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const car = _vipFleetCar(['stellar_e_exec','stellar_s_imp'], 80, true);
    if (!car) { showNotification('Nessuna berlina discreta disponibile (no EV, condizione ≥80%)!', 'error'); return; }
    const driver = _vipAssignedDriver(car.id, { minLevel: 2 });
    if (!driver) { showNotification('Serve un autista Livello 2+ per L\'Onorevole!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'vip', price, 'onorevole', { driverId: driver.id }));
    _vipResolveEmail(emailId);
    logToMap(`🏛️ L\'Onorevole accettato: ${from.name} → ${to.name}`);
    showNotification('Trasporto istituzionale confermato. Massima riservatezza.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteOnorevole(ride, driver, earned) {
    gameState.politicalTokens = (gameState.politicalTokens || 0) + 1;
    logToMap(`🏛️ +1 Gettone Politico. Totale: ${gameState.politicalTokens}`);
    showNotification(`🏛️ L\'Onorevole soddisfatto! +1 Gettone Politico`, 'success');

    if (Math.random() < 0.10) {
        _vipPushEmail({
            id: gameState.nextId++, sender: 'Guardia di Finanza',
            subject: '🚔 Controllo Veicolo durante Trasporto Istituzionale',
            type: 'vip_onorevole_event', status: 'unread',
            expiresAt: gameState.day * 24 + gameState.hour + 4
        });
    }
}

window.vipOnorevoleEventCopera = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    _vipResolveEmail(emailId);
    if ((gameState.politicalTokens || 0) > 0) {
        gameState.politicalTokens--;
        showNotification('🏛️ Gettone Politico usato. GdF soddisfatta. −1 Token.', 'success');
    } else {
        const fine = 1000;
        const toPay = Math.min(gameState.cash || 0, fine);
        window.CE_money.spend(toPay, 'vip_onorevole_fine');
        showNotification(`🚔 GdF: multa €${fine}. Nessun Gettone disponibile.`, 'error');
    }
    _vipRefreshUI(); saveGame();
};

window.vipOnorevoleEventResisti = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    _vipResolveEmail(emailId);
    gameState.politicalTokens = (gameState.politicalTokens || 0) + 1;
    window.CE_money.addReputation(-0.05);
    showNotification('⚖️ Resistenza GdF: +1 Gettone Politico (favore), −0.05★ rep.', 'success');
    _vipRefreshUI(); saveGame();
};

// ─── 5. ROYAL ENTOURAGE — EMIRO ──────────────────────────────────────────────

window._maybeVipEmiro = function() {
    if (!_vipCooldownOk('emiro', 120)) return;
    if (Math.random() > 0.10) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_emiro')) return;

    const validVcSet = ['majestic_spirit','majestic_e_specter','stellar_s_imp','stellar_g_over','volt_s_hyper'];
    const readyCars = gameState.fleet.filter(c => validVcSet.includes(c.vehicleClass) && (c.condition||0) >= 80 && !c.outOfService && !c.isSeized);
    if (readyCars.length < 4) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('emiro');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Protocollo Reale — Attaché',
        subject: '👑 Scorta di Stato — Entourage Reale (Convoglio 4 Veicoli)',
        type: 'vip_emiro', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 18000 },
        expiresAt: gameState.day * 24 + gameState.hour + 8
    });
    logToMap('👑 Richiesta Reale: Emiro — Convoglio di 4 veicoli VIP/Ultra.');
};

window.acceptVipEmiro = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const validVcSet = ['majestic_spirit','majestic_e_specter','stellar_s_imp','stellar_g_over','volt_s_hyper'];
    const readyCars = gameState.fleet.filter(c => validVcSet.includes(c.vehicleClass) && (c.condition||0) >= 80 && !c.outOfService && !c.isSeized);
    if (readyCars.length < 4) { showNotification('Servono 4 veicoli VIP/Ultra con condizione ≥80%!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'ultra', price, 'emiro'));
    _vipResolveEmail(emailId);
    logToMap(`👑 Royal Entourage accettato: ${from.name} → ${to.name} — €${price.toLocaleString()}`);
    showNotification('Convoglio Reale in uscita. Quattro veicoli impegnati.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteEmiro(ride, driver, earned) {
    // Fuel price lock: freeze current price for 48h game time
    gameState.fuelPriceLock = gameState.fuelPrice || 1.85;
    gameState.fuelPriceLockUntil = gameState.day * 24 + gameState.hour + 48;
    logToMap('👑 Emiro: prezzo carburante bloccato per 48h!');
    showNotification('👑 Entourage Reale completato! Prezzo carburante bloccato 48h.', 'success');

    if (Math.random() < 0.30) {
        const shoppingBonus = 5000;
        window.CE_money.earn(shoppingBonus, 'vip_emiro_shopping_bonus');
        showNotification(`🛍️ Shopping reale: l'Emiro ha fatto una deviazione. +€${shoppingBonus}`, 'success');
        logToMap(`🛍️ Emiro shopping detour: +€${shoppingBonus}`);
    }
}

// ─── 6. GOLDEN BOY — CALCIATORE ──────────────────────────────────────────────

window._maybeVipGolden = function() {
    if (!_vipCooldownOk('golden', 72)) return;
    if (Math.random() > 0.20) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_golden')) return;

    const car = _vipFleetCar(['majestic_spirit','volt_s_hyper','majestic_e_specter'], 80);
    if (!car) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('golden');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Management — Golden Boy',
        subject: '⚽ Transfer VIP — GOLDEN BOY — €12.000 + Extra',
        type: 'vip_golden', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 12000 },
        expiresAt: gameState.day * 24 + gameState.hour + 6
    });
    logToMap('⚽ Richiesta: Golden Boy — Berlina Ultra-Lusso richiesta.');
};

window.acceptVipGolden = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const car = _vipFleetCar(['majestic_spirit','volt_s_hyper','majestic_e_specter'], 80);
    if (!car) { showNotification('Serve Majestic Spirit, Volt S-Hyper o Majestic E-Specter (condizione ≥80%)!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'ultra', price, 'golden', { carId: car.id }));
    _vipResolveEmail(emailId);
    logToMap(`⚽ Golden Boy accettato: ${from.name} → ${to.name}`);
    showNotification('Transfer Golden Boy confermato. Occhio all\'auto!', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteGolden(ride, driver, earned) {
    if (Math.random() < 0.60) {
        // FIX: ride.carId è congelato al momento della creazione della ride VIP,
        // ma driver/veicolo possono essere riassegnati prima del completamento
        // (nessun vincolo driverId/vehicleRequired — vedi docs/SYSTEMS.md §5). Il
        // vecchio `c.id === ride.carId || (driver && c.id === driver.assignedCarId)`
        // in un solo .find() sceglieva in base all'ordine casuale della flotta,
        // potendo applicare danno/riparazione a un'auto che non è più quella
        // realmente usata. Priorità esplicita al veicolo ATTUALE del driver.
        const car = (driver && gameState.fleet.find(c => c.id === driver.assignedCarId))
            || gameState.fleet.find(c => c.id === ride.carId);
        if (car) {
            if (typeof hasInvestment === 'function' && hasInvestment('inv_kasko')) {
                logToMap('🛡️ Kasko: danni Golden Boy coperti!');
                showNotification('🛡️ Kasko: nessun danno fatturato.', 'success');
            } else {
                const dmg = Math.floor(Math.random() * 20) + 15;
                car.condition = Math.max(0, car.condition - dmg);
                logToMap(`⚽ Golden Boy: auto danneggiata −${dmg} condizione!`);
                showNotification(`⚽ Golden Boy ha maltrattato l'auto! −${dmg} condizione.`, 'error');
            }
        }
    }

    // All-driver stress reset −20
    gameState.drivers.forEach(d => {
        if (d.stress_level !== undefined) d.stress_level = Math.max(0, d.stress_level - 20);
    });
    logToMap('⚽ Afterparty: tutti gli autisti recuperano −20 stress!');
    showNotification('⚽ Afterparty del Golden Boy! Tutti gli autisti: −20 stress.', 'success');
}

// ─── 7. TECH BRO ─────────────────────────────────────────────────────────────

window._maybeVipTechBro = function() {
    if (!_vipCooldownOk('techbro', 48)) return;
    if (Math.random() > 0.20) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_techbro')) return;

    const evCar = _vipFleetCar(['volt_3_urban','volt_y_cross','volt_s_apex','volt_s_hyper','majestic_e_specter'], 90, false, true);
    if (!evCar) return;
    const driver = _vipAssignedDriver(evCar.id, { maxStress: 20 });
    if (!driver) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('techbro');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Tech Bro — PA',
        subject: '⚡ Transfer Green — Full Electric Required — €5.000',
        type: 'vip_techbro', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 5000 },
        expiresAt: gameState.day * 24 + gameState.hour + 5
    });
    logToMap('⚡ Richiesta: Tech Bro — Solo veicolo elettrico, autista rilassato.');
};

window.acceptVipTechBro = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const evCar = _vipFleetCar(['volt_3_urban','volt_y_cross','volt_s_apex','volt_s_hyper','majestic_e_specter'], 90, false, true);
    if (!evCar) { showNotification('Serve un EV con condizione ≥90%!', 'error'); return; }
    const driver = _vipAssignedDriver(evCar.id, { maxStress: 20 });
    if (!driver) { showNotification('L\'autista deve avere stress ≤20% per il Tech Bro!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'vip', price, 'techbro', { driverId: driver.id }));
    _vipResolveEmail(emailId);
    logToMap(`⚡ Tech Bro accettato: ${from.name} → ${to.name}`);
    showNotification('Transfer green confermato. Zero emissioni, zero ritardi.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteTechBro(ride, driver, earned) {
    window._applyBuff('techbro_routing', 'speed_boost', 5, 24);
    showNotification('⚡ Tech Bro felice! Routing ottimizzato: +5% velocità per 24h', 'success');
    logToMap('⚡ Tech Bro: buff routing +5% velocità 24h');
}

// ─── 8. IL GARANTE ───────────────────────────────────────────────────────────

window._maybeVipGarante = function() {
    if (!_vipCooldownOk('garante', 120)) return;
    if (Math.random() > 0.10) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_garante')) return;

    const car = _vipFleetCar(['stellar_g_over','majestic_spirit'], 85, true);
    if (!car) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('garante');
    _vipPushEmail({
        id: gameState.nextId++, sender: '— MITTENTE ANONIMO —',
        subject: '[RISERVATO] Trasporto — Il Garante — €9.000',
        type: 'vip_garante', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 9000 },
        expiresAt: gameState.day * 24 + gameState.hour + 8
    });
    logToMap('⚠️ Richiesta: Il Garante — G-Overlord o Majestic, no elettrico.');
};

window.acceptVipGarante = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const car = _vipFleetCar(['stellar_g_over','majestic_spirit'], 85, true);
    if (!car) { showNotification('Serve G-Overlord o Majestic Spirit non-elettrico (condizione ≥85%)!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'ultra', price, 'garante'));
    _vipResolveEmail(emailId);
    logToMap(`⚠️ Il Garante accettato: ${from.name} → ${to.name}`);
    showNotification('Il Garante è in carrozza. Tieni la bocca chiusa.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteGarante(ride, driver, earned) {
    // Driver stress spike
    if (driver) {
        driver.stress_level = Math.min(100, (driver.stress_level || 0) + 50);
        logToMap(`⚠️ Il Garante: ${driver.name} sotto pressione! Stress +50.`);
    }

    // Intimidation buff: next fine -50%
    window._applyBuff('garante_intimidation', 'fine_discount', 50, 24);
    showNotification('⚠️ Il Garante soddisfatto. Prossima multa −50% per 24h.', 'success');

    if (Math.random() < 0.25) {
        _vipPushEmail({
            id: gameState.nextId++, sender: 'Polizia Stradale',
            subject: '🚔 Posto di Blocco — Veicolo Fermato durante Trasporto',
            type: 'vip_garante_event', status: 'unread',
            vipEventData: { fine: 2000 },
            expiresAt: gameState.day * 24 + gameState.hour + 4
        });
    }
}

window.vipGaranteEventPaga = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    const fine = (e.vipEventData || {}).fine || 2000;
    const discount = window._getBuffValue('fine_discount') / 100;
    const finalFine = Math.floor(fine * (1 - discount));
    const toPay = Math.min(gameState.cash || 0, finalFine);
    window.CE_money.spend(toPay, 'vip_garante_fine');
    _vipResolveEmail(emailId);
    logToMap(`🚔 Posto di blocco: multa €${finalFine} pagata.`);
    showNotification(`🚔 Multa pagata: €${finalFine.toLocaleString()}`, 'error');
    _vipRefreshUI(); saveGame();
};

window.vipGaranteEventIntimidisci = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    if ((gameState.politicalTokens || 0) > 0) {
        gameState.politicalTokens--;
        _vipResolveEmail(emailId);
        showNotification('🤝 Il Garante ha "risolto" il problema. −1 Token Politico.', 'success');
    } else {
        // 50/50: passa o paga il doppio
        if (Math.random() < 0.5) {
            _vipResolveEmail(emailId);
            showNotification('😤 Il Garante fissa il poliziotto. Passa liscia.', 'success');
        } else {
            const fine = ((e.vipEventData || {}).fine || 2000) * 2;
            const toPay = Math.min(gameState.cash || 0, fine);
            window.CE_money.spend(toPay, 'vip_garante_fine_double');
            _vipResolveEmail(emailId);
            showNotification(`🚔 Il poliziotto non si è lasciato intimidire! Multa ×2: −€${fine.toLocaleString()}`, 'error');
        }
    }
    _vipRefreshUI(); saveGame();
};

// ─── 9. WHITE LACE WEDDINGS — WEDDING PLANNER ────────────────────────────────

window._maybeVipWedding = function() {
    if (!_vipCooldownOk('wedding', 96)) return;
    if (Math.random() > 0.15) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_wedding')) return;

    const majestic = gameState.fleet.find(c => c.vehicleClass === 'majestic_spirit' && c.condition >= 100 && !c.outOfService && !c.isSeized);
    const vCars = gameState.fleet.filter(c => c.vehicleClass === 'stellar_v_carr' && c.condition >= 100 && !c.outOfService && !c.isSeized);
    if (!majestic || vCars.length < 2) return;
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('wedding');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'White Lace Weddings',
        subject: '💍 Corteo Nuziale — Majestic + 2 V-Carrier (condizione 100%)',
        type: 'vip_wedding', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 10000 },
        expiresAt: gameState.day * 24 + gameState.hour + 8
    });
    logToMap('💍 Richiesta: White Lace Weddings — Tutti i veicoli al 100%!');
};

window.acceptVipWedding = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    const majestic = gameState.fleet.find(c => c.vehicleClass === 'majestic_spirit' && c.condition >= 100 && !c.outOfService && !c.isSeized);
    const vCars = gameState.fleet.filter(c => c.vehicleClass === 'stellar_v_carr' && c.condition >= 100 && !c.outOfService && !c.isSeized);
    if (!majestic) { showNotification('Serve Majestic Spirit al 100% di condizione!', 'error'); return; }
    if (vCars.length < 2) { showNotification('Servono 2 Stellar V-Carrier al 100% di condizione!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'ultra', price, 'wedding'));
    _vipResolveEmail(emailId);
    logToMap(`💍 White Lace Wedding accettato: ${from.name} → ${to.name}`);
    showNotification('Corteo nuziale in partenza. Nessun ritardo tollerato!', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteWedding(ride, driver, earned) {
    // VIP queue buff
    window._applyBuff('wedding_vip_queue', 'vip_queue', 25, 24);
    logToMap('💍 White Lace: +25% probabilità clienti VIP per 24h!');

    if (Math.random() < 0.30) {
        _vipPushEmail({
            id: gameState.nextId++, sender: 'White Lace — Valentina Ricci',
            subject: '💥 Drama Nuziale — Intervento Urgente!',
            type: 'vip_wedding_event', status: 'unread',
            expiresAt: gameState.day * 24 + gameState.hour + 3
        });
    } else {
        // Delayed payment
        const bonus = Math.floor(earned * 0.30);
        _vipPushEmail({
            id: gameState.nextId++, sender: 'White Lace Weddings — Contabilità',
            subject: `💍 Pagamento Saldo Corteo Nuziale — +€${bonus.toLocaleString()}`,
            type: 'vip_wedding_payment', status: 'unread',
            vipEventData: { bonus },
            expiresAt: gameState.day * 24 + gameState.hour + 24
        });
        showNotification('💍 Wedding completato! Saldo in arrivo via email.', 'success');
    }
}

window.vipWeddingEventGestisci = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    const cost = 800;
    if (!window.CE_money.spend(cost, 'vip_wedding_drama_cost')) return;
    _vipResolveEmail(emailId);
    const bonus = 2000;
    window.CE_money.earn(bonus, 'vip_wedding_drama_bonus');
    showNotification(`💍 Drama gestito! −€${cost} + compenso sposi €${bonus}. Netto: +€${bonus - cost}.`, 'success');
    _vipRefreshUI(); saveGame();
};

window.vipWeddingEventIgnora = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    _vipResolveEmail(emailId);
    window.CE_money.addReputation(-0.2);
    showNotification('💥 White Lace furious! Reputazione −0.2★', 'error');
    _vipRefreshUI(); saveGame();
};

window.vipWeddingPaymentCollect = function(emailId) {
    const e = gameState.emails.find(x => x.id === emailId);
    if (!e) return;
    const bonus = (e.vipEventData || {}).bonus || 0;
    window.CE_money.earn(bonus, 'vip_wedding_payment');
    _vipResolveEmail(emailId);
    if (typeof spawnMoneyParticles === 'function') {
        const r = document.body.getBoundingClientRect();
        spawnMoneyParticles(r.width / 2, r.height / 2, bonus);
    }
    showNotification(`💍 Saldo ricevuto! +€${bonus.toLocaleString()}`, 'success');
    _vipRefreshUI(); saveGame();
};

// ─── 10. L'EREDE VIZIATO ──────────────────────────────────────────────────────

window._maybeVipErede = function() {
    if (!_vipCooldownOk('erede', 56)) return;
    if (Math.random() > 0.20) return;
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'vip_erede')) return;

    const car = _vipFleetCar(['volt_s_hyper','majestic_spirit','majestic_e_specter'], 80);
    if (!car) return;
    if (typeof hasInvestment !== 'function' || !hasInvestment('inv_kasko')) return; // kasko required
    const route = _vipRandomRoute();
    if (!route) return;

    _vipSetCooldown('erede');
    _vipPushEmail({
        id: gameState.nextId++, sender: 'Famiglia Conti — Segretario',
        subject: '⚡ Transfer Urgente — L\'Erede Viziato — Kasko Obbligatoria',
        type: 'vip_erede', status: 'unread',
        vipData: { fromId: route.from.id, toId: route.to.id, price: 9500 },
        expiresAt: gameState.day * 24 + gameState.hour + 4
    });
    logToMap('💸 Richiesta: L\'Erede Viziato — Kasko obbligatoria!');
};

window.acceptVipErede = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    if (!hasInvestment('inv_kasko')) { showNotification('Kasko assicurativa obbligatoria per L\'Erede!', 'error'); return; }
    const car = _vipFleetCar(['volt_s_hyper','majestic_spirit','majestic_e_specter'], 80);
    if (!car) { showNotification('Serve Volt S-Hyper, Majestic Spirit o E-Specter (condizione ≥80%)!', 'error'); return; }
    const { fromId, toId, price } = email.vipData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    gameState.pendingRides.push(_vipCreateRide(from, to, 'ultra', price, 'erede', { carId: car.id }));
    _vipResolveEmail(emailId);
    logToMap(`💸 L\'Erede Viziato accettato: ${from.name} → ${to.name}`);
    showNotification('Transfer confermato. Kasko attiva. Prega che non combini guai.', 'success');
    _vipRefreshUI(); saveGame();
};

function _vipCompleteErede(ride, driver, earned) {
    if (Math.random() < 0.30) {
        // FIX: ride.carId è congelato al momento della creazione della ride VIP,
        // ma driver/veicolo possono essere riassegnati prima del completamento
        // (nessun vincolo driverId/vehicleRequired — vedi docs/SYSTEMS.md §5). Il
        // vecchio `c.id === ride.carId || (driver && c.id === driver.assignedCarId)`
        // in un solo .find() sceglieva in base all'ordine casuale della flotta,
        // potendo applicare danno/riparazione a un'auto che non è più quella
        // realmente usata. Priorità esplicita al veicolo ATTUALE del driver.
        const car = (driver && gameState.fleet.find(c => c.id === driver.assignedCarId))
            || gameState.fleet.find(c => c.id === ride.carId);
        if (car) {
            logToMap('💸 L\'Erede: INCIDENTE! Kasko copre tutto.');
            showNotification('💥 L\'Erede ha fatto un incidente! Kasko intervenuta. Auto riparata.', 'error');
            car.condition = 100; // kasko restores
        }
    }

    if (Math.random() < 0.30) {
        const viral = Math.floor(earned * 1.0);
        window.CE_money.earn(viral, 'vip_erede_viral');
        window.CE_money.addReputation(0.10);
        logToMap(`💸 L\'Erede virale: +€${viral} bonus e +0.10★ reputazione!`);
        showNotification(`💸 L\'Erede è diventato virale! +€${viral.toLocaleString()} + 0.10★`, 'success');
    }
}

// ─── COMPLETION DISPATCHER ────────────────────────────────────────────────────

window._vipOnComplete = function(clientId, ride, driver, earned) {
    const handlers = {
        grigori:  _vipCompleteGrigori,
        strata:   _vipCompleteStrata,
        platinum: _vipCompletePlatinum,
        onorevole:_vipCompleteOnorevole,
        emiro:    _vipCompleteEmiro,
        golden:   _vipCompleteGolden,
        techbro:  _vipCompleteTechBro,
        garante:  _vipCompleteGarante,
        wedding:  _vipCompleteWedding,
        erede:    _vipCompleteErede,
    };
    const fn = handlers[clientId];
    if (fn) fn(ride, driver, earned);
};

// ─── POLITICAL TOKEN UI (exposed for dispatcher) ──────────────────────────────
// Use: window._getBuffValue, gameState.politicalTokens, gameState.activeBuffs
