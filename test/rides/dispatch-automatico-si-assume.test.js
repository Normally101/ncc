'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   rides/dispatch-automatico-si-assume — "non escono piu' servizi" (29/08).

   Vlad vedeva «Richieste Pendenti 0» e «In attesa di chiamate...» con un
   autista attivo e un veicolo operativo. Le corse venivano generate: sparivano.
   `autoDispatchRides()` gira a ogni tick del gameLoop (600ms) e assegnava
   TUTTO senza chiedere se in azienda ci fosse un dispatcher, mentre il catalogo
   dello staff vende il Junior Dispatcher a €1.400/mese dicendo «Auto-smista
   corse Standard ogni tick. Senza di lui tutto e' manuale.»

   La lista delle richieste era quindi vuota per costruzione: il giocatore non
   vedeva mai una chiamata da smistare, e il bottone «Smista tutte» non aveva
   niente da smistare. Questi test difendono la regola scritta nel catalogo.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function corsa(id, tier) {
    return { id, tier, price: tier === 'vip' ? 2000 : 100, duration: 20000,
             fromPoi: { region: 'lazio' }, toPoi: { region: 'lazio' } };
}

describe('rides/dispatch-automatico-si-assume', () => {
    let env, s, gs;
    beforeEach(() => {
        env = freshEnv();
        s = env.sandbox; gs = s.gameState;
        // un autista con l'auto starter, come nella segnalazione
        if (typeof s.hireNeighborhoodKid === 'function') s.hireNeighborhoodKid();
        /* Fuori dall'onboarding: il tutorial e' esente dal cancello (la
           rivelazione «SVEGLIATI, SCHIAVO» promette il guadagno automatico e
           zero-to-hero.js conta sullo smistamento per mantenerla). La
           segnalazione di Vlad viene da una partita avviata. */
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = 40;
    });
    afterEach(() => env.stopAllIntervals());

    test('senza dispatcher in organico nessuna corsa viene smistata da sola', () => {
        gs.staff = [];
        gs.pendingRides = [corsa(401, 'standard'), corsa(402, 'business')];

        s.autoDispatchRides();

        assert.equal(gs.pendingRides.length, 2,
            'senza dispatcher le richieste devono restare visibili al giocatore, che le smista a mano');
        assert.equal(gs.drivers.reduce((n, d) => n + d.queue.length, 0), 0,
            'nessuna corsa deve finire nella coda di un autista');
    });

    test('il giocatore senza dispatcher vede la richiesta nella lista dopo un giro di gameLoop', () => {
        gs.staff = [];
        gs.pendingRides = [];

        const generata = s.generateContractRide();
        assert.ok(generata, 'il generatore deve produrre una corsa in una partita nuova');
        assert.equal(gs.pendingRides.length, 1, 'la corsa deve entrare fra le richieste pendenti');

        s.gameLoop();

        assert.equal(gs.pendingRides.length, 1,
            'era questo il bug: il gameLoop svuotava la lista entro 600ms e il Dispatch restava «In attesa di chiamate...»');
    });

    test('con il Junior Dispatcher le corse standard tornano a smistarsi da sole', () => {
        gs.staff = [{ id: 'jr_disp', name: 'Junior Dispatcher' }];
        gs.pendingRides = [corsa(403, 'standard')];

        s.autoDispatchRides();

        assert.equal(gs.pendingRides.length, 0,
            'e\' esattamente quello che il Junior Dispatcher promette in catalogo');
    });

    test('il Junior Dispatcher non tocca VIP e Ultra: quelle restano al Senior', () => {
        gs.staff = [{ id: 'jr_disp', name: 'Junior Dispatcher' }];
        gs.pendingRides = [corsa(404, 'standard'), corsa(405, 'vip')];

        s.autoDispatchRides();

        assert.equal(gs.pendingRides.length, 1, 'la VIP deve restare in attesa');
        assert.equal(gs.pendingRides[0].id, 405, 'la corsa rimasta deve essere la VIP');
    });

    test('durante il tutorial lo smistamento resta automatico: la promessa «vai a dormire» regge', () => {
        /* zero-to-hero.js dice al giocatore che assumendo il Ragazzo di
           Quartiere «i soldi arrivano da soli», e conta su autoDispatchRides
           per mantenerlo. Il cancello del dispatcher non deve rompere quella
           frase: entra in vigore quando l'onboarding e' finito (fase 'free'). */
        gs.questStats.totalRides = 3;          // fase survival
        gs.staff = [];
        gs.pendingRides = [corsa(407, 'standard')];

        s.autoDispatchRides();

        assert.equal(gs.pendingRides.length, 0,
            'chi sta ancora imparando non deve restare fermo davanti a una corsa non smistata');
    });

    test('lo smistamento a mano funziona sempre, dispatcher o no', () => {
        gs.staff = [];
        gs.pendingRides = [corsa(406, 'standard')];

        s.assignAllRides();

        assert.equal(gs.pendingRides.length, 0,
            '«Smista tutte» e\' la via manuale: non deve dipendere dallo staff');
    });
});
