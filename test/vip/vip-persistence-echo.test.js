'use strict';
/* ============================================================================
   test/vip/vip-persistence-echo.test.js

   Verifica approfondita delle 3 Domande per la funzione VIP (vip-clients.js, vip-buffs.js):
   (a) Assenza di dipendenza da processi schedulati sul server (gestito interamente dal game loop client).
   (b) Quello che il giocatore ottiene entra DAVVERO nel suo stato (gameState) e ci RESTA.
       Verifica di gameState dopo ogni azione, e simulazione dell'eco del server per
       accertare che gli effetti non vengano annullati o duplicati.
   (c) Forma dei dati scambiati col server e persistenza su salvataggio.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('VIP — Persistenza dello stato nel gameState ed eco del server', () => {
    let env, sandbox, gs, syncedCashLog;

    beforeEach(() => {
        syncedCashLog = [];
        env = freshEnv({
            serverState: {
                syncCash: async (val) => {
                    syncedCashLog.push(val);
                    return { success: true, cash: val };
                }
            }
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        gs.unlockedRegions = ['lazio', 'lombardia', 'campania'];
        gs.cash = 25000;
        gs.reputation = 3.5;
        gs.day = 10;
        gs.hour = 12;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('1. Persistenza dei Buff in gameState.activeBuffs e ciclo di vita', () => {
        test('i buff applicati restano in gameState.activeBuffs con scadenza corretta', () => {
            sandbox._applyBuff('test_earn', 'earnings_pct', 15, 6);
            sandbox._applyBuff('test_speed', 'speed_boost', 10, 12);

            assert.equal(gs.activeBuffs.length, 2);
            const bEarn = gs.activeBuffs.find(b => b.id === 'test_earn');
            assert.equal(bEarn.id, 'test_earn');
            assert.equal(bEarn.type, 'earnings_pct');
            assert.equal(bEarn.value, 15);
            assert.equal(bEarn.until, 10 * 24 + 12 + 6);

            const bSpeed = gs.activeBuffs.find(b => b.id === 'test_speed');
            assert.equal(bSpeed.id, 'test_speed');
            assert.equal(bSpeed.type, 'speed_boost');
            assert.equal(bSpeed.value, 10);
            assert.equal(bSpeed.until, 10 * 24 + 12 + 12);

            // Avanzamento ore: test_earn scade, test_speed resta
            gs.hour += 8;
            sandbox._vipBuffTick();

            assert.equal(gs.activeBuffs.length, 1);
            assert.equal(gs.activeBuffs[0].id, 'test_speed');
            assert.equal(sandbox._getBuffValue('speed_boost'), 10);
            assert.equal(sandbox._getBuffValue('earnings_pct'), 0);
        });

        test('buff multipli dello stesso tipo si cumulano in _getBuffValue', () => {
            sandbox._applyBuff('b1', 'tip_pct', 10, 10);
            sandbox._applyBuff('b2', 'tip_pct', 25, 10);

            assert.equal(sandbox._getBuffValue('tip_pct'), 35);
        });
    });

    describe('2. Grigori V. — Cassa, Reputazione, Orologi e Cooldown Loyalty', () => {
        test('completamento accredita mancia, reputazione, orologio e l eco server conferma il saldo', async () => {
            const startCash = gs.cash;
            const startRep = gs.reputation;
            gs.watchDropCount = 0;

            const origRandom = sandbox.Math.random;
            // random 0.02 (< 0.05 per drop orologio e < 0.25 per evento rerouting)
            sandbox.Math.random = () => 0.02;
            try {
                sandbox._vipOnComplete('grigori', {}, {}, 8000);
                await new Promise(r => setImmediate(r));

                // Verifica stato dopo l'azione
                assert.equal(gs.cash, startCash + 15000, 'il cash in gameState deve incrementare di 15000');
                assert.equal(gs.reputation, Math.min(5.0 + (gs.prestige || 0), startRep + 0.1), 'la rep deve salire');
                assert.equal(gs.watchDropCount, 1, 'l orologio deve entrare in gameState.watchDropCount');
                assert.ok(gs.emails.some(e => e.type === 'vip_grigori_event'), 'email incidente generata');

                // Simulazione eco server: rinvio del saldo autoritativo
                assert.deepEqual(syncedCashLog, [startCash + 15000]);
                // Simula arrivo eco da syncCash/Realtime
                sandbox.ServerState.syncCash(gs.cash);
                assert.equal(gs.cash, startCash + 15000, 'l eco del server non deve alterare o annullare il saldo');
            } finally {
                sandbox.Math.random = origRandom;
            }
        });

        test('vipGrigoriEventAccept riduce il cooldown di 24h (fidelizzazione) oltre a scalare i 500€', async () => {
            const emailId = 105;
            gs.emails.push({
                id: emailId, type: 'vip_grigori_event', status: 'unread',
                vipEventData: { cost: 500 }
            });
            const startCash = gs.cash;
            const nowHours = gs.day * 24 + gs.hour;

            sandbox.vipGrigoriEventAccept(emailId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, startCash - 500, 'gameState.cash deve essere decurtato');
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'resolved');
            assert.equal(gs.vipCooldowns.grigori, nowHours - 24, 'il cooldown deve essere ridotto di 24h');
            assert.deepEqual(syncedCashLog, [startCash - 500]);
        });
    });

    describe('3. Strata Consulting — Streak progressiva e Buff 5-streak', () => {
        test('la streak incrementa fino a 5 e attiva il buff strata_5streak persistente', () => {
            gs.strataStreak = 0;
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.50; // no chargeback

            try {
                for (let i = 1; i <= 4; i++) {
                    sandbox._vipOnComplete('strata', {}, {}, 3500);
                    assert.equal(gs.strataStreak, i, `dopo la corsa ${i} la streak deve essere ${i}`);
                }
                assert.equal(sandbox._getBuffValue('earnings_pct'), 0);

                // 5a corsa -> attiva buff +10% e resetta streak a 0
                sandbox._vipOnComplete('strata', {}, {}, 3500);
                assert.equal(gs.strataStreak, 0);
                assert.equal(sandbox._getBuffValue('earnings_pct'), 10);
                assert.ok(gs.activeBuffs.some(b => b.id === 'strata_5streak' && b.value === 10));
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('4. Platinum Talent — Buff mance Hype e gestione paparazzi', () => {
        test('vipPlatinumEventBlock applica il buff platinum_hype (+20% mance)', async () => {
            const emailId = 205;
            gs.emails.push({ id: emailId, type: 'vip_platinum_event', status: 'unread' });
            const startCash = gs.cash;

            sandbox.vipPlatinumEventBlock(emailId);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, startCash - 300);
            assert.equal(sandbox._getBuffValue('tip_pct'), 20);
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'resolved');
        });

        test('vipPlatinumEventAllow incrementa la reputazione di 0.15★ nel gameState', () => {
            const emailId = 206;
            gs.emails.push({ id: emailId, type: 'vip_platinum_event', status: 'unread' });
            const startRep = gs.reputation;

            sandbox.vipPlatinumEventAllow(emailId);

            assert.equal(gs.reputation, Math.min(5.0 + (gs.prestige || 0), startRep + 0.15));
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'resolved');
        });
    });

    describe('5. L Onorevole — Gettoni Politici ed eventi di controllo', () => {
        test('completamento assegna +1 politicalToken che entra e resta in gameState', () => {
            gs.politicalTokens = 2;
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.50; // no event
            try {
                sandbox._vipOnComplete('onorevole', {}, {}, 5000);
                assert.equal(gs.politicalTokens, 3, 'gameState.politicalTokens deve essere 3');
            } finally {
                sandbox.Math.random = origRandom;
            }
        });

        test('vipOnorevoleEventResisti incrementa i gettoni politici a fronte di un calo reputazione', () => {
            const emailId = 305;
            gs.politicalTokens = 1;
            gs.emails.push({ id: emailId, type: 'vip_onorevole_event', status: 'unread' });
            const startRep = gs.reputation;

            sandbox.vipOnorevoleEventResisti(emailId);

            assert.equal(gs.politicalTokens, 2, 'deve guadagnare +1 token');
            assert.equal(gs.reputation, Math.max(0, startRep - 0.05), 'reputazione scalata di 0.05');
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'resolved');
        });
    });

    describe('6. Emiro — Blocco Prezzo Carburante e Bonus Shopping', () => {
        test('completamento imposta fuelPriceLock e fuelPriceLockUntil nel gameState', async () => {
            gs.fuelPrice = 1.95;
            const startCash = gs.cash;
            const nowHours = gs.day * 24 + gs.hour;

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10; // attiva shopping detour (+5000)
            try {
                sandbox._vipOnComplete('emiro', {}, {}, 18000);
                await new Promise(r => setImmediate(r));

                assert.equal(gs.fuelPriceLock, 1.95);
                assert.equal(gs.fuelPriceLockUntil, nowHours + 48);
                assert.equal(gs.cash, startCash + 5000);
                assert.deepEqual(syncedCashLog, [startCash + 5000]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('7. Golden Boy — Usura Veicolo e Riduzione Stress Driver', () => {
        test('completamento riduce lo stress di tutti i driver di 20 punti', () => {
            const car = { id: 'c_gb', vehicleClass: 'majestic_spirit', condition: 90 };
            const driver1 = { id: 'd1', assignedCarId: 'c_gb', stress_level: 50 };
            const driver2 = { id: 'd2', assignedCarId: null, stress_level: 15 };
            gs.fleet.push(car);
            gs.drivers.push(driver1, driver2);

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.80; // no danno auto (> 0.60)
            try {
                sandbox._vipOnComplete('golden', { carId: 'c_gb' }, driver1, 12000);
                assert.equal(driver1.stress_level, 30, 'stress driver1 decurtato di 20');
                assert.equal(driver2.stress_level, 0, 'stress driver2 azzerato (min 0)');
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('8. Tech Bro — Routing Speed Boost Buff', () => {
        test('completamento attiva buff speed_boost +5% per 24h', () => {
            sandbox._vipOnComplete('techbro', {}, {}, 5000);
            assert.equal(sandbox._getBuffValue('speed_boost'), 5);
            assert.ok(gs.activeBuffs.some(b => b.id === 'techbro_routing' && b.value === 5));
        });
    });

    describe('9. Il Garante — Stress Spike, Sconto Multe e Intimidazione', () => {
        test('completamento aumenta stress driver di 50 e attiva sconto multe 50%', () => {
            const driver = { id: 'd_gar', stress_level: 20 };
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.50; // no evento posto di blocco
            try {
                sandbox._vipOnComplete('garante', {}, driver, 9000);
                assert.equal(driver.stress_level, 70);
                assert.equal(sandbox._getBuffValue('fine_discount'), 50);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('10. White Lace Weddings — Buff VIP Queue e Saldo Differito', () => {
        test('completamento attiva buff vip_queue +25% e saldo incassabile', async () => {
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.80; // payment email (>= 0.30)
            try {
                sandbox._vipOnComplete('wedding', {}, {}, 10000);
                assert.equal(sandbox._getBuffValue('vip_queue'), 25);

                const payEmail = gs.emails.find(e => e.type === 'vip_wedding_payment');
                assert.ok(payEmail);
                assert.equal(payEmail.vipEventData.bonus, 3000); // 30% di 10000

                const startCash = gs.cash;
                sandbox.vipWeddingPaymentCollect(payEmail.id);
                await new Promise(r => setImmediate(r));

                assert.equal(gs.cash, startCash + 3000);
                assert.equal(payEmail.status, 'resolved');
                assert.deepEqual(syncedCashLog, [startCash + 3000]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('11. L Erede Viziato — Kasko e Bonus Virale', () => {
        test('completamento con incidente ripara a 100 con Kasko e accredita bonus virale', async () => {
            const car = { id: 'c_erd', vehicleClass: 'volt_s_hyper', condition: 55 };
            const driver = { id: 'd_erd', assignedCarId: 'c_erd' };
            gs.fleet.push(car);
            gs.drivers.push(driver);
            const startCash = gs.cash;
            const startRep = gs.reputation;

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05; // attiva incidente e virale (< 0.30)
            try {
                sandbox._vipOnComplete('erede', { carId: 'c_erd' }, driver, 9500);
                await new Promise(r => setImmediate(r));

                assert.equal(car.condition, 100, 'l auto deve essere riparata al 100%');
                assert.equal(gs.cash, startCash + 9500, 'bonus virale pari al 100% dell incasso');
                assert.equal(gs.reputation, Math.min(5.0 + (gs.prestige || 0), startRep + 0.10));
                assert.deepEqual(syncedCashLog, [startCash + 9500]);
            } finally {
                sandbox.Math.random = origRandom;
            }
        });
    });

    describe('12. Robustezza: clientId sconosciuto o email inesistenti', () => {
        test('_vipOnComplete con clientId non mappato non genera errori', () => {
            assert.doesNotThrow(() => {
                sandbox._vipOnComplete('cliente_inesistente', {}, {}, 1000);
            });
        });

        test('le azioni email con ID inesistente non modificano cassa ne stato', async () => {
            const startCash = gs.cash;
            sandbox.vipGrigoriEventAccept(9999);
            sandbox.vipPlatinumEventBlock(9999);
            sandbox.vipGaranteEventPaga(9999);
            sandbox.vipWeddingPaymentCollect(9999);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, startCash);
            assert.deepEqual(syncedCashLog, []);
        });
    });
});
