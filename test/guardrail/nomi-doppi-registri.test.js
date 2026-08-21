'use strict';
/* ============================================================================
   test/guardrail/nomi-doppi-registri.test.js

   Verifica la risoluzione delle collisioni di nomi globali tra moduli:
   1. _p2pSb vs _b2bSb (p2p-market.js vs b2b.js)
   2. _p2pUid vs _b2bUid (p2p-market.js vs b2b.js)
   3. Disambiguazione helper _financeKpi vs _rankingKpi (ui-finance.js vs ui-ranking.js)
   ============================================================================ */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

function createIsolatedEnv(fileList) {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tab-container"></div></body></html>');
    const sandbox = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        Date, Math, JSON, Promise, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set, Symbol,
        document: dom.window.document,
        window: null,
        supabaseClient: { rpc: async () => ({ data: null, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
        currentUser: { id: 'usr_test_123' },
        gameState: { cash: 50000, reputation: 4.0, fleet: [], drivers: [], stockPrices: {}, stockHoldings: {} },
        showNotification: () => {},
        logToMap: () => {},
        ceAct: (name, args) => `data-ce-act="${name}"`,
        CE_Sec: { escHtml: s => s, userError: s => s },
        CE_money: { addebitatoDalServer: () => {}, accreditatoDalServer: () => {}, spendDC: () => true },
        saveGame: async () => {},
        updateUI: () => {},
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);

    for (const f of fileList) {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        vm.runInContext(src, sandbox, { filename: f });
    }

    return sandbox;
}

describe('risoluzione collisioni di nomi globali dai registri', () => {

    test('1. _p2pSb e _b2bSb sono distinti e raggiungibili caricando p2p-market.js e b2b.js insieme', () => {
        const sandbox = createIsolatedEnv(['p2p-market.js', 'b2b.js']);

        assert.equal(typeof sandbox._p2pSb, 'function', '_p2pSb deve essere definito come funzione in p2p-market.js');
        assert.equal(typeof sandbox._b2bSb, 'function', '_b2bSb deve essere definito come funzione in b2b.js');
        assert.equal(sandbox._p2pSb(), sandbox.supabaseClient, '_p2pSb deve restituire window.supabaseClient');
        assert.equal(sandbox._b2bSb(), sandbox.supabaseClient, '_b2bSb deve restituire window.supabaseClient');
    });

    test('2. _p2pUid e _b2bUid sono distinti e raggiungibili caricando p2p-market.js e b2b.js insieme', () => {
        const sandbox = createIsolatedEnv(['p2p-market.js', 'b2b.js']);

        assert.equal(typeof sandbox._p2pUid, 'function', '_p2pUid deve essere definito come funzione in p2p-market.js');
        assert.equal(typeof sandbox._b2bUid, 'function', '_b2bUid deve essere definito come funzione in b2b.js');
        assert.equal(sandbox._p2pUid(), 'usr_test_123', '_p2pUid deve restituire l id utente corrente');
        assert.equal(sandbox._b2bUid(), 'usr_test_123', '_b2bUid deve restituire l id utente corrente');
    });

    test('3. _financeKpi e _rankingKpi sono disambiguati e raggiungibili con palette distinte', async () => {
        const sandbox = createIsolatedEnv(['ui-finance.js', 'ui-ranking.js']);

        assert.equal(typeof sandbox._financeKpi, 'function', '_financeKpi deve essere definito in ui-finance.js');
        assert.equal(typeof sandbox._rankingKpi, 'function', '_rankingKpi deve essere definito in ui-ranking.js');

        // Palette finance: gold -> #d4af37, green -> #3fb950
        const finKpi = sandbox._financeKpi('Test Fin', '100', 'gold');
        assert.ok(finKpi.includes('#d4af37'), 'palette finance gold deve usare #d4af37');

        // Palette ranking: gold -> #c79a2a, green -> #1aa06a
        const rankKpi = sandbox._rankingKpi('Test Rank', '100', 'gold');
        assert.ok(rankKpi.includes('#c79a2a'), 'palette ranking gold deve usare #c79a2a');
    });
});
