'use strict';
/* ============================================================================
   test/funzioni/mercatoP2P.test.js — Mercato P2P fra giocatori

   Verifica del funzionamento della feature "mercatoP2P" (disattivata in config.js).
   Collauda tutte le azioni esposte da p2p-market.js, p2p-render.js e ce-actions.js:
   - Compravendita veicoli P2P (listCarForSale, cancelP2PListing, buyP2PCar)
   - Holdings e Sindacati (createHolding, joinHolding, leaveHolding, contributeHoldingTreasury)
   - Borsa Valori P2P (listCompanyIPO, buyCompanyShares, sellCompanyShares)
   - Consorzi Cooperativi (createConsorzio, joinConsorzio, leaveConsorzio, contributeConsorzio)
   - Ispettorato, Crumiri e Don Carmine (hireCrumiri, payDonCarmine, _sindacatoGdfDailyCheck)
   - Sincronizzazione, Realtime e Fetch (p2pRefreshAll, p2pStartRealtime, p2pInit)
   - Rendering UI e delegation ceAct (renderP2PMarketSection, renderP2PSharesSection,
     renderP2PHoldingsSection, renderBarometroWidget, renderP2PConsorziSection, renderIspettoratoSection)
   - Conflitto e collisione nota tra p2p-market.js ed engine-fleet.js (listCarForSale / cancelListing).
   ============================================================================ */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

function setupP2PTestEnv(options = {}) {
    const { rpcOverrides = {}, tableData = {} } = options;
    const syncedCash = [];
    const rpcCalls = [];

    const env = freshEnv({
        render: true,
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    const sandbox = env.sandbox;
    sandbox.currentUser = { id: 'usr_player_1', email: 'player1@example.com' };
    sandbox.window.currentUser = sandbox.currentUser;

    const makeQueryBuilder = (tableName) => {
        let currentData = tableData[tableName] || [];
        const qb = {
            _data: currentData,
            select: () => qb,
            order: () => qb,
            limit: (n) => {
                qb._limit = n;
                return qb;
            },
            eq: (col, val) => {
                qb._data = qb._data.filter(item => item[col] === val);
                return qb;
            },
            gt: (col, val) => {
                qb._data = qb._data.filter(item => !item[col] || item[col] > val);
                return qb;
            },
            then: (resolve) => resolve({ data: qb._limit ? qb._data.slice(0, qb._limit) : qb._data, error: null }),
        };
        return qb;
    };

    const channels = [];
    sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            rpcCalls.push({ fn, params });
            if (rpcOverrides[fn]) {
                const res = typeof rpcOverrides[fn] === 'function' ? await rpcOverrides[fn](params) : rpcOverrides[fn];
                return res;
            }
            return { data: {}, error: null };
        },
        from: (table) => makeQueryBuilder(table),
        channel: (name) => {
            const ch = {
                name,
                on: (event, filter, callback) => {
                    ch._callback = callback;
                    return ch;
                },
                subscribe: () => {
                    channels.push(ch);
                    return ch;
                },
            };
            return ch;
        },
        removeChannel: (ch) => {
            const idx = channels.indexOf(ch);
            if (idx !== -1) channels.splice(idx, 1);
        },
    };
    sandbox.window.supabaseClient = sandbox.supabaseClient;

    return { env, sandbox, gs: sandbox.gameState, syncedCash, rpcCalls, channels };
}

describe('Funzione mercatoP2P — Mercato fra giocatori, Borsa e Sindacati', () => {
    let ctx;

    beforeEach(() => {
        ctx = setupP2PTestEnv();
    });

    afterEach(() => {
        ctx.env.stopAllIntervals();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. COMPRAVENDITA VEICOLI P2P
    // ─────────────────────────────────────────────────────────────────────────
    describe('Compravendita veicoli P2P (listCarForSale, cancelP2PListing, buyP2PCar)', () => {

        test('listCarForSale blocca la vendita se l utente non e autenticato', async () => {
            ctx.sandbox.currentUser = null;
            ctx.sandbox.window.currentUser = null;

            const car = ctx.gs.fleet[0];
            await ctx.sandbox.listCarForSale(car.id, 25000);

            assert.ok(ctx.gs.fleet.some(c => c.id === car.id), 'l auto non deve essere rimossa dalla flotta');
            assert.equal(ctx.rpcCalls.length, 0);
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('Devi essere loggato')));
        });

        test('listCarForSale rifiuta auto in leasing o edizioni limitate', async () => {
            const leaseCar = { id: 'c_lease', name: 'Auto Lease', tier: 'business', isLease: true };
            const leCar = { id: 'c_le', name: 'Auto LE', tier: 'ultra', isLimitedEdition: true };
            ctx.gs.fleet.push(leaseCar, leCar);

            await ctx.sandbox.listCarForSale('c_lease', 30000);
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('leasing')));

            await ctx.sandbox.listCarForSale('c_le', 50000);
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('limitate')));

            assert.equal(ctx.rpcCalls.length, 0);
        });

        test('listCarForSale rifiuta veicoli con autista impegnato in corsa', async () => {
            const car = ctx.gs.fleet[0];
            const driver = { id: 'drv_1', name: 'Mario', status: 'busy', assignedCarId: car.id };
            ctx.gs.drivers.push(driver);

            await ctx.sandbox.listCarForSale(car.id, 20000);

            assert.ok(ctx.env.notifications.some(n => n.msg.includes('in servizio')));
            assert.equal(ctx.rpcCalls.length, 0);
        });

        test('listCarForSale rimuove l auto dalla flotta e chiama rpc_list_car_for_sale', async () => {
            const car = ctx.gs.fleet[0];
            const driver = { id: 'drv_2', name: 'Luigi', status: 'idle', assignedCarId: car.id };
            ctx.gs.drivers.push(driver);

            await ctx.sandbox.listCarForSale(car.id, 45000);

            assert.ok(!ctx.gs.fleet.some(c => c.id === car.id), 'l auto deve essere rimossa dalla flotta');
            assert.equal(driver.assignedCarId, null, 'l autista deve essere disassegnato');
            assert.equal(ctx.rpcCalls.length, 1);
            assert.equal(ctx.rpcCalls[0].fn, 'rpc_list_car_for_sale');
            assert.equal(ctx.rpcCalls[0].params?.v_ask_price, 45000);
            assert.equal(ctx.rpcCalls[0].params?.v_car_snapshot?.id, car.id);
        });

        test('listCarForSale esegue rollback della flotta se la RPC fallisce', async () => {
            const car = ctx.gs.fleet[0];
            const driver = { id: 'drv_3', name: 'Gianni', status: 'idle', assignedCarId: car.id };
            ctx.gs.drivers.push(driver);

            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_list_car_for_sale: async () => ({ data: null, error: { message: 'Errore DB Supabase' } }),
                },
            });
            ctx.gs.fleet = [car];
            ctx.gs.drivers = [driver];

            await ctx.sandbox.listCarForSale(car.id, 45000);

            assert.ok(ctx.gs.fleet.some(c => c.id === car.id), 'l auto deve essere reinserita in flotta');
            assert.equal(driver.assignedCarId, car.id, 'l autista deve essere riassegnato');
            assert.ok(ctx.env.notifications.some(n => n.type === 'error'));
        });

        test('cancelP2PListing chiama rpc_cancel_listing e reinserisce lo snapshot auto nella flotta', async () => {
            const returnedCar = { id: 'c_orig_123', name: 'Mercedes E-Class', tier: 'business', condition: 95 };
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_cancel_listing: async () => ({ data: returnedCar, error: null }),
                },
            });

            await ctx.sandbox.cancelP2PListing('list_abc');

            assert.equal(ctx.rpcCalls.length, 1);
            assert.equal(ctx.rpcCalls[0].fn, 'rpc_cancel_listing');
            assert.equal(ctx.rpcCalls[0].params?.v_listing_id, 'list_abc');
            assert.ok(ctx.gs.fleet.some(c => c.id === 'c_orig_123'));
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('restituita alla flotta')));
        });

        test('buyP2PCar non permette di comprare la propria stessa inserzione', async () => {
            ctx.sandbox._p2pMarket.listings = [
                { id: 'list_mine', seller_user_id: 'usr_player_1', ask_price: 30000 },
            ];
            ctx.gs.cash = 100000;

            await ctx.sandbox.buyP2PCar('list_mine');

            assert.equal(ctx.rpcCalls.length, 0);
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('stessa auto')));
        });

        test('buyP2PCar compra con successo: spende cassa, genera ID c_p2p_ e aggiunge l auto alla flotta', async () => {
            const remoteCar = {
                name: 'BMW Serie 7',
                tier: 'vip',
                condition: 88,
                fuel: 90,
                mileage: 45000,
                vehicleClass: 'mercedes_s',
            };
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_buy_market_car: async () => ({
                        data: {
                            price_paid: 60000,
                            seller_name: 'Giulia',
                            fee: 3000,
                            car: Object.assign({}, remoteCar),
                        },
                        error: null,
                    }),
                },
            });
            ctx.sandbox._p2pMarket.listings = [
                { id: 'list_other', seller_user_id: 'usr_seller_2', ask_price: 60000 },
            ];
            ctx.gs.cash = 100000;

            await ctx.sandbox.buyP2PCar('list_other');

            assert.equal(ctx.gs.cash, 40000, 'il denaro deve essere scalato');
            assert.deepEqual(ctx.syncedCash, [40000], 'il saldo deve essere sincronizzato col server');
            const boughtCar = ctx.gs.fleet.find(c => c.name === 'BMW Serie 7');
            assert.ok(boughtCar, 'l auto comprata deve entrare nella flotta locale');
            assert.ok(boughtCar.id.startsWith('c_p2p_'), 'l ID locale deve avere prefisso c_p2p_');
            assert.equal(boughtCar.tier, 'vip');
            assert.equal(boughtCar.condition, 88);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. HOLDINGS / SINDACATI (createHolding, joinHolding, leaveHolding, contributeHoldingTreasury)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Holdings e Sindacati P2P', () => {

        test('createHolding invoca rpc_create_holding con nome e descrizione', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_create_holding: async (p) => ({ data: { id: 'h_new', name: p.v_name }, error: null }),
                },
            });

            await ctx.sandbox.createHolding('Sindacato Autisti Roma', 'Gilda cooperativa');

            assert.equal(ctx.rpcCalls.length, 1);
            assert.equal(ctx.rpcCalls[0].fn, 'rpc_create_holding');
            assert.equal(ctx.rpcCalls[0].params?.v_name, 'Sindacato Autisti Roma');
            assert.equal(ctx.rpcCalls[0].params?.v_description, 'Gilda cooperativa');
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('creata')));
        });

        test('joinHolding e leaveHolding invocano le rispettive RPC Supabase', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_join_holding: async () => ({ data: { success: true }, error: null }),
                    rpc_leave_holding: async () => ({ data: { success: true }, error: null }),
                },
            });

            await ctx.sandbox.joinHolding('h_123');
            assert.equal(ctx.rpcCalls[0].fn, 'rpc_join_holding');
            assert.equal(ctx.rpcCalls[0].params?.v_holding_id, 'h_123');

            await ctx.sandbox.leaveHolding('h_123');
            assert.equal(ctx.rpcCalls[1].fn, 'rpc_leave_holding');
            assert.equal(ctx.rpcCalls[1].params?.v_holding_id, 'h_123');
        });

        test('contributeHoldingTreasury deduce cassa, chiama RPC e aggiorna barometro tensione', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_contribute_holding_treasury: async () => ({
                        data: { treasury: 50000, tension: 25 },
                        error: null,
                    }),
                },
            });
            ctx.gs.cash = 70000;

            await ctx.sandbox.contributeHoldingTreasury('h_1', 20000);

            assert.equal(ctx.gs.cash, 50000);
            assert.deepEqual(ctx.syncedCash, [50000]);
            assert.equal(ctx.sandbox._sindacatoState.tension, 25);
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('Barometro −2 pt')));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. BORSA VALORI P2P (listCompanyIPO, buyCompanyShares, sellCompanyShares)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Borsa Valori P2P (IPO e Azioni di aziende reali)', () => {

        test('listCompanyIPO blocca con reputazione inferiore a 3.5 stelle o fondi < 50k', async () => {
            ctx.gs.reputation = 3.2;
            ctx.gs.cash = 100000;
            await ctx.sandbox.listCompanyIPO();
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('Reputazione insufficiente')));

            ctx.gs.reputation = 4.0;
            ctx.gs.cash = 40000;
            await ctx.sandbox.listCompanyIPO();
            assert.ok(ctx.env.notifications.some(n => n.msg.includes('Fondi insufficienti')));

            assert.equal(ctx.rpcCalls.length, 0);
        });

        test('listCompanyIPO quota con successo, scala €50k e imposta gameState.companyIPO', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_list_company_ipo: async (p) => ({
                        data: { id: 'ipo_real_1', shares_total: p.v_shares_total, ipo_price: p.v_ipo_price },
                        error: null,
                    }),
                },
            });
            ctx.gs.reputation = 4.2;
            ctx.gs.cash = 80000;
            ctx.gs.day = 12;

            await ctx.sandbox.listCompanyIPO();

            assert.equal(ctx.gs.cash, 30000);
            assert.deepEqual(ctx.syncedCash, [30000]);
            assert.equal(ctx.gs.companyIPO.listed, true);
            assert.equal(ctx.gs.companyIPO.listedDay, 12);
            assert.equal(ctx.gs.companyIPO.supabaseId, 'ipo_real_1');
            assert.equal(ctx.gs.companyIPO.sharesTotal, 1000);
            assert.equal(ctx.gs.companyIPO.sharePrice, 80); // Math.round(80000 / 1000)
        });

        test('buyCompanyShares e sellCompanyShares comprano e vendono quote azionarie', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_buy_company_shares: async () => ({
                        data: { company: 'Roma Luxury NCC', price: 120 },
                        error: null,
                    }),
                    rpc_sell_company_shares: async () => ({
                        data: { company: 'Roma Luxury NCC', qty_sold: 10, total: 1200 },
                        error: null,
                    }),
                },
            });
            ctx.sandbox._p2pMarket.shares = [
                { id: 'sh_roma', current_price: 120, company_name: 'Roma Luxury NCC' },
            ];
            ctx.gs.cash = 5000;

            // Compra 10 azioni a 120€ = 1200€
            await ctx.sandbox.buyCompanyShares('sh_roma', 10);
            assert.equal(ctx.gs.cash, 3800);
            assert.deepEqual(ctx.syncedCash, [3800]);

            // Vende 10 azioni a 1200€
            await ctx.sandbox.sellCompanyShares('sh_roma', 10);
            assert.equal(ctx.gs.cash, 5000);
            assert.deepEqual(ctx.syncedCash, [3800, 5000]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CONSORZI, CRUMIRI, DON CARMINE E GDF
    // ─────────────────────────────────────────────────────────────────────────
    describe('Consorzi cooperativi, Ispettorato, Crumiri e Don Carmine', () => {

        test('createConsorzio, joinConsorzio e leaveConsorzio invocano le RPC relative', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_create_consorzio: async (p) => ({ data: { id: 'cso_1', name: p.v_name }, error: null }),
                    rpc_join_consorzio: async () => ({ data: { success: true }, error: null }),
                    rpc_leave_consorzio: async () => ({ data: { success: true }, error: null }),
                },
            });

            await ctx.sandbox.createConsorzio('Consorzio Tassisti Uniti', 'Sconti carburante');
            assert.equal(ctx.rpcCalls[0].fn, 'rpc_create_consorzio');

            await ctx.sandbox.joinConsorzio('cso_1');
            assert.equal(ctx.rpcCalls[1].fn, 'rpc_join_consorzio');

            await ctx.sandbox.leaveConsorzio('cso_1');
            assert.equal(ctx.rpcCalls[2].fn, 'rpc_leave_consorzio');
        });

        test('hireCrumiri aumenta il rischio GdF e attiva il bonus crumiriBoostUntil', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_hire_crumiri: async () => ({
                        data: { risk_level: 45, crumiri_boost_until: '2026-09-02T12:00:00Z' },
                        error: null,
                    }),
                },
            });

            await ctx.sandbox.hireCrumiri();

            assert.equal(ctx.rpcCalls[0].fn, 'rpc_hire_crumiri');
            assert.equal(ctx.sandbox._sindacatoState.gdfRisk, 45);
            assert.equal(ctx.sandbox._sindacatoState.crumiriBoostUntil, '2026-09-02T12:00:00Z');
        });

        test('_sindacatoGdfDailyCheck applica la multa e riduce il rischio GdF di 30 punti', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_gdf_inspection_check: async () => ({
                        data: { inspected: true, fine: 15000 },
                        error: null,
                    }),
                },
            });
            ctx.gs.cash = 40000;
            ctx.sandbox._sindacatoState.gdfRisk = 75;

            await ctx.sandbox._sindacatoGdfDailyCheck();

            assert.equal(ctx.gs.cash, 25000, 'la multa di 15000€ deve essere pagata');
            assert.deepEqual(ctx.syncedCash, [25000]);
            assert.equal(ctx.sandbox._sindacatoState.gdfRisk, 45, 'rischio ridotto da 75 a 45');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. FETCH E REALTIME SUBSCRIPTIONS
    // ─────────────────────────────────────────────────────────────────────────
    describe('Fetch dati, Realtime e p2pRefreshAll', () => {

        test('p2pRefreshAll interroga listings, shares, holdings, consorzi, tension e gdfRisk', async () => {
            ctx = setupP2PTestEnv({
                tableData: {
                    market_listings: [{ id: 'l1', ask_price: 20000 }],
                    company_shares: [{ id: 's1', company_name: 'Corp' }],
                    holdings: [{ id: 'h1', name: 'Holding 1' }],
                    holding_members: [{ holding_id: 'h1', user_id: 'usr_player_1', role: 'leader' }],
                    consorzi: [{ id: 'c1', name: 'Consorzio 1' }],
                    consorzio_members: [{ consorzio_id: 'c1', user_id: 'usr_player_1', role: 'member' }],
                },
                rpcOverrides: {
                    rpc_tick_tension: async () => ({
                        data: { tension: 40, strike_active: false, strike_ends_at: null },
                        error: null,
                    }),
                    rpc_get_gdf_risk: async () => ({
                        data: { risk_level: 20, crumiri_boost_until: null, carmine_immunity_until: null },
                        error: null,
                    }),
                },
            });

            await ctx.sandbox.p2pRefreshAll();

            assert.equal(ctx.sandbox._p2pMarket.listings.length, 1);
            assert.equal(ctx.sandbox._p2pMarket.shares.length, 1);
            assert.equal(ctx.sandbox._p2pMarket.holdings.length, 1);
            assert.equal(ctx.sandbox._p2pMarket.myHolding?.id, 'h1');
            assert.equal(ctx.sandbox._p2pMarket.consorzi.length, 1);
            assert.equal(ctx.sandbox._p2pMarket.myConsorzio?.id, 'c1');
            assert.equal(ctx.sandbox._sindacatoState.tension, 40);
            assert.equal(ctx.sandbox._sindacatoState.gdfRisk, 20);
        });

        test('p2pStartRealtime attiva 4 canali Realtime su Supabase', () => {
            ctx.sandbox.p2pStartRealtime();

            assert.equal(ctx.sandbox._p2pMarket._subs.length, 4);
            assert.equal(ctx.channels.length, 4);
            const channelNames = ctx.channels.map(c => c.name);
            assert.ok(channelNames.includes('public:market_listings'));
            assert.ok(channelNames.includes('public:company_shares'));
            assert.ok(channelNames.includes('public:holding_members'));
            assert.ok(channelNames.includes('public:consorzio_members'));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. RENDERING SEZIONI UI E AZIONI DELEGATE (ceAct)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Rendering UI P2P e gestione delegata ceAct', () => {

        test('renderP2PMarketSection genera markup con buyP2PCar e cancelP2PListing', () => {
            ctx.sandbox._p2pMarket.listings = [
                {
                    id: 'list_other',
                    seller_user_id: 'usr_other',
                    seller_name: 'Luigi',
                    ask_price: 35000,
                    car_snapshot: { name: 'Maserati Ghibli', condition: 90, mileage: 20000 },
                },
                {
                    id: 'list_mine',
                    seller_user_id: 'usr_player_1',
                    seller_name: 'Me',
                    ask_price: 42000,
                    car_snapshot: { name: 'Mercedes S-Class', condition: 99 },
                },
            ];
            ctx.gs.cash = 50000;

            const html = ctx.sandbox.renderP2PMarketSection();

            assert.ok(html.includes('Mercato P2P Reale'));
            assert.ok(html.includes('Maserati Ghibli'));
            assert.ok(html.includes('data-ce-act="buyP2PCar"'));
            assert.ok(html.includes('data-ce-act="cancelP2PListing"'));
        });

        test('renderP2PSharesSection genera markup con buyCompanyShares e sellCompanyShares', () => {
            ctx.sandbox._p2pMarket.shares = [
                {
                    id: 'sh_test',
                    company_name: 'Apex Chauffeur',
                    issuer_user_id: 'usr_other',
                    current_price: 55,
                    ipo_price: 50,
                    shares_available: 500,
                    shares_total: 1000,
                },
            ];
            ctx.sandbox._p2pMarket.myShareHoldings = [
                { listing_id: 'sh_test', shares_owned: 20 },
            ];

            const html = ctx.sandbox.renderP2PSharesSection();

            assert.ok(html.includes('Apex Chauffeur'));
            assert.ok(html.includes('data-ce-act="buyCompanyShares"'));
            assert.ok(html.includes('data-ce-act="sellCompanyShares"'));
        });

        test('renderBarometroWidget e renderIspettoratoSection mostrano livelli di allerta e bottoni don carmine/crumiri', () => {
            ctx.sandbox._sindacatoState.tension = 85;
            ctx.sandbox._sindacatoState.strikeActive = true;
            ctx.sandbox._sindacatoState.gdfRisk = 75;
            ctx.gs.cash = 100000;

            const barometroHtml = ctx.sandbox.renderBarometroWidget();
            const ispettoratoHtml = ctx.sandbox.renderIspettoratoSection();

            assert.ok(barometroHtml.includes('Barometro della Collera'));
            assert.ok(barometroHtml.includes('SCIOPERO NAZIONALE'));
            assert.ok(ispettoratoHtml.includes('Rischio GdF'));
            assert.ok(ispettoratoHtml.includes('data-ce-act="payDonCarmine"'));
            assert.ok(ispettoratoHtml.includes('data-ce-act="hireCrumiri"'));
        });

        test('ce-actions (ceHoldingContribute, ceCreateHolding, ceConsorzioContribute, ceCreateConsorzio) leggono i campi input del DOM', async () => {
            ctx = setupP2PTestEnv({
                rpcOverrides: {
                    rpc_create_holding: async (p) => ({ data: { id: 'h_dom', name: p.v_name }, error: null }),
                    rpc_contribute_holding_treasury: async () => ({ data: { treasury: 10000, tension: 10 }, error: null }),
                    rpc_create_consorzio: async (p) => ({ data: { id: 'c_dom', name: p.v_name }, error: null }),
                    rpc_contribute_consorzio: async () => ({ data: { treasury: 5000 }, error: null }),
                },
            });
            ctx.gs.cash = 100000;

            // Prepara gli input nel DOM del sandbox
            const doc = ctx.sandbox.document;
            const inputHldName = doc.createElement('input'); inputHldName.id = 'hld-name'; inputHldName.value = 'Sindacato DOM';
            const inputHldDesc = doc.createElement('input'); inputHldDesc.id = 'hld-desc'; inputHldDesc.value = 'Desc DOM';
            const inputHldAmt = doc.createElement('input'); inputHldAmt.id = 'hld-contrib-amt'; inputHldAmt.value = '15000';

            const inputCsoName = doc.createElement('input'); inputCsoName.id = 'cso-name'; inputCsoName.value = 'Consorzio DOM';
            const inputCsoDesc = doc.createElement('input'); inputCsoDesc.id = 'cso-desc'; inputCsoDesc.value = 'Desc Cso';
            const inputCsoAmt = doc.createElement('input'); inputCsoAmt.id = 'cso-contrib-amt'; inputCsoAmt.value = '8000';

            doc.body.appendChild(inputHldName);
            doc.body.appendChild(inputHldDesc);
            doc.body.appendChild(inputHldAmt);
            doc.body.appendChild(inputCsoName);
            doc.body.appendChild(inputCsoDesc);
            doc.body.appendChild(inputCsoAmt);

            // Esegui le funzioni ceAct da ce-actions.js
            ctx.sandbox.ceCreateHolding();
            ctx.sandbox.ceHoldingContribute('h_dom');
            ctx.sandbox.ceCreateConsorzio();
            ctx.sandbox.ceConsorzioContribute('c_dom');

            // Attendi il completamento delle Promise async
            await new Promise(r => setTimeout(r, 10));

            const calledFns = ctx.rpcCalls.map(c => c.fn);
            assert.ok(calledFns.includes('rpc_create_holding'));
            assert.ok(calledFns.includes('rpc_contribute_holding_treasury'));
            assert.ok(calledFns.includes('rpc_create_consorzio'));
            assert.ok(calledFns.includes('rpc_contribute_consorzio'));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. DIAGNOSI DOPPIONE: p2p-market.js SOVRASCRIVE engine-fleet.js (listCarForSale / cancelListing)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Diagnosi architetturale: collisione listCarForSale vs cancelListing', () => {

        test('listCarForSale in p2p-market.js sovrascrive quella di engine-fleet.js e NON scrive in gameState.marketplace', async () => {
            const car = ctx.gs.fleet[0];
            ctx.gs.marketplace = [];

            // Chiamando listCarForSale vince la definizione asincrona di p2p-market.js
            await ctx.sandbox.listCarForSale(car.id, 30000);

            // engine-fleet.js avrebbe popolato gameState.marketplace = [{ carId, askPrice, ... }]
            // mentre p2p-market.js rimuove l'auto da fleet e chiama Supabase rpc_list_car_for_sale
            assert.equal(ctx.gs.marketplace.length, 0, 'gameState.marketplace resta vuoto perché la funzione p2p ha vinto');
            assert.equal(ctx.rpcCalls[0].fn, 'rpc_list_car_for_sale');
        });

        test('cancelListing opera solo su gameState.marketplace e NON tocca il backend P2P', () => {
            ctx.gs.marketplace = [{ id: 'm_123', carId: 'c1', askPrice: 20000 }];

            ctx.sandbox.cancelListing('m_123');

            assert.equal(ctx.gs.marketplace.length, 0);
            assert.equal(ctx.rpcCalls.length, 0, 'cancelListing locale non comunica con Supabase');
        });
    });
});
