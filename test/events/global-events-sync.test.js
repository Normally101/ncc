'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

// global_events.js non è in CORE_FILES (è un modulo di espansione, non logica core):
// va caricato esplicitamente in coda alla lista, come fa index.html.
function eventsEnv() {
    const env = createGameEnv([...CORE_FILES, 'global_events.js']);
    env.sandbox.initGame(true);
    env.stopAllIntervals();
    return env;
}

const HOUR = 3600000;

function fakeGlobalEvent(effects, { startedAgo = HOUR, endsIn = 24 * HOUR } = {}) {
    return {
        id:         'winter_gala',
        name:       'Gala Invernale',
        icon:       '🎄',
        starts_at:  new Date(Date.now() - startedAgo).toISOString(),
        ends_at:    new Date(Date.now() + endsIn).toISOString(),
        status:     'active',
        effects,
    };
}

describe('events/global-events-sync — lo specchio locale dell\'evento globale', () => {
    test('con un evento globale attivo popola gameState.activeDynamicEvent con i moltiplicatori dell\'evento', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [fakeGlobalEvent({ tipMult: 1.5, xpMult: 2.0, extraRidePct: 0.25, forceAirport: true })];

        sandbox.syncGlobalEventToGameState();

        const ev = sandbox.gameState.activeDynamicEvent;
        assert.ok(ev, 'con un evento globale attivo lo specchio locale deve essere popolato, altrimenti l\'engine non applica nessun effetto');
        assert.equal(ev.id, 'global_winter_gala', 'l\'id deve avere il prefisso global_ — è ciò che distingue lo specchio da un evento locale');
        assert.equal(ev.tipMult, 1.5);
        assert.equal(ev.xpMult, 2.0);
        assert.equal(ev.extraRidePct, 0.25);
        assert.equal(ev.forceAirport, true);
        assert.equal(ev.fuelMult, 1.0, 'gli effetti non specificati devono avere il neutro, non undefined');
    });

    test('REGRESSIONE: quando l\'evento globale finisce lo specchio torna a null (prima restava attivo per sempre)', () => {
        // Lo specchio ha endsHour: Infinity, quindi _tickDynamicEvent (engine-events.js) non
        // lo scade mai: se non lo azzera la sync, i moltiplicatori restano per sempre e
        // _maybeStartDynamicEvent non fa più partire nessun evento locale.
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [fakeGlobalEvent({ tipMult: 1.5 })];
        sandbox.syncGlobalEventToGameState();
        assert.ok(sandbox.gameState.activeDynamicEvent, 'precondizione: l\'evento deve essere attivo prima di scadere');

        // L'evento è finito: ends_at nel passato e la lista server torna vuota.
        sandbox._globalEventsState.events = [];
        sandbox.syncGlobalEventToGameState();

        assert.equal(sandbox.gameState.activeDynamicEvent, null, 'a evento globale finito lo specchio locale deve essere azzerato');
    });

    test('la sync avviene anche senza #hub-event-banner nel DOM (lo stato non dipende dal rendering)', () => {
        const { sandbox } = eventsEnv();
        assert.equal(sandbox.document.getElementById('hub-event-banner'), null, 'precondizione: il banner non esiste in questo ambiente headless');

        sandbox._globalEventsState.events = [fakeGlobalEvent({ tipMult: 1.5 })];
        sandbox._applyGlobalEventBanner();
        assert.ok(sandbox.gameState.activeDynamicEvent, 'senza banner nel DOM lo specchio deve comunque essere popolato');

        sandbox._globalEventsState.events = [];
        sandbox._applyGlobalEventBanner();
        assert.equal(sandbox.gameState.activeDynamicEvent, null, 'senza banner nel DOM lo specchio deve comunque essere azzerato');
    });

    test('un evento LOCALE (id senza prefisso global_) non viene cancellato dalla sync', () => {
        const { sandbox } = eventsEnv();
        const local = { id: 'rush_hour', name: 'Ora di punta', icon: '🚦', endsHour: 999, tipMult: 1.3 };
        sandbox.gameState.activeDynamicEvent = local;
        sandbox._globalEventsState.events = [];

        sandbox.syncGlobalEventToGameState();

        assert.deepEqual(sandbox.gameState.activeDynamicEvent, local, 'gli eventi locali hanno il loro timer (_tickDynamicEvent): la sync globale non deve toccarli');
    });

    test('se cambia l\'evento globale attivo lo specchio rispecchia quello nuovo', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [fakeGlobalEvent({ tipMult: 1.5 })];
        sandbox.syncGlobalEventToGameState();

        const secondo = fakeGlobalEvent({ tipMult: 3.0 });
        secondo.id = 'summer_rush';
        secondo.name = 'Corsa d\'Estate';
        sandbox._globalEventsState.events = [secondo];
        sandbox.syncGlobalEventToGameState();

        assert.equal(sandbox.gameState.activeDynamicEvent.id, 'global_summer_rush');
        assert.equal(sandbox.gameState.activeDynamicEvent.tipMult, 3.0);
    });
});
