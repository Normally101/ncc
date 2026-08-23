'use strict';
/**
 * Fondare l'azienda senza la mappa.
 *
 * Fino al 23/08 l'unica strada per fondare era `map.once('click')`, e map.js
 * si rifiuta di creare la mappa sotto i 768px di larghezza: da telefono non
 * esisteva NESSUN modo di cominciare a giocare. Questi test sorvegliano la
 * strada alternativa, che non tocca la mappa in nessun punto.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const FILES = [...CORE_FILES, 'ui-map-utils.js'];

let env, s;
beforeEach(() => {
    env = createGameEnv(FILES);
    s = env.sandbox;
    s.initGame(true);
    env.stopAllIntervals();
    // partita davvero nuova: nessuna regione, nessuna sede
    s.gameState.unlockedRegions = [];
    s.gameState.hq = { lng: null, lat: null, region: null, name: null, level: 0 };
});
afterEach(() => { env.stopAllIntervals(); });

describe('fondazione — elenco delle regioni (senza mappa)', () => {
    test('l\'elenco copre tutte le regioni del gioco, con coordinate valide', () => {
        const elenco = s.window._foundingRegions();
        const REGIONS = vm.runInContext('REGIONS', s);
        assert.deepEqual(
            elenco.map(r => r.id).sort(),
            Object.keys(REGIONS).sort(),
            'ogni regione del gioco deve essere fondabile dall\'elenco'
        );
        for (const r of elenco) {
            assert.ok(Number.isFinite(r.lng) && Number.isFinite(r.lat), `${r.id}: coordinate non numeriche`);
            assert.ok(r.lng > 6 && r.lng < 19, `${r.id}: longitudine fuori dall'Italia (${r.lng})`);
            assert.ok(r.lat > 35 && r.lat < 48, `${r.id}: latitudine fuori dall'Italia (${r.lat})`);
        }
    });

    /* La regressione vera: il centroide di Puglia [16.30,40.80] ha come POI piu'
       vicino Potenza, che sta in Basilicata. Chi chiedeva Puglia riceveva la
       Basilicata. Per questo l'elenco parte da un POI della regione. */
    test('ogni voce dell\'elenco fonda ESATTAMENTE nella regione chiesta', () => {
        for (const r of s.window._foundingRegions()) {
            s.gameState.unlockedRegions = [];
            s.gameState.hq = { lng: null, lat: null, region: null, name: null, level: 0 };
            s.window.foundCompany(r.lng, r.lat, 'Prova');
            assert.equal(s.gameState.hq.region, r.id, `chiesta ${r.id}, ottenuta ${s.gameState.hq.region}`);
            assert.ok(s.gameState.unlockedRegions.includes(r.id), `${r.id} non sbloccata`);
        }
    });

    test('_foundFromRegion fonda la sede e sblocca la regione', () => {
        const ok = s.window._foundFromRegion('toscana');
        assert.equal(ok, true);
        assert.equal(s.gameState.hq.region, 'toscana');
        assert.equal(s.gameState.hq.name, 'Sede Principale');
        assert.ok(s.gameState.unlockedRegions.includes('toscana'));
    });

    test('_foundFromRegion con un id inesistente non fonda niente', () => {
        const ok = s.window._foundFromRegion('atlantide');
        assert.equal(ok, false);
        assert.equal(s.gameState.hq.region, null);
        assert.deepEqual(s.gameState.unlockedRegions, []);
    });

    test('il nome scritto nel campo diventa il nome della sede', () => {
        s.window._checkFoundingOverlay();
        s.window._startFoundingList();
        const campo = s.document.getElementById('founding-name');
        assert.ok(campo, 'il campo del nome deve esistere nell\'elenco');
        campo.value = '  Via Nazionale 12  ';
        s.window._foundFromRegion('lazio');
        assert.equal(s.gameState.hq.name, 'Via Nazionale 12');
    });

    /* Il difetto storico, in forma di test: finestra da telefono, mappa mai
       creata, e il giocatore deve comunque riuscire a fondare. */
    test('a 375px di larghezza, senza mappa, si fonda lo stesso', () => {
        s.innerWidth = 375;
        s.window.innerWidth = 375;
        s.map = null;
        s.window.map = null;

        s.window._checkFoundingOverlay();
        const ov = s.document.getElementById('founding-overlay');
        assert.ok(ov, 'l\'overlay di fondazione deve comparire');

        s.window._startFoundingList();
        const voci = s.document.querySelectorAll('#founding-overlay [data-ce-act="_foundFromRegion"]');
        assert.equal(voci.length, 20, 'devono comparire le 20 regioni');

        s.window._foundFromRegion('campania');
        assert.equal(s.gameState.hq.region, 'campania');
        assert.equal(s.document.getElementById('founding-overlay'), null, 'l\'overlay deve chiudersi');
        assert.equal(s.map, null, 'la fondazione non deve aver creato nessuna mappa');
    });

    test('_checkFoundingOverlay non ricompare a partita gia fondata', () => {
        s.gameState.unlockedRegions = ['lazio'];
        s.window._checkFoundingOverlay();
        assert.equal(s.document.getElementById('founding-overlay'), null);
    });
});
