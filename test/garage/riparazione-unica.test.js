'use strict';
/* ============================================================================
   Una sola riparazione carrozzeria, un solo prezzo (Regola 4 del registro).

   Prima del 19/08/2026 c'erano due funzioni per la stessa azione:
     - payToRepairCar (engine.js): €25/punto, addebito vero via RPC;
     - repairVehicle (engine-fleet.js): €85/punto, scalava solo in locale.
   Entrambe le interfacce mostravano pero' il prezzo a €85, quindi il pulsante
   del tab Staff annunciava €5.100 e ne addebitava 1.500, e quello del tab Flotta
   annunciava il prezzo giusto ma il denaro tornava indietro al ricaricamento.

   Il test che conta e' l'ultimo: prezzo mostrato == prezzo addebitato.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function conAuto(condizione, extra) {
    const { sandbox } = freshEnv();
    const car = Object.assign({
        id: 'c1', _serverId: 's1', name: 'Auto', tier: 'business',
        condition: condizione, isLease: false,
    }, extra || {});
    sandbox.gameState.fleet.push(car);
    sandbox.gameState.cash = 500000;
    return { sandbox, gs: sandbox.gameState, car };
}

describe('garage/riparazione — una sola funzione, un solo prezzo', () => {

    test('il gemello rotto non esiste piu\'', () => {
        const { sandbox } = conAuto(50);
        assert.equal(typeof sandbox.window.repairVehicle, 'undefined',
            'repairVehicle scalava il denaro senza dirlo al server: non va reintrodotta');
    });

    test('il prezzo e\' quello che i giocatori hanno sempre visto: €85 al punto', () => {
        const { sandbox, car } = conAuto(40);
        assert.equal(sandbox.window.repairCostFor(car), 5100, '60 punti mancanti × 85');
    });

    test('sotto i 6 punti mancanti vale il minimo di €500', () => {
        const { sandbox, car } = conAuto(98);
        assert.equal(sandbox.window.repairCostFor(car), 500);
    });

    test('gli sconti di ENTRAMBE le vecchie funzioni sono sopravvissuti', () => {
        // contratto (veniva solo da repairVehicle) + officina mobile (solo da payToRepairCar)
        const { sandbox, gs, car } = conAuto(40);
        gs.maintenanceContract = true;
        gs.maintenanceContractPaidUntilDay = (gs.day || 1) + 10;
        assert.equal(sandbox.window.repairCostFor(car), 3570, '5100 × 0.70 contratto');

        gs.staff.push({ id: 'mech', name: 'Capo Officina' });
        assert.equal(sandbox.window.repairCostFor(car), 1785, '× 0.50 Capo Officina');

        gs.investments.push('inv_mobile_workshop');
        assert.equal(sandbox.window.repairCostFor(car), 1428, '× 0.80 officina mobile');
    });

    test('con Kasko la riparazione e\' gratuita', () => {
        const { sandbox, gs, car } = conAuto(30);
        gs.investments.push('inv_kasko');
        assert.equal(sandbox.window.repairCostFor(car), 0);
    });

    test('col motore fuso la riparazione carrozzeria viene rifiutata senza addebito', async () => {
        const { sandbox, gs, car } = conAuto(40, { engineHealth: 0 });
        const prima = gs.cash;
        await sandbox.window.payToRepairCar('c1');
        assert.equal(gs.cash, prima, 'nessun addebito');
        assert.equal(car.condition, 40, 'e nessuna riparazione');
    });

    test('riparare rimette l\'auto in servizio e passa dal server', async () => {
        const { sandbox, gs, car } = conAuto(40, { outOfService: 'guasto' });
        const chiamate = [];
        sandbox.window.ServerState.repairVehicle = async (id, costo) => {
            chiamate.push(costo);
            gs.cash -= costo;
            return { ok: true };
        };
        await sandbox.window.payToRepairCar('c1');
        assert.equal(car.condition, 100);
        assert.equal(car.outOfService, null, 'outOfService veniva azzerato solo dal gemello rotto');
        assert.deepEqual(chiamate, [5100], 'il costo deve passare dalla RPC del server');
    });

    test('REGRESSIONE — il prezzo mostrato coincide con quello addebitato', async () => {
        // Il bug: ui-staff.js e ui-fleet.js ricopiavano la formula a mano, e quella
        // copia divergeva da quella davvero applicata. Ora la fonte e' una sola.
        const { sandbox, gs, car } = conAuto(40);
        gs.staff.push({ id: 'mech', name: 'Capo Officina' });

        const mostrato = sandbox.window.repairCostFor(car);
        let addebitato = null;
        sandbox.window.ServerState.repairVehicle = async (id, costo) => { addebitato = costo; return { ok: true }; };
        await sandbox.window.payToRepairCar('c1');

        assert.equal(addebitato, mostrato,
            `il pulsante mostrava €${mostrato} e ne addebitava €${addebitato}`);
    });
});
