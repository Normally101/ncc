'use strict';
/* ============================================================================
   test/funzioni/province-war-room.test.js

   Verifica che la scheda 'provinces' (ui-ops.js) e la War Room (war_room.js)
   abbiano ciascuna il proprio punto di ingresso distinto su window:
     - window.renderTabProvinces -> funzione di ui-ops.js
     - window.renderTabWarRoom   -> funzione di war_room.js
   Nessuno dei due file deve sovrascrivere l'altro a prescindere dall'ordine
   di caricamento degli script.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

function loadInVm(files) {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="tab-container"></div></body></html>');
    const sandbox = {
        console,
        document: dom.window.document,
        window: null,
        gameState: { cash: 100000, companyName: 'TestCo', unlockedRegions: [] },
        REGIONS: {},
        ServerState: {
            getTerritorySnapshot: async () => ({ provinces: [], regions: [], influence: {} }),
            acquireProvince: async () => ({ success: true, province_name: 'Test' }),
        },
        ceAct: (name, args) => `data-ce-act="${name}" data-ce-args='${JSON.stringify(args || [])}'`,
        showNotification: () => {},
        showBigEvent: () => {},
        updateUI: () => {},
        saveGame: () => {},
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    for (const file of files) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        vm.runInContext(src, sandbox, { filename: file });
    }
    return sandbox;
}

describe('separazione delle schermate: renderTabProvinces (ui-ops) vs renderTabWarRoom (war_room)', () => {
    test('caricando ui-ops.js e poi war_room.js, renderTabProvinces non viene sovrascritta', () => {
        const sandbox = loadInVm(['ui-ops.js', 'war_room.js']);

        assert.equal(typeof sandbox.window.renderTabProvinces, 'function', 'renderTabProvinces deve essere definita');
        assert.equal(typeof sandbox.window.renderTabWarRoom, 'function', 'renderTabWarRoom deve essere definita');
        assert.notEqual(
            sandbox.window.renderTabProvinces,
            sandbox.window.renderTabWarRoom,
            'war_room.js non deve sovrascrivere window.renderTabProvinces con renderTabWarRoom'
        );
    });

    test('caricando war_room.js e poi ui-ops.js, entrambe le funzioni rimangono disponibili', () => {
        const sandbox = loadInVm(['war_room.js', 'ui-ops.js']);

        assert.equal(typeof sandbox.window.renderTabProvinces, 'function', 'renderTabProvinces deve essere definita');
        assert.equal(typeof sandbox.window.renderTabWarRoom, 'function', 'renderTabWarRoom deve essere definita');
        assert.notEqual(
            sandbox.window.renderTabProvinces,
            sandbox.window.renderTabWarRoom,
            'le due funzioni devono essere distinte'
        );
    });

    test('war_room.js espone renderTabWarRoom e non registra l alias renderTabProvinces', () => {
        const sandbox = loadInVm(['war_room.js']);

        assert.equal(typeof sandbox.window.renderTabWarRoom, 'function', 'renderTabWarRoom deve essere esportata');
        assert.equal(
            sandbox.window.renderTabProvinces,
            undefined,
            'war_room.js non deve definire window.renderTabProvinces'
        );
    });

    test('ui-ops.js espone renderTabProvinces', () => {
        const sandbox = loadInVm(['ui-ops.js']);

        assert.equal(typeof sandbox.window.renderTabProvinces, 'function', 'ui-ops.js deve esportare renderTabProvinces');
        assert.equal(sandbox.window.renderTabWarRoom, undefined, 'ui-ops.js non deve definire renderTabWarRoom');
    });
});
