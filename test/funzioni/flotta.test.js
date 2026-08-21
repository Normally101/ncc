'use strict';
/* ============================================================================
   test/funzioni/flotta.test.js — Collaudo profondo del modulo Flotta

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-fleet.js`, `ui-fleet.js`, `engine.js` (riparazione/vendita)
   e dai relativi gestori in `ce-actions.js`.
   Verificare l'integrità economica (CE_money / ServerState), la gestione
   dei casi limite (motore fuso, leasing, edizioni limitate, Kasko, autisti
   occupati, fondi insufficienti), il deposito aziendale e il rendering UI.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

/**
 * Costruisce un ambiente di gioco pulito con engine-fleet.js e ui-fleet.js.
 */
function creaAmbienteFlotta(opzioni = {}) {
    const chiamateSyncCash = [];
    const chiamateDC = [];
    const chiamateRepair = [];
    const chiamateRefuel = [];
    const chiamateRefillTires = [];
    const chiamateSell = [];
    const bigEvents = [];

    const env = createGameEnv(CORE_FILES, {
        render: opzioni.render !== undefined ? opzioni.render : true,
        serverState: {
            syncCash: async (cash) => {
                chiamateSyncCash.push(cash);
                return { success: true, cash };
            },
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                return { ok: true };
            },
            repairVehicle: async (serverId, cost) => {
                chiamateRepair.push({ serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refuelVehicle: async (serverId, amount, cost) => {
                chiamateRefuel.push({ serverId, amount, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            refillCarTires: async (serverId, cost) => {
                chiamateRefillTires.push({ serverId, cost });
                env.sandbox.gameState.cash = Math.max(0, (env.sandbox.gameState.cash || 0) - cost);
                return { success: true };
            },
            sellVehicle: async (serverId, price) => {
                chiamateSell.push({ serverId, price });
                env.sandbox.gameState.cash = (env.sandbox.gameState.cash || 0) + price;
                return { success: true, sold_price: price };
            },
            ...opzioni.serverStateOverrides,
        },
    });

    const { sandbox } = env;
    sandbox.initGame(true);
    env.stopAllIntervals();

    // Carica ui-fleet.js nella sandbox
    const uiFleetPath = path.resolve(__dirname, '../../ui-fleet.js');
    const uiFleetSrc = fs.readFileSync(uiFleetPath, 'utf8');
    vm.runInContext(uiFleetSrc, sandbox, { filename: 'ui-fleet.js' });

    // Inizializza filtri e DOM
    sandbox.window._fleetFilter = { brand: null, tier: null };
    sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };
    sandbox.window._realShowNotification = (msg, type) => env.notifications.push({ msg, type });

    if (opzioni.cash !== undefined) sandbox.gameState.cash = opzioni.cash;
    if (opzioni.driverCoins !== undefined) sandbox.gameState.driverCoins = opzioni.driverCoins;
    if (opzioni.fleet !== undefined) sandbox.gameState.fleet = opzioni.fleet;

    return {
        env,
        sandbox,
        gs: sandbox.gameState,
        chiamateSyncCash,
        chiamateDC,
        chiamateRepair,
        chiamateRefuel,
        chiamateRefillTires,
        chiamateSell,
        bigEvents,
    };
}

describe('Funzione Flotta — Esecuzione e ciclo di vita', () => {

    // ── 1. MANUTENZIONE E RIPARAZIONE ─────────────────────────────────
    describe('1. Manutenzione e Riparazione (payToRepairCar, repairCostFor, repairEngine, instantRepairDC, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 20000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('payToRepairCar ripara carrozzeria al 100%, scala il costo via ServerState.repairVehicle e azzera outOfService', async () => {
            const { sandbox, gs, chiamateRepair, env } = amb;
            gs.fleet = [{
                id: 'c_test_1',
                _serverId: 'srv_c_1',
                name: 'Mercedes E-Class',
                condition: 60,
                outOfService: 'condition',
            }];

            const prezzoMostrato = sandbox.repairCostFor(gs.fleet[0]);
            assert.ok(prezzoMostrato > 0, 'il prezzo calcolato deve essere positivo');

            await sandbox.payToRepairCar('c_test_1');

            const car = gs.fleet[0];
            assert.equal(car.condition, 100, 'la condizione deve tornare al 100%');
            assert.equal(car.outOfService, null, 'outOfService deve essere azzerato');
            assert.equal(chiamateRepair.length, 1);
            assert.equal(chiamateRepair[0].cost, prezzoMostrato, 'il prezzo addebitato deve coincidere con il prezzo mostrato');
            assert.equal(gs.cash, 20000 - prezzoMostrato);
            assert.ok(env.logs.some(l => l.includes('riparata: 100%')));
        });

        test('Kasko: la polizza Kasko NON azzera la riparazione ordinaria (prezzo mostrato ed addebitato coincidono)', async () => {
            const { sandbox, gs, chiamateRepair } = amb;
            gs.hasKasko = true;
            gs.fleet = [{
                id: 'c_kasko_1',
                _serverId: 'srv_kasko',
                name: 'BMW Serie 7',
                condition: 50,
            }];

            const costoAtteso = sandbox.repairCostFor(gs.fleet[0]);
            assert.ok(costoAtteso > 0, 'repairCostFor non deve regalare la riparazione');

            await sandbox.payToRepairCar('c_kasko_1');

            assert.equal(chiamateRepair.length, 1);
            assert.equal(chiamateRepair[0].cost, costoAtteso, 'il prezzo addebitato non deve essere 0');
            assert.equal(gs.cash, 20000 - costoAtteso);
        });

        test('payToRepairCar rifiuta auto con motore fuso (engineHealth <= 0)', async () => {
            const { sandbox, gs, chiamateRepair, env } = amb;
            gs.fleet = [{
                id: 'c_fuso_1',
                name: 'Audi A6',
                condition: 40,
                engineHealth: 0,
                outOfService: 'engine',
            }];

            await sandbox.payToRepairCar('c_fuso_1');

            assert.equal(chiamateRepair.length, 0, 'nessuna riparazione deve essere eseguita');
            assert.equal(gs.fleet[0].condition, 40, 'la carrozzeria resta invariata');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));
        });

        test('payToRepairCar rifiuta veicolo inesistente o fondi insufficienti', async () => {
            const { sandbox, gs, chiamateRepair, env } = amb;
            gs.cash = 10;
            gs.fleet = [{ id: 'c_povero', name: 'Fiat Panda', condition: 10 }];

            // Auto inesistente
            await sandbox.payToRepairCar('id_fantasma');
            assert.equal(chiamateRepair.length, 0);

            // Fondi insufficienti
            await sandbox.payToRepairCar('c_povero');
            assert.equal(chiamateRepair.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')));
        });

        test('repairEngine ripara motore al 100%, scala max(800, damage*180) e azzera outOfService engine', async () => {
            const { sandbox, gs, chiamateRepair, env } = amb;
            gs.fleet = [{
                id: 'c_eng_1',
                _serverId: 'srv_eng_1',
                name: 'Mercedes S-Class',
                engineHealth: 40,
                outOfService: 'engine',
            }];

            // Danno = 60 -> Costo = max(800, 60 * 180) = 10800
            await sandbox.repairEngine('c_eng_1');

            const car = gs.fleet[0];
            assert.equal(car.engineHealth, 100);
            assert.equal(car.outOfService, null);
            assert.equal(chiamateRepair.length, 1);
            assert.equal(chiamateRepair[0].cost, 10800);
            assert.equal(gs.cash, 20000 - 10800);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('riparato')));
        });

        test('instantRepairDC ripara istantaneamente a 100% spendendo 2 DC (o 1 DC con executivePassActive)', () => {
            const { sandbox, gs, chiamateDC } = amb;
            gs.driverCoins = 10;
            gs.fleet = [
                { id: 'c_dc_1', name: 'Jaguar XF', condition: 20, outOfService: 'condition' },
                { id: 'c_dc_2', name: 'Jaguar XJ', condition: 30, outOfService: 'condition' },
            ];

            // 1. Riparazione normale: costa 2 DC
            sandbox.instantRepairDC('c_dc_1');
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.driverCoins, 8);
            assert.equal(chiamateDC[0].n, 2);

            // 2. Con Executive Pass attivo: costa 1 DC
            gs.executivePassActive = true;
            sandbox.instantRepairDC('c_dc_2');
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.driverCoins, 7);
            assert.equal(chiamateDC[1].n, 1);
        });

        test('bulkRepairFleet ripara tutte le auto danneggiate del gruppo (accetta sia array che stringa JSON)', async () => {
            const { sandbox, gs, chiamateRepair } = amb;
            gs.fleet = [
                { id: 'c_grp_1', _serverId: 'srv_1', name: 'Model S', condition: 70 },
                { id: 'c_grp_2', _serverId: 'srv_2', name: 'Model S', condition: 80 },
                { id: 'c_grp_3', _serverId: 'srv_3', name: 'Model S', condition: 100 },
            ];

            // Invocazione con array
            sandbox.bulkRepairFleet(['c_grp_1', 'c_grp_2', 'c_grp_3']);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(chiamateRepair.length, 2, 'ripara solo le due auto con condition < 100');

            // Invocazione con stringa JSON (pattern usato dai dataset DOM)
            gs.fleet[0].condition = 50;
            sandbox.bulkRepairFleet(JSON.stringify(['c_grp_1']));
            await new Promise(r => setImmediate(r));
            assert.equal(gs.fleet[0].condition, 100);
        });
    });

    // ── 2. RIFORNIMENTO E PRESSIONE GOMME ─────────────────────────────
    describe('2. Rifornimento e Pressione Gomme (buyStandardFuel, buyBlackMarketFuel, superchargeVehicle, refillTires)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 10000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyStandardFuel calcola litri mancanti (fuelNeeded * 0.5) e rifornisce al 100% via ServerState.refuelVehicle', async () => {
            const { sandbox, gs, chiamateRefuel, env } = amb;
            gs.fuelPrice = 2.00;
            gs.fleet = [{
                id: 'c_fuel_1',
                _serverId: 'srv_f1',
                name: 'Mercedes V-Class',
                fuel: 40,
                engineHealth: 100,
                outOfService: 'fuel',
            }];

            // Mancano 60% -> Litri = 30 -> Costo = Math.floor(30 * 2.00) = 60€
            await sandbox.buyStandardFuel('c_fuel_1');

            const car = gs.fleet[0];
            assert.equal(car.fuel, 100);
            assert.equal(car.outOfService, null);
            assert.equal(chiamateRefuel.length, 1);
            assert.equal(chiamateRefuel[0].amount, 30);
            assert.equal(chiamateRefuel[0].cost, 60);
            assert.equal(gs.cash, 10000 - 60);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Rifornimento standard')));
        });

        test('buyStandardFuel rifiuta se serbatoio pieno o motore fuso', async () => {
            const { sandbox, gs, chiamateRefuel, env } = amb;
            gs.fleet = [
                { id: 'c_full', name: 'Car Full', fuel: 100, engineHealth: 100 },
                { id: 'c_dead_eng', name: 'Car Dead', fuel: 10, engineHealth: 0 },
            ];

            await sandbox.buyStandardFuel('c_full');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già pieno')));

            await sandbox.buyStandardFuel('c_dead_eng');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Motore fuso')));

            assert.equal(chiamateRefuel.length, 0);
        });

        test('buyBlackMarketFuel applica sconto del 40% sul carburante', async () => {
            const { sandbox, gs, chiamateRefuel } = amb;
            gs.fuelPrice = 2.00; // Prezzo mercato nero: 2.00 * 0.60 = 1.20€/L
            gs.fleet = [{
                id: 'c_bm_1',
                _serverId: 'srv_bm1',
                name: 'Lancia Thema',
                fuel: 50,
                engineHealth: 100,
            }];

            // Mancano 50% -> 25L -> Costo = Math.floor(25 * 1.20) = 30€
            await sandbox.buyBlackMarketFuel('c_bm_1');

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(chiamateRefuel.length, 1);
            assert.equal(chiamateRefuel[0].cost, 30);
            assert.equal(gs.cash, 10000 - 30);
        });

        test('superchargeVehicle ricarica al 100% veicolo EV a €80; rifiuta veicoli a benzina o già carichi', async () => {
            const { sandbox, gs, chiamateRefuel, env } = amb;
            gs.fleet = [
                { id: 'c_ev_1', _serverId: 'srv_ev1', name: 'Stellar Q', vehicleClass: 'stellar_q_exec', chargeLevel: 20, outOfService: 'fuel' },
                { id: 'c_petrol', name: 'Mercedes E-Class', vehicleClass: 'mercedes_e', fuel: 20 },
            ];

            // 1. Ricarica EV
            await sandbox.superchargeVehicle('c_ev_1');
            assert.equal(gs.fleet[0].chargeLevel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(chiamateRefuel.length, 1);
            assert.equal(chiamateRefuel[0].cost, 80);

            // 2. Veicolo a benzina: rifiutato
            await sandbox.superchargeVehicle('c_petrol');
            assert.equal(chiamateRefuel.length, 1, 'non deve ricaricare veicolo termico');

            // 3. EV già al 100%: rifiutato
            await sandbox.superchargeVehicle('c_ev_1');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Batteria già al 100%')));
        });

        test('refillTires ripristina pressione a 100, scala il costo e azzera outOfService tires', async () => {
            const { sandbox, gs, chiamateRefillTires } = amb;
            gs.fleet = [{
                id: 'c_tires_1',
                _serverId: 'srv_t1',
                name: 'Porsche Panamera',
                tirePressure: 50,
                outOfService: 'tires',
            }];

            // Mancano 50 -> Costo = Math.ceil(50 * 0.8) = 40€
            await sandbox.refillTires('c_tires_1');

            const car = gs.fleet[0];
            assert.equal(car.tirePressure, 100);
            assert.equal(car.outOfService, null, 'outOfService tires deve essere rimosso');
            assert.equal(chiamateRefillTires.length, 1);
            assert.equal(chiamateRefillTires[0].cost, 40);
            assert.equal(gs.cash, 10000 - 40);
        });
    });

    // ── 3. DEPOSITO CARBURANTE E GOMME AZIENDALE ───────────────────────
    describe('3. Deposito Carburante e Gomme (buyFuelForDepot, upgradeFuelDepot, buyTiresForDepot, emergencyRefuel)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 50000 });
            amb.gs.investments = ['inv_fuel_depot'];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyFuelForDepot richiede inv_fuel_depot, calcola sconti e aggiorna il serbatoio aziendale', () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            gs.fuelTankCapacity = 10000;
            gs.fuelTank = 2000;
            gs.fuelPrice = 2.00;

            // Acquisto 5.000 litri -> serbatoio diventa 7.000 -> costo = 5000 * 2.00 = €10.000
            sandbox.buyFuelForDepot(5000);

            assert.equal(gs.fuelTank, 7000);
            assert.equal(gs.cash, 40000);
            assert.equal(chiamateSyncCash[chiamateSyncCash.length - 1], 40000);
        });

        test('buyFuelForDepot senza investimento inv_fuel_depot viene bloccato', () => {
            const { sandbox, gs, env } = amb;
            gs.investments = [];

            sandbox.buyFuelForDepot(5000);

            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Acquista prima il Deposito')));
        });

        test('upgradeFuelDepot potenzia livello e capacità fino al massimo', () => {
            const { sandbox, gs, bigEvents } = amb;
            gs.fuelTankLevel = 1;
            gs.fuelTankCapacity = 10000;

            // Livello 1 -> 2: Costo = 5000 * 1^1.8 = 5000
            sandbox.upgradeFuelDepot();

            assert.equal(gs.fuelTankLevel, 2);
            assert.equal(gs.fuelTankCapacity, 20000);
            assert.equal(gs.cash, 45000);
            assert.ok(bigEvents.some(e => e.title.includes('Deposito Potenziato!')));
        });

        test('buyTiresForDepot acquista treni di gomme a €800 cad.', () => {
            const { sandbox, gs } = amb;
            gs.depositoGomme = 2;

            sandbox.buyTiresForDepot(5); // 5 * 800 = 4000€

            assert.equal(gs.depositoGomme, 7);
            assert.equal(gs.cash, 46000);
        });

        test('emergencyRefuel rifornisce al triplo del prezzo tutte le auto ferme per mancanza carburante', () => {
            const { sandbox, gs } = amb;
            gs.fuelPrice = 2.00;
            gs.fleet = [
                { id: 'c_stop_1', fuel: 0, outOfService: 'fuel' },
                { id: 'c_stop_2', fuel: 0, outOfService: 'fuel' },
                { id: 'c_ok', fuel: 80, outOfService: null },
            ];

            // 2 auto ferme * 80L * (2.00 * 3) = 160 * 6 = €960
            sandbox.emergencyRefuel();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].outOfService, null);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[1].outOfService, null);
            assert.equal(gs.cash, 50000 - 960);
        });
    });

    // ── 4. UPGRADE VEICOLO, SKIN E STRATEGIA TARIFFARIA ─────────────────
    describe('4. Upgrade Veicolo, Skin e Strategia Tariffaria (buyCARUpgrade, applyVehicleSkin, setPricingStrategy)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 20000, driverCoins: 50 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyCARUpgrade installa upgrade, scala il prezzo ed evita acquisto doppio', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'c_upg_1', name: 'Maserati Ghibli', upgrades: [] }];

            // Upgrade centralina: prezzo €12.000
            sandbox.buyCARUpgrade('c_upg_1', 'centralina');

            assert.ok(gs.fleet[0].upgrades.includes('centralina'));
            assert.equal(gs.cash, 8000);

            // Secondo acquisto dello stesso upgrade: bloccato senza addebito
            sandbox.buyCARUpgrade('c_upg_1', 'centralina');
            assert.equal(gs.cash, 8000);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Upgrade già installato')));
        });

        test('applyVehicleSkin scala Driver Coins e applica la livrea estetica', () => {
            const { sandbox, gs, chiamateDC } = amb;
            gs.fleet = [{ id: 'c_skin_1', name: 'Ferrari Roma', skin: null }];

            // Skin matte_black costa 10 DC
            sandbox.applyVehicleSkin('c_skin_1', 'matte_black');

            assert.equal(gs.fleet[0].skin, 'matte_black');
            assert.equal(gs.driverCoins, 40);
            assert.equal(chiamateDC[0].n, 10);
            assert.equal(chiamateDC[0].motivo, 'vehicle_skin');
        });

        test('setPricingStrategy imposta pricingStrategy tra discount, standard, premium e rifiuta altri valori', () => {
            const { sandbox, gs } = amb;

            sandbox.setPricingStrategy('premium');
            assert.equal(gs.pricingStrategy, 'premium');

            sandbox.setPricingStrategy('discount');
            assert.equal(gs.pricingStrategy, 'discount');

            sandbox.setPricingStrategy('strategia_invalida');
            assert.equal(gs.pricingStrategy, 'discount', 'valore non valido non deve alterare lo stato');
        });
    });

    // ── 5. OPERAZIONI FLOTTA: HUB, RIENTRO E GREY MARKET ───────────────
    describe('5. Hub Conquest, Rientro e Grey Market (buyHub, sellHub, returnToHub, acceptGreyMarket)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 150000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyHub richiede reputazione >= 2.5 e acquista hub; sellHub cede l\'hub al 60% del valore', () => {
            const { sandbox, gs, bigEvents } = amb;
            gs.reputation = 3.0;
            gs.ownedHubs = [];

            // POIS['roma_fco']: baseFlat = 90 -> Costo = 50000 + 90*200 = 68.000€
            sandbox.buyHub('roma_fco');

            assert.ok(gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 150000 - 68000);
            assert.ok(bigEvents.some(e => e.title.includes('Hub Conquistato')));

            // Cessione Hub: 68.000 * 0.60 = 40.800€
            sandbox.sellHub('roma_fco');
            assert.ok(!gs.ownedHubs.includes('roma_fco'));
            assert.equal(gs.cash, 150000 - 68000 + 40800);
        });

        test('returnToHub calcola distanza, costi di viaggio e manda l\'autista in rientro', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{ id: 'c_milano', name: 'Car Mi', currentPoiId: 'milano' }];
            gs.drivers = [{ id: 'd_mi', name: 'Driver Milano', assignedCarId: 'c_milano', status: 'idle' }];

            sandbox.returnToHub('c_milano');

            const drv = gs.drivers[0];
            assert.equal(drv.status, 'resting');
            assert.equal(drv._returning, true);
            assert.ok(drv.restHoursLeft > 0);
            assert.ok(gs.cash < 150000, 'la cassa deve scalare carburante e pedaggi');
        });

        test('returnToHub rifiuta autisti occupati (status busy) o veicoli già a Roma', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [
                { id: 'c_busy', currentPoiId: 'firenze' },
                { id: 'c_roma', currentPoiId: 'roma' },
            ];
            gs.drivers = [
                { id: 'd_busy', assignedCarId: 'c_busy', status: 'busy' },
                { id: 'd_roma', assignedCarId: 'c_roma', status: 'idle' },
            ];

            sandbox.returnToHub('c_busy');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista non disponibile')));

            sandbox.returnToHub('c_roma');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('già all\'Hub')));
        });

        test('acceptGreyMarket genera corsa anonima VIP da email e risolve l\'email', () => {
            const { sandbox, gs, env } = amb;
            gs.emails = [{
                id: 'em_grey_1',
                type: 'grey_market',
                status: 'unread',
                greyRideData: { fromId: 'milano', toId: 'roma', price: 1200, isLong: false },
            }];
            gs.pendingRides = [];

            sandbox.acceptGreyMarket('em_grey_1');

            assert.equal(gs.emails[0].status, 'resolved');
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].tier, 'vip');
            assert.equal(gs.pendingRides[0].isGreyMarket, true);
            assert.equal(gs.pendingRides[0].price, 1200);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Missione discreta')));
        });
    });

    // ── 6. COMPRAVENDITA, LEASING, PROTOTIPI E MERCATO NPC ──────────────
    describe('6. Compravendita, Leasing, Prototipi e Mercato NPC (sellCar, terminateLease, buyPrototypeCar, buyNpcCar, listCarForSale, bidOnAuction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 100000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('sellCar vende auto di proprietà, accredita il valore via ServerState.sellVehicle e libera l\'autista', async () => {
            const { sandbox, gs, chiamateSell } = amb;
            gs.fleet = [{
                id: 'c_sell_1',
                _serverId: 'srv_s1',
                name: 'Mercedes E-Class',
                tier: 'standard',
                condition: 100,
                isLease: false,
            }];
            gs.drivers = [{ id: 'd_assigned', assignedCarId: 'c_sell_1' }];

            // Tier standard (base 35000) * (100/100) * 0.7 = €24.500
            await sandbox.sellCar('c_sell_1');

            assert.equal(gs.fleet.length, 0);
            assert.equal(gs.drivers[0].assignedCarId, null, 'autista deve essere liberato');
            assert.equal(chiamateSell.length, 1);
            assert.equal(chiamateSell[0].price, 24500);
            assert.equal(gs.cash, 100000 + 24500);
        });

        test('sellCar rifiuta veicoli in leasing o in edizione limitata', async () => {
            const { sandbox, gs, chiamateSell, env } = amb;
            gs.fleet = [
                { id: 'c_lease', isLease: true },
                { id: 'c_ltd', isLimitedEdition: true },
            ];

            await sandbox.sellCar('c_lease');
            assert.equal(gs.fleet.length, 2);

            await sandbox.sellCar('c_ltd');
            assert.equal(gs.fleet.length, 2);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('edizioni limitate')));
            assert.equal(chiamateSell.length, 0);
        });

        test('listCarForSale blocca vendita se l\'autista è occupato in servizio (status busy)', () => {
            const { sandbox, gs, env } = amb;
            gs.fleet = [{ id: 'c_busy_car', name: 'Auto Busy', isLease: false }];
            gs.drivers = [{ id: 'd_busy', assignedCarId: 'c_busy_car', status: 'busy' }];

            sandbox.listCarForSale('c_busy_car', 20000);

            assert.equal((gs.marketplace || []).length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));
        });

        test('terminateLease calcola la penale sui mesi rimanenti (50%), scala il denaro e rimuove l\'auto', () => {
            const { sandbox, gs, bigEvents } = amb;
            gs.fleet = [{
                id: 'c_lease_term',
                name: 'Audi A8 Lease',
                isLease: true,
                leaseDuration: 12, // 12 mesi
                leaseElapsedDays: 90, // 3 mesi trascorsi -> 9 mesi rimanenti
                leaseMonthlyRate: 2000,
            }];
            gs.drivers = [{ id: 'd_lease', assignedCarId: 'c_lease_term' }];

            // Penale: 9 mesi * 2000 * 0.5 = 9.000€
            sandbox.terminateLease('c_lease_term');

            assert.equal(gs.fleet.length, 0);
            assert.equal(gs.drivers[0].assignedCarId, null);
            assert.equal(gs.cash, 100000 - 9000);
            assert.ok(bigEvents.some(e => e.title.includes('Leasing Terminato')));
        });

        test('buyPrototypeCar verifica reputazione, sblocco corse e Hub EV', () => {
            const { sandbox, gs, bigEvents } = amb;
            // Modello 'proto_van_vip': reqRep 4.0, rideGate 0, price 110000, fuel: electric
            gs.reputation = 4.5;
            gs.questStats = { totalRides: 10 };
            gs.hasEVHub = true;
            gs.cash = 250000;
            gs.fleet = [];

            sandbox.buyPrototypeCar('proto_van_vip');

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].protoId, 'proto_van_vip');
            assert.equal(gs.cash, 250000 - 110000);
            assert.ok(bigEvents.some(e => e.title.includes('Acquisita!')));
        });

        test('buyNpcCar acquista veicolo dal mercato NPC usato e lo aggiunge alla flotta', () => {
            const { sandbox, gs } = amb;
            gs.npcMarket = [{
                id: 'npc_1',
                name: 'BMW Serie 5 2022',
                tier: 'business',
                price: 32000,
                condition: 85,
                mileage: 45000,
            }];
            gs.fleet = [];

            sandbox.buyNpcCar('npc_1');

            assert.equal(gs.fleet.length, 1);
            assert.equal(gs.fleet[0].name, 'BMW Serie 5 2022');
            assert.equal(gs.fleet[0].condition, 85);
            assert.equal(gs.npcMarket.length, 0);
            assert.equal(gs.cash, 100000 - 32000);
        });

        test('bidOnAuction piazza offerta rilanciando e rimborsa l\'offerta precedente del giocatore', () => {
            const { sandbox, gs } = amb;
            gs.activeAuction = {
                name: 'Rolls-Royce Phantom Asta',
                currentBid: 50000,
                playerBid: null,
            };

            // 1. Prima offerta a 60.000€
            sandbox.bidOnAuction(60000);
            assert.equal(gs.activeAuction.currentBid, 60000);
            assert.equal(gs.activeAuction.playerBid, 60000);
            assert.equal(gs.cash, 40000);

            // 2. Rilancio a 70.000€ (rimborsa i 60k e scala 70k -> cassa 30.000€)
            sandbox.bidOnAuction(70000);
            assert.equal(gs.activeAuction.currentBid, 70000);
            assert.equal(gs.activeAuction.playerBid, 70000);
            assert.equal(gs.cash, 30000);
        });
    });

    // ── 7. CONTRATTO DI MANUTENZIONE ──────────────────────────────────
    describe('7. Contratto di Manutenzione (buyMaintenanceContract)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteFlotta({ cash: 30000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('buyMaintenanceContract scala €10.000 e attiva lo sconto del 30% per 7 giorni', () => {
            const { sandbox, gs } = amb;
            gs.day = 5;
            gs.maintenanceContract = false;

            sandbox.buyMaintenanceContract();

            assert.equal(gs.maintenanceContract, true);
            assert.equal(gs.maintenanceContractPaidUntilDay, 12);
            assert.equal(gs.cash, 20000);

            // Verifica che repairCostFor applichi lo sconto del 30%
            const testCar = { condition: 50 };
            const costoScontato = sandbox.repairCostFor(testCar);
            gs.maintenanceContract = false;
            const costoPieno = sandbox.repairCostFor(testCar);
            assert.equal(costoScontato, Math.round(costoPieno * 0.70));
        });
    });

    // ── 8. RENDERING UI FLOTTA ED EVENT DELEGATION ─────────────────────
    describe('8. Rendering UI Flotta ed Event Delegation (renderTabFleet, filtri, bulkRepairFleet)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteFlotta({ cash: 50000 });
            amb.gs.fleet = [
                { id: 'f_merc_e', name: 'Mercedes E-Class', tier: 'standard', condition: 85, fuel: 90, tirePressure: 95 },
                { id: 'f_merc_s', name: 'Mercedes S-Class', tier: 'vip', condition: 50, fuel: 40, tirePressure: 60 },
                { id: 'f_bmw_7',  name: 'BMW Serie 7', tier: 'ultra', condition: 90, fuel: 100, tirePressure: 100 },
            ];
            amb.gs.drivers = [
                { id: 'd_1', name: 'Marco', assignedCarId: 'f_merc_e', status: 'idle' },
            ];
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabFleet genera tabella flotta, KPI e filtri marca/tier', () => {
            const { sandbox } = amb;

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Flotta'));
            assert.ok(c.innerHTML.includes('Mercedes E-Class'));
            assert.ok(c.innerHTML.includes('Mercedes S-Class'));
            assert.ok(c.innerHTML.includes('BMW Serie 7'));
            assert.ok(c.innerHTML.includes('data-ce-act="payToRepairCar"'));
            assert.ok(c.innerHTML.includes('data-ce-act="openCarModal"'));
        });

        test('filtro flotta per brand restringe i veicoli mostrati nella tabella', () => {
            const { sandbox } = amb;
            sandbox.window._fleetFilter.brand = 'BMW';

            sandbox.renderTabFleet();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('BMW Serie 7'));
            assert.ok(!c.innerHTML.includes('Mercedes E-Class'));
        });

        test('click su riparazione gruppo con ceAct esegue bulkRepairFleet via delegation', async () => {
            const { sandbox, gs, chiamateRepair } = amb;
            gs.fleet = [
                { id: 'm1', name: 'Mercedes E', condition: 50, _serverId: 's1' },
                { id: 'm2', name: 'Mercedes E', condition: 60, _serverId: 's2' },
                { id: 'm3', name: 'Mercedes E', condition: 70, _serverId: 's3' },
            ];

            sandbox.renderTabFleet();

            const btn = sandbox.document.querySelector('button[data-ce-act="bulkRepairFleet"]');
            assert.ok(btn, 'il bottone bulkRepairFleet deve essere presente nel markup');

            btn.click();
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateRepair.length, 3, 'tutte le 3 auto devono essere riparate');
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[2].condition, 100);
        });
    });

    // ── 9. INTEGRITÀ ECONOMICA E PREVENZIONE DOPPIO CONTEGGIO ─────────
    describe('9. Integrità Economica e Prevenzione Doppio Conteggio (CE_money / ServerState)', () => {
        test('tutte le spese e incassi locali usano CE_money e le azioni server non chiamano syncCash duplicato', async () => {
            const syncedCash = [];
            const amb = creaAmbienteFlotta({
                cash: 50000,
                serverStateOverrides: {
                    syncCash: async (cash) => {
                        syncedCash.push(cash);
                        return { success: true, cash };
                    },
                },
            });
            const { sandbox, gs } = amb;

            // 1. Contratto di manutenzione: spesa locale €10.000 -> sincronizza cash 40.000€
            sandbox.buyMaintenanceContract();
            assert.equal(gs.cash, 40000);
            assert.equal(syncedCash[syncedCash.length - 1], 40000);

            // 2. Riparazione server: passa da repairVehicle senza emettere syncCash locale
            const countPrima = syncedCash.length;
            gs.fleet = [{ id: 'c_test', _serverId: 'srv_c', name: 'Car', condition: 50 }];
            const cost = sandbox.repairCostFor(gs.fleet[0]);
            await sandbox.payToRepairCar('c_test');

            assert.equal(gs.cash, 40000 - cost);
            assert.equal(syncedCash.length, countPrima, 'payToRepairCar delega la spesa alla RPC del server senza syncCash locale');
        });
    });
});
