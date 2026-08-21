'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('guardrail — censimento doppio conteggio', async (t) => {
    const docPath = path.resolve(__dirname, '../../docs/DOPPIO-CONTEGGIO.md');

    await t.test('docs/DOPPIO-CONTEGGIO.md esiste e contiene i 4 file censiti', () => {
        assert.ok(fs.existsSync(docPath), 'docs/DOPPIO-CONTEGGIO.md deve esistere');
        const content = fs.readFileSync(docPath, 'utf8');

        assert.match(content, /## p2p-market\.js/, 'deve censire p2p-market.js');
        assert.match(content, /## p2p-render\.js/, 'deve censire p2p-render.js');
        assert.match(content, /## vtk-market\.js/, 'deve censire vtk-market.js');
        assert.match(content, /## auctions\.js/, 'deve censire auctions.js');
        assert.match(content, /DOPPIO CONTEGGIO/, 'deve evidenziare i casi di doppio conteggio');
    });
});
