'use strict';
/**
 * L'orologio delle corse.
 *
 * Stava dentro map-visual.js, mescolato al disegno dei marcatori Mapbox, e
 * per questo il banco di prova non lo caricava: il pezzo che decide quando
 * una corsa e' a meta' e dove sta l'auto era l'unico non collaudato di tutto
 * il motore delle corse. Separato, questi test lo coprono.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const FILES = [...CORE_FILES, 'map-proiezione.js', 'geo-italia.js'];

const STRADE = {
    'roma-firenze': { req: ['lazio', 'toscana'], path: [[41.90, 12.50], [42.72, 11.95], [43.77, 11.26]] },
};

function ambiente() {
    const env = createGameEnv(FILES);
    const s = env.sandbox;
    s.setTimeout = () => 0;
    s.initGame(true);
    env.stopAllIntervals();
    s.HIGHWAYS = STRADE;
    s.gameState.activeTrips = [];
    return { env, s };
}

function corsa(extra) {
    return Object.assign({
        id: 1, driverId: 'ceo', tier: 'vip', duration: 10000, elapsed: 0,
        fromPoi: { id: 'roma', lat: 41.9028, lng: 12.4964 },
        toPoi:   { id: 'firenze', lat: 43.7696, lng: 11.2558 },
    }, extra || {});
}

describe('tickRideProgress — a che punto e\' la corsa', () => {

    let env, s;
    beforeEach(() => { ({ env, s } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('senza corse non restituisce niente e non lancia', () => {
        s.gameState.activeRides = [];
        assert.deepEqual([...s.window.tickRideProgress(Date.now())], []);
    });

    test('a gioco in pausa l\'orologio si ferma', () => {
        s.gameState.activeRides = [corsa()];
        s.gameState.paused = true;
        assert.deepEqual([...s.window.tickRideProgress(Date.now())], []);
    });

    test('la corsa avanza col tempo reale, non a scatti di tick', () => {
        const r = corsa();
        s.gameState.activeRides = [r];
        const t0 = 1_000_000;
        s.window.tickRideProgress(t0);
        const a = s.window.tickRideProgress(t0 + 2500)[0];
        assert.ok(Math.abs(a.progresso - 0.25) < 1e-6, `progresso ${a.progresso}`);
        const b = s.window.tickRideProgress(t0 + 7500)[0];
        assert.ok(Math.abs(b.progresso - 0.75) < 1e-6, `progresso ${b.progresso}`);
    });

    test('il progresso non supera mai 1', () => {
        s.gameState.activeRides = [corsa()];
        s.window.tickRideProgress(1_000_000);
        const v = s.window.tickRideProgress(1_000_000 + 999_999)[0];
        assert.equal(v.progresso, 1);
    });

    /* Quando il server manda i tempi, ha ragione lui: e' l'unico modo perche'
       due giocatori che guardano la stessa corsa vedano la stessa cosa. */
    test('i tempi del server vincono sull\'orologio locale', () => {
        const r = corsa();
        s.gameState.activeRides = [r];
        s.gameState.activeTrips = [{
            id: 1,
            start_time: new Date(1_000_000).toISOString(),
            end_time:   new Date(1_010_000).toISOString(),
        }];
        r.visualElapsed = 9000; // l'orologio locale direbbe 90%
        const v = s.window.tickRideProgress(1_002_000)[0];
        assert.ok(Math.abs(v.progresso - 0.2) < 1e-6, `il server dice 20%, l'orologio dice ${v.progresso}`);
    });

    test('scrive la barra di avanzamento dell\'autista', () => {
        s.gameState.activeRides = [corsa()];
        const barra = s.document.createElement('div');
        barra.id = 'prog-ceo';
        s.document.body.appendChild(barra);
        s.window.tickRideProgress(1_000_000);
        s.window.tickRideProgress(1_005_000);
        assert.equal(barra.style.width, '50%');
    });

    test('senza barra a schermo non lancia', () => {
        s.gameState.activeRides = [corsa({ driverId: 'inesistente' })];
        assert.doesNotThrow(() => s.window.tickRideProgress(Date.now()));
    });
});

describe('tickRideProgress — dove sta l\'auto', () => {

    let env, s;
    beforeEach(() => { ({ env, s } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('la posizione esce in [lon, lat], e cade in Italia', () => {
        s.gameState.activeRides = [corsa()];
        s.window.tickRideProgress(1_000_000);
        const v = s.window.tickRideProgress(1_005_000)[0];
        assert.ok(v.lon > 6 && v.lon < 19, `longitudine ${v.lon}`);
        assert.ok(v.lat > 35 && v.lat < 48, `latitudine ${v.lat}`);
        assert.equal(
            s.window.CE_proj.regioneAlPunto(v.lon, v.lat, s.window.GEO_ITALIA.regions) !== null,
            true, 'a meta\' strada fra Roma e Firenze si deve essere sulla terraferma');
    });

    /* La trappola: se qualcuno scambia gli assi, Roma (12,5 E · 41,9 N)
       diventa 41,9 E · 12,5 N, cioe' il Sudan. Il test lo dice. */
    test('all\'inizio l\'auto e\' a Roma, non in Sudan', () => {
        s.gameState.activeRides = [corsa()];
        const v = s.window.tickRideProgress(1_000_000)[0];
        assert.ok(Math.abs(v.lon - 12.4964) < 0.5, `longitudine ${v.lon}`);
        assert.ok(Math.abs(v.lat - 41.9028) < 0.5, `latitudine ${v.lat}`);
    });

    test('l\'auto arriva davvero a destinazione', () => {
        s.gameState.activeRides = [corsa()];
        s.window.tickRideProgress(1_000_000);
        const v = s.window.tickRideProgress(1_999_999)[0];
        assert.ok(Math.abs(v.lon - 11.2558) < 0.3, `longitudine finale ${v.lon}`);
        assert.ok(Math.abs(v.lat - 43.7696) < 0.3, `latitudine finale ${v.lat}`);
    });

    /* Senza Mapbox non c'e' piu' `roadGeom`: le auto seguono l'instradamento
       BFS sulle autostrade del gioco. Non c'e' codice da scrivere — c'era
       codice da cancellare. */
    test('senza geometria stradale l\'auto passa dalle autostrade del gioco', () => {
        const r = corsa();
        s.gameState.activeRides = [r];
        s.window.tickRideProgress(1_000_000);
        const v = s.window.tickRideProgress(1_005_000)[0];
        assert.ok(Array.isArray(v.percorso) && v.percorso.length >= 2, 'deve esserci un percorso');
        // il punto intermedio dell'autostrada finta e' [42.72, 11.95] -> [11.95, 42.72]
        const passa = v.percorso.some(p => Math.abs(p[0] - 11.95) < 0.01 && Math.abs(p[1] - 42.72) < 0.01);
        assert.equal(passa, true, 'il percorso deve seguire i punti dell\'autostrada, girati in [lon,lat]');
    });

    test('con la geometria stradale vera la usa cosi\' com\'e\' ([lon,lat])', () => {
        const r = corsa({ roadGeom: [[12.4964, 41.9028], [12.0, 42.5], [11.2558, 43.7696]] });
        s.gameState.activeRides = [r];
        const v = s.window.tickRideProgress(1_000_000)[0];
        assert.deepEqual([...v.percorso[1]], [12.0, 42.5]);
    });

    test('l\'angolo di marcia punta a nord-ovest andando da Roma a Firenze', () => {
        s.gameState.activeRides = [corsa()];
        s.window.tickRideProgress(1_000_000);
        const v = s.window.tickRideProgress(1_003_000)[0];
        // bussola: 0 = nord, negativo = verso ovest
        assert.ok(v.angolo < 0 && v.angolo > -90, `angolo ${v.angolo}`);
    });

    test('un\'auto arrivata resta a destinazione finche\' il server non chiude', () => {
        s.gameState.activeRides = [];
        s.gameState.activeTrips = [{
            id: 42, driverId: 'ceo', tier: 'vip',
            toPoi: { id: 'firenze', lat: 43.7696, lng: 11.2558 },
        }];
        const v = s.window.tickRideProgress(Date.now());
        assert.equal(v.length, 1);
        assert.equal(v[0].inAttesa, true);
        assert.equal(v[0].progresso, 1);
        assert.ok(Math.abs(v[0].lon - 11.2558) < 1e-9);
    });

    test('una corsa attiva non viene raddoppiata dal suo gemello sul server', () => {
        s.gameState.activeRides = [corsa()];
        s.gameState.activeTrips = [{ id: 1, driverId: 'ceo', toPoi: { lat: 43.7, lng: 11.2 } }];
        const v = s.window.tickRideProgress(1_000_000);
        assert.equal(v.length, 1);
        assert.equal(v[0].inAttesa, false);
    });
});
