'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const FUNZIONI_MORTE = [
    '_vipSyncCash',
    '_updateTrafficLabel',
    'b2bLockedDriverIds',
];

describe('Funzioni morte primo scaglione rimosse', () => {
    test('nessun file sorgente js nella radice definisce o referenzia le funzioni morte rimosse', () => {
        const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
        for (const file of jsFiles) {
            const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
            for (const fn of FUNZIONI_MORTE) {
                assert.equal(
                    content.includes(fn),
                    false,
                    `${file} contiene ancora riferimento alla funzione morta ${fn}`
                );
            }
        }
    });

    test('index.html non contiene riferimenti alle funzioni morte rimosse', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        for (const fn of FUNZIONI_MORTE) {
            assert.equal(
                html.includes(fn),
                false,
                `index.html contiene ancora riferimento alla funzione morta ${fn}`
            );
        }
    });
});
