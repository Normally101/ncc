'use strict';
/* ============================================================================
   test/garage/legacy-configurator-removal.test.js

   Verifica che il vecchio configuratore auto precedentemente ospitato in
   ui-staff.js sia stato rimosso e che i relativi simboli morti non siano più
   esposti globalmente né referenziati nei file sorgente dell'applicazione,
   essendo la funzionalità interamente gestita dal modulo dedicato showroom.js.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

describe('rimozione configuratore obsoleto da ui-staff.js', () => {

    test('i simboli del vecchio configuratore non sono definiti nell\'ambiente globale', () => {
        const { sandbox } = freshEnv();

        assert.equal(typeof sandbox.openCarConfigurator, 'undefined', 'openCarConfigurator non deve essere definito');
        assert.equal(typeof sandbox.buyCar, 'undefined', 'buyCar non deve essere definito');
        assert.equal(typeof sandbox.leaseCar, 'undefined', 'leaseCar non deve essere definito');
        assert.equal(typeof sandbox.__cfgToggle, 'undefined', '__cfgToggle non deve essere definito');
        assert.equal(typeof sandbox.__cfgConfirm, 'undefined', '__cfgConfirm non deve essere definito');
        assert.equal(typeof sandbox.__cfgSel, 'undefined', '__cfgSel non deve essere definito');
    });

    test('ui-staff.js non contiene implementazioni o riferimenti alle funzioni del vecchio configuratore', () => {
        const uiStaffPath = path.resolve(__dirname, '../../ui-staff.js');
        const content = fs.readFileSync(uiStaffPath, 'utf8');

        const forbiddenPatterns = [
            'openCarConfigurator',
            '__cfgToggle',
            '__cfgConfirm',
            '__cfgSel',
            'modal-configurator',
            'window.buyCar',
            'window.leaseCar',
        ];

        for (const pat of forbiddenPatterns) {
            assert.ok(!content.includes(pat), `ui-staff.js non deve contenere "${pat}"`);
        }
    });

    test('nessun file sorgente JavaScript attivo chiama i simboli rimossi del vecchio configuratore', () => {
        const rootDir = path.resolve(__dirname, '../..');
        const jsFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.js'));

        const forbiddenCallPatterns = [
            'openCarConfigurator',
            '__cfgToggle',
            '__cfgConfirm',
            'leaseCar',
        ];

        for (const file of jsFiles) {
            const filePath = path.join(rootDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            for (const pat of forbiddenCallPatterns) {
                assert.ok(!content.includes(pat), `file ${file} non deve contenere riferimenti a "${pat}"`);
            }
        }
    });

    test('showroom.js è presente e gestisce catalogo, opzioni, configurazione e acquisto veicoli', () => {
        const { sandbox } = freshEnv();
        assert.equal(typeof sandbox.renderTabShowroom, 'function', 'renderTabShowroom deve essere una funzione');
        assert.equal(typeof sandbox._srmOpenConfig, 'function', '_srmOpenConfig deve essere una funzione');
        assert.equal(typeof sandbox._srmToggle, 'function', '_srmToggle deve essere una funzione');
        assert.equal(typeof sandbox._srmPurchase, 'function', '_srmPurchase deve essere una funzione');
    });
});
