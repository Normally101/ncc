'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo approfondito del modulo Flotta

   Verifica completa e sistematica delle azioni e della logica esposta da:
   - `engine-fleet.js` (superchargeVehicle, refillTires, repairEngine, instantRepairDC,
     buyStandardFuel, buyBlackMarketFuel, buyFuelForDepot, upgradeFuelDepot,
     buyTiresForDepot, emergencyRefuel, getDepotLevelData, buyCARUpgrade,
     returnToHub, buyMaintenanceContract, setPricingStrategy, applyVehicleSkin,
     terminateLease, buyPrototypeCar, buyHub, sellHub, listCarForSale,
     cancelListing, buyNpcCar, bidOnAuction, acceptGreyMarket)
   - `ui-fleet.js` (renderTabFleet, bulkRepairFleet)
   - `engine.js` (payToRepairCar, repairCostFor, sellCar)
   - Integrazione ServerState / CE_money (verifica anti-doppio conteggio,
     corrispondenza esatta tra prezzo mostrato e prezzo addebitato, e gestione errori)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv, createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito per il collaudo della flotta.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const rpcCalls = [];
    const logs = [];
    const notifications = [];

    const env = freshEnv({
        render: true,
        serverState: {
            refuelVehicle: async (id, amount, cost) => {
                rpcCalls.push({ name: 'refuelVehicle', id, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (id, cost) => {
                rpcCalls.push({ name: 'refillCarTires', id, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            repairVehicle: async (id, cost) => {
                rpcCalls.push({ name: 'repairVehicle', id, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (id, price) => {
                rpcCalls.push({ name: 'sellVehicle', id, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sandbox = env.sandbox;
    const gs = sandbox.gameState;

    // Assicura container DOM per rendering
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox,
        gs,
        rpcCalls,
        notifications: env.notifications,
        logs: env.logs,
    };
}

describe('Funzione Flotta — Collaudo completo (engine-fleet.js, ui-fleet.js, engine.js)', () => {

    // ────────────────────────────────────────────────────────────────────────
    // 1. SUPERCHARGER E VEICOLI ELETTRICI (superchargeVehicle)
    // ────────────────────────────────────────────────────────────────────────
    describe('1. Supercharger EV (superchargeVehicle)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ricarica al 100% veicolo EV, ripristina outOfService e scala €80 via ServerState', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const evCar = {
                id: 'c_ev_1', _serverId: 'srv_ev_1', name: 'Volt 3-Urban',
                tier: 'business', vehicleClass: 'volt_3_urban', chargeLevel: 25,
                fuel: 25, outOfService: 'fuel'
            };
            gs.fleet.push(evCar);
            gs.cash = 1000;

            await sandbox.superchargeVehicle('c_ev_1');

            assert.equal(evCar.chargeLevel, 100);
            assert.equal(evCar.outOfService, null);
            assert.equal(gs.cash, 920, '€80 detratti');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 80);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Supercharger')));
        });

        test('rifiuta ricarica se il veicolo non è elettrico', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const gasCar = {
                id: 'c_gas_1', _serverId: 'srv_gas_1', name: 'Stellar E-Executive',
                tier: 'business', vehicleClass: 'stellar_e_exec', chargeLevel: 30, fuel: 30
            };
            gs.fleet.push(gasCar);

            await sandbox.superchargeVehicle('c_gas_1');

            assert.equal(gasCar.chargeLevel, 30);
            assert.equal(rpcCalls.length, 0);
        });

        test('rifiuta ricarica se la batteria è già al 100%', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const evCar = {
                id: 'c_ev_full', _serverId: 'srv_ev_full', name: 'Volt 3-Urban',
                tier: 'business', vehicleClass: 'volt_3_urban', chargeLevel: 100
            };
            gs.fleet.push(evCar);

            await sandbox.superchargeVehicle('c_ev_full');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già al 100%')));
        });

        test('id veicolo inesistente non produce errori né mutazioni', async () => {
            const { sandbox, rpcCalls } = amb;
            await sandbox.superchargeVehicle('veicolo_fantasma');
            assert.equal(rpcCalls.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. PRESSIONE GOMME (refillTires)
    // ────────────────────────────────────────────────────────────────────────
    describe('2. Pressione Gomme (refillTires)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ripristina pressione al 100%, cancella outOfService "tires" e addebita costo', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = {
                id: 'c_tire_1', _serverId: 'srv_tire_1', name: 'Stellar E-Executive',
                tier: 'business', tirePressure: 40, outOfService: 'tires'
            };
            gs.fleet.push(car);
            gs.cash = 2000;

            // missing = 60 -> cost = Math.ceil(60 * 0.8) = 48
            await sandbox.refillTires('c_tire_1');

            assert.equal(car.tirePressure, 100);
            assert.equal(car.outOfService, null, 'outOfService "tires" deve essere azzerato');
            assert.equal(gs.cash, 1952);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'refillCarTires');
            assert.equal(rpcCalls[0].cost, 48);
        });

        test('pressione già al 100% rifiuta l operazione', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car = { id: 'c_tire_ok', _serverId: 'srv_tire_ok', name: 'Auto OK', tirePressure: 100 };
            gs.fleet.push(car);

            await sandbox.refillTires('c_tire_ok');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('ottimale')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. RIPARAZIONE MOTORE (repairEngine)
    // ────────────────────────────────────────────────────────────────────────
    describe('3. Riparazione Motore (repairEngine)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ripara motore danneggiato, azzera outOfService "engine" e scala costo via ServerState', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = {
                id: 'c_eng_1', _serverId: 'srv_eng_1', name: 'Stellar E-Executive',
                tier: 'business', engineHealth: 40, outOfService: 'engine'
            };
            gs.fleet.push(car);
            gs.cash = 20000;

            // damage = 60 -> repairCost = Math.max(800, 60 * 180) = 10800
            await sandbox.repairEngine('c_eng_1');

            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 9200);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'repairVehicle');
            assert.equal(rpcCalls[0].cost, 10800);
        });

        test('motore integro non addebita costi', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car = { id: 'c_eng_ok', _serverId: 'srv_eng_ok', name: 'Auto OK', engineHealth: 100 };
            gs.fleet.push(car);

            await sandbox.repairEngine('c_eng_ok');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('perfette condizioni')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. RIPARAZIONE ISTANTANEA DRIVER COINS (instantRepairDC)
    // ────────────────────────────────────────────────────────────────────────
    describe('4. Riparazione Istantanea DC (instantRepairDC)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ripara istantaneamente a 100% spendendo 2 DC (o 1 DC con Executive Pass)', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_dc_1', name: 'Auto', condition: 30, outOfService: 'crash' };
            gs.fleet.push(car);
            gs.driverCoins = 10;
            gs.executivePassActive = false;

            sandbox.instantRepairDC('c_dc_1');

            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.driverCoins, 8, '2 DC spesi');

            // Con Executive Pass costa 1 DC
            car.condition = 50;
            gs.executivePassActive = true;
            sandbox.instantRepairDC('c_dc_1');
            assert.equal(gs.driverCoins, 7, '1 DC speso con pass');
        });

        test('blocco se DC insufficienti', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c_dc_no', name: 'Auto', condition: 40 };
            gs.fleet.push(car);
            gs.driverCoins = 0;

            sandbox.instantRepairDC('c_dc_no');

            assert.equal(car.condition, 40);
            assert.equal(gs.driverCoins, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. RIFORNIMENTO STANDARD E GASOLIO AGRICOLO (buyStandardFuel, buyBlackMarketFuel)
    // ────────────────────────────────────────────────────────────────────────
    describe('5. Rifornimento Standard e Gasolio Agricolo', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel riempie serbatoio al 100%, azzera outOfService e scala costo', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = { id: 'c_std_f', _serverId: 'srv_sf', name: 'Stellar E-Executive', fuel: 40, engineHealth: 100, outOfService: 'fuel' };
            gs.fleet.push(car);
            gs.fuelPrice = 1.80;
            gs.cash = 1000;

            // fuelNeeded = 60 -> litres = 30 -> cost = Math.floor(30 * 1.80) = 54
            await sandbox.buyStandardFuel('c_std_f');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 946);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 54);
            assert.equal(rpcCalls[0].amount, 30);
        });

        test('buyStandardFuel bloccato se motore fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car = { id: 'c_dead_e', _serverId: 'srv_de', name: 'Stellar', fuel: 20, engineHealth: 0 };
            gs.fleet.push(car);

            await sandbox.buyStandardFuel('c_dead_e');

            assert.equal(car.fuel, 20);
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('buyBlackMarketFuel applica sconto 40% (prezzo x 0.60)', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = { id: 'c_bm_f', _serverId: 'srv_bm', name: 'Stellar E-Executive', fuel: 40, engineHealth: 100 };
            gs.fleet.push(car);
            gs.fuelPrice = 2.00;
            gs.cash = 1000;

            // fuelNeeded = 60 -> litres = 30 -> price = 2.00 * 0.60 = 1.20 -> cost = 36
            await sandbox.buyBlackMarketFuel('c_bm_f');

            assert.equal(car.fuel, 100);
            assert.equal(gs.cash, 964);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].cost, 36);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. DEPOSITO CARBURANTE E GOMME (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot, emergencyRefuel)
    // ────────────────────────────────────────────────────────────────────────
    describe('6. Deposito Carburante e Treni Gomme', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta();
            amb.gs.investments.push('inv_fuel_depot');
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot richiede investimento e acquista fino a capienza', () => {
            const { sandbox, gs } = amb;
            gs.fuelTank = 2000;
            gs.fuelTankCapacity = 10000;
            gs.fuelPrice = 1.85;
            gs.cash = 50000;

            sandbox.buyFuelForDepot(5000);

            assert.equal(gs.fuelTank, 7000);
            // cost = Math.floor(5000 * 1.85) = 9250
            assert.equal(gs.cash, 50000 - 9250);
        });

        test('buyFuelForDepot senza inv_fuel_depot viene bloccato', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = [];

            sandbox.buyFuelForDepot(5000);

            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima il Deposito')));
        });

        test('upgradeFuelDepot potenzia la capacità della cisterna e scala cassa', () => {
            const { sandbox, gs } = amb;
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;
            gs.cash = 20000;

            // Livello 1 -> costo Math.round(5000 * Math.pow(1, 1.8)) = 5000 -> Lv 2 (20.000 L)
            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 15000);
        });

        test('upgradeFuelDepot al livello massimo non esegue upgrade', () => {
            const { sandbox, gs, env } = amb;
            gs.fuelTankLevel = 5;
            gs.cash = 100000;

            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 5);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('massimo')));
        });

        test('buyTiresForDepot incrementa gameState.depositoGomme (€800 per set)', () => {
            const { sandbox, gs } = amb;
            gs.depositoGomme = 2;
            gs.cash = 10000;

            sandbox.buyTiresForDepot(5);

            assert.equal(gs.depositoGomme, 7);
            assert.equal(gs.cash, 10000 - (5 * 800)); // 6000
        });

        test('emergencyRefuel rifornisce tutte le auto ferme al triplo della tariffa', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', fuel: 0, outOfService: 'fuel' },
                { id: 'c2', fuel: 0, outOfService: 'fuel' },
                { id: 'c3', fuel: 100, outOfService: null },
            ];
            gs.fuelPrice = 2.00;
            gs.cash = 20000;

            // 2 auto * 80 L = 160 L -> emergencyPrice = 6.00 -> cost = 960
            sandbox.emergencyRefuel();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
            assert.equal(gs.cash, 20000 - 960);
        });

        test('emergencyRefuel senza auto ferme notifica info', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'c1', fuel: 100, outOfService: null }];

            sandbox.emergencyRefuel();

            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessuna auto ferma')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. UPGRADE VEICOLO (buyCARUpgrade)
    // ────────────────────────────────────────────────────────────────────────
    describe('7. Upgrade Veicolo (buyCARUpgrade)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('installa upgrade valido e spende importo via CE_money', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_upg_1', name: 'Auto', upgrades: [] };
            gs.fleet.push(car);
            gs.cash = 20000;

            /* Il prezzo si legge dal catalogo invece di scriverlo a mano: cosi'
               il test resta vero anche se il prezzo cambia, e non si rompe per
               un numero inventato. */
            const prezzo = sandbox.CAR_UPGRADES.find(u => u.id === 'centralina').price;
            sandbox.buyCARUpgrade('c_upg_1', 'centralina');

            assert.ok(car.upgrades.includes('centralina'));
            assert.equal(gs.cash, 20000 - prezzo);
        });

        test('rifiuta duplicazione di upgrade già presente', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c_upg_dup', name: 'Auto', upgrades: ['centralina'] };
            gs.fleet.push(car);
            gs.cash = 20000;

            sandbox.buyCARUpgrade('c_upg_dup', 'centralina');

            assert.equal(gs.cash, 20000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));
        });

        test('rifiuta upgrade con fondi insufficienti', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_upg_poor', name: 'Auto', upgrades: [] };
            gs.fleet.push(car);
            gs.cash = 1000;

            sandbox.buyCARUpgrade('c_upg_poor', 'centralina');

            assert.equal(car.upgrades.length, 0);
            assert.equal(gs.cash, 1000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 8. RIENTRO ALL'HUB (returnToHub)
    // ────────────────────────────────────────────────────────────────────────
    describe('8. Rientro all\'Hub (returnToHub)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('calcola distanza, addebita pedaggi/carburante e mette autista a riposo', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_hub_1', name: 'Auto', currentPoiId: 'milano' };
            const driver = { id: 'd_1', name: 'Mario', assignedCarId: 'c_hub_1', status: 'idle' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            gs.cash = 5000;

            sandbox.returnToHub('c_hub_1');

            assert.equal(driver.status, 'resting');
            assert.ok(driver.restHoursLeft > 0);
            assert.equal(driver._returning, true);
            assert.ok(gs.cash < 5000, 'costo viaggio addebitato');
        });

        test('autista occupato (busy) blocca il rientro', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c_hub_busy', name: 'Auto', currentPoiId: 'milano' };
            const driver = { id: 'd_busy', name: 'Luigi', assignedCarId: 'c_hub_busy', status: 'busy' };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            sandbox.returnToHub('c_hub_busy');

            assert.equal(driver.status, 'busy');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('non disponibile')));
        });

        test('auto già all Hub di Roma non avvia rientro', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c_roma', name: 'Auto', currentPoiId: 'roma' };
            const driver = { id: 'd_roma', name: 'Paolo', assignedCarId: 'c_roma', status: 'idle' };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            sandbox.returnToHub('c_roma');

            assert.equal(driver.status, 'idle');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già all\'Hub')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9. CONTRATTO MANUTENZIONE (buyMaintenanceContract)
    // ────────────────────────────────────────────────────────────────────────
    describe('9. Contratto di Manutenzione (buyMaintenanceContract)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('attiva contratto per 7 giorni scalando €10.000', () => {
            const { sandbox, gs } = amb;
            gs.day = 5;
            gs.cash = 25000;

            sandbox.buyMaintenanceContract();

            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 12);
            assert.equal(gs.cash, 15000);
        });

        test('fondi insufficienti bloccano l acquisto del contratto', () => {
            const { sandbox, gs } = amb;
            gs.cash = 5000;

            sandbox.buyMaintenanceContract();

            assert.equal(gs.maintenanceContract, false);
            assert.equal(gs.cash, 5000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 10. STRATEGIA TARIFFARIA (setPricingStrategy)
    // ────────────────────────────────────────────────────────────────────────
    describe('10. Strategia Tariffaria (setPricingStrategy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('imposta discount, standard o premium', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('invalida');
            assert.equal(gs.pricingStrategy, 'premium');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 11. SKIN VEICOLO (applyVehicleSkin)
    // ────────────────────────────────────────────────────────────────────────
    describe('11. Skin Veicolo (applyVehicleSkin)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('applica skin spendendo Driver Coins', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_skin_1', name: 'Auto' };
            gs.fleet.push(car);
            gs.driverCoins = 20;

            // Matte Black costa 10 DC
            sandbox.applyVehicleSkin('c_skin_1', 'matte_black');

            assert.equal(car.skin, 'matte_black');
            assert.equal(gs.driverCoins, 10);
        });

        test('DC insufficienti bloccano l applicazione della skin', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_skin_poor', name: 'Auto' };
            gs.fleet.push(car);
            gs.driverCoins = 5;

            sandbox.applyVehicleSkin('c_skin_poor', 'matte_black');

            assert.equal(car.skin, undefined);
            assert.equal(gs.driverCoins, 5);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 12. TERMINAZIONE LEASING (terminateLease)
    // ────────────────────────────────────────────────────────────────────────
    describe('12. Terminazione Leasing (terminateLease)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('termina leasing, scala penale al 50%, disassegna autista e rimuove auto', () => {
            const { sandbox, gs } = amb;
            const car = {
                id: 'c_ls_1', name: 'Audi A6 (Leasing)', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 60, leaseMonthlyRate: 1000
            };
            const driver = { id: 'd_ls', name: 'Autista', assignedCarId: 'c_ls_1' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            gs.cash = 50000;

            // 12*30 - 60 = 300gg -> 10 mesi -> penale = 10 * 1000 * 0.5 = 5000
            sandbox.terminateLease('c_ls_1');

            assert.ok(!gs.fleet.some(c => c.id === 'c_ls_1'));
            assert.equal(driver.assignedCarId, null);
            assert.equal(gs.cash, 45000);
        });

        test('se confirm ritorna false, leasing non viene interrotto', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_ls_abort', name: 'Lease Auto', isLease: true, leaseDuration: 6, leaseMonthlyRate: 800 };
            gs.fleet.push(car);
            gs.cash = 20000;
            sandbox.confirm = () => false;

            sandbox.terminateLease('c_ls_abort');

            assert.ok(gs.fleet.some(c => c.id === 'c_ls_abort'));
            assert.equal(gs.cash, 20000);
        });

        test('veicolo non in leasing viene ignorato', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_own', name: 'Owned Auto', isLease: false };
            gs.fleet.push(car);
            gs.cash = 20000;

            sandbox.terminateLease('c_own');

            assert.ok(gs.fleet.some(c => c.id === 'c_own'));
            assert.equal(gs.cash, 20000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 13. PROTOTIPI ESCLUSIVI (buyPrototypeCar)
    // ────────────────────────────────────────────────────────────────────────
    describe('13. Prototipi Esclusivi (buyPrototypeCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquista prototipo con requisiti soddisfatti e lo inserisce in flotta', () => {
            const { sandbox, gs } = amb;
            const proto = vm.runInContext('PROTOTYPE_CARS[0]', sandbox);
            assert.ok(proto);

            /* I requisiti si prendono dal prototipo stesso: scritti a mano erano
               piu' bassi di quelli veri (1.000 corse, 1,4 milioni) e l'acquisto
               veniva rifiutato — su codice corretto. */
            gs.reputation = proto.reqRep;
            gs.questStats.totalRides = proto.rideGate;
            gs.hasEVHub = true;
            gs.cash = proto.price + 100000;

            sandbox.buyPrototypeCar(proto.id);

            assert.ok(gs.fleet.some(c => c.protoId === proto.id));
            assert.equal(gs.cash, 100000);
        });

        test('rifiuta acquisto se prototipo già in flotta', () => {
            const { sandbox, gs, env } = amb;
            const proto = vm.runInContext('PROTOTYPE_CARS[0]', sandbox);
            gs.fleet.push({ id: 'p_owned', protoId: proto.id });
            gs.reputation = 5.0;
            gs.cash = 500000;

            sandbox.buyPrototypeCar(proto.id);

            assert.equal(gs.cash, 500000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Hai già questo prototipo')));
        });

        test('rifiuta acquisto se reputazione insufficiente', () => {
            const { sandbox, gs, env } = amb;
            const proto = vm.runInContext('PROTOTYPE_CARS[0]', sandbox);
            gs.reputation = 1.0;
            gs.cash = 500000;

            sandbox.buyPrototypeCar(proto.id);

            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 14. CONQUISTA E CESSIONE HUB (buyHub, sellHub)
    // ────────────────────────────────────────────────────────────────────────
    describe('14. Conquista e Cessione Hub (buyHub, sellHub)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub acquista concessione hub (rep >= 2.5) e spende cassa', () => {
            const { sandbox, gs } = amb;
            gs.reputation = 3.0;
            gs.cash = 200000;
            gs.ownedHubs = [];

            sandbox.buyHub('roma_fco');

            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.ok(gs.cash < 200000);
        });

        test('buyHub rifiuta se hub già posseduto o reputazione insufficiente', () => {
            const { sandbox, gs, env } = amb;
            gs.reputation = 2.0;
            gs.cash = 200000;

            sandbox.buyHub('roma_fco');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            gs.reputation = 3.0;
            gs.ownedHubs = ['roma_fco'];
            sandbox.buyHub('roma_fco');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già controllato')));
        });

        test('sellHub cede hub al 60% del valore e accredita cassa', () => {
            const { sandbox, gs } = amb;
            gs.ownedHubs = ['roma_fco'];
            gs.cash = 10000;

            const poi = vm.runInContext('POIS["roma_fco"]', sandbox);
            const expectedRefund = Math.floor((50000 + Math.floor(poi.baseFlat * 200)) * 0.6);

            sandbox.sellHub('roma_fco');

            assert.ok(!gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 10000 + expectedRefund);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 15. MERCATO AUTO NPC (listCarForSale, cancelListing, buyNpcCar)
    // ────────────────────────────────────────────────────────────────────────
    describe('15. Mercato Auto NPC (listCarForSale, cancelListing, buyNpcCar)', () => {
        let amb;
        beforeEach(() => {
            // Per il test del mercato NPC locale, isoliamo l'ambiente caricando senza override P2P
            amb = creaAmbienteFlotta();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyNpcCar acquista auto da npcMarket e la aggiunge alla flotta', () => {
            const { sandbox, gs } = amb;
            gs.npcMarket = [
                { id: 'npc_1', name: 'Stellar E-Executive 2021', tier: 'business', vehicleClass: 'stellar_e_exec', price: 25000, condition: 70, mileage: 40000 }
            ];
            gs.cash = 50000;
            const initialFleet = gs.fleet.length;

            sandbox.buyNpcCar('npc_1');

            assert.equal(gs.fleet.length, initialFleet + 1);
            assert.equal(gs.cash, 25000);
            assert.equal(gs.npcMarket.length, 0);
        });

        test('buyNpcCar rifiuta con fondi insufficienti', () => {
            const { sandbox, gs } = amb;
            gs.npcMarket = [
                { id: 'npc_poor', name: 'Stellar', tier: 'business', price: 40000, condition: 70, mileage: 50000 }
            ];
            gs.cash = 10000;

            sandbox.buyNpcCar('npc_poor');

            assert.equal(gs.npcMarket.length, 1);
            assert.equal(gs.cash, 10000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 16. ASTA LIVE (bidOnAuction)
    // ────────────────────────────────────────────────────────────────────────
    describe('16. Asta Live (bidOnAuction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('piazza offerta valida, scala cassa e aggiorna bid corrente', () => {
            const { sandbox, gs } = amb;
            gs.activeAuction = { id: 'auc_1', name: 'Majestic Spirit', currentBid: 250000, minBid: 250000, playerBid: null };
            gs.cash = 300000;

            sandbox.bidOnAuction(260000);

            assert.equal(gs.activeAuction.currentBid, 260000);
            assert.equal(gs.activeAuction.playerBid, 260000);
            assert.equal(gs.cash, 40000);
        });

        test('rilancio successivo rimborsa la precedente offerta prima di addebitare la nuova', () => {
            const { sandbox, gs } = amb;
            gs.activeAuction = { id: 'auc_2', name: 'Majestic Spirit', currentBid: 260000, minBid: 250000, playerBid: 260000 };
            gs.cash = 40000; // Liquidità residua + 260.000 rimborso = 300.000 disponibile

            sandbox.bidOnAuction(280000);

            assert.equal(gs.activeAuction.currentBid, 280000);
            assert.equal(gs.activeAuction.playerBid, 280000);
            assert.equal(gs.cash, 20000);
        });

        test('offerta troppo bassa o liquidità insufficiente viene rifiutata', () => {
            const { sandbox, gs, env } = amb;
            gs.activeAuction = { id: 'auc_3', name: 'Majestic Spirit', currentBid: 250000, minBid: 250000, playerBid: null };
            gs.cash = 100000;

            // Offerta <= currentBid
            sandbox.bidOnAuction(240000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Offerta troppo bassa')));

            // Liquidità insufficiente
            sandbox.bidOnAuction(260000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Liquidità insufficiente')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 17. RIPARAZIONE CARROZZERIA E SCONTI (payToRepairCar, repairCostFor, Kasko)
    // ────────────────────────────────────────────────────────────────────────
    describe('17. Riparazione Carrozzeria e Sconti (payToRepairCar, repairCostFor)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairCostFor calcola €85/punto con minimo €500', () => {
            const { sandbox } = amb;
            const car1 = { condition: 40 }; // 60 mancanti * 85 = 5100
            assert.equal(sandbox.repairCostFor(car1), 5100);

            const car2 = { condition: 98 }; // 2 mancanti * 85 = 170 -> min 500
            assert.equal(sandbox.repairCostFor(car2), 500);

            const car3 = { condition: 100 };
            assert.equal(sandbox.repairCostFor(car3), 0);
        });

        test('sconti cumulativi moltiplicativi (contratto x0.7, meccanico x0.5, officina x0.8)', () => {
            const { sandbox, gs } = amb;
            const car = { condition: 40 }; // Base: 5100
            gs.day = 1;
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = 10;
            assert.equal(sandbox.repairCostFor(car), 3570); // 5100 * 0.7

            gs.staff.push({ id: 'mech', name: 'Meccanico' });
            assert.equal(sandbox.repairCostFor(car), 1785); // 3570 * 0.5

            gs.investments.push('inv_mobile_workshop');
            assert.equal(sandbox.repairCostFor(car), 1428); // 1785 * 0.8
        });

        test('la Kasko non azzera la riparazione ordinaria', () => {
            const { sandbox, gs } = amb;
            const car = { condition: 30 }; // 70 * 85 = 5950
            gs.investments.push('inv_kasko');
            assert.equal(sandbox.repairCostFor(car), 5950);
        });

        test('payToRepairCar addebita esattamente il prezzo mostrato da repairCostFor', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = { id: 'c_rep_1', _serverId: 'srv_rep_1', name: 'Auto', condition: 50, outOfService: 'crash' };
            gs.fleet.push(car);
            gs.cash = 20000;

            const mostrato = sandbox.repairCostFor(car);
            await sandbox.payToRepairCar('c_rep_1');

            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].cost, mostrato, 'prezzo addebitato deve coincidere col mostrato');
            assert.equal(gs.cash, 20000 - mostrato);
        });

        test('payToRepairCar viene bloccata se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car = { id: 'c_blown', _serverId: 'srv_bl', name: 'Auto', condition: 30, engineHealth: 0 };
            gs.fleet.push(car);
            gs.cash = 20000;

            await sandbox.payToRepairCar('c_blown');

            assert.equal(car.condition, 30);
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 18. RIPARAZIONE DI GRUPPO (bulkRepairFleet)
    // ────────────────────────────────────────────────────────────────────────
    describe('18. Riparazione di Gruppo (bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ripara tutte le auto dell elenco fornite come array', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const c1 = { id: 'c_b1', _serverId: 'srv_b1', name: 'Stellar', condition: 60 };
            const c2 = { id: 'c_b2', _serverId: 'srv_b2', name: 'Stellar', condition: 70 };
            const c3 = { id: 'c_b3', _serverId: 'srv_b3', name: 'Stellar', condition: 100 };
            gs.fleet.push(c1, c2, c3);
            gs.cash = 50000;

            await sandbox.bulkRepairFleet(['c_b1', 'c_b2', 'c_b3']);

            assert.equal(c1.condition, 100);
            assert.equal(c2.condition, 100);
            assert.equal(c3.condition, 100);
            assert.equal(rpcCalls.length, 2, 'solo le 2 auto danneggiate vengono riparate');
        });

        test('supporta parametro passato come stringa JSON (da template ceAct)', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const c1 = { id: 'c_json_1', _serverId: 'srv_j1', name: 'Auto', condition: 80 };
            gs.fleet.push(c1);
            gs.cash = 20000;

            await sandbox.bulkRepairFleet(JSON.stringify(['c_json_1']));

            assert.equal(c1.condition, 100);
            assert.equal(rpcCalls.length, 1);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 19. VENDITA VEICOLO ORDINARIO (sellCar)
    // ────────────────────────────────────────────────────────────────────────
    describe('19. Vendita Veicolo Ordinario (sellCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('vende veicolo, accredita valore via ServerState, libera autista e rimuove auto', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = { id: 'c_sell_1', _serverId: 'srv_sell_1', name: 'Stellar E-Executive', tier: 'business', condition: 100, isLease: false };
            const driver = { id: 'd_sell', name: 'Mario', assignedCarId: 'c_sell_1' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            gs.cash = 10000;

            // baseValue = 35000 -> sellPrice = Math.floor(35000 * 1.0 * 0.7) = 24500
            await sandbox.sellCar('c_sell_1');

            assert.ok(!gs.fleet.some(c => c.id === 'c_sell_1'));
            assert.equal(driver.assignedCarId, null);
            assert.equal(gs.cash, 34500);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'sellVehicle');
            assert.equal(rpcCalls[0].price, 24500);
        });

        test('blocca vendita se auto in leasing o edizione limitata', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const carLease = { id: 'c_l', _serverId: 's_l', name: 'Auto Lease', isLease: true };
            const carLtd = { id: 'c_ltd', _serverId: 's_ltd', name: 'Auto Ltd', isLimitedEdition: true };
            gs.fleet.push(carLease, carLtd);

            await sandbox.sellCar('c_l');
            await sandbox.sellCar('c_ltd');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('limitate non possono essere vendute')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 20. GREY MARKET (acceptGreyMarket)
    // ────────────────────────────────────────────────────────────────────────
    describe('20. Grey Market (acceptGreyMarket)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('converte email grey_market in corsa pending discreta e segna email risolta', () => {
            const { sandbox, gs, env } = amb;
            gs.emails = [
                {
                    id: 'em_grey_1',
                    type: 'grey_market',
                    status: 'unread',
                    greyRideData: { fromId: 'roma_fco', toId: 'roma', price: 1500, isLong: false }
                }
            ];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            const ride = gs.pendingRides.find(r => r.isGreyMarket);
            assert.ok(ride);
            assert.equal(ride.price, 1500);
            assert.equal(ride.tier, 'vip');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Missione discreta')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 21. RENDERING TAB FLOTTA E FILTRI UI (renderTabFleet)
    // ────────────────────────────────────────────────────────────────────────
    describe('21. Rendering Tab Flotta e Filtri UI (renderTabFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderizza KPI bar, box deposito, tabella auto e CTA acquisto', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 80, fuel: 90, tirePressure: 100, engineHealth: 100 },
                { id: 'c2', name: 'Volt 3-Urban', tier: 'business', vehicleClass: 'volt_3_urban', condition: 30, chargeLevel: 50, tirePressure: 40, engineHealth: 60 },
            ];

            sandbox.renderTabFleet();

            const container = sandbox.document.getElementById('tab-container');
            const html = container.innerHTML;

            assert.ok(html.includes('Gestione Flotta'));
            assert.ok(html.includes('Stellar E-Executive'));
            assert.ok(html.includes('Volt 3-Urban'));
            assert.ok(html.includes('Cond. media'));
            assert.ok(html.includes('Acquisto Veicoli'));
            assert.ok(html.includes('Contratto di Manutenzione'));
            assert.ok(html.includes('Conquista Hub'));
        });

        test('filtro marca e categoria restringe i veicoli mostrati', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c_st', name: 'Stellar E-Executive', tier: 'business', condition: 100 },
                { id: 'c_vo', name: 'Volt 3-Urban', tier: 'business', condition: 100 },
                { id: 'c_maj', name: 'Majestic Spirit', tier: 'ultra', condition: 100 },
            ];

            sandbox._fleetFilter = { brand: 'Volt', tier: null };
            sandbox.renderTabFleet();

            let html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Volt 3-Urban'));
            assert.ok(!html.includes('Majestic Spirit'));

            sandbox._fleetFilter = { brand: null, tier: 'ultra' };
            sandbox.renderTabFleet();
            html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Majestic Spirit'));
            assert.ok(!html.includes('Volt 3-Urban'));
        });

        test('flotta vuota mostra messaggio appropriato senza crash', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [];

            assert.doesNotThrow(() => {
                sandbox.renderTabFleet();
            });

            const html = sandbox.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('Gestione Flotta'));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 22. EVENT DELEGATION DOM (ce-actions.js)
    // ────────────────────────────────────────────────────────────────────────
    describe('22. Event Delegation DOM (ce-actions.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ceListCar invoca listCarForSale', () => {
            const { sandbox, gs } = amb;
            let listCarChiamata = null;
            sandbox.listCarForSale = (id, price) => { listCarChiamata = { id, price }; };

            sandbox.ceListCar('c_dom_1', 35000);

            assert.deepEqual(listCarChiamata, { id: 'c_dom_1', price: 35000 });
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 23. CONTROLLO ANTI-DOPPIO CONTEGGIO
    // ────────────────────────────────────────────────────────────────────────
    describe('23. Verifica Anti-Doppio Conteggio', () => {
        test('le azioni ServerState scalano la cassa una sola volta e non duplicano movimenti', async () => {
            const syncedCash = [];
            const amb = creaAmbienteFlotta({
                serverStateOverrides: {
                    syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
                },
            });

            amb.gs.fleet.push({ id: 'c_t', _serverId: 's_t', condition: 40, fuel: 40, engineHealth: 40, tirePressure: 40 });
            amb.gs.cash = 100000;

            await amb.sandbox.payToRepairCar('c_t');
            await amb.sandbox.buyStandardFuel('c_t');
            await amb.sandbox.repairEngine('c_t');
            await amb.sandbox.refillTires('c_t');

            // Tutte le azioni passano dalle RPC dirette, nessuna chiama doppiamente syncCash
            assert.deepEqual(syncedCash, [], 'nessun doppio conteggio con syncCash simultaneo');
            amb.env.stopAllIntervals();
        });
    });
});
