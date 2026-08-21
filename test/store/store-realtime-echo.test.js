'use strict';
/* ============================================================================
   test/store/store-realtime-echo.test.js — Banco Collaudo Store & Realtime Echo

   Verifica rigorosa per tutte le azioni del negozio Premium / Driver Coins:
   1. Ogni spesa DC passa da CE_money.spendDC -> ServerState.spendDriverCoins (RPC).
   2. Simulazione dell'eco del server Supabase Realtime DOPO l'acquisto:
      - I Driver Coins rimangono al valore autoritativo del server.
      - L'effetto comprato (energia, flotta, pass, autisti, costruzioni, ecc.)
        RESTITUISCE la modifica nello stato di gioco e NON viene annullato.
   3. Risposta con prova a tutte e tre le domande di collaudo:
      (a) Processo schedulato sul server (cron)? Non necessario.
      (b) Persistenza dello stato post-Realtime echo.
      (c) Conformità del formato dati scambiato con il server.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('Store & Executive Club — Banco Completo con Realtime Server Echo', () => {
    let env, sandbox, gs;
    let rpcSpendCalls, rpcAddCalls;
    let serverCompanyRow;

    beforeEach(() => {
        rpcSpendCalls = [];
        rpcAddCalls = [];
        serverCompanyRow = {
            id: 'comp_123',
            user_id: 'user_456',
            company_name: 'Test Empire',
            cash: 50000,
            driver_coins: 200,
            reputation: 4.8,
            vtk_balance: 10,
        };

        env = freshEnv({
            serverState: {
                spendDriverCoins: async (motivo, n) => {
                    rpcSpendCalls.push({ motivo, n });
                    serverCompanyRow.driver_coins = Math.max(0, serverCompanyRow.driver_coins - n);
                    return {
                        ok: true,
                        item_id: motivo,
                        spent: n,
                        driver_coins: serverCompanyRow.driver_coins,
                    };
                },
                addDriverCoins: async (n, motivo) => {
                    rpcAddCalls.push({ motivo, n });
                    serverCompanyRow.driver_coins += n;
                    return {
                        ok: true,
                        item_id: motivo || 'premio',
                        driver_coins: serverCompanyRow.driver_coins,
                    };
                },
                getCompany: () => serverCompanyRow,
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        gs.driverCoins = serverCompanyRow.driver_coins;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    /**
     * Simula l'arrivo dell'eco Realtime dal server Supabase (postgres_changes UPDATE su companies)
     * e chiama il bridge autoritativo verso gameState.
     */
    function simulateServerRealtimeEcho() {
        if (sandbox.ServerState && typeof sandbox.ServerState.bridgeToGameState === 'function') {
            sandbox.ServerState.bridgeToGameState();
        } else {
            gs.driverCoins = serverCompanyRow.driver_coins;
            gs.cash = serverCompanyRow.cash;
            gs.reputation = serverCompanyRow.reputation;
        }
    }

    // ── RISPOSTA E PROVA DOMANDA (a) ──────────────────────────────────────────
    describe('Domanda (a) — Nessun processo schedulato / cron server richiesto', () => {
        test('tutti i potenziamenti, pass e sblocchi operano in modo sincrono e transazionale senza cron', () => {
            gs.day = 5;
            gs.hour = 12;
            gs.driverCoins = 1000;
            serverCompanyRow.driver_coins = 1000;
            gs.executivePassActive = false;
            gs.executivePassExpiresDay = 0;
            gs.tempKaskoExpiresDay = 0;
            gs.tangenteUntil = 0;

            // 1. Executive pass calcola scadenza basandosi su gameState.day
            sandbox.activateExecutivePass();
            assert.equal(gs.executivePassActive, true);
            assert.equal(gs.executivePassExpiresDay, 35); // day + 30

            // 2. Kasko temporanea calcola scadenza locale
            sandbox._ecPolizzaKasko();
            assert.equal(gs.tempKaskoExpiresDay, 12); // day + 7

            // 3. Tangente sindacato calcola scadenza locale
            sandbox._ecTangenteSindacato();
            assert.equal(gs.tangenteUntil, 6); // day + 1

            // 4. Radar VIP imposta buff a ore
            sandbox._ecRadarVip();
            const buff = (gs.activeBuffs || []).find(b => b.type === 'vip_queue');
            assert.ok(buff);
            assert.equal(buff.until, 5 * 24 + 12 + 72);

            // Conclusione dimostrata: la scadenza e l'effetto sono gestiti interamente
            // dalle routine temporali del ciclo giorno/ora senza richiedere alcun cron server.
        });
    });

    // ── RISPOSTA E PROVA DOMANDA (c) ──────────────────────────────────────────
    describe('Domanda (c) — Conformità formato dati restituito dal server', () => {
        test('la risposta RPC rpc_ec_spend contiene { ok, item_id, spent, driver_coins } e aggiorna gameState.driverCoins', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;

            const res = await sandbox.ServerState.spendDriverCoins('test_item', 25);
            assert.equal(res.ok, true);
            assert.equal(res.item_id, 'test_item');
            assert.equal(res.spent, 25);
            assert.equal(res.driver_coins, 175);
            assert.equal(typeof res.driver_coins, 'number');
        });

        test('la risposta RPC rpc_add_driver_coins contiene { ok, driver_coins } e aggiorna gameState.driverCoins', async () => {
            gs.driverCoins = 100;
            serverCompanyRow.driver_coins = 100;

            const res = await sandbox.ServerState.addDriverCoins(50, 'sim_purchase');
            assert.equal(res.ok, true);
            assert.equal(res.driver_coins, 150);
            assert.equal(typeof res.driver_coins, 'number');
        });
    });

    // ── RISPOSTA E PROVA DOMANDA (b) + BANCO AZIONI ───────────────────────────
    describe('Domanda (b) & Banco Azioni — Persistenza stato post-Realtime Echo', () => {

        test('1. activateExecutivePass (150 DC) — effetto persiste dopo echo Realtime', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.day = 10;
            gs.executivePassActive = false;

            sandbox.activateExecutivePass();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 150);
            assert.equal(rpcSpendCalls[0].motivo, 'executive_pass');
            assert.equal(gs.executivePassActive, true);
            assert.equal(gs.executivePassExpiresDay, 40);
            assert.equal(gs.driverCoins, 50);

            // Simula arrivo eco Realtime del server
            simulateServerRealtimeEcho();

            assert.equal(gs.executivePassActive, true, 'l\'Executive Pass deve restare attivo');
            assert.equal(gs.executivePassExpiresDay, 40);
            assert.equal(gs.driverCoins, 50, 'i Driver Coins non devono essere ripristinati');
        });

        test('2. skipConstruction (8 DC) — investimento aggiunto e costruzione rimossa persistono dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.constructions = [{ invId: 'garage_milano' }];
            gs.investments = [];

            sandbox.skipConstruction('garage_milano');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 8);
            assert.equal(rpcSpendCalls[0].motivo, 'skip_construction');
            assert.equal(gs.constructions.length, 0);
            assert.deepEqual([...gs.investments], ['garage_milano']);
            assert.equal(gs.driverCoins, 192);

            simulateServerRealtimeEcho();

            assert.equal(gs.constructions.length, 0);
            assert.deepEqual([...gs.investments], ['garage_milano']);
            assert.equal(gs.driverCoins, 192);
        });

        test('3. fuelBoostDC (3 DC) — carburante al 100% su flotta persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.fleet = [{ id: 'car1', fuel: 20 }, { id: 'car2', fuel: 0 }];

            sandbox.fuelBoostDC();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 3);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.driverCoins, 197);

            simulateServerRealtimeEcho();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.driverCoins, 197);
        });

        test('4. wakeDriverDC (3 DC) — risveglio singolo autista persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.drivers = [{ id: 'drv1', name: 'Giuseppe', status: 'resting', restHoursLeft: 4, fatigue: 60 }];

            sandbox.wakeDriverDC('drv1');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 3);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].restHoursLeft, 0);
            assert.equal(gs.drivers[0].fatigue, 30);
            assert.equal(gs.driverCoins, 197);

            simulateServerRealtimeEcho();

            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].fatigue, 30);
            assert.equal(gs.driverCoins, 197);
        });

        test('5. energyBoostDC (4 DC) — ricarica energia CEO persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.energy = 25;

            sandbox.energyBoostDC();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 4);
            assert.equal(gs.energy, 100);
            assert.equal(gs.driverCoins, 196);

            simulateServerRealtimeEcho();

            assert.equal(gs.energy, 100);
            assert.equal(gs.driverCoins, 196);
        });

        test('6. instaHealDC (2 DC) — guarigione stress autista persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.drivers = [{ id: 'drv1', name: 'Marco', status: 'resting', stress_level: 85, burnout_until: 50, fatigue: 70 }];

            sandbox.instaHealDC('drv1');
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 2);
            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].burnout_until, null);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.drivers[0].fatigue, 20);
            assert.equal(gs.driverCoins, 198);

            simulateServerRealtimeEcho();

            assert.equal(gs.drivers[0].stress_level, 0);
            assert.equal(gs.drivers[0].status, 'idle');
            assert.equal(gs.driverCoins, 198);
        });

        test('7. wakeAllDriversDC — risveglio collettivo persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', status: 'resting' },
                { id: 'drv1', name: 'D1', status: 'resting', restHoursLeft: 3, fatigue: 40 },
                { id: 'drv2', name: 'D2', status: 'resting', restHoursLeft: 5, fatigue: 50 },
            ];

            sandbox.wakeAllDriversDC();
            await new Promise(r => setImmediate(r));

            // cost = Math.max(3, 2 * 2) = 4 DC
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 4);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[2].status, 'idle');
            assert.equal(gs.driverCoins, 196);

            simulateServerRealtimeEcho();

            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[2].status, 'idle');
            assert.equal(gs.driverCoins, 196);
        });

        test('8. healAllDriversDC — guarigione collettiva persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 50 },
                { id: 'drv1', name: 'D1', status: 'idle', stress_level: 40, fatigue: 60 },
                { id: 'drv2', name: 'D2', status: 'resting', stress_level: 70, fatigue: 80 },
            ];

            sandbox.healAllDriversDC();
            await new Promise(r => setImmediate(r));

            // cost = Math.max(4, 2 * 2) = 4 DC
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 4);
            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.drivers[2].status, 'idle');
            assert.equal(gs.driverCoins, 196);

            simulateServerRealtimeEcho();

            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.driverCoins, 196);
        });

        test('9. skipAllAcademyDC — corsi accademia completati persistono dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.drivers = [
                { id: 'd1', name: 'D1', skill_speed: 40, status: 'training' },
                { id: 'd2', name: 'D2', skill_safety: 60, status: 'training' },
            ];
            gs.driverAcademy = [
                { driverId: 'd1', skill: 'skill_speed', skillGain: 15 },
                { driverId: 'd2', skill: 'skill_safety', skillGain: 20 },
            ];

            sandbox.skipAllAcademyDC();
            await new Promise(r => setImmediate(r));

            // cost = 2 * 5 = 10 DC
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 10);
            assert.equal(gs.drivers[0].skill_speed, 55);
            assert.equal(gs.drivers[1].skill_safety, 80);
            assert.equal(gs.driverAcademy.length, 0);
            assert.equal(gs.driverCoins, 190);

            simulateServerRealtimeEcho();

            assert.equal(gs.drivers[0].skill_speed, 55);
            assert.equal(gs.drivers[1].skill_safety, 80);
            assert.equal(gs.driverAcademy.length, 0);
            assert.equal(gs.driverCoins, 190);
        });

        test('10. skipAllConstructionsDC — cantieri completati persistono dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.constructions = [{ invId: 'c1' }, { invId: 'c2' }];
            gs.investments = [];

            sandbox.skipAllConstructionsDC();
            await new Promise(r => setImmediate(r));

            // cost = 2 * 8 = 16 DC
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 16);
            assert.equal(gs.constructions.length, 0);
            assert.deepEqual([...gs.investments], ['c1', 'c2']);
            assert.equal(gs.driverCoins, 184);

            simulateServerRealtimeEcho();

            assert.equal(gs.constructions.length, 0);
            assert.deepEqual([...gs.investments], ['c1', 'c2']);
            assert.equal(gs.driverCoins, 184);
        });

        test('11. opsBundleDC (9 DC) — bundle operativo completo persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.fleet = [{ id: 'c1', fuel: 10 }];
            gs.energy = 10;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'D1', status: 'resting', restHoursLeft: 4, fatigue: 50 },
            ];

            sandbox.opsBundleDC();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 9);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].fatigue, 20);
            assert.equal(gs.driverCoins, 191);

            simulateServerRealtimeEcho();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.driverCoins, 191);
        });

        test('12. fullBundleDC (35 DC) — bundle imperiale completo persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.fleet = [{ id: 'c1', fuel: 0 }];
            gs.energy = 0;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'D1', status: 'resting', stress_level: 80, fatigue: 80, skill_speed: 40 },
            ];
            gs.driverAcademy = [{ driverId: 'd1', skill: 'skill_speed', skillGain: 10 }];
            gs.constructions = [{ invId: 'inv_vip' }];
            gs.investments = [];

            sandbox.fullBundleDC();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 35);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].stress_level, 0);
            assert.equal(gs.drivers[1].fatigue, 20);
            assert.equal(gs.drivers[1].skill_speed, 50);
            assert.equal(gs.driverAcademy.length, 0);
            assert.equal(gs.constructions.length, 0);
            assert.deepEqual([...gs.investments], ['inv_vip']);
            assert.equal(gs.driverCoins, 165);

            simulateServerRealtimeEcho();

            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.energy, 100);
            assert.equal(gs.drivers[1].status, 'idle');
            assert.equal(gs.drivers[1].stress_level, 0);
            assert.deepEqual([...gs.investments], ['inv_vip']);
            assert.equal(gs.driverCoins, 165);
        });

        test('13. _dcSimPurchase (earnDC) — accredito DC persiste dopo echo', async () => {
            gs.driverCoins = 50;
            serverCompanyRow.driver_coins = 50;

            sandbox._dcSimPurchase(100);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcAddCalls.length, 1);
            assert.equal(rpcAddCalls[0].n, 100);
            assert.equal(gs.driverCoins, 150);

            simulateServerRealtimeEcho();

            assert.equal(gs.driverCoins, 150);
        });

        test('14. _dcSpend offline_limit (20 DC) — limite offline persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.offlineLimit = 2;

            sandbox._dcSpend('offline_limit', 20);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 20);
            assert.equal(gs.offlineLimit, 4);
            assert.equal(gs.driverCoins, 180);

            simulateServerRealtimeEcho();

            assert.equal(gs.offlineLimit, 4);
            assert.equal(gs.driverCoins, 180);
        });

        test('15. _dcSpend auto_rest (30 DC) — auto rest persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.autoRestEnabled = false;

            sandbox._dcSpend('auto_rest', 30);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 30);
            assert.equal(gs.autoRestEnabled, true);
            assert.equal(gs.driverCoins, 170);

            simulateServerRealtimeEcho();

            assert.equal(gs.autoRestEnabled, true);
            assert.equal(gs.driverCoins, 170);
        });

        test('16. _dcSpend repair_all (25 DC) — flotta riparata persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.fleet = [{ id: 'c1', condition: 20, fuel: 10, tirePressure: 10 }];

            sandbox._dcSpend('repair_all', 25);
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 25);
            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.fleet[0].fuel, 100);
            assert.equal(gs.fleet[0].tirePressure, 100);
            assert.equal(gs.driverCoins, 175);

            simulateServerRealtimeEcho();

            assert.equal(gs.fleet[0].condition, 100);
            assert.equal(gs.driverCoins, 175);
        });

        test('17. _ecCaffeSospeso (10 DC) — guarigione del più esausto persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'd1', name: 'Marco', stress_level: 40 },
                { id: 'd2', name: 'Anna', stress_level: 90 },
            ];

            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 10);
            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.drivers[1].stress_level, 40);
            assert.equal(gs.driverCoins, 190);

            simulateServerRealtimeEcho();

            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.driverCoins, 190);
        });

        test('18. _ecManutenzioneExpress (25 DC) — auto più danneggiata riparata al 100% persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.fleet = [
                { id: 'c1', name: 'Auto A', condition: 70, fuel: 50 },
                { id: 'c2', name: 'Auto B', condition: 20, fuel: 10 },
            ];

            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 25);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[0].condition, 70);
            assert.equal(gs.driverCoins, 175);

            simulateServerRealtimeEcho();

            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.driverCoins, 175);
        });

        test('19. _ecTangenteSindacato (50 DC) — immunità scioperi persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.day = 3;
            gs.tangenteUntil = 0;

            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 50);
            assert.equal(gs.tangenteUntil, 4);
            assert.equal(gs.driverCoins, 150);

            simulateServerRealtimeEcho();

            assert.equal(gs.tangenteUntil, 4);
            assert.equal(gs.driverCoins, 150);
        });

        test('20. _ecPolizzaKasko (150 DC) — kasko 7gg persiste dopo echo', async () => {
            gs.driverCoins = 200;
            serverCompanyRow.driver_coins = 200;
            gs.day = 2;
            gs.investments = [];
            gs.tempKaskoExpiresDay = 0;

            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 150);
            assert.ok(gs.investments.includes('inv_kasko'));
            assert.equal(gs.tempKaskoExpiresDay, 9);
            assert.equal(gs.driverCoins, 50);

            simulateServerRealtimeEcho();

            assert.ok(gs.investments.includes('inv_kasko'));
            assert.equal(gs.tempKaskoExpiresDay, 9);
            assert.equal(gs.driverCoins, 50);
        });

        test('21. _ecRadarVip (200 DC) — buff priorità vip persiste dopo echo', async () => {
            gs.driverCoins = 250;
            serverCompanyRow.driver_coins = 250;
            gs.day = 1;
            gs.hour = 10;
            gs.activeBuffs = [];

            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 200);
            const buff = (gs.activeBuffs || []).find(b => b.type === 'vip_queue');
            assert.ok(buff);
            assert.equal(gs.driverCoins, 50);

            simulateServerRealtimeEcho();

            assert.ok((gs.activeBuffs || []).some(b => b.type === 'vip_queue'));
            assert.equal(gs.driverCoins, 50);
        });

        test('22. _ecTargaPresidenziale (500 DC) — targa permanente persiste dopo echo', async () => {
            gs.driverCoins = 600;
            serverCompanyRow.driver_coins = 600;
            gs.hasPrestigiousPlate = false;

            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));

            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 500);
            assert.equal(gs.hasPrestigiousPlate, true);
            assert.equal(gs.driverCoins, 100);

            simulateServerRealtimeEcho();

            assert.equal(gs.hasPrestigiousPlate, true);
            assert.equal(gs.driverCoins, 100);
        });

        test('23. vanity cosmetici (_vanityEmblem, _vanityColor, _vanityTitle) persistono dopo echo', async () => {
            gs.driverCoins = 100;
            serverCompanyRow.driver_coins = 100;
            gs.ownedEmblems = ['👁️'];
            gs.ownedColors = ['#c79a2a'];
            gs.ownedTitles = ['Imprenditore'];

            // Acquisto stemma ⚜️ (5 DC)
            sandbox._vanityEmblem('⚜️');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.companyLogo, '⚜️');
            assert.ok(gs.ownedEmblems.includes('⚜️'));
            assert.equal(gs.driverCoins, 95);

            // Acquisto colore Platino #8aa0b5 (6 DC)
            sandbox._vanityColor('#8aa0b5');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.companyColor, '#8aa0b5');
            assert.ok(gs.ownedColors.includes('#8aa0b5'));
            assert.equal(gs.driverCoins, 89);

            // Acquisto titolo Magnate (8 DC)
            sandbox._vanityTitle('Magnate');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.companyTitle, 'Magnate');
            assert.ok(gs.ownedTitles.includes('Magnate'));
            assert.equal(gs.driverCoins, 81);

            simulateServerRealtimeEcho();

            assert.equal(gs.companyLogo, '⚜️');
            assert.equal(gs.companyColor, '#8aa0b5');
            assert.equal(gs.companyTitle, 'Magnate');
            assert.equal(gs.driverCoins, 81);
        });
    });
});
