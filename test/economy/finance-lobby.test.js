'use strict';
/* ============================================================================
   test/economy/finance-lobby.test.js

   Test per le funzioni finanziarie e lobbying convertite a CE_money:
     - donateToLobby
     - passLobbyLaw
     - acquireVentureStake
     - divestVentureStake
     - buyLifestyleAsset
     - repayLoan
     - takeLoan
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupFinanceEnv() {
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

describe('engine-finance — sincronizzazione cassa col server (CE_money)', () => {

    describe('donateToLobby', () => {
        test('donazione scala il denaro e sincronizza la cassa col server', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 45000, 'il saldo locale deve essere scalato');
            assert.equal(gs.lobbyingPoints, 5, 'deve assegnare 5 punti lobbying');
            assert.deepEqual(syncedCash, [45000], 'syncCash deve essere chiamato con il saldo aggiornato');
        });

        test('donazione con fondi insufficienti non scala nulla e non assegna punti', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 2000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(5000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2000);
            assert.equal(gs.lobbyingPoints, 0);
            assert.deepEqual(syncedCash, []);
        });

        test('donazione sotto il minimo (€1000) non fa nulla', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 50000;
            gs.lobbyingPoints = 0;

            sandbox.donateToLobby(500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.lobbyingPoints, 0);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('passLobbyLaw', () => {
        test('approvazione legge scala punti lobbying e cassa e sincronizza col server', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const law = sandbox.LOBBY_LAWS[0];
            assert.ok(law, 'deve esistere almeno una legge in LOBBY_LAWS');
            gs.cash = 100000;
            gs.lobbyingPoints = law.pointsCost + 10;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);
            await new Promise(r => setImmediate(r));

            const expectedCash = 100000 - (law.cashCost || 0);
            assert.equal(gs.cash, expectedCash);
            assert.equal(gs.lobbyingPoints, 10);
            assert.ok(gs.activeLobbyLaws.includes(law.id));
            if (law.cashCost) {
                assert.deepEqual(syncedCash, [expectedCash]);
            }
        });

        test('approvazione legge fallisce se i fondi non bastano e non scala punti lobbying', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            // Cerca una legge con cashCost > 0
            const law = sandbox.LOBBY_LAWS.find(l => l.cashCost > 0) || { id: 'test_law', name: 'Test', pointsCost: 5, cashCost: 20000 };
            if (!sandbox.LOBBY_LAWS.some(l => l.id === law.id)) {
                sandbox.LOBBY_LAWS.push(law);
            }
            gs.cash = 5000;
            gs.lobbyingPoints = 20;
            gs.activeLobbyLaws = [];

            sandbox.passLobbyLaw(law.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(gs.lobbyingPoints, 20, 'i punti lobbying non devono essere scalati');
            assert.equal(gs.activeLobbyLaws.includes(law.id), false);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('acquireVentureStake', () => {
        test('acquisizione quota scala il denaro e sincronizza la cassa', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const agency = sandbox.VENTURE_AGENCIES[0];
            assert.ok(agency, 'deve esistere almeno un agenzia in VENTURE_AGENCIES');
            gs.cash = 500000;
            gs.reputation = agency.minRep + 1;
            gs.ventureCapital = [];

            const stake = 10;
            const cost = Math.floor(agency.valuation * stake / 100);

            sandbox.acquireVentureStake(agency.id, stake);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000 - cost);
            assert.deepEqual(syncedCash, [500000 - cost]);
            assert.equal(gs.ventureCapital.length, 1);
            assert.equal(gs.ventureCapital[0].agencyId, agency.id);
            assert.equal(gs.ventureCapital[0].stakePercent, stake);
        });

        test('acquisizione fallisce senza fondi sufficienti e non modifica ventureCapital', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const agency = sandbox.VENTURE_AGENCIES[0];
            gs.cash = 10;
            gs.reputation = agency.minRep + 1;
            gs.ventureCapital = [];

            sandbox.acquireVentureStake(agency.id, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.ventureCapital.length, 0);
        });

        test('acquisizione quota oltre il limite massimo non tocca il denaro', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const agency = sandbox.VENTURE_AGENCIES[0];
            gs.cash = 500000;
            gs.reputation = agency.minRep + 1;
            gs.ventureCapital = [{ agencyId: agency.id, stakePercent: agency.maxStake }];

            sandbox.acquireVentureStake(agency.id, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.ventureCapital[0].stakePercent, agency.maxStake);
        });
    });

    describe('divestVentureStake', () => {
        test('cessione quota accredita il 75% del valore e sincronizza la cassa', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const agency = sandbox.VENTURE_AGENCIES[0];
            gs.cash = 10000;
            gs.ventureCapital = [{ agencyId: agency.id, stakePercent: 20 }];

            const refund = Math.floor(agency.valuation * 20 / 100 * 0.75);

            sandbox.divestVentureStake(agency.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000 + refund);
            assert.deepEqual(syncedCash, [10000 + refund]);
            assert.equal(gs.ventureCapital.length, 0);
        });

        test('cessione con agenzia non posseduta non tocca cassa', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            gs.ventureCapital = [];

            sandbox.divestVentureStake('non_existent');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyLifestyleAsset', () => {
        test('acquisto asset scala il prezzo, sincronizza cassa e assegna repBonus', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const asset = sandbox.LIFESTYLE_ASSETS[0];
            assert.ok(asset, 'deve esistere almeno un asset in LIFESTYLE_ASSETS');
            gs.cash = asset.price + 10000;
            gs.reputation = 3.0;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, [10000]);
            assert.ok(gs.lifestyleAssets.includes(asset.id));
            if (asset.repBonus) {
                assert.equal(gs.reputation, Math.min(5.0, 3.0 + asset.repBonus));
            }
        });

        test('acquisto asset senza fondi sufficienti non scala e non assegna asset', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const asset = sandbox.LIFESTYLE_ASSETS[0];
            gs.cash = asset.price - 100;
            gs.lifestyleAssets = [];

            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, asset.price - 100);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.lifestyleAssets.length, 0);
        });

        test('acquisto asset già posseduto non addebita due volte', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            const asset = sandbox.LIFESTYLE_ASSETS[0];
            gs.cash = asset.price + 10000;
            gs.lifestyleAssets = [asset.id];

            sandbox.buyLifestyleAsset(asset.id);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, asset.price + 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('repayLoan', () => {
        test('saldare prestito scala importo, sincronizza cassa, rimuove prestito e aumenta creditScore', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 60000;
            gs.creditScore = 500;
            gs.loans = [{ id: 101, amount: 20000, original: 20000, remaining: 20000, rate: 0.05 }];

            sandbox.repayLoan(101);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000);
            assert.deepEqual(syncedCash, [40000]);
            assert.equal(gs.loans.length, 0);
            assert.equal(gs.creditScore, 520);
        });

        test('saldare prestito con fondi insufficienti non tocca prestito né creditScore', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 5000;
            gs.creditScore = 500;
            gs.loans = [{ id: 101, amount: 20000, original: 20000, remaining: 20000, rate: 0.05 }];

            sandbox.repayLoan(101);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 1);
            assert.equal(gs.creditScore, 500);
        });
    });

    describe('takeLoan', () => {
        test('accendere prestito accredita importo, sincronizza cassa e registra prestito', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            gs.creditScore = 650; // Silver tier: loanLimit 1,000,000, rate 0.06
            gs.loans = [];
            gs.nextId = 1;

            sandbox.takeLoan(50000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 60000);
            assert.deepEqual(syncedCash, [60000]);
            assert.equal(gs.loans.length, 1);
            assert.equal(gs.loans[0].amount, 50000);
            assert.equal(gs.loans[0].rate, 0.06);
        });

        test('richiesta prestito oltre il limite di fido viene rifiutata', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceEnv();
            gs.cash = 10000;
            gs.creditScore = 400; // Basic tier: loanLimit 100,000
            gs.loans = [{ id: 1, amount: 90000, original: 90000, remaining: 90000, rate: 0.12 }];

            sandbox.takeLoan(20000); // 90k + 20k > 100k
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.loans.length, 1);
        });
    });
});
