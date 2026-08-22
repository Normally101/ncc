'use strict';
/* ============================================================================
   test/guardrail/nomi-doppi-risolti.test.js

   Verifica che le funzioni con collisioni di nome censite nei registri siano
   state separate con nomi univoci e distinte implementazioni, rimanendo
   raggiungibili col rispettivo nome quando entrambi i file sono caricati.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..', '..');

function loadFiles(fileList, mockContext = {}) {
    const sandbox = {
        console,
        Date, Math, JSON, Promise, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
        document: {
            getElementById: () => null,
            createElement: () => ({ style: {}, appendChild: () => {} }),
            head: { appendChild: () => {} },
            body: { appendChild: () => {} },
        },
        window: null,
        gameState: {
            cash: 10000,
            reputation: 4.0,
            fleet: [],
            drivers: [],
            stockPrices: {},
            stockHoldings: {},
        },
        ceAct: (act, args) => `data-ce-act="${act}"`,
        CE_Sec: { escHtml: (s) => s },
        ...mockContext,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    for (const file of fileList) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        vm.runInContext(code, sandbox, { filename: file });
    }
    return sandbox;
}

describe('Risoluzione collisioni nomi globali', () => {

    test('1. _b2bSb e _sb: b2b.js e p2p-market.js espongono client Supabase con nomi distinti', () => {
        const mockSb = { rpc: () => {} };
        const sandbox = loadFiles(['p2p-market.js', 'b2b.js'], {
            supabaseClient: mockSb,
        });

        assert.equal(typeof sandbox._b2bSb, 'function', '_b2bSb deve esistere ed essere una funzione distinta per b2b.js');
        assert.equal(typeof sandbox._sb, 'function', '_sb deve esistere per p2p-market.js');
        assert.equal(sandbox._b2bSb(), mockSb, '_b2bSb() deve restituire il client Supabase');
        assert.equal(sandbox._sb(), mockSb, '_sb() deve restituire il client Supabase');
    });

    test('2. _b2bUid e _uid: b2b.js e p2p-market.js espongono helper utente con nomi distinti', () => {
        const mockUser = { id: 'usr_abc123' };
        const sandbox = loadFiles(['p2p-market.js', 'b2b.js'], {
            currentUser: mockUser,
        });

        assert.equal(typeof sandbox._b2bUid, 'function', '_b2bUid deve esistere ed essere una funzione distinta per b2b.js');
        assert.equal(typeof sandbox._uid, 'function', '_uid deve esistere per p2p-market.js');
        assert.equal(sandbox._b2bUid(), 'usr_abc123', '_b2bUid() deve restituire l ID utente');
        assert.equal(sandbox._uid(), 'usr_abc123', '_uid() deve restituire l ID utente');
    });

    test('3. renderTabFinance e renderTabRanking: ui-finance.js e ui-ranking.js caricate insieme funzionano senza conflitti', () => {
        const tabContainer = { innerHTML: '', style: {} };
        const sandbox = loadFiles(['ui-finance.js', 'ui-ranking.js'], {
            document: {
                getElementById: (id) => (id === 'tab-container' ? tabContainer : null),
                createElement: () => ({ style: {}, appendChild: () => {}, id: '' }),
                head: { appendChild: () => {} },
                body: { appendChild: () => {} },
            },
            _getCreditTier: () => ({ loanLimit: 50000, rate: 0.05, label: 'Standard', color: '#fff' }),
            _hasWealthManager: () => true,
        });

        assert.equal(typeof sandbox.renderTabFinance, 'function', 'renderTabFinance deve essere disponibile');
        assert.equal(typeof sandbox.renderTabRanking, 'function', 'renderTabRanking deve essere disponibile');

        // Entrambi i render devono poter eseguire senza errori
        sandbox.renderTabFinance();
        assert.ok(tabContainer.innerHTML.includes('Mercati Finanziari'), 'renderTabFinance deve renderizzare correttamente');

        sandbox.renderTabRanking();
        assert.ok(tabContainer.innerHTML.includes('Classifica Globale'), 'renderTabRanking deve renderizzare correttamente');
    });
});
