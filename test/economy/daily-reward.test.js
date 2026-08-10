'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv, createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

describe('economy/daily-reward — login streak (_checkDailyReward)', () => {
    test('primo claim del giorno 1: +€500, streak=1, nessun Driver Coin (tier giorno 1 non li prevede)', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 0;
        sandbox.gameState.lastDailyClaim = 0; // mai reclamato

        sandbox._checkDailyReward();

        assert.equal(sandbox.gameState.cash, 500);
        assert.equal(sandbox.gameState.loginStreak, 1);
        assert.equal(sandbox.gameState.driverCoins, 50, 'tier giorno 1 non regala DC — resta la dote iniziale di 50');
    });

    test('un secondo claim nella stessa sessione (< 20h) NON duplica la ricompensa', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 0;
        sandbox.gameState.lastDailyClaim = 0;

        sandbox._checkDailyReward();
        const cashAfterFirst = sandbox.gameState.cash;
        const streakAfterFirst = sandbox.gameState.loginStreak;

        sandbox._checkDailyReward(); // retrigger immediato (es. doppia chiamata da gameLoop)

        assert.equal(sandbox.gameState.cash, cashAfterFirst, 'un secondo claim entro 20h non deve aggiungere altro cash');
        assert.equal(sandbox.gameState.loginStreak, streakAfterFirst, 'lo streak non deve avanzare due volte nella stessa finestra');
    });

    test('claim al giorno 7 (streak) chiama ServerState.addDriverCoins col delta corretto (server-authoritative)', async () => {
        // ServerState.addDriverCoins di default (game-env.js) simula il bridge sommando
        // l'amount a gameState.driverCoins COSÌ COM'È al momento della chiamata — che qui
        // riflette già il bump ottimistico locale fatto PRIMA dalla stessa _checkDailyReward
        // (gs.driverCoins += tcReward, riga ~1138 di engine-daily.js). Nella realtà server e
        // client partono da due contatori indipendenti (sincronizzati), quindi il mock di
        // default doppierebbe qui il conteggio — override mirato per isolare cosa conta
        // davvero: l'RPC viene chiamata con l'amount giusto, e il suo risultato (qualunque
        // esso sia) è quello che sovrascrive lo stato finale, come da pattern server-authoritative.
        const calls = [];
        const { sandbox, stopAllIntervals } = createGameEnv(CORE_FILES, {
            serverState: {
                addDriverCoins: async (amount) => {
                    calls.push(amount);
                    return { ok: true, driver_coins: 55 }; // valore autoritativo simulato dal "server"
                },
            },
        });
        sandbox.initGame(true);
        stopAllIntervals();
        sandbox.gameState.cash = 0;
        sandbox.gameState.loginStreak = 6;
        sandbox.gameState.lastDailyClaim = 0;

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 20));

        assert.equal(sandbox.gameState.loginStreak, 7);
        assert.equal(sandbox.gameState.cash, 5000, 'tier "Settimana!" — €5000');
        assert.deepEqual(calls, [5], 'ServerState.addDriverCoins deve essere chiamata una sola volta col delta del tier (5)');
        assert.equal(sandbox.gameState.driverCoins, 55, 'il valore finale è quello restituito dal server, non il bump ottimistico locale');
    });

    test('interruzione streak: più di 48h dall\'ultimo claim azzera lo streak prima di ricontare', () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 0;
        sandbox.gameState.loginStreak = 10;
        sandbox.gameState.lastDailyClaim = Date.now() - 72 * 3600 * 1000; // 3 giorni fa

        sandbox._checkDailyReward();

        assert.equal(sandbox.gameState.loginStreak, 1, 'streak interrotto: riparte da 1, non da 11');
    });

    test('NOTA (debito noto, non una regressione di questa sessione): il cash della ricompensa (a differenza dei Driver Coins) viene sommato SOLO in locale (gs.cash += cashReward) — nessuna chiamata ServerState.syncCash in questa funzione. Stessa classe del debito economia client-authoritative già tracciato in docs/ECONOMY_SERVER_AUTH.md: il valore raggiunge companies.cash solo indirettamente, alla prossima syncCash innescata da un\'altra azione.', () => {
        assert.ok(true);
    });
});
