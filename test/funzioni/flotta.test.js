'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo profondo del modulo Flotta (Gestione Veicoli)

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js` e `ui-fleet.js`, verificare l'integrazione con
   CE_money e ServerState, la prevenzione del doppio conteggio, il calcolo dei
   prezzi mostrati vs addebitati, la gestione dei casi anomali (fondi insufficienti,
   oggetti inesistenti, autisti occupati, edizioni limitate, leasing) e il rendering UI.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente pulito e configurato per i test della flotta.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const syncedCash = [];
    const dcSpends = [];
    const serverCalls = [];

    const defaultFleet = [
        {
            id: 'c_std_1',
            _serverId: 'srv_std_1',
            name: 'Stellar E-Executive',
            tier: 'business',
            vehicleClass: 'stellar_e_exec',
            condition: 100,
            engineHealth: 100,
            fuel: 100,
            tirePressure: 100,
            isLease: false,
            outOfService: null,
            upgrades: [],
            mileage: 12000,
        },
        {
            id: 'c_dmg_1',
            _serverId: 'srv_dmg_1',
            name: 'Stellar V-Carrier',
            tier: 'business',
            vehicleClass: 'stellar_v_carr',
            condition: 40,
            engineHealth: 60,
            fuel: 30,
            tirePressure: 50,
            isLease: false,
            outOfService: null,
            upgrades: [],
            mileage: 45000,
        },
        {
            id: 'c_ev_1',
            _serverId: 'srv_ev_1',
            name: 'Volt 3-Urban',
            tier: 'business',
            vehicleClass: 'volt_3_urban',
            condition: 100,
            engineHealth: 100,
            chargeLevel: 20,
            tirePressure: 100,
            isLease: false,
            outOfService: 'fuel',
            upgrades: [],
            mileage: 8000,
        },
        {
            id: 'c_lease_1',
            _serverId: 'srv_lease_1',
            name: 'Stellar S-Imperial (Leasing)',
            tier: 'vip',
            vehicleClass: 'stellar_s_imp',
            condition: 90,
            engineHealth: 100,
            fuel: 80,
            tirePressure: 90,
            isLease: true,
            leaseDuration: 12,
            leaseElapsedDays: 60,
            leaseMonthlyRate: 2000,
            outOfService: null,
            upgrades: [],
            mileage: 15000,
        },
    ];

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            spendDriverCoins: async (item, n) => {
                dcSpends.push([item, n]);
                return { ok: true };
            },
            refuelVehicle: async (srvId, amount, cost) => {
                serverCalls.push({ action: 'refuelVehicle', srvId, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            repairVehicle: async (srvId, cost) => {
                serverCalls.push({ action: 'repairVehicle', srvId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (srvId, cost) => {
                serverCalls.push({ action: 'refillCarTires', srvId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            buyVehicleUpgrade: async (srvId, upgId, price) => {
                serverCalls.push({ action: 'buyVehicleUpgrade', srvId, upgId, price });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - price);
                return { success: true };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    // Inizializza auth e client Supabase mock
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'usr_test_1' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;
    env.sandbox.supabaseClient = {
        from: () => ({
            select: () => ({
                gt: () => ({
                    order: () => ({
                        limit: () => Promise.resolve({ data: [], error: null }),
                    }),
                }),
                order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                }),
            }),
        }),
        rpc: async (name, params) => {
            if (opzioni.rpcHandlers && opzioni.rpcHandlers[name]) {
                return opzioni.rpcHandlers[name](params);
            }
            if (name === 'rpc_list_car_for_sale') {
                return { data: { success: true }, error: null };
            }
            return { data: {}, error: null };
        },
        channel: () => ({ on: () => ({ subscribe: () => {} }) }),
        removeChannel: () => {},
    };
    env.sandbox.window.supabaseClient = env.sandbox.supabaseClient;

    // Inizializza stato gameState
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    env.sandbox.gameState.driverCoins = opzioni.driverCoins !== undefined ? opzioni.driverCoins : 50;
    env.sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    env.sandbox.gameState.day = opzioni.day !== undefined ? opzioni.day : 10;
    env.sandbox.gameState.fuelPrice = opzioni.fuelPrice !== undefined ? opzioni.fuelPrice : 1.85;
    env.sandbox.gameState.fleet = (opzioni.fleet || defaultFleet).map(c => ({ ...c }));
    env.sandbox.gameState.drivers = opzioni.drivers !== undefined ? opzioni.drivers : [
        { id: 'ceo', name: 'Tu (CEO)', status: 'idle', assignedCarId: null },
        { id: 'drv_1', name: 'Mario Rossi', status: 'idle', assignedCarId: 'c_dmg_1' },
    ];
    env.sandbox.gameState.investments = opzioni.investments ? [...opzioni.investments] : [];
    env.sandbox.gameState.ownedHubs = opzioni.ownedHubs ? [...opzioni.ownedHubs] : [];
    env.sandbox.gameState.marketplace = opzioni.marketplace ? [...opzioni.marketplace] : [];
    env.sandbox.gameState.npcMarket = opzioni.npcMarket ? [...opzioni.npcMarket] : [];

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        syncedCash,
        dcSpends,
        serverCalls,
    };
}

describe('Funzione Flotta — Collaudo Profondo ed Esecuzione', () => {

    describe('1. Riparazione Carrozzeria e Motore (payToRepairCar, repairEngine, instantRepairDC, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('payToRepairCar ripara la carrozzeria al 100% e addebita il prezzo esatto di repairCostFor', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            const expectedCost = sandbox.repairCostFor(car);
            const cashPrima = gs.cash;

            await sandbox.payToRepairCar('c_dmg_1');

            assert.equal(car.condition, 100, 'la condizione deve tornare al 100%');
            assert.equal(gs.cash, cashPrima - expectedCost, 'il cash deve scalare esattamente del costo calcolato da repairCostFor');
            assert.ok(serverCalls.some(c => c.action === 'repairVehicle' && c.cost === expectedCost));
        });

        test('payToRepairCar con Kasko (inv_kasko) addebita il costo ordinario senza regalarlo', async () => {
            const { sandbox, gs } = amb;
            gs.investments.push('inv_kasko');
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            const expectedCost = sandbox.repairCostFor(car);
            const cashPrima = gs.cash;

            await sandbox.payToRepairCar('c_dmg_1');

            assert.equal(car.condition, 100);
            assert.equal(gs.cash, cashPrima - expectedCost, 'la Kasko non azzera l\'usura ordinaria');
        });

        test('payToRepairCar con Contratto di Manutenzione applica lo sconto del 30%', async () => {
            const { sandbox, gs } = amb;
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = gs.day + 5;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            const baseCost = (100 - car.condition) * 85;
            const discountedCost = Math.round(baseCost * 0.70);
            const cashPrima = gs.cash;

            await sandbox.payToRepairCar('c_dmg_1');

            assert.equal(car.condition, 100);
            assert.equal(gs.cash, cashPrima - discountedCost, 'il costo deve beneficiare dello sconto -30%');
        });

        test('payToRepairCar blocca la riparazione se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, env } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.engineHealth = 0;
            const cashPrima = gs.cash;

            await sandbox.payToRepairCar('c_dmg_1');

            assert.equal(car.condition, 40, 'la condizione non deve cambiare con motore fuso');
            assert.equal(gs.cash, cashPrima, 'nessun addebito se il motore è fuso');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar non addebita nulla se l\'auto è già al 100%', async () => {
            const { sandbox, gs } = amb;
            const cashPrima = gs.cash;

            await sandbox.payToRepairCar('c_std_1');

            assert.equal(gs.cash, cashPrima, 'nessun costo se condizione già al 100%');
        });

        test('payToRepairCar rifiuta se i fondi sono insufficienti', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');

            await sandbox.payToRepairCar('c_dmg_1');

            assert.equal(car.condition, 40);
            assert.equal(gs.cash, 100);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('repairEngine ripara il motore, azzera outOfService e scala il costo calcolato', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.outOfService = 'engine';
            const damage = 100 - car.engineHealth; // 40
            const expectedCost = Math.max(800, damage * 180); // 7200
            const cashPrima = gs.cash;

            await sandbox.repairEngine('c_dmg_1');

            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null, 'outOfService engine deve essere resettato a null');
            assert.equal(gs.cash, cashPrima - expectedCost);
            assert.ok(serverCalls.some(c => c.action === 'repairVehicle' && c.cost === expectedCost));
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Motore di')));
        });

        test('repairEngine rifiuta se il motore è già al 100%', async () => {
            const { sandbox, gs, env } = amb;
            const cashPrima = gs.cash;

            await sandbox.repairEngine('c_std_1');

            assert.equal(gs.cash, cashPrima);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già in perfette condizioni')));
        });

        test('instantRepairDC consuma Driver Coins e ripara istantaneamente carrozzeria e outOfService', () => {
            const { sandbox, gs, dcSpends } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.outOfService = 'condition';
            gs.driverCoins = 10;

            sandbox.instantRepairDC('c_dmg_1');

            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.driverCoins, 8, 'senza pass costa 2 DC');
            assert.deepEqual(dcSpends, [['instant_repair_dc', 2]]);
        });

        test('instantRepairDC con Executive Pass attivo dimezza il costo a 1 DC', () => {
            const { sandbox, gs, dcSpends } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            gs.executivePassActive = true;
            gs.driverCoins = 10;

            sandbox.instantRepairDC('c_dmg_1');

            assert.equal(gs.driverCoins, 9, 'con pass costa 1 DC');
            assert.deepEqual(dcSpends, [['instant_repair_dc', 1]]);
        });

        test('bulkRepairFleet ripara tutti i veicoli danneggiati indicati', async () => {
            const { sandbox, gs } = amb;
            const car1 = gs.fleet.find(c => c.id === 'c_dmg_1');
            const car2 = { id: 'c_dmg_2', name: 'Auto 2', condition: 50, _serverId: 'srv_2' };
            gs.fleet.push(car2);

            await sandbox.bulkRepairFleet(['c_dmg_1', 'c_dmg_2']);

            assert.equal(car1.condition, 100);
            assert.equal(car2.condition, 100);
        });

        test('bulkRepairFleet supporta input serializzato come stringa JSON', async () => {
            const { sandbox, gs } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');

            await sandbox.bulkRepairFleet(JSON.stringify(['c_dmg_1']));

            assert.equal(car.condition, 100);
        });
    });

    describe('2. Rifornimento e Ricarica EV (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel calcola litri e costo, rifornisce a 100 e azzera outOfService fuel', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.fuel = 40;
            car.outOfService = 'fuel';
            gs.fuelPrice = 2.0;

            const fuelNeeded = 100 - 40; // 60
            const litres = fuelNeeded * 0.5; // 30
            const expectedCost = Math.floor(litres * 2.0); // 60
            const cashPrima = gs.cash;

            await sandbox.buyStandardFuel('c_dmg_1');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null, 'outOfService fuel deve essere rimosso');
            assert.equal(gs.cash, cashPrima - expectedCost);
            assert.ok(serverCalls.some(c => c.action === 'refuelVehicle' && c.cost === expectedCost));
        });

        test('buyStandardFuel rifiuta se il serbatoio è già pieno', async () => {
            const { sandbox, gs, env } = amb;
            const cashPrima = gs.cash;

            await sandbox.buyStandardFuel('c_std_1');

            assert.equal(gs.cash, cashPrima);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));
        });

        test('buyStandardFuel rifiuta se il motore è fuso', async () => {
            const { sandbox, gs, env } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.engineHealth = 0;
            const cashPrima = gs.cash;

            await sandbox.buyStandardFuel('c_dmg_1');

            assert.equal(gs.cash, cashPrima);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('buyBlackMarketFuel applica sconto 40% sul carburante standard', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.fuel = 50;
            gs.fuelPrice = 2.0;

            const fuelNeeded = 50;
            const litres = 25;
            const bmPrice = 2.0 * 0.60; // 1.20
            const expectedCost = Math.floor(litres * bmPrice); // 30
            const cashPrima = gs.cash;

            await sandbox.buyBlackMarketFuel('c_dmg_1');

            assert.equal(car.fuel, 100);
            assert.equal(gs.cash, cashPrima - expectedCost);
            assert.ok(serverCalls.some(c => c.action === 'refuelVehicle' && c.cost === expectedCost));
        });

        test('superchargeVehicle ricarica al 100% il veicolo EV, scala €80 e resetta outOfService', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_ev_1');
            const cashPrima = gs.cash;

            await sandbox.superchargeVehicle('c_ev_1');

            assert.equal(car.chargeLevel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, cashPrima - 80);
            assert.ok(serverCalls.some(c => c.action === 'refuelVehicle' && c.cost === 80));
        });

        test('superchargeVehicle rifiuta su veicolo non elettrico o già al 100%', async () => {
            const { sandbox, gs, env } = amb;
            const cashPrima = gs.cash;

            // Auto termica
            await sandbox.superchargeVehicle('c_std_1');
            assert.equal(gs.cash, cashPrima);

            // Auto EV già al 100%
            const ev = gs.fleet.find(c => c.id === 'c_ev_1');
            ev.chargeLevel = 100;
            await sandbox.superchargeVehicle('c_ev_1');
            assert.equal(gs.cash, cashPrima);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già al 100%')));
        });
    });

    describe('3. Pressione Gomme (refillTires)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('refillTires ripristina la pressione a 100, azzera outOfService tires e scala il costo esatto', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_dmg_1');
            car.tirePressure = 60;
            car.outOfService = 'tires';
            const missing = 40;
            const expectedCost = Math.ceil(missing * 0.8); // 32
            const cashPrima = gs.cash;

            await sandbox.refillTires('c_dmg_1');

            assert.equal(car.tirePressure, 100);
            assert.equal(car.outOfService, null, 'outOfService tires deve essere rimosso');
            assert.equal(gs.cash, cashPrima - expectedCost);
            assert.ok(serverCalls.some(c => c.action === 'refillCarTires' && c.cost === expectedCost));
        });

        test('refillTires rifiuta se le gomme sono già a 100', async () => {
            const { sandbox, gs, env } = amb;
            const cashPrima = gs.cash;

            await sandbox.refillTires('c_std_1');

            assert.equal(gs.cash, cashPrima);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('ottimale')));
        });
    });

    describe('4. Deposito Aziendale Carburante e Gomme (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot, emergencyRefuel)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ investments: ['inv_fuel_depot'] });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot acquista carburante fino alla capienza e sincronizza cassa via syncCash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 2000;
            gs.fuelPrice = 2.0;
            gs.fuelTankLevel = 1;

            sandbox.buyFuelForDepot(3000);
            await new Promise(r => setImmediate(r));

            // 3000L * €2.00 = €6.000
            assert.equal(gs.fuelTank, 5000);
            assert.equal(gs.cash, 94000);
            assert.deepEqual(syncedCash, [94000]);
        });

        test('buyFuelForDepot rifiuta se il deposito non è posseduto o è già pieno', async () => {
            const { sandbox, gs, env, syncedCash } = amb;
            gs.investments = []; // nessun deposito

            sandbox.buyFuelForDepot(1000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima')));
        });

        test('getDepotLevelData ritorna le informazioni sul livello corrente', () => {
            const { sandbox, gs } = amb;
            gs.fuelTankLevel = 2;
            const data = sandbox.getDepotLevelData();

            assert.equal(data.level, 2);
            assert.equal(data.capacity, 20000);
            assert.equal(data.priceDiscount, 0.02);
        });

        test('upgradeFuelDepot incrementa il livello della cisterna e scala cash esponenziale', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelTankLevel = 1;
            // Costo lvl 1 -> Math.round(5000 * Math.pow(1, 1.8)) = 5000
            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 95000);
            assert.deepEqual(syncedCash, [95000]);
        });

        test('buyTiresForDepot acquista treni di gomme a €800 cad. e sincronizza via syncCash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.depositoGomme = 2;

            sandbox.buyTiresForDepot(5);
            await new Promise(r => setImmediate(r));

            // 5 * €800 = €4.000
            assert.equal(gs.depositoGomme, 7);
            assert.equal(gs.cash, 96000);
            assert.deepEqual(syncedCash, [96000]);
        });

        test('emergencyRefuel rifornisce tutte le auto con outOfService fuel al triplo della tariffa', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelPrice = 2.0;
            const car1 = gs.fleet.find(c => c.id === 'c_ev_1'); // outOfService fuel
            const car2 = { id: 'c_stop_2', name: 'Auto 2', fuel: 0, outOfService: 'fuel' };
            gs.fleet.push(car2);

            // 2 auto * 80L * (2.0 * 3 = 6.0) = €960
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(car1.fuel, 100);
            assert.equal(car1.outOfService, null);
            assert.equal(car2.fuel, 100);
            assert.equal(car2.outOfService, null);
            assert.equal(gs.cash, 100000 - 960);
            assert.deepEqual(syncedCash, [100000 - 960]);
        });
    });

    describe('5. Contratto di Manutenzione e Strategia Tariffaria (buyMaintenanceContract, setPricingStrategy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyMaintenanceContract attiva lo sconto manutenzione per 7 giorni e scala €10.000', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 15;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 22);
            assert.equal(gs.cash, 90000);
            assert.deepEqual(syncedCash, [90000]);
        });

        test('setPricingStrategy imposta strategie valide ed ignora valori non ammessi', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('strategia_invalida');
            assert.equal(gs.pricingStrategy, 'discount');
        });
    });

    describe('6. Upgrade e Skin Veicoli (buyCARUpgrade, applyVehicleSkin, buyPrototypeCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa upgrade su veicolo e scala cash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const car = gs.fleet.find(c => c.id === 'c_std_1');
            car.upgrades = [];

            // centralina costa 12000
            sandbox.buyCARUpgrade('c_std_1', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.ok(car.upgrades.includes('centralina'));
            assert.equal(gs.cash, 88000);
            assert.deepEqual(syncedCash, [88000]);
        });

        test('buyCARUpgrade rifiuta se l\'upgrade è già installato', async () => {
            const { sandbox, gs, env } = amb;
            const car = gs.fleet.find(c => c.id === 'c_std_1');
            car.upgrades = ['centralina'];
            const cashPrima = gs.cash;

            sandbox.buyCARUpgrade('c_std_1', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashPrima);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));
        });

        test('applyVehicleSkin consuma DC e applica la skin all\'auto', async () => {
            const { sandbox, gs, dcSpends } = amb;
            const car = gs.fleet.find(c => c.id === 'c_std_1');
            gs.driverCoins = 30;

            // matte_black costa 10 DC
            sandbox.applyVehicleSkin('c_std_1', 'matte_black');
            await new Promise(r => setImmediate(r));

            assert.equal(car.skin, 'matte_black');
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(dcSpends, [['vehicle_skin', 10]]);
        });

        test('buyPrototypeCar verifica reputazione, hub EV e corse richieste', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 300000;
            gs.reputation = 4.5;
            gs.hasEVHub = true;

            // proto_van_vip costa 110.000
            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 190000);
            assert.ok(gs.fleet.some(c => c.protoId === 'proto_van_vip'));
            assert.deepEqual(syncedCash, [190000]);
        });

        test('buyPrototypeCar rifiuta se la reputazione è insufficiente', async () => {
            const { sandbox, gs, env, syncedCash } = amb;
            gs.reputation = 2.0; // serve 4.2 per proto_van_vip
            const cashPrima = gs.cash;

            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cashPrima);
            assert.deepEqual(syncedCash, []);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));
        });
    });

    describe('7. Gestione Leasing (terminateLease)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminateLease calcola penale (50% mesi rimanenti), svincola autista e rimuove il veicolo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.assignedCarId = 'c_lease_1';

            // leaseDuration 12, elapsedDays 60 -> remDays 300 -> remMonths 10
            // rate 2000 -> penale = 10 * 2000 * 0.5 = 10.000
            sandbox.terminateLease('c_lease_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 90000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease_1'), false, 'il veicolo deve essere rimosso dalla flotta');
            assert.equal(driver.assignedCarId, null, 'l\'autista assegnato deve essere svincolato');
            assert.deepEqual(syncedCash, [90000]);
        });

        test('terminateLease rifiuta se il giocatore annulla la conferma (confirm = false)', async () => {
            const { sandbox, gs, syncedCash } = amb;
            sandbox.confirm = () => false;

            sandbox.terminateLease('c_lease_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease_1'), true);
            assert.deepEqual(syncedCash, []);
        });

        test('terminateLease non agisce su veicoli di proprietà (isLease: false)', async () => {
            const { sandbox, gs, syncedCash } = amb;

            sandbox.terminateLease('c_std_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs.fleet.some(c => c.id === 'c_std_1'), true);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('8. Mercato NPC e Aste (listCarForSale, cancelListing, buyNpcCar, bidOnAuction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('listCarForSale mette in vendita veicolo e svincola autista libero', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.assignedCarId = 'c_std_1';
            driver.status = 'idle';

            sandbox.listCarForSale('c_std_1', 45000);

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'c_std_1');
            assert.equal(gs.marketplace[0].askPrice, 45000);
            assert.equal(driver.assignedCarId, null, 'autista libero deve essere svincolato');
        });

        test('listCarForSale rifiuta se l\'autista assegnato è occupato (status: busy)', () => {
            const { sandbox, gs, env } = amb;
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.assignedCarId = 'c_std_1';
            driver.status = 'busy';

            sandbox.listCarForSale('c_std_1', 45000);

            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));
        });

        test('listCarForSale rifiuta veicoli in edizione limitata (isLimitedEdition: true)', () => {
            const { sandbox, gs, env } = amb;
            const car = gs.fleet.find(c => c.id === 'c_std_1');
            car.isLimitedEdition = true;

            sandbox.listCarForSale('c_std_1', 45000);

            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));
        });

        test('cancelListing rimuove l\'annuncio dal marketplace', () => {
            const { sandbox, gs } = amb;
            gs.marketplace = [{ id: 'm_123', carId: 'c_std_1', askPrice: 45000 }];

            sandbox.cancelListing('m_123');

            assert.equal(gs.marketplace.length, 0);
        });

        test('buyNpcCar spende cash, aggiunge l\'auto usata alla flotta e la toglie dal mercato NPC', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.npcMarket = [{ id: 'npc_1', name: 'Stellar E-Executive Usata', tier: 'business', price: 25000, condition: 70, mileage: 60000 }];

            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 75000);
            assert.equal(gs.npcMarket.length, 0);
            assert.ok(gs.fleet.some(c => c.name === 'Stellar E-Executive Usata' && c.condition === 70));
            assert.deepEqual(syncedCash, [75000]);
        });

        test('bidOnAuction scala l\'offerta, rimborsa rilanci precedenti e registra il bid', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.activeAuction = { id: 'auc_1', name: 'Auto Esclusiva', currentBid: 30000, playerBid: null };

            // Prima offerta 40k -> cash 60k
            sandbox.bidOnAuction(40000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 60000);
            assert.equal(gs.activeAuction.playerBid, 40000);

            // Rilancio a 50k -> rimborso 40k (cash 100k) poi spesa 50k (cash 50k)
            sandbox.bidOnAuction(50000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.activeAuction.playerBid, 50000);
            assert.deepEqual(syncedCash, [60000, 100000, 50000]);
        });
    });

    describe('9. Conquista Hub e Rientro (buyHub, sellHub, returnToHub, acceptGreyMarket)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub richiede reputazione >= 2.5, scala il costo e aggiunge l\'hub', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.reputation = 3.0;
            // roma_fco: baseFlat 90 -> 50000 + 90 * 200 = 68.000
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 32000);
            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.deepEqual(syncedCash, [32000]);
        });

        test('sellHub rimuove l\'hub e accredita il 60% del valore', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.ownedHubs = ['roma_fco'];
            // 68.000 * 0.60 = 40.800

            sandbox.sellHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 140800);
            assert.equal(gs.ownedHubs.includes('roma_fco'), false);
            assert.deepEqual(syncedCash, [140800]);
        });

        test('returnToHub calcola costi di rientro e mette l\'autista in resting', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const car = gs.fleet.find(c => c.id === 'c_std_1');
            car.currentPoiId = 'milano';
            const driver = gs.drivers.find(d => d.id === 'drv_1');
            driver.assignedCarId = 'c_std_1';
            driver.status = 'idle';

            sandbox.returnToHub('c_std_1');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash < 100000, 'il cash deve scalare per carburante e pedaggi');
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.deepEqual(syncedCash, [gs.cash]);
        });

        test('acceptGreyMarket genera una corsa discreta VIP e risolve l\'email', () => {
            const { sandbox, gs } = amb;
            gs.emails = [{
                id: 'em_grey_1',
                type: 'grey_market',
                status: 'unread',
                greyRideData: { fromId: 'roma', toId: 'milano', price: 4500, isLong: true },
            }];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            assert.equal(gs.pendingRides.length, 1);
            const r = gs.pendingRides[0];
            assert.equal(r.tier, 'vip');
            assert.equal(r.price, 4500);
            assert.equal(r.isGreyMarket, true);
        });
    });

    describe('10. Rendering Schermata Flotta (renderTabFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet disegna l\'intestazione KPI, i filtri e la tabella veicoli', () => {
            const { sandbox } = amb;

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Flotta'));
            assert.ok(c.innerHTML.includes('Stellar E-Executive'));
            assert.ok(c.innerHTML.includes('Stellar V-Carrier'));
            assert.ok(c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(c.innerHTML.includes('Leasing'));
            assert.ok(c.innerHTML.includes('data-ce-act="payToRepairCar"'));
            assert.ok(c.innerHTML.includes('data-ce-act="repairEngine"'));
        });

        test('renderTabFleet con veicoli sequestrati disegna il blocco avvisi', () => {
            const { sandbox, gs } = amb;
            gs.seizedCars = [{ carName: 'Stellar Sequestrata', releaseDay: 15 }];
            gs.day = 10;

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Veicoli Sequestrati'));
            assert.ok(c.innerHTML.includes('Stellar Sequestrata'));
            assert.ok(c.innerHTML.includes('Rilascio fra 5g'));
        });

        test('renderTabFleet tollera _fleetFilter non pre-inizializzato', () => {
            const { sandbox } = amb;
            sandbox._fleetFilter = undefined;
            sandbox.window._fleetFilter = undefined;

            assert.doesNotThrow(() => {
                sandbox.renderTabFleet();
            });
        });
    });
});
