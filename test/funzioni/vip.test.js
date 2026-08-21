'use strict';
/* ============================================================================
   test/funzioni/vip.test.js — Clienti VIP e Buff di Sistema (vip-clients.js, vip-buffs.js)

   Verifica del funzionamento della feature "vip" (attualmente disattivata in config.js).
   Collauda:
   - Sistema Buff (_applyBuff, _getBuffValue, _pruneExpiredBuffs, _vipBuffTick)
   - Generazione email di richiesta dei 10 Clienti VIP (_maybeVip*)
   - Accettazione delle richieste con verifica requisiti flotta/autista/kasko (acceptVip*)
   - Completamento corse VIP e trigger dei bonus/eventi (_vipOnComplete)
   - Risoluzione di tutti i sotto-eventi email generati dai VIP (gestisci, ignora, paga, coopera, incassa...)
   - Effetto dei buff sulle corse ordinarie e blocco prezzo carburante
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione vip — clienti VIP, buff ed eventi speciali', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv();
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        // Sblocco regioni di base per garantire POI disponibili per le rotte VIP
        gs.unlockedRegions = ['lazio', 'lombardia', 'campania'];
        // Risorse iniziali per test di spesa e variazioni reputazione
        gs.cash = 50000;
        gs.reputation = 3.0;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('1. Sistema Buff (_applyBuff, _getBuffValue, _pruneExpiredBuffs, _vipBuffTick)', () => {
        test('_applyBuff registra un nuovo buff con scadenza corretta in ore di gioco', () => {
            gs.day = 2;
            gs.hour = 10;
            sandbox._applyBuff('test_buff', 'earnings_pct', 15, 8);

            assert.equal(gs.activeBuffs.length, 1);
            const b = gs.activeBuffs[0];
            assert.equal(b.id, 'test_buff');
            assert.equal(b.type, 'earnings_pct');
            assert.equal(b.value, 15);
            assert.equal(b.until, 2 * 24 + 10 + 8); // 48 + 10 + 8 = 66
        });

        test('_applyBuff sovrascrive un buff esistente con lo stesso id', () => {
            gs.day = 1;
            gs.hour = 0;
            sandbox._applyBuff('buff_a', 'tip_pct', 10, 5);
            sandbox._applyBuff('buff_a', 'tip_pct', 25, 10);

            assert.equal(gs.activeBuffs.length, 1);
            assert.equal(gs.activeBuffs[0].value, 25);
            assert.equal(gs.activeBuffs[0].until, 1 * 24 + 0 + 10);
        });

        test('_getBuffValue calcola la somma dei valori per un tipo di buff ancora attivo', () => {
            gs.day = 1;
            gs.hour = 4; // now = 28
            gs.activeBuffs = [
                { id: 'b1', type: 'earnings_pct', value: 10, until: 30 }, // attivo (30 > 28)
                { id: 'b2', type: 'earnings_pct', value: 15, until: 35 }, // attivo (35 > 28)
                { id: 'b3', type: 'earnings_pct', value: 20, until: 25 }, // scaduto (25 <= 28)
                { id: 'b4', type: 'tip_pct', value: 50, until: 40 }       // altro tipo
            ];

            const total = sandbox._getBuffValue('earnings_pct');
            assert.equal(total, 25);
        });

        test('_pruneExpiredBuffs e _vipBuffTick rimuovono i buff la cui scadenza è passata', () => {
            gs.day = 1;
            gs.hour = 12; // now = 36
            gs.activeBuffs = [
                { id: 'attivo', type: 'speed_boost', value: 5, until: 40 },
                { id: 'scaduto', type: 'fine_discount', value: 50, until: 36 }
            ];

            sandbox._vipBuffTick();

            assert.equal(gs.activeBuffs.length, 1);
            assert.equal(gs.activeBuffs[0].id, 'attivo');
        });
    });

    describe('2. Grigori V. — Oligarca Paranoico', () => {
        test('_maybeVipGrigori genera email solo se flotta ha auto presidenziale (Majestic >=95%)', () => {
            // Senza auto valida
            sandbox._maybeVipGrigori();
            assert.equal(gs.emails.length, 0);

            // Aggiungiamo Majestic Spirit al 98%
            gs.fleet.push({
                id: 'c_maj', vehicleClass: 'majestic_spirit', condition: 98,
                outOfService: null, isSeized: false
            });

            // Mock Math.random per superare il check 0.15
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;

            sandbox._maybeVipGrigori();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_grigori');
            assert.equal(gs.emails[0].vipData.price, 8000);
        });

        test('acceptVipGrigori rifiuta se manca autista Lv2+ assegnato all auto presidenziale', () => {
            gs.fleet.push({
                id: 'c_maj', vehicleClass: 'majestic_spirit', condition: 98,
                outOfService: null, isSeized: false
            });
            const emailId = 100;
            gs.emails.push({
                id: emailId, type: 'vip_grigori', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 8000 }
            });

            sandbox.acceptVipGrigori(emailId);
            assert.equal(gs.pendingRides.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Nessun autista qualificato')));
        });

        test('acceptVipGrigori crea la corsa VIP ultra se requisiti sono soddisfatti', () => {
            const car = {
                id: 'c_maj', vehicleClass: 'majestic_spirit', condition: 98,
                outOfService: null, isSeized: false
            };
            const driver = {
                id: 'd_grig', name: 'Boris', assignedCarId: 'c_maj',
                level: 2, restHoursLeft: 0, isOnStrike: false
            };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            const emailId = 101;
            gs.emails.push({
                id: emailId, type: 'vip_grigori', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 8000 }
            });

            sandbox.acceptVipGrigori(emailId);

            assert.equal(gs.pendingRides.length, 1);
            const r = gs.pendingRides[0];
            assert.equal(r.isVipRide, true);
            assert.equal(r.vipClientId, 'grigori');
            assert.equal(r.tier, 'ultra');
            assert.equal(r.price, 8000);
            assert.equal(r.driverId, 'd_grig');

            const email = gs.emails.find(e => e.id === emailId);
            assert.equal(email.status, 'resolved');
        });

        test('_vipCompleteGrigori eroga mancia €15.000, reputazione e può generare evento incidente', () => {
            const startCash = gs.cash;
            const startRep = gs.reputation;

            const origRandom = sandbox.Math.random;
            // random 0.10 (< 0.25) per innescare evento incidente
            sandbox.Math.random = () => 0.10;

            sandbox._vipOnComplete('grigori', {}, {}, 8000);
            sandbox.Math.random = origRandom;

            assert.equal(gs.cash, startCash + 15000);
            assert.ok(gs.reputation > startRep);
            assert.ok(gs.emails.some(e => e.type === 'vip_grigori_event'));
        });

        test('vipGrigoriEventAccept e vipGrigoriEventDecline gestiscono l evento secondario di Grigori', () => {
            const emailId = 102;
            gs.emails.push({
                id: emailId, type: 'vip_grigori_event', status: 'unread',
                vipEventData: { cost: 500 }
            });
            gs.vipCooldowns = { grigori: 100 };
            const startCash = gs.cash;

            sandbox.vipGrigoriEventAccept(emailId);

            assert.equal(gs.cash, startCash - 500);
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'resolved');

            // Test Decline
            const emailId2 = 103;
            gs.emails.push({
                id: emailId2, type: 'vip_grigori_event', status: 'unread',
                vipEventData: { cost: 500 }
            });
            const repBefore = gs.reputation;
            sandbox.vipGrigoriEventDecline(emailId2);
            assert.ok(gs.reputation < repBefore);
            assert.equal(gs.emails.find(e => e.id === emailId2).status, 'resolved');
        });
    });

    describe('3. Strata Consulting — B2B Partner', () => {
        test('_maybeVipStrata e acceptVipStrata creano corsa B2B se c e una berlina business >=70%', () => {
            gs.fleet.push({
                id: 'c_strata', vehicleClass: 'stellar_e_exec', condition: 75,
                outOfService: null, isSeized: false
            });

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipStrata();
            sandbox.Math.random = origRandom;

            assert.ok(gs.emails.some(e => e.type === 'vip_strata'));
            const email = gs.emails.find(e => e.type === 'vip_strata');

            sandbox.acceptVipStrata(email.id);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'strata');
            assert.equal(gs.pendingRides[0].tier, 'business');
        });

        test('_vipCompleteStrata: streak di 5 corse attiva buff strata_5streak (+10% guadagni)', () => {
            gs.strataStreak = 4;
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.50; // no chargeback (>= 0.20)

            sandbox._vipOnComplete('strata', {}, {}, 3500);
            sandbox.Math.random = origRandom;

            assert.equal(gs.strataStreak, 0); // reset dopo streak
            assert.ok(gs.activeBuffs.some(b => b.id === 'strata_5streak' && b.value === 10));
        });

        test('_vipCompleteStrata: chargeback (20% probabilità) detrae metà del guadagno e azzera la streak', () => {
            gs.strataStreak = 3;
            const startCash = gs.cash;
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10; // chargeback (< 0.20)

            sandbox._vipOnComplete('strata', {}, {}, 4000);
            sandbox.Math.random = origRandom;

            assert.equal(gs.cash, startCash - 2000);
            assert.equal(gs.strataStreak, 0);
        });
    });

    describe('4. Platinum Talent — La Diva', () => {
        test('_maybeVipPlatinum genera email se flotta ha almeno 2 Stellar V-Carrier (>=70%)', () => {
            gs.fleet.push({ id: 'v1', vehicleClass: 'stellar_v_carr', condition: 80, outOfService: null });
            sandbox._maybeVipPlatinum();
            assert.equal(gs.emails.length, 0);

            gs.fleet.push({ id: 'v2', vehicleClass: 'stellar_v_carr', condition: 85, outOfService: null });
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipPlatinum();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_platinum');
            assert.equal(gs.emails[0].vipData.price, 6500);
        });

        test('acceptVipPlatinum richiede almeno 2 Stellar V-Carrier con condizione >=70%', () => {
            const emailId = 200;
            gs.emails.push({
                id: emailId, type: 'vip_platinum', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 6500 }
            });

            // Con 1 solo V-Carrier
            gs.fleet.push({ id: 'v1', vehicleClass: 'stellar_v_carr', condition: 80, outOfService: null });
            sandbox.acceptVipPlatinum(emailId);
            assert.equal(gs.pendingRides.length, 0);

            // Aggiungiamo il 2° V-Carrier
            gs.fleet.push({ id: 'v2', vehicleClass: 'stellar_v_carr', condition: 80, outOfService: null });
            sandbox.acceptVipPlatinum(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'platinum');
        });

        test('_vipCompletePlatinum applica buff mance o genera evento paparazzi', () => {
            const origRandom = sandbox.Math.random;
            // Caso no-paparazzi
            sandbox.Math.random = () => 0.80;
            sandbox._vipOnComplete('platinum', {}, {}, 6500);
            assert.ok(gs.activeBuffs.some(b => b.id === 'platinum_hype' && b.value === 20));

            // Caso paparazzi
            sandbox.Math.random = () => 0.10;
            sandbox._vipOnComplete('platinum', {}, {}, 6500);
            sandbox.Math.random = origRandom;
            assert.ok(gs.emails.some(e => e.type === 'vip_platinum_event'));
        });

        test('eventi paparazzi: vipPlatinumEventBlock e vipPlatinumEventAllow', () => {
            const emailId1 = 201;
            gs.emails.push({ id: emailId1, type: 'vip_platinum_event', status: 'unread' });
            const cashBefore = gs.cash;
            sandbox.vipPlatinumEventBlock(emailId1);
            assert.equal(gs.cash, cashBefore - 300);
            assert.ok(gs.activeBuffs.some(b => b.id === 'platinum_hype'));

            const emailId2 = 202;
            gs.emails.push({ id: emailId2, type: 'vip_platinum_event', status: 'unread' });
            const repBefore = gs.reputation;
            sandbox.vipPlatinumEventAllow(emailId2);
            assert.ok(gs.reputation > repBefore);
        });
    });

    describe('5. L Onorevole — Politico', () => {
        test('_maybeVipOnorevole genera email solo se auto non-EV (>=80%) e autista Lv2+ assegnato', () => {
            const car = { id: 'c_onor', vehicleClass: 'stellar_s_imp', condition: 85, outOfService: null };
            const driver = { id: 'd_onor', assignedCarId: 'c_onor', level: 2, restHoursLeft: 0, isOnStrike: false };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipOnorevole();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_onorevole');
            assert.equal(gs.emails[0].vipData.price, 5000);
        });

        test('acceptVipOnorevole richiede auto non elettrica (>=80%) e autista Lv2+', () => {
            const car = { id: 'c_onor', vehicleClass: 'stellar_s_imp', condition: 85, outOfService: null };
            const driver = { id: 'd_onor', assignedCarId: 'c_onor', level: 2, restHoursLeft: 0, isOnStrike: false };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            const emailId = 300;
            gs.emails.push({
                id: emailId, type: 'vip_onorevole', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 5000 }
            });

            sandbox.acceptVipOnorevole(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'onorevole');
        });

        test('_vipCompleteOnorevole assegna Gettone Politico e può generare evento GdF', () => {
            gs.politicalTokens = 0;
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05; // attiva evento GdF (< 0.10)

            sandbox._vipOnComplete('onorevole', {}, {}, 5000);
            sandbox.Math.random = origRandom;

            assert.equal(gs.politicalTokens, 1);
            assert.ok(gs.emails.some(e => e.type === 'vip_onorevole_event'));
        });

        test('eventi GdF: vipOnorevoleEventCopera (usa token o multa) e vipOnorevoleEventResisti', () => {
            // Con token
            gs.politicalTokens = 1;
            const emailId1 = 301;
            gs.emails.push({ id: emailId1, type: 'vip_onorevole_event', status: 'unread' });
            sandbox.vipOnorevoleEventCopera(emailId1);
            assert.equal(gs.politicalTokens, 0);

            // Senza token: multa 1000€
            gs.politicalTokens = 0;
            const emailId2 = 302;
            gs.emails.push({ id: emailId2, type: 'vip_onorevole_event', status: 'unread' });
            const cashBefore = gs.cash;
            sandbox.vipOnorevoleEventCopera(emailId2);
            assert.equal(gs.cash, cashBefore - 1000);

            // Resisti: guadagna token, perde reputazione
            const emailId3 = 303;
            gs.emails.push({ id: emailId3, type: 'vip_onorevole_event', status: 'unread' });
            const repBefore = gs.reputation;
            sandbox.vipOnorevoleEventResisti(emailId3);
            assert.equal(gs.politicalTokens, 1);
            assert.ok(gs.reputation < repBefore);
        });
    });

    describe('6. Royal Entourage — Emiro', () => {
        test('_maybeVipEmiro genera email solo se flotta ha almeno 4 auto di lusso (>=80%)', () => {
            gs.fleet = [
                { id: 'e1', vehicleClass: 'majestic_spirit', condition: 90, outOfService: null },
                { id: 'e2', vehicleClass: 'stellar_s_imp', condition: 85, outOfService: null },
                { id: 'e3', vehicleClass: 'volt_s_hyper', condition: 95, outOfService: null },
                { id: 'e4', vehicleClass: 'stellar_g_over', condition: 85, outOfService: null }
            ];

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipEmiro();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_emiro');
            assert.equal(gs.emails[0].vipData.price, 18000);
        });

        test('acceptVipEmiro richiede convoglio di 4 auto di lusso (>=80%)', () => {
            const emailId = 400;
            gs.emails.push({
                id: emailId, type: 'vip_emiro', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 18000 }
            });

            // Flotta con solo 3 auto
            gs.fleet = [
                { id: 'e1', vehicleClass: 'majestic_spirit', condition: 90, outOfService: null },
                { id: 'e2', vehicleClass: 'stellar_s_imp', condition: 85, outOfService: null },
                { id: 'e3', vehicleClass: 'volt_s_hyper', condition: 95, outOfService: null }
            ];
            sandbox.acceptVipEmiro(emailId);
            assert.equal(gs.pendingRides.length, 0);

            // Aggiungiamo la 4° auto
            gs.fleet.push({ id: 'e4', vehicleClass: 'stellar_g_over', condition: 85, outOfService: null });
            sandbox.acceptVipEmiro(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'emiro');
            assert.equal(gs.pendingRides[0].price, 18000);
        });

        test('_vipCompleteEmiro blocca prezzo carburante per 48h e può dare bonus shopping', () => {
            gs.day = 1;
            gs.hour = 10;
            gs.fuelPrice = 1.60;
            const startCash = gs.cash;

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10; // bonus shopping (< 0.30)
            sandbox._vipOnComplete('emiro', {}, {}, 18000);
            sandbox.Math.random = origRandom;

            assert.equal(gs.fuelPriceLock, 1.60);
            assert.equal(gs.fuelPriceLockUntil, 1 * 24 + 10 + 48);
            assert.equal(gs.cash, startCash + 5000);
        });
    });

    describe('7. Golden Boy — Calciatore', () => {
        test('_maybeVipGolden genera email se flotta ha auto sportiva di lusso (>=80%)', () => {
            gs.fleet.push({ id: 'c_gold', vehicleClass: 'volt_s_hyper', condition: 90, outOfService: null });

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipGolden();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_golden');
            assert.equal(gs.emails[0].vipData.price, 12000);
        });

        test('acceptVipGolden e _vipCompleteGolden gestiscono usura auto e reset stress autisti', () => {
            const car = { id: 'c_gold', vehicleClass: 'volt_s_hyper', condition: 90, outOfService: null };
            const driver1 = { id: 'd1', assignedCarId: 'c_gold', stress_level: 60 };
            const driver2 = { id: 'd2', assignedCarId: null, stress_level: 40 };
            gs.fleet.push(car);
            gs.drivers.push(driver1, driver2);

            const emailId = 500;
            gs.emails.push({
                id: emailId, type: 'vip_golden', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 12000 }
            });

            sandbox.acceptVipGolden(emailId);
            assert.equal(gs.pendingRides.length, 1);
            const ride = gs.pendingRides[0];

            let origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10; // danno auto (< 0.60)
            sandbox._vipOnComplete('golden', ride, driver1, 12000);
            sandbox.Math.random = origRandom;

            // Danno applicato all auto (perdita 15-34 cond)
            assert.ok(car.condition < 90);
            // Tutti gli autisti beneficiano dell afterparty (-20 stress)
            assert.equal(driver1.stress_level, 40);
            assert.equal(driver2.stress_level, 20);

            // Con Kasko attiva: nessun danno subito
            gs.investments.push('inv_kasko');
            car.condition = 95;
            origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10;
            sandbox._vipOnComplete('golden', ride, driver1, 12000);
            sandbox.Math.random = origRandom;
            assert.equal(car.condition, 95);
        });
    });

    describe('8. Tech Bro — Innovatore Green', () => {
        test('_maybeVipTechBro genera email se flotta ha EV (>=90%) e autista assegnato con stress <= 20', () => {
            const evCar = { id: 'c_ev', vehicleClass: 'volt_3_urban', condition: 95, outOfService: null };
            const driver = { id: 'd_ev', assignedCarId: 'c_ev', stress_level: 15, restHoursLeft: 0, isOnStrike: false };
            gs.fleet.push(evCar);
            gs.drivers.push(driver);

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipTechBro();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_techbro');
            assert.equal(gs.emails[0].vipData.price, 5000);
        });

        test('acceptVipTechBro richiede veicolo EV (>=90%) e autista con stress <= 20', () => {
            const evCar = { id: 'c_ev', vehicleClass: 'volt_3_urban', condition: 95, outOfService: null };
            const driver = { id: 'd_ev', assignedCarId: 'c_ev', stress_level: 15, restHoursLeft: 0, isOnStrike: false };
            gs.fleet.push(evCar);
            gs.drivers.push(driver);

            const emailId = 600;
            gs.emails.push({
                id: emailId, type: 'vip_techbro', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 5000 }
            });

            sandbox.acceptVipTechBro(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'techbro');
        });

        test('_vipCompleteTechBro applica buff speed_boost (+5% per 24h)', () => {
            sandbox._vipOnComplete('techbro', {}, {}, 5000);
            assert.ok(gs.activeBuffs.some(b => b.id === 'techbro_routing' && b.type === 'speed_boost' && b.value === 5));
        });
    });

    describe('9. Il Garante — Figura Losca', () => {
        test('_maybeVipGarante genera email solo se auto blindata non-EV (>=85%)', () => {
            gs.fleet.push({ id: 'c_gar', vehicleClass: 'stellar_g_over', condition: 90, outOfService: null });

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipGarante();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_garante');
            assert.equal(gs.emails[0].vipData.price, 9000);
        });

        test('acceptVipGarante richiede auto pesante non-EV (>=85%)', () => {
            const car = { id: 'c_gar', vehicleClass: 'stellar_g_over', condition: 90, outOfService: null };
            gs.fleet.push(car);

            const emailId = 700;
            gs.emails.push({
                id: emailId, type: 'vip_garante', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 9000 }
            });

            sandbox.acceptVipGarante(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'garante');
        });

        test('_vipCompleteGarante aumenta stress autista e applica buff sconto multe 50%', () => {
            const driver = { id: 'd_gar', stress_level: 10 };
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.10; // genera evento posto di blocco (< 0.25)

            sandbox._vipOnComplete('garante', {}, driver, 9000);
            sandbox.Math.random = origRandom;

            assert.equal(driver.stress_level, 60); // +50
            assert.ok(gs.activeBuffs.some(b => b.id === 'garante_intimidation' && b.type === 'fine_discount' && b.value === 50));
            assert.ok(gs.emails.some(e => e.type === 'vip_garante_event'));
        });

        test('eventi posto di blocco: vipGaranteEventPaga (con sconto) e vipGaranteEventIntimidisci', () => {
            // Pagamento con buff fine_discount 50% attivo
            sandbox._applyBuff('garante_intimidation', 'fine_discount', 50, 24);
            const emailId1 = 701;
            gs.emails.push({ id: emailId1, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 2000 } });

            const cashBefore = gs.cash;
            sandbox.vipGaranteEventPaga(emailId1);
            // 2000 * (1 - 0.5) = 1000
            assert.equal(gs.cash, cashBefore - 1000);

            // Intimidisci con gettone politico
            gs.politicalTokens = 1;
            const emailId2 = 702;
            gs.emails.push({ id: emailId2, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 2000 } });
            sandbox.vipGaranteEventIntimidisci(emailId2);
            assert.equal(gs.politicalTokens, 0);

            // Intimidisci senza token: fallimento (multa x2 = 4000)
            gs.politicalTokens = 0;
            let origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.80; // fallimento (>= 0.50)
            const emailId3 = 703;
            gs.emails.push({ id: emailId3, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 2000 } });
            const cashBefore3 = gs.cash;
            sandbox.vipGaranteEventIntimidisci(emailId3);
            sandbox.Math.random = origRandom;
            assert.equal(gs.cash, cashBefore3 - 4000);

            // Intimidisci senza token: successo (random < 0.50)
            origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.20; // successo (< 0.50)
            const emailId4 = 704;
            gs.emails.push({ id: emailId4, type: 'vip_garante_event', status: 'unread', vipEventData: { fine: 2000 } });
            const cashBefore4 = gs.cash;
            sandbox.vipGaranteEventIntimidisci(emailId4);
            sandbox.Math.random = origRandom;
            assert.equal(gs.cash, cashBefore4); // non paga nulla
        });
    });

    describe('10. White Lace Weddings — Matrimoni', () => {
        test('_maybeVipWedding genera email solo con flotta di lusso al 100% di condizione', () => {
            gs.fleet = [
                { id: 'w_maj', vehicleClass: 'majestic_spirit', condition: 100, outOfService: null },
                { id: 'w_v1', vehicleClass: 'stellar_v_carr', condition: 100, outOfService: null },
                { id: 'w_v2', vehicleClass: 'stellar_v_carr', condition: 100, outOfService: null }
            ];

            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipWedding();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_wedding');
            assert.equal(gs.emails[0].vipData.price, 10000);
        });

        test('acceptVipWedding richiede 1 Majestic Spirit 100% e 2 Stellar V-Carrier 100%', () => {
            const emailId = 800;
            gs.emails.push({
                id: emailId, type: 'vip_wedding', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 10000 }
            });

            // Flotta con Majestic ma solo 1 V-Carrier
            gs.fleet = [
                { id: 'w_maj', vehicleClass: 'majestic_spirit', condition: 100, outOfService: null },
                { id: 'w_v1', vehicleClass: 'stellar_v_carr', condition: 100, outOfService: null }
            ];
            sandbox.acceptVipWedding(emailId);
            assert.equal(gs.pendingRides.length, 0);

            // Aggiungiamo 2° V-Carrier
            gs.fleet.push({ id: 'w_v2', vehicleClass: 'stellar_v_carr', condition: 100, outOfService: null });
            sandbox.acceptVipWedding(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'wedding');
        });

        test('_vipCompleteWedding attiva buff vip_queue e genera email saldo o drama', () => {
            const origRandom = sandbox.Math.random;
            // Caso pagamento saldo (>= 0.30)
            sandbox.Math.random = () => 0.50;
            sandbox._vipOnComplete('wedding', {}, {}, 10000);
            assert.ok(gs.activeBuffs.some(b => b.id === 'wedding_vip_queue' && b.type === 'vip_queue'));
            assert.ok(gs.emails.some(e => e.type === 'vip_wedding_payment'));

            // Caso drama (< 0.30)
            sandbox.Math.random = () => 0.10;
            sandbox._vipOnComplete('wedding', {}, {}, 10000);
            sandbox.Math.random = origRandom;
            assert.ok(gs.emails.some(e => e.type === 'vip_wedding_event'));
        });

        test('eventi Wedding: vipWeddingEventGestisci, vipWeddingEventIgnora, vipWeddingPaymentCollect', () => {
            // Incasso saldo differito
            const emailPayId = 801;
            gs.emails.push({ id: emailPayId, type: 'vip_wedding_payment', status: 'unread', vipEventData: { bonus: 3000 } });
            const cashBeforePay = gs.cash;
            sandbox.vipWeddingPaymentCollect(emailPayId);
            assert.equal(gs.cash, cashBeforePay + 3000);

            // Gestisci drama: spende 800 e guadagna 2000 (netto +1200)
            const emailDramaId1 = 802;
            gs.emails.push({ id: emailDramaId1, type: 'vip_wedding_event', status: 'unread' });
            const cashBeforeDrama = gs.cash;
            sandbox.vipWeddingEventGestisci(emailDramaId1);
            assert.equal(gs.cash, cashBeforeDrama + 1200);

            // Ignora drama: penalità reputazione
            const emailDramaId2 = 803;
            gs.emails.push({ id: emailDramaId2, type: 'vip_wedding_event', status: 'unread' });
            const repBefore = gs.reputation;
            sandbox.vipWeddingEventIgnora(emailDramaId2);
            assert.ok(gs.reputation < repBefore);
        });
    });

    describe('11. L Erede Viziato', () => {
        test('_maybeVipErede genera email solo se polizza Kasko attiva e auto lusso (>=80%)', () => {
            gs.fleet.push({ id: 'c_erd', vehicleClass: 'volt_s_hyper', condition: 85, outOfService: null });
            sandbox._maybeVipErede();
            assert.equal(gs.emails.length, 0);

            gs.investments.push('inv_kasko');
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.05;
            sandbox._maybeVipErede();
            sandbox.Math.random = origRandom;

            assert.equal(gs.emails.length, 1);
            assert.equal(gs.emails[0].type, 'vip_erede');
            assert.equal(gs.emails[0].vipData.price, 9500);
        });

        test('acceptVipErede richiede kasko obbligatoria e auto di lusso (>=80%)', () => {
            const car = { id: 'c_erd', vehicleClass: 'volt_s_hyper', condition: 85, outOfService: null };
            gs.fleet.push(car);
            const emailId = 900;
            gs.emails.push({
                id: emailId, type: 'vip_erede', status: 'unread',
                vipData: { fromId: 'roma', toId: 'milano', price: 9500 }
            });

            // Senza Kasko
            sandbox.acceptVipErede(emailId);
            assert.equal(gs.pendingRides.length, 0);

            // Con Kasko
            gs.investments.push('inv_kasko');
            sandbox.acceptVipErede(emailId);
            assert.equal(gs.pendingRides.length, 1);
            assert.equal(gs.pendingRides[0].vipClientId, 'erede');
        });

        test('_vipCompleteErede: kasko ripara auto in caso di incidente e bonus viral', () => {
            const car = { id: 'c_erd', vehicleClass: 'volt_s_hyper', condition: 60 };
            gs.fleet.push(car);
            const driver = { id: 'd_erd', assignedCarId: 'c_erd' };
            gs.drivers.push(driver);
            const startCash = gs.cash;

            const origRandom = sandbox.Math.random;
            // random 0.10 (< 0.30 per incidente e < 0.30 per virale)
            sandbox.Math.random = () => 0.10;
            sandbox._vipOnComplete('erede', { carId: 'c_erd' }, driver, 9500);
            sandbox.Math.random = origRandom;

            assert.equal(car.condition, 100); // Kasko ripristina a 100
            assert.equal(gs.cash, startCash + 9500); // bonus virale 100% di earned
        });
    });

    describe('12. Integrazione ciclo corse ed economia (engine-rides.js)', () => {
        test('i buff earnings_pct e tip_pct aumentano l incasso reale calcolato in completeRide', () => {
            const car = { id: 'c_norm', vehicleClass: 'stellar_e_exec', condition: 100, fuel: 100 };
            const driver = { id: 'd_norm', name: 'Mario', queue: [], assignedCarId: 'c_norm', level: 0, skill_charisma: 50, fatigue: 0 };
            gs.fleet.push(car);
            gs.drivers.push(driver);

            // Corsa standard base da 1000€
            const ride = {
                id: 1, fromPoi: { id: 'roma', region: 'lazio' },
                toPoi: { id: 'roma_fco', region: 'lazio' },
                tier: 'business', price: 1000, driverId: 'd_norm'
            };

            // Nessun buff
            const cash0 = gs.cash;
            sandbox.completeRide(ride);
            const earnedNormal = gs.cash - cash0;

            // Applichiamo buff +50% earnings
            sandbox._applyBuff('b_test', 'earnings_pct', 50, 5);
            const cash1 = gs.cash;
            sandbox.completeRide(ride);
            const earnedWithBuff = gs.cash - cash1;

            assert.ok(earnedWithBuff > earnedNormal, `Buff earnings non applicato: ${earnedWithBuff} vs ${earnedNormal}`);
        });

        test('checkActiveTrips applica il blocco prezzo carburante attivo dell Emiro', () => {
            gs.day = 1;
            gs.hour = 5;
            gs.fuelPriceLock = 1.45;
            gs.fuelPriceLockUntil = 1 * 24 + 5 + 24; // valido ancora per 24h
            gs.fuelPrice = 2.10;

            sandbox.checkActiveTrips();

            assert.equal(gs.fuelPrice, 1.45);

            // Quando scade
            gs.hour = 35; // now = 59 > until (53)
            sandbox.checkActiveTrips();
            assert.equal(gs.fuelPriceLock, null);
        });
    });


});
