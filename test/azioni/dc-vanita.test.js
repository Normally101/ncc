'use strict';
/* ============================================================================
   test/azioni/dc-vanita.test.js

   Azioni che spendono Driver Coins (negozio DC + vanità):
   _dcSpend, _srmPurchase, opsBundleDC, _vanityTitle, _vanityEmblem,
   buyLifestyleAsset.

   Regole verificate per ogni azione che muove denaro:
   - importo giusto, UNA SOLA volta;
   - passa da window.CE_money (spendDC), mai da gameState.driverCoins -=;
   - rifiuti: fondi insufficienti, bersaglio inesistente, azione ripetuta.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Ambiente fresco + spia su CE_money.spendDC: registra (importo, motivo) di ogni
// chiamata senza cambiarne il comportamento.
function setupEnv(dcIniziali = 1000) {
    const env = freshEnv();
    const { sandbox } = env;
    const gs = sandbox.gameState;
    gs.driverCoins = dcIniziali;

    const speseDC = [];
    const origSpendDC = sandbox.CE_money.spendDC.bind(sandbox.CE_money);
    sandbox.window.CE_money.spendDC = (costo, motivo) => {
        speseDC.push([costo, motivo]);
        return origSpendDC(costo, motivo);
    };
    return { sandbox, gs, speseDC };
}

// ── _vanityTitle ──────────────────────────────────────────────────
describe('_vanityTitle', () => {
    test('felice: compra un titolo non posseduto al prezzo giusto, una volta sola', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);
        const prima = gs.driverCoins;

        sandbox._vanityTitle('Magnate'); // costa 8 DC

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, prima - 8);
        assert.ok(gs.ownedTitles.includes('Magnate'));
        assert.equal(gs.companyTitle, 'Magnate');
        // una sola spesa, importo giusto
        assert.deepEqual(speseDC, [[8, 'vanity_title']]);
    });

    test('titolo già posseduto: equipaggia SENZA pagare di nuovo', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);
        gs.ownedTitles = ['Imprenditore', 'Magnate'];
        const prima = gs.driverCoins;

        sandbox._vanityTitle('Magnate');

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, prima);           // nessun addebito
        assert.deepEqual(speseDC, []);                 // mai passati da spendDC
        assert.equal(gs.companyTitle, 'Magnate');
    });

    test('titolo inesistente: rifiuta senza muovere nulla', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);

        sandbox._vanityTitle('Imperatore Supremo del Cosmo');

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, 100);
        assert.deepEqual(speseDC, []);
    });

    test('fondi insufficienti: non compra né equipaggia', async () => {
        const { sandbox, gs, speseDC } = setupEnv(5);
        const prima = gs.driverCoins;

        sandbox._vanityTitle('Sua Eccellenza'); // costa 25 DC

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, prima);
        assert.ok(!gs.ownedTitles.includes('Sua Eccellenza'));
        assert.notEqual(gs.companyTitle, 'Sua Eccellenza');
    });
});

// ── _vanityEmblem ─────────────────────────────────────────────────
describe('_vanityEmblem', () => {
    test('felice: compra uno stemma non posseduto al prezzo giusto', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);
        const prima = gs.driverCoins;

        sandbox._vanityEmblem('💎'); // costa 12 DC

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, prima - 12);
        assert.ok(gs.ownedEmblems.includes('💎'));
        assert.equal(gs.companyLogo, '💎');
        assert.deepEqual(speseDC, [[12, 'vanity_emblem']]);
    });

    test('stemma gratis (👁️): equipaggia senza spesa', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);
        const prima = gs.driverCoins;

        sandbox._vanityEmblem('👁️'); // c = 0

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, prima);
        assert.deepEqual(speseDC, []);
        assert.equal(gs.companyLogo, '👁️');
    });

    test('stemma già posseduto: ri-equipaggia senza pagare', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);
        gs.ownedEmblems = ['👁️', '⚜️'];
        gs.companyLogo = '👁️';

        sandbox._vanityEmblem('⚜️'); // costa 5 ma è già nostro

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, 100);
        assert.deepEqual(speseDC, []);
        assert.equal(gs.companyLogo, '⚜️');
    });

    test('stemma inesistente: nessun movimento', async () => {
        const { sandbox, gs, speseDC } = setupEnv(100);

        sandbox._vanityEmblem('🛸');

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, 100);
        assert.deepEqual(speseDC, []);
    });

    test('fondi insufficienti: non compra', async () => {
        const { sandbox, gs, speseDC } = setupEnv(3);

        sandbox._vanityEmblem('🏆'); // costa 15

        await new Promise(r => setImmediate(r));
        assert.equal(gs.driverCoins, 3);
        assert.ok(!gs.ownedEmblems.includes('🏆'));
    });
});
