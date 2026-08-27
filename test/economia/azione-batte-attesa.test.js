'use strict';
// BLOCCO 2 — il cuore del bilanciamento: fare deve rendere piu' che aspettare.
//
// Misurato prima dell'intervento: un contratto tier 5 pagava €137.600 al giorno
// senza consumare auto, autisti, carburante o tempo, mentre una corsa guidata
// rende in mediana €360. Un solo contratto valeva 380 corse al giorno: il gioco
// premiava l'attesa. E il prezzo di una corsa era il prodotto di 15 fattori
// senza alcun tetto, l'incasso di altri 19.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Un contratto attivo pronto all'uso, con la sua azienda.
function contratto(sandbox, { tier = 5, payoutPerHour = 8600, giorni = 30 } = {}) {
    const gs = sandbox.gameState;
    const co = { company_name: 'Test Corp', tier, payout_per_hour: payoutPerHour,
                 contract_duration_days: giorni,
                 tender_requirements: { min_fleet_size: 1, min_reputation: 0 } };
    const c = { id: 'ctr_test', companyId: co.company_name, company: co,
                startDay: gs.day, endDay: gs.day + giorni,
                dailyPayout: Math.round(payoutPerHour * 2), totalEarned: 0,
                status: 'active', veicoliImpegnati: Math.max(1, Math.min(5, tier)) };
    gs.corporateContracts = [c];
    return c;
}

function flotta(sandbox, n) {
    const gs = sandbox.gameState;
    gs.fleet = [];
    for (let i = 0; i < n; i++)
        gs.fleet.push({ id: 'v' + i, name: 'Auto ' + i, tier: 'business',
                        vehicleClass: 'stellar_e_exec', condition: 100, fuel: 100,
                        outOfService: null, isSeized: false, upgrades: [] });
    return gs.fleet;
}

describe('economia/azione-batte-attesa — il passivo e\' il frutto di una flotta', () => {

    describe('la scala dei contratti', () => {
        test('un contratto tier 5 non vale piu\' 380 corse al giorno', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const c = contratto(sandbox, { tier: 5, payoutPerHour: 8600 });
                // Prima: 8600 × 16 = 137.600. Ora: 8600 × 2 = 17.200.
                assert.equal(c.dailyPayout, 17_200,
                    'la scala e\' 2 ore di servizio garantito, non 16');

                // Il conto che la giustifica: per veicolo impegnato deve stare
                // sotto quanto quel veicolo renderebbe in corse (~€3.600/giorno).
                const perVeicolo = c.dailyPayout / c.veicoliImpegnati;
                assert.ok(perVeicolo < 3600,
                    `un veicolo in contratto (${perVeicolo}) deve rendere meno che in corse (3600): ` +
                    'il contratto e\' garantito e non chiede attenzione, quindi paga un po\' meno');
                assert.ok(perVeicolo > 2500,
                    'ma non troppo meno, altrimenti nessuno firmerebbe un contratto');
            } finally { stopAllIntervals(); }
        });

        test('il tier decide quanti veicoli restano impegnati', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                for (const [tier, atteso] of [[1, 1], [3, 3], [5, 5]]) {
                    const c = contratto(sandbox, { tier });
                    assert.equal(c.veicoliImpegnati, atteso,
                        `un contratto tier ${tier} deve impegnare ${atteso} veicoli`);
                }
            } finally { stopAllIntervals(); }
        });
    });

    describe('i veicoli impegnati escono davvero dalle corse', () => {
        test('con capacita\' sufficiente il contratto blocca solo i suoi veicoli', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                flotta(sandbox, 8);
                contratto(sandbox, { tier: 5 });

                const bloccati = sandbox.window.corporateLockedVehicleIds();
                assert.equal(bloccati.length, 5, 'un tier 5 blocca 5 veicoli');
                assert.equal(new Set(bloccati).size, 5, 'i veicoli bloccati sono distinti');
            } finally { stopAllIntervals(); }
        });

        test('un autista su un veicolo impegnato non puo\' prendere corse', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                flotta(sandbox, 6);
                contratto(sandbox, { tier: 5 });   // blocca i primi 5: v0..v4

                const corsa = { id: 1, tier: 'standard', price: 150,
                                fromPoi: { id: 'roma', region: 'lazio' },
                                toPoi: { id: 'mil', region: 'lombardia' } };

                const autista = (carId) => ({ id: 'd_' + carId, status: 'idle', queue: [],
                                              assignedCarId: carId, level: 0 });

                assert.equal(sandbox._driverCanTakeRide(autista('v0'), corsa), false,
                    'il veicolo impegnato nel contratto non e\' disponibile per le corse');
                assert.equal(sandbox._driverCanTakeRide(autista('v5'), corsa), true,
                    'il veicolo libero resta disponibile');
            } finally { stopAllIntervals(); }
        });

        test('senza contratti attivi non c\'e\' nessun blocco', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                flotta(sandbox, 4);
                sandbox.gameState.corporateContracts = [];
                assert.equal(sandbox.window.corporateLockedVehicleIds().length, 0);
            } finally { stopAllIntervals(); }
        });
    });

    describe('il pagamento segue la capacita\' reale', () => {
        test('con la flotta al completo si incassa tutto', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                flotta(sandbox, 5);
                const c = contratto(sandbox, { tier: 5 });
                gs.cash = 0;

                sandbox.CE_Contracts.dailyTick();

                assert.equal(gs.cash, c.dailyPayout, 'capacita\' piena: si incassa l\'intero');
                assert.equal(c.ultimaQuota, 1);
            } finally { stopAllIntervals(); }
        });

        test('se vendi le auto il contratto paga in proporzione, non piu\' dal nulla', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                flotta(sandbox, 2);                 // ne servono 5, ne restano 2
                const c = contratto(sandbox, { tier: 5 });
                gs.cash = 0;

                sandbox.CE_Contracts.dailyTick();

                assert.equal(gs.cash, Math.round(c.dailyPayout * 2 / 5),
                    'con 2 veicoli su 5 si incassa il 40%: il passivo non e\' piu\' denaro dal nulla');
                assert.ok(Math.abs(c.ultimaQuota - 0.4) < 1e-9);
            } finally { stopAllIntervals(); }
        });

        test('senza nessun veicolo utilizzabile non si incassa niente', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                flotta(sandbox, 3).forEach(v => { v.outOfService = true; });
                contratto(sandbox, { tier: 3 });
                gs.cash = 0;

                sandbox.CE_Contracts.dailyTick();

                assert.equal(gs.cash, 0, 'una flotta ferma non produce reddito da contratto');
            } finally { stopAllIntervals(); }
        });
    });

    describe('il tetto ai moltiplicatori', () => {
        test('le costanti esistono e sono quelle decise', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                assert.equal(sandbox.TETTO_MOLT_PREZZO, 10);
                assert.equal(sandbox.TETTO_MOLT_INCASSO, 4);
            } finally { stopAllIntervals(); }
        });

        test('nemmeno con tutti i bonus insieme una corsa vale milioni', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                // Lo scenario estremo: tutte le regioni aperte e ogni bonus attivo.
                const vm = require('node:vm');
                const regioni = vm.runInContext('Object.keys(REGIONS)', sandbox);
                const massimoBase = vm.runInContext(
                    'Math.max(...Object.values(POIS).map(p => p.baseFlat || 0))', sandbox);

                gs.unlockedRegions = regioni;
                gs.investments = ['inv_livrea', 'inv_security_escort', 'inv_carbon_neutral', 'inv_sponsorship'];
                gs.lifestyleAssets = ['yacht_lusso'];
                gs.cannesBoostDays = 7;
                gs.weather = 'snow';

                // Il tetto e' sul PRODOTTO dei moltiplicatori: nessuna corsa puo'
                // superare il POI piu' caro moltiplicato per il tetto.
                const tettoAssoluto = massimoBase * sandbox.TETTO_MOLT_PREZZO;
                let massimoVisto = 0;

                for (let i = 0; i < 400; i++) {
                    gs.pendingRides = [];
                    const r = sandbox.generatePOIRide();
                    if (r) {
                        massimoVisto = Math.max(massimoVisto, r.price);
                        assert.ok(r.price <= tettoAssoluto,
                            `nessuna corsa puo' superare baseFlat×${sandbox.TETTO_MOLT_PREZZO} ` +
                            `(${tettoAssoluto}), trovata ${r.price}`);
                    }
                }
                assert.ok(massimoVisto > 0, 'il test deve aver generato almeno una corsa');
            } finally { stopAllIntervals(); }
        });
    });
});
