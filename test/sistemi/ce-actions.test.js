'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/ce-actions — gli adattatori dell'event-delegation (ce-actions.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 11. Trenta funzioni-ponte: leggono un
   valore dal DOM al momento del click (o usano `this`/`ev`) e inoltrano alla
   vera funzione di gioco. Non hanno logica propria — il difetto che possono
   nascondere è inoltrare il valore SBAGLIATO, o dall'elemento sbagliato, o non
   inoltrare affatto. Per ognuna: preparo l'input che legge, spio la funzione di
   destinazione, e pretendo che riceva quello che c'è scritto nel DOM.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/ce-actions', () => {
    let env, w, doc;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        doc = env.sandbox.document;
    });
    afterEach(() => env.stopAllIntervals());

    // registra le chiamate a w[name]
    function spia(nome) {
        const chiamate = [];
        w[nome] = function (...args) { chiamate.push({ args, this: this }); };
        return chiamate;
    }
    function input(id, value) {
        const el = doc.createElement('input');
        el.id = id; el.value = String(value);
        doc.body.appendChild(el);
        return el;
    }

    // ── contratti / bid ─────────────────────────────────────────────────────

    test('cePlaceBid legge il pledge dall\'input accanto e lo passa a CE_placeBid', () => {
        input('pledge-t7', '15000');
        const c = spia('CE_placeBid');
        w.cePlaceBid('t7');
        assert.deepEqual(c[0].args, ['t7', '15000']);
    });

    test('ceBidPreview passa this.value a CE_updateBidPreview', () => {
        const c = spia('CE_updateBidPreview');
        w.ceBidPreview.call({ value: '9000' }, 't7');
        assert.deepEqual(c[0].args, ['t7', '9000']);
    });

    // ── crypto ──────────────────────────────────────────────────────────────

    test('ceCryptoTrade instrada su cryptoBuy o cryptoSell secondo il lato', () => {
        input('amt', '3');
        const buy = spia('cryptoBuy'); const sell = spia('cryptoSell');
        w.ceCryptoTrade('buy', 'btc', 'amt');
        w.ceCryptoTrade('sell', 'btc', 'amt');
        assert.deepEqual(buy[0].args, ['btc', '3']);
        assert.deepEqual(sell[0].args, ['btc', '3']);
    });

    test('ceCryptoDeposit / ceCryptoWithdraw leggono l\'importo dall\'input indicato', () => {
        input('dep', '5000'); input('wd', '2500');
        const dep = spia('cryptoDepositOffshore'); const wd = spia('cryptoWithdrawOffshore');
        w.ceCryptoDeposit('CH', 'dep');
        w.ceCryptoWithdraw('CH', 'wd');
        assert.deepEqual(dep[0].args, ['CH', '5000']);
        assert.deepEqual(wd[0].args, ['CH', '2500']);
    });

    test('ceCryptoPreview passa this.value a _cryptoUpdatePreview', () => {
        const c = spia('_cryptoUpdatePreview');
        w.ceCryptoPreview.call({ value: '1.5' }, 'btc', 'buy');
        assert.deepEqual(c[0].args, ['btc', 'buy', '1.5']);
    });

    // ── holding / consorzio ────────────────────────────────────────────────

    test('ceHoldingContribute / ceConsorzioContribute leggono l\'importo come intero', () => {
        input('hld-contrib-amt', '12000'); input('cso-contrib-amt', '8000');
        const h = spia('contributeHoldingTreasury'); const cs = spia('contributeConsorzio');
        w.ceHoldingContribute('h1');
        w.ceConsorzioContribute('c1');
        assert.deepEqual(h[0].args, ['h1', 12000]);
        assert.deepEqual(cs[0].args, ['c1', 8000]);
    });

    test('ceCreateHolding / ceCreateConsorzio passano nome e descrizione dai campi', () => {
        input('hld-name', 'Alfa'); input('hld-desc', 'desc h');
        input('cso-name', 'Beta'); input('cso-desc', 'desc c');
        const h = spia('createHolding'); const cs = spia('createConsorzio');
        w.ceCreateHolding();
        w.ceCreateConsorzio();
        assert.deepEqual(h[0].args, ['Alfa', 'desc h']);
        assert.deepEqual(cs[0].args, ['Beta', 'desc c']);
    });

    // ── finanza ────────────────────────────────────────────────────────────

    test('ceStockAction legge la quantità e chiama la funzione nominata (buyStocks/sellStocks)', () => {
        input('stock-qty-AAPL', '7');
        const c = spia('buyStocks');
        w.ceStockAction('buyStocks', 'AAPL');
        assert.deepEqual(c[0].args, ['AAPL', 7]);
    });

    test('cePlaceBroker passa capitale + rischio + durata correnti a placeBrokerInvestment', () => {
        input('broker-capital', '40000');
        w._brokerRisk = 'high'; w._brokerDur = 12;
        const c = spia('placeBrokerInvestment');
        w.cePlaceBroker();
        assert.deepEqual(c[0].args, ['40000', 'high', 12]);
    });

    // ── politica / lobby ───────────────────────────────────────────────────

    test('ceDonateLobby legge l\'importo da lobby-donate-amt', () => {
        input('lobby-donate-amt', '3000');
        const c = spia('donateToLobby');
        w.ceDonateLobby();
        assert.deepEqual(c[0].args, ['3000']);
    });

    test('ceVoteDecree passa id decreto e voto letto dall\'input', () => {
        input('vote-d1', '25');
        const c = spia('voteServerDecree');
        w.ceVoteDecree('d1', 'vote-d1');
        assert.deepEqual(c[0].args, ['d1', '25']);
    });

    test('ceAttackTerritory legge la regione dal select', () => {
        input('attack-region-select', 'lazio');
        const c = spia('attackTerritory');
        w.ceAttackTerritory();
        assert.deepEqual(c[0].args, ['lazio']);
    });

    // ── VTK ────────────────────────────────────────────────────────────────

    test('ceVtkSell passa quantità e prezzo dai due campi', () => {
        input('vtk-sell-amount', '100'); input('vtk-sell-price', '2.5');
        const c = spia('vtkPlaceSellOrder');
        w.ceVtkSell();
        assert.deepEqual(c[0].args, ['100', '2.5']);
    });

    // ── mercato auto ───────────────────────────────────────────────────────

    test('ceListCar mette in vendita e poi chiude i modali', () => {
        const list = spia('listCarForSale'); const close = spia('closeModals');
        w.ceListCar('car9', 45000);
        assert.deepEqual(list[0].args, ['car9', 45000]);
        assert.equal(close.length, 1, 'i modali non sono stati chiusi');
    });

    test('ceListCarP2P legge il prezzo dal campo p2p-price-<id>', () => {
        input('p2p-price-car9', '60000');
        const c = spia('p2pListCarForSale');
        w.ceListCarP2P('car9');
        assert.deepEqual(c[0].args, ['car9', '60000']);
    });

    test('ceSetAvatar passa id e l\'elemento (this) a setDriverAvatar', () => {
        const c = spia('setDriverAvatar');
        const fakeEl = { tag: 'input' };
        w.ceSetAvatar.call(fakeEl, 'drv3');
        assert.equal(c[0].args[0], 'drv3');
        assert.equal(c[0].args[1], fakeEl);
    });

    // ── HQ / accademia / carriera ──────────────────────────────────────────

    test('ceHqBuildConfirm rimuove il modal e chiama hqUpgradeRoom (con o senza slot)', () => {
        const m = doc.createElement('div'); m.id = 'hqm'; doc.body.appendChild(m);
        const c = spia('hqUpgradeRoom');
        w.ceHqBuildConfirm('hqm', 'roma', 'lounge', 2);
        assert.equal(doc.getElementById('hqm'), null, 'il modal doveva sparire');
        assert.deepEqual(c[0].args, ['roma', 'lounge', 2]);
    });

    test('ceStartAcademy avvia il corso e riapre il modal accademia', () => {
        const start = spia('startAcademyCourse'); const open = spia('openAcademyModal');
        w.ceStartAcademy('drv1', 'corso-x');
        assert.deepEqual(start[0].args, ['drv1', 'corso-x']);
        assert.equal(open.length, 1);
    });

    test('ceCareerCta rimuove l\'overlay carriera e passa alla tab richiesta', () => {
        const o = doc.createElement('div'); o.id = 'career-modal-overlay'; doc.body.appendChild(o);
        const c = spia('switchTab');
        w.ceCareerCta('finance');
        assert.equal(doc.getElementById('career-modal-overlay'), null);
        assert.deepEqual(c[0].args, ['finance']);
    });

    // ── varie con this / ev ────────────────────────────────────────────────

    test('ceToggleFa alterna il display del figlio .fa', () => {
        const box = doc.createElement('div');
        const fa = doc.createElement('div'); fa.className = 'fa'; fa.style.display = 'none';
        box.appendChild(fa);
        w.ceToggleFa.call(box);
        assert.equal(fa.style.display, 'block');
        w.ceToggleFa.call(box);
        assert.equal(fa.style.display, 'none');
    });

    test('ceForgotPassword previene il submit e chiama _authForgotPassword', () => {
        const c = spia('_authForgotPassword');
        let prevented = false;
        w.ceForgotPassword({ preventDefault: () => { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(c.length, 1);
    });

    test('ceTargaPresidenziale: usa _ecTargaPresidenziale se c\'è, altrimenti va allo store', () => {
        const ec = spia('_ecTargaPresidenziale');
        w.ceTargaPresidenziale();
        assert.equal(ec.length, 1);

        delete w._ecTargaPresidenziale;
        const sw = spia('switchTab');
        w.ceTargaPresidenziale();
        assert.deepEqual(sw[0].args, ['store']);
    });

    test('ceSetBrandColor memorizza il colore e attiva il bottone premuto', () => {
        const b1 = doc.createElement('button'); b1.className = 'brand-color-btn active';
        const b2 = doc.createElement('button'); b2.className = 'brand-color-btn';
        doc.body.append(b1, b2);
        w.ceSetBrandColor.call(b2, '#ff0000');
        assert.equal(w._selectedColorSS, '#ff0000');
        assert.equal(b2.classList.contains('active'), true);
        assert.equal(b1.classList.contains('active'), false, 'l\'altro bottone doveva disattivarsi');
    });

    test('ceMarkupPreview scrive la percentuale nella label markup-val-<id>', () => {
        const lbl = doc.createElement('span'); lbl.id = 'markup-val-p1'; doc.body.appendChild(lbl);
        w.ceMarkupPreview.call({ value: '17' }, 'p1');
        assert.equal(lbl.textContent, '17%');
    });

    test('ceTPledge inoltra this.value a _tSetPledge', () => {
        const c = spia('_tSetPledge');
        w.ceTPledge.call({ value: '90000' }, 'bando-1');
        assert.deepEqual(c[0].args, ['bando-1', '90000']);
    });

    test('ceAlChatEnter invia la chat solo con Invio', () => {
        const c = spia('_alChat');
        w.ceAlChatEnter({ key: 'a' });
        assert.equal(c.length, 0);
        w.ceAlChatEnter({ key: 'Enter' });
        assert.equal(c.length, 1);
    });

    test('ceCercaGiocatoriEnter cerca solo con Invio', () => {
        const c = spia('_cercaGiocatori');
        w.ceCercaGiocatoriEnter({ key: 'x' });
        w.ceCercaGiocatoriEnter({ key: 'Enter' });
        assert.equal(c.length, 1);
    });

    test('ceNoop non fa niente e non esplode', () => {
        assert.equal(w.ceNoop(), undefined);
    });

    test('ceCloseSelf chiude solo se il click è sul backdrop stesso', () => {
        const c = spia('chiudiX');
        const backdrop = { id: 'bd' };
        w.ceCloseSelf.call(backdrop, 'chiudiX', { target: { id: 'figlio' } });
        assert.equal(c.length, 0, 'un click interno non deve chiudere');
        w.ceCloseSelf.call(backdrop, 'chiudiX', { target: backdrop });
        assert.equal(c.length, 1);
    });
});
