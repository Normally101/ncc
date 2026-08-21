'use strict';
/* ============================================================================
   test/guardrail/reputazione-porta-unica.test.js

   Regola: tutte le modifiche alla reputazione (incrementi, decrementi, tetto
   legato al prestigio, pavimento a zero) DEVONO passare da CE_money.addReputation.

   Verifiche:
   1. Nessun file di logica muta direttamente gameState.reputation con formule
      copiate a mano (Math.min(5.0 + prestige, ...), Math.max(0, ...), +=, -=).
   2. Tutte le strade di gioco che alterano la reputazione rispettano il tetto
      5.0 + prestigio e il pavimento 0.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');

const AUTORIZZATI = new Set(['money.js', 'serverState.js']);

// Inizializzazioni o ripristini ammessi (non transazioni di gioco che assegnano reputazione)
const RIGHE_CONSENTITE = new Map([
    // engine.js:
    ['engine.js:cash: 0, reputation: 0.0, energy: 100,', 'Template stato iniziale'],
    ['engine.js:gameState.reputation = 5.0;', 'Reset reputazione a soglia prestige in _checkPrestige / NG+'],
    ['engine.js:cash: legacyCash, reputation: legacyRep, energy: 100,', 'Inizializzazione NG+ legacyRep'],
    // saveSystem.js:
    ['saveSystem.js:reputation:    d.reputation  || 0,', 'Salvataggio/caricamento saveSystem'],
    ['saveSystem.js:rep:         d.reputation || 0,', 'Salvataggio/caricamento saveSystem'],
    ['saveSystem.js:reputation:   saveData.reputation || 0,', 'Salvataggio/caricamento saveSystem'],
]);

const MUTAZIONE_REP = /(?:gameState|gs|g)\.reputation\s*(?:[-+*/]?=)(?!=)/g;

function fileDiGioco() {
    return fs.readdirSync(ROOT)
        .filter(f => f.endsWith('.js') && f !== 'sw.js')
        .filter(f => fs.statSync(path.join(ROOT, f)).isFile());
}

function mutazioniIn(file) {
    const testo = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const righe = testo.split('\n');
    const trovate = [];
    righe.forEach((riga, i) => {
        const senzaCommento = riga.replace(/\/\/.*$/, '');
        MUTAZIONE_REP.lastIndex = 0;
        if (MUTAZIONE_REP.test(senzaCommento)) {
            const trimmed = riga.trim();
            if (RIGHE_CONSENTITE.has(`${file}:${trimmed}`)) return;
            trovate.push(`${file}:${i + 1}  ${trimmed}`);
        }
    });
    return trovate;
}

describe('guardrail — porta unica reputazione (CE_money.addReputation)', () => {

    test('nessun file di gioco modifica direttamente .reputation fuori da money.js', () => {
        const colpevoli = [];
        for (const f of fileDiGioco()) {
            if (AUTORIZZATI.has(f)) continue;
            colpevoli.push(...mutazioniIn(f));
        }
        assert.deepEqual(colpevoli, [],
            'Queste righe modificano la reputazione direttamente invece di usare CE_money.addReputation:\n' +
            colpevoli.join('\n'));
    });

    test('window.rest(5) non sfora il tetto massimo di reputazione quando prestige > 0', async () => {
        const env = freshEnv();
        const gs = env.sandbox.gameState;
        gs.prestige = 1.0;
        gs.reputation = 6.0; // Tetto massimo = 5.0 + 1.0 = 6.0
        gs.cash = 10000;

        await env.sandbox.rest(5);

        assert.equal(
            gs.reputation,
            6.0,
            'window.rest(5) con reputazione già al tetto (6.0) non deve superare il tetto (era += repGain senza cap)'
        );
    });

    test('marketing campaign rispetta il tetto con prestige > 0', () => {
        const env = freshEnv();
        const gs = env.sandbox.gameState;
        gs.prestige = 1.0;
        gs.reputation = 5.9;
        gs.cash = 500000;
        gs.brandVolume = 80;
        gs.brandPrestige = 80;

        env.sandbox._applyMarketingCampaign('camp_press_vip');

        assert.ok(gs.reputation <= 6.0, 'la reputazione non deve superare 6.0');
        assert.equal(Math.round(gs.reputation * 100) / 100, 6.0);
    });

    test('buyLifestyleAsset rispetta il tetto con prestige > 0', () => {
        const env = freshEnv();
        const gs = env.sandbox.gameState;
        gs.prestige = 1.0;
        gs.reputation = 5.8;
        gs.cash = 5000000;

        env.sandbox.buyLifestyleAsset('villa_olgiata');

        assert.ok(gs.reputation <= 6.0, 'la reputazione non deve superare 6.0');
        assert.equal(Math.round(gs.reputation * 100) / 100, 6.0);
    });

    test('saldo debito Vittorio saldato accredita reputazione rispettando il tetto', () => {
        const env = freshEnv();
        const gs = env.sandbox.gameState;
        gs.prestige = 1.0;
        gs.reputation = 5.8;
        gs.cash = 2000;

        const debt = env.sandbox._vittorioDebt();
        assert.ok(debt, 'debito presente');
        env.sandbox.repayVittorio(debt.outstanding);

        assert.equal(debt.status, 'repaid');
        assert.equal(Math.round(gs.reputation * 100) / 100, 6.0);
    });

    test('investimenti con bonus rep rispettano il tetto con prestige > 0', () => {
        const env = freshEnv();
        const gs = env.sandbox.gameState;
        gs.prestige = 1.0;
        gs.reputation = 5.85;
        gs.cash = 10000000;

        // Trova un investimento immediato con repBonus
        const invWithRep = env.sandbox.INVESTMENTS_CATALOG.find(i => i.rep && !i.buildTime);
        if (invWithRep) {
            env.sandbox.buyInvestment(invWithRep.id);
            assert.ok(gs.reputation <= 6.0);
        }
    });
});
