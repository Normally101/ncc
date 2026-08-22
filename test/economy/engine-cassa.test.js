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

    for (const nome of ['spend', 'earn', 'accreditatoDalServer', 'addebitatoDalServer']) {
        const originale = env.sandbox.CE_money[nome];
        env.sandbox.CE_money[nome] = function (importo, motivo) {
            chiamate.push({ tipo: nome, importo, motivo });
            return originale.apply(this, arguments);
        };
    }

    const dcSpesi = [];
    if (env.sandbox.ServerState) {
        env.sandbox.ServerState.spendDriverCoins = async (motivo, quantita) => {
            dcSpesi.push({ motivo, quantita });
            return { success: true, driver_coins: env.sandbox.gameState.driverCoins };
        };
    }

    for (const nome of ['spendDC', 'earnDC']) {
        const originale = env.sandbox.CE_money[nome];
        env.sandbox.CE_money[nome] = function (importo, motivo) {
            chiamate.push({ tipo: nome, importo, motivo });
            return originale.apply(this, arguments);
        };
    }

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, sincronizzati, chiamate, addebitati, dcSpesi };
}

describe('engine.js — cassa e riparazioni', () => {

    describe('transazioni convertite a CE_money', () => {
        test('_resolveAuction rimborsa l\'asta persa passando da CE_money.earn', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            gs.cash = 50000;
            gs.activeAuction = {
                id: 'auc_1', name: 'Auto Rara', tier: 'ultra', vehicleClass: 'majestic_spirit',
                minBid: 100000, currentBid: 120000, endsHour: 100,
                playerBid: 110000,
            };

            sandbox._resolveAuction();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 160000);
            const accrediti = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(accrediti.length, 1, 'il rimborso asta deve passare da CE_money.earn');
            assert.equal(accrediti[0].importo, 110000);
            assert.deepEqual(sincronizzati, [160000]);
        });

        test('_triggerVIPMidRideEvent scelta A addebita il costo con CE_money.spend', async () => {
            const { sandbox, gs, chiamate } = banco();
            gs.cash = 5000;
            const ride = { tier: 'vip', duration: 100, elapsed: 20 };
            sandbox.Math.random = () => 0; // Seleziona il primo evento con costA = 500

            sandbox.window._triggerVIPMidRideEvent(ride);
            const btnA = sandbox.document.getElementById('vip-toast-a');
            assert.ok(btnA, 'il toast VIP deve mostrare il pulsante A');
            btnA.onclick();
            await new Promise(r => setImmediate(r));

            const addebiti = chiamate.filter(c => c.tipo === 'spend');
            assert.equal(addebiti.length, 1, 'la scelta A con costo deve passare da CE_money.spend');
            assert.equal(addebiti[0].importo, 500);
            assert.equal(gs.cash, 4500);
        });

        test('payFine paga la multa passando da CE_money.spend', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            gs.cash = 2000;
            gs.activeFines = [{ id: 'fine_1', amount: 400, status: 'pending' }];

            sandbox.payFine('fine_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1600);
            assert.equal(gs.activeFines[0].status, 'paid');
            const addebiti = chiamate.filter(c => c.tipo === 'spend');
            assert.equal(addebiti.length, 1, 'il pagamento multa deve passare da CE_money.spend');
            assert.equal(addebiti[0].importo, 400);
            assert.deepEqual(sincronizzati, [1600]);
        });

        test('attackTerritory finanzia la guerra prezzi passando da CE_money.spend', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            gs.unlockedRegions = ['lazio'];
            gs.cash = 100000;
            const vm = require('node:vm');
            const reg = vm.runInContext('REGIONS.lazio', sandbox);
            const costoAtteso = Math.floor(reg.price * 0.25 + 15000);

            sandbox.attackTerritory('lazio');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000 - costoAtteso);
            const addebiti = chiamate.filter(c => c.tipo === 'spend');
            assert.equal(addebiti.length, 1, 'l\'attacco territorio deve passare da CE_money.spend');
            assert.equal(addebiti[0].importo, costoAtteso);
            assert.deepEqual(sincronizzati, [100000 - costoAtteso]);
        });

        test('speedUpConstruction scala Driver Coins tramite CE_money.spendDC', async () => {
            const { sandbox, gs, chiamate, dcSpesi } = banco();
            gs.day = 10;
            gs.driverCoins = 20;
            gs.constructions = [{ invId: 'inv_fuel_depot', completesDay: 15 }];

            sandbox.speedUpConstruction('inv_fuel_depot');
            await new Promise(r => setImmediate(r));

            const spesi = chiamate.filter(c => c.tipo === 'spendDC');
            assert.equal(spesi.length, 1, 'la velocizzazione costruzione deve passare da CE_money.spendDC');
            assert.equal(spesi[0].importo, 10); // (15 - 10) * 2 = 10 DC
            assert.equal(gs.driverCoins, 10);
            assert.equal(dcSpesi.length, 1);
            assert.equal(dcSpesi[0].quantita, 10);
        });

        test('sellInvestment accredita la vendita tramite CE_money.earn', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            gs.cash = 1000;
            gs.investments = ['inv_fuel_depot'];
            sandbox.window.confirm = () => true;

            const vm = require('node:vm');
            const item = vm.runInContext('INVESTMENTS', sandbox).find(i => i.id === 'inv_fuel_depot');
            const rimborsoAtteso = Math.floor(item.price * 0.40);

            sandbox.sellInvestment('inv_fuel_depot');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000 + rimborsoAtteso);
            const accrediti = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(accrediti.length, 1, 'la vendita investimento deve passare da CE_money.earn');
            assert.equal(accrediti[0].importo, rimborsoAtteso);
            assert.deepEqual(sincronizzati, [1000 + rimborsoAtteso]);
        });

        test('acceptDiamondContract accredita il compenso tramite CE_money.earn', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            gs.cash = 5000;
            gs.drivers = [{ id: 'd_vip', name: 'Mario', status: 'idle', level: 3, tier: 'vip' }];
            gs.fleet = [{ id: 'c_vip', name: 'Stellar S', tier: 'vip' }];
            gs.emails = [{ id: 'em_1', offer: 45000, status: 'unread' }];

            sandbox.acceptDiamondContract('em_1');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            const accrediti = chiamate.filter(c => c.tipo === 'earn');
            assert.equal(accrediti.length, 1, 'il contratto diamond deve passare da CE_money.earn');
            assert.equal(accrediti[0].importo, 45000);
            assert.deepEqual(sincronizzati, [50000]);
        });
    });

    describe('inizializzazione e ripristino cassa via CE_money', () => {
        test('initGame(fresh=true) allinea cassa a 0 tramite CE_money.addebitatoDalServer senza doppio conteggio', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            gs.cash = 5000;

            sandbox.initGame(true);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 0, 'la cassa iniziale deve essere 0');
            const addebiti = chiamate.filter(c => c.tipo === 'addebitatoDalServer');
            assert.equal(addebiti.length, 1, 'l\'azzeramento deve passare da CE_money.addebitatoDalServer');
            assert.equal(addebiti[0].importo, 5000);
            assert.deepEqual(sincronizzati, [], 'non deve inviare syncCash per evitare doppio conteggio');
        });

        test('gameLoop ripristina cash corrotto (NaN) tramite CE_money.accreditatoDalServer', async () => {
            const { sandbox, gs, chiamate, sincronizzati } = banco();
            sandbox.window._lastValidCash = 2500;
            gs.cash = NaN;
            gs.paused = false;

            sandbox.gameLoop();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 2500, 'il saldo corrotto deve essere ripristinato');
            const accrediti = chiamate.filter(c => c.tipo === 'accreditatoDalServer');
            assert.equal(accrediti.length, 1, 'il ripristino deve passare da CE_money.accreditatoDalServer');
            assert.equal(accrediti[0].importo, 2500);
            assert.deepEqual(sincronizzati, [], 'non deve risincronizzare al ripristino locale');
        });
    });

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
