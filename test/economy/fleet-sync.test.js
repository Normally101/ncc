'use strict';
/* ============================================================================
   test/economy/fleet-sync.test.js

   Regressione per le operazioni economiche della flotta in engine-fleet.js:
   ogni spesa e ogni incasso DEVONO passare dalla porta unica del denaro
   (CE_money.spend, earn, spendDC, earnDC) e sincronizzarsi col server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupFleetEnv() {
    const syncedCash = [];
    const dcSpends = [];
    const ceMoneyCalls = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            spendDriverCoins: async (motivo, n) => {
                dcSpends.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
        },
    });

    const sandbox = env.sandbox;
    const origSpend = sandbox.CE_money.spend;
    const origEarn = sandbox.CE_money.earn;
    const origSpendDC = sandbox.CE_money.spendDC;

    sandbox.CE_money.spend = function(importo, motivo) {
        ceMoneyCalls.push({ type: 'spend', importo, motivo });
        return origSpend.call(this, importo, motivo);
    };
    sandbox.CE_money.earn = function(importo, motivo) {
        ceMoneyCalls.push({ type: 'earn', importo, motivo });
        return origEarn.call(this, importo, motivo);
    };
    sandbox.CE_money.spendDC = function(quantita, motivo) {
        ceMoneyCalls.push({ type: 'spendDC', quantita, motivo });
        return origSpendDC.call(this, quantita, motivo);
    };

    return { env, sandbox, gs: sandbox.gameState, syncedCash, dcSpends, ceMoneyCalls };
}

describe('flotta — sincronizzazione economica col server (CE_money)', () => {

    describe('buyCARUpgrade', () => {
        test('passa da CE_money.spend e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            const car = gs.fleet[0];
            const upg = sandbox.CAR_UPGRADES[0]; // es. wifi (2500)
            gs.cash = 10000;
            const expectedCash = 10000 - upg.price;

            sandbox.buyCARUpgrade(car.id, upg.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il cash locale deve essere scalato');
            assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il nuovo saldo');
            const spendCall = ceMoneyCalls.find(c => c.type === 'spend' && c.importo === upg.price);
            assert.ok(spendCall, 'buyCARUpgrade deve usare CE_money.spend');
        });

        test('fondi insufficienti: non applica upgrade e non muta cassa', async () => {
            const { sandbox, gs, syncedCash } = setupFleetEnv();
            const car = gs.fleet[0];
            const upg = sandbox.CAR_UPGRADES[0];
            gs.cash = upg.price - 100;

            sandbox.buyCARUpgrade(car.id, upg.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, upg.price - 100);
            assert.deepEqual(syncedCash, []);
            assert.ok(!car.upgrades || !car.upgrades.includes(upg.id));
        });
    });

    describe('buyHub e sellHub', () => {
        test('buyHub spende via CE_money e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.cash = 100000;
            gs.reputation = 4.0;
            const hubId = 'milano_centrale';
            const hub = sandbox.POIS[hubId];
            const expectedCost = 50000 + Math.floor(hub.baseFlat * 200);

            sandbox.buyHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000 - expectedCost);
            assert.deepEqual(syncedCash, [100000 - expectedCost]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === expectedCost));
            assert.ok(gs.ownedHubs.includes(hubId));
        });

        test('sellHub accredita via CE_money.earn e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.cash = 50000;
            const hubId = 'milano_centrale';
            const hub = sandbox.POIS[hubId];
            gs.ownedHubs = [hubId];
            const expectedEarn = Math.floor((50000 + Math.floor(hub.baseFlat * 200)) * 0.6);

            sandbox.sellHub(hubId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000 + expectedEarn);
            assert.deepEqual(syncedCash, [50000 + expectedEarn]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'earn' && c.importo === expectedEarn));
            assert.ok(!gs.ownedHubs.includes(hubId));
        });
    });

    describe('buyMaintenanceContract', () => {
        test('spende 10.000€ via CE_money.spend e sincronizza col server', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.cash = 20000;

            sandbox.buyMaintenanceContract();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, [10000]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === 10000));
            assert.equal(gs.maintenanceContract, true);
        });
    });

    describe('upgradeFuelDepot', () => {
        test('spende via CE_money.spend e aggiorna livello cisterna', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTankLevel = 1;
            gs.cash = 50000;
            const expectedCost = Math.round(5000 * Math.pow(1, 1.8));

            sandbox.upgradeFuelDepot();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000 - expectedCost);
            assert.deepEqual(syncedCash, [50000 - expectedCost]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === expectedCost));
            assert.equal(gs.fuelTankLevel, 2);
        });
    });

    describe('buyFuelForDepot', () => {
        test('spende via CE_money.spend e carica cisterna', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.fuelTank = 0;
            gs.fuelTankCapacity = 10000;
            gs.fuelTankLevel = 1;
            gs.fuelPrice = 2.0;
            gs.cash = 50000;

            sandbox.buyFuelForDepot(1000);
            await new Promise(r => setImmediate(r));

            const expectedCost = 1000 * 2.0; // 2000
            assert.equal(gs.cash, 50000 - expectedCost);
            assert.deepEqual(syncedCash, [50000 - expectedCost]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === expectedCost));
            assert.equal(gs.fuelTank, 1000);
        });
    });

    describe('buyTiresForDepot', () => {
        test('spende via CE_money.spend e carica gomme', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.investments = ['inv_fuel_depot'];
            gs.depositoGomme = 0;
            gs.cash = 20000;
            const sets = 5;
            const expectedCost = 5 * 800; // 4000

            sandbox.buyTiresForDepot(sets);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000 - expectedCost);
            assert.deepEqual(syncedCash, [20000 - expectedCost]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === expectedCost));
            assert.equal(gs.depositoGomme, 5);
        });
    });

    describe('emergencyRefuel', () => {
        test('spende via CE_money.spend e rifornisce auto ferme', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            const car = gs.fleet[0];
            car.outOfService = 'fuel';
            gs.fuelPrice = 2.0;
            gs.cash = 20000;
            const expectedCost = Math.ceil(80 * (2.0 * 3)); // 480

            sandbox.emergencyRefuel();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000 - expectedCost);
            assert.deepEqual(syncedCash, [20000 - expectedCost]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === expectedCost));
            assert.equal(car.outOfService, null);
            assert.equal(car.fuel, 100);
        });
    });

    describe('instantRepairDC', () => {
        test('spende Driver Coins via CE_money.spendDC e chiama ServerState.spendDriverCoins', async () => {
            const { sandbox, gs, dcSpends, ceMoneyCalls } = setupFleetEnv();
            const car = gs.fleet[0];
            car.condition = 50;
            gs.driverCoins = 20;

            sandbox.instantRepairDC(car.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 18);
            assert.deepEqual(dcSpends, [{ motivo: 'instant_repair_dc', n: 2 }]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spendDC' && c.quantita === 2));
            assert.equal(car.condition, 100);
        });
    });

    describe('applyVehicleSkin', () => {
        test('spende Driver Coins via CE_money.spendDC e applica la skin', async () => {
            const { sandbox, gs, dcSpends, ceMoneyCalls } = setupFleetEnv();
            const car = gs.fleet[0];
            gs.driverCoins = 30;
            const skin = sandbox.VEHICLE_SKINS[0]; // es. matte_black, cost: 10

            sandbox.applyVehicleSkin(car.id, skin.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 30 - skin.cost);
            assert.deepEqual(dcSpends, [{ motivo: 'vehicle_skin', n: skin.cost }]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spendDC' && c.quantita === skin.cost));
            assert.equal(car.skin, skin.id);
        });
    });

    describe('terminateLease', () => {
        test('spende penale leasing via CE_money.spend e rimuove veicolo', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            const car = {
                id: 'lease_car_1',
                name: 'Lease Car',
                isLease: true,
                leaseDuration: 12,
                leaseElapsedDays: 30, // 11 mesi rimanenti
                leaseMonthlyRate: 1000,
            };
            gs.fleet.push(car);
            gs.cash = 50000;
            // penalty: 11 * 1000 * 0.5 = 5500
            const expectedPenalty = Math.round(11 * 1000 * 0.5);

            sandbox.terminateLease('lease_car_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000 - expectedPenalty);
            assert.deepEqual(syncedCash, [50000 - expectedPenalty]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === expectedPenalty));
            assert.ok(!gs.fleet.some(c => c.id === 'lease_car_1'));
        });
    });

    describe('buyPrototypeCar', () => {
        test('spende via CE_money.spend e aggiunge prototipo in flotta', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            const proto = sandbox.PROTOTYPE_CARS[0];
            gs.reputation = proto.reqRep + 1;
            gs.cash = proto.price + 50000;
            gs.questStats = { totalRides: (proto.rideGate || 0) + 10 };
            const initialCash = gs.cash;

            sandbox.buyPrototypeCar(proto.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, initialCash - proto.price);
            assert.deepEqual(syncedCash, [initialCash - proto.price]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === proto.price));
            assert.ok(gs.fleet.some(c => c.protoId === proto.id));
        });
    });

    describe('buyNpcCar', () => {
        test('spende via CE_money.spend e aggiunge auto da mercato usato', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            const listing = {
                id: 'npc_1',
                name: 'Used Sedan',
                tier: 'business',
                price: 15000,
                condition: 80,
                mileage: 50000,
            };
            gs.npcMarket = [listing];
            gs.cash = 30000;

            sandbox.buyNpcCar('npc_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 15000);
            assert.deepEqual(syncedCash, [15000]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === 15000));
            assert.ok(gs.fleet.some(c => c.name === 'Used Sedan'));
            assert.equal(gs.npcMarket.length, 0);
        });
    });

    describe('bidOnAuction', () => {
        test('gestisce offerta e rimborso rilanci via CE_money.spend / earn', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            gs.activeAuction = {
                currentBid: 5000,
                playerBid: 0,
                name: 'Asta Flotta',
            };
            gs.cash = 50000;

            // Prima offerta a 7000
            sandbox.bidOnAuction(7000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 43000);
            assert.deepEqual(syncedCash, [43000]);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === 7000));

            // Rilancio a 9000 (rimborsa 7000 e spende 9000)
            sandbox.bidOnAuction(9000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 41000);
            assert.ok(ceMoneyCalls.some(c => c.type === 'earn' && c.importo === 7000));
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend' && c.importo === 9000));
            assert.equal(gs.activeAuction.playerBid, 9000);
        });
    });

    describe('returnToHub', () => {
        test('spende costi di rientro via CE_money.spend e mette autista in riposo', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupFleetEnv();
            const car = gs.fleet[0];
            car.currentPoiId = 'milano_centrale';
            const driver = gs.drivers[0];
            driver.assignedCarId = car.id;
            driver.status = 'idle';
            gs.cash = 10000;

            sandbox.returnToHub(car.id);
            await new Promise(r => setImmediate(r));

            assert.ok(gs.cash < 10000, 'il cash deve diminuire');
            assert.equal(syncedCash.length, 1);
            assert.equal(syncedCash[0], gs.cash);
            assert.ok(ceMoneyCalls.some(c => c.type === 'spend'));
            assert.equal(driver.status, 'resting');
            assert.equal(driver._returning, true);
        });
    });
});
