'use strict';
// BLOCCO 0 del bilanciamento — le cose che dicevano al giocatore il falso.
//
// Non sono questioni di equilibrio economico ma di fiducia: un gioco che promette
// una cifra e ne consegna un'altra, o che vende un oggetto che non fa niente,
// perde il giocatore molto prima di qualunque curva sbagliata.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshEnv } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');
const leggi = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('economia/onesta — il gioco non promette cio\' che non da\'', () => {
    test('l\'evento capitalismo mostra la cassa VERA, non una cifra scritta a mano', () => {
        const src = leggi('zero-to-hero.js');

        /* La cifra deve venire da gameState, non essere un numero nel testo.
           Si controlla il LEGAME, non la frase: la schermata e' stata riscritta
           il 30/08 col kit .em e la formulazione e' cambiata (ora la cifra e'
           anche formattata all'italiana), ma la promessa da difendere e'
           sempre la stessa. */
        assert.ok(/_cassa\s*=\s*Math\.round\(\(window\.gameState && window\.gameState\.cash\)/.test(src),
            'la cifra annunciata deve essere letta dalla cassa reale del giocatore');
        assert.ok(/\$\{_cassa[^}]*\}/.test(src),
            'e quella variabile deve finire nel testo mostrato');
        assert.ok(!/Hai\s*1?\d{2,}\s*€ in tasca/.test(src),
            'nessuna cifra fissa nel testo: la soglia e\' 6 corse, non le 10 su cui era tarato il vecchio «150€»');
    });

    test('a 6 corse manuali la cifra promessa coincide con la cassa', () => {
        const { sandbox, stopAllIntervals } = freshEnv();
        try {
            const gs = sandbox.gameState;
            gs.cash = 0;
            gs.energy = 100;
            gs.questStats = gs.questStats || {};
            gs.questStats.totalRides = 0;

            // Le 6 corse manuali dell'onboarding, per la strada vera del gioco.
            for (let i = 0; i < 6; i++) {
                gs.energy = 100;               // «dormi in auto», gratuito in survival
                sandbox.executeManualDrive();
            }

            // Il testo dell'overlay legge gameState.cash: qualunque sia la cifra,
            // deve essere QUELLA. Il difetto era che ne annunciava un'altra.
            assert.ok(gs.cash > 0, 'sei corse manuali devono aver prodotto denaro');
            assert.equal(gs.questStats.totalRides, 6,
                'la soglia dell\'evento capitalismo e\' 6 corse');
        } finally {
            stopAllIntervals();
        }
    });

    test('il negozio non vende piu\' il «Limite Offline», che non faceva nulla', () => {
        const store = leggi('ui-store.js');
        assert.ok(!/label:'Limite Offline/.test(store),
            'la voce non deve piu\' comparire nel catalogo del negozio');

        // Il motivo per cui e' stata tolta, blindato: nessun file di gioco legge
        // offlineLimit, quindi comprarlo non cambiava niente.
        const daControllare = ['engine.js', 'engine-daily.js', 'saveSystem.js'];
        for (const f of daControllare) {
            assert.ok(!/offlineLimit/.test(leggi(f)),
                `${f} non legge offlineLimit: se un giorno lo leggesse, la voce potrebbe tornare in vendita`);
        }
    });
});
