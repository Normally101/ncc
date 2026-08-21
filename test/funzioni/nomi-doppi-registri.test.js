'use strict';
/* ============================================================================
   test/funzioni/nomi-doppi-registri.test.js — Risoluzione collisioni di nomi dai registri

   Collauda la separazione dei nomi per le 3 collisioni più critiche
   censite nei registri delle azioni:
   1. listCarForSale (engine-fleet.js) vs listP2PCarForSale (p2p-market.js)
   2. _b2bSb / _b2bUid (b2b.js) vs _p2pSb / _p2pUid (p2p-market.js, p2p-render.js)
   3. _kpiFinance (ui-finance.js) vs _kpiRanking (ui-ranking.js)
   ============================================================================ */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

describe('nomi doppi dai registri — separazione e raggiungibilità', () => {

    test('1. listCarForSale (locale/NPC) e listP2PCarForSale (P2P/server) coesistono e operano sui rispettivi canali', async () => {
        const env = freshEnv({ render: true });
        const { sandbox } = env;

        // Entrambi i file caricati
        assert.equal(typeof sandbox.listCarForSale, 'function', 'listCarForSale (engine-fleet.js) deve essere definita');
        assert.equal(typeof sandbox.listP2PCarForSale, 'function', 'listP2PCarForSale (p2p-market.js) deve essere definita con nome distinto');

        // Setup auto in flotta
        sandbox.gameState.fleet = [
            { id: 'car_local_1', name: 'Auto Locale', tier: 'business', condition: 90, isLease: false },
            { id: 'car_p2p_1', name: 'Auto P2P', tier: 'business', condition: 90, isLease: false },
        ];
        sandbox.gameState.marketplace = [];

        // Chiamata 1: listCarForSale (locale) inserisce in gameState.marketplace
        sandbox.listCarForSale('car_local_1', 25000);
        assert.equal(sandbox.gameState.marketplace.length, 1, 'listCarForSale deve scrivere in gameState.marketplace');
        assert.equal(sandbox.gameState.marketplace[0].carId, 'car_local_1');
        assert.equal(sandbox.gameState.marketplace[0].askPrice, 25000);

        // Chiamata 2: listP2PCarForSale (P2P) chiama RPC Supabase
        let rpcCalled = false;
        sandbox.currentUser = { id: 'usr_test' };
        sandbox.window.currentUser = sandbox.currentUser;
        sandbox.supabaseClient = {
            rpc: async (name, params) => {
                if (name === 'rpc_list_car_for_sale') {
                    rpcCalled = true;
                    assert.equal(params.v_ask_price, 30000);
                    return { data: { id: 'lst_123' }, error: null };
                }
                return { data: null, error: null };
            },
            from: () => ({ select: () => ({ gt: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
        };
        sandbox.window.supabaseClient = sandbox.supabaseClient;

        await sandbox.listP2PCarForSale('car_p2p_1', 30000);
        assert.ok(rpcCalled, 'listP2PCarForSale deve invocare rpc_list_car_for_sale');
        env.stopAllIntervals();
    });

    test('2. b2b.js e p2p-market.js non condividono helper _sb e _uid con collisione globale', () => {
        const b2bSrc = fs.readFileSync(path.join(ROOT, 'b2b.js'), 'utf8');
        const p2pSrc = fs.readFileSync(path.join(ROOT, 'p2p-market.js'), 'utf8');

        // Verifica che b2b.js usi _b2bSb e _b2bUid anziché _sb e _uid globali generici
        assert.ok(b2bSrc.includes('function _b2bSb()'), 'b2b.js deve definire _b2bSb');
        assert.ok(b2bSrc.includes('function _b2bUid()'), 'b2b.js deve definire _b2bUid');
        assert.ok(!b2bSrc.match(/function\s+_sb\s*\(/), 'b2b.js non deve definire _sb generico');
        assert.ok(!b2bSrc.match(/function\s+_uid\s*\(/), 'b2b.js non deve definire _uid generico');

        // Verifica che p2p-market.js usi _p2pSb e _p2pUid
        assert.ok(p2pSrc.includes('function _p2pSb()'), 'p2p-market.js deve definire _p2pSb');
        assert.ok(p2pSrc.includes('function _p2pUid()'), 'p2p-market.js deve definire _p2pUid');
        assert.ok(!p2pSrc.match(/function\s+_sb\s*\(/), 'p2p-market.js non deve definire _sb generico');
        assert.ok(!p2pSrc.match(/function\s+_uid\s*\(/), 'p2p-market.js non deve definire _uid generico');
    });

    test('3. ui-finance.js e ui-ranking.js usano helper KPI con nomi dedicati _kpiFinance e _kpiRanking', () => {
        const finSrc = fs.readFileSync(path.join(ROOT, 'ui-finance.js'), 'utf8');
        const rnkSrc = fs.readFileSync(path.join(ROOT, 'ui-ranking.js'), 'utf8');

        assert.ok(finSrc.includes('function _kpiFinance('), 'ui-finance.js deve usare _kpiFinance');
        assert.ok(!finSrc.match(/function\s+_kpi\s*\(/), 'ui-finance.js non deve definire _kpi generico');

        assert.ok(rnkSrc.includes('function _kpiRanking('), 'ui-ranking.js deve usare _kpiRanking');
        assert.ok(!rnkSrc.match(/function\s+_kpi\s*\(/), 'ui-ranking.js non deve definire _kpi generico');
    });
});
