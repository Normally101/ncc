'use strict';
/* ============================================================================
   test/funzioni/aste-buchi.test.js — le cuciture che i test delle aste non toccano

   Il file gemello (aste.test.js) copre il percorso felice di ogni azione.
   Qui si esercitano i bordi rimasti scoperti, azione per azione:
   - auctionsInit chiamato due volte: la sottoscrizione realtime non deve duplicarsi
   - auctionsRefresh quando una RPC risponde ERRORE: la cache vecchia deve restare
   - evento realtime mentre il giocatore e' su un altro tab: zero fetch finche' non torna
   - auctionsRevealWon su un id che non esiste piu'
   - auctionsConfirmBid con testo non numerico nell'input
   - il denaro del ritiro entra dalla porta unica (money.js), non da cash diretto
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Finto Supabase: registra ogni RPC e risponde secondo gli handler del test. */
function fintoSupabase(rpcHandlers = {}) {
    const rpcLog = [];
    const sottoscrizioni = [];
    const canali = [];
    const client = {
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });
            if (rpcHandlers[nome]) return rpcHandlers[nome](args);
            return { data: null, error: null };
        },
        channel: (name) => {
            const chan = {
                name,
                on: (_ev, _cfg, cb) => { chan._cb = cb; return chan; },
                subscribe: () => { sottoscrizioni.push(name); canali.push(chan); return chan; },
            };
            return chan;
        },
    };
    return { client, rpcLog, sottoscrizioni, canali };
}

describe('aste — cuciture non coperte dagli altri test', () => {
    let env, gs;

    beforeEach(() => {
        env = freshEnv({ render: true });
        gs = env.sandbox.gameState;
        env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';
        env.sandbox.switchTab = (tab) => { env.sandbox._activeTab = tab; };
    });
    afterEach(() => env.stopAllIntervals());

    test('doppia auctionsInit: il canale realtime non viene sottoscritto due volte', async () => {
        const { client, sottoscrizioni } = fintoSupabase({
            rpc_get_judicial_auctions: () => ({ data: [], error: null }),
            rpc_get_won_auctions:      () => ({ data: [{ id: 'w1' }], error: null }),
            rpc_get_my_bids:           () => ({ data: [], error: null }),
        });
        env.sandbox.supabaseClient = client;

        await env.sandbox.window.auctionsInit();
        await env.sandbox.window.auctionsInit();

        assert.equal(sottoscrizioni.length, 1,
            'due init hanno prodotto ' + sottoscrizioni.length +
            ' sottoscrizioni: ogni evento realtime scatterebbe N refresh');
    });

    test('auctionsRefresh con RPC in errore: la cache gia\u0300 caricata non viene cancellata', async () => {
        const { client } = fintoSupabase({
            rpc_get_judicial_auctions: () => ({ data: null, error: { message: 'network giu\u0300' } }),
            rpc_get_won_auctions:      () => ({ data: [{ id: 'w1' }], error: null }),
            rpc_get_my_bids:           () => ({ data: [{ amount: 100 }], error: null }),
        });
        env.sandbox.supabaseClient = client;
        // Cache preesistente: cio' che il giocatore aveva a schermo prima del guasto.
        env.sandbox.window._auctionsState.auctions = [{ id: 'vecchia_asta' }];

        await env.sandbox.window.auctionsRefresh(true);

        assert.deepEqual(env.sandbox.window._auctionsState.auctions.map(a => a.id), ['vecchia_asta'],
            'un errore di rete ha svuotato la lista aste a schermo');
    });

    test('evento realtime fuori dal tab aste: niente fetch, ma il prossimo refresh non-e\u0300-throttled parte', async () => {
        const { client, rpcLog, sottoscrizioni, canali } = fintoSupabase({
            rpc_get_judicial_auctions: () => ({ data: [], error: null }),
            rpc_get_won_auctions:      () => ({ data: [], error: null }),
            rpc_get_my_bids:           () => ({ data: [], error: null }),
        });
        env.sandbox.supabaseClient = client;

        await env.sandbox.window.auctionsInit();
        const fetchDopoInit = rpcLog.length;
        env.sandbox._activeTab = 'garage'; // il giocatore sta guardando altro

        // Simula l'arrivo della notifica Postgres sul canale realtime.
        canali[0]._cb({ eventType: 'UPDATE' });
        await new Promise(r => setTimeout(r, 20));

        assert.equal(rpcLog.length, fetchDopoInit,
            'fuori dal tab aste l\u2019evento ha comunque rifetchato tutto');
        assert.equal(env.sandbox.window._auctionsState._lastFetch, 0,
            'l\u2019evento deve invalidare la cache: il prossimo refresh non-forzato deve scaricare');
    });

    test('auctionsRevealWon su un lotto che non e\u0300 piu\u0300 in elenco: silenzio, nessun modale rotto', async () => {
        const { client } = fintoSupabase();
        env.sandbox.supabaseClient = client;
        env.sandbox.window._auctionsState.wonAuctions = [];

        await assert.doesNotReject(() => env.sandbox.window.auctionsRevealWon('sparito'));

        assert.equal(env.sandbox.document.getElementById('auction-won-modal'), null,
            'modale aperto senza un lotto valido alle spalle');
    });

    test('il denaro del ritiro entra SOLO dalla porta unica CE_money, mai da gameState.cash diretto', async () => {
        const { client } = fintoSupabase({
            rpc_claim_auction: () => ({
                data: {
                    success: true, lot_type: 'container',
                    container_data: { items: [{ type: 'cash', amount: 70000 }] },
                    cash_accreditato: 70000,
                },
                error: null,
            }),
        });
        env.sandbox.supabaseClient = client;

        // Spia sulla porta unica: registra senza alterare il comportamento.
        const chiamatePorta = [];
        const originale = env.sandbox.window.CE_money.accreditatoDalServer;
        env.sandbox.window.CE_money.accreditatoDalServer = (...args) => {
            chiamatePorta.push(args);
            return originale.apply(env.sandbox.window.CE_money, args);
        };
        env.sandbox.window._auctionsState.wonAuctions = [{ id: 'w1' }];

        await env.sandbox.window.auctionsClaim('w1');

        assert.equal(chiamatePorta.length, 1,
            'il denaro del container non e\u0300 passato da CE_money.accreditatoDalServer: porta unica bypassata');
    });

    test('auctionsConfirmBid con testo non numerico: errore inline, nessuna RPC partita', async () => {
        const { client, rpcLog } = fintoSupabase({
            rpc_place_auction_bid: () => ({ data: { success: true }, error: null }),
        });
        env.sandbox.supabaseClient = client;
        env.sandbox.window._auctionsState.auctions = [{
            id: 'a1', title: 'Lotto', icon: '\u{1F697}', min_bid: 10000, top_bid: 0,
            my_bid: null, bid_count: 0,
            auction_ends_at: new Date(Date.now() + 3600000).toISOString(),
            vehicle_data: {},
        }];
        env.sandbox.window.auctionsOpenBidModal('a1');

        const input = env.sandbox.document.getElementById('bid-amount-input');
        input.value = 'abc';

        await env.sandbox.window.auctionsConfirmBid('a1');

        const errDiv = env.sandbox.document.getElementById('bid-error');
        assert.equal(errDiv.style.display, 'block', 'l\u2019errore non e\u0300 comparso');
        assert.equal(rpcLog.filter(r => r.nome === 'rpc_place_auction_bid').length, 0,
            'una offerta NaN e\u0300 arrivata fino al server');
    });
});
