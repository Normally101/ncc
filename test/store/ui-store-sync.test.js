'use strict';
/* ============================================================================
   test/store/ui-store-sync.test.js

   Regressione per le funzioni del negozio / Executive Club in ui-store.js:
   tutte le funzioni di accredito o spesa Driver Coins DEVONO passare da CE_money
   (earnDC / spendDC) per sincronizzare il saldo autoritativo col server.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupUIStoreEnv(rispostaDC) {
    const chiamateRPC = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                chiamateRPC.push({ tipo: 'spend', motivo, n });
                return rispostaDC !== undefined ? rispostaDC : { ok: true };
            },
            addDriverCoins: async (n, motivo) => {
                chiamateRPC.push({ tipo: 'earn', motivo, n });
                return rispostaDC !== undefined ? rispostaDC : { ok: true };
            },
        },
    });
    return { env, sandbox: env.sandbox, gs: env.sandbox.gameState, chiamateRPC };
}

describe('ui-store — sincronizzazione Driver Coins col server (CE_money)', () => {

    describe('_dcSimPurchase', () => {
        test('accredita DC tramite CE_money.earnDC e chiama addDriverCoins', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 10;
            sandbox._dcSimPurchase(50);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 60);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].tipo, 'earn');
            assert.equal(chiamateRPC[0].n, 50);
        });

        test('si riallinea al saldo autoritativo restituito dal server', async () => {
            const { sandbox, gs } = setupUIStoreEnv({ ok: true, driver_coins: 500 });
            gs.driverCoins = 10;
            sandbox._dcSimPurchase(50);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 500, 'il saldo deve riallinearsi sul valore autoritativo del server');
        });

        test('importo non valido (NaN o <= 0) viene rifiutato senza chiamare il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 10;
            sandbox._dcSimPurchase(NaN);
            sandbox._dcSimPurchase(-5);
            sandbox._dcSimPurchase(0);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_dcSpend', () => {
        test('spende DC tramite CE_money.spendDC per offline_limit', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 50;
            gs.offlineLimit = 2;
            sandbox._dcSpend('offline_limit', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 30);
            assert.equal(gs.offlineLimit, 4);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].tipo, 'spend');
            assert.equal(chiamateRPC[0].motivo, 'offline_limit');
            assert.equal(chiamateRPC[0].n, 20);
        });

        test('spende DC tramite CE_money.spendDC per auto_rest', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 50;
            gs.autoRestEnabled = false;
            sandbox._dcSpend('auto_rest', 30);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.equal(gs.autoRestEnabled, true);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'auto_rest');
            assert.equal(chiamateRPC[0].n, 30);
        });

        test('chiamata senza costo non corrompe il saldo a NaN e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 50;
            sandbox._dcSpend('offline_limit');
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50, 'il saldo non deve diventare NaN');
            assert.equal(chiamateRPC.length, 0);
        });

        test('fondi insufficienti: non applica l\'effetto e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 5;
            gs.offlineLimit = 2;
            sandbox._dcSpend('offline_limit', 20);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.equal(gs.offlineLimit, 2);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_ecCaffeSospeso', () => {
        test('spende 10 DC tramite CE_money.spendDC e azzera stress del driver più esausto', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv({ ok: true, driver_coins: 40 });
            gs.driverCoins = 100;
            gs.drivers = [
                { id: 'ceo', name: 'CEO', stress_level: 90 },
                { id: 'd1', name: 'Mario', stress_level: 40, burnout_until: 5 },
                { id: 'd2', name: 'Luigi', stress_level: 80 },
            ];
            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 40, 'il saldo deve riallinearsi a 40 (server-authoritative)');
            assert.equal(gs.drivers[2].stress_level, 0, 'Luigi (il più stressato) deve avere stress 0');
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'caffe_sospeso');
            assert.equal(chiamateRPC[0].n, 10);
        });

        test('nessun autista esausto: non spende DC e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 50;
            gs.drivers = [
                { id: 'd1', name: 'Mario', stress_level: 0 },
            ];
            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50);
            assert.equal(chiamateRPC.length, 0);
        });

        test('DC insufficienti: non azzera stress e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 5;
            gs.drivers = [
                { id: 'd1', name: 'Mario', stress_level: 50 },
            ];
            sandbox._ecCaffeSospeso();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 5);
            assert.equal(gs.drivers[0].stress_level, 50);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_ecManutenzioneExpress', () => {
        test('spende 25 DC tramite CE_money.spendDC e ripara il veicolo più danneggiato', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv({ ok: true, driver_coins: 70 });
            gs.driverCoins = 100;
            gs.fleet = [
                { id: 'c1', name: 'Berlina', condition: 80, fuel: 50 },
                { id: 'c2', name: 'Van', condition: 30, fuel: 20 },
            ];
            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 70);
            assert.equal(gs.fleet[1].condition, 100);
            assert.equal(gs.fleet[1].fuel, 100);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'manutenzione_express');
            assert.equal(chiamateRPC[0].n, 25);
        });

        test('flotta al 100%: non spende DC e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 100;
            gs.fleet = [{ id: 'c1', condition: 100 }];
            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 100);
            assert.equal(chiamateRPC.length, 0);
        });

        test('DC insufficienti: non ripara e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 10;
            gs.fleet = [{ id: 'c1', condition: 50 }];
            sandbox._ecManutenzioneExpress();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 10);
            assert.equal(gs.fleet[0].condition, 50);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_ecTangenteSindacato', () => {
        test('spende 50 DC tramite CE_money.spendDC e imposta tangenteUntil', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv({ ok: true, driver_coins: 45 });
            gs.driverCoins = 100;
            gs.day = 5;
            gs.tangenteUntil = 0;
            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 45);
            assert.equal(gs.tangenteUntil, 6);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'tangente_sindacato');
            assert.equal(chiamateRPC[0].n, 50);
        });

        test('già protetto: non spende DC e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 100;
            gs.day = 5;
            gs.tangenteUntil = 7;
            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 100);
            assert.equal(chiamateRPC.length, 0);
        });

        test('DC insufficienti: non applica protezione e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 20;
            gs.day = 5;
            gs.tangenteUntil = 0;
            sandbox._ecTangenteSindacato();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 20);
            assert.equal(gs.tangenteUntil, 0);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_ecPolizzaKasko', () => {
        test('spende 150 DC tramite CE_money.spendDC e attiva kasko temporanea', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv({ ok: true, driver_coins: 40 });
            gs.driverCoins = 200;
            gs.day = 10;
            gs.investments = [];
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 40);
            assert.equal(gs.tempKaskoExpiresDay, 17);
            assert.ok(gs.investments.includes('inv_kasko'));
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'polizza_kasko');
            assert.equal(chiamateRPC[0].n, 150);
        });

        test('già attiva: non spende DC e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 200;
            gs.day = 10;
            gs.investments = ['inv_kasko'];
            gs.tempKaskoExpiresDay = 15;
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 200);
            assert.equal(chiamateRPC.length, 0);
        });

        test('DC insufficienti: non attiva kasko e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 50;
            gs.day = 10;
            gs.investments = [];
            sandbox._ecPolizzaKasko();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50);
            assert.equal(gs.tempKaskoExpiresDay, undefined);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_ecRadarVip', () => {
        test('spende 200 DC tramite CE_money.spendDC e attiva buff radar', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv({ ok: true, driver_coins: 90 });
            gs.driverCoins = 300;
            gs.day = 1;
            gs.hour = 0;
            gs.activeBuffs = [];
            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 90);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'radar_vip');
            assert.equal(chiamateRPC[0].n, 200);
        });

        test('già attivo: non spende DC e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 300;
            gs.day = 1;
            gs.hour = 0;
            gs.activeBuffs = [{ type: 'vip_queue', until: 500 }];
            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 300);
            assert.equal(chiamateRPC.length, 0);
        });

        test('DC insufficienti: non spende e non attiva buff', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 50;
            gs.day = 1;
            gs.hour = 0;
            gs.activeBuffs = [];
            sandbox._ecRadarVip();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 50);
            assert.equal(chiamateRPC.length, 0);
        });
    });

    describe('_ecTargaPresidenziale', () => {
        test('spende 500 DC tramite CE_money.spendDC e assegna la targa', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv({ ok: true, driver_coins: 90 });
            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = false;
            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 90);
            assert.equal(gs.hasPrestigiousPlate, true);
            assert.equal(chiamateRPC.length, 1);
            assert.equal(chiamateRPC[0].motivo, 'targa_presidenziale');
            assert.equal(chiamateRPC[0].n, 500);
        });

        test('già posseduta: non spende DC e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 600;
            gs.hasPrestigiousPlate = true;
            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 600);
            assert.equal(chiamateRPC.length, 0);
        });

        test('DC insufficienti: non assegna la targa e non chiama il server', async () => {
            const { sandbox, gs, chiamateRPC } = setupUIStoreEnv();
            gs.driverCoins = 100;
            gs.hasPrestigiousPlate = false;
            sandbox._ecTargaPresidenziale();
            await new Promise(r => setImmediate(r));
            assert.equal(gs.driverCoins, 100);
            assert.equal(gs.hasPrestigiousPlate, false);
            assert.equal(chiamateRPC.length, 0);
        });
    });
});
