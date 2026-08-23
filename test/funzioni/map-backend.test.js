'use strict';
/**
 * MapBackend — la giuntura fra il gioco e la mappa.
 *
 * Prima esisteva una guardia `typeof drawPOIs === 'function'` in cinque file
 * diversi. Il valore di questo strato sta in due proprieta' che i test qui
 * sotto sorvegliano:
 *   - senza mappa montata il gioco continua a girare (no-op silenziosi);
 *   - non possono esistere due mappe montate insieme.
 *
 * Il file si carica in una VM NUDA, senza jsdom e senza il resto del gioco:
 * e' quel vincolo che lo tiene puro e che permette di metterlo in CORE_FILES
 * senza disturbare gli altri test.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function caricaNudo() {
    const s = { console };
    s.window = s;
    vm.createContext(s);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'map-api.js'), 'utf8'), s, { filename: 'map-api.js' });
    return s;
}

function backendFinto(registro, nome) {
    const chiamate = [];
    const b = { _chiamate: chiamate };
    ['ensure', 'destroy', 'drawHighways', 'drawPOIs', 'updateHQMarker', 'flyToHQ',
     'updateVehicles', 'updateRouteLines', 'dayNight'].forEach(m => {
        b[m] = (...args) => { chiamate.push(m); registro.push(nome + '.' + m); return args; };
    });
    return b;
}

describe('MapBackend — il gioco chiede la mappa a un nome, non a un file', () => {

    let s, MB, registro;
    beforeEach(() => {
        s = caricaNudo();
        MB = s.window.MapBackend;
        registro = [];
    });

    test('si carica in una VM nuda: niente DOM, niente effetti al caricamento', () => {
        assert.equal(typeof MB, 'object');
        assert.equal(MB.attuale(), null, 'al caricamento non deve essere montato niente');
        assert.deepEqual([...MB.disponibili()], [], 'al caricamento il registro deve essere vuoto');
    });

    test('senza backend montato ogni metodo tace, e nessuno lancia', () => {
        assert.doesNotThrow(() => {
            MB.ensure(); MB.destroy(); MB.drawHighways(); MB.drawPOIs();
            MB.updateHQMarker(); MB.flyToHQ(); MB.updateVehicles();
            MB.updateRouteLines(); MB.dayNight(); MB.cancelMapClick();
        });
        assert.equal(MB.isReady(), false);
        assert.equal(MB.onceMapClick(() => {}), false,
            'senza mappa il chiamante deve poter capire che il click non verra\' mai');
    });

    test('register non monta niente: serve use()', () => {
        MB.register('finto', backendFinto(registro, 'finto'));
        assert.deepEqual([...MB.disponibili()], ['finto']);
        assert.equal(MB.attuale(), null);
        MB.drawPOIs();
        assert.deepEqual(registro, [], 'un backend registrato ma non montato non deve ricevere niente');
    });

    test('use() monta, e le chiamate arrivano al backend giusto', () => {
        MB.register('finto', backendFinto(registro, 'finto'));
        assert.equal(MB.use('finto'), true);
        assert.equal(MB.attuale(), 'finto');
        MB.drawHighways(); MB.drawPOIs(); MB.updateHQMarker();
        assert.deepEqual(registro, ['finto.drawHighways', 'finto.drawPOIs', 'finto.updateHQMarker']);
    });

    test('use() di un nome sconosciuto non smonta quello attuale', () => {
        MB.register('uno', backendFinto(registro, 'uno'));
        MB.use('uno');
        assert.equal(MB.use('inesistente'), false);
        assert.equal(MB.attuale(), 'uno');
        assert.deepEqual(registro, [], 'non doveva essere distrutto niente');
    });

    /* La proprieta' che questo strato esiste per garantire: due mappe montate
       insieme vorrebbero dire due mappe impilate a schermo e un ciclo di
       animazione orfano che continua a girare per sempre. */
    test('use() e\' DISTRUTTIVA: montare il secondo smonta il primo', () => {
        MB.register('uno', backendFinto(registro, 'uno'));
        MB.register('due', backendFinto(registro, 'due'));
        MB.use('uno');
        MB.use('due');
        assert.deepEqual(registro, ['uno.destroy'], 'il primo backend doveva ricevere destroy');
        assert.equal(MB.attuale(), 'due');
        registro.length = 0;
        MB.drawPOIs();
        assert.deepEqual(registro, ['due.drawPOIs'], 'solo il backend montato deve ricevere disegno');
    });

    test('use() e\' IDEMPOTENTE: rimontare lo stesso non lo distrugge', () => {
        MB.register('uno', backendFinto(registro, 'uno'));
        MB.use('uno');
        MB.use('uno');
        MB.use('uno');
        assert.deepEqual(registro, [], 'rimontare lo stesso backend non deve fare niente');
        assert.equal(MB.attuale(), 'uno');
    });

    test('destroy() smonta e riporta ai no-op', () => {
        MB.register('uno', backendFinto(registro, 'uno'));
        MB.use('uno');
        MB.destroy();
        assert.equal(MB.attuale(), null);
        registro.length = 0;
        MB.drawPOIs();
        assert.deepEqual(registro, []);
        assert.doesNotThrow(() => MB.destroy(), 'destroy() due volte non deve lanciare');
    });

    /* Regola numero uno: la mappa non puo' rompere il gioco. Prima di questo
       strato una funzione mancante veniva saltata dalla guardia `typeof` e la
       partita proseguiva; qui la stessa cosa vale per una funzione ROTTA. */
    test('un backend che lancia non fa cadere il chiamante', () => {
        const erroriRegistrati = [];
        s.console = { error: (...a) => erroriRegistrati.push(a) };
        MB.register('rotto', {
            drawPOIs() { throw new Error('la mappa e\' esplosa'); },
            ensure() { throw new Error('anche qui'); }
        });
        MB.use('rotto');
        assert.doesNotThrow(() => { MB.drawPOIs(); MB.ensure(); });
        assert.equal(MB.drawPOIs(), undefined);
    });

    test('un backend che implementa solo meta\' dei metodi funziona lo stesso', () => {
        MB.register('parziale', { drawPOIs: () => 'disegnato' });
        MB.use('parziale');
        assert.equal(MB.drawPOIs(), 'disegnato');
        assert.doesNotThrow(() => { MB.drawHighways(); MB.flyToHQ(); MB.updateVehicles(); });
        assert.equal(MB.isReady(), true, 'senza isReady proprio, un backend montato e\' considerato pronto');
    });

    test('isReady segue il backend quando il backend lo dichiara', () => {
        let pronto = false;
        MB.register('lento', { isReady: () => pronto });
        MB.use('lento');
        assert.equal(MB.isReady(), false);
        pronto = true;
        assert.equal(MB.isReady(), true);
    });

    test('onceMapClick consegna le coordinate al chiamante', () => {
        let scatta = null;
        MB.register('cliccabile', {
            onceMapClick(cb) { scatta = cb; return true; }
        });
        MB.use('cliccabile');
        const visti = [];
        assert.equal(MB.onceMapClick((lng, lat) => visti.push([lng, lat])), true);
        scatta(12.4964, 41.9028);
        assert.deepEqual(visti, [[12.4964, 41.9028]]);
    });

    test('onceMapClick torna false se il backend non sa prendere click', () => {
        MB.register('muto', { drawPOIs: () => {} });
        MB.use('muto');
        assert.equal(MB.onceMapClick(() => {}), false);
    });
});
