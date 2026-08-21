'use strict';
/* ============================================================================
   test/funzioni/negozioDC.test.js — Negozio Driver Coins & Executive Club

   Verifica approfondita del funzionamento della funzione "negozioDC"
   (attualmente disattivata in config.js).
   Collauda tutte le azioni e funzioni esposte da ui-store.js ed engine-store.js,
   la corretta transazione dei Driver Coins (CE_money.spendDC / CE_money.earnDC),
   la persistenza e l'integrazione con lo stato di gioco e gli altri motori.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv, createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('funzione negozioDC — Driver Coins & Executive Club', () => {
    let env, sandbox, gs;
    let rpcSpendCalls, rpcAddCalls;

    beforeEach(() => {
        rpcSpendCalls = [];
        rpcAddCalls = [];
        env = freshEnv({
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
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('rendering e navigazione tab (_ecSwitchTab e renderTabPremiumStore)', () => {
        test('renderTabPremiumStore costruisce la scheda acquire con saldo e pacchetti', () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            rEnv.sandbox.initGame(true);
            rEnv.stopAllIntervals();

            const container = rEnv.sandbox.document.createElement('div');
            container.id = 'tab-container';
            rEnv.sandbox.document.body.appendChild(container);

            rEnv.sandbox.gameState.driverCoins = 75;
            rEnv.sandbox.renderTabPremiumStore();

            const html = container.innerHTML;
            assert.ok(html.includes('Executive Club'), 'manca titolo Executive Club');
            assert.ok(html.includes('75'), 'manca visualizzazione saldo DC');
            assert.ok(html.includes('data-ce-act="_dcSimPurchase"'), 'mancano bottoni acquisto DC');
            assert.ok(html.includes('Starter Pack'), 'manca pacchetto starter');
            assert.ok(html.includes('Corporate Pack'), 'manca pacchetto corporate');
            assert.ok(html.includes('Offshore Pack'), 'manca pacchetto offshore');
            assert.ok(html.includes('Il Fondo Sovrano'), 'manca pacchetto fondo sovrano');
        });

        test('_ecSwitchTab imposta la tab attiva e aggiorna la vista', () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            rEnv.sandbox.initGame(true);
            rEnv.stopAllIntervals();

            const container = rEnv.sandbox.document.createElement('div');
            container.id = 'tab-container';
            rEnv.sandbox.document.body.appendChild(container);

            rEnv.sandbox._ecSwitchTab('services');

            const html = container.innerHTML;
            assert.ok(html.includes('Operatività &amp; Flotta') || html.includes('Operatività & Flotta'), 'manca sezione flotta');
            assert.ok(html.includes('Pacchetto Operativo'), 'manca pacchetto operativo');
            assert.ok(html.includes('Polizza Kasko Corporate'), 'manca polizza kasko');
            assert.ok(html.includes('Executive Pass'), 'manca executive pass');
        });
    });

    describe('acquisizione Driver Coins (_dcSimPurchase)', () => {
        test('accredita la quantità di DC indicata e invoca la RPC addDriverCoins', () => {
            gs.driverCoins = 10;
            sandbox._dcSimPurchase(50);

            assert.equal(gs.driverCoins, 60);
            assert.equal(rpcAddCalls.length, 1);
            assert.equal(rpcAddCalls[0].n, 50);
            assert.equal(rpcAddCalls[0].motivo, 'sim_purchase');
            assert.ok(env.notifications.some(n => n.msg.includes('+50 Driver Coins')));
        });
    });

    describe('Executive Pass (activateExecutivePass)', () => {
        test('attiva il pass per 30 giorni scalando 150 DC', () => {
            gs.driverCoins = 200;
            gs.day = 5;
            gs.executivePassActive = false;
            gs.executivePassExpiresDay = 0;

            sandbox.activateExecutivePass();

            assert.equal(gs.executivePassActive, true);
            assert.equal(gs.executivePassExpiresDay, 35);
            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 150);
            assert.equal(rpcSpendCalls[0].motivo, 'executive_pass');
        });

        test('con DC insufficienti il pass non viene attivato', () => {
            gs.driverCoins = 100;
            gs.executivePassActive = false;

            sandbox.activateExecutivePass();

            assert.equal(gs.executivePassActive, false);
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcSpendCalls.length, 0);
        });

        test('il pass scade quando il giorno di gioco supera executivePassExpiresDay', () => {
            gs.executivePassActive = true;
            gs.executivePassExpiresDay = 10;
            gs.day = 11;

            sandbox.processDailyRoutines();

            assert.equal(gs.executivePassActive, false);
        });
    });

    describe('booster flotta e carburante (fuelBoostDC)', () => {
        test('rifornisce tutta la flotta al 100% scalando 3 DC', () => {
            gs.driverCoins = 10;
            gs.fleet = [
                { id: 'car1', fuel: 20 },
                { id: 'car2', fuel: 0 },
            ];

            sandbox.fuelBoostDC();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.driverCoins, 7);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 3);
            assert.equal(rpcSpendCalls[0].motivo, 'fuel_boost');
        });

        test('con DC insufficienti non rifornisce', () => {
            gs.driverCoins = 2;
            gs.fleet = [{ id: 'car1', fuel: 20 }];

            sandbox.fuelBoostDC();

            assert.equal(gs.fleet[0].fuel, 20);
            assert.equal(gs.driverCoins, 2);
            assert.equal(rpcSpendCalls.length, 0);
        });
    });

    describe('energia CEO (energyBoostDC)', () => {
        test('ripristina energia CEO al 100% scalando 4 DC', () => {
            gs.driverCoins = 10;
            gs.energy = 30;

            sandbox.energyBoostDC();

            assert.equal(gs.energy, 100);
            assert.equal(gs.driverCoins, 6);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 4);
            assert.equal(rpcSpendCalls[0].motivo, 'energy_boost');
        });

        test('se energia è già al 100% rifiuta senza spendere DC', () => {
            gs.driverCoins = 10;
            gs.energy = 100;

            sandbox.energyBoostDC();

            assert.equal(gs.energy, 100);
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Energia CEO già al massimo')));
        });
    });

    describe('gestione autisti e riposo (wakeDriverDC e wakeAllDriversDC)', () => {
        test('wakeDriverDC risveglia un singolo autista a riposo riducendo fatica', () => {
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 4, fatigue: 60 },
            ];

            sandbox.wakeDriverDC('d1');

            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].restHoursLeft, 0);
            assert.equal(gs.drivers[1].fatigue, 30);
            assert.equal(gs.driverCoins, 7);
            assert.equal(rpcSpendCalls[0].n, 3);
            assert.equal(rpcSpendCalls[0].motivo, 'wake_driver');
        });

        test('wakeDriverDC non fa nulla se l autista non è a riposo', () => {
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'd1', name: 'Marco', status: 'idle', restHoursLeft: 0, fatigue: 10 },
            ];

            sandbox.wakeDriverDC('d1');

            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('non è a riposo')));
        });

        test('wakeAllDriversDC risveglia tutti gli autisti calcolando il costo in base al numero', () => {
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 4, fatigue: 70 },
                { id: 'd2', name: 'Anna', status: 'resting', restHoursLeft: 3, fatigue: 50 },
            ];

            // 2 autisti: cost = Math.max(3, 2*2) = 4 DC
            sandbox.wakeAllDriversDC();

            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].fatigue, 40);
            assert.equal(gs.drivers[2].status, 'idle');
            assert.equal(gs.drivers[2].fatigue, 20);
            assert.equal(gs.driverCoins, 16);
            assert.equal(rpcSpendCalls[0].n, 4);
            assert.equal(rpcSpendCalls[0].motivo, 'wake_all_drivers');
        });

        test('wakeAllDriversDC rifiuta se nessun autista è a riposo', () => {
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'idle' },
            ];

            sandbox.wakeAllDriversDC();

            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessun autista a riposo')));
        });
    });

    describe('guarigione stress e burnout (instaHealDC, healAllDriversDC, _ecCaffeSospeso)', () => {
        test('instaHealDC azzera stress e burnout su singolo driver', () => {
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 5, stress_level: 80, burnout_until: 120, fatigue: 80 },
            ];

            sandbox.instaHealDC('d1');

            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].burnout_until, null);
            assert.equal(gs.drivers[0].fatigue, 30);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].restHoursLeft, 0);
            assert.equal(gs.driverCoins, 8);
            assert.equal(rpcSpendCalls[0].n, 2);
            assert.equal(rpcSpendCalls[0].motivo, 'insta_heal');
        });

        test('instaHealDC rifiuta se il driver è già in perfetta salute', () => {
            gs.driverCoins = 10;
            gs.drivers = [
                { id: 'd1', name: 'Marco', status: 'idle', restHoursLeft: 0, stress_level: 0, burnout_until: null, fatigue: 0 },
            ];

            sandbox.instaHealDC('d1');

            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('già in forma')));
        });

        test('healAllDriversDC guarisce tutti gli autisti stressati o in burnout', () => {
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 3, stress_level: 50, burnout_until: null, fatigue: 60 },
                { id: 'd2', name: 'Anna', status: 'idle', stress_level: 0, burnout_until: 100, fatigue: 70 },
            ];

            // 2 autisti: cost = Math.max(4, 2*2) = 4 DC
            sandbox.healAllDriversDC();

            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[2].burnout_until, null);
            assert.equal(gs.driverCoins, 16);
            assert.equal(rpcSpendCalls[0].n, 4);
            assert.equal(rpcSpendCalls[0].motivo, 'heal_all_drivers');
        });

        test('healAllDriversDC rifiuta se tutto lo staff è già in forma', () => {
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'idle', stress_level: 0, burnout_until: null },
            ];

            sandbox.healAllDriversDC();

            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Staff già in forma')));
        });

        test('_ecCaffeSospeso azzera lo stress del pilota più esausto spendendo 10 DC', () => {
            gs.driverCoins = 30;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 90 },
                { id: 'd1', name: 'Marco', stress_level: 40 },
                { id: 'd2', name: 'Anna', stress_level: 85, burnout_until: 120 },
            ];

            sandbox._ecCaffeSospeso();

            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.drivers[2].burnout_until, undefined);
            assert.equal(gs.drivers[1].stress_level, 40); // non toccato
            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls[0].n, 10);
            assert.equal(rpcSpendCalls[0].motivo, 'caffe_sospeso');
        });

        test('_ecCaffeSospeso rifiuta se nessun autista è esausto', () => {
            gs.driverCoins = 30;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 90 },
                { id: 'd1', name: 'Marco', stress_level: 0 },
            ];

            sandbox._ecCaffeSospeso();

            assert.equal(gs.driverCoins, 30);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessun autista esausto')));
        });
    });

    describe('accelerazione accademia e costruzioni (skipConstruction, skipAllAcademyDC, skipAllConstructionsDC)', () => {
        test('skipConstruction completa istantaneamente un investimento in cantiere', () => {
            gs.driverCoins = 20;
            gs.constructions = [{ invId: 'inv_vip_lounge', daysLeft: 3 }];
            gs.investments = [];

            sandbox.skipConstruction('inv_vip_lounge');

            assert.deepEqual([...gs.constructions], []);
            assert.deepEqual([...gs.investments], ['inv_vip_lounge']);
            assert.equal(gs.driverCoins, 12);
            assert.equal(rpcSpendCalls[0].n, 8);
            assert.equal(rpcSpendCalls[0].motivo, 'skip_construction');
        });

        test('skipConstruction rifiuta se la costruzione non è presente', () => {
            gs.driverCoins = 20;
            gs.constructions = [];

            sandbox.skipConstruction('inv_inesistente');

            assert.equal(gs.driverCoins, 20);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Costruzione non trovata')));
        });

        test('skipAllConstructionsDC completa tutti i cantieri aperti', () => {
            gs.driverCoins = 30;
            gs.constructions = [
                { invId: 'inv_kasko', daysLeft: 2 },
                { invId: 'inv_vip_lounge', daysLeft: 4 },
            ];
            gs.investments = [];

            // 2 costruzioni = 2 * 8 = 16 DC
            sandbox.skipAllConstructionsDC();

            assert.deepEqual([...gs.constructions], []);
            assert.deepEqual([...gs.investments], ['inv_kasko', 'inv_vip_lounge']);
            assert.equal(gs.driverCoins, 14);
            assert.equal(rpcSpendCalls[0].n, 16);
            assert.equal(rpcSpendCalls[0].motivo, 'skip_all_constructions');
        });

        test('skipAllConstructionsDC rifiuta se non ci sono cantieri attivi', () => {
            gs.driverCoins = 30;
            gs.constructions = [];

            sandbox.skipAllConstructionsDC();

            assert.equal(gs.driverCoins, 30);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessuna costruzione')));
        });

        test('skipAllAcademyDC completa i corsi attivi aumentando le skill', () => {
            gs.driverCoins = 30;
            gs.drivers = [
                { id: 'd1', name: 'Marco', skill_speed: 50, status: 'training' },
            ];
            gs.driverAcademy = [
                { driverId: 'd1', skill: 'skill_speed', skillGain: 15 },
            ];

            // 1 corso = 5 DC
            sandbox.skipAllAcademyDC();

            assert.deepEqual([...gs.driverAcademy], []);
            assert.equal(gs.drivers[0].skill_speed, 65);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.driverCoins, 25);
            assert.equal(rpcSpendCalls[0].n, 5);
            assert.equal(rpcSpendCalls[0].motivo, 'skip_all_academy');
        });

        test('skipAllAcademyDC rifiuta se non ci sono corsi in svolgimento', () => {
            gs.driverCoins = 30;
            gs.driverAcademy = [];

            sandbox.skipAllAcademyDC();

            assert.equal(gs.driverCoins, 30);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessun corso attivo')));
        });
    });

    describe('bundle operativi e imperiali (opsBundleDC e fullBundleDC)', () => {
        test('opsBundleDC ricarica flotta, energia CEO e risveglia gli autisti per 9 DC', () => {
            gs.driverCoins = 20;
            gs.fleet = [{ id: 'car1', fuel: 10 }];
            gs.energy = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 3, fatigue: 40 },
            ];

            sandbox.opsBundleDC();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].fatigue, 10);
            assert.equal(gs.driverCoins, 11);
            assert.equal(rpcSpendCalls[0].n, 9);
            assert.equal(rpcSpendCalls[0].motivo, 'ops_bundle');
        });

        test('fullBundleDC ripristina tutto l impero per 35 DC', () => {
            gs.driverCoins = 50;
            gs.fleet = [{ id: 'car1', fuel: 0 }];
            gs.energy = 0;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', status: 'resting', restHoursLeft: 4, stress_level: 80, burnout_until: 100, fatigue: 90, skill_speed: 50 },
            ];
            gs.driverAcademy = [{ driverId: 'd1', skill: 'skill_speed', skillGain: 10 }];
            gs.constructions = [{ invId: 'inv_vip_lounge', daysLeft: 5 }];
            gs.investments = [];

            sandbox.fullBundleDC();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[1].burnout_until, null);
            assert.equal(gs.drivers[1].fatigue, 30);
            assert.equal(gs.drivers[1].skill_speed, 60);
            assert.deepEqual([...gs.driverAcademy], []);
            assert.deepEqual([...gs.constructions], []);
            assert.deepEqual([...gs.investments], ['inv_vip_lounge']);
            assert.equal(gs.driverCoins, 15);
            assert.equal(rpcSpendCalls[0].n, 35);
            assert.equal(rpcSpendCalls[0].motivo, 'full_bundle');
        });
    });

    describe('servizi esclusivi UI (_dcSpend, _ecManutenzioneExpress, _ecTangenteSindacato, _ecPolizzaKasko, _ecRadarVip, _ecTargaPresidenziale)', () => {
        test('_dcSpend con offline_limit aumenta il tetto fino a max 12h', () => {
            gs.driverCoins = 50;
            gs.offlineLimit = 2;

            sandbox._dcSpend('offline_limit', 20);
            assert.equal(gs.offlineLimit, 4);
            assert.equal(gs.driverCoins, 30);
            assert.equal(rpcSpendCalls[0].motivo, 'offline_limit');

            // Raggiungimento massimo
            gs.offlineLimit = 12;
            sandbox._dcSpend('offline_limit', 20);
            assert.equal(gs.offlineLimit, 12);
            assert.equal(gs.driverCoins, 30); // non speso
        });

        test('_dcSpend con auto_rest abilita il recupero offline del CEO', () => {
            gs.driverCoins = 40;
            gs.autoRestEnabled = false;

            sandbox._dcSpend('auto_rest', 30);
            assert.equal(gs.autoRestEnabled, true);
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcSpendCalls[0].motivo, 'auto_rest');

            // Già attivo
            sandbox._dcSpend('auto_rest', 30);
            assert.equal(gs.driverCoins, 10);
        });

        test('_dcSpend con repair_all ripristina la flotta', () => {
            gs.driverCoins = 50;
            gs.fleet = [{ id: 'car1', condition: 40, fuel: 10, tirePressure: 20 }];

            sandbox._dcSpend('repair_all', 25);
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].tirePressure, 100);
            assert.equal(gs.driverCoins, 25);
        });

        test('_dcSpend con energy_full ricarica energia CEO', () => {
            gs.driverCoins = 20;
            gs.energy = 20;

            sandbox._dcSpend('energy_full', 4);
            assert.equal(gs.energy, 100);
            assert.equal(gs.driverCoins, 16);
        });

        test('_dcSpend con unlock_ride genera una corsa speciale', () => {
            gs.driverCoins = 20;
            const prima = (gs.pendingRides || []).length;

            sandbox._dcSpend('unlock_ride', 5);
            assert.equal(gs.driverCoins, 15);
            assert.ok((gs.pendingRides || []).length >= prima);
        });

        test('_dcSpend rifiuta itemId non riconosciuto', () => {
            gs.driverCoins = 50;
            sandbox._dcSpend('non_valido', 10);
            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Operazione non riconosciuta')));
        });

        test('_ecManutenzioneExpress ripara il veicolo più danneggiato per 25 DC', () => {
            gs.driverCoins = 50;
            gs.fleet = [
                { id: 'c1', name: 'Auto 1', condition: 80, fuel: 50 },
                { id: 'c2', name: 'Auto 2', condition: 30, fuel: 20 },
            ];

            sandbox._ecManutenzioneExpress();

            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[0].condition, 80); // non toccata
            assert.equal(gs.driverCoins, 25);
            assert.equal(rpcSpendCalls[0].motivo, 'manutenzione_express');
        });

        test('_ecManutenzioneExpress rifiuta se la flotta è già in perfette condizioni', () => {
            gs.driverCoins = 50;
            gs.fleet = [{ id: 'c1', condition: 100, fuel: 100 }];

            sandbox._ecManutenzioneExpress();

            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('perfette condizioni')));
        });

        test('_ecTangenteSindacato imposta tangenteUntil al giorno successivo per 50 DC', () => {
            gs.driverCoins = 60;
            gs.day = 4;
            gs.tangenteUntil = 0;

            sandbox._ecTangenteSindacato();

            assert.equal(gs.tangenteUntil, 5);
            assert.equal(gs.driverCoins, 10);
            assert.equal(rpcSpendCalls[0].n, 50);
            assert.equal(rpcSpendCalls[0].motivo, 'tangente_sindacato');

            // Protezione già attiva
            sandbox._ecTangenteSindacato();
            assert.equal(gs.driverCoins, 10); // non rispende
            assert.ok(env.notifications.some(n => n.msg.includes('Già protetto')));
        });

        test('_ecPolizzaKasko attiva la polizza temporanea per 7 giorni per 150 DC e scade in checkActiveTrips', () => {
            gs.driverCoins = 200;
            gs.day = 2;
            gs.investments = [];
            gs.tempKaskoExpiresDay = 0;

            sandbox._ecPolizzaKasko();

            assert.ok(gs.investments.includes('inv_kasko'));
            assert.equal(gs.tempKaskoExpiresDay, 9);
            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls[0].n, 150);

            // Se già attiva non permette doppio acquisto
            sandbox._ecPolizzaKasko();
            assert.equal(gs.driverCoins, 50);

            // Al superamento della data di scadenza checkActiveTrips rimuove inv_kasko
            gs.day = 10;
            sandbox.checkActiveTrips();
            assert.ok(!gs.investments.includes('inv_kasko'));
            assert.equal(gs.tempKaskoExpiresDay, 0);
        });

        test('_ecPolizzaKasko rifiuta se il giocatore possiede già la polizza permanente', () => {
            gs.driverCoins = 200;
            gs.investments = ['inv_kasko'];
            gs.tempKaskoExpiresDay = 0;

            sandbox._ecPolizzaKasko();

            assert.equal(gs.driverCoins, 200);
            assert.equal(rpcSpendCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('permanente già attiva')));
        });

        test('_ecRadarVip attiva il buff vip_queue per 72 ore per 200 DC', () => {
            gs.driverCoins = 250;
            gs.day = 1;
            gs.hour = 10;
            gs.activeBuffs = [];

            sandbox._ecRadarVip();

            assert.equal(gs.driverCoins, 50);
            assert.equal(rpcSpendCalls[0].n, 200);
            assert.equal(rpcSpendCalls[0].motivo, 'radar_vip');
            const buff = (gs.activeBuffs || []).find(b => b.type === 'vip_queue');
            assert.ok(buff, 'buff vip_queue deve essere presente');
            assert.equal(buff.until, 1 * 24 + 10 + 72);

            // Se attivo rifiuta la richiesta
            sandbox._ecRadarVip();
            assert.equal(gs.driverCoins, 50);
        });

        test('_ecTargaPresidenziale imposta hasPrestigiousPlate a true per 500 DC', () => {
            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = false;

            sandbox._ecTargaPresidenziale();

            assert.equal(gs.hasPrestigiousPlate, true);
            assert.equal(gs.driverCoins, 100);
            assert.equal(rpcSpendCalls[0].n, 500);
            assert.equal(rpcSpendCalls[0].motivo, 'targa_presidenziale');

            // Se già posseduta rifiuta
            sandbox._ecTargaPresidenziale();
            assert.equal(gs.driverCoins, 100);
            assert.ok(env.notifications.some(n => n.msg.includes('già posseduta')));
        });
    });
});
