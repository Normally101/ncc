'use strict';
/* ============================================================================
   test/economy/p2p-sync.test.js

   Regressione per il bug economico in p2p-market.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupP2PEnv(rpcResponses = {}) {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    const { sandbox } = env;
    sandbox.currentUser = { id: 'test_user_me' };
    sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            if (rpcResponses[fn]) {
                const res = typeof rpcResponses[fn] === 'function' ? rpcResponses[fn](params) : rpcResponses[fn];
                return res;
            }
            return { data: null, error: null };
        },
        from: () => ({
            select: () => ({
                gt: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
                eq: async () => ({ data: [], error: null }),
            }),
        }),
    };

    return { sandbox, gs: sandbox.gameState, syncedCash };
}

describe('p2p-market — sincronizzazione cassa col server (CE_money)', () => {

    describe('buyP2PCar', () => {
        test('buyP2PCar spende tramite CE_money e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_market_car: () => ({
                    data: {
                        price_paid: 30000,
                        seller_name: 'Bob',
                        fee: 1500,
                        car: { id: 'car_remote', name: 'Mercedes S-Class' },
                    },
                    error: null,
                }),
            });

            sandbox._p2pMarket.listings = [
                { id: 'listing_1', seller_user_id: 'other_user', ask_price: 30000 },
            ];
            gs.cash = 50000;

            await sandbox.buyP2PCar('listing_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 20000, 'il saldo locale deve essere scalato');
            assert.deepEqual(syncedCash, [20000], 'syncCash deve ricevere il saldo aggiornato');
        });

        test('buyP2PCar con fondi insufficienti non chiama la RPC né syncCash', async () => {
            let rpcCalled = false;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_market_car: () => {
                    rpcCalled = true;
                    return { data: { price_paid: 30000 }, error: null };
                },
            });

            sandbox._p2pMarket.listings = [
                { id: 'listing_1', seller_user_id: 'other_user', ask_price: 30000 },
            ];
            gs.cash = 10000;

            await sandbox.buyP2PCar('listing_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.equal(rpcCalled, false);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('contributeHoldingTreasury', () => {
        test('contributeHoldingTreasury spende tramite CE_money e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => ({
                    data: { treasury: 20000, tension: 15 },
                    error: null,
                }),
            });

            gs.cash = 50000;

            await sandbox.contributeHoldingTreasury('h1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000);
            assert.deepEqual(syncedCash, [30000]);
        });

        test('contributeHoldingTreasury con fondi insufficienti non sincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => ({
                    data: { treasury: 20000, tension: 15 },
                    error: null,
                }),
            });

            gs.cash = 5000;

            await sandbox.contributeHoldingTreasury('h1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('listCompanyIPO', () => {
        test('listCompanyIPO spende 50.000€ tramite CE_money e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_list_company_ipo: () => ({
                    data: { id: 'ipo_1', shares_total: 1000, ipo_price: 100 },
                    error: null,
                }),
            });

            gs.reputation = 4.0;
            gs.cash = 100000;

            await sandbox.listCompanyIPO();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.equal(gs.companyIPO?.listed, true);
            assert.deepEqual(syncedCash, [50000]);
        });

        test('listCompanyIPO con fondi insufficienti non quota e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_list_company_ipo: () => ({
                    data: { id: 'ipo_1', shares_total: 1000, ipo_price: 100 },
                    error: null,
                }),
            });

            gs.reputation = 4.0;
            gs.cash = 30000;

            await sandbox.listCompanyIPO();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 30000);
            assert.equal(gs.companyIPO?.listed, undefined);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyCompanyShares & sellCompanyShares', () => {
        test('buyCompanyShares spende il costo tramite CE_money e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_company_shares: () => ({
                    data: { company: 'TestCorp', price: 50 },
                    error: null,
                }),
            });

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 10000;

            await sandbox.buyCompanyShares('s1', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, [5000]);
        });

        test('buyCompanyShares con fondi insufficienti non chiama la RPC né syncCash', async () => {
            let rpcCalled = false;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_company_shares: () => {
                    rpcCalled = true;
                    return { data: { company: 'TestCorp', price: 50 }, error: null };
                },
            });

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 2000;

            await sandbox.buyCompanyShares('s1', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2000);
            assert.equal(rpcCalled, false);
            assert.deepEqual(syncedCash, []);
        });

        test('sellCompanyShares accredita tramite CE_money.earn e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_sell_company_shares: () => ({
                    data: { company: 'TestCorp', total: 4000, qty_sold: 50 },
                    error: null,
                }),
            });

            gs.cash = 5000;

            await sandbox.sellCompanyShares('s1', 50);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 9000);
            assert.deepEqual(syncedCash, [9000]);
        });
    });

    describe('_sindacatoGdfDailyCheck', () => {
        test('_sindacatoGdfDailyCheck scala la multa tramite CE_money e sincronizza con ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_gdf_inspection_check: () => ({
                    data: { inspected: true, fine: 3000 },
                    error: null,
                }),
            });

            gs.cash = 10000;

            await sandbox._sindacatoGdfDailyCheck();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 7000);
            assert.deepEqual(syncedCash, [7000]);
        });
    });
});
