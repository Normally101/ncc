'use strict';
/* ============================================================================
   Banco di prova per le azioni dei CONSORZI. Nel repository coesistono DUE
   sistemi paralleli di consorzio:
     - tab "Consorzi", server-authoritative su Supabase → alliances.js (_al*);
     - consorzi cooperativi della sezione P2P → p2p-render.js (join/leaveConsorzio).
   Questo banco li rende esercitabili: ogni azione parte davvero, e quando
   muove denaro valgono tre regole:
     1. importo giusto, MOSSO UNA SOLA VOLTA;
     2. il denaro passa SEMPRE da window.CE_money, mai gameState.cash -=;
     3. se la RPC ha gia' mosso il saldo lato server, il client usa
        addebitatoDalServer/accreditatoDalServer e NON risincronizza.
   Si collaudano anche i rifiuti: validazione, fondi insufficienti, RPC fallita.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* ── Banco: ambiente di gioco + Supabase finto che registra le RPC ────────── */
function creaMondo(rpcHandler) {
    const env = freshEnv();
    const { sandbox } = env;
    // Inerti, stessa scelta del guardrail: il rendering non c'entra col denaro.
    sandbox.window.saveGame = function () {};
    sandbox.window.updateUI = function () {};

    const chiamateRpc = [];
    // Catena .from(...) inerte: le azioni non la usano, ma il refresh del perk
    // in background (alliances.js) puo' arrivarci: deve solo non esplodere.
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

    // Il form "Fonda un Consorzio" che _alCreate legge con getElementById.
    sandbox.document.body.innerHTML =
        '<input id="al-name" value="Consorzio del Banco">' +
        '<input id="al-tag" value="BNC">' +
        '<input id="al-desc" value="  ">' +
        '<input id="al-emblem" value="🛡️">' +
        '<input id="al-open" type="checkbox" checked>';

    return { env, sandbox, gs: sandbox.gameState, chiamateRpc, notifiche: env.notifications };
}

describe('azioni consorzi — alliances.js', () => {

    test('_alCreate: fondazione valida — 25.000 scalati UNA sola volta via CE_money, RPC con argomenti ripuliti', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(() => ({ data: 'all_42' }));
        gs.cash = 100000;

        await sandbox._alCreate();

        assert.deepEqual(chiamateRpc.map(c => c.nome), ['rpc_create_alliance'],
            'esattamente una chiamata a rpc_create_alliance');
        const args = chiamateRpc[0].args;
        assert.equal(args.p_name, 'Consorzio del Banco');
        assert.equal(args.p_tag, 'BNC');
        assert.equal(args.p_company_name, gs.companyName);
        // Importo giusto, una volta sola: 25.000 (CREATE_COST), non un cent in piu'.
        assert.equal(gs.cash, 75000,
            'il saldo cala esattamente del costo di fondazione, una volta sola');
        assert.ok(notifiche.some(n => n.type === 'success'), 'conferma all\'utente');
    });

    test('_alCreate rifiuta un nome troppo corto: nessuna spesa, nessuna RPC', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: 'all_42' }));
        gs.cash = 50000;
        sandbox.document.getElementById('al-name').value = 'ab';

        await sandbox._alCreate();

        assert.equal(chiamateRpc.length, 0, 'nessuna RPC prima della validazione');
        assert.equal(gs.cash, 50000, 'il saldo non si muove su un form invalido');
    });

    test('_alCreate rifiuta un TAG troppo corto: nessuna spesa, nessuna RPC', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: 'all_42' }));
        gs.cash = 50000;
        sandbox.document.getElementById('al-tag').value = 'b';

        await sandbox._alCreate();

        assert.equal(chiamateRpc.length, 0);
        assert.equal(gs.cash, 50000);
    });

    test('_alCreate con fondi insufficienti: niente RPC, saldo intatto', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: 'all_42' }));
        gs.cash = 100;

        await sandbox._alCreate();

        assert.equal(chiamateRpc.length, 0, 'senza soldi non si parla col server');
        assert.equal(gs.cash, 100, 'e soprattutto il saldo resta com\'e\'');
    });

    test('_alCreate con RPC fallita: rimborso INTEGRALE, il giocatore non paga un errore del server', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'TAG gia\u0300 in uso' } }));
        gs.cash = 100000;

        await sandbox._alCreate();

        assert.equal(chiamateRpc.length, 1, 'la tentativa arriva fino alla RPC');
        assert.equal(gs.cash, 100000,
            'spesa + rimborso devono azzerarsi: il saldo torna esattamente al valore di partenza');
        assert.ok(notifiche.some(n => n.type === 'error'), 'l\'errore viene mostrato');
    });
});

describe('azioni consorzi — _alJoin', () => {

    test('_alJoin su consorzio aperto: una sola rpc_join_alliance con l\'id giusto, nessun denaro mosso', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(() => ({ data: 'joined' }));
        gs.cash = 80000;

        await sandbox._alJoin('all_7');

        assert.deepEqual(chiamateRpc.map(c => c.nome), ['rpc_join_alliance']);
        assert.equal(chiamateRpc[0].args.p_alliance_id, 'all_7');
        assert.equal(chiamateRpc[0].args.p_company_name, gs.companyName);
        assert.equal(gs.cash, 80000, 'entrare in un consorzio non costa nulla');
        assert.ok(notifiche.some(n => n.type === 'success' && /entrato/i.test(n.msg)));
    });

    test('_alJoin su consorzio chiuso: la RPC risponde "requested" e il messaggio cambia', async () => {
        const { sandbox, chiamateRpc, notifiche } = creaMondo(() => ({ data: 'requested' }));

        await sandbox._alJoin('all_chiuso');

        assert.equal(chiamateRpc.length, 1);
        assert.ok(notifiche.some(n => /richiesta inviata/i.test(n.msg)),
            'il messaggio distingue richiesta da ingresso');
    });

    test('_alJoin ripetuto due volte: entrambe le chiamate partono, il saldo resta intatto', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: 'joined' }));
        gs.cash = 10000;

        await sandbox._alJoin('all_7');
        await sandbox._alJoin('all_7');

        assert.deepEqual(chiamateRpc.map(c => c.nome), ['rpc_join_alliance', 'rpc_join_alliance']);
        assert.equal(gs.cash, 10000);
    });

    test('_alJoin bersaglio inesistente: la RPC fallisce e l\'errore arriva all\'utente', async () => {
        const { sandbox, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'consorzio inesistente' } }));

        await sandbox._alJoin('all_fantasma');

        assert.ok(notifiche.some(n => n.type === 'error' && /inesistente/.test(n.msg)));
    });
});

describe('azioni consorzi — _alLeave', () => {

    test('_alLeave confermata: una sola rpc_leave_alliance, nessun denaro mosso', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(() => ({ data: null }));
        gs.cash = 45000;

        await sandbox._alLeave();

        assert.deepEqual(chiamateRpc.map(c => c.nome), ['rpc_leave_alliance']);
        assert.equal(gs.cash, 45000, 'uscire non restituisce ne\u0300 ruba denaro');
        assert.ok(notifiche.some(n => /lasciato/i.test(n.msg)));
    });

    test('_alLeave annullata al confirm: NESSUNA RPC', async () => {
        const { env, sandbox, chiamateRpc } = creaMondo(() => ({ data: null }));
        sandbox.confirm = () => false;

        await sandbox._alLeave();

        assert.equal(chiamateRpc.length, 0,
            'un rifiuto nel dialog non deve parlare col server');
    });

    test('_alLeave con RPC fallita: errore mostrato, nessuna eccezione persa', async () => {
        const { sandbox, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'sei l\'ultimo membro' } }));

        await sandbox._alLeave();

        assert.ok(notifiche.some(n => n.type === 'error' && /ultimo membro/.test(n.msg)));
    });
});

/* ── _alDonate: qui il denaro c'e', e la regola e' severa ──────────────────── */
// Registra OGNI passaggio di denaro da CE_money senza cambiarne il comportamento:
// cosi' si vede SE e QUANTE volte il saldo viene mosso, e da quale porta.
function strumentaCE(sandbox) {
    const movimenti = [];
    for (const via of ['spend', 'earn', 'addebitatoDalServer', 'accreditatoDalServer']) {
        const orig = sandbox.CE_money[via].bind(sandbox.CE_money);
        sandbox.CE_money[via] = (...a) => { movimenti.push({ via, args: a }); return orig(...a); };
    }
    return movimenti;
}
// La RPC ha gia' mosso il saldo LATO SERVER: una chiamata a syncCash qui sarebbe
// una risincronizzazione indebita. La registro per poterlo dimostrare.
function strumentaSyncCash(sandbox) {
    const sincronizzazioni = [];
    const SS = sandbox.ServerState;
    const orig = SS.syncCash.bind(SS);
    SS.syncCash = (...a) => { sincronizzazioni.push(a); return orig(...a); };
    return sincronizzazioni;
}

describe('azioni consorzi — _alDonate', () => {
    function impostaImporto(sandbox, v) {
        let el = sandbox.document.getElementById('al-donate');
        if (!el) {
            el = sandbox.document.createElement('input');
            el.id = 'al-donate'; el.type = 'number';
            sandbox.document.body.appendChild(el);
        }
        el.value = String(v);
    }

    test('_alDonate valida: RPC una volta con l\'importo giusto, saldo mosso UNA volta da addebitatoDalServer', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(() => ({ data: true }));
        impostaImporto(sandbox, 7500);
        gs.cash = 50000;
        const movimenti = strumentaCE(sandbox);
        const sincronizzazioni = strumentaSyncCash(sandbox);

        await sandbox._alDonate();

        assert.deepEqual(chiamateRpc.map(c => c.nome), ['rpc_donate_to_alliance']);
        assert.equal(chiamateRpc[0].args.p_amount, 7500, 'alla RPC arriva l\'importo esatto');
        assert.equal(gs.cash, 42500, 'il saldo cala esattamente dell\'importo donato');
        assert.deepEqual(movimenti,
            [{ via: 'addebitatoDalServer', args: [7500, 'donate_alliance'] }],
            'un SOLO movimento, e dalla porta giusta (il server ha gia\u0300 preso i soldi)');
        assert.equal(sincronizzazioni.length, 0,
            'la RPC ha gia\u0300 mosso il saldo lato server: NON si risincronizza');
        assert.ok(notifiche.some(n => n.type === 'success'));
    });

    test('_alDonate con importo 0 o negativo: rifiutata prima ancora della RPC', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: true }));
        gs.cash = 50000;

        impostaImporto(sandbox, 0);
        await sandbox._alDonate();
        impostaImporto(sandbox, -3000);
        await sandbox._alDonate();

        assert.equal(chiamateRpc.length, 0, 'importo invalido: nessuna RPC');
        assert.equal(gs.cash, 50000);
    });

    test('_alDonate con fondi insufficienti: rifiutata SENZA toccare ne\u0300 RPC ne\u0300 saldo', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(() => ({ data: true }));
        impostaImporto(sandbox, 9999);
        gs.cash = 5000;

        await sandbox._alDonate();

        assert.equal(chiamateRpc.length, 0);
        assert.equal(gs.cash, 5000);
        assert.ok(notifiche.some(n => /insufficienti/i.test(n.msg)),
            'il giocatore capisce PERCHE\u0300 la donazione non e\u0300 partita');
    });

    test('_alDonate con RPC fallita: NESSUN addebito — soldi scalati solo dopo il si\u0300 del server', async () => {
        const { sandbox, gs, chiamateRpc, notifiche } = creaMondo(
            () => ({ data: null, error: { message: 'consorzio inesistente' } }));
        impostaImporto(sandbox, 5000);
        gs.cash = 50000;
        const movimenti = strumentaCE(sandbox);

        await sandbox._alDonate();

        assert.equal(chiamateRpc.length, 1);
        assert.deepEqual(movimenti, [],
            'se la RPC fallisce il client non scala nulla');
        assert.equal(gs.cash, 50000);
        assert.ok(notifiche.some(n => n.type === 'error'));
    });

    test('_alDonate ripetuta due volte: ogni giro il suo importo, mai doppi', async () => {
        const { sandbox, gs, chiamateRpc } = creaMondo(() => ({ data: true }));
        gs.cash = 50000;
        const movimenti = strumentaCE(sandbox);

        impostaImporto(sandbox, 1000);
        await sandbox._alDonate();
        impostaImporto(sandbox, 1000);
        await sandbox._alDonate();

        assert.equal(chiamateRpc.length, 2);
        assert.equal(gs.cash, 48000, 'due giri da 1.000 = 2.000 totali, non uno di piu\u0300');
        assert.equal(movimenti.filter(m => m.via === 'addebitatoDalServer').length, 2);
    });
});
