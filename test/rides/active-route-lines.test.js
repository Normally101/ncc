'use strict';
/* ============================================================================
   test/rides/active-route-lines.test.js — Linee di rotta attive e traffico

   Fino al 23/08 questo test collaudava `_updateActiveRouteLines` di map.js:
   costruiva un finto `mapboxgl` per poter caricare quel file e verificava che
   la sorgente GeoJSON 'active-routes' ricevesse una geometria per corsa, e che
   il colore del tracciato virasse al rosso per le corse incolonnate.

   map.js non esiste piu'. La FUNZIONE che quel test proteggeva pero' esiste
   ancora, ed e' la stessa: **ogni corsa attiva ha la sua rotta disegnata, e le
   corse in coda si vedono diverse dalle altre**. Il test e' stato portato sul
   backend nuovo invece di essere cancellato — cancellarlo avrebbe lasciato
   sparire la funzione in silenzio, che e' esattamente il rischio del passo di
   rimozione.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [...CORE_FILES, 'map-proiezione.js', 'geo-italia.js', 'map-dati.js', 'map-svg.js'];

function ambiente() {
    const env = createGameEnv(FILES);
    const s = env.sandbox;
    s.setTimeout = () => 0;
    s.requestAnimationFrame = () => 1;
    s.cancelAnimationFrame = () => {};
    s.initGame(true);
    env.stopAllIntervals();
    s.gameState.unlockedRegions = ['lazio', 'toscana', 'campania'];
    s.gameState.activeTrips = [];
    s.HIGHWAYS = {
        'roma-firenze': { req: ['lazio', 'toscana'], path: [[41.90, 12.50], [42.72, 11.95], [43.77, 11.26]] },
        'roma-napoli':  { req: ['lazio', 'campania'], path: [[41.90, 12.50], [41.20, 13.50], [40.85, 14.27]] },
    };
    const root = s.document.createElement('div');
    root.id = 'map2d-root';
    s.document.body.appendChild(root);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'map-animazione.js'), 'utf8'), s,
        { filename: 'map-animazione.js' });
    s.window.MapBackend.use('svg2d');
    s.window.MapBackend.ensure();
    return { env, s };
}

function corsa(id, da, a, traffico) {
    return {
        id, driverId: 'd' + id, tier: 'vip', duration: 10000, elapsed: 0,
        inTraffic: !!traffico,
        fromPoi: da, toPoi: a,
    };
}
const ROMA    = { id: 'roma',    lat: 41.9028, lng: 12.4964 };
const FIRENZE = { id: 'firenze', lat: 43.7696, lng: 11.2558 };
const NAPOLI  = { id: 'napoli',  lat: 40.8518, lng: 14.2681 };

describe('mappa — linee di rotta delle corse attive', () => {

    let env, s;
    beforeEach(() => { ({ env, s } = ambiente()); });
    afterEach(() => { s.window.MapBackend.destroy(); env.stopAllIntervals(); });

    const rotte = () => s.document.querySelectorAll('#ce-g-rotte .ce-rotta');

    test('ogni corsa attiva ha la sua rotta disegnata', () => {
        s.gameState.activeRides = [corsa(101, ROMA, FIRENZE, false), corsa(102, ROMA, NAPOLI, true)];
        s.window.CE_mapAnim._giro();
        assert.equal(rotte().length, 2);
        rotte().forEach(r => {
            const d = r.getAttribute('d') || '';
            assert.ok(d.length > 5, 'la rotta deve avere una geometria');
            assert.ok(!/NaN|undefined/.test(d), `geometria guasta: ${d}`);
        });
    });

    /* Il cuore del test originale: le corse incolonnate si devono vedere
       diverse. Prima era setPaintProperty('active-routes-glow', …, '#ff4060'),
       adesso e' un attributo `stroke` sul path — ma la promessa al giocatore
       e' la stessa. */
    test('una corsa in coda si vede rossa, una scorrevole no', () => {
        s.gameState.activeRides = [corsa(101, ROMA, FIRENZE, false), corsa(102, ROMA, NAPOLI, true)];
        s.window.CE_mapAnim._giro();
        const colori = [...rotte()].map(r => r.getAttribute('stroke'));
        assert.equal(colori.filter(c => c === '#ff4060').length, 1, 'una sola rotta deve essere rossa');
        assert.equal(colori.filter(c => c === '#f59e0b').length, 1, 'l\'altra deve restare ambra');
    });

    test('il traffico che si scioglie riporta la rotta al colore normale', () => {
        const r = corsa(101, ROMA, FIRENZE, true);
        s.gameState.activeRides = [r];
        s.window.CE_mapAnim._giro();
        assert.equal(rotte()[0].getAttribute('stroke'), '#ff4060');
        r.inTraffic = false;
        s.window.CE_mapAnim._giro();
        assert.equal(rotte()[0].getAttribute('stroke'), '#f59e0b');
    });

    test('senza corse attive non resta nessuna rotta a schermo', () => {
        s.gameState.activeRides = [corsa(101, ROMA, FIRENZE, false)];
        s.window.CE_mapAnim._giro();
        assert.equal(rotte().length, 1);
        s.gameState.activeRides = [];
        s.window.CE_mapAnim._giro();
        assert.equal(rotte().length, 0);
    });

    test('la rotta e la scia condividono la stessa geometria', () => {
        s.gameState.activeRides = [corsa(101, ROMA, FIRENZE, false)];
        s.window.CE_mapAnim._giro();
        const rotta = rotte()[0].getAttribute('d');
        const scia = s.document.querySelector('#ce-g-scie .ce-scia').getAttribute('d');
        assert.equal(rotta, scia, 'la scia percorre la rotta, non un\'altra strada');
    });

    /* La regola che il test originale sorvegliava e che resta valida: una sola
       definizione, in un file solo. */
    test('nessun altro file ridefinisce il disegno delle rotte', () => {
        const sospetti = ['ui-map-utils.js', 'map-svg.js', 'map-dati.js', 'dispatcher.js'];
        for (const f of sospetti) {
            const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
            assert.ok(!/window\._updateActiveRouteLines\s*=/.test(src),
                `${f} non deve ridefinire _updateActiveRouteLines`);
        }
    });

    /* I commenti raccontano la storia e citano Mapbox per nome: e' giusto
       che lo facciano. Quello che non deve piu' esistere e' il CODICE. */
    const senzaCommenti = (src) => src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    test('Mapbox non e\' piu\' richiesto da nessuna parte del gioco', () => {
        const file = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && !f.startsWith('tailwind'));
        const colpevoli = [];
        for (const f of file) {
            const src = senzaCommenti(fs.readFileSync(path.join(ROOT, f), 'utf8'));
            if (/mapboxgl|api\.mapbox\.com/.test(src)) colpevoli.push(f);
        }
        assert.deepEqual(colpevoli, [], 'questi file dipendono ancora da Mapbox');
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(!/api\.mapbox\.com/.test(html), 'index.html carica ancora Mapbox');
        assert.ok(!/pk\.eyJ/.test(html), 'nessun token di mappa deve restare nella pagina');
    });
});
