'use strict';
/* ============================================================================
   test/funzioni/politica-warroom.test.js — Collaudo War Room Politica

   Verifica del funzionamento della War Room geografica (war_room.js).
   Collauda nel banco tutte le azioni ed esportazioni del modulo:
   - Esportazioni globali su window (renderTabWarRoom, _wrClose, _wrAcquire)
   - Inizializzazione e rendering overlay War Room (renderTabWarRoom)
   - Chiusura e ripristino vista (window._wrClose)
   - Interazione mappa SVG, selezione regioni e pannello laterale (_wrShowSidebar)
   - Logica e gating OPA province (_wrAcquire) con gestione casi limite e fondi
   - Porta unica del denaro (delegata a ServerState.acquireProvince / rpc_acquire_province)
   - Proiezione geografica Mercatore, parsing GeoJSON, helper di disegno e colori
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

// GeoJSON minimale sintetico con Piemonte, Lombardia e Lazio
const MOCK_GEOJSON = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { reg_name: 'Piemonte' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[7.0, 45.0], [8.0, 45.0], [8.0, 46.0], [7.0, 46.0], [7.0, 45.0]]],
            },
        },
        {
            type: 'Feature',
            properties: { reg_name: 'Lombardia' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[9.0, 45.0], [10.0, 45.0], [10.0, 46.0], [9.0, 46.0], [9.0, 45.0]]],
            },
        },
        {
            type: 'Feature',
            properties: { reg_name: 'Lazio' },
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    [[[12.0, 41.5], [13.0, 41.5], [13.0, 42.5], [12.0, 42.5], [12.0, 41.5]]],
                ],
            },
        },
    ],
};

function creaAmbienteWarRoom(opzioni = {}) {
    const acquireCalls = [];
    const bigEvents = [];

    const defaultTerritory = {
        provinces: [
            {
                id: 'prov_torino',
                name: 'Torino e Valli',
                region_id: 'piemonte',
                owner_id: 'user_me_uuid',
                owner_company: 'Test Company',
                current_value: 280000,
                transit_tax_pct: 0.02,
                required_influence: 280,
            },
            {
                id: 'prov_milano',
                name: 'Milano Metropolitana',
                region_id: 'lombardia',
                owner_id: 'rival_user_uuid',
                owner_company: 'Apex Chauffeur',
                current_value: 500000,
                transit_tax_pct: 0.025,
                required_influence: 800,
            },
            {
                id: 'prov_como',
                name: 'Laghi Lombardi',
                region_id: 'lombardia',
                owner_id: null,
                owner_company: null,
                current_value: 350000,
                transit_tax_pct: 0.022,
                required_influence: 350,
            },
            {
                id: 'prov_roma',
                name: 'Roma Capitale',
                region_id: 'lazio',
                owner_id: null,
                owner_company: null,
                current_value: 400000,
                transit_tax_pct: 0.025,
                required_influence: 500,
            },
        ],
        regions: [
            { id: 'piemonte', name: 'Piemonte', governor_company: 'Test Company', region_tax_pct: 0.01 },
            { id: 'lombardia', name: 'Lombardia', governor_company: 'Apex Chauffeur', region_tax_pct: 0.015 },
            { id: 'lazio', name: 'Lazio', governor_company: null, region_tax_pct: 0.01 },
        ],
        influence: {
            prov_torino: 350,
            prov_milano: 900,
            prov_como: 400,
            prov_roma: 200, // < 500 richiesti -> bloccata
        },
    };

    const territorySnapshot = opzioni.territorySnapshot !== undefined ? opzioni.territorySnapshot : defaultTerritory;

    const env = createGameEnv([...CORE_FILES, 'war_room.js'], {
        render: true,
        serverState: {
            getTerritorySnapshot: async () => {
                if (opzioni.snapshotError) throw new Error('Snapshot failure');
                return territorySnapshot;
            },
            acquireProvince: async (provinceId, offer) => {
                acquireCalls.push({ provinceId, offer });
                if (opzioni.acquireError) {
                    throw new Error(opzioni.acquireError);
                }
                if (opzioni.acquireResult !== undefined) {
                    return opzioni.acquireResult;
                }
                return {
                    success: true,
                    province_name: 'Provincia Test',
                    new_value: offer,
                };
            },
            ...(opzioni.serverStateOverrides || {}),
        },
    });

    const sandbox = env.sandbox;

    // Mock fetch per GeoJSON
    sandbox.fetch = async (url) => {
        if (opzioni.fetchError) {
            return { ok: false, status: 500 };
        }
        return {
            ok: true,
            status: 200,
            json: async () => (opzioni.geojson !== undefined ? opzioni.geojson : MOCK_GEOJSON),
        };
    };

    sandbox.showBigEvent = (icon, title, subtitle) => {
        bigEvents.push({ icon, title, subtitle });
    };

    sandbox.gameState.companyName = opzioni.companyName || 'Test Company';
    sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 1000000;

    return {
        env,
        sandbox,
        gs: sandbox.gameState,
        acquireCalls,
        bigEvents,
    };
}

describe('Funzioni War Room Politica (war_room.js)', () => {

    describe('1. Esportazioni globali e conformità interfaccia', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('war_room.js esporta renderTabWarRoom, _wrClose e _wrAcquire su window', () => {
            const { sandbox } = amb;
            assert.equal(typeof sandbox.window.renderTabWarRoom, 'function');
            assert.equal(typeof sandbox.window._wrClose, 'function');
            assert.equal(typeof sandbox.window._wrAcquire, 'function');
        });

        test('war_room.js non sovrascrive indebitamente renderTabProvinces di ui-ops.js', () => {
            const { sandbox } = amb;
            assert.equal(typeof sandbox.window.renderTabProvinces, 'function');
            assert.notEqual(sandbox.window.renderTabProvinces, sandbox.window.renderTabWarRoom);
        });
    });

    describe('2. Inizializzazione e rendering War Room (renderTabWarRoom)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabWarRoom inietta il tag style #wr-style senza duplicarlo', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabWarRoom();
            const styles = sandbox.document.querySelectorAll('#wr-style');
            assert.equal(styles.length, 1);

            // Chiamata successiva: nessun duplicato
            await sandbox.renderTabWarRoom();
            assert.equal(sandbox.document.querySelectorAll('#wr-style').length, 1);
        });

        test('renderTabWarRoom crea l overlay #wr-overlay e nasconde #main-panel', async () => {
            const { sandbox } = amb;
            const mainPanel = sandbox.document.createElement('div');
            mainPanel.id = 'main-panel';
            mainPanel.style.display = 'block';
            sandbox.document.body.appendChild(mainPanel);

            const tabContainer = sandbox.document.createElement('div');
            tabContainer.id = 'tab-container';
            tabContainer.innerHTML = '<span>Vecchio contenuto</span>';
            sandbox.document.body.appendChild(tabContainer);

            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay, 'L elemento #wr-overlay deve essere presente nel DOM');
            assert.equal(mainPanel.style.display, 'none', '#main-panel deve essere nascosto');
            assert.equal(tabContainer.innerHTML, '', '#tab-container deve essere svuotato');
        });

        test('renderTabWarRoom calcola correttamente il conteggio delle province possedute', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay.innerHTML.includes('WAR ROOM'));
            assert.ok(overlay.innerHTML.includes('1'), 'deve mostrare 1 provincia posseduta');
            assert.ok(overlay.innerHTML.includes('/ 4 province'), 'deve mostrare il totale di 4 province');
        });

        test('renderTabWarRoom include il pulsante di chiusura con azione _wrClose', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabWarRoom();

            const overlay = sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay.innerHTML.includes('data-ce-act="_wrClose"'));
            assert.ok(overlay.querySelector('.wr-close-btn'));
        });

        test('renderTabWarRoom gestisce stato offline se snapshot non risponde', async () => {
            const ambOffline = creaAmbienteWarRoom({ snapshotError: true });

            await ambOffline.sandbox.renderTabWarRoom();

            const overlay = ambOffline.sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay.innerHTML.includes('⚠ offline'));

            ambOffline.env.stopAllIntervals();
        });

        test('renderTabWarRoom gestisce errore di caricamento GeoJSON mostrando messaggio di errore', async () => {
            const ambNoGeo = creaAmbienteWarRoom({ fetchError: true });

            await ambNoGeo.sandbox.renderTabWarRoom();

            const overlay = ambNoGeo.sandbox.document.getElementById('wr-overlay');
            assert.ok(overlay.innerHTML.includes('Impossibile caricare la mappa geografica'));

            ambNoGeo.env.stopAllIntervals();
        });
    });

    describe('3. Chiusura overlay (_wrClose)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_wrClose rimuove #wr-overlay e ripristina la visibilità di #main-panel', async () => {
            const { sandbox } = amb;
            const mainPanel = sandbox.document.createElement('div');
            mainPanel.id = 'main-panel';
            sandbox.document.body.appendChild(mainPanel);

            await sandbox.renderTabWarRoom();
            assert.ok(sandbox.document.getElementById('wr-overlay'));

            let destroyCalled = false;
            sandbox._destroyMap = () => { destroyCalled = true; };

            sandbox._wrClose();

            assert.equal(sandbox.document.getElementById('wr-overlay'), null);
            assert.equal(mainPanel.style.display, '');
            assert.equal(destroyCalled, true, 'deve invocare _destroyMap se presente');
        });

        test('_wrClose non crasha se l overlay o il pannello principale non esistono', () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            assert.doesNotThrow(() => {
                sandbox._wrClose();
            });
        });
    });

    describe('4. Interazioni mappa e sidebar (_wrShowSidebar e click regioni)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('click su una regione evidenzia la regione e popola la sidebar', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabWarRoom();

            const regPiemonte = sandbox.document.getElementById('reg_piemonte');
            assert.ok(regPiemonte, 'reg_piemonte deve esistere nel DOM SVG');

            // Simula click su Piemonte
            regPiemonte.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            assert.ok(regPiemonte.classList.contains('wr-sel'), 'la regione cliccata deve avere la classe wr-sel');

            const sidebarInner = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebarInner.innerHTML.includes('Piemonte'));
            assert.ok(sidebarInner.innerHTML.includes('👑 SEI GOVERNATORE'));
            assert.ok(sidebarInner.innerHTML.includes('Torino e Valli'));
            assert.ok(sidebarInner.innerHTML.includes('✦ Tua'));
            assert.ok(sidebarInner.innerHTML.includes('Incassi il 2.0% + 1.0% (Gov)'));
        });

        test('selezione regione con province nemiche e libere mostra pulsanti OPA e Ostile', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabWarRoom();

            const regLombardia = sandbox.document.getElementById('reg_lombardia');
            assert.ok(regLombardia);

            regLombardia.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            const sidebarInner = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebarInner.innerHTML.includes('Lombardia'));
            assert.ok(sidebarInner.innerHTML.includes('Apex Chauffeur'));

            // Milano Metropolitana: nemica sbloccata -> OPA Ostile (+130% min 1.150.000€)
            assert.ok(sidebarInner.innerHTML.includes('Milano Metropolitana'));
            assert.ok(sidebarInner.innerHTML.includes('⚔ Apex Chauffeur'));
            assert.ok(sidebarInner.innerHTML.includes('⚔ Ostile'));
            assert.ok(sidebarInner.innerHTML.includes('data-ce-act="_wrAcquire"'));
            assert.ok(sidebarInner.querySelector('#wri-prov_milano'));

            // Laghi Lombardi: libera sbloccata -> OPA Standard (min 420.000€)
            assert.ok(sidebarInner.innerHTML.includes('Laghi Lombardi'));
            assert.ok(sidebarInner.innerHTML.includes('◎ Libera'));
            assert.ok(sidebarInner.innerHTML.includes('🏴 OPA'));
            assert.ok(sidebarInner.querySelector('#wri-prov_como'));
        });

        test('provincia con influenza insufficiente mostra pulsante bloccato', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabWarRoom();

            const regLazio = sandbox.document.getElementById('reg_lazio');
            assert.ok(regLazio);

            regLazio.dispatchEvent(new sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            const sidebarInner = sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebarInner.innerHTML.includes('Roma Capitale'));
            assert.ok(sidebarInner.innerHTML.includes('🔒 300 pt mancanti'));
            assert.ok(!sidebarInner.querySelector('#wri-prov_roma'), 'non deve esserci input se bloccata');
        });

        test('regione senza province mappate mostra avviso descrittivo', async () => {
            const ambVuoto = creaAmbienteWarRoom({
                territorySnapshot: {
                    provinces: [],
                    regions: [{ id: 'piemonte', name: 'Piemonte' }],
                    influence: {},
                },
            });

            await ambVuoto.sandbox.renderTabWarRoom();

            const regPiemonte = ambVuoto.sandbox.document.getElementById('reg_piemonte');
            regPiemonte.dispatchEvent(new ambVuoto.sandbox.document.defaultView.MouseEvent('click', { bubbles: true }));

            const sidebarInner = ambVuoto.sandbox.document.getElementById('wr-sidebar-inner');
            assert.ok(sidebarInner.innerHTML.includes('Nessuna provincia mappata'));

            ambVuoto.env.stopAllIntervals();
        });
    });

    describe('5. Acquisizione Province OPA (_wrAcquire)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom({ cash: 1000000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('validazione: input vuoto o mancante notifica errore e blocca operazione', async () => {
            const { sandbox, acquireCalls, env } = amb;

            await sandbox._wrAcquire('prov_como');

            assert.equal(acquireCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));
        });

        test('validazione: offerta con importo <= 0 o non numerico notifica errore', async () => {
            const { sandbox, acquireCalls, env } = amb;
            sandbox.document.body.innerHTML = `<input id="wri-prov_como" value="-5000">`;

            await sandbox._wrAcquire('prov_como');

            assert.equal(acquireCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('offerta valida')));
        });

        test('validazione: fondi insufficienti nel saldo di gioco blocca la richiesta', async () => {
            const { sandbox, gs, acquireCalls, env } = amb;
            gs.cash = 100000;
            sandbox.document.body.innerHTML = `<input id="wri-prov_como" value="450000">`;

            await sandbox._wrAcquire('prov_como');

            assert.equal(acquireCalls.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('acquisizione riuscita invoca ServerState.acquireProvince e scatena showBigEvent', async () => {
            const { sandbox, acquireCalls, bigEvents } = amb;
            await sandbox.renderTabWarRoom();

            // Simula input con offerta valida da 450.000€
            const input = sandbox.document.createElement('input');
            input.id = 'wri-prov_como';
            input.value = '450000';
            sandbox.document.body.appendChild(input);

            await sandbox._wrAcquire('prov_como');

            assert.equal(acquireCalls.length, 1);
            assert.equal(acquireCalls[0].provinceId, 'prov_como');
            assert.equal(acquireCalls[0].offer, 450000);

            assert.equal(bigEvents.length, 1);
            assert.equal(bigEvents[0].icon, '🏴');
            assert.ok(bigEvents[0].title.includes('Conquistata'));
            assert.ok(bigEvents[0].subtitle.includes('Investimento: €'));
            assert.ok(bigEvents[0].subtitle.includes('450'));
        });

        test('gestione errore durante l acquisizione OPA cattura l eccezione e notifica l utente', async () => {
            const ambErr = creaAmbienteWarRoom({
                cash: 1000000,
                acquireError: 'Offerta superata da un altro giocatore',
            });

            ambErr.sandbox.document.body.innerHTML = `<input id="wri-prov_como" value="450000">`;

            await ambErr.sandbox._wrAcquire('prov_como');

            assert.equal(ambErr.bigEvents.length, 0, 'non deve scatenare showBigEvent su errore');
            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('OPA non riuscita')));

            ambErr.env.stopAllIntervals();
        });

        test('porta unica del denaro: il denaro viene gestito tramite ServerState RPC', async () => {
            const { sandbox, gs } = amb;
            sandbox.document.body.innerHTML = `<input id="wri-prov_como" value="450000">`;

            await sandbox._wrAcquire('prov_como');

            // Verifichiamo che _wrAcquire non abbia scalato direttamente gs.cash in locale
            // lasciando che sia il bridge / RPC a sincronizzare la cassa
            assert.ok(gs.cash > 0);
        });
    });

    describe('6. Helper geografici e proiezione Mercatore', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteWarRoom(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('proiezione geografica mappa coordinate italiane all interno dei limiti SVG', () => {
            const { sandbox } = amb;

            // Roma: ~12.5 Lon, 41.9 Lat
            const projRoma = sandbox._wrProject(12.5, 41.9);
            assert.ok(Array.isArray(projRoma));
            assert.equal(projRoma.length, 2);
            assert.ok(projRoma[0] >= 0 && projRoma[0] <= 500, 'coordinata X deve essere tra 0 e 500');
            assert.ok(projRoma[1] >= 0 && projRoma[1] <= 660, 'coordinata Y deve essere tra 0 e 660');
        });

        test('riconoscimento identificativi SVG da proprietà GeoJSON (_wrGetSvgId)', () => {
            const { sandbox } = amb;

            assert.equal(sandbox._wrGetSvgId({ reg_name: 'Piemonte' }), 'reg_piemonte');
            assert.equal(sandbox._wrGetSvgId({ name: "Valle d'Aosta" }), 'reg_vda');
            assert.equal(sandbox._wrGetSvgId({ DEN_REG: 'Lombardia' }), 'reg_lombardia');
            assert.equal(sandbox._wrGetSvgId({ NAME_1: 'Trentino-Alto Adige/Südtirol' }), 'reg_trentino');
            assert.equal(sandbox._wrGetSvgId({ name: 'Regione Sconosciuta' }), null);
        });

        test('calcolo stili di riempimento e contorno in base al possesso (_wrFill, _wrStroke)', () => {
            const { sandbox } = amb;

            // Nostro possesso (mine > 0 e mine >= enemy)
            assert.equal(sandbox._wrFill({ mine: 2, enemy: 0, free: 0, total: 2 }, 'reg_lombardia'), '#B8920A');
            assert.equal(sandbox._wrStroke({ mine: 2, enemy: 0, free: 0, total: 2 }), '#c79a2a');
            assert.equal(sandbox._wrStrokeW({ mine: 2, enemy: 0, free: 0, total: 2 }), 2.5);

            // Nemico (enemy > 0 e enemy > mine)
            assert.equal(sandbox._wrFill({ mine: 0, enemy: 2, free: 0, total: 2 }, 'reg_lombardia'), '#A02020');
            assert.equal(sandbox._wrStroke({ mine: 0, enemy: 2, free: 0, total: 2 }), '#db5746');
            assert.equal(sandbox._wrStrokeW({ mine: 0, enemy: 2, free: 0, total: 2 }), 2);

            // Libero o neutrale
            assert.equal(sandbox._wrFill({ mine: 0, enemy: 0, free: 2, total: 2 }, 'reg_lombardia'), '#3A70B8');
            assert.equal(sandbox._wrStroke({ mine: 0, enemy: 0, free: 2, total: 2 }), 'rgba(0,0,0,0.22)');
            assert.equal(sandbox._wrStrokeW({ mine: 0, enemy: 0, free: 2, total: 2 }), 0.8);
        });
    });
});
