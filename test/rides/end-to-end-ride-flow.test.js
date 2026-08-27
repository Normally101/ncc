'use strict';
/* ============================================================================
   test/rides/end-to-end-ride-flow.test.js

   End-to-end test per il flusso completo "la corsa dall'inizio all'incasso":
   1. Giocatore assegna una corsa a un autista
   2. La corsa avanza e finisce (completeRide / checkActiveTrips)
   3. L'incasso arriva (CE_money.earn + syncCash)
   4. L'autista si libera (status 'idle')
   5. La reputazione cambia (CE_money.addReputation)

   Questo test deve essere ROSSO se un passaggio del flusso è rotto adesso.
   ============================================================================ */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('end-to-end: la corsa dall\'inizio all\'incasso', () => {
    let env, sandbox, gs;

    before(() => {
        env = freshEnv();
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    after(() => {
        env.stopAllIntervals();
    });

    test('FLUSSO COMPLETO: assegna → completa → incassa → autista libero → reputazione', async () => {
        // ── SETUP: stato credibile ─────────────────────────────────────────
        gs.cash = 5000;
        gs.driverCoins = 10;
        gs.reputation = 1.0;
        gs.todayEarnings = 0;

        // Un autista con auto compatibile
        gs.drivers.push({
            id: 'd1',
            name: 'Mario Rossi',
            status: 'idle',
            assignedCarId: 'c1',
            queue: [],
            fatigue: 0,
            restHoursLeft: 0,
            xp: 0,
            level: 0,
            morale: 100,
            upgrades: [],
            hiredDay: 1,
            skill_efficiency: 50,
            skill_charisma: 50,
            skill_speed: 50,
            stress_level: 0,
            burnout_until: null,
            trait: null,
            specialty: null,
        });

        // Auto business (compatibile con tier standard/business/vip/ultra)
        gs.fleet.push({
            id: 'c1',
            name: 'Stellar E-Executive',
            tier: 'business',
            vehicleClass: 'stellar_e_exec',
            condition: 100,
            fuel: 100,
            mileage: 0,
            tirePressure: 100,
            engineHealth: 100,
            outOfService: null,
            upgrades: [],
        });

        // Una corsa in pendingRides (standard, intra-region)
        const ride = {
            id: gs.nextId++,
            fromPoi: { id: 'roma', name: 'Roma Centro', region: 'lazio', type: 'city' },
            toPoi: { id: 'roma_fco', name: 'Fiumicino', region: 'lazio', type: 'hub' },
            tier: 'standard',
            price: 150,
            duration: 20000,
            elapsed: 0,
            driverId: null,
        };
        gs.pendingRides.push(ride);

        const cashBefore = gs.cash;
        const reputationBefore = gs.reputation;
        const driverBefore = gs.drivers.find(d => d.id === 'd1');

        // ── 1. ASSEGNAZIONE ───────────────────────────────────────────────
        sandbox.assignRideToDriver(ride.id, 'd1');

        // La corsa deve essere uscita da pendingRides
        assert.equal(gs.pendingRides.length, 0, 'la corsa deve essere rimossa da pendingRides');
        // L'autista era idle → startNextRide viene chiamato subito → la corsa passa dalla coda ad activeRides
        // Quindi la coda è vuota ma l'autista è busy con un activeTrip
        assert.equal(driverBefore.status, 'busy', 'l\'autista deve diventare busy subito (startNextRide)');
        assert.equal(driverBefore.queue.length, 0, 'la coda è vuota perché la corsa è partita immediatamente');

        // Deve essere stato creato un activeTrip con endTime nel futuro
        assert.equal(gs.activeTrips.length, 1, 'deve esserci un activeTrip');
        const trip = gs.activeTrips[0];
        assert.equal(trip.driverId, 'd1');
        assert.ok(trip.endTime > Date.now(), 'endTime deve essere nel futuro');
        assert.equal(trip.earnings, null, 'earnings deve essere null (pagamento differito)');
        // Anche activeRides deve avere la corsa (simulazione visiva)
        assert.equal(gs.activeRides.length, 1, 'deve esserci una corsa in activeRides per la simulazione visiva');

        // ── 2. COMPLETAMENTO SIMULAZIONE VISIVA ────────────────────────────
        // Nel gioco reale: gameLoop incrementa ride.elapsed, quando supera duration
        // chiama completeRide(ride, true) che calcola l'incasso e imposta trip.earnings
        // Qui simuliamo direttamente quel passaggio.
        const rideInActive = gs.activeRides.find(r => r.id === ride.id);
        assert.ok(rideInActive, 'la corsa deve essere in activeRides per la simulazione visiva');

        // Traccia chiamate a CE_money PRIMA di completeRide (la reputazione viene aggiunta lì)
        const ceMoneyCalls = [];
        const origEarn = sandbox.CE_money.earn;
        sandbox.CE_money.earn = function (amount, reason) {
            ceMoneyCalls.push({ type: 'earn', amount, reason });
            return origEarn.apply(this, arguments);
        };
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = function (delta) {
            ceMoneyCalls.push({ type: 'addReputation', delta });
            return origAddRep.apply(this, arguments);
        };

        // Traccia syncCash
        const syncedCash = [];
        const origSync = sandbox.window.ServerState.syncCash;
        sandbox.window.ServerState.syncCash = async (cash) => {
            syncedCash.push(cash);
            return origSync ? origSync(cash) : { success: true, cash };
        };

        // Completa la corsa con pagamento differito (come farebbe gameLoop)
        sandbox.completeRide(rideInActive, true);
        await new Promise(r => setImmediate(r));

        // Ora il trip deve avere earnings impostato
        const tripAfterComplete = gs.activeTrips.find(t => t.id === ride.id);
        assert.ok(tripAfterComplete, 'il trip deve esistere ancora');
        assert.ok(tripAfterComplete.earnings != null, 'trip.earnings deve essere stato impostato da completeRide');
        assert.ok(tripAfterComplete.earnings > 0, 'l\'incasso calcolato deve essere > 0');

        // Avanza il tempo oltre endTime per far scattare checkActiveTrips
        tripAfterComplete.endTime = Date.now() - 1000;

        // ── 3. INCASSO (checkActiveTrips processa il viaggio scaduto) ─────
        sandbox.checkActiveTrips();
        await new Promise(r => setImmediate(r)); // attendi promise RPC

        // ── VERIFICHE ──────────────────────────────────────────────────────

        // 3a. Incasso: CE_money.earn deve essere stato chiamato
        const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
        assert.ok(earnCalls.length >= 1, 'checkActiveTrips deve passare da CE_money.earn per l\'incasso');
        const totalEarned = earnCalls.reduce((sum, c) => sum + c.amount, 0);
        assert.ok(totalEarned > 0, 'l\'incasso deve essere > 0');

        // 3b. Saldo aggiornato localmente
        assert.ok(gs.cash > cashBefore, 'il saldo deve essere aumentato dopo l\'incasso');
        assert.equal(gs.cash, cashBefore + totalEarned, 'il saldo deve corrispondere esattamente all\'incasso');

        // 3c. Sincronizzazione col server: syncCash deve essere stato chiamato col totale finale
        assert.ok(syncedCash.length >= 1, 'deve esserci almeno un syncCash');
        assert.equal(syncedCash[syncedCash.length - 1], gs.cash, 'l\'ultimo syncCash deve portare il saldo finale');

        // 4. AUTISTA LIBERO
        const driverAfter = gs.drivers.find(d => d.id === 'd1');
        assert.equal(driverAfter.status, 'idle', 'l\'autista deve tornare idle dopo il pagamento');
        assert.equal(driverAfter.queue.length, 0, 'la coda dell\'autista deve essere vuota');
        assert.equal(gs.activeTrips.length, 0, 'activeTrips deve essere vuoto dopo il completamento');

        // 5. REPUTAZIONE
        const repCalls = ceMoneyCalls.filter(c => c.type === 'addReputation');
        assert.ok(repCalls.length >= 1, 'deve esserci una chiamata a CE_money.addReputation');
        const totalRep = repCalls.reduce((sum, c) => sum + c.delta, 0);
        assert.ok(totalRep > 0, 'la reputazione deve aumentare');
        assert.ok(gs.reputation > reputationBefore, 'la reputazione in gameState deve essere aumentata');

        // 6. NO DOPPIO PAGAMENTO: richiamare checkActiveTrips non deve pagare di nuovo
        const cashAfterFirst = gs.cash;
        sandbox.checkActiveTrips();
        await new Promise(r => setImmediate(r));
        assert.equal(gs.cash, cashAfterFirst, 'il secondo checkActiveTrips non deve pagare una seconda volta');

        // 7. VERIFICA CHE IL DENARO SIA PASSATO SOLO DA CE_money (niente gameState.cash diretto)
        // Questo è implicito nelle verifiche sopra: se il codice avesse fatto gs.cash += direttamente
        // senza passare per CE_money.earn, earnCalls sarebbe vuoto e il test fallirebbe.
    });

    test('FLUSSO CON completeRide immediato (_deferPay = false)', async () => {
        // Variante: completeRide chiamato direttamente con _deferPay = false
        // (es. completamento manuale o test legacy)
        gs.cash = 3000;
        gs.reputation = 2.0;

        gs.drivers.push({
            id: 'd2', name: 'Luigi', status: 'busy', queue: [],
            assignedCarId: 'c2', level: 0, trait: null,
            skill_efficiency: 50, skill_charisma: 50, skill_speed: 50,
            stress_level: 0, burnout_until: null,
        });
        gs.fleet.push({
            id: 'c2', name: 'Stellar V-Carrier', tier: 'vip', vehicleClass: 'stellar_v_carr',
            condition: 100, fuel: 100, mileage: 0, tirePressure: 100,
            engineHealth: 100, outOfService: null, upgrades: [],
        });

        const ride = {
            id: gs.nextId++,
            driverId: 'd2',
            tier: 'business',
            price: 300,
            fromPoi: { id: 'milano', name: 'Milano', region: 'lombardia', type: 'city' },
            toPoi: { id: 'mil_mxp', name: 'Malpensa', region: 'lombardia', type: 'hub' },
            duration: 24000,
            elapsed: 0,
        };

        const ceMoneyCalls = [];
        const origEarn = sandbox.CE_money.earn;
        sandbox.CE_money.earn = function (amount, reason) {
            ceMoneyCalls.push({ type: 'earn', amount, reason });
            return origEarn.apply(this, arguments);
        };
        const origAddRep = sandbox.CE_money.addReputation;
        sandbox.CE_money.addReputation = function (delta) {
            ceMoneyCalls.push({ type: 'addReputation', delta });
            return origAddRep.apply(this, arguments);
        };

        sandbox.completeRide(ride, false); // pagamento immediato
        await new Promise(r => setImmediate(r));

        const earnCalls = ceMoneyCalls.filter(c => c.type === 'earn');
        assert.ok(earnCalls.length >= 1, 'completeRide(_deferPay=false) deve passare da CE_money.earn');
        const repCalls = ceMoneyCalls.filter(c => c.type === 'addReputation');
        assert.ok(repCalls.length >= 1, 'completeRide deve chiamare CE_money.addReputation');

        const driver = gs.drivers.find(d => d.id === 'd2');
        assert.equal(driver.status, 'idle', 'l\'autista deve tornare idle dopo completeRide immediato');
    });
});