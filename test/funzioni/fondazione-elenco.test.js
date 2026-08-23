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

/* ─── Fondazione cliccando sulla mappa 2D ────────────────────────────────
   Passo 6 del piano mappa: il click passa da MapBackend, la funzione pura
   foundCompany non si tocca, e un click in mare non manda piu' la sede
   dall'altra parte del Tirreno. */
const FILES_MAPPA = [...CORE_FILES, 'map-proiezione.js', 'geo-italia.js',
                     'map-dati.js', 'map-svg.js', 'ui-map-utils.js'];

describe('fondazione — cliccando sulla mappa 2D', () => {

    let env2, m;
    beforeEach(() => {
        env2 = createGameEnv(FILES_MAPPA);
        m = env2.sandbox;
        m.setTimeout = () => 0;
        m.initGame(true);
        env2.stopAllIntervals();
        m.gameState.unlockedRegions = [];
        m.gameState.hq = { lng: null, lat: null, region: null, name: null, level: 0 };
        const root = m.document.createElement('div');
        root.id = 'map2d-root';
        m.document.body.appendChild(root);
        m.window.MapBackend.use('svg2d');
        m.window.MapBackend.ensure();
    });
    afterEach(() => { env2.stopAllIntervals(); });

    const clicca = (nodo) => nodo.dispatchEvent(
        new (m.document.defaultView.MouseEvent)('click', { bubbles: true, cancelable: true }));

    test('la mappa 2D prende in carico il click di fondazione', () => {
        m.window._checkFoundingOverlay();
        m.window._startFoundingMode();
        // l'overlay chiede di cliccare, quindi la mappa ha accettato
        assert.match(m.document.getElementById('founding-overlay').innerHTML, /Clicca sulla Mappa/);
    });

    test('cliccare la mappa fonda l\'azienda passando dalla stessa foundCompany', () => {
        m.window._checkFoundingOverlay();
        m.window._startFoundingMode();
        clicca(m.document.querySelector('[data-regione="lazio"]'));
        assert.ok(m.gameState.hq.region, 'la sede doveva essere fondata');
        assert.ok(m.gameState.unlockedRegions.length === 1);
        assert.equal(m.document.getElementById('founding-overlay'), null);
    });

    /* Il difetto che si aggiusta qui: senza aggancio, foundCompany prende il
       POI col Math.hypot piu' piccolo, e al largo di Ostia puo' essere la
       Sardegna. */
    test('un click in mare si aggancia alla costa piu\' vicina', () => {
        // al largo di Ostia: mare aperto
        assert.equal(m.window.CE_proj.regioneAlPunto(11.9, 41.7, m.window.GEO_ITALIA.regions), null);
        const [lng, lat] = m.window._agganciaAllaTerraferma(11.9, 41.7);
        assert.equal(m.window.CE_proj.regioneAlPunto(lng, lat, m.window.GEO_ITALIA.regions), 'lazio',
            'il punto agganciato deve stare nel Lazio');
        m.window.foundCompany(lng, lat, 'Prova');
        assert.equal(m.gameState.hq.region, 'lazio');
    });

    test('un click sulla terraferma non viene spostato di un millimetro', () => {
        const [lng, lat] = m.window._agganciaAllaTerraferma(12.4964, 41.9028);
        assert.equal(lng, 12.4964);
        assert.equal(lat, 41.9028);
    });

    test('senza confini caricati l\'aggancio restituisce il punto originale', () => {
        m.window.GEO_ITALIA = undefined;
        assert.deepEqual([...m.window._agganciaAllaTerraferma(1, 2)], [1, 2]);
    });

    test('annullare stacca il gancio: un click successivo non fonda niente', () => {
        m.window._checkFoundingOverlay();
        m.window._startFoundingMode();
        m.window._cancelFoundingMode();
        clicca(m.document.querySelector('[data-regione="lazio"]'));
        assert.equal(m.gameState.hq.region, null, 'dopo l\'annullamento il click non deve fondare');
    });
});
