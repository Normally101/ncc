'use strict';
/* ============================================================================
   test/store/driver-coins-rpc.test.js

   Regressione per il bug economico delle spese Driver Coins in engine-store.js:
   tutte le 12 funzioni di spesa DC DEVONO passare dalla RPC a PREZZO SERVER
   (rpc_dc_purchase, via CE_money.acquistoDC -> ServerState.purchaseDCItem),
   che legge dc_item_prices, controlla il saldo bloccando la riga e RESTITUISCE
   il saldo nuovo. La vecchia rpc_ec_spend(p_item_id, p_amount) lasciava al
   browser la decisione del prezzo: chi apriva la console comprava a 1 DC.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStoreEnv() {
    const chiamateRPC = [];   // cosa compra il client: { itemId, units } — mai un prezzo
    const spesePrezzoClient = []; // la via VECCHIA (rpc_ec_spend): qui non deve più arrivare nessuno
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                spesePrezzoClient.push({ motivo, n });
                return { ok: true };
            },
        },
    });
    const sandbox = env.sandbox;
    const gs = sandbox.gameState;
    // Avvolgo il mock fedele (che scala i DC secondo il SUO catalogo, come farebbe
    // il vero server) solo per registrare le chiamate.
    const reale = sandbox.ServerState.purchaseDCItem.bind(sandbox.ServerState);
    sandbox.ServerState.purchaseDCItem = async (itemId, units) => {
        chiamateRPC.push({ itemId, units });
        return reale(itemId, units);
    };
    return { env, sandbox, gs, chiamateRPC, spesePrezzoClient };
}

describe('engine-store — tutte le spese DC passano dalla RPC a prezzo server', () => {

    test('1. activateExecutivePass compra executive_pass (150 DC decisi dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 200;
        await sandbox.activateExecutivePass();
        assert.deepEqual(chiamateRPC, [{ itemId: 'executive_pass', units: undefined }]);
        assert.equal(spesePrezzoClient.length, 0, 'niente rpc_ec_spend: il prezzo non parte dal client');
        assert.equal(gs.executivePassActive, true);
        assert.equal(gs.driverCoins, 50, 'il saldo resta quello scalato dal server (200-150)');
    });

    test('2. skipConstruction compra skip_construction x1 (8 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.constructions = [{ invId: 'garage_londra' }];
        gs.investments = [];
        await sandbox.skipConstruction('garage_londra');
        assert.deepEqual(chiamateRPC, [{ itemId: 'skip_construction', units: 1 }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.ok(gs.investments.includes('garage_londra'));
        assert.equal(gs.driverCoins, 12);
    });

    test('3. fuelBoostDC compra fuel_boost (3 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        await sandbox.fuelBoostDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'fuel_boost', units: undefined }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.driverCoins, 17);
    });

    test('4. wakeDriverDC compra wake_driver x1 (3 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 50 }];
        await sandbox.wakeDriverDC('drv1');
        assert.deepEqual(chiamateRPC, [{ itemId: 'wake_driver', units: 1 }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.drivers[0].status, 'idle');
        assert.equal(gs.driverCoins, 17);
    });

    test('5. energyBoostDC compra energy_boost (4 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.energy = 50;
        await sandbox.energyBoostDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'energy_boost', units: undefined }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.energy, 100);
        assert.equal(gs.driverCoins, 16);
    });

    test('6. instaHealDC compra insta_heal x1 (2 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'idle', stress_level: 80, fatigue: 60 }];
        await sandbox.instaHealDC('drv1');
        assert.deepEqual(chiamateRPC, [{ itemId: 'insta_heal', units: 1 }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.drivers[0].stress_level, 0);
        assert.equal(gs.driverCoins, 18);
    });

    test('7. wakeAllDriversDC manda le UNITA\' (2 autisti) — totale lo calcola il server', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', status: 'resting' },
            { id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 40 },
            { id: 'drv2', name: 'Anna', status: 'resting', restHoursLeft: 2, fatigue: 30 },
        ];
        await sandbox.wakeAllDriversDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'wake_all_drivers', units: 2 }],
            'il client passa il CONTEGGIO, non il costo (max(3, n*2) era calcolato dal browser)');
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.drivers[1].status, 'idle');
        assert.equal(gs.drivers[2].status, 'idle');
        assert.equal(gs.driverCoins, 16); // server: max(3, 2*2) = 4
    });

    test('8. healAllDriversDC manda le UNITA\' (2 autisti) — minimo applicato dal server', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.drivers = [
            { id: 'ceo', name: 'CEO', stress_level: 50 },
            { id: 'drv1', name: 'Luca', status: 'idle', stress_level: 40, fatigue: 60 },
            { id: 'drv2', name: 'Anna', status: 'idle', stress_level: 70, fatigue: 70 },
        ];
        await sandbox.healAllDriversDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'heal_all_drivers', units: 2 }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.drivers[1].stress_level, 0);
        assert.equal(gs.drivers[2].stress_level, 0);
        assert.equal(gs.driverCoins, 16); // server: max(4, 2*2) = 4
    });

    test('9. skipAllAcademyDC compra academy_skip xN corsi (5 DC/corso dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.drivers = [{ id: 'drv1', name: 'Luca', driving: 50, status: 'training' }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 15 }];
        await sandbox.skipAllAcademyDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'academy_skip', units: 1 }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.drivers[0].driving, 65);
        assert.equal(gs.driverAcademy.length, 0);
        assert.equal(gs.driverCoins, 25);
    });

    test('10. skipAllConstructionsDC compra skip_construction xN (8 DC/ciascuna dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 30;
        gs.investments = [];
        gs.constructions = [{ invId: 'c1' }, { invId: 'c2' }];
        await sandbox.skipAllConstructionsDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'skip_construction', units: 2 }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.constructions.length, 0);
        assert.deepEqual(gs.investments, ['c1', 'c2']);
        assert.equal(gs.driverCoins, 14); // server: 8 * 2
    });

    test('11. opsBundleDC compra ops_bundle (9 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.energy = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', restHoursLeft: 2, fatigue: 50 }];
        await sandbox.opsBundleDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'ops_bundle', units: undefined }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].status, 'idle');
        assert.equal(gs.driverCoins, 11);
    });

    test('12. fullBundleDC compra full_bundle (35 DC dal server)', async () => {
        const { sandbox, gs, chiamateRPC, spesePrezzoClient } = setupStoreEnv();
        gs.driverCoins = 50;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.energy = 20;
        gs.drivers = [{ id: 'drv1', name: 'Luca', status: 'resting', stress_level: 50, fatigue: 70 }];
        gs.investments = [];
        gs.constructions = [{ invId: 'c1' }];
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'driving', skillGain: 10 }];
        await sandbox.fullBundleDC();
        assert.deepEqual(chiamateRPC, [{ itemId: 'full_bundle', units: undefined }]);
        assert.equal(spesePrezzoClient.length, 0);
        assert.equal(gs.fleet[0].fuel, 100);
        assert.equal(gs.energy, 100);
        assert.equal(gs.drivers[0].stress_level, 0);
        assert.equal(gs.constructions.length, 0);
        assert.equal(gs.driverAcademy.length, 0);
        assert.equal(gs.driverCoins, 15);
    });

    test('fondi insufficienti: il server rifiuta, effetto NON applicato e saldo intatto', async () => {
        const { sandbox, gs, chiamateRPC } = setupStoreEnv();
        gs.driverCoins = 1; // bastano per provare a chiedere, non per pagare (energy_boost = 4)
        gs.energy = 50;
        await sandbox.energyBoostDC();
        assert.equal(chiamateRPC.length, 1, 'la richiesta arriva al server: a decidere e\' lui');
        assert.equal(gs.energy, 50, 'energia non deve essere modificata se il server rifiuta');
        assert.equal(gs.driverCoins, 1, 'saldo intatto dopo il rifiuto');
    });
});
