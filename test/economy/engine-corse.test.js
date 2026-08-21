'use strict';
/* ============================================================================
   test/economy/engine-corse.test.js

   Regressione per le corse e riparazioni in engine.js:
   ogni spesa e ogni incasso DEVONO passare da CE_money (spend / earn / addReputation)
   e sincronizzarsi col server (ServerState.syncCash / ServerState.repairVehicle).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('engine — corse e riparazioni con CE_money', () => {
    describe('_triggerVIPMidRideEvent', () => {
        test('scelta A con costo scala denaro e aggiunge reputazione sincronizzando tramite CE_money', () => {
            const { env, sandbox, gs, syncedCash } = setupEnv();
            const VIP_EVENTS = vm.runInContext('VIP_EVENTS', env.sandbox);
            // Troviamo un evento con costA > 0
            const eventWithCost = VIP_EVENTS.find(e => e.costA > 0);
            assert.ok(eventWithCost, 'Deve esistere almeno un evento VIP con costA > 0');

            gs.cash = 2000;
            gs.reputation = 3.0;
            gs.prestige = 0;
            gs.drivers = [{ id: 'd1', name: 'Mario', assignedCarId: 'c1', status: 'busy' }];
            const ride = { id: 1, driverId: 'd1', toPoi: { name: 'Roma Centro' } };

            const origRandom = sandbox.Math.random;
            const eventIdx = VIP_EVENTS.indexOf(eventWithCost);
            sandbox.Math.random = () => (eventIdx + 0.01) / VIP_EVENTS.length;

            try {
                sandbox._triggerVIPMidRideEvent(ride);
                const btnA = sandbox.document.getElementById('vip-toast-a');
                assert.ok(btnA, 'Il pulsante A deve essere presente');
                btnA.onclick();

                const expectedCash = 2000 - eventWithCost.costA;
                const expectedRep = 3.0 + eventWithCost.repA;
                assert.equal(gs.cash, expectedCash, 'Il cash deve essere scalato');
                assert.equal(gs.reputation, expectedRep, 'La reputazione deve essere incrementata');
                assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
            } finally {
                sandbox.Math.random = origRandom;
            }
        });

        test('scelta A con fondi insufficienti non addebita, non modifica reputazione e non sincronizza', () => {
            const { env, sandbox, gs, syncedCash } = setupEnv();
            const VIP_EVENTS = vm.runInContext('VIP_EVENTS', env.sandbox);
            const eventWithCost = VIP_EVENTS.find(e => e.costA > 0);

            gs.cash = 50; // insufficiente per costA >= 200
            gs.reputation = 3.0;
            gs.drivers = [{ id: 'd1', name: 'Mario', assignedCarId: 'c1', status: 'busy' }];
            const ride = { id: 1, driverId: 'd1', toPoi: { name: 'Roma Centro' } };

            const origRandom = sandbox.Math.random;
            const eventIdx = VIP_EVENTS.indexOf(eventWithCost);
            sandbox.Math.random = () => (eventIdx + 0.01) / VIP_EVENTS.length;

            try {
                sandbox._triggerVIPMidRideEvent(ride);
                const btnA = sandbox.document.getElementById('vip-toast-a');
                btnA.onclick();

                assert.equal(gs.cash, 50, 'Il cash non deve essere modificato');
                assert.equal(gs.reputation, 3.0, 'La reputazione non deve essere modificata');
                assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamata su errore fondi');
            } finally {
                sandbox.Math.random = origRandom;
            }
        });

        test('scelta B aggiunge reputazione tramite CE_money.addReputation senza toccare cash', () => {
            const { env, sandbox, gs, syncedCash } = setupEnv();
            const VIP_EVENTS = vm.runInContext('VIP_EVENTS', env.sandbox);
            const eventWithCost = VIP_EVENTS.find(e => e.costA > 0);

            gs.cash = 2000;
            gs.reputation = 3.0;
            gs.drivers = [{ id: 'd1', name: 'Mario', assignedCarId: 'c1', status: 'busy' }];
            const ride = { id: 1, driverId: 'd1', toPoi: { name: 'Roma Centro' } };

            const origRandom = sandbox.Math.random;
            const eventIdx = VIP_EVENTS.indexOf(eventWithCost);
            sandbox.Math.random = () => (eventIdx + 0.01) / VIP_EVENTS.length;

            try {
                sandbox._triggerVIPMidRideEvent(ride);
                const btnB = sandbox.document.getElementById('vip-toast-b');
                btnB.onclick();

                const expectedRep = Math.max(0, 3.0 + eventWithCost.repB);
                assert.equal(gs.cash, 2000, 'Il cash non deve cambiare');
                assert.equal(gs.reputation, expectedRep, 'La reputazione deve essere aggiornata');
                assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamata se il cash non cambia');
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('acceptDiamondContract', () => {
        test('acceptDiamondContract accredita compenso e reputazione sincronizzando la cassa', () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 10000;
            gs.reputation = 4.0;
            gs.prestige = 0;
            gs.drivers = [
                { id: 'd_vip', name: 'Driver VIP', status: 'idle', level: 3, tier: 'vip', assignedCarId: 'c_vip' },
            ];
            gs.fleet = [
                { id: 'c_vip', name: 'Auto VIP', tier: 'vip', condition: 100 },
            ];
            gs.emails = [
                { id: 'email_diamond_1', type: 'diamond_contract', offer: 45000, status: 'pending' },
            ];

            sandbox.acceptDiamondContract('email_diamond_1');

            const expectedCash = 10000 + 45000;
            assert.equal(gs.cash, expectedCash, 'Il cash deve aumentare dell\'offerta');
            assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.reputation, 4.2, 'La reputazione deve salire di 0.2★');
            assert.equal(gs.emails[0].status, 'resolved', 'L\'email deve risultare risolta');
            assert.equal(gs.diamondContractsCompleted, 1);
        });

        test('acceptDiamondContract rispetta il tetto reputazione con prestige tramite CE_money', () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 5000;
            gs.reputation = 5.0;
            gs.prestige = 0.5; // tetto = 5.5
            gs.drivers = [
                { id: 'd_vip', name: 'Driver VIP', status: 'idle', level: 3, tier: 'vip', assignedCarId: 'c_vip' },
            ];
            gs.fleet = [
                { id: 'c_vip', name: 'Auto VIP', tier: 'vip', condition: 100 },
            ];
            gs.emails = [
                { id: 'email_diamond_2', type: 'diamond_contract', offer: 30000, status: 'pending' },
            ];

            sandbox.acceptDiamondContract('email_diamond_2');

            assert.equal(gs.cash, 35000);
            assert.deepEqual(syncedCash, [35000]);
            assert.equal(gs.reputation, 5.2, 'La reputazione deve salire fino a 5.2 su tetto 5.5');
        });

        test('acceptDiamondContract senza autista o veicolo idoneo non accredita nulla', () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 5000;
            gs.reputation = 4.0;
            gs.drivers = [];
            gs.fleet = [];
            gs.emails = [
                { id: 'email_diamond_3', type: 'diamond_contract', offer: 30000, status: 'pending' },
            ];

            sandbox.acceptDiamondContract('email_diamond_3');

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.emails[0].status, 'pending');
        });
    });

    describe('_addCash', () => {
        test('_addCash accredita tramite CE_money.earn e sincronizza col server', () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 1000;

            const res = sandbox._addCash(250);

            assert.equal(res, 1250);
            assert.equal(gs.cash, 1250);
            assert.deepEqual(syncedCash, [1250]);
        });

        test('_addCash con valore non finito non tocca la cassa e non sincronizza', () => {
            const { sandbox, gs, syncedCash } = setupEnv();
            gs.cash = 1000;

            const res = sandbox._addCash(NaN);

            assert.equal(res, 1000);
            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('payToRepairCar', () => {
        test('payToRepairCar con fondi sufficienti invoca ServerState.repairVehicle e resetta outOfService', async () => {
            const { sandbox, gs } = setupEnv();
            let repairParams = null;
            sandbox.ServerState.repairVehicle = async (serverId, cost) => {
                repairParams = { serverId, cost };
                gs.cash = Math.max(0, gs.cash - cost);
                return { success: true };
            };

            gs.fleet = [{
                id: 'c1', _serverId: 'srv_c1', name: 'Auto Test', condition: 50,
                engineHealth: 100, outOfService: 'condition',
            }];
            const cost = sandbox.repairCostFor(gs.fleet[0]);
            gs.cash = cost + 5000;
            const expectedCash = gs.cash - cost;

            await sandbox.payToRepairCar('c1');

            assert.deepEqual(repairParams, { serverId: 'srv_c1', cost });
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.cash, expectedCash);
        });

        test('payToRepairCar con fondi insufficienti non chiama ServerState.repairVehicle', async () => {
            const { sandbox, gs } = setupEnv();
            let repairCalled = false;
            sandbox.ServerState.repairVehicle = async () => {
                repairCalled = true;
                return { success: true };
            };

            gs.fleet = [{
                id: 'c1', _serverId: 'srv_c1', name: 'Auto Test', condition: 50,
                engineHealth: 100, outOfService: 'condition',
            }];
            const cost = sandbox.repairCostFor(gs.fleet[0]);
            gs.cash = cost - 100;

            await sandbox.payToRepairCar('c1');

            assert.equal(repairCalled, false);
            assert.equal(gs.fleet[0].condition, 50);
            assert.equal(gs.fleet[0].outOfService, 'condition');
        });
    });
});
