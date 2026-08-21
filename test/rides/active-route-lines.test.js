'use strict';
/* ============================================================================
   test/rides/active-route-lines.test.js — Linee di rotta attive e traffico

   Verifica che `_updateActiveRouteLines` sia la funzione canonica definita in map.js
   e supporti la visualizzazione delle corse sia normali che con traffico:
   - Aggiorna la sorgente GeoJSON 'active-routes' con le geometrie delle corse
   - Se ci sono corse in stato di traffico (inTraffic === true), aggiorna le
     proprietà di vernice (setPaintProperty) con i colori di allerta traffico
   - ui-map-utils.js non deve ridefinire né sovrascrivere _updateActiveRouteLines
   ============================================================================ */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('map — gestione linee di rotta attive (_updateActiveRouteLines)', () => {
    let sandbox, mapMock, paintCalls, setDataPayload;

    beforeEach(() => {
        paintCalls = [];
        setDataPayload = null;

        const fakeSource = {
            setData: (data) => { setDataPayload = data; }
        };

        mapMock = {
            getZoom: () => 6,
            getSource: (id) => (id === 'active-routes' ? fakeSource : null),
            getLayer: (id) => (id.startsWith('active-routes') ? {} : null),
            setPaintProperty: (layerId, prop, val) => {
                paintCalls.push({ layerId, prop, val });
            }
        };

        sandbox = {
            console,
            setTimeout: (fn) => { fn(); return 1; },
            clearTimeout: () => {},
            Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Map, Set,
            document: {
                getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener: () => {} })
            },
            gameState: {
                activeRides: [],
                activeTrips: [],
                unlockedRegions: ['lazio'],
            },
            mapboxgl: {
                accessToken: '',
                Map: function() {
                    return Object.assign(mapMock, {
                        on: (event, handler) => {
                            if (event === 'load') handler();
                        },
                        setTerrain: () => {},
                        addLayer: () => {},
                        addSource: () => {},
                    });
                }
            },
            _poiMarkers: {},
            HIGHWAYS: {},
            POIS: {},
            REGION_CENTROIDS: {},
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;

        vm.createContext(sandbox);

        // Carica map.js nell'ambiente isolato
        const mapSrc = fs.readFileSync(path.join(ROOT, 'map.js'), 'utf8');
        vm.runInContext(mapSrc, sandbox, { filename: 'map.js' });
        sandbox.initMap();
    });

    test('map.js definisce _updateActiveRouteLines con gestione del traffico e aggiornamento GeoJSON', () => {
        assert.equal(typeof sandbox._updateActiveRouteLines, 'function', '_updateActiveRouteLines deve essere una funzione');

        sandbox.gameState.activeRides = [
            { id: 101, roadGeom: [[12.49, 41.90], [12.50, 41.91]], inTraffic: false },
            { id: 102, roadGeom: [[12.50, 41.91], [12.52, 41.93]], inTraffic: true }
        ];

        sandbox._updateActiveRouteLines();

        // 1. Verifica che i GeoJSON features siano presenti per entrambe le corse
        assert.ok(setDataPayload, 'setData deve essere stato chiamato su active-routes');
        assert.equal(setDataPayload.type, 'FeatureCollection');
        assert.equal(setDataPayload.features.length, 2);

        // 2. Verifica che i colori di traffico siano stati impostati sul layer
        const glowTraffic = paintCalls.find(c => c.layerId === 'active-routes-glow' && c.val === '#ff4060');
        const coreTraffic = paintCalls.find(c => c.layerId === 'active-routes-core' && c.val === '#ff6080');
        assert.ok(glowTraffic, 'deve impostare il glow rosso (#ff4060) quando ci sono corse con traffico');
        assert.ok(coreTraffic, 'deve impostare il core rosso (#ff6080) quando ci sono corse con traffico');
    });

    test('ui-map-utils.js non sovrascrive window._updateActiveRouteLines', () => {
        const uiMapUtilsSrc = fs.readFileSync(path.join(ROOT, 'ui-map-utils.js'), 'utf8');
        assert.ok(
            !uiMapUtilsSrc.includes('window._updateActiveRouteLines ='),
            'ui-map-utils.js non deve sovrascrivere window._updateActiveRouteLines'
        );
        assert.ok(
            !uiMapUtilsSrc.includes('function _updateActiveRouteLinesColored'),
            'ui-map-utils.js non deve definire _updateActiveRouteLinesColored duplicata'
        );
    });
});
