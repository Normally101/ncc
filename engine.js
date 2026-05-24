'use strict';
/* ================================================================
   engine.js — Chauffeur Empire · Tycoon Engine v8.0
   ================================================================ */

// ─── POI → PROVINCE MAPPING (mirrors provinces.mapped_pois in DB) ────────────
// Used client-side to quickly determine which province a POI belongs to
// so influence can be awarded after each local ride completion.
const _POI_TO_PROVINCE = {
    // Lazio
    'roma':         'prov_roma',    'roma_fco':    'prov_roma',
    'roma_hassler': 'prov_roma',    'civitavecchia':'prov_civita',
    // Lombardia
    'milano':       'prov_milano',  'mil_mxp':     'prov_milano',
    'mil_lin':      'prov_milano',  'mil_armani':  'prov_milano',
    'como':         'prov_como',
    // Toscana
    'firenze':      'prov_firenze',
    // Campania
    'napoli':       'prov_napoli',  'nap_capo':    'prov_napoli',
    'sorrento':     'prov_amalfi',  'amalfi':      'prov_amalfi',
    // Veneto
    'venezia':      'prov_venezia', 'ven_mp':      'prov_padova',
    'cortina':      'prov_cortina',
    // Puglia
    'bari':         'prov_bari',    'brindisi':    'prov_bari',
    'lecce':        'prov_bari',    'borgo_egnazia':'prov_egnazia',
    // Sicilia
    'palermo':      'prov_palermo', 'catania':     'prov_palermo',
    'taormina':     'prov_taormina',
    // Sardegna
    'cagliari':     'prov_cagliari','olbia':       'prov_cagliari',
    'porto_cervo':  'prov_cervo',
    // Liguria
    'genova':       'prov_genova',  'portofino':   'prov_genova',
    'splendido':    'prov_genova',
    // Emilia
    'bologna':      'prov_bologna',
    // Piemonte
    'torino':       'prov_torino',
    // Friuli
    'trieste':      'prov_trieste',
    // Trentino
    'trento':       'prov_trento',
    // Umbria/Marche
    'perugia':      'prov_perugia', 'ancona':      'prov_perugia',
    // Valle d'Aosta
    'aosta':        'prov_aosta',
};

// Earn influence after completing a ride in a mapped province (async, fire & forget)
function _awardTerritoryInfluence(ride) {
    if (!window.supabaseClient || !window.ServerState?.addProvinceInfluence) return;
    const provinces = new Set();
    if (ride.fromPoi?.id && _POI_TO_PROVINCE[ride.fromPoi.id]) {
        provinces.add(_POI_TO_PROVINCE[ride.fromPoi.id]);
    }
    if (ride.toPoi?.id && _POI_TO_PROVINCE[ride.toPoi.id]) {
        provinces.add(_POI_TO_PROVINCE[ride.toPoi.id]);
    }
    provinces.forEach(provId => {
        window.ServerState.addProvinceInfluence(provId, 10).then(result => {
            if (!result) return;
            // Cache locally
            if (!gameState.territoryInfluence) gameState.territoryInfluence = {};
            gameState.territoryInfluence[provId] = result.influence || 0;
            // Notify if just crossed the threshold
            if (result.unlocked && (result.influence - 10) < result.threshold) {
                showNotification(`🏴 Influenza sbloccata: puoi ora conquistare ${result.province_name}!`, 'success');
                logToMap(`🏴 Soglia influenza raggiunta: ${result.province_name} — OPA disponibile!`);
            }
        }).catch(() => {}); // silent fail — not critical
    });
}

// Stub: dispatcher.js overwrites this with the real notification UI.
// Having this here ensures engine.js code never throws "showNotification is not defined".
function showNotification(msg, type) {
    if (typeof window._realShowNotification === 'function') window._realShowNotification(msg, type);
}

// ─── EMAIL TEMPLATE ENGINE ────────────────────────────────────────
// Enriches an email object with senderName, senderRole, senderIcon,
// subject, body, signature from EMAIL_TEMPLATES[type].
// Gracefully no-ops if EMAIL_TEMPLATES is not yet loaded.
function _applyEmailTemplate(emailObj, type, vars) {
    if (typeof EMAIL_TEMPLATES === 'undefined') return;
    const pool = EMAIL_TEMPLATES[type];
    if (!pool || !pool.length) return;
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    const body = tpl.bodies[Math.floor(Math.random() * tpl.bodies.length)];
    const sub = (str) => str
        .replace(/\{\{driverName\}\}/g, vars.driverName || '')
        .replace(/\{\{rivalName\}\}/g, vars.rivalName || '')
        .replace(/\{\{amount\}\}/g, vars.amount != null ? Math.round(vars.amount).toLocaleString('it-IT') : '')
        .replace(/\{\{city\}\}/g, vars.city || '')
        .replace(/\{\{day\}\}/g, vars.day != null ? vars.day : (gameState.day || 1))
        .replace(/\{\{companyName\}\}/g, vars.companyName || gameState.companyName || 'Italy Executive')
        .replace(/\{\{ceoName\}\}/g, vars.ceoName || gameState.ceoName || 'CEO');
    emailObj.senderName  = sub(tpl.senderName);
    emailObj.senderRole  = sub(tpl.senderRole);
    emailObj.senderIcon  = tpl.senderIcon;
    emailObj.subject     = sub(tpl.subject);
    emailObj.body        = sub(body);
    emailObj.signature   = sub(tpl.signature);
}

function _getBrandVolumeBonus() {
    const bv = gameState.brandVolume || 0;
    if (bv >= 100) return 0.40;
    if (bv >= 75)  return 0.30;
    if (bv >= 50)  return 0.18;
    if (bv >= 25)  return 0.08;
    return 0;
}

function _getBrandPrestigeBonus() {
    const bp = gameState.brandPrestige || 0;
    if (bp >= 100) return 0.55;
    if (bp >= 75)  return 0.40;
    if (bp >= 50)  return 0.25;
    if (bp >= 25)  return 0.10;
    return 0;
}

function _applyMarketingCampaign(campaignId) {
    if (!gameState.activeCampaigns) gameState.activeCampaigns = [];
    const hasMarkDir = gameState.staff.some(s => s.id === 'marketing_dir' || s.id === 'mktg');
    const maxSlots = hasMarkDir ? 2 : 1;
    if (gameState.activeCampaigns.length >= maxSlots) {
        showNotification(`⚠️ Slot campagne pieni (${maxSlots}/${maxSlots}). Rimuovi una campagna prima.`, 'error');
        return false;
    }
    const camp = MARKETING_CAMPAIGNS.find(c => c.id === campaignId);
    if (!camp) return false;
    // Check cooldown
    const existing = (gameState.activeCampaigns || []).find(ac => ac.id === campaignId);
    if (existing) { showNotification('Campagna già attiva.', 'error'); return false; }
    // Check unlock requirements
    const bv = gameState.brandVolume || 0;
    const bp = gameState.brandPrestige || 0;
    if (camp.tier === 'growth' && bv < camp.unlockBrand && bp < camp.unlockBrand) {
        showNotification(`Richiede Brand Volume o Prestige ≥ ${camp.unlockBrand}.`, 'error'); return false;
    }
    if (camp.tier === 'empire') {
        if (bv < camp.unlockBrand && bp < camp.unlockBrand) {
            showNotification(`Richiede Brand Volume o Prestige ≥ ${camp.unlockBrand}.`, 'error'); return false;
        }
        if (camp.unlockRep > 0 && gameState.reputation < camp.unlockRep) {
            showNotification(`Richiede reputazione ≥ ${camp.unlockRep}★.`, 'error'); return false;
        }
    }
    if (gameState.cash < camp.dailyCost) {
        showNotification(`Liquidità insufficiente (costo giornaliero €${camp.dailyCost.toLocaleString('it-IT')}).`, 'error'); return false;
    }
    const endsDay = gameState.day + camp.duration;
    gameState.activeCampaigns.push({ id: campaignId, startDay: gameState.day, endsDay, cooldownUntil: endsDay + (camp.cooldown || 0) });
    if (camp.repBonus) gameState.reputation = Math.min(5.0, (gameState.reputation || 0) + camp.repBonus);
    showNotification(`🚀 Campagna "${camp.name}" avviata! Dura ${camp.duration} giorni.`, 'success');
    if (typeof renderTabMarketing === 'function') renderTabMarketing();
    return true;
}

function _stopMarketingCampaign(campaignId) {
    if (!gameState.activeCampaigns) return;
    gameState.activeCampaigns = gameState.activeCampaigns.filter(ac => ac.id !== campaignId);
    showNotification('Campagna interrotta.', 'info');
    if (typeof renderTabMarketing === 'function') renderTabMarketing();
}

window._applyMarketingCampaign = _applyMarketingCampaign;
window._stopMarketingCampaign  = _stopMarketingCampaign;

let tempLeaseTier = null;

let gameState = {
    cash: 5000, reputation: 0.0, energy: 100,
    day: 1, month: 1, hour: 8, minute: 0, paused: false,
    todayEarnings: 0,
    fleet: [], drivers: [], staff: [], investments: [],
    pendingRides: [], activeRides: [], activeTrips: [], emails: [],
    unlockedRegions: ['lazio'], nextId: 1, cannesBoostDays: 0,
    availableRecruits: [],
    weather: 'sole', weatherHoursLeft: 6,
    activeCampaign: null,
    activeCampaigns: [],     // [{id, startDay, endsDay, cooldownUntil}]
    brandVolume: 0,          // 0-100
    brandPrestige: 0,        // 0-100
    campaignROI: {},         // {campaignId: totalRevenue}
    portfolioValueYesterday: 0,
    stockPrevPrices: {},
    activeFines: [],
    achievements: [],
    loans: [],
    newGamePlusCount: 0,
    // Fuel depot + tire depot
    fuelTank: 1000, fuelTankCapacity: 10000, fuelPrice: 1.85, fuelTankLevel: 1,
    depositoGomme: 0,
    // Seized vehicles (grey market busted)
    seizedCars: [],
    // Police Heat System (0-100)
    policeHeat: 0,
    // Bankruptcy tracker
    consecutiveRedDays: 0,
    // Client blacklist (POI IDs)
    blacklistedClients: [],
    // HQ level (0-3)
    hqLevel: 0,
    // Active dynamic event
    activeDynamicEvent: null,  // { id, name, icon, endsHour, ...effects }
    // Strike state
    activeStrike: null,        // { endsHour }
    // Prestige (unlocked after 5.0★)
    prestige: 0,
    // Price War system
    pricewars: [],          // [{ regionId, endsDay, monopolyEndsDay, discountPct }]
    // Shadow mission counter
    shadowMissionsTotal: 0,
    // ── HOLDING FINANZIARIA ──────────────────────────────────────
    stockPrices: {},        // { OIL: 85.0, CARS: 145.0, ... }
    stockHoldings: {},      // { OIL: { shares: 100, avgCost: 83.0 }, ... }
    stockHistory: {},       // { OIL: [85.0, 84.2, ...], ... } — last 24 hourly prices
    shortPositions: {},     // { TECH: { shares: 50, openPrice: 312.0 } }
    brokerInvestments: [],  // [{ id, capital, risk, startHour, endsHour, minRet, maxRet, resolved }]
    lifestyleAssets: [],    // array of asset IDs owned
    creditScore: 300,       // 300-900 (like FICO)
    totalDividendsEarned: 0,
    totalStockProfit: 0,
    diamondContractsCompleted: 0,
    // ── MACRO-ECONOMIA ───────────────────────────────────────────
    inflationRate: 0.020,   // 2.0% — varia ogni 24h di gioco
    interestRateBase: 0.045,// tasso base BCE — segue inflazione con lag
    // ── LOBBY & POLITICA ─────────────────────────────────────────
    lobbyingPoints: 0,      // 0-200
    activeLobbyLaws: [],    // [{ id, endsDay }] (laws with duration); permanent ones stored as just id
    // ── AZIENDA ──────────────────────────────────────────────────
    companyName: 'Chauffeur Empire',
    companyLogo: '👁️',
    companyColor: '#d4af37',
    // Daily login streak
    loginStreak: 0,
    lastDailyClaim: null,
    ventureCapital: [],
    annualProfitTracker: 0,
    // ── CONTRATTO CLASSIC VACATIONS ──────────────────────────────
    cvWeeklyTarget:    8,
    cvWeeklyCompleted: 0,
    cvWeeklyStreak:    0,
    totalContractMargin: 0,
    // ── HQ ────────────────────────────────────────────────────────
    hq: { lng: null, lat: null, name: 'Garage Periferico', level: 0, region: null },
    // ── PRICING STRATEGY ─────────────────────────────────────────
    pricingStrategy: 'standard',   // 'discount' | 'standard' | 'premium'
    // ── MAINTENANCE CONTRACT ──────────────────────────────────────
    maintenanceContract: false,         // -30% repair costs
    maintenanceContractPaidUntilDay: 0,
    // ── CEO OF THE WEEK ───────────────────────────────────────────
    weeklyEarnings: 0,
    weeklyRides:    0,
    weekStartDay:   1,
    // ── EXECUTIVE PASS ────────────────────────────────────────────
    executivePassActive:     false,
    executivePassExpiresDay: 0,
    // ── HUB CONQUEST ─────────────────────────────────────────────
    ownedHubs:      [],   // hub POI IDs owned by player
    hubTaxBalance:  0,    // accumulated hub tax income
    // ── DRIVER ACADEMY ────────────────────────────────────────────
    driverAcademy: [],    // [{ driverId, skill, completesHour, courseName }]
    // ── MERCATO AUTO P2P ──────────────────────────────────────────
    marketplace:  [],     // user-listed cars for NPC buyers
    npcMarket:    [],     // NPC cars available to buy
    lastNpcMarketRefreshDay: 0,
    // ── ASTE LIVE ─────────────────────────────────────────────────
    activeAuction: null,  // { id, name, tier, vehicleClass, minBid, currentBid, endsHour, playerBid }
    // ── HOLDING FINANZIARIA ───────────────────────────────────────
    holding: { incorporated: false, incorporationDay: 0, subsidiaries: [] },
    // ── COMPANY STOCK ($CEMP) ─────────────────────────────────────
    cempPrice:       10.0,   // current share price
    cempShares:      10000,  // total outstanding shares
    cempOwnedShares: 0,      // shares the player owns
    cempHistory:     [],     // last 30 daily prices
    // ── IPO AZIENDALE ─────────────────────────────────────────────
    companyIPO: null,        // { listed, listedDay, sharesTotal, sharePrice, npcSharesOwned, dividendsPaid }
    // ── SISTEMA QUEST & DRIVER COINS ─────────────────────────────
    driverCoins:     50,
    questStats:      { totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 },
    constructions:   [],   // [{ invId, startDay, buildDays, completesDay }]
    claimableQuests: [],
    completedQuests: [],
    hasEVHub: false,
};

function hasInvestment(id) { return gameState.investments.includes(id); }

// ─── STELLAR, VOLT & MAJESTIC FULL CATALOG ───────────────────────────────────
const STELLAR_VOLT_CATALOG = [
    // ── Stellar gasoline ──────────────────────────────────────────────────────
    { id:'stellar_e_exec',    name:'Stellar E-Executive',   img:'assets/fleet/stellar-e-executive.jpg',  tier:'BUSINESS',     fuel:'gasoline', price:120000,  rideGate:0,    co2PerKm:0.18, vehicleClass:'stellar_e_exec'    },
    { id:'stellar_v_carr',    name:'Stellar V-Carrier',     img:'assets/fleet/stellar-v-carrier.jpg',    tier:'PREMIUM',      fuel:'gasoline', price:95000,   rideGate:0,    co2PerKm:0.22, vehicleClass:'stellar_v_carr'    },
    { id:'stellar_s_imp',     name:'Stellar S-Imperial',    img:'assets/fleet/stellar-s-imperial.jpg',   tier:'PRESIDENTIAL', fuel:'gasoline', price:480000,  rideGate:250,  co2PerKm:0.20, vehicleClass:'stellar_s_imp'     },
    { id:'stellar_g_over',    name:'Stellar G-Overlord',    img:'assets/fleet/stellar-g-overlord.jpg',   tier:'ARMORED',      fuel:'gasoline', price:950000,  rideGate:1000, co2PerKm:0.28, vehicleClass:'stellar_g_over'    },
    // ── Stellar Q electric ────────────────────────────────────────────────────
    { id:'stellar_q_exec',    name:'Stellar Q-Executive',   img:'assets/fleet/stellar-q-executive.jpg',  tier:'BUSINESS',     fuel:'electric', price:95000,   rideGate:0,    co2PerKm:0.00, vehicleClass:'stellar_q_exec'    },
    { id:'stellar_q_imp',     name:'Stellar Q-Imperial',    img:'assets/fleet/stellar-q-imperial.jpg',   tier:'PRESIDENTIAL', fuel:'electric', price:320000,  rideGate:250,  co2PerKm:0.00, vehicleClass:'stellar_q_imp'     },
    { id:'stellar_q_carr',    name:'Stellar Q-Carrier',     img:'assets/fleet/stellar-q-carrier.jpg',    tier:'PREMIUM',      fuel:'electric', price:110000,  rideGate:0,    co2PerKm:0.00, vehicleClass:'stellar_q_carr'    },
    // ── Volt electric ─────────────────────────────────────────────────────────
    { id:'volt_s_apex',       name:'Volt S-Apex',           img:'assets/fleet/volt-s-apex.jpg',          tier:'PRESIDENTIAL', fuel:'electric', price:560000,  rideGate:250,  co2PerKm:0.00, vehicleClass:'volt_s_apex'       },
    { id:'volt_s_hyper',      name:'Volt S-Hyper',          img:'assets/fleet/volt-s-hyper.jpg',         tier:'ULTRA',        fuel:'electric', price:1400000, rideGate:1000, co2PerKm:0.00, vehicleClass:'volt_s_hyper'      },
    { id:'volt_3_urban',      name:'Volt 3-Urban',          img:'assets/fleet/volt-3-urban.jpg',         tier:'BUSINESS',     fuel:'electric', price:55000,   rideGate:0,    co2PerKm:0.00, vehicleClass:'volt_3_urban'      },
    { id:'volt_y_cross',      name:'Volt Y-Cross',          img:'assets/fleet/volt-y-cross.jpg',         tier:'PREMIUM',      fuel:'electric', price:70000,   rideGate:0,    co2PerKm:0.00, vehicleClass:'volt_y_cross'      },
    // ── Majestic luxury ───────────────────────────────────────────────────────
    { id:'majestic_spirit',   name:'Majestic Spirit',       img:'assets/fleet/majestic-spirit.jpg',      tier:'PRESIDENTIAL', fuel:'gasoline', price:2000000, rideGate:1000, co2PerKm:0.25, vehicleClass:'majestic_spirit'   },
    { id:'majestic_e_specter',name:'Majestic E-Specter',    img:'assets/fleet/majestic-e-specter.jpg',   tier:'PRESIDENTIAL', fuel:'electric', price:3200000, rideGate:1000, co2PerKm:0.00, vehicleClass:'majestic_e_specter' },
    { id:'majestic_citadel',  name:'Majestic Citadel',      img:'assets/fleet/majestic-citadel.jpg',     tier:'PRESIDENTIAL', fuel:'gasoline', price:135000,  rideGate:250,  co2PerKm:0.24, vehicleClass:'majestic_citadel'  },
    // ── Nexus entry-level ─────────────────────────────────────────────────────
    { id:'nexus_h_line',      name:'Nexus H-Line',          img:'assets/fleet/nexus-h-line.jpg',         tier:'STANDARD',     fuel:'gasoline', price:35000,   rideGate:0,    co2PerKm:0.17, vehicleClass:'nexus_h_line'      },
    // ── Volt expanded ─────────────────────────────────────────────────────────
    { id:'volt_ciudad',       name:'Volt Ciudad',           img:'assets/fleet/volt-ciudad.jpg',          tier:'BUSINESS',     fuel:'electric', price:48000,   rideGate:0,    co2PerKm:0.00, vehicleClass:'volt_ciudad'       },
    { id:'volt_e_estate',     name:'Volt E-Estate',         img:'assets/fleet/volt-e-estate.jpg',        tier:'ULTRA',        fuel:'electric', price:92000,   rideGate:250,  co2PerKm:0.00, vehicleClass:'volt_e_estate'     },
    // ── Stellar commercial ────────────────────────────────────────────────────
    { id:'stellar_m_cruiser', name:'Stellar M-Cruiser',     img:'assets/fleet/stellar-m-cruiser.jpg',    tier:'COMMERCIAL',   fuel:'gasoline', price:80000,   rideGate:0,    co2PerKm:0.26, vehicleClass:'stellar_m_cruiser' },
];
window.STELLAR_VOLT_CATALOG = STELLAR_VOLT_CATALOG;

function _isElectric(car) {
    // Aviation vehicles (avgas/jet) are treated like EVs for ground fuel logic
    if (car.vehicleClass === 'helicopter' || car.vehicleClass === 'private_jet') return true;
    const cat = STELLAR_VOLT_CATALOG.find(c => c.vehicleClass === car.vehicleClass || c.id === car.vehicleClass);
    return cat?.fuel === 'electric';
}

const CO2_RATE_EUR_PER_KG = 0.15; // €0.15/kg CO2 (EU ETS semplificato)

function _co2TaxForRide(car, distKm) {
    const cat = STELLAR_VOLT_CATALOG.find(c => c.vehicleClass === car.vehicleClass || c.id === car.vehicleClass);
    const co2PerKm = cat?.co2PerKm ?? 0.18;
    return Math.round(distKm * co2PerKm * CO2_RATE_EUR_PER_KG);
}
window._co2TaxForRide = _co2TaxForRide;

function _applyBrandColor() {
    const color = gameState.companyColor || '#d4af37';
    document.documentElement.style.setProperty('--gold', color);
}

let _activeTab = 'map';
function _tabIs(t) { return _activeTab === t; }

// ─── RANKING ──────────────────────────────────────────────────────
function _getRankPosition() {
    return RIVALS.filter(r => r.rep > gameState.reputation).length + 1;
}

// ─── STAGIONALITÀ ────────────────────────────────────────────────
function _getSeasonalMult() {
    const m = gameState.month;
    const season = SEASONAL_MULT.find(s => s.months.includes(m));
    return season || { priceMult: 1.0, rideBonus: 1.0, name: '' };
}

// ─── ACHIEVEMENTS ────────────────────────────────────────────────
function _checkAchievements() {
    if (typeof ACHIEVEMENTS === 'undefined') return;
    ACHIEVEMENTS.forEach(ach => {
        if (gameState.achievements.includes(ach.id)) return;
        if (ach.check(gameState)) {
            gameState.achievements.push(ach.id);
            showBigEvent(ach.icon, `Obiettivo Sbloccato: ${ach.name}`, ach.desc);
            logToMap(`🏅 Achievement: ${ach.name}`);
            // Flash 🏆 nav button — do NOT switch tab
            const rankBtn = document.querySelector('[data-tab="ranking"]');
            if (rankBtn && !rankBtn.classList.contains('active')) {
                rankBtn.style.filter = 'drop-shadow(0 0 10px #d4af37)';
                rankBtn.style.outline = '2px solid #d4af37';
                setTimeout(() => { rankBtn.style.filter = ''; rankBtn.style.outline = ''; }, 9000);
            }
        }
    });
}

// ─── BIG EVENT POPUP ─────────────────────────────────────────────
function showBigEvent(icon, title, body) {
    let el = document.getElementById('big-event-modal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'big-event-modal';
        el.className = 'fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center';
        el.addEventListener('click', () => el.remove());
        document.body.appendChild(el);
    }
    el.innerHTML = `
        <div class="bg-panel border border-gold/50 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center mx-4" onclick="event.stopPropagation()">
            <div class="text-5xl mb-4">${icon}</div>
            <h2 class="text-gold font-bold uppercase tracking-widest text-sm mb-3">${title}</h2>
            <p class="text-gray-300 text-[11px] leading-relaxed mb-6">${body}</p>
            <button onclick="document.getElementById('big-event-modal').remove()" class="btn-gold px-8 py-2">OK, Capito</button>
        </div>`;
    el.classList.remove('hidden');
}
window.showBigEvent = showBigEvent;

// ─── SAVE / LOAD ──────────────────────────────────────────────────
function _serializeRide(r) {
    if (!r || !r.fromPoi) return null;
    const base = {
        id: r.id, fromPoi: r.fromPoi.id, toPoi: r.toPoi.id,
        tier: r.tier, price: r.price, duration: r.duration,
        elapsed: r.elapsed || 0, driverId: r.driverId, hasIncident: r.hasIncident
    };
    if (r.isContract) {
        base.isContract      = true;
        base.routeId         = r.routeId;
        base.routeType       = r.routeType;
        base.originName      = r.originName;
        base.destinationName = r.destinationName;
        base.vehicleRequired = r.vehicleRequired;
        base.originCoords    = r.originCoords;
        base.destCoords      = r.destCoords;
        base.netCost         = r.netCost;
        // Contract POIs have synthetic IDs not present in POIS dict — save full objects
        base.fromPoiData     = r.fromPoi;
        base.toPoiData       = r.toPoi;
    }
    return base;
}
function _deserializeRide(r) {
    if (!r) return null;
    let from, to;
    if (r.isContract && r.fromPoiData && r.toPoiData) {
        from = r.fromPoiData;
        to   = r.toPoiData;
    } else {
        from = POIS[r.fromPoi];
        to   = POIS[r.toPoi];
    }
    if (!from || !to) return null;
    // Normalize legacy vehicleRequired short-IDs saved before fleet renaming
    const _VC_LEGACY_NORM = { 'mercedes_e': 'stellar_e_exec', 'mercedes_v': 'stellar_v_carr', 'mercedes_sprinter': 'stellar_v_carr', 'mercedes_s': 'stellar_s_imp' };
    const vr = r.vehicleRequired;
    const vehicleRequired = vr ? (_VC_LEGACY_NORM[vr] || vr) : vr;
    return { ...r, fromPoi: from, toPoi: to, vehicleRequired };
}

function saveGame() {
    if (typeof window.saveCurrentSlot === 'function' && window.currentSlotIndex !== null) {
        gameState.lastOnlineTimestamp = Date.now();
        window.saveCurrentSlot();
        _showSaveIndicator();
    }
}


function loadGame() {
    try {
        // Slot-aware: read from the selected slot key
        let raw = null;
        if (window.currentSlotIndex !== null) {
            const SLOT_KEYS = ['chauffeurEmpireSlot_1','chauffeurEmpireSlot_2','chauffeurEmpireSlot_3'];
            raw = localStorage.getItem(SLOT_KEYS[window.currentSlotIndex]);
        }
        // Fallback to legacy key for non-slot contexts
        if (!raw) raw = localStorage.getItem('chauffeurEmpireSave_v2');
        if (!raw) return false;
        const save = JSON.parse(raw);

        // Deserialize ride POI refs; put active rides back into pending (safe restart)
        save.pendingRides = (save.pendingRides || []).map(_deserializeRide).filter(Boolean);
        const prevActive  = (save.activeRides  || []).map(_deserializeRide).filter(Boolean);
        prevActive.forEach(r => { r.elapsed = 0; delete r.driverId; });
        save.pendingRides = [...save.pendingRides, ...prevActive];
        save.activeRides  = [];

        (save.drivers || []).forEach(d => {
            d.queue = (d.queue || []).map(_deserializeRide).filter(Boolean);
            if (d.status === 'busy') d.status = 'idle';
            if (d.fatigue  === undefined) d.fatigue  = 0;
            if (d.restHoursLeft === undefined) d.restHoursLeft = 0;
        });
        if (!save.availableRecruits) save.availableRecruits = [];
        if (!save.activeFines) save.activeFines = [];
        if (!save.achievements) save.achievements = [];
        if (!save.loans) save.loans = [];
        if (save.newGamePlusCount === undefined) save.newGamePlusCount = 0;
        if (save.fuelTank === undefined) save.fuelTank = 0;
        if (save.fuelTankCapacity === undefined) save.fuelTankCapacity = 10000;
        if (save.fuelPrice === undefined) save.fuelPrice = 1.85;
        if (save.fuelTankLevel === undefined) save.fuelTankLevel = 1;
        if (!save.seizedCars) save.seizedCars = [];
        if (save.policeHeat === undefined) save.policeHeat = 0;
        if (save.consecutiveRedDays === undefined) save.consecutiveRedDays = 0;
        if (!save.blacklistedClients) save.blacklistedClients = [];
        if (save.hqLevel === undefined) save.hqLevel = 0;
        if (save.activeDynamicEvent === undefined) save.activeDynamicEvent = null;
        if (!save.recentEventIds) save.recentEventIds = [];
        if (!save._hubNewEvent) save._hubNewEvent = false;
        if (save.activeStrike === undefined) save.activeStrike = null;
        if (save.prestige === undefined) save.prestige = 0;
        if (save.depositoGomme === undefined) save.depositoGomme = 0;
        if (!save.pricewars) save.pricewars = [];
        if (save.shadowMissionsTotal === undefined) save.shadowMissionsTotal = 0;
        // Holding finanziaria
        if (!save.stockPrices) save.stockPrices = {};
        if (!save.stockHoldings) save.stockHoldings = {};
        if (!save.stockHistory) save.stockHistory = {};
        if (!save.shortPositions) save.shortPositions = {};
        if (!save.brokerInvestments) save.brokerInvestments = [];
        if (!save.lifestyleAssets) save.lifestyleAssets = [];
        if (save.creditScore === undefined) save.creditScore = 300;
        if (save.totalDividendsEarned === undefined) save.totalDividendsEarned = 0;
        if (save.totalStockProfit === undefined) save.totalStockProfit = 0;
        if (save.diamondContractsCompleted === undefined) save.diamondContractsCompleted = 0;
        // Territory War
        if (!save.territoryInfluence)  save.territoryInfluence  = {};
        // VIP Clients
        if (!save.activeBuffs)      save.activeBuffs      = [];
        if (!save.vipCooldowns)     save.vipCooldowns     = {};
        if (save.politicalTokens === undefined) save.politicalTokens = 0;
        if (save.strataStreak    === undefined) save.strataStreak    = 0;
        if (save.watchDropCount  === undefined) save.watchDropCount  = 0;
        if (save.fuelPriceLock   === undefined) save.fuelPriceLock   = null;
        if (save.fuelPriceLockUntil === undefined) save.fuelPriceLockUntil = 0;
        // Executive Club
        if (save.tempKaskoExpiresDay === undefined) save.tempKaskoExpiresDay = 0;
        if (save.tangenteUntil       === undefined) save.tangenteUntil       = 0;
        if (save.hasPrestigiousPlate === undefined) save.hasPrestigiousPlate = false;
        if (save._permKasko          === undefined) save._permKasko = (save.investments||[]).includes('inv_kasko') && (save.tempKaskoExpiresDay||0) === 0;
        // Macro-economia
        if (save.inflationRate     === undefined) save.inflationRate     = 0.020;
        if (save.interestRateBase  === undefined) save.interestRateBase  = 0.045;
        // Lobby
        if (save.lobbyingPoints    === undefined) save.lobbyingPoints    = 0;
        if (!save.activeLobbyLaws)  save.activeLobbyLaws = [];
        // Company identity
        if (!save.companyName)       save.companyName       = 'Chauffeur Empire';
        if (!save.companyLogo)       save.companyLogo       = '👁️';
        if (!save.companyColor)      save.companyColor      = '#d4af37';
        if (!save.ventureCapital)    save.ventureCapital    = [];
        if (save.annualProfitTracker === undefined) save.annualProfitTracker = 0;
        if (save.cvWeeklyTarget    === undefined) save.cvWeeklyTarget    = 8;
        if (save.cvWeeklyCompleted === undefined) save.cvWeeklyCompleted = 0;
        if (save.cvWeeklyStreak    === undefined) save.cvWeeklyStreak    = 0;
        if (save.totalContractMargin === undefined) save.totalContractMargin = 0;
        // HQ
        if (!save.hq) save.hq = { lng: null, lat: null, name: 'Garage Periferico', level: 0, region: null };
        if (save.hq.region === undefined) save.hq.region = null;
        // Quest & Driver Coins
        if (save.driverCoins     === undefined) save.driverCoins     = save.titanCoins ?? 50;
        delete save.titanCoins;
        if (!save.questStats)    save.questStats    = { totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 };
        if (!save.constructions)   save.constructions   = [];
        if (!save.claimableQuests) save.claimableQuests = [];
        if (!save.completedQuests) save.completedQuests = [];
        if (!save.activeTrips)       save.activeTrips     = [];
        if (!save.npcMarket)         save.npcMarket       = [];
        if (save.todayEarnings === undefined) save.todayEarnings = 0;
        if (save.loginStreak    === undefined) save.loginStreak    = 0;
        if (save.lastDailyClaim === undefined) save.lastDailyClaim = 0;
        // Driver satisfaction migration
        (save.drivers || []).forEach(d => {
            if (d.satisfaction === undefined) d.satisfaction = 70;
            if (d.isOnStrike   === undefined) d.isOnStrike   = false;
        });
        // Clear stale manual outOfService on old saves
        (save.fleet || []).forEach(c => { if (c.outOfService === undefined) c.outOfService = null; });
        // Migrate drivers: add specialty if missing
        (save.drivers || []).forEach(d => {
            if (d.specialty === undefined) d.specialty = null;
        });
        // Migrate drivers: add xp/level if missing
        (save.drivers || []).forEach(d => {
            if (d.xp    === undefined) d.xp    = 0;
            if (d.level === undefined) d.level = 0;
            if (d.upgrades === undefined) d.upgrades = [];
            if (!d.skill_tree) d.skill_tree = { branch: null, unlocked: [], skill_points: 0 };
        });
        if (!save.driverObituaries) save.driverObituaries = [];
        if (!save.hqRooms) save.hqRooms = ['garage_main'];
        if (!save.hqGrid)  save.hqGrid  = { 7: 'garage_main' };
        if (!save.vipNemeses) save.vipNemeses = {};
        if (!save.corporateTenders)   save.corporateTenders   = [];
        if (!save.corporateContracts) save.corporateContracts = [];
        if (!save.tenderHistory)      save.tenderHistory      = [];
        if (save.nextTenderDay === undefined) save.nextTenderDay = (save.day || 1) + 2;
        // Migrate fleet: add fuel/mileage/tirePressure if missing
        (save.fleet || []).forEach(c => {
            if (c.fuel         === undefined) c.fuel         = 100;
            if (c.mileage      === undefined) c.mileage      = 0;
            if (c.engineHealth === undefined) c.engineHealth = 100;
            if (c.tirePressure === undefined) c.tirePressure = 100;
            if (!c.upgrades) c.upgrades = [];
            if (!c.vehicleClass) {
                const n = (c.name || '').toLowerCase();
                if (n.includes('sprinter'))
                    c.vehicleClass = 'mercedes_sprinter';
                else if (n.includes('v-class') || n.includes('v class') || n.includes('v-classe') || n.includes('minivan') || n.includes('eqv') || n.includes('viano'))
                    c.vehicleClass = 'mercedes_v';
                else if (n.includes('water taxi') || n.includes('acqueo') || n.includes('vaporetto'))
                    c.vehicleClass = 'water_taxi';
                else if (n.includes('s-class') || n.includes('s class') || n.includes('classe s') || n.includes('presidential') || n.includes('spectre'))
                    c.vehicleClass = 'mercedes_s';
                else
                    c.vehicleClass = 'mercedes_e';
            }
        });
        // Migrate fleet: remap legacy Mercedes vehicleClass → Stellar/Volt brand names & images
        const _VCLASS_REMAP = {
            'mercedes_e':        { vc: 'stellar_e_exec', re: /mercedes|^Stellar E/i, newName: 'Stellar E-Executive' },
            'mercedes_v':        { vc: 'stellar_v_carr', re: /mercedes|^Stellar V/i, newName: 'Stellar V-Carrier'   },
            'mercedes_sprinter': { vc: 'stellar_v_carr', re: /mercedes|sprinter/i,   newName: 'Stellar V-Carrier'   },
            'mercedes_s':        { vc: 'stellar_s_imp',  re: /mercedes|^Stellar S/i, newName: 'Stellar S-Imperial'  },
        };
        let _migrationApplied = false;
        (save.fleet || []).forEach(c => {
            // Migrate old CEO bugatti limited car
            if (c.id === 'ceo_bugatti') {
                c.id = 'ceo_prestige';
                c.name = 'Majestic G-Prestige CEO Edition';
                c.vehicleClass = 'majestic_spirit';
                _migrationApplied = true;
                return;
            }
            const remap = _VCLASS_REMAP[c.vehicleClass];
            if (!remap) return;
            c.vehicleClass = remap.vc;
            // Preserve "(Leasing)" suffix; strip other non-year suffixes before renaming
            const isLeasing = /\(leasing\)/i.test(c.name || '');
            const yearMatch = (c.name || '').match(/\((\d{4})\)$/);
            c.name = remap.newName + (yearMatch ? ` (${yearMatch[1]})` : '') + (isLeasing ? ' (Leasing)' : '');
            _migrationApplied = true;
        });
        // Persist migration immediately so cloud save reflects new brand names on next login
        if (_migrationApplied) {
            setTimeout(() => { if (typeof window.saveCurrentSlot === 'function') window.saveCurrentSlot(); }, 2000);
        }
        // Migrate drivers: add morale/hiredDay if missing
        (save.drivers || []).forEach(d => {
            if (d.morale    === undefined) d.morale    = 100;
            if (d.hiredDay  === undefined) d.hiredDay  = 1;
        });
        save.paused = false; // never restore a paused state
        if (save.hasEVHub === undefined) save.hasEVHub = (save.investments || []).includes('inv_ev_hub');
        Object.assign(gameState, save);

        // Normalizza i tier dei veicoli in flotta da valori legacy (uppercase/showroom)
        // ai valori attesi da TIER_COMPATIBILITY: standard, business, vip, ultra, group
        const _FLEET_TIER_MAP = {
            STANDARD:'standard', ECONOMY:'standard', PREMIUM:'business',
            BUSINESS:'business', VIP:'vip', ULTRA:'ultra',
            PRESIDENTIAL:'ultra', ARMORED:'ultra', GROUP:'group',
            HELICOPTER:'helicopter', JET:'jet', FIRST:'first',
        };
        if (Array.isArray(gameState.fleet)) {
            gameState.fleet.forEach(v => {
                if (v.tier) {
                    v.tier = _FLEET_TIER_MAP[v.tier.toUpperCase()] || v.tier.toLowerCase();
                }
            });
        }

        // Dismiss any stale VIP toast left from previous session
        document.getElementById('vip-event-toast')?.remove();
        return true;
    } catch(e) { console.error('Load failed:', e); localStorage.removeItem('chauffeurEmpireSave_v2'); return false; }
}

function _showSaveIndicator() {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    el.style.opacity = '1';
    clearTimeout(_showSaveIndicator._t);
    _showSaveIndicator._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// resetGame is defined in saveSystem.js (cloud-aware); this stub handles early calls
if (!window.resetGame) {
    window.resetGame = function() {
        if (!confirm('Reimposta il tuo Impero? Tutti i progressi verranno eliminati.')) return;
        localStorage.removeItem('chauffeurEmpireSlot_1');
        location.reload();
    };
}

// ─── TRAFFICO DINAMICO ────────────────────────────────────────────
function _getTrafficMult() {
    const h = gameState.hour;
    let mult = 1.00;
    if (h >= 7  && h <  9)  mult = 0.70;   // Rush mattutino
    else if (h >= 17 && h < 19)  mult = 0.70;   // Rush serale
    else if (h >= 22 || h <  6)  mult = 1.25;   // Notte libera
    // Real-world traffic from OpenWeatherMap (Espansione 8)
    const realMult = (gameState._realTrafficMult || 1.0);
    return mult * realMult;
}

// ─── RECLUTAMENTO ─────────────────────────────────────────────────
function _generateRecruit() {
    const hired = new Set(gameState.drivers.map(d => d.name));
    const avail = new Set((gameState.availableRecruits || []).map(r => r.name));
    const pool = DRIVER_POOL.filter(p => !hired.has(p.name) && !avail.has(p.name));
    if (pool.length === 0) return null;
    const p = pool[Math.floor(Math.random() * pool.length)];
    const salaryVariance = Math.round((Math.random() - 0.5) * 4) * 50;
    const trait = DRIVER_TRAITS[Math.floor(Math.random() * DRIVER_TRAITS.length)];
    return {
        name: p.name, tier: p.tier, salary: p.salary + salaryVariance, trait,
        skill_efficiency: 20 + Math.floor(Math.random() * 61),
        skill_charisma:   20 + Math.floor(Math.random() * 61),
        skill_speed:      20 + Math.floor(Math.random() * 61),
        stress_level: 0, burnout_until: null,
    };
}

function _refreshRecruits() {
    if (!gameState.availableRecruits) gameState.availableRecruits = [];
    while (gameState.availableRecruits.length < 3) {
        const r = _generateRecruit();
        if (!r) break;
        gameState.availableRecruits.push(r);
    }
}

function _generateLegendaryRecruit() {
    const legendaryNames = ['Marco Bellini', 'Sofia Russo', 'Luca Ferrari', 'Elena Martini', 'Andrea Ricci'];
    const usedNames = new Set([...gameState.drivers.map(d => d.name), ...(gameState.availableRecruits||[]).map(r => r.name)]);
    const name = legendaryNames.find(n => !usedNames.has(n));
    if (!name) return;
    const legDriver = {
        name, tier: 'ultra', salary: 7500,
        trait: { id:'leggendario', name:'⭐ Leggendario', desc:'Tutte le skill al massimo. Burnout impossibile.', tipMult:1.5, speedMult:1.3, fatigueMult:0.3, vipTipMult:2.0, condMult:0.3 },
        skill_efficiency: 90 + Math.floor(Math.random() * 11),
        skill_charisma:   90 + Math.floor(Math.random() * 11),
        skill_speed:      90 + Math.floor(Math.random() * 11),
        stress_level: 0, burnout_until: null,
        isLegendary: true,
    };
    if (!gameState.availableRecruits) gameState.availableRecruits = [];
    gameState.availableRecruits.push(legDriver);
    showBigEvent('⭐', 'Driver Leggendario Disponibile!', `${name} — leggenda del NCC — è sul mercato. Skill ai massimi livelli. Assumi subito prima che scompaia!`);
    logToMap(`⭐ LEGGENDARIO: ${name} nel mercato reclutamento!`);
}

const _NPC_MARKET_CARS = [
    { name:'Stellar E-Executive 2021', tier:'business', vehicleClass:'stellar_e_exec', basePrice:22000, condRange:[40,75] },
    { name:'Stellar V-Carrier 2020',   tier:'business', vehicleClass:'stellar_v_carr', basePrice:38000, condRange:[50,80] },
    { name:'Volt 3-Urban 2022',        tier:'business', vehicleClass:'volt_3_urban',   basePrice:28000, condRange:[60,90] },
    { name:'Stellar V-Carrier 2022',   tier:'vip',      vehicleClass:'stellar_v_carr', basePrice:68000, condRange:[55,85] },
    { name:'Stellar S-Imperial 2019',  tier:'vip',      vehicleClass:'stellar_s_imp',  basePrice:92000, condRange:[35,70] },
    { name:'Stellar Q-Executive 2022', tier:'business', vehicleClass:'stellar_q_exec', basePrice:55000, condRange:[65,95] },
];

function _refreshNpcMarket() {
    gameState.npcMarket = _NPC_MARKET_CARS.slice().sort(() => Math.random()-0.5).slice(0,3).map((tmpl, i) => {
        const cond = tmpl.condRange[0] + Math.floor(Math.random() * (tmpl.condRange[1] - tmpl.condRange[0]));
        const mileage = Math.floor(Math.random() * 150000);
        const price = Math.round(tmpl.basePrice * (cond / 100) * (1 - mileage/500000));
        return { id: 'npc_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + i, name: tmpl.name, tier: tmpl.tier, vehicleClass: tmpl.vehicleClass, condition: cond, mileage, price };
    });
    logToMap('🚗 Mercato auto: nuovi veicoli disponibili!');
}

const _RARE_AUCTION_CARS = [
    { name:'Majestic Spirit Presidential',   tier:'ultra', vehicleClass:'majestic_spirit', minBid:250000 },
    { name:'Majestic Phantom Prestige',       tier:'ultra', vehicleClass:'majestic_spirit', minBid:480000 },
    { name:'Stellar G-Overlord Blindato',     tier:'ultra', vehicleClass:'stellar_g_over',  minBid:750000 },
    { name:'Stellar S-Imperial Blindata',     tier:'vip',   vehicleClass:'stellar_s_imp',   minBid:180000 },
    { name:'Majestic Executive Supreme',      tier:'ultra', vehicleClass:'majestic_spirit', minBid:320000 },
];

function _maybeStartAuction() {
    if (gameState.activeAuction) return;
    if (Math.random() > 0.15) return; // 15% chance per daily tick
    const tmpl = _RARE_AUCTION_CARS[Math.floor(Math.random() * _RARE_AUCTION_CARS.length)];
    gameState.activeAuction = {
        id: 'auc_' + Date.now(),
        name: tmpl.name, tier: tmpl.tier, vehicleClass: tmpl.vehicleClass,
        minBid: tmpl.minBid, currentBid: tmpl.minBid,
        endsHour: gameState.day * 24 + gameState.hour + 24,
        playerBid: null,
    };
    showBigEvent('🔨', 'Asta Live!', `${tmpl.name} è all'asta! Offerta base: €${tmpl.minBid.toLocaleString()}. Hai 24 ore per aggiudicarti il veicolo.`);
    logToMap(`🔨 ASTA: ${tmpl.name} — offerta base €${tmpl.minBid.toLocaleString()}`);
    if (typeof renderTabMarket === 'function') renderTabMarket();
}

function _resolveAuction() {
    const auc = gameState.activeAuction;
    if (!auc) return;
    if (auc.playerBid && auc.playerBid >= auc.currentBid) {
        // Player wins
        const newCar = {
            id: 'c_' + Date.now(), name: auc.name, tier: auc.tier, vehicleClass: auc.vehicleClass,
            condition: 100, isLease: false, fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100, outOfService: null, upgrades: [],
        };
        gameState.fleet.push(newCar);
        showBigEvent('🏆', 'Asta Vinta!', `${auc.name} è tua! Aggiudicata per €${auc.currentBid.toLocaleString()}. Trovala in Flotta.`);
        logToMap(`🏆 ASTA VINTA: ${auc.name} a €${auc.currentBid.toLocaleString()}`);
    } else {
        // Refund reserved bid if player had bid
        if (auc.playerBid) {
            gameState.cash += auc.playerBid;
            showNotification(`Asta: ${auc.name} vinta da un concorrente. Rimborso €${auc.playerBid.toLocaleString()}.`, 'error');
        } else {
            showNotification(`Asta: ${auc.name} vinta da un concorrente.`, 'error');
        }
        logToMap(`🔨 Asta terminata: ${auc.name} aggiudicata da un rivale a €${auc.currentBid.toLocaleString()}`);
    }
    gameState.activeAuction = null;
    if (typeof renderTabMarket === 'function') renderTabMarket();
}

function _kickstartIdleDrivers() {
    gameState.drivers.forEach(driver => {
        if (driver.status === 'idle' && driver.queue.length > 0) startNextRide(driver);
    });
}

let _gameIntervals = [];

function initGame(fresh = true) {
    // Clear any existing intervals to prevent stacking if initGame is called twice
    _gameIntervals.forEach(clearInterval);
    _gameIntervals = [];
    if (fresh) {
        gameState.drivers.push({ id: 'ceo', name: 'Tu (CEO)', status: 'idle', assignedCarId: 'c_loaner', queue: [], fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100, upgrades: [], hiredDay: 1, skill_efficiency: 50, skill_charisma: 50, skill_speed: 50, stress_level: 0, burnout_until: null });
        gameState.fleet.push({ id: 'c_loaner', name: 'Stellar E-Executive', tier: 'standard', condition: 100, isLease: true, dailyCost: 40, leaseDuration: 12, leaseElapsedDays: 0, fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100, upgrades: [], vehicleClass: 'stellar_e_exec' });
        _refreshRecruits();
    } else {
        // Pre-sync clock and process offline income before intervals start (prevents false hourly/daily triggers)
        const _itaInit = _getItalyTime();
        gameState.hour   = _itaInit.hour;
        gameState.minute = _itaInit.minute;
        gameState.month  = _itaInit.month;
        // Offline catchup: advance day counter toward today, process daily routines for each missed day (capped at 7)
        const _offlineDays = Math.min(7, Math.max(0, _itaInit.gameDay - (gameState.day || _itaInit.gameDay)));
        for (let i = 0; i < _offlineDays; i++) { gameState.day++; processDailyRoutines(); }
        gameState.day = _itaInit.gameDay; // final snap to canonical real day
        if (_offlineDays >= 1) {
            setTimeout(() => {
                if (typeof showNotification === 'function') showNotification(`💤 Offline per ${_offlineDays} giorno${_offlineDays > 1 ? 'i' : ''} — redditi processati.`, 'info');
            }, 1200);
        }
        _refreshRecruits();
        setTimeout(_kickstartIdleDrivers, 500);
        setTimeout(_applyWeatherOverlay, 800);
        setTimeout(checkActiveTrips, 200); // resolve any trips that completed while offline
        // Redraw map with saved unlocked regions
        setTimeout(() => {
            if (typeof drawHighways === 'function') drawHighways();
            if (typeof drawPOIs === 'function') drawPOIs();
        }, 400);
    }

    _initStockPrices();
    _applyBrandColor();

    // Sync hqLevel from investments before UI renders — don't wait for first gameLoop tick
    if (typeof hasInvestment === 'function') {
        if (hasInvestment('inv_tower') || hasInvestment('inv_hq_campus')) {
            gameState.hqLevel = 3; if (gameState.hq) gameState.hq.level = 3;
        } else if (hasInvestment('inv_hq_office')) {
            gameState.hqLevel = 2; if (gameState.hq) gameState.hq.level = 2;
        }
    }

    _gameIntervals.push(
        setInterval(gameLoop, 600),
        setInterval(generatePOIRide, 5 * 60 * 1000),      // every 5 min real time
        setInterval(generateContractRide, 8 * 60 * 1000),  // every 8 min real time
        setInterval(generateEmailEvent, 40000),
        setInterval(generateWorldNews, 60000),
        setInterval(_maybeGenerateFine, 90000),
        setInterval(_maybeGenerateZTLFine, 45000),
        setInterval(_maybePoliceCheckpoint, 50000),
        setInterval(_maybeParazziEvent, 35000),
        setInterval(_maybeGreyMarketMission, 120000),
        setInterval(_maybeShadowMission, 150000),
        setInterval(_maybeGenerateDynamicEvent, 180000),
        setInterval(_maybeDiamondContract, 240000),
        setInterval(() => { if (typeof checkActiveTrips === 'function') checkActiveTrips(); }, 5000),
        // VIP Clients
        setInterval(() => { if (typeof window._maybeVipGrigori  === 'function') window._maybeVipGrigori();  }, 180000),
        setInterval(() => { if (typeof window._maybeVipStrata   === 'function') window._maybeVipStrata();   }, 90000),
        setInterval(() => { if (typeof window._maybeVipPlatinum === 'function') window._maybeVipPlatinum(); }, 120000),
        setInterval(() => { if (typeof window._maybeVipOnorevole=== 'function') window._maybeVipOnorevole();}, 150000),
        setInterval(() => { if (typeof window._maybeVipEmiro    === 'function') window._maybeVipEmiro();    }, 240000),
        setInterval(() => { if (typeof window._maybeVipGolden   === 'function') window._maybeVipGolden();   }, 150000),
        setInterval(() => { if (typeof window._maybeVipTechBro  === 'function') window._maybeVipTechBro();  }, 120000),
        setInterval(() => { if (typeof window._maybeVipGarante  === 'function') window._maybeVipGarante();  }, 240000),
        setInterval(() => { if (typeof window._maybeVipWedding  === 'function') window._maybeVipWedding();  }, 200000),
        setInterval(() => { if (typeof window._maybeVipErede    === 'function') window._maybeVipErede();    }, 120000)
    );

    updateUI();
}

// ─── REAL-TIME ITALY CLOCK ────────────────────────────────────────
const GAME_EPOCH_MS = new Date('2025-11-01T00:00:00+01:00').getTime();

function _getItalyTime() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    return {
        hour:    parseInt(parts.hour,   10),
        minute:  parseInt(parts.minute, 10),
        day:     parseInt(parts.day,    10),
        month:   parseInt(parts.month,  10),
        year:    parseInt(parts.year,   10),
        gameDay: Math.max(1, Math.floor((Date.now() - GAME_EPOCH_MS) / 86400000) + 1),
    };
}

function gameLoop() {
    if (gameState.paused) return;

    const _ita      = _getItalyTime();
    const _prevHour = gameState.hour;
    const _prevDay  = gameState.day;
    const _prevMin  = gameState.minute;

    // Sync game time to Italian real time
    gameState.hour   = _ita.hour;
    gameState.minute = _ita.minute;
    gameState.month  = _ita.month;
    gameState.day    = _ita.gameDay;   // monotonically increasing day counter

    // Hourly mechanics — fire only when real Italian hour changes
    if (gameState.hour !== _prevHour) {
        gameState.energy = Math.max(0, gameState.energy - 5);   // 5% per real hour
        _tickFatigue();
        _tickWeather();
        _tickEmails();
        _tickFuelPrice();
        _tickDynamicEvent();
        _maybeStrike();
        _checkPrestige();
        autoNegotiateEmails();
        if (typeof window._nemesisTick === 'function') window._nemesisTick();
        if (typeof window.CE_Alert !== 'undefined') window.CE_Alert.tick();
        _tickStockMarket();
        _tickBrokerInvestments();
        _payStockDividends();
        _updateCreditScore();
        if (hasInvestment('inv_app')) { generatePOIRide(); generatePOIRide(); }
        if (hasInvestment('inv_hangar')) generatePOIRide('ultra');
        // Talent Scout: refresh pool every 3 real hours
        if (gameState.staff.some(s => s.id === 'talent_scout') && _ita.hour % 3 === 0) {
            _refreshRecruits();
        }
        // Stagionalità: genera corse extra nelle alte stagioni
        const season = _getSeasonalMult();
        if (season.rideBonus > 1.0 && Math.random() < (season.rideBonus - 1.0) * 2) generatePOIRide();
        // Active campaigns: apply volumeBonus/prestigeBonus to ride spawn
        const _acList = gameState.activeCampaigns || [];
        _acList.forEach(ac => {
            const _camp = MARKETING_CAMPAIGNS.find(c => c.id === ac.id);
            if (!_camp) return;
            if (_camp.volumeBonus > 0 && Math.random() < _camp.volumeBonus) generatePOIRide();
            if (_camp.prestigeBonus > 0 && Math.random() < _camp.prestigeBonus * 0.5) generatePOIRide('vip');
        });
        // Brand Volume threshold → extra standard rides
        const _bv = gameState.brandVolume || 0;
        const _bp = gameState.brandPrestige || 0;
        if (_bv >= 75 && Math.random() < 0.30) generatePOIRide();
        else if (_bv >= 50 && Math.random() < 0.18) generatePOIRide();
        else if (_bv >= 25 && Math.random() < 0.08) generatePOIRide();
        // Brand Prestige threshold → extra VIP rides
        if (_bp >= 75 && Math.random() < 0.40) generatePOIRide('vip');
        else if (_bp >= 50 && Math.random() < 0.25) generatePOIRide('vip');
        else if (_bp >= 25 && Math.random() < 0.10) generatePOIRide('vip');
    }

    // Rival AI tick — only when minute changes to a 15-min boundary (prevents multi-fire)
    if (gameState.minute !== _prevMin && gameState.minute % 15 === 0) _tickRivalsActive();

    // Daily mechanics — fire only when game day counter increments
    if (gameState.day !== _prevDay) {
        processDailyRoutines();
    }

    autoDispatchRides();
    _kickstartIdleDrivers();

    // Visual trip simulation loop (also triggers VIP events and deferred-pay earnings)
    for (let i = gameState.activeRides.length - 1; i >= 0; i--) {
        let ride = gameState.activeRides[i];

        // Traffic system: 5% chance to enter heavy traffic (once per ride)
        if (!ride._trafficChecked && Math.random() < 0.05) {
            ride._trafficChecked = true;
            ride.inTraffic = true;
            ride._trafficClearsAt = ride.elapsed + Math.floor(ride.duration * 0.4);
            if (typeof showNotification === 'function') showNotification(`🚦 Traffico intenso verso ${ride.toPoi?.name || '?'}! Rallentamento previsto.`, 'error');
            logToMap(`🚦 Traffico: ${ride.toPoi?.name || ''} — velocità dimezzata.`);
        }
        // Clear traffic after its window
        if (ride.inTraffic && ride.elapsed >= (ride._trafficClearsAt || 0)) {
            ride.inTraffic = false;
            logToMap(`✅ Traffico risolto: ${ride.toPoi?.name || ''} — corsa ripresa.`);
        }

        // VIP/Ultra mid-ride event (10% chance, once per ride, only when not paused)
        if (!ride._vipEventChecked && (ride.tier === 'vip' || ride.tier === 'ultra') && Math.random() < 0.10 && !gameState.paused) {
            ride._vipEventChecked = true;
            if (ride.elapsed > ride.duration * 0.15) {
                _triggerVIPMidRideEvent(ride);
            }
        }

        ride.elapsed += ride.inTraffic ? 2500 : 5000;
        if (ride.elapsed >= ride.duration) {
            completeRide(ride, true); // earnings deferred to checkActiveTrips
            gameState.activeRides.splice(i, 1);
        }
    }

    // Day/night cycle update
    if (typeof _updateDayNight === 'function') _updateDayNight();
    updateUI();
}

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

    gameState.drivers.forEach(driver => {
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

// ─── MARKETING ────────────────────────────────────────────────────
window.activateCampaign = function(id) {
    const camp = MARKETING_CAMPAIGNS.find(c => c.id === id);
    if (!camp) return;
    if (gameState.activeCampaign === id) return;
    gameState.activeCampaign = id;
    logToMap(`📣 Campagna attivata: ${camp.name}`);
    if(typeof showNotification==='function') showNotification(`Campagna "${camp.name}" attivata!`, 'success');
    if(typeof renderTabMarketing==='function') renderTabMarketing();
};

window.deactivateCampaign = function() {
    if (!gameState.activeCampaign) return;
    gameState.activeCampaign = null;
    logToMap('📣 Campagna marketing disattivata.');
    if(typeof showNotification==='function') showNotification('Campagna disattivata.', 'success');
    if(typeof renderTabMarketing==='function') renderTabMarketing();
};

// ─── LOG E WORLD NEWS ───
function logToMap(msg) {
    const logContainer = document.getElementById('map-log');
    if(!logContainer) return;
    const entry = document.createElement('div');
    entry.className = "border-b border-white/5 pb-1 mb-1 text-[9px] text-gray-300";
    entry.innerText = `[${String(gameState.hour).padStart(2,'0')}:${String(gameState.minute).padStart(2,'0')}] ${msg}`;
    logContainer.prepend(entry);
    if(logContainer.children.length > 15) logContainer.lastChild.remove();
}

function generateWorldNews() {
    if(Math.random() > 0.5) {
        const news = WORLD_NEWS[Math.floor(Math.random() * WORLD_NEWS.length)];
        window._lastNewsForStocks = news; // feed to stock market sentiment
        logToMap(`🌍 NEWS: ${news}`);
    }
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

// ─── DRIVER XP & LEVELS ──────────────────────────────────────────
function _checkDriverLevel(driver) {
    const levels = DRIVER_LEVELS;
    for (let i = levels.length - 1; i >= 0; i--) {
        if (driver.xp >= levels[i].xpMin) {
            if (driver.level !== i) {
                driver.level = i;
                const lvl = levels[i];
                logToMap(`⭐ ${driver.name} ha raggiunto il livello ${lvl.name}!`);
                showBigEvent('⭐', `${driver.name} — Livello ${lvl.name}!`, `${driver.name} ha guadagnato abbastanza esperienza. Bonus permanenti: +${Math.round((lvl.tipBonus-1)*100)}% mance, −${Math.round((1-lvl.fatigueBonus)*100)}% fatica.`);
                if (i > 0 && typeof window.driverAwardSkillPoint === 'function') window.driverAwardSkillPoint(driver);
            }
            return;
        }
    }
}

// ─── REPUTAZIONE 2.0 ─────────────────────────────────────────────
function _getPrestige() { return Math.max(0, +(gameState.reputation - 5.0).toFixed(2)); }

function _getLoanInterestRate() {
    const base = gameState.interestRateBase || 0.045;
    const score = gameState.creditScore || 600;
    // Credit score adjusts spread around BCE base rate
    if (score >= 750) return +(base - 0.005).toFixed(3);
    if (score >= 650) return +(base + 0.005).toFixed(3);
    if (score >= 550) return +(base + 0.020).toFixed(3);
    if (score >= 450) return +(base + 0.045).toFixed(3);
    return +(base + 0.080).toFixed(3);
}

function _checkPrestige() {
    if (gameState.reputation >= 5.0 && gameState.prestige === 0) {
        gameState.prestige = 0.01;
        showBigEvent('👑', 'PRESTIGIO SBLOCCATO!', 'Hai raggiunto la massima reputazione. Da ora ogni punto extra entra nel Registro del Prestigio, aumentando il valore dell\'azienda e sbloccando clienti irraggiungibili.');
        logToMap('👑 PRESTIGIO: soglia 5★ superata. Valore aziendale in crescita.');
    }
    if (gameState.reputation > 5.0) {
        gameState.prestige = +(gameState.reputation - 5.0).toFixed(2);
        gameState.reputation = 5.0;
    }
}

// ─── VIP MID-RIDE EVENTS ─────────────────────────────────────────
const VIP_EVENTS = [
    { icon:'🌹', title:'Richiesta VIP Improvvisa', body:'Il cliente vuole che l\'autista devii per comprare 100 rose rosse prima dell\'hotel.', costA:500, repA:0.2, repB:-0.3, labelA:'Accontentalo (−€500, +0.2★)', labelB:'Rifiuta (+0, −0.3★)' },
    { icon:'🍾', title:'Sosta Champagne', body:'Il passeggero insiste per fermarsi all\'Enoteca di lusso sul percorso. La sosta ritarderà la corsa di 30 minuti.', costA:300, repA:0.15, repB:-0.2, labelA:'Concedi la sosta (−€300, +0.15★)', labelB:'Prosegui dritto (−0.2★)' },
    { icon:'📸', title:'Paparazzi in Agguato', body:'Un fotografo ha riconosciuto il passeggero. Vuole che l\'autista acceleri e cambi rotta.', costA:0, repA:0.25, repB:-0.1, labelA:'Rotta alternativa (+0.25★)', labelB:'Ignora (−0.1★)' },
    { icon:'📞', title:'Chiamata Riservata', body:'Il passeggero chiede discrezione assoluta — nessuna registrazione GPS per questo tratto.', costA:0, repA:0.1, repB:-0.15, labelA:'Rispetta la privacy (+0.1★)', labelB:'Rifiuta (−0.15★)' },
    { icon:'🐕', title:'Cane di Razza a Bordo', body:'Il VIP vuole portare il suo Cavalier King Charles sull\'auto. Ha previsto questo dal contratto.', costA:200, repA:0.1, repB:-0.25, labelA:'Ok, pulizia extra (−€200, +0.1★)', labelB:'No animali (−0.25★)' },
];

function _triggerVIPMidRideEvent(ride) {
    const ev = VIP_EVENTS[Math.floor(Math.random() * VIP_EVENTS.length)];
    const driver = gameState.drivers.find(d => d.id === ride.driverId);
    const dname = driver ? driver.name : 'l\'autista';
    const AUTO_MS = 30000;

    // One VIP toast at a time — dismiss any previous one silently
    const prev = document.getElementById('vip-event-toast');
    if (prev) prev.remove();

    const toast = document.createElement('div');
    toast.id = 'vip-event-toast';
    toast.style.cssText = [
        'position:fixed;bottom:24px;right:24px;z-index:500;width:300px',
        'background:rgba(8,8,20,0.97);border:1px solid rgba(212,175,55,0.45)',
        'border-radius:16px;padding:16px 18px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
        "font-family:'Roboto Mono',monospace",
        'animation:vip-toast-in 0.28s cubic-bezier(0.34,1.56,0.64,1)',
    ].join(';');

    toast.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
            <span style="font-size:22px;line-height:1">${ev.icon}</span>
            <div style="flex:1;min-width:0">
                <div style="font-size:7px;color:#d4af37;text-transform:uppercase;letter-spacing:2px;margin-bottom:2px">Mid-Corsa · ${ride.toPoi?.name || ''}</div>
                <div style="font-size:11px;font-weight:700;color:#fff;line-height:1.2">${ev.title}</div>
            </div>
            <span id="vip-toast-sec" style="font-size:10px;color:#6b7280;flex-shrink:0">30</span>
        </div>
        <p style="font-size:9px;color:#9ca3af;line-height:1.5;margin:0 0 10px">${ev.body}
            <span style="display:block;margin-top:4px;color:#6b7280;font-size:8px">${dname} attende istruzioni.</span>
        </p>
        <div style="height:2px;background:rgba(255,255,255,0.08);border-radius:2px;margin-bottom:10px;overflow:hidden">
            <div id="vip-toast-bar" style="height:100%;background:#d4af37;width:100%"></div>
        </div>
        <div style="display:flex;gap:8px">
            <button id="vip-toast-a" style="flex:1;padding:8px 4px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.4);border-radius:8px;color:#d4af37;font-size:8px;font-weight:700;cursor:pointer;line-height:1.3">${ev.labelA}</button>
            <button id="vip-toast-b" style="flex:1;padding:8px 4px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:#ef4444;font-size:8px;font-weight:700;cursor:pointer;line-height:1.3">${ev.labelB}</button>
        </div>`;
    document.body.appendChild(toast);

    // Shrink countdown bar smoothly
    const bar = document.getElementById('vip-toast-bar');
    if (bar) {
        bar.style.transition = `width ${AUTO_MS}ms linear`;
        requestAnimationFrame(() => { bar.style.width = '0%'; });
    }

    let _done = false;
    const resolve = (choice) => {
        if (_done) return;
        _done = true;
        clearInterval(_ticker);
        toast.style.animation = 'vip-toast-out 0.2s ease-in forwards';
        setTimeout(() => toast.remove(), 200);

        if (choice === 'A') {
            if (ev.costA) gameState.cash -= ev.costA;
            gameState.reputation = Math.min(5.0 + (gameState.prestige || 0), gameState.reputation + ev.repA);
            logToMap(`${ev.icon} Evento VIP: accontentato → +${ev.repA}★${ev.costA ? ` −€${ev.costA}` : ''}`);
            if (typeof showNotification === 'function') showNotification(`${ev.icon} Richiesta accontentata! +${ev.repA}★`, 'success');
        } else {
            gameState.reputation = Math.max(0, gameState.reputation + ev.repB);
            logToMap(`${ev.icon} Evento VIP: rifiutato → ${ev.repB}★`);
            if (choice !== 'AUTO' && typeof showNotification === 'function')
                showNotification(`${ev.icon} Richiesta rifiutata. ${ev.repB}★`, 'error');
        }
        updateUI(); saveGame();
    };

    const _btnA = document.getElementById('vip-toast-a');
    const _btnB = document.getElementById('vip-toast-b');
    if (_btnA) _btnA.onclick = () => resolve('A');
    if (_btnB) _btnB.onclick = () => resolve('B');

    let secsLeft = Math.round(AUTO_MS / 1000);
    const _ticker = setInterval(() => {
        secsLeft--;
        const el = document.getElementById('vip-toast-sec');
        if (el) el.textContent = secsLeft;
        if (secsLeft <= 0) resolve('AUTO');
    }, 1000);
}

// ─── CLIENT BLACKLIST ─────────────────────────────────────────────
window.toggleBlacklist = function(poiId) {
    if (!gameState.blacklistedClients) gameState.blacklistedClients = [];
    const idx = gameState.blacklistedClients.indexOf(poiId);
    if (idx > -1) {
        gameState.blacklistedClients.splice(idx, 1);
        showNotification(`✅ ${POIS[poiId]?.name || poiId} rimosso dalla blacklist.`, 'success');
    } else {
        gameState.blacklistedClients.push(poiId);
        showNotification(`🚫 ${POIS[poiId]?.name || poiId} aggiunto alla blacklist.`, 'error');
    }
    saveGame();
};

// ─── HQ LEVEL ────────────────────────────────────────────────────
function _getMaxStaff() {
    if (typeof HQ_LEVELS === 'undefined') return 2;
    const lvl = HQ_LEVELS.find(l => l.level === (gameState.hqLevel || 0));
    return lvl ? lvl.maxStaff : 2;
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

    car.outOfService = outReason || null;
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

window.payFine = function(fineId) {
    const fine = (gameState.activeFines || []).find(f => f.id === fineId);
    if (!fine || fine.status !== 'pending') return;
    if (gameState.cash < fine.amount) { showNotification('Fondi insufficienti!', 'error'); return; }
    gameState.cash -= fine.amount;
    fine.status = 'paid';
    logToMap(`💸 Multa pagata: €${fine.amount}`);
    showNotification(`Multa pagata: −€${fine.amount}`, 'error');
    updateUI(); saveGame();
    if (typeof renderTabLegal === 'function') renderTabLegal();
};

window.contestFine = function(fineId) {
    const fine = (gameState.activeFines || []).find(f => f.id === fineId);
    if (!fine || fine.status !== 'pending') return;
    const hasLegal = gameState.staff.some(s => s.id === 'legal');
    const successChance = hasLegal ? 0.70 : 0.35;
    if (Math.random() < successChance) {
        fine.status = 'contested_won';
        logToMap(`⚖️ Ricorso vinto: multa di €${fine.amount} annullata!`);
        showNotification('Ricorso vinto! Multa annullata.', 'success');
    } else {
        const penalty = Math.floor(fine.amount * 0.30);
        fine.amount += penalty;
        fine.status = 'contested_lost';
        logToMap(`❌ Ricorso perso: multa aumentata di €${penalty}`);
        showNotification(`Ricorso perso. Multa +€${penalty}`, 'error');
    }
    updateUI(); saveGame();
    if (typeof renderTabLegal === 'function') renderTabLegal();
};

// ─── SHADOW MISSIONS ─────────────────────────────────────────────

function _maybeShadowMission() {
    if (!hasInvestment('inv_grey_market')) return; // richiede canali discreti
    if (Math.random() > 0.12) return;
    // Solo una shadow per volta
    if (gameState.emails.some(e => e.status === 'unread' && e.type === 'shadow')) return;

    const available = Object.values(POIS).filter(p =>
        gameState.unlockedRegions.includes(p.region) && p.type !== 'locked'
    );
    if (available.length < 2) return;
    let from = available[Math.floor(Math.random() * available.length)];
    const _filteredTo = available.filter(p => p.region !== from.region);
    let to   = _filteredTo[Math.floor(Math.random() * _filteredTo.length)];
    if (!to) return;

    const basePrice  = Math.floor(from.baseFlat * 5.0 * (2.5 + Math.random()));
    const seizureRisk = Math.round(55 + (gameState.policeHeat / 100) * 30); // 55–85%

    const _shadowEmail = {
        id: gameState.nextId++,
        sender: '🔴 NETWORK OMBRA',
        subject: `[SHADOW] Trasporto X5: ${from.name} → ${to.name} — €${basePrice.toLocaleString()}`,
        type: 'shadow', status: 'unread',
        shadowData: { fromId: from.id, toId: to.id, price: basePrice, seizureRisk },
        expiresAt: gameState.day * 24 + gameState.hour + 4
    };
    _applyEmailTemplate(_shadowEmail, 'shadow', { rivalName: 'Rete Ombra' });
    gameState.emails.push(_shadowEmail);
    const dot = document.getElementById('mail-dot');
    if (dot) dot.classList.remove('hidden');
    logToMap(`🔴 Rete Ombra: ${from.name} → ${to.name} — €${basePrice.toLocaleString()} (×5). Rischio sequestro ${seizureRisk}%.`);
}

window.acceptShadowMission = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email || email.type !== 'shadow') return;
    const { fromId, toId, price, seizureRisk } = email.shadowData;
    const from = POIS[fromId], to = POIS[toId];
    if (!from || !to) return;

    const ride = {
        id: gameState.nextId++, fromPoi: from, toPoi: to,
        tier: 'ultra', price, duration: 50000, elapsed: 0,
        isShadowMission: true, seizureRisk
    };
    gameState.pendingRides.push(ride);
    email.status = 'resolved';
    gameState.policeHeat = Math.min(100, (gameState.policeHeat || 0) + 10);
    logToMap(`🔴 SHADOW: ${from.name} → ${to.name} — €${price.toLocaleString()}. Checkpoint sulla rotta!`);
    showNotification(`🔴 Shadow mission accettata! ⚠️ Checkpoint della polizia sulla rotta — operazione ad alto rischio!`, 'error');
    // Spawna checkpoint marker — ritarda di 300ms per dare tempo alla mappa di essere pronta
    const _cpLat = (from.lat + to.lat) / 2 + (Math.random() - 0.5) * 0.5;
    const _cpLng = (from.lng + to.lng) / 2 + (Math.random() - 0.5) * 0.5;
    const _cpRideId = ride.id;
    setTimeout(() => {
        if (typeof addCheckpointMarker === 'function') addCheckpointMarker(_cpLat, _cpLng, _cpRideId);
    }, 300);
    if (typeof renderTabEmails === 'function') renderTabEmails();
    if (_tabIs('corse') && typeof renderTabCorse === 'function') renderTabCorse();
    saveGame();
};

// ─── PRICE WAR / ATTACK TERRITORY ────────────────────────────────

window.attackTerritory = function(regionId) {
    const region = REGIONS[regionId];
    if (!region) return;
    if (!gameState.unlockedRegions.includes(regionId)) {
        showNotification('Regione non ancora sbloccata!', 'error'); return;
    }
    if ((gameState.pricewars || []).some(pw => pw.regionId === regionId)) {
        showNotification('Guerra prezzi già attiva in questa regione!', 'error'); return;
    }

    const warCost = Math.floor(region.price * 0.25 + 15000); // 25% del costo licenza + €15k
    if (gameState.cash < warCost) {
        showNotification(`Fondi insufficienti! Serve €${warCost.toLocaleString()} per la guerra dei prezzi.`, 'error'); return;
    }

    gameState.cash -= warCost;
    const warDays = 3;
    gameState.pricewars.push({
        regionId,
        endsDay: gameState.day + warDays,
        monopolyEndsDay: null,
        discountPct: 0.30 // prezzi -30% per strappare clienti
    });

    // Colpisci i rivali in quella regione: perdono cash e rep
    const rivals_hit = RIVALS.filter(r => Math.random() < 0.7); // 70% dei rivali sentono la pressione
    rivals_hit.forEach(r => {
        _ensureRivalState(r);
        r.cash = Math.max(1000, r.cash - (warCost * 0.3 * Math.random()));
        r.rep  = Math.max(0.1,  r.rep  * (0.92 + Math.random() * 0.05));
    });

    showBigEvent('⚔️', `Guerra Prezzi: ${region.name}!`,
        `−€${warCost.toLocaleString()} investiti. Tariffe -30% in ${region.name} per ${warDays} giorni. I rivali perdono clienti. Se crollano sotto 0.3★ ottieni il MONOPOLIO.`);
    logToMap(`⚔️ Attacco territorio: ${region.name} — war cost €${warCost.toLocaleString()}. ${rivals_hit.length} rivali colpiti.`);
    updateUI(); saveGame();
};

// Gestione risposta email di poaching
window.respondPoaching = function(emailId, accept) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email || email.type !== 'poaching') return;
    email.status = 'resolved';
    if (accept) {
        // Pareggia l'offerta — costo mensile extra
        const driver = gameState.drivers.find(d => d.id === email.driverId);
        if (driver) {
            driver.salary = email.counterOffer;
            showNotification(`✅ Offerta pareggiata! ${email.driverName} rimane con te a €${email.counterOffer}/mese.`, 'success');
            logToMap(`💼 Counter-offer accettata: ${email.driverName} riconfermato a €${email.counterOffer}/mese.`);
        }
    } else {
        // Il driver parte
        const idx = gameState.drivers.findIndex(d => d.id === email.driverId);
        if (idx > -1) {
            gameState.drivers.splice(idx, 1);
            showBigEvent('💔', `${email.driverName} se ne va`, `${email.rivalName} ha vinto con €${email.counterOffer}/mese.`);
            logToMap(`💼 ${email.driverName} ha accettato l'offerta di ${email.rivalName}.`);
        }
    }
    updateUI(); saveGame();
    if (typeof renderTabEmails === 'function') renderTabEmails();
};

function processDailyRoutines() {
    const _closingDay = gameState.day - 1 || 30; // day that just ended (day was already incremented)
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

    let baseTax = gameState.staff.some(s => s.id === 'admin') ? 0.24 : 0.42;
    if ((gameState.activeLobbyLaws || []).includes('law_tax_cut')) baseTax = Math.min(baseTax, 0.28);
    if (hasInvestment('inv_tower')) baseTax *= 0.5;
    let profitTaxes = income > 0 ? (income * baseTax) : 0;
    let luxuryTax = Math.floor(Math.pow(gameState.fleet.length, 1.5) * 50);
    if (hasInvestment('inv_tower')) luxuryTax = Math.floor(luxuryTax * 0.5);

    expenses += luxuryTax + profitTaxes;

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

    gameState.cash += (income - expenses);
    // Push authoritative cash to server (fire-and-forget — Realtime will confirm)
    if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});

    // Bankruptcy risk: track consecutive days in red
    if (gameState.cash < 0) {
        gameState.consecutiveRedDays = (gameState.consecutiveRedDays || 0) + 1;
        showNotification(`⚠️ Cassa negativa! Giorno ${gameState.consecutiveRedDays}/3 prima del pignoramento.`, 'error');
        logToMap(`🔴 Cassa negativa: €${Math.floor(gameState.cash).toLocaleString()} (${gameState.consecutiveRedDays}/3 giorni)`);
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
    if (typeof _updateHQMarker === 'function') _updateHQMarker();

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
    if (hasInvestment('inv_hotel_exclusive')) {
        for (let i = 0; i < 5; i++) generatePOIRide('vip');
        income += 500;
    }
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
                gameState.cash -= penalty;
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
        showBigEvent('🏆', 'Top 3 del Ranking!', 'Stai dominando il mercato! Bonus attivi: corse Ultra-Luxury accessibili, premi assicurativi −15%, POI esclusivi sbloccati.');
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
            gameState.cash -= upkeepTotal;
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
            gameState.cash += bonusAmt;
            gameState.reputation = Math.min(5.0, gameState.reputation + repBonus);
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
            gameState.cash += vcIncome;
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
            gameState.cash += mgIncome;
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
            gameState.cash -= taxDue;
            logToMap(`📋 Dichiarazione fiscale annuale: profitti €${taxable.toLocaleString()} × ${(taxRate*100).toFixed(0)}% = −€${taxDue.toLocaleString()}`);
            showBigEvent('📋', 'Dichiarazione Fiscale Annuale', `Profitti annui: €${taxable.toLocaleString()}\nAliquota: ${(taxRate*100).toFixed(0)}%\nImposta versata: −€${taxDue.toLocaleString()}\n${hasAdmin ? '(Riduzione al 24% grazie all\'Amministratore)' : 'Assumi un Amministratore per ridurre al 24%.'}`);
        }
        gameState.annualProfitTracker = 0;
    }

    // Filantropia: +0.5 rep settimanale
    if (hasInvestment('inv_philanthropy') && gameState.day % 7 === 0) {
        gameState.reputation = Math.min(5.0, gameState.reputation + 0.5);
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
            gameState.cash -= totalRepayment;
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
            gameState.cash += bonus;
            gameState.reputation = Math.min(5.0, gameState.reputation + repGain);
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
        gameState.cash += dailyHubIncome;
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
            gameState.driverCoins = (gameState.driverCoins || 0) + prizeTC;
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
                    gameState.cash += salePrice;
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
        const subIncome = subs.reduce((sum, sid) => {
            const tmpl = (typeof HOLDING_SUBSIDIARIES !== 'undefined' ? HOLDING_SUBSIDIARIES : window.HOLDING_SUBSIDIARIES || []).find(s => s.id === sid);
            return sum + (tmpl ? tmpl.dailyIncome : 0);
        }, 0);
        if (subIncome > 0) {
            gameState.cash += subIncome;
            logToMap(`🏢 Holding: dividendi subsidiarie +€${subIncome.toLocaleString()}/g`);
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
            gameState.cash -= npcDividend;
            gameState.companyIPO.dividendsPaid = (gameState.companyIPO.dividendsPaid || 0) + npcDividend;
            logToMap(`📈 IPO Dividendo: €${npcDividend.toLocaleString()} pagato agli azionisti NPC (10% utili giornalieri)`);
        }
    }

    logToMap(`📊 Chiusura Giornaliera: Entrate +€${income} | Uscite -€${Math.floor(expenses)} (Inc. Tasse: €${luxuryTax})`);

    // ── DAILY SUMMARY TOAST ───────────────────────────────────────────────────
    if (typeof window.DS !== 'undefined') {
        const _net = income - Math.floor(expenses);
        const _today = gameState.todayEarnings || 0;
        const _rideCount = gameState.weeklyRides || 0;
        const _sumType = _net >= 0 ? 'success' : 'error';
        const _todayStr = _today > 0 ? ` · Corse: €${_today.toLocaleString()}` : '';
        window.DS.toast({
            title: `Giorno ${_closingDay} — Chiusura`,
            msg: `Passivo: ${_net >= 0 ? '+' : ''}€${_net.toLocaleString()} · Tasse €${luxuryTax.toLocaleString()}${_todayStr}`,
            type: _sumType,
            duration: 6000,
        });
        // Store daily summary for dispatch center overlay
        gameState._dailySummary = {
            day: _closingDay,
            income: Math.round(income),
            expenses: Math.round(expenses),
            net: Math.round(_net),
            todayEarnings: _today,
            luxuryTax,
            cash: gameState.cash,
            reputation: gameState.reputation,
        };
        gameState.todayEarnings = 0; // reset for the new day
    }

    // GdF inspection — fire-and-forget, async (requires user logged in)
    if (typeof window._sindacatoGdfDailyCheck === 'function') window._sindacatoGdfDailyCheck();
    // B2B corporate contract daily payout
    if (typeof window._b2bDailyTick === 'function') window._b2bDailyTick();
    // Tourism B2B tender daily payout
    if (typeof window._tourismDailyTick === 'function') window._tourismDailyTick();
    // HQ daily effects (auto-repair, morale, EV recharge)
    if (typeof window._hqDailyTick === 'function') window._hqDailyTick();
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
    const surgeMult = pending >= 15 ? 1.35 : pending >= 8 ? 1.15 : 1.0;
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
    let minutes = Math.max(10, Math.min(360, price * 0.4));
    // routeType is set by generateContractRide from routesDB route.type ('Airport','Rail','Transfer','Boat','Port','City-to-City')
    const rType = ride.routeType || '';
    if (rType === 'Airport' || rType === 'Rail' || rType === 'Transfer') minutes *= 0.7;
    else if (rType === 'Boat' || rType === 'Port') minutes *= 1.3;
    const fromRegion = ride.fromPoi?.region || '';
    const toRegion   = ride.toPoi?.region   || '';
    if (fromRegion && toRegion && fromRegion !== toRegion) minutes *= 1.5;
    return Math.round(minutes) * 60 * 1000;
}

function assignRideToDriver(rideId, driverId) {
    const rideIdx = gameState.pendingRides.findIndex(r => r.id == rideId);
    const driver = gameState.drivers.find(d => d.id == driverId);

    if (rideIdx > -1 && driver) {
        const _execActive = gameState.executivePassActive && gameState.day <= (gameState.executivePassExpiresDay || 0);
        const _maxQueue = _execActive ? 12 : 10;
        if (driver.queue.length >= _maxQueue) return;
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
    const _epSlots = (gameState.executivePassActive && gameState.day <= (gameState.executivePassExpiresDay || 0)) ? 12 : 10;
    if (driver.queue.length >= _epSlots) return false;
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
        driver.status = 'idle';
        if (car && car.condition <= 10 && typeof showNotification === 'function') {
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
        gameState.reputation = Math.min(5.0, (gameState.reputation || 0) + _skillEffects.vipRepGain);
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
        if (ride.duration !== undefined) ride.duration += 60; // car blocked 1 more hour
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
    const _cond3 = _car3 ? (_car3.condition || 0) : 100;
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
    const earned = Math.max(0, Math.floor((ride.price + delayBonus) * hrTipMult * traitTipMult * _vipTipBuff * levelTipMult * upgradeMult * specTipMult * eventTipMult * skillCharismaMult * strategyMult * conditionMult * _strikeMult * _crumiriMult * _consorzioMult * _vipEarningsBuff * skillTipMult * _decreeTip * _hqTip) - _fuelDeduction);

    const prevCash = gameState.cash;
    if (_deferPay) {
        const _trip = (gameState.activeTrips || []).find(t => t.id === ride.id);
        if (_trip) _trip.earnings = earned;
    } else {
        gameState.cash += earned;
        gameState.todayEarnings = (gameState.todayEarnings || 0) + earned;
        // Dividendo OPA: se il giocatore è sotto OPA ostile, paga il 20% al raider
        if (window.supabaseClient && window.currentUser) {
            window.supabaseClient.rpc('rpc_pay_majority_dividend', {
                v_target_user_id: window.currentUser.id,
                v_ride_earnings:  earned
            }).then(null, () => { /* silent — offline o nessuna OPA attiva */ });
            // Espansione 12: levy deposito carburante
            const _levyProv = ride.fromPoi?.id ? _POI_TO_PROVINCE[ride.fromPoi.id] : null;
            if (_levyProv) {
                window.supabaseClient.rpc('rpc_pay_fuel_levy', {
                    v_province_id: _levyProv,
                    v_fare: earned
                }).then(null, () => {});
            }
        }
    }
    gameState.reputation = Math.min(5.0 + gameState.prestige, gameState.reputation + 0.02);

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
    if (!gameState.questStats) gameState.questStats = { totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 };
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
        gameState.cash += bonus;
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
        gameState.driverCoins = (gameState.driverCoins || 0) + drop;
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

// ─── EVENTI E EMAIL ───
function generateEmailEvent() {
    const currentEvent = CEO_EVENTS.find(e => e.month === gameState.month);
    const gameHour = gameState.day * 24 + gameState.hour;
    const expiresAt = gameHour + 12; // expires in 12 game hours

    if (currentEvent && Math.random() > 0.5) {
        const _eventEmail = { id: gameState.nextId++, sender: "Networking Board", subject: `[INVITO] ${currentEvent.name}`, type: 'ceo_event', status: 'unread', eventData: currentEvent, expiresAt };
        _applyEmailTemplate(_eventEmail, 'ceo_event', { day: gameState.day });
        // Restore eventData in case template overwrote it (it won't, but belt-and-suspenders)
        _eventEmail.eventData = currentEvent;
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
            gameState.cash += counterOffer;
            gameState.reputation = Math.min(5.0, gameState.reputation + 0.05);
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
        if (gameState.cash >= Math.max(0, choice.cost)) {
            gameState.cash -= choice.cost;
            gameState.reputation = Math.min(5.0, Math.max(0, gameState.reputation + choice.repBonus));
            logToMap(`Evento: Hai scelto "${choice.text}".`);
        } else { return; } // Fondi insufficienti
    } else if (email.type === 'b2b') {
        let successChance = 100 - (((action / email.offer) - 1) * 100) + (gameState.reputation * 15);
        if (Math.random() * 100 <= successChance) {
            logToMap(`✅ Appalto B2B chiuso: €${action}`);
            gameState.cash += action; gameState.reputation = Math.min(5.0, gameState.reputation + 0.05);
            let numRides = Math.floor(Math.random() * 3) + 3;
            for(let i=0; i<numRides; i++) generatePOIRide(Math.random()>0.5?'business':'vip');
        } else {
            logToMap(`❌ Trattativa fallita.`); gameState.reputation = Math.max(0, gameState.reputation - 0.02);
        }
    }

    email.status = 'resolved';
    if(typeof renderTabEmails==='function') renderTabEmails(); updateUI(); saveGame();
}

// ─── GESTIONE AVANZATA AUTO (RIPARA, VENDI, ASSEGNA) ───
async function payToRepairCar(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if(!car) return;
    if(car.condition === 100) return;

    // Kasko: riparazioni incidentali gratuite
    if (hasInvestment('inv_kasko')) {
        car.condition = 100;
        logToMap(`🛡️ Kasko: ${car.name} riparata gratuitamente.`);
        if(typeof closeModals === 'function') closeModals();
        if(typeof renderTabFleet === 'function') renderTabFleet();
        updateUI();
        return;
    }

    let cost = (100 - car.condition) * 25;
    if (gameState.staff.some(s => s.id === 'mech')) cost = Math.floor(cost * 0.5);
    if (hasInvestment('inv_mobile_workshop')) cost = Math.floor(cost * 0.8);

    const result = await window.ServerState?.repairVehicle(car._serverId, cost);
    if (!result) return;

    car.condition = 100;
    if(typeof closeModals === 'function') closeModals();
    if(typeof renderTabFleet === 'function') renderTabFleet();
    updateUI();
}

async function sellCar(carId) {
    const idx = gameState.fleet.findIndex(c => c.id === carId);
    if(idx === -1) return;
    const car = gameState.fleet[idx];

    if(car.isLease) return;
    if(car.isLimitedEdition) { showNotification('Le edizioni limitate non possono essere vendute.', 'error'); return; }

    let baseValue = car.tier === 'ultra' ? 180000 : (car.tier === 'vip' ? 70000 : 35000);
    let sellPrice = Math.floor(baseValue * (car.condition / 100) * 0.7);

    const result = await window.ServerState?.sellVehicle(car._serverId, sellPrice);
    if (!result) return;

    let driver = gameState.drivers.find(d => d.assignedCarId === car.id);
    if (driver) driver.assignedCarId = null;
    gameState.fleet.splice(idx, 1);
    if(typeof closeModals === 'function') closeModals();
    if(typeof renderTabFleet === 'function') renderTabFleet();
    updateUI();
}

function assignCarToDriver(carId, driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if(driver) {
        driver.assignedCarId = carId;
        if(typeof closeModals === 'function') closeModals();
        if(typeof renderTabFleet === 'function') renderTabFleet();
    }
}

// ─── LEASING & HOTEL & ACQUISTI ───
function updateLeasePreview() {
    if(typeof tempLeaseTier === 'undefined' || !tempLeaseTier) return;
    const km = document.getElementById('lease-km').value;
    const months = document.getElementById('lease-duration').value;
    document.getElementById('lease-km-display').innerText = `${km/1000}k km`;
    document.getElementById('lease-duration-display').innerText = `${months} Mesi`;

    const template = LEASING_TEMPLATES[tempLeaseTier];
    const base = template.baseRate;
    const extraKm = ((km - 20000) / 1000) * (template.kmRate * 1000) / 12;
    const discountDuration = months > 12 ? (months * 5) : 0;
    const total = base + extraKm - discountDuration;

    document.getElementById('lease-base-price').innerText = `€${base}`;
    document.getElementById('lease-km-price').innerText = `+€${Math.floor(extraKm - discountDuration)}`;
    document.getElementById('lease-total-price').innerText = `€${Math.floor(total)}`;
    const worstPenalty = Math.floor(total * parseInt(months) * 0.5);
    const el = document.getElementById('lease-penalty-price');
    if (el) el.innerText = `max €${worstPenalty.toLocaleString()}`;
}

function confirmLease() {
    const km = document.getElementById('lease-km').value;
    const months = parseInt(document.getElementById('lease-duration').value);
    const template = LEASING_TEMPLATES[tempLeaseTier];

    const extraKm = ((km - 20000) / 1000) * (template.kmRate * 1000) / 12;
    const discountDuration = months > 12 ? (months * 5) : 0;
    const monthly = template.baseRate + extraKm - discountDuration;
    const daily = monthly / 30;

    const _leaseTierToClass = { ultra: 'majestic_spirit', vip: 'stellar_s_imp', group: 'stellar_v_carr', business: 'stellar_e_exec', standard: 'stellar_e_exec' };
    gameState.fleet.push({
        id: 'c_' + Date.now(), name: template.name + ' (Leasing)', tier: template.tier,
        condition: 100, isLease: true, dailyCost: daily, leaseDuration: months, leaseElapsedDays: 0,
        leaseMonthlyRate: Math.floor(monthly),
        fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100, outOfService: null, upgrades: [],
        vehicleClass: _leaseTierToClass[template.tier] || 'mercedes_e'
    });
    if(typeof closeModals === 'function') closeModals();
    if(typeof renderTabFleet === 'function') renderTabFleet();
}

async function rest(stars) {
    const cost       = stars === 3 ? 80  : (stars === 4 ? 200  : 600);
    const energyGain = stars === 3 ? 50  : (stars === 4 ? 75   : 100);
    const repGain    = stars === 5 ? 0.1 : 0;

    const result = await window.ServerState?.restCeo(stars, cost);
    if (!result) return;

    gameState.energy     = Math.min(100, gameState.energy + energyGain);
    gameState.reputation += repGain;
    if(typeof closeModals === 'function') closeModals();
    updateUI();
}

window.foundCompany = function(lng, lat, customName) {
    // Find nearest POI region
    let nearestRegion = 'lazio';
    let minDist = Infinity;
    for (const key in (typeof POIS !== 'undefined' ? POIS : {})) {
        const p = POIS[key];
        const d = Math.hypot(p.lng - lng, p.lat - lat);
        if (d < minDist) { minDist = d; nearestRegion = p.region || 'lazio'; }
    }
    if (nearestRegion && !gameState.unlockedRegions.includes(nearestRegion)) {
        gameState.unlockedRegions.push(nearestRegion);
    }
    gameState.hq.lng    = lng;
    gameState.hq.lat    = lat;
    gameState.hq.region = nearestRegion;
    gameState.hq.name   = customName || 'Sede Principale';
    gameState.hq.level  = 0;
    for (let i = 0; i < 3; i++) if (typeof generatePOIRide === 'function') generatePOIRide('standard');
    if (typeof showBigEvent === 'function') showBigEvent('🏢', 'Agenzia Fondata!', `La tua sede è ora operativa in ${nearestRegion}. Regione sbloccata gratuitamente. Le prime corse ti attendono!`);
    if (typeof _updateHQMarker === 'function') _updateHQMarker();
    if (typeof drawHighways === 'function') drawHighways();
    if (typeof drawPOIs === 'function') drawPOIs();
    if (typeof updateUI === 'function') updateUI();
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    saveGame();
};

async function buyRegion(regionId) {
    const region = REGIONS[regionId];
    if (!region) return;
    if (gameState.reputation < region.repReq) {
        showNotification(`Reputazione insufficiente (${region.repReq}★ richiesti)`, 'error');
        return;
    }

    const result = await window.ServerState?.unlockRegion(regionId, region.price);
    if (!result) return;

    gameState.unlockedRegions.push(regionId);
    updateUI();
    if(typeof renderTabRegions==='function') renderTabRegions();
    if (typeof drawHighways === 'function') drawHighways();
    if (typeof drawPOIs === 'function') drawPOIs();
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    saveGame();
}

async function buyInvestment(invId) {
    const item = INVESTMENTS.find(i => i.id === invId);
    if (!item || gameState.investments.includes(invId)) return;
    if ((gameState.constructions || []).some(c => c.invId === invId)) {
        if (typeof showNotification === 'function') showNotification('Costruzione già in corso!', 'error');
        return;
    }
    if (item.reqRides) {
        const ridesDone = gameState.questStats?.totalRides || 0;
        if (ridesDone < item.reqRides) {
            if (typeof showNotification === 'function') showNotification(`Requisito: ${item.reqRides} corse completate (hai ${ridesDone}).`, 'error');
            return;
        }
    }

    const result = await window.ServerState?.buyInvestment(invId, item.price);
    if (!result) return;

    if (item.buildTime) {
        // Time-gated: enter construction queue instead of activating immediately
        if (!gameState.constructions) gameState.constructions = [];
        gameState.constructions.push({ invId, startDay: gameState.day, buildDays: item.buildTime, completesDay: gameState.day + item.buildTime });
        if (typeof showNotification === 'function') showNotification(`🏗️ ${item.name}: costruzione avviata (${item.buildTime} giorni)!`, 'success');
    } else {
        gameState.investments.push(invId);
        if (item.rep) gameState.reputation = Math.min(5.0, gameState.reputation + item.rep);
        if (invId === 'inv_kasko') gameState._permKasko = true;
        if (invId === 'inv_ev_hub') gameState.hasEVHub = true;
        if (invId === 'inv_acquire') applyAcquisition();
        if (invId === 'inv_sponsorship') applySponsorship();
        if (invId === 'inv_national_license') applyNationalLicense();
        if (typeof showNotification === 'function') showNotification(`${item.name} acquisito!`, 'success');
        if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    }
    updateUI();
    if(typeof renderTabInvestments==='function') renderTabInvestments();
    saveGame();
}

window.speedUpConstruction = function(invId) {
    const c = (gameState.constructions || []).find(x => x.invId === invId);
    if (!c) return;
    const daysLeft = Math.max(0, c.completesDay - gameState.day);
    const dcCost   = Math.ceil(daysLeft * 2); // 2 DC per day remaining
    if ((gameState.driverCoins || 0) < dcCost) {
        if (typeof showNotification === 'function') showNotification(`Driver Coins insufficienti! Servono ${dcCost} DC.`, 'error');
        return;
    }
    gameState.driverCoins -= dcCost;
    // Complete immediately
    gameState.constructions = gameState.constructions.filter(x => x.invId !== invId);
    if (!gameState.investments.includes(invId)) gameState.investments.push(invId);
    if (invId === 'inv_ev_hub') gameState.hasEVHub = true;
    const inv = (typeof INVESTMENTS !== 'undefined' ? INVESTMENTS : []).find(i => i.id === invId);
    const name = inv ? inv.name : invId;
    logToMap(`⚡ Costruzione accelerata: ${name} completato istantaneamente! (−${dcCost} DC)`);
    showBigEvent('⚡', 'Completato!', `${name} è ora operativo grazie ai tuoi Driver Coins!`);
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    updateUI();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
    saveGame();
};

window.sellInvestment = function(invId) {
    const item = (typeof INVESTMENTS !== 'undefined' ? INVESTMENTS : []).find(i => i.id === invId);
    if (!item) return;
    const idx = gameState.investments.indexOf(invId);
    if (idx === -1) return;
    const refund = Math.floor(item.price * 0.40);
    if (!confirm(`Vendere ${item.name} per €${refund.toLocaleString()} (40% del valore)? Non si può annullare.`)) return;
    gameState.investments.splice(idx, 1);
    gameState.cash += refund;
    logToMap(`🏷️ Investimento venduto: ${item.name} → +€${refund.toLocaleString()}`);
    if (typeof showNotification === 'function') showNotification(`${item.name} venduto per €${refund.toLocaleString()}`, 'success');
    updateUI();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
    saveGame();
};

function applyAcquisition() {
    if (RIVALS.length === 0) return;
    const weakest = [...RIVALS].sort((a,b) => a.rep - b.rep)[0];
    RIVALS.splice(RIVALS.findIndex(r => r.id === weakest.id), 1);
    const tiers = ['standard','standard','business','business','vip'];
    for (let i = 0; i < 5; i++) {
        gameState.fleet.push({ id:'c_acq_'+Date.now()+i, name:`Auto (ex-${weakest.name})`, tier:tiers[i], condition:Math.floor(50+Math.random()*40), isLease:false, fuel:100, mileage:0, tirePressure:100, engineHealth:100, upgrades:[], vehicleClass:'mercedes_e', outOfService:false });
    }
    logToMap(`🏢 Acquisita ${weakest.name}! +5 veicoli in flotta.`);
}

function applySponsorship() {
    gameState.reputation = 5.0;
    gameState.cannesBoostDays = 7;
    logToMap('🎬 Festival di Cannes! Rep 5★ & prezzi doppi per 7 giorni!');
}

function applyNationalLicense() {
    Object.keys(REGIONS).forEach(regionId => {
        if (!gameState.unlockedRegions.includes(regionId)) {
            gameState.unlockedRegions.push(regionId);
        }
    });
    logToMap('🇮🇹 Licenza Nazionale: tutte le regioni d\'Italia sbloccate!');
    showBigEvent('🇮🇹', 'Italia Tua!', 'Hai acquistato la Licenza Nazionale NCC. Tutte le 19 regioni italiane sono ora operative. Sei il padrone assoluto del mercato NCC.');
    if (typeof drawHighways === 'function') drawHighways();
    if (typeof drawPOIs === 'function') drawPOIs();
    if (typeof renderTabRegions === 'function') renderTabRegions();
}

// ─── PROTOTIPI ESCLUSIVI ──────────────────────────────────────────
// ─── SISTEMA PRESTITI ─────────────────────────────────────────────
// ─── NEW GAME+ ────────────────────────────────────────────────────
window.newGamePlus = function() {
    if (!confirm('Iniziare una nuova partita portando il tuo lascito? Perderai tutto tranne una parte di reputazione e un bonus iniziale.')) return;
    const ngpCount = (gameState.newGamePlusCount || 0) + 1;
    const legacyRep = Math.min(2.0, gameState.reputation * 0.3);
    const legacyCash = 5000 + (ngpCount * 10000);
    localStorage.removeItem('chauffeurEmpireSave_v2');
    gameState = {
        cash: legacyCash, reputation: legacyRep, energy: 100,
        day: 1, month: 1, hour: 8, minute: 0, paused: false,
        fleet: [], drivers: [], staff: [], investments: [],
        pendingRides: [], activeRides: [], activeTrips: [], emails: [],
        unlockedRegions: ['lazio'], nextId: 1, cannesBoostDays: 0,
        availableRecruits: [],
        weather: 'sole', weatherHoursLeft: 6,
        activeCampaign: null,
        activeFines: [],
        achievements: [],
        loans: [],
        newGamePlusCount: ngpCount,
        fuelTank: 0, fuelTankCapacity: 10000, fuelPrice: 1.85, fuelTankLevel: 1,
        depositoGomme: 0,
        seizedCars: [],
        policeHeat: 0,
        consecutiveRedDays: 0,
        blacklistedClients: [],
        hqLevel: 0,
        activeDynamicEvent: null,
        activeStrike: null,
        prestige: 0,
        stockPrices: {}, stockHoldings: {}, brokerInvestments: [],
        lifestyleAssets: [], creditScore: 300,
        totalDividendsEarned: 0, totalStockProfit: 0, diamondContractsCompleted: 0,
        pricewars: [], shadowMissionsTotal: 0,
        ventureCapital: [], annualProfitTracker: 0,
        driverCoins: 0, npcMarket: [], questStats: {},
        loginStreak: 0, lastDailyClaim: 0,
        companyName: gameState.companyName || 'Chauffeur Empire',
        companyLogo: gameState.companyLogo || '👁️',
        companyColor: gameState.companyColor || '#d4af37',
    };
    gameState.drivers.push({ id: 'ceo', name: 'Tu (CEO)', status: 'idle', assignedCarId: 'c_loaner', queue: [], fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100, upgrades: [], hiredDay: 1 });
    gameState.fleet.push({ id: 'c_loaner', name: 'Berlina Base', tier: 'standard', condition: 100, isLease: true, dailyCost: 40, leaseDuration: 12, leaseElapsedDays: 0, fuel: 100, mileage: 0, tirePressure: 100, upgrades: [], vehicleClass: 'mercedes_e' });
    _refreshRecruits();
    _applyBrandColor();
    showBigEvent('♾️', `New Game+ ${ngpCount}`, `Riparto con €${legacyCash.toLocaleString()} e ${legacyRep.toFixed(1)}★ di reputazione ereditata. La tua leggenda continua.`);
    logToMap(`♾️ New Game+ ${ngpCount} iniziato!`);
    updateUI();
    saveGame();
};

// ── VENDITA AZIENDA (Enhanced New Game+) ─────────────────────────
window.sellCompanyNGP = function() {
    if (!_hasWealthManager()) { showNotification('Ti serve un Elite Wealth Manager per trovare acquirenti!', 'error'); return; }
    const creditTier = _getCreditTier(gameState.creditScore);
    const assetValue = (gameState.lifestyleAssets || []).reduce((s, id) => {
        const a = (typeof LIFESTYLE_ASSETS !== 'undefined' ? LIFESTYLE_ASSETS : []).find(x => x.id === id);
        return s + (a ? a.price * 0.4 : 0);
    }, 0);
    const fleetValue = gameState.fleet.reduce((s, c) => s + (c.isLease ? 0 : (c.condition / 100) * 50000), 0);
    const repMult   = Math.max(1, gameState.reputation * 0.8);
    const salePrice = Math.round((gameState.cash * 0.3 + assetValue + fleetValue) * repMult);
    const msg = `Un fondo d'investimento privato vuole acquisire Chauffeur Empire per €${salePrice.toLocaleString()}.\n\nIncasso la cifra, vendi tutto, e ricominci da zero con un vantaggio enorme. Continuare?`;
    if (!confirm(msg)) return;
    const ngpCount = (gameState.newGamePlusCount || 0) + 1;
    const legacyRep = Math.min(3.0, gameState.reputation * 0.4);
    const legacyCash = 5000 + salePrice * 0.8;
    localStorage.removeItem('chauffeurEmpireSave_v2');
    gameState = {
        cash: legacyCash, reputation: legacyRep, energy: 100,
        day: 1, month: 1, hour: 8, minute: 0, paused: false,
        fleet: [], drivers: [], staff: [], investments: [],
        pendingRides: [], activeRides: [], emails: [],
        unlockedRegions: ['lazio'], nextId: 1, cannesBoostDays: 0,
        availableRecruits: [], weather: 'sole', weatherHoursLeft: 6,
        activeCampaign: null, activeFines: [], achievements: [], loans: [],
        newGamePlusCount: ngpCount, fuelTank: 0, fuelTankCapacity: 10000, fuelPrice: 1.85,
        depositoGomme: 0, seizedCars: [], policeHeat: 0, consecutiveRedDays: 0,
        blacklistedClients: [], hqLevel: 0, activeDynamicEvent: null, activeStrike: null, prestige: 0,
        stockPrices: {}, stockHoldings: {}, brokerInvestments: [], lifestyleAssets: [],
        creditScore: 400 + ngpCount * 50,
        totalDividendsEarned: 0, totalStockProfit: 0, diamondContractsCompleted: 0,
        pricewars: [], shadowMissionsTotal: 0,
        stockHistory: {}, shortPositions: {}, shortMarginHeld: 0,
        inflationRate: 0.020, interestRateBase: 0.045,
        lobbyingPoints: 0, activeLobbyLaws: [],
        companyName: gameState.companyName || 'Chauffeur Empire',
        companyLogo: gameState.companyLogo || '👁️',
        companyColor: gameState.companyColor || '#d4af37',
        fuelTankLevel: 1, ventureCapital: [], annualProfitTracker: 0,
    };
    gameState.drivers.push({ id:'ceo', name:'Tu (CEO)', status:'idle', assignedCarId:'c_loaner', queue:[], fatigue:0, restHoursLeft:0, xp:0, level:0, morale:100, upgrades:[], hiredDay:1 });
    gameState.fleet.push({ id:'c_loaner', name:'Berlina Base', tier:'standard', condition:100, isLease:true, dailyCost:40, leaseDuration:12, leaseElapsedDays:0, fuel:100, mileage:0, tirePressure:100, upgrades:[], vehicleClass:'mercedes_e' });
    _initStockPrices();
    _refreshRecruits();
    _applyBrandColor();
    showBigEvent('🏦', `Exit Strategy — New Game+ ${ngpCount}`,
        `Il fondo ha acquisito Chauffeur Empire per €${salePrice.toLocaleString()}.\n\nRicominci con €${Math.floor(legacyCash).toLocaleString()} e ${legacyRep.toFixed(1)}★ di reputazione ereditata. Credit Score iniziale: ${gameState.creditScore}.\n\nCostruisci un nuovo impero.`);
    logToMap(`♾️ Exit Strategy completata — NGP ${ngpCount} iniziato!`);
    updateUI(); saveGame();
};

// ── DIAMOND CONTRACTS ────────────────────────────────────────────
function _maybeDiamondContract() {
    if (typeof DIAMOND_CONTRACTS === 'undefined') return;
    if (!_hasWealthManager()) return;
    if (gameState.reputation < 4.5) return;
    if (gameState.emails.filter(e => e.type === 'diamond' && e.status === 'unread').length > 0) return;
    const eligible = DIAMOND_CONTRACTS.filter(c => {
        if (gameState.reputation < c.reqRep) return false;
        if (!(gameState.lifestyleAssets || []).includes(c.reqAsset)) return false;
        return true;
    });
    if (eligible.length === 0) return;
    if (Math.random() > 0.35) return;
    const contract = eligible[Math.floor(Math.random() * eligible.length)];
    const price = Math.round(contract.basePrice * (1 + Math.random() * 0.3));
    gameState.emails.push({
        id: gameState.nextId++,
        sender: contract.sender,
        subject: contract.subject,
        type: 'diamond',
        offer: price,
        status: 'unread',
        expiresAt: (gameState.day * 24 + gameState.hour) + 36
    });
    const dot = document.getElementById('mail-dot');
    if (dot) dot.classList.remove('hidden');
    logToMap(`🔶 DIAMOND CONTRACT ricevuto da ${contract.sender}!`);
    showNotification('🔶 Nuovo Diamond Contract in Inbox!', 'success');
    if (typeof renderTabEmails === 'function') renderTabEmails();
}

window.acceptDiamondContract = function(emailId) {
    const email = gameState.emails.find(e => e.id === emailId);
    if (!email) return;
    // Find best available driver+car
    const driver = gameState.drivers.find(d =>
        d.status === 'idle' && d.id !== 'ceo' &&
        (d.level >= 2 || d.tier === 'vip' || d.tier === 'ultra')
    );
    if (!driver) { showNotification('Serve un autista Expert/Elite/VIP disponibile per contratti Diamond!', 'error'); return; }
    const car = gameState.fleet.find(c => {
        if (c.tier !== 'ultra' && c.tier !== 'vip') return false;
        const assignedDriver = gameState.drivers.find(d => d.assignedCarId === c.id);
        return !assignedDriver || assignedDriver.status === 'idle';
    });
    if (!car) { showNotification('Serve un veicolo VIP/Ultra disponibile!', 'error'); return; }
    email.status = 'resolved';
    const price = email.offer || 30000;
    gameState.cash += price;
    gameState.reputation = Math.min(10, gameState.reputation + 0.2);
    gameState.diamondContractsCompleted = (gameState.diamondContractsCompleted || 0) + 1;
    logToMap(`🔶 Diamond Contract completato! +€${price.toLocaleString()} +0.2★`);
    showBigEvent('🔶', 'Diamond Contract Completato!', `€${price.toLocaleString()} incassati. +0.2★ Reputazione. Totale Diamond: ${gameState.diamondContractsCompleted}.`);
    updateUI(); saveGame();
    if (typeof renderTabEmails === 'function') renderTabEmails();
};

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
                gameState.cash -= bonusCost;
                if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});
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
    for (let i = trips.length - 1; i >= 0; i--) {
        const trip = trips[i];
        if (now < trip.endTime) continue;
        // Pay earnings
        if (trip.earnings != null) {
            gameState.cash += trip.earnings;
            gameState.todayEarnings = (gameState.todayEarnings || 0) + trip.earnings;
            // Dividendo OPA: se il giocatore è sotto OPA ostile, paga il 20% al raider
            if (window.supabaseClient && window.currentUser) {
                window.supabaseClient.rpc('rpc_pay_majority_dividend', {
                    v_target_user_id: window.currentUser.id,
                    v_ride_earnings:  trip.earnings
                }).then(null, () => { /* silent — offline o nessuna OPA attiva */ });
                // Espansione 12: levy deposito carburante
                const _tripProvince = trip.fromPoiId ? _POI_TO_PROVINCE[trip.fromPoiId] : null;
                if (_tripProvince) {
                    window.supabaseClient.rpc('rpc_pay_fuel_levy', {
                        v_province_id: _tripProvince,
                        v_fare: trip.earnings
                    }).then(null, () => {});
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
    if (completed > 0) {
        updateUI();
        saveGame();
    }
}

function updateUI() {
    const elCash = document.getElementById('tb-cash'); if(elCash) elCash.innerText = `€${Math.floor(gameState.cash).toLocaleString()}`;
    const elRep = document.getElementById('tb-rep'); if(elRep) elRep.innerText = `${gameState.reputation.toFixed(1)} ★`;
    const elEBar = document.getElementById('tb-energy-bar'); if (elEBar) elEBar.style.width = `${Math.max(0, gameState.energy)}%`;
    const elEText = document.getElementById('tb-energy-text'); if(elEText) elEText.innerText = `${Math.round(gameState.energy)}%`;
    const elTime = document.getElementById('tb-time'); if(elTime) elTime.innerText = `${String(gameState.hour).padStart(2, '0')}:${String(gameState.minute).padStart(2, '0')}`;
    const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const _itaNow = _getItalyTime();
    const elDate = document.getElementById('tb-date'); if(elDate) elDate.innerText = `Giorno ${gameState.day} · ${_itaNow.day} ${MONTHS[_itaNow.month-1]}`;
    // Meteo
    const ws = WEATHER_STATES.find(w => w.id === gameState.weather);
    const elWIcon  = document.getElementById('tb-weather-icon');  if(elWIcon)  elWIcon.innerText  = ws?.icon  || '☀️';
    const elWLabel = document.getElementById('tb-weather-label'); if(elWLabel) elWLabel.innerText = ws?.label || 'Sereno';
    // Surge indicator
    const elSurge = document.getElementById('tb-surge');
    if (elSurge) {
        const p = gameState.pendingRides.length;
        elSurge.innerText = p >= 15 ? '🔥 +35%' : p >= 8 ? '⚡ +15%' : '';
        elSurge.className = `text-[9px] font-bold ${p >= 15 ? 'text-red-400' : 'text-yellow-400'}`;
    }
    // CEO exhaustion visual distortion
    document.body.classList.toggle('ceo-exhausted', gameState.energy < 15);

    // Ticker: avviso deposito esaurito
    const outCars = gameState.fleet.filter(c => c.outOfService);
    let depotWarn = document.getElementById('ticker-depot-warning');
    if (outCars.length > 0) {
        if (!depotWarn) {
            depotWarn = document.createElement('span');
            depotWarn.id = 'ticker-depot-warning';
            depotWarn.style.cssText = 'color:#ff4060;font-weight:700;animation:none;';
            document.getElementById('news-ticker-track')?.prepend(depotWarn);
        }
        depotWarn.textContent = `ATTENZIONE: Deposito esaurito! ${outCars.length} macchine ferme in garage`;
    } else if (depotWarn) {
        depotWarn.remove();
    }
    // Driver Coins balance chip
    const elTC = document.getElementById('tb-tc');
    if (elTC) elTC.innerText = (gameState.driverCoins || 0);

    // Career dot (claimable quests)
    const careerDot = document.getElementById('career-dot');
    if (careerDot) careerDot.classList.toggle('hidden', !((gameState.claimableQuests || []).length > 0));
    // Hub career badge
    const hmodCareer = document.getElementById('hmod-career');
    if (hmodCareer) {
        const n = (gameState.claimableQuests || []).length;
        hmodCareer.textContent = n;
        hmodCareer.classList.toggle('hidden', n === 0);
    }

    // Refresh hub if open
    const hubModal = document.getElementById('hub-modal');
    if (hubModal && !hubModal.classList.contains('hidden') && typeof _updateHubStats === 'function') {
        _updateHubStats();
    }
}

function openHotelModal() {
    const m = document.getElementById('modal-hotel');
    m.classList.remove('hidden'); m.classList.add('flex');
}

function openLeasingModal(tierOrClass) {
    // Accept vehicleClass key or legacy tier key
    const key = LEASING_TEMPLATES[tierOrClass]
        ? tierOrClass
        : Object.keys(LEASING_TEMPLATES).find(k => LEASING_TEMPLATES[k].vehicleClass === tierOrClass || LEASING_TEMPLATES[k].tier === tierOrClass);
    if (!key || !LEASING_TEMPLATES[key]) return;
    const tier = key;
    tempLeaseTier = tier;
    document.getElementById('lease-car-name').innerText = LEASING_TEMPLATES[tier].name;
    const m = document.getElementById('modal-leasing');
    m.classList.remove('hidden'); m.classList.add('flex');
    updateLeasePreview();
}

// ─── BROADCAST NEWS ───────────────────────────────────────────────
async function _broadcastNews(message, type) {
    if (!window.supabaseClient || !window.currentUser) return;
    try {
        await window.supabaseClient.rpc('rpc_broadcast_news', {
            p_company_name: gameState.companyName,
            p_message:      message,
            p_type:         type || 'info',
        });
    } catch(e) { /* silenzioso */ }
}

window._startGameWithSlot = function(slotIndex, fresh) {
    window.currentSlotIndex = slotIndex;
    if (window._pendingCompanyName) {
        gameState.companyName  = window._pendingCompanyName;
        gameState.companyLogo  = window._pendingCompanyLogo  || '👁️';
        gameState.companyColor = window._pendingCompanyColor || '#d4af37';
        delete window._pendingCompanyName;
        delete window._pendingCompanyLogo;
        delete window._pendingCompanyColor;
    }
    if (!fresh) {
        const loaded = loadGame();
        initGame(!loaded);
    } else {
        initGame(true);
    }
    // Tutorial: launch on very first new game
    if (fresh && typeof window._maybeLaunchTutorial === 'function') {
        window._maybeLaunchTutorial();
    }
    // Lang toggle button in header
    if (typeof window._injectLangToggle === 'function') {
        setTimeout(window._injectLangToggle, 200);
    }
    if (typeof window.switchTab === 'function') window.switchTab('corse');
    // Push leaderboard as soon as the game is live (fresh or loaded save)
    setTimeout(() => {
        if (typeof window.forceLeaderboardUpdate === 'function') window.forceLeaderboardUpdate();
    }, 1500);
    // Daily reward (async, non-blocking)
    if (typeof _checkDailyReward === 'function') setTimeout(_checkDailyReward, 1500);
};

// ════════════════════════════════════════════════════════════════════
// HOLDING FINANZIARIA
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// COMPANY STOCK ($CEMP)
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// TIME-SAVER BOOSTERS (DC)
// ════════════════════════════════════════════════════════════════════
// Insta-Heal: azzera stress autista istantaneamente (2 DC — dal doc)
// ════════════════════════════════════════════════════════════════════
// BORSA VALORI AZIENDALE — Company IPO (versione NPC locale, fallback)
// La versione reale P2P è in p2p_market.js e sovrascrive questa.
// ════════════════════════════════════════════════════════════════════
