'use strict';
/* ============================================================================
   test/azioni/ombre.test.js — Banco di prova per le azioni dell'Agenzia Ombra
   (black_ops.js): shadowExecuteOp, shadowUpgradeDefense.

   Regole verificate:
   - importo giusto, UNA SOLA volta;
   - il denaro passa da window.CE_money.addebitatoDalServer (la RPC ha già
     mosso il saldo lato server), MAI da gameState.cash -= locale;
   - rifiuti: fondi insufficienti, bersaglio inesistente, operazione inesistente.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente di gioco con mock supabaseClient per le RPC shadow.
 * I test registrano le chiamate RPC e verificano i movimenti di cassa.
 */
function creaMondo(opzioni = {}) {
    const registro = { rpc: [], movimentiCash: [] };

    const env = freshEnv();
    const sb = env.sandbox;
    const gs = sb.gameState;

    // Stato minimo
    gs.cash = opzioni.cash ?? 500000;
    gs._shadowDefenseLevel = opzioni.defenseLevel ?? 0;

    // IMPORTANTE: black_ops.js crea window._shadowState (non gameState._shadowState)
    sb._shadowState = { targets: [], log: [], _lastFetch: 0 };
    sb._shadowState.targets = opzioni.targets || [
        { user_id: "target_1", name: "Competitor A", reputation: 3.5, defense_lvl: 1, hq_city: "Roma" },
        { user_id: "target_2", name: "Competitor B", reputation: 4.0, defense_lvl: 2, hq_city: "Milano" },
    ];

    // Mock supabaseClient con rpc che registra le chiamate
    const rpcHandlers = opzioni.rpcHandlers || {};
    sb.supabaseClient = {
        rpc: async (nome, args) => {
            registro.rpc.push({ nome, args });
            const handler = rpcHandlers[nome];
            if (handler) return await handler(args);
            // Default responses
            if (nome === "rpc_execute_shadow_op") return { data: { success: true, result: {} }, error: null };
            if (nome === "rpc_upgrade_shadow_defense") return { data: { new_level: 1 }, error: null };
            if (nome === "rpc_get_shadow_targets") return { data: [], error: null };
            if (nome === "rpc_get_shadow_ops_log") return { data: [], error: null };
            return { data: null, error: null };
        },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
    };
    sb.window.supabaseClient = sb.supabaseClient;
    sb.currentUser = { id: "user_test_1" };
    sb.window.currentUser = sb.currentUser;

    // Spia su CE_money.addebitatoDalServer
    const origAddeb = sb.CE_money.addebitatoDalServer.bind(sb.CE_money);
    sb.CE_money.addebitatoDalServer = (importo, motivo) => {
        registro.movimentiCash.push({ via: "addebitatoDalServer", importo, motivo });
        return origAddeb(importo, motivo);
    };

    // Neutralizza UI
    sb.showNotification = (msg, type) => { env.notifications.push({ msg, type }); };
    sb.logToMap = () => {};
    sb.saveGame = () => {};
    sb.updateUI = () => {};
    sb.switchTab = () => {};

    return { env, sb, gs, registro };
}

describe("azioni ombra - black_ops.js", () => {

    describe("shadowExecuteOp", () => {
        let mondo;
        beforeEach(() => { mondo = creaMondo(); });
        afterEach(() => mondo.env.stopAllIntervals());

        test("esegue operazione valida: RPC una volta, addebito UNA volta via addebitatoDalServer", async () => {
            const { sb, gs, registro, env } = mondo;
            const targetId = "target_1";
            const opId = "spy_fleet"; // costa 15000
            const cashPrima = gs.cash;

            await sb.shadowExecuteOp(targetId, opId);

            const chiamate = registro.rpc.filter(r => r.nome === "rpc_execute_shadow_op");
            assert.equal(chiamate.length, 1, "la RPC deve partire una volta sola");
            assert.equal(chiamate[0].args.v_target_id, targetId);
            assert.equal(chiamate[0].args.v_op_type, opId);
            assert.equal(chiamate[0].args.v_op_cost, 15000);

            const addebiti = registro.movimentiCash.filter(m => m.via === "addebitatoDalServer");
            assert.equal(addebiti.length, 1, "un solo addebito via addebitatoDalServer");
            assert.equal(addebiti[0].importo, 15000);
            assert.equal(addebiti[0].motivo, "shadow_op_spy_fleet");

            assert.equal(gs.cash, cashPrima - 15000, "cassa scalata una volta sola");
            assert.ok(env.notifications.some(n => n.type === "success"), "notifica di successo");
        });

        test("operazione inesistente: rifiuto silenzioso, nessuna RPC", async () => {
            const { sb, registro } = mondo;

            await assert.doesNotReject(() => sb.shadowExecuteOp("target_1", "op_inesistente"));

            assert.equal(registro.rpc.length, 0);
            assert.equal(registro.movimentiCash.length, 0);
        });

        test("target inesistente: rifiuto con notifica, nessuna RPC", async () => {
            const { sb, gs, registro, env } = mondo;
            gs.cash = 500000;

            await sb.shadowExecuteOp("target_fantasma", "spy_fleet");

            assert.equal(registro.rpc.length, 0);
            assert.equal(registro.movimentiCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === "error" && n.msg.includes("Target non trovato")));
        });

        test("fondi insufficienti: rifiuto PRIMA della RPC, nessuna spesa", async () => {
            const { sb, gs, registro, env } = mondo;
            gs.cash = 100; // spy_fleet costa 15000

            await sb.shadowExecuteOp("target_1", "spy_fleet");

            assert.equal(registro.rpc.length, 0, "nessuna chiamata al server");
            assert.equal(registro.movimentiCash.length, 0);
            assert.equal(gs.cash, 100);
            assert.ok(env.notifications.some(n => n.type === "error" && n.msg.includes("Fondi insufficienti")));
        });

        test("RPC fallita (server rifiuta): nessun addebito locale, notifica errore", async () => {
            const mondoErr = creaMondo({
                rpcHandlers: {
                    rpc_execute_shadow_op: async () => ({
                        data: null,
                        error: { message: "Operazione rilevata dalla difesa" }
                    }),
                },
            });
            const { sb, gs, registro, env } = mondoErr;
            gs.cash = 500000;

            await sb.shadowExecuteOp("target_1", "spy_fleet");

            assert.equal(registro.rpc.length, 1, "il tentativo arriva al server");
            assert.equal(registro.movimentiCash.length, 0, "se la RPC fallisce il client non scala nulla");
            assert.equal(gs.cash, 500000);
            assert.ok(env.notifications.some(n => n.type === "error"));
            mondoErr.env.stopAllIntervals();
        });

        test("doppio click: il secondo click RI-esegue l'effetto (BUG noto: nessuna guardia idempotenza)", async () => {
            let gate;
            const p = new Promise(r => { gate = r; });
            let count = 0;
            const amb = creaMondo({
                rpcHandlers: {
                    rpc_execute_shadow_op: async () => {
                        count++;
                        await p;
                        return { data: { success: true, result: {} }, error: null };
                    },
                },
            });
            amb.gs.cash = 500000;

            const p1 = amb.sb.shadowExecuteOp("target_1", "spy_fleet");
            const p2 = amb.sb.shadowExecuteOp("target_1", "spy_fleet");
            gate();
            await Promise.all([p1, p2]);

            // BUG NOTO: shadowExecuteOp non controlla se un'operazione è già in corso
            // sullo stesso target. Il doppio click fa partire DUE RPC e DUE addebiti.
            assert.equal(count, 2, "BUG: il secondo click NON è ignorato, fa partire una seconda RPC");
            const addebiti = amb.registro.movimentiCash.filter(m => m.via === "addebitatoDalServer");
            assert.equal(addebiti.length, 2, "BUG: doppio addebito");
            assert.equal(amb.gs.cash, 500000 - 30000, "BUG: cassa scalata due volte");
            amb.env.stopAllIntervals();
        });
    });

    describe("shadowUpgradeDefense", () => {
        let mondo;
        beforeEach(() => { mondo = creaMondo(); });
        afterEach(() => mondo.env.stopAllIntervals());

        test("upgrade valido: RPC una volta, addebito UNA volta via addebitatoDalServer, livello sale", async () => {
            const { sb, gs, registro, env } = mondo;
            gs.cash = 500000;
            gs._shadowDefenseLevel = 0;

            await sb.shadowUpgradeDefense();

            const chiamate = registro.rpc.filter(r => r.nome === "rpc_upgrade_shadow_defense");
            assert.equal(chiamate.length, 1);
            assert.equal(chiamate[0].args.v_cost, 50000);

            const addebiti = registro.movimentiCash.filter(m => m.via === "addebitatoDalServer");
            assert.equal(addebiti.length, 1);
            assert.equal(addebiti[0].importo, 50000);
            assert.equal(addebiti[0].motivo, "shadow_defense_upgrade");

            assert.equal(gs.cash, 500000 - 50000);
            assert.equal(gs._shadowDefenseLevel, 1);
            assert.ok(env.notifications.some(n => n.type === "success" && n.msg.includes("Livello 1")));
        });

        test("fondi insufficienti: rifiuto PRIMA della RPC", async () => {
            const { sb, gs, registro, env } = mondo;
            gs.cash = 100;
            gs._shadowDefenseLevel = 0;

            await sb.shadowUpgradeDefense();

            assert.equal(registro.rpc.length, 0);
            assert.equal(registro.movimentiCash.length, 0);
            assert.equal(gs.cash, 100);
            assert.ok(env.notifications.some(n => n.type === "error" && n.msg.includes("Fondi insufficienti")));
        });

        test("già al massimo: rifiuto con notifica", async () => {
            const { sb, gs, registro, env } = mondo;
            gs.cash = 500000;
            gs._shadowDefenseLevel = 5; // massimo

            await sb.shadowUpgradeDefense();

            assert.equal(registro.rpc.length, 0);
            assert.equal(registro.movimentiCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === "error" && n.msg.includes("massimo")));
        });

        test("RPC fallita: nessun addebito, livello invariato", async () => {
            const mondoErr = creaMondo({
                rpcHandlers: {
                    rpc_upgrade_shadow_defense: async () => ({
                        data: null,
                        error: { message: "Errore server" }
                    }),
                },
            });
            const { sb, gs, registro, env } = mondoErr;
            gs.cash = 500000;
            gs._shadowDefenseLevel = 0;

            await sb.shadowUpgradeDefense();

            assert.equal(registro.rpc.length, 1);
            assert.equal(registro.movimentiCash.length, 0);
            assert.equal(gs.cash, 500000);
            assert.equal(gs._shadowDefenseLevel, 0);
            assert.ok(env.notifications.some(n => n.type === "error"));
            mondoErr.env.stopAllIntervals();
        });

        test("doppio click: il secondo click RI-esegue l'effetto (BUG noto: nessuna guardia idempotenza)", async () => {
            let gate;
            const p = new Promise(r => { gate = r; });
            let count = 0;
            const amb = creaMondo({
                rpcHandlers: {
                    rpc_upgrade_shadow_defense: async () => {
                        count++;
                        await p;
                        return { data: { new_level: 1 }, error: null };
                    },
                },
            });
            amb.gs.cash = 500000;
            amb.gs._shadowDefenseLevel = 0;

            const p1 = amb.sb.shadowUpgradeDefense();
            const p2 = amb.sb.shadowUpgradeDefense();
            gate();
            await Promise.all([p1, p2]);

            // BUG NOTO: shadowUpgradeDefense non controlla se un upgrade è già in corso.
            // Il doppio click fa partire DUE RPC e DUE addebiti.
            assert.equal(count, 2, "BUG: il secondo click NON è ignorato, fa partire una seconda RPC");
            const addebiti = amb.registro.movimentiCash.filter(m => m.via === "addebitatoDalServer");
            assert.equal(addebiti.length, 2, "BUG: doppio addebito");
            assert.equal(amb.gs.cash, 500000 - 100000, "BUG: cassa scalata due volte");
            amb.env.stopAllIntervals();
        });
    });
});