'use strict';
/* ============================================================================
   test/economy/finance-lobby.test.js

   Test per le funzioni di lobbying e partecipazioni societarie in engine-finance.js:
     - donateToLobby
     - acquireVentureStake
     - divestVentureStake
   Tutte le movimentazioni di denaro DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

const AGENCY_ID = 'vc_startup';

function setupFinanceLobbyEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
        },
    });

    const gs = env.sandbox.gameState;
    if (!gs.ventureCapital) gs.ventureCapital = [];
    if (!gs.activeLobbyLaws) gs.activeLobbyLaws = [];
    gs.lobbyingPoints = 0;

    const agencies = vm.runInContext('VENTURE_AGENCIES', env.sandbox);
    if (!agencies || !agencies.length) {
        throw new Error('VENTURE_AGENCIES non caricato: il test non proverebbe niente');
    }
    if (!agencies.some(a => a.id === AGENCY_ID)) {
        throw new Error(`l'agenzia ${AGENCY_ID} non esiste in VENTURE_AGENCIES: aggiorna il test`);
    }

    return { env, sandbox: env.sandbox, gs, syncedCash, agencies };
}

describe('engine-finance — lobbying e partecipazioni venture capital (CE_money)', () => {

    describe('donateToLobby', () => {
        test('donateToLobby scala il cash e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceLobbyEnv();
            gs.cash = 10000;

            sandbox.donateToLobby(5000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000, 'il cash deve essere scalato');
            assert.deepEqual(syncedCash, [5000], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.lobbyingPoints, 5, 'devono essere assegnati 5 punti lobbying');
        });

        test('donateToLobby con importo inferiore a 1000 viene rifiutato: nessun cash scalato e nessuna sync', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceLobbyEnv();
            gs.cash = 10000;

            sandbox.donateToLobby(500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.lobbyingPoints, 0);
        });

        test('donateToLobby con fondi insufficienti non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceLobbyEnv();
            gs.cash = 500;

            sandbox.donateToLobby(2000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.lobbyingPoints, 0);
        });

        test('donateToLobby accumula punti lobbying su donazioni multiple', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceLobbyEnv();
            gs.cash = 20000;

            sandbox.donateToLobby(3000);
            await new Promise(r => setImmediate(r));

            sandbox.donateToLobby(4000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 13000);
            assert.deepEqual(syncedCash, [17000, 13000]);
            assert.equal(gs.lobbyingPoints, 7);
        });
    });

    describe('acquireVentureStake', () => {
        test('acquireVentureStake acquisisce quota, scala il costo e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash, agencies } = setupFinanceLobbyEnv();
            const agency = agencies.find(a => a.id === AGENCY_ID);
            gs.reputation = agency.minRep + 1;
            gs.cash = 100000;
            const stakePercent = 10;
            const cost = Math.floor(agency.valuation * stakePercent / 100);

            sandbox.acquireVentureStake(AGENCY_ID, stakePercent);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000 - cost, 'il cash deve essere scalato');
            assert.deepEqual(syncedCash, [100000 - cost], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.ventureCapital.length, 1);
            assert.equal(gs.ventureCapital[0].agencyId, AGENCY_ID);
            assert.equal(gs.ventureCapital[0].stakePercent, 10);
        });

        test('acquireVentureStake con reputazione insufficiente non acquisisce quota e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, agencies } = setupFinanceLobbyEnv();
            const agency = agencies.find(a => a.id === AGENCY_ID);
            gs.reputation = Math.max(0, agency.minRep - 1);
            gs.cash = 100000;

            sandbox.acquireVentureStake(AGENCY_ID, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.ventureCapital.length, 0);
        });

        test('acquireVentureStake con fondi insufficienti non acquisisce quota e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, agencies } = setupFinanceLobbyEnv();
            const agency = agencies.find(a => a.id === AGENCY_ID);
            gs.reputation = agency.minRep + 1;
            gs.cash = 1000; // Troppo poco per una quota del 10% (50.000)

            sandbox.acquireVentureStake(AGENCY_ID, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.ventureCapital.length, 0);
        });

        test('acquireVentureStake incrementa quota esistente se entro maxStake', async () => {
            const { sandbox, gs, syncedCash, agencies } = setupFinanceLobbyEnv();
            const agency = agencies.find(a => a.id === AGENCY_ID);
            gs.reputation = agency.minRep + 1;
            gs.cash = 150000;
            gs.ventureCapital = [{ agencyId: AGENCY_ID, stakePercent: 10 }];
            const cost = Math.floor(agency.valuation * 10 / 100);

            sandbox.acquireVentureStake(AGENCY_ID, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 150000 - cost);
            assert.deepEqual(syncedCash, [150000 - cost]);
            assert.equal(gs.ventureCapital.length, 1);
            assert.equal(gs.ventureCapital[0].stakePercent, 20);
        });

        test('acquireVentureStake rifiuta incremento se supera maxStake', async () => {
            const { sandbox, gs, syncedCash, agencies } = setupFinanceLobbyEnv();
            const agency = agencies.find(a => a.id === AGENCY_ID);
            gs.reputation = agency.minRep + 1;
            gs.cash = 150000;
            // maxStake per vc_startup è 49; mettiamo 45 e proviamo ad aggiungere 10 (totale 55 > 49)
            gs.ventureCapital = [{ agencyId: AGENCY_ID, stakePercent: 45 }];

            sandbox.acquireVentureStake(AGENCY_ID, 10);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 150000);
            assert.deepEqual(syncedCash, []);
            assert.equal(gs.ventureCapital[0].stakePercent, 45);
        });
    });

    describe('divestVentureStake', () => {
        test('divestVentureStake rimuove la quota, accredita il 75% della valutazione e sincronizza', async () => {
            const { sandbox, gs, syncedCash, agencies } = setupFinanceLobbyEnv();
            const agency = agencies.find(a => a.id === AGENCY_ID);
            const stakePercent = 10;
            const refund = Math.floor(agency.valuation * stakePercent / 100 * 0.75);

            gs.cash = 5000;
            gs.ventureCapital = [{ agencyId: AGENCY_ID, stakePercent }];

            sandbox.divestVentureStake(AGENCY_ID);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000 + refund, 'il cash deve essere accreditato del 75%');
            assert.deepEqual(syncedCash, [5000 + refund], 'syncCash deve ricevere il nuovo saldo');
            assert.equal(gs.ventureCapital.length, 0);
        });

        test('divestVentureStake per agenzia non posseduta non accredita cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupFinanceLobbyEnv();
            gs.cash = 5000;
            gs.ventureCapital = [];

            sandbox.divestVentureStake(AGENCY_ID);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
