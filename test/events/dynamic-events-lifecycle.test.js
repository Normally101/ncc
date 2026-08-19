'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

// Il ciclo di vita di un evento dinamico LOCALE (engine-events.js), che è l'altra metà
// del BLOCCO 4 rispetto agli eventi globali: quelli nascono dal server e li specchia
// global_events.js, questi nascono in locale e devono scadere da soli.
describe('events/dynamic-events-lifecycle — un evento locale scade quando arriva la sua ora', () => {
    function localEvent(endsHour) {
        return { id: 'test_local', name: 'Evento di prova', icon: '🎪', endsHour, priceMult: 1.5, rideBias: 'any' };
    }

    test("prima della sua ora l'evento resta attivo", () => {
        const { sandbox } = freshEnv();
        const curHour = sandbox.gameState.day * 24 + sandbox.gameState.hour;
        sandbox.gameState.activeDynamicEvent = localEvent(curHour + 3);

        sandbox._tickDynamicEvent();

        assert.ok(sandbox.gameState.activeDynamicEvent, "un evento con ancora ore davanti non deve essere azzerato dal tick");
    });

    test("all'ora di fine viene azzerato e lo slot torna libero", () => {
        const { sandbox, logs } = freshEnv();
        const curHour = sandbox.gameState.day * 24 + sandbox.gameState.hour;
        sandbox.gameState.activeDynamicEvent = localEvent(curHour);

        sandbox._tickDynamicEvent();

        assert.equal(sandbox.gameState.activeDynamicEvent, null, "raggiunta endsHour l'evento deve sparire: finché occupa lo slot, _maybeGenerateDynamicEvent non ne fa partire altri");
        assert.ok(logs.some(l => l.includes('terminato')), "la fine dell'evento va annunciata al giocatore, altrimenti i moltiplicatori cambiano senza spiegazione");
    });

    test("REGRESSIONE: lo specchio di un evento globale (endsHour Infinity) il tick non lo scade mai — per quello serve la sync di global_events.js", () => {
        const { sandbox } = freshEnv();
        sandbox.gameState.activeDynamicEvent = { id: 'global_winter', name: 'Gala', icon: '🎄', endsHour: Infinity, tipMult: 1.5 };

        // Anche portando avanti il tempo di un anno di gioco.
        sandbox.gameState.day += 365;
        sandbox._tickDynamicEvent();

        assert.ok(
            sandbox.gameState.activeDynamicEvent,
            "questo è il comportamento voluto del tick: gli eventi globali li gestisce il server. È la ragione per cui window.syncGlobalEventToGameState() deve azzerarli quando finiscono (vedi global-events-sync.test.js)",
        );
    });
});
