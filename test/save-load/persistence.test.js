'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// NOTA IMPORTANTE (onestà sulla copertura): saveCurrentSlot() (saveSystem.js) scrive SOLO
// su Supabase (`_cloudSaveSlot` — "Cloud is the single source of truth — no localStorage
// write") e no-oppa silenziosamente senza window.currentUser/window.supabaseClient reali.
// loadGame() (engine.js) invece legge SOLO da localStorage. Sono due metà dello stesso
// sistema che in produzione si incontrano via Supabase — non riproducibile fedelmente senza
// un vero backend. Qui testiamo le due metà SEPARATAMENTE con un mock minimo di
// supabaseClient (verifica cosa verrebbe salvato) e localStorage (verifica cosa viene
// ripristinato) — NON un vero round-trip cloud. Il round-trip reale resta NON VERIFICATO
// da questo ambiente headless (serve Playwright + Supabase reale, Livello 4 di QA_PLAN.md).

function withMockSupabase(sandbox) {
    let savedPayload = null;
    sandbox.currentUser = { id: 'test-user-id', email: 'test@example.com' };
    sandbox.window.currentSlotIndex = 0;
    sandbox.supabaseClient = {
        from: (table) => ({
            upsert: async (payload) => {
                if (table === 'game_saves') savedPayload = payload;
                return { error: null };
            },
        }),
    };
    sandbox.window.supabaseClient = sandbox.supabaseClient;
    return () => savedPayload;
}

describe('save-load/persistence — salvataggio e ripristino', () => {
    test('saveGame() serializza correttamente cash/flotta/dipendenti/giorno nel payload cloud', () => {
        const { sandbox } = freshEnv();
        const getSaved = withMockSupabase(sandbox);
        sandbox.gameState.cash = 42000;
        sandbox.gameState.day = 7;
        sandbox.gameState.fleet.push({ id: 'c_extra', name: 'Extra', tier: 'business', condition: 90, isLease: false });
        sandbox.gameState.drivers.push({ id: 'd_extra', name: 'Extra Driver', status: 'idle', queue: [] });

        sandbox.saveGame();

        const saved = getSaved();
        assert.ok(saved, 'saveGame deve produrre un payload verso game_saves');
        assert.equal(saved.game_state.cash, 42000, 'il cash salvato deve corrispondere a quello corrente');
        assert.equal(saved.game_state.day, 7, 'il giorno salvato deve corrispondere');
        assert.equal(saved.game_state.fleet.length, sandbox.gameState.fleet.length, 'la flotta salvata deve corrispondere');
        assert.equal(saved.game_state.drivers.length, sandbox.gameState.drivers.length, 'i dipendenti salvati devono corrispondere');
    });

    test('saveGame() forza il cash a intero (evita errori di cast bigint lato SQL)', () => {
        const { sandbox } = freshEnv();
        const getSaved = withMockSupabase(sandbox);
        sandbox.gameState.cash = 1234.789;

        sandbox.saveGame();

        assert.equal(getSaved().game_state.cash, 1234, 'il cash salvato deve essere troncato a intero');
    });

    test('loadGame() ripristina cash/flotta/dipendenti/giorno da un salvataggio esistente', () => {
        const { sandbox } = freshEnv();
        const fakeSave = {
            ...sandbox.gameState,
            cash: 88000, day: 12, reputation: 3.2,
            fleet: [{ id: 'c_saved', name: 'Salvata', tier: 'vip', condition: 75, isLease: false }],
            drivers: [{ id: 'd_saved', name: 'Autista Salvato', status: 'busy', queue: [] }],
        };
        sandbox.window.currentSlotIndex = null; // forza il fallback alla chiave legacy, vedi loadGame()
        sandbox.localStorage.setItem('chauffeurEmpireSave_v2', JSON.stringify(fakeSave));

        const ok = sandbox.loadGame();

        assert.equal(ok, true, 'loadGame deve riportare successo quando un salvataggio esiste');
        assert.equal(sandbox.gameState.cash, 88000, 'il cash deve essere ripristinato');
        assert.equal(sandbox.gameState.day, 12, 'il giorno deve essere ripristinato');
        assert.equal(sandbox.gameState.fleet.length, 1, 'la flotta deve essere ripristinata');
        assert.equal(sandbox.gameState.fleet[0].id, 'c_saved', 'il veicolo specifico deve essere quello salvato');
        assert.equal(sandbox.gameState.drivers.find(d => d.id === 'd_saved')?.status, 'idle',
            'un driver salvato come busy deve tornare idle al reload (nessuna corsa fantasma dopo un riavvio — vedi loadGame())');
    });

    test('loadGame() senza alcun salvataggio non modifica lo stato e ritorna false', () => {
        const { sandbox } = freshEnv();
        sandbox.window.currentSlotIndex = null;
        const cashBefore = sandbox.gameState.cash;

        const ok = sandbox.loadGame();

        assert.equal(ok, false, 'nessun salvataggio presente: deve tornare false');
        assert.equal(sandbox.gameState.cash, cashBefore, 'lo stato non deve cambiare se non c\'è nulla da caricare');
    });
});
