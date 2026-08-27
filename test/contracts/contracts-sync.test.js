'use strict';
/* ============================================================================
   test/contracts/contracts-sync.test.js

   Regressione per il bug economico in contracts.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupContractsEnv() {
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

function primeTender(sandbox, overrides = {}) {
    sandbox.gameState.corporateTenders = [{
        id: 't1', status: 'open',
        company: {
            company_name: 'Test Corp',
            tier: 3,
            payout_per_hour: 100,
            contract_duration_days: 14,
            tender_requirements: { required_vehicle_type: 'standard', min_fleet_size: 1, min_reputation: 0 },
        },
        openedDay: 1,
        closingDay: 3,
        playerBid: null,
        ...overrides,
    }];
    return sandbox.gameState.corporateTenders[0];
}

describe('contracts — sincronizzazione cassa col server (CE_money)', () => {

    describe('CE_placeBid', () => {
        test('piazzare offerta scala il pledge e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            primeTender(sandbox);
            gs.cash = 100000;

            sandbox.CE_placeBid('t1', 10000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 90000);
            assert.deepEqual(syncedCash, [90000]);
        });

        test('rialzare offerta scala la differenza e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            primeTender(sandbox);
            gs.cash = 100000;

            sandbox.CE_placeBid('t1', 10000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 90000);

            sandbox.CE_placeBid('t1', 15000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000);
            assert.deepEqual(syncedCash, [90000, 85000]);
        });

        test('abbassare offerta accredita la differenza e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            primeTender(sandbox);
            gs.cash = 100000;

            sandbox.CE_placeBid('t1', 15000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 85000);

            sandbox.CE_placeBid('t1', 5000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 95000);
            assert.deepEqual(syncedCash, [85000, 95000]);
        });

        test('fondi insufficienti: non piazza offerta e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            primeTender(sandbox);
            gs.cash = 5000;

            sandbox.CE_placeBid('t1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('CE_cancelBid', () => {
        test('annullare offerta accredita il pledge e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            primeTender(sandbox, { playerBid: { pledgedCash: 10000, score: 50 } });
            gs.cash = 50000;

            sandbox.CE_cancelBid('t1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 60000);
            assert.equal(gs.corporateTenders[0].playerBid, null);
            assert.deepEqual(syncedCash, [60000]);
        });

        test('annullare offerta senza pledge o già annullata non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            primeTender(sandbox, { playerBid: null });
            gs.cash = 50000;

            sandbox.CE_cancelBid('t1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('CE_Contracts.dailyTick — incassi contratti e rimborsi bandi persi', () => {
        test('riscuote payout contratti attivi e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            gs.day = 5;
            gs.cash = 20000;
            /* Dal 28/08 un contratto impegna `tier` veicoli e paga in proporzione
               alla capacita' operativa: senza flotta non incassa nulla, perche' il
               reddito passivo non e' piu' denaro dal nulla. Qui la flotta c'e',
               quindi si riscuote l'intero e il test verifica cio' che gli
               interessa davvero — la sincronizzazione col server. */
            gs.fleet = [1, 2, 3].map(i => ({ id: 'v' + i, condition: 100, outOfService: null, isSeized: false }));
            gs.corporateContracts = [{
                id: 'c1',
                companyId: 'Test Corp',
                company: { company_name: 'Test Corp', tier: 3, contract_duration_days: 14 },
                startDay: 1,
                endDay: 15,
                dailyPayout: 2500,
                totalEarned: 0,
                status: 'active',
                veicoliImpegnati: 3,
            }];
            gs.corporateTenders = [];

            sandbox.CE_Contracts.dailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 22500);
            assert.equal(gs.corporateContracts[0].totalEarned, 2500);
            assert.deepEqual(syncedCash, [22500]);
        });

        test('rimborso bando perso accredita il pledge e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupContractsEnv();
            gs.day = 4;
            gs.cash = 50000;
            gs.corporateContracts = [];
            gs.corporateTenders = [{
                id: 't1',
                companyId: 'Test Corp',
                company: { company_name: 'Test Corp', tier: 5, payout_per_hour: 5000, contract_duration_days: 14 },
                openedDay: 1,
                closingDay: 3, // scaduto
                playerBid: { pledgedCash: 8000, score: -1 }, // punteggio minimo per perdere sicuro
                status: 'open',
            }];

            sandbox.CE_Contracts.dailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 58000);
            assert.deepEqual(syncedCash, [58000]);
        });
    });
});
