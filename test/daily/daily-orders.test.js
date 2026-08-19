'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function envWithDC(dcResult) {
    const env = createGameEnv(CORE_FILES, {
        serverState: {
            addDriverCoins: dcResult,
        },
    });
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

function primeDailyOrder(sandbox, { totalRides = 3 } = {}) {
    // Ordine 'rides' (rw: {dc:2}), tier 'new' => target 3. Baseline 0 impostato a mano per
    // evitare di dover replicare la logica di tier/rotazione di ensure().
    sandbox.gameState.dailyOrders = { day: sandbox.gameState.day, picks: [{ id: 'rides', base: 0 }], claimed: [] };
    sandbox.gameState.questStats.totalRides = totalRides;
}

describe('daily/daily-orders — riscossione premio Driver Coins', () => {
    test('riscossione con RPC riuscita: claim mantenuto, driverCoins riflette il valore server', async () => {
        const { sandbox } = envWithDC(async (amount) => ({ ok: true, driver_coins: 999 + amount }));
        primeDailyOrder(sandbox);
        sandbox.gameState.driverCoins = 10;

        sandbox.claimDailyOrder('rides');
        await new Promise(r => setTimeout(r, 20)); // il credito autoritativo arriva async

        assert.ok(sandbox.gameState.dailyOrders.claimed.includes('rides'), 'il claim deve restare');
        assert.equal(sandbox.gameState.driverCoins, 999 + 2, 'il saldo deve riflettere il valore AUTORITATIVO del server, non solo quello ottimistico locale');
    });

    test('REGRESSIONE (fix 9 agosto 2026): riscossione con RPC fallita fa rollback completo', async () => {
        // Prima del fix: st.claimed.push(id) avveniva subito e il .catch era vuoto — se la RPC
        // falliva, il premio non veniva mai accreditato ma l'ordine restava "riscosso" per
        // sempre, senza modo di ritentare. Vedi docs/SYSTEMS.md §8.
        const { sandbox, notifications } = envWithDC(async () => { throw new Error('rete simulata'); });
        primeDailyOrder(sandbox);
        sandbox.gameState.driverCoins = 10;

        sandbox.claimDailyOrder('rides');
        await new Promise(r => setTimeout(r, 20));

        assert.ok(!sandbox.gameState.dailyOrders.claimed.includes('rides'), 'il claim deve essere annullato se la RPC fallisce');
        assert.equal(sandbox.gameState.driverCoins, 10, 'il credito ottimistico deve essere disfatto — nessun DC perso né duplicato');
        assert.ok(notifications.some(n => n.type === 'error'), 'deve avvisare l\'utente dell\'errore, non fallire in silenzio');
    });

    test('un ordine non ancora completato non può essere riscosso', () => {
        const { sandbox } = envWithDC(async (amount) => ({ ok: true, driver_coins: amount }));
        primeDailyOrder(sandbox, { totalRides: 0 }); // progresso 0/3, non "done"
        sandbox.gameState.driverCoins = 10;

        sandbox.claimDailyOrder('rides');

        assert.equal(sandbox.gameState.dailyOrders.claimed.length, 0, 'nessun claim se l\'obiettivo non è raggiunto');
        assert.equal(sandbox.gameState.driverCoins, 10, 'nessun credito se l\'obiettivo non è raggiunto');
    });

    test('lo stesso ordine non può essere riscosso due volte (doppio click)', async () => {
        const { sandbox } = envWithDC(async (amount) => ({ ok: true, driver_coins: 10 + amount }));
        primeDailyOrder(sandbox);
        sandbox.gameState.driverCoins = 10;

        sandbox.claimDailyOrder('rides');
        await new Promise(r => setTimeout(r, 20));
        const afterFirst = sandbox.gameState.driverCoins;
        sandbox.claimDailyOrder('rides'); // doppio click / retrigger
        await new Promise(r => setTimeout(r, 20));

        assert.equal(sandbox.gameState.driverCoins, afterFirst, 'la seconda chiamata non deve accreditare di nuovo');
    });
});
