'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Verifica approfondita della Gestione Flotta

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js`, `ui-fleet.js` e dai relativi gestori di flotta
   in `engine.js` e `ce-actions.js`, verificare l'integrazione con ServerState/CE_money,
   il calcolo esatto dei prezzi e dei costi (prezzo mostrato === prezzo addebitato),
   il rifiuto dei casi limite (motore fuso, leasing, auto limitate, autista occupato)
   e la prevenzione del doppio conteggio.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente sandbox pulito per il collaudo della flotta.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const serverCalls = {
        buyVehicle: [],
        sellVehicle: [],
        repairVehicle: [],
        refuelVehicle: [],
        refillCarTires: [],
        syncCash: [],
        spendDriverCoins: [],
    };
    const bigEvents = [];

    const env = freshEnv({
        render: true,
        serverState: {
            buyVehicle: async (modelId, price) => {
                serverCalls.buyVehicle.push({ modelId, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) - price;
                return { id: 'srv_veh_' + modelId + '_' + Date.now() };
            },
            sellVehicle: async (serverId, price) => {
                serverCalls.sellVehicle.push({ serverId, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            repairVehicle: async (serverId, cost) => {
                serverCalls.repairVehicle.push({ serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refuelVehicle: async (serverId, amount, cost) => {
                serverCalls.refuelVehicle.push({ serverId, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (serverId, cost) => {
                serverCalls.refillCarTires.push({ serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            syncCash: async (cash) => {
                serverCalls.syncCash.push(cash);
                env.sandbox.gameState.cash = cash;
                return { success: true, cash };
            },
            spendDriverCoins: async (reason, amount) => {
                serverCalls.spendDriverCoins.push({ reason, amount });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const { sandbox } = env;
    const gs = sandbox.gameState;

    sandbox.showBigEvent = (icon, title, body) => {
        bigEvents.push({ icon, title, body });
    };

    // Predisposizione parametri iniziali
    gs.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    gs.driverCoins = opzioni.driverCoins !== undefined ? opzioni.driverCoins : 50;
    gs.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    gs.fuelPrice = opzioni.fuelPrice !== undefined ? opzioni.fuelPrice : 1.85;
    gs.day = opzioni.day !== undefined ? opzioni.day : 1;
    gs.unlockedRegions = ['lazio', 'lombardia'];

    // Inizializza filtro flotta
    sandbox._fleetFilter = { brand: null, tier: null };
    sandbox.window._fleetFilter = sandbox._fleetFilter;

    // Predisponi DOM
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox,
        gs,
        serverCalls,
        bigEvents,
    };
}

describe('Funzione Flotta — Collaudo Completo', () => {

    describe('1. Inizializzazione, rendering della scheda Flotta e filtri (renderTabFleet, _fleetFilter, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta();
            amb.gs.fleet = [
                { id: 'f_std', name: 'Stellar E-Executive', tier: 'business', condition: 85, fuel: 80, tirePressure: 90, engineHealth: 100, outOfService: null, vehicleClass: 'stellar_e_exec' },
                { id: 'f_volt', name: 'Volt 3-Urban', tier: 'business', condition: 95, chargeLevel: 60, tirePressure: 100, engineHealth: 100, outOfService: null, vehicleClass: 'volt_3_urban' },
                { id: 'f_damaged', name: 'Stellar E-Executive', tier: 'business', condition: 35, fuel: 40, tirePressure: 50, engineHealth: 60, outOfService: 'condition', vehicleClass: 'stellar_e_exec' },
            ];
            amb.gs.investments = ['inv_fuel_depot'];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet calcola e visualizza correttamente i KPI di flotta e condizione media', () => {
            const { sandbox } = amb;
            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            const html = c.innerHTML;

            assert.ok(html.includes('Gestione Flotta'), 'deve contenere l intestazione della flotta');
            assert.ok(html.includes('3 veicoli'), 'deve riportare il totale veicoli');
            assert.ok(html.includes('1 fuori servizio'), 'deve mostrare 1 veicolo fuori servizio');
            // Condizione media: (85 + 95 + 35) / 3 = 71.66 -> 72%
            assert.ok(html.includes('72%'), 'deve calcolare la condizione media corretta');
        });

        test('filtro flotta per produttore (brand) isola i modelli corrispondenti', () => {
            const { sandbox } = amb;
            sandbox.renderTabFleet();

            // Imposta filtro per brand Volt
            sandbox.ceSetRender('_fleetFilter', 'brand', 'Volt', 'renderTabFleet');

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Volt 3-Urban'), 'deve includere Volt 3-Urban');
            assert.ok(!c.innerHTML.includes('Stellar E-Executive'), 'non deve includere Stellar');
        });

        test('filtro flotta per categoria (tier) e messaggio stato vuoto con filtri incompatibili', () => {
            const { sandbox } = amb;
            sandbox.renderTabFleet();

            // Filtro tier ultra (nessun veicolo ultra presente)
            sandbox.ceSetRender('_fleetFilter', 'tier', 'ultra', 'renderTabFleet');

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessun veicolo corrisponde ai filtri selezionati'), 'deve mostrare messaggio di filtro vuoto');
        });

        test('raggruppamento modelli mostra header di gruppo e pulsante bulkRepairFleet se danneggiati', () => {
            const { sandbox } = amb;
            // Aggiungi un terzo Stellar E-Executive per attivare _showModelHeaders (length >= 3)
            amb.gs.fleet.push({ id: 'f_std3', name: 'Stellar E-Executive', tier: 'business', condition: 70, fuel: 90, tirePressure: 90, engineHealth: 100, outOfService: null, vehicleClass: 'stellar_e_exec' });

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Stellar E-Executive'), 'deve mostrare header gruppo Stellar');
            assert.ok(c.innerHTML.includes('bulkRepairFleet'), 'deve mostrare pulsante Ripara gruppo');
        });

        test('sezione Deposito Aziendale viene renderizzata solo se inv_fuel_depot è posseduto', () => {
            const { sandbox, gs } = amb;
            sandbox.renderTabFleet();
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('🛢️ Deposito Aziendale'), 'deve mostrare il deposito aziendale');

            // Rimuovi investimento
            gs.investments = [];
            sandbox.renderTabFleet();
            c = sandbox.document.getElementById('tab-container');
            assert.ok(!c.innerHTML.includes('🛢️ Deposito Aziendale'), 'non deve mostrare il deposito se non posseduto');
            assert.ok(c.innerHTML.includes('Gasolio Mercato'), 'deve mostrare il ticker di mercato');
        });

        test('sezione veicoli sequestrati compare se seizedCars contiene elementi', () => {
            const { sandbox, gs } = amb;
            gs.seizedCars = [{ carName: 'Auto Sequestrata 1', releaseDay: 5 }];
            gs.day = 2;

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('🚨 Veicoli Sequestrati'));
            assert.ok(c.innerHTML.includes('Auto Sequestrata 1'));
            assert.ok(c.innerHTML.includes('Rilascio fra 3g'));
        });
    });

    describe('2. Riparazione Carrozzeria e calcolo costi (repairCostFor, payToRepairCar, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 50000 });
            amb.gs.fleet = [
                { id: 'c_repair_1', _serverId: 'srv_c1', name: 'Stellar E-Executive', tier: 'business', condition: 70, engineHealth: 100, outOfService: 'condition' },
                { id: 'c_repair_2', _serverId: 'srv_c2', name: 'Stellar S-Imperial', tier: 'vip', condition: 98, engineHealth: 100, outOfService: null },
                { id: 'c_blown_engine', _serverId: 'srv_c3', name: 'Auto Fusa', tier: 'standard', condition: 40, engineHealth: 0, outOfService: 'engine' },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairCostFor calcola 85€ a punto danno con minimo di 500€', () => {
            const { sandbox } = amb;
            const car1 = amb.gs.fleet[0]; // 30 punti danno: 30 * 85 = 2550€
            assert.equal(sandbox.repairCostFor(car1), 2550);

            const car2 = amb.gs.fleet[1]; // 2 punti danno: 2 * 85 = 170€ -> scatta minimo 500€
            assert.equal(sandbox.repairCostFor(car2), 500);

            const carPerfetta = { condition: 100 };
            assert.equal(sandbox.repairCostFor(carPerfetta), 0);
        });

        test('sconti cumulativi di repairCostFor: contratto (-30%), capo officina (-50%), officina mobile (-20%)', () => {
            const { sandbox, gs } = amb;
            const car = { condition: 80 }; // 20 punti danno: 20 * 85 = 1700€ base

            // 1. Contratto manutenzione attivo (1700 * 0.70 = 1190€)
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = 10;
            gs.day = 2;
            assert.equal(sandbox.repairCostFor(car), 1190);

            // 2. Aggiunta Meccanico staff (1190 * 0.50 = 595€)
            gs.staff = [{ id: 'mech', name: 'Capo Meccanico' }];
            assert.equal(sandbox.repairCostFor(car), 595);

            // 3. Aggiunta Officina Mobile (595 * 0.80 = 476€)
            gs.investments = ['inv_mobile_workshop'];
            assert.equal(sandbox.repairCostFor(car), 476);
        });

        test('payToRepairCar addebita ESATTAMENTE il prezzo mostrato ed azzera outOfService', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = gs.fleet[0];
            const costoAtteso = sandbox.repairCostFor(car); // 2550€
            assert.equal(costoAtteso, 2550);

            await sandbox.payToRepairCar(car.id);

            assert.equal(serverCalls.repairVehicle.length, 1);
            assert.equal(serverCalls.repairVehicle[0].cost, 2550, 'il costo addebitato deve coincidere al centesimo col prezzo calcolato');
            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 47450); // 50000 - 2550
            assert.ok(env.logs.some(l => l.includes('riparata: 100%')));
        });

        test('payToRepairCar con Kasko attiva NON azzera la riparazione ordinaria (prezzo reale addebitato)', async () => {
            const { sandbox, gs, serverCalls } = amb;
            gs.investments = ['inv_kasko'];
            const car = gs.fleet[0];

            const costoAtteso = sandbox.repairCostFor(car);
            assert.ok(costoAtteso > 0, 'la riparazione ordinaria non deve essere 0 con la Kasko');

            await sandbox.payToRepairCar(car.id);

            assert.equal(serverCalls.repairVehicle[0].cost, costoAtteso, 'ServerState deve ricevere l addebito pieno');
            assert.equal(car.condition, 100);
        });

        test('payToRepairCar blocca la riparazione della carrozzeria se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const carFusa = gs.fleet.find(c => c.id === 'c_blown_engine');

            await sandbox.payToRepairCar(carFusa.id);

            assert.equal(serverCalls.repairVehicle.length, 0, 'non deve eseguire alcuna transazione');
            assert.equal(carFusa.condition, 40, 'la carrozzeria deve rimanere non riparata');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar con fondi insufficienti non ripara e non chiama ServerState', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            gs.cash = 100; // servono 2550€

            await sandbox.payToRepairCar('c_repair_1');

            assert.equal(serverCalls.repairVehicle.length, 0);
            assert.equal(gs.fleet[0].condition, 70);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('payToRepairCar su veicolo inesistente o già al 100% non effettua chiamate', async () => {
            const { sandbox, serverCalls } = amb;

            await sandbox.payToRepairCar('auto_fantasma');
            assert.equal(serverCalls.repairVehicle.length, 0);

            amb.gs.fleet[0].condition = 100;
            await sandbox.payToRepairCar('c_repair_1');
            assert.equal(serverCalls.repairVehicle.length, 0);
        });

        test('bulkRepairFleet ripara tutti i veicoli danneggiati indicati', async () => {
            const { sandbox, serverCalls } = amb;
            sandbox.bulkRepairFleet(['c_repair_1', 'c_repair_2']);
            await new Promise(r => setImmediate(r));

            assert.equal(serverCalls.repairVehicle.length, 2);
            assert.equal(amb.gs.fleet[0].condition, 100);
            assert.equal(amb.gs.fleet[1].condition, 100);
        });
    });

    describe('3. Riparazione Motore e Insta-Repair DC (repairEngine, instantRepairDC)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 50000, driverCoins: 10 });
            amb.gs.fleet = [
                { id: 'c_motor_1', _serverId: 'srv_m1', name: 'Stellar V-Carrier', engineHealth: 40, outOfService: 'engine', condition: 90 },
                { id: 'c_motor_ok', _serverId: 'srv_m2', name: 'Volt Urban', engineHealth: 100, outOfService: null, condition: 80 },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairEngine calcola il costo esatto, chiama ServerState.repairVehicle e ripristina salute motore', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = gs.fleet[0];
            // Danno: 100 - 40 = 60. Costo: Math.max(800, 60 * 180) = 10800€
            await sandbox.repairEngine(car.id);

            assert.equal(serverCalls.repairVehicle.length, 1);
            assert.equal(serverCalls.repairVehicle[0].cost, 10800);
            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 39200);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Motore di Stellar V-Carrier riparato')));
        });

        test('repairEngine con motore già al 100% o auto inesistente non esegue RPC', async () => {
            const { sandbox, serverCalls, env } = amb;
            await sandbox.repairEngine('c_motor_ok');

            assert.equal(serverCalls.repairVehicle.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già in perfette condizioni')));

            await sandbox.repairEngine('non_esiste');
            assert.equal(serverCalls.repairVehicle.length, 0);
        });

        test('instantRepairDC consuma Driver Coins (2 DC standard, 1 DC Executive Pass) e porta la carrozzeria al 100%', () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet[1]; // condition 80%

            // 1. Riparazione standard: 2 DC
            gs.executivePassActive = false;
            sandbox.instantRepairDC(car.id);

            assert.equal(serverCalls.spendDriverCoins.length, 1);
            assert.equal(serverCalls.spendDriverCoins[0].amount, 2);
            assert.equal(gs.driverCoins, 8);
            assert.equal(car.condition, 100);

            // 2. Riparazione con Executive Pass: 1 DC
            car.condition = 50;
            gs.executivePassActive = true;
            sandbox.instantRepairDC(car.id);

            assert.equal(serverCalls.spendDriverCoins.length, 2);
            assert.equal(serverCalls.spendDriverCoins[1].amount, 1);
            assert.equal(gs.driverCoins, 7);
            assert.equal(car.condition, 100);
        });

        test('instantRepairDC con Driver Coins insufficienti non ripara e non tocca DC', () => {
            const { sandbox, gs, serverCalls } = amb;
            gs.driverCoins = 0;
            const car = gs.fleet[1];
            car.condition = 70;

            sandbox.instantRepairDC(car.id);

            assert.equal(serverCalls.spendDriverCoins.length, 0);
            assert.equal(car.condition, 70);
            assert.equal(gs.driverCoins, 0);
        });
    });

    describe('4. Rifornimento e Ricarica EV (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 20000, fuelPrice: 2.00 });
            amb.gs.fleet = [
                { id: 'c_gas', _serverId: 'srv_gas', name: 'Stellar E-Executive', fuel: 40, engineHealth: 100, outOfService: 'fuel', vehicleClass: 'stellar_e_exec' },
                { id: 'c_ev', _serverId: 'srv_ev', name: 'Volt 3-Urban', chargeLevel: 20, engineHealth: 100, outOfService: 'fuel', vehicleClass: 'volt_3_urban' },
                { id: 'c_broken', _serverId: 'srv_brk', name: 'Auto Rotta', fuel: 10, engineHealth: 0, outOfService: 'engine', vehicleClass: 'stellar_e_exec' },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel rifornisce il serbatoio al 100%, addebita via ServerState e sblocca outOfService', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = gs.fleet[0];
            // Fuel missing: 60%. Litri: 60 * 0.5 = 30L. Costo: 30 * 2.00 = 60€
            await sandbox.buyStandardFuel(car.id);

            assert.equal(serverCalls.refuelVehicle.length, 1);
            assert.equal(serverCalls.refuelVehicle[0].cost, 60);
            assert.equal(serverCalls.refuelVehicle[0].amount, 30);
            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 19940);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Rifornimento standard')));
        });

        test('buyStandardFuel rifiuta se serbatoio già pieno o se motore è fuso', async () => {
            const { sandbox, serverCalls, env } = amb;
            // Serbatoio già pieno
            amb.gs.fleet[0].fuel = 100;
            await sandbox.buyStandardFuel('c_gas');
            assert.equal(serverCalls.refuelVehicle.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));

            // Motore fuso
            await sandbox.buyStandardFuel('c_broken');
            assert.equal(serverCalls.refuelVehicle.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('buyBlackMarketFuel applica sconto 40% sul carburante', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet[0];
            // Fuel missing: 60%. Litri: 30L. Prezzo black market: 2.00 * 0.60 = 1.20€/L. Costo: 30 * 1.20 = 36€
            await sandbox.buyBlackMarketFuel(car.id);

            assert.equal(serverCalls.refuelVehicle.length, 1);
            assert.equal(serverCalls.refuelVehicle[0].cost, 36);
            assert.equal(car.fuel, 100);
            assert.equal(gs.cash, 19964);
        });

        test('superchargeVehicle ricarica veicolo elettrico al 100% con tariffa fissa di 80€', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = gs.fleet[1]; // Volt 3-Urban (EV)

            await sandbox.superchargeVehicle(car.id);

            assert.equal(serverCalls.refuelVehicle.length, 1);
            assert.equal(serverCalls.refuelVehicle[0].cost, 80);
            assert.equal(car.chargeLevel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 19920);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Supercharger: batteria al 100%')));
        });

        test('superchargeVehicle rifiuta veicoli termici o batterie già cariche al 100%', async () => {
            const { sandbox, serverCalls, env } = amb;
            // Veicolo termico
            await sandbox.superchargeVehicle('c_gas');
            assert.equal(serverCalls.refuelVehicle.length, 0);

            // Batteria già carica
            amb.gs.fleet[1].chargeLevel = 100;
            await sandbox.superchargeVehicle('c_ev');
            assert.equal(serverCalls.refuelVehicle.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Batteria già al 100%')));
        });
    });

    describe('5. Pressione Gomme e Treni di Gomme per Deposito (refillTires, buyTiresForDepot)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 30000 });
            amb.gs.fleet = [
                { id: 'c_tires_low', _serverId: 'srv_t1', name: 'Auto Gomme Basse', tirePressure: 40 },
                { id: 'c_tires_ok', _serverId: 'srv_t2', name: 'Auto Gomme OK', tirePressure: 100 },
            ];
            amb.gs.investments = ['inv_fuel_depot'];
            amb.gs.depositoGomme = 0;
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('refillTires calcola costo gomme mancanti (0.8€ per punto) ed addebita via ServerState.refillCarTires', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet[0];
            // Mancanti: 60 punti. Costo: Math.ceil(60 * 0.8) = 48€
            await sandbox.refillTires(car.id);

            assert.equal(serverCalls.refillCarTires.length, 1);
            assert.equal(serverCalls.refillCarTires[0].cost, 48);
            assert.equal(car.tirePressure, 100);
            assert.equal(gs.cash, 29952);
        });

        test('refillTires rifiuta se la pressione è già a 100 o veicolo inesistente', async () => {
            const { sandbox, serverCalls, env } = amb;
            await sandbox.refillTires('c_tires_ok');

            assert.equal(serverCalls.refillCarTires.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Pressione gomme ottimale')));

            await sandbox.refillTires('non_esiste');
            assert.equal(serverCalls.refillCarTires.length, 0);
        });

        test('buyTiresForDepot applica i prezzi esatti mostrati nella UI (1 set = 800€, 5 set = 3500€, 10 set = 6000€)', async () => {
            const { sandbox, gs, serverCalls } = amb;

            // 1 set: 800€ (mostrato "€800")
            sandbox.buyTiresForDepot(1);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 1);
            assert.equal(gs.cash, 29200);

            // 5 set: 3500€ (mostrato "€3.500")
            sandbox.buyTiresForDepot(5);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 6);
            assert.equal(gs.cash, 25700); // 29200 - 3500

            // 10 set: 6000€ (mostrato "€6.000")
            sandbox.buyTiresForDepot(10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 16);
            assert.equal(gs.cash, 19700); // 25700 - 6000

            assert.equal(serverCalls.syncCash.length, 3);
            assert.deepEqual(serverCalls.syncCash, [29200, 25700, 19700]);
        });

        test('buyTiresForDepot rifiuta se inv_fuel_depot non è attivo o per fondi insufficienti', async () => {
            const { sandbox, gs, env } = amb;
            gs.investments = [];

            sandbox.buyTiresForDepot(1);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Attiva prima il Deposito')));

            gs.investments = ['inv_fuel_depot'];
            gs.cash = 100; // servono 800€
            sandbox.buyTiresForDepot(1);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 0);
        });
    });

    describe('6. Deposito Carburante Aziendale e Potenziamenti (buyFuelForDepot, upgradeFuelDepot, emergencyRefuel, getDepotLevelData)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 50000, fuelPrice: 2.00 });
            amb.gs.investments = ['inv_fuel_depot'];
            amb.gs.fuelTank = 2000;
            amb.gs.fuelTankCapacity = 10000;
            amb.gs.fuelTankLevel = 1;
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot riempie il deposito scalando cassa via CE_money.spend', async () => {
            const { sandbox, gs, serverCalls } = amb;
            // Compra 3000 litri a 2.00€/L = 6000€
            sandbox.buyFuelForDepot(3000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTank, 5000);
            assert.equal(gs.cash, 44000);
            assert.deepEqual(serverCalls.syncCash, [44000]);
        });

        test('buyFuelForDepot rispetta il tetto massimo di capacità del serbatoio', async () => {
            const { sandbox, gs } = amb;
            // Serbatoio a 2000, cap 10000 -> spazio disponibile 8000L
            // Richiesta 15000L -> acquista solo 8000L a 2.00€ = 16000€
            sandbox.buyFuelForDepot(15000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTank, 10000);
            assert.equal(gs.cash, 34000); // 50000 - 16000
        });

        test('upgradeFuelDepot avanza al livello successivo di deposito ed incrementa la capienza', async () => {
            const { sandbox, gs, serverCalls, bigEvents } = amb;
            // Lv. 1 -> Lv. 2: costo Math.round(5000 * 1^1.8) = 5000€, capienza 20.000L
            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 45000);
            assert.deepEqual(serverCalls.syncCash, [45000]);
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Deposito Potenziato!');
        });

        test('upgradeFuelDepot al livello massimo (Lv. 5) blocca ulteriori upgrade', async () => {
            const { sandbox, gs, env } = amb;
            gs.fuelTankLevel = 5;
            gs.fuelTankCapacity = 80000;

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 5);
            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già al livello massimo')));
        });

        test('emergencyRefuel rifornisce tutte le auto bloccate con outOfService="fuel" al triplo prezzo', async () => {
            const { sandbox, gs, serverCalls } = amb;
            gs.fleet = [
                { id: 'c1', fuel: 0, outOfService: 'fuel' },
                { id: 'c2', fuel: 0, outOfService: 'fuel' },
                { id: 'c3', fuel: 80, outOfService: null },
            ];
            // 2 auto * 80L * (2.00 * 3) = 960€
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
            assert.equal(gs.cash, 49040); // 50000 - 960
            assert.deepEqual(serverCalls.syncCash, [49040]);
        });

        test('emergencyRefuel senza auto bloccate non spende denaro', async () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'c1', fuel: 80, outOfService: null }];

            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessuna auto ferma')));
        });
    });

    describe('7. Upgrade Veicoli e Personalizzazione Skin (buyCARUpgrade, applyVehicleSkin)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 30000, driverCoins: 50 });
            amb.gs.fleet = [
                { id: 'car_upg_test', name: 'Auto Upgrade', upgrades: [], skin: null },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa l upgrade sulla vettura e scala il costo da CE_money', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const CAR_UPGRADES = vm.runInContext('CAR_UPGRADES', sandbox);
            const upg = CAR_UPGRADES.find(u => u.id === 'centralina'); // es. 3500€
            assert.ok(upg);

            sandbox.buyCARUpgrade('car_upg_test', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.fleet[0].upgrades.includes('centralina'));
            assert.equal(gs.cash, 30000 - upg.price);
            assert.deepEqual(serverCalls.syncCash, [30000 - upg.price]);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('installato su')));
        });

        test('buyCARUpgrade blocca acquisto di upgrade già installati o per fondi insufficienti', async () => {
            const { sandbox, gs, env } = amb;
            amb.gs.fleet[0].upgrades = ['centralina'];

            sandbox.buyCARUpgrade('car_upg_test', 'centralina');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 30000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));

            gs.cash = 0;
            sandbox.buyCARUpgrade('car_upg_test', 'vetri_oscurati');
            await new Promise(r => setImmediate(r));
            assert.ok(!gs.fleet[0].upgrades.includes('vetri_oscurati'));
        });

        test('applyVehicleSkin applica la skin spendendo Driver Coins', async () => {
            const { sandbox, gs, serverCalls } = amb;
            // Skin matte_black costa 10 DC
            sandbox.applyVehicleSkin('car_upg_test', 'matte_black');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].skin, 'matte_black');
            assert.equal(gs.driverCoins, 40);
            assert.equal(serverCalls.spendDriverCoins.length, 1);
            assert.equal(serverCalls.spendDriverCoins[0].amount, 10);
        });

        test('applyVehicleSkin con skin o auto non valide non spende DC', async () => {
            const { sandbox, gs, serverCalls } = amb;
            sandbox.applyVehicleSkin('car_upg_test', 'skin_inventata');
            sandbox.applyVehicleSkin('auto_inesistente', 'matte_black');
            await new Promise(r => setImmediate(r));

            assert.equal(serverCalls.spendDriverCoins.length, 0);
            assert.equal(gs.driverCoins, 50);
        });
    });

    describe('8. Rientro all Hub, Strategia Tariffaria e Grey Market (returnToHub, setPricingStrategy, acceptGreyMarket)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 40000 });
            amb.gs.fleet = [
                { id: 'car_milano', name: 'Auto Milano', currentPoiId: 'milano', upgrades: [] },
                { id: 'car_roma', name: 'Auto Roma', currentPoiId: 'roma', upgrades: [] },
            ];
            amb.gs.drivers = [
                { id: 'drv_1', name: 'Giuseppe', assignedCarId: 'car_milano', status: 'idle' },
                { id: 'drv_busy', name: 'Marco', assignedCarId: 'car_milano', status: 'busy' },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('returnToHub avvia il rientro all Hub, calcola carburante+pedaggi e mette l autista in resting', async () => {
            const { sandbox, gs, serverCalls } = amb;
            sandbox.returnToHub('car_milano');
            await new Promise(r => setImmediate(r));

            const drv = gs.drivers.find(d => d.id === 'drv_1');
            assert.equal(drv.status, 'resting');
            assert.ok(drv.restHoursLeft > 0);
            assert.equal(drv._returning, true);
            assert.ok(gs.cash < 40000);
            assert.equal(serverCalls.syncCash.length, 1);
            assert.equal(serverCalls.syncCash[0], gs.cash);
        });

        test('returnToHub con Telepass attivo azzera i costi dei pedaggi', async () => {
            const ambNoTelepass = creaAmbienteFlotta({ cash: 40000 });
            ambNoTelepass.gs.fleet = [{ id: 'c_m1', currentPoiId: 'milano', upgrades: [] }];
            ambNoTelepass.gs.drivers = [{ id: 'd1', assignedCarId: 'c_m1', status: 'idle' }];
            ambNoTelepass.sandbox.returnToHub('c_m1');
            await new Promise(r => setImmediate(r));
            const spesaSenzaTelepass = 40000 - ambNoTelepass.gs.cash;

            const ambTelepass = creaAmbienteFlotta({ cash: 40000 });
            ambTelepass.gs.fleet = [{ id: 'c_m2', currentPoiId: 'milano', upgrades: ['telepass_car'] }];
            ambTelepass.gs.drivers = [{ id: 'd2', assignedCarId: 'c_m2', status: 'idle' }];
            ambTelepass.sandbox.returnToHub('c_m2');
            await new Promise(r => setImmediate(r));
            const spesaConTelepass = 40000 - ambTelepass.gs.cash;

            assert.ok(spesaConTelepass < spesaSenzaTelepass, 'con Telepass la spesa di rientro deve essere inferiore');
            ambNoTelepass.env.stopAllIntervals();
            ambTelepass.env.stopAllIntervals();
        });

        test('returnToHub rifiuta se auto è già a Roma/Hub o autista non è idle', async () => {
            const { sandbox, gs, env } = amb;
            // Già all'hub
            sandbox.returnToHub('car_roma');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già all\'Hub')));

            // Autista occupato
            amb.gs.drivers[0].status = 'busy';
            sandbox.returnToHub('car_milano');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista non disponibile')));
        });

        test('setPricingStrategy imposta correttamente la strategia tariffaria', () => {
            const { sandbox, gs } = amb;
            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('strategia_invalida');
            assert.equal(gs.pricingStrategy, 'discount'); // non deve cambiare
        });

        test('acceptGreyMarket accetta corsa anonima dalla posta e la inserisce in pendingRides', () => {
            const { sandbox, gs, env } = amb;
            gs.emails = [{
                id: 'email_gm_1',
                type: 'grey_market',
                status: 'unread',
                greyRideData: { fromId: 'roma', toId: 'milano', price: 2500, isLong: true },
            }];

            sandbox.acceptGreyMarket('email_gm_1');

            const email = gs.emails.find(e => e.id === 'email_gm_1');
            assert.equal(email.status, 'resolved');
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].isGreyMarket, true);
            assert.equal(gs.pendingRides[0].price, 2500);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Missione discreta')));
        });
    });

    describe('9. Ciclo di Vita: Vendita, Leasing, Mercato NPC e Aste (sellCar, terminateLease, listCarForSale, buyNpcCar, buyPrototypeCar, bidOnAuction)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 50000, reputation: 4.5 });
            amb.gs.fleet = [
                { id: 'c_owned', _serverId: 'srv_sell', name: 'Stellar E-Executive', tier: 'business', condition: 100, isLease: false },
                { id: 'c_lease', name: 'Auto Leasing', tier: 'business', condition: 100, isLease: true, leaseDuration: 12, leaseElapsedDays: 30, leaseMonthlyRate: 1000 },
                { id: 'c_limited', name: 'Auto Rara', tier: 'ultra', condition: 100, isLimitedEdition: true, isLease: false },
            ];
            amb.gs.drivers = [
                { id: 'd_assigned', name: 'Autista', assignedCarId: 'c_owned', status: 'idle' },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('sellCar accredita il valore di vendita via ServerState.sellVehicle e libera l autista assegnato', async () => {
            const { sandbox, gs, serverCalls } = amb;
            // Tier business base 35000 * (100/100) * 0.7 = 24500€
            await sandbox.sellCar('c_owned');

            assert.equal(serverCalls.sellVehicle.length, 1);
            assert.equal(serverCalls.sellVehicle[0].price, 24500);
            assert.equal(gs.cash, 74500); // 50000 + 24500
            assert.ok(!gs.fleet.some(c => c.id === 'c_owned'));
            assert.equal(gs.drivers[0].assignedCarId, null, 'l autista deve essere disassegnato');
        });

        test('sellCar rifiuta veicoli in leasing o in edizione limitata', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            // Auto in leasing
            await sandbox.sellCar('c_lease');
            assert.equal(serverCalls.sellVehicle.length, 0);

            // Auto in edizione limitata
            await sandbox.sellCar('c_limited');
            assert.equal(serverCalls.sellVehicle.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));
        });

        test('terminateLease calcola penale (50% mesi rimanenti), richiede confirm ed elimina l auto', async () => {
            const { sandbox, gs, serverCalls, bigEvents } = amb;
            sandbox.confirm = () => true;
            // 11 mesi rimanenti * 1000€/mese * 0.5 = 5500€
            sandbox.terminateLease('c_lease');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 44500); // 50000 - 5500
            assert.deepEqual(serverCalls.syncCash, [44500]);
            assert.ok(!gs.fleet.some(c => c.id === 'c_lease'));
            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].title, 'Leasing Terminato');
        });

        test('terminateLease rifiutato da confirm=false non tocca cassa né flotta', async () => {
            const { sandbox, gs, serverCalls } = amb;
            sandbox.confirm = () => false;

            sandbox.terminateLease('c_lease');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(serverCalls.syncCash.length, 0);
            assert.ok(gs.fleet.some(c => c.id === 'c_lease'));
        });

        test('listCarForSale mette in vendita sul marketplace e libera l autista', () => {
            const { sandbox, gs } = amb;
            sandbox.listCarForSale('c_owned', 28000);

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'c_owned');
            assert.equal(gs.marketplace[0].askPrice, 28000);
            assert.equal(gs.drivers[0].assignedCarId, null);
        });

        test('listCarForSale blocca la vendita se l autista è occupato in servizio (status="busy")', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers[0].status = 'busy';

            sandbox.listCarForSale('c_owned', 28000);

            assert.equal((gs.marketplace || []).length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));
        });

        test('cancelListing rimuove l annuncio dal marketplace', () => {
            const { sandbox, gs } = amb;
            gs.marketplace = [{ id: 'm_123', carId: 'c_owned', askPrice: 28000 }];

            sandbox.cancelListing('m_123');

            assert.equal(gs.marketplace.length, 0);
        });

        test('buyNpcCar acquista veicolo dal mercato NPC spendendo via CE_money.spend', async () => {
            const { sandbox, gs, serverCalls } = amb;
            gs.npcMarket = [{
                id: 'npc_car_1',
                name: 'Stellar E-Executive Usata',
                tier: 'business',
                price: 18000,
                condition: 75,
                mileage: 45000,
            }];

            sandbox.buyNpcCar('npc_car_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 32000); // 50000 - 18000
            assert.deepEqual(serverCalls.syncCash, [32000]);
            assert.equal(gs.npcMarket.length, 0);
            assert.ok(gs.fleet.some(c => c.name === 'Stellar E-Executive Usata'));
        });

        test('buyPrototypeCar verifica reputazione, corse, EV Hub ed inserisce il prototipo in flotta', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const PROTOTYPE_CARS = vm.runInContext('PROTOTYPE_CARS', sandbox);
            const proto = PROTOTYPE_CARS[0];
            gs.cash = proto.price + 10000;
            gs.reputation = proto.reqRep + 1.0;
            gs.questStats = { totalRides: (proto.rideGate || 0) + 100 };
            gs.hasEVHub = true;

            sandbox.buyPrototypeCar(proto.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(serverCalls.syncCash, [10000]);
            assert.ok(gs.fleet.some(c => c.protoId === proto.id));
        });

        test('bidOnAuction rilancia offerta, rimborsa precedente ed aggiorna l asta', async () => {
            const { sandbox, gs, serverCalls } = amb;
            gs.activeAuction = {
                id: 'auc_1',
                name: 'Auto Rara Asta',
                currentBid: 30000,
                playerBid: 25000,
            };
            gs.cash = 40000;

            // Rilancio a 35.000€: rimborso 25.000 (cassa 65.000) -> spesa 35.000 (cassa 30.000)
            sandbox.bidOnAuction(35000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000);
            assert.deepEqual(serverCalls.syncCash, [65000, 30000]);
            assert.equal(gs.activeAuction.playerBid, 35000);
            assert.equal(gs.activeAuction.currentBid, 35000);
        });
    });

    describe('10. Conquista e Cessione Concessioni Hub (buyHub, sellHub)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 150000, reputation: 3.5 });
            amb.gs.ownedHubs = [];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub acquista la concessione e la registra in gameState.ownedHubs', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const POIS = vm.runInContext('POIS', sandbox);
            const hub = POIS['roma_fco'];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);

            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 150000 - cost);
            assert.deepEqual(serverCalls.syncCash, [150000 - cost]);
        });

        test('buyHub rifiuta se reputazione < 2.5★ o hub già posseduto', async () => {
            const { sandbox, gs, env } = amb;
            gs.reputation = 2.0;

            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.ownedHubs.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            gs.reputation = 3.5;
            gs.ownedHubs = ['roma_fco'];
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già controllato')));
        });

        test('sellHub cede l Hub al 60% del costo originale via CE_money.earn', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const POIS = vm.runInContext('POIS', sandbox);
            const hub = POIS['roma_fco'];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);
            const resale = Math.floor(cost * 0.6);

            gs.ownedHubs = ['roma_fco'];
            gs.cash = 10000;

            sandbox.sellHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.ok(!gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 10000 + resale);
            assert.deepEqual(serverCalls.syncCash, [10000 + resale]);
        });
    });

    describe('11. Assegnazione Autisti e Gestione Esclusiva (assignCarToDriver)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta();
            amb.gs.fleet = [
                { id: 'car_alpha', name: 'Auto Alfa' },
                { id: 'car_beta', name: 'Auto Beta' },
            ];
            amb.gs.drivers = [
                { id: 'drv_1', name: 'Mario', assignedCarId: 'car_alpha' },
                { id: 'drv_2', name: 'Luigi', assignedCarId: null },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('assegnare un veicolo a un nuovo autista libera automaticamente il precedente proprietario', () => {
            const { sandbox, gs } = amb;

            // Assegna car_alpha (attualmente di Mario) a Luigi
            vm.runInContext('assignCarToDriver("car_alpha", "drv_2")', sandbox);

            const mario = gs.drivers.find(d => d.id === 'drv_1');
            const luigi = gs.drivers.find(d => d.id === 'drv_2');

            assert.equal(mario.assignedCarId, null, 'Mario deve essere stato liberato dal veicolo');
            assert.equal(luigi.assignedCarId, 'car_alpha', 'Luigi deve ora possedere car_alpha');
        });
    });

    describe('12. Integrità Finanziaria e Guardrail Doppio Conteggio (CE_money vs ServerState RPC)', () => {
        test('le azioni basate su RPC server NON chiamano syncCash', async () => {
            const amb = creaAmbienteFlotta({ cash: 50000 });
            amb.gs.fleet = [
                { id: 'c1', _serverId: 'srv1', condition: 80, fuel: 50, tirePressure: 50, engineHealth: 80, isLease: false },
            ];

            // 1. payToRepairCar (RPC repairVehicle)
            await amb.sandbox.payToRepairCar('c1');
            // 2. buyStandardFuel (RPC refuelVehicle)
            await amb.sandbox.buyStandardFuel('c1');
            // 3. refillTires (RPC refillCarTires)
            await amb.sandbox.refillTires('c1');
            // 4. repairEngine (RPC repairVehicle)
            amb.gs.fleet[0].engineHealth = 70;
            await amb.sandbox.repairEngine('c1');
            // 5. sellCar (RPC sellVehicle)
            await amb.sandbox.sellCar('c1');

            // Nessuna di queste azioni deve aver invocato syncCash (i soldi li ha già scalati/accreditati l RPC)
            assert.deepEqual(amb.serverCalls.syncCash, [], 'Nessuna chiamata syncCash dalle azioni con RPC dedicata');
            amb.env.stopAllIntervals();
        });

        test('le azioni locali passano sempre da CE_money e chiamano syncCash una sola volta per transazione', async () => {
            const amb = creaAmbienteFlotta({ cash: 50000 });
            amb.gs.investments = ['inv_fuel_depot'];
            amb.gs.fuelTank = 0;
            amb.gs.fuelTankCapacity = 10000;

            // Contratto manutenzione: 10000€
            amb.sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));
            assert.equal(amb.serverCalls.syncCash.length, 1);
            assert.equal(amb.serverCalls.syncCash[0], 40000);

            // Carburante deposito: 1000L * 1.85 = 1850€
            amb.sandbox.buyFuelForDepot(1000);
            await new Promise(r => setImmediate(r));
            assert.equal(amb.serverCalls.syncCash.length, 2);
            assert.equal(amb.serverCalls.syncCash[1], 38150);

            amb.env.stopAllIntervals();
        });
    });
});
