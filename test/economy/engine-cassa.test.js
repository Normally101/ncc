'use strict';
/* ============================================================================
   engine.js — la cassa passa dalla porta unica, e la Kasko ha una porta sola.

   Due difetti sorvegliati qui, trovati il 21/08 spacchettando il ramo
   `porta-unica-engine-js-la-parte-delle-cor-08210736`:

   1. `_addCash` muoveva `gameState.cash` e basta. Chi incassava per questa
      strada vedeva il denaro a schermo e lo perdeva al ricaricamento, perche'
      al server non arrivava niente.

   2. `payToRepairCar` aveva una scorciatoia Kasko che regalava QUALSIASI
      riparazione. Il 20/08 la stessa regalia era stata tolta da
      `repairCostFor`, ma la scorciatoia usciva prima di arrivarci: il prezzo
      mostrato diceva 5.950 euro e il pulsante riparava gratis. Un test sul
      solo `repairCostFor` non se ne accorgeva — guardava la porta sbagliata.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Banco con CE_money spiato e syncCash registrato. */
function banco() {
    const sincronizzati = [];
    const chiamate = [];
    const addebitati = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => { sincronizzati.push(v); return { success: true, cash: v }; },
            repairVehicle: async (id, costo) => { addebitati.push(costo); return { success: true }; },
        },
    });

    for (const nome of ['spend', 'earn']) {
        const originale = env.sandbox.CE_money[nome];
        env.sandbox.CE_money[nome] = function (importo, motivo) {
            chiamate.push({ tipo: nome, importo, motivo });
            return originale.apply(this, arguments);
        };
    }

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, sincronizzati, chiamate, addebitati };
}

describe('engine.js — cassa e riparazioni', () => {

    describe('_addCash', () => {
        test('accredita passando da CE_money.earn e lo dice al server', async () => {
            const { sandbox, gs, sincronizzati, chiamate } = banco();
            gs.cash = 1500;

            const saldo = sandbox._addCash(500);
            await new Promise(r => setImmediate(r));

            assert.equal(saldo, 2000);
            assert.equal(gs.cash, 2000);
            const accrediti = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(accrediti.length, 1, 'non e\' passato dalla porta unica');
            assert.equal(accrediti[0].importo, 500);
            assert.deepEqual(sincronizzati, [2000],
                'il server non ha saputo dell\'incasso: al ricaricamento sparisce');
        });

        test('un importo non finito non muove niente e non sincronizza', async () => {
            const { sandbox, gs, sincronizzati, chiamate } = banco();
            gs.cash = 1500;

            const saldo = sandbox._addCash(NaN);
            await new Promise(r => setImmediate(r));

            assert.equal(saldo, 1500);
            assert.equal(gs.cash, 1500);
            assert.equal(chiamate.length, 0);
            assert.deepEqual(sincronizzati, []);
        });
    });

    describe('Kasko e riparazione ordinaria', () => {
        /* Un'auto al 30%: mancano 70 punti × 85 euro = 5.950, nessuno sconto. */
        function autoRotta(gs) {
            const auto = {
                id: 'car_kasko', _serverId: 'srv_kasko', name: 'Auto Protetta',
                tier: 'business', condition: 30, isLease: false, outOfService: 'condition',
            };
            gs.fleet.push(auto);
            return auto;
        }

        test('con la Kasko la riparazione ordinaria si paga, e al prezzo mostrato', async () => {
            const { sandbox, gs, addebitati } = banco();
            const auto = autoRotta(gs);
            gs.investments.push('inv_kasko');
            gs.cash = 100000;

            const mostrato = sandbox.window.repairCostFor(auto);
            await sandbox.payToRepairCar('car_kasko');
            await new Promise(r => setImmediate(r));

            assert.equal(mostrato, 5950, 'il prezzo mostrato non e\' quello atteso');
            assert.deepEqual(addebitati, [5950],
                'la Kasko ha di nuovo regalato la riparazione ordinaria, oppure ' +
                'il server non e\' stato avvisato: il pulsante e il prezzo devono coincidere');
            assert.equal(auto.condition, 100);
        });

        test('con la Kasko e senza soldi la riparazione non avviene', async () => {
            const { sandbox, gs, addebitati } = banco();
            const auto = autoRotta(gs);
            gs.investments.push('inv_kasko');
            gs.cash = 100;

            await sandbox.payToRepairCar('car_kasko');
            await new Promise(r => setImmediate(r));

            assert.deepEqual(addebitati, [], 'ha riparato senza poter pagare');
            assert.equal(auto.condition, 30, 'auto riparata gratis: la scorciatoia Kasko e\' tornata');
        });

        test('l\'incidente resta coperto: con la Kasko l\'auto non si danneggia', () => {
            const { sandbox, gs } = banco();
            /* La promessa della Kasko vive qui, non nella riparazione: se
               l'incidente non fa danno, non c'e' niente da riparare. */
            const sorgente = require('node:fs')
                .readFileSync(require('node:path').resolve(__dirname, '..', '..', 'engine-rides.js'), 'utf8');
            assert.match(sorgente, /hasInvestment\('inv_kasko'\)[\s\S]{0,400}?incidente coperto/,
                'tolta anche la copertura sugli incidenti: la Kasko non varrebbe piu\' niente');
            assert.ok(sandbox);
            assert.ok(gs);
        });
    });
});
