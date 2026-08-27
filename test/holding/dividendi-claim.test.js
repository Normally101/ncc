'use strict';
/* ============================================================================
   test/holding/dividendi-claim.test.js

   Primo test del percorso di SUCCESSO dell'incasso dividendi del sistema
   "holding e scalate": window.claimHoldingDividends / alias
   window.claimDailyDividends (engine-holding.js).

   Il buco: holding-sync.test.js copriva solo le guardie "already_paid" ed
   errore RPC. Nessun test esercitava:
     - il percorso di successo (rpc_daily_dividends accredita davvero),
     - la risposta vuota dal server,
     - l'assenza del client Supabase,
     - l'identità dell'alias claimDailyDividends usato dalla UI.

   Nota economica: qui il denaro NON si muove nel browser — è rpc_daily_dividends
   che scrive companies.cash sul server e l'eco Realtime riallinea la previsione
   locale. La "sincronizzazione col server" di questa azione È la RPC: se la
   chiamata viene tolta dal codice, il test principale deve diventare ROSSO.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEnv(rpcImpl) {
    const rpcCalls = [];
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
            return rpcImpl ? rpcImpl(nome, args) : { data: null, error: null };
        },
    };
    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, rpcCalls, syncedCash };
}

describe('claimHoldingDividends — percorso di successo (mai testato prima)', () => {

    test('rpc_daily_dividends invocata UNA volta e payload del server restituito intatto', async () => {
        const payload = { status: 'ok', credited_count: 2, total_paid: 2300 };
        const { sandbox, gs, rpcCalls } = setupEnv(
            (nome) => nome === 'rpc_daily_dividends'
                ? { data: payload, error: null }
                : { data: null, error: null }
        );
        const cashPrima = gs.cash;

        const res = await sandbox.claimHoldingDividends();

        // Il payload autoritativo del server arriva al chiamante senza ritocchi
        assert.deepEqual(res, payload);
        // La sincronizzazione con il server è la RPC stessa: deve partire una volta
        assert.deepEqual(rpcCalls.map(c => c.nome), ['rpc_daily_dividends']);
        // Il browser non decide importi: nessun movimento di cassa locale
        assert.equal(gs.cash, cashPrima);
    });

    test('accredito reale notifica il totale al giocatore', async () => {
        const { sandbox, env } = setupEnv(
            () => ({ data: { status: 'ok', credited_count: 5, total_paid: 6100 }, error: null })
        );

        await sandbox.claimHoldingDividends();

        // Il separatore delle migliaia dipende dal locale ICU del runtime:
        // accettiamo sia "6.100" sia "6,100".
        assert.ok(env.notifications.some(n =>
            n.type === 'success' && /Dividendi accreditati.*6[.,]100/.test(n.msg)
        ), 'notifica attesa: "Dividendi accreditati: €6.100"');
    });

    test('risposta con zero accrediti NON notifica un credito inesistente', async () => {
        const { sandbox, env } = setupEnv(
            () => ({ data: { status: 'ok', credited_count: 0, total_paid: 0 }, error: null })
        );

        const res = await sandbox.claimHoldingDividends();

        assert.equal(res.status, 'ok');
        assert.ok(!env.notifications.some(n => n.msg.includes('Dividendi accreditati')),
            'non deve annunciare "Dividendi accreditati" quando total_paid=0 e credited_count=0');
    });

    test('risposta vuota dal server: fallisce con reason=empty_response', async () => {
        const { sandbox, env, rpcCalls } = setupEnv(() => ({ data: null, error: null }));

        const res = await sandbox.claimHoldingDividends();

        // Asserzioni per proprietà: l'oggetto nasce nella VM e ha un prototipo
        // di un altro realm, un deepEqual strutturale lo rifiuterebbe.
        assert.equal(res.success, false);
        assert.equal(res.reason, 'empty_response');
        assert.ok(!env.notifications.some(n => n.msg.includes('Dividendi accreditati')));
        assert.equal(rpcCalls.length, 1);
    });

    test('senza client Supabase esce subito con reason=no_client, senza crash', async () => {
        const { env, sandbox, gs } = setupEnv(() => { throw new Error('RPC non deve essere raggiunta'); });
        sandbox.window.supabaseClient = undefined;
        const cashPrima = gs.cash;

        const res = await sandbox.claimHoldingDividends();

        // Stesso motivo del test precedente: oggetto creato nella VM
        assert.equal(res.success, false);
        assert.equal(res.reason, 'no_client');
        assert.equal(gs.cash, cashPrima);
        assert.ok(env.notifications.length === 0, 'nessuna notifica spuria');
    });

    test('l\'alias claimDailyDividends è la STESSA azione ed esercita la stessa RPC', async () => {
        const { sandbox, rpcCalls } = setupEnv(
            () => ({ data: { status: 'ok', credited_count: 1, total_paid: 800 }, error: null })
        );
        assert.equal(sandbox.claimDailyDividends, sandbox.claimHoldingDividends,
            'la UI chiama claimDailyDividends: deve restare lo stesso riferimento');

        const res = await sandbox.claimDailyDividends();

        assert.equal(res.total_paid, 800);
        assert.deepEqual(rpcCalls.map(c => c.nome), ['rpc_daily_dividends']);
    });
});
