'use strict';
/* ============================================================================
   test/azioni/societa.test.js

   Azioni societarie (engine-holding.js / hostile_takeover.js):
   incorporateHolding, acquireSubsidiary, divestSubsidiary,
   acquireVentureStake, divestVentureStake, listCompanyIPO.

   Regole verificate per ogni azione che muove denaro:
   - importo giusto, UNA SOLA volta;
   - passa da window.CE_money (che sincronizza via ServerState.syncCash),
     mai da gameState.cash -=;
   - rifiuti: fondi insufficienti, bersaglio inesistente, azione ripetuta.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
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
    return { sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

// ── acquireSubsidiary ──────────────────────────────────────────────
describe('acquireSubsidiary', () => {
    test('felice: scala il costo della sussidiaria e la registra', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.holding = { incorporated: true, subsidiaries: [] };
        gs.cash = 500000;
        const sub = sandbox.HOLDING_SUBSIDIARIES.find(s => s.id === 'sub_fleet'); // costa 150000
        sandbox.acquireSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 500000 - sub.cost);
        assert.deepEqual(gs.holding.subsidiaries, ['sub_fleet']);
        assert.deepEqual(syncedCash, [gs.cash]);
    });

    test('senza holding incorporata: rifiuta senza toccare la cassa', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.cash = 500000;
        sandbox.acquireSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 500000);
        assert.deepEqual(syncedCash, []);
    });

    test('bersaglio inesistente: nessun movimento', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.holding = { incorporated: true, subsidiaries: [] };
        gs.cash = 500000;
        sandbox.acquireSubsidiary('sub_nave_spaziale');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 500000);
        assert.deepEqual(gs.holding.subsidiaries, []);
        assert.deepEqual(syncedCash, []);
    });

    test('fondi insufficienti: non acquisisce', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.holding = { incorporated: true, subsidiaries: [] };
        const sub = sandbox.HOLDING_SUBSIDIARIES.find(s => s.id === 'sub_tech'); // costa 300000
        gs.cash = sub.cost - 1;
        sandbox.acquireSubsidiary('sub_tech');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, sub.cost - 1);
        assert.deepEqual(gs.holding.subsidiaries, []);
        assert.deepEqual(syncedCash, []);
    });

    test('azione ripetuta due volte: paga una sola volta', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.holding = { incorporated: true, subsidiaries: [] };
        const sub = sandbox.HOLDING_SUBSIDIARIES.find(s => s.id === 'sub_park'); // costa 120000
        gs.cash = 400000;
        sandbox.acquireSubsidiary('sub_park');
        sandbox.acquireSubsidiary('sub_park');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 400000 - sub.cost);
        assert.deepEqual(gs.holding.subsidiaries, ['sub_park']);
        assert.equal(syncedCash.length, 1);
    });
});

// ── divestSubsidiary ───────────────────────────────────────────────
describe('divestSubsidiary', () => {
    test('felice: incassa il 60% del costo (arrotondato) e rimuove la sussidiaria', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        const sub = sandbox.HOLDING_SUBSIDIARIES.find(s => s.id === 'sub_hotel'); // costa 250000
        gs.holding = { incorporated: true, subsidiaries: ['sub_hotel'] };
        gs.cash = 0;
        sandbox.divestSubsidiary('sub_hotel');
        await new Promise(r => setImmediate(r));
        const resale = Math.floor(sub.cost * 0.60);
        assert.equal(gs.cash, resale);
        assert.deepEqual(gs.holding.subsidiaries, []);
        assert.deepEqual(syncedCash, [resale]);
    });

    test('bersaglio inesistente: nessun movimento', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.holding = { incorporated: true, subsidiaries: [] };
        gs.cash = 1000;
        sandbox.divestSubsidiary('sub_nave_spaziale');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 1000);
        assert.deepEqual(syncedCash, []);
    });

    test('sussidiaria non posseduta: nessun movimento', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.holding = { incorporated: true, subsidiaries: [] };
        gs.cash = 1000;
        sandbox.divestSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 1000);
        assert.deepEqual(gs.holding.subsidiaries, []);
        assert.deepEqual(syncedCash, []);
    });

    test('ceduta ripetuta due volte: accredita una volta soltanto', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        const sub = sandbox.HOLDING_SUBSIDIARIES.find(s => s.id === 'sub_fuel'); // costa 180000
        gs.holding = { incorporated: true, subsidiaries: ['sub_fuel'] };
        gs.cash = 0;
        sandbox.divestSubsidiary('sub_fuel');
        sandbox.divestSubsidiary('sub_fuel');
        await new Promise(r => setImmediate(r));
        const resale = Math.floor(sub.cost * 0.60);
        assert.equal(gs.cash, resale);
        assert.equal(syncedCash.length, 1);
    });
});

// ── incorporateHolding ─────────────────────────────────────────────
describe('incorporateHolding', () => {
    test('felice: scala 200.000€ una sola volta e incorpora', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.reputation = 4.5;
        gs.cash = 300000;
        sandbox.incorporateHolding();
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 100000);
        assert.equal(gs.holding?.incorporated, true);
        assert.deepEqual(syncedCash, [100000]); // UNA sola sincronizzazione
    });

    test('reputazione insufficiente: niente spesa, niente holding', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.reputation = 3.9;
        gs.cash = 300000;
        sandbox.incorporateHolding();
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 300000);
        assert.ok(!gs.holding?.incorporated);
        assert.deepEqual(syncedCash, []);
    });

    test('fondi insufficienti: non incorpora e non tocca la cassa', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.reputation = 4.5;
        gs.cash = 199999;
        sandbox.incorporateHolding();
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 199999);
        assert.ok(!gs.holding?.incorporated);
        assert.deepEqual(syncedCash, []);
    });

    test('azione ripetuta due volte: paga una volta soltanto', async () => {
        const { sandbox, gs, syncedCash } = setupEnv();
        gs.reputation = 4.5;
        gs.cash = 500000;
        sandbox.incorporateHolding();
        sandbox.incorporateHolding(); // seconda chiamata deve rifiutare
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, 300000);
        assert.deepEqual(syncedCash, [300000]);
    });
});
