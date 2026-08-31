'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/staff — lo staff d'ufficio e il modale auto (ui-staff.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 22. Quattro azioni:

   · hireOfficeStaff(id)  — assume un ruolo da STAFF_ROLES. Il costo è
     server-authoritative: passa da `ServerState.hireDriver` (mock: −salary×2).
     Rispetta il tetto `_getMaxStaff()`; oltre il tetto → errore, niente assunzione.
   · fireStaff(staffId)   — licenzia (confirm→sì): via dallo `gameState.staff`.
   · closeModals()        — nasconde ogni overlay `[id^="modal-"]`.
   · openCarModal(carId)  — costruisce il modale dell'auto (stub no-op senza
     render:true → verificato in un blocco a parte).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/staff', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 500000);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.renderTabStaff = () => {};
        w.updateUI = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const RUOLI  = () => R.catalogo(env, 'STAFF_ROLES') || w.STAFF_ROLES;

    test('hireOfficeStaff: assume, lo mette in organico e il server addebita salary×2', async () => {
        const ruolo = RUOLI().mechanic;             // id: 'mech', salary: 2600
        const cassaPrima = gs().cash;
        const nPrima = gs().staff.length;

        await w.hireOfficeStaff(ruolo.id);

        assert.equal(gs().staff.length, nPrima + 1, 'non è entrato in organico');
        assert.ok(gs().staff.some(s => s.id === ruolo.id));
        assert.equal(gs().cash, cassaPrima - ruolo.salary * 2, 'il server non ha addebitato l\'ingaggio');
        assert.ok(avvisi.some(a => a.t === 'success'));
    });

    test('hireOfficeStaff: oltre il tetto staff → errore, nessuna assunzione, nessun addebito', async () => {
        gs().staff = [{ id: 'a' }, { id: 'b' }];    // _getMaxStaff() = 2 a hqLevel 0
        const cassaPrima = gs().cash;

        await w.hireOfficeStaff('mech');

        assert.equal(gs().staff.length, 2, 'ha sforato il tetto');
        assert.equal(gs().cash, cassaPrima, 'ha pagato pur non assumendo');
        assert.ok(errori().some(m => /[Ll]imite staff/.test(m)));
    });

    test('fireStaff: licenzia e toglie dall\'organico; id ignoto è un no-op', () => {
        gs().staff = [{ id: 'mech', name: 'Capo Officina', salary: 2600 }];

        w.fireStaff('mech');
        assert.equal(gs().staff.length, 0, 'non è stato licenziato');

        gs().staff = [{ id: 'mech', name: 'Capo Officina', salary: 2600 }];
        w.fireStaff('inesistente');
        assert.equal(gs().staff.length, 1, 'un id ignoto non doveva toccare l\'organico');
    });

    test('closeModals: ogni overlay #modal-* finisce nascosto', () => {
        const doc = env.sandbox.document;
        for (const id of ['modal-car', 'modal-hub', 'modal-x']) {
            const m = doc.createElement('div'); m.id = id; m.classList.add('flex');
            doc.body.appendChild(m);
        }
        w.closeModals();
        for (const id of ['modal-car', 'modal-hub', 'modal-x']) {
            const m = doc.getElementById(id);
            assert.equal(m.style.display, 'none');
            assert.ok(m.classList.contains('hidden'));
            assert.ok(!m.classList.contains('flex'));
        }
    });
});

// open*Modal è stub no-op nell'env di default.
describe('sistemi/staff — openCarModal (render vero)', () => {
    let env, w;

    beforeEach(() => {
        env = freshEnv({ render: true });
        w = env.sandbox.window;
        R.conSchermo(env);
        w.showNotification = () => {};
        const doc = env.sandbox.document;
        for (const id of ['car-modal-title', 'car-modal-desc', 'car-modal-content']) {
            const el = doc.createElement('div'); el.id = id; doc.body.appendChild(el);
        }
        const modal = doc.createElement('div'); modal.id = 'modal-car'; doc.body.appendChild(modal);
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('openCarModal: con un\'auto in flotta riempie il contenuto e apre il modale', () => {
        const car = gs().fleet[0];
        assert.ok(car, 'la nuova partita non ha l\'auto starter');

        w.openCarModal(car.id);

        const cont = env.sandbox.document.getElementById('car-modal-content');
        assert.ok(cont.innerHTML.length > 0, 'il contenuto del modale è vuoto');
        assert.equal(env.sandbox.document.getElementById('modal-car').style.display, 'flex');
    });

    test('openCarModal: carId sconosciuto → esce senza aprire nulla', () => {
        w.openCarModal('auto-che-non-esiste');
        assert.equal(env.sandbox.document.getElementById('modal-car').style.display, '');
    });
});
