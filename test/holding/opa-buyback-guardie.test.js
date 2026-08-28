'use strict';
/* ============================================================================
   test/holding/opa-buyback-guardie.test.js

   Rami di window._opaRequestBuyback (hostile_takeover.js) mai esercitati:
     - prezzo non valido (NaN / <= 0): nessuna RPC, nessun movimento,
     - OFFLINE (niente client Supabase): l'azione NON parte e NON scala nulla.
       Il riacquisto avviene dentro rpc_opa_buyback, lato server: senza rete
       non succede niente, e fingere il successo sarebbe la bugia peggiore
       (vedi il commento esteso sul test, più sotto).
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

    /* ────────────────────────────────────────────────────────────────────────
       CAMBIATO IL 28/08/2026. Questo test asseriva il contrario: che offline
       l'azione «resta giocabile», scala il prezzo in locale e annuncia
       «Buyback completato». La motivazione scritta allora era «il saldo locale
       non deve mentire sull'addebito».

       Ma il riacquisto lo fa `rpc_opa_buyback` LATO SERVER: senza client di
       rete quella chiamata non parte e non succede niente. Scalare il saldo e
       dichiarare vittoria significava mentire nell'ALTRO verso — dire al
       giocatore di aver ricomprato la sua azienda quando non l'aveva
       ricomprata. Al ricaricamento il saldo del server sovrascrive quello
       locale: i soldi tornano indietro e l'OPA e' ancora aperta. Il giocatore
       aveva pagato per niente ed era stato avvisato del contrario.

       Un'azione che non puo' riuscire deve dirlo, non simulare il successo.
       ──────────────────────────────────────────────────────────────────────── */
    test('senza client Supabase il riacquisto NON parte e NON scala nulla', async () => {
        const { env, sandbox, gs, rpcCalls, movimentiCE, syncedCash } = setupEnv();
        sandbox.window.supabaseClient = undefined; // giocatore offline / client non pronto
        gs.cash = 200000;

        await sandbox._opaRequestBuyback('opa_001', 150000);

        assert.equal(rpcCalls.length, 0, 'nessuna RPC: non c\'e\' con chi parlare');
        assert.equal(gs.cash, 200000,
            'il saldo NON si tocca: il riacquisto non e\' avvenuto, quindi non si paga');
        assert.deepEqual(movimentiCE, [], 'nessun movimento di denaro');
        assert.deepEqual(syncedCash, [], 'niente da sincronizzare');
        assert.ok(!env.notifications.some(n => n.type === 'success'),
            'NON deve annunciare un successo che non c\'e\' stato');
        assert.ok(env.notifications.some(n => n.type === 'error' && /server/i.test(n.msg)),
            'il giocatore va avvisato che l\'operazione non e\' partita');
    });
});
