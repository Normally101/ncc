'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   map-api.js — Chauffeur Empire · la giuntura fra il gioco e la mappa
   ═══════════════════════════════════════════════════════════════════════════

   Prima di questo file, cinque file di logica (engine.js, engine-daily.js,
   engine-finance.js, engine-rides.js, dispatcher.js) chiamavano direttamente
   le funzioni di map.js, ognuna protetta dalla sua guardia
   `typeof drawPOIs === 'function'`. Funzionava, ma legava la logica di gioco a
   UNA implementazione di mappa: cambiarla voleva dire toccare cinque file.

   Qui la mappa diventa un servizio con un nome. Il gioco chiede
   `MapBackend.drawPOIs()` e non sa chi risponde. Senza nessun backend
   registrato ogni metodo e' un no-op silenzioso — esattamente il
   comportamento che le guardie davano prima, ma in un punto solo.

   REGOLE, in ordine di importanza:
   1. La mappa non puo' rompere il gioco. Ogni chiamata al backend e' avvolta
      in un try/catch: un backend guasto perde il disegno, non la partita.
   2. `use()` e' DISTRUTTIVA e IDEMPOTENTE. Due backend montati insieme
      vorrebbero dire due mappe impilate e un ciclo di animazione orfano.
   3. Questo file non tocca il DOM e non ha effetti al caricamento: deve
      poter girare in una VM nuda, senza jsdom e senza browser.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

    /* I metodi che una mappa puo' offrire. Un backend ne implementa quanti ne
       vuole: quelli che mancano restano no-op. */
    var DISEGNO = [
        'ensure',           // crea/monta la mappa se serve
        'drawHighways',     // rete autostradale
        'drawPOIs',         // citta' e punti di interesse
        'updateHQMarker',   // il marcatore della sede
        'flyToHQ',          // inquadra la sede
        'updateVehicles',   // posizione dei veicoli in corsa
        'updateRouteLines', // le linee delle corse attive
        'dayNight'          // atmosfera giorno/notte
    ];

    var backends = Object.create(null);
    var attivo = null;

    function impl() {
        return attivo ? backends[attivo] : null;
    }

    /* Un backend guasto non deve mai arrivare al chiamante: prima di questo
       file un metodo mancante veniva semplicemente saltato dalla guardia
       `typeof`, e il gioco proseguiva. Si conserva quella proprieta'. */
    function invoca(nome, args) {
        var b = impl();
        if (!b || typeof b[nome] !== 'function') return undefined;
        try {
            return b[nome].apply(b, args || []);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('[MapBackend] ' + attivo + '.' + nome + ' e\' fallito:', e);
            }
            return undefined;
        }
    }

    var API = {

        /* ── Registro ──────────────────────────────────────────────────── */

        /** Registra un'implementazione. Non la monta: serve `use(nome)`. */
        register: function (nome, implementazione) {
            if (!nome || !implementazione || typeof implementazione !== 'object') return false;
            backends[nome] = implementazione;
            return true;
        },

        /** I nomi registrati, in ordine di registrazione. */
        disponibili: function () {
            return Object.keys(backends);
        },

        /** Il nome del backend montato, o null. */
        attuale: function () {
            return attivo;
        },

        /**
         * Monta un backend. Smonta prima quello attuale — sempre, senza
         * eccezioni: due mappe vive insieme sono il guasto che questo strato
         * esiste per impedire. Rimontare lo stesso backend non fa niente.
         */
        use: function (nome) {
            if (nome === attivo) return true;
            if (nome !== null && !backends[nome]) return false;
            if (attivo) { invoca('destroy'); attivo = null; }
            attivo = nome;
            return true;
        },

        /** Smonta tutto. Dopo, ogni metodo di disegno e' un no-op. */
        destroy: function () {
            if (!attivo) return;
            invoca('destroy');
            attivo = null;
        },

        /** La mappa e' montata e pronta a ricevere disegno? */
        isReady: function () {
            var b = impl();
            if (!b) return false;
            if (typeof b.isReady !== 'function') return true;
            return !!invoca('isReady');
        },

        /**
         * Chiede alla mappa UN click, e restituisce le coordinate a `cb(lng, lat)`.
         * Torna `false` se nessuna mappa puo' prendersi in carico il click: il
         * chiamante deve avere una strada alternativa (l'elenco delle regioni).
         */
        onceMapClick: function (cb) {
            var b = impl();
            if (!b || typeof b.onceMapClick !== 'function') return false;
            return invoca('onceMapClick', [cb]) !== false;
        },

        /** Annulla un `onceMapClick` in attesa. */
        cancelMapClick: function () {
            invoca('cancelMapClick');
        }
    };

    /* I metodi di disegno sono tutti uguali: inoltra o taci. */
    DISEGNO.forEach(function (nome) {
        API[nome] = function () {
            return invoca(nome, Array.prototype.slice.call(arguments));
        };
    });

    /* Solo per i test: azzera il registro. Il gioco non lo chiama mai. */
    API._reset = function () {
        attivo = null;
        Object.keys(backends).forEach(function (k) { delete backends[k]; });
    };

    window.MapBackend = API;
})();
