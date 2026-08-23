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

    test('REGRESSIONE (fix stabilizzazione 10 agosto): il cash della ricompensa sincronizza col server — prima restava locale finché non arrivava un\'altra azione a innescare un syncCash, con lo stesso rischio di rifiuto RPC già riprodotto dal vivo per i prestiti', async () => {
        const calls = [];
        const { sandbox } = freshEnv({ serverState: { syncCash: async (v) => { calls.push(v); return { success: true, cash: v }; } } });
        sandbox.gameState.cash = 0;
        sandbox.gameState.lastDailyClaim = 0;

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 10));

        assert.deepEqual(calls, [500], 'la ricompensa del giorno 1 (+€500) deve essere sincronizzata col server');
    });

    // ── Tier intermedi (giorni 2, 3, 5, 14, 30) ──────────────────────────
    // Nessun test li copriva: raddoppiare una riga della tabella DAILY_REWARDS
    // lasciava tutta la suite verde. Ogni test fissa l'importo ESATTO di cash e
    // il delta di Driver Coin che deve arrivare al server per quel tier.
    function bancoTier() {
        const dcCalls = [];
        const { sandbox } = freshEnv({
            serverState: {
                syncCash: async (v) => ({ success: true, cash: v }),
                addDriverCoins: async (amount) => {
                    dcCalls.push(amount);
                    return { ok: true, driver_coins: 777 }; // valore autoritativo simulato
                },
            },
        });
        return { sandbox, dcCalls };
    }

    function setupClaim(sandbox, giaFatti) {
        // Come se fossero già stati reclamati `giaFatti` giorni consecutivi e
        // il prossimo claim avvenga oggi (24h dopo l'ultimo: oltre la finestra
        // di 20h, dentro quella di 48h).
        sandbox.gameState.cash = 0;
        sandbox.gameState.loginStreak = giaFatti;
        sandbox.gameState.lastDailyClaim = giaFatti > 0 ? Date.now() - 24 * 3600 * 1000 : 0;
    }

    test('tier giorno 2: €1000, nessun Driver Coin', async () => {
        const { sandbox, dcCalls } = bancoTier();
        setupClaim(sandbox, 1);

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 20));

        assert.equal(sandbox.gameState.loginStreak, 2);
        assert.equal(sandbox.gameState.cash, 1000, 'tier "Giorno 2" — €1000');
        assert.deepEqual(dcCalls, [], 'il tier giorno 2 non prevede Driver Coin');
    });

    test('tier giorno 3: €1500 e primo Driver Coin (delta 1, server-authoritative)', async () => {
        const { sandbox, dcCalls } = bancoTier();
        setupClaim(sandbox, 2);

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 20));

        assert.equal(sandbox.gameState.loginStreak, 3);
        assert.equal(sandbox.gameState.cash, 1500, 'tier "Giorno 3" — €1500');
        assert.deepEqual(dcCalls, [1], 'il tier giorno 3 regala esattamente 1 Driver Coin');
        assert.equal(sandbox.gameState.driverCoins, 777, 'il finale è il valore del server');
    });

    test('tier giorno 5: €2500 e 2 Driver Coin', async () => {
        const { sandbox, dcCalls } = bancoTier();
        setupClaim(sandbox, 4);

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 20));

        assert.equal(sandbox.gameState.cash, 2500, 'tier "Giorno 5" — €2500');
        assert.deepEqual(dcCalls, [2]);
    });

    test('tier giorno 14: €10000 e 10 Driver Coin', async () => {
        const { sandbox, dcCalls } = bancoTier();
        setupClaim(sandbox, 13);

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 20));

        // 10000 del tier × 1.1 (extraMult: +10% ogni 7 giorni oltre il 7°)
        assert.equal(sandbox.gameState.cash, 11000, 'tier "2 Settimane!" — €10000 × 1.1');
        assert.deepEqual(dcCalls, [10]);
    });

    test('tier giorno 30: €25000 e 25 Driver Coin', async () => {
        const { sandbox, dcCalls } = bancoTier();
        setupClaim(sandbox, 29);

        sandbox._checkDailyReward();
        await new Promise(r => setTimeout(r, 20));

        // 25000 del tier × 1.3 (extraMult con streak 30: 3 scatti da +10%)
        assert.equal(sandbox.gameState.cash, 32500, 'tier "Un Mese!" — €25000 × 1.3');
        assert.deepEqual(dcCalls, [25]);
    });
});
