'use strict';
/* ============================================================================
   Il pulsante «🔧 Ripara» del modal auto deve mostrare ESATTAMENTE la cifra
   che poi payToRepairCar addebita.

   Il bug: ui-staff.js calcolava il prezzo da mostrare ricopiando a mano la
   formula (max(500, mancanti×85)), mentre payToRepairCar (engine.js) ne
   addebitava un'altra ((100−cond)×25). Con un'auto al 40% il pulsante
   prometteva €5.100 e ne scalava 1.500.

   Da quando il prezzo passa tutti da window.repairCostFor (fonte unica),
   mostrato e addebito coincidono. Questo test apre il VERO modal di
   ui-staff.js (render:true), legge il numero stampato sul pulsante e lo
   paragona a ciò che la RPC di riparazione riceve davvero: sul codice col
   bug diventa rosso, su quello corretto resta verde.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function ambienteConAuto(condizione) {
    const { sandbox } = freshEnv({ render: true });
    // Il modal auto vive come HTML statico in index.html: nel banco va ricreato,
    // altrimenti openCarModal non trova gli elementi (come fa autisti.test.js:900).
    sandbox.document.body.innerHTML =
        '<div id="tab-container"></div><div id="modal-car" style="display:none">' +
        '<div id="car-modal-title"></div><div id="car-modal-desc"></div>' +
        '<div id="car-modal-content"></div></div>';
    sandbox.gameState.cash = 50000;
    sandbox.gameState.fleet.push({
        id: 'c_rip', _serverId: 'srv_rip', name: 'Berlina Usata', tier: 'business',
        vehicleClass: 'stellar_e_exec', condition: condizione, isLease: false,
        fuel: 100, tirePressure: 100, engineHealth: 100, upgrades: [], outOfService: null,
    });
    return sandbox;
}

function prezzoMostratoSulPulsante(sandbox) {
    sandbox.openCarModal('c_rip');
    const html = sandbox.document.getElementById('car-modal-content').innerHTML;
    const m = html.match(/🔧 Ripara \(€(\d+)\)/);
    assert.ok(m, 'il modal deve contenere il pulsante Ripara con il prezzo');
    return Number(m[1]);
}

describe('garage/modal-auto — prezzo mostrato == prezzo addebitato', () => {

    test('REGRESSIONE — auto al 40%: il pulsante mostra €5.100 e payToRepairCar ne scala 5.100', async () => {
        const sandbox = ambienteConAuto(40);

        const mostrato = prezzoMostratoSulPulsante(sandbox);

        let addebitato = null;
        sandbox.ServerState.repairVehicle = async (_id, costo) => { addebitato = costo; return { success: true }; };
        await sandbox.payToRepairCar('c_rip');

        assert.equal(mostrato, 5100, 'il pulsante deve mostrare 60 punti mancanti × 85');
        assert.equal(addebitato, mostrato,
            `il pulsante mostrava €${mostrato} ma l'addebito reale è stato €${addebitato}`);
    });

    test('sotto il minimo di €500 i due prezzi coincidono comunque', async () => {
        const sandbox = ambienteConAuto(98);

        const mostrato = prezzoMostratoSulPulsante(sandbox);

        let addebitato = null;
        sandbox.ServerState.repairVehicle = async (_id, costo) => { addebitato = costo; return { success: true }; };
        await sandbox.payToRepairCar('c_rip');

        assert.equal(mostrato, 500, '2 punti mancanti valgono il minimo di €500');
        assert.equal(addebitato, mostrato,
            `il pulsante mostrava €${mostrato} ma l'addebito reale è stato €${addebitato}`);
    });

    test('con lo sconto del Capo Officina il pulsante mostra il prezzo scontato', async () => {
        // Il caso che smaschera la formula ricopiata a mano: senza passare da
        // repairCostFor il modal ignorerebbe gli sconti e tornerebbe a promettere
        // €5.100 mentre la cassa ne scala 1.785.
        const sandbox = ambienteConAuto(40);
        sandbox.gameState.staff.push({ id: 'mech', name: 'Capo Officina' });

        const mostrato = prezzoMostratoSulPulsante(sandbox);

        let addebitato = null;
        sandbox.ServerState.repairVehicle = async (_id, costo) => { addebitato = costo; return { success: true }; };
        await sandbox.payToRepairCar('c_rip');

        assert.equal(mostrato, 2550, '5100 × 0.50 Capo Officina');
        assert.equal(addebitato, mostrato,
            `il pulsante mostrava €${mostrato} ma l'addebito reale è stato €${addebitato}`);
    });
});
