'use strict';
/**
 * Il dato geografico: peso, forma, e soprattutto che sia ancora l'Italia.
 *
 * geo-italia.js e' generato da scripts/semplifica-geo.mjs a partire da un
 * GeoJSON ISTAT da 2.750.289 byte. Semplificare vuol dire buttare via
 * novemila vertici su settantamila: questi test sorvegliano che quello che
 * resta sia ancora utilizzabile — non "bello", proprio utilizzabile.
 *
 * Le aree originali sono costanti incollate dall'uscita dello script, cosi'
 * il test non ha bisogno dei 2,75 MB per sapere quanto ha derivato.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/* Il file si carica in una VM NUDA: niente jsdom, niente resto del gioco.
   E' quel vincolo che lo tiene un dato e non un pezzo di applicazione. */
function carica(files) {
    const s = { console };
    s.window = s;
    vm.createContext(s);
    for (const f of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
    }
    return s;
}

const s = carica(['geo-italia.js', 'data.js', 'geoCoords.js']);
const GEO     = s.window.GEO_ITALIA;
const POIS    = vm.runInContext('POIS', s);
const REGIONS = vm.runInContext('REGIONS', s);
const CENTROIDI = s.window.REGION_CENTROIDS;

const SORGENTE = fs.readFileSync(path.join(ROOT, 'geo-italia.js'), 'utf8');

/* Misurate sul GeoJSON completo, in gradi quadri. */
const AREE_ORIGINALI = {
    piemonte: 2.902631, valle_aosta: 0.377023, lombardia: 2.754801,
    trentino: 1.593057, veneto: 2.117527, friuli: 0.922429,
    liguria: 0.611247, emilia: 2.547241, toscana: 2.556621,
    marche: 1.035418, umbria: 0.932772, lazio: 1.869336,
    abruzzo: 1.177435, molise: 0.480259, campania: 1.453001,
    puglia: 2.070878, basilicata: 1.061603, calabria: 1.569454,
    sicilia: 2.623720, sardegna: 2.548087,
};

/* Gli anelli sono PIATTI: [lon,lat,lon,lat,…]. */
function areaAnello(a) {
    let sm = 0;
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
        sm += a[j] * a[i + 1] - a[i] * a[j + 1];
    }
    return Math.abs(sm / 2);
}
function areaRegione(r) {
    return r.coordinates.reduce((t, poly) =>
        t + poly.reduce((acc, an, i) => acc + (i === 0 ? areaAnello(an) : -areaAnello(an)), 0), 0);
}
function dentroAnello(x, y, a) {
    let dentro = false;
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
        const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
}
function dentroRegione(x, y, r) {
    for (const poly of r.coordinates) {
        if (!dentroAnello(x, y, poly[0])) continue;
        let inBuco = false;
        for (let i = 1; i < poly.length; i++) if (dentroAnello(x, y, poly[i])) { inBuco = true; break; }
        if (!inBuco) return true;
    }
    return false;
}
function distanzaDaSegmento(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    if (!dx && !dy) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distanzaDalBordo(x, y, r) {
    let m = Infinity;
    for (const poly of r.coordinates) for (const a of poly) {
        for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
            m = Math.min(m, distanzaDaSegmento(x, y, a[j], a[j + 1], a[i], a[i + 1]));
        }
    }
    return m;
}
function vertici(r) {
    return r.coordinates.reduce((t, poly) => t + poly.reduce((a, an) => a + an.length / 2, 0), 0);
}

describe('geo-italia — il dato geografico locale', () => {

    test('e\' un dato puro: si carica senza DOM e non ha effetti', () => {
        assert.equal(typeof GEO, 'object');
        assert.ok(GEO.regions && GEO.aliases && Array.isArray(GEO.bbox));
    });

    /* Il motivo per cui esiste: 2.750.289 byte scaricati a ogni apertura della
       War Room, da un dominio di terze parti nella CSP. */
    test('pesa meno di 130 KB e sta sotto i 9.000 vertici', () => {
        const totVertici = Object.values(GEO.regions).reduce((t, r) => t + vertici(r), 0);
        assert.ok(SORGENTE.length <= 130000,
            `geo-italia.js pesa ${SORGENTE.length} byte: qualcuno ha allentato la tolleranza`);
        assert.ok(totVertici <= 9000, `${totVertici} vertici: troppi`);
        assert.ok(SORGENTE.length < 2750289 / 20,
            'deve restare almeno venti volte piu\' leggero della sorgente ISTAT');
    });

    test('ci sono tutte e venti le regioni, con gli id DI GIOCO', () => {
        assert.deepEqual(
            Object.keys(GEO.regions).sort(),
            Object.keys(REGIONS).sort(),
            'un vocabolario solo: gli id di GEO_ITALIA sono quelli di data.js::REGIONS'
        );
    });

    /* Una regione collassata in un triangolo passerebbe ogni controllo di peso
       e sarebbe invisibile in un diff. */
    test('nessuna regione e\' collassata: almeno 20 vertici a testa', () => {
        for (const [id, r] of Object.entries(GEO.regions)) {
            assert.ok(vertici(r) >= 20, `${id}: solo ${vertici(r)} vertici`);
            assert.ok(r.coordinates.length >= 1 && r.coordinates[0][0].length >= 8, `${id}: anello esterno vuoto`);
        }
    });

    test('l\'area di ogni regione non e\' derivata piu\' del 3%', () => {
        for (const [id, r] of Object.entries(GEO.regions)) {
            const prima = AREE_ORIGINALI[id];
            assert.ok(prima, `manca l'area originale di ${id}`);
            const deriva = Math.abs(areaRegione(r) - prima) / prima;
            assert.ok(deriva <= 0.03, `${id}: area derivata del ${(deriva * 100).toFixed(2)}%`);
        }
    });

    /* Non ereditato dalla sorgente: se la semplificazione ha buttato le isole
       minori, un bbox vecchio lascia l'Italia a galleggiare in un mare vuoto. */
    test('il bbox e\' quello dei dati semplificati, non quello ereditato', () => {
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        for (const r of Object.values(GEO.regions)) {
            for (const poly of r.coordinates) for (const a of poly) {
                for (let i = 0; i < a.length; i += 2) {
                    if (a[i] < minLon) minLon = a[i];
                    if (a[i] > maxLon) maxLon = a[i];
                    if (a[i + 1] < minLat) minLat = a[i + 1];
                    if (a[i + 1] > maxLat) maxLat = a[i + 1];
                }
            }
        }
        const atteso = [minLon, minLat, maxLon, maxLat];
        GEO.bbox.forEach((v, i) => {
            assert.ok(Math.abs(v - atteso[i]) < 0.002, `bbox[${i}]: ${v} invece di ${atteso[i]}`);
        });
    });

    /* L'etichetta va DENTRO la regione. E' il motivo per cui GEO_ITALIA porta
       il suo `label` invece di riusare REGION_CENTROIDS di geoCoords.js: due
       di quei venti centroidi, scritti a mano, cadono in mare (vedi sotto). */
    test('il punto etichetta di ogni regione cade dentro la regione', () => {
        for (const [id, r] of Object.entries(GEO.regions)) {
            assert.ok(Array.isArray(r.label) && r.label.length === 2, `${id}: label mancante`);
            assert.ok(dentroRegione(r.label[0], r.label[1], r),
                `${id}: l'etichetta finirebbe fuori dai confini`);
        }
    });

    test('i 41 POI cadono nella propria regione, o a meno di 5 km dal confine', () => {
        const fuori = [];
        for (const [k, p] of Object.entries(POIS)) {
            const r = GEO.regions[p.region];
            if (!r) { fuori.push(`${k}: regione ignota "${p.region}"`); continue; }
            if (dentroRegione(p.lng, p.lat, r)) continue;
            const km = distanzaDalBordo(p.lng, p.lat, r) * 111;
            /* Porti e aeroporti stanno legittimamente appena oltre una costa
               semplificata: Olba e Porto Cervo sono a 0,3 e 0,08 km. */
            if (km > 5) fuori.push(`${k} (${p.region}): ${km.toFixed(1)} km fuori`);
        }
        assert.deepEqual(fuori, [], 'POI finiti fuori dalla loro regione');
    });

    test('gli alias traducono ogni nome ISTAT in un id di gioco esistente', () => {
        for (const [nome, id] of Object.entries(GEO.aliases)) {
            assert.ok(GEO.regions[id], `l'alias "${nome}" punta a "${id}", che non esiste`);
        }
        for (const id of Object.keys(GEO.regions)) {
            assert.ok(Object.values(GEO.aliases).includes(id), `nessun alias porta a "${id}"`);
        }
    });

    test('nessuna coordinata e\' NaN o fuori dall\'Italia', () => {
        for (const [id, r] of Object.entries(GEO.regions)) {
            for (const poly of r.coordinates) for (const a of poly) {
                assert.equal(a.length % 2, 0, `${id}: anello con un numero dispari di numeri`);
                for (let i = 0; i < a.length; i += 2) {
                    assert.ok(Number.isFinite(a[i]) && Number.isFinite(a[i + 1]), `${id}: coordinata non numerica`);
                    assert.ok(a[i] > 6 && a[i] < 19, `${id}: longitudine ${a[i]} fuori dall'Italia`);
                    assert.ok(a[i + 1] > 35 && a[i + 1] < 48, `${id}: latitudine ${a[i + 1]} fuori dall'Italia`);
                }
            }
        }
    });

    /* Non e' un difetto nuovo: e' un difetto vecchio, misurato. Liguria e
       Calabria hanno un centroide scritto a mano che cade nel mare, e prima
       d'ora nessuno poteva accorgersene perche' non c'era un confine contro
       cui verificarlo. Il test lo blocca dove sta: se domani qualcuno ne
       aggiusta uno, questo elenco si accorcia e il test lo dice. */
    test('i centroidi scritti a mano in geoCoords.js: due su venti cadono in mare', () => {
        const fuori = Object.keys(CENTROIDI).filter(id => {
            const r = GEO.regions[id];
            return r && !dentroRegione(CENTROIDI[id][0], CENTROIDI[id][1], r);
        }).sort();
        assert.deepEqual(fuori, ['calabria', 'liguria'],
            'REGION_CENTROIDS non e\' affidabile per posizionare etichette: usa GEO_ITALIA[id].label');
    });
});
