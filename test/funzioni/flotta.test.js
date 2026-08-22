'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo profondo del modulo Flotta

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js` e `ui-fleet.js` e dai relativi gestori in `ce-actions.js`,
   verificare la coerenza tra prezzi mostrati e prezzi addebitati,
   la gestione di ServerState/CE_money (assenza di doppio conteggio),
   il corretto rifiuto dei casi limite (leasing, edizioni limitate, autista busy,
   motore fuso, fondi insufficienti, duplicazioni) e l'UI di rendering/delegation.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente controllato per i test della flotta.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const rpcCalls = [];
    const syncedCash = [];
    const spentDC = [];
    const bigEvents = [];

    const env = freshEnv({
        render: true,
        serverState: {
            isReady: () => opzioni.serverStateReady !== undefined ? opzioni.serverStateReady : true,
            refuelVehicle: async (serverId, amount, cost) => {
                rpcCalls.push({ name: 'refuelVehicle', serverId, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (serverId, cost) => {
                rpcCalls.push({ name: 'refillCarTires', serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            repairVehicle: async (serverId, cost) => {
                rpcCalls.push({ name: 'repairVehicle', serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (serverId, price) => {
                rpcCalls.push({ name: 'sellVehicle', serverId, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            syncCash: async (v) => {
                syncedCash.push(v);
                env.sandbox.gameState.cash = v;
                return { success: true, cash: v };
            },
            spendDriverCoins: async (reason, amount) => {
                spentDC.push({ reason, amount });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    env.sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    // DOM container per i test di rendering
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcCalls,
        syncedCash,
        spentDC,
        bigEvents,
    };
}

describe('Funzione Flotta — Collaudo profondo', () => {

    describe('1. Supercharger per veicoli elettrici (superchargeVehicle)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('superchargeVehicle ricarica veicolo EV al 100%, addebita €80 via ServerState e cancella outOfService fuel', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'ev_car_1',
                _serverId: 'srv_ev_1',
                name: 'Volt 3-Urban',
                vehicleClass: 'volt_3_urban', // EV nel catalogo
                chargeLevel: 30,
                outOfService: 'fuel',
            }];
            gs.cash = 1000;

            await sandbox.superchargeVehicle('ev_car_1');

            assert.equal(gs.fleet[0].chargeLevel, 100, 'la batteria deve essere al 100%');
            assert.equal(gs.fleet[0].outOfService, null, 'outOfService deve essere azzerato');
            assert.equal(gs.cash, 920, 'il cash locale deve essere scalato di €80');
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 80);
        });

        test('superchargeVehicle rifiuta veicolo con motore termico (non elettrico)', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'gas_car_1',
                _serverId: 'srv_gas_1',
                name: 'Stellar E-Executive',
                vehicleClass: 'stellar_e_exec', // benzina
                fuel: 20,
            }];
            gs.cash = 1000;

            await sandbox.superchargeVehicle('gas_car_1');

            assert.equal(rpcCalls.length, 0, 'nessuna chiamata RPC per auto termica');
            assert.equal(gs.cash, 1000);
        });

        test('superchargeVehicle rifiuta veicolo già al 100% di carica', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{
                id: 'ev_full',
                _serverId: 'srv_ev_full',
                name: 'Volt 3-Urban',
                vehicleClass: 'volt_3_urban',
                chargeLevel: 100,
            }];
            gs.cash = 1000;

            await sandbox.superchargeVehicle('ev_full');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Batteria già al 100%')));
        });

        test('superchargeVehicle con id inesistente non fa nulla', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [];
            await sandbox.superchargeVehicle('fantasma');
            assert.equal(rpcCalls.length, 0);
        });
    });

    describe('2. Pressione gomme (refillTires)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('refillTires ripristina le gomme al 100%, addebita missing * 0.8 e resetta outOfService tires', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'car_tires',
                _serverId: 'srv_tires_1',
                name: 'Stellar E-Executive',
                tirePressure: 40,
                outOfService: 'tires',
            }];
            gs.cash = 1000;
            // missing = 60 -> cost = Math.ceil(60 * 0.8) = 48
            await sandbox.refillTires('car_tires');

            assert.equal(gs.fleet[0].tirePressure, 100);
            assert.equal(gs.fleet[0].outOfService, null, 'outOfService tires deve essere rimosso');
            assert.equal(gs.cash, 952);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'refillCarTires');
            assert.equal(rpcCalls[0].cost, 48);
        });

        test('refillTires rifiuta se pressione già al 100%', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{
                id: 'car_tires_ok',
                _serverId: 'srv_tires_ok',
                name: 'Stellar E-Executive',
                tirePressure: 100,
            }];
            gs.cash = 1000;

            await sandbox.refillTires('car_tires_ok');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Pressione gomme ottimale')));
        });

        test('refillTires con id inesistente non fa nulla', async () => {
            const { sandbox, rpcCalls } = amb;
            await sandbox.refillTires('fantasma');
            assert.equal(rpcCalls.length, 0);
        });
    });

    describe('3. Riparazione motore (repairEngine)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairEngine ripara motore a 100%, addebita Math.max(800, damage * 180) e rimuove outOfService engine', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'car_eng_dmg',
                _serverId: 'srv_eng_1',
                name: 'Stellar S-Imperial',
                engineHealth: 50,
                outOfService: 'engine',
            }];
            gs.cash = 20000;
            // damage = 50 -> repairCost = Math.max(800, 50 * 180) = 9000
            await sandbox.repairEngine('car_eng_dmg');

            assert.equal(gs.fleet[0].engineHealth, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.cash, 11000);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'repairVehicle');
            assert.equal(rpcCalls[0].cost, 9000);
        });

        test('repairEngine applica minimo di €800 per danni lievi', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'car_eng_mild',
                _serverId: 'srv_eng_2',
                name: 'Stellar E-Executive',
                engineHealth: 98,
            }];
            gs.cash = 5000;
            // damage = 2 -> 2 * 180 = 360 < 800 -> repairCost = 800
            await sandbox.repairEngine('car_eng_mild');

            assert.equal(gs.fleet[0].engineHealth, 100);
            assert.equal(gs.cash, 4200);
            assert.equal(rpcCalls[0].cost, 800);
        });

        test('repairEngine rifiuta se motore già al 100%', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{
                id: 'car_eng_ok',
                _serverId: 'srv_eng_ok',
                name: 'Stellar E-Executive',
                engineHealth: 100,
            }];
            gs.cash = 5000;

            await sandbox.repairEngine('car_eng_ok');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Il motore è già in perfette condizioni')));
        });
    });

    describe('4. Insta-Repair con Driver Coins (instantRepairDC)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('instantRepairDC consuma 2 DC (senza executive pass) e ripara al 100%', async () => {
            const { sandbox, gs, spentDC } = amb;
            gs.fleet = [{ id: 'car_dc', name: 'Stellar E', condition: 35, outOfService: 'condition' }];
            gs.driverCoins = 10;
            gs.executivePassActive = false;

            sandbox.instantRepairDC('car_dc');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.driverCoins, 8);
            assert.deepEqual(spentDC, [{ reason: 'instant_repair_dc', amount: 2 }]);
        });

        test('instantRepairDC consuma 1 DC con executivePassActive attivo', async () => {
            const { sandbox, gs, spentDC } = amb;
            gs.fleet = [{ id: 'car_dc_exec', name: 'Stellar E', condition: 50, outOfService: 'condition' }];
            gs.driverCoins = 5;
            gs.executivePassActive = true;

            sandbox.instantRepairDC('car_dc_exec');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 4);
            assert.deepEqual(spentDC, [{ reason: 'instant_repair_dc', amount: 1 }]);
        });

        test('instantRepairDC rifiuta se DC insufficienti', async () => {
            const { sandbox, gs, spentDC } = amb;
            gs.fleet = [{ id: 'car_dc_low', name: 'Stellar E', condition: 50 }];
            gs.driverCoins = 0;

            sandbox.instantRepairDC('car_dc_low');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].condition, 50);
            assert.deepEqual(spentDC, []);
        });

        test('instantRepairDC rifiuta se veicolo già al 100%', async () => {
            const { sandbox, gs, spentDC, env } = amb;
            gs.fleet = [{ id: 'car_dc_ok', name: 'Stellar E', condition: 100 }];
            gs.driverCoins = 10;

            sandbox.instantRepairDC('car_dc_ok');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 10);
            assert.deepEqual(spentDC, []);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Veicolo già al 100%')));
        });
    });

    describe('5. Rifornimento carburante (buyStandardFuel, buyBlackMarketFuel)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel rifornisce al 100%, calcola il costo esatto e addebita al server', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'car_fuel',
                _serverId: 'srv_fuel_1',
                name: 'Stellar E-Executive',
                fuel: 20,
                engineHealth: 100,
                outOfService: 'fuel',
            }];
            gs.fuelPrice = 2.00;
            gs.cash = 1000;
            // missing = 80 -> litres = 40 -> cost = Math.floor(40 * 2.00) = 80
            await sandbox.buyStandardFuel('car_fuel');

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.cash, 920);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'refuelVehicle');
            assert.equal(rpcCalls[0].cost, 80);
        });

        test('buyStandardFuel rifiuta se motore fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{
                id: 'car_blown',
                _serverId: 'srv_blown',
                name: 'Stellar E-Executive',
                fuel: 10,
                engineHealth: 0,
            }];
            gs.cash = 1000;

            await sandbox.buyStandardFuel('car_blown');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('buyStandardFuel rifiuta se serbatoio già pieno (fuel >= 100)', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{
                id: 'car_full',
                _serverId: 'srv_full',
                name: 'Stellar E-Executive',
                fuel: 100,
                engineHealth: 100,
            }];
            gs.cash = 1000;

            await sandbox.buyStandardFuel('car_full');

            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Il serbatoio è già pieno')));
        });

        test('buyBlackMarketFuel applica sconto del 40% sul carburante', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'car_bm',
                _serverId: 'srv_bm_1',
                name: 'Stellar E-Executive',
                fuel: 20,
                engineHealth: 100,
            }];
            gs.fuelPrice = 2.00;
            gs.cash = 1000;
            // price = 2.00 * 0.60 = 1.20; missing = 80 -> litres = 40 -> cost = Math.floor(40 * 1.20) = 48
            await sandbox.buyBlackMarketFuel('car_bm');

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.cash, 952);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].cost, 48);
        });

        test('buyBlackMarketFuel rifiuta con motore fuso', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{ id: 'car_bm_blown', _serverId: 'srv_bm_2', name: 'Stellar E', fuel: 10, engineHealth: 0 }];
            await sandbox.buyBlackMarketFuel('car_bm_blown');
            assert.equal(rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });
    });

    describe('6. Deposito Carburante e Gomme (buyFuelForDepot, upgradeFuelDepot, emergencyRefuel, buyTiresForDepot)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot rifiuta se il giocatore non possiede l\'investimento inv_fuel_depot', async () => {
            const { sandbox, gs, env } = amb;
            gs.investments = [];
            gs.cash = 10000;

            sandbox.buyFuelForDepot(5000);
            await new Promise(r => setImmediate(r));

            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima il Deposito Carburante')));
        });

        test('buyFuelForDepot riempie fino alla capienza e sincronizza cassa via CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 8000; // spazio disponibile 2000L
            gs.fuelTankLevel = 1;
            gs.fuelPrice = 2.00;
            gs.activeLobbyLaws = [];
            gs.cash = 10000;

            // Richiesti 5000L, ma lo spazio è 2000L -> cost = 2000 * 2.00 = 4000
            sandbox.buyFuelForDepot(5000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTank, 10000);
            assert.equal(gs.cash, 6000);
            assert.deepEqual(syncedCash, [6000]);
        });

        test('getDepotLevelData restituisce i dati di livello corretto', () => {
            const { sandbox, gs } = amb;
            gs.fuelTankLevel = 3;
            const data = sandbox.getDepotLevelData();
            assert.equal(data.level, 3);
            assert.equal(data.capacity, 35000);
            assert.equal(data.priceDiscount, 0.05);
        });

        test('upgradeFuelDepot potenzia la cisterna e sincronizza cassa', async () => {
            const { sandbox, gs, syncedCash, bigEvents } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;
            gs.cash = 10000;
            // cost = Math.round(5000 * 1^1.8) = 5000
            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, [5000]);
            assert.equal(bigEvents.length, 1);
        });

        test('upgradeFuelDepot al livello massimo non effettua ulteriori potenziamenti', async () => {
            const { sandbox, gs, env } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 5;
            gs.cash = 100000;

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fuelTankLevel, 5);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Deposito già al livello massimo')));
        });

        test('emergencyRefuel rifornisce al 100% le auto ferme con tariffa 3x', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fleet = [
                { id: 'c1', fuel: 0, outOfService: 'fuel' },
                { id: 'c2', fuel: 0, outOfService: 'fuel' },
            ];
            gs.fuelPrice = 2.00;
            gs.cash = 10000;
            // 2 auto * 80L * (2.00 * 3) = 960€
            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
            assert.equal(gs.cash, 9040);
            assert.deepEqual(syncedCash, [9040]);
        });

        test('buyTiresForDepot addebita esattamente il prezzo mostrato nell\'interfaccia (€800 per 1 set, €3.500 per 5 set, €6.000 per 10 set)', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 0;
            gs.cash = 20000;

            // 1 set -> €800
            sandbox.buyTiresForDepot(1);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 1);
            assert.equal(gs.cash, 19200);

            // 5 set -> €3.500 (sconto pacchetto da UI)
            sandbox.buyTiresForDepot(5);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 6);
            assert.equal(gs.cash, 15700);

            // 10 set -> €6.000 (sconto pacchetto da UI)
            sandbox.buyTiresForDepot(10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.depositoGomme, 16);
            assert.equal(gs.cash, 9700);

            assert.deepEqual(syncedCash, [19200, 15700, 9700]);
        });
    });

    describe('7. Upgrade Veicolo (buyCARUpgrade)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa upgrade su veicolo e spende via CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const CAR_UPGRADES = vm.runInContext('CAR_UPGRADES', sandbox);
            const upg = CAR_UPGRADES.find(u => u.id === 'centralina');
            gs.fleet = [{ id: 'car_upg', name: 'Stellar E-Executive', upgrades: [] }];
            gs.cash = 10000;
            const expectedCash = 10000 - upg.price;

            sandbox.buyCARUpgrade('car_upg', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.fleet[0].upgrades.includes('centralina'));
            assert.equal(gs.cash, expectedCash);
            assert.deepEqual(syncedCash, [expectedCash]);
        });

        test('buyCARUpgrade rifiuta se upgrade già installato', async () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'car_upg_dup', name: 'Stellar E', upgrades: ['centralina'] }];
            gs.cash = 10000;

            sandbox.buyCARUpgrade('car_upg_dup', 'centralina');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Upgrade già installato')));
        });
    });

    describe('8. Grey Market (acceptGreyMarket)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acceptGreyMarket converte email grey market in corsa pendente', () => {
            const { sandbox, gs } = amb;
            gs.emails = [{
                id: 'em_grey_1',
                type: 'grey_market',
                greyRideData: { fromId: 'roma', toId: 'milano', price: 5000, isLong: true },
                status: 'unread',
            }];
            gs.pendingRides = [];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].isGreyMarket, true);
            assert.equal(gs.pendingRides[0].price, 5000);
            assert.equal(gs.pendingRides[0].tier, 'vip');
        });

        test('acceptGreyMarket su email non grey market non fa nulla', () => {
            const { sandbox, gs } = amb;
            gs.emails = [{ id: 'em_std', type: 'standard_email', status: 'unread' }];
            gs.pendingRides = [];

            sandbox.acceptGreyMarket('em_std');

            assert.equal(gs.pendingRides.length, 0);
        });
    });

    describe('9. Ritorno all\'Hub (returnToHub)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('returnToHub mette autista in riposo/rientro, calcola ore e pedaggi/carburante', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fleet = [{ id: 'car_hub', name: 'Stellar E', currentPoiId: 'milano', upgrades: [] }];
            gs.drivers = [{ id: 'drv_1', name: 'Luigi', assignedCarId: 'car_hub', status: 'idle' }];
            gs.investments = [];
            gs.cash = 5000;

            sandbox.returnToHub('car_hub');
            await new Promise(r => setImmediate(r));

            const driver = gs.drivers[0];
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
            assert.ok(driver.restHoursLeft > 0);
            assert.ok(gs.cash < 5000);
            assert.equal(syncedCash.length, 1);
        });

        test('returnToHub con telepass azzera il pedaggio', async () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'car_tp', name: 'Stellar E', currentPoiId: 'milano', upgrades: ['telepass_car'] }];
            gs.drivers = [{ id: 'drv_tp', name: 'Mario', assignedCarId: 'car_tp', status: 'idle' }];
            gs.cash = 5000;

            sandbox.returnToHub('car_tp');
            await new Promise(r => setImmediate(r));

            // Solo carburante scalato, nessun pedaggio
            assert.ok(gs.cash < 5000);
        });

        test('returnToHub rifiuta se autista non è idle', async () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'car_busy', name: 'Stellar E', currentPoiId: 'milano' }];
            gs.drivers = [{ id: 'drv_busy', name: 'Mario', assignedCarId: 'car_busy', status: 'busy' }];
            gs.cash = 5000;

            sandbox.returnToHub('car_busy');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista non disponibile')));
        });

        test('returnToHub rifiuta se veicolo già all\'Hub (Roma)', async () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'car_roma', name: 'Stellar E', currentPoiId: 'roma' }];
            gs.drivers = [{ id: 'drv_roma', name: 'Mario', assignedCarId: 'car_roma', status: 'idle' }];
            gs.cash = 5000;

            sandbox.returnToHub('car_roma');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già all\'Hub')));
        });
    });

    describe('10. Contratto di Manutenzione e Strategia Tariffaria', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyMaintenanceContract attiva contratto per 7 giorni scalando €10.000', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.day = 10;
            gs.cash = 25000;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 17);
            assert.equal(gs.cash, 15000);
            assert.deepEqual(syncedCash, [15000]);
        });

        test('setPricingStrategy imposta correttamente le modalità valide', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('modalita_invalida');
            assert.equal(gs.pricingStrategy, 'discount'); // non cambia
        });
    });

    describe('11. Skin Veicolo (applyVehicleSkin)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('applyVehicleSkin scala Driver Coins e assegna la skin', async () => {
            const { sandbox, gs, spentDC } = amb;
            gs.fleet = [{ id: 'car_skin', name: 'Stellar E', skin: null }];
            gs.driverCoins = 30;

            sandbox.applyVehicleSkin('car_skin', 'gold_chrome'); // cost 15 DC
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].skin, 'gold_chrome');
            assert.equal(gs.driverCoins, 15);
            assert.deepEqual(spentDC, [{ reason: 'vehicle_skin', amount: 15 }]);
        });

        test('applyVehicleSkin rifiuta skin inesistente', async () => {
            const { sandbox, gs, spentDC } = amb;
            gs.fleet = [{ id: 'car_skin', name: 'Stellar E', skin: null }];
            gs.driverCoins = 30;

            sandbox.applyVehicleSkin('car_skin', 'skin_fantasma');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].skin, null);
            assert.deepEqual(spentDC, []);
        });
    });

    describe('12. Risoluzione anticipata Leasing (terminateLease)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('terminateLease calcola penale al 50%, toglie auto e libera autista', async () => {
            const { sandbox, gs, syncedCash, bigEvents } = amb;
            sandbox.confirm = () => true;
            gs.fleet = [{
                id: 'c_lease_1',
                name: 'Stellar E (Leasing)',
                isLease: true,
                leaseDuration: 12,
                leaseElapsedDays: 60, // restano 300 giorni = 10 mesi
                leaseMonthlyRate: 2000,
            }];
            gs.drivers = [{ id: 'd_lease', name: 'Marco', assignedCarId: 'c_lease_1' }];
            gs.cash = 30000;
            // penalty = Math.round(10 * 2000 * 0.5) = 10000
            sandbox.terminateLease('c_lease_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet.length, 0, 'veicolo deve essere rimosso');
            assert.equal(gs.drivers[0].assignedCarId, null, 'autista deve essere liberato');
            assert.equal(gs.cash, 20000);
            assert.deepEqual(syncedCash, [20000]);
            assert.equal(bigEvents.length, 1);
        });

        test('terminateLease non fa nulla se il veicolo non è in leasing', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fleet = [{ id: 'c_proprio', name: 'Stellar E', isLease: false }];
            gs.cash = 30000;

            sandbox.terminateLease('c_proprio');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.cash, 30000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('13. Prototipi Esclusivi (buyPrototypeCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyPrototypeCar aggiunge prototipo alla flotta e spende via CE_money', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const PROTOTYPE_CARS = vm.runInContext('PROTOTYPE_CARS', sandbox);
            const proto = PROTOTYPE_CARS[0];
            gs.fleet = [];
            gs.reputation = proto.reqRep + 1;
            gs.questStats = { totalRides: (proto.rideGate || 0) + 10 };
            gs.hasEVHub = true;
            gs.cash = proto.price + 50000;
            const expectedCash = gs.cash - proto.price;

            sandbox.buyPrototypeCar(proto.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].protoId, proto.id);
            assert.equal(gs.cash, expectedCash);
            assert.deepEqual(syncedCash, [expectedCash]);
        });

        test('buyPrototypeCar rifiuta se prototipo già in flotta', async () => {
            const { sandbox, gs, env } = amb;
            const PROTOTYPE_CARS = vm.runInContext('PROTOTYPE_CARS', sandbox);
            const proto = PROTOTYPE_CARS[0];
            gs.fleet = [{ id: 'p1', protoId: proto.id }];
            gs.reputation = 5.0;
            gs.cash = 500000;

            sandbox.buyPrototypeCar(proto.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet.length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Hai già questo prototipo')));
        });
    });

    describe('14. Conquista e Cessione Hub (buyHub, sellHub)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub acquista concessione hub (rep >= 2.5) e sellHub incassa il 60%', async () => {
            const { sandbox, gs, syncedCash } = amb;
            const POIS = vm.runInContext('POIS', sandbox);
            const hubId = 'roma_fco';
            const hub = POIS[hubId];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);
            const resale = Math.floor(cost * 0.6);

            gs.reputation = 4.0;
            gs.ownedHubs = [];
            gs.cash = cost + 10000;

            // Acquisto
            sandbox.buyHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.ok(gs.ownedHubs.includes(hubId));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, [10000]);

            // Rivendita
            sandbox.sellHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.ok(!gs.ownedHubs.includes(hubId));
            assert.equal(gs.cash, 10000 + resale);
            assert.deepEqual(syncedCash, [10000, 10000 + resale]);
        });

        test('buyHub rifiuta se reputazione < 2.5★', async () => {
            const { sandbox, gs, env } = amb;
            gs.reputation = 2.0;
            gs.ownedHubs = [];
            gs.cash = 100000;

            sandbox.buyHub('roma_fco');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.ownedHubs.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Reputazione insufficiente')));
        });
    });

    describe('15. Vendita e Mercato Auto (listCarForSale, cancelListing, buyNpcCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('listCarForSale inserisce veicolo nel marketplace e disassegna autista se idle', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'car_sale', name: 'Stellar E-Executive' }];
            gs.drivers = [{ id: 'd1', name: 'Luigi', assignedCarId: 'car_sale', status: 'idle' }];
            gs.marketplace = [];

            sandbox.listCarForSale('car_sale', 45000);

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, 'car_sale');
            assert.equal(gs.marketplace[0].askPrice, 45000);
            assert.equal(gs.drivers[0].assignedCarId, null, 'autista deve essere disassegnato');
        });

        test('listCarForSale rifiuta veicolo in leasing', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'car_lease_sale', name: 'Stellar E', isLease: true }];
            gs.marketplace = [];

            sandbox.listCarForSale('car_lease_sale', 30000);

            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('leasing')));
        });

        test('listCarForSale rifiuta veicolo in edizione limitata', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'car_ltd', name: 'Stellar E Gold', isLimitedEdition: true }];
            gs.marketplace = [];

            sandbox.listCarForSale('car_ltd', 30000);

            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('limitate')));
        });

        test('listCarForSale rifiuta se autista assegnato è in servizio (status busy)', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'car_busy_sale', name: 'Stellar E' }];
            gs.drivers = [{ id: 'd_busy', name: 'Mario', assignedCarId: 'car_busy_sale', status: 'busy' }];
            gs.marketplace = [];

            sandbox.listCarForSale('car_busy_sale', 30000);

            assert.equal(gs.marketplace.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));
        });

        test('cancelListing rimuove annuncio dal marketplace', () => {
            const { sandbox, gs } = amb;
            gs.marketplace = [{ id: 'm_123', carId: 'car_1' }];

            sandbox.cancelListing('m_123');

            assert.equal(gs.marketplace.length, 0);
        });

        test('buyNpcCar acquista auto dal mercato NPC e sincronizza cassa', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.fleet = [];
            gs.npcMarket = [{ id: 'npc_test', name: 'Stellar V-Carrier Usata', tier: 'business', price: 20000, condition: 75, mileage: 60000 }];
            gs.cash = 30000;

            sandbox.buyNpcCar('npc_test');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.npcMarket.length, 0);
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, [10000]);
        });
    });

    describe('16. Asta Live (bidOnAuction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('bidOnAuction rilancia, rimborsa offerta precedente e addebita la nuova', async () => {
            const { sandbox, gs, syncedCash } = amb;
            gs.activeAuction = { name: 'Majestic Spirit', currentBid: 30000, playerBid: 25000 };
            gs.cash = 40000;

            // Rilancio a 35000: rimborso 25000 (cash -> 65000), poi spend 35000 (cash -> 30000)
            sandbox.bidOnAuction(35000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.activeAuction.playerBid, 35000);
            assert.equal(gs.activeAuction.currentBid, 35000);
            assert.equal(gs.cash, 30000);
            assert.deepEqual(syncedCash, [65000, 30000]);
        });

        test('bidOnAuction rifiuta offerta inferiore o uguale a currentBid', async () => {
            const { sandbox, gs, env } = amb;
            gs.activeAuction = { name: 'Majestic Spirit', currentBid: 30000, playerBid: null };
            gs.cash = 50000;

            sandbox.bidOnAuction(30000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Offerta troppo bassa')));
        });
    });

    describe('17. Riparazione Canonica e Vendita Veicolo (repairCostFor, payToRepairCar, sellCar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('repairCostFor calcola €85 per punto mancante con minimo di €500 e sconti cumulabili', () => {
            const { sandbox, gs } = amb;
            gs.maintenanceContract = false;
            gs.staff = [];
            gs.investments = [];

            // 10 punti di danno -> 10 * 85 = 850
            assert.equal(sandbox.repairCostFor({ condition: 90 }), 850);

            // 2 punti di danno -> 2 * 85 = 170 < 500 -> 500
            assert.equal(sandbox.repairCostFor({ condition: 98 }), 500);

            // Sconto contratto (-30%)
            gs.maintenanceContract = true;
            gs.day = 1;
            gs.maintenanceContractPaidUntilDay = 5;
            assert.equal(sandbox.repairCostFor({ condition: 90 }), Math.round(850 * 0.70)); // 595

            // Sconto staff meccanico (-50%)
            gs.staff = [{ id: 'mech' }];
            assert.equal(sandbox.repairCostFor({ condition: 90 }), Math.round(850 * 0.70 * 0.50)); // 298

            // Sconto officina mobile (-20%)
            gs.investments = ['inv_mobile_workshop'];
            assert.equal(sandbox.repairCostFor({ condition: 90 }), Math.round(850 * 0.70 * 0.50 * 0.80)); // 238
        });

        test('repairCostFor e payToRepairCar NON regalano la riparazione con polizza Kasko attiva', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.investments = ['inv_kasko'];
            gs.maintenanceContract = false;
            gs.staff = [];
            gs.fleet = [{ id: 'car_kasko', _serverId: 'srv_kasko', name: 'Stellar E', condition: 80, engineHealth: 100 }];
            gs.cash = 10000;

            const cost = sandbox.repairCostFor(gs.fleet[0]);
            // 20 punti danno * 85 = 1700
            assert.equal(cost, 1700, 'la Kasko non azzera l\'usura ordinaria');

            await sandbox.payToRepairCar('car_kasko');

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.cash, 8300);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].cost, 1700, 'il prezzo addebitato deve coincidere con repairCostFor');
        });

        test('payToRepairCar blocca se il motore è fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, rpcCalls, env } = amb;
            gs.fleet = [{ id: 'car_fuso', _serverId: 'srv_fuso', name: 'Stellar E', condition: 50, engineHealth: 0 }];
            gs.cash = 10000;

            await sandbox.payToRepairCar('car_fuso');

            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.fleet[0].condition, 50);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('sellCar accredita il valore residuo al 70%, rimuove il veicolo e libera l\'autista', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [{
                id: 'car_sell',
                _serverId: 'srv_sell_1',
                name: 'Stellar S-Imperial',
                tier: 'vip',
                condition: 80,
                isLease: false,
                isLimitedEdition: false,
            }];
            gs.drivers = [{ id: 'd_sell', name: 'Mario', assignedCarId: 'car_sell' }];
            gs.cash = 5000;

            // baseValue vip = 70000; sellPrice = Math.floor(70000 * 0.8 * 0.7) = 39200
            await sandbox.sellCar('car_sell');

            assert.equal(gs.fleet.length, 0);
            assert.equal(gs.drivers[0].assignedCarId, null);
            assert.equal(gs.cash, 5000 + 39200);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].name, 'sellVehicle');
            assert.equal(rpcCalls[0].price, 39200);
        });

        test('sellCar rifiuta veicolo in leasing o in edizione limitata', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [
                { id: 'c_l', _serverId: 'srv_l', isLease: true },
                { id: 'c_ltd', _serverId: 'srv_ltd', isLimitedEdition: true },
            ];

            await sandbox.sellCar('c_l');
            await sandbox.sellCar('c_ltd');

            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.fleet.length, 2);
        });
    });

    describe('18. Rendering UI e Riparazione di Gruppo (renderTabFleet, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet disegna KPI flotta, filtri, tabella veicoli e blocco deposito', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [
                { id: 'c1', name: 'Stellar E-Executive', tier: 'business', condition: 80, fuel: 90, tirePressure: 100, engineHealth: 100 },
                { id: 'c2', name: 'Volt 3-Urban', tier: 'business', condition: 95, fuel: 100, tirePressure: 90, engineHealth: 100 },
            ];
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 5000;
            gs.fuelTankCapacity = 10000;

            sandbox.renderTabFleet();

            const container = sandbox.document.getElementById('tab-container');
            assert.ok(container.innerHTML.includes('Gestione Flotta'));
            assert.ok(container.innerHTML.includes('Stellar E-Executive'));
            assert.ok(container.innerHTML.includes('Volt 3-Urban'));
            assert.ok(container.innerHTML.includes('Deposito Aziendale'));
        });

        test('bulkRepairFleet ripara tutte le auto danneggiate nel gruppo (supporta array o stringa JSON)', async () => {
            const { sandbox, gs, rpcCalls } = amb;
            gs.fleet = [
                { id: 'c_bulk_1', _serverId: 'srv_b1', name: 'Stellar E 1', condition: 70, engineHealth: 100 },
                { id: 'c_bulk_2', _serverId: 'srv_b2', name: 'Stellar E 2', condition: 85, engineHealth: 100 },
                { id: 'c_bulk_3', _serverId: 'srv_b3', name: 'Stellar E 3', condition: 100, engineHealth: 100 },
            ];
            gs.cash = 20000;

            // Chiamata con array di ID
            sandbox.bulkRepairFleet(['c_bulk_1', 'c_bulk_2']);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(rpcCalls.length, 2);

            // Chiamata con stringa JSON (come da event delegation markup)
            gs.fleet[0].condition = 60;
            sandbox.bulkRepairFleet(JSON.stringify(['c_bulk_1']));
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(rpcCalls.length, 3);
        });
    });
});
