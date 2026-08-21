'use strict';
/* ============================================================================
   test/economy/infrastructure-sync.test.js

   Regressione per il bug economico in infrastructure.js:
   le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupInfraEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('infrastructure — il server ha già mosso i soldi (addebitatoDalServer)', () => {

    describe('_infraBuyDepot', () => {
        test('acquista deposito carburante scala 300.000€ via addebitatoDalServer ma NON chiama ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 500000;
            sandbox.supabaseClient = {
                rpc: async (name, params) => {
                    if (name === 'rpc_buy_fuel_depot') return { data: { success: true }, error: null };
                    return { data: [], error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200000, 'il saldo locale deve essere scalato di 300.000€');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: rpc_buy_fuel_depot muove già companies.cash');
        });

        test('eco Realtime arrivato durante rpc_buy_fuel_depot non provoca doppio addebito o syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 500000;
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') {
                        // Simula eco realtime dal server arrivato prima del ritorno della RPC
                        gs.cash = 200000;
                        return { data: { success: true }, error: null };
                    }
                    return { data: [], error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash su eco Realtime');
        });

        test('errore RPC non scala il saldo e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 500000;
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') return { data: null, error: { message: 'Errore acquisto' } };
                    return { data: [], error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500000, 'il saldo non deve scalare se la RPC fallisce');
            assert.deepEqual(syncedCash, []);
        });

        test('fondi insufficienti: non acquista, non chiama RPC e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async () => {
                    rpcCalled = true;
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;
            gs.cash = 100000;

            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000, 'il saldo locale non deve cambiare');
            assert.equal(rpcCalled, false, 'la RPC non deve partire se i fondi sono insufficienti');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se i fondi sono insufficienti');
        });

        test('annullamento conferma utente: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            sandbox.confirm = () => false;
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500000, 'il saldo locale non deve cambiare se l\'utente annulla');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se l\'azione è annullata');
        });
    });
});
