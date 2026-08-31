'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/p2p — mercato auto tra giocatori + sindacato (p2p-market.js, p2p-render.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 31.

   · buyP2PCar(listingId)  — compra un'auto messa in vendita da un altro
     giocatore: valida login / inserzione / non è la mia / fondi, poi
     `rpc_buy_market_car`. Su successo: addebito dal server + auto in garage.
   · hireCrumiri()          — `rpc_hire_crumiri`: aggiorna rischio GdF e boost.
   · payDonCarmine()        — costa €50.000 (controllo fondi in locale), poi
     `rpc_pay_don_carmine`: addebito dal server, rischio GdF azzerato.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/p2p — buyP2PCar', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 200000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.renderTabMarket = () => {};
        w.updateUI = () => {};
        w.p2pFetchMarket = async () => {};
        w._p2pMarket.listings = [{ id: 'lst1', seller_user_id: 'altro', ask_price: 80000, name: 'Berlina Usata' }];
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const errori   = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);

    test('buyP2PCar: inserzione valida → RPC con il listing, addebito dal server, auto in garage', async () => {
        server.rispondiCon('rpc_buy_market_car', () => ({
            data: { price_paid: 80000, fee: 4000, seller_name: 'Mario', car: { name: 'Berlina Usata', tier: 'standard' } },
            error: null,
        }));
        const cassaPrima = gs().cash;
        const nAuto = gs().fleet.length;

        await w.buyP2PCar('lst1');

        const c = chiamata('rpc_buy_market_car');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.v_listing_id, 'lst1');
        assert.equal(gs().cash, cassaPrima - 80000, 'l\'addebito dal server non è avvenuto');
        assert.equal(gs().fleet.length, nAuto + 1, 'l\'auto non è entrata in garage');
    });

    test('buyP2PCar: fondi insufficienti → errore, niente server', async () => {
        R.conSoldi(env, 10000);
        await w.buyP2PCar('lst1');
        assert.equal(chiamata('rpc_buy_market_car'), undefined);
        assert.ok(errori().some(m => /[Ff]ondi insufficienti/.test(m)));
    });

    test('buyP2PCar: inserzione mia → si ferma senza chiamare il server', async () => {
        w._p2pMarket.listings[0].seller_user_id = server.id;
        await w.buyP2PCar('lst1');
        assert.equal(chiamata('rpc_buy_market_car'), undefined);
    });

    test('buyP2PCar: il server rifiuta → errore, nessun addebito, nessuna auto', async () => {
        server.rispondiCon('rpc_buy_market_car', () => ({ data: null, error: { message: 'venduta' } }));
        const cassaPrima = gs().cash;
        const nAuto = gs().fleet.length;

        await w.buyP2PCar('lst1');

        assert.equal(gs().cash, cassaPrima, 'ha addebitato su un acquisto fallito');
        assert.equal(gs().fleet.length, nAuto, 'ha aggiunto un\'auto su un acquisto fallito');
        assert.ok(errori().length > 0);
    });
});

describe('sistemi/p2p — sindacato', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 200000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.renderTabInvestments = () => {};
        w.updateUI = () => {};
        w._sindacatoState.gdfRisk = 40;
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);

    test('hireCrumiri: RPC ok → aggiorna rischio GdF e boost dal server', async () => {
        server.rispondiCon('rpc_hire_crumiri', () => ({ data: { risk_level: 55, crumiri_boost_until: 'poi' }, error: null }));

        await w.hireCrumiri();

        assert.ok(chiamata('rpc_hire_crumiri'), 'il server non è stato chiamato');
        assert.equal(w._sindacatoState.gdfRisk, 55, 'il rischio GdF non è stato aggiornato');
        assert.equal(w._sindacatoState.crumiriBoostUntil, 'poi');
    });

    test('payDonCarmine: con i fondi → addebito dal server e rischio GdF a zero', async () => {
        server.rispondiCon('rpc_pay_don_carmine', () => ({ data: { immunity_until: 'domani' }, error: null }));
        const cassaPrima = gs().cash;

        await w.payDonCarmine();

        assert.ok(chiamata('rpc_pay_don_carmine'));
        assert.equal(gs().cash, cassaPrima - 50000, 'i €50.000 non sono stati addebitati dal server');
        assert.equal(w._sindacatoState.gdfRisk, 0, 'il rischio GdF non è stato azzerato');
    });

    test('payDonCarmine: senza i €50.000 → errore, niente server, cassa intatta', async () => {
        R.conSoldi(env, 10000);
        const cassaPrima = gs().cash;

        await w.payDonCarmine();

        assert.equal(chiamata('rpc_pay_don_carmine'), undefined, 'ha chiamato il server senza fondi');
        assert.equal(gs().cash, cassaPrima);
    });
});
