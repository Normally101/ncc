'use strict';
/* ============================================================================
   test/azioni/alleanze-buchi.test.js — i percorsi dei consorzi finora SENZA test.

   I banchi gia' presenti (test/azioni/alleanze-consorzi.test.js e
   test/funzioni/alleanze.test.js) coprono i percorsi felici di _alCreate,
   _alJoin, _alLeave, _alDonate e le viste di rendering. Questo file colma i
   buchi rimasti:
     1. la regola della PORTA UNICA sulla fondazione: i 25.000 devono passare
        da CE_money.spend (che sincronizza col server via ServerState.syncCash).
        Il test diventa ROSSO se qualcuno rimpiazza la porta con un
        gameState.cash -= diretto, o se la sincronizzazione viene tolta;
     2. il rimborso della fondazione fallita deve usare CE_money.earn,
        non scrivere direttamente sul saldo;
     3. le vie d'errore mai esercitate: _alChat, _alKick, _alSetRole;
     4. la guardia di _alPerk: una RPC che NON restituisce scadenza non deve
        installare nessun buff client-side.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* ── Banco: ambiente di gioco + Supabase finto che registra le RPC ────────── */
function creaMondo(rpcHandler) {
    const env = freshEnv();
    const { sandbox } = env;
    sandbox.window.saveGame = function () {};
    sandbox.window.updateUI = function () {};

    const chiamateRpc = [];
    // Catena .from(...) inerte: le azioni qui provate non la leggono, ma il
    // refresh del perk in background puo' arrivarci: deve solo non esplodere.
    const inerte = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        limit() { return this; }, update() { return this; },
        maybeSingle() { return Promise.resolve({ data: null }); },
        single() { return Promise.resolve({ data: null }); },
    };
    sandbox.supabaseClient = {
        rpc: async (nome, args) => {
            chiamateRpc.push({ nome, args });
            const r = await rpcHandler(nome, args);
            return r || { data: null, error: null };
        },
        from: () => inerte,
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
    };
    sandbox.currentUser = { id: 'utente_banco' };

    sandbox.document.body.innerHTML =
        '<input id="al-name" value="Consorzio del Banco">' +
        '<input id="al-tag" value="BNC">' +
        '<input id="al-desc" value="  ">' +
        '<input id="al-emblem" value="🛡️">' +
        '<input id="al-open" type="checkbox" checked>';

    return { env, sandbox, gs: sandbox.gameState, chiamateRpc, notifiche: env.notifications };
}

// Registra OGNI movimento di denaro fatto tramite CE_money, senza cambiarlo.
function strumentaCE(sandbox) {
    const movimenti = [];
    for (const via of ['spend', 'earn', 'addebitatoDalServer', 'accreditatoDalServer']) {
        const orig = sandbox.CE_money[via].bind(sandbox.CE_money);
        sandbox.CE_money[via] = (...a) => { movimenti.push({ via, args: a }); return orig(...a); };
    }
    return movimenti;
}
// Registra le sincronizzazioni verso il server: se la sincronizzazione viene
// tolta dal codice, i contatori qui sotto scendono a zero e il test diventa ROSSO.
function strumentaSyncCash(sandbox) {
    const sincronizzazioni = [];
    const orig = sandbox.ServerState.syncCash.bind(sandbox.ServerState);
    sandbox.ServerState.syncCash = (...a) => { sincronizzazioni.push(a); return orig(...a); };
    return sincronizzazioni;
}

describe('consorzi — porta unica del denaro (_alCreate)', () => {

    test('_alCreate: i 25.000 passano da CE_money.spend E vengono sincronizzati col server', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: 'all_42' }));
        gs.cash = 100000;
        const movimenti = strumentaCE(sandbox);
        const sincronizzazioni = strumentaSyncCash(sandbox);

        await sandbox._alCreate();

        assert.equal(chiamateRpc.length, 1);
        assert.deepEqual(movimenti,
            [{ via: 'spend', args: [25000, 'create_alliance'] }],
            'l\'unico movimento di cassa e\' CE_money.spend: un gameState.cash -= diretto lo scopre');
        assert.equal(gs.cash, 75000);
        assert.ok(sincronizzazioni.length >= 1,
            'la spesa deve arrivare al server (rpc_sync_cash): togliendo la sincronizzazione il test diventa rosso');
    });

    test('_alCreate con RPC fallita: il rimborso passa da CE_money.earn e viene sincronizzato', async () => {
        const { sandbox, gs } = creaMondo(
            () => ({ data: null, error: { message: 'TAG gia\u0300 in uso' } }));
        gs.cash = 100000;
        const movimenti = strumentaCE(sandbox);
        const sincronizzazioni = strumentaSyncCash(sandbox);

        await sandbox._alCreate();

        assert.deepEqual(movimenti.map(m => m.via), ['spend', 'earn'],
            'spesa e rimborso entrambi dalla porta unica: un rimborso scritto a mano sul saldo e\' un guasto');
        assert.equal(movimenti[1].args[0], 25000, 'rimborso INTEGRALE, centesimo per centesimo');
        assert.equal(movimenti[1].args[1], 'create_alliance_refund');
        assert.equal(gs.cash, 100000, 'saldo riportato esattamente al valore di partenza');
        assert.ok(sincronizzazioni.length >= 2,
            'anche il rimborso va comunicato al server: senza sync il test diventa rosso');
    });
});

describe('consorzi — vie d\'errore mai esercitate', () => {

    test('_alChat con RPC fallita: l\'errore arriva all\'utente, nessuna eccezione persa', async () => {
        const { sandbox, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'chat non disponibile' } }));
        sandbox.document.body.innerHTML = '<input id="al-chat-input" value="Messaggio nel vuoto">';

        await assert.doesNotReject(async () => { await sandbox._alChat(); });

        assert.ok(notifiche.some(n => n.type === 'error' && /chat non disponibile/.test(n.msg)),
            'il giocatore deve sapere che il messaggio NON e\' partito');
    });

    test('_alKick con RPC fallita: errore mostrato, nessuna eccezione persa', async () => {
        const { sandbox, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'permessi insufficienti' } }));

        await assert.doesNotReject(async () => { await sandbox._alKick('membro_x'); });

        assert.ok(notifiche.some(n => n.type === 'error' && /permessi insufficienti/.test(n.msg)));
    });

    test('_alSetRole con RPC fallita: errore mostrato, nessuna eccezione persa', async () => {
        const { sandbox, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'ruolo non valido' } }));

        await assert.doesNotReject(async () => { await sandbox._alSetRole('membro_x', 'officer'); });

        assert.ok(notifiche.some(n => n.type === 'error' && /ruolo non valido/.test(n.msg)));
    });
});

describe('consorzi — _alPerk: la guardia sulla scadenza', () => {

    test('RPC senza scadenza (until assente): NESSUN buff installato sul client', async () => {
        const { sandbox, chiamateRpc, notifiche } = creaMondo(() => ({ data: null }));
        sandbox._allyActivePerk = null;

        await sandbox._alPerk('boost_income');

        assert.deepEqual(chiamateRpc.map(c => c.nome), ['rpc_activate_alliance_perk']);
        assert.equal(chiamateRpc[0].args.p_perk, 'boost_income');
        assert.equal(sandbox._allyActivePerk, null,
            'senza una scadenza vera il client non deve credersi buffato: moltiplicatore fantasma gratis');
        assert.ok(notifiche.some(n => n.type === 'success'),
            'la conferma all\'utente resta, il perk vive lato server');
    });
});
