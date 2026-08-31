'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/saveSystem — conferma nuova partita (saveSystem.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 28. Una azione:

   · _confirmNewGame(slotIndex) — parte dalla schermata degli slot: legge il nome
     azienda da `#ss-company-name` (fallback "Chauffeur Empire"), azzera lo slot
     nel localStorage, memorizza nome/logo/colore "pendenti", chiude l'overlay
     `#ss-overlay` e lancia `_startGameWithSlot(slotIndex, true)`.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/saveSystem', () => {
    let env, w, doc, avviati;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        avviati = [];
        w._startGameWithSlot = (slot, fresh) => avviati.push({ slot, fresh });
        w.localStorage.setItem('chauffeurEmpireSlot_2', '{"vecchio":true}');
    });
    afterEach(() => env.stopAllIntervals());

    test('_confirmNewGame: nome dall\'input, slot azzerato, overlay chiuso, partita avviata', async () => {
        const nameEl = doc.createElement('input'); nameEl.id = 'ss-company-name'; nameEl.value = '  Lux NCC  ';
        doc.body.appendChild(nameEl);
        const ov = doc.createElement('div'); ov.id = 'ss-overlay'; doc.body.appendChild(ov);

        await w._confirmNewGame(1);

        assert.equal(w._pendingCompanyName, 'Lux NCC', 'il nome non è stato ripulito/letto');
        assert.equal(w.currentSlotIndex, 1);
        assert.equal(doc.getElementById('ss-overlay'), null, 'l\'overlay non è stato chiuso');
        assert.deepEqual(avviati, [{ slot: 1, fresh: true }], 'la partita non è stata avviata');
    });

    test('_confirmNewGame: senza input nome → fallback "Chauffeur Empire", e lo slot indicato viene svuotato', async () => {
        assert.ok(w.localStorage.getItem('chauffeurEmpireSlot_2'));

        await w._confirmNewGame(1);   // SLOT_KEYS[1] === 'chauffeurEmpireSlot_2'

        assert.equal(w._pendingCompanyName, 'Chauffeur Empire');
        assert.equal(w.localStorage.getItem('chauffeurEmpireSlot_2'), null, 'lo slot non è stato azzerato');
    });
});
