'use strict';
/* ============================================================================
   test/rides/dividend-levy-sync.test.js

   Regressione per il doppio conteggio in engine-rides.js:
   dopo CE_money.earn(earned) il client chiama rpc_pay_majority_dividend e
   rpc_pay_fuel_levy, che SCALANO companies.cash SUL SERVER
   (27_hostile_takeovers.sql:149, 29_infrastructure_monopoly.sql:135).
   Il totale appena sincronizzato da earn() non contiene quei tagli: il client
   deve allineare la previsione locale con CE_money.addebitatoDalServer
   sull'importo che la RPC restituisce, senza risincronizzare.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupEnv(rpcHandlers = {}) {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    const sandbox = env.sandbox;
    const gs = sandbox.gameState;

    const dividendCalls = [];
    const levyCalls = [];
    sandbox.supabaseClient = {
        rpc: async (fn, params) => {
            if (fn === 'rpc_pay_majority_dividend') {
                dividendCalls.push(params);
                if (rpcHandlers.dividend) return rpcHandlers.dividend(params);
                return Math.floor((params.v_ride_earnings || 0) * 0.20);
            }
            if (fn === 'rpc_pay_fuel_levy') {
                levyCalls.push(params);
                if (rpcHandlers.levy) return rpcHandlers.levy(params);
                return { levy: 25 };
            }
            return null;
        },
    };
    sandbox.currentUser = { id: 'user_test' };

    const earnCalls = [];
    const origEarn = sandbox.CE_money.earn;
    sandbox.CE_money.earn = function (amount, reason) {
        earnCalls.push({ amount, reason });
        return origEarn.apply(this, arguments);
    };

    return { env, sandbox, gs, syncedCash, dividendCalls, levyCalls, earnCalls };
}

function aggiungiAutistaEAuto(gs) {
    gs.drivers.push({
        id: 'd1', name: 'Mario', status: 'busy', queue: [],
        assignedCarId: 'c1', level: 0, trait: null,
    });
    gs.fleet.push({
        id: 'c1', name: 'Berlina', tier: 'standard', condition: 100,
        vehicleClass: 'stellar_e_exec', upgrades: [],
    });
}

// Due microtask: le RPC sono fire-and-forget, il .then che allinea il saldo
// gira dopo la risposta simulata.
function attendiRpc() {
    return new Promise(r => setImmediate(() => setImmediate(r)));
}

describe('engine-rides — dividendo OPA e levy carburante scalati dal server (addebitatoDalServer)', () => {

    describe('completeRide (pagamento immediato)', () => {
        test('il dividendo e il levy ritornati dalle RPC scalano anche il saldo locale', async () => {
            const { sandbox, gs, syncedCash, dividendCalls, levyCalls, earnCalls } = setupEnv();
            gs.cash = 1000;
            aggiungiAutistaEAuto(gs);

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.5; // niente incidente / ritardo / DC drop
            const ride = {
                id: 1, driverId: 'd1', tier: 'standard', price: 200,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' }, // mappata → levy attivo
                toPoi: { id: 'p2', region: 'lazio', name: 'Roma Nord' },
            };
            sandbox.completeRide(ride, false);
            await attendiRpc();
            sandbox.Math.random = origRandom;

            const earned = earnCalls.find(c => c.reason === 'ride_earnings').amount;
            const dividendo = Math.floor(earned * 0.20);
            assert.equal(dividendCalls.length, 1, 'la RPC del dividendo deve essere chiamata');
            assert.equal(levyCalls.length, 1, 'la RPC del levy deve essere chiamata');
            assert.equal(
                gs.cash,
                1000 + earned - dividendo - 25,
                'il saldo locale deve riflettere anche il dividendo e il levy che il server ha già scalato'
            );
            assert.equal(syncedCash.length, 1, "l'allineamento non deve risincronizzare la cassa");
        });

        test('senza OPA attiva (RPC = 0) e senza deposito (skipped) nessun taglio oltre all\'incasso', async () => {
            const { sandbox, gs, earnCalls } = setupEnv({
                dividend: () => 0,
                levy: () => ({ skipped: 'no_depot' }),
            });
            gs.cash = 1000;
            aggiungiAutistaEAuto(gs);

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.5;
            const ride = {
                id: 2, driverId: 'd1', tier: 'standard', price: 200,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'p2', region: 'lazio', name: 'Roma Nord' },
            };
            sandbox.completeRide(ride, false);
            await attendiRpc();
            sandbox.Math.random = origRandom;

            const earned = earnCalls.find(c => c.reason === 'ride_earnings').amount;
            assert.equal(gs.cash, 1000 + earned, 'nessun taglio se il server non ha scalato nulla');
        });

        test('se le RPC falliscono nessun taglio locale (il server non ha scalato)', async () => {
            const { sandbox, gs, earnCalls } = setupEnv({
                dividend: () => { throw new Error('rete giù'); },
                levy: () => { throw new Error('rete giù'); },
            });
            gs.cash = 1000;
            aggiungiAutistaEAuto(gs);

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.5;
            const ride = {
                id: 3, driverId: 'd1', tier: 'standard', price: 200,
                fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
                toPoi: { id: 'p2', region: 'lazio', name: 'Roma Nord' },
            };
            sandbox.completeRide(ride, false);
            await attendiRpc();
            sandbox.Math.random = origRandom;

            const earned = earnCalls.find(c => c.reason === 'ride_earnings').amount;
            assert.equal(gs.cash, 1000 + earned, 'un fallimento RPC non deve scalare il saldo locale');
        });
    });

    describe('checkActiveTrips (pagamento differito)', () => {
        test('dividendi e levy di ogni viaggio completato scalano il saldo locale', async () => {
            const { sandbox, gs, syncedCash, dividendCalls, levyCalls } = setupEnv();
            gs.cash = 2000;
            gs.drivers.push(
                { id: 'd1', name: 'Mario', status: 'busy', queue: [] },
                { id: 'd2', name: 'Luigi', status: 'busy', queue: [] },
            );
            gs.activeTrips = [
                { id: 101, driverId: 'd1', driverName: 'Mario', toName: 'Milano', fromPoiId: 'roma', earnings: 350, endTime: Date.now() - 5000 },
                { id: 102, driverId: 'd2', driverName: 'Luigi', toName: 'Torino', fromPoiId: null, earnings: 450, endTime: Date.now() - 5000 },
            ];

            sandbox.checkActiveTrips();
            await attendiRpc();

            // dividendi: floor(350*0.20)=70 e floor(450*0.20)=90; levy fisso 25 (solo viaggio 1)
            assert.equal(dividendCalls.length, 2, 'una RPC dividendo per viaggio');
            assert.equal(levyCalls.length, 1, 'solo il viaggio con provincia mappata paga il levy');
            assert.equal(
                gs.cash,
                2000 + 350 + 450 - 70 - 90 - 25,
                'il saldo locale deve riflettere i tagli che il server ha già fatto'
            );
            assert.equal(syncedCash.length, 1, 'un solo syncCash: l\'allineamento non risincronizza');
        });
    });
});
