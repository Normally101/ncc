'use strict';
/* ============================================================================
   test/economy/crypto-sync.test.js

   Regressione per il bug economico in crypto.js:
   tutte le funzioni di spesa e incasso DEVONO passare da CE_money (spend / earn)
   e sincronizzare la cassa col server tramite ServerState.syncCash.
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

describe('crypto — sincronizzazione cassa col server (CE_money)', () => {

    describe('cryptoBuy', () => {
        test('cryptoBuy scala cash e sincronizza con ServerState.syncCash tramite CE_money', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            await sandbox.cryptoBuy('EMPIRE', 5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000, 'il saldo locale deve essere scalato');
            assert.deepEqual(syncedCash, [5000], 'syncCash deve ricevere il saldo aggiornato');
        });

        test('cryptoBuy con fondi insufficienti non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 200;
            await sandbox.cryptoBuy('EMPIRE', 5000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 200, 'il saldo non deve cambiare');
            assert.deepEqual(syncedCash, [], 'nessuna chiamata a syncCash');
        });

        test('cryptoBuy con importo inferiore al minimo (< €100) non scala cash e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 10000;
            await sandbox.cryptoBuy('EMPIRE', 50);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });

        test('cryptoBuy se RPC fallisce con errore non scala cash e non chiama syncCash', async () => {
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
        test('cryptoSell accredita ricavo e sincronizza con ServerState.syncCash tramite CE_money', async () => {
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
            assert.deepEqual(syncedCash, [3500], 'syncCash deve ricevere il saldo aggiornato');
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
        test('cryptoDepositOffshore scala importo e sincronizza con ServerState.syncCash tramite CE_money', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 50000;
            await sandbox.cryptoDepositOffshore('cayman', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 30000, 'il saldo locale deve essere scalato dell\'importo depositato');
            assert.deepEqual(syncedCash, [30000], 'syncCash deve ricevere il saldo aggiornato');
        });

        test('cryptoDepositOffshore con fondi insufficienti non scala e non chiama syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupCryptoEnv();
            gs.cash = 5000;
            await sandbox.cryptoDepositOffshore('cayman', 20000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 5000);
            assert.deepEqual(syncedCash, []);
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
        test('cryptoWithdrawOffshore accredita importo ricevuto e sincronizza con ServerState.syncCash tramite CE_money', async () => {
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
            assert.deepEqual(syncedCash, [25000], 'syncCash deve ricevere il saldo aggiornato');
        });

        test('cryptoWithdrawOffshore con sequestro GdF accredita solo importo netto ricevuto', async () => {
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
            assert.deepEqual(syncedCash, [22000], 'syncCash deve ricevere il saldo aggiornato');
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
