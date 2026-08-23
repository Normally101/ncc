'use strict';
/* ============================================================================
   test/store/driver-coins-rpc.test.js

   Regressione per gli acquisti del negozio Driver Coins in engine-store.js,
   nella forma decisa dal server (decisione Vlad 22/08/2026): tutte le 12
   funzioni DEVONO passare da CE_money.acquistoServer -> rpc_economy_purchase.
   Il browser dichiara solo COSA compra (tipo + item + eventuale quantita'):
   il prezzo sta nel catalogo del server e il saldo che vale e' quello che la
   RPC restituisce. Il finto economyPurchase di game-env.js e' un server
   fedele: legge il SUO listino, controlla il saldo e scala lui.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStoreEnv() {
    const chiamateRPC = [];
    const env = freshEnv();
    // La mock di base di game-env (server fedele col suo listino) fa gia' il
    // lavoro giusto: la avvolgiamo solo per registrare le chiamate.
    const vera = env.sandbox.ServerState.economyPurchase.bind(env.sandbox.ServerState);
    env.sandbox.ServerState.economyPurchase = async (...a) => {
        chiamateRPC.push({ tipo: a[0], itemId: a[1], quantita: a[2] });
        return vera(...a);
    };
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateRPC };
}

describe('engine-store — acquisti DC decisi dal server (rpc_economy_purchase)', () => {

    test('1. activateExecutivePass compra executive_pass e si allinea al saldo del server', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 200;
        sandbox.activateExecutivePass();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1, 'esattamente una chiamata alla RPC di acquisto');
        assert.deepEqual({ itemId: chiamateRPC[0].itemId, quantita: chiamateRPC[0].quantita },
            { itemId: 'executive_pass', quantita: 1 });
        assert.equal(gs.driverCoins, 50, 'il saldo e\' quello scalato dal server (200 - 150)');
        assert.equal(gs.executivePassActive, true);
    });

    test('2. skipConstruction compra skip_construction e completa la costruzione', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.constructions = [{ invId: 'garage_londra' }];
        gs.investments = [];
        sandbox.skipConstruction('garage_londra');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'skip_construction');
        assert.equal(gs.driverCoins, 12, 'prezzo del server: 8 DC');
        assert.ok(gs.investments.includes('garage_londra'));
        assert.equal(gs.constructions.length, 0);
    });

    test('3. fuelBoostDC compra fuel_boost e rifornisce la flotta', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        sandbox.fuelBoostDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'fuel_boost');
        assert.equal(gs.driverCoins, 17, 'prezzo del server: 3 DC');
        assert.equal(gs.fleet[0].fuel, 100);
    });

    test('4. wakeDriverDC compra wake_driver e risveglia l\'autista', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 50 }];
        sandbox.wakeDriverDC('drv1');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'wake_driver');
        assert.equal(gs.driverCoins, 17, 'prezzo del server: 3 DC');
        assert.equal(gs.drivers[0].status, 'idle');
    });

    test('5. energyBoostDC compra energy_boost e ricarica il CEO', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.energy = 50;
        sandbox.energyBoostDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'energy_boost');
        assert.equal(gs.driverCoins, 16, 'prezzo del server: 4 DC');
        assert.equal(gs.energy, 100);
    });

    test('6. instaHealDC compra insta_heal e azzera lo stress', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'idle', stress_level: 80, fatigue: 60 }];
        sandbox.instaHealDC('drv1');
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'insta_heal');
        assert.equal(gs.driverCoins, 18, 'prezzo del server: 2 DC');
        assert.equal(gs.drivers[0].stress_level, 0);
    });

    test('7. wakeAllDriversDC dichiara la QUANTITA\' di autisti da svegliare', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', status: 'resting' },
            { id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 40 },
            { id: 'drv2', name: 'Anna', status: 'resting', restHoursLeft: 2, fatigue: 30 },
        ];
        sandbox.wakeAllDriversDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'wake_all_drivers');
        assert.equal(chiamateRPC[0].quantita, 2, 'al server va il numero di autisti, non il totale in DC');
        assert.equal(gs.driverCoins, 16, 'totale deciso dal server: prezzo unitario (2) × 2');
        assert.equal(gs.drivers[1].status, 'idle');
        assert.equal(gs.drivers[2].status, 'idle');
    });

    test('8. healAllDriversDC dichiara la QUANTITA\' di autisti da guarire', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', stress_level: 50 },
            { id: 'drv1', name: 'Luca', status: 'idle', stress_level: 40, fatigue: 60 },
            { id: 'drv2', name: 'Anna', status: 'idle', stress_level: 70, fatigue: 70 },
        ];
        sandbox.healAllDriversDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'heal_all_drivers');
        assert.equal(chiamateRPC[0].quantita, 2);
        assert.equal(gs.driverCoins, 16, 'totale deciso dal server: prezzo unitario (2) × 2');
        assert.equal(gs.drivers[1].stress_level, 0);
        assert.equal(gs.drivers[2].stress_level, 0);
    });

    test('9. skipAllAcademyDC dichiara la QUANTITA\' di corsi da completare', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.drivers = [{ id: 'd1', name: 'Luca' }];
        gs.driverAcademy = [
            { driverId: 'd1', skill: 'driving', skillGain: 10 },
            { driverId: 'd1', skill: 'etiquette', skillGain: 10 },
            { driverId: 'd1', skill: 'safety', skillGain: 10 },
        ];
        sandbox.skipAllAcademyDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'skip_all_academy');
        assert.equal(chiamateRPC[0].quantita, 3);
        assert.equal(gs.driverCoins, 15, 'totale deciso dal server: prezzo unitario (5) × 3');
        assert.equal(gs.driverAcademy.length, 0);
        assert.equal(gs.drivers[0].driving, 60);
    });

    test('10. skipAllConstructionsDC dichiara la QUANTITA\' di cantieri da chiudere', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 40;
        gs.constructions = [{ invId: 'inv_a' }, { invId: 'inv_b' }];
        gs.investments = ['inv_a'];
        sandbox.skipAllConstructionsDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'skip_all_constructions');
        assert.equal(chiamateRPC[0].quantita, 2);
        assert.equal(gs.driverCoins, 24, 'totale deciso dal server: prezzo unitario (8) × 2');
        assert.ok(gs.investments.includes('inv_b'));
        assert.equal(gs.constructions.length, 0);
    });

    test('11. opsBundleDC compra ops_bundle e applica il pacchetto', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 5 }];
        gs.energy = 10;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 3, fatigue: 40 }];
        sandbox.opsBundleDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'ops_bundle');
        assert.equal(gs.driverCoins, 11, 'prezzo del server: 9 DC');
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].status, 'idle');
    });

    test('12. fullBundleDC compra full_bundle e applica il pacchetto', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 50;
        gs.fleet = [{ id: 'car1', fuel: 5 }];
        gs.energy = 10;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', stress_level: 90, fatigue: 80 }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 10 }];
        gs.constructions = [{ invId: 'inv_c' }];
        gs.investments = [];
        sandbox.fullBundleDC();
        await new Promise(r => setImmediate(r));
        assert.equal(chiamateRPC.length, 1);
        assert.equal(chiamateRPC[0].itemId, 'full_bundle');
        assert.equal(gs.driverCoins, 15, 'prezzo del server: 35 DC');
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].status, 'idle');
        assert.equal(gs.drivers[0].stress_level, 0);
        assert.equal(gs.driverAcademy.length, 0);
        assert.ok(gs.investments.includes('inv_c'));
        assert.equal(gs.constructions.length, 0);
    });
});
