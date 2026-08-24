'use strict';
/* ============================================================================
   test/azioni/mercati-vtk.test.js — Banco di prova azioni mercato VTK + Turismo

   Queste azioni sono "cieche" per il guardrail (test/guardrail/azioni-
   sincronizzano.test.js): vogliono uno stato di gioco che nessuno prepara
   (ordini sul libro P2P, catalogo shop, bandi caricati, contratti attivi).
   Qui quello stato viene preparato a mano e si verifica la regola che conta
   quando si muove denaro/valuta:
     - l'importo giusto, UNA SOLA VOLTA;
     - mai uno scalamento locale diretto su gameState (il movimento vero
       arriva dal server via RPC/Realtime);
     - se la RPC ha gia' mosso il saldo lato server, il client NON si
       risincronizza (niente spendDriverCoins / accreditatoDalServer doppi).
   Si collauda anche il rifiuto: fondi insufficienti, bersaglio inesistente,
   azione ripetuta due volte.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Bando turismo di prova: requisiti azzerati cosi' i controlli client passano. */
function bandoAperto() {
    return {
        id: 'bnd_1',
        name: 'Grand Hotel Excelsior',
        icon: '✈️',
        tier: 3,
        status: 'open_bidding',
        is_mine: false,
        requirements: { req_tier: 'standard', req_vehicle_count: 0, min_reputation: 0 },
        daily_payout: 5000,
        duration_days: 14,
    };
}

/* Contratto turismo attivo di proprieta' del giocatore (per la rescissione). */
function contrattoAttivo() {
    return {
        id: 'bnd_attivo',
        name: 'Contratto in corso',
        icon: '✈️',
        tier: 3,
        status: 'active',
        is_mine: true,
        daily_payout: 4000,
    };
}

/**
 * Ambiente pulito con mock Supabase, stato di gioco minimo e spiature su
 * CE_money / spendDriverCoins per verificare CHI muove davvero il denaro.
 */
function creaAmbiente(opzioni = {}) {
    const registro = { rpc: [], speseDc: [], movimentiCash: [], penaliRep: [] };

    const env = freshEnv({
        render: true,
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                registro.speseDc.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });
    const sb = env.sandbox;
    const gs = sb.gameState;

    // Stato minimo affinche' le azioni non siano piu' "cieche"
    gs.reputation = gs.reputation ?? 3;
    gs.prestige   = gs.prestige ?? 0;
    gs.cash       = gs.cash ?? 100000;
    gs.vtkBalance = opzioni.vtkBalance ?? 0;
    gs.driverCoins = opzioni.driverCoins ?? 0;
    gs.fuelTankCapacity = gs.fuelTankCapacity ?? 200;
    gs.fuelTank   = gs.fuelTank ?? 50;
    gs.fleet      = gs.fleet || [];

    const ordini  = (opzioni.ordini || []).map(o => ({ ...o }));
    const tenders = (opzioni.tenders || []).map(t => ({ ...t }));

    const client = {
        // saveGame -> SaveSystem usa from(): stub minimo per non sporcare l'output
        from: () => ({ upsert: async () => ({ error: null }) }),
        rpc: async (nome, args) => {
            registro.rpc.push({ nome, args });
            const h = (opzioni.rpcHandlers || {})[nome];
            if (h) return h(args);

            if (nome === 'rpc_get_vtk_market_orders') return { data: ordini, error: null };
            if (nome === 'rpc_get_tourism_tenders')   return { data: tenders, error: null };

            if (nome === 'rpc_fill_vtk_order') {
                const idx = ordini.findIndex(o => o.id === args.v_order_id);
                // P0001 = raise exception intenzionale: userError mostra il messaggio solo per questo codice
                if (idx === -1) return { data: null, error: { code: 'P0001', message: 'Ordine non trovato' } };
                const o = ordini.splice(idx, 1)[0];
                return { data: { vtk_received: o.vtk_amount, dc_paid: o.dc_price }, error: null };
            }
            if (nome === 'rpc_cancel_vtk_order') {
                const idx = ordini.findIndex(o => o.id === args.v_order_id);
                if (idx === -1) return { data: null, error: { code: 'P0001', message: 'Ordine inesistente' } };
                ordini.splice(idx, 1);
                return { data: { success: true }, error: null };
            }

            if (nome === 'rpc_submit_tourism_bid')         return { data: { score: 72.4 }, error: null };
            if (nome === 'rpc_cancel_tourism_bid')          return { data: { success: true }, error: null };
            if (nome === 'rpc_terminate_tourism_contract')  return { data: { rep_penalty: 0.45 }, error: null };

            return { data: null, error: null };
        },
    };
    sb.supabaseClient = client;
    sb.window.supabaseClient = client;
    sb.currentUser = { id: 'user_player_1' };
    sb.window.currentUser = sb.currentUser;

    // Lo stato turismo del modulo parte vuoto: senza bandi caricati le azioni
    // escono in silenzio prima ancora di chiamare la RPC (ecco perche' il
    // guardrail non riusciva ad attivarle).
    if (sb._tourismState) sb._tourismState.tenders = tenders;

    // Spiatura su CE_money preservando il prototipo: registra ogni movimento
    // senza rompere gli altri metodi usati dal resto del motore.
    const ceOrig  = sb.CE_money || {};
    const ceSpy   = Object.create(Object.getPrototypeOf(ceOrig));
    Object.assign(ceSpy, ceOrig, {
        accreditatoDalServer: (...a) => registro.movimentiCash.push(['accreditatoDalServer', ...a]),
        addebitatoDalServer:  (...a) => registro.movimentiCash.push(['addebitatoDalServer', ...a]),
        addCash:              (...a) => registro.movimentiCash.push(['addCash', ...a]),
        addReputation:        (n)    => registro.penaliRep.push(n),
    });
    sb.CE_money = ceSpy;
    sb.window.CE_money = ceSpy;

    // Stub difensivi per callback che l'ambiente base potrebbe non esporre
    if (!sb.logToMap) sb.logToMap = () => {};
    if (!sb.showBigEvent) sb.showBigEvent = () => {};
    if (!sb.saveGame) sb.saveGame = () => {};
    if (!sb.showNotification && env.notifications) {
        sb.showNotification = (msg, type = 'info') => { env.notifications.push({ msg, type }); };
    }

    return { env, sb, gs, registro, ordini, tenders };
}

describe('Azioni mercato VTK — vtk-market.js (banco di prova)', () => {

    describe('vtkBuyShopItem', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente({ vtkBalance: 500 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisto valido: RPC una volta sola, effetto applicato, NESSUN risync client del saldo', async () => {
            const { sb, gs, registro, env } = amb;
            gs.fuelTank = 50;
            gs.fuelTankCapacity = 200;

            await sb.vtkBuyShopItem('fuel_refill_full');

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.equal(chiamate.length, 1, 'la RPC di spesa deve partire una volta sola');
            assert.equal(chiamate[0].args.v_item_id, 'fuel_refill_full');

            assert.equal(gs.fuelTank, 200, 'l\'effetto va applicato solo dopo la conferma server');

            // Il saldo VTK lo scala il SERVER (echo Realtime su companies):
            // il client non deve toccarlo, ne' ora ne' in nessun altro modo.
            assert.equal(gs.vtkBalance, 500, 'il client non deve scalare VTK in locale');
            assert.equal(registro.movimentiCash.length, 0, 'nessun movimento cash via CE_money');
            assert.equal(registro.speseDc.length, 0, 'nessuna spesa Driver Coins');
            assert.ok(env.notifications.some(n => n.type === 'success'));
        });

        test('fondi insufficienti: notifica errore, zero RPC, effetto non applicato', async () => {
            const { sb, gs, registro, env } = amb;
            gs.vtkBalance = 50; // costa 150
            const tankPrima = gs.fuelTank;

            await sb.vtkBuyShopItem('fuel_refill_full');

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
            assert.equal(gs.fuelTank, tankPrima, 'l\'oggetto non deve essere consegnato');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('VTK insufficienti')));
        });

        test('item inesistente: uscita silenziosa, nessuna RPC', async () => {
            const { sb, registro } = amb;

            await assert.doesNotReject(() => sb.vtkBuyShopItem('item Fantasma'));

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0);
        });

        test('doppio click durante l\'acquisto: una sola RPC, poi ri-acquistabile', async () => {
            let conteggio = 0;
            let apri;
            const gate = new Promise(r => { apri = r; });
            const ambGate = creaAmbiente({
                vtkBalance: 500,
                rpcHandlers: {
                    rpc_spend_vtk_shop_item: async () => {
                        conteggio++;
                        await gate; // tiene la prima richiesta "in volo"
                        return { data: { success: true }, error: null };
                    },
                },
            });
            ambGate.gs.reputation = 0; // rep_boost_01 ripetibile sotto il cap

            const p1 = ambGate.sb.vtkBuyShopItem('rep_boost_01');
            const p2 = ambGate.sb.vtkBuyShopItem('rep_boost_01'); // secondo click mentre la prima e' in volo
            apri();
            await Promise.all([p1, p2]);

            assert.equal(conteggio, 1, 'il secondo click deve essere ignorato');

            await ambGate.sb.vtkBuyShopItem('rep_boost_01'); // dopo il finally l\'item torna acquistabile
            assert.equal(conteggio, 2);
            assert.equal(ambGate.gs.reputation, 0.4, 'effetto applicato una volta per acquisto');
            ambGate.env.stopAllIntervals();
        });

        test('dry-run negativo (reputazione al massimo): rifiuto prima di pagare, zero RPC', async () => {
            const { sb, gs, registro, env } = amb;
            gs.reputation = 5; // cap 5.0 + prestige 0: rep_boost_01 non ha nulla da fare

            await sb.vtkBuyShopItem('rep_boost_01');

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_spend_vtk_shop_item').length, 0,
                'non si paga un oggetto che non puo\' produrre effetto');
            assert.equal(gs.reputation, 5);
            assert.equal(gs.vtkBalance, 500);
            assert.ok(env.notifications.some(n => n.type === 'info'), 'avviso informativo all\'utente');
        });
    });

    describe('vtkFillOrder', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbiente({
                driverCoins: 100,
                ordini: [
                    { id: 'ord_altrui', seller_id: 'altro_giocatore', seller_name: 'Marco', vtk_amount: 50, dc_price: 25 },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('acquisto ordine P2P: RPC una volta sola, NESSUN scalamento locale dei DC', async () => {
            const { sb, gs, registro, env } = amb;

            await sb.vtkFillOrder('ord_altrui', 25);

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_fill_vtk_order');
            assert.equal(chiamate.length, 1);
            assert.equal(chiamate[0].args.v_order_id, 'ord_altrui');

            // La RPC scala i DC sul server: il client non deve fare NE'
            // gameState.driverCoins -= NE' spendDriverCoins.
            assert.equal(gs.driverCoins, 100, 'il client non deve muovere i DC in locale');
            assert.equal(registro.speseDc.length, 0, 'niente spendDriverCoins: il saldo lo muove la RPC');
            assert.equal(registro.movimentiCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'success'));
        });

        test('DC insufficienti: blocco client-side, zero RPC', async () => {
            const { sb, gs, registro, env } = amb;
            gs.driverCoins = 10; // servono 25

            await sb.vtkFillOrder('ord_altrui', 25);

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_fill_vtk_order').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('DC insufficienti')));
        });

        test('ordine inesistente: errore RPC propagato in notifica, saldo intoccato', async () => {
            const { sb, gs, registro, env } = amb;

            await sb.vtkFillOrder('ord_fantasma', 25);

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_fill_vtk_order').length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Ordine non trovato')));
            assert.equal(gs.driverCoins, 100, 'nessun addebito se il server rifiuta');
        });
    });

    describe('vtkCancelOrder', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbiente({
                ordini: [
                    { id: 'ord_mio', seller_id: 'user_player_1', seller_name: 'Io', vtk_amount: 30, dc_price: 9 },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('annullamento valido: una sola RPC, notifica di successo', async () => {
            const { sb, registro, env } = amb;

            await sb.vtkCancelOrder('ord_mio');

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_cancel_vtk_order');
            assert.equal(chiamate.length, 1);
            assert.equal(chiamate[0].args.v_order_id, 'ord_mio');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Ordine annullato')));
        });

        test('annullamento di un ordine inesistente: errore RPC in notifica', async () => {
            const { sb, registro, env } = amb;

            await sb.vtkCancelOrder('ord_fantasma');

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_cancel_vtk_order').length, 1);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Ordine inesistente')));
        });

        test('nessun movimento di denaro: annullare non tocca saldi ne\' cash', async () => {
            const { sb, gs, registro } = amb;

            await sb.vtkCancelOrder('ord_mio');

            assert.equal(registro.movimentiCash.length, 0);
            assert.equal(registro.speseDc.length, 0);
            assert.equal(gs.driverCoins, 0);
        });
    });

    describe('vtkPlaceSellOrder', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente({ vtkBalance: 200 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('pubblicazione valida: una sola RPC con quantita\' e prezzo giusti, saldo VTK intatto in locale', async () => {
            const { sb, gs, registro, env } = amb;

            await sb.vtkPlaceSellOrder(50, 10);

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_place_vtk_sell_order');
            assert.equal(chiamate.length, 1, 'la RPC di pubblicazione deve partire una volta sola');
            assert.equal(chiamate[0].args.v_vtk_amount, 50);
            assert.equal(chiamate[0].args.v_dc_price, 10);

            // La vincola dei VTK la fa il SERVER (echo Realtime su companies): se il
            // client scalasse vtkBalance in locale l'acquisto dell'ordine diverrebbe
            // gratis al primo evento Realtime. Il test diventa rosso se qualcuno
            // reintroduce lo scalamento locale o toglie la chiamata server.
            assert.equal(gs.vtkBalance, 200, 'il client non deve muovere i VTK in locale');
            assert.equal(registro.movimentiCash.length, 0, 'nessun movimento cash via CE_money');
            assert.equal(registro.speseDc.length, 0, 'nessuna spesa Driver Coins');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Ordine di vendita')));
        });

        test('input invalidi (zero, negativo, non numerico): blocco client-side, zero RPC', async () => {
            const { sb, registro, env } = amb;

            await sb.vtkPlaceSellOrder(0, 10);
            await sb.vtkPlaceSellOrder(50, -3);
            await sb.vtkPlaceSellOrder('abc', 10);

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 0,
                'nessun ordine parte con input fasulli');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('validi')));
        });

        test('VTK insufficienti: blocco client-side, saldo e porte del denaro intoccate', async () => {
            const { sb, gs, registro, env } = amb;
            gs.vtkBalance = 20; // vuole venderne 50

            await sb.vtkPlaceSellOrder(50, 10);

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 0,
                'il guard client deve fermare la richiesta prima del server');
            assert.equal(gs.vtkBalance, 20);
            assert.equal(registro.movimentiCash.length, 0);
            assert.equal(registro.speseDc.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('VTK insufficienti')));
        });

        test('rifiuto del server: messaggio utente, nessun movimento locale di saldi', async () => {
            const ambErr = creaAmbiente({
                vtkBalance: 200,
                rpcHandlers: {
                    rpc_place_vtk_sell_order: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Saldo VTK insufficiente' },
                    }),
                },
            });

            await ambErr.sb.vtkPlaceSellOrder(50, 10);

            assert.ok(ambErr.env.notifications.some(n =>
                n.type === 'error' && n.msg.includes('Saldo VTK insufficiente')));
            assert.equal(ambErr.gs.vtkBalance, 200, 'su rifiuto il saldo locale resta com\'era');
            assert.equal(ambErr.registro.movimentiCash.length, 0);
            ambErr.env.stopAllIntervals();
        });
    });

    describe('vtkRefreshOrders', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbiente({
                ordini: [
                    { id: 'ord_libro', seller_id: 'altro_giocatore', seller_name: 'Marco', vtk_amount: 40, dc_price: 12 },
                ],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('forzata: scarica il libro ordini dal server e popola lo stato del modulo', async () => {
            const { sb, registro } = amb;

            await sb.vtkRefreshOrders(true);

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_get_vtk_market_orders');
            assert.equal(chiamate.length, 1, 'un fetch forzato = una lettura del libro');
            assert.deepEqual(sb._vtkState.orders.map(o => o.id), ['ord_libro']);
        });

        test('throttle 30s: due chiamate ravvicinate senza force = una sola lettura', async () => {
            const { sb, registro } = amb;

            await sb.vtkRefreshOrders(true);
            await sb.vtkRefreshOrders(false); // entro la finestra: ignorata
            await sb.vtkRefreshOrders(false);

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_get_vtk_market_orders').length, 1,
                'il throttle protegge il server dagli spam di refresh');
        });
    });
});

describe('Azioni bandi turismo — tourism.js (banco di prova)', () => {

    describe('tourismSubmitBid', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente({ tenders: [bandoAperto()] }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('offerta valida: RPC una volta sola con il pledge giusto, NESSUN movimento cash locale', async () => {
            const { sb, gs, registro, env } = amb;
            const cashPrima = gs.cash;
            // Flotta deterministica: 1 solo veicolo standard in servizio → qv atteso = 1
            gs.fleet = [{ id: 'veicolo_1', tier: 'standard', outOfService: false, isLease: false }];
            sb._tourismState._pledgeAmts['bnd_1'] = 50000;

            await sb.tourismSubmitBid('bnd_1');

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_submit_tourism_bid');
            assert.equal(chiamate.length, 1);
            // Campo per campo: gli args nascono nel realm del sandbox e il
            // deepStrictEqual di Node fallirebbe sui prototipi.
            assert.equal(chiamate[0].args.v_tender_id, 'bnd_1');
            assert.equal(chiamate[0].args.v_qualifying_vehicles, 1,
                'conteggio veicoli qualificanti calcolato sulla flotta');
            assert.equal(chiamate[0].args.v_pledge_cash, 50000,
                'il pledge arriva dallo slider, una volta sola');

            // Il pledge lo vincola il SERVER: il client non deve scaricare nulla.
            assert.equal(gs.cash, cashPrima, 'il client non deve toccare cash in locale');
            assert.equal(registro.movimentiCash.length, 0);
            assert.equal(registro.speseDc.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('72.4')));
        });

        test('bando inesistente: uscita silenziosa, nessuna RPC', async () => {
            const { sb, registro } = amb;

            await assert.doesNotReject(() => sb.tourismSubmitBid('bnd_fantasma'));

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_submit_tourism_bid').length, 0);
        });

        test('rifiuto del server: messaggio di errore con la causa', async () => {
            const ambErr = creaAmbiente({
                tenders: [bandoAperto()],
                rpcHandlers: {
                    rpc_submit_tourism_bid: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Pledge superiore al cash disponibile' },
                    }),
                },
            });

            const cashPrima = ambErr.gs.cash;

            await ambErr.sb.tourismSubmitBid('bnd_1');

            assert.ok(ambErr.env.notifications.some(n =>
                n.type === 'error' && n.msg.includes('Pledge superiore al cash disponibile')));
            assert.equal(ambErr.gs.cash, cashPrima, 'nessun movimento locale su rifiuto');
            ambErr.env.stopAllIntervals();
        });

        test('utente non loggato: blocco immediato senza RPC', async () => {
            const { sb, registro, env } = amb;
            sb.currentUser = null;
            sb.window.currentUser = null;

            await sb.tourismSubmitBid('bnd_1');

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_submit_tourism_bid').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('loggato')));
        });
    });

    describe('tourismCancelBid', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente({ tenders: [bandoAperto()] }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('ritiro valido: una sola RPC, notifica informativa', async () => {
            const { sb, registro, env } = amb;

            await sb.tourismCancelBid('bnd_1');

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_cancel_tourism_bid');
            assert.equal(chiamate.length, 1);
            assert.equal(chiamate[0].args.v_tender_id, 'bnd_1');
            assert.ok(env.notifications.some(n => n.msg.includes('Offerta annullata')));
        });

        test('rifiuto del server: errore in notifica', async () => {
            const ambErr = creaAmbiente({
                tenders: [bandoAperto()],
                rpcHandlers: {
                    rpc_cancel_tourism_bid: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Nessuna offerta da ritirare' },
                    }),
                },
            });

            await ambErr.sb.tourismCancelBid('bnd_1');

            assert.ok(ambErr.env.notifications.some(n =>
                n.type === 'error' && n.msg.includes('Nessuna offerta da ritirare')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('tourismTerminate', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente({ tenders: [contrattoAttivo()] }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('rescissione confermata con server pronto: RPC una volta sola, penale GIA\' applicata dal server', async () => {
            const { sb, registro } = amb;
            const eventiGrandi = [];
            sb.showBigEvent = (...a) => eventiGrandi.push(a);
            sb.ServerState = { isReady: () => true };
            sb.window.ServerState = sb.ServerState;
            sb.confirm = () => true;

            await sb.tourismTerminate('bnd_attivo');

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_terminate_tourism_contract');
            assert.equal(chiamate.length, 1);
            assert.equal(chiamate[0].args.v_tender_id, 'bnd_attivo');

            // Il server ha gia' mosso la penale reputazione: il client non la riapplica.
            assert.equal(registro.penaliRep.length, 0,
                'con server pronto la penale NON va riapplicata via CE_money');
            assert.equal(eventiGrandi.length, 1,
                'il feedback all\'utente passa da showBigEvent (non c\'e\' showNotification in successo)');
        });

        test('rescissione annullata al prompt di conferma: nessuna RPC', async () => {
            const { sb, registro } = amb;
            sb.ServerState = { isReady: () => true };
            sb.window.ServerState = sb.ServerState;
            sb.confirm = () => false;

            await sb.tourismTerminate('bnd_attivo');

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_terminate_tourism_contract').length, 0);
        });

        test('server NON pronto: la penale reputazione passa da CE_money.addReputation, mai dal cash', async () => {
            const { sb, gs, registro } = amb;
            sb.ServerState = { isReady: () => false };
            sb.window.ServerState = sb.ServerState;
            sb.confirm = () => true;

            const cashPrima = gs.cash;

            await sb.tourismTerminate('bnd_attivo');

            assert.deepEqual(registro.penaliRep, [-0.45],
                'penale applicata una volta sola via CE_money.addReputation');
            assert.equal(registro.movimentiCash.length, 0, 'nessun movimento di cash');
            assert.equal(gs.cash, cashPrima, 'la penale reputazione non deve toccare il cash');
        });

        test('rifiuto del server: errore in notifica, nessuna penale applicata', async () => {
            const ambErr = creaAmbiente({
                tenders: [contrattoAttivo()],
                rpcHandlers: {
                    rpc_terminate_tourism_contract: async () => ({
                        data: null,
                        error: { code: 'P0001', message: 'Contratto non attivo' },
                    }),
                },
            });
            ambErr.sb.ServerState = { isReady: () => true };
            ambErr.sb.window.ServerState = ambErr.sb.ServerState;
            ambErr.sb.confirm = () => true;

            await ambErr.sb.tourismTerminate('bnd_attivo');

            assert.ok(ambErr.env.notifications.some(n =>
                n.type === 'error' && n.msg.includes('Contratto non attivo')));
            assert.equal(ambErr.registro.penaliRep.length, 0, 'nessuna penale se il server rifiuta');
            ambErr.env.stopAllIntervals();
        });
    });
});
