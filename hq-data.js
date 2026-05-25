'use strict';

window.HQ_CITIES = [
    { id: 'roma', name: 'Roma', icon: '🏛️', desc: 'Capitale, sede principale.' },
    { id: 'milano', name: 'Milano', icon: '👔', desc: 'Hub finanziario e business.' },
    { id: 'firenze', name: 'Firenze', icon: '⚜️', desc: 'Turismo di lusso e arte.' },
    { id: 'napoli', name: 'Napoli', icon: '🌋', desc: 'Snodo logistico del sud.' },
    { id: 'venezia', name: 'Venezia', icon: '🛶', desc: 'Water Taxi e turismo esclusivo.' }
];

window.HQ_ROOMS = [
    {
        id: 'garage_main', name: 'Garage', icon: '🏠', prereqs: [],
        desc: 'Struttura base per ospitare i veicoli aziendali.',
        tiers: [
            { level: 1, cost: 0, effect: { extraVehicleSlots: 2 }, score: 5, reqRep: 0 },
            { level: 2, cost: 100000, effect: { extraVehicleSlots: 5 }, score: 10, reqRep: 1 },
            { level: 3, cost: 500000, effect: { extraVehicleSlots: 10 }, score: 20, reqRep: 3 }
        ]
    },
    {
        id: 'gym', name: 'Palestra', icon: '🏋️', prereqs: ['garage_main'],
        desc: 'Mantiene gli autisti in forma, aumentando il morale.',
        tiers: [
            { level: 1, cost: 120000, effect: { dailyMoraleBonus: 5 }, score: 10, reqRep: 0 },
            { level: 2, cost: 250000, effect: { dailyMoraleBonus: 10 }, score: 15, reqRep: 1 },
            { level: 3, cost: 600000, effect: { dailyMoraleBonus: 20 }, score: 25, reqRep: 3 }
        ]
    },
    {
        id: 'mission_room', name: 'Sala Missioni', icon: '🎯', prereqs: ['garage_main'],
        desc: 'Ottimizza i percorsi e aumenta l\'esperienza generata.',
        tiers: [
            { level: 1, cost: 200000, effect: { driverXpMult: 1.15 }, score: 15, reqRep: 0 },
            { level: 2, cost: 400000, effect: { driverXpMult: 1.30 }, score: 25, reqRep: 2 },
            { level: 3, cost: 1000000, effect: { driverXpMult: 1.50 }, score: 40, reqRep: 4 }
        ]
    },
    {
        id: 'workshop', name: 'Officina', icon: '🔧', prereqs: ['garage_main'],
        desc: 'Ripara automaticamente i veicoli danneggiati ogni giorno.',
        tiers: [
            { level: 1, cost: 180000, effect: { autoRepairThreshold: 20, autoRepairDaily: 10 }, score: 12, reqRep: 0 },
            { level: 2, cost: 350000, effect: { autoRepairThreshold: 40, autoRepairDaily: 25 }, score: 22, reqRep: 2 },
            { level: 3, cost: 800000, effect: { autoRepairThreshold: 60, autoRepairDaily: 50 }, score: 35, reqRep: 4 }
        ]
    },
    {
        id: 'canteen', name: 'Mensa', icon: '🍕', prereqs: ['gym'],
        desc: 'Riduce i costi dei salari fornendo benefit aziendali.',
        tiers: [
            { level: 1, cost: 90000, effect: { salaryCostMult: 0.90 }, score: 8, reqRep: 0 },
            { level: 2, cost: 180000, effect: { salaryCostMult: 0.85 }, score: 16, reqRep: 1 },
            { level: 3, cost: 450000, effect: { salaryCostMult: 0.75 }, score: 30, reqRep: 3 }
        ]
    },
    {
        id: 'control_tower', name: 'Torre di Controllo', icon: '📡', prereqs: ['mission_room'],
        desc: 'Aumenta le corse VIP intercettando le comunicazioni.',
        tiers: [
            { level: 1, cost: 350000, effect: { vipRideBonus: 0.20 }, score: 20, reqRep: 1 },
            { level: 2, cost: 700000, effect: { vipRideBonus: 0.35 }, score: 35, reqRep: 3 },
            { level: 3, cost: 1500000, effect: { vipRideBonus: 0.50 }, score: 50, reqRep: 4 }
        ]
    },
    {
        id: 'security_bunker', name: 'Bunker Sicurezza', icon: '🛡️', prereqs: ['control_tower'],
        desc: 'Difende dalle operazioni ombra dei competitor.',
        tiers: [
            { level: 1, cost: 500000, effect: { shadowDefenseBonus: 2 }, score: 25, reqRep: 2 },
            { level: 2, cost: 1000000, effect: { shadowDefenseBonus: 4 }, score: 40, reqRep: 3 },
            { level: 3, cost: 2500000, effect: { shadowDefenseBonus: 7 }, score: 60, reqRep: 5 }
        ]
    },
    {
        id: 'infirmary', name: 'Infermeria', icon: '💊', prereqs: ['canteen'],
        desc: 'Riduce la probabilità e durata dei burnout.',
        tiers: [
            { level: 1, cost: 150000, effect: { burnoutReduction: 0.30 }, score: 12, reqRep: 0 },
            { level: 2, cost: 300000, effect: { burnoutReduction: 0.50 }, score: 24, reqRep: 2 },
            { level: 3, cost: 800000, effect: { burnoutReduction: 0.80 }, score: 40, reqRep: 4 }
        ]
    },
    {
        id: 'it_center', name: 'Centro IT', icon: '💻', prereqs: ['mission_room'],
        desc: 'Ottimizza il booking, garantendo mance migliori.',
        tiers: [
            { level: 1, cost: 280000, effect: { tipMult: 1.05 }, score: 18, reqRep: 1 },
            { level: 2, cost: 600000, effect: { tipMult: 1.10 }, score: 32, reqRep: 3 },
            { level: 3, cost: 1500000, effect: { tipMult: 1.20 }, score: 50, reqRep: 4 }
        ]
    },
    {
        id: 'ev_parking', name: 'Parcheggio EV', icon: '🔋', prereqs: ['workshop'],
        desc: 'Infrastruttura per ricaricare le auto elettriche.',
        tiers: [
            { level: 1, cost: 200000, effect: { freeEVRecharge: true }, score: 15, reqRep: 0 },
            { level: 2, cost: 400000, effect: { freeEVRecharge: true, evRangeBonus: 1.10 }, score: 25, reqRep: 2 },
            { level: 3, cost: 900000, effect: { freeEVRecharge: true, evRangeBonus: 1.25 }, score: 45, reqRep: 4 }
        ]
    },
    {
        id: 'helipad', name: 'Helipad', icon: '🛫', prereqs: ['control_tower'],
        desc: 'Sblocca e migliora la gestione dei velivoli.',
        tiers: [
            { level: 1, cost: 2000000, effect: { helicopterRideGateOverride: 500 }, score: 30, reqRep: 3 },
            { level: 2, cost: 4000000, effect: { helicopterRideGateOverride: 300 }, score: 50, reqRep: 4 },
            { level: 3, cost: 10000000, effect: { helicopterRideGateOverride: 100 }, score: 80, reqRep: 5 }
        ]
    },
    {
        id: 'rd_lab', name: 'Laboratorio R&D', icon: '🔬', prereqs: ['it_center'],
        desc: 'Innova le tecnologie aziendali riducendo i costi di upgrade.',
        tiers: [
            { level: 1, cost: 800000, effect: { upgradeDiscountMult: 0.90 }, score: 22, reqRep: 2 },
            { level: 2, cost: 2000000, effect: { upgradeDiscountMult: 0.75 }, score: 40, reqRep: 4 },
            { level: 3, cost: 5000000, effect: { upgradeDiscountMult: 0.50 }, score: 70, reqRep: 5 }
        ]
    },
    {
        id: 'vip_lounge', name: 'VIP Lounge', icon: '🥂', prereqs: ['control_tower', 'canteen'],
        desc: 'Aumenta il prestigio aziendale permanente.',
        tiers: [
            { level: 1, cost: 400000, effect: { reputationBonus: 0.2 }, score: 20, reqRep: 2 },
            { level: 2, cost: 1000000, effect: { reputationBonus: 0.5 }, score: 40, reqRep: 3 },
            { level: 3, cost: 3000000, effect: { reputationBonus: 1.0 }, score: 70, reqRep: 5 }
        ]
    },
    {
        id: 'crypto_vault', name: 'Crypto Vault', icon: '🔐', prereqs: ['security_bunker'],
        desc: 'Protegge i prelievi offshore dalle indagini GdF.',
        tiers: [
            { level: 1, cost: 1000000, effect: { offshoreSiezeReduction: 0.30 }, score: 28, reqRep: 3 },
            { level: 2, cost: 3000000, effect: { offshoreSiezeReduction: 0.60 }, score: 50, reqRep: 4 },
            { level: 3, cost: 8000000, effect: { offshoreSiezeReduction: 0.90 }, score: 90, reqRep: 5 }
        ]
    },
    {
        id: 'penthouse', name: 'Penthouse', icon: '🏙️', prereqs: ['vip_lounge', 'rd_lab'],
        desc: 'Massimizza i profitti globali. Il vero potere esecutivo.',
        tiers: [
            { level: 1, cost: 5000000, effect: { allEarningsMult: 1.25 }, score: 50, reqRep: 4 },
            { level: 2, cost: 15000000, effect: { allEarningsMult: 1.50 }, score: 80, reqRep: 4.5 },
            { level: 3, cost: 40000000, effect: { allEarningsMult: 2.00 }, score: 150, reqRep: 5 }
        ]
    },
    {
        id: 'water_dock', name: 'Molo Water Taxi', icon: '🚤', prereqs: [],
        desc: 'Esclusivo per Venezia. Sblocca le corse sui canali.',
        tiers: [
            { level: 1, cost: 100000, effect: { unlocksWaterTaxis: true }, score: 10, reqRep: 0 },
            { level: 2, cost: 500000, effect: { unlocksWaterTaxis: true, waterTaxiTipMult: 1.2 }, score: 25, reqRep: 2 },
            { level: 3, cost: 1500000, effect: { unlocksWaterTaxis: true, waterTaxiTipMult: 1.5 }, score: 50, reqRep: 4 }
        ],
        citySpecific: ['venezia']
    }
];
