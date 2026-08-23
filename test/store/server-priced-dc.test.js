'use strict';
/* ============================================================================
   test/store/server-priced-dc.test.js

   LA PROVA DEL BUG e il contratto della forma nuova.

   Il bug: la vecchia rpc_ec_spend(p_item_id, p_amount) riceveva IL PREZZO dal
   browser. Chi apriva gli strumenti da sviluppatore dichiarava il saldo che
   voleva e comprava l'Executive Pass (150 DC, soldi veri) a 1 DC — e con un
   mercato fra giocatori e classifiche bastava un imbroglione a rovinare
   l'economia di tutti.

   La forma nuova (rpc_dc_purchase, 66_server_priced_dc_purchase.sql): il client
   dice solo COSA compra; il server legge dc_item_prices, blocca la riga del
   giocatore (FOR UPDATE), rifiuta se il saldo non basta, scala lui e RESTITUISCE
   il saldo nuovo. Il browser lo scrive e basta.

   QUESTI TEST SONO ROSSI SUL CODICE VECCHIO: lì CE_money.acquistoDC non esiste,
   engine-store passa un prezzo come parametro e il saldo falso resta falso.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

describe('economia sul server — il prezzo dei DC lo decide il server', () => {

    test('PROVA DEL BUG: un saldo falso dichiarato dal browser viene sepolto da quello del server', async () => {
        // Server col SUO saldo, indipendente dalla variabile del browser
        // (come companies.driver_coins dietro RLS).
        let saldoDelServer = 47;
        const env = freshEnv({
            serverState: {
                purchaseDCItem: async (itemId, units) => {
                    // fuel_boost nel catalogo: unit_price 3.
                    const spent = Math.max(1, 3 * Math.max(1, units || 1));
                    if (saldoDelServer < spent) return null; // rifiuto: niente toccato
                    saldoDelServer -= spent;
                    return { ok: true, item_id: itemId, units, spent, driver_coins: saldoDelServer };
                },
            },
        });
        const gs = env.sandbox.gameState;
        gs.fleet = [{ id: 'car1', fuel: 10 }];
        gs.driverCoins = 999999; // ← l'imbroglione dichiara il saldo che vuole

        await env.sandbox.fuelBoostDC();

        assert.equal(gs.driverCoins, 44,
            'dopo l\'acquisto vale 47-3=44, il saldo del SERVER — non il 999999 falso del browser');
        assert.equal(gs.fleet[0].fuel, 100, 'l\'effetto arriva solo perché il server ha accettato');
    });

    test('il client NON manda nessun prezzo alla RPC: solo cosa compra (id + unita\')', async () => {
        const chiamate = [];
        const env = freshEnv({
            serverState: {
                purchaseDCItem: async (...args) => {
                    chiamate.push(args);
                    return { ok: true, item_id: args[0], units: args[1], spent: 150, driver_coins: 50 };
                },
            },
        });
        const gs = env.sandbox.gameState;
        gs.driverCoins = 200;

        await env.sandbox.activateExecutivePass();

        assert.equal(chiamate.length, 1, 'una sola RPC di acquisto');
        assert.equal(chiamate[0][0], 'executive_pass');
        for (const arg of chiamate[0]) {
            assert.notEqual(arg, 150, 'il prezzo 150 NON deve viaggiare dal client al server');
        }
        assert.ok(chiamate[0].length <= 2, 'al massimo id + unita\': nessun importo deciso dal browser');
        assert.equal(gs.executivePassActive, true);
    });

    test('acquisto senza fondi: rifiutato dal server e NULLA cambia', async () => {
        let richiesteArrivate = 0;
        const env = freshEnv({
            serverState: {
                purchaseDCItem: async () => { richiesteArrivate++; return null; }, // RAISE della vera RPC → null
            },
        });
        const gs = env.sandbox.gameState;
        gs.driverCoins = 999999; // anche con un saldo falso ALTO: decide il server
        gs.energy = 50;

        await env.sandbox.energyBoostDC();

        assert.equal(richiesteArrivate, 1);
        assert.equal(gs.energy, 50, 'l\'effetto non va applicato quando il server rifiuta');
    });

    test('la RPC sql legge il prezzo dal catalogo, blocca la riga PRIMA del saldo e restituisce driver_coins', () => {
        const sql = fs.readFileSync(
            path.join(__dirname, '..', '..', '66_server_priced_dc_purchase.sql'), 'utf8');

        // Il prezzo viene da una TABELLA, mai dal parametro.
        assert.match(sql, /CREATE TABLE IF NOT EXISTS dc_item_prices/,
            'esiste il catalogo prezzi lato server');
        assert.match(sql, /SELECT unit_price[\s\S]*FROM dc_item_prices WHERE item_id = p_item_id/,
            'il prezzo viene letto dalla tabella, non dai parametri');
        assert.match(sql, /p_item_id TEXT,\s*\n\s*p_units\s+INTEGER/,
            'la RPC riceve solo cosa comprare e quante unita\' — nessun prezzo');

        // Lock anti-corsa PRIMA della lettura del saldo.
        const lock = sql.indexOf('FOR UPDATE');
        const letturaSaldo = sql.indexOf('v_balance := v_company.driver_coins');
        assert.ok(lock !== -1 && letturaSaldo !== -1 && lock < letturaSaldo,
            'la riga del giocatore va bloccata FOR UPDATE prima di leggere il saldo');

        // Rifiuto leggibile e saldo restituito.
        assert.match(sql, /Driver Coins insufficienti/, 'errore leggibile per i fondi insufficienti');
        assert.match(sql, /RETURNING driver_coins INTO v_new_bal/, 'scala e restituisce il saldo nuovo');
        assert.match(sql, /'driver_coins', v_new_bal/, 'il JSON di risposta contiene driver_coins');

        // I prezzi non sono scrivibili dai client.
        assert.match(sql, /ENABLE ROW LEVEL SECURITY/, 'RLS sul catalogo prezzi');
        assert.doesNotMatch(sql, /CREATE POLICY[^]*ON dc_item_prices FOR (INSERT|UPDATE|DELETE)/,
            'nessuna policy di scrittura sul catalogo per i client');
    });

    test('money.js espone la via nuova senza calcoli locali: acquistoDC non controlla fondi né scala da sé', async () => {
        let lettiFondiLocali = false;
        const env = freshEnv({
            serverState: {
                purchaseDCItem: async (_itemId, _units) => ({ ok: true, item_id: _itemId, units: _units, spent: 3, driver_coins: 7 }),
            },
        });
        const sandbox = env.sandbox;
        const gs = sandbox.gameState;
        // Spio ogni lettura di driverCoins fatta durante l'acquisto: decidere in
        // base al saldo locale è esattamente il bug che questa forma elimina.
        let saldoOriginale = gs.driverCoins;
        Object.defineProperty(gs, 'driverCoins', {
            configurable: true,
            get() { lettiFondiLocali = true; return saldoOriginale; },
            set(v) { saldoOriginale = v; },
        });

        const esito = await sandbox.CE_money.acquistoDC('fuel_boost');

        delete gs.driverCoins;
        gs.driverCoins = saldoOriginale;
        assert.deepEqual(esito, { ok: true, item_id: 'fuel_boost', units: undefined, spent: 3, driver_coins: 7 });
        assert.equal(gs.driverCoins, 7, 'viene scritto SOLO il saldo restituito dal server');
        assert.equal(lettiFondiLocali, false,
            'l\'acquisto non deve guardare il saldo locale: decide il server');
    });
});
