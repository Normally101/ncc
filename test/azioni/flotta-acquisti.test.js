'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

// Banco di prova per le azioni di acquisto/vendita della flotta che muovono denaro:
// buyHub, sellHub, buyNpcCar, buyPrototypeCar, confirmLease (firma leasing).
// Regola osservata: se il saldo si muove, la scrittura passa da window.CE_money,
// mai da un gameState.cash -= locale. Se la RPC ha gia' mosso il saldo lato server
// si usano addebitatoDalServer/accreditatoDalServer e NON si risincronizza.

describe('azioni/flotta-acquisti — buyCARUpgrade (test di riferimento)', () => {
    test('installa upgrade valido e spende il prezzo del catalogo una volta sola', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'c_upg_1', name: 'Auto', upgrades: [] };
        sandbox.gameState.fleet.push(car);
        sandbox.gameState.cash = 20000;

        // Il prezzo si legge dal catalogo invece di scriverlo a mano: cosi'
        // il test resta vero anche se il prezzo cambia.
        const prezzo = sandbox.CAR_UPGRADES.find(u => u.id === 'centralina').price;
        sandbox.buyCARUpgrade('c_upg_1', 'centralina');

        assert.ok(car.upgrades.includes('centralina'));
        assert.equal(sandbox.gameState.cash, 20000 - prezzo);
    });
});

// Ogni acquisto qui sotto viene verificato con lo stesso metro: la spesa parte
// da window.CE_money UNA volta sola, con l'importo del catalogo, e il delta di
// cassa finale coincide con quella sola registrazione — se il codice facesse
// anche un gameState.cash -= locale, il delta sarebbe doppio e il test lo vede.

describe('azioni/flotta-acquisti — buyHub', () => {
    test('conquista l\'hub addebitando 50000 + baseFlat*200 UNA volta sola via CE_money', () => {
        const chiamate = [];
        const { sandbox } = freshEnv();
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => {
            chiamate.push({ importo, motivo });
            return origSpend(importo, motivo);
        };
        // Il costo si legge dal catalogo POIS invece di scriverlo a mano.
        const poi = vm.runInContext('POIS["roma_fco"]', sandbox);
        const costoAtteso = 50000 + Math.floor(poi.baseFlat * 200);
        sandbox.gameState.reputation = 3.0;
        sandbox.gameState.ownedHubs = [];
        sandbox.gameState.cash = costoAtteso + 100000;
        const cashPrima = sandbox.gameState.cash;

        sandbox.buyHub('roma_fco');

        assert.equal(chiamate.length, 1, 'la spesa deve passare da CE_money una volta sola');
        assert.equal(chiamate[0].importo, costoAtteso, 'importo esatto del catalogo');
        assert.equal(chiamate[0].motivo, 'buy_hub');
        assert.ok(sandbox.gameState.ownedHubs.includes('roma_fco'));
        assert.equal(sandbox.gameState.cash, cashPrima - costoAtteso,
            'il cash scala esattamente della sola spesa registrata su CE_money');
    });

    test('fondi insufficienti: hub non conquistato, cassa intatta', () => {
        const { sandbox } = freshEnv();
        const poi = vm.runInContext('POIS["roma_fco"]', sandbox);
        const costo = 50000 + Math.floor(poi.baseFlat * 200);
        sandbox.gameState.reputation = 3.0;
        sandbox.gameState.ownedHubs = [];
        sandbox.gameState.cash = costo - 1;

        sandbox.buyHub('roma_fco');

        assert.deepEqual(sandbox.gameState.ownedHubs, [], 'niente hub senza soldi');
        assert.equal(sandbox.gameState.cash, costo - 1, 'nessun movimento di cassa');
    });

    test('hub inesistente: rifiutato senza toccare cassa o concessioni', () => {
        const chiamate = [];
        const { sandbox } = freshEnv();
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => { chiamate.push(importo); return origSpend(importo, motivo); };
        sandbox.gameState.reputation = 3.0;
        sandbox.gameState.ownedHubs = [];
        sandbox.gameState.cash = 999999;

        sandbox.buyHub('hub_che_non_esiste');

        assert.equal(chiamate.length, 0, 'nessuna spesa per un hub inesistente');
        assert.deepEqual(sandbox.gameState.ownedHubs, []);
        assert.equal(sandbox.gameState.cash, 999999);
    });
});

describe('azioni/flotta-acquisti — sellHub (accredita invece di addebitare)', () => {
    test('cede l\'hub accreditando il 60% del costo UNA volta sola via CE_money', () => {
        const accrediti = [];
        const { sandbox } = freshEnv();
        const origEarn = sandbox.CE_money.earn.bind(sandbox.CE_money);
        sandbox.CE_money.earn = (importo, motivo) => {
            accrediti.push({ importo, motivo });
            return origEarn(importo, motivo);
        };
        const poi = vm.runInContext('POIS["roma_fco"]', sandbox);
        const rimborsoAtteso = Math.floor((50000 + Math.floor(poi.baseFlat * 200)) * 0.6);
        sandbox.gameState.ownedHubs = ['roma_fco'];
        sandbox.gameState.cash = 5000;

        sandbox.sellHub('roma_fco');

        // E' l'unica delle quattro che ACCREDITA: chi riceve troppo non si lamenta,
        // quindi il verso e l'importo esatto vanno guardati due volte.
        assert.equal(accrediti.length, 1, 'l\'accredito deve passare da CE_money una volta sola');
        assert.equal(accrediti[0].importo, rimborsoAtteso, 'esattamente il 60% del costo, niente di piu\'');
        assert.equal(accrediti[0].motivo, 'sell_hub');
        assert.ok(!sandbox.gameState.ownedHubs.includes('roma_fco'));
        assert.equal(sandbox.gameState.cash, 5000 + rimborsoAtteso,
            'il cash cresce esattamente dell\'unico accredito registrato');
    });

    test('hub non posseduto: nessun accredito, cassa intatta', () => {
        const accrediti = [];
        const { sandbox } = freshEnv();
        const origEarn = sandbox.CE_money.earn.bind(sandbox.CE_money);
        sandbox.CE_money.earn = (importo, motivo) => { accrediti.push(importo); return origEarn(importo, motivo); };
        sandbox.gameState.ownedHubs = [];
        sandbox.gameState.cash = 5000;

        sandbox.sellHub('roma_fco');

        assert.equal(accrediti.length, 0, 'cedere un hub mai posseduto non puo\' accreditare nulla');
        assert.equal(sandbox.gameState.cash, 5000);
        assert.deepEqual(sandbox.gameState.ownedHubs, []);
    });
});

describe('azioni/flotta-acquisti — buyNpcCar', () => {
    test('compra dal mercato NPC addebitando il prezzo dell\'annuncio UNA volta sola via CE_money', () => {
        const chiamate = [];
        const { sandbox } = freshEnv();
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => {
            chiamate.push({ importo, motivo });
            return origSpend(importo, motivo);
        };
        sandbox.gameState.npcMarket = [
            { id: 'npc_1', name: 'Berlina usata', tier: 'business', vehicleClass: 'mercedes_e', price: 25000, condition: 70, mileage: 40000 }
        ];
        sandbox.gameState.cash = 50000;
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.buyNpcCar('npc_1');

        assert.equal(chiamate.length, 1, 'la spesa deve passare da CE_money una volta sola');
        assert.equal(chiamate[0].importo, 25000);
        assert.equal(chiamate[0].motivo, 'buy_npc_car');
        assert.equal(sandbox.gameState.fleet.length, flottaPrima + 1, 'l\'auto entra in flotta');
        assert.ok(!sandbox.gameState.npcMarket.some(l => l.id === 'npc_1'), 'l\'annuncio esce dal mercato');
        assert.equal(sandbox.gameState.cash, 25000, 'delta cassa = solo il prezzo pagato');
    });

    test('fondi insufficienti: annuncio resta, flotta invariata, cassa intatta', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.npcMarket = [
            { id: 'npc_poor', name: 'Berlina cara', tier: 'business', price: 40000, condition: 70, mileage: 50000 }
        ];
        sandbox.gameState.cash = 100;
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.buyNpcCar('npc_poor');

        assert.equal(sandbox.gameState.cash, 100, 'nessun movimento di cassa');
        assert.equal(sandbox.gameState.fleet.length, flottaPrima);
        assert.equal(sandbox.gameState.npcMarket.length, 1, 'l\'annuncio resta in vendita');
    });
});

describe('azioni/flotta-acquisti — buyPrototypeCar', () => {
    test('acquista il prototipo addebitando proto.price UNA volta sola via CE_money', () => {
        const chiamate = [];
        const { sandbox } = freshEnv();
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => {
            chiamate.push({ importo, motivo });
            return origSpend(importo, motivo);
        };
        /* I requisiti si prendono dal prototipo stesso: scritti a mano erano
           piu' bassi di quelli veri e l'acquisto veniva rifiutato su codice corretto. */
        const proto = vm.runInContext('PROTOTYPE_CARS[0]', sandbox);
        sandbox.gameState.reputation = proto.reqRep;
        sandbox.gameState.questStats.totalRides = proto.rideGate || 0;
        sandbox.gameState.hasEVHub = true;
        sandbox.gameState.cash = proto.price + 100000;

        sandbox.buyPrototypeCar(proto.id);

        assert.equal(chiamate.length, 1, 'la spesa deve passare da CE_money una volta sola');
        assert.equal(chiamate[0].importo, proto.price);
        assert.equal(chiamate[0].motivo, 'buy_prototype_car');
        assert.ok(sandbox.gameState.fleet.some(c => c.protoId === proto.id));
        assert.equal(sandbox.gameState.cash, 100000, 'delta cassa = solo il prezzo del prototipo');
    });

    test('fondi insufficienti: nessun prototipo in flotta, cassa intatta', () => {
        const { sandbox } = freshEnv();
        const proto = vm.runInContext('PROTOTYPE_CARS[0]', sandbox);
        sandbox.gameState.reputation = proto.reqRep;
        sandbox.gameState.questStats.totalRides = proto.rideGate || 0;
        sandbox.gameState.hasEVHub = true;
        sandbox.gameState.cash = proto.price - 1;
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.buyPrototypeCar(proto.id);

        assert.equal(sandbox.gameState.cash, proto.price - 1, 'nessun movimento di cassa');
        assert.equal(sandbox.gameState.fleet.length, flottaPrima);
    });
});

// ── confirmLease (engine.js, pulsante data-ce-act="confirmLease" del modal leasing) ──
// Unica azione di acquisto veicolo rimasta senza test dedicato. Alla firma NON
// passa denaro: il canone si paga giorno per giorno tramite dailyCost. Quello
// che il test blocca e' la COERENZA del veicolo che entra in flotta — canone
// mensile dalla formula del modal (base + extra km − sconto durata), flag
// isLease (da cui terminateLease calcola la penale) e classe veicolo del tier.

function montaFormLeasing(document, km, mesi) {
    // confirmLease legge solo questi due campi della form del leasing.
    for (const [id, valore] of [['lease-km', String(km)], ['lease-duration', String(mesi)]]) {
        const el = document.createElement('div');
        el.id = id;
        el.value = valore;
        document.body.appendChild(el);
    }
}

describe('azioni/flotta-acquisti — confirmLease (firma del leasing)', () => {
    test('firma il contratto: entra in flotta col canone di catalogo e senza muovere cassa', () => {
        const { sandbox } = freshEnv();
        montaFormLeasing(sandbox.document, 25000, 12);
        /* openLeasingModal e' tra le funzioni di apertura modali che il banco
           neutralizza: le scriviamo direttamente lo stato (let top-level di
           engine.js, condiviso nello stesso contesto VM) che quella funzione
           avrebbe impostato prima del click su "Firma Contratto". */
        vm.runInContext('tempLeaseTier = "stellar_e_exec"', sandbox);
        sandbox.gameState.cash = 50000;
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.confirmLease();

        const tpl = vm.runInContext('LEASING_TEMPLATES["stellar_e_exec"]', sandbox);
        // 25000 km: 5k sopra la base, nessuno sconto durata a 12 mesi.
        const mensile = tpl.baseRate + ((25000 - 20000) / 1000) * (tpl.kmRate * 1000) / 12;
        assert.equal(sandbox.gameState.fleet.length, flottaPrima + 1, 'il veicolo a noleggio entra in flotta');
        const car = sandbox.gameState.fleet[sandbox.gameState.fleet.length - 1];
        assert.equal(car.name, tpl.name + ' (Leasing)');
        assert.equal(car.isLease, true, 'segnato come leasing: terminateLease ci si aggancia');
        assert.equal(car.tier, tpl.tier);
        assert.equal(car.vehicleClass, 'stellar_e_exec');
        assert.equal(car.leaseDuration, 12);
        assert.equal(car.leaseElapsedDays, 0);
        assert.equal(car.leaseMonthlyRate, Math.floor(mensile), 'canone mensile = formula del modal');
        assert.ok(Math.abs(car.dailyCost - mensile / 30) < 1e-9, 'il costo giornaliero deriva dal canone mensile');
        assert.equal(sandbox.gameState.cash, 50000, 'alla firma non passa denaro: il canone si paga giorno per giorno');
    });

    test('contratto lungo (>12 mesi): sconto di 5€ sul canone per ogni mese oltre il dodicesimo', () => {
        const { sandbox } = freshEnv();
        montaFormLeasing(sandbox.document, 20000, 24); // nessun extra km
        vm.runInContext('tempLeaseTier = "stellar_e_exec"', sandbox);
        const flottaPrima = sandbox.gameState.fleet.length;

        sandbox.confirmLease();

        const tpl = vm.runInContext('LEASING_TEMPLATES["stellar_e_exec"]', sandbox);
        const mensileAtteso = tpl.baseRate - (24 * 5);
        assert.equal(sandbox.gameState.fleet.length, flottaPrima + 1);
        const car = sandbox.gameState.fleet[sandbox.gameState.fleet.length - 1];
        assert.equal(car.leaseDuration, 24);
        assert.equal(car.leaseMonthlyRate, mensileAtteso, '1200 − 120 di sconto durata = 1080');
    });
});
