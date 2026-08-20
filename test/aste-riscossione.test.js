'use strict';
/* ============================================================================
   Aste giudiziarie — vincere deve dare qualcosa.

   Il difetto che questi test sorvegliano non era un errore di calcolo: era
   un'assenza. `auctionsRevealWon` apriva una finestra che diceva "contenuto
   svelato" e finiva li'. Il veicolo non entrava in flotta, il denaro dei
   container non arrivava, e il lotto restava fra quelli da ritirare per
   sempre. Il giocatore pagava l'aggiudicazione — quella si', scalata dal
   server — e riceveva una schermata.

   Qui si esegue il giro vero: `rpc_claim_auction` risponde come risponde il
   database, e si guarda cosa resta in mano al giocatore.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../test-support/game-env');

/** Un finto client Supabase che risponde a rpc_claim_auction come il vero. */
function clientChe(risposta) {
    const chiamate = [];
    return {
        chiamate,
        client: {
            rpc: async (nome, args) => {
                chiamate.push({ nome, args });
                if (nome !== 'rpc_claim_auction') return { data: null, error: null };
                if (risposta instanceof Error) return { data: null, error: { message: risposta.message } };
                return { data: risposta, error: null };
            },
        },
    };
}

describe('aste — riscuotere un lotto vinto', () => {
    let env, gs;

    beforeEach(() => {
        env = freshEnv();
        gs = env.sandbox.gameState;
    });
    afterEach(() => env.stopAllIntervals());

    test('un veicolo vinto entra davvero in flotta, con un modello vero', async () => {
        const { client } = clientChe({
            success: true, lot_type: 'vehicle',
            vehicle_data: { tier: 'business', condition: 72, km: 45000, year: 2021 },
            cash_accreditato: 0,
        });
        env.sandbox.supabaseClient = client;
        env.sandbox.window._auctionsState.wonAuctions = [{ id: 'a1' }];

        const prima = gs.fleet.length;
        const esito = await env.sandbox.window.auctionsClaim('a1');

        assert.equal(esito.error, undefined, 'il ritiro non doveva fallire');
        assert.equal(gs.fleet.length, prima + 1, 'il veicolo vinto non e\' entrato in flotta');

        const auto = gs.fleet[gs.fleet.length - 1];
        assert.ok(auto.vehicleClass,
            'auto senza vehicleClass: il resto del gioco non sa disegnarla ne\' farla lavorare');
        assert.equal(auto.tier, 'business', 'il tier del lotto non e\' arrivato all\'auto');
        assert.equal(auto.condition, 72, 'la condizione decisa dal server e\' andata persa');
        assert.equal(auto.isLease, false);
    });

    test('il denaro di un container lo accredita il server, non il browser', async () => {
        const { client } = clientChe({
            success: true, lot_type: 'container',
            container_data: { items: [
                { type: 'cash', amount: 50000 },
                { type: 'vehicle', tier: 'standard', condition: 55 },
            ] },
            cash_accreditato: 50000,
        });
        env.sandbox.supabaseClient = client;
        env.sandbox.window._auctionsState.wonAuctions = [{ id: 'a2' }];

        const cashPrima = gs.cash;
        const flottaPrima = gs.fleet.length;
        let sincronizzazioni = 0;
        env.sandbox.ServerState.syncCash = async () => { sincronizzazioni++; };

        await env.sandbox.window.auctionsClaim('a2');

        assert.equal(gs.cash, cashPrima + 50000, 'il denaro del container non e\' arrivato');
        assert.equal(gs.fleet.length, flottaPrima + 1, 'il veicolo dentro il container non e\' arrivato');
        /* Il server ha gia' aggiornato companies.cash dentro la RPC. Rimandargli
           il totale calcolato qui significherebbe far decidere al browser una
           cifra che il server aveva gia' deciso: e' il verso sbagliato. */
        assert.equal(sincronizzazioni, 0,
            'il client ha rispedito al server un saldo che il server aveva gia\' scritto');
    });

    test('un lotto riscosso sparisce da quelli da ritirare', async () => {
        const { client } = clientChe({
            success: true, lot_type: 'vehicle',
            vehicle_data: { tier: 'business', condition: 60 }, cash_accreditato: 0,
        });
        env.sandbox.supabaseClient = client;
        env.sandbox.window._auctionsState.wonAuctions = [{ id: 'a3' }, { id: 'a4' }];

        await env.sandbox.window.auctionsClaim('a3');

        const rimasti = env.sandbox.window._auctionsState.wonAuctions.map(a => a.id);
        assert.deepEqual(rimasti, ['a4'],
            'il lotto ritirato e\' ancora in elenco: il giocatore ci riclicca sopra');
    });

    test('se il server rifiuta il ritiro, non compare niente dal nulla', async () => {
        const { client } = clientChe(new Error('Lotto non riscuotibile'));
        env.sandbox.supabaseClient = client;
        env.sandbox.window._auctionsState.wonAuctions = [{ id: 'a5' }];

        const cashPrima = gs.cash;
        const flottaPrima = gs.fleet.length;
        const esito = await env.sandbox.window.auctionsClaim('a5');

        assert.match(esito.error || '', /non riscuotibile/i);
        assert.equal(gs.cash, cashPrima, 'accreditato denaro su un ritiro fallito');
        assert.equal(gs.fleet.length, flottaPrima, 'aggiunta un\'auto su un ritiro fallito');
        assert.deepEqual(env.sandbox.window._auctionsState.wonAuctions.map(a => a.id), ['a5'],
            'il lotto e\' sparito pur non essendo stato consegnato');
    });

    test('offrire passa dal server e non tocca il saldo locale', async () => {
        const chiamate = [];
        env.sandbox.supabaseClient = {
            rpc: async (nome, args) => { chiamate.push(nome); return { data: { success: true }, error: null }; },
        };
        const cashPrima = gs.cash;

        await env.sandbox.window.auctionsPlaceBid('a6', 12000);

        assert.ok(chiamate.includes('rpc_place_auction_bid'), 'l\'offerta non e\' passata dalla RPC');
        assert.equal(gs.cash, cashPrima,
            'offrire ha scalato soldi nel browser: il prezzo si paga all\'aggiudicazione, sul server');
    });
});
