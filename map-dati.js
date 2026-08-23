'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   map-dati.js — da gameState alla fotografia che la mappa disegna
   ═══════════════════════════════════════════════════════════════════════════

   LA REGOLA, e non e' una raccomandazione: **la mappa e' una vista, non un
   database**. Questo file legge il gioco e non lo scrive mai. Nessun campo
   di gameState viene toccato, nemmeno una cache, nemmeno un contatore.

   Il test `mappa-e-una-vista` congela gameState e costruisce l'istantanea:
   se qualcuno un giorno aggiunge qui una scrittura "tanto e' solo una
   cache", quel test diventa rosso. E' l'unico modo per far rispettare la
   regola nel tempo, quando questo commento sara' vecchio di due anni.

   Seconda regola: qui dentro le coordinate sono **[lon, lat]**, come
   GeoJSON. Il gioco ha due convenzioni — POIS usa campi separati lat/lng,
   HIGHWAYS usa coppie [lat, lon] — e la conversione avviene UNA VOLTA, qui.
   Piu' in la' nessuno deve piu' chiederselo.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

    function leggiGeo() {
        return (window.GEO_ITALIA && window.GEO_ITALIA.regions) || {};
    }
    function leggiRegioni() {
        return typeof REGIONS !== 'undefined' ? REGIONS : {};
    }
    function leggiPoi() {
        return typeof POIS !== 'undefined' ? POIS : {};
    }
    function leggiAutostrade() {
        return typeof HIGHWAYS !== 'undefined' ? HIGHWAYS : {};
    }
    function stato() {
        return (typeof gameState !== 'undefined' && gameState) || {};
    }

    /**
     * La fotografia. Ogni chiamata costruisce oggetti nuovi: chi la riceve
     * puo' farci quello che vuole senza rischiare di toccare la partita.
     */
    function istantanea(selezione) {
        const gs      = stato();
        const geo     = leggiGeo();
        const regioni = leggiRegioni();
        const pois    = leggiPoi();
        const strade  = leggiAutostrade();

        const sbloccate = new Set(gs.unlockedRegions || []);
        const mieiHub   = new Set(gs.ownedHubs || []);

        /* Quali regioni ospitano un hub del giocatore: si ricava dai POI
           posseduti, non da un campo a parte che potrebbe disallinearsi. */
        const conHub = new Set();
        mieiHub.forEach(idPoi => {
            const p = pois[idPoi];
            if (p && p.region) conHub.add(p.region);
        });
        if (gs.hq && gs.hq.region) conHub.add(gs.hq.region);

        const listaRegioni = Object.keys(geo).map(id => {
            const r = geo[id];
            const meta = regioni[id] || {};
            return {
                id: id,
                name: meta.name || r.name || id,
                label: r.label ? [r.label[0], r.label[1]] : null,
                coordinates: r.coordinates,          // sola lettura: non si copia un dato immutabile da 8.500 vertici
                stato: conHub.has(id) ? 'hub' : (sbloccate.has(id) ? 'sbloccata' : 'bloccata'),
                prezzo: meta.price || 0,
                repRichiesta: meta.repReq || 0,
            };
        }).sort((a, b) => a.id.localeCompare(b.id));

        const listaCitta = Object.keys(pois).map(id => {
            const p = pois[id];
            return {
                id: id,
                name: p.name || id,
                lon: p.lng,
                lat: p.lat,
                tipo: p.type || 'city',
                regione: p.region || null,
                sbloccata: sbloccate.has(p.region),
                mio: mieiHub.has(id),
            };
        }).sort((a, b) => a.id.localeCompare(b.id));

        /* HIGHWAYS e' in [lat, lon]. Qui e in nessun altro posto si gira. */
        const listaStrade = Object.keys(strade).map(id => {
            const h = strade[id];
            const punti = (h.path || []).map(([lat, lon]) => [lon, lat]);
            const richieste = h.req || [];
            return {
                id: id,
                punti: punti,
                attiva: richieste.length === 0 || richieste.every(r => sbloccate.has(r)),
            };
        }).filter(s => s.punti.length >= 2)
          .sort((a, b) => a.id.localeCompare(b.id));

        const hq = (gs.hq && gs.hq.lng !== null && gs.hq.lng !== undefined)
            ? { lon: gs.hq.lng, lat: gs.hq.lat, name: gs.hq.name || 'Sede', livello: gs.hq.level || 0, regione: gs.hq.region || null }
            : null;

        /* Le corse: identita' ed estremi. La POSIZIONE non sta qui — la
           calcola il ciclo di animazione, sessanta volte al secondo, e
           un'istantanea non ha senso che la porti. */
        const corse = (gs.activeRides || []).map(r => ({
            id: r.id,
            tier: r.tier || 'economy',
            da: r.fromPoi ? [r.fromPoi.lng, r.fromPoi.lat] : null,
            a:  r.toPoi   ? [r.toPoi.lng,   r.toPoi.lat]   : null,
        })).filter(c => c.da && c.a);

        return {
            regioni: listaRegioni,
            citta: listaCitta,
            autostrade: listaStrade,
            hq: hq,
            corse: corse,
            selezione: selezione || null,
        };
    }

    window.CE_mapData = { istantanea: istantanea };
})();
