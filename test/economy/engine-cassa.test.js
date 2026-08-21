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
    const dcSpesi = [];

    const env = freshEnv({
        serverState: {
            syncCash: async (v) => { sincronizzati.push(v); return { success: true, cash: v }; },
            repairVehicle: async (id, costo) => { addebitati.push(costo); return { success: true }; },
            spendDriverCoins: async (motivo, n) => { dcSpesi.push({ motivo, n }); return { ok: true }; },
        },
    });

    for (const nome of ['spend', 'earn', 'spendDC']) {
        const originale = env.sandbox.CE_money[nome];
        env.sandbox.CE_money[nome] = function (importo, motivo) {
            chiamate.push({ tipo: nome, importo, motivo });
            return originale.apply(this, arguments);
        };
    }

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, sincronizzati, chiamate, addebitati, dcSpesi };
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

    describe('aste live — rimborso', () => {
        test('rimborso asta persa accredita passando da CE_money.earn', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.activeAuction = {
                id: 'auc_test', name: 'Auto Rara', tier: 'ultra', vehicleClass: 'majestic_spirit',
                minBid: 250000, currentBid: 300000, playerBid: 280000, endsHour: 10,
            };
            sandbox.window._resolveAuction();
            await new Promise(r => setImmediate(r));
            const earnCalls = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(earnCalls.length, 1, 'il rimborso asta deve passare da CE_money.earn');
            assert.equal(earnCalls[0].importo, 280000);
        });
    });

    describe('multe — pagamento', () => {
        test('payFine scala i soldi passando da CE_money.spend', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.cash = 2000;
            gs.activeFines = [{ id: 'f_1', amount: 300, status: 'pending' }];
            sandbox.payFine('f_1');
            await new Promise(r => setImmediate(r));
            const spendCalls = chiamate.filter(c => c.tipo === 'spend');
            assert.equal(spendCalls.length, 1, 'il pagamento multa deve passare da CE_money.spend');
            assert.equal(spendCalls[0].importo, 300);
        });
    });

    describe('guerra dei prezzi — attackTerritory', () => {
        test('attackTerritory spende passando da CE_money.spend', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.unlockedRegions = ['lazio', 'lombardia'];
            gs.cash = 100000;
            sandbox.attackTerritory('lombardia');
            await new Promise(r => setImmediate(r));
            const spendCalls = chiamate.filter(c => c.tipo === 'spend');
            assert.equal(spendCalls.length, 1, 'attackTerritory deve passare da CE_money.spend');
        });
    });

    describe('costruzioni — speedUpConstruction con Driver Coins', () => {
        test('speedUpConstruction passa da CE_money.spendDC', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.day = 1;
            gs.driverCoins = 50;
            gs.constructions = [{ invId: 'inv_fuel_depot', completesDay: 4 }];
            sandbox.speedUpConstruction('inv_fuel_depot');
            await new Promise(r => setImmediate(r));
            const dcCalls = chiamate.filter(c => c.tipo === 'spendDC');
            assert.equal(dcCalls.length, 1, 'speedUpConstruction deve passare da CE_money.spendDC');
            assert.equal(dcCalls[0].importo, 6); // (4-1)*2 = 6 DC
        });
    });

    describe('investimenti — vendita', () => {
        test('sellInvestment accredita passando da CE_money.earn', async () => {
            const { sandbox, gs, chiamate } = banco();
            sandbox.window.confirm = () => true;
            gs.cash = 1000;
            gs.investments = ['inv_app'];
            sandbox.sellInvestment('inv_app');
            await new Promise(r => setImmediate(r));
            const earnCalls = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(earnCalls.length, 1, 'sellInvestment deve passare da CE_money.earn');
        });
    });

    describe('email contratti diamond — acceptDiamondContract', () => {
        test('acceptDiamondContract accredita passando da CE_money.earn', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.drivers = [{ id: 'd_exp', name: 'Autista Esperto', status: 'idle', level: 2, tier: 'vip' }];
            gs.fleet = [{ id: 'c_vip', name: 'Auto VIP', tier: 'vip' }];
            gs.emails = [{ id: 'em_diam', offer: 40000, status: 'unread' }];
            sandbox.acceptDiamondContract('em_diam');
            await new Promise(r => setImmediate(r));
            const earnCalls = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(earnCalls.length, 1, 'acceptDiamondContract deve passare da CE_money.earn');
            assert.equal(earnCalls[0].importo, 40000);
        });
    });

    describe('eventi VIP mid-ride — scelta A con costo', () => {
        test('scelta A con costo passa da CE_money.spend', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.cash = 5000;
            gs.drivers = [{ id: 'd_vip', name: 'Driver VIP' }];
            const ride = { id: 'r1', driverId: 'd_vip', toPoi: { name: 'Hotel' }, tier: 'vip' };
            // Forza Math.random a scegliere il primo evento (rose, costA = 500)
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.001;
            try {
                sandbox.window._triggerVIPMidRideEvent(ride);
                const btnA = sandbox.document.getElementById('vip-toast-a');
                assert.ok(btnA, 'il pulsante di scelta A deve esistere nel toast VIP');
                btnA.onclick();
                await new Promise(r => setImmediate(r));
                const spendCalls = chiamate.filter(c => c.tipo === 'spend');
                assert.equal(spendCalls.length, 1, 'la scelta A con costo deve passare da CE_money.spend');
                assert.equal(spendCalls[0].importo, 500);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });
});
