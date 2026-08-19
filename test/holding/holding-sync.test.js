'use strict';
/* ============================================================================
   test/holding/holding-sync.test.js

   Regressione per il bug economico in engine-holding.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupHoldingEnv() {
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

describe('engine-holding — sincronizzazione cassa col server (CE_money)', () => {

    describe('incorporateHolding', () => {
        test('incorpora holding scala 200.000€ e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.reputation = 4.5;
            gs.cash = 300000;
            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.equal(gs.holding?.incorporated, true);
            assert.deepEqual(syncedCash, [100000]);
        });

        test('fondi insufficienti: non incorpora e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.reputation = 4.5;
            gs.cash = 100000;
            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.equal(gs.holding?.incorporated, false);
            assert.deepEqual(syncedCash, []);
        });

        test('già incorporata: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.reputation = 4.5;
            gs.cash = 300000;
            gs.holding = { incorporated: true, subsidiaries: [] };
            sandbox.incorporateHolding();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 300000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('acquireSubsidiary', () => {
        test('acquista sussidiaria scala il costo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.holding = { incorporated: true, subsidiaries: [] };
            gs.cash = 200000;
            // sub_fleet costa 150000
            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.deepEqual(gs.holding.subsidiaries, ['sub_fleet']);
            assert.deepEqual(syncedCash, [50000]);
        });

        test('fondi insufficienti: non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.holding = { incorporated: true, subsidiaries: [] };
            gs.cash = 50000;
            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.deepEqual(gs.holding.subsidiaries, []);
            assert.deepEqual(syncedCash, []);
        });

        test('sussidiaria già posseduta: non spende e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.holding = { incorporated: true, subsidiaries: ['sub_fleet'] };
            gs.cash = 200000;
            sandbox.acquireSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('divestSubsidiary', () => {
        test('cede sussidiaria accredita il 60% e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.holding = { incorporated: true, subsidiaries: ['sub_fleet'] };
            gs.cash = 10000;
            // sub_fleet costa 150000 -> 60% = 90000
            sandbox.divestSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000);
            assert.deepEqual(gs.holding.subsidiaries, []);
            assert.deepEqual(syncedCash, [100000]);
        });

        test('sussidiaria non posseduta: non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.holding = { incorporated: true, subsidiaries: [] };
            gs.cash = 10000;
            sandbox.divestSubsidiary('sub_fleet');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyCempShares & sellCempShares', () => {
        test('buyCempShares scala costo azioni e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.cash = 500;
            gs.cempPrice = 10;
            sandbox.buyCempShares(20);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 300);
            assert.equal(gs.cempOwnedShares, 20);
            assert.deepEqual(syncedCash, [300]);
        });

        test('buyCempShares con fondi insufficienti non modifica azioni né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.cash = 100;
            gs.cempPrice = 10;
            sandbox.buyCempShares(20);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100);
            assert.equal(gs.cempOwnedShares || 0, 0);
            assert.deepEqual(syncedCash, []);
        });

        test('sellCempShares accredita ricavo azioni e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.cash = 100;
            gs.cempPrice = 10;
            gs.cempOwnedShares = 20;
            sandbox.sellCempShares(15);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 250);
            assert.equal(gs.cempOwnedShares, 5);
            assert.deepEqual(syncedCash, [250]);
        });

        test('sellCempShares con azioni insufficienti non accredita né chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.cash = 100;
            gs.cempPrice = 10;
            gs.cempOwnedShares = 5;
            sandbox.sellCempShares(10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100);
            assert.equal(gs.cempOwnedShares, 5);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_listCompanyIPO_NPC', () => {
        test('_listCompanyIPO_NPC scala la fee e accredita acquisto NPC sincronizzando con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.reputation = 4.0;
            gs.cash = 100000;
            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));
            // Fee: 50000 -> cash = 50000.
            // sharePrice = max(10, round(50000/1000)) = 50.
            // npcBuy = 50 * 300 = 15000.
            // Total cash: 50000 + 15000 = 65000.
            assert.equal(gs.cash, 65000);
            assert.equal(gs.companyIPO?.listed, true);
            assert.deepEqual(syncedCash, [50000, 65000]);
        });

        test('_listCompanyIPO_NPC con fondi insufficienti non quota e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupHoldingEnv();
            gs.reputation = 4.0;
            gs.cash = 20000;
            sandbox._listCompanyIPO_NPC();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 20000);
            assert.equal(gs.companyIPO?.listed, undefined);
            assert.deepEqual(syncedCash, []);
        });
    });
});
