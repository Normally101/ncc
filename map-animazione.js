'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   map-animazione.js — le auto che si muovono sulla mappa 2D
   ═══════════════════════════════════════════════════════════════════════════

   Scrive SOLO attributi su nodi che esistono gia'. Non serializza mai
   `innerHTML` dentro il ciclo: farlo costringerebbe il browser a rifare il
   layout di sessanta etichette di testo a ogni fotogramma.

   Parte in `avvia()`, si ferma in `ferma()`, e non fa NIENTE al caricamento
   del file. Si sospende anche quando la scheda del browser e' nascosta:
   disegnare per nessuno e' lavoro sprecato, e prima lo si faceva per ore.

   LE SCIE. Prima venivano ricostruite sessanta volte al secondo tagliando la
   polilinea al punto giusto. Qui il percorso si proietta UNA VOLTA quando la
   corsa compare, e l'avanzamento diventa un `stroke-dashoffset`: il costo per
   fotogramma e' scrivere un numero.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

    const COLORE_SCIA = {
        ultra: '#d4af37', vip: '#a78bfa', business: '#00f2ff',
        group: '#34d399', standard: '#9ca3af', economy: '#9ca3af',
    };

    /* La rotta intera della corsa, disegnata sotto la scia. Ambra normale,
       rossa quando la corsa e' incolonnata: e' l'unica informazione che la
       vecchia mappa satellitare dava e che qui non si puo' perdere. */
    const ROTTA        = '#f59e0b';
    const ROTTA_TRAFFICO = '#ff4060';

    let _rafId = null;
    let _gVeicoli = null;
    let _gScie = null;
    let _gRotte = null;
    const _nodi = {};      // id corsa → { auto, scia }
    const _percorsi = {};  // id corsa → { d, lunghezza }

    function proj() { return window.CE_proj; }

    /** Proietta un percorso [lon,lat][] e ne misura la lunghezza in unita' SVG. */
    function preparaPercorso(punti) {
        const P = proj();
        let d = '', lunghezza = 0, ux = null, uy = null;
        for (let i = 0; i < punti.length; i++) {
            const [x, y] = P.proietta(punti[i][0], punti[i][1]);
            if (!isFinite(x) || !isFinite(y)) continue;
            if (ux === null) { d = 'M' + x.toFixed(1) + ',' + y.toFixed(1); }
            else { d += 'L' + x.toFixed(1) + ',' + y.toFixed(1); lunghezza += Math.hypot(x - ux, y - uy); }
            ux = x; uy = y;
        }
        return d && lunghezza > 0 ? { d: d, lunghezza: lunghezza } : null;
    }

    function creaNodi(v) {
        const rotta = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        rotta.setAttribute('class', 'ce-rotta');
        rotta.setAttribute('fill', 'none');
        rotta.setAttribute('stroke', ROTTA);
        rotta.setAttribute('stroke-width', '0.8');
        rotta.setAttribute('stroke-dasharray', '3 4');
        rotta.setAttribute('opacity', '0.7');
        _gRotte.appendChild(rotta);

        const auto = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        auto.setAttribute('class', 'ce-auto');
        // Triangolo che punta a nord: la rotazione lo orienta.
        auto.setAttribute('d', 'M0,-3.4 L2.2,2.6 L0,1.3 L-2.2,2.6 Z');
        auto.setAttribute('fill', COLORE_SCIA[v.tier] || '#e5e7eb');
        auto.setAttribute('stroke', 'rgba(0,0,0,0.7)');
        auto.setAttribute('stroke-width', '0.5');
        _gVeicoli.appendChild(auto);

        const scia = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        scia.setAttribute('class', 'ce-scia');
        scia.setAttribute('fill', 'none');
        scia.setAttribute('stroke', COLORE_SCIA[v.tier] || '#9ca3af');
        scia.setAttribute('stroke-width', '1.4');
        scia.setAttribute('stroke-linecap', 'round');
        scia.setAttribute('opacity', '0.75');
        _gScie.appendChild(scia);

        return { auto: auto, scia: scia, rotta: rotta };
    }

    /* Le auto restano della stessa dimensione a schermo mentre si ingrandisce:
       una macchina larga mezza regione non aiuta nessuno. */
    function scalaCorrente() {
        const v = window.CE_map && window.CE_map._vista && window.CE_map._vista();
        if (!v || !v.w) return 1;
        return v.w / proj().W;
    }

    /* Solo 'hidden' ferma il disegno. Non si usa `document.hidden` perche'
       vale true anche per 'prerender', e in jsdom TUTTI i documenti nascono
       'prerender': la guardia avrebbe spento l'animazione in ogni test,
       verde e silenziosa, senza disegnare mai niente. */
    function schedaNascosta() {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    }

    function giro() {
        _rafId = requestAnimationFrame(giro);
        if (!_gVeicoli || !_gScie || !_gRotte) return;
        if (schedaNascosta()) return;
        if (typeof window.tickRideProgress !== 'function') return;

        const veicoli = window.tickRideProgress(Date.now());
        const scala = scalaCorrente();
        const visti = new Set();

        veicoli.forEach(v => {
            visti.add(v.id);
            if (!_nodi[v.id]) _nodi[v.id] = creaNodi(v);
            const n = _nodi[v.id];

            const [x, y] = proj().proietta(v.lon, v.lat);
            if (!isFinite(x) || !isFinite(y)) return;
            n.auto.setAttribute('transform',
                `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${v.angolo.toFixed(0)}) scale(${scala.toFixed(3)})`);
            n.auto.setAttribute('opacity', v.inAttesa ? '0.45' : '1');

            if (!_percorsi[v.id] && v.percorso && v.percorso.length >= 2) {
                _percorsi[v.id] = preparaPercorso(v.percorso);
                if (_percorsi[v.id]) {
                    n.scia.setAttribute('d', _percorsi[v.id].d);
                    n.scia.setAttribute('stroke-dasharray', _percorsi[v.id].lunghezza.toFixed(1));
                    n.rotta.setAttribute('d', _percorsi[v.id].d);
                }
            }
            n.rotta.setAttribute('stroke', v.traffico ? ROTTA_TRAFFICO : ROTTA);
            n.rotta.setAttribute('stroke-width', v.traffico ? '1.2' : '0.8');
            const p = _percorsi[v.id];
            if (p) {
                n.scia.setAttribute('stroke-dashoffset',
                    (p.lunghezza * (1 - Math.min(1, Math.max(0, v.progresso)))).toFixed(1));
            }
        });

        for (const id in _nodi) {
            if (visti.has(Number(id)) || visti.has(id)) continue;
            _nodi[id].auto.remove();
            _nodi[id].scia.remove();
            _nodi[id].rotta.remove();
            delete _nodi[id];
            delete _percorsi[id];
        }
    }

    function avvia(svg) {
        const radice = svg || (window.CE_map && window.CE_map._svg && window.CE_map._svg());
        if (!radice) return false;
        _gVeicoli = radice.querySelector('#ce-g-veicoli');
        _gScie    = radice.querySelector('#ce-g-scie');
        _gRotte   = radice.querySelector('#ce-g-rotte');
        if (!_gVeicoli || !_gScie || !_gRotte) return false;
        if (_rafId !== null) return true;
        giro();
        return true;
    }

    function ferma() {
        if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
        for (const id in _nodi) { delete _nodi[id]; delete _percorsi[id]; }
        _gVeicoli = null;
        _gScie = null;
        _gRotte = null;
    }

    window.CE_mapAnim = {
        avvia: avvia,
        ferma: ferma,
        inCorso: () => _rafId !== null,
        _preparaPercorso: preparaPercorso,
        _giro: giro,
    };
})();
