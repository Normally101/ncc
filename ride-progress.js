'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   ride-progress.js — a che punto e' ogni corsa, e dove sta l'auto
   ═══════════════════════════════════════════════════════════════════════════

   Questo NON e' codice di mappa: e' l'orologio delle corse. Stava dentro
   map-visual.js, mescolato al disegno dei marcatori di Mapbox, e per questo
   non era collaudabile — il banco di prova non caricava quel file perche'
   pretendeva la mappa vera.

   Separato, serve a entrambe le mappe (Mapbox e SVG) e sta finalmente dentro
   il banco: e' il pezzo che i test vogliono davvero, perche' e' quello che
   decide quando una corsa e' "a meta'" e dove sta l'auto.

   ATTENZIONE, e va detto chiaro: questa funzione SCRIVE dentro gameState —
   `visualElapsed`, `lastVisualUpdate`, `_lastPos`, `_lastAngle`. E' l'unico
   orologio della corsa quando il server non manda i tempi, quindi deve
   ricordarsi dov'era. E' il motivo per cui vive qui e non dentro
   map-dati.js, che invece non scrive mai niente: la vista e l'orologio sono
   due cose diverse, e tenerle nello stesso file e' come sono nati i guai.

   Coordinate in uscita: **[lon, lat]**, come tutto il resto dello strato
   mappa. calculateInterpolatedPosition risponde in [lat, lon], e la
   conversione avviene qui, una volta.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

    function stato() {
        return (typeof gameState !== 'undefined' && gameState) || null;
    }

    /** Progresso 0..1 di una corsa. Il server, se parla, ha ragione lui. */
    function progressoDi(ride, now) {
        const gs = stato();
        const serverTrip = (gs.activeTrips || []).find(t => t.id === ride.id);
        if (serverTrip && serverTrip.start_time && serverTrip.end_time) {
            const inizio = new Date(serverTrip.start_time).getTime();
            const fine   = new Date(serverTrip.end_time).getTime();
            const durata = fine - inizio;
            return durata > 0 ? Math.min(1, Math.max(0, (now - inizio) / durata)) : 1;
        }
        /* Nessun tempo dal server: si tiene l'orologio in casa. Non si usa
           `elapsed` del motore di gioco perche' avanza a scatti di un tick,
           e a schermo si vedrebbero le auto saltare. */
        if (!ride.lastVisualUpdate) ride.lastVisualUpdate = now;
        const delta = now - ride.lastVisualUpdate;
        ride.lastVisualUpdate = now;
        if (ride.visualElapsed == null) ride.visualElapsed = ride.elapsed || 0;
        ride.visualElapsed = Math.min(ride.duration, ride.visualElapsed + delta);
        return ride.duration > 0 ? ride.visualElapsed / ride.duration : 1;
    }

    /** Direzione di marcia in gradi bussola, memorizzata fra un giro e l'altro. */
    function angoloDi(ride, posLatLon) {
        let angolo = ride._lastAngle || 0;
        if (ride._lastPos) {
            const dLat = posLatLon[0] - ride._lastPos[0];
            const dLon = posLatLon[1] - ride._lastPos[1];
            if (Math.abs(dLon) + Math.abs(dLat) > 1e-6) {
                angolo = Math.atan2(dLon, dLat) * (180 / Math.PI);
                ride._lastAngle = angolo;
            }
        }
        ride._lastPos = posLatLon;
        return angolo;
    }

    /**
     * Un giro d'orologio. Restituisce l'elenco di cosa c'e' da disegnare —
     * chi disegna decide come.
     *
     * Le auto ferme a destinazione (corse chiuse in locale ma ancora aperte
     * sul server) escono con `inAttesa: true`: sono ancora a schermo, ma non
     * si muovono piu'.
     */
    function tickRideProgress(now) {
        const gs = stato();
        if (!gs || gs.paused) return [];
        now = now || Date.now();

        const fuori = [];
        const idAttivi = new Set();

        (gs.activeRides || []).forEach(ride => {
            idAttivi.add(ride.id);
            const progresso = progressoDi(ride, now);

            const barra = typeof document !== 'undefined' && document.getElementById
                ? document.getElementById('prog-' + ride.driverId) : null;
            if (barra) barra.style.width = Math.min(100, progresso * 100) + '%';

            if (typeof calculateInterpolatedPosition !== 'function') return;
            const pos = calculateInterpolatedPosition(ride, progresso * ride.duration);
            if (!pos) return;

            fuori.push({
                id: ride.id,
                driverId: ride.driverId,
                tier: ride.tier || 'standard',
                progresso: progresso,
                lon: pos[1],
                lat: pos[0],
                angolo: angoloDi(ride, pos),
                inAttesa: false,
                traffico: !!ride.inTraffic,
                percorso: percorsoDi(ride),
            });
        });

        /* Corse che il server considera ancora in viaggio ma che in locale
           sono finite: l'auto resta a destinazione finche' il server non
           chiude, altrimenti sparirebbe e riapparirebbe. */
        (gs.activeTrips || []).forEach(trip => {
            if (idAttivi.has(trip.id)) return;
            const ultimo = fuori.find(f => f.id === trip.id);
            if (ultimo) return;
            const dest = trip.toPoi || (trip.destCoords ? { lat: trip.destCoords[0], lng: trip.destCoords[1] } : null);
            if (!dest || dest.lng == null) return;
            fuori.push({
                id: trip.id,
                driverId: trip.driverId,
                tier: trip.tier || 'standard',
                progresso: 1,
                lon: dest.lng,
                lat: dest.lat,
                angolo: 0,
                inAttesa: true,
                traffico: false,
                percorso: null,
            });
        });

        return fuori;
    }

    /**
     * Il percorso da disegnare come scia, in [lon, lat].
     *
     * Se c'e' la geometria stradale vera (Mapbox Directions) e' gia' in
     * [lon, lat]. Altrimenti si prendono i punti dell'instradamento sulle
     * autostrade, che sono in [lat, lon]: e' la trappola d'assi di questo
     * lavoro, e si disinnesca qui.
     */
    function percorsoDi(ride) {
        if (ride.roadGeom && ride.roadGeom.length >= 2) {
            return ride.roadGeom.map(p => [p[0], p[1]]);
        }
        if (typeof _buildRideWaypoints !== 'function') return null;
        if (!ride._waypoints) ride._waypoints = _buildRideWaypoints(ride.fromPoi, ride.toPoi);
        const w = ride._waypoints;
        if (!w || w.length < 2) {
            if (!ride.fromPoi || !ride.toPoi) return null;
            return [[ride.fromPoi.lng, ride.fromPoi.lat], [ride.toPoi.lng, ride.toPoi.lat]];
        }
        return w.map(([lat, lon]) => [lon, lat]);
    }

    window.tickRideProgress = tickRideProgress;
    window._percorsoCorsa = percorsoDi;
})();
