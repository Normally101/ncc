'use strict';
/* ============================================================================
   test/economy/acquisti-sul-server.test.js

   Le fondamenta dell'economia sul server (decisione Vlad 22/08/2026):
   il browser dice COSA vuole comprare, il server decide QUANTO costa e
   RESTITUISCE il saldo nuovo. Il client (CE_money.acquistoServer) non calcola
   niente: scrive il saldo che il server dichiara.

   Il test chiave e' l'ultimo del primo blocco: se il browser DICHIARA un saldo
   falso, dopo l'acquisto vale comunque quello del server. Sul codice vecchio
   (spendDC che scalava localmente e comunicava il totale) questo test era ROSSO.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

/** ServerState finto con SALDO PROPRIO, come la colonna companies del DB vero:
 *  non legge mai il saldo del browser, quindi puo' divergere da lui. */
function serverConSaldoProprio(saldoReale, catalogo) {
    const tentativi = [];
    let saldo = saldoReale;
    return {
        tentativi,
        saldo: () => saldo,
        override: {
            economyPurchase: async (tipo, itemId, quantita) => {
                tentativi.push({ tipo, itemId, quantita });
                const unitario = catalogo[itemId];
                if (tipo !== 'driver_coins_shop' || !unitario) return null;
                const q = Math.max(1, Math.min(quantita || 1, 100));
                if (saldo < unitario * q) return null; // rifiuto: nulla toccato
                saldo -= unitario * q;
                return { ok: true, purchase_type: tipo, item_id: itemId, quantity: q,
                         currency: 'driver_coins', spent: unitario * q,
                         driver_coins: saldo, cash: null };
            },
        },
    };
}

describe('CE_money.acquistoServer — il saldo che vale e\' quello del server', () => {

    test('il browser dichiara un saldo falso: dopo l\'acquisto vale quello del server', async () => {
        // Saldo VERO del server 200 DC. Il browser bugia: dice di averne 999.999.
        const srv = serverConSaldoProprio(200, { executive_pass: 150 });
        const { sandbox, notifications } = freshEnv({ serverState: srv.override });
        const gs = sandbox.gameState;
        gs.driverCoins = 999999;

        sandbox.activateExecutivePass();
        await new Promise(r => setImmediate(r));

        // Sul codice vecchio qui c'era 999999-150=999849: il totale deciso dal browser.
        assert.equal(gs.driverCoins, 50,
            'dopo l\'acquisto il saldo deve essere quello dichiarato dal server, non quello calcolato dal browser');
        assert.equal(sandbox.gameState.executivePassActive, true,
            'l\'acquisto accettato deve applicare l\'effetto comprato');
        assert.equal(srv.saldo(), 50);
        assert.equal(tentativoPrezzo(srv.tentativi[0]), undefined,
            'al server non deve arrivare nessun prezzo dal browser');
        assert.ok(notifications.length === 0, 'un acquisto accettato non deve avvisare di errori');
    });

    test('il prezzo lo decide il server: quello mostrato dal client viene ignorato', async () => {
        // Il listino del server dice fuel_boost = 7 DC; la UI mostra 3.
        const srv = serverConSaldoProprio(20, { fuel_boost: 7 });
        const { sandbox } = freshEnv({ serverState: srv.override });
        const gs = sandbox.gameState;
        gs.driverCoins = 20;
        gs.fleet = [{ id: 'c1', fuel: 10 }];

        sandbox.fuelBoostDC();
        await new Promise(r => setImmediate(r));

        assert.equal(gs.driverCoins, 13, 'viene scalato il PREZZO DEL SERVER (7), non quello della UI (3)');
        assert.equal(gs.fleet[0].fuel, 100);
    });

    test('acquisto senza fondi: rifiutato e NON cambia niente', async () => {
        const srv = serverConSaldoProprio(100, { executive_pass: 150 });
        const { sandbox, notifications } = freshEnv({ serverState: srv.override });
        const gs = sandbox.gameState;
        gs.driverCoins = 100;
        gs.executivePassActive = false;

        sandbox.activateExecutivePass();
        await new Promise(r => setImmediate(r));

        assert.equal(gs.executivePassActive, false, 'nessun effetto comprato su un acquisto rifiutato');
        assert.equal(gs.driverCoins, 100, 'il saldo visibile non deve muoversi per un rifiuto');
        assert.equal(srv.saldo(), 100, 'il saldo del server non deve muoversi per un rifiuto');
        assert.ok(notifications.some(n => n.type === 'error'),
            'il rifiuto deve arrivare al giocatore come avviso');
    });

    test('le voci a costo variabile mandano la QUANTITA\': il totale lo calcola il server', async () => {
        // Listino server: skip_all_academy = 5 DC a corso. Client: 3 corsi.
        const srv = serverConSaldoProprio(30, { skip_all_academy: 5 });
        const { sandbox } = freshEnv({ serverState: srv.override });
        const gs = sandbox.gameState;
        gs.driverCoins = 30;
        gs.drivers = [{ id: 'd1', name: 'Luca' }];
        gs.driverAcademy = [
            { driverId: 'd1', skill: 'driving', skillGain: 10 },
            { driverId: 'd1', skill: 'etiquette', skillGain: 10 },
            { driverId: 'd1', skill: 'safety', skillGain: 10 },
        ];

        sandbox.skipAllAcademyDC();
        await new Promise(r => setImmediate(r));

        assert.deepEqual(
            { itemId: srv.tentativi[0].itemId, quantita: srv.tentativi[0].quantita },
            { itemId: 'skip_all_academy', quantita: 3 },
            'al server va dichiarata la quantita\', non il totale');
        assert.equal(gs.driverCoins, 15, 'totale = prezzo unitario del server × quantita\'');
        assert.equal(gs.driverAcademy.length, 0);
    });

    test('senza ServerState.economyPurchase l\'acquisto fallisce senza toccare nulla', async () => {
        const { sandbox, notifications } = freshEnv({
            serverState: { economyPurchase: null },
        });
        const gs = sandbox.gameState;
        gs.driverCoins = 500;
        gs.energy = 40;

        const esito = await sandbox.CE_money.acquistoServer('driver_coins_shop', 'energy_boost');

        assert.equal(esito, false);
        assert.equal(gs.driverCoins, 500);
        assert.equal(gs.energy, 40);
        assert.ok(notifications.some(n => n.type === 'error'));
    });
});

function tentativoPrezzo(tentativo) {
    // Il contratto della RPC non ha nessun parametro prezzo: se un domani
    // qualcuno lo reintroduce, questo lo fa saltare fuori.
    const chiavi = Object.keys(tentativo || {});
    const illegittime = chiavi.filter(k => /prezzo|price|amount|cost/i.test(k));
    return illegittime.length ? tentativo[illegittime[0]] : undefined;
}

/* ── La RPC generica lato server: vincoli verificabili dal sorgente .sql ── */
describe('rpc_economy_purchase (65_economy_server_purchases.sql)', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', '65_economy_server_purchases.sql'), 'utf8');

    test('legge il prezzo DAL SERVER, da tabella — non esiste un parametro prezzo', () => {
        assert.match(sql, /FROM public\.economy_catalog/);
        assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.rpc_economy_purchase\([^)]*price/i,
            'la firma della RPC non deve avere nessun parametro di prezzo');
    });

    test('blocca la riga del giocatore FOR UPDATE prima di leggere il saldo', () => {
        // In SQL `INTO` precede testualmente `FOR UPDATE` nello stesso statement:
        // il vincolo da verificare e' che la SELECT che legge il saldo FINISCA
        // con FOR UPDATE (lock preso mentre legge, non dopo).
        assert.match(sql,
            /INTO\s+v_company_name,\s*v_balance[\s\S]{0,300}FROM public\.companies[\s\S]{0,200}WHERE user_id = v_user_id\s+FOR UPDATE/,
            'la lettura del saldo deve avvenire sotto lock FOR UPDATE della riga companies');
    });

    test('rifiuta i fondi insufficienti con errore leggibile e restituisce il saldo nuovo', () => {
        assert.match(sql, /fondi insufficienti/);
        assert.match(sql, /RETURNING driver_coins::bigint INTO v_new_balance/);
        assert.match(sql, /RETURNING cash::bigint INTO v_new_balance/);
        assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.rpc_economy_purchase\(TEXT, TEXT, INTEGER\) TO authenticated/);
    });
});
