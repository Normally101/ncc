'use strict';
/* ============================================================================
   test/guardrail/funzioni-morte-scaglione.test.js

   Guardrail che certifica la rimozione di 10 funzioni morte non utilizzate
   dal codebase:
   1. _updateTrafficLabel (ui-dispatch.js)
   2. _vipSyncCash (vip-clients.js)
   3. buyStandardFuel (engine-fleet.js)
   4. buyBlackMarketFuel (engine-fleet.js)
   5. getDepotLevelData (engine-fleet.js)
   6. _getBrandVolumeBonus (engine.js)
   7. _getBrandPrestigeBonus (engine.js)
   8. _getPrestige (engine.js)
   9. toggleBlacklist (engine.js)
   10. openLeasingModal (engine.js)
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

const RIMOSSI_SCAGLIONE = [
    '_updateTrafficLabel',
    '_vipSyncCash',
    'buyStandardFuel',
    'buyBlackMarketFuel',
    'getDepotLevelData',
    '_getBrandVolumeBonus',
    '_getBrandPrestigeBonus',
    '_getPrestige',
    'toggleBlacklist',
    'openLeasingModal'
];

describe('guardrail — 10 funzioni morte rimosse dal codebase', () => {

    test('nessun file sorgente .js di produzione definisce o contiene i simboli rimossi', () => {
        const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'sw.js' && f !== 'config.js');
        for (const file of jsFiles) {
            const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
            for (const nome of RIMOSSI_SCAGLIONE) {
                const re = new RegExp(`\\b${nome}\\b`);
                assert.equal(
                    re.test(content),
                    false,
                    `${file} contiene ancora riferimento/definizione di '${nome}'`
                );
            }
        }
    });

    test('index.html non fa riferimento ai simboli rimossi', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        for (const nome of RIMOSSI_SCAGLIONE) {
            const re = new RegExp(`\\b${nome}\\b`);
            assert.equal(
                re.test(html),
                false,
                `index.html fa ancora riferimento a '${nome}'`
            );
        }
    });

    test('le funzioni rimosse non sono esposte su window/sandbox dopo il caricamento', () => {
        const { sandbox } = freshEnv();
        for (const nome of RIMOSSI_SCAGLIONE) {
            assert.equal(
                typeof sandbox[nome],
                'undefined',
                `sandbox.${nome} e ancora definita (tipo: ${typeof sandbox[nome]})`
            );
        }
    });
});
