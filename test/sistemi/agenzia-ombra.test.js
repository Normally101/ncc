'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/agenzia-ombra — le operazioni coperte (black_ops.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 7. Due azioni, tutte e due
   server-authoritative:

   · `shadowExecuteOp(targetId, opId)` — esegue un'operazione contro un rivale.
     Chiede conferma, controlla i fondi in locale, chiama `rpc_execute_shadow_op`.
     Il costo si scala via `CE_money.addebitatoDalServer` **dopo** la risposta —
     ma attenzione: un'operazione che il server porta a termine e che poi
     *fallisce* (`data.success === false`) **si paga lo stesso** (hai pagato il
     tentativo); solo un `error` vero non addebita.
   · `shadowUpgradeDefense()` — sale di un livello di difesa. Stesso schema,
     `rpc_upgrade_shadow_defense`, e il livello nuovo lo detta il server.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/agenzia-ombra', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 5_000_000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.confirm = () => true;
        w.switchTab = () => {};
        w._shadowState.targets = [{ user_id: 'rivale-1', name: 'Autoblu Rivali SRL' }];
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (n) => server.chiamate.find(c => c.nome === n);
    const errori   = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const op       = () => w.SHADOW_OPS[0];                 // spy_fleet, €15.000
    const tiers    = () => R.catalogo(env, '_DEFENSE_TIERS') || [];

    // ── shadowExecuteOp ─────────────────────────────────────────────────────

    describe('shadowExecuteOp', () => {

        test('target sconosciuto: errore, niente server', async () => {
            await w.shadowExecuteOp('nessuno', op().id);
            assert.equal(chiamata('rpc_execute_shadow_op'), undefined);
            assert.ok(errori().some(m => /Target/i.test(m)));
        });

        test('conferma annullata: niente server, niente addebito', async () => {
            w.confirm = () => false;
            const prima = gs().cash;
            await w.shadowExecuteOp('rivale-1', op().id);
            assert.equal(chiamata('rpc_execute_shadow_op'), undefined);
            assert.equal(gs().cash, prima);
        });

        test('fondi insufficienti: errore, niente server', async () => {
            R.conSoldi(env, 1000);
            const prima = gs().cash;
            await w.shadowExecuteOp('rivale-1', op().id);
            assert.equal(chiamata('rpc_execute_shadow_op'), undefined);
            assert.equal(gs().cash, prima);
            assert.ok(errori().some(m => /insufficienti/i.test(m)));
        });

        test('op riuscita: RPC con gli argomenti giusti, cassa −costo', async () => {
            server.rispondiCon('rpc_execute_shadow_op', () => ({ data: { success: true, result: {} }, error: null }));
            const prima = gs().cash;

            await w.shadowExecuteOp('rivale-1', op().id);

            const c = chiamata('rpc_execute_shadow_op');
            assert.ok(c, 'il server non è stato chiamato');
            assert.equal(c.args.v_target_id, 'rivale-1');
            assert.equal(c.args.v_op_type, op().id);
            assert.equal(c.args.v_op_cost, op().cost);
            assert.equal(gs().cash, prima - op().cost);
        });

        test('op portata a termine ma fallita: si paga lo stesso il tentativo', async () => {
            server.rispondiCon('rpc_execute_shadow_op', () => ({ data: { success: false, detected: true }, error: null }));
            const prima = gs().cash;

            await w.shadowExecuteOp('rivale-1', op().id);

            assert.equal(gs().cash, prima - op().cost, 'un tentativo fallito ma eseguito va comunque pagato');
            assert.ok(errori().some(m => /fallita/i.test(m)));
        });

        test('errore del server: il giocatore NON paga', async () => {
            server.rispondiCon('rpc_execute_shadow_op', () => ({ data: null, error: { message: 'cooldown attivo' } }));
            const prima = gs().cash;

            await w.shadowExecuteOp('rivale-1', op().id);

            assert.equal(gs().cash, prima, 'la RPC è fallita e il costo è stato addebitato lo stesso');
            assert.ok(errori().some(m => /fallita|cooldown/i.test(m)));
        });
    });

    // ── shadowUpgradeDefense ────────────────────────────────────────────────

    describe('shadowUpgradeDefense', () => {

        test('difesa già al massimo: errore, niente server', async () => {
            gs()._shadowDefenseLevel = tiers().length;   // oltre l'ultimo tier
            const prima = gs().cash;

            await w.shadowUpgradeDefense();

            assert.equal(chiamata('rpc_upgrade_shadow_defense'), undefined);
            assert.equal(gs().cash, prima);
            assert.ok(errori().some(m => /massimo/i.test(m)));
        });

        test('fondi insufficienti: errore, niente server', async () => {
            gs()._shadowDefenseLevel = 0;
            R.conSoldi(env, 1000);
            const prima = gs().cash;

            await w.shadowUpgradeDefense();

            assert.equal(chiamata('rpc_upgrade_shadow_defense'), undefined);
            assert.equal(gs().cash, prima);
        });

        test('upgrade: RPC con v_cost, cassa −costo, livello dettato dal server', async () => {
            gs()._shadowDefenseLevel = 0;
            const costo = tiers()[0].cost;
            server.rispondiCon('rpc_upgrade_shadow_defense', () => ({ data: { new_level: 1 }, error: null }));
            const prima = gs().cash;

            await w.shadowUpgradeDefense();

            const c = chiamata('rpc_upgrade_shadow_defense');
            assert.ok(c);
            assert.equal(c.args.v_cost, costo);
            assert.equal(gs().cash, prima - costo);
            assert.equal(gs()._shadowDefenseLevel, 1, 'il livello nuovo è quello che ha detto il server');
        });

        test('errore del server: cassa intatta, livello invariato', async () => {
            gs()._shadowDefenseLevel = 0;
            server.rispondiCon('rpc_upgrade_shadow_defense', () => ({ data: null, error: { message: 'no' } }));
            const prima = gs().cash;

            await w.shadowUpgradeDefense();

            assert.equal(gs().cash, prima);
            assert.equal(gs()._shadowDefenseLevel, 0);
        });
    });
});
