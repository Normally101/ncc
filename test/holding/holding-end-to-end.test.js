'use strict';
/* ============================================================================
   test/holding/holding-end-to-end.test.js

   Collaudo END-TO-END del flusso completo "holding e i suoi dividendi":
     1. incorporateHolding (costa 200.000€, serve 4.0★)
     2. acquireSubsidiary (scala costo, aggiunge dailyIncome)
     3. processDailyRoutines (accredita dividendi via CE_money.earn)
     4. acquireSubsidiary (seconda sussidiaria)
     5. processDailyRoutines (dividendi somma di entrambe)
     6. divestSubsidiary (restituisce 60% del costo)
     7. processDailyRoutines (dividendi solo della rimanente)

   Il test DEVE ESSERE ROSSO se un passaggio del flusso è rotto:
   - denaro che si muove due volte
   - stato che non si aggiorna
   - addebito senza sincronizzazione col server (CE_money / RPC)
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function setupHoldingEnv() {
    const syncedCash = [];
    const env = freshEnv({
        serverState: {
            syncCash: async (v) => {
                syncedCash.push(v);
                return { success: true, cash: v };
            },
        },
    });
    const gs = env.sandbox.gameState;
    // Setup iniziale: reputation >= 4.0, cash sufficiente per tutto il flusso
    gs.reputation = 4.5;
    gs.cash = 1000000;
    return { env, sandbox: env.sandbox, gs, syncedCash };
}

describe('holding end-to-end — flusso completo incorpora → acquista → dividendi → cedi', () => {

    test('FLUSSO COMPLETO: incorpora → sub_fleet → dividendi → sub_hotel → dividendi → cedi sub_fleet → dividendi', async () => {
        const { env, sandbox, gs, syncedCash } = setupHoldingEnv();
        const logs = env.logs;

        // ── 1. INCORPORA HOLDING ────────────────────────────────────────
        // Costo: 200.000€
        sandbox.incorporateHolding();
        await new Promise(r => setImmediate(r));

        assert.equal(gs.holding?.incorporated, true, 'holding incorporata');
        assert.equal(gs.cash, 800000, 'cassa dopo incorporazione: 1.000.000 - 200.000 = 800.000');
        assert.deepEqual(syncedCash.slice(-1), [800000], 'syncCash chiamato con cassa post-incorporazione');

        // ── 2. ACQUISISCI sub_fleet (FleetPro Italia) ──────────────────
        // Costo: 150.000€, dailyIncome: 800€
        sandbox.acquireSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));

        assert.ok(Array.isArray(gs.holding.subsidiaries) && gs.holding.subsidiaries.includes('sub_fleet'), 'sub_fleet in portafoglio');
        assert.equal(gs.cash, 650000, 'cassa dopo sub_fleet: 800.000 - 150.000 = 650.000');
        assert.deepEqual(syncedCash.slice(-1), [650000], 'syncCash chiamato con cassa post-acquisto');

        // ── 3. PRIMO processDailyRoutines (giorno 1) → dividendi sub_fleet (800€) ──
        const cashPrimaGiorno1 = gs.cash;
        sandbox.processDailyRoutines();
        await new Promise(r => setImmediate(r));

        // Verifica che il dividendo holding sia STATO ACCREDITATO controllando il log
        const logDividendo1 = logs.find(l => l.includes('Holding: dividendi subsidiarie') && /800/.test(l));
        assert.ok(logDividendo1, 'log dividendo sub_fleet (800) presente: ' + logDividendo1);
        assert.notEqual(gs.cash, cashPrimaGiorno1, 'cassa mutata dopo processDailyRoutines');
        assert.deepEqual(syncedCash.slice(-1), [gs.cash], 'syncCash chiamato dopo processDailyRoutines');

        // Avanzamento giorno: processDailyRoutines si aspetta che gameState.day sia già incrementato
        gs.day++;

        // ── 4. ACQUISISCI sub_hotel (Grand Palace Hotel) ───────────────
        // Costo: 250.000€, dailyIncome: 1.500€
        sandbox.acquireSubsidiary('sub_hotel');
        await new Promise(r => setImmediate(r));

        assert.ok(Array.isArray(gs.holding.subsidiaries) && gs.holding.subsidiaries.includes('sub_fleet') && gs.holding.subsidiaries.includes('sub_hotel'), 'entrambe le sussidiarie in portafoglio');

        // ── 5. SECONDO processDailyRoutines (giorno 2) → dividendi sub_fleet + sub_hotel (2.300€) ──
        const cashPrimaGiorno2 = gs.cash;
        sandbox.processDailyRoutines();
        await new Promise(r => setImmediate(r));

        // Verifica dividendo combinato 800 + 1500 = 2300
        // locale ICU: può essere "2.300" o "2,300" o "2 300"
        const logDividendo2 = logs.find(l => l.includes('Holding: dividendi subsidiarie') && /2[.,\s]?300/.test(l));
        assert.ok(logDividendo2, 'log dividendi combinati (~2300) presente: ' + logDividendo2);
        assert.notEqual(gs.cash, cashPrimaGiorno2, 'cassa mutata dopo secondo processDailyRoutines');
        assert.deepEqual(syncedCash.slice(-1), [gs.cash], 'syncCash chiamato dopo secondo processDailyRoutines');

        // ── 6. CEDI sub_fleet ──────────────────────────────────────────
        // Resale: 60% di 150.000 = 90.000€
        const cashPrimaCessione = gs.cash;
        sandbox.divestSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));

        assert.ok(Array.isArray(gs.holding.subsidiaries) && gs.holding.subsidiaries.includes('sub_hotel') && !gs.holding.subsidiaries.includes('sub_fleet'), 'sub_fleet rimossa, sub_hotel resta');
        assert.equal(gs.cash, cashPrimaCessione + 90000, 'cessione accredita 60%: +90.000€');
        assert.deepEqual(syncedCash.slice(-1), [gs.cash], 'syncCash chiamato dopo cessione');

        // Avanzamento giorno per il terzo processDailyRoutines
        gs.day++;

        // ── 7. TERZO processDailyRoutines (giorno 3) → dividendi solo sub_hotel (1.500€) ──
        const cashPrimaGiorno3 = gs.cash;
        sandbox.processDailyRoutines();
        await new Promise(r => setImmediate(r));

        const logDividendo3 = logs.find(l => l.includes('Holding: dividendi subsidiarie') && /1[.,\s]?500/.test(l));
        assert.ok(logDividendo3, 'log dividendo solo sub_hotel (1500) presente: ' + logDividendo3);
        assert.notEqual(gs.cash, cashPrimaGiorno3, 'cassa mutata dopo terzo processDailyRoutines');
        assert.deepEqual(syncedCash.slice(-1), [gs.cash], 'syncCash chiamato dopo terzo processDailyRoutines');
    });

    test('acquisto sussidiaria con fondi insufficienti NON modifica stato né chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupHoldingEnv();
        gs.reputation = 4.5;
        gs.cash = 100000; // meno di 200.000 per holding + 150.000 per sub
        sandbox.incorporateHolding();
        await new Promise(r => setImmediate(r));
        assert.equal(gs.holding?.incorporated, false);
        assert.equal(gs.cash, 100000);

        // Forza incorporazione per testare acquire con fondi insufficienti
        gs.holding = { incorporated: true, subsidiaries: [] };
        gs.cash = 50000; // meno di 150.000
        sandbox.acquireSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));

        assert.deepEqual(gs.holding.subsidiaries, [], 'nessuna sussidiaria aggiunta');
        assert.equal(gs.cash, 50000, 'cassa invariata');
        assert.deepEqual(syncedCash, [], 'syncCash NON chiamato per acquisto fallito');
    });

    test('cessione sussidiaria non posseduta NON accredita né chiama syncCash', async () => {
        const { sandbox, gs, syncedCash } = setupHoldingEnv();
        gs.holding = { incorporated: true, subsidiaries: ['sub_hotel'] };
        gs.cash = 100000;
        sandbox.divestSubsidiary('sub_fleet'); // non posseduta
        await new Promise(r => setImmediate(r));

        assert.deepEqual(gs.holding.subsidiaries, ['sub_hotel'], 'portafoglio invariato');
        assert.equal(gs.cash, 100000, 'cassa invariata');
        assert.deepEqual(syncedCash, [], 'syncCash NON chiamato per cessione fallita');
    });

    test('dividendi NON pagati due volte nello stesso giorno', async () => {
        const { sandbox, gs, syncedCash, env } = setupHoldingEnv();
        gs.reputation = 4.5;
        gs.cash = 1000000;
        sandbox.incorporateHolding();
        await new Promise(r => setImmediate(r));
        sandbox.acquireSubsidiary('sub_fleet');
        await new Promise(r => setImmediate(r));

        // Primo processDailyRoutines
        sandbox.processDailyRoutines();
        await new Promise(r => setImmediate(r));
        const cashDopoPrimo = gs.cash;

        // Secondo processDailyRoutines nello STESSO giorno (gameState.day non cambia)
        // Con la guardia, il dividendo NON deve essere pagato una seconda volta
        sandbox.processDailyRoutines();
        await new Promise(r => setImmediate(r));

        // Il dividendo holding (800) NON deve essere accreditato una seconda volta
        // La cassa può cambiare per altre voci (tasse, stipendi, ecc.) ma non per il dividendo holding bis
        // Verifichiamo che il log "già pagati oggi" sia presente
        const logGiàPagati = env.logs.find(l => l.includes('dividendi già pagati oggi'));
        assert.ok(logGiàPagati, 'log "dividendi già pagati oggi" presente: ' + logGiàPagati);
    });

});