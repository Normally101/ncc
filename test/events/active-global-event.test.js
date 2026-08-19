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

// startsIn/endsIn sono offset in ms rispetto a "adesso": negativi = passato.
function fakeGlobalEvent({ id = 'winter_gala', startsIn = -HOUR, endsIn = 24 * HOUR } = {}) {
    return {
        id,
        name:       'Gala Invernale',
        icon:       '🎄',
        starts_at:  new Date(Date.now() + startsIn).toISOString(),
        ends_at:    new Date(Date.now() + endsIn).toISOString(),
        status:     'active',
        effects:    { tipMult: 1.5 },
    };
}

describe('events/active-global-event — quale evento globale è in corso adesso', () => {
    test('senza eventi dal server restituisce null', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [];

        assert.equal(sandbox.getActiveGlobalEvent(), null, 'con la lista vuota non c\'è nessun evento da rispecchiare: deve tornare null, non undefined');
    });

    test('un evento già iniziato e non ancora finito viene restituito', () => {
        const { sandbox } = eventsEnv();
        const inCorso = fakeGlobalEvent();
        sandbox._globalEventsState.events = [inCorso];

        assert.equal(sandbox.getActiveGlobalEvent(), inCorso, 'l\'evento nella finestra starts_at..ends_at è quello attivo: se non lo restituisce, i moltiplicatori non vengono mai applicati');
    });

    test('un evento con ends_at nel passato è scaduto e non viene restituito', () => {
        const { sandbox } = eventsEnv();
        // Iniziato 48h fa e finito 24h fa: il server può ancora elencarlo, ma non è più attivo.
        sandbox._globalEventsState.events = [fakeGlobalEvent({ startsIn: -48 * HOUR, endsIn: -24 * HOUR })];

        assert.equal(sandbox.getActiveGlobalEvent(), null, 'un evento finito non deve più risultare attivo, altrimenti i bonus resterebbero applicati oltre la scadenza');
    });

    test('un evento che deve ancora iniziare non viene restituito', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [fakeGlobalEvent({ startsIn: 2 * HOUR, endsIn: 26 * HOUR })];

        assert.equal(sandbox.getActiveGlobalEvent(), null, 'un evento programmato per il futuro non deve dare bonus in anticipo');
    });
});
