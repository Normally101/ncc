'use strict';
/* ============================================================================
   L'HQ e' staccato dal gioco (decisione di Vlad, 19/08/2026).

   Motivo: `hqUpgradeRoom` scalava il denaro solo nel browser, senza dirlo al
   server. Siccome il valore del server vince al caricamento, il costo tornava
   indietro e la stanza restava costruita: upgrade gratis. Invece di sistemarlo
   di fretta lo si mette dietro un interruttore e lo si riaccende quando sara'
   convertito a CE_money.

   Questi test difendono le due proprieta' che rendono lo stacco sicuro:
   nessuna spesa possibile, e nessun effetto residuo sul resto del gioco.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

describe('hq — interruttore spento', () => {

    test('l\'interruttore e\' effettivamente spento', () => {
        const { sandbox } = freshEnv();
        assert.equal(sandbox.window.HQ_ENABLED, false,
            'config.js deve tenere HQ_ENABLED a false finche\' l\'HQ non e\' convertito a CE_money');
    });

    test('gli effetti dell\'HQ sono neutri anche con stanze gia\' costruite in un salvataggio vecchio', () => {
        // Un giocatore che aveva gia' costruito non deve continuare a ricevere bonus
        // da un sistema staccato: sarebbero effetti invisibili e non piu' manutenuti.
        const { sandbox } = freshEnv();
        sandbox.gameState.hqs = { roma: { rooms: { garage_main: 3 }, grid: {} } };
        const fx = sandbox.window.hqAllEffects();
        // Confronto per chiavi e non con deepEqual: l'oggetto nasce dentro la VM del
        // banco di prova, quindi ha un altro Object.prototype e il confronto stretto
        // fallirebbe pur essendo vuoto.
        assert.deepEqual(Object.keys(fx), [], 'a interruttore spento hqAllEffects deve tornare vuoto');
    });

    test('costruire una stanza non e\' possibile e non tocca il denaro', async () => {
        const { sandbox } = freshEnv();
        const gs = sandbox.gameState;
        gs.cash = 500000;
        gs.hqs = { roma: { rooms: {}, grid: new Array(12).fill(null) } };
        const prima = gs.cash;

        await sandbox.window.hqUpgradeRoom('roma', 'garage_main', 0);

        assert.equal(gs.cash, prima, 'a interruttore spento nessuna spesa deve partire');
        assert.deepEqual(gs.hqs.roma.rooms, {}, 'e nessuna stanza deve essere costruita');
    });

    test('hqGetEffect e\' stata rimossa: era codice morto', () => {
        // Definita ma mai chiamata da nessun file fuori da hq.js. Rimossa nel
        // giro di pulizia del 19/08/2026 (registro doppioni, Regola 4).
        const { sandbox } = freshEnv();
        assert.equal(typeof sandbox.window.hqGetEffect, 'undefined',
            'se qualcuno la reintroduce, va prima messa nel registro delle azioni');
    });

    test('la versione morta di hqOpenBuildModal in hq.js e\' stata rimossa', () => {
        // hq.js definiva una versione obsoleta di hqOpenBuildModal(roomId) mai chiamata
        // e sovrascritta da hq-visual.js (che usa cityId, slotIndex).
        // Caricando il modulo base hq.js senza il layer visuale, hqOpenBuildModal non deve esistere.
        const { sandbox } = freshEnv();
        assert.equal(typeof sandbox.window.hqOpenBuildModal, 'undefined',
            'hq.js non deve definire hqOpenBuildModal: la versione attiva e corretta e\' in hq-visual.js');
    });
});
