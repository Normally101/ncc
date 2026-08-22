'use strict';
/* ============================================================================
   test/economy/doppio-conteggio-infra-turism.test.js

   Prova dei due casi censiti il 21/08 in docs/DOPPIO-CONTEGGIO.md e corretti
   in questo ramo:

   - infrastructure.js `_infraBuyDepot`: la RPC `rpc_buy_fuel_depot` muove GIA'
     companies.cash sul server (30_sql_patch.sql: UPDATE companies SET cash = cash - v_cost …);
   - tourism.js `_tourismDailyTick`: la RPC `rpc_tourism_daily_tick` muove GIA'
     companies.cash sul server (33_tourism_tenders.sql: UPDATE companies SET cash = cash + v_total_pay …).

   Sul codice PRECEDENTE il client, dopo la RPC, chiamava CE_money.spend / earn:
   quelle rispediscono al server il totale calcolato dal browser, quindi con
   l'eco Realtime della scrittura in arrivo il saldo si spostava DUE volte e il
   server veniva sovrascritto dal client. La cura e' allineare il locale con
   addebitatoDalServer / accreditatoDalServer senza mai chiamare ServerState.syncCash.

   I test "eco" e "no-eco" qui sotto sono ROSSI se si riporta spend/earn al
   posto delle porte server-authoritative, VERDI sul codice attuale.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupSyncRecorder() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('doppio conteggio 21/08 — infrastructure.js e tourism.js', () => {

    describe('_infraBuyDepot — rpc_buy_fuel_depot ha gia\' mosso companies.cash', () => {
        test('l eco Realtime arrivato dentro la RPC non fa ripartire il totale al server', async () => {
            const { sandbox, gs, syncedCash } = setupSyncRecorder();
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') {
                        rpcCalled = true;
                        // L'UPDATE del server e' gia' avvenuto: l'eco Realtime porta
                        // il saldo autoritativo (500k - 300k) PRIMA della risposta.
                        gs.cash = 200000;
                        return { data: { success: true }, error: null };
                    }
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcCalled, true, 'l acquisto resta una RPC server-side');
            assert.deepEqual(syncedCash, [],
                'spend rispiederebbe il totale calcolato dal browser: serve addebitatoDalServer');
        });

        test('acquisto riuscito: il saldo locale si muove UNA volta sola e nessun syncCash parte', async () => {
            const { sandbox, gs, syncedCash } = setupSyncRecorder();
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') { rpcCalled = true; return { data: { success: true }, error: null }; }
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcCalled, true, 'la RPC deve restare la via dell acquisto');
            assert.equal(gs.cash, 200000, 'il saldo scende di 300.000 una volta sola');
            assert.deepEqual(syncedCash, [],
                'il client NON deve sincronizzare: rpc_buy_fuel_depot aggiorna gia\' companies.cash');
        });

        test('RPC fallita: nessuna mossa locale e nessun syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupSyncRecorder();
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') return { data: null, error: { message: 'Provincia ha già un deposito' } };
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000, 'senza esito server il saldo non si tocca');
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_tourismDailyTick — rpc_tourism_daily_tick ha gia\' mosso companies.cash', () => {
        test('l eco Realtime arrivato dentro la RPC non fa ripartire il payout al server', async () => {
            const { sandbox, gs, syncedCash } = setupSyncRecorder();
            sandbox.currentUser = { id: 'user_test_123' };
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_tourism_daily_tick') {
                        rpcCalled = true;
                        // L'UPDATE del server e' gia' avvenuto: l'eco porta il saldo
                        // autoritativo (50k + 15k) PRIMA della risposta.
                        gs.cash = 65000;
                        return {
                            data: {
                                total_payout: 15000,
                                payouts: [{ name: 'Aurevia Elite Journeys', icon: '🌟', amount: 15000 }],
                                expiring_soon: 0,
                            },
                            error: null,
                        };
                    }
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 50000;
            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcCalled, true, 'il tick resta una RPC server-side');
            assert.deepEqual(syncedCash, [],
                'earn rispiederebbe il totale calcolato dal browser: serve accreditatoDalServer');
        });

        test('payout riuscito: il saldo locale si muove UNA volta sola e nessun syncCash parte', async () => {
            const { sandbox, gs, syncedCash } = setupSyncRecorder();
            sandbox.currentUser = { id: 'user_test_123' };
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_tourism_daily_tick') {
                        rpcCalled = true;
                        return {
                            data: {
                                total_payout: 15000,
                                payouts: [{ name: 'Aurevia Elite Journeys', icon: '🌟', amount: 15000 }],
                                expiring_soon: 0,
                            },
                            error: null,
                        };
                    }
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 50000;
            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcCalled, true, 'la RPC deve restare la via del payout');
            assert.equal(gs.cash, 65000, 'il payout entra una volta sola');
            assert.deepEqual(syncedCash, [],
                'il client NON deve sincronizzare: rpc_tourism_daily_tick aggiorna gia\' companies.cash');
        });

        test('RPC fallita: nessun accredito e nessun syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupSyncRecorder();
            sandbox.currentUser = { id: 'user_test_123' };
            sandbox.supabaseClient = {
                rpc: async () => ({ data: null, error: { message: 'DB error' } }),
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 50000;
            await sandbox._tourismDailyTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
