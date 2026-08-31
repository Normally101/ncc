'use strict';
/* ============================================================================
   test/funzioni/nemesi-percorsi-scoperti.test.js

   Primo test per i percorsi di nemesis.js / black_ops.js che NESSUN altro
   test esercita:
     - guardie offline: azioni chiamate quando window.supabaseClient manca;
     - bootstrap di gameState.vipNemeses alla prima _nemesisAddVip;
     - _nemesisTick senza lo stato vipNemeses;
     - _nemesisTick a livello 2 con cooldown scaduto NON deve più toccare
       supabaseClient (il finanziamento dei rivali è stato rimosso il 31/08,
       DOMANDE-PER-VLAD.md §7).
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
    // Finanziamento rivali rimosso — a livello 2 col cooldown scaduto non deve
    // succedere più nulla, nemmeno un tentativo di rete
    // ────────────────────────────────────────────────────────────────────────
    describe('_nemesisTick a livello 2 (ex _nemesisFundRival, rimossa il 31/08)', () => {
        test('nowHour ben oltre le 48h da lastFunded: nessun supabaseClient toccato, nessuna eccezione se manca del tutto', async () => {
            // nowHour = 77, lastFunded = 10 -> 67h di distanza: prima era sopra
            // il cooldown di 48h e faceva scattare il finanziamento.
            gs.day = 3;
            gs.hour = 5;
            gs.vipNemeses = {
                boss: { name: 'Grigori V.', level: 2, anger: 80, lastFunded: 10, reason: 'fallita' },
            };
            // sandbox.supabaseClient NON impostato apposta: se _nemesisTick
            // provasse ancora a chiamarlo, esploderebbe qui.
            gs.cash = 250000;

            assert.doesNotThrow(() => sandbox._nemesisTick());
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 250000, 'nessun movimento di cassa');
            assert.equal(gs.vipNemeses.boss.lastFunded, 10, 'lastFunded non lo aggiorna più nessuno');
            assert.equal(gs.vipNemeses.boss.level, 2, 'il livello resta comunque coerente (guerra aperta, solo narrativa)');
        });
    });
});
