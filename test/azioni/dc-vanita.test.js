'use strict';
/* ============================================================================
   test/azioni/dc-vanita.test.js — Azioni Driver Coins & Vanità (bordo spesa)

   Collauda le azioni che muovono Driver Coins / cosmetici a pagamento:
   _vanityTitle, _vanityEmblem, _dcSpend, _srmPurchase, opsBundleDC,
   buyLifestyleAsset.
   Regola d'oro: se il saldo si muove, la spesa passa UNA volta sola e
   SEMPRE via window.CE_money (mai gameState.driverCoins -= a mano).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('azioni DC e vanità — spese Driver Coins e cosmetici', () => {
    let env, sandbox, gs;
    let rpcSpendDC;

    beforeEach(() => {
        rpcSpendDC = [];
        env = freshEnv({
            render: true,
            serverState: {
                spendDriverCoins: async (motivo, n) => {
                    rpcSpendDC.push({ motivo, n });
                    return { ok: true, driver_coins: (sandbox.gameState.driverCoins || 0) - n };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('_vanityTitle (vanity.js) — titolo onorifico', () => {
        test('acquisto titolo nuovo: spende il prezzo giusto UNA volta via CE_money e equipaggia', async () => {
            gs.driverCoins = 100;
            delete gs.ownedTitles;
            gs.companyTitle = 'Imprenditore';

            sandbox._vanityTitle('Magnate'); // prezzo 8 DC
            await new Promise(r => setTimeout(r, 0));

            // La spesa passa dalla RPC, una volta sola, per l'importo esatto.
            assert.equal(rpcSpendDC.length, 1, 'una sola spesa DC');
            assert.equal(rpcSpendDC[0].n, 8);
            assert.equal(rpcSpendDC[0].motivo, 'vanity_title');
            assert.equal(gs.driverCoins, 100 - 8, 'saldo DC scalato una sola volta');

            assert.deepEqual([...gs.ownedTitles], ['Imprenditore', 'Magnate']);
            assert.equal(gs.companyTitle, 'Magnate');
        });

        test('titolo già posseduto: riequipaggia senza spendere nulla', async () => {
            gs.driverCoins = 50;
            gs.ownedTitles = ['Imprenditore', 'Magnate'];
            gs.companyTitle = 'Imprenditore';

            sandbox._vanityTitle('Magnate');
            await new Promise(r => setTimeout(r, 0));

            assert.equal(rpcSpendDC.length, 0, 'nessuna spesa: titolo già comprato');
            assert.equal(gs.driverCoins, 50);
            assert.equal(gs.companyTitle, 'Magnate');
        });

        test('fondi insufficienti: la spesa fallisce e il titolo NON viene equipaggiato', async () => {
            gs.driverCoins = 3; // 'Sua Eccellenza' costa 25
            gs.ownedTitles = ['Imprenditore'];

            sandbox._vanityTitle('Sua Eccellenza');
            await new Promise(r => setTimeout(r, 0));

            assert.equal(gs.companyTitle, 'Imprenditore', 'titolo invariato');
            assert.equal(gs.ownedTitles.includes('Sua Eccellenza'), false);
            assert.equal(gs.driverCoins, 3, 'saldo intatto');
        });

        test('bersaglio inesistente: nessuna spesa, nessun cambio', async () => {
            gs.driverCoins = 100;

            sandbox._vanityTitle('Titolo-Fantasma');
            await new Promise(r => setTimeout(r, 0));

            assert.equal(rpcSpendDC.length, 0);
            assert.equal(gs.driverCoins, 100);
        });
    });
});
