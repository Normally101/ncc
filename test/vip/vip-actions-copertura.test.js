'use strict';
/* ============================================================================
   test/vip/vip-actions-copertura.test.js

   IL BUCO che questo file chiude: la catena REALE di completamento di una
   corsa VIP. Tutte le suite esistenti (vip-sync, email-actions, vip-eventi,
   vip-contratti, funzioni/vip, vip-persistence-echo) invocano
   window._vipOnComplete DIRETTAMENTE oppure provano completeRide solo con
   corse NORMALI. Nessuno esercita il gancio di engine-rides.js:975:

       if (ride.vipClientId && typeof window._vipOnComplete === 'function')
           window._vipOnComplete(ride.vipClientId, ride, driver, earned);

   Se quel gancio sparisce (rename, rimozione, ride.vipClientId perso lungo
   assign/startNextRide) ogni suite resta verde mentre in gioco mance, buff,
   token e multe VIP cessano di esistere. Qui una corsa VIP nasce dal VERO
   bottone acceptVip* e viene chiusa dal VERO completeRide del motore.

   Regola anti-regressione economica: le asserzioni sulla coda di syncCash
   rendono questi test ROSSI se la sincronizzazione col server viene tolta
   da CE_money.earn/spend (la porta unica di money.js).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function vipEnv() {
    const env = freshEnv();
    const gs = env.gs = env.sandbox.gameState;
    // Recorder della sincronizzazione cassa->server, stesso schema di azioni/vip-eventi.
    env.syncCashCalls = [];
    const origSync = env.sandbox.ServerState.syncCash.bind(env.sandbox.ServerState);
    env.sandbox.ServerState.syncCash = (cash) => {
        env.syncCashCalls.push(cash);
        return origSync(cash);
    };
    return env;
}

function pushEmail(gs, type, vipData) {
    const id = gs.nextId++;
    gs.emails.push({
        id, sender: 'Test VIP', subject: 's', type, status: 'unread',
        vipData, expiresAt: gs.day * 24 + gs.hour + 8,
    });
    return id;
}

const car = (id, vehicleClass, condition = 100) => ({
    id, vehicleClass, condition, outOfService: null, isSeized: false,
});
const driverOf = (carId, opts = {}) => ({
    id: opts.id ?? ('drv_' + carId), name: 'Boris', assignedCarId: carId,
    restHoursLeft: 0, isOnStrike: false,
    level: opts.level ?? 3, tier: 'standard',
    stress_level: opts.stress ?? 0,
    queue: [], status: 'idle', // forma reale: completeRide chiude con startNextRide(driver)
});

// Piloti Math.random solo dentro fn (il sandbox condivise il Math del processo).
function conRandom(sandbox, valore, fn) {
    const orig = sandbox.Math.random;
    sandbox.Math.random = () => valore;
    try { return fn(); } finally { sandbox.Math.random = orig; }
}

describe('vip-integrazione — una corsa VIP vera attraversa completeRide fino alla cassa', () => {

    test('Grigori end-to-end: acceptVipGrigori -> completeRide paga la corsa E la mancia di 15.000€, ognuna sincronizzata', async () => {
        const { sandbox, gs, syncCashCalls } = vipEnv();
        gs.reputation = 3;
        gs.fleet = [car('v1', 'majestic_spirit', 96)];
        gs.drivers = [driverOf('v1')];
        const id = pushEmail(gs, 'vip_grigori', { fromId: 'roma', toId: 'milano', price: 8000 });

        sandbox.acceptVipGrigori(id);
        assert.equal(gs.pendingRides.length, 1, 'precondizione: il bottone ha creato la corsa');
        const ride = gs.pendingRides.shift();
        // Il handler di Grigori non tocca auto né autista: stacchiamo l'auto per
        // escludere dal conto il rifornimento automatico di fine corsa.
        gs.drivers[0].assignedCarId = null;

        const cashPrima = gs.cash;
        // random alto: niente ritardo/extra, niente drop DC dell'ultra, né orologio/evento Grigori
        conRandom(sandbox, 0.99, () => sandbox.completeRide(ride));
        await new Promise(r => setImmediate(r)); // le syncCash di CE_money sono fire-and-forget

        assert.equal(syncCashCalls.length, 2,
            'due incassi (corsa + mancia) = due sincronizzazioni: se il gancio VIP in completeRide è morto qui ne arriva UNA');
        assert.equal(syncCashCalls[1] - syncCashCalls[0], 15000,
            'la seconda sincronizzazione è la mancia fissa di €15.000 di _vipCompleteGrigori');
        assert.equal(gs.cash, syncCashCalls[1], 'la cassa locale coincide con l\'ultimo saldo dichiarato al server');
        assert.ok(gs.cash > cashPrima);
        assert.ok(gs.reputation > 3, '+0.02 corsa e +0.1 mancia devono alzare la reputazione');
    });

    test('Golden Boy end-to-end: completeRide passa al handler il VERO driver, il danno va sull\'auto usata e nessun euro extra muove', async () => {
        const { sandbox, gs, syncCashCalls } = vipEnv();
        gs.fleet = [
            car('v1', 'volt_s_hyper', 100),
            car('esca', 'majestic_spirit', 100), // auto congelata su ride.carId: NON deve prendersi il danno
        ];
        const drv = driverOf('v1', { stress: 50 });
        const collega = driverOf(null, { id: 'drv_altro', stress: 15 });
        collega.assignedCarId = null;
        gs.drivers = [drv, collega];
        const id = pushEmail(gs, 'vip_golden', { fromId: 'roma', toId: 'milano', price: 12000 });

        sandbox.acceptVipGolden(id);
        const ride = gs.pendingRides.shift();
        assert.equal(ride.carId, 'v1');
        // Fuori dallo scenario reale l'autista può essere riassegnato: stacchiamo l'auto
        // (e così evitiamo anche il rifornimento automatico, fuori da ciò che testiamo).
        drv.assignedCarId = null;

        conRandom(sandbox, 0.10, () => sandbox.completeRide(ride)); // 0.10 < 0.60: ramo danno
        await new Promise(r => setImmediate(r));

        const autoEscamotage = gs.fleet.find(c => c.id === 'esca');
        const autoUsata = gs.fleet.find(c => c.id === 'v1');
        assert.equal(autoEscamotage.condition, 100, 'l\'auto su ride.carId non è quella realmente usata: intatta');
        assert.equal(autoUsata.condition, 83, 'danno atteso 17 (floor(0.10*20)+15) sull\'auto del driver');
        assert.equal(drv.stress_level, 30, 'afterparty: −20 stress anche al driver della corsa');
        assert.equal(collega.stress_level, 0, 'afterparty: −20 stress a TUTTI gli autisti (min 0)');
        assert.equal(syncCashCalls.length, 1, 'il completamento Golden non muove denaro extra: solo l\'incasso della corsa');
        assert.equal(gs.cash, syncCashCalls[0]);
    });

    test('Tech Bro end-to-end: il buff routing +5% arriva solo se completeRide invoca davvero il handler', async () => {
        const { sandbox, gs } = vipEnv();
        gs.fleet = [car('v1', 'volt_3_urban', 95)];
        gs.drivers = [driverOf('v1', { stress: 10 })];
        const id = pushEmail(gs, 'vip_techbro', { fromId: 'roma', toId: 'milano', price: 5000 });

        sandbox.acceptVipTechBro(id);
        const ride = gs.pendingRides.shift();
        ride.driverId = 'drv_v1';
        gs.drivers[0].assignedCarId = null; // evita il refill automatico, irrilevante qui

        conRandom(sandbox, 0.99, () => sandbox.completeRide(ride));

        assert.equal(sandbox._getBuffValue('speed_boost'), 5,
            '_vipCompleteTechBro deve aver ricevuto il controllo dal motore corse');
    });
});

describe('vip-rifiuti — accettazioni con flotta non idonea mai esercitate altrove', () => {

    test('acceptVipStrata senza nessuna berlina business: zero corse, email aperta, avviso', () => {
        const { sandbox, gs, notifications } = vipEnv();
        gs.fleet = [car('v1', 'city_eco', 100)];
        const id = pushEmail(gs, 'vip_strata', { fromId: 'roma', toId: 'milano', price: 3500 });

        sandbox.acceptVipStrata(id);

        assert.equal(gs.pendingRides.length, 0);
        assert.equal(gs.emails.find(e => e.id === id).status, 'unread');
        assert.ok(notifications.some(n => n.type === 'error'), 'il giocatore deve sapere perché è rifiutata');
    });

    test('acceptVipTechBro con autista stressato oltre 20: rifiutata nonostante EV perfetto', () => {
        const { sandbox, gs, notifications } = vipEnv();
        gs.fleet = [car('v1', 'volt_3_urban', 95)];
        gs.drivers = [driverOf('v1', { stress: 80 })];
        const id = pushEmail(gs, 'vip_techbro', { fromId: 'roma', toId: 'milano', price: 5000 });

        sandbox.acceptVipTechBro(id);

        assert.equal(gs.pendingRides.length, 0);
        assert.equal(gs.emails.find(e => e.id === id).status, 'unread');
        assert.ok(notifications.some(n => n.msg.includes('stress')), 'il motivo (stress ≤20%) va comunicato');
    });
});
