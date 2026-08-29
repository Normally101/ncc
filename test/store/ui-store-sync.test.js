'use strict';
/* ============================================================================
   test/store/ui-store-sync.test.js

   Regressione per il bug economico in ui-store.js:
   tutte le funzioni di acquisto e spesa DC DEVONO passare da CE_money (spendDC / earnDC)
   e persistere la spesa autoritativa sul server tramite ServerState.spendDriverCoins / addDriverCoins.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupStoreEnv() {
    const rpcSpendCalls = [];
    const rpcAddCalls = [];
    const rpcPurchaseCalls = [];
    const ceSpendDCCalls = [];
    const ceEarnDCCalls = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                rpcSpendCalls.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            addDriverCoins: async (n, motivo) => {
                rpcAddCalls.push({ motivo, n });
                return { ok: true, driver_coins: env.sandbox.gameState.driverCoins };
            },
            /* rpc_purchase_dc_pack (65_executive_pack_server_purchase.sql):
               catalogo lato server, il client passa solo l'ID pacchetto. */
            purchaseDriverCoinPack: async (packId) => {
                rpcPurchaseCalls.push({ packId });
                const catalogo = { starter: 50, corporate: 220, offshore: 600, fondo_sovrano: 1300 };
                if (!catalogo[packId]) return { ok: false };
                const gs = env.sandbox.gameState;
                gs.driverCoins = (gs.driverCoins || 0) + catalogo[packId];
                return { ok: true, driver_coins: gs.driverCoins };
            },
        },
    });

    // Spia su CE_money per verificare che si passi dall'UNICA porta legale
    const origSpendDC = env.sandbox.CE_money.spendDC;
    env.sandbox.CE_money.spendDC = function (quantita, motivo) {
        ceSpendDCCalls.push({ quantita, motivo });
        return origSpendDC.apply(this, arguments);
    };

    const origEarnDC = env.sandbox.CE_money.earnDC;
    env.sandbox.CE_money.earnDC = function (quantita, motivo) {
        ceEarnDCCalls.push({ quantita, motivo });
        return origEarnDC.apply(this, arguments);
    };

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcSpendCalls,
        rpcAddCalls,
        rpcPurchaseCalls,
        ceSpendDCCalls,
        ceEarnDCCalls,
    };
}

describe('ui-store — sincronizzazione Driver Coins col server (CE_money)', () => {

    describe('_dcAcquistaPacchetto', () => {
        /* Il percorso d'acquisto e' cambiato il 29/08/2026: non piu' una RPC che
           accredita, ma una cassa Stripe. Quello che questi test difendono e'
           rimasto identico, ed e' l'unica cosa che conta — il browser non conia
           Driver Coins. La copertura completa del nuovo percorso sta in
           test/store/pagamenti-dc.test.js; qui resta il controllo che nessuna
           delle vecchie porte di conio si riapra. */
        test('l\'acquisto non passa mai da earnDC o addDriverCoins', async () => {
            const { sandbox, gs, ceEarnDCCalls, rpcAddCalls, rpcPurchaseCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            sandbox.window.supabaseClient = {
                auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
            };
            sandbox.window.fetch = async () => ({ ok: true, json: async () => ({ ok: true, url: 'https://checkout.stripe.com/x' }) });

            await sandbox._dcAcquistaPacchetto('starter');

            assert.equal(ceEarnDCCalls.length, 0, 'niente minting via earnDC');
            assert.equal(rpcAddCalls.length, 0, 'niente credito via addDriverCoins');
            assert.equal(rpcPurchaseCalls.length, 0, 'la vecchia RPC non esiste piu\' sul server');
            assert.equal(gs.driverCoins, 10, 'il saldo lo muove il webhook, non il browser');
        });

        test('pacchetto non valido: nessuna cassa aperta e saldo intatto', async () => {
            const { sandbox, gs, ceEarnDCCalls, rpcAddCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            let chiamate = 0;
            sandbox.window.supabaseClient = {
                auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
            };
            sandbox.window.fetch = async () => { chiamate++; return { ok: true, json: async () => ({}) }; };

            await sandbox._dcAcquistaPacchetto(-5);

            assert.equal(chiamate, 0);
            assert.equal(ceEarnDCCalls.length, 0);
            assert.equal(rpcAddCalls.length, 0);
            assert.equal(gs.driverCoins, 10);
        });
    });

    describe('_dcSpend', () => {
        test('offline_limit spende 20 DC tramite CE_money.spendDC e aggiorna offlineLimit', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            gs.offlineLimit = 2;
            sandbox._dcSpend('offline_limit', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 20);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 20);
            assert.equal(gs.offlineLimit, 4);
            assert.equal(gs.driverCoins, 30);
        });

        test('offline_limit al massimo (>= 12): non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            gs.offlineLimit = 12;
            sandbox._dcSpend('offline_limit', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 50);
        });

        test('auto_rest spende 30 DC tramite CE_money.spendDC e attiva autoRestEnabled', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            gs.autoRestEnabled = false;
            sandbox._dcSpend('auto_rest', 30);
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 30);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 30);
            assert.equal(gs.autoRestEnabled, true);
            assert.equal(gs.driverCoins, 20);
        });

        test('auto_rest già attivo: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            gs.autoRestEnabled = true;
            sandbox._dcSpend('auto_rest', 30);
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 50);
        });

        test('fondi DC insufficienti: non applica effetto e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.offlineLimit = 2;
            sandbox._dcSpend('offline_limit', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.offlineLimit, 2);
            assert.equal(gs.driverCoins, 10);
        });

        test('itemId non riconosciuto: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 50;
            sandbox._dcSpend('invalid_item', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 50);
        });
    });

    describe('_ecCaffeSospeso', () => {
        test('spende 10 DC tramite CE_money.spendDC e azzera lo stress del driver più stressato', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 90 },
                { id: 'd1', name: 'Mario', stress_level: 40 },
                { id: 'd2', name: 'Luigi', stress_level: 80, burnout_until: 5 },
            ];
            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 10);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 10);
            assert.equal(gs.drivers[2].stress_level, 0);
            assert.equal(gs.drivers[2].burnout_until, undefined);
            assert.equal(gs.drivers[1].stress_level, 40);
            assert.equal(gs.driverCoins, 10);
        });

        test('nessun autista esausto: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 20;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 90 },
                { id: 'd1', name: 'Mario', stress_level: 0 },
            ];
            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 20);
        });

        test('fondi DC insufficienti: non azzera stress e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 5;
            gs.drivers = [{ id: 'd1', name: 'Mario', stress_level: 60 }];
            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.drivers[0].stress_level, 60);
            assert.equal(gs.driverCoins, 5);
        });
    });

    describe('_ecManutenzioneExpress', () => {
        test('spende 25 DC tramite CE_money.spendDC e ripara il veicolo più danneggiato al 100%', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.fleet = [
                { id: 'c1', name: 'Berlina', condition: 80, fuel: 50 },
                { id: 'c2', name: 'Van', condition: 30, fuel: 20 },
            ];
            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 25);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 25);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(gs.fleet[0].condition, 80);
            assert.equal(gs.driverCoins, 5);
        });

        test('nessun veicolo danneggiato: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.fleet = [{ id: 'c1', condition: 100, fuel: 100 }];
            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 30);
        });

        test('fondi DC insufficienti: non ripara e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 10;
            gs.fleet = [{ id: 'c1', condition: 50, fuel: 50 }];
            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.fleet[0].condition, 50);
            assert.equal(gs.driverCoins, 10);
        });
    });

    describe('_ecTangenteSindacato', () => {
        test('spende 50 DC tramite CE_money.spendDC e imposta tangenteUntil a day + 1', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 60;
            gs.day = 5;
            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 50);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 50);
            assert.equal(gs.tangenteUntil, 6);
            assert.equal(gs.driverCoins, 10);
        });

        test('tangente già attiva: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 60;
            gs.day = 5;
            gs.tangenteUntil = 7;
            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.tangenteUntil, 7);
            assert.equal(gs.driverCoins, 60);
        });

        test('fondi DC insufficienti: non applica effetto e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 30;
            gs.day = 5;
            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.tangenteUntil, undefined);
            assert.equal(gs.driverCoins, 30);
        });
    });

    describe('_ecPolizzaKasko', () => {
        test('spende 150 DC tramite CE_money.spendDC e imposta tempKaskoExpiresDay a day + 7', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 200;
            gs.day = 10;
            gs.investments = [];
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 150);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 150);
            assert.equal(gs.tempKaskoExpiresDay, 17);
            assert.ok(gs.investments.includes('inv_kasko'));
            assert.equal(gs.driverCoins, 50);
        });

        test('kasko permanente attiva: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 200;
            gs.day = 10;
            gs.investments = ['inv_kasko'];
            gs.tempKaskoExpiresDay = 0;
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 200);
        });

        test('kasko temporanea ancora attiva: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 200;
            gs.day = 10;
            gs.tempKaskoExpiresDay = 15;
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 200);
        });

        test('fondi DC insufficienti: non attiva e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 100;
            gs.day = 10;
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.tempKaskoExpiresDay, undefined);
            assert.equal(gs.driverCoins, 100);
        });
    });

    describe('_ecRadarVip', () => {
        test('spende 200 DC tramite CE_money.spendDC e attiva il buff vip_queue', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 250;
            gs.day = 1;
            gs.hour = 12;
            gs.activeBuffs = [];
            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 200);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 200);
            assert.ok(gs.activeBuffs.some(b => b.type === 'vip_queue'));
            assert.equal(gs.driverCoins, 50);
        });

        test('radar VIP già attivo: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 250;
            gs.day = 1;
            gs.hour = 12;
            gs.activeBuffs = [{ id: 'radar_vip', type: 'vip_queue', until: 100 }];
            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 250);
        });

        test('fondi DC insufficienti: non attiva e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 100;
            gs.activeBuffs = [];
            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.activeBuffs.length, 0);
            assert.equal(gs.driverCoins, 100);
        });
    });

    describe('_ecTargaPresidenziale', () => {
        test('spende 500 DC tramite CE_money.spendDC e imposta hasPrestigiousPlate a true', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = false;
            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1, 'deve passare da CE_money.spendDC');
            assert.equal(ceSpendDCCalls[0].quantita, 500);
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 500);
            assert.equal(gs.hasPrestigiousPlate, true);
            assert.equal(gs.driverCoins, 100);
        });

        test('targa già posseduta: non spende DC e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = true;
            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 0);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.driverCoins, 600);
        });

        test('fondi DC insufficienti: non applica targa e non chiama RPC', async () => {
            const { sandbox, gs, ceSpendDCCalls, rpcSpendCalls } = setupStoreEnv();
            gs.driverCoins = 300;
            gs.hasPrestigiousPlate = false;
            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));
            assert.equal(ceSpendDCCalls.length, 1);
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.hasPrestigiousPlate, false);
            assert.equal(gs.driverCoins, 300);
        });
    });
});
