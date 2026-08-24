'use strict';
/* ============================================================================
   test/mappa/map-router.test.js — Instradamento autostradale e interpolazione

   PRIMA COPERTURA: `_buildRideWaypoints` e `calculateInterpolatedPosition`
   (map-router.js) non erano esercitate da nessun test del repo — sono le due
   funzioni su cui poggiano tutte le azioni visive del sistema corse: la
   geometria che il dispatch disegna quando una corsa parte e la posizione
   dell'auto calcolata ad ogni frame dall'animazione.

   Non muovono denaro: qui si verifica il loro EFFETTO principale, cioè che
   i waypoint seguano davvero la rete HIGHWAYS reale (dispatcher.js) e che
   l'interpolazione rispetti il contratto [lng,lat] → [lat,lat] della
   geometria stradale. HIGHWAYS vive in dispatcher.js, che game-env NON
   carica: lo si inietta nello stesso contesto VM, come fa corse.test.js.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const DISPATCHER_SRC = fs.readFileSync(path.resolve(__dirname, '../../dispatcher.js'), 'utf8');

/* I punti tornano dal contesto VM: lì gli Array hanno un prototipo di un'altra
   realm e `assert.deepEqual` (strict) li dichiara diversi anche se identici.
   Si confrontano quindi le COORDINATE, non gli oggetti. */
const vicino = (a, b) => Math.abs(a - b) < 1e-9;
function stessoPunto(punto, atteso, msg) {
    const ok = Array.isArray(punto) && vicino(punto[0], atteso[0]) && vicino(punto[1], atteso[1]);
    assert.ok(ok, `${msg} — letto ${JSON.stringify(punto)}, atteso ${JSON.stringify(atteso)}`);
}
function stessoTracciato(tracciato, atteso, msg) {
    assert.ok(Array.isArray(tracciato), msg);
    assert.equal(tracciato.length, atteso.length, `${msg} — numero di waypoint`);
    atteso.forEach((p, i) => stessoPunto(tracciato[i], p, `${msg} — waypoint ${i}`));
}

describe('map-router — instradamento delle corse sulla rete autostradale', () => {
    let env, sandbox, POIS, HIGHWAYS;

    beforeEach(() => {
        env = freshEnv();
        env.stopAllIntervals();
        sandbox = env.sandbox;
        // dispatcher.js non è tra i CORE_FILES ma definisce HIGHWAYS, di cui
        // map-router.js ha bisogno a runtime (stesso contesto = stessa semantica
        // di due <script> nella stessa pagina).
        vm.runInContext(DISPATCHER_SRC, sandbox, { filename: 'dispatcher.js' });
        ({ POIS, HIGHWAYS } = vm.runInContext('({ POIS, HIGHWAYS })', sandbox));
    });

    afterEach(() => env.stopAllIntervals());

    test('_buildRideWaypoints su tratta diretta restituisce il path della autostrada esatta', () => {
        // 'roma-roma_fco' esiste come chiave singola della rete: nessun BFS,
        // il path deve essere IDENTICO alla tabella.
        const wpts = sandbox._buildRideWaypoints(POIS.roma, POIS.roma_fco);
        stessoTracciato(wpts, HIGHWAYS['roma-roma_fco'].path,
            'una tratta presente in HIGHWAYS deve usare il suo path letterale');
    });

    test('_buildRideWaypoints nel senso inverso inverte lo stesso path', () => {
        // La rete è dichiarata una volta sola per senso di marcia: il ritorno
       // deve essere lo stesso percorso ribaltato, non un path inventato.
        const fwd = HIGHWAYS['roma-roma_fco'].path;
        const wpts = sandbox._buildRideWaypoints(POIS.roma_fco, POIS.roma);
        stessoTracciato(wpts, [...fwd].reverse(), 'il senso inverso deve ribaltare il path');
        assert.ok(vicino(wpts[0][0], fwd[fwd.length - 1][0]), 'parte dal punto finale del verso dichiarato');
    });

    test('roma → milano: il BFS multi-hop segue A1 via Firenze e Bologna, senza strappi', () => {
        // Non esiste 'roma-milano' in HIGHWAYS: l'unica catena a 3 salti è
        // roma-firenze → firenze-bologna → bologna-milano. Se il router
        // sbagliasse nodo o ordine, gli estremi e le giunzioni cambiano.
        const wpts = sandbox._buildRideWaypoints(POIS.roma, POIS.milano);

        assert.ok(Array.isArray(wpts) && wpts.length >= 2, 'deve produrre una polilinea');
        assert.deepEqual(wpts[0], HIGHWAYS['roma-firenze'].path[0], 'parte da Roma');
        assert.deepEqual(wpts[wpts.length - 1], HIGHWAYS['bologna-milano'].path.at(-1),
            'arriva al capolinea Milano dell\'ultima autostrada percorsa');

        // Giunzioni fra segmenti consecutivi: niente salti teletrasporto.
        // 6 punti A1 Roma-Firenze, poi Firenze-Bologna privata del primo punto, ecc.
        const attesa = [
            ...HIGHWAYS['roma-firenze'].path,
            ...HIGHWAYS['firenze-bologna'].path.slice(1),
            ...HIGHWAYS['bologna-milano'].path.slice(1),
        ];
        assert.equal(wpts.length, attesa.length,
            'la polilinea concatena i segmenti senza duplicare le giunzioni');
        for (const wpt of attesa) {
            assert.ok(wpts.some(p => p[0] === wpt[0] && p[1] === wpt[1]),
                `il punto autostradale ${wpt} deve comparire nella polilinea`);
        }
    });

    test('POI fuori dalla rete: fallback sulla linea retta origine → destinazione', () => {
        // Un POI senza archi (es. futuro o custom) non deve rompere l'animazione:
        // il ripiego è la retta fra le due coordinate.
        const from = { id: 'poi_fuori_rete_a', lat: 40.0, lng: 15.0 };
        const to   = { id: 'poi_fuori_rete_b', lat: 42.0, lng: 13.0 };
        const wpts = sandbox._buildRideWaypoints(from, to);
        stessoTracciato(wpts, [[40.0, 15.0], [42.0, 13.0]],
            'senza rete stradale si torna alla retta fra origine e destinazione');
    });

    test('calculateInterpolatedPosition: progresso 0 e 1 coincidono con origine e destinazione', () => {
        const ride = { fromPoi: POIS.roma, toPoi: POIS.milano, duration: 10000 };
        // I capilinea della rete sono arrotondati a 2 decimali: il router parte
        // dal nodo autostradale [41.90,12.50], non dalle coordinate esatte del POI.
        const inizio = sandbox.calculateInterpolatedPosition(ride, 0);
        stessoPunto(inizio, HIGHWAYS['roma-firenze'].path[0],
            'a corsa appena iniziata l\'auto è sul nodo autostradale di Roma');
        const fine = sandbox.calculateInterpolatedPosition(ride, 10000);
        stessoPunto(fine, HIGHWAYS['bologna-milano'].path.at(-1),
            'a corsa conclusa l\'auto è sul capolinea autostradale di Milano');
    });

    test('a metà corsa l\'auto viaggia SULLA autostrada, non sulla retta fra le città', () => {
        // Il motivo per cui esiste il router: il punto medio della A1 è vicino
        // a Firenze (~44°N), quello della corda Roma-Milano sta nell'Appennino.
        const ride = { fromPoi: POIS.roma, toPoi: POIS.milano, duration: 10000 };
        const pos = sandbox.calculateInterpolatedPosition(ride, 5000);
        const metaRetta = [(POIS.roma.lat + POIS.milano.lat) / 2, (POIS.roma.lng + POIS.milano.lng) / 2];
        assert.ok(Math.abs(pos[0] - metaRetta[0]) > 0.25 && Math.abs(pos[1] - metaRetta[1]) > 0.25,
            `l'auto (${pos}) non deve seguire la corda (${metaRetta}) ma l'autostrada`);
    });

    test('i waypoint costruiti vengono memoizzati sulla corsa (nessun ricalcolo per frame)', () => {
        // calculateInterpolatedPosition gira ad ogni frame dell'animazione:
        // se ride._waypoints venisse ricostruito ogni volta, il BFS girerebbe
        // 60 volte al secondo per ogni auto in moto.
        const ride = { fromPoi: POIS.roma, toPoi: POIS.milano, duration: 10000 };
        sandbox.calculateInterpolatedPosition(ride, 0);
        const memo = ride._waypoints;
        assert.ok(Array.isArray(memo) && memo.length >= 2, 'dopo il primo frame i waypoint sono in cache sulla corsa');
        sandbox.calculateInterpolatedPosition(ride, 5000);
        assert.equal(ride._waypoints, memo, 'al frame successivo riusa lo stesso array');
    });

    test('roadGeom (geometria stradale vera) ha la precedenza ed è in ordine [lng,lat]', () => {
        // Contratto Mapbox: la geometria arriva [lng,lat] ma l'animazione vuole
        // [lat,lng]. Invertire l'ordine qui manda le auto in mare.
        const ride = {
            duration: 1000,
            fromPoi: POIS.roma, toPoi: POIS.milano,
            roadGeom: [[12.0, 41.0], [13.0, 42.0]], // [lng, lat]
        };
        const pos = sandbox.calculateInterpolatedPosition(ride, 500);
        stessoPunto(pos, [41.5, 12.5],
            'a metà geometria l\'output deve essere [lat,lng] = [41.5, 12.5]');
    });

    test('le due funzioni sono esportate su window: è così che le consuma la UI corse', () => {
        assert.equal(typeof sandbox.window.calculateInterpolatedPosition, 'function');
        assert.equal(typeof sandbox.window._buildRideWaypoints, 'function');
        assert.equal(sandbox.calculateInterpolatedPosition, sandbox.window.calculateInterpolatedPosition);
    });
});
