'use strict';
/* ============================================================================
   test/daily/daily-sync.test.js

   Regressione per il bug economico in engine-daily.js:
   tutte le funzioni che muovono denaro o Driver Coins DEVONO passare dalla
   porta unica CE_money (spend / earn / spendDC / earnDC) e sincronizzare
   lo stato col server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupDailyEnv() {
    const syncedCash = [];
    const addedDC = [];
    const spentDC = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
            addDriverCoins: async (n, motivo) => {
                addedDC.push({ n, motivo });
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
            spendDriverCoins: async (motivo, n) => {
                spentDC.push({ motivo, n });
                return { ok: true, driver_coins: (env.sandbox.gameState.driverCoins || 0) };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash, addedDC, spentDC };
}

describe('engine-daily — sincronizzazione cassa e DC col server (CE_money)', () => {

    describe('autoNegotiateEmails', () => {
        test('chiude trattativa B2B, accredita la controfferta e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDailyEnv();
            gs.cash = 10000;
            gs.reputation = 4.0;
            gs.staff.push({ id: 'evt_mgr', name: 'Event Manager', salary: 3000 });
            gs.emails = [
                { id: 1, type: 'b2b', offer: 5000, status: 'unread', subject: 'Offerta B2B' },
            ];

            sandbox.autoNegotiateEmails();
            await new Promise(r => setImmediate(r));

            // offer 5000 * 1.15 = 5750 -> cash = 15750
            assert.equal(gs.cash, 15750);
            assert.equal(gs.emails[0].status, 'resolved');
            assert.deepEqual(syncedCash, [15750]);
        });
    });

    describe('negotiateEmail', () => {
        test('ceo_event con costo scala i fondi e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDailyEnv();
            gs.cash = 10000;
            gs.reputation = 4.0;
            gs.emails = [
                {
                    id: 42,
                    type: 'ceo_event',
                    status: 'unread',
                    eventData: {
                        choices: [
                            { text: 'Sponsorizza gala', cost: 3000, repBonus: 0.2 },
                            { text: 'Rifiuta', cost: 0, repBonus: 0 },
                        ],
                    },
                },
            ];

            sandbox.negotiateEmail(42, null, 0);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 7000);
            assert.equal(gs.emails[0].status, 'resolved');
            assert.deepEqual(syncedCash, [7000]);
        });

        test('ceo_event con fondi insufficienti non scala denaro, non sincronizza e non risolve', async () => {
            const { sandbox, gs, syncedCash } = setupDailyEnv();
            gs.cash = 1000;
            gs.emails = [
                {
                    id: 43,
                    type: 'ceo_event',
                    status: 'unread',
                    eventData: {
                        choices: [
                            { text: 'Sponsorizza gala', cost: 3000, repBonus: 0.2 },
                        ],
                    },
                },
            ];

            sandbox.negotiateEmail(43, null, 0);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000);
            assert.equal(gs.emails[0].status, 'unread');
            assert.deepEqual(syncedCash, []);
        });

        test('b2b trattativa con successo accredita la cifra e sincronizza con syncCash', async () => {
            const { sandbox, gs, syncedCash } = setupDailyEnv();
            gs.cash = 5000;
            gs.reputation = 5.0; // 100% chance for reasonable ask
            gs.emails = [
                { id: 99, type: 'b2b', offer: 4000, status: 'unread' },
            ];

            sandbox.negotiateEmail(99, 4000);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 9000);
            assert.equal(gs.emails[0].status, 'resolved');
            assert.deepEqual(syncedCash, [9000]);
        });
    });

    describe('_checkDailyReward', () => {
        // Dal 31/08 (DOMANDE-PER-VLAD.md §5) il premio giornaliero non passa più
        // da CE_money.earn/earnDC: lo decide e lo accredita SOLO il server
        // (rpc_claim_daily_reward), e il client si limita a chiedere e a
        // rispecchiare il risultato — cash/driverCoins arrivano poi via Realtime
        // su `companies`, non da una scrittura locale qui.
        test('riscatto ricompensa: chiama ServerState.claimDailyReward, non tocca cash/DC in locale, aggiorna solo il tracker annuale', async () => {
            const { sandbox, gs } = setupDailyEnv();
            const calls = [];
            sandbox.ServerState.claimDailyReward = async () => {
                calls.push(true);
                return { success: true, day: 3, cash: 1500, driverCoins: 1, balanceCash: 2500, balanceDriverCoins: 1 };
            };
            gs.cash = 1000;
            gs.driverCoins = 0;
            gs.annualProfitTracker = 0;

            sandbox._checkDailyReward();
            await new Promise(r => setImmediate(r));

            assert.equal(calls.length, 1, 'deve chiamare ServerState.claimDailyReward una sola volta');
            assert.equal(gs.cash, 1000, 'il cash locale non cambia qui: arriva via Realtime dal server');
            assert.equal(gs.driverCoins, 0, 'idem per i Driver Coins');
            assert.equal(gs.annualProfitTracker, 1500, 'il tracker annuale (puramente locale) segue comunque il cash accreditato');
        });

        test('already_claimed: nessuna notifica, nessun effetto', async () => {
            const { sandbox } = setupDailyEnv();
            sandbox.ServerState.claimDailyReward = async () => ({ success: false, reason: 'already_claimed', day: 3 });
            const notifications = [];
            sandbox.showNotification = (msg, type) => notifications.push({ msg, type });

            await sandbox._checkDailyReward();

            assert.equal(notifications.length, 0, 'già riscattato oggi: silenzioso, come prima');
        });
    });

    describe('_tickDriverSatisfaction', () => {
        test('con HR automation attiva evita lo sciopero deducendo bonus e sincronizzando', async () => {
            const { sandbox, gs, syncedCash } = setupDailyEnv();
            gs.cash = 10000;
            gs.hrAutomationExpiresAt = new Date(Date.now() + 86400000).toISOString();
            gs.drivers.push({
                id: 'drv_test',
                name: 'Luigi',
                salary: 2000,
                satisfaction: 25,
                isOnStrike: false,
                morale: 50,
            });

            sandbox._tickFatigue(); // calls _tickDriverSatisfaction
            await new Promise(r => setImmediate(r));

            // Bonus cost = 2000 * 0.1 = 200 -> cash = 9800
            assert.equal(gs.cash, 9800);
            assert.ok(syncedCash.includes(9800));
        });
    });

    describe('processDailyRoutines — CEO della Settimana DC prize', () => {
        test('premio domenicale CEO della settimana accredita DC via earnDC', async () => {
            const { sandbox, gs, addedDC } = setupDailyEnv();
            gs.day = 7; // Sunday: (7-1)%7 + 1 === 7
            gs.weekStartDay = 0;
            gs.weeklyEarnings = 50000; // prizeTC = min(50, floor(50000/10000)) = 5
            gs.driverCoins = 10;
            gs.investments = [];
            gs.lifestyleAssets = [];
            gs.staff = [];
            gs.drivers = [];
            gs.fleet = [];

            sandbox.processDailyRoutines();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 15);
            assert.ok(addedDC.some(d => d.n === 5 && d.motivo === 'weekly_prize'));
        });
    });
});
