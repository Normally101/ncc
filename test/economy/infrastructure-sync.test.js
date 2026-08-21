'use strict';
/* ============================================================================
   test/economy/infrastructure-sync.test.js

   Regressione per il difetto di sincronizzazione in infrastructure.js:
   la RPC rpc_buy_fuel_depot muove GIA' il saldo `cash` sul server (30_sql_patch.sql).
   Pertanto il client DEVE allineare la cassa locale usando
   `CE_money.addebitatoDalServer` SENZA chiamare `ServerState.syncCash`, altrimenti
   il saldo si muove due volte (specie se l'eco Realtime arriva prima della risposta).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupInfraEnv(rpcOverrides = {}) {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });

    const defaultRpc = async (fnName, params) => {
        if (rpcOverrides[fnName]) {
            return rpcOverrides[fnName](params);
        }
        if (fnName === 'rpc_buy_fuel_depot') {
            return {
                data: { success: true, province_id: params.v_province_id, province_name: 'Roma Capitale', cost: 300000 },
                error: null,
            };
        }
        return { data: null, error: null };
    };

    env.sandbox.supabaseClient = {
        rpc: (fnName, params) => defaultRpc(fnName, params),
    };
    env.sandbox.window.supabaseClient = env.sandbox.supabaseClient;

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('infrastructure — il server ha già scalato i soldi (addebitatoDalServer)', () => {

    describe('_infraBuyDepot', () => {
        test('_infraBuyDepot scala 300.000€ localmente ma NON chiama syncCash (il server ha già scalato)', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200000, 'il saldo locale deve essere scalato di 300.000€');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già scalato');
        });

        test('_infraBuyDepot anche se l eco realtime arriva durante la RPC il saldo non viene risincronizzato', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv({
                rpc_buy_fuel_depot: async (params) => {
                    // Simula eco Realtime arrivato prima che la RPC ritorni la risposta
                    gs.cash = 500000 - 300000;
                    return {
                        data: { success: true, province_id: params.v_province_id, province_name: 'Roma Capitale', cost: 300000 },
                        error: null,
                    };
                },
            });
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione');
        });

        test('fondi insufficienti: non acquista e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupInfraEnv();
            gs.cash = 100000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 100000, 'il saldo locale non deve cambiare');
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

        test('errore RPC: non scala denaro e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, env } = setupInfraEnv({
                rpc_buy_fuel_depot: async () => ({
                    data: null,
                    error: { message: 'Provincia già occupata' },
                }),
            });
            gs.cash = 500000;
            await sandbox._infraBuyDepot('prov_roma', 'Roma Capitale');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500000, 'il saldo locale non deve cambiare se la RPC fallisce');
            assert.deepEqual(syncedCash, []);
            assert.ok(env.notifications.some(n => n.type === 'error'));
        });
    });
});
