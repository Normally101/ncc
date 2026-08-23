'use strict';
/* ============================================================================
   test/guardrail/timer-residui-initgame.test.js — REGRESSIONE flaky suite

   Il 22/08 la suite ha dato esiti diversi a pochi minuti di distanza sullo
   STESSO codice (a volte 1 rosso, a volte 0). Causa trovata: freshEnv() chiama
   initGame(true), che pianta un setTimeout REALE a 800ms di kickstart
   (engine.js: 2× generatePOIRide + CE_Contracts.dailyTick + updateUI). Quel
   timer non era tracciato dal banco: stopAllIntervals uccideva solo gli
   intervalli, quindi ogni test che viveva piu' di 800ms (situazione normale
   sotto la suite completa, con tutte le CPU occupate) riceveva il callback A
   META' TEST: pendingRides cresceva da solo e nextTenderDay saltava da day+2
   a day. Da qui i rossi "a volte si', a volte no" senza che nessuno tocchasse
   niente.

   Questo test guarda ESATTAMENTE quel meccanismo: dopo freshEnv aspetta oltre
   gli 800ms e verifica che nessun timer residuo possa mutare lo stato. Sul
   codice vecchio e' ROSSO (il kickstart scatta), col fix e' verde.
   ============================================================================ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

test('dopo freshEnv nessun timer residuo di initGame muta lo stato a meta\' test', async () => {
    const { sandbox, stopAllIntervals } = freshEnv();
    try {
        const gs = sandbox.gameState;
        const ridesPrima = (gs.pendingRides || []).length;
        const nextTenderPrima = gs.nextTenderDay;

        await new Promise(r => setTimeout(r, 1000)); // oltre gli 800ms del kickstart

        assert.equal((gs.pendingRides || []).length, ridesPrima,
            'il kickstart di initGame non deve scattare dopo lo stop dei loop di freshEnv');
        assert.equal(gs.nextTenderDay, nextTenderPrima,
            'il dailyTick dei bandi non deve riprogrammare nextTenderDay a meta\' test');
    } finally {
        stopAllIntervals();
    }
});
