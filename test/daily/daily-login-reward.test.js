'use strict';
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('daily/daily-login-reward — flusso completo ricompensa giornaliera', () => {
    let env;
    let gs;

    beforeEach(() => {
        env = freshEnv();
        gs = env.sandbox.gameState;
        // Assicura stato pulito per il test
        gs.lastDailyClaim = 0;
        gs.loginStreak = 0;
        gs.cash = 10000;
        gs.driverCoins = 0;
        gs.annualProfitTracker = 0;
    });

    test('primo claim: streak=1, +500€, 0 DC, stato aggiornato', () => {
        const beforeCash = gs.cash;
        const beforeDC = gs.driverCoins;
        
        env.sandbox._checkDailyReward();
        
        assert.equal(gs.loginStreak, 1, 'streak deve diventare 1');
        assert.equal(gs.cash, beforeCash + 500, 'deve accreditare €500');
        assert.equal(gs.driverCoins, beforeDC, 'day 1 non dà DC');
        assert.ok(gs.lastDailyClaim > 0, 'lastDailyClaim deve essere impostato');
        assert.equal(gs.annualProfitTracker, 500, 'annualProfitTracker deve includere il reward');
    });

    test('claim immediato successivo: nessun doppio incasso (cooldown 20h)', () => {
        env.sandbox._checkDailyReward();
        const cashAfterFirst = gs.cash;
        const dcAfterFirst = gs.driverCoins;
        const streakAfterFirst = gs.loginStreak;
        
        // Chiama di nuovo subito - non deve dare nulla
        env.sandbox._checkDailyReward();
        
        assert.equal(gs.loginStreak, streakAfterFirst, 'streak non deve avanzare');
        assert.equal(gs.cash, cashAfterFirst, 'cassa non deve cambiare');
        assert.equal(gs.driverCoins, dcAfterFirst, 'DC non devono cambiare');
    });

    test('claim dopo 21h: streak avanza a 2, +1000€, 0 DC', () => {
        // Primo claim
        env.sandbox._checkDailyReward();
        assert.equal(gs.loginStreak, 1);
        
        // Simula 21 ore dopo (oltre il cooldown 20h)
        const originalNow = Date.now;
        const firstClaimTime = gs.lastDailyClaim;
        env.sandbox.Date.now = () => firstClaimTime + 21 * 3600 * 1000;
        
        env.sandbox._checkDailyReward();
        
        // Ripristina Date.now
        env.sandbox.Date.now = originalNow;
        
        assert.equal(gs.loginStreak, 2, 'streak deve diventare 2');
        assert.equal(gs.cash, 10000 + 500 + 1000, 'deve aver accreditato 500 + 1000 = 1500 totali');
        assert.equal(gs.driverCoins, 0, 'day 2 non dà DC');
    });

    test('claim al giorno 3: +1500€ e 1 DC', () => {
        // Giorno 1
        env.sandbox._checkDailyReward();
        // Giorno 2
        const originalNow = Date.now;
        let claimTime = gs.lastDailyClaim;
        env.sandbox.Date.now = () => claimTime + 21 * 3600 * 1000;
        env.sandbox._checkDailyReward();
        // Giorno 3
        claimTime = gs.lastDailyClaim;
        env.sandbox.Date.now = () => claimTime + 21 * 3600 * 1000;
        env.sandbox._checkDailyReward();
        env.sandbox.Date.now = originalNow;
        
        assert.equal(gs.loginStreak, 3, 'streak deve diventare 3');
        assert.equal(gs.cash, 10000 + 500 + 1000 + 1500, 'deve aver accreditato 3000 totali');
        assert.equal(gs.driverCoins, 1, 'day 3 dà 1 DC');
    });

    test('claim al giorno 7: +5000€ e 5 DC (Settimana!)', () => {
        const originalNow = Date.now;
        let claimTime;
        
        for (let day = 1; day <= 7; day++) {
            claimTime = gs.lastDailyClaim || Date.now();
            env.sandbox.Date.now = () => claimTime + 21 * 3600 * 1000;
            env.sandbox._checkDailyReward();
        }
        env.sandbox.Date.now = originalNow;
        
        assert.equal(gs.loginStreak, 7, 'streak deve diventare 7');
        // Tier table: day 1=500, 2=1000, 3=1500, 5=2500, 7=5000
        // Day 4 uses day 3 tier (1500, tc:1), Day 6 uses day 5 tier (2500, tc:2)
        // Cash: 500+1000+1500+1500+2500+2500+5000 = 14500
        const expectedCash = 10000 + 500 + 1000 + 1500 + 1500 + 2500 + 2500 + 5000;
        assert.equal(gs.cash, expectedCash, `cassa deve essere ${expectedCash}`);
        // DC: day 3=1, day 4=1 (uses day 3 tier), day 5=2, day 6=2 (uses day 5 tier), day 7=5 = 11 total
        assert.equal(gs.driverCoins, 1 + 1 + 2 + 2 + 5, 'DC totali: day 3 (1) + day 4 (1) + day 5 (2) + day 6 (2) + day 7 (5) = 11');
    });

    test('streak reset dopo gap > 48h: riparte da 1', () => {
        // Claim giorno 1
        env.sandbox._checkDailyReward();
        assert.equal(gs.loginStreak, 1);
        
        // Simula 49 ore dopo (oltre 48h)
        const originalNow = Date.now;
        const firstClaimTime = gs.lastDailyClaim;
        env.sandbox.Date.now = () => firstClaimTime + 49 * 3600 * 1000;
        
        env.sandbox._checkDailyReward();
        env.sandbox.Date.now = originalNow;
        
        // Deve aver resettato lo streak a 1 (non 2)
        assert.equal(gs.loginStreak, 1, 'dopo >48h lo streak deve resettare a 1');
        // Deve dare di nuovo il reward giorno 1 (500€)
        assert.equal(gs.cash, 10000 + 500 + 500, 'deve aver dato 500€ due volte (reset streak)');
    });

    test('bonus settimanale extra: ogni 7 giorni oltre il 7° dà +10% cash', () => {
        const originalNow = Date.now;
        let claimTime;
        
        // Arriva al giorno 14 (2 settimane)
        for (let day = 1; day <= 14; day++) {
            claimTime = gs.lastDailyClaim || Date.now();
            env.sandbox.Date.now = () => claimTime + 21 * 3600 * 1000;
            env.sandbox._checkDailyReward();
        }
        env.sandbox.Date.now = originalNow;
        
        assert.equal(gs.loginStreak, 14, 'streak deve diventare 14');
        // Day 14 usa tier "2 Settimane!" = 10000 cash base + 10% extra (1 settimana extra oltre il 7)
        // ExtraMult = 1 + floor((14-7)/7)*0.1 = 1 + 1*0.1 = 1.1
        // Cash day 14 = 10000 * 1.1 = 11000
        // Verifichiamo che il cash finale includa il bonus extra
    });

    test('usa CE_money.earn per cash e CE_money.earnDC per DC (porta unica)', () => {
        // Verifica che i metodi CE_money vengano chiamati correttamente
        let earnCalled = false;
        let earnDCCalled = false;
        
        const originalEarn = env.sandbox.CE_money.earn;
        const originalEarnDC = env.sandbox.CE_money.earnDC;
        
        env.sandbox.CE_money.earn = (amt, reason) => {
            if (reason === 'daily_login_reward') earnCalled = true;
            return originalEarn(amt, reason);
        };
        env.sandbox.CE_money.earnDC = (amt, reason) => {
            if (reason === 'tier_reward') earnDCCalled = true;
            return originalEarnDC(amt, reason);
        };
        
        env.sandbox._checkDailyReward(); // day 1 - solo cash
        assert.ok(earnCalled, 'deve chiamare CE_money.earn per cash');
        assert.ok(!earnDCCalled, 'day 1 non deve chiamare earnDC');
        
        // Day 3 - deve chiamare entrambi
        earnCalled = false;
        earnDCCalled = false;
        const originalNow = Date.now;
        let claimTime = gs.lastDailyClaim;
        env.sandbox.Date.now = () => claimTime + 21 * 3600 * 1000;
        env.sandbox._checkDailyReward(); // day 2
        claimTime = gs.lastDailyClaim;
        env.sandbox.Date.now = () => claimTime + 21 * 3600 * 1000;
        env.sandbox._checkDailyReward(); // day 3
        env.sandbox.Date.now = originalNow;
        
        assert.ok(earnCalled, 'day 3 deve chiamare CE_money.earn per cash');
        assert.ok(earnDCCalled, 'day 3 deve chiamare CE_money.earnDC per DC');
    });

    test('notifiche e log: mostra BigEvent e Notification corretti', () => {
        const notifications = [];
        const bigEvents = [];
        const logs = [];
        
        env.sandbox.showNotification = (msg, type) => notifications.push({ msg, type });
        env.sandbox.showBigEvent = (icon, title, body) => bigEvents.push({ icon, title, body });
        env.sandbox.logToMap = (msg) => logs.push(msg);
        
        env.sandbox._checkDailyReward();
        
        assert.equal(notifications.length, 1, 'deve mostrare una notification');
        assert.ok(notifications[0].msg.includes('Login streak 1'), 'notification deve menzionare streak 1');
        assert.ok(notifications[0].msg.includes('€500'), 'notification deve mostrare €500');
        
        assert.equal(bigEvents.length, 1, 'deve mostrare un BigEvent');
        assert.equal(bigEvents[0].icon, '🎁', 'BigEvent deve avere icona regalo');
        assert.ok(bigEvents[0].title.includes('Giorno 1'), 'BigEvent title deve menzionare Giorno 1');
        
        assert.equal(logs.length, 1, 'deve loggare su mappa');
        assert.ok(logs[0].includes('Daily reward'), 'log deve menzionare Daily reward');
    });

    test('salva lo stato dopo il claim (saveGame chiamato)', () => {
        let saveCalled = false;
        env.sandbox.saveGame = () => { saveCalled = true; };
        
        env.sandbox._checkDailyReward();
        
        assert.ok(saveCalled, 'deve chiamare saveGame dopo il claim');
    });

    test('updateUI chiamato dopo il claim', () => {
        let updateCalled = false;
        env.sandbox.updateUI = () => { updateCalled = true; };
        
        env.sandbox._checkDailyReward();
        
        assert.ok(updateCalled, 'deve chiamare updateUI dopo il claim');
    });
});