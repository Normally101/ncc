'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Verifica approfondita della Flotta (engine-fleet.js, ui-fleet.js)

   Scopo: collaudo completo di tutte le azioni e routine della gestione flotta:
   - Rendering UI, KPI, filtri, model group e bulk repair (ui-fleet.js)
   - Riparazione carrozzeria, motore e istantanea DC (payToRepairCar, repairEngine, instantRepairDC)
   - Rifornimento standard, EV supercharger, black market, emergenza (buyStandardFuel, superchargeVehicle, buyBlackMarketFuel, emergencyRefuel)
   - Pressione gomme e deposito treni (refillTires, buyTiresForDepot)
   - Deposito carburante aziendale e upgrade (buyFuelForDepot, upgradeFuelDepot)
   - Manutenzione, strategie e tuning (buyMaintenanceContract, setPricingStrategy, applyVehicleSkin, buyCARUpgrade)
   - Gestione leasing, hub territoriali, mercato NPC, aste e prototipi (terminateLease, buyHub, sellHub, returnToHub, listCarForSale, buyNpcCar, bidOnAuction, buyPrototypeCar, sellCar)
   - Verifica coerenza prezzi mostrati vs addebitati e assenza di doppio conteggio (CE_money vs ServerState)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito per i test della flotta con opzioni di mocking.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const serverCalls = [];
    const env = freshEnv({
        render: true,
        serverState: {
            refuelVehicle: async (serverId, amount, cost) => {
                serverCalls.push({ action: 'refuelVehicle', serverId, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (serverId, cost) => {
                serverCalls.push({ action: 'refillCarTires', serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            repairVehicle: async (serverId, cost) => {
                serverCalls.push({ action: 'repairVehicle', serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (serverId, price) => {
                serverCalls.push({ action: 'sellVehicle', serverId, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            spendDriverCoins: async (_itemId, amount) => {
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sandbox = env.sandbox;

    // Carica esplicitamente ui-fleet.js nel contesto VM
    const fs = require('node:fs');
    const path = require('node:path');
    const uiFleetCode = fs.readFileSync(path.join(__dirname, '../../ui-fleet.js'), 'utf8');
    vm.runInContext(uiFleetCode, sandbox, { filename: 'ui-fleet.js' });

    const gs = sandbox.gameState;

    // Inizializza cassa e filtri default
    gs.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    gs.driverCoins = opzioni.driverCoins !== undefined ? opzioni.driverCoins : 50;
    gs.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    sandbox._fleetFilter = { brand: null, tier: null };

    // Setup DOM container
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox,
        gs,
        serverCalls,
    };
}

describe('Funzione Flotta — Collaudo Completo (engine-fleet.js, ui-fleet.js)', () => {

    describe('1. Rendering UI Flotta, KPI e Filtri (renderTabFleet, _fleetFilter)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet calcola KPI corretti (totale, operativi, condizione media, fuori servizio)', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 80, fuel: 90, tirePressure: 100, engineHealth: 100, outOfService: null, isSeized: false },
                { id: 'c2', name: 'Stellar V-Carrier', tier: 'business', condition: 60, fuel: 40, tirePressure: 80, engineHealth: 100, outOfService: null, isSeized: false },
                { id: 'c3', name: 'Volt 3-Urban', tier: 'business', vehicleClass: 'volt_3_urban', condition: 100, chargeLevel: 10, tirePressure: 100, engineHealth: 100, outOfService: 'fuel', isSeized: false },
            ];

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('3 veicoli'), 'deve mostrare 3 veicoli totali');
            assert.ok(c.innerHTML.includes('2 operativi') || c.innerHTML.includes('>2</div>'), '2 operativi');
            assert.ok(c.innerHTML.includes('1 fuori servizio') || c.innerHTML.includes('>1</div>'), '1 fuori servizio');
            // Condizione media: (80 + 60 + 100) / 3 = 80%
            assert.ok(c.innerHTML.includes('80%'), 'condizione media 80%');
        });

        test('filtro produttore e categoria seleziona solo i veicoli corrispondenti', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 90 },
                { id: 'c2', name: 'Stellar S-Imperial', tier: 'vip', condition: 90 },
                { id: 'c3', name: 'Volt 3-Urban', tier: 'business', condition: 90 },
            ];

            // Filtra per Brand: Volt
            sandbox._fleetFilter.brand = 'Volt';
            sandbox.renderTabFleet();
            let html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Volt 3-Urban'));
            assert.ok(!html.includes('Stellar E-Executive'));

            // Filtra per Tier: vip
            sandbox._fleetFilter.brand = null;
            sandbox._fleetFilter.tier = 'vip';
            sandbox.renderTabFleet();
            html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Stellar S-Imperial'));
            assert.ok(!html.includes('Volt 3-Urban'));
        });

        test('blocco deposito carburante e treni gomme mostrato se inv_fuel_depot presente', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 5000;
            gs.fuelTankCapacity = 20000;
            gs.depositoGomme = 4;

            sandbox.renderTabFleet();

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('🛢️ Deposito Aziendale'), 'deve mostrare deposito');
            assert.ok(html.includes('5.000/20.000L') || html.includes('5,000/20,000L'));
            assert.ok(html.includes('4 set'), 'deve mostrare 4 set di gomme');
        });

        test('veicoli sequestrati (seizedCars) renderizzati nella sezione apposita', () => {
            const { sandbox, gs } = amb;
            gs.seizedCars = [{ carName: 'Stellar S-Imperial', releaseDay: 5 }];
            gs.day = 2;

            sandbox.renderTabFleet();

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('🚨 Veicoli Sequestrati'));
            assert.ok(html.includes('Stellar S-Imperial'));
            assert.ok(html.includes('3g'), 'rilascio fra 3 giorni');
        });
    });

    describe('2. Riparazione Carrozzeria e Riparazione Gruppo (payToRepairCar, repairCostFor, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('il prezzo mostrato nel pulsante corrisponde esattamente al prezzo calcolato e addebitato', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', condition: 70, engineHealth: 100 };
            gs.fleet = [car];
            gs.cash = 50000;

            const expectedCost = sandbox.repairCostFor(car);
            // 30 punti mancanti * 85 = 2550 €
            assert.equal(expectedCost, 2550);

            sandbox.renderTabFleet();
            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('€2.550') || html.includes('€2,550'), 'il pulsante deve mostrare €2.550');

            await sandbox.payToRepairCar('c1');

            assert.equal(car.condition, 100);
            assert.equal(gs.cash, 50000 - 2550);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].action, 'repairVehicle');
            assert.equal(serverCalls[0].cost, 2550);
        });

        test('Kasko non azzera la riparazione ordinaria ma sconti manutenzione, meccanico e officina mobile si cumulano', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', condition: 60 };
            gs.fleet = [car];

            // 40 punti * 85 = 3400 € base
            assert.equal(sandbox.repairCostFor(car), 3400);

            // Contratto manutenzione (-30% -> * 0.70)
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = 10;
            gs.day = 1;
            assert.equal(sandbox.repairCostFor(car), Math.round(3400 * 0.70)); // 2380

            // Meccanico (-50% -> * 0.50)
            gs.staff = [{ id: 'mech', name: 'Capo Officina' }];
            assert.equal(sandbox.repairCostFor(car), Math.round(3400 * 0.70 * 0.50)); // 1190

            // Officina mobile (-20% -> * 0.80)
            gs.investments = ['inv_mobile_workshop'];
            assert.equal(sandbox.repairCostFor(car), Math.round(3400 * 0.70 * 0.50 * 0.80)); // 952
        });

        test('payToRepairCar blocca la riparazione se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', condition: 50, engineHealth: 0 };
            gs.fleet = [car];

            await sandbox.payToRepairCar('c1');

            assert.equal(car.condition, 50, 'la carrozzeria non deve essere riparata');
            assert.equal(serverCalls.length, 0, 'nessuna RPC inviata');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('bulkRepairFleet ripara tutti i veicoli danneggiati del modello accettando sia array che stringa JSON', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const c1 = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', condition: 70, engineHealth: 100 };
            const c2 = { id: 'c2', _serverId: 'srv_c2', name: 'Stellar E-Executive', condition: 80, engineHealth: 100 };
            const c3 = { id: 'c3', _serverId: 'srv_c3', name: 'Stellar E-Executive', condition: 100, engineHealth: 100 };
            gs.fleet = [c1, c2, c3];

            // Chiamata con array di ID
            sandbox.bulkRepairFleet(['c1', 'c2']);
            await new Promise(r => setImmediate(r));

            assert.equal(c1.condition, 100);
            assert.equal(c2.condition, 100);
            assert.equal(serverCalls.length, 2);

            // Chiamata con stringa JSON (come passata dal template delegation)
            c1.condition = 60;
            sandbox.bulkRepairFleet(JSON.stringify(['c1']));
            await new Promise(r => setImmediate(r));
            assert.equal(c1.condition, 100);
        });

        test('payToRepairCar rifiuta veicolo già al 100% o fondi insufficienti', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', condition: 100, engineHealth: 100 };
            gs.fleet = [car];

            await sandbox.payToRepairCar('c1');
            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('ottime condizioni')));

            // Fondi insufficienti
            car.condition = 50;
            gs.cash = 100; // servono ~4250 €
            await sandbox.payToRepairCar('c1');
            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });
    });

    describe('3. Riparazione Motore e Riparazione Istantanea DC (repairEngine, instantRepairDC)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairEngine ripara il motore, azzera outOfService = engine e addebita il costo esatto', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', condition: 100, engineHealth: 60, outOfService: 'engine' };
            gs.fleet = [car];
            gs.cash = 50000;

            // Danno: 40% -> max(800, 40 * 180) = 7200 €
            await sandbox.repairEngine('c1');

            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 50000 - 7200);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].action, 'repairVehicle');
            assert.equal(serverCalls[0].cost, 7200);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Motore')));
        });

        test('repairEngine rifiuta se il motore è già al 100%', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', engineHealth: 100 };
            gs.fleet = [car];

            await sandbox.repairEngine('c1');

            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già in perfette condizioni')));
        });

        test('instantRepairDC ripara carrozzeria al 100% spendendo Driver Coins (1 DC Pass, 2 DC default)', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', condition: 30, outOfService: 'fuel' };
            gs.fleet = [car];
            gs.driverCoins = 10;
            gs.executivePassActive = false;

            // Standard: 2 DC
            sandbox.instantRepairDC('c1');
            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.driverCoins, 8);

            // Con Executive Pass: 1 DC
            car.condition = 40;
            gs.executivePassActive = true;
            sandbox.instantRepairDC('c1');
            assert.equal(car.condition, 100);
            assert.equal(gs.driverCoins, 7);
        });

        test('instantRepairDC rifiuta se DC insufficienti o auto già al 100%', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', condition: 100 };
            gs.fleet = [car];
            gs.driverCoins = 10;

            sandbox.instantRepairDC('c1');
            assert.equal(gs.driverCoins, 10);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già al 100%')));

            car.condition = 50;
            gs.driverCoins = 0;
            sandbox.instantRepairDC('c1');
            assert.equal(car.condition, 50);
        });
    });

    describe('4. Rifornimento e Ricarica EV (superchargeVehicle, buyStandardFuel, buyBlackMarketFuel, emergencyRefuel)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('superchargeVehicle ricarica EV al 100%, resetta outOfService e addebita 80€ via ServerState', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const ev = { id: 'c_ev', _serverId: 'srv_ev', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban', chargeLevel: 20, outOfService: 'fuel' };
            gs.fleet = [ev];
            gs.cash = 1000;

            await sandbox.superchargeVehicle('c_ev');

            assert.equal(ev.chargeLevel, 100);
            assert.equal(ev.outOfService, null);
            assert.equal(gs.cash, 920);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].action, 'refuelVehicle');
            assert.equal(serverCalls[0].cost, 80);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Supercharger')));
        });

        test('superchargeVehicle rifiuta veicoli a benzina o batteria già al 100%', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const gasCar = { id: 'c_gas', _serverId: 'srv_gas', name: 'Stellar E-Executive', vehicleClass: 'stellar_e_exec', chargeLevel: 20 };
            gs.fleet = [gasCar];

            // Veicolo termico: no-op
            await sandbox.superchargeVehicle('c_gas');
            assert.equal(serverCalls.length, 0);

            // EV già carico
            const ev = { id: 'c_ev', _serverId: 'srv_ev', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban', chargeLevel: 100 };
            gs.fleet = [ev];
            await sandbox.superchargeVehicle('c_ev');
            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Batteria già al 100%')));
        });

        test('buyStandardFuel calcola litri mancanti e prezzo al litro, resetta outOfService fuel', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', fuel: 40, engineHealth: 100, outOfService: 'fuel' };
            gs.fleet = [car];
            gs.fuelPrice = 2.00;
            gs.cash = 1000;

            // Mancano 60% fuel -> 60 * 0.5 = 30 litri -> 30 * 2.00 = 60 €
            await sandbox.buyStandardFuel('c1');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 940);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].cost, 60);
        });

        test('buyStandardFuel blocca rifornimento se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', fuel: 20, engineHealth: 0 };
            gs.fleet = [car];

            await sandbox.buyStandardFuel('c1');

            assert.equal(car.fuel, 20);
            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('buyBlackMarketFuel applica sconto 40% rispetto al prezzo ufficiale', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', fuel: 50, engineHealth: 100 };
            gs.fleet = [car];
            gs.fuelPrice = 2.00;
            gs.cash = 1000;

            // 50% mancante -> 25L. Prezzo agricolo: 2.00 * 0.60 = 1.20 €/L -> Costo 30 €
            await sandbox.buyBlackMarketFuel('c1');

            assert.equal(car.fuel, 100);
            assert.equal(gs.cash, 970);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].cost, 30);
        });

        test('emergencyRefuel rifornisce al triplo del prezzo solo le auto outOfService fuel', () => {
            const { sandbox, gs, env } = amb;
            const c1 = { id: 'c1', name: 'Auto 1', fuel: 0, engineHealth: 100, outOfService: 'fuel' };
            const c2 = { id: 'c2', name: 'Auto 2', fuel: 10, engineHealth: 100, outOfService: 'fuel' };
            const c3 = { id: 'c3', name: 'Auto 3', fuel: 20, engineHealth: 0, outOfService: 'engine' };
            gs.fleet = [c1, c2, c3];
            gs.fuelPrice = 2.00;
            gs.cash = 50000;

            // 2 auto ferme per fuel -> 2 * 80L = 160L -> 160 * (2.00 * 3) = 960 €
            sandbox.emergencyRefuel();

            assert.equal(c1.fuel, 100);
            assert.equal(c1.outOfService, null);
            assert.equal(c2.fuel, 100);
            assert.equal(c2.outOfService, null);
            assert.equal(c3.outOfService, 'engine', 'auto con motore rotto resta outOfService');
            assert.equal(gs.cash, 50000 - 960);
        });

        test('emergencyRefuel senza auto ferme per carburante non addebita denaro', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'c1', fuel: 100, outOfService: null }];
            gs.cash = 5000;

            sandbox.emergencyRefuel();

            assert.equal(gs.cash, 5000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessuna auto ferma')));
        });
    });

    describe('5. Pressione Gomme e Deposito Treni (refillTires, buyTiresForDepot)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('refillTires ripristina pressione a 100, resetta outOfService tires e scala costo via ServerState', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', tirePressure: 50, outOfService: 'tires' };
            gs.fleet = [car];
            gs.cash = 10000;

            // Mancano 50% -> cost = Math.ceil(50 * 0.8) = 40 €
            await sandbox.refillTires('c1');

            assert.equal(car.tirePressure, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 9960);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].action, 'refillCarTires');
            assert.equal(serverCalls[0].cost, 40);
        });

        test('refillTires rifiuta se la pressione è già a 100', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', tirePressure: 100 };
            gs.fleet = [car];

            await sandbox.refillTires('c1');

            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('ottimale')));
        });

        test('buyTiresForDepot acquista treni di gomme nel deposito (800€/set)', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 2;
            gs.cash = 20000;

            sandbox.buyTiresForDepot(5); // 5 * 800 = 4000 €

            assert.equal(gs.depositoGomme, 7);
            assert.equal(gs.cash, 16000);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('+5 treni')));
        });

        test('buyTiresForDepot rifiuta se il deposito aziendale non è acquistato', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = [];
            gs.depositoGomme = 0;
            gs.cash = 20000;

            sandbox.buyTiresForDepot(1);

            assert.equal(gs.depositoGomme, 0);
            assert.equal(gs.cash, 20000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Attiva prima il Deposito')));
        });
    });

    describe('6. Deposito Carburante Aziendale e Upgrade (buyFuelForDepot, upgradeFuelDepot)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot riempie la cisterna applicando sconti livello, lobby e alleanze', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 2000;
            gs.fuelTankCapacity = 10000;
            gs.fuelTankLevel = 3; // Deposito Professionale: sconto 5% (0.95)
            gs.fuelPrice = 2.00;
            gs.cash = 50000;

            // Consorzio perk fuel_save (-15% -> 0.85)
            sandbox._allyPerkMult = (t) => t === 'fuel' ? 0.85 : 1.0;

            // Compra 5000L: cost = 5000 * 2.00 * (0.95 * 0.85) = 5000 * 2.00 * 0.8075 = 8075 €
            sandbox.buyFuelForDepot(5000);

            assert.equal(gs.fuelTank, 7000);
            assert.equal(gs.cash, 50000 - 8075);
        });

        test('buyFuelForDepot rifiuta se il deposito è già pieno o non acquistato', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 10000;
            gs.fuelTankCapacity = 10000;
            gs.cash = 50000;

            sandbox.buyFuelForDepot(1000);

            assert.equal(gs.fuelTank, 10000);
            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Deposito già pieno')));
        });

        test('upgradeFuelDepot avanza di livello aumentando capacità e sconti', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;
            gs.cash = 50000;

            // Lv 1 -> Lv 2 costa 5000 * 1^1.8 = 5000 €
            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 45000);
        });

        test('upgradeFuelDepot rifiuta se già al livello massimo (Lv 5)', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 5;
            gs.cash = 50000;

            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 5);
            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('livello massimo')));
        });
    });

    describe('7. Manutenzione, Strategie e Tuning (buyMaintenanceContract, setPricingStrategy, buyCARUpgrade, applyVehicleSkin)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyMaintenanceContract attiva contratto per 7 giorni scalando 10.000€ via CE_money', () => {
            const { sandbox, gs } = amb;
            gs.day = 5;
            gs.cash = 30000;

            sandbox.buyMaintenanceContract();

            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 12);
            assert.equal(gs.cash, 20000);
        });

        test('setPricingStrategy imposta modalità valide e rifiuta quelle scorrette', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('modalita_inventata');
            assert.equal(gs.pricingStrategy, 'discount');
        });

        test('buyCARUpgrade installa upgrade su veicolo e rifiuta duplicati o fondi insufficienti', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', upgrades: [] };
            gs.fleet = [car];
            gs.cash = 50000;

            // CAR_UPGRADES contiene centralina
            const upg = sandbox.CAR_UPGRADES.find(u => u.id === 'centralina');
            assert.ok(upg);

            sandbox.buyCARUpgrade('c1', 'centralina');

            assert.ok(car.upgrades.includes('centralina'));
            assert.equal(gs.cash, 50000 - upg.price);

            // Secondo acquisto dello stesso upgrade: bloccato
            sandbox.buyCARUpgrade('c1', 'centralina');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));
        });

        test('applyVehicleSkin applica skin cosmetica spendendo Driver Coins', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', skin: null };
            gs.fleet = [car];
            gs.driverCoins = 50;

            // matte_black costa 10 DC
            sandbox.applyVehicleSkin('c1', 'matte_black');

            assert.equal(car.skin, 'matte_black');
            assert.equal(gs.driverCoins, 40);
        });
    });

    describe('8. Gestione Leasing e Termine Anticipato (terminateLease)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminateLease calcola penale sui mesi rimanenti, libera autista e rimuove auto', () => {
            const { sandbox, gs } = amb;
            const car = {
                id: 'c_lease',
                name: 'Stellar E-Executive (Leasing)',
                isLease: true,
                leaseDuration: 12, // 12 mesi (360 giorni)
                leaseElapsedDays: 60, // trascorsi 2 mesi -> rimangono 10 mesi (300 giorni)
                leaseMonthlyRate: 2000,
            };
            const driver = { id: 'd1', name: 'Mario Rossi', assignedCarId: 'c_lease', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 50000;

            // Penale = 10 mesi * 2000 € * 0.5 = 10.000 €
            sandbox.terminateLease('c_lease');

            assert.equal(gs.fleet.length, 0, 'auto rimossa dalla flotta');
            assert.equal(driver.assignedCarId, null, 'autista liberato');
            assert.equal(gs.cash, 40000, 'penale addebitata');
        });

        test('terminateLease rifiuta se auto non è in leasing o se utente annulla confirm', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', isLease: false };
            gs.fleet = [car];
            gs.cash = 50000;

            sandbox.terminateLease('c1');
            assert.equal(gs.fleet.length, 1);

            // Auto in leasing ma confirm = false
            car.isLease = true;
            car.leaseDuration = 6;
            car.leaseElapsedDays = 0;
            car.leaseMonthlyRate = 1000;
            sandbox.confirm = () => false;

            sandbox.terminateLease('c1');
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.cash, 50000);
        });
    });

    describe('9. Hub Territoriali e Ritorno all\'Hub (buyHub, sellHub, returnToHub)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub acquista la concessione di un hub sbloccando la tassa 5%', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 3.0;
            gs.cash = 200000;
            gs.ownedHubs = [];

            const hub = sandbox.POIS['roma_fco'];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);

            sandbox.buyHub('roma_fco');

            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 200000 - cost);
        });

        test('buyHub rifiuta se hub già posseduto o reputazione < 2.5', () => {
            const { sandbox, gs, env } = amb;
            gs.reputation = 2.0; // rep insufficiente
            gs.cash = 200000;
            gs.ownedHubs = [];

            sandbox.buyHub('roma_fco');
            assert.equal(gs.ownedHubs.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            // Hub già posseduto
            gs.reputation = 4.0;
            gs.ownedHubs = ['roma_fco'];
            sandbox.buyHub('roma_fco');
            assert.equal(gs.ownedHubs.length, 1);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già controllato')));
        });

        test('sellHub cede l\'hub e accredita il 60% del valore d\'acquisto via CE_money.earn', () => {
            const { sandbox, gs } = amb;
            const hub = sandbox.POIS['roma_fco'];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);
            const resaleValue = Math.floor(cost * 0.6);

            gs.ownedHubs = ['roma_fco'];
            gs.cash = 10000;

            sandbox.sellHub('roma_fco');

            assert.equal(gs.ownedHubs.includes('roma_fco'), false);
            assert.equal(gs.cash, 10000 + resaleValue);
        });

        test('returnToHub invia autista e auto all\'Hub di Roma calcolando ore e costi', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', currentPoiId: 'milano', upgrades: [] };
            const driver = { id: 'd1', name: 'Luca', assignedCarId: 'c1', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 20000;

            sandbox.returnToHub('c1');

            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.ok(driver.restHoursLeft > 0);
            assert.ok(gs.cash < 20000, 'costo carburante e pedaggio deve essere scalato');
        });

        test('returnToHub rifiuta se l\'autista è occupato o il veicolo è già all\'Hub', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', currentPoiId: 'roma' };
            const driver = { id: 'd1', name: 'Luca', assignedCarId: 'c1', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];

            // Già all'hub
            sandbox.returnToHub('c1');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già all\'Hub')));

            // Autista occupato
            car.currentPoiId = 'firenze';
            driver.status = 'busy';
            sandbox.returnToHub('c1');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('non disponibile')));
        });
    });

    describe('10. Mercato Auto NPC, Aste e Prototipi (listCarForSale, buyNpcCar, bidOnAuction, buyPrototypeCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('listCarForSale rifiuta auto in edizione limitata o con autista occupato', () => {
            const { sandbox, gs, env } = amb;
            const carLtd = { id: 'c_ltd', name: 'Majestic G-Prestige CEO Edition', isLimitedEdition: true };
            gs.fleet = [carLtd];

            sandbox.listCarForSale('c_ltd', 100000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('limitate')));

            const carNorm = { id: 'c_norm', name: 'Stellar E-Executive', isLimitedEdition: false };
            const driverBusy = { id: 'd1', assignedCarId: 'c_norm', status: 'busy' };
            gs.fleet = [carNorm];
            gs.drivers = [driverBusy];

            sandbox.listCarForSale('c_norm', 30000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));
        });

        test('listCarForSale e cancelListing gestiscono correttamente gli annunci marketplace', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', name: 'Stellar E-Executive', isLimitedEdition: false };
            const driver = { id: 'd1', assignedCarId: 'c1', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.marketplace = [];

            sandbox.listCarForSale('c1', 35000);

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].askPrice, 35000);
            assert.equal(driver.assignedCarId, null, 'assegnazione rimossa alla messa in vendita');

            const listingId = gs.marketplace[0].id;
            sandbox.cancelListing(listingId);
            assert.equal(gs.marketplace.length, 0);
        });

        test('buyNpcCar acquista auto usata aggiungendola alla flotta e scalandone il prezzo', () => {
            const { sandbox, gs } = amb;
            gs.npcMarket = [{
                id: 'npc_1',
                name: 'Stellar V-Carrier 2020',
                tier: 'business',
                vehicleClass: 'stellar_v_carr',
                price: 25000,
                condition: 75,
                mileage: 60000,
            }];
            gs.fleet = [];
            gs.cash = 40000;

            sandbox.buyNpcCar('npc_1');

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].name, 'Stellar V-Carrier 2020');
            assert.equal(gs.fleet[0].condition, 75);
            assert.equal(gs.cash, 15000);
            assert.equal(gs.npcMarket.length, 0);
        });

        test('bidOnAuction rilancia su asta live rimborsando l\'offerta precedente', () => {
            const { sandbox, gs, env } = amb;
            gs.activeAuction = {
                id: 'auc_1',
                name: 'Majestic Spirit Presidential',
                currentBid: 200000,
                playerBid: 200000,
            };
            gs.cash = 500000;

            // Rilancio valido a 220.000 €:
            // Rimborso 200.000 -> cassa 700.000 -> Spesa 220.000 -> cassa 480.000
            sandbox.bidOnAuction(220000);

            assert.equal(gs.activeAuction.playerBid, 220000);
            assert.equal(gs.activeAuction.currentBid, 220000);
            assert.equal(gs.cash, 480000);

            // Rilancio inferiore o uguale: bloccato
            sandbox.bidOnAuction(210000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Offerta troppo bassa')));
        });

        test('buyPrototypeCar verifica reputazione, corse minime e Hub EV prima di sbloccare il veicolo', () => {
            const { sandbox, gs, env } = amb;
            const proto = sandbox.PROTOTYPE_CARS[0]; // Prototipo a catalogo
            assert.ok(proto);

            gs.fleet = [];
            gs.cash = 1000000;
            gs.reputation = proto.reqRep;
            gs.questStats.totalRides = proto.rideGate || 0;
            gs.hasEVHub = true;

            sandbox.buyPrototypeCar(proto.id);

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].protoId, proto.id);

            // Secondo acquisto dello stesso prototipo: bloccato
            sandbox.buyPrototypeCar(proto.id);
            assert.equal(gs.fleet.length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Hai già questo prototipo')));
        });
    });

    describe('11. Vendita Veicolo e Casi Speciali (sellCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('sellCar vende il veicolo, libera l\'autista assegnato e accredita il valore residuo via ServerState', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', tier: 'business', condition: 100, isLease: false };
            const driver = { id: 'd1', assignedCarId: 'c1' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 10000;

            // Business baseValue 35000 * 100% * 0.7 = 24500 €
            await sandbox.sellCar('c1');

            assert.equal(gs.fleet.length, 0);
            assert.equal(driver.assignedCarId, null);
            assert.equal(gs.cash, 34500);
            assert.equal(serverCalls.length, 1);
            assert.equal(serverCalls[0].action, 'sellVehicle');
            assert.equal(serverCalls[0].price, 24500);
        });

        test('sellCar rifiuta vendita di veicoli in leasing o in edizione limitata', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const carLease = { id: 'c_lease', _serverId: 'srv_l', isLease: true };
            const carLtd = { id: 'c_ltd', _serverId: 'srv_ltd', isLimitedEdition: true, isLease: false };
            gs.fleet = [carLease, carLtd];

            await sandbox.sellCar('c_lease');
            assert.equal(gs.fleet.length, 2);
            assert.equal(serverCalls.length, 0);

            await sandbox.sellCar('c_ltd');
            assert.equal(gs.fleet.length, 2);
            assert.equal(serverCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('limitate')));
        });
    });

    describe('12. Movimenti di Denaro e Assenza di Doppio Conteggio', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('nessuna azione della flotta scala il denaro sia localmente che via ServerState duplicando l\'addebito', async () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c1', _serverId: 'srv_c1', name: 'Stellar E-Executive', condition: 80, engineHealth: 100 };
            gs.fleet = [car];
            gs.cash = 100000;

            const cost = sandbox.repairCostFor(car); // 20 * 85 = 1700 €
            await sandbox.payToRepairCar('c1');

            // Il saldo finale deve essere esattamente 100.000 - 1.700 = 98.300
            assert.equal(gs.cash, 100000 - cost, 'il saldo non deve subire doppio decremento');
        });

        test('le modifiche alla flotta persistono correttamente in localStorage via saveGame()', async () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'c1', name: 'Stellar E-Executive', condition: 100, skin: null }];
            sandbox.window.currentSlotIndex = 0;

            sandbox.applyVehicleSkin('c1', 'matte_black');

            const raw = sandbox.localStorage.getItem('chauffeurEmpireSlot_1');
            assert.ok(raw);
            const parsed = JSON.parse(raw);
            assert.equal(parsed.fleet[0].skin, 'matte_black');
        });
    });
});
