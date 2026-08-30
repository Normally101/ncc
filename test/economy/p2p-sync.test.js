'use strict';
/* ============================================================================
   test/economy/p2p-sync.test.js

   Regressione anti-doppio-conteggio in p2p-market.js:
   le RPC del server aggiornano già companies.cash sul DB.
   Il client DEVE usare CE_money.addebitatoDalServer / CE_money.accreditatoDalServer
   per allineare la cassa locale SENZA richiamare ServerState.syncCash
   (che rispedirebbe il totale provocando doppio addebito/accredito).
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
                or: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
                eq: async () => ({ data: [], error: null }),
            }),
        }),
    };

    return { sandbox, gs: sandbox.gameState, syncedCash };
}

describe('p2p-market — allineamento cassa senza risincronizzazione (anti-doppio-conteggio)', () => {

    describe('buyP2PCar', () => {
        test('buyP2PCar addebita con addebitatoDalServer senza invocare ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'non deve risincronizzare con syncCash perché la RPC ha già scalato companies.cash');
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

        test('buyP2PCar chiama CE_money.addebitatoDalServer e non CE_money.spend', async () => {
            const { sandbox, gs } = setupP2PEnv({
                rpc_buy_market_car: () => ({
                    data: {
                        price_paid: 25000,
                        seller_name: 'Alice',
                        fee: 1250,
                        car: { id: 'car_remote2', name: 'BMW 7er' },
                    },
                    error: null,
                }),
            });

            let addebitatoCalled = false;
            let spendCalled = false;
            const origAddebitato = sandbox.CE_money.addebitatoDalServer;
            const origSpend = sandbox.CE_money.spend;
            sandbox.CE_money.addebitatoDalServer = (amt, reason) => {
                addebitatoCalled = true;
                return origAddebitato(amt, reason);
            };
            sandbox.CE_money.spend = (amt, reason) => {
                spendCalled = true;
                return origSpend(amt, reason);
            };

            sandbox._p2pMarket.listings = [
                { id: 'listing_2', seller_user_id: 'other_user', ask_price: 25000 },
            ];
            gs.cash = 60000;

            await sandbox.buyP2PCar('listing_2');
            assert.equal(addebitatoCalled, true, 'deve chiamare addebitatoDalServer');
            assert.equal(spendCalled, false, 'non deve chiamare spend');
            assert.equal(gs.cash, 35000);
        });

        test('buyP2PCar con eco Realtime arrivato prima della fine RPC non provoca doppio addebito né syncCash', async () => {
            let rpcChiamate = 0;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_market_car: () => {
                    rpcChiamate++;
                    // La RPC risponde a scrittura già avvenuta: l'eco Realtime
                    // di companies.cash (80000 − 30000) ha già toccato il
                    // gameState locale prima che il gestore ripartisse.
                    gs.cash = 50000;
                    return {
                        data: {
                            price_paid: 30000, seller_name: 'Bob', fee: 1500,
                            car: { id: 'car_remote', name: 'Mercedes S-Class' },
                        },
                        error: null,
                    };
                },
            });

            sandbox._p2pMarket.listings = [
                { id: 'listing_echo', seller_user_id: 'other_user', ask_price: 30000 },
            ];
            gs.cash = 80000;

            await sandbox.buyP2PCar('listing_echo');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcChiamate, 1, 'l\'acquisto deve passare dalla RPC, non da un movimento locale');
            assert.deepEqual(syncedCash, [],
                'con l\'eco già arrivato, rispedire il totale al server conterebbe i soldi due volte');
        });
    });

    describe('contributeHoldingTreasury', () => {
        test('contributeHoldingTreasury addebita con addebitatoDalServer senza invocare ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'non deve risincronizzare con syncCash');
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

        test('contributeHoldingTreasury chiama CE_money.addebitatoDalServer e non CE_money.spend', async () => {
            const { sandbox, gs } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => ({
                    data: { treasury: 15000, tension: 10 },
                    error: null,
                }),
            });

            let addebitatoCalled = false;
            let spendCalled = false;
            const origAddebitato = sandbox.CE_money.addebitatoDalServer;
            const origSpend = sandbox.CE_money.spend;
            sandbox.CE_money.addebitatoDalServer = (amt, reason) => {
                addebitatoCalled = true;
                return origAddebitato(amt, reason);
            };
            sandbox.CE_money.spend = (amt, reason) => {
                spendCalled = true;
                return origSpend(amt, reason);
            };

            gs.cash = 40000;
            await sandbox.contributeHoldingTreasury('h1', 15000);
            assert.equal(addebitatoCalled, true, 'deve chiamare addebitatoDalServer');
            assert.equal(spendCalled, false, 'non deve chiamare spend');
            assert.equal(gs.cash, 25000);
        });

        test('contributeHoldingTreasury con eco Realtime arrivato prima della fine RPC non provoca doppio addebito né syncCash', async () => {
            let rpcChiamate = 0;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_contribute_holding_treasury: () => {
                    rpcChiamate++;
                    // Eco Realtime: il server ha già scritto 50000 − 20000.
                    gs.cash = 30000;
                    return { data: { treasury: 20000, tension: 15 }, error: null };
                },
            });

            gs.cash = 50000;

            await sandbox.contributeHoldingTreasury('h1', 20000);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcChiamate, 1, 'il contributo deve passare dalla RPC, non da un movimento locale');
            assert.deepEqual(syncedCash, [],
                'con l\'eco già arrivato, rispedire il totale al server conterebbe i soldi due volte');
        });
    });

    describe('listCompanyIPO', () => {
        test('listCompanyIPO addebita 50.000€ tramite addebitatoDalServer senza invocare ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'non deve risincronizzare con syncCash');
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

        test('listCompanyIPO chiama CE_money.addebitatoDalServer e non CE_money.spend', async () => {
            const { sandbox, gs } = setupP2PEnv({
                rpc_list_company_ipo: () => ({
                    data: { id: 'ipo_2', shares_total: 1000, ipo_price: 120 },
                    error: null,
                }),
            });

            let addebitatoCalled = false;
            let spendCalled = false;
            const origAddebitato = sandbox.CE_money.addebitatoDalServer;
            const origSpend = sandbox.CE_money.spend;
            sandbox.CE_money.addebitatoDalServer = (amt, reason) => {
                addebitatoCalled = true;
                return origAddebitato(amt, reason);
            };
            sandbox.CE_money.spend = (amt, reason) => {
                spendCalled = true;
                return origSpend(amt, reason);
            };

            gs.reputation = 4.0;
            gs.cash = 80000;
            await sandbox.listCompanyIPO();
            assert.equal(addebitatoCalled, true, 'deve chiamare addebitatoDalServer');
            assert.equal(spendCalled, false, 'non deve chiamare spend');
            assert.equal(gs.cash, 30000);
        });

        test('listCompanyIPO con eco Realtime arrivato prima della fine RPC non provoca doppio addebito né syncCash', async () => {
            let rpcChiamate = 0;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_list_company_ipo: () => {
                    rpcChiamate++;
                    // Eco Realtime: il server ha già scalato la quota di 50.000€.
                    gs.cash = 70000;
                    return { data: { id: 'ipo_echo', shares_total: 1000, ipo_price: 100 }, error: null };
                },
            });

            gs.reputation = 4.0;
            gs.cash = 120000;

            await sandbox.listCompanyIPO();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcChiamate, 1, 'la quotazione deve passare dalla RPC, non da un movimento locale');
            assert.deepEqual(syncedCash, [],
                'con l\'eco già arrivato, rispedire il totale al server conterebbe i soldi due volte');
        });
    });

    describe('buyCompanyShares & sellCompanyShares', () => {
        test('buyCompanyShares addebita con addebitatoDalServer senza invocare ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_company_shares: () => ({
                    data: { company: 'TestCorp', price: 50, total: 5000 },
                    error: null,
                }),
            });

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 10000;

            await sandbox.buyCompanyShares('s1', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, [], 'non deve risincronizzare con syncCash');
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

        test('buyCompanyShares chiama CE_money.addebitatoDalServer e non CE_money.spend', async () => {
            const { sandbox, gs } = setupP2PEnv({
                rpc_buy_company_shares: () => ({
                    data: { company: 'TestCorp', price: 50, total: 2500 },
                    error: null,
                }),
            });

            let addebitatoCalled = false;
            let spendCalled = false;
            const origAddebitato = sandbox.CE_money.addebitatoDalServer;
            const origSpend = sandbox.CE_money.spend;
            sandbox.CE_money.addebitatoDalServer = (amt, reason) => {
                addebitatoCalled = true;
                return origAddebitato(amt, reason);
            };
            sandbox.CE_money.spend = (amt, reason) => {
                spendCalled = true;
                return origSpend(amt, reason);
            };

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 10000;

            await sandbox.buyCompanyShares('s1', 50);
            assert.equal(addebitatoCalled, true, 'deve chiamare addebitatoDalServer');
            assert.equal(spendCalled, false, 'non deve chiamare spend');
            assert.equal(gs.cash, 7500);
        });

        test('buyCompanyShares con eco Realtime arrivato prima della fine RPC non provoca doppio addebito né syncCash', async () => {
            let rpcChiamate = 0;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_buy_company_shares: () => {
                    rpcChiamate++;
                    // Eco Realtime: il server ha già scalato 15000 − 5000.
                    gs.cash = 10000;
                    return { data: { company: 'TestCorp', price: 50, total: 5000 }, error: null };
                },
            });

            sandbox._p2pMarket.shares = [{ id: 's1', current_price: 50 }];
            gs.cash = 15000;

            await sandbox.buyCompanyShares('s1', 100);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcChiamate, 1, 'l\'acquisto deve passare dalla RPC, non da un movimento locale');
            assert.deepEqual(syncedCash, [],
                'con l\'eco già arrivato, rispedire il totale al server conterebbe i soldi due volte');
        });

        test('sellCompanyShares accredita tramite CE_money.accreditatoDalServer senza invocare ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'non deve risincronizzare con syncCash');
        });

        test('sellCompanyShares chiama CE_money.accreditatoDalServer e non CE_money.earn', async () => {
            const { sandbox, gs } = setupP2PEnv({
                rpc_sell_company_shares: () => ({
                    data: { company: 'TestCorp', total: 3000, qty_sold: 30 },
                    error: null,
                }),
            });

            let accreditatoCalled = false;
            let earnCalled = false;
            const origAccreditato = sandbox.CE_money.accreditatoDalServer;
            const origEarn = sandbox.CE_money.earn;
            sandbox.CE_money.accreditatoDalServer = (amt, reason) => {
                accreditatoCalled = true;
                return origAccreditato(amt, reason);
            };
            sandbox.CE_money.earn = (amt, reason) => {
                earnCalled = true;
                return origEarn(amt, reason);
            };

            gs.cash = 5000;
            await sandbox.sellCompanyShares('s1', 30);
            assert.equal(accreditatoCalled, true, 'deve chiamare accreditatoDalServer');
            assert.equal(earnCalled, false, 'non deve chiamare earn');
            assert.equal(gs.cash, 8000);
        });

        test('sellCompanyShares con eco Realtime arrivato prima della fine RPC non provoca doppio accredito né syncCash', async () => {
            let rpcChiamate = 0;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_sell_company_shares: () => {
                    rpcChiamate++;
                    // Eco Realtime: il server ha già accreditato 5000 + 4000.
                    // Sulle entrate il doppio movimento sono soldi regalati.
                    gs.cash = 9000;
                    return { data: { company: 'TestCorp', total: 4000, qty_sold: 50 }, error: null };
                },
            });

            gs.cash = 5000;

            await sandbox.sellCompanyShares('s1', 50);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcChiamate, 1, 'la vendita deve passare dalla RPC, non da un movimento locale');
            assert.deepEqual(syncedCash, [],
                'con l\'eco già arrivato, rispedire il totale al server conterebbe i soldi due volte');
        });
    });

    describe('_sindacatoGdfDailyCheck', () => {
        test('_sindacatoGdfDailyCheck addebita la multa con addebitatoDalServer senza invocare ServerState.syncCash', async () => {
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
            assert.deepEqual(syncedCash, [], 'non deve risincronizzare con syncCash');
        });

        test('_sindacatoGdfDailyCheck chiama CE_money.addebitatoDalServer e non CE_money.spend', async () => {
            const { sandbox, gs } = setupP2PEnv({
                rpc_gdf_inspection_check: () => ({
                    data: { inspected: true, fine: 2000 },
                    error: null,
                }),
            });

            let addebitatoCalled = false;
            let spendCalled = false;
            const origAddebitato = sandbox.CE_money.addebitatoDalServer;
            const origSpend = sandbox.CE_money.spend;
            sandbox.CE_money.addebitatoDalServer = (amt, reason) => {
                addebitatoCalled = true;
                return origAddebitato(amt, reason);
            };
            sandbox.CE_money.spend = (amt, reason) => {
                spendCalled = true;
                return origSpend(amt, reason);
            };

            gs.cash = 10000;
            await sandbox._sindacatoGdfDailyCheck();
            assert.equal(addebitatoCalled, true, 'deve chiamare addebitatoDalServer');
            assert.equal(spendCalled, false, 'non deve chiamare spend');
            assert.equal(gs.cash, 8000);
        });

        test('_sindacatoGdfDailyCheck con eco Realtime arrivato prima della fine RPC non provoca doppio addebito né syncCash', async () => {
            let rpcChiamate = 0;
            const { sandbox, gs, syncedCash } = setupP2PEnv({
                rpc_gdf_inspection_check: () => {
                    rpcChiamate++;
                    // Eco Realtime: il server ha già scalato la multa (10000 − 3000).
                    gs.cash = 7000;
                    return { data: { inspected: true, fine: 3000 }, error: null };
                },
            });

            gs.cash = 10000;

            await sandbox._sindacatoGdfDailyCheck();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcChiamate, 1, 'l\'ispezione deve passare dalla RPC, non da un movimento locale');
            assert.deepEqual(syncedCash, [],
                'con l\'eco già arrivato, rispedire il totale al server conterebbe i soldi due volte');
        });
    });
});
