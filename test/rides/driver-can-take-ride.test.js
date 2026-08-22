'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('rides/driver-can-take-ride — idoneità autista per assegnazione corsa (_driverCanTakeRide)', () => {
    test('caso positivo: autista idoneo con auto compatibile e in buone condizioni può accettare la corsa', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'business', vehicleClass: 'stellar_e_exec', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1', queue: [] };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        const ride = { id: 'r1', tier: 'business' };

        assert.equal(sandbox._driverCanTakeRide(driver, ride), true, 'un autista con auto compatibile deve poter prendere la corsa');
    });

    test('autista in sciopero (status striking) non può prendere la corsa', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'business', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'striking', assignedCarId: 'car1', queue: [] };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        const ride = { id: 'r1', tier: 'business' };

        assert.equal(sandbox._driverCanTakeRide(driver, ride), false, 'un autista in sciopero non deve poter accettare corse');
    });

    test('autista senza auto assegnata (assignedCarId nullo o assente in flotta) non può prendere la corsa', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.fleet = [{ id: 'car1', tier: 'business', condition: 90 }];

        const driverWithoutCar = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: null, queue: [] };
        const driverWithMissingCar = { id: 'd2', name: 'Luigi', status: 'idle', assignedCarId: 'car_non_esiste', queue: [] };

        const ride = { id: 'r1', tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(driverWithoutCar, ride), false, 'senza auto assegnata non deve poter accettare corse');
        assert.equal(sandbox._driverCanTakeRide(driverWithMissingCar, ride), false, 'con id auto non presente in flotta non deve poter accettare corse');
    });

    test('auto fuori servizio (outOfService) non consente all\'autista di prendere la corsa', () => {
        const { sandbox } = freshEnv();
        const carOutOfServiceBool = { id: 'car1', tier: 'business', condition: 90, outOfService: true };
        const carOutOfServiceFuel = { id: 'car2', tier: 'business', condition: 90, outOfService: 'fuel' };
        const carOutOfServiceEngine = { id: 'car3', tier: 'business', condition: 90, outOfService: 'engine' };

        const driver1 = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1', queue: [] };
        const driver2 = { id: 'd2', name: 'Luigi', status: 'idle', assignedCarId: 'car2', queue: [] };
        const driver3 = { id: 'd3', name: 'Giovanni', status: 'idle', assignedCarId: 'car3', queue: [] };

        sandbox.gameState.fleet = [carOutOfServiceBool, carOutOfServiceFuel, carOutOfServiceEngine];
        sandbox.gameState.drivers = [driver1, driver2, driver3];

        const ride = { id: 'r1', tier: 'business' };

        assert.equal(sandbox._driverCanTakeRide(driver1, ride), false, 'auto con outOfService=true deve bloccare l\'assegnazione');
        assert.equal(sandbox._driverCanTakeRide(driver2, ride), false, 'auto con outOfService="fuel" deve bloccare l\'assegnazione');
        assert.equal(sandbox._driverCanTakeRide(driver3, ride), false, 'auto con outOfService="engine" deve bloccare l\'assegnazione');
    });

    test('auto con condizione <= 10 non può effettuare corse, mentre > 10 è idonea', () => {
        const { sandbox } = freshEnv();
        const carCond10 = { id: 'car1', tier: 'standard', condition: 10, outOfService: false };
        const carCond5 = { id: 'car2', tier: 'standard', condition: 5, outOfService: false };
        const carCond0 = { id: 'car3', tier: 'standard', condition: 0, outOfService: false };
        const carCond11 = { id: 'car4', tier: 'standard', condition: 11, outOfService: false };

        const driver1 = { id: 'd1', name: 'A', status: 'idle', assignedCarId: 'car1', queue: [] };
        const driver2 = { id: 'd2', name: 'B', status: 'idle', assignedCarId: 'car2', queue: [] };
        const driver3 = { id: 'd3', name: 'C', status: 'idle', assignedCarId: 'car3', queue: [] };
        const driver4 = { id: 'd4', name: 'D', status: 'idle', assignedCarId: 'car4', queue: [] };

        sandbox.gameState.fleet = [carCond10, carCond5, carCond0, carCond11];
        sandbox.gameState.drivers = [driver1, driver2, driver3, driver4];

        const ride = { id: 'r1', tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(driver1, ride), false, 'condizione 10 è al limite critico e deve essere rifiutata');
        assert.equal(sandbox._driverCanTakeRide(driver2, ride), false, 'condizione 5 deve essere rifiutata');
        assert.equal(sandbox._driverCanTakeRide(driver3, ride), false, 'condizione 0 deve essere rifiutata');
        assert.equal(sandbox._driverCanTakeRide(driver4, ride), true, 'condizione 11 è sopra la soglia minima e deve essere accettata');
    });

    test('tier della corsa incompatibile con il tier dell\'auto', () => {
        const { sandbox } = freshEnv();
        const standardCar = { id: 'c_std', tier: 'standard', condition: 100, outOfService: false };
        const businessCar = { id: 'c_biz', tier: 'business', condition: 100, outOfService: false };
        const vipCar = { id: 'c_vip', tier: 'vip', condition: 100, outOfService: false };
        const ultraCar = { id: 'c_ultra', tier: 'ultra', condition: 100, outOfService: false };

        sandbox.gameState.fleet = [standardCar, businessCar, vipCar, ultraCar];

        const driverStd = { id: 'd_std', name: 'D_Std', status: 'idle', assignedCarId: 'c_std', queue: [] };
        const driverBiz = { id: 'd_biz', name: 'D_Biz', status: 'idle', assignedCarId: 'c_biz', queue: [] };
        const driverVip = { id: 'd_vip', name: 'D_Vip', status: 'idle', assignedCarId: 'c_vip', queue: [] };
        const driverUltra = { id: 'd_ultra', name: 'D_Ultra', status: 'idle', assignedCarId: 'c_ultra', queue: [] };

        sandbox.gameState.drivers = [driverStd, driverBiz, driverVip, driverUltra];

        // Corsa Ultra: richiede auto ultra
        const ultraRide = { id: 'r_ultra', tier: 'ultra' };
        assert.equal(sandbox._driverCanTakeRide(driverStd, ultraRide), false, 'auto standard non può fare corsa ultra');
        assert.equal(sandbox._driverCanTakeRide(driverBiz, ultraRide), false, 'auto business non può fare corsa ultra');
        assert.equal(sandbox._driverCanTakeRide(driverVip, ultraRide), false, 'auto vip non può fare corsa ultra');
        assert.equal(sandbox._driverCanTakeRide(driverUltra, ultraRide), true, 'auto ultra può fare corsa ultra');

        // Corsa VIP: richiede auto vip, ultra o group
        const vipRide = { id: 'r_vip', tier: 'vip' };
        assert.equal(sandbox._driverCanTakeRide(driverStd, vipRide), false, 'auto standard non può fare corsa vip');
        assert.equal(sandbox._driverCanTakeRide(driverBiz, vipRide), false, 'auto business non può fare corsa vip');
        assert.equal(sandbox._driverCanTakeRide(driverVip, vipRide), true, 'auto vip può fare corsa vip');
        assert.equal(sandbox._driverCanTakeRide(driverUltra, vipRide), true, 'auto ultra può fare corsa vip');

        // Corsa Business: richiede auto business, vip, ultra o group
        const bizRide = { id: 'r_biz', tier: 'business' };
        assert.equal(sandbox._driverCanTakeRide(driverStd, bizRide), false, 'auto standard non può fare corsa business');
        assert.equal(sandbox._driverCanTakeRide(driverBiz, bizRide), true, 'auto business può fare corsa business');
        assert.equal(sandbox._driverCanTakeRide(driverVip, bizRide), true, 'auto vip può fare corsa business');
        assert.equal(sandbox._driverCanTakeRide(driverUltra, bizRide), true, 'auto ultra può fare corsa business');

        // Corsa Standard: accetta qualsiasi tier
        const stdRide = { id: 'r_std', tier: 'standard' };
        assert.equal(sandbox._driverCanTakeRide(driverStd, stdRide), true, 'auto standard può fare corsa standard');
        assert.equal(sandbox._driverCanTakeRide(driverBiz, stdRide), true, 'auto business può fare corsa standard');
    });

    test('veicolo specifico richiesto (vehicleRequired) non corrispondente blocca l\'assegnazione', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'ultra', vehicleClass: 'stellar_s_imp', condition: 90, outOfService: false };
        const driver = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1', queue: [] };
        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driver];

        const rideMatching = { id: 'r1', tier: 'ultra', vehicleRequired: 'stellar_s_imp' };
        const rideMismatch = { id: 'r2', tier: 'ultra', vehicleRequired: 'water_taxi' };

        assert.equal(sandbox._driverCanTakeRide(driver, rideMatching), true, 'con vehicleClass corrispondente deve poter accettare');
        assert.equal(sandbox._driverCanTakeRide(driver, rideMismatch), false, 'con vehicleClass diversa da quella richiesta deve rifiutare');
    });

    test('altri vincoli: autista a riposo (resting) o monte ore esaurito bloccano l\'assegnazione', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'standard', condition: 90, outOfService: false };
        const driverResting = { id: 'd1', name: 'Mario', status: 'resting', assignedCarId: 'car1', queue: [] };
        // Monte ore (decisione Vlad 22/08/2026): il tetto è in ORE, non in numero
        // corse. 10 finte corse senza prezzo valgono 30min l'una = 5h > 4h di base.
        const driverFullQueue = { id: 'd2', name: 'Luigi', status: 'idle', assignedCarId: 'car1', queue: new Array(10).fill({ id: 'dummy' }) };

        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driverResting, driverFullQueue];

        const ride = { id: 'r1', tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(driverResting, ride), false, 'autista a riposo non deve poter accettare corse');
        assert.equal(sandbox._driverCanTakeRide(driverFullQueue, ride), false, 'autista con monte ore (5h) esaurito deve rifiutare nuove corse');
    });

    test('limite coda a monte ore: 7 corse brevi (3h30) passano, l\'8ª (che satura le 4h) no', () => {
        const { sandbox } = freshEnv();
        const car = { id: 'car1', tier: 'standard', condition: 90, outOfService: false };
        // price 150 -> 30min per corsa (price*0.2): 7 corse = 3h30 < 4h; 8 corse = 4h >= 4h.
        const corsa = (i) => ({ id: 'q' + i, price: 150, tier: 'standard' });
        const driverWith7 = { id: 'd1', name: 'Mario', status: 'idle', assignedCarId: 'car1', queue: Array.from({ length: 7 }, (_, i) => corsa(i)) };
        const driverWith8 = { id: 'd2', name: 'Luigi', status: 'idle', assignedCarId: 'car1', queue: Array.from({ length: 8 }, (_, i) => corsa(i)) };

        sandbox.gameState.fleet = [car];
        sandbox.gameState.drivers = [driverWith7, driverWith8];

        const ride = { id: 'r1', tier: 'standard' };

        assert.equal(sandbox._driverCanTakeRide(driverWith7, ride), true, 'con 3h30 in coda il monte ore di 4h non è saturo');
        assert.equal(sandbox._driverCanTakeRide(driverWith8, ride), false, 'con 4h in coda il monte ore è pieno: nessuna nuova corsa');
    });
});
