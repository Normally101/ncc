'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

function createSandbox(files) {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tab-container"></div></body></html>');
    const sandbox = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        Date, Math, JSON, Promise, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
        confirm: () => true,
        alert: () => {},
        document: dom.window.document,
        window: null,
        gameState: {
            cash: 100000,
            driverCoins: 50,
            reputation: 4.5,
            fleet: [{ id: 'c1', name: 'Berlina', tier: 'standard' }],
            drivers: [],
            stockPrices: {},
            stockHoldings: {},
            stockHistory: {},
            stockPrevPrices: {},
            companyName: 'Test Corp',
        },
        supabaseClient: {
            from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }) }) }) }),
            rpc: async () => ({ data: null, error: null }),
            channel: () => ({ on: () => ({ subscribe: () => {} }) }),
            removeChannel: () => {},
        },
        currentUser: { id: 'usr_test_123' },
        ceAct: (fn, args) => `data-ce-act="${fn}"`,
        showNotification: () => {},
        logToMap: () => {},
        updateUI: () => {},
        saveGame: async () => {},
        _hasWealthManager: () => true,
        _getCreditTier: () => ({ loanLimit: 1000000, color: '#3fb950', label: 'Ottimo', rate: 0.05 }),
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    for (const file of files) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        vm.runInContext(code, sandbox, { filename: file });
    }
    return sandbox;
}

describe('Collisioni di nomi globali risolte', () => {

    test('1. _sb e _uid sono separati con prefissi univoci (_p2pSb / _b2bSb)', () => {
        const sandbox = createSandbox(['p2p-market.js', 'b2b.js']);

        assert.equal(typeof sandbox._p2pSb, 'function', '_p2pSb deve essere una funzione definita in p2p-market.js');
        assert.equal(typeof sandbox._b2bSb, 'function', '_b2bSb deve essere una funzione definita in b2b.js');
        assert.equal(sandbox._p2pSb(), sandbox.supabaseClient, '_p2pSb deve restituire supabaseClient');
        assert.equal(sandbox._b2bSb(), sandbox.supabaseClient, '_b2bSb deve restituire supabaseClient');
    });

    test('2. _uid è separato con prefissi univoci (_p2pUid / _b2bUid)', () => {
        const sandbox = createSandbox(['p2p-market.js', 'b2b.js']);

        assert.equal(typeof sandbox._p2pUid, 'function', '_p2pUid deve essere una funzione definita in p2p-market.js');
        assert.equal(typeof sandbox._b2bUid, 'function', '_b2bUid deve essere una funzione definita in b2b.js');
        assert.equal(sandbox._p2pUid(), 'usr_test_123', '_p2pUid deve restituire l ID utente corrente');
        assert.equal(sandbox._b2bUid(), 'usr_test_123', '_b2bUid deve restituire l ID utente corrente');
    });

    test('3. _kpi in ui-finance.js e ui-ranking.js usano nomi distinti (_finKpi / _rankKpi)', () => {
        const financeSrc = fs.readFileSync(path.join(ROOT, 'ui-finance.js'), 'utf8');
        const rankingSrc = fs.readFileSync(path.join(ROOT, 'ui-ranking.js'), 'utf8');

        assert.ok(financeSrc.includes('_finKpi'), 'ui-finance.js deve usare _finKpi');
        assert.ok(!financeSrc.includes('function _kpi('), 'ui-finance.js non deve definire _kpi');
        assert.ok(rankingSrc.includes('_rankKpi'), 'ui-ranking.js deve usare _rankKpi');
        assert.ok(!rankingSrc.includes('function _kpi('), 'ui-ranking.js non deve definire _kpi');

        const sandbox = createSandbox(['ui-finance.js', 'ui-ranking.js']);
        sandbox.renderTabFinance();
        const financeHtml = sandbox.document.getElementById('tab-container').innerHTML;
        assert.ok(financeHtml.includes('Portfolio Totale'), 'renderTabFinance deve renderizzare i KPI finanziari');
    });
});
