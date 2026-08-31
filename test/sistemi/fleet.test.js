'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/fleet — flotta, deposito, upgrade, hub, mercato, asta.

   Fase 3 di PIANO-CHIUSURA.md, sistema 14. Diciannove azioni di engine-fleet.js
   (+ bulkRepairFleet in ui-fleet.js). Quasi tutte a denaro locale (`CE_money`):
   riparazioni, rifornimento deposito, upgrade veicolo, conquista/cessione hub,
   annunci sul mercato, rilancio all'asta. `repairEngine` passa da
   `ServerState.repairVehicle`; `instantRepairDC` da `spendDC`.
   Per ognuna: effetto sullo stato, denaro dalla porta, rifiuto sulle
   precondizioni (fondi, deposito mancante, reputazione, edizione limitata).
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/fleet', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 5_000_000);
        w.gameState.driverCoins = 500;
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.confirm = () => true;
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const auto   = (over = {}) => {
        const c = { id: 'c_test', name: 'Berlina', tier: 'business', condition: 100, engineHealth: 100,
                    fuel: 100, chargeLevel: 100, outOfService: null, upgrades: [], ...over };
        gs().fleet.push(c);
        return c;
    };

    // ── riparazioni ────────────────────────────────────────────────────────

    test('repairEngine: ripara il motore via ServerState e scala il costo', async () => {
        const c = auto({ engineHealth: 40, outOfService: 'engine' });
        const prima = gs().cash;
        await w.repairEngine('c_test');
        assert.equal(c.engineHealth, 100);
        assert.equal(c.outOfService, null);
        assert.ok(gs().cash < prima, 'il costo di riparazione non è stato addebitato');
    });

    test('repairEngine: motore già a 100 → errore, nessun addebito', async () => {
        auto({ engineHealth: 100 });
        const prima = gs().cash;
        await w.repairEngine('c_test');
        assert.equal(gs().cash, prima);
        assert.ok(errori().some(m => /perfette/i.test(m)));
    });

    test('instantRepairDC: −DC e condizione a 100 (info se già perfetta)', () => {
        const c = auto({ condition: 55, outOfService: 'crash' });
        w.instantRepairDC('c_test');
        assert.equal(c.condition, 100);
        assert.equal(gs().driverCoins, 500 - 2);

        w.instantRepairDC('c_test');
        assert.equal(gs().driverCoins, 498, 'già a 100: nessuna seconda spesa');
    });

    test('bulkRepairFleet: chiama payToRepairCar per ogni auto sotto il 100%', async () => {
        auto({ id: 'c1', condition: 60 });
        auto({ id: 'c2', condition: 100 });
        auto({ id: 'c3', condition: 30 });
        const chiamate = [];
        w.payToRepairCar = async (id) => { chiamate.push(id); };

        await w.bulkRepairFleet(['c1', 'c2', 'c3']);

        assert.deepEqual(chiamate.sort(), ['c1', 'c3'], 'doveva riparare solo le due danneggiate');
    });

    // ── deposito carburante ────────────────────────────────────────────────

    describe('deposito carburante', () => {
        beforeEach(() => {
            gs().investments = ['inv_fuel_depot'];
            gs().fuelTank = 0;
            gs().fuelTankCapacity = 10000;
            gs().fuelTankLevel = 1;
        });

        test('buyFuelForDepot: senza deposito rifiuta', () => {
            gs().investments = [];
            const prima = gs().cash;
            w.buyFuelForDepot(1000);
            assert.equal(gs().cash, prima);
            assert.ok(errori().some(m => /Deposito/i.test(m)));
        });

        test('buyFuelForDepot: compra i litri (fino alla capienza) e li mette in deposito', () => {
            const prima = gs().cash;
            w.buyFuelForDepot(3000);
            assert.equal(gs().fuelTank, 3000);
            assert.ok(gs().cash < prima);
        });

        test('upgradeFuelDepot: sale di livello e aumenta la capienza', () => {
            const prima = gs().cash;
            w.upgradeFuelDepot();
            assert.equal(gs().fuelTankLevel, 2);
            assert.equal(gs().fuelTankCapacity, 20000);
            assert.ok(gs().cash < prima);
        });

        test('buyTiresForDepot: +N treni di gomme a €800 l\'uno', () => {
            const prima = gs().cash;
            w.buyTiresForDepot(3);
            assert.equal(gs().depositoGomme, 3);
            assert.equal(gs().cash, prima - 2400);
        });
    });

    test('emergencyRefuel: rifornisce le auto ferme per carburante al triplo prezzo', () => {
        auto({ id: 'c1', outOfService: 'fuel', fuel: 0 });
        const prima = gs().cash;
        w.emergencyRefuel();
        assert.equal(gs().fleet.find(c => c.id === 'c1').fuel, 100);
        assert.ok(gs().cash < prima);

        const prima2 = gs().cash;
        w.emergencyRefuel();        // nessuna più ferma
        assert.equal(gs().cash, prima2);
    });

    test('chargeVehicle: ricarica un EV scarico; su un termico rifiuta', () => {
        // _isElectric(car) guarda car.vehicleClass nel catalogo, non car.fuel
        const ev = auto({ id: 'ev', name: 'Volt', vehicleClass: 'volt_3_urban', chargeLevel: 30 });
        const prima = gs().cash;
        w.chargeVehicle('ev');
        assert.equal(ev.chargeLevel, 100);
        assert.ok(gs().cash < prima);

        auto({ id: 'gas', vehicleClass: 'stellar_e_exec', chargeLevel: 30 });
        w.chargeVehicle('gas');
        assert.ok(errori().some(m => /elettric/i.test(m)));
    });

    // ── upgrade veicolo ───────────────────────────────────────────────────

    test('buyCARUpgrade: installa l\'accessorio e lo scala; non due volte', () => {
        const c = auto();
        const upg = (R.catalogo(env, 'CAR_UPGRADES') || [])[0];
        const prima = gs().cash;

        w.buyCARUpgrade('c_test', upg.id);
        assert.ok(c.upgrades.includes(upg.id));
        assert.equal(gs().cash, prima - upg.price);

        const prima2 = gs().cash;
        w.buyCARUpgrade('c_test', upg.id);
        assert.equal(gs().cash, prima2);
        assert.ok(errori().some(m => /già installato/i.test(m)));
    });

    // ── grey market ──────────────────────────────────────────────────────

    test('acceptGreyMarket: crea la corsa anonima e chiude l\'email', () => {
        const pois = R.catalogo(env, 'POIS') || {};
        const ids = Object.keys(pois).slice(0, 2);
        gs().emails.push({ id: 'gm1', type: 'grey_market', status: 'unread',
            greyRideData: { fromId: ids[0], toId: ids[1], price: 9000, isLong: false } });
        const nPending = gs().pendingRides.length;

        w.acceptGreyMarket('gm1');

        assert.equal(gs().pendingRides.length, nPending + 1);
        assert.equal(gs().emails.find(e => e.id === 'gm1').status, 'resolved');
    });

    // ── contratto manutenzione / pricing ─────────────────────────────────

    test('buyMaintenanceContract: −€10.000 e contratto valido 7 giorni', () => {
        const prima = gs().cash;
        w.buyMaintenanceContract();
        assert.equal(gs().cash, prima - 10000);
        assert.equal(gs().maintenanceContract, true);
        assert.equal(gs().maintenanceContractPaidUntilDay, gs().day + 7);
    });

    test('setPricingStrategy: accetta solo discount/standard/premium', () => {
        w.setPricingStrategy('premium');
        assert.equal(gs().pricingStrategy, 'premium');
        w.setPricingStrategy('a-caso');
        assert.equal(gs().pricingStrategy, 'premium', 'un valore non valido non deve cambiare la strategia');
    });

    // ── prototipo / hub ─────────────────────────────────────────────────

    test('buyPrototypeCar: reputazione sotto la soglia → niente auto, niente spesa', () => {
        const proto = (R.catalogo(env, 'PROTOTYPE_CARS') || [])[0];
        gs().reputation = 0;
        const prima = gs().cash;
        const n = gs().fleet.length;
        w.buyPrototypeCar(proto.id);
        assert.equal(gs().fleet.length, n);
        assert.equal(gs().cash, prima);
        assert.ok(errori().some(m => /Reputazione/i.test(m)));
    });

    test('buyHub / sellHub: conquista a costo pieno, cessione al 60%', () => {
        const pois = R.catalogo(env, 'POIS') || {};
        const hubId = Object.keys(pois).find(k => pois[k].baseFlat != null);
        gs().reputation = 5;
        const costo = 50000 + Math.floor(pois[hubId].baseFlat * 200);
        const prima = gs().cash;

        w.buyHub(hubId);
        assert.ok(gs().ownedHubs.includes(hubId));
        assert.equal(gs().cash, prima - costo);

        const prima2 = gs().cash;
        w.sellHub(hubId);
        assert.ok(!gs().ownedHubs.includes(hubId));
        assert.equal(gs().cash, prima2 + Math.floor(costo * 0.6));
    });

    test('buyHub: reputazione insufficiente → rifiuta', () => {
        const pois = R.catalogo(env, 'POIS') || {};
        const hubId = Object.keys(pois).find(k => pois[k].baseFlat != null);
        gs().reputation = 1;
        const prima = gs().cash;
        w.buyHub(hubId);
        assert.equal(gs().cash, prima);
        assert.ok(!(gs().ownedHubs || []).includes(hubId));
    });

    // ── mercato locale / asta ───────────────────────────────────────────

    test('listCarForSale + cancelListing: l\'annuncio compare e si può ritirare', () => {
        auto({ id: 'c_vend' });
        w.listCarForSale('c_vend', 42000);
        assert.equal(gs().marketplace.length, 1);
        const lid = gs().marketplace[0].id;

        w.listCarForSale('c_vend', 42000);   // già in vendita
        assert.equal(gs().marketplace.length, 1);

        w.cancelListing(lid);
        assert.equal(gs().marketplace.length, 0);
    });

    test('buyNpcCar: compra dal mercato NPC, scala il prezzo e aggiunge l\'auto', () => {
        gs().npcMarket = [{ id: 'npc1', name: 'Usata', tier: 'standard', condition: 70, mileage: 90000, price: 22000 }];
        const prima = gs().cash;
        const n = gs().fleet.length;

        w.buyNpcCar('npc1');

        assert.equal(gs().cash, prima - 22000);
        assert.equal(gs().fleet.length, n + 1);
        assert.equal(gs().npcMarket.length, 0);
    });

    test('bidOnAuction: rilancio valido registra l\'offerta e blocca la liquidità', () => {
        gs().activeAuction = { name: 'Lotto 1', currentBid: 10000, playerBid: 0 };
        const prima = gs().cash;

        w.bidOnAuction(15000);

        assert.equal(gs().activeAuction.playerBid, 15000);
        assert.equal(gs().activeAuction.currentBid, 15000);
        assert.equal(gs().cash, prima - 15000);
    });

    test('bidOnAuction: offerta non superiore al banco → rifiutata', () => {
        gs().activeAuction = { name: 'Lotto 1', currentBid: 10000, playerBid: 0 };
        const prima = gs().cash;
        w.bidOnAuction(9000);
        assert.equal(gs().cash, prima);
        assert.ok(errori().some(m => /bassa/i.test(m)));
    });
});
