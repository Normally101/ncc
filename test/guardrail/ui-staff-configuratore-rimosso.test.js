'use strict';
/* ============================================================================
   test/guardrail/ui-staff-configuratore-rimosso.test.js

   Guardrail che certifica la rimozione del vecchio configuratore auto morto da ui-staff.js
   (openCarConfigurator, __cfgSel, __cfgToggle, __cfgConfirm, buyCar, leaseCar)
   in quanto interamente sostituito da showroom.js.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

const RIMOSSI = [
    'openCarConfigurator',
    '__cfgSel',
    '__cfgToggle',
    '__cfgConfirm',
    'buyCar',
    'leaseCar'
];

describe('guardrail — configuratore auto rimosso da ui-staff.js', () => {

    test('ui-staff.js non contiene nel sorgente definizioni o riferimenti al vecchio configuratore', () => {
        const src = fs.readFileSync(path.join(ROOT, 'ui-staff.js'), 'utf8');
        for (const nome of RIMOSSI) {
            assert.equal(
                src.includes(nome),
                false,
                `ui-staff.js contiene ancora '${nome}'`
            );
        }
    });

    test('le funzioni rimosse non sono esposte su window/sandbox dopo il caricamento di ui-staff.js', () => {
        const { sandbox } = freshEnv();
        for (const nome of RIMOSSI) {
            assert.equal(
                typeof sandbox[nome],
                'undefined',
                `sandbox.${nome} e ancora definita (tipo: ${typeof sandbox[nome]})`
            );
        }
    });

    test('nessun file sorgente .js di produzione fa riferimento ai simboli rimossi del configuratore', () => {
        const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'sw.js');
        for (const file of jsFiles) {
            const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
            for (const nome of RIMOSSI) {
                // Regex per trovare l'identificatore esatto, non sottostringhe
                const re = new RegExp(`\\b${nome}\\b`);
                assert.equal(
                    re.test(content),
                    false,
                    `${file} fa ancora riferimento a '${nome}'`
                );
            }
        }
    });

    test('index.html non fa riferimento ai simboli del vecchio configuratore', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        for (const nome of ['openCarConfigurator', 'buyCar', 'leaseCar']) {
            const re = new RegExp(`\\b${nome}\\b`);
            assert.equal(
                re.test(html),
                false,
                `index.html fa ancora riferimento a '${nome}'`
            );
        }
    });

    test('ui-staff.js mantiene intatte le funzioni attive per la gestione dello staff e dei modali flotta', () => {
        const { sandbox } = freshEnv();
        assert.equal(typeof sandbox.renderTabStaff, 'function', 'renderTabStaff deve essere definita');
        assert.equal(typeof sandbox.hireOfficeStaff, 'function', 'hireOfficeStaff deve essere definita');
        assert.equal(typeof sandbox.fireStaff, 'function', 'fireStaff deve essere definita');
        assert.equal(typeof sandbox.openCarModal, 'function', 'openCarModal deve essere definita per la gestione flotta');
        assert.equal(typeof sandbox.closeModals, 'function', 'closeModals deve essere definita per la chiusura dei modali');
    });

    test('showroom.js e attivo e copre la configurazione e l\'acquisto veicoli', () => {
        const { sandbox } = freshEnv();
        assert.equal(typeof sandbox.renderTabShowroom, 'function', 'renderTabShowroom deve essere definita');
        assert.equal(typeof sandbox._srmOpenConfig, 'function', '_srmOpenConfig deve essere definita');
        assert.equal(typeof sandbox._srmPurchase, 'function', '_srmPurchase deve essere definita');
        assert.equal(typeof sandbox._srmToggle, 'function', '_srmToggle deve essere definita');
    });
});
