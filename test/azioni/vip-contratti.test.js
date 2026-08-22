'use strict';
/* ============================================================================
   test/azioni/vip-contratti.test.js — Banco di prova azioni contratti VIP
   (vip-clients.js: acceptVipEmiro, acceptVipErede, acceptVipGarante,
    acceptVipGrigori, acceptVipOnorevole, acceptVipPlatinum)

   Queste azioni sono "cieche" per il guardrail (vanno attivate preparando lo
   stato di gioco). Qui le rendiamo esercitabili e collaudiamo che:
   - se muovono denaro, l'importo è giusto e passa UNA volta sola da CE_money;
   - i rifiuti (requisiti mancanti, azione ripetuta) non muovono denaro.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('azioni VIP — contratti clienti VIP', () => {
    let env, sandbox, gs;

    // Flotta minima per l'Emiro: 4 veicoli lusso >=80%, disponibili
    function flottaEmiro() {
        gs.fleet = [
            { id: 'e1', vehicleClass: 'majestic_spirit', condition: 90, outOfService: null, isSeized: false },
            { id: 'e2', vehicleClass: 'stellar_s_imp', condition: 85, outOfService: null, isSeized: false },
            { id: 'e3', vehicleClass: 'volt_s_hyper', condition: 95, outOfService: null, isSeized: false },
            { id: 'e4', vehicleClass: 'stellar_g_over', condition: 85, outOfService: null, isSeized: false }
        ];
    }

    function pushEmail(id, tipo, price) {
        gs.emails.push({
            id, type: tipo, status: 'unread',
            vipData: { fromId: 'roma', toId: 'milano', price }
        });
        return id;
    }

    beforeEach(() => {
        env = freshEnv();
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        gs.unlockedRegions = ['lazio', 'lombardia', 'campania'];
        gs.cash = 50000;
        gs.reputation = 3.0;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('acceptVipEmiro — Royal Entourage', () => {
        test('rifiuta senza convoglio di 4 auto lusso: nessuna corsa creata', () => {
            const emailId = pushEmail(400, 'vip_emiro', 18000);
            gs.fleet = [
                { id: 'e1', vehicleClass: 'majestic_spirit', condition: 90, outOfService: null },
                { id: 'e2', vehicleClass: 'stellar_s_imp', condition: 85, outOfService: null },
                { id: 'e3', vehicleClass: 'volt_s_hyper', condition: 95, outOfService: null }
            ];

            sandbox.acceptVipEmiro(emailId);

            assert.equal(gs.pendingRides.length, 0);
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'unread');
        });

        test('accettazione crea la corsa ultra al prezzo dell\'email ed evita duplicati', () => {
            const emailId = pushEmail(401, 'vip_emiro', 18000);
            flottaEmiro();

            sandbox.acceptVipEmiro(emailId);

            assert.equal(gs.pendingRides.length, 1);
            const r = gs.pendingRides[0];
            assert.equal(r.vipClientId, 'emiro');
            assert.equal(r.tier, 'ultra');
            assert.equal(r.price, 18000);
            assert.equal(gs.emails.find(e => e.id === emailId).status, 'resolved');

            // Azione ripetuta due volte: l'email è già risolta, non deve creare un'altra corsa
            sandbox.acceptVipEmiro(emailId);
            assert.equal(gs.pendingRides.length, 1, 'doppia accettazione non deve duplicare la corsa');
        });
    });
});
