'use strict';
/**
 * La mappa 2D: cosa disegna, cosa emette, e cosa NON fa.
 *
 * I tre vincoli del file sono qui sotto in forma di asserzione:
 *   - il solo caricamento non deve fare niente (map-visual.js avviava il suo
 *     ciclo alla riga finale e non lo fermava mai);
 *   - la stringa SVG si costruisce una volta, poi si mutano attributi;
 *   - verso l'esterno escono ID DI GIOCO, mai pixel e mai nodi del DOM.
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const FILES = [...CORE_FILES, 'map-proiezione.js', 'geo-italia.js', 'map-dati.js', 'map-svg.js'];

function ambiente(opzioni = {}) {
    const raf = [];
    const env = createGameEnv(FILES);
    const s = env.sandbox;
    s.setTimeout = () => 0;
    s.initGame(true);
    env.stopAllIntervals();
    s.gameState.unlockedRegions = opzioni.sbloccate || ['lazio'];
    s.gameState.ownedHubs = opzioni.hub || [];

    const root = s.document.createElement('div');
    root.id = 'map2d-root';
    root.className = 'hidden';
    s.document.body.appendChild(root);

    const W = s.document.defaultView;
    const clicca = (nodo, tipo = 'click') => nodo.dispatchEvent(new W.MouseEvent(tipo, { bubbles: true, cancelable: true }));

    return { env, s, root, clicca, raf, W };
}

describe('map-svg — vincoli del file', () => {

    test('il solo caricamento non monta niente e non chiede fotogrammi', () => {
        const chiamate = [];
        const env = createGameEnv(FILES.slice(0, -1));
        env.sandbox.requestAnimationFrame = (fn) => { chiamate.push(fn); return 1; };
        // carica map-svg.js DOPO aver messo la spia
        const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
        vm.runInContext(
            fs.readFileSync(path.resolve(__dirname, '..', '..', 'map-svg.js'), 'utf8'),
            env.sandbox, { filename: 'map-svg.js' });

        assert.deepEqual(chiamate, [], 'caricare il file non deve chiedere un fotogramma');
        assert.equal(env.sandbox.window.CE_map.montata(), false);
        assert.equal(env.sandbox.document.getElementById('ce-map-svg'), null);
        env.stopAllIntervals();
    });

    test('si registra come backend ma non si monta da solo', () => {
        const { env, s } = ambiente();
        assert.ok([...s.window.MapBackend.disponibili()].includes('svg2d'));
        assert.equal(s.window.CE_map.montata(), false);
        env.stopAllIntervals();
    });
});

describe('map-svg — cosa disegna', () => {

    let env, s, root, clicca;
    beforeEach(() => { ({ env, s, root, clicca } = ambiente({ sbloccate: ['lazio', 'toscana'], hub: ['roma'] })); });
    afterEach(() => { s.window.CE_map.smonta(); env.stopAllIntervals(); });

    test('monta le venti regioni e le quarantuno citta\'', () => {
        assert.equal(s.window.CE_map.monta(), true);
        const svg = s.document.getElementById('ce-map-svg');
        assert.ok(svg, 'l\'SVG deve esistere');
        assert.equal(svg.querySelectorAll('[data-regione]').length, 20);
        assert.equal(svg.querySelectorAll('[data-citta]').length, 41);
        assert.equal(root.classList.contains('hidden'), false);
    });

    /* Il guasto piu' comune e piu' silenzioso: una coordinata guasta e il
       browser scarta l'intero contorno senza dire niente. */
    test('nessun path contiene NaN', () => {
        s.window.CE_map.monta();
        const svg = s.document.getElementById('ce-map-svg');
        svg.querySelectorAll('path').forEach(p => {
            const d = p.getAttribute('d') || '';
            assert.ok(!/NaN|undefined|Infinity/.test(d),
                `path ${p.getAttribute('data-regione') || p.getAttribute('data-strada')} guasto`);
        });
    });

    test('il colore dice lo stato: tuo, sbloccato, bloccato', () => {
        s.window.CE_map.monta();
        const svg = s.document.getElementById('ce-map-svg');
        const col = id => svg.querySelector(`[data-regione="${id}"]`).getAttribute('fill');
        assert.notEqual(col('lazio'), col('toscana'), 'la regione con la sede non e\' come una sbloccata');
        assert.notEqual(col('toscana'), col('sicilia'), 'sbloccata e bloccata non possono essere uguali');
    });

    test('le etichette stanno al punto etichetta, non al baricentro', () => {
        s.window.CE_map.monta();
        const svg = s.document.getElementById('ce-map-svg');
        const testi = svg.querySelectorAll('[data-etichetta]');
        assert.equal(testi.length, 20);
        const cal = svg.querySelector('[data-etichetta="calabria"]');
        const P = s.window.CE_proj;
        const atteso = P.proietta(...s.window.GEO_ITALIA.regions.calabria.label);
        assert.equal(cal.getAttribute('x'), atteso[0].toFixed(1));
    });

    test('la mappa nuova nasconde quella vecchia: mai due insieme', () => {
        const vecchio = s.document.createElement('div');
        vecchio.id = 'leaflet-map';
        s.document.body.appendChild(vecchio);
        s.window.CE_map.monta();
        assert.equal(vecchio.classList.contains('hidden'), true);
    });
});

describe('map-svg — cosa emette', () => {

    let env, s, clicca;
    beforeEach(() => {
        ({ env, s, clicca } = ambiente({ sbloccate: ['lazio'] }));
        s.window.CE_map.monta();
    });
    afterEach(() => { s.window.CE_map.smonta(); env.stopAllIntervals(); });

    test('cliccare una regione emette il suo ID DI GIOCO, non un nodo', () => {
        const visti = [];
        s.window.CE_map.onRegioneClick = (id) => visti.push(id);
        clicca(s.document.querySelector('[data-regione="toscana"]'));
        assert.deepEqual(visti, ['toscana']);
        assert.equal(typeof visti[0], 'string');
    });

    test('ricliccare la stessa regione la deseleziona', () => {
        const visti = [];
        s.window.CE_map.onRegioneClick = (id) => visti.push(id);
        const p = s.document.querySelector('[data-regione="toscana"]');
        clicca(p); clicca(p);
        assert.deepEqual(visti, ['toscana', null]);
        assert.equal(s.window.CE_map.selezione(), null);
    });

    test('la regione scelta cambia contorno, e nessun\'altra', () => {
        clicca(s.document.querySelector('[data-regione="toscana"]'));
        const scelte = s.document.querySelectorAll('.ce-scelta');
        assert.equal(scelte.length, 1);
        assert.equal(scelte[0].getAttribute('data-regione'), 'toscana');
    });

    test('cliccare una citta\' emette l\'id della citta\', non quello della regione', () => {
        const visti = [];
        s.window.CE_map.onCittaClick = (id) => visti.push(id);
        s.window.CE_map.onRegioneClick = () => visti.push('REGIONE!');
        clicca(s.document.querySelector('[data-citta="roma"]'));
        assert.deepEqual(visti, ['roma'], 'il click sulla citta\' non deve arrivare anche alla regione');
    });

    test('onceMapClick restituisce coordinate geografiche, una volta sola', () => {
        const visti = [];
        assert.equal(s.window.MapBackend.attuale() === 'svg2d' || true, true);
        const preso = s.window.CE_map && s.window.MapBackend.disponibili();
        s.window.MapBackend.use('svg2d');
        assert.equal(s.window.MapBackend.onceMapClick((lon, lat) => visti.push([lon, lat])), true);

        clicca(s.document.querySelector('[data-regione="lazio"]'));
        assert.equal(visti.length, 1);
        const [lon, lat] = visti[0];
        assert.ok(lon > 6 && lon < 19, `longitudine ${lon} fuori dall'Italia`);
        assert.ok(lat > 35 && lat < 48, `latitudine ${lat} fuori dall'Italia`);

        clicca(s.document.querySelector('[data-regione="lazio"]'));
        assert.equal(visti.length, 1, 'il gancio doveva valere una volta sola');
        assert.ok(preso);
    });

    test('un gancio che lancia non porta giu\' la mappa', () => {
        s.window.CE_map.onRegioneClick = () => { throw new Error('il pannello e\' esploso'); };
        assert.doesNotThrow(() => clicca(s.document.querySelector('[data-regione="toscana"]')));
    });
});

describe('map-svg — zoom e pan, aritmetica pura', () => {

    let env, s, M;
    beforeEach(() => { ({ env, s } = ambiente()); M = s.window.CE_map; });
    afterEach(() => { M.smonta(); env.stopAllIntervals(); });

    test('la vista intera e\' il riquadro completo', () => {
        const v = M._vistaIntera();
        assert.deepEqual([v.x, v.y, v.w, v.h], [0, 0, 500, 660]);
        assert.equal(M._zoomCorrente(v), 1);
    });

    test('lo zoom non scende sotto 1x ne\' sale sopra 4x', () => {
        let v = M._vistaIntera();
        for (let i = 0; i < 20; i++) v = M._zoomVerso(v, 0.5, 0.5, 1.5);
        assert.ok(Math.abs(M._zoomCorrente(v) - 4) < 1e-9, `zoom ${M._zoomCorrente(v)}`);
        for (let i = 0; i < 20; i++) v = M._zoomVerso(v, 0.5, 0.5, 1 / 1.5);
        assert.ok(Math.abs(M._zoomCorrente(v) - 1) < 1e-9);
    });

    /* Lo zoom "attorno al cursore": il punto sotto il puntatore non si muove.
       E' l'unico zoom che non fa perdere l'orientamento. */
    test('il punto sotto il cursore resta fermo', () => {
        const v0 = M._vistaIntera();
        const fx = 0.3, fy = 0.7;
        const prima = [v0.x + fx * v0.w, v0.y + fy * v0.h];
        const v1 = M._zoomVerso(v0, fx, fy, 2);
        const dopo = [v1.x + fx * v1.w, v1.y + fy * v1.h];
        assert.ok(Math.abs(prima[0] - dopo[0]) < 1e-9, `x: ${prima[0]} → ${dopo[0]}`);
        assert.ok(Math.abs(prima[1] - dopo[1]) < 1e-9, `y: ${prima[1]} → ${dopo[1]}`);
    });

    test('la vista resta sempre dentro i confini del riquadro', () => {
        let v = M._zoomVerso(M._vistaIntera(), 0.5, 0.5, 2.5);
        for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5], [9, 9]]) {
            v = M._spostaDi(v, dx, dy);
            assert.ok(v.x >= -1e-9 && v.x + v.w <= 500 + 1e-9, `x fuori: ${v.x} + ${v.w}`);
            assert.ok(v.y >= -1e-9 && v.y + v.h <= 660 + 1e-9, `y fuori: ${v.y} + ${v.h}`);
        }
    });

    test('a zoom 1 non ci si puo\' spostare: si vede gia\' tutto', () => {
        const v = M._spostaDi(M._vistaIntera(), 0.5, 0.5);
        assert.deepEqual([v.x, v.y], [0, 0]);
    });

    test('le proporzioni non si deformano mai', () => {
        let v = M._vistaIntera();
        const rapporto = v.h / v.w;
        for (const f of [1.3, 2, 0.4, 3]) {
            v = M._zoomVerso(v, Math.random(), Math.random(), f);
            assert.ok(Math.abs(v.h / v.w - rapporto) < 1e-9, 'il riquadro si e\' deformato');
        }
    });

    test('inquadra centra un punto geografico e scrive il viewBox', () => {
        M.monta();
        M.inquadra(12.4964, 41.9028, 3);
        const v = M._vista();
        const [x, y] = s.window.CE_proj.proietta(12.4964, 41.9028);
        assert.ok(Math.abs((v.x + v.w / 2) - x) < 0.01);
        assert.ok(Math.abs((v.y + v.h / 2) - y) < 0.01);
        const scritto = s.document.getElementById('ce-map-svg').getAttribute('viewBox');
        assert.match(scritto, /^[\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
    });
});

describe('map-svg — ciclo di vita', () => {

    let env, s, clicca;
    beforeEach(() => { ({ env, s, clicca } = ambiente()); });
    afterEach(() => env.stopAllIntervals());

    test('montare due volte non costruisce due mappe', () => {
        s.window.CE_map.monta();
        const primo = s.document.getElementById('ce-map-svg');
        s.window.CE_map.monta();
        assert.equal(s.document.querySelectorAll('#ce-map-svg').length, 1);
        assert.equal(s.document.getElementById('ce-map-svg'), primo);
    });

    /* La stringa si costruisce una volta: `aggiorna` muta attributi. Se
       ricostruisse innerHTML, il nodo cambierebbe identita' e il browser
       rifarebbe il layout di sessanta etichette a ogni cambio di stato. */
    test('aggiorna muta attributi, non ricostruisce l\'SVG', () => {
        s.window.CE_map.monta();
        const svg = s.document.getElementById('ce-map-svg');
        const sicilia = svg.querySelector('[data-regione="sicilia"]');
        const dPrima = sicilia.getAttribute('d');
        const coloreDentro = sicilia.getAttribute('fill');

        s.gameState.unlockedRegions = ['lazio', 'sicilia'];
        s.window.CE_map.aggiorna();

        assert.equal(s.document.getElementById('ce-map-svg'), svg, 'l\'SVG e\' stato ricostruito');
        assert.equal(sicilia.isConnected !== false && svg.querySelector('[data-regione="sicilia"]'), sicilia,
            'il path della Sicilia e\' stato sostituito invece che aggiornato');
        assert.equal(sicilia.getAttribute('d'), dPrima, 'la geometria non doveva cambiare');
        assert.notEqual(sicilia.getAttribute('fill'), coloreDentro, 'il colore doveva cambiare');
    });

    test('smonta ripulisce tutto e stacca gli ascoltatori', () => {
        s.window.CE_map.monta();
        const nodo = s.document.querySelector('[data-regione="toscana"]');
        s.window.CE_map.smonta();

        assert.equal(s.document.getElementById('ce-map-svg'), null);
        assert.equal(s.window.CE_map.montata(), false);
        assert.equal(s.document.getElementById('map2d-root').classList.contains('hidden'), true);

        const visti = [];
        s.window.CE_map.onRegioneClick = (id) => visti.push(id);
        clicca(nodo);
        assert.deepEqual(visti, [], 'un ascoltatore e\' sopravvissuto allo smontaggio');
    });

    test('smontare senza aver montato non lancia', () => {
        assert.doesNotThrow(() => s.window.CE_map.smonta());
    });

    test('MapBackend monta e smonta la mappa 2D', () => {
        const MB = s.window.MapBackend;
        MB.use('svg2d');
        MB.ensure();
        assert.equal(s.window.CE_map.montata(), true);
        assert.equal(MB.isReady(), true);
        MB.destroy();
        assert.equal(s.window.CE_map.montata(), false);
        assert.equal(s.document.getElementById('ce-map-svg'), null);
    });
});

describe('map-svg — il pannello laterale', () => {

    let env, s, clicca;
    beforeEach(() => {
        ({ env, s, clicca } = ambiente({ sbloccate: ['lazio'], hub: ['roma'] }));
        s.window.CE_map.monta();
    });
    afterEach(() => { s.window.CE_map.smonta(); env.stopAllIntervals(); });

    const pannello = () => s.document.getElementById('ce-map2d-pannello');

    test('a mappa appena montata il pannello e\' chiuso', () => {
        assert.equal(pannello().classList.contains('visibile'), false);
    });

    test('cliccare una regione apre la sua scheda', () => {
        clicca(s.document.querySelector('[data-regione="toscana"]'));
        const p = pannello();
        assert.equal(p.classList.contains('visibile'), true);
        assert.match(p.innerHTML, /Toscana/);
        assert.match(p.innerHTML, /Bloccata/, 'la Toscana non e\' sbloccata in questa partita');
    });

    test('la scheda di una regione bloccata mostra prezzo e reputazione richiesta', () => {
        clicca(s.document.querySelector('[data-regione="lombardia"]'));
        const html = pannello().innerHTML;
        assert.match(html, /55\.000/, 'il prezzo della Lombardia (55.000) deve comparire');
        assert.match(html, /3★/, 'la reputazione richiesta deve comparire');
        assert.match(html, /_mapSbloccaRegione/, 'deve esserci il pulsante d\'acquisto');
    });

    test('una regione gia\' tua non offre di comprarla', () => {
        clicca(s.document.querySelector('[data-regione="lazio"]'));
        assert.doesNotMatch(pannello().innerHTML, /_mapSbloccaRegione/);
    });

    test('cliccare una citta\' apre la scheda della citta\', non della regione', () => {
        clicca(s.document.querySelector('[data-citta="roma"]'));
        const html = pannello().innerHTML;
        assert.match(html, /Roma Centro/);
        assert.match(html, /Tariffa base/);
        assert.match(html, /proprieta/, 'roma e\' un hub del giocatore in questa partita');
    });

    test('il pulsante di chiusura chiude e deseleziona', () => {
        clicca(s.document.querySelector('[data-regione="toscana"]'));
        clicca(s.document.querySelector('[data-chiudi-pannello]'));
        assert.equal(pannello().classList.contains('visibile'), false);
        assert.equal(s.window.CE_map.selezione(), null);
        assert.equal(s.document.querySelectorAll('.ce-scelta').length, 0);
    });

    test('cliccare il mare chiude il pannello', () => {
        clicca(s.document.querySelector('[data-regione="toscana"]'));
        clicca(s.document.querySelector('.ce-mare'));
        assert.equal(pannello().classList.contains('visibile'), false);
    });

    /* L'unica AZIONE del pannello passa da window.buyRegion, che e' la
       stessa della scheda Licenze e va al server. Nessuna porta nuova per il
       denaro: e' il guardrail piu' importante del progetto. */
    test('l\'acquisto inoltra a buyRegion e non tocca il denaro da solo', async () => {
        const chiamate = [];
        s.gameState.cash = 999999;
        s.gameState.reputation = 99;
        s.window.buyRegion = async (id) => { chiamate.push(id); };

        clicca(s.document.querySelector('[data-regione="lombardia"]'));
        const bottone = pannello().querySelector('[data-ce-act="_mapSbloccaRegione"]');
        assert.ok(bottone, 'il pulsante deve esserci con fondi e reputazione sufficienti');

        const cassaPrima = s.gameState.cash;
        await s.window._mapSbloccaRegione('lombardia');
        assert.deepEqual(chiamate, ['lombardia']);
        assert.equal(s.gameState.cash, cassaPrima, 'la mappa non deve muovere denaro da sola');
    });

    test('senza buyRegion il pulsante non lancia', () => {
        s.window.buyRegion = undefined;
        assert.doesNotThrow(() => s.window._mapSbloccaRegione('lombardia'));
    });
});

/* I marcatori di evento — incidenti, posti di blocco, cantieri.
   Sono le tre cose che sarebbero sparite in silenzio invertendo la mappa
   predefinita: il motore le chiedeva a map.js per nome, protette da una
   guardia `typeof` che non distingue "non c'e'" da "non fa niente". */
describe('map-svg — marcatori di evento', () => {

    let env, s;
    beforeEach(() => {
        ({ env, s } = ambiente({ sbloccate: ['lazio'] }));
        s.window.MapBackend.use('svg2d');
        s.window.MapBackend.ensure();
    });
    afterEach(() => { s.window.MapBackend.destroy(); env.stopAllIntervals(); });

    const eventi = () => s.document.querySelectorAll('#ce-g-eventi .ce-evento');

    test('un incidente compare sulla mappa, col nome dell\'autista', () => {
        s.window.MapBackend.addIncidente(12.4964, 41.9028, 'Marco Rossi');
        assert.equal(eventi().length, 1);
        assert.match(eventi()[0].textContent, /Marco Rossi/);
    });

    test('un posto di blocco compare e si toglie per id di corsa', () => {
        s.window.MapBackend.addPostoBlocco(12.4, 41.8, 77);
        assert.equal(eventi().length, 1);
        s.window.MapBackend.removePostoBlocco(77);
        assert.equal(eventi().length, 0);
    });

    test('togliere un posto di blocco inesistente non lancia', () => {
        assert.doesNotThrow(() => s.window.MapBackend.removePostoBlocco(999));
    });

    test('un cantiere resta finche\' non lo si toglie, e non si duplica', () => {
        s.window.MapBackend.addCantiere('roma-firenze', 12.0, 42.5);
        s.window.MapBackend.addCantiere('roma-firenze', 12.0, 42.5);
        assert.equal(eventi().length, 1, 'lo stesso cantiere non deve comparire due volte');
        s.window.MapBackend.removeCantiere('roma-firenze');
        assert.equal(eventi().length, 0);
    });

    test('la posizione del marcatore e\' quella geografica, senza NaN', () => {
        s.window.MapBackend.addCantiere('x', 12.4964, 41.9028);
        const n = eventi()[0];
        const atteso = s.window.CE_proj.proietta(12.4964, 41.9028);
        assert.equal(n.getAttribute('x'), atteso[0].toFixed(1));
        assert.equal(n.getAttribute('y'), atteso[1].toFixed(1));
    });

    test('un marcatore con coordinate guaste non entra nella mappa', () => {
        s.window.MapBackend.addCantiere('rotto', NaN, 41.9);
        assert.equal(eventi().length, 0);
    });

    test('smontando la mappa i marcatori se ne vanno con lei', () => {
        s.window.MapBackend.addCantiere('roma-firenze', 12.0, 42.5);
        s.window.MapBackend.destroy();
        assert.equal(s.document.querySelectorAll('.ce-evento').length, 0);
        s.window.MapBackend.use('svg2d');
        s.window.MapBackend.ensure();
        assert.equal(eventi().length, 0, 'non devono resuscitare al rimontaggio');
    });

    test('senza mappa montata chiedere un marcatore non lancia', () => {
        s.window.MapBackend.destroy();
        assert.doesNotThrow(() => {
            s.window.MapBackend.addIncidente(12, 42, 'x');
            s.window.MapBackend.addPostoBlocco(12, 42, 1);
            s.window.MapBackend.addCantiere('k', 12, 42);
            s.window.MapBackend.removeCantiere('k');
        });
    });
});
