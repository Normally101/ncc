'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/store — l'Executive Club (engine-store.js + ui-store.js).

   Fase 3 di PIANO-CHIUSURA.md, sistema 12. Diciotto azioni:

   · i booster in **Driver Coins** (`*DC`, engine-store.js) e i "servizi esclusivi"
     (`_ec*`, ui-store.js): tutti passano da `CE_money.spendDC`, che scala il
     saldo locale e riallinea sul valore del server. Se i DC non bastano, `spendDC`
     restituisce `false` e **niente viene toccato** — è la guardia da difendere.
   · `_dcSpend(itemId, cost)`   — spesa DC generica con whitelist di itemId;
   · `_dcAcquistaPacchetto(packKey)` — acquisto DC con denaro vero: NON tocca il
     saldo in locale, apre solo la cassa Stripe; ogni ramo d'errore dice
     esplicitamente «nessun addebito è stato fatto»;
   · `_ecSwitchTab(tab)`        — sola interfaccia.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/store', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.gameState.driverCoins = 1000;   // saldo DC comodo
    });
    afterEach(() => env.stopAllIntervals());

    const gs   = () => env.sandbox.window.gameState;
    const dc   = () => gs().driverCoins;
    const info = () => avvisi.map(a => a.m);

    // ── booster in DC (engine-store.js) ─────────────────────────────────────

    describe('booster in Driver Coins', () => {

        test('activateExecutivePass: −150 DC e pass attivo per 30 giorni', () => {
            w.activateExecutivePass();
            assert.equal(dc(), 1000 - 150);
            assert.equal(gs().executivePassActive, true);
            assert.equal(gs().executivePassExpiresDay, gs().day + 30);
        });

        test('activateExecutivePass senza DC: nessun pass, saldo intatto', () => {
            gs().driverCoins = 10;
            w.activateExecutivePass();
            assert.equal(dc(), 10);
            assert.ok(!gs().executivePassActive);
        });

        test('fuelBoostDC: −3 DC e tutta la flotta al 100% carburante', () => {
            gs().fleet.forEach(c => { c.fuel = 20; });
            w.fuelBoostDC();
            assert.equal(dc(), 1000 - 3);
            assert.ok(gs().fleet.every(c => c.fuel === 100));
        });

        test('energyBoostDC: −4 DC e energia CEO a 100 (ma non se è già piena)', () => {
            gs().energy = 30;
            w.energyBoostDC();
            assert.equal(dc(), 996);
            assert.equal(gs().energy, 100);

            gs().energy = 100;
            w.energyBoostDC();
            assert.equal(dc(), 996, 'con energia piena non deve spendere');
        });

        test('wakeAllDriversDC / healAllDriversDC: senza bersagli non spendono', () => {
            w.wakeAllDriversDC();
            w.healAllDriversDC();
            assert.equal(dc(), 1000);
            assert.ok(info().some(m => /riposo/i.test(m)) || info().some(m => /forma/i.test(m)));
        });

        test('wakeAllDriversDC: sveglia gli autisti a riposo e paga il costo scalato', () => {
            gs().drivers.push(
                { id: 'd1', name: 'A', status: 'resting', fatigue: 40 },
                { id: 'd2', name: 'B', status: 'resting', fatigue: 40 },
            );
            const costo = Math.max(3, 2 * 2);
            w.wakeAllDriversDC();
            assert.equal(dc(), 1000 - costo);
            assert.ok(gs().drivers.filter(d => d.id.startsWith('d')).every(d => d.status === 'idle'));
        });

        test('opsBundleDC (−9) e fullBundleDC (−35): pacchetti che rimettono a posto flotta ed energia', () => {
            gs().fleet.forEach(c => { c.fuel = 10; });
            gs().energy = 5;
            w.opsBundleDC();
            assert.equal(dc(), 1000 - 9);
            assert.ok(gs().fleet.every(c => c.fuel === 100));
            assert.equal(gs().energy, 100);

            gs().driverCoins = 1000;
            gs().fleet.forEach(c => { c.fuel = 10; });
            w.fullBundleDC();
            assert.equal(dc(), 1000 - 35);
        });

        test('skipAllAcademyDC / skipAllConstructionsDC: senza code attive non spendono', () => {
            gs().driverAcademy = [];
            gs().constructions = [];
            w.skipAllAcademyDC();
            w.skipAllConstructionsDC();
            assert.equal(dc(), 1000);
        });

        test('skipAllConstructionsDC: completa le costruzioni e le sposta negli investimenti', () => {
            gs().constructions = [{ invId: 'inv_a' }, { invId: 'inv_b' }];
            w.skipAllConstructionsDC();
            assert.equal(dc(), 1000 - 16);
            assert.equal(gs().constructions.length, 0);
            assert.ok(gs().investments.includes('inv_a') && gs().investments.includes('inv_b'));
        });
    });

    // ── servizi esclusivi (_ec*, ui-store.js) ───────────────────────────────

    describe('servizi esclusivi', () => {

        test('_ecCaffeSospeso: azzera lo stress del più esausto, −10 DC', () => {
            gs().drivers.push({ id: 'd1', name: 'Teso', stress_level: 80 });
            w._ecCaffeSospeso();
            assert.equal(dc(), 990);
            assert.equal(gs().drivers.find(d => d.id === 'd1').stress_level, 0);
        });

        test('_ecCaffeSospeso senza autisti stressati: nessuna spesa', () => {
            w._ecCaffeSospeso();
            assert.equal(dc(), 1000);
        });

        test('_ecManutenzioneExpress: ripara il veicolo più malandato, −25 DC', () => {
            gs().fleet[0].condition = 40;
            w._ecManutenzioneExpress();
            assert.equal(dc(), 975);
            assert.equal(gs().fleet[0].condition, 100);
        });

        test('_ecTangenteSindacato: −50 DC e protezione scioperi fino a domani', () => {
            w._ecTangenteSindacato();
            assert.equal(dc(), 950);
            assert.equal(gs().tangenteUntil, gs().day + 1);
        });

        test('_ecPolizzaKasko: −150 DC e kasko temporanea per 7 giorni', () => {
            w._ecPolizzaKasko();
            assert.equal(dc(), 850);
            assert.equal(gs().tempKaskoExpiresDay, gs().day + 7);
        });

        test('_ecRadarVip: −200 DC (una volta sola finché è attivo)', () => {
            w._applyBuff = () => {};
            w._ecRadarVip();
            assert.equal(dc(), 800);
        });

        test('_ecTargaPresidenziale: −500 DC e targa, non due volte', () => {
            w._ecTargaPresidenziale();
            assert.equal(dc(), 500);
            assert.equal(gs().hasPrestigiousPlate, true);

            w._ecTargaPresidenziale();
            assert.equal(dc(), 500, 'la seconda volta non deve spendere');
        });

        test('nessun _ec* spende se i DC non bastano', () => {
            gs().driverCoins = 5;
            gs().drivers.push({ id: 'd1', name: 'Teso', stress_level: 80 });
            gs().fleet[0].condition = 40;
            w._ecCaffeSospeso();
            w._ecManutenzioneExpress();
            w._ecTangenteSindacato();
            assert.equal(dc(), 5);
            assert.equal(gs().drivers.find(d => d.id === 'd1').stress_level, 80);
        });
    });

    // ── _dcSpend ───────────────────────────────────────────────────────────

    describe('_dcSpend', () => {

        test('itemId non in whitelist: errore, niente spesa', () => {
            w._dcSpend('roba_a_caso', 10);
            assert.equal(dc(), 1000);
            assert.ok(info().some(m => /non riconosciuta/i.test(m)));
        });

        test('energy_full: −costo DC e energia a 100', () => {
            gs().energy = 20;
            w._dcSpend('energy_full', 15);
            assert.equal(dc(), 985);
            assert.equal(gs().energy, 100);
        });

        test('auto_rest: si attiva una volta sola', () => {
            w._dcSpend('auto_rest', 30);
            assert.equal(gs().autoRestEnabled, true);
            assert.equal(dc(), 970);
            w._dcSpend('auto_rest', 30);
            assert.equal(dc(), 970, 'già attivo: nessuna seconda spesa');
        });
    });

    // ── _dcAcquistaPacchetto (denaro vero) ─────────────────────────────────

    describe('_dcAcquistaPacchetto', () => {

        test('pacchetto non riconosciuto: errore, nessuna chiamata alla cassa', async () => {
            R.conGiocatoreCollegato(env);
            let fetched = false;
            w.fetch = async () => { fetched = true; return { json: async () => ({}) }; };
            await w._dcAcquistaPacchetto('non-esiste');
            assert.equal(fetched, false);
            assert.ok(info().some(m => /non riconosciuto/i.test(m)));
        });

        test('senza sessione: errore "devi essere connesso", nessun addebito', async () => {
            const srv = R.conGiocatoreCollegato(env);
            w.supabaseClient.auth.getSession = async () => ({ data: { session: null } });
            await w._dcAcquistaPacchetto('starter');
            assert.ok(info().some(m => /connesso/i.test(m)));
        });

        test('la cassa risponde "non ok": messaggio che nega l\'addebito, nessun redirect', async () => {
            R.conGiocatoreCollegato(env);
            w.supabaseClient.auth.getSession = async () => ({ data: { session: { access_token: 'tok' } } });
            w.fetch = async () => ({ json: async () => ({ ok: false, reason: 'pagamenti_non_configurati' }) });
            await w._dcAcquistaPacchetto('starter');
            assert.ok(info().some(m => /nessun addebito/i.test(m)));
            assert.equal(dc(), 1000, 'il saldo DC non si tocca in locale');
        });
    });

    // ── _ecSwitchTab ───────────────────────────────────────────────────────

    test('_ecSwitchTab cambia la scheda attiva del negozio', () => {
        w.renderTabPremiumStore = () => {};
        w._ecSwitchTab('services');
        assert.equal(env.sandbox._ecActiveTab, 'services');
        w._ecSwitchTab('acquire');
        assert.equal(env.sandbox._ecActiveTab, 'acquire');
    });
});
