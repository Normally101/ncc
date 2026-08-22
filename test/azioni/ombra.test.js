'use strict';
/* ============================================================================
   Banco di prova — azioni "ombra" e P2P (ispettorato/mafia/spionaggio).

   Azioni sotto test: payDonCarmine, hireCrumiri (p2p-render.js),
   shadowUpgradeDefense, shadowExecuteOp (black_ops.js).
   acceptGreyMarket e acceptShadowMission NON esistono piu' nel sorgente
   (nessuna definizione, nessun riferimento ceAct/data-ce-act): sono
   documentate nell'ultimo test, non esercitabili.

   Le tre regole verificate per ogni azione che muove denaro:
     1. importo giusto, UNA SOLA VOLTA;
     2. il denaro passa da window.CE_money (addebitatoDalServer/accreditatoDalServer),
        mai da gameState.cash -= fatto a mano;
     3. se la RPC ha gia' mosso il saldo lato server, il client NON risincronizza
        (nessuna chiamata a ServerState.syncCash).

   Collaudati anche i rifiuti: fondi insufficienti, bersaglio inesistente,
   azione ripetuta due volte con il server che rifiuta la seconda.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* ── Mock Supabase: registra ogni rpc() e risponde secondo gli handler ────── */
function fintoSupabase(handlers) {
    const chiamateRpc = [];
    const sb = {
        rpc(nome, params) {
            chiamateRpc.push({ nome, params: params || {} });
            const h = handlers[nome];
            if (!h) return Promise.resolve({ data: null, error: { message: `RPC non mockata: ${nome}` } });
            return Promise.resolve(h(params || {}));
        },
        from() {
            return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
        },
    };
    sb.chiamateRpc = chiamateRpc;
    return sb;
}

/* Conta le sincronizzazioni manuali: devono restare a zero perche' il saldo
   lo muove gia' il server tramite la RPC + Realtime. */
function prepara(handlers) {
    const syncCashChiamate = [];
    const env = freshEnv({
        syncCash: async (cash) => { syncCashChiamate.push(cash); return { success: true, cash }; },
    });
    const { sandbox } = env;
    // UI e persistenza fuori dal perimetro: qui si verifica il denaro, non il DOM.
    sandbox.saveGame = async () => {};
    sandbox.updateUI = () => {};
    sandbox.switchTab = () => {};
    sandbox.showBigEvent = () => {};
    sandbox.renderTabInvestments = () => {};
    const sb = fintoSupabase(handlers);
    sandbox.supabaseClient = sb;
    // _uid() (p2p-market.js:50) legge window.currentUser.id: senza giocatore connesso
    // payDonCarmine e hireCrumiri escono subito dalla guardia iniziale.
    sandbox.window.currentUser = { id: 'uid-test' };
    return { env, sandbox, gs: sandbox.gameState, sb, syncCashChiamate };
}

const IMMUNITA_24H = new Date(Date.now() + 24 * 3600000).toISOString();
const BOOST_48H = new Date(Date.now() + 48 * 3600000).toISOString();

describe('payDonCarmine (p2p-render.js)', () => {
    test('successo: addebita esattamente 50.000€ una volta via CE_money, senza syncCash', async () => {
        const { sandbox, gs, sb, syncCashChiamate } = prepara({
            rpc_pay_don_carmine: () => ({ data: { immunity_until: IMMUNITA_24H }, error: null }),
        });
        gs.cash = 1_000_000;

        await sandbox.window.payDonCarmine();

        assert.equal(gs.cash, 950_000, 'un solo addebito di 50.000€');
        assert.deepEqual(syncCashChiamate, [], 'la RPC ha gia\' mosso il saldo: niente risincronizza');
        assert.equal(sb.chiamateRpc.filter(c => c.nome === 'rpc_pay_don_carmine').length, 1);
        assert.equal(sandbox.window._sindacatoState.gdfRisk, 0);
        assert.equal(sandbox.window._sindacatoState.carmineImmunityUntil, IMMUNITA_24H);
    });

    test('fondi insufficienti: nessuna RPC, nessun movimento, avviso all\u2019utente', async () => {
        const { sandbox, gs, sb, syncCashChiamate, env } = prepara({});
        gs.cash = 10_000;
        env.notifications.length = 0;

        await sandbox.window.payDonCarmine();

        assert.equal(gs.cash, 10_000, 'la cassa non si tocca');
        assert.equal(sb.chiamateRpc.length, 0, 'nemmeno la RPC parte');
        assert.deepEqual(syncCashChiamate, []);
        assert.ok(env.notifications.some(n => /Fondi insufficienti/i.test(n.msg)));
    });

    test('RPC fallisce: zero movimenti di cassa', async () => {
        const { sandbox, gs, syncCashChiamate } = prepara({
            rpc_pay_don_carmine: () => ({ data: null, error: { message: 'boom' } }),
        });
        gs.cash = 1_000_000;

        await sandbox.window.payDonCarmine();

        assert.equal(gs.cash, 1_000_000);
        assert.deepEqual(syncCashChiamate, []);
    });

    test('azione ripetuta due volte con il server che rifiuta la seconda: un solo addebito', async () => {
        let pagato = false;
        const { sandbox, gs, sb, syncCashChiamate } = prepara({
            rpc_pay_don_carmine: () => {
                if (pagato) return { data: null, error: { message: 'immunita\u0300 gia\u0300 attiva' } };
                pagato = true;
                return { data: { immunity_until: IMMUNITA_24H }, error: null };
            },
        });
        gs.cash = 1_000_000;

        await sandbox.window.payDonCarmine();
        await sandbox.window.payDonCarmine();

        assert.equal(gs.cash, 950_000, 'il secondo tentativo rifiutato non addebita');
        assert.equal(sb.chiamateRpc.length, 2);
        assert.deepEqual(syncCashChiamate, []);
    });
});

describe('hireCrumiri (p2p-render.js)', () => {
    test('successo: il costo lo movimenta solo il server — nessun addebito locale, nessun syncCash', async () => {
        const { sandbox, gs, sb, syncCashChiamate } = prepara({
            rpc_hire_crumiri: () => ({ data: { risk_level: 8, crumiri_boost_until: BOOST_48H }, error: null }),
        });
        gs.cash = 500_000;

        await sandbox.window.hireCrumiri();

        assert.equal(gs.cash, 500_000, 'il client non scala nulla in locale: la spesa e\u0300 del server');
        assert.deepEqual(syncCashChiamate, []);
        assert.equal(sb.chiamateRpc.filter(c => c.nome === 'rpc_hire_crumiri').length, 1);
        assert.equal(sandbox.window._sindacatoState.gdfRisk, 8);
        assert.equal(sandbox.window._sindacatoState.crumiriBoostUntil, BOOST_48H);
    });

    test('RPC fallisce: stato e cassa invariati', async () => {
        const { sandbox, gs, syncCashChiamate, env } = prepara({
            rpc_hire_crumiri: () => ({ data: null, error: { message: 'boom' } }),
        });
        gs.cash = 500_000;
        env.notifications.length = 0;

        await sandbox.window.hireCrumiri();

        assert.equal(gs.cash, 500_000);
        assert.ok(!sandbox.window._sindacatoState.crumiriBoostUntil);
        assert.deepEqual(syncCashChiamate, []);
        assert.ok(env.notifications.some(n => /errore/i.test(n.msg)), 'l\u2019utente viene avvisato');
    });
});

describe('shadowUpgradeDefense (black_ops.js)', () => {
    test('livello 0 -> 1: addebita 50.000€ una volta via CE_money, applica il nuovo livello, niente syncCash', async () => {
        const { sandbox, gs, sb, syncCashChiamate } = prepara({
            rpc_upgrade_shadow_defense: () => ({ data: { new_level: 1 }, error: null }),
        });
        gs.cash = 1_000_000;
        gs._shadowDefenseLevel = 0;

        await sandbox.window.shadowUpgradeDefense();

        assert.equal(gs.cash, 950_000, 'costo tier 1 = 50.000€, una volta sola');
        assert.equal(gs._shadowDefenseLevel, 1);
        assert.deepEqual(syncCashChiamate, []);
        assert.equal(sb.chiamateRpc.filter(c => c.nome === 'rpc_upgrade_shadow_defense').length, 1);
    });

    test('fondi insufficienti: nessuna RPC, nessun addebito', async () => {
        const { sandbox, gs, sb, syncCashChiamate, env } = prepara({
            rpc_upgrade_shadow_defense: () => ({ data: { new_level: 1 }, error: null }),
        });
        gs.cash = 49_999;
        gs._shadowDefenseLevel = 0;
        env.notifications.length = 0;

        await sandbox.window.shadowUpgradeDefense();

        assert.equal(gs.cash, 49_999);
        assert.equal(gs._shadowDefenseLevel, 0);
        assert.equal(sb.chiamateRpc.length, 0);
        assert.deepEqual(syncCashChiamate, []);
        assert.ok(env.notifications.some(n => /Fondi insufficienti/i.test(n.msg)));
    });

    test('difesa gia\u0300 al massimo (livello 5): rifiuta senza toccare nulla', async () => {
        const { sandbox, gs, sb, env } = prepara({});
        gs.cash = 10_000_000;
        gs._shadowDefenseLevel = 5;
        env.notifications.length = 0;

        await sandbox.window.shadowUpgradeDefense();

        assert.equal(sb.chiamateRpc.length, 0);
        assert.equal(gs._shadowDefenseLevel, 5);
        assert.equal(gs.cash, 10_000_000);
        assert.ok(env.notifications.some(n => /massimo/i.test(n.msg)));
    });

    test('RPC fallisce: nessun addebito, livello invariato', async () => {
        const { sandbox, gs, syncCashChiamate } = prepara({
            rpc_upgrade_shadow_defense: () => ({ data: null, error: { message: 'boom' } }),
        });
        gs.cash = 1_000_000;
        gs._shadowDefenseLevel = 0;

        await sandbox.window.shadowUpgradeDefense();

        assert.equal(gs.cash, 1_000_000);
        assert.equal(gs._shadowDefenseLevel, 0);
        assert.deepEqual(syncCashChiamate, []);
    });
});

describe('shadowExecuteOp (black_ops.js)', () => {
    const TARGET = { user_id: 'rival-1', name: 'Rivale Spa' };

    function handlerOk() {
        return {
            rpc_execute_shadow_op: () => ({ data: { success: true, result: { fleet_size: 4, top_tier: 'vip' } }, error: null }),
            rpc_get_shadow_targets: () => ({ data: [TARGET], error: null }),
            rpc_get_shadow_ops_log: () => ({ data: [], error: null }),
        };
    }

    test('spy_fleet su bersaglio valido: addebita 15.000€ una volta via CE_money, niente syncCash', async () => {
        const { sandbox, gs, sb, syncCashChiamate } = prepara(handlerOk());
        gs.cash = 100_000;
        sandbox.window._shadowState.targets = [TARGET];

        await sandbox.window.shadowExecuteOp('rival-1', 'spy_fleet');

        assert.equal(gs.cash, 85_000, 'costo spy_fleet = 15.000€, una volta sola');
        assert.deepEqual(syncCashChiamate, []);
        const eseguite = sb.chiamateRpc.filter(c => c.nome === 'rpc_execute_shadow_op');
        assert.equal(eseguite.length, 1);
        // Confronto campo per campo: gli oggetti creati dentro la sandbox VM hanno
        // prototipi diversi da quelli del test e deepEqual li darebbe diversi.
        assert.equal(eseguite[0].params.v_target_id, 'rival-1');
        assert.equal(eseguite[0].params.v_op_type, 'spy_fleet');
        assert.equal(eseguite[0].params.v_op_cost, 15000);
    });

    test('bersaglio inesistente: rifiuta prima della RPC, zero movimenti', async () => {
        const { sandbox, gs, sb, syncCashChiamate, env } = prepara(handlerOk());
        gs.cash = 100_000;
        sandbox.window._shadowState.targets = [];
        env.notifications.length = 0;

        await sandbox.window.shadowExecuteOp('fantasma', 'spy_fleet');

        assert.equal(gs.cash, 100_000);
        assert.equal(sb.chiamateRpc.length, 0);
        assert.deepEqual(syncCashChiamate, []);
        assert.ok(env.notifications.some(n => /Target non trovato/i.test(n.msg)));
    });

    test('operazione sconosciuta: ritorna senza fare nulla', async () => {
        const { sandbox, gs, sb } = prepara(handlerOk());
        gs.cash = 100_000;
        sandbox.window._shadowState.targets = [TARGET];

        await sandbox.window.shadowExecuteOp('rival-1', 'op_inesistente');

        assert.equal(sb.chiamateRpc.length, 0);
        assert.equal(gs.cash, 100_000);
    });

    test('fondi insufficienti: nessuna RPC, nessun addebito', async () => {
        const { sandbox, gs, sb, syncCashChiamate, env } = prepara(handlerOk());
        gs.cash = 14_999;
        sandbox.window._shadowState.targets = [TARGET];
        env.notifications.length = 0;

        await sandbox.window.shadowExecuteOp('rival-1', 'spy_fleet');

        assert.equal(gs.cash, 14_999);
        assert.equal(sb.chiamateRpc.length, 0);
        assert.deepEqual(syncCashChiamate, []);
        assert.ok(env.notifications.some(n => /Fondi insufficienti/i.test(n.msg)));
    });

    test('RPC fallisce: nessun addebito', async () => {
        const { sandbox, gs, syncCashChiamate } = prepara({
            rpc_execute_shadow_op: () => ({ data: null, error: { message: 'boom' } }),
            rpc_get_shadow_targets: () => ({ data: [TARGET], error: null }),
            rpc_get_shadow_ops_log: () => ({ data: [], error: null }),
        });
        gs.cash = 100_000;
        sandbox.window._shadowState.targets = [TARGET];

        await sandbox.window.shadowExecuteOp('rival-1', 'spy_fleet');

        assert.equal(gs.cash, 100_000);
        assert.deepEqual(syncCashChiamate, []);
    });
});

describe('azioni inesistenti nel sorgente', () => {
    test('acceptShadowMission e acceptGreyMarket non risolvono a nessuna funzione', () => {
        // Nessuna definizione e nessun riferimento ceAct/data-ce-act nei sorgenti:
        // non sono esercitabili. Il test documenta lo stato e resta verde finche'
        // cosi\u0300 e\u0300; se qualcuno le reintrourrà\u0300, qui si accorge subito e si scrive il banco vero.
        const { sandbox } = prepara({});
        assert.notEqual(typeof sandbox.window.acceptShadowMission, 'function',
            'acceptShadowMission e\u0300 riapparsa: va scritto il suo banco di prova');
        assert.notEqual(typeof sandbox.window.acceptGreyMarket, 'function',
            'acceptGreyMarket e\u0300 riapparsa: va scritto il suo banco di prova');
    });
});
