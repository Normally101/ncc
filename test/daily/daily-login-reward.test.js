'use strict';
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Dal 31/08 (DOMANDE-PER-VLAD.md §5) _checkDailyReward non calcola più streak,
   cooldown o importi: chiede a ServerState.claimDailyReward() (che rispecchia
   rpc_claim_daily_reward, 76_premio_giornaliero_lato_server.sql) e si limita a
   mostrare il risultato. Il cooldown/streak/tabella premi non sono più
   testabili da qui manipolando Date.now() in locale — sono responsabilità del
   server (vedi 76_premio_giornaliero_lato_server.sql per quei test SQL/logici,
   e economy/daily-reward.test.js per la copertura via mock del giorno 1/7/8). */
describe('daily/daily-login-reward — flusso completo ricompensa giornaliera (lato client)', () => {
    let env;
    let gs;

    beforeEach(() => {
        env = freshEnv();
        gs = env.sandbox.gameState;
        gs.cash = 10000;
        gs.driverCoins = 0;
        gs.loginStreak = 0;
        gs.annualProfitTracker = 0;
    });

    test('successo: mostra BigEvent, Notification e log coerenti col risultato del server', async () => {
        env.sandbox.ServerState.claimDailyReward = async () => (
            { success: true, day: 1, cash: 500, driverCoins: 0, balanceCash: 10500, balanceDriverCoins: 0 }
        );
        const notifications = [];
        const bigEvents = [];
        const logs = [];
        env.sandbox.showNotification = (msg, type) => notifications.push({ msg, type });
        env.sandbox.showBigEvent = (icon, title, body) => bigEvents.push({ icon, title, body });
        env.sandbox.logToMap = (msg) => logs.push(msg);

        await env.sandbox._checkDailyReward();

        assert.equal(notifications.length, 1, 'deve mostrare una notification');
        assert.ok(notifications[0].msg.includes('Login streak 1'), 'notification deve menzionare streak 1');
        assert.ok(notifications[0].msg.includes('€500'), 'notification deve mostrare €500');

        assert.equal(bigEvents.length, 1, 'deve mostrare un BigEvent');
        assert.equal(bigEvents[0].icon, '🎁');
        assert.ok(bigEvents[0].title.includes('Giorno 1'));

        assert.equal(logs.length, 1);
        assert.ok(logs[0].includes('Daily reward'));
    });

    test('giorno 7: la notifica mostra i Driver Coins, non un importo in euro', async () => {
        env.sandbox.ServerState.claimDailyReward = async () => (
            { success: true, day: 7, cash: 0, driverCoins: 10, balanceCash: 10000, balanceDriverCoins: 10 }
        );
        const notifications = [];
        env.sandbox.showNotification = (msg, type) => notifications.push({ msg, type });

        await env.sandbox._checkDailyReward();

        assert.ok(notifications[0].msg.includes('10 DriverCoin'), 'giorno 7: deve mostrare i DC, non €0');
        assert.ok(!notifications[0].msg.includes('€0'), 'non deve mostrare un importo in euro fuorviante');
    });

    test('already_claimed: nessuna notifica, nessun BigEvent, nessun log', async () => {
        env.sandbox.ServerState.claimDailyReward = async () => ({ success: false, reason: 'already_claimed', day: 3 });
        const notifications = [];
        const bigEvents = [];
        const logs = [];
        env.sandbox.showNotification = (msg, type) => notifications.push({ msg, type });
        env.sandbox.showBigEvent = (icon, title, body) => bigEvents.push({ icon, title, body });
        env.sandbox.logToMap = (msg) => logs.push(msg);

        await env.sandbox._checkDailyReward();

        assert.equal(notifications.length, 0);
        assert.equal(bigEvents.length, 0);
        assert.equal(logs.length, 0);
    });

    test('successo: chiama saveGame e updateUI', async () => {
        env.sandbox.ServerState.claimDailyReward = async () => (
            { success: true, day: 1, cash: 500, driverCoins: 0 }
        );
        let saveCalled = false, updateCalled = false;
        env.sandbox.saveGame = () => { saveCalled = true; };
        env.sandbox.updateUI = () => { updateCalled = true; };

        await env.sandbox._checkDailyReward();

        assert.ok(saveCalled, 'deve chiamare saveGame dopo un claim riuscito');
        assert.ok(updateCalled, 'deve chiamare updateUI dopo un claim riuscito');
    });

    test('already_claimed: NON chiama saveGame né updateUI (nessun cambiamento da salvare)', async () => {
        env.sandbox.ServerState.claimDailyReward = async () => ({ success: false, reason: 'already_claimed' });
        let saveCalled = false, updateCalled = false;
        env.sandbox.saveGame = () => { saveCalled = true; };
        env.sandbox.updateUI = () => { updateCalled = true; };

        await env.sandbox._checkDailyReward();

        assert.ok(!saveCalled);
        assert.ok(!updateCalled);
    });

    test('annualProfitTracker aumenta del cash del premio, non del DC', async () => {
        env.sandbox.ServerState.claimDailyReward = async () => (
            { success: true, day: 3, cash: 1500, driverCoins: 1 }
        );

        await env.sandbox._checkDailyReward();

        assert.equal(gs.annualProfitTracker, 1500);
    });

    test('senza window.ServerState (ambiente non inizializzato): nessun crash, nessun effetto', async () => {
        env.sandbox.window.ServerState = undefined;
        env.sandbox.ServerState = undefined;

        await assert.doesNotReject(() => env.sandbox._checkDailyReward());

        assert.equal(gs.cash, 10000, 'nessuna modifica senza un server a cui chiedere');
    });
});
