'use strict';
/* ============================================================================
   test/guardrail/funzioni-morte-scaglione-1.test.js

   Guardrail che certifica la rimozione del primo scaglione di funzioni morte
   censite nei registri delle azioni:
   - _vipSyncCash (vip-clients.js)
   - b2bLockedDriverIds (b2b.js)
   - _updateTrafficLabel (ui-dispatch.js)
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

const FUNZIONI_MORTE = [
    { name: '_vipSyncCash', file: 'vip-clients.js' },
    { name: 'b2bLockedDriverIds', file: 'b2b.js' },
    { name: '_updateTrafficLabel', file: 'ui-dispatch.js' }
];

describe('guardrail — rimozione primo scaglione funzioni morte', () => {

    test('i file sorgente non contengono le definizioni delle funzioni morte rimosse', () => {
        for (const { name, file } of FUNZIONI_MORTE) {
            const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
            const re = new RegExp(`(?:function\\s+${name}\\b|window\\.${name}\\s*=)`);
            assert.equal(
                re.test(src),
                false,
                `${file} contiene ancora la definizione di '${name}'`
            );
        }
    });

    test('le funzioni rimosse non sono definite nel sandbox globale', () => {
        const { sandbox } = freshEnv();
        for (const { name } of FUNZIONI_MORTE) {
            assert.equal(
                typeof sandbox[name],
                'undefined',
                `sandbox.${name} e ancora definita (tipo: ${typeof sandbox[name]})`
            );
            assert.equal(
                typeof sandbox.window[name],
                'undefined',
                `sandbox.window.${name} e ancora definita (tipo: ${typeof sandbox.window[name]})`
            );
        }
    });

    test('nessun file sorgente JavaScript fa riferimento ai simboli rimossi', () => {
        const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'sw.js');
        for (const file of jsFiles) {
            const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
            for (const { name } of FUNZIONI_MORTE) {
                const re = new RegExp(`\\b${name}\\b`);
                assert.equal(
                    re.test(content),
                    false,
                    `${file} fa ancora riferimento al simbolo '${name}'`
                );
            }
        }
    });

    test('index.html non fa riferimento ai simboli rimossi', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        for (const { name } of FUNZIONI_MORTE) {
            const re = new RegExp(`\\b${name}\\b`);
            assert.equal(
                re.test(html),
                false,
                `index.html fa ancora riferimento al simbolo '${name}'`
            );
        }
    });
});
