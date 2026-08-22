'use strict';
/* ================================================================
   data.js — Chauffeur Empire · Tycoon Update v8.0
   ================================================================ */

// ─── REGIONI E POI ───────────────────────────────────────────────
const REGIONS = {
    // ─── CENTRO (partenza) ───────────────────────────────────────
    lazio:       { id:'lazio',       name:'Lazio',                price:0,     repReq:0.0, unlocked:true  },
    umbria:      { id:'umbria',      name:'Umbria',               price:10000, repReq:0.8, unlocked:false },
    marche:      { id:'marche',      name:'Marche',               price:12000, repReq:0.9, unlocked:false },
    abruzzo:     { id:'abruzzo',     name:'Abruzzo',              price:10000, repReq:0.7, unlocked:false },
    molise:      { id:'molise',      name:'Molise',               price:8000,  repReq:0.5, unlocked:false },
    toscana:     { id:'toscana',     name:'Toscana',              price:20000, repReq:1.2, unlocked:false },
    // ─── SUD (licenze accessibili) ───────────────────────────────
    campania:    { id:'campania',    name:'Campania',             price:12000, repReq:0.6, unlocked:false },
    puglia:      { id:'puglia',      name:'Puglia',               price:15000, repReq:0.9, unlocked:false },
    basilicata:  { id:'basilicata',  name:'Basilicata',           price:9000,  repReq:0.6, unlocked:false },
    calabria:    { id:'calabria',    name:'Calabria',             price:11000, repReq:0.7, unlocked:false },
    // ─── ISOLE (ferry route, prezzi medi) ────────────────────────
    sicilia:     { id:'sicilia',     name:'Sicilia',              price:14000, repReq:0.8, unlocked:false },
    sardegna:    { id:'sardegna',    name:'Sardegna',             price:13000, repReq:0.7, unlocked:false },
    // ─── NORD (hub economici, costosi) ───────────────────────────
    emilia:      { id:'emilia',      name:'Emilia-Romagna',       price:28000, repReq:2.0, unlocked:false },
    liguria:     { id:'liguria',     name:'Liguria',              price:25000, repReq:1.8, unlocked:false },
    piemonte:    { id:'piemonte',    name:'Piemonte',             price:30000, repReq:2.2, unlocked:false },
    lombardia:   { id:'lombardia',   name:'Lombardia',            price:55000, repReq:3.0, unlocked:false },
    veneto:      { id:'veneto',      name:'Veneto',               price:35000, repReq:2.5, unlocked:false },
    friuli:      { id:'friuli',      name:'Friuli-Venezia Giulia',price:28000, repReq:2.0, unlocked:false },
    trentino:    { id:'trentino',    name:'Trentino-Alto Adige',  price:32000, repReq:2.3, unlocked:false },
    valle_aosta: { id:'valle_aosta', name:"Valle d'Aosta",        price:20000, repReq:1.8, unlocked:false },
};

// baseFlat = tariffa reale 2025 (Sedan/Standard) da listini NCC
const POIS = {
    // ─── LAZIO ───────────────────────────────────────────────────
    roma:         { id:'roma',         region:'lazio',      lat:41.9028, lng:12.4964, name:'Roma Centro',        type:'hub',    baseFlat:75,  minTier:'standard' },
    roma_fco:     { id:'roma_fco',     region:'lazio',      lat:41.7999, lng:12.2462, name:'Aeroporto FCO',      type:'hub',    baseFlat:90,  minTier:'standard' },
    roma_hassler: { id:'roma_hassler', region:'lazio',      lat:41.9062, lng:12.4828, name:'Hotel Hassler 5★',   type:'luxury', baseFlat:160, minTier:'vip'      },
    civitavecchia:{ id:'civitavecchia',region:'lazio',      lat:42.0942, lng:11.7943, name:'Porto Civitavecchia',type:'hub',    baseFlat:234, minTier:'standard' },
    // ─── CENTRO ──────────────────────────────────────────────────
    perugia:      { id:'perugia',      region:'umbria',     lat:43.1107, lng:12.3908, name:'Perugia',            type:'city',   baseFlat:80,  minTier:'standard' },
    ancona:       { id:'ancona',       region:'marche',     lat:43.6158, lng:13.5189, name:'Ancona',             type:'city',   baseFlat:80,  minTier:'standard' },
    aquila:       { id:'aquila',       region:'abruzzo',    lat:42.3498, lng:13.3995, name:"L'Aquila",           type:'city',   baseFlat:75,  minTier:'standard' },
    campobasso:   { id:'campobasso',   region:'molise',     lat:41.5625, lng:14.6570, name:'Campobasso',         type:'city',   baseFlat:72,  minTier:'standard' },
    firenze:      { id:'firenze',      region:'toscana',    lat:43.7696, lng:11.2558, name:'Firenze',            type:'hub',    baseFlat:90,  minTier:'business' },
    // ─── SUD ─────────────────────────────────────────────────────
    napoli:       { id:'napoli',       region:'campania',   lat:40.8518, lng:14.2681, name:'Napoli',             type:'hub',    baseFlat:72,  minTier:'standard' },
    nap_capo:     { id:'nap_capo',     region:'campania',   lat:40.8841, lng:14.2882, name:'Capodichino NAP',    type:'hub',    baseFlat:90,  minTier:'standard' },
    sorrento:     { id:'sorrento',     region:'campania',   lat:40.6267, lng:14.3757, name:'Sorrento',           type:'luxury', baseFlat:153, minTier:'business' },
    amalfi:       { id:'amalfi',       region:'campania',   lat:40.6340, lng:14.6027, name:'Costa Amalfitana',   type:'luxury', baseFlat:210, minTier:'vip'      },
    bari:         { id:'bari',         region:'puglia',     lat:41.1171, lng:16.8719, name:'Bari',               type:'hub',    baseFlat:90,  minTier:'standard' },
    brindisi:     { id:'brindisi',     region:'puglia',     lat:40.6328, lng:17.9411, name:'Brindisi',           type:'hub',    baseFlat:100, minTier:'standard' },
    lecce:        { id:'lecce',        region:'puglia',     lat:40.3519, lng:18.1750, name:'Lecce',              type:'city',   baseFlat:110, minTier:'business' },
    borgo_egnazia:{ id:'borgo_egnazia',region:'puglia',     lat:40.7397, lng:17.4230, name:'Borgo Egnazia Resort',type:'luxury',baseFlat:320, minTier:'ultra', exclusiveRank:4 },
    potenza:      { id:'potenza',      region:'basilicata', lat:40.6426, lng:15.8057, name:'Potenza',            type:'city',   baseFlat:80,  minTier:'standard' },
    catanzaro:    { id:'catanzaro',    region:'calabria',   lat:38.9098, lng:16.5876, name:'Catanzaro',          type:'city',   baseFlat:80,  minTier:'standard' },
    // ─── ISOLE ───────────────────────────────────────────────────
    palermo:      { id:'palermo',      region:'sicilia',    lat:38.1157, lng:13.3615, name:'Palermo PMO',        type:'hub',    baseFlat:130, minTier:'business' },
    catania:      { id:'catania',      region:'sicilia',    lat:37.5079, lng:15.0830, name:'Catania CTA',        type:'hub',    baseFlat:120, minTier:'business' },
    taormina:     { id:'taormina',     region:'sicilia',    lat:37.8516, lng:15.2887, name:'Taormina',           type:'luxury', baseFlat:180, minTier:'vip'      },
    cagliari:     { id:'cagliari',     region:'sardegna',   lat:39.2238, lng:9.1217,  name:'Cagliari',           type:'hub',    baseFlat:110, minTier:'business' },
    olbia:        { id:'olbia',        region:'sardegna',   lat:40.9199, lng:9.5065,  name:'Olbia Costa Smeralda',type:'hub',   baseFlat:160, minTier:'business' },
    porto_cervo:  { id:'porto_cervo', region:'sardegna',   lat:41.1347, lng:9.5389,  name:'Porto Cervo',        type:'luxury', baseFlat:380, minTier:'ultra', exclusiveRank:5 },
    // ─── NORD ────────────────────────────────────────────────────
    bologna:      { id:'bologna',      region:'emilia',     lat:44.4949, lng:11.3426, name:'Bologna',            type:'hub',    baseFlat:90,  minTier:'business' },
    genova:       { id:'genova',       region:'liguria',    lat:44.4056, lng:8.9463,  name:'Genova',             type:'hub',    baseFlat:90,  minTier:'business' },
    portofino:    { id:'portofino',    region:'liguria',    lat:44.3032, lng:9.2092,  name:'Portofino',          type:'luxury', baseFlat:280, minTier:'vip'      },
    splendido:    { id:'splendido',    region:'liguria',    lat:44.3018, lng:9.2108,  name:'Belmond Splendido 5★',type:'luxury',baseFlat:420, minTier:'ultra', exclusiveRank:4 },
    torino:       { id:'torino',       region:'piemonte',   lat:45.0703, lng:7.6869,  name:'Torino',             type:'hub',    baseFlat:90,  minTier:'business' },
    milano:       { id:'milano',       region:'lombardia',  lat:45.4654, lng:9.1859,  name:'Milano',             type:'hub',    baseFlat:90,  minTier:'business' },
    mil_mxp:      { id:'mil_mxp',      region:'lombardia',  lat:45.6300, lng:8.7255,  name:'Malpensa MXP',       type:'hub',    baseFlat:210, minTier:'business' },
    mil_lin:      { id:'mil_lin',      region:'lombardia',  lat:45.4491, lng:9.2788,  name:'Linate LIN',         type:'hub',    baseFlat:110, minTier:'standard' },
    mil_armani:   { id:'mil_armani',   region:'lombardia',  lat:45.4705, lng:9.1923,  name:'Armani Hotel 5★',    type:'luxury', baseFlat:300, minTier:'ultra', exclusiveRank:5 },
    como:         { id:'como',         region:'lombardia',  lat:45.8080, lng:9.0852,  name:'Lago di Como',       type:'luxury', baseFlat:270, minTier:'vip'      },
    venezia:      { id:'venezia',      region:'veneto',     lat:45.4408, lng:12.3155, name:'Venezia',            type:'hub',    baseFlat:110, minTier:'business' },
    ven_mp:       { id:'ven_mp',       region:'veneto',     lat:45.5052, lng:12.3396, name:'Marco Polo APT',     type:'hub',    baseFlat:110, minTier:'business' },
    cortina:      { id:'cortina',      region:'veneto',     lat:46.5404, lng:12.1357, name:"Cortina d'Ampezzo",  type:'luxury', baseFlat:280, minTier:'vip'      },
    trieste:      { id:'trieste',      region:'friuli',     lat:45.6495, lng:13.7768, name:'Trieste',            type:'hub',    baseFlat:90,  minTier:'business' },
    trento:       { id:'trento',       region:'trentino',   lat:46.0748, lng:11.1217, name:'Trento',             type:'city',   baseFlat:90,  minTier:'business' },
    aosta:        { id:'aosta',        region:'valle_aosta',lat:45.7376, lng:7.3210,  name:'Aosta',              type:'city',   baseFlat:90,  minTier:'business' },
};

// ─── MERCATO AUTO — FULL CATALOG ────────────────────────────────
const NEW_CARS = [
    // ── Stellar gasoline ──────────────────────────────────────────
    { id:'stellar_e_exec',     name:'Stellar E-Executive',  tier:'business', price:120000,  condition:100, vehicleClass:'stellar_e_exec',     fuel:'gasoline', rideGate:0    },
    { id:'stellar_v_carr',     name:'Stellar V-Carrier',    tier:'business', price:95000,   condition:100, vehicleClass:'stellar_v_carr',     fuel:'gasoline', rideGate:0    },
    { id:'stellar_s_imp',      name:'Stellar S-Imperial',   tier:'vip',      price:480000,  condition:100, vehicleClass:'stellar_s_imp',      fuel:'gasoline', rideGate:250  },
    { id:'stellar_g_over',     name:'Stellar G-Overlord',   tier:'ultra',    price:950000,  condition:100, vehicleClass:'stellar_g_over',     fuel:'gasoline', rideGate:1000 },
    // ── Stellar Q electric ────────────────────────────────────────
    { id:'stellar_q_exec',     name:'Stellar Q-Executive',  tier:'business', price:95000,   condition:100, vehicleClass:'stellar_q_exec',     fuel:'electric', rideGate:0    },
    { id:'stellar_q_carr',     name:'Stellar Q-Carrier',    tier:'business', price:110000,  condition:100, vehicleClass:'stellar_q_carr',     fuel:'electric', rideGate:0    },
    { id:'stellar_q_imp',      name:'Stellar Q-Imperial',   tier:'vip',      price:320000,  condition:100, vehicleClass:'stellar_q_imp',      fuel:'electric', rideGate:250  },
    // ── Volt electric ─────────────────────────────────────────────
    { id:'volt_3_urban',       name:'Volt 3-Urban',         tier:'business', price:55000,   condition:100, vehicleClass:'volt_3_urban',       fuel:'electric', rideGate:0    },
    { id:'volt_y_cross',       name:'Volt Y-Cross',         tier:'business', price:70000,   condition:100, vehicleClass:'volt_y_cross',       fuel:'electric', rideGate:0    },
    { id:'volt_s_apex',        name:'Volt S-Apex',          tier:'vip',      price:560000,  condition:100, vehicleClass:'volt_s_apex',        fuel:'electric', rideGate:250  },
    { id:'volt_s_hyper',       name:'Volt S-Hyper',         tier:'ultra',    price:1400000, condition:100, vehicleClass:'volt_s_hyper',       fuel:'electric', rideGate:1000 },
    // ── Majestic luxury ───────────────────────────────────────────
    { id:'majestic_spirit',    name:'Majestic Spirit',      tier:'ultra',    price:2000000, condition:100, vehicleClass:'majestic_spirit',    fuel:'gasoline', rideGate:1000 },
    { id:'majestic_e_specter', name:'Majestic E-Specter',   tier:'ultra',    price:3200000, condition:100, vehicleClass:'majestic_e_specter', fuel:'electric', rideGate:1000 },
    // ── Nexus entry-level ─────────────────────────────────────────
    { id:'nexus_h_line',       name:'Nexus H-Line',          tier:'business', price:35000,   condition:100, vehicleClass:'nexus_h_line',       fuel:'gasoline', rideGate:0    },
    // ── Volt expanded ─────────────────────────────────────────────
    { id:'volt_ciudad',        name:'Volt Ciudad',           tier:'business', price:48000,   condition:100, vehicleClass:'volt_ciudad',        fuel:'electric', rideGate:0    },
    { id:'volt_e_estate',      name:'Volt E-Estate',         tier:'vip',      price:92000,   condition:100, vehicleClass:'volt_e_estate',      fuel:'electric', rideGate:250  },
    // ── Majestic SUV ──────────────────────────────────────────────
    { id:'majestic_citadel',   name:'Majestic Citadel',      tier:'vip',      price:135000,  condition:100, vehicleClass:'majestic_citadel',   fuel:'gasoline', rideGate:250  },
    // ── Stellar commercial ────────────────────────────────────────
    { id:'stellar_m_cruiser',  name:'Stellar M-Cruiser',     tier:'business', price:80000,   condition:100, vehicleClass:'stellar_m_cruiser',  fuel:'gasoline', rideGate:0    },
    // ── Aviazione Privata (Espansione 1) ──────────────────────────
    { id:'helicopter_as350',   name:'Airbus AS350 Écureuil', tier:'ultra',   price:4500000, condition:100, vehicleClass:'helicopter',         fuel:'avgas',    rideGate:2000, isAviation:true, intercityOnly:true, maxFleetCount:2 },
    { id:'private_jet_phenom', name:'Embraer Phenom 300',    tier:'ultra',   price:18000000,condition:100, vehicleClass:'private_jet',        fuel:'jet',      rideGate:5000, isAviation:true, intercityOnly:true, maxFleetCount:1 },
];

const USED_CARS = [
    { id:'uc_e_exec_22',  name:'Stellar E-Executive (2022)', tier:'business', price:72000,  condition:62, vehicleClass:'stellar_e_exec', fuel:'gasoline', rideGate:0   },
    { id:'uc_v_carr_21',  name:'Stellar V-Carrier (2021)',   tier:'business', price:55000,  condition:51, vehicleClass:'stellar_v_carr', fuel:'gasoline', rideGate:0   },
    { id:'uc_q_exec_22',  name:'Stellar Q-Executive (2022)', tier:'business', price:58000,  condition:57, vehicleClass:'stellar_q_exec', fuel:'electric', rideGate:0   },
    { id:'uc_volt3_21',   name:'Volt 3-Urban (2021)',        tier:'business', price:34000,  condition:65, vehicleClass:'volt_3_urban',   fuel:'electric', rideGate:0   },
    { id:'uc_s_imp_20',   name:'Stellar S-Imperial (2020)',  tier:'vip',      price:270000, condition:44, vehicleClass:'stellar_s_imp',  fuel:'gasoline', rideGate:250 },
];

const LEASING_TEMPLATES = {
    'stellar_e_exec':     { name:'Stellar E-Executive',  baseRate:1200, kmRate:0.05, tier:'business', vehicleClass:'stellar_e_exec'     },
    'stellar_q_exec':     { name:'Stellar Q-Executive',  baseRate:1300, kmRate:0.05, tier:'business', vehicleClass:'stellar_q_exec'     },
    'stellar_v_carr':     { name:'Stellar V-Carrier',    baseRate:1600, kmRate:0.07, tier:'business', vehicleClass:'stellar_v_carr'     },
    'stellar_q_carr':     { name:'Stellar Q-Carrier',    baseRate:1700, kmRate:0.07, tier:'business', vehicleClass:'stellar_q_carr'     },
    'volt_3_urban':       { name:'Volt 3-Urban',         baseRate:900,  kmRate:0.04, tier:'business', vehicleClass:'volt_3_urban'       },
    'volt_y_cross':       { name:'Volt Y-Cross',         baseRate:1100, kmRate:0.05, tier:'business', vehicleClass:'volt_y_cross'       },
    'stellar_s_imp':      { name:'Stellar S-Imperial',   baseRate:2500, kmRate:0.10, tier:'vip',      vehicleClass:'stellar_s_imp'      },
    'stellar_q_imp':      { name:'Stellar Q-Imperial',   baseRate:2800, kmRate:0.10, tier:'vip',      vehicleClass:'stellar_q_imp'      },
    'volt_s_apex':        { name:'Volt S-Apex',          baseRate:3200, kmRate:0.12, tier:'vip',      vehicleClass:'volt_s_apex'        },
    'majestic_spirit':    { name:'Majestic Spirit',      baseRate:5500, kmRate:0.22, tier:'ultra',    vehicleClass:'majestic_spirit'    },
    'stellar_g_over':     { name:'Stellar G-Overlord',   baseRate:5000, kmRate:0.22, tier:'ultra',    vehicleClass:'stellar_g_over'     },
    // ── Nuovi modelli ────────────────────────────────────────────
    'nexus_h_line':      { name:'Nexus H-Line',       baseRate:700,  kmRate:0.03, tier:'business', vehicleClass:'nexus_h_line'      },
    'volt_ciudad':       { name:'Volt Ciudad',         baseRate:800,  kmRate:0.03, tier:'business', vehicleClass:'volt_ciudad'       },
    'volt_e_estate':     { name:'Volt E-Estate',       baseRate:1800, kmRate:0.08, tier:'vip',      vehicleClass:'volt_e_estate'     },
    'majestic_citadel':  { name:'Majestic Citadel',    baseRate:2200, kmRate:0.09, tier:'vip',      vehicleClass:'majestic_citadel'  },
    'stellar_m_cruiser': { name:'Stellar M-Cruiser',   baseRate:1400, kmRate:0.06, tier:'business', vehicleClass:'stellar_m_cruiser' },
    // ── Aviazione Privata ────────────────────────────────────────
    'helicopter':  { name:'Airbus AS350',    baseRate:12000, kmRate:0.80, tier:'ultra', vehicleClass:'helicopter'  },
    'private_jet': { name:'Embraer Phenom',  baseRate:45000, kmRate:2.50, tier:'ultra', vehicleClass:'private_jet' },
    // legacy keys (backward compat)
    'business': { name:'Stellar E-Executive', baseRate:1200, kmRate:0.05, tier:'business', vehicleClass:'stellar_e_exec' },
    'vip':      { name:'Stellar S-Imperial',  baseRate:2500, kmRate:0.10, tier:'vip',      vehicleClass:'stellar_s_imp'  },
    'group':    { name:'Stellar V-Carrier',   baseRate:1600, kmRate:0.07, tier:'business', vehicleClass:'stellar_v_carr' },
    'ultra':    { name:'Stellar G-Overlord',  baseRate:5000, kmRate:0.22, tier:'ultra',    vehicleClass:'stellar_g_over' },
};

// Tratti personalità autisti (assegnati random al reclutamento)
const DRIVER_TRAITS = [
    { id:'piede_pesante', name:'🏎 Piede Pesante',  desc:'+15% velocità',          color:'#f59e0b', badge:'pregi',  speedMult:1.15, tipMult:1.00, fatigueMult:1.10, accidentMult:1.50, condMult:1.10 },
    { id:'gentleman',     name:'🎩 Gentleman',       desc:'+20% mance',             color:'#22c55e', badge:'pregi',  speedMult:1.00, tipMult:1.20, fatigueMult:1.00, accidentMult:0.80, condMult:1.00 },
    { id:'stakanovista',  name:'💪 Stakanovista',    desc:'-20% fatica',            color:'#22c55e', badge:'pregi',  speedMult:1.05, tipMult:1.00, fatigueMult:0.80, accidentMult:1.00, condMult:1.00 },
    { id:'prudente',      name:'🛡 Prudente',         desc:'-50% rischio guasti',   color:'#22c55e', badge:'pregi',  speedMult:0.92, tipMult:1.00, fatigueMult:0.95, accidentMult:0.50, condMult:0.80 },
    { id:'esperto',       name:'⭐ Esperto',          desc:'-25% usura auto',       color:'#22c55e', badge:'pregi',  speedMult:1.05, tipMult:1.05, fatigueMult:0.90, accidentMult:0.70, condMult:0.75 },
    { id:'spericolato',   name:'🎲 Spericolato',     desc:'-10% durata, +20% usura', color:'#ef4444', badge:'difetti', speedMult:1.10, tipMult:1.00, fatigueMult:1.00, accidentMult:1.20, condMult:1.20 },
    { id:'charmante',     name:'✨ Charmante',        desc:'+15% mance VIP/Ultra',  color:'#a78bfa', badge:'pregi',  speedMult:1.00, tipMult:1.00, fatigueMult:1.00, accidentMult:1.00, condMult:1.00, vipTipMult:1.15 },
    { id:'lamentoso',     name:'😩 Lamentoso',       desc:'+10% fatica',           color:'#ef4444', badge:'difetti', speedMult:1.00, tipMult:1.00, fatigueMult:1.10, accidentMult:1.00, condMult:1.00 },
    { id:'meticoloso',    name:'🔬 Meticoloso',      desc:'-50% usura, +10% durata', color:'#22c55e', badge:'pregi',  speedMult:0.90, tipMult:1.00, fatigueMult:1.00, accidentMult:0.60, condMult:0.50 },
];

// Pool di 24 autisti per reclutamento infinito (gameState.availableRecruits pescato da qui)
const DRIVER_POOL = [
    { name:'Marco Ferretti',     tier:'standard', salary:1650 },
    { name:'Sara Conti',         tier:'business', salary:2400 },
    { name:'Luca De Luca',       tier:'vip',      salary:3500 },
    { name:'Ahmed Al-Rashid',    tier:'ultra',    salary:5200 },
    { name:'Giulia Russo',       tier:'standard', salary:1700 },
    { name:'Roberto Mancini',    tier:'business', salary:2600 },
    { name:'Elena Bianchi',      tier:'standard', salary:1550 },
    { name:'Fabio Moretti',      tier:'vip',      salary:3800 },
    { name:'Sofia Esposito',     tier:'business', salary:2500 },
    { name:'Alessandro Ferrari', tier:'ultra',    salary:4800 },
    { name:'Chiara Romano',      tier:'standard', salary:1620 },
    { name:'Davide Costa',       tier:'business', salary:2700 },
    { name:'Martina Ricci',      tier:'vip',      salary:3600 },
    { name:'Francesco Gallo',    tier:'standard', salary:1750 },
    { name:'Valentina Bruno',    tier:'business', salary:2450 },
    { name:'Antonio Marino',     tier:'vip',      salary:3700 },
    { name:'Benedetta Greco',    tier:'ultra',    salary:5000 },
    { name:'Matteo Lombardi',    tier:'standard', salary:1580 },
    { name:'Serena Barbieri',    tier:'business', salary:2350 },
    { name:'Stefano Fontana',    tier:'ultra',    salary:5500 },
    { name:'Michèle Dupont',     tier:'vip',      salary:3900 },
    { name:'James Anderson',     tier:'ultra',    salary:6000 },
    { name:'Hans Müller',        tier:'business', salary:2900 },
    { name:'Yuki Tanaka',        tier:'vip',      salary:4100 },
];

// ─── STAFF AZIENDALE ────────────────────────────────────────────
const STAFF_ROLES = {
    dispatcher_jr:   { id:'jr_disp',  name:'Junior Dispatcher',    salary:1400, skill:'standard',   desc:'Auto-smista corse Standard ogni tick. Senza di lui tutto è manuale.' },
    dispatcher_sr:   { id:'sr_disp',  name:'Senior Dispatcher',    salary:3800, skill:'vip',        desc:'Auto-smista corse VIP & Ultra. Negozia appalti B2B a +15%.' },
    mechanic:        { id:'mech',     name:'Capo Officina',        salary:2600, skill:'repair',     desc:'+15% condizione flotta ogni notte. Riparazioni manuali −50% costo.' },
    admin:           { id:'admin',    name:'Responsabile Amm.ne',  salary:3000, skill:'tax',        desc:'Tassazione ridotta dal 42% al 24%. Elimina la tassa sul lusso.' },
    event_mgr:       { id:'evt_mgr',  name:'Event Manager',        salary:3200, skill:'events',     desc:'Chiude appalti B2B in automatico. Genera 3–6 corse Business/VIP extra.' },
    hr_specialist:   { id:'hr',       name:'HR Specialist',        salary:2800, skill:'welfare',    desc:'Gestisce i turni in automatico: riposo forzato a 85% fatica. +15% mance. CEO recupera energia a riposo.' },
    legal_advisor:   { id:'legal',    name:'Avvocato Aziendale',   salary:4200, skill:'legal',      desc:'Contesta automaticamente il 50% delle multe con 70% successo. Riduce sanzioni del 30%.' },
    logistics_mgr:   { id:'log_mgr',  name:'Logistics Manager',    salary:3500, skill:'logistics',  desc:'Gestisce il deposito carburante: avvisa ai minimi di prezzo per speculare, e quando le scorte scendono sotto il 15%.' },
    wealth_mgr:      { id:'ewm',      name:'Elite Wealth Manager', salary:8500, skill:'finance',    desc:'Sblocca il tab Finance: Broker personale, mercato azionario $WALL-ST, leva finanziaria avanzata. Accede a rendimenti tra il 4% e il 50% con rischio calibrabile. Necessario per Diamond Contracts e vendita azienda a fondi.' },
    airport_asst_fco:{ id:'apt_fco',  name:'Airport Assistant — FCO',  salary:2200, skill:'meetgreet', city:'roma',   airport:'FCO', desc:'Sblocca missioni passive Meet & Greet a Roma Fiumicino. Entrate senza consumo carburante. Tariffa base €395–€2.929/gruppo.' },
    airport_asst_nap:{ id:'apt_nap',  name:'Airport Assistant — NAP',  salary:2000, skill:'meetgreet', city:'napoli', airport:'NAP', desc:'Sblocca missioni passive Meet & Greet a Napoli Capodichino. Entrate senza consumo carburante.' },
    talent_scout:    { id:'talent_scout', name:'Talent Scout',             salary:3000, skill:'scouting',  desc:'Ogni 7 giorni cerca un autista leggendario con skills 90–100. Costo ingaggio ridotto del 20%.' },
};

// ─── LIVELLI AUTISTI (XP SYSTEM) ───────────────────────────────
const DRIVER_LEVELS = [
    { level:0, name:'Rookie',   xpMin:0,    xpMax:200,  tipBonus:1.00, fatigueBonus:1.00, badge:'lvl-rookie' },
    { level:1, name:'Pro',      xpMin:200,  xpMax:500,  tipBonus:1.10, fatigueBonus:0.95, badge:'lvl-pro'    },
    { level:2, name:'Expert',   xpMin:500,  xpMax:1000, tipBonus:1.20, fatigueBonus:0.90, badge:'lvl-expert' },
    { level:3, name:'Elite',    xpMin:1000, xpMax:Infinity, tipBonus:1.35, fatigueBonus:0.80, badge:'lvl-elite' }
];

// ─── SISTEMA MULTE ─────────────────────────────────────────────
const FINE_TEMPLATES = [
    { id:'ft_speed',   desc:'Eccesso di velocità',    amount:350,  severity:'minor'  },
    { id:'ft_zone',    desc:'Infrazione ZTL',          amount:500,  severity:'minor'  },
    { id:'ft_taxi',    desc:'Violazione codice NCC',   amount:1200, severity:'medium' },
    { id:'ft_crash',   desc:'Incidente stradale',      amount:2500, severity:'major'  },
    { id:'ft_license', desc:'Violazione licenza SCIA',  amount:3500, severity:'major'  },
];

// ─── INVESTIMENTI ESPANSI ───────────────────────────────────────
var INVESTMENTS = [
    // ─── TIER 1: CONSOLIDAMENTO ──────────────────────────────────
    { id:'inv_garage_hq',        tier:1, name:'Garage HQ Roma',              price:45000,    passive:0,     rep:0.2, desc:'Riduce del 10% tutti i costi fissi giornalieri.' },
    { id:'inv_carwash',          tier:1, name:'Autolavaggio Automatico',      price:18000,    passive:150,   rep:0.1, desc:'+€150/g. Mantiene le auto al +5% condizione costante.' },
    { id:'inv_mobile_workshop',  tier:1, name:'Officina Mobile',              price:22000,    passive:0,     rep:0.0, desc:'Riparazioni 20% più economiche e immediate.' },
    { id:'inv_livrea',           tier:1, name:'Livrea Chauffeur Empire', price:14000,    passive:0,     rep:0.2, desc:'+8% tariffa su ogni corsa. +10% Reputazione. Brand recognition.' },
    { id:'inv_ztl_centro',       tier:1, name:'Permesso ZTL Centro Italia',   price:9000,     passive:0,     rep:0.0, desc:'Evita le multe ZTL a Roma, Firenze e Perugia.' },
    { id:'inv_ztl_nord',         tier:1, name:'Permesso ZTL Nord Italia',     price:13000,    passive:0,     rep:0.0, desc:'Evita le multe ZTL a Milano, Torino e Bologna.' },

    // ─── TIER 2: ESPANSIONE BUSINESS ─────────────────────────────
    { id:'inv_terminal_fco',     tier:2, name:'Terminal Privato Fiumicino',   price:80000,    passive:0,     rep:0.3, desc:'+25% probabilità corse Business nel Lazio.' },
    { id:'inv_driver_school',    tier:2, name:'Scuola Guida Sicura',          price:35000,    passive:0,     rep:0.2, desc:'Usura veicoli dimezzata durante ogni corsa.' },
    { id:'inv_app',              tier:2, name:'App Chauffeur Empire Premium',      price:55000,    passive:0,     rep:0.5, desc:'Genera 2 corse extra ogni ora automaticamente.' },
    { id:'inv_hotel_partner',    tier:2, name:'Accordo Hotel 5★ Partner',     price:70000,    passive:0,     rep:0.8, desc:'Genera 3 corse VIP garantite ogni giorno.' },
    { id:'inv_dashcam',          tier:2, name:'Sistema Dashcam AI',           price:25000,    passive:0,     rep:0.1, desc:'Riduce del 50% il rischio incidenti su tutta la flotta. Premi assicurativi -15% in Top 3.' },
    { id:'inv_telepass',         tier:2, name:'Telepass Premium Fleet',       price:15000,    passive:0,     rep:0.0, desc:'-10% durata su tutti i trasferimenti autostradali interregionali.' },
    { id:'inv_kasko',            tier:2, name:'Polizza Kasko Full Fleet',     price:48000,    passive:0,     rep:0.0, desc:'Copertura totale: le riparazioni incidentali non costano nulla. Si rinnova ogni anno.' },
    { id:'inv_loan_facility',    tier:2, name:'Linea di Credito Bancaria',    price:5000,     passive:0,     rep:0.0, desc:'Sblocca prestiti fino a €500.000 con interessi 8% mensili. Attenzione al debito.' },
    { id:'inv_safe_driving',     tier:2, name:'Programma Guida Difensiva',      price:28000,    passive:0,     rep:0.1, desc:'Driver formati a gestire posti di blocco e meteo avverso. −30% durata fermi amministrativi.' },
    { id:'inv_airport_bribe',    tier:2, name:'Accordo VIP Aeroporti FCO/MXP', price:42000,    passive:0,     rep:0.2, desc:'+30% generazione corse da/per aeroporti FCO e MXP. Corsie preferenziali.' },
    { id:'inv_fuel_depot',       tier:2, name:'Deposito Carburante Aziendale', price:350000,   passive:0,     rep:0.0, buildTime:3,  dailyUpkeep:500,  desc:'Cisterna aziendale da 50.000L. Le auto si riforniscono gratis dal deposito se hai il Logistics Manager. Acquista gasolio al prezzo di mercato.' },
    { id:'inv_grey_market',      tier:2, name:'Canali Discreti (Grey Market)', price:55000,    passive:0,     rep:0.0, desc:'Missioni anonime a 3× tariffa. Alto rischio: un posto di blocco può sequestrare il veicolo per 7 giorni.' },
    { id:'inv_empty_leg',        tier:2, name:'Empty Leg Optimizer',           price:28000,    passive:0,     rep:0.1, desc:'Corse di ritorno automatiche al 50% tariffa. Elimina i viaggi a vuoto dopo i trasferimenti lunghi.' },
    { id:'inv_ev_hub',           tier:2, name:'Hub di Ricarica Corporate',     price:750000,   passive:0,     rep:0.2, buildTime:4,  reqRides:500,     desc:'Infrastruttura di ricarica per veicoli elettrici. Obbligatorio per acquistare qualsiasi veicolo EV della flotta.' },
    { id:'inv_hq_office',        tier:2, name:'Ufficio Executive (HQ Lv2)',    price:600000,   passive:0,     rep:0.1, buildTime:5,  dailyUpkeep:800,  desc:'Amplia la sede: fino a 4 dipendenti contemporanei. Sblocca slot HR e Logistics.' },

    // ─── TIER 3: LUSSO ESTREMO ───────────────────────────────────
    { id:'inv_pension_fund',     tier:3, name:'Fondo Pensione Dipendenti',    price:75000,    passive:0,     rep:0.3, desc:'Dopo 60 giorni di gioco: +€1.200/g rendita pensionistica. Migliora morale.' },
    { id:'inv_vip_lounge_hq',    tier:3, name:'VIP Lounge HQ',                price:85000,    passive:0,     rep:0.2, desc:'Sala relax interna: i driver recuperano stanchezza 30% più veloce. CEO recupera +2% energia/h quando non è in corsa.' },
    { id:'inv_carbon_neutral',   tier:3, name:'Certificazione Carbon Neutral', price:65000,    passive:0,     rep:0.3, desc:'Sblocca contratti Corporate Green. +15% tariffa su clienti aziende eco-sensitive.' },
    { id:'inv_hotel_exclusive',  tier:3, name:'Esclusiva Hotel de Russie Roma',price:280000,   passive:500,   rep:0.5, desc:'Accordo esclusivo: +€500/g + 5 corse VIP garantite ogni giorno dal principale hotel partner.' },
    { id:'inv_corporate_retainer',tier:3, name:'Corporate Retainer (3 Aziende)',price:420000,  passive:2000,  rep:0.4, desc:'+€2.000/g da contratti fissi con Fortune 500. +3 corse Business/g garantite anche senza richieste.' },
    { id:'inv_hq_campus',        tier:3, name:'Campus Chauffeur Empire (HQ Lv3)',   price:3800000,  passive:0,     rep:0.3, buildTime:10, dailyUpkeep:2000, desc:'Campus completo: staff illimitato. Morale driver +10 permanente. Accelera recupero stanchezza.' },
    { id:'inv_security_escort',     tier:3, name:'Security Escort Team',          price:95000,    passive:0,     rep:0.4, desc:'Auto di scorta per clienti HVT (High Value Target). +80% tariffa su missioni diplomatiche. -50% rischio incidenti.' },
    { id:'inv_philanthropy',     tier:3, name:'Fondazione Chauffeur Empire Onlus', price:95000,    passive:0,     rep:0.0, desc:'+0.5★ Reputazione ogni settimana. Migliora l\'immagine pubblica del brand.' },
    { id:'inv_sabotaggio',       tier:3, name:'Agenzia PR Negativa',          price:120000,   passive:0,     rep:0.0, desc:'Diffonde recensioni negative sui competitor. −10% reputazione rivali ogni settimana.' },
    { id:'inv_hangar',           tier:3, name:'Hangar Jet Privati',           price:8500000,  passive:0,     rep:1.0, buildTime:14, dailyUpkeep:5000, desc:'Sblocca corse ULTRA. +1 corsa Ultra ogni ora.' },
    { id:'inv_armored',          tier:3, name:'Chauffeur Blindato',           price:200000,   passive:0,     rep:0.5, desc:'Clienti ad alto rischio: pagano 3× il tariffario.' },
    { id:'inv_yacht',            tier:3, name:'Yacht Charter (Smeralda/Capri)',price:180000,  passive:2500,  rep:1.0, desc:'+€2.500/g & corse stagionali ultra-remunerate.' },
    { id:'inv_helipad',          tier:3, name:'Piazzola Elicottero Centro',   price:450000,   passive:0,     rep:1.5, desc:'+1.5★ Reputazione immediata. Percorrenze più rapide.' },

    // ─── TIER 4: DOMINIO DEL MERCATO ─────────────────────────────
    { id:'inv_national_license', tier:4, name:'Licenza Nazionale NCC',        price:150000,   passive:0,     rep:1.5, desc:'Sblocca TUTTE le regioni d\'Italia in un colpo solo. Risparmio enorme vs sblocco singolo. Simbolo di dominio assoluto.' },
    { id:'inv_real_estate',      tier:4, name:'Fondo Immobiliare Lusso',      price:2800000,  passive:15000, rep:0.5, desc:'€15.000/g di rendita passiva garantita.' },
    { id:'inv_tower',            tier:4, name:'Chauffeur Empire Tower (Milano)',   price:45000000, passive:0,     rep:2.0, buildTime:30, dailyUpkeep:15000, desc:'Dimezza tutte le tasse. Boost permanente al Ranking.' },
    { id:'inv_acquire',          tier:4, name:'Acquisizione Competitor Minore',price:500000,  passive:0,     rep:1.0, desc:'Acquisisci il rivale più debole: +5 veicoli e quota.' },
    { id:'inv_sponsorship',      tier:4, name:'Sponsor Festival di Cannes',   price:300000,   passive:0,     rep:2.0, desc:'Rep a 5.0★ istantanea. Prezzi 2× per 7 giorni.' },
];

// ─── RIVALS (10 AGENZIE COMPETITOR AI) ──────────────────────────
const RIVALS = [
    { id:'r1',  name:'Black Tie Chauffeurs',   rep:4.8, cash:2500000 },
    { id:'r2',  name:'Royal Transports VIP',    rep:3.5, cash:850000  },
    { id:'r3',  name:'Milano Prestige Cars',    rep:3.0, cash:620000  },
    { id:'r4',  name:'Elite Drive IT',          rep:2.4, cash:185000  },
    { id:'r5',  name:'Venezia Gondola VIP',     rep:2.1, cash:140000  },
    { id:'r6',  name:'Torino Luxury Drive',     rep:1.9, cash:98000   },
    { id:'r7',  name:'NCC Napoli Express',      rep:1.5, cash:62000   },
    { id:'r8',  name:'Roma Transfer Srl',       rep:1.2, cash:45000   },
    { id:'r9',  name:'Sicilia Transfer Pro',    rep:0.9, cash:28000   },
    { id:'r10', name:'Olga Wannabe Agency',     rep:0.5, cash:9000    },
];

// ─── EVENTI CEO ──────────────────────────────────────────────────
const CEO_EVENTS = [
    { id:'davos',      month:1,  name:'World Economic Forum - Davos',
      desc:'Un meeting globale. Come ti avvicini alle opportunità di networking?',
      choices:[
          { text:'Networking Aggressivo (€8.000)', cost:8000, repBonus:1.5 },
          { text:'Presenza Base (€2.000)',          cost:2000, repBonus:0.4 }
      ]
    },
    { id:'milanfw',    month:2,  name:'Milano Fashion Week',
      desc:'La moda di lusso chiama. Vuoi sponsorizzare l\'evento o guadagnare dai servizi?',
      choices:[
          { text:'Sponsor Ufficiale (€15.000)', cost:15000, repBonus:2.0 },
          { text:'Servizio Pagato (+€5.000)',    cost:-5000, repBonus:-0.2 }
      ]
    },
    { id:'formula1',   month:5,  name:'Gran Premio di Monaco',
      desc:'Il paddock VIP ha bisogno di transfer esclusivi. I prezzi sono liberi.',
      choices:[
          { text:'Flotta Completa (€12.000)',   cost:12000, repBonus:1.8 },
          { text:'Servizio Parziale (€4.000)',  cost:4000,  repBonus:0.7 }
      ]
    },
    { id:'venice',     month:8,  name:'Festival del Cinema di Venezia',
      desc:'Stars internazionali cercano discrezione e lusso assoluto.',
      choices:[
          { text:'Partner Ufficiale (€20.000)', cost:20000, repBonus:2.5 },
          { text:'Presenza Ridotta (€6.000)',   cost:6000,  repBonus:0.9 }
      ]
    },
    { id:'g20',        month:10, name:'G20 Summit Roma',
      desc:'I leader mondiali hanno bisogno di trasporti blindati e discreti.',
      choices:[
          { text:'Appalto Governativo (€30.000)', cost:30000, repBonus:3.0 },
          { text:'Rifiuta (Rischio rep)',          cost:0,     repBonus:-0.3 }
      ]
    },
    { id:'capodanno',  month:12, name:'Gala di Capodanno — Hotel Eden Roma',
      desc:'Serata esclusiva: ogni corsa vale il doppio. Vuoi essere presente?',
      choices:[
          { text:'Flotta All-In (€8.000)',      cost:8000, repBonus:1.2 },
          { text:'Solo i Driver Top (€3.000)',  cost:3000, repBonus:0.6 }
      ]
    }
];

// Moltiplicatori tariffa per categoria (base = Sedan/Standard)
// FCO standard €90 × 1.0 = €90 ✓ | FCO VIP €90 × 2.5 = €225 ✓ | FCO Van €90 × 1.5 = €135 ✓
const RIDE_PRICING = { standard: 1.0, business: 1.5, vip: 2.5, group: 1.5, ultra: 4.0 };
const WORLD_NEWS = [
    "Sciopero trasporti pubblici: picco di richieste per i servizi NCC!",
    "Prezzo carburante in rialzo del 12%: costi operativi in aumento.",
    "Nuovi dazi sulle importazioni di auto tedesche e britanniche.",
    "Celebrità avvistata in centro: paparazzi e ressa ovunque.",
    "Vertice UE a Roma: alta domanda per transfer istituzionali.",
    "Festival internazionale: hotel 5★ al completo, tariffe +30%.",
    "Allerta meteo nel nord Italia: rallentamenti su A4 e A1.",
    "Record di presenze turistiche a Venezia e Firenze.",
    "Nuovo accordo NCC-aeroporti: accesso semplificato per agenzie autorizzate.",
    "Tassi di interesse in aumento: i prestiti aziendali costano di più.",
    "Fiera del Lusso a Milano: 3000 VIP attesi nella settimana.",
    "Campionato automobilistico: auto sportive e chauffeur premium richiestissimi.",
];

// ─── SISTEMA METEO ───────────────────────────────────────────────
const WEATHER_STATES = [
    { id:'sole',    label:'Sereno',  icon:'☀️',  speedMult:1.00, priceMult:1.00 },
    { id:'pioggia', label:'Pioggia', icon:'🌧️', speedMult:0.80, priceMult:1.15 },
    { id:'neve',    label:'Neve',    icon:'❄️',  speedMult:0.60, priceMult:1.25 },
];

// ─── EVENTI TEMPORANEI ───────────────────────────────────────────
const TEMP_EVENTS = [
    { id:'fashion_week', label:'Milano Fashion Week',  region:'lombardia', city:'milano', rides:5, hours:24, priceMult:1.3 },
    { id:'sciopero',     label:'Sciopero Trasporti',   region:null,        city:null,     rides:8, hours:12, priceMult:1.0 },
    { id:'concerto',     label:'Concerto allo Stadio', region:'lazio',     city:'roma',   rides:4, hours:6,  priceMult:1.1 },
    { id:'g7',           label:'G7 Summit Roma',        region:'lazio',     city:'roma',   rides:5, hours:16, priceMult:1.8 },
    { id:'f1',           label:'Gran Premio Formula 1', region:'lombardia', city:'milano', rides:6, hours:8,  priceMult:1.5 },
];

// ─── UPGRADE VEICOLI ─────────────────────────────────────────────
var CAR_UPGRADES = [
    { id:'wifi',           name:'Wi-Fi Starlink',        price:2500,  priceMult:1.10, desc:'+10% tariffa. Requisito per clienti Corporate.' },
    { id:'frigobar',       name:'Mini-Bar VIP',           price:3500,  priceMult:1.15, desc:'+15% tariffa. Mance extra garantite.' },
    { id:'blindatura',     name:'Blindatura (Lv.2)',      price:18000, priceMult:1.40, desc:'+40% tariffa. Richiesto per missioni politiche.' },
    { id:'profumatore',    name:'Profumatore Luxury',     price:800,   priceMult:1.05, desc:'+5% tariffa. Rating fisso 5★ per ogni corsa.' },
    { id:'cerchi',         name:'Cerchi in Lega 21"',     price:4500,  priceMult:1.08, desc:'+8% valore rivendita. +8% tariffa per appeal.' },
    { id:'sospensioni',    name:'Sospensioni Adaptive',   price:6500,  priceMult:1.06, desc:'-15% accumulo fatica autista. +6% tariffa.' },
    { id:'antifurto',      name:'Antifurto Satellitare',  price:3000,  priceMult:1.00, desc:'-20% premi assicurativi. Tracciamento GPS live.' },
    // ── TUNING MECCANICO ─────────────────────────────────────────────
    { id:'centralina',     name:'🔧 Centralina ECU Sport', price:12000, priceMult:1.05, speedMult:1.28,
      desc:'+28% velocità su mappa. Corsa completata più in fretta. +5% tariffa premium.' },
    { id:'serbatoio_ext',  name:'⛽ Serbatoio Maggiorato', price:8500,  priceMult:1.03, fuelMult:0.45,
      desc:'-55% consumo carburante per corsa. 2× autonomia reale. Più corse prima del refill.' },
    { id:'vetri_oscurati', name:'🕶 Vetri Oscurati Pro',   price:6500,  priceMult:1.00, stealthMult:0.35,
      desc:'-65% rischio sequestro su missioni Shadow e Grey Market. Invisibile ai posti di blocco.' },
    { id:'telepass_car',  name:'🛣 Telepass Auto',        price:3500,  priceMult:1.00, telepassMult:0.85,
      desc:'-15% durata su tutte le corse. Abbonamento incluso.' },
];

// ─── MARKETING CAMPAIGNS ──────────────────────────────────────────
var MARKETING_CAMPAIGNS = [
    // ═══ STARTER ════════════════════════════════════════════════════
    {
        id: 'google_ads',
        name: 'Google Ads',
        icon: '🎯',
        tier: 'starter',
        axis: 'volume',
        dailyCost: 800,
        duration: 7,
        cooldown: 3,
        volumeGain: 4,
        prestigeGain: 0,
        volumeBonus: 0.15,
        prestigeBonus: 0,
        unlockBrand: 0,
        unlockRep: 0,
        synergy: 'social_media',
        synergyBonus: 0.20,
        desc: 'Campagna pay-per-click sui principali motori di ricerca.',
        stratDesc: 'Ideale per aumentare rapidamente le prenotazioni standard. ROI positivo già dal giorno 2 se hai flotta economy attiva. Sinergia con Social Media: +20% bonus diretto se entrambe attive.',
    },
    {
        id: 'social_media',
        name: 'Social Media',
        icon: '📱',
        tier: 'starter',
        axis: 'both',
        dailyCost: 1200,
        duration: 7,
        cooldown: 2,
        volumeGain: 3,
        prestigeGain: 2,
        volumeBonus: 0.10,
        prestigeBonus: 0.05,
        unlockBrand: 0,
        unlockRep: 0,
        synergy: 'influencer',
        synergyBonus: 0.20,
        desc: 'Presenza organica e a pagamento su Instagram, TikTok, LinkedIn.',
        stratDesc: 'L\'unica campagna Starter che aumenta sia Volume che Prestige. Perfetta come campagna sempre attiva nel primo slot. Sinergia con Influencer Partnership (+20% su entrambi i bonus diretti).',
    },
    {
        id: 'radio_locale',
        name: 'Radio Locale',
        icon: '📻',
        tier: 'starter',
        axis: 'volume',
        dailyCost: 500,
        duration: 5,
        cooldown: 2,
        volumeGain: 5,
        prestigeGain: 0,
        volumeBonus: 0.12,
        prestigeBonus: 0,
        unlockBrand: 0,
        unlockRep: 0,
        synergy: 'tv_nazionale',
        synergyBonus: 0.20,
        desc: 'Spot pubblicitari sulle radio locali delle città target.',
        stratDesc: 'Il miglior rapporto costo/VolumeGain nella fascia Starter. Consigliata come campagna principale nelle prime settimane. Sinergia con TV Nazionale: +20% se entrambe attive.',
    },
    {
        id: 'eventi_city',
        name: 'City Events',
        icon: '🎪',
        tier: 'starter',
        axis: 'prestige',
        dailyCost: 1500,
        duration: 3,
        cooldown: 4,
        volumeGain: 0,
        prestigeGain: 4,
        volumeBonus: 0,
        prestigeBonus: 0.10,
        unlockBrand: 0,
        unlockRep: 0,
        synergy: null,
        synergyBonus: 0,
        desc: 'Sponsorizzazione eventi culturali e mondani nelle città principali.',
        stratDesc: 'La campagna Prestige più economica. Corta durata (3 giorni) = alta rotazione. Buona per sbloccare soglie Prestige 25 e poi gestire il decay senza costi elevati.',
    },
    {
        id: 'volantinaggio',
        name: 'Volantinaggio',
        icon: '📄',
        tier: 'starter',
        axis: 'volume',
        dailyCost: 300,
        duration: 4,
        cooldown: 1,
        volumeGain: 6,
        prestigeGain: 0,
        volumeBonus: 0.20,
        prestigeBonus: 0,
        unlockBrand: 0,
        unlockRep: 0,
        synergy: null,
        synergyBonus: 0,
        desc: 'Distribuzione materiale promozionale in hotel, aeroporti e stazioni.',
        stratDesc: 'Costo bassissimo ma alto VolumeGain (+6/g) e volumeBonus +20%. Cooldown di 1 solo giorno = puoi riattivarla quasi sempre. Ottima per accumulo Brand Volume rapido all\'inizio.',
    },

    // ═══ GROWTH ═════════════════════════════════════════════════════
    {
        id: 'tv_nazionale',
        name: 'TV Nazionale',
        icon: '📺',
        tier: 'growth',
        axis: 'both',
        dailyCost: 8000,
        duration: 14,
        cooldown: 7,
        volumeGain: 8,
        prestigeGain: 6,
        volumeBonus: 0.20,
        prestigeBonus: 0.10,
        unlockBrand: 50,
        unlockRep: 0,
        synergy: 'radio_locale',
        synergyBonus: 0.20,
        desc: 'Campagna pubblicitaria su reti televisive nazionali prime time.',
        stratDesc: 'Richiede Brand Volume o Prestige ≥ 50. La campagna Growth con il miglior bilanciamento. 14 giorni di durata = investimento con rendimento prolungato. Ottima come secondo slot con Social Media.',
    },
    {
        id: 'serie_a',
        name: 'Sponsorship Serie A',
        icon: '⚽',
        tier: 'growth',
        axis: 'prestige',
        dailyCost: 12000,
        duration: 30,
        cooldown: 0,
        volumeGain: 0,
        prestigeGain: 10,
        volumeBonus: 0,
        prestigeBonus: 0.25,
        unlockBrand: 50,
        unlockRep: 0,
        synergy: 'luxury_mag',
        synergyBonus: 0.20,
        desc: 'Naming rights su maglie e striscioni in stadi Serie A.',
        stratDesc: 'La campagna Prestige più potente della fascia Growth (+10/g). Durata 30 giorni senza cooldown = puoi tenerla sempre attiva se hai liquidità. Porta Prestige a 100 in 5 giorni da 50.',
    },
    {
        id: 'influencer',
        name: 'Influencer Partnership',
        icon: '⭐',
        tier: 'growth',
        axis: 'volume',
        dailyCost: 6000,
        duration: 10,
        cooldown: 5,
        volumeGain: 10,
        prestigeGain: 2,
        volumeBonus: 0.30,
        prestigeBonus: 0,
        unlockBrand: 50,
        unlockRep: 0,
        synergy: 'social_media',
        synergyBonus: 0.20,
        desc: 'Collaborazione con creator da 500K+ follower nel settore travel & luxury.',
        stratDesc: 'Massimo VolumeGain nella fascia Growth (+10/g). VolumeBonus +30% = enorme spike di corse durante la campagna. Ideale per burst di crescita quando ti serve Volume rapidamente.',
    },
    {
        id: 'airport_brand',
        name: 'Airport Branding',
        icon: '✈️',
        tier: 'growth',
        axis: 'prestige',
        dailyCost: 9000,
        duration: 21,
        cooldown: 7,
        volumeGain: 0,
        prestigeGain: 8,
        volumeBonus: 0,
        prestigeBonus: 0.20,
        unlockBrand: 50,
        unlockRep: 0,
        synergy: 'tv_nazionale',
        synergyBonus: 0.20,
        desc: 'Branding esclusivo nelle aree VIP di MXP, FCO, LIN, NAP.',
        stratDesc: 'Perfetta se hai autisti specializzati in corse aeroportuali. Il prestigioBonus +20% si traduce in più spawn VIP negli scali. Abbina a TV Nazionale per sinergia +20%.',
    },
    {
        id: 'crisis_mgmt',
        name: 'Crisis Management',
        icon: '🛡️',
        tier: 'growth',
        axis: 'both',
        dailyCost: 4000,
        duration: 5,
        cooldown: 10,
        volumeGain: 5,
        prestigeGain: 5,
        volumeBonus: 0,
        prestigeBonus: 0,
        unlockBrand: 50,
        unlockRep: 0,
        synergy: null,
        synergyBonus: 0,
        desc: 'Gestione reputazionale post-incidente o multa grave.',
        stratDesc: 'Non dà bonus diretti alle corse, ma +5/g su entrambi gli assi recupera velocemente il brand damage da incidenti. Usa solo quando hai subito danni significativi al brand.',
    },

    // ═══ EMPIRE ═════════════════════════════════════════════════════
    {
        id: 'formula1',
        name: 'Formula 1 Sponsor',
        icon: '🏎️',
        tier: 'empire',
        axis: 'prestige',
        dailyCost: 35000,
        duration: 30,
        cooldown: 0,
        volumeGain: 5,
        prestigeGain: 15,
        volumeBonus: 0.10,
        prestigeBonus: 0.40,
        unlockBrand: 75,
        unlockRep: 4.0,
        synergy: null,
        synergyBonus: 0,
        repBonus: 0.2,
        desc: 'Sponsorizzazione ufficiale di un team Formula 1 per la stagione.',
        stratDesc: 'La campagna Prestige definitiva. +15/g su Prestige + prestigeBonus +40% = Diamond garantiti ogni 3 giorni. Il +0.2★ reputazione è permanente. Richiede Brand ≥ 75 e rep ≥ 4.0.',
    },
    {
        id: 'luxury_mag',
        name: 'Luxury Magazine',
        icon: '📰',
        tier: 'empire',
        axis: 'prestige',
        dailyCost: 22000,
        duration: 21,
        cooldown: 7,
        volumeGain: 0,
        prestigeGain: 12,
        volumeBonus: 0,
        prestigeBonus: 0.35,
        unlockBrand: 75,
        unlockRep: 0,
        synergy: 'serie_a',
        synergyBonus: 0.20,
        desc: 'Feature editoriale su Robb Report, Forbes Italia, Architectural Digest.',
        stratDesc: 'Più economica di Formula 1 ma ancora molto potente. Abbina a Serie A per sinergia +20% e domina la fascia Prestige. Ideale per tenere Prestige a 100 stabilmente.',
    },
    {
        id: 'forbes_feature',
        name: 'Forbes Feature',
        icon: '💼',
        tier: 'empire',
        axis: 'both',
        dailyCost: 50000,
        duration: 1,
        cooldown: 14,
        volumeGain: 20,
        prestigeGain: 20,
        volumeBonus: 0,
        prestigeBonus: 0,
        unlockBrand: 75,
        unlockRep: 0,
        synergy: null,
        synergyBonus: 0,
        desc: 'Cover story su Forbes Italia. Un solo giorno, impatto massiccio.',
        stratDesc: 'One-shot burst: +20 su entrambi gli assi in un solo giorno. Costo altissimo (€50.000) ma senza bonus alle corse — puro Brand building. Usa per sfondare la soglia 75 rapidamente.',
    },
    {
        id: 'malpensa_lounge',
        name: 'Malpensa Executive Lounge',
        icon: '🛫',
        tier: 'empire',
        axis: 'prestige',
        dailyCost: 15000,
        duration: 14,
        cooldown: 7,
        volumeGain: 0,
        prestigeGain: 9,
        volumeBonus: 0,
        prestigeBonus: 0.28,
        unlockBrand: 75,
        unlockRep: 0,
        synergy: null,
        synergyBonus: 0,
        regionLock: 'lombardia',
        desc: 'Presenza esclusiva nella lounge executive Malpensa MXP. Solo Milano.',
        stratDesc: 'La più economica tra le campagne Empire. Richiede di avere licenza Lombardia attiva. PrestizioBonus +28% sui voli MXP = ottimo se hai autisti dedicati a Malpensa.',
    },
];

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────
const EMAIL_TEMPLATES = {

    poaching: [
        {
            id: 'poach_001',
            senderName: 'Marco Ferretti',
            senderRole: 'Direttore HR, {{rivalName}}',
            senderIcon: '👔',
            subject: 'Proposta per il suo autista {{driverName}}',
            signature: 'Cordialmente,\nMarco Ferretti\nDirettore HR, {{rivalName}}',
            bodies: [
                'Gentile CEO,\n\nLe scrivo a nome di {{rivalName}}. Dopo un\'attenta ricerca di mercato, abbiamo individuato in {{driverName}} un profilo di eccellenza. Siamo pronti a offrirgli un pacchetto retributivo di €{{amount}}/mese, con benefit aggiuntivi e prospettive di crescita concrete.\n\nSiamo certi che saprà valutare questa comunicazione con la professionalità che La contraddistingue.',
                'Gentile Direttore,\n\n{{driverName}} ha attirato la nostra attenzione per le sue eccezionali performance. In {{rivalName}} crediamo nel talento e siamo disposti a riconoscerlo: €{{amount}}/mese, più bonus trimestrali.\n\nLa informiamo per correttezza professionale, nella speranza che possa rifletterci.',
            ]
        },
        {
            id: 'poach_002',
            senderName: 'Valentina Rossi',
            senderRole: 'Head of Talent, {{rivalName}}',
            senderIcon: '💼',
            subject: 'Offerta riservata — {{driverName}}',
            signature: 'Con stima,\nValentina Rossi\nHead of Talent Acquisition, {{rivalName}}',
            bodies: [
                'Egregio Direttore,\n\nAbbiamo condotto un\'analisi approfondita del mercato NCC in {{city}} e il profilo di {{driverName}} è emerso con forza. La nostra offerta: €{{amount}}/mese netti, auto aziendale di rappresentanza e piano welfare completo.\n\nConfidiamo nella sua comprensione.',
                'Gentile CEO,\n\nIn {{rivalName}} siamo sempre alla ricerca dei migliori professionisti. {{driverName}} rappresenta esattamente il profilo che cerchiamo. Offriamo €{{amount}}/mese con contratto a tempo indeterminato e benefit esclusivi.\n\nRimango a disposizione per qualsiasi chiarimento.',
            ]
        },
        {
            id: 'poach_003',
            senderName: 'Dott. Luca Conti',
            senderRole: 'CEO, {{rivalName}}',
            senderIcon: '🕴',
            subject: 'Comunicazione diretta — autista {{driverName}}',
            signature: 'Distinti saluti,\nDott. Luca Conti\nCEO, {{rivalName}}',
            bodies: [
                'Egregio collega,\n\nMi permetto di scriverLe direttamente. Il suo autista {{driverName}} è un professionista di raro valore. Gli abbiamo già proposto €{{amount}}/mese. La informo formalmente, come da prassi del settore.\n\nSono sicuro che comprenderà le regole del mercato.',
                'Caro Direttore,\n\nIl mercato del lusso premia il talento. {{driverName}} merita di lavorare per la struttura più adatta alle sue ambizioni. Noi offriamo €{{amount}}/mese e un ambiente di lavoro all\'altezza.\n\nLa ringrazio per la sua abituale professionalità.',
            ]
        },
        {
            id: 'poach_004',
            senderName: 'Irene Marini',
            senderRole: 'Responsabile Selezione, {{rivalName}}',
            senderIcon: '📋',
            subject: 'Interesse per {{driverName}} — offerta economica',
            signature: 'Cordiali saluti,\nIrene Marini\nResponsabile Selezione del Personale',
            bodies: [
                'Spettabile Direzione,\n\nA seguito di una valutazione interna, abbiamo identificato {{driverName}} come candidato ideale per un ruolo senior nella nostra flotta. La retribuzione proposta è di €{{amount}}/mese, con possibilità di crescita nel primo anno.\n\nLa preghiamo di prendere atto della presente comunicazione.',
                'Gentile CEO,\n\nSiamo specializzati nell\'individuare i migliori autisti NCC sul territorio. {{driverName}} soddisfa pienamente i nostri criteri. L\'offerta economica — €{{amount}}/mese — è stata già comunicata direttamente all\'interessato.\n\nLa ringraziamo per l\'attenzione.',
            ]
        },
        {
            id: 'poach_005',
            senderName: 'Antonio De Luca',
            senderRole: 'Operations Manager, {{rivalName}}',
            senderIcon: '🚗',
            subject: 'Acquisizione profilo {{driverName}} — NCC {{city}}',
            signature: 'Grazie e saluti,\nAntonio De Luca\nOperations Manager',
            bodies: [
                'Buongiorno,\n\nLe comunico che {{rivalName}} ha avviato una trattativa con {{driverName}} per un ingresso nella nostra struttura operativa di {{city}}. Il pacchetto prevede €{{amount}}/mese + rimborso spese + polizza sanitaria integrativa.\n\nRimaniamo in attesa di riscontro da parte sua.',
                'Egregio Direttore,\n\nLa nostra espansione a {{city}} richiede professionisti di alto livello. {{driverName}} è in cima alla nostra lista. Abbiamo preparato un\'offerta di €{{amount}}/mese con incentivi variabili legati alle performance.\n\nDistinti saluti.',
            ]
        },
        {
            id: 'poach_006',
            senderName: 'Sofia Bianchi',
            senderRole: 'Direttrice Risorse Umane',
            senderIcon: '👩‍💼',
            subject: 'Pacchetto esclusivo per {{driverName}}',
            signature: 'A presto,\nSofia Bianchi\nDirettrice HR, {{rivalName}}',
            bodies: [
                'Gentile Direttore,\n\nCi risulta che {{driverName}} sia tra i professionisti più apprezzati della sua flotta. La nostra proposta è strutturata su misura: €{{amount}}/mese, auto premium assegnata, e accesso al circuito clienti VIP di {{rivalName}}.\n\nSperiamo di poter contare sulla sua sportività professionale.',
                'Buongiorno,\n\nIn qualità di HR Director di {{rivalName}}, desidero informarLa formalmente dell\'interesse della nostra azienda verso {{driverName}}. Offerta: €{{amount}}/mese netti con benefit welfare di primo livello.\n\nRimango disponibile per eventuali confronti.',
            ]
        },
        {
            id: 'poach_007',
            senderName: 'Riccardo Esposito',
            senderRole: 'Managing Director, {{rivalName}}',
            senderIcon: '🏆',
            subject: 'Offerta premium — autista {{driverName}}',
            signature: 'Con rispetto,\nRiccardo Esposito\nManaging Director, {{rivalName}}',
            bodies: [
                'Egregio CEO,\n\nIn {{rivalName}} investiamo nei migliori. {{driverName}} ha costruito una reputazione invidiabile nel settore NCC. Gli offriamo €{{amount}}/mese, più una partecipazione agli utili trimestrali.\n\nLa informiamo come gesto di correttezza tra professionisti.',
                'Gentile Direttore,\n\nIl mercato del lusso si muove veloce. {{driverName}} ha qualità che il nostro team sa valorizzare. La nostra offerta di €{{amount}}/mese è tra le più competitive del settore in {{city}}.\n\nDistinti saluti e buon lavoro.',
            ]
        },
        {
            id: 'poach_008',
            senderName: 'Claudia Ferrara',
            senderRole: 'Talent Scout Senior, {{rivalName}}',
            senderIcon: '🔍',
            subject: 'Scouting: profilo {{driverName}} — aggiornamento',
            signature: 'Cordialmente,\nClaudia Ferrara\nSenior Talent Scout, {{rivalName}}',
            bodies: [
                'Spettabile Direzione,\n\nDesidero aggiornarLa: dopo mesi di osservazione, abbiamo formalizzato la nostra offerta a {{driverName}}. Il pacchetto ammonta a €{{amount}}/mese con clausola di revisione semestrale.\n\nComprendiamo che possa essere una notizia scomoda, ma il talento va dove viene valorizzato.',
                'Gentile CEO,\n\nIl nostro network ci ha segnalato {{driverName}} come uno degli autisti NCC più affidabili di {{city}}. Offriamo €{{amount}}/mese più un bonus d\'ingresso immediato.\n\nLa ringraziamo per la comprensione e rimaniamo a disposizione.',
                'Egregio Direttore,\n\n{{rivalName}} è in forte crescita e cerca i migliori talenti. {{driverName}} è esattamente il profilo che ci serve. La nostra offerta: €{{amount}}/mese, netti, con contratto blindato a 24 mesi.\n\nCorrettamente La informiamo prima di procedere.',
            ]
        },
    ],

    ceo_event: [
        {
            id: 'ceo_001',
            senderName: 'Segreteria Gala di Milano',
            senderRole: 'Organizzazione Evento',
            senderIcon: '🥂',
            subject: 'Invito esclusivo — Gala della Mobilità di Lusso {{city}}',
            signature: 'Con i migliori auspici,\nSegreteria Organizzativa\nGala della Mobilità di Lusso',
            bodies: [
                'Egregio CEO,\n\nÈ con grande piacere che La invitiamo al Gala della Mobilità di Lusso di {{city}}, in programma {{day}}. L\'evento riunirà i principali operatori NCC d\'Italia in un\'atmosfera di eleganza e networking esclusivo.\n\nLa sua presenza sarebbe per noi un onore. Dress code: smoking.',
                'Gentile Direttore,\n\nSi terrà {{day}} il Gala Annuale della Mobilità Premium. La invitiamo a partecipare come ospite d\'onore. La serata prevede cena di gala, premiazioni di settore e networking con i CEO più influenti del comparto.\n\nConfermi la sua presenza entro 48 ore.',
            ]
        },
        {
            id: 'ceo_002',
            senderName: 'Forum Economico del Nord Italia',
            senderRole: 'Segreteria Generale',
            senderIcon: '🏛',
            subject: 'Summit CEO — Mobilità e Lusso 2026',
            signature: 'Distinti saluti,\nSegreteria Generale\nForum Economico del Nord Italia',
            bodies: [
                'Egregio Presidente,\n\nSiamo lieti di annunciarLe il Summit CEO dedicato al settore Mobilità & Lusso, previsto per {{day}} a {{city}}. Relatori di fama internazionale e tavole rotonde esclusive attendono i partecipanti selezionati.\n\nLa sua azienda è stata nominata tra le realtà più innovative del settore.',
                'Gentile CEO,\n\nIl Forum Economico del Nord Italia La invita al Summit annuale dedicato alla mobilità di lusso. {{day}}, {{city}}, ore 10:00. Partecipazione su invito personale. Quote di adesione incluse nel pacchetto premium.\n\nAttendiamo conferma.',
            ]
        },
        {
            id: 'ceo_003',
            senderName: 'Club del Golf Imperiale',
            senderRole: 'Segreteria Soci',
            senderIcon: '⛳',
            subject: 'CEO Golf Day — {{day}}, {{city}}',
            signature: 'Alla prossima,\nSegreteria Soci\nClub del Golf Imperiale',
            bodies: [
                'Caro Direttore,\n\nÈ arrivato il momento del nostro CEO Golf Day! {{day}} sul green di {{city}}, tra un drive e l\'altro, si fanno i migliori affari. Colazione di benvenuto, 18 buche, pranzo di gala e networking informale.\n\nI posti sono limitati a 20 partecipanti. La aspettiamo.',
                'Gentile Membro,\n\nIl Club del Golf Imperiale di {{city}} è lieto di invitarLa al CEO Golf Day del {{day}}. Un\'occasione per incontrare colleghi di settore in un contesto rilassato ma esclusivo.\n\nConfermi la sua presenza e il numero di caddie.',
            ]
        },
        {
            id: 'ceo_004',
            senderName: 'Confindustria Trasporti Premium',
            senderRole: 'Ufficio Relazioni Istituzionali',
            senderIcon: '🏅',
            subject: 'Cerimonia di Premiazione — Eccellenze NCC 2026',
            signature: 'Con stima,\nUfficio Relazioni Istituzionali\nConfindustria Trasporti Premium',
            bodies: [
                'Egregio CEO,\n\nÈ con orgoglio che annunciamo la Cerimonia di Premiazione "Eccellenze NCC 2026", in programma {{day}} a {{city}}. La sua azienda è stata candidata nella categoria "Innovazione di Servizio".\n\nLa sua presenza è fondamentale per la credibilità dell\'evento.',
                'Gentile Direttore,\n\nConfindustria Trasporti Premium La invita alla cerimonia annuale di premiazione del settore. {{day}}, {{city}}, Teatro della Scala. Dress code rigoroso. Posti limitati a 50 aziende selezionate.\n\nIn allegato il programma dettagliato della serata.',
            ]
        },
        {
            id: 'ceo_005',
            senderName: 'Associazione CEO d\'Italia',
            senderRole: 'Presidenza',
            senderIcon: '🤝',
            subject: 'Assemblea Annuale CEO — {{day}}',
            signature: 'Con stima collegiale,\nPresidenza\nAssociazione CEO d\'Italia',
            bodies: [
                'Egregio Collega,\n\nL\'Assemblea Annuale dell\'Associazione CEO d\'Italia si terrà {{day}} a {{city}}. Quest\'anno il tema centrale è "Mobilità Sostenibile e Lusso: il Futuro del Settore NCC". La sua esperienza arricchirebbe il dibattito.\n\nIscriversi entro {{day}} dà diritto al posto in prima fila.',
                'Gentile CEO,\n\nSiamo orgogliosi di presentarle il programma dell\'Assemblea Annuale. Keynote, panel di esperti, e la tradizionale cena di chiusura al Grand Hotel di {{city}}. {{day}}, ore 09:30.\n\nLa aspettiamo.',
            ]
        },
        {
            id: 'ceo_006',
            senderName: 'Luxury Business Forum',
            senderRole: 'Event Management',
            senderIcon: '💎',
            subject: 'Invito VIP — Luxury Business Forum {{city}}',
            signature: 'A presto,\nEvent Management Team\nLuxury Business Forum',
            bodies: [
                'Egregio CEO,\n\nIl Luxury Business Forum di {{city}} è l\'evento più esclusivo dell\'anno per i leader del settore premium. {{day}}, Hotel Principe di Savoia. Keynote di ospiti internazionali, networking privato e cocktail di chiusura.\n\nInvito personale non trasferibile.',
                'Gentile Direttore,\n\nSolo 30 CEO selezionati parteciperanno al Luxury Business Forum di quest\'anno. La sua azienda è stata identificata come player di riferimento nel settore NCC. {{day}}, {{city}}.\n\nConfermi via email riservata.',
            ]
        },
        {
            id: 'ceo_007',
            senderName: 'Camera di Commercio di {{city}}',
            senderRole: 'Ufficio Grandi Imprese',
            senderIcon: '🏦',
            subject: 'Tavola Rotonda — Trasporti e Lusso, {{day}}',
            signature: 'Cordiali saluti,\nUfficio Grandi Imprese\nCamera di Commercio di {{city}}',
            bodies: [
                'Spettabile Azienda,\n\nLa Camera di Commercio di {{city}} organizza {{day}} una Tavola Rotonda sul tema "Trasporti di Lusso: Regolamentazione e Opportunità". Parteciperanno rappresentanti istituzionali e i principali operatori NCC della regione.\n\nLa sua partecipazione rafforzerebbe la rappresentatività del tavolo.',
                'Gentile CEO,\n\nSiamo lieti di invitarLa alla Tavola Rotonda annuale dedicata al settore dei trasporti premium. {{day}}, Palazzo della Camera di Commercio, {{city}}. Interventi istituzionali e confronto tra operatori privati.\n\nLa preghiamo di confermare la presenza.',
            ]
        },
        {
            id: 'ceo_008',
            senderName: 'Fondazione Italia Mobilità',
            senderRole: 'Direzione Culturale',
            senderIcon: '🎭',
            subject: 'Serata di Gala — Fondazione Italia Mobilità',
            signature: 'Con affetto istituzionale,\nDirezione Culturale\nFondazione Italia Mobilità',
            bodies: [
                'Egregio Presidente,\n\nLa Fondazione Italia Mobilità La invita alla serata di Gala di raccolta fondi per i programmi di formazione degli autisti di lusso. {{day}}, {{city}}. Cena a sei portate, asta di beneficienza e live music.\n\nIl contributo minimo per la partecipazione è di €{{amount}}.',
                'Gentile CEO,\n\nUn\'altra stagione, un altro Gala. La Fondazione Italia Mobilità {{day}} a {{city}} festeggia dieci anni di eccellenza nel settore. La sua presenza darebbe lustro alla serata.\n\nBiglietti disponibili su richiesta diretta.',
            ]
        },
        {
            id: 'ceo_009',
            senderName: 'Automobilclub d\'Elite',
            senderRole: 'Segreteria Presidente',
            senderIcon: '🚘',
            subject: 'Rally CEO — Tour delle Dolomiti {{day}}',
            signature: 'Buon viaggio,\nSegreteria del Presidente\nAutomobilclub d\'Elite',
            bodies: [
                'Caro CEO,\n\nTorna il Rally CEO attraverso le Dolomiti! {{day}}, partenza da {{city}}, arrivo con cena di gala in alta quota. Un\'esperienza unica tra guida sportiva e networking d\'élite.\n\nPosti limitati a 15 vetture. Iscrizione entro la settimana.',
                'Gentile Collega,\n\nL\'Automobilclub d\'Elite La invita al tradizionale Tour delle Dolomiti riservato ai CEO del settore automotive e mobilità. {{day}}, raduno a {{city}} ore 07:00.\n\nIn allegato la roadmap dell\'evento.',
            ]
        },
        {
            id: 'ceo_010',
            senderName: 'Grand Hotel Palace {{city}}',
            senderRole: 'Relazioni VIP',
            senderIcon: '🏨',
            subject: 'Suite riservata — Summit CEO {{day}}',
            signature: 'Con piacere,\nRelazioni VIP\nGrand Hotel Palace {{city}}',
            bodies: [
                'Egregio Ospite,\n\nIl Grand Hotel Palace di {{city}} è lieto di comunicare che la suite presidenziale Le è stata riservata per il Summit CEO del {{day}}. Check-in ore 15:00, Summit dalle 18:00, cena di gala ore 21:00.\n\nI nostri concierge sono a sua disposizione 24/7.',
                'Gentile Direttore,\n\nIn occasione del Summit CEO del {{day}}, abbiamo predisposto un pacchetto esclusivo: suite superior, accesso alla lounge privata, spa riservata e trasferimento in limousine dall\'aeroporto.\n\nConfermi l\'arrivo e le sue preferenze.',
            ]
        },
        {
            id: 'ceo_011',
            senderName: 'Rotary Club Internazionale — Chapter {{city}}',
            senderRole: 'Presidente di Chapter',
            senderIcon: '🌐',
            subject: 'Cena di Gala Rotary — {{day}}, {{city}}',
            signature: 'Rotary in service,\nPresidente di Chapter\nRotary Club {{city}}',
            bodies: [
                'Gentile CEO,\n\nIl Rotary Club di {{city}} La invita alla Cena di Gala annuale del {{day}}. Un appuntamento irrinunciabile per i leader del tessuto imprenditoriale locale. Serata di beneficienza, musica dal vivo e networking di alto profilo.\n\nLa quota di partecipazione è di €{{amount}} a persona.',
                'Egregio Direttore,\n\nÈ un onore estenderLe l\'invito alla nostra Cena di Gala. Il Rotary di {{city}} riunisce ogni anno {{day}} i CEO e i professionisti più in vista della regione.\n\nPosti esauriti rapidamente — confermi al più presto.',
            ]
        },
        {
            id: 'ceo_012',
            senderName: 'Istituto della Mobilità Sostenibile',
            senderRole: 'Direttore Scientifico',
            senderIcon: '🌿',
            subject: 'Conferenza annuale — NCC Green 2026',
            signature: 'Con rispetto accademico,\nProf. {{ceoName}}\nDirettore Scientifico, IMS',
            bodies: [
                'Spettabile CEO,\n\nL\'Istituto della Mobilità Sostenibile La invita alla Conferenza Annuale NCC Green 2026, {{day}} a {{city}}. Si dibatterà di elettrificazione delle flotte, normative europee e opportunità di incentivo per gli operatori NCC.\n\nLa sua testimonianza diretta arricchirebbe il programma.',
                'Gentile Direttore,\n\nNCC Green 2026 è l\'evento di riferimento per chi opera nella mobilità di lusso sostenibile. {{day}}, {{city}}. Relatori da tutta Europa, workshop pratici e sessioni di confronto tra operatori.\n\nInscriviti ora — posti limitati.',
            ]
        },
    ],

    grey_market: [
        {
            id: 'grey_001',
            senderName: 'Fonte Anonima',
            senderRole: 'Informatore di Settore',
            senderIcon: '🕵️',
            subject: 'Segnalazione riservata — attività irregolare a {{city}}',
            signature: '[Mittente anonimo]\nCanale criptato',
            bodies: [
                'CEO,\n\nHo saputo che a {{city}} opera una rete di NCC abusivi organizzata. Tariffe al nero, nessuna assicurazione, clientela ignara. Il giro vale circa €{{amount}}/settimana.\n\nSe vuoi intervenire — o approfittarne — sai come trovarmi. Non rispondere a questa mail.',
                'Direttore,\n\nUna fonte nel porto di {{city}} mi ha riferito di un\'organizzazione che gestisce trasporti "ufficiosamente". Clienti di alto bordo, nessuna fattura, tariffe doppie rispetto al mercato. Giro d\'affari stimato: €{{amount}}/mese.\n\nFacci sapere se sei interessato a saperne di più.',
            ]
        },
        {
            id: 'grey_002',
            senderName: 'Il Corvo',
            senderRole: 'Informatore indipendente',
            senderIcon: '🦅',
            subject: 'Concorrenza sleale — zona {{city}}',
            signature: 'Il Corvo\n[identità protetta]',
            bodies: [
                'Boss,\n\nQuella zona tra il porto e l\'aeroporto di {{city}} è terra di nessuno. Almeno tre operatori abusivi raccolgono clienti ogni giorno senza licenza. Incassano €{{amount}} a settimana in contanti.\n\nSe vuoi che quella fetta di mercato torni a chi di dovere, posso aiutare.',
                'Direttore,\n\nUn\'insider dell\'aeroporto di {{city}} mi ha passato i dettagli di un giro parallelo. Autisti senza NCC, clienti VIP inconsapevoli. Il volume mensile supera €{{amount}}.\n\nSta a te decidere il da farsi. Io ho fatto la mia parte.',
            ]
        },
        {
            id: 'grey_003',
            senderName: 'Guardia di Finanza — Nucleo Speciale',
            senderRole: '[email non verificabile]',
            senderIcon: '⚠️',
            subject: 'ATTENZIONE: attività non autorizzate rilevate — {{city}}',
            signature: '[Non rispondere a questa comunicazione]',
            bodies: [
                'AVVISO RISERVATO\n\nSono stati rilevati movimenti anomali nel settore NCC di {{city}}. Operatori non registrati con volume d\'affari superiore a €{{amount}}/mese. La segnalazione è in corso di verifica.\n\nSe sei a conoscenza di tali attività, sei tenuto a comunicarlo alle autorità competenti.',
                'COMUNICAZIONE INTERNA\n\nNucleo Speciale GdF — Operazione Taxi Ombra. Rilevati 7 veicoli non autorizzati nella zona di {{city}}. Giro stimato €{{amount}}/settimana. Operazione in corso.\n\nRiservato. Non divulgare.',
            ]
        },
        {
            id: 'grey_004',
            senderName: 'Massimo N.',
            senderRole: 'Vecchio contatto di settore',
            senderIcon: '🤫',
            subject: 'Ti passo una cosa interessante...',
            signature: 'M.\n[cancella dopo aver letto]',
            bodies: [
                'Ciao,\n\nSento che a {{city}} c\'è un tipo che muove clienti VIP senza licenza. Ha agganci negli hotel a cinque stelle, dicono che fatturi €{{amount}} al mese in nero.\n\nTi do i contatti se vuoi fare due conti insieme. O se vuoi toglierlo dai piedi tu.',
                'Direttore,\n\nUn amico comune mi ha detto di segnalarti questa situazione. C\'è chi a {{city}} fa il tuo lavoro senza pagare tasse né contributi. €{{amount}}/mese finiscono in tasca senza passare da nessun registro.\n\nPotrebbe essere un\'opportunità o un problema. Dipende da te.',
            ]
        },
        {
            id: 'grey_005',
            senderName: 'Network Intelligence NCC',
            senderRole: 'Divisione Monitoraggio Concorrenza',
            senderIcon: '📡',
            subject: 'Alert mercato grigio — zona {{city}}',
            signature: 'NIN — Network Intelligence NCC\nRapporto automatico',
            bodies: [
                'ALERT AUTOMATICO\n\nIl nostro sistema ha rilevato attività NCC non autorizzate nella zona di {{city}}. Volume stimato: €{{amount}}/settimana. Tipologia: trasporti aeroportuali e congressuali.\n\nSi consiglia monitoraggio attivo e segnalazione alle autorità se ritenuto opportuno.',
                'RAPPORTO CONCORRENZA\n\nZona: {{city}} — Centro/Porto.\nOperatori irregolari rilevati: 4.\nFatturato stimato grey market: €{{amount}}/mese.\nRischio per operatori regolari: ALTO.\n\nSi consiglia azione entro 7 giorni.',
            ]
        },
        {
            id: 'grey_006',
            senderName: 'Anonimo',
            senderRole: '',
            senderIcon: '📩',
            subject: 'Sai cosa succede la notte a {{city}}?',
            signature: '—',
            bodies: [
                'Caro CEO,\n\nLa notte a {{city}} certi autisti lavorano senza divisa, senza app, senza niente. Clienti di club privati, hotel di lusso, eventi esclusivi. Incassano €{{amount}} a serata.\n\nMe l\'ha detto un portiere di albergo. Pensavo te lo dovessi far sapere.',
                'Boss,\n\nQuella zona degli hotel di lusso a {{city}} è territorio non presidiato. Chiunque può raccogliere clienti. C\'è chi lo fa già — e guadagna €{{amount}} a settimana senza nemmeno una licenza.\n\nSe vuoi presidiarla, muoviti prima degli altri.',
            ]
        },
        {
            id: 'grey_007',
            senderName: 'Studio Legale Aversa & Associati',
            senderRole: 'Consulenza Antitrust e Regolamentazione',
            senderIcon: '⚖️',
            subject: 'Segnalazione abusi di mercato — {{city}}',
            signature: 'Avv. Filippo Aversa\nStudio Legale Aversa & Associati',
            bodies: [
                'Egregio Cliente,\n\nAbbiamo rilevato anomalie competitive nella zona di {{city}} che potrebbero ledere i diritti degli operatori regolari. Entità irregolari con giro d\'affari di circa €{{amount}}/mese operano senza autorizzazioni.\n\nLe consigliamo di valutare un esposto formale o un\'azione diretta di mercato.',
                'Gentile CEO,\n\nIn risposta alla sua richiesta di monitoraggio competitivo, segnaliamo la presenza di operatori abusivi a {{city}} con volumi stimati in €{{amount}}/mese. Siamo pronti ad assisterLa nelle azioni legali necessarie.\n\nDistinti saluti professionali.',
            ]
        },
        {
            id: 'grey_008',
            senderName: 'Dario F.',
            senderRole: 'Ex autista, ora consulente',
            senderIcon: '🚕',
            subject: 'Roba che so io — ti può interessare',
            signature: 'Dario\n(sai come trovarmi)',
            bodies: [
                'Capo,\n\nHo lavorato per un\'organizzazione a {{city}} prima di mettermi in proprio. Quello che fanno è semplice: raccolgono clienti dagli hotel senza licenza, cash, nessuna ricevuta. Volume settimanale: €{{amount}}.\n\nSe ti serve qualcuno che conosce i meccanismi dall\'interno, sono disponibile.',
                'Direttore,\n\nUno che lavora all\'aeroporto di {{city}} mi ha dato i nomi di chi gestisce il giro abusivo nella zona. €{{amount}}/mese in nero, tutto sotto il radar. Vuoi sapere di più? Trovami al solito posto.',
            ]
        },
    ],

    shadow: [
        {
            id: 'shadow_001',
            senderName: 'Agenzia Ombra',
            senderRole: 'Intelligence Competitiva',
            senderIcon: '🕶',
            subject: 'Rapporto riservato — attività di {{rivalName}}',
            signature: 'Agenzia Ombra\n[comunicazione criptata — non conservare]',
            bodies: [
                'CEO,\n\nIl nostro agente a {{city}} ha monitorato {{rivalName}} negli ultimi 14 giorni. Risultati: espansione flotta di 3 veicoli, assunzione di 2 nuovi autisti senior, accordo preliminare con l\'Hotel Grand Palace.\n\nSi consiglia risposta strategica entro 10 giorni.',
                'Direttore,\n\nRapporto mensile su {{rivalName}}: fatturato in crescita del 18%, nuovi contratti corporate con due multinazionali di {{city}}, e voci di un round di investimento privato.\n\nLa situazione competitiva si sta evolvendo rapidamente.',
            ]
        },
        {
            id: 'shadow_002',
            senderName: 'Network di Informatori',
            senderRole: 'Divisione Analisi Rivali',
            senderIcon: '📊',
            subject: 'Intel su {{rivalName}} — aggiornamento settimanale',
            signature: 'Network di Informatori\nRapporto #{{amount}}',
            bodies: [
                'Aggiornamento settimanale:\n\n{{rivalName}} ha perso due clienti VIP questa settimana, secondo le nostre fonti interne. Il loro autista di punta ha manifestato insoddisfazione per le condizioni di lavoro.\n\nFinestra di opportunità stimata: 3-4 settimane.',
                'INTEL RISERVATO\n\n{{rivalName}} sta trattando l\'acquisizione di una piccola flotta a {{city}}. Se l\'operazione va in porto, il loro parco auto crescerebbe del 40%.\n\nSi suggerisce monitoraggio costante e azione preventiva sul territorio.',
            ]
        },
        {
            id: 'shadow_003',
            senderName: 'Osservatorio NCC Italia',
            senderRole: 'Unità Analisi Competitiva',
            senderIcon: '🔭',
            subject: 'Analisi competitor — {{rivalName}}, {{city}}',
            signature: 'Osservatorio NCC Italia\nUnità Analisi Competitiva',
            bodies: [
                'RAPPORTO TRIMESTRALE\n\nSoggetto: {{rivalName}}\nZona operativa: {{city}}\nPunti di forza: reputazione consolidata, clientela fidelizzata.\nPunti di debolezza: flotta datata, turnover autisti elevato.\n\nOpportunità per la sua azienda: aggredire il segmento corporate non presidiato.',
                'Egregio CEO,\n\n{{rivalName}} ha mostrato segni di difficoltà finanziaria nell\'ultimo trimestre. Ritardi nei pagamenti ai fornitori e riduzione dei servizi notturni.\n\nLa finestra per sottrarre quote di mercato è aperta. Agisca con tempestività.',
            ]
        },
        {
            id: 'shadow_004',
            senderName: 'Fonte interna [protetta]',
            senderRole: 'Ex dipendente {{rivalName}}',
            senderIcon: '🤐',
            subject: 'Informazioni dall\'interno — {{rivalName}}',
            signature: '[Fonte protetta]\nCanale sicuro',
            bodies: [
                'CEO,\n\nHo lavorato per {{rivalName}} fino al mese scorso. So come funzionano. Il loro margine reale è del 12%, molto meno di quanto dichiarano. E il contratto con l\'aeroporto di {{city}} è in scadenza tra 60 giorni.\n\nSe vuoi i dettagli, sai come contattarmi in modo sicuro.',
                'Direttore,\n\nDall\'interno di {{rivalName}} arrivano segnali di tensione. Il CEO e il CFO litigano sulla direzione strategica. Due autisti senior stanno valutando di andarsene.\n\nMomento ideale per fare offerte concrete ai loro migliori profili.',
            ]
        },
        {
            id: 'shadow_005',
            senderName: 'BriefingMarket SRL',
            senderRole: 'Consulenza Strategica',
            senderIcon: '📋',
            subject: 'Briefing competitivo mensile — {{rivalName}}',
            signature: 'Team BriefingMarket\nConsulenza Strategica NCC',
            bodies: [
                'Gentile Cliente,\n\nIl briefing di questo mese riguarda {{rivalName}}. Hanno aperto un nuovo garage a {{city}} con capacità per 8 veicoli aggiuntivi. Il piano è di aumentare le corse aeroportuali del 30% entro fine trimestre.\n\nLa sua risposta strategica dovrebbe essere immediata.',
                'Spettabile Direzione,\n\n{{rivalName}} ha siglato un accordo di partnership con una catena alberghiera di {{city}}. Impatto stimato: +25 corse/settimana garantite. La situazione richiede un intervento sulla fidelizzazione dei suoi clienti attuali.',
            ]
        },
        {
            id: 'shadow_006',
            senderName: 'Marco — Contatto Porto',
            senderRole: 'Informatore locale',
            senderIcon: '⚓',
            subject: 'Cosa ho visto al porto di {{city}}',
            signature: 'Marco\n[non richiamare su questo numero]',
            bodies: [
                'Boss,\n\nIeri sera al porto di {{city}} ho visto tre auto di {{rivalName}} che aspettavano l\'attracco del cruise liner. Erano lì prima di tutti. Qualcuno gli ha passato il programma degli arrivi in anticipo.\n\nQualcuno dentro ha i contatti giusti. Vuoi che faccia accertamenti?',
                'Capo,\n\n{{rivalName}} ha piazzato un autista fisso al porto di {{city}} tutti i giorni. Raccoglie clienti appena scendono dalle navi. Si parla di €{{amount}} a settimana solo da quel segmento.\n\nSe vuoi entrare in quella fetta, devi muoverti adesso.',
            ]
        },
        {
            id: 'shadow_007',
            senderName: 'Intelligence Corporate',
            senderRole: 'Servizio di Monitoraggio Premium',
            senderIcon: '🔐',
            subject: 'Alert strategico — mossa di {{rivalName}}',
            signature: 'Intelligence Corporate\nServizio Premium — Rapporto automatico',
            bodies: [
                'ALERT STRATEGICO\n\n{{rivalName}} ha pubblicato un annuncio di selezione per 5 nuovi autisti senior. Budget retributivo stimato: €{{amount}}/mese totali.\n\nSi tratta di un segnale chiaro di espansione. Si consiglia di verificare la solidità della propria flotta.',
                'NOTIFICA IMMEDIATA\n\n{{rivalName}} ha aggiornato la propria app con funzionalità di prenotazione anticipata a 30 giorni. L\'upgrade è costato circa €{{amount}}.\n\nSi raccomanda di valutare investimenti tecnologici analoghi per rimanere competitivi.',
            ]
        },
        {
            id: 'shadow_008',
            senderName: 'Agenzia Specchio',
            senderRole: 'Controspionaggio Commerciale',
            senderIcon: '🪞',
            subject: 'URGENTE — {{rivalName}} si muove su {{city}}',
            signature: 'Agenzia Specchio\n[contatto monouso]',
            bodies: [
                'CEO — URGENTE\n\n{{rivalName}} ha acquisito questa settimana i diritti esclusivi per i trasporti di un grande evento a {{city}} il {{day}}. Valore stimato dell\'appalto: €{{amount}}.\n\nSe vuole contestare l\'assegnazione o prepararsi a coprire i segmenti residuali, deve agire entro 48 ore.',
                'FLASH INTEL\n\n{{rivalName}} è in trattativa avanzata con l\'aeroporto di {{city}} per uno slot esclusivo di raccolta clienti business class.\n\nSe l\'accordo va in porto, il loro vantaggio competitivo diventa strutturale. Si raccomanda azione immediata.',
            ]
        },
    ],

    vip_request: [
        {
            id: 'vip_001',
            senderName: 'Dott.ssa Eleonora Savini',
            senderRole: 'Assistente personale del Senatore Marchetti',
            senderIcon: '⭐',
            subject: 'Richiesta servizio NCC — {{day}}, {{city}}',
            signature: 'Cordialmente,\nDott.ssa Eleonora Savini\nAssistente Personale',
            bodies: [
                'Spettabile Direzione,\n\nIl Senatore Marchetti necessita di un servizio di trasporto riservato per {{day}} a {{city}}. Partenza ore 08:30 dall\'Hotel Excelsior, arrivo Palazzo del Senato. Il Senatore richiede massima discrezione e puntualità assoluta.\n\nLa retribuzione concordata è di €{{amount}} per la giornata. Confermi disponibilità.',
                'Gentile Azienda,\n\nPer conto del mio assistito, richiedo un autista per l\'intera giornata del {{day}} a {{city}}. Profilo richiesto: esperienza con clienti istituzionali, conoscenza del protocollo, abito scuro obbligatorio.\n\nPrezzo: €{{amount}} tutto incluso. Risponda entro oggi.',
            ]
        },
        {
            id: 'vip_002',
            senderName: 'Chiara Montesi',
            senderRole: 'PA — Studio Legale Montesi & Partners',
            senderIcon: '💼',
            subject: 'Transfer urgente per cliente VIP — {{city}}',
            signature: 'Grazie,\nChiara Montesi\nPersonal Assistant',
            bodies: [
                'Buongiorno,\n\nAbbiamo necessità di un transfer urgente per un nostro cliente di rilievo. {{day}}, {{city}}, tratto aeroporto-Hotel Quattro Stagioni. Cliente di nazionalità straniera, richiede autista con conoscenza dell\'inglese e acqua minerale a bordo.\n\nDisponiamo di un budget di €{{amount}}. Risposta urgente richiesta.',
                'Gentile Azienda,\n\nUn nostro partner internazionale arriva a {{city}} il {{day}}. Ha bisogno di un servizio di alto livello: auto berlina premium, autista in divisa, zero compromessi sulla puntualità.\n\nPagamento immediato: €{{amount}}. Confermate?',
            ]
        },
        {
            id: 'vip_003',
            senderName: 'Grand Hotel Villa d\'Este',
            senderRole: 'Concierge Service',
            senderIcon: '🏰',
            subject: 'Richiesta transfer per ospiti — {{day}}',
            signature: 'Con rispetto,\nConcierge Service\nGrand Hotel Villa d\'Este',
            bodies: [
                'Spettabile NCC,\n\nPer conto di due dei nostri ospiti di suite presidenziale, siamo alla ricerca di un servizio di trasporto esclusivo per {{day}}. Percorso: Villa d\'Este — Milano centro — ritorno. Budget: €{{amount}}.\n\nI nostri ospiti sono abituati al meglio. La qualità del servizio rifletterà sulla nostra struttura.',
                'Gentile Direttore,\n\nIl Grand Hotel Villa d\'Este richiede un autista dedicato per {{day}} per accompagnare tre ospiti VIP in giro per {{city}}. Disponibilità richiesta: ore 09:00-20:00. Compenso: €{{amount}} netti.',
            ]
        },
        {
            id: 'vip_004',
            senderName: 'Produzione Cinema Lux',
            senderRole: 'Coordinamento Logistico',
            senderIcon: '🎬',
            subject: 'Trasporti per cast cinematografico — {{city}}, {{day}}',
            signature: 'Grazie per la collaborazione,\nCoordinamento Logistico\nCinema Lux Productions',
            bodies: [
                'Egregio CEO,\n\nStiamo girando a {{city}} il {{day}} e abbiamo bisogno di 2 autisti per il trasporto del cast principale. Massima discrezione obbligatoria — NDA richiesto. Budget totale: €{{amount}} per la giornata.\n\nPersonale stampa sul set: la riservatezza è non negoziabile.',
                'Buongiorno,\n\nProduciamo un film con cast internazionale attualmente a {{city}}. Cerchiamo autisti in grado di gestire talent di livello mondiale. Il {{day}} abbiamo bisogno di copertura completa dalle 06:00 alle 24:00.\n\nOfferta: €{{amount}} per veicolo. Rispondete oggi.',
            ]
        },
        {
            id: 'vip_005',
            senderName: 'Fondazione Arte e Cultura',
            senderRole: 'Segreteria Direttore',
            senderIcon: '🎨',
            subject: 'Servizio per vernissage — {{city}}, {{day}}',
            signature: 'Con stima,\nSegreteria del Direttore\nFondazione Arte e Cultura',
            bodies: [
                'Spettabile Azienda,\n\nIn occasione del vernissage della nuova mostra alla Fondazione Arte e Cultura di {{city}}, {{day}}, siamo alla ricerca di un servizio di transfer per i collezionisti e ospiti internazionali.\n\nBudget disponibile: €{{amount}} per la serata. Eleganza e discrezione sono requisiti fondamentali.',
                'Gentile Direttore,\n\nIl vernissage del {{day}} accoglierà circa 15 ospiti d\'onore da tutta Europa. Cerchiamo un NCC in grado di gestire arrivi scaglionati all\'aeroporto di {{city}} e trasferimenti verso la sede della Fondazione.\n\nPagamento: €{{amount}} a forfait.',
            ]
        },
        {
            id: 'vip_006',
            senderName: 'Marianna Greco',
            senderRole: 'Assistente CEO, Gruppo Lusso Italia',
            senderIcon: '💎',
            subject: 'Autista dedicato per amministratore delegato',
            signature: 'Distinti saluti,\nMarianna Greco\nAssistente di Direzione',
            bodies: [
                'Buongiorno,\n\nIl nostro Amministratore Delegato necessita di un autista personale dedicato per il mese di {{day}} con base a {{city}}. Disponibilità richiesta: lunedì-venerdì, 07:00-22:00, con reperibilità weekend.\n\nRetribuzione: €{{amount}}/mese. Esperienza con clientela di alto profilo indispensabile.',
                'Gentile CEO,\n\nCerchiamo un autista di fiducia per il nostro AD, in servizio a {{city}} a partire da {{day}}. Il profilo ideale ha esperienza in contesti corporate di lusso, inglese fluente e massima riservatezza.\n\nOfferta: €{{amount}}/mese + benefit.',
            ]
        },
        {
            id: 'vip_007',
            senderName: 'Consolato Generale',
            senderRole: 'Ufficio Protocollo',
            senderIcon: '🏛',
            subject: 'Richiesta autista per delegazione ufficiale — {{day}}',
            signature: 'Con riguardo istituzionale,\nUfficio Protocollo\nConsolato Generale',
            bodies: [
                'Spettabile Operatore NCC,\n\nIl Consolato Generale richiede un servizio di trasporto per una delegazione ufficiale in visita a {{city}} il {{day}}. Veicolo: berlina nera di rappresentanza. Autista: abito scuro, italiano e inglese fluente.\n\nCompenso: €{{amount}}. Confermate la disponibilità?',
                'Egregio Direttore,\n\nPer conto della delegazione in visita ufficiale il {{day}} a {{city}}, siamo alla ricerca di un NCC di alto livello. I requisiti di protocollo sono stringenti. Budget: €{{amount}} per l\'intera giornata.',
            ]
        },
        {
            id: 'vip_008',
            senderName: 'Lorenzo Venier',
            senderRole: 'Imprenditore',
            senderIcon: '🤵',
            subject: 'Richiesta personale — autista per matrimonio',
            signature: 'Grazie,\nLorenzo Venier',
            bodies: [
                'Buongiorno,\n\nMi sposo il {{day}} a {{city}} e cerco un servizio NCC impeccabile per gli sposi e i testimoni. Vettura: berlina di lusso, bianca o argento. Autista: divisa elegante, nessun ritardo tollerato.\n\nSono disposto a pagare €{{amount}} per la giornata. Il meglio o niente.',
                'Gentile Azienda,\n\nIl matrimonio è il {{day}}. Ho bisogno di un autista che conosca {{city}} come le sue tasche e che abbia esperienza con eventi nuziali VIP.\n\nBudget: €{{amount}}. Rispondete entro domani mattina.',
            ]
        },
        {
            id: 'vip_009',
            senderName: 'Segreteria Personale',
            senderRole: 'Per conto di cliente anonimo',
            senderIcon: '🔒',
            subject: 'Richiesta riservata — trasporto cliente anonimo',
            signature: '[Segreteria riservata]\nContatto tramite intermediario',
            bodies: [
                'Spettabile Direzione,\n\nUn nostro cliente preferisce mantenere l\'anonimato. Necessita di un transfer il {{day}} a {{city}}, tratto privato con massima riservatezza. Nessuna registrazione del percorso richiesta.\n\nCompenso: €{{amount}} in contanti. Interesse?',
                'Gentile CEO,\n\nPer ragioni di sicurezza, il nostro cliente non può rivelare la propria identità. Il servizio richiesto è un transfer {{day}} da {{city}} verso destinazione da comunicare il giorno stesso.\n\nPagamento: €{{amount}} anticipati.',
            ]
        },
        {
            id: 'vip_010',
            senderName: 'Azienda Farmaceutica Salus',
            senderRole: 'Ufficio Logistica',
            senderIcon: '🏥',
            subject: 'Trasporto dirigente per meeting internazionale',
            signature: 'Distinti saluti,\nUfficio Logistica\nSalus SpA',
            bodies: [
                'Buongiorno,\n\nIl nostro Direttore Medico partecipa a un meeting internazionale a {{city}} il {{day}}. Cerchiamo un NCC affidabile per trasporto aeroporto-centro congressi e rientro serale.\n\nBudget: €{{amount}}. Autista puntuale e professionale è il minimo indispensabile.',
                'Gentile Azienda,\n\nAbbiamo una delegazione di 4 dirigenti in arrivo a {{city}} il {{day}}. Cerchiamo due vetture con autisti esperti per il trasporto durante l\'intera giornata di lavoro.\n\nOfferta: €{{amount}} totali. Confermate.',
            ]
        },
    ],

    diamond: [
        {
            id: 'diamond_001',
            senderName: 'Principessa Alessandra von Hartenberg',
            senderRole: 'Casa Reale von Hartenberg',
            senderIcon: '👑',
            subject: 'Richiesta servizio Diamond — visita a {{city}}',
            signature: 'Per conto di S.A.R.,\nSegreteria di Corte\nCasa von Hartenberg',
            bodies: [
                'Spettabile Direttore,\n\nS.A.R. la Principessa Alessandra sarà a {{city}} il {{day}} e richiede un servizio di trasporto adeguato al suo rango. Rolls-Royce o equivalente, autista con esperienza in protocollo reale, scorta discreta.\n\nIl compenso non è in discussione: €{{amount}} per la giornata. Siete in grado di soddisfare questi standard?',
                'Egregio CEO,\n\nLa Casa Reale von Hartenberg seleziona con estrema cura i propri fornitori di servizi. Il vostro nome ci è stato segnalato come eccellenza nel settore NCC di {{city}}.\n\nSe avete le risorse e il savoir-faire necessari, contattate la segreteria. Compenso: €{{amount}}.',
            ]
        },
        {
            id: 'diamond_002',
            senderName: 'Hamid Al-Rashid',
            senderRole: 'Ufficio Privato — Famiglia Al-Rashid',
            senderIcon: '🌟',
            subject: 'Servizio esclusivo per famiglia Al-Rashid — {{city}}',
            signature: 'Con rispetto,\nUfficio Privato\nFamiglia Al-Rashid',
            bodies: [
                'Gentile Direttore,\n\nLa famiglia Al-Rashid trascorrerà una settimana a {{city}} a partire da {{day}}. Necessitano di 3 veicoli con autisti dedicati, disponibili 24/7, con conoscenza di arabo e inglese.\n\nIl budget settimanale è di €{{amount}}. Nessun compromesso sulla qualità.',
                'Spettabile CEO,\n\nPer conto della famiglia Al-Rashid, siamo alla ricerca del miglior servizio NCC disponibile a {{city}}. La loro visita prevede eventi privati, shopping di lusso e cene in ristoranti selezionati.\n\nOfferta: €{{amount}} per l\'intera permanenza.',
            ]
        },
        {
            id: 'diamond_003',
            senderName: 'Cristina Lombardi',
            senderRole: 'CEO, Lombardi Fashion Group',
            senderIcon: '👗',
            subject: 'Autista per Fashion Week — {{city}}',
            signature: 'Grazie,\nCristina Lombardi\nCEO, Lombardi Fashion Group',
            bodies: [
                'Caro CEO,\n\nDurante la Fashion Week di {{city}} ho bisogno di un autista dedicato che mi segua in ogni spostamento, dal {{day}} per tutta la settimana. Massima flessibilità, auto sportiva elegante, riservatezza assoluta.\n\nPago €{{amount}} per i 7 giorni. Voglio il meglio.',
                'Gentile Azienda,\n\nLombardi Fashion Group ha bisogno di un servizio premium durante la Fashion Week. Tre autisti, tre veicoli di lusso, disponibilità 06:00-02:00.\n\nBudget totale: €{{amount}}. Interesse?',
            ]
        },
        {
            id: 'diamond_004',
            senderName: 'Massimiliano Orsini',
            senderRole: 'Private Banking, Banca Imperiale',
            senderIcon: '💰',
            subject: 'Servizio NCC per cliente private banking',
            signature: 'Con discrezione,\nMassimiliano Orsini\nPrivate Banker, Banca Imperiale',
            bodies: [
                'Egregio CEO,\n\nUno dei nostri clienti private con portafoglio superiore ai €50M richiede un servizio NCC dedicato per un periodo di 3 mesi a {{city}}. Budget mensile: €{{amount}}.\n\nL\'identità del cliente è riservata. Disponete delle credenziali necessarie per gestire questo livello?',
                'Gentile Direttore,\n\nBanca Imperiale seleziona i propri partner logistici con la stessa cura con cui gestisce i portafogli. Il servizio richiesto è per un cliente ultra-HNW in visita a {{city}} dal {{day}}.\n\nCompensazione: €{{amount}}. Solo i migliori.',
            ]
        },
        {
            id: 'diamond_005',
            senderName: 'Arturo Benedetti',
            senderRole: 'Produttore musicale internazionale',
            senderIcon: '🎵',
            subject: 'Tour europeo — servizio NCC {{city}}',
            signature: 'Rock on,\nArturo Benedetti\nManagement Team',
            bodies: [
                'Ciao CEO,\n\nStiamo organizzando la tappa italiana di un tour musicale internazionale. L\'artista — top 10 mondiale — sarà a {{city}} il {{day}} e nei giorni seguenti.\n\nAbbiamo bisogno di 2 SUV premium con autisti che sappiano gestire fan e media. Budget: €{{amount}}. NDA obbligatorio.',
                'Spettabile Azienda,\n\nPer un artista di fama mondiale in tour a {{city}}, cerchiamo un NCC di altissimo livello. Nessuna foto, nessuna indiscrezione, discrezione totale.\n\nCompenso: €{{amount}}. Rispondete in giornata.',
            ]
        },
        {
            id: 'diamond_006',
            senderName: 'Conte Alessandro Visconti',
            senderRole: 'Casata Visconti',
            senderIcon: '🏰',
            subject: 'Servizio di rappresentanza — Casata Visconti',
            signature: 'Con stima nobiliare,\nConte Alessandro Visconti',
            bodies: [
                'Egregio Direttore,\n\nLa Casata Visconti organizza un ricevimento a {{city}} il {{day}}. Abbiamo bisogno di un servizio di trasporto per 12 ospiti illustri — diplomatici, industriali e rappresentanti della cultura.\n\nIl compenso è di €{{amount}} per la serata. L\'eleganza è l\'unico standard accettabile.',
                'Gentile CEO,\n\nPer un evento privato della Casata Visconti, cerchiamo il NCC più prestigioso di {{city}}. Quattro vetture, autisti in livrea, puntualità svizzera.\n\nOfferta: €{{amount}}. Solo se siete all\'altezza.',
            ]
        },
        {
            id: 'diamond_007',
            senderName: 'Yuki Tanaka',
            senderRole: 'Personal Advisor — Famiglia Tanaka',
            senderIcon: '🗾',
            subject: 'Servizio ultra-premium — famiglia Tanaka, {{city}}',
            signature: 'Arigatou gozaimasu,\nYuki Tanaka\nPersonal Advisor',
            bodies: [
                'Buongiorno,\n\nLa famiglia Tanaka, imprenditori giapponesi di primo piano, sarà a {{city}} dal {{day}} per 10 giorni. Richiedono un autista che parli inglese fluentemente, con conoscenza della cultura orientale.\n\nBudget: €{{amount}} per tutto il periodo. Zero difetti tollerati.',
                'Egregio CEO,\n\nPer i miei clienti, il meglio non è mai abbastanza. La famiglia Tanaka ha standard elevatissimi. Se la sua azienda è davvero la migliore di {{city}}, dimostratelo.\n\nCompenso: €{{amount}}. Risposta entro domani.',
            ]
        },
        {
            id: 'diamond_008',
            senderName: 'Segreteria Riservata',
            senderRole: 'Per conto di cliente Diamond [non divulgabile]',
            senderIcon: '💠',
            subject: 'Richiesta Diamond Tier — massima riservatezza',
            signature: '[Contatto criptato]\nSegreteria Diamond',
            bodies: [
                'Spettabile CEO,\n\nUn cliente di profilo eccezionale richiede un servizio NCC su misura a {{city}} per il {{day}}. I dettagli dell\'itinerario verranno comunicati solo all\'autista scelto, il giorno stesso.\n\nCompenso: €{{amount}}. Firma NDA richiesta prima di procedere.',
                'Gentile Direttore,\n\nIl nostro cliente Diamond richiede il silenzio assoluto. Nessun dato personale, nessun registro del percorso, pagamento in anticipo.\n\nBudget: €{{amount}}. Se accettate le condizioni, rispondete con una parola: CONFERMATO.',
            ]
        },
    ],

    broker_result: [
        {
            id: 'broker_001',
            senderName: 'Roberto Salvi',
            senderRole: 'Broker Finanziario, Salvi & Partners',
            senderIcon: '📈',
            subject: 'Aggiornamento portafoglio — settimana {{day}}',
            signature: 'Cordialmente,\nRoberto Salvi\nBroker Senior, Salvi & Partners',
            bodies: [
                'Egregio Cliente,\n\nLe comunico i risultati della settimana. Le sue posizioni su ENI (+4.2%), Stellantis (+2.8%) e Mediobanca (+1.5%) hanno generato un utile netto di €{{amount}}.\n\nIl portafoglio è in ottima salute. Nessuna azione correttiva necessaria.',
                'Gentile Direttore,\n\nSettimana positiva per il suo portafoglio. Il rally di Ferrari (FCA.MI, +6.1%) ha compensato la flessione di Telecom Italia (-1.3%).\n\nSaldo netto: +€{{amount}}. Suggerisco di mantenere le posizioni attuali.',
            ]
        },
        {
            id: 'broker_002',
            senderName: 'Francesca Canova',
            senderRole: 'Wealth Manager, Banca Privata Italiana',
            senderIcon: '💹',
            subject: 'AVVISO: perdita registrata — portafoglio NCC',
            signature: 'Con rispetto,\nFrancesca Canova\nWealth Manager',
            bodies: [
                'Egregio Cliente,\n\nDevo informarLa di una perdita netta di €{{amount}} registrata questa settimana. La forte volatilità su Azimut (-8.3%) e Saipem (-5.1%) ha penalizzato il portafoglio.\n\nSi consiglia di valutare una revisione delle posizioni. Sono disponibile per una call urgente.',
                'Gentile Direttore,\n\nLa settimana è stata difficile. I mercati europei hanno registrato una correzione generalizzata. Il suo portafoglio ha subito una perdita di €{{amount}}, principalmente su Banco BPM (-6.7%) e Pirelli (-4.2%).\n\nMonitoriamo la situazione costantemente.',
            ]
        },
        {
            id: 'broker_003',
            senderName: 'Dott. Emilio Faro',
            senderRole: 'Trading Desk, Finanza Alpina SIM',
            senderIcon: '📊',
            subject: 'Flash report — movimenti su RACE e ENI',
            signature: 'Distinti saluti,\nDott. Emilio Faro\nHead of Trading, Finanza Alpina SIM',
            bodies: [
                'CEO,\n\nFlash report: RACE (Ferrari) ha segnato +9.3% in apertura di seduta dopo i risultati trimestrali. La sua posizione da €{{amount}} vale ora significativamente di più.\n\nConsiglio di tenere e aspettare il consolidamento sopra i 450€.',
                'Egregio Cliente,\n\nENI ha annunciato un dividendo straordinario. Le sue {{amount}} azioni generano un rendimento aggiuntivo di €{{amount}} netti.\n\nInoltre INTESA SP ha rotto la resistenza dei 3,80€ — posizione da tenere.',
            ]
        },
        {
            id: 'broker_004',
            senderName: 'Simone Fabbri',
            senderRole: 'Consulente Investimenti, Mediolanum',
            senderIcon: '🏦',
            subject: 'Riepilogo mensile portafoglio — performance +{{amount}}%',
            signature: 'A presto,\nSimone Fabbri\nConsulente Patrimoniale, Mediolanum',
            bodies: [
                'Gentile Cliente,\n\nIl mese si chiude positivamente. Performance portafoglio: +{{amount}}%. I titoli migliori: Moncler (+12%), Brunello Cucinelli (+8.4%), LVMH Milano (+5.2%).\n\nIl suo patrimonio investito cresce in linea con le aspettative.',
                'Buongiorno,\n\nEcco il riepilogo mensile. Il settore lusso ha sovraperformato rispetto all\'indice FTSE MIB. Il suo portafoglio tematico ha guadagnato €{{amount}} questo mese.\n\nNessuna variazione strategica necessaria per il prossimo periodo.',
            ]
        },
        {
            id: 'broker_005',
            senderName: 'Alert Automatico — Trading System',
            senderRole: 'Sistema di Trading Algoritmico',
            senderIcon: '🤖',
            subject: 'STOP LOSS ATTIVATO — perdita €{{amount}}',
            signature: '[Sistema automatico — non rispondere]',
            bodies: [
                'AVVISO AUTOMATICO\n\nStop loss attivato sul titolo STLAM (Stellantis) alle ore 10:47. Perdita realizzata: -€{{amount}}.\n\nIl sistema ha chiuso automaticamente la posizione per limitare i danni. Il mercato ha subito una pressione inattesa dopo le notizie macroeconomiche delle 10:30.',
                'ALERT TRADING\n\nMargine call attivato. Il conto trading ha raggiunto il livello di guardia. Sono stati liquidati €{{amount}} di posizioni per ripristinare il margine.\n\nSi prega di effettuare un bonifico di rifinanziamento entro 24 ore.',
            ]
        },
        {
            id: 'broker_006',
            senderName: 'Luca Amadori',
            senderRole: 'Private Equity, Fondo Meridiano',
            senderIcon: '🏗',
            subject: 'Opportunità di investimento — settore NCC',
            signature: 'Con stima,\nLuca Amadori\nManaging Partner, Fondo Meridiano',
            bodies: [
                'Egregio CEO,\n\nIl Fondo Meridiano sta valutando investimenti nel settore NCC italiano. Il suo profilo di azienda in crescita ci ha incuriositi.\n\nSiamo pronti a discutere un\'iniezione di capitale di €{{amount}} in cambio di una quota minoritaria. Interesse a incontrarci?',
                'Gentile Direttore,\n\nAbbiamo analizzato il mercato NCC di lusso in Italia. Le aziende come la sua stanno performando meglio del mercato generale.\n\nIl Fondo Meridiano offre €{{amount}} di liquidità per accelerare la sua espansione. Siamo seri e rapidi.',
            ]
        },
        {
            id: 'broker_007',
            senderName: 'Giulia Terranova',
            senderRole: 'Research Analyst, Borsa Italiana',
            senderIcon: '📉',
            subject: 'Analisi settore NCC quotato — impatto su portafoglio',
            signature: 'Cordiali saluti,\nGiulia Terranova\nSenior Analyst',
            bodies: [
                'Egregio Investitore,\n\nL\'indice di settore NCC/Mobility ha perso il 3.2% questa settimana a causa delle notizie regolatorie dall\'UE. Il suo portafoglio tematico ha subito un impatto di -€{{amount}}.\n\nSuggerisco di non vendere: i fondamentali del settore restano solidi.',
                'Gentile Cliente,\n\nAggiornamento settimanale: il settore luxury mobility ha outperformato il mercato generale di 2.1%. La sua esposizione su titoli del segmento premium le ha fruttato €{{amount}} aggiuntivi.\n\nManteniamo il giudizio positivo sul comparto.',
            ]
        },
        {
            id: 'broker_008',
            senderName: 'Banca Nazionale Privata',
            senderRole: 'Ufficio Titoli',
            senderIcon: '🏛',
            subject: 'Estratto conto titoli — {{day}}',
            signature: 'Distinti saluti,\nUfficio Titoli\nBanca Nazionale Privata',
            bodies: [
                'Gentile Cliente,\n\nLe inviamo l\'estratto conto titoli aggiornato al {{day}}. Valore totale portafoglio: €{{amount}}. Variazione rispetto al mese precedente: +3.4%.\n\nDettaglio posizioni disponibile nell\'allegato sicuro.',
                'Egregio Correntista,\n\nEstratto titoli al {{day}}. Il suo portafoglio ha registrato un incremento di €{{amount}} nell\'ultimo trimestre.\n\nI titoli più performanti: ENI (+7.2%), Generali (+5.8%), Prysmian (+11.3%). Ottimo risultato complessivo.',
            ]
        },
    ],

    driver_msg: [
        {
            id: 'driver_001',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '🚗',
            subject: 'Messaggio da {{driverName}}',
            signature: '{{driverName}} 🚗',
            bodies: [
                'Capo, buongiorno!\n\nVolevo aggiornarla: la corsa di stamattina è andata benissimo, cliente soddisfattissimo, mi ha lasciato una mancia da €{{amount}}. Dice che tornerà sicuramente.\n\nA dopo!',
                'Direttore, tutto ok?\n\nStamattina ho avuto un piccolo problema di traffico sull\'A4 ma sono arrivato con 5 minuti di anticipo comunque. Il cliente non ha detto niente. Siamo a posto.\n\nCi sentiamo stasera.',
            ]
        },
        {
            id: 'driver_002',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '⚠️',
            subject: 'Problema tecnico — auto in panne',
            signature: '{{driverName}}\n[in attesa di istruzioni]',
            bodies: [
                'Capo URGENTE\n\nL\'auto si è fermata sulla tangenziale di {{city}}. Spia del motore accesa, non riparte. Ho già chiamato il soccorso stradale ma il cliente è con me.\n\nCosa faccio? Mando un\'altra macchina?',
                'Direttore, brutta situazione.\n\nPneumatico forato in zona {{city}}, cliente VIP a bordo. Ho cambiato la ruota in 8 minuti, cliente impressionato ma siamo in ritardo di 15 minuti.\n\nHo già avvisato la destinazione. Gestisco io?',
            ]
        },
        {
            id: 'driver_003',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '💬',
            subject: 'Aggiornamento giornata',
            signature: '{{driverName}}',
            bodies: [
                'Capo buona sera,\n\nGiornata intensa oggi. 7 corse, nessun problema. Il cliente delle 14:00 era un tipo strano ma alla fine tutto ok. Totale incassato: €{{amount}}.\n\nDomani sono disponibile dalle 7.',
                'Direttore,\n\nOggi ho completato tutte le corse in programma. Il cliente VIP delle 16:30 mi ha chiesto se poteva prenotarmi personalmente per la settimana prossima.\n\nGli dico di contattare lei direttamente?',
            ]
        },
        {
            id: 'driver_004',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '🤒',
            subject: 'Malattia — non disponibile oggi',
            signature: '{{driverName}}\nMi dispiace davvero',
            bodies: [
                'Capo mi dispiace tanto\n\nSto malissimo, febbre a 39. Non ce la faccio a venire oggi. Ho già mandato il certificato medico.\n\nSa com\'è, non l\'ho mai fatto prima. Se riesce a coprire le mie corse... grazie.',
                'Direttore buongiorno.\n\nHo avuto un problema di salute stanotte. Devo restare a casa oggi. Le mando subito i documenti medici.\n\nMi dispiace per i disagi. Domani sarò operativo.',
            ]
        },
        {
            id: 'driver_005',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '💰',
            subject: 'Proposta — turno extra weekend',
            signature: '{{driverName}} 💪',
            bodies: [
                'Ciao capo!\n\nSento che questo weekend c\'è molto lavoro. Sono disponibile sabato e domenica, tutto il giorno. Se c\'è da fare ore extra, sono dentro.\n\nFacciamo qualcosa in più sulla tariffa del weekend? 😊',
                'Direttore,\n\nHo letto del grande evento a {{city}} il {{day}}. Potrei coprire io le corse serali? Ho già l\'esperienza con quel tipo di clientela.\n\nMe lo dice se sono utile. Sono disponibile.',
            ]
        },
        {
            id: 'driver_006',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '😤',
            subject: 'Lamentela — cliente maleducato',
            signature: '{{driverName}}\n[ho fatto del mio meglio]',
            bodies: [
                'Capo devo dirle una cosa.\n\nIl cliente delle 11:00 oggi era scortese in modo inaccettabile. Mi ha insultato per il traffico (che non dipende da me) e ha preteso uno sconto.\n\nNon ho detto niente, ma lei dovrebbe sapere. Non voglio più quel cliente.',
                'Direttore,\n\nVolevo avvisarla: il signor [nome omesso] di stamattina ha lasciato una recensione negativa falsa. Dice che ero in ritardo di 20 minuti ma ho la prova GPS che ero davanti al suo palazzo in anticipo.\n\nPosso mandarle gli screenshot?',
            ]
        },
        {
            id: 'driver_007',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '🎉',
            subject: 'Mancia record oggi!',
            signature: '{{driverName}} 🤩',
            bodies: [
                'CAPO! 🎉\n\nNon ci crederà. Il cliente di oggi — un imprenditore del lusso — mi ha lasciato una mancia di €{{amount}}! Ha detto che sono il miglior autista che abbia mai avuto.\n\nGiornata da incorniciare. Grazie per questa opportunità!',
                'Direttore, buone notizie!\n\nLa signora che ho accompagnato stamattina vuole diventare cliente fisso. Ha chiesto di prenotare ogni martedì e giovedì solo con me.\n\nE mi ha dato €{{amount}} di mancia. Ottima cosa, no?',
            ]
        },
        {
            id: 'driver_008',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '🔧',
            subject: 'Auto — segnalo problema da verificare',
            signature: '{{driverName}}\n[meglio prevenire]',
            bodies: [
                'Capo buongiorno,\n\nSegnalo che la vettura ha un rumore strano al motore da questa mattina. Non è grave ma si sente. Meglio farla vedere dal meccanico prima che diventi un problema serio.\n\nSe mi dice dove portarla, ci penso io.',
                'Direttore,\n\nL\'auto di ieri sera aveva le luci posteriori con un problema. Ho usato l\'altra macchina per le corse di stanotte.\n\nFarei controllare entrambe prima di usarle con clienti VIP. La reputazione vale più del costo di un\'officina.',
            ]
        },
        {
            id: 'driver_009',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '🤔',
            subject: 'Mi ha contattato {{rivalName}}...',
            signature: '{{driverName}}\n[le dico tutto, capo]',
            bodies: [
                'Capo, devo dirle una cosa.\n\nMi ha scritto qualcuno di {{rivalName}}. Offerta di €{{amount}}/mese. Ho detto che non ero interessato, ma volevo che lei sapesse.\n\nSto bene qui. Solo per trasparenza.',
                'Direttore buongiorno.\n\nIeri sera ho ricevuto una telefonata da {{rivalName}}. Volevano propormi un contratto nuovo. Ho detto no, ma se c\'è modo di parlare delle mie condizioni attuali, mi farebbe piacere.\n\nNessuna fretta, ci pensiamo con calma.',
            ]
        },
        {
            id: 'driver_010',
            senderName: '{{driverName}}',
            senderRole: 'Autista — Tua flotta',
            senderIcon: '🏆',
            subject: 'Feedback positivo dal cliente VIP',
            signature: '{{driverName}} ⭐⭐⭐⭐⭐',
            bodies: [
                'Capo buonasera!\n\nIl cliente VIP di oggi ha chiamato l\'ufficio per complimentarsi. Ha detto che il servizio era "di livello internazionale". Le gira il messaggio per sua conoscenza.\n\nSiamo forti. 💪',
                'Direttore,\n\nHo ricevuto un messaggio diretto dal cliente di questa mattina: "Servizio impeccabile, tornerò sicuramente e consiglierò la sua azienda ai miei colleghi".\n\nPenso che valga la pena di aggiornare il profilo del cliente come VIP fisso.',
            ]
        },
    ],

    info: [
        {
            id: 'info_001',
            senderName: 'Ministero delle Infrastrutture e dei Trasporti',
            senderRole: 'Direzione Generale Trasporto Locale',
            senderIcon: '🏛',
            subject: 'Circolare ministeriale n. 47/2026 — NCC',
            signature: 'Il Direttore Generale\nMinistero delle Infrastrutture e dei Trasporti',
            bodies: [
                'Spettabile Operatore,\n\nSi comunica che a decorrere dal {{day}}, tutti gli operatori NCC con flotta superiore a 5 veicoli sono tenuti a registrare ogni corsa sul portale nazionale MIT entro 24 ore dal completamento.\n\nIl mancato rispetto della presente circolare comporta sanzioni amministrative da €{{amount}} a €{{amount}} per ogni violazione accertata.',
                'Spettabile Azienda,\n\nLa circolare ministeriale n. 47/2026 introduce nuovi obblighi per gli operatori NCC riguardanti la tracciabilità delle corse e la comunicazione dei dati di flotta.\n\nLa preghiamo di adeguare i propri sistemi entro il {{day}}.',
            ]
        },
        {
            id: 'info_002',
            senderName: 'Agenzia delle Entrate',
            senderRole: 'Ufficio Grandi Contribuenti',
            senderIcon: '📋',
            subject: 'Comunicazione fiscale — periodo d\'imposta 2025',
            signature: 'L\'Ufficio\nAgenzia delle Entrate — Grandi Contribuenti',
            bodies: [
                'Spettabile Contribuente,\n\nSi ricorda che il termine per la presentazione della dichiarazione dei redditi relativa al periodo d\'imposta 2025 è fissato al {{day}}.\n\nPer le aziende del settore trasporti, si segnala l\'applicazione delle deduzioni previste dalla Legge 214/2025 sui veicoli ad emissioni ridotte.',
                'Egregio Operatore,\n\nL\'Agenzia delle Entrate comunica l\'avvio dei controlli sistematici sul settore NCC per il periodo 2024-2025. Si raccomanda di conservare tutta la documentazione relativa alle corse effettuate.\n\nUn eventuale accertamento richiede disponibilità di registri completi.',
            ]
        },
        {
            id: 'info_003',
            senderName: 'Comune di {{city}}',
            senderRole: 'Ufficio Mobilità',
            senderIcon: '🏙',
            subject: 'Modifiche alla viabilità — zona centro, {{day}}',
            signature: 'L\'Assessore alla Mobilità\nComune di {{city}}',
            bodies: [
                'Spettabile Operatore NCC,\n\nSi comunica che in occasione dell\'evento del {{day}}, il centro storico di {{city}} sarà interdetto al traffico privato dalle ore 10:00 alle 22:00.\n\nGli operatori NCC autorizzati potranno accedere alle zone riservate previa esposizione del pass ZTL emesso dall\'Ufficio Mobilità.',
                'Gentile Azienda,\n\nIl Comune di {{city}} informa che a partire da {{day}} entreranno in vigore nuove norme per gli accessi in zona ZTL. I veicoli Euro 5 e inferiori saranno esclusi dalle aree centrali nelle fasce orarie 07:00-20:00.\n\nSi prega di adeguare la flotta di conseguenza.',
            ]
        },
        {
            id: 'info_004',
            senderName: 'Associazione Nazionale NCC Italia',
            senderRole: 'Segreteria Generale',
            senderIcon: '📢',
            subject: 'Newsletter trimestrale — Mercato NCC Q1 2026',
            signature: 'La Segreteria Generale\nAssociazione Nazionale NCC Italia',
            bodies: [
                'Cari Associati,\n\nIl mercato NCC italiano ha registrato nel primo trimestre 2026 una crescita del 14% rispetto all\'anno precedente. Il segmento luxury ha guidato la crescita con +21%.\n\nLe nostre stime per Q2 prevedono ulteriore espansione, trainata dal turismo internazionale e dagli eventi corporate.',
                'Spettabili Soci,\n\nLa newsletter trimestrale include un\'analisi approfondita sull\'impatto delle nuove normative UE sulla flotta NCC. In sintesi: le agevolazioni per i veicoli elettrici sono state estese al {{day}}.\n\nIn allegato il report completo del settore.',
            ]
        },
        {
            id: 'info_005',
            senderName: 'INPS — Sede Locale',
            senderRole: 'Ufficio Contributivo Imprese',
            senderIcon: '🏦',
            subject: 'Scadenza contributi previdenziali — {{day}}',
            signature: 'L\'Ufficio Contributivo\nINPS — Sede di {{city}}',
            bodies: [
                'Spettabile Datore di Lavoro,\n\nSi ricorda che il versamento dei contributi previdenziali per i lavoratori dipendenti del periodo gennaio-marzo 2026 deve essere effettuato entro il {{day}}.\n\nIl mancato pagamento comporta sanzioni pari al {{amount}}% mensile sull\'importo dovuto.',
                'Gentile Azienda,\n\nL\'INPS informa che a partire da {{day}} saranno operativi i nuovi massimali contributivi previsti dalla Legge di Bilancio 2026. Per le aziende con più di 5 dipendenti, l\'aliquota contributiva totale passa al 33.2%.\n\nAggiornate i vostri calcoli di conseguenza.',
            ]
        },
        {
            id: 'info_006',
            senderName: 'Motorizzazione Civile',
            senderRole: 'Ufficio Revisioni e Licenze',
            senderIcon: '🔧',
            subject: 'Scadenza revisioni — veicoli a noleggio',
            signature: 'L\'Ufficio Revisioni\nMotorizzazione Civile — {{city}}',
            bodies: [
                'Spettabile Operatore NCC,\n\nSi ricorda che i veicoli adibiti a servizio di noleggio con conducente devono essere sottoposti a revisione obbligatoria ogni 12 mesi.\n\nI veicoli con revisione scaduta non possono circolare e sono soggetti a sequestro immediato con sanzione fino a €{{amount}}.',
                'Gentile Azienda,\n\nDall\'analisi della sua flotta registrata, risulta che uno o più veicoli hanno la revisione in scadenza entro {{day}}.\n\nSi prega di prenotare l\'appuntamento presso la Motorizzazione Civile di {{city}} con almeno 15 giorni di anticipo.',
            ]
        },
        {
            id: 'info_007',
            senderName: 'Camera di Commercio',
            senderRole: 'Registro Imprese',
            senderIcon: '📄',
            subject: 'Rinnovo iscrizione — Registro NCC',
            signature: 'Il Conservatore del Registro\nCamera di Commercio di {{city}}',
            bodies: [
                'Spettabile Azienda,\n\nSi avvicina la scadenza per il rinnovo annuale dell\'iscrizione al Registro delle Imprese di Trasporto NCC.\n\nIl termine è fissato al {{day}}. Il diritto annuale ammonta a €{{amount}}. Il mancato rinnovo comporta la sospensione dell\'autorizzazione all\'esercizio.',
                'Gentile Operatore,\n\nLa informiamo che dal {{day}} saranno obbligatorie le comunicazioni telematiche per tutte le variazioni societarie degli operatori NCC.\n\nPer assistenza nell\'adeguamento ai nuovi obblighi, contatti lo Sportello Imprese della Camera di Commercio di {{city}}.',
            ]
        },
        {
            id: 'info_008',
            senderName: 'Prefettura di {{city}}',
            senderRole: 'Ufficio Sicurezza Pubblica',
            senderIcon: '⚖️',
            subject: 'Comunicazione sicurezza — servizi NCC eventi pubblici',
            signature: 'Il Prefetto\nPrefettura di {{city}}',
            bodies: [
                'Spettabile Operatore,\n\nIn vista degli eventi pubblici previsti a {{city}} nel mese corrente, la Prefettura ricorda agli operatori NCC i protocolli di sicurezza obbligatori.\n\nGli autisti che operano in prossimità di eventi con oltre 500 partecipanti devono essere in possesso di certificazione antimafia aggiornata.',
                'Egregio Direttore,\n\nLa Prefettura di {{city}} ha avviato un piano di controlli straordinari sugli operatori NCC attivi nella zona metropolitana.\n\nSi raccomanda di tenere disponibile tutta la documentazione di flotta, licenze e contratti di lavoro dei dipendenti.',
            ]
        },
    ],

    rival_provoc: [
        {
            id: 'rival_001',
            senderName: 'CEO di {{rivalName}}',
            senderRole: 'Concorrente',
            senderIcon: '😤',
            subject: 'Un messaggio da {{rivalName}}',
            signature: 'Con disprezzo,\nCEO di {{rivalName}}',
            bodies: [
                'Senti bene,\n\nHo visto i tuoi numeri. Niente di speciale. Mentre tu perdi tempo a raccogliere le briciole, noi stiamo costruendo qualcosa di serio a {{city}}.\n\nGoditi il tuo piccolo feudo — non durerà.',
                'Caro CEO di serie B,\n\nHo saputo che hai perso {{driverName}}. Peccato. Ma forse era ora che trovasse un posto migliore.\n\n{{rivalName}} cresce ogni giorno. Tu stai ferma. Pensa ai tuoi affari.',
            ]
        },
        {
            id: 'rival_002',
            senderName: 'Direzione Generale, {{rivalName}}',
            senderRole: 'Avversario di settore',
            senderIcon: '⚔️',
            subject: 'Avviso formale — non ostacolate la nostra espansione',
            signature: 'Distinti saluti (se meritati),\nDirezione Generale, {{rivalName}}',
            bodies: [
                'Egregio CEO,\n\nAbbiamo notato i vostri tentativi di interferire con i nostri clienti a {{city}}. Vi avvertiamo formalmente: {{rivalName}} non tollera pratiche sleali.\n\nSe continua così, porteremo la questione nelle sedi opportune — e abbiamo avvocati migliori dei vostri.',
                'Gentile Collega,\n\nSappiamo quello che state facendo. Sappiamo anche che i vostri numeri sono gonfiati.\n\n{{rivalName}} ha le risorse per sopportare una guerra di mercato a lungo. Voi no. Consideratelo un avvertimento amichevole.',
            ]
        },
        {
            id: 'rival_003',
            senderName: '{{rivalName}} — PR Team',
            senderRole: 'Comunicazione Esterna',
            senderIcon: '📣',
            subject: 'Per sua informazione — siamo ovunque',
            signature: 'Con arroganza calcolata,\n{{rivalName}} PR Team',
            bodies: [
                'Caro CEO,\n\nAbbiamo appena siglato accordi con 5 hotel a cinque stelle di {{city}}. Sì, quelli dove pensavi di espanderti.\n\nIl mercato premium ha scelto {{rivalName}}. Tu puoi tenere le corse dai discount.',
                'Gentile Direttore,\n\nAbbiamo letto la sua ultima intervista. Coraggiosa, per chi ha quei numeri.\n\n{{rivalName}} ha fatturato €{{amount}} il mese scorso. Quanto ha fatto lei? Esatto.',
            ]
        },
        {
            id: 'rival_004',
            senderName: 'CEO personale — {{rivalName}}',
            senderRole: '',
            senderIcon: '😏',
            subject: 'Ti do un consiglio gratis',
            signature: 'Il tuo futuro ex-concorrente',
            bodies: [
                'Ciao,\n\nTi do un consiglio non richiesto: smetti di competere con noi sul segmento VIP di {{city}}. Non sei attrezzato. Non hai i clienti. Non hai gli autisti giusti.\n\n{{rivalName}} domina quel mercato. Trovati una nicchia più adatta al tuo livello.',
                'Senti,\n\nQuesto mese abbiamo preso 3 dei tuoi clienti. Il mese prossimo probabilmente qualcuno del tuo team. Poi chissà.\n\nNon è personale — è business. Ma se vuoi, possiamo parlare di una tua uscita dal mercato con dignità.',
            ]
        },
        {
            id: 'rival_005',
            senderName: 'Ufficio Legale, {{rivalName}}',
            senderRole: 'Consulenza Legale',
            senderIcon: '⚖️',
            subject: 'Diffida formale — pratiche commerciali scorrette',
            signature: 'Avv. Lorenzo Mancini\nPer conto di {{rivalName}}',
            bodies: [
                'Spettabile Azienda,\n\nSi diffida formalmente dal continuare a contattare i clienti di {{rivalName}} con pratiche commerciali che riteniamo scorrette.\n\nIn caso di ulteriori violazioni, ci riserviamo di agire nelle sedi competenti per un risarcimento di €{{amount}}.',
                'Egregio CEO,\n\nAbbiamo documentazione sufficiente per procedere contro la sua azienda per concorrenza sleale.\n\nLa invitiamo a riconsiderare le sue strategie commerciali nella zona di {{city}}. Il nostro studio ha vinto 47 cause simili negli ultimi 3 anni.',
            ]
        },
        {
            id: 'rival_006',
            senderName: 'Un amico di {{rivalName}}',
            senderRole: '[non verificabile]',
            senderIcon: '🃏',
            subject: 'Sai già come va a finire',
            signature: '— qualcuno che sa come va a finire',
            bodies: [
                'Ehi,\n\nHai visto {{rivalName}} ultimamente? Nuovi uffici a {{city}}, flotta rinnovata, accordi con i migliori hotel.\n\nE tu? Sei ancora lì a inseguire corse da €{{amount}} come sempre. Il settore ha un leader ormai — e non sei tu.',
                'CEO,\n\nVuoi sapere una cosa divertente? {{rivalName}} ha già pianificato dove ti sostituirà tra 6 mesi. Zona aeroporto, zona congressi, zona lusso.\n\nNon è una minaccia. È solo la realtà del mercato.',
            ]
        },
        {
            id: 'rival_007',
            senderName: 'CEO di {{rivalName}}',
            senderRole: 'Messaggio diretto',
            senderIcon: '🥊',
            subject: 'Cara concorrenza — a viso aperto',
            signature: 'Senza rancori (ma senza pietà),\nCEO di {{rivalName}}',
            bodies: [
                'Direttore,\n\nTi scrivo a viso aperto. Apprezzo chi lavora sodo, ma il mercato di {{city}} non ha spazio per tutti.\n\nNoi abbiamo €{{amount}} di investimenti pronti per espanderci nella tua zona. Puoi combattere o trovare un accordo. Scegli tu.',
                'CEO,\n\nIl rispetto si guadagna sul campo. Finora ho rispettato il tuo territorio. Ma d\'ora in poi {{rivalName}} non avrà più remore.\n\nIl {{day}} apriamo la nostra nuova sede a {{city}}. Benvenuto nella nostra zona.',
            ]
        },
        {
            id: 'rival_008',
            senderName: '{{rivalName}} — Comunicato',
            senderRole: 'Ufficio Comunicazione',
            senderIcon: '📰',
            subject: 'Comunicato: {{rivalName}} supera quota €{{amount}} di fatturato',
            signature: 'Ufficio Comunicazione\n{{rivalName}}',
            bodies: [
                'Per sua informazione,\n\n{{rivalName}} ha superato il traguardo dei €{{amount}} di fatturato mensile. Siamo orgogliosi di annunciarlo a tutti — inclusa la concorrenza.\n\nLa corsa al vertice del mercato NCC di {{city}} è già finita. Abbiamo vinto noi.',
                'Nota informativa,\n\nIl nostro ultimo trimestre ha visto una crescita del 34% rispetto all\'anno precedente. {{rivalName}} è ora il principale operatore NCC nella regione.\n\nSappiamo che questi dati Le faranno riflettere. È il momento giusto per farlo.',
            ]
        },
    ],

};

// ─── STAGIONALITÀ ─────────────────────────────────────────────────
const SEASONAL_MULT = [
    { months:[12,1],         name:'🎄 Alta Stagione Festiva',   priceMult:1.35, rideBonus:1.4 },
    { months:[6,7,8],        name:'☀️ Picco Estivo',            priceMult:1.20, rideBonus:1.3 },
    { months:[9,10,11],      name:'💼 Stagione Business',        priceMult:1.15, rideBonus:1.1 },
    { months:[2,3,4,5],      name:'🌱 Bassa Stagione',           priceMult:0.92, rideBonus:0.9 },
];

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────
const ACHIEVEMENTS = [
    { id:'ach_1m',         icon:'💰', name:'Primo Milione',       desc:'Raggiungi €1.000.000 di liquidità',          check: gs => gs.cash >= 1000000 },
    { id:'ach_5stars',     icon:'⭐', name:'Cinque Stelle',        desc:'Ottieni reputazione 5.0★',                   check: gs => gs.reputation >= 5.0 },
    { id:'ach_fleet10',    icon:'🚘', name:'Grande Flotta',        desc:'Possiedi 10 o più veicoli',                   check: gs => gs.fleet.length >= 10 },
    { id:'ach_top1',       icon:'🏆', name:'Numero Uno',           desc:'Raggiungi il 1° posto in classifica',         check: gs => RIVALS.filter(r=>r.rep>gs.reputation).length===0 },
    { id:'ach_team5',      icon:'👔', name:'Team di Élite',        desc:'Assumi 5 autisti professionisti',             check: gs => gs.drivers.filter(d=>d.id!=='ceo').length >= 5 },
    { id:'ach_allregions', icon:'🗺️', name:'Italia Unita',        desc:'Sblocca tutte e 20 le regioni',               check: gs => gs.unlockedRegions.length >= Object.keys(REGIONS).length },
    { id:'ach_elite',      icon:'🌟', name:'Campione Elite',       desc:'Porta un autista al livello Elite',           check: gs => gs.drivers.some(d=>(d.level||0)>=3) },
    { id:'ach_10inv',      icon:'📈', name:'Portfolio Completo',   desc:'Acquista 10 o più investimenti',              check: gs => gs.investments.length >= 10 },
    { id:'ach_nofines',    icon:'✅', name:'Record Impeccabile',   desc:'Nessuna multa per 30 giorni',                 check: (gs,extra) => ((extra||{}).daysSinceLastFine||0) >= 30 },
    { id:'ach_10m',        icon:'🤑', name:'Decina di Milioni',    desc:'Raggiungi €10.000.000 di liquidità',         check: gs => gs.cash >= 10000000 },
];

// ─── AUTO PROTOTIPO (sbloccabili al raggiungimento di 5★) ─────────
const PROTOTYPE_CARS = [
    { id:'proto_tesla',    name:'Volt S-Hyper',         tier:'ultra',    price:1400000, condition:100, reqRep:4.5, fuel:'electric', rideGate:1000, desc:'Elettrica. Velocità +25%, zero emissioni, silenzio totale.',     vehicleClass:'volt_s_hyper'       },
    { id:'proto_rolls',    name:'Majestic E-Specter',   tier:'ultra',    price:3200000, condition:100, reqRep:5.0, fuel:'electric', rideGate:1000, desc:'Ultra-luxury elettrica. Tariffa base ×5. Solo Presidential.',    vehicleClass:'majestic_e_specter' },
    { id:'proto_van_vip',  name:'Stellar Q-Carrier',    tier:'group',    price:110000,  condition:100, reqRep:4.0, fuel:'electric', rideGate:0,    desc:'Elettrico luxury group. 7 posti, zero emissioni.',               vehicleClass:'stellar_q_carr'     },
];

// ─── SPECIALIZZAZIONI DRIVER ─────────────────────────────────────
const DRIVER_SPECIALTIES = [
    { id:'city_roma',    name:'🏛 Expert Roma',      desc:'+20% velocità e mance a Roma. Conosce ogni vicolo.', region:'lazio'    },
    { id:'city_milano',  name:'🏙 Expert Milano',    desc:'+20% velocità e mance a Milano. Re del traffico.',  region:'lombardia' },
    { id:'city_napoli',  name:'🌋 Expert Napoli',    desc:'+20% velocità e mance a Napoli.',                   region:'campania'  },
    { id:'night_owl',    name:'🌙 Guida Notturna',   desc:'+30% mance tra le 22:00 e le 06:00.',              region:null        },
    { id:'airport_pro',  name:'✈ Pro Aeroporti',     desc:'+15% velocità su corse aeroportuali.',             region:null        },
    { id:'vip_escort',   name:'⭐ VIP Escort',       desc:'+10% mance e −30% rischio incidenti su VIP/Ultra.',region:null        },
    { id:'alpine',       name:'🏔 Specialista Alpi', desc:'+25% velocità su Cortina e zone montane (neve).',  region:'veneto'    },
    { id:'boat_captain', name:'⛵ Capitano Acqueo',  desc:'Specializzato in Water Taxi veneziani. +20% velocità e −10% costo operativo su Venezia.', region:'veneto' },
];

// ─── CLASSI VEICOLI UFFICIALI W-3 CONTRACT ───────────────────────
const FLEET_VEHICLE_CLASSES = [
    {
        id:           'stellar_e_exec',
        name:         'Stellar E-Executive',
        shortName:    'Stellar E',
        tier:         'business',
        capacity:     2,
        extraHrNet:   105.00,
        extraHrSell:  131.25,
        waitHalfHr:   52.50,
        waitFullHr:   105.00,
        fuelPerKm:    0.09,
        purchasePrice:65000,
        dailyLeaseCost: 85,
        desc:         'Berlina Premium per 1-2 passeggeri. Veicolo standard del contratto W-3.',
        icon:         '🚗',
    },
    {
        id:           'stellar_v_carr',
        name:         'Stellar V-Carrier',
        shortName:    'Stellar V',
        tier:         'vip',
        capacity:     7,
        extraHrNet:   125.00,
        extraHrSell:  156.25,
        waitHalfHr:   62.50,
        waitFullHr:   125.00,
        fuelPerKm:    0.13,
        purchasePrice:95000,
        dailyLeaseCost:120,
        desc:         'MPV per 3-7 passeggeri. Ideale per famiglie e gruppi.',
        icon:         '🚐',
    },
    {
        id:           'stellar_q_exec',
        name:         'Stellar Q-Executive',
        shortName:    'Stellar Q',
        tier:         'vip',
        capacity:     8,
        extraHrNet:   150.00,
        extraHrSell:  187.50,
        waitHalfHr:   75.00,
        waitFullHr:   150.00,
        fuelPerKm:    0.18,
        purchasePrice:120000,
        dailyLeaseCost:150,
        desc:         'Minibus per 8 passeggeri. Transfer di gruppo e aeroporti.',
        icon:         '🚌',
    },
    {
        id:           'stellar_s_imp',
        name:         'Stellar S-Imperial',
        shortName:    'Imperial',
        tier:         'ultra',
        capacity:     3,
        extraHrNet:   195.00,
        extraHrSell:  243.75,
        waitHalfHr:   97.50,
        waitFullHr:   195.00,
        fuelPerKm:    0.14,
        purchasePrice:220000,
        dailyLeaseCost:185,
        desc:         'Berlina presidenziale per VIP, diplomatici e clienti premium. Sblocca tratte Presidential del contratto Classic Vacations.',
        icon:         '👑',
        requiresRep:  3.5,
    },
    // Legacy aliases — keep for backward compat with any old save data references
    { id:'mercedes_e', name:'Stellar E-Executive', shortName:'Stellar E', tier:'business', capacity:2,  icon:'🚗', fuelPerKm:0.09 },
    { id:'mercedes_v', name:'Stellar V-Carrier',   shortName:'Stellar V', tier:'vip',      capacity:7,  icon:'🚐', fuelPerKm:0.13 },
    { id:'mercedes_sprinter', name:'Stellar Q-Executive', shortName:'Stellar Q', tier:'vip', capacity:8, icon:'🚌', fuelPerKm:0.18 },
    { id:'mercedes_s', name:'Stellar S-Imperial',  shortName:'Imperial',  tier:'ultra',    capacity:3,  icon:'👑', fuelPerKm:0.14 },
    {
        id:           'water_taxi',
        name:         'Water Taxi',
        shortName:    'Water Taxi',
        tier:         'ultra',
        capacity:     8,
        extraHrNet:   221.00,
        extraHrSell:  276.25,
        waitHalfHr:   110.50,
        waitFullHr:   221.00,
        fuelPerKm:    0.0,
        purchasePrice:180000,
        dailyLeaseCost:0,
        desc:         'Esclusivo per Venezia. Obbligatorio per hotel su isola (Danieli, Gritti, Cipriani). Zero consumo carburante su terra.',
        icon:         '⛵',
        veniceOnly:   true,
        requiresRegion: 'veneto',
    },
];

// ─── EVENTI DINAMICI AAA ─────────────────────────────────────────
// ─── TITAN EVENTS — 100+ Unique World Events ─────────────────────
// category: 'institutional' | 'entertainment' | 'sports' | 'business' | 'emergency'
// rarity:   'common' | 'rare' | 'epic' | 'legendary'
// surge:    true → triggers +40% zone pricing for entertainment/emergency
const TITAN_EVENTS = [
    // ── INSTITUTIONAL ────────────────────────────────────────────
    { id:'g7_roma',          name:'G7 Summit — Roma',             icon:'🌍', category:'institutional', rarity:'legendary', city:'roma',      region:'lazio',     priceMult:2.80, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.7, tipMult:2.0, policeHeat:35, duration:16, requiresReputation:3.5, requiresArmored:true },
    { id:'un_summit',        name:'Summit ONU — Palazzo Chigi',   icon:'🏛️', category:'institutional', rarity:'epic',      city:'roma',      region:'lazio',     priceMult:2.40, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.8, tipMult:1.8, policeHeat:28, duration:12, requiresReputation:3.0 },
    { id:'visita_papa',      name:'Udienza Papale — Vaticano',    icon:'⛪', category:'institutional', rarity:'epic',      city:'roma',      region:'lazio',     priceMult:2.20, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.6, tipMult:1.5, policeHeat:20, duration:8  },
    { id:'nato_summit',      name:'Vertice NATO — Napoli',        icon:'🛡️', category:'institutional', rarity:'legendary', city:'napoli',    region:'campania',  priceMult:3.00, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.7, tipMult:2.5, policeHeat:40, duration:12, requiresReputation:4.0, requiresArmored:true },
    { id:'g20_venezia',      name:'G20 Sherpa Meeting — Venezia', icon:'🤝', category:'institutional', rarity:'rare',      city:'venezia',   region:'veneto',    priceMult:2.00, rideBias:'business', extraRidesPerHour:4, speedMult:0.8, tipMult:1.6, policeHeat:15, duration:10 },
    { id:'visita_presidente',name:'Visita Presidenziale — Roma',  icon:'🎖️', category:'institutional', rarity:'epic',      city:'roma',      region:'lazio',     priceMult:2.60, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.75,tipMult:2.0, policeHeat:30, duration:6, requiresArmored:true },
    { id:'consiglio_eu',     name:'Consiglio UE — Milano',        icon:'🇪🇺', category:'institutional', rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.90, rideBias:'business', extraRidesPerHour:4, speedMult:0.85,tipMult:1.5, policeHeat:12, duration:14 },
    { id:'ambasciate_summit',name:'Summit Ambasciate — Roma',     icon:'🏳️', category:'institutional', rarity:'common',    city:'roma',      region:'lazio',     priceMult:1.60, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.3, policeHeat:8,  duration:8  },
    { id:'cio_olympics',     name:'IOC Meeting — Lausanne Style', icon:'🏅', category:'institutional', rarity:'rare',      city:'torino',    region:'piemonte',  priceMult:1.80, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.9, tipMult:1.4, policeHeat:5,  duration:10 },
    { id:'quirinale_gala',   name:'Gala al Quirinale',            icon:'🕯️', category:'institutional', rarity:'epic',      city:'roma',      region:'lazio',     priceMult:2.30, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.85,tipMult:2.2, policeHeat:18, duration:5, requiresReputation:3.5 },

    // ── ENTERTAINMENT ────────────────────────────────────────────
    { id:'festival_sanremo', name:'Festival di Sanremo',          icon:'🎤', category:'entertainment', rarity:'legendary', city:'sanremo',   region:'liguria',   priceMult:2.00, rideBias:'vip',      extraRidesPerHour:6, speedMult:0.6, tipMult:2.5, policeHeat:5,  duration:24, surge:true },
    { id:'taylor_swift',     name:'Tour Taylor Swift — San Siro', icon:'🎶', category:'entertainment', rarity:'legendary', city:'milano',    region:'lombardia', priceMult:1.80, rideBias:'vip',      extraRidesPerHour:8, speedMult:0.5, tipMult:2.0, policeHeat:3,  duration:6,  surge:true },
    { id:'coldplay_tour',    name:'Tour Coldplay — Circo Massimo',icon:'🎵', category:'entertainment', rarity:'epic',      city:'roma',      region:'lazio',     priceMult:1.70, rideBias:'vip',      extraRidesPerHour:7, speedMult:0.55,tipMult:1.8, policeHeat:3,  duration:6,  surge:true },
    { id:'film_festival',    name:'Mostra del Cinema — Venezia',  icon:'🎬', category:'entertainment', rarity:'epic',      city:'venezia',   region:'veneto',    priceMult:2.20, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.6, tipMult:2.5, policeHeat:4,  duration:18, surge:true },
    { id:'oscars_italy',     name:'Notte degli Oscars — Milano',  icon:'🏆', category:'entertainment', rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.90, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.7, tipMult:2.2, policeHeat:5,  duration:8,  surge:true },
    { id:'opera_scala',      name:'Prima della Scala',            icon:'🎭', category:'entertainment', rarity:'epic',      city:'milano',    region:'lombardia', priceMult:2.50, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.75,tipMult:3.0, policeHeat:3,  duration:5  },
    { id:'coachella_style',  name:'Summerfield Festival — Torino',icon:'🎪', category:'entertainment', rarity:'rare',      city:'torino',    region:'piemonte',  priceMult:1.60, rideBias:'vip',      extraRidesPerHour:6, speedMult:0.6, tipMult:1.8, policeHeat:5,  duration:12, surge:true },
    { id:'fashion_week_mi',  name:'Milano Fashion Week',          icon:'👗', category:'entertainment', rarity:'epic',      city:'milano',    region:'lombardia', priceMult:2.30, rideBias:'ultra',    extraRidesPerHour:5, speedMult:0.6, tipMult:2.8, policeHeat:4,  duration:20, surge:true },
    { id:'fashion_week_ro',  name:'Roma Fashion Week',            icon:'👠', category:'entertainment', rarity:'rare',      city:'roma',      region:'lazio',     priceMult:2.00, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.7, tipMult:2.0, policeHeat:3,  duration:16, surge:true },
    { id:'beyonce_tour',     name:'Renaissance Tour — Napoli',    icon:'💃', category:'entertainment', rarity:'epic',      city:'napoli',    region:'campania',  priceMult:1.75, rideBias:'vip',      extraRidesPerHour:7, speedMult:0.55,tipMult:2.0, policeHeat:3,  duration:5,  surge:true },
    { id:'arte_biennale',    name:'Biennale d\'Arte — Venezia',   icon:'🎨', category:'entertainment', rarity:'rare',      city:'venezia',   region:'veneto',    priceMult:1.80, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.7, tipMult:2.0, policeHeat:1,  duration:24 },
    { id:'ema_awards',       name:'MTV EMA — Bologna',            icon:'🎸', category:'entertainment', rarity:'rare',      city:'bologna',   region:'emilia',    priceMult:1.60, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.65,tipMult:1.7, policeHeat:3,  duration:8,  surge:true },
    { id:'pavarotti_gala',   name:'Gala Pavarotti — Verona',      icon:'🎼', category:'entertainment', rarity:'epic',      city:'verona',    region:'veneto',    priceMult:2.20, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.8, tipMult:2.5, policeHeat:2,  duration:6  },
    { id:'cirque_soleil',    name:'Cirque du Soleil — Firenze',   icon:'🎡', category:'entertainment', rarity:'common',    city:'firenze',   region:'toscana',   priceMult:1.40, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.8, tipMult:1.5, policeHeat:1,  duration:6  },
    { id:'boxing_champ',     name:'World Boxing Championship',    icon:'🥊', category:'entertainment', rarity:'rare',      city:'palermo',   region:'sicilia',   priceMult:1.50, rideBias:'business', extraRidesPerHour:4, speedMult:0.8, tipMult:1.5, policeHeat:4,  duration:6,  surge:true },
    { id:'met_gala_italy',   name:'Italian Met Gala — Villa d\'Este',icon:'💎',category:'entertainment',rarity:'epic',    city:'como',      region:'lombardia', priceMult:2.60, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.85,tipMult:3.0, policeHeat:5,  duration:8, requiresReputation:4.0 },
    { id:'dj_festival',      name:'Tomorrowland Italy — Bari',    icon:'🎧', category:'entertainment', rarity:'common',    city:'bari',      region:'puglia',    priceMult:1.40, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.65,tipMult:1.5, policeHeat:4,  duration:8,  surge:true },
    { id:'film_set',         name:'Set Cinematografico — Cinecittà',icon:'🎥',category:'entertainment', rarity:'rare',     city:'roma',      region:'lazio',     priceMult:1.70, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.85,tipMult:2.0, policeHeat:2,  duration:14 },
    { id:'comedy_night',     name:'Zelig Live — Milano Forum',    icon:'😂', category:'entertainment', rarity:'common',    city:'milano',    region:'lombardia', priceMult:1.30, rideBias:'business', extraRidesPerHour:3, speedMult:0.85,tipMult:1.3, policeHeat:1,  duration:4  },
    { id:'arte_moderna',     name:'Opening Triennale — Milano',   icon:'🖼️', category:'entertainment', rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.70, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.85,tipMult:1.8, policeHeat:1,  duration:5  },

    // ── SPORTS ───────────────────────────────────────────────────
    { id:'f1_monza',         name:'Gran Premio Italia — Monza',   icon:'🏎️', category:'sports',        rarity:'legendary', city:'milano',    region:'lombardia', priceMult:2.00, rideBias:'vip',      extraRidesPerHour:7, speedMult:0.55,tipMult:2.0, policeHeat:6,  duration:10, surge:true },
    { id:'champions_final',  name:'Finale UEFA Champions League', icon:'⚽', category:'sports',        rarity:'legendary', city:'roma',      region:'lazio',     priceMult:1.90, rideBias:'vip',      extraRidesPerHour:8, speedMult:0.5, tipMult:2.0, policeHeat:8,  duration:6,  surge:true },
    { id:'giro_italia',      name:'Giro d\'Italia — Tappa Finale',icon:'🚴', category:'sports',        rarity:'epic',      city:'torino',    region:'piemonte',  priceMult:1.60, rideBias:'business', extraRidesPerHour:5, speedMult:0.6, tipMult:1.5, policeHeat:3,  duration:8  },
    { id:'tennis_rome',      name:'Internazionali BNL — Foro Italico',icon:'🎾',category:'sports',     rarity:'rare',      city:'roma',      region:'lazio',     priceMult:1.70, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.8, tipMult:1.7, policeHeat:3,  duration:14 },
    { id:'superbowl_watch',  name:'Super Bowl Watch Party — Milano',icon:'🏈',category:'sports',        rarity:'common',    city:'milano',    region:'lombardia', priceMult:1.30, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.3, policeHeat:1,  duration:5  },
    { id:'juve_inter',       name:'Derby d\'Italia — San Siro',   icon:'🔴', category:'sports',        rarity:'epic',      city:'milano',    region:'lombardia', priceMult:1.80, rideBias:'vip',      extraRidesPerHour:6, speedMult:0.55,tipMult:1.8, policeHeat:10, duration:5,  surge:true },
    { id:'moto_gp_mugello',  name:'MotoGP — Gran Premio Mugello', icon:'🏍️', category:'sports',        rarity:'epic',      city:'firenze',   region:'toscana',   priceMult:1.75, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.65,tipMult:1.8, policeHeat:4,  duration:8  },
    { id:'regata_venezia',   name:'Regata Storica — Venezia',     icon:'⛵', category:'sports',        rarity:'rare',      city:'venezia',   region:'veneto',    priceMult:1.60, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.8, tipMult:1.8, policeHeat:2,  duration:6  },
    { id:'olimpiadi_2032',   name:'Cerimonia Olimpica — Roma',    icon:'🔥', category:'sports',        rarity:'legendary', city:'roma',      region:'lazio',     priceMult:2.50, rideBias:'ultra',    extraRidesPerHour:6, speedMult:0.5, tipMult:2.5, policeHeat:20, duration:10, requiresReputation:3.0, surge:true },
    { id:'vuelta_ciclo',     name:'Vuelta a Italia — Bologna',    icon:'🚵', category:'sports',        rarity:'common',    city:'bologna',   region:'emilia',    priceMult:1.35, rideBias:'business', extraRidesPerHour:3, speedMult:0.75,tipMult:1.3, policeHeat:2,  duration:5  },
    { id:'maratona_roma',    name:'Maratona di Roma',             icon:'🏃', category:'sports',        rarity:'common',    city:'roma',      region:'lazio',     priceMult:1.20, rideBias:'business', extraRidesPerHour:5, speedMult:0.7, tipMult:1.2, policeHeat:3,  duration:6  },
    { id:'golf_open',        name:'Italian Golf Open — Torino',   icon:'⛳', category:'sports',        rarity:'rare',      city:'torino',    region:'piemonte',  priceMult:1.80, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.9, tipMult:2.0, policeHeat:1,  duration:12 },
    { id:'swimming_world',   name:'Mondiali Nuoto — Roma',        icon:'🏊', category:'sports',        rarity:'rare',      city:'roma',      region:'lazio',     priceMult:1.50, rideBias:'business', extraRidesPerHour:4, speedMult:0.85,tipMult:1.4, policeHeat:3,  duration:8  },
    { id:'wimbledon_watch',  name:'Finale Wimbledon Watch — Roma',icon:'🎾', category:'sports',        rarity:'common',    city:'roma',      region:'lazio',     priceMult:1.25, rideBias:'business', extraRidesPerHour:2, speedMult:0.95,tipMult:1.2, policeHeat:1,  duration:4  },
    { id:'boxing_title',     name:'Titolo EBU — Torino PalaAlpitour',icon:'🥊',category:'sports',      rarity:'rare',      city:'torino',    region:'piemonte',  priceMult:1.55, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.8, tipMult:1.6, policeHeat:5,  duration:5,  surge:true },
    { id:'nba_preseason',    name:'NBA Preseason — Milano Forum', icon:'🏀', category:'sports',        rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.60, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.75,tipMult:1.7, policeHeat:3,  duration:5,  surge:true },
    { id:'moto_trial_alpi',  name:'Enduro delle Alpi — Cortina',  icon:'🏔️', category:'sports',        rarity:'common',    city:'cortina',   region:'veneto',    priceMult:1.45, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.85,tipMult:1.5, policeHeat:1,  duration:7  },
    { id:'volley_world',     name:'Campionato Volley — Firenze',  icon:'🏐', category:'sports',        rarity:'common',    city:'firenze',   region:'toscana',   priceMult:1.30, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.2, policeHeat:1,  duration:5  },
    { id:'hockey_final',     name:'Finale Coppa Campioni Hockey', icon:'🏒', category:'sports',        rarity:'common',    city:'torino',    region:'piemonte',  priceMult:1.35, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.3, policeHeat:2,  duration:4  },
    { id:'supercars_rally',  name:'Mille Miglia — Brescia',       icon:'🚗', category:'sports',        rarity:'epic',      city:'brescia',   region:'lombardia', priceMult:1.85, rideBias:'ultra',    extraRidesPerHour:4, speedMult:0.7, tipMult:2.0, policeHeat:4,  duration:12 },

    // ── BUSINESS ─────────────────────────────────────────────────
    { id:'forum_ambrosetti',  name:'Forum Ambrosetti — Cernobbio', icon:'📊', category:'business',     rarity:'legendary', city:'como',      region:'lombardia', priceMult:2.20, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.85,tipMult:2.5, policeHeat:5,  duration:16, requiresReputation:3.0 },
    { id:'web_summit',        name:'Web Summit — Milano',          icon:'💻', category:'business',     rarity:'epic',      city:'milano',    region:'lombardia', priceMult:1.80, rideBias:'business', extraRidesPerHour:5, speedMult:0.85,tipMult:1.8, policeHeat:2,  duration:12 },
    { id:'salone_auto_torino',name:'Salone Internazionale Auto',   icon:'🚘', category:'business',     rarity:'epic',      city:'torino',    region:'piemonte',  priceMult:1.70, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.75,tipMult:1.8, policeHeat:3,  duration:18 },
    { id:'salone_nautico',    name:'Salone Nautico — Genova',      icon:'⛵', category:'business',     rarity:'rare',      city:'genova',    region:'liguria',   priceMult:1.75, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:2.0, policeHeat:2,  duration:10 },
    { id:'borsa_italiana',    name:'IPO Record — Borsa Italiana',  icon:'📈', category:'business',     rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.60, rideBias:'business', extraRidesPerHour:4, speedMult:0.9, tipMult:1.6, policeHeat:2,  duration:8  },
    { id:'luxury_summit',     name:'Luxury Summit — Cortina',      icon:'💎', category:'business',     rarity:'epic',      city:'cortina',   region:'veneto',    priceMult:2.40, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.9, tipMult:3.0, policeHeat:1,  duration:10, requiresReputation:3.5 },
    { id:'fashion_buyers',    name:'Fashion Buyers Week — Milano', icon:'🛍️', category:'business',     rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.75, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.8, tipMult:2.0, policeHeat:1,  duration:10 },
    { id:'medtech_congress',  name:'MedTech Congress — Bologna',   icon:'🏥', category:'business',     rarity:'rare',      city:'bologna',   region:'emilia',    priceMult:1.55, rideBias:'business', extraRidesPerHour:4, speedMult:0.9, tipMult:1.5, policeHeat:1,  duration:8  },
    { id:'legal_forum',       name:'Legal Forum Internazionale',   icon:'⚖️', category:'business',     rarity:'common',    city:'roma',      region:'lazio',     priceMult:1.50, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.5, policeHeat:2,  duration:8  },
    { id:'fintech_summit',    name:'FinTech Summit — Milano',      icon:'🏦', category:'business',     rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.65, rideBias:'business', extraRidesPerHour:4, speedMult:0.9, tipMult:1.6, policeHeat:1,  duration:8  },
    { id:'real_estate_show',  name:'Real Estate Forum — Roma',     icon:'🏗️', category:'business',     rarity:'common',    city:'roma',      region:'lazio',     priceMult:1.45, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.4, policeHeat:1,  duration:8  },
    { id:'agri_expo',         name:'Expo Agricoltura — Bologna',   icon:'🌾', category:'business',     rarity:'common',    city:'bologna',   region:'emilia',    priceMult:1.25, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.2, policeHeat:1,  duration:6  },
    { id:'pharma_congress',   name:'Pharma Congress — Firenze',    icon:'💊', category:'business',     rarity:'rare',      city:'firenze',   region:'toscana',   priceMult:1.55, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.5, policeHeat:1,  duration:8  },
    { id:'design_biennale',   name:'Biennale Design — Milano',     icon:'🪑', category:'business',     rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.70, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:1.7, policeHeat:1,  duration:12 },
    { id:'salone_mobile',     name:'Salone del Mobile — Rho Fiera',icon:'🛋️', category:'business',     rarity:'epic',      city:'milano',    region:'lombardia', priceMult:2.00, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.7, tipMult:2.0, policeHeat:2,  duration:20 },
    { id:'ecommerce_day',     name:'E-Commerce Day — Milano',      icon:'📦', category:'business',     rarity:'common',    city:'milano',    region:'lombardia', priceMult:1.30, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.2, policeHeat:1,  duration:6  },
    { id:'energia_forum',     name:'Forum Energia — Roma',         icon:'⚡', category:'business',     rarity:'rare',      city:'roma',      region:'lazio',     priceMult:1.55, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.5, policeHeat:2,  duration:8  },
    { id:'data_center_open',  name:'Data Center Europa — Torino',  icon:'🖥️', category:'business',     rarity:'common',    city:'torino',    region:'piemonte',  priceMult:1.35, rideBias:'business', extraRidesPerHour:2, speedMult:0.95,tipMult:1.3, policeHeat:1,  duration:6  },
    { id:'startup_pitch',     name:'Startup Pitch Day — Milano',   icon:'🚀', category:'business',     rarity:'common',    city:'milano',    region:'lombardia', priceMult:1.25, rideBias:'business', extraRidesPerHour:3, speedMult:0.95,tipMult:1.2, policeHeat:1,  duration:5  },
    { id:'private_equity',    name:'PE Fund Closing — Milano',     icon:'💼', category:'business',     rarity:'rare',      city:'milano',    region:'lombardia', priceMult:1.75, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.9, tipMult:2.0, policeHeat:1,  duration:6, requiresReputation:3.0 },

    // ── EMERGENCY ────────────────────────────────────────────────
    { id:'sciopero_generale', name:'Sciopero Generale — Tutto Italia', icon:'🪧', category:'emergency', rarity:'epic',      city:null,        region:null,        priceMult:3.00, rideBias:'any',      extraRidesPerHour:10,speedMult:0.9, tipMult:1.0, policeHeat:5,  duration:12, surge:true },
    { id:'aeroporto_chiuso',  name:'Chiusura Aeroporto FCO',       icon:'✈️', category:'emergency',   rarity:'rare',      city:'roma',      region:'lazio',     priceMult:2.80, rideBias:'any',      extraRidesPerHour:8, speedMult:1.0, tipMult:1.0, policeHeat:0,  duration:6,  surge:true, forceAirport:true },
    { id:'alluvione_nord',    name:'Alluvione — Emergenza Nord',   icon:'🌊', category:'emergency',   rarity:'epic',      city:null,        region:null,        priceMult:2.50, rideBias:'any',      extraRidesPerHour:6, speedMult:0.4, tipMult:1.5, policeHeat:0,  duration:8,  surge:true },
    { id:'blackout_milano',   name:'Blackout — Milano Nord',       icon:'⚡', category:'emergency',   rarity:'rare',      city:'milano',    region:'lombardia', priceMult:2.20, rideBias:'any',      extraRidesPerHour:7, speedMult:0.8, tipMult:1.0, policeHeat:0,  duration:4,  surge:true },
    { id:'attentato_falso',   name:'Allarme Bomba — Evacuazione',  icon:'🚨', category:'emergency',   rarity:'epic',      city:'roma',      region:'lazio',     priceMult:2.60, rideBias:'any',      extraRidesPerHour:5, speedMult:0.3, tipMult:0.0, policeHeat:50, duration:3,  surge:true },
    { id:'treno_guasto',      name:'Blocco Alta Velocità — Rete',  icon:'🚆', category:'emergency',   rarity:'common',    city:null,        region:null,        priceMult:2.30, rideBias:'business', extraRidesPerHour:9, speedMult:0.9, tipMult:1.0, policeHeat:0,  duration:5,  surge:true },
    { id:'neve_eccezionale',  name:'Neve Eccezionale — Milano',    icon:'❄️', category:'emergency',   rarity:'rare',      city:'milano',    region:'lombardia', priceMult:2.00, rideBias:'any',      extraRidesPerHour:6, speedMult:0.3, tipMult:1.5, policeHeat:0,  duration:8,  surge:true },
    { id:'terremoto_allarme', name:'Allerta Terremoto — Centro',   icon:'🏚️', category:'emergency',   rarity:'epic',      city:null,        region:null,        priceMult:2.40, rideBias:'any',      extraRidesPerHour:5, speedMult:0.5, tipMult:2.0, policeHeat:3,  duration:6,  surge:true },
    { id:'sciopero_taxi',     name:'Sciopero Taxi Nazionali',      icon:'🚕', category:'emergency',   rarity:'common',    city:null,        region:null,        priceMult:2.00, rideBias:'any',      extraRidesPerHour:12,speedMult:1.0, tipMult:1.0, policeHeat:0,  duration:10, surge:true },
    { id:'cyber_attack',      name:'Cyber Attack — Infrastrutture',icon:'💻', category:'emergency',   rarity:'rare',      city:null,        region:null,        priceMult:1.80, rideBias:'business', extraRidesPerHour:4, speedMult:0.9, tipMult:2.0, policeHeat:10, duration:6,  surge:true },
    { id:'porto_blocco',      name:'Blocco Porto — Genova',        icon:'⚓', category:'emergency',   rarity:'common',    city:'genova',    region:'liguria',   priceMult:1.90, rideBias:'business', extraRidesPerHour:5, speedMult:0.9, tipMult:1.0, policeHeat:0,  duration:8,  surge:true },
    { id:'pandemia_allarme',  name:'Allarme Sanitario — Quarantena',icon:'😷',category:'emergency',   rarity:'legendary', city:null,        region:null,        priceMult:3.50, rideBias:'any',      extraRidesPerHour:2, speedMult:0.7, tipMult:1.5, policeHeat:0,  duration:24, surge:true },
    { id:'incendio_tunnel',   name:'Incendio Traforo — Monte Bianco',icon:'🔥',category:'emergency',  rarity:'rare',      city:null,        region:null,        priceMult:2.10, rideBias:'any',      extraRidesPerHour:4, speedMult:0.5, tipMult:1.0, policeHeat:5,  duration:6,  surge:true },
    { id:'maltempo_sud',      name:'Maltempo Estremo — Sud Italia',icon:'⛈️', category:'emergency',   rarity:'common',    city:null,        region:null,        priceMult:1.70, rideBias:'any',      extraRidesPerHour:5, speedMult:0.5, tipMult:1.3, policeHeat:0,  duration:8,  surge:true },
    { id:'volo_deviato',      name:'Voli Deviati su Bergamo',      icon:'✈️', category:'emergency',   rarity:'common',    city:'milano',    region:'lombardia', priceMult:2.00, rideBias:'any',      extraRidesPerHour:6, speedMult:0.9, tipMult:1.0, policeHeat:0,  duration:5,  surge:true, forceAirport:true },

    // ── EXTRA: MIXED & SEASONAL ───────────────────────────────────
    { id:'capodanno_roma',    name:'Capodanno — Circo Massimo',    icon:'🎆', category:'entertainment', rarity:'legendary',city:'roma',      region:'lazio',     priceMult:2.80, rideBias:'vip',      extraRidesPerHour:8, speedMult:0.5, tipMult:3.0, policeHeat:5,  duration:6,  surge:true },
    { id:'ferragosto',        name:'Esodo di Ferragosto',          icon:'🏖️', category:'entertainment', rarity:'epic',     city:null,        region:null,        priceMult:1.80, rideBias:'any',      extraRidesPerHour:6, speedMult:0.7, tipMult:1.5, policeHeat:2,  duration:24 },
    { id:'carnevale_venezia', name:'Carnevale — Venezia',          icon:'🎭', category:'entertainment', rarity:'epic',     city:'venezia',   region:'veneto',    priceMult:2.10, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.6, tipMult:2.0, policeHeat:2,  duration:16, surge:true },
    { id:'wine_harvest',      name:'Vendemmia Gala — Toscana',     icon:'🍷', category:'entertainment', rarity:'rare',     city:'firenze',   region:'toscana',   priceMult:1.85, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.9, tipMult:2.5, policeHeat:1,  duration:8  },
    { id:'truffle_fair',      name:'Fiera del Tartufo — Alba',     icon:'🍄', category:'business',      rarity:'rare',     city:'torino',    region:'piemonte',  priceMult:1.70, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.9, tipMult:2.0, policeHeat:1,  duration:6  },
    { id:'natale_mercati',    name:'Mercatini di Natale — Bolzano',icon:'🎄', category:'entertainment', rarity:'common',   city:'bolzano',   region:'trentino',  priceMult:1.40, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.8, tipMult:1.5, policeHeat:1,  duration:12 },
    { id:'pasqua_procession', name:'Processione Pasquale — Napoli',icon:'✝️', category:'institutional', rarity:'common',   city:'napoli',    region:'campania',  priceMult:1.50, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.7, tipMult:1.5, policeHeat:3,  duration:6  },
    { id:'estate_musicale',   name:'Estate Musicale — Roma',       icon:'🎸', category:'entertainment', rarity:'common',   city:'roma',      region:'lazio',     priceMult:1.40, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:1.5, policeHeat:2,  duration:8,  surge:true },
    { id:'marathon_milano',   name:'Nike Milano Marathon',         icon:'👟', category:'sports',        rarity:'common',   city:'milano',    region:'lombardia', priceMult:1.25, rideBias:'business', extraRidesPerHour:4, speedMult:0.7, tipMult:1.2, policeHeat:2,  duration:5  },
    { id:'fashion_vintage',   name:'Mercato Vintage Luxe — Torino',icon:'🧥', category:'entertainment', rarity:'common',   city:'torino',    region:'piemonte',  priceMult:1.35, rideBias:'vip',      extraRidesPerHour:2, speedMult:0.9, tipMult:1.4, policeHeat:1,  duration:5  },
    { id:'yacht_show',        name:'Boat Show — Cannes/Napoli',    icon:'🛥️', category:'business',      rarity:'epic',     city:'napoli',    region:'campania',  priceMult:2.10, rideBias:'ultra',    extraRidesPerHour:3, speedMult:0.9, tipMult:2.5, policeHeat:1,  duration:8, requiresReputation:3.0 },
    { id:'helicopter_strike', name:'Sciopero Elicotteri Soccorso', icon:'🚁', category:'emergency',     rarity:'common',   city:null,        region:null,        priceMult:1.60, rideBias:'any',      extraRidesPerHour:4, speedMult:0.9, tipMult:1.2, policeHeat:5,  duration:8,  surge:true },
    { id:'pope_canonization', name:'Canonizzazione — Piazza San Pietro',icon:'🙏',category:'institutional',rarity:'legendary',city:'roma',   region:'lazio',     priceMult:2.00, rideBias:'vip',      extraRidesPerHour:6, speedMult:0.5, tipMult:2.0, policeHeat:15, duration:8  },
    { id:'miss_italia',       name:'Miss Italia — Venezia',        icon:'👑', category:'entertainment', rarity:'rare',     city:'venezia',   region:'veneto',    priceMult:1.65, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:1.8, policeHeat:2,  duration:6  },
    { id:'auto_storica',      name:'Concorso Eleganza — Villa d\'Este',icon:'🏅',category:'business',   rarity:'epic',     city:'como',      region:'lombardia', priceMult:2.30, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.9, tipMult:3.0, policeHeat:1,  duration:6, requiresReputation:3.5 },
    { id:'pride_parade',      name:'Pride Parade — Milano',        icon:'🌈', category:'entertainment', rarity:'common',   city:'milano',    region:'lombardia', priceMult:1.30, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.6, tipMult:1.3, policeHeat:2,  duration:6,  surge:true },
    { id:'comiccon_roma',     name:'Romics — Comic Convention',    icon:'🦸', category:'entertainment', rarity:'common',   city:'roma',      region:'lazio',     priceMult:1.25, rideBias:'business', extraRidesPerHour:4, speedMult:0.85,tipMult:1.2, policeHeat:1,  duration:8  },
    { id:'wine_auction',      name:'Christie\'s Wine Auction — Firenze',icon:'🍾',category:'business',  rarity:'rare',     city:'firenze',   region:'toscana',   priceMult:1.90, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.9, tipMult:2.5, policeHeat:1,  duration:5, requiresReputation:3.0 },
    { id:'art_auction',       name:'Sotheby\'s Italia — Milano',   icon:'🖼️', category:'business',      rarity:'epic',     city:'milano',    region:'lombardia', priceMult:2.20, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.9, tipMult:2.8, policeHeat:1,  duration:6, requiresReputation:3.5 },
    { id:'startup_week',      name:'Startup Week Europe — Milano', icon:'💡', category:'business',      rarity:'rare',     city:'milano',    region:'lombardia', priceMult:1.55, rideBias:'business', extraRidesPerHour:4, speedMult:0.9, tipMult:1.5, policeHeat:1,  duration:10 },
    { id:'diplomatic_dinner', name:'Cena di Gala Diplomatica',     icon:'🍽️', category:'institutional', rarity:'rare',     city:'roma',      region:'lazio',     priceMult:2.10, rideBias:'ultra',    extraRidesPerHour:2, speedMult:0.9, tipMult:2.3, policeHeat:10, duration:5, requiresReputation:3.0 },
    { id:'helicopter_vip',    name:'Trasferimento Elicottero VIP', icon:'🚁', category:'business',      rarity:'common',   city:null,        region:null,        priceMult:1.70, rideBias:'ultra',    extraRidesPerHour:2, speedMult:1.0, tipMult:2.0, policeHeat:0,  duration:3  },
    { id:'summit_davos_live', name:'Davos Live Broadcast — Milano',icon:'🎙️', category:'business',      rarity:'rare',     city:'milano',    region:'lombardia', priceMult:1.60, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.6, policeHeat:2,  duration:8  },
    { id:'modena_motor_val',  name:'Motor Valley Fest — Modena',   icon:'🏁', category:'sports',        rarity:'rare',     city:'modena',    region:'emilia',    priceMult:1.80, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:2.0, policeHeat:2,  duration:10 },
    { id:'cortina_ski_open',  name:'Coppa del Mondo Sci — Cortina',icon:'⛷️', category:'sports',        rarity:'rare',     city:'cortina',   region:'veneto',    priceMult:1.75, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.75,tipMult:1.8, policeHeat:1,  duration:8  },
    { id:'acqua_alta_venezia',name:'Acqua Alta Eccezionale — VE',  icon:'🌊', category:'emergency',     rarity:'rare',     city:'venezia',   region:'veneto',    priceMult:2.30, rideBias:'any',      extraRidesPerHour:5, speedMult:0.4, tipMult:1.5, policeHeat:0,  duration:6,  surge:true },
    { id:'nebbia_pianura',    name:'Nebbia Zero — Pianura Padana', icon:'🌫️', category:'emergency',     rarity:'common',   city:null,        region:null,        priceMult:1.60, rideBias:'any',      extraRidesPerHour:4, speedMult:0.5, tipMult:1.3, policeHeat:0,  duration:6  },
    { id:'concorso_ippico',   name:'Concorso Ippico Internazionale',icon:'🐎',category:'sports',        rarity:'common',   city:'roma',      region:'lazio',     priceMult:1.55, rideBias:'vip',      extraRidesPerHour:3, speedMult:0.9, tipMult:1.7, policeHeat:1,  duration:8  },
    { id:'eurocup_basket',    name:'Eurocup Final8 — Bologna',     icon:'🏀', category:'sports',        rarity:'rare',     city:'bologna',   region:'emilia',    priceMult:1.60, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.8, tipMult:1.6, policeHeat:3,  duration:6,  surge:true },
    { id:'bnl_clay',          name:'Internazionali BNL Finali',    icon:'🎾', category:'sports',        rarity:'rare',     city:'roma',      region:'lazio',     priceMult:1.75, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:1.8, policeHeat:2,  duration:5  },
    { id:'giornata_papa',     name:'Giornata Mondiale Gioventù',   icon:'✝️', category:'institutional', rarity:'epic',     city:'roma',      region:'lazio',     priceMult:1.80, rideBias:'vip',      extraRidesPerHour:5, speedMult:0.55,tipMult:1.5, policeHeat:10, duration:12 },
    { id:'summit_borsa_mi',   name:'Summit CEO Borsa Italiana',    icon:'📉', category:'business',      rarity:'rare',     city:'milano',    region:'lombardia', priceMult:1.65, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.7, policeHeat:2,  duration:6  },
    { id:'festival_eurovis',  name:'Eurovision — Torino Arena',    icon:'🎤', category:'entertainment', rarity:'legendary',city:'torino',    region:'piemonte',  priceMult:2.30, rideBias:'vip',      extraRidesPerHour:7, speedMult:0.55,tipMult:2.5, policeHeat:4,  duration:10, surge:true },
    { id:'artigiano_fiera',   name:'L\'Artigiano in Fiera — Milano',icon:'🎁',category:'business',      rarity:'common',   city:'milano',    region:'lombardia', priceMult:1.30, rideBias:'business', extraRidesPerHour:4, speedMult:0.75,tipMult:1.2, policeHeat:1,  duration:12 },
    { id:'vinitaly_verona',   name:'Vinitaly — Verona',            icon:'🍷', category:'business',      rarity:'rare',     city:'verona',    region:'veneto',    priceMult:1.70, rideBias:'vip',      extraRidesPerHour:4, speedMult:0.85,tipMult:2.0, policeHeat:1,  duration:10 },
    { id:'gastech_expo',      name:'Gastech Expo — Ravenna',       icon:'⛽', category:'business',      rarity:'common',   city:'ravenna',   region:'emilia',    priceMult:1.40, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.3, policeHeat:2,  duration:8  },
    { id:'campus_party',      name:'Campus Party — Bologna',       icon:'🏫', category:'entertainment', rarity:'common',   city:'bologna',   region:'emilia',    priceMult:1.25, rideBias:'business', extraRidesPerHour:3, speedMult:0.9, tipMult:1.2, policeHeat:1,  duration:6  },
    { id:'emergency_protezione',name:'Esercitazione Protezione Civile',icon:'🚒',category:'emergency', rarity:'common',   city:null,        region:null,        priceMult:1.40, rideBias:'any',      extraRidesPerHour:3, speedMult:0.8, tipMult:1.0, policeHeat:5,  duration:4  },
];

// Keep legacy DYNAMIC_EVENTS pointing to TITAN_EVENTS for backward compatibility
const DYNAMIC_EVENTS = TITAN_EVENTS;

// ─── LIVELLI HQ (SEDE AZIENDALE) ─────────────────────────────────
const HQ_LEVELS = [
    { level:0, name:'Garage Condiviso',   maxStaff:2, desc:'Inizio umile. Solo 2 dipendenti simultanei.' },
    { level:1, name:'Ufficio Operativo',  maxStaff:4, desc:'Spazio per 4 dipendenti. Sala riunioni base.' },
    { level:2, name:'HQ Executive',       maxStaff:6, desc:'6 dipendenti. Area lounge inclusa.' },
    { level:3, name:'Campus Chauffeur Empire', maxStaff:99,desc:'Staff illimitato. Struttura flagship.' },
];

// ─── POI FUTURI (LOCKED — ESPANSIONE GLOBALE) ────────────────────
const FUTURE_POIS = {
    zurich:  { id:'zurich',  region:'svizzera',      lat:47.3769, lng:8.5417,  name:'Zurigo 🔒',    type:'hub',    baseFlat:350, minTier:'vip', future:true },
    geneva:  { id:'geneva',  region:'svizzera',      lat:46.2044, lng:6.1432,  name:'Ginevra 🔒',   type:'hub',    baseFlat:320, minTier:'vip', future:true },
    nice:    { id:'nice',    region:'costa_azzurra', lat:43.7102, lng:7.2620,  name:'Nizza 🔒',     type:'hub',    baseFlat:400, minTier:'vip', future:true },
    monaco:  { id:'monaco',  region:'costa_azzurra', lat:43.7384, lng:7.4246,  name:'Montecarlo 🔒',type:'luxury', baseFlat:600, minTier:'ultra', future:true },
    cannes:  { id:'cannes',  region:'costa_azzurra', lat:43.5528, lng:7.0174,  name:'Cannes 🔒',    type:'luxury', baseFlat:500, minTier:'ultra', future:true },
};

// ZTL cities: rides toward these POI IDs may generate ZTL fines without permit
const ZTL_POIS = {
    centro: ['roma','roma_hassler','firenze','perugia'],
    nord:   ['milano','mil_armani','mil_lin','mil_mxp','torino','bologna'],
};

// ─── MERCATO AZIONARIO $WALL-ST ─────────────────────────────────
const STOCK_TICKERS = [
    { id:'OIL',  name:'$OIL',  fullName:'Energia & Petrolio',  basePrice:85,   volatility:0.07, dividendPct:0.020, color:'#f59e0b', icon:'🛢️',  newsKeywords:['carburante','petrolio','costi operativi'] },
    { id:'CARS', name:'$CARS', fullName:'Automotive Global',   basePrice:145,  volatility:0.05, dividendPct:0.015, color:'#3b82f6', icon:'🚗',  newsKeywords:['auto','veicoli','automobilistico','flotta'] },
    { id:'TECH', name:'$TECH', fullName:'Technology Index',    basePrice:312,  volatility:0.11, dividendPct:0.005, color:'#8b5cf6', icon:'💻',  newsKeywords:['digitale','app','tecnologia'] },
    { id:'LUX',  name:'$LUX',  fullName:'Luxury & Fashion',    basePrice:224,  volatility:0.08, dividendPct:0.018, color:'#d4af37', icon:'💎',  newsKeywords:['lusso','moda','fashion','vip','hotel'] },
    { id:'BIO',  name:'$BIO',  fullName:'BioTech & Pharma',    basePrice:67,   volatility:0.17, dividendPct:0.000, color:'#22c55e', icon:'🧬',  newsKeywords:['salute','farmaceutico'] },
];

// ─── PROFILI DI RISCHIO BROKER ───────────────────────────────────
const BROKER_RISK_PROFILES = [
    { id:'low',    name:'Conservativo',  icon:'🛡️',  minReturn:-0.05, maxReturn:0.12, duration:[6,12,24],  color:'#22c55e',  desc:'Fondi obbligazionari governativi. Rischio minimo, rendimento stabile.' },
    { id:'medium', name:'Bilanciato',    icon:'⚖️',   minReturn:-0.20, maxReturn:0.30, duration:[3,6,12],   color:'#f59e0b',  desc:'Mix equity/bond. Volatilità moderata, buone prospettive di crescita.' },
    { id:'high',   name:'Aggressivo',    icon:'🔥',   minReturn:-0.40, maxReturn:0.55, duration:[1,3,6],    color:'#ef4444',  desc:'Derivati e commodity. Alto rischio, rendimenti esplosivi o perdite massive.' },
];

// ─── LIFESTYLE ASSETS ────────────────────────────────────────────
var LIFESTYLE_ASSETS = [
    // ── REAL ESTATE ──────────────────────────────────────────────
    {
        id:'attico_milano', name:'Attico CityLife', location:'Milano, Italia',
        category:'real_estate', icon:'🏙️', price:2800000,
        passive:3500, repBonus:0.3, unlocksDiamond:true, stockBonus:0,
        energyBonus:0.5, staffBonus:0, intlUnlock:false,
        desc:'Penthouse al 38° piano del grattacielo CityLife. Vista su tutta Milano. +€3.500/g rendita. +0.3★ reputazione. Sblocca Diamond Contracts con clienti platinum.'
    },
    {
        id:'villa_porto_cervo', name:'Villa Fronte Mare', location:'Porto Cervo, Sardegna',
        category:'real_estate', icon:'🌊', price:4500000,
        passive:8000, repBonus:0.5, unlocksDiamond:true, stockBonus:0,
        energyBonus:1.0, staffBonus:0.15, intlUnlock:false,
        desc:'Villa esclusiva con accesso privato alla spiaggia. +€8.000/g, +0.5★ rep. Staff recupera energia +15% più veloce. Sblocca Diamond Contracts. Icon dello status nel mercato ultra-luxury.'
    },
    {
        id:'ufficio_wall_street', name:'Ufficio One World Trade', location:'New York, USA',
        category:'real_estate', icon:'🗽', price:6000000,
        passive:12000, repBonus:0.8, unlocksDiamond:true, stockBonus:0.15,
        energyBonus:0, staffBonus:0, intlUnlock:false,
        desc:'Piano 52 di One World Trade Center. Hub finanziario globale. +€12.000/g, +0.8★ rep. +15% rendimenti su tutti gli investimenti azionari. Accesso 24/7 ai mercati.'
    },
    // ── MEZZI ELITE ──────────────────────────────────────────────
    {
        id:'jet_privato', name:'Gulfstream G700', location:'Hangar Fiumicino',
        category:'vehicle_elite', icon:'✈️', price:3500000,
        passive:0, repBonus:1.0, unlocksDiamond:true, stockBonus:0,
        energyBonus:0, staffBonus:0, intlUnlock:true,
        desc:'Jet privato di proprietà. Sblocca tratte internazionali immediate: Ginevra, Montecarlo, Cannes, Dubai. +1.0★ rep. +40% velocità su corse Ultra. Clienti Diamond exigono il jet.'
    },
    {
        id:'yacht_lusso', name:'Mega-Yacht 100m', location:'Porto Cervo / Capri',
        category:'vehicle_elite', icon:'⛵', price:5000000,
        passive:5000, repBonus:0.7, unlocksDiamond:false, stockBonus:0,
        energyBonus:0, staffBonus:0.30, intlUnlock:false,
        desc:'100 metri di pura lusso galleggiante. +€5.000/g charter estive. +0.7★ rep. Staff recupera energia +30% più veloce. I clienti Ultra pagano il 20% in più sulle corse costiere.'
    },
    // ── NUOVI REAL ESTATE ─────────────────────────────────────────
    {
        id:'villa_como', name:'Villa Lago di Como', location:'Como, Italia',
        category:'real_estate', icon:'🏔️', price:3800000,
        passive:7000, repBonus:0.6, unlocksDiamond:true, stockBonus:0,
        energyBonus:1.5, staffBonus:0, intlUnlock:false,
        desc:'Villa neoclassica sul lago più glamour d\'Europa. +€7.000/g, +0.6★. Il CEO recupera +1.5 energia/ora. Sblocca Diamond Contracts con clienti europei UHNW.'
    },
    {
        id:'casino_montecarlo', name:'Membership Casino Monte Carlo', location:'Monaco, Principato',
        category:'real_estate', icon:'🎰', price:1500000,
        passive:3000, repBonus:0.3, unlocksDiamond:false, stockBonus:0.10,
        energyBonus:0, staffBonus:0, intlUnlock:false,
        desc:'Accesso permanente alla sala privée del Casinò di Monte Carlo. +€3.000/g rendita tavoli. +10% su tutti i rendimenti azionari. Clienti VIP con connessioni finanziarie ti cercheranno.'
    },
    {
        id:'penthouse_dubai', name:'Penthouse Burj Khalifa', location:'Dubai, UAE',
        category:'real_estate', icon:'🌃', price:8000000,
        passive:15000, repBonus:1.0, unlocksDiamond:true, stockBonus:0,
        energyBonus:0, staffBonus:0, intlUnlock:true,
        desc:'Piano 148 del Burj Khalifa. La proprietà più esclusiva al mondo. +€15.000/g, +1.0★. Sblocca rotte internazionali verso Dubai, Abu Dhabi, Doha. Diamond Contracts garantiti.'
    },
];

// ─── DIAMOND CONTRACTS (clienti Tier 5 — solo per Empire Builder) ─
const DIAMOND_CONTRACTS = [
    { sender:'Sheikh Al-Maktoum Office',   subject:'🔶 DIAMOND: Transfer Dubai → Montecarlo', basePrice:45000, reqAsset:'jet_privato',       reqRep:5.0 },
    { sender:'Ritz-Carlton Presidential',  subject:'🔶 DIAMOND: Scorta VIP Gala Venezia',     basePrice:28000, reqAsset:'villa_porto_cervo',  reqRep:4.8 },
    { sender:'Formula 1 Paddock Club',     subject:'🔶 DIAMOND: Hospitality Monaco GP',        basePrice:35000, reqAsset:'jet_privato',       reqRep:4.5 },
    { sender:'Sotheby\'s Fine Art',        subject:'🔶 DIAMOND: Escort Opera Milan → Paris',   basePrice:22000, reqAsset:'attico_milano',     reqRep:4.5 },
    { sender:'Anonymous HNW Client',       subject:'🔶 DIAMOND: Contratto Riservato 30gg',     basePrice:80000, reqAsset:'yacht_lusso',       reqRep:5.0 },
];

const LOBBY_LAWS = [
    {
        id: 'law_ztl_exempt',
        name: 'Esenzione ZTL Premium',
        desc: 'I tuoi veicoli NCC sono esenti dalle multe ZTL in tutte le città italiane. Risparmio stimato: €500-2.000/mese.',
        icon: '🚗', pointsCost: 5, cashCost: 15000,
        effect: 'ztl_exempt',
    },
    {
        id: 'law_tax_cut',
        name: 'Riduzione Fiscale Corporate',
        desc: 'Aliquota fiscale corporate ridotta dal 42% al 28% grazie a incentivi per il settore mobilità di lusso.',
        icon: '📉', pointsCost: 10, cashCost: 50000,
        effect: 'tax_cut', taxReduction: 0.28,
    },
    {
        id: 'law_airport_monopoly',
        name: 'Concessione Aeroportuale',
        desc: 'Diritti esclusivi di prelievo NCC nei principali aeroporti italiani. +3 corse VIP/giorno automatiche.',
        icon: '✈️', pointsCost: 8, cashCost: 30000,
        effect: 'airport_monopoly',
    },
    {
        id: 'law_fast_license',
        name: 'Licenze Accelerate',
        desc: 'I nuovi autisti ottengono la licenza NCC in 24h invece di 7 giorni. Recruiting più veloce.',
        icon: '📋', pointsCost: 4, cashCost: 8000,
        effect: 'fast_license',
    },
    {
        id: 'law_fuel_subsidy',
        name: 'Sussidio Carburante',
        desc: 'Sussidio statale: prezzo carburante ridotto del 30% per flotte NCC certificate.',
        icon: '⛽', pointsCost: 6, cashCost: 20000,
        effect: 'fuel_subsidy', fuelDiscount: 0.30,
    },
    {
        id: 'law_data_shield',
        name: 'Scudo Dati Clienti',
        desc: 'Protezione legale totale sui dati clienti — impedisce indagini fiscali per 180 giorni. +0.2★ reputazione corporate.',
        icon: '🛡️', pointsCost: 12, cashCost: 80000,
        effect: 'data_shield',
    },
];

// ─── VENTURE CAPITAL / M&A ────────────────────────────────────────
const VENTURE_AGENCIES = [
    {
        id: 'vc_startup',
        name: 'RideUp Italia',
        desc: 'Startup di ride-hailing focalizzata su Milano e Torino. Alto rischio, alta crescita.',
        icon: '🚀',
        minRep: 2.0,
        minCash: 50000,
        valuation: 500000,
        dailyIncome: 400,
        maxStake: 49,
        riskLevel: 'high',
    },
    {
        id: 'vc_regional',
        name: 'Sud Transfer Group',
        desc: 'Rete NCC affermata in Campania e Sicilia. Flussi stabili da turismo e aeroporti.',
        icon: '🌍',
        minRep: 3.0,
        minCash: 150000,
        valuation: 1500000,
        dailyIncome: 1200,
        maxStake: 35,
        riskLevel: 'medium',
    },
    {
        id: 'vc_luxury',
        name: 'Azzurro Prestige Srl',
        desc: 'Agenzia premium con contratti esclusivi per yacht e ville di lusso in Costa Smeralda.',
        icon: '💎',
        minRep: 4.0,
        minCash: 500000,
        valuation: 5000000,
        dailyIncome: 4500,
        maxStake: 20,
        riskLevel: 'low',
    },
];

// ─── DB REGION → GAME POI HUB MAPPING ───────────────────────────────────────
// Used by generateContractRide() to pick fromPoi/toPoi for serialization compat.
// Keys are routesDB region strings; values are POIS keys.
const DB_REGION_TO_POI_KEY = {
    'Rome':         'roma',
    'Civitavecchia':'civitavecchia',
    'Amalfi Coast': 'napoli',
    'Florence':     'firenze',
    'Venice':       'venezia',
    'Milan':        'milano',
    'Lake Como':    'como',
    'Portofino':    'portofino',
    'Genoa':        'genova',
    'Bologna':      'bologna',
    'Umbria':       'perugia',
    'Puglia':       'bari',
    'Sardinia':     'cagliari',
    'Sicily':       'palermo',
    'South Tyrol':  'trento',
    'Turin':        'torino',
    'Calabria':     'catanzaro',
    'Basilicata':   'potenza',
};
