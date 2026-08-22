'use strict';
/* ============================================================================
   test/azioni/autisti.test.js — Azioni player sugli autisti

   Rende esercitabili nel banco di prova le azioni del gruppo "autisti":
   hireDriver, payDriverBonus, payStressClear, sendDriverToRest,
   healAllDriversDC, resolveStrike.

   Per ogni azione che muove denaro si verifica:
   - l'importo giusto, UNA SOLA VOLTA, passando da window.CE_money
     (spia che conta e delega: la cassa si muove davvero);
   - il rifiuto per fondi/DC insufficienti o bersaglio inesistente;
   - per le azioni in DC, che la RPC spendDriverCoins sia chiamata e che un
     rifiuto del server NON lasci il saldo scalato (money.js annulla e avvisa).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('azioni autisti — assunzione, bonus, stress, riposo, benessere DC, sciopero', () => {
    let env, sandbox, gs;
    let spendCalls;   // chiamate a window.CE_money.spend (importo, motivo)
    let rpcDC;        // chiamate alla RPC spendDriverCoins

    function mkDriver(over = {}) {
        return Object.assign({
            id: 'd_test_' + Math.random().toString(36).slice(2),
            name: 'Autista Test',
            salary: 2000,
            status: 'idle',
            assignedCarId: null,
            queue: [],
            fatigue: 0,
            restHoursLeft: 0,
            xp: 0,
            level: 0,
            morale: 80,
            satisfaction: 50,
            stress_level: 0,
        }, over);
    }

    beforeEach(() => {
        rpcDC = [];
        env = freshEnv({
            serverState: {
                spendDriverCoins: async (motivo, n) => {
                    rpcDC.push({ motivo, n });
                    return { ok: true, driver_coins: sandbox.gameState.driverCoins };
                },
            },
        });
        sandbox = env.sandbox;
        sandbox.initGame(true);
        env.stopAllIntervals();
        gs = sandbox.gameState;
        gs.cash = 500000;
        gs.drivers = [];

        // Spia su CE_money.spend: registra e delega al vero money.js,
        // così verifichiamo SIA il percorso (nessun gameState.cash -= diretto)
        // SIA l'effetto reale sul saldo.
        spendCalls = [];
        const origSpend = sandbox.CE_money.spend.bind(sandbox.CE_money);
        sandbox.CE_money.spend = (importo, motivo) => {
            spendCalls.push({ importo, motivo });
            return origSpend(importo, motivo);
        };
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    // ── hireDriver (engine-drivers.js) ────────────────────────────────────
    describe('hireDriver', () => {
        test('assume: costo = salary*2, addebitato UNA volta da CE_money.spend', () => {
            gs.availableRecruits = [{ name: 'Luca Bianchi', salary: 1800 }];
            sandbox.hireDriver('Luca Bianchi', 1800);

            const assunto = gs.drivers.find(d => d.name === 'Luca Bianchi');
            assert.ok(assunto, 'l\'autista non è stato aggiunto a gameState.drivers');
            assert.equal(spendCalls.length, 1, 'CE_money.spend deve essere chiamata esattamente una volta');
            assert.deepEqual(spendCalls[0], { importo: 3600, motivo: 'hire_driver' });
            assert.equal(gs.cash, 500000 - 3600, 'il saldo deve calare di salary*2, una sola volta');
        });

        test('fondi insufficienti: nessuna assunzione, saldo intatto', () => {
            gs.availableRecruits = [{ name: 'Luca Bianchi', salary: 1800 }];
            gs.cash = 100;
            sandbox.hireDriver('Luca Bianchi', 1800);

            assert.equal(gs.drivers.length, 0, 'nessun autista deve essere aggiunto');
            assert.equal(gs.cash, 100, 'il saldo non deve muoversi');
        });

        test('senza nome: nessuna spesa, nessuna assunzione', () => {
            sandbox.hireDriver(null, 2000);
            assert.equal(spendCalls.length, 0);
            assert.equal(gs.drivers.length, 0);
        });
    });

    // ── payDriverBonus (engine-drivers.js) ────────────────────────────────
    describe('payDriverBonus', () => {
        test('bonus: importo esatto una volta, soddisfazione e morale salgono', () => {
            const d = mkDriver();
            gs.drivers = [d];
            sandbox.payDriverBonus(d.id, 500);

            assert.deepEqual(spendCalls, [{ importo: 500, motivo: 'driver_bonus' }]);
            assert.equal(gs.cash, 500000 - 500);
            assert.equal(d.satisfaction, 55, 'soddisfazione += min(40, 500/100)');
            assert.equal(d.morale, 95, 'morale += 15 (cap 100)');
        });

        test('cap soddisfazione a 100 e cap morale a 100', () => {
            const d = mkDriver({ satisfaction: 98, morale: 95 });
            gs.drivers = [d];
            sandbox.payDriverBonus(d.id, 10000);
            assert.equal(d.satisfaction, 100);
            assert.equal(d.morale, 100);
        });

        test('importo <= 0 o autista inesistente: nessuna spesa', () => {
            const d = mkDriver();
            gs.drivers = [d];
            sandbox.payDriverBonus(d.id, 0);
            sandbox.payDriverBonus(d.id, -50);
            sandbox.payDriverBonus('inesistente', 100);
            assert.equal(spendCalls.length, 0, 'nessuna chiamata a spend');
            assert.equal(gs.cash, 500000);
        });

        test('fondi insufficienti: nessun effetto sull\'autista', () => {
            const d = mkDriver();
            gs.drivers = [d];
            gs.cash = 10;
            sandbox.payDriverBonus(d.id, 500);
            assert.equal(d.satisfaction, 50, 'soddisfazione invariata');
            assert.equal(gs.cash, 10, 'saldo invariato');
        });
    });

    // ── payStressClear (engine-drivers.js) ────────────────────────────────
    describe('payStressClear', () => {
        test('azzera stress e burnout per €1.000, una sola volta', () => {
            const d = mkDriver({ stress_level: 65, burnout_until: 999, status: 'resting', restHoursLeft: 3 });
            gs.drivers = [d];
            sandbox.payStressClear(d.id);

            assert.deepEqual(spendCalls, [{ importo: 1000, motivo: 'pay_stress_clear' }]);
            assert.equal(gs.cash, 500000 - 1000);
            assert.equal(d.stress_level, 0);
            assert.equal(d.burnout_until, null);
            assert.equal(d.status, 'idle', 'il riposo attivo viene interrotto');
            assert.equal(d.restHoursLeft, 0);
        });

        test('autista non stressato: nessuna spesa', () => {
            const d = mkDriver({ stress_level: 0 });
            gs.drivers = [d];
            sandbox.payStressClear(d.id);
            assert.equal(spendCalls.length, 0);
            assert.equal(gs.cash, 500000);
        });

        test('il CEO non è un bersaglio valido', () => {
            const ceo = mkDriver({ id: 'ceo', stress_level: 90 });
            gs.drivers = [ceo];
            sandbox.payStressClear('ceo');
            assert.equal(spendCalls.length, 0);
            assert.equal(ceo.stress_level, 90);
        });

        test('fondi insufficienti: lo stress resta', () => {
            const d = mkDriver({ stress_level: 65 });
            gs.drivers = [d];
            gs.cash = 999;
            sandbox.payStressClear(d.id);
            assert.equal(d.stress_level, 65);
            assert.equal(gs.cash, 999);
        });
    });

    // ── sendDriverToRest (engine-drivers.js) ──────────────────────────────
    describe('sendDriverToRest', () => {
        test('manda in riposo 6h senza muovere denaro', () => {
            const d = mkDriver({ status: 'idle' });
            gs.drivers = [d];
            sandbox.sendDriverToRest(d.id);

            assert.equal(d.status, 'resting');
            assert.equal(d.restHoursLeft, 6);
            assert.equal(spendCalls.length, 0, 'questa azione non costa denaro');
            assert.equal(gs.cash, 500000);
        });

        test('autista busy: invariato', () => {
            const d = mkDriver({ status: 'busy' });
            gs.drivers = [d];
            sandbox.sendDriverToRest(d.id);
            assert.equal(d.status, 'busy');
        });

        test('autista già a riposo: invariato', () => {
            const d = mkDriver({ status: 'resting', restHoursLeft: 2 });
            gs.drivers = [d];
            sandbox.sendDriverToRest(d.id);
            assert.equal(d.restHoursLeft, 2, 'non deve resettare il riposo in corso');
        });

        test('autista inesistente: nessun errore, nessuna spesa', () => {
            sandbox.sendDriverToRest('fantasma');
            assert.equal(spendCalls.length, 0);
        });
    });

    // ── healAllDriversDC (engine-store.js) ────────────────────────────────
    describe('healAllDriversDC', () => {
        test('guarisce gli stressati: costo max(4, n*2) DC via spendDC/RPC, CEO escluso', async () => {
            const a = mkDriver({ stress_level: 30 });
            const b = mkDriver({ burnout_until: 123 });
            const ceo = mkDriver({ id: 'ceo', stress_level: 99 });
            gs.drivers = [a, b, ceo];
            gs.driverCoins = 100;

            sandbox.healAllDriversDC();

            assert.equal(rpcDC.length, 1, 'una sola RPC spendDriverCoins');
            assert.deepEqual(rpcDC[0], { motivo: 'heal_all_drivers', n: 4 });
            assert.equal(gs.driverCoins, 96, 'solo il costo della guarigione, una volta');
            assert.equal(a.stress_level, 0);
            assert.equal(b.burnout_until, null);
            assert.equal(ceo.stress_level, 99, 'il CEO non va guarito né pagato');
        });

        test('rifiuto del server: il saldo DC viene ripristinato e il giocatore avvisato', async () => {
            const a = mkDriver({ stress_level: 30 });
            gs.drivers = [a];
            gs.driverCoins = 100;
            sandbox.ServerState.spendDriverCoins = async () => null; // RPC rigetta

            sandbox.healAllDriversDC();
            // Aspetta il FATTO "saldo ripristinato", non un tempo fisso: il rollback
            // di spendDC avviene dopo la risoluzione della promessa della RPC, e un
            // timeout corto non garantisce che sia già avvenuto (esito flaky).
            for (let giri = 0; giri < 500 && gs.driverCoins !== 100; giri++) {
                await new Promise(r => setImmediate(r));
            }

            assert.equal(gs.driverCoins, 100, 'l\'addebito locale deve essere annullato');
        });

        test('DC insufficienti: rifiuto locale, RPC mai chiamata', () => {
            gs.drivers = [mkDriver({ stress_level: 30 })];
            gs.driverCoins = 2;
            sandbox.healAllDriversDC();
            assert.equal(rpcDC.length, 0);
            assert.equal(gs.driverCoins, 2);
            assert.equal(gs.drivers[0].stress_level, 30);
        });

        test('staff già in forma: nessuna spesa', () => {
            gs.drivers = [mkDriver()];
            gs.driverCoins = 50;
            sandbox.healAllDriversDC();
            assert.equal(rpcDC.length, 0);
            assert.equal(gs.driverCoins, 50);
        });
    });

    // ── resolveStrike (engine-drivers.js) ─────────────────────────────────
    describe('resolveStrike', () => {
        test('accordo sindacale: metà dello stipendio, una volta sola', () => {
            const d = mkDriver({ salary: 3000, isOnStrike: true, status: 'on_strike' });
            gs.drivers = [d];
            sandbox.resolveStrike(d.id);

            assert.deepEqual(spendCalls, [{ importo: 1500, motivo: 'resolve_strike' }]);
            assert.equal(gs.cash, 500000 - 1500);
            assert.equal(d.isOnStrike, false);
            assert.equal(d.status, 'idle');
            assert.equal(d.satisfaction, 60);
        });

        test('autista non in sciopero: nessuna spesa', () => {
            const d = mkDriver({ isOnStrike: false });
            gs.drivers = [d];
            sandbox.resolveStrike(d.id);
            assert.equal(spendCalls.length, 0);
            assert.equal(gs.cash, 500000);
        });

        test('fondi insufficienti: lo sciopero continua', () => {
            const d = mkDriver({ salary: 3000, isOnStrike: true });
            gs.drivers = [d];
            gs.cash = 100;
            sandbox.resolveStrike(d.id);
            assert.equal(d.isOnStrike, true);
            assert.equal(gs.cash, 100);
        });

        test('senza stipendio usa il default 2500 → accordo di €1.250', () => {
            const d = mkDriver({ salary: undefined, isOnStrike: true });
            gs.drivers = [d];
            sandbox.resolveStrike(d.id);
            assert.deepEqual(spendCalls, [{ importo: 1250, motivo: 'resolve_strike' }]);
        });
    });
});
