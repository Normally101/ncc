'use strict';
/* ============================================================================
   test/funzioni/vtk-botti-modale.test.js — Il buco dei bottoni VTK

   I banchi gia' presenti (funzioni/vtk.test.js, azioni/mercati-vtk.test.js,
   economy/vtk-sync.test.js) chiamano le funzioni window.* DI vtk-market.js
   direttamente. Nessuno pero' CLICCA i veri bottoni renderizzati nella modale:
   se un ceAct('...', [...args]) nel template perde un argomento o cambia nome,
   l'azione muore in silenzio e nessun test diventa rosso.

   Qui si cliccano i tre bottoni mai premuti dai test:
     - "📤 Pubblica Ordine di Vendita"  (ceVtkSell      → vtkPlaceSellOrder)
     - "Acquista" su ordine P2P altrui  (vtkFillOrder)
     - "Acquista" nello shop            (vtkBuyShopItem)
   e si verifica la regola del denaro: il movimento parte SOLO dalla RPC
   (rpc_place_vtk_sell_order / rpc_fill_vtk_order / rpc_spend_vtk_shop_item);
   togliere quella chiamata dal codice deve rendere ROSSO questo banco.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function creaAmbiente(opzioni = {}) {
    const registro = { rpc: [], speseDc: [], logMap: [] };
    const ordini = (opzioni.ordini || [
        { id: 'ord_altrui', seller_id: 'altro_giocatore', seller_name: 'Marco', vtk_amount: 50, dc_price: 25 },
    ]).map(o => ({ ...o }));

    const env = freshEnv({
        render: true,
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                registro.speseDc.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
        },
    });
    const sb = env.sandbox;
    const gs = sb.gameState;

    const client = {
        from: () => ({ upsert: async () => ({ error: null }) }),
        rpc: async (nome, args) => {
            registro.rpc.push({ nome, args });
            if (nome === 'rpc_get_vtk_market_orders') return { data: ordini, error: null };
            if (nome === 'rpc_fill_vtk_order') {
                const idx = ordini.findIndex(o => o.id === args.v_order_id);
                if (idx === -1) return { data: null, error: { code: 'P0001', message: 'Ordine non trovato' } };
                const o = ordini.splice(idx, 1)[0];
                // Il SERVER scala i DC e accredita i VTK (21_vtk_token.sql): qui li muove
                // il finto server cosi' come farebbe l'eco Realtime sul client reale.
                gs.driverCoins -= o.dc_price;
                gs.vtkBalance = (gs.vtkBalance || 0) + o.vtk_amount;
                return { data: { vtk_received: o.vtk_amount, dc_paid: o.dc_price }, error: null };
            }
            return { data: { success: true, ...(args || {}) }, error: null };
        },
    };
    sb.supabaseClient = client;
    sb.window.supabaseClient = client;
    sb.currentUser = { id: 'user_player_1' };
    sb.window.currentUser = sb.currentUser;

    sb.logToMap = (msg) => registro.logMap.push(msg);
    sb.saveGame = () => {};

    return { env, sb, gs, registro, ordini };
}

describe('VTK — i bottoni della modale cliccati davvero (vtk-market.js)', () => {

    describe('bottone "Pubblica Ordine di Vendita" (ceVtkSell)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('il click pubblica l\'ordine coi valori degli input: RPC giusta, una volta sola', async () => {
            const { sb, gs, registro } = amb;
            gs.vtkBalance = 100;

            await sb.openVTKModal();
            const modal = sb.document.getElementById('vtk-modal');
            sb.document.getElementById('vtk-sell-amount').value = '30';
            sb.document.getElementById('vtk-sell-price').value = '8';

            const bottone = modal.querySelector('button[data-ce-act="ceVtkSell"]');
            assert.ok(bottone, 'il bottone di pubblicazione deve esistere nella modale renderizzata');
            bottone.click();
            await new Promise(r => setImmediate(r));
            await new Promise(r => setImmediate(r));

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_place_vtk_sell_order');
            assert.equal(chiamate.length, 1, 'una sola RPC per un solo click');
            assert.equal(chiamate[0].args.v_vtk_amount, 30, 'la quantita\' arriva dall\'input DOM');
            assert.equal(chiamate[0].args.v_dc_price, 8, 'il prezzo arriva dall\'input DOM');
        });

        test('via bottone il client NON scala i VTK in locale: l\'escrow lo fa il server', async () => {
            const { sb, gs, registro } = amb;
            gs.vtkBalance = 100;

            await sb.openVTKModal();
            const bottone = sb.document.querySelector('button[data-ce-act="ceVtkSell"]');
            bottone.click();
            await new Promise(r => setImmediate(r));
            await new Promise(r => setImmediate(r));

            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_place_vtk_sell_order').length, 1,
                'la sincronizzazione col server DEVE essere partita: togliendo la RPC dal codice questo test diventa rosso');
            assert.equal(gs.vtkBalance, 100,
                'il client non deve detrarre i VTK in vendita: il saldo lo riscrive il server');
            assert.equal(registro.speseDc.length, 0, 'vendere VTK non tocca i Driver Coins');
        });
    });

    describe('bottone "Acquista" su ordine P2P altrui (vtkFillOrder)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbiente({
                ordini: [{ id: 'ord_altrui', seller_id: 'altro_giocatore', seller_name: 'Marco', vtk_amount: 50, dc_price: 25 }],
            });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('il click acquista l\'ordine: RPC una volta sola, DC mossi SOLO dal finto server', async () => {
            const { sb, gs, registro } = amb;
            gs.driverCoins = 100;
            gs.vtkBalance = 0;

            await sb.openVTKModal();
            const bottone = sb.document.querySelector('button[data-ce-act="vtkFillOrder"]');
            assert.ok(bottone, 'il bottone Acquista dell\'ordine altrui deve esistere');
            bottone.click();
            await new Promise(r => setImmediate(r));
            await new Promise(r => setImmediate(r));

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_fill_vtk_order');
            assert.equal(chiamate.length, 1, 'una sola RPC: togliere la chiamata rpc_fill_vtk_order dal codice rende ROSSO questo test');
            assert.equal(chiamate[0].args.v_order_id, 'ord_altrui', 'l\'id ordine arriva dagli args del bottone');

            // Il finto server ha mosso -25: il client NON deve aver mosso nient'altro.
            assert.equal(gs.driverCoins, 75, 'i DC scendono SOLO dell\'eco server, una volta sola');
            assert.equal(gs.vtkBalance, 50, 'i VTK arrivano SOLO dall\'eco server');
            assert.equal(registro.speseDc.length, 0, 'niente spendDriverCoins: sarebbe un doppio addebito');
        });

        test('con DC insufficienti il bottone e\' disabilitato: il click non puo\' partire', async () => {
            const { sb, gs, registro } = amb;
            gs.driverCoins = 10; // servono 25

            await sb.openVTKModal();
            const bottone = sb.document.querySelector('button[data-ce-act="vtkFillOrder"]');
            assert.ok(bottone, 'il bottone esiste anche senza fondi');
            assert.equal(bottone.disabled, true, 'deve essere disabilitato con DC insufficienti');

            bottone.click();
            await new Promise(r => setImmediate(r));
            assert.equal(registro.rpc.filter(r => r.nome === 'rpc_fill_vtk_order').length, 0,
                'un bottone disabilitato non deve produrre RPC');
        });
    });

    describe('bottone "Acquista" dello shop (vtkBuyShopItem)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('il click compra fuel_refill_full: RPC una volta sola, effetto DOPO il server, audit su logToMap', async () => {
            const { sb, gs, registro } = amb;
            gs.vtkBalance = 500;
            gs.fuelTank = 50;
            gs.fuelTankCapacity = 200;

            await sb.openVTKModal();
            sb.ceSetRender('_vtkState', '_subTab', 'shop', 'renderVTKModal');

            const bottone = sb.document.querySelector('button[data-ce-act="vtkBuyShopItem"][data-ce-args*="fuel_refill_full"]')
                || sb.document.querySelectorAll('button[data-ce-act="vtkBuyShopItem"]')[1];
            assert.ok(bottone, 'il bottone Acquista dello shop deve esistere');
            bottone.click();
            await new Promise(r => setImmediate(r));
            await new Promise(r => setImmediate(r));

            const chiamate = registro.rpc.filter(r => r.nome === 'rpc_spend_vtk_shop_item');
            assert.equal(chiamate.length, 1, 'una sola RPC: togliere rpc_spend_vtk_shop_item dal codice rende ROSSO questo test');
            assert.equal(gs.fuelTank, 200, 'la cisterna si riempie solo dopo la conferma server');
            assert.equal(gs.vtkBalance, 500, 'il client non scala i VTK in locale: li scala il server');
            assert.ok(registro.logMap.some(m => m.includes('Deposito riempito')),
                'l\'acquisto riuscito lascia traccia di audit su logToMap');
        });
    });

    describe('ciclo di vita della modale', () => {
        let amb;
        beforeEach(() => { amb = creaAmbiente(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('aprire la modale due volte NON duplica l\'overlay', async () => {
            const { sb } = amb;
            await sb.openVTKModal();
            await sb.openVTKModal();

            assert.equal(sb.document.querySelectorAll('#vtk-modal').length, 1,
                'openVTKModal deve rimuovere il modale preesistente prima di ricrearlo');
        });

        test('renderVTKModal senza modale aperta e\' un no-op sicuro', () => {
            const { sb } = amb;
            assert.doesNotThrow(() => sb.renderVTKModal());
            assert.equal(sb.document.getElementById('vtk-modal'), null);
        });
    });
});
