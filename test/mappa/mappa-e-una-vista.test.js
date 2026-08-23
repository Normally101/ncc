'use strict';
/**
 * «La mappa e' una vista, non un database.»
 *
 * E' la regola che Vlad ha chiesto per iscritto prima di far scrivere una
 * riga di questo lavoro, ed e' il genere di regola che marcisce: nessuno la
 * viola apposta, la si viola aggiungendo "una cache, tanto e' solo per
 * disegnare". Questo file la rende meccanica — gameState viene CONGELATO e
 * l'istantanea costruita sopra: qualunque scrittura lancia.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const FILES = [...CORE_FILES, 'map-proiezione.js', 'geo-italia.js', 'map-dati.js'];

/* Un pezzo di rete autostradale finto, in [lat, lon] come il vero HIGHWAYS
   di dispatcher.js. Serve a provare che la conversione d'assi avviene. */
const STRADE = {
    'roma-firenze':  { req: ['lazio', 'toscana'], path: [[41.90, 12.50], [43.77, 11.26]] },
    'roma-napoli':   { req: ['lazio', 'campania'], path: [[41.90, 12.50], [40.85, 14.27]] },
    'senza-vincoli': { path: [[45.00, 9.00], [45.50, 9.20]] },
};

function ambiente() {
    const env = createGameEnv(FILES);
    const s = env.sandbox;
    /* initGame programma dei setTimeout che scriverebbero in gameState dopo
       la fine del test — e in un test che CONGELA gameState quella scrittura
       diventa un'eccezione fuori contesto. Qui non serve niente di
       differito: si testa CE_mapData, che e' sincrono. */
    s.setTimeout = () => 0;
    s.initGame(true);
    env.stopAllIntervals();
    s.HIGHWAYS = STRADE;
    return { env, s };
}

/* Congela in profondita'. Non basta Object.freeze in cima: la scrittura
   pericolosa e' `ride._waypoints = …`, tre livelli sotto. */
function congela(o, visti) {
    visti = visti || new Set();
    if (!o || typeof o !== 'object' || visti.has(o)) return o;
    visti.add(o);
    Object.freeze(o);
    for (const k of Object.keys(o)) congela(o[k], visti);
    return o;
}

describe('map-dati — la mappa e\' una vista, non un database', () => {

    let env, s;
    beforeEach(() => { ({ env, s } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    /* IL test. Se un giorno diventa rosso, non si aggiusta il test. */
    test('costruire l\'istantanea con gameState CONGELATO non lancia', () => {
        s.gameState.unlockedRegions = ['lazio', 'toscana'];
        s.gameState.ownedHubs = ['roma'];
        s.gameState.hq = { lng: 12.4964, lat: 41.9028, region: 'lazio', name: 'Sede', level: 1 };
        s.gameState.activeRides = [{
            id: 1, tier: 'vip', duration: 1000,
            fromPoi: { id: 'roma', lat: 41.9, lng: 12.5 },
            toPoi:   { id: 'firenze', lat: 43.77, lng: 11.26 },
        }];

        congela(s.gameState);

        let istantanea;
        assert.doesNotThrow(() => { istantanea = s.window.CE_mapData.istantanea(); },
            'l\'istantanea ha scritto dentro gameState: la mappa non e\' piu\' una vista');
        assert.ok(istantanea.regioni.length === 20);
    });

    test('due istantanee di fila danno lo stesso risultato e non cambiano niente', () => {
        s.gameState.unlockedRegions = ['lazio'];
        const prima = JSON.stringify(s.window.CE_mapData.istantanea());
        const statoPrima = JSON.stringify(s.gameState);
        const dopo = JSON.stringify(s.window.CE_mapData.istantanea());
        assert.equal(prima, dopo);
        assert.equal(JSON.stringify(s.gameState), statoPrima, 'gameState e\' cambiato fra due letture');
    });

    test('l\'istantanea non condivide oggetti mutabili con gameState', () => {
        s.gameState.unlockedRegions = ['lazio'];
        const i = s.window.CE_mapData.istantanea();
        i.regioni[0].stato = 'manomessa';
        i.citta[0].name = 'manomessa';
        const j = s.window.CE_mapData.istantanea();
        assert.notEqual(j.regioni[0].stato, 'manomessa');
        assert.notEqual(j.citta[0].name, 'manomessa');
    });
});

describe('map-dati — cosa dice l\'istantanea', () => {

    let env, s;
    beforeEach(() => { ({ env, s } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('le venti regioni, ognuna col suo stato', () => {
        s.gameState.unlockedRegions = ['lazio', 'toscana'];
        s.gameState.ownedHubs = ['milano'];
        const i = s.window.CE_mapData.istantanea();
        const per = Object.fromEntries(i.regioni.map(r => [r.id, r.stato]));
        assert.equal(i.regioni.length, 20);
        assert.equal(per.toscana, 'sbloccata');
        assert.equal(per.lombardia, 'hub', 'possedere un POI rende la regione "hub"');
        assert.equal(per.sicilia, 'bloccata');
    });

    test('la regione della sede conta come hub anche senza POI posseduti', () => {
        s.gameState.unlockedRegions = ['campania'];
        s.gameState.ownedHubs = [];
        s.gameState.hq = { lng: 14.27, lat: 40.85, region: 'campania', name: 'Sede', level: 0 };
        const i = s.window.CE_mapData.istantanea();
        assert.equal(i.regioni.find(r => r.id === 'campania').stato, 'hub');
    });

    test('ogni regione porta i confini e un punto etichetta dentro i confini', () => {
        const P = s.window.CE_proj;
        for (const r of s.window.CE_mapData.istantanea().regioni) {
            assert.ok(Array.isArray(r.coordinates) && r.coordinates.length, `${r.id}: confini mancanti`);
            assert.ok(r.label, `${r.id}: etichetta mancante`);
            assert.ok(P.dentroRegione(r.label[0], r.label[1], r.coordinates), `${r.id}: etichetta fuori`);
        }
    });

    test('le 41 citta\', con lo stato di sblocco della loro regione', () => {
        s.gameState.unlockedRegions = ['lazio'];
        s.gameState.ownedHubs = ['roma'];
        const i = s.window.CE_mapData.istantanea();
        assert.equal(i.citta.length, 41);
        const roma = i.citta.find(c => c.id === 'roma');
        assert.equal(roma.sbloccata, true);
        assert.equal(roma.mio, true);
        assert.equal(i.citta.find(c => c.id === 'milano').sbloccata, false);
    });

    /* LA TRAPPOLA. HIGHWAYS e' in [lat, lon], GeoJSON e la mappa sono in
       [lon, lat]. Chi non se ne accorge manda le auto in Africa: Roma
       diventerebbe (41.9 est, 12.5 nord), cioe' il Sudan. */
    test('le autostrade escono in [lon, lat], non in [lat, lon] come entrano', () => {
        s.gameState.unlockedRegions = ['lazio', 'toscana'];
        const i = s.window.CE_mapData.istantanea();
        const a1 = i.autostrade.find(x => x.id === 'roma-firenze');
        assert.deepEqual([...a1.punti[0]], [12.50, 41.90],
            'l\'entrata era [41.90, 12.50]: qui deve essere girata');
        assert.deepEqual([...a1.punti[1]], [11.26, 43.77]);
        // e la prova che sarebbe in Italia, non in Sudan
        assert.equal(s.window.CE_proj.regioneAlPunto(a1.punti[0][0], a1.punti[0][1],
            s.window.GEO_ITALIA.regions), 'lazio');
    });

    test('una tratta e\' attiva solo se possiedi TUTTE le regioni che attraversa', () => {
        s.gameState.unlockedRegions = ['lazio'];
        const i = s.window.CE_mapData.istantanea();
        const per = Object.fromEntries(i.autostrade.map(a => [a.id, a.attiva]));
        assert.equal(per['roma-firenze'], false, 'manca la Toscana');
        assert.equal(per['senza-vincoli'], true, 'senza vincoli e\' sempre attiva');

        s.gameState.unlockedRegions = ['lazio', 'toscana'];
        const j = s.window.CE_mapData.istantanea();
        assert.equal(j.autostrade.find(a => a.id === 'roma-firenze').attiva, true);
    });

    test('la sede compare solo quando esiste davvero', () => {
        s.gameState.hq = { lng: null, lat: null, region: null, name: null, level: 0 };
        assert.equal(s.window.CE_mapData.istantanea().hq, null);
        s.gameState.hq = { lng: 12.5, lat: 41.9, region: 'lazio', name: 'Via Nazionale', level: 2 };
        const hq = s.window.CE_mapData.istantanea().hq;
        assert.deepEqual([hq.lon, hq.lat, hq.name, hq.livello], [12.5, 41.9, 'Via Nazionale', 2]);
    });

    /* La posizione dei veicoli NON sta nell'istantanea: la calcola il ciclo
       di animazione sessanta volte al secondo, e calcolarla qui vorrebbe dire
       scrivere `ride._waypoints` — cioe' violare la regola di questo file. */
    test('le corse portano gli estremi, non la posizione', () => {
        s.gameState.activeRides = [{
            id: 7, tier: 'vip', duration: 1000,
            fromPoi: { id: 'roma', lat: 41.9, lng: 12.5 },
            toPoi:   { id: 'napoli', lat: 40.85, lng: 14.27 },
        }];
        const c = s.window.CE_mapData.istantanea().corse;
        assert.equal(c.length, 1);
        assert.deepEqual([...c[0].da], [12.5, 41.9]);
        assert.deepEqual([...c[0].a], [14.27, 40.85]);
        assert.equal('lon' in c[0], false, 'la posizione istantanea non appartiene a un\'istantanea');
    });

    test('una corsa senza estremi viene scartata invece di produrre NaN', () => {
        s.gameState.activeRides = [{ id: 1, tier: 'vip' }, { id: 2, fromPoi: { lat: 1, lng: 1 } }];
        assert.deepEqual([...s.window.CE_mapData.istantanea().corse], []);
    });

    test('senza gameState e senza confini non lancia, restituisce il vuoto', () => {
        const env2 = createGameEnv(['map-proiezione.js', 'map-dati.js']);
        let i;
        assert.doesNotThrow(() => { i = env2.sandbox.window.CE_mapData.istantanea(); });
        assert.deepEqual([...i.regioni], []);
        assert.deepEqual([...i.citta], []);
        assert.equal(i.hq, null);
        env2.stopAllIntervals();
    });
});
