'use strict';
/* ============================================================================
   test/funzioni/nemesi-percorsi-scoperti.test.js

   Primo test per i percorsi di nemesis.js / black_ops.js che NESSUN altro
   test esercita:
     - guardie offline: azioni chiamate quando window.supabaseClient manca;
     - bootstrap di gameState.vipNemeses alla prima _nemesisAddVip;
     - _nemesisTick senza lo stato vipNemeses;
     - _nemesisFundRival nei suoi percorsi di fallimento (leaderboard vuota,
       RPC in errore): nessun effetto locale deve essere applicato.
   Nessuna di queste azioni muove denaro: qui si verifica l'effetto principale
   sullo stato (le azioni con movimenti di cassa sono coperte da
   test/events/nemesis-sync.test.js, test/events/black-ops-sync.test.js,
   test/azioni/ombra.test.js e test/funzioni/nemesi.test.js).
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('nemesi & agenzia ombra — percorsi mai esercitati', () => {
    let env, sandbox, gs;

    beforeEach(() => {
        env = freshEnv();
        sandbox = env.sandbox;
        gs = sandbox.gameState;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    // ────────────────────────────────────────────────────────────────────────
    // Bootstrap dello stato: la PRIMA nemesi della partita nasce senza mappa
    // ────────────────────────────────────────────────────────────────────────
    describe('bootstrap (_nemesisAddVip)', () => {
        test('la prima _nemesisAddVip crea gameState.vipNemeses se assente', () => {
            delete gs.vipNemeses; // nuova partita che non ha mai deluso un VIP

            sandbox._nemesisAddVip('vip_primo', 'Il Primo Deluso', 'scaduta');

            assert.ok(gs.vipNemeses, 'vipNemeses deve essere inizializzato al primo utilizzo');
            assert.equal(gs.vipNemeses.vip_primo.name, 'Il Primo Deluso');
            assert.equal(gs.vipNemeses.vip_primo.anger, 30);
            assert.equal(gs.vipNemeses.vip_primo.level, 1);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // Guardie offline: nessun supabaseClient (giocatore non connesso)
    // ────────────────────────────────────────────────────────────────────────
    describe('guardie offline (nessun supabaseClient)', () => {
        test('shadowExecuteOp senza supabaseClient: cassa intatta, nessuna notifica, nessun crash', async () => {
            gs.cash = 100000;
            sandbox._shadowState.targets = [{ user_id: 't1', name: 'Rivale SpA' }];
            // NB: sandbox.supabaseClient NON viene impostato in questo beforeEach

            await sandbox.shadowExecuteOp('t1', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000, 'senza connessione nessun costo deve essere scalato');
            assert.equal(env.notifications.length, 0, 'nessuna notifica di successo/fallimento');
        });

        test('shadowRefresh senza supabaseClient: non esplode e preserva i dati già caricati', async () => {
            sandbox._shadowState.targets = [{ user_id: 't1', name: 'Cache Vecchia' }];
            sandbox._shadowState.log = [{ op_type: 'spy_fleet', success: true }];

            await sandbox.shadowRefresh(true);

            assert.equal(sandbox._shadowState.targets.length, 1, 'target in cache non devono essere svuotati');
            assert.equal(sandbox._shadowState.targets[0].name, 'Cache Vecchia');
            assert.equal(sandbox._shadowState.log.length, 1);
        });

        test('_nemesisTick senza gameState.vipNemeses: ritorna senza creare stato né crashare', () => {
            delete gs.vipNemeses;

            assert.doesNotThrow(() => sandbox._nemesisTick());
            assert.equal(gs.vipNemeses, undefined, 'il tick non deve creare vipNemeses dal nulla');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // _nemesisFundRival — percorsi di fallimento raggiunti tramite _nemesisTick
    // ────────────────────────────────────────────────────────────────────────
    describe('_nemesisFundRival — percorsi di fallimento (via _nemesisTick)', () => {
        function nemesePronta() {
            // nowHour = 77, lastFunded = 10 -> 67h di distanza: sopra il cooldown di 48h
            gs.day = 3;
            gs.hour = 5;
            gs.vipNemeses = {
                boss: { name: 'Grigori V.', level: 2, anger: 80, lastFunded: 10, reason: 'fallita' },
            };
        }

        test('RPC in errore (es. rpc_nemesis_fund_rival revocata): NESSUN effetto locale', async () => {
            nemesePronta();
            sandbox.supabaseClient = {
                from: () => ({
                    select: () => ({
                        neq: () => ({ order: () => ({ limit: async () => ({ data: [{ user_id: 'r_1', company_name: 'Apex Chauffeur' }], error: null }) }) }),
                    }),
                }),
                rpc: async (name) => {
                    if (name === 'rpc_nemesis_fund_rival') {
                        // Supabase NON lancia: restituisce l'errore nell'oggetto risposta
                        return { data: null, error: { message: 'RPC revocata dal server' } };
                    }
                    return { data: {}, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;
            gs.cash = 250000;

            sandbox._nemesisTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 250000, 'il finanziamento non muove cassa locale');
            assert.equal(gs.vipNemeses.boss.lastFunded, 10,
                'lastFunded NON deve aggiornarsi se il server ha rifiutato: altrimenti il cooldown riparte senza che nulla sia successo');
            assert.ok(!env.notifications.some(n => n.msg.includes('ha finanziato')),
                'nessuna notifica di finanziamento andato a buon fine');
        });

        test('leaderboard vuota: nessuna RPC di finanziamento e lastFunded invariato', async () => {
            nemesePronta();
            sandbox.supabaseClient = {
                from: () => ({
                    select: () => ({
                        neq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
                    }),
                }),
                rpc: async (name, params) => {
                    if (name === 'rpc_nemesis_fund_rival') {
                        throw new Error('non deve essere chiamata senza rivali');
                    }
                    return { data: {}, error: null };
                },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            sandbox._nemesisTick();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.vipNemeses.boss.lastFunded, 10, 'senza rivali il cooldown non si deve azzerare');
        });
    });
});
