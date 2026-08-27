'use strict';
/* ============================================================================
   test/holding/opa-buyback-guardie.test.js

   Rami di window._opaRequestBuyback (hostile_takeover.js) mai esercitati:
     - prezzo non valido (NaN / <= 0): nessuna RPC, nessun movimento,
     - fallback OFFLINE (niente client Supabase): l'azione resta giocabile e
       scala il prezzo in locale attraverso la porta unica CE_money
       .addebitatoDalServer, SENZA rispedire syncCash (il denaro non può
       arrivare al server, ma il saldo locale non deve mentire sull'addebito).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEnv() {
    const rpcCalls = [];
    const movimentiCE = [];
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    const sbClient = {
        rpc: async (nome, args) => {
            rpcCalls.push({ nome, args });
            return { data: { success: true }, error: null };
        },
    };
    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;

    // Spiatura della porta unica: registriamo e deleghiamo all'originale
    const origAddebito = env.sandbox.CE_money.addebitatoDalServer.bind(env.sandbox.CE_money);
    env.sandbox.CE_money.addebitatoDalServer = (importo, motivo) => {
        movimentiCE.push({ fn: 'addebitatoDalServer', importo, motivo });
        return origAddebito(importo, motivo);
    };

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, rpcCalls, movimentiCE, syncedCash };
}

describe('_opaRequestBuyback — guardie mai testate (hostile_takeover.js)', () => {

    test('prezzo NaN: nessuna RPC e cassa intatta', async () => {
        const { sandbox, gs, rpcCalls, movimentiCE } = setupEnv();
        gs.cash = 200000;

        await sandbox._opaRequestBuyback('opa_001', Number.NaN);

        assert.equal(gs.cash, 200000);
        assert.equal(rpcCalls.length, 0);
        assert.equal(movimentiCE.length, 0);
    });

    test('prezzo <= 0: nessuna RPC e cassa intatta', async () => {
        const { sandbox, gs, rpcCalls, movimentiCE } = setupEnv();
        gs.cash = 200000;

        await sandbox._opaRequestBuyback('opa_001', 0);

        assert.equal(gs.cash, 200000);
        assert.equal(rpcCalls.length, 0);
        assert.equal(movimentiCE.length, 0);
    });

    test('fallback senza client Supabase: addebita il prezzo UNA volta via addebitatoDalServer, senza syncCash', async () => {
        const { env, sandbox, gs, rpcCalls, movimentiCE, syncedCash } = setupEnv();
        sandbox.window.supabaseClient = undefined; // giocatore offline / client non pronto
        gs.cash = 200000;

        await sandbox._opaRequestBuyback('opa_001', 150000);

        assert.equal(rpcCalls.length, 0);
        assert.equal(gs.cash, 50000, 'il saldo locale riflette l\'addebito anche offline');
        assert.deepEqual(movimentiCE, [
            { fn: 'addebitatoDalServer', importo: 150000, motivo: 'opa_buyback' },
        ], 'l\'unico movimento deve passare dalla porta unica CE_money');
        assert.deepEqual(syncedCash, [], 'addebitatoDalServer non risincronizza: il server non è stato toccato');
        assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Buyback completato')));
    });
});
