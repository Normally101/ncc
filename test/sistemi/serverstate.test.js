'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/serverState — automazione HR lato server (serverState.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 46. serverState.js è ESCLUSO dai
   CORE_FILES del banco (sostituito da un mock). Qui lo carichiamo davvero, con
   un client Supabase finto, per collaudare l'unica azione ancora aperta:

   · buyHRAutomation(costInCoins, days) — inoltra a `rpc_buy_hr_automation` con
     `{ v_cost_in_coins, v_days }` (default days = 7).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function ssEnv() {
    const env = createGameEnv([...CORE_FILES, 'serverState.js'], {});
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/serverState — buyHRAutomation', () => {
    let env, w, rpcCalls;

    beforeEach(async () => {
        env = ssEnv();
        w = env.sandbox.window;
        rpcCalls = [];
        // Client finto: la snapshot trova un'azienda (così _ensureCompany non
        // tenta di crearne una), tutte le tabelle rispondono vuote, e .rpc() registra.
        const q = () => {
            const p = Promise.resolve({ data: [], error: null });
            p.select = () => q(); p.order = () => q(); p.limit = () => q(); p.eq = () => q();
            p.maybeSingle = async () => ({ data: { id: 'co1', user_id: 'u1', company_name: 'Test', cash: 0 }, error: null });
            return p;
        };
        const client = {
            from: () => q(),
            rpc: async (name, params) => { rpcCalls.push({ name, params }); return { data: { ok: true }, error: null }; },
            channel: () => ({ on() { return this; }, subscribe() { return this; } }),
            removeChannel() {},
        };
        await w.ServerState.init(client);
        env.stopAllIntervals();
    });
    afterEach(() => env.stopAllIntervals());

    test('buyHRAutomation: inoltra a rpc_buy_hr_automation con costo e giorni', async () => {
        await w.ServerState.buyHRAutomation(150, 7);

        const c = rpcCalls.find(x => x.name === 'rpc_buy_hr_automation');
        assert.ok(c, 'la RPC non è stata chiamata');
        assert.equal(c.params.v_cost_in_coins, 150);
        assert.equal(c.params.v_days, 7);
    });

    test('buyHRAutomation: giorni di default = 7', async () => {
        await w.ServerState.buyHRAutomation(150);
        const c = rpcCalls.find(x => x.name === 'rpc_buy_hr_automation');
        assert.equal(c.params.v_days, 7);
    });
});
