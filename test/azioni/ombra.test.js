'use strict';
/* ============================================================================
   test/azioni/ombra.test.js

   Azioni "cieche" del mercato grigio / agenzia ombra: il guardrail non riesce
   ad attivarle perché vogliono uno stato di gioco preparato. Qui le attiviamo
   e verifichiamo le tre regole che contanno quando si muove denaro:
     - importo giusto, UNA VOLTA SOLA;
     - passa da window.CE_money (mai gameState.cash -= diretto);
     - se la RPC muove già il saldo lato server si usa
       CE_money.addebitatoDalServer/accreditatoDalServer e NON si risincronizza.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Ambiente comune: mock ServerState che registra le risincronizzazioni,
// supabaseClient finto che registra le RPC chiamate.
function setupOmbraEnv(rpcOverrides = {}) {
    const syncedCash = [];
    const rpcCalls = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    const sandbox = env.sandbox;
    sandbox.currentUser = { id: 'usr_test_123', email: 'test@example.com' };
    sandbox.window.currentUser = sandbox.currentUser;

    const queryBuilder = {
        select: () => queryBuilder,
        order: () => queryBuilder,
        eq: () => queryBuilder,
        gt: () => queryBuilder,
        or: () => queryBuilder,
        limit: () => queryBuilder,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => ({ error: null }),
        then: (resolve) => resolve({ data: [], error: null }),
    };

    sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            rpcCalls.push({ fn, params });
            if (rpcOverrides[fn]) {
                return rpcOverrides[fn](params);
            }
            return { data: {}, error: null };
        },
        from: () => queryBuilder,
    };
    sandbox.window.supabaseClient = sandbox.supabaseClient;

    return { env, sandbox, gs: sandbox.gameState, syncedCash, rpcCalls };
}

describe('azioni ombra — mercato grigio e agenzia dell\'ombra', () => {

    describe('payDonCarmine (p2p-render.js)', () => {
        test('paga 50.000€ UNA volta via addebitatoDalServer, senza syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            gs.cash = 100000;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000, 'il saldo locale deve riflettere i 50.000€ spesi');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamata: rpc_pay_don_carmine muove già companies.cash sul server');
            assert.equal(rpcCalls.length, 1, 'la RPC deve essere chiamata esattamente una volta');
            assert.equal(rpcCalls[0].fn, 'rpc_pay_don_carmine');
        });

        test('con fondi insufficienti rifiuta: niente soldi mossi, niente RPC', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            gs.cash = 49999;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 49999, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0, 'RPC non deve partire senza fondi');
        });

        test('se la RPC fallisce zero movimenti', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv({
                rpc_pay_don_carmine: async () => ({ data: null, error: { message: 'DB error' } }),
            });
            gs.cash = 100000;

            await sandbox.payDonCarmine();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000, 'il saldo non deve cambiare se la RPC fallisce');
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 1, 'la RPC è stata tentata una volta sola');
        });
    });

    // Registra i passaggi da CE_money senza sostituire l'implementazione: il
    // movimento del saldo resta quello di money.js, noi registriamo solo chi
    // lo ha richiesto e con quale importo/causale.
    function tracciaCE_money(sb) {
        const addebiti = [];
        const accrediti = [];
        [sb.CE_money, sb.window.CE_money].forEach((ref) => {
            if (!ref || ref.__ombraTracciato) return;
            ref.__ombraTracciato = true;
            const addebOrig = ref.addebitatoDalServer.bind(ref);
            ref.addebitatoDalServer = (amount, reason) => {
                addebiti.push({ amount, reason });
                return addebOrig(amount, reason);
            };
            const accrOrig = ref.accreditatoDalServer.bind(ref);
            ref.accreditatoDalServer = (amount, reason) => {
                accrediti.push({ amount, reason });
                return accrOrig(amount, reason);
            };
        });
        return { addebiti, accrediti };
    }

    // _DEFENSE_TIERS non è esportata su window: leggo il costo del tier
    // direttamente dalla definizione del catalogo in black_ops.js invece di
    // copiarlo a mano nel test.
    function costoTierDifesaDaCatalogo(livello) {
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', '..', 'black_ops.js'), 'utf8');
        const m = src.match(new RegExp('level:\\s*' + livello + ',\\s*name:[^,]+,\\s*cost:\\s*(\\d+)'));
        assert.ok(m, `tier livello ${livello} non trovato in _DEFENSE_TIERS`);
        return Number(m[1]);
    }

    // Le due azioni shadow chiudono con shadowRefresh(true) che aggiunge RPC
    // di lettura: lo silenziamo per contare solo quelle dell'azione sotto test.
    function silenziaShadowRefresh(sb) {
        const noop = async () => {};
        sb.shadowRefresh = noop;
        sb.window.shadowRefresh = noop;
    }

    function consentiConfirm(sb) {
        const yes = () => true;
        sb.confirm = yes;
        sb.window.confirm = yes;
    }

    describe('shadowExecuteOp (black_ops.js)', () => {
        test('addebita il costo di catalogo UNA volta via addebitatoDalServer, senza syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            const { addebiti } = tracciaCE_money(sandbox);
            consentiConfirm(sandbox);
            silenziaShadowRefresh(sandbox);
            sandbox.window._shadowState.targets.push({ user_id: 'tgt_1', name: 'Rivale SpA' });

            const opCost = sandbox.window.SHADOW_OPS.find(o => o.id === 'spy_fleet').cost;
            gs.cash = opCost * 10;

            await sandbox.window.shadowExecuteOp('tgt_1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, opCost * 9, 'il saldo cala esattamente del costo di catalogo');
            assert.deepEqual(addebiti,
                [{ amount: opCost, reason: 'shadow_op_spy_fleet' }],
                'l\'addebito passa da CE_money.addebitatoDalServer, una volta sola');
            assert.deepEqual(syncedCash, [],
                'rpc_execute_shadow_op muove già il cash sul server: niente risincronizzazioni');

            const execCalls = rpcCalls.filter(c => c.fn === 'rpc_execute_shadow_op');
            assert.equal(execCalls.length, 1, 'la RPC deve essere chiamata esattamente una volta');
            // Confronti campo per campo: params nasce nel realm della sandbox e
            // deepStrictEqual fallirebbe sul prototipo anche con valori uguali.
            assert.equal(execCalls[0].params.v_target_id, 'tgt_1');
            assert.equal(execCalls[0].params.v_op_type, 'spy_fleet');
            assert.equal(execCalls[0].params.v_op_cost, opCost,
                'il costo passato alla RPC deve essere quello di catalogo');
        });

        test('con fondi inferiori al costo di catalogo rifiuta: niente soldi mossi, niente RPC', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            const { addebiti } = tracciaCE_money(sandbox);
            consentiConfirm(sandbox);
            silenziaShadowRefresh(sandbox);
            sandbox.window._shadowState.targets.push({ user_id: 'tgt_1', name: 'Rivale SpA' });

            const opCost = sandbox.window.SHADOW_OPS.find(o => o.id === 'spy_fleet').cost;
            gs.cash = opCost - 1;

            await sandbox.window.shadowExecuteOp('tgt_1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, opCost - 1, 'il saldo non deve cambiare');
            assert.deepEqual(addebiti, []);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0, 'RPC non deve partire senza fondi');
        });

        test('se la RPC fallisce zero movimenti', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv({
                rpc_execute_shadow_op: async () => ({ data: null, error: { message: 'DB error' } }),
            });
            const { addebiti } = tracciaCE_money(sandbox);
            consentiConfirm(sandbox);
            silenziaShadowRefresh(sandbox);
            sandbox.window._shadowState.targets.push({ user_id: 'tgt_1', name: 'Rivale SpA' });

            const opCost = sandbox.window.SHADOW_OPS.find(o => o.id === 'spy_fleet').cost;
            gs.cash = opCost * 10;

            await sandbox.window.shadowExecuteOp('tgt_1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, opCost * 10, 'il saldo non deve cambiare se la RPC fallisce');
            assert.deepEqual(addebiti, []);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.filter(c => c.fn === 'rpc_execute_shadow_op').length, 1,
                'la RPC è stata tentata una volta sola');
        });
    });

    describe('shadowUpgradeDefense (black_ops.js)', () => {
        test('addebita il costo del tier di catalogo UNA volta via addebitatoDalServer, senza syncCash', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv({
                rpc_upgrade_shadow_defense: async () => ({ data: { new_level: 1 }, error: null }),
            });
            const { addebiti } = tracciaCE_money(sandbox);
            silenziaShadowRefresh(sandbox);

            const tierCost = costoTierDifesaDaCatalogo(1);
            gs.cash = tierCost * 5;

            await sandbox.window.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs._shadowDefenseLevel, 1, 'il livello difesa deve essere aggiornato');
            assert.equal(gs.cash, tierCost * 4, 'il saldo cala esattamente del costo del tier');
            assert.deepEqual(addebiti,
                [{ amount: tierCost, reason: 'shadow_defense_upgrade' }],
                'l\'addebito passa da CE_money.addebitatoDalServer, una volta sola');
            assert.deepEqual(syncedCash, [],
                'rpc_upgrade_shadow_defense muove già il cash sul server: niente risincronizzazioni');

            const upCalls = rpcCalls.filter(c => c.fn === 'rpc_upgrade_shadow_defense');
            assert.equal(upCalls.length, 1, 'la RPC deve essere chiamata esattamente una volta');
            assert.equal(upCalls[0].params.v_cost, tierCost,
                'il costo passato alla RPC deve essere quello di catalogo');
        });

        test('con fondi inferiori al costo del tier rifiuta: niente soldi mossi, niente RPC', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv();
            const { addebiti } = tracciaCE_money(sandbox);
            silenziaShadowRefresh(sandbox);

            const tierCost = costoTierDifesaDaCatalogo(1);
            gs.cash = tierCost - 1;

            await sandbox.window.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, tierCost - 1, 'il saldo non deve cambiare');
            assert.deepEqual(addebiti, []);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.length, 0, 'RPC non deve partire senza fondi');
        });

        test('se la RPC fallisce zero movimenti', async () => {
            const { sandbox, gs, syncedCash, rpcCalls } = setupOmbraEnv({
                rpc_upgrade_shadow_defense: async () => ({ data: null, error: { message: 'DB error' } }),
            });
            const { addebiti } = tracciaCE_money(sandbox);
            silenziaShadowRefresh(sandbox);

            const tierCost = costoTierDifesaDaCatalogo(1);
            gs.cash = tierCost * 5;

            await sandbox.window.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, tierCost * 5, 'il saldo non deve cambiare se la RPC fallisce');
            assert.deepEqual(addebiti, []);
            assert.deepEqual(syncedCash, []);
            assert.equal(rpcCalls.filter(c => c.fn === 'rpc_upgrade_shadow_defense').length, 1,
                'la RPC è stata tentata una volta sola');
        });
    });
});
