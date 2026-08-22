'use strict';
/* ============================================================================
   Il tetto della reputazione — una funzione sola: window.CE_reputationCap.

   Il tetto è `5.0 + prestigio`, NON `5`: chi ha fatto prestigio deve poter
   superare le 5 stelle. L'espressione era copiata a mano in ~24 punti del
   gioco e le copie NON erano tutte uguali (daily-orders.js:157 scriveva
   Math.min(5, …) e bloccava in silenzio chi aveva prestigio).
   Da oggi il calcolo sta una volta sola in CE_reputationCap; questo file
   verifica sia la funzione sia che nessuna nuova copia rinasca.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

describe('CE_reputationCap — il tetto in una funzione sola', () => {

    test('esiste come globale ed è calcolata dal prestigio', () => {
        const { sandbox } = freshEnv();
        assert.equal(typeof sandbox.CE_reputationCap, 'function',
            'window.CE_reputationCap deve esistere ed essere una funzione');
    });

    test('prestigio 2 → tetto 7: un giocatore con prestigio supera le 5 stelle', () => {
        const { sandbox } = freshEnv();
        assert.equal(sandbox.CE_reputationCap(2), 7.0);
    });

    test('senza prestigio il tetto resta 5', () => {
        const { sandbox } = freshEnv();
        assert.equal(sandbox.CE_reputationCap(0), 5.0);
        assert.equal(sandbox.CE_reputationCap(undefined), 5.0, 'prestige mancante non deve rompere il calcolo');
        assert.equal(sandbox.CE_reputationCap('robba'), 5.0, 'prestige non numerico vale 0');
    });
});

/* ── GUARDRAIL anti-copia ─────────────────────────────────────────────────
   Impedisce alla venticinquesima copia di nascere: nessun file di gioco può
   più scrivere `Math.min(5, …)` / `Math.min(5.0, …)` su una riga che tocca
   la reputazione. Il tetto si USA (CE_reputationCap) o si passa da
   CE_money.addReputation, non si ricopia.
   Esclusioni: i test stessi e l'ambiente di supporto. */
describe('guardrail — il tetto non si ricopia', () => {
    // Ancora su "5," o "5)" o "5.0," ma NON su "50," (Math.min(50, …) è altro).
    const COPIA_TETTO = /Math\.min\(\s*5(?:\.0)?\s*[,)]/;

    test('nessun file di gioco limita la reputazione con un Math.min(5…) scritto a mano', () => {
        const root = path.resolve(__dirname, '..', '..');
        const violazioni = [];
        const visita = (dir) => {
            for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
                if (voce.name === 'node_modules' || voce.name.startsWith('.')) continue;
                const pieno = path.join(dir, voce.name);
                if (voce.isDirectory()) { visita(pieno); continue; }
                if (!voce.name.endsWith('.js')) continue;
                const relativo = path.relative(root, pieno);
                if (relativo.startsWith('test') || relativo.startsWith('test-support')) continue;
                const righe = fs.readFileSync(pieno, 'utf8').split('\n');
                righe.forEach((riga, i) => {
                    if (COPIA_TETTO.test(riga) && /\breputation\b/.test(riga)) {
                        violazioni.push(`${relativo}:${i + 1} → ${riga.trim()}`);
                    }
                });
            }
        };
        visita(root);
        assert.deepEqual(violazioni, [],
            'trovate copie scritte a mano del tetto reputazione: usa window.CE_reputationCap\n' +
            violazioni.join('\n'));
    });
});
