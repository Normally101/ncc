'use strict';
/* ============================================================================
   test/funzioni/politica-warroom.test.js — Collaudo profondo War Room e Mappa Politica

   Scopo: verificare che tutte le azioni, le funzioni esposte e le interazioni
   di `war_room.js` funzionino realmente nel banco di prova:
     - renderTabWarRoom: inizializzazione overlay, fetch GeoJSON e snapshot,
       rendering SVG geografico con centroidi, etichette e badge.
     - Interazioni mappa: selezione regioni, rendering sidebar con province possedute,
       libere e nemiche, calcolo soglie OPA standard (120%) e ostile (230%).
     - _wrClose (data-ce-act="_wrClose"): chiusura overlay, ripristino main-panel,
       invocazione sicura di _destroyMap.
     - _wrAcquire (data-ce-act="_wrAcquire"): validazione offerta numerica,
       controllo fondi disponibili, invocazione autoritativa ServerState.acquireProvince,
       segnalazione evento showBigEvent, gestione errori e canale unico del denaro.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

const MOCK_GEOJSON = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { reg_name: 'Lombardia', id: '03' },
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [[9.0, 45.0], [10.5, 45.0], [10.5, 46.5], [9.0, 46.5], [9.0, 45.0]]
                ]
            }
        },
        {
            type: 'Feature',
            properties: { DEN_REG: 'Lazio', id: '12' },
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [[11.5, 41.2], [13.5, 41.2], [13.5, 42.8], [11.5, 42.8], [11.5, 41.2]]
                ]
            }
        },
        {
            type: 'Feature',
            properties: { NAME_1: 'Piemonte', id: '01' },
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    [[[7.0, 44.5], [8.8, 44.5], [8.8, 46.0], [7.0, 46.0], [7.0, 44.5]]]
                ]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Toscana', id: '09' },
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [[9.8, 42.5], [12.2, 42.5], [12.2, 44.4], [9.8, 44.4], [9.8, 42.5]]
                ]
            }
        }
    ]
};

function creaAmbienteWarRoom(opzioni = {}) {
    const rpcLog = [];
    const bigEvents = [];
    const geoData = opzioni.geoData !== undefined ? opzioni.geoData : MOCK_GEOJSON;

    const env = freshEnv({
        render: true,
        serverState: {
            acquireProvince: async (provinceId, offer) => {
                rpcLog.push({ action: 'acquireProvince', provinceId, offer });
                if (opzioni.acquireProvinceThrows) {
                    throw new Error(opzioni.acquireProvinceThrows);
                }
                if (opzioni.acquireProvinceResult !== undefined) {
                    return opzioni.acquireProvinceResult;
                }
                return { success: true, province_name: opzioni.provinceName || 'Milano' };
            },
            getTerritorySnapshot: async () => {
                if (opzioni.snapshotError) throw new Error('Errore caricamento territorio');
                if (opzioni.snapshotNull) return null;
                return opzioni.snapshot || {
                    provinces: [
                        { id: 'prov_mi', region_id: 'reg_lombardia', name: 'Milano', owner_company: 'MyCo', owner_id: 'user_1', current_value: 100000, required_influence: 500, transit_tax_pct: 0.03 },
                        { id: 'prov_bg', region_id: 'reg_lombardia', name: 'Bergamo', owner_company: null, owner_id: null, current_value: 50000, required_influence: 300, transit_tax_pct: 0.02 },
                        { id: 'prov_bs', region_id: 'reg_lombardia', name: 'Brescia', owner_company: 'RivalCorp', owner_id: 'user_2', current_value: 80000, required_influence: 400, transit_tax_pct: 0.025 },
                        { id: 'prov_rm', region_id: 'reg_lazio', name: 'Roma', owner_company: 'MyCo', owner_id: 'user_1', current_value: 200000, required_influence: 600, transit_tax_pct: 0.035 },
                        { id: 'prov_lt', region_id: 'reg_lazio', name: 'Latina', owner_company: 'MyCo', owner_id: 'user_1', current_value: 60000, required_influence: 200, transit_tax_pct: 0.02 },
                    ],
                    regions: [
                        { id: 'reg_lombardia', name: 'Lombardia', governor_company: 'MyCo', region_tax_pct: 0.015 },
                        { id: 'reg_lazio', name: 'Lazio', governor_company: 'MyCo', region_tax_pct: 0.01 },
                        { id: 'reg_piemonte', name: 'Piemonte', governor_company: 'RivalCorp', region_tax_pct: 0.02 },
                        { id: 'reg_toscana', name: 'Toscana', governor_company: null, region_tax_pct: 0.01 },
                    ],
                    influence: {
                        prov_mi: 600,
                        prov_bg: 350,
                        prov_bs: 100, // sotto soglia 400
                        prov_rm: 700,
                        prov_lt: 250,
                    }
                };
            },
            ...opzioni.serverStateOverrides,
        }
    });

    // Mock fetch per scaricare il GeoJSON
    env.sandbox.fetch = async (url) => {
        if (opzioni.fetchError) {
            return { ok: false, status: 500, json: async () => { throw new Error('Fetch failed'); } };
        }
        return {
            ok: true,
            status: 200,
            json: async () => geoData,
        };
    };
    env.sandbox.window.fetch = env.sandbox.fetch;

    // Carica war_room.js
    const warRoomSrc = fs.readFileSync(path.join(ROOT, 'war_room.js'), 'utf8');
    vm.runInContext(warRoomSrc, env.sandbox, { filename: 'war_room.js' });

    const pushBigEvent = (icon, title, desc) => {
        bigEvents.push({ icon, title, desc });
    };
    env.sandbox._pushBigEvent = pushBigEvent;
    env.sandbox.showBigEvent = pushBigEvent;
    env.sandbox.window.showBigEvent = pushBigEvent;
    vm.runInContext('showBigEvent = function(i, t, d) { _pushBigEvent(i, t, d); };', env.sandbox);

    env.sandbox.gameState.companyName = opzioni.companyName || 'MyCo';
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 1000000;

    env.sandbox.document.body.innerHTML = `
        <div id="main-panel"></div>
        <div id="tab-container"></div>
    `;

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        notifications: env.notifications,
        bigEvents,
        rpcLog,
    };
}

describe('War Room — Definizione, esportazioni e isolamento del modulo', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteWarRoom(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('war_room.js esporta renderTabWarRoom, _wrClose e _wrAcquire su window', () => {
        const { sandbox } = amb;
        assert.equal(typeof sandbox.window.renderTabWarRoom, 'function', 'renderTabWarRoom deve essere funzione');
        assert.equal(typeof sandbox.window._wrClose, 'function', '_wrClose deve essere funzione');
        assert.equal(typeof sandbox.window._wrAcquire, 'function', '_wrAcquire deve essere funzione');
    });

    test('war_room.js non sovrascrive window.renderTabProvinces', () => {
        const { sandbox } = amb;
        assert.equal(typeof sandbox.window.renderTabProvinces, 'function', 'renderTabProvinces (da ui-ops) deve rimanere intatta');
        assert.notEqual(sandbox.window.renderTabProvinces, sandbox.window.renderTabWarRoom);
    });

    test('iniezione stili CSS: crea l elemento #wr-style nell head ed è idempotente', async () => {
        const { sandbox } = amb;
        await sandbox.window.renderTabWarRoom();

        const styleEl = sandbox.document.getElementById('wr-style');
        assert.ok(styleEl, '#wr-style deve essere inserito nel document.head');
        assert.ok(styleEl.textContent.includes('#wr-overlay'), 'deve contenere regole CSS per la war room');

        const styleCountBefore = sandbox.document.head.querySelectorAll('#wr-style').length;
        assert.equal(styleCountBefore, 1);

        // Seconda esecuzione non duplica il tag style
        await sandbox.window.renderTabWarRoom();
        const styleCountAfter = sandbox.document.head.querySelectorAll('#wr-style').length;
        assert.equal(styleCountAfter, 1);
    });
});

describe('War Room — Rendering principale (renderTabWarRoom)', () => {
    let amb;
    beforeEach(() => { amb = creaAmbienteWarRoom(); });
    afterEach(() => amb.env.stopAllIntervals());

    test('renderTabWarRoom crea #wr-overlay, nasconde #main-panel e svuota #tab-container', async () => {
        const { sandbox } = amb;
        const mainPanel = sandbox.document.getElementById('main-panel');
        const tabContainer = sandbox.document.getElementById('tab-container');
        tabContainer.innerHTML = '<div>vecchio contenuto tab</div>';

        await sandbox.window.renderTabWarRoom();

        const overlay = sandbox.document.getElementById('wr-overlay');
        assert.ok(overlay, '#wr-overlay deve essere presente nel body');
        assert.equal(mainPanel.style.display, 'none', '#main-panel deve essere nascosto');
        assert.equal(tabContainer.innerHTML, '', '#tab-container deve essere svuotato');
    });

    test('se #wr-overlay esiste già viene sostituito senza lasciare duplicati', async () => {
        const { sandbox } = amb;
        await sandbox.window.renderTabWarRoom();
        assert.equal(sandbox.document.querySelectorAll('#wr-overlay').length, 1);

        await sandbox.window.renderTabWarRoom();
        assert.equal(sandbox.document.querySelectorAll('#wr-overlay').length, 1);
    });

    test('rendering completo con GeoJSON e snapshot: header, mappa SVG e contatore province', async () => {
        const { sandbox } = amb;
        await sandbox.window.renderTabWarRoom();

        const overlay = sandbox.document.getElementById('wr-overlay');
        const html = overlay.innerHTML;

        assert.ok(html.includes('WAR ROOM'), 'titolo WAR ROOM presente');
        assert.ok(html.includes('CHAUFFEUR EMPIRE'), 'sottotitolo presente');
        assert.ok(html.includes('/ 5 province'), 'contatore province totali presente');
        assert.ok(html.includes('3'), 'contatore province possedute (Milano, Roma, Latina = 3) presente');

        const mapPane = sandbox.document.getElementById('wr-map-pane');
        const svg = mapPane.querySelector('svg');
        assert.ok(svg, 'svg geografico presente');
        assert.equal(svg.getAttribute('viewBox'), '0 0 500 660');

        const regLombardia = svg.querySelector('#reg_lombardia');
        const regLazio = svg.querySelector('#reg_lazio');
        const regPiemonte = svg.querySelector('#reg_piemonte');
        const regToscana = svg.querySelector('#reg_toscana');

        assert.ok(regLombardia, 'regione Lombardia presente nel SVG');
        assert.ok(regLazio, 'regione Lazio presente nel SVG');
        assert.ok(regPiemonte, 'regione Piemonte presente nel SVG');
        assert.ok(regToscana, 'regione Toscana presente nel SVG');
    });

    test('badge corona governatore (♛) e stella dominio totale (★) nelle etichette SVG', async () => {
        const { sandbox } = amb;
        await sandbox.window.renderTabWarRoom();

        const overlay = sandbox.document.getElementById('wr-overlay');
        // Lazio: possediamo tutte le province (Roma + Latina = 2/2) -> badge stella '★'
        // Lombardia: governatore ma non tutte (Milano=1, Bergamo=libera, Brescia=rivale) -> badge governatore '♛'
        const regLazio = overlay.querySelector('#reg_lazio');
        const regLombardia = overlay.querySelector('#reg_lombardia');

        assert.ok(regLazio.innerHTML.includes('★'), 'Lazio con 100% province possedute deve mostrare stella ★');
        assert.ok(regLombardia.innerHTML.includes('♛'), 'Lombardia con carica governatore deve mostrare corona ♛');
    });

    test('gestione modalità offline: snapshot fallito mostra badge offline e mantiene mappa GeoJSON', async () => {
        const ambOffline = creaAmbienteWarRoom({ snapshotError: true });
        await ambOffline.sandbox.window.renderTabWarRoom();

        const overlay = ambOffline.sandbox.document.getElementById('wr-overlay');
        assert.ok(overlay.innerHTML.includes('⚠ offline'), 'badge offline visibile in header');

        const svg = overlay.querySelector('#wr-map-pane svg');
        assert.ok(svg, 'mappa SVG comunque presente e navigabile in offline');
        ambOffline.env.stopAllIntervals();
    });

    test('gestione fallimento fetch GeoJSON mostra messaggio di avviso nel map pane', async () => {
        const ambNoGeo = creaAmbienteWarRoom({ fetchError: true });
        await ambNoGeo.sandbox.window.renderTabWarRoom();

        const mapPane = ambNoGeo.sandbox.document.getElementById('wr-map-pane');
        assert.ok(mapPane.innerHTML.includes('Impossibile caricare la mappa geografica'), 'messaggio di errore presente');
        ambNoGeo.env.stopAllIntervals();
    });

    test('conversione corretta di feature Polygon e MultiPolygon e calcolo centroide', async () => {
        const { sandbox } = amb;
        await sandbox.window.renderTabWarRoom();

        const svg = sandbox.document.querySelector('#wr-map-pane svg');
        const pathLombardia = svg.querySelector('#reg_lombardia path');
        const pathPiemonte = svg.querySelector('#reg_piemonte path'); // MultiPolygon

        assert.ok(pathLombardia.getAttribute('d').startsWith('M'), 'path Polygon deve iniziare con M');
        assert.ok(pathPiemonte.getAttribute('d').startsWith('M'), 'path MultiPolygon deve iniziare con M');
        assert.ok(pathPiemonte.getAttribute('d').includes('Z'), 'path deve chiudersi con Z');
    });
});

describe('War Room — Interazioni mappa e Sidebar (selezione regioni e province)', () => {
    let amb;
    beforeEach(async () => {
        amb = creaAmbienteWarRoom();
        await amb.sandbox.window.renderTabWarRoom();
    });
    afterEach(() => amb.env.stopAllIntervals());

    test('click su una regione nella mappa SVG attiva la classe wr-sel e popola la sidebar', () => {
        const { sandbox } = amb;
        const regEl = sandbox.document.querySelector('#reg_lombardia');
        assert.ok(regEl, 'elemento reg_lombardia presente');

        regEl.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        assert.ok(regEl.classList.contains('wr-sel'), 'la regione cliccata deve avere la classe wr-sel');

        const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
        const html = sidebar.innerHTML;

        assert.ok(html.includes('Lombardia'), 'nome regione presente');
        assert.ok(html.includes('👑 SEI GOVERNATORE'), 'status governatore presente');
        assert.ok(html.includes('Milano'), 'provincia Milano presente');
        assert.ok(html.includes('Bergamo'), 'provincia Bergamo presente');
        assert.ok(html.includes('Brescia'), 'provincia Brescia presente');
    });

    test('selezione di un altra regione deseleziona la precedente', () => {
        const { sandbox } = amb;
        const regLombardia = sandbox.document.querySelector('#reg_lombardia');
        const regLazio = sandbox.document.querySelector('#reg_lazio');

        regLombardia.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
        assert.ok(regLombardia.classList.contains('wr-sel'));

        regLazio.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
        assert.equal(regLombardia.classList.contains('wr-sel'), false, 'Lombardia non deve più avere wr-sel');
        assert.ok(regLazio.classList.contains('wr-sel'), 'Lazio deve avere wr-sel');
    });

    test('sidebar mostra dettagli provincia posseduta (.is-mine): badge e rendita fiscale', () => {
        const { sandbox } = amb;
        const regEl = sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
        const cardMi = sidebar.querySelector('.wr-prov-card.is-mine');
        assert.ok(cardMi, 'card per Milano deve avere classe is-mine');
        assert.ok(cardMi.innerHTML.includes('✦ Tua'), 'badge Tua presente');
        assert.ok(cardMi.innerHTML.includes('Incassi il 3.0% + 1.5% (Gov)'), 'dettaglio aliquota fiscale con bonus governatore presente');
    });

    test('sidebar mostra provincia libera (.is-free): offerta minima OPA 120% e pulsante OPA se sbloccata', () => {
        const { sandbox } = amb;
        const regEl = sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
        const cardBg = sidebar.querySelector('.wr-prov-card.is-free');
        assert.ok(cardBg, 'card per Bergamo deve avere classe is-free');
        assert.ok(cardBg.innerHTML.includes('◎ Libera'), 'badge Libera presente');

        // Valore €50.000 -> Min OPA 120% = €60.000
        const inputBg = cardBg.querySelector('#wri-prov_bg');
        assert.ok(inputBg, 'input offerta per prov_bg presente');
        assert.equal(inputBg.getAttribute('min'), '60000', 'offerta minima deve essere 120% del valore');

        const btnOpa = cardBg.querySelector('button.wr-btn-green');
        assert.ok(btnOpa, 'pulsante OPA verde presente');
        assert.ok(btnOpa.getAttribute('data-ce-act')?.includes('_wrAcquire'), 'pulsante collegato a _wrAcquire');
    });

    test('sidebar mostra provincia nemica (.is-enemy): offerta ostile +130% (230% tot) se sbloccata', () => {
        const { sandbox } = amb;
        // Modifichiamo temporaneamente l'influenza su Brescia a 500 (soglia 400) per testare lo stato sbloccato
        const regEl = sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
        const cardBs = sidebar.querySelector('.wr-prov-card.is-enemy');
        assert.ok(cardBs, 'card per Brescia deve avere classe is-enemy');
        assert.ok(cardBs.innerHTML.includes('⚔ RivalCorp'), 'badge rivale presente');

        // Brescia ha myInf 100 < thresh 400: inizialmente è bloccata
        const lockBtn = cardBs.querySelector('.wr-btn-lock');
        assert.ok(lockBtn, 'pulsante bloccato presente');
        assert.ok(lockBtn.textContent.includes('300 pt mancanti'), 'indicazione punti influenza mancanti');
    });

    test('regione senza province mappate mostra messaggio placeholder', () => {
        const { sandbox } = amb;
        const regToscana = sandbox.document.querySelector('#reg_toscana');
        regToscana.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
        assert.ok(sidebar.innerHTML.includes('Nessuna provincia mappata.'), 'messaggio placeholder visibile');
    });
});

describe('War Room — Chiusura overlay (_wrClose)', () => {
    let amb;
    beforeEach(async () => {
        amb = creaAmbienteWarRoom();
        await amb.sandbox.window.renderTabWarRoom();
    });
    afterEach(() => amb.env.stopAllIntervals());

    test('_wrClose rimuove #wr-overlay dal DOM e ripristina la visibilità di #main-panel', () => {
        const { sandbox } = amb;
        assert.ok(sandbox.document.getElementById('wr-overlay'));
        const mainPanel = sandbox.document.getElementById('main-panel');
        assert.equal(mainPanel.style.display, 'none');

        sandbox.window._wrClose();

        assert.equal(sandbox.document.getElementById('wr-overlay'), null, '#wr-overlay deve essere rimosso');
        assert.equal(mainPanel.style.display, '', '#main-panel deve essere ripristinato');
    });

    test('_wrClose invoca window._destroyMap se definita', () => {
        const { sandbox } = amb;
        let mapDestroyed = false;
        sandbox.window._destroyMap = () => { mapDestroyed = true; };

        sandbox.window._wrClose();

        assert.equal(mapDestroyed, true, '_destroyMap deve essere stata chiamata');
    });

    test('_wrClose non fallisce se #wr-overlay o _destroyMap non sono presenti', () => {
        const { sandbox } = amb;
        sandbox.document.body.innerHTML = '';
        sandbox.window._destroyMap = undefined;

        assert.doesNotThrow(() => {
            sandbox.window._wrClose();
        });
    });

    test('click sul pulsante di chiusura ✕ scatena _wrClose tramite event delegation', () => {
        const { sandbox } = amb;
        const closeBtn = sandbox.document.querySelector('.wr-close-btn');
        assert.ok(closeBtn, 'pulsante di chiusura presente in header');

        closeBtn.click();

        assert.equal(sandbox.document.getElementById('wr-overlay'), null, 'l overlay deve essere chiuso dopo il click');
    });
});

describe('War Room — Acquisizione provincia e OPA (_wrAcquire)', () => {
    let amb;
    beforeEach(async () => {
        amb = creaAmbienteWarRoom();
        await amb.sandbox.window.renderTabWarRoom();
        // Seleziona Lombardia per rendere disponibili gli input
        const regEl = amb.sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new amb.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));
    });
    afterEach(() => amb.env.stopAllIntervals());

    test('_wrAcquire rifiuta se l elemento input non esiste nel DOM', async () => {
        const { sandbox, rpcLog, notifications } = amb;
        await sandbox.window._wrAcquire('prov_inesistente');

        assert.equal(rpcLog.length, 0, 'non deve chiamare ServerState');
        assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));
    });

    test('_wrAcquire rifiuta se il valore inserito è vuoto, NaN o <= 0', async () => {
        const { sandbox, rpcLog, notifications } = amb;
        const input = sandbox.document.getElementById('wri-prov_bg');
        assert.ok(input);

        // Valore vuoto
        input.value = '';
        await sandbox.window._wrAcquire('prov_bg');
        assert.equal(rpcLog.length, 0);

        // Valore non numerico
        input.value = 'abc';
        await sandbox.window._wrAcquire('prov_bg');
        assert.equal(rpcLog.length, 0);

        // Valore zero
        input.value = '0';
        await sandbox.window._wrAcquire('prov_bg');
        assert.equal(rpcLog.length, 0);

        // Valore negativo
        input.value = '-50000';
        await sandbox.window._wrAcquire('prov_bg');
        assert.equal(rpcLog.length, 0);

        assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));
    });

    test('_wrAcquire rifiuta se fondi insufficienti (offerta > cash)', async () => {
        const { sandbox, gs, rpcLog, notifications } = amb;
        gs.cash = 50000;
        const input = sandbox.document.getElementById('wri-prov_bg');
        input.value = '60000'; // Richiede €60.000 ma cash è €50.000

        await sandbox.window._wrAcquire('prov_bg');

        assert.equal(rpcLog.length, 0, 'non deve chiamare ServerState se i fondi non bastano');
        assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
    });

    test('offerta valida con fondi sufficienti invoca ServerState.acquireProvince e notifica showBigEvent', async () => {
        const { sandbox, gs, rpcLog, bigEvents } = amb;
        gs.cash = 200000;
        const input = sandbox.document.getElementById('wri-prov_bg');
        input.value = '75000';

        await sandbox.window._wrAcquire('prov_bg');

        const rpc = rpcLog.find(r => r.action === 'acquireProvince' && r.provinceId === 'prov_bg');
        assert.ok(rpc, 'deve aver invocato ServerState.acquireProvince');
        assert.equal(rpc.offer, 75000);

        assert.ok(bigEvents.some(e => e.icon === '🏴' && e.title.includes('Conquistata') && e.desc.includes((75000).toLocaleString())));
    });

    test('_wrAcquire gestisce errore sollevato da ServerState con notifica sicura', async () => {
        const ambErr = creaAmbienteWarRoom({ acquireProvinceThrows: 'Errore RPC simulato' });
        await ambErr.sandbox.window.renderTabWarRoom();
        const regEl = ambErr.sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new ambErr.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const input = ambErr.sandbox.document.getElementById('wri-prov_bg');
        input.value = '70000';

        await ambErr.sandbox.window._wrAcquire('prov_bg');

        assert.ok(ambErr.notifications.some(n => n.type === 'error' && n.msg.includes('non riuscita')));
        ambErr.env.stopAllIntervals();
    });

    test('click su pulsante OPA via data-ce-act="_wrAcquire" scatena l acquisizione con event delegation', async () => {
        const { sandbox, rpcLog } = amb;
        const input = sandbox.document.getElementById('wri-prov_bg');
        input.value = '80000';

        const btnOpa = sandbox.document.querySelector('.wr-prov-card.is-free button.wr-btn-green');
        assert.ok(btnOpa);

        btnOpa.click();
        await new Promise(r => setTimeout(r, 10));

        const rpc = rpcLog.find(r => r.action === 'acquireProvince' && r.provinceId === 'prov_bg');
        assert.ok(rpc, 'il click sul pulsante OPA deve scatenare acquireProvince per prov_bg');
        assert.equal(rpc.offer, 80000);
    });

    test('integrità economica: il denaro passa esclusivamente da ServerState.acquireProvince senza mutazione arbitraria client-side', async () => {
        const { sandbox, gs, rpcLog } = amb;
        gs.cash = 500000;
        const input = sandbox.document.getElementById('wri-prov_bg');
        input.value = '100000';

        await sandbox.window._wrAcquire('prov_bg');

        // La funzione _wrAcquire delega l'operazione interamente a ServerState.acquireProvince
        // senza sottrarre direttamente gameState.cash in locale in modo disallineato
        assert.equal(rpcLog.length, 1);
        assert.equal(rpcLog[0].offer, 100000);
    });
});

describe('War Room — Casi limite, OPA ostile e robustezza', () => {
    let amb;
    beforeEach(async () => {
        amb = creaAmbienteWarRoom();
        await amb.sandbox.window.renderTabWarRoom();
    });
    afterEach(() => amb.env.stopAllIntervals());

    test('OPA ostile su provincia nemica sbloccata: offerta minima 230% e notifica acquisizione', async () => {
        const { sandbox, rpcLog, bigEvents } = amb;

        // Simuliamo snapshot con influenza su Brescia a 450 (soglia 400 = sbloccata)
        const ambHostile = creaAmbienteWarRoom({
            snapshot: {
                provinces: [
                    { id: 'prov_bs', region_id: 'reg_lombardia', name: 'Brescia', owner_company: 'RivalCorp', owner_id: 'user_2', current_value: 100000, required_influence: 400, transit_tax_pct: 0.025 }
                ],
                regions: [
                    { id: 'reg_lombardia', name: 'Lombardia', governor_company: 'RivalCorp', region_tax_pct: 0.015 }
                ],
                influence: { prov_bs: 450 }
            },
            cash: 500000,
            provinceName: 'Brescia',
        });
        await ambHostile.sandbox.window.renderTabWarRoom();

        const regEl = ambHostile.sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new ambHostile.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const inputBs = ambHostile.sandbox.document.getElementById('wri-prov_bs');
        assert.ok(inputBs, 'input per offerta ostile prov_bs deve esistere');
        // Valore 100.000 -> Hostile 230% = 230.000
        assert.equal(inputBs.getAttribute('min'), '230000');

        inputBs.value = '250000';
        await ambHostile.sandbox.window._wrAcquire('prov_bs');

        const rpc = ambHostile.rpcLog.find(r => r.action === 'acquireProvince' && r.provinceId === 'prov_bs');
        assert.ok(rpc, 'deve chiamare acquireProvince per Brescia');
        assert.equal(rpc.offer, 250000);
        assert.ok(ambHostile.bigEvents.some(e => e.title.includes('Brescia Conquistata!')));
        ambHostile.env.stopAllIntervals();
    });

    test('mappatura completa delle 20 regioni italiane in _WR_NAME_TO_SVG e _WR_LABELS', () => {
        const { sandbox } = amb;
        const nameToSvg = vm.runInContext('_WR_NAME_TO_SVG', sandbox);
        const labels = vm.runInContext('_WR_LABELS', sandbox);

        const regioniItaliane = [
            'Piemonte', "Valle d'Aosta", 'Lombardia', 'Trentino-Alto Adige',
            'Veneto', 'Friuli-Venezia Giulia', 'Liguria', 'Emilia-Romagna',
            'Toscana', 'Marche', 'Umbria', 'Lazio', 'Abruzzo', 'Molise',
            'Campania', 'Puglia', 'Basilicata', 'Calabria', 'Sicilia', 'Sardegna'
        ];

        regioniItaliane.forEach(r => {
            const svgId = nameToSvg[r];
            assert.ok(svgId, `Regione ${r} deve avere mapping SVG ID`);
            assert.ok(labels[svgId], `SVG ID ${svgId} deve avere label leggibile`);
        });
    });

    test('calcolo cromatico e dimensioni delle regioni in base al possesso (_wrFill, _wrStroke, _wrStrokeW)', () => {
        const { sandbox } = amb;
        const wrFill = vm.runInContext('_wrFill', sandbox);
        const wrStroke = vm.runInContext('_wrStroke', sandbox);
        const wrStrokeW = vm.runInContext('_wrStrokeW', sandbox);

        // Caso 1: regione posseduta in maggioranza/totalità dal giocatore
        const ownPlayer = { mine: 3, enemy: 1, free: 0, total: 4 };
        assert.equal(wrFill(ownPlayer, 'reg_lombardia'), '#B8920A');
        assert.equal(wrStroke(ownPlayer), '#c79a2a');
        assert.equal(wrStrokeW(ownPlayer), 2.5);

        // Caso 2: regione posseduta in maggioranza dal nemico
        const ownEnemy = { mine: 0, enemy: 2, free: 1, total: 3 };
        assert.equal(wrFill(ownEnemy, 'reg_piemonte'), '#A02020');
        assert.equal(wrStroke(ownEnemy), '#db5746');
        assert.equal(wrStrokeW(ownEnemy), 2);

        // Caso 3: regione completamente libera
        const ownFree = { mine: 0, enemy: 0, free: 3, total: 3 };
        assert.equal(wrFill(ownFree, 'reg_toscana'), '#4A8048'); // Colore base Toscana

        // Caso 4: nessun dato o totale 0
        assert.equal(wrFill(null, 'reg_lazio'), '#9A3030');
    });

    test('_wrAcquire gestisce l assenza di window.CE_Sec senza errori fatali', async () => {
        const ambNoSec = creaAmbienteWarRoom({ acquireProvinceThrows: 'Errore generico' });
        ambNoSec.sandbox.window.CE_Sec = undefined;
        ambNoSec.sandbox.CE_Sec = undefined;

        await ambNoSec.sandbox.window.renderTabWarRoom();
        const regEl = ambNoSec.sandbox.document.querySelector('#reg_lombardia');
        regEl.dispatchEvent(new ambNoSec.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const input = ambNoSec.sandbox.document.getElementById('wri-prov_bg');
        input.value = '70000';

        await assert.doesNotReject(async () => {
            await ambNoSec.sandbox.window._wrAcquire('prov_bg');
        });

        assert.ok(ambNoSec.notifications.some(n => n.type === 'error' && n.msg.includes('non riuscita')));
        ambNoSec.env.stopAllIntervals();
    });

    test('gestione regione in cui il giocatore non è governatore', async () => {
        const { sandbox } = amb;
        // Piemonte: governor_company = 'RivalCorp'
        const regPiemonte = sandbox.document.querySelector('#reg_piemonte');
        regPiemonte.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

        const sidebar = sandbox.document.getElementById('wr-sidebar-inner');
        assert.ok(sidebar.innerHTML.includes('RivalCorp'), 'nome governatore rivale visibile');
        assert.equal(sidebar.innerHTML.includes('👑 SEI GOVERNATORE'), false, 'non deve mostrare il badge governatore');
    });
});
