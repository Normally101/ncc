'use strict';

window.HQ_CITIES = [
    {
        id: 'roma', name: 'Roma', icon: '🏛️', desc: 'Capitale, sede principale.',
        slots: [
            { id: 0, left: '22%', top: '45%' },
            { id: 1, left: '46%', top: '33%' },
            { id: 2, left: '62%', top: '48%' },
            { id: 3, left: '38%', top: '63%' }
        ]
    },
    {
        id: 'milano', name: 'Milano', icon: '👔', desc: 'Hub finanziario e business.',
        slots: [
            { id: 0, left: '24%', top: '32%' },
            { id: 1, left: '50%', top: '27%' },
            { id: 2, left: '18%', top: '52%' },
            { id: 3, left: '44%', top: '48%' },
            { id: 4, left: '65%', top: '50%' }
        ]
    },
    {
        id: 'firenze', name: 'Firenze', icon: '⚜️', desc: 'Turismo di lusso e arte.',
        slots: [
            { id: 0, left: '18%', top: '35%' },
            { id: 1, left: '40%', top: '28%' },
            { id: 2, left: '62%', top: '32%' },
            { id: 3, left: '24%', top: '55%' },
            { id: 4, left: '46%', top: '50%' },
            { id: 5, left: '66%', top: '52%' }
        ]
    },
    {
        id: 'napoli', name: 'Napoli', icon: '🌋', desc: 'Snodo logistico del sud.',
        slots: [
            { id: 0, left: '18%', top: '45%' },
            { id: 1, left: '38%', top: '35%' },
            { id: 2, left: '58%', top: '42%' },
            { id: 3, left: '28%', top: '62%' },
            { id: 4, left: '55%', top: '62%' }
        ]
    },
    {
        id: 'venezia', name: 'Venezia', icon: '🛶', desc: 'Water Taxi e turismo esclusivo.',
        slots: [
            { id: 0, left: '20%', top: '45%' },
            { id: 1, left: '40%', top: '36%' },
            { id: 2, left: '62%', top: '40%' },
            { id: 3, left: '75%', top: '38%' },
            { id: 4, left: '48%', top: '60%' }
        ]
    }
];

window.HQ_ROOMS = [
    {
        id: 'garage_main', name: 'Garage', icon: '🏠', prereqs: [],
        desc: 'Struttura base per ospitare i veicoli aziendali.',
        tiers: [
            { level: 1, cost: 0,      effect: { extraVehicleSlots: 2 },  score: 5,  reqRep: 0 },
            { level: 2, cost: 100000, effect: { extraVehicleSlots: 5 },  score: 10, reqRep: 1 },
            { level: 3, cost: 500000, effect: { extraVehicleSlots: 10 }, score: 20, reqRep: 3 }
        ]
    },
    {
        id: 'workshop', name: 'Officina', icon: '🔧', prereqs: ['garage_main'],
        desc: 'Ripara automaticamente i veicoli danneggiati ogni giorno.',
        tiers: [
            { level: 1, cost: 180000,  effect: { autoRepairThreshold: 20, autoRepairDaily: 10 }, score: 12, reqRep: 0 },
            { level: 2, cost: 350000,  effect: { autoRepairThreshold: 40, autoRepairDaily: 25 }, score: 22, reqRep: 2 },
            { level: 3, cost: 800000,  effect: { autoRepairThreshold: 60, autoRepairDaily: 50 }, score: 35, reqRep: 4 }
        ]
    },
    {
        id: 'mission_room', name: 'Sala Missioni', icon: '🎯', prereqs: ['garage_main'],
        desc: "Ottimizza i percorsi e aumenta l'esperienza generata.",
        tiers: [
            { level: 1, cost: 200000,  effect: { driverXpMult: 1.15 }, score: 15, reqRep: 0 },
            { level: 2, cost: 400000,  effect: { driverXpMult: 1.30 }, score: 25, reqRep: 2 },
            { level: 3, cost: 1000000, effect: { driverXpMult: 1.50 }, score: 40, reqRep: 4 }
        ]
    },
    {
        id: 'control_tower', name: 'Torre di Controllo', icon: '📡', prereqs: ['mission_room'],
        desc: 'Aumenta le corse VIP intercettando le comunicazioni.',
        tiers: [
            { level: 1, cost: 350000,  effect: { vipRideBonus: 0.20 }, score: 20, reqRep: 1 },
            { level: 2, cost: 700000,  effect: { vipRideBonus: 0.35 }, score: 35, reqRep: 3 },
            { level: 3, cost: 1500000, effect: { vipRideBonus: 0.50 }, score: 50, reqRep: 4 }
        ]
    },
    {
        id: 'penthouse', name: 'Penthouse', icon: '🏙️', prereqs: ['control_tower'],
        desc: 'Massimizza i profitti globali. Il vero potere esecutivo.',
        tiers: [
            { level: 1, cost: 5000000,  effect: { allEarningsMult: 1.10 }, score: 30,  reqRep: 3 },
            { level: 2, cost: 10000000, effect: { allEarningsMult: 1.25 }, score: 50,  reqRep: 4 },
            { level: 3, cost: 20000000, effect: { allEarningsMult: 1.50 }, score: 80,  reqRep: 4.5 },
            { level: 4, cost: 35000000, effect: { allEarningsMult: 1.75 }, score: 110, reqRep: 5 },
            { level: 5, cost: 50000000, effect: { allEarningsMult: 2.00 }, score: 150, reqRep: 5 }
        ]
    },
    {
        id: 'vip_lounge', name: 'VIP Lounge', icon: '🥂', prereqs: ['control_tower'],
        desc: 'Esclusivo Firenze. Aumenta il prestigio e le tariffe VIP.',
        tiers: [
            { level: 1, cost: 400000,  effect: { reputationBonus: 0.2, vipRideBonus: 0.10 }, score: 20, reqRep: 2 },
            { level: 2, cost: 1000000, effect: { reputationBonus: 0.5, vipRideBonus: 0.20 }, score: 40, reqRep: 3 },
            { level: 3, cost: 3000000, effect: { reputationBonus: 1.0, vipRideBonus: 0.35 }, score: 70, reqRep: 5 }
        ],
        citySpecific: ['firenze']
    }
];
