'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/* Dal 31/08 (DOMANDE-PER-VLAD.md §5) il premio non lo calcola più questo file
   in locale: lo decide `rpc_claim_daily_reward` sul server, e il client
   (_checkDailyReward, engine-daily.js) si limita a chiamarla e a mostrare il
   risultato. Il mock di ServerState.claimDailyReward (test-support/game-env.js)
   riproduce fedelmente la tabella vera del server: giorni 1-6 -> €500×giorno,
   giorno 7 -> 10 Driver Coins/€0, poi la serie riparte da 1. */
describe('economy/daily-reward — login streak (_checkDailyReward)', () => {
    test('primo claim: chiama il server, mostra +€500, nessun Driver Coin (giorno 1 non ne prevede)', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 0;
        sandbox.gameState.driverCoins = 0;
        sandbox.gameState.loginStreak = 0;

        await sandbox._checkDailyReward();

        // Il mock si comporta come il bridge reale: accredita lui stesso, qui si
        // verifica solo che il risultato sia arrivato ed è quello atteso.
        assert.equal(sandbox.gameState.cash, 500);
        assert.equal(sandbox.gameState.loginStreak, 1);
        assert.equal(sandbox.gameState.driverCoins, 0, 'giorno 1 non regala DC');
    });

    test('senza ServerState.claimDailyReward (offline/non sincronizzato): nessun crash, nessun effetto', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 1234;
        sandbox.ServerState.claimDailyReward = undefined; // simula un client senza quella capacità

        await assert.doesNotReject(() => sandbox._checkDailyReward());

        assert.equal(sandbox.gameState.cash, 1234, 'nessun premio locale inventato: niente server, niente premio');
    });

    test('già riscattato oggi (already_claimed dal server): nessun effetto, nessuna notifica', async () => {
        const { sandbox } = freshEnv();
        sandbox.ServerState.claimDailyReward = async () => ({ success: false, reason: 'already_claimed', day: 4 });
        const notifications = [];
        sandbox.showNotification = (msg, type) => notifications.push({ msg, type });
        sandbox.gameState.cash = 999;

        await sandbox._checkDailyReward();

        assert.equal(sandbox.gameState.cash, 999);
        assert.equal(notifications.length, 0);
    });

    test('la RPC che lancia (es. rete assente): _checkDailyReward non propaga l\'errore', async () => {
        const { sandbox } = freshEnv();
        sandbox.ServerState.claimDailyReward = async () => { throw new Error('network down'); };

        await assert.doesNotReject(() => sandbox._checkDailyReward());
    });

    test('claim al giorno 7: +10 Driver Coins, zero contanti, come da tabella approvata (DOMANDE-PER-VLAD.md §5)', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.cash = 0;
        sandbox.gameState.driverCoins = 0;
        sandbox.gameState.loginStreak = 6; // il prossimo claim è il 7°

        await sandbox._checkDailyReward();

        assert.equal(sandbox.gameState.loginStreak, 7);
        assert.equal(sandbox.gameState.cash, 0, 'giorno 7 non dà contanti');
        assert.equal(sandbox.gameState.driverCoins, 10);
    });

    test('claim oltre il giorno 7: lo streak riparte da 1 (nessun giorno 8/14/30)', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.loginStreak = 7;
        sandbox.gameState.cash = 0;

        await sandbox._checkDailyReward();

        assert.equal(sandbox.gameState.loginStreak, 1, 'la tabella approvata riparte da 1 dopo il 7, non prosegue');
        assert.equal(sandbox.gameState.cash, 500);
    });

    test('annualProfitTracker segue il cash del premio (unico effetto puramente locale rimasto)', async () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.loginStreak = 2; // il prossimo è il 3°: €1500
        sandbox.gameState.annualProfitTracker = 1000;

        await sandbox._checkDailyReward();

        assert.equal(sandbox.gameState.annualProfitTracker, 1000 + 1500);
    });
});
