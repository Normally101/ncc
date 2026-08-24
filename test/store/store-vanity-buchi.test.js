'use strict';
/* ============================================================================
   test/store/store-vanity-buchi.test.js

   Ricognizione "negozio e vanita": le azioni dei tre file (engine-store.js,
   ui-store.js, vanity.js) risultano tutte gia' raggiunte da almeno un test
   (driver-coins-rpc, ui-store-sync, executive-pack-payment,
   store-realtime-echo, negozioDC, vanita, vanity-sync). Il buco sta nei
   PERCORSI che nessuno di quei test esercita:

     - _dcSimPurchase con RPC che RIGETTA (eccezione): ramo .catch mai provato
     - spendDC con risposta RPC null -> rollback _annullaMovimentoDC (via store)
     - _dcSpend con costo NaN: guardia Number.isFinite di money.js
     - skipConstruction con fondi insufficienti (il caso generico era testato
       solo su energyBoostDC)
     - skipAllAcademyDC con corso di autista inesistente (corso pagato e perso)
     - wakeDriverDC con id inesistente
     - _ecSwitchTab round-trip servizi -> acquista (mai asserta la direzione
       inversa)

   Le asserzioni sul movimento DC devono morire se la sincronizzazione col
   server viene tolta (CE_money.spendDC -> ServerState.spendDriverCoins).
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv, createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

function setupEnv(serverOverrides = {}) {
    const rpcSpendCalls = [];
    const env = freshEnv({
        serverState: {
            spendDriverCoins: async (motivo, n) => {
                rpcSpendCalls.push({ motivo, n });
                return { ok: true };
            },
            ...serverOverrides,
        },
    });
    const sandbox = env.sandbox;
    const gs = sandbox.gameState;
    // Spia sulla porta unica: ogni spesa DC deve passarci
    const ceSpendDCCalls = [];
    const origSpendDC = sandbox.CE_money.spendDC;
    sandbox.CE_money.spendDC = function (quantita, motivo) {
        ceSpendDCCalls.push({ quantita, motivo });
        return origSpendDC.apply(this, arguments);
    };
    return { env, sandbox, gs, rpcSpendCalls, ceSpendDCCalls };
}

describe('BUCI negozio/vanita — percorsi mai esercitati', () => {

    describe('_dcSimPurchase — RPC di pagamento che rigetta (ui-store.js)', () => {
        test('eccezione dalla RPC: nessun accredito, nessun minting, giocatore avvisato', async () => {
            const chiamateRPC = [];
            const env = freshEnv({
                serverState: {
                    purchaseDriverCoinPack: async (packId) => {
                        chiamateRPC.push({ packId });
                        throw new Error('rete giù');
                    },
                },
            });
            const sandbox = env.sandbox;
            const gs = sandbox.gameState;
            gs.driverCoins = 10;

            sandbox._dcSimPurchase('starter');
            await new Promise(r => setImmediate(r));

            assert.equal(chiamateRPC.length, 1, 'la RPC dedicata deve essere stata tentata');
            assert.equal(gs.driverCoins, 10, 'saldo intatto: nessun coin senza pagamento confermato');
            assert.ok(env.notifications.some(n => n.msg.includes('Pagamento non riuscito')),
                'il giocatore deve ricevere il messaggio di fallimento pagamento');
        });
    });

    describe('_dcSpend — guardie della porta unica (ui-store.js)', () => {
        test('sync tolta (RPC risponde null): addebito locale annullato dal rollback', async () => {
            // spendDC addebita in ottimistico e riallinea/rollba solo dalla risposta
            // della RPC: se il server non conferma, il saldo DEVE tornare indietro.
            const rpcRifiuta = [];
            const env = freshEnv({
                serverState: {
                    spendDriverCoins: async () => { rpcRifiuta.push(1); return null; },
                },
            });
            const gs = env.sandbox.gameState;
            gs.driverCoins = 50;
            gs.energy = 25;
            env.sandbox._dcSpend('energy_full', 10);
            await new Promise(r => setImmediate(r));
            assert.equal(rpcRifiuta.length, 1);
            assert.equal(gs.driverCoins, 50,
                'spesa rifiutata dal server: il saldo locale torna al valore di partenza');
            assert.equal(gs.energy, 100,
                "l'effetto resta applicato perche' spendDC aveva restituito true (comportamento attuale)");
        });

        test('costo NaN: money.js rifiuta, nessun addebito, nessun effetto, nessuna RPC', async () => {
            const { sandbox, gs, rpcSpendCalls } = setupEnv();
            gs.driverCoins = 50;
            gs.offlineLimit = 2;
            sandbox._dcSpend('offline_limit', NaN);
            await new Promise(r => setImmediate(r));
            assert.equal(gs.offlineLimit, 2, 'nessun upgrade con un costo non numerico');
            assert.equal(gs.driverCoins, 50, 'nessun addebito con un costo non numerico');
            assert.equal(rpcSpendCalls.length, 0, 'niente RPC per una spesa malformata');
        });
    });

    describe('engine-store — input degradati mai provati', () => {
        test('skipConstruction con fondi insufficienti: cantiere intatto, zero RPC', async () => {
            const { sandbox, gs, rpcSpendCalls, ceSpendDCCalls } = setupEnv();
            gs.driverCoins = 5; // servono 8
            gs.constructions = [{ invId: 'garage_londra' }];
            gs.investments = [];

            sandbox.skipConstruction('garage_londra');
            await new Promise(r => setImmediate(r));

            assert.equal(ceSpendDCCalls.length, 1, 'il tentativo passa comunque dalla porta unica');
            assert.equal(rpcSpendCalls.length, 0, 'fondi insufficienti: nessuna RPC');
            assert.equal(gs.constructions.length, 1, 'il cantiere NON viene completato');
            assert.deepEqual([...gs.investments], [], 'nessun investimento accreditato');
            assert.equal(gs.driverCoins, 5);
        });

        test('skipAllAcademyDC con corso di autista inesistente: corso perso ma pagato', async () => {
            const { sandbox, gs, rpcSpendCalls } = setupEnv();
            gs.driverCoins = 30;
            gs.drivers = [{ id: 'd1', name: 'Luca', skill_speed: 40, status: 'training' }];
            // 'ghost' non ha nessun autista associato: il corso viene consumato
            // senza applicare nulla, ma il costo lo conta lo stesso (comportamento
            // attuale, vedi RIEPILOGO).
            gs.driverAcademy = [
                { driverId: 'ghost', skill: 'driving', skillGain: 20 },
                { driverId: 'd1', skill: 'skill_speed', skillGain: 15 },
            ];

            sandbox.skipAllAcademyDC();
            await new Promise(r => setImmediate(r));

            // cost = 2 corsi * 5 = 10 DC, inclusa quella orfana
            assert.equal(rpcSpendCalls.length, 1);
            assert.equal(rpcSpendCalls[0].n, 10);
            assert.equal(gs.driverCoins, 20);
            assert.equal(gs.driverAcademy.length, 0, 'entrambi i corsi vengono consumati');
            assert.equal(gs.drivers[0].skill_speed, 55, 'il corso valido si applica comunque');
            assert.equal(gs.drivers[0].status, 'idle');
        });

        test('wakeDriverDC con id inesistente: no-op silenzioso senza spesa', async () => {
            const { sandbox, gs, rpcSpendCalls, ceSpendDCCalls } = setupEnv();
            gs.driverCoins = 20;
            gs.drivers = [{ id: 'd1', name: 'Luca', status: 'resting', restHoursLeft: 4, fatigue: 60 }];

            sandbox.wakeDriverDC('inesistente');
            await new Promise(r => setImmediate(r));

            assert.equal(ceSpendDCCalls.length, 0, 'nessun tentativo di spesa');
            assert.equal(rpcSpendCalls.length, 0);
            assert.equal(gs.drivers[0].status, 'resting', 'autista non toccato');
            assert.equal(gs.driverCoins, 20);
        });
    });

    describe('_ecSwitchTab — round-trip inverso (ui-store.js)', () => {
        test('da Servizi Esclusivi si torna ai pacchetti DC con il render vero', () => {
            const rEnv = createGameEnv(CORE_FILES, { render: true });
            try {
                rEnv.sandbox.initGame(true);
                rEnv.stopAllIntervals();

                const container = rEnv.sandbox.document.createElement('div');
                container.id = 'tab-container';
                rEnv.sandbox.document.body.appendChild(container);

                rEnv.sandbox._ecSwitchTab('services');
                assert.ok(container.innerHTML.includes('Pacchetto Operativo'),
                    'prima la vista servizi');

                rEnv.sandbox._ecSwitchTab('acquire');
                const html = container.innerHTML;
                assert.ok(html.includes('Starter Pack'), 'i pacchetti DC tornano visibili');
                assert.ok(!html.includes('Pacchetto Operativo'),
                    'la vista servizi non deve restare appesa dopo il ritorno');
            } finally {
                rEnv.stopAllIntervals();
            }
        });
    });
});
