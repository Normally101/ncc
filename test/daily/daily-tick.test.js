'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('daily/daily-tick — processDailyRoutines non duplica su chiamate ripetute', () => {
    test('due chiamate consecutive applicano lo stesso delta di cassa (nessuna duplicazione/drift)', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.investments.push('inv_carwash'); // passive:150/g, income deterministico e semplice
        sandbox.gameState.cash = 100000;

        const before1 = sandbox.gameState.cash;
        sandbox.processDailyRoutines();
        const delta1 = sandbox.gameState.cash - before1;

        const before2 = sandbox.gameState.cash;
        sandbox.processDailyRoutines();
        const delta2 = sandbox.gameState.cash - before2;

        assert.equal(delta2, delta1, 'due tick consecutivi con lo stesso stato devono produrre lo stesso identico delta — un drift indicherebbe un accumulo/duplicazione nascosta');
        assert.ok(delta1 !== 0, 'sanity check: il tick deve effettivamente muovere qualcosa (altrimenti il test non starebbe testando nulla)');
    });

    test('il tick giornaliero manda il cash aggiornato al server (syncCash), non solo in locale', () => {
        let syncedCash = null;
        const { sandbox } = freshEnv({
            serverState: { syncCash: async (cash) => { syncedCash = cash; return { success: true, cash }; } },
        });
        sandbox.gameState.investments.push('inv_carwash');
        sandbox.gameState.cash = 100000;

        sandbox.processDailyRoutines();

        assert.equal(syncedCash, sandbox.gameState.cash, 'il valore mandato al server deve coincidere con quello locale — altrimenti client e server divergono già al primo tick (docs/SYSTEMS.md, debito #1)');
    });

    test('la tassa di lusso cresce con la flotta (più auto = più tasse, non un importo fisso)', () => {
        const smallFleetEnv = freshEnv();
        smallFleetEnv.sandbox.gameState.cash = 100000;
        smallFleetEnv.sandbox.gameState.investments.push('inv_carwash');
        const beforeSmallFleet = smallFleetEnv.sandbox.gameState.cash;
        smallFleetEnv.sandbox.processDailyRoutines();
        const deltaSmallFleet = smallFleetEnv.sandbox.gameState.cash - beforeSmallFleet;

        const bigFleetEnv = freshEnv();
        bigFleetEnv.sandbox.gameState.cash = 100000;
        bigFleetEnv.sandbox.gameState.investments.push('inv_carwash');
        for (let i = 0; i < 5; i++) {
            bigFleetEnv.sandbox.gameState.fleet.push({ id: 'extra_' + i, name: 'Extra', tier: 'business', condition: 100, isLease: false });
        }
        const beforeBigFleet = bigFleetEnv.sandbox.gameState.cash;
        bigFleetEnv.sandbox.processDailyRoutines();
        const deltaBigFleet = bigFleetEnv.sandbox.gameState.cash - beforeBigFleet;

        assert.ok(deltaBigFleet < deltaSmallFleet, 'con più auto la tassa di lusso deve essere più alta, quindi il guadagno netto più basso');
    });

    test('lo stipendio di un autista viene dedotto ogni giorno (salary/30) e riduce il guadagno netto', () => {
        const noDriverEnv = freshEnv();
        noDriverEnv.sandbox.gameState.cash = 100000;
        noDriverEnv.sandbox.gameState.investments.push('inv_carwash');
        const beforeNoDriver = noDriverEnv.sandbox.gameState.cash;
        noDriverEnv.sandbox.processDailyRoutines();
        const deltaNoDriver = noDriverEnv.sandbox.gameState.cash - beforeNoDriver;

        const withDriverEnv = freshEnv();
        withDriverEnv.sandbox.gameState.cash = 100000;
        withDriverEnv.sandbox.gameState.investments.push('inv_carwash');
        withDriverEnv.sandbox.gameState.drivers.push({ id: 'd2', name: 'Driver 2', status: 'idle', assignedCarId: null, queue: [], salary: 3000, fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100 });
        const beforeWithDriver = withDriverEnv.sandbox.gameState.cash;
        withDriverEnv.sandbox.processDailyRoutines();
        const deltaWithDriver = withDriverEnv.sandbox.gameState.cash - beforeWithDriver;

        assert.ok(deltaWithDriver < deltaNoDriver, 'con un autista stipendiato il guadagno netto del giorno deve essere più basso (stipendio/30 dedotto)');
        const expectedGap = Math.round(3000 / 30);
        const actualGap = Math.round(deltaNoDriver - deltaWithDriver);
        assert.ok(Math.abs(actualGap - expectedGap) <= 1, `il divario deve essere ~stipendio/30 (€${expectedGap}), trovato €${actualGap}`);
    });
});
