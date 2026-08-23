'use strict';
/**
 * Il ciclo di animazione.
 *
 * Il primo test e' la regressione del difetto peggiore del vecchio
 * map-visual.js: la sua ultima riga era `visualLoop();`, quindi il ciclo
 * partiva al CARICAMENTO DEL FILE e non si fermava mai piu' — a mappa chiusa
 * e a scheda del browser nascosta.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = [...CORE_FILES, 'map-proiezione.js', 'geo-italia.js', 'map-dati.js', 'map-svg.js'];

function ambiente(opzioni = {}) {
    const fotogrammi = [];
    const env = createGameEnv(BASE);
    const s = env.sandbox;
    s.setTimeout = () => 0;
    /* Fotogrammi a comando: il test decide quando scatta il giro successivo,
       altrimenti il ciclo gira all'infinito dentro la suite. */
    s.requestAnimationFrame = (fn) => { fotogrammi.push(fn); return fotogrammi.length; };
    s.cancelAnimationFrame = () => {};
    s.initGame(true);
    env.stopAllIntervals();
    s.gameState.unlockedRegions = ['lazio', 'toscana'];
    s.gameState.activeTrips = [];
    s.HIGHWAYS = { 'roma-firenze': { req: ['lazio', 'toscana'], path: [[41.90, 12.50], [42.72, 11.95], [43.77, 11.26]] } };

    const root = s.document.createElement('div');
    root.id = 'map2d-root';
    s.document.body.appendChild(root);

    if (!opzioni.senzaAnimazione) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'map-animazione.js'), 'utf8'), s,
            { filename: 'map-animazione.js' });
    }
    return { env, s, fotogrammi };
}

function corsa() {
    return {
        id: 1, driverId: 'ceo', tier: 'vip', duration: 10000, elapsed: 0,
        fromPoi: { id: 'roma', lat: 41.9028, lng: 12.4964 },
        toPoi:   { id: 'firenze', lat: 43.7696, lng: 11.2558 },
    };
}

describe('map-animazione — quando parte e quando si ferma', () => {

    let env, s, fotogrammi;
    beforeEach(() => { ({ env, s, fotogrammi } = ambiente()); });
    afterEach(() => { if (s.window.CE_mapAnim) s.window.CE_mapAnim.ferma(); env.stopAllIntervals(); });

    /* IL difetto da non riportarsi dietro. */
    test('caricare il file non chiede un solo fotogramma', () => {
        assert.deepEqual(fotogrammi, [], 'il ciclo e\' partito al caricamento');
        assert.equal(s.window.CE_mapAnim.inCorso(), false);
    });

    test('senza una mappa montata non parte', () => {
        assert.equal(s.window.CE_mapAnim.avvia(), false);
        assert.equal(s.window.CE_mapAnim.inCorso(), false);
        assert.deepEqual(fotogrammi, []);
    });

    test('parte quando la mappa si monta e si ferma quando si smonta', () => {
        const MB = s.window.MapBackend;
        MB.use('svg2d');
        MB.ensure();
        assert.equal(s.window.CE_mapAnim.inCorso(), true, 'montando la mappa il ciclo deve partire');
        MB.destroy();
        assert.equal(s.window.CE_mapAnim.inCorso(), false, 'smontando la mappa il ciclo deve fermarsi');
    });

    test('chiamare avvia due volte non fa girare due cicli', () => {
        s.window.CE_map.monta();
        s.window.CE_mapAnim.avvia();
        const dopoIlPrimo = fotogrammi.length;
        s.window.CE_mapAnim.avvia();
        assert.equal(fotogrammi.length, dopoIlPrimo, 'un secondo ciclo si e\' messo a girare in parallelo');
    });

    test('fermare senza aver avviato non lancia', () => {
        assert.doesNotThrow(() => s.window.CE_mapAnim.ferma());
    });
});

describe('map-animazione — cosa disegna', () => {

    let env, s, fotogrammi;
    beforeEach(() => {
        ({ env, s, fotogrammi } = ambiente());
        s.gameState.activeRides = [corsa()];
        s.window.CE_map.monta();
        s.window.CE_mapAnim.avvia();
    });
    afterEach(() => { s.window.CE_mapAnim.ferma(); env.stopAllIntervals(); });

    const auto = () => s.document.querySelectorAll('#ce-g-veicoli .ce-auto');
    const scie = () => s.document.querySelectorAll('#ce-g-scie .ce-scia');

    test('un\'auto in strada diventa un\'auto sulla mappa', () => {
        assert.equal(auto().length, 1);
        assert.equal(scie().length, 1);
    });

    test('la posizione dell\'auto sta dentro il riquadro, senza NaN', () => {
        const t = auto()[0].getAttribute('transform');
        assert.ok(!/NaN/.test(t), `trasformazione guasta: ${t}`);
        const [, x, y] = t.match(/translate\(([-\d.]+),([-\d.]+)\)/);
        assert.ok(Number(x) >= 0 && Number(x) <= 500, `x ${x}`);
        assert.ok(Number(y) >= 0 && Number(y) <= 660, `y ${y}`);
    });

    test('l\'auto si sposta fra un fotogramma e l\'altro', () => {
        const prima = auto()[0].getAttribute('transform');
        // il ciclo usa Date.now(): un giro successivo con tempo avanzato
        const finto = Date.now() + 4000;
        const veroNow = Date.now;
        s.Date = Object.assign(Object.create(Date), Date, { now: () => finto });
        s.window.CE_mapAnim._giro();
        s.Date = Date;
        assert.notEqual(auto()[0].getAttribute('transform'), prima,
            'l\'auto non si e\' mossa');
        assert.equal(typeof veroNow, 'function');
    });

    /* La scia non si ricostruisce sessanta volte al secondo: il percorso si
       proietta UNA VOLTA e l'avanzamento e' un `stroke-dashoffset`. */
    test('la scia si proietta una volta e poi avanza col dashoffset', () => {
        const scia = scie()[0];
        const dPrima = scia.getAttribute('d');
        const offsetPrima = Number(scia.getAttribute('stroke-dashoffset'));
        assert.ok(dPrima && dPrima.length > 5, 'la scia deve avere una geometria');
        assert.ok(!/NaN/.test(dPrima));
        assert.ok(Number(scia.getAttribute('stroke-dasharray')) > 0);

        const finto = Date.now() + 5000;
        s.Date = Object.assign(Object.create(Date), Date, { now: () => finto });
        s.window.CE_mapAnim._giro();
        s.Date = Date;

        assert.equal(scie()[0].getAttribute('d'), dPrima, 'la geometria della scia e\' stata rifatta');
        assert.ok(Number(scie()[0].getAttribute('stroke-dashoffset')) < offsetPrima,
            'la scia doveva allungarsi');
    });

    test('quando la corsa finisce, l\'auto e la scia spariscono', () => {
        assert.equal(auto().length, 1);
        s.gameState.activeRides = [];
        s.window.CE_mapAnim._giro();
        assert.equal(auto().length, 0);
        assert.equal(scie().length, 0);
    });

    test('a scheda nascosta non disegna niente', () => {
        s.gameState.activeRides = [corsa(), Object.assign(corsa(), { id: 2, driverId: 'd2' })];
        Object.defineProperty(s.document, 'visibilityState', { value: 'hidden', configurable: true });
        s.window.CE_mapAnim._giro();
        assert.equal(auto().length, 1, 'la seconda auto non doveva essere disegnata a scheda nascosta');
        Object.defineProperty(s.document, 'visibilityState', { value: 'visible', configurable: true });
        s.window.CE_mapAnim._giro();
        assert.equal(auto().length, 2, 'tornando visibile deve riprendere a disegnare');
    });

    test('un percorso degenere non produce una scia guasta', () => {
        const p = s.window.CE_mapAnim._preparaPercorso([[12.5, 41.9]]);
        assert.equal(p, null, 'un percorso di un punto solo non e\' una scia');
        const q = s.window.CE_mapAnim._preparaPercorso([[12.5, 41.9], [11.25, 43.77]]);
        assert.ok(q.lunghezza > 0);
        assert.ok(!/NaN/.test(q.d));
    });
});
