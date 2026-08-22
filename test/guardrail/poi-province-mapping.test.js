'use strict';
/* ============================================================================
   guardrail — Mappatura completa POI → Provincia (_POI_TO_PROVINCE)

   Perché questo test esiste:
   Il calcolo del pedaggio carburante (monopolio infrastrutture / guerra territoriale)
   avviene quando una corsa parte da una città con provincia mappata.
   Se una città in POIS non è registrata in _POI_TO_PROVINCE, le corse che partono
   da quella città risultano esenti da pedaggi e non generano influenza,
   creando uno sbilanciamento involontario nel gioco economico.

   Questo test impedisce che qualsiasi nuovo POI nasca privo di provincia.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function caricaDatiEngine() {
    const sandbox = { window: {}, console };
    vm.createContext(sandbox);

    const dataCode = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
    vm.runInContext(dataCode, sandbox);

    const engineCode = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
    vm.runInContext(engineCode, sandbox);

    return {
        pois: vm.runInContext('POIS', sandbox),
        poiToProv: vm.runInContext('_POI_TO_PROVINCE', sandbox),
        regions: vm.runInContext('REGIONS', sandbox),
    };
}

describe('guardrail — integrità mappatura POI → Provincia', () => {
    test('ogni città definita in POIS ha una provincia in _POI_TO_PROVINCE', () => {
        const { pois, poiToProv } = caricaDatiEngine();
        assert.ok(pois && typeof pois === 'object', 'POIS deve essere definito');
        assert.ok(poiToProv && typeof poiToProv === 'object', '_POI_TO_PROVINCE deve essere definito');

        const poiKeys = Object.keys(pois);
        const missing = poiKeys.filter(poiId => !poiToProv[poiId]);

        assert.deepEqual(
            missing,
            [],
            `Le seguenti città in POIS non hanno una provincia in _POI_TO_PROVINCE:\n` +
            missing.map(m => `  - ${m} (regione: ${pois[m]?.region})`).join('\n')
        );
    });

    test('ogni provincia in _POI_TO_PROVINCE rispetta il formato identificatore prov_*', () => {
        const { poiToProv } = caricaDatiEngine();
        const nonConformi = [];

        for (const [poiId, provId] of Object.entries(poiToProv)) {
            if (typeof provId !== 'string' || !provId.startsWith('prov_')) {
                nonConformi.push({ poiId, provId });
            }
        }

        assert.deepEqual(nonConformi, [], 'Tutti i valori in _POI_TO_PROVINCE devono iniziare con "prov_"');
    });

    test('nessun POI fantasma in _POI_TO_PROVINCE (tutti i POI mappati esistono in POIS)', () => {
        const { pois, poiToProv } = caricaDatiEngine();
        const chiaviPOIS = new Set(Object.keys(pois));
        const orfani = Object.keys(poiToProv).filter(id => !chiaviPOIS.has(id));

        assert.deepEqual(orfani, [], `_POI_TO_PROVINCE contiene chiavi non definite in POIS: ${orfani.join(', ')}`);
    });
});
