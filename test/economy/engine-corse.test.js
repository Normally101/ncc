'use strict';
/* ============================================================================
   test/economy/engine-corse.test.js

   Regressione per le riparazioni carrozzeria e movimentazioni denaro corse in engine.js:
   ogni spesa e ogni incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzarsi col server (ServerState.syncCash).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEngineCorseEnv() {
    const syncedCash = [];
    const ceMoneyCalls = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            repairVehicle: async () => {
                // Non muta il cash direttamente: ci pensa CE_money.spend
                return { success: true };
            },
        },
    });

    const origSpend = env.sandbox.CE_money.spend;
    env.sandbox.CE_money.spend = function (amount, reason) {
        ceMoneyCalls.push({ type: 'spend', amount, reason });
        return origSpend.apply(this, arguments);
    };

    const origEarn = env.sandbox.CE_money.earn;
    env.sandbox.CE_money.earn = function (amount, reason) {
        ceMoneyCalls.push({ type: 'earn', amount, reason });
        return origEarn.apply(this, arguments);
    };

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, ceMoneyCalls };
}

describe('engine.js — riparazioni e cassa corse via porta unica (CE_money)', () => {

    describe('payToRepairCar', () => {
        test('payToRepairCar scala il costo di riparazione e sincronizza la cassa col server tramite CE_money.spend', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            const car = {
                id: 'car_repair_1',
                _serverId: 'srv_car_1',
                name: 'Berlina Executive',
                tier: 'business',
                condition: 40,
                isLease: false,
                outOfService: 'condition',
            };
            gs.fleet.push(car);
            gs.cash = 10000;
            const expectedCost = (100 - 40) * 85; // 5100€
            const expectedCash = 10000 - expectedCost; // 4900€

            await sandbox.payToRepairCar('car_repair_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash, 'il saldo locale deve essere scalato');
            const spendCalls = ceMoneyCalls.filter(c => c.type === 'spend');
            assert.equal(spendCalls.length, 1, 'deve passare esattamente una volta da CE_money.spend');
            assert.equal(spendCalls[0].amount, expectedCost, 'l\'importo scalato deve coincidere con repairCostFor');
            assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
            assert.equal(car.condition, 100, 'la condizione deve tornare al 100%');
            assert.equal(car.outOfService, null, 'outOfService deve essere azzerato');
        });

        test('payToRepairCar con fondi insufficienti non spende, non ripara e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            const car = {
                id: 'car_repair_broke',
                _serverId: 'srv_car_broke',
                name: 'Berlina Usurata',
                tier: 'business',
                condition: 40,
                isLease: false,
                outOfService: 'condition',
            };
            gs.fleet.push(car);
            gs.cash = 1000; // servono 5100€

            await sandbox.payToRepairCar('car_repair_broke');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000, 'il saldo non deve cambiare');
            assert.equal(ceMoneyCalls.length, 1, 'CE_money.spend viene chiamato ma fallisce');
            assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamato su fondi insufficienti');
            assert.equal(car.condition, 40, 'la condizione non deve cambiare');
            assert.equal(car.outOfService, 'condition');
        });

        test('payToRepairCar con Kasko ripara gratuitamente senza spendere e senza sincronizzare', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            const car = {
                id: 'car_kasko',
                _serverId: 'srv_kasko',
                name: 'Auto Protetta',
                tier: 'business',
                condition: 30,
                isLease: false,
                outOfService: 'condition',
            };
            gs.fleet.push(car);
            gs.investments.push('inv_kasko');
            gs.cash = 10000;

            await sandbox.payToRepairCar('car_kasko');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000, 'il saldo non deve cambiare');
            assert.equal(ceMoneyCalls.length, 0, 'nessuna chiamata a CE_money per riparazione kasko');
            assert.deepEqual(syncedCash, []);
            assert.equal(car.condition, 100, 'la condizione deve tornare al 100%');
            assert.equal(car.outOfService, null);
        });

        test('payToRepairCar con motore fuso non spende, non ripara e non sincronizza', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            const car = {
                id: 'car_broken_engine',
                _serverId: 'srv_broken_eng',
                name: 'Auto con Motore Fuso',
                tier: 'business',
                condition: 40,
                engineHealth: 0,
                isLease: false,
            };
            gs.fleet.push(car);
            gs.cash = 10000;

            await sandbox.payToRepairCar('car_broken_engine');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.equal(ceMoneyCalls.length, 0);
            assert.deepEqual(syncedCash, []);
            assert.equal(car.condition, 40);
        });

        test('payToRepairCar con veicolo già al 100% non spende e non sincronizza', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            const car = {
                id: 'car_perfect',
                _serverId: 'srv_perfect',
                name: 'Auto Perfetta',
                tier: 'business',
                condition: 100,
                isLease: false,
            };
            gs.fleet.push(car);
            gs.cash = 10000;

            await sandbox.payToRepairCar('car_perfect');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.equal(ceMoneyCalls.length, 0);
            assert.deepEqual(syncedCash, []);
        });

        test('payToRepairCar applica sconti (Capo Officina, Officina Mobile, Contratto) e sincronizza la spesa scontata', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            const car = {
                id: 'car_discounted',
                _serverId: 'srv_discounted',
                name: 'Auto Scontata',
                tier: 'business',
                condition: 40,
                isLease: false,
            };
            gs.fleet.push(car);
            gs.staff.push({ id: 'mech', name: 'Capo Officina' });
            gs.investments.push('inv_mobile_workshop');
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = (gs.day || 1) + 5;
            gs.cash = 20000;

            // 60 punti * 85 = 5100; * 0.70 (contratto) = 3570; * 0.50 (mech) = 1785; * 0.80 (workshop) = 1428
            const expectedCost = 1428;
            const expectedCash = 20000 - expectedCost;

            await sandbox.payToRepairCar('car_discounted');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, expectedCash);
            const spendCalls = ceMoneyCalls.filter(c => c.type === 'spend');
            assert.equal(spendCalls.length, 1);
            assert.equal(spendCalls[0].amount, expectedCost);
            assert.deepEqual(syncedCash, [expectedCash]);
            assert.equal(car.condition, 100);
        });
    });

    describe('_addCash', () => {
        test('_addCash accredita denaro tramite CE_money.earn e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            gs.cash = 1500;

            const res = sandbox._addCash(500);
            await new Promise(r => setImmediate(r));

            assert.equal(res, 2000);
            assert.equal(gs.cash, 2000);
            const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
            assert.equal(earnCalls.length, 1);
            assert.equal(earnCalls[0].amount, 500);
            assert.deepEqual(syncedCash, [2000]);
        });

        test('_addCash con NaN o valore non finito non modifica il saldo e non sincronizza', async () => {
            const { sandbox, gs, syncedCash, ceMoneyCalls } = setupEngineCorseEnv();
            gs.cash = 1500;

            const res = sandbox._addCash(NaN);
            await new Promise(r => setImmediate(r));

            assert.equal(res, 1500);
            assert.equal(gs.cash, 1500);
            assert.equal(ceMoneyCalls.length, 0);
            assert.deepEqual(syncedCash, []);
        });
    });
});
