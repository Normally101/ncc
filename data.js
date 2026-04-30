'use strict';
/* ================================================================
   data.js — Olga Vision Agency · Tycoon Update v8.0
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

// ─── MERCATO AUTO ───────────────────────────────────────────────
const NEW_CARS = [
    { id:'nc_eclass',   name:'Mercedes E-Class (2024)',   tier:'business', price:72000,  condition:100, vehicleClass:'mercedes_e'       },
    { id:'nc_sclass',   name:'Mercedes S-Class (2024)',   tier:'vip',      price:145000, condition:100, vehicleClass:'mercedes_s'       },
    { id:'nc_vclass',   name:'Mercedes V-Class (2024)',   tier:'group',    price:92000,  condition:100, vehicleClass:'mercedes_v'       },
    { id:'nc_sprinter', name:'Mercedes Sprinter (2024)',  tier:'business', price:85000,  condition:100, vehicleClass:'mercedes_sprinter' },
    { id:'nc_ghost',    name:'Rolls-Royce Ghost',         tier:'ultra',    price:360000, condition:100, vehicleClass:'mercedes_e'       }
];

const USED_CARS = [
    { id:'uc_e2019', name:'Audi A6 (2019)',          tier:'business', price:28000, condition:58, vehicleClass:'mercedes_e' },
    { id:'uc_s2017', name:'Mercedes S-Class (2017)', tier:'vip',      price:42000, condition:45, vehicleClass:'mercedes_s' }
];

const LEASING_TEMPLATES = {
    'business': { name:'Mercedes E-Class', baseRate:1100, kmRate:0.05, tier:'business' },
    'vip': { name:'Mercedes S-Class', baseRate:2200, kmRate:0.10, tier:'vip' },
    'group': { name:'Mercedes V-Class', baseRate:1600, kmRate:0.07, tier:'group' },
    'ultra': { name:'Rolls-Royce Ghost', baseRate:5500, kmRate:0.25, tier:'ultra' }
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
const INVESTMENTS = [
    // ─── TIER 1: CONSOLIDAMENTO ──────────────────────────────────
    { id:'inv_garage_hq',        tier:1, name:'Garage HQ Roma',              price:45000,    passive:0,     rep:0.2, desc:'Riduce del 10% tutti i costi fissi giornalieri.' },
    { id:'inv_carwash',          tier:1, name:'Autolavaggio Automatico',      price:18000,    passive:150,   rep:0.1, desc:'+€150/g. Mantiene le auto al +5% condizione costante.' },
    { id:'inv_mobile_workshop',  tier:1, name:'Officina Mobile',              price:22000,    passive:0,     rep:0.0, desc:'Riparazioni 20% più economiche e immediate.' },
    { id:'inv_livrea',           tier:1, name:'Livrea Aziendale Olga Vision', price:14000,    passive:0,     rep:0.2, desc:'+8% tariffa su ogni corsa. +10% Reputazione. Brand recognition.' },
    { id:'inv_ztl_centro',       tier:1, name:'Permesso ZTL Centro Italia',   price:9000,     passive:0,     rep:0.0, desc:'Evita le multe ZTL a Roma, Firenze e Perugia.' },
    { id:'inv_ztl_nord',         tier:1, name:'Permesso ZTL Nord Italia',     price:13000,    passive:0,     rep:0.0, desc:'Evita le multe ZTL a Milano, Torino e Bologna.' },

    // ─── TIER 2: ESPANSIONE BUSINESS ─────────────────────────────
    { id:'inv_terminal_fco',     tier:2, name:'Terminal Privato Fiumicino',   price:80000,    passive:0,     rep:0.3, desc:'+25% probabilità corse Business nel Lazio.' },
    { id:'inv_driver_school',    tier:2, name:'Scuola Guida Sicura',          price:35000,    passive:0,     rep:0.2, desc:'Usura veicoli dimezzata durante ogni corsa.' },
    { id:'inv_app',              tier:2, name:'App Olga Vision Premium',      price:55000,    passive:0,     rep:0.5, desc:'Genera 2 corse extra ogni ora automaticamente.' },
    { id:'inv_hotel_partner',    tier:2, name:'Accordo Hotel 5★ Partner',     price:70000,    passive:0,     rep:0.8, desc:'Genera 3 corse VIP garantite ogni giorno.' },
    { id:'inv_dashcam',          tier:2, name:'Sistema Dashcam AI',           price:25000,    passive:0,     rep:0.1, desc:'Riduce del 50% il rischio incidenti su tutta la flotta. Premi assicurativi -15% in Top 3.' },
    { id:'inv_telepass',         tier:2, name:'Telepass Premium Fleet',       price:15000,    passive:0,     rep:0.0, desc:'-10% durata su tutti i trasferimenti autostradali interregionali.' },
    { id:'inv_kasko',            tier:2, name:'Polizza Kasko Full Fleet',     price:48000,    passive:0,     rep:0.0, desc:'Copertura totale: le riparazioni incidentali non costano nulla. Si rinnova ogni anno.' },
    { id:'inv_loan_facility',    tier:2, name:'Linea di Credito Bancaria',    price:5000,     passive:0,     rep:0.0, desc:'Sblocca prestiti fino a €500.000 con interessi 8% mensili. Attenzione al debito.' },
    { id:'inv_safe_driving',     tier:2, name:'Programma Guida Sicura',        price:28000,    passive:0,     rep:0.1, desc:'Riduce del 50% la probabilità di incidenti. Driver addestrati a posti di blocco.' },
    { id:'inv_airport_bribe',    tier:2, name:'Accordo VIP Aeroporti FCO/MXP', price:42000,    passive:0,     rep:0.2, desc:'+30% generazione corse da/per aeroporti FCO e MXP. Corsie preferenziali.' },
    { id:'inv_fuel_depot',       tier:2, name:'Deposito Carburante Aziendale', price:350000,   passive:0,     rep:0.0, buildTime:3,  dailyUpkeep:500,  desc:'Cisterna aziendale da 50.000L. Le auto si riforniscono gratis dal deposito se hai il Logistics Manager. Acquista gasolio al prezzo di mercato.' },
    { id:'inv_grey_market',      tier:2, name:'Canali Discreti (Grey Market)', price:55000,    passive:0,     rep:0.0, desc:'Missioni anonime a 3× tariffa. Alto rischio: un posto di blocco può sequestrare il veicolo per 7 giorni.' },
    { id:'inv_empty_leg',        tier:2, name:'Empty Leg Optimizer',           price:28000,    passive:0,     rep:0.1, desc:'Corse di ritorno automatiche al 50% tariffa. Elimina i viaggi a vuoto dopo i trasferimenti lunghi.' },

    // ─── TIER 3: LUSSO ESTREMO ───────────────────────────────────
    { id:'inv_pension_fund',     tier:3, name:'Fondo Pensione Dipendenti',    price:75000,    passive:0,     rep:0.3, desc:'Dopo 60 giorni di gioco: +€1.200/g rendita pensionistica. Migliora morale.' },
    { id:'inv_vip_lounge_hq',       tier:3, name:'VIP Lounge HQ',                price:85000,    passive:0,     rep:0.2, desc:'Sala relax interna: i driver recuperano stanchezza 30% più veloce. CEO recupera +2% energia/h quando non è in corsa.' },
    { id:'inv_carbon_neutral',      tier:3, name:'Certificazione Carbon Neutral', price:65000,    passive:0,     rep:0.3, desc:'Sblocca contratti Corporate Green. +15% tariffa su clienti aziende eco-sensitive.' },
    { id:'inv_hotel_exclusive',     tier:3, name:'Esclusiva Hotel de Russie Roma',price:120000,   passive:500,   rep:0.5, desc:'Accordo esclusivo: +€500/g + 5 corse VIP garantite ogni giorno dal principale hotel partner.' },
    { id:'inv_corporate_retainer',  tier:3, name:'Corporate Retainer (3 Aziende)',price:150000,  passive:2000,  rep:0.4, desc:'+€2.000/g da contratti fissi con Fortune 500. +3 corse Business/g garantite anche senza richieste.' },
    { id:'inv_hq_office',           tier:2, name:'Ufficio Executive (HQ Lv2)',    price:600000,   passive:0,     rep:0.1, buildTime:5,  dailyUpkeep:800,  desc:'Amplia la sede: fino a 4 dipendenti contemporanei. Sblocca slot HR e Logistics.' },
    { id:'inv_hq_campus',           tier:3, name:'Campus Olga Vision (HQ Lv3)',   price:1800000,  passive:0,     rep:0.3, buildTime:10, dailyUpkeep:2000, desc:'Campus completo: staff illimitato. Morale driver +10 permanente. Accelera recupero stanchezza.' },
    { id:'inv_security_escort',     tier:3, name:'Security Escort Team',          price:95000,    passive:0,     rep:0.4, desc:'Auto di scorta per clienti HVT (High Value Target). +80% tariffa su missioni diplomatiche. -50% rischio incidenti.' },
    { id:'inv_philanthropy',     tier:3, name:'Fondazione Olga Vision Onlus', price:95000,    passive:0,     rep:0.0, desc:'+0.5★ Reputazione ogni settimana. Migliora l\'immagine pubblica del brand.' },
    { id:'inv_sabotaggio',       tier:3, name:'Agenzia PR Negativa',          price:120000,   passive:0,     rep:0.0, desc:'Diffonde recensioni negative sui competitor. −10% reputazione rivali ogni settimana.' },
    { id:'inv_hangar',           tier:3, name:'Hangar Jet Privati',           price:3500000,  passive:0,     rep:1.0, buildTime:14, dailyUpkeep:5000, desc:'Sblocca corse ULTRA. +1 corsa Ultra ogni ora.' },
    { id:'inv_armored',          tier:3, name:'Chauffeur Blindato',           price:200000,   passive:0,     rep:0.5, desc:'Clienti ad alto rischio: pagano 3× il tariffario.' },
    { id:'inv_yacht',            tier:3, name:'Yacht Charter (Smeralda/Capri)',price:180000,  passive:2500,  rep:1.0, desc:'+€2.500/g & corse stagionali ultra-remunerate.' },
    { id:'inv_helipad',          tier:3, name:'Piazzola Elicottero Centro',   price:450000,   passive:0,     rep:1.5, desc:'+1.5★ Reputazione immediata. Percorrenze più rapide.' },

    // ─── TIER 4: DOMINIO DEL MERCATO ─────────────────────────────
    { id:'inv_national_license', tier:4, name:'Licenza Nazionale NCC',        price:1000000,  passive:0,     rep:1.5, desc:'Sblocca TUTTE le regioni d\'Italia in un colpo solo. Simbolo di dominio assoluto.' },
    { id:'inv_real_estate',      tier:4, name:'Fondo Immobiliare Lusso',      price:1200000,  passive:15000, rep:0.5, desc:'€15.000/g di rendita passiva garantita.' },
    { id:'inv_tower',            tier:4, name:'Olga Vision Tower (Milano)',   price:25000000, passive:0,     rep:2.0, buildTime:30, dailyUpkeep:15000, desc:'Dimezza tutte le tasse. Boost permanente al Ranking.' },
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
const CAR_UPGRADES = [
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
];

// ─── CAMPAGNE MARKETING ──────────────────────────────────────────
const MARKETING_CAMPAIGNS = [
    { id:'standard', name:'Campagna Standard',  dailyCost:500,  extRidesPerHour:2, desc:'+2 corse/ora extra. Social media base.' },
    { id:'social',   name:'Influencer Social',  dailyCost:1500, extRidesPerHour:4, desc:'+4 corse/ora extra. Partnership creator.' },
    { id:'elite',    name:'Elite Media Blitz',  dailyCost:4000, extRidesPerHour:7, desc:'+7 corse/ora extra. TV & stampa lusso.' },
];

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
    { id:'proto_tesla',    name:'Tesla Model S Plaid',   tier:'ultra',    price:220000, condition:100, reqRep:4.5, desc:'Elettrica. Velocità +25%, zero emissioni, silenzio totale.',  vehicleClass:'mercedes_e' },
    { id:'proto_rolls',    name:'Rolls-Royce Spectre',   tier:'ultra',    price:450000, condition:100, reqRep:5.0, desc:'Ultra-luxury. Tariffa base ×5. Solo per clienti Presidential.', vehicleClass:'mercedes_e' },
    { id:'proto_van_vip',  name:'Mercedes V-Classe EQV', tier:'group',    price:180000, condition:100, reqRep:4.0, desc:'Elettrico luxury group. 7 posti, zero emissioni.',              vehicleClass:'mercedes_v' },
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
        id:           'mercedes_e',
        name:         'Mercedes E-Class Sedan',
        shortName:    'Sedan E',
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
        id:           'mercedes_v',
        name:         'Mercedes V-Class Minivan',
        shortName:    'Minivan V',
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
        id:           'mercedes_sprinter',
        name:         'Mercedes Sprinter',
        shortName:    'Sprinter',
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
        id:           'mercedes_s',
        name:         'Mercedes S-Class Presidential',
        shortName:    'Presidential',
        tier:         'ultra',
        capacity:     3,
        extraHrNet:   195.00,
        extraHrSell:  243.75,
        waitHalfHr:   97.50,
        waitFullHr:   195.00,
        fuelPerKm:    0.14,
        purchasePrice:220000,
        dailyLeaseCost:185,
        desc:         'Berlina presidenziale per VIP, diplomatici e clienti premium. Sblocca 154 tratte Presidential del contratto Classic Vacations.',
        icon:         '👑',
        requiresRep:  3.5,
    },
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
    { level:3, name:'Campus Olga Vision', maxStaff:99,desc:'Staff illimitato. Struttura flagship.' },
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
const LIFESTYLE_ASSETS = [
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
