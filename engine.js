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
    // Basilicata
    'potenza':      'prov_potenza',
    // Calabria
    'catanzaro':    'prov_catanzaro',
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
    // Abruzzo
    'aquila':       'prov_aquila',
    // Molise
    'campobasso':   'prov_campobasso',
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
/* Una citta' vera per i testi delle email. Si pesca fra le regioni sbloccate,
   cosi' l'invito arriva da un posto dove il giocatore lavora davvero. */
function _cittaPerEmail() {
    const capoluoghi = (typeof REGION_CAPOLUOGHI !== 'undefined') ? REGION_CAPOLUOGHI : {};
    const sbloccate = ((gameState && gameState.unlockedRegions) || []).filter(r => capoluoghi[r]);
    if (sbloccate.length === 0) return capoluoghi.lazio || 'Roma';
    return capoluoghi[sbloccate[Math.floor(Math.random() * sbloccate.length)]];
}

/* Una data leggibile per gli inviti. `gameState.day` e' un CONTATORE di giorni
   dall'inizio del gioco (302 al 29/08/2026): infilato nei testi produceva
   «organizza 302 una Tavola Rotonda» e «Si terra' 302 il Gala». Un invito
   parla di una data vicina, quindi si costruisce dal calendario vero. */
function _dataPerEmail(giorniAvanti) {
    const quando = new Date(Date.now() + (giorniAvanti != null ? giorniAvanti : 7) * 86400000);
    try {
        return new Intl.DateTimeFormat('it-IT', {
            timeZone: 'Europe/Rome', day: 'numeric', month: 'long'
        }).format(quando);
    } catch (e) {
        return quando.getDate() + '/' + (quando.getMonth() + 1);
    }
}

/* La sostituzione dei segnaposti, staccata da _applyEmailTemplate perche' ora
   la usano due strade: i modelli generici di EMAIL_TEMPLATES e le lettere che
   ogni evento CEO porta con se' (data.js). Una funzione sola vuol dire che
   aggiungere un segnaposto lo rende disponibile a entrambe. */
function _sostituisciSegnaposti(str, vars) {
    vars = vars || {};
    /* I ripieghi non sono mai la stringa vuota ne' un numero grezzo: un
       segnaposto non sostituito si vede subito nel testo («di», «€», «302») e
       nessun chiamante passava city o day. */
    const citta = vars.city || _cittaPerEmail();
    const data  = vars.day != null ? vars.day : _dataPerEmail(4 + Math.floor(Math.random() * 10));
    return String(str == null ? '' : str)
        .replace(/\{\{driverName\}\}/g, vars.driverName || '')
        .replace(/\{\{rivalName\}\}/g, vars.rivalName || '')
        .replace(/\{\{eventName\}\}/g, vars.eventName || '')
        .replace(/\{\{amount\}\}/g, vars.amount != null ? Math.round(vars.amount).toLocaleString('it-IT') : '')
        .replace(/\{\{city\}\}/g, citta)
        .replace(/\{\{day\}\}/g, data)
        .replace(/\{\{companyName\}\}/g, vars.companyName || gameState.companyName || 'Italy Executive')
        .replace(/\{\{ceoName\}\}/g, vars.ceoName || gameState.ceoName || 'CEO');
}
window._sostituisciSegnaposti = _sostituisciSegnaposti;

function _applyEmailTemplate(emailObj, type, vars) {
    if (typeof EMAIL_TEMPLATES === 'undefined') return;
    const pool = EMAIL_TEMPLATES[type];
    if (!pool || !pool.length) return;
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    const body = tpl.bodies[Math.floor(Math.random() * tpl.bodies.length)];
    /* Citta' e data si fissano QUI e non dentro la sostituzione: se ogni
       chiamata le ripescasse a caso, l'oggetto direbbe una data e il corpo
       un'altra. */
    const vars2 = Object.assign({}, vars, {
        city: vars.city || _cittaPerEmail(),
        day:  vars.day != null ? vars.day : _dataPerEmail(4 + Math.floor(Math.random() * 10)),
    });
    const sub = (str) => _sostituisciSegnaposti(str, vars2);
    emailObj.senderName  = sub(tpl.senderName);
    emailObj.senderRole  = sub(tpl.senderRole);
    emailObj.senderIcon  = tpl.senderIcon;
    emailObj.subject     = sub(tpl.subject);
    emailObj.body        = sub(body);
    emailObj.signature   = sub(tpl.signature);
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
    if (camp.repBonus) window.CE_money.addReputation(camp.repBonus);
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
    cash: 0, reputation: 0.0, energy: 100,
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
    vtkBalance:      0,
    questStats:      { totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 },
    constructions:   [],   // [{ invId, startDay, buildDays, completesDay }]
    claimableQuests: [],
    completedQuests: [],
    hasEVHub: false,
};

// Expose gameState via window getter so all files can use window.gameState
Object.defineProperty(window, 'gameState', {
    get() { return gameState; },
    configurable: true,
});

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

// `var` e non `let`: auctions.js:353 e crypto.js:329 leggono `window._activeTab`
// per decidere se ri-renderizzare il tab aperto su evento Realtime. Con `let` la
// variabile resta nello scope di script e NON compare su window, quindi entrambi
// i guard erano sempre falsi: le aste non si aggiornavano sulle offerte altrui e
// il grafico crypto restava fermo sul prezzo del primo caricamento.
var _activeTab = 'map';
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
        el.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center';
        el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
        document.body.appendChild(el);
    }
    el.innerHTML = `
        <div style="background:#161b22;border:1px solid rgba(212,175,55,0.5);padding:40px 32px;border-radius:16px;max-width:420px;width:100%;text-align:center;margin:0 16px">
            <div style="font-size:56px;margin-bottom:20px;line-height:1">${icon}</div>
            <h2 style="color:#d4af37;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:18px;margin-bottom:14px;line-height:1.3">${title}</h2>
            <p style="color:#d1d5db;font-size:14px;line-height:1.6;margin-bottom:28px;white-space:pre-wrap">${body}</p>
            <button ${ceAct('ceRemove', ['big-event-modal'])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:10px 36px;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s">OK, Capito</button>
        </div>`;
    el.style.display = 'flex';
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

        /* La fascia dell'auto la decide il catalogo, sempre. Il `tier` viene
           salvato dentro ogni veicolo in flotta, quindi una partita cominciata
           prima del 29/08/2026 porta in giro la fascia vecchia: la Volt 3-Urban
           salvata come 'business' continuerebbe a prendere corse premium che le
           auto nuove uguali a lei non possono prendere. Fascia dell'auto e
           fascia della corsa sono la stessa scala: quando due copie della stessa
           scala divergono, nascono corse impossibili — e' successo il 28/08. */
        (save.fleet || []).forEach(c => {
            const def = [...(typeof NEW_CARS  !== 'undefined' ? NEW_CARS  : []),
                         ...(typeof USED_CARS !== 'undefined' ? USED_CARS : [])]
                        .find(d => d.vehicleClass === c.vehicleClass);
            if (def && c.tier !== def.tier) c.tier = def.tier;
        });

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
        if (save.vtkBalance      === undefined) save.vtkBalance      = 0;
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
        if (!save.hqGrid)  save.hqGrid  = { 0: 'garage_main' };
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
            CE_money.earn(auc.playerBid, 'auction_refund');
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
        // Pre-sync clock come nel ramo "returning player" sotto (riga ~854): senza questo,
        // gameState.day/hour restano al default del template (es. 1) mentre il primo tick di
        // gameLoop() li risincronizza forzatamente al calendario reale (riga ~981) — la
        // differenza viene letta come "è passato un giorno" e fa scattare un
        // processDailyRoutines() non voluto/non limitato (interessi Vittorio, tick B2B/tourism,
        // ispezione GdF...) sulla primissima sessione di un account appena creato, prima che il
        // giocatore abbia fatto qualunque cosa. Riprodotto live: rpc_sync_cash rifiutata
        // (companies_cash_check) su ogni nuovo signup.
        const _itaFresh = _getItalyTime();
        gameState.hour   = _itaFresh.hour;
        gameState.minute = _itaFresh.minute;
        gameState.month  = _itaFresh.month;
        gameState.day    = _itaFresh.gameDay;
        // Zero-to-Hero: una partita nuova parte dal "fondo del barile".
        // 10 guidate manuali (+15€) = 150€, coerente col modal "Hai 150€ in tasca ora".
        gameState.cash = 0;
        gameState.drivers.push({ id: 'ceo', name: 'Tu (CEO)', status: 'idle', assignedCarId: null, queue: [], fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100, upgrades: [], hiredDay: 1, skill_efficiency: 50, skill_charisma: 50, skill_speed: 50, stress_level: 0, burnout_until: null });
        // Auto "riscattata dal pignoramento": berlina starter tier 'standard' (sotto il
        // listino showroom, che parte da 'business'). Resta NON assegnata in survival
        // (guidi a mano); il Ragazzo di Quartiere ne eredita le chiavi quando lo assumi
        // (hireNeighborhoodKid) → l'idle parte senza dover comprare un'auto a €0 in cassa.
        gameState.fleet.push({
            /* tier 'standard': questa auto E' una volt_3_urban, e dal 29/08/2026 la
               volt_3_urban e' STANDARD in listino — la fascia d'ingresso, che prima
               non esisteva per nessuna auto. Il tier deve sempre coincidere con
               quello del catalogo (`NEW_CARS`), perche' fascia dell'auto e fascia
               della corsa sono la stessa scala: quando divergono nascono corse che
               non si possono accettare. Il 28/08 questa riga diceva 'standard'
               mentre il catalogo diceva 'business', e il giocatore nuovo vedeva 23
               corse senza poterne fare una. Oggi dicono entrambi 'standard', e le
               corse sotto 500€ sono il suo mestiere. */
            id: 'c_starter', _serverId: null, name: 'Berlina (riscattata)', tier: 'standard',
            vehicleClass: 'volt_3_urban', isStarter: true, condition: 62, isLease: false,
            fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100,
            outOfService: null, upgrades: [], protoId: null
        });
        _refreshRecruits();
        // Pacing (17/08/2026): senza questo il Dispatch è vuoto fino al primo
        // setInterval(generatePOIRide, 5 min) — misurato dal vivo, un giocatore
        // nuovo resta davanti a zero corse subito dopo l'onboarding. 2 corse
        // pronte da subito, solo per una partita davvero nuova.
        // Stesso motivo: il primo batch di bandi corporate aspettava fino a 2
        // giorni reali (contracts.js CYCLE_DAYS) — lo si genera subito.
        setTimeout(() => {
            if (typeof generatePOIRide === 'function') { generatePOIRide('standard'); generatePOIRide('standard'); }
            if (window.CE_Contracts && typeof window.CE_Contracts.dailyTick === 'function') {
                gameState.nextTenderDay = gameState.day; // altrimenti initState() lo fissa a day+2
                window.CE_Contracts.dailyTick();
            }
            if (typeof updateUI === 'function') updateUI();
        }, 800);
    } else {
        // Pre-sync clock and process offline income before intervals start (prevents false hourly/daily triggers)
        const _itaInit = _getItalyTime();
        gameState.hour   = _itaInit.hour;
        gameState.minute = _itaInit.minute;
        gameState.month  = _itaInit.month;
        // Offline catchup: advance day counter toward today, process daily routines for each missed day (capped at 7)
        const _offlineDays = Math.min(7, Math.max(0, _itaInit.gameDay - (gameState.day || _itaInit.gameDay)));
        const _cashBeforeOffline = gameState.cash;
        for (let i = 0; i < _offlineDays; i++) { gameState.day++; processDailyRoutines(); }
        gameState.day = _itaInit.gameDay; // final snap to canonical real day
        if (_offlineDays >= 1) {
            // "Hai guadagnato mentre riposavi" — mostra il delta cassa reale accumulato
            // dai processDailyRoutines() qui sopra (già server-sync'd via ServerState.syncCash,
            // qui solo lettura per il messaggio: nessuna nuova scrittura su gameState.cash).
            const _offlineDelta = Math.round(gameState.cash - _cashBeforeOffline);
            setTimeout(() => {
                if (typeof showNotification !== 'function') return;
                const giorni = `${_offlineDays} giorno${_offlineDays > 1 ? 'i' : ''}`;
                const msg = _offlineDelta >= 0
                    ? `💤 Sei stato offline per ${giorni} — hai guadagnato €${_offlineDelta.toLocaleString('it-IT')} mentre riposavi!`
                    : `💤 Sei stato offline per ${giorni} — tra spese e stipendi ti è costato €${Math.abs(_offlineDelta).toLocaleString('it-IT')}.`;
                showNotification(msg, 'info');
            }, 1200);
        }
        _refreshRecruits();
        setTimeout(_kickstartIdleDrivers, 500);
        setTimeout(_applyWeatherOverlay, 800);
        setTimeout(checkActiveTrips, 200); // resolve any trips that completed while offline
        // Redraw map with saved unlocked regions
        setTimeout(() => {
            MapBackend.drawHighways();
            MapBackend.drawPOIs();
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

/* Safe cash mutation: ignora importi non finiti (NaN/Infinity) che
   corromperebbero il saldo propagandosi a tutto lo stato.

   Passa da CE_money.earn, che sincronizza col server. Prima toccava
   `gameState.cash` e basta: chi incassava per questa strada vedeva il denaro
   a schermo e lo perdeva al ricaricamento, perche' al server non arrivava
   niente. Il ripiego diretto resta per l'unico caso in cui money.js non e'
   ancora caricato — l'ordine degli script all'avvio. */
window._addCash = function(amount) {
    if (Number.isFinite(amount)) {
        if (window.CE_money && typeof window.CE_money.earn === 'function') {
            window.CE_money.earn(amount, 'add_cash');
        } else {
            gameState.cash += amount;
        }
    }
    return gameState.cash;
};

function gameLoop() {
    if (gameState.paused) return;

    // Cash sanity guard: se una mutazione difettosa ha prodotto NaN/Infinity,
    // ripristina l'ultimo saldo valido invece di propagare la corruzione.
    if (!Number.isFinite(gameState.cash)) {
        gameState.cash = (typeof window._lastValidCash === 'number') ? window._lastValidCash : 0;
        if (typeof showNotification === 'function') showNotification('Saldo non valido corretto automaticamente.', 'error');
    } else {
        window._lastValidCash = gameState.cash;
    }

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

    // Dirty-check: skip DOM writes when nothing display-relevant changed
    const _snap = `${Math.floor(gameState.cash)}|${gameState.energy|0}|${gameState.reputation.toFixed(1)}|${gameState.hour}|${gameState.minute}|${gameState.weather}|${gameState.driverCoins|0}|${gameState.vtkBalance|0}|${(gameState.claimableQuests||[]).length}|${gameState.pendingRides.length}|${gameState.fleet.filter(c=>c.outOfService).length}`;
    if (_snap !== window._gameLoopUiSnap) { window._gameLoopUiSnap = _snap; updateUI(); }
}


// ─── LOG E WORLD NEWS ───
function logToMap(msg) {
    const logContainer = document.getElementById('map-log');
    if(!logContainer) return;
    const entry = document.createElement('div');
    entry.style.cssText = "border-bottom:1px solid #161b22;padding-bottom:4px;margin-bottom:4px;font-size:9px;color:#8b949e;font-family:monospace";
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

// ATTENZIONE: NON è il tasso che il gioco applica ai prestiti. Quello lo decide
// _getCreditTier(score).rate (engine-finance.js:151), scritto in loan.rate da takeLoan
// e riapplicato ogni mese da engine-daily.js:718. Questa funzione, legata al tasso BCE,
// non è usata da nessuna operazione: mostrarla in un pannello annuncia un tasso diverso
// da quello addebitato. Se serve un tasso legato alla BCE va fatto usare al motore,
// non solo all'interfaccia.
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
            if (ev.costA) CE_money.spend(ev.costA, 'vip_event_cost');
            window.CE_money.addReputation(ev.repA);
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

window.payFine = function(fineId) {
    const fine = (gameState.activeFines || []).find(f => f.id === fineId);
    if (!fine || fine.status !== 'pending') return;
    if (!CE_money.spend(fine.amount, 'pay_fine')) return;
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
        MapBackend.addPostoBlocco(_cpLng, _cpLat, _cpRideId);
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
    if (!CE_money.spend(warCost, 'price_war')) return;
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

// ─── GESTIONE AVANZATA AUTO (RIPARA, VENDI, ASSEGNA) ───
/* ── RIPARAZIONE CARROZZERIA — funzione unica ─────────────────────────────────
   Fino al 19/08/2026 esistevano DUE riparazioni con DUE prezzi diversi:
   payToRepairCar qui (€25/punto, addebito vero via RPC) e repairVehicle in
   engine-fleet.js (€85/punto, scalava solo in locale senza mai dirlo al server).
   Entrambe le interfacce mostravano pero' il prezzo a €85: il pulsante del tab
   Staff diceva "€5.100" e ne addebitava 1.500.

   Consolidate qui, sul prezzo che i giocatori hanno sempre visto (€85/punto),
   con l'unione delle logiche che le due avevano separatamente: Kasko e sconto
   officina mobile venivano solo da questa, blocco motore fuso, sconto contratto
   di manutenzione e azzeramento di outOfService solo dall'altra.

   `repairCostFor` e' l'UNICA fonte del prezzo: le interfacce devono chiamarla
   invece di ricopiare la formula (era copiata in ui-staff.js e ui-fleet.js). */

const RIPARAZIONE_EURO_PER_PUNTO = 85;
const RIPARAZIONE_MINIMO = 500;

/**
 * Costo di riparazione della carrozzeria, sconti inclusi.
 * @returns {number} 0 se gratis (Kasko) o se non c'e' nulla da riparare.
 */
window.repairCostFor = function repairCostFor(car) {
    if (!car) return 0;
    const missing = 100 - Math.max(0, Math.floor(car.condition || 0));
    if (missing <= 0) return 0;

    /* La Kasko NON azzera piu' la riparazione ordinaria.
     *
     * La sua descrizione promette che «le riparazioni incidentali non costano
     * nulla», e quella promessa e' gia' mantenuta dove serve: quando un
     * incidente accade, engine-rides.js ripara l'auto sul posto senza
     * addebitare niente. Azzerare anche l'usura normale significava pagare due
     * volte la stessa cosa, e con 48.000 euro — che una flotta di cinque auto
     * ripaga in circa 75 corse a testa — toglieva dal gioco un intero centro di
     * costo, per sempre.
     *
     * Le riparazioni sono una delle poche spese ricorrenti che danno al
     * giocatore un motivo per tornare e una decisione da prendere (riparo
     * adesso o tiro avanti?). Regalarle non rende il gioco piu' generoso:
     * lo rende piu' vuoto. Chi vuole spendere meno ha gia' tre sconti che si
     * moltiplicano — contratto, Capo Officina, Officina Mobile — e insieme
     * portano il prezzo da 85 a 24 euro al punto.
     */

    let cost = Math.max(RIPARAZIONE_MINIMO, missing * RIPARAZIONE_EURO_PER_PUNTO);
    const contrattoAttivo = gameState.maintenanceContract && gameState.day <= gameState.maintenanceContractPaidUntilDay;
    if (contrattoAttivo) cost *= 0.70;
    if (gameState.staff.some(s => s.id === 'mech')) cost *= 0.50;
    if (hasInvestment('inv_mobile_workshop')) cost *= 0.80;
    return Math.round(cost);
};

window.payToRepairCar = async function payToRepairCar(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if(!car) return;
    if((car.condition || 0) >= 100) { showNotification('Veicolo già in ottime condizioni!', 'info'); return; }

    // Motore fuso: la carrozzeria da sola non rimette l'auto in strada, e pagarla
    // adesso sarebbe denaro buttato finche' non si ripara il motore.
    if (car.engineHealth !== undefined && car.engineHealth <= 0) {
        showNotification('⚙️ Motore fuso — usa "Ripara Motore" prima di riparare la carrozzeria.', 'error');
        return;
    }

    /* Qui c'era una seconda porta della Kasko che rendeva gratuita QUALSIASI
       riparazione, usura ordinaria compresa. Il 20/08 la stessa regalia era
       stata tolta da `repairCostFor` — ma questo blocco usciva prima di
       arrivarci, quindi il prezzo mostrato diceva 5.950 euro e il pulsante
       riparava gratis: le due schermate raccontavano cose diverse.

       La promessa della Kasko («le riparazioni incidentali non costano nulla»)
       resta mantenuta dove nasce l'incidente: engine-rides.js:595 annulla del
       tutto il danno da incidente, quindi non c'e' niente da riparare. Coprire
       anche l'usura significava pagare due volte la stessa promessa. */

    const cost = window.repairCostFor(car);
    if ((gameState.cash || 0) < cost) {
        showNotification(`Fondi insufficienti — Riparazione: €${cost.toLocaleString('it-IT')}`, 'error');
        return;
    }

    const result = await window.ServerState?.repairVehicle(car._serverId, cost);
    if (!result) return;

    car.condition = 100;
    car.outOfService = null;
    logToMap(`🔧 ${car.name} riparata: 100% (€${cost.toLocaleString('it-IT')})`);
    if(typeof closeModals === 'function') closeModals();
    if(typeof renderTabFleet === 'function') renderTabFleet();
    updateUI();
};

window.sellCar = async function sellCar(carId) {
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
};

function assignCarToDriver(carId, driverId) {
    const driver = gameState.drivers.find(d => d.id === driverId);
    if(driver) {
        // FIX (stabilizzazione 10 agosto): senza questo, un'auto già assegnata a un altro
        // autista restava assegnata ANCHE a lui — riproducibile con normale uso della UI
        // (apri la scheda dell'auto, assegnala a un secondo autista libero), nessun devtools
        // richiesto. Due autisti sulla stessa auto = doppio dispatch sullo stesso veicolo
        // fisico. Stesso pattern già usato in sellVehicle per liberare l'auto dal vecchio
        // autista.
        const prevOwner = gameState.drivers.find(d => d.assignedCarId === carId && d.id !== driverId);
        if (prevOwner) prevOwner.assignedCarId = null;
        driver.assignedCarId = carId;
        saveGame();
        if(typeof openCarModal === 'function') openCarModal(carId);
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

window.rest = async function rest(stars) {
    const cost       = stars === 3 ? 80  : (stars === 4 ? 200  : 600);
    const energyGain = stars === 3 ? 50  : (stars === 4 ? 75   : 100);
    const repGain    = stars === 5 ? 0.1 : 0;

    const result = await window.ServerState?.restCeo(stars, cost);
    if (!result) return;

    gameState.energy     = Math.min(100, gameState.energy + energyGain);
    gameState.reputation += repGain;
    if(typeof closeModals === 'function') closeModals();
    updateUI();
};

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

    // Fresh-game: give CEO a loaner car so they can start taking rides immediately
    const _ceoDrv = gameState.drivers.find(d => d.id === 'ceo');
    if (_ceoDrv && !_ceoDrv.assignedCarId && !gameState.fleet.some(c => c.id === 'c_loaner')) {
        gameState.fleet.push({ id: 'c_loaner', name: 'Berlina Base', tier: 'standard', condition: 100, isLease: true, dailyCost: 40, leaseDuration: 12, leaseElapsedDays: 0, fuel: 100, mileage: 0, tirePressure: 100, upgrades: [], vehicleClass: 'mercedes_e' });
        _ceoDrv.assignedCarId = 'c_loaner';
    }

    for (let i = 0; i < 3; i++) if (typeof generatePOIRide === 'function') generatePOIRide('standard');
    if (typeof showBigEvent === 'function') showBigEvent('🏢', 'Agenzia Fondata!', `La tua sede è ora operativa in ${nearestRegion}. Regione sbloccata gratuitamente. Le prime corse ti attendono!`);
    // Launch tutorial on first-ever company founding
    if (typeof window._maybeLaunchTutorial === 'function') window._maybeLaunchTutorial();
    MapBackend.updateHQMarker();
    MapBackend.drawHighways();
    MapBackend.drawPOIs();
    if (typeof updateUI === 'function') updateUI();
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    saveGame();
};

window.buyRegion = async function buyRegion(regionId) {
    const region = REGIONS[regionId];
    if (!region) return;
    if (gameState.reputation < region.repReq) {
        showNotification(`Reputazione insufficiente (${region.repReq}★ richiesti)`, 'error');
        return;
    }
    if (gameState.unlockedRegions.includes(regionId)) {
        showNotification(`${region.name} è già sbloccata`, 'info');
        return;
    }

    const result = await window.ServerState?.unlockRegion(regionId, region.price);
    if (!result) return;

    gameState.unlockedRegions.push(regionId);
    updateUI();
    if(typeof renderTabRegions==='function') renderTabRegions();
    MapBackend.drawHighways();
    MapBackend.drawPOIs();
    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    saveGame();
};

window.buyInvestment = async function buyInvestment(invId) {
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
        if (item.rep) window.CE_money.addReputation(item.rep);
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
};

window.speedUpConstruction = function(invId) {
    const c = (gameState.constructions || []).find(x => x.invId === invId);
    if (!c) return;
    const daysLeft = Math.max(0, c.completesDay - gameState.day);
    const dcCost   = Math.ceil(daysLeft * 2); // 2 DC per day remaining
    if (!CE_money.spendDC(dcCost, 'speed_up_construction')) return;
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
    CE_money.earn(refund, 'sell_investment');
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
    MapBackend.drawHighways();
    MapBackend.drawPOIs();
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
        activeCampaigns: [], activeCampaign: null,
        activeFines: [], achievements: [], loans: [],
        newGamePlusCount: ngpCount,
        fuelTank: 0, fuelTankCapacity: 10000, fuelPrice: 1.85, fuelTankLevel: 1,
        depositoGomme: 0, seizedCars: [], policeHeat: 0, consecutiveRedDays: 0,
        blacklistedClients: [], hqLevel: 0, activeDynamicEvent: null, activeStrike: null,
        prestige: 0,
        stockPrices: {}, stockHoldings: {}, brokerInvestments: [],
        lifestyleAssets: [], creditScore: 300,
        totalDividendsEarned: 0, totalStockProfit: 0, diamondContractsCompleted: 0,
        pricewars: [], shadowMissionsTotal: 0, ventureCapital: [], annualProfitTracker: 0,
        driverCoins: 50, vtkBalance: 0, npcMarket: [],
        questStats: { totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 },
        loginStreak: 0, lastDailyClaim: null,
        weeklyEarnings: 0, weeklyRides: 0, weekStartDay: 1,
        executivePassActive: false, executivePassExpiresDay: 0,
        ownedHubs: [], hubTaxBalance: 0, driverAcademy: [], marketplace: [],
        activeAuction: null, vipNemeses: {}, constructions: [], claimableQuests: [], completedQuests: [],
        holding: { incorporated: false, incorporationDay: 0, subsidiaries: [] },
        cempOwnedShares: 0, cempHistory: [], companyIPO: null,
        hqs: {}, currentHQCity: 'roma',
        companyName: gameState.companyName || 'Chauffeur Empire',
        companyLogo: gameState.companyLogo || '👁️',
        companyColor: gameState.companyColor || '#d4af37',
    };
    if (typeof hqInit === 'function') hqInit();
    gameState.drivers.push({ id: 'ceo', name: 'Tu (CEO)', status: 'idle', assignedCarId: 'c_loaner', queue: [], fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100, upgrades: [], hiredDay: 1 });
    gameState.fleet.push({ id: 'c_loaner', name: 'Berlina Base', tier: 'standard', condition: 100, isLease: true, dailyCost: 40, leaseDuration: 12, leaseElapsedDays: 0, fuel: 100, mileage: 0, tirePressure: 100, upgrades: [], vehicleClass: 'mercedes_e' });
    _refreshRecruits();
    _applyBrandColor();
    showBigEvent('♾️', `New Game+ ${ngpCount}`, `Riparto con €${legacyCash.toLocaleString()} e ${legacyRep.toFixed(1)}★ di reputazione ereditata. La tua leggenda continua.`);
    logToMap(`♾️ New Game+ ${ngpCount} iniziato!`);
    // Senza questo, il server tiene ancora il cash pre-NGP e lo rivince al prossimo
    // login/refresh (auth.js Fase 5 fa sempre vincere il valore server) — vedi
    // docs/SYSTEMS.md §1 "New Game+ non sincronizza mai col server".
    if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});
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
        activeCampaigns: [], activeCampaign: null,
        activeFines: [], achievements: [], loans: [],
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
        activeTrips: [],
        companyName: gameState.companyName || 'Chauffeur Empire',
        companyLogo: gameState.companyLogo || '👁️',
        companyColor: gameState.companyColor || '#d4af37',
        fuelTankLevel: 1, ventureCapital: [], annualProfitTracker: 0,
        driverCoins: 50, vtkBalance: 0, npcMarket: [],
        questStats: { totalRides:0, vipRides:0, ultraRides:0, fcoRides:0, portRides:0, contractRides:0, portoCervoRides:0 },
        loginStreak: 0, lastDailyClaim: null,
        weeklyEarnings: 0, weeklyRides: 0, weekStartDay: 1,
        executivePassActive: false, executivePassExpiresDay: 0,
        ownedHubs: [], hubTaxBalance: 0, driverAcademy: [], marketplace: [],
        activeAuction: null, vipNemeses: {}, constructions: [], claimableQuests: [], completedQuests: [],
        holding: { incorporated: false, incorporationDay: 0, subsidiaries: [] },
        cempOwnedShares: 0, cempHistory: [], companyIPO: null,
        hqs: {}, currentHQCity: 'roma',
    };
    if (typeof hqInit === 'function') hqInit();
    gameState.drivers.push({ id:'ceo', name:'Tu (CEO)', status:'idle', assignedCarId:'c_loaner', queue:[], fatigue:0, restHoursLeft:0, xp:0, level:0, morale:100, upgrades:[], hiredDay:1 });
    gameState.fleet.push({ id:'c_loaner', name:'Berlina Base', tier:'standard', condition:100, isLease:true, dailyCost:40, leaseDuration:12, leaseElapsedDays:0, fuel:100, mileage:0, tirePressure:100, upgrades:[], vehicleClass:'mercedes_e' });
    _initStockPrices();
    _refreshRecruits();
    _applyBrandColor();
    showBigEvent('🏦', `Exit Strategy — New Game+ ${ngpCount}`,
        `Il fondo ha acquisito Chauffeur Empire per €${salePrice.toLocaleString()}.\n\nRicominci con €${Math.floor(legacyCash).toLocaleString()} e ${legacyRep.toFixed(1)}★ di reputazione ereditata. Credit Score iniziale: ${gameState.creditScore}.\n\nCostruisci un nuovo impero.`);
    logToMap(`♾️ Exit Strategy completata — NGP ${ngpCount} iniziato!`);
    // Stesso bug/fix di newGamePlus sopra: senza sync il server rivince il cash
    // pre-exit al prossimo login/refresh.
    if (typeof ServerState !== 'undefined') ServerState.syncCash(gameState.cash).catch(() => {});
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
    CE_money.earn(price, 'diamond_contract');
    window.CE_money.addReputation(0.2);
    gameState.diamondContractsCompleted = (gameState.diamondContractsCompleted || 0) + 1;
    logToMap(`🔶 Diamond Contract completato! +€${price.toLocaleString()} +0.2★`);
    showBigEvent('🔶', 'Diamond Contract Completato!', `€${price.toLocaleString()} incassati. +0.2★ Reputazione. Totale Diamond: ${gameState.diamondContractsCompleted}.`);
    updateUI(); saveGame();
    if (typeof renderTabEmails === 'function') renderTabEmails();
};

/* Un saldo non ancora arrivato non deve MAI diventare «NaN» sullo schermo.
   Playtest di Pietro, 28/08/2026: «Soldi sono in #NaN» nei primi secondi, poi
   sparito da solo. La causa: `Math.floor(undefined)` e' NaN, e
   `NaN.toLocaleString()` scrive letteralmente «NaN». Succede nella finestra fra
   il primo disegno dell'interfaccia e l'arrivo del saldo dal server.
   Un numero che non c'e' ancora si mostra come zero: e' una previsione che il
   server correggera' fra un istante, non un errore da dare in faccia a chi gioca. */
function _soldiLeggibili(valore) {
    const n = Math.floor(Number(valore));
    return Number.isFinite(n) ? n.toLocaleString('it-IT') : '0';
}
if (typeof window !== 'undefined') window._soldiLeggibili = _soldiLeggibili;

function updateUI() {
    const elCash = document.getElementById('tb-cash'); if(elCash) elCash.innerText = `€${_soldiLeggibili(gameState.cash)}`;
    // brand reale in topbar (nome azienda + stemma vanity) — non più hardcoded
    const elBN = document.querySelector('.emc-bn'); if (elBN && gameState.companyName) elBN.innerText = gameState.companyName;
    const elBM = document.querySelector('.emc-bm'); if (elBM && gameState.companyLogo && gameState.companyLogo !== 'CE') elBM.textContent = gameState.companyLogo;
    const elRep = document.getElementById('tb-rep'); if(elRep) elRep.innerText = `${gameState.reputation.toFixed(1)} ★`;
    /* Livello dell'azienda: il numero che sale spesso all'inizio. Il grado
       (ui-home.js) resta il titolo raro agganciato al prestigio; questo e' il
       segnale di crescita immediato, che prima non esisteva. */
    const elLv = document.getElementById('tb-level');
    if (elLv && window.CE_level) {
        window.CE_level.ensurePlayerLevel(gameState);
        const _xpMancanti = window.CE_level.totalXpForLevel(gameState.playerLevel + 1) - (gameState.playerXp || 0);
        elLv.innerText = `Lv ${gameState.playerLevel}`;
        elLv.parentElement.title = `Livello ${gameState.playerLevel} — ${_xpMancanti} XP al prossimo`;
    }
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
        // Unico scaglione surge esistente: engine-rides.js:94 → `pending >= 8 ? 1.15 : 1.0`.
        // Lo scaglione "+35% sopra 15 corse" non è mai esistito nel motore.
        const p = gameState.pendingRides.length;
        elSurge.innerText = p >= 8 ? '⚡ +15%' : '';
        elSurge.className = 'text-[9px] font-bold text-yellow-400';
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
    // VTK balance chip
    const elVTK = document.getElementById('tb-vtk');
    if (elVTK) elVTK.innerText = (gameState.vtkBalance || 0);

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
            p_company_name: (gameState.companyLogo && gameState.companyLogo !== 'CE' ? gameState.companyLogo + ' ' : '') + gameState.companyName,
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
        // Offline catch-up è GIÀ gestito da initGame (loop su _offlineDays in base a gameDay,
        // riga ~857). Il vecchio setTimeout(_processOfflineCatchup) lo rifaceva una seconda
        // volta → redditi/spese giornaliere contati due volte al ritorno. Rimosso.
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
    if (typeof window.switchTab === 'function') window.switchTab('home');
    // Push leaderboard as soon as the game is live (fresh or loaded save)
    setTimeout(() => {
        if (typeof window.forceLeaderboardUpdate === 'function') window.forceLeaderboardUpdate();
    }, 1500);
    // Daily reward (async, non-blocking) — implemented in engine-daily.js
    setTimeout(() => { if (typeof _checkDailyReward === 'function') _checkDailyReward(); }, 1500);
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
