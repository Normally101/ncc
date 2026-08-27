'use strict';
// COLLAUDO PROFONDO — comprare, assegnare e rivendere un'auto, dall'inizio alla fine.
//
// Non un test per funzione: qui si esercita il FLUSSO completo come lo vive un
// giocatore — compra dal salone (denaro dalla porta unica / RPC), assegna l'auto
// a un autista, poi la rivende — e si verifica che alla fine lo stato e i saldi
// siano coerenti: l'auto sparisce, l'autista resta libero e non con un
// riferimento orfano, e il denaro si è mosso una volta sola per verso.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('collaudo/auto — compra → assegna → vendi (end-to-end)', () => {
    test('il flusso intero lascia stato e saldi coerenti', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;

        // Un autista vero a cui assegnare l'auto (oltre al CEO che freshEnv già crea).
        gs.drivers.push({ id: 'd_luca', name: 'Luca', assignedCarId: null, status: 'idle' });
        gs.cash = 500000;

        // 1) COMPRA dal salone — la strada reale: apri il tab, scegli il modello, compra.
        sandbox.renderTabShowroom();
        sandbox._srmOpenConfig('stellar_e_exec');
        const prezzo = sandbox._srmTotalPrice();
        const cassaPrimaAcquisto = gs.cash;
        const flottaPrima = gs.fleet.length;

        await sandbox._srmPurchase();

        assert.equal(gs.cash, cassaPrimaAcquisto - prezzo,
            'comprare deve scalare esattamente il prezzo (porta unica), né più né meno');
        assert.equal(gs.fleet.length, flottaPrima + 1, "l'auto comprata deve entrare in flotta");
        const auto = gs.fleet[gs.fleet.length - 1];
        assert.ok(auto._serverId, "l'auto comprata deve avere un _serverId dalla RPC, non solo locale");

        // 2) ASSEGNA l'auto all'autista — la funzione reale del gioco.
        sandbox.assignCarToDriver(auto.id, 'd_luca');
        const luca = gs.drivers.find(d => d.id === 'd_luca');
        assert.equal(luca.assignedCarId, auto.id, "l'auto deve risultare assegnata all'autista");

        // 3) VENDI l'auto mentre è ancora assegnata — il caso che un test unitario non copre.
        const cassaPrimaVendita = gs.cash;
        await sandbox.sellCar(auto.id);

        // Il prezzo di vendita del gioco: 70% del baseValue × condizione.
        const baseValue = auto.tier === 'ultra' ? 180000 : (auto.tier === 'vip' ? 70000 : 35000);
        const ricavo = Math.floor(baseValue * ((auto.condition ?? 100) / 100) * 0.7);

        assert.equal(gs.cash, cassaPrimaVendita + ricavo,
            'vendere deve accreditare esattamente il ricavo (porta unica)');
        assert.ok(!gs.fleet.find(c => c.id === auto.id), "l'auto venduta deve sparire dalla flotta");
        assert.equal(luca.assignedCarId, null,
            "vendere un'auto assegnata deve LIBERARE l'autista, non lasciargli un riferimento a un'auto che non esiste più");

        // 4) Invariante di denaro sull'intero flusso: si è mosso solo per acquisto e vendita.
        assert.equal(gs.cash, 500000 - prezzo + ricavo,
            'il saldo finale deve essere spiegato solo da acquisto e vendita, senza movimenti fantasma');
    });

    test('non si può assegnare la stessa auto a due autisti insieme', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.drivers.push({ id: 'd_a', name: 'Anna', assignedCarId: null, status: 'idle' });
        gs.drivers.push({ id: 'd_b', name: 'Bruno', assignedCarId: null, status: 'idle' });
        gs.fleet.push({ id: 'c_x', _serverId: 's_x', name: 'X', tier: 'business', condition: 100, isLease: false });

        sandbox.assignCarToDriver('c_x', 'd_a');
        sandbox.assignCarToDriver('c_x', 'd_b'); // ruba l'auto ad Anna

        const anna = gs.drivers.find(d => d.id === 'd_a');
        const bruno = gs.drivers.find(d => d.id === 'd_b');
        assert.equal(bruno.assignedCarId, 'c_x', "l'auto deve risultare sul secondo autista");
        assert.equal(anna.assignedCarId, null,
            'la stessa auto non può restare assegnata a due autisti: il primo va liberato');
    });
});
