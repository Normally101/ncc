'use strict';
/**
 * La proiezione: da gradi a unita' SVG e ritorno.
 *
 * Vive in map-proiezione.js perche' la mappa principale e la War Room devono
 * disegnare la STESSA Italia. Se le proiezioni fossero due, un giorno
 * divergerebbero e nessuno saprebbe quale sia quella giusta.
 *
 * Il valore d'oro su Roma non e' pedanteria: e' il modo per accorgersi che
 * qualcuno ha cambiato il riquadro o la formula del Mercatore. Senza, un
 * cambio silenzioso sposterebbe ogni cosa a schermo e ogni test resterebbe
 * verde.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function carica(files) {
    const s = { console, Math, JSON };
    s.window = s;
    vm.createContext(s);
    for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
    return s;
}

const s = carica(['map-proiezione.js', 'geo-italia.js', 'data.js']);
const P = s.window.CE_proj;
const GEO = s.window.GEO_ITALIA;
const POIS = vm.runInContext('POIS', s);

describe('map-proiezione — la stessa Italia per tutti', () => {

    test('si carica in una VM nuda, senza jsdom e senza il resto del gioco', () => {
        assert.equal(typeof P.proietta, 'function');
        assert.equal(typeof P.inverti, 'function');
    });

    /* Se questo valore cambia, e' cambiato il riquadro o la formula: e'
       esattamente la cosa che nessun altro test noterebbe. */
    test('valore d\'oro: Roma cade a 245,82 / 307,40', () => {
        const [x, y] = P.proietta(12.4964, 41.9028);
        assert.ok(Math.abs(x - 245.8226) < 0.001, `x = ${x}`);
        assert.ok(Math.abs(y - 307.4017) < 0.001, `y = ${y}`);
    });

    test('andata e ritorno sui 41 POI, entro un milionesimo di grado', () => {
        for (const [k, p] of Object.entries(POIS)) {
            const [x, y] = P.proietta(p.lng, p.lat);
            const [lon, lat] = P.inverti(x, y);
            assert.ok(Math.abs(lon - p.lng) < 1e-6, `${k}: lon ${lon} invece di ${p.lng}`);
            assert.ok(Math.abs(lat - p.lat) < 1e-6, `${k}: lat ${lat} invece di ${p.lat}`);
        }
    });

    test('tutta l\'Italia entra nel riquadro 500x660', () => {
        for (const [id, r] of Object.entries(GEO.regions)) {
            for (const poly of r.coordinates) for (const a of poly) {
                for (let i = 0; i < a.length; i += 2) {
                    const [x, y] = P.proietta(a[i], a[i + 1]);
                    assert.ok(x >= 0 && x <= P.W, `${id}: x ${x} fuori dal riquadro`);
                    assert.ok(y >= 0 && y <= P.H, `${id}: y ${y} fuori dal riquadro`);
                }
            }
        }
    });

    /* Il guasto piu' comune di questo genere di codice: una sola coordinata
       guasta produce un `d` con dentro "NaN" e il browser scarta l'INTERO
       contorno, in silenzio. Non c'e' errore in console, c'e' una regione che
       sparisce. */
    test('nessun NaN nei path delle venti regioni', () => {
        for (const [id, r] of Object.entries(GEO.regions)) {
            const d = P.coordsAPath(r.coordinates);
            assert.ok(d.length > 100, `${id}: path troppo corto (${d.length} caratteri)`);
            assert.ok(!/NaN|Infinity|undefined/.test(d), `${id}: il path contiene un valore non numerico`);
            assert.match(d, /^M[\d.,\-LMZ]+Z$/, `${id}: il path non ha la forma attesa`);
        }
    });

    test('una coordinata guasta salta il punto invece di uccidere il contorno', () => {
        const d = P.anelloAPath([12, 41, NaN, 42, 13, 41, 12, 41]);
        assert.ok(!/NaN/.test(d), 'il path non deve contenere NaN');
        assert.ok(d.startsWith('M') && d.endsWith('Z'));
    });

    test('un anello vuoto produce un path vuoto, non "Z"', () => {
        assert.equal(P.anelloAPath([]), '');
        assert.equal(P.coordsAPath([]), '');
    });

    describe('punto in poligono — solo per la fondazione e i test, mai sul mouse', () => {

        test('le citta\' del gioco cadono nella regione giusta', () => {
            const prove = { roma: 'lazio', milano_duomo: 'lombardia', napoli: 'campania', torino: 'piemonte' };
            for (const [poi, atteso] of Object.entries(prove)) {
                const p = POIS[poi];
                if (!p) continue;
                assert.equal(P.regioneAlPunto(p.lng, p.lat, GEO.regions), atteso, `${poi}`);
            }
        });

        test('in mezzo al Tirreno non c\'e\' nessuna regione', () => {
            assert.equal(P.regioneAlPunto(11.5, 40.0, GEO.regions), null);
        });

        test('dal mare si trova comunque la terraferma piu\' vicina', () => {
            assert.equal(P.regionePiuVicina(11.9, 41.7, GEO.regions), 'lazio',    'al largo di Ostia');
            assert.equal(P.regionePiuVicina(13.0, 36.4, GEO.regions), 'sicilia',  'nel canale di Sicilia');
            assert.equal(P.regionePiuVicina(14.1, 40.6, GEO.regions), 'campania', 'nel golfo di Napoli');
        });

        /* La misura si fa sulla COSTA, non sul punto-etichetta. Con le
           etichette, al largo di Ostia la risposta sarebbe stata la Toscana:
           la sua etichetta e' piu' vicina, la sua costa no. */
        test('la vicinanza si misura sul confine, non sull\'etichetta', () => {
            const perEtichetta = (lon, lat) => {
                let vinc = null, min = Infinity;
                for (const [id, r] of Object.entries(GEO.regions)) {
                    const d = (r.label[0] - lon) ** 2 + (r.label[1] - lat) ** 2;
                    if (d < min) { min = d; vinc = id; }
                }
                return vinc;
            };
            // A ovest della Sardegna, in mezzo al mare.
            assert.equal(P.regioneAlPunto(7.0, 41.9, GEO.regions), null, 'e\' mare aperto');
            assert.equal(perEtichetta(7.0, 41.9), 'liguria',
                'l\'etichetta piu\' vicina sarebbe la Liguria, a trecento chilometri');
            assert.equal(P.regionePiuVicina(7.0, 41.9, GEO.regions), 'sardegna',
                'la costa piu\' vicina e\' la Sardegna: e\' questa la risposta giusta');
        });

        test('i buchi contano come fuori', () => {
            // quadrato 0..10 con un buco 4..6
            const coords = [[
                [0, 0, 10, 0, 10, 10, 0, 10, 0, 0],
                [4, 4, 6, 4, 6, 6, 4, 6, 4, 4],
            ]];
            assert.equal(P.dentroRegione(2, 2, coords), true, 'dentro l\'esterno');
            assert.equal(P.dentroRegione(5, 5, coords), false, 'dentro il buco = fuori');
            assert.equal(P.dentroRegione(20, 20, coords), false, 'fuori da tutto');
        });
    });
});
