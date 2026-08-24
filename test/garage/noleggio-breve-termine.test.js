'use strict';
/* ============================================================================
   test/garage/noleggio-breve-termine.test.js

   Noleggio veicoli a breve termine dal showroom (Vlad):
   - durate 3/5/7/14/30 giorni, prezzo calibrato: la durata più corta deve essere
     abbordabile con i ~5.000€ del giocatore nuovo, ma noleggiare a lungo deve
     costare più che comprare;
   - il costo si paga SUBITO per intero via CE_money.spend;
   - l'auto noleggiata fa corse come una di proprietà ma non si può vendere;
   - alla scadenza esce dalla flotta (torna al concessionario).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupNoleggioEnv() {
    const env = freshEnv({});
    return { sandbox: env.sandbox, gs: env.sandbox.gameState };
}

const PREZZO_NEXUS = 35000; // nexus_h_line in STELLAR_VOLT_CATALOG — NON va toccato

describe('noleggio breve termine (showroom)', () => {

    test('noleggio con fondi sufficienti: auto in flotta con scadenza corretta e costo intero scalato subito', async () => {
        const { sandbox, gs } = setupNoleggioEnv();
        gs.cash = 5000;
        gs.day = 10;
        const fleetBefore = gs.fleet.length;

        await sandbox._srmRent('nexus_h_line', 3);

        assert.equal(gs.fleet.length, fleetBefore + 1, 'la flotta deve avere un veicolo in più');
        const car = gs.fleet[gs.fleet.length - 1];
        assert.equal(car.vehicleClass, 'nexus_h_line');
        assert.equal(car.isRental, true, 'il veicolo deve essere marcato come noleggiato');
        assert.equal(car.rentalExpiresDay, 13, 'scade dopo esattamente N giorni');

        const prezzo = sandbox._srmRentPrice('nexus_h_line', 3);
        assert.ok(prezzo > 0, 'il prezzo del noleggio deve essere definito');
        assert.equal(gs.cash, 5000 - prezzo,
            'il costo va pagato SUBITO per intero (CE_money.spend), non a rate');
    });

    test('a scadenza il veicolo noleggiato esce dalla flotta e torna al concessionario', async () => {
        const { sandbox, gs } = setupNoleggioEnv();
        gs.cash = 20000;
        gs.day = 1;

        await sandbox._srmRent('nexus_h_line', 3);
        const rented = gs.fleet[gs.fleet.length - 1];
        assert.equal(gs.fleet.some(c => c.id === rented.id), true);

        gs.day = 3; // ultimo giorno: ancora in flotta
        sandbox.processDailyRoutines();
        assert.equal(gs.fleet.some(c => c.id === rented.id), true,
            'l\'ultimo giorno di noleggio l\'auto deve restare utilizzabile');

        gs.day = 4; // scaduta
        sandbox.processDailyRoutines();
        assert.equal(gs.fleet.some(c => c.id === rented.id), false,
            'alla scadenza il veicolo deve essere rimosso dalla flotta');
    });

    test('noleggio con fondi insufficienti: rifiutato senza toccare né cassa né flotta', async () => {
        const { sandbox, gs } = setupNoleggioEnv();
        gs.cash = 1000; // meno del noleggio più economico
        gs.day = 1;
        const fleetBefore = gs.fleet.length;
        const cashBefore = gs.cash;

        await sandbox._srmRent('nexus_h_line', 3);

        assert.equal(gs.fleet.length, fleetBefore, 'nessun veicolo deve essere aggiunto');
        assert.equal(gs.cash, cashBefore, 'nessun addebito se i fondi non bastano');
    });

    test('durata non tra quelle previste: rifiutata senza alcun addebito', async () => {
        const { sandbox, gs } = setupNoleggioEnv();
        gs.cash = 100000;
        gs.day = 1;
        const cashBefore = gs.cash;
        const fleetBefore = gs.fleet.length;

        await sandbox._srmRent('nexus_h_line', 4);

        assert.equal(gs.fleet.length, fleetBefore);
        assert.equal(gs.cash, cashBefore);
    });

    test('un\'auto noleggiata non si può vendere sul mercato P2P', async () => {
        const { sandbox, gs } = setupNoleggioEnv();
        gs.cash = 20000;
        gs.day = 1;

        await sandbox._srmRent('nexus_h_line', 7);
        const rented = gs.fleet[gs.fleet.length - 1];
        assert.equal(rented.isLease, true,
            'deve portare il flag isLease che le guardie di vendita già leggono');

        (sandbox.window || sandbox).currentUser = { id: 'u1' };
        await sandbox.p2pListCarForSale(rented.id, 9000);

        assert.equal(gs.fleet.some(c => c.id === rented.id), true,
            'il veicolo noleggiato non deve finire in vendita');
    });

    test('calibrazione prezzi: 3 giorni sotto i 5.000€, durate crescenti, lungo periodo più caro del comprare', () => {
        const { sandbox } = setupNoleggioEnv();

        for (const giorni of [3, 5, 7, 14, 30]) {
            const p = sandbox._srmRentPrice('nexus_h_line', giorni);
            assert.ok(Number.isFinite(p) && p > 0, `prezzo per ${giorni} giorni deve esistere`);
        }
        const p3  = sandbox._srmRentPrice('nexus_h_line', 3);
        const p30 = sandbox._srmRentPrice('nexus_h_line', 30);
        assert.ok(p3 <= 5000, `la durata più corta deve essere abbordabile col capitale iniziale (€${p3})`);
        assert.ok(p30 > p3, 'più giorni = più soldi');
        assert.ok(2 * p30 > PREZZO_NEXUS,
            'proiettato sul lungo periodo (2 cicli da 30gg) noleggiare deve costare più che comprare');
    });

    test('UI: accanto all\'acquisto compaiono le 5 durate di noleggio con il prezzo di ciascuna', () => {
        const { sandbox, gs } = setupNoleggioEnv();
        gs.cash = 100000;

        const overlay = sandbox.document.createElement('div');
        overlay.id = 'srm-overlay';
        sandbox.document.body.appendChild(overlay);
        sandbox.requestAnimationFrame = fn => { fn(); return 0; };

        sandbox.renderTabShowroom();
        sandbox._srmOpenConfig('nexus_h_line');
        sandbox._srmSetSection('riepilogo');

        const content = sandbox.document.getElementById('srm-cfg-content').innerHTML;
        assert.match(content, /Noleggia/, 'deve esserci un bottone/area Noleggia accanto all\'acquisto');
        for (const giorni of [3, 5, 7, 14, 30]) {
            assert.match(content, new RegExp(`${giorni}\\s*giorn`, 'i'),
                `manca la durata ${giorni} giorni nella UI di noleggio`);
        }
        const p3 = sandbox._srmRentPrice('nexus_h_line', 3);
        assert.match(content, new RegExp(p3.toLocaleString('it-IT').replace(/[.,]/g, '\\.')),
            'manca il prezzo della durata più corta nella UI');
    });
});
