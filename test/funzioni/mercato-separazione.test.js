'use strict';
/* ============================================================================
   test/funzioni/mercato-separazione.test.js

   Verifica che le due funzioni di vendita (NPC vs P2P) siano distinte e indipendenti:
   - window.listCarForSale (engine-fleet.js) scrive in gameState.marketplace
   - window.p2pListCarForSale (p2p-market.js) invoca la RPC rpc_list_car_for_sale
   ============================================================================ */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('Separazione mercato NPC vs mercato P2P', () => {
    let env, sandbox, gs, rpcCalls;

    beforeEach(() => {
        rpcCalls = [];
        env = freshEnv();
        sandbox = env.sandbox;
        gs = sandbox.gameState;

        sandbox.supabaseClient = {
            rpc: async (name, params) => {
                rpcCalls.push({ name, params });
                return { data: { id: 'p2p_list_1' }, error: null };
            },
            from: () => ({
                select: () => ({
                    gt: () => ({
                        order: () => ({
                            limit: async () => ({ data: [], error: null }),
                        }),
                    }),
                    or: () => ({
                        order: () => ({
                            limit: async () => ({ data: [], error: null }),
                        }),
                    }),
                }),
            }),
        };
        sandbox.window.supabaseClient = sandbox.supabaseClient;
        sandbox.currentUser = { id: 'usr_test_1' };
        sandbox.window.currentUser = sandbox.currentUser;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    test('listCarForSale inserisce l annuncio in gameState.marketplace senza chiamare la RPC', async () => {
        gs.marketplace = [];
        const car = gs.fleet[0];
        assert.ok(car, 'deve esserci un auto in flotta');

        sandbox.listCarForSale(car.id, 25000);

        assert.equal(rpcCalls.length, 0, 'listCarForSale non deve invocare RPC Supabase');
        assert.equal(gs.marketplace.length, 1, 'listCarForSale deve inserire l annuncio in gameState.marketplace');
        assert.equal(gs.marketplace[0].carId, car.id);
        assert.equal(gs.marketplace[0].askPrice, 25000);
    });

    test('p2pListCarForSale invoca rpc_list_car_for_sale e non tocca gameState.marketplace', async () => {
        gs.marketplace = [];
        const car = gs.fleet[0];
        assert.ok(car, 'deve esserci un auto in flotta');

        assert.equal(typeof sandbox.p2pListCarForSale, 'function', 'p2pListCarForSale deve essere definita');
        /* Prezzo derivato dalla forbice (30/08): dal momento in cui il
           venditore sceglie il prezzo, p2pListCarForSale rifiuta quello
           fuori mercato. Si legge la stima invece di scrivere una cifra,
           cosi' il test non si rompe se la banda cambia. */
        const stima = sandbox.window._valoreStimatoAuto(car);
        await sandbox.p2pListCarForSale(car.id, stima);

        assert.equal(rpcCalls.length, 1, 'p2pListCarForSale deve chiamare la RPC');
        assert.equal(rpcCalls[0].name, 'rpc_list_car_for_sale');
        assert.equal(rpcCalls[0].params.v_ask_price, stima);
        assert.equal(gs.marketplace.length, 0, 'p2pListCarForSale non deve scrivere in gameState.marketplace');
    });
});
