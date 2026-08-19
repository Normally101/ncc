'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

// Come in global-events-sync.test.js: global_events.js non è in CORE_FILES e va
// caricato esplicitamente in coda, come fa index.html.
function eventsEnv() {
    const env = createGameEnv([...CORE_FILES, 'global_events.js']);
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

const HOUR = 3600000;

function fakeGlobalEvent(effects) {
    return {
        id:         'winter_gala',
        name:       'Gala Invernale',
        icon:       '🎄',
        starts_at:  new Date(Date.now() - HOUR).toISOString(),
        ends_at:    new Date(Date.now() + 24 * HOUR).toISOString(),
        status:     'active',
        effects,
    };
}

// La generazione di un evento locale è probabilistica (Math.random() > 0.14 → esce
// quasi sempre a vuoto), quindi qui si verifica lo SLOT gameState.activeDynamicEvent,
// non l'evento effettivamente generato: è lo slot il punto di contatto fra i due sistemi.
describe('events/local-vs-global — un evento globale occupa lo slot degli eventi locali', () => {
    test('mentre lo specchio globale è attivo _maybeGenerateDynamicEvent non sostituisce l\'evento in corso', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [fakeGlobalEvent({ tipMult: 1.5 })];
        sandbox.syncGlobalEventToGameState();

        const globale = sandbox.gameState.activeDynamicEvent;
        assert.ok(globale, 'precondizione: lo specchio globale deve occupare lo slot');
        assert.equal(globale.id, 'global_winter_gala');

        // Molti tentativi: se la guardia "one active at a time" non ci fosse, con 200 giri
        // la probabilità di generare un evento locale sarebbe praticamente 1.
        for (let i = 0; i < 200; i++) sandbox._maybeGenerateDynamicEvent();

        assert.equal(sandbox.gameState.activeDynamicEvent, globale,
            'con un evento globale in corso nessun evento locale deve partire: lo slot resta quello globale (è voluto, non un bug)');
        assert.equal(sandbox.gameState.activeDynamicEvent.id, 'global_winter_gala',
            'lo slot deve contenere ancora lo specchio globale, non un evento locale sovrascritto');
    });

    test('REGRESSIONE: a evento globale finito lo slot torna libero per gli eventi locali', () => {
        // Lo specchio globale ha endsHour: Infinity, quindi _tickDynamicEvent non lo scade
        // mai: se la sync non lo azzera, la guardia di _maybeGenerateDynamicEvent blocca
        // gli eventi locali per sempre. Era esattamente il bug corretto.
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [fakeGlobalEvent({ tipMult: 1.5 })];
        sandbox.syncGlobalEventToGameState();
        assert.ok(sandbox.gameState.activeDynamicEvent, 'precondizione: lo slot è occupato dall\'evento globale');

        // Evento finito: il server non lo restituisce più.
        sandbox._globalEventsState.events = [];
        sandbox.syncGlobalEventToGameState();

        assert.equal(sandbox.gameState.activeDynamicEvent, null,
            'a evento globale finito lo slot deve essere libero, altrimenti nessun evento locale potrà mai più partire');
    });
});
