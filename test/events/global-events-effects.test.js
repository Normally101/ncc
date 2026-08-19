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

// Un evento come lo restituisce rpc_get_active_global_events. `status` è deliberatamente
// un parametro: il filtro di getGlobalEventEffects è un OR fra "status === 'active'" e la
// finestra temporale, quindi status e date vanno potuti muovere in modo indipendente.
function fakeGlobalEvent(id, effects, { startedAgo = HOUR, endsIn = 24 * HOUR, status = 'active' } = {}) {
    return {
        id,
        name:      id,
        icon:      '🎪',
        starts_at: new Date(Date.now() - startedAgo).toISOString(),
        ends_at:   new Date(Date.now() + endsIn).toISOString(),
        status,
        effects,
    };
}

describe('events/global-events-effects — la fusione degli effetti degli eventi globali attivi', () => {
    test('senza nessun evento attivo restituisce un oggetto vuoto', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [];

        // Object.keys e non deepEqual: l'oggetto nasce dentro la VM del sandbox, quindi ha
        // un Object.prototype diverso da quello di questo file e il confronto strict fallirebbe.
        assert.deepEqual(Object.keys(sandbox.getGlobalEventEffects()), [],
            'senza eventi attivi la fusione deve essere vuota: un solo effetto spurio qui verrebbe applicato a tutta l\'economia');
    });

    test('due eventi attivi con lo stesso moltiplicatore lo MOLTIPLICANO fra loro (1.5 × 2.0 = 3.0, non 3.5)', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [
            fakeGlobalEvent('gala', { tipMult: 1.5 }),
            fakeGlobalEvent('weekend', { tipMult: 2.0 }),
        ];

        const fx = sandbox.getGlobalEventEffects();

        assert.equal(fx.tipMult, 3.0,
            'le chiavi *Mult si compongono per prodotto partendo da 1.0: con la somma due eventi da 1.5 darebbero 3.0 invece di 2.25 e l\'economia sarebbe sbilanciata');
    });

    test('una chiave *Pct segue la stessa regola moltiplicativa delle *Mult', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [
            fakeGlobalEvent('gala', { extraRidePct: 0.5 }),
            fakeGlobalEvent('weekend', { extraRidePct: 0.4 }),
        ];

        assert.equal(sandbox.getGlobalEventEffects().extraRidePct, 0.2,
            'il suffisso Pct sceglie il ramo moltiplicativo esattamente come Mult: è il suffisso, non il significato della chiave, a decidere');
    });

    test('una chiave numerica che non finisce per Mult/Pct prende il MASSIMO fra gli eventi, non la somma', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [
            fakeGlobalEvent('gala', { bonusRides: 2 }),
            fakeGlobalEvent('weekend', { bonusRides: 5 }),
        ];

        assert.equal(sandbox.getGlobalEventEffects().bonusRides, 5,
            'le chiavi additive non si accumulano fra eventi sovrapposti: due eventi contemporanei non devono valere più della somma dei loro effetti singoli');
    });

    test('un valore non numerico viene sovrascritto: vince l\'ultimo evento della lista', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [
            fakeGlobalEvent('gala', { forceAirport: true }),
            fakeGlobalEvent('weekend', { forceAirport: false }),
        ];

        assert.equal(sandbox.getGlobalEventEffects().forceAirport, false,
            'i flag booleani non hanno una regola di fusione: l\'ultimo evento sovrascrive, quindi l\'ordine della lista server è significativo');
    });

    test('un evento già finito (ends_at nel passato) non contribuisce agli effetti', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [
            // Finito un'ora fa: perché sia davvero escluso serve anche status !== 'active',
            // dato che il filtro è un OR — uno status stantìo lato server terrebbe l'evento
            // vivo a prescindere dalle date.
            fakeGlobalEvent('vecchio', { tipMult: 5.0, bonusRides: 99 }, { startedAgo: 25 * HOUR, endsIn: -HOUR, status: 'ended' }),
            fakeGlobalEvent('gala', { tipMult: 1.5 }),
        ];

        const fx = sandbox.getGlobalEventEffects();

        assert.equal(fx.tipMult, 1.5, 'solo l\'evento in corso deve contare: l\'evento scaduto continuerebbe a moltiplicare le mance per sempre');
        assert.equal(fx.bonusRides, undefined, 'una chiave presente solo nell\'evento scaduto non deve comparire affatto nella fusione');
    });

    test('un evento non ancora iniziato (starts_at nel futuro) non contribuisce agli effetti', () => {
        const { sandbox } = eventsEnv();
        sandbox._globalEventsState.events = [
            // Lo stesso RPC restituisce anche gli upcoming, che il banner usa per il countdown.
            fakeGlobalEvent('futuro', { tipMult: 3.0 }, { startedAgo: -HOUR, endsIn: 24 * HOUR, status: 'upcoming' }),
            fakeGlobalEvent('gala', { tipMult: 1.5 }),
        ];

        assert.equal(sandbox.getGlobalEventEffects().tipMult, 1.5,
            'gli eventi in arrivo stanno nella stessa lista di quelli attivi: se contassero, i loro bonus partirebbero in anticipo');
    });
});
