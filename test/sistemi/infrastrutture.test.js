'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/infrastrutture — i depositi di carburante nelle province.

   Fase 3 di PIANO-CHIUSURA.md, sistema 5. Due azioni, tutte e due
   server-authoritative:

   · `_infraBuyDepot(provinceId, provinceName)` — compra il deposito a €300.000.
     Chiede conferma, controlla i fondi in locale (rete di cortesia), poi chiama
     `rpc_buy_fuel_depot`. Il denaro si scala **solo dopo** il sì del server, via
     `CE_money.addebitatoDalServer` — se la RPC fallisce il giocatore non paga.
   · `_infraSetMarkup(provinceId)` — legge lo slider `#markup-slider-<id>` e manda
     `rpc_set_fuel_markup`. Non muove denaro: cambia una percentuale.

   Il difetto che questo sistema può nascondere: scalare i €300.000 prima di
   sapere se il server è d'accordo. C'è un test che lo pretende.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/infrastrutture', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 5_000_000);
        avvisi = [];
        w.showNotification = (msg, tipo) => avvisi.push({ msg, tipo });
        w.confirm = () => true;                 // di default l'utente conferma
        w.renderTabInfrastructure = () => {};   // il rendering non c'entra col denaro
    });
    afterEach(() => env.stopAllIntervals());

    const gs       = () => env.sandbox.window.gameState;
    const chiamata = (nome) => server.chiamate.find(c => c.nome === nome);
    const errori   = () => avvisi.filter(a => a.tipo === 'error').map(a => a.msg);
    const successi = () => avvisi.filter(a => a.tipo === 'success').map(a => a.msg);

    // ── _infraBuyDepot ──────────────────────────────────────────────────────

    describe('_infraBuyDepot — l\'acquisto del deposito', () => {

        test('l\'utente annulla la conferma: niente server, niente addebito', async () => {
            w.confirm = () => false;
            const prima = gs().cash;

            await w._infraBuyDepot('prov_roma', 'Roma');

            assert.equal(chiamata('rpc_buy_fuel_depot'), undefined, 'ha chiamato il server dopo un no');
            assert.equal(gs().cash, prima);
        });

        test('fondi insufficienti: errore, niente RPC, cassa intatta', async () => {
            R.conSoldi(env, 100000);            // il deposito ne costa 300.000
            const prima = gs().cash;

            await w._infraBuyDepot('prov_roma', 'Roma');

            assert.equal(chiamata('rpc_buy_fuel_depot'), undefined);
            assert.equal(gs().cash, prima, 'ha pagato per un deposito che non poteva permettersi');
            assert.ok(errori().some(m => /insufficienti/i.test(m)));
        });

        test('comprato: RPC con la provincia giusta, cassa −300.000, conferma mostrata', async () => {
            server.rispondiCon('rpc_buy_fuel_depot', () => ({ data: { ok: true }, error: null }));
            const prima = gs().cash;

            await w._infraBuyDepot('prov_milano', 'Milano');

            assert.deepEqual(errori(), []);
            const c = chiamata('rpc_buy_fuel_depot');
            assert.ok(c, 'il server non è stato chiamato');
            assert.equal(c.args.v_province_id, 'prov_milano');
            assert.equal(gs().cash, prima - 300000, 'l\'addebito è i 300.000 pieni');
            assert.ok(successi().some(m => /Deposito/i.test(m)));
        });

        test('il server rifiuta: il giocatore NON paga, e lo sa', async () => {
            server.rispondiCon('rpc_buy_fuel_depot',
                () => ({ data: null, error: { message: 'Provincia già occupata' } }));
            const prima = gs().cash;

            await w._infraBuyDepot('prov_milano', 'Milano');

            assert.equal(gs().cash, prima,
                'la RPC è fallita e i 300.000 sono spariti lo stesso');
            assert.ok(errori().some(m => /occupata|non riuscito/i.test(m)));
        });
    });

    // ── _infraSetMarkup ─────────────────────────────────────────────────────

    describe('_infraSetMarkup — il ricarico sul carburante', () => {

        function conSlider(provinceId, valore) {
            const s = env.sandbox.document.createElement('input');
            s.id = 'markup-slider-' + provinceId;
            s.type = 'range';
            s.value = String(valore);
            env.sandbox.document.body.appendChild(s);
            return s;
        }

        test('senza slider nel DOM esce in silenzio, senza chiamare il server', async () => {
            await w._infraSetMarkup('prov_roma');
            assert.equal(chiamata('rpc_set_fuel_markup'), undefined);
            assert.deepEqual(avvisi, []);
        });

        test('con lo slider: manda provincia e percentuale lette dal cursore', async () => {
            conSlider('prov_roma', 18);
            server.rispondiCon('rpc_set_fuel_markup', () => ({ data: { ok: true }, error: null }));

            await w._infraSetMarkup('prov_roma');

            const c = chiamata('rpc_set_fuel_markup');
            assert.ok(c, 'il server non è stato chiamato');
            assert.equal(c.args.v_province_id, 'prov_roma');
            assert.equal(c.args.v_markup_pct, 18);
            assert.ok(successi().some(m => /Markup|18/.test(m)));
            assert.equal(gs().cash, 5_000_000, 'impostare il ricarico non muove denaro');
        });

        test('il server rifiuta il markup: errore mostrato', async () => {
            conSlider('prov_roma', 999);
            server.rispondiCon('rpc_set_fuel_markup',
                () => ({ data: null, error: { message: 'Markup fuori scala' } }));

            await w._infraSetMarkup('prov_roma');

            assert.ok(errori().some(m => /fuori scala|non riuscito/i.test(m)));
        });
    });
});
