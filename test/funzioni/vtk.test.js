'use strict';
/* ============================================================================
   test/funzioni/vtk.test.js — Verifica approfondita del modulo VTK (Vettura Token)

   Scopo: verificare che tutte le azioni esposte da `vtk-market.js` e i relativi
   gestori `ce-actions.js` funzionino realmente in presenza del contesto e dei
   dati attesi (Supabase RPC, mercato ordini P2P, catalogo VTK Shop, DOM UI).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente sandbox con mock Supabase e ServerState per il mercato VTK e VTK Shop.
 */
function creaAmbienteVTK(opzioni = {}) {
    const rpcLog = [];
    const chiamateDC = [];

    const ordiniDefault = [
        { id: 'ord_1', seller_id: 'user_altro', seller_name: 'Giocatore B', vtk_amount: 100, dc_price: 20, created_at: new Date().toISOString() },
        { id: 'ord_2', seller_id: 'user_me', seller_name: 'Io (CEO)', vtk_amount: 50, dc_price: 10, created_at: new Date().toISOString() },
    ];

    let statoOrdini = (opzioni.ordini || ordiniDefault).map(o => ({ ...o }));

    const env = freshEnv({
        render: true,
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                env.sandbox.gameState.driverCoins = Math.max(0, (env.sandbox.gameState.driverCoins || 0) - n);
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sbClient = {
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
                    id: 'ord_new_' + Math.random().toString(36).slice(2),
                    seller_id: env.sandbox.currentUser?.id || 'user_me',
                    seller_name: 'Io (CEO)',
                    vtk_amount: args.v_vtk_amount,
                    dc_price: args.v_dc_price,
                    created_at: new Date().toISOString(),
                };
                statoOrdini.push(nuovo);
                return { data: { success: true, id: nuovo.id }, error: null };
            }

            if (nome === 'rpc_fill_vtk_order') {
                const ordIndex = statoOrdini.findIndex(o => o.id === args.v_order_id);
                if (ordIndex === -1) {
                    return { data: null, error: { message: 'Ordine non trovato o già eseguito' } };
                }
                const ord = statoOrdini[ordIndex];
                statoOrdini.splice(ordIndex, 1);
                return {
                    data: {
                        success: true,
                        vtk_received: ord.vtk_amount,
                        dc_paid: ord.dc_price,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_cancel_vtk_order') {
                const ordIndex = statoOrdini.findIndex(o => o.id === args.v_order_id);
                if (ordIndex === -1) {
                    return { data: null, error: { message: 'Ordine non trovato o non tuo' } };
                }
                const [ord] = statoOrdini.splice(ordIndex, 1);
                return {
                    data: {
                        success: true,
                        vtk_returned: ord.vtk_amount,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_spend_vtk_shop_item') {
                return {
                    data: {
                        success: true,
                        item_id: args.v_item_id,
                        cost: 100,
                        vtk_balance: (env.sandbox.gameState.vtkBalance || 0) - 100,
                    },
                    error: null,
                };
            }

            if (nome === 'rpc_award_mission_vtk') {
                return {
                    data: {
                        success: true,
                        awarded: args.v_vtk_amount,
                        mission_id: args.v_mission_id,
                    },
                    error: null,
                };
            }

            return { data: null, error: null };
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = { id: 'user_me' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        chiamateDC,
        statoOrdini,
    };
}

describe('Funzione VTK — Mercato P2P e VTK Shop', () => {

    describe('window.vtkRefreshOrders — Recupero del libro ordini P2P', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('vtkRefreshOrders popola la lista ordini in _vtkState da Supabase', async () => {
            const { sandbox } = amb;
            await sandbox.vtkRefreshOrders(true);

            assert.equal(sandbox._vtkState.orders.length, 2, 'devono essere caricati i 2 ordini mockati');
            assert.equal(sandbox._vtkState.orders[0].id, 'ord_1');
            assert.ok(sandbox._vtkState._lastFetch > 0, 'il timestamp _lastFetch deve essere impostato');
        });

        test('vtkRefreshOrders rispetta il throttling di 30 secondi se non forzato', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.vtkRefreshOrders(true);
            const rpcPrima = rpcLog.length;

            // Seconda chiamata immediata senza force=true -> non deve chiamare la RPC
            await sandbox.vtkRefreshOrders(false);
            assert.equal(rpcLog.length, rpcPrima, 'non deve effettuare chiamate rpc nel periodo di throttle');

            // Chiamata con force=true -> riesegue la RPC
            await sandbox.vtkRefreshOrders(true);
            assert.equal(rpcLog.length, rpcPrima + 1, 'con force=true deve bypassare il throttle');
        });

        test('vtkRefreshOrders gestisce assenza di supabaseClient senza crash', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await assert.doesNotReject(async () => {
                await sandbox.vtkRefreshOrders(true);
            });
        });

        test('vtkRefreshOrders ingoia silenziosamente errori RPC senza sovrascrivere gli ordini esistenti', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_get_vtk_market_orders: async () => ({
                        data: null,
                        error: { code: 'PGRST202', message: 'Function does not exist' },
                    }),
                },
            });
            ambErr.sandbox._vtkState.orders = [{ id: 'preesistente' }];

            await ambErr.sandbox.vtkRefreshOrders(true);

            assert.equal(ambErr.sandbox._vtkState.orders.length, 1, 'non deve cancellare ordini se la RPC fallisce');
            assert.equal(ambErr.sandbox._vtkState.orders[0].id, 'preesistente');
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.vtkPlaceSellOrder — Creazione ordini di vendita', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ordine di vendita valido invoca rpc_place_vtk_sell_order e aggiorna il mercato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 200;

            await sandbox.vtkPlaceSellOrder(50, 10);

            const sellRpc = rpcLog.find(r => r.nome === 'rpc_place_vtk_sell_order');
            assert.ok(sellRpc, 'deve chiamare rpc_place_vtk_sell_order');
            assert.equal(sellRpc.args.v_vtk_amount, 50);
            assert.equal(sellRpc.args.v_dc_price, 10);

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('50 VTK → 10 DC')), 'deve mostrare notifica di successo');
            assert.equal(sandbox._vtkState.orders.length, 3, 'il nuovo ordine deve comparire tra gli ordini');
        });

        test('ordine di vendita rifiutato se la quantità VTK o il prezzo DC sono invalidi (<= 0 o NaN)', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 100;

            await sandbox.vtkPlaceSellOrder(0, 10);
            await sandbox.vtkPlaceSellOrder(50, 0);
            await sandbox.vtkPlaceSellOrder('abc', 10);
            await sandbox.vtkPlaceSellOrder(50, -5);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 0, 'nessuna RPC deve essere invocata');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('quantità e prezzo validi')));
        });

        test('ordine di vendita rifiutato se il saldo VTK è insufficiente', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 20;

            await sandbox.vtkPlaceSellOrder(50, 10);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 0, 'non deve chiamare la RPC se VTK insufficienti');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('VTK insufficienti')));
        });

        test('errore RPC durante ordine di vendita mostra notifica di errore', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_place_vtk_sell_order: async () => ({
                        data: null,
                        error: { message: 'Database lock timeout' },
                    }),
                },
            });
            ambErr.gs.vtkBalance = 100;

            await ambErr.sandbox.vtkPlaceSellOrder(50, 10);

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Ordine non riuscito')));
            ambErr.env.stopAllIntervals();
        });

        test('assenza di supabaseClient blocca silenziosamente la vendita', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.vtkBalance = 100;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await sandbox.vtkPlaceSellOrder(50, 10);
            assert.equal(rpcLog.length, 0);
        });
    });

    describe('window.vtkFillOrder — Acquisto di ordini P2P esistenti', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisto ordine valido spende DC tramite CE_money, invoca la RPC e aggiorna la UI', async () => {
            const { sandbox, gs, rpcLog, chiamateDC, env } = amb;
            gs.driverCoins = 50;

            await sandbox.vtkFillOrder('ord_1', 20);

            const fillRpc = rpcLog.find(r => r.nome === 'rpc_fill_vtk_order');
            assert.ok(fillRpc, 'deve chiamare rpc_fill_vtk_order');
            assert.equal(fillRpc.args.v_order_id, 'ord_1');

            // Verifica spesa DC autoritativa tramite ServerState
            assert.equal(chiamateDC.length, 1, 'spendDriverCoins deve essere chiamata una volta');
            assert.equal(chiamateDC[0].n, 20);
            assert.equal(chiamateDC[0].motivo, 'vtk_market_fill');
            assert.equal(gs.driverCoins, 30, 'saldo locale DC deve essere scalato');

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Acquistati 100 VTK')), 'deve notificare il successo');
        });

        test('acquisto rifiutato se il saldo DC è inferiore al costo dell ordine', async () => {
            const { sandbox, gs, rpcLog, chiamateDC, env } = amb;
            gs.driverCoins = 5;

            await sandbox.vtkFillOrder('ord_1', 20);

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_fill_vtk_order').length, 0, 'non deve chiamare RPC se DC insufficienti');
            assert.equal(chiamateDC.length, 0, 'non deve spendere DC');
            assert.equal(gs.driverCoins, 5);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('DC insufficienti')));
        });

        test('se la RPC fallisce non vengono spesi DC e viene mostrato l errore', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_fill_vtk_order: async () => ({
                        data: null,
                        error: { message: 'Ordine già acquistato da un altro utente' },
                    }),
                },
            });
            ambErr.gs.driverCoins = 50;

            await ambErr.sandbox.vtkFillOrder('ord_1', 20);

            assert.equal(ambErr.chiamateDC.length, 0, 'non deve chiamare spendDriverCoins se la RPC fallisce');
            assert.equal(ambErr.gs.driverCoins, 50, 'il saldo DC deve restare intatto');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquisto non riuscito')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.vtkCancelOrder — Annullamento dei propri ordini', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('annullamento ordine invoca rpc_cancel_vtk_order e rimuove l ordine', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox.vtkCancelOrder('ord_2');

            const cancelRpc = rpcLog.find(r => r.nome === 'rpc_cancel_vtk_order');
            assert.ok(cancelRpc, 'deve chiamare rpc_cancel_vtk_order');
            assert.equal(cancelRpc.args.v_order_id, 'ord_2');

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Ordine annullato')));
            assert.equal(sandbox._vtkState.orders.length, 1, 'l ordine annullato deve essere rimosso dalla lista');
        });

        test('errore RPC su annullamento mostra messaggio di errore', async () => {
            const ambErr = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_cancel_vtk_order: async () => ({
                        data: null,
                        error: { message: 'Ordine già eseguito' },
                    }),
                },
            });

            await ambErr.sandbox.vtkCancelOrder('ord_2');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('Annullamento non riuscito')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('window.vtkBuyShopItem — Negozio VTK (VTK Shop)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('catalogo VTK_SHOP_ITEMS contiene gli item verificati (stress reset, rifornimento, reputazione)', () => {
            const { sandbox } = amb;
            const items = vm.runInContext('VTK_SHOP_ITEMS', sandbox);

            assert.ok(Array.isArray(items), 'VTK_SHOP_ITEMS deve essere un array');
            const ids = items.map(i => i.id);
            assert.ok(ids.includes('driver_stress_reset'), 'deve includere driver_stress_reset');
            assert.ok(ids.includes('fuel_refill_full'), 'deve includere fuel_refill_full');
            assert.ok(ids.includes('rep_boost_01'), 'deve includere rep_boost_01');
        });

        test('richiesta per item non esistente viene ignorata', async () => {
            const { sandbox, rpcLog } = amb;
            await sandbox.vtkBuyShopItem('item_inesistente');
            assert.equal(rpcLog.length, 0);
        });

        test('acquisto respinto se il saldo VTK è insufficiente per l item', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 50; // servono 100 per driver_stress_reset

            // Prepariamo un driver stressato
            gs.drivers.push({ id: 'd1', name: 'Mario', stress_level: 80, burnout_until: null });

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('VTK insufficienti')));
        });

        test('acquisto driver_stress_reset: fallisce il dry-run se nessun driver è stressato (senza spendere VTK)', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            // Nessun autista oltre al ceo, oppure tutti con stress 0
            gs.drivers = [{ id: 'ceo', name: 'Tu (CEO)', stress_level: 50 }];

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0, 'dry-run deve bloccare la RPC');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessun autista stressato')));
        });

        test('acquisto driver_stress_reset: azzera lo stress e burnout del driver più stressato', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            gs.drivers.push(
                { id: 'd1', name: 'Mario', stress_level: 40, burnout_until: null },
                { id: 'd2', name: 'Luigi', stress_level: 95, burnout_until: 123456789 }
            );

            await sandbox.vtkBuyShopItem('driver_stress_reset');

            const shopRpc = rpcLog.find(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.ok(shopRpc);
            assert.equal(shopRpc.args.v_item_id, 'driver_stress_reset');

            // Verifica che il peggiore (Luigi, 95) sia stato azzerato
            const luigi = gs.drivers.find(d => d.id === 'd2');
            const mario = gs.drivers.find(d => d.id === 'd1');
            assert.equal(luigi.stress_level, 0, 'stress di Luigi deve essere 0');
            assert.equal(luigi.burnout_until, null, 'burnout di Luigi deve essere null');
            assert.equal(mario.stress_level, 40, 'stress di Mario non deve essere alterato');

            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Stress di Luigi azzerato')));
        });

        test('acquisto fuel_refill_full: rifiutato se serbatoio assente o già pieno', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;

            // Caso 1: capacità 0
            gs.fuelTankCapacity = 0;
            gs.fuelTank = 0;
            await sandbox.vtkBuyShopItem('fuel_refill_full');
            assert.ok(env.notifications.some(n => n.msg.includes('Non hai ancora un deposito carburante')));

            // Caso 2: già pieno
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 10000;
            await sandbox.vtkBuyShopItem('fuel_refill_full');
            assert.ok(env.notifications.some(n => n.msg.includes('Il deposito è già pieno')));

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
        });

        test('acquisto fuel_refill_full: riempie il serbatoio alla massima capacità', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 1500;

            await sandbox.vtkBuyShopItem('fuel_refill_full');

            const shopRpc = rpcLog.find(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.ok(shopRpc);
            assert.equal(shopRpc.args.v_item_id, 'fuel_refill_full');

            assert.equal(gs.fuelTank, 10000, 'il serbatoio deve essere pieno');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Deposito riempito')));
        });

        test('acquisto rep_boost_01: rifiutato se reputazione già al cap', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            gs.reputation = 5.0;
            gs.prestige = 0;

            await sandbox.vtkBuyShopItem('rep_boost_01');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Reputazione già al massimo')));
        });

        test('acquisto rep_boost_01: aumenta la reputazione di +0.2', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            gs.vtkBalance = 500;
            gs.reputation = 3.5;
            gs.prestige = 0;

            await sandbox.vtkBuyShopItem('rep_boost_01');

            const shopRpc = rpcLog.find(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.ok(shopRpc);
            assert.equal(shopRpc.args.v_item_id, 'rep_boost_01');

            assert.equal(gs.reputation, 3.7, 'reputazione deve salire a 3.7');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Reputazione +0.2★')));
        });

        test('quando rpc_spend_vtk_shop_item non è presente sul database (42883/PGRST202), disattiva fail-safe senza applicare effetti', async () => {
            const ambNoSql = creaAmbienteVTK({
                rpcHandlers: {
                    rpc_spend_vtk_shop_item: async () => ({
                        data: null,
                        error: { code: 'PGRST202', message: 'Could not find the function public.rpc_spend_vtk_shop_item' },
                    }),
                },
            });
            ambNoSql.gs.vtkBalance = 500;
            ambNoSql.gs.reputation = 3.0;

            await ambNoSql.sandbox.vtkBuyShopItem('rep_boost_01');

            // Nessun effetto deve essere applicato
            assert.equal(ambNoSql.gs.reputation, 3.0, 'reputazione non deve cambiare se la RPC manca sul DB');
            assert.ok(ambNoSql.env.notifications.some(n => n.type === 'warning' && n.msg.includes('VTK Shop non ancora attivo')));
            ambNoSql.env.stopAllIntervals();
        });

        test('gestione offline: avvisa il giocatore se supabaseClient è assente', async () => {
            const { sandbox, gs, env } = amb;
            gs.vtkBalance = 500;
            gs.reputation = 3.0;
            sandbox.supabaseClient = null;
            sandbox.window.supabaseClient = null;

            await sandbox.vtkBuyShopItem('rep_boost_01');

            assert.equal(gs.reputation, 3.0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Non connesso al server')));
        });
    });

    describe('UI: Modale VTK (openVTKModal e renderVTKModal)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteVTK();
            await amb.sandbox.vtkRefreshOrders(true);
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('openVTKModal crea overlay #vtk-modal e renderizza la schermata iniziale', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();

            const modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal, 'il modale #vtk-modal deve esistere nel DOM');
            assert.ok(modal.innerHTML.includes('Vettura Token'), 'deve contenere il titolo');
            assert.ok(modal.innerHTML.includes('Mercato P2P'), 'deve mostrare il tab mercato');
            assert.ok(modal.innerHTML.includes('VTK Shop'), 'deve mostrare il tab shop');
        });

        test('renderVTKModal mostra ordini propri con pulsante Annulla e ordini altrui con pulsante Acquista', async () => {
            const { sandbox, gs } = amb;
            gs.driverCoins = 50;
            gs.vtkBalance = 150;

            await sandbox.openVTKModal();

            const modal = sandbox.document.getElementById('vtk-modal');
            // Ordine proprio ord_2: venditore user_me -> deve avere vtkCancelOrder
            assert.ok(modal.innerHTML.includes('data-ce-act="vtkCancelOrder"'), 'deve includere azione di annullamento per i propri ordini');
            assert.ok(modal.innerHTML.includes('I Tuoi Ordini Attivi'));

            // Ordine altrui ord_1: venditore user_altro -> deve avere vtkFillOrder
            assert.ok(modal.innerHTML.includes('data-ce-act="vtkFillOrder"'), 'deve includere azione di acquisto per ordini altrui');
            assert.ok(modal.innerHTML.includes('Ordini Disponibili'));
        });

        test('renderVTKModal nel subTab shop mostra gli item acquistabili', async () => {
            const { sandbox } = amb;
            await sandbox.openVTKModal();

            sandbox._vtkState._subTab = 'shop';
            sandbox.renderVTKModal();

            const modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal.innerHTML.includes('Reset Stress Autista'));
            assert.ok(modal.innerHTML.includes('Rifornimento Cisterna'));
            assert.ok(modal.innerHTML.includes('Boost Reputazione'));
            assert.ok(modal.innerHTML.includes('data-ce-act="vtkBuyShopItem"'));
        });
    });

    describe('Event-delegation e ce-actions collegate al modulo VTK', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteVTK();
            await amb.sandbox.openVTKModal();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ceVtkSell legge gli input dal DOM e invoca vtkPlaceSellOrder', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.vtkBalance = 300;

            const inputAmount = sandbox.document.getElementById('vtk-sell-amount');
            const inputPrice = sandbox.document.getElementById('vtk-sell-price');
            inputAmount.value = '75';
            inputPrice.value = '15';

            sandbox.ceVtkSell();
            await new Promise(r => setImmediate(r));

            const sellRpc = rpcLog.find(r => r.nome === 'rpc_place_vtk_sell_order');
            assert.ok(sellRpc, 'ceVtkSell deve aver chiamato la RPC');
            assert.equal(sellRpc.args.v_vtk_amount, 75);
            assert.equal(sellRpc.args.v_dc_price, 15);
        });

        test('ceSetRender cambia subTab e aggiorna il rendering del modale', () => {
            const { sandbox } = amb;
            assert.equal(sandbox._vtkState._subTab, 'market');

            sandbox.ceSetRender('_vtkState', '_subTab', 'shop', 'renderVTKModal');

            assert.equal(sandbox._vtkState._subTab, 'shop');
            const modal = sandbox.document.getElementById('vtk-modal');
            assert.ok(modal.innerHTML.includes('Reset Stress Autista'), 'il DOM deve riflettere il tab shop');
        });

        test('ceRemove rimuove il modale vtk-modal dal DOM', () => {
            const { sandbox } = amb;
            assert.ok(sandbox.document.getElementById('vtk-modal'));

            sandbox.ceRemove('vtk-modal');
            assert.equal(sandbox.document.getElementById('vtk-modal'), null);
        });
    });

    describe('Integrazione: Topbar chip e ricompense Quest in VTK', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteVTK(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('updateUI aggiorna il contatore #tb-vtk nella topbar', () => {
            const { sandbox, gs } = amb;
            const chip = sandbox.document.createElement('span');
            chip.id = 'tb-vtk';
            sandbox.document.body.appendChild(chip);

            gs.vtkBalance = 1250;
            sandbox.updateUI();

            assert.equal(chip.textContent, '1.250');
        });

        test('completamento di una quest con ricompensa VTK accredita il saldo e chiama rpc_award_mission_vtk', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.vtkBalance = 0;

            // Invochiamo la logica di claim quest (quests.js)
            if (typeof sandbox.claimQuest === 'function') {
                // Prepariamo la quest q_first_driver
                gs.claimableQuests = ['q_first_driver'];
                await sandbox.claimQuest('q_first_driver');

                const awardRpc = rpcLog.find(r => r.nome === 'rpc_award_mission_vtk');
                assert.ok(awardRpc, 'claimQuest con VTK deve invocare rpc_award_mission_vtk');
                assert.ok(gs.vtkBalance > 0, 'il saldo VTK deve essere incrementato');
            }
        });
    });
});
