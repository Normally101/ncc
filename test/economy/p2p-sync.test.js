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

describe('p2p-market — il server ha già mosso i soldi (addebitatoDalServer / accreditatoDalServer)', () => {

    describe('buyP2PCar', () => {
        test('buyP2PCar allinea la cassa con addebitatoDalServer SENZA chiamare syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già mosso il saldo)');
        });

        test('buyP2PCar con eco realtime concorrente non risincronizza né fa doppio conteggio', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_market_car: () => {
                    // Simula eco realtime che aggiorna companies.cash prima che la risposta RPC ritorni
                    gs.cash = 20000;
                    return {
                        data: {
                            price_paid: 30000,
                            seller_name: 'Bob',
                            fee: 1500,
                            car: { id: 'car_remote', name: 'Mercedes S-Class' },
                        },
                        error: null,
                    };
                },
            });

            sandbox._p2pMarket.listings = [
                { id: 'listing_1', seller_user_id: 'other_user', ask_price: 30000 },
            ];
            gs.cash = 50000;

            await sandbox.buyP2PCar('listing_1');
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione al server');
        });

        test('buyP2PCar con fondi insufficienti non chiama la RPC né tocca cash', async () => {
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

        test('buyP2PCar con errore RPC non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_market_car: () => ({ data: null, error: { message: 'Errore acquisto' } }),
            });

            sandbox._p2pMarket.listings = [
                { id: 'listing_1', seller_user_id: 'other_user', ask_price: 30000 },
            ];
            gs.cash = 50000;

            await sandbox.buyP2PCar('listing_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('contributeHoldingTreasury', () => {
        test('contributeHoldingTreasury allinea con addebitatoDalServer SENZA chiamare syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
        });

        test('contributeHoldingTreasury con eco realtime concorrente non risincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => {
                    gs.cash = 30000;
                    return {
                        data: { treasury: 20000, tension: 15 },
                        error: null,
                    };
                },
            });

            gs.cash = 50000;

            await sandbox.contributeHoldingTreasury('h1', 20000);
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, []);
        });

        test('contributeHoldingTreasury con fondi insufficienti non chiama RPC né tocca cash', async () => {
            let rpcCalled = false;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => {
                    rpcCalled = true;
                    return { data: { treasury: 20000, tension: 15 }, error: null };
                },
            });

            gs.cash = 5000;

            await sandbox.contributeHoldingTreasury('h1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(rpcCalled, false);
            assert.deepEqual(syncedCash, []);
        });

        test('contributeHoldingTreasury con errore RPC non scala cassa', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => ({
                    data: null,
                    error: { message: 'Errore holding' },
                }),
            });

            gs.cash = 50000;

            await sandbox.contributeHoldingTreasury('h1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('listCompanyIPO', () => {
        test('listCompanyIPO addebita quota 50.000€ tramite addebitatoDalServer SENZA chiamare syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già scalato 50.000€)');
        });

        test('listCompanyIPO con eco realtime concorrente non risincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_list_company_ipo: () => {
                    gs.cash = 50000;
                    return {
                        data: { id: 'ipo_1', shares_total: 1000, ipo_price: 100 },
                        error: null,
                    };
                },
            });

            gs.reputation = 4.0;
            gs.cash = 100000;

            await sandbox.listCompanyIPO();
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, []);
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

        test('listCompanyIPO con errore RPC non quota e non tocca cash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_list_company_ipo: () => ({
                    data: null,
                    error: { message: 'Errore IPO' },
                }),
            });

            gs.reputation = 4.0;
            gs.cash = 100000;

            await sandbox.listCompanyIPO();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs.companyIPO?.listed, undefined);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('buyCompanyShares & sellCompanyShares', () => {
        test('buyCompanyShares allinea con addebitatoDalServer SENZA chiamare syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
        });

        test('buyCompanyShares con eco realtime non fa doppio addebito né risincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_company_shares: () => {
                    gs.cash = 5000;
                    return {
                        data: { company: 'TestCorp', price: 50 },
                        error: null,
                    };
                },
            });

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 10000;

            await sandbox.buyCompanyShares('s1', 100);
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, []);
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

        test('buyCompanyShares con errore RPC non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_company_shares: () => ({
                    data: null,
                    error: { message: 'Errore acquisto azioni' },
                }),
            });

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 10000;

            await sandbox.buyCompanyShares('s1', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('sellCompanyShares accredita con accreditatoDalServer SENZA chiamare syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già accreditato i soldi)');
        });

        test('sellCompanyShares con eco realtime non duplica l incasso né risincronizza', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_sell_company_shares: () => {
                    gs.cash = 9000;
                    return {
                        data: { company: 'TestCorp', total: 4000, qty_sold: 50 },
                        error: null,
                    };
                },
            });

            gs.cash = 5000;

            await sandbox.sellCompanyShares('s1', 50);
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, []);
        });

        test('sellCompanyShares con errore RPC non accredita denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_sell_company_shares: () => ({
                    data: null,
                    error: { message: 'Errore vendita azioni' },
                }),
            });

            gs.cash = 5000;

            await sandbox.sellCompanyShares('s1', 50);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('_sindacatoGdfDailyCheck', () => {
        test('_sindacatoGdfDailyCheck scala la multa tramite addebitatoDalServer SENZA chiamare syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato (il server ha già scalato la multa)');
        });

        test('_sindacatoGdfDailyCheck se non ispezionato non tocca cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_gdf_inspection_check: () => ({
                    data: { inspected: false, fine: 0 },
                    error: null,
                }),
            });

            gs.cash = 10000;

            await sandbox._sindacatoGdfDailyCheck();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('_sindacatoGdfDailyCheck con eco realtime concorrente non duplica la multa', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_gdf_inspection_check: () => {
                    gs.cash = 7000;
                    return {
                        data: { inspected: true, fine: 3000 },
                        error: null,
                    };
                },
            });

            gs.cash = 10000;

            await sandbox._sindacatoGdfDailyCheck();
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, []);
        });
    });
});
