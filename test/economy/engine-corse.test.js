'use strict';
/* ============================================================================
   engine.js — la parte delle corse e delle riparazioni passa dalla porta unica.

   Recupero del ramo `porta-unica-engine-js-la-parte-delle-cor-08210736`
   (respinto: 8 test rossi uniti a main). Main ha intanto assorbito le
   correzioni e spacchettato il ciclo corse in engine-rides.js; quello che
   mancava era la prova eseguibile, qui, su tre comportamenti che sul codice
   vecchio erano rossi:

   1. Il game loop chiama `completeRide(ride, true)` (pagamento differito):
      li' NON deve muovere denaro né parlare al server — altrimenti quando
      `checkActiveTrips()` paga a scadenza l'incasso viene pagato due volte.
   2. A scadenza il denaro si muove UNA volta sola: un solo CE_money.earn col
      totale e un solo syncCash col saldo finale (non uno per autista).
   3. `payToRepairCar` non completa MAI l'acquisto se il server non muove i
      soldi: RPC rifiutata o fondi insufficienti = auto resta rotta. Sul
      codice vecchio la riparazione avveniva in locale, e al ricaricamento il
      saldo del server (che vince sempre) rimborso l'auto gratis.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Banco con CE_money spiato, syncCash registrato e RPC riparazione registrata. */
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

    for (const nome of ['spend', 'earn', 'spendDC', 'earnDC']) {
        const originale = env.sandbox.CE_money[nome];
        env.sandbox.CE_money[nome] = function (importo, motivo) {
            chiamate.push({ tipo: nome, importo, motivo });
            return originale.apply(this, arguments);
        };
    }

    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, sincronizzati, chiamate, addebitati };
}

/** Autista + auto in flotta, come li prepara una corsa partita dal dispatch. */
function conAutistaInStrada(gs) {
    gs.drivers.push({
        id: 'd1', name: 'Mario', status: 'busy', queue: [],
        assignedCarId: 'c1', level: 0, trait: null,
    });
    gs.fleet.push({
        id: 'c1', name: 'Berlina', tier: 'standard', condition: 100,
        vehicleClass: 'stellar_e_exec', upgrades: [], fuel: 100, tirePressure: 100,
    });
}

describe('engine.js — il denaro delle corse passa dalla porta unica', () => {

    test('il ciclo del game loop: in differita nessun denaro si muove, a scadenza un solo accredito col totale', async () => {
        // Questo e' esattamente il ciclo che engine.js gira ogni tick:
        // gameLoop() chiama completeRide(ride, true) alla fine della simulazione
        // visiva, poi checkActiveTrips() paga quando il tempo reale della corsa
        // scade. Se il primo tratto accreditasse gia', il secondo pagherebbe
        // due volte — ed e' quello che succedeva sul codice pre-conversione,
        // dove il saldo cresceva in locale senza mai dirlo al server.
        const { sandbox, gs, chiamate, sincronizzati } = banco();
        gs.cash = 1000;
        conAutistaInStrada(gs);

        const ride = {
            id: 501, driverId: 'd1', tier: 'standard', price: 300,
            fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
            toPoi: { id: 'milano', region: 'lombardia', name: 'Milano' },
        };
        gs.activeTrips.push({
            id: 501, driverId: 'd1', carId: 'c1', driverName: 'Mario',
            toName: 'Milano', endTime: Date.now() + 60000, earnings: null,
        });

        // ── 1° tratto: completeRide in differita (come lo chiama gameLoop) ──
        sandbox.completeRide(ride, true);

        assert.equal(gs.cash, 1000, 'in differita la cassa non deve muoversi');
        assert.equal(chiamate.length, 0,
            'in differita nessuna porta del denaro deve essere aperta: il pagamento compete a checkActiveTrips');
        assert.deepEqual(sincronizzati, [],
            'in differita il server non deve sentirne parlare: ancora non e\' maturato niente');
        const incasso = gs.activeTrips[0].earnings;
        assert.ok(incasso > 0, 'l\'incasso maturato deve restare sul viaggio');

        // ── 2° tratto: la corsa scade, checkActiveTrips paga ──
        gs.activeTrips[0].endTime = Date.now() - 1000;
        sandbox.checkActiveTrips();
        await new Promise(r => setImmediate(r));

        assert.equal(gs.cash, 1000 + incasso, 'il pagamento arriva una volta sola, alla scadenza');
        const accrediti = chiamate.filter(c => c.tipo === 'earn');
        assert.equal(accrediti.length, 1, 'un solo CE_money.earn per tutto il passaggio');
        assert.equal(accrediti[0].motivo, 'completed_trips');
        assert.deepEqual(sincronizzati, [1000 + incasso],
            'il server non sapeva dell\'incasso: al ricaricamento la corsa tornava gratis');
    });

    test('due corse scadute insieme: un solo earn col totale e un solo sync, non uno per autista', () => {
        // La regola vale a ciclo pieno: le funzioni chiamate in un ciclo (una
        // per autista) sincronizzano una volta sola alla fine, col totale.
        const { sandbox, gs, chiamate, sincronizzati } = banco();
        gs.cash = 2000;
        gs.drivers.push(
            { id: 'd1', name: 'A', status: 'busy', queue: [], assignedCarId: null },
            { id: 'd2', name: 'B', status: 'busy', queue: [], assignedCarId: null },
        );
        gs.activeTrips.push(
            { id: 1, driverId: 'd1', driverName: 'A', toName: 'Roma', earnings: 350, endTime: Date.now() - 1000 },
            { id: 2, driverId: 'd2', driverName: 'B', toName: 'Milano', earnings: 450, endTime: Date.now() - 1000 },
        );

        sandbox.checkActiveTrips();

        assert.equal(gs.cash, 2800);
        const accrediti = chiamate.filter(c => c.tipo === 'earn');
        assert.equal(accrediti.length, 1, 'un solo movimento di cassa per passaggio');
        assert.equal(accrediti[0].importo, 800, 'l\'importo deve essere il totale delle corse');
        assert.deepEqual(sincronizzati, [2800], 'un solo sync, col saldo dopo tutti i pagamenti');
    });
});

describe('engine.js — payToRepairCar: il server prima, la carrozzeria dopo', () => {

    function autoRotta(gs, extra) {
        const auto = Object.assign({
            id: 'c_rotta', _serverId: 'srv_rotta', name: 'Auto Rotta',
            tier: 'business', condition: 40, isLease: false,
        }, extra || {});
        gs.fleet.push(auto);
        return auto;
    }

    test('fondi insufficienti: la RPC non parte e l\'auto resta com\'era', async () => {
        // Firma del bug originario: la riparazione avveniva comunque (gratis o
        // a debito), e il saldo del server la rimborso al primo caricamento.
        const { sandbox, gs, addebitati, sincronizzati } = banco();
        const auto = autoRotta(gs);
        gs.cash = 100; // servono 60 punti × 85 = 5.100

        await sandbox.payToRepairCar('c_rotta');

        assert.deepEqual(addebitati, [], 'nessuna RPC senza i soldi');
        assert.deepEqual(sincronizzati, []);
        assert.equal(auto.condition, 40, 'l\'auto non va riparata se non si puo\' pagare');
    });

    test('se il server rifiuta, nessuna riparazione gratuita e nessun saldo toccato', async () => {
        // Il risultato della RPC e' l'autorita': se non conferma, il client non
        // completa nulla in locale — altrimenti l'auto riparata resta e il
        // denaro mai scalato torna col valore del server: riparazione gratis.
        const { sandbox, gs, addebitati, sincronizzati } = banco();
        const auto = autoRotta(gs, { outOfService: 'guasto' });
        gs.cash = 50000;

        let chiamataRpc = 0;
        sandbox.ServerState.repairVehicle = async () => { chiamataRpc++; return null; };

        await sandbox.payToRepairCar('c_rotta');

        assert.equal(chiamataRpc, 1, 'la richiesta al server c\'e\' stata');
        assert.deepEqual(addebitati, [], 'il banco non ha visto addebiti confermati');
        assert.deepEqual(sincronizzati, [], 'niente previsioni da rispedire quando il server ha detto no');
        assert.equal(auto.condition, 40, 'auto riparata senza conferma del server: acquisto gratis');
        assert.equal(auto.outOfService, 'guasto');
        assert.equal(gs.cash, 50000);
    });
});
