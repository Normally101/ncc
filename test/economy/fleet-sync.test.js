'use strict';
/* ============================================================================
   test/economy/fleet-sync.test.js

   Regressione per le operazioni di flotta in engine-fleet.js:
   ogni spesa e ogni incasso DEVONO passare da CE_money (spend / earn / spendDC)
   e sincronizzarsi col server (ServerState.syncCash / ServerState.spendDriverCoins).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupFleetEnv() {
    const syncedCash = [];
    const spentDC = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            spendDriverCoins: async (reason, amount) => {
                spentDC.push({ reason, amount });
                const current = env.sandbox.gameState.driverCoins || 0;
                return { success: true, driver_coins: current };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, spentDC };
}

describe('flotta — sincronizzazione cassa e DC col server (CE_money)', () => {

    describe('buyCARUpgrade', () => {
        test('buyCARUpgrade scala il costo e sincronizza la cassa col server tramite CE_money', async () => {
            const { env, sandbox, gs, syncedCash } = setupFleetEnv();
            const CAR_UPGRADES = vm.runInContext('CAR_UPGRADES', env.sandbox);
            const upg = CAR_UPGRADES[0];
            gs.fleet = [{ id: 'car_1', name: 'Auto Test', upgrades: [] }];
            gs.cash = upg.price + 5000;
            const expectedCash = gs.cash - upg.price;

            sandbox.buyCARUpgrade('car_1', upg.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve essere scalato');
            assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
            assert.ok(gs.fleet[0].upgrades.includes(upg.id), 'l\'upgrade deve essere registrato sul veicolo');
        });

        test('buyCARUpgrade con fondi insufficienti non spende, non aggiunge upgrade e non chiama syncCash', async () => {
            const { env, sandbox, gs, syncedCash } = setupFleetEnv();
            const CAR_UPGRADES = vm.runInContext('CAR_UPGRADES', env.sandbox);
            const upg = CAR_UPGRADES[0];
            gs.fleet = [{ id: 'car_1', name: 'Auto Test', upgrades: [] }];
            gs.cash = upg.price - 1;

            sandbox.buyCARUpgrade('car_1', upg.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, upg.price - 1, 'il saldo locale non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione su fondi insufficienti');
            assert.equal(gs.fleet[0].upgrades.length, 0, 'nessun upgrade aggiunto');
        });
    });

    describe('buyHub e sellHub', () => {
        test('buyHub scala il prezzo dell\'hub e sincronizza con ServerState.syncCash', async () => {
            const { env, sandbox, gs, syncedCash } = setupFleetEnv();
            const POIS = vm.runInContext('POIS', env.sandbox);
            const poiKeys = Object.keys(POIS);
            const hubId = poiKeys[0];
            const hub = POIS[hubId];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);

            gs.reputation = 4.0;
            gs.ownedHubs = [];
            gs.cash = cost + 10000;
            const expectedCash = gs.cash - cost;

            sandbox.buyHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve scalare del costo hub');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il nuovo saldo');
            assert.ok(gs.ownedHubs.includes(hubId), 'l\'hub deve essere tra quelli posseduti');
        });

        test('buyHub con fondi insufficienti non acquista e non sincronizza', async () => {
            const { env, sandbox, gs, syncedCash } = setupFleetEnv();
            const POIS = vm.runInContext('POIS', env.sandbox);
            const hubId = Object.keys(POIS)[0];
            const hub = POIS[hubId];
            const cost = 50000 + Math.floor(hub.baseFlat * 200);

            gs.reputation = 4.0;
            gs.ownedHubs = [];
            gs.cash = cost - 100;

            sandbox.buyHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, cost - 100, 'il saldo deve rimanere invariato');
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.ownedHubs.length, 0);
        });

        test('sellHub accredita il 60% del valore e sincronizza con ServerState.syncCash', async () => {
            const { env, sandbox, gs, syncedCash } = setupFleetEnv();
            const POIS = vm.runInContext('POIS', env.sandbox);
            const hubId = Object.keys(POIS)[0];
            const hub = POIS[hubId];
            const resaleValue = Math.floor((50000 + Math.floor(hub.baseFlat * 200)) * 0.6);

            gs.ownedHubs = [hubId];
            gs.cash = 20000;
            const expectedCash = gs.cash + resaleValue;

            sandbox.sellHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve aumentare del valore di rivendita');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il saldo aumentato');
            assert.ok(!gs.ownedHubs.includes(hubId), 'l\'hub non deve più essere posseduto');
        });
    });

    describe('buyMaintenanceContract', () => {
        test('buyMaintenanceContract scala 10.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 25000;
            gs.day = 5;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000, 'il saldo locale deve essere scalato di 10.000€');
            assert.deepEqual(syncedCash, [15000], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 12);
        });

        test('buyMaintenanceContract con fondi insufficienti non attiva il contratto e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.cash = 5000;
            gs.maintenanceContract = false;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.maintenanceContract, false);
        });
    });

    describe('upgradeFuelDepot', () => {
        test('upgradeFuelDepot scala il costo livello e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;
            const cost = Math.round(5000 * Math.pow(1, 1.8)); // 5000
            gs.cash = 20000;
            const expectedCash = gs.cash - cost;

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo deve essere scalato del costo di potenziamento');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
        });

        test('upgradeFuelDepot con fondi insufficienti non potenzia e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.cash = 1000;

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.fuelTankLevel, 1);
        });
    });

    describe('buyFuelForDepot', () => {
        test('buyFuelForDepot scala il costo carburante e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 0;
            gs.fuelTankCapacity = 10000;
            gs.fuelTankLevel = 1;
            gs.fuelPrice = 2.00;
            gs.activeLobbyLaws = [];
            const litres = 1000;
            const cost = litres * 2.00; // 2000
            gs.cash = 10000;
            const expectedCash = gs.cash - cost;

            sandbox.buyFuelForDepot(litres);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve essere scalato');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(gs.fuelTank, 1000, 'il serbatoio deve essere rifornito');
        });

        test('buyFuelForDepot con fondi insufficienti non rifornisce e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 0;
            gs.fuelTankCapacity = 10000;
            gs.fuelPrice = 2.00;
            gs.cash = 500;

            sandbox.buyFuelForDepot(1000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.fuelTank, 0);
        });
    });

    describe('buyTiresForDepot', () => {
        test('buyTiresForDepot scala 800€ a treno gomme e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 0;
            gs.cash = 10000;
            const sets = 3;
            const cost = 3 * 800; // 2400
            const expectedCash = gs.cash - cost;

            sandbox.buyTiresForDepot(sets);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve essere scalato');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(gs.depositoGomme, 3);
        });

        test('buyTiresForDepot con fondi insufficienti non aggiunge gomme e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 0;
            gs.cash = 500;

            sandbox.buyTiresForDepot(2);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.depositoGomme, 0);
        });
    });

    describe('emergencyRefuel', () => {
        test('emergencyRefuel rifornisce le auto ferme, scala il costo triplo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.fleet = [
                { id: 'c1', name: 'Auto 1', fuel: 0, outOfService: 'fuel' },
                { id: 'c2', name: 'Auto 2', fuel: 0, outOfService: 'fuel' },
                { id: 'c3', name: 'Auto 3', fuel: 50, outOfService: null },
            ];
            gs.fuelPrice = 2.00;
            // 2 auto * 80 litri = 160 litri * (2.00 * 3) = 960€
            const cost = 960;
            gs.cash = 5000;
            const expectedCash = gs.cash - cost;

            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve scalare');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
        });

        test('emergencyRefuel con fondi insufficienti non rifornisce e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.fleet = [
                { id: 'c1', name: 'Auto 1', fuel: 0, outOfService: 'fuel' },
            ];
            gs.fuelPrice = 2.00;
            gs.cash = 100; // servono 80 * 6 = 480€

            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.fleet[0].fuel, 0);
            assert.equal(gs.fleet[0].outOfService, 'fuel');
        });
    });

    describe('instantRepairDC', () => {
        test('instantRepairDC spende Driver Coins tramite ServerState.spendDriverCoins e ripara il veicolo', async () => {
            const { sandbox, gs, spentDC } = setupFleetEnv();
            gs.fleet = [{ id: 'c1', name: 'Auto Test', condition: 40, outOfService: 'condition' }];
            gs.driverCoins = 10;
            gs.executivePassActive = false; // costo = 2 DC

            sandbox.instantRepairDC('c1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 8, 'i DC locali devono scalare di 2');
            assert.deepEqual(spentDC, [{ reason: 'instant_repair_dc', amount: 2 }], 'ServerState.spendDriverCoins deve essere chiamata');
            assert.equal(gs.fleet[0].condition, 100, 'la condizione deve tornare al 100%');
            assert.equal(gs.fleet[0].outOfService, null, 'outOfService deve essere azzerato');
        });

        test('instantRepairDC con DC insufficienti non spende, non ripara e non chiama spendDriverCoins', async () => {
            const { sandbox, gs, spentDC } = setupFleetEnv();
            gs.fleet = [{ id: 'c1', name: 'Auto Test', condition: 40, outOfService: 'condition' }];
            gs.driverCoins = 1;
            gs.executivePassActive = false; // costo = 2 DC

            sandbox.instantRepairDC('c1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 1, 'i DC locali non devono cambiare');
            assert.deepEqual(spentDC, [], 'nessuna chiamata a spendDriverCoins');
            assert.equal(gs.fleet[0].condition, 40, 'la condizione deve rimanere invariata');
            assert.equal(gs.fleet[0].outOfService, 'condition');
        });
    });

    describe('applyVehicleSkin', () => {
        test('applyVehicleSkin spende Driver Coins e applica la skin', async () => {
            const { sandbox, gs, spentDC } = setupFleetEnv();
            gs.fleet = [{ id: 'c1', name: 'Auto Test', skin: null }];
            gs.driverCoins = 20;

            sandbox.applyVehicleSkin('c1', 'matte_black'); // cost 10 DC
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 10, 'i DC locali devono scalare di 10');
            assert.deepEqual(spentDC, [{ reason: 'vehicle_skin', amount: 10 }]);
            assert.equal(gs.fleet[0].skin, 'matte_black');
        });

        test('applyVehicleSkin con DC insufficienti non applica la skin', async () => {
            const { sandbox, gs, spentDC } = setupFleetEnv();
            gs.fleet = [{ id: 'c1', name: 'Auto Test', skin: null }];
            gs.driverCoins = 5;

            sandbox.applyVehicleSkin('c1', 'matte_black');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 5);
            assert.deepEqual(spentDC, []);
            assert.equal(gs.fleet[0].skin, null);
        });
    });

    describe('terminateLease', () => {
        test('terminateLease scala la penale calcolata e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            sandbox.confirm = () => true;
            gs.fleet = [{
                id: 'c_lease',
                name: 'Auto Lease',
                isLease: true,
                leaseDuration: 12,
                leaseElapsedDays: 30, // 11 mesi rimanenti
                leaseMonthlyRate: 1000,
            }];
            // remainingDays = 360 - 30 = 330; remainingMonths = ceil(330/30) = 11; penalty = round(11 * 1000 * 0.5) = 5500
            const penalty = 5500;
            gs.cash = 20000;
            const expectedCash = gs.cash - penalty;

            sandbox.terminateLease('c_lease');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo deve scalare della penale');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.fleet.length, 0, 'il veicolo deve essere rimosso dalla flotta');
        });

        test('terminateLease con fondi insufficienti non cancella il leasing e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            sandbox.confirm = () => true;
            gs.fleet = [{
                id: 'c_lease',
                name: 'Auto Lease',
                isLease: true,
                leaseDuration: 12,
                leaseElapsedDays: 30,
                leaseMonthlyRate: 1000,
            }];
            gs.cash = 1000; // servono 5500

            sandbox.terminateLease('c_lease');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.fleet.length, 1);
        });
    });

    describe('buyPrototypeCar', () => {
        test('buyPrototypeCar scala il prezzo e sincronizza con ServerState.syncCash', async () => {
            const { env, sandbox, gs, syncedCash } = setupFleetEnv();
            const PROTOTYPE_CARS = vm.runInContext('PROTOTYPE_CARS', env.sandbox);
            const proto = PROTOTYPE_CARS[0];
            gs.fleet = [];
            gs.reputation = proto.reqRep + 1;
            gs.questStats = { totalRides: (proto.rideGate || 0) + 10 };
            gs.hasEVHub = true;
            gs.cash = proto.price + 50000;
            const expectedCash = gs.cash - proto.price;

            sandbox.buyPrototypeCar(proto.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo deve scalare');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].protoId, proto.id);
        });
    });

    describe('buyNpcCar', () => {
        test('buyNpcCar scala il prezzo dell\'auto e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.fleet = [];
            gs.npcMarket = [{
                id: 'npc_1',
                name: 'Auto Usata',
                tier: 'business',
                price: 15000,
                condition: 80,
                mileage: 50000,
            }];
            gs.cash = 25000;
            const expectedCash = gs.cash - 15000;

            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo deve scalare');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il saldo aggiornato');
            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.npcMarket.length, 0);
        });
    });

    describe('bidOnAuction', () => {
        test('bidOnAuction rimborsa offerta precedente e scala nuova offerta sincronizzando la cassa', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.activeAuction = {
                name: 'Asta Flotta',
                currentBid: 20000,
                playerBid: 15000,
            };
            gs.cash = 30000;
            // Nuova offerta: 25000. gs.cash passa da 30000 -> +15000 (45000) -> -25000 (20000)
            sandbox.bidOnAuction(25000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000, 'il saldo netto deve essere 20.000€');
            assert.deepEqual(syncedCash, [45000, 20000], 'syncCash deve ricevere il rimborso e poi la nuova spesa');
            assert.equal(gs.activeAuction.playerBid, 25000);
            assert.equal(gs.activeAuction.currentBid, 25000);
        });

        test('bidOnAuction con liquidità insufficiente non effettua l\'offerta e non tocca la cassa', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.activeAuction = {
                name: 'Asta Flotta',
                currentBid: 20000,
                playerBid: 5000,
            };
            gs.cash = 10000; // cash + playerBid = 15000 < 25000

            sandbox.bidOnAuction(25000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.activeAuction.playerBid, 5000);
        });
    });

    describe('returnToHub', () => {
        test('returnToHub calcola carburante e pedaggi, scala la spesa e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.fleet = [{ id: 'c1', name: 'Auto Test', currentPoiId: 'milano' }];
            gs.drivers = [{ id: 'd1', name: 'Mario', assignedCarId: 'c1', status: 'idle' }];
            gs.investments = [];
            gs.cash = 5000;

            sandbox.returnToHub('c1');
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash < 5000, 'il cash deve diminuire');
            assert.equal(syncedCash.length, 1, 'syncCash deve essere chiamata una volta col nuovo totale');
            assert.equal(syncedCash[0], gs.cash, 'il valore mandato a syncCash deve coincidere col saldo');
            assert.equal(gs.drivers[0].status, 'resting');
        });

        test('returnToHub con fondi insufficienti non avvia il rientro e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            gs.fleet = [{ id: 'c1', name: 'Auto Test', currentPoiId: 'milano' }];
            gs.drivers = [{ id: 'd1', name: 'Mario', assignedCarId: 'c1', status: 'idle' }];
            gs.investments = [];
            gs.cash = 0;

            sandbox.returnToHub('c1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 0);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.drivers[0].status, 'idle');
        });
    });
});
