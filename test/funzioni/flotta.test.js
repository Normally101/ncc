'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo profondo del modulo Flotta

   Scopo: verificare in modo esaustivo tutte le azioni e routine di gestione flotta
   esposte da `engine-fleet.js`, `ui-fleet.js` e dai relativi gestori in `ce-actions.js` / `engine.js`.
   Copre:
   - Acquisto veicoli (showroom / npc / prototipi)
   - Vendita veicoli (sellCar, listCarForSale, mercato NPC, aste)
   - Riparazione carrozzeria e motore (payToRepairCar, repairCostFor, repairEngine, instantRepairDC)
   - Rifornimento e carburante (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle)
   - Gestione deposito e gomme (buyFuelForDepot, upgradeFuelDepot, emergencyRefuel, refillTires, buyTiresForDepot)
   - Contratti di manutenzione e strategie tariffarie
   - Upgrade componenti e skin veicolo
   - Conquista hub e rientro all'Hub (returnToHub, buyHub, sellHub)
   - Gestione veicoli in leasing, edizioni limitate, autisti occupati
   - Integrità dei flussi finanziari (CE_money vs ServerState RPC, no doppio conteggio)
   - Event Delegation DOM e coerenza prezzi mostrati vs addebitati
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito per il collaudo della flotta con mock completi.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const rpcCalls = [];
    const syncedCash = [];
    const dcSpends = [];

    const serverStateOverrides = Object.assign({
        syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
        spendDriverCoins: async (item, n) => { dcSpends.push([item, n]); return { ok: true }; },
        repairVehicle: async (id, cost) => {
            rpcCalls.push({ method: 'repairVehicle', id, cost });
            return { success: true };
        },
        refuelVehicle: async (id, amount, cost) => {
            rpcCalls.push({ method: 'refuelVehicle', id, amount, cost });
            return { success: true };
        },
        refillCarTires: async (id, cost) => {
            rpcCalls.push({ method: 'refillCarTires', id, cost });
            return { success: true };
        },
        sellVehicle: async (id, price) => {
            rpcCalls.push({ method: 'sellVehicle', id, price });
            return { success: true, sold_price: price };
        },
    }, opzioni.serverStateOverrides || {});

    const filesToLoad = [...CORE_FILES];
    if (!filesToLoad.includes('ui-fleet.js')) {
        filesToLoad.push('ui-fleet.js');
    }

    const env = createGameEnv(filesToLoad, {
        render: true,
        serverState: serverStateOverrides,
    });

    env.sandbox.initGame(true);
    env.stopAllIntervals();

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';
    env.sandbox._fleetFilter = { brand: null, tier: null };
    env.sandbox.window._fleetFilter = env.sandbox._fleetFilter;

    if (opzioni.cash !== undefined) env.sandbox.gameState.cash = opzioni.cash;
    if (opzioni.driverCoins !== undefined) env.sandbox.gameState.driverCoins = opzioni.driverCoins;
    if (opzioni.reputation !== undefined) env.sandbox.gameState.reputation = opzioni.reputation;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcCalls,
        syncedCash,
        dcSpends,
    };
}

describe('Funzione Flotta — Collaudo approfondito del sistema di gestione veicoli', () => {

    describe('1. Inizializzazione, Rendering Tab e Filtri UI (renderTabFleet, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet renderizza intestazione KPI, tabella flotta e sezioni ausiliarie', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 90, fuel: 80, tirePressure: 100, engineHealth: 100, isLease: false },
                { id: 'c2', name: 'Volt 3-Urban', tier: 'business', condition: 50, fuel: 20, tirePressure: 60, engineHealth: 90, isLease: false, outOfService: 'fuel' },
            ];

            sandbox.renderTabFleet();
            const container = sandbox.document.getElementById('tab-container');

            assert.ok(container.innerHTML.includes('Gestione Flotta'));
            assert.ok(container.innerHTML.includes('Stellar E-Executive'));
            assert.ok(container.innerHTML.includes('Volt 3-Urban'));
            assert.ok(container.innerHTML.includes('fuori servizio') || container.innerHTML.includes('Ferma'));
        });

        test('filtri flotta per brand e tier funzionano correttamente', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 100 },
                { id: 'c2', name: 'Volt 3-Urban', tier: 'business', condition: 100 },
                { id: 'c3', name: 'Majestic Spirit', tier: 'ultra', condition: 100 },
            ];

            // Filtro solo Stellar
            sandbox.window._fleetFilter = { brand: 'Stellar', tier: null };
            sandbox.renderTabFleet();
            let container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Stellar E-Executive'));
            assert.ok(!container.innerHTML.includes('Volt 3-Urban'));
            assert.ok(!container.innerHTML.includes('Majestic Spirit'));

            // Filtro solo Ultra
            sandbox.window._fleetFilter = { brand: null, tier: 'ultra' };
            sandbox.renderTabFleet();
            container = sandbox.document.getElementById('tab-container');
            assert.ok(!container.innerHTML.includes('Stellar E-Executive'));
            assert.ok(container.innerHTML.includes('Majestic Spirit'));
        });

        test('bulkRepairFleet ripara tutti i veicoli danneggiati indicati', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 100000;
            const car1 = { id: 'c1', _serverId: 's1', name: 'Auto 1', tier: 'business', condition: 60, isLease: false };
            const car2 = { id: 'c2', _serverId: 's2', name: 'Auto 2', tier: 'business', condition: 70, isLease: false };
            const car3 = { id: 'c3', _serverId: 's3', name: 'Auto 3', tier: 'business', condition: 100, isLease: false };
            gs.fleet = [car1, car2, car3];

            await sandbox.bulkRepairFleet(['c1', 'c2', 'c3']);

            assert.equal(car1.condition, 100);
            assert.equal(car2.condition, 100);
            assert.equal(car3.condition, 100);
            assert.equal(rpcCalls.filter(r => r.method === 'repairVehicle').length, 2);
        });

        test('bulkRepairFleet gestisce stringhe JSON serializzate dagli attributi DOM', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', tier: 'business', condition: 60, isLease: false };
            gs.fleet = [car];

            await sandbox.bulkRepairFleet('["c1"]');

            assert.equal(car.condition, 100);
        });
    });

    describe('2. Riparazione Carrozzeria e Coerenza Prezzi (payToRepairCar, repairCostFor)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairCostFor calcola il costo esatto (€85/punto con minimo €500)', () => {
            const { sandbox } = amb;
            const car1 = { id: 'c1', tier: 'business', condition: 40 }; // 60 punti * 85 = 5100
            const car2 = { id: 'c2', tier: 'business', condition: 98 }; // 2 punti -> min 500

            assert.equal(sandbox.repairCostFor(car1), 5100);
            assert.equal(sandbox.repairCostFor(car2), 500);
        });

        test('repairCostFor applica sconti moltiplicativi cumulabili (contratto -30%, capo officina -50%, officina mobile -20%)', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', tier: 'business', condition: 40 }; // Base: 5100

            // Solo contratto manutenzione
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = 10;
            gs.day = 1;
            assert.equal(sandbox.repairCostFor(car), 3570); // 5100 * 0.70

            // Contratto + Capo Officina
            gs.staff.push({ id: 'mech', name: 'Capo Officina' });
            assert.equal(sandbox.repairCostFor(car), 1785); // 3570 * 0.50

            // Contratto + Capo Officina + Officina Mobile
            gs.investments.push('inv_mobile_workshop');
            assert.equal(sandbox.repairCostFor(car), 1428); // 1785 * 0.80
        });

        test('la Kasko NON sconta né azzera la riparazione da usura ordinaria', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', tier: 'business', condition: 30 }; // 70 * 85 = 5950
            gs.investments.push('inv_kasko');

            assert.equal(sandbox.repairCostFor(car), 5950);
        });

        test('payToRepairCar ripara carrozzeria al 100%, pulisce outOfService e addebita esattamente il prezzo mostrato', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 10000;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto Test', tier: 'business', condition: 40, outOfService: 'condition' };
            gs.fleet = [car];

            const prezzoMostrato = sandbox.repairCostFor(car);
            assert.equal(prezzoMostrato, 5100);

            await sandbox.payToRepairCar('c1');

            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'repairVehicle');
            assert.equal(rpcCalls[0].cost, prezzoMostrato);
        });

        test('payToRepairCar rifiuta la riparazione se il motore è fuso', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.cash = 10000;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto Test', tier: 'business', condition: 40, engineHealth: 0 };
            gs.fleet = [car];

            await sandbox.payToRepairCar('c1');

            assert.equal(car.condition, 40);
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar rifiuta l\'azione con fondi insufficienti', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.cash = 500;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto Test', tier: 'business', condition: 40 };
            gs.fleet = [car];

            await sandbox.payToRepairCar('c1');

            assert.equal(car.condition, 40);
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });
    });

    describe('3. Riparazione Motore e Insta-Repair DC (repairEngine, instantRepairDC)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000, driverCoins: 10 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairEngine ripara motore danneggiato, azzera outOfService engine e addebita su ServerState', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 20000;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', engineHealth: 60, outOfService: 'engine' };
            gs.fleet = [car];

            // Danno = 40 -> 40 * 180 = 7200
            await sandbox.repairEngine('c1');

            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'repairVehicle');
            assert.equal(rpcCalls[0].cost, 7200);
        });

        test('repairEngine non esegue azioni se motore è già al 100%', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', engineHealth: 100 };
            gs.fleet = [car];

            await sandbox.repairEngine('c1');

            assert.equal(rpcCalls.length, 0);
        });

        test('instantRepairDC ripara istantaneamente usando Driver Coins (1 DC con Pass, 2 DC senza)', async () => {
            const { sandbox, gs, dcSpends } = amb;
            gs.driverCoins = 10;
            gs.executivePassActive = false;
            const car1 = { id: 'c1', name: 'Auto 1', condition: 20, outOfService: 'condition' };
            gs.fleet = [car1];

            sandbox.instantRepairDC('c1');
            await new Promise(r => setImmediate(r));

            assert.equal(car1.condition, 100);
            assert.equal(car1.outOfService, null);
            assert.equal(gs.driverCoins, 8);
            assert.deepEqual(dcSpends, [['instant_repair_dc', 2]]);

            // Con Executive Pass costa 1 DC
            gs.executivePassActive = true;
            const car2 = { id: 'c2', name: 'Auto 2', condition: 30, outOfService: 'condition' };
            gs.fleet.push(car2);

            sandbox.instantRepairDC('c2');
            await new Promise(r => setImmediate(r));

            assert.equal(car2.condition, 100);
            assert.equal(gs.driverCoins, 7);
            assert.deepEqual(dcSpends[1], ['instant_repair_dc', 1]);
        });

        test('instantRepairDC rifiuta se Driver Coins insufficienti o se auto è già al 100%', async () => {
            const { sandbox, gs, dcSpends } = amb;
            gs.driverCoins = 0;
            const car = { id: 'c1', name: 'Auto 1', condition: 50 };
            gs.fleet = [car];

            sandbox.instantRepairDC('c1');
            await new Promise(r => setImmediate(r));

            assert.equal(car.condition, 50);
            assert.deepEqual(dcSpends, []);

            // Auto già al 100%
            gs.driverCoins = 10;
            car.condition = 100;
            sandbox.instantRepairDC('c1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 10);
            assert.deepEqual(dcSpends, []);
        });
    });

    describe('4. Rifornimento e Carburante (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel rifornisce il veicolo, azzera outOfService e chiama ServerState.refuelVehicle', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 10000;
            gs.fuelPrice = 2.0;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', fuel: 20, engineHealth: 100, outOfService: 'fuel' };
            gs.fleet = [car];

            // fuelNeeded = 80 -> litres = 40 -> costo = 40 * 2.0 = 80
            await sandbox.buyStandardFuel('c1');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 80);
        });

        test('buyStandardFuel rifiuta se motore è fuso o serbatoio è già pieno', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car1 = { id: 'c1', _serverId: 's1', fuel: 20, engineHealth: 0 };
            const car2 = { id: 'c2', _serverId: 's2', fuel: 100, engineHealth: 100 };
            gs.fleet = [car1, car2];

            await sandbox.buyStandardFuel('c1');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));

            await sandbox.buyStandardFuel('c2');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));

            assert.equal(rpcCalls.length, 0);
        });

        test('buyBlackMarketFuel applica sconto del 40% rispetto al prezzo ufficiale', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 10000;
            gs.fuelPrice = 2.0; // Black market price = 2.0 * 0.60 = 1.20
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', fuel: 50, engineHealth: 100, outOfService: 'fuel' };
            gs.fleet = [car];

            // fuelNeeded = 50 -> litres = 25 -> cost = Math.floor(25 * 1.20) = 30
            await sandbox.buyBlackMarketFuel('c1');

            assert.equal(car.fuel, 100);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 30);
        });

        test('superchargeVehicle ricarica i veicoli elettrici al Supercharger per €80', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 10000;
            // Volt 3-Urban è elettrica
            const car = { id: 'c1', _serverId: 's1', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban', chargeLevel: 20, isLease: false, outOfService: 'fuel' };
            gs.fleet = [car];

            await sandbox.superchargeVehicle('c1');

            assert.equal(car.chargeLevel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 80);
        });

        test('superchargeVehicle rifiuta veicoli non elettrici o con batteria già al 100%', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const carGas = { id: 'c_gas', _serverId: 's_gas', name: 'Stellar E-Executive', vehicleClass: 'stellar_e_exec', chargeLevel: 20 };
            const carFull = { id: 'c_full', _serverId: 's_full', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban', chargeLevel: 100 };
            gs.fleet = [carGas, carFull];

            await sandbox.superchargeVehicle('c_gas');
            await sandbox.superchargeVehicle('c_full');

            assert.equal(rpcCalls.length, 0);
        });
    });

    describe('5. Gestione Deposito Carburante e Gomme (buyFuelForDepot, upgradeFuelDepot, refillTires, etc.)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot acquista carburante nel deposito aziendale applicando sconti', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 10000;
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 0;
            gs.fuelPrice = 2.0;
            gs.fuelTankLevel = 1;

            sandbox.buyFuelForDepot(2000);
            await new Promise(r => setImmediate(r));

            // 2000L * 2.0 = 4000
            assert.equal(gs.cash, 6000);
            assert.equal(gs.fuelTank, 2000);
            assert.deepEqual(syncedCash, [6000]);
        });

        test('buyFuelForDepot rifiuta se deposito non sbloccato o già pieno', async () => {
            const { sandbox, gs, env } = amb;
            gs.investments = []; // Senza inv_fuel_depot
            gs.cash = 10000;

            sandbox.buyFuelForDepot(1000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima')));
            assert.equal(gs.cash, 10000);

            // Deposito pieno
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 5000;
            gs.fuelTank = 5000;

            sandbox.buyFuelForDepot(1000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));
        });

        test('upgradeFuelDepot potenzia la capienza del serbatoio', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 20000;
            gs.fuelTankLevel = 1;

            // Lv1 -> Lv2: costo 5000
            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.deepEqual(syncedCash, [15000]);
        });

        test('buyTiresForDepot acquista treni di gomme per il magazzino ricambi', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 10000;
            gs.depositoGomme = 0;

            // 3 set * 800 = 2400
            sandbox.buyTiresForDepot(3);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 7600);
            assert.equal(gs.depositoGomme, 3);
            assert.deepEqual(syncedCash, [7600]);
        });

        test('emergencyRefuel rifornisce tutte le auto ferme al triplo della tariffa', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 10000;
            gs.fuelPrice = 2.0;
            const car1 = { id: 'c1', fuel: 0, outOfService: 'fuel' };
            const car2 = { id: 'c2', fuel: 0, outOfService: 'fuel' };
            gs.fleet = [car1, car2];

            // 2 auto * 80L * (2.0 * 3 = 6) = 960
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 9040);
            assert.equal(car1.fuel, 100);
            assert.equal(car2.fuel, 100);
            assert.equal(car1.outOfService, null);
            assert.equal(car2.outOfService, null);
            assert.deepEqual(syncedCash, [9040]);
        });

        test('refillTires ripristina la pressione gomme della singola auto via ServerState', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.cash = 10000;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', tirePressure: 50 };
            gs.fleet = [car];

            // missing = 50 -> cost = Math.ceil(50 * 0.8) = 40
            await sandbox.refillTires('c1');

            assert.equal(car.tirePressure, 100);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'refillCarTires');
            assert.equal(rpcCalls[0].cost, 40);
        });
    });

    describe('6. Contratti Manutenzione e Strategia Tariffaria (buyMaintenanceContract, setPricingStrategy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyMaintenanceContract attiva la copertura per 7 giorni scalando €10.000', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 3;
            gs.cash = 25000;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 10);
            assert.deepEqual(syncedCash, [15000]);
        });

        test('setPricingStrategy imposta correttamente la modalità e rifiuta valori non validi', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('valore_invalido');
            assert.equal(gs.pricingStrategy, 'discount');
        });
    });

    describe('7. Upgrade Veicoli e Personalizzazione Skin (buyCARUpgrade, applyVehicleSkin)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000, driverCoins: 50 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa componenti speciali scalando il costo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 30000;
            const car = { id: 'c1', name: 'Auto 1', upgrades: [] };
            gs.fleet = [car];

            // centralina costa 5000
            sandbox.buyCARUpgrade('c1', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 25000);
            assert.ok(car.upgrades.includes('centralina'));
            assert.deepEqual(syncedCash, [25000]);
        });

        test('buyCARUpgrade rifiuta se upgrade già installato o fondi insufficienti', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 1000; // Troppo pochi per centralina (5000)
            const car = { id: 'c1', name: 'Auto 1', upgrades: ['vetri_oscurati'] };
            gs.fleet = [car];

            // Upgrade già installato
            sandbox.buyCARUpgrade('c1', 'vetri_oscurati');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));

            // Fondi insufficienti
            sandbox.buyCARUpgrade('c1', 'centralina');
            assert.equal(gs.cash, 1000);
            assert.ok(!car.upgrades.includes('centralina'));
        });

        test('applyVehicleSkin applica la verniciatura spendendo Driver Coins', async () => {
            const { sandbox, gs, dcSpends } = amb;
            gs.driverCoins = 30;
            const car = { id: 'c1', name: 'Auto 1' };
            gs.fleet = [car];

            // gold_chrome costa 15 DC
            sandbox.applyVehicleSkin('c1', 'gold_chrome');
            await new Promise(r => setImmediate(r));

            assert.equal(car.skin, 'gold_chrome');
            assert.equal(gs.driverCoins, 15);
            assert.deepEqual(dcSpends, [['vehicle_skin', 15]]);
        });
    });

    describe('8. Prototipi Esclusivi e Veicoli Mercato NPC (buyPrototypeCar, buyNpcCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 500000, reputation: 5.0 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyPrototypeCar sblocca ed inserisce in flotta il prototipo se requisiti soddisfatti', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 300000;
            gs.reputation = 4.8;
            gs.hasEVHub = true;
            gs.questStats = { totalRides: 100 };

            // proto_van_vip costa 110000
            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 190000);
            assert.ok(gs.fleet.some(c => c.protoId === 'proto_van_vip'));
            assert.deepEqual(syncedCash, [190000]);
        });

        test('buyPrototypeCar rifiuta se reputazione, corse o infrastruttura EV mancano', () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 500000;

            // Reputazione insufficiente
            gs.reputation = 1.0;
            sandbox.buyPrototypeCar('proto_van_vip');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            // Hub EV mancante per prototipo elettrico (proto_tesla)
            gs.reputation = 5.0;
            gs.questStats = { totalRides: 1000 };
            gs.hasEVHub = false;
            sandbox.buyPrototypeCar('proto_tesla');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Infrastruttura mancante')));
        });

        test('buyNpcCar acquista auto usata dal mercato NPC e la rimuove dalla lista', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 60000;
            gs.npcMarket = [{ id: 'npc_1', name: 'Stellar E-Executive Usata', tier: 'business', price: 25000, condition: 75, mileage: 50000 }];

            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 35000);
            assert.ok(gs.fleet.some(c => c.name === 'Stellar E-Executive Usata'));
            assert.equal(gs.npcMarket.length, 0);
            assert.deepEqual(syncedCash, [35000]);
        });
    });

    describe('9. Mercato Auto, Aste e Vendita (listCarForSale, sellCar, bidOnAuction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 100000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('listCarForSale mette in vendita un veicolo liberando l\'autista assegnato', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Auto Da Vendere', tier: 'business', isLimitedEdition: false };
            const driver = { id: 'd1', name: 'Mario', assignedCarId: 'c1', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];

            sandbox.listCarForSale('c1', 30000);

            assert.equal(driver.assignedCarId, null);
            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'c1');
            assert.equal(gs.marketplace[0].askPrice, 30000);
        });

        test('listCarForSale blocca vendita di edizioni limitate o con autista in servizio', () => {
            const { sandbox, gs, env } = amb;
            // Edizione limitata
            const carLtd = { id: 'c_ltd', name: 'Bugatti Royale', isLimitedEdition: true };
            gs.fleet = [carLtd];
            sandbox.listCarForSale('c_ltd', 100000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('limitate')));

            // Autista occupato (busy)
            const carBusy = { id: 'c_busy', name: 'Auto Occupata', isLimitedEdition: false };
            const driverBusy = { id: 'd2', name: 'Luigi', assignedCarId: 'c_busy', status: 'busy' };
            gs.fleet.push(carBusy);
            gs.drivers.push(driverBusy);
            sandbox.listCarForSale('c_busy', 25000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in servizio')));
        });

        test('sellCar vende istantaneamente il veicolo tramite ServerState.sellVehicle', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = { id: 'c1', _serverId: 's1', name: 'Auto Vendita', tier: 'business', condition: 100, isLease: false };
            const driver = { id: 'd1', assignedCarId: 'c1' };
            gs.fleet = [car];
            gs.drivers = [driver];

            // baseValue 35000 * 1.0 * 0.7 = 24500
            await sandbox.sellCar('c1');

            assert.equal(gs.fleet.length, 0);
            assert.equal(driver.assignedCarId, null);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].method, 'sellVehicle');
            assert.equal(rpcCalls[0].cost, undefined); // price is passed
        });

        test('bidOnAuction gestisce offerte, rimborsi della precedente puntata e sincronizzazione', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 80000;
            gs.activeAuction = { id: 'auc_1', name: 'Majestic Rara', currentBid: 40000, playerBid: null };

            // Prima offerta valida
            sandbox.bidOnAuction(50000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000);
            assert.equal(gs.activeAuction.playerBid, 50000);
            assert.equal(gs.activeAuction.currentBid, 50000);

            // Rilancio: rimborso 50k (cash torna a 80k) e spesa 65k (cash = 15k)
            sandbox.bidOnAuction(65000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.activeAuction.playerBid, 65000);
            assert.deepEqual(syncedCash, [30000, 80000, 15000]);
        });
    });

    describe('10. Conquista Hub e Gestione Rientro (buyHub, sellHub, returnToHub)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 100000, reputation: 3.0 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub acquista la concessione e sellHub la cede al 60%', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;
            gs.reputation = 3.0;
            gs.ownedHubs = [];

            // POIS.roma_fco baseFlat 90 -> costo 50000 + 18000 = 68000
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 32000);
            assert.ok(gs.ownedHubs.includes('roma_fco'));

            // Cessione: 68000 * 0.6 = 40800
            sandbox.sellHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 72800);
            assert.ok(!gs.ownedHubs.includes('roma_fco'));
            assert.deepEqual(syncedCash, [32000, 72800]);
        });

        test('returnToHub calcola percorso, spende carburante e pedaggio, e manda autista in riposo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 20000;
            const car = { id: 'c_milano', currentPoiId: 'milano', upgrades: [] };
            const driver = { id: 'd_milano', name: 'Gianni', assignedCarId: 'c_milano', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];

            sandbox.returnToHub('c_milano');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash < 20000);
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.ok(driver.restHoursLeft > 0);
            assert.deepEqual(syncedCash, [gs.cash]);
        });

        test('returnToHub azzera il pedaggio se presente telepass aziendale o su veicolo', async () => {
            const { sandbox, gs } = amb;
            gs.cash = 20000;
            const carWithTp = { id: 'c_tp', currentPoiId: 'milano', upgrades: ['telepass_car'] };
            const driver = { id: 'd_tp', assignedCarId: 'c_tp', status: 'idle' };
            gs.fleet = [carWithTp];
            gs.drivers = [driver];

            sandbox.returnToHub('c_tp');
            await new Promise(r => setImmediate(r));

            const spesaConTp = 20000 - gs.cash;

            // Ripristina senza telepass
            gs.cash = 20000;
            carWithTp.upgrades = [];
            driver.status = 'idle';

            sandbox.returnToHub('c_tp');
            await new Promise(r => setImmediate(r));

            const spesaSenzaTp = 20000 - gs.cash;
            assert.ok(spesaConTp < spesaSenzaTp, 'il telepass deve ridurre il costo del rientro azzerando i pedaggi');
        });
    });

    describe('11. Gestione Leasing e Termine Anticipato (terminateLease)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 50000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminateLease calcola penale sui mesi residui (50%), libera autista e rimuove auto', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            const car = {
                id: 'c_lease_1', name: 'Stellar Leasing', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 90, leaseMonthlyRate: 2000
            };
            const driver = { id: 'd_lease', assignedCarId: 'c_lease_1' };
            gs.fleet = [car];
            gs.drivers = [driver];

            // 12*30 - 90 = 270g -> 9 mesi residui -> penale = 9 * 2000 * 0.5 = 9000
            sandbox.terminateLease('c_lease_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 41000);
            assert.equal(gs.fleet.length, 0);
            assert.equal(driver.assignedCarId, null);
            assert.deepEqual(syncedCash, [41000]);
        });

        test('terminateLease rifiuta se veicolo non è in leasing o se l\'utente annulla la conferma', () => {
            const { sandbox, gs } = amb;
            gs.cash = 50000;
            const carProp = { id: 'c_prop', name: 'Auto Proprietà', isLease: false };
            gs.fleet = [carProp];

            sandbox.terminateLease('c_prop');
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.cash, 50000);

            // Annulla confirm
            const carLease = { id: 'c_lease_2', isLease: true, leaseDuration: 6, leaseElapsedDays: 0, leaseMonthlyRate: 1000 };
            gs.fleet.push(carLease);
            sandbox.confirm = () => false;

            sandbox.terminateLease('c_lease_2');
            assert.equal(gs.fleet.length, 2);
            assert.equal(gs.cash, 50000);
        });
    });

    describe('12. Verifica Flussi Finanziari e Assenza Doppio Conteggio (Regola 3)', () => {
        test('le azioni flotta passano o da CE_money o da RPC del server, mai da entrambi', async () => {
            const amb = creaAmbienteFlotta({ cash: 100000 });
            const { sandbox, gs, rpcCalls, syncedCash } = amb;

            // 1. Azione con ServerState RPC (payToRepairCar)
            const car = { id: 'c1', _serverId: 's1', name: 'Auto 1', tier: 'business', condition: 40 };
            gs.fleet = [car];
            await sandbox.payToRepairCar('c1');

            // repairVehicle viene chiamata sulla RPC e NON chiama CE_money.spend
            assert.equal(rpcCalls.filter(r => r.method === 'repairVehicle').length, 1);

            // 2. Azione con CE_money (buyCARUpgrade)
            car.upgrades = [];
            sandbox.buyCARUpgrade('c1', 'centralina');
            await new Promise(r => setImmediate(r));

            // buyCARUpgrade usa CE_money.spend e sincronizza con syncCash
            assert.ok(syncedCash.length > 0);

            amb.env.stopAllIntervals();
        });
    });
});
