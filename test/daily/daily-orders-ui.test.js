'use strict';
/* ============================================================================
   test/daily/daily-orders-ui.test.js

   Primo test per le azioni del sistema "ordini e ricompense giornaliere"
   mai esercitate: la rigenerazione degli ordini al cambio di giorno (ensure,
   interna ma invocata dalla UI) e il rendering HTML della card home
   (window.renderDailyOrdersHTML).
   ============================================================================
*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function makeEnv() {
    const env = createGameEnv(CORE_FILES, {});
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

describe('daily/daily-orders-ui — rigenerazione ordini e rendering card home', () => {

    test('al cambio di giorno ensure rigenera i 3 ordini e azzera i claim', () => {
        const { sandbox } = makeEnv();
        const gs = sandbox.gameState;
        // Stato del giorno 1: ordine già riscosso
        gs.dailyOrders = { day: 1, picks: [{ id: 'rides', base: 0 }, { id: 'vip', base: 0 }, { id: 'contract', base: 0 }], claimed: ['rides'] };
        gs.day = 2;

        sandbox.renderDailyOrdersHTML(); // trigger della UI → ensure()

        assert.equal(gs.dailyOrders.day, 2, 'gli ordini devono essere rigenerati per il nuovo giorno');
        assert.equal(gs.dailyOrders.picks.length, 3, 'devono esserci 3 ordini del giorno');
        assert.equal(gs.dailyOrders.claimed.length, 0, 'i claim del giorno precedente devono azzerarsi');
    });

    test('la baseline scattata al primo rendering non conta il lavoro gia\u0300 fatto (progress = cur - base)', () => {
        const { sandbox } = makeEnv();
        const gs = sandbox.gameState;
        gs.questStats.totalRides = 100; // corse accumulate PRIMA che l\u2019ordine esista
        gs.todayEarnings = 0;

        gs.day = 8; // rotazione deterministica: (8*7)%8=0 \u2192 il primo ordine pescato \u00e8 'rides'
        const html = sandbox.renderDailyOrdersHTML(); // ensure() fotografa base = metric correnti

        assert.equal(gs.dailyOrders.picks[0].id, 'rides', 'sanity: con day 8 il primo ordine deve essere rides');
        assert.equal(gs.dailyOrders.picks[0].base, 100, 'la baseline deve essere fotografata al valore corrente della metrica');
        assert.ok(html.includes('Ordini del Giorno'), 'la card deve renderizzare');
        assert.ok(!html.includes('em-goldbtn'), 'nessun ordine deve risultare completato: le 100 corse precedenti alla baseline non devono contare');
        gs.questStats.totalRides = 103; // +3 corse DOPO la baseline; tier di 100 corse = 'mid', target 10
        const htmlAfter = sandbox.renderDailyOrdersHTML();
        assert.ok(htmlAfter.includes('3/10'), 'il progresso deve contare solo le corse successive alla baseline');
    });

    test('renderDailyOrdersHTML mostra il bottone Ritira solo sugli ordini completati e non riscossi', () => {
        const { sandbox } = makeEnv();
        const gs = sandbox.gameState;
        gs.questStats.totalRides = 5;  // tier 'new', ordine rides target 3 \u2192 done
        gs.questStats.vipRides = 0;    // ordine vip target 1 \u2192 non done
        gs.todayEarnings = 0;
        gs.dailyOrders = { day: gs.day, picks: [{ id: 'rides', base: 0 }, { id: 'vip', base: 0 }], claimed: [] };

        const html = sandbox.renderDailyOrdersHTML();

        assert.ok(html.includes('Ritira'), 'l\u2019ordine completato deve mostrare il bottone di ritiro');
        assert.ok(!html.includes('\u2713 Ritirato'), 'nessun ordine risulta ancora riscosso');
        assert.ok(html.includes('0/1'), 'l\u2019ordine VIP non completato mostra il progresso senza bottone');

        gs.dailyOrders.claimed.push('rides');
        const htmlClaimed = sandbox.renderDailyOrdersHTML();
        assert.ok(htmlClaimed.includes('\u2713 Ritirato'), 'l\u2019ordine riscosso deve mostrare lo stato "Ritirato"');
        assert.ok(!htmlClaimed.includes('em-goldbtn'), 'un ordine gi\u00e0 riscosso non deve pi\u00f9 offrire il bottone');
    });
});
