'use strict';
// BLOCCO 3 — lo status deve valere qualcosa, e le ricompense rare devono vedersi.
//
// La classifica globale non aveva NESSUNA ricompensa agganciata: una vetrina da
// guardare. E l'orologio svizzero di Grigori (5% su una corsa gia' rara)
// incrementava un contatore che nessun file leggeva. Una ricompensa invisibile
// non e' una ricompensa.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');
const { freshEnv } = require('../../test-support/game-env.js');

// Porta il calendario al giorno in cui scatta il giro settimanale.
function domenica(gs) {
    gs.day = 7;                 // ((7-1) % 7) + 1 === 7
    gs.weekStartDay = 1;        // > weekStartDay + 3
}

describe('economia/status — il podio paga, i trofei si vedono', () => {

    describe('premio del podio settimanale', () => {
        test('chiudere la settimana al primo posto accredita Driver Coins', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                domenica(gs);
                gs.weeklyEarnings = 0;      // isola: nessun premio «CEO della settimana»
                gs.weeklyRides = 0;
                gs.driverCoins = 0;
                // Nessun rivale con reputazione superiore ⇒ primo posto.
                gs.reputation = 99;

                sandbox.processDailyRoutines();

                assert.ok(gs.driverCoins >= 15,
                    `il primo posto deve valere 15 DC, accreditati ${gs.driverCoins}`);
                assert.equal(gs.podiumBadge.pos, 1, 'il badge registra la posizione');
                assert.equal(gs.podiumWeeks, 1, 'il conteggio dei podi avanza');
            } finally { stopAllIntervals(); }
        });

        test('fuori dal podio non si prende nulla', () => {
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                domenica(gs);
                gs.weeklyEarnings = 0; gs.weeklyRides = 0; gs.driverCoins = 0;
                gs.reputation = 0;          // dietro a tutti i rivali

                sandbox.processDailyRoutines();

                assert.equal(gs.driverCoins, 0, 'fuori dai primi tre non c\'e\' premio');
                assert.equal(gs.podiumWeeks || 0, 0);
            } finally { stopAllIntervals(); }
        });

        test('il premio del podio resta modesto rispetto al CEO della settimana', () => {
            // 15 DC contro i 50 del premio principale: deve dire «sei visto»,
            // non decidere la partita.
            const { sandbox, stopAllIntervals } = freshEnv();
            try {
                const gs = sandbox.gameState;
                domenica(gs);
                gs.weeklyEarnings = 0; gs.weeklyRides = 0; gs.driverCoins = 0;
                gs.reputation = 99;
                sandbox.processDailyRoutines();
                assert.ok(gs.driverCoins <= 20, 'il premio del podio non deve gareggiare col premio principale');
            } finally { stopAllIntervals(); }
        });
    });

    describe('bacheca dei trofei', () => {
        // Serve il rendering vero: di default il banco lo neutralizza.
        const conRender = () => {
            const env = createGameEnv(CORE_FILES, { render: true });
            env.sandbox.initGame(true);
            env.stopAllIntervals();
            return env;
        };

        test('l\'orologio di Grigori compare nella vetrina', () => {
            const env = conRender();
            try {
                const { sandbox } = env;
                const gs = sandbox.gameState;
                gs.watchDropCount = 2;
                const c = sandbox.document.createElement('div');
                c.id = 'tab-container';
                sandbox.document.body.appendChild(c);

                sandbox.renderTabPrestigio();

                assert.ok(/Orologio svizzero/.test(c.innerHTML),
                    'il drop raro deve essere visibile, non solo un contatore in memoria');
                assert.ok(/2 pezzi/.test(c.innerHTML), 'deve mostrare quanti ne hai');
            } finally { env.stopAllIntervals(); }
        });

        test('senza trofei la bacheca spiega cosa ci finira\'', () => {
            const env = conRender();
            try {
                const { sandbox } = env;
                const gs = sandbox.gameState;
                gs.watchDropCount = 0; gs.podiumWeeks = 0; gs.fleet = [];
                const c = sandbox.document.createElement('div');
                c.id = 'tab-container';
                sandbox.document.body.appendChild(c);

                sandbox.renderTabPrestigio();

                assert.ok(/Bacheca dei Trofei/.test(c.innerHTML), 'la bacheca c\'e\' comunque');
                assert.ok(/Ancora vuota/.test(c.innerHTML), 'e dice cosa ci arrivera\'');
            } finally { env.stopAllIntervals(); }
        });
    });
});
