'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   funzioni/annuncio-scaduto-non-mangia-l'auto

   Trovato il 30/08 durante l'audit del server (Fase 1 di PIANO-CHIUSURA.md),
   tirando il filo di un lavoro schedulato che non esiste.

   La catena era questa:
     1. pubblichi un'auto sul mercato fra giocatori → esce dalla tua flotta;
     2. `market_listings.expires_at` vale `now() + 7 giorni`;
     3. passati i sette giorni nessuno la compra;
     4. `p2pFetchMarket` filtrava `expires_at > adesso` PER CHIUNQUE, quindi
        l'annuncio spariva anche dai «Miei Annunci»…
     5. …e con lui il bottone «Ritira», che era l'unico modo di riavere l'auto.

   Nessun lavoro schedulato la restituiva: `rpc_cleanup_expired_listings` esiste
   ma non la chiama nessuno — e comunque cancella soltanto, non restituisce.
   Un'auto invenduta per una settimana era un'auto persa per sempre.

   Non si era mai visto perche' fino al 30/08 nessun bottone pubblicava annunci:
   il difetto è nato lo stesso giorno in cui il mercato è diventato usabile.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const IO = 'venditore';

function ambiente() {
    const env = createGameEnv([...CORE_FILES, 'ui-market.js'], { render: true });
    const s = env.sandbox;
    s.initGame(true);
    env.stopAllIntervals();
    s.window.currentUser = { id: IO };
    // cancelP2PListing ridisegna la scheda Mercato: senza il contenitore
    // esplode dentro il rendering e il test non arriva a controllare la flotta.
    const c = s.document.createElement('div');
    c.id = 'tab-container';
    s.document.body.appendChild(c);
    return { env, s, gs: s.gameState };
}

/* Finto client che registra i filtri usati nella query: è lì che viveva il difetto. */
function _sbFinto(righe) {
    const query = { tab: null, passi: [] };
    const catena = new Proxy({}, {
        get(_, prop) {
            if (prop === 'then') return (ok) => ok({ data: righe, error: null });
            return (...args) => { query.passi.push([prop, ...args]); return catena; };
        },
    });
    return {
        _query: query,
        rpc: async () => ({ data: null, error: null }),
        from: (tab) => { query.tab = tab; return catena; },
        channel: () => catena, removeChannel: () => {},
    };
}

const annuncio = (over = {}) => ({
    id: 'l1', seller_user_id: IO, seller_name: 'Io SRL', ask_price: 20000,
    listed_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    expires_at: new Date(Date.now() - 86400000).toISOString(),   // scaduto ieri
    car_snapshot: { id: 'c1', name: 'Berlina', tier: 'business', condition: 80 },
    ...over,
});

describe('funzioni/annuncio-scaduto-non-mangia-l\'auto', () => {
    let env, s, gs;
    beforeEach(() => { ({ env, s, gs } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('la richiesta al server chiede anche i MIEI annunci scaduti', async () => {
        const sb = _sbFinto([]);
        s.window.supabaseClient = sb;

        await s.window.p2pFetchMarket();

        const usati = sb._query.passi.map(p => p[0]);
        assert.ok(usati.includes('or'),
            'senza un "or" la query resta «solo i non scaduti», e i miei annunci morti spariscono con l\'auto dentro');
        const filtro = sb._query.passi.find(p => p[0] === 'or')[1];
        assert.ok(filtro.includes('seller_user_id.eq.' + IO),
            `il filtro deve fare un\'eccezione per me: letto "${filtro}"`);
        assert.ok(filtro.includes('expires_at.gt.'),
            'e deve continuare a escludere gli annunci scaduti degli altri');
    });

    test('senza login la richiesta resta quella di prima', async () => {
        const sb = _sbFinto([]);
        s.window.supabaseClient = sb;
        s.window.currentUser = null;

        await s.window.p2pFetchMarket();

        const usati = sb._query.passi.map(p => p[0]);
        assert.ok(usati.includes('gt'), 'chi non ha un account vede solo gli annunci vivi');
        assert.ok(!usati.includes('or'), 'e non serve nessuna eccezione');
    });

    test('un mio annuncio scaduto resta a schermo, con il bottone per riprendere l\'auto', () => {
        s.window._p2pMarket.listings = [annuncio()];

        const html = s.window.renderP2PMarketSection();

        assert.ok(html.includes('Berlina'), 'l\'auto deve restare visibile: è ancora roba mia');
        assert.ok(html.includes('Scaduto'), 'e va detto che l\'annuncio è morto');
        assert.ok(html.includes('data-ce-act="cancelP2PListing"'),
            'senza questo bottone l\'auto non torna piu\' in flotta: è il difetto');
        assert.ok(html.includes('Riprendi l\'auto'), 'e il bottone deve dire cosa fa');
    });

    test('l\'annuncio scaduto di un altro giocatore non compare fra quelli in vendita', () => {
        s.window._p2pMarket.listings = [annuncio({ id: 'l2', seller_user_id: 'altro', seller_name: 'Rivali SRL' })];

        const html = s.window.renderP2PMarketSection();

        assert.ok(!html.includes('data-ce-act="buyP2PCar"'),
            'comprare un annuncio scaduto significa mandare soldi contro un errore del server');
        assert.ok(html.includes('Sii il primo'), 'la lista di acquisto resta vuota');
    });

    test('ritirare un annuncio scaduto rimette l\'auto in flotta', async () => {
        const l = annuncio();
        s.window._p2pMarket.listings = [l];
        s.window.supabaseClient = Object.assign(_sbFinto([]), {
            rpc: async (nome) => ({ data: nome === 'rpc_cancel_listing' ? l.car_snapshot : null, error: null }),
        });
        assert.ok(!gs.fleet.some(c => c.id === 'c1'), 'in partenza l\'auto è fuori dalla flotta');

        await s.window.cancelP2PListing('l1');

        assert.ok(gs.fleet.some(c => c.id === 'c1'),
            'l\'auto deve tornare in garage: è la ragione per cui il bottone deve restare raggiungibile');
    });
});
