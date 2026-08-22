'use strict';
/* ============================================================================
   test/economy/infrastructure-sync.test.js

   Regressione per il doppio conteggio in infrastructure.js (_infraBuyDepot):
   la RPC rpc_buy_fuel_depot scala GIA' companies.cash sul server
   (30_sql_patch.sql: UPDATE companies SET cash = cash - v_cost …), quindi il
   client deve solo riallineare la previsione locale con
   CE_money.addebitatoDalServer — SENZA richiamare ServerState.syncCash, che
   rispedirebbe al server il totale calcolato dal browser e, se arriva prima
   l'eco Realtime della scrittura del server, addebiterrebbe il deposito due
   volte.
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
        test('acquista deposito carburante scala 300.000€ via addebitatoDalServer e NON chiama ServerState.syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async (name, params) => {
                    if (name === 'rpc_buy_fuel_depot') {
                        rpcCalled = true;
                        return { data: { success: true }, error: null };
                    }
                    if (name === 'rpc_get_fuel_depots') return { data: [], error: null };
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcCalled, true, 'deve chiamare la RPC rpc_buy_fuel_depot');
            assert.equal(gs.cash, 200000, 'il saldo locale deve essere scalato di 300.000€');
            assert.deepEqual(syncedCash, [], 'ServerState.syncCash NON deve essere chiamato: rpc_buy_fuel_depot aggiorna già companies.cash sul server');
        });

        test('eco Realtime arrivato durante la RPC non provoca doppio addebito o syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') {
                        // Simula arrivo dell'eco Realtime dal server durante l'esecuzione della RPC
                        gs.cash = 200000;
                        return { data: { success: true }, error: null };
                    }
                    if (name === 'rpc_get_fuel_depots') return { data: [], error: null };
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione con syncCash');
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
            assert.equal(rpcCalled, false, 'la RPC non deve essere chiamata');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se i fondi sono insufficienti');
        });

        test('annullamento conferma utente: non scala denaro, non chiama RPC e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            let rpcCalled = false;
            sandbox.supabaseClient = {
                rpc: async () => {
                    rpcCalled = true;
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            sandbox.confirm = () => false;
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000, 'il saldo locale non deve cambiare se l\'utente annulla');
            assert.equal(rpcCalled, false, 'la RPC non deve essere chiamata');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash se l\'azione è annullata');
        });

        test('errore RPC: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            sandbox.supabaseClient = {
                rpc: async (name) => {
                    if (name === 'rpc_buy_fuel_depot') return { data: null, error: new Error('DB error') };
                    return { data: null, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 500000, 'il saldo non deve essere scalato se la RPC fallisce');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata syncCash se la RPC fallisce');
        });
    });
});
