'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/vtk-market — il mercato dei VTK e il VTK Shop (vtk-market.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 17. Quattro azioni:

   · `vtkFillOrder(orderId, dcCost)` — compra VTK pagando in DC. Controlla i DC in
     locale, poi `rpc_fill_vtk_order`.
   · `vtkCancelOrder(orderId)`      — `rpc_cancel_vtk_order`.
   · `vtkBuyShopItem(itemId)`       — server-authoritative con degrado sicuro: se
     `rpc_spend_vtk_shop_item` non esiste ancora sul DB, RIFIUTA l'acquisto senza
     scalare VTK (niente oggetto regalato). Guardia anti doppio-click in-flight,
     e dry-run dell'effetto prima di pagare.
   · `openVTKModal()`              — costruisce l'overlay del mercato.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/vtk-market', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.renderVTKModal = () => {};
        w.gameState.driverCoins = 300;
        w.gameState.vtkBalance = 500;
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);
    const errori   = () => avvisi.filter(a => a.t === 'error').map(a => a.m);

    test('vtkFillOrder: DC insufficienti → errore, niente server', async () => {
        gs().driverCoins = 5;
        await w.vtkFillOrder('ord-1', 100);
        assert.equal(chiamata('rpc_fill_vtk_order'), undefined);
        assert.ok(errori().some(m => /DC insufficienti/i.test(m)));
    });

    test('vtkFillOrder: DC ok → RPC con l\'ordine giusto', async () => {
        server.rispondiCon('rpc_fill_vtk_order', () => ({ data: { vtk_received: 50 }, error: null }));
        await w.vtkFillOrder('ord-1', 100);
        const c = chiamata('rpc_fill_vtk_order');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.v_order_id, 'ord-1');
        assert.ok(avvisi.some(a => a.t === 'success' && /VTK/.test(a.m)));
    });

    test('vtkFillOrder: il server rifiuta → errore mostrato', async () => {
        server.rispondiCon('rpc_fill_vtk_order', () => ({ data: null, error: { message: 'ordine sparito' } }));
        await w.vtkFillOrder('ord-1', 100);
        assert.ok(errori().some(m => /non riuscito/i.test(m)));
    });

    test('vtkCancelOrder: RPC con l\'ordine giusto; il server rifiuta → errore', async () => {
        server.rispondiCon('rpc_cancel_vtk_order', () => ({ data: null, error: null }));
        await w.vtkCancelOrder('ord-9');
        assert.equal(chiamata('rpc_cancel_vtk_order').args.v_order_id, 'ord-9');

        server.rispondiCon('rpc_cancel_vtk_order', () => ({ data: null, error: { message: 'no' } }));
        await w.vtkCancelOrder('ord-9');
        assert.ok(errori().some(m => /non riuscito/i.test(m)));
    });

    describe('vtkBuyShopItem', () => {
        const item = () => (R.catalogo(env, 'VTK_SHOP_ITEMS') || [])[0];   // driver_stress_reset, 100 VTK

        test('VTK insufficienti → errore, niente server', async () => {
            gs().vtkBalance = 10;
            gs().drivers.push({ id: 'd1', name: 'Teso', stress_level: 80 });
            await w.vtkBuyShopItem(item().id);
            assert.equal(chiamata('rpc_spend_vtk_shop_item'), undefined);
            assert.ok(errori().some(m => /VTK insufficienti/i.test(m)));
        });

        test('l\'effetto non ha nulla su cui agire (dry-run ko) → nessun acquisto', async () => {
            // nessun autista stressato: driver_stress_reset non ha bersaglio
            await w.vtkBuyShopItem(item().id);
            assert.equal(chiamata('rpc_spend_vtk_shop_item'), undefined);
        });

        test('la RPC non esiste ancora sul server → nessun VTK scalato, avviso onesto', async () => {
            gs().drivers.push({ id: 'd1', name: 'Teso', stress_level: 80, burnout_until: 5 });
            server.rispondiCon('rpc_spend_vtk_shop_item',
                () => ({ data: null, error: { code: 'PGRST202', message: 'could not find the function' } }));
            const vtkPrima = gs().vtkBalance;

            await w.vtkBuyShopItem(item().id);

            assert.ok(chiamata('rpc_spend_vtk_shop_item'), 'doveva provare la RPC');
            assert.equal(gs().vtkBalance, vtkPrima, 'un VTK è stato scalato pur senza RPC');
            assert.ok(avvisi.some(a => /non ancora attivo/i.test(a.m)));
        });

        test('acquisto riuscito: la RPC scala, e l\'effetto viene applicato', async () => {
            const d = { id: 'd1', name: 'Teso', stress_level: 80, burnout_until: 5 };
            gs().drivers.push(d);
            server.rispondiCon('rpc_spend_vtk_shop_item', () => ({ data: { ok: true }, error: null }));

            await w.vtkBuyShopItem(item().id);

            assert.ok(chiamata('rpc_spend_vtk_shop_item'));
            assert.equal(d.stress_level, 0, 'l\'effetto dell\'oggetto non è stato applicato');
        });
    });

});

// open*Modal è stub no-op nell'env di default: serve il rendering vero.
describe('sistemi/vtk-market — openVTKModal (render vero)', () => {
    let env;
    beforeEach(() => {
        env = freshEnv({ render: true });
        R.conSchermo(env);
        R.conGiocatoreCollegato(env);
        env.sandbox.window.showNotification = () => {};
        env.sandbox.window.renderVTKModal = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    test('openVTKModal costruisce l\'overlay #vtk-modal nel DOM', async () => {
        await env.sandbox.window.openVTKModal();
        assert.ok(env.sandbox.document.getElementById('vtk-modal'), 'l\'overlay del mercato non è comparso');
    });
});
