'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/realestate — acquisto immobili (ui-realestate.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 27. Una azione:

   · doBuyRealEstate(listingId) — chiama `ServerState.buyRealEstate`; su
     `success` mostra l'evento e ridisegna la scheda. Su esito negativo non fa
     nulla (nessun evento, nessun ridisegno). È server-authoritative: il prezzo
     lo conosce solo il DB, il client non tocca la cassa in locale.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

function reEnv(serverState) {
    const env = createGameEnv(CORE_FILES, { serverState });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('sistemi/realestate', () => {
    let env, w, eventi, ridisegni;

    function setup(buyImpl) {
        env = reEnv({ buyRealEstate: buyImpl });
        w = env.sandbox.window;
        R.conSchermo(env);
        eventi = []; ridisegni = 0;
        w.showBigEvent = (i, t) => eventi.push(t);
        w.showNotification = () => {};
        w.renderTabRealEstate = () => { ridisegni++; };
    }
    afterEach(() => env.stopAllIntervals());

    test('doBuyRealEstate: successo → evento con nome e rendita, e ridisegno', async () => {
        const chiamate = [];
        setup(async (id) => { chiamate.push(id); return { success: true, name: 'Palazzo Doria', daily_rent: 2500 }; });

        await w.doBuyRealEstate('lst_1');

        assert.deepEqual(chiamate, ['lst_1']);
        assert.ok(eventi.some(t => /Palazzo Doria/.test(t)), 'nessun evento di acquisto');
        assert.equal(ridisegni, 1, 'la scheda non è stata ridisegnata');
    });

    test('doBuyRealEstate: esito negativo → nessun evento, nessun ridisegno', async () => {
        setup(async () => ({ success: false }));

        await w.doBuyRealEstate('lst_1');

        assert.equal(eventi.length, 0, 'ha mostrato un evento su un acquisto fallito');
        assert.equal(ridisegni, 0, 'ha ridisegnato su un acquisto fallito');
    });
});
