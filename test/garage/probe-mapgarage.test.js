'use strict';
// PROBE 2: percorso EV + _generateVehicleSVG diretta
const { test } = require('node:test');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

test('probe EV + svg', async () => {
    const env = createGameEnv([...CORE_FILES, 'map-garage.js']);
    const sb = env.sandbox;
    sb.initGame(true);
    env.stopAllIntervals();
    sb.document.body.innerHTML = '<div id="modal-garage3d"></div>';
    const gs = sb.gameState;

    gs.fleet.push({
        id: 'c_ev', name: 'Stellar Q-Executive', tier: 'business',
        vehicleClass: 'stellar_q_exec', condition: 80, fuel: 100,
        chargeLevel: 35, tirePressure: 90, engineHealth: 100,
        outOfService: null, mileage: 1000, upgrades: [],
    });

    try {
        sb.openGarage3D('c_ev');
        const modal = sb.document.getElementById('modal-garage3d');
        console.log('EV CHECKS:', JSON.stringify({
            co2Esente: modal.innerHTML.includes('CO2 ESENTE'),
            batteriaLabel: modal.innerHTML.includes('BATTERIA'),
            carburanteLabel: modal.innerHTML.includes('CARBURANTE'),
            carica35: modal.innerHTML.includes('35%'),
        }));
        await new Promise(r => setTimeout(r, 90));
        console.log('EV WIDTHS:', sb.document.getElementById('anim-fuel')?.style.width);
    } catch (e) {
        console.log('ERRORE EV:', e.constructor.name, e.message);
    }

    // SVG diretta: varianti
    try {
        const base = sb._generateVehicleSVG('mercedes_e', []);
        console.log('SVG sedan len:', base.length, '| bodyPaint:', base.includes('url(#bodyPaint)'), '| ruote:', (base.match(/drawWheel|circle/g) || []).length > 0);
        const armor = sb._generateVehicleSVG('mercedes_s', ['blindatura']);
        console.log('SVG armor paint1 #1a1a1c:', armor.includes('#1a1a1c'));
        const tint = sb._generateVehicleSVG('mercedes_e', ['tint']);
        console.log('SVG tint glass #030303:', tint.includes('#030303'));
        const taxi = sb._generateVehicleSVG('water_taxi', []);
        console.log('SVG taxi presente:', taxi.length > 100, '| niente bodyPaint auto:', !taxi.includes('M195,175'));
        const van = sb._generateVehicleSVG('mercedes_v', []);
        console.log('SVG van ok:', van.length > 100);
        const spr = sb._generateVehicleSVG('mercedes_sprinter', []);
        console.log('SVG sprinter ok:', spr.length > 100);
    } catch (e) {
        console.log('ERRORE SVG:', e.constructor.name, e.message);
    }
});
