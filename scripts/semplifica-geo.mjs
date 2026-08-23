#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   semplifica-geo.mjs — da 2,75 MB scaricati a ~100 KB nel repo
   ═══════════════════════════════════════════════════════════════════════════

   war_room.js scaricava i confini delle regioni italiane da
   raw.githubusercontent.com A OGNI APERTURA: 2.750.291 byte, un dominio di
   terze parti nella CSP, e la mappa che non si disegna se la rete non c'e'.

   Non esiste una versione a bassa risoluzione pubblicata, quindi la
   semplificazione la facciamo noi, una volta sola, qui. Lo script resta nel
   repo perche' la cosa sia ripetibile e non magica.

   IL CRITERIO NON E' ESTETICO, E' IL BUDGET IN PIXEL.
   La proiezione (war_room.js:63) e' larga 500 unita' per 12,4 gradi di
   longitudine: 1 unita' = 0,0248 gradi. Con lo zoom massimo a 4x un pixel
   reso vale circa 0,0062 gradi, cioe' mezzo chilometro. La regola e' che
   l'errore di semplificazione stia sotto MEZZO PIXEL al massimo zoom.

       uso:  node scripts/semplifica-geo.mjs
             node scripts/semplifica-geo.mjs --forza-download
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(QUI, '..');

const FONTE = 'https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson';
const CACHE = path.join(QUI, '.cache', 'limits_IT_regions.geojson');
const USCITA = path.join(ROOT, 'geo-italia.js');

/* ── I numeri, tutti qui e tutti derivati dal budget in pixel ───────────── */
const GRADI_PER_UNITA = (18.8 - 6.4) / 500;          // 0,0248 — dalla proiezione
const ZOOM_MASSIMO    = 4;
const GRADI_PER_PIXEL = GRADI_PER_UNITA / ZOOM_MASSIMO; // 0,0062
const TOLLERANZA      = 0.003;                        // mezzo pixel al 4x
const DECIMALI        = 3;                            // ~100 m, un sesto di pixel
const AREA_MINIMA     = 0.5 * GRADI_PER_PIXEL ** 2;   // mezzo pixel quadrato

/* I due tetti qui sotto sono MISURATI, non desiderati.
   Il piano stimava 120.000 byte e 6.000 vertici prima di aver eseguito la
   semplificazione una sola volta. La misura dice che il costo onesto della
   fedelta' richiesta (mezzo pixel al 4x) e' 8.493 vertici e 124.559 byte.
   Fra il piegare la geometria per far tornare un numero inventato e
   correggere il numero, si corregge il numero: la fedelta' e' derivata da
   qualcosa di reale (il pixel a schermo), i tetti no. Restano stretti
   abbastanza da cogliere una regressione — se domani il file raddoppia,
   qualcuno ha cambiato la tolleranza senza accorgersene. */
const TETTO_BYTE      = 130000;
const TETTO_VERTICI   = 9000;

/* ── Nome ISTAT → id di gioco. UN SOLO vocabolario di id nel file finale ── */
const ALIAS = {
    'Piemonte':               'piemonte',
    "Valle d'Aosta":          'valle_aosta',
    "Valle D'Aosta":          'valle_aosta',
    "Valle d'Aosta/Vallée d'Aoste": 'valle_aosta',
    'Lombardia':              'lombardia',
    'Trentino-Alto Adige':    'trentino',
    'Trentino Alto Adige':    'trentino',
    'Trentino-Alto Adige/Südtirol': 'trentino',
    'Trentino-South Tyrol':   'trentino',
    'Veneto':                 'veneto',
    'Friuli-Venezia Giulia':  'friuli',
    'Friuli Venezia Giulia':  'friuli',
    'Liguria':                'liguria',
    'Emilia-Romagna':         'emilia',
    'Toscana':                'toscana',
    'Marche':                 'marche',
    'Umbria':                 'umbria',
    'Lazio':                  'lazio',
    'Abruzzo':                'abruzzo',
    'Molise':                 'molise',
    'Campania':               'campania',
    'Puglia':                 'puglia',
    'Basilicata':             'basilicata',
    'Calabria':               'calabria',
    'Sicilia':                'sicilia',
    'Sardegna':               'sardegna',
};

const NOMI = {
    piemonte: 'Piemonte', valle_aosta: "Valle d'Aosta", lombardia: 'Lombardia',
    trentino: 'Trentino-Alto Adige', veneto: 'Veneto', friuli: 'Friuli-Venezia Giulia',
    liguria: 'Liguria', emilia: 'Emilia-Romagna', toscana: 'Toscana', marche: 'Marche',
    umbria: 'Umbria', lazio: 'Lazio', abruzzo: 'Abruzzo', molise: 'Molise',
    campania: 'Campania', puglia: 'Puglia', basilicata: 'Basilicata', calabria: 'Calabria',
    sicilia: 'Sicilia', sardegna: 'Sardegna',
};

/* ── Geometria ──────────────────────────────────────────────────────────── */

// Distanza punto-segmento nel piano lon/lat. Alla scala dell'Italia la
// deformazione del Mercatore e' irrilevante rispetto alla tolleranza.
function distanzaDaSegmento(p, a, b) {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker iterativo: ricorsivo esplodeva sugli anelli da 20.000 punti.
function douglasPeucker(punti, eps) {
    if (punti.length <= 2) return punti.slice();
    const tieni = new Uint8Array(punti.length);
    tieni[0] = tieni[punti.length - 1] = 1;
    const pila = [[0, punti.length - 1]];
    while (pila.length) {
        const [i, j] = pila.pop();
        if (j <= i + 1) continue;
        let maxD = -1, maxK = -1;
        for (let k = i + 1; k < j; k++) {
            const d = distanzaDaSegmento(punti[k], punti[i], punti[j]);
            if (d > maxD) { maxD = d; maxK = k; }
        }
        if (maxD > eps) { tieni[maxK] = 1; pila.push([i, maxK], [maxK, j]); }
    }
    const out = [];
    for (let i = 0; i < punti.length; i++) if (tieni[i]) out.push(punti[i]);
    return out;
}

const arrotonda = (p) => [
    Number(p[0].toFixed(DECIMALI)),
    Number(p[1].toFixed(DECIMALI)),
];

function togliDuplicatiConsecutivi(anello) {
    const out = [];
    for (const p of anello) {
        const u = out[out.length - 1];
        if (!u || u[0] !== p[0] || u[1] !== p[1]) out.push(p);
    }
    return out;
}

// Area con la formula del laccio di scarpe. Il segno dice il verso; qui
// serve solo il valore assoluto.
function area(anello) {
    let s = 0;
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
        s += (anello[j][0] * anello[i][1]) - (anello[i][0] * anello[j][1]);
    }
    return Math.abs(s / 2);
}

function areaGeometria(coords) {
    // coords = MultiPolygon: [ [anelloEsterno, ...buchi], ... ]
    return coords.reduce((tot, poly) =>
        tot + poly.reduce((a, anello, i) => a + (i === 0 ? area(anello) : -area(anello)), 0), 0);
}

function dentroAnello(punto, anello) {
    let dentro = false;
    const [x, y] = punto;
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
        const [xi, yi] = anello[i], [xj, yj] = anello[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
}

function dentroGeometria(punto, coords) {
    for (const poly of coords) {
        if (!dentroAnello(punto, poly[0])) continue;
        // dentro l'esterno: escludi i buchi
        let inBuco = false;
        for (let i = 1; i < poly.length; i++) if (dentroAnello(punto, poly[i])) { inBuco = true; break; }
        if (!inBuco) return true;
    }
    return false;
}

/* Un punto sicuramente DENTRO la regione, per l'etichetta.
   Il baricentro non basta: quello della Calabria cade nel Tirreno. Si prova
   il baricentro dell'anello maggiore e, se cade fuori, si cerca il punto
   interno piu' lontano dal bordo su una griglia. */
function puntoInterno(coords) {
    const anelli = coords.map(p => p[0]);
    const grande = anelli.reduce((a, b) => (area(a) >= area(b) ? a : b));
    let sx = 0, sy = 0;
    grande.forEach(([x, y]) => { sx += x; sy += y; });
    const bar = [sx / grande.length, sy / grande.length];
    if (dentroGeometria(bar, coords)) return arrotonda(bar);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    grande.forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    const PASSI = 60;
    let migliore = null, miglioreDist = -1;
    for (let i = 1; i < PASSI; i++) {
        for (let j = 1; j < PASSI; j++) {
            const p = [minX + (maxX - minX) * i / PASSI, minY + (maxY - minY) * j / PASSI];
            if (!dentroGeometria(p, coords)) continue;
            let d = Infinity;
            for (let k = 0, l = grande.length - 1; k < grande.length; l = k++) {
                d = Math.min(d, distanzaDaSegmento(p, grande[l], grande[k]));
            }
            if (d > miglioreDist) { miglioreDist = d; migliore = p; }
        }
    }
    return arrotonda(migliore || bar);
}

/* ── Scarico ────────────────────────────────────────────────────────────── */

async function scarica() {
    const forza = process.argv.includes('--forza-download');
    if (!forza && fs.existsSync(CACHE)) {
        console.log(`· uso la copia locale ${path.relative(ROOT, CACHE)}`);
        return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    }
    console.log(`· scarico ${FONTE}`);
    const resp = await fetch(FONTE);
    if (!resp.ok) throw new Error(`scaricamento fallito: ${resp.status}`);
    const testo = await resp.text();
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, testo);
    console.log(`· scaricati ${testo.length.toLocaleString('it-IT')} byte`);
    return JSON.parse(testo);
}

/* ── Il lavoro ──────────────────────────────────────────────────────────── */

function nomeDi(props) {
    return (props.reg_name || props.name || props.DEN_REG || props.NAME_1 || '').split('/')[0].trim();
}

function anelliDi(geometry) {
    if (geometry.type === 'Polygon') return [geometry.coordinates];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates;
    return [];
}

function semplificaRegione(polyOriginali) {
    // 1. semplifica ogni anello, 2. butta quelli collassati,
    // 3. butta i poligoni troppo piccoli per essere visti o cliccati.
    const poligoni = [];
    for (const poly of polyOriginali) {
        const anelli = [];
        for (const anello of poly) {
            let s = douglasPeucker(anello, TOLLERANZA).map(arrotonda);
            s = togliDuplicatiConsecutivi(s);
            // richiudi l'anello
            if (s.length && (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1])) s.push([...s[0]]);
            if (s.length >= 4) anelli.push(s);
        }
        if (anelli.length) poligoni.push(anelli);
    }
    if (!poligoni.length) return [];

    // L'anello maggiore e' intoccabile, sempre: e' la regione.
    const areeEsterne = poligoni.map(p => area(p[0]));
    const iMax = areeEsterne.indexOf(Math.max(...areeEsterne));
    return poligoni.filter((p, i) => i === iMax || areeEsterne[i] >= AREA_MINIMA);
}

function contaVertici(coords) {
    return coords.reduce((t, poly) => t + poly.reduce((a, an) => a + an.length, 0), 0);
}

async function main() {
    const geo = await scarica();

    const regioni = {};
    const areeOriginali = {};
    const verticiOriginali = {};
    const nonRiconosciute = [];

    for (const f of geo.features) {
        const nome = nomeDi(f.properties);
        const id = ALIAS[nome];
        if (!id) { nonRiconosciute.push(nome); continue; }

        const originali = anelliDi(f.geometry);
        areeOriginali[id] = areaGeometria(originali);
        verticiOriginali[id] = contaVertici(originali);

        const coords = semplificaRegione(originali);
        if (!coords.length) throw new Error(`${id}: la semplificazione ha cancellato la regione`);

        regioni[id] = {
            id,
            name: NOMI[id] || nome,
            label: puntoInterno(coords),
            coordinates: coords,
        };
    }

    if (nonRiconosciute.length) {
        console.warn(`! nomi non riconosciuti, ignorati: ${nonRiconosciute.join(', ')}`);
    }
    const mancanti = Object.keys(NOMI).filter(id => !regioni[id]);
    if (mancanti.length) throw new Error(`regioni mancanti nella sorgente: ${mancanti.join(', ')}`);

    /* Il bbox va RICALCOLATO sui dati semplificati: se spariscono le isole
       minori, un bbox ereditato lascia l'Italia a galleggiare in un mare
       vuoto. */
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const r of Object.values(regioni)) {
        for (const poly of r.coordinates) for (const anello of poly) for (const [x, y] of anello) {
            if (x < minLon) minLon = x; if (x > maxLon) maxLon = x;
            if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
        }
    }
    const bbox = [minLon, minLat, maxLon, maxLat].map(v => Number(v.toFixed(DECIMALI)));

    /* ── Il file ── */
    const righe = [];
    righe.push("'use strict';");
    righe.push('/* geo-italia.js — GENERATO da scripts/semplifica-geo.mjs. Non modificare a mano.');
    righe.push(' *');
    righe.push(' * Confini delle 20 regioni italiane, semplificati per il disegno.');
    righe.push(` * Fonte: ${FONTE}`);
    righe.push(` * Douglas-Peucker a ${TOLLERANZA} gradi (mezzo pixel a zoom ${ZOOM_MASSIMO}x),`);
    righe.push(` * coordinate a ${DECIMALI} decimali, anelli sotto ${AREA_MINIMA.toExponential(2)} gradi quadri rimossi.`);
    righe.push(' *');
    righe.push(' * Gli id sono quelli DI GIOCO (data.js::REGIONS). `aliases` traduce i nomi');
    righe.push(' * che arrivano dal server e dall\'ISTAT, che war_room.js confronta per nome.');
    righe.push(' * `label` e\' un punto garantito DENTRO la regione: il baricentro della');
    righe.push(' * Calabria cade nel Tirreno.');
    righe.push(' */');
    righe.push('window.GEO_ITALIA = {');
    righe.push(`    bbox: [${bbox.join(', ')}],`);
    righe.push('    aliases: {');
    for (const [nome, id] of Object.entries(ALIAS)) {
        righe.push(`        ${JSON.stringify(nome)}: '${id}',`);
    }
    righe.push('    },');
    righe.push('    regions: {');
    for (const id of Object.keys(NOMI)) {
        const r = regioni[id];
        righe.push(`        ${id}: {`);
        righe.push(`            id: '${id}',`);
        righe.push(`            name: ${JSON.stringify(r.name)},`);
        righe.push(`            label: [${r.label.join(', ')}],`);
        righe.push('            coordinates: [');
        for (const poly of r.coordinates) {
            righe.push('                [');
            for (const anello of poly) {
                /* Anello PIATTO: [lon,lat,lon,lat,…]. La forma annidata a
                   coppie costava 2 caratteri per vertice — 17 KB su 8.500
                   vertici — senza aggiungere niente: la struttura e' gia'
                   data dall'annidamento poligono/anello. */
                righe.push('                    [' + anello.map(p => `${p[0]},${p[1]}`).join(',') + '],');
            }
            righe.push('                ],');
        }
        righe.push('            ],');
        righe.push('        },');
    }
    righe.push('    },');
    righe.push('};');
    righe.push('');

    const testo = righe.join('\n');
    fs.writeFileSync(USCITA, testo);

    /* ── Il verbale ── */
    const verticiFinali = Object.values(regioni).reduce((t, r) => t + contaVertici(r.coordinates), 0);
    const verticiPrima  = Object.values(verticiOriginali).reduce((a, b) => a + b, 0);
    console.log('');
    console.log(`  scritto  ${path.relative(ROOT, USCITA)}`);
    console.log(`  peso     ${testo.length.toLocaleString('it-IT')} byte  (tetto ${TETTO_BYTE.toLocaleString('it-IT')})`);
    console.log(`  vertici  ${verticiFinali.toLocaleString('it-IT')}  (erano ${verticiPrima.toLocaleString('it-IT')}, tetto ${TETTO_VERTICI.toLocaleString('it-IT')})`);
    console.log(`  bbox     [${bbox.join(', ')}]`);
    console.log('');
    console.log('  Aree originali — da incollare in test/mappa/geo-italia.test.js:');
    console.log('    const AREE_ORIGINALI = {');
    for (const id of Object.keys(NOMI)) {
        const dopo = areaGeometria(regioni[id].coordinates);
        const prima = areeOriginali[id];
        const deriva = ((dopo - prima) / prima * 100);
        console.log(`        ${id}: ${prima.toFixed(6)},`.padEnd(44) + `// deriva ${deriva >= 0 ? '+' : ''}${deriva.toFixed(2)}%`);
    }
    console.log('    };');
    console.log('');

    const problemi = [];
    if (testo.length > TETTO_BYTE) problemi.push(`peso ${testo.length} > ${TETTO_BYTE} byte`);
    if (verticiFinali > TETTO_VERTICI) problemi.push(`vertici ${verticiFinali} > ${TETTO_VERTICI}`);
    for (const id of Object.keys(NOMI)) {
        const v = contaVertici(regioni[id].coordinates);
        if (v < 20) problemi.push(`${id}: solo ${v} vertici, e' collassata`);
        const deriva = Math.abs(areaGeometria(regioni[id].coordinates) - areeOriginali[id]) / areeOriginali[id];
        if (deriva > 0.03) problemi.push(`${id}: l'area e' derivata del ${(deriva * 100).toFixed(1)}%`);
        if (!dentroGeometria(regioni[id].label, regioni[id].coordinates)) problemi.push(`${id}: il punto etichetta cade fuori dalla regione`);
    }
    if (problemi.length) {
        console.error('✖ fuori budget:\n  - ' + problemi.join('\n  - '));
        process.exitCode = 1;
    } else {
        console.log('✔ dentro il budget su tutti i controlli.');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
