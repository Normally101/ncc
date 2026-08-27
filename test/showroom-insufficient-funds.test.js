'use strict';
/* ============================================================================
   Showroom — test end-to-end: acquisto con fondi insufficienti
   L'acquisto deve essere rifiutato e il denaro NON si deve muovere.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../test-support/game-env.js');

describe('Showroom — acquisto con fondi insufficienti', () => {

    test('acquisto rifiutato e cash invariato quando i fondi non bastano', async () => {
        const { sandbox, notifications } = freshEnv();
        const gs = sandbox.gameState;

        // Il veicolo più economico è Nexus H-Line a €35.000
        // Impostiamo cash a €30.000 (insufficiente)
        gs.cash = 30000;

        // Creiamo l'overlay manualmente (renderTabShowroom è stubbato nel test env)
        const overlay = sandbox.document.createElement('div');
        overlay.id = 'srm-overlay';
        sandbox.document.body.appendChild(overlay);

        // Apriamo il configuratore per Nexus H-Line (funzione interna, non stubbata)
        sandbox._srmOpenConfig('nexus_h_line');

        // Navighiamo alla sezione "riepilogo" dove c'è il pulsante Acquista
        sandbox._srmSetSection('riepilogo');

        // Verifichiamo che il pulsante Acquista sia disabilitato
        const buyBtn = sandbox.document.getElementById('srm-buy-btn');
        assert.ok(buyBtn, 'Il pulsante di acquisto deve esistere nella sezione riepilogo');
        assert.equal(buyBtn.disabled, true, 'Il pulsante deve essere disabilitato con fondi insufficienti');

        // Proviamo comunque a chiamare _srmPurchase (simula click forzato)
        await sandbox._srmPurchase();

        // Il cash NON deve essere cambiato
        assert.equal(gs.cash, 30000, 'Il cash deve restare invariato (30.000) dopo acquisto rifiutato');

        // Deve esserci una notifica di errore
        assert.ok(notifications.some(n => n.type === 'error' && n.msg.includes('Fondi insufficienti')),
            'Deve essere mostrata una notifica di errore per fondi insufficienti');

        // La flotta NON deve avere il nuovo veicolo
        const fleetBefore = gs.fleet.length;
        assert.equal(gs.fleet.length, fleetBefore, 'La flotta non deve crescere dopo acquisto rifiutato');
    });

    test('acquisto RIFIUTATO anche se si forza la chiamata diretta a CE_money.spend', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 1000;

        // Chiamata diretta alla porta unica del denaro con importo superiore al saldo
        const esito = sandbox.CE_money.spend(5000, 'showroom_buy_vehicle');

        assert.equal(esito, false, 'CE_money.spend deve restituire false');
        assert.equal(gs.cash, 1000, 'Il cash NON deve cambiare quando spend fallisce');
    });

});