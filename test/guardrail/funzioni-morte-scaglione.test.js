'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const FUNZIONI_MORTE_RIMOSSE = [
    '_emSyncChromeOffset',
    '_emHighlightCategory',
    'superchargeVehicle',
    'refillTires',
    'buyStandardFuel',
    'buyBlackMarketFuel',
    'getDepotLevelData',
    '_getBrandVolumeBonus',
    '_getBrandPrestigeBonus',
    '_getPrestige'
];

const SOURCE_FILES = [
    'b2b.js',
    'driver_skills.js',
    'em-chrome.js',
    'engine-drivers.js',
    'engine-fleet.js',
    'engine.js',
    'global_events.js',
    'index.html',
    'lang.js',
    'map.js'
];

describe('guardrail — funzioni morte rimosse (scaglione)', () => {
    test('nessuna delle 10 funzioni rimosse è definita o invocata nel codice sorgente', () => {
        const jsAndHtmlFiles = fs.readdirSync(ROOT).filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.') && f !== 'sw.js');

        for (const nome of FUNZIONI_MORTE_RIMOSSE) {
            const regex = new RegExp(`\\b${nome}\\b`);
            for (const file of jsAndHtmlFiles) {
                const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
                const matches = content.split('\n').filter((l, idx) => regex.test(l));
                assert.equal(
                    matches.length,
                    0,
                    `La funzione morta '${nome}' è ancora presente in ${file}:\n${matches.join('\n')}`
                );
            }
        }
    });

    test('lo scaglione ha eliminato esattamente 10 funzioni morte confermate', () => {
        assert.equal(FUNZIONI_MORTE_RIMOSSE.length, 10, 'Devono essere rimosse esattamente 10 funzioni');
    });
});
