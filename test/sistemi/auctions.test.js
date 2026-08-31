'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/auctions — le aste giudiziarie (auctions.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 18. Quattro azioni:

   · `auctionsOpenBidModal(id)`  — costruisce il modal con l'input dell'offerta
     (stub no-op nell'env di default → testato con render:true);
   · `auctionsConfirmBid(id)`    — legge l'importo, chiama `rpc_place_auction_bid`
     ({v_auction_id, v_amount}); errore → messaggio nel modal, non lo chiude;
   · `auctionsRevealWon(id)`     — riscuote il lotto: `rpc_claim_auction`
     ({v_auction_id}), accredita l'eventuale liquidità via
     `CE_money.accreditatoDalServer` e mette in garage le auto vinte;
   · `switchTab('auctions')`     — cambia la scheda attiva.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/auctions', () => {
    let env, w, server, avvisi, realSwitchTab;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        realSwitchTab = w.switchTab;            // la vera di dispatcher.js
        w.switchTab = () => {};                 // sovrascritto solo dove serve
        w.auctionsRefresh = async () => {};
        w.renderTabAuctions = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const doc      = () => env.sandbox.document;
    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);

    function bidDom(value) {
        for (const [id, tag] of [['bid-amount-input', 'input'], ['bid-error', 'div'], ['bid-confirm-btn', 'button']]) {
            const el = doc().createElement(tag); el.id = id;
            doc().body.appendChild(el);
        }
        doc().getElementById('bid-amount-input').value = String(value);
        const modal = doc().createElement('div'); modal.id = 'auction-bid-modal';
        doc().body.appendChild(modal);
    }

    // ── auctionsConfirmBid ─────────────────────────────────────────────────

    test('auctionsConfirmBid: importo non valido → messaggio d\'errore, niente server', async () => {
        bidDom('0');
        await w.auctionsConfirmBid('a1');
        assert.equal(chiamata('rpc_place_auction_bid'), undefined);
        assert.equal(doc().getElementById('bid-error').style.display, 'block');
    });

    test('auctionsConfirmBid: importo valido → RPC con asta e importo, modal chiuso', async () => {
        bidDom('25000');
        server.rispondiCon('rpc_place_auction_bid', () => ({ data: { ok: true }, error: null }));

        await w.auctionsConfirmBid('a1');

        const c = chiamata('rpc_place_auction_bid');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.v_auction_id, 'a1');
        assert.equal(c.args.v_amount, 25000);
        assert.equal(doc().getElementById('auction-bid-modal'), null, 'il modal doveva chiudersi');
    });

    test('auctionsConfirmBid: il server rifiuta → errore nel modal, che resta aperto', async () => {
        bidDom('25000');
        server.rispondiCon('rpc_place_auction_bid', () => ({ data: null, error: { message: 'asta chiusa' } }));

        await w.auctionsConfirmBid('a1');

        assert.equal(doc().getElementById('bid-error').style.display, 'block');
        assert.ok(doc().getElementById('auction-bid-modal'), 'il modal non doveva chiudersi su errore');
    });

    // ── auctionsRevealWon ─────────────────────────────────────────────────

    test('auctionsRevealWon: riscuote il lotto — RPC, liquidità accreditata, auto in garage', async () => {
        w._auctionsState.wonAuctions = [{ id: 'w1', title: 'Lotto', icon: '🚗', lot_type: 'single', winning_bid: 20000 }];
        server.rispondiCon('rpc_claim_auction', () => ({
            data: { lot_type: 'single', cash_accreditato: 5000, vehicle_data: { tier: 'business', condition: 80, km: 60000 } },
            error: null,
        }));
        const cassaPrima = gs().cash;
        const n = gs().fleet.length;

        await w.auctionsRevealWon('w1');

        const c = chiamata('rpc_claim_auction');
        assert.ok(c);
        assert.equal(c.args.v_auction_id, 'w1');
        assert.equal(gs().cash, cassaPrima + 5000, 'la liquidità del lotto non è stata accreditata');
        assert.equal(gs().fleet.length, n + 1, 'l\'auto vinta non è finita in garage');
        assert.ok(!w._auctionsState.wonAuctions.some(a => a.id === 'w1'), 'il lotto riscosso è ancora nella lista');
    });

    test('auctionsRevealWon: lotto non in elenco → nessuna chiamata', async () => {
        w._auctionsState.wonAuctions = [];
        await w.auctionsRevealWon('ignoto');
        assert.equal(chiamata('rpc_claim_auction'), undefined);
    });

    // `switchTab` (elencata sotto "auctions" nel registro) vive in dispatcher.js,
    // che NON è fra i CORE_FILES del banco: si chiude nel test di navigazione.
    void realSwitchTab;
});

// open*Modal è stub no-op nell'env di default.
describe('sistemi/auctions — auctionsOpenBidModal (render vero)', () => {
    let env;
    beforeEach(() => {
        env = freshEnv({ render: true });
        R.conSchermo(env);
        R.conGiocatoreCollegato(env);
        env.sandbox.window.showNotification = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    test('auctionsOpenBidModal: con un\'asta nota costruisce il modal con l\'input dell\'offerta', () => {
        const sb = env.sandbox;
        sb.window._auctionsState.auctions = [{ id: 'a1', title: 'Berlina', icon: '🚗', min_bid: 10000, top_bid: 0, bid_count: 0, auction_ends_at: new Date(Date.now() + 3600e3).toISOString() }];

        sb.window.auctionsOpenBidModal('a1');

        assert.ok(sb.document.getElementById('auction-bid-modal'), 'il modal non è stato creato');
        assert.ok(sb.document.getElementById('bid-amount-input'), 'manca l\'input dell\'offerta');
    });

    test('auctionsOpenBidModal: asta sconosciuta → nessun modal', () => {
        const sb = env.sandbox;
        sb.window._auctionsState.auctions = [];
        sb.window.auctionsOpenBidModal('ignota');
        assert.equal(sb.document.getElementById('auction-bid-modal'), null);
    });
});
