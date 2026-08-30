'use strict';
/* ============================================================================
   test/funzioni/mercatoP2P.test.js — Mercato P2P, Borsa Valori, Sindacati e Consorzi

   Verifica completa delle funzioni di mercatoP2P (p2p-market.js e p2p-render.js).
   Collauda:
   - Mercato compravendita auto tra giocatori (p2pListCarForSale, cancelP2PListing, buyP2PCar)
   - Separazione tra listCarForSale (NPC engine-fleet) e p2pListCarForSale (P2P)
   - Sindacati e Holdings (createHolding, joinHolding, leaveHolding, contributeHoldingTreasury)
   - Borsa Valori P2P (listCompanyIPO, buyCompanyShares, sellCompanyShares)
   - Consorzi Cooperativi (createConsorzio, joinConsorzio, leaveConsorzio, contributeConsorzio)
   - Ispettorato del Lavoro e Don Carmine (hireCrumiri, payDonCarmine, _sindacatoGdfDailyCheck)
   - Fetching e polling dati server (p2pFetchMarket, p2pFetchShares, p2pFetchHoldings,
     p2pFetchConsorzi, p2pFetchTension, p2pFetchGdfRisk, p2pRefreshAll, p2pInit)
   - Realtime Subscriptions (p2pStartRealtime)
   - Funzioni di Rendering UI (renderP2PMarketSection, renderP2PSharesSection,
     renderP2PHoldingsSection, renderBarometroWidget, renderP2PConsorziSection, renderIspettoratoSection)
   - Azioni intermediate da ce-actions.js (ceHoldingContribute, ceCreateHolding,
     ceConsorzioContribute, ceCreateConsorzio, ceListCar)
   ============================================================================ */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione mercatoP2P — Mercato Giocatori, Sindacati, Consorzi e Borsa', () => {
    let env, sandbox, gs;
    let syncedCashCalls;
    /* Il prezzo che il SERVER applica. Di norma coincide con quello in cache;
       un test lo fa divergere apposta, perche' e' esattamente quello che
       succede nel gioco quando qualcun altro compra un istante prima. */
    let supabaseMockPrezzoAzione;
    let supabaseRpcCalls;
    let realtimeChannels;

    function setupSupabaseMock(rpcHandlers = {}) {
        supabaseRpcCalls = [];
        realtimeChannels = [];

        const mockClient = {
            channel: (channelName) => {
                const chan = {
                    name: channelName,
                    _handlers: [],
                    on: (event, filter, callback) => {
                        chan._handlers.push({ event, filter, callback });
                        return chan;
                    },
                    subscribe: () => chan,
                };
                realtimeChannels.push(chan);
                return chan;
            },
            removeChannel: (_chan) => {},
            from: (table) => {
                const chain = {
                    _table: table,
                    select: (_cols) => chain,
                    order: (_col, _opts) => chain,
                    gt: (_col, _val) => chain,
                    or: (_filtro) => chain,
                    eq: (_col, _val) => chain,
                    limit: (_lim) => chain,
                    upsert: async () => ({ error: null }),
                    maybeSingle: async () => ({ data: null, error: null }),
                    then: (resolve, reject) => {
                        let res = { data: [], error: null };
                        if (table === 'market_listings') {
                            res = {
                                data: [
                                    {
                                        id: 'lst_101',
                                        seller_user_id: 'other_player',
                                        seller_name: 'GiocatoreDue',
                                        ask_price: 35000,
                                        car_snapshot: {
                                            id: 'car_snap_1',
                                            name: 'Mercedes-Benz Classe E',
                                            tier: 'business',
                                            condition: 88,
                                            mileage: 45000,
                                        },
                                        listed_at: new Date().toISOString(),
                                        expires_at: new Date(Date.now() + 86400000).toISOString(),
                                    },
                                ],
                                error: null,
                            };
                        } else if (table === 'company_shares') {
                            res = {
                                data: [
                                    {
                                        id: 'share_101',
                                        issuer_user_id: 'other_player',
                                        company_name: 'Apex Mobility',
                                        ipo_price: 50,
                                        current_price: 65,
                                        shares_total: 1000,
                                        shares_available: 400,
                                    },
                                ],
                                error: null,
                            };
                        } else if (table === 'share_holdings') {
                            res = {
                                data: [
                                    {
                                        id: 'sh_hld_1',
                                        owner_user_id: 'player_me',
                                        listing_id: 'share_101',
                                        shares_owned: 50,
                                    },
                                ],
                                error: null,
                            };
                        } else if (table === 'holdings') {
                            res = {
                                data: [
                                    {
                                        id: 'hld_101',
                                        name: 'Sindacato Autisti Uniti',
                                        description: 'Uniti per la tutela dei redditi',
                                        treasury: 150000,
                                        max_members: 10,
                                    },
                                ],
                                error: null,
                            };
                        } else if (table === 'holding_members') {
                            res = {
                                data: [
                                    {
                                        holding_id: 'hld_101',
                                        user_id: 'player_me',
                                        company_name: 'Mia Azienda NCC',
                                        role: 'leader',
                                    },
                                ],
                                error: null,
                            };
                        } else if (table === 'consorzi') {
                            res = {
                                data: [
                                    {
                                        id: 'cso_101',
                                        name: 'Consorzio Nazionale Flotte',
                                        description: 'Cooperativa acquisti e carburante',
                                        treasury: 80000,
                                        max_members: 8,
                                    },
                                ],
                                error: null,
                            };
                        } else if (table === 'consorzio_members') {
                            res = {
                                data: [
                                    {
                                        consorzio_id: 'cso_101',
                                        user_id: 'player_me',
                                        company_name: 'Mia Azienda NCC',
                                        role: 'leader',
                                    },
                                    {
                                        consorzio_id: 'cso_101',
                                        user_id: 'other_p2',
                                        company_name: 'Partner Due',
                                        role: 'member',
                                    },
                                    {
                                        consorzio_id: 'cso_101',
                                        user_id: 'other_p3',
                                        company_name: 'Partner Tre',
                                        role: 'member',
                                    },
                                ],
                                error: null,
                            };
                        }
                        return Promise.resolve(res).then(resolve, reject);
                    },
                };
                return chain;
            },
            rpc: async (name, params) => {
                supabaseRpcCalls.push({ name, params });
                if (rpcHandlers[name]) {
                    return rpcHandlers[name](params);
                }
                if (name === 'rpc_list_car_for_sale') {
                    return { data: { id: 'lst_new_1', success: true }, error: null };
                }
                if (name === 'rpc_cancel_listing') {
                    return {
                        data: {
                            id: 'car_returned_1',
                            name: 'Mercedes-Benz Classe E',
                            tier: 'business',
                            condition: 90,
                            fuel: 80,
                            mileage: 10000,
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_buy_market_car') {
                    return {
                        data: {
                            price_paid: params?.v_ask_price || 35000,
                            seller_name: 'GiocatoreDue',
                            fee: 1750,
                            car: {
                                id: 'car_bought_tmp',
                                name: 'Mercedes-Benz Classe E',
                                tier: 'business',
                                condition: 88,
                                mileage: 45000,
                            },
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_create_holding') {
                    return { data: { id: 'hld_new_1', name: params?.v_name || 'Nuova Holding' }, error: null };
                }
                if (name === 'rpc_join_holding' || name === 'rpc_leave_holding') {
                    return { data: { success: true }, error: null };
                }
                if (name === 'rpc_contribute_holding_treasury') {
                    return { data: { treasury: 160000, tension: 25 }, error: null };
                }
                if (name === 'rpc_list_company_ipo') {
                    return {
                        data: {
                            id: 'ipo_new_1',
                            shares_total: params?.v_shares_total || 1000,
                            ipo_price: params?.v_ipo_price || 100,
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_buy_company_shares') {
                    /* La RPC vera (08_mmo_p2p_marketplace.sql:613) blocca la riga
                       `FOR UPDATE`, rilegge il prezzo AGGIORNATO e restituisce
                       qty/price/total/company. Il finto server restituiva solo
                       company e price, e quel buco nascondeva un bug vero: il
                       client si addebitava il prezzo che aveva in cache invece
                       di quello che il server aveva davvero preso. */
                    const prezzoServer = supabaseMockPrezzoAzione;
                    const qty = params?.v_qty ?? 0;
                    return {
                        data: {
                            company: 'Apex Mobility',
                            qty,
                            price: prezzoServer,
                            total: prezzoServer * qty,
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_sell_company_shares') {
                    return { data: { company: 'Apex Mobility', total: 650, qty_sold: 10 }, error: null };
                }
                if (name === 'rpc_create_consorzio') {
                    return { data: { id: 'cso_new_1', name: params?.v_name || 'Nuovo Consorzio' }, error: null };
                }
                if (name === 'rpc_join_consorzio' || name === 'rpc_leave_consorzio') {
                    return { data: { success: true }, error: null };
                }
                if (name === 'rpc_contribute_consorzio') {
                    return { data: { success: true }, error: null };
                }
                if (name === 'rpc_hire_crumiri') {
                    return {
                        data: {
                            risk_level: 45,
                            crumiri_boost_until: new Date(Date.now() + 48 * 3600000).toISOString(),
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_pay_don_carmine') {
                    return {
                        data: {
                            immunity_until: new Date(Date.now() + 24 * 3600000).toISOString(),
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_tick_tension') {
                    return {
                        data: {
                            tension: 30,
                            strike_active: false,
                            strike_ends_at: null,
                            strike_started: false,
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_get_gdf_risk') {
                    return {
                        data: {
                            risk_level: 20,
                            crumiri_boost_until: null,
                            carmine_immunity_until: null,
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_gdf_inspection_check') {
                    return {
                        data: {
                            inspected: false,
                            fine: 0,
                        },
                        error: null,
                    };
                }
                return { data: {}, error: null };
            },
        };

        sandbox.supabaseClient = mockClient;
        sandbox.window.supabaseClient = mockClient;
        sandbox.currentUser = { id: 'player_me' };
        sandbox.window.currentUser = sandbox.currentUser;
    }

    beforeEach(() => {
        syncedCashCalls = [];
        supabaseMockPrezzoAzione = 65;
        env = freshEnv({
            render: true,
            serverState: {
                syncCash: async (v) => {
                    syncedCashCalls.push(v);
                    return { success: true, cash: v };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;

        // Assicura la presenza del container principale per i render UI
        const tabContainer = sandbox.document.createElement('div');
        tabContainer.id = 'tab-container';
        sandbox.document.body.appendChild(tabContainer);

        setupSupabaseMock();
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. MERCATO P2P VEICOLI (p2pListCarForSale, cancelP2PListing, buyP2PCar)
    // ────────────────────────────────────────────────────────────────────────
    describe('Mercato P2P Veicoli — compravendita tra giocatori', () => {

        test('p2pListCarForSale rifiuta se l utente non è autenticato', async () => {
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            const car = gs.fleet[0];
            await sandbox.p2pListCarForSale(car.id, 25000);

            assert.equal(supabaseRpcCalls.length, 0, 'non deve invocare RPC se non loggato');
            assert.ok(env.notifications.some(n => n.msg.includes('loggato')));
        });

        test('p2pListCarForSale non esegue nulla se l auto non esiste in flotta', async () => {
            await sandbox.p2pListCarForSale('auto_inesistente_999', 25000);
            assert.equal(supabaseRpcCalls.length, 0);
        });

        test('p2pListCarForSale blocca la vendita di auto in edizione limitata o in leasing', async () => {
            gs.fleet.push({ id: 'c_ltd', name: 'Ferrari Limited', isLimitedEdition: true });
            gs.fleet.push({ id: 'c_lease', name: 'Audi Lease', isLease: true });

            await sandbox.p2pListCarForSale('c_ltd', 50000);
            assert.ok(env.notifications.some(n => n.msg.includes('limitate non si vendono')));

            await sandbox.p2pListCarForSale('c_lease', 30000);
            assert.ok(env.notifications.some(n => n.msg.includes('leasing non si vendono')));

            assert.equal(supabaseRpcCalls.length, 0);
        });

        test('p2pListCarForSale blocca la vendita se l autista assegnato è occupato', async () => {
            const car = gs.fleet[0];
            gs.drivers.push({ id: 'drv_1', name: 'Mario', assignedCarId: car.id, status: 'busy' });

            await sandbox.p2pListCarForSale(car.id, 25000);

            assert.ok(env.notifications.some(n => n.msg.includes('Autista in servizio')));
            assert.equal(supabaseRpcCalls.length, 0);
        });

        test('p2pListCarForSale rimuove l auto dalla flotta e chiama rpc_list_car_for_sale con snapshot e prezzo', async () => {
            const car = gs.fleet[0];
            const carId = car.id;
            gs.drivers.push({ id: 'drv_2', name: 'Luigi', assignedCarId: carId, status: 'idle' });

            /* Prezzo derivato dalla forbice (30/08): dal momento in cui il
               venditore sceglie il prezzo, p2pListCarForSale rifiuta quello
               fuori mercato. Si legge la stima invece di scrivere una cifra,
               cosi' il test non si rompe se la banda cambia. */
            const stima = sandbox.window._valoreStimatoAuto(car);
            await sandbox.p2pListCarForSale(carId, stima + 0.6);

            // Verifica chiamata RPC
            assert.equal(supabaseRpcCalls.length, 1);
            assert.equal(supabaseRpcCalls[0].name, 'rpc_list_car_for_sale');
            assert.equal(supabaseRpcCalls[0].params.v_ask_price, stima + 1, 'il prezzo va arrotondato');
            assert.equal(supabaseRpcCalls[0].params.v_car_snapshot.id, carId);

            // Verifica stato locale
            assert.ok(!gs.fleet.some(c => c.id === carId), 'auto deve essere rimossa dalla flotta');
            const driver = gs.drivers.find(d => d.id === 'drv_2');
            assert.equal(driver.assignedCarId, null, 'autista deve essere disassegnato');
            assert.ok(env.notifications.some(n => n.msg.includes('in vendita! (mercato P2P)')));
        });

        test('p2pListCarForSale esegue rollback locale se la RPC restituisce errore', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_list_car_for_sale') {
                    return { data: null, error: { message: 'Errore DB simulato' } };
                }
                return { data: {}, error: null };
            };

            const car = gs.fleet[0];
            const carId = car.id;
            gs.drivers.push({ id: 'drv_3', name: 'Paolo', assignedCarId: carId, status: 'idle' });

            await sandbox.p2pListCarForSale(carId, sandbox.window._valoreStimatoAuto(car));

            // Auto e autista devono essere stati ripristinati
            assert.ok(gs.fleet.some(c => c.id === carId), 'auto deve tornare in flotta');
            const driver = gs.drivers.find(d => d.id === 'drv_3');
            assert.equal(driver.assignedCarId, carId, 'autista deve riavere l auto assegnata');
            assert.ok(env.notifications.some(n => n.msg.includes('Errore')));
        });

        test('cancelP2PListing chiama rpc_cancel_listing e ripristina lo snapshot auto nella flotta', async () => {
            const initialFleetCount = gs.fleet.length;

            await sandbox.cancelP2PListing('lst_999');

            assert.equal(supabaseRpcCalls.length, 1);
            assert.equal(supabaseRpcCalls[0].name, 'rpc_cancel_listing');
            assert.equal(supabaseRpcCalls[0].params.v_listing_id, 'lst_999');

            assert.equal(gs.fleet.length, initialFleetCount + 1, 'l auto deve essere reinserita in flotta');
            assert.equal(gs.fleet[gs.fleet.length - 1].id, 'car_returned_1');
            assert.ok(env.notifications.some(n => n.msg.includes('Inserzione ritirata')));
        });

        test('cancelP2PListing con errore RPC notifica l errore e non modifica la flotta', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_cancel_listing') {
                    return { data: null, error: { message: 'Listing non cancellabile' } };
                }
                return { data: {}, error: null };
            };

            const initialFleetCount = gs.fleet.length;
            await sandbox.cancelP2PListing('lst_err');

            assert.equal(gs.fleet.length, initialFleetCount);
            assert.ok(env.notifications.some(n => n.msg.includes('Errore')));
        });

        test('buyP2PCar verifica esistenza, proprietario e fondi prima dell acquisto', async () => {
            sandbox._p2pMarket.listings = [
                { id: 'lst_mine', seller_user_id: 'player_me', ask_price: 20000 },
                { id: 'lst_expensive', seller_user_id: 'other_player', ask_price: 100000 },
            ];
            gs.cash = 30000;

            // Inserzione inesistente
            await sandbox.buyP2PCar('lst_missing');
            assert.ok(env.notifications.some(n => n.msg.includes('non trovata')));

            // Propria auto
            await sandbox.buyP2PCar('lst_mine');
            assert.ok(env.notifications.some(n => n.msg.includes('la tua stessa auto')));

            // Fondi insufficienti
            await sandbox.buyP2PCar('lst_expensive');
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti')));

            assert.equal(supabaseRpcCalls.length, 0, 'nessuna RPC deve essere invocata per controlli falliti');
        });

        test('buyP2PCar acquista con successo, spende via CE_money e genera un nuovo ID auto prefissato c_p2p_', async () => {
            sandbox._p2pMarket.listings = [
                { id: 'lst_ok', seller_user_id: 'other_player', ask_price: 35000 },
            ];
            gs.cash = 50000;

            await sandbox.buyP2PCar('lst_ok');

            assert.equal(gs.cash, 15000, 'il denaro speso deve essere scalato');
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare con syncCash');

            const purchasedCar = gs.fleet.find(c => c.name === 'Mercedes-Benz Classe E');
            assert.ok(purchasedCar, 'l auto deve essere presente in gameState.fleet');
            assert.ok(purchasedCar.id.startsWith('c_p2p_'), 'ID locale deve avere prefisso c_p2p_');
            assert.ok(env.notifications.some(n => n.msg.includes('acquistata!')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. SEPARAZIONE DEI MERCATI (ENGINE-FLEET.JS VS P2P-MARKET.JS)
    // ────────────────────────────────────────────────────────────────────────
    describe('Analisi architetturale: separazione listCarForSale vs p2pListCarForSale', () => {
        test('listCarForSale scrive in gameState.marketplace e cancelListing rimuove l annuncio', async () => {
            gs.marketplace = [];
            const car = gs.fleet[0];

            // Invocando listCarForSale (NPC), inserisce in gameState.marketplace
            sandbox.listCarForSale(car.id, 20000);

            assert.equal(gs.marketplace.length, 1, 'gameState.marketplace contiene l annuncio per il mercato NPC');
            assert.equal(gs.marketplace[0].carId, car.id);
            assert.equal(gs.marketplace[0].askPrice, 20000);

            // cancelListing di engine-fleet trova e rimuove l annuncio da gameState.marketplace
            const listingId = gs.marketplace[0].id;
            sandbox.cancelListing(listingId);
            assert.equal(gs.marketplace.length, 0, 'cancelListing rimuove l annuncio da gameState.marketplace');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. SINDACATI E HOLDINGS P2P (createHolding, joinHolding, leaveHolding, contributeHoldingTreasury)
    // ────────────────────────────────────────────────────────────────────────
    describe('Sindacati e Holdings P2P', () => {

        test('createHolding richiede login e invoca rpc_create_holding con nome e descrizione', async () => {
            await sandbox.createHolding('Sindacato Autisti Roma', 'Flotta capitolina');

            assert.ok(supabaseRpcCalls.some(c =>
                c.name === 'rpc_create_holding' &&
                c.params.v_name === 'Sindacato Autisti Roma' &&
                c.params.v_description === 'Flotta capitolina'
            ));
            assert.ok(env.notifications.some(n => n.msg.includes('Holding "Sindacato Autisti Roma" creata!')));
        });

        test('joinHolding e leaveHolding invocano le rispettive RPC', async () => {
            await sandbox.joinHolding('hld_101');
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_join_holding' && c.params.v_holding_id === 'hld_101'));
            assert.ok(env.notifications.some(n => n.msg.includes('entrato nella holding')));

            await sandbox.leaveHolding('hld_101');
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_leave_holding' && c.params.v_holding_id === 'hld_101'));
            assert.ok(env.notifications.some(n => n.msg.includes('lasciato la holding')));
        });

        test('contributeHoldingTreasury spende denaro e aggiorna la tensione sindacale', async () => {
            gs.cash = 50000;
            sandbox._sindacatoState.tension = 50;

            await sandbox.contributeHoldingTreasury('hld_101', 20000);

            assert.equal(gs.cash, 30000);
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare con syncCash');
            assert.equal(sandbox._sindacatoState.tension, 25, 'la tensione deve essere allineata al ritorno RPC');
            assert.ok(env.notifications.some(n => n.msg.includes('Contribuito') && n.msg.includes('cassa holding')));
            assert.ok(env.notifications.some(n => n.msg.includes('Barometro −2 pt')));
        });

        test('contributeHoldingTreasury rifiuta valori non validi o fondi insufficienti', async () => {
            gs.cash = 10000;
            await sandbox.contributeHoldingTreasury('hld_101', -500);
            await sandbox.contributeHoldingTreasury('hld_101', 20000);

            assert.equal(gs.cash, 10000);
            assert.equal(syncedCashCalls.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. BORSA VALORI P2P (listCompanyIPO, buyCompanyShares, sellCompanyShares)
    // ────────────────────────────────────────────────────────────────────────
    describe('Borsa Valori P2P — Azioni aziendali reali', () => {

        test('listCompanyIPO richiede reputazione >= 3.5 e cash >= 50.000€', async () => {
            gs.reputation = 3.0;
            gs.cash = 100000;
            await sandbox.listCompanyIPO();
            assert.ok(env.notifications.some(n => n.msg.includes('Reputazione insufficiente')));

            gs.reputation = 4.0;
            gs.cash = 40000;
            await sandbox.listCompanyIPO();
            assert.ok(env.notifications.some(n => n.msg.includes('Fondi insufficienti')));

            assert.equal(supabaseRpcCalls.length, 0);
        });

        test('listCompanyIPO quota l azienda in borsa e registra companyIPO in gameState', async () => {
            gs.reputation = 4.5;
            gs.cash = 150000;
            gs.day = 12;
            gs.companyName = 'Lusso Roma NCC';

            await sandbox.listCompanyIPO();

            // ipoPrice = Math.max(10, Math.round(150000 / 1000)) = 150
            assert.equal(gs.cash, 100000, 'costo quotazione 50.000€ deve essere detratto');
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare con syncCash');

            assert.ok(gs.companyIPO);
            assert.equal(gs.companyIPO.listed, true);
            assert.equal(gs.companyIPO.listedDay, 12);
            assert.equal(gs.companyIPO.supabaseId, 'ipo_new_1');
            assert.equal(gs.companyIPO.sharesTotal, 1000);
            assert.equal(gs.companyIPO.sharePrice, 150);
            assert.ok(env.notifications.some(n => n.msg.includes('IPO completata!')));
        });

        test('buyCompanyShares acquista azioni e scala denaro', async () => {
            sandbox._p2pMarket.shares = [
                { id: 'sh_apex', company_name: 'Apex Mobility', current_price: 65, shares_available: 100 },
            ];
            gs.cash = 10000;

            await sandbox.buyCompanyShares('sh_apex', 10);

            // 10 * 65 = 650€
            assert.equal(gs.cash, 9350);
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare con syncCash');
            assert.ok(env.notifications.some(n => n.msg.includes('Comprate 10 azioni di Apex Mobility')));
        });

        test('buyCompanyShares scala quello che il SERVER ha preso, non il prezzo in cache', async () => {
            /* Il prezzo delle azioni sale a ogni acquisto (la RPC lo alza:
               08_mmo_p2p_marketplace.sql:600). Fra il momento in cui il browser
               ha letto il listino e quello in cui la RPC gira, un altro
               giocatore puo' aver comprato — e allora il server addebita piu'
               di quanto il client credeva.

               Se il client si scala il prezzo vecchio, il saldo a schermo resta
               PIU' ALTO di quello vero finche' non si ricarica la pagina: il
               giocatore vede soldi che non ha. `sellCompanyShares` gia' faceva
               la cosa giusta usando `data.total`; l'acquisto no. */
            sandbox._p2pMarket.shares = [
                { id: 'sh_apex', company_name: 'Apex Mobility', current_price: 65, shares_available: 100 },
            ];
            supabaseMockPrezzoAzione = 70;   // qualcuno ha comprato prima di noi
            gs.cash = 10000;

            await sandbox.buyCompanyShares('sh_apex', 10);

            assert.equal(gs.cash, 9300, 'devono uscire 700 (10 x 70 del server), non 650 del listino in cache');
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare: il server ha gia\' mosso il saldo');
        });

        test('sellCompanyShares vende azioni e accredita ricavi', async () => {
            gs.cash = 5000;

            await sandbox.sellCompanyShares('sh_apex', 10);

            // Ritorna total: 650
            assert.equal(gs.cash, 5650);
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare con syncCash');
            assert.ok(env.notifications.some(n => n.msg.includes('Vendute 10 azioni di Apex Mobility — +€650')));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. CONSORZI COOPERATIVI (createConsorzio, joinConsorzio, leaveConsorzio, contributeConsorzio)
    // ────────────────────────────────────────────────────────────────────────
    describe('Consorzi Cooperativi', () => {

        test('createConsorzio, joinConsorzio, leaveConsorzio operano via RPC', async () => {
            await sandbox.createConsorzio('Consorzio Roma Nord', 'Cooperativa taxi e NCC');
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_create_consorzio' && c.params.v_name === 'Consorzio Roma Nord'));

            await sandbox.joinConsorzio('cso_101');
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_join_consorzio'));

            await sandbox.leaveConsorzio('cso_101');
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_leave_consorzio'));
        });

        test('contributeConsorzio scala la cifra via addebitatoDalServer senza syncCash e gestisce errore RPC', async () => {
            gs.cash = 30000;
            await sandbox.contributeConsorzio('cso_101', 5000);
            assert.equal(gs.cash, 25000);
            assert.deepEqual(syncedCashCalls, [], 'syncCash non deve essere chiamato per contributeConsorzio');

            // Simuliamo errore RPC
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_contribute_consorzio') {
                    return { data: null, error: { message: 'Errore DB consorzio' } };
                }
                return { data: {}, error: null };
            };

            await sandbox.contributeConsorzio('cso_101', 5000);
            assert.equal(gs.cash, 25000, 'il saldo non deve cambiare in caso di errore RPC');
            assert.deepEqual(syncedCashCalls, [], 'nessuna chiamata syncCash in caso di errore');
        });

        test('contributeConsorzio chiama saveGame e persiste la variazione di cassa', async () => {
            let saved = false;
            sandbox.saveGame = async () => { saved = true; };
            sandbox.window.saveGame = sandbox.saveGame;

            gs.cash = 40000;
            await sandbox.contributeConsorzio('cso_101', 10000);

            assert.equal(gs.cash, 30000);
            assert.equal(saved, true, 'saveGame deve essere invocato per persistere il contributo');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. ISPETTORATO DEL LAVORO, CRUMIRI E DON CARMINE
    // ────────────────────────────────────────────────────────────────────────
    describe('Ispettorato del Lavoro e Don Carmine', () => {

        test('hireCrumiri attiva boost crumiri e imposta rischio GdF', async () => {
            await sandbox.hireCrumiri();

            assert.equal(sandbox._sindacatoState.gdfRisk, 45);
            assert.ok(sandbox._sindacatoState.crumiriBoostUntil);
            assert.ok(env.logs.some(l => l.includes('Crumiri assunti')));
        });

        test('payDonCarmine spende 50.000€, azzera rischio GdF e attiva immunità', async () => {
            gs.cash = 75000;
            sandbox._sindacatoState.gdfRisk = 80;

            await sandbox.payDonCarmine();

            assert.equal(gs.cash, 25000);
            assert.equal(sandbox._sindacatoState.gdfRisk, 0);
            assert.ok(sandbox._sindacatoState.carmineImmunityUntil);
            assert.ok(env.logs.some(l => l.includes('Don Carmine: dossier eliminato')));
        });

        test('payDonCarmine chiama saveGame e persiste la spesa su disco', async () => {
            let saved = false;
            sandbox.saveGame = async () => { saved = true; };
            sandbox.window.saveGame = sandbox.saveGame;

            gs.cash = 80000;
            await sandbox.payDonCarmine();

            assert.equal(gs.cash, 30000);
            assert.equal(saved, true, 'saveGame deve essere invocato dopo aver pagato Don Carmine');
        });

        test('_sindacatoGdfDailyCheck applica multa e riduce rischio GdF se ispezione ha luogo', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_gdf_inspection_check') {
                    return { data: { inspected: true, fine: 4000 }, error: null };
                }
                return { data: {}, error: null };
            };

            gs.cash = 10000;
            sandbox._sindacatoState.gdfRisk = 75;

            await sandbox._sindacatoGdfDailyCheck();

            assert.equal(gs.cash, 6000, 'la multa di 4000€ deve essere scalata');
            assert.deepEqual(syncedCashCalls, [], 'non deve risincronizzare con syncCash');
            assert.equal(sandbox._sindacatoState.gdfRisk, 45, 'rischio deve scendere di 30 punti (75 - 30 = 45)');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. FETCHING DATI, REALTIME E LIFECYCLE (p2pInit, p2pRefreshAll)
    // ────────────────────────────────────────────────────────────────────────
    describe('Ciclo di vita dati, Realtime e Inizializzazione', () => {

        test('p2pRefreshAll popola liste listings, shares, holdings e consorzi', async () => {
            await sandbox.p2pRefreshAll();

            assert.equal(sandbox._p2pMarket.listings.length, 1);
            assert.equal(sandbox._p2pMarket.shares.length, 1);
            assert.equal(sandbox._p2pMarket.holdings.length, 1);
            assert.equal(sandbox._p2pMarket.consorzi.length, 1);
            assert.ok(sandbox._p2pMarket.myHolding, 'myHolding deve essere identificato dal membro player_me');
            assert.ok(sandbox._p2pMarket.myConsorzio, 'myConsorzio deve essere identificato');
            assert.equal(sandbox._sindacatoState.consorzioMembersCount, 3);
        });

        test('p2pStartRealtime apre i 4 canali Realtime di Supabase', () => {
            sandbox.p2pStartRealtime();

            assert.equal(realtimeChannels.length, 4);
            const channelNames = realtimeChannels.map(c => c.name);
            assert.deepEqual(channelNames, [
                'public:market_listings',
                'public:company_shares',
                'public:holding_members',
                'public:consorzio_members',
            ]);
        });

        test('p2pInit esegue refresh e avvia i timer periodici', async () => {
            await sandbox.p2pInit();
            assert.ok(sandbox._p2pMarket.listings.length > 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 8. RENDERING UI P2P (renderP2P* e sezioni grafiche)
    // ────────────────────────────────────────────────────────────────────────
    describe('Rendering sezioni UI P2P', () => {

        test('renderP2PMarketSection renderizza annunci propri e di altri', () => {
            sandbox._p2pMarket.listings = [
                {
                    id: 'l_other',
                    seller_user_id: 'other_p',
                    seller_name: 'DriverOne',
                    ask_price: 32000,
                    car_snapshot: { name: 'BMW Serie 5', condition: 92, mileage: 20000 },
                },
                {
                    id: 'l_me',
                    seller_user_id: 'player_me',
                    seller_name: 'Mia Azienda',
                    ask_price: 45000,
                    car_snapshot: { name: 'Mercedes Classe S' },
                },
            ];

            const html = sandbox.renderP2PMarketSection();

            assert.ok(html.includes('Mercato P2P Reale'));
            assert.ok(html.includes('BMW Serie 5'));
            assert.ok(html.includes('DriverOne'));
            assert.ok(html.includes('I Miei Annunci'));
            assert.ok(html.includes('Mercedes Classe S'));
            assert.ok(html.includes('data-ce-act="buyP2PCar"'));
            assert.ok(html.includes('data-ce-act="cancelP2PListing"'));
        });

        test('renderP2PSharesSection renderizza borsa valori', () => {
            sandbox._p2pMarket.shares = [
                {
                    id: 'sh_1',
                    issuer_user_id: 'other_p',
                    company_name: 'Milano Black Car',
                    ipo_price: 50,
                    current_price: 60,
                    shares_total: 1000,
                    shares_available: 500,
                },
            ];
            sandbox._p2pMarket.myShareHoldings = [
                { listing_id: 'sh_1', shares_owned: 20 },
            ];

            const html = sandbox.renderP2PSharesSection();

            assert.ok(html.includes('Borsa Valori P2P'));
            assert.ok(html.includes('Milano Black Car'));
            assert.ok(html.includes('In portafoglio: <b>20</b> az.'));
            assert.ok(html.includes('data-ce-act="buyCompanyShares"'));
            assert.ok(html.includes('data-ce-act="sellCompanyShares"'));
        });

        test('renderP2PHoldingsSection e renderBarometroWidget renderizzano dettagli sindacato', () => {
            sandbox._sindacatoState.tension = 65;
            sandbox._p2pMarket.holdings = [];
            sandbox._p2pMarket.myHolding = null;

            const htmlHolding = sandbox.renderP2PHoldingsSection();
            const htmlBarometro = sandbox.renderBarometroWidget();

            assert.ok(htmlHolding.includes('Sindacati P2P Reali'));
            assert.ok(htmlHolding.includes('Crea il tuo Sindacato'));
            assert.ok(htmlHolding.includes('data-ce-act="ceCreateHolding"'));

            assert.ok(htmlBarometro.includes('Barometro della Collera'));
            assert.ok(htmlBarometro.includes('65%'));
        });

        test('renderP2PConsorziSection e renderIspettoratoSection visualizzano widget consorzio e don carmine', () => {
            sandbox._sindacatoState.gdfRisk = 50;
            sandbox._sindacatoState.strikeActive = true;
            sandbox._p2pMarket.myConsorzio = null;

            const htmlConsorzi = sandbox.renderP2PConsorziSection();
            const htmlIspettorato = sandbox.renderIspettoratoSection();

            assert.ok(htmlConsorzi.includes('Consorzi — Gilde Cooperative'));
            assert.ok(htmlConsorzi.includes('Fonda il tuo Consorzio'));
            assert.ok(htmlConsorzi.includes('data-ce-act="ceCreateConsorzio"'));

            assert.ok(htmlIspettorato.includes('Ispettorato del Lavoro'));
            assert.ok(htmlIspettorato.includes('Don Carmine'));
            assert.ok(htmlIspettorato.includes('Crumiri'));
            assert.ok(htmlIspettorato.includes('data-ce-act="payDonCarmine"'));
            assert.ok(htmlIspettorato.includes('data-ce-act="hireCrumiri"'));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9. AZIONI INTERMEDIATE IN CE-ACTIONS.JS
    // ────────────────────────────────────────────────────────────────────────
    describe('Delegation actions in ce-actions.js', () => {

        test('ceHoldingContribute legge valore da DOM e invoca contributeHoldingTreasury', async () => {
            const input = sandbox.document.createElement('input');
            input.id = 'hld-contrib-amt';
            input.value = '15000';
            sandbox.document.body.appendChild(input);
            gs.cash = 50000;

            sandbox.ceHoldingContribute('hld_101');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 35000);
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_contribute_holding_treasury' && c.params.v_amount === 15000));
        });

        test('ceCreateHolding legge nome e descrizione da DOM e invoca createHolding', async () => {
            const nameInput = sandbox.document.createElement('input');
            nameInput.id = 'hld-name';
            nameInput.value = 'Nuova Gilda Test';
            const descInput = sandbox.document.createElement('input');
            descInput.id = 'hld-desc';
            descInput.value = 'Descrizione Gilda';
            sandbox.document.body.appendChild(nameInput);
            sandbox.document.body.appendChild(descInput);

            sandbox.ceCreateHolding();
            await new Promise(r => setImmediate(r));

            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_create_holding' && c.params.v_name === 'Nuova Gilda Test'));
        });

        test('ceConsorzioContribute legge valore da DOM e invoca contributeConsorzio', async () => {
            const input = sandbox.document.createElement('input');
            input.id = 'cso-contrib-amt';
            input.value = '12000';
            sandbox.document.body.appendChild(input);
            gs.cash = 40000;

            sandbox.ceConsorzioContribute('cso_101');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 28000);
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_contribute_consorzio' && c.params.v_amount === 12000));
        });

        test('ceCreateConsorzio legge nome e descrizione da DOM e invoca createConsorzio', async () => {
            const nameInput = sandbox.document.createElement('input');
            nameInput.id = 'cso-name';
            nameInput.value = 'Consorzio Test';
            const descInput = sandbox.document.createElement('input');
            descInput.id = 'cso-desc';
            descInput.value = 'Desc Consorzio';
            sandbox.document.body.appendChild(nameInput);
            sandbox.document.body.appendChild(descInput);

            sandbox.ceCreateConsorzio();
            await new Promise(r => setImmediate(r));

            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_create_consorzio' && c.params.v_name === 'Consorzio Test'));
        });

        test('ceListCar invoca listCarForSale', async () => {
            gs.marketplace = [];
            const car = gs.fleet[0];
            sandbox.ceListCar(car.id, 22000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.marketplace.length, 1);
            assert.equal(gs.marketplace[0].carId, car.id);
            assert.equal(gs.marketplace[0].askPrice, 22000);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 10. VERIFICA FORMA DEI DATI (TIER AUTO E COMPATIBILITÀ DATA.JS)
    // ────────────────────────────────────────────────────────────────────────
    describe('Forma dei dati e coerenza con data.js', () => {

        test('le auto starter e usate definite in data.js hanno tier canoniche minuscole', () => {
            const newCars = vm.runInContext('NEW_CARS', sandbox);
            const usedCars = vm.runInContext('USED_CARS', sandbox);
            const validTiers = new Set(['standard', 'business', 'vip', 'ultra']);

            assert.ok(Array.isArray(newCars) && newCars.length > 0);
            newCars.forEach(car => {
                assert.ok(validTiers.has(car.tier), `Tier non valido '${car.tier}' per auto ${car.id}`);
            });

            if (Array.isArray(usedCars)) {
                usedCars.forEach(car => {
                    assert.ok(validTiers.has(car.tier), `Tier non valido '${car.tier}' per auto usata ${car.id}`);
                });
            }
        });

        test('buyP2PCar inserisce in flotta un oggetto coerente con lo schema fleet di gameState', async () => {
            sandbox._p2pMarket.listings = [
                {
                    id: 'lst_schema_check',
                    seller_user_id: 'other_p',
                    ask_price: 25000,
                },
            ];
            gs.cash = 50000;

            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_buy_market_car') {
                    return {
                        data: {
                            price_paid: 25000,
                            seller_name: 'TestSeller',
                            fee: 1250,
                            car: {
                                name: 'Audi A6 Avant',
                                tier: 'business',
                                condition: 95,
                                fuel: 90,
                                mileage: 12000,
                            },
                        },
                        error: null,
                    };
                }
                return { data: {}, error: null };
            };

            await sandbox.buyP2PCar('lst_schema_check');

            const car = gs.fleet.find(c => c.name === 'Audi A6 Avant');
            assert.ok(car);
            assert.equal(car.tier, 'business');
            assert.equal(typeof car.id, 'string');
            assert.ok(car.id.startsWith('c_p2p_'));
            assert.equal(typeof car.condition, 'number');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 11. PERMANENZA DELLO STATO (DOMANDA B) ED ECO REALTIME
    // ────────────────────────────────────────────────────────────────────────
    describe('Permanenza degli effetti nello stato di gioco ed eco Realtime', () => {

        test('buyP2PCar: auto acquistata resta in flotta anche dopo eventi Realtime concorrenti', async () => {
            sandbox._p2pMarket.listings = [
                {
                    id: 'lst_rt_test',
                    seller_user_id: 'other_p',
                    ask_price: 35000,
                },
            ];
            gs.cash = 65000;
            const initialFleetCount = gs.fleet.length;

            sandbox.p2pStartRealtime();
            const marketChan = realtimeChannels.find(c => c.name === 'public:market_listings');
            assert.ok(marketChan);

            await sandbox.buyP2PCar('lst_rt_test');

            assert.equal(gs.fleet.length, initialFleetCount + 1);
            assert.equal(gs.cash, 30000);

            // Simuliamo eco realtime di inserimento/cancellazione sul mercato
            const insertHandler = marketChan._handlers.find(h => h.event === 'postgres_changes');
            insertHandler.callback({
                eventType: 'INSERT',
                new: {
                    id: 'lst_new_broadcast',
                    seller_user_id: 'third_p',
                    seller_name: 'Bob',
                    ask_price: 15000,
                    car_snapshot: { name: 'Fiat Tipo' },
                },
            });
            insertHandler.callback({
                eventType: 'DELETE',
                old: { id: 'lst_rt_test' },
            });

            // Lo stato locale della flotta e del cash non deve subire alterazioni
            assert.equal(gs.fleet.length, initialFleetCount + 1, 'la flotta non deve perdere l auto comprata');
            assert.equal(gs.cash, 30000, 'il cash non deve essere alterato dagli eventi realtime');
            assert.ok(sandbox._p2pMarket.listings.some(l => l.id === 'lst_new_broadcast'));
            assert.ok(!sandbox._p2pMarket.listings.some(l => l.id === 'lst_rt_test'));
        });

        test('listCompanyIPO: lo stato companyIPO persiste dopo saveGame e refresh dati borsa', async () => {
            gs.reputation = 4.0;
            gs.cash = 100000;
            gs.day = 5;

            await sandbox.listCompanyIPO();

            assert.ok(gs.companyIPO);
            assert.equal(gs.companyIPO.listed, true);
            assert.equal(gs.cash, 50000);

            // Simuliamo refresh borsa successivo
            await sandbox.p2pRefreshAll();

            assert.ok(gs.companyIPO);
            assert.equal(gs.companyIPO.listed, true);
            assert.equal(gs.cash, 50000);
        });

        test('_sindacatoGdfDailyCheck: multa registrata tramite addebitatoDalServer e salvata', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_gdf_inspection_check') {
                    return { data: { inspected: true, fine: 12000 }, error: null };
                }
                return { data: {}, error: null };
            };

            gs.cash = 50000;
            sandbox._sindacatoState.gdfRisk = 80;

            await sandbox._sindacatoGdfDailyCheck();

            assert.equal(gs.cash, 38000);
            assert.equal(sandbox._sindacatoState.gdfRisk, 50);
            assert.deepEqual(syncedCashCalls, [], 'nessuna chiamata syncCash per la multa GdF');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 12. PORTA UNICA DEL DENARO — le azioni P2P muovono cassa una volta sola,
    //     solo via CE_money (il server l'ha giá mossa dentro la RPC), mai con
    //     gameState.cash -= e mai con syncCash.
    // ────────────────────────────────────────────────────────────────────────
    describe('Porta unica del denaro nelle azioni P2P', () => {

        function spiaCEMoney() {
            const addebiti = [];
            const accrediti = [];
            const origAddebito = sandbox.CE_money.addebitatoDalServer;
            const origAccredito = sandbox.CE_money.accreditatoDalServer;
            const origSpend = sandbox.CE_money.spend;
            sandbox.CE_money.addebitatoDalServer = function (importo, motivo) {
                addebiti.push({ importo, motivo });
                return origAddebito.call(sandbox.CE_money, importo, motivo);
            };
            sandbox.CE_money.accreditatoDalServer = function (importo, motivo) {
                accrediti.push({ importo, motivo });
                return origAccredito.call(sandbox.CE_money, importo, motivo);
            };
            sandbox.CE_money.spend = function (importo, motivo) {
                addebiti.push({ importo, motivo, via: 'spend' });
                return origSpend.call(sandbox.CE_money, importo, motivo);
            };
            return { addebiti, accrediti };
        }

        test('buyP2PCar addebita UNA volta sola, via CE_money, il prezzo pagato dal server', async () => {
            sandbox._p2pMarket.listings = [
                { id: 'lst_once', seller_user_id: 'other_player', ask_price: 35000 },
            ];
            gs.cash = 50000;
            const { addebiti } = spiaCEMoney();

            await sandbox.buyP2PCar('lst_once');

            assert.equal(addebiti.length, 1, 'esattamente un movimento in uscita');
            assert.equal(addebiti[0].via, undefined, 'non deve usare CE_money.spend: il server ha giá mosso il saldo');
            assert.equal(addebiti[0].importo, 35000, 'l\'importo deve essere il price_paid del server');
            assert.equal(gs.cash, 15000);
            assert.deepEqual(syncedCashCalls, []);
        });

        test('buyP2PCar su annuncio già venduto: errore RPC, zero denaro mosso, zero auto in flotta', async () => {
            sandbox._p2pMarket.listings = [
                { id: 'lst_sold', seller_user_id: 'other_player', ask_price: 35000 },
            ];
            gs.cash = 50000;
            const fleetCount = gs.fleet.length;
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_buy_market_car') {
                    /* Stesso esito della RPC vera (08_mmo_p2p_marketplace.sql):
                       la riga è sparita sotto il lock FOR UPDATE, il compratore
                       arriva secondo e riceve l'eccezione. */
                    return { data: null, error: { message: 'rpc_buy_market_car: inserzione non trovata (già venduta?)' } };
                }
                return { data: {}, error: null };
            };
            const { addebiti } = spiaCEMoney();

            await sandbox.buyP2PCar('lst_sold');

            assert.equal(addebiti.length, 0, 'nessun addebito se la vendita è già andata');
            assert.equal(gs.cash, 50000);
            assert.equal(gs.fleet.length, fleetCount, 'nessuna auto fantasma in flotta');
            assert.ok(env.notifications.some(n => n.type === 'error'));
        });

        test('contributeHoldingTreasury addebita una volta sola l importo roundato che il server prende', async () => {
            gs.cash = 50000;
            const { addebiti } = spiaCEMoney();

            await sandbox.contributeHoldingTreasury('hld_101', 20000.4);

            assert.equal(addebiti.length, 1);
            assert.equal(addebiti[0].importo, 20000, 'la RPC prende v_amount roundato, non 20000.4');
            assert.equal(addebiti[0].via, undefined);
            assert.equal(gs.cash, 30000);
            assert.deepEqual(syncedCashCalls, []);
        });

        test('payDonCarmine addebita 50.000 una volta sola; se la RPC fallisce zero movimenti', async () => {
            gs.cash = 75000;
            let spia = spiaCEMoney();

            await sandbox.payDonCarmine();

            assert.equal(spia.addebiti.length, 1);
            assert.equal(spia.addebiti[0].importo, 50000);
            assert.equal(spia.addebiti[0].via, undefined);
            assert.equal(gs.cash, 25000);

            // Secondo tentativo: il server rifiuta
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_pay_don_carmine') {
                    return { data: null, error: { message: 'Immunità già attiva' } };
                }
                return { data: {}, error: null };
            };
            spia = spiaCEMoney();
            gs.cash = 75000;

            await sandbox.payDonCarmine();

            assert.equal(spia.addebiti.length, 0, 'errore RPC = nessun addebito locale');
            assert.equal(gs.cash, 75000);
        });

        test('contributeConsorzio con fondi insufficienti non chiama RPC né muove denaro', async () => {
            gs.cash = 4000;
            const { addebiti } = spiaCEMoney();

            await sandbox.contributeConsorzio('cso_101', 5000);

            assert.equal(supabaseRpcCalls.length, 0);
            assert.equal(addebiti.length, 0);
            assert.equal(gs.cash, 4000);
        });
    });
});
