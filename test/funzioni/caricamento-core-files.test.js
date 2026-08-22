'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

test('verifica caricamento singoli file mancanti', async (t) => {
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    const regex = /<script\s+[^>]*src="([^"]+\.js)(?:\?[^"]*)?"/g;
    const scripts = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!match[1].startsWith('http')) {
            scripts.push(match[1]);
        }
    }
    const mancanti = scripts.filter(s => !CORE_FILES.includes(s));

    for (const file of mancanti) {
        await t.test(file, () => {
            let env;
            try {
                env = createGameEnv([...CORE_FILES, file]);
            } finally {
                if (env) env.stopAllIntervals();
            }
        });
    }
});
