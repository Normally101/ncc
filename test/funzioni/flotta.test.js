'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Verifica approfondita del modulo Gestione Flotta

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js`, `ui-fleet.js` e dai relativi gestori in `ce-actions.js`,
   verificare la coerenza economica (prezzo mostrato == prezzo addebitato),
   la corretta interazione con CE_money / ServerState, la gestione dei casi limite
   (leasing, edizioni limitate, autisti occupati, motore fuso, kasko, outOfService),
   e l'integrità del rendering UI e dei filtri di flotta.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente di gioco completo con flotta predisposta e supporto UI.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const rpcCalls = [];
    const syncedCash = [];
    const dcSpends = [];

    const env = createGameEnv(CORE_FILES, {
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            spendDriverCoins: async (item, n) => {
                dcSpends.push([item, n]);
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            refuelVehicle: async (id, amount, cost) => {
                rpcCalls.push({ action: 'refuelVehicle', id, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (id, cost) => {
                rpcCalls.push({ action: 'refillCarTires', id, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            repairVehicle: async (id, cost) => {
                rpcCalls.push({ action: 'repairVehicle', id, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (id, price) => {
                rpcCalls.push({ action: 'sellVehicle', id, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            ...(opzioni.serverStateOverrides || {})
        }
    });

    // Esegui ui-fleet.js nel contesto sandbox se non già presente
    const uiFleetPath = path.resolve(__dirname, '../../ui-fleet.js');
    if (fs.existsSync(uiFleetPath)) {
        const uiFleetCode = fs.readFileSync(uiFleetPath, 'utf8');
        vm.runInContext(uiFleetCode, env.sandbox, { filename: 'ui-fleet.js' });
    }

    env.sandbox.initGame(true);
    env.stopAllIntervals();

    const gs = env.sandbox.gameState;
    gs.cash = opzioni.cash !== undefined ? opzioni.cash : 200000;
    gs.driverCoins = opzioni.driverCoins !== undefined ? opzioni.driverCoins : 50;
    gs.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    gs.fuelPrice = opzioni.fuelPrice !== undefined ? opzioni.fuelPrice : 2.00;

    // DOM base per il rendering
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs,
        rpcCalls,
        syncedCash,
        dcSpends,
    };
}

describe('Modulo Gestione Flotta — Collaudo Profondo', () => {

    describe('1. Riparazione carrozzeria, motore e DC (payToRepairCar, repairEngine, instantRepairDC, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('prezzo carrozzeria mostrato coincide esattamente con il prezzo addebitato (€85/punto)', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = {
                id: 'car_rep_1', _serverId: 'srv_c1', name: 'Stellar E-Executive',
                condition: 60, tier: 'business', isLease: false, engineHealth: 100
            };
            gs.fleet.push(car);

            const prezzoMostrato = sandbox.repairCostFor(car);
            assert.equal(prezzoMostrato, 3400, '40 punti mancanti × 85 = €3400');

            const cassaPrima = gs.cash;
            await sandbox.payToRepairCar('car_rep_1');

            assert.equal(car.condition, 100);
            assert.equal(gs.cash, cassaPrima - prezzoMostrato);
            const call = rpcCalls.find(c => c.action === 'repairVehicle');
            assert.ok(call);
            assert.equal(call.cost, prezzoMostrato, 'il costo addebitato alla RPC deve coincidere col prezzo mostrato');
        });

        test('la Kasko NON azzera la riparazione ordinaria ma gli sconti combinati si applicano', async () => {
            const { sandbox, gs } = amb;
            const car = {
                id: 'car_rep_2', _serverId: 'srv_c2', name: 'Stellar S-Imperial',
                condition: 50, tier: 'vip', isLease: false, engineHealth: 100
            };
            gs.fleet.push(car);

            // Kasko attiva non riduce l'usura ordinaria
            gs.investments.push('inv_kasko');
            assert.equal(sandbox.repairCostFor(car), 4250, '50 punti × 85 = 4250');

            // Applicazione sconti combinati: contratto manutenzione (-30%), Capo Officina (-50%), Officina Mobile (-20%)
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = gs.day + 5;
            gs.staff.push({ id: 'mech', name: 'Capo Officina', salary: 3000 });
            gs.investments.push('inv_mobile_workshop');

            // 4250 × 0.70 × 0.50 × 0.80 = 1190
            const costoScontato = sandbox.repairCostFor(car);
            assert.equal(costoScontato, 1190);
        });

        test('blocco riparazione carrozzeria se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car = {
                id: 'car_fuso', _serverId: 'srv_fuso', name: 'Auto Fusa',
                condition: 40, tier: 'business', engineHealth: 0, outOfService: 'engine'
            };
            gs.fleet.push(car);

            const cassaPrima = gs.cash;
            await sandbox.payToRepairCar('car_fuso');

            assert.equal(gs.cash, cassaPrima, 'nessun addebito se il motore è fuso');
            assert.equal(car.condition, 40, 'nessuna riparazione effettuata');
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('riparazione motore (repairEngine): ripristina engineHealth, rimuove outOfService e addebita RPC', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = {
                id: 'car_eng_1', _serverId: 'srv_eng1', name: 'Auto Motore Rotto',
                condition: 90, tier: 'business', engineHealth: 30, outOfService: 'engine'
            };
            gs.fleet.push(car);

            // Danno = 70. Costo = Math.max(800, 70 * 180) = 12600
            const cassaPrima = gs.cash;
            await sandbox.repairEngine('car_eng_1');

            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null, 'outOfService deve essere resettato');
            assert.equal(gs.cash, cassaPrima - 12600);
            assert.ok(rpcCalls.some(c => c.action === 'repairVehicle' && c.cost === 12600));
        });

        test('repairEngine non esegue azioni se il motore è già al 100%', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            const car = { id: 'car_eng_ok', _serverId: 'srv_eng_ok', name: 'Auto OK', engineHealth: 100 };
            gs.fleet.push(car);

            await sandbox.repairEngine('car_eng_ok');
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già in perfette condizioni')));
        });

        test('riparazione istantanea DC (instantRepairDC): spende Driver Coins e azzera outOfService', () => {
            const { sandbox, gs, dcSpends } = amb;
            gs.driverCoins = 10;
            gs.executivePassActive = false;
            const car = { id: 'car_dc', name: 'Auto Danneggiata', condition: 30, outOfService: 'condition' };
            gs.fleet.push(car);

            sandbox.instantRepairDC('car_dc');

            assert.equal(gs.driverCoins, 8, 'senza Executive Pass costa 2 DC');
            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
            assert.deepEqual(dcSpends, [['instant_repair_dc', 2]]);
        });

        test('instantRepairDC con Executive Pass attivo costa 1 solo DC', () => {
            const { sandbox, gs, dcSpends } = amb;
            gs.driverCoins = 10;
            gs.executivePassActive = true;
            const car = { id: 'car_dc_exec', name: 'Auto Danneggiata', condition: 30, outOfService: 'condition' };
            gs.fleet.push(car);

            sandbox.instantRepairDC('car_dc_exec');

            assert.equal(gs.driverCoins, 9, 'con Executive Pass attivo costa 1 DC');
            assert.equal(car.condition, 100);
            assert.deepEqual(dcSpends, [['instant_repair_dc', 1]]);
        });

        test('bulkRepairFleet ripara tutti i veicoli danneggiati supportando sia array che stringa JSON', async () => {
            const { sandbox, gs } = amb;
            const c1 = { id: 'car_b1', _serverId: 's1', condition: 80, engineHealth: 100 };
            const c2 = { id: 'car_b2', _serverId: 's2', condition: 70, engineHealth: 100 };
            const c3 = { id: 'car_b3', _serverId: 's3', condition: 100, engineHealth: 100 };
            gs.fleet.push(c1, c2, c3);

            // Test con stringa JSON (come inviato da data-ce-args nei bottoni di gruppo)
            sandbox.bulkRepairFleet(JSON.stringify(['car_b1', 'car_b2', 'car_b3']));
            await new Promise(r => setImmediate(r));

            assert.equal(c1.condition, 100);
            assert.equal(c2.condition, 100);
            assert.equal(c3.condition, 100);
        });
    });

    describe('2. Carburante, Ricarica EV e Gomme (superchargeVehicle, refillTires, buyStandardFuel, buyBlackMarketFuel, emergencyRefuel)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('superchargeVehicle ricarica al 100% solo auto elettriche, sblocca outOfService e addebita €80', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const evCar = {
                id: 'ev_1', _serverId: 'srv_ev1', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban',
                chargeLevel: 20, outOfService: 'fuel', isLease: false
            };
            gs.fleet.push(evCar);

            const cassaPrima = gs.cash;
            await sandbox.superchargeVehicle('ev_1');

            assert.equal(evCar.chargeLevel, 100);
            assert.equal(evCar.outOfService, null);
            assert.equal(gs.cash, cassaPrima - 80);
            assert.ok(rpcCalls.some(c => c.action === 'refuelVehicle' && c.cost === 80));
        });

        test('superchargeVehicle rifiuta veicoli a combustione interna', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const gasCar = {
                id: 'gas_1', _serverId: 'srv_gas1', name: 'Stellar E-Executive', vehicleClass: 'stellar_e_exec',
                fuel: 20, chargeLevel: 20
            };
            gs.fleet.push(gasCar);

            await sandbox.superchargeVehicle('gas_1');
            assert.equal(rpcCalls.length, 0);
            assert.equal(gasCar.chargeLevel, 20);
        });

        test('refillTires ripristina pressione a 100, AZZERA outOfService="tires" e addebita via ServerState', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const car = {
                id: 'car_tire_1', _serverId: 'srv_tire1', name: 'Auto Gomme Basse',
                tirePressure: 30, outOfService: 'tires'
            };
            gs.fleet.push(car);

            // Mancanti = 70 -> cost = Math.ceil(70 * 0.8) = 56
            const cassaPrima = gs.cash;
            await sandbox.refillTires('car_tire_1');

            assert.equal(car.tirePressure, 100);
            assert.equal(car.outOfService, null, 'outOfService "tires" DEVE essere azzerato dopo refillTires');
            assert.equal(gs.cash, cassaPrima - 56);
            assert.ok(rpcCalls.some(c => c.action === 'refillCarTires' && c.cost === 56));
        });

        test('buyStandardFuel rifornisce il serbatoio al distributore al prezzo di mercato', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fuelPrice = 1.90;
            const car = {
                id: 'car_std_fuel', _serverId: 'srv_f1', name: 'Stellar V-Carrier',
                fuel: 40, engineHealth: 100, outOfService: 'fuel'
            };
            gs.fleet.push(car);

            // fuelNeeded = 60 -> litres = 30 -> cost = Math.floor(30 * 1.90) = 57
            const cassaPrima = gs.cash;
            await sandbox.buyStandardFuel('car_std_fuel');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, cassaPrima - 57);
            assert.ok(rpcCalls.some(c => c.action === 'refuelVehicle' && c.amount === 30 && c.cost === 57));
        });

        test('buyBlackMarketFuel applica sconto 40% sul carburante ma rischia danno al motore', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fuelPrice = 2.00;
            const car = {
                id: 'car_bm_fuel', _serverId: 'srv_bm1', name: 'Auto Mercato Nero',
                fuel: 20, engineHealth: 100, outOfService: 'fuel'
            };
            gs.fleet.push(car);

            // fuelNeeded = 80 -> litres = 40 -> price = 2.00 * 0.60 = 1.20 -> cost = 48
            const cassaPrima = gs.cash;
            await sandbox.buyBlackMarketFuel('car_bm_fuel');

            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, cassaPrima - 48);
            assert.ok(rpcCalls.some(c => c.action === 'refuelVehicle' && c.cost === 48));
        });

        test('emergencyRefuel rifornisce tutte le auto ferme per fuel a tariffa 3x emergenza', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelPrice = 1.80;
            gs.cash = 10000;
            const c1 = { id: 'c_stop_1', fuel: 0, outOfService: 'fuel' };
            const c2 = { id: 'c_stop_2', fuel: 2, outOfService: 'fuel' };
            const c3 = { id: 'c_ok', fuel: 80, outOfService: null };
            gs.fleet.push(c1, c2, c3);

            // 2 auto ferme * 80L * (1.80 * 3 = 5.40) = 160 * 5.4 = 864
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(c1.fuel, 100);
            assert.equal(c1.outOfService, null);
            assert.equal(c2.fuel, 100);
            assert.equal(c2.outOfService, null);
            assert.equal(gs.cash, 10000 - 864);
            assert.deepEqual(syncedCash, [9136]);
        });
    });

    describe('3. Deposito Carburante e Gomme (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot, getDepotLevelData)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot richiede investimento inv_fuel_depot e rispetta capienza massima', async () => {
            const { sandbox, gs, env, syncedCash } = amb;

            // Senza investimento fallisce
            gs.investments = [];
            sandbox.buyFuelForDepot(5000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima il Deposito')));

            // Con investimento acquista fino a capienza
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 8000;
            gs.fuelPrice = 2.00;
            gs.cash = 50000;

            // Chiesti 5000L ma spazio disponibile solo 2000L -> costo = 2000 * 2.00 = 4000
            sandbox.buyFuelForDepot(5000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTank, 10000);
            assert.equal(gs.cash, 46000);
            assert.deepEqual(syncedCash, [46000]);
        });

        test('upgradeFuelDepot scala cash e incrementa livello e capienza', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;
            gs.cash = 20000;

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 15000); // Costo lv 1 = 5000
            assert.deepEqual(syncedCash, [15000]);
        });

        test('buyTiresForDepot acquista treni di gomme a €800 cad. per il magazzino aziendale', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 1;
            gs.cash = 10000;

            // 5 set * €800 = €4000
            sandbox.buyTiresForDepot(5);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.depositoGomme, 6);
            assert.equal(gs.cash, 6000);
            assert.deepEqual(syncedCash, [6000]);
        });

        test('getDepotLevelData ritorna le informazioni del livello corrente', () => {
            const { sandbox, gs } = amb;
            gs.fuelTankLevel = 3;
            const lvlData = sandbox.getDepotLevelData();
            assert.equal(lvlData.level, 3);
            assert.equal(lvlData.capacity, 35000);
            assert.equal(lvlData.priceDiscount, 0.05);
        });
    });

    describe('4. Mercato Auto NPC e Compravendita Flotta (listCarForSale, cancelListing, buyNpcCar, sellCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('listCarForSale mette in vendita un veicolo e disassegna l\'autista libero', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'car_sale_1', name: 'Auto da Vendere', isLimitedEdition: false };
            const driver = { id: 'd1', name: 'Mario', assignedCarId: 'car_sale_1', status: 'idle' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            gs.marketplace = [];

            sandbox.listCarForSale('car_sale_1', 45000);

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'car_sale_1');
            assert.equal(gs.marketplace[0].askPrice, 45000);
            assert.equal(driver.assignedCarId, null, 'autista libero deve essere disassegnato');
        });

        test('listCarForSale rifiuta auto in edizione limitata o con autista occupato', () => {
            const { sandbox, gs, env } = amb;
            const limitedCar = { id: 'car_ltd', name: 'CEO Edition', isLimitedEdition: true };
            const busyCar = { id: 'car_busy', name: 'Auto Corsa', isLimitedEdition: false };
            const busyDriver = { id: 'd_busy', name: 'Luigi', assignedCarId: 'car_busy', status: 'busy' };

            gs.fleet.push(limitedCar, busyCar);
            gs.drivers.push(busyDriver);
            gs.marketplace = [];

            sandbox.listCarForSale('car_ltd', 100000);
            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));

            sandbox.listCarForSale('car_busy', 50000);
            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));
        });

        test('cancelListing rimuove l\'annuncio dal marketplace', () => {
            const { sandbox, gs } = amb;
            gs.marketplace = [{ id: 'm_123', carId: 'car_sale_1', askPrice: 45000 }];

            sandbox.cancelListing('m_123');
            assert.equal(gs.marketplace.length, 0);
        });

        test('buyNpcCar acquista auto dal mercato NPC e la inserisce in flotta', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 60000;
            gs.npcMarket = [{ id: 'npc_deal_1', name: 'Stellar E-Executive 2021', tier: 'business', price: 25000, condition: 75, mileage: 50000 }];

            sandbox.buyNpcCar('npc_deal_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 35000);
            assert.equal(gs.npcMarket.length, 0);
            assert.ok(gs.fleet.some(c => c.name === 'Stellar E-Executive 2021' && c.condition === 75));
            assert.deepEqual(syncedCash, [35000]);
        });

        test('sellCar rifiuta veicoli in leasing o limited edition e accredita il ricavo via ServerState', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            const carLease = { id: 'c_l', _serverId: 'sl', isLease: true, condition: 100 };
            const carLtd = { id: 'c_ltd', _serverId: 'sltd', isLimitedEdition: true, condition: 100 };
            const carProp = { id: 'c_p', _serverId: 'sp', tier: 'vip', condition: 100, isLease: false };
            gs.fleet.push(carLease, carLtd, carProp);

            // Blocco leasing e limited
            await sandbox.sellCar('c_l');
            assert.equal(gs.fleet.length, 3);

            await sandbox.sellCar('c_ltd');
            assert.equal(gs.fleet.length, 3);

            // Vendita riuscita auto di proprietà: tier vip base 70000 * 1.0 * 0.7 = 49000
            const cassaPrima = gs.cash;
            await sandbox.sellCar('c_p');

            assert.equal(gs.fleet.some(c => c.id === 'c_p'), false);
            assert.equal(gs.cash, cassaPrima + 49000);
            assert.ok(rpcCalls.some(c => c.action === 'sellVehicle' && c.price === 49000));
        });
    });

    describe('5. Aste Live e Prototipi Esclusivi (bidOnAuction, buyPrototypeCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('bidOnAuction convalida l\'offerta, rimborsa la precedente e sincronizza con CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;
            gs.activeAuction = {
                id: 'auc_live', name: 'Majestic Spirit Presidential',
                minBid: 250000, currentBid: 250000, playerBid: null
            };

            // Offerta iniziale di €300.000 (cassa 100k non basta)
            sandbox.bidOnAuction(300000);
            assert.equal(gs.activeAuction.playerBid, null);

            // Aggiungi cassa sufficiente
            gs.cash = 350000;
            sandbox.bidOnAuction(300000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.equal(gs.activeAuction.playerBid, 300000);
            assert.equal(gs.activeAuction.currentBid, 300000);

            // Rilancio a €340.000: rimborso 300k (cassa -> 350k) poi spesa 340k (cassa -> 10k)
            sandbox.bidOnAuction(340000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.equal(gs.activeAuction.playerBid, 340000);
            assert.deepEqual(syncedCash, [50000, 350000, 10000]);
        });

        test('buyPrototypeCar controlla requisiti reputazione, corse, hub EV e acquista via CE_money', async () => {
            const { sandbox, gs, env, syncedCash } = amb;
            gs.cash = 500000;
            gs.reputation = 3.0;
            gs.questStats = { totalRides: 50 };
            gs.hasEVHub = false;

            // proto_van_vip richiede rep 4.0 -> bloccato
            sandbox.buyPrototypeCar('proto_van_vip');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            // Soddisfa rep ma non EV hub
            gs.reputation = 5.0;
            sandbox.buyPrototypeCar('proto_van_vip');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Hub di Ricarica')));

            // Soddisfa tutti i requisiti: acquisto riuscito
            gs.hasEVHub = true;
            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000 - 110000);
            assert.ok(gs.fleet.some(c => c.protoId === 'proto_van_vip'));
            assert.deepEqual(syncedCash, [390000]);
        });
    });

    describe('6. Leasing, Upgrade, Skin, Hub, Contratti e Altre Azioni Flotta', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminateLease calcola penale 50% mesi residui e rimuove l\'auto dalla flotta', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            const car = {
                id: 'lease_car_1', name: 'Stellar Leasing', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 90, leaseMonthlyRate: 2000
            };
            const driver = { id: 'd_lease', name: 'Paolo', assignedCarId: 'lease_car_1' };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            // remainingDays = 270 -> remainingMonths = 9 -> penalty = 9 * 2000 * 0.5 = 9000
            sandbox.terminateLease('lease_car_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 41000);
            assert.equal(gs.fleet.some(c => c.id === 'lease_car_1'), false);
            assert.equal(driver.assignedCarId, null);
            assert.deepEqual(syncedCash, [41000]);
        });

        test('buyCARUpgrade installa upgrade veicolo e scala il prezzo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 30000;
            const car = { id: 'car_upg_1', name: 'Auto Base', upgrades: [] };
            gs.fleet.push(car);

            // centralina costa €4500
            sandbox.buyCARUpgrade('car_upg_1', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 25500);
            assert.ok(car.upgrades.includes('centralina'));
            assert.deepEqual(syncedCash, [25500]);
        });

        test('applyVehicleSkin applica la skin estetica spendendo Driver Coins', async () => {
            const { sandbox, gs, dcSpends } = amb;
            gs.driverCoins = 30;
            const car = { id: 'car_skin_1', name: 'Auto VIP' };
            gs.fleet.push(car);

            // gold_chrome costa 15 DC
            sandbox.applyVehicleSkin('car_skin_1', 'gold_chrome');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 15);
            assert.equal(car.skin, 'gold_chrome');
            assert.deepEqual(dcSpends, [['vehicle_skin', 15]]);
        });

        test('buyHub e sellHub gestiscono conquista e cessione hub con CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 100000;
            gs.reputation = 3.0;
            gs.ownedHubs = [];

            // Acquisto hub FCO: 50000 + 90 * 200 = 68000
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 32000);
            assert.ok(gs.ownedHubs.includes('roma_fco'));

            // Cessione hub FCO: 60% di 68000 = 40800
            sandbox.sellHub('roma_fco');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 72800);
            assert.equal(gs.ownedHubs.includes('roma_fco'), false);
            assert.deepEqual(syncedCash, [32000, 72800]);
        });

        test('returnToHub calcola carburante e pedaggi e mette l\'autista a riposo per le ore necessarie', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            const car = { id: 'c_milano', currentPoiId: 'milano', upgrades: [] };
            const driver = { id: 'd_milano', name: 'Franco', assignedCarId: 'c_milano', status: 'idle' };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            sandbox.returnToHub('c_milano');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash < 50000);
            assert.equal(driver.status, 'resting');
            assert.ok(driver.restHoursLeft >= 5);
            assert.equal(driver._returning, true);
            assert.deepEqual(syncedCash, [gs.cash]);
        });

        test('buyMaintenanceContract attiva il contratto per 7 giorni scalando €10.000', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 10;
            gs.cash = 40000;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000);
            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 17);
            assert.deepEqual(syncedCash, [30000]);
        });

        test('setPricingStrategy aggiorna la strategia tariffaria tra discount, standard e premium', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('invalid_mode');
            assert.equal(gs.pricingStrategy, 'premium', 'modalità invalida ignorata');
        });

        test('acceptGreyMarket genera la corsa clandestina e risolve l\'email', () => {
            const { sandbox, gs } = amb;
            gs.emails = [{
                id: 'em_grey_1',
                type: 'grey_market',
                status: 'unread',
                greyRideData: { fromId: 'roma', toId: 'milano', price: 15000, isLong: true }
            }];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].isGreyMarket, true);
            assert.equal(gs.pendingRides[0].price, 15000);
        });
    });

    describe('7. Rendering UI Flotta e Filtri (renderTabFleet, ceSetRender, filtri per marca e tier)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet disegna tabella veicoli, badge e KPI operativi', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'f1', name: 'Stellar E-Executive', tier: 'business', condition: 85, fuel: 90, tirePressure: 100, engineHealth: 100, outOfService: null },
                { id: 'f2', name: 'Volt 3-Urban', tier: 'business', condition: 95, chargeLevel: 80, tirePressure: 90, engineHealth: 100, outOfService: null },
            ];

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Flotta'));
            assert.ok(c.innerHTML.includes('Stellar E-Executive'));
            assert.ok(c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(c.innerHTML.includes('2 operativi'));
        });

        test('filtro marca e tier in renderTabFleet funziona con ceSetRender senza virgolette o stringhe null', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'f_st', name: 'Stellar E-Executive', tier: 'business', condition: 90 },
                { id: 'f_vo', name: 'Volt 3-Urban', tier: 'business', condition: 90 },
                { id: 'f_ma', name: 'Majestic Spirit', tier: 'ultra', condition: 90 },
            ];

            sandbox.renderTabFleet();

            // Filtra per brand "Stellar"
            sandbox.ceSetRender('_fleetFilter', 'brand', 'Stellar', 'renderTabFleet');
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Stellar E-Executive'));
            assert.ok(!c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(!c.innerHTML.includes('Majestic Spirit'));

            // Resetta filtro brand a null
            sandbox.ceSetRender('_fleetFilter', 'brand', null, 'renderTabFleet');
            c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(c.innerHTML.includes('Majestic Spirit'));
        });
    });

    describe('8. Integrità Movimenti di Denaro (CE_money vs ServerState)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('le azioni locali sincronizzano cash via CE_money senza doppie risincronizzazioni', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.cash = 50000;
            gs.depositoGomme = 0;

            // buyTiresForDepot passa da CE_money.spend
            sandbox.buyTiresForDepot(2);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 48400);
            assert.equal(syncedCash.length, 1);
            assert.equal(syncedCash[0], 48400);
        });

        test('le azioni RPC aggiornano il cash sul server senza invocare syncCash', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.cash = 50000;
            const car = { id: 'c_srv_test', _serverId: 's_test', name: 'Auto Test', condition: 60, engineHealth: 100 };
            gs.fleet.push(car);

            // payToRepairCar passa dalla RPC repairVehicle
            await sandbox.payToRepairCar('c_srv_test');

            assert.equal(gs.cash, 50000 - 3400);
            assert.deepEqual(syncedCash, [], 'le RPC native non devono scatenare syncCash');
        });
    });
});
