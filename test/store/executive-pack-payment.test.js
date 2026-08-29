'use strict';
/* ============================================================================
   test/store/executive-pack-payment.test.js

   LA STORIA DI UNA CASSA CHE NON C'ERA, in tre atti.

   23/08/2026 — Vlad segnala che il bottone «Acquista» dei pacchetti DC
   accreditava i Driver Coins con `CE_money.earnDC` senza alcun pagamento:
   nessuna conferma, nessuna chiamata al server, coin dal nulla.

   Correzione di allora: l'acquisto passa da `ServerState.purchaseDriverCoinPack`
   → `rpc_purchase_dc_pack`. Il client smette di coniare. Ma quella RPC sul
   database di produzione NON E' MAI ESISTITA: l'acquisto falliva sempre, e
   sotto ai pacchetti restava scritto «acquisti simulati (demo)».

   29/08/2026 — Vlad: «non deve piu' succedere che, se clicco per acquistare dei
   driver coins, me li dia subito, ma dobbiamo collegarlo a Stripe». Ora la
   cassa c'e': il browser apre una sessione di pagamento e i coin li scrive
   `api/dc-webhook.mjs` dopo aver verificato la firma di Stripe.

   Le tre versioni del codice sono diverse; la domanda a cui questo file
   risponde e' sempre la stessa: PUO' IL BROWSER DARSI DEI DRIVER COINS?
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Ambiente col negozio pronto e una cassa che risponde come diciamo noi. */
function setupEnv(rispostaCassa) {
    const chiamate = [];
    const env = freshEnv();
    const s = env.sandbox;
    s.window.supabaseClient = {
        auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-finto' } } }) },
    };
    s.window.fetch = async (url, opzioni) => {
        chiamate.push({ url, opzioni });
        if (rispostaCassa === 'irraggiungibile') throw new Error('rete giù');
        return { ok: true, json: async () => (rispostaCassa || { ok: true, url: 'https://checkout.stripe.com/c/test' }) };
    };
    return { env, sandbox: s, gs: s.gameState, chiamate };
}

describe('Executive Club — i pacchetti DC passano solo da un pagamento vero', () => {

    test('click sul pacchetto Starter (€4,99): ZERO DC finche\' non si paga', async () => {
        const { env, sandbox, gs, chiamate } = setupEnv();
        try {
            gs.driverCoins = 0;

            await sandbox._dcAcquistaPacchetto('starter');

            assert.equal(gs.driverCoins, 0,
                'IL DIFETTO DEL 23/08: qui il saldo passava da 0 a 50 senza che ' +
                'un centesimo avesse lasciato la carta di nessuno.');
            assert.equal(chiamate.length, 1, 'si apre la cassa, e basta');
            assert.equal(chiamate[0].url, '/api/dc-checkout');
            assert.equal(sandbox.window.location.href, 'https://checkout.stripe.com/c/test',
                'il giocatore viene portato a pagare');
        } finally { env.stopAllIntervals(); }
    });

    test('il browser non decide quanto costa ne\' quanti coin riceve', async () => {
        const { env, sandbox, chiamate } = setupEnv();
        try {
            await sandbox._dcAcquistaPacchetto('fondo_sovrano');
            const inviato = JSON.parse(chiamate[0].opzioni.body);
            assert.deepEqual(Object.keys(inviato), ['pack'],
                'alla cassa va solo QUALE pacchetto: prezzo e coin li legge il ' +
                'server dalla tabella dc_packs. Se partissero da qui, un browser ' +
                'modificato comprerebbe 1300 coin per un centesimo.');
        } finally { env.stopAllIntervals(); }
    });

    test('la cassa rifiuta: nessun accredito, nessuna eccezione, messaggio chiaro', async () => {
        const { env, sandbox, gs } = setupEnv({ ok: false, reason: 'pacchetto_sconosciuto' });
        try {
            gs.driverCoins = 25;
            await sandbox._dcAcquistaPacchetto('corporate');
            assert.equal(gs.driverCoins, 25);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessun addebito')),
                'chi non ha pagato deve sapere che non gli e\' stato addebitato niente');
        } finally { env.stopAllIntervals(); }
    });

    test('server irraggiungibile: nessun accredito', async () => {
        const { env, sandbox, gs } = setupEnv('irraggiungibile');
        try {
            gs.driverCoins = 25;
            await sandbox._dcAcquistaPacchetto('corporate');
            assert.equal(gs.driverCoins, 25,
                'una rete che cade non e\' un motivo per regalare valuta premium');
        } finally { env.stopAllIntervals(); }
    });

    test('nessuna delle vecchie porte di conio e\' rimasta aperta', async () => {
        const chiamateAdd = [];
        const env = freshEnv({
            serverState: {
                addDriverCoins: async (n, motivo) => { chiamateAdd.push({ n, motivo }); return null; },
            },
        });
        const s = env.sandbox;
        try {
            s.window.supabaseClient = {
                auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
            };
            s.window.fetch = async () => ({ ok: true, json: async () => ({ ok: true, url: 'https://checkout.stripe.com/c/test' }) });
            s.gameState.driverCoins = 0;

            await s.window._dcAcquistaPacchetto('offshore');

            assert.equal(chiamateAdd.length, 0,
                'ne\' earnDC ne\' addDriverCoins devono comparire nel percorso d\'acquisto');
            assert.equal(s.gameState.driverCoins, 0);
        } finally { env.stopAllIntervals(); }
    });
});
