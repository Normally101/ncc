'use strict';
/* ============================================================================
   test/economy/crypto-sync.test.js

   Regressione per il difetto di sincronizzazione in crypto.js:
   le RPC del server (rpc_buy_crypto, rpc_sell_crypto, rpc_deposit_offshore,
   rpc_withdraw_offshore) muovono GIA' il saldo `cash` sul server (24_crypto_offshore.sql).
   Pertanto il client DEVE allineare la cassa locale usando
   `CE_money.addebitatoDalServer` e `CE_money.accreditatoDalServer` SENZA chiamare
   `ServerState.syncCash`, altrimenti il saldo si muove due volte (specie se l'eco
   Realtime arriva prima della risposta) e su vendita si regalano soldi.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupCryptoEnv(rpcOverrides = {}) {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (cash) => {
                syncedCash.push(cash);
                return { success: true, cash };
            },
        },
    });

    const defaultRpc = async (fnName, params) => {
        if (rpcOverrides[fnName]) {
            return rpcOverrides[fnName](params);
        }
        if (fnName === 'rpc_buy_crypto') {
            return {
                data: { coin_id: params.v_coin_id, eur_spent: params.v_eur_in, coins_got: 50, new_price: 10 },
                error: null,
            };
        }
        if (fnName === 'rpc_sell_crypto') {
            return {
                data: { eur_received: (params.v_coins_in || 1) * 250, coins_sold: params.v_coins_in, new_price: 250 },
                error: null,
            };
        }
        if (fnName === 'rpc_deposit_offshore') {
            const fee = Math.floor(params.v_eur_amount * 0.03);
            return {
                data: { net_deposited: params.v_eur_amount - fee, fee, jurisdiction: params.v_jurisdiction },
                error: null,
            };
        }
        if (fnName === 'rpc_withdraw_offshore') {
            return {
                data: { received: params.v_eur_amount, seized: false, penalty: 0 },
                error: null,
            };
        }
        return { data: null, error: null };
    };

    env.sandbox.supabaseClient = {
        rpc: (fnName, params) => defaultRpc(fnName, params),
        from: () => ({
            select: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
                eq: () => Promise.resolve({ data: [], error: null }),
            }),
        }),
    };
    env.sandbox.window.supabaseClient = env.sandbox.supabaseClient;

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

describe('crypto — il server ha già mosso i soldi (addebitatoDalServer / accreditatoDalServer)', () => {

    describe('CE_money — porte server-authoritative', () => {
        test('addebitatoDalServer scala il saldo locale SENZA chiamare syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            assert.equal(typeof sandbox.CE_money.addebitatoDalServer, 'function', 'addebitatoDalServer deve esistere');
            const res = sandbox.CE_money.addebitatoDalServer(3000, 'test_addebito');
            assert.equal(res, true);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 7000, 'il saldo locale deve scalare di 3000');
            assert.deepEqual(syncedCash, [], 'non deve chiamare syncCash');
        });

        test('accreditatoDalServer accredita il saldo locale SENZA chiamare syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            assert.equal(typeof sandbox.CE_money.accreditatoDalServer, 'function', 'accreditatoDalServer deve esistere');
            const res = sandbox.CE_money.accreditatoDalServer(4000, 'test_accredito');
            assert.equal(res, true);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 14000, 'il saldo locale deve incrementare di 4000');
            assert.deepEqual(syncedCash, [], 'non deve chiamare syncCash');
        });
    });

    describe('cryptoBuy', () => {
        test('cryptoBuy scala cash localmente ma NON chiama syncCash (il server ha già scalato)', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            await sandbox.cryptoBuy('EMPIRE', 5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000, 'il saldo locale deve essere scalato');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già scalato cash');
        });

        test('cryptoBuy anche se l eco realtime arriva durante la RPC il saldo non viene risincronizzato', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_buy_crypto: async (params) => {
                    // Simula eco Realtime arrivato prima che la RPC ritorni la risposta
                    gs.cash = 10000 - params.v_eur_in;
                    return {
                        data: { coin_id: params.v_coin_id, eur_spent: params.v_eur_in, coins_got: 50, new_price: 10 },
                        error: null,
                    };
                },
            });
            gs.cash = 10000;
            await sandbox.cryptoBuy('EMPIRE', 5000);
            await new Promise(r => setImmediate(r));
            assert.deepEqual(syncedCash, [], 'nessuna risincronizzazione');
        });

        test('cryptoBuy con importo inferiore al minimo (< €100) non tocca cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            await sandbox.cryptoBuy('EMPIRE', 50);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('cryptoBuy se RPC fallisce per fondi insufficienti mostra errore e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash, env } = setupCryptoEnv({
                rpc_buy_crypto: async () => ({ data: null, error: { message: 'Fondi insufficienti' } }),
            });
            gs.cash = 200;
            await sandbox.cryptoBuy('EMPIRE', 5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, []);
            assert.ok(env.notifications.some(n => n.type === 'error'));
        });

        test('cryptoBuy se RPC fallisce con errore generico non tocca cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_buy_crypto: async () => ({ data: null, error: { message: 'Errore RPC' } }),
            });
            gs.cash = 10000;
            await sandbox.cryptoBuy('EMPIRE', 5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('cryptoSell', () => {
        test('cryptoSell accredita ricavo localmente ma NON chiama syncCash (il server ha già accreditato)', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_sell_crypto: async () => ({
                    data: { eur_received: 2500, coins_sold: 10, new_price: 250 },
                    error: null,
                }),
            });
            gs.cash = 1000;
            await sandbox.cryptoSell('EMPIRE', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 3500, 'il saldo locale deve essere accreditato');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato: il server ha già accreditato');
        });

        test('cryptoSell con quantità non valida (<= 0) non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 1000;
            await sandbox.cryptoSell('EMPIRE', 0);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
        });

        test('cryptoSell se RPC fallisce con errore non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_sell_crypto: async () => ({ data: null, error: { message: 'Errore vendita' } }),
            });
            gs.cash = 1000;
            await sandbox.cryptoSell('EMPIRE', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 1000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('cryptoDepositOffshore', () => {
        test('cryptoDepositOffshore scala importo localmente ma NON chiama syncCash (il server ha già scalato)', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 50000;
            await sandbox.cryptoDepositOffshore('cayman', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 30000, 'il saldo locale deve essere scalato dell\'importo depositato');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
        });

        test('cryptoDepositOffshore con importo inferiore al minimo (< €10.000) non scala e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 50000;
            await sandbox.cryptoDepositOffshore('cayman', 5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });

        test('cryptoDepositOffshore se RPC fallisce non scala e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_deposit_offshore: async () => ({ data: null, error: { message: 'Errore deposito' } }),
            });
            gs.cash = 50000;
            await sandbox.cryptoDepositOffshore('cayman', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 50000);
            assert.deepEqual(syncedCash, []);
        });
    });

    describe('cryptoWithdrawOffshore', () => {
        test('cryptoWithdrawOffshore accredita importo ricevuto ma NON chiama syncCash (il server ha già accreditato)', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_withdraw_offshore: async () => ({
                    data: { received: 15000, seized: false, penalty: 0 },
                    error: null,
                }),
            });
            gs.cash = 10000;
            await sandbox.cryptoWithdrawOffshore('cayman', 15000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 25000, 'il saldo locale deve essere accreditato dell\'importo ricevuto');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
        });

        test('cryptoWithdrawOffshore con sequestro GdF accredita solo importo netto ricevuto SENZA chiamare syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_withdraw_offshore: async () => ({
                    data: { received: 12000, seized: true, penalty: 8000 },
                    error: null,
                }),
            });
            gs.cash = 10000;
            await sandbox.cryptoWithdrawOffshore('cayman', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 22000, 'il saldo locale deve ricevere solo la parte non sequestrata');
            assert.deepEqual(syncedCash, [], 'syncCash NON deve essere chiamato');
        });

        test('cryptoWithdrawOffshore con importo non valido (<= 0) non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            await sandbox.cryptoWithdrawOffshore('cayman', 0);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('cryptoWithdrawOffshore se RPC fallisce non accredita e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv({
                rpc_withdraw_offshore: async () => ({ data: null, error: { message: 'Errore prelievo' } }),
            });
            gs.cash = 10000;
            await sandbox.cryptoWithdrawOffshore('cayman', 15000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
