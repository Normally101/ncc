'use strict';
/* Azione cieca 1/6 del dominio agenzia-ombra: acceptShadowMission (engine.js:1361).
   Il test verifica il comportamento ATTUALE: crea una corsa tier 'ultra' in
   gameState.pendingRides, marca l'email 'resolved' e alza policeHeat di 10
   con tetto a 100. Nessuna scrittura nel repository: tutto in sandbox vm. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..', '..');

function caricaEngine() {
    // Contesto minimale: engine.js dichiara tutto a livello di script,
    // quindi let/function finiscono nello scope globale della sandbox.
    const ctx = { console, setTimeout, clearTimeout };
    ctx.window = ctx; // engine fa window.acceptShadowMission = ...
    vm.createContext(ctx);
    // POIS è risolto da data.js nel browser: qui versione minima con la forma usata dall'azione.
    vm.runInContext(
        "const POIS = {" +
        " p1: { id: 'p1', name: 'Roma', lat: 41.9, lng: 12.5 }," +
        " p2: { id: 'p2', name: 'Milano', lat: 45.4, lng: 9.1 } };",
        ctx
    );
    vm.runInContext(fs.readFileSync(path.join(RADICE, 'engine.js'), 'utf8'), ctx);
    // Funzioni esterne chiamate senza guardie typeof: sostituite dopo il caricamento.
    ctx.logToMap = () => {};
    ctx._tabIs = () => false;
    ctx.saveGame = () => {};
    return ctx;
}

function preparaStato(ctx, policeHeat) {
    vm.runInContext(`
        gameState.nextId = 1;
        gameState.pendingRides = [];
        gameState.policeHeat = ${policeHeat};
        gameState.emails = [{
            id: 'em1', type: 'shadow', status: 'unread',
            shadowData: { fromId: 'p1', toId: 'p2', price: 5000, seizureRisk: 30 },
        }];
    `, ctx);
}

test('acceptShadowMission: una missione ombra diventa una corsa ultra tracciata', () => {
    const ctx = caricaEngine();
    preparaStato(ctx, 20);
    vm.runInContext("acceptShadowMission('em1')", ctx);
    const s = vm.runInContext(`({
        num: gameState.pendingRides.length,
        ride: gameState.pendingRides[0],
        status: gameState.emails[0].status,
        heat: gameState.policeHeat,
    })`, ctx);
    assert.strictEqual(s.num, 1);
    assert.strictEqual(s.ride.tier, 'ultra');
    assert.strictEqual(s.ride.isShadowMission, true);
    assert.strictEqual(s.ride.price, 5000);
    assert.strictEqual(s.ride.seizureRisk, 30);
    assert.strictEqual(s.ride.fromPoi.name, 'Roma');
    assert.strictEqual(s.ride.toPoi.name, 'Milano');
    assert.strictEqual(s.status, 'resolved');
    assert.strictEqual(s.heat, 30, 'policeHeat cresce di 10');
});

test('acceptShadowMission: policeHeat non supera mai 100', () => {
    const ctx = caricaEngine();
    preparaStato(ctx, 95);
    vm.runInContext("acceptShadowMission('em1')", ctx);
    const heat = vm.runInContext('gameState.policeHeat', ctx);
    assert.strictEqual(heat, 100);
});

test("acceptShadowMission: ignora le email che non sono di tipo 'shadow'", () => {
    const ctx = caricaEngine();
    preparaStato(ctx, 20);
    vm.runInContext("gameState.emails[0].type = 'finance'", ctx);
    vm.runInContext("acceptShadowMission('em1')", ctx);
    const s = vm.runInContext(`({
        num: gameState.pendingRides.length,
        status: gameState.emails[0].status,
        heat: gameState.policeHeat,
    })`, ctx);
    assert.strictEqual(s.num, 0);
    assert.strictEqual(s.status, 'unread');
    assert.strictEqual(s.heat, 20);
});

test('acceptShadowMission: se un POI manca non parte nulla', () => {
    const ctx = caricaEngine();
    preparaStato(ctx, 20);
    vm.runInContext("gameState.emails[0].shadowData.toId = 'inesistente'", ctx);
    vm.runInContext("acceptShadowMission('em1')", ctx);
    const s = vm.runInContext(`({
        num: gameState.pendingRides.length,
        status: gameState.emails[0].status,
        heat: gameState.policeHeat,
    })`, ctx);
    assert.strictEqual(s.num, 0);
    assert.strictEqual(s.status, 'unread');
    assert.strictEqual(s.heat, 20);
});
