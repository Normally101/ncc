'use strict';
/* ============================================================================
   test/economy/store-sync.test.js

   Regressione per gli acquisti Driver Coins del negozio (engine-store.js),
   forma decisa dal server: ogni spesa DEVE passare da CE_money.acquistoServer
   -> rpc_economy_purchase. Il browser dichiara cosa compra (e quanta cosa,
   per le voci a prezzo unitario); il finto economyPurchase di game-env.js
   legge il SUO listino, controlla il saldo, scala lui e restituisce il saldo
   nuovo — ed e' solo quello che il client scrive.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStoreEnv() {
    const rpcCalls = [];
    const env = freshEnv();
    // Avvolge la mock fedele di game-env per registrare le chiamate RPC.
    const vera = env.sandbox.ServerState.economyPurchase.bind(env.sandbox.ServerState);
    env.sandbox.ServerState.economyPurchase = async (...a) => {
        rpcCalls.push({ tipo: a[0], itemId: a[1], quantita: a[2] });
        return vera(...a);
    };
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, rpcCalls };
}

describe('engine-store — acquisti DC sincronizzati col server (CE_money.acquistoServer)', () => {

    describe('activateExecutivePass', () => {
        test('attiva pass e lascia il saldo dichiarato dal server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 200;
            sandbox.activateExecutivePass();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50, 'il server ha scalato 150 e restituito 50');
            assert.equal(gs.executivePassActive, true);
            assert.deepEqual(rpcCalls.map(c => ({ itemId: c.itemId, quantita: c.quantita })),
                [{ itemId: 'executive_pass', quantita: 1 }]);
        });

        test('fondi insufficienti: non attiva pass e non chiama la RPC con esito ok', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 100;
            gs.executivePassActive = false;
            sandbox.activateExecutivePass();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 100);
            assert.equal(gs.executivePassActive, false);
            // Il tentativo parte e il server lo RIFIUTA: nessun effetto, nessun saldo toccato.
            assert.equal(rpcCalls.length, 1);
        });
    });

    describe('skipConstruction', () => {
        test('completa costruzione e scala 8 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.constructions = [{ invId: 'garage_roma' }];
            gs.investments = [];
            sandbox.skipConstruction('garage_roma');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 12);
            assert.ok(gs.investments.includes('garage_roma'));
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['skip_construction']);
        });

        test('costruzione non trovata: non chiama la RPC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.constructions = [];
            gs.investments = [];
            sandbox.skipConstruction('inesistente');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });

        test('fondi insufficienti: non completa la costruzione', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 5;
            gs.constructions = [{ invId: 'garage_roma' }];
            gs.investments = [];
            sandbox.skipConstruction('garage_roma');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.deepEqual(gs.investments, []);
            assert.equal(gs.constructions.length, 1);
            assert.equal(rpcCalls.length, 1, 'il server rifiuta: nessun effetto applicato');
        });
    });

    describe('fuelBoostDC', () => {
        test('rifornisce la flotta e scala 3 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.fleet = [{ id: 'v1', fuel: 10 }];
            sandbox.fuelBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 17);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['fuel_boost']);
        });

        test('fondi insufficienti: flotta non rifornita', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 2;
            gs.fleet = [{ id: 'v1', fuel: 10 }];
            sandbox.fuelBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 2);
            assert.equal(gs.fleet[0].fuel, 10);
            assert.equal(rpcCalls.length, 1, 'il server rifiuta: nessun effetto applicato');
        });
    });

    describe('wakeDriverDC', () => {
        test('risveglia autista a riposo e scala 3 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'resting', restHoursLeft: 4, fatigue: 50 }];
            sandbox.wakeDriverDC('d1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 17);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['wake_driver']);
        });

        test('autista non a riposo: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'idle' }];
            sandbox.wakeDriverDC('d1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('energyBoostDC', () => {
        test('ricarica il CEO e scala 4 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.energy = 40;
            sandbox.energyBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 16);
            assert.equal(gs.energy, 100);
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['energy_boost']);
        });

        test('fondi insufficienti: energia invariata', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 3;
            gs.energy = 40;
            sandbox.energyBoostDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 3);
            assert.equal(gs.energy, 40);
            assert.equal(rpcCalls.length, 1, 'il server rifiuta: nessun effetto applicato');
        });
    });

    describe('instaHealDC', () => {
        test('azzera lo stress e scala 2 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'resting', stress_level: 80, fatigue: 60 }];
            sandbox.instaHealDC('d1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 18);
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['insta_heal']);
        });

        test('autista gia\' in forma: non scala DC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'idle', stress_level: 0, burnout_until: null }];
            sandbox.instaHealDC('d1');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('wakeAllDriversDC', () => {
        test('sveglia tutti e dichiara al server QUANTI autisti', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', status: 'resting' },
                { id: 'd1', name: 'Mario', status: 'resting', restHoursLeft: 4, fatigue: 60 },
                { id: 'd2', name: 'Anna', status: 'resting', restHoursLeft: 2, fatigue: 30 },
            ];
            sandbox.wakeAllDriversDC();
            await new Promise(r => setImmediate(r));
            // Il totale lo decide il server dal suo listino: unitario 2 × 2 autisti.
            assert.equal(gs.driverCoins, 16);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[2].status, 'idle');
            assert.deepEqual(rpcCalls.map(c => ({ itemId: c.itemId, quantita: c.quantita })),
                [{ itemId: 'wake_all_drivers', quantita: 2 }]);
        });

        test('nessun autista a riposo: non chiama la RPC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Mario', status: 'idle', stress_level: 0, burnout_until: null }];
            sandbox.healAllDriversDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('skipAllAcademyDC', () => {
        test('completa i corsi e dichiara al server QUANTI corsi', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.drivers = [
                { id: 'd1', driving: 50, status: 'training' },
                { id: 'd2', comfort: 60, status: 'training' },
            ];
            gs.driverAcademy = [
                { driverId: 'd1', skill: 'driving', skillGain: 10 },
                { driverId: 'd2', skill: 'comfort', skillGain: 15 },
            ];
            sandbox.skipAllAcademyDC();
            await new Promise(r => setImmediate(r));
            // Il totale lo decide il server dal suo listino: unitario 5 × 2 corsi.
            assert.equal(gs.driverCoins, 20);
            assert.equal(gs.drivers[0].driving, 60);
            assert.equal(gs.drivers[1].comfort, 75);
            assert.equal(gs.driverAcademy.length, 0);
            assert.deepEqual(rpcCalls.map(c => ({ itemId: c.itemId, quantita: c.quantita })),
                [{ itemId: 'skip_all_academy', quantita: 2 }]);
        });

        test('nessun corso attivo: non chiama la RPC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.driverAcademy = [];
            sandbox.skipAllAcademyDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 30);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('skipAllConstructionsDC', () => {
        test('completa le costruzioni e dichiara al server QUANTE sono', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.investments = [];
            gs.constructions = [{ invId: 'garage_1' }, { invId: 'garage_2' }];
            sandbox.skipAllConstructionsDC();
            await new Promise(r => setImmediate(r));
            // Il totale lo decide il server dal suo listino: unitario 8 × 2.
            assert.equal(gs.driverCoins, 14);
            assert.deepEqual(gs.investments, ['garage_1', 'garage_2']);
            assert.equal(gs.constructions.length, 0);
            assert.deepEqual(rpcCalls.map(c => ({ itemId: c.itemId, quantita: c.quantita })),
                [{ itemId: 'skip_all_constructions', quantita: 2 }]);
        });

        test('nessuna costruzione attiva: non chiama la RPC', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.constructions = [];
            sandbox.skipAllConstructionsDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 30);
            assert.deepEqual(rpcCalls, []);
        });
    });

    describe('opsBundleDC', () => {
        test('attiva Pacchetto Operativo e scala 9 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.fleet = [{ id: 'v1', fuel: 10 }];
            gs.energy = 30;
            gs.drivers = [{ id: 'd1', status: 'resting', restHoursLeft: 4, fatigue: 60 }];
            sandbox.opsBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 11);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['ops_bundle']);
        });

        test('fondi insufficienti: pacchetto operativo non attivato', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 5;
            gs.energy = 30;
            sandbox.opsBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.equal(gs.energy, 30);
            assert.equal(rpcCalls.length, 1, 'il server rifiuta: nessun effetto applicato');
        });
    });

    describe('fullBundleDC', () => {
        test('attiva Pacchetto Imperiale e scala 35 DC dal saldo del server', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            gs.fleet = [{ id: 'v1', fuel: 10 }];
            gs.energy = 20;
            gs.drivers = [{ id: 'd1', status: 'resting', stress_level: 50, fatigue: 80 }];
            gs.investments = [];
            gs.constructions = [{ invId: 'c1' }];
            gs.driverAcademy = [{ driverId: 'd1', skill: 'driving', skillGain: 10 }];
            sandbox.fullBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 15);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.deepEqual(gs.investments, ['c1']);
            assert.equal(gs.constructions.length, 0);
            assert.equal(gs.driverAcademy.length, 0);
            assert.deepEqual(rpcCalls.map(c => c.itemId), ['full_bundle']);
        });

        test('fondi insufficienti: pacchetto imperiale non attivato', async () => {
            const { sandbox, gs, rpcCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.energy = 20;
            sandbox.fullBundleDC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.equal(gs.energy, 20);
            assert.equal(rpcCalls.length, 1, 'il server rifiuta: nessun effetto applicato');
        });
    });
});
