'use strict';
/* ============================================================================
   test/funzioni/politica-warroom.test.js — Verifica modulo War Room (war_room.js)

   Scopo: verificare che tutte le azioni, routine e trasformazioni esposte da `war_room.js`
   (window.renderTabWarRoom, window._wrClose, window._wrAcquire, funzioni ausiliarie
   e deleghe data-ce-act):
   - eseguano correttamente le operazioni previste;
   - gestiscano proiezioni, geometrie GeoJSON e attributi grafici;
   - rifiutino i casi non validi o non conformi (input errati, fondi insufficienti);
   - instradino le transazioni economiche tramite la porta autoritativa ServerState.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const GEO_SAMPLE = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { reg_name: 'Lazio' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[12.0, 41.5], [13.0, 41.5], [13.0, 42.5], [12.0, 42.5], [12.0, 41.5]]]
            }
        },
        {
            type: 'Feature',
            properties: { DEN_REG: 'Lombardia' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[9.0, 45.0], [10.5, 45.0], [10.5, 46.0], [9.0, 46.0], [9.0, 45.0]]]
            }
        },
        {
            type: 'Feature',
            properties: { NAME_1: 'Trentino-Alto Adige / Südtirol' },
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    [[[11.0, 46.0], [12.0, 46.0], [12.0, 47.0], [11.0, 47.0], [11.0, 46.0]]],
                    [[[11.2, 46.2], [11.8, 46.2], [11.8, 46.8], [11.2, 46.8], [11.2, 46.2]]]
                ]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Piemonte' },
            geometry: {
                type: 'MultiPolygon',
                coordinates: [[[[7.5, 44.5], [8.5, 44.5], [8.5, 45.5], [7.5, 45.5], [7.5, 44.5]]]]
            }
        }
    ]
};

function creaAmbienteWarRoom(opzioni = {}) {
    const acquireCalls = [];
    const bigEvents = [];

    const snapshotDefault = {
        provinces: [
            { id: 'prov_roma', name: 'Roma Capitale', region_id: 'reg_lazio', owner_id: 'usr_player', owner_company: 'PlayerCorp', transit_tax_pct: 0.05, current_value: 100000, required_influence: 500 },
            { id: 'prov_latina', name: 'Latina', region_id: 'reg_lazio', owner_id: null, owner_company: null, transit_tax_pct: 0.03, current_value: 50000, required_influence: 300 },
            { id: 'prov_frosinone', name: 'Frosinone', region_id: 'reg_lazio', owner_id: 'usr_rival', owner_company: 'RivalCorp', transit_tax_pct: 0.02, current_value: 60000, required_influence: 400 },
            { id: 'prov_milano', name: 'Milano Business', region_id: 'reg_lombardia', owner_id: 'usr_rival', owner_company: 'RivalCorp', transit_tax_pct: 0.04, current_value: 150000, required_influence: 600 },
            { id: 'prov_tn', name: 'Trento Centro', region_id: 'reg_trentino', owner_id: 'usr_player', owner_company: 'PlayerCorp', transit_tax_pct: 0.03, current_value: 80000, required_influence: 300 }
        ],
        regions: [
            { id: 'reg_lazio', name: 'Lazio', governor_company: 'PlayerCorp', region_tax_pct: 0.02 },
            { id: 'reg_lombardia', name: 'Lombardia', governor_company: 'RivalCorp', region_tax_pct: 0.015 },
            { id: 'reg_trentino', name: 'Trentino-Alto Adige', governor_company: 'PlayerCorp', region_tax_pct: 0.02 },
            { id: 'reg_piemonte', name: 'Piemonte', governor_company: null, region_tax_pct: 0.01 }
        ],
        influence: {
            prov_roma: 800,
            prov_latina: 400,
            prov_frosinone: 100, // < 400: bloccata
            prov_milano: 700,
            prov_tn: 500
        }
    };

    let snapshotData = opzioni.snapshot !== undefined ? opzioni.snapshot : JSON.parse(JSON.stringify(snapshotDefault));

    const files = [...CORE_FILES, 'war_room.js'];
    const env = createGameEnv(files, {
        render: true,
        serverState: {
            getTerritorySnapshot: async () => {
                if (opzioni.snapshotError) throw new Error('DB territory snapshot error');
                return snapshotData;
            },
            acquireProvince: async (provinceId, offer) => {
                acquireCalls.push({ provinceId, offer });
                if (opzioni.acquireError) throw new Error('RPC acquire failed');
                if (opzioni.acquireResult) return opzioni.acquireResult;
                const prov = snapshotData?.provinces?.find(p => p.id === provinceId);
                if (prov) {
                    prov.owner_id = 'usr_player';
                    prov.owner_company = 'PlayerCorp';
                }
                return { success: true, province_name: prov ? prov.name : provinceId, offer };
            },
            ...opzioni.serverStateOverrides
        }
    });

    env.sandbox.initGame(true);
    env.stopAllIntervals();

    // Mock fetch per GeoJSON
    env.sandbox.fetch = async (url) => {
        if (opzioni.geoFetchError) {
            return { ok: false, status: 500, json: async () => ({}) };
        }
        return {
            ok: true,
            status: 200,
            json: async () => (opzioni.geoData !== undefined ? opzioni.geoData : GEO_SAMPLE)
        };
    };

    env.sandbox.showBigEvent = (icon, title, desc) => {
        bigEvents.push({ icon, title, desc });
    };

    env.sandbox.gameState.companyName = opzioni.companyName || 'PlayerCorp';
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 500000;

    // Predisponi DOM standard
    env.sandbox.document.body.innerHTML = '<div id="main-panel"></div><div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        notifications: env.notifications,
        bigEvents,
        acquireCalls,
        snapshotData
    };
}

describe('War Room (war_room.js) — Mappa geopolitica e OPA province', () => {

    describe('1. Esportazioni globali e costanti di configurazione', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('esporta su window le funzioni pubbliche: renderTabWarRoom, _wrClose, _wrAcquire', () => {
            const { sandbox } = amb;
            assert.equal(typeof sandbox.window.renderTabWarRoom, 'function', 'renderTabWarRoom deve essere esportata');
            assert.equal(typeof sandbox.window._wrClose, 'function', '_wrClose deve essere esportata');
            assert.equal(typeof sandbox.window._wrAcquire, 'function', '_wrAcquire deve essere esportata');
        });

        test('mappatura delle 20 regioni italiane in _WR_NAME_TO_SVG, _WR_LABELS e _WR_BASE', () => {
            const { sandbox } = amb;
            const nameToSvg = vm.runInContext('_WR_NAME_TO_SVG', sandbox);
            const labels = vm.runInContext('_WR_LABELS', sandbox);
            const baseColors = vm.runInContext('_WR_BASE', sandbox);

            assert.equal(nameToSvg['Lazio'], 'reg_lazio');
            assert.equal(nameToSvg['Lombardia'], 'reg_lombardia');
            assert.equal(nameToSvg['Piemonte'], 'reg_piemonte');
            assert.equal(nameToSvg['Sicilia'], 'reg_sicilia');
            assert.equal(nameToSvg['Sardegna'], 'reg_sardegna');
            assert.equal(nameToSvg['Trentino-Alto Adige'], 'reg_trentino');
            assert.equal(nameToSvg['Friuli-Venezia Giulia'], 'reg_fvg');
            assert.equal(nameToSvg["Valle d'Aosta"], 'reg_vda');

            assert.equal(labels['reg_lazio'], 'Lazio');
            assert.equal(labels['reg_vda'], "Valle d'Aosta");
            assert.equal(labels['reg_trentino'], 'Trentino A.A.');
            assert.ok(baseColors['reg_lazio'], 'colore base Lazio presente');
        });
    });

    describe('2. Funzioni ausiliarie di proiezione, colore e identificazione', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_wrProject proietta coordinate lon/lat in coordinate x/y nel viewport 500x660', () => {
            const { sandbox } = amb;
            const project = vm.runInContext('_wrProject', sandbox);
            const [x1, y1] = project(12.5, 41.9); // Roma
            assert.ok(x1 > 0 && x1 < 500, 'x deve rientrare nel viewport');
            assert.ok(y1 > 0 && y1 < 660, 'y deve rientrare nel viewport');

            const [xNorth, yNorth] = project(12.5, 46.0);
            assert.ok(yNorth < y1, 'latitudine maggiore (Nord) corrisponde a y minore');
        });

        test('_wrGetSvgId estrae correttamente l ID SVG da vari formati di proprietà GeoJSON', () => {
            const { sandbox } = amb;
            const getSvgId = vm.runInContext('_wrGetSvgId', sandbox);

            assert.equal(getSvgId({ reg_name: 'Lazio' }), 'reg_lazio');
            assert.equal(getSvgId({ DEN_REG: 'Lombardia' }), 'reg_lombardia');
            assert.equal(getSvgId({ NAME_1: 'Trentino-Alto Adige / Südtirol' }), 'reg_trentino');
            assert.equal(getSvgId({ name: 'Piemonte' }), 'reg_piemonte');
            assert.equal(getSvgId({ unknown: 'Inesistente' }), null);
        });

        test('_wrFill, _wrStroke e _wrStrokeW calcolano i colori e bordi corretti per possesso', () => {
            const { sandbox } = amb;
            const fill = vm.runInContext('_wrFill', sandbox);
            const stroke = vm.runInContext('_wrStroke', sandbox);
            const strokeW = vm.runInContext('_wrStrokeW', sandbox);

            // Mio (mine > 0 && mine >= enemy) -> oro (#B8920A)
            assert.equal(fill({ mine: 2, enemy: 1, free: 0, total: 3 }, 'reg_lazio'), '#B8920A');
            assert.equal(stroke({ mine: 2, enemy: 1, free: 0, total: 3 }), '#c79a2a');
            assert.equal(strokeW({ mine: 2, enemy: 1, free: 0, total: 3 }), 2.5);

            // Nemico (enemy > 0 && enemy > mine) -> rosso (#A02020)
            assert.equal(fill({ mine: 0, enemy: 2, free: 1, total: 3 }, 'reg_lazio'), '#A02020');
            assert.equal(stroke({ mine: 0, enemy: 2, free: 1, total: 3 }), '#db5746');
            assert.equal(strokeW({ mine: 0, enemy: 2, free: 1, total: 3 }), 2);

            // Libero o Neutro
            const neutralBase = vm.runInContext('_WR_BASE.reg_lazio', sandbox);
            assert.equal(fill({ mine: 0, enemy: 0, free: 3, total: 3 }, 'reg_lazio'), neutralBase);
            assert.equal(fill({ mine: 0, enemy: 0, free: 0, total: 0 }, 'reg_lazio'), neutralBase);
            assert.equal(strokeW({ mine: 0, enemy: 0, free: 3, total: 3 }), 0.8);
        });

        test('_wrFeatureToPath e _wrFeatureCentroid calcolano path SVG e baricentro per Polygon e MultiPolygon', () => {
            const { sandbox } = amb;
            const featToPath = vm.runInContext('_wrFeatureToPath', sandbox);
            const featCentroid = vm.runInContext('_wrFeatureCentroid', sandbox);

            // Polygon
            const polyFeat = GEO_SAMPLE.features[0];
            const polyPath = featToPath(polyFeat);
            assert.ok(polyPath.startsWith('M') && polyPath.endsWith('Z'), 'path polygon valido');
            const polyCentroid = featCentroid(polyFeat);
            assert.equal(polyCentroid.length, 2);

            // MultiPolygon
            const multiFeat = GEO_SAMPLE.features[2];
            const multiPath = featToPath(multiFeat);
            assert.ok(multiPath.includes('M') && multiPath.includes('Z'), 'path multipolygon valido');
            const multiCentroid = featCentroid(multiFeat);
            assert.equal(multiCentroid.length, 2);
        });
    });

    describe('3. Apertura e Rendering della War Room (renderTabWarRoom)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabWarRoom crea #wr-overlay, inietta gli stili e nasconde #main-panel', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay, 'overlay #wr-overlay deve essere creato');

            const style = sandbox.document.getElementById('wr-style');
            assert.ok(style, 'tag #wr-style deve essere iniettato in head');

            const mainPanel = sandbox.document.getElementById('main-panel');
            assert.equal(mainPanel.style.display, 'none', '#main-panel deve essere nascosto');

            const tabContainer = sandbox.document.getElementById('tab-container');
            assert.equal(tabContainer.innerHTML, '', '#tab-container deve essere svuotato');
        });

        test('renderTabWarRoom con GeoJSON genera SVG con regioni, titoli e conteggio province possedute', async () => {
            const { sandbox } = amb;
            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            const html = overlay.innerHTML;

            assert.ok(html.includes('WAR ROOM'), 'titolo WAR ROOM presente');
            assert.ok(html.includes('2</span>') && html.includes('province'), 'conteggio province possedute (Roma + Trento = 2)');

            const svg = overlay.querySelector('svg');
            assert.ok(svg, 'mappa SVG deve essere generata');

            const lazioRegion = svg.querySelector('#reg_lazio');
            assert.ok(lazioRegion, 'regione Lazio presente nel SVG');
            assert.equal(lazioRegion.getAttribute('data-id'), 'reg_lazio');

            // Badge stella (★) per controllo 100% in Trentino (1 su 1)
            const trentinoRegion = svg.querySelector('#reg_trentino');
            assert.ok(trentinoRegion, 'regione Trentino presente nel SVG');
            assert.ok(trentinoRegion.innerHTML.includes('★'), 'Trentino al 100% posseduto deve avere il badge stella ★');
        });

        test('renderTabWarRoom in caso di errore GeoJSON mostra fallback di errore senza bloccare la UI', async () => {
            const ambOffline = creaAmbienteWarRoom({ geoFetchError: true });
            await ambOffline.sandbox.renderTabWarRoom();

            const overlay = ambOffline.sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay.innerHTML.includes('Impossibile caricare la mappa geografica'));
            ambOffline.env.stopAllIntervals();
        });

        test('renderTabWarRoom in caso di snapshot offline mostra badge offline', async () => {
            const ambSnapErr = creaAmbienteWarRoom({ snapshotError: true });
            await ambSnapErr.sandbox.renderTabWarRoom();

            const overlay = ambSnapErr.sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay.innerHTML.includes('offline'), 'badge offline visibile');
            ambSnapErr.env.stopAllIntervals();
        });
    });

    describe('4. Selezione regioni e dettaglio province nella Sidebar', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteWarRoom();
            await amb.sandbox.renderTabWarRoom();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su una regione (.wr-region) attiva la classe .wr-sel e mostra la sidebar con le province', () => {
            const { sandbox } = amb;
            const lazioEl = sandbox.document.querySelector('#reg_lazio');
            assert.ok(lazioEl, 'elemento reg_lazio deve esistere nel SVG');

            // Simula click su regione Lazio
            lazioEl.dispatchEvent(new sandbox.document.defaultView.Event('click'));

            assert.ok(lazioEl.classList.contains('wr-sel'), 'regione selezionata deve avere classe .wr-sel');

            const inner = sandbox.document.getElementById('wr-sidebar-inner');
            const sidebarHtml = inner.innerHTML;

            assert.ok(sidebarHtml.includes('Lazio'), 'nome regione presente nella sidebar');
            assert.ok(sidebarHtml.includes('👑 SEI GOVERNATORE'), 'governatore player indicato');

            // Provincia posseduta: Roma
            assert.ok(sidebarHtml.includes('Roma Capitale'), 'Roma presente');
            assert.ok(sidebarHtml.includes('✦ Tua'), 'Roma etichettata come Tua');
            assert.ok(sidebarHtml.includes('Incassi il 5.0% + 2.0% (Gov)'), 'dettaglio incasso tasse');

            // Provincia libera: Latina (influenza 400 >= 300 required)
            assert.ok(sidebarHtml.includes('Latina'), 'Latina presente');
            assert.ok(sidebarHtml.includes('◎ Libera'), 'Latina etichettata come Libera');
            assert.ok(sidebarHtml.includes('id="wri-prov_latina"'), 'input offerta Latina presente');
            assert.ok(sidebarHtml.includes('data-ce-act="_wrAcquire"'), 'pulsante OPA presente');

            // Provincia bloccata: Frosinone (influenza 100 < 400 required)
            assert.ok(sidebarHtml.includes('Frosinone'), 'Frosinone presente');
            assert.ok(sidebarHtml.includes('🔒 300 pt mancanti'), 'Frosinone bloccata con pt mancanti');
        });

        test('selezione regione con provincia nemica sbloccata mostra OPA Ostile', () => {
            const { sandbox } = amb;
            const lombardiaEl = sandbox.document.querySelector('#reg_lombardia');
            assert.ok(lombardiaEl);

            lombardiaEl.dispatchEvent(new sandbox.document.defaultView.Event('click'));

            const inner = sandbox.document.getElementById('wr-sidebar-inner');
            const html = inner.innerHTML;

            assert.ok(html.includes('Milano Business'));
            assert.ok(html.includes('⚔ RivalCorp'));
            assert.ok(html.includes('⚔ Ostile'), 'pulsante OPA Ostile visibile per provincia nemica');
            assert.ok(html.includes('id="wri-prov_milano"'));
        });

        test('selezione regione senza province mostra messaggio vuoto', () => {
            const { sandbox } = amb;
            const piemonteEl = sandbox.document.querySelector('#reg_piemonte');
            assert.ok(piemonteEl);

            piemonteEl.dispatchEvent(new sandbox.document.defaultView.Event('click'));

            const inner = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(inner.innerHTML.includes('Nessuna provincia mappata'));
        });
    });

    describe('5. Chiusura della War Room (_wrClose)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteWarRoom();
            await amb.sandbox.renderTabWarRoom();
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('_wrClose rimuove #wr-overlay, ripristina #main-panel e chiama _destroyMap se presente', () => {
            const { sandbox } = amb;
            let destroyMapCalled = false;
            sandbox.window._destroyMap = () => { destroyMapCalled = true; };

            sandbox._wrClose();

            assert.equal(sandbox.document.getElementById('wr-overlay'), null, '#wr-overlay deve essere rimosso');
            assert.equal(sandbox.document.getElementById('main-panel').style.display, '', '#main-panel deve tornare visibile');
            assert.equal(destroyMapCalled, true, '_destroyMap deve essere invocata');
        });

        test('click sul pulsante chiusura (data-ce-act="_wrClose") chiude l overlay tramite events.js', () => {
            const { sandbox } = amb;
            const closeBtn = sandbox.document.querySelector('.wr-close-btn');
            assert.ok(closeBtn, 'pulsante chiusura presente');

            closeBtn.click();

            assert.equal(sandbox.document.getElementById('wr-overlay'), null, 'click su pulsante deve rimuovere overlay');
        });
    });

    describe('6. Acquisizione Provincia / OPA (_wrAcquire)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteWarRoom();
            await amb.sandbox.renderTabWarRoom();
            // Seleziona Lazio per avere gli input nel DOM
            const lazioEl = amb.sandbox.document.querySelector('#reg_lazio');
            lazioEl.dispatchEvent(new amb.sandbox.document.defaultView.Event('click'));
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('rifiuta se l input non esiste o è vuoto', async () => {
            const { sandbox, notifications, acquireCalls } = amb;

            await sandbox._wrAcquire('prov_inesistente');

            assert.equal(acquireCalls.length, 0, 'non deve chiamare ServerState.acquireProvince');
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));
        });

        test('rifiuta se l offerta è zero o negativa', async () => {
            const { sandbox, notifications, acquireCalls } = amb;
            const input = sandbox.document.getElementById('wri-prov_latina');
            assert.ok(input);

            input.value = '0';
            await sandbox._wrAcquire('prov_latina');
            assert.equal(acquireCalls.length, 0);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));

            input.value = '-50000';
            await sandbox._wrAcquire('prov_latina');
            assert.equal(acquireCalls.length, 0);
        });

        test('rifiuta se i fondi in cassa sono insufficienti (cassa < offerta)', async () => {
            const { sandbox, gs, notifications, acquireCalls } = amb;
            gs.cash = 30000;
            const input = sandbox.document.getElementById('wri-prov_latina');
            input.value = '60000';

            await sandbox._wrAcquire('prov_latina');

            assert.equal(acquireCalls.length, 0);
            assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('acquisizione con successo invoca ServerState.acquireProvince, emette showBigEvent e ri-renderizza', async () => {
            const { sandbox, acquireCalls, bigEvents } = amb;
            const input = sandbox.document.getElementById('wri-prov_latina');
            input.value = '70000';

            await sandbox._wrAcquire('prov_latina');

            assert.equal(acquireCalls.length, 1);
            assert.equal(acquireCalls[0].provinceId, 'prov_latina');
            assert.equal(acquireCalls[0].offer, 70000);

            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].icon, '🏴');
            assert.ok(bigEvents[0].title.includes('Conquistata'));
            assert.ok(bigEvents[0].desc.includes((70000).toLocaleString()));
        });

        test('gestione errore RPC cattura l eccezione e mostra notifica di errore', async () => {
            const ambErr = creaAmbienteWarRoom({ acquireError: true });
            await ambErr.sandbox.renderTabWarRoom();
            const lazioEl = ambErr.sandbox.document.querySelector('#reg_lazio');
            lazioEl.dispatchEvent(new ambErr.sandbox.document.defaultView.Event('click'));

            const input = ambErr.sandbox.document.getElementById('wri-prov_latina');
            input.value = '80000';

            await assert.doesNotReject(async () => {
                await ambErr.sandbox._wrAcquire('prov_latina');
            });

            assert.ok(ambErr.notifications.some(n => n.type === 'error' && n.msg.includes('non riuscita')));
            ambErr.env.stopAllIntervals();
        });

        test('gestione errore senza crash anche in assenza di CE_Sec', async () => {
            const ambNoSec = creaAmbienteWarRoom({ acquireError: true });
            ambNoSec.sandbox.window.CE_Sec = undefined;
            ambNoSec.sandbox.CE_Sec = undefined;

            await ambNoSec.sandbox.renderTabWarRoom();
            const lazioEl = ambNoSec.sandbox.document.querySelector('#reg_lazio');
            lazioEl.dispatchEvent(new ambNoSec.sandbox.document.defaultView.Event('click'));

            const input = ambNoSec.sandbox.document.getElementById('wri-prov_latina');
            input.value = '80000';

            await assert.doesNotReject(async () => {
                await ambNoSec.sandbox._wrAcquire('prov_latina');
            });

            assert.ok(ambNoSec.notifications.some(n => n.type === 'error'));
            ambNoSec.env.stopAllIntervals();
        });
    });

    describe('7. Interazione UI completa con Event Delegation (events.js)', () => {
        let amb;
        beforeEach(async () => {
            amb = creaAmbienteWarRoom();
            await amb.sandbox.renderTabWarRoom();
            const lazioEl = amb.sandbox.document.querySelector('#reg_lazio');
            lazioEl.dispatchEvent(new amb.sandbox.document.defaultView.Event('click'));
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('click sul bottone OPA con data-ce-act="_wrAcquire" scatena _wrAcquire', async () => {
            const { sandbox, acquireCalls } = amb;
            const input = sandbox.document.getElementById('wri-prov_latina');
            input.value = '65000';

            const opaBtn = sandbox.document.querySelector(`button[data-ce-act="_wrAcquire"][data-ce-args*="prov_latina"]`);
            assert.ok(opaBtn, 'pulsante OPA per Latina con data-ce-act deve esistere');

            opaBtn.click();
            await new Promise(r => setImmediate(r));

            assert.equal(acquireCalls.length, 1);
            assert.equal(acquireCalls[0].provinceId, 'prov_latina');
            assert.equal(acquireCalls[0].offer, 65000);
        });

        test('click sul bottone OPA Ostile con data-ce-act="_wrAcquire" su provincia nemica scatena _wrAcquire', async () => {
            const { sandbox, acquireCalls } = amb;
            const lombardiaEl = sandbox.document.querySelector('#reg_lombardia');
            lombardiaEl.dispatchEvent(new sandbox.document.defaultView.Event('click'));

            const input = sandbox.document.getElementById('wri-prov_milano');
            input.value = '350000';

            const hostileBtn = sandbox.document.querySelector(`button[data-ce-act="_wrAcquire"][data-ce-args*="prov_milano"]`);
            assert.ok(hostileBtn, 'pulsante Ostile con data-ce-act deve esistere');

            hostileBtn.click();
            await new Promise(r => setImmediate(r));

            assert.equal(acquireCalls.length, 1);
            assert.equal(acquireCalls[0].provinceId, 'prov_milano');
            assert.equal(acquireCalls[0].offer, 350000);
        });
    });
});
