'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   map-proiezione.js — da gradi a unita' SVG, e ritorno
   ═══════════════════════════════════════════════════════════════════════════

   Queste funzioni non sono nuove: vivevano dentro war_room.js (righe 63-101)
   e servivano solo a quel pannello. Qui diventano condivise, cosi' la mappa
   principale e la War Room disegnano l'Italia con la STESSA proiezione — se
   ne esistessero due, un giorno divergerebbero e nessuno saprebbe quale sia
   quella giusta.

   Il riquadro e' quello che la War Room usa da sempre (6,4-18,8 gradi di
   longitudine, 35,1-47,3 di latitudine su 500x660 unita'). E' piu' largo dei
   confini reali dell'Italia: quel margine e' voluto, tiene le coste staccate
   dal bordo.

   CONVENZIONE DELLE COORDINATE, unica e non negoziabile: **[lon, lat]**, come
   GeoJSON. Le autostrade del gioco (routesDB.js) sono in [lat, lon]: la
   conversione si fa una volta sola, al confine, mai qui dentro.

   Il file non tocca il DOM e non ha effetti al caricamento: gira in una VM
   nuda, senza jsdom.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

    var W = 500, H = 660;
    var minLon = 6.4, maxLon = 18.8, minLat = 35.1, maxLat = 47.3;

    // Mercatore: la latitudine non e' lineare, la longitudine si'.
    function mercatore(lat) {
        return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    }
    var mMin = mercatore(minLat);
    var mMax = mercatore(maxLat);

    /** [lon, lat] → [x, y] in unita' del viewBox. */
    function proietta(lon, lat) {
        return [
            (lon - minLon) / (maxLon - minLon) * W,
            (1 - (mercatore(lat) - mMin) / (mMax - mMin)) * H
        ];
    }

    /** [x, y] in unita' del viewBox → [lon, lat]. Serve al click sulla mappa. */
    function inverti(x, y) {
        var lon = minLon + (x / W) * (maxLon - minLon);
        var m = mMin + (1 - y / H) * (mMax - mMin);
        var lat = (Math.atan(Math.exp(m)) - Math.PI / 4) * 360 / Math.PI;
        return [lon, lat];
    }

    /**
     * Un anello PIATTO ([lon,lat,lon,lat,…], la forma di geo-italia.js)
     * diventa un pezzo di attributo `d`.
     *
     * Un `NaN` qui dentro non lancia niente: uccide in silenzio l'intero
     * contorno, perche' il browser scarta tutto il path. Per questo la
     * coordinata guasta viene saltata invece che scritta.
     */
    function anelloAPath(piatto) {
        var d = '', primo = true;
        for (var i = 0; i < piatto.length; i += 2) {
            var p = proietta(piatto[i], piatto[i + 1]);
            if (!isFinite(p[0]) || !isFinite(p[1])) continue;
            d += (primo ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
            primo = false;
        }
        return d ? d + 'Z' : '';
    }

    /** Tutti gli anelli di una regione ([[esterno, buchi…], …]) in un `d` solo. */
    function coordsAPath(coordinates) {
        var d = '';
        for (var i = 0; i < coordinates.length; i++) {
            for (var j = 0; j < coordinates[i].length; j++) {
                d += anelloAPath(coordinates[i][j]);
            }
        }
        return d;
    }

    /* ── Punto in poligono ───────────────────────────────────────────────
       Ray casting. Serve per la fondazione e per i test: MAI sul movimento
       del mouse, dove il riconoscimento lo fa gratis l'SVG con
       `pointer-events` sui path. */

    function dentroAnello(lon, lat, piatto) {
        var dentro = false;
        for (var i = 0, j = piatto.length - 2; i < piatto.length; j = i, i += 2) {
            var xi = piatto[i], yi = piatto[i + 1], xj = piatto[j], yj = piatto[j + 1];
            if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
                dentro = !dentro;
            }
        }
        return dentro;
    }

    /** Il punto [lon, lat] cade dentro la regione? I buchi contano come fuori. */
    function dentroRegione(lon, lat, coordinates) {
        for (var i = 0; i < coordinates.length; i++) {
            var poly = coordinates[i];
            if (!dentroAnello(lon, lat, poly[0])) continue;
            var inBuco = false;
            for (var k = 1; k < poly.length; k++) {
                if (dentroAnello(lon, lat, poly[k])) { inBuco = true; break; }
            }
            if (!inBuco) return true;
        }
        return false;
    }

    /**
     * Quale regione contiene [lon, lat], o null se nessuna (mare, estero).
     * `regioni` e' la mappa id → { coordinates }, cioe' GEO_ITALIA.regions.
     */
    function regioneAlPunto(lon, lat, regioni) {
        for (var id in regioni) {
            if (dentroRegione(lon, lat, regioni[id].coordinates)) return id;
        }
        return null;
    }

    /**
     * La regione la cui COSTA e' piu' vicina al punto. Serve quando il click
     * cade in mare: invece di lasciarlo cadere nel vuoto lo si aggancia alla
     * terraferma piu' vicina.
     *
     * Si misura sui vertici del confine, non sul punto-etichetta: a ovest di
     * Civitavecchia l'etichetta piu' vicina e' quella della Toscana, ma la
     * costa piu' vicina e' il Lazio, e la risposta giusta e' il Lazio.
     * Costa 8.500 confronti — irrilevante per un click, inaccettabile per il
     * movimento del mouse. Non chiamarla a ogni fotogramma.
     */
    function regionePiuVicina(lon, lat, regioni) {
        var migliore = null, minima = Infinity;
        for (var id in regioni) {
            var coords = regioni[id].coordinates || [];
            for (var i = 0; i < coords.length; i++) {
                for (var j = 0; j < coords[i].length; j++) {
                    var a = coords[i][j];
                    for (var k = 0; k < a.length; k += 2) {
                        var dx = a[k] - lon, dy = a[k + 1] - lat;
                        var d = dx * dx + dy * dy;
                        if (d < minima) { minima = d; migliore = id; }
                    }
                }
            }
        }
        return migliore;
    }

    window.CE_proj = {
        W: W, H: H,
        minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat,
        proietta: proietta,
        inverti: inverti,
        anelloAPath: anelloAPath,
        coordsAPath: coordsAPath,
        dentroRegione: dentroRegione,
        regioneAlPunto: regioneAlPunto,
        regionePiuVicina: regionePiuVicina
    };
})();
