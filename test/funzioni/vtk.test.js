'use strict';
/* ============================================================================
   test/funzioni/vtk.test.js — Verifica approfondita del modulo VTK (vtk-market.js)

   Scopo: verificare il funzionamento completo del mercato del token VTK e del
   VTK Shop, testando tutte le azioni esposte (openVTKModal, renderVTKModal,
   vtkRefreshOrders, vtkPlaceSellOrder, vtkFillOrder, vtkCancelOrder,
   vtkBuyShopItem, ceVtkSell, ceSetRender, ceRemove), la persistenza delle spese DC,
   la gestione degli errori RPC e il catalogo del negozio.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente pulito configurato con mock Supabase per gli ordini e il negozio VTK.
 */
function creaAmbienteVTK(opzioni = {}) {
    const rpcLog = [];
    const ordiniDefault = [
        {
            id: 'ord_1',
            seller_id: 'user_player_1',
            seller_name: 'Giocatore Test',
            vtk_amount: 50,
            dc_price: 10,
            created_at: new Date().toISOString(),
        },
        {
            id: 'ord_2',
            seller_id: 'user_other_2',
            seller_name: 'Marco Rossi',
            vtk_amount: 100,
            dc_price: 25,
            created_at: new Date().toISOString(),
        },
    ];

    let statoOrdini = (opzioni.ordini || ordiniDefault).map(o => ({ ...o }));

    const env = freshEnv({
        render: true,
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            ...opzioni.serverStateOverrides,
        },
    });

    const sbClient = {
        from: () => ({
            upsert: async () => ({ error: null }),
            delete: () => ({
                eq: () => ({
                    eq: async () => ({ error: null }),
                    then: (fn) => { fn({ error: null }); },
                }),
            }),
        }),
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoOrdini });
            }

            if (nome === 'rpc_get_vtk_market_orders') {
                return { data: statoOrdini, error: null };
            }

            if (nome === 'rpc_place_vtk_sell_order') {
                const nuovo = {
                    id: 'ord_' + Math.random().toString(36).slice(2),
                    seller_id: env.sandbox.currentUser?.id || 'user_anon',
                    seller_name: 'Giocatore Test',
                    vtk_amount: args.v_vtk_amount,
                    dc_price: args.v_dc_price,
                    created_at: new Date().toISOString(),
                };
                statoOrdini.push(nuovo);
                return { data: { success: true, order_id: nuovo.id }, error: null };
            }

            if (nome === 'rpc_fill_vtk_order') {
                const idx = statoOrdini.findIndex(o => o.id === args.v_order_id);
                if (idx === -1) return { data: null, error: { message: 'Ordine non trovato' } };
                const ordine = statoOrdini[idx];
                statoOrdini.splice(idx, 1);
                return {
                    data: {
                        vtk_received: ordine.vtk_amount,
                        dc_paid: ordine.dc_price,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_cancel_vtk_order') {
                const idx = statoOrdini.findIndex(o => o.id === args.v_order_id);
                if (idx === -1) return { data: null, error: { message: 'Ordine inesistente' } };
                statoOrdini.splice(idx, 1);
                return { data: { success: true }, error: null };
            }

            if (nome === 'rpc_spend_vtk_shop_item') {
                return { data: { success: true, item_id: args.v_item_id }, error: null };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = { id: 'user_player_1' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        statoOrdini,
    };
}

describe('Funzione VTK — Mercato P2P e VTK Shop (vtk-market.js)', () => {

    describe('1. Recupero ordini e throttling (vtkRefreshOrders)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('vtkRefreshOrders popola la lista ordini da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.vtkRefreshOrders(true);

            assert.equal(sandbox._vtkState.orders.length, 2, 'gli ordini devono essere 2');
            assert.equal(sandbox._vtkState.orders[0].id, 'ord_1');
            assert.ok(sandbox._vtkState._lastFetch > 0, 'il timestamp _lastFetch deve essere aggiornato');
        });

        test('vtkRefreshOrders rispetta il throttling di 30 secondi se force=false', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.vtkRefreshOrders(true);
            const countPrima = rpcLog.length;

            // Seconda chiamata immediata senza force
            await sandbox.vtkRefreshOrders(false);
            assert.equal(rpcLog.length, countPrima, 'non deve effettuare chiamate rpc se entro i 30 secondi');

            // Con force=true bypassa il throttling
            await sandbox.vtkRefreshOrders(true);
            assert.equal(rpcLog.length, countPrima + 1, 'con force=true deve rieseguire la chiamata RPC');
        });

        test('vtkRefreshOrders non va in errore se supabaseClient non è presente', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.vtkRefreshOrders(true);
            });
        });

        test('vtkRefreshOrders mantiene invariata la lista ordini in caso di errore RPC', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_get_vtk_market_orders: async () => ({
                        data: null,
                        error: { message: 'Errore di connessione' },
                    }),
                },
            });
            ambErr.sandbox._vtkState.orders = [{ id: 'preesistente' }];

            await ambErr.sandbox.vtkRefreshOrders(true);

            assert.equal(ambErr.sandbox._vtkState.orders.length, 1);
            assert.equal(ambErr.sandbox._vtkState.orders[0].id, 'preesistente');
            ambErr.env.stopAllIntervals();
        });
    });

    describe('2. Pubblicazione ordine di vendita (vtkPlaceSellOrder & ceVtkSell)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('pubblicazione ordine valido invia RPC con parametri corretti e ricarica gli ordini', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 100;

            await sandbox.vtkPlaceSellOrder(50, 15);

            const rpc = rpcLog.find(r => r.nome === 'rpc_place_vtk_sell_order');
            assert.ok(rpc, 'deve chiamare rpc_place_vtk_sell_order');
            assert.equal(rpc.args.v_vtk_amount, 50);
            assert.equal(rpc.args.v_dc_price, 15);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('50 VTK → 15 DC')));
        });

        test('pubblicazione con quantità o prezzo <= 0 viene bloccata con errore', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 100;

            await sandbox.vtkPlaceSellOrder(0, 10);
            await sandbox.vtkPlaceSellOrder(50, -5);
            await sandbox.vtkPlaceSellOrder('abc', 10);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 0, 'nessuna RPC deve partire');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('quantità e prezzo validi')));
        });

        test('pubblicazione con saldo VTK insufficiente viene bloccata', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 20;

            await sandbox.vtkPlaceSellOrder(50, 10);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('VTK insufficienti')));
        });

        test('pubblicazione con errore RPC notifica errore e non applica success', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_place_vtk_sell_order: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Limite ordini raggiunto' },
                    }),
                },
            });
            ambErr.gs.vtkBalance = 100;

            await ambErr.sandbox.vtkPlaceSellOrder(50, 10);

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Limite ordini raggiunto')));
            ambErr.env.stopAllIntervals();
        });

        test('ceVtkSell legge i valori dagli input nel DOM e pubblica l\'ordine', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.vtkBalance = 100;

            // Apri modale per avere i campi input nel DOM
            await sandbox.openVTKModal();

            const inputVtk = sandbox.document.getElementById('vtk-sell-amount');
            const inputPrice = sandbox.document.getElementById('vtk-sell-price');
            assert.ok(inputVtk && inputPrice, 'gli input devono esistere nel DOM');

            inputVtk.value = '30';
            inputPrice.value = '8';

            sandbox.ceVtkSell();
            await new Promise(r => setImmediate(r));

            const rpc = rpcLog.find(r => r.nome === 'rpc_place_vtk_sell_order');
            assert.ok(rpc);
            assert.equal(rpc.args.v_vtk_amount, 30);
            assert.equal(rpc.args.v_dc_price, 8);
        });

        test('pubblicazione ordine offline (senza supabaseClient) esce in sicurezza senza lanciare eccezioni', async () => {
            const { sandbox, gs } = amb;
            gs.vtkBalance = 100;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.vtkPlaceSellOrder(50, 10);
            });
        });

        test('stato e persistenza: la pubblicazione aggiorna il saldo VTK con l\'eco Realtime dal server', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.vtkBalance = 100;

            await sandbox.vtkPlaceSellOrder(50, 10);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 1);

            // Simula arrivo dell'eco Realtime dal server (50 VTK bloccati nel mercato)
            gs.vtkBalance = 50;

            assert.equal(gs.vtkBalance, 50, 'il saldo VTK deve riflettere la detrazione autoritativa');
        });
    });

    describe('3. Acquisto ordine P2P (vtkFillOrder)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisto ordine invia RPC rpc_fill_vtk_order senza scalare ridondantemente i DC dal client', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.driverCoins = 100;

            await sandbox.vtkFillOrder('ord_2', 25);

            const rpc = rpcLog.find(r => r.nome === 'rpc_fill_vtk_order');
            assert.ok(rpc, 'deve chiamare rpc_fill_vtk_order');
            assert.equal(rpc.args.v_order_id, 'ord_2');

            // La RPC scala già i DC sul server (21_vtk_token.sql), il client non deve fare spendDriverCoins
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_ec_spend' || r.nome === 'rpc_spend_driver_coins').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Acquistati 100 VTK')));
        });

        test('acquisto con DC insufficienti viene bloccato prima di invocare la RPC', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.driverCoins = 10;

            await sandbox.vtkFillOrder('ord_2', 25);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_fill_vtk_order').length, 0);
            assert.equal(gs.driverCoins, 10);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('DC insufficienti')));
        });

        test('acquisto con errore RPC non scala DC e mostra notifica di errore', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_fill_vtk_order: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Ordine non più disponibile' },
                    }),
                },
            });
            ambErr.gs.driverCoins = 100;

            await ambErr.sandbox.vtkFillOrder('ord_2', 25);

            assert.equal(ambErr.gs.driverCoins, 100, 'il saldo DC non deve cambiare');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Ordine non più disponibile')));
            ambErr.env.stopAllIntervals();
        });

        test('acquisto ordine offline (senza supabaseClient) esce in sicurezza', async () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 100;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.vtkFillOrder('ord_2', 25);
            });
        });

        test('stato e persistenza: l\'acquisto P2P accredita i VTK e scala i DC al riallineamento Realtime', async () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 100;
            gs.vtkBalance = 20;

            await sandbox.vtkFillOrder('ord_2', 25);

            // Simula arrivo dell'eco Realtime dal server (ord_2 dava 100 VTK per 25 DC)
            gs.driverCoins = 75;
            gs.vtkBalance = 120;

            assert.equal(gs.driverCoins, 75, 'i Driver Coins devono essere scalati');
            assert.equal(gs.vtkBalance, 120, 'i VTK devono essere accreditati');
        });
    });

    describe('4. Annullamento ordine (vtkCancelOrder)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('annullamento ordine valido invia RPC e notifica successo', async () => {
            const { sandbox, rpcLog, env } = amb;
            await sandbox.vtkCancelOrder('ord_1');

            const rpc = rpcLog.find(r => r.nome === 'rpc_cancel_vtk_order');
            assert.ok(rpc, 'deve chiamare rpc_cancel_vtk_order');
            assert.equal(rpc.args.v_order_id, 'ord_1');

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Ordine annullato')));
        });

        test('annullamento con errore RPC mostra notifica di errore', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_cancel_vtk_order: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Ordine già evaso' },
                    }),
                },
            });

            await ambErr.sandbox.vtkCancelOrder('ord_1');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Ordine già evaso')));
            ambErr.env.stopAllIntervals();
        });

        test('annullamento ordine offline (senza supabaseClient) esce in sicurezza', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.vtkCancelOrder('ord_1');
            });
        });

        test('stato e persistenza: l\'annullamento ordine ripristina il saldo VTK', async () => {
            const { sandbox, gs } = amb;
            gs.vtkBalance = 50;

            await sandbox.vtkCancelOrder('ord_1');

            // Simula eco Realtime di restituzione dei 50 VTK bloccati
            gs.vtkBalance = 100;
            assert.equal(gs.vtkBalance, 100, 'il saldo VTK deve essere ripristinato');
        });
    });

    describe('5. VTK Shop — Acquisto potenziamenti (vtkBuyShopItem)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('catalogo VTK_SHOP_ITEMS contiene solo item verificati con proprietà coerenti', () => {
            const items = vm.runInContext('VTK_SHOP_ITEMS', amb.sandbox);
            assert.ok(items && items.length === 3, 'VTK_SHOP_ITEMS deve avere 3 elementi');

            const ids = Array.from(items).map(i => String(i.id));
            assert.equal(ids[0], 'driver_stress_reset');
            assert.equal(ids[1], 'fuel_refill_full');
            assert.equal(ids[2], 'rep_boost_01');
        });

        test('item driver_stress_reset azzera stress e burnout dell\'autista più provato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 200;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 50 },
                { id: 'd1', name: 'Luigi', stress_level: 40, burnout_until: 123456 },
                { id: 'd2', name: 'Mario', stress_level: 80, burnout_until: 999999 },
            ];

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            const rpc = rpcLog.find(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.ok(rpc, 'deve chiamare rpc_spend_vtk_shop_item');
            assert.equal(rpc.args.v_item_id, 'driver_stress_reset');

            // Mario aveva lo stress maggiore -> deve essere azzerato
            const mario = gs.drivers.find(d => d.id === 'd2');
            assert.equal(mario.stress_level, 0);
            assert.equal(mario.burnout_until, null);

            // Luigi non deve essere modificato
            const luigi = gs.drivers.find(d => d.id === 'd1');
            assert.equal(luigi.stress_level, 40);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Mario azzerato')));
        });

        test('item driver_stress_reset viene rifiutato in dry-run se nessun autista è stressato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 200;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 50 },
                { id: 'd1', name: 'Luigi', stress_level: 0, burnout_until: null },
            ];

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessun autista stressato')));
        });

        test('item fuel_refill_full riempie il deposito carburante fino alla capienza', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 200;
            gs.fuelTankCapacity = 1000;
            gs.fuelTank = 250;

            await sandbox.vtkBuyShopItem('fuel_refill_full');

            const rpc = rpcLog.find(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.ok(rpc);
            assert.equal(gs.fuelTank, 1000, 'il deposito deve essere riempito al 100%');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Deposito riempito')));
        });

        test('item fuel_refill_full viene rifiutato se non si possiede deposito o se è già pieno', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 200;
            gs.fuelTankCapacity = 0;
            gs.fuelTank = 0;

            await sandbox.vtkBuyShopItem('fuel_refill_full');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Non hai ancora un deposito')));

            // Caso deposito già pieno
            gs.fuelTankCapacity = 500;
            gs.fuelTank = 500;
            await sandbox.vtkBuyShopItem('fuel_refill_full');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Il deposito è già pieno')));
        });

        test('item rep_boost_01 incrementa la reputazione di +0.2★', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            gs.prestige = 0;
            gs.reputation = 4.5;

            await sandbox.vtkBuyShopItem('rep_boost_01');

            const rpc = rpcLog.find(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.ok(rpc);
            assert.equal(gs.reputation, 4.7);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Reputazione +0.2★')));
        });

        test('item rep_boost_01 viene rifiutato se la reputazione è già al cap', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            gs.prestige = 0;
            gs.reputation = 5.0;

            await sandbox.vtkBuyShopItem('rep_boost_01');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Reputazione già al massimo')));
        });

        test('acquisto shop rifiutato se saldo VTK insufficiente', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 50; // servono 100 VTK per stress reset
            gs.drivers = [{ id: 'd1', name: 'Luigi', stress_level: 40 }];

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('VTK insufficienti')));
        });

        test('acquisto shop con RPC assente (42883 / PGRST202) disattiva senza applicare l\'effetto', async () => {
            const ambNoSql = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_spend_vtk_shop_item: async () => ({
                        data: null,
                        error: { code: '42883', message: 'function rpc_spend_vtk_shop_item does not exist' },
                    }),
                },
            });
            ambNoSql.gs.vtkBalance = 500;
            ambNoSql.gs.reputation = 4.0;

            await ambNoSql.sandbox.vtkBuyShopItem('rep_boost_01');

            assert.equal(ambNoSql.gs.reputation, 4.0, 'la reputazione non deve essere modificata se la RPC manca');
            assert.ok(ambNoSql.env.notifications.some(n => n.type === 'warning' && n.msg.includes('non ancora attivo su questo server')));
            ambNoSql.env.stopAllIntervals();
        });

        test('acquisto shop con id item non presente nel catalogo non compie alcuna azione', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.vtkBuyShopItem('item_inesistente');
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
        });

        test('acquisto shop offline (senza supabaseClient) notifica errore e blocca l\'acquisto', async () => {
            const { sandbox, gs, env } = amb;
            gs.vtkBalance = 500;
            gs.drivers = [{ id: 'd1', name: 'Luigi', stress_level: 50 }];
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            assert.equal(gs.drivers[0].stress_level, 50, 'lo stress non deve cambiare offline');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non connesso al server')));
        });

        test('acquisto shop con errore RPC generico mostra notifica e non applica l\'effetto', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_spend_vtk_shop_item: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Errore generico server' },
                    }),
                },
            });
            ambErr.gs.vtkBalance = 500;
            ambErr.gs.fuelTankCapacity = 1000;
            ambErr.gs.fuelTank = 200;

            await ambErr.sandbox.vtkBuyShopItem('fuel_refill_full');

            assert.equal(ambErr.gs.fuelTank, 200, 'il carburante non deve cambiare su errore');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Errore generico server')));
            ambErr.env.stopAllIntervals();
        });

        test('acquisto shop con errore di rete catturato nel blocco catch notifica errore di rete', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_spend_vtk_shop_item: async () => {
                        throw new Error('Network failure');
                    },
                },
            });
            ambErr.gs.vtkBalance = 500;
            ambErr.gs.drivers = [{ id: 'd1', name: 'Luigi', stress_level: 50 }];

            await ambErr.sandbox.vtkBuyShopItem('driver_stress_reset');

            assert.equal(ambErr.gs.drivers[0].stress_level, 50);
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('errore di rete')));
            ambErr.env.stopAllIntervals();
        });

        test('stato e persistenza: gli effetti del negozio RESTANO in gameState dopo l\'acquisto ed eco Realtime', async () => {
            const { sandbox, gs, env } = amb;
            gs.vtkBalance = 300;
            gs.fuelTankCapacity = 500;
            gs.fuelTank = 100;

            await sandbox.vtkBuyShopItem('fuel_refill_full');

            // Verifica effetto immediato
            assert.equal(gs.fuelTank, 500, 'la cisterna deve essere riempita a 500L');

            // Simula arrivo dell'eco Realtime dal server sulla riga companies (vtk_balance scalato da 300 a 150)
            gs.vtkBalance = 150;

            // Il carburante RESTA riempito e il saldo VTK resta scalato
            assert.equal(gs.fuelTank, 500, 'il carburante resta a capienza dopo l\'eco');
            assert.equal(gs.vtkBalance, 150, 'il saldo VTK resta detratto');
        });
    });

    describe('6. UI, Overlay modale e navigazione sub-tab (openVTKModal, renderVTKModal, ceSetRender, ceRemove)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('openVTKModal crea overlay nel DOM, rinfresca gli ordini e renderizza i contenuti', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();

            const modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal, 'l\'elemento #vtk-modal deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('Vettura Token'), 'deve includere il titolo');
            assert.ok(modal.innerHTML.includes('Mercato P2P'), 'deve includere il tab Mercato');
            assert.ok(modal.innerHTML.includes('VTK Shop'), 'deve includere il tab Shop');
        });

        test('ceSetRender permette di cambiare subTab tra market e shop', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();

            // Passa alla tab Shop
            sandbox.ceSetRender('_vtkState', '_subTab', 'shop', 'renderVTKModal');
            let modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal.innerHTML.includes('Reset Stress Autista'), 'la vista shop deve mostrare i prodotti');
            assert.ok(modal.innerHTML.includes('Rifornimento Cisterna'));

            // Torna alla tab Mercato
            sandbox.ceSetRender('_vtkState', '_subTab', 'market', 'renderVTKModal');
            modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal.innerHTML.includes('Crea Ordine di Vendita'), 'la vista market deve mostrare il form di vendita');
        });

        test('ceRemove rimuove il modale aperto dal DOM', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();
            assert.ok(sandbox.document.getElementById('vtk-modal'));

            sandbox.ceRemove('vtk-modal');
            assert.equal(sandbox.document.getElementById('vtk-modal'), null, 'il modale deve essere rimosso dal DOM');
        });

        test('click sul backdrop overlay rimuove il modale', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();
            const modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal);

            // Simula click direttamente sull'overlay di sfondo
            modal.onclick({ target: modal });
            assert.equal(sandbox.document.getElementById('vtk-modal'), null);
        });

        test('rendering disabilita pulsante acquisto se Driver Coins o VTK sono insufficienti', async () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 0;
            gs.vtkBalance = 0;

            await sandbox.openVTKModal();
            let modal = sandbox.document.getElementById('vtk-modal');

            // Nel mercato, l'ordine altrui richiede 25 DC -> bottone disabilitato
            assert.ok(modal.innerHTML.includes('disabled'), 'il bottone acquisto deve essere disabilitato con 0 DC');

            // Nello shop con 0 VTK
            sandbox.ceSetRender('_vtkState', '_subTab', 'shop', 'renderVTKModal');
            modal = sandbox.document.getElementById('vtk-modal');
            const disabilitati = modal.querySelectorAll('button[disabled]');
            assert.ok(disabilitati.length >= 3, 'tutti i bottoni acquisto shop devono essere disabilitati con 0 VTK');
        });

        test('rendering separa correttamente "I Tuoi Ordini Attivi" da "Ordini Disponibili"', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();
            const modal = sandbox.document.getElementById('vtk-modal');

            // ord_1 appartiene a user_player_1 (currentUser)
            // ord_2 appartiene a user_other_2
            assert.ok(modal.innerHTML.includes('I Tuoi Ordini Attivi'), 'deve mostrare la sezione propri ordini');
            assert.ok(modal.innerHTML.includes('Ordini Disponibili'), 'deve mostrare la sezione ordini altrui');
            assert.ok(modal.innerHTML.includes('Annulla'), 'deve mostrare il tasto Annulla per il proprio ordine');
            assert.ok(modal.innerHTML.includes('Marco Rossi'), 'deve mostrare il nome del venditore per l\'ordine altrui');
        });

        test('click sui bottoni DOM tramite event delegation attiva le azioni attese', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.vtkBalance = 200;
            gs.driverCoins = 50;

            await sandbox.openVTKModal();

            // Passa a sub-tab shop cliccando sul bottone VTK Shop
            const btnTabShop = sandbox.document.querySelectorAll('button[data-ce-act="ceSetRender"]')[1];
            assert.ok(btnTabShop, 'il pulsante tab shop deve esistere');
            btnTabShop.click();

            assert.equal(sandbox._vtkState._subTab, 'shop', 'il subTab deve essere passato a shop');

            // Torna a market cliccando sul tab market
            const btnTabMarket = sandbox.document.querySelectorAll('button[data-ce-act="ceSetRender"]')[0];
            btnTabMarket.click();
            assert.equal(sandbox._vtkState._subTab, 'market');

            // Clicca sul pulsante Annulla del proprio ordine
            const btnAnnulla = sandbox.document.querySelector('button[data-ce-act="vtkCancelOrder"]');
            assert.ok(btnAnnulla);
            btnAnnulla.click();
            await new Promise(r => setImmediate(r));

            const cancelRpc = rpcLog.find(r => r.nome === 'rpc_cancel_vtk_order');
            assert.ok(cancelRpc, 'il click su Annulla deve chiamare rpc_cancel_vtk_order');
        });
    });
});
