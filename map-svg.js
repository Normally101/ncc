'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   map-svg.js — la mappa da gioco: 2D, stilizzata, tutta locale
   ═══════════════════════════════════════════════════════════════════════════

   Venti regioni cliccabili, le citta' del gioco, zoom e pan contenuti.
   Nessuna piastrella, nessun satellite, nessuna rete: si disegna anche
   offline, dai confini di geo-italia.js.

   TRE VINCOLI, e sono quelli che tengono in piedi il file:

   1. **Nessun effetto al caricamento.** Non parte niente finche' qualcuno non
      chiama `monta()`. Il vecchio map-visual.js avviava il suo ciclo di
      animazione alla riga finale del file e lo teneva vivo per sempre, anche
      a mappa chiusa e a scheda del browser nascosta.

   2. **La stringa SVG si costruisce UNA VOLTA.** Poi si mutano solo
      attributi. Riserializzare `innerHTML` a ogni cambio di stato costringe
      il browser a rifare il layout di sessanta etichette di testo.

   3. **Niente misure dal browser** per la geometria: `getBBox` e
      `getScreenCTM` non esistono in jsdom, quindi zoom e pan si calcolano
      con aritmetica sul `viewBox`. L'unica misura letta e' la dimensione del
      contenitore, e solo dentro i gestori di evento.

   Verso l'esterno emette **id di gioco**, mai pixel e mai nodi del DOM: chi
   ascolta non sa che sotto c'e' un SVG.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

    const NS = 'http://www.w3.org/2000/svg';

    /* ── Palette ─────────────────────────────────────────────────────────
       Coerente con la War Room, che usa gia' questa carta politica: mare
       chiaro, regioni piene, oro per cio' che e' tuo. */
    const COLORI = {
        mare:        '#a9c6de',
        bloccata:    '#93a3b2',
        sbloccata:   '#7d9e6b',
        hub:         '#c79a2a',
        bordo:       'rgba(0,0,0,0.28)',
        bordoTuo:    '#f0c860',
        selezione:   '#ffffff',
        strada:      'rgba(255,255,255,0.55)',
        stradaSpenta:'rgba(0,0,0,0.10)',
        citta:       'rgba(255,255,255,0.92)',
        cittaHub:    '#2d6fd0',
        cittaLusso:  '#d4af37',
    };

    const ZOOM_MIN = 1, ZOOM_MAX = 4;

    /* ── Stato del modulo ─────────────────────────────────────────────── */
    let _contenitore = null;
    let _svg      = null;
    let _tooltip  = null;
    let _vista    = null;      // { x, y, w, h } in unita' del viewBox
    let _selezione = null;
    let _costruita = false;
    let _clickUnaVolta = null; // callback in attesa di un click sulla mappa
    let _trascina = null;
    const _staccaAscoltatori = [];

    function proj() { return window.CE_proj; }
    function baseW() { return proj() ? proj().W : 500; }
    function baseH() { return proj() ? proj().H : 660; }

    /* ═══ Zoom e pan: aritmetica pura, collaudabile senza browser ═══════ */

    function limitaVista(v) {
        const W = baseW(), H = baseH();
        let w = Math.min(W, Math.max(W / ZOOM_MAX, v.w));
        let h = w * (H / W);
        let x = Math.min(W - w, Math.max(0, v.x));
        let y = Math.min(H - h, Math.max(0, v.y));
        return { x: x, y: y, w: w, h: h };
    }

    /**
     * Zoom attorno a un punto espresso in frazione della vista (0..1):
     * quel punto resta fermo sotto il cursore, che e' l'unico zoom che non
     * fa perdere l'orientamento.
     */
    function zoomVerso(v, fx, fy, fattore) {
        const W = baseW();
        const puntoX = v.x + fx * v.w;
        const puntoY = v.y + fy * v.h;
        const nuovaW = Math.min(W, Math.max(W / ZOOM_MAX, v.w / fattore));
        const nuovaH = nuovaW * (baseH() / W);
        return limitaVista({ x: puntoX - fx * nuovaW, y: puntoY - fy * nuovaH, w: nuovaW, h: nuovaH });
    }

    /** Sposta la vista di una frazione della sua larghezza/altezza. */
    function spostaDi(v, fx, fy) {
        return limitaVista({ x: v.x + fx * v.w, y: v.y + fy * v.h, w: v.w, h: v.h });
    }

    function vistaIntera() {
        return { x: 0, y: 0, w: baseW(), h: baseH() };
    }

    function zoomCorrente(v) {
        return baseW() / v.w;
    }

    /* ═══ Costruzione della stringa SVG — una volta sola ════════════════ */

    function coloreRegione(r) {
        if (r.stato === 'hub') return COLORI.hub;
        if (r.stato === 'sbloccata') return COLORI.sbloccata;
        return COLORI.bloccata;
    }

    function coloreCitta(c) {
        if (c.mio) return COLORI.cittaHub;
        if (c.tipo === 'luxury') return COLORI.cittaLusso;
        if (c.tipo === 'hub') return COLORI.cittaHub;
        return COLORI.citta;
    }

    function esc(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function stradaAPath(punti) {
        const P = proj();
        let d = '';
        for (let i = 0; i < punti.length; i++) {
            const p = P.proietta(punti[i][0], punti[i][1]);
            if (!isFinite(p[0]) || !isFinite(p[1])) continue;
            d += (d ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }
        return d;
    }

    function costruisci(dati) {
        const P = proj();
        const W = baseW(), H = baseH();

        const regioni = dati.regioni.map(r => {
            const d = P.coordsAPath(r.coordinates);
            if (!d) return '';
            return `<path class="ce-regione" data-regione="${esc(r.id)}" d="${d}"
                fill="${coloreRegione(r)}" stroke="${r.stato === 'hub' ? COLORI.bordoTuo : COLORI.bordo}"
                stroke-width="${r.stato === 'hub' ? 1.6 : 0.6}" stroke-linejoin="round"/>`;
        }).join('');

        const strade = dati.autostrade.map(s => {
            const d = stradaAPath(s.punti);
            if (!d) return '';
            return `<path class="ce-strada" data-strada="${esc(s.id)}" d="${d}" fill="none"
                stroke="${s.attiva ? COLORI.strada : COLORI.stradaSpenta}" stroke-width="${s.attiva ? 1 : 0.5}"
                stroke-linecap="round" stroke-linejoin="round"/>`;
        }).join('');

        const etichette = dati.regioni.map(r => {
            if (!r.label) return '';
            const [x, y] = P.proietta(r.label[0], r.label[1]);
            return `<text class="ce-etichetta" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
                data-etichetta="${esc(r.id)}">${esc(r.name)}</text>`;
        }).join('');

        const citta = dati.citta.map(c => {
            const [x, y] = P.proietta(c.lon, c.lat);
            if (!isFinite(x) || !isFinite(y)) return '';
            const raggio = c.tipo === 'hub' ? 3 : 2.2;
            return `<g class="ce-citta" data-citta="${esc(c.id)}" data-nome="${esc(c.name)}"
                opacity="${c.sbloccata ? 1 : 0.38}">
                <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${raggio}" fill="${coloreCitta(c)}"
                    stroke="rgba(0,0,0,0.55)" stroke-width="0.6"/>
                ${c.mio ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${raggio + 2.2}" fill="none"
                    stroke="${COLORI.bordoTuo}" stroke-width="0.8"/>` : ''}
            </g>`;
        }).join('');

        const hq = dati.hq ? (() => {
            const [x, y] = P.proietta(dati.hq.lon, dati.hq.lat);
            return `<g class="ce-hq"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none"
                stroke="${COLORI.bordoTuo}" stroke-width="1.4"/>
                <text class="ce-hq-icona" x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}">★</text></g>`;
        })() : '';

        return `<svg id="ce-map-svg" xmlns="${NS}" viewBox="0 0 ${W} ${H}"
                preserveAspectRatio="xMidYMid meet">
            <rect class="ce-mare" x="0" y="0" width="${W}" height="${H}" fill="${COLORI.mare}"/>
            <g id="ce-g-regioni">${regioni}</g>
            <g id="ce-g-strade" pointer-events="none">${strade}</g>
            <g id="ce-g-etichette" pointer-events="none">${etichette}</g>
            <g id="ce-g-citta">${citta}</g>
            <g id="ce-g-hq" pointer-events="none">${hq}</g>
            <g id="ce-g-scie" pointer-events="none"></g>
            <g id="ce-g-veicoli" pointer-events="none"></g>
        </svg>`;
    }

    /* ═══ Aggiornamento: solo attributi, mai innerHTML ══════════════════ */

    function aggiorna() {
        if (!_svg) return;
        const dati = window.CE_mapData.istantanea(_selezione);

        dati.regioni.forEach(r => {
            const p = _svg.querySelector(`[data-regione="${r.id}"]`);
            if (!p) return;
            p.setAttribute('fill', coloreRegione(r));
            const scelta = r.id === _selezione;
            p.setAttribute('stroke', scelta ? COLORI.selezione : (r.stato === 'hub' ? COLORI.bordoTuo : COLORI.bordo));
            p.setAttribute('stroke-width', scelta ? 2.2 : (r.stato === 'hub' ? 1.6 : 0.6));
            p.classList.toggle('ce-scelta', scelta);
        });

        dati.autostrade.forEach(s => {
            const p = _svg.querySelector(`[data-strada="${CSS_escape(s.id)}"]`);
            if (!p) return;
            p.setAttribute('stroke', s.attiva ? COLORI.strada : COLORI.stradaSpenta);
            p.setAttribute('stroke-width', s.attiva ? 1 : 0.5);
        });

        dati.citta.forEach(c => {
            const g = _svg.querySelector(`[data-citta="${c.id}"]`);
            if (!g) return;
            g.setAttribute('opacity', c.sbloccata ? '1' : '0.38');
            const cerchio = g.querySelector('circle');
            if (cerchio) cerchio.setAttribute('fill', coloreCitta(c));
        });

        aggiornaHQ(dati.hq);
        return dati;
    }

    /* La sede si sposta una volta sola nella vita di una partita, ma quando
       lo fa il nodo potrebbe non esserci ancora (fondazione a mappa aperta). */
    function aggiornaHQ(hq) {
        const g = _svg && _svg.querySelector('#ce-g-hq');
        if (!g) return;
        if (!hq) { g.innerHTML = ''; return; }
        const [x, y] = proj().proietta(hq.lon, hq.lat);
        g.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none"
            stroke="${COLORI.bordoTuo}" stroke-width="1.4"/>
            <text class="ce-hq-icona" x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}">★</text>`;
    }

    /* I nomi delle autostrade contengono trattini e underscore: legali in un
       selettore, ma meglio non fidarsi di cosa arrivera' domani. */
    function CSS_escape(s) {
        return String(s).replace(/["\\]/g, '\\$&');
    }

    /* ═══ Stile ════════════════════════════════════════════════════════ */

    function iniettaStile() {
        if (document.getElementById('ce-map2d-stile')) return;
        const st = document.createElement('style');
        st.id = 'ce-map2d-stile';
        st.textContent = `
#ce-map2d { position:absolute; inset:0; overflow:hidden; background:${COLORI.mare};
            touch-action:none; user-select:none; }
#ce-map-svg { width:100%; height:100%; display:block; cursor:grab; }
#ce-map2d.ce-trascino #ce-map-svg { cursor:grabbing; }
.ce-regione { cursor:pointer; transition:filter .12s ease; }
.ce-regione:hover { filter:brightness(1.14); }
.ce-citta { cursor:pointer; }
.ce-citta:hover circle:first-child { r:4.2; }
.ce-etichetta { font:700 7px system-ui,sans-serif; fill:rgba(255,255,255,0.94);
                text-anchor:middle; paint-order:stroke; stroke:rgba(0,0,0,0.75);
                stroke-width:2px; stroke-linejoin:round; }
.ce-hq-icona { font:700 7px system-ui,sans-serif; fill:${COLORI.bordoTuo}; text-anchor:middle; }
#ce-map2d-tooltip { position:absolute; pointer-events:none; z-index:5; padding:5px 9px;
    border-radius:7px; background:rgba(5,10,20,0.92); border:1px solid rgba(212,175,55,0.45);
    color:#f3f4f6; font:600 11px system-ui,sans-serif; white-space:nowrap;
    transform:translate(-50%,-140%); opacity:0; transition:opacity .1s ease; }
#ce-map2d-tooltip.visibile { opacity:1; }
#ce-map2d-zoom { position:absolute; right:12px; bottom:12px; z-index:5; display:flex;
    flex-direction:column; gap:6px; }
#ce-map2d-zoom button { width:30px; height:30px; border-radius:8px; cursor:pointer;
    background:rgba(5,10,20,0.82); border:1px solid rgba(255,255,255,0.18);
    color:#e5e7eb; font:700 14px system-ui,sans-serif; }
#ce-map2d-zoom button:hover { border-color:rgba(212,175,55,0.6); color:#d4af37; }
@media (prefers-reduced-motion: reduce) { .ce-regione { transition:none; } }
`;
        document.head.appendChild(st);
    }

    /* ═══ Eventi ═══════════════════════════════════════════════════════ */

    function ascolta(elemento, tipo, fn, opzioni) {
        elemento.addEventListener(tipo, fn, opzioni);
        _staccaAscoltatori.push(() => elemento.removeEventListener(tipo, fn, opzioni));
    }

    // Frazione 0..1 della posizione del puntatore dentro il contenitore.
    function frazione(ev) {
        const r = _contenitore.getBoundingClientRect ? _contenitore.getBoundingClientRect() : null;
        if (!r || !r.width || !r.height) return [0.5, 0.5];
        return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height];
    }

    function applicaVista() {
        if (!_svg || !_vista) return;
        _svg.setAttribute('viewBox',
            `${_vista.x.toFixed(2)} ${_vista.y.toFixed(2)} ${_vista.w.toFixed(2)} ${_vista.h.toFixed(2)}`);
    }

    function mostraTooltip(testo, ev) {
        if (!_tooltip) return;
        _tooltip.textContent = testo;
        _tooltip.classList.add('visibile');
        const r = _contenitore.getBoundingClientRect ? _contenitore.getBoundingClientRect() : null;
        if (r) {
            _tooltip.style.left = (ev.clientX - r.left) + 'px';
            _tooltip.style.top  = (ev.clientY - r.top) + 'px';
        }
    }
    function nascondiTooltip() {
        if (_tooltip) _tooltip.classList.remove('visibile');
    }

    /**
     * Il click. Un solo ascoltatore per tutta la mappa: il riconoscimento lo
     * fa l'SVG con `pointer-events` sui path, gratis e corretto. Il ray
     * casting su ottomila vertici serve solo quando il click cade in mare.
     */
    function suClick(ev) {
        const nodoCitta = ev.target.closest && ev.target.closest('[data-citta]');
        const nodoReg   = ev.target.closest && ev.target.closest('[data-regione]');

        if (_clickUnaVolta) {
            const cb = _clickUnaVolta;
            _clickUnaVolta = null;
            const [lon, lat] = puntoGeografico(ev);
            cb(lon, lat);
            return;
        }

        if (nodoCitta) {
            const id = nodoCitta.getAttribute('data-citta');
            emetti('onCittaClick', id);
            return;
        }
        if (nodoReg) {
            const id = nodoReg.getAttribute('data-regione');
            _selezione = (_selezione === id) ? null : id;
            aggiorna();
            emetti('onRegioneClick', _selezione);
        }
    }

    /** Da un evento del puntatore alle coordinate geografiche [lon, lat]. */
    function puntoGeografico(ev) {
        const [fx, fy] = frazione(ev);
        const x = _vista.x + fx * _vista.w;
        const y = _vista.y + fy * _vista.h;
        return proj().inverti(x, y);
    }

    function emetti(nome, valore) {
        const fn = window.CE_map && window.CE_map[nome];
        if (typeof fn === 'function') {
            try { fn(valore); } catch (e) { console.error('[CE_map] ' + nome, e); }
        }
    }

    function suMovimento(ev) {
        if (_trascina) {
            const r = _contenitore.getBoundingClientRect ? _contenitore.getBoundingClientRect() : null;
            if (r && r.width) {
                const dx = (ev.clientX - _trascina.x) / r.width;
                const dy = (ev.clientY - _trascina.y) / r.height;
                _vista = spostaDi(_trascina.vista, -dx, -dy);
                applicaVista();
            }
            return;
        }
        const citta = ev.target.closest && ev.target.closest('[data-citta]');
        if (citta) { mostraTooltip(citta.getAttribute('data-nome') || '', ev); return; }
        const reg = ev.target.closest && ev.target.closest('[data-regione]');
        if (reg) {
            const r = window.CE_mapData.istantanea().regioni.find(x => x.id === reg.getAttribute('data-regione'));
            if (r) {
                mostraTooltip(r.stato === 'bloccata' && r.prezzo
                    ? `${r.name} — €${r.prezzo.toLocaleString('it-IT')}`
                    : r.name, ev);
                return;
            }
        }
        nascondiTooltip();
    }

    function suRotella(ev) {
        if (!_vista) return;
        ev.preventDefault();
        const [fx, fy] = frazione(ev);
        _vista = zoomVerso(_vista, fx, fy, ev.deltaY < 0 ? 1.2 : 1 / 1.2);
        applicaVista();
    }

    function suGiu(ev) {
        if (ev.button !== 0) return;
        _trascina = { x: ev.clientX, y: ev.clientY, vista: _vista };
        _contenitore.classList.add('ce-trascino');
    }
    function suSu() {
        _trascina = null;
        if (_contenitore) _contenitore.classList.remove('ce-trascino');
    }

    /* ═══ Ciclo di vita ════════════════════════════════════════════════ */

    function monta(contenitore) {
        if (_costruita) return true;
        const host = contenitore || document.getElementById('map2d-root');
        if (!host || !window.CE_proj || !window.CE_mapData || !window.GEO_ITALIA) return false;

        iniettaStile();
        _contenitore = document.createElement('div');
        _contenitore.id = 'ce-map2d';
        _contenitore.innerHTML = costruisci(window.CE_mapData.istantanea(_selezione))
            + '<div id="ce-map2d-tooltip"></div>'
            + '<div id="ce-map2d-zoom">'
            + `<button type="button" data-zoom="+" aria-label="Ingrandisci">+</button>`
            + `<button type="button" data-zoom="-" aria-label="Rimpicciolisci">−</button>`
            + '</div>';
        host.innerHTML = '';
        host.appendChild(_contenitore);
        host.classList.remove('hidden');
        // Una mappa alla volta: il contenitore di Mapbox sparisce.
        const vecchio = document.getElementById('leaflet-map');
        if (vecchio) vecchio.classList.add('hidden');

        _svg     = _contenitore.querySelector('#ce-map-svg');
        _tooltip = _contenitore.querySelector('#ce-map2d-tooltip');
        _vista   = vistaIntera();
        applicaVista();

        ascolta(_contenitore, 'click', suClick);
        ascolta(_contenitore, 'mousemove', suMovimento);
        ascolta(_contenitore, 'mouseleave', () => { nascondiTooltip(); suSu(); });
        ascolta(_contenitore, 'wheel', suRotella, { passive: false });
        ascolta(_contenitore, 'mousedown', suGiu);
        ascolta(_contenitore, 'mouseup', suSu);
        ascolta(_contenitore, 'click', (ev) => {
            const b = ev.target.closest && ev.target.closest('[data-zoom]');
            if (!b) return;
            _vista = zoomVerso(_vista, 0.5, 0.5, b.getAttribute('data-zoom') === '+' ? 1.4 : 1 / 1.4);
            applicaVista();
        });

        _costruita = true;
        return true;
    }

    function smonta() {
        while (_staccaAscoltatori.length) {
            try { _staccaAscoltatori.pop()(); } catch (e) { /* nodo gia' sparito */ }
        }
        const host = document.getElementById('map2d-root');
        if (host) { host.innerHTML = ''; host.classList.add('hidden'); }
        _contenitore = null;
        _svg = null;
        _tooltip = null;
        _vista = null;
        _trascina = null;
        _clickUnaVolta = null;
        _costruita = false;
    }

    /** Inquadra un punto geografico allo zoom dato. */
    function inquadra(lon, lat, zoom) {
        if (!_vista) return;
        const [x, y] = proj().proietta(lon, lat);
        const w = baseW() / Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom || 2.5));
        const h = w * (baseH() / baseW());
        _vista = limitaVista({ x: x - w / 2, y: y - h / 2, w: w, h: h });
        applicaVista();
    }

    /* ═══ Interfaccia pubblica ═════════════════════════════════════════ */

    window.CE_map = {
        monta: monta,
        smonta: smonta,
        aggiorna: aggiorna,
        inquadra: inquadra,
        montata: () => _costruita,
        selezione: () => _selezione,
        seleziona: (id) => { _selezione = id || null; aggiorna(); },

        // ganci verso l'esterno: ricevono ID DI GIOCO, mai pixel
        onRegioneClick: null,
        onCittaClick: null,

        // esposti per i test e per il ciclo di animazione
        _vista: () => _vista && { x: _vista.x, y: _vista.y, w: _vista.w, h: _vista.h },
        _impostaVista: (v) => { _vista = limitaVista(v); applicaVista(); },
        _zoomVerso: zoomVerso,
        _spostaDi: spostaDi,
        _limitaVista: limitaVista,
        _vistaIntera: vistaIntera,
        _zoomCorrente: zoomCorrente,
        _svg: () => _svg,
        _costruisci: costruisci,
        ZOOM_MIN: ZOOM_MIN,
        ZOOM_MAX: ZOOM_MAX,
    };

    /* ═══ Registrazione come backend ═══════════════════════════════════ */

    if (window.MapBackend) {
        window.MapBackend.register('svg2d', {
            ensure:  () => { monta(); },
            destroy: smonta,
            isReady: () => _costruita,

            // Un cambio di stato del gioco: si mutano attributi, non si ricostruisce.
            drawHighways:   aggiorna,
            drawPOIs:       aggiorna,
            updateHQMarker: aggiorna,
            flyToHQ: () => {
                const gs = typeof gameState !== 'undefined' ? gameState : null;
                if (gs && gs.hq && gs.hq.lng != null) inquadra(gs.hq.lng, gs.hq.lat, 3);
            },

            onceMapClick(cb) {
                if (!_costruita) return false;
                _clickUnaVolta = cb;
                return true;
            },
            cancelMapClick() { _clickUnaVolta = null; },
        });

        /* Quale mappa disegna il gioco.
           `?mappa=2d` / `?mappa=mapbox` nell'indirizzo vince su tutto: e' il
           modo di provare senza toccare un file. Poi l'interruttore
           MAPPA_2D di config.js. In mancanza di entrambi resta montato
           quello che c'e', cioe' Mapbox. */
        const q = (window.location && window.location.search) || '';
        const scelta = /[?&]mappa=2d\b/.test(q) ? 'svg2d'
                     : /[?&]mappa=mapbox\b/.test(q) ? 'mapbox'
                     : (window.MAPPA_2D === true ? 'svg2d' : null);
        if (scelta) window.MapBackend.use(scelta);
    }

    /**
     * Alterna i due backend senza ricaricare la pagina.
     * E' cosi' che il confronto si fa davvero: la stessa scena, due volte di
     * seguito. `use()` smonta il precedente, quindi non restano mai due mappe
     * impilate.
     */
    window.cambiaMappa = function () {
        if (!window.MapBackend) return;
        const attuale = window.MapBackend.attuale();
        const prossimo = attuale === 'svg2d' ? 'mapbox' : 'svg2d';
        if (!window.MapBackend.disponibili().includes(prossimo)) return;
        window.MapBackend.use(prossimo);
        window.MapBackend.ensure();
        const b = document.getElementById('btn-cambia-mappa');
        if (b) b.textContent = prossimo === 'svg2d' ? '🛰 Satellite' : '🗺 Mappa 2D';
    };
})();
