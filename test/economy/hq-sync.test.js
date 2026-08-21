'use strict';
/* ============================================================================
   test/economy/hq-sync.test.js

   Regressione per il bug economico in hq.js:
   le funzioni di spesa e upgrade dell'HQ DEVONO passare da CE_money (spend)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupHqEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    const sandbox = env.sandbox;
    const gs = sandbox.gameState;
    // Inizializza HQ e abilita per il test
    sandbox.HQ_ENABLED = true;
    sandbox.hqInit();

    const hqRooms = vm.runInContext('HQ_ROOMS', sandbox);
    const hqCities = vm.runInContext('HQ_CITIES', sandbox);

    return { env, sandbox, gs, syncedCash, hqRooms, hqCities };
}

describe('hq — sincronizzazione cassa col server (CE_money)', () => {

    test('hqUpgradeRoom scala il cash e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, syncedCash, hqRooms } = setupHqEnv();
        // garage_main lv 1 e' gia' presente a Roma al livello 1.
        // Upgrade a lv 2 costa 100.000€, reqRep: 1
        const garageDef = hqRooms.find(r => r.id === 'garage_main');
        assert.ok(garageDef, 'HQ_ROOMS deve contenere garage_main');
        const tier2 = garageDef.tiers.find(t => t.level === 2);
        assert.ok(tier2, 'garage_main deve avere il tier 2');

        gs.cash = 500000;
        gs.reputation = 4.0;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        const expectedCash = 500000 - tier2.cost;
        assert.equal(gs.cash, expectedCash, 'il saldo locale deve essere scalato del costo tier');
        assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 2, 'la stanza deve essere al livello 2');
    });

    test('hqUpgradeRoom: fondi insufficienti non scalano cassa e non chiamano syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupHqEnv();
        gs.cash = 10000; // Meno dei 100.000€ richiesti per garage lv 2
        gs.reputation = 4.0;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 10000, 'il saldo locale non deve cambiare');
        assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se i fondi sono insufficienti');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 1, 'il livello non deve salire');
    });

    test('hqUpgradeRoom: annullamento conferma utente non scala denaro ne\' chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupHqEnv();
        sandbox.confirm = () => false;
        gs.cash = 500000;
        gs.reputation = 4.0;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 500000, 'il saldo locale non deve cambiare se l\'utente annulla');
        assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se l\'azione e\' annullata');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 1, 'il livello non deve salire');
    });

    test('hqUpgradeRoom applica il bonus reputazione tramite CE_money.addReputation', async () => {
        const { sandbox, gs, syncedCash, hqRooms } = setupHqEnv();
        // vip_lounge e' specifica per firenze, prereq: control_tower
        const vipLounge = hqRooms.find(r => r.id === 'vip_lounge');
        assert.ok(vipLounge, 'HQ_ROOMS deve contenere vip_lounge');
        const tier1 = vipLounge.tiers.find(t => t.level === 1);
        assert.ok(tier1 && tier1.effect.reputationBonus > 0, 'vip_lounge lv 1 deve avere un bonus reputazione');

        // Soddisfa i prerequisiti a firenze
        gs.hqs['firenze'].rooms['garage_main'] = 1;
        gs.hqs['firenze'].rooms['mission_room'] = 1;
        gs.hqs['firenze'].rooms['control_tower'] = 1;

        gs.cash = 1000000;
        gs.reputation = 3.0;

        await sandbox.hqUpgradeRoom('firenze', 'vip_lounge', 0);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 1000000 - tier1.cost, 'il saldo locale deve essere scalato');
        assert.deepEqual(syncedCash, [1000000 - tier1.cost], 'ServerState.syncCash deve essere invocato');
        assert.equal(gs.reputation, 3.0 + tier1.effect.reputationBonus, 'la reputazione deve essere incrementata');
    });

    test('hqUpgradeRoom con HQ_ENABLED === false non effettua modifiche ne\' spese', async () => {
        const { sandbox, gs, syncedCash } = setupHqEnv();
        sandbox.HQ_ENABLED = false;
        gs.cash = 500000;
        gs.reputation = 4.0;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 500000, 'il cash non deve cambiare se HQ_ENABLED e\' false');
        assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 1);
    });

    test('_hqBuildFromList costruisce la stanza e sincronizza la cassa', async () => {
        const { sandbox, gs, syncedCash, hqRooms } = setupHqEnv();
        const workshopDef = hqRooms.find(r => r.id === 'workshop');
        assert.ok(workshopDef, 'HQ_ROOMS deve contenere workshop');
        const tier1 = workshopDef.tiers.find(t => t.level === 1);

        gs.cash = 500000;
        gs.reputation = 2.0;
        gs.currentHQCity = 'roma';

        sandbox._hqBuildFromList('workshop');
        await new Promise(r => setImmediate(r));

        const expectedCash = 500000 - tier1.cost;
        assert.equal(gs.cash, expectedCash, 'il saldo deve essere scalato del costo della stanza');
        assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve ricevere il nuovo saldo');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'workshop'), 1, 'workshop deve essere a livello 1');
    });
});
