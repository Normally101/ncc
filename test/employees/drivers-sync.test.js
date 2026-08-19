'use strict';
/* ============================================================================
   test/employees/drivers-sync.test.js

   Regressione per il bug economico in engine-drivers.js:
   tutte le funzioni che muovono cassa o Driver Coins DEVONO passare dalla porta
   unica CE_money per sincronizzare lo stato con ServerState.syncCash o
   ServerState.spendDriverCoins.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupDriversEnv() {
    const chiamateSyncCash = [];
    const chiamateDC = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (cash) => {
                chiamateSyncCash.push(cash);
                return { success: true, cash };
            },
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                return { ok: true };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateSyncCash, chiamateDC };
}

describe('engine-drivers — sincronizzazione movimenti denaro e Driver Coins col server', () => {

    test('1. payDriverBonus scala il cash e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, chiamateSyncCash } = setupDriversEnv();
        gs.cash = 10000;
        gs.drivers.push({ id: 'drv1', name: 'Mario', status: 'idle', satisfaction: 50, morale: 50 });

        sandbox.payDriverBonus('drv1', 1000);
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 9000, 'il saldo locale deve essere scalato di €1.000');
        assert.equal(chiamateSyncCash.length, 1, 'syncCash deve essere chiamata');
        assert.equal(chiamateSyncCash[0], 9000, 'syncCash deve ricevere il saldo aggiornato');
    });

    test('2. payStressClear scala €1.000 e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, chiamateSyncCash } = setupDriversEnv();
        gs.cash = 5000;
        gs.drivers.push({ id: 'drv1', name: 'Mario', status: 'idle', stress_level: 80 });

        sandbox.payStressClear('drv1');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 4000, 'il saldo locale deve essere scalato di €1.000');
        assert.equal(chiamateSyncCash.length, 1, 'syncCash deve essere chiamata');
        assert.equal(chiamateSyncCash[0], 4000, 'syncCash deve ricevere il saldo aggiornato');
        const drv = gs.drivers.find(d => d.id === 'drv1');
        assert.equal(drv.stress_level, 0, 'lo stress deve essere azzerato');
    });

    test('3. resolveStrike scala il costo accordo sindacale e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, chiamateSyncCash } = setupDriversEnv();
        gs.cash = 10000;
        gs.drivers.push({ id: 'drv1', name: 'Mario', isOnStrike: true, salary: 3000, status: 'strike' });

        sandbox.resolveStrike('drv1');
        await new Promise(r => setImmediate(r));

        // settlementCost = round(3000 * 0.5) = 1500 -> cash = 8500
        assert.equal(gs.cash, 8500, 'il saldo locale deve essere scalato del 50% dello stipendio');
        assert.equal(chiamateSyncCash.length, 1, 'syncCash deve essere chiamata');
        assert.equal(chiamateSyncCash[0], 8500, 'syncCash deve ricevere il saldo aggiornato');
        const drv = gs.drivers.find(d => d.id === 'drv1');
        assert.equal(drv.isOnStrike, false, 'lo sciopero deve essere terminato');
    });

    test('4. startAcademyCourse scala il costo del corso e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, chiamateSyncCash } = setupDriversEnv();
        gs.cash = 10000;
        gs.drivers.push({ id: 'drv1', name: 'Mario', status: 'idle' });

        // Corso 'lang': cost = 2500
        sandbox.startAcademyCourse('drv1', 'lang');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 7500, 'il saldo locale deve essere scalato del costo del corso');
        assert.equal(chiamateSyncCash.length, 1, 'syncCash deve essere chiamata');
        assert.equal(chiamateSyncCash[0], 7500, 'syncCash deve ricevere il saldo aggiornato');
        assert.ok((gs.driverAcademy || []).some(c => c.driverId === 'drv1'));
    });

    test('5. skipAcademyTraining spende 5 DC tramite ServerState.spendDriverCoins', async () => {
        const { sandbox, gs, chiamateDC } = setupDriversEnv();
        gs.driverCoins = 20;
        gs.drivers.push({ id: 'drv1', name: 'Mario', status: 'training', skill_charisma: 50 });
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'skill_charisma', skillGain: 12 }];

        sandbox.skipAcademyTraining('drv1');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.driverCoins, 15, 'i DC locali devono essere scalati di 5');
        assert.equal(chiamateDC.length, 1, 'spendDriverCoins deve essere chiamata');
        assert.equal(chiamateDC[0].n, 5);
        assert.equal(chiamateDC[0].motivo, 'skip_academy');
        const drv = gs.drivers.find(d => d.id === 'drv1');
        assert.equal(drv.skill_charisma, 62);
    });

    test('6. hireDriver scala il costo di assunzione e sincronizza con ServerState.syncCash', async () => {
        const { sandbox, gs, chiamateSyncCash } = setupDriversEnv();
        gs.cash = 10000;
        gs.availableRecruits = [{ name: 'Luigi Verdi', salary: 1500, trait: null, skill_efficiency: 50 }];

        sandbox.hireDriver('Luigi Verdi', 1500);
        await new Promise(r => setImmediate(r));

        // cost = salary * 2 = 3000 -> cash = 7000
        assert.equal(gs.cash, 7000, 'il saldo locale deve essere scalato di salary * 2');
        assert.equal(chiamateSyncCash.length, 1, 'syncCash deve essere chiamata');
        assert.equal(chiamateSyncCash[0], 7000, 'syncCash deve ricevere il saldo aggiornato');
        assert.ok(gs.drivers.some(d => d.name === 'Luigi Verdi'), 'il nuovo autista deve essere in gameState.drivers');
    });

    test('fondi insufficienti: nessuna sincronizzazione e cassa/DC non modificati', async () => {
        const { sandbox, gs, chiamateSyncCash, chiamateDC } = setupDriversEnv();
        gs.cash = 100;
        gs.driverCoins = 1;
        gs.drivers.push({ id: 'drv1', name: 'Mario', status: 'idle', stress_level: 80 });
        gs.driverAcademy = [{ driverId: 'drv1', skill: 'skill_charisma', skillGain: 12 }];

        sandbox.payStressClear('drv1');
        sandbox.payDriverBonus('drv1', 500);
        sandbox.startAcademyCourse('drv1', 'lang');
        sandbox.hireDriver('Luigi Verdi', 1500);
        sandbox.skipAcademyTraining('drv1');
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 100, 'il cash non deve cambiare');
        assert.equal(gs.driverCoins, 1, 'i DC non devono cambiare');
        assert.equal(chiamateSyncCash.length, 0, 'nessuna chiamata syncCash per spese fallite');
        assert.equal(chiamateDC.length, 0, 'nessuna chiamata spendDriverCoins per spesa DC fallita');
    });
});
