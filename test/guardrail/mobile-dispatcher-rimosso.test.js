'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('mobile_dispatcher rimosso', () => {
    test('il file mobile_dispatcher.js non esiste piu nel repository', () => {
        const filePath = path.join(ROOT, 'mobile_dispatcher.js');
        assert.equal(fs.existsSync(filePath), false, 'mobile_dispatcher.js esiste ancora nel repository');
    });

    test('index.html non include lo script mobile_dispatcher.js', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.equal(html.includes('mobile_dispatcher.js'), false, 'index.html contiene ancora il tag script per mobile_dispatcher.js');
    });

    test('nessun file JavaScript carica o fa riferimento a mobile_dispatcher.js o renderMobileDispatcher', () => {
        const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
        for (const file of jsFiles) {
            const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
            assert.equal(
                content.includes('mobile_dispatcher.js'),
                false,
                `${file} fa riferimento a mobile_dispatcher.js`
            );
            assert.equal(
                content.includes('renderMobileDispatcher'),
                false,
                `${file} fa riferimento a renderMobileDispatcher`
            );
        }
    });
});
