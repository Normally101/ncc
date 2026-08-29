'use strict';
/* ============================================================================
   I Driver Coins si comprano con denaro vero, e da nessun'altra parte.

   Fino al 29/08/2026 il negozio chiamava `rpc_purchase_dc_pack` — una funzione
   che sul database di produzione NON ESISTE. L'acquisto falliva sempre, e sotto
   ai pacchetti c'era scritto «acquisti simulati (demo)». Vlad: «non deve piu'
   succedere che, se clicco per acquistare dei driver coins, me li dia subito».

   Questi test difendono UNA proprieta', ed e' quella che vale i soldi:
   il browser non puo' accreditare Driver Coins. Non li accredita quando la
   cassa funziona, non li accredita quando fallisce, non li accredita quando
   torna dalla pagina di pagamento. L'accredito vive in `api/dc-webhook.mjs`,
   dietro la verifica della firma di Stripe, con una chiave che il browser non
   ha mai visto.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Ambiente col negozio pronto: una sessione valida e una cassa che risponde
 *  quello che gli diciamo noi. */
function negozio({ sessione = 'jwt-finto', rispostaCassa, saldoServer } = {}) {
    const env = freshEnv({ render: true });
    const s = env.sandbox;
    const chiamate = [];

    s.window.supabaseClient = {
        auth: { getSession: async () => ({ data: sessione ? { session: { access_token: sessione } } : {} }) },
        from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    };
    s.window.fetch = async (url, opzioni) => {
        chiamate.push({ url, opzioni });
        const r = rispostaCassa || { ok: true, url: 'https://checkout.stripe.com/c/pay/test' };
        return { ok: true, json: async () => r };
    };
    if (saldoServer != null) {
        s.window.ServerState.getDriverCoins = async () => ({ driver_coins: saldoServer });
    }
    s.window._DC_ATTESA_MS = 5;   // il gioco vero aspetta 1,5s: da' tempo al webhook
    s.window.saveGame = () => {};
    s.window.updateUI = () => {};
    // Il contenitore in cui il gioco disegna le schede: nell'ambiente di test il
    // documento nasce vuoto, e senza questo `renderTabPremiumStore` non ha dove
    // scrivere.
    const container = s.document.createElement('div');
    container.id = 'tab-container';
    s.document.body.appendChild(container);
    return { env, s, gs: s.gameState, chiamate, container };
}

describe('acquisto Driver Coins — nessun coin senza pagamento', () => {

    test('il pulsante porta alla cassa e NON accredita niente', async () => {
        const { env, s, gs, chiamate } = negozio();
        try {
            gs.driverCoins = 10;
            await s.window._dcAcquistaPacchetto('starter');

            assert.equal(chiamate.length, 1, 'deve chiamare la cassa');
            assert.equal(chiamate[0].url, '/api/dc-checkout');
            assert.equal(JSON.parse(chiamate[0].opzioni.body).pack, 'starter');
            assert.ok(chiamate[0].opzioni.headers.Authorization.startsWith('Bearer '),
                'la cassa deve sapere chi sta comprando, o accrediterebbe a chiunque');

            assert.equal(gs.driverCoins, 10,
                'IL PUNTO DI TUTTO: il saldo non si muove. I coin li scrive il ' +
                'webhook dopo il pagamento, mai questo codice.');
            assert.equal(s.window.location.href, 'https://checkout.stripe.com/c/pay/test',
                'il giocatore va portato alla pagina di pagamento');
        } finally { env.stopAllIntervals(); }
    });

    test('mai il prezzo dal browser: alla cassa si manda solo QUALE pacchetto', async () => {
        const { env, s, chiamate } = negozio();
        try {
            await s.window._dcAcquistaPacchetto('fondo_sovrano');
            const inviato = JSON.parse(chiamate[0].opzioni.body);
            assert.deepEqual(Object.keys(inviato), ['pack'],
                'se partisse anche il prezzo, un browser modificato comprerebbe ' +
                '1300 coin per un centesimo');
        } finally { env.stopAllIntervals(); }
    });

    test('pacchetto inventato: non si apre nessuna cassa', async () => {
        const { env, s, gs, chiamate } = negozio();
        try {
            gs.driverCoins = 10;
            await s.window._dcAcquistaPacchetto('pacchetto_che_non_esiste');
            await s.window._dcAcquistaPacchetto(-20);
            await s.window._dcAcquistaPacchetto(99999);
            assert.equal(chiamate.length, 0);
            assert.equal(gs.driverCoins, 10);
        } finally { env.stopAllIntervals(); }
    });

    test('senza sessione non si compra, e lo si dice', async () => {
        const { env, s, gs, chiamate } = negozio({ sessione: null });
        try {
            gs.driverCoins = 7;
            await s.window._dcAcquistaPacchetto('starter');
            assert.equal(chiamate.length, 0, 'senza identita\' non si apre la cassa');
            assert.equal(gs.driverCoins, 7);
            assert.ok(env.notifications.some(n => n.msg.includes('connesso')));
        } finally { env.stopAllIntervals(); }
    });

    test('cassa non configurata: messaggio chiaro, nessun addebito, nessun coin', async () => {
        const { env, s, gs } = negozio({
            rispostaCassa: { ok: false, reason: 'pagamenti_non_configurati' },
        });
        try {
            gs.driverCoins = 10;
            await s.window._dcAcquistaPacchetto('starter');
            assert.equal(gs.driverCoins, 10);
            assert.ok(env.notifications.some(n => n.msg.includes('non è ancora attivo')),
                '«non ancora attivo» e «non ha funzionato» sono due cose diverse ' +
                'per chi legge: la seconda fa riprovare, la prima no');
            assert.notEqual(s.window.location.href, 'https://checkout.stripe.com/c/pay/test');
        } finally { env.stopAllIntervals(); }
    });

    test('la cassa irraggiungibile non produce coin', async () => {
        const { env, s, gs } = negozio();
        try {
            s.window.fetch = async () => { throw new Error('rete giù'); };
            gs.driverCoins = 10;
            await s.window._dcAcquistaPacchetto('starter');
            assert.equal(gs.driverCoins, 10);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessun addebito')));
        } finally { env.stopAllIntervals(); }
    });
});

describe('ritorno dalla cassa — il saldo lo dice il server, non l\'indirizzo', () => {

    test('?dc=ok non basta: si accredita quello che risponde il server', async () => {
        const { env, s, gs } = negozio({ saldoServer: 60 });
        try {
            gs.driverCoins = 10;
            s.window.location.search = '?dc=ok&session_id=cs_test_123';
            s.window._dcRitornoDallaCassa();
            await new Promise(r => setTimeout(r, 80));

            assert.equal(gs.driverCoins, 60, 'il saldo diventa quello autoritativo del server');
            assert.ok(env.notifications.some(n => n.msg.includes('accreditati')));
        } finally { env.stopAllIntervals(); }
    });

    test('?dc=ok inventato a mano non regala niente', async () => {
        /* Chiunque puo' scrivere ?dc=ok nella barra degli indirizzi. Se il
           server dice che il saldo e' sempre 10, il saldo resta 10: il
           parametro serve solo a sapere che vale la pena chiedere. */
        const { env, s, gs } = negozio({ saldoServer: 10 });
        try {
            gs.driverCoins = 10;
            s.window.location.search = '?dc=ok';
            s.window._dcRitornoDallaCassa();
            await new Promise(r => setTimeout(r, 80));
            assert.equal(gs.driverCoins, 10);
        } finally { env.stopAllIntervals(); }
    });

    test('acquisto annullato: lo si dice, e nessun addebito', async () => {
        const { env, s, gs } = negozio({ saldoServer: 10 });
        try {
            gs.driverCoins = 10;
            s.window.location.search = '?dc=annullato';
            s.window._dcRitornoDallaCassa();
            await new Promise(r => setTimeout(r, 30));
            assert.equal(gs.driverCoins, 10);
            assert.ok(env.notifications.some(n => n.msg.includes('annullato')));
        } finally { env.stopAllIntervals(); }
    });

    test('senza parametro non succede niente', async () => {
        const { env, s, gs } = negozio({ saldoServer: 999 });
        try {
            gs.driverCoins = 10;
            s.window.location.search = '';
            s.window._dcRitornoDallaCassa();
            await new Promise(r => setTimeout(r, 80));
            assert.equal(gs.driverCoins, 10, 'un avvio normale non deve toccare il saldo');
        } finally { env.stopAllIntervals(); }
    });
});

describe('il negozio mostra i prezzi che verranno addebitati', () => {

    test('il listino del server sovrascrive quello disegnato nel client', () => {
        const { env, s } = negozio();
        try {
            s.window._dcCatalogoServer = {
                starter: { pack_key: 'starter', dc: 75, price_cents: 599, currency: 'eur' },
            };
            s.window.renderTabPremiumStore();
            const html = s.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('€5,99'),
                'il prezzo mostrato deve essere quello del server: mostrarne uno ' +
                'e addebitarne un altro e\' un addebito non accettato');
            assert.ok(html.includes('>75<'), 'e i coin devono essere quelli del server');
        } finally { env.stopAllIntervals(); }
    });

    test('senza listino dal server restano i prezzi locali, e il negozio funziona', () => {
        const { env, s } = negozio();
        try {
            s.window._dcCatalogoServer = null;
            s.window.renderTabPremiumStore();
            const html = s.document.getElementById('tab-container').innerHTML;
            assert.ok(html.includes('data-ce-act="_dcAcquistaPacchetto"'), 'i bottoni ci sono');
            assert.ok(html.includes('€4,99'), 'col prezzo di listino locale');
            assert.ok(!html.includes('Acquisti simulati'),
                'la scritta «demo» non deve tornare: i pagamenti sono veri');
        } finally { env.stopAllIntervals(); }
    });
});
