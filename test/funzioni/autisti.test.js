'use strict';
/* ============================================================================
   test/funzioni/autisti.test.js — Verifica approfondita del modulo Autisti e Staff

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `engine-drivers.js`, `ui-staff.js`, `driver_skills.js` e dai relativi
   gestori in `ce-actions.js`, verificare assunzioni, licenziamenti, stipendi e
   costi ricorrenti, bonus, gestione dello stress e pause, scioperi e accordi,
   Accademia Autisti, progressione XP e livelli, alberi abilità RPG, permadeath,
   staff d'ufficio, rendering UI ed integrità economica via CE_money / ServerState.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente con mock ServerState e tracciamento eventi per il modulo Autisti.
 */
function creaAmbienteAutisti(opzioni = {}) {
    const chiamateSyncCash = [];
    const chiamateDC = [];
    const bigEvents = [];

    const env = freshEnv({
        render: opzioni.render !== undefined ? opzioni.render : true,
        serverState: {
            syncCash: async (cash) => {
                chiamateSyncCash.push(cash);
                return { success: true, cash };
            },
            spendDriverCoins: async (motivo, n) => {
                chiamateDC.push({ motivo, n });
                return { ok: true };
            },
            hireDriver: async (name, salary, tier) => ({
                id: 'srv_drv_' + Math.random().toString(36).slice(2),
                name,
                tier,
            }),
            fireDriver: async (_driverId) => ({ success: true }),
            ...opzioni.serverStateOverrides,
        },
    });

    const { sandbox } = env;

    sandbox.showBigEvent = (icon, title, text) => {
        bigEvents.push({ icon, title, text });
    };

    if (opzioni.cash !== undefined) sandbox.gameState.cash = opzioni.cash;
    if (opzioni.driverCoins !== undefined) sandbox.gameState.driverCoins = opzioni.driverCoins;

    return {
        env,
        sandbox,
        gs: sandbox.gameState,
        chiamateSyncCash,
        chiamateDC,
        bigEvents,
    };
}

describe('Funzione Autisti e Risorse Umane — Esecuzione e ciclo di vita', () => {

    // ── 1. ASSUNZIONE AUTISTI (hireDriver) ──────────────────────────
    describe('1. Assunzione Autisti (hireDriver)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti({ cash: 10000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('assunzione riuscita: addebita salary * 2, inserisce autista con campi inizializzati e aggiorna le reclute', async () => {
            const { sandbox, gs, chiamateSyncCash, env } = amb;
            gs.availableRecruits = [
                {
                    name: 'Marco Ferretti',
                    tier: 'standard',
                    salary: 1500,
                    trait: { id: 'prudente', name: '🛡 Prudente', desc: '-50% rischio guasti' },
                    skill_efficiency: 65,
                    skill_charisma: 55,
                    skill_speed: 60,
                },
            ];

            sandbox.hireDriver('Marco Ferretti', 1500);
            await new Promise(r => setImmediate(r));

            // Costo = 1500 * 2 = 3000 -> Cash = 7000
            assert.equal(gs.cash, 7000, 'il saldo deve essere scalato del doppio dello stipendio');
            assert.equal(chiamateSyncCash.length, 1);
            assert.equal(chiamateSyncCash[0], 7000);

            const driver = gs.drivers.find(d => d.name === 'Marco Ferretti');
            assert.ok(driver, 'l\'autista assunto deve essere presente in gameState.drivers');
            assert.equal(driver.salary, 1500);
            assert.equal(driver.status, 'idle');
            assert.equal(driver.assignedCarId, null);
            assert.equal(driver.queue.length, 0);
            assert.equal(driver.fatigue, 0);
            assert.equal(driver.restHoursLeft, 0);
            assert.equal(driver.xp, 0);
            assert.equal(driver.level, 0);
            assert.equal(driver.morale, 100);
            assert.equal(driver.stress_level, 0);
            assert.equal(driver.burnout_until, null);
            assert.equal(driver.skill_efficiency, 65);
            assert.equal(driver.skill_charisma, 55);
            assert.equal(driver.skill_speed, 60);
            assert.equal(driver.trait.id, 'prudente');

            // La recluta assunta viene rimossa dal pool disponibile e il pool viene reintegrato
            assert.ok(!gs.availableRecruits.some(r => r.name === 'Marco Ferretti'));
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Marco Ferretti assunto!')));
        });

        test('assunzione fallita per fondi insufficienti non modifica la cassa né il roster', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            gs.cash = 1000;
            const driversCountBefore = gs.drivers.length;

            sandbox.hireDriver('Sara Conti', 2000); // costo 4000 > 1000
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000, 'il saldo non deve essere modificato');
            assert.equal(gs.drivers.length, driversCountBefore, 'nessun autista deve essere aggiunto');
            assert.equal(chiamateSyncCash.length, 0, 'nessuna sincronizzazione cash al server');
        });

        test('assunzione con nome vuoto o nullo è un safe no-op', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            const driversCountBefore = gs.drivers.length;

            sandbox.hireDriver('', 1500);
            sandbox.hireDriver(null, 1500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.equal(gs.drivers.length, driversCountBefore);
            assert.equal(chiamateSyncCash.length, 0);
        });
    });

    // ── 2. LICENZIAMENTO AUTISTI (fireDriver) ───────────────────────
    describe('2. Licenziamento Autisti (fireDriver)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('licenziare un autista in stato idle o resting lo rimuove dal roster', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push(
                { id: 'drv_idle_1', name: 'Mario Idle', status: 'idle' },
                { id: 'drv_rest_2', name: 'Luigi Rest', status: 'resting', restHoursLeft: 4 }
            );

            sandbox.fireDriver('drv_idle_1');
            assert.ok(!gs.drivers.some(d => d.id === 'drv_idle_1'), 'autista idle deve essere rimosso');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Mario Idle licenziato.')));

            sandbox.fireDriver('drv_rest_2');
            assert.ok(!gs.drivers.some(d => d.id === 'drv_rest_2'), 'autista resting deve essere rimosso');
        });

        test('licenziare un autista in servizio (status busy) viene bloccato per prevenire corse orfane', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push({ id: 'drv_busy_1', name: 'Paolo Busy', status: 'busy', assignedCarId: 'c1' });
            const countBefore = gs.drivers.length;

            sandbox.fireDriver('drv_busy_1');

            assert.equal(gs.drivers.length, countBefore, 'autista busy NON deve essere rimosso');
            assert.ok(gs.drivers.some(d => d.id === 'drv_busy_1'));
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in servizio')));
        });

        test('licenziare un ID autista inesistente non provoca errori', () => {
            const { sandbox, gs } = amb;
            const countBefore = gs.drivers.length;

            assert.doesNotThrow(() => {
                sandbox.fireDriver('id_fantasma');
            });
            assert.equal(gs.drivers.length, countBefore);
        });
    });

    // ── 3. STIPENDI E ROUTINE GIORNALIERA (processDailyRoutines) ───
    describe('3. Stipendi e Costi Ricorrenti (processDailyRoutines)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti({ cash: 20000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('processDailyRoutines calcola e addebita la quota giornaliera stipendi (1/30) di autisti e staff', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            // 2 autisti con stipendio mensile €3000 e €1500 (totale autisti: €4500/mese -> €150/giorno)
            gs.drivers.push(
                { id: 'drv_1', name: 'Driver A', salary: 3000, status: 'idle' },
                { id: 'drv_2', name: 'Driver B', salary: 1500, status: 'idle' }
            );
            // 1 membro staff d'ufficio con stipendio €3000/mese (€100/giorno)
            gs.staff.push({ id: 'admin', name: 'Responsabile Amm.ne', salary: 3000 });

            // Reset investimenti e flotta per isolare il test degli stipendi
            gs.investments = [];
            gs.fleet = [];

            const initialCash = gs.cash; // 20000
            // Spesa attesa stipendi: (4500 / 30) + (3000 / 30) = 150 + 100 = 250
            // Tassa sul lusso con 0 veicoli = 0
            sandbox.processDailyRoutines();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, initialCash - 250, 'il saldo deve essere decrementato esattamente di €250 di stipendi giornalieri');
            assert.ok(chiamateSyncCash.length > 0, 'il nuovo saldo deve essere sincronizzato al server');
        });

        test('spese ricorrenti superiori alla cassa portano il saldo in rosso e incrementano consecutiveRedDays', async () => {
            const { sandbox, gs, env } = amb;
            gs.cash = 100;
            gs.drivers.push({ id: 'drv_costoso', name: 'Driver VIP', salary: 6000, status: 'idle' }); // 200/giorno
            gs.fleet = [];
            gs.investments = [];

            sandbox.processDailyRoutines();

            assert.ok(gs.cash < 0, 'la cassa deve diventare negativa (-100)');
            assert.equal(gs.consecutiveRedDays, 1, 'consecutiveRedDays deve incrementare a 1');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Cassa negativa!')));
        });
    });

    // ── 4. BONUS MONETARIO E SODDISFAZIONE (payDriverBonus) ─────────
    describe('4. Bonus Monetario e Morale (payDriverBonus)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti({ cash: 5000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('pagare un bonus incrementa soddisfazione e morale proporzionalmente e scala la cassa', async () => {
            const { sandbox, gs, chiamateSyncCash, env } = amb;
            gs.drivers.push({ id: 'drv_bonus', name: 'Mario', satisfaction: 50, morale: 60, status: 'idle' });

            // Bonus di €500: soddisfazione +5 (500/100), morale +15
            sandbox.payDriverBonus('drv_bonus', 500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 4500, 'il saldo deve scalare €500');
            assert.equal(chiamateSyncCash.length, 1);
            assert.equal(chiamateSyncCash[0], 4500);

            const drv = gs.drivers.find(d => d.id === 'drv_bonus');
            assert.equal(drv.satisfaction, 55, 'la soddisfazione passa da 50 a 55');
            assert.equal(drv.morale, 75, 'il morale passa da 60 a 75');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Bonus pagato')));
        });

        test('bonus con importo non valido (<= 0 o NaN) non spende denaro', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            gs.drivers.push({ id: 'drv_bonus', name: 'Mario', satisfaction: 50, morale: 60 });

            sandbox.payDriverBonus('drv_bonus', 0);
            sandbox.payDriverBonus('drv_bonus', -200);
            sandbox.payDriverBonus('drv_bonus', 'abc');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(chiamateSyncCash.length, 0);
        });

        test('bonus con fondi insufficienti viene rifiutato da CE_money', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            gs.cash = 300;
            gs.drivers.push({ id: 'drv_bonus', name: 'Mario', satisfaction: 50, morale: 60 });

            sandbox.payDriverBonus('drv_bonus', 500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 300);
            assert.equal(chiamateSyncCash.length, 0);
            const drv = gs.drivers.find(d => d.id === 'drv_bonus');
            assert.equal(drv.satisfaction, 50, 'soddisfazione invariata');
        });

        test('bonus su autista inesistente non addebita denaro', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            sandbox.payDriverBonus('inesistente', 500);
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(chiamateSyncCash.length, 0);
        });
    });

    // ── 5. GESTIONE STRESS: AZZERAMENTO (€1000) VS PAUSA (4h) ───────
    describe('5. Gestione dello Stress (payStressClear vs putDriverOnBreak)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti({ cash: 5000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('payStressClear: scala €1.000, azzera stress e burnout istantaneamente, e risveglia se in riposo', async () => {
            const { sandbox, gs, chiamateSyncCash, env } = amb;
            gs.drivers.push({
                id: 'drv_stress',
                name: 'Gianni Stress',
                stress_level: 85,
                burnout_until: 150,
                status: 'resting',
                restHoursLeft: 10,
            });

            sandbox.payStressClear('drv_stress');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 4000, 'deve scalare esattamente €1.000');
            assert.equal(chiamateSyncCash.length, 1);
            assert.equal(chiamateSyncCash[0], 4000);

            const drv = gs.drivers.find(d => d.id === 'drv_stress');
            assert.equal(drv.stress_level, 0, 'stress deve essere azzerato');
            assert.equal(drv.burnout_until, null, 'burnout deve essere rimosso');
            assert.equal(drv.status, 'idle', 'lo stato deve tornare a idle');
            assert.equal(drv.restHoursLeft, 0, 'ore di riposo azzerate');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Stress di Gianni Stress azzerato!')));
        });

        test('payStressClear rifiuta autisti non stressati e non scala denaro', async () => {
            const { sandbox, gs, chiamateSyncCash, env } = amb;
            gs.drivers.push({ id: 'drv_calmo', name: 'Calmo', stress_level: 0, burnout_until: null, status: 'idle' });

            sandbox.payStressClear('drv_calmo');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(chiamateSyncCash.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('non è stressato')));
        });

        test('payStressClear rifiuta l\'utente CEO (id "ceo")', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            const ceo = gs.drivers.find(d => d.id === 'ceo');
            if (ceo) ceo.stress_level = 90;

            sandbox.payStressClear('ceo');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 5000);
            assert.equal(chiamateSyncCash.length, 0);
        });

        test('putDriverOnBreak: azione gratuita, riduce stress di 40 punti e manda in pausa 4h', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push({ id: 'drv_break', name: 'Luca', stress_level: 70, status: 'idle' });

            sandbox.putDriverOnBreak('drv_break');

            assert.equal(gs.cash, 5000, 'azione completamente gratuita');
            const drv = gs.drivers.find(d => d.id === 'drv_break');
            assert.equal(drv.stress_level, 30, 'lo stress scende da 70 a 30 (-40)');
            assert.equal(drv.status, 'resting', 'autista passa a resting');
            assert.equal(drv.restHoursLeft, 4, 'riposo impostato a 4 ore');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('in pausa')));
        });

        test('putDriverOnBreak rifiuta autisti in servizio (busy) o già a riposo (resting)', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push(
                { id: 'drv_b', name: 'Busy Driver', status: 'busy', stress_level: 60 },
                { id: 'drv_r', name: 'Resting Driver', status: 'resting', restHoursLeft: 3, stress_level: 60 }
            );

            sandbox.putDriverOnBreak('drv_b');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('in servizio')));

            sandbox.putDriverOnBreak('drv_r');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('è già a riposo')));
        });
    });

    // ── 6. MESSA A RIPOSO MANUALE (sendDriverToRest) ────────────────
    describe('6. Messa a Riposo Manuale (sendDriverToRest)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('sendDriverToRest manda un autista idle a riposo per 6 ore svuotando la coda', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push({ id: 'drv_m_rest', name: 'Marco', status: 'idle', queue: [{ id: 'q1' }] });

            sandbox.sendDriverToRest('drv_m_rest');

            const drv = gs.drivers.find(d => d.id === 'drv_m_rest');
            assert.equal(drv.status, 'resting');
            assert.equal(drv.restHoursLeft, 6);
            assert.equal(drv.queue.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('in riposo per 6h')));
        });

        test('sendDriverToRest non agisce su autisti busy o già resting', () => {
            const { sandbox, gs } = amb;
            gs.drivers.push({ id: 'drv_busy', name: 'Busy', status: 'busy' });

            sandbox.sendDriverToRest('drv_busy');
            const drv = gs.drivers.find(d => d.id === 'drv_busy');
            assert.equal(drv.status, 'busy');
        });
    });

    // ── 7. SCIOPERO E ACCORDI SINDACALI (resolveStrike, _tickDriverSatisfaction) ──
    describe('7. Sciopero e Accordi Sindacali (resolveStrike, _tickDriverSatisfaction)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti({ cash: 10000 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_tickDriverSatisfaction fa scattare lo sciopero quando la soddisfazione scende sotto 30', () => {
            const { sandbox, gs, bigEvents } = amb;
            gs.drivers.push({
                id: 'drv_angry',
                name: 'Franco Sciopero',
                satisfaction: 25,
                salary: 2000,
                status: 'idle',
                isOnStrike: false,
            });

            sandbox._tickDriverSatisfaction();

            const drv = gs.drivers.find(d => d.id === 'drv_angry');
            assert.equal(drv.isOnStrike, true, 'isOnStrike deve diventare true');
            assert.equal(drv.status, 'striking', 'lo status deve diventare striking');
            assert.ok(bigEvents.some(e => e.title.includes('in Sciopero!')));
        });

        test('resolveStrike paga accordo al 50% dello stipendio e ripristina l\'operatività', async () => {
            const { sandbox, gs, chiamateSyncCash, bigEvents } = amb;
            gs.drivers.push({
                id: 'drv_strike',
                name: 'Franco',
                salary: 4000,
                isOnStrike: true,
                status: 'striking',
                satisfaction: 20,
                morale: 30,
            });

            // Costo accordo = 4000 * 0.5 = €2.000 -> Cash = 8000
            sandbox.resolveStrike('drv_strike');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 8000, 'il saldo deve essere scalato di €2.000');
            assert.equal(chiamateSyncCash.length, 1);
            assert.equal(chiamateSyncCash[0], 8000);

            const drv = gs.drivers.find(d => d.id === 'drv_strike');
            assert.equal(drv.isOnStrike, false, 'sciopero revocato');
            assert.equal(drv.status, 'idle', 'status torna a idle');
            assert.equal(drv.satisfaction, 60, 'soddisfazione ripristinata a 60');
            assert.equal(drv.morale, 50, 'morale aumentato a 50 (+20)');
            assert.ok(bigEvents.some(e => e.title.includes('Sciopero Risolto')));
        });

        test('resolveStrike rifiuta autisti non in sciopero o fondi insufficienti', async () => {
            const { sandbox, gs, chiamateSyncCash } = amb;
            gs.drivers.push({ id: 'drv_nostrike', name: 'Tranquillo', salary: 3000, isOnStrike: false, status: 'idle' });

            sandbox.resolveStrike('drv_nostrike');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);

            // Con fondi insufficienti
            gs.cash = 500;
            gs.drivers.push({ id: 'drv_strike2', name: 'Scioperante', salary: 3000, isOnStrike: true, status: 'striking' });
            sandbox.resolveStrike('drv_strike2');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 500);
            assert.equal(chiamateSyncCash.length, 0);
        });
    });

    // ── 8. ACCADEMIA AUTISTI (startAcademyCourse, skipAcademyTraining) ─
    describe('8. Accademia Autisti e Corsi di Formazione (startAcademyCourse, skipAcademyTraining)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti({ cash: 10000, driverCoins: 20 }); });
        afterEach(() => amb.env.stopAllIntervals());

        test('startAcademyCourse avvia un corso valido, scala il costo, imposta il completamento e mette in riposo', async () => {
            const { sandbox, gs, chiamateSyncCash, env } = amb;
            gs.drivers.push({ id: 'drv_stud', name: 'Studente', status: 'idle', skill_efficiency: 50 });
            gs.day = 1;
            gs.hour = 10;

            // Corso 'defense': cost 1800, hours 8, skill 'skill_efficiency', skillGain 10
            sandbox.startAcademyCourse('drv_stud', 'defense');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 8200, 'il saldo scala di €1.800');
            assert.equal(chiamateSyncCash.length, 1);
            assert.equal(chiamateSyncCash[0], 8200);

            assert.equal(gs.driverAcademy.length, 1);
            const entry = gs.driverAcademy[0];
            assert.equal(entry.driverId, 'drv_stud');
            assert.equal(entry.skill, 'skill_efficiency');
            assert.equal(entry.skillGain, 10);
            assert.equal(entry.completesHour, 1 * 24 + 10 + 8); // 42

            const drv = gs.drivers.find(d => d.id === 'drv_stud');
            assert.equal(drv.status, 'resting');
            assert.equal(drv.restHoursLeft, 8);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('in formazione: Guida Difensiva')));
        });

        test('startAcademyCourse rifiuta autisti già in formazione, occupati o corsi inesistenti', async () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push({ id: 'drv_busy', name: 'Busy', status: 'busy' });
            gs.drivers.push({ id: 'drv_in_acad', name: 'In Training', status: 'resting' });
            gs.driverAcademy = [{ driverId: 'drv_in_acad', courseName: 'Lingue Straniere' }];

            // Autista busy
            sandbox.startAcademyCourse('drv_busy', 'lang');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Autista in servizio')));

            // Già in formazione
            sandbox.startAcademyCourse('drv_in_acad', 'speed');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('già in formazione')));

            // Corso inesistente
            sandbox.startAcademyCourse('drv_stud', 'corso_fantasma');
            assert.equal(gs.cash, 10000);
        });

        test('completamento naturale del corso in processDailyRoutines applica le skill e rimuove la voce', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push({ id: 'drv_grad', name: 'Laureando', skill_charisma: 50 });
            gs.driverAcademy = [{
                driverId: 'drv_grad',
                skill: 'skill_charisma',
                skillGain: 12,
                courseName: 'Lingue Straniere',
                completesHour: 20,
            }];
            gs.day = 2; // day 2, hour 0 = hour 48 >= 20
            gs.hour = 0;

            sandbox.processDailyRoutines();

            const drv = gs.drivers.find(d => d.id === 'drv_grad');
            assert.equal(drv.skill_charisma, 62, 'la skill charisma sale da 50 a 62');
            assert.equal(gs.driverAcademy.length, 0, 'la lista accademia deve essere vuota');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('corso completato! +12 charisma')));
        });

        test('skipAcademyTraining spende 5 DC, accredita subito il guadagno di skill e libera l\'autista', async () => {
            const { sandbox, gs, chiamateDC, env } = amb;
            gs.drivers.push({ id: 'drv_fast', name: 'Flash', status: 'resting', skill_speed: 50 });
            gs.driverAcademy = [{
                driverId: 'drv_fast',
                skill: 'skill_speed',
                skillGain: 15,
                courseName: 'Guida Sportiva',
            }];

            sandbox.skipAcademyTraining('drv_fast');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 15, 'i Driver Coins scalano da 20 a 15');
            assert.equal(chiamateDC.length, 1);
            assert.equal(chiamateDC[0].n, 5);
            assert.equal(chiamateDC[0].motivo, 'skip_academy');

            const drv = gs.drivers.find(d => d.id === 'drv_fast');
            assert.equal(drv.skill_speed, 65, 'la velocità passa da 50 a 65');
            assert.equal(drv.status, 'idle', 'status torna a idle');
            assert.equal(gs.driverAcademy.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('corso completato! +15 speed')));
        });

        test('skipAcademyTraining senza corsi attivi o senza DC è un safe no-op', async () => {
            const { sandbox, gs, chiamateDC, env } = amb;
            gs.drivers.push({ id: 'drv_nocourse', name: 'No Course', skill_speed: 50 });

            // Nessun corso
            sandbox.skipAcademyTraining('drv_nocourse');
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Nessun corso attivo')));

            // Con corso ma 0 DC
            gs.driverCoins = 0;
            gs.driverAcademy = [{ driverId: 'drv_nocourse', skill: 'skill_speed', skillGain: 15 }];
            sandbox.skipAcademyTraining('drv_nocourse');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.driverCoins, 0);
            assert.equal(chiamateDC.length, 0);
            assert.equal(gs.driverAcademy.length, 1);
        });
    });

    // ── 9. PROGRESSIONE XP, LIVELLI E PUNTI ABILITÀ ──────────────────
    describe('9. Progressione di Livello ed Esperienza (_checkDriverLevel)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('raggiungimento soglie XP promuove l\'autista e conferisce punti abilità', () => {
            const { sandbox, gs, bigEvents } = amb;
            const driver = {
                id: 'drv_lvl',
                name: 'Campione',
                xp: 0,
                level: 0,
                skill_tree: { branch: null, unlocked: [], skill_points: 0 },
            };
            gs.drivers.push(driver);

            // 0 XP -> Livello 0 (Rookie)
            sandbox._checkDriverLevel(driver);
            assert.equal(driver.level, 0);
            assert.equal(driver.skill_tree.skill_points, 0);

            // 250 XP -> Livello 1 (Pro, soglia 200) -> 1 punto abilità
            driver.xp = 250;
            sandbox._checkDriverLevel(driver);
            assert.equal(driver.level, 1);
            assert.equal(driver.skill_tree.skill_points, 1);
            assert.ok(bigEvents.some(e => e.title.includes('Livello Pro!')));

            // 600 XP -> Livello 2 (Expert, soglia 500) -> 2 punti abilità
            driver.xp = 600;
            sandbox._checkDriverLevel(driver);
            assert.equal(driver.level, 2);
            assert.equal(driver.skill_tree.skill_points, 2);

            // 1200 XP -> Livello 3 (Elite, soglia 1000) -> 3 punti abilità
            driver.xp = 1200;
            sandbox._checkDriverLevel(driver);
            assert.equal(driver.level, 3);
            assert.equal(driver.skill_tree.skill_points, 3);
        });
    });

    // ── 10. ALBERO DELLE ABILITÀ RPG (driver_skills.js) ─────────────
    describe('10. Albero delle Abilità RPG (driver_skills.js)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('driverSkillTree inizializza correttamente la struttura se assente', () => {
            const { sandbox } = amb;
            const driver = { id: 'd1', name: 'Test' };
            const st = sandbox.driverSkillTree(driver);

            assert.equal(st.branch, null);
            assert.equal(st.unlocked.length, 0);
            assert.equal(st.skill_points, 0);
        });

        test('driverSelectBranch seleziona un ramo valido e rifiuta modifiche successive', () => {
            const { sandbox, gs, env } = amb;
            const driver = { id: 'drv_skill', name: 'Pilota', skill_tree: { branch: null, unlocked: [], skill_points: 2 } };
            gs.drivers.push(driver);

            // Selezione valida: velocista
            sandbox.driverSelectBranch('drv_skill', 'velocista');
            assert.equal(driver.skill_tree.branch, 'velocista');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Velocista')));

            // Tentativo di cambio ramo bloccato
            sandbox.driverSelectBranch('drv_skill', 'tecnico');
            assert.equal(driver.skill_tree.branch, 'velocista', 'il ramo non deve cambiare');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Hai già scelto un ramo')));
        });

        test('driverUnlockSkill sblocca abilità rispettando costi e prerequisiti dell\'albero', () => {
            const { sandbox, gs, env } = amb;
            const driver = {
                id: 'drv_tree',
                name: 'Meccanico',
                skill_tree: { branch: 'tecnico', unlocked: [], skill_points: 2 },
            };
            gs.drivers.push(driver);

            // Sblocco abilità iniziale 'tec_1' (costo 1pt, nessun prerequisito)
            sandbox.driverUnlockSkill('drv_tree', 'tec_1');
            assert.ok(driver.skill_tree.unlocked.includes('tec_1'));
            assert.equal(driver.skill_tree.skill_points, 1);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Guida Eco')));

            // Tentativo di sbloccare 'tec_3' senza 'tec_2' -> bloccato per prerequisiti
            sandbox.driverUnlockSkill('drv_tree', 'tec_3');
            assert.ok(!driver.skill_tree.unlocked.includes('tec_3'));
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Prerequisiti non soddisfatti')));

            // Sblocco 'tec_2' (costo 1pt, richiede tec_1) -> ora ha 0 punti
            sandbox.driverUnlockSkill('drv_tree', 'tec_2');
            assert.ok(driver.skill_tree.unlocked.includes('tec_2'));
            assert.equal(driver.skill_tree.skill_points, 0);

            // Tentativo di sbloccare 'tec_3' con 0 punti (serve 2pt) -> bloccato
            sandbox.driverUnlockSkill('drv_tree', 'tec_3');
            assert.ok(!driver.skill_tree.unlocked.includes('tec_3'));
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Punti abilità insufficienti')));
        });

        test('driverHasSkill, driverSkillEffect e driverAllEffects aggregano correttamente i moltiplicatori', () => {
            const { sandbox } = amb;
            const driver = {
                id: 'drv_eff',
                name: 'VIP Star',
                skill_tree: {
                    branch: 'diplomatico',
                    unlocked: ['dip_1', 'dip_2'],
                    skill_points: 0,
                },
            };

            assert.equal(sandbox.driverHasSkill(driver, 'dip_1'), true);
            assert.equal(sandbox.driverHasSkill(driver, 'dip_3'), false);

            // dip_1 conferisce tipMult: 1.15
            assert.equal(sandbox.driverSkillEffect(driver, 'tipMult'), 1.15);
            // dip_2 conferisce vipPriority: true
            assert.equal(sandbox.driverSkillEffect(driver, 'vipPriority'), true);
            // Effetto inesistente
            assert.equal(sandbox.driverSkillEffect(driver, 'nonEsistente'), null);

            // driverAllEffects raccoglie tutti i bonus
            const allEff = sandbox.driverAllEffects(driver);
            assert.equal(allEff.tipMult, 1.15);
            assert.equal(allEff.vipPriority, true);
        });
    });

    // ── 11. PERMADEATH E IN MEMORIAM (driverPermadeathRoll) ──────────
    describe('11. Permadeath e Necrologio (driverPermadeathRoll)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('driverPermadeathRoll calcola la morte permanente e archivia in gameState.driverObituaries', () => {
            const { sandbox, gs, bigEvents } = amb;
            const driver = {
                id: 'drv_rip',
                name: 'Ettore Vittima',
                level: 2,
                xp: 750,
                status: 'idle',
                skill_tree: { branch: 'velocista', unlocked: ['vel_1'], skill_points: 0 },
            };
            gs.drivers.push(driver);
            const car = { condition: 10 }; // Condizione pessima -> aumenta rischio

            // Forziamo Math.random a 0.001 per garantire che il tiro permadeath abbia successo
            const origRandom = sandbox.Math.random;
            sandbox.Math.random = () => 0.001;

            const dead = sandbox.driverPermadeathRoll(driver, car);
            assert.equal(dead, true, 'deve ritornare true');
            assert.equal(driver.dead, true);
            assert.equal(driver.status, 'dead');
            assert.ok(bigEvents.some(e => e.title.includes('In Memoriam')));

            sandbox.Math.random = origRandom;
        });
    });

    // ── 12. SPECIALIZZAZIONI E AVATAR (assignSpecialty, setDriverAvatar) ──
    describe('12. Specializzazioni e Avatar (assignSpecialty, setDriverAvatar)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('assignSpecialty assegna una specializzazione valida da DRIVER_SPECIALTIES', () => {
            const { sandbox, gs, env } = amb;
            gs.drivers.push({ id: 'drv_spec', name: 'Roberto', status: 'idle' });

            sandbox.assignSpecialty('drv_spec', 'airport_pro');

            const drv = gs.drivers.find(d => d.id === 'drv_spec');
            assert.equal(drv.specialty, 'airport_pro');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Pro Aeroporti')));
        });

        test('assignSpecialty con ID inesistente è un safe no-op', () => {
            const { sandbox, gs } = amb;
            gs.drivers.push({ id: 'drv_spec2', name: 'Roberto', status: 'idle', specialty: null });

            sandbox.assignSpecialty('drv_spec2', 'spec_inesistente');
            const drv = gs.drivers.find(d => d.id === 'drv_spec2');
            assert.equal(drv.specialty, null);
        });

        test('setDriverAvatar aggiorna avatarBase64 tramite FileReader mock', () => {
            const { sandbox, gs } = amb;
            gs.drivers.push({ id: 'drv_av', name: 'Avatar Test', avatarBase64: null });

            // Mock FileReader
            class MockFileReader {
                readAsDataURL() {
                    this.onload({ target: { result: 'data:image/png;base64,mockImageContent' } });
                }
            }
            sandbox.FileReader = MockFileReader;

            const fakeInput = {
                files: [{ type: 'image/png' }],
            };

            sandbox.setDriverAvatar('drv_av', fakeInput);

            const drv = gs.drivers.find(d => d.id === 'drv_av');
            assert.equal(drv.avatarBase64, 'data:image/png;base64,mockImageContent');
        });
    });

    // ── 13. STAFF D'UFFICIO ED HR SPECIALIST (hireOfficeStaff, fireStaff) ──
    describe('13. Staff d\'Ufficio ed HR Specialist (hireOfficeStaff, fireStaff)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAutisti(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('hireOfficeStaff assume un ruolo ufficio se entro il limite maxStaff dell\'HQ', async () => {
            const { sandbox, gs, env } = amb;
            gs.hqLevel = 2; // Lv 2 permette fino a 4 membri staff
            gs.staff = [];
            gs.drivers = [{ id: 'ceo', name: 'CEO' }]; // CEO non conta per staffLimit

            await sandbox.hireOfficeStaff('hr');

            assert.equal(gs.staff.length, 1);
            assert.equal(gs.staff[0].id, 'hr');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('HR Specialist assunto')));
        });

        test('hireOfficeStaff blocca l\'assunzione se il limite staff dell\'HQ è raggiunto', async () => {
            const { sandbox, gs, env } = amb;
            gs.hqLevel = 0; // maxStaff = 2
            gs.staff = [{ id: 'mech', name: 'Capo Officina', salary: 2600 }];
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'drv1', name: 'Driver 1' }, // 1 staff + 1 driver = 2 (limite raggiunto)
            ];

            await sandbox.hireOfficeStaff('admin');

            assert.equal(gs.staff.length, 1, 'nessun nuovo membro deve essere aggiunto');
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Limite staff raggiunto')));
        });

        test('fireStaff licenzia il membro dello staff previa conferma', () => {
            const { sandbox, gs, env } = amb;
            gs.staff = [{ id: 'mech', name: 'Capo Officina', salary: 2600 }];
            sandbox.confirm = () => true;

            sandbox.fireStaff('mech');

            assert.equal(gs.staff.length, 0);
            assert.ok(env.notifications.some(n => n.type === 'warning' && n.msg.includes('Capo Officina licenziato')));
        });

        test('HR Specialist attivo dimezza il decadimento della soddisfazione autisti', () => {
            const { sandbox, gs } = amb;
            gs.staff = [{ id: 'hr', name: 'HR Specialist', salary: 2800 }];
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'drv_decay', name: 'Tester', satisfaction: 70, salary: 3000, fatigue: 0, morale: 100 },
            ];

            // Con HR attivo, decay base (0.3) * 0.5 = 0.15
            sandbox._tickDriverSatisfaction();

            const drv = gs.drivers.find(d => d.id === 'drv_decay');
            assert.equal(Math.round(drv.satisfaction * 100) / 100, 69.85);
        });

        test('HR Automation (buff DC) gestisce automaticamente gli scioperi pagando il 10% di bonus', () => {
            const { sandbox, gs, env } = amb;
            gs.hrAutomationExpiresAt = new Date(Date.now() + 86400000).toISOString();
            gs.drivers = [
                { id: 'ceo', name: 'CEO' },
                { id: 'drv_auto', name: 'Auto HR Driver', satisfaction: 25, salary: 3000, morale: 40, status: 'idle' },
            ];
            gs.cash = 10000;

            sandbox._tickDriverSatisfaction();

            const drv = gs.drivers.find(d => d.id === 'drv_auto');
            assert.equal(drv.isOnStrike, false, 'lo sciopero non deve scattare');
            assert.equal(drv.satisfaction, 45, 'soddisfazione incrementata a 45');
            // Bonus 10% salary = €300 dedotti
            assert.equal(gs.cash, 9700);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('HR ha gestito automaticamente')));
        });
    });

    // ── 14. RENDERING SCHERMATA STAFF ED EVENT DELEGATION ───────────
    describe('14. Rendering UI Staff ed Event Delegation (renderTabStaff, openCarModal)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteAutisti({ cash: 50000 });
            amb.sandbox.document.body.innerHTML = '<div id="tab-container"></div><div id="modal-car" style="display:none"><div id="car-modal-title"></div><div id="car-modal-desc"></div><div id="car-modal-content"></div></div>';
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabStaff disegna KPI bar, ruoli ufficio, lista autisti e mercato reclutamento', () => {
            const { sandbox, gs } = amb;
            sandbox.window._z2hRestricted = () => false;
            gs.drivers.push({ id: 'drv_ui_1', name: 'Alessandro UI', salary: 2500, fatigue: 45, stress_level: 55, morale: 80, status: 'idle' });
            gs.staff.push({ id: 'mech', name: 'Capo Officina', salary: 2600 });
            gs.availableRecruits = [{ name: 'Recluta Nuova', tier: 'business', salary: 2400 }];

            sandbox.renderTabStaff();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Gestione Staff'));
            assert.ok(c.innerHTML.includes('Staff Ufficio'));
            assert.ok(c.innerHTML.includes('Alessandro UI'));
            assert.ok(c.innerHTML.includes('Capo Officina'));
            assert.ok(c.innerHTML.includes('Recluta Nuova'));
            assert.ok(c.innerHTML.includes('data-ce-act="fireDriver"'));
            assert.ok(c.innerHTML.includes('data-ce-act="renderDriverSkillModal"'));
            assert.ok(c.innerHTML.includes('data-ce-act="putDriverOnBreak"'));
            assert.ok(c.innerHTML.includes('data-ce-act="payStressClear"'));
        });

        test('renderTabStaff in modalità Zero-to-Hero transitoria mostra solo Ragazzo di Quartiere', () => {
            const { sandbox } = amb;
            sandbox.window._z2hRestricted = () => true;

            sandbox.renderTabStaff();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Ragazzo di Quartiere'));
            assert.ok(c.innerHTML.includes('data-ce-act="hireNeighborhoodKid"'));
            assert.ok(!c.innerHTML.includes('Apri Accademia →'), 'accademia nascosta in Zero-to-Hero');
        });

        test('openCarModal e closeModals aprono e chiudono correttamente il pannello veicolo', () => {
            const { sandbox, gs } = amb;
            gs.fleet = [{
                id: 'car_mod_1',
                name: 'Mercedes S-Class',
                tier: 'vip',
                condition: 80,
                fuel: 75,
                tirePressure: 90,
                isLease: false,
                upgrades: [],
            }];

            sandbox.openCarModal('car_mod_1');

            const modal = sandbox.document.getElementById('modal-car');
            assert.equal(modal.style.display, 'flex');
            assert.equal(sandbox.document.getElementById('car-modal-title').innerText, 'Mercedes S-Class');

            sandbox.closeModals();
            assert.equal(modal.style.display, 'none');
        });
    });

    // ── 15. INTEGRITÀ ECONOMICA E SINCRONIZZAZIONE SERVER (CE_money) ─
    describe('15. Integrità Economica e Sincronizzazione Server (CE_money)', () => {
        test('tutte le spese e i bonus passano da CE_money e aggiornano ServerState senza doppi conteggi', async () => {
            const syncedCash = [];
            const amb = creaAmbienteAutisti({
                cash: 50000,
                serverStateOverrides: {
                    syncCash: async (cash) => {
                        syncedCash.push(cash);
                        return { success: true, cash };
                    },
                },
            });
            const { sandbox, gs } = amb;

            // 1. Assunzione autista: salary 2000 -> spende 4000 (cassa 46000)
            sandbox.hireDriver('Autista Sync', 2000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 46000);
            assert.equal(syncedCash[syncedCash.length - 1], 46000);

            const drv = gs.drivers.find(d => d.name === 'Autista Sync');

            // 2. Bonus €1.000 (cassa 45000)
            sandbox.payDriverBonus(drv.id, 1000);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 45000);
            assert.equal(syncedCash[syncedCash.length - 1], 45000);

            // 3. Azzeramento stress €1.000 (cassa 44000)
            drv.stress_level = 80;
            sandbox.payStressClear(drv.id);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 44000);
            assert.equal(syncedCash[syncedCash.length - 1], 44000);

            // 4. Inizio corso accademia €2.500 (cassa 41500)
            sandbox.startAcademyCourse(drv.id, 'lang');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 41500);
            assert.equal(syncedCash[syncedCash.length - 1], 41500);

            // Verifica che nessuna spesa abbia provocato sbalzi asimmetrici o disallineamenti
            assert.equal(syncedCash.length, 4);
            amb.env.stopAllIntervals();
        });
    });
});
