'use strict';
/* ============================================================================
   test/economy/hq-sync.test.js

   Regressione per il bug economico in hq.js:
   le funzioni di spesa DEVONO passare da CE_money (spend)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupHQEnv() {
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
    sandbox.hqInit();
    return { env, sandbox, gs, syncedCash };
}

describe('hq — sincronizzazione cassa col server (CE_money)', () => {

    test('HQ_ROOMS è definito nel contesto della VM', () => {
        const { sandbox } = setupHQEnv();
        const rooms = vm.runInContext('HQ_ROOMS', sandbox);
        assert.ok(Array.isArray(rooms), 'HQ_ROOMS deve essere un array');
        assert.ok(rooms.length > 0, 'HQ_ROOMS non deve essere vuoto');
    });

    test('hqUpgradeRoom non fa nulla quando HQ_ENABLED è false', async () => {
        const { sandbox, gs, syncedCash } = setupHQEnv();
        sandbox.HQ_ENABLED = false;
        gs.cash = 500000;
        gs.reputation = 5;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 500000, 'il saldo non deve cambiare quando HQ_ENABLED è false');
        assert.deepEqual(syncedCash, [], 'syncCash non deve essere chiamato');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 1, 'il livello non deve cambiare');
    });

    test('hqUpgradeRoom scala denaro e sincronizza con ServerState.syncCash tramite CE_money', async () => {
        const { sandbox, gs, syncedCash } = setupHQEnv();
        sandbox.HQ_ENABLED = true;
        gs.cash = 500000;
        gs.reputation = 2;

        const rooms = vm.runInContext('HQ_ROOMS', sandbox);
        const garageDef = rooms.find(r => r.id === 'garage_main');
        const tier2 = garageDef.tiers.find(t => t.level === 2);
        assert.ok(tier2 && tier2.cost > 0, 'il tier 2 di garage_main deve avere un costo');

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        const expectedCash = 500000 - tier2.cost;
        assert.equal(gs.cash, expectedCash, 'il saldo locale deve essere scalato del costo tier 2');
        assert.deepEqual(syncedCash, [expectedCash], 'ServerState.syncCash deve ricevere il nuovo saldo');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 2, 'il livello della stanza deve essere aggiornato a 2');
    });

    test('fondi insufficienti: non aggiorna la stanza e non chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupHQEnv();
        sandbox.HQ_ENABLED = true;
        gs.cash = 50000; // Meno dei 100.000€ necessari per il tier 2 di garage_main
        gs.reputation = 2;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 50000, 'il saldo non deve cambiare se i fondi sono insufficienti');
        assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione se fondi insufficienti');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 1, 'il livello non deve cambiare');
    });

    test('annullamento conferma utente: non scala denaro e non chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupHQEnv();
        sandbox.HQ_ENABLED = true;
        sandbox.confirm = () => false;
        gs.cash = 500000;
        gs.reputation = 2;

        await sandbox.hqUpgradeRoom('roma', 'garage_main');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 500000, 'il saldo non deve cambiare se l\'utente annulla');
        assert.deepEqual(syncedCash, [], 'nessuna sincronizzazione su annullamento');
        assert.equal(sandbox.hqGetRoomLevel('roma', 'garage_main'), 1, 'il livello non deve cambiare');
    });

    test('upgrade con reputationBonus usa CE_money.addReputation', async () => {
        const { sandbox, gs, syncedCash } = setupHQEnv();
        sandbox.HQ_ENABLED = true;
        gs.currentHQCity = 'firenze';
        sandbox.hqInit();
        gs.cash = 5000000;
        gs.reputation = 2.0;
        gs.prestige = 0;

        // Prerequisiti per vip_lounge a Firenze: garage_main -> mission_room -> control_tower -> vip_lounge
        gs.hqs['firenze'].rooms['garage_main'] = 1;
        gs.hqs['firenze'].rooms['mission_room'] = 1;
        gs.hqs['firenze'].rooms['control_tower'] = 1;

        const rooms = vm.runInContext('HQ_ROOMS', sandbox);
        const vipDef = rooms.find(r => r.id === 'vip_lounge');
        const tier1 = vipDef.tiers.find(t => t.level === 1);

        await sandbox.hqUpgradeRoom('firenze', 'vip_lounge', 0);
        await new Promise(r => setImmediate(r));

        const expectedCash = 5000000 - tier1.cost;
        assert.equal(gs.cash, expectedCash, 'il saldo deve essere scalato');
        assert.deepEqual(syncedCash, [expectedCash], 'syncCash deve essere chiamato');
        assert.equal(sandbox.hqGetRoomLevel('firenze', 'vip_lounge'), 1, 'la stanza deve essere costruita a livello 1');
        assert.equal(gs.reputation, 2.0 + tier1.effect.reputationBonus, 'la reputazione deve essere aumentata del bonus');
    });
});
