'use strict';
/* ============================================================================
   Batteria dei veicoli elettrici: consumo, fermo macchina, ricarica.

   Decisione di Vlad (22/08/2026): `chargeLevel` era mostrato in tre schermate
   ma niente lo faceva scendere, e l'unica funzione che ricaricava
   (superchargeVehicle) era irraggiungibile ed è stata rimossa. Il giocatore
   vedeva una barra sempre al 100%. Qui si prova che:

   1. dopo una corsa la batteria di un EV cala (e il serbatoio no: niente
      doppio consumo);
   2. l'elettrico consuma MENO del gasolio a parità di corsa — è il motivo
      economico per cui esiste;
   3. a batteria scarica il veicolo va fuori servizio con motivo 'battery'
      (distinto dal 'fuel' del gasolio) e non prende altre corse;
   4. la ricarica esiste, è raggiungibile da un pulsante VERO nel pannello
      Flotta, scala il denaro una volta sola e rimette in servizio il veicolo.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/** Banco pulito: freshEnv non espone gameState, si legge dal sandbox. */
function banco() {
    const { sandbox } = freshEnv();
    return { sandbox, gs: sandbox.gameState };
}

/** Autista non-CEO con un EV in flotta, pronto a partire. */
function conEvCaricato(gs, extraCar = {}) {
    gs.drivers.push({
        id: 'd_ev', name: 'Watt', status: 'idle', queue: [],
        assignedCarId: 'c_ev', level: 0,
    });
    const car = Object.assign({
        id: 'c_ev', name: 'Volt 3-Urban', tier: 'business',
        vehicleClass: 'volt_3_urban', condition: 100,
        upgrades: [], fuel: 100, tirePressure: 100, chargeLevel: 100,
    }, extraCar);
    gs.fleet.push(car);
    return { car, driver: gs.drivers[gs.drivers.length - 1] };
}

/** Corsa cittadina (stessa regione) pronta da mettere in coda. */
function corsaCitta(id = 901, tier = 'business') {
    return {
        id, tier, price: 250,
        fromPoi: { id: 'roma', region: 'lazio', name: 'Roma' },
        toPoi:   { id: 'tivoli', region: 'lazio', name: 'Tivoli' },
    };
}

describe('batteria elettrica — consumo a inizio corsa (startNextRide)', () => {

    test('dopo una corsa la batteria cala e il serbatoio resta intatto', () => {
        const { sandbox, gs } = banco();
        const { car, driver } = conEvCaricato(gs, { chargeLevel: 80 });
        driver.queue.push(corsaCitta());

        sandbox.startNextRide(driver);

        assert.ok(car.chargeLevel < 80,
            `la batteria deve scendere sotto l'80% dopo una corsa (trovata: ${car.chargeLevel})`);
        assert.equal(car.fuel, 100, 'gli EV non bruciano gasolio: niente doppio consumo');
    });

    test('a parità di corsa l\'elettrico consuma meno del gasolio (per km costa meno)', () => {
        const { sandbox, gs } = banco();
        // Stesso identico copione per due vetture: un EV e un diesel, tier standard, città.
        const dEv = { id: 'd_ev', name: 'Watt', status: 'idle', queue: [], assignedCarId: 'c_ev', level: 0 };
        const dGo = { id: 'd_go', name: 'Gaso', status: 'idle', queue: [], assignedCarId: 'c_go', level: 0 };
        gs.drivers.push(dEv, dGo);
        const ev = Object.assign(
            { id: 'c_ev', name: 'Volt', tier: 'standard', vehicleClass: 'volt_3_urban',
              condition: 100, upgrades: [], fuel: 100, tirePressure: 100, chargeLevel: 100 });
        const go = Object.assign(
            { id: 'c_go', name: 'Stellar', tier: 'standard', vehicleClass: 'stellar_e_exec',
              condition: 100, upgrades: [], fuel: 100, tirePressure: 100 });
        gs.fleet.push(ev, go);
        dEv.queue.push(corsaCitta(911, 'standard'));
        dGo.queue.push(corsaCitta(912, 'standard'));

        sandbox.startNextRide(dEv);
        sandbox.startNextRide(dGo);

        const perditaEv  = 100 - ev.chargeLevel;
        const perditaGo  = 100 - go.fuel;
        assert.ok(perditaEv > 0, 'l\'EV deve consumare qualcosa');
        assert.ok(perditaEv * 3 <= perditaGo + 0.01,
            `l'elettrico deve consumare almeno un terzo del gasolio (ev ${perditaEv}% vs diesel ${perditaGo}%)`);
    });
});

describe('batteria elettrica — fermo macchina con motivo "battery"', () => {

    test('a batteria scarica il veicolo va fuori servizio e non prende altre corse', () => {
        const { sandbox, gs } = banco();
        const { car, driver } = conEvCaricato(gs, { chargeLevel: 3 }); // una corsa business (5%) la svuota
        driver.queue.push(corsaCitta());

        sandbox.startNextRide(driver);
        assert.equal(car.outOfService, 'battery',
            'motore fermo con motivo "battery", distinto dal "fuel" del gasolio');

        // La prossima corsa non parte finché non si ricarica.
        driver.status = 'idle';
        driver.queue.push(corsaCitta(902));
        sandbox.startNextRide(driver);
        assert.equal(driver.status, 'idle', 'l\'autista resta a terra senza veicolo utilizzabile');
        assert.equal(driver.queue.length, 1, 'la corsa resta in coda, non viene persa');
    });
});

describe('batteria elettrica — ricarica dal pannello Flotta', () => {

    test('chargeVehicle rimette in servizio e scala il denaro una volta sola', () => {
        const { sandbox, gs } = banco();
        gs.cash = 1000;
        const { car } = conEvCaricato(gs, { chargeLevel: 0, outOfService: 'battery' });

        sandbox.chargeVehicle('c_ev');

        assert.equal(gs.cash, 950, 'una ricarica piena costa €50 (€0,50 per punto): scalati una volta');
        assert.equal(car.chargeLevel, 100);
        assert.equal(car.outOfService, null, 'ricaricato = torna in servizio');

        // Seconda chiamata: batteria già piena → nessun altro addebito.
        sandbox.chargeVehicle('c_ev');
        assert.equal(gs.cash, 950, 'ricaricare a batteria piena non deve costare nulla');
    });

    test('senza soldi abbastanza la ricarica non avviene', () => {
        const { sandbox, gs } = banco();
        gs.cash = 10;
        const { car } = conEvCaricato(gs, { chargeLevel: 0, outOfService: 'battery' });

        sandbox.chargeVehicle('c_ev');

        assert.equal(gs.cash, 10);
        assert.equal(car.chargeLevel, 0, 'niente ricarica gratis');
        assert.equal(car.outOfService, 'battery', 'resta fermo');
    });

    test('il pannello Flotta mostra un pulsante VERO di ricarica per gli EV', () => {
        // render:true = le funzioni di rendering vere, con dentro il DOM vuoto
        // di jsdom: serve il contenitore che renderTabFleet si aspetta.
        const env = freshEnv({ render: true });
        env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';
        env.sandbox.gameState.fleet.push(
            { id: 'c_ev', name: 'Volt 3-Urban', tier: 'business', vehicleClass: 'volt_3_urban',
              condition: 100, upgrades: [], fuel: 100, tirePressure: 100, chargeLevel: 40 },
            { id: 'c_go', name: 'Stellar', tier: 'business', vehicleClass: 'stellar_e_exec',
              condition: 100, upgrades: [], fuel: 60, tirePressure: 100 },
        );

        env.sandbox.renderTabFleet();

        const html = env.sandbox.document.getElementById('tab-container').innerHTML;
        const quante = html.split('data-ce-act="chargeVehicle"').length - 1;
        assert.equal(quante, 1, 'un solo pulsante ricarica, sul veicolo elettrico e non sul diesel');
        assert.ok(html.includes('€30'),
            'il costo è visibile sul pulsante: 60 punti mancanti × €0,50 = €30');
    });
});
