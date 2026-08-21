'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo approfondito del modulo Flotta

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js`, `ui-fleet.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con ServerState / CE_money, la prevenzione del doppio
   conteggio del denaro, i calcoli dei costi (carburante, gomme, riparazioni motore e
   carrozzeria, leasing, hub), la gestione di stati limite (motore fuso, auto in leasing,
   edizioni limitate, autisti occupati) e l'interazione con l'interfaccia utente.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente con mock ServerState e stato flotta predisposto.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const serverRepairCalls = [];
    const serverRefuelCalls = [];
    const serverTireCalls = [];
    const serverSellCalls = [];
    const syncedCash = [];

    const notifications = [];
    const logs = [];
    const env = createGameEnv([...CORE_FILES, 'ui-fleet.js'], {
        render: true,
        serverState: {
            isReady: () => (opzioni.serverReady !== undefined ? opzioni.serverReady : true),
            syncCash: async (v) => {
                syncedCash.push(v);
                if (env.sandbox.gameState) env.sandbox.gameState.cash = v;
                return { success: true, cash: v };
            },
            spendDriverCoins: async () => ({ ok: true }),
            repairVehicle: async (serverId, cost) => {
                serverRepairCalls.push({ serverId, cost });
                if (opzioni.repairFail) return null;
                if (env.sandbox.gameState) env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refuelVehicle: async (serverId, amount, cost) => {
                serverRefuelCalls.push({ serverId, amount, cost });
                if (opzioni.refuelFail) return null;
                if (env.sandbox.gameState) env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (serverId, cost) => {
                serverTireCalls.push({ serverId, cost });
                if (opzioni.tireFail) return null;
                if (env.sandbox.gameState) env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (serverId, price) => {
                serverSellCalls.push({ serverId, price });
                if (opzioni.sellFail) return null;
                if (env.sandbox.gameState) env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    env.sandbox.initGame(true);
    env.stopAllIntervals();

    env.sandbox._realShowNotification = (msg, type) => notifications.push({ msg, type });
    env.sandbox.window._realShowNotification = env.sandbox._realShowNotification;
    env.notifications = notifications;
    env.logs = logs;

    if (opzioni.cash !== undefined) env.sandbox.gameState.cash = opzioni.cash;
    if (opzioni.reputation !== undefined) env.sandbox.gameState.reputation = opzioni.reputation;
    if (opzioni.fleet !== undefined) env.sandbox.gameState.fleet = opzioni.fleet;
    if (opzioni.drivers !== undefined) env.sandbox.gameState.drivers = opzioni.drivers;

    env.sandbox._fleetFilter = { brand: null, tier: null };
    env.sandbox.window._fleetFilter = env.sandbox._fleetFilter;

    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        serverRepairCalls,
        serverRefuelCalls,
        serverTireCalls,
        serverSellCalls,
        syncedCash,
    };
}

describe('Funzione Flotta — Esecuzione e ciclo di vita', () => {

    describe('1. Riparazione Carrozzeria e Prezzi (payToRepairCar, repairCostFor, instantRepairDC)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 50000,
                fleet: [
                    { id: 'c_dam', _serverId: 's_dam', name: 'Stellar E-Executive', tier: 'business', condition: 40, isLease: false, engineHealth: 100, outOfService: 'condition' },
                    { id: 'c_mint', _serverId: 's_mint', name: 'Stellar V-Carrier', tier: 'business', condition: 100, isLease: false, engineHealth: 100, outOfService: null },
                    { id: 'c_eng_broken', _serverId: 's_eng', name: 'Stellar S-Imperial', tier: 'vip', condition: 30, isLease: false, engineHealth: 0, outOfService: 'engine' },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairCostFor calcola €85 per punto mancante con minimo di €500', () => {
            const { sandbox, gs } = amb;
            const carDam = gs.fleet.find(c => c.id === 'c_dam'); // 60 punti mancanti
            assert.equal(sandbox.repairCostFor(carDam), 5100);

            const carMint = gs.fleet.find(c => c.id === 'c_mint'); // 0 punti mancanti
            assert.equal(sandbox.repairCostFor(carMint), 0);

            const carMinor = { condition: 98 }; // 2 punti mancanti -> 170 < 500 -> 500
            assert.equal(sandbox.repairCostFor(carMinor), 500);
        });

        test('repairCostFor cumula sconti: contratto (-30%), Capo Officina (-50%), Officina Mobile (-20%)', () => {
            const { sandbox, gs } = amb;
            const carDam = gs.fleet.find(c => c.id === 'c_dam'); // base: 5100€

            // 1. Contratto di manutenzione: 5100 * 0.70 = 3570
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = gs.day + 5;
            assert.equal(sandbox.repairCostFor(carDam), 3570);

            // 2. Capo Officina: 3570 * 0.50 = 1785
            gs.staff.push({ id: 'mech', name: 'Capo Officina' });
            assert.equal(sandbox.repairCostFor(carDam), 1785);

            // 3. Officina Mobile: 1785 * 0.80 = 1428
            gs.investments.push('inv_mobile_workshop');
            assert.equal(sandbox.repairCostFor(carDam), 1428);
        });

        test('la Kasko NON azzera la riparazione carrozzeria ordinaria (prezzo mostrato == prezzo addebitato)', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;
            gs.investments.push('inv_kasko');
            const carDam = gs.fleet.find(c => c.id === 'c_dam');

            const prezzoMostrato = sandbox.repairCostFor(carDam);
            assert.equal(prezzoMostrato, 5100, 'la Kasko non azzera l usura ordinaria');

            await sandbox.payToRepairCar('c_dam');

            assert.equal(serverRepairCalls.length, 1);
            assert.equal(serverRepairCalls[0].cost, prezzoMostrato, 'il prezzo addebitato deve coincidere con quello mostrato');
            assert.equal(carDam.condition, 100);
            assert.equal(carDam.outOfService, null);
        });

        test('payToRepairCar con motore fuso rifiuta la riparazione e non addebita denaro', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;
            const primaCash = gs.cash;
            const carEngBroken = gs.fleet.find(c => c.id === 'c_eng_broken');

            await sandbox.payToRepairCar('c_eng_broken');

            assert.equal(gs.cash, primaCash, 'nessun addebito se motore fuso');
            assert.equal(carEngBroken.condition, 30, 'la carrozzeria resta invariata');
            assert.equal(serverRepairCalls.length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar con fondi insufficienti blocca l operazione', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;
            gs.cash = 1000; // servono 5100€
            await sandbox.payToRepairCar('c_dam');

            assert.equal(gs.cash, 1000);
            assert.equal(serverRepairCalls.length, 0);
            assert.equal(gs.fleet[0].condition, 40);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('instantRepairDC spende Driver Coins e ripara istantaneamente a 100%', () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 10;
            gs.executivePassActive = false;

            sandbox.instantRepairDC('c_dam');

            assert.equal(gs.driverCoins, 8, 'senza pass costa 2 DC');
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].outOfService, null);

            // Con Executive Pass costa 1 DC
            gs.executivePassActive = true;
            gs.fleet[0].condition = 50;
            sandbox.instantRepairDC('c_dam');

            assert.equal(gs.driverCoins, 7, 'con pass costa 1 DC');
            assert.equal(gs.fleet[0].condition, 100);
        });

        test('instantRepairDC rifiuta se condizione già al 100% o DC insufficienti', () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 10;

            // Condizione già 100%
            sandbox.instantRepairDC('c_mint');
            assert.equal(gs.driverCoins, 10);
            assert.ok(amb.env.notifications.some(n => n.type === 'info' && n.msg.includes('già al 100%')));

            // DC insufficienti (0 DC)
            gs.driverCoins = 0;
            sandbox.instantRepairDC('c_dam');
            assert.equal(gs.fleet[0].condition, 40);
        });
    });

    describe('2. Riparazione Motore e Pressione Gomme (repairEngine, refillTires)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 50000,
                fleet: [
                    { id: 'c1', _serverId: 's1', name: 'Stellar E-Executive', engineHealth: 40, tirePressure: 30, outOfService: 'engine' },
                    { id: 'c2', _serverId: 's2', name: 'Stellar V-Carrier', engineHealth: 100, tirePressure: 100, outOfService: null },
                    { id: 'c3', _serverId: 's3', name: 'Stellar S-Imperial', engineHealth: 100, tirePressure: 20, outOfService: 'tires' },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairEngine calcola costo (Math.max(800, damage * 180)), ripara e rimuove outOfService', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c1');
            // Danno 60% -> 60 * 180 = 10.800€

            await sandbox.repairEngine('c1');

            assert.equal(serverRepairCalls.length, 1);
            assert.equal(serverRepairCalls[0].cost, 10800);
            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 50000 - 10800);
        });

        test('repairEngine rifiuta se il motore è già al 100%', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;
            await sandbox.repairEngine('c2');

            assert.equal(serverRepairCalls.length, 0);
            assert.equal(gs.cash, 50000);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('già in perfette condizioni')));
        });

        test('refillTires ripristina pressione a 100%, cancella outOfService=tires e chiama ServerState.refillCarTires', async () => {
            const { sandbox, gs, serverTireCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c3'); // missing = 80 -> cost = Math.ceil(80 * 0.8) = 64

            await sandbox.refillTires('c3');

            assert.equal(serverTireCalls.length, 1);
            assert.equal(serverTireCalls[0].cost, 64);
            assert.equal(car.tirePressure, 100);
            assert.equal(car.outOfService, null, 'outOfService=tires deve essere azzerato');
            assert.equal(gs.cash, 50000 - 64);
        });

        test('refillTires rifiuta se pressione già al 100%', async () => {
            const { sandbox, gs, serverTireCalls } = amb;
            await sandbox.refillTires('c2');

            assert.equal(serverTireCalls.length, 0);
            assert.equal(gs.cash, 50000);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Pressione gomme ottimale')));
        });
    });

    describe('3. Rifornimento e Supercharger (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 50000,
                fleet: [
                    { id: 'c_gas', _serverId: 's_gas', name: 'Stellar E-Executive', vehicleClass: 'stellar_e_exec', fuel: 20, engineHealth: 100, outOfService: 'fuel' },
                    { id: 'c_full', _serverId: 's_full', name: 'Stellar V-Carrier', vehicleClass: 'stellar_v_carr', fuel: 100, engineHealth: 100, outOfService: null },
                    { id: 'c_broken_gas', _serverId: 's_bg', name: 'Stellar S-Imperial', vehicleClass: 'stellar_s_imp', fuel: 10, engineHealth: 0, outOfService: 'engine' },
                    { id: 'c_ev', _serverId: 's_ev', name: 'Volt 3-Urban', vehicleClass: 'volt_3_urban', chargeLevel: 15, engineHealth: 100, outOfService: 'fuel' },
                ],
            });
            amb.gs.fuelPrice = 2.00;
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel rifornisce al 100%, calcola litri e costo, rimuove outOfService', async () => {
            const { sandbox, gs, serverRefuelCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_gas');
            // needed = 80% -> litres = 40L -> cost = 40 * 2.00 = 80€

            await sandbox.buyStandardFuel('c_gas');

            assert.equal(serverRefuelCalls.length, 1);
            assert.equal(serverRefuelCalls[0].cost, 80);
            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 50000 - 80);
        });

        test('buyStandardFuel rifiuta se serbatoio pieno o motore fuso', async () => {
            const { sandbox, gs, serverRefuelCalls } = amb;

            // Serbatoio pieno
            await sandbox.buyStandardFuel('c_full');
            assert.equal(serverRefuelCalls.length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));

            // Motore fuso
            await sandbox.buyStandardFuel('c_broken_gas');
            assert.equal(serverRefuelCalls.length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('buyBlackMarketFuel applica sconto 40% sul carburante', async () => {
            const { sandbox, gs, serverRefuelCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_gas');
            // needed = 80% -> litres = 40L -> price = 2.00 * 0.60 = 1.20€ -> cost = 48€

            await sandbox.buyBlackMarketFuel('c_gas');

            assert.equal(serverRefuelCalls.length, 1);
            assert.equal(serverRefuelCalls[0].cost, 48);
            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
        });

        test('superchargeVehicle ricarica EV a 100% per €80 e rimuove outOfService', async () => {
            const { sandbox, gs, serverRefuelCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_ev');

            await sandbox.superchargeVehicle('c_ev');

            assert.equal(serverRefuelCalls.length, 1);
            assert.equal(serverRefuelCalls[0].cost, 80);
            assert.equal(car.chargeLevel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(gs.cash, 50000 - 80);
        });

        test('superchargeVehicle rifiuta veicoli a benzina o con carica già al 100%', async () => {
            const { sandbox, serverRefuelCalls } = amb;

            // Veicolo a benzina (non elettrico) -> non fa nulla
            await sandbox.superchargeVehicle('c_gas');
            assert.equal(serverRefuelCalls.length, 0);

            // EV già carico al 100%
            amb.gs.fleet.find(c => c.id === 'c_ev').chargeLevel = 100;
            await sandbox.superchargeVehicle('c_ev');
            assert.equal(serverRefuelCalls.length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Batteria già al 100%')));
        });
    });

    describe('4. Deposito Carburante Aziendale e Gomme (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot, emergencyRefuel)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 50000,
                fleet: [
                    { id: 'c1', fuel: 0, outOfService: 'fuel' },
                    { id: 'c2', fuel: 0, outOfService: 'fuel' },
                ],
            });
            amb.gs.investments = ['inv_fuel_depot'];
            amb.gs.fuelTank = 2000;
            amb.gs.fuelTankCapacity = 10000;
            amb.gs.fuelTankLevel = 1;
            amb.gs.fuelPrice = 2.00;
            amb.gs.depositoGomme = 0;
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot scala cash via CE_money, aumenta fuelTank, rifornisce auto ferme e sincronizza', () => {
            const { sandbox, gs, syncedCash } = amb;
            // Acquista 3000L a €2.00/L = €6000
            // Il serbatoio sale di 3000L (da 2000 a 5000), poi _retryOutOfServiceVehicles() rifornisce
            // le 2 auto ferme (50L ciascuna = 100L totali) portando il deposito a 4900L.
            sandbox.buyFuelForDepot(3000);

            assert.equal(gs.fuelTank, 4900);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
            assert.equal(gs.cash, 44000);
            assert.deepEqual(syncedCash, [44000]);
        });

        test('buyFuelForDepot applica sconti lobby, livello cisterna e perk consorzio/alleanza', () => {
            const { sandbox, gs } = amb;
            gs.activeLobbyLaws = ['law_fuel_subsidy']; // 30% sconto (0.70)
            gs.fuelTankLevel = 3; // Deposito Professionale: 5% sconto (0.95)
            sandbox._allyPerkMult = (t) => (t === 'fuel' ? 0.85 : 1.0); // 15% sconto alleanza

            // Multiplier = 0.70 * 0.95 * 0.85 = 0.56525
            // 1000L * 2.00 * 0.56525 = 1130€
            sandbox.buyFuelForDepot(1000);

            assert.equal(gs.cash, 50000 - 1130);
            assert.equal(gs.fuelTank, 3000);
        });

        test('buyFuelForDepot rifiuta se senza investimento inv_fuel_depot o se serbatoio pieno', () => {
            const { sandbox, gs } = amb;
            gs.investments = [];
            sandbox.buyFuelForDepot(1000);
            assert.equal(gs.fuelTank, 2000);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima')));

            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = gs.fuelTankCapacity;
            sandbox.buyFuelForDepot(1000);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));
        });

        test('upgradeFuelDepot avanza al livello successivo e aggiorna capienza', () => {
            const { sandbox, gs } = amb;
            // Lv 1 -> Lv 2 (Cisterna Doppia, 20.000L): costo Math.round(5000 * 1^1.8) = 5000€
            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 45000);
        });

        test('upgradeFuelDepot rifiuta se già a livello massimo (Lv. 5)', () => {
            const { sandbox, gs } = amb;
            gs.fuelTankLevel = 5;
            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 5);
            assert.equal(gs.cash, 50000);
            assert.ok(amb.env.notifications.some(n => n.type === 'info' && n.msg.includes('massimo')));
        });

        test('buyTiresForDepot acquista treni di gomme a €800 per set', () => {
            const { sandbox, gs } = amb;
            sandbox.buyTiresForDepot(5); // 5 * 800 = 4000€

            assert.equal(gs.depositoGomme, 5);
            assert.equal(gs.cash, 46000);
        });

        test('emergencyRefuel rifornisce tutte le auto ferme a tariffa 3×', () => {
            const { sandbox, gs } = amb;
            // 2 auto * 80L = 160L * (2.00 * 3) = 960€
            sandbox.emergencyRefuel();

            assert.equal(gs.cash, 50000 - 960);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
        });

        test('emergencyRefuel rifiuta se nessuna auto è ferma per carburante', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'c1', fuel: 100, outOfService: null }];

            sandbox.emergencyRefuel();
            assert.equal(gs.cash, 50000);
            assert.ok(amb.env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessuna auto ferma')));
        });
    });

    describe('5. Acquisti Speciali, Mercato NPC e Aste (buyPrototypeCar, buyNpcCar, bidOnAuction)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 1000000,
                reputation: 4.8,
            });
            amb.gs.questStats = { totalRides: 500 };
            amb.gs.hasEVHub = true;
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyPrototypeCar inserisce prototipo nella flotta se requisiti (rep, rideGate, EV) soddisfatti', () => {
            const { sandbox, gs } = amb;
            // PROTOTYPE_CARS è in data.js
            const proto = sandbox.PROTOTYPE_CARS[0];

            sandbox.buyPrototypeCar(proto.id);

            const acquistata = gs.fleet.find(f => f.protoId === proto.id);
            assert.ok(acquistata, 'il prototipo deve essere inserito in flotta');
            assert.equal(acquistata.name, proto.name);
            assert.equal(acquistata.condition, 100);
            assert.equal(acquistata.isLease, false);
            assert.equal(gs.cash, 1000000 - proto.price);
        });

        test('buyPrototypeCar rifiuta se reputazione o rideGate insufficienti o EV Hub mancante', () => {
            const { sandbox, gs } = amb;
            const proto = sandbox.PROTOTYPE_CARS[0];

            // 1. Reputazione insufficiente
            gs.reputation = 1.0;
            sandbox.buyPrototypeCar(proto.id);
            assert.equal(gs.fleet.some(f => f.protoId === proto.id), false);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            // 2. Hub EV mancante per auto elettrica
            gs.reputation = 5.0;
            gs.hasEVHub = false;
            const protoEV = sandbox.PROTOTYPE_CARS.find(p => p.fuel === 'electric') || proto;
            sandbox.buyPrototypeCar(protoEV.id);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Hub di Ricarica')));
        });

        test('buyNpcCar acquista auto usata dal mercato NPC e la inserisce in flotta', () => {
            const { sandbox, gs } = amb;
            gs.npcMarket = [
                { id: 'npc_123', name: 'Stellar E-Executive 2021', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 65, mileage: 80000, price: 20000 },
            ];

            sandbox.buyNpcCar('npc_123');

            assert.equal(gs.cash, 1000000 - 20000);
            assert.equal(gs.npcMarket.length, 0);
            const inFlotta = gs.fleet.find(f => f.name.includes('Stellar E-Executive 2021'));
            assert.ok(inFlotta);
            assert.equal(inFlotta.condition, 65);
            assert.equal(inFlotta.mileage, 80000);
        });

        test('bidOnAuction piazza offerta, rimborsa offerta precedente e addebita la nuova via CE_money', () => {
            const { sandbox, gs } = amb;
            gs.activeAuction = {
                id: 'auc_1',
                name: 'Majestic Spirit Presidential',
                minBid: 250000,
                currentBid: 250000,
                playerBid: null,
            };

            // 1. Prima offerta: 300.000€
            sandbox.bidOnAuction(300000);
            assert.equal(gs.cash, 700000);
            assert.equal(gs.activeAuction.currentBid, 300000);
            assert.equal(gs.activeAuction.playerBid, 300000);

            // 2. Rilancio: 350.000€ -> rimborso 300k, addebito 350k (netto: -50k -> 650k)
            sandbox.bidOnAuction(350000);
            assert.equal(gs.cash, 650000);
            assert.equal(gs.activeAuction.currentBid, 350000);
            assert.equal(gs.activeAuction.playerBid, 350000);
        });

        test('bidOnAuction rifiuta offerta troppo bassa o senza fondi sufficienti', () => {
            const { sandbox, gs } = amb;
            gs.cash = 100000;
            gs.activeAuction = {
                id: 'auc_1',
                name: 'Majestic Spirit Presidential',
                minBid: 250000,
                currentBid: 250000,
                playerBid: null,
            };

            // Offerta inferiore al minimo corrente
            sandbox.bidOnAuction(200000);
            assert.equal(gs.cash, 100000);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Offerta troppo bassa')));

            // Offerta superiore alla disponibilità liquida
            sandbox.bidOnAuction(300000);
            assert.equal(gs.cash, 100000);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Liquidità insufficiente')));
        });
    });

    describe('6. Vendita, Annunci e Risoluzione Leasing (sellCar, listCarForSale, cancelListing, terminateLease)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 50000,
                fleet: [
                    { id: 'c_owned', _serverId: 's_owned', name: 'Stellar E-Executive', tier: 'business', condition: 100, isLease: false },
                    { id: 'c_lease', _serverId: 's_lease', name: 'Volt 3-Urban (Leasing)', tier: 'business', isLease: true, leaseDuration: 12, leaseElapsedDays: 60, leaseMonthlyRate: 800 },
                    { id: 'c_ltd', _serverId: 's_ltd', name: 'Majestic Golden Edition', tier: 'ultra', isLimitedEdition: true, isLease: false },
                ],
                drivers: [
                    { id: 'd1', name: 'Mario Rossi', status: 'busy', assignedCarId: 'c_owned' },
                    { id: 'd2', name: 'Luigi Verdi', status: 'idle', assignedCarId: 'c_lease' },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('sellCar vende auto di proprietà via ServerState.sellVehicle e libera l autista', async () => {
            const { sandbox, gs, serverSellCalls } = amb;
            const car = gs.fleet.find(c => c.id === 'c_owned');
            // Base value business: 35.000€ * (100/100) * 0.7 = 24.500€

            await sandbox.sellCar('c_owned');

            assert.equal(serverSellCalls.length, 1);
            assert.equal(serverSellCalls[0].price, 24500);
            assert.equal(gs.fleet.some(c => c.id === 'c_owned'), false);
            assert.equal(gs.drivers.find(d => d.id === 'd1').assignedCarId, null);
            assert.equal(gs.cash, 50000 + 24500);
        });

        test('sellCar rifiuta veicoli in leasing o in edizione limitata', async () => {
            const { sandbox, gs, serverSellCalls } = amb;

            // Auto in leasing -> ignorata
            await sandbox.sellCar('c_lease');
            assert.equal(serverSellCalls.length, 0);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease'), true);

            // Auto edizione limitata -> bloccata con errore
            await sandbox.sellCar('c_ltd');
            assert.equal(serverSellCalls.length, 0);
            assert.equal(gs.fleet.some(c => c.id === 'c_ltd'), true);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));
        });

        test('listCarForSale blocca auto se autista in servizio (busy), in edizione limitata o in leasing', () => {
            const { sandbox, gs } = amb;

            // 1. Autista in servizio (busy) su c_owned
            sandbox.listCarForSale('c_owned', 30000);
            assert.equal((gs.marketplace || []).length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));

            // 2. Auto in edizione limitata
            sandbox.listCarForSale('c_ltd', 200000);
            assert.equal((gs.marketplace || []).length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));

            // 3. Auto in leasing
            sandbox.listCarForSale('c_lease', 20000);
            assert.equal((gs.marketplace || []).length, 0);
        });

        test('listCarForSale pubblica annuncio per auto libera e cancelListing lo rimuove', () => {
            const { sandbox, gs } = amb;
            gs.drivers.find(d => d.id === 'd1').status = 'idle';

            sandbox.listCarForSale('c_owned', 28000);
            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'c_owned');
            assert.equal(gs.marketplace[0].askPrice, 28000);

            const listingId = gs.marketplace[0].id;
            sandbox.cancelListing(listingId);
            assert.equal(gs.marketplace.length, 0);
            assert.ok(amb.env.notifications.some(n => n.type === 'success' && n.msg.includes('Annuncio rimosso')));
        });

        test('terminateLease calcola penale (50% mesi rimanenti), scala cassa e restituisce auto', () => {
            const { sandbox, gs } = amb;
            // 12 mesi totali = 360g. Trascorsi = 60g -> rimanenti = 300g -> 10 mesi rimanenti.
            // monthly = 800€ -> penale = 10 * 800 * 0.5 = 4000€

            sandbox.terminateLease('c_lease');

            assert.equal(gs.cash, 50000 - 4000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease'), false);
            assert.equal(gs.drivers.find(d => d.id === 'd2').assignedCarId, null);
        });

        test('terminateLease rifiuta se confirm cancellato dall utente o per auto non in leasing', () => {
            const { sandbox, gs } = amb;

            // Auto di proprietà (non leasing)
            sandbox.terminateLease('c_owned');
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.some(c => c.id === 'c_owned'), true);

            // Utente rifiuta il confirm
            sandbox.confirm = () => false;
            sandbox.terminateLease('c_lease');
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.some(c => c.id === 'c_lease'), true);
        });
    });

    describe('7. Tuning, Skin, Hub ed Altre Azioni Flotta (buyCARUpgrade, applyVehicleSkin, buyHub, sellHub, returnToHub)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 100000,
                reputation: 3.5,
                fleet: [
                    { id: 'c1', _serverId: 's1', name: 'Stellar E-Executive', upgrades: [], currentPoiId: 'milano' },
                ],
                drivers: [
                    { id: 'd1', name: 'Paolo Neri', status: 'idle', assignedCarId: 'c1' },
                ],
            });
            amb.gs.unlockedRegions = ['lazio', 'lombardia'];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa upgrade veicolo spendendo denaro via CE_money', () => {
            const { sandbox, gs } = amb;
            const upg = sandbox.CAR_UPGRADES[0]; // es. centralina

            sandbox.buyCARUpgrade('c1', upg.id);

            assert.equal(gs.cash, 100000 - upg.price);
            assert.ok(gs.fleet[0].upgrades.includes(upg.id));

            // Tentativo duplicato bloccato
            sandbox.buyCARUpgrade('c1', upg.id);
            assert.equal(gs.cash, 100000 - upg.price);
            assert.ok(amb.env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));
        });

        test('applyVehicleSkin applica skin estetica spendendo Driver Coins', () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 50;
            const skin = sandbox.VEHICLE_SKINS[0]; // matte_black, cost 10 DC

            sandbox.applyVehicleSkin('c1', skin.id);

            assert.equal(gs.driverCoins, 40);
            assert.equal(gs.fleet[0].skin, skin.id);
        });

        test('buyHub acquista la concessione e sellHub la rivende al 60%', () => {
            const { sandbox, gs } = amb;
            const hub = sandbox.POIS['mil_mxp'];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);

            // Acquisto Hub
            sandbox.buyHub('mil_mxp');
            assert.equal(gs.cash, 100000 - cost);
            assert.ok(gs.ownedHubs.includes('mil_mxp'));

            // Vendita Hub
            const resale = Math.floor(cost * 0.6);
            sandbox.sellHub('mil_mxp');
            assert.equal(gs.cash, 100000 - cost + resale);
            assert.equal(gs.ownedHubs.includes('mil_mxp'), false);
        });

        test('returnToHub sposta autista in rientro verso Roma Hub con calcolo chilometrico e pedaggi', () => {
            const { sandbox, gs } = amb;
            const driver = gs.drivers.find(d => d.id === 'd1');

            sandbox.returnToHub('c1');

            assert.ok(gs.cash < 100000, 'deve aver scalato carburante e pedaggi');
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.ok(driver.restHoursLeft > 0);
        });

        test('acceptGreyMarket inserisce missione clandestina e risolve l email', () => {
            const { sandbox, gs } = amb;
            gs.emails = [
                { id: 'em_grey_1', type: 'grey_market', greyRideData: { fromId: 'roma', toId: 'milano', price: 4500, isLong: true }, status: 'new' },
            ];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            assert.ok(gs.pendingRides.some(r => r.isGreyMarket === true && r.price === 4500));
        });

        test('setPricingStrategy imposta modalità di prezzo', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('sconosciuta');
            assert.equal(gs.pricingStrategy, 'premium', 'non deve accettare modalità non previste');
        });
    });

    describe('8. Rendering Interfaccia Flotta e Filtri (renderTabFleet, ceSetRender, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({
                cash: 50000,
                fleet: [
                    { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 50, fuel: 80, tirePressure: 90, engineHealth: 100, vehicleClass: 'stellar_e_exec' },
                    { id: 'c2', name: 'Stellar E-Executive', tier: 'business', condition: 60, fuel: 90, tirePressure: 100, engineHealth: 100, vehicleClass: 'stellar_e_exec' },
                    { id: 'c3', name: 'Stellar E-Executive', tier: 'business', condition: 70, fuel: 100, tirePressure: 100, engineHealth: 100, vehicleClass: 'stellar_e_exec' },
                    { id: 'c4', name: 'Volt 3-Urban', tier: 'standard', condition: 100, chargeLevel: 100, tirePressure: 100, engineHealth: 100, vehicleClass: 'volt_3_urban' },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet disegna KPI flotta, tabella veicoli e pulsanti d azione', () => {
            const { sandbox } = amb;
            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Flotta'));
            assert.ok(c.innerHTML.includes('Stellar E-Executive'));
            assert.ok(c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(c.innerHTML.includes('Ripara gruppo'), 'con 3+ auto dello stesso modello deve mostrare header gruppo');
        });

        test('filtro produttore e categoria tramite ceSetRender filtrano correttamente i veicoli', () => {
            const { sandbox } = amb;

            // Filtro marchio: Volt
            sandbox.ceSetRender('_fleetFilter', 'brand', 'Volt', 'renderTabFleet');
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(!c.innerHTML.includes('Stellar E-Executive'));

            // Reset filtro marchio
            sandbox.ceSetRender('_fleetFilter', 'brand', null, 'renderTabFleet');
            c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Stellar E-Executive'));

            // Filtro tier: standard
            sandbox.ceSetRender('_fleetFilter', 'tier', 'standard', 'renderTabFleet');
            c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Volt 3-Urban'));
            assert.ok(!c.innerHTML.includes('Stellar E-Executive'));
        });

        test('bulkRepairFleet ripara tutte le auto danneggiate del gruppo', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;

            await sandbox.bulkRepairFleet(['c1', 'c2', 'c3']);

            assert.equal(serverRepairCalls.length, 3);
            assert.equal(gs.fleet.find(c => c.id === 'c1').condition, 100);
            assert.equal(gs.fleet.find(c => c.id === 'c2').condition, 100);
            assert.equal(gs.fleet.find(c => c.id === 'c3').condition, 100);
        });

        test('interazione click su pulsante Ripara gruppo nel DOM delegato aziona bulkRepairFleet', async () => {
            const { sandbox, gs, serverRepairCalls } = amb;
            sandbox.renderTabFleet();

            const btnRiparaGruppo = sandbox.document.querySelector('button[data-ce-act="bulkRepairFleet"]');
            assert.ok(btnRiparaGruppo, 'il pulsante Ripara gruppo deve esistere nel DOM');

            const rawArgs = btnRiparaGruppo.getAttribute('data-ce-args');
            const parsedArgs = JSON.parse(rawArgs);

            // Invocazione via delegation (come farebbe events.js)
            await sandbox.bulkRepairFleet.apply(btnRiparaGruppo, parsedArgs);

            assert.ok(serverRepairCalls.length >= 3, 'deve aver invocato la riparazione per le 3 auto');
            assert.equal(gs.fleet.find(c => c.id === 'c1').condition, 100);
        });
    });
});
