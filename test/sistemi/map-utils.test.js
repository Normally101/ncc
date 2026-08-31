'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/map-utils — fondazione sede + modale Accademia (ui-map-utils.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 36. File fuori dai CORE_FILES: caricato
   in aggiunta con render:true.

   · _startFoundingList()      — riempie #founding-overlay con l'elenco delle
     regioni dove aprire la sede.
   · _startFoundingMode()      — nel banco (nessun backend mappa) ripiega
     sull'elenco: stesso risultato di _startFoundingList.
   · _foundFromRegion(id)      — regione nota → chiude l'overlay e chiama
     foundCompany(lng,lat,nome); regione ignota → false, niente.
   · _cancelFoundingMode()     — rimuove #founding-overlay.
   · openAcademyModal()        — costruisce #academy-modal.
   · _academySelectDriver(id)  — ridisegna il modale sull'autista scelto.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function mapUtilsEnv() {
    const env = createGameEnv([...CORE_FILES, 'ui-map-utils.js'], { render: true });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/map-utils — fondazione sede', () => {
    let env, w, doc, fondazioni;

    beforeEach(() => {
        env = mapUtilsEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        fondazioni = [];
        w.foundCompany = (lng, lat, nome) => fondazioni.push({ lng, lat, nome });
        w._checkFoundingOverlay = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    function overlay() {
        const ov = doc.createElement('div'); ov.id = 'founding-overlay';
        doc.body.appendChild(ov);
        return ov;
    }

    test('_startFoundingList: riempie l\'overlay con le regioni (bottoni _foundFromRegion)', () => {
        const ov = overlay();
        w._startFoundingList();
        assert.match(ov.innerHTML, /_foundFromRegion/, 'nessun bottone regione nell\'overlay');
        assert.match(ov.innerHTML, /Abruzzo/);
    });

    test('_startFoundingMode: senza backend mappa ripiega sull\'elenco regioni', () => {
        const ov = overlay();
        w._startFoundingMode();
        assert.match(ov.innerHTML, /_foundFromRegion/, 'non è ripiegato sull\'elenco');
    });

    test('_foundFromRegion: regione nota → chiude overlay e fonda; regione ignota → false', () => {
        overlay();
        const ok = w._foundFromRegion('abruzzo');
        assert.equal(ok, true);
        assert.equal(doc.getElementById('founding-overlay'), null, 'l\'overlay non è stato chiuso');
        assert.equal(fondazioni.length, 1, 'foundCompany non è stato chiamato');
        assert.equal(fondazioni[0].nome, 'Sede Principale');

        overlay();
        const ko = w._foundFromRegion('atlantide');
        assert.equal(ko, false);
        assert.equal(fondazioni.length, 1, 'ha fondato su una regione inesistente');
    });

    test('_cancelFoundingMode: rimuove #founding-overlay', () => {
        overlay();
        w._cancelFoundingMode();
        assert.equal(doc.getElementById('founding-overlay'), null);
    });
});

describe('sistemi/map-utils — modale Accademia', () => {
    let env, w, doc;

    beforeEach(() => {
        env = mapUtilsEnv();
        w = env.sandbox.window;
        doc = env.sandbox.document;
        R.conSchermo(env);
        w.gameState.drivers.push({ id: 'd1', name: 'Rookie', level: 2, skills: {}, xp: 0 });
    });
    afterEach(() => env.stopAllIntervals());

    test('openAcademyModal: costruisce #academy-modal', () => {
        w.openAcademyModal();
        assert.ok(doc.getElementById('academy-modal'), 'il modale non è stato creato');
    });

    test('_academySelectDriver: dopo l\'apertura ridisegna sul driver scelto senza esplodere', () => {
        w.openAcademyModal();
        assert.equal(typeof w._academySelectDriver, 'function', 'il selettore non è stato esposto');
        w._academySelectDriver('d1');
        assert.ok(doc.getElementById('academy-modal'), 'il modale è sparito dopo la selezione');
    });
});
