'use strict';
/* ============================================================================
   test/store/vanity-sync.test.js

   Regressione per il bug economico in vanity.js:
   tutte le funzioni di acquisto cosmetici DEVONO passare da CE_money (spendDC)
   e persistere la spesa autoritativa sul server tramite ServerState.spendDriverCoins.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupVanityEnv() {
    const rpcCalls = [];
    const ceCalls = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                rpcCalls.push({ motivo, n });
                return { ok: true };
            },
        },
    });
    // Spia su CE_money.spendDC per garantire il passaggio dalla porta unica
    const origSpendDC = env.sandbox.CE_money.spendDC;
    env.sandbox.CE_money.spendDC = function (quantita, motivo) {
        ceCalls.push({ quantita, motivo });
        return origSpendDC.apply(this, arguments);
    };
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, rpcCalls, ceCalls };
}

describe('vanity — persistenza e passaggio da CE_money.spendDC per cosmetici prestigio', () => {

    describe('_vanityEmblem', () => {
        test('acquisto nuovo stemma scala DC tramite CE_money.spendDC e chiama ServerState.spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 20;
            // '⚜️' costa 5 DC
            sandbox._vanityEmblem('⚜️');
            await new Promise(r => setImmediate(r));
            assert.equal(ceCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceCalls[0].quantita, 5);
            assert.equal(rpcCalls.length, 1, 'deve chiamare spendDriverCoins sul server');
            assert.equal(rpcCalls[0].n, 5);
            assert.ok(gs.ownedEmblems.includes('⚜️'));
            assert.equal(gs.companyLogo, '⚜️');
            assert.equal(gs.driverCoins, 15);
        });

        test('stemma già posseduto: equipaggia senza spendere DC e senza chiamare RPC', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 20;
            gs.ownedEmblems = ['👁️', '⚜️'];
            sandbox._vanityEmblem('⚜️');
            await new Promise(r => setImmediate(r));
            assert.equal(ceCalls.length, 0);
            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.companyLogo, '⚜️');
            assert.equal(gs.driverCoins, 20);
        });

        test('fondi DC insufficienti: non sblocca lo stemma e non chiama RPC', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 2;
            sandbox._vanityEmblem('⚜️');
            await new Promise(r => setImmediate(r));
            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.ownedEmblems.includes('⚜️'), false);
            assert.notEqual(gs.companyLogo, '⚜️');
            assert.equal(gs.driverCoins, 2);
        });
    });

    describe('_vanityColor', () => {
        test('acquisto nuovo colore scala DC tramite CE_money.spendDC e chiama ServerState.spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 20;
            // Platino '#8aa0b5' costa 6 DC
            sandbox._vanityColor('#8aa0b5');
            await new Promise(r => setImmediate(r));
            assert.equal(ceCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceCalls[0].quantita, 6);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].n, 6);
            assert.ok(gs.ownedColors.includes('#8aa0b5'));
            assert.equal(gs.companyColor, '#8aa0b5');
            assert.equal(gs.driverCoins, 14);
        });

        test('colore già posseduto: equipaggia senza spendere DC e senza chiamare RPC', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 20;
            gs.ownedColors = ['#c79a2a', '#8aa0b5'];
            sandbox._vanityColor('#8aa0b5');
            await new Promise(r => setImmediate(r));
            assert.equal(ceCalls.length, 0);
            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.companyColor, '#8aa0b5');
            assert.equal(gs.driverCoins, 20);
        });

        test('fondi DC insufficienti: non sblocca il colore e non chiama RPC', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 3;
            sandbox._vanityColor('#8aa0b5');
            await new Promise(r => setImmediate(r));
            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.ownedColors.includes('#8aa0b5'), false);
            assert.notEqual(gs.companyColor, '#8aa0b5');
            assert.equal(gs.driverCoins, 3);
        });
    });

    describe('_vanityTitle', () => {
        test('acquisto nuovo titolo scala DC tramite CE_money.spendDC e chiama ServerState.spendDriverCoins', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 20;
            // Magnate costa 8 DC
            sandbox._vanityTitle('Magnate');
            await new Promise(r => setImmediate(r));
            assert.equal(ceCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceCalls[0].quantita, 8);
            assert.equal(rpcCalls.length, 1);
            assert.equal(rpcCalls[0].n, 8);
            assert.ok(gs.ownedTitles.includes('Magnate'));
            assert.equal(gs.companyTitle, 'Magnate');
            assert.equal(gs.driverCoins, 12);
        });

        test('titolo già posseduto: equipaggia senza spendere DC e senza chiamare RPC', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 20;
            gs.ownedTitles = ['Imprenditore', 'Magnate'];
            sandbox._vanityTitle('Magnate');
            await new Promise(r => setImmediate(r));
            assert.equal(ceCalls.length, 0);
            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.companyTitle, 'Magnate');
            assert.equal(gs.driverCoins, 20);
        });

        test('fondi DC insufficienti: non sblocca il titolo e non chiama RPC', async () => {
            const { sandbox, gs, rpcCalls, ceCalls } = setupVanityEnv();
            gs.driverCoins = 5;
            sandbox._vanityTitle('Magnate');
            await new Promise(r => setImmediate(r));
            assert.equal(rpcCalls.length, 0);
            assert.equal(gs.ownedTitles.includes('Magnate'), false);
            assert.notEqual(gs.companyTitle, 'Magnate');
            assert.equal(gs.driverCoins, 5);
        });
    });
});
