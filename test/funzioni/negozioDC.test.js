'use strict';
/* ============================================================================
   test/funzioni/negozioDC.test.js — Negozio Driver Coins & Executive Club

   Verifica completa del funzionamento della feature "negozioDC" (attualmente
   disattivata in config.js):
   - Rendering UI e cambio tab (renderTabPremiumStore, _ecSwitchTab)
   - Acquisto simulato DC (_dcSimPurchase) nei vari tagli
   - Spese DC generiche (_dcSpend: offline_limit, auto_rest, energy_full, repair_all, unlock_ride)
   - Servizi esclusivi Executive Club (_ecCaffeSospeso, _ecManutenzioneExpress,
     _ecTangenteSindacato, _ecPolizzaKasko, _ecRadarVip, _ecTargaPresidenziale)
   - Boosters e funzioni di gestione flotta/staff/costruzioni in engine-store.js
     (activateExecutivePass, skipConstruction, fuelBoostDC, wakeDriverDC,
     energyBoostDC, instaHealDC, wakeAllDriversDC, healAllDriversDC,
     skipAllAcademyDC, skipAllConstructionsDC, opsBundleDC, fullBundleDC)
   - Comunicazione autoritativa col server tramite CE_money (spendDC / earnDC)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione negozioDC — Negozio Driver Coins ed Executive Club', () => {
    let env, sandbox, gs;
    let rpcSpendCalls;
    let rpcAddCalls;

    beforeEach(() => {
        rpcSpendCalls = [];
        rpcAddCalls = [];
        env = freshEnv({
            render: true,
            serverState: {
                spendDriverCoins: async (motivo, n) => {
                    rpcSpendCalls.push({ motivo, n });
                    return { ok: true, driver_coins: (sandbox.gameState.driverCoins || 0) };
                },
                addDriverCoins: async (n, motivo) => {
                    rpcAddCalls.push({ motivo, n });
                    return { ok: true, driver_coins: (sandbox.gameState.driverCoins || 0) };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;

        const container = sandbox.document.createElement('div');
        container.id = 'tab-container';
        sandbox.document.body.appendChild(container);
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('1. Rendering e navigazione tab (renderTabPremiumStore, _ecSwitchTab)', () => {
        test('renderTabPremiumStore genera il layout completo con tab acquisti e saldo DC', () => {
            const container = sandbox.document.getElementById('tab-container');

            gs.driverCoins = 150;
            sandbox.renderTabPremiumStore();

            const html = container.innerHTML;
            assert.ok(html.includes('Executive Club'), 'manca titolo Executive Club');
            assert.ok(html.includes('150'), 'manca saldo Driver Coins');
            assert.ok(html.includes('Acquista DC'), 'manca tab Acquista DC');
            assert.ok(html.includes('Servizi Esclusivi'), 'manca tab Servizi Esclusivi');
            assert.ok(html.includes('Starter Pack'), 'manca starter pack');
            assert.ok(html.includes('Il Fondo Sovrano'), 'manca fondo sovrano pack');
        });

        test('_ecSwitchTab commuta tra la vista pacchetti DC e la vista servizi esclusivi', () => {
            const container = sandbox.document.getElementById('tab-container');

            sandbox._ecSwitchTab('services');
            let html = container.innerHTML;
            assert.ok(html.includes('Operatività &amp; Flotta') || html.includes('Operatività & Flotta') || html.includes('Flotta'), 'manca sezione flotta');
            assert.ok(html.includes('Rifornimento Flotta'), 'manca servizio rifornimento');
            assert.ok(html.includes('Executive Pass'), 'manca pass executive');

            sandbox._ecSwitchTab('acquire');
            html = container.innerHTML;
            assert.ok(html.includes('Starter Pack'), 'manca vista starter pack');
        });

        test('renderTabPremiumStore solleva TypeError se tab-container è assente (manca guardia if (!container))', () => {
            const el = sandbox.document.getElementById('tab-container');
            if (el) el.remove();
            assert.throws(() => {
                sandbox.renderTabPremiumStore();
            }, /Cannot set propert/);
        });
    });

    describe('2. Acquisto DC simulato (_dcSimPurchase)', () => {
        test('_dcSimPurchase accredita DC tramite CE_money ed esegue la RPC di accredito', () => {
            gs.driverCoins = 0;
            sandbox._dcSimPurchase(50);

            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcAddCalls.length, 1);
            assert.equal(rpcAddCalls[0].n, 50);
            assert.equal(rpcAddCalls[0].motivo, 'sim_purchase');
        });

        test('_dcSimPurchase con tagli multipli (220, 600, 1300 DC) accumula correttamente il saldo', () => {
            gs.driverCoins = 10;
            sandbox._dcSimPurchase(220);
            sandbox._dcSimPurchase(600);
            sandbox._dcSimPurchase(1300);

            assert.equal(gs.driverCoins, 2130);
            assert.equal(rpcAddCalls.length, 3);
        });

        test('_dcSimPurchase con valore negativo o non valido non accredita DC', () => {
            gs.driverCoins = 50;
            sandbox._dcSimPurchase(-100);
            sandbox._dcSimPurchase(NaN);

            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcAddCalls.length, 0);
        });
    });

    describe('3. Spesa DC generica (_dcSpend)', () => {
        test('_dcSpend offline_limit incrementa il limite offline di 2 ore fino al cap di 12h', () => {
            gs.driverCoins = 100;
            gs.offlineLimit = 2;

            sandbox._dcSpend('offline_limit', 20);
            assert.equal(gs.offlineLimit, 4);
            assert.equal(gs.driverCoins, 80);
            assert.equal(rpcSpendCalls.length, 1);

            // Raggiungimento del limite massimo
            gs.offlineLimit = 12;
            sandbox._dcSpend('offline_limit', 20);
            assert.equal(gs.offlineLimit, 12);
            assert.equal(gs.driverCoins, 80, 'non deve spendere DC se già al massimo');
            assert.equal(rpcSpendCalls.length, 1);
        });

        test('_dcSpend auto_rest attiva il flag autoRestEnabled nello stato', () => {
            gs.driverCoins = 50;
            gs.autoRestEnabled = false;

            sandbox._dcSpend('auto_rest', 30);
            assert.equal(gs.autoRestEnabled, true);
            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls.length, 1);

            // Tentativo duplicato
            sandbox._dcSpend('auto_rest', 30);
            assert.equal(gs.driverCoins, 20, 'non deve spendere DC se già attivo');
            assert.equal(rpcSpendCalls.length, 1);
        });

        test('_dcSpend energy_full ripristina l energia del CEO a 100', () => {
            gs.driverCoins = 10;
            gs.energy = 25;

            sandbox._dcSpend('energy_full', 4);
            assert.equal(gs.energy, 100);
            assert.equal(gs.driverCoins, 6);
        });

        test('_dcSpend repair_all ripristina condizione, carburante e pressione pneumatici di tutta la flotta', () => {
            gs.driverCoins = 30;
            gs.fleet = [
                { id: 'c1', condition: 40, fuel: 10, tirePressure: 50 },
                { id: 'c2', condition: 85, fuel: 60, tirePressure: 70 },
            ];

            sandbox._dcSpend('repair_all', 20);
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].tirePressure, 100);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].tirePressure, 100);
            assert.equal(gs.driverCoins, 10);
        });

        test('_dcSpend unlock_ride invoca generatePOIRide con tier ultra', () => {
            gs.driverCoins = 20;
            let tierRichiesto = null;
            sandbox.generatePOIRide = (tier) => {
                tierRichiesto = tier;
                return { id: 'ride_ultra_1' };
            };

            sandbox._dcSpend('unlock_ride', 10);
            assert.equal(tierRichiesto, 'ultra');
            assert.equal(gs.driverCoins, 10);
        });

        test('_dcSpend con item sconosciuto o DC insufficienti fallisce senza mutare lo stato', () => {
            gs.driverCoins = 5;
            gs.autoRestEnabled = false;
            sandbox._dcSpend('item_inesistente', 5);
            assert.equal(gs.driverCoins, 5);
            assert.equal(rpcSpendCalls.length, 0);

            sandbox._dcSpend('auto_rest', 30);
            assert.equal(gs.driverCoins, 5);
            assert.equal(gs.autoRestEnabled, false);
            assert.equal(rpcSpendCalls.length, 0);
        });
    });

    describe('4. Servizi Esclusivi Executive Club (ui-store.js)', () => {
        test('_ecCaffeSospeso azzera lo stress e cancella burnout sul driver più affaticato', () => {
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 99 },
                { id: 'd1', name: 'Marco', stress_level: 40 },
                { id: 'd2', name: 'Laura', stress_level: 75, burnout_until: 8 },
            ];

            sandbox._ecCaffeSospeso();

            assert.equal(gs.driverCoins, 10);
            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.drivers[2].burnout_until, undefined);
            assert.equal(gs.drivers[1].stress_level, 40);
        });

        test('_ecCaffeSospeso non fa nulla se nessun driver dipendente è stressato', () => {
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 99 },
                { id: 'd1', name: 'Marco', stress_level: 0 },
            ];

            sandbox._ecCaffeSospeso();
            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls.length, 0);
        });

        test('_ecManutenzioneExpress ripara al 100% e rifornisce l auto più danneggiata', () => {
            gs.driverCoins = 50;
            gs.fleet = [
                { id: 'c1', name: 'Berlina A', condition: 90, fuel: 80 },
                { id: 'c2', name: 'Berlina B', condition: 25, fuel: 10 },
            ];

            sandbox._ecManutenzioneExpress();

            assert.equal(gs.driverCoins, 25);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[0].condition, 90);
        });

        test('_ecManutenzioneExpress rifiuta l operazione se la flotta è già integra', () => {
            gs.driverCoins = 50;
            gs.fleet = [{ id: 'c1', condition: 100, fuel: 100 }];

            sandbox._ecManutenzioneExpress();
            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls.length, 0);
        });

        test('_ecTangenteSindacato imposta la protezione scioperi per il giorno successivo', () => {
            gs.driverCoins = 100;
            gs.day = 4;
            gs.tangenteUntil = 0;

            sandbox._ecTangenteSindacato();

            assert.equal(gs.driverCoins, 50);
            assert.equal(gs.tangenteUntil, 5);

            // Rifiuto se già protetto
            sandbox._ecTangenteSindacato();
            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls.length, 1);
        });

        test('_ecPolizzaKasko attiva la copertura kasko temporanea per 7 giorni', () => {
            gs.driverCoins = 300;
            gs.day = 10;
            gs.investments = [];

            sandbox._ecPolizzaKasko();

            assert.equal(gs.driverCoins, 150);
            assert.equal(gs.tempKaskoExpiresDay, 17);
            assert.ok(gs.investments.includes('inv_kasko'));

            // Tentativo quando è già attiva temporaneamente
            sandbox._ecPolizzaKasko();
            assert.equal(gs.driverCoins, 150);
            assert.equal(rpcSpendCalls.length, 1);
        });

        test('_ecPolizzaKasko non spende se l investimento kasko è permanente', () => {
            gs.driverCoins = 300;
            gs.day = 10;
            gs.investments = ['inv_kasko'];
            gs.tempKaskoExpiresDay = 0;

            sandbox._ecPolizzaKasko();
            assert.equal(gs.driverCoins, 300);
            assert.equal(rpcSpendCalls.length, 0);
        });

        test('_ecRadarVip attiva il buff vip_queue per 72 ore', () => {
            gs.driverCoins = 300;
            gs.day = 1;
            gs.hour = 8;
            gs.activeBuffs = [];

            sandbox._ecRadarVip();

            assert.equal(gs.driverCoins, 100);
            assert.ok(gs.activeBuffs.some(b => b.type === 'vip_queue' && b.until === 1 * 24 + 8 + 72));

            // Tentativo quando il buff è già attivo
            sandbox._ecRadarVip();
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcSpendCalls.length, 1);
        });

        test('_ecTargaPresidenziale imposta hasPrestigiousPlate a true', () => {
            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = false;

            sandbox._ecTargaPresidenziale();

            assert.equal(gs.driverCoins, 100);
            assert.equal(gs.hasPrestigiousPlate, true);

            // Tentativo quando già posseduta
            sandbox._ecTargaPresidenziale();
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcSpendCalls.length, 1);
        });
    });

    describe('5. Boosters ed esecuzione engine-store.js', () => {
        test('activateExecutivePass attiva il pass per 30 giorni scalando 150 DC', () => {
            gs.driverCoins = 200;
            gs.day = 5;
            gs.executivePassActive = false;

            sandbox.activateExecutivePass();

            assert.equal(gs.driverCoins, 50);
            assert.equal(gs.executivePassActive, true);
            assert.equal(gs.executivePassExpiresDay, 35);
        });

        test('skipConstruction completa istantaneamente la costruzione specificata', () => {
            gs.driverCoins = 20;
            gs.constructions = [{ invId: 'deposito_roma' }, { invId: 'garage_milano' }];
            gs.investments = [];

            sandbox.skipConstruction('deposito_roma');

            assert.equal(gs.driverCoins, 12);
            assert.equal(gs.constructions.length, 1);
            assert.equal(gs.constructions[0].invId, 'garage_milano');
            assert.ok(gs.investments.includes('deposito_roma'));
        });

        test('skipConstruction fallisce senza spendere se la costruzione non esiste', () => {
            gs.driverCoins = 20;
            gs.constructions = [];

            sandbox.skipConstruction('deposito_inesistente');
            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls.length, 0);
        });

        test('fuelBoostDC rifornisce tutta la flotta al 100% per 3 DC', () => {
            gs.driverCoins = 10;
            gs.fleet = [
                { id: 'c1', fuel: 20 },
                { id: 'c2', fuel: 0 },
            ];

            sandbox.fuelBoostDC();

            assert.equal(gs.driverCoins, 7);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[1].fuel, 100);
        });

        test('wakeDriverDC sveglia un singolo autista e riduce la fatica', () => {
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'd1', name: 'Paolo', status: 'resting', restHoursLeft: 6, fatigue: 80 },
            ];

            sandbox.wakeDriverDC('d1');

            assert.equal(gs.driverCoins, 7);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].restHoursLeft, 0);
            assert.equal(gs.drivers[0].fatigue, 50);
        });

        test('wakeDriverDC non interviene se l autista non è a riposo', () => {
            gs.driverCoins = 10;
            gs.drivers = [{ id: 'd1', name: 'Paolo', status: 'idle', fatigue: 20 }];

            sandbox.wakeDriverDC('d1');
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcSpendCalls.length, 0);
        });

        test('energyBoostDC ricarica l energia del CEO a 100 per 4 DC', () => {
            gs.driverCoins = 10;
            gs.energy = 30;

            sandbox.energyBoostDC();

            assert.equal(gs.driverCoins, 6);
            assert.equal(gs.energy, 100);

            // Rifiuto se già al massimo
            sandbox.energyBoostDC();
            assert.equal(gs.driverCoins, 6);
        });

        test('instaHealDC cura un autista azzerando stress e cancellando burnout', () => {
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'd1', name: 'Elena', status: 'resting', restHoursLeft: 3, stress_level: 60, burnout_until: 5, fatigue: 70 },
            ];

            sandbox.instaHealDC('d1');

            assert.equal(gs.driverCoins, 8);
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].burnout_until, null);
            assert.equal(gs.drivers[0].fatigue, 20);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].restHoursLeft, 0);
        });

        test('wakeAllDriversDC calcola il costo proporzionale e sveglia tutti i driver a riposo', () => {
            gs.driverCoins = 50;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', status: 'resting' },
                { id: 'd1', name: 'A', status: 'resting', restHoursLeft: 4, fatigue: 60 },
                { id: 'd2', name: 'B', status: 'resting', restHoursLeft: 2, fatigue: 40 },
                { id: 'd3', name: 'C', status: 'idle', fatigue: 10 },
            ];

            sandbox.wakeAllDriversDC();

            // 2 autisti non-ceo a riposo: cost = max(3, 2*2) = 4 DC
            assert.equal(gs.driverCoins, 46);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].fatigue, 30);
            assert.equal(gs.drivers[2].status, 'idle');
            assert.equal(gs.drivers[2].fatigue, 10);
        });

        test('healAllDriversDC calcola il costo proporzionale e guarisce tutti i driver stressati', () => {
            gs.driverCoins = 50;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 50 },
                { id: 'd1', name: 'A', stress_level: 70, burnout_until: 4, fatigue: 80, status: 'resting', restHoursLeft: 2 },
                { id: 'd2', name: 'B', stress_level: 30, burnout_until: null, fatigue: 60, status: 'idle' },
            ];

            sandbox.healAllDriversDC();

            // 2 autisti non-ceo stressati: cost = max(4, 2*2) = 4 DC
            assert.equal(gs.driverCoins, 46);
            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[1].burnout_until, null);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[2].stress_level, 0);
        });

        test('skipAllAcademyDC completa tutti i corsi in accademia incrementando le skill', () => {
            gs.driverCoins = 50;
            gs.drivers = [
                { id: 'd1', name: 'A', driving: 40, status: 'training' },
                { id: 'd2', name: 'B', charisma: 60, status: 'training' },
            ];
            gs.driverAcademy = [
                { driverId: 'd1', skill: 'driving', skillGain: 15 },
                { driverId: 'd2', skill: 'charisma', skillGain: 20 },
            ];

            sandbox.skipAllAcademyDC();

            // 2 corsi: cost = 2 * 5 = 10 DC
            assert.equal(gs.driverCoins, 40);
            assert.equal(gs.drivers[0].driving, 55);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[1].charisma, 80);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.driverAcademy.length, 0);
        });

        test('skipAllConstructionsDC completa tutte le costruzioni in corso', () => {
            gs.driverCoins = 50;
            gs.investments = ['inv_base'];
            gs.constructions = [
                { invId: 'deposito_napoli' },
                { invId: 'officina_torino' },
            ];

            sandbox.skipAllConstructionsDC();

            // 2 costruzioni: cost = 2 * 8 = 16 DC
            assert.equal(gs.driverCoins, 34);
            assert.equal(gs.constructions.length, 0);
            assert.ok(gs.investments.includes('deposito_napoli'));
            assert.ok(gs.investments.includes('officina_torino'));
        });

        test('opsBundleDC ripristina carburante flotta, energia CEO e sveglia gli autisti per 9 DC', () => {
            gs.driverCoins = 20;
            gs.fleet = [{ id: 'c1', fuel: 20 }];
            gs.energy = 10;
            gs.drivers = [
                { id: 'ceo', status: 'resting' },
                { id: 'd1', status: 'resting', restHoursLeft: 4, fatigue: 50 },
            ];

            sandbox.opsBundleDC();

            assert.equal(gs.driverCoins, 11);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].fatigue, 20);
        });

        test('fullBundleDC applica il ripristino imperiale completo per 35 DC', () => {
            gs.driverCoins = 100;
            gs.fleet = [{ id: 'c1', fuel: 0 }];
            gs.energy = 0;
            gs.drivers = [
                { id: 'd1', status: 'resting', restHoursLeft: 5, stress_level: 80, fatigue: 90, driving: 40 },
            ];
            gs.driverAcademy = [{ driverId: 'd1', skill: 'driving', skillGain: 10 }];
            gs.constructions = [{ invId: 'hq_espansione' }];
            gs.investments = [];

            sandbox.fullBundleDC();

            assert.equal(gs.driverCoins, 65);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].driving, 50);
            assert.equal(gs.driverAcademy.length, 0);
            assert.equal(gs.constructions.length, 0);
            assert.ok(gs.investments.includes('hq_espansione'));
        });
    });

    describe('6. Protezione da fondi insufficienti e correttezza transazionale', () => {
        test('nessuna azione scala DC né applica effetti se il saldo DC è inferiore al costo', () => {
            gs.driverCoins = 2;
            gs.energy = 10;
            gs.fleet = [{ id: 'c1', fuel: 10 }];

            sandbox.energyBoostDC(); // Costa 4 DC
            assert.equal(gs.energy, 10);
            assert.equal(gs.driverCoins, 2);

            sandbox.fuelBoostDC(); // Costa 3 DC
            assert.equal(gs.fleet[0].fuel, 10);
            assert.equal(gs.driverCoins, 2);

            sandbox.opsBundleDC(); // Costa 9 DC
            assert.equal(gs.energy, 10);
            assert.equal(gs.fleet[0].fuel, 10);
            assert.equal(gs.driverCoins, 2);

            assert.equal(rpcSpendCalls.length, 0);
        });
    });
});
