'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/showroom — l'autosalone: galleria, configuratore, acquisto, noleggio.

   Fase 3 di PIANO-CHIUSURA.md, sistema 4. Nove azioni, due sole muovono denaro:

   · `_srmPurchase` — compra il veicolo configurato. Online passa da
     `ServerState.buyVehicle` (la RPC scala la cassa sul server), offline da
     `CE_money.spend` + `syncCash`. In entrambi i casi il veicolo entra in flotta
     SOLO se il pagamento è andato a buon fine.
   · `_srmRent` — noleggio a breve termine. Il canone si paga SUBITO e per intero
     da `CE_money.spend`; non c'è passaggio dal server perché è un'auto che alla
     scadenza torna al concessionario (nessuna riga `vehicles` da creare).

   Le altre sette (`_srmOpenConfig`, `_srmBackToGallery`, `_srmClose`,
   `_srmFilterFuel`, `_srmFilterBrand`, `_srmSetSection`, `_srmToggle`) sono sola
   interfaccia: cambiano `_srmState` e ridisegnano l'overlay, e non devono toccare
   la cassa. Il configuratore ha un difetto storico che vale la pena difendere: il
   prezzo mostrato includeva gli optional ma la spesa addebitava il solo listino.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/showroom', () => {
    let env, sb, notifications, syncedCash;

    beforeEach(() => {
        syncedCash = [];
        env = freshEnv({
            serverState: {
                isReady: () => false,
                syncCash: async (v) => { syncedCash.push(v); return { success: true, cash: v }; },
            },
        });
        sb = env.sandbox;
        notifications = env.notifications;
        sb.showBigEvent = () => {};
        sb.showNotification = (msg, type) => notifications.push({ msg, type });
        // Overlay reale: senza `#srm-overlay` nel DOM le azioni di rendering
        // cadono su `renderTabShowroom`, che `freshEnv` stubba a no-op.
        const overlay = sb.document.createElement('div');
        overlay.id = 'srm-overlay';
        sb.document.body.appendChild(overlay);
        // L'animazione del prezzo va a target un frame per volta: eseguirla in
        // sincrono rende deterministica la lettura di `#srm-cfg-price`.
        sb.requestAnimationFrame = fn => { fn(); return 0; };
    });
    afterEach(() => env.stopAllIntervals());

    const gs        = () => sb.gameState;
    const srmState  = () => vm.runInContext('_srmState', sb);
    const overlayEl = () => sb.document.getElementById('srm-overlay');
    const errori    = () => notifications.filter(n => n.type === 'error').map(n => n.msg);
    const catalogo  = () => sb._srmCatalog();

    // ── Galleria e configuratore — sola interfaccia ──────────────────────────

    describe('galleria e configuratore (nessun denaro)', () => {

        test('_srmOpenConfig apre il configuratore sul veicolo scelto', () => {
            sb._srmOpenConfig('nexus_h_line');

            assert.equal(srmState().selectedId, 'nexus_h_line');
            assert.equal(srmState().view, 'config');
            assert.equal(srmState().section, 'generali');
            assert.equal(srmState().selectedOpts.size, 0, 'apre pulito, senza optional trascinati da prima');
            assert.ok(sb.document.getElementById('srm-config'), 'l\'overlay ora mostra il configuratore');
        });

        test('_srmSetSection cambia la sezione e ridisegna il contenuto', () => {
            sb._srmOpenConfig('nexus_h_line');

            sb._srmSetSection('riepilogo');

            assert.equal(srmState().section, 'riepilogo');
            assert.ok(sb.document.getElementById('srm-buy-btn'), 'il riepilogo porta il bottone Acquista');
        });

        test('_srmToggle aggiunge e toglie un optional e muove SOLO il prezzo mostrato', () => {
            sb._srmOpenConfig('stellar_e_exec');           // listino 120.000
            const cassaPrima = gs().cash;

            sb._srmToggle('opt_vernice_pearl');            // +4.000
            assert.ok(srmState().selectedOpts.has('opt_vernice_pearl'));
            assert.equal(sb._srmTotalPrice(), 124000, 'il totale include l\'optional appena scelto');

            sb._srmToggle('opt_vernice_pearl');            // di nuovo → lo toglie
            assert.equal(srmState().selectedOpts.has('opt_vernice_pearl'), false);
            assert.equal(sb._srmTotalPrice(), 120000, 'tolto l\'optional, si torna al listino');

            assert.equal(gs().cash, cassaPrima, 'configurare non tocca la cassa');
            assert.deepEqual(syncedCash, [], 'configurare non sincronizza col server');
        });

        test('_srmFilterFuel restringe la galleria al gruppo motore', () => {
            const soloElettriche = catalogo().filter(v => sb._srmFuelGroup(v) === 'electric').length;
            assert.ok(soloElettriche > 0 && soloElettriche < catalogo().length, 'il listino ha sia EV sia termiche');

            sb._srmFilterFuel('electric');

            assert.equal(srmState().filterFuel, 'electric');
            assert.equal(overlayEl().querySelectorAll('.srm-vcard').length, soloElettriche,
                'in galleria restano solo le elettriche');
        });

        test('_srmFilterBrand restringe la galleria al marchio', () => {
            const soloStellar = catalogo().filter(v => sb._srmBrand(v) === 'stellar').length;
            assert.ok(soloStellar > 0 && soloStellar < catalogo().length);

            sb._srmFilterBrand('stellar');

            assert.equal(srmState().filterBrand, 'stellar');
            assert.equal(overlayEl().querySelectorAll('.srm-vcard').length, soloStellar);
        });

        test('_srmBackToGallery torna alla galleria e azzera la scelta', () => {
            sb._srmOpenConfig('nexus_h_line');
            sb._srmToggle('opt_vernice_pearl');

            sb._srmBackToGallery();

            assert.equal(srmState().view, 'gallery');
            assert.equal(srmState().selectedId, null);
            assert.equal(srmState().selectedOpts.size, 0, 'gli optional non sopravvivono all\'uscita');
            assert.ok(overlayEl().querySelector('#srm-grid'), 'si rivede la griglia');
        });

        test('_srmClose smonta l\'overlay e ripristina il pannello principale', () => {
            const panel = sb.document.createElement('div');
            panel.id = 'main-panel';
            panel.style.display = 'none';
            sb.document.body.appendChild(panel);

            sb._srmClose();

            assert.equal(sb.document.getElementById('srm-overlay'), null, 'l\'overlay è stato rimosso');
            assert.equal(panel.style.display, '', 'il pannello di gioco torna visibile');
        });
    });

    // ── Acquisto ────────────────────────────────────────────────────────────

    describe('_srmPurchase — l\'acquisto', () => {

        test('compra: flotta +1 col veicolo giusto, cassa −totale, scelta azzerata', async () => {
            R.conSoldi(env, 300000);
            sb._srmOpenConfig('stellar_e_exec');           // 120.000
            const cassaPrima = gs().cash;
            const flottaPrima = gs().fleet.length;
            syncedCash.length = 0;                         // scarta il sync dell'iniezione del regista

            await sb._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.deepEqual(errori(), []);
            assert.equal(gs().fleet.length, flottaPrima + 1);
            const auto = gs().fleet[gs().fleet.length - 1];
            assert.equal(auto.vehicleClass, 'stellar_e_exec');
            assert.equal(auto.condition, 100);
            assert.equal(auto.isLease, false, 'un\'auto comprata è di proprietà');
            assert.equal(gs().cash, cassaPrima - 120000);
            assert.deepEqual(syncedCash, [cassaPrima - 120000], 'il server riceve il nuovo saldo');
            assert.equal(srmState().selectedOpts.size, 0);
            assert.equal(srmState().view, 'gallery', 'dopo l\'acquisto si torna alla galleria');
        });

        test('paga ESATTAMENTE il totale che il giocatore vede a schermo, optional inclusi', async () => {
            R.conSoldi(env, 500000);
            sb._srmOpenConfig('stellar_e_exec');           // base 120.000
            sb._srmToggle('opt_vernice_pearl');            // +4.000
            sb._srmToggle('opt_blindatura');              // +45.000
            sb._srmSetSection('riepilogo');

            const mostrato = parseInt(
                sb.document.getElementById('srm-cfg-price').textContent.replace(/[^\d]/g, ''), 10);
            const cassaPrima = gs().cash;
            syncedCash.length = 0;                         // scarta il sync dell'iniezione del regista

            await sb._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(mostrato, 120000 + 4000 + 45000);
            assert.equal(gs().cash, cassaPrima - mostrato, 'la spesa è il totale mostrato, non il solo listino');
            const auto = gs().fleet[gs().fleet.length - 1];
            assert.ok(auto.upgrades.includes('opt_vernice_pearl') && auto.upgrades.includes('opt_blindatura'),
                'gli optional scelti finiscono sull\'auto');
            assert.deepEqual(syncedCash, [cassaPrima - mostrato]);
        });

        test('fondi insufficienti: niente auto, cassa intatta, errore mostrato', async () => {
            R.conSoldi(env, 50000);                        // stellar_e_exec ne costa 120.000
            sb._srmOpenConfig('stellar_e_exec');
            const cassaPrima = gs().cash;
            const flottaPrima = gs().fleet.length;
            syncedCash.length = 0;                         // scarta il sync dell'iniezione del regista

            await sb._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(gs().cash, cassaPrima, 'ha pagato per un\'auto che non ha preso');
            assert.equal(gs().fleet.length, flottaPrima, 'nessuna auto aggiunta');
            assert.deepEqual(syncedCash, [], 'niente da sincronizzare');
            assert.ok(errori().some(m => /Fondi insufficienti/i.test(m)));
        });

        test('online: passa da ServerState.buyVehicle e marca il veicolo col _serverId', async () => {
            env.stopAllIntervals();
            env = freshEnv({ serverState: { isReady: () => true } });
            sb = env.sandbox;
            sb.showBigEvent = () => {};
            const overlay = sb.document.createElement('div');
            overlay.id = 'srm-overlay';
            sb.document.body.appendChild(overlay);
            sb.requestAnimationFrame = fn => { fn(); return 0; };
            sb.gameState.cash = 500000;

            sb._srmOpenConfig('stellar_e_exec');
            const prezzo = sb._srmTotalPrice();
            const cassaPrima = sb.gameState.cash;

            await sb._srmPurchase();
            await new Promise(r => setImmediate(r));

            assert.equal(sb.gameState.cash, cassaPrima - prezzo);
            const auto = sb.gameState.fleet[sb.gameState.fleet.length - 1];
            assert.ok(auto._serverId, 'il veicolo porta l\'id della riga creata dal server');
        });
    });

    // ── Noleggio ────────────────────────────────────────────────────────────

    describe('_srmRent — il noleggio a breve termine', () => {

        test('noleggia: paga subito il canone, l\'auto entra in flotta con la scadenza', async () => {
            R.conSoldi(env, 300000);
            const prezzo = sb._srmRentPrice('nexus_h_line', 7);   // 35.000 * 0,19 → 6.650
            assert.ok(prezzo > 0);
            const cassaPrima = gs().cash;
            const flottaPrima = gs().fleet.length;
            const giorno = gs().day;

            await sb._srmRent('nexus_h_line', 7);
            await new Promise(r => setImmediate(r));

            assert.equal(gs().cash, cassaPrima - prezzo, 'il canone si paga tutto e subito');
            assert.equal(gs().fleet.length, flottaPrima + 1);
            const auto = gs().fleet[gs().fleet.length - 1];
            assert.equal(auto.isRental, true);
            assert.equal(auto.rentalExpiresDay, giorno + 7);
            assert.equal(auto.dailyCost, 0, 'niente canone giornaliero: è già pagato');
        });

        test('l\'auto a noleggio è isLease:true — le guardie di vendita la bloccano', async () => {
            R.conSoldi(env, 300000);

            await sb._srmRent('nexus_h_line', 5);
            await new Promise(r => setImmediate(r));

            const auto = gs().fleet[gs().fleet.length - 1];
            assert.equal(auto.isLease, true,
                'senza questo flag un\'auto a noleggio si potrebbe rivendere sul mercato P2P');
        });

        test('il prezzo del noleggio segue la tabella durate (frazione del listino, a scaglioni di 50)', () => {
            const listino = sb._srmVehicle('nexus_h_line').price;   // 35.000
            assert.equal(sb._srmRentPrice('nexus_h_line', 3), Math.round((listino * 0.10) / 50) * 50);
            assert.equal(sb._srmRentPrice('nexus_h_line', 30), Math.round((listino * 0.55) / 50) * 50);
            assert.equal(sb._srmRentPrice('nexus_h_line', 99), 0, 'una durata fuori tabella non ha prezzo');
        });

        test('fondi insufficienti: nessuna auto, cassa intatta', async () => {
            R.conSoldi(env, 1000);                         // il noleggio più corto costa di più
            const cassaPrima = gs().cash;
            const flottaPrima = gs().fleet.length;

            await sb._srmRent('nexus_h_line', 3);
            await new Promise(r => setImmediate(r));

            assert.equal(gs().cash, cassaPrima);
            assert.equal(gs().fleet.length, flottaPrima, 'CE_money.spend ha rifiutato: niente auto');
        });
    });
});
