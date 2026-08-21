'use strict';
/* ============================================================================
   test/economy/engine-corse.test.js

   Regressione per le operazioni di corse, eventi di bordo e riparazioni
   in engine.js: ogni spesa e ogni incasso DEVONO passare da CE_money
   (spend / earn / addReputation) o dalle RPC del server (ServerState.repairVehicle).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEngineCorseEnv() {
    const syncedCash = [];
    const repairedVehicles = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            repairVehicle: async (serverId, cost) => {
                repairedVehicles.push({ serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, repairedVehicles };
}

describe('engine.js — corse e riparazioni (CE_money / ServerState)', () => {

    describe('payToRepairCar', () => {
        test('payToRepairCar ripara carrozzeria, azzera outOfService e addebita tramite ServerState.repairVehicle', async () => {
            const { sandbox, gs, repairedVehicles } = setupEngineCorseEnv();
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c1',
                name: 'Auto Test',
                tier: 'business',
                condition: 40,
                engineHealth: 100,
                outOfService: 'condition',
            }];
            gs.cash = 50000;
            const cost = sandbox.repairCostFor(gs.fleet[0]);
            assert.equal(cost, (100 - 40) * 85); // 5100

            await sandbox.payToRepairCar('c_test_1');

            assert.equal(gs.fleet[0].condition, 100, 'la condizione deve tornare al 100%');
            assert.equal(gs.fleet[0].outOfService, null, 'outOfService deve essere rimosso');
            assert.deepEqual(repairedVehicles, [{ serverId: 'srv_c1', cost: 5100 }], 'ServerState.repairVehicle deve ricevere id e costo');
            assert.equal(gs.cash, 50000 - 5100, 'il saldo locale deve essere scalato del costo');
        });

        test('payToRepairCar con fondi insufficienti non ripara e non chiama ServerState.repairVehicle', async () => {
            const { sandbox, gs, repairedVehicles } = setupEngineCorseEnv();
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c1',
                name: 'Auto Test',
                tier: 'business',
                condition: 40,
                engineHealth: 100,
                outOfService: 'condition',
            }];
            gs.cash = 100; // servono 5100

            await sandbox.payToRepairCar('c_test_1');

            assert.equal(gs.fleet[0].condition, 40, 'la condizione non deve cambiare');
            assert.equal(gs.fleet[0].outOfService, 'condition');
            assert.deepEqual(repairedVehicles, [], 'nessuna chiamata RPC se i fondi non bastano');
            assert.equal(gs.cash, 100);
        });

        test('payToRepairCar con motore fuso viene bloccata prima dell\'addebito', async () => {
            const { sandbox, gs, repairedVehicles } = setupEngineCorseEnv();
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c1',
                name: 'Auto Test',
                tier: 'business',
                condition: 40,
                engineHealth: 0,
                outOfService: 'engine',
            }];
            gs.cash = 50000;

            await sandbox.payToRepairCar('c_test_1');

            assert.equal(gs.fleet[0].condition, 40);
            assert.deepEqual(repairedVehicles, []);
            assert.equal(gs.cash, 50000);
        });

        test('payToRepairCar con auto al 100% non effettua chiamate RPC', async () => {
            const { sandbox, gs, repairedVehicles } = setupEngineCorseEnv();
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c1',
                name: 'Auto Test',
                tier: 'business',
                condition: 100,
                engineHealth: 100,
                outOfService: null,
            }];
            gs.cash = 50000;

            await sandbox.payToRepairCar('c_test_1');

            assert.deepEqual(repairedVehicles, []);
            assert.equal(gs.cash, 50000);
        });

        test('payToRepairCar non azzera il costo nemmeno se inv_kasko e\' presente', async () => {
            const { sandbox, gs, repairedVehicles } = setupEngineCorseEnv();
            gs.investments = ['inv_kasko'];
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c1',
                name: 'Auto Test',
                tier: 'business',
                condition: 50,
                engineHealth: 100,
                outOfService: 'condition',
            }];
            gs.cash = 50000;
            const cost = sandbox.repairCostFor(gs.fleet[0]); // 50 * 85 = 4250

            await sandbox.payToRepairCar('c_test_1');

            assert.equal(gs.fleet[0].condition, 100);
            assert.deepEqual(repairedVehicles, [{ serverId: 'srv_c1', cost: 4250 }], 'Kasko non regala la riparazione ordinaria');
            assert.equal(gs.cash, 50000 - 4250);
        });

        test('payToRepairCar applica correttamente gli sconti combinati (contratto + staff + officina)', async () => {
            const { sandbox, gs, repairedVehicles } = setupEngineCorseEnv();
            gs.maintenanceContract = true;
            gs.maintenanceContractPaidUntilDay = 20;
            gs.day = 5;
            gs.staff = [{ id: 'mech', name: 'Capo Officina' }];
            gs.investments = ['inv_mobile_workshop'];
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c1',
                name: 'Auto Test',
                tier: 'business',
                condition: 40, // 60 * 85 = 5100 -> * 0.70 * 0.50 * 0.80 = 1428
                engineHealth: 100,
                outOfService: null,
            }];
            gs.cash = 20000;

            await sandbox.payToRepairCar('c_test_1');

            assert.equal(gs.fleet[0].condition, 100);
            assert.deepEqual(repairedVehicles, [{ serverId: 'srv_c1', cost: 1428 }]);
            assert.equal(gs.cash, 20000 - 1428);
        });
    });

    describe('acceptDiamondContract', () => {
        test('acceptDiamondContract accredita il compenso tramite CE_money.earn e aumenta la reputazione', async () => {
            const { sandbox, gs, syncedCash } = setupEngineCorseEnv();
            gs.drivers = [{ id: 'd_vip', name: 'Driver VIP', tier: 'vip', level: 3, status: 'idle', assignedCarId: 'c_vip' }];
            gs.fleet = [{ id: 'c_vip', name: 'Auto VIP', tier: 'ultra', condition: 100 }];
            gs.emails = [{
                id: 101,
                sender: 'VIP Diamond',
                subject: 'Diamond Contract',
                type: 'diamond',
                offer: 35000,
                status: 'unread',
            }];
            gs.cash = 10000;
            gs.reputation = 4.5;
            gs.diamondContractsCompleted = 0;

            sandbox.acceptDiamondContract(101);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 45000, 'il saldo locale deve aumentare di 35.000€');
            assert.deepEqual(syncedCash, [45000], 'ServerState.syncCash deve ricevere il nuovo totale');
            assert.equal(gs.reputation, 4.7, 'la reputazione deve aumentare di 0.2');
            assert.equal(gs.diamondContractsCompleted, 1);
            assert.equal(gs.emails[0].status, 'resolved');
        });

        test('acceptDiamondContract senza driver VIP disponibile non accredita e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEngineCorseEnv();
            gs.drivers = [{ id: 'd_std', name: 'Driver Standard', tier: 'standard', level: 1, status: 'idle', assignedCarId: 'c_vip' }];
            gs.fleet = [{ id: 'c_vip', name: 'Auto VIP', tier: 'ultra', condition: 100 }];
            gs.emails = [{ id: 101, sender: 'VIP', subject: 'Diamond', type: 'diamond', offer: 35000, status: 'unread' }];
            gs.cash = 10000;

            sandbox.acceptDiamondContract(101);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.emails[0].status, 'unread');
        });
    });

    describe('window._addCash', () => {
        test('_addCash accredita importo finito tramite CE_money.earn e sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEngineCorseEnv();
            gs.cash = 5000;

            const res = sandbox._addCash(2500);
            await new Promise(r => setImmediate(r));

            assert.equal(res, 7500);
            assert.equal(gs.cash, 7500);
            assert.deepEqual(syncedCash, [7500]);
        });

        test('_addCash con NaN o Infinity non muta il saldo e non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupEngineCorseEnv();
            gs.cash = 5000;

            sandbox._addCash(NaN);
            sandbox._addCash(Infinity);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_triggerVIPMidRideEvent', () => {
        test('evento VIP scelta A scala il costo tramite CE_money.spend e incrementa la reputazione', async () => {
            const { env, sandbox, gs, syncedCash } = setupEngineCorseEnv();
            const VIP_MID_RIDE_EVENTS = vm.runInContext('VIP_MID_RIDE_EVENTS', env.sandbox);
            const ev = VIP_MID_RIDE_EVENTS.find(e => e.costA > 0) || {
                icon: '🍾', title: 'Champagne', desc: 'Champagne richiesto',
                costA: 500, repA: 0.2, repB: -0.1, labelA: 'Offri (€500)', labelB: 'Rifiuta'
            };
            // Forza l'evento nella lista per renderlo deterministico
            env.sandbox.VIP_MID_RIDE_EVENTS = [ev];

            gs.cash = 10000;
            gs.reputation = 4.0;
            const ride = { id: 1, tier: 'vip', duration: 10000, elapsed: 2000, fromPoi: {}, toPoi: {} };

            vm.runInContext('_triggerVIPMidRideEvent(ride)', env.sandbox, { filename: 'engine.js' });

            const btnA = env.sandbox.document.getElementById('vip-toast-a');
            assert.ok(btnA, 'il pulsante di scelta A deve essere presente nel DOM');
            btnA.onclick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000 - ev.costA, 'il saldo deve essere scalato del costo dell\'evento');
            assert.deepEqual(syncedCash, [10000 - ev.costA], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(Number(gs.reputation.toFixed(2)), Number((4.0 + ev.repA).toFixed(2)), 'la reputazione deve aumentare');
        });

        test('evento VIP scelta B aggiorna la reputazione senza toccare la cassa', async () => {
            const { env, sandbox, gs, syncedCash } = setupEngineCorseEnv();
            const VIP_MID_RIDE_EVENTS = vm.runInContext('VIP_MID_RIDE_EVENTS', env.sandbox);
            const ev = VIP_MID_RIDE_EVENTS.find(e => e.costA > 0) || {
                icon: '🍾', title: 'Champagne', desc: 'Champagne richiesto',
                costA: 500, repA: 0.2, repB: -0.1, labelA: 'Offri (€500)', labelB: 'Rifiuta'
            };
            env.sandbox.VIP_MID_RIDE_EVENTS = [ev];

            gs.cash = 10000;
            gs.reputation = 4.0;
            const ride = { id: 1, tier: 'vip', duration: 10000, elapsed: 2000, fromPoi: {}, toPoi: {} };

            vm.runInContext('_triggerVIPMidRideEvent(ride)', env.sandbox, { filename: 'engine.js' });

            const btnB = env.sandbox.document.getElementById('vip-toast-b');
            assert.ok(btnB, 'il pulsante di scelta B deve essere presente nel DOM');
            btnB.onclick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione di cassa');
            assert.equal(Number(gs.reputation.toFixed(2)), Number(Math.max(0, 4.0 + ev.repB).toFixed(2)), 'la reputazione deve riflettere repB');
        });
    });
});
