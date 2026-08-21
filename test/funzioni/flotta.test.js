'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo profondo del modulo Flotta

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js` e `ui-fleet.js`, l'integrazione con ServerState
   e CE_money, la coerenza tra prezzi mostrati e addebitati, la gestione dei
   casi limite (leasing, edizioni limitate, autista occupato, fondi insufficienti),
   il rendering della UI di flotta con filtri e il layer di event delegation.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente di test configurato per il modulo Flotta.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const serverCalls = {
        refuelVehicle: [],
        refillCarTires: [],
        repairVehicle: [],
        sellVehicle: [],
        syncCash: [],
        spendDriverCoins: [],
    };

    const env = freshEnv({
        render: true,
        serverState: {
            refuelVehicle: async (serverId, litres, cost) => {
                serverCalls.refuelVehicle.push({ serverId, litres, cost });
                if (opzioni.refuelError) return null;
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) - cost;
                return { success: true };
            },
            refillCarTires: async (serverId, cost) => {
                serverCalls.refillCarTires.push({ serverId, cost });
                if (opzioni.tireError) return null;
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) - cost;
                return { success: true };
            },
            repairVehicle: async (serverId, cost) => {
                serverCalls.repairVehicle.push({ serverId, cost });
                if (opzioni.repairError) return null;
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) - cost;
                return { success: true };
            },
            sellVehicle: async (serverId, price) => {
                serverCalls.sellVehicle.push({ serverId, price });
                if (opzioni.sellError) return null;
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true };
            },
            syncCash: async (cash) => {
                serverCalls.syncCash.push(cash);
                return { success: true, cash };
            },
            spendDriverCoins: async (item, n) => {
                serverCalls.spendDriverCoins.push({ item, n });
                return { ok: true };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sandbox = env.sandbox;
    const gs = sandbox.gameState;

    // Inizializza cassa e reputazione di default
    gs.cash = opzioni.cash !== undefined ? opzioni.cash : 500000;
    gs.driverCoins = opzioni.driverCoins !== undefined ? opzioni.driverCoins : 50;
    gs.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.5;
    gs.fuelPrice = opzioni.fuelPrice !== undefined ? opzioni.fuelPrice : 1.85;

    // Predisponi flotta iniziale
    if (opzioni.fleet) {
        gs.fleet = opzioni.fleet;
    }

    // Predisponi DOM container
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return { env, sandbox, gs, serverCalls };
}

describe('Funzione Flotta — Collaudo Profondo (engine-fleet.js, ui-fleet.js)', () => {

    /* ========================================================================
       1. RIPARAZIONI (payToRepairCar, repairEngine, instantRepairDC, bulkRepairFleet)
       ======================================================================== */
    describe('1. Riparazioni carrozzeria e motore', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('payToRepairCar ripara la condizione al 100%, azzera outOfService e addebita il costo via ServerState', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_repair_1', _serverId: 'srv_c1', name: 'Mercedes E-Class', tier: 'business', condition: 40, outOfService: 'guasto', isLease: false };
            gs.fleet = [car];
            gs.cash = 100000;

            const costoAtteso = sandbox.repairCostFor(car); // (100 - 40) * 85 = 5100
            assert.equal(costoAtteso, 5100);

            await sandbox.payToRepairCar('c_repair_1');

            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 100000 - 5100);
            assert.equal(serverCalls.repairVehicle.length, 1);
            assert.equal(serverCalls.repairVehicle[0].cost, 5100);
            assert.equal(serverCalls.repairVehicle[0].serverId, 'srv_c1');
        });

        test('payToRepairCar applica sconti combinati (contratto -30%, capo officina -50%, officina mobile -20%) e addebita la cifra corretta', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_repair_2', _serverId: 'srv_c2', name: 'BMW Serie 7', tier: 'vip', condition: 50, isLease: false };
            gs.fleet = [car];
            gs.cash = 100000;

            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = gs.day + 5;
            gs.staff = [{ id: 'mech', name: 'Capo Meccanico' }];
            gs.investments = ['inv_mobile_workshop'];

            // Base: 50 * 85 = 4250. Sconti: 4250 * 0.70 * 0.50 * 0.80 = 1190
            const costoScontato = sandbox.repairCostFor(car);
            assert.equal(costoScontato, 1190);

            await sandbox.payToRepairCar('c_repair_2');

            assert.equal(car.condition, 100);
            assert.equal(gs.cash, 100000 - 1190);
            assert.equal(serverCalls.repairVehicle[0].cost, 1190);
        });

        test('la Kasko NON azzera la riparazione ordinaria (prezzo mostrato == prezzo addebitato)', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_kasko', _serverId: 'srv_kasko', name: 'Audi A8', tier: 'vip', condition: 60, isLease: false };
            gs.fleet = [car];
            gs.investments = ['inv_kasko'];
            gs.cash = 50000;

            const prezzoMostrato = sandbox.repairCostFor(car); // 40 * 85 = 3400
            assert.equal(prezzoMostrato, 3400, 'Kasko non deve alterare l usura ordinaria');

            await sandbox.payToRepairCar('c_kasko');

            assert.equal(serverCalls.repairVehicle[0].cost, prezzoMostrato, 'il server deve addebitare lo stesso importo mostrato');
            assert.equal(gs.cash, 50000 - 3400);
        });

        test('payToRepairCar rifiuta la riparazione se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, serverCalls, env } = amb;
            const car = { id: 'c_fuso', _serverId: 'srv_fuso', name: 'Auto Fusa', condition: 30, engineHealth: 0, isLease: false };
            gs.fleet = [car];
            gs.cash = 50000;

            await sandbox.payToRepairCar('c_fuso');

            assert.equal(car.condition, 30, 'la carrozzeria non deve cambiare');
            assert.equal(gs.cash, 50000, 'nessun addebito');
            assert.equal(serverCalls.repairVehicle.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar rifiuta veicolo già al 100% o con fondi insufficienti', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car100 = { id: 'c_ok', _serverId: 'srv_ok', name: 'Auto Perfetta', condition: 100, isLease: false };
            const carPovero = { id: 'c_povero', _serverId: 'srv_pov', name: 'Auto Danneggiata', condition: 20, isLease: false };
            gs.fleet = [car100, carPovero];

            // Auto già al 100%
            await sandbox.payToRepairCar('c_ok');
            assert.equal(serverCalls.repairVehicle.length, 0);

            // Fondi insufficienti
            gs.cash = 100; // Servono 80 * 85 = 6800
            await sandbox.payToRepairCar('c_povero');
            assert.equal(serverCalls.repairVehicle.length, 0);
            assert.equal(carPovero.condition, 20);
        });

        test('repairEngine ripara la salute del motore, azzera outOfService="engine" e addebita il costo corretto', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_eng', _serverId: 'srv_eng', name: 'Maserati Ghibli', engineHealth: 60, outOfService: 'engine', isLease: false };
            gs.fleet = [car];
            gs.cash = 100000;

            // Danno: 40. Costo: Math.max(800, 40 * 180) = 7200
            await sandbox.repairEngine('c_eng');

            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 100000 - 7200);
            assert.equal(serverCalls.repairVehicle.length, 1);
            assert.equal(serverCalls.repairVehicle[0].cost, 7200);
        });

        test('repairEngine rifiuta motore già al 100% o auto inesistente', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const carOk = { id: 'c_eng_ok', _serverId: 'srv_eng_ok', name: 'Auto Motore OK', engineHealth: 100 };
            gs.fleet = [carOk];
            gs.cash = 50000;

            await sandbox.repairEngine('c_eng_ok');
            await sandbox.repairEngine('c_fantasma');

            assert.equal(serverCalls.repairVehicle.length, 0);
            assert.equal(gs.cash, 50000);
        });

        test('instantRepairDC usa i Driver Coins (1 DC con Executive Pass, 2 DC senza) e ripara istantaneamente', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_dc_rep', name: 'Rolls Royce Ghost', condition: 30, outOfService: 'guasto' };
            gs.fleet = [car];
            gs.driverCoins = 10;
            gs.executivePassActive = false;

            sandbox.instantRepairDC('c_dc_rep');
            assert.equal(gs.driverCoins, 8);
            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.deepEqual(serverCalls.spendDriverCoins[0], { item: 'instant_repair_dc', n: 2 });

            // Con Executive Pass attivo costa 1 DC
            car.condition = 50;
            gs.executivePassActive = true;
            sandbox.instantRepairDC('c_dc_rep');
            assert.equal(gs.driverCoins, 7);
            assert.equal(car.condition, 100);
            assert.deepEqual(serverCalls.spendDriverCoins[1], { item: 'instant_repair_dc', n: 1 });
        });

        test('bulkRepairFleet ripara tutte le auto danneggiate fornite (array o stringa JSON)', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car1 = { id: 'c_bulk_1', _serverId: 'srv_b1', name: 'Car 1', condition: 50 };
            const car2 = { id: 'c_bulk_2', _serverId: 'srv_b2', name: 'Car 2', condition: 70 };
            const car3 = { id: 'c_bulk_3', _serverId: 'srv_b3', name: 'Car 3', condition: 100 };
            gs.fleet = [car1, car2, car3];
            gs.cash = 200000;

            // Chiamata con array di ID
            sandbox.bulkRepairFleet(['c_bulk_1', 'c_bulk_2', 'c_bulk_3']);
            await new Promise(r => setImmediate(r));

            assert.equal(car1.condition, 100);
            assert.equal(car2.condition, 100);
            assert.equal(car3.condition, 100);
            assert.equal(serverCalls.repairVehicle.length, 2);

            // Chiamata con stringa JSON (come generata da alcuni template)
            car1.condition = 40;
            sandbox.bulkRepairFleet(JSON.stringify(['c_bulk_1']));
            await new Promise(r => setImmediate(r));
            assert.equal(car1.condition, 100);
        });
    });

    /* ========================================================================
       2. RIFORNIMENTO & GOMME (superchargeVehicle, buyStandardFuel, buyBlackMarketFuel, refillTires)
       ======================================================================== */
    describe('2. Rifornimento energetico e pressione gomme', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('superchargeVehicle ricarica al 100% solo auto elettriche e scala €80', async () => {
            const { sandbox, gs, serverCalls } = amb;
            // Registra un veicolo elettrico a catalogo
            const carEV = { id: 'c_ev_1', _serverId: 'srv_ev1', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban', chargeLevel: 20, outOfService: 'fuel' };
            const carTermica = { id: 'c_gas_1', _serverId: 'srv_gas1', name: 'Mercedes E-Class', vehicleClass: 'mercedes_e', fuel: 20 };
            gs.fleet = [carEV, carTermica];
            gs.cash = 10000;

            await sandbox.superchargeVehicle('c_ev_1');

            assert.equal(carEV.chargeLevel, 100);
            assert.equal(carEV.outOfService, null);
            assert.equal(gs.cash, 10000 - 80);
            assert.equal(serverCalls.refuelVehicle.length, 1);
            assert.equal(serverCalls.refuelVehicle[0].cost, 80);

            // Auto termica rifiutata
            await sandbox.superchargeVehicle('c_gas_1');
            assert.equal(serverCalls.refuelVehicle.length, 1, 'auto non elettrica non deve essere ricaricata');
        });

        test('buyStandardFuel rifornisce il serbatoio, azzera outOfService="fuel" e calcola i litri esatti', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_std_fuel', _serverId: 'srv_f1', name: 'Lancia Thema', fuel: 40, engineHealth: 100, outOfService: 'fuel' };
            gs.fleet = [car];
            gs.fuelPrice = 2.0;
            gs.cash = 50000;

            // Fuel needed: 60%. Litres: 60 * 0.5 = 30L. Cost: 30 * 2.0 = 60€
            await sandbox.buyStandardFuel('c_std_fuel');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 50000 - 60);
            assert.equal(serverCalls.refuelVehicle.length, 1);
            assert.equal(serverCalls.refuelVehicle[0].litres, 30);
            assert.equal(serverCalls.refuelVehicle[0].cost, 60);
        });

        test('buyStandardFuel blocca veicolo con motore fuso o serbatoio già pieno', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const carFuso = { id: 'c_fuso_f', _serverId: 'srv_ff', name: 'Auto Fusa', fuel: 10, engineHealth: 0 };
            const carPieno = { id: 'c_pieno_f', _serverId: 'srv_pf', name: 'Auto Piena', fuel: 100, engineHealth: 100 };
            gs.fleet = [carFuso, carPieno];

            await sandbox.buyStandardFuel('c_fuso_f');
            await sandbox.buyStandardFuel('c_pieno_f');

            assert.equal(serverCalls.refuelVehicle.length, 0);
        });

        test('buyBlackMarketFuel applica sconto 40% sul carburante con rischio danno motore', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_bm_fuel', _serverId: 'srv_bm1', name: 'Alfa Romeo Giulia', fuel: 20, engineHealth: 100, outOfService: 'fuel' };
            gs.fleet = [car];
            gs.fuelPrice = 2.0;
            gs.cash = 50000;

            // Fuel needed: 80%. Litres: 40L. Price discounted: 2.0 * 0.60 = 1.20€/L. Cost: 48€
            await sandbox.buyBlackMarketFuel('c_bm_fuel');

            assert.equal(car.fuel, 100);
            assert.equal(gs.cash, 50000 - 48);
            assert.equal(serverCalls.refuelVehicle[0].cost, 48);
        });

        test('refillTires ripristina la pressione gomme a 100 e scala Math.ceil(missing * 0.8)', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_tires_1', _serverId: 'srv_t1', name: 'Jaguar XF', tirePressure: 50 };
            gs.fleet = [car];
            gs.cash = 10000;

            // Missing: 50. Cost: Math.ceil(50 * 0.8) = 40€
            await sandbox.refillTires('c_tires_1');

            assert.equal(car.tirePressure, 100);
            assert.equal(gs.cash, 10000 - 40);
            assert.equal(serverCalls.refillCarTires.length, 1);
            assert.equal(serverCalls.refillCarTires[0].cost, 40);
        });

        test('refillTires rifiuta gomme già ottimali o auto inesistente', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const carOk = { id: 'c_t_ok', _serverId: 'srv_tok', name: 'Gomme OK', tirePressure: 100 };
            gs.fleet = [carOk];

            await sandbox.refillTires('c_t_ok');
            await sandbox.refillTires('c_fantasma');

            assert.equal(serverCalls.refillCarTires.length, 0);
        });
    });

    /* ========================================================================
       3. DEPOSITO CARBURANTE & GOMME (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot, emergencyRefuel)
       ======================================================================== */
    describe('3. Gestione Deposito Aziendale e Manutenzione Flotta', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot richiede investimento, rispetta capienza e applica sconti (deposito, consorzio, alleanza)', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 20000;
            gs.fuelTank = 15000;
            gs.fuelPrice = 2.0;
            gs.fuelTankLevel = 2; // sconto 2%
            gs.cash = 50000;

            // Richiesti 10.000L ma spazio disponibile solo 5.000L -> actual = 5.000L
            // Sconto 2% -> prezzo 1.96€/L. Costo = 5000 * 1.96 = 9800€
            sandbox.buyFuelForDepot(10000);

            assert.equal(gs.fuelTank, 20000);
            assert.equal(gs.cash, 50000 - 9800);
        });

        test('buyFuelForDepot rifiuta acquisto se manca inv_fuel_depot o se deposito è già pieno', () => {
            const { sandbox, gs } = amb;
            gs.investments = [];
            gs.cash = 50000;

            sandbox.buyFuelForDepot(5000);
            assert.equal(gs.cash, 50000, 'senza investimento non deve spendere');

            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 10000;
            sandbox.buyFuelForDepot(5000);
            assert.equal(gs.cash, 50000, 'a deposito pieno non deve spendere');
        });

        test('upgradeFuelDepot potenzia il livello e la capacità del deposito scalando il costo progressivo', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;
            gs.cash = 50000;

            // Costo Lv1 -> Lv2: Math.round(5000 * Math.pow(1, 1.8)) = 5000€
            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 50000 - 5000);
        });

        test('upgradeFuelDepot non permette potenziamento oltre il livello 5 (MAX)', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 5;
            gs.cash = 100000;

            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 5);
            assert.equal(gs.cash, 100000);
        });

        test('buyTiresForDepot applica il prezzo corretto del pacchetto mostrato in UI (1 set = 800€, 5 set = 3.500€, 10 set = 6.000€)', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 0;
            gs.cash = 50000;

            // 1 set -> 800€
            sandbox.buyTiresForDepot(1);
            assert.equal(gs.depositoGomme, 1);
            assert.equal(gs.cash, 50000 - 800);

            // 5 set -> 3500€ (prezzo bundle mostrato in UI)
            sandbox.buyTiresForDepot(5);
            assert.equal(gs.depositoGomme, 6);
            assert.equal(gs.cash, 50000 - 800 - 3500);

            // 10 set -> 6000€ (prezzo bundle mostrato in UI)
            sandbox.buyTiresForDepot(10);
            assert.equal(gs.depositoGomme, 16);
            assert.equal(gs.cash, 50000 - 800 - 3500 - 6000);
        });

        test('emergencyRefuel rifornisce tutte le auto ferme per carburante a tariffa 3x emergenza', () => {
            const { sandbox, gs } = amb;
            const car1 = { id: 'c_stop_1', fuel: 0, outOfService: 'fuel' };
            const car2 = { id: 'c_stop_2', fuel: 0, outOfService: 'fuel' };
            const car3 = { id: 'c_ok_3', fuel: 80, outOfService: null };
            gs.fleet = [car1, car2, car3];
            gs.fuelPrice = 2.0;
            gs.cash = 50000;

            // 2 auto ferme * 80L * (2.0 * 3) = 960€
            sandbox.emergencyRefuel();

            assert.equal(car1.fuel, 100);
            assert.equal(car1.outOfService, null);
            assert.equal(car2.fuel, 100);
            assert.equal(car2.outOfService, null);
            assert.equal(gs.cash, 50000 - 960);
        });

        test('emergencyRefuel non esegue azioni se non ci sono auto ferme', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'c_ok', fuel: 100, outOfService: null }];
            gs.cash = 50000;

            sandbox.emergencyRefuel();
            assert.equal(gs.cash, 50000);
        });

        test('buyMaintenanceContract spende 10.000€ e attiva contratto per 7 giorni', () => {
            const { sandbox, gs } = amb;
            gs.day = 10;
            gs.cash = 50000;
            gs.maintenanceContract = false;

            sandbox.buyMaintenanceContract();

            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 17);
            assert.equal(gs.cash, 40000);
        });
    });

    /* ========================================================================
       4. CONTRATTI, UPGRADE, SKIN, HUB, PROTOTIPI
       ======================================================================== */
    describe('4. Tuning, Skin, Strategia e Conquista Hub', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa l upgrade sulla vettura e rifiuta installazioni duplicate', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_upg', name: 'Berlina', upgrades: [] };
            gs.fleet = [car];
            gs.cash = 50000;

            // Wifi costa 2500€
            sandbox.buyCARUpgrade('c_upg', 'wifi');

            assert.ok(car.upgrades.includes('wifi'));
            assert.equal(gs.cash, 50000 - 2500);

            // Secondo tentativo rifiutato
            sandbox.buyCARUpgrade('c_upg', 'wifi');
            assert.equal(gs.cash, 50000 - 2500, 'non deve riaddebitare');
            assert.equal(car.upgrades.filter(u => u === 'wifi').length, 1);
        });

        test('setPricingStrategy imposta correttamente la strategia discount/standard/premium', () => {
            const { sandbox, gs } = amb;
            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('strategia_invalida');
            assert.equal(gs.pricingStrategy, 'discount', 'strategia non valida deve essere ignorata');
        });

        test('applyVehicleSkin spende Driver Coins e applica la skin all auto', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_skin_test', name: 'Auto Custom' };
            gs.fleet = [car];
            gs.driverCoins = 30;

            // matte_black costa 10 DC
            sandbox.applyVehicleSkin('c_skin_test', 'matte_black');

            assert.equal(car.skin, 'matte_black');
            assert.equal(gs.driverCoins, 20);
        });

        test('buyHub acquista un hub per 50k + baseFlat*200 e sellHub lo rivende al 60%', () => {
            const { sandbox, gs } = amb;
            gs.cash = 200000;
            gs.reputation = 3.0;
            gs.ownedHubs = [];

            // POIS.roma_fco -> baseFlat 90 -> costo 50000 + 90*200 = 68.000€
            sandbox.buyHub('roma_fco');

            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 200000 - 68000);

            // Rivendita: 68000 * 0.60 = 40.800€
            sandbox.sellHub('roma_fco');

            assert.ok(!gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, (200000 - 68000) + 40800);
        });

        test('buyPrototypeCar verifica reputazione, corse minime e sblocco Hub EV', () => {
            const { sandbox, gs } = amb;
            gs.cash = 500000;
            gs.reputation = 4.8;
            gs.questStats = { totalRides: 500 };
            gs.hasEVHub = true;

            // proto_van_vip (reqRep: 4.5, rideGate: 100, price: 110.000€)
            sandbox.buyPrototypeCar('proto_van_vip');

            assert.ok(gs.fleet.some(c => c.protoId === 'proto_van_vip'));
            assert.equal(gs.cash, 500000 - 110000);

            // Tentativo duplicato bloccato
            sandbox.buyPrototypeCar('proto_van_vip');
            assert.equal(gs.cash, 500000 - 110000);
        });

        test('acceptGreyMarket trasforma un email di grey market in una corsa anonima', () => {
            const { sandbox, gs } = amb;
            gs.emails = [{
                id: 'em_grey_1',
                type: 'grey_market',
                status: 'unread',
                greyRideData: { fromId: 'roma_fco', toId: 'roma_termini', price: 1500, isLong: false },
            }];
            gs.pendingRides = [];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].isGreyMarket, true);
            assert.equal(gs.pendingRides[0].price, 1500);
        });

        test('returnToHub manda l autista a riposo e scala pedaggi/carburante', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_hub_test', currentPoiId: 'milano' };
            const driver = { id: 'd_hub_test', name: 'Marco', assignedCarId: 'c_hub_test', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 50000;

            sandbox.returnToHub('c_hub_test');

            assert.ok(gs.cash < 50000);
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
        });
    });

    /* ========================================================================
       5. LEASING, VENDITA, MERCATO NPC E ASTE
       ======================================================================== */
    describe('5. Leasing, Vendita Usato, Mercato NPC e Aste Live', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminateLease applica penale del 50% sui mesi residui, libera l autista e rimuove l auto', () => {
            const { sandbox, gs } = amb;
            const car = {
                id: 'c_lease_1', name: 'Lease Car', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 60, leaseMonthlyRate: 1000,
            };
            const driver = { id: 'd_lease', assignedCarId: 'c_lease_1', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 50000;

            // 10 mesi rimanenti -> 10 * 1000 * 0.5 = 5000€ penale
            sandbox.terminateLease('c_lease_1');

            assert.equal(gs.cash, 45000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease_1'), false);
            assert.equal(driver.assignedCarId, null);
        });

        test('terminateLease rifiuta se confirm=false o se l auto non è in leasing', () => {
            const { sandbox, gs } = amb;
            const carProprieta = { id: 'c_prop', isLease: false };
            const carLease = { id: 'c_l', isLease: true, leaseDuration: 12, leaseMonthlyRate: 1000 };
            gs.fleet = [carProprieta, carLease];
            gs.cash = 50000;

            // Non in leasing
            sandbox.terminateLease('c_prop');
            assert.equal(gs.cash, 50000);

            // Confirm false
            sandbox.confirm = () => false;
            sandbox.terminateLease('c_l');
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.length, 2);
        });

        test('sellCar vende il veicolo, accredita il valore residuo e libera l autista assegnato', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const car = { id: 'c_sell', _serverId: 'srv_sell', name: 'Maserati', tier: 'business', condition: 80, isLease: false };
            const driver = { id: 'd_sell', assignedCarId: 'c_sell', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 10000;

            // Base value business = 35000 * 0.8 * 0.7 = 19600€
            await sandbox.sellCar('c_sell');

            assert.equal(gs.cash, 10000 + 19600);
            assert.equal(gs.fleet.length, 0);
            assert.equal(driver.assignedCarId, null);
            assert.equal(serverCalls.sellVehicle.length, 1);
            assert.equal(serverCalls.sellVehicle[0].price, 19600);
        });

        test('sellCar rifiuta auto in leasing o in edizione limitata', async () => {
            const { sandbox, gs, serverCalls } = amb;
            const carLease = { id: 'c_l', isLease: true };
            const carLtd = { id: 'c_ltd', isLease: false, isLimitedEdition: true };
            gs.fleet = [carLease, carLtd];
            gs.cash = 50000;

            await sandbox.sellCar('c_l');
            await sandbox.sellCar('c_ltd');

            assert.equal(serverCalls.sellVehicle.length, 0);
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.length, 2);
        });

        test('listCarForSale mette in vendita l auto se l autista è libero ma blocca se è occupato (busy)', () => {
            const { sandbox, gs, env } = amb;
            const carLibera = { id: 'c_free', name: 'Car Libera' };
            const carBusy = { id: 'c_busy', name: 'Car Busy' };
            const driverBusy = { id: 'd_busy', assignedCarId: 'c_busy', status: 'busy' };
            const driverIdle = { id: 'd_idle', assignedCarId: 'c_free', status: 'idle' };

            gs.fleet = [carLibera, carBusy];
            gs.drivers = [driverBusy, driverIdle];
            gs.marketplace = [];

            // Tentativo con autista occupato
            sandbox.listCarForSale('c_busy', 40000);
            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));

            // Successo con autista libero
            sandbox.listCarForSale('c_free', 40000);
            assert.equal(gs.marketplace.length, 1);
            assert.equal(driverIdle.assignedCarId, null, 'autista deve essere liberato');
        });

        test('buyNpcCar acquista un veicolo dal mercato NPC, lo aggiunge alla flotta e rimuove l annuncio', () => {
            const { sandbox, gs } = amb;
            gs.npcMarket = [{ id: 'npc_auto_1', name: 'Mercedes S Usata', tier: 'vip', price: 45000, condition: 85, mileage: 60000 }];
            gs.fleet = [];
            gs.cash = 100000;

            sandbox.buyNpcCar('npc_auto_1');

            assert.equal(gs.cash, 55000);
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].name, 'Mercedes S Usata');
            assert.equal(gs.npcMarket.length, 0);
        });

        test('bidOnAuction rilancia su un asta, rimborsa l offerta precedente e blocca con fondi insufficienti', () => {
            const { sandbox, gs } = amb;
            gs.activeAuction = { id: 'auc_1', name: 'Ferrari Rara', currentBid: 50000, playerBid: null };
            gs.cash = 100000;

            // Prima offerta
            sandbox.bidOnAuction(60000);
            assert.equal(gs.cash, 40000);
            assert.equal(gs.activeAuction.playerBid, 60000);

            // Rilancio (rimborso 60k poi spesa 75k -> cassa netta 25k)
            sandbox.bidOnAuction(75000);
            assert.equal(gs.cash, 25000);
            assert.equal(gs.activeAuction.playerBid, 75000);

            // Offerta troppo alta per i fondi
            sandbox.bidOnAuction(150000);
            assert.equal(gs.activeAuction.playerBid, 75000);
            assert.equal(gs.cash, 25000);
        });
    });

    /* ========================================================================
       6. RENDERING DELLA SCHEDA FLOTTA E FILTRI (renderTabFleet)
       ======================================================================== */
    describe('6. Rendering della scheda e filtri Flotta (renderTabFleet, ui-fleet.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet disegna KPI, tabella auto, stato autista e pulsanti azione', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'f1', name: 'Mercedes E-Class', tier: 'business', condition: 50, fuel: 80, tirePressure: 90, mileage: 12000 },
                { id: 'f2', name: 'BMW Serie 7', tier: 'vip', condition: 100, fuel: 100, tirePressure: 100, mileage: 5000 },
            ];
            gs.drivers = [{ id: 'd1', name: 'Mario Rossi', assignedCarId: 'f1', status: 'idle' }];

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Flotta'));
            assert.ok(c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(c.innerHTML.includes('BMW Serie 7'));
            assert.ok(c.innerHTML.includes('Mario Rossi'));
            assert.ok(c.innerHTML.includes('🔧 €')); // Tasto ripara carrozzeria
        });

        test('filtri per marchio e per categoria aggiornano i risultati renderizzati', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'f1', name: 'Mercedes E-Class', tier: 'business' },
                { id: 'f2', name: 'BMW Serie 7', tier: 'vip' },
            ];

            // Filtro solo Mercedes
            sandbox.ceSetRender('_fleetFilter', 'brand', 'Mercedes', 'renderTabFleet');
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(!c.innerHTML.includes('BMW Serie 7'));

            // Filtro solo VIP
            sandbox.ceSetRender('_fleetFilter', 'brand', null, 'renderTabFleet');
            sandbox.ceSetRender('_fleetFilter', 'tier', 'vip', 'renderTabFleet');
            c = sandbox.document.getElementById('tab-container');
            assert.ok(!c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(c.innerHTML.includes('BMW Serie 7'));
        });

        test('renderTabFleet non va in errore se tab-container non esiste o se _fleetFilter è undefined', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';
            sandbox.window._fleetFilter = undefined;

            assert.doesNotThrow(() => {
                sandbox.renderTabFleet();
            });
        });
    });

    /* ========================================================================
       7. EVENT DELEGATION & AZIONI DOM (events.js, ceAct)
       ======================================================================== */
    describe('7. Event Delegation ed esecuzione azioni dal DOM', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('click sul pulsante di acquisto gomme deposito richiama buyTiresForDepot', () => {
            const { sandbox, gs } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 50000;
            gs.depositoGomme = 0;

            sandbox.renderTabFleet();

            const btn5Tires = sandbox.document.querySelector('button[data-ce-act="buyTiresForDepot"][data-ce-args*="5"]');
            assert.ok(btn5Tires, 'il pulsante +5 set gomme deve esistere nel DOM');

            const args = JSON.parse(btn5Tires.getAttribute('data-ce-args'));
            sandbox.buyTiresForDepot(...args);

            assert.equal(gs.depositoGomme, 5);
            assert.equal(gs.cash, 50000 - 3500);
        });

        test('click su Ripara Gruppo attiva bulkRepairFleet con gli ID corretti', async () => {
            const { sandbox, gs, serverCalls } = amb;
            gs.fleet = [
                { id: 'm1', name: 'Mercedes E-Class', condition: 50 },
                { id: 'm2', name: 'Mercedes E-Class', condition: 60 },
                { id: 'm3', name: 'Mercedes E-Class', condition: 70 },
            ];
            gs.cash = 200000;

            sandbox.renderTabFleet();

            const btnBulk = sandbox.document.querySelector('button[data-ce-act="bulkRepairFleet"]');
            assert.ok(btnBulk, 'il pulsante Ripara Gruppo deve essere renderizzato per 3+ auto dello stesso modello');

            const args = JSON.parse(btnBulk.getAttribute('data-ce-args'));
            sandbox.bulkRepairFleet(...args);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[2].condition, 100);
            assert.equal(serverCalls.repairVehicle.length, 3);
        });
    });
});
