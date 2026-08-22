'use strict';
/* ============================================================================
   test/azioni/vip-contratti.test.js

   Azioni VIP del gruppo "contratti" in vip-clients.js, rese esercitabili:
   acceptVipEmiro, acceptVipErede, acceptVipGarante, acceptVipGrigori,
   acceptVipOnorevole, acceptVipPlatinum.

   Per ogni azione che muove denaro si verifica:
   - importo giusto, una volta sola;
   - passaggio da window.CE_money (mai gameState.cash -= diretto);
   - se la RPC ha già mosso il saldo lato server, nessuna risincronizzazione.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupVipEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, syncedCash };
}

// Flotta minima: n auto della classe richiesta, condizione 90, disponibili.
function addCars(gs, classes) {
    for (const vc of classes) {
        gs.fleet.push({
            id: gs.nextId++,
            name: `Auto-${vc}`,
            vehicleClass: vc,
            condition: 90,
            outOfService: false,
            isSeized: false,
        });
    }
}

function makeVipEmail(gs, type, price) {
    const email = {
        id: 9001,
        sender: 'Management VIP',
        subject: `VIP ${type}`,
        type,
        status: 'unread',
        vipData: { fromId: 'poi_a', toId: 'poi_b', price },
        expiresAt: gs.day * 24 + gs.hour + 6,
    };
    gs.emails.push(email);
    return email;
}

describe('azioni VIP — contratti (vip-clients.js)', () => {

    describe('acceptVipEmiro', () => {
        test('accettato: crea UNA corsa ultra al prezzo dell\'email e non muove cassa', () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            sandbox.POIS = { poi_a: { id: 'poi_a', name: 'Hotel Reale' }, poi_b: { id: 'poi_b', name: 'Aeroporto Privato' } };
            gs.cash = 10000;
            gs.fleet = [];
            addCars(gs, ['majestic_spirit', 'majestic_e_specter', 'stellar_s_imp', 'volt_s_hyper']);
            const email = makeVipEmail(gs, 'vip_emiro', 25000);

            sandbox.acceptVipEmiro(email.id);

            assert.equal(gs.pendingRides.length, 1, 'deve creare esattamente una corsa');
            assert.equal(gs.pendingRides[0].price, 25000, 'prezzo dalla email');
            assert.equal(syncedCash.length, 0, 'all’accettazione non serve denaro: nessuna sincronizzazione');
        });

        test('rifiutato: meno di 4 vetture pronte → nessuna corsa, nessun denaro', () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            sandbox.POIS = { poi_a: { id: 'poi_a', name: 'Hotel Reale' }, poi_b: { id: 'poi_b', name: 'Aeroporto Privato' } };
            gs.cash = 10000;
            gs.fleet = [];
            addCars(gs, ['majestic_spirit']); // solo 1
            const email = makeVipEmail(gs, 'vip_emiro', 25000);

            sandbox.acceptVipEmiro(email.id);

            assert.equal(gs.pendingRides.length, 0);
            assert.equal(gs.cash, 10000);
            assert.equal(syncedCash.length, 0);
        });

        test('bersaglio inesistente: email sconosciuta → nessuna corsa', () => {
            const { sandbox, gs } = setupVipEnv();
            sandbox.POIS = {};
            gs.cash = 10000;
            gs.fleet = [];
            addCars(gs, ['majestic_spirit', 'majestic_e_specter', 'stellar_s_imp', 'volt_s_hyper']);

            sandbox.acceptVipEmiro(424242);

            assert.equal(gs.pendingRides.length, 0);
        });

        test('completamento emiro: shopping bonus €5.000 UNA volta sola via CE_money (random < 0.30)', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 10000;
            const realRandom = Math.random;
            Math.random = () => 0.10; // sotto la soglia 0.30
            try {
                sandbox._vipCompleteEmiro({}, {}, 8000);
            } finally {
                Math.random = realRandom;
            }
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 15000, '+€5.000 shopping bonus');
            assert.deepEqual(syncedCash, [15000], 'il bonus deve transitare da CE_money e sincronizzare');
        });

        test('completamento emiro: senza shopping (random >= 0.30) la cassa resta ferma', async () => {
            const { sandbox, gs, syncedCash } = setupVipEnv();
            gs.cash = 10000;
            const realRandom = Math.random;
            Math.random = () => 0.99;
            try {
                sandbox._vipCompleteEmiro({}, {}, 8000);
            } finally {
                Math.random = realRandom;
            }
            await new Promise(r => setImmediate(r));
            assert.equal(gs.cash, 10000);
            assert.deepEqual(syncedCash, []);
        });
    });
});
