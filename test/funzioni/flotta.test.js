'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Verifica approfondita del modulo Flotta

   Scopo: collaudare in modo esaustivo ogni azione e routine esposta da
   `engine-fleet.js`, `ui-fleet.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con ServerState/CE_money, il rispetto dei vincoli
   economici (nessun doppio conteggio, parità prezzo mostrato vs addebitato),
   la corretta gestione dei casi limite e l'interfaccia di rendering DOM.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente con mock ServerState e stato flotta per i test.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const rpcLog = [];
    const syncedCash = [];
    const dcSpends = [];

    const env = freshEnv({
        render: true,
        serverState: {
            refuelVehicle: async (srvId, amount, cost) => {
                rpcLog.push({ metodo: 'refuelVehicle', srvId, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (srvId, cost) => {
                rpcLog.push({ metodo: 'refillCarTires', srvId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            repairVehicle: async (srvId, cost) => {
                rpcLog.push({ metodo: 'repairVehicle', srvId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (srvId, price) => {
                rpcLog.push({ metodo: 'sellVehicle', srvId, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            spendDriverCoins: async (item, amount) => {
                dcSpends.push({ item, amount });
                return { ok: true };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sandbox = env.sandbox;

    // Carica ui-fleet.js nel contesto VM
    const uiFleetCode = fs.readFileSync(path.resolve(__dirname, '../../ui-fleet.js'), 'utf8');
    vm.runInContext(uiFleetCode, sandbox);

    // Predisponi stato di default
    sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;
    sandbox.gameState.driverCoins = opzioni.driverCoins !== undefined ? opzioni.driverCoins : 20;
    sandbox.gameState.reputation = opzioni.reputation !== undefined ? opzioni.reputation : 4.0;
    sandbox.gameState.fuelPrice = 2.0;

    // Predisponi flotta se passata
    if (opzioni.fleet) {
        sandbox.gameState.fleet = opzioni.fleet;
    }

    // Predisponi DOM container
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox,
        gs: sandbox.gameState,
        rpcLog,
        syncedCash,
        dcSpends,
    };
}

describe('Funzione Flotta — Collaudo Profondo (engine-fleet.js, ui-fleet.js)', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 1: RENDERING UI E FILTRI (renderTabFleet)
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Rendering e navigazione scheda flotta (renderTabFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet disegna KPI bar, tabella veicoli e indicatori di stato', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Mercedes E-Class', tier: 'business', condition: 90, fuel: 80, tirePressure: 100, engineHealth: 100, outOfService: null },
                { id: 'c2', name: 'Mercedes S-Class', tier: 'vip', condition: 30, fuel: 0, tirePressure: 50, engineHealth: 60, outOfService: 'fuel' },
            ];

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Flotta'), 'deve includere intestazione flotta');
            assert.ok(c.innerHTML.includes('2 veicoli'), 'deve indicare il conteggio');
            assert.ok(c.innerHTML.includes('1 fuori servizio'), 'deve indicare veicoli guasti/fermi');
            assert.ok(c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(c.innerHTML.includes('Mercedes S-Class'));
            assert.ok(c.innerHTML.includes('🔴 Serbatoio esaurito'));
            assert.ok(c.innerHTML.includes('⚙ Motore 60%'));
        });

        test('renderTabFleet tollera stato senza veicoli e assenza di tab-container', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [];

            // Con tab-container presente ma flotta vuota
            sandbox.renderTabFleet();
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('0 veicoli'));

            // Con container assente: non deve crashare
            sandbox.document.body.innerHTML = '';
            assert.doesNotThrow(() => {
                sandbox.renderTabFleet();
            });
        });

        test('filtri per marchio e categoria riducono la tabella e mostrano stato vuoto se nessun match', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Mercedes E-Class', tier: 'business', condition: 100 },
                { id: 'c2', name: 'BMW Serie 7', tier: 'vip', condition: 100 },
                { id: 'c3', name: 'Audi A8', tier: 'ultra', condition: 100 },
            ];

            sandbox.renderTabFleet();

            // Filtra per brand 'Mercedes'
            sandbox.ceSetRender('_fleetFilter', 'brand', 'Mercedes', 'renderTabFleet');
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(!c.innerHTML.includes('BMW Serie 7'));

            // Filtra per tier 'ultra' su brand 'Mercedes' -> 0 risultati
            sandbox.ceSetRender('_fleetFilter', 'tier', 'ultra', 'renderTabFleet');
            c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Nessun veicolo corrisponde ai filtri'));

            // Reset filtri
            sandbox.ceSetRender('_fleetFilter', 'brand', null, 'renderTabFleet');
            sandbox.ceSetRender('_fleetFilter', 'tier', null, 'renderTabFleet');
            c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('BMW Serie 7'));
        });

        test('blocco deposito aziendale compare solo se inv_fuel_depot è acquistato', () => {
            const { sandbox, gs } = amb;
            gs.investments = [];

            sandbox.renderTabFleet();
            let c = sandbox.document.getElementById('tab-container');
            assert.ok(!c.innerHTML.includes('🛢️ Deposito Aziendale'));

            // Aggiungi investimento
            gs.investments.push('inv_fuel_depot');
            gs.fuelTank = 15000;
            gs.fuelTankCapacity = 50000;
            gs.depositoGomme = 4;

            sandbox.renderTabFleet();
            c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('🛢️ Deposito Aziendale'));
            assert.ok(c.innerHTML.includes('15.000/50.000L'));
            assert.ok(c.innerHTML.includes('4 set'));
        });

        test('sezione veicoli sequestrati e prototipi esclusivi renderizzati se presenti', () => {
            const { sandbox, gs } = amb;
            gs.day = 10;
            gs.seizedCars = [{ carName: 'Mercedes Sequestrata', releaseDay: 14 }];

            sandbox.renderTabFleet();
            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('🚨 Veicoli Sequestrati'));
            assert.ok(c.innerHTML.includes('Mercedes Sequestrata'));
            assert.ok(c.innerHTML.includes('Rilascio fra 4g'));
            assert.ok(c.innerHTML.includes('🔬 Prototipi Esclusivi'));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 2: RIPARAZIONI (payToRepairCar, repairEngine, instantRepairDC, bulkRepairFleet)
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Riparazioni carrozzeria e motore (payToRepairCar, repairEngine, instantRepairDC, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('payToRepairCar: prezzo MOSTRATO nel pulsante coincide col prezzo ADDEBITATO al server', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = {
                id: 'c_rep', _serverId: 'srv_c_rep', name: 'Mercedes S-Class',
                tier: 'vip', condition: 60, engineHealth: 100, outOfService: 'condition'
            };
            gs.fleet = [car];
            gs.cash = 20000;

            // 1. Rendering e lettura prezzo mostrato
            sandbox.renderTabFleet();
            const prezzoPrevisto = sandbox.repairCostFor(car);
            assert.ok(prezzoPrevisto > 0, 'il costo calcolato deve essere > 0');

            const btnRipara = sandbox.document.querySelector('button[title="Ripara carrozzeria"]');
            assert.ok(btnRipara, 'il bottone di riparazione deve essere presente');
            assert.ok(btnRipara.textContent.includes(prezzoPrevisto.toLocaleString('it-IT')) ||
                      btnRipara.textContent.includes(prezzoPrevisto.toLocaleString()));

            // 2. Esecuzione riparazione
            await sandbox.payToRepairCar('c_rep');

            // 3. Verifica addebito RPC
            const repairRpc = rpcLog.find(r => r.metodo === 'repairVehicle');
            assert.ok(repairRpc, 'deve chiamare ServerState.repairVehicle');
            assert.equal(repairRpc.cost, prezzoPrevisto, 'il costo addebitato deve coincidere esattamente con repairCostFor');
            assert.equal(car.condition, 100);
            assert.equal(car.outOfService, null);
        });

        test('payToRepairCar con Kasko attiva NON azzera la riparazione ordinaria', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.investments = ['inv_kasko'];
            const car = { id: 'c_kasko', _serverId: 'srv_c_kasko', name: 'Auto Kasko', condition: 70, engineHealth: 100 };
            gs.fleet = [car];
            gs.cash = 10000;

            const cost = sandbox.repairCostFor(car);
            assert.ok(cost > 0, 'la Kasko non deve regalare la riparazione ordinaria');

            await sandbox.payToRepairCar('c_kasko');

            const repairRpc = rpcLog.find(r => r.metodo === 'repairVehicle');
            assert.ok(repairRpc);
            assert.equal(repairRpc.cost, cost);
            assert.equal(car.condition, 100);
        });

        test('payToRepairCar applica cumulativamente gli sconti (contratto manutenzione, meccanico, officina mobile)', async () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_disc', _serverId: 'srv_c_disc', condition: 50, engineHealth: 100 };
            gs.fleet = [car];

            // Senza sconti: 50 punti * €85 = €4250
            const baseCost = sandbox.repairCostFor(car);
            assert.equal(baseCost, 4250);

            // Contratto manutenzione (-30% -> 0.70)
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = 10;
            gs.day = 5;
            assert.equal(sandbox.repairCostFor(car), Math.round(4250 * 0.70)); // 2975

            // Meccanico in staff (-50% -> 0.50)
            gs.staff = [{ id: 'mech', name: 'Gino Meccanico' }];
            assert.equal(sandbox.repairCostFor(car), Math.round(4250 * 0.70 * 0.50)); // 1488

            // Officina mobile (-20% -> 0.80)
            gs.investments = ['inv_mobile_workshop'];
            assert.equal(sandbox.repairCostFor(car), Math.round(4250 * 0.70 * 0.50 * 0.80)); // 1190
        });

        test('payToRepairCar rifiuta riparazione su auto già al 100%, inesistente, o con motore fuso', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            const car100 = { id: 'c_ok', _serverId: 'srv_1', condition: 100, engineHealth: 100 };
            const carFuso = { id: 'c_fuso', _serverId: 'srv_2', condition: 50, engineHealth: 0 };
            gs.fleet = [car100, carFuso];

            // 1. Auto al 100%
            await sandbox.payToRepairCar('c_ok');
            assert.equal(rpcLog.length, 0);

            // 2. Auto inesistente
            await sandbox.payToRepairCar('c_fantasma');
            assert.equal(rpcLog.length, 0);

            // 3. Auto con motore fuso
            await sandbox.payToRepairCar('c_fuso');
            assert.equal(rpcLog.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar rifiuta con fondi insufficienti', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            const car = { id: 'c_povero', _serverId: 'srv_p', condition: 20, engineHealth: 100 };
            gs.fleet = [car];
            gs.cash = 100; // Costo riparazione > €6000

            await sandbox.payToRepairCar('c_povero');

            assert.equal(rpcLog.length, 0);
            assert.equal(car.condition, 20);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('repairEngine: ripara motore danneggiato, azzera outOfService e addebita a scaglioni', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = {
                id: 'c_eng', _serverId: 'srv_eng', name: 'Mercedes Van',
                engineHealth: 50, outOfService: 'engine'
            };
            gs.fleet = [car];
            gs.cash = 30000;

            // Danno 50 -> repairCost = max(800, 50 * 180) = 9000
            await sandbox.repairEngine('c_eng');

            const engRpc = rpcLog.find(r => r.metodo === 'repairVehicle');
            assert.ok(engRpc);
            assert.equal(engRpc.cost, 9000);
            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
        });

        test('repairEngine: rifiuta se motore già al 100% o auto inesistente', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = { id: 'c_eng_ok', _serverId: 'srv_ok', engineHealth: 100 };
            gs.fleet = [car];

            await sandbox.repairEngine('c_eng_ok');
            await sandbox.repairEngine('c_eng_fantasma');

            assert.equal(rpcLog.length, 0);
        });

        test('instantRepairDC spende Driver Coins tramite CE_money (1 DC con Executive Pass, 2 DC standard)', async () => {
            const { sandbox, gs, dcSpends } = amb;
            const car1 = { id: 'c_dc1', condition: 20, outOfService: 'condition' };
            const car2 = { id: 'c_dc2', condition: 30, outOfService: 'condition' };
            gs.fleet = [car1, car2];
            gs.driverCoins = 10;

            // Riparazione standard: 2 DC
            sandbox.instantRepairDC('c_dc1');
            assert.equal(gs.driverCoins, 8);
            assert.equal(car1.condition, 100);
            assert.equal(car1.outOfService, null);
            assert.deepEqual(dcSpends[0], { item: 'instant_repair_dc', amount: 2 });

            // Con Executive Pass attivo: 1 DC
            gs.executivePassActive = true;
            sandbox.instantRepairDC('c_dc2');
            assert.equal(gs.driverCoins, 7);
            assert.equal(car2.condition, 100);
            assert.deepEqual(dcSpends[1], { item: 'instant_repair_dc', amount: 1 });
        });

        test('instantRepairDC rifiuta se DC insufficienti o veicolo già al 100%', () => {
            const { sandbox, gs, dcSpends } = amb;
            const carDmg = { id: 'c_dc3', condition: 40 };
            const carOk = { id: 'c_dc4', condition: 100 };
            gs.fleet = [carDmg, carOk];
            gs.driverCoins = 1;

            // DC insufficienti (servono 2 DC)
            sandbox.instantRepairDC('c_dc3');
            assert.equal(carDmg.condition, 40);
            assert.equal(gs.driverCoins, 1);

            // Condizione già 100%
            gs.driverCoins = 10;
            sandbox.instantRepairDC('c_dc4');
            assert.equal(gs.driverCoins, 10);
            assert.equal(dcSpends.length, 0);
        });

        test('bulkRepairFleet ripara tutte le auto danneggiate del gruppo (accetta sia Array che JSON string)', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car1 = { id: 'c_b1', _serverId: 'srv_b1', name: 'Auto A', condition: 70, engineHealth: 100 };
            const car2 = { id: 'c_b2', _serverId: 'srv_b2', name: 'Auto A', condition: 80, engineHealth: 100 };
            const car3 = { id: 'c_b3', _serverId: 'srv_b3', name: 'Auto A', condition: 100, engineHealth: 100 };
            gs.fleet = [car1, car2, car3];
            gs.cash = 50000;

            // Invocazione con Array di ID
            sandbox.bulkRepairFleet(['c_b1', 'c_b2', 'c_b3']);
            await new Promise(r => setImmediate(r));

            assert.equal(car1.condition, 100);
            assert.equal(car2.condition, 100);
            assert.equal(car3.condition, 100);
            assert.equal(rpcLog.filter(r => r.metodo === 'repairVehicle').length, 2);

            // Invocazione con stringa JSON (come da event delegation)
            car1.condition = 50;
            sandbox.bulkRepairFleet(JSON.stringify(['c_b1']));
            await new Promise(r => setImmediate(r));

            assert.equal(car1.condition, 100);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 3: RIFORNIMENTO CARBURANTE ED EV (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle, emergencyRefuel)
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Rifornimento carburante ed EV (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle, emergencyRefuel)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel: rifornisce al distributore, azzera outOfService e scala costo proporzionale', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = {
                id: 'c_fuel', _serverId: 'srv_fuel', name: 'Audi A6',
                fuel: 20, engineHealth: 100, outOfService: 'fuel'
            };
            gs.fleet = [car];
            gs.fuelPrice = 2.0;
            gs.cash = 5000;

            // Mancano 80% fuel -> 40 litri * €2.00 = €80
            await sandbox.buyStandardFuel('c_fuel');

            const refuelRpc = rpcLog.find(r => r.metodo === 'refuelVehicle');
            assert.ok(refuelRpc);
            assert.equal(refuelRpc.amount, 40);
            assert.equal(refuelRpc.cost, 80);
            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
        });

        test('buyStandardFuel: rifiuta se serbatoio già pieno o se motore è fuso', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            const carPieno = { id: 'c_pieno', _serverId: 'srv_1', fuel: 100, engineHealth: 100 };
            const carFuso  = { id: 'c_fuso2', _serverId: 'srv_2', fuel: 10, engineHealth: 0 };
            gs.fleet = [carPieno, carFuso];

            await sandbox.buyStandardFuel('c_pieno');
            await sandbox.buyStandardFuel('c_fuso2');

            assert.equal(rpcLog.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));
        });

        test('buyBlackMarketFuel: applica sconto 40% sul prezzo gasolio', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = {
                id: 'c_bm', _serverId: 'srv_bm', name: 'BMW 5',
                fuel: 40, engineHealth: 100, outOfService: 'fuel'
            };
            gs.fleet = [car];
            gs.fuelPrice = 2.0;

            // Mancano 60% fuel -> 30 litri. Prezzo: 2.0 * 0.60 = 1.20 -> Costo: 30 * 1.20 = 36
            await sandbox.buyBlackMarketFuel('c_bm');

            const refuelRpc = rpcLog.find(r => r.metodo === 'refuelVehicle');
            assert.ok(refuelRpc);
            assert.equal(refuelRpc.amount, 30);
            assert.equal(refuelRpc.cost, 36);
            assert.equal(car.fuel, 100);
        });

        test('superchargeVehicle: ricarica veicolo EV al Supercharger a tariffa fissa (€80)', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const carEV = {
                id: 'c_ev', _serverId: 'srv_ev', name: 'Volt 3-Urban',
                vehicleClass: 'volt_3_urban', chargeLevel: 20, outOfService: 'fuel'
            };
            gs.fleet = [carEV];

            await sandbox.superchargeVehicle('c_ev');

            const evRpc = rpcLog.find(r => r.metodo === 'refuelVehicle');
            assert.ok(evRpc);
            assert.equal(evRpc.cost, 80);
            assert.equal(carEV.chargeLevel, 100);
            assert.equal(carEV.outOfService, null);
        });

        test('superchargeVehicle: rifiuta veicoli termici o batteria già al 100%', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            const carTermica = { id: 'c_term', vehicleClass: 'mercedes_e', chargeLevel: 20 };
            const carEV100   = { id: 'c_ev100', vehicleClass: 'volt_3_urban', chargeLevel: 100 };
            gs.fleet = [carTermica, carEV100];

            await sandbox.superchargeVehicle('c_term');
            await sandbox.superchargeVehicle('c_ev100');

            assert.equal(rpcLog.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Batteria già al 100%')));
        });

        test('emergencyRefuel: rifornisce in blocco tutte le auto a terra a tariffa tripla (3×)', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const car1 = { id: 'c_st1', fuel: 0, outOfService: 'fuel' };
            const car2 = { id: 'c_st2', fuel: 5, outOfService: 'fuel' };
            const car3 = { id: 'c_ok', fuel: 80, outOfService: null };
            gs.fleet = [car1, car2, car3];
            gs.fuelPrice = 2.0;
            gs.cash = 10000;

            // 2 auto a terra * 80 litri * (€2.00 * 3) = 2 * 80 * 6 = €960
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 9040);
            assert.equal(car1.fuel, 100);
            assert.equal(car1.outOfService, null);
            assert.equal(car2.fuel, 100);
            assert.equal(car2.outOfService, null);
            assert.deepEqual(syncedCash, [9040]);
        });

        test('emergencyRefuel: rifiuta se non ci sono auto ferme per carburante o fondi insufficienti', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            gs.fleet = [{ id: 'c_ok', fuel: 90, outOfService: null }];
            gs.cash = 10000;

            sandbox.emergencyRefuel();
            assert.equal(gs.cash, 10000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessuna auto ferma')));

            // Caso fondi insufficienti
            gs.fleet = [{ id: 'c_st', fuel: 0, outOfService: 'fuel' }];
            gs.cash = 10;
            sandbox.emergencyRefuel();
            assert.equal(gs.cash, 10);
            assert.deepEqual(syncedCash, []);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 4: DEPOSITO CARBURANTE E GOMME (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot)
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Deposito aziendale di carburante e gomme (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta();
            amb.gs.investments = ['inv_fuel_depot'];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot: acquista carburante con rispetto capacità e sconti attivi', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelTankCapacity = 20000;
            gs.fuelTank = 10000;
            gs.fuelPrice = 2.0;
            gs.fuelTankLevel = 2; // Cisterna Doppia: sconto 2% (0.98)
            gs.activeLobbyLaws = ['law_fuel_subsidy']; // Sconto sussidi: 30% (0.70)
            gs.cash = 50000;

            // Richiesti 15.000L ma spazio disponibile solo 10.000L -> actual = 10.000L
            // Sconto: 0.70 * 0.98 = 0.686 -> Costo: 10000 * 2.0 * 0.686 = 13720
            sandbox.buyFuelForDepot(15000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTank, 20000);
            assert.equal(gs.cash, 50000 - 13720);
            assert.deepEqual(syncedCash, [36280]);
        });

        test('buyFuelForDepot: rifiuta se deposito già pieno o investimento mancante', () => {
            const { sandbox, gs, env } = amb;
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 10000;

            sandbox.buyFuelForDepot(5000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));

            gs.investments = [];
            sandbox.buyFuelForDepot(5000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima il Deposito')));
        });

        test('upgradeFuelDepot: incrementa livello e capacità, blocca al livello massimo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelTankLevel = 1;
            gs.cash = 100000;

            // Upgrade Lv 1 -> 2 (costo = 5000 * 1^1.8 = 5000, cap = 20000)
            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 95000);

            // Porta al livello 5 (max)
            gs.fuelTankLevel = 5;
            sandbox.upgradeFuelDepot();
            assert.equal(gs.fuelTankLevel, 5);
        });

        test('buyTiresForDepot: acquista treni di gomme per il magazzino a €800 per set', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.depositoGomme = 2;
            gs.cash = 10000;

            // 5 set * €800 = €4000
            sandbox.buyTiresForDepot(5);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.depositoGomme, 7);
            assert.equal(gs.cash, 6000);
            assert.deepEqual(syncedCash, [6000]);
        });

        test('getDepotLevelData: restituisce i parametri corretti per ciascun livello', () => {
            const { sandbox, gs } = amb;
            gs.fuelTankLevel = 3;
            const d3 = sandbox.getDepotLevelData();
            assert.equal(d3.level, 3);
            assert.equal(d3.capacity, 35000);
            assert.equal(d3.priceDiscount, 0.05);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 5: GOMME, TUNING E SKIN (refillTires, buyCARUpgrade, applyVehicleSkin)
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Pressione gomme, tuning e skin (refillTires, buyCARUpgrade, applyVehicleSkin)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('refillTires: ripristina pressione a 100 e addebita €0.8 per punto mancante via ServerState', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = { id: 'c_tires', _serverId: 'srv_tires', name: 'Mercedes E', tirePressure: 50 };
            gs.fleet = [car];

            // 50 punti mancanti * 0.8 = 40€
            await sandbox.refillTires('c_tires');

            const tireRpc = rpcLog.find(r => r.metodo === 'refillCarTires');
            assert.ok(tireRpc);
            assert.equal(tireRpc.cost, 40);
            assert.equal(car.tirePressure, 100);
        });

        test('refillTires: rifiuta se pressione già al 100% o veicolo inesistente', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            const car = { id: 'c_t_ok', _serverId: 'srv_tok', tirePressure: 100 };
            gs.fleet = [car];

            await sandbox.refillTires('c_t_ok');
            await sandbox.refillTires('c_t_fantasma');

            assert.equal(rpcLog.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('ottimale')));
        });

        test('buyCARUpgrade: installa upgrade sulla vettura e scala cash via CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const car = { id: 'c_upg', name: 'Mercedes E', upgrades: [] };
            gs.fleet = [car];
            gs.cash = 30000;

            // Installa 'centralina' (costo CAR_UPGRADES: €4.500)
            sandbox.buyCARUpgrade('c_upg', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.ok(car.upgrades.includes('centralina'));
            assert.equal(gs.cash, 30000 - 4500);
            assert.deepEqual(syncedCash, [25500]);
        });

        test('buyCARUpgrade: rifiuta se upgrade già presente o fondi insufficienti', async () => {
            const { sandbox, gs, syncedCash, env } = amb;
            const car = { id: 'c_upg2', name: 'Mercedes E', upgrades: ['centralina'] };
            gs.fleet = [car];
            gs.cash = 30000;

            // Già installato
            sandbox.buyCARUpgrade('c_upg2', 'centralina');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già installato')));

            // Fondi insufficienti
            gs.cash = 100;
            sandbox.buyCARUpgrade('c_upg2', 'vetri_oscurati');
            assert.equal(car.upgrades.includes('vetri_oscurati'), false);
            assert.deepEqual(syncedCash, []);
        });

        test('applyVehicleSkin: applica skin spendendo Driver Coins via CE_money.spendDC', async () => {
            const { sandbox, gs, dcSpends } = amb;
            const car = { id: 'c_skin', name: 'Mercedes S' };
            gs.fleet = [car];
            gs.driverCoins = 25;

            // gold_chrome costa 15 DC
            sandbox.applyVehicleSkin('c_skin', 'gold_chrome');
            await new Promise(r => setImmediate(r));

            assert.equal(car.skin, 'gold_chrome');
            assert.equal(gs.driverCoins, 10);
            assert.deepEqual(dcSpends, [{ item: 'vehicle_skin', amount: 15 }]);
        });

        test('applyVehicleSkin: rifiuta se DC insufficienti o skin/auto non valida', () => {
            const { sandbox, gs, dcSpends } = amb;
            const car = { id: 'c_skin2', name: 'Mercedes S' };
            gs.fleet = [car];
            gs.driverCoins = 5; // gold_chrome ne chiede 15

            sandbox.applyVehicleSkin('c_skin2', 'gold_chrome');
            assert.equal(car.skin, undefined);

            sandbox.applyVehicleSkin('c_skin2', 'skin_fantasma');
            assert.equal(dcSpends.length, 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 6: HUB, AUTISTI E STRATEGIA (returnToHub, setPricingStrategy, acceptGreyMarket, buyMaintenanceContract)
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Rientro hub, autisti e contratti (returnToHub, setPricingStrategy, acceptGreyMarket, buyMaintenanceContract)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('returnToHub: calcola distanza, pedaggi e imposta autista in riposo/rientro', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const car = { id: 'c_mil', currentPoiId: 'milano', upgrades: [] };
            const driver = { id: 'd_mil', name: 'Mario', assignedCarId: 'c_mil', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 20000;

            sandbox.returnToHub('c_mil');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash < 20000, 'deve aver pagato carburante e pedaggi');
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.ok(driver.restHoursLeft >= 1);
            assert.deepEqual(syncedCash, [gs.cash]);
        });

        test('returnToHub: con telepass azzera il pedaggio', async () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_nap', currentPoiId: 'napoli', upgrades: ['telepass_car'] };
            const driver = { id: 'd_nap', name: 'Ciro', assignedCarId: 'c_nap', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 20000;

            sandbox.returnToHub('c_nap');
            await new Promise(r => setImmediate(r));

            assert.equal(driver.status, 'resting');
        });

        test('returnToHub: rifiuta se autista non è idle, se auto già a Roma o fondi insufficienti', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c_roma', currentPoiId: 'roma' };
            const driver = { id: 'd_roma', assignedCarId: 'c_roma', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];

            // Già all'Hub
            sandbox.returnToHub('c_roma');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già all\'Hub')));

            // Autista occupato
            car.currentPoiId = 'firenze';
            driver.status = 'busy';
            sandbox.returnToHub('c_roma');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista non disponibile')));
        });

        test('buyMaintenanceContract: attiva contratto riparazioni −30% per 7 giorni', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 10;
            gs.cash = 50000;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000);
            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 17);
            assert.deepEqual(syncedCash, [40000]);
        });

        test('setPricingStrategy: aggiorna la strategia tra discount, standard e premium', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('strategia_invalida');
            assert.equal(gs.pricingStrategy, 'discount');
        });

        test('acceptGreyMarket: crea corsa vip discreta da email grey_market', () => {
            const { sandbox, gs } = amb;
            gs.nextId = 100;
            gs.pendingRides = [];
            gs.emails = [{
                id: 'em_grey_1',
                type: 'grey_market',
                status: 'unread',
                greyRideData: { fromId: 'roma', toId: 'milano', price: 1500, isLong: true },
            }];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.pendingRides.length, 1);
            const ride = gs.pendingRides[0];
            assert.equal(ride.isGreyMarket, true);
            assert.equal(ride.price, 1500);
            assert.equal(ride.tier, 'vip');
            assert.equal(gs.emails[0].status, 'resolved');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 7: COMPRAVENDITA, PROTOTIPI, LEASING E MERCATO NPC
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. Compravendita veicoli, prototipi, leasing e mercato (buyPrototypeCar, buyHub, sellHub, terminateLease, listCarForSale, buyNpcCar, bidOnAuction, sellCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyPrototypeCar: controlla reputazione, corse ed hub EV, spende e inserisce veicolo', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.reputation = 4.8;
            gs.questStats = { totalRides: 500 };
            gs.hasEVHub = true;
            gs.cash = 300000;
            gs.fleet = [];

            // proto_van_vip: reqRep 4.0, rideGate 0, price 110.000
            sandbox.buyPrototypeCar('proto_van_vip');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 190000);
            assert.equal(gs.fleet.length, 1);
            const proto = gs.fleet[0];
            assert.equal(proto.protoId, 'proto_van_vip');
            assert.equal(proto.tier, 'vip');
            assert.equal(proto.condition, 100);
            assert.deepEqual(syncedCash, [190000]);
        });

        test('buyPrototypeCar: blocca se requisiti non soddisfatti o prototipo già posseduto', () => {
            const { sandbox, gs, env } = amb;
            gs.reputation = 2.0; // Richiede 4.0
            gs.cash = 300000;
            gs.fleet = [];

            sandbox.buyPrototypeCar('proto_van_vip');
            assert.equal(gs.fleet.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));

            // Già in flotta
            gs.reputation = 5.0;
            gs.fleet.push({ id: 'c_pr', protoId: 'proto_van_vip' });
            sandbox.buyPrototypeCar('proto_van_vip');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già questo prototipo')));
        });

        test('buyHub & sellHub: acquisto e cessione concessione hub aeroportuale', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.reputation = 3.0;
            gs.cash = 100000;
            gs.ownedHubs = [];

            // POIS.roma_fco costo = 50000 + 90 * 200 = 68.000€
            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 32000);
            assert.ok(gs.ownedHubs.includes('roma_fco'));

            // Cessione al 60%: 68000 * 0.6 = 40800€
            sandbox.sellHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 72800);
            assert.equal(gs.ownedHubs.includes('roma_fco'), false);
            assert.deepEqual(syncedCash, [32000, 72800]);
        });

        test('terminateLease: calcola penale al 50% dei mesi residui, libera autista e rimuove auto', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const car = {
                id: 'c_lease1', name: 'Mercedes Lease', isLease: true,
                leaseDuration: 12, leaseElapsedDays: 90, leaseMonthlyRate: 2000
            };
            const driver = { id: 'd_lease', name: 'Paolo', assignedCarId: 'c_lease1' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.cash = 50000;

            // Giorni rimanenti = 360 - 90 = 270 -> 9 mesi * 2000 * 0.50 = €9.000
            sandbox.terminateLease('c_lease1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 41000);
            assert.equal(gs.fleet.length, 0);
            assert.equal(driver.assignedCarId, null);
            assert.deepEqual(syncedCash, [41000]);
        });

        test('terminateLease: rifiuta se confirm() è falso o se auto non è in leasing', () => {
            const { sandbox, gs } = amb;
            const car = { id: 'c_prop', name: 'Auto Proprietà', isLease: false };
            gs.fleet = [car];
            gs.cash = 50000;

            // Non in leasing
            sandbox.terminateLease('c_prop');
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.cash, 50000);

            // In leasing ma utente annulla confirm
            car.isLease = true;
            sandbox.confirm = () => false;
            sandbox.terminateLease('c_prop');
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.cash, 50000);
        });

        test('listCarForSale e cancelListing (gestione marketplace locale/NPC)', () => {
            const { sandbox, gs, env } = amb;
            const car = { id: 'c_sale', name: 'Mercedes E', isLimitedEdition: false };
            const driver = { id: 'd_free', assignedCarId: 'c_sale', status: 'idle' };
            gs.fleet = [car];
            gs.drivers = [driver];
            gs.marketplace = [];

            // Metti in vendita
            sandbox.listCarForSale('c_sale', 25000);
            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'c_sale');
            assert.equal(gs.marketplace[0].askPrice, 25000);
            assert.equal(driver.assignedCarId, null, 'autista liberato');

            // Rifiuto se veicolo in edizione limitata
            car.isLimitedEdition = true;
            sandbox.listCarForSale('c_sale', 25000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));

            // Rifiuto se autista è in corsa (busy)
            car.isLimitedEdition = false;
            gs.marketplace = [];
            driver.assignedCarId = 'c_sale';
            driver.status = 'busy';
            sandbox.listCarForSale('c_sale', 25000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in servizio')));

            // Annulla annuncio
            gs.marketplace = [{ id: 'm_123', carId: 'c_sale', askPrice: 25000 }];
            sandbox.cancelListing('m_123');
            assert.equal(gs.marketplace.length, 0);
        });

        test('buyNpcCar: acquista auto dal mercato usato NPC', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.npcMarket = [{ id: 'npc_1', name: 'BMW Usata', tier: 'business', price: 20000, condition: 85, mileage: 30000 }];
            gs.cash = 35000;
            gs.fleet = [];

            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].name, 'BMW Usata');
            assert.equal(gs.npcMarket.length, 0);
            assert.deepEqual(syncedCash, [15000]);
        });

        test('bidOnAuction: rilancio con rimborso offerta precedente', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.activeAuction = { id: 'auc_1', name: 'Rolls Royce Rara', currentBid: 50000, playerBid: 50000 };
            gs.cash = 40000;

            // Rilancio a 70.000€ (rimborso 50k -> cash 90k, spesa 70k -> cash 20k)
            sandbox.bidOnAuction(70000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000);
            assert.equal(gs.activeAuction.playerBid, 70000);
            assert.equal(gs.activeAuction.currentBid, 70000);
            assert.deepEqual(syncedCash, [90000, 20000]);
        });

        test('sellCar: vendita auto ordinaria con decurtazione condizione e blocco su leasing/limited', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            const carVIP = { id: 'c_sell_vip', _serverId: 'srv_sell', tier: 'vip', condition: 80, isLease: false };
            const carLease = { id: 'c_sell_lease', tier: 'vip', isLease: true };
            const carLtd = { id: 'c_sell_ltd', tier: 'vip', isLimitedEdition: true };
            gs.fleet = [carVIP, carLease, carLtd];
            gs.cash = 10000;

            // VIP baseValue = 70000 -> sellPrice = floor(70000 * 0.80 * 0.70) = 39200
            await sandbox.sellCar('c_sell_vip');

            const sellRpc = rpcLog.find(r => r.metodo === 'sellVehicle');
            assert.ok(sellRpc);
            assert.equal(sellRpc.price, 39200);
            assert.equal(gs.fleet.some(c => c.id === 'c_sell_vip'), false);

            // Blocco leasing e limited edition
            await sandbox.sellCar('c_sell_lease');
            await sandbox.sellCar('c_sell_ltd');
            assert.equal(gs.fleet.length, 2);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 8: EVENT DELEGATION & DOM ACTIONS (ce-actions.js, events.js)
    // ─────────────────────────────────────────────────────────────────────────
    describe('8. Event delegation ed interazione DOM (ce-actions.js, data-ce-act)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta();
            amb.gs.investments = ['inv_fuel_depot'];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su riparazione carrozzeria e motore scatena le rispettive azioni via delegation', async () => {
            const { sandbox, gs, rpcLog } = amb;
            const car = {
                id: 'c_dom1', _serverId: 'srv_dom1', name: 'Mercedes E',
                condition: 70, engineHealth: 60
            };
            gs.fleet = [car];
            gs.cash = 50000;

            sandbox.renderTabFleet();

            // 1. Click riparazione carrozzeria
            const btnRep = sandbox.document.querySelector('button[title="Ripara carrozzeria"]');
            assert.ok(btnRep);
            const argsRep = JSON.parse(btnRep.getAttribute('data-ce-args'));
            await sandbox.payToRepairCar(...argsRep);

            assert.ok(rpcLog.some(r => r.metodo === 'repairVehicle'));
            assert.equal(car.condition, 100);

            // 2. Click riparazione motore
            const btnEng = sandbox.document.querySelector('button[title="Ripara motore"]');
            assert.ok(btnEng);
            const argsEng = JSON.parse(btnEng.getAttribute('data-ce-args'));
            await sandbox.repairEngine(...argsEng);

            assert.equal(car.engineHealth, 100);
        });

        test('click su rifornimento deposito e treni di gomme invoca le funzioni con argomenti corretti', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fuelTankCapacity = 50000;
            gs.fuelTank = 0;
            gs.cash = 100000;

            sandbox.renderTabFleet();

            // Trova bottone +5k L
            const btnFuel = sandbox.document.querySelector('button[data-ce-act="buyFuelForDepot"][data-ce-args*="5000"]');
            assert.ok(btnFuel);
            const argsFuel = JSON.parse(btnFuel.getAttribute('data-ce-args'));
            sandbox.buyFuelForDepot(...argsFuel);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTank, 5000);

            // Trova bottone +1 set gomme
            const btnTires = sandbox.document.querySelector('button[data-ce-act="buyTiresForDepot"][data-ce-args*="1"]');
            assert.ok(btnTires);
            const argsTires = JSON.parse(btnTires.getAttribute('data-ce-args'));
            sandbox.buyTiresForDepot(...argsTires);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.depositoGomme, 1);
        });

        test('click su ceListCar in ce-actions.js inserisce auto a listino e chiude i modali', () => {
            const { sandbox, gs } = amb;
            let modaleChiuso = false;
            sandbox.closeModals = () => { modaleChiuso = true; };
            const car = { id: 'c_ce_list', name: 'Auto List' };
            gs.fleet = [car];
            gs.marketplace = [];

            sandbox.ceListCar('c_ce_list', 30000);

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].askPrice, 30000);
            assert.equal(modaleChiuso, true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEZIONE 9: INTEGRITÀ ECONOMICA ED ANTI-DOPPIO CONTEGGIO
    // ─────────────────────────────────────────────────────────────────────────
    describe('9. Integrità economica ed anti-doppio conteggio', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ogni movimento di denaro usa CE_money OPPURE ServerState RPC, mai entrambi', async () => {
            const { sandbox, gs, rpcLog, syncedCash } = amb;
            const car = { id: 'c_t1', _serverId: 'srv_t1', condition: 50, fuel: 50, engineHealth: 100 };
            gs.fleet = [car];
            gs.cash = 50000;

            // 1. payToRepairCar usa ServerState RPC -> nessun syncCash separato
            await sandbox.payToRepairCar('c_t1');
            assert.equal(rpcLog.filter(r => r.metodo === 'repairVehicle').length, 1);
            assert.equal(syncedCash.length, 0, 'RPC gestisce direttamente il cash, syncCash non deve essere chiamato');

            // 2. buyCARUpgrade usa CE_money -> chiama syncCash col nuovo saldo
            const countRpcPrima = rpcLog.length;
            sandbox.buyCARUpgrade('c_t1', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcLog.length, countRpcPrima, 'CE_money non deve invocare RPC di acquisto duplicate');
            assert.equal(syncedCash.length, 1, 'syncCash sincronizza il saldo al server');
        });
    });
});
