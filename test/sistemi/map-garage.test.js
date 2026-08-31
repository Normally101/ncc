'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/map-garage — vista 3D del garage (map-garage.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 41. File fuori dai CORE_FILES.

   · openGarage3D(carId) — con un'auto valida riempie e mostra #modal-garage3d;
     carId ignoto → niente.
   · closeGarage3D()     — svuota e nasconde #modal-garage3d.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function garageEnv() {
    const env = createGameEnv([...CORE_FILES, 'map-garage.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/map-garage', () => {
    let env, w, doc;

    beforeEach(() => {
        env = garageEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        const m = doc.createElement('div'); m.id = 'modal-garage3d'; doc.body.appendChild(m);
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('openGarage3D: con un\'auto in flotta riempie e mostra il modale', () => {
        const car = gs().fleet[0];
        w.openGarage3D(car.id);
        const m = doc.getElementById('modal-garage3d');
        assert.ok(m.innerHTML.length > 0, 'il modale 3D è rimasto vuoto');
        assert.notEqual(m.style.display, 'none', 'il modale 3D non è stato mostrato');
    });

    test('openGarage3D: carId sconosciuto → il modale resta vuoto', () => {
        w.openGarage3D('auto-che-non-esiste');
        assert.equal(doc.getElementById('modal-garage3d').innerHTML, '');
    });

    test('closeGarage3D: svuota il modale e ne azzera lo stile inline', () => {
        const car = gs().fleet[0];
        w.openGarage3D(car.id);
        assert.ok(doc.getElementById('modal-garage3d').innerHTML.length > 0);

        w.closeGarage3D();

        const m = doc.getElementById('modal-garage3d');
        assert.equal(m.innerHTML, '', 'il contenuto non è stato svuotato');
        assert.equal(m.style.cssText, '', 'lo stile inline non è stato azzerato');
    });
});
